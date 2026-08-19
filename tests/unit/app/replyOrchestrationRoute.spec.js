import { describe, expect, it } from 'vitest'
import {
  buildReplyOrchestrationRouteMessages,
  compareReplySituationDependencySnapshots,
  parseReplyOrchestrationRouteDecision,
  renderReplyOrchestrationRecentTail,
  resolveHardReplyOrchestrationRoute
} from '../../../src/app/replyOrchestrationRoute.ts'
import { MODEL_TASK_TIERS } from '../../../src/utils/modelTaskTiers.ts'

const checkpoint = { code: 'quiet_chat', label: '闲聊', summary: '两人在客厅继续聊天' }
const v2Checkpoint = {
  ...checkpoint,
  anchor: { messageId: '101', sourceArtifactId: 'artifact_1', stateVersion: 3 },
  dependencySnapshot: {
    fingerprint: 'scene-v7',
    values: {
      curtain: 7,
      presence: 'presence-v4',
      statusPanels: 'status-v2',
      narrativeSeeds: 'seeds-v1',
      chatProjection: 101,
      personality: 'persona-v3',
      promptPreset: 'prompt-v5'
    }
  }
}

describe('replyOrchestrationRoute', () => {
  it('runs the continuity judge on the fast model slot', () => {
    expect(MODEL_TASK_TIERS.replyRouteJudge).toBe('fast')
  })

  it('没有旧检查点或出现附件、私密指令与点名时不调用轻判，直接完整统筹', () => {
    expect(resolveHardReplyOrchestrationRoute({ currentUserInput: '继续', previousScenario: null })?.route).toBe('orchestrate')
    expect(resolveHardReplyOrchestrationRoute({ currentUserInput: '看看这个', previousScenario: checkpoint, hasAttachments: true })?.route).toBe('orchestrate')
    expect(resolveHardReplyOrchestrationRoute({ currentUserInput: '继续', previousScenario: checkpoint, hasPrivateDirectorDirectives: true })?.route).toBe('orchestrate')
    expect(resolveHardReplyOrchestrationRoute({ currentUserInput: '你来答', previousScenario: checkpoint, forcedCharacterIds: ['c1'] })?.route).toBe('orchestrate')
    expect(resolveHardReplyOrchestrationRoute({ currentUserInput: '嗯，我知道了', previousScenario: checkpoint })).toBeNull()
  })

  it('纯比较依赖快照并区分 unchanged、changed 与 unknown', () => {
    const unchanged = compareReplySituationDependencySnapshots(
      v2Checkpoint.dependencySnapshot,
      { fingerprint: 'scene-v7', values: { ...v2Checkpoint.dependencySnapshot.values } }
    )
    expect(unchanged).toMatchObject({
      status: 'unchanged',
      changedKeys: [],
      previousFingerprint: 'scene-v7',
      currentFingerprint: 'scene-v7'
    })

    const changed = compareReplySituationDependencySnapshots(
      v2Checkpoint.dependencySnapshot,
      {
        fingerprint: 'scene-v8',
        values: { ...v2Checkpoint.dependencySnapshot.values, presence: 'presence-v5' }
      }
    )
    expect(changed).toMatchObject({ status: 'changed', changedKeys: ['presence'] })
    expect(changed.reason).toContain('presence')

    expect(compareReplySituationDependencySnapshots(
      v2Checkpoint.dependencySnapshot,
      { values: { curtain: 7 } }
    )).toMatchObject({ status: 'unknown' })
    expect(compareReplySituationDependencySnapshots(
      { fingerprint: 'scene-v7', values: { curtain: 7 } },
      { values: { curtain: 7 } }
    )).toMatchObject({ status: 'unknown', unknownKeys: ['$fingerprint'] })
    expect(compareReplySituationDependencySnapshots(undefined, undefined)).toMatchObject({ status: 'unknown' })
  })

  it('依赖确定变化时无模型直达完整统筹，未变或旧检查点仍允许轻判用户语义', () => {
    const changed = resolveHardReplyOrchestrationRoute({
      currentUserInput: '嗯，接着说',
      previousScenario: v2Checkpoint,
      currentDependencySnapshot: {
        fingerprint: 'scene-v8',
        values: { ...v2Checkpoint.dependencySnapshot.values, curtain: 8 }
      }
    })
    expect(changed).toMatchObject({
      route: 'orchestrate',
      dependencyComparison: { status: 'changed', changedKeys: ['curtain'] }
    })
    expect(changed.reason).toContain('情境依赖发生变化')

    expect(resolveHardReplyOrchestrationRoute({
      currentUserInput: '嗯，接着说',
      previousScenario: v2Checkpoint,
      currentDependencySnapshot: {
        fingerprint: 'scene-v7',
        values: { ...v2Checkpoint.dependencySnapshot.values }
      }
    })).toBeNull()
    expect(resolveHardReplyOrchestrationRoute({
      currentUserInput: '嗯，接着说',
      previousScenario: checkpoint,
      currentDependencySnapshot: { values: { curtain: 7 } }
    })).toBeNull()
  })

  it('把稳定规则放 system，只给 user 追加检查点、最近尾部与当前输入', () => {
    const messages = buildReplyOrchestrationRouteMessages({
      previousScenario: checkpoint,
      currentUserInput: '嗯，那你接着说',
      establishedContext: '两人今晚一直在客厅谈论旧照片。',
      recentTail: '星依：刚才说到窗外下雨。',
      sceneContext: '现在 深夜 · 客厅 · 小雨'
    })
    expect(messages[0].content).toContain('只判断当前用户消息')
    expect(messages[0].content).not.toContain('quiet_chat')
    expect(messages[1].content).toContain('code: quiet_chat')
    expect(messages[1].content).toContain('已折叠的长期背景')
    expect(messages[1].content).toContain('嗯，那你接着说')
  })

  it('不改 system 规则，只在 user 消息追加 v2 锚和结构化依赖核对块', () => {
    const messages = buildReplyOrchestrationRouteMessages({
      previousScenario: v2Checkpoint,
      currentDependencySnapshot: {
        fingerprint: 'scene-v7',
        values: { ...v2Checkpoint.dependencySnapshot.values }
      },
      currentUserInput: '继续'
    })
    expect(messages[0].content).not.toContain('scene-v7')
    expect(messages[1].content).toContain('anchorMessageId: 101')
    expect(messages[1].content).toContain('sourceArtifactId: artifact_1')
    expect(messages[1].content).toContain('【情境依赖核对（结构化数据）】')
    expect(messages[1].content).toContain('"status":"unchanged"')
  })

  it('只在高置信且 code 未漂移时复用，否则保守完整统筹', () => {
    const dependencyComparison = compareReplySituationDependencySnapshots(
      v2Checkpoint.dependencySnapshot,
      { fingerprint: 'scene-v7', values: { ...v2Checkpoint.dependencySnapshot.values } }
    )
    expect(parseReplyOrchestrationRouteDecision(
      '{"route":"reuse","reason":"仍是同一段闲聊","confidence":0.93,"scenarioCode":"quiet_chat"}',
      v2Checkpoint,
      dependencyComparison
    )).toMatchObject({
      route: 'reuse',
      reusedScenario: { code: 'quiet_chat', anchor: { messageId: '101' } },
      dependencyComparison: { status: 'unchanged', reason: '情境依赖总指纹未变化' }
    })
    expect(parseReplyOrchestrationRouteDecision(
      '{"route":"reuse","reason":"可能没变","confidence":0.55,"scenarioCode":"quiet_chat"}',
      checkpoint
    ).route).toBe('orchestrate')
    expect(parseReplyOrchestrationRouteDecision(
      '{"route":"reuse","reason":"换地方了","confidence":0.95,"scenarioCode":"travel"}',
      checkpoint
    ).route).toBe('orchestrate')
    expect(parseReplyOrchestrationRouteDecision(
      '{"route":"reuse","reason":"遗漏检查点","confidence":0.95,"scenarioCode":""}',
      checkpoint
    ).route).toBe('orchestrate')
    expect(parseReplyOrchestrationRouteDecision('不是 JSON', checkpoint).route).toBe('orchestrate')
  })

  it('解析器收到 changed 审计时不信任模型的 reuse 结果', () => {
    const changedComparison = compareReplySituationDependencySnapshots(
      v2Checkpoint.dependencySnapshot,
      {
        fingerprint: 'scene-v8',
        values: { ...v2Checkpoint.dependencySnapshot.values, statusPanels: 'status-v3' }
      }
    )
    expect(parseReplyOrchestrationRouteDecision(
      '{"route":"reuse","reason":"模型误判未变","confidence":0.99,"scenarioCode":"quiet_chat"}',
      v2Checkpoint,
      changedComparison
    )).toMatchObject({
      route: 'orchestrate',
      dependencyComparison: { status: 'changed', changedKeys: ['statusPanels'] }
    })
  })

  it('最近尾部排除隐藏审计并限制单条长度', () => {
    const tail = renderReplyOrchestrationRecentTail([
      { role: 'assistant', memberName: '审计', content: '不应出现', messageKind: 'narration_debug' },
      { role: 'user', content: 'a'.repeat(400) },
      { role: 'assistant', memberName: '星依', content: '接着说吧' }
    ], 6, 80)
    expect(tail).not.toContain('不应出现')
    expect(tail).toContain(`用户：${'a'.repeat(80)}`)
    expect(tail).toContain('星依：接着说吧')
  })
})
