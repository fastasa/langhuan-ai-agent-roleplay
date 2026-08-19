import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/composables/app/useChatSendPipeline.ts'),
  'utf8'
)

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('reply situation checkpoint lifecycle wiring', () => {
  it('导演阶段不再提前保存检查点', () => {
    const director = between(
      'async function decideRoundDirector(',
      'async function runGroupChat('
    )
    expect(director).not.toContain('saveSessionLastScenario(')
    expect(director).not.toContain('finalizeReplySituationCheckpoint(')
  })

  it('轮末先等待助手投影，再重读依赖快照并保存', () => {
    const finalize = between(
      'async function finalizeReplySituationCheckpoint(',
      'function resetActivePipelineState('
    )
    const waitIndex = finalize.indexOf('await waitForReplySituationAssistantProjections(lifecycle)')
    const refetchIndex = finalize.indexOf('await fetchOrchestrationWorkspaceProjection(lifecycle.sessionId)')
    const saveIndex = finalize.indexOf('await saveSessionLastScenario(')
    expect(waitIndex).toBeGreaterThanOrEqual(0)
    expect(refetchIndex).toBeGreaterThan(waitIndex)
    expect(saveIndex).toBeGreaterThan(refetchIndex)
  })

  it('完整群聊在事实提交完成后才提交检查点', () => {
    const group = between(
      'async function runGroupChat(',
      'async function runGroupChatReplay('
    )
    const factsIndex = group.indexOf('await factCommit')
    const checkpointIndex = group.indexOf('await finalizeReplySituationCheckpoint({ runId })')
    const directorIndex = group.indexOf('return await decideRoundDirector({')
    const invalidateIndex = group.indexOf('await ensureReplySituationCheckpointInvalidated()', directorIndex)
    const actorIndex = group.indexOf('await executeMixedGroupChat({')
    expect(directorIndex).toBeGreaterThanOrEqual(0)
    expect(invalidateIndex).toBeGreaterThan(directorIndex)
    expect(actorIndex).toBeGreaterThan(invalidateIndex)
    expect(factsIndex).toBeGreaterThanOrEqual(0)
    expect(checkpointIndex).toBeGreaterThan(factsIndex)
  })

  it('新消息落库后开启生命周期，reuse 在正文前失效且与完整单聊都走轮末提交', () => {
    const send = between(
      'async function sendText(',
      '// O-B2·重生成接续基线'
    )
    const inputPersistedIndex = send.indexOf('markActiveTurnInputMessage(activePipelineInputMessageId)')
    const lifecycleIndex = send.indexOf('const checkpointLifecycle = startReplySituationCheckpointLifecycle({')
    const reuseInvalidateIndex = send.indexOf('if (fastReplyInput) await ensureReplySituationCheckpointInvalidated(checkpointLifecycle)')
    const projectionIndex = send.indexOf('userProjectionPromise = runReplyContextProjectionForMessage({')
    expect(lifecycleIndex).toBeGreaterThan(inputPersistedIndex)
    expect(reuseInvalidateIndex).toBeGreaterThan(lifecycleIndex)
    expect(projectionIndex).toBeGreaterThan(reuseInvalidateIndex)
    expect(send.match(/await finalizeReplySituationCheckpoint\(/g)?.length || 0).toBeGreaterThanOrEqual(2)
  })

  it('人格最终模型失败消息不能被当成成功正文提交检查点', () => {
    const finalModelCall = between(
      'returnedText = await callFinalRoleModel()',
      'const normalizedReply = normalizeAiOutputText(returnedText || fullReply)'
    )
    expect(finalModelCall).toMatch(/catch \(error\)[\s\S]*markReplySituationCheckpointFailure\(error\)/)
  })
})
