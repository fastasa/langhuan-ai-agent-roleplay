import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  runXingyiAgent as runXingyiAgentImpl,
  shouldRequireXingyiWebSearch
} from '../../../src/app/xingyiAgentHarness.ts'
import {
  registerXingyiFunctionProvider,
  resetXingyiFunctionProvidersForTest
} from '../../../src/app/xingyiFunctionBridge.ts'
import {
  beginXingyiTurnStream,
  endXingyiTurnStream,
  resetXingyiTurnStreamForTest,
  xingyiTurnStreamState
} from '../../../src/app/xingyiTurnStreamState.ts'

afterEach(() => {
  resetXingyiFunctionProvidersForTest()
})

function nativeToolCall(name, args, id = 'call_1') {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

/** 让既有行为回归里的 mock 模型遵守 deferred 协议：低频工具先 toolsearch，下一轮再调用。 */
async function runXingyiAgent(input) {
  const originalCall = input.callOrchestrator
  let pendingResponse = null
  let searchSequence = 0
  return runXingyiAgentImpl({
    ...input,
    callOrchestrator: async (request) => {
      if (pendingResponse) {
        const response = pendingResponse
        pendingResponse = null
        return response
      }
      const response = await originalCall(request)
      const active = new Set((request.toolBriefs || []).map((tool) => tool.name))
      const requested = (response?.toolCalls || []).map((call) => String(call?.function?.name || call?.toolName || call?.name || '').trim()).filter(Boolean)
      const unavailable = [...new Set(requested.filter((name) => name !== 'toolsearch' && !active.has(name)))]
      if (!unavailable.length) return response
      pendingResponse = response
      searchSequence += 1
      return {
        content: `先查询 ${unavailable.join('、')} 的参数格式。`,
        toolCalls: [nativeToolCall('toolsearch', { query: unavailable.join(' ') }, `deferred-search-${searchSequence}`)]
      }
    }
  })
}

function catalogNames(request) {
  return (request.toolCatalog || []).map((tool) => tool.name)
}

describe('runXingyiAgent（陈星依总 agent harness·批次1）', () => {
  it('纯聊天：模型直接回自然文本 → 单轮收束、回复原样透出', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '诶嘿，星依在呢~', toolCalls: [] }))

    const result = await runXingyiAgent({ userText: '在吗', callOrchestrator })

    expect(result.reply).toBe('诶嘿，星依在呢~')
    expect(result.terminalReason).toBe('done')
    expect(callOrchestrator).toHaveBeenCalledTimes(1)
    const request = callOrchestrator.mock.calls[0][0]
    expect(request.messages[0].role).toBe('system')
    expect(request.messages[0].content).toContain('星依')
    expect(request.messages[0].content).toContain('默认直接称"你"或自然省略称呼')
    expect(request.messages[0].content).toContain('严谨只提高核验强度')
    expect(request.messages[0].content).toContain('开放问题的当前状态')
    expect(request.messages[0].content).toContain('绝不能在没有真实调用的情况下声称')
    expect(request.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '在吗' })
    ]))
    expect(request.messages.at(-1).content).toContain('【6·当前任务 TODO】')
  })

  it('星依只接收 xingyi recipe 渲染后的统一上下文，不再手拼世界投影', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '知道啦', toolCalls: [] }))

    await runXingyiAgent({
      userText: '看看现在的世界',
      agentContextBlock: '【统一上下文】\n当前世界：维斯珂',
      callOrchestrator
    })

    const system = callOrchestrator.mock.calls[0][0].messages[0].content
    expect(system.match(/【统一原始可见上下文】/g)).toHaveLength(1)
    expect(system).toContain('当前世界：维斯珂')
  })

  it('deferred 模式：首轮直接提供知识入口与内容拍板工具，其余授权工具只进目录', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))

    await runXingyiAgent({ userText: '你好', callOrchestrator })

    const request = callOrchestrator.mock.calls[0][0]
    expect(request.messages[0].content).toContain('【全局工具目录·越权可搜】')
    expect(request.messages[0].content).toContain('recallSemantic')
    expect(request.messages[0].content).toContain('searchWorldText')
    expect(request.messages[0].content).toContain('fetchUnitDetail')
    // manifest commonTools（知识三件套 + 三个专项 Skill 读取 + askUser）+ toolsearch 首轮带 schema；取料三件套只在目录。
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(briefNames).toEqual([
      'listXingyiKnowledgeTopics',
      'searchXingyiKnowledge',
      'readXingyiKnowledgeTopic',
      'readDocLibraryEditingSkill',
      'readPlayableWorldBuilderSkill',
      'readRelationHintSkill',
      'askUser',
      'writeTaskTodo',
      'updateTaskTodo',
      'toolsearch'
    ])
    expect(briefNames).not.toContain('recallSemantic')
    expect(request.messages[0].content).toContain('listXingyiKnowledgeTopics')
    expect(request.messages[0].content).toContain('readXingyiKnowledgeTopic')
  })

  it('批次1B：星依常驻 manifest Skill 目录，但缺显式 activation 时不加载正文', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))

    await runXingyiAgentImpl({ userText: '你好', callOrchestrator })

    const request = callOrchestrator.mock.calls[0][0]
    expect(request.messages[0].content).toContain('xingyi.knowledge-topics')
    expect(request.messages[0].content).toContain('星依知识专题')
    expect(request.messages.some((message) => String(message.content).includes('【4·已读资料】'))).toBe(false)
  })

  it('批次1B：显式 activation 携 selector 时，星依知识正文同次请求只进入层4', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '读完啦', toolCalls: [] }))

    await runXingyiAgentImpl({
      userText: '按这个专题继续',
      skillActivations: [{
        skillId: 'xingyi.knowledge-topics',
        activation: 'explicit_route',
        selector: '路由与知识补全::0.1 先拆四个槽位：资料源、操作对象、动作、写入目标',
        reason: 'slash_command'
      }],
      callOrchestrator
    })

    const request = callOrchestrator.mock.calls[0][0]
    const system = String(request.messages[0].content)
    const layer4 = request.messages.find((message) => String(message.content).includes('【4·已读资料】'))
    expect(system).toContain('xingyi.knowledge-topics')
    expect(system).not.toContain('【已读 Skill｜星依知识专题】')
    expect(layer4?.content).toContain('【已读 Skill｜星依知识专题】')
    expect(layer4?.content).toContain('资料源')
    expect(request.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '按这个专题继续' })
    ]))
  })

  it('批次1B：低频工具先只在 catalog，toolsearch 后下一轮才得到 schema', async () => {
    const requests = []
    let turn = 0
    await runXingyiAgentImpl({
      userText: '帮我查一下落雁谷',
      callOrchestrator: async (request) => {
        requests.push(request)
        turn += 1
        if (turn === 1) return { content: '先找取料工具。', toolCalls: [nativeToolCall('toolsearch', { query: 'recallSemantic' }, 's1')] }
        return { content: '已经拿到参数格式。', toolCalls: [] }
      }
    })

    expect(requests[0].toolBriefs.map((tool) => tool.name)).toEqual([
      'listXingyiKnowledgeTopics', 'searchXingyiKnowledge', 'readXingyiKnowledgeTopic',
      'readDocLibraryEditingSkill', 'readPlayableWorldBuilderSkill', 'readRelationHintSkill', 'askUser',
      'writeTaskTodo', 'updateTaskTodo', 'toolsearch'
    ])
    const catalogEntry = requests[0].toolCatalog.find((tool) => tool.name === 'recallSemantic')
    expect(catalogEntry).toMatchObject({ name: 'recallSemantic', recommended: false })
    expect(catalogEntry.brief).toBeTruthy()
    expect(requests[1].toolBriefs.map((tool) => tool.name)).toContain('recallSemantic')
  })

  it('批次2 功能工具四件已授权进目录，但首轮不带 schema', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))

    await runXingyiAgent({ userText: '你好', callOrchestrator })

    const request = callOrchestrator.mock.calls[0][0]
    const functionToolNames = ['generateCompilePage', 'optimizeUnitRelations', 'generateCharacter', 'summarizeChat']
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(catalogNames(request)).toEqual(expect.arrayContaining(functionToolNames))
    for (const name of functionToolNames) expect(briefNames).not.toContain(name)
    for (const name of functionToolNames) {
      expect(request.messages[0].content).toContain(name)
    }
  })

  it('剧本工作台接缝在场时装配 dispatchScriptwriter', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '帮我看看剧本质量',
      callOrchestrator,
      scriptwriterDispatch: { dispatch: vi.fn() }
    })
    const request = callOrchestrator.mock.calls[0][0]
    expect(catalogNames(request)).toContain('dispatchScriptwriter')
    expect(request.toolBriefs.map((brief) => brief.name)).not.toContain('dispatchScriptwriter')
    expect(request.messages[0].content).toContain('dispatchScriptwriter')
  })

  it('造册总览接缝在场时 dispatchZaoceStatusDesign 进入延迟工具目录，缺省不伪装可用', async () => {
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    expect(catalogNames(withoutSeam.mock.calls[0][0])).not.toContain('dispatchZaoceStatusDesign')

    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '给卡维安诸部重构人口和资源总览',
      callOrchestrator,
      zaoceStatusDesign: { dispatch: vi.fn() }
    })
    const request = callOrchestrator.mock.calls[0][0]
    expect(catalogNames(request)).toContain('dispatchZaoceStatusDesign')
    expect(request.toolBriefs.map((brief) => brief.name)).not.toContain('dispatchZaoceStatusDesign')
    expect(request.messages[0].content).toContain('dispatchZaoceStatusDesign')
  })

  it('toolsearch 命中 dispatchZaoceStatusDesign 后，下一轮真实激活它的 schema', async () => {
    const requests = []
    let turn = 0
    await runXingyiAgentImpl({
      userText: '把卡维安诸部的人口和资源改成合适图表',
      zaoceStatusDesign: { dispatch: vi.fn() },
      callOrchestrator: async (request) => {
        requests.push(request)
        turn += 1
        if (turn === 1) {
          return {
            content: '先取得造册总览派发参数。',
            toolCalls: [nativeToolCall('toolsearch', { query: '状态栏 造册 人口 资源 图表 总览' }, 'zaoce-search')]
          }
        }
        return { content: '参数已取得。', toolCalls: [] }
      }
    })
    expect(requests[0].toolBriefs.map((tool) => tool.name)).not.toContain('dispatchZaoceStatusDesign')
    expect(requests[1].toolBriefs.map((tool) => tool.name)).toContain('dispatchZaoceStatusDesign')
    expect(requests[1].toolBriefs.find((tool) => tool.name === 'dispatchZaoceStatusDesign')?.schema?.properties).not.toHaveProperty('presentation')
  })

  it('批次3b：tidiaoDispatch 接缝在场时指挥提调四件装配进池（缺省不装配）', async () => {
    const dispatchToolNames = ['listChatContacts', 'readChatSessionMessages', 'dispatchTidiaoCorrection', 'searchDirectorMemory']
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    const bareCatalog = catalogNames(withoutSeam.mock.calls[0][0])
    for (const name of dispatchToolNames) expect(bareCatalog).not.toContain(name)

    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '你好',
      callOrchestrator,
      tidiaoDispatch: {
        runnerDeps: { hasRunningChatRound: () => false, callAIWithTools: vi.fn(), loadAgentConfig: () => null },
        listChatContacts: () => []
      }
    })
    const request = callOrchestrator.mock.calls[0][0]
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(catalogNames(request)).toEqual(expect.arrayContaining(dispatchToolNames))
    for (const name of dispatchToolNames) expect(briefNames).not.toContain(name)
    for (const name of dispatchToolNames) {
      expect(request.messages[0].content).toContain(name)
    }
  })

  it('当前帷幕接缝在场时，toolsearch 能按“修改当前帷幕 时间 地点”发现并真实调用 updateCurtainScene', async () => {
    const requests = []
    const updateCurtainScene = vi.fn(async () => ({
      changed: true,
      notice: '当前会话帷幕已更新。',
      patch: { virtualTime: '霜月初七，黄昏将尽', virtualLocation: '博瑞利尔王国 / 博瑞利尔城 / 北门广场' }
    }))
    let turn = 0
    await runXingyiAgentImpl({
      userText: '修改当前帷幕，设置一个合理的时间、地点用作故事的开场',
      confirmWrite: vi.fn(async () => true),
      curtainScene: {
        resolveCurrentSession: () => ({
          sessionId: 'session_1',
          targetId: 'group_1',
          label: '北门故事',
          session: { id: 'session_1' }
        }),
        updateCurtainScene
      },
      callOrchestrator: async (request) => {
        requests.push(request)
        turn += 1
        if (turn === 1) {
          return {
            content: '先找当前帷幕写入工具。',
            toolCalls: [nativeToolCall('toolsearch', { query: '修改当前会话帷幕 设置开场时间地点' }, 'curtain-search')]
          }
        }
        if (turn === 2) {
          return {
            content: '已经找到正式入口，现在写入。',
            toolCalls: [nativeToolCall('updateCurtainScene', {
              targetTime: '霜月初七，黄昏将尽',
              locationLarge: '博瑞利尔王国',
              locationMiddle: '博瑞利尔城',
              locationSmall: '北门广场',
              reason: '设置故事开场'
            }, 'curtain-write')]
          }
        }
        return { content: '已经把开场帷幕设好啦。', toolCalls: [] }
      }
    })

    expect(requests[0].toolBriefs.map((tool) => tool.name)).not.toContain('updateCurtainScene')
    expect(catalogNames(requests[0])).toContain('updateCurtainScene')
    expect(requests[1].toolBriefs.map((tool) => tool.name)).toContain('updateCurtainScene')
    expect(updateCurtainScene).toHaveBeenCalledTimes(1)
  })

  it('地图系统批6：mapWork 接缝在场时 dispatchMapWork 装配进池（缺省不装配）', async () => {
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    expect(catalogNames(withoutSeam.mock.calls[0][0])).not.toContain('dispatchMapWork')

    const dispatch = vi.fn(async () => ({ content: '绘舆已交稿', ok: true }))
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '你好',
      callOrchestrator,
      mapWork: { dispatch }
    })
    const request = callOrchestrator.mock.calls[0][0]
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(catalogNames(request)).toContain('dispatchMapWork')
    expect(briefNames).not.toContain('dispatchMapWork')
    expect(request.messages[0].content).toContain('dispatchMapWork')
  })

  it('星依世界寻址与删除批（2026-07-14）：mapWork 接缝在场时 listWorlds/readWorldMap/deleteMapFeatures 随 dispatchMapWork 一并装配（缺省不装配）', async () => {
    const worldToolNames = ['listWorlds', 'readWorldMap', 'deleteMapFeatures']
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    const bareCatalog = catalogNames(withoutSeam.mock.calls[0][0])
    for (const name of worldToolNames) expect(bareCatalog).not.toContain(name)

    const dispatch = vi.fn(async () => ({ content: '绘舆已交稿', ok: true }))
    const dispatchToWorld = vi.fn(async () => ({ content: '世界直达已交稿', ok: true }))
    const listWorlds = vi.fn(async () => [])
    const readWorldMapSummary = vi.fn(async () => '')
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '你好',
      callOrchestrator,
      mapWork: { dispatch, dispatchToWorld, listWorlds, readWorldMapSummary }
    })
    const request = callOrchestrator.mock.calls[0][0]
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    for (const name of worldToolNames) {
      expect(catalogNames(request)).toContain(name)
      expect(briefNames).not.toContain(name)
      expect(request.messages[0].content).toContain(name)
    }
  })

  it('地图严谨协作与运行卡计划批2：research 接缝在场时 dispatchResearch 装配进池（缺省不装配）', async () => {
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    expect(catalogNames(withoutSeam.mock.calls[0][0])).not.toContain('dispatchResearch')

    const dispatch = vi.fn(async () => ({ content: '采风已交稿', ok: true }))
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '你好',
      callOrchestrator,
      research: { dispatch }
    })
    const request = callOrchestrator.mock.calls[0][0]
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(catalogNames(request)).toContain('dispatchResearch')
    expect(briefNames).not.toContain('dispatchResearch')
    expect(request.messages[0].content).toContain('dispatchResearch')
  })

  it('批次4：personality 接缝在场时角色人格两件装配进池（缺省不装配）', async () => {
    const personalityToolNames = ['calibratePersonality', 'generateTrainingQuestionnaire']
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    const bareCatalog = catalogNames(withoutSeam.mock.calls[0][0])
    for (const name of personalityToolNames) expect(bareCatalog).not.toContain(name)

    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '你好',
      callOrchestrator,
      personality: {
        callAI: vi.fn(),
        loadAgentConfig: () => null,
        listCharacters: () => [],
        readCharacter: () => null,
        updateCharacterPersonality: vi.fn()
      }
    })
    const request = callOrchestrator.mock.calls[0][0]
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(catalogNames(request)).toEqual(expect.arrayContaining(personalityToolNames))
    for (const name of personalityToolNames) expect(briefNames).not.toContain(name)
    for (const name of personalityToolNames) {
      expect(request.messages[0].content).toContain(name)
    }
  })

  it('用户资料与马甲接缝在场时 readUserProfile 和马甲四件套一并装配', async () => {
    const toolNames = ['readUserProfile', 'listAliases', 'upsertAlias', 'deleteAlias', 'switchAlias']
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({
      userText: '你好',
      callOrchestrator,
      aliasManage: {
        provider: {
          getUserProfile: () => ({ name: '沈志雄', appearance: '短黑发' }),
          listAliases: () => [],
          createAlias: vi.fn(),
          updateAlias: vi.fn(),
          deleteAlias: vi.fn(),
          bindSessionAlias: vi.fn(),
          getActiveSessionBoundAliasId: () => null
        }
      }
    })
    const request = callOrchestrator.mock.calls[0][0]
    const briefNames = request.toolBriefs.map((brief) => brief.name)
    expect(catalogNames(request)).toEqual(expect.arrayContaining(toolNames))
    for (const name of toolNames) expect(briefNames).not.toContain(name)
    for (const name of toolNames) expect(request.messages[0].content).toContain(name)
  })

  it('viewAvatar 读取正式头像后，只在紧随工具结果的下一轮注入带归属标签的原生图片', async () => {
    const requests = []
    let turn = 0
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const result = await runXingyiAgent({
      userText: '看看我的头像是什么样的',
      conversationAvatar: {
        listCharacters: () => [],
        listAliases: () => [],
        listSessions: () => [],
        getCurrentSession: () => null,
        getUser: () => ({ id: 'user_profile', name: '沈一' }),
        readAvatar: vi.fn(async () => ({ dataUrl, label: '用户「沈一」头像' })),
        createConversation: vi.fn(),
        assignAvatar: vi.fn()
      },
      callOrchestrator: async (request) => {
        requests.push(request)
        turn += 1
        if (turn === 1) {
          return {
            content: '先读取正式头像。',
            toolCalls: [nativeToolCall('viewAvatar', { targetKind: 'user' }, 'view-avatar-user')]
          }
        }
        return { content: '看到了，这是用户当前的正式头像。', toolCalls: [] }
      }
    })

    expect(result.reply).toBe('看到了，这是用户当前的正式头像。')
    expect(catalogNames(requests[0])).toContain('viewAvatar')
    const imageMessage = requests[1].messages.find((message) => (
      message.role === 'user' && Array.isArray(message.content)
      && message.content.some((part) => part.type === 'image_url')
    ))
    expect(imageMessage).toBeTruthy()
    expect(imageMessage.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('用户「沈一」头像') }),
      { type: 'image_url', image_url: { url: dataUrl } }
    ]))
    const toolMessage = requests[1].messages.find((message) => message.role === 'tool' && message.tool_call_id === 'view-avatar-user')
    expect(toolMessage.content).not.toContain('data:image')
  })

  it('内容拍板安全门：askUser 始终装配并在首轮直接提供 schema（不依赖接缝在场）', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator })
    const request = callOrchestrator.mock.calls[0][0]
    expect(catalogNames(request)).toContain('askUser')
    expect(request.toolBriefs.map((brief) => brief.name)).toContain('askUser')
  })

  it('scope 批：confirmStatusScope 确认取料范围工具始终装配进池（不依赖接缝在场）', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator })
    const request = callOrchestrator.mock.calls[0][0]
    expect(catalogNames(request)).toContain('confirmStatusScope')
    expect(request.toolBriefs.map((brief) => brief.name)).not.toContain('confirmStatusScope')
  })

  it('Codex 生图接缝在场才装配单图与批量生图，并把真实附件带到本轮结果', async () => {
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    expect(withoutSeam.mock.calls[0][0].toolBriefs.map((brief) => brief.name)).not.toContain('generateImage')
    expect(catalogNames(withoutSeam.mock.calls[0][0])).not.toContain('generateImagesBatch')

    const attachment = {
      id: 'chat_gen_1', kind: 'image', url: '/chat-images/chat_gen_1.png', mime: 'image/png',
      caption: '月下白猫', captionStatus: 'done'
    }
    const generate = vi.fn(async () => attachment)
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({ content: '', toolCalls: [nativeToolCall('generateImage', { prompt: '月下的白猫，电影感' })] })
      .mockResolvedValueOnce({ content: '画好啦，你看看嘛~', toolCalls: [] })

    const result = await runXingyiAgent({ userText: '给我画一只月下白猫', callOrchestrator, imageGeneration: { generate } })

    expect(generate).toHaveBeenCalledWith('月下的白猫，电影感', undefined)
    expect(result.reply).toBe('画好啦，你看看嘛~')
    expect(result.attachments).toEqual([attachment])
    expect(catalogNames(callOrchestrator.mock.calls[0][0])).toContain('generateImage')
    expect(catalogNames(callOrchestrator.mock.calls[0][0])).toContain('generateImagesBatch')
    expect(callOrchestrator.mock.calls[0][0].toolBriefs.map((brief) => brief.name)).toEqual(expect.arrayContaining([
      'generateImage', 'generateImagesBatch'
    ]))
    expect(callOrchestrator.mock.calls[1][0].messages.some(
      (message) => message.role === 'tool' && String(message.content || '').includes('图片已经真实生成')
    )).toBe(true)
  })

  it('一句多图请求由 generateImagesBatch 一次调用生成三张，并合并进同一轮附件', async () => {
    const generate = vi.fn(async (prompt) => ({
      id: `img_${prompt}`, kind: 'image', url: `/chat-images/${prompt}.png`, mime: 'image/png'
    }))
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({ content: '', toolCalls: [nativeToolCall('generateImagesBatch', {
        images: [{ prompt: '春日庭院' }, { prompt: '夏夜海边' }, { prompt: '秋日山林' }]
      })] })
      .mockResolvedValueOnce({ content: '三张都画好啦~', toolCalls: [] })

    const result = await runXingyiAgent({ userText: '一次给我三张四季主题图', callOrchestrator, imageGeneration: { generate } })

    expect(generate).toHaveBeenCalledTimes(3)
    expect(result.attachments.map((item) => item.id)).toEqual(['img_春日庭院', 'img_夏夜海边', 'img_秋日山林'])
    expect(result.reply).toBe('三张都画好啦~')
  })

  it('会话成员接缝在场才装配增删、概率与版本工具，并能把 0% 写回正式成员真值', async () => {
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    expect(catalogNames(withoutSeam.mock.calls[0][0])).not.toContain('setConversationMemberProbabilities')

    let members = [{
      participantId: 'p1', characterId: 'char_1', name: '惊雨', displayOrder: 0,
      replyProbability: 80, role: 'member', characterStateMode: 'follow_main'
    }]
    const replaceMembers = vi.fn(async (_sessionId, next) => { members = next })
    const conversationMembers = {
      listCharacters: () => [{ id: 'char_1', name: '惊雨' }],
      readMembers: vi.fn(async () => members),
      replaceMembers,
      listCharacterVersions: vi.fn(async () => []),
      createCharacterVersion: vi.fn()
    }
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({ content: '', toolCalls: [nativeToolCall('setConversationMemberProbabilities', {
        session: 'session_1', probabilities: [{ character: '惊雨', probability: 0 }]
      })] })
      .mockResolvedValueOnce({ content: '已经调成不主动发言啦。', toolCalls: [] })

    const result = await runXingyiAgent({
      userText: '把惊雨在这个对话里的发言概率调成 0',
      callOrchestrator,
      conversationMembers,
      resolveSessionContext: vi.fn(async () => ({
        sessionId: 'session_1', sessionTitle: '雨夜茶会', characterOptions: [{ id: 'char_1', name: '惊雨', participantId: 'p1' }]
      })),
      confirmWrite: vi.fn(async () => true)
    })

    expect(catalogNames(callOrchestrator.mock.calls[0][0])).toEqual(expect.arrayContaining([
      'addCharactersToConversation', 'removeCharactersFromConversation', 'setConversationMemberProbabilities',
      'listCharacterVersions', 'createCharacterVersion', 'switchConversationCharacterVersion'
    ]))
    expect(replaceMembers).toHaveBeenCalledOnce()
    expect(members[0].replyProbability).toBe(0)
    expect(result.reply).toContain('不主动发言')
  })

  it('Codex 联网接缝在场才把 searchWeb 作为首轮 common tool，并回灌带来源结果', async () => {
    const withoutSeam = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
    await runXingyiAgent({ userText: '你好', callOrchestrator: withoutSeam })
    expect(catalogNames(withoutSeam.mock.calls[0][0])).not.toContain('searchWeb')
    expect(withoutSeam.mock.calls[0][0].toolBriefs.map((brief) => brief.name)).not.toContain('searchWeb')

    const search = vi.fn(async () => ({
      answer: '现在是最新版本。',
      sources: [{ title: '官方资料', url: 'https://example.com/latest' }]
    }))
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({ content: '', toolCalls: [nativeToolCall('searchWeb', { query: '最新版本' })] })
      .mockResolvedValueOnce({ content: '查到啦，来源也附上了。', toolCalls: [] })

    const result = await runXingyiAgent({ userText: '联网查最新版本', callOrchestrator, webSearch: { search } })

    expect(search).toHaveBeenCalledWith('最新版本', undefined)
    expect(result.reply).toContain('来源')
    expect(catalogNames(callOrchestrator.mock.calls[0][0])).toContain('searchWeb')
    expect(callOrchestrator.mock.calls[0][0].toolBriefs.map((brief) => brief.name)).toContain('searchWeb')
    expect(callOrchestrator.mock.calls[1][0].messages.some(
      (message) => message.role === 'tool' && String(message.content || '').includes('https://example.com/latest')
    )).toBe(true)
  })

  it('用户明确要求联网时首轮强制 searchWeb，工具结果回来后恢复模型自行判断', async () => {
    const search = vi.fn(async () => ({
      answer: '这段公式出自一个已有构造的讨论。',
      sources: [{ title: 'Jacobian conjecture reference', url: 'https://example.com/jacobian' }]
    }))
    const callOrchestrator = vi.fn()
      .mockImplementationOnce(async (request) => {
        expect(request.toolChoice).toEqual({ type: 'function', function: { name: 'searchWeb' } })
        return {
          content: '',
          toolCalls: [nativeToolCall('searchWeb', { query: 'Jacobian conjecture det -2 non-injective formula' })]
        }
      })
      .mockImplementationOnce(async (request) => {
        expect(request.toolChoice).toBeUndefined()
        return { content: '搜到出处啦，难怪你一直笑星依嘛！', toolCalls: [] }
      })

    const result = await runXingyiAgent({
      userText: '你去网上搜索一下这个猜想相关资料',
      callOrchestrator,
      webSearch: { search }
    })

    expect(search).toHaveBeenCalledOnce()
    expect(result.reply).toContain('搜到出处')
  })

  it('公网强制搜索只识别明确联网意图，不把普通闲聊或内部资料检索一律变成公网请求', () => {
    expect(shouldRequireXingyiWebSearch('你联网搜一下这个公式')).toBe(true)
    expect(shouldRequireXingyiWebSearch('打开 https://example.com 看看')).toBe(true)
    expect(shouldRequireXingyiWebSearch('星依，你知道雅可比猜想吗')).toBe(false)
    expect(shouldRequireXingyiWebSearch('帮我搜索文档库里的维斯珂')).toBe(false)
    expect(shouldRequireXingyiWebSearch('联网搜索能力为什么没调用')).toBe(false)
    expect(shouldRequireXingyiWebSearch('这次不要联网搜索')).toBe(false)
  })

  it('文档库专项 Skill 读取工具常驻 schema，正文只在调用后进入工具结果', async () => {
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({ content: '', toolCalls: [nativeToolCall('readDocLibraryEditingSkill', {})] })
      .mockResolvedValueOnce({ content: '已经按手册核对好边界。', toolCalls: [] })

    await runXingyiAgentImpl({ userText: '我要编辑文档库', callOrchestrator })

    expect(callOrchestrator.mock.calls[0][0].toolBriefs.map((brief) => brief.name)).toContain('readDocLibraryEditingSkill')
    expect(callOrchestrator.mock.calls[0][0].messages[0].content).toContain('xingyi.doc-library-editing')
    const toolMessage = callOrchestrator.mock.calls[1][0].messages.find((message) => message.role === 'tool')
    expect(toolMessage.content).toContain('文档库是本机工作区级的全局资料树')
    expect(toolMessage.content).toContain('index.md')
  })

  it('关系提示专项 Skill 常驻 schema，读取结果带代码真值生成的谓词附录', async () => {
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({ content: '', toolCalls: [nativeToolCall('readRelationHintSkill', {})] })
      .mockResolvedValueOnce({ content: '已经按现役谓词和证据规则核对。', toolCalls: [] })

    await runXingyiAgentImpl({ userText: '我要修关系提示', callOrchestrator })

    expect(callOrchestrator.mock.calls[0][0].toolBriefs.map((brief) => brief.name)).toContain('readRelationHintSkill')
    expect(callOrchestrator.mock.calls[0][0].messages[0].content).toContain('xingyi.relation-hint-authoring')
    const toolMessage = callOrchestrator.mock.calls[1][0].messages.find((message) => message.role === 'tool')
    expect(toolMessage.content).toContain('运行时合法谓词附录')
    expect(toolMessage.content).toContain('正向词')
  })

  it('写工具未注入 confirmWrite：硬门拒绝执行并回灌错误，loop 不崩、provider 不被调', async () => {
    const provider = { generateCharacter: vi.fn(async () => ({ ok: true, message: 'x' })) }
    registerXingyiFunctionProvider('characterCreate', provider)
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [nativeToolCall('generateCharacter', { brief: '一个武僧' })]
      })
      .mockResolvedValueOnce({ content: '这个能力现在执行不了哦。', toolCalls: [] })

    const result = await runXingyiAgent({ userText: '帮我生成个角色', callOrchestrator })

    expect(result.terminalReason).toBe('done')
    expect(result.reply).toBe('这个能力现在执行不了哦。')
    expect(provider.generateCharacter).not.toHaveBeenCalled()
    const secondRequest = callOrchestrator.mock.calls[1][0]
    const toolMessage = secondRequest.messages.find((message) => message.role === 'tool' && String(message.content || '').includes('确认通道未接入'))
    expect(String(toolMessage?.content || '')).toContain('确认通道未接入')
  })

  it('连续工作护栏：空转但正文说"稍等我这就去查"→注入续做提示并续轮，不停在半路', async () => {
    const intermediate = vi.fn()
    const callOrchestrator = vi.fn()
      // 第一轮：只说话不调工具，且带"继续意图"话术 → 护栏应注入续做提示并续轮，而不是收束
      .mockResolvedValueOnce({ content: '好嘞，稍等一下，我这就去查一下资料哦~', toolCalls: [] })
      // 第二轮：真正给最终答复（无继续意图）→ 正常收束
      .mockResolvedValueOnce({ content: '查好啦，文档库里没有相关记载哦。', toolCalls: [] })

    const result = await runXingyiAgent({
      userText: '帮我查下落雁谷',
      callOrchestrator,
      onIntermediateMessage: intermediate
    })

    // 关键：没有停在第一轮，续轮了（旧内核会在第一轮空转直接收束、只调 1 次）
    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(result.reply).toBe('查好啦，文档库里没有相关记载哦。')
    expect(result.terminalReason).toBe('done')
    expect(intermediate).toHaveBeenCalledWith({
      content: '好嘞，稍等一下，我这就去查一下资料哦~',
      turnIndex: 0
    })
    // 第二轮请求里带上了护栏注入的续做提示（user 消息）
    const secondRequest = callOrchestrator.mock.calls[1][0]
    expect(secondRequest.messages.some(
      (message) => message.role === 'user' && String(message.content || '').includes('没有真正调用任何工具')
    )).toBe(true)
  })

  it('纯聊天不误伤：正常自然文本回复（无继续意图）仍单轮收束', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '诶嘿，星依在呢~今天想聊点什么呀？', toolCalls: [] }))
    const result = await runXingyiAgent({ userText: '在吗', callOrchestrator })
    expect(callOrchestrator).toHaveBeenCalledTimes(1)
    expect(result.terminalReason).toBe('done')
  })

  it('工具轮：原生 searchWorldText 调用执行后结果回灌，下一轮的正文作为最终回复', async () => {
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({ thought: '先查一下资料' }),
        toolCalls: [nativeToolCall('searchWorldText', { query: '落雁谷' })]
      })
      .mockResolvedValueOnce({ content: '星依查过啦，文档库里没有「落雁谷」的记载哦。', toolCalls: [] })

    const events = []
    const result = await runXingyiAgent({
      userText: '落雁谷是什么地方？',
      callOrchestrator,
      onProgress: (event) => events.push(event)
    })

    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(result.reply).toBe('星依查过啦，文档库里没有「落雁谷」的记载哦。')
    expect(result.terminalReason).toBe('done')
    // 第二轮请求里必须带工具结果回灌（role:'tool' 与 tool_calls 原生配对）
    const secondRequest = callOrchestrator.mock.calls[1][0]
    expect(secondRequest.messages.some((message) => message.role === 'tool')).toBe(true)
    // 过程轨上报了工具开始与结果
    expect(events.some((event) => event.kind === 'tool-start' && event.toolName === 'searchWorldText')).toBe(true)
    expect(events.some((event) => event.kind === 'tool-result' && event.toolName === 'searchWorldText')).toBe(true)
  })

  // 输入框图片上传计划批5（星依浮坞接线）：当轮原生图 parts 升级 + 历史转述 note。
  describe('批5：图片附件（当轮 parts 升级 + 历史文字 note）', () => {
    it('当轮附件升级为 image parts、文字后追加转述 note，普通无工具聊天轮也生效', async () => {
      const callOrchestrator = vi.fn(async () => ({ content: '看到啦，是一只猫猫呢~', toolCalls: [] }))
      const attachments = [{ id: 'att1', kind: 'image', url: '/chat-images/cat.png', mime: 'image/png', caption: '一只橘猫', captionStatus: 'done' }]

      const result = await runXingyiAgent({ userText: '看看这张图', callOrchestrator, attachments })

      expect(result.reply).toBe('看到啦，是一只猫猫呢~')
      const request = callOrchestrator.mock.calls[0][0]
      const userMessage = request.messages.find((message) => Array.isArray(message.content))
      expect(userMessage.role).toBe('user')
      expect(Array.isArray(userMessage.content)).toBe(true)
      expect(userMessage.content[0]).toMatchObject({ type: 'text' })
      expect(userMessage.content[0].text).toContain('看看这张图')
      expect(userMessage.content[0].text).toContain('[图片1：一只橘猫]')
      expect(userMessage.content[1]).toEqual({ type: 'image_url', image_url: { url: '/chat-images/cat.png' } })
    })

    it('无附件时 messages 不受影响（content 仍是纯字符串，行为零回归）', async () => {
      const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
      await runXingyiAgent({ userText: '在吗', callOrchestrator })
      const request = callOrchestrator.mock.calls[0][0]
      const userMessage = request.messages.find((message) => message.role === 'user' && message.content === '在吗')
      expect(userMessage).toMatchObject({ role: 'user', content: '在吗' })
      expect(request.messages.at(-1).content).toContain('【6·当前任务 TODO】')
    })

    it('多轮续做提示不会劫持当轮图片：parts 始终落在构造时固定下标的真实用户消息上', async () => {
      const attachments = [{ id: 'att1', kind: 'image', url: '/chat-images/x.png', mime: 'image/png' }]
      const callOrchestrator = vi.fn()
        // 第一轮：空转但正文说继续意图 → 触发连续工作护栏续轮（护栏会 injectMessages 一条新的 role:'user' 续做提示）
        .mockResolvedValueOnce({ content: '好嘞，稍等一下，我这就去查一下资料哦~', toolCalls: [] })
        .mockResolvedValueOnce({ content: '查好啦~', toolCalls: [] })

      const result = await runXingyiAgent({ userText: '帮我查下这张图里的地名', callOrchestrator, attachments })

      expect(callOrchestrator).toHaveBeenCalledTimes(2)
      expect(result.reply).toBe('查好啦~')

      // 第一轮：真实用户消息（固定下标1=1个system+0段history）带 parts
      const firstRequest = callOrchestrator.mock.calls[0][0]
      expect(Array.isArray(firstRequest.messages[1].content)).toBe(true)

      // 第二轮：续做提示已经作为新的 role:'user' 消息注入进 messages，但真实用户消息（同一固定下标1）
      // 依然是带 parts 的版本——不会被"最后一条 role:'user' 消息"的启发式劫持到续做提示上。
      const secondRequest = callOrchestrator.mock.calls[1][0]
      const nudgeMessages = secondRequest.messages.filter(
        (message) => message.role === 'user' && typeof message.content === 'string' && message.content.includes('没有真正调用任何工具')
      )
      expect(nudgeMessages.length).toBeGreaterThan(0)
      expect(Array.isArray(secondRequest.messages[1].content)).toBe(true)
      expect(secondRequest.messages[1].content[0].text).toContain('帮我查下这张图里的地名')
    })

    it('历史消息带附件时只追加文字 note，不带原生图（XingyiHistoryMessage.content 保持 string）', async () => {
      const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
      const history = [
        {
          role: 'user',
          content: '早点的截图给你',
          attachments: [{ id: 'h1', kind: 'image', url: '/chat-images/h.png', mime: 'image/png', caption: '一片风景', captionStatus: 'done' }]
        },
        { role: 'assistant', content: '看到啦' }
      ]

      await runXingyiAgent({ userText: '继续', callOrchestrator, history })

      const request = callOrchestrator.mock.calls[0][0]
      // 下标：0=system，1=history[0]（带附件的历史 user），2=history[1]，3=当轮 user
      const historyUserMessage = request.messages[1]
      expect(typeof historyUserMessage.content).toBe('string')
      expect(historyUserMessage.content).toContain('早点的截图给你')
      expect(historyUserMessage.content).toContain('[图片1：一片风景]')
      // 当轮消息本身没有附件，不受影响，仍是纯字符串
      expect(typeof request.messages[3].content).toBe('string')
    })
  })

  // ⑥星依侧同构（2026-07-12 耗时归因错位修复）：callModel 包装在真正调用 input.callOrchestrator 之前
  // 主动打轮标记 + 追加「模型思考」未定行（与 subagentLoop.ts trackedCallModel 同构），返回/抛错后落定。
  describe('工作流时间线归因修复：callModel 前置轮标记 + 「模型思考」行（与 subagentLoop 同构）', () => {
    beforeEach(() => resetXingyiTurnStreamForTest())

    it('调用前已打轮标记+「模型思考」未定行，调用期间可见；返回后落定 success 且带耗时', async () => {
      beginXingyiTurnStream()
      const callOrchestrator = vi.fn(async () => {
        // 断言：进入 callOrchestrator 时，轮标记与「模型思考」未定行已经打好（前置埋点，不是事后靠 onProgress 补）
        const snapshot = xingyiTurnStreamState.entries.map((e) => ({ kind: e.kind, label: e.label, status: e.status }))
        expect(snapshot).toEqual([
          { kind: 'turn', label: '第 1 轮', status: undefined },
          { kind: 'tool', label: '模型思考', status: undefined }
        ])
        return { content: '好哒', toolCalls: [] }
      })
      await runXingyiAgent({ userText: '你好', callOrchestrator })
      const thinkEntry = xingyiTurnStreamState.entries.find((e) => e.kind === 'tool' && e.label === '模型思考')
      expect(thinkEntry.status).toBe('success')
      expect(typeof thinkEntry.durationMs).toBe('number')
      endXingyiTurnStream()
    })

    it('callOrchestrator 抛错 → 「模型思考」行落定为 error，错误原样上抛给调用方', async () => {
      beginXingyiTurnStream()
      const callOrchestrator = vi.fn(async () => { throw new Error('模型挂了') })
      await expect(runXingyiAgent({ userText: '你好', callOrchestrator })).rejects.toThrow('模型挂了')
      const thinkEntry = xingyiTurnStreamState.entries.find((e) => e.kind === 'tool' && e.label === '模型思考')
      expect(thinkEntry.status).toBe('error')
      endXingyiTurnStream()
    })

    it('未 beginXingyiTurnStream（running=false）时不写入流水，不影响 runXingyiAgent 正常返回', async () => {
      const callOrchestrator = vi.fn(async () => ({ content: '好哒', toolCalls: [] }))
      const result = await runXingyiAgent({ userText: '你好', callOrchestrator })
      expect(result.reply).toBe('好哒')
      expect(xingyiTurnStreamState.entries).toHaveLength(0)
    })
  })
})
