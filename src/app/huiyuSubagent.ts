/**
 * 「绘舆」地图 subagent（地图系统批5·2026-07-11 用户拍板·采风/造册/绘舆同族第三子）。
 *
 * 定位：提调（统筹/纠偏）发现剧情出现地图信号（角色移动/新地点落名/进入迷雾未探区），用 dispatchMapWork
 * 把任务书（剧情事实：谁从哪到哪、新地点相对方位、地形观感——**不给坐标**，坐标绘舆读图自己定）派给绘舆；
 * 绘舆在自己的干净小上下文里先 readMapSummary 看清格局，再造形上图/挪角色/扩探索范围，最后 submitMap 交稿。
 * v1 全世界只有绘舆一个地图写手（用户 UI 只读·提调/星依只派发）。
 *
 * 上下文渐进式披露（计划书「绘舆上下文渐进式披露」节）：地图硬规则由 manifest 常驻 Skill 进入 0 层，
 * 详细手册只显示目录并由 readMapManual 按需读取；图面数据靠工具两级读扛
 * （readMapSummary 摘要 → readMapFeature 钻取），图再大也不撑上下文。
 *
 * 形态：与造册同款 runAgentRuntime 独立小 loop；工具集=地图九件（buildHuiyuMapTools）+可选采风只读集
 * （buildCaifengToolset·读对话/状态栏核对剧情事实）+ submitMap 交稿即 terminate。
 * UI 复用 subagentRunStatus 运行卡，subagentId=`huiyu:<taskKey>`。模型=balanced 校书档
 * （modelTaskTiers 'mapDraw'·管线注入）。
 */

import type { ToolDefinition } from './agentRuntime/toolRegistry'
import type { HookDefinition } from './agentRuntime/hookRegistry'
import type { SubagentRunUsage } from './subagentRunStatus'
import { runSubagentLoop, SUBAGENT_LOOP_TIMEOUT_MS } from './subagentLoop'
import { buildCaifengToolset, type CaifengToolsetDeps } from './caifengSubagent'
import { buildHuiyuMapTools, buildHuiyuReadOnlyMapTools, type HuiyuMapToolsDeps } from './huiyuMapTools'
import { assembleAgentSkillSupply } from './agentSupply'

export const HUIYU_SUBAGENT_ID_PREFIX = 'huiyu'
export const HUIYU_SUBAGENT_LABEL = '绘舆'
export const HUIYU_SUBMIT_TOOL_NAME = 'submitMap'
/** 草案轮（批3·两段式派发）subagentId 前缀——与落笔轮 huiyu 分开，浮坞运行卡区分「拟稿中」/「绘图中」两态。 */
export const HUIYU_DRAFT_SUBAGENT_ID_PREFIX = 'huiyu-draft'
export const HUIYU_SUBMIT_LAYOUT_DRAFT_TOOL_NAME = 'submitLayoutDraft'

/** 绘舆预算：作图任务必须收敛（读格局+画1~4个要素+扩范围+交稿·与采风/造册同刻度）；死循环兜底=超时。 */
const HUIYU_BUDGET = { maxTurns: 12, maxToolCalls: 24 }
const HUIYU_NUDGE_MAX = 2

export interface HuiyuMapWorkInput {
  /** 作图任务短标题（显示在运行卡上，如「一行人抵达临澜城」）。 */
  task: string
  /** 任务书：剧情事实逐条（谁从哪到哪/新地点相对方位与距离描述/地形观感）——不含坐标，坐标绘舆读图自定。 */
  instructions: string
  /** 建议方向（可选，如「先挪柳如烟的位置 marker 再补画港口」）。 */
  focus?: string
}

export interface HuiyuMapWorkResult {
  ok: boolean
  /** 给提调/用户看的完成摘要（画了什么、位置依据什么定的）。 */
  summary: string
  /** 改动清单（画/挪/删了哪些要素·扩了范围）。 */
  changes: string[]
  /** 更新后的地图格局简述（带回给提调续写剧情用：谁在哪、新地物与既有地物的方位关系）。 */
  mapDigest: string
  /** 交稿体检附注（批C·deps.audit 在场且有发现项才有）：放行不阻塞，仅如实告知提调可据此重派或忽略。 */
  auditNotes?: string
  /** 缺料清单（自由创作准则·知识库第十节）：ok=false 且本字段非空——**不是故障**，是绘舆如实说明遇到了
   *  「任务本身无法理解」或「目标世界不存在」这两种真正无法继续的情况，星依/提调应如实转告用户/用户而
   *  非当失败重试；设定缺细节不算缺料，按自由创作准则大胆创作即可，不该走到这里。 */
  missingInfo?: string[]
  /** 失败原因（ok=false 且 missingInfo 未给才是真故障：超时/超预算/没交稿/被停止/会话未挂世界）。 */
  error?: string
  /** 本轮工具调用失败记录（笔刷约束系统批B 事故根因3对症·2026-07-12·可选）：runHuiyuMapWork 内部收集
   *  的全部 error 状态工具结果，供编排层（huiyuOrchestration.ts 续画环）摘录"上一轮对应失败原因"塞进
   *  追加轮任务书——不是给绘舆自己看的，是给下一轮续画任务书用的诊断素材。 */
  toolErrors?: HuiyuToolFailureEntry[]
}

/** 单条工具调用失败记录（见 HuiyuMapWorkResult.toolErrors 注释）。 */
export interface HuiyuToolFailureEntry {
  toolName: string
  /** 失败调用的 name 参数（drawMapRegion/drawMapPath/drawMapMarker 等的要素名，取自 toolCall.args.name）。 */
  name?: string
  category?: string
  message: string
}

/** 草案剪影项（地图草案剪影可视化计划批1·协议定稿）：绘舆草案轮结构化产出，纯前端预览示意——
 *  不入库、不走正式笔刷硬门，落笔时仍用真笔刷+全部约束重画。字段逐字照抄计划书协议，不许改名。 */
export interface HuiyuDraftSketchItem {
  /** 一轮内唯一，绘舆自拟（如 'sk-1'）。 */
  id: string
  action: 'add' | 'modify' | 'delete'
  /** modify/delete 指向现有要素。 */
  targetFeatureId?: string
  kind: 'region' | 'path' | 'marker'
  /** 现役35类目之一（同第二节词汇表，本字段不做硬校验）。 */
  category: string
  /** 显示名，如「赫兹塔尔盆地」。 */
  label: string
  /** 粗糙几何（米，与正式笔刷同坐标系）。 */
  sketch: {
    /** region 椭圆剪影 / marker 单点。 */
    center?: [number, number]
    rx?: number
    ry?: number
    /** path 折线 / region 粗多边形（3~8点）。 */
    points?: Array<[number, number]>
  }
  /** 绿=确定可落笔 黄=需确认 红=高风险。 */
  confidence: 'ready' | 'confirm' | 'risk'
  /** 每字段≤3短句。 */
  card: { change: string; basis?: string; risk?: string }
}

/** 格局草案结果（批3 两段式派发·草案轮 submitLayoutDraft 产物）：只拟稿不画图，天然无副作用。 */
export interface HuiyuLayoutDraftResult {
  ok: boolean
  /** 草案人话版（要素清单+相对方位与距离+量级观感，读起来像一段清楚的说明）。有 sketches 时压到≤5行总览，
   *  细节全进每项 card——这是"晕字"的根治点（地图草案剪影可视化计划批1）。 */
  summary: string
  /** 依据：任务书/钻探结论里确凿的事实点（逐条）。 */
  facts: string[]
  /** 假设：绘舆自己的合理推测、未经证实（逐条·确认卡会向用户显式声明这些是假设）。 */
  assumptions: string[]
  /** 缺料清单：已知事实撑不起的部分（逐条如实列出；可为空=信息充分）。 */
  missingInfo: string[]
  /** 结构化剪影清单（批1·可选增强）：绘舆给了就走剪影卡确认（前端画 overlay 供用户点选）；不给时
   *  确认卡走现行纯文字流程——零回归接缝。 */
  sketches?: HuiyuDraftSketchItem[]
  /** 失败原因（ok=false 才有：超时/超预算/没交回/被停止）。 */
  error?: string
}

/** 字符串数组归一（changes/facts/assumptions/missingInfo 共用）：非数组按空处理，逐项裁前后空白并去空。 */
function readStringList(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)
}

const HUIYU_SKETCH_KIND_VALUES = ['region', 'path', 'marker']
const HUIYU_SKETCH_ACTION_VALUES = ['add', 'modify', 'delete']
const HUIYU_SKETCH_CONFIDENCE_VALUES = ['ready', 'confirm', 'risk']

/** 剪影清单校验（地图草案剪影可视化计划批1 协议定稿）：非数组/未给=跳过（可选增强，零回归）；
 *  数组非空时逐项按协议硬校验，返回第一条可读错误供模型据此重交；全部合法返回 null。
 *  不做的事：不校验 category 是否在35类目表内（协议未要求，交给落笔轮真笔刷把关）。 */
function validateDraftSketches(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return 'sketches 必须是数组（每项一条剪影）'
  const seenIds = new Set<string>()
  for (let i = 0; i < value.length; i++) {
    const raw = value[i]
    const tag = `sketches[${i}]`
    if (!raw || typeof raw !== 'object') return `${tag} 不是对象`
    const item = raw as Record<string, unknown>
    const id = String(item.id || '').trim()
    if (!id) return `${tag} 缺少 id`
    if (seenIds.has(id)) return `sketches 中 id「${id}」重复——一轮内必须唯一`
    seenIds.add(id)
    const label = `${tag}（id=${id}）`
    const action = item.action
    if (!HUIYU_SKETCH_ACTION_VALUES.includes(action as string)) return `${label} action 必须是 add/modify/delete 之一`
    if ((action === 'modify' || action === 'delete') && !String(item.targetFeatureId || '').trim()) {
      return `${label} action 为 ${action} 时必须带 targetFeatureId（指向现有要素）`
    }
    const kind = item.kind
    if (!HUIYU_SKETCH_KIND_VALUES.includes(kind as string)) return `${label} kind 必须是 region/path/marker 之一`
    if (!String(item.category || '').trim()) return `${label} 缺少 category`
    if (!String(item.label || '').trim()) return `${label} 缺少 label（显示名）`
    const sketch = item.sketch as Record<string, unknown> | undefined
    if (!sketch || typeof sketch !== 'object') return `${label} 缺少 sketch（粗糙几何）`
    const center = sketch.center
    const points = sketch.points
    const hasCenter = Array.isArray(center) && center.length === 2 && center.every((n) => typeof n === 'number')
    const hasPoints = Array.isArray(points) && points.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number'))
    if (kind === 'marker') {
      if (!hasCenter) return `${label} kind=marker 必须带 sketch.center（[x,y]，米）`
    } else if (kind === 'path') {
      if (!hasPoints || (points as unknown[]).length < 2) return `${label} kind=path 必须带 sketch.points（至少 2 个点的折线）`
    } else if (kind === 'region') {
      const hasEllipse = hasCenter && (typeof sketch.rx === 'number' || typeof sketch.ry === 'number')
      const hasPolygon = hasPoints && (points as unknown[]).length >= 3
      if (!hasEllipse && !hasPolygon) {
        return `${label} kind=region 必须带 sketch.center+rx/ry（椭圆，优先）或 sketch.points（至少 3 个点的粗多边形）`
      }
    }
    if (!HUIYU_SKETCH_CONFIDENCE_VALUES.includes(item.confidence as string)) {
      return `${label} confidence 必须是 ready/confirm/risk 之一`
    }
    const card = item.card as Record<string, unknown> | undefined
    if (!card || typeof card !== 'object' || !String(card.change || '').trim()) {
      return `${label} card.change 必填（一句话说清这一项改动是什么）`
    }
  }
  return null
}

/** 剪影清单归一（校验通过后调用，execute 内取值用）：非数组按空处理。 */
function readSketchList(value: unknown): HuiyuDraftSketchItem[] {
  return Array.isArray(value) ? (value as HuiyuDraftSketchItem[]) : []
}

const HUIYU_SYSTEM_PROMPT_BASE = [
  '你是「绘舆」——琅嬛聊天区提调（导演）的舆图绘制专员，也是这个世界唯一的地图写手。提调把剧情里的地图信号（角色移动/新地点/探索了未知区域）整理成任务书交给你；你的唯一职责是把这些剧情事实忠实落到舆图上，然后交稿。',
  '',
  '工作流程：',
  '1) 先读任务书：谁动了、从哪到哪、新地点相对既有地物的方位与距离、地形观感。任务书给的是剧情事实，坐标由你读图后自己定。',
  '2) 若任务书前部已带【当前图面格局·派发时快照】：那就是派发时的现有格局，非必要不用再开局 readMapSummary（快照可能略旧，涉及精确坐标的改动前仍可用 readMapSummary 复核）；没带快照就必先 readMapSummary 看清现有格局（谁在哪、多大、相互方位）——没有图纸就先 createMapSheet 建主图纸并给初始探索范围。',
  '3) 落笔：面状地物用 drawMapRegion 参数化造形（中心可用 anchor 相对既有要素定位·别硬编顶点）；线状用 drawMapPath——推荐给 from/to 挂既有要素（河流终点挂海洋/湖泊会自动吸附到岸边，不会断连），别自己猜端点坐标；建筑地标与角色位置用 drawMapMarker；角色移动=updateMapFeature 挪既有 character marker（不要删了重建）。位置拿不准就再 readMapFeature 钻取精确边界。',
  '4) 守迷雾铁律：新要素落在探索范围外必须同轮 expandExplored（推荐带 coverFeatureIds 自动包络，新范围完整涵盖旧范围）；否则用户根本看不见你画的东西。',
  '5) 交稿前可调用 auditMap 自查一次（会自动吸附轻微断连并报告其余问题）。交稿：调用 submitMap 提交——summary 写清画了什么、位置依据什么定的；changes 逐条列改动；mapDigest 用两三句话概括更新后的格局（谁在哪、新地物与既有地物的方位关系），提调靠它续写剧情。',
  '',
  '铁律：',
  '- 只画任务书里的剧情事实，不自行虚构地物；名字与设定拿不准的写进交稿摘要请提调定夺。',
  '- 舆图之外不做任何修改：不改消息、不动文档、不碰状态栏的值。',
  '- 一轮多笔：相互独立、不依赖彼此实际画后坐标的要素，尽量在同一轮里连续发起多个画笔工具调用（引擎按顺序依次执行），不要一轮只画一笔慢慢磨；只有确实需要先看上一笔的真实结果（如吸附/推开/嵌套裁剪后的坐标）才需要分轮等结果回来再画下一笔。',
  '- 不要漫游：一次任务通常 1~4 个要素改动，画完就收；同一个查询别重复发。',
  '- 自由创作准则（知识库第十节）：设定资料有就用；没有就按世界观常识大胆创作，草案/交稿就是用户把关点，不必逐条问清楚才动笔。missingInfo 只在「任务本身无法理解」或「目标世界不存在」这两种真正无法继续时才填（调用 submitMap 改填缺料清单，逐条列清楚卡在哪，summary 写清已经画到哪一步，mapDigest 可留空）；除此之外一律按常识大胆画完正常交稿，不要因为设定没写明细节就交回缺料清单。',
  '- 最后必须真调用 submitMap 交稿——光在正文里说画好了不算；画不成也要交稿说明卡在哪。'
].join('\n')

/** 绘舆 system=结构性纲领 + manifest 已授权并装载的 Skill 供给。 */
export function buildHuiyuSystemPrompt(skillSupply = ''): string {
  const supply = String(skillSupply || '').trim()
  return supply ? `${HUIYU_SYSTEM_PROMPT_BASE}\n\n${supply}` : HUIYU_SYSTEM_PROMPT_BASE
}

/** 草案轮（批3·两段式派发）system base：只拟格局草案，没有画图/写入工具——想落笔的冲动等确认后的落笔轮再说。 */
const HUIYU_DRAFT_SYSTEM_PROMPT_BASE = [
  '你是「绘舆」——此刻在草案轮：只负责拟一份「格局草案」给用户确认，不动笔画图（这一轮没有画图/写入工具）。',
  '',
  '工作流程：',
  '1) 先读任务书：谁动了、从哪到哪、新地点相对既有地物的方位与距离、地形观感。',
  '2) 若任务书前部已带【当前图面格局·派发时快照】：那就是派发时的现有格局，非必要不用再开局 readMapSummary（快照可能略旧，涉及精确坐标的改动前仍可用 readMapSummary 复核）；没带快照就必先 readMapSummary 看清现有格局（谁在哪、多大、相互方位）；要素细节不确定时 readMapFeature 钻取。',
  '3) 有钻探工具（对话/资料池/文档库/状态栏）时，先核实任务书里没说清的信息，别凭空猜。',
  '4) 汇总成草案：要素清单（要新增/改动什么）、相对既有地物的方位与距离（对照量级表换算成米级区间）、地形观感/量级。',
  '5) 依据 vs 假设必须分列：facts=任务书/钻探证实的确凿事实；assumptions=你自己的合理推测（草案会向用户显式声明"系我假设"，供确认或纠正）。',
  '6) 自由创作准则（知识库第十节）：设定资料有就用；没有就按世界观常识大胆创作补全量级/方位/周边地物，不必逐条问清楚才动笔——只有「任务本身无法理解」或「目标世界不存在」这两种真正无法继续的情况才把 missingInfo 填清楚说明卡在哪，除此之外一律按常识编，草案确认本身就是用户把关点。',
  '7) 交稿：调用 submitLayoutDraft 提交（summary+facts+assumptions+missingInfo）。这一轮的产物只是给用户看的草案，不是最终地图。',
  '',
  '铁律：',
  '- 本轮没有任何画图/写入工具——想落笔的冲动等草案确认后的落笔轮再说。',
  '- 不确定的都归入 assumptions 或 missingInfo，不要写进 facts。',
  '- 最后必须真调用 submitLayoutDraft 交稿——光在正文里说草案想好了不算。'
].join('\n')

/** 草案轮与落笔轮共用同一份 manifest Skill 供给。 */
export function buildHuiyuDraftSystemPrompt(skillSupply = ''): string {
  const supply = String(skillSupply || '').trim()
  return supply ? `${HUIYU_DRAFT_SYSTEM_PROMPT_BASE}\n\n${supply}` : HUIYU_DRAFT_SYSTEM_PROMPT_BASE
}

function renderHuiyuSkillSupply(layers: { '0': string; '1': string }): string {
  return [layers['0'], layers['1'] ? `【1·可按需读取的 Skill 目录】\n${layers['1']}` : '']
    .filter(Boolean)
    .join('\n\n')
}

/** 运行卡任务名提取（UI 用）：从 status.input（=renderHuiyuBrief/renderHuiyuDraftBrief 产物）首行
 *  「【作图任务】xxx」抽标题——草案轮/落笔轮首行格式一致，本函数两态通用。 */
export function extractHuiyuTaskTitle(input: string | undefined): string {
  const firstLine = String(input || '').split('\n', 1)[0] || ''
  const match = firstLine.match(/^【作图任务】(.*)$/)
  return match ? match[1].trim() : ''
}

/** 任务书 → user 消息（也是运行卡「提调 → 绘舆」内部信息流原文）。 */
export function renderHuiyuBrief(input: HuiyuMapWorkInput): string {
  const lines = [`【作图任务】${String(input.task || '').trim()}`, '', '【任务书（剧情事实·坐标你读图自定）】', String(input.instructions || '').trim()]
  const focus = String(input.focus || '').trim()
  if (focus) lines.push('', `【建议方向】${focus}`)
  lines.push('', '先 readMapSummary 看清格局再落笔；完成后调用 submitMap 交稿（summary+changes+mapDigest 格局简述）。')
  return lines.join('\n')
}

/** 草案任务书 → user 消息（批3 草案轮版本·首行格式与 renderHuiyuBrief 一致，供 extractHuiyuTaskTitle 复用解析）。 */
export function renderHuiyuDraftBrief(input: HuiyuMapWorkInput): string {
  const lines = [`【作图任务】${String(input.task || '').trim()}`, '', '【任务书（剧情事实·坐标你读图自定）】', String(input.instructions || '').trim()]
  const focus = String(input.focus || '').trim()
  if (focus) lines.push('', `【建议方向】${focus}`)
  lines.push('', '这一轮只拟格局草案给用户确认，不画图（没有画图工具）：先 readMapSummary 看清格局，需要时钻探核实，再调用 submitLayoutDraft 交回草案（summary+facts+assumptions+missingInfo）。')
  return lines.join('\n')
}

/** 绘舆工具集（落笔轮）：地图九件 + 可选采风只读集（caifeng deps 在位时装配·读对话/状态栏核对剧情事实）。
 *  联动能力：采风工具集变化时这里自动跟随（与造册同款复用口径）。 */
export function buildHuiyuToolset(deps: { map: HuiyuMapToolsDeps; research?: CaifengToolsetDeps | null }): ToolDefinition[] {
  return [
    ...(deps.research ? buildCaifengToolset(deps.research) : []),
    ...buildHuiyuMapTools(deps.map)
  ]
}

/** 绘舆工具集（批3 草案轮）：只读地图两件 + 可选采风只读集——不挂任何写工具，天然无副作用（画不了图，只能拟草案）。 */
export function buildHuiyuDraftToolset(deps: { map: HuiyuMapToolsDeps; research?: CaifengToolsetDeps | null }): ToolDefinition[] {
  return [
    ...(deps.research ? buildCaifengToolset(deps.research) : []),
    ...buildHuiyuReadOnlyMapTools(deps.map)
  ]
}

/** 按规则 ID 的连续违规熔断器（笔刷约束系统批A 新增）：BRUSH_SPEC 硬门（huiyuMapTools.buildViolationReceipt）
 *  把违规规则 ID 写进 error.details.ruleId；同一规则 ID 连续违规达 maxConsecutive 次（参数不同也算同类，
 *  不按"完全相同调用"去重——防止只是挪了几米又撞同一堵墙的推理循环漏判）即放弃当前笔画、直接写入
 *  holder.result 生成人工求助回执并终止 loop，不再纠缠模型继续试错。
 *  任何一次成功、或非规则化错误（如缺参数——没有 ruleId）都会打断连续计数：只统计"卡在同一堵墙"的连续
 *  尝试，不与其它错误混淆熔断判定。未达上限时通过 patchToolResult 把"还剩几次容错"缝进回执正文，
 *  呼应违规回执四要素的第④项（工具自身不追踪跨调用状态，剩余次数由本 loop 级 hook 补全）。
 *  ⚠️ 与 missingInfo 缺料语义严格区分：缺料是绘舆自己诚实交回"信息不够"，不算失败；本熔断是"参数/位置反复
 *  触犯同一条硬门"，属于真正卡住需转人工，两者不可混淆判定。 */
function createHuiyuRuleViolationCircuitBreaker(
  holder: { result: HuiyuMapWorkResult | null },
  maxConsecutive = 3
): HookDefinition {
  let lastRuleId: string | null = null
  let count = 0
  return {
    id: 'huiyu-rule-violation-circuit-breaker',
    lifecycle: 'afterToolResult',
    run: (event) => {
      const toolResult = event.toolResult
      if (!toolResult) return undefined
      if (toolResult.status !== 'error') { lastRuleId = null; count = 0; return undefined }
      const ruleId = String(toolResult.details?.ruleId || '').trim()
      if (!ruleId) { lastRuleId = null; count = 0; return undefined }
      count = ruleId === lastRuleId ? count + 1 : 1
      lastRuleId = ruleId
      if (count < maxConsecutive) {
        const remaining = maxConsecutive - count
        return {
          summary: `规则 ${ruleId} 连续违规 ${count}/${maxConsecutive} 次`,
          patchToolResult: { content: `${toolResult.content}（⚠️ 同一约束已连续触发第 ${count} 次，还剩 ${remaining} 次容错，超出将放弃当前笔画转人工处理——建议换个思路而非在附近反复试参数）` }
        }
      }
      holder.result = {
        ok: false,
        summary: '',
        changes: [],
        mapDigest: '',
        error: `同一约束规则（${ruleId}）连续违规 ${count} 次，已放弃当前笔画转人工处理。最近一次：${toolResult.content}`
      }
      return {
        summary: `规则 ${ruleId} 连续违规达上限 ${maxConsecutive} 次，熔断收束`,
        terminate: true
      }
    }
  }
}

/** 工具调用失败收集器（笔刷约束系统批B 事故根因3对症）：只读记录，不改变任何调用结果/不终止 loop——
 *  单纯把每次 error 状态的工具结果连同调用参数里的 name/category 存起来，供 runHuiyuMapWork 收尾时
 *  挂进 holder.result.toolErrors。与熔断器共用同一个 afterToolResult 生命周期，互不干扰（两个 hook
 *  各自独立注册，见 runHuiyuMapWork 的 extraHooks 数组）。 */
function createHuiyuToolFailureCollector(): { hook: HookDefinition; errors: HuiyuToolFailureEntry[] } {
  const errors: HuiyuToolFailureEntry[] = []
  return {
    errors,
    hook: {
      id: 'huiyu-tool-failure-collector',
      lifecycle: 'afterToolResult',
      run: (event) => {
        const toolResult = event.toolResult
        if (!toolResult || toolResult.status !== 'error') return undefined
        const args = (event.toolCall?.args || {}) as Record<string, unknown>
        const name = typeof args.name === 'string' ? args.name.trim() : ''
        const category = typeof args.category === 'string' ? args.category.trim() : ''
        errors.push({
          toolName: event.toolCall?.toolName || toolResult.toolName || '',
          ...(name ? { name } : {}),
          ...(category ? { category } : {}),
          message: String(toolResult.content || '').trim()
        })
        return undefined
      }
    }
  }
}

/** 交稿工具（绘舆私有·只活在绘舆 registry，不进提调语义表）。
 *  auditRunner 在场时交稿即跑一次 report-only 体检：有发现项写进 auditNotes 附注，**放行不阻塞**
 *  （计划书用户拍板②）；体检本身出错也不阻塞交稿（体检是锦上添花，不是交稿的前置门槛）。
 *  自由创作准则（知识库第十节）：missingInfo 只在「任务本身无法理解」或「目标世界不存在」这两种真正
 *  无法继续的情况下才非空，视为「缺料交回」——ok=false 但**不算工具错误**，跳过体检（没有实质变化/
 *  体检意义不大），mapDigest 可留空；设定缺细节不算缺料，应按自由创作准则大胆创作正常交稿。 */
function createSubmitMapTool(
  holder: { result: HuiyuMapWorkResult | null },
  auditRunner?: () => Promise<{ report: string; findingsCount: number } | null>,
  aestheticReviewHook?: (digest: string) => Promise<string | null>
): ToolDefinition {
  return {
    name: HUIYU_SUBMIT_TOOL_NAME,
    brief: '作图完成后交稿（唯一收尾方式）：summary=画了什么、位置依据什么定的；changes=逐条改动清单；mapDigest=更新后格局简述（提调靠它续写剧情）。'
      + 'missingInfo 仅当任务本身无法理解、或目标世界不存在这两种情况才填写（缺料清单，逐条列清楚卡在哪）+ summary 写清已经画到哪一步，mapDigest 可留空；'
      + '设定缺细节不算缺料，按自由创作准则（知识库第十节）大胆创作正常交稿即可。交稿时系统会自动体检一次，不阻塞。',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '完成摘要（必填）：画/挪/删了什么、位置与尺度依据什么剧情事实定的；卡在缺料上就写清已经画了什么/卡在哪。' },
        changes: {
          type: 'array',
          items: { type: 'string' },
          description: '改动清单（逐条，如「新增 region 玄岳山脉」「柳如烟位置移到临澜港」「探索范围扩至东海岸」）。'
        },
        mapDigest: { type: 'string', description: '更新后地图格局简述（两三句）：谁在哪、新地物与既有地物的方位关系——提调续写剧情的空间依据。missingInfo 非空时可留空（格局未实质变化）。' },
        missingInfo: {
          type: 'array',
          items: { type: 'string' },
          description: '缺料清单：仅当任务本身无法理解、或目标世界不存在时才填写（逐条列清楚卡在哪）；设定缺细节不算缺料，按自由创作准则大胆创作。非空时视为缺料交回，不算失败，mapDigest 可不填。'
        }
      },
      required: ['summary']
    },
    validateArgs: (args) => {
      if (!String(args.summary || '').trim()) return 'submitMap 缺少 summary（完成摘要）'
      const missingInfo = readStringList(args.missingInfo)
      if (!missingInfo.length && !String(args.mapDigest || '').trim()) {
        return 'submitMap 缺少 mapDigest（更新后格局简述——提调靠它续写剧情；若是缺料交回，请改填 missingInfo）'
      }
      return null
    },
    execute: async (toolCall) => {
      const changes = readStringList(toolCall.args.changes)
      const missingInfo = readStringList(toolCall.args.missingInfo)
      if (missingInfo.length) {
        holder.result = {
          ok: false,
          summary: String(toolCall.args.summary || '').trim(),
          changes,
          mapDigest: String(toolCall.args.mapDigest || '').trim(),
          missingInfo
        }
        return { content: '已收到缺料回执，任务结束（不算失败，如实转告即可）。', details: { kind: 'huiyuSubmit', missingInfo: true } }
      }
      let auditNotes: string | undefined
      if (auditRunner) {
        try {
          const audit = await auditRunner()
          if (audit) auditNotes = audit.report
        } catch {
          // 体检失败不阻塞交稿——放行优先
        }
      }
      // 识图审美自查留位钩子（笔刷约束系统批F·空挂载点，不实现真实审美判断）：deps 未接线时
      // aestheticReviewHook 恒为 undefined，本段整体跳过，行为与批F 之前完全一致。接入条件：并行会话
      // 识图能力真机收官后，这里会喂交稿的 mapDigest 快照做审美自查，返回的提示语拼进 auditNotes
      // （同体检提示口径：放行不阻塞，钩子出错也不影响交稿）。
      if (aestheticReviewHook) {
        try {
          const digest = String(toolCall.args.mapDigest || '').trim()
          const note = digest ? await aestheticReviewHook(digest) : null
          if (note) auditNotes = auditNotes ? `${auditNotes}\n${note}` : note
        } catch {
          // 审美自查失败不阻塞交稿——同体检口径，放行优先
        }
      }
      holder.result = {
        ok: true,
        summary: String(toolCall.args.summary || '').trim(),
        changes,
        mapDigest: String(toolCall.args.mapDigest || '').trim(),
        ...(auditNotes ? { auditNotes } : {})
      }
      return { content: '已收到作图交稿，任务结束。', details: { kind: 'huiyuSubmit' } }
    }
  }
}

/** 交回草案工具（批3·绘舆私有·只活在草案轮 registry）：只拟稿不画图，唯一收尾方式。
 *  sketches（地图草案剪影可视化计划批1·可选增强）：结构化剪影清单，给了就走地图剪影确认卡
 *  （画法口径见知识库第十五节），不给走现行纯文字流程。 */
function createSubmitLayoutDraftTool(holder: { result: HuiyuLayoutDraftResult | null }): ToolDefinition {
  return {
    name: HUIYU_SUBMIT_LAYOUT_DRAFT_TOOL_NAME,
    brief: '草案轮唯一收尾方式：交回格局草案给用户确认（不画图）。summary=人话版格局描述；'
      + '给了 sketches 时 summary 压到≤5行总览，细节全放每项 card 里，不要重复罗列。'
      + 'facts=依据（任务书/钻探证实的确凿事实）；assumptions=假设（你自己的合理推测，草案里会向用户显式声明"系我假设"）；'
      + 'missingInfo=缺料清单（仅当任务本身无法理解、或目标世界不存在时才填写；设定缺细节不算缺料，按自由创作准则大胆创作，不要因为设定没写明就交回这里）；'
      + 'sketches=结构化剪影清单（强烈建议给：每个改动项一条，前端会画在地图上让用户点选采纳/驳回/给意见，见知识库第十五节画法口径）。',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '草案人话版（必填）：给了 sketches 时压到≤5行总览；没给 sketches 时按原有详略写清要素/相对方位与距离/量级观感。' },
        facts: { type: 'array', items: { type: 'string' }, description: '依据：任务书或钻探结论里确凿的事实点（逐条）。' },
        assumptions: { type: 'array', items: { type: 'string' }, description: '假设：你自己合理推测但未经证实的点（逐条，草案会向用户显式声明这些是假设）。' },
        missingInfo: { type: 'array', items: { type: 'string' }, description: '缺料清单：仅当任务本身无法理解、或目标世界不存在时才填写（逐条列清楚卡在哪）；设定缺细节不算缺料，按自由创作准则大胆创作。' },
        sketches: {
          type: 'array',
          description: '结构化剪影清单（可选增强，强烈建议给）：每项是一个改动的粗糙几何+置信色+卡片文案。给了就必须每项都合法'
            + '（id 一轮内唯一/kind 三选一 region|path|marker/action 三选一 add|modify|delete/modify|delete 必带 targetFeatureId/'
            + '几何按 kind 必填：region=center+rx/ry 椭圆或 points≥3 点多边形，path=points≥2 点，marker=center/'
            + 'confidence 三选一 ready|confirm|risk/card.change 必填）。剪影只示意位置与规模，不是最终形状，坐标用米、与正式笔刷同坐标系。',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '本轮内唯一，自拟（如 "sk-1"）' },
              action: { type: 'string', enum: ['add', 'modify', 'delete'] },
              targetFeatureId: { type: 'string', description: 'action 为 modify/delete 时必填，指向现有要素 id' },
              kind: { type: 'string', enum: ['region', 'path', 'marker'] },
              category: { type: 'string', description: '现役35类目之一（见知识库第二节词汇表）' },
              label: { type: 'string', description: '显示名，如「赫兹塔尔盆地」' },
              sketch: {
                type: 'object',
                description: '粗糙几何（米，与正式笔刷同坐标系）：region 优先 center+rx/ry（椭圆）；复杂轮廓才用 points（3~8点粗多边形）；path 用 points（≥2点折线）；marker 用 center。',
                properties: {
                  center: { type: 'array', items: { type: 'number' }, description: '[x, y]（米）' },
                  rx: { type: 'number', description: '椭圆半长轴（米）' },
                  ry: { type: 'number', description: '椭圆半短轴（米）' },
                  points: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '[[x,y], ...]（米）' }
                }
              },
              confidence: { type: 'string', enum: ['ready', 'confirm', 'risk'], description: '绿=确定可落笔 黄=需确认 红=高风险' },
              card: {
                type: 'object',
                description: '每字段≤3短句',
                properties: {
                  change: { type: 'string', description: '这一项改动是什么（必填）' },
                  basis: { type: 'string', description: '依据（可选）' },
                  risk: { type: 'string', description: '风险/假设说明（可选）' }
                },
                required: ['change']
              }
            },
            required: ['id', 'action', 'kind', 'category', 'label', 'sketch', 'confidence', 'card']
          }
        }
      },
      required: ['summary']
    },
    validateArgs: (args) => {
      if (!String(args.summary || '').trim()) return 'submitLayoutDraft 缺少 summary（草案人话版）'
      return validateDraftSketches(args.sketches)
    },
    execute: async (toolCall) => {
      const sketches = readSketchList(toolCall.args.sketches)
      holder.result = {
        ok: true,
        summary: String(toolCall.args.summary || '').trim(),
        facts: readStringList(toolCall.args.facts),
        assumptions: readStringList(toolCall.args.assumptions),
        missingInfo: readStringList(toolCall.args.missingInfo),
        ...(sketches.length ? { sketches } : {})
      }
      return { content: '已收到格局草案，任务结束（草案不落笔，等确认）。', details: { kind: 'huiyuLayoutDraftSubmit' } }
    }
  }
}

export interface RunHuiyuMapWorkDeps {
  sessionId: string
  /** huiyu.dispatch 配方渲染出的完整原始可见上下文；非 dispatch 旧调用可不传。 */
  contextBlock?: string
  /** 运行卡键（并行多任务各不同，如 `huiyu:2`）。 */
  taskKey: string
  /** 绘舆工具集（buildHuiyuToolset 产物）。 */
  tools: ToolDefinition[]
  /** balanced 校书档模型调用（管线 buildDeferredLoopModelCall taskId='mapDraw' 注入·返回带 usage）。 */
  callModel: (request: {
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  }) => Promise<{ content: string; toolCalls: unknown[]; usage?: SubagentRunUsage }>
  signal?: AbortSignal
  /** 交稿门体检（批C·huiyuMapTools.createHuiyuAuditRunner 产物）：submitMap 时跑一次 report-only 体检，
   *  发现项写入结果的 auditNotes——放行不阻塞。缺省不体检（调用方未接线时行为不变）。 */
  audit?: () => Promise<{ report: string; findingsCount: number } | null>
  /** 识图审美自查留位钩子（笔刷约束系统批F·空挂载点，本批不实现）：submitMap 成功交稿、拿到 mapDigest
   *  后可选调用，喂交稿快照做审美自查；返回非 null 时拼进 auditNotes。接入条件：并行会话识图能力真机
   *  收官后再传入真实实现——当前没有任何调用方传参，恒为 undefined，绘舆行为不变（零回归）。 */
  aestheticReviewHook?: (digest: string) => Promise<string | null>
}

/** 跑一次绘舆作图小 loop：runSubagentLoop 收编骨架（begin/end 运行卡+空转续轮门+交稿即 terminate+usage 累加）+
 *  额外挂载「按规则 ID 连续违规熔断器」（extraHooks·仅落笔轮独有——草案轮无写工具不会触发 BRUSH_SPEC 硬门）；
 *  submitMap 交稿即 terminate → 回结果。永不抛错（结果如实带 ok/error）；abort 时返回 ok:false。 */
export async function runHuiyuMapWork(input: HuiyuMapWorkInput, deps: RunHuiyuMapWorkDeps): Promise<HuiyuMapWorkResult> {
  const holder: { result: HuiyuMapWorkResult | null } = { result: null }
  const failureCollector = createHuiyuToolFailureCollector()
  const brief = renderHuiyuBrief(input)
  const skillAssembly = await assembleAgentSkillSupply({ profileId: 'huiyu.dispatch' })
  await runSubagentLoop({
    sessionId: deps.sessionId,
    subagentId: `${HUIYU_SUBAGENT_ID_PREFIX}:${deps.taskKey}`,
    loggedInput: brief,
    presentation: {
      label: '绘舆',
      icon: 'map',
      runningVerb: '绘图中',
      title: extractHuiyuTaskTitle(brief) || '更新舆图'
    },
    agentName: 'HuiyuMapWorkAgent',
    profileId: 'huiyu.dispatch',
    runtimeVersion: 'huiyu-mapwork-runtime-v1',
    messages: [
      { role: 'system', content: buildHuiyuSystemPrompt(renderHuiyuSkillSupply(skillAssembly.layers)) },
      { role: 'user', content: deps.contextBlock
        ? `【统一原始可见上下文】\n${String(deps.contextBlock).trim()}\n\n${brief}`
        : brief }
    ],
    tools: deps.tools,
    skillAssembly,
    submitTool: createSubmitMapTool(holder, deps.audit, deps.aestheticReviewHook),
    submitToolName: HUIYU_SUBMIT_TOOL_NAME,
    isSubmitted: () => Boolean(holder.result),
    extraHooks: [createHuiyuRuleViolationCircuitBreaker(holder), failureCollector.hook],
    nudgeId: 'huiyu-empty-turn-nudge',
    nudgeMaxCount: HUIYU_NUDGE_MAX,
    buildNudgeText: () => '你这一步没有发起任何工具调用，而作图任务还没交稿：光在正文里说画好了不算完成。图画好了就立刻调用 submitMap 交稿（summary+changes+mapDigest 格局简述）；还没画就继续按流程做——readMapSummary 看格局/造形上图/挪角色/expandExplored。',
    submitTerminateId: 'huiyu-submit-terminate',
    submitTerminateSummary: '绘舆已交稿，收束作图 loop',
    // 交稿宽限轮（批K·2026-07-12 真机事故对症）：画了十几轮始终不 submitMap → 预算烧光整次判失败。
    // 预算尽/超时/收束没交稿时，强制给一次"只许 submitMap"的补救机会——已画的都真实落库了，交稿才有回执。
    submitGrace: {
      submitToolName: HUIYU_SUBMIT_TOOL_NAME,
      buildNudge: (reason, failureHint) => [
        reason === 'budget' ? '作图预算（轮数/工具调用数）已经用尽' : reason === 'timeout' ? '作图时间已经用尽' : '你已经收束却始终没有交稿',
        '，这是最后的交稿机会：立即调用 submitMap，用你目前已经画好的内容交稿——summary 写清已经画了什么、位置依据什么定的，changes 逐条列已完成的改动，mapDigest 概括当前格局；没画完的部分在 summary 里如实说明。你画的每一笔都已真实落库，不交稿它们就成了没有回执的孤儿。不要调用任何其他工具，不要再画新的。',
        ...(failureHint ? [`\n上次交稿失败原因：${failureHint}——修正参数后重新提交。`] : [])
      ].join('')
    },
    budget: HUIYU_BUDGET,
    timeoutMs: SUBAGENT_LOOP_TIMEOUT_MS,
    ...(deps.signal ? { signal: deps.signal } : {}),
    callModel: deps.callModel,
    onNoSubmit: (reason, detail) => {
      const reasonText = (reason === 'timeout'
        ? '作图超时（30 分钟）'
        : reason === 'aborted'
          ? '作图被停止'
          : '绘舆没有调用 submitMap 交稿（结果未结构化提交）')
        + (detail?.graceFailed ? '；宽限轮补交稿也未成功' : '')
      holder.result = { ok: false, summary: '', changes: [], mapDigest: '', error: reasonText }
    },
    onCatchError: (message) => {
      holder.result = { ok: false, summary: '', changes: [], mapDigest: '', error: `作图运行失败：${message}` }
    },
    buildEndPayload: () => {
      const outcome = holder.result as HuiyuMapWorkResult
      // 运行卡视觉态（批3）：missingInfo 缺料交回是绘舆诚实完成了这一轮（真调用了 submitMap），不是崩溃/超时——
      // 卡片视觉按「已交稿」算（cardOk），与 outcome.ok（业务语义：地图有没有实质变化）分开，
      // 避免用户在浮坞看到「失败」字样误以为出了故障。
      const cardOk = outcome.ok || Boolean(outcome.missingInfo?.length)
      return {
        ok: cardOk,
        ...(cardOk ? {} : { error: outcome.error || '作图失败' }),
        ...(outcome.summary ? { output: outcome.summary } : {})
      }
    }
  })
  // 失败记录挂进最终结果（笔刷约束系统批B）：只在真有记录时挂，holder.result 为 null 的极端异常路径
  // （理论上 runSubagentLoop 的 onNoSubmit/onCatchError 已兜底恒非 null，这里防御性判断一次）不处理。
  if (holder.result && failureCollector.errors.length) {
    holder.result = { ...holder.result, toolErrors: failureCollector.errors }
  }
  return holder.result as HuiyuMapWorkResult
}

export interface RunHuiyuLayoutDraftDeps {
  sessionId: string
  /** 同 RunHuiyuMapWorkDeps.contextBlock。 */
  contextBlock?: string
  /** 运行卡键（并行多任务各不同，如 `xingyi:2`）。 */
  taskKey: string
  /** 草案轮工具集（buildHuiyuDraftToolset 产物）。 */
  tools: ToolDefinition[]
  /** 同 RunHuiyuMapWorkDeps.callModel（balanced 校书档·mapDraw 任务档）。 */
  callModel: RunHuiyuMapWorkDeps['callModel']
  signal?: AbortSignal
}

/** 跑一次绘舆草案小 loop（批3·两段式派发草案轮）：runSubagentLoop 收编骨架，与 runHuiyuMapWork 同构但只读
 *  工具+submitLayoutDraft 交稿（无 extraHooks——草案轮无写工具不会触发 BRUSH_SPEC 硬门），天然无副作用；
 *  subagentId 用独立前缀 huiyu-draft，浮坞运行卡据此区分「拟稿中」与「绘图中」两态。
 *  永不抛错（结果如实带 ok/error）；abort 时返回 ok:false。 */
export async function runHuiyuLayoutDraft(input: HuiyuMapWorkInput, deps: RunHuiyuLayoutDraftDeps): Promise<HuiyuLayoutDraftResult> {
  const holder: { result: HuiyuLayoutDraftResult | null } = { result: null }
  const brief = renderHuiyuDraftBrief(input)
  const skillAssembly = await assembleAgentSkillSupply({ profileId: 'huiyu.dispatch' })
  await runSubagentLoop({
    sessionId: deps.sessionId,
    subagentId: `${HUIYU_DRAFT_SUBAGENT_ID_PREFIX}:${deps.taskKey}`,
    loggedInput: brief,
    presentation: {
      label: '绘舆',
      icon: 'map',
      runningVerb: '拟稿中',
      title: extractHuiyuTaskTitle(brief) || '拟格局草案'
    },
    agentName: 'HuiyuLayoutDraftAgent',
    profileId: 'huiyu.dispatch',
    runtimeVersion: 'huiyu-layoutdraft-runtime-v1',
    messages: [
      { role: 'system', content: buildHuiyuDraftSystemPrompt(renderHuiyuSkillSupply(skillAssembly.layers)) },
      { role: 'user', content: deps.contextBlock
        ? `【统一原始可见上下文】\n${String(deps.contextBlock).trim()}\n\n${brief}`
        : brief }
    ],
    tools: deps.tools,
    skillAssembly,
    submitTool: createSubmitLayoutDraftTool(holder),
    submitToolName: HUIYU_SUBMIT_LAYOUT_DRAFT_TOOL_NAME,
    isSubmitted: () => Boolean(holder.result),
    nudgeId: 'huiyu-draft-empty-turn-nudge',
    nudgeMaxCount: HUIYU_NUDGE_MAX,
    buildNudgeText: () => '你这一步没有发起任何工具调用，草案还没交回：光在正文里说想好了不算完成。想清楚了就立刻调用 submitLayoutDraft 交回草案；还没想清楚就继续 readMapSummary/钻探核实。',
    submitTerminateId: 'huiyu-draft-submit-terminate',
    submitTerminateSummary: '绘舆已交回草案，收束草案 loop',
    // 交稿宽限轮（批K）：预算尽/超时/收束没交回时，强制给一次"只许 submitLayoutDraft"的补救机会。
    submitGrace: {
      submitToolName: HUIYU_SUBMIT_LAYOUT_DRAFT_TOOL_NAME,
      buildNudge: (reason, failureHint) => [
        reason === 'budget' ? '拟稿预算（轮数/工具调用数）已经用尽' : reason === 'timeout' ? '拟稿时间已经用尽' : '你已经收束却始终没有交回草案',
        '，这是最后的交回机会：立即调用 submitLayoutDraft，用你目前已经核实的信息交回草案——summary 写已经想清楚的格局，facts/assumptions 分列，没核实完的写进 missingInfo。不要调用任何其他工具，不要再继续钻探。',
        ...(failureHint ? [`\n上次交回失败原因：${failureHint}——修正参数后重新提交。`] : [])
      ].join('')
    },
    budget: HUIYU_BUDGET,
    timeoutMs: SUBAGENT_LOOP_TIMEOUT_MS,
    ...(deps.signal ? { signal: deps.signal } : {}),
    callModel: deps.callModel,
    onNoSubmit: (reason, detail) => {
      const reasonText = (reason === 'timeout'
        ? '拟稿超时（30 分钟）'
        : reason === 'aborted'
          ? '拟稿被停止'
          : '绘舆没有调用 submitLayoutDraft 交回草案（结果未结构化提交）')
        + (detail?.graceFailed ? '；宽限轮补交稿也未成功' : '')
      holder.result = { ok: false, summary: '', facts: [], assumptions: [], missingInfo: [], error: reasonText }
    },
    onCatchError: (message) => {
      holder.result = { ok: false, summary: '', facts: [], assumptions: [], missingInfo: [], error: `拟稿运行失败：${message}` }
    },
    buildEndPayload: () => {
      const outcome = holder.result as HuiyuLayoutDraftResult
      return {
        ok: outcome.ok,
        ...(outcome.ok ? {} : { error: outcome.error || '拟稿失败' }),
        ...(outcome.summary ? { output: outcome.summary } : {})
      }
    }
  })
  return holder.result as HuiyuLayoutDraftResult
}

/** 派遣回执渲染（dispatchMapWork 工具 content·给统筹/纠偏看）：交稿摘要+改动清单+**格局简述**（用户拍板：
 *  派完绘舆要带回需要的地图信息，供后续叙事引用方位与距离）。ok=false 时按「缺料」与「真故障」两种措辞
 *  分流（自由创作准则·知识库第十节）：缺料回执不建议"重派"，建议补充信息后再派；真故障才建议重派。 */
export function renderHuiyuDispatchOutcome(input: HuiyuMapWorkInput, result: HuiyuMapWorkResult): string {
  if (!result.ok) {
    if (result.missingInfo?.length) {
      const lines = [`绘舆任务「${input.task}」资料不足，未能画完（不是故障，别当失败重试）：`, result.summary || '（绘舆未说明已画到哪一步）']
      lines.push('', '缺料清单：' + result.missingInfo.map((item) => `· ${item}`).join(' '))
      lines.push('', '请如实转告：需要补充上述信息后再派一次；不要在信息不足时硬编一个撑不起的大结构。')
      return lines.join('\n')
    }
    return `绘舆任务「${input.task}」失败：${result.error || '未知原因'}。可把剧情事实写得更具体（谁在哪/相对方位/距离量级）重派一次；本轮叙事先不依赖新地图信息。`
  }
  const lines = [`绘舆任务「${input.task}」已交稿：`, result.summary]
  if (result.changes.length) {
    lines.push('', '改动清单：' + result.changes.map((item) => `· ${item}`).join(' '))
  }
  if (result.mapDigest) {
    lines.push('', `【当前地图格局】${result.mapDigest}`)
  }
  if (result.auditNotes) {
    lines.push('', `【体检提示】${result.auditNotes}（放行未阻塞·提调可据此重派或忽略）`)
  }
  return lines.join('\n')
}

/** 草案确认卡固定选项文案（供 renderHuiyuLayoutDraftConfirmCard/isHuiyuDraftRejected 共用，避免字符串字面量各写各的）。 */
export const HUIYU_DRAFT_CONFIRM_LABEL = '确认，按此草案落笔'
export const HUIYU_DRAFT_REJECT_LABEL = '先不画，驳回草案'

/** 格局草案 → 浮坞确认卡文案（question+options+可选 sketches，复用 askUser 卡族形态·计划批3已拍板）：
 *  有 sketches（地图草案剪影可视化计划批1）时正文短化为≤5行总览+剪影计数（细节全在每项 card 里，是"晕字"
 *  的根治点，facts/assumptions/missingInfo 全文不再罗列）；**无 sketches 时渲染逐字节保持现状**——
 *  零回归接缝，前批（批3）的确认卡文案/断言原样不变。两个固定选项+askUser 自带「其他想法」自由输入
 *  （用户的修改意见走这条通道，见 composeHuiyuDrawTaskFromDraft）。 */
export function renderHuiyuLayoutDraftConfirmCard(
  input: HuiyuMapWorkInput,
  draft: HuiyuLayoutDraftResult
): { question: string; options: Array<{ label: string; note?: string }>; sketches?: HuiyuDraftSketchItem[] } {
  const options = [
    { label: HUIYU_DRAFT_CONFIRM_LABEL, note: '绘舆按上面的格局直接落笔画图' },
    { label: HUIYU_DRAFT_REJECT_LABEL, note: '草案作废，这次先不动笔' }
  ]
  const sketches = draft.sketches || []
  if (sketches.length) {
    const counts = { ready: 0, confirm: 0, risk: 0 }
    sketches.forEach((item) => { counts[item.confidence] = (counts[item.confidence] || 0) + 1 })
    const summaryLines = draft.summary.trim().split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5)
    const lines = [
      `绘舆拟了一份「${input.task}」的格局草案，请在地图上确认剪影：`,
      '',
      ...summaryLines,
      '',
      `剪影 ${sketches.length} 项（绿${counts.ready}/黄${counts.confirm}/红${counts.risk}），详情见每项卡片。`,
      '',
      '在地图上点选采纳/弃用，或给出修改意见；确认后绘舆会按采纳项直接落笔。'
    ]
    return { question: lines.join('\n'), options, sketches }
  }
  const lines = [`绘舆拟了一份「${input.task}」的格局草案，请确认：`, '', draft.summary.trim()]
  if (draft.facts.length) lines.push('', '【依据（确凿事实）】', ...draft.facts.map((item) => `· ${item}`))
  if (draft.assumptions.length) lines.push('', '【假设——系绘舆推测，非确凿事实】', ...draft.assumptions.map((item) => `· ${item}`))
  if (draft.missingInfo.length) lines.push('', '【缺料清单】', ...draft.missingInfo.map((item) => `· ${item}`))
  lines.push('', '确认后绘舆会按此草案直接落笔；不合意就驳回，或在下方输入修改意见让绘舆按你的意见落笔。')
  return { question: lines.join('\n'), options }
}

/** 判定草案是否被驳回：用户没答复（关掉卡片，空串）或明确选了驳回项。 */
export function isHuiyuDraftRejected(answer: string): boolean {
  const text = String(answer || '').trim()
  return !text || text === HUIYU_DRAFT_REJECT_LABEL
}

/** 草案确认后拼落笔任务书：原任务书事实 + 草案依据/假设 + 用户的修改意见（答复不等于确认选项本身时，
 *  视为修改意见——「可修改可驳回」里的「可修改」即由此实现，不需要额外的"改草案再问一次"loop）。 */
export function composeHuiyuDrawTaskFromDraft(
  input: HuiyuMapWorkInput,
  draft: HuiyuLayoutDraftResult,
  answer: string
): HuiyuMapWorkInput {
  const lines = [String(input.instructions || '').trim(), '', '【已确认的格局草案】', draft.summary.trim()]
  if (draft.facts.length) lines.push('依据：' + draft.facts.map((item) => `· ${item}`).join(' '))
  if (draft.assumptions.length) lines.push('假设（用户未反对即可用）：' + draft.assumptions.map((item) => `· ${item}`).join(' '))
  const trimmedAnswer = String(answer || '').trim()
  if (trimmedAnswer && trimmedAnswer !== HUIYU_DRAFT_CONFIRM_LABEL) {
    lines.push('', `【用户的修改意见——以此为准】${trimmedAnswer}`)
  }
  return { task: input.task, instructions: lines.join('\n'), ...(input.focus ? { focus: input.focus } : {}) }
}
