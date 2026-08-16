import huiyuCommonKnowledgeMarkdown from '../../../docs/agents/绘舆/通用知识.md?raw'
import huiyuMapManualMarkdown from '../../../docs/agents/绘舆/skills/map-manual/SKILL.md?raw'

/**
 * 绘舆（地图 subagent）知识库·运行时读取 + 常驻小核/按需钻取两层披露（地图提速批·2026-07-12 用户拍板）。
 *
 * 真值源文分工：`docs/agents/绘舆/通用知识.md` 常驻核心六节；
 * `docs/agents/绘舆/skills/map-manual/SKILL.md` 保存低频详细手册。
 *
 * 提速批背景：知识库全文 ~33KB，每轮模型调用都全文重发是绘舆单次派发 8 分钟起步的主要根因之一。
 * 本批把披露拆两层：
 * - 「核心速览」（由 manifest 声明、Skill loader 常驻）：只含"画错就出事"的硬约束——类目白名单
 *   （第二节）、量级分级表（第四节）、三条明确以"铁律"命名的规则节（第六/十/十一节）、交稿与体检要求
 *   （第九节）。不含第三节「系统硬校验总览」：该节自述是"代码卡什么"的参考文档，运行时真违规时
 *   buildViolationReceipt 会在触发的当轮就地给出具体原因+建议（见 huiyuMapTools.ts），常驻复述边际收益低，
 *   改列入按需层，需要精确核对某条硬门数值时用 readMapManual 钻取「三、系统硬校验总览」。
 * - 「按需钻取」（loadHuiyuManualSections·供 huiyuMapTools.readMapManual 消费）：只保存核心之外的九个
 *   低频章节；笔刷画法手册/宏笔刷/画城结构法/布局原则等细节需要时主动钻取，不再每轮常驻。
 *
 * 容错口径同编剧（scriptwriterKnowledge）：读不到源文两层都返回空，注入侧据空跳过——
 * 结构性铁律（交稿流程/范围约束，住 HUIYU_SYSTEM_PROMPT）仍完整，绘舆照常工作。
 */

/** 精确读取绘舆知识库唯一源文，不扫描其它 Agent 文档。 */
function loadHuiyuKnowledgeRaw(): string {
  return typeof huiyuCommonKnowledgeMarkdown === 'string' ? huiyuCommonKnowledgeMarkdown : ''
}

function loadHuiyuManualRaw(): string {
  return typeof huiyuMapManualMarkdown === 'string' ? huiyuMapManualMarkdown : ''
}

/** 过滤维护者行（既有语义不变：`# ` 一级标题 / `> ` 说明行不注入）；核心块与按需块共用同一份过滤。 */
function stripMaintainerLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('# ') && !line.startsWith('> '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface HuiyuManualSection {
  /** 章节标题（原文二级标题文本，不含「## 」前缀，如「十三、笔刷画法手册（每类目怎么画才对味·谓词化）」）。 */
  title: string
  /** 章节正文（含「## 标题」这一行本身，已过滤维护者行）。 */
  body: string
}

/** 按二级标题（`## `）切分知识库全文为章节数组；导言（一级标题+其后的 `> ` 说明行）不归属任何 `## ` 节，
 *  不作为可钻取章节。每个章节的 body 保留「## 标题」这一行本身（不只是标题后的内容），保持与旧版
 *  「全文注入含标题行」的可读性一致——模型/测试都能直接从正文里 grep 到章节标题。 */
function parseKnowledgeSections(raw: string): HuiyuManualSection[] {
  const lines = raw.split('\n')
  const chunks: Array<{ title: string; lines: string[] }> = []
  let current: { title: string; lines: string[] } | null = null
  for (const line of lines) {
    const match = line.match(/^## (.+)$/)
    if (match) {
      current = { title: match[1].trim(), lines: [line] }
      chunks.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return chunks
    .map((chunk) => ({ title: chunk.title, body: stripMaintainerLines(chunk.lines.join('\n')) }))
    .filter((section) => section.body)
}

/** 核心速览章节标题白名单（按标题文本精确匹配，不用行号——文档会演化，行号选择在改版后会悄悄错位
 *  且不报错，标题匹配至少能在标题被删改时通过"匹配不到"暴露信号）。四类"画错就出事"的硬约束：
 *  类目白名单（二）/量级分级表（四）/交稿与体检要求（九）/三条以"铁律"命名的规则节（六/十/十一）。
 *  不含「三、系统硬校验总览」——理由见文件头注释；需要精确核对硬门数值时用 readMapManual 钻取。 */
const CORE_SECTION_TITLES = [
  '二、category 词汇表（决定图层与配色·只能从这里选；画法要领见第十三节）',
  '四、坐标系与比例常识（单位=米·画错尺度是最常见的失真）',
  '六、探索范围铁律（explored·迷雾的真值）',
  '九、交稿前自查（auditMap）',
  '十、自由创作准则（料不足时大胆编·2026-07-13 美观与迅捷优先拍板）',
  '十一、量级一致性与可见性铁律（画对之外还要"看得见、配得上"·2026-07-11 真机首图复盘）'
]

/**
 * 统一 Agent Skill loader 使用的 resident 核：只含核心六节，不夹带 on-demand 手册目录。
 * 按需能力的名称、描述与读取方式由 manifest 的 layer 1 catalog 提供。
 */
export function buildHuiyuResidentCoreSkillBody(): string {
  const raw = loadHuiyuKnowledgeRaw()
  if (!raw.trim()) return ''
  const sections = parseKnowledgeSections(raw)
  const coreBody = sections
    .filter((section) => CORE_SECTION_TITLES.includes(section.title))
    .map((section) => section.body)
    .join('\n\n')
    .trim()
  if (!coreBody) return ''
  return [
    '【地图设计知识（你作图时的专业修养·核心速览）】',
    coreBody
  ].join('\n')
}

/** 供 huiyuMapTools.readMapManual 消费：只读取按需 Skill 的九个低频章节，不复制常驻核心六节。 */
export function loadHuiyuManualSections(): HuiyuManualSection[] {
  const raw = loadHuiyuManualRaw()
  if (!raw.trim()) return []
  return parseKnowledgeSections(raw)
}

/**
 * 统一 Agent Skill loader 入口：读取绘舆详细手册。
 * selector 优先按标题精确/前缀匹配，再按标题或正文关键词匹配；不传时不读取正文。
 */
export function loadHuiyuManualSkillBody(selector = ''): string {
  const requested = String(selector || '').trim()
  if (!requested) return ''
  const sections = loadHuiyuManualSections()
  if (!sections.length) return ''
  const exact = sections.filter((section) => section.title === requested)
  const prefixed = exact.length ? exact : sections.filter((section) => section.title.startsWith(requested))
  const matched = prefixed.length
    ? prefixed
    : sections.filter((section) => section.title.includes(requested) || section.body.includes(requested))
  return matched.map((section) => section.body).join('\n\n---\n\n')
}
