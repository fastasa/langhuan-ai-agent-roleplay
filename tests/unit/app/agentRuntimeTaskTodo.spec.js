import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

function makeBusinessRegistry(executed) {
  return new ToolRegistry([
    {
      name: 'readSource',
      brief: '读取一份资料',
      execute: (toolCall) => {
        executed.push(`read:${toolCall.args.name}`)
        return { content: `已读取 ${toolCall.args.name}` }
      }
    },
    {
      name: 'writeTarget',
      brief: '写入目标资料',
      execute: () => {
        executed.push('write')
        return { content: '已写入目标资料' }
      }
    }
  ])
}

describe('Agent runtime task TODO gate', () => {
  it('复杂任务未先建表时挡回业务动作；建表后可同轮批量执行并在清零后结束', async () => {
    const executed = []
    const snapshots = []
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [
          { callId: 'read-a-early', toolName: 'readSource', args: { name: 'A' } },
          { callId: 'read-b-early', toolName: 'readSource', args: { name: 'B' } }
        ]
      })
      .mockResolvedValueOnce({
        toolCalls: [
          {
            callId: 'todo-write',
            toolName: 'writeTaskTodo',
            args: {
              todos: [
                { text: '核对两份源资料', acceptance: 'A、B 两份资料均已读取' },
                { text: '写入目标资料', acceptance: '目标资料已写入' }
              ]
            }
          },
          { callId: 'read-a', toolName: 'readSource', args: { name: 'A' } },
          { callId: 'read-b', toolName: 'readSource', args: { name: 'B' } }
        ]
      })
      .mockResolvedValueOnce({
        content: '两份资料已核对，接着写入。',
        toolCalls: [
          { callId: 'todo-read-done', toolName: 'updateTaskTodo', args: { updates: [{ id: 'todo-1', status: 'completed' }] } },
          { callId: 'write-target', toolName: 'writeTarget', args: {} }
        ]
      })
      .mockResolvedValueOnce({
        toolCalls: [
          { callId: 'todo-all-done', toolName: 'updateTaskTodo', args: { updates: [{ id: 'todo-2', status: 'completed' }] } }
        ]
      })
      .mockResolvedValueOnce({ content: '两份资料已经核对并写入目标。', toolCalls: [], done: true })

    const result = await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '读取 A、B 两份资料后写入目标' }],
      toolRegistry: makeBusinessRegistry(executed),
      initialActiveTools: ['readSource', 'writeTarget'],
      budget: { maxTurns: 8, maxToolCalls: 12 },
      callModel,
      onTaskTodoChange: (snapshot) => snapshots.push(snapshot)
    })

    expect(executed).toEqual(['read:A', 'read:B', 'write'])
    expect(result.transcript.turns[0].toolResults[0]).toMatchObject({
      status: 'blocked',
      error: { type: 'EXPECTATION_MISMATCH' }
    })
    expect(result.transcript.turns[0].toolResults).toHaveLength(1)
    expect(result.taskTodo.state).toBe('completed')
    expect(result.taskTodo.items.every((item) => item.status === 'completed')).toBe(true)
    expect(snapshots.map((snapshot) => snapshot.changeKind)).toEqual([
      'reset',
      'created',
      'updated',
      'completed'
    ])
    expect(callModel.mock.calls[0][0].toolBriefs.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'writeTaskTodo',
      'updateTaskTodo'
    ]))
    expect(callModel.mock.calls[0][0].messages.at(-1).content).toContain('【6·当前任务 TODO】')
    expect(callModel).toHaveBeenCalledTimes(5)
  })

  it('已经建表后，第一次带未完成项收尾会提醒一次，模型仍可继续完成', async () => {
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [{
          callId: 'todo-write',
          toolName: 'writeTaskTodo',
          args: { todos: [{ text: '完成核对', acceptance: '核对结果已确认' }] }
        }]
      })
      .mockResolvedValueOnce({ content: '我先到这里。', toolCalls: [], done: true })
      .mockResolvedValueOnce({
        toolCalls: [{
          callId: 'todo-done',
          toolName: 'updateTaskTodo',
          args: { updates: [{ id: 'todo-1', status: 'completed' }] }
        }]
      })
      .mockResolvedValueOnce({ content: '核对完成。', toolCalls: [], done: true })

    const result = await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '完成核对' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 6, maxToolCalls: 4 },
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(4)
    expect(result.transcript.turns[1].nextTurnPatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceHookId: 'agent-task-todo-exit-reminder' })
    ]))
    const completionGatePrompt = callModel.mock.calls[2][0].messages
      .map((message) => String(message.content || ''))
      .join('\n')
    expect(completionGatePrompt).toContain('请再核对一次')
    expect(completionGatePrompt).toContain('下一轮如实说明原因后停止')
    expect(completionGatePrompt).toContain('自动放行只覆盖普通写入审查')
    expect(result.taskTodo.state).toBe('completed')
    expect(result.transcript.terminalReason).toBe('done')
  })

  it('未配置固定预算时也只提醒一次；模型再次确认无法继续后允许保留 TODO 退出', async () => {
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [{
          callId: 'todo-write',
          toolName: 'writeTaskTodo',
          args: { todos: [{ text: '完成长任务', acceptance: '全部工作已经完成并复核' }] }
        }]
      })
      .mockResolvedValueOnce({ content: '现有工具缺少必要能力，我需要停止。', toolCalls: [], done: true })
      .mockResolvedValueOnce({ content: '复核后仍确认没有安全可用的执行入口；保留这项待办，当前停止。', toolCalls: [], done: true })

    const result = await runAgentRuntime({
      agentName: 'UnboundedTodoAgent',
      messages: [{ role: 'user', content: '完成这个长任务' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(3)
    expect(result.transcript.budget.maxTurns).toBeNull()
    expect(result.transcript.budget.maxToolCalls).toBeNull()
    expect(result.transcript.turns.flatMap((turn) => turn.nextTurnPatches).filter(
      (patch) => patch.sourceHookId === 'agent-task-todo-exit-reminder'
    )).toHaveLength(1)
    expect(result.taskTodo.state).toBe('active')
    expect(result.taskTodo.items[0].status).toBe('pending')
    expect(result.transcript.terminalReason).toBe('incomplete')
  })

  it('未完成清单撞到回合上限时不得伪装 done，并在最后回合提前告知预算边界', async () => {
    const notices = []
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [{
          callId: 'todo-write',
          toolName: 'writeTaskTodo',
          args: { todos: [{ text: '完成复诊', acceptance: '复诊结果确认无遗漏' }] }
        }]
      })
      .mockResolvedValueOnce({ content: '修改已经完成，我先停在这里。', toolCalls: [], done: true })

    const result = await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '修改后复诊' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 2, maxToolCalls: 1 },
      callModel,
      onProgress: (event) => {
        if (event.kind === 'notice') notices.push(event.thought)
      }
    })

    expect(result.transcript.turns[1].nextTurnPatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceHookId: 'agent-task-todo-exit-reminder' })
    ]))
    expect(callModel.mock.calls[1][0].messages.at(-1).content).toContain('只剩最后 1 个模型回合')
    expect(result.taskTodo.state).toBe('active')
    expect(result.transcript.terminalReason).toBe('budget-exceeded')
    expect(notices.join('\n')).toContain('待办仍有 1 项未完成')
  })

  it('TODO 控制工具不消耗业务工具预算，业务动作做完后仍能勾清清单', async () => {
    const executed = []
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [
          {
            callId: 'todo-write',
            toolName: 'writeTaskTodo',
            args: { todos: [{ text: '读取资料并核对', acceptance: 'A 已读取' }] }
          },
          { callId: 'read-a', toolName: 'readSource', args: { name: 'A' } }
        ]
      })
      .mockResolvedValueOnce({
        toolCalls: [{
          callId: 'todo-done',
          toolName: 'updateTaskTodo',
          args: { updates: [{ id: 'todo-1', status: 'completed' }] }
        }]
      })
      .mockResolvedValueOnce({ content: '资料已读取并核对。', toolCalls: [], done: true })

    const result = await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '读取 A 并核对' }],
      toolRegistry: makeBusinessRegistry(executed),
      initialActiveTools: ['readSource'],
      budget: { maxTurns: 3, maxToolCalls: 1 },
      callModel
    })

    expect(executed).toEqual(['read:A'])
    expect(result.taskTodo.state).toBe('completed')
    expect(result.transcript.budget.usedToolCalls).toBe(1)
    expect(result.transcript.terminalReason).toBe('done')
  })

  it('简单一次性回答不创建空清单，也不会被 TODO 门误续轮', async () => {
    const callModel = vi.fn(async () => ({ content: '答案是 42。', toolCalls: [], done: true }))
    const result = await runAgentRuntime({
      agentName: 'SimpleAgent',
      messages: [{ role: 'user', content: '答案是什么？' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 2, maxToolCalls: 1 },
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(1)
    expect(result.taskTodo.state).toBe('empty')
    expect(result.taskTodo.items).toEqual([])
  })

  it('等待用户属于合法暂停：保留未完成清单，并与正常完成终态分开', async () => {
    const askRegistry = new ToolRegistry([{
      name: 'askChoice',
      brief: '向用户确认关键分叉',
      execute: () => ({
        content: '需要用户选择。',
        awaitingUser: {
          kind: 'choice',
          title: '选择开放程度',
          options: [{ label: '半开放' }],
          source: { agent: 'TodoAgent', toolName: 'askChoice' }
        }
      })
    }])
    const callModel = vi.fn(async () => ({
      toolCalls: [
        {
          callId: 'todo-write',
          toolName: 'writeTaskTodo',
          args: { todos: [{ text: '按用户选择继续改造', acceptance: '选择已写入正式设定' }] }
        },
        { callId: 'ask', toolName: 'askChoice', args: {} }
      ]
    }))

    const result = await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '按我的选择继续' }],
      toolRegistry: askRegistry,
      initialActiveTools: ['askChoice'],
      budget: { maxTurns: 4, maxToolCalls: 4 },
      callModel
    })

    expect(result.transcript.terminalReason).toBe('awaiting-user')
    expect(result.pendingInteraction?.title).toBe('选择开放程度')
    expect(result.taskTodo.state).toBe('active')
    expect(result.taskTodo.items[0].status).toBe('pending')
  })

  it('停止后补充消息会从同一对话的未完成清单继续，不要求重新建表', async () => {
    const previousTodo = {
      taskId: 'conversation-task',
      revision: 2,
      state: 'active',
      changeKind: 'updated',
      createdAt: 10,
      updatedAt: 20,
      items: [
        { id: 'todo-1', text: '核对资料', acceptance: '资料已核对', status: 'completed' },
        { id: 'todo-2', text: '完成写入', acceptance: '正文写入并复核', status: 'in_progress' }
      ]
    }
    const callModel = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [{
          callId: 'todo-done',
          toolName: 'updateTaskTodo',
          args: { updates: [{ id: 'todo-2', status: 'completed' }] }
        }]
      })
      .mockResolvedValueOnce({ content: '已从原进度继续并完成写入。', toolCalls: [], done: true })

    const result = await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '继续，月份名称按我补充的改' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      initialTaskTodo: previousTodo,
      budget: { maxTurns: 4, maxToolCalls: 4 },
      callModel
    })

    expect(callModel.mock.calls[0][0].messages.at(-1).content).toContain('todo-2 完成写入')
    expect(result.taskTodo.state).toBe('completed')
    expect(result.taskTodo.taskId).toBe('conversation-task')
  })

  it('空正文且无原生工具的中间模型轮不会写入非法 assistant 消息', async () => {
    const outboundSnapshots = []
    const callModel = vi.fn(async (request) => {
      outboundSnapshots.push(request.messages)
      if (request.turnIndex === 0) {
        return {
          toolCalls: [{
            callId: 'todo-write',
            toolName: 'writeTaskTodo',
            args: { todos: [{ text: '完成资料写入', acceptance: '正文写入成功' }] }
          }]
        }
      }
      if (request.turnIndex === 1) return { content: '', toolCalls: [], done: true }
      if (request.turnIndex === 2) {
        return {
          toolCalls: [{
            callId: 'todo-done',
            toolName: 'updateTaskTodo',
            args: { updates: [{ id: 'todo-1', status: 'completed' }] }
          }]
        }
      }
      return { content: '写入完成。', toolCalls: [], done: true }
    })

    await runAgentRuntime({
      agentName: 'TodoAgent',
      messages: [{ role: 'user', content: '完成资料写入' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 6, maxToolCalls: 4 },
      callModel
    })

    for (const snapshot of outboundSnapshots) {
      for (const message of snapshot) {
        if (message.role !== 'assistant') continue
        expect(Boolean(message.content.trim()) || Boolean(message.tool_calls?.length)).toBe(true)
      }
    }
  })

  it('同一对话恢复已发现工具时只激活本轮 registry 仍授权的工具', async () => {
    const seen = []
    const onDeferredActiveToolsChange = vi.fn()
    const result = await runAgentRuntime({
      agentName: 'DeferredAgent',
      messages: [{ role: 'user', content: '继续使用已经找到的工具' }],
      toolRegistry: new ToolRegistry([{
        name: 'readDetail',
        brief: '读取详情',
        execute: () => ({ content: 'ok' })
      }]),
      initialActiveTools: [],
      deferredToolMode: true,
      initialDeferredActiveTools: ['readDetail', 'removedTool'],
      onDeferredActiveToolsChange,
      budget: { maxTurns: 2, maxToolCalls: 2 },
      callModel: async (request) => {
        seen.push(request.toolBriefs.map((tool) => tool.name))
        return { content: '完成。', toolCalls: [], done: true }
      }
    })

    expect(seen[0]).toEqual(expect.arrayContaining(['readDetail', 'toolsearch']))
    expect(seen[0]).not.toContain('removedTool')
    expect(result.deferredActiveTools).toEqual(['readDetail'])
    expect(onDeferredActiveToolsChange).toHaveBeenCalledWith(['readDetail'])
  })
})
