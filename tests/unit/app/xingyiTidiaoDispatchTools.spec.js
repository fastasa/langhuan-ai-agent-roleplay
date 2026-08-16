// 批次3b·星依指挥提调工具族回归：版本化写回共享核心语义 + 联系人/会话定位 + dispatch 确认门与
// 五终态回报协议（direct-edit 写回/prompt-regen/escalate/askUser/busy）+ 重投影对齐现役口径。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runnerMocks = vi.hoisted(() => ({
  createRunner: vi.fn(),
  runCorrectionForSession: vi.fn()
}))

vi.mock('../../../src/app/tidiaoSessionCorrectionRunner.ts', () => ({
  createTidiaoSessionCorrectionRunner: (deps) => {
    runnerMocks.createRunner(deps)
    return { runCorrectionForSession: runnerMocks.runCorrectionForSession }
  }
}))

const repoMocks = vi.hoisted(() => ({
  fetchChatSessionBundle: vi.fn(),
  fetchChatSessionBundleById: vi.fn(),
  updateChatMessageBySessionId: vi.fn(),
  runChatMessageProjectionBySessionId: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchChatSessionBundle: repoMocks.fetchChatSessionBundle,
    fetchChatSessionBundleById: repoMocks.fetchChatSessionBundleById,
    updateChatMessageBySessionId: repoMocks.updateChatMessageBySessionId,
    runChatMessageProjectionBySessionId: repoMocks.runChatMessageProjectionBySessionId
  }
})

import {
  buildChatMessageEditVersionPayload,
  normalizeChatMessageEditVersionList
} from '../../../src/app/chatMessageEditVersionCore.ts'
import {
  createDispatchTidiaoCorrectionTool,
  createListChatContactsTool,
  createReadChatSessionMessagesTool,
  createXingyiTidiaoDispatchTools,
  resolveXingyiChatContact,
  XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX,
  extractTidiaoCorrectionTaskTitle
} from '../../../src/app/xingyiTidiaoDispatchTools.ts'
import { listSubagentRunStatuses, resetSubagentRunStatusForTest } from '../../../src/app/subagentRunStatus.ts'
import { listXingyiDispatchRegistry, resetXingyiDispatchRegistryForTest } from '../../../src/app/xingyiSubagentDispatchRegistry.ts'

const SESSION_ID = 'session_1'

function bundleFixture() {
  return {
    session: { id: SESSION_ID, targetId: 'char_1', targetType: 'char' },
    messages: [
      { id: 11, role: 'user', content: '你好呀' },
      { id: 12, role: 'assistant', content: '晚风正好，凉意也刚刚好。', memberName: '薇尔莉特' }
    ]
  }
}

function contactsFixture() {
  return [
    { targetId: 'char_1', name: '薇尔莉特', kind: 'character' },
    { targetId: 'char_2', name: '薇拉', kind: 'character' },
    { targetId: 'group_1', name: '午后茶会', kind: 'group' }
  ]
}

function baseCtx(overrides = {}) {
  return {
    confirmWrite: vi.fn(async () => true),
    runnerDeps: { hasRunningChatRound: () => false, callAIWithTools: vi.fn(), loadAgentConfig: () => null },
    listChatContacts: () => contactsFixture(),
    ...overrides
  }
}

function okRunResult(overrides = {}) {
  return {
    ok: true,
    runId: 'run_x',
    anchorMessageId: 11,
    strategy: 'direct-edit',
    edits: [],
    promptEdits: [],
    regenerations: [],
    escalation: null,
    askUser: null,
    narrationCreations: [],
    reprojectTargets: [],
    chatAnswer: '',
    directorStream: null,
    ...overrides
  }
}

const call = (args) => ({ args })

beforeEach(() => {
  runnerMocks.createRunner.mockClear()
  runnerMocks.runCorrectionForSession.mockReset().mockResolvedValue(okRunResult())
  repoMocks.fetchChatSessionBundle.mockReset().mockResolvedValue(bundleFixture())
  repoMocks.fetchChatSessionBundleById.mockReset().mockResolvedValue(bundleFixture())
  repoMocks.updateChatMessageBySessionId.mockReset().mockResolvedValue(undefined)
  repoMocks.runChatMessageProjectionBySessionId.mockReset().mockResolvedValue(undefined)
  resetSubagentRunStatusForTest()
  resetXingyiDispatchRegistryForTest()
})

describe('chatMessageEditVersionCore（版本化写回共享核心）', () => {
  it('旧消息无 versionList：先补原文为第 1 版，再追加新版本并指到新版本', () => {
    const payload = buildChatMessageEditVersionPayload(
      { content: '旧正文', time: '10:00', model: 'm1', memberName: '薇尔莉特', crowdName: '' },
      '新正文'
    )
    expect(payload.content).toBe('新正文')
    expect(payload.versionList).toHaveLength(2)
    expect(payload.versionList[0].content).toBe('旧正文')
    expect(payload.versionList[1].content).toBe('新正文')
    expect(payload.activeVersionIndex).toBe(1)
    expect(payload.memberName).toBe('薇尔莉特')
  })

  it('reuseLatest：不追加版本，只更新最近一个版本内容（同轮多次改同条不堆版本）', () => {
    const first = buildChatMessageEditVersionPayload({ content: '旧正文' }, '第一次改')
    const second = buildChatMessageEditVersionPayload(
      { content: '第一次改', versionList: first.versionList },
      '第二次改',
      { reuseLatest: true }
    )
    expect(second.versionList).toHaveLength(2)
    expect(second.versionList[1].content).toBe('第二次改')
    expect(second.activeVersionIndex).toBe(1)
  })

  it('归一：已有 versionList 原样返回；无消息返回空', () => {
    const list = [{ content: 'v1' }]
    expect(normalizeChatMessageEditVersionList({ versionList: list })).toBe(list)
    expect(normalizeChatMessageEditVersionList(null)).toEqual([])
  })
})

describe('resolveXingyiChatContact（联系人定位）', () => {
  it('精确 targetId、精确名字、唯一子串都能命中', () => {
    expect(resolveXingyiChatContact(contactsFixture(), 'char_1').contact?.name).toBe('薇尔莉特')
    expect(resolveXingyiChatContact(contactsFixture(), '薇拉').contact?.targetId).toBe('char_2')
    expect(resolveXingyiChatContact(contactsFixture(), '茶会').contact?.targetId).toBe('group_1')
  })

  it('多个子串命中给候选清单；未命中提示看清单', () => {
    const ambiguous = resolveXingyiChatContact(contactsFixture(), '薇')
    expect(ambiguous.error).toContain('匹配到多个联系人')
    expect(ambiguous.error).toContain('char_1')
    expect(resolveXingyiChatContact(contactsFixture(), '不存在的人').error).toContain('listChatContacts')
  })
})

describe('listChatContacts 工具', () => {
  it('渲染联系人清单（角色/群 + targetId）', () => {
    const tool = createListChatContactsTool(baseCtx())
    const result = tool.execute(call({}), { turnIndex: 0 })
    expect(result.content).toContain('薇尔莉特（targetId char_1）')
    expect(result.content).toContain('群：午后茶会')
    expect(result.details.contacts).toHaveLength(3)
  })

  it('清单为空如实说', () => {
    const tool = createListChatContactsTool(baseCtx({ listChatContacts: () => [] }))
    const result = tool.execute(call({}), { turnIndex: 0 })
    expect(result.content).toContain('没有任何聊天联系人')
  })
})

describe('readChatSessionMessages 工具', () => {
  it('contactName 唯一子串 → 解析 targetId 读当前会话，输出 sessionId 与 #消息id', async () => {
    const tool = createReadChatSessionMessagesTool(baseCtx())
    const result = await tool.execute(call({ contactName: '薇尔' }), { turnIndex: 0 })
    expect(repoMocks.fetchChatSessionBundle).toHaveBeenCalledWith('char_1', { limit: 20 })
    expect(result.content).toContain(`sessionId ${SESSION_ID}`)
    expect(result.content).toContain('#12 [角色·薇尔莉特]')
    expect(result.details.messages[1]).toMatchObject({ id: 12, role: 'assistant' })
  })

  it('sessionId 直读走 ById 通道；两个都缺 validateArgs 拦下', async () => {
    const tool = createReadChatSessionMessagesTool(baseCtx())
    await tool.execute(call({ sessionId: SESSION_ID, limit: 5 }), { turnIndex: 0 })
    expect(repoMocks.fetchChatSessionBundleById).toHaveBeenCalledWith(SESSION_ID, { limit: 5 })
    expect(tool.validateArgs({})).toContain('至少一个')
  })

  it('联系人歧义回候选错误（不发请求）', async () => {
    const tool = createReadChatSessionMessagesTool(baseCtx())
    const result = await tool.execute(call({ contactName: '薇' }), { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('匹配到多个联系人')
    expect(repoMocks.fetchChatSessionBundle).not.toHaveBeenCalled()
  })
})

describe('dispatchTidiaoCorrection 工具', () => {
  const dispatchArgs = { sessionId: SESSION_ID, targetMessageId: 12, instruction: '把晚风段改得收敛一点' }

  it('confirmWrite 缺失：硬门拒绝执行（不进 runner）', async () => {
    const tool = createDispatchTidiaoCorrectionTool(baseCtx({ confirmWrite: undefined }))
    const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('确认通道未接入')
    expect(runnerMocks.runCorrectionForSession).not.toHaveBeenCalled()
  })

  it('用户取消：成功态「已取消」，不执行', async () => {
    const ctx = baseCtx({ confirmWrite: vi.fn(async () => false) })
    const tool = createDispatchTidiaoCorrectionTool(ctx)
    const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.details.denied).toBe(true)
    expect(runnerMocks.runCorrectionForSession).not.toHaveBeenCalled()
    // 确认卡片带会话名与目标消息预览
    const request = ctx.confirmWrite.mock.calls[0][0]
    expect(request.title).toBe('下发提调纠偏')
    expect(request.lines.join('\n')).toContain('薇尔莉特')
    expect(request.lines.join('\n')).toContain('#12')
  })

  it('会话/楼层未命中：INVALID_ARGUMENT 引导重新定位', async () => {
    repoMocks.fetchChatSessionBundleById.mockResolvedValueOnce({ session: null, messages: [] })
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    const missSession = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(missSession.status).toBe('error')
    expect(missSession.content).toContain('没有找到会话')

    const missMessage = await tool.execute(call({ ...dispatchArgs, targetMessageId: 999 }), { turnIndex: 0 })
    expect(missMessage.status).toBe('error')
    expect(missMessage.content).toContain('readChatSessionMessages')
    expect(runnerMocks.runCorrectionForSession).not.toHaveBeenCalled()
  })

  it('direct-edit：onEditCommitted 即时版本化写回（首次追加、同条第二次 reuseLatest 不堆版本）+ 本地视图补丁 + 重投影', async () => {
    const patched = []
    const ctx = baseCtx({ onMessagePatched: (patch) => patched.push(patch) })
    runnerMocks.runCorrectionForSession.mockImplementationOnce(async (input) => {
      await input.onEditCommitted({ messageId: 12, ref: '角色1', content: '第一次改' })
      await input.onEditCommitted({ messageId: 12, ref: '角色1', content: '第二次改' })
      return okRunResult({
        strategy: 'direct-edit',
        edits: [{ messageId: 12, ref: '角色1', speakerName: '薇尔莉特', content: '第二次改' }],
        reprojectTargets: [{ messageId: 12, ref: '角色1', speakerName: '薇尔莉特' }]
      })
    })
    const tool = createDispatchTidiaoCorrectionTool(ctx)
    const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })

    expect(repoMocks.updateChatMessageBySessionId).toHaveBeenCalledTimes(2)
    const firstPayload = repoMocks.updateChatMessageBySessionId.mock.calls[0][2]
    expect(firstPayload.versionList).toHaveLength(2)
    expect(firstPayload.activeVersionIndex).toBe(1)
    const secondPayload = repoMocks.updateChatMessageBySessionId.mock.calls[1][2]
    expect(secondPayload.versionList).toHaveLength(2)
    expect(secondPayload.versionList[1].content).toBe('第二次改')
    expect(patched).toHaveLength(2)
    expect(repoMocks.runChatMessageProjectionBySessionId).toHaveBeenCalledWith(SESSION_ID, 12)
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('已写回')
    expect(result.content).toContain('重跑投影')
    expect(result.details.written).toEqual(['角色1'])
  })

  it('busy：如实转告成功态（不是故障、不引导乱重试）', async () => {
    runnerMocks.runCorrectionForSession.mockResolvedValueOnce({ ok: false, busy: true, message: '提调正忙：当前有聊天回复/提调轮在跑，等它结束后再下发。' })
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('提调正忙')
    expect(result.details.busy).toBe(true)
  })

  it('askUser：问题+选项+推荐转给用户，指导答复后再下发', async () => {
    runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
      strategy: 'ask-user',
      askUser: { question: '要改成雨夜还是雪夜？', options: ['雨夜', '雪夜'], recommended: '雨夜——上文刚提过积云' }
    }))
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(result.content).toContain('要改成雨夜还是雪夜？')
    expect(result.content).toContain('雨夜——上文刚提过积云')
    expect(result.content).toContain('再 dispatch 一次')
  })

  it('escalate：外部轮不执行重排，转告到会话内操作；prompt-regen 提示去会话内重生成', async () => {
    runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
      strategy: 'escalate',
      escalation: { reason: '情境判错，需要整轮重排' }
    }))
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    const escalate = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(escalate.content).toContain('整轮重排')
    expect(escalate.content).toContain('会话内')

    runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
      strategy: 'prompt-regen',
      promptEdits: [{ messageId: 12, ref: '角色1', promptText: 'xx', editCount: 1 }]
    }))
    const promptRegen = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(promptRegen.content).toContain('改了 1 条消息的提示词')
    expect(promptRegen.content).toContain('按原提示重试')
  })

  // ── closingNote 预写收尾话（2026-07-12 用户拍板·省一轮模型调用）──

  describe('closingNote', () => {
    const argsWithNote = { ...dispatchArgs, closingNote: '已经帮用户改好啦～' }

    it('direct-edit 干净成功（无写回失败）且模型传了 closingNote → 结果透传 closingNote', async () => {
      runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
        strategy: 'direct-edit',
        edits: [{ messageId: 12, ref: '角色1', speakerName: '薇尔莉特', content: '改好了' }]
      }))
      const tool = createDispatchTidiaoCorrectionTool(baseCtx())
      const result = await tool.execute(call(argsWithNote), { turnIndex: 0 })
      expect(result.closingNote).toBe('已经帮用户改好啦～')
    })

    it('direct-edit 干净成功但模型没传 closingNote → 结果不带该字段', async () => {
      runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
        strategy: 'direct-edit',
        edits: [{ messageId: 12, ref: '角色1', speakerName: '薇尔莉特', content: '改好了' }]
      }))
      const tool = createDispatchTidiaoCorrectionTool(baseCtx())
      const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
      expect(result.closingNote).toBeUndefined()
    })

    it('direct-edit 但有写回失败：即使模型传了 closingNote 也不透传（不算干净成功）', async () => {
      const ctx = baseCtx()
      runnerMocks.runCorrectionForSession.mockImplementationOnce(async (input) => {
        await input.onEditCommitted({ messageId: 999, ref: '不存在的消息', content: '改好了' })
        return okRunResult({ strategy: 'direct-edit', edits: [{ messageId: 999, ref: '不存在的消息', speakerName: '?', content: '改好了' }] })
      })
      const tool = createDispatchTidiaoCorrectionTool(ctx)
      const result = await tool.execute(call(argsWithNote), { turnIndex: 0 })
      expect(result.details.writeFailures.length).toBeGreaterThan(0)
      expect(result.closingNote).toBeUndefined()
    })

    it('askUser/escalate/prompt-regen：需要用户答复或到会话内操作，即使模型传了 closingNote 也不透传', async () => {
      const tool = createDispatchTidiaoCorrectionTool(baseCtx())
      runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
        strategy: 'ask-user',
        askUser: { question: '要改成雨夜还是雪夜？', options: ['雨夜', '雪夜'] }
      }))
      expect((await tool.execute(call(argsWithNote), { turnIndex: 0 })).closingNote).toBeUndefined()

      runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
        strategy: 'escalate',
        escalation: { reason: '需要整轮重排' }
      }))
      expect((await tool.execute(call(argsWithNote), { turnIndex: 0 })).closingNote).toBeUndefined()

      runnerMocks.runCorrectionForSession.mockResolvedValueOnce(okRunResult({
        strategy: 'prompt-regen',
        promptEdits: [{ messageId: 12, ref: '角色1', promptText: 'xx', editCount: 1 }]
      }))
      expect((await tool.execute(call(argsWithNote), { turnIndex: 0 })).closingNote).toBeUndefined()
    })

    it('纠偏 loop 失败（busy）：即使模型传了 closingNote 也不透传', async () => {
      runnerMocks.runCorrectionForSession.mockResolvedValueOnce({ ok: false, busy: true, message: '提调正忙：当前有聊天回复/提调轮在跑，等它结束后再下发。' })
      const tool = createDispatchTidiaoCorrectionTool(baseCtx())
      const result = await tool.execute(call(argsWithNote), { turnIndex: 0 })
      expect(result.closingNote).toBeUndefined()
    })

    it('confirmWrite 被拒：即使模型传了 closingNote 也不透传', async () => {
      const ctx = baseCtx({ confirmWrite: vi.fn(async () => false) })
      const tool = createDispatchTidiaoCorrectionTool(ctx)
      const result = await tool.execute(call(argsWithNote), { turnIndex: 0 })
      expect(result.details.denied).toBe(true)
      expect(result.closingNote).toBeUndefined()
      expect(runnerMocks.runCorrectionForSession).not.toHaveBeenCalled()
    })
  })
})

// 地图严谨协作与运行卡计划批1（2026-07-11）：纠偏轮本体不是 subagent runner，无 begin/end 埋点——
// 由 dispatchTidiaoCorrection 的执行体外层补埋，让浮坞「星依派出的每个agent都有卡」单点成立。
describe('dispatchTidiaoCorrection 运行卡埋点（批1）', () => {
  const dispatchArgs = { sessionId: SESSION_ID, targetMessageId: 12, instruction: '把晚风段改得收敛一点' }

  it('成功：begin/end 成对写入 subagentRunStatus（done+output=回执正文），并登记进「在飞登记」', async () => {
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    const result = await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(listXingyiDispatchRegistry()).toContainEqual({ sessionId: SESSION_ID, prefix: XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX })
    const runs = listSubagentRunStatuses(SESSION_ID, `${XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX}:`)
    expect(runs).toHaveLength(1)
    expect(runs[0].status.state).toBe('done')
    expect(runs[0].status.output).toBe(result.content)
    // 任务书首行可被 extractTidiaoCorrectionTaskTitle 抽出目标名（浮坞卡任务小标题用，契约同 huiyuSubagent 同款提取）
    expect(extractTidiaoCorrectionTaskTitle(runs[0].status.input)).toBe('薇尔莉特')
  })

  it('busy：如实转告态也要成对收尾（error 态+原因），不留悬挂 running 卡', async () => {
    runnerMocks.runCorrectionForSession.mockResolvedValueOnce({ ok: false, busy: true, message: '提调正忙：当前有聊天回复/提调轮在跑，等它结束后再下发。' })
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    const runs = listSubagentRunStatuses(SESSION_ID, `${XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX}:`)
    expect(runs).toHaveLength(1)
    expect(runs[0].status.state).toBe('error')
    expect(runs[0].status.error).toContain('提调正忙')
  })

  it('runner 抛错：end 为 error 态并带原因', async () => {
    runnerMocks.runCorrectionForSession.mockRejectedValueOnce(new Error('模型连接超时'))
    const tool = createDispatchTidiaoCorrectionTool(baseCtx())
    await tool.execute(call(dispatchArgs), { turnIndex: 0 })
    const runs = listSubagentRunStatuses(SESSION_ID, `${XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX}:`)
    expect(runs).toHaveLength(1)
    expect(runs[0].status.state).toBe('error')
    expect(runs[0].status.error).toContain('模型连接超时')
  })

  it('用户取消/会话楼层未命中：都没有真正派发，不产生任何运行卡也不登记', async () => {
    const cancelCtx = baseCtx({ confirmWrite: vi.fn(async () => false) })
    await createDispatchTidiaoCorrectionTool(cancelCtx).execute(call(dispatchArgs), { turnIndex: 0 })
    expect(listSubagentRunStatuses(SESSION_ID, `${XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX}:`)).toHaveLength(0)
    expect(listXingyiDispatchRegistry()).toHaveLength(0)

    repoMocks.fetchChatSessionBundleById.mockResolvedValueOnce({ session: null, messages: [] })
    await createDispatchTidiaoCorrectionTool(baseCtx()).execute(call(dispatchArgs), { turnIndex: 0 })
    expect(listSubagentRunStatuses(SESSION_ID, `${XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX}:`)).toHaveLength(0)
    expect(listXingyiDispatchRegistry()).toHaveLength(0)
  })
})

describe('createXingyiTidiaoDispatchTools（全家桶）', () => {
  it('装配四件：定位两只读 + dispatch + searchDirectorMemory（星依视角 brief）', () => {
    const tools = createXingyiTidiaoDispatchTools(baseCtx())
    expect(tools.map((tool) => tool.name)).toEqual([
      'listChatContacts', 'readChatSessionMessages', 'dispatchTidiaoCorrection', 'searchDirectorMemory'
    ])
    const memory = tools.find((tool) => tool.name === 'searchDirectorMemory')
    expect(memory.brief).toContain('最近一轮提调带')
  })
})
