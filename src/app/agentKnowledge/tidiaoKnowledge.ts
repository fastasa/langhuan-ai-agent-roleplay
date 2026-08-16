import tidiaoCommonKnowledgeMarkdown from '../../../docs/agents/提调/通用知识.md?raw'
import tidiaoEnvironmentManualMarkdown from '../../../docs/agents/提调/skills/environment-manual/SKILL.md?raw'

/**
 * 提调（群聊导演 agent）知识库·运行时读取 + 渐进披露注入（支线② · 2026-06-27）。
 *
 * 真值源文分工：
 *   · docs/agents/提调/通用知识.md：每轮收到的身份、口吻、能力边界与 2.0 索引；
 *   · docs/agents/提调/skills/environment-manual/SKILL.md：只按 selector 读取的 2.x 环境细节。
 *
 * 运行时读取：用 Vite raw import 精确读取提调知识库，不扫描其它 Agent 文档。
 * 渐进披露：不是每轮把全文塞进 system——
 *   · 恒注入：第一节（身份+口吻+能力边界，小且每轮都该框住人设/语气）+ 第三节（能做/做不到·统筹轮；
 *     纠偏/精修轮经 includeCapability:false 撤掉，能力真值=层1 本轮真注册工具清单）+ 2.0 速览索引；
 *   · 按需注入：第二节 2.x 各功能区，只在当轮用户话/提调指令命中对应关键词时才补该小节细节（省 token，对齐 P2/P27）。
 * 命中不到时也无妨：2.0 索引已给出环境地图，提调据此知道「有这些功能」，需要细节再由命中触发。
 *
 * 自包含：读取/解析/披露集中在本模块；编排层（groupDirectorHarness 等）只调 buildTidiaoKnowledgeInjection 拿结果对象。
 * 批D·D2（2026-07-12·缓存重排）：返回值拆成 { constantBlock, matchedEnvBlock } 两块（不再拼成一个字符串）——
 * constantBlock 逐字节稳定，消费方仍前置进 system 层0；matchedEnvBlock 随当轮语料变化，消费方改注入 user 侧
 * 靠后位置（层6 TODO 之前），避免命中节的每轮变化把 system 里其后恒定的纲领/协议一起拖进「每轮都变」的前缀、
 * 打掉跨轮 KV 缓存（纯函数仍不耦合运行时读取）。
 */

/** 取提调知识库唯一源文；构建异常时返回空，由注入侧按既有失败语义处理。 */
function loadTidiaoKnowledgeRaw(): string {
  return typeof tidiaoCommonKnowledgeMarkdown === 'string' ? tidiaoCommonKnowledgeMarkdown : ''
}

function loadTidiaoEnvironmentManualRaw(): string {
  return typeof tidiaoEnvironmentManualMarkdown === 'string' ? tidiaoEnvironmentManualMarkdown : ''
}

interface KnowledgeHeading {
  idx: number
  level: number
  key: string
  title: string
}

/** 从标题文本取「定位键」：一/二/三（顶节）、2.0/2.4/1.1（小节）。取不到回退原标题。 */
function deriveHeadingKey(title: string): string {
  const m = title.trim().match(/^([0-9]+\.[0-9]+|[0-9]+|[一二三四五六七八九十]+)/)
  return m ? m[1] : title.trim()
}

/** 解析 md 行 → 标题表（只认 ## / ###，与源文层级一致）。 */
function parseHeadings(lines: string[]): KnowledgeHeading[] {
  const headings: KnowledgeHeading[] = []
  lines.forEach((line, idx) => {
    const m = line.match(/^(#{2,3})\s+(.*)$/)
    if (m) headings.push({ idx, level: m[1].length, key: deriveHeadingKey(m[2]), title: m[2].trim() })
  })
  return headings
}

/** 取某 key 标题的整块（标题行 + 正文，直到下一个层级 <= 它的标题）。顶节键含其全部小节，小节键只含自身。 */
function blockOfKey(lines: string[], headings: KnowledgeHeading[], key: string): string {
  const i = headings.findIndex((h) => h.key === key)
  if (i < 0) return ''
  const startLine = headings[i].idx
  let endLine = lines.length
  for (let j = i + 1; j < headings.length; j++) {
    if (headings[j].level <= headings[i].level) {
      endLine = headings[j].idx
      break
    }
  }
  return lines.slice(startLine, endLine).join('\n').trim()
}

/** 注入前清理：剔除给维护者看的「> 真值来源」行（对提调无用、且不该把文件路径泄进 system），省 token。 */
function stripMaintenanceLines(block: string): string {
  return block
    .split('\n')
    .filter((line) => !/^>\s*真值来源/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 第二节各功能区（2.x）→ 命中关键词。当轮用户话/提调指令命中任一词，才补该小节细节（渐进披露）。
 *  键即源文小节号，便于对照维护；词表只为「触发」、不求穷尽，宁可多触发也别漏掉用户真实意图。 */
const ENV_SECTION_TRIGGERS: Array<{ key: string; keywords: string[] }> = [
  { key: '2.1', keywords: ['这一轮', '本轮', '流程', '怎么走', '回复链路', '统筹'] },
  { key: '2.2', keywords: ['楼层', '消息', '版本', '第几条', '上一条', '这条', '那条'] },
  { key: '2.3', keywords: ['投影', '客观事实', '写轨迹', '投影灯'] },
  { key: '2.4', keywords: ['帷幕', '右上角', '时间', '几点', '日期', '地点', '位置', '天气', '马甲', '流速', '暂停', '现实地点', '场景'] },
  { key: '2.5', keywords: ['可见', '看得到', '看不到', '隐藏', '眼睛', '看见'] },
  { key: '2.6', keywords: ['输入框', '加号', '提及', '命令面板', '提调输入', '私密指令', '【【'] },
  { key: '2.7', keywords: ['命令', '斜杠', '/旁白', '/创建角色', '/整理', '创建角色'] },
  { key: '2.8', keywords: ['旁白', '环境描写', '人物描写', '事件推进', '承接'] },
  { key: '2.9', keywords: ['角色', '即兴角色', '临时角色', '临时实体', '参与者', '成员', '建筑', '势力', '物品', '地理区域', '出场'] },
  { key: '2.10', keywords: ['重试', '重新生成', '重生成', '编辑', '笔记', '复制', '删除', '操作'] },
  { key: '2.11', keywords: ['提示词日志', '召回面板', '人格模型', '编排审计', '会话设置', '提调带', '决策流', '面板', '侧栏'] },
  { key: '2.12', keywords: ['会话', '文件管理', '清空对话', '总结对话', '归档', '加载更早'] },
  { key: '2.13', keywords: ['普通召回', '快速回复', '动作输入', '写作计划', '表达占比', '建议字数', '正式消息', '公开动作', '私密动作', '轮后', '审计', '核账', '补演', 'focused_action', 'fast_reply', '纯净回复', '人格模型', '回复方式', '回复模式', 'caps'] },
  { key: '2.14', keywords: ['markdown', '美化', 'think', '思考块', '字号', '渲染', '显示'] },
  // 状态系统（积木骨架计划批次5·2026-07-08）：状态栏读写归提调，命中状态类词即补 2.15 细则。
  { key: '2.15', keywords: ['状态栏', '状态系统', '状态', '金钱', '灵石', '银两', '声望', '资源', '升级', '库存', '持有', '等级', '体力', '健康'] },
  { key: '2.16', keywords: ['子agent', '子 agent', '采风', '派遣', '超时', '时限', 'timeoutminutes'] },
]

/** 单轮按需注入的环境小节数上限（防膨胀；多数轮命中 0~3 条，命中过多按源文顺序截断）。 */
const MAX_ENV_SECTIONS_PER_TURN = 6

export interface TidiaoKnowledgeInjectionInput {
  /** 当轮用户正文（@/点名后剥离的纯意图文本）。 */
  userText?: string
  /** 当轮提调私密/公开指令（橄榄抽屉条 + 【【…】】）。 */
  directives?: string[]
  /** 当轮场景串（时间/地点/天气），帮助命中「帷幕」等环境意图。 */
  sceneContext?: string
}

/**
 * 只根据当轮语料选择可能需要的环境手册小节，不读取知识库正文。
 * 供 manifest 装配器在授权后把 selector 交给正式 loader；禁止为了“先看看命中了什么”提前展开正文。
 */
export function matchTidiaoEnvironmentManualSelectors(
  input: TidiaoKnowledgeInjectionInput = {}
): string[] {
  const corpus = [
    String(input.userText || ''),
    ...(Array.isArray(input.directives) ? input.directives.map((directive) => String(directive || '')) : []),
    String(input.sceneContext || '')
  ].join('\n').toLowerCase()
  const selectors: string[] = []
  for (const section of ENV_SECTION_TRIGGERS) {
    if (selectors.length >= MAX_ENV_SECTIONS_PER_TURN) break
    if (section.keywords.some((keyword) => corpus.includes(keyword.toLowerCase()))) selectors.push(section.key)
  }
  return selectors
}

/** 批D·D2（缓存重排·2026-07-12）：注入拆两块返回——命中环境节随用户输入逐轮变化，若仍整块前置进 system 层0，
 *  会把其后恒定的决策纲领/协议/工具目录一起拖入「每轮都变」的前缀，跨轮 KV 前缀缓存被命中节的变化整段击穿。
 *  拆开后消费方各自决定位置：constantBlock（lead+身份口吻+能力清单/索引，本轮/跨轮逐字节稳定）留在原 system 位置；
 *  matchedEnvBlock（命中的 2.x 环境小节，随当轮语料变化）移到 user 侧靠后位置（层6 TODO 之前），
 *  不再污染 system 的稳定前缀。两块内部文本一字不改，只是从同一个拼接字符串里拆开。 */
export interface TidiaoKnowledgeInjectionResult {
  /** 恒定部分：lead 导语 + 第一节(身份/口吻) + 第三节(能力清单·可选) + 2.0 速览索引(可选)。
   *  本轮/跨轮逐字节稳定（不随 userText/directives/sceneContext 变化），供 system 层0 使用。 */
  constantBlock: string
  /** 命中环境节：按当轮语料命中关键词的 2.x 环境小节（已按 MAX_ENV_SECTIONS_PER_TURN 截断、multiple 用 \n\n 拼接）。
   *  每轮可能不同，不进 system；供 user 侧靠后位置单独成块注入（缓存友好）。无命中时为空串。 */
  matchedEnvBlock: string
}

/**
 * 组装本轮要注入提调的知识块（渐进披露），拆成恒定/命中两块（批D·D2）供调用方分别决定注入位置。
 * 恒定：第一节(身份+口吻+边界) + 第三节(能力清单) + 2.0 速览索引；
 * 命中：当轮文本命中关键词的 2.x 环境小节（≤ MAX_ENV_SECTIONS_PER_TURN，按源文顺序）。
 * 读不到源文 / 解析不出恒注入部分时两块均返回 ''（注入侧据空跳过）。
 *
 * options.includeEnvIndex（增量4·2026-07-01）：2.0 速览索引是否随恒定块注入。缺省 true（纠偏/编排 loop 保持原样）；
 * 群聊统筹 0-6 分层骨架下传 false——索引改由层1「可调用资料」经 buildTidiaoKnowledgeIndex 承载，两处不重复。
 * options.includeCapability（层0 任务化·2026-07-05 用户拍板）：第三节能力清单是否随恒定块注入。缺省 true（统筹轮保持原样）；
 * 纠偏/精修轮下传 false——那份清单列的是统筹决策工具（finishRound 等），纠偏轮并未注册、会造成职责混淆，
 * 纠偏轮的能力真值以层1「可调用资料」本轮真注册工具清单为准。
 */
export function buildTidiaoKnowledgeInjection(
  input: TidiaoKnowledgeInjectionInput = {},
  options: { includeEnvIndex?: boolean; includeCapability?: boolean } = {}
): TidiaoKnowledgeInjectionResult {
  const empty: TidiaoKnowledgeInjectionResult = { constantBlock: '', matchedEnvBlock: '' }
  const commonRaw = loadTidiaoKnowledgeRaw()
  if (!commonRaw.trim()) return empty
  const lines = commonRaw.split('\n')
  const headings = parseHeadings(lines)

  const core = stripMaintenanceLines(blockOfKey(lines, headings, '一'))
  const capability = stripMaintenanceLines(blockOfKey(lines, headings, '三'))
  const index = stripMaintenanceLines(blockOfKey(lines, headings, '2.0'))
  // 恒注入三块至少要有「身份+口吻」核心，否则视为源文异常、不注入。
  if (!core) return empty

  // 命中语料：用户话 + 指令 + 场景串。英文小写化以便 markdown/caps 等词大小写无关命中。
  const matchedEnv: string[] = []
  const manualLines = loadTidiaoEnvironmentManualRaw().split('\n')
  const manualHeadings = parseHeadings(manualLines)
  for (const selector of matchTidiaoEnvironmentManualSelectors(input)) {
    const block = stripMaintenanceLines(blockOfKey(manualLines, manualHeadings, selector))
    if (block) matchedEnv.push(block)
  }

  // 层0 任务化：不带能力清单（纠偏/精修轮）时，导语改指向层1 工具清单当能力真值，避免与本轮真注册工具打架。
  const includeCapability = options.includeCapability !== false
  const lead = includeCapability
    ? '【提调知识库·按需披露】以下是你（提调）的身份、过程输出口吻、所处聊天区与你能/不能操作什么。先读它再开始统筹本轮。'
    : '【提调知识库·按需披露】以下是你（提调）的身份、过程输出口吻与所处聊天区。你本轮能操作什么，以【1·可调用资料】里本轮真注册的工具清单为准。先读它再开始处理本轮任务。'
  const constantParts = [
    lead,
    core,
    ...(includeCapability ? [capability] : []),
    // 增量4：includeEnvIndex=false（群聊统筹路）时不带 2.0 索引——它改由层1「可调用资料」承载，不与本块重复。
    ...(options.includeEnvIndex === false ? [] : [index]),
  ].filter((p) => String(p || '').trim())

  return {
    constantBlock: constantParts.join('\n\n'),
    matchedEnvBlock: matchedEnv.join('\n\n')
  }
}

/** 增量4·层1「可按需展开的知识库」：单取 2.0 速览索引块（聊天区环境功能地图），供群聊统筹层1渲染。
 *  与 buildTidiaoKnowledgeInjection(includeEnvIndex:false) 配对——索引只在层1出现一次，不与层0知识块重复。
 *  去掉块尾可能带上的 md 分隔线（--- 属版式、非索引内容）。读不到源文 / 解析不出 2.0 时返回 ''（注入侧据空跳过）。 */
export function buildTidiaoKnowledgeIndex(): string {
  const raw = loadTidiaoKnowledgeRaw()
  if (!raw.trim()) return ''
  const lines = raw.split('\n')
  const headings = parseHeadings(lines)
  const index = stripMaintenanceLines(blockOfKey(lines, headings, '2.0'))
  return index.replace(/\n*-{3,}\s*$/, '').trim()
}

/**
 * 单取提调常驻知识中的「角色计划与方向：性格第一」。
 * 快速回复/动作输入规划和角色计划编排不会装入整份提调常驻核，必须从同一 Markdown 真值精确取本节，
 * 禁止在各自 prompt builder 里复制一份会漂移的规则正文。
 */
export function buildTidiaoCharacterPlanningPriority(): string {
  const raw = loadTidiaoKnowledgeRaw()
  if (!raw.trim()) return ''
  const lines = raw.split('\n')
  const headings = parseHeadings(lines)
  return stripMaintenanceLines(blockOfKey(lines, headings, '1.4'))
}

/**
 * 统一 Agent Skill loader 入口：读取提调环境手册正文。
 * selector 必须传源文小节键、标题或关键词（如 `2.15` / `状态系统`）；不传时不读取正文。
 * 该函数只在 manifest 授权后的 loader 调用中执行，bodySource 本身不会触发目录扫描或正文读取。
 */
export function loadTidiaoEnvironmentManualSkillBody(selector = ''): string {
  const requested = String(selector || '').trim()
  if (!requested) return ''
  const raw = loadTidiaoEnvironmentManualRaw()
  if (!raw.trim()) return ''
  const lines = raw.split('\n')
  const headings = parseHeadings(lines)
  const environmentHeadings = headings.filter((heading) => /^2\.\d+$/.test(heading.key))
  const exact = environmentHeadings.filter((heading) => heading.key === requested || heading.title === requested)
  const prefixed = exact.length
    ? exact
    : environmentHeadings.filter((heading) => heading.title.startsWith(requested))
  const matched = prefixed.length
    ? prefixed
    : environmentHeadings.filter((heading) => {
        const body = blockOfKey(lines, headings, heading.key)
        return heading.title.includes(requested) || body.includes(requested)
      })
  return matched
    .map((heading) => stripMaintenanceLines(blockOfKey(lines, headings, heading.key)))
    .filter(Boolean)
    .join('\n\n')
}
