// 统一 state 协议 · 压缩投影（R3-3 · event sourcing 三件套之②「压缩投影 projected view」）。
//
// 定位：
// 喂给模型的不是整份 append log，而是从 log 压出的「本提调带历史记忆」文本视图——
//   - 人话决策（decision）：提调历次决策的人话，记忆主干。
//   - 工具结果（toolResult）：用 projectToolDetails 读字段生命周期标签拆 durable（进视图）/ searchable（折叠、可检索）。
//   - 报错（error）：失败的「哪一步、什么错」，模型据此换法（R3-5 自诊断的呈现侧）。
//   - 用户消息（message·user）：用户指令是记忆要点；assistant 原始 JSON 已由 decision 提炼、不重复进视图。
// 呈现层标注「更早内容已折叠、可用检索工具按关键词搜回」——暴露可检索性（修 P10(a)：模型不再以为只有眼前几条），
// 不静默截断；超预算时丢最早、保留最近。
//
// 边界：本模块只读 append log 事件 + 字段标签做投影，不含业务判断（保留判断由各工具 fieldLifecycle 声明，压缩逻辑只此一份）。
// 与 renderTidiaoBandMemory（tidiaoDirectorStreamState.ts）的关系：后者从 carryOver 视图渲染（决策摘要），
// 本模块从 append log 保真层投影（决策 + 工具结果保真 + 报错），是 R3-3 起的新源；log 空时调用方回退 renderTidiaoBandMemory。

import type { AppendLogEvent } from './appendLogTypes'
import { projectToolDetails } from './toolDetailsProjection'
// 真机修③：层5 操作日志段标题（单一真值）——prompt 自含它即不再拼重复的「本轮往来」段。
import { DIRECTOR_ROUND_LOG_SECTION_TITLE } from '../directorRoundLog'

export interface AppendLogProjectionOptions {
  /** 字符预算，默认 4000（与 renderTidiaoBandMemory 对齐）。超出丢最早、保留最近并标注折叠可检索。 */
  maxChars?: number
}

// L9 台账分桶（2026-07-01·结构化投影框架）：投影不再按 seq 把四类事件拍平成一坨流水，
// 而是先归到固定四桶、桶内成行、桶间加小标题——决策与工具结果分列不再糊、信息填进对应槽。
type ProjectionBucket = 'user' | 'decision' | 'resource' | 'error'

/** 桶渲染顺序（用户诉求→已做决策→已读资料→报错）+ 固定小标题；只渲非空桶。 */
const BUCKET_ORDER: ProjectionBucket[] = ['user', 'decision', 'resource', 'error']
const BUCKET_HEADER: Record<ProjectionBucket, string> = {
  user: '▍用户指令（本带历次）',
  decision: '▍已做的决策（按步）',
  resource: '▍已读到的资料 / 工具结果',
  error: '▍报错·需换法'
}

/** 把单条事件压成「归哪个桶 + 一行人话」；不进视图的事件返回 null。 */
function projectEventEntry(event: AppendLogEvent): { bucket: ProjectionBucket; line: string } | null {
  // R1-C 主/子 state 隔离（只 merge 结论）：演员子 loop（origin='actor'·群聊 per-speaker 台词生成）的过程事件
  // 不进提调跨轮记忆投影——它的取料/工具/思考过程是演员自己的事，提调记忆只该见自己的决策+结论，不被演员噪声污染。
  // 事件仍在保真层（审计/检索保留）；演员的「结论」（台词/分镜）经 directorStream 带与消息历史独立 merge 回提调带、不走本投影。
  if (event.origin === 'actor') return null
  switch (event.type) {
    case 'decision': {
      const text = String(event.decision?.text || '').trim()
      if (!text) return null
      const tool = event.decision.tool
      // 决策桶只留「决策本身 + 触发了哪个工具」：成功工具的结果统一归「资料」桶，避免同一次调用投影两遍（决策行 resultPreview + 独立 toolResult）。
      // 报错是换法依据、且 toolResult-error 行被跳过，故只在决策行内联保留简短报错（不进资料桶）。
      if (tool) {
        const label = String(tool.label || tool.tool || '').trim()
        if (tool.status === 'error') {
          const result = String(tool.resultPreview || '').trim()
          return { bucket: 'decision', line: `- ${text}${label ? ` 〔${label} 报错：${result || '执行失败'}〕` : ''}` }
        }
        return { bucket: 'decision', line: `- ${text}${label ? ` 〔→${label}〕` : ''}` }
      }
      return { bucket: 'decision', line: `- ${text}` }
    }
    case 'toolResult': {
      const r = event.result
      // R3-5：工具报错由独立 error 事件代表（feedAppendLogFromFidelityEvent 同时 append），
      // 投影只渲染 error 事件、跳过 toolResult-error 行，避免喂模型时同一失败重复显示。
      if (r.status === 'error' || r.status === 'blocked') return null
      const name = String(r.toolName || '').trim()
      const content = String(r.content || '').trim()
      // 字段生命周期压缩：durable 进视图喂模型，searchable 折叠（不喂、可检索），transient 丢弃。
      const { durable, searchable } = projectToolDetails(r.details, event.lifecycle)
      const parts: string[] = []
      if (content) parts.push(content)
      if (Object.keys(durable).length) parts.push(`关键：${JSON.stringify(durable)}`)
      const searchableCount = Object.keys(searchable).length
      if (searchableCount) parts.push(`（${searchableCount} 项细节已折叠，可检索）`)
      const body = parts.join(' ').trim()
      return { bucket: 'resource', line: `- 〔工具结果 ${name}〕${body}`.trim() }
    }
    case 'error': {
      const where = [event.stage, event.toolName].filter(Boolean).join('·')
      const message = String(event.error?.message || '').trim()
      return { bucket: 'error', line: `- 〔报错${where ? ` ${where}` : ''}〕${event.error?.type || ''}${message ? `：${message}` : ''}` }
    }
    case 'message': {
      // 只投影用户消息（用户指令是记忆要点）；assistant 原始 JSON thought 已由 decision 提炼、tool 回灌与 toolResult 重复，均不进视图。
      if (event.role !== 'user') return null
      const content = String(event.content || '').trim()
      return content ? { bucket: 'user', line: `- 〔用户〕${content}` } : null
    }
    default:
      // toolCall：与 toolResult 重复，不进视图（保真层仍可被 R3-4 检索搜回）。
      return null
  }
}

/** 把分桶条目渲染成「分层台账」文本（固定桶序 + 小标题·只渲非空桶）；folded=true 时顶部标注折叠可检索。 */
function renderBuckets(entries: Array<{ bucket: ProjectionBucket; line: string }>, folded: boolean): string {
  const sections: string[] = []
  for (const bucket of BUCKET_ORDER) {
    const lines = entries.filter((e) => e.bucket === bucket).map((e) => e.line)
    if (lines.length) sections.push(`${BUCKET_HEADER[bucket]}\n${lines.join('\n')}`)
  }
  const body = sections.join('\n\n')
  return folded ? `（更早内容已折叠，可用检索工具按关键词搜回）\n${body}` : body
}

function measureBucketProjection(
  counts: Record<ProjectionBucket, number>,
  lineChars: Record<ProjectionBucket, number>,
  folded: boolean
) {
  let sectionCount = 0
  let total = 0
  for (const bucket of BUCKET_ORDER) {
    const count = counts[bucket]
    if (!count) continue
    if (sectionCount > 0) total += 2
    total += BUCKET_HEADER[bucket].length + 1 + lineChars[bucket] + count - 1
    sectionCount += 1
  }
  if (folded) total += '（更早内容已折叠，可用检索工具按关键词搜回）\n'.length
  return total
}

/**
 * R3-3 压缩投影 + L9 台账分桶：把 append log 保真事件压成喂模型的「本提调带历史记忆」分层台账。
 * - 四桶分列（用户指令 / 已做的决策 / 已读到的资料 / 报错）；toolResult 读字段标签拆 durable 进视图、searchable 折叠可检索。
 * - 超 maxChars：丢最早（按 append 顺序）、保留最近，再分桶渲染并在顶部标注「（更早内容已折叠…）」——不静默截断。
 * - 无可投影事件返回空串（首轮无历史、不产生噪声；调用方据此回退或不注入记忆块）。
 */
export function renderAppendLogProjection(
  events: AppendLogEvent[] | null | undefined,
  options: AppendLogProjectionOptions = {}
): string {
  const list = Array.isArray(events) ? events : []
  const entries: Array<{ bucket: ProjectionBucket; line: string }> = []
  for (const event of list) {
    const entry = projectEventEntry(event)
    if (entry) entries.push(entry)
  }
  if (!entries.length) return ''
  const maxChars = Number(options.maxChars) > 0 ? Number(options.maxChars) : 4000
  const full = renderBuckets(entries, false)
  if (full.length <= maxChars) return full
  // 从尾部累计每个桶的长度，一次定位能保留的最长后缀；避免逐条 slice 后反复重渲染整桶。
  const counts = Object.fromEntries(BUCKET_ORDER.map((bucket) => [bucket, 0])) as Record<ProjectionBucket, number>
  const lineChars = Object.fromEntries(BUCKET_ORDER.map((bucket) => [bucket, 0])) as Record<ProjectionBucket, number>
  let startIndex = entries.length - 1
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    counts[entry.bucket] += 1
    lineChars[entry.bucket] += entry.line.length
    if (index < entries.length - 1 && measureBucketProjection(counts, lineChars, true) > maxChars) {
      counts[entry.bucket] -= 1
      lineChars[entry.bucket] -= entry.line.length
      break
    }
    startIndex = index
  }
  return renderBuckets(entries.slice(startIndex), true)
}

// ─────────────────────────────────────────────────────────────────────────────
// 「喂模型原文」查看器文档（option C·2026-07-01·用户拍板「只显示真实 prompt」）
// ─────────────────────────────────────────────────────────────────────────────
// state 查看器不再显示压缩台账（renderAppendLogProjection 那份四桶投影），改为忠实还原提调这一轮
// **真正读到/产出的整段内容** = ①发送时留存的真实 prompt（system 纲领/编排倾向/情境·旁白清单/各协议
// + user 舞台事实/出场名单/聊天历史/本轮诉求/资料池）②本轮 loop 的真实往来（每步 assistant thought /
// 工具调用 / 工具结果 · content 全展开不折叠）。这满足用户三诉求：纲领+聊天历史来自真实 prompt 段、
// skill 正文（在 toolResult.content 里）天然全展开。renderAppendLogProjection 仍保留，专供纠偏 loop 的
// bandMemory 省 token 跨轮记忆（模型输入侧），与本查看器文档是两个不同用途、不混用。

/** 把单条事件忠实渲染成「模型真正看到的那一行」：只取喂进对话的 content（不含内部 details 结构），不折叠。
 *  toolResult 的 content 即回灌给模型的工具结果正文（含 skill 写法正文/读到的原文），忠实全量。 */
function renderFaithfulEventLine(event: AppendLogEvent): string {
  switch (event.type) {
    case 'message': {
      const content = String(event.content || '').trim()
      return content ? `〔${event.role}〕${content}` : ''
    }
    case 'toolCall':
      return `〔调用 ${event.call.toolName}〕${JSON.stringify(event.call.args ?? {})}`
    case 'toolResult': {
      const name = String(event.result.toolName || '').trim()
      const content = String(event.result.content || '').trim()
      const tag = event.result.status === 'error' ? '工具报错' : '工具结果'
      return `〔${tag} ${name}〕${content}`.trim()
    }
    case 'error': {
      const where = [event.stage, event.toolName].filter(Boolean).join('·')
      return `〔报错${where ? ` ${where}` : ''}〕${event.error?.type || ''}${event.error?.message ? `：${event.error.message}` : ''}`
    }
    case 'decision':
      return `〔决策〕${String(event.decision?.text || '').trim()}`
    default:
      return ''
  }
}

/**
 * option C·「喂模型原文」查看器文档：真实 prompt 段 + 本轮 loop 真实往来（未折叠）。
 * - promptText：发送时留存的真实 prompt（system+user 拼好那份）；空（旧数据未捕获）时回退旧压缩台账，历史轮零回归。
 * - events：本带 append log 事件；过滤演员子 loop 过程事件（origin='actor'·context isolation·与压缩投影同口径）。
 * - 无 prompt 且无事件返回空串（调用方据此不显示该块）。
 * - 真机修③（2026-07-03·用户指出重复）：批次D 起统筹重建路的 prompt **自含**层5 操作日志（每 turn 刷新·含全部往来），
 *   再拼「本轮往来」段=整段重复——检测到日志段标题即只显示 prompt。纠偏 loop（无重建·prompt 为开局态）不含标题，
 *   仍拼「本轮往来」段补齐往来，零回归。
 */
export function renderDirectorMemoryDocument(
  promptText: string,
  events: AppendLogEvent[] | null | undefined
): string {
  const prompt = String(promptText || '').trim()
  const list = Array.isArray(events) ? events : []
  // 旧数据兜底：没留存真实 prompt 快照（本次改动前落库的历史轮）时回退旧压缩台账，仍可显示、零回归。
  if (!prompt) return renderAppendLogProjection(list)
  // 重建路 prompt 已自含往来（层5 操作日志段）→ 不再拼重复的「本轮往来」段。
  if (prompt.includes(DIRECTOR_ROUND_LOG_SECTION_TITLE)) return prompt
  const own = list.filter((e) => e.origin !== 'actor')
  const transcript = own.map(renderFaithfulEventLine).filter(Boolean).join('\n')
  const sections = [prompt]
  if (transcript) sections.push(`—— 本轮往来（提调真实读到 / 产出 · 未折叠）——\n${transcript}`)
  return sections.join('\n\n')
}
