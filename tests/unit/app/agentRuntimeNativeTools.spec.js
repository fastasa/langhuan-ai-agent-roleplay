import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase, parseJsonModelOutput } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry, toOpenAiTools } from '../../../src/app/agentRuntime/toolRegistry.ts'
import { HookRegistry } from '../../../src/app/agentRuntime/hookRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

/** OpenAI 原生协议不变量校验：每条 assistant(tool_calls) 后必须紧跟「每个 tool_call_id 各一条 role:'tool'」、
 *  连续无间隔。违反即返回不通过原因（截图 400「insufficient tool messages following tool_calls message」复现点）。 */
function assertNativePairing(messages) {
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i]
    if (msg.role !== 'assistant' || !Array.isArray(msg.tool_calls) || !msg.tool_calls.length) continue
    const expectedIds = msg.tool_calls.map((call) => call.id)
    const following = messages.slice(i + 1, i + 1 + expectedIds.length)
    const allTool = following.length === expectedIds.length && following.every((m) => m.role === 'tool')
    const idsMatch = allTool && expectedIds.every((id, k) => following[k].tool_call_id === id)
    if (!allTool || !idsMatch) {
      return { ok: false, reason: `assistant(tool_calls=[${expectedIds.join(',')}]) 后未紧跟等量 role:'tool' 结果，实际紧跟：${following.map((m) => `${m.role}${m.tool_call_id ? `#${m.tool_call_id}` : ''}`).join(' / ')}` }
    }
  }
  return { ok: true }
}

function makeRegistry() {
  return new ToolRegistry([
    {
      name: 'echo',
      brief: '返回输入文本',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      validateArgs: (args) => typeof args.text === 'string' && args.text.trim() ? null : 'echo.text 必须是非空字符串',
      execute: (toolCall) => ({ content: `echo:${toolCall.args.text}`, details: { echoed: toolCall.args.text } })
    }
  ])
}

// 原生工具调用回包形态：{ content（编排元数据 JSON 字符串）, toolCalls（原生 function 形态）}
function nativeTurn(content, toolCalls) {
  return { content, toolCalls }
}

describe('agentRuntime 原生工具调用消费（批2）', () => {
  it('复现：模型返回原生 function.name 形态，工具名被正确识别、不再空串', async () => {
    const callModel = vi.fn((request) => {
      if (request.turnIndex === 0) {
        return nativeTurn('{"thought":"先回声一下"}', [
          { id: 'call_1', type: 'function', function: { name: 'echo', arguments: '{"text":"hi"}' } }
        ])
      }
      return nativeTurn('{"done":true}', [])
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    const firstCall = transcript.turns[0].toolCalls[0]
    expect(firstCall.toolName).toBe('echo') // 关键断言：原生 function.name 被识别，不是空串
    expect(firstCall.args).toEqual({ text: 'hi' }) // function.arguments(JSON 字符串)被解析
    expect(firstCall.native).toBe(true)
    expect(transcript.turns[0].toolResults[0]).toMatchObject({ toolName: 'echo', status: 'success', content: 'echo:hi' })
  })

  it('原生感知回灌：assistant 携带 tool_calls、工具结果用 role:"tool"+tool_call_id', async () => {
    const callModel = vi.fn((request) => request.turnIndex === 0
      ? nativeTurn('{"thought":"回声"}', [{ id: 'call_x', type: 'function', function: { name: 'echo', arguments: '{"text":"hi"}' } }])
      : nativeTurn('{"done":true}', []))

    const { messages } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    const assistant = messages.find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length)
    expect(assistant).toBeTruthy()
    expect(assistant.tool_calls[0]).toMatchObject({ id: 'call_x', type: 'function', function: { name: 'echo' } })
    expect(JSON.parse(assistant.tool_calls[0].function.arguments)).toEqual({ text: 'hi' })

    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg).toBeTruthy()
    expect(toolMsg.tool_call_id).toBe('call_x') // 与 assistant.tool_calls 的 id 配对
    expect(toolMsg.content).toBe('echo:hi')
    // 原生轮不应再出现旧的 role:'user' JSON 回灌
    expect(messages.some((m) => m.role === 'user' && String(m.content || '').includes('"kind":"toolResult"'))).toBe(false)
  })

  it('精准护栏：原生 function.name 为空 → 明确「没有读到工具名」而非泛化报错', async () => {
    const callModel = vi.fn((request) => request.turnIndex === 0
      ? nativeTurn('{}', [{ id: 'call_e', type: 'function', function: { name: '', arguments: '{}' } }])
      : nativeTurn('{"done":true}', []))

    const { transcript } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    const result = transcript.turns[0].toolResults[0]
    expect(result.status).toBe('blocked')
    expect(result.error.type).toBe('MODEL_OUTPUT_INVALID')
    expect(result.content).toContain('没有读到工具名')
    expect(result.content).toContain('echo') // 附可用清单
  })

  it('精准护栏：原生工具名不存在 → 「没有名为「xxx」的工具」+可用清单', async () => {
    const callModel = vi.fn((request) => request.turnIndex === 0
      ? nativeTurn('{}', [{ id: 'call_n', type: 'function', function: { name: 'nonexistent', arguments: '{}' } }])
      : nativeTurn('{"done":true}', []))

    const { transcript } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      // item6 退役 openToolGate：把 nonexistent 放进 activeTools（通过阶段门控）才命中「名字不存在+可用清单」分支（截图 bug 场景）。
      initialActiveTools: ['echo', 'nonexistent'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    const result = transcript.turns[0].toolResults[0]
    expect(result.error.type).toBe('TOOL_NOT_FOUND')
    expect(result.content).toContain('没有名为「nonexistent」的工具')
    expect(result.content).toContain('echo')
  })

  it('字段值字符串化纠形（2026-07-08 订阅桥真机 writeTodo 首发连败）：array 字段收到 JSON 字符串按 schema 解开、首发即执行成功', async () => {
    const registry = new ToolRegistry([
      {
        name: 'writeTodo',
        brief: '写待办',
        schema: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object' } } }, required: ['todos'] },
        validateArgs: (args) => (Array.isArray(args.todos) && args.todos.length ? null : 'writeTodo 缺少 todos'),
        execute: (toolCall) => ({ content: `已写入 ${toolCall.args.todos.length} 条`, details: {} })
      }
    ])
    // 真机形状：模型把 todos 的值整体序列化成 JSON 字符串
    const callModel = vi.fn((request) => request.turnIndex === 0
      ? nativeTurn('{"thought":"建清单"}', [{ id: 'call_t', type: 'function', function: { name: 'writeTodo', arguments: '{"todos":"[{\\"text\\":\\"转场收束\\",\\"acceptance\\":\\"帷幕改到酒店\\"}]"}' } }])
      : nativeTurn('{"done":true}', []))

    const { transcript, messages } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['writeTodo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    const firstCall = transcript.turns[0].toolCalls[0]
    expect(firstCall.args.todos).toEqual([{ text: '转场收束', acceptance: '帷幕改到酒店' }]) // 纠形后是真数组
    expect(transcript.turns[0].toolResults[0]).toMatchObject({ status: 'success', content: '已写入 1 条' })
    // 回灌 assistant.tool_calls 里的 arguments 也是纠形后的真值（模型看到规范形状）
    const assistant = messages.find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length)
    expect(JSON.parse(assistant.tool_calls[0].function.arguments).todos).toEqual([{ text: '转场收束', acceptance: '帷幕改到酒店' }])
  })

  it('旧 content-JSON 路径保持不变：tool 字段解析、回灌仍是 role:"user" JSON', async () => {
    const callModel = vi.fn((request) => request.turnIndex === 0
      ? '{"thought":"x","toolCalls":[{"tool":"echo","args":{"text":"hi"}}]}'
      : '{"done":true}')

    const { transcript, messages } = await runAgentRuntime({
      agentName: 'LegacyAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    const firstCall = transcript.turns[0].toolCalls[0]
    expect(firstCall.toolName).toBe('echo')
    expect(firstCall.native).toBeUndefined() // 非原生轮
    // 旧回灌：role:'user' + JSON，且不应出现 role:'tool'
    expect(messages.some((m) => m.role === 'user' && String(m.content || '').includes('"kind":"toolResult"'))).toBe(true)
    expect(messages.some((m) => m.role === 'tool')).toBe(false)
  })

  it('parseJsonModelOutput：原生包裹形态从 content 解析元数据、从 toolCalls 取工具', () => {
    const parsed = parseJsonModelOutput(nativeTurn('{"thought":"读情境","stage":"scenario-routing","done":false}', [
      { id: 'c1', type: 'function', function: { name: 'readScenarioSkill', arguments: '{"code":"daily"}' } }
    ]), 0)
    expect(parsed.stage).toBe('scenario-routing')
    expect(parsed.done).toBe(false)
    expect(parsed.parsed.thought).toBe('读情境')
    expect(parsed.toolCalls).toHaveLength(1)
    expect(parsed.toolCalls[0].function.name).toBe('readScenarioSkill')
  })

  it('复现截图 400：原生多工具轮 + 轮内 hook 注入，工具结果必须连续、注入消息在其后', async () => {
    // 模型一轮里发起两个原生 tool_call（情境轮「读情境+读旁白skill」/生成轮多 generatePlanBatch 的同构），
    // 且第一个工具成功后 afterToolResult hook 注入一条 role:'user' 阶段指令。
    const hookRegistry = new HookRegistry([
      {
        id: 'inject-after-first',
        lifecycle: 'afterToolResult',
        priority: 20,
        appliesTo: { toolName: 'echo', status: 'success' },
        run: () => ({ summary: '阶段指令', injectMessages: [{ role: 'user', purpose: 'stage-instruction', content: '已读取，请继续。' }] })
      }
    ])

    const seenMessages = []
    const callModel = vi.fn((request) => {
      seenMessages.push(request.messages.map((m) => ({ ...m })))
      if (request.turnIndex === 0) {
        return nativeTurn('{"thought":"同轮两调"}', [
          { id: 'call_a', type: 'function', function: { name: 'echo', arguments: '{"text":"a"}' } },
          { id: 'call_b', type: 'function', function: { name: 'echo', arguments: '{"text":"b"}' } }
        ])
      }
      return nativeTurn('{"done":true}', [])
    })

    const { messages } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      hookRegistry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 4 },
      callModel
    })

    // 最终 messages 不变量成立
    const finalCheck = assertNativePairing(messages)
    expect(finalCheck.ok, finalCheck.reason).toBe(true)
    // 第 1 轮（turnIndex=1）真正发给模型的 messages 同样成立（这正是截图里被 DeepSeek 拒的那一份）
    const turn1Sent = seenMessages[1]
    const sentCheck = assertNativePairing(turn1Sent)
    expect(sentCheck.ok, sentCheck.reason).toBe(true)
    // 注入的阶段指令必须排在两条 tool 结果之后，而不是夹在中间
    const assistantIdx = turn1Sent.findIndex((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length === 2)
    expect(turn1Sent[assistantIdx + 1]).toMatchObject({ role: 'tool', tool_call_id: 'call_a' })
    expect(turn1Sent[assistantIdx + 2]).toMatchObject({ role: 'tool', tool_call_id: 'call_b' })
    const injectIdx = turn1Sent.findIndex((m) => m.role === 'user' && String(m.content || '').includes('已读取，请继续'))
    expect(injectIdx).toBeGreaterThan(assistantIdx + 2)
  })

  it('复现孤儿配对：原生多工具轮某工具触发 requestRetry 提前 break，未跑的 tool_call 也要补 role:"tool"', async () => {
    // 第一个工具成功后 hook requestRetry → 串行 loop break，第二个 tool_call 未执行 → 旧实现下它没有结果 → 400。
    const hookRegistry = new HookRegistry([
      {
        id: 'retry-after-first',
        lifecycle: 'afterToolResult',
        priority: 20,
        appliesTo: { toolName: 'echo', status: 'success' },
        run: ({ toolResult }) => (toolResult.callId === 'call_a'
          ? { summary: '重试', requestRetry: { callId: 'call_a', toolName: 'echo', errorType: 'EXPECTATION_MISMATCH', reason: '复现孤儿' } }
          : undefined)
      }
    ])

    const seenMessages = []
    let turn = 0
    const callModel = vi.fn((request) => {
      seenMessages.push(request.messages.map((m) => ({ ...m })))
      turn += 1
      if (request.turnIndex === 0) {
        return nativeTurn('{"thought":"同轮两调"}', [
          { id: 'call_a', type: 'function', function: { name: 'echo', arguments: '{"text":"a"}' } },
          { id: 'call_b', type: 'function', function: { name: 'echo', arguments: '{"text":"b"}' } }
        ])
      }
      return nativeTurn('{"done":true}', [])
    })

    const { messages } = await runAgentRuntime({
      agentName: 'NativeAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      hookRegistry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 4, maxToolCalls: 8 },
      callModel
    })

    const finalCheck = assertNativePairing(messages)
    expect(finalCheck.ok, finalCheck.reason).toBe(true)
    // 重试后的下一轮真正发给模型的 messages 也必须配平（call_b 已被补占位 role:'tool'）
    const retrySent = seenMessages[1]
    const sentCheck = assertNativePairing(retrySent)
    expect(sentCheck.ok, sentCheck.reason).toBe(true)
    expect(retrySent.some((m) => m.role === 'tool' && m.tool_call_id === 'call_b')).toBe(true)
  })

  it('toOpenAiTools：toolBriefs → OpenAI tools schema（缺 schema 给最小 object 兜底）', () => {
    const tools = toOpenAiTools([
      { name: 'echo', brief: '返回输入文本', schema: { type: 'object', properties: { text: { type: 'string' } } } },
      { name: 'noschema', brief: '无 schema 工具' }
    ])
    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({ type: 'function', function: { name: 'echo', description: '返回输入文本' } })
    expect(tools[0].function.parameters.properties.text.type).toBe('string')
    expect(tools[1].function.parameters).toEqual({ type: 'object', properties: {} })
  })

  it('toOpenAiTools：语义相同但构造顺序不同的 schema 会规范成逐字一致请求', () => {
    const first = toOpenAiTools([{
      name: 'echo',
      brief: '返回输入文本',
      schema: {
        required: ['text'],
        properties: { text: { description: '正文', type: 'string' } },
        type: 'object'
      }
    }])
    const second = toOpenAiTools([{
      name: 'echo',
      brief: '返回输入文本',
      schema: {
        type: 'object',
        properties: { text: { type: 'string', description: '正文' } },
        required: ['text']
      }
    }])
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
