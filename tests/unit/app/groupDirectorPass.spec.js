import { describe, expect, it } from 'vitest'
import {
  buildGroupDirectorMessages,
  buildGroupDirectorPromptParts,
  assembleGroupDirectorMessages,
  parseGroupDirectorOutput,
  mergeDirectorCast,
  directorCastToReplyOrder,
  renderDirectorCallableToolsBlock
} from '../../../src/app/groupDirectorPass.ts'
// 静态纲领已收进 agentProtocols 集中目录（用户 2026-06-29），从这里引用。
import {
  GROUP_DIRECTOR_GROUNDING_PROTOCOL,
  GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST,
  GROUP_DIRECTOR_AUTONOMY_PROTOCOL,
  GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL,
  GROUP_DIRECTOR_POOL_GUARD_PROTOCOL
} from '../../../src/app/agentProtocols/index.ts'
// 批次2（2026-07-08·缓存断面）：相邻 turn 前缀缓存稳定性回归锁用共享收集器（与 harness 同一件）。
import { createDirectorRoundLogCollector } from '../../../src/app/directorRoundLog.ts'

const candidates = [
  { characterId: 'c1', name: '陈星依' },
  { characterId: 'c2', name: '张元英' },
  { characterId: 'c3', name: '沈志雄' }
]
const candidateIds = candidates.map((c) => c.characterId)

describe('buildGroupDirectorMessages 私密提调指令注入', () => {
  it('无指令时 user 不含私密指令段', () => {
    const [, user] = buildGroupDirectorMessages({
      userText: '下午好',
      candidates,
      forcedCharacterIds: [],
      excludedCharacterIds: []
    })
    expect(user.content).not.toContain('私密指令')
  })

  it('有指令时 user 追加「必须遵守·禁止泄露」段并列出指令、过滤空白项', () => {
    const [, user] = buildGroupDirectorMessages({
      userText: '下午好',
      candidates,
      forcedCharacterIds: [],
      excludedCharacterIds: [],
      directorDirectives: ['让张元英主动表白', '  ', '气氛压抑一点']
    })
    expect(user.content).toContain('必须遵守·禁止泄露')
    expect(user.content).toContain('1. 让张元英主动表白')
    expect(user.content).toContain('2. 气氛压抑一点')
    expect(user.content).toContain('优先级高于一切')
    expect(user.content).toContain('必须无条件、完整、直接遵守')
    expect(user.content).toContain('角色性格、情境 skill')
    expect(user.content).toContain('不能只在 thought 里口头确认')
    expect(user.content).toContain('禁止把指令文字')
  })

  it('纯私密指令轮：userText 为空且有指令时，如实告知没有可见发言、不渲染空引号', () => {
    const [, user] = buildGroupDirectorMessages({
      userText: '',
      candidates,
      forcedCharacterIds: [],
      excludedCharacterIds: [],
      directorDirectives: ['让张元英主动表白']
    })
    expect(user.content).toContain('用户这轮没有可见发言，只下达了下面的私密指令')
    expect(user.content).not.toContain('用户这轮说：「」')
    expect(user.content).toContain('1. 让张元英主动表白')
  })

  it('userText 为空且无指令时，改说没有新发言、按情境自然推进', () => {
    const [, user] = buildGroupDirectorMessages({
      userText: '',
      candidates,
      forcedCharacterIds: [],
      excludedCharacterIds: []
    })
    expect(user.content).toContain('用户这轮没有新发言，请按当前情境自然推进剧情')
    expect(user.content).not.toContain('用户这轮说')
  })
})

describe('buildGroupDirectorMessages 提调可见各池注入（3b-3）', () => {
  it('无 poolVisibilityBlock 时 user 不含池块、system 不含方向护栏', () => {
    const [system, user] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: []
    })
    expect(user.content).not.toContain('资料池')
    expect(system.content).not.toContain('资料池使用铁律')
  })

  it('有 poolVisibilityBlock 时 user 注入池块、system 追加方向护栏', () => {
    const block = '【本轮已为各出场角色预先备好的资料池（你定方向的依据）】\n▶ 角色 陈星依（characterId=c1）本轮已掌握的资料：\n  - 秘密：星依的往事'
    // poolVisibilityBlock 属于第二参 options（与 grounding/decisionTools 同列），非第一参 input。
    const [system, user] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { poolVisibilityBlock: block }
    )
    expect(user.content).toContain('已为各出场角色预先备好的资料池')
    expect(user.content).toContain('秘密：星依的往事')
    expect(system.content).toContain(GROUP_DIRECTOR_POOL_GUARD_PROTOCOL)
    expect(system.content).toContain('资料池使用铁律')
  })

  it('空白 poolVisibilityBlock 不注入（等同无）', () => {
    const [system, user] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { poolVisibilityBlock: '   ' }
    )
    expect(user.content).not.toContain('资料池')
    expect(system.content).not.toContain('资料池使用铁律')
  })
})

// 2026-07-19 批次1A：当前对话只注入状态栏短目录，不常驻字段当前值。
// 批D·D2（2026-07-12·缓存重排）：物理序改为「层3(历史)→池→层2(情境)→状态栏」（此前是「层2→状态栏→层3→池」）——
// 层3 对话历史近似 append-only 更稳定该更靠前；情境/状态栏每轮变，物理后置顺带吃 recency 注意力红利。
describe('buildGroupDirectorMessages 状态栏 MD 常驻注入（批次1·批D·D2 重排）', () => {
  const statusBlock = '- 张元英状态（用户分类=用户自定义；引用=panel-1）｜用途：记录战斗状态｜字段：血量[number]'

  it('有 statusPanelsBlock 时 user 注入〔当前对话状态栏〕段，位置在层3 之后、层2 之后（新物理序=层3→层2→状态栏）', () => {
    const [, user] = buildGroupDirectorMessages(
      {
        userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [],
        sceneContext: '时间：清晨', recentContext: '〔角色1·张元英〕早上好'
      },
      { statusPanelsBlock: statusBlock }
    )
    expect(user.content).toContain('〔当前对话状态栏·短目录〕')
    expect(user.content).toContain('用途：记录战斗状态')
    expect(user.content).toContain('不含当前值')
    const historyAt = user.content.indexOf('【3·对话可见历史】')
    const sceneAt = user.content.indexOf('【2·当前情境】')
    const statusAt = user.content.indexOf('〔当前对话状态栏·短目录〕')
    expect(historyAt).toBeGreaterThanOrEqual(0)
    expect(sceneAt).toBeGreaterThan(historyAt)
    expect(statusAt).toBeGreaterThan(sceneAt)
  })

  it('缺省/空白 statusPanelsBlock 不注入（等同无）', () => {
    const [, userDefault] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: []
    })
    expect(userDefault.content).not.toContain('当前对话状态栏')
    const [, userBlank] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { statusPanelsBlock: '   ' }
    )
    expect(userBlank.content).not.toContain('当前对话状态栏')
  })

  it('决策模式 statusTool 纲领 4c 口径：短目录命中后先按引用读详情', () => {
    const [system, user] = buildGroupDirectorMessages(
      { userText: '推进剧情', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { decisionTools: true, scenarioGuide: '可用情境：daily', statusTool: true, statusPanelsBlock: statusBlock }
    )
    expect(system.content).toContain('4c) 同步状态')
    expect(system.content).toContain('先用 readStatusPanels 按引用读取当前值和版本')
    expect(user.content).toContain('不得按系统预设类别猜优先级')
  })
})

describe('buildGroupDirectorMessages', () => {
  it('轮后模式使用已落库正文的审计/补演纲领，不再要求开口前先排角色', () => {
    const [system, user] = buildGroupDirectorMessages(
      { userText: '已落库的用户输入', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { decisionTools: true, postRoundSupplement: true, scenarioGuide: '可用情境：daily', statusTool: true, scriptTool: true }
    )
    expect(system.content).toContain('这是可见正文已经落库之后的轮后提调')
    expect(system.content).toContain('先核对已经发生的内容')
    expect(system.content).toContain('只补当前场景真正缺失的部分')
    expect(system.content).toContain('允许零角色方向')
    expect(system.content).not.toContain('在任何角色开口、任何旁白落笔**之前**')
    expect(user.content).toContain('请开始轮后收束')
    expect(user.content).not.toContain('缺什么补什么：情境→旁白→逐个定角色方向')
  })

  it('system 写明四件产物，user 列候选/forced/排除/场景/用户输入', () => {
    const [system, user] = buildGroupDirectorMessages({
      userText: '下午好',
      candidates,
      forcedCharacterIds: ['c1'],
      excludedCharacterIds: ['c3'],
      recentContext: '用户：下午好',
      sceneContext: '时间=16:26 地点=杭州 天气=小雨'
    })
    expect(system.role).toBe('system')
    expect(system.content).toContain('thoughts')
    expect(system.content).toContain('situation')
    expect(system.content).toContain('narration')
    expect(system.content).toContain('cast')
    expect(user.content).toContain('陈星依（characterId=c1）')
    expect(user.content).toContain('点名/@（必须包含且最前）：c1')
    expect(user.content).toContain('已排除（绝不出场）：c3')
    expect(user.content).toContain('当前场景：时间=16:26')
    expect(user.content).toContain('下午好')
  })

  it('D1 grounding 选项：system 追加读会话/读投影协议；缺省不追加', () => {
    const base = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] })
    expect(base[0].content).not.toContain(GROUP_DIRECTOR_GROUNDING_PROTOCOL)
    const grounded = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { grounding: true })
    expect(grounded[0].content).toContain(GROUP_DIRECTOR_GROUNDING_PROTOCOL)
    expect(grounded[0].content).toContain('readChatMessage')
    expect(grounded[0].content).toContain('readMessageProjection')
  })

  it('批次4-投影 A·projectionFirst：grounding 协议切「投影优先」变体（默认读投影、原文仅按需）', () => {
    const base = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { grounding: true })
    // 缺省（关）：仍用原 grounding 协议，不含投影优先变体
    expect(base[0].content).toContain(GROUP_DIRECTOR_GROUNDING_PROTOCOL)
    expect(base[0].content).not.toContain(GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST)
    // ON：切投影优先变体，明确「默认读投影、原文仅按需」
    const projFirst = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { grounding: true, projectionFirst: true })
    expect(projFirst[0].content).toContain(GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST)
    expect(projFirst[0].content).not.toContain(GROUP_DIRECTOR_GROUNDING_PROTOCOL)
    expect(projFirst[0].content).toContain('默认核对方式')
    expect(projFirst[0].content).toContain('仅当')
  })

  it('批次4-投影 A·projectionFirst：决策 loop step1 切「默认用 readMessageProjection 读投影」', () => {
    const base = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { decisionTools: true })
    // 批次3（2026-07-10）：三件套下架后旧「可选核对」口径摘掉「查文档库」（统筹手上已无检索工具）。
    expect(base[0].content).toContain('用读楼层/读投影把判断建立在真实历史上')
    expect(base[0].content).not.toContain('查文档库')
    const projFirst = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { decisionTools: true, projectionFirst: true })
    expect(projFirst[0].content).toContain('默认用 readMessageProjection 读投影')
    expect(projFirst[0].content).toContain('仅当要精改某条原文、或投影信息不足时才用 readChatMessage')
    expect(projFirst[0].content).not.toContain('查文档库')
  })

  it('融入计划批次3·researchTool：step1 升「知识盘点」必做判断+追加知识钻取协议；缺省保持旧口径且不提 dispatchResearch', () => {
    const base = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { decisionTools: true })
    expect(base[0].content).toContain('（可选）先核对客观事实')
    expect(base[0].content).not.toContain('知识盘点')
    expect(base[0].content).not.toContain('dispatchResearch')
    const research = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { decisionTools: true, researchTool: true })
    expect(research[0].content).toContain('1) 知识盘点（每轮必做的判断）')
    expect(research[0].content).toContain('dispatchResearch')
    expect(research[0].content).toContain('信息差正是冲突与张力的抓手')
    expect(research[0].content).toContain('【知识钻取·派「采风」查证】')
    expect(research[0].content).toContain('绝不能当公共信息塞给别的角色')
    // 下架锁：统筹纲领/协议不再出现三件套工具名（工具名只在注册时出现·契约口径）。
    expect(research[0].content).not.toContain('searchWorldText')
    expect(research[0].content).not.toContain('recallSemantic')
    expect(research[0].content).not.toContain('fetchUnitDetail')
    // projectionFirst 叠加：知识盘点内自查口径切投影优先。
    const researchProj = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { decisionTools: true, researchTool: true, projectionFirst: true })
    expect(researchProj[0].content).toContain('默认 readMessageProjection 读投影')
  })

  it('并行编排批次B·statusScopeTool（布尔·非阻塞）：true=盘点补「请求确认·继续排戏」句（不提建卡工具名）；缺省不出现；批次4 build 态 1b 步已退役', () => {
    const passInput = { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }
    // 接缝在位：检查句在（researchTool 有无都追加），只提 confirmStatusScope；建卡两件套已迁「造册」、名字不出现。
    const withScope = buildGroupDirectorMessages(passInput, { decisionTools: true, researchTool: true, statusScopeTool: true })
    expect(withScope[0].content).toContain('逐个核对本轮候选中的当前主要角色')
    expect(withScope[0].content).toContain('物品、建筑等非主要角色对象不因此自动造册')
    expect(withScope[0].content).toContain('confirmStatusScope')
    expect(withScope[0].content).toContain('不打断本轮编排')
    expect(withScope[0].content).not.toContain('saveStatusPanel')
    expect(withScope[0].content).not.toContain('saveStatusTemplate')
    const withScopeNoResearch = buildGroupDirectorMessages(passInput, { decisionTools: true, statusScopeTool: true })
    expect(withScopeNoResearch[0].content).toContain('逐个核对本轮候选中的当前主要角色')
    // 批次4 的 build 态纲领步已随建卡迁「造册」退役——任何组合都不再出现。
    expect(withScope[0].content).not.toContain('1b) 按已确认范围建状态栏')
    // 缺省：scope 句不出现（零回归）。
    const base = buildGroupDirectorMessages(passInput, { decisionTools: true, researchTool: true })
    expect(base[0].content).not.toContain('逐个核对本轮候选中的当前主要角色')
    expect(base[0].content).not.toContain('1b) 按已确认范围建状态栏')
    expect(base[0].content).not.toContain('confirmStatusScope')
  })

  it('批次3·纲领：consultScript 恒为立即派发，不再等采风/编剧；采风接缝缺席时不泄露工具名', () => {
    const passInput = { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }
    const both = buildGroupDirectorMessages(passInput, { decisionTools: true, scriptTool: true, researchTool: true })
    expect(both[0].content).toContain('0.5) 异步派编剧')
    expect(both[0].content).toContain('consultScript 只登记异步任务，返回后立即继续')
    expect(both[0].content).not.toContain('先采风后编剧')
    expect(both[0].content).not.toContain('总耗时=最慢一路')
    // 契约：采风接缝不在位时纲领任何处不得出现 dispatchResearch。
    const scriptOnly = buildGroupDirectorMessages(passInput, { decisionTools: true, scriptTool: true })
    expect(scriptOnly[0].content).toContain('0.5) 异步派编剧')
    expect(scriptOnly[0].content).not.toContain('先采风后编剧')
    expect(scriptOnly[0].content).not.toContain('dispatchResearch')
    expect(scriptOnly[0].content).not.toContain('总耗时=最慢一路')
  })

  it('D3 autonomy 选项：system 追加自主重规划/自主收尾协议；缺省不追加', () => {
    const base = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] })
    expect(base[0].content).not.toContain(GROUP_DIRECTOR_AUTONOMY_PROTOCOL)
    const autonomous = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { autonomy: true })
    expect(autonomous[0].content).toContain(GROUP_DIRECTOR_AUTONOMY_PROTOCOL)
    expect(autonomous[0].content).toContain('自主重规划')
    expect(autonomous[0].content).toContain('自主收尾')
  })

  it('E1 liveNarration 选项：system 追加实时旁述协议；缺省不追加', () => {
    const base = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] })
    expect(base[0].content).not.toContain(GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL)
    const live = buildGroupDirectorMessages({ userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }, { liveNarration: true })
    expect(live[0].content).toContain(GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL)
    expect(live[0].content).toContain('边想边说')
  })
})

// 串行压缩批A（2026-07-13）：层2【上轮剧本摘要】——提调判 deviation 的依据；仅 decisionTools 模式注入，
// 物理位置同 lastScenarioBlock 一样落在【2·当前情境】段内（sceneInner 拼接序：世界基调→当前场景→上轮情境→本摘要）。
describe('buildGroupDirectorMessages scriptDigestBlock 注入口径（层2·串行压缩批A）', () => {
  it('decisionTools + scriptDigestBlock 非空 → 出现在【2·当前情境】段内，且在 lastScenarioBlock 之后', () => {
    const passInput = { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }
    const [, user] = buildGroupDirectorMessages(passInput, {
      decisionTools: true,
      lastScenarioBlock: '上一轮情境：闲聊·code=chat',
      scriptDigestBlock: '上轮剧本摘要（判偏差用·consultScript 的 deviation 对照它定）：阶段=第1章·承｜张力=3/5·升温'
    })
    const sceneAt = user.content.indexOf('【2·当前情境】')
    const lastScenarioAt = user.content.indexOf('上一轮情境：闲聊')
    const digestAt = user.content.indexOf('上轮剧本摘要')
    expect(sceneAt).toBeGreaterThanOrEqual(0)
    expect(lastScenarioAt).toBeGreaterThan(sceneAt)
    expect(digestAt).toBeGreaterThan(lastScenarioAt)
  })
})

// 2026-07-02·0-6 分层骨架（取代旧 1-7）：真实 prompt 按命名层「【N·名】」装配（system=0/1·user=2/3/5），让模型分清层级。
describe('buildGroupDirectorMessages 0-6 分层骨架（0总纲领/1可调用资料/2情境/3历史/5信息流）', () => {
  it('system 恒有 0·总纲领，user 恒有 5·提调带信息流（含出场名单+用户诉求）', () => {
    const [system, user] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: []
    })
    expect(system.content).toContain('【0·总纲领】')
    expect(user.content).toContain('【5·提调带信息流】')
    expect(user.content).toContain('出场名单｜候选角色')
    expect(user.content).toContain('陈星依（characterId=c1）')
    expect(user.content).toContain('用户这轮说：「下午好」')
  })

  it('当前情境（2）/已掌握资料非空时才出现；1·可调用资料随资源清单出现', () => {
    const [bareSys, bareUser] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: []
    })
    expect(bareUser.content).not.toContain('【2·当前情境】')
    expect(bareUser.content).not.toContain('各角色已掌握资料')
    // 无任何资源清单/协议时不出现 1·可调用资料层。
    expect(bareSys.content).not.toContain('【1·可调用资料】')
    const [richSys, richUser] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [], sceneContext: '时间=16:26', toneContext: '恋爱喜剧' },
      { poolVisibilityBlock: '【本轮已为各出场角色预先备好的资料池】\n秘密：星依的往事', grounding: true }
    )
    expect(richUser.content).toContain('【2·当前情境】')
    expect(richUser.content).toContain('世界基调：恋爱喜剧')
    expect(richUser.content).toContain('当前场景：时间=16:26')
    expect(richUser.content).toContain('各角色已掌握资料')
    expect(richUser.content).toContain('秘密：星依的往事')
    // grounding 协议归入 1·可调用资料层。
    expect(richSys.content).toContain('【1·可调用资料】')
  })

  it('3·对话可见历史：默认标「对话原文」，projectionFirst=ON 时标「客观事实投影」', () => {
    const [, plain] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [], recentContext: '用户：下午好'
    })
    expect(plain.content).toContain('【3·对话可见历史】')
    expect(plain.content).toContain('最近对话〔对话原文〕')
    const [, proj] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [], recentContext: '客观事实摘要' },
      { projectionFirst: true }
    )
    expect(proj.content).toContain('最近对话〔客观事实投影·非逐字原文〕')
    expect(proj.content).not.toContain('最近对话〔对话原文〕')
  })

  it('增量3·历次 OOC 私密指令：directiveHistoryBlock 非空即注入 5·提调带信息流；空不注入', () => {
    const [, bare] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: []
    })
    expect(bare.content).not.toContain('历次私密指令')
    const [, rich] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { directiveHistoryBlock: '〔历次私密指令·跨轮累积〕\n1. 让星依表白' }
    )
    expect(rich.content).toContain('【5·提调带信息流】')
    expect(rich.content).toContain('历次私密指令·跨轮累积')
    expect(rich.content).toContain('1. 让星依表白')
    // 位于出场名单之后、用户本轮诉求之前。
    expect(rich.content.indexOf('出场名单')).toBeLessThan(rich.content.indexOf('历次私密指令'))
    expect(rich.content.indexOf('历次私密指令')).toBeLessThan(rich.content.indexOf('用户这轮说'))
  })

  it('增量4·可调用工具清单：renderDirectorCallableToolsBlock 渲染「- 名：述」·空清单返回空串', () => {
    expect(renderDirectorCallableToolsBlock([])).toBe('')
    const block = renderDirectorCallableToolsBlock([
      { name: 'readScenarioSkill', brief: '判定/读取本轮情境' },
      { name: 'addCastDirection', brief: '定一个出场角色方向' },
      { name: 'noBrief' }
    ])
    expect(block).toContain('可调用工具（本轮真实注册')
    expect(block).toContain('- readScenarioSkill：判定/读取本轮情境')
    expect(block).toContain('- addCastDirection：定一个出场角色方向')
    expect(block).toContain('- noBrief') // 无 brief 只列名
  })

  // 2026-07-03 用户拍板：deferred 模式（统筹 loop 恒开）toolsearch 置顶 + 「清单内直接调/清单外先搜 schema」边界说明。
  it('toolsearchFirst：toolsearch 列清单第一个 + 头部带两类工具边界说明；缺省不带（零回归）', () => {
    const block = renderDirectorCallableToolsBlock(
      [{ name: 'readScenarioSkill', brief: '判定/读取本轮情境' }],
      { toolsearchFirst: true }
    )
    expect(block).toContain('- toolsearch：搜索清单外的工具')
    expect(block).toContain('必须先用 toolsearch 搜到它的参数格式')
    // toolsearch 在其余工具之前。
    expect(block.indexOf('- toolsearch')).toBeLessThan(block.indexOf('- readScenarioSkill'))
    // 缺省（旧调用）不带 toolsearch 行。
    const plain = renderDirectorCallableToolsBlock([{ name: 'readScenarioSkill', brief: '判定/读取本轮情境' }])
    expect(plain).not.toContain('toolsearch')
  })

  it('决策 loop 主纲领含「清单外工具必须先 toolsearch 拿参数格式」原则', () => {
    const [system] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      { decisionTools: true, scenarioGuide: '可用情境：chat' }
    )
    expect(system.content).toContain('必须先用 toolsearch 搜到参数格式才能调')
    expect(system.content).toContain('绝不要凭猜测的参数去调没给格式的工具')
  })

  it('增量4·层1 承载可调用工具清单 + 可按需展开知识库索引；空则不注入', () => {
    const [bareSys] = buildGroupDirectorMessages({
      userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: []
    })
    expect(bareSys.content).not.toContain('可调用工具（本轮真实注册')
    expect(bareSys.content).not.toContain('可按需展开的知识库')
    const [richSys] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      {
        callableToolsBlock: '可调用工具（本轮真实注册·用原生函数调用触发）：\n- readScenarioSkill：判定/读取本轮情境',
        knowledgeIndexBlock: '### 2.0 速览索引\n| 2.4 | 帷幕 | 右上角虚拟时间/地点/天气 |'
      }
    )
    // 二者归入 1·可调用资料层，且工具清单在知识库索引之前、都在情境/协议之前。
    expect(richSys.content).toContain('【1·可调用资料】')
    expect(richSys.content).toContain('可调用工具（本轮真实注册')
    expect(richSys.content).toContain('可按需展开的知识库')
    expect(richSys.content).toContain('右上角虚拟时间/地点/天气')
    expect(richSys.content.indexOf('可调用工具（本轮真实注册')).toBeLessThan(richSys.content.indexOf('可按需展开的知识库'))
  })

  it('编排倾向不再进统筹层0（倾向迁移批次1·第一消费者=编剧接缝）', () => {
    const [system] = buildGroupDirectorMessages(
      { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] },
      // 旧 directorPref 选项已删除——就算调用方仍旧传值也不得出现倾向块（负向锁死回归）。
      { directorPref: '整体更甜更治愈', grounding: true, autonomy: true }
    )
    expect(system.content).not.toContain('本会话编排倾向')
    expect(system.content).not.toContain('整体更甜更治愈')
  })
})

// 批次E（2026-07-03·层4 已读资料）：assembleGroupDirectorMessages 第三参 readMaterials 非空即插【4·已读资料】。
describe('批次E·assembleGroupDirectorMessages 层4 已读资料', () => {
  const parts = () => buildGroupDirectorPromptParts({
    userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [], recentContext: '用户：下午好'
  })

  it('readMaterials 非空：【4·已读资料】物理后置在层5 之后（批次2·缓存断面），段首带方案3 协议一句话', () => {
    const [, user] = assembleGroupDirectorMessages(
      parts(),
      '- 调用 readChatMessage（query=角色1）',
      '〔readChatMessage（query=角色1）〕\n这是按需读回的逐字全文，含换行\n第二行也保留。'
    )
    expect(user.content).toContain('【4·已读资料】')
    // 方案3 协议一句话：层4=逐字全文、层3 同一条=压缩投影、以全文为准。
    expect(user.content).toContain('以这里的全文为准')
    expect(user.content).toContain('这是按需读回的逐字全文，含换行\n第二行也保留。')
    // 批次2（2026-07-08 缓存断面）：物理顺序=层3 → 层5（append-only 稳定前缀） → 层4（滑窗突变层后置）。
    expect(user.content.indexOf('【3·对话可见历史】')).toBeLessThan(user.content.indexOf('【5·提调带信息流】'))
    expect(user.content.indexOf('【5·提调带信息流】')).toBeLessThan(user.content.indexOf('【4·已读资料】'))
  })

  it('readMaterials 空：不出现层4（开局装配与旧行为逐字一致·零回归）', () => {
    const [, opening] = assembleGroupDirectorMessages(parts())
    expect(opening.content).not.toContain('【4·已读资料】')
    // 只带日志不带层4 时也不出现（超长结果才挪层4，短结果层5 已完整）。
    const [, logOnly] = assembleGroupDirectorMessages(parts(), '- 旁述：先判情境')
    expect(logOnly.content).not.toContain('【4·已读资料】')
  })

  it('只有命中 Skill 正文时仍出现唯一层4，但不误带工具全文说明', () => {
    const [, user] = assembleGroupDirectorMessages(parts(), '', '', '【2.4 帷幕】按需正文')
    expect(user.content.match(/【4·已读资料】/g)).toHaveLength(1)
    expect(user.content).toContain('〔知识库按需节·本轮命中〕')
    expect(user.content).not.toContain('以这里的全文为准')
  })
})

// 批次2（2026-07-08·缓存断面·「一轮消息提速省token」计划）：真机断面=统筹 loop 11 个 pass 缓存命中恒卡 22,634
// （只有稳定头部命中·每 pass 13~16k 全额重计费）。根因=层4（滑窗突变：新条目追加/降索引就地折叠/重读重排）物理位置
// 在 append-only 的层5 之前，层4 一变即打掉层5 整段前缀。修复=层4 后置到层5 之后 + 同 key 同内容重读原位不动。
// 本回归锁=把「相邻 turn 公共前缀必须覆盖 头部+层5 全部既有日志」锁死（缓存命中随 pass 递增的机制保证）。
describe('批次2·缓存断面：相邻 turn 前缀稳定性', () => {
  const parts = () => buildGroupDirectorPromptParts({
    userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [],
    recentContext: '用户：下午好', sceneContext: '深夜 · 望舒台 · 小雨'
  })
  const feed = (collector, name, content, callId, args = { ref: name }) => {
    collector.ingest({ kind: 'tool-call', toolCall: { kind: 'toolCall', callId, toolName: name, stage: 'unknown', args, expectation: '', requestedAtTurn: 0 }, turnIndex: 0 })
    collector.ingest({ kind: 'tool-result', toolResult: { kind: 'toolResult', callId, toolName: name, stage: 'unknown', status: 'success', content, details: {} }, turnIndex: 0 })
  }
  const renderPrompt = (p, collector) => {
    const [sys, user] = assembleGroupDirectorMessages(p, collector.renderLog(), collector.renderReadMaterials())
    return `${sys.content}\n${user.content}`
  }
  const commonPrefixLen = (a, b) => {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1
    return i
  }

  // 批D·D2（2026-07-12·缓存重排）：物理顺序改为 3→2→5→4→6→收束句（此前是 2→3→5→4→6）——
  // 层3 对话历史近似 append-only 更稳定该更靠前，层2 情境每轮变故后置；5/4/6 相对次序不变。
  it('全层在场时物理顺序=3→2→5→4→收束句', () => {
    const collector = createDirectorRoundLogCollector()
    feed(collector, 'consultScript', '本轮指导。'.repeat(40), 'c1')
    const [, user] = assembleGroupDirectorMessages(parts(), collector.renderLog(), collector.renderReadMaterials())
    const order = ['【3·对话可见历史】', '【2·当前情境】', '【5·提调带信息流】', '【4·已读资料】']
    for (let i = 1; i < order.length; i++) {
      expect(user.content.indexOf(order[i - 1])).toBeGreaterThanOrEqual(0)
      expect(user.content.indexOf(order[i - 1])).toBeLessThan(user.content.indexOf(order[i]))
    }
  })

  it('多 turn 模拟（新料·降索引折叠·同参重读·勾todo）：每个后续 turn 的 prompt 都以「上一 turn 头部+层5 日志」为逐字前缀', () => {
    const p = parts()
    const collector = createDirectorRoundLogCollector()
    const body = (tag) => `${tag}的逐字长材料。`.repeat(30) // 折叠后远超 120 → 归层4
    const prompts = []
    const logs = []
    const snapshot = () => {
      logs.push(collector.renderLog())
      prompts.push(renderPrompt(p, collector))
    }
    // turn1：问编剧（超长 → 层4 第 1 条）
    feed(collector, 'consultScript', body('编剧指导'), 'c1')
    snapshot()
    // turn2：读情境写法（层4 第 2 条）
    feed(collector, 'readScenarioSkill', body('情境写法'), 'c2')
    snapshot()
    // turn3：读原文 A（层4 第 3 条·全文窗口满）
    feed(collector, 'readChatMessage', body('原文A'), 'c3', { ref: 'A' })
    snapshot()
    // turn4：读原文 B（第 4 条 → 触发降索引：第 1 条就地折叠成索引行——层4 突变，但它已后置，不再伤层5 前缀）
    feed(collector, 'readChatMessage', body('原文B'), 'c4', { ref: 'B' })
    snapshot()
    // turn5：同参同结果重读原文 A → 层4 原位不动（零突变）
    const materialsBefore = collector.renderReadMaterials()
    feed(collector, 'readChatMessage', body('原文A'), 'c5', { ref: 'A' })
    expect(collector.renderReadMaterials()).toBe(materialsBefore)
    snapshot()

    for (let t = 1; t < prompts.length; t++) {
      const prev = prompts[t - 1]
      // 上一 turn 的稳定区=头部(system+层2/3)+层5 截至上一 turn 的全部日志行；本 turn 必须逐字复用为前缀。
      const stableEnd = prev.indexOf(logs[t - 1]) + logs[t - 1].length
      expect(logs[t].startsWith(logs[t - 1])).toBe(true) // 层5 严格 append-only
      expect(commonPrefixLen(prev, prompts[t])).toBeGreaterThanOrEqual(stableEnd)
    }
  })
})

describe('buildGroupDirectorMessages 知识库恒定块/命中知识节分离注入（批D·D2）', () => {
  const passInput = { userText: '下午好', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }
  const CONSTANT = '【提调知识库·按需披露】（恒定块占位，测试用）'
  const MATCHED = '【2.4 帷幕】（命中环境节占位，测试用）'

  it('(a) matchedKnowledgeBlock 非空：system 不含命中内容；user 含且带区块头，位于层6 之前', () => {
    const [system, user] = buildGroupDirectorMessages(passInput, {
      knowledgeBlock: CONSTANT,
      matchedKnowledgeBlock: MATCHED
    })
    expect(system.content).toContain(CONSTANT) // 恒定块仍前置进 system
    expect(system.content).not.toContain(MATCHED) // 命中块不再进 system
    expect(user.content.match(/【4·已读资料】/g)).toHaveLength(1)
    expect(user.content).toContain('〔知识库按需节·本轮命中〕')
    expect(user.content).toContain(MATCHED)
  })

  it('(b) 两次调用只改 matchedKnowledgeBlock（模拟命中不同环境节）：system 逐字节相等', () => {
    const [systemA] = buildGroupDirectorMessages(passInput, { knowledgeBlock: CONSTANT, matchedKnowledgeBlock: '命中甲小节。' })
    const [systemB] = buildGroupDirectorMessages(passInput, { knowledgeBlock: CONSTANT, matchedKnowledgeBlock: '命中乙小节，长度也不同。' })
    expect(systemA.content).toBe(systemB.content)
  })

  it('matchedKnowledgeBlock 缺省/空串：user 不出现命中知识节（零回归）', () => {
    const [, user] = buildGroupDirectorMessages(passInput, { knowledgeBlock: CONSTANT })
    expect(user.content).not.toContain('知识库按需节')
    const [, userBlank] = buildGroupDirectorMessages(passInput, { knowledgeBlock: CONSTANT, matchedKnowledgeBlock: '   ' })
    expect(userBlank.content).not.toContain('知识库按需节')
  })
})

describe('parseGroupDirectorOutput', () => {
  it('解析完整剧本：情境/旁白安排/cast 方向/thoughts', () => {
    const raw = JSON.stringify({
      thoughts: ['这轮是轻松问候', '让星依先接话', '需要一句环境旁白承接雨天'],
      situation: '用户问候，氛围轻松',
      narration: { want: true, direction: '用雨声烘托室内暖意' },
      cast: [
        { characterId: 'c1', direction: '星依先笑着回应问候' },
        { characterId: 'c2', direction: '元英补一句关心' }
      ]
    })
    const script = parseGroupDirectorOutput(raw, candidateIds)
    expect(script.situation).toBe('用户问候，氛围轻松')
    expect(script.narration).toEqual({ want: true, direction: '用雨声烘托室内暖意' })
    expect(script.cast).toEqual([
      { characterId: 'c1', direction: '星依先笑着回应问候' },
      { characterId: 'c2', direction: '元英补一句关心' }
    ])
    expect(script.thoughts).toHaveLength(3)
  })

  it('容错抽 JSON（裹 markdown/多余文字）+ 剔非候选 cast + 去重', () => {
    const raw = '```json\n' + JSON.stringify({
      cast: [
        { characterId: 'c1', direction: 'a' },
        { characterId: 'cX', direction: '非候选' },
        { characterId: 'c1', direction: '重复' }
      ]
    }) + '\n```'
    const script = parseGroupDirectorOutput(raw, candidateIds)
    expect(script.cast).toEqual([{ characterId: 'c1', direction: 'a' }])
  })

  it('narration.want=false 时 direction 清空；缺省 narration 默认不旁白', () => {
    const a = parseGroupDirectorOutput(JSON.stringify({ cast: [{ characterId: 'c1', direction: 'x' }], narration: { want: false, direction: '不该保留' } }), candidateIds)
    expect(a.narration).toEqual({ want: false, direction: '' })
    const b = parseGroupDirectorOutput(JSON.stringify({ cast: [{ characterId: 'c1', direction: 'x' }] }), candidateIds)
    expect(b.narration).toEqual({ want: false, direction: '' })
  })

  it('thoughts 过滤空串、限 6 条', () => {
    const script = parseGroupDirectorOutput(JSON.stringify({
      cast: [{ characterId: 'c1', direction: 'x' }],
      thoughts: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f', 'g']
    }), candidateIds)
    expect(script.thoughts).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('cast 为空 / 非 JSON / 空串 → null（管线据此回退）', () => {
    expect(parseGroupDirectorOutput(JSON.stringify({ cast: [] }), candidateIds)).toBeNull()
    expect(parseGroupDirectorOutput(JSON.stringify({ cast: [{ characterId: 'cX', direction: 'x' }] }), candidateIds)).toBeNull()
    expect(parseGroupDirectorOutput('不是 JSON', candidateIds)).toBeNull()
    expect(parseGroupDirectorOutput('', candidateIds)).toBeNull()
  })
})

describe('mergeDirectorCast', () => {
  it('forced 最前（补默认方向）+ 统筹 cast 接续，去重剔 excluded/非候选', () => {
    const directorCast = [
      { characterId: 'c2', direction: '元英先说' },
      { characterId: 'c1', direction: '星依接话' },
      { characterId: 'c3', direction: '该被排除' }
    ]
    const merged = mergeDirectorCast(['c1'], directorCast, ['c3'], candidateIds)
    expect(merged[0].characterId).toBe('c1') // forced 最前
    expect(merged[0].direction).toBe('星依接话') // 统筹给了方向就用统筹的
    expect(merged.map((e) => e.characterId)).toEqual(['c1', 'c2']) // c3 被排除
  })

  it('forced 角色统筹没给方向 → 补默认方向', () => {
    const merged = mergeDirectorCast(['c3'], [{ characterId: 'c1', direction: '星依说' }], [], candidateIds)
    expect(merged[0].characterId).toBe('c3')
    expect(merged[0].direction).toContain('用户点名')
    expect(merged.map((e) => e.characterId)).toEqual(['c3', 'c1'])
  })
})

describe('directorCastToReplyOrder', () => {
  it('转成 replyOrder（全 mustReply）', () => {
    expect(directorCastToReplyOrder([{ characterId: 'c1', direction: 'x' }, { characterId: 'c2', direction: 'y' }]))
      .toEqual([
        { characterId: 'c1', mustReply: true, probability: 1 },
        { characterId: 'c2', mustReply: true, probability: 1 }
      ])
  })
})
