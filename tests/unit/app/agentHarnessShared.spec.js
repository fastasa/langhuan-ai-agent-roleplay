import { describe, expect, it, vi } from 'vitest'
import { runWorkspaceAgentRuntime } from '../../../src/app/agentHarnessShared.ts'
import { createAgentTurnStreamController } from '../../../src/app/agentTurnStream.ts'

// runWorkspaceAgentRuntime：编剧/舆图师共用驱动尾块收编测试（地图与剧本工作区专业Agent计划批B）。
// 两个 harness 的 spec 已充分覆盖工具路由细节；这里只验证收编本身的等价点：
// agentName/默认无固定预算/nudge文案动词片段插值/回执提取。
describe('runWorkspaceAgentRuntime（编剧/舆图师共用驱动尾块）', () => {
  it('零写只读问答：不调用任何工具时直接返回模型正文与terminalReason=done', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '这是最终回复。', toolCalls: [] }))

    const result = await runWorkspaceAgentRuntime({
      profileId: 'scriptwriter.workspace',
      agentName: '测试agent',
      gateId: 'test-gate',
      nudgeActionHint: '核对/确认',
      messages: [{ role: 'user', content: '你好' }],
      tools: [],
      callOrchestrator
    })

    expect(result.reply).toBe('这是最终回复。')
    expect(result.terminalReason).toBe('done')
    expect(callOrchestrator).toHaveBeenCalledTimes(1)
  })

  it('传入共享信息流后，模型调用前即时出现“模型思考”并在返回后落定', async () => {
    const turnStream = createAgentTurnStreamController()
    turnStream.begin()
    let snapshotDuringCall = []

    await runWorkspaceAgentRuntime({
      profileId: 'scriptwriter.workspace',
      agentName: '测试agent',
      gateId: 'test-stream-gate',
      nudgeActionHint: '核对',
      messages: [{ role: 'user', content: '你好' }],
      tools: [],
      turnStream,
      callOrchestrator: async () => {
        snapshotDuringCall = turnStream.state.entries.map((item) => ({ label: item.label, status: item.status }))
        return { content: '完成。', toolCalls: [] }
      }
    })

    expect(snapshotDuringCall).toEqual([
      { label: '第 1 轮', status: undefined },
      { label: '模型思考', status: undefined }
    ])
    expect(turnStream.state.entries.find((item) => item.label === '模型思考')?.status).toBe('success')
  })

  it('续轮护栏：nudge 文案按 nudgeActionHint 插值动词片段，续轮一次后正常收束', async () => {
    let call = 0
    const callOrchestrator = vi.fn(async ({ messages }) => {
      call += 1
      if (call === 1) return { content: '稍等，我先核对一下。', toolCalls: [] }
      // 第二次调用时，上一轮的 nudge 文案应已作为消息注入，携带自定义动词片段。
      const nudgeMessage = messages.find((message) => typeof message.content === 'string' && message.content.includes('你这一步只说了话'))
      expect(nudgeMessage?.content).toContain('你刚说要去画个圆')
      return { content: '核对完了。', toolCalls: [] }
    })

    const result = await runWorkspaceAgentRuntime({
      profileId: 'scriptwriter.workspace',
      agentName: '测试agent',
      gateId: 'test-gate',
      nudgeActionHint: '画个圆',
      messages: [{ role: 'user', content: '你好' }],
      tools: [],
      callOrchestrator
    })

    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(result.reply).toBe('核对完了。')
  })

  it('budget 未传时不设置固定回合或工具调用上限（透传 signal/onProgress 不报错）', async () => {
    const onProgress = vi.fn()
    const controller = new AbortController()
    const callOrchestrator = vi.fn(async () => ({ content: '完成。', toolCalls: [] }))

    const result = await runWorkspaceAgentRuntime({
      profileId: 'scriptwriter.workspace',
      agentName: '测试agent',
      gateId: 'test-gate',
      nudgeActionHint: '核对/确认',
      messages: [{ role: 'user', content: '你好' }],
      tools: [],
      callOrchestrator,
      signal: controller.signal,
      onProgress
    })

    expect(result.reply).toBe('完成。')
    expect(result.transcript.budget.maxTurns).toBeNull()
    expect(result.transcript.budget.maxToolCalls).toBeNull()
  })

  it('预算耗尽但 TODO 未清零时返回明确未完成通知，不复用模型的伪完成话术', async () => {
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{
          callId: 'todo-write',
          toolName: 'writeTaskTodo',
          args: { todos: [{ text: '完成复诊', acceptance: '复诊无遗漏' }] }
        }]
      })
      .mockResolvedValueOnce({
        content: '都已经完成了。',
        toolCalls: []
      })

    const result = await runWorkspaceAgentRuntime({
      profileId: 'scriptwriter.workspace',
      agentName: '测试agent',
      gateId: 'test-budget-todo-gate',
      nudgeActionHint: '复诊',
      messages: [{ role: 'user', content: '处理后复诊' }],
      tools: [],
      budget: { maxTurns: 2, maxToolCalls: 1 },
      callOrchestrator
    })

    expect(result.terminalReason).toBe('budget-exceeded')
    expect(result.reply).toContain('待办仍有 1 项未完成')
    expect(result.reply).toContain('没有把任务标记为完成')
    expect(result.reply).not.toBe('都已经完成了。')
  })

  it('延迟发现：首轮只下发真实 registry 中的 common schema，低频大工具只进 catalog', async () => {
    const firstRequest = {}
    const trace = [{
      profileId: 'xingyi.global', skillId: 'xingyi.knowledge-topics', source: 'fixture://topic',
      layer: '4', loadState: 'loaded', chars: 2, hash: 'fnv1a32:test', reason: 'test'
    }]
    const commonTool = {
      name: 'listXingyiKnowledgeTopics', brief: '列目录',
      schema: { type: 'object', properties: {} }, execute: () => ({ content: 'ok' })
    }
    const largeTool = {
      name: 'renderHugeWorkspaceArtifact', brief: '低频大工具',
      schema: { type: 'object', properties: { payload: { type: 'string' } } },
      execute: () => ({ content: 'ok' })
    }

    const result = await runWorkspaceAgentRuntime({
      profileId: 'xingyi.global',
      agentName: '测试agent',
      gateId: 'test-gate',
      nudgeActionHint: '核对',
      messages: [{ role: 'user', content: '你好' }],
      tools: [commonTool, largeTool],
      promptSupplyTrace: trace,
      callOrchestrator: async (request) => {
        Object.assign(firstRequest, request)
        return { content: '完成。', toolCalls: [] }
      }
    })

    expect(firstRequest.toolBriefs.map((tool) => tool.name)).toEqual([
      'listXingyiKnowledgeTopics',
      'writeTaskTodo',
      'updateTaskTodo',
      'toolsearch'
    ])
    expect(firstRequest.toolCatalog).toEqual(expect.arrayContaining([
      { name: 'renderHugeWorkspaceArtifact', brief: '低频大工具', recommended: false }
    ]))
    expect(result.transcript.promptSupplyTrace).toEqual(trace)
    expect(result.transcript.toolSupplyDiagnostics.map((item) => item.toolName)).toEqual([
      'searchXingyiKnowledge',
      'readXingyiKnowledgeTopic',
      'readDocLibraryEditingSkill',
      'readRelationHintSkill',
      'askUser',
      'searchWeb',
      'generateImage',
      'generateImagesBatch'
    ])
  })

  it('非延迟 profile 保持实际已注册工具全量首轮可用', async () => {
    let firstBriefNames = []
    await runWorkspaceAgentRuntime({
      profileId: 'scriptwriter.workspace',
      agentName: '测试agent',
      gateId: 'test-gate',
      nudgeActionHint: '核对',
      messages: [{ role: 'user', content: '你好' }],
      tools: [{
        name: 'smallCustomTool', brief: '小工具',
        schema: { type: 'object', properties: {} }, execute: () => ({ content: 'ok' })
      }],
      callOrchestrator: async ({ toolBriefs }) => {
        firstBriefNames = toolBriefs.map((tool) => tool.name)
        return { content: '完成。', toolCalls: [] }
      }
    })
    expect(firstBriefNames).toEqual(['smallCustomTool', 'writeTaskTodo', 'updateTaskTodo'])
  })
})
