import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// 订阅桥识图（2026-07-11 输入框图片上传·追加改造）：CHAT_IMAGE_DIR 指到临时目录，不碰真实
// chat-images/真库（仿 aiAppServiceVisionDispatch.spec.js 同款隔离）。
const CHAT_IMAGE_TEST_DIR = join(tmpdir(), 'langhuan-claude-code-bridge-spec')
vi.mock('../../../server/db', () => ({ CHAT_IMAGE_DIR: CHAT_IMAGE_TEST_DIR, default: {} }))

// 空闲看门狗测试用（2026-07-12 追加）：mock child_process.spawn，注入可编程控制的假子进程
// （EventEmitter），配合 vi.useFakeTimers() 精确控制看门狗计时器，不真正 spawn claude 二进制。
// 仅本文件里显式调用 runClaudeCli 的用例会触碰它；其余既有用例都走注入 runner，从不经过
// spawn，故这个 mock 不影响文件里任何既有测试。
vi.mock('child_process', () => {
  const spawn = vi.fn()
  return { spawn, default: { spawn } }
})

// resume 删盘测试用（批H·2026-07-12）：只桩 unlink（会话 jsonl 删除口），其余 fs/promises 能力全部
// 走真实实现——callClaudeCodeBridge 的 mkdtemp/writeFile/rm 临时目录链路依赖真 fs，不能整体假掉。
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  const unlink = vi.fn(async () => {})
  return { ...actual, unlink, default: { ...actual, unlink } }
})

// 动态 import（而非静态 import）：静态 import 会被提到模块最顶部先于上面的 const/vi.mock 执行，
// 导致 mock 工厂函数在 CHAT_IMAGE_TEST_DIR 初始化前就跑（TDZ 报错）；仿 aiAppServiceVisionDispatch.spec.js
// 同款写法，动态 import 保证求值顺序落在 const 声明之后。
const {
  buildToolCallSchema,
  callClaudeCodeBridge,
  chatCompletionToSseBody,
  clearClaudeCodeBridgeResumeChains,
  computeCliSessionFilePath,
  createResumeChainRegistry,
  envelopeToChatCompletion,
  listClaudeCodeBridgeModels,
  renderBridgePrompt,
  renderToolInstruction,
  runClaudeCli,
  unwrapNativeToolUseInput
} = await import('../../../server/application/ai/claudeCodeBridge.js')
const { spawn } = await import('child_process')
const { unlink } = await import('fs/promises')

describe('claudeCodeBridge renderBridgePrompt', () => {
  beforeAll(() => {
    mkdirSync(CHAT_IMAGE_TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    rmSync(CHAT_IMAGE_TEST_DIR, { recursive: true, force: true })
  })

  it('拆分 system 与对话转写，保留角色标记', () => {
    const { systemPrompt, transcript } = renderBridgePrompt([
      { role: 'system', content: '你是统筹' },
      { role: 'system', content: '第二段纲领' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '在的' }
    ])
    expect(systemPrompt).toBe('你是统筹\n\n第二段纲领')
    expect(transcript).toContain('【用户】\n你好')
    expect(transcript).toContain('【助手】\n在的')
  })

  it('线性还原工具调用往返（assistant.tool_calls 与 tool 角色）', () => {
    const { transcript } = renderBridgePrompt([
      { role: 'user', content: '写个待办' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'write_todo', arguments: '{"text":"测试"}' } }]
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
      { role: 'user', content: '继续' }
    ])
    expect(transcript).toContain('【助手·调用工具】\nwrite_todo {"text":"测试"}')
    expect(transcript).toContain('【工具 call_1 返回】\n{"ok":true}')
  })

  it('image_url 指向 /chat-images/ 且文件存在 → 渲染成 @绝对路径，并收进 imagePaths（订阅桥识图·2026-07-11）', () => {
    writeFileSync(join(CHAT_IMAGE_TEST_DIR, 'probe.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const expectedPath = join(CHAT_IMAGE_TEST_DIR, 'probe.png')
    const { transcript, imagePaths } = renderBridgePrompt([
      {
        role: 'user',
        content: [
          { type: 'text', text: '看看这个' },
          { type: 'image_url', image_url: { url: '/chat-images/probe.png' } }
        ]
      }
    ])
    expect(transcript).toContain('看看这个')
    expect(transcript).toContain(`@${expectedPath}`)
    expect(imagePaths).toEqual([expectedPath])
  })

  it('路径穿越（basename 剥离后与原值不同）→ 降级为 [图片已失效]，不拼路径、不进 imagePaths', () => {
    const { transcript, imagePaths } = renderBridgePrompt([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: '/chat-images/../../etc/passwd' } }] }
    ])
    expect(transcript).toContain('[图片已失效]')
    expect(transcript).not.toContain('@')
    expect(imagePaths).toEqual([])
  })

  it('登记路径但文件不存在（已被清理）→ 降级为 [图片已失效]，不抛错', () => {
    const { transcript, imagePaths } = renderBridgePrompt([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: '/chat-images/missing.png' } }] }
    ])
    expect(transcript).toContain('[图片已失效]')
    expect(imagePaths).toEqual([])
  })

  it('data URI 兜底：解码落盘到 CHAT_IMAGE_DIR 下新文件再 @引用（当轮理论上不出现，仅历史/异常兜底）', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const dataUri = `data:image/png;base64,${buffer.toString('base64')}`
    const { transcript, imagePaths } = renderBridgePrompt([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUri } }] }
    ])
    expect(imagePaths).toHaveLength(1)
    const [savedPath] = imagePaths
    expect(savedPath.startsWith(CHAT_IMAGE_TEST_DIR)).toBe(true)
    expect(transcript).toContain(`@${savedPath}`)
    expect(readFileSync(savedPath)).toEqual(buffer)
  })

  it('未知协议/无法解析的 image_url → 降级为 [图片已失效]', () => {
    const { transcript, imagePaths } = renderBridgePrompt([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://evil.example.com/x.png' } }] }
    ])
    expect(transcript).toContain('[图片已失效]')
    expect(imagePaths).toEqual([])
  })

  it('空消息列表给出占位转写而不是空串', () => {
    const { transcript } = renderBridgePrompt([])
    expect(transcript).toBe('（无对话内容）')
  })

  // ===== LFI 越权读取修复：中和不可信正文里的 @ file-mention（2026-07-11·真机确认）=====
  it('用户正文里的 @<疑似路径> file-mention 被中和为 \\@（CLI 不再当文件提及·LFI 修复）', () => {
    const { transcript } = renderBridgePrompt([
      { role: 'user', content: '帮我看看 @C:\\Users\\x\\secret.txt 里写了啥' }
    ])
    // @ 前插入反斜杠：实测 CLI 对 \@<路径> 不再解析成文件提及
    expect(transcript).toContain('\\@C:\\Users\\x\\secret.txt')
    // 不残留任何「前一个字符不是反斜杠」的裸 @C:（即未中和的 file-mention）
    expect(/(^|[^\\])@C:/.test(transcript)).toBe(false)
  })

  it('POSIX 绝对路径 @/etc/passwd 同样被中和（含 / 的疑似路径）', () => {
    const { transcript } = renderBridgePrompt([
      { role: 'user', content: '看看 @/etc/passwd 内容' }
    ])
    expect(transcript).toContain('\\@/etc/passwd')
  })

  it('system 提示词正文里的 @<疑似路径> 同样被中和（世界书/角色可注入的不可信正文）', () => {
    const { systemPrompt } = renderBridgePrompt([
      { role: 'system', content: '资料索引：详见 @D:\\langhuan\\server\\data\\langhuan.db' }
    ])
    expect(systemPrompt).toContain('\\@D:\\langhuan\\server\\data\\langhuan.db')
    expect(/(^|[^\\])@D:/.test(systemPrompt)).toBe(false)
  })

  it('图片 @绝对路径不被中和、与同轮正文里的不可信 @路径分别对待（识图不被安全修复破坏）', () => {
    writeFileSync(join(CHAT_IMAGE_TEST_DIR, 'vision.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const imgAbs = join(CHAT_IMAGE_TEST_DIR, 'vision.png')
    const { transcript, imagePaths } = renderBridgePrompt([
      {
        role: 'user',
        content: [
          { type: 'text', text: '顺便看看 @C:\\Windows\\win.ini' },
          { type: 'image_url', image_url: { url: '/chat-images/vision.png' } }
        ]
      }
    ])
    // 可信图片 @路径保持有效（前一个字符不是反斜杠、file-mention 生效）
    expect(transcript).toContain(`@${imgAbs}`)
    expect(transcript.includes(`\\@${imgAbs}`)).toBe(false)
    // 同轮不可信文本 part 里的 @路径被中和
    expect(transcript).toContain('\\@C:\\Windows\\win.ini')
    expect(imagePaths).toEqual([imgAbs])
  })

  it('纯 @中文名（无路径分隔符）不构成文件提及、不被误伤，原样保留', () => {
    const { transcript } = renderBridgePrompt([
      { role: 'user', content: '帮我 @星依 看看今天的安排' }
    ])
    expect(transcript).toContain('@星依')
    expect(transcript).not.toContain('\\@星依')
  })

  it('邮箱 user@example.com（@ 后无路径分隔符）不被误伤', () => {
    const { transcript } = renderBridgePrompt([
      { role: 'user', content: '联系我：user@example.com 谢谢' }
    ])
    expect(transcript).toContain('user@example.com')
    expect(transcript).not.toContain('\\@example')
  })
})

describe('claudeCodeBridge renderToolInstruction', () => {
  const tools = [
    { type: 'function', function: { name: 'write_todo', description: '写待办', parameters: { type: 'object', properties: { text: { type: 'string' } } } } }
  ]

  it('包含工具名、描述与入参 Schema', () => {
    const text = renderToolInstruction(tools, 'auto')
    expect(text).toContain('write_todo')
    expect(text).toContain('写待办')
    expect(text).toContain('"text"')
    expect(text).toContain('tool_choice=auto')
  })

  it('required 与指定工具的口径正确', () => {
    expect(renderToolInstruction(tools, 'required')).toContain('必须至少发起一个工具调用')
    expect(renderToolInstruction(tools, { type: 'function', function: { name: 'write_todo' } })).toContain('必须调用工具 write_todo')
  })

  it('含原生 tool_use 口径：input=Schema 对象本身、字段值不字符串化（2026-07-08 首发连败降错率）', () => {
    const text = renderToolInstruction(tools, 'auto')
    expect(text).toContain('原生 tool_use')
    expect(text).toContain('input 就是该工具入参 Schema 的对象本身')
    expect(text).toContain('不要把任何字段值再序列化成 JSON 字符串')
  })
})

describe('claudeCodeBridge envelopeToChatCompletion', () => {
  it('纯文本：content 取 result，缓存 token 计入 prompt_tokens，同时原样拆分出 cache_read/cache_creation（2026-07-07 缓存可见性）', () => {
    const completion = envelopeToChatCompletion({
      result: '你好呀',
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 200 }
    }, 'sonnet', false)
    expect(completion.choices[0].message.content).toBe('你好呀')
    expect(completion.choices[0].finish_reason).toBe('stop')
    expect(completion.usage).toEqual({
      prompt_tokens: 310,
      completion_tokens: 5,
      total_tokens: 315,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 100
    })
  })

  it('无缓存字段的信封：cache_read/cache_creation 落 0，不报错', () => {
    const completion = envelopeToChatCompletion({
      result: '你好呀',
      usage: { input_tokens: 10, output_tokens: 5 }
    }, 'sonnet', false)
    expect(completion.usage.cache_read_input_tokens).toBe(0)
    expect(completion.usage.cache_creation_input_tokens).toBe(0)
  })

  it('工具模式：structured_output 映射为 OpenAI tool_calls（arguments 字符串透传）', () => {
    const completion = envelopeToChatCompletion({
      result: '{"content":"","tool_calls":[...]}',
      structured_output: {
        content: '我来写',
        tool_calls: [{ name: 'write_todo', arguments: '{"text":"测试"}' }]
      }
    }, 'sonnet', true)
    const message = completion.choices[0].message
    expect(message.content).toBe('我来写')
    expect(message.tool_calls).toEqual([
      { id: 'call_bridge_0', type: 'function', function: { name: 'write_todo', arguments: '{"text":"测试"}' } }
    ])
    expect(completion.choices[0].finish_reason).toBe('tool_calls')
  })

  it('工具模式：arguments 若是对象则序列化成字符串', () => {
    const completion = envelopeToChatCompletion({
      structured_output: { content: '', tool_calls: [{ name: 'write_todo', arguments: { text: '测试' } }] }
    }, 'sonnet', true)
    expect(completion.choices[0].message.tool_calls[0].function.arguments).toBe('{"text":"测试"}')
  })

  it('工具模式：tool_calls 为空时不带该字段、finish_reason=stop', () => {
    const completion = envelopeToChatCompletion({
      structured_output: { content: '不用调工具', tool_calls: [] }
    }, 'sonnet', true)
    expect(completion.choices[0].message.tool_calls).toBeUndefined()
    expect(completion.choices[0].finish_reason).toBe('stop')
  })
})

describe('claudeCodeBridge chatCompletionToSseBody', () => {
  it('SSE 契约：全部 data: 行 + [DONE] + usage 在某 chunk 顶层', () => {
    const completion = envelopeToChatCompletion({ result: '整段回复', usage: { input_tokens: 3, output_tokens: 7 } }, 'sonnet', false, '思考摘要')
    const body = chatCompletionToSseBody(completion)
    const lines = body.split('\n').filter(Boolean)
    expect(lines.every((line) => line.startsWith('data: '))).toBe(true)
    expect(lines[lines.length - 1]).toBe('data: [DONE]')

    const parsed = lines.slice(0, -1).map((line) => JSON.parse(line.slice('data: '.length)))
    expect(parsed.some((chunk) => chunk.choices?.[0]?.delta?.content === '整段回复')).toBe(true)
    expect(parsed.some((chunk) => chunk.choices?.[0]?.delta?.reasoning_content === '思考摘要')).toBe(true)
    expect(parsed.some((chunk) => chunk.usage?.completion_tokens === 7)).toBe(true)
    expect(parsed.every((chunk) => chunk.object === 'chat.completion.chunk')).toBe(true)
  })
})

describe('claudeCodeBridge buildToolCallSchema', () => {
  it('schema 顶层必填 content 与 tool_calls，arguments 约束为字符串', () => {
    const schema = buildToolCallSchema()
    expect(schema.required).toEqual(['content', 'tool_calls'])
    expect(schema.properties.tool_calls.items.properties.arguments.type).toBe('string')
    expect(schema.additionalProperties).toBe(false)
  })
})

describe('claudeCodeBridge callClaudeCodeBridge（注入 runner，不真 spawn）', () => {
  function makeRunner(envelope, capture = {}) {
    return vi.fn(async (input) => {
      capture.input = input
      return { stdout: JSON.stringify(envelope), stderr: '', code: 0 }
    })
  }

  it('stream=false：合成 OpenAI JSON Response，CLI 参数含核心开关', async () => {
    const capture = {}
    const runner = makeRunner({ result: '好的', usage: { input_tokens: 1, output_tokens: 2 } }, capture)
    const response = await callClaudeCodeBridge({
      messages: [{ role: 'system', content: '你是统筹' }, { role: 'user', content: '你好' }],
      model: 'sonnet',
      stream: false
    }, runner)

    const data = await response.json()
    expect(data.choices[0].message.content).toBe('好的')
    expect(data.usage.completion_tokens).toBe(2)

    const args = capture.input.args
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
    // 批H resume 通道默认开启：--no-session-persistence 让位给 --strict-mcp-config
    // （env LANGHUAN_CLAUDE_CLI_RESUME=0 时回到旧参数，见 resume 通道用例⑤）
    expect(args).toContain('--strict-mcp-config')
    expect(args).not.toContain('--no-session-persistence')
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet')
    expect(args).toContain('--system-prompt-file')
    expect(args).not.toContain('--json-schema')
    expect(capture.input.stdin).toContain('【用户】\n你好')
  })

  it('effort 传给 CLI；开启思考摘要时从 stream-json thinking 块回传 reasoning_content', async () => {
    const capture = {}
    const events = [
      { type: 'assistant', message: { content: [{ type: 'thinking', thinking: '先核对约束，再给结论。' }] } },
      { type: 'result', result: '结论' }
    ]
    const runner = vi.fn(async (input) => {
      capture.input = input
      for (const event of events) input.onStdoutLine?.(JSON.stringify(event))
      return { stdout: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, stderr: '', code: 0 }
    })

    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: '分析一下' }], model: 'fable', stream: false,
      effort: 'xhigh', thinking: 'enabled'
    }, runner)
    const data = await response.json()

    expect(capture.input.args.slice(capture.input.args.indexOf('--effort'), capture.input.args.indexOf('--effort') + 2)).toEqual(['--effort', 'xhigh'])
    expect(capture.input.args[capture.input.args.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(data.choices[0].message).toEqual(expect.objectContaining({ content: '结论', reasoning_content: '先核对约束，再给结论。' }))
  })

  it('带 tools：启用 --json-schema + stream-json，structured_output 变 tool_calls（整包 JSON stdout 兜底解析）', async () => {
    const capture = {}
    const runner = makeRunner({
      structured_output: { content: '', tool_calls: [{ name: 'write_todo', arguments: '{"text":"a"}' }] }
    }, capture)
    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: '写待办' }],
      model: 'opus',
      stream: false,
      tools: [{ type: 'function', function: { name: 'write_todo', parameters: {} } }],
      toolChoice: 'auto'
    }, runner)

    const data = await response.json()
    expect(data.choices[0].message.tool_calls[0].function.name).toBe('write_todo')
    expect(data.choices[0].finish_reason).toBe('tool_calls')
    expect(capture.input.args).toContain('--json-schema')
    // 工具轮跑 stream-json（原生 tool_use 拦截通道的前提），--verbose 是 CLI 硬性要求
    expect(capture.input.args).toContain('stream-json')
    expect(capture.input.args).toContain('--verbose')
    // 工具说明注入 system（走 --system-prompt-file，参数必须存在）
    expect(capture.input.args).toContain('--system-prompt-file')
  })

  it('toolChoice=none 时按纯文本处理，不加 --json-schema 也不走 stream-json', async () => {
    const capture = {}
    const runner = makeRunner({ result: '纯文本' }, capture)
    await callClaudeCodeBridge({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'sonnet',
      stream: false,
      tools: [{ type: 'function', function: { name: 'write_todo' } }],
      toolChoice: 'none'
    }, runner)
    expect(capture.input.args).not.toContain('--json-schema')
    expect(capture.input.args).not.toContain('stream-json')
    expect(capture.input.args).not.toContain('--verbose')
    expect(capture.input.args[capture.input.args.indexOf('--output-format') + 1]).toBe('json')
  })

  it('stream=true：合成伪流式 SSE（data: 行 + [DONE]）', async () => {
    const runner = makeRunner({ result: '整段', usage: { input_tokens: 1, output_tokens: 1 } })
    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'sonnet',
      stream: true
    }, runner)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    const text = await response.text()
    expect(text).toContain('data: ')
    expect(text).toContain('data: [DONE]')
  })

  it('is_error 信封抛人话错误', async () => {
    const runner = makeRunner({ is_error: true, result: 'Not logged in · Please run /login' })
    await expect(callClaudeCodeBridge({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'sonnet',
      stream: false
    }, runner)).rejects.toThrow(/claude 执行失败.*Not logged in/)
  })

  it('stdout 非 JSON 时抛错并带 stderr 摘要', async () => {
    const runner = vi.fn(async () => ({ stdout: 'oops not json', stderr: 'some cli noise', code: 1 }))
    await expect(callClaudeCodeBridge({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'sonnet',
      stream: false
    }, runner)).rejects.toThrow(/不是合法 JSON/)
  })

  it('非法模型名直接拒绝，不启动子进程', async () => {
    const runner = vi.fn()
    await expect(callClaudeCodeBridge({
      messages: [],
      model: 'bad model; rm -rf',
      stream: false
    }, runner)).rejects.toThrow(/模型名不合法/)
    expect(runner).not.toHaveBeenCalled()
  })
})

describe('claudeCodeBridge 原生 tool_use 拦截通道（2026-07-08 真机根因修）', () => {
  const TOOLS = [{ type: 'function', function: { name: 'readUnit', parameters: { type: 'object' } } }]

  /** 脚本化 stream-json runner：逐行喂 onStdoutLine，回调要求收束即停止后续行（capture.stopped 记真）。 */
  function makeStreamRunner(events, capture = {}) {
    return vi.fn(async (input) => {
      capture.input = input
      capture.stopped = false
      const consumed = []
      for (const event of events) {
        const line = JSON.stringify(event)
        consumed.push(line)
        if (input.onStdoutLine?.(line) === true) {
          capture.stopped = true
          break
        }
      }
      return { stdout: `${consumed.join('\n')}\n`, stderr: '', code: capture.stopped ? 1 : 0 }
    })
  }

  it('模型原生调业务工具：首条 tool_use 消息就地翻译成 tool_calls 并提前收束（不再落进「No such tool」撞墙轮）', async () => {
    const capture = {}
    const runner = makeStreamRunner([
      { type: 'system', subtype: 'init', tools: ['StructuredOutput'] },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: '…' },
            { type: 'text', text: '我来读一下' },
            { type: 'tool_use', id: 'toolu_1', name: 'readUnit', input: { domain: 'characterBrain', unit: 'liz/性格' } }
          ],
          usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 10 }
        }
      },
      // 拦截收束后，这条«模型放弃并道歉»的 result 不应被消费
      { type: 'result', result: '{"content":"工具不可用","tool_calls":[]}', structured_output: { content: '工具不可用', tool_calls: [] } }
    ], capture)

    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: '读liz性格' }],
      model: 'sonnet',
      stream: false,
      tools: TOOLS,
      toolChoice: 'auto'
    }, runner)

    const data = await response.json()
    const message = data.choices[0].message
    expect(message.tool_calls).toEqual([
      {
        id: 'call_bridge_native_0',
        type: 'function',
        function: { name: 'readUnit', arguments: '{"domain":"characterBrain","unit":"liz/性格"}' }
      }
    ])
    expect(message.content).toBe('我来读一下')
    expect(data.choices[0].finish_reason).toBe('tool_calls')
    // 用量取自被拦截的 assistant 消息（缓存计入 prompt_tokens 口径不变）
    expect(data.usage.prompt_tokens).toBe(17)
    expect(data.usage.completion_tokens).toBe(3)
    expect(capture.stopped).toBe(true)
  })

  it('StructuredOutput 收尾不算业务工具：不拦截，走结构化输出通道到 result 信封', async () => {
    const capture = {}
    const runner = makeStreamRunner([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: { content: '', tool_calls: [{ name: 'readUnit', arguments: '{"unit":"liz"}' }] } }]
        }
      },
      {
        type: 'result',
        result: '…',
        structured_output: { content: '', tool_calls: [{ name: 'readUnit', arguments: '{"unit":"liz"}' }] },
        usage: { input_tokens: 5, output_tokens: 2 }
      }
    ], capture)

    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: '读liz' }],
      model: 'sonnet',
      stream: false,
      tools: TOOLS,
      toolChoice: 'auto'
    }, runner)

    const data = await response.json()
    expect(capture.stopped).toBe(false)
    expect(data.choices[0].message.tool_calls[0].id).toBe('call_bridge_0')
    expect(data.choices[0].message.tool_calls[0].function.name).toBe('readUnit')
    expect(data.usage.prompt_tokens).toBe(5)
  })

  it('执行器没逐行消费（onStdoutLine 未被调）：从 NDJSON stdout 末行倒找 result 信封兜底', async () => {
    const events = [
      { type: 'system', subtype: 'init' },
      { type: 'result', result: '好的', structured_output: { content: '不用调工具', tool_calls: [] }, usage: { input_tokens: 1, output_tokens: 1 } }
    ]
    const runner = vi.fn(async () => ({ stdout: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, stderr: '', code: 0 }))
    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'sonnet',
      stream: false,
      tools: TOOLS,
      toolChoice: 'auto'
    }, runner)
    const data = await response.json()
    expect(data.choices[0].message.content).toBe('不用调工具')
    expect(data.choices[0].finish_reason).toBe('stop')
  })

  it('模型把仿真协议 {name, arguments} 带进原生 tool_use：input 剥壳后 arguments 是真实入参对象的 JSON 串（2026-07-08 真机 writeTodo 连败根因）', async () => {
    const runner = makeStreamRunner([
      {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'toolu_1',
            name: 'writeTodo',
            // 真机形状：模型受仿真提示词影响，把真实入参包成 { arguments: "<JSON串>" }
            input: { name: 'writeTodo', arguments: '{"todos":[{"text":"编排本轮转场","acceptance":"星依有回应"}]}' }
          }],
          usage: { input_tokens: 1, output_tokens: 1 }
        }
      }
    ])
    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: '继续' }],
      model: 'opus',
      stream: false,
      tools: TOOLS,
      toolChoice: 'auto'
    }, runner)
    const data = await response.json()
    const call = data.choices[0].message.tool_calls[0]
    expect(call.function.name).toBe('writeTodo')
    expect(JSON.parse(call.function.arguments)).toEqual({ todos: [{ text: '编排本轮转场', acceptance: '星依有回应' }] })
  })

  it('stream=true 时拦截结果同样合成伪流式 SSE（tool_calls 在 delta 里）', async () => {
    const runner = makeStreamRunner([
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'readUnit', input: { unit: 'liz' } }], usage: { input_tokens: 1, output_tokens: 1 } }
      }
    ])
    const response = await callClaudeCodeBridge({
      messages: [{ role: 'user', content: '读liz' }],
      model: 'sonnet',
      stream: true,
      tools: TOOLS,
      toolChoice: 'auto'
    }, runner)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    const text = await response.text()
    const chunks = text.split('\n').filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map((line) => JSON.parse(line.slice('data: '.length)))
    expect(chunks.some((chunk) => chunk.choices?.[0]?.delta?.tool_calls?.[0]?.function?.name === 'readUnit')).toBe(true)
  })
})

describe('claudeCodeBridge unwrapNativeToolUseInput（原生 tool_use 入参剥壳）', () => {
  it('{arguments: JSON串} 剥出真实入参对象（±name 键）', () => {
    expect(unwrapNativeToolUseInput({ arguments: '{"todos":[{"text":"a"}]}' })).toEqual({ todos: [{ text: 'a' }] })
    expect(unwrapNativeToolUseInput({ name: 'writeTodo', arguments: '{"todos":[]}' })).toEqual({ todos: [] })
  })

  it('arguments 是对象直接取、双重编码字符串最多解两层', () => {
    expect(unwrapNativeToolUseInput({ arguments: { todos: [] } })).toEqual({ todos: [] })
    expect(unwrapNativeToolUseInput({ arguments: JSON.stringify('{"todos":[]}') })).toEqual({ todos: [] })
  })

  it('正常入参（含业务键）与非对象原样透传，不误剥', () => {
    const real = { todos: [{ text: 'a' }] }
    expect(unwrapNativeToolUseInput(real)).toBe(real)
    const mixed = { arguments: '{}', unit: 'liz' } // 除 name/arguments 外还有业务键：不是协议包壳
    expect(unwrapNativeToolUseInput(mixed)).toBe(mixed)
    expect(unwrapNativeToolUseInput(null)).toBe(null)
    expect(unwrapNativeToolUseInput([1])).toEqual([1])
  })

  it('arguments 是解不动的坏 JSON：保留原 input 交下游精准报错', () => {
    const broken = { arguments: '{"todos":' }
    expect(unwrapNativeToolUseInput(broken)).toBe(broken)
    expect(unwrapNativeToolUseInput({ arguments: '' })).toEqual({})
  })
})

describe('claudeCodeBridge listClaudeCodeBridgeModels', () => {
  it('返回含 fable 与 effort 元数据的固定模型别名列表', () => {
    const models = listClaudeCodeBridgeModels()
    expect(models.map((item) => item.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
    expect(models[0]).toEqual(expect.objectContaining({
      id: 'fable',
      defaultReasoningEffort: 'high',
      supportedReasoningEfforts: expect.arrayContaining([
        expect.objectContaining({ reasoningEffort: 'low' }),
        expect.objectContaining({ reasoningEffort: 'xhigh' }),
        expect.objectContaining({ reasoningEffort: 'max' })
      ])
    }))
  })
})

describe('claudeCodeBridge runClaudeCli 空闲看门狗（2026-07-12 真机挂起事故追加）', () => {
  // 看门狗测试用假子进程：EventEmitter 模拟 child_process.spawn 返回值的最小接口
  // （stdout/stderr/stdin 各是独立 EventEmitter，kill 是可观测的 vi.fn()）。
  function createFakeChild(pid = 88888) {
    const child = new EventEmitter()
    child.pid = pid
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = new EventEmitter()
    child.stdin.write = vi.fn()
    child.stdin.end = vi.fn()
    child.kill = vi.fn()
    return child
  }

  // spawn mock 统一接线：'claude' 命令返回测试可控的 fakeChild；killChild 路径下按平台可能额外
  // spawn 'taskkill'（win32 分支）或直接调 fakeChild.kill()（非 win32 分支）——taskkill 调用给一个
  // 安静的 EventEmitter，killChild 对它只是 fire-and-forget 挂 error/exit 日志监听，不影响主流程。
  function wireSpawnMock(fakeChild) {
    spawn.mockReset()
    spawn.mockImplementation((cmd) => {
      if (cmd === 'claude') return fakeChild
      const proc = new EventEmitter()
      proc.pid = 12345
      return proc
    })
  }

  const ENV_KEYS = [
    'LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS',
    'LANGHUAN_CLAUDE_CLI_IDLE_TIMEOUT_MS',
    'LANGHUAN_CLAUDE_CLI_TIMEOUT_MS'
  ]
  const savedEnv = {}

  beforeAll(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  })
  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })
  beforeEach(() => {
    vi.useFakeTimers()
    for (const key of ENV_KEYS) delete process.env[key]
  })
  afterEach(() => {
    vi.useRealTimers()
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it('①首输出看门狗（默认5min）：全程无任何 stdout → 判定挂起，专属错误信息区别于 600s 整体超时', async () => {
    const fakeChild = createFakeChild()
    wireSpawnMock(fakeChild)
    const promise = runClaudeCli({ args: ['-p'], stdin: 'hi' })
    const assertion = expect(promise).rejects.toThrow(/空闲看门狗：启动后 300000ms 无任何输出，判定挂起提前终止（区别于整体超时）/)
    await vi.advanceTimersByTimeAsync(300000)
    await assertion
    // 击杀路径必须被触发：win32 分支走 taskkill、非 win32 分支走 child.kill，两者其一即可
    const killedViaTaskkill = spawn.mock.calls.some((call) => call[0] === 'taskkill')
    expect(killedViaTaskkill || fakeChild.kill.mock.calls.length > 0).toBe(true)
  })

  it('②首行到达后首输出看门狗解除：之后长时间无新输出也不再被它击杀，进程正常收尾照常 resolve', async () => {
    const fakeChild = createFakeChild()
    wireSpawnMock(fakeChild)
    let outcome = null
    const promise = runClaudeCli({ args: ['-p'], stdin: 'hi' })
    promise.then(() => { outcome = 'resolved' }, () => { outcome = 'rejected' })

    await vi.advanceTimersByTimeAsync(1000)
    fakeChild.stdout.emit('data', Buffer.from('{"type":"system"}\n'))

    // 远超默认 5min 阈值、但仍在 600s 整体超时之内：不应被首输出看门狗击杀
    await vi.advanceTimersByTimeAsync(400000)
    expect(outcome).toBe(null)

    fakeChild.emit('close', 0)
    await promise
    expect(outcome).toBe('resolved')
  })

  it('③env 设 0 禁用首输出看门狗：全程无输出、远超默认阈值也不会被它击杀', async () => {
    process.env.LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS = '0'
    const fakeChild = createFakeChild()
    wireSpawnMock(fakeChild)
    let outcome = null
    const promise = runClaudeCli({ args: ['-p'], stdin: 'hi' })
    promise.then(() => { outcome = 'resolved' }, () => { outcome = 'rejected' })

    await vi.advanceTimersByTimeAsync(350000)
    expect(outcome).toBe(null)

    fakeChild.emit('close', 0)
    await promise
    expect(outcome).toBe('resolved')
  })

  it('④行间空闲看门狗默认不生效：首输出看门狗禁用后，长时间无新输出也不会被击杀', async () => {
    process.env.LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS = '0'
    const fakeChild = createFakeChild()
    wireSpawnMock(fakeChild)
    let outcome = null
    const promise = runClaudeCli({ args: ['-p'], stdin: 'hi' })
    promise.then(() => { outcome = 'resolved' }, () => { outcome = 'rejected' })

    fakeChild.stdout.emit('data', Buffer.from('first\n'))
    await vi.advanceTimersByTimeAsync(300000) // 5 分钟无新输出，默认行间看门狗关闭不应触发
    expect(outcome).toBe(null)

    fakeChild.emit('close', 0)
    await promise
    expect(outcome).toBe('resolved')
  })

  it('④b env 开启行间空闲看门狗：持续有输出不触发，停止输出超阈值后判定挂起（专属错误信息）', async () => {
    process.env.LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS = '0'
    process.env.LANGHUAN_CLAUDE_CLI_IDLE_TIMEOUT_MS = '5000'
    const fakeChild = createFakeChild()
    wireSpawnMock(fakeChild)
    const promise = runClaudeCli({ args: ['-p'], stdin: 'hi' })
    const assertion = expect(promise).rejects.toThrow(/空闲看门狗：连续 5000ms 无新输出，判定挂起提前终止（区别于整体超时）/)

    // 持续有输出：每 3s 吐一行，跑 4 轮（共 12s），期间不应触发 5s 的行间空闲阈值
    for (let round = 0; round < 4; round += 1) {
      await vi.advanceTimersByTimeAsync(3000)
      fakeChild.stdout.emit('data', Buffer.from(`line-${round}\n`))
    }

    // 停止输出，推进超过 5s 空闲阈值，应判定挂起
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('⑤600s 整体超时行为不变：两支看门狗均禁用/未触发时，仍在 600s 被既有超时兜底击杀（错误信息不变）', async () => {
    process.env.LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS = '0'
    const fakeChild = createFakeChild()
    wireSpawnMock(fakeChild)
    const promise = runClaudeCli({ args: ['-p'], stdin: 'hi' })
    const assertion = expect(promise).rejects.toThrow(/claude CLI 进程超时（超过 600000ms 未完成，已终止子进程）/)
    await vi.advanceTimersByTimeAsync(600000)
    await assertion
  })
})

describe('claudeCodeBridge --resume 前缀分流通道（批H·2026-07-12）', () => {
  const RESUME_ENV_KEY = 'LANGHUAN_CLAUDE_CLI_RESUME'
  let savedResumeEnv

  beforeAll(() => {
    savedResumeEnv = process.env[RESUME_ENV_KEY]
  })
  afterAll(() => {
    if (savedResumeEnv === undefined) delete process.env[RESUME_ENV_KEY]
    else process.env[RESUME_ENV_KEY] = savedResumeEnv
  })
  beforeEach(() => {
    delete process.env[RESUME_ENV_KEY]
    clearClaudeCodeBridgeResumeChains()
    unlink.mockClear()
  })
  afterEach(() => {
    delete process.env[RESUME_ENV_KEY]
    clearClaudeCodeBridgeResumeChains()
  })

  /** 记录每次调用 input 的 runner：respond(input, 第几次调用) 决定应答。 */
  function makeChainRunner(respond) {
    const calls = []
    const runner = vi.fn(async (input) => {
      calls.push(input)
      return respond(input, calls.length)
    })
    return { runner, calls }
  }

  function jsonEnvelope(result, sessionId) {
    return {
      stdout: JSON.stringify({
        result,
        ...(sessionId ? { session_id: sessionId } : {}),
        usage: { input_tokens: 1, output_tokens: 1 }
      }),
      stderr: '',
      code: 0
    }
  }

  it('①通道默认开启：首调走全量、不带 --no-session-persistence、带 --strict-mcp-config（会话可持久待 resume）', async () => {
    const { runner, calls } = makeChainRunner(() => jsonEnvelope('回复1', 'sid-reg'))
    await callClaudeCodeBridge({
      messages: [{ role: 'system', content: '纲领' }, { role: 'user', content: 'u1' }],
      model: 'sonnet',
      stream: false
    }, runner)
    expect(calls[0].args).toContain('--strict-mcp-config')
    expect(calls[0].args).not.toContain('--no-session-persistence')
    expect(calls[0].args).not.toContain('--resume')
    // 注册成立的直接证据由用例②给出（纯追加命中 --resume sid）
  })

  it('②纯追加命中：--resume <sid> + 只投喂增量（CLI 已知的 assistant 纯文本回复跳过回显）', async () => {
    const { runner, calls } = makeChainRunner((input, n) => jsonEnvelope(n === 1 ? '回复1' : '回复2', 'sid-a'))
    const base = [{ role: 'system', content: '纲领' }, { role: 'user', content: '第一问' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false, continuityKey: 'user:a|session:same' }, runner)

    const appended = [...base, { role: 'assistant', content: '回复1' }, { role: 'user', content: '第二问' }]
    const response = await callClaudeCodeBridge({ messages: appended, model: 'sonnet', stream: false, continuityKey: 'user:a|session:same' }, runner)

    const args2 = calls[1].args
    expect(args2[args2.indexOf('--resume') + 1]).toBe('sid-a')
    expect(args2).toContain('--strict-mcp-config')
    // 增量投喂：只有新用户消息——不重发历史、也不回显 CLI 自己刚说过的「回复1」
    expect(calls[1].stdin).toBe('【用户】\n第二问')
    const data = await response.json()
    expect(data.choices[0].message.content).toBe('回复2')
  })

  it('②a continuityKey 隔离：相同配置与消息前缀跨业务通道也不复用 CLI 会话', async () => {
    const { runner, calls } = makeChainRunner((input, n) => jsonEnvelope(`回复${n}`, `sid-scope-${n}`))
    const base = [{ role: 'system', content: '纲领' }, { role: 'user', content: '第一问' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false, continuityKey: 'user:a|session:one' }, runner)

    await callClaudeCodeBridge({
      messages: [...base, { role: 'assistant', content: '回复1' }, { role: 'user', content: '第二问' }],
      model: 'sonnet',
      stream: false,
      continuityKey: 'user:a|session:two'
    }, runner)

    expect(calls[1].args).not.toContain('--resume')
    expect(calls[1].stdin).toContain('第一问')
  })

  it('②c 同链并发：正在 resume 的链不再被第二个请求复用，第二个请求新开全量链', async () => {
    let releaseResume
    let markResumeStarted
    const resumeStarted = new Promise((resolve) => { markResumeStarted = resolve })
    const resumeGate = new Promise((resolve) => { releaseResume = resolve })
    const { runner, calls } = makeChainRunner(async (input, n) => {
      if (n === 2) {
        markResumeStarted()
        await resumeGate
      }
      return jsonEnvelope(`回复${n}`, n === 1 ? 'sid-concurrent' : `sid-concurrent-${n}`)
    })
    const base = [{ role: 'user', content: '第一问' }]
    const continuityKey = 'user:a|session:concurrent'
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false, continuityKey }, runner)

    const firstResume = callClaudeCodeBridge({
      messages: [...base, { role: 'assistant', content: '回复1' }, { role: 'user', content: '并发甲' }],
      model: 'sonnet', stream: false, continuityKey
    }, runner)
    await resumeStarted
    await callClaudeCodeBridge({
      messages: [...base, { role: 'assistant', content: '回复1' }, { role: 'user', content: '并发乙' }],
      model: 'sonnet', stream: false, continuityKey
    }, runner)
    releaseResume()
    await firstResume

    expect(calls[1].args).toContain('--resume')
    expect(calls[2].args).not.toContain('--resume')
    expect(calls[2].stdin).toContain('第一问')
  })

  it('②d 停止 resume：作废在飞链且不自动全量重试', async () => {
    const controller = new AbortController()
    const { runner } = makeChainRunner((input, n) => {
      if (n === 2) throw new Error('已停止')
      return jsonEnvelope('回复1', 'sid-abort')
    })
    const base = [{ role: 'user', content: '第一问' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false }, runner)
    controller.abort()

    await expect(callClaudeCodeBridge({
      messages: [...base, { role: 'assistant', content: '回复1' }, { role: 'user', content: '第二问' }],
      model: 'sonnet', stream: false, signal: controller.signal
    }, runner)).rejects.toThrow('已停止')
    expect(runner).toHaveBeenCalledTimes(2)
    expect(unlink).toHaveBeenCalledWith(computeCliSessionFilePath('sid-abort'))
  })

  it('②b 拦截工具轮后的追加：assistant 带 tool_calls 与工具返回按 transcript 段式回显进增量（讨论稿 §2.3 语义代价缓解）', async () => {
    const { runner, calls } = makeChainRunner(() => jsonEnvelope('好的', 'sid-tool'))
    const base = [{ role: 'user', content: '第一问' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false }, runner)

    const appended = [
      ...base,
      { role: 'assistant', content: '我来调', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'readUnit', arguments: '{"unit":"liz"}' } }] },
      { role: 'tool', name: 'readUnit', content: '{"ok":true}' },
      { role: 'user', content: '继续' }
    ]
    await callClaudeCodeBridge({ messages: appended, model: 'sonnet', stream: false }, runner)

    expect(calls[1].args).toContain('--resume')
    // 被拦截轮的 tool_use 不在 CLI 历史里：必须整段回显（含 assistant 文本、调用工具段、工具返回段）
    expect(calls[1].stdin).toContain('【助手】\n我来调')
    expect(calls[1].stdin).toContain('【助手·调用工具】\nreadUnit {"unit":"liz"}')
    expect(calls[1].stdin).toContain('【工具 readUnit 返回】\n{"ok":true}')
    expect(calls[1].stdin).toContain('【用户】\n继续')
    // 但绝不重发前缀历史
    expect(calls[1].stdin).not.toContain('第一问')
  })

  it('③非纯追加（中段消息改写 / system 变化）→ 全量路径，不带 --resume', async () => {
    const { runner, calls } = makeChainRunner(() => jsonEnvelope('ok', 'sid-b'))
    const base = [{ role: 'system', content: '纲领' }, { role: 'user', content: '第一问' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false }, runner)

    // 中段改写（roundRetryUnits 一类历史重写）：前缀哈希不等 → 全量
    await callClaudeCodeBridge({
      messages: [{ role: 'system', content: '纲领' }, { role: 'user', content: '第一问·改' }, { role: 'user', content: '第二问' }],
      model: 'sonnet',
      stream: false
    }, runner)
    expect(calls[1].args).not.toContain('--resume')

    // system 变化（提调 0-6 层重排一类）：configHash 不等 → 全量
    await callClaudeCodeBridge({
      messages: [{ role: 'system', content: '纲领·重排' }, { role: 'user', content: '第一问' }, { role: 'user', content: '第二问' }],
      model: 'sonnet',
      stream: false
    }, runner)
    expect(calls[2].args).not.toContain('--resume')
  })

  it('④resume 失败 → 作废链（尽力删盘）+ 自动全量重试一次；后续调用不再 resume 旧链', async () => {
    const warn = vi.fn()
    const { runner, calls } = makeChainRunner((input, n) => {
      if (input.args.includes('--resume')) {
        return { stdout: 'garbage-not-json', stderr: 'resume broke', code: 1 }
      }
      // 全量路径成功；仅首调带 session_id（重试轮不带 → 不再注册新链，便于断言旧链已作废）
      return jsonEnvelope('ok', n === 1 ? 'sid-c' : undefined)
    })
    const base = [{ role: 'user', content: 'q1' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false }, runner)

    const appended = [...base, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'q2' }]
    const response = await callClaudeCodeBridge({ messages: appended, model: 'sonnet', stream: false, logger: { warn } }, runner)

    expect(runner).toHaveBeenCalledTimes(3) // 首调全量 + resume 失败 + 全量重试
    expect(calls[1].args).toContain('--resume')
    expect(calls[2].args).not.toContain('--resume')
    expect((await response.json()).choices[0].message.content).toBe('ok')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('resume 路径失败'))
    // 作废链触发尽力删盘
    expect(unlink).toHaveBeenCalledWith(computeCliSessionFilePath('sid-c'))

    // 链已作废：同构的纯追加再来也不 resume（注册表里已无 sid-c，重试轮又没注册新链）
    const appended2 = [...appended, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'q3' }]
    await callClaudeCodeBridge({ messages: appended2, model: 'sonnet', stream: false }, runner)
    expect(calls[3].args).not.toContain('--resume')
  })

  it('⑤env=0 整体关闭：参数与现役逐字节一致（含 --no-session-persistence），纯追加也全量重发', async () => {
    process.env[RESUME_ENV_KEY] = '0'
    const { runner, calls } = makeChainRunner(() => jsonEnvelope('ok', 'sid-off'))
    const base = [{ role: 'system', content: '纲领' }, { role: 'user', content: '第一问' }]
    await callClaudeCodeBridge({ messages: base, model: 'sonnet', stream: false }, runner)

    // 逐字节口径：与批H之前的现役参数完全一致
    expect(calls[0].args.slice(0, 10)).toEqual([
      '-p', '--setting-sources', '', '--tools', '', '--no-session-persistence',
      '--output-format', 'json', '--model', 'sonnet'
    ])
    expect(calls[0].args[10]).toBe('--system-prompt-file')
    expect(calls[0].args).toHaveLength(12)

    const appended = [...base, { role: 'assistant', content: 'ok' }, { role: 'user', content: '第二问' }]
    await callClaudeCodeBridge({ messages: appended, model: 'sonnet', stream: false }, runner)
    expect(calls[1].args).not.toContain('--resume')
    expect(calls[1].args).toContain('--no-session-persistence')
    expect(calls[1].args).not.toContain('--strict-mcp-config')
    expect(calls[1].stdin).toContain('第一问') // 全量重发历史
  })

  it('⑥LRU 超上限逐出最旧链 → 触发会话落盘删除（unlink 到对应 jsonl 路径）', () => {
    const registry = createResumeChainRegistry({ maxEntries: 2 })
    registry.register('sid-1', 'cfg', ['h1'], '')
    registry.register('sid-2', 'cfg', ['h1', 'h2'], '')
    registry.register('sid-3', 'cfg', ['h1', 'h2', 'h3'], '')
    expect(registry.size()).toBe(2)
    expect(unlink).toHaveBeenCalledTimes(1)
    expect(unlink).toHaveBeenCalledWith(computeCliSessionFilePath('sid-1'))
  })

  it('⑥b TTL 过期逐出 → 触发会话落盘删除，且过期链不再被匹配', () => {
    vi.useFakeTimers()
    try {
      const registry = createResumeChainRegistry({ ttlMs: 1000 })
      registry.register('sid-ttl', 'cfg', ['h1'], '')
      vi.advanceTimersByTime(1500)
      expect(registry.match('cfg', ['h1', 'h2'])).toBe(null)
      expect(unlink).toHaveBeenCalledWith(computeCliSessionFilePath('sid-ttl'))
      expect(registry.size()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
