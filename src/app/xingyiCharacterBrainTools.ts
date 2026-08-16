/**
 * 星依「读正式角色大脑」工具（状态系统取料闭环计划批次2·2026-07-09 用户拍板）——自包含只读工具工厂。
 *
 * 一件：readCharacterBrain——给正式角色名/id，读它的【核心资料 + 灵魂节点（稳定认知）+ 轨迹关键经历】，
 * 供星依按角色真实设定整理状态栏/角色/关系/物品/组织/设定（先读大脑再落笔，不凭空编）。
 *
 * ⚠️ 知识隔离红线边界（用户 2026-07-09 拍板准许，管理用途专用）：
 * - 本工具是**星依作为全局管理 agent 的只读能力**，与扮演链路的「角色大脑彼此隔离、角色不碰文档库」（06-22 红线）
 *   性质不同、互不影响：本工具**不改动**星依的取料接缝（仍 docLibraryOnly），只是额外提供一个显式的角色大脑只读口子。
 * - 只读、不写、不参与任何扮演时的角色取料；数据来自 charStore 的角色 record（浮坞注入 provider）。
 *
 * 数据源（全部从 character record 自身读，不需要额外 documents）：
 * - 核心 = buildCharacterCoreMarkdown（name/性格/目标价值/外貌/说话风格/经历/世界观/背景等核心字段）。
 * - 灵魂 = readCharacterBrainCognitionNodes（稳定认知节点·kind=认知/关系/引用，跳过 group 文件夹）。
 * - 轨迹 = readCharacterBrainTraceNodes（关键经历=systemRole eventLeaf/arrangementLeaf 或带 note 的节点，
 *   跳过纯结构自动枝 year/month/multiYearBranch；按日期时序，条数超额只给最近若干）。
 *
 * 三态结果文案范式与 xingyiStatusSystemTools / xingyiProjectionTools 一致（联动标注：统一改时多处同步）。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import type { Character } from '../types'
import type { CharacterBrainCognitionNode, CharacterBrainTraceNode } from '../types/characterBrain'
import { buildCharacterCoreMarkdown } from './characterCoreMarkdownTransfer'
import { readCharacterBrainCognitionNodes, readCharacterBrainTraceNodes } from './characterBrain'

/** 角色数据接缝（浮坞注入=charStore；缺省=不装配本工具·测试注 mock）。 */
export interface XingyiCharacterBrainProvider {
  /** 全部正式角色（名+id·解析角色名用）。 */
  listCharacters: () => Array<{ id: string; name: string }>
  /** 读单个角色的完整 record（含 brainCognitionNodes/brainTraceNodes 等大脑字段）。 */
  readCharacter: (characterId: string) => Record<string, unknown> | null
}

export interface XingyiCharacterBrainToolContext {
  provider: XingyiCharacterBrainProvider
}

const TRACE_EVENT_LIMIT = 40
const BODY_CLIP = 200

type BrainSection = 'core' | 'soul' | 'trace'
const ALL_SECTIONS: BrainSection[] = ['core', 'soul', 'trace']

function clipText(text: string, limit = BODY_CLIP): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

// ── 三态结果文案（联动标注：与 xingyiStatusSystemTools 同款范式）──

function providerMissingResult(): ToolExecutionResult {
  return {
    content: '角色数据未接入，星依这轮读不了角色大脑。请如实告知用户本工具暂不可用（需要桌面工作台就绪）。',
    details: { providerMissing: true }
  }
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

function runFailureResult(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

/** 角色名/id → 角色解析（同 resolveStatusSystemItem 心智：先精确 id，再精确名，最后唯一子串）。 */
function resolveCharacter(
  characters: Array<{ id: string; name: string }>,
  raw: string
): { id: string; name: string } | { error: string } {
  const value = String(raw || '').trim()
  if (!value) return { error: '缺少角色名称或 id' }
  const byId = characters.find((item) => item.id === value)
  if (byId) return byId
  const exact = characters.filter((item) => item.name === value)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    return { error: `「${value}」有 ${exact.length} 个同名角色，请改用 id 指定：${exact.slice(0, 8).map((item) => `${item.name}(${item.id})`).join('、')}` }
  }
  const partial = characters.filter((item) => item.name.includes(value))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    return { error: `「${value}」匹配到多个角色，请用完整名称或 id：${partial.slice(0, 8).map((item) => `${item.name}(${item.id})`).join('、')}` }
  }
  return { error: `没有找到名为「${value}」的正式角色。可选：${characters.slice(0, 12).map((item) => item.name).join('、') || '（无）'}` }
}

// ── 灵魂 / 轨迹渲染 ──

function cognitionKindLabel(kind: CharacterBrainCognitionNode['kind']): string {
  if (kind === 'relation') return '关系认知'
  if (kind === 'reference') return '引用'
  return '认知'
}

function renderSoul(nodes: CharacterBrainCognitionNode[]): string {
  // 跳过 group 文件夹节点，只留真正的认知内容。
  const meaningful = nodes.filter((node) => node.kind !== 'group')
  if (!meaningful.length) return '（暂无灵魂节点/稳定认知）'
  return meaningful.map((node) => {
    // 关系认知的 content 是 JSON，取 summary 更可读；其余优先 content 再 summary。
    const body = node.kind === 'relation'
      ? String(node.summary || '').trim()
      : (String(node.content || '').trim() || String(node.summary || '').trim())
    return `- 【${cognitionKindLabel(node.kind)}】${node.title || '（无题）'}${body ? `：${clipText(body)}` : ''}`
  }).join('\n')
}

/** 关键经历判定：系统角色是事件/安排叶，或带 note 的节点；纯结构自动枝（年/月/多年枝）不算。 */
function isTraceEvent(node: CharacterBrainTraceNode): boolean {
  const role = node.systemRole
  if (role === 'eventLeaf' || role === 'arrangementLeaf') return true
  if (role === 'yearBranch' || role === 'monthBranch' || role === 'multiYearBranch') return false
  return Boolean(String(node.note || '').trim())
}

function traceSortKey(node: CharacterBrainTraceNode): string {
  return String(node.pointDate || node.startDate || node.timeLabel || '')
}

function renderTrace(nodes: CharacterBrainTraceNode[]): { text: string; total: number; shown: number } {
  const events = nodes
    .filter(isTraceEvent)
    .sort((a, b) => traceSortKey(a).localeCompare(traceSortKey(b)))
  if (!events.length) return { text: '（暂无轨迹关键经历）', total: 0, shown: 0 }
  const total = events.length
  const shown = total > TRACE_EVENT_LIMIT ? events.slice(-TRACE_EVENT_LIMIT) : events
  const lines = shown.map((node) => {
    const date = String(node.pointDate || node.startDate || node.timeLabel || '').trim()
    const age = String(node.ageLabel || '').trim()
    const when = [date, age].filter(Boolean).join('·')
    const title = String(node.displayTitle || node.title || '').trim() || '（无题）'
    const note = String(node.note || '').trim()
    return `- ${when ? `[${when}] ` : ''}${title}${note ? `：${clipText(note)}` : ''}`
  })
  return { text: lines.join('\n'), total, shown: shown.length }
}

function readSections(raw: unknown): BrainSection[] {
  if (!Array.isArray(raw)) return ALL_SECTIONS
  const picked = raw
    .map((item) => String(item ?? '').trim())
    .filter((item): item is BrainSection => item === 'core' || item === 'soul' || item === 'trace')
  return picked.length ? Array.from(new Set(picked)) : ALL_SECTIONS
}

/** 读正式角色大脑（只读·星依管理专用）。 */
export function createReadCharacterBrainTool(ctx: XingyiCharacterBrainToolContext): ToolDefinition {
  return {
    name: 'readCharacterBrain',
    brief: '读某个正式角色的大脑：核心资料 + 灵魂节点（稳定认知）+ 轨迹关键经历。'
      + '整理这个角色的状态栏/关系/设定前先读它，按角色真实设定落笔而不是凭空编。'
      + '给角色名或 id；可只取需要的段（sections=core/soul/trace）省消耗。（只读·星依管理专用）',
    schema: {
      type: 'object',
      properties: {
        character: { type: 'string', description: '正式角色名称或 id（必填）。' },
        sections: {
          type: 'array',
          items: { type: 'string', enum: ['core', 'soul', 'trace'] },
          description: '要读的段（可选·缺省全读）：core=核心资料 / soul=灵魂节点稳定认知 / trace=轨迹关键经历。只需某一块时给它省 token。'
        }
      },
      required: ['character']
    },
    validateArgs: (args) => (String(args.character || '').trim() ? null : 'readCharacterBrain 缺少 character（角色名称或 id）'),
    execute: async (toolCall) => {
      const characters = ctx.provider.listCharacters()
      if (!characters.length) return providerMissingResult()
      const resolved = resolveCharacter(characters, String(toolCall.args.character || ''))
      if ('error' in resolved) return invalidArgumentResult(resolved.error)
      const record = ctx.provider.readCharacter(resolved.id)
      if (!record) return runFailureResult('读取角色大脑', new Error(`读取不到角色「${resolved.name}」的数据`))
      const sections = readSections(toolCall.args.sections)
      try {
        const character = record as unknown as Character
        const blocks: string[] = [`正式角色「${resolved.name}」（id=${resolved.id}）的大脑：`]
        if (sections.includes('core')) {
          blocks.push(`\n【核心资料】\n${buildCharacterCoreMarkdown(record).trim()}`)
        }
        if (sections.includes('soul')) {
          const soul = readCharacterBrainCognitionNodes(character)
          blocks.push(`\n【灵魂节点·稳定认知（${soul.filter((node) => node.kind !== 'group').length} 个）】\n${renderSoul(soul)}`)
        }
        if (sections.includes('trace')) {
          const trace = renderTrace(readCharacterBrainTraceNodes(character))
          const overflow = trace.total > trace.shown
          blocks.push(`\n【轨迹·关键经历（${trace.total} 条${overflow ? `·只列最近 ${trace.shown} 条` : ''}）】\n${trace.text}${overflow ? '\n（经历较多，只给了最近若干条。）' : ''}`)
        }
        return {
          content: blocks.join('\n'),
          details: { characterId: resolved.id, sections }
        }
      } catch (error) {
        return runFailureResult('读取角色大脑', error)
      }
    }
  }
}

/** 批次2 读角色大脑工具：harness 在 characterBrain 接缝在场时装配。 */
export function createXingyiCharacterBrainTools(ctx: XingyiCharacterBrainToolContext): ToolDefinition[] {
  return [createReadCharacterBrainTool(ctx)]
}
