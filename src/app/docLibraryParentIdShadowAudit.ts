import type { BrainDocumentRecord } from '../types/docBrain'

export type DocLibraryManualTreeOrders = Record<string, string[]>

export type DocLibraryShadowNodeKind = 'root' | 'folder' | 'document'

export type DocLibraryShadowAuditIssueCode =
  | 'empty_display_path'
  | 'duplicate_display_path'
  | 'path_roundtrip_mismatch'
  | 'manual_order_bucket_parent_missing'
  | 'manual_order_entry_orphan'
  | 'manual_order_entry_wrong_parent'
  | 'manual_order_entry_duplicate'

export type DocLibraryDuplicateDisplayPathCategory = 'user_content_duplicate'

export interface DocLibraryParentIdShadowNode {
  unitId: string
  kind: DocLibraryShadowNodeKind
  title: string
  parentId?: string
  displayPath: string
  sourceDocumentId?: string
  proposedNodeId?: string
  legacyDisplayPath?: string
  orderIndex?: number
}

export interface DocLibraryDuplicateDisplayPathGroup {
  displayPath: string
  documentIds: string[]
  category: DocLibraryDuplicateDisplayPathCategory
  suggestedAction: string
  explanation: string
  consequence: string
  fixTiming: 'before_batch_2' | 'before_dual_write'
  blocksFormalMigration: boolean
}

export interface DocLibraryShadowAuditIssue {
  code: DocLibraryShadowAuditIssueCode
  severity: 'blocker' | 'warning' | 'info'
  message: string
  unitId?: string
  documentId?: string
  displayPath?: string
  parentId?: string
  entryId?: string
  details?: Record<string, unknown>
}

export interface DocLibraryParentIdShadowAuditReport {
  generatedAt: string
  summary: {
    documentCount: number
    folderCount: number
    shadowNodeCount: number
    stableDocIdChanged: number
    roundtripMismatchCount: number
    manualOrderBucketCount: number
    manualOrderEntryCount: number
    manualOrderOrphanCount: number
    manualOrderWrongParentCount: number
    blockerCount: number
    warningCount: number
    infoCount: number
    duplicateDisplayPathGroupCount: number
    canRoundtripLosslessly: boolean
    suitableForFormalMigration: boolean
  }
  nodes: DocLibraryParentIdShadowNode[]
  issues: DocLibraryShadowAuditIssue[]
  duplicateDisplayPathGroups: DocLibraryDuplicateDisplayPathGroup[]
  rollbackAssessment: {
    conclusion: string
    blockers: string[]
    warnings: string[]
    preservedInShadow: string[]
    notChangedByAudit: string[]
  }
}

interface ManualOrderIndex {
  orderIndexByEntry: Map<string, number>
  issues: DocLibraryShadowAuditIssue[]
  bucketCount: number
  entryCount: number
}

const ROOT_UNIT_ID = 'doc-tree:root'
const ROOT_BUCKET_ID = '__root__'

export function buildDocLibraryParentIdShadowAudit(
  documents: BrainDocumentRecord[],
  manualTreeOrders: DocLibraryManualTreeOrders = {},
  options: { generatedAt?: string } = {}
): DocLibraryParentIdShadowAuditReport {
  const generatedAt = options.generatedAt || new Date().toISOString()
  const normalizedDocuments = Array.isArray(documents) ? documents : []
  const issues: DocLibraryShadowAuditIssue[] = []
  const folderPaths = new Set<string>()
  const documentsByPath = new Map<string, BrainDocumentRecord[]>()

  normalizedDocuments.forEach((document) => {
    const documentId = getDocumentId(document)
    const normalizedPath = normalizeDisplayPath(document.displayPath)
    if (!normalizedPath) {
      issues.push({
        code: 'empty_display_path',
        severity: 'blocker',
        message: '文档缺少 displayPath，无法从路径树推导稳定父级。',
        unitId: buildDocumentUnitId(documentId),
        documentId
      })
      return
    }
    documentsByPath.set(normalizedPath, [...(documentsByPath.get(normalizedPath) || []), document])

    const segments = splitDisplayPath(normalizedPath)
    for (let index = 0; index < segments.length - 1; index += 1) {
      folderPaths.add(`/${segments.slice(0, index + 1).join('/')}`)
    }
  })
  const duplicateDisplayPathGroups = buildDuplicateDisplayPathGroups(documentsByPath)
  duplicateDisplayPathGroups.forEach((group) => {
    group.documentIds.slice(1).forEach((documentId) => {
      issues.push({
        code: 'duplicate_display_path',
        severity: 'blocker',
        message: '多个文档使用同一个 displayPath，字段树无法无损还原路径树。',
        unitId: buildDocumentUnitId(documentId),
        documentId,
        displayPath: group.displayPath,
        details: {
          category: group.category,
          groupDocumentIds: group.documentIds,
          suggestedAction: group.suggestedAction,
          consequence: group.consequence,
          fixTiming: group.fixTiming
        }
      })
    })
  })

  const folderParentByUnitId = new Map<string, string>()
  const documentParentByUnitId = new Map<string, string>()
  const knownEntryParents = new Map<string, string>()
  const knownFolderEntries = new Set<string>()
  const knownDocumentEntries = new Set<string>()

  folderPaths.forEach((folderPath) => {
    const segments = splitDisplayPath(folderPath)
    const parentPath = segments.length <= 1 ? '' : `/${segments.slice(0, -1).join('/')}`
    const unitId = buildFolderUnitId(folderPath)
    const parentId = parentPath ? buildFolderUnitId(parentPath) : ROOT_UNIT_ID
    folderParentByUnitId.set(unitId, parentId)
    const orderParentId = parentPath || ROOT_BUCKET_ID
    const entryId = buildFolderOrderEntryId(folderPath)
    knownFolderEntries.add(entryId)
    knownEntryParents.set(entryId, orderParentId)
  })

  normalizedDocuments.forEach((document) => {
    const documentId = getDocumentId(document)
    const normalizedPath = normalizeDisplayPath(document.displayPath)
    const segments = splitDisplayPath(normalizedPath)
    const parentPath = segments.length <= 1 ? '' : `/${segments.slice(0, -1).join('/')}`
    const unitId = buildDocumentUnitId(documentId)
    const parentId = parentPath ? buildFolderUnitId(parentPath) : ROOT_UNIT_ID
    documentParentByUnitId.set(unitId, parentId)
    const orderParentId = parentPath || ROOT_BUCKET_ID
    const entryId = buildDocumentOrderEntryId(documentId)
    knownDocumentEntries.add(entryId)
    knownEntryParents.set(entryId, orderParentId)
  })

  const manualOrderIndex = buildManualOrderIndex(
    manualTreeOrders,
    new Set([...knownFolderEntries, ...knownDocumentEntries]),
    knownEntryParents,
    new Set([ROOT_BUCKET_ID, ...Array.from(folderPaths)])
  )
  issues.push(...manualOrderIndex.issues)

  const nodes: DocLibraryParentIdShadowNode[] = [
    {
      unitId: ROOT_UNIT_ID,
      kind: 'root',
      title: '世界树',
      displayPath: ''
    },
    ...Array.from(folderPaths)
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((folderPath) => {
        const segments = splitDisplayPath(folderPath)
        const parentPath = segments.length <= 1 ? '' : `/${segments.slice(0, -1).join('/')}`
        const orderParentId = parentPath || ROOT_BUCKET_ID
        const entryId = buildFolderOrderEntryId(folderPath)
        return {
          unitId: buildFolderUnitId(folderPath),
          kind: 'folder' as const,
          title: segments[segments.length - 1] || folderPath,
          parentId: folderParentByUnitId.get(buildFolderUnitId(folderPath)),
          displayPath: folderPath,
          proposedNodeId: buildFolderUnitId(folderPath),
          legacyDisplayPath: folderPath,
          orderIndex: manualOrderIndex.orderIndexByEntry.get(`${orderParentId}\u0000${entryId}`)
        }
      }),
    ...normalizedDocuments.map((document) => {
      const documentId = getDocumentId(document)
      const normalizedPath = normalizeDisplayPath(document.displayPath)
      const segments = splitDisplayPath(normalizedPath)
      const parentPath = segments.length <= 1 ? '' : `/${segments.slice(0, -1).join('/')}`
      const orderParentId = parentPath || ROOT_BUCKET_ID
      const entryId = buildDocumentOrderEntryId(documentId)
      return {
        unitId: buildDocumentUnitId(documentId),
        kind: 'document' as const,
        title: document.title || stripMarkdownExtension(segments[segments.length - 1] || documentId),
        parentId: documentParentByUnitId.get(buildDocumentUnitId(documentId)),
        displayPath: normalizedPath,
        sourceDocumentId: documentId,
        proposedNodeId: buildDocumentUnitId(documentId),
        legacyDisplayPath: normalizedPath,
        orderIndex: manualOrderIndex.orderIndexByEntry.get(`${orderParentId}\u0000${entryId}`)
      }
    })
  ]

  const nodeById = new Map(nodes.map((node) => [node.unitId, node]))
  nodes
    .filter((node) => node.kind === 'document')
    .forEach((node) => {
      const rebuiltPath = rebuildDisplayPath(node, nodeById)
      if (rebuiltPath !== node.displayPath) {
        issues.push({
          code: 'path_roundtrip_mismatch',
          severity: 'blocker',
          message: '影子 parentId 链反推 displayPath 与原路径不一致。',
          unitId: node.unitId,
          documentId: node.sourceDocumentId,
          displayPath: node.displayPath,
          details: { rebuiltPath }
        })
      }
    })

  const stableDocIdChanged = nodes
    .filter((node) => node.kind === 'document')
    .filter((node) => node.unitId !== buildDocumentUnitId(node.sourceDocumentId || ''))
    .length
  const summary = summarizeAudit(
    normalizedDocuments.length,
    folderPaths.size,
    nodes.length,
    stableDocIdChanged,
    manualOrderIndex,
    issues,
    duplicateDisplayPathGroups
  )

  return {
    generatedAt,
    summary,
    nodes: nodes.sort(sortShadowNodes),
    issues: issues.sort(sortIssues),
    duplicateDisplayPathGroups,
    rollbackAssessment: buildRollbackAssessment(summary, issues)
  }
}

export function renderDocLibraryParentIdShadowAuditReport(report: DocLibraryParentIdShadowAuditReport): string {
  const issueRows = report.issues.length
    ? report.issues.map((issue) => [
      issue.severity,
      issue.code,
      issue.documentId || '',
      issue.displayPath || issue.parentId || '',
      issue.entryId || '',
      issue.message
    ])
    : [['-', '-', '-', '-', '-', '未发现阻断项或排序噪声。']]

  return [
    '# 批次 10：字段树影子审计报告',
    '',
    `> 生成时间：${report.generatedAt}`,
    '> 范围：文档库 `displayPath` 路径树、`docLibraryManualTreeOrders` 排序桶、只读 `parentId` 影子结构。',
    '',
    '## 结论',
    '',
    report.summary.suitableForFormalMigration
      ? '当前样本适合进入后续正式迁移设计：影子字段树可以无损反推路径树，且 `doc:<documentId>` 稳定 ID 未变化。'
      : '当前样本不适合直接正式迁移：影子字段树存在无法无损反推路径树或排序桶噪声，需要先处理阻断项。',
    '',
    '本批只做只读审计：没有写数据库，没有改变导入导出 schema，没有把 `displayPath` 真值替换成 `parentId` 真值。',
    '',
    '## 汇总',
    '',
    '| 指标 | 数值 |',
    '| --- | ---: |',
    `| 文档数 | ${report.summary.documentCount} |`,
    `| 影子文件夹数 | ${report.summary.folderCount} |`,
    `| 影子节点总数 | ${report.summary.shadowNodeCount} |`,
    `| \`doc:<documentId>\` ID 变化 | ${report.summary.stableDocIdChanged} |`,
    `| 路径反推不一致 | ${report.summary.roundtripMismatchCount} |`,
    `| 排序桶数 | ${report.summary.manualOrderBucketCount} |`,
    `| 排序条目数 | ${report.summary.manualOrderEntryCount} |`,
    `| 排序孤儿条目 | ${report.summary.manualOrderOrphanCount} |`,
    `| 排序父级不一致 | ${report.summary.manualOrderWrongParentCount} |`,
    `| 重复显示路径组 | ${report.summary.duplicateDisplayPathGroupCount} |`,
    `| blocker | ${report.summary.blockerCount} |`,
    `| warning | ${report.summary.warningCount} |`,
    `| info | ${report.summary.infoCount} |`,
    '',
    '## 问题解释与处理建议',
    '',
    ...renderDuplicateDisplayPathAdvice(report.duplicateDisplayPathGroups),
    '',
    '## Diff 与风险',
    '',
    '| 级别 | 类型 | 文档 | 路径或父级 | 排序条目 | 说明 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...issueRows.map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
    '',
    '## 回退评估',
    '',
    `结论：${report.rollbackAssessment.conclusion}`,
    '',
    '保留项：',
    ...report.rollbackAssessment.preservedInShadow.map((item) => `- ${item}`),
    '',
    '本批未改变：',
    ...report.rollbackAssessment.notChangedByAudit.map((item) => `- ${item}`),
    '',
    '阻断项：',
    ...(report.rollbackAssessment.blockers.length
      ? report.rollbackAssessment.blockers.map((item) => `- ${item}`)
      : ['- 无。']),
    '',
    '警告项：',
    ...(report.rollbackAssessment.warnings.length
      ? report.rollbackAssessment.warnings.map((item) => `- ${item}`)
      : ['- 无。']),
    '',
    '## 后续建议',
    '',
    '1. 正式迁移前继续以 `displayPath + docLibraryManualTreeOrders` 为文档库树真值。',
    '2. 先处理或隔离重复 `displayPath` 阻断项，再进入字段树协议和转换器批次。',
    '3. 如果后续排序桶非空，先清理孤儿条目和父级不一致条目，再生成迁移 SQL。',
    '4. 正式迁移方案必须继续覆盖导入导出、云快照、角色大脑导入、关系视图和召回读取回归。'
  ].join('\n')
}

function buildDuplicateDisplayPathGroups(documentsByPath: Map<string, BrainDocumentRecord[]>): DocLibraryDuplicateDisplayPathGroup[] {
  return Array.from(documentsByPath.entries())
    .filter(([, documents]) => documents.length > 1)
    .map(([displayPath, documents]) => {
      const documentIds = documents.map(getDocumentId)
      return {
        displayPath,
        documentIds,
        category: 'user_content_duplicate' as const,
        ...describeDuplicateDisplayPathFix(),
        blocksFormalMigration: true
      }
    })
    .sort((left, right) => left.displayPath.localeCompare(right.displayPath, 'zh-Hans-CN'))
}

function describeDuplicateDisplayPathFix() {
  return {
    suggestedAction: 'manual_review_before_field_tree',
    explanation: '重复路径来自普通内容，系统不能自动判断哪篇是正本、哪篇应改名或移走。',
    consequence: '如果直接迁移，后续导入导出、回退和召回可读路径都会出现歧义。',
    fixTiming: 'before_dual_write' as const
  }
}

function renderDuplicateDisplayPathAdvice(groups: DocLibraryDuplicateDisplayPathGroup[]) {
  if (!groups.length) {
    return [
      '未发现重复 `displayPath（显示路径）` 组；路径到字段树的身份映射暂时没有这类歧义。'
    ]
  }
  const lines = [
    `发现 ${groups.length} 组重复 \`displayPath（显示路径）\`。这意味着旧路径树里存在多个文档占用同一个可读地址，字段树不能无损判断每篇文档的唯一树位置。`,
    '',
    '重复组需要人工或更保守的规则确认，不能让迁移器猜正本。'
  ]
  const sampleGroups = groups.slice(0, 12)
  return [
    ...lines,
    '',
    '| 路径 | 分类 | 文档数 | 建议动作 | 修复时机 | 后果 |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...sampleGroups.map((group) => `| ${[
      group.displayPath,
      group.category,
      String(group.documentIds.length),
      group.suggestedAction,
      group.fixTiming,
      group.consequence
    ].map(escapeMarkdownCell).join(' | ')} |`),
    ...(groups.length > sampleGroups.length ? [`| 其余 ${groups.length - sampleGroups.length} 组 | - | - | 见机器报告 | - | - |`] : [])
  ]
}

function buildManualOrderIndex(
  manualTreeOrders: DocLibraryManualTreeOrders,
  knownEntries: Set<string>,
  knownEntryParents: Map<string, string>,
  knownBucketParents: Set<string>
): ManualOrderIndex {
  const orderIndexByEntry = new Map<string, number>()
  const issues: DocLibraryShadowAuditIssue[] = []
  let entryCount = 0

  Object.entries(normalizeManualTreeOrders(manualTreeOrders)).forEach(([parentId, entries]) => {
    if (!knownBucketParents.has(parentId)) {
      issues.push({
        code: 'manual_order_bucket_parent_missing',
        severity: 'warning',
        message: '排序桶父级在当前路径树中不存在。',
        parentId
      })
    }
    const seenInBucket = new Set<string>()
    entries.forEach((entryId, index) => {
      entryCount += 1
      if (seenInBucket.has(entryId)) {
        issues.push({
          code: 'manual_order_entry_duplicate',
          severity: 'warning',
          message: '同一个排序桶内存在重复条目。',
          parentId,
          entryId
        })
      }
      seenInBucket.add(entryId)
      orderIndexByEntry.set(`${parentId}\u0000${entryId}`, index)

      if (!knownEntries.has(entryId)) {
        issues.push({
          code: 'manual_order_entry_orphan',
          severity: 'warning',
          message: '排序桶条目在当前路径树中找不到对应文件夹或文档。',
          parentId,
          entryId
        })
        return
      }
      const expectedParentId = knownEntryParents.get(entryId)
      if (expectedParentId && expectedParentId !== parentId) {
        issues.push({
          code: 'manual_order_entry_wrong_parent',
          severity: 'warning',
          message: '排序桶条目的父级与当前路径树推导父级不一致。',
          parentId,
          entryId,
          details: { expectedParentId }
        })
      }
    })
  })

  return {
    orderIndexByEntry,
    issues,
    bucketCount: Object.keys(normalizeManualTreeOrders(manualTreeOrders)).length,
    entryCount
  }
}

function summarizeAudit(
  documentCount: number,
  folderCount: number,
  shadowNodeCount: number,
  stableDocIdChanged: number,
  manualOrderIndex: ManualOrderIndex,
  issues: DocLibraryShadowAuditIssue[],
  duplicateDisplayPathGroups: DocLibraryDuplicateDisplayPathGroup[]
) {
  const blockerCount = issues.filter((issue) => issue.severity === 'blocker').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const infoCount = issues.filter((issue) => issue.severity === 'info').length
  const roundtripMismatchCount = issues.filter((issue) => issue.code === 'path_roundtrip_mismatch').length
  const manualOrderOrphanCount = issues.filter((issue) => issue.code === 'manual_order_entry_orphan').length
  const manualOrderWrongParentCount = issues.filter((issue) => issue.code === 'manual_order_entry_wrong_parent').length
  const canRoundtripLosslessly = blockerCount === 0 && stableDocIdChanged === 0
  return {
    documentCount,
    folderCount,
    shadowNodeCount,
    stableDocIdChanged,
    roundtripMismatchCount,
    manualOrderBucketCount: manualOrderIndex.bucketCount,
    manualOrderEntryCount: manualOrderIndex.entryCount,
    manualOrderOrphanCount,
    manualOrderWrongParentCount,
    blockerCount,
    warningCount,
    infoCount,
    duplicateDisplayPathGroupCount: duplicateDisplayPathGroups.length,
    canRoundtripLosslessly,
    suitableForFormalMigration: canRoundtripLosslessly && manualOrderOrphanCount === 0 && manualOrderWrongParentCount === 0
  }
}

function buildRollbackAssessment(
  summary: DocLibraryParentIdShadowAuditReport['summary'],
  issues: DocLibraryShadowAuditIssue[]
) {
  const blockers = issues
    .filter((issue) => issue.severity === 'blocker')
    .map((issue) => `${issue.code}: ${issue.message}${issue.displayPath ? ` (${issue.displayPath})` : ''}`)
  const warnings = issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => `${issue.code}: ${issue.message}${issue.entryId ? ` (${issue.entryId})` : ''}`)
  return {
    conclusion: summary.suitableForFormalMigration
      ? '影子字段树可完整还原当前路径树；回退时继续保留原 `displayPath` 和排序配置即可。'
      : '不能直接迁移；正式迁移前必须先处理阻断项和排序桶噪声，否则回退会出现路径或顺序不一致。',
    blockers,
    warnings,
    preservedInShadow: [
      '`doc:<documentId>` 文档单位 ID。',
      '从 `displayPath` 推导出的父子关系。',
      '`docLibraryManualTreeOrders` 的同父级排序索引。'
    ],
    notChangedByAudit: [
      '数据库记录。',
      '文档导入导出 schema。',
      '云快照字段。',
      '角色大脑引用与召回链路。'
    ]
  }
}

function rebuildDisplayPath(
  node: DocLibraryParentIdShadowNode,
  nodeById: Map<string, DocLibraryParentIdShadowNode>
) {
  const names = [getPathSegmentForNode(node)]
  let currentParentId = node.parentId
  const visited = new Set<string>()
  while (currentParentId && currentParentId !== ROOT_UNIT_ID && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = nodeById.get(currentParentId)
    if (!parent) break
    names.unshift(getPathSegmentForNode(parent))
    currentParentId = parent.parentId
  }
  return `/${names.filter(Boolean).join('/')}`
}

function getPathSegmentForNode(node: DocLibraryParentIdShadowNode) {
  if (node.kind === 'document') {
    const segments = splitDisplayPath(node.displayPath)
    return segments[segments.length - 1] || node.title
  }
  return node.title
}

function normalizeManualTreeOrders(input: unknown): DocLibraryManualTreeOrders {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        String(key || '').trim(),
        Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
      ])
      .filter(([key]) => Boolean(key))
  )
}

function normalizeDisplayPath(displayPath: unknown) {
  const segments = splitDisplayPath(String(displayPath || ''))
  return segments.length ? `/${segments.join('/')}` : ''
}

function splitDisplayPath(displayPath: string) {
  return String(displayPath || '').split('/').map((item) => item.trim()).filter(Boolean)
}

function getDocumentId(document: BrainDocumentRecord) {
  return String(document.documentId || document.id || document.stableId || '').trim()
}

function buildDocumentUnitId(documentId: string) {
  return `doc:${encodeUnitSegment(documentId)}`
}

function buildFolderUnitId(folderPath: string) {
  return `doc-tree:${encodeUnitSegment(normalizeDisplayPath(folderPath))}`
}

function buildDocumentOrderEntryId(documentId: string) {
  return `document:${documentId}`
}

function buildFolderOrderEntryId(folderPath: string) {
  return `folder:${normalizeDisplayPath(folderPath)}`
}

function encodeUnitSegment(value: string) {
  return encodeURIComponent(String(value || '').trim()).replace(/%/g, '~')
}

function stripMarkdownExtension(name: string) {
  return String(name || '').replace(/\.md$/i, '')
}

function sortShadowNodes(left: DocLibraryParentIdShadowNode, right: DocLibraryParentIdShadowNode) {
  const kindRank = { root: 0, folder: 1, document: 2 }
  const kindCompare = kindRank[left.kind] - kindRank[right.kind]
  if (kindCompare !== 0) return kindCompare
  return left.displayPath.localeCompare(right.displayPath, 'zh-Hans-CN')
}

function sortIssues(left: DocLibraryShadowAuditIssue, right: DocLibraryShadowAuditIssue) {
  const severityRank = { blocker: 0, warning: 1, info: 2 }
  const severityCompare = severityRank[left.severity] - severityRank[right.severity]
  if (severityCompare !== 0) return severityCompare
  return left.code.localeCompare(right.code, 'zh-Hans-CN')
}

function escapeMarkdownCell(value: string) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}
