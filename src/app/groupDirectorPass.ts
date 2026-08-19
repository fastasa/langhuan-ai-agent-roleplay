/**
 * 提调「整轮前置统筹 pass」纯逻辑层（方案 B：前置统筹 + 方向真注入）。
 *
 * 背景与诉求（用户 2026-06-19 拍板）：现役群聊一轮是「cast pass 只定谁说+顺序 → 每个角色各自跑一遍完整编排」，
 * 导致实时旁述把多个角色的编排过程拼在一起（重复）、分镜事后才出现且角色镜无方向文字。
 * 统筹 pass 把这一步前移并统一：**一次过程**产出整轮剧本——情境分析 + 旁白安排 + 每个出场角色的回复方向 + 顺序，
 * 这次 pass 的 thought 作为唯一「实时旁述」（不再每角色重复），其 cast 方向真注入各角色正文、旁白方向注入旁白。
 *
 * 本模块只做纯逻辑：prompt 构造 / 输出解析 / 与 forced(点名@) 合并排序 / 转 replyOrder。模型调用在管线侧。
 * 与 [groupCastDecision] 的关系：统筹 pass 是 cast pass 的超集（既定谁说+顺序、又给每角色方向+旁白安排+情境）；
 * 复用 cast 的 forced/excluded 合并语义。统筹 pass 失败/空时，管线回退现役确定性 cast 兜底（无方向，行为不降级）。
 */

// 群聊导演 loop 的静态纲领统一收在 agentProtocols 集中目录（用户 2026-06-29），此处只引用、改措辞去那里改。
// 含 F3·旁白彻底归提调共用的 generatedPrompt 编写指南（四处共用同一份、改一处即同步）。
import {
  GROUP_DIRECTOR_GROUNDING_PROTOCOL,
  GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST,
  GROUP_DIRECTOR_RESEARCH_DISPATCH_PROTOCOL,
  GROUP_DIRECTOR_MAP_DISPATCH_PROTOCOL,
  GROUP_DIRECTOR_AUTONOMY_PROTOCOL,
  GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL,
  GROUP_DIRECTOR_POOL_GUARD_PROTOCOL,
  DIRECTOR_SYSTEM_PROMPT,
  NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE
} from './agentProtocols'
// P2 批 E2（2026-07-12 架构审查·规则常量单真值化）：「必须真发起原生函数调用才生效」核心句单点收编，见该文件注释。
import { TOOL_CALL_REALITY_RULE } from './agentProtocols/sharedRules'
import { DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL } from './directorDirective'

// 提调上下文 0-6 分层骨架（2026-07-02·用户重定义·取代旧 1-7 编号）：真实 prompt 按固定命名层装配，让模型「分清层级」。
// 编号＝层语义身份；物理顺序按缓存铁律「越稳定越靠前、越高频变动越靠后」（KV 缓存按前缀命中）——
// 层4（滑窗突变）比层5（append-only）更易变故后置（批次2·2026-07-08 缓存断面）；层6 TODO 压轴（注意力>缓存唯一例外）。
// 批D·D2（2026-07-12·缓存重排）：user 侧「前导段」物理序改为 3(历史)→池→2(情境)→状态栏——层3 近似 append-only
// 最稳定放最前；情境/状态栏每轮变，物理后置顺带吃 recency 注意力红利；命中知识节（渐进披露·随语料变化）作为
// 层4 内部子块（详见 assembleGroupDirectorMessages）。排序真值只在 buildGroupDirectorPromptParts /
// tidiaoCorrectionLoop 两处调用点各自按本注释约定的次序拼 leadingSections，assembleGroupDirectorMessages
// 只负责 leadingSections 之后（层5/层4〔含按需知识〕/层6/closing）这段更易保持单点的部分。
// 物理位置按 chat API 分 system/user（system=0/1 跨轮稳定·user=2/3/5/4/6 半持久→轮级），每层带「【N·名】」标题，模型据标题分层。
// 层4 已读资料＝批次E 已接（harness 轮级容器·loop 内工具读回的逐字全文·开局恒空不出现）；层6 TODO 在批次F 接入。
export const DIRECTOR_LAYER_HEADER = {
  outline: '【0·总纲领】',
  callable: '【1·可调用资料】',
  scene: '【2·当前情境】',
  history: '【3·对话可见历史】',
  read: '【4·已读资料】',
  stream: '【5·提调带信息流】'
} as const

/** 导演机族 loop 硬超时单一真值（批D·D1 收编·2026-07-12）：统筹（groupDirectorHarness）、
 *  单聊 directorMode（replyPlanOrchestratorHarness）、纠偏/精修（tidiaoCorrectionLoop）三 harness
 *  共用同一超时——此前三处各写一份 `20 * 60 * 1000` 靠注释「改一处需三处同步」手工对齐，现收口于此，
 *  三处改成 import 本常量，禁止再各写字面量。 */
export const DIRECTOR_LOOP_TIMEOUT_MS = 20 * 60 * 1000

/** 增量4·层1「可调用工具」清单：把本轮真实注册的工具渲染成「- 工具名：描述」能力清单。
 *  真值=注册表 name+brief（非手写·随工具增减自动同步·不与知识库第三节手写清单漂移）；空清单返回 ''。
 *  options.toolsearchFirst（2026-07-03·用户拍板「toolsearch 置顶+边界说明」）：deferred 模式（统筹 loop 恒开）下
 *  把 toolsearch 列在清单**第一个**，并在头部写清两类工具边界——清单内已随请求附带参数格式（schema）可直接调；
 *  清单外（system 末尾「全局工具目录」）必须先 toolsearch 拿到参数格式才能调。 */
export function renderDirectorCallableToolsBlock(
  tools: Array<{ name: string; brief?: string }>,
  options: { toolsearchFirst?: boolean } = {}
): string {
  const items = (Array.isArray(tools) ? tools : [])
    .map((t) => ({ name: String(t?.name || '').trim(), brief: String(t?.brief || '').trim() }))
    .filter((t) => t.name)
  if (!items.length) return ''
  const lines = items.map((t) => (t.brief ? `- ${t.name}：${t.brief}` : `- ${t.name}`))
  if (!options.toolsearchFirst) {
    return ['可调用工具（本轮真实注册·用原生函数调用触发）：', ...lines].join('\n')
  }
  return [
    '可调用工具（本轮真实注册·用原生函数调用触发）。边界规则：本清单内的工具已随请求附带参数格式（schema），直接发起原生函数调用即可；清单之外的能力见 system 末尾「全局工具目录」，那些工具**没有**随附参数格式，必须先用 toolsearch 搜到它的参数格式，下一轮才能调用——不要凭猜测的参数格式去调清单外的工具：',
    '- toolsearch：搜索清单外的工具——传 query（你想做的事/能力关键词），返回匹配工具的名字、说明和参数格式；拿到后下一轮即可直接调用。',
    ...lines
  ].join('\n')
}

export interface GroupDirectorCandidate {
  characterId: string
  name: string
}

export interface GroupDirectorPassInput {
  userText: string
  candidates: GroupDirectorCandidate[]
  /** 用户点名/@ 的强制出场角色（必须包含且优先，按检测顺序）。 */
  forcedCharacterIds: string[]
  /** 用户排除的角色（任何情况下不出场）。 */
  excludedCharacterIds: string[]
  /** 可选：最近对话简短上下文，帮助提调判断情境与谁接话。 */
  recentContext?: string
  /** 可选：当前场景（时间/地点/天气），帮助情境判断与旁白安排。 */
  sceneContext?: string
  /** 可选：世界基调（如恋爱喜剧/黑深残），帮助定调。 */
  toneContext?: string
  /** 可选：用户私密提调指令（director directive·只管本轮）：用户用双层方括号【【…】】下达、只给提调看的指令。
   *  非空时统筹提示词追加「必须遵守·禁止泄露」段；只影响本轮统筹（情境/旁白方向/各角色方向），
   *  绝不让指令文字泄露到旁白正文/角色台词。发送链路已在入口把它从用户正文剥离。缺省=无私密指令。 */
  directorDirectives?: string[]
}

/** 提调给单个出场角色的本轮安排。 */
export interface RoundDirectorCastEntry {
  characterId: string
  /** 本轮这个角色的回复方向/要点（真注入它的正文生成）。 */
  direction: string
  /** 批B·人格模型按需直通道（2026-07-13）：direct=提调本轮同轮直写 plan、角色跳过演员机三段（编排/候选/评审）
   *  直接照计划写正文；personality/缺省=现状全链路。判断权在提调（工具 brief），路由=硬代码分流。 */
  planMode?: 'direct' | 'personality'
  /** planMode='direct' 时必填：提调直写的本轮回复计划（第三视角，约50字），复用 normal_recall 单计划管道。 */
  plan?: string
}

/** 提调一次统筹产出的「本轮剧本」。 */
export interface RoundDirectorScript {
  /** 情境分析（本轮发生了什么、氛围、要点）。 */
  situation: string
  /** F1/F2·决策 loop：提调轮级 readScenarioSkill 判定的情境 skill code（会话级编排器情境，角色中立可共享）。
   *  下发给各角色分镜复用、跳过各自判情境；一次性 JSON 路径（旧）无此源、缺省。 */
  scenarioCode?: string
  /** F1/F2·决策 loop：提调轮级读到的情境 skill body 正文（带反应类别/强度要求），下发给分镜作已判好的情境正文。 */
  scenarioBody?: string
  /** 旁白安排：要不要旁白 + 旁白写什么方向（真注入旁白生成）。 */
  narration: { want: boolean; direction: string }
  /** 有序出场角色 + 各自方向。 */
  cast: RoundDirectorCastEntry[]
  /** 实时旁述行：提调「边想边说」的安排过程（唯一一份，逐句呈现）。 */
  thoughts: string[]
  /** D1（群聊导演 harness loop）：提调本轮主动取料/读楼层/读投影的决策，进编排带 retrieval 块（方案 B）。
   *  一次性 pass 路径无此源（缺省/空数组）；loop 路径由 groupDirectorHarness 收集后回填。 */
  retrieval?: Array<{ tool: string; query: string }>
}

// GROUP_DIRECTOR_GROUNDING_PROTOCOL / _PROJECTION_FIRST / _RETRIEVAL / _AUTONOMY / _LIVE_NARRATION 等静态纲领
// 已搬到 agentProtocols/groupDirectorProtocols.ts（见顶部 import），改措辞去那里改。本文件只保留带分支的动态模板。

/** F1·决策 loop 系统协议（群聊提调真 loop 统一·2026-06-22）：把「一次性 JSON 出剧本」改成「分步决策工具序列」。
 *  提调每一步只做一个决定、发起一个对应的决策工具函数调用，并在 content 里放一句导演 thought 实时旁述——
 *  每步即决策流里的一条（逐条真流式·想一点做一点）。情境/旁白/角色方向全部在提调这一层产生，分镜只演不导。
 *  决策工具的具体 schema/可用情境/可用旁白 skill 由 harness 按真注册的工具拼进同一份 system（见 buildGroupDirectorMessages）。 */
/** 批次4-投影 A：决策 loop step 1「投影优先」与默认两版文案。
 *  projectionFirst 时明确「默认读投影、原文仅按需（改原文/投影不足才读）」，与 grounding 协议投影优先变体一致。
 *  融入计划批次3（2026-07-10 用户拍板「问完剧本第一件事=判断知识是否足够」）：researchTool（采风接缝在位）时
 *  升级为「知识盘点」必做判断——对照三渠道逐角色盘知识、缺口派采风（dispatchResearch）；接缝不在位保持
 *  旧「可选核对」口径（契约：工具名只在注册时出现），且已随三件套下架摘掉「查文档库」。
 *  并行编排计划批次B（2026-07-10 非阻塞化，取代批次4 三态）：statusScopeTool=true（confirmStatusScope 已注册）时
 *  盘点末尾追加“逐个核对当前主要角色是否已有状态栏”的必做检查；缺栏时经确认卡启动造册。 */
function directorDecisionLoopStep1(projectionFirst: boolean, researchTool: boolean, statusScopeTool = false): string {
  const selfCheck = projectionFirst
    ? '（默认 readMessageProjection 读投影，要精改原文或投影不足才 readChatMessage）'
    : '（读投影/读楼层）'
  // scope 确认检查句（接缝在位才追加）：主要角色必须纳入状态管理，但栏内结构与取料范围仍由用户确认。
  const scopeCheck = statusScopeTool
    ? '逐个核对本轮候选中的当前主要角色是否已经出现在状态栏短目录里；发现缺栏时，本轮必须把全部缺栏主要角色汇总到同一次 confirmStatusScope 的 characterHints，启动逐人范围确认，禁止循环单角色调用。已有待确认卡时不要重复请求；已被用户拒绝的角色会由代码过滤。状态栏字段与每人的取料范围仍由用户逐项确认；物品、建筑等非主要角色对象不因此自动造册。调用后弹卡不打断本轮编排。'
    : ''
  if (researchTool) {
    return `1) 知识盘点（每轮必做的判断）：拿到编排指导后，先对照它检查手头三渠道够不够写这一轮——①【3·对话可见历史】②〔各角色已掌握资料〕③〔当前对话状态栏·短目录〕。短目录只告诉你有哪些用户自定义状态栏、各自记录什么和字段轮廓，不含当前值；本轮确实需要某张栏时再用 readStatusPanels 按引用读取详情。逐个出场角色过一遍「他知道什么、有什么、处于什么状态」——角色间的信息差正是冲突与张力的抓手，盘点时就定下谁知道、谁不知道。发现缺口（历史细节拿不准、专名/设定没依据、某角色该有的背景资料池里没有、相关状态栏需要展开）就用 dispatchResearch 派「采风」去查证——一次把本轮缺口问全，多个独立缺口同轮多发并行；只是某条历史消息的小疑点也可自己核对${selfCheck}。知识够了就直接往下，不为派而派。${scopeCheck}`
  }
  const base = projectionFirst
    ? '1) （可选）先核对客观事实：开局「最近对话」已是投影态客观事实摘要；要进一步核对时**默认用 readMessageProjection 读投影**（客观事实/时间地点变化），仅当要精改某条原文、或投影信息不足时才用 readChatMessage 读原文（碰到拿不准再查，简单场景可跳过）。'
    : '1) （可选）先核对客观事实：用读楼层/读投影把判断建立在真实历史上（碰到拿不准的历史细节/专名再查，简单场景可跳过）。'
  return `${base}${scopeCheck}`
}

// 批次B（2026-07-10）：批次4 的「1b 按已确认范围建卡」纲领步已退役——建卡由「造册」子agent在自己的
// 系统提示词里完成（zaoceSubagent.ZAOCE_SYSTEM_PROMPT），统筹纲领不再有 build 态。

/** F1·决策 loop 系统协议构造（群聊提调真 loop·2026-06-22）：分步决策工具序列（一步一决定）。
 *  projectionFirst（批次4-投影 A·灰度开关 ON）时 step 1 切「默认读投影、原文仅按需」。
 *  scriptTool（2026-07-06 剧本·consultScript 接缝在位时）追加步骤 0.5「问编剧拿本轮编排指导」（每轮必做·
 *  剧本由编剧 subagent 独占维护、整本不进提调上下文；「没问过拦一次」硬门在 createFinishRoundTool）。
 *  2026-07-05 层0 任务化：本纲领现在只进统筹轮（＝统筹任务的层0 任务纲领）；纠偏/精修轮层0 改用各自任务纲领
 *  （tidiaoCorrectionLoop 的 buildTidiaoCorrectionDirectiveBlock / buildTidiaoPrecisionEditDirectiveBlock），不再复用本函数。
 *  researchTool（融入计划批次3·2026-07-10·researchSeam 在位时）：步骤 1 升「知识盘点」必做判断（缺口派采风）。
 *  statusScopeTool：true=在用户明确要求或确有长期管理需求时允许 confirmStatusScope 请求确认；
 *  false=不出现。批次4 的 build 态已随建卡迁造册退役。 */
export function buildDirectorDecisionLoopSystemPrompt(projectionFirst: boolean, curtainTool = false, scriptTool = false, statusTool = false, researchTool = false, statusScopeTool = false): string {
  return [
    '你是多人场景的「提调」（世界总编排/总导演）。在任何角色开口、任何旁白落笔**之前**，你先把这一整轮的导演活全部做完——按依赖分批推进：**互不依赖的动作必须并在同一轮输出里一起发起**（一次输出多个原生函数调用，按列出顺序执行），只有后一步要用前一步的结果时才分轮。',
    '每轮输出：发起这一批该做的全部函数调用，并在 content 里放**一句**导演口吻的 thought（形如 {"thought":"先看看这轮是什么情境"}），实时说你这一批在定什么、为什么。这句 thought 会逐条显示给用户看（边想边做），一轮一句、自然口语、不要工程黑话、不要复述字段名。',
    '决策步骤顺序（按需，缺的可跳、但角色方向和收尾必须有）：',
    // 剧本（2026-07-06 用户拍板「建完 todo 后的第 1 件事」·subagent 形态）：剧本由编剧 subagent 独占维护、
    // 批次3：consultScript 只负责异步派发；提调不得等待，回报若及时到达会在下一模型边界单独注入。
    ...(scriptTool ? [
      // 并行编排计划批次A（2026-07-10 用户拍板「顺序不固定死」）：researchTool 在位时追加「先采风后编剧」例外——
      // 开局/大缺料轮编剧无米立章=持久剧本真值定歪（真机复现：采风未交稿编剧已把开场定死）。契约：dispatchResearch 名仅 researchTool 在位出现。
      '0.5) 异步派编剧（每轮必做）：立刻调用 consultScript——brief 只写用户本轮表达、上一轮实际落库事实与观察到的变化；有要重点判断的触发、冲突、失效、加速、延迟或新元素写进 asks。调用会立即返回“已派发”，不得原地等待或重复调用，继续执行后续统筹。若【异步编剧回报】在后续模型边界到达，严格区分其中的已确认事实、候选判断和建议动作，再决定是否调整尚未完成的工具调用；已经 finishRound 的决策不得被迟到回报倒改。本轮没派编剧就 finishRound 会被拒绝一次。',
      '0.55) 结算待引爆种子：如果〔本轮相关叙事种子〕出现 ready_to_trigger（待引爆），逐条按 id 调 readNarrativeSeed；结合“开始时间→当前帷幕时间”的已越过时长，判断因果怎样落到世界、人物状态或后继种子。当前可感知影响必须落实到旁白与角色方向；后台影响也要写进正式种子进展。每条待引爆种子都必须在本轮用 updateNarrativeSeed 退出 ready_to_trigger，不能原样留到下一轮；finishRound 有硬门会拒绝漏结算。时间门越过本身不是预期后果已经发生，不能越证据兑现 expectedOutcome，也不能向不知情角色泄密。',
      '0.6) 用户明确要求修改“剧本/伏笔/后台事件”时：不要覆盖会话旧整本，也不要把要求塞给 consultScript 等它代写。当前会话挂世界时，用 createNarrativeSeed / updateNarrativeSeed 把要求落到世界级叙事种子；更新前先 readNarrativeSeed 核对详情和 version。没有挂世界时如实说明暂不能建立世界正式种子，不得偷偷写进别的世界或旧 localStorage 剧本。',
    ] : []),
    directorDecisionLoopStep1(projectionFirst, researchTool, statusScopeTool),
    '2) 判情境：调用 readScenarioSkill，从「可用情境」里挑这一轮最匹配的一个、读它的写法。这一步定本轮共用情境（之后所有出场角色都用它，不再各自判），thought 用人话说这是什么情境。',
    // 帷幕校准（2026-07-04 用户拍板·updateCurtainScene 接缝在位才追加）：剧情自然发生的时空跳变（如穿越）
    // 此前无人负责改帷幕真值——演员/纠偏侧只认「用户明确指令」。统筹判情境时顺手校准，todo 记一条防忘。
    // 批次4（2026-07-07 范式优化）：地点三段格式细节沉进工具 brief+schema+validateArgs（CURTAIN_LOCATION_FORMAT_HINT
    // 单一口径·校验失败回执会重述格式），纲领只留「何时改+判断准则」策略。
    ...(curtainTool ? [
      '2.5) 校准帷幕：判完情境顺手核对当前帷幕三值（时间/地点/天气，见「当前情境」）有没有被剧情甩开——剧情已经明确发生时空跳变（穿越/快进/换地点/入夜/天气骤变）或用户明确要求改时，随即调用 updateCurtainScene 把帷幕改到位（可只改变化的项）。拿不准剧情有没有真的换时空就**不要改**——帷幕是会话真值，宁缺勿错。地点写正经地点名词（三段格式按工具参数说明填）；气氛、光影、感受、比喻（如「晦暗残影」）都不是地点，绝不能往帷幕里填。',
    ] : []),
    // 旁白穿插（2026-07-06 用户拍板）：旁白不必总在开头——insertAfter 锚点让旁白可以开场铺垫、穿插在角色之间承接言行/引入变数/人物进退场、或收尾定格。
    '3) 定旁白：这一轮要不要旁白、放在哪，**只由你这一层定**。旁白不是只能放在开头——它可以穿插在角色回复之间：承接某个角色刚说完的话描写她的动作神态、在两个角色之间引入新的变数、安排新人物进场或旧人物退场，也可以放在最后收尾定格。要旁白：先调用 readNarrationSkill 读对应旁白写法，再调用 confirmNarrationCall，把这段旁白完整的生成提示词（generatedPrompt）一次写全交给旁白生成链路（generatedPrompt 是这段旁白唯一的写作指令，正文链路不再补任何方向/占比/文风/字数），并用 insertAfter 定位置——不填=开场（所有角色回复之前）；填某个出场角色的 characterId 或名称=紧跟在该角色本轮说完之后（生成时能看到该角色实际说了什么，最适合承接其言行）；填「收尾」=本轮最后一位角色说完之后。穿插/收尾旁白也可以等你定完相关角色方向后再确认（步骤 3 和 4 可以交叉）。不要旁白：这两个工具都不调用——这一轮就真的没有旁白。自己判断某条已确认旁白的方向真的需要改时用 reviseNarrationDirection，不是每次都要改。',
    '4) 逐个定角色方向：对每一个该出场的角色，各发起**一次** addCastDirection（characterId + 这一轮他/她大致怎么回应/态度/动作方向，不写台词原文）。每个角色各一个调用，多个角色的方向互不依赖、可同轮并发，调用顺序=出场顺序；被点名/@（forced）的角色必须定、且排最前。自己判断某个角色的方向真的需要改时用 reviseCastDirection 改，不是每次都要改。每个方向同时定 planMode：日常问候、普通接话、平静情境=direct，并把这条回复的计划顺手写进 plan（第三视角约50字，只写他/她接下来呈现的动作/神态/态度/语气/表达意图，不写台词原文）——角色会照你的计划直接写正文，省去两次模型调用；情绪激动、冲突关键、亲密/危险等靠近边界、剧情转折的重头戏=personality，角色走完整人格计划链路。拿不准就 personality。',
    // 信息不对称硬检查（2026-07-06 用户拍板·无条件常驻）：给角色定方向前先以该角色视角核信息来源；
    // 角色信息范围只有「自己的资料池 + 历史聊天记录里自己在场的内容」，两处都没有=不知道，禁止让角色知道自己不知道的事。
    '4b) 信息不对称检查（每个方向下笔前必做）：以这个角色的视角问一遍——「这条信息他/她/它能从哪里得到？」角色知道的范围只有两处：该角色自己的资料池 + 历史聊天记录里他/她/它在场看到听到的内容；两处都没有＝这个角色不知道，**禁止让角色知道自己不知道的事**——绝不能把只有你（提调）、旁白或别的角色才掌握的信息塞进他/她/它的方向里。信息差不是缺陷，正是冲突、误会与张力的素材：让角色带着有限信息行动。',
    // 状态系统（批次5·2026-07-08 用户拍板「状态栏主写手=提调」·接缝在位才追加）：剧情状态变化随轮落账。
    // 参数用法在工具 brief+schema（范式规矩④·纲领只留「何时用+边界」策略）。
    ...(statusTool ? [
      '4c) 同步状态（每轮对照）：状态栏是用户按世界观和管理需要自由构筑的实时面板。本轮剧情确实改变了短目录中某张相关状态栏所记录的信息时，先用 readStatusPanels 按引用读取当前值和版本，再用 updateStatusPanel 把对应字段改到位（与角色方向互不依赖、可同轮并发）。主要角色缺栏由步骤 1 的 confirmStatusScope 启动造册；物品、建筑等其它对象仍只按长期管理需要申请。本轮没有已发生的状态变化就不调用 updateStatusPanel。',
    ] : []),
    '5) 收尾：所有必要的种子结算、状态同步、旁白与角色方向都完成后，调用 finishRound 结束这一轮（可附一句本轮情境小结）。普通前置统筹至少定一个角色；快速回复后的轮后补演可以只落账或只补旁白。',
    '原则：',
    '- 谁该回应这轮就让谁出场，不必每人每轮都说；顺序自然（被直接问到/最相关的先说）。',
    '- 只能从候选名单选角色，用候选给的 characterId，不要编造。',
    `- 这些工具都是同步工具：${TOOL_CALL_REALITY_RULE}`,
    // 并联口径按接缝在位组装：剧本/采风接缝不在位时不得出现 consultScript/dispatchResearch 等业务工具名（契约测试锁）。
    // 当前任务 TODO 已由共享 runtime 保留工具统一装配，不属于本业务接缝或 manifest。
    // 并行编排计划批次A（2026-07-10）：同轮多调用现在真并行执行（runtime 并发白名单），口径点破「总耗时=最慢一路」。
    // 串行压缩计划批D（2026-07-13）：readScenarioSkill 判情境与开局三连无依赖，也并进开局同一轮。
    `- 并联口径（省时省钱的硬要求）：${scriptTool ? `开局 consultScript 只登记异步任务，返回后立即继续${researchTool ? '，互不依赖的 dispatchResearch 也可并进同一轮' : ''}；判情境 readScenarioSkill 与它们无依赖，也并进开局同一轮；` : ''}读完写法后 confirmNarrationCall 与各 addCastDirection 可同轮并发。`,
    '- 工具分两类：「可调用工具」清单里的已随请求附带参数格式（schema），直接调；清单之外的（全局工具目录里的）没有参数格式，必须先用 toolsearch 搜到参数格式才能调，绝不要凭猜测的参数去调没给格式的工具。',
  ].join('\n')
}

/** 轮后提调不是前置导演：它以已落库正文为事实起点，先审计落账，只在真有缺口时补演。 */
export function buildPostRoundDecisionLoopSystemPrompt(
  projectionFirst: boolean,
  curtainTool = false,
  scriptTool = false,
  statusTool = false,
  researchTool = false,
  statusScopeTool = false
): string {
  return [
    '你是多人场景的「提调」（世界总编排/总导演）。这是可见正文已经落库之后的轮后提调：你不是为已经开口的角色重排第一次回复，而是核对已发生内容、补齐必要的可见结果，并把状态、帷幕、剧本与种子收束到正式真值。',
    '每轮输出：发起这一批真正需要的函数调用，并在 content 里放一句简短的导演 thought，让用户看懂你正在核对、落账还是补演。不说工程黑话，不重复已落库正文。',
    '轮后顺序：',
    ...(scriptTool ? [
      '0.5) 异步派编剧：调用 consultScript，brief 只概括这次已落库输出真正发生了什么，asks 列出需要核对的剧本触发、遗漏、失效或后继影响。派发后不原地等待，继续核对。',
      '0.55) 结算全部待引爆种子：逐条读完整资料，只写有证据的影响，并在本轮真正退出 ready_to_trigger。不得把 expectedOutcome 直接写成已发生事实。'
    ] : []),
    `1) 审计已落库结果：先核对已经发生的内容，辨认它实际改变了哪些状态、位置、在场关系、帷幕或世界事实。${projectionFirst ? '默认用客观事实投影核对，只在投影不足时读原文。' : '必要时读消息或投影核对。'}${researchTool ? '证据不足时才派采风查证，不为派而派。' : ''}`,
    ...(curtainTool ? ['2) 帷幕落账：只在已落库内容明确形成时间、地点或天气变化时调用 updateCurtainScene；不拿剧本候选推演改帷幕。'] : []),
    ...(statusTool ? ['3) 状态落账：根据已发生正文与核证结果，命中相关状态栏后先读当前值与版本，再只更新真正变化的字段。没有变化就不写。'] : []),
    ...(statusScopeTool ? ['3.5) 主要角色缺少状态栏时，把本轮全部缺栏主要角色汇总到一次造册范围确认；不循环单角色请求，也不替用户暗定字段和取料范围。'] : []),
    '4) 判断是否真需补演：对照剧本、种子与已落库正文，只补当前场景真正缺失的部分。需要可见结果时才安排旁白；只有某个角色必须对新发生事实作出反应，且该角色确实知情时，才添加该角色方向。禁止重复已经说过的招呼、动作或描写。',
    '5) 收尾：审计、待引爆结算、状态/帷幕落账和必要补演都完成后调用 finishRound。轮后允许零角色方向、零旁白直接收尾；不要为了“排完一轮”强行造新消息。',
    `工具调用真实性：${TOOL_CALL_REALITY_RULE}`
  ].join('\n')
}

// GROUP_DIRECTOR_POOL_GUARD_PROTOCOL（方向护栏）与 DIRECTOR_SYSTEM_PROMPT（一次性 pass 兜底）
// 已搬到 agentProtocols/groupDirectorProtocols.ts（见顶部 import）。

// 层5 操作日志段标题（单一真值在 directorRoundLog.ts·查看器去重也认它）。
import { DIRECTOR_ROUND_LOG_SECTION_TITLE } from './directorRoundLog'

/** 批次D（2026-07-02·层5 动态提示词）：统筹 prompt 的可重组分段——harness 每 turn 重建时用同一份分段
 *  + 当轮操作日志重新装配（层0-3/池开局定死不变·层5 尾部追加日志），见 {@link assembleGroupDirectorMessages}。 */
export interface GroupDirectorPromptParts {
  /** system 全文（0·总纲领 + 1·可调用资料）。loop 内恒定不变（保 KV 前缀缓存）。 */
  system: string
  /** user 侧层5 之前的段（3·对话可见历史 / 池·各角色已掌握资料 / 2·当前情境 / 状态栏·非空才含）。loop 内恒定。
   *  批D·D2（2026-07-12·缓存重排）：数组内容按「层3 → 池 → 层2 → 状态栏」次序拼——层3 近似 append-only
   *  最稳定放最前，情境/状态栏每轮变、物理后置吃 recency 注意力红利；本数组只带内容，调用方
   *  （buildGroupDirectorPromptParts / tidiaoCorrectionLoop）各自按此次序 push，本函数不再重排它。 */
  leadingSections: string[]
  /** 层5 开局内容（出场名单+历次OOC+用户这轮说+私密指令）；重建时操作日志追加在其后（同层内尾部增长）。
   *  批D·D1（2026-07-12）：省略（undefined）即整段【5】跳过——纠偏 loop 的「开局装配」没有层5，
   *  借这个可选口子复用本函数（不是新增行为分支，是给「本来就没有层5」的调用方一个不硬造空层5 的方式）。 */
  streamInner?: string
  /** user 末尾收束句（开局态·开始逐步统筹…）。 */
  closing: string
  /** 续轮收束句（真机修①·2026-07-03）：重建带操作日志时用它取代 closing——开局句「请开始逐步统筹本轮」会诱导
   *  模型把日志里已做的步骤从头复述一遍（真机复现：thought 复读且不调工具）；续轮句明确「别重复、直接下一步」。
   *  批D·D1：纠偏 loop 两处调用都不传 roundLog 参（其层5 日志已内嵌进 streamInner），恒定走 closing 分支，
   *  故这里放宽为可选——省略等价空串，`parts.closingContinue || parts.closing` 原有 fallback 语义不变。 */
  closingContinue?: string
}

/** 层4·已读资料段的协议一句话（方案3·用户 2026-07-02 终审：原文放层4、层3 保持纯投影不标记，
 *  混淆用本句化解）。层4 非空时作段首说明。 */
export const DIRECTOR_READ_MATERIALS_GUIDE = '（这里是你本轮用工具按需读回的逐字全文；同一条消息在【3·对话可见历史】里是压缩投影，以这里的全文为准。）'

/** 命中知识环境节的区块头（批D·D2·2026-07-12 缓存重排新增）：提调知识库渐进披露命中的 2.x 环境小节
 *  随当轮语料变化，不再前置进 system 层0（会打掉其后恒定纲领/协议的跨轮缓存），改在 user 侧靠后位置
 *  （层4 已读资料之后、层6 TODO 之前）单独成块，用与〔各角色已掌握资料〕/〔当前对话状态栏〕同款〔〕风格
 *  区块头标记来源。①统筹③纠偏经本函数统一处理；②单聊 directorMode（replyPlanOrchestratorHarness）没有
 *  0-6 装配、直接引用本常量把命中块 push 成独立 user 消息，三处视觉/口径保持一致。 */
export const DIRECTOR_KNOWLEDGE_MATCHED_SECTION_TITLE = '〔知识库按需节·本轮命中〕'

/** 把分段装配成 system+user 两条消息；roundLog 非空即追加进【5·提调带信息流】尾部（批次D·每 turn 重建），
 *  且收束句切「续轮」语义（别重复已做步骤·直接发起下一个工具调用）。
 *  批次E：readMaterials（层4 已读资料·harness 轮级容器渲染产物）非空即插进【4·已读资料】。
 *  批次2（2026-07-08·缓存断面）：层4 物理位置改到层5 **之后**——层5 是严格 append-only（稳定前缀），
 *  层4 是滑窗突变层（新条目追加/降索引就地折叠），比层5 更易变；按「越稳定越靠前」铁律理应后置。
 *  旧序（层4 在层5 前）是每 pass 缓存命中恒卡稳定头部的根因：层4 一变，append-only 的层5 前缀整段作废。
 *  编号=层语义身份不改，模型按【N·名】标题分层；物理顺序=leadingSections(3,池,2,状态栏),5,4(含命中知识)。
 *  收束句是行动指令非层、仍收在最后。roundLog/readMaterials/matchedKnowledge 缺省＝开局装配。
 *  批D·D1（2026-07-12·唯一装配真值）：纠偏/精修 loop（tidiaoCorrectionLoop.ts）的开局装配 + 重建装配
 *  （原 assembleRebuiltCorrectionMessages 手抄版已删除）全部改调这里——
 *  纠偏开局＝leadingSections 塞满（层3/层2/记忆/指令行），
 *  streamInner 省略（没有层5）；纠偏重建＝streamInner 塞「层5 段头+操作日志」（指令行已内嵌日志里）、
 *  roundLog 参恒传空串、closing 塞纠偏专属口径句（「已发生 vs 未处理」）。层序改动只此一处，不必再手工同步第二份。
 *  批次1P（2026-07-19）：matchedKnowledge 仍由第五参传入，但收进【4·已读资料】内部的
 *  【知识库按需节】子块，不再形成七层之外的游离段；命中内容仍绝不前置进 system。 */
export function assembleGroupDirectorMessages(
  parts: GroupDirectorPromptParts,
  roundLog = '',
  readMaterials = '',
  matchedKnowledge = ''
): Array<{ role: 'system' | 'user'; content: string }> {
  const H = DIRECTOR_LAYER_HEADER
  const log = String(roundLog || '').trim()
  const read = String(readMaterials || '').trim()
  const matched = String(matchedKnowledge || '').trim()
  const readParts = [
    ...(read ? [`${DIRECTOR_READ_MATERIALS_GUIDE}\n${read}`] : []),
    ...(matched ? [`${DIRECTOR_KNOWLEDGE_MATCHED_SECTION_TITLE}\n${matched}`] : [])
  ]
  const readSection = readParts.length ? `${H.read}\n${readParts.join('\n\n')}` : ''
  // streamInner 缺省（undefined）＝没有层5（纠偏开局装配用）：整段跳过，不硬造空标题行；
  // 现役所有既有调用方（buildGroupDirectorPromptParts 等）恒传字符串，本分支对它们零影响。
  const streamSection = parts.streamInner === undefined
    ? ''
    : `${H.stream}\n${parts.streamInner}${log ? `\n\n${DIRECTOR_ROUND_LOG_SECTION_TITLE}\n${log}` : ''}`
  const closing = log ? (parts.closingContinue || parts.closing) : parts.closing
  // closing 折进 sections 数组末尾再一次性 join（而非「join 后再拼 \n\n+closing」）：两种写法在
  // leadingSections/streamSection 非空时逐字等价，但纠偏开局装配存在「全部前段皆空、只剩 closing」的
  // 边界（无情境/无历史/无todo/无记忆/无指令），后一种写法会多出一段前导空行，前一种不会——统一取前一种。
  const sections = [
    ...parts.leadingSections,
    ...(streamSection ? [streamSection] : []),
    ...(readSection ? [readSection] : []),
    closing
  ]
  const user = sections.join('\n\n')
  return [
    { role: 'system', content: parts.system },
    { role: 'user', content: user },
  ]
}

/** 构造统筹 pass 的模型消息（system + user），供管线 callAI / loop 调用。
 *  options.grounding=true（群聊导演 loop·有读楼层/读投影工具）时追加 GROUP_DIRECTOR_GROUNDING_PROTOCOL；
 *  options.researchTool=true（采风接缝在位·批次3 取代旧三件套 retrieval）时追加 GROUP_DIRECTOR_RESEARCH_DISPATCH_PROTOCOL；
 *  options.autonomy=true（D3·loop 路径有 grounding/采风能力）时追加 GROUP_DIRECTOR_AUTONOMY_PROTOCOL（自主重规划/自主收尾）；
 *  仅在对应工具真注册时追加（避免叫模型用没注册的工具/谈没有的自主能力）；缺省（一次性 pass）都不追加，行为不变。
 *  批D·D2：options.matchedKnowledgeBlock 非空即透传给 assembleGroupDirectorMessages 的第五参
 *  （命中知识节·见该函数注释），本函数只做直通、不进入 GroupDirectorPromptParts（它不属于「恒定分段」）。 */
export function buildGroupDirectorMessages(
  input: GroupDirectorPassInput,
  options: Parameters<typeof buildGroupDirectorPromptParts>[1] = {}
): Array<{ role: 'system' | 'user'; content: string }> {
  return assembleGroupDirectorMessages(buildGroupDirectorPromptParts(input, options), '', '', options.matchedKnowledgeBlock || '')
}

/** 统筹 prompt 分段构造（批次D 从 buildGroupDirectorMessages 原地拆出·装配逻辑逐字不变）：
 *  返回可重组分段供 harness 每 turn 重建；普通调用走 buildGroupDirectorMessages（开局装配·行为零变化）。 */
export function buildGroupDirectorPromptParts(
  input: GroupDirectorPassInput,
  options: {
    grounding?: boolean
    /** 融入计划批次3（2026-07-10）：采风接缝在位（决策 loop·dispatchResearch 已注册）。true 时①决策纲领
     *  步骤 1 升「知识盘点」必做判断②追加 GROUP_DIRECTOR_RESEARCH_DISPATCH_PROTOCOL 钻取协议。
     *  取代旧 retrieval option（统筹本体三件套已下架移交采风·用户拍板）。缺省=旧「可选核对」口径。 */
    researchTool?: boolean
    /** 地图系统批5（2026-07-11）：绘舆接缝在位（决策 loop·dispatchMapWork 已注册）。true 时追加
     *  GROUP_DIRECTOR_MAP_DISPATCH_PROTOCOL 地图信号协议（角色移动/新地点/进迷雾区→派绘舆·层1 触发句）。 */
    mapTool?: boolean
    autonomy?: boolean
    liveNarration?: boolean
    /** F1/F3·决策 loop：走分步决策工具序列（readScenarioSkill/addCastDirection/finishRound + 旁白两件套
     *  readNarrationSkill/confirmNarrationCall），而非一次性 JSON 出剧本。为 true 时 system 用
     *  DIRECTOR_DECISION_LOOP_SYSTEM_PROMPT 并拼入情境/旁白清单。 */
    decisionTools?: boolean
    /** 决策 loop 用·可用情境路由清单（提调判情境时挑 code 读写法）；由 harness 据会话级编排器配置渲染。 */
    scenarioGuide?: string
    /** 决策 loop 用·可用旁白 skill 清单（提调定旁白时挑 profileId）；由 harness 据会话旁白 profiles 渲染。 */
    narrationGuide?: string
    /** 帷幕校准（2026-07-04·updateCurtainScene 接缝在位·仅 decisionTools 模式）：决策纲领追加步骤 2.5
     *  「判情境后校准帷幕三值，剧情时空跳变/用户明确要求才改」。缺省=不追加，行为不变。 */
    curtainTool?: boolean
    /** 剧本（2026-07-06·consultScript 接缝在位·仅 decisionTools 模式）：决策纲领追加步骤 0.5
     *  「问编剧拿本轮编排指导」（每轮必做·剧本整本不进提调上下文）。缺省=不追加，行为不变。 */
    scriptTool?: boolean
    /** 状态系统（批次5·2026-07-08·statusSystem 接缝在位·仅 decisionTools 模式）：决策纲领追加步骤 4c
     *  「同步状态」（剧情状态变化用 updateStatusPanel 落账·没有状态栏不硬造）。缺省=不追加，行为不变。 */
    statusTool?: boolean
    /** 建状态栏 scope 确认（非阻塞·仅 decisionTools + statusSystem + 接缝在位）：
     *  true=用户明确要求或出现值得长期管理的新信息时，可 confirmStatusScope 请求确认；不得按角色清单强制补栏。
     *  缺省=不出现，行为不变。批次4 的 'confirm'|'build' 三态已退役（建卡迁「造册」子agent）。 */
    statusScopeTool?: boolean
    /** 已落库正文后的轮后审计/补演；改用轮后纲领与零角色收尾口径。 */
    postRoundSupplement?: boolean
    /** 3b-3·提调可见各池 grounding 块（renderDirectorVisiblePoolsBlock 产出）：非空时注入 user 供提调据各角色已掌握资料定方向，
     *  并追加 GROUP_DIRECTOR_POOL_GUARD_PROTOCOL 方向护栏。缺省（开关关/池空）不注入，行为不变。 */
    poolVisibilityBlock?: string
    /** 状态栏短目录：renderDirectorStatusPanelsBlock 只产出用户分类、用途描述、宿主和字段轮廓。
     *  非空时作为 user 侧参考块注入；字段当前值命中后用 readStatusPanels 展开。无状态栏时只给显式空态，
     *  不按角色名单推导“缺栏”；缺省/空串代表取数失败，不注入。 */
    statusPanelsBlock?: string
    /** 世界级叙事种子批次2：服务端硬代码按时间、地点、参与者、依赖筛出的候选判断。只给提调。 */
    narrativeSeedsBlock?: string
    /** 统一上下文尚未接线时的会话世界投影兼容块。它是轮级动态业务投影，只能进入 user 的【2·当前情境】，不得追加到 system。 */
    worldContextBlock?: string
    /** 批次4-投影 A（灰度开关 directorProjectionContext ON）：开局上下文已喂投影态客观事实，
     *  grounding 协议/决策 loop step 1 切「默认读投影、原文仅按需」（readMessageProjection 列前）。
     *  缺省（开关关）走原文摘要 + 原协议，行为不变。 */
    projectionFirst?: boolean
    /** 支线②·提调知识库恒定块：运行时读取 + 渐进披露组装的恒定部分（身份/过程输出口吻/聊天区环境/能力清单）。
     *  非空时**前置**到 system 最前（先框住人设/语气/能力边界，再进导演协议）；由 buildTidiaoKnowledgeInjection
     *  返回的 constantBlock 产出。缺省（读不到源文/未接入）不前置，行为不变。
     *  批D·D2（2026-07-12）：命中的环境小节不再随本字段一起前置进 system——见下面 matchedKnowledgeBlock。 */
    knowledgeBlock?: string
    /** 批D·D2（2026-07-12·缓存重排）：提调知识库命中环境节（buildTidiaoKnowledgeInjection 返回的
     *  matchedEnvBlock）。随当轮语料变化，不进 system；本函数只把它透传给 assembleGroupDirectorMessages
     *  的 matchedKnowledge 参，由该函数收进层4 的按需知识子块。缺省/空串=不插入，行为不变。 */
    matchedKnowledgeBlock?: string
    /** 上一轮情境：管线据 sessionId 从服务端正式编排资料读出、renderLastScenarioBlock 渲染后传入。
     *  仅 decisionTools 模式注入（非 decision 一次性 JSON 路径无 readScenarioSkill·谈不上沿用）；缺省/空串=不注入，行为不变。
     *  纠偏整轮重排（replanText）本就要「不沿用上一轮情境」，由管线控制不传。 */
    lastScenarioBlock?: string
    /** 旧上轮剧本摘要兼容输入已退役；缺省/空串不注入。 */
    scriptDigestBlock?: string
    /** 增量 3·历次用户 OOC 私密指令（跨轮累积·renderDirectorDirectiveHistoryBlock 产出）：非空即注入「5·提调带信息流」层，
     *  作为提调对用户历次编排要求的长期记忆。缺省/空串=不注入。本轮新私密指令仍走 input.directorDirectives 当轮路径。 */
    directiveHistoryBlock?: string
    /** 增量 4·层1可调用工具清单（renderDirectorCallableToolsBlock 产出·真值=本轮注册表 name+brief）：非空即置于 1·可调用资料层最前，
     *  给「本轮能调什么」的结构化总览。缺省/空串=不注入。 */
    callableToolsBlock?: string
    /** 增量 4·层1「可按需展开的知识库」2.0 速览索引（buildTidiaoKnowledgeIndex 产出）：非空即置于工具清单之后、情境/协议之前，
     *  框住「还有哪些环境知识可按需展开」。与层0知识块 includeEnvIndex:false 配对不重复。缺省/空串=不注入。 */
    knowledgeIndexBlock?: string
  } = {}
): GroupDirectorPromptParts {
  // 0-6 分层装配（2026-07-02·用户重定义）：真实 prompt 按命名层拼，稳定→动态排序保 KV 前缀缓存。
  //   system = 0·总纲领（知识库恒定块+主纲领） + 1·可调用资料（工具清单+知识索引+情境/旁白清单+工作协议）
  //   user   = 3·对话可见历史 → 〔各角色已掌握资料〕 → 2·当前情境 → 〔状态栏〕 → 5·提调带信息流（出场名单+用户诉求+私密指令）
  //            → 4·已读资料（含命中知识子块）→ 6·本轮 TODO → 收束句（后三段由 assembleGroupDirectorMessages 接续拼，见其注释）
  //   物理位置按 chat API 需要分 system/user，但每层带「【N·名】」标题，模型据标题分层（见 DIRECTOR_LAYER_HEADER）。
  //   批D·D2（2026-07-12·缓存重排）：leadingSections 物理序改「3→池→2→状态栏」（此前是「2→状态栏→3→池」）——
  //   层3 对话历史近似 append-only、增长稳定应放最前；情境/状态栏每轮变，物理后置顺带吃 recency 注意力红利。
  const H = DIRECTOR_LAYER_HEADER
  const roster = input.candidates
    .map((c) => `- ${c.name}（characterId=${c.characterId}）`)
    .join('\n')
  // ── user 侧 ──
  // 2·当前情境：世界基调 + 当前场景（时间/地点/天气） + 上一轮情境承接（批次 C·仅 decisionTools 模式注入·空则不注入）。
  const toneLine = input.toneContext ? `世界基调：${input.toneContext}` : ''
  const sceneLine = input.sceneContext ? `当前场景：${input.sceneContext}` : ''
  const lastScenarioInner = options.decisionTools && String(options.lastScenarioBlock || '').trim()
    ? String(options.lastScenarioBlock).trim()
    : ''
  // 串行压缩批A（2026-07-13）：层2【上轮剧本摘要】——仅 decisionTools 模式注入（一次性 JSON 路径无 consultScript）。
  const scriptDigestInner = options.decisionTools && String(options.scriptDigestBlock || '').trim()
    ? String(options.scriptDigestBlock).trim()
    : ''
  const worldContextInner = String(options.worldContextBlock || '').trim()
  const sceneInner = [toneLine, sceneLine, worldContextInner, lastScenarioInner, scriptDigestInner].filter(Boolean).join('\n')
  // 3·对话可见历史：明确标「对话原文」还是「客观事实投影」（projectionFirst=ON 时开局喂的是投影态客观事实，非逐字原文）。
  const recentLabel = options.projectionFirst ? '最近对话〔客观事实投影·非逐字原文〕' : '最近对话〔对话原文〕'
  const historyInner = input.recentContext ? `${recentLabel}：\n${input.recentContext}` : ''
  // 各角色已掌握资料：3b-3·提调可见各池（定方向依据·非 0-6 层之一·辅助 reference）。
  const poolInner = String(options.poolVisibilityBlock || '').trim()
  // 5·提调带信息流：出场名单（候选+点名+排除） + 用户这轮的话 + 用户私密提调指令（双层方括号【【…】】只给提调看·高优先级·绝不泄露到旁白/台词）。
  //   批次D 起该层在 loop 内每 turn 由重建器追加「操作日志」（thought/工具调用/结果/报错）；此处只装开局态。
  const forcedLine = input.forcedCharacterIds.length
    ? `用户已点名/@（必须包含且最前）：${input.forcedCharacterIds.join(', ')}`
    : ''
  const excludedLine = input.excludedCharacterIds.length
    ? `用户已排除（绝不出场）：${input.excludedCharacterIds.join(', ')}`
    : ''
  const rosterInner = [`出场名单｜候选角色：\n${roster}`, forcedLine, excludedLine].filter(Boolean).join('\n')
  const directives = (Array.isArray(input.directorDirectives) ? input.directorDirectives : [])
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
  const directiveInner = directives.length
    ? [
      '【用户私密指令·必须遵守·禁止泄露】下面是用户本轮只对你（提调）下达的私密指令，用双层方括号【【…】】包裹发出，只有你能看到：',
      directives.map((item, index) => `${index + 1}. ${item}`).join('\n'),
      DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL,
      '① 必须在本轮 situation/narration/cast 的方向与实际后续生成里落实这些指令，不能只在 thought 里口头确认；',
      '② 绝对禁止把指令文字、含义或「用户下过私密指令」这件事泄露到旁白正文、角色台词等任何剧情可见产出；角色并不知情，不要让角色像听到了指令一样反应；',
      '③ 允许在 thoughts 决策流里简短反映「已收到用户私密安排并据此调度」（thoughts 是给用户看的导演旁述、不是剧情产出），但不要复述指令原文。',
    ].join('\n')
    : ''
  // 增量 3·历次 OOC 私密指令（跨轮累积·长期记忆）：置于出场名单之后、本轮诉求/当轮私密指令之前。
  const directiveHistoryInner = String(options.directiveHistoryBlock || '').trim()
  // 纯私密指令轮（2026-07-04）：用户整条只有【【…】】时正文为空——如实告知提调「没有可见发言」，
  // 有指令则按指令编排、无指令（理论兜底）按情境自然推进；绝不能渲染成空引号「」误导提调。
  const userSaidLine = String(input.userText || '').trim()
    ? `用户这轮说：「${input.userText}」`
    : directives.length
      ? '用户这轮没有可见发言，只下达了下面的私密指令；请据指令编排本轮，角色并不知情，正文按剧情自然继续。'
      : '用户这轮没有新发言，请按当前情境自然推进剧情。'
  const streamInner = [rosterInner, directiveHistoryInner, userSaidLine, directiveInner].filter(Boolean).join('\n\n')
  const closing = options.decisionTools
    ? options.postRoundSupplement
      ? '请开始轮后收束：以已落库正文为事实起点，先审计并落账，结算全部待引爆种子，只在真有缺口时补旁白或角色反应，没有缺口就零角色直接 finishRound。'
      : '请开始统筹本轮：互不依赖的动作并在同一轮一起发起（一次输出多个决策工具调用＋一句导演 thought），有依赖才分轮（判情境→定旁白→逐个定角色方向→finishRound 收尾）。'
    : '请一次统筹本轮剧本（thoughts / situation / narration / cast），严格输出 JSON。'
  // 真机修①（2026-07-03）：重建带操作日志时的续轮收束句——明确「日志=已完成的步骤·别复述·直接下一步工具调用」。
  const closingContinue = options.decisionTools
    ? options.postRoundSupplement
      ? `上面【5·提调带信息流】末尾是轮后已完成的审计、落账或补演步骤，不要重复。继续完成尚未处理的事实核对、待引爆结算和必要补演；不需补演时无需添加角色，直接 finishRound。记住：${TOOL_CALL_REALITY_RULE}`
      : `上面【5·提调带信息流】末尾的操作日志是你在本轮**已经完成**的步骤，不要把它们再说一遍、更不要重复调用已经调过且成功的工具。请直接发起还没做的决策工具的原生函数调用继续推进（互不依赖的一起发，还缺什么补什么：情境→旁白→逐个定角色方向→finishRound 收尾）。记住：${TOOL_CALL_REALITY_RULE}`
    : closing
  // user 侧层5 之前的段：批D·D2（2026-07-12 缓存重排）物理序改「历史→池→情境→状态栏」（原「情境→状态栏→历史→池」）——
  // 层3 对话历史近似 append-only、增长稳定该放最前；池比情境更稳定（一整局对话内基本不变）次之；
  // 情境/状态栏每轮变，物理后置顺带吃 recency 注意力红利。非空层才出现，层5+closing 由 assemble 收束在后。
  const leadingSections: string[] = []
  if (historyInner) leadingSections.push(`${H.history}\n${historyInner}`)
  if (poolInner) leadingSections.push(`〔各角色已掌握资料·你定方向的依据〕\n${poolInner}`)
  const narrativeSeedsInner = String(options.narrativeSeedsBlock || '').trim()
  if (narrativeSeedsInner) leadingSections.push(narrativeSeedsInner)
  if (sceneInner) leadingSections.push(`${H.scene}\n${sceneInner}`)
  // 状态系统融入批次1：状态栏 MD 常驻块（非 0-6 层之一·辅助 reference 同池块）。
  const statusPanelsInner = String(options.statusPanelsBlock || '').trim()
  if (statusPanelsInner) {
    leadingSections.push(`〔当前对话状态栏·短目录〕\n（这里只列用户自定义分类、用途摘要、宿主和字段轮廓，不含当前值。命中本轮相关状态栏后，用 readStatusPanels 按引用展开；不得从目录猜值，也不得按系统预设类别猜优先级。）\n${statusPanelsInner}`)
  }
  // ── system 侧 ──
  // 0·总纲领：知识库（身份/口吻/能力速览·最前立人设） + 主纲领（决策步骤/一次性剧本兜底）。
  // 倾向迁移批次1（2026-07-10）：编排倾向层0注入已撤——剧情倾向的第一消费者改为编剧 subagent
  // （buildSessionScriptwriterSeam 接缝注入），统筹经编剧 guidance 间接贴倾向；纠偏/replyPlan 分镜层保留注入。
  let outline = options.decisionTools
    ? options.postRoundSupplement
      ? buildPostRoundDecisionLoopSystemPrompt(Boolean(options.projectionFirst), Boolean(options.curtainTool), Boolean(options.scriptTool), Boolean(options.statusTool), Boolean(options.researchTool), Boolean(options.statusScopeTool))
      : buildDirectorDecisionLoopSystemPrompt(Boolean(options.projectionFirst), Boolean(options.curtainTool), Boolean(options.scriptTool), Boolean(options.statusTool), Boolean(options.researchTool), Boolean(options.statusScopeTool))
    : DIRECTOR_SYSTEM_PROMPT
  const knowledge = String(options.knowledgeBlock || '').trim()
  if (knowledge) outline = `${knowledge}\n\n${outline}`
  // 1·可调用资料：可调用工具清单 + 可按需展开的知识库索引 + 可用情境清单 + 可用旁白 skill 清单 + 各工作协议
  //   （读楼层/取料/池护栏/自主/实时旁述）——你这轮能读、能调用的资料与工具。
  const callableParts: string[] = []
  // 增量4·层1 最前：先给「本轮能调什么、能按需展开哪些环境知识」的总览，再进具体情境/旁白/协议。
  if (String(options.callableToolsBlock || '').trim()) callableParts.push(options.callableToolsBlock!.trim())
  if (String(options.knowledgeIndexBlock || '').trim()) {
    callableParts.push(`可按需展开的知识库（下面各环境小节相关时会自动补细节）：\n${options.knowledgeIndexBlock!.trim()}`)
  }
  if (options.decisionTools) {
    if (String(options.scenarioGuide || '').trim()) callableParts.push(options.scenarioGuide!.trim())
    if (String(options.narrationGuide || '').trim()) {
      // F3·旁白彻底归提调：列出可用旁白 skill（readNarrationSkill/confirmNarrationCall 的 profileId 取括号前 id）+
      // generatedPrompt 编写指南（与单聊导演 loop、独立旁白 subagent 共用同一份，避免漂移）。
      callableParts.push(`可用旁白 skill（readNarrationSkill/confirmNarrationCall 的 profileId 取括号前的 id）：\n${options.narrationGuide!.trim()}\n\n${NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE}`)
    }
  }
  // 批次4-投影 A：projectionFirst 时用 grounding 协议「投影优先」变体（默认读投影、原文仅按需）。
  if (options.grounding) {
    callableParts.push(options.projectionFirst ? GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST : GROUP_DIRECTOR_GROUNDING_PROTOCOL)
  }
  // 批次3（2026-07-10）：采风接缝在位才追加知识钻取协议（取代旧三件套 retrieval 协议·dispatchResearch 已注册才谈派采风）。
  if (options.researchTool) callableParts.push(GROUP_DIRECTOR_RESEARCH_DISPATCH_PROTOCOL)
  // 地图系统批5（2026-07-11）：绘舆接缝在位才追加地图信号协议（dispatchMapWork 已注册才谈派绘舆·渐进式披露层1）。
  if (options.mapTool) callableParts.push(GROUP_DIRECTOR_MAP_DISPATCH_PROTOCOL)
  // 3b-3·池可见时追加方向护栏（按角色隔离 + 信息差造张力）。
  if (poolInner) callableParts.push(GROUP_DIRECTOR_POOL_GUARD_PROTOCOL)
  if (options.autonomy) callableParts.push(GROUP_DIRECTOR_AUTONOMY_PROTOCOL)
  if (options.liveNarration) callableParts.push(GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL)
  // 装配 system：0·总纲领恒有；1·可调用资料非空时才出现。
  let system = `${H.outline}\n${outline}`
  if (callableParts.length) system = `${system}\n\n${H.callable}\n${callableParts.join('\n\n')}`
  return { system, leadingSections, streamInner, closing, closingContinue }
}

function toCleanString(value: unknown, limit = 400): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

/**
 * 解析统筹 pass 输出 → RoundDirectorScript。
 * 容错抽 JSON；cast 校验在候选内、去重保序；thoughts 过滤空串限 6 条；非法/空返回 null（管线据此回退）。
 */
export function parseGroupDirectorOutput(raw: unknown, candidateIds: string[]): RoundDirectorScript | null {
  const text = typeof raw === 'string' ? raw : ''
  if (!text.trim()) return null
  let parsed: unknown
  try {
    const match = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(match ? match[0] : text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  const candidateSet = new Set(candidateIds)
  const seen = new Set<string>()
  const cast: RoundDirectorCastEntry[] = []
  const castRaw = Array.isArray(obj.cast) ? obj.cast : []
  for (const item of castRaw) {
    if (!item || typeof item !== 'object') continue
    const id = String((item as Record<string, unknown>).characterId ?? '').trim()
    if (!id || seen.has(id) || !candidateSet.has(id)) continue
    seen.add(id)
    cast.push({ characterId: id, direction: toCleanString((item as Record<string, unknown>).direction) })
  }
  // cast 为空（模型没给合法出场）视为统筹失败，管线回退。
  if (!cast.length) return null

  const narrationRaw = (obj.narration && typeof obj.narration === 'object') ? obj.narration as Record<string, unknown> : {}
  const narration = {
    want: narrationRaw.want === true,
    direction: narrationRaw.want === true ? toCleanString(narrationRaw.direction) : ''
  }

  const thoughts = (Array.isArray(obj.thoughts) ? obj.thoughts : [])
    .map((t) => toCleanString(t, 120))
    .filter(Boolean)
    .slice(0, 6)

  return {
    situation: toCleanString(obj.situation),
    narration,
    cast,
    thoughts
  }
}

/**
 * 合并 forced（点名/@）与统筹 cast：forced 按检测顺序最前（统筹未给方向的 forced 角色补默认方向），
 * 再接统筹 cast；去重保序、剔除 excluded 与非候选。
 */
export function mergeDirectorCast(
  forcedCharacterIds: string[],
  directorCast: RoundDirectorCastEntry[],
  excludedCharacterIds: string[],
  candidateIds: string[]
): RoundDirectorCastEntry[] {
  const candidateSet = new Set(candidateIds)
  const excluded = new Set(excludedCharacterIds)
  const byId = new Map(directorCast.map((entry) => [entry.characterId, entry]))
  const seen = new Set<string>()
  const result: RoundDirectorCastEntry[] = []
  const order = [...forcedCharacterIds, ...directorCast.map((entry) => entry.characterId)]
  for (const rawId of order) {
    const id = String(rawId ?? '').trim()
    if (!id || seen.has(id) || excluded.has(id) || !candidateSet.has(id)) continue
    seen.add(id)
    const entry = byId.get(id)
    result.push(entry || { characterId: id, direction: '用户点名/@ 了你，请在本轮回应。' })
  }
  return result
}

/** 有序统筹 cast → 群聊执行所需 replyOrder 形状（cast 选中的都 mustReply）。 */
export function directorCastToReplyOrder(cast: RoundDirectorCastEntry[]): Array<{ characterId: string; mustReply: boolean; probability: number }> {
  return cast.map((entry) => ({ characterId: entry.characterId, mustReply: true, probability: 1 }))
}
