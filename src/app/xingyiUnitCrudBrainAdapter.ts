/**
 * 星依单位工具·角色大脑适配器（2026-07-07 计划批次2）。
 *
 * 真值路径（不要求角色大脑页面在场·用户拍板）：
 *   ports.readCharacter（store 最新）→ 单位宇宙 buildCharacterBrainUnitView（与读侧投影同源）
 *   → 纯函数命令层（characterBrainTreeModel 建改移删 / applyCharacterBrainCardDraft 正文统一写回）
 *   → ports.updateCharacter 落库（store 响应式，打开中的页面自动刷新）。
 *
 * 三区边界（数据模型硬边界，非策略）：
 * - 核心区：角色原字段，结构固定——只能改正文（改名/新建/删除/移动一律拒绝）。
 * - 灵魂区：brainCognitionNodes，全能力。
 * - 轨迹区：brainTraceNodes，全能力；系统日期节点（年枝/月枝/日桠）标题由日期派生不可改名；
 *   删除系统枝会连带子孙，确认卡片按用户拍板给严厉警示+误删后果（完全放开但重警示）。
 *
 * 防并发覆盖：apply 时从 store 重读最新角色再重算纯函数命令，不拿计划时的旧快照直接写。
 */

import type { Character } from '../types'
import type { UnitView, UnitViewAdapterResult } from '../types/unitView'
import { applyCharacterBrainCardDraft, createCharacterBrainReadContext, readCharacterBrainCompilePage, readCharacterBrainTraceNodes } from './characterBrain'
import {
  createCharacterBrainSoulTreeNode,
  createCharacterBrainTraceArrangementTreeNode,
  createCharacterBrainTraceEventTreeNode,
  createCharacterBrainTraceGroupTreeNode,
  createNextCharacterBrainTraceDayTreeNode,
  deleteCharacterBrainSoulTreeNode,
  deleteCharacterBrainTraceTreeNode,
  isFormalTraceDayNode,
  moveCharacterBrainSoulTreeNode,
  moveCharacterBrainTraceTreeNode,
  updateCharacterBrainSoulTreeNode,
  updateCharacterBrainTraceTreeNode
} from './characterBrainTreeModel'
import { createTidiaoUnitIdCodec, type TidiaoUnitIdCodec } from './tidiaoUnitIdCodec'
import { buildCharacterBrainUnitView } from './unitViewAdapters'
import { buildXingyiCompilePageDiagnostics } from './xingyiCompilePageDiagnostics'
import { resolveXingyiPersonalityCharacter } from './xingyiPersonalityTools'
import {
  applyCompilePageEdit,
  applyXingyiUnitBodyEdit,
  type XingyiCompilePageFields,
  type XingyiUnitCrudAdapter,
  type XingyiUnitCrudError,
  type XingyiUnitWritePlan
} from './xingyiUnitCrudTools'

/** 灵魂/轨迹节点 id 前缀（联动标注：与 characterBrain.ts / RoleBrainSidebarTree.vue 同值常量，改前缀多处同步）。 */
const COGNITION_NODE_ID_PREFIX = 'brain:cognition:node:'
const TRACE_NODE_ID_PREFIX = 'brain:trajectory:node:'
/** 轨迹根的写侧 parentId 真值（unitViewAdapters LEGACY_TRACE_ROOT_ID 同值）。 */
const TRACE_ROOT_SOURCE_ID = 'brain:trajectory'

const LIST_TREE_LINE_LIMIT = 400
const READ_BODY_LIMIT = 8000

export interface XingyiCharacterBrainCrudPorts {
  /** 角色清单（名称→id 解析数据源；浮坞注 characterStore.characters）。 */
  listCharacters: () => Array<{ id: string; name: string }>
  /** 读角色（store 最新真值；浮坞注 characterStore.getCharacter）。 */
  readCharacter: (characterId: string) => Character | null
  /** 角色写回（浮坞注 characterStore.updateCharacter，落库走 PUT /characters/:id）。 */
  updateCharacter: (characterId: string, changes: Record<string, unknown>) => Promise<void>
}

interface BrainUniverse {
  character: Character
  characterId: string
  characterName: string
  /** 完整视图结果（含 warnings·编译页体检要用）；units 是它的别名切片。 */
  view: UnitViewAdapterResult
  units: UnitView[]
  childrenByParent: Map<string, UnitView[]>
  traceById: ReturnType<typeof createCharacterBrainReadContext>['traceById']
  codec: TidiaoUnitIdCodec
}

type BrainSection = 'core' | 'soul' | 'trace' | 'root' | 'unknown'

function clip(text: string, limit = 80): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function newNodeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}${crypto.randomUUID()}`
  return `${prefix}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function sectionOf(unit: UnitView): BrainSection {
  if (['character', 'core', 'soul', 'trace'].includes(unit.unitType)) return 'root'
  if (unit.unitType === 'coreField') return 'core'
  if (unit.unitType === 'branch') return unit.metadata?.section === 'core' ? 'core' : 'unknown'
  if (unit.unitType === 'soulNode') return 'soul'
  if (['traceDay', 'traceGroup', 'traceEvent', 'traceArrangement'].includes(unit.unitType)) return 'trace'
  return 'unknown'
}

function unitKindLabel(universe: BrainUniverse, unit: UnitView): string {
  switch (unit.unitType) {
    case 'character': return '角色根'
    case 'core': return '核心区'
    case 'soul': return '灵魂区'
    case 'trace': return '轨迹区'
    case 'coreField': return '核心字段'
    case 'branch': return '核心分组'
    case 'soulNode': return unit.metadata?.kind === 'group' ? '灵魂组' : '灵魂单位'
    case 'traceEvent': return '事件'
    case 'traceArrangement': return '安排'
    case 'traceDay': return '轨迹日'
    case 'traceGroup': {
      const node = universe.traceById.get(String(unit.sourceId || ''))
      if (node?.systemRole === 'yearBranch') return '系统年枝'
      if (node?.systemRole === 'monthBranch') return '系统月枝'
      return '轨迹组'
    }
    default: return '单位'
  }
}

function findTraceNode(character: Character, sourceId: string) {
  return readCharacterBrainTraceNodes(character).find((node) => node.id === sourceId) || null
}

/** 系统日期节点：标题由日期派生（改名无效），年/月枝还是日历骨架。 */
function isSystemTitledTraceNode(character: Character, sourceId: string): boolean {
  const node = findTraceNode(character, sourceId)
  if (!node) return false
  return node.systemRole === 'yearBranch' || node.systemRole === 'monthBranch' || node.systemRole === 'dayLeaf' || isFormalTraceDayNode(node)
}

function resolveBrainCharacter(
  ports: XingyiCharacterBrainCrudPorts,
  scope: string | undefined
): { characterId: string; characterName: string } | XingyiUnitCrudError {
  const name = String(scope || '').trim()
  if (!name) return { error: 'domain=characterBrain 必须给 characterName（角色名或角色 id）。' }
  const resolved = resolveXingyiPersonalityCharacter(ports.listCharacters(), name)
  if (resolved.error || !resolved.character) return { error: resolved.error || `没有找到角色「${name}」。` }
  return { characterId: resolved.character.id, characterName: resolved.character.name }
}

function loadUniverse(
  ports: XingyiCharacterBrainCrudPorts,
  scope: string | undefined
): BrainUniverse | XingyiUnitCrudError {
  const resolved = resolveBrainCharacter(ports, scope)
  if ('error' in resolved) return resolved
  const character = ports.readCharacter(resolved.characterId)
  if (!character) return { error: `读取不到角色「${resolved.characterName}」的数据。` }
  const view = buildCharacterBrainUnitView(character)
  const units = view.units
  const readContext = createCharacterBrainReadContext(character)
  const codec = createTidiaoUnitIdCodec(() => units.map((unit) => unit.unitId))
  return {
    character,
    characterId: resolved.characterId,
    characterName: resolved.characterName,
    view,
    units,
    childrenByParent: buildChildrenMap(units),
    traceById: readContext.traceById,
    codec
  }
}

/** 单位解析：u#短码解码 → 精确 unitId → 精确 sourceId → 精确标题 → 唯一子串。 */
function resolveUnit(universe: BrainUniverse, raw: string): { unit: UnitView } | XingyiUnitCrudError {
  const input = String(raw || '').trim()
  if (!input) return { error: '缺少目标单位。' }
  const decoded = universe.codec.decode(input)
  const byId = universe.units.find((unit) => unit.unitId === decoded || unit.unitId === input)
  if (byId) return { unit: byId }
  const bySource = universe.units.find((unit) => String(unit.sourceId || '') === decoded || String(unit.sourceId || '') === input)
  if (bySource) return { unit: bySource }
  const describe = (list: UnitView[]) => list.slice(0, 8)
    .map((unit) => `${unit.title}（${unitKindLabel(universe, unit)}·${universe.codec.encode(unit.unitId)}）`)
    .join('、')
  const exact = universe.units.filter((unit) => unit.title === input)
  if (exact.length === 1) return { unit: exact[0] }
  if (exact.length > 1) return { error: `「${input}」有 ${exact.length} 个同名单位，请改用 unitId 指定：${describe(exact)}` }
  const partial = universe.units.filter((unit) => unit.title.includes(input))
  if (partial.length === 1) return { unit: partial[0] }
  if (partial.length > 1) return { error: `「${input}」匹配到多个单位，请用完整标题或 unitId：${describe(partial)}` }
  return { error: `角色「${universe.characterName}」的大脑里没有名为「${input}」的单位。可先用 listUnitTree 查证。` }
}

function buildChildrenMap(units: UnitView[]): Map<string, UnitView[]> {
  const childrenByParent = new Map<string, UnitView[]>()
  units.forEach((unit) => {
    if (!unit.parentId) return
    const list = childrenByParent.get(unit.parentId) || []
    list.push(unit)
    childrenByParent.set(unit.parentId, list)
  })
  childrenByParent.forEach((list) => list.sort((a, b) => (a.orderIndex ?? 1e9) - (b.orderIndex ?? 1e9)))
  return childrenByParent
}

function collectDescendants(universe: BrainUniverse, rootUnitId: string): UnitView[] {
  const result: UnitView[] = []
  const queue = [...(universe.childrenByParent.get(rootUnitId) || [])]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const unit = queue[cursor] as UnitView
    result.push(unit)
    queue.push(...(universe.childrenByParent.get(unit.unitId) || []))
  }
  return result
}

/** apply 统一收口：从 store 重读最新角色 → 重算纯函数命令 → updateCharacter 落库。 */
async function applyChangesOnFreshCharacter(
  ports: XingyiCharacterBrainCrudPorts,
  characterId: string,
  buildChanges: (fresh: Character) => Record<string, unknown> | XingyiUnitCrudError,
  successMessage: string
): Promise<{ ok: boolean; message: string }> {
  const fresh = ports.readCharacter(characterId)
  if (!fresh) return { ok: false, message: '读取不到角色最新数据，本次没有保存。' }
  const changes = buildChanges(fresh)
  if ('error' in changes && typeof changes.error === 'string') {
    return { ok: false, message: changes.error }
  }
  if (!Object.keys(changes).length) return { ok: false, message: '这次操作没有产生任何变化，未保存。' }
  await ports.updateCharacter(characterId, changes as Record<string, unknown>)
  return { ok: true, message: successMessage }
}

/** apply 时目标节点在场校验：纯函数命令对缺失 id 会静默 no-op，必须显式拦。 */
function requireBrainUnitAlive(fresh: Character, unit: UnitView): XingyiUnitCrudError | null {
  const sourceId = String(unit.sourceId || '')
  const stillThere = buildCharacterBrainUnitView(fresh).units
    .some((item) => item.unitId === unit.unitId || String(item.sourceId || '') === sourceId)
  return stillThere ? null : { error: `目标单位「${unit.title}」已不存在（可能刚被改动），本次没有保存，请重新查证后再试。` }
}

const SOUL_CREATE_KINDS = new Set(['soulnode', 'soulunit', 'soul'])
const SOUL_GROUP_KINDS = new Set(['soulgroup'])

export function createXingyiCharacterBrainCrudAdapter(ports: XingyiCharacterBrainCrudPorts): XingyiUnitCrudAdapter {
  return {
    label: '角色大脑',

    async listTree(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      let roots: UnitView[]
      if (input.parent) {
        const resolved = resolveUnit(universe, input.parent)
        if ('error' in resolved) return resolved
        roots = [resolved.unit]
      } else {
        roots = universe.units.filter((unit) => unit.unitType === 'character')
      }
      const lines: string[] = []
      let truncated = false
      const walk = (unit: UnitView, depth: number) => {
        if (lines.length >= LIST_TREE_LINE_LIMIT) {
          truncated = true
          return
        }
        lines.push(`${'  '.repeat(depth)}- ${unit.title}（${unitKindLabel(universe, unit)}·${universe.codec.encode(unit.unitId)}）`)
        ;(universe.childrenByParent.get(unit.unitId) || []).forEach((child) => walk(child, depth + 1))
      }
      roots.forEach((unit) => walk(unit, 0))
      if (!lines.length) return { text: '（这里还没有任何单位）' }
      return {
        text: [
          ...lines,
          ...(truncated ? [`（已截断到前 ${LIST_TREE_LINE_LIMIT} 行，可用 parent 参数只列某个分区/单位的子树）`] : [])
        ].join('\n')
      }
    },

    async readUnit(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const body = String(unit.body || '')
      const shownBody = body.length > READ_BODY_LIMIT ? `${body.slice(0, READ_BODY_LIMIT)}\n…（正文共 ${body.length} 字，已截断）` : body
      const children = collectDescendants(universe, unit.unitId).slice(0, 30)
      return {
        text: [
          `【${unit.title}】${unitKindLabel(universe, unit)}（${universe.codec.encode(unit.unitId)}）·角色：${universe.characterName}`,
          ...(unit.compilePage?.summary ? [`编译页摘要：${clip(unit.compilePage.summary, 200)}`] : []),
          ...(unit.status === 'pending' ? ['状态：待确认（pendingReview）'] : []),
          '——正文如下——',
          shownBody || '（正文为空）',
          ...(children.length ? ['', `直属/后代单位（前 ${children.length} 个）：`, ...children.map((child) => `- ${child.title}（${unitKindLabel(universe, child)}·${universe.codec.encode(child.unitId)}）`)] : [])
        ].join('\n')
      }
    },

    async diagnoseCompilePages(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      let scopeUnitIds: Set<string> | null = null
      let scopeLabel = '全部'
      if (input.parent) {
        const resolved = resolveUnit(universe, input.parent)
        if ('error' in resolved) return resolved
        scopeUnitIds = new Set([
          resolved.unit.unitId,
          ...collectDescendants(universe, resolved.unit.unitId).map((item) => item.unitId)
        ])
        scopeLabel = `「${resolved.unit.title}」子树`
      }
      const report = buildXingyiCompilePageDiagnostics(universe.view, {
        label: `角色大脑·${universe.characterName}`,
        scopeLabel,
        scopeUnitIds,
        ...(input.maxUnits ? { maxUnits: input.maxUnits } : {}),
        describeUnit: (unit) => `${unit.title}（${unitKindLabel(universe, unit)}·${universe.codec.encode(unit.unitId)}）`
      })
      return { text: report.text }
    },

    async planCreate(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const kind = String(input.kind || '').trim().toLowerCase()
      const title = String(input.title || '').trim()
      const now = new Date().toISOString()

      if (SOUL_CREATE_KINDS.has(kind) || SOUL_GROUP_KINDS.has(kind)) {
        let parentSourceId = ''
        if (input.parent) {
          const parent = resolveUnit(universe, input.parent)
          if ('error' in parent) return parent
          const parentSection = sectionOf(parent.unit)
          if (parent.unit.unitType === 'soul') {
            parentSourceId = ''
          } else if (parentSection === 'soul') {
            parentSourceId = String(parent.unit.sourceId || '')
          } else {
            return { error: `「${parent.unit.title}」不在灵魂区，灵魂单位只能挂在灵魂区下。` }
          }
        }
        const draft = {
          id: newNodeId(COGNITION_NODE_ID_PREFIX),
          title,
          parentId: parentSourceId,
          kind: SOUL_GROUP_KINDS.has(kind) ? 'group' as const : 'private' as const,
          content: typeof input.body === 'string' ? input.body : undefined,
          now
        }
        return {
          confirmLines: [
            `操作：新建${draft.kind === 'group' ? '灵魂组' : '灵魂单位'}「${title}」`,
            `位置：${input.parent ? `「${input.parent}」下` : '灵魂区根'}`,
            ...(draft.content ? [`正文：${draft.content.length} 字（开头：「${clip(draft.content)}」）`] : [])
          ],
          apply: () => applyChangesOnFreshCharacter(
            ports,
            universe.characterId,
            (fresh) => createCharacterBrainSoulTreeNode(fresh, draft),
            `已在角色「${universe.characterName}」灵魂区新建「${title}」。`
          )
        }
      }

      if (kind === 'traceday') {
        return {
          confirmLines: [
            `操作：新建轨迹日桠${input.date ? `（${input.date}）` : '（自动接续下一日）'}`,
            `概述：${title}`,
            ...(typeof input.body === 'string' && input.body ? [`正文：${input.body.length} 字（开头：「${clip(input.body)}」)`] : []),
            '提示：所在年枝/月枝不存在时会自动补建。'
          ],
          apply: () => applyChangesOnFreshCharacter(
            ports,
            universe.characterId,
            (fresh) => {
              const result = createNextCharacterBrainTraceDayTreeNode(fresh, {
                ...(input.date ? { targetDate: input.date } : {}),
                subtitle: title,
                summary: title,
                ...(typeof input.body === 'string' ? { content: input.body } : {}),
                now
              })
              return result.ok ? result.changes : { error: result.message }
            },
            `已在角色「${universe.characterName}」轨迹区新建日桠「${title}」。`
          )
        }
      }

      if (kind === 'traceevent' || kind === 'tracearrangement') {
        if (!input.parent) return { error: `新建${kind === 'traceevent' ? '事件' : '安排'}必须给 parent（挂在哪个轨迹日桠下）。` }
        const parent = resolveUnit(universe, input.parent)
        if ('error' in parent) return parent
        if (parent.unit.unitType !== 'traceDay') {
          return { error: `「${parent.unit.title}」不是轨迹日桠，事件/安排只能挂在日桠下。` }
        }
        const draft = {
          id: newNodeId(TRACE_NODE_ID_PREFIX),
          title,
          summary: '',
          content: typeof input.body === 'string' ? input.body : undefined,
          parentId: String(parent.unit.sourceId || ''),
          now
        }
        const isEvent = kind === 'traceevent'
        return {
          confirmLines: [
            `操作：新建${isEvent ? '事件' : '安排'}「${title}」`,
            `位置：日桠「${parent.unit.title}」下`,
            ...(draft.content ? [`正文：${draft.content.length} 字（开头：「${clip(draft.content)}」)`] : [])
          ],
          apply: () => applyChangesOnFreshCharacter(
            ports,
            universe.characterId,
            (fresh) => requireBrainUnitAlive(fresh, parent.unit)
              || (isEvent
                ? createCharacterBrainTraceEventTreeNode(fresh, draft)
                : createCharacterBrainTraceArrangementTreeNode(fresh, draft)),
            `已在日桠「${parent.unit.title}」下新建${isEvent ? '事件' : '安排'}「${title}」。`
          )
        }
      }

      if (kind === 'tracegroup') {
        let parentSourceId = TRACE_ROOT_SOURCE_ID
        if (input.parent) {
          const parent = resolveUnit(universe, input.parent)
          if ('error' in parent) return parent
          if (parent.unit.unitType === 'trace') {
            parentSourceId = TRACE_ROOT_SOURCE_ID
          } else if (sectionOf(parent.unit) === 'trace') {
            parentSourceId = String(parent.unit.sourceId || '')
          } else {
            return { error: `「${parent.unit.title}」不在轨迹区，轨迹组只能挂在轨迹区下。` }
          }
        }
        const draft = {
          id: newNodeId(TRACE_NODE_ID_PREFIX),
          title,
          content: typeof input.body === 'string' ? input.body : undefined,
          parentId: parentSourceId,
          now
        }
        return {
          confirmLines: [
            `操作：新建轨迹组「${title}」`,
            `位置：${input.parent ? `「${input.parent}」下` : '轨迹区根'}`
          ],
          apply: () => applyChangesOnFreshCharacter(
            ports,
            universe.characterId,
            (fresh) => createCharacterBrainTraceGroupTreeNode(fresh, draft),
            `已在角色「${universe.characterName}」轨迹区新建轨迹组「${title}」。`
          )
        }
      }

      return { error: `角色大脑的 kind 只支持 soulNode/soulGroup/traceDay/traceEvent/traceArrangement/traceGroup，收到「${input.kind}」。核心区结构固定不能新建。` }
    },

    async planEditBody(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const section = sectionOf(unit)
      if (section === 'root' || unit.unitType === 'branch' || section === 'unknown') {
        return { error: `「${unit.title}」是${unitKindLabel(universe, unit)}，没有可直接编辑的正文；请指定具体的核心字段/灵魂单位/轨迹单位。` }
      }
      const edit = {
        ...(input.replaceInBody ? { replaceInBody: input.replaceInBody } : {}),
        ...(typeof input.body === 'string' ? { body: input.body } : {})
      }
      const previewed = applyXingyiUnitBodyEdit(String(unit.body || ''), edit)
      if ('error' in previewed) return previewed
      const sourceId = String(unit.sourceId || '')
      return {
        confirmLines: [
          `单位：${unitKindLabel(universe, unit)}「${unit.title}」（角色：${universe.characterName}）`,
          ...previewed.changedLines
        ],
        apply: () => applyChangesOnFreshCharacter(
          ports,
          universe.characterId,
          (fresh) => {
            const freshUnit = buildCharacterBrainUnitView(fresh).units
              .find((item) => item.unitId === unit.unitId || String(item.sourceId || '') === sourceId)
            if (!freshUnit) return { error: `单位「${unit.title}」已不存在（可能刚被删除），本次没有保存。` }
            // 基于最新正文重算编辑（锚点替换在最新真值上重新定位，防确认期间正文被改后错替）
            const applied = applyXingyiUnitBodyEdit(String(freshUnit.body || ''), edit)
            if ('error' in applied) return { error: `正文在确认期间发生了变化：${applied.error}` }
            return applyCharacterBrainCardDraft(fresh, sourceId, { documentContent: applied.next }) as Record<string, unknown>
          },
          `已更新「${unit.title}」的正文。`
        )
      }
    },

    async planEditCompilePage(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const sourceId = String(unit.sourceId || '')
      // 当前值口径与页面同源：readCharacterBrainCompilePage（正式页优先、缺失用节点兜底页）
      const readCurrent = (character: Character): XingyiCompilePageFields | null => {
        const page = readCharacterBrainCompilePage(character, sourceId)
        if (!page) return null
        return {
          summary: page.summary,
          tags: [...page.tags],
          semanticType: String(page.semanticType || unit.semanticType || 'other'),
          relationHints: [...page.relationHints]
        }
      }
      const current = readCurrent(universe.character)
      if (!current) {
        return { error: `「${unit.title}」（${unitKindLabel(universe, unit)}）没有编译页——只有核心可召回字段、灵魂单位、轨迹单位有编译页。` }
      }
      const applied = applyCompilePageEdit(current, input.edit)
      if ('error' in applied) return applied
      return {
        confirmLines: [
          `单位：${unitKindLabel(universe, unit)}「${unit.title}」（角色：${universe.characterName}）`,
          ...applied.changedLines
        ],
        apply: () => applyChangesOnFreshCharacter(
          ports,
          universe.characterId,
          (fresh) => {
            const alive = requireBrainUnitAlive(fresh, unit)
            if (alive) return alive
            // 基于最新真值重算编辑（防确认期间编译页被改后错替）
            const freshCurrent = readCurrent(fresh)
            if (!freshCurrent) return { error: `单位「${unit.title}」的编译页已不可用（可能刚被改动），本次没有保存。` }
            const reApplied = applyCompilePageEdit(freshCurrent, input.edit)
            if ('error' in reApplied) return { error: `编译页在确认期间发生了变化：${reApplied.error}` }
            // 走 UI 同款统一写回（compile.* 键位）；召回分数原样回传防丢
            const freshPage = readCharacterBrainCompilePage(fresh, sourceId)
            return applyCharacterBrainCardDraft(fresh, sourceId, {
              'compile.summary': reApplied.next.summary,
              'compile.tags': reApplied.next.tags,
              'compile.relationHints': reApplied.next.relationHints,
              'compile.semanticType': reApplied.next.semanticType,
              ...(freshPage?.scoreDirectBase !== undefined ? { 'compile.scoreDirectBase': freshPage.scoreDirectBase } : {}),
              ...(freshPage?.scoreExpandBase !== undefined ? { 'compile.scoreExpandBase': freshPage.scoreExpandBase } : {}),
              ...(freshPage?.scoreSelfAnchor !== undefined ? { 'compile.scoreSelfAnchor': freshPage.scoreSelfAnchor } : {}),
              ...(freshPage?.scoreUserAnchor !== undefined ? { 'compile.scoreUserAnchor': freshPage.scoreUserAnchor } : {}),
              ...(freshPage?.scoreOtherAnchor !== undefined ? { 'compile.scoreOtherAnchor': freshPage.scoreOtherAnchor } : {})
            }) as Record<string, unknown>
          },
          `已更新「${unit.title}」的编译页。`
        )
      }
    },

    async planRename(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const newTitle = String(input.newTitle || '').trim()
      const section = sectionOf(unit)
      const sourceId = String(unit.sourceId || '')
      if (section === 'core' || section === 'root' || section === 'unknown') {
        return { error: `「${unit.title}」是${unitKindLabel(universe, unit)}，名字是固定结构，不能改名。` }
      }
      if (section === 'trace' && isSystemTitledTraceNode(universe.character, sourceId)) {
        return { error: `「${unit.title}」是系统日期节点，标题由日期自动派生，不能改名；要调整日期请编辑该单位。` }
      }
      const now = new Date().toISOString()
      return {
        confirmLines: [`操作：改名「${unit.title}」→「${newTitle}」（${unitKindLabel(universe, unit)}）`],
        apply: () => applyChangesOnFreshCharacter(
          ports,
          universe.characterId,
          (fresh) => requireBrainUnitAlive(fresh, unit)
            || (section === 'soul'
              ? updateCharacterBrainSoulTreeNode(fresh, sourceId, { title: newTitle, now })
              : updateCharacterBrainTraceTreeNode(fresh, sourceId, { title: newTitle, now })),
          `已把「${unit.title}」改名为「${newTitle}」。`
        )
      }
    },

    async planMove(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const section = sectionOf(unit)
      const sourceId = String(unit.sourceId || '')
      if (section === 'core' || section === 'root' || section === 'unknown') {
        return { error: `「${unit.title}」是${unitKindLabel(universe, unit)}，结构固定不能移动。` }
      }
      const parent = resolveUnit(universe, input.newParent)
      if ('error' in parent) return parent
      const parentSection = sectionOf(parent.unit)
      const parentIsSectionRoot = parent.unit.unitType === 'soul' || parent.unit.unitType === 'trace'
      const targetSection = parentIsSectionRoot ? (parent.unit.unitType as BrainSection) : parentSection
      if (targetSection !== section) {
        return { error: `「${unit.title}」在${section === 'soul' ? '灵魂' : '轨迹'}区，不能移动到「${parent.unit.title}」（跨区移动不支持）。` }
      }
      if (collectDescendants(universe, unit.unitId).some((item) => item.unitId === parent.unit.unitId) || parent.unit.unitId === unit.unitId) {
        return { error: `不能把「${unit.title}」移动到它自己或它的子孙里。` }
      }
      const parentSourceId = parentIsSectionRoot
        ? (section === 'trace' ? TRACE_ROOT_SOURCE_ID : '')
        : String(parent.unit.sourceId || '')
      const now = new Date().toISOString()
      return {
        confirmLines: [
          `操作：移动「${unit.title}」（${unitKindLabel(universe, unit)}）`,
          `到：${parentIsSectionRoot ? `${parent.unit.title}根` : `「${parent.unit.title}」下`}`
        ],
        apply: () => applyChangesOnFreshCharacter(
          ports,
          universe.characterId,
          (fresh) => requireBrainUnitAlive(fresh, unit)
            || (section === 'soul'
              ? moveCharacterBrainSoulTreeNode(fresh, sourceId, parentSourceId, now)
              : moveCharacterBrainTraceTreeNode(fresh, sourceId, parentSourceId, now)),
          `已移动「${unit.title}」到「${parent.unit.title}」下。`
        )
      }
    },

    async planDelete(input) {
      const universe = loadUniverse(ports, input.scope)
      if ('error' in universe) return universe
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const section = sectionOf(unit)
      const sourceId = String(unit.sourceId || '')
      if (section === 'core' || section === 'root' || section === 'unknown') {
        return { error: `「${unit.title}」是${unitKindLabel(universe, unit)}，结构固定不能删除（核心字段只能改正文）。` }
      }
      const descendants = collectDescendants(universe, unit.unitId)
      const isSystemBranch = section === 'trace' && (() => {
        const node = findTraceNode(universe.character, sourceId)
        return node?.systemRole === 'yearBranch' || node?.systemRole === 'monthBranch'
      })()
      const sampleTitles = descendants.slice(0, 5).map((item) => `「${item.title}」`).join('、')
      return {
        confirmLines: [
          `操作：删除${unitKindLabel(universe, unit)}「${unit.title}」（角色：${universe.characterName}）`,
          ...(descendants.length
            ? [`⚠️ 严重警告：它下面还有 ${descendants.length} 个子孙单位将被一并永久删除！包括：${sampleTitles}${descendants.length > 5 ? ' 等' : ''}`]
            : [`⚠️ 严重警告：该单位正文约 ${String(unit.body || '').length} 字，将被永久删除！`]),
          ...(isSystemBranch
            ? ['⚠️ 这是轨迹日历的系统结构枝（年/月枝）：删除会连带其下所有日桠与事件，破坏该时间段的轨迹记录，只能重新逐日重建。']
            : []),
          '⚠️ 误删后果：角色大脑没有本机服务副本，删除保存后将永久丢失，只能靠启动自动备份手工恢复整库。',
          '请确认这些内容真的不再需要。'
        ],
        apply: () => applyChangesOnFreshCharacter(
          ports,
          universe.characterId,
          (fresh) => requireBrainUnitAlive(fresh, unit)
            || (section === 'soul'
              ? deleteCharacterBrainSoulTreeNode(fresh, sourceId)
              : deleteCharacterBrainTraceTreeNode(fresh, sourceId)),
          `已删除「${unit.title}」${descendants.length ? `及其 ${descendants.length} 个子孙单位` : ''}。`
        )
      }
    }
  }
}
