/**
 * 星依单位工具·文档库适配器（2026-07-07 计划批次1）。
 *
 * 真值路径（不要求文档库页面在场·用户拍板）：
 *   fetchDocLibraryState（强刷）→ 单位宇宙 buildDocLibraryUnitView（与检索工具同源，unitId 一致）
 *   → applyDocLibraryTreeCommand（结构写入唯一正式入口）→ saveDocLibraryState（字段树护栏）
 *   → 广播 DOC_LIBRARY_EXTERNAL_UPDATED_EVENT（打开中的文档库页面收到后强刷三件套）。
 *
 * 防并发覆盖：写计划 apply 时**重新强刷**最新快照再套命令（确认卡片挂着期间页面可能有改动，
 * PUT /doc-library 是整包替换，必须基于最新真值套增量命令，不能拿计划时的旧快照直接保存）。
 *
 * 短码协议：复用 createTidiaoUnitIdCodec（与提调检索同一件）——模型从检索结果抄来的 u# 短码
 * 在这里同样能解析；出口展示 id 也统一走 encode。
 */

import type { BrainDocumentRecord, DocLibraryStateSnapshot } from '../types'
import type { UnitView, UnitViewAdapterResult } from '../types/unitView'
import { applyDocLibraryTreeCommand, type DocLibraryTreeCommand } from './docLibraryTreeCommands'
import { createTidiaoUnitIdCodec, type TidiaoUnitIdCodec } from './tidiaoUnitIdCodec'
import { normalizeUnitSemanticType } from './unitSemanticTypes'
import { buildDocLibraryUnitView } from './unitViewAdapters'
import { buildXingyiCompilePageDiagnostics } from './xingyiCompilePageDiagnostics'
import {
  applyCompilePageEdit,
  applyXingyiUnitBodyEdit,
  type XingyiCompilePageFields,
  type XingyiUnitCrudAdapter,
  type XingyiUnitCrudError,
  type XingyiUnitWritePlan
} from './xingyiUnitCrudTools'

/** 星依外部直写后的页面刷新事件（DocLibrary.vue 监听后强刷文档+字段树+关系三件套）。 */
export const DOC_LIBRARY_EXTERNAL_UPDATED_EVENT = 'langhuan:doc-library-external-updated'

const LIST_TREE_LINE_LIMIT = 400
const READ_BODY_LIMIT = 8000

export interface XingyiDocLibraryCrudPorts {
  fetchState: (options?: { force?: boolean }) => Promise<DocLibraryStateSnapshot>
  saveState: (payload: DocLibraryStateSnapshot) => Promise<void>
  /** 保存成功后的页面刷新广播（浮坞注入 window.dispatchEvent）。 */
  notifySaved?: () => void
}

interface DocLibraryUniverse {
  state: DocLibraryStateSnapshot
  /** 完整视图结果（含 warnings·编译页体检要用）；units 是它的别名切片。 */
  view: UnitViewAdapterResult
  units: UnitView[]
  codec: TidiaoUnitIdCodec
}

function clip(text: string, limit = 80): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function isFolderUnit(unit: UnitView): boolean {
  return unit.contentKind === 'group' && unit.unitType !== 'root'
}

function isDocumentUnit(unit: UnitView): boolean {
  return unit.contentKind !== 'group'
}

/** 文件夹单位的路径真值：字段树视图 sourceId=nodeId、sourcePath=路径；旧路径视图两者都是路径——统一 sourcePath 优先。 */
function folderPathOf(unit: UnitView): string {
  const sourcePath = String(unit.sourcePath || '').trim()
  if (sourcePath.startsWith('/')) return sourcePath
  const sourceId = String(unit.sourceId || '').trim()
  return sourceId.startsWith('/') ? sourceId : sourcePath || sourceId
}

function unitKindLabel(unit: UnitView): string {
  if (unit.unitType === 'root') return '世界树根'
  if (unit.unitType === 'cluster') return '树簇'
  if (isFolderUnit(unit)) return '枝'
  return '文档'
}

function normalizeFolderPathInput(raw: string): string {
  const value = String(raw || '').trim().replace(/\\/g, '/')
  if (!value) return ''
  const collapsed = `/${value}`.replace(/\/{2,}/g, '/').replace(/\/+$/g, '')
  return collapsed || '/'
}

function sanitizeFileTitle(title: string): string {
  return String(title || '').replace(/[\\/]+/g, '-').trim() || '未命名'
}

function createDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createOverviewDocument(folderPath: string, title: string, body?: string): BrainDocumentRecord {
  const now = new Date().toISOString()
  const documentId = createDocumentId()
  const content = typeof body === 'string' && body.trim()
    ? body
    : `# ${title}\n\n本枝用于整理与「${title}」相关的资料。`
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title,
    displayPath: `${folderPath}/index.md`,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    semanticType: 'other',
    summary: '',
    tags: [],
    content,
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: now,
    updatedAt: now
  }
}

function collectMissingFolderPaths(universe: DocLibraryUniverse, targetPath: string): string[] {
  const existing = new Set(universe.units.filter(isFolderUnit).map(folderPathOf))
  const segments = normalizeFolderPathInput(targetPath).split('/').filter(Boolean)
  const missing: string[] = []
  let current = ''
  segments.forEach((segment) => {
    current = `${current}/${segment}`
    if (!existing.has(current)) missing.push(current)
  })
  return missing
}

function buildOverviewCommands(folderPath: string, body?: string): DocLibraryTreeCommand[] {
  const segments = folderPath.split('/').filter(Boolean)
  const title = segments[segments.length - 1] || '未命名'
  const overview = createOverviewDocument(folderPath, title, body)
  return [
    { type: 'upsert_document', document: overview, parentFolderId: folderPath },
    { type: 'set_folder_overview', folderPath, overviewDocumentId: overview.documentId }
  ]
}

async function loadUniverse(ports: XingyiDocLibraryCrudPorts): Promise<DocLibraryUniverse> {
  const state = await ports.fetchState({ force: true })
  const view = buildDocLibraryUnitView(state.documents, state.manualTreeOrders, {
    treeNodes: state.treeNodes,
    treeOrders: state.treeOrders,
    treeDiffReport: state.treeDiffReport
  })
  const units = view.units
  const codec = createTidiaoUnitIdCodec(() => units.map((unit) => unit.unitId))
  return { state, view, units, codec }
}

/** 单位解析：u#短码解码 → 精确 unitId → 精确 sourceId（documentId/文件夹路径）→ 精确标题 → 唯一子串。 */
function resolveUnit(universe: DocLibraryUniverse, raw: string): { unit: UnitView } | XingyiUnitCrudError {
  const input = String(raw || '').trim()
  if (!input) return { error: '缺少目标单位。' }
  const decoded = universe.codec.decode(input)
  const operable = universe.units.filter((unit) => unit.unitType !== 'root')
  const byId = operable.find((unit) => unit.unitId === decoded || unit.unitId === input)
  if (byId) return { unit: byId }
  const bySource = operable.find((unit) => [String(unit.sourceId || ''), String(unit.sourcePath || '')]
    .some((key) => key && (key === decoded || key === input)))
  if (bySource) return { unit: bySource }
  const describe = (list: UnitView[]) => list.slice(0, 8)
    .map((unit) => `${unit.title}（${unitKindLabel(unit)}·${universe.codec.encode(unit.unitId)}）`)
    .join('、')
  const exact = operable.filter((unit) => unit.title === input)
  if (exact.length === 1) return { unit: exact[0] }
  if (exact.length > 1) return { error: `「${input}」有 ${exact.length} 个同名单位，请改用 unitId 指定：${describe(exact)}` }
  const partial = operable.filter((unit) => unit.title.includes(input))
  if (partial.length === 1) return { unit: partial[0] }
  if (partial.length > 1) return { error: `「${input}」匹配到多个单位，请用完整标题或 unitId：${describe(partial)}` }
  return { error: `没有找到名为「${input}」的单位。可先用 listUnitTree 或 searchWorldText 查到准确标题或 unitId 再试。` }
}

/** 父级解析：已有枝单位 → 其路径；未命中但形如 /a/b 的输入 → 视为新路径（保存时自动逐级建枝）。 */
function resolveParentFolderPath(
  universe: DocLibraryUniverse,
  raw: string
): { folderPath: string; autoCreate: boolean } | XingyiUnitCrudError {
  const input = String(raw || '').trim()
  if (!input) return { error: '缺少父级（枝/树簇）。' }
  const resolved = resolveUnit(universe, input)
  if (!('error' in resolved)) {
    if (!isFolderUnit(resolved.unit)) {
      return { error: `「${resolved.unit.title}」是文档不是枝，不能作为父级；请换一个枝/树簇，或给一个 /路径 让星依自动建枝。` }
    }
    return { folderPath: folderPathOf(resolved.unit), autoCreate: false }
  }
  if (input.startsWith('/')) {
    const folderPath = normalizeFolderPathInput(input)
    if (folderPath && folderPath !== '/') return { folderPath, autoCreate: true }
  }
  return { error: `父级「${input}」不存在。请先 listUnitTree 查证，或直接给完整 /路径（不存在会自动逐级建枝）。` }
}

function collectDescendants(universe: DocLibraryUniverse, rootUnitId: string): UnitView[] {
  const childrenByParent = new Map<string, UnitView[]>()
  universe.units.forEach((unit) => {
    if (!unit.parentId) return
    const list = childrenByParent.get(unit.parentId) || []
    list.push(unit)
    childrenByParent.set(unit.parentId, list)
  })
  const result: UnitView[] = []
  const queue = [...(childrenByParent.get(rootUnitId) || [])]
  while (queue.length) {
    const unit = queue.shift() as UnitView
    result.push(unit)
    queue.push(...(childrenByParent.get(unit.unitId) || []))
  }
  return result
}

function commandStateOf(state: DocLibraryStateSnapshot) {
  return {
    documents: state.documents,
    manualTreeOrders: state.manualTreeOrders,
    treeNodes: state.treeNodes,
    treeOrders: state.treeOrders,
    treeDiffReport: state.treeDiffReport,
    relationSystemState: state.relationSystemState
  }
}

/** 写落库统一收口：apply 时重新强刷最新快照 → 套命令 → 护栏审计 → 保存 → 广播页面刷新。 */
async function applyCommandOnFreshState(
  ports: XingyiDocLibraryCrudPorts,
  buildCommand: (fresh: DocLibraryUniverse) => DocLibraryTreeCommand | XingyiUnitCrudError,
  successMessage: string
): Promise<{ ok: boolean; message: string }> {
  const fresh = await loadUniverse(ports)
  const command = buildCommand(fresh)
  if ('error' in command) return { ok: false, message: command.error }
  const result = applyDocLibraryTreeCommand(commandStateOf(fresh.state), command)
  if (!result.commandAudit.ok) {
    return { ok: false, message: `文档库命令被字段树护栏拒绝，没有保存：${result.commandAudit.message}` }
  }
  await ports.saveState(result)
  ports.notifySaved?.()
  return { ok: true, message: successMessage }
}

/** 多条字段树命令同一次强刷、同一次保存；用于“建枝 + index.md 概览”原子落库。 */
async function applyCommandsOnFreshState(
  ports: XingyiDocLibraryCrudPorts,
  buildCommands: (fresh: DocLibraryUniverse) => DocLibraryTreeCommand[] | XingyiUnitCrudError,
  successMessage: string
): Promise<{ ok: boolean; message: string }> {
  const fresh = await loadUniverse(ports)
  const commands = buildCommands(fresh)
  if (!Array.isArray(commands)) return { ok: false, message: commands.error }
  let state: DocLibraryStateSnapshot = fresh.state
  for (const command of commands) {
    const result = applyDocLibraryTreeCommand(commandStateOf(state), command)
    if (!result.commandAudit.ok) {
      return { ok: false, message: `文档库命令被字段树护栏拒绝，没有保存：${result.commandAudit.message}` }
    }
    state = result
  }
  await ports.saveState(state)
  ports.notifySaved?.()
  return { ok: true, message: successMessage }
}

/** apply 时目标单位的在场校验（确认卡片挂着期间单位可能已被删改；命令层对缺失 id 会静默 no-op，必须显式拦）。 */
function requireUnitAlive(fresh: DocLibraryUniverse, unit: UnitView): XingyiUnitCrudError | null {
  const stillThere = fresh.units.some((item) => item.unitId === unit.unitId
    || (isDocumentUnit(unit) && String(item.sourceId || '') === String(unit.sourceId || '')))
  return stillThere ? null : { error: `目标单位「${unit.title}」已不存在（可能刚被改动），本次没有保存，请重新查证后再试。` }
}

export function createXingyiDocLibraryCrudAdapter(ports: XingyiDocLibraryCrudPorts): XingyiUnitCrudAdapter {
  return {
    label: '全局文档库（不依赖当前会话或世界挂载）',

    async listTree(input) {
      const universe = await loadUniverse(ports)
      let roots: UnitView[]
      if (input.parent) {
        const resolved = resolveUnit(universe, input.parent)
        if ('error' in resolved) return resolved
        roots = [resolved.unit]
      } else {
        roots = universe.units.filter((unit) => unit.unitType === 'root')
      }
      const childrenByParent = new Map<string, UnitView[]>()
      universe.units.forEach((unit) => {
        if (!unit.parentId) return
        const list = childrenByParent.get(unit.parentId) || []
        list.push(unit)
        childrenByParent.set(unit.parentId, list)
      })
      childrenByParent.forEach((list) => list.sort((a, b) => (a.orderIndex ?? 1e9) - (b.orderIndex ?? 1e9)))
      const lines: string[] = []
      let truncated = false
      const walk = (unit: UnitView, depth: number) => {
        if (lines.length >= LIST_TREE_LINE_LIMIT) {
          truncated = true
          return
        }
        lines.push(`${'  '.repeat(depth)}- ${unit.title}（${unitKindLabel(unit)}·${universe.codec.encode(unit.unitId)}）`)
        ;(childrenByParent.get(unit.unitId) || []).forEach((child) => walk(child, depth + 1))
      }
      roots.forEach((unit) => walk(unit, 0))
      if (!lines.length) return { text: '（这里还没有任何单位）' }
      return {
        text: [
          ...lines,
          ...(truncated ? [`（已截断到前 ${LIST_TREE_LINE_LIMIT} 行，可用 parent 参数只列某个枝的子树）`] : [])
        ].join('\n')
      }
    },

    async readUnit(input) {
      const universe = await loadUniverse(ports)
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      if (isFolderUnit(unit)) {
        const children = universe.units
          .filter((item) => item.parentId === unit.unitId)
          .sort((a, b) => (a.orderIndex ?? 1e9) - (b.orderIndex ?? 1e9))
        return {
          text: [
            `【${unit.title}】${unitKindLabel(unit)}（${universe.codec.encode(unit.unitId)}）`,
            `路径：${unit.sourcePath || unit.sourceId || '（未知）'}`,
            '——概览正文如下——',
            String(unit.body || '').trim() || '（缺少 index.md 概览正文）',
            '',
            `直属子单位（${children.length} 个）：`,
            ...children.map((child) => `- ${child.title}（${unitKindLabel(child)}·${universe.codec.encode(child.unitId)}）`)
          ].join('\n')
        }
      }
      const record = universe.state.documents.find((item) => String(item.documentId || item.id || '') === String(unit.sourceId || ''))
      const body = String(record?.content ?? unit.body ?? '')
      const shownBody = body.length > READ_BODY_LIMIT ? `${body.slice(0, READ_BODY_LIMIT)}\n…（正文共 ${body.length} 字，已截断）` : body
      return {
        text: [
          `【${unit.title}】文档（${universe.codec.encode(unit.unitId)}）`,
          `路径：${record?.displayPath || unit.sourcePath || '（未知）'}`,
          ...(unit.compilePage?.summary ? [`编译页摘要：${clip(unit.compilePage.summary, 200)}`] : []),
          '——正文如下——',
          shownBody || '（正文为空）'
        ].join('\n')
      }
    },

    async diagnoseCompilePages(input) {
      const universe = await loadUniverse(ports)
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
        label: '世界书文档库',
        scopeLabel,
        scopeUnitIds,
        ...(input.maxUnits ? { maxUnits: input.maxUnits } : {}),
        describeUnit: (unit) => {
          const path = String(unit.sourcePath || unit.metadata?.legacyDisplayPath || '').trim()
          return `${unit.title}（${unitKindLabel(unit)}·${universe.codec.encode(unit.unitId)}）${path ? `｜${path}` : ''}`
        }
      })
      return { text: report.text }
    },

    async planCreate(input) {
      const universe = await loadUniverse(ports)
      const kindRaw = String(input.kind || '').trim().toLowerCase()
      const isDocumentKind = ['document', 'doc', 'page', '文档', '桠'].includes(kindRaw)
      const isFolderKind = ['folder', 'branch', 'cluster', 'group', '枝', '树簇', '分组', '文件夹'].includes(kindRaw)
      if (!isDocumentKind && !isFolderKind) {
        return { error: `文档库的 kind 只支持 document（桠/文档）或 folder（枝/分组），收到「${input.kind}」。` }
      }
      const title = String(input.title || '').trim()

      if (isFolderKind) {
        const parentResult = input.parent
          ? resolveParentFolderPath(universe, input.parent)
          : { folderPath: '', autoCreate: false }
        if ('error' in parentResult) return parentResult
        const folderPath = normalizeFolderPathInput(`${parentResult.folderPath}/${sanitizeFileTitle(title)}`)
        if (universe.units.some((unit) => isFolderUnit(unit) && folderPathOf(unit) === folderPath)) {
          return { error: `枝「${folderPath}」已存在，不需要重复创建。` }
        }
        return {
          confirmLines: [
            `操作：新建${parentResult.folderPath ? '枝' : '根级树簇'}「${title}」`,
            `位置：${folderPath}`,
            `概览：同步创建 ${folderPath}/index.md（${typeof input.body === 'string' && input.body.trim() ? '使用本次概览正文' : '使用结构性默认概览'}）`,
            ...(parentResult.autoCreate ? ['提示：父级路径不存在，将自动逐级建枝。'] : [])
          ],
          apply: () => applyCommandsOnFreshState(
            ports,
            (fresh) => {
              if (fresh.units.some((unit) => isFolderUnit(unit) && folderPathOf(unit) === folderPath)) {
                return { error: `枝「${folderPath}」已存在，本次没有重复创建。` }
              }
              return collectMissingFolderPaths(fresh, folderPath)
                .flatMap((path) => buildOverviewCommands(path, path === folderPath ? input.body : undefined))
            },
            `已新建枝「${title}」（路径：${folderPath}），并同步创建可点击阅读的 index.md 概览正文。请继续按正文事实补齐或复核编译页。`
          )
        }
      }

      if (!input.parent) {
        return { error: '新建文档必须给 parent（放到哪个枝/树簇下）。先用 listUnitTree 看结构，或直接给 /路径（不存在会自动建枝）。' }
      }
      const parentResult = resolveParentFolderPath(universe, input.parent)
      if ('error' in parentResult) return parentResult
      const body = typeof input.body === 'string' ? input.body : `# ${title}\n\n`
      const now = new Date().toISOString()
      const documentId = createDocumentId()
      // versionState 用 confirmed：经确认卡片放行的正式内容（UI 新建空草稿才用 pending）
      const document: BrainDocumentRecord = {
        documentId,
        id: documentId,
        stableId: documentId,
        title,
        displayPath: `${parentResult.folderPath}/${sanitizeFileTitle(title)}.md`,
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        semanticType: 'other',
        summary: '',
        tags: [],
        content: body,
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: now,
        updatedAt: now
      }
      return {
        confirmLines: [
          `操作：新建文档「${title}」`,
          `位置：${parentResult.folderPath}`,
          `正文：${body.length} 字（开头：「${clip(body)}」）`,
          ...(parentResult.autoCreate ? ['提示：父级路径不存在，将自动逐级建枝。'] : [])
        ],
        apply: () => applyCommandsOnFreshState(
          ports,
          (fresh) => [
            ...collectMissingFolderPaths(fresh, parentResult.folderPath).flatMap((path) => buildOverviewCommands(path)),
            { type: 'upsert_document', document, parentFolderId: parentResult.folderPath }
          ],
          `已在「${parentResult.folderPath}」下新建文档「${title}」（unitId 可用 listUnitTree 查看）；自动新建的枝均带 index.md 概览。请继续按正文事实补齐或复核编译页。`
        )
      }
    },

    async planEditBody(input) {
      const universe = await loadUniverse(ports)
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      // 字段树视图下枝的概览文档（index）被折进枝单位——改枝正文=改它的概览文档。
      // 历史空枝允许用整段正文补建 index.md；锚点替换没有旧正文可定位，仍须拒绝。
      const overviewDocumentId = isFolderUnit(unit) ? String(unit.metadata?.overviewDocumentId || '').trim() : ''
      if (!isDocumentUnit(unit) && !overviewDocumentId) {
        if (input.replaceInBody) {
          return { error: `「${unit.title}」是历史空枝且没有概览正文，无法做锚点替换；请改用 body 提供完整概览，星依会同步补建 index.md。` }
        }
        if (typeof input.body !== 'string') {
          return { error: `「${unit.title}」是历史空枝且没有概览正文；请用 body 提供完整概览，星依会同步补建 index.md。` }
        }
        const currentFolderPath = folderPathOf(unit)
        return {
          confirmLines: [
            `操作：为历史空枝「${unit.title}」补建概览正文`,
            `位置：${currentFolderPath}/index.md`,
            `正文：${input.body.length} 字（开头：「${clip(input.body)}」）`
          ],
          apply: () => applyCommandsOnFreshState(
            ports,
            (fresh) => {
              const freshResolved = resolveUnit(fresh, currentFolderPath)
              if ('error' in freshResolved || !isFolderUnit(freshResolved.unit)) {
                return { error: `枝「${unit.title}」已不存在或类型已变化，本次没有保存。` }
              }
              const freshOverviewId = String(freshResolved.unit.metadata?.overviewDocumentId || '').trim()
              if (freshOverviewId) {
                return { error: `枝「${unit.title}」在确认期间已经有了概览正文；请重新读取后再编辑，避免覆盖新内容。` }
              }
              return buildOverviewCommands(folderPathOf(freshResolved.unit), input.body)
            },
            `已为历史空枝「${unit.title}」补建 index.md 概览正文。请继续按正文事实补齐或复核编译页，并对受影响子树复诊。`
          )
        }
      }
      const targetDocumentId = isDocumentUnit(unit) ? String(unit.sourceId || '') : overviewDocumentId
      const record = universe.state.documents.find((item) => String(item.documentId || item.id || '') === targetDocumentId)
      if (!record) return { error: `读取不到「${unit.title}」的正文记录。` }
      const edit = {
        ...(input.replaceInBody ? { replaceInBody: input.replaceInBody } : {}),
        ...(typeof input.body === 'string' ? { body: input.body } : {})
      }
      const previewed = applyXingyiUnitBodyEdit(String(record.content || ''), edit)
      if ('error' in previewed) return previewed
      return {
        confirmLines: [
          `单位：${isDocumentUnit(unit) ? '文档' : '枝概览文档'}「${unit.title}」（${record.displayPath}）`,
          ...previewed.changedLines
        ],
        apply: () => applyCommandOnFreshState(
          ports,
          (fresh) => {
            const freshRecord = fresh.state.documents.find((item) => String(item.documentId || item.id || '') === targetDocumentId)
            if (!freshRecord) return { error: `文档「${unit.title}」已不存在（可能刚被删除），本次没有保存。` }
            // 基于最新正文重算编辑（锚点替换在最新真值上重新定位，防确认期间正文被改后错替）
            const applied = applyXingyiUnitBodyEdit(String(freshRecord.content || ''), edit)
            if ('error' in applied) return { error: `正文在确认期间发生了变化：${applied.error}` }
            const parentPath = String(freshRecord.displayPath || '').split('/').slice(0, -1).join('/') || '/'
            return {
              type: 'upsert_document',
              document: { ...freshRecord, content: applied.next, updatedAt: new Date().toISOString() },
              parentFolderId: parentPath
            }
          },
          `已更新文档「${unit.title}」的正文。请判断本次语义变化是否需要同步编译页，并对受影响子树复诊。`
        )
      }
    },

    async planEditCompilePage(input) {
      const universe = await loadUniverse(ports)
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      // 目标文档规则与 planEditBody 一致：文档单位=自身；枝=其概览文档
      const overviewDocumentId = isFolderUnit(unit) ? String(unit.metadata?.overviewDocumentId || '').trim() : ''
      if (!isDocumentUnit(unit) && !overviewDocumentId) {
        return { error: `「${unit.title}」是枝且没有概览文档，没有编译页可改；要精确修改请指定具体文档单位。` }
      }
      const targetDocumentId = isDocumentUnit(unit) ? String(unit.sourceId || '') : overviewDocumentId
      // 当前值口径与视图层 readDocumentCompilePage 同源：编译页字段缺失时用文档顶层摘要/标签兜底
      const readCurrent = (state: DocLibraryStateSnapshot): { current: XingyiCompilePageFields; record: BrainDocumentRecord } | XingyiUnitCrudError => {
        const record = state.documents.find((item) => String(item.documentId || item.id || '') === targetDocumentId)
        if (!record) return { error: `读取不到「${unit.title}」的文档记录。` }
        const page = record.publicCompilePage
        return {
          record,
          current: {
            summary: String(page?.summary ?? record.summary ?? '').trim(),
            tags: [...((page?.tags?.length ? page.tags : record.tags) || [])],
            semanticType: normalizeUnitSemanticType(record.semanticType),
            relationHints: [...(page?.relationHints || [])]
          }
        }
      }
      const currentResult = readCurrent(universe.state)
      if ('error' in currentResult) return currentResult
      const applied = applyCompilePageEdit(currentResult.current, input.edit)
      if ('error' in applied) return applied
      return {
        confirmLines: [
          `单位：${isDocumentUnit(unit) ? '文档' : '枝概览文档'}「${unit.title}」（${currentResult.record.displayPath}）`,
          ...applied.changedLines
        ],
        apply: () => applyCommandOnFreshState(
          ports,
          (fresh) => {
            const freshResult = readCurrent(fresh.state)
            if ('error' in freshResult) return { error: `文档「${unit.title}」已不存在（可能刚被删除），本次没有保存。` }
            // 基于最新真值重算编辑（定点替换在最新摘要上重新定位，防确认期间编译页被改后错替）
            const reApplied = applyCompilePageEdit(freshResult.current, input.edit)
            if ('error' in reApplied) return { error: `编译页在确认期间发生了变化：${reApplied.error}` }
            const now = new Date().toISOString()
            const freshRecord = freshResult.record
            const parentPath = String(freshRecord.displayPath || '').split('/').slice(0, -1).join('/') || '/'
            return {
              type: 'upsert_document',
              document: {
                ...freshRecord,
                semanticType: normalizeUnitSemanticType(reApplied.next.semanticType),
                // 保留召回分数等既有字段（spread），只覆盖本次编辑面；星依改动经确认卡片=manual_confirmed
                publicCompilePage: {
                  ...(freshRecord.publicCompilePage || {}),
                  summary: reApplied.next.summary,
                  tags: [...reApplied.next.tags],
                  relationHints: [...reApplied.next.relationHints],
                  sourceState: 'manual_confirmed',
                  updatedAt: now
                },
                updatedAt: now
              },
              parentFolderId: parentPath
            }
          },
          `已更新「${unit.title}」的编译页。`
        )
      }
    },

    async planRename(input) {
      const universe = await loadUniverse(ports)
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const newTitle = String(input.newTitle || '').trim()
      if (isFolderUnit(unit)) {
        const sourcePath = folderPathOf(unit)
        const parentPath = sourcePath.split('/').slice(0, -1).join('/')
        const targetPath = normalizeFolderPathInput(`${parentPath}/${sanitizeFileTitle(newTitle)}`)
        if (targetPath === sourcePath) return { error: '新标题与当前相同，不需要改名。' }
        if (universe.units.some((item) => isFolderUnit(item) && folderPathOf(item) === targetPath)) {
          return { error: `同层已存在枝「${targetPath}」，请换个名字。` }
        }
        return {
          confirmLines: [`操作：枝改名「${unit.title}」→「${newTitle}」`, `路径：${sourcePath} → ${targetPath}`],
          apply: () => applyCommandOnFreshState(
            ports,
            (fresh) => requireUnitAlive(fresh, unit) || { type: 'rename_folder', sourcePath, targetPath },
            `已把枝「${unit.title}」改名为「${newTitle}」。请检查编译页摘要、标签及其它单位关系提示中的旧名称，并复诊受影响子树。`
          )
        }
      }
      return {
        confirmLines: [`操作：文档改名「${unit.title}」→「${newTitle}」`],
        apply: () => applyCommandOnFreshState(
          ports,
          (fresh) => requireUnitAlive(fresh, unit)
            || { type: 'rename_document', documentId: String(unit.sourceId || ''), title: newTitle },
          `已把文档「${unit.title}」改名为「${newTitle}」。请检查编译页摘要、标签及其它单位关系提示中的旧名称，并复诊受影响子树。`
        )
      }
    },

    async planMove(input) {
      const universe = await loadUniverse(ports)
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      const rawParent = String(input.newParent || '').trim()
      const moveFolderToRoot = isFolderUnit(unit) && ['/', '根', 'root', '__root__'].includes(rawParent)
      let folderPath = ''
      let autoCreate = false
      if (!moveFolderToRoot) {
        const parentResult = resolveParentFolderPath(universe, rawParent)
        if ('error' in parentResult) {
          return isFolderUnit(unit)
            ? parentResult
            : { error: `${parentResult.error}（文档只能移进枝/树簇，不能放到根级）` }
        }
        folderPath = parentResult.folderPath
        autoCreate = parentResult.autoCreate
      }
      if (isFolderUnit(unit)) {
        const sourcePath = folderPathOf(unit)
        if (folderPath === sourcePath || folderPath.startsWith(`${sourcePath}/`)) {
          return { error: `不能把枝「${unit.title}」移动到它自己或它的子孙里。` }
        }
        return {
          confirmLines: [
            `操作：移动枝「${unit.title}」`,
            `从：${sourcePath}`,
            `到：${moveFolderToRoot ? '根级（成为树簇）' : folderPath}`,
            ...(autoCreate ? ['提示：目标路径不存在，将自动逐级建枝。'] : [])
          ],
          apply: () => applyCommandsOnFreshState(
            ports,
            (fresh) => {
              const missing = requireUnitAlive(fresh, unit)
              if (missing) return missing
              return [
                ...(moveFolderToRoot ? [] : collectMissingFolderPaths(fresh, folderPath).flatMap((path) => buildOverviewCommands(path))),
                { type: 'move_folder', sourcePath, parentFolderId: moveFolderToRoot ? '__root__' : folderPath }
              ]
            },
            `已移动枝「${unit.title}」到「${moveFolderToRoot ? '根级' : folderPath}」。自动新建的目标枝均带 index.md 概览；请判断归属变化是否需要同步编译页并复诊。`
          )
        }
      }
      return {
        confirmLines: [
          `操作：移动文档「${unit.title}」`,
          `到：${folderPath}`,
          ...(autoCreate ? ['提示：目标路径不存在，将自动逐级建枝。'] : [])
        ],
        apply: () => applyCommandsOnFreshState(
          ports,
          (fresh) => {
            const missing = requireUnitAlive(fresh, unit)
            if (missing) return missing
            return [
              ...collectMissingFolderPaths(fresh, folderPath).flatMap((path) => buildOverviewCommands(path)),
              { type: 'move_documents', documentIds: [String(unit.sourceId || '')], parentFolderId: folderPath }
            ]
          },
          `已移动文档「${unit.title}」到「${folderPath}」。自动新建的目标枝均带 index.md 概览；请判断归属变化是否需要同步编译页并复诊。`
        )
      }
    },

    async planDelete(input) {
      const universe = await loadUniverse(ports)
      const resolved = resolveUnit(universe, input.unit)
      if ('error' in resolved) return resolved
      const unit = resolved.unit
      if (isFolderUnit(unit)) {
        const descendants = collectDescendants(universe, unit.unitId)
        const docCount = descendants.filter(isDocumentUnit).length
        const folderCount = descendants.filter(isFolderUnit).length
        const sampleTitles = descendants.filter(isDocumentUnit).slice(0, 5).map((item) => `「${item.title}」`).join('、')
        const sourcePath = folderPathOf(unit)
        return {
          confirmLines: [
            `操作：删除枝「${unit.title}」（${sourcePath}）`,
            `⚠️ 严重警告：该枝下共有 ${folderCount} 个子枝、${docCount} 份文档，将被一并永久删除！`,
            ...(sampleTitles ? [`⚠️ 将被删除的文档包括：${sampleTitles}${docCount > 5 ? ` 等 ${docCount} 份` : ''}`] : []),
            '⚠️ 误删后果：文档库没有本机服务副本，删除保存后这些内容将永久丢失，只能靠启动自动备份手工恢复整库。',
            '请确认这些内容真的不再需要。'
          ],
          apply: () => applyCommandOnFreshState(
            ports,
            (fresh) => requireUnitAlive(fresh, unit) || { type: 'delete_folder', folderPath: sourcePath },
            `已删除枝「${unit.title}」及其全部子内容（${folderCount} 个子枝、${docCount} 份文档）。请清理其它单位指向这些目标的失效关系提示，并复诊原父级子树。`
          )
        }
      }
      const record = universe.state.documents.find((item) => String(item.documentId || item.id || '') === String(unit.sourceId || ''))
      return {
        confirmLines: [
          `操作：删除文档「${unit.title}」（${record?.displayPath || '路径未知'}）`,
          `⚠️ 严重警告：该文档正文约 ${String(record?.content || '').length} 字，将被永久删除，无法恢复！`,
          '⚠️ 误删后果：文档库没有本机服务副本，删除保存后只能靠启动自动备份手工恢复整库。',
          '请确认这份内容真的不再需要。'
        ],
        apply: () => applyCommandOnFreshState(
          ports,
          (fresh) => requireUnitAlive(fresh, unit)
            || { type: 'delete_documents', documentIds: [String(unit.sourceId || '')] },
          `已删除文档「${unit.title}」。请清理其它单位指向它的失效关系提示，并复诊原父级子树。`
        )
      }
    }
  }
}
