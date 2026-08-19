/**
 * 批次D（2026-07-02·层5 动态提示词）：提调统筹 loop「本轮操作日志」渲染器。
 *
 * 数据源＝runtime 保真事件（{@link AgentRuntimeFidelityEvent}·与 append log 同源·harness onEvent 时本地累积），
 * 每 turn 由 harness 重建 prompt 时渲染进「【5·提调带信息流】」尾部，让提调随时知道「我这轮到底干了什么」
 * （用户 2026-07-02 拍板：层5=提调带自己的聊天记录/操作日志）。
 *
 * 规则（0-6 分层计划书批次D）：
 * - thought 一行（提调每步的导演旁述）；工具调用一行（名+参数预览）；结果一行。
 * - 报错/被拦 **加粗** 显眼（重要节点加粗·用户原意；「每次勾 todo」的加粗在批次F 有事件源后接入）。
 * - 批次E（2026-07-03·层4 已接）：harness 传 resultLimit=DIRECTOR_ROUND_LOG_RESULT_LIMIT(120)——成功结果超长即截 120 字
 *   （截断标注指向【4·已读资料】），完整原文由 harness 同轮挪进层4 容器；阈值判定与日志行共用 collapseToolResultText 同一折叠口径。
 *
 * 纯函数·可单测；只认 runtime 原生事件类型，不认 append log 形态（边界与 appendLogFeed 同口径单向）。
 * semantic-compaction / journal-error 是运行时审计事件，不进入提调业务信息流；事件分支必须保持编译期穷尽。
 */

import type { AgentRuntimeFidelityEvent } from './agentRuntime/runtime'
// 真机六验·同轮互通（2026-07-05）：ingestAppendLogEvent 回放保真事件（appendLogTypes 判别联合·type-only 编译期擦除）。
import type { AppendLogEvent } from './agentState/appendLogTypes'

/** 层5 操作日志段标题（单一真值·三处共用勿散写）：assembleGroupDirectorMessages 装配段头、
 *  查看器 renderDirectorMemoryDocument 据它判断「prompt 已自含往来→不再拼重复的本轮往来段」。 */
export const DIRECTOR_ROUND_LOG_SECTION_TITLE = '〔本轮操作日志·你在这一轮里已做过的每一步·实时更新〕'

/** 批次E·层5 工具成功结果预览上限（字符）：超过即日志行截断，完整原文由 harness 同轮挪【4·已读资料】。
 *  两边（截断/挪层4）必须用同一阈值，勿各写一份。 */
export const DIRECTOR_ROUND_LOG_RESULT_LIMIT = 120

/** 工具结果折叠空白视图：日志行渲染与「超长挪层4」阈值判定共用同一口径（勿各自 replace 漂移）。 */
export function collapseToolResultText(content: unknown): string {
  return String(content ?? '').replace(/\s+/g, ' ').trim()
}

/** 工具入参 → 一行预览：挑常见键名，回退拼全部标量值；折叠空白截 limit。
 *  批次E 导出：harness 用它给层4 条目命名（「工具名（参数预览）」·同参重读覆盖去重）。 */
export function previewToolArgs(args: Record<string, unknown> | undefined, limit = 80): string {
  if (!args) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (value == null) continue
    const text = typeof value === 'string' ? value : (typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')
    if (!text.trim()) continue
    parts.push(`${key}=${text.trim()}`)
  }
  const joined = parts.join('，').replace(/\s+/g, ' ').trim()
  return joined.length > limit ? `${joined.slice(0, limit)}…` : joined
}

/** assistant 消息 content（编排元数据 JSON）→ thought 一句；解析不出返回 ''。 */
function parseThought(content: string): string {
  const text = String(content || '').trim()
  if (!text) return ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    const obj = JSON.parse(match ? match[0] : text)
    return String(obj?.thought ?? '').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

export interface RenderDirectorRoundLogOptions {
  /** 成功结果预览截断长度；缺省/<=0＝不截断。批次E：统筹 harness 传 DIRECTOR_ROUND_LOG_RESULT_LIMIT(120)。 */
  resultLimit?: number
  /** 截断标注补充说明（如「全文见【4·已读资料】」）：非空时拼进截断标记，告诉模型全文去哪找。 */
  truncatedNote?: string
}

/**
 * 渲染本轮操作日志（按事件发生顺序逐行）。空事件列表返回 ''（调用方据此不注入日志段）。
 * 行形态：`- 旁述：…` / `- 调用 工具名（参数预览）` / `- ↳ 结果：…` / `- ↳ **报错（TYPE）：…**`。
 */
/**
 * H2（2026-07-04·统筹/纠偏共用）：当轮「操作日志 + 层4 已读资料」收集器——
 * 把统筹 harness 批次D/E 的内联逻辑收口成单一件，纠偏 loop 升 0-6 复用同一套（联动能力·勿再各写一份）：
 * - ingest(保真事件)：渲染日志行（成功结果截 DIRECTOR_ROUND_LOG_RESULT_LIMIT·标注指向层4）；
 *   成功结果折叠后超限 → 逐字全文（保换行）归档层4 容器，key=「工具名（参数预览）」同参重读覆盖。
 * - pushLine：外部时序行（如统筹空转 nudge 的加粗系统提醒）按发生顺序插日志。
 * - renderLog / renderReadMaterials：重建 prompt 时取层5 日志段与层4 段内容。
 */
export interface DirectorRoundLogCollector {
  ingest(event: AgentRuntimeFidelityEvent): void
  /** 真机六验·同轮互通（2026-07-05·用户「主 loop 互通认知」）：把带内**已落保真层**的历史事件（统筹轮全部步骤
   *  + 历次纠偏 + 失败报错·appendLog 形态）回放成层5 日志行——纠偏 loop 开局即站在统筹信息流的延续上，
   *  超长成功结果同样归档层4（与 ingest 同口径）。演员子 loop 过程事件（origin='actor'）过滤（context isolation）。 */
  ingestAppendLogEvent(event: AppendLogEvent): void
  pushLine(line: string): void
  hasLines(): boolean
  renderLog(): string
  renderReadMaterials(): string
}

/** 批次I（2026-07-04·层4 生命周期）：层4 只保**最近读回的 N 条**逐字全文；更旧条目降级成一行索引
 *  （原文仍保真在 append log·可用 searchDirectorMemory 按关键词搜回精确段落·rg 式窗口）。
 *  防「读得越多 prompt 越臃肿」——最近读的必须在场（写作要用），旧的按需搜回。 */
export const DIRECTOR_READ_MATERIALS_KEEP_RECENT = 3

export function createDirectorRoundLogCollector(): DirectorRoundLogCollector {
  const lines: string[] = []
  // 层4 轮级容器（一 loop 一份=一轮·下轮新建自然清空）；条目带归档序号（重读同参=刷新为最新）。
  // tool-result 事件只带 callId 不带参数，tool-call 时按 callId 暂存参数预览供结果侧命名。
  const readMaterials = new Map<string, { text: string; seq: number }>()
  const pendingToolArgsPreview = new Map<string, string>()
  // 真机六验·回放去重：decision 事件多是 assistant thought 的提炼视图（同文重复·且可能集中在事件尾部），
  // 按文本去重——正常步骤走 assistant message 原位渲染，独有决策（如「据XX纠偏调整」转场标记）保留。
  const seenReplayThoughts = new Set<string>()
  let archiveSeq = 0
  // 超长成功结果归档层4（ingest 保真路 / ingestAppendLogEvent 回放路共用同一口径）。返回日志行该显示的截断文本。
  // 批次2（2026-07-08·缓存断面）：同 key **同内容**重读＝原位不动（不刷新 seq、不改写文本）——层4 渲染产物逐字不变，
  // 保前缀缓存（旧行为「重读即搬到末尾」是每 pass 缓存恒卡在稳定头部的突变源之一）；内容有变才刷新为最新
  //（升回全文窗口·新料要在场）。同参同结果的重复读本就被 runtime 重复调用提醒劝阻，折叠掉的旧料按需用 searchDirectorMemory 搜回。
  const archiveLongResult = (toolName: string, callId: string, rawContent: unknown): string => {
    const full = collapseToolResultText(rawContent)
    if (full.length <= DIRECTOR_ROUND_LOG_RESULT_LIMIT) return full
    const argsPreview = (callId && pendingToolArgsPreview.get(callId)) || ''
    const key = `${toolName}${argsPreview ? `（${argsPreview}）` : ''}`
    const text = String(rawContent ?? '')
    const existing = readMaterials.get(key)
    if (!existing || existing.text !== text) {
      archiveSeq += 1
      readMaterials.set(key, { text, seq: archiveSeq })
    }
    return `${full.slice(0, DIRECTOR_ROUND_LOG_RESULT_LIMIT)}…（已截断·全文见【4·已读资料】）`
  }
  return {
    ingest(event: AgentRuntimeFidelityEvent): void {
      if (event.kind === 'tool-call') {
        pendingToolArgsPreview.set(event.toolCall.callId, previewToolArgs(event.toolCall.args))
      } else if (event.kind === 'tool-result' && event.toolResult.status === 'success') {
        // 阈值判定与日志行渲染共用同一折叠口径（超长即「日志被截断」，全文必须可在层4 找到）。
        archiveLongResult(event.toolResult.toolName, event.toolResult.callId, event.toolResult.content)
      }
      const line = renderDirectorRoundLog([event], {
        resultLimit: DIRECTOR_ROUND_LOG_RESULT_LIMIT,
        truncatedNote: '全文见【4·已读资料】'
      })
      if (line) lines.push(line)
    },
    ingestAppendLogEvent(event: AppendLogEvent): void {
      // 演员子 loop 过程事件不进提调信息流（context isolation·与压缩投影 renderAppendLogProjection 同口径）。
      if (event.origin === 'actor') return
      switch (event.type) {
        case 'message': {
          // 用户输入=重要节点加粗；assistant 原始 JSON 提炼 thought 原位渲染；system/tool 回灌不进信息流
          //（system=开局大块提示词、tool=与 toolResult 重复）。
          if (event.role === 'user') {
            const content = collapseToolResultText(event.content)
            if (content) lines.push(`- **【用户】${content}**`)
            return
          }
          if (event.role === 'assistant') {
            const thought = parseThought(event.content)
            if (thought) {
              seenReplayThoughts.add(thought)
              lines.push(`- 旁述：${thought}`)
            }
          }
          return
        }
        case 'decision': {
          const text = String(event.decision?.text || '').replace(/\s+/g, ' ').trim()
          if (!text || seenReplayThoughts.has(text)) return
          seenReplayThoughts.add(text)
          lines.push(`- 旁述：${text}`)
          return
        }
        case 'toolCall': {
          const preview = previewToolArgs(event.call.args)
          if (event.call.callId) pendingToolArgsPreview.set(event.call.callId, preview)
          lines.push(`- 调用 ${event.call.toolName}${preview ? `（${preview}）` : ''}`)
          return
        }
        case 'toolResult': {
          const result = event.result
          if (result.status !== 'success') {
            const type = String(result.error?.type || result.status || '').trim()
            const message = String(result.error?.message || result.content || '').replace(/\s+/g, ' ').trim()
            lines.push(`- ↳ **报错（${type}）：${message}**`)
            return
          }
          const shown = archiveLongResult(result.toolName, result.callId, result.content)
          lines.push(`- ↳ 结果：${shown || '（空）'}`)
          return
        }
        case 'error': {
          const where = [event.stage, event.toolName].filter(Boolean).join('·')
          const message = String(event.error?.message || '').replace(/\s+/g, ' ').trim()
          lines.push(`- ↳ **报错${where ? ` ${where}` : ''}（${event.error?.type || ''}）${message ? `：${message}` : ''}**`)
          return
        }
      }
    },
    pushLine(line: string): void {
      const text = String(line || '').trim()
      if (text) lines.push(text)
    },
    hasLines(): boolean {
      return lines.length > 0
    },
    renderLog(): string {
      return lines.join('\n')
    },
    renderReadMaterials(): string {
      if (!readMaterials.size) return ''
      // 批次I·生命周期：按归档序升序渲染；只有最近 KEEP_RECENT 条保留逐字全文，更旧降级索引行
      //（原文保真在带记忆里·searchDirectorMemory 可按关键词搜回精确段落）。
      const entries = [...readMaterials.entries()].sort((a, b) => a[1].seq - b[1].seq)
      const fulltextFrom = Math.max(0, entries.length - DIRECTOR_READ_MATERIALS_KEEP_RECENT)
      return entries.map(([label, item], index) => (
        index < fulltextFrom
          ? `〔${label}〕（逐字全文已从本层折叠·原文仍在你的带记忆里，用 searchDirectorMemory 按关键词搜回精确段落）`
          : `〔${label}〕\n${item.text}`
      )).join('\n\n')
    }
  }
}

export function renderDirectorRoundLog(
  events: ReadonlyArray<AgentRuntimeFidelityEvent>,
  options: RenderDirectorRoundLogOptions = {}
): string {
  // 显式保住元素联合类型；不让 Array.isArray 的 any[] 谓词抹掉 kind 穷尽检查。
  const list: ReadonlyArray<AgentRuntimeFidelityEvent> = Array.isArray(events) ? events : []
  if (!list.length) return ''
  const resultLimit = Number(options.resultLimit || 0)
  const lines: string[] = []
  for (const event of list) {
    switch (event.kind) {
      case 'assistant-message': {
        const thought = parseThought(event.content)
        if (thought) lines.push(`- 旁述：${thought}`)
        break
      }
      case 'tool-call': {
        const args = previewToolArgs(event.toolCall.args)
        lines.push(`- 调用 ${event.toolCall.toolName}${args ? `（${args}）` : ''}`)
        break
      }
      case 'tool-result': {
        // 成功=结果全文（折叠空白·按 resultLimit 截）；error/blocked=加粗报错行（报错也输出原则）。
        const result = event.toolResult
        if (result.status === 'success') {
          const full = collapseToolResultText(result.content)
          const note = String(options.truncatedNote || '').trim()
          const shown = resultLimit > 0 && full.length > resultLimit
            ? `${full.slice(0, resultLimit)}…（已截断${note ? `·${note}` : ''}）`
            : full
          lines.push(`- ↳ 结果：${shown || '（空）'}`)
        } else {
          const type = String(result.error?.type || result.status || '').trim()
          const message = String(result.error?.message || result.content || '').replace(/\s+/g, ' ').trim()
          lines.push(`- ↳ **报错（${type}）：${message}**`)
        }
        break
      }
      case 'semantic-compaction':
      case 'journal-error':
        // 它们由各自的审计面消费；写进层5 会污染提调对业务动作的认知。
        break
      default: {
        // 编译期穷尽门：新增 runtime 事件时必须在这里显式决定展示语义。
        const unhandledEvent: never = event
        void unhandledEvent
      }
    }
  }
  return lines.join('\n')
}
