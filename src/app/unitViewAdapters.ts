import type {
  BrainDocumentRecord,
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders
} from '../types/docBrain'
import type { Character } from '../types'
import type {
  RelationViewEvidence,
  RelationViewRecord,
  UnitView,
  UnitViewAdapterResult,
  UnitViewAdapterWarning,
  UnitViewCompilePage,
  UnitViewValidationIssue,
  UnitViewValidationReport,
  UnitViewType
} from '../types/unitView'
import type { CharacterBrainFieldKey, CharacterBrainTraceNode } from '../types/characterBrain'
import {
  buildTrajectoryRootContent,
  createCharacterBrainReadContext,
  readCharacterBrainCognitionNodes,
  readCharacterBrainCompilePage,
  readCharacterBrainDocument,
  readCharacterBrainTraceNodes
} from './characterBrain'
import { isFormalTraceDayNode } from './characterBrainTreeModel'
import {
  normalizeDocLibraryDisplayPath,
  normalizeDocLibraryFolderPath,
  splitDocLibraryDisplayPath as splitDisplayPath,
  stripDocLibraryMarkdownExtension as stripMarkdownExtension
} from './docLibraryPathCompat'
import { PREDICATE_DICTIONARY_PREDICATES } from './relationPredicateDictionary'
import { parseRelationHintLine } from './relationHintParser'
import { getUnitRelationRefIds } from './relationHintReference'
import { normalizeUnitSemanticType } from './unitSemanticTypes'
import { measureSync } from '../utils/performanceMarks'

export const STRUCTURE_CONTAINS_PREDICATE_ID = 'predicate:structure:contains'
export const GENERAL_RELATED_TO_PREDICATE_ID = 'predicate:general:related_to'
export const LINEAGE_SOURCE_OF_PREDICATE_ID = 'predicate:lineage:source_of'

export const DEFAULT_PREDICATES = PREDICATE_DICTIONARY_PREDICATES

type ManualTreeOrders = Record<string, string[]>

const DOC_ROOT_UNIT_ID = 'doc-tree:root'
const CHARACTER_ROOT_PREFIX = 'character:'
const CORE_ROOT_ID = 'core'
const SOUL_ROOT_ID = 'soul'
const TRACE_ROOT_ID = 'trace'
const CORE_AVATAR_GROUP_ID = 'brain:avatar'
const CORE_PRESET_GROUP_ID = 'brain:preset'
const CORE_DETAIL_GROUP_ID = 'brain:detail_info'
const CORE_GOAL_VALUE_ID = 'brain:goal_value'
const CORE_SYSTEM_INFO_GROUP_ID = 'brain:system_info'
const LEGACY_SOUL_ROOT_ID = 'brain:cognition'
const LEGACY_TRACE_ROOT_ID = 'brain:trajectory'
const CORE_DOCUMENT_FIELD_NODE_IDS = new Set([
  'brain:desc',
  CORE_GOAL_VALUE_ID,
  'brain:appearance',
  'brain:speaking_style',
  'brain:outfit',
  'brain:personality',
  'brain:hobbies',
  'brain:abilities',
  'brain:experience',
  'brain:worldview',
  'brain:background'
])

const CORE_GROUP_UNITS: Array<{
  nodeId: string
  title: string
  orderIndex: number
  parentNodeId?: string
}> = [
  { nodeId: CORE_DETAIL_GROUP_ID, title: '详细信息', orderIndex: 3 },
  { nodeId: CORE_SYSTEM_INFO_GROUP_ID, title: '系统信息', orderIndex: 4 },
  { nodeId: CORE_AVATAR_GROUP_ID, title: '头像', orderIndex: 0, parentNodeId: CORE_SYSTEM_INFO_GROUP_ID },
  { nodeId: CORE_PRESET_GROUP_ID, title: '预设', orderIndex: 1, parentNodeId: CORE_SYSTEM_INFO_GROUP_ID }
]

const CORE_FIELD_UNITS: Array<{
  nodeId: string
  fieldKey?: CharacterBrainFieldKey
  title: string
  parentNodeId: string
  orderIndex: number
}> = [
  { nodeId: 'brain:desc', fieldKey: 'desc', title: '简介', parentNodeId: CORE_ROOT_ID, orderIndex: 0 },
  { nodeId: 'brain:personality', fieldKey: 'personality', title: '性格', parentNodeId: CORE_ROOT_ID, orderIndex: 1 },
  { nodeId: CORE_GOAL_VALUE_ID, title: '目标与价值', parentNodeId: CORE_ROOT_ID, orderIndex: 2 },
  { nodeId: 'brain:appearance', fieldKey: 'appearance', title: '外貌特征', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 0 },
  { nodeId: 'brain:speaking_style', fieldKey: 'speakingStyle', title: '说话风格', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 1 },
  { nodeId: 'brain:outfit', fieldKey: 'outfit', title: '穿着', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 2 },
  { nodeId: 'brain:hobbies', fieldKey: 'hobbies', title: '爱好', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 3 },
  { nodeId: 'brain:abilities', fieldKey: 'abilities', title: '能力', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 4 },
  { nodeId: 'brain:experience', fieldKey: 'experience', title: '经历', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 5 },
  { nodeId: 'brain:worldview', fieldKey: 'worldview', title: '世界观', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 6 },
  { nodeId: 'brain:background', fieldKey: 'background', title: '背景故事', parentNodeId: CORE_DETAIL_GROUP_ID, orderIndex: 7 },
  { nodeId: 'brain:emoji', fieldKey: 'emoji', title: 'Emoji', parentNodeId: CORE_AVATAR_GROUP_ID, orderIndex: 0 },
  { nodeId: 'brain:avatar_path', fieldKey: 'avatarPath', title: '头像路径', parentNodeId: CORE_AVATAR_GROUP_ID, orderIndex: 1 },
  { nodeId: 'brain:default_preset', fieldKey: 'defaultPreset', title: '默认预设', parentNodeId: CORE_PRESET_GROUP_ID, orderIndex: 0 },
  { nodeId: 'brain:default_model', fieldKey: 'defaultModel', title: '默认模型', parentNodeId: CORE_PRESET_GROUP_ID, orderIndex: 1 },
  { nodeId: 'brain:name', fieldKey: 'name', title: '姓名', parentNodeId: CORE_SYSTEM_INFO_GROUP_ID, orderIndex: 2 },
  { nodeId: 'brain:gender', fieldKey: 'gender', title: '性别', parentNodeId: CORE_SYSTEM_INFO_GROUP_ID, orderIndex: 3 },
  { nodeId: 'brain:age', fieldKey: 'age', title: '年龄', parentNodeId: CORE_SYSTEM_INFO_GROUP_ID, orderIndex: 4 },
  { nodeId: 'brain:nicknames', fieldKey: 'nicknames', title: '昵称', parentNodeId: CORE_SYSTEM_INFO_GROUP_ID, orderIndex: 5 }
]

export function buildCharacterBrainSidebarShellUnitView(character: Character): UnitViewAdapterResult {
  const characterId = String(character.id || '').trim() || 'unknown'
  const characterUnitId = `${CHARACTER_ROOT_PREFIX}${characterId}`
  const coreRootUnitId = buildBrainUnitId(characterId, CORE_ROOT_ID)
  const soulRootUnitId = buildBrainUnitId(characterId, SOUL_ROOT_ID)
  const traceRootUnitId = buildBrainUnitId(characterId, TRACE_ROOT_ID)
  return {
    units: [
      {
        unitId: characterUnitId,
        domain: 'character',
        unitType: 'character',
        contentKind: 'form',
        title: character.name || '未命名角色',
        sourceId: characterId,
        status: 'normal',
        metadata: {
          gender: character.gender,
          age: character.age,
          groupId: character.groupId || character.group_id
        }
      },
      createBrainRootUnit(coreRootUnitId, characterUnitId, characterId, '核心', 'core', 0),
      createBrainRootUnit(soulRootUnitId, characterUnitId, characterId, '灵魂', 'soul', 1),
      createBrainRootUnit(traceRootUnitId, characterUnitId, characterId, '轨迹', 'trace', 2, LEGACY_TRACE_ROOT_ID)
    ],
    relations: [],
    warnings: []
  }
}

export function buildDocLibraryUnitView(
  documents: BrainDocumentRecord[],
  manualTreeOrders: ManualTreeOrders = {},
  options: {
    treeNodes?: DocTreeNodeRecord[]
    treeOrders?: DocTreeOrders
    treeDiffReport?: DocLibraryTreeDiffReport
  } = {}
): UnitViewAdapterResult {
  if (canUseDocLibraryFieldTree(options)) {
    return buildDocLibraryFieldTreeUnitView(documents, options.treeNodes || [], options.treeOrders || {})
  }
  const result = buildDocLibraryPathUnitView(documents, manualTreeOrders)
  if (Array.isArray(options.treeNodes) && options.treeNodes.length > 0 && options.treeDiffReport?.canUseFieldTree === false) {
    result.warnings.push({
      code: 'doc_field_tree_unavailable',
      message: '字段树差异报告存在阻断，UnitView 已回退到旧路径树读取。',
      details: {
        blockerCount: options.treeDiffReport.blockerCount,
        warningCount: options.treeDiffReport.warningCount
      }
    })
  }
  return result
}

export function buildDocLibrarySidebarShellUnitView(
  documents: BrainDocumentRecord[],
  manualTreeOrders: ManualTreeOrders = {}
): UnitViewAdapterResult {
  return buildDocLibraryPathUnitView(documents, manualTreeOrders)
}

function buildDocLibraryPathUnitView(
  documents: BrainDocumentRecord[],
  manualTreeOrders: ManualTreeOrders = {}
): UnitViewAdapterResult {
  const warnings: UnitViewAdapterWarning[] = []
  const units: UnitView[] = [createRootUnit(DOC_ROOT_UNIT_ID, 'docLibrary', '世界树')]
  const folderPaths = new Set<string>()
  const pathToDocumentId = new Map<string, string>()
  const overviewDocumentByFolderPath = buildOverviewDocumentByFolderPath(documents)
  const orderIndexByEntry = buildManualOrderIndex(manualTreeOrders)

  documents.forEach((document) => {
    const pathSegments = splitDisplayPath(document.displayPath)
    const normalizedPath = pathSegments.length ? `/${pathSegments.join('/')}` : ''
    if (!normalizedPath) {
      warnings.push({
        code: 'doc_empty_path',
        message: '文档缺少 displayPath，adapter 只能挂到世界树根。',
        sourceId: document.documentId || document.id
      })
    } else if (pathToDocumentId.has(normalizedPath)) {
      warnings.push({
        code: 'doc_duplicate_path',
        message: '文档 displayPath 重复，会导致树读取歧义。',
        sourceId: document.documentId || document.id,
        sourcePath: normalizedPath,
        details: { previousDocumentId: pathToDocumentId.get(normalizedPath) }
      })
    } else {
      pathToDocumentId.set(normalizedPath, document.documentId || document.id)
    }

    const folderSegments = pathSegments.slice(0, -1)
    for (let index = 0; index < folderSegments.length; index += 1) {
      const folderPath = `/${folderSegments.slice(0, index + 1).join('/')}`
      if (folderPaths.has(folderPath)) continue
      folderPaths.add(folderPath)
      const parentPath = index === 0 ? '' : `/${folderSegments.slice(0, index).join('/')}`
      const orderKey = index === 0 ? '__root__' : parentPath
      const overviewDocument = overviewDocumentByFolderPath.get(folderPath)
      const compilePage = overviewDocument ? readDocumentCompilePage(overviewDocument) : undefined
      units.push({
        unitId: buildDocFolderUnitId(folderPath),
        domain: 'docLibrary',
        unitType: index === 0 ? 'cluster' : 'branch',
        contentKind: 'group',
        title: folderSegments[index],
        parentId: index === 0 ? DOC_ROOT_UNIT_ID : buildDocFolderUnitId(parentPath),
        orderIndex: orderIndexByEntry.get(`${orderKey}\u0000folder:${folderPath}`),
      sourceId: folderPath,
      sourcePath: folderPath,
      semanticType: overviewDocument ? normalizeUnitSemanticType(overviewDocument.semanticType) : 'other',
      body: overviewDocument?.content || '',
        compilePage,
        status: 'normal',
        metadata: {
          overviewDocumentId: overviewDocument ? getDocumentId(overviewDocument) : undefined
        }
      })
    }

    if (isIndexDocumentPath(normalizedPath)) return

    const parentFolderPath = folderSegments.length ? `/${folderSegments.join('/')}` : ''
    const parentId = parentFolderPath ? buildDocFolderUnitId(parentFolderPath) : DOC_ROOT_UNIT_ID
    const orderKey = parentFolderPath || '__root__'
    const documentId = document.documentId || document.id
    const compilePage = readDocumentCompilePage(document)
    if (!document.publicCompilePage) {
      warnings.push({
        code: 'doc_missing_compile_page',
        message: '文档缺少公共编译页，adapter 已用顶层摘要和标签兜底。',
        unitId: buildDocUnitId(documentId),
        sourceId: documentId,
        sourcePath: normalizedPath
      })
    }
    units.push({
      unitId: buildDocUnitId(documentId),
      domain: 'docLibrary',
      unitType: 'leaf',
      contentKind: 'markdown',
      title: document.title || stripMarkdownExtension(pathSegments[pathSegments.length - 1] || documentId),
      parentId,
      orderIndex: orderIndexByEntry.get(`${orderKey}\u0000document:${documentId}`),
      sourceId: documentId,
      sourcePath: normalizedPath || document.displayPath,
      semanticType: normalizeUnitSemanticType(document.semanticType),
      body: document.content || '',
      compilePage,
      status: document.versionState === 'pending' ? 'pending' : 'normal',
      metadata: {
        documentType: document.documentType,
        sourceDocumentIds: document.sourceDocumentIds,
        relatedNeuronIds: document.relatedNeuronIds,
        sourceMeta: document.sourceMeta
      }
    })
  })

  warnings.push(...collectManualOrderOrphans(manualTreeOrders, units))

  const treeRelations = buildTreeProjectionRelations(units)
  const relations = [
    ...treeRelations,
    ...buildRelationHintRelations(units, treeRelations, warnings)
  ]
  return { units: sortUnits(units), relations: sortRelations(relations), warnings }
}

function buildDocLibraryFieldTreeUnitView(
  documents: BrainDocumentRecord[],
  treeNodes: DocTreeNodeRecord[],
  treeOrders: DocTreeOrders = {}
): UnitViewAdapterResult {
  const warnings: UnitViewAdapterWarning[] = []
  const units: UnitView[] = [createRootUnit(DOC_ROOT_UNIT_ID, 'docLibrary', '世界树')]
  const documentById = new Map(documents.map((document) => [getDocumentId(document), document] as const))
  const nodes = normalizeDocTreeNodesForUnitView(treeNodes)
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node] as const))
  const overviewDocumentIdByFolderNodeId = buildFieldTreeOverviewDocumentIdMap(nodes, nodeById, documentById)
  const overviewDocumentIds = new Set(Array.from(overviewDocumentIdByFolderNodeId.values()).filter(Boolean))
  const orderIndexByNode = buildFieldTreeOrderIndex(treeOrders)

  nodes
    .filter((node) => node.nodeKind === 'folder')
    .forEach((node) => {
      const parentId = resolveFieldTreeParentUnitId(node, nodeById, warnings)
      const overviewDocumentId = overviewDocumentIdByFolderNodeId.get(node.nodeId) || ''
      const overviewDocument = overviewDocumentId
        ? documentById.get(overviewDocumentId)
        : undefined
      const compilePage = overviewDocument ? readDocumentCompilePage(overviewDocument) : undefined
      units.push({
        unitId: node.nodeId,
        domain: 'docLibrary',
        unitType: parentId === DOC_ROOT_UNIT_ID ? 'cluster' : 'branch',
        contentKind: 'group',
        title: node.title || lastPathSegment(node.legacyDisplayPath || '') || node.nodeId,
        parentId,
        orderIndex: orderIndexByNode.get(`${node.parentId || DOC_ROOT_UNIT_ID}\u0000${node.nodeId}`),
        sourceId: node.nodeId,
        sourcePath: rebuildFieldTreeFolderPath(node, nodeById),
        semanticType: overviewDocument ? normalizeUnitSemanticType(overviewDocument.semanticType) : 'other',
        body: overviewDocument?.content || '',
        compilePage,
        status: node.status === 'deleted' ? 'placeholder' : 'normal',
        metadata: {
          treeSource: 'fieldTree',
          treeNodeId: node.nodeId,
          nodeKind: node.nodeKind,
          legacyDisplayPath: node.legacyDisplayPath,
          overviewDocumentId,
          relationRefId: overviewDocumentId || node.nodeId
        }
      })
    })

  nodes
    .filter((node) => node.nodeKind === 'document' && node.documentId && !overviewDocumentIds.has(String(node.documentId || '').trim()))
    .forEach((node) => {
      const documentId = String(node.documentId || '').trim()
      const document = documentById.get(documentId)
      if (!document) {
        warnings.push({
          code: 'doc_field_tree_document_missing',
          message: '字段树文档节点指向的正式文档不存在，UnitView 已跳过该节点。',
          sourceId: documentId,
          sourcePath: node.legacyDisplayPath,
          details: { nodeId: node.nodeId }
        })
        return
      }
      const parentId = resolveFieldTreeParentUnitId(node, nodeById, warnings)
      const compilePage = readDocumentCompilePage(document)
      if (!document.publicCompilePage) {
        warnings.push({
          code: 'doc_missing_compile_page',
          message: '文档缺少公共编译页，adapter 已用顶层摘要和标签兜底。',
          unitId: buildDocUnitId(documentId),
          sourceId: documentId,
          sourcePath: node.legacyDisplayPath || document.displayPath
        })
      }
      units.push({
        unitId: buildDocUnitId(documentId),
        domain: 'docLibrary',
        unitType: 'leaf',
        contentKind: 'markdown',
        title: document.title || node.title || stripMarkdownExtension(lastPathSegment(node.legacyDisplayPath || document.displayPath)) || documentId,
        parentId,
        orderIndex: orderIndexByNode.get(`${node.parentId || DOC_ROOT_UNIT_ID}\u0000${node.nodeId}`),
        sourceId: documentId,
        sourcePath: node.legacyDisplayPath || document.displayPath,
        semanticType: normalizeUnitSemanticType(document.semanticType),
        body: document.content || '',
        compilePage,
        status: document.versionState === 'pending' ? 'pending' : 'normal',
        metadata: {
          documentType: document.documentType,
          sourceDocumentIds: document.sourceDocumentIds,
          relatedNeuronIds: document.relatedNeuronIds,
          sourceMeta: document.sourceMeta,
          treeSource: 'fieldTree',
          treeNodeId: node.nodeId,
          nodeKind: node.nodeKind,
          legacyDisplayPath: node.legacyDisplayPath,
          documentId,
          relationRefId: documentId
        }
      })
    })

  documentById.forEach((document, documentId) => {
    const expectedNodeId = buildDocUnitId(documentId)
    if (overviewDocumentIds.has(documentId) || isIndexDocumentPath(document.displayPath || '')) return
    if (nodes.some((node) => node.nodeKind === 'document' && node.documentId === documentId)) return
    warnings.push({
      code: 'doc_field_tree_document_missing',
      message: '正式文档缺少字段树文档节点，UnitView 已临时挂到世界树根。',
      unitId: expectedNodeId,
      sourceId: documentId,
      sourcePath: document.displayPath
    })
    const compilePage = readDocumentCompilePage(document)
    units.push({
      unitId: expectedNodeId,
      domain: 'docLibrary',
      unitType: 'leaf',
      contentKind: 'markdown',
      title: document.title || stripMarkdownExtension(lastPathSegment(document.displayPath)) || documentId,
      parentId: DOC_ROOT_UNIT_ID,
      sourceId: documentId,
      sourcePath: document.displayPath,
      semanticType: normalizeUnitSemanticType(document.semanticType),
      body: document.content || '',
      compilePage,
      status: document.versionState === 'pending' ? 'pending' : 'normal',
      metadata: {
        documentType: document.documentType,
        sourceDocumentIds: document.sourceDocumentIds,
        relatedNeuronIds: document.relatedNeuronIds,
        sourceMeta: document.sourceMeta,
        treeSource: 'fieldTreeFallback',
        documentId,
        relationRefId: documentId
      }
    })
  })

  const treeRelations = buildTreeProjectionRelations(units)
  const relations = [
    ...treeRelations,
    ...buildRelationHintRelations(units, treeRelations, warnings)
  ]
  return { units: sortUnits(units), relations: sortRelations(relations), warnings }
}

function buildOverviewDocumentByFolderPath(documents: BrainDocumentRecord[]) {
  const map = new Map<string, BrainDocumentRecord>()
  documents.forEach((document) => {
    const normalizedPath = normalizeDocLibraryDisplayPath(document.displayPath || '')
    if (!isIndexDocumentPath(normalizedPath)) return
    const folderPath = normalizeDocLibraryFolderPath(`/${splitDisplayPath(normalizedPath).slice(0, -1).join('/')}`)
    if (folderPath) map.set(folderPath, document)
  })
  return map
}

function buildFieldTreeOverviewDocumentIdMap(
  nodes: DocTreeNodeRecord[],
  nodeById: Map<string, DocTreeNodeRecord>,
  documentById: Map<string, BrainDocumentRecord>
) {
  const map = new Map<string, string>()
  nodes.forEach((node) => {
    if (node.nodeKind !== 'folder') return
    const overviewDocumentId = String(node.overviewDocumentId || '').trim()
    if (overviewDocumentId) map.set(node.nodeId, overviewDocumentId)
  })
  nodes.forEach((node) => {
    if (node.nodeKind !== 'document') return
    const documentId = String(node.documentId || '').trim()
    const parentId = String(node.parentId || '').trim()
    const parent = nodeById.get(parentId)
    if (!documentId || parent?.nodeKind !== 'folder' || map.has(parentId)) return
    const document = documentById.get(documentId)
    if (!isIndexDocumentPath(node.legacyDisplayPath || '') && !isIndexDocumentPath(document?.displayPath || '')) return
    map.set(parentId, documentId)
  })
  return map
}

function isIndexDocumentPath(path: string) {
  const segments = splitDisplayPath(path)
  return (segments[segments.length - 1] || '').toLowerCase() === 'index.md'
}

function summarizeJsonLike(value: unknown) {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? '')
  } catch {
    return ''
  }
}

export function buildCharacterBrainUnitView(character: Character): UnitViewAdapterResult {
  return measureSync('characterBrain.unitView.build', () => buildCharacterBrainUnitViewCore(character), {
    characterId: String(character.id || '').trim() || 'unknown',
    cognitionSize: summarizeJsonLike(character.brainCognitionNodes ?? character.brain_cognition_nodes).length,
    traceSize: summarizeJsonLike(character.brainTraceNodes ?? character.brain_trace_nodes).length,
    documentsSize: summarizeJsonLike(character.brainDocuments ?? character.brain_documents).length,
    linksSize: summarizeJsonLike(character.brainLinks ?? character.brain_links).length
  }, 30)
}

function buildCharacterBrainUnitViewCore(character: Character): UnitViewAdapterResult {
  const readContext = createCharacterBrainReadContext(character)
  const warnings: UnitViewAdapterWarning[] = []
  const units: UnitView[] = []
  const characterId = String(character.id || '').trim() || 'unknown'
  const characterUnitId = `${CHARACTER_ROOT_PREFIX}${characterId}`
  const coreRootUnitId = buildBrainUnitId(characterId, CORE_ROOT_ID)
  const soulRootUnitId = buildBrainUnitId(characterId, SOUL_ROOT_ID)
  const traceRootUnitId = buildBrainUnitId(characterId, TRACE_ROOT_ID)
  const unitIdBySourceId = new Map<string, string>()

  units.push({
    unitId: characterUnitId,
    domain: 'character',
    unitType: 'character',
    contentKind: 'form',
    title: character.name || '未命名角色',
    sourceId: characterId,
    status: 'normal',
    metadata: {
      gender: character.gender,
      age: character.age,
      groupId: character.groupId || character.group_id
    }
  })
  units.push(createBrainRootUnit(coreRootUnitId, characterUnitId, characterId, '核心', 'core', 0))
  units.push(createBrainRootUnit(soulRootUnitId, characterUnitId, characterId, '灵魂', 'soul', 1))
  units.push(createBrainRootUnit(traceRootUnitId, characterUnitId, characterId, '轨迹', 'trace', 2, LEGACY_TRACE_ROOT_ID, buildTrajectoryRootContent(character)))
  unitIdBySourceId.set('brain:see_me', coreRootUnitId)
  unitIdBySourceId.set(LEGACY_SOUL_ROOT_ID, soulRootUnitId)
  unitIdBySourceId.set(LEGACY_TRACE_ROOT_ID, traceRootUnitId)

  CORE_GROUP_UNITS.forEach((group) => {
    const unitId = buildBrainUnitId(characterId, group.nodeId)
    unitIdBySourceId.set(group.nodeId, unitId)
    units.push({
      unitId,
      domain: 'characterBrain',
      unitType: 'branch',
      contentKind: 'group',
      title: group.title,
      parentId: group.parentNodeId ? buildBrainUnitId(characterId, group.parentNodeId) : coreRootUnitId,
      orderIndex: group.orderIndex,
      sourceId: group.nodeId,
      status: 'normal',
      metadata: {
        section: 'core',
        relationRefId: buildCoreBrainRelationRefId(characterId, group.nodeId)
      }
    })
  })

  CORE_FIELD_UNITS.forEach((field) => {
    const unitId = buildBrainUnitId(characterId, field.nodeId)
    unitIdBySourceId.set(field.nodeId, unitId)
    const compilePage = readCharacterBrainCompilePage(character, field.nodeId)
    units.push({
      unitId,
      domain: 'characterBrain',
      unitType: 'coreField',
      contentKind: CORE_DOCUMENT_FIELD_NODE_IDS.has(field.nodeId) ? 'markdown' : 'form',
      title: field.title,
      parentId: field.parentNodeId === CORE_ROOT_ID ? coreRootUnitId : buildBrainUnitId(characterId, field.parentNodeId),
      orderIndex: field.orderIndex,
      sourceId: field.nodeId,
      body: readCharacterBrainDocument(character, field.nodeId) || (field.fieldKey ? readCoreFieldValue(character, field.fieldKey) : ''),
      compilePage: compilePage ? normalizeCompilePage(compilePage) : undefined,
      status: 'normal',
      metadata: {
        fieldKey: field.fieldKey,
        relationRefId: buildCoreBrainRelationRefId(characterId, field.nodeId)
      }
    })
  })

  const cognitionNodes = readContext.cognitionNodes
  const cognitionIds = new Set(cognitionNodes.map((node) => node.id))
  const documentReferenceProjection = buildDocumentReferencePathProjection(characterId, cognitionNodes)
  units.push(...documentReferenceProjection.virtualUnits)
  cognitionNodes.forEach((node, index) => {
    if (documentReferenceProjection.hiddenIndexNodeIds.has(node.id)) return
    const unitId = buildBrainUnitId(characterId, node.id)
    unitIdBySourceId.set(node.id, unitId)
    const projectedParentId = documentReferenceProjection.parentByNodeId.get(node.id)
    const parentId = projectedParentId || (node.parentId && node.parentId !== LEGACY_SOUL_ROOT_ID
      ? buildBrainUnitId(characterId, node.parentId)
      : soulRootUnitId)
    if (node.parentId && node.parentId !== LEGACY_SOUL_ROOT_ID && !cognitionIds.has(node.parentId)) {
      warnings.push({
        code: 'character_brain_orphan_node',
        message: '灵魂节点父级不存在，读取时会回到灵魂根。',
        unitId,
        sourceId: node.id,
        details: { parentId: node.parentId }
      })
    }
    const compilePage = readCharacterBrainCompilePage(character, node.id, readContext)
    units.push({
      unitId,
      domain: 'characterBrain',
      unitType: 'soulNode',
      contentKind: node.kind === 'group' ? 'group' : 'markdown',
      title: node.title,
      parentId,
      orderIndex: documentReferenceProjection.orderByNodeId.get(node.id) ?? index,
      sourceId: node.id,
      sourcePath: node.sourceDisplayPath,
      body: node.content || readContext.documents[node.id] || '',
      compilePage: compilePage ? normalizeCompilePage(compilePage) : {
        summary: node.summary || '',
        tags: node.tags?.length ? node.tags : ['灵魂'],
        relationHints: node.relationHints || [],
        updatedAt: node.updatedAt
      },
      status: node.pendingReview ? 'pending' : 'normal',
      metadata: {
        kind: node.kind,
        sourceDocumentId: node.sourceDocumentId,
        relationRefId: node.id
      }
    })
  })

  const traceNodes = readContext.traceNodes
  const traceIds = new Set(traceNodes.map((node) => node.id))
  traceNodes.forEach((node, index) => {
    const unitId = buildBrainTraceUnitId(characterId, node)
    unitIdBySourceId.set(node.id, unitId)
    const parentId = node.parentId && node.parentId !== LEGACY_TRACE_ROOT_ID
      ? buildBrainTraceParentUnitId(characterId, node.parentId, readContext.traceById)
      : traceRootUnitId
    collectTraceWarnings(node, unitId, warnings)
    if (node.parentId && node.parentId !== LEGACY_TRACE_ROOT_ID && !traceIds.has(node.parentId)) {
      warnings.push({
        code: 'character_brain_orphan_node',
        message: '轨迹节点父级不存在，读取时会回到轨迹根。',
        unitId,
        sourceId: node.id,
        details: { parentId: node.parentId }
      })
    }
    const compilePage = readCharacterBrainCompilePage(character, node.id, readContext)
    const traceTitle = resolveTraceUnitTitle(node)
    const traceSidebarTitle = resolveTraceSidebarTitle(node, traceTitle)
    units.push({
      unitId,
      domain: 'trace',
      unitType: resolveTraceUnitType(node),
      contentKind: resolveTraceUnitContentKind(node),
      title: traceTitle,
      parentId,
      orderIndex: index,
      sourceId: node.id,
      sourcePath: node.pointDate || node.startDate,
      body: node.content || node.note || '',
      compilePage: compilePage ? normalizeCompilePage(compilePage) : {
        summary: node.summary || node.note || '',
        tags: node.tags || [],
        relationHints: [],
        updatedAt: node.updatedAt
      },
      status: node.confirmed === false || node.pendingReview ? 'pending' : 'normal',
      metadata: {
        kind: node.kind,
        granularity: node.granularity,
        nodeType: node.nodeType,
        startDate: node.startDate,
        endDate: node.endDate,
        pointDate: node.pointDate,
        subtitle: node.subtitle || '',
        systemRole: node.systemRole,
        activationRule: node.activationRule,
        recallPolicy: node.recallPolicy,
        sidebarTitle: traceSidebarTitle,
        titleReadonly: isSystemTraceDateUnit(node),
        relatedEntityIds: node.relatedEntityIds,
        linkIds: node.linkIds
      }
    })
  })

  const unitIds = new Set(units.map((unit) => unit.unitId))
  const treeRelations = buildTreeProjectionRelations(units)
  const relations = [
    ...treeRelations,
    ...buildRelationHintRelations(units, treeRelations, warnings),
    ...buildBrainLinkCandidates(character, unitIdBySourceId, unitIds, warnings)
  ]
  return { units: sortUnits(units), relations: sortRelations(relations), warnings }
}

export function buildTreeProjectionRelations(units: UnitView[]): RelationViewRecord[] {
  return units
    .filter((unit) => Boolean(unit.parentId))
    .map((unit) => ({
      relationId: buildRelationId('tree', unit.parentId || '', unit.unitId, STRUCTURE_CONTAINS_PREDICATE_ID),
      sourceUnitId: unit.parentId || '',
      targetUnitId: unit.unitId,
      predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
      direction: 'directed',
      status: 'projection',
      evidence: [{ sourceType: 'tree', sourceId: unit.sourceId || unit.unitId }]
    }))
}

export function buildRelationHintRelations(
  units: UnitView[],
  existingRelations: RelationViewRecord[] = [],
  warnings: UnitViewAdapterWarning[] = []
): RelationViewRecord[] {
  const relationIndex = buildRelationHintIndex(units)

  const relations: RelationViewRecord[] = []
  const existingRelationsByKey = new Map<string, RelationViewRecord>()
  existingRelations.filter(isDeclaredRelationHintRelation).forEach((relation) => {
    const key = getNormalizedRelationKey(relation)
    if (!existingRelationsByKey.has(key)) existingRelationsByKey.set(key, relation)
  })
  const existingKeys = new Set(existingRelationsByKey.keys())
  units.forEach((unit) => {
    const hints = unit.compilePage?.relationHints || []
    hints.forEach((hint, index) => {
      const parsed = parseRelationHintLine(hint, index)
      parsed.warnings.forEach((warning) => {
        warnings.push({
          code: warning.code,
          message: warning.message,
          unitId: unit.unitId,
          sourceId: unit.sourceId,
          sourcePath: unit.sourcePath,
          details: {
            hint,
            lineIndex: warning.lineIndex,
            rawPredicate: warning.rawPredicate
          }
        })
      })
      parsed.assertions.forEach((assertion) => {
        const source = resolveRelationHintEndpoint(relationIndex, assertion.normalizedSourceTitle, unit, warnings, {
          hint,
          role: 'source',
          lineIndex: assertion.lineIndex,
          refId: assertion.normalizedSourceRefId
        })
        const target = resolveRelationHintEndpoint(relationIndex, assertion.normalizedTargetTitle, unit, warnings, {
          hint,
          role: 'target',
          lineIndex: assertion.lineIndex,
          refId: assertion.normalizedTargetRefId
        })
        if (!source || !target) return
        const relation: RelationViewRecord = {
          relationId: buildRelationId('hint-declared', source.unitId, target.unitId, assertion.canonicalPredicateId),
          sourceUnitId: source.unitId,
          targetUnitId: target.unitId,
          predicateId: assertion.canonicalPredicateId,
          direction: assertion.direction,
          status: 'declared',
          evidence: [createHintEvidence(unit, hint)]
        }
        const relationKey = getNormalizedRelationKey(relation)
        if (existingKeys.has(relationKey)) {
          const duplicateEvidence = buildDuplicateRelationEvidence(existingRelationsByKey.get(relationKey), units)
          warnings.push({
            code: 'relation_hint_duplicate_relation',
            message: '关系提示归一后与已有关系重复，已跳过重复声明。',
            unitId: unit.unitId,
            sourceId: unit.sourceId,
            sourcePath: unit.sourcePath,
            details: {
              hint,
              lineIndex: assertion.lineIndex,
              sourceUnitId: source.unitId,
              targetUnitId: target.unitId,
              predicateId: assertion.canonicalPredicateId,
              duplicateEvidence
            }
          })
          return
        }
        existingKeys.add(relationKey)
        existingRelationsByKey.set(relationKey, relation)
        relations.push(relation)
      })
      parsed.legacyHints.forEach((legacyHint) => {
        const target = resolveRelationHintEndpoint(relationIndex, legacyHint.targetTitle, unit, warnings, {
          hint,
          role: 'target',
          lineIndex: legacyHint.lineIndex,
          excludeUnitId: unit.unitId,
          refId: legacyHint.targetRefId
        })
        if (!target) return
        const relation: RelationViewRecord = {
          relationId: buildRelationId('hint', unit.unitId, target.unitId, `${GENERAL_RELATED_TO_PREDICATE_ID}:${index}`),
          sourceUnitId: unit.unitId,
          targetUnitId: target.unitId,
          predicateId: GENERAL_RELATED_TO_PREDICATE_ID,
          direction: 'bidirectional',
          status: 'declared',
          evidence: [createHintEvidence(unit, hint)]
        }
        const relationKey = getNormalizedRelationKey(relation)
        if (existingKeys.has(relationKey)) {
          const duplicateEvidence = buildDuplicateRelationEvidence(existingRelationsByKey.get(relationKey), units)
          warnings.push({
            code: 'relation_hint_duplicate_relation',
            message: '关系提示归一后与已有关系重复，已跳过重复弱关系。',
            unitId: unit.unitId,
            sourceId: unit.sourceId,
            sourcePath: unit.sourcePath,
            details: {
              hint,
              lineIndex: legacyHint.lineIndex,
              sourceUnitId: unit.unitId,
              targetUnitId: target.unitId,
              predicateId: GENERAL_RELATED_TO_PREDICATE_ID,
              duplicateEvidence
            }
          })
          return
        }
        existingKeys.add(relationKey)
        existingRelationsByKey.set(relationKey, relation)
        relations.push(relation)
      })
    })
  })
  return dedupeRelations(relations)
}

function isSystemTraceDateUnit(node: CharacterBrainTraceNode) {
  return isFormalTraceDayNode(node)
    || node.systemRole === 'yearBranch'
    || node.systemRole === 'monthBranch'
    || node.systemRole === 'multiYearBranch'
    || node.systemRole === 'dayLeaf'
}

function resolveTraceUnitType(node: CharacterBrainTraceNode) {
  if (node.systemRole === 'eventLeaf') return 'traceEvent' as const
  if (node.systemRole === 'arrangementLeaf') return 'traceArrangement' as const
  return isFormalTraceDayNode(node) ? 'traceDay' as const : 'traceGroup' as const
}

function resolveTraceUnitContentKind(node: CharacterBrainTraceNode) {
  if (node.systemRole === 'eventLeaf' || node.systemRole === 'arrangementLeaf') return 'markdown' as const
  return isFormalTraceDayNode(node) ? 'markdown' as const : 'group' as const
}

function resolveTraceUnitTitle(node: CharacterBrainTraceNode) {
  const date = parseTraceUnitDate(node.pointDate || node.startDate || '')
  if (node.systemRole === 'multiYearBranch') return node.title || node.displayTitle || node.timeLabel || node.startDate
  if (node.systemRole === 'monthBranch' && date) return `${date.year}年${date.month}月`
  if (node.systemRole === 'dayLeaf' && date) return `${date.year}年${date.month}月${date.day}日`
  if (node.systemRole === 'yearBranch' && date) return `${date.year}年`
  return node.title || node.displayTitle || node.pointDate || node.startDate
}

function resolveTraceSidebarTitle(node: CharacterBrainTraceNode, fallbackTitle: string) {
  const date = parseTraceUnitDate(node.pointDate || node.startDate || '')
  if (node.systemRole === 'monthBranch' && date) return `${date.month}月`
  if (node.systemRole === 'dayLeaf' && date) return `${date.day}日`
  return fallbackTitle
}

function parseTraceUnitDate(input: string) {
  const match = String(input || '').trim().match(/^(\d{1,6})[-/年](\d{1,2})[-/月](\d{1,2})日?$/u)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

type RelationHintIndex = {
  byTitle: Map<string, UnitView[]>
  byRefId: Map<string, UnitView[]>
}

function appendIndexedUnit(index: Map<string, UnitView[]>, key: string, unit: UnitView) {
  if (!key) return
  const entries = index.get(key)
  if (!entries) {
    index.set(key, [unit])
    return
  }
  entries.push(unit)
}

function buildRelationHintIndex(units: UnitView[]): RelationHintIndex {
  const byTitle = new Map<string, UnitView[]>()
  const byRefId = new Map<string, UnitView[]>()
  const seenUnitIdsByRefId = new Map<string, Set<string>>()
  units.forEach((unit) => {
    const key = normalizeTitleKey(unit.title)
    appendIndexedUnit(byTitle, key, unit)
    getUnitRelationRefIds(unit).forEach((refId) => {
      const seenUnitIds = seenUnitIdsByRefId.get(refId) || new Set<string>()
      if (seenUnitIds.has(unit.unitId)) return
      seenUnitIds.add(unit.unitId)
      seenUnitIdsByRefId.set(refId, seenUnitIds)
      appendIndexedUnit(byRefId, refId, unit)
    })
  })
  return { byTitle, byRefId }
}

function resolveRelationHintEndpoint(
  index: RelationHintIndex,
  title: string,
  ownerUnit: UnitView,
  warnings: UnitViewAdapterWarning[],
  options: {
    hint: string
    role: 'source' | 'target'
    lineIndex?: number
    excludeUnitId?: string
    refId?: string
  }
) {
  const refId = String(options.refId || '').trim()
  if (refId) {
    const refMatches = (index.byRefId.get(refId) || [])
      .filter((item) => item.unitId !== options.excludeUnitId)
    if (refMatches.length === 1) return refMatches[0]
    if (refMatches.length > 1) {
      warnings.push({
        code: 'relation_hint_title_ambiguous',
        message: `关系提示${options.role === 'source' ? '源单位' : '目标单位'}精确引用仍有歧义，已跳过以避免误连：${title}@${refId}`,
        unitId: ownerUnit.unitId,
        sourceId: ownerUnit.sourceId,
        sourcePath: ownerUnit.sourcePath,
        details: {
          hint: options.hint,
          lineIndex: options.lineIndex,
          title,
          refId,
          role: options.role,
          matchedUnitIds: refMatches.map((item) => item.unitId),
          allMatchedUnitIds: refMatches.map((item) => item.unitId)
        }
      })
      return undefined
    }
    warnings.push({
      code: 'relation_hint_target_missing',
      message: `关系提示没有匹配到精确引用：${title}@${refId}`,
      unitId: ownerUnit.unitId,
      sourceId: ownerUnit.sourceId,
      sourcePath: ownerUnit.sourcePath,
      details: {
        hint: options.hint,
        lineIndex: options.lineIndex,
        title,
        refId,
        role: options.role
      }
    })
    return undefined
  }
  const matches = (index.byTitle.get(normalizeTitleKey(title)) || [])
    .filter((item) => item.unitId !== options.excludeUnitId)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    const ranked = rankRelationHintEndpointMatches(matches, ownerUnit)
    const best = ranked[0]
    const tiedBest = ranked.filter((item) => item.score === best.score)
    if (best.score > 0 && tiedBest.length === 1) return best.unit
    warnings.push({
      code: 'relation_hint_title_ambiguous',
      message: `关系提示${options.role === 'source' ? '源单位' : '目标单位'}端点仍有歧义，已跳过以避免误连：${title}`,
      unitId: ownerUnit.unitId,
      sourceId: ownerUnit.sourceId,
      sourcePath: ownerUnit.sourcePath,
      details: {
        hint: options.hint,
        lineIndex: options.lineIndex,
        title,
        role: options.role,
        matchedUnitIds: tiedBest.map((item) => item.unit.unitId),
        allMatchedUnitIds: matches.map((item) => item.unitId)
      }
    })
    return undefined
  }
  warnings.push({
    code: 'relation_hint_target_missing',
    message: `关系提示没有匹配到当前 UnitView 标题：${title}`,
    unitId: ownerUnit.unitId,
    sourceId: ownerUnit.sourceId,
    sourcePath: ownerUnit.sourcePath,
    details: {
      hint: options.hint,
      lineIndex: options.lineIndex,
      title,
      role: options.role
    }
  })
  return undefined
}

function rankRelationHintEndpointMatches(matches: UnitView[], ownerUnit: UnitView) {
  const ownerPath = normalizeRelationHintPath(ownerUnit.sourcePath)
  const ownerParentPath = getRelationHintParentPath(ownerPath)
  const ownerClusterPath = getRelationHintClusterPath(ownerPath)
  return matches
    .map((unit) => {
      const candidatePath = normalizeRelationHintPath(unit.sourcePath)
      const candidateParentPath = getRelationHintParentPath(candidatePath)
      const candidateClusterPath = getRelationHintClusterPath(candidatePath)
      let score = 0
      if (unit.unitId === ownerUnit.unitId) score += 1000
      if (candidatePath && ownerPath && candidatePath === ownerPath) score += 500
      if (candidateParentPath && ownerParentPath && candidateParentPath === ownerParentPath) score += 200
      if (candidateClusterPath && ownerClusterPath && candidateClusterPath === ownerClusterPath) score += 80
      if (candidatePath && ownerParentPath && candidatePath.startsWith(`${ownerParentPath}/`)) score += 30
      if (ownerPath && candidateParentPath && ownerPath.startsWith(`${candidateParentPath}/`)) score += 20
      return { unit, score }
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return String(left.unit.sourcePath || left.unit.title).localeCompare(String(right.unit.sourcePath || right.unit.title), 'zh-Hans-CN')
    })
}

function isDeclaredRelationHintRelation(relation: RelationViewRecord) {
  return relation.status === 'declared'
    && relation.evidence.some((evidence) => evidence.sourceType === 'compilePage')
}

function buildDuplicateRelationEvidence(relation: RelationViewRecord | undefined, units: UnitView[]) {
  if (!relation) return []
  const unitById = new Map(units.map((unit) => [unit.unitId, unit] as const))
  const unitBySourceId = new Map(units.map((unit) => [String(unit.sourceId || '').trim(), unit] as const))
  return relation.evidence
    .filter((evidence) => evidence.sourceType === 'compilePage')
    .map((evidence) => {
      const line = String(evidence.excerpt || '').trim()
      const sourceId = String(evidence.sourceId || '').trim()
      const owner = unitById.get(sourceId) || unitBySourceId.get(sourceId)
      return {
        ownerUnitId: owner?.unitId || sourceId,
        ownerTitle: owner?.title || sourceId,
        ownerPath: String(owner?.sourcePath || '').trim(),
        line,
        lineIndex: line ? findRelationHintLineIndexInUnit(owner, line) : undefined,
        sourceType: evidence.sourceType
      }
    })
    .filter((item) => item.line)
}

function findRelationHintLineIndexInUnit(unit: UnitView | undefined, line: string) {
  if (!unit || !line) return undefined
  const hints = Array.isArray(unit.compilePage?.relationHints) ? unit.compilePage.relationHints : []
  const index = hints.findIndex((hint) => String(hint || '').trim() === line)
  return index >= 0 ? index : undefined
}

function normalizeRelationHintPath(path: unknown) {
  return String(path || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/u, '')
}

function getRelationHintParentPath(path: string) {
  const cleanPath = normalizeRelationHintPath(path)
  if (!cleanPath) return ''
  const lastSlash = cleanPath.lastIndexOf('/')
  if (lastSlash <= 0) return ''
  return cleanPath.slice(0, lastSlash)
}

function getRelationHintClusterPath(path: string) {
  const cleanPath = normalizeRelationHintPath(path)
  const parts = cleanPath.split('/').filter(Boolean)
  return parts.length > 0 ? `/${parts[0]}` : ''
}

export function buildUnitViewValidationReport(
  result: UnitViewAdapterResult,
  options: { scope?: string; generatedAt?: string } = {}
): UnitViewValidationReport {
  const generatedAt = options.generatedAt || new Date().toISOString()
  const scope = options.scope || 'unit-view'
  const issues = [
    ...result.warnings.map((warning, index) => warningToValidationIssue(warning, index)),
    ...collectDuplicateSiblingTitleIssues(result.units),
    ...collectCompilePageIssues(result.units)
  ]
  const dedupedIssues = dedupeValidationIssues(issues)
  const summary = dedupedIssues.reduce((acc, issue) => {
    acc.total += 1
    if (issue.severity === 'blocker') acc.blockers += 1
    if (issue.severity === 'warning') acc.warnings += 1
    if (issue.severity === 'info') acc.info += 1
    if (issue.actionLevel === 'must_fix') acc.mustFix += 1
    if (issue.actionLevel === 'can_defer') acc.canDefer += 1
    if (issue.actionLevel === 'notice') acc.notices += 1
    return acc
  }, {
    total: 0,
    blockers: 0,
    warnings: 0,
    info: 0,
    mustFix: 0,
    canDefer: 0,
    notices: 0
  })

  return {
    scope,
    generatedAt,
    summary,
    issues: dedupedIssues.sort((left, right) => {
      const severityOrder = severityRank(left.severity) - severityRank(right.severity)
      if (severityOrder !== 0) return severityOrder
      return left.title.localeCompare(right.title, 'zh-Hans-CN')
    })
  }
}

export interface DocLibraryUnitViewComparisonReport {
  generatedAt: string
  summary: {
    legacyUnitCount: number
    fieldUnitCount: number
    legacyRelationCount: number
    fieldRelationCount: number
    documentUnitIdChangedCount: number
    folderUnitIdChangedCount: number
    parentMismatchCount: number
    candidateRelationMismatchCount: number
    warningCount: number
    blockerCount: number
  }
  issues: Array<{
    severity: 'blocker' | 'warning' | 'info'
    code: string
    message: string
    sourceId?: string
    sourcePath?: string
    expected?: string
    actual?: string
  }>
}

export function buildDocLibraryUnitViewComparisonReport(input: {
  documents: BrainDocumentRecord[]
  manualTreeOrders?: ManualTreeOrders
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
  generatedAt?: string
}): DocLibraryUnitViewComparisonReport {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const legacy = buildDocLibraryPathUnitView(input.documents, input.manualTreeOrders || {})
  const field = buildDocLibraryUnitView(input.documents, input.manualTreeOrders || {}, {
    treeNodes: input.treeNodes,
    treeOrders: input.treeOrders,
    treeDiffReport: input.treeDiffReport
  })
  const issues: DocLibraryUnitViewComparisonReport['issues'] = []
  const legacyUnitsByDocumentId = mapDocUnitsBySourceId(legacy.units)
  const fieldUnitsByDocumentId = mapDocUnitsBySourceId(field.units)
  legacyUnitsByDocumentId.forEach((legacyUnit, documentId) => {
    const fieldUnit = fieldUnitsByDocumentId.get(documentId)
    if (!fieldUnit) {
      issues.push({
        severity: 'blocker',
        code: 'document_unit_missing',
        message: '字段树 UnitView 缺少文档单位。',
        sourceId: documentId,
        sourcePath: legacyUnit.sourcePath
      })
      return
    }
    if (fieldUnit.metadata?.treeSource === 'fieldTreeFallback') {
      issues.push({
        severity: 'blocker',
        code: 'document_unit_missing',
        message: '字段树 UnitView 没有正式文档节点，只能用根级兜底单位。',
        sourceId: documentId,
        sourcePath: legacyUnit.sourcePath
      })
    }
    if (legacyUnit.unitId !== fieldUnit.unitId) {
      issues.push({
        severity: 'blocker',
        code: 'document_unit_id_changed',
        message: '字段树 UnitView 改变了文档单位 ID。',
        sourceId: documentId,
        sourcePath: legacyUnit.sourcePath,
        expected: legacyUnit.unitId,
        actual: fieldUnit.unitId
      })
    }
  })

  const legacyFoldersByPath = mapFolderUnitsBySourcePath(legacy.units)
  const fieldFoldersByPath = mapFolderUnitsBySourcePath(field.units)
  legacyFoldersByPath.forEach((legacyUnit, folderPath) => {
    const fieldUnit = fieldFoldersByPath.get(folderPath)
    if (!fieldUnit) {
      issues.push({
        severity: 'warning',
        code: 'folder_unit_missing',
        message: '字段树 UnitView 缺少旧路径可对应的文件夹单位。',
        sourcePath: folderPath,
        expected: legacyUnit.unitId
      })
      return
    }
    if (legacyUnit.unitId !== fieldUnit.unitId) {
      issues.push({
        severity: 'info',
        code: 'folder_unit_id_changed',
        message: '文件夹单位 ID 已由字段树 nodeId 接管。',
        sourceId: fieldUnit.sourceId,
        sourcePath: folderPath,
        expected: legacyUnit.unitId,
        actual: fieldUnit.unitId
      })
    }
  })

  compareParentPaths(legacy.units, field.units).forEach((issue) => issues.push(issue))
  compareCandidateRelationKeys(legacy.relations, field.relations).forEach((issue) => issues.push(issue))

  const blockerCount = issues.filter((issue) => issue.severity === 'blocker').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length + field.warnings.length
  return {
    generatedAt,
    summary: {
      legacyUnitCount: legacy.units.length,
      fieldUnitCount: field.units.length,
      legacyRelationCount: legacy.relations.length,
      fieldRelationCount: field.relations.length,
      documentUnitIdChangedCount: issues.filter((issue) => issue.code === 'document_unit_id_changed').length,
      folderUnitIdChangedCount: issues.filter((issue) => issue.code === 'folder_unit_id_changed').length,
      parentMismatchCount: issues.filter((issue) => issue.code === 'unit_parent_mismatch').length,
      candidateRelationMismatchCount: issues.filter((issue) => issue.code === 'candidate_relation_missing' || issue.code === 'candidate_relation_added').length,
      warningCount,
      blockerCount
    },
    issues
  }
}

export function renderDocLibraryUnitViewComparisonReport(report: DocLibraryUnitViewComparisonReport): string {
  const lines = [
    '# 文档库 UnitView 字段树对比报告',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 摘要',
    '',
    `- 旧路径 Unit 数：${report.summary.legacyUnitCount}`,
    `- 字段树 Unit 数：${report.summary.fieldUnitCount}`,
    `- 旧路径关系数：${report.summary.legacyRelationCount}`,
    `- 字段树关系数：${report.summary.fieldRelationCount}`,
    `- 文档单位 ID 变化：${report.summary.documentUnitIdChangedCount}`,
    `- 文件夹单位 ID 变化：${report.summary.folderUnitIdChangedCount}`,
    `- 父子关系不一致：${report.summary.parentMismatchCount}`,
    `- 候选关系差异：${report.summary.candidateRelationMismatchCount}`,
    `- blocker：${report.summary.blockerCount}`,
    `- warning：${report.summary.warningCount}`,
    '',
    '## 问题明细',
    ''
  ]
  if (!report.issues.length) {
    lines.push('未发现 UnitView 字段树切换差异。')
  } else {
    report.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${issue.severity}] ${issue.code}：${issue.message}`)
      if (issue.sourceId) lines.push(`   - sourceId：${issue.sourceId}`)
      if (issue.sourcePath) lines.push(`   - sourcePath：${issue.sourcePath}`)
      if (issue.expected !== undefined) lines.push(`   - expected：${issue.expected}`)
      if (issue.actual !== undefined) lines.push(`   - actual：${issue.actual}`)
    })
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function mapDocUnitsBySourceId(units: UnitView[]) {
  const map = new Map<string, UnitView>()
  units
    .filter((unit) => unit.domain === 'docLibrary' && unit.unitType === 'leaf')
    .forEach((unit) => {
      const sourceId = String(unit.sourceId || '').trim()
      if (sourceId) map.set(sourceId, unit)
    })
  return map
}

function mapFolderUnitsBySourcePath(units: UnitView[]) {
  const map = new Map<string, UnitView>()
  units
    .filter((unit) => unit.domain === 'docLibrary' && (unit.unitType === 'cluster' || unit.unitType === 'branch'))
    .forEach((unit) => {
      const sourcePath = normalizeFolderPath(String(unit.sourcePath || '').trim())
      if (sourcePath) map.set(sourcePath, unit)
    })
  return map
}

function compareParentPaths(legacyUnits: UnitView[], fieldUnits: UnitView[]): DocLibraryUnitViewComparisonReport['issues'] {
  const issues: DocLibraryUnitViewComparisonReport['issues'] = []
  const legacyComparable = new Map<string, UnitView>()
  legacyUnits.forEach((unit) => {
    const key = getComparableUnitKey(unit)
    if (key) legacyComparable.set(key, unit)
  })
  const fieldComparable = new Map<string, UnitView>()
  fieldUnits.forEach((unit) => {
    const key = getComparableUnitKey(unit)
    if (key) fieldComparable.set(key, unit)
  })
  const legacyById = new Map(legacyUnits.map((unit) => [unit.unitId, unit] as const))
  const fieldById = new Map(fieldUnits.map((unit) => [unit.unitId, unit] as const))
  legacyComparable.forEach((legacyUnit, key) => {
    const fieldUnit = fieldComparable.get(key)
    if (!fieldUnit) return
    const legacyParentKey = getComparableParentKey(legacyUnit, legacyById)
    const fieldParentKey = getComparableParentKey(fieldUnit, fieldById)
    if (legacyParentKey === fieldParentKey) return
    issues.push({
      severity: 'blocker',
      code: 'unit_parent_mismatch',
      message: '字段树 UnitView 的父级与旧路径 UnitView 不一致。',
      sourceId: fieldUnit.sourceId || legacyUnit.sourceId,
      sourcePath: fieldUnit.sourcePath || legacyUnit.sourcePath,
      expected: legacyParentKey,
      actual: fieldParentKey
    })
  })
  return issues
}

function compareCandidateRelationKeys(
  legacyRelations: RelationViewRecord[],
  fieldRelations: RelationViewRecord[]
): DocLibraryUnitViewComparisonReport['issues'] {
  const issues: DocLibraryUnitViewComparisonReport['issues'] = []
  const legacyKeys = new Set(legacyRelations.filter((relation) => relation.status === 'candidate').map(getRelationComparisonKey))
  const fieldKeys = new Set(fieldRelations.filter((relation) => relation.status === 'candidate').map(getRelationComparisonKey))
  legacyKeys.forEach((key) => {
    if (fieldKeys.has(key)) return
    issues.push({
      severity: 'warning',
      code: 'candidate_relation_missing',
      message: '字段树 UnitView 缺少旧路径 UnitView 中的一条候选关系。',
      expected: key
    })
  })
  fieldKeys.forEach((key) => {
    if (legacyKeys.has(key)) return
    issues.push({
      severity: 'warning',
      code: 'candidate_relation_added',
      message: '字段树 UnitView 新增了一条旧路径 UnitView 没有的候选关系。',
      actual: key
    })
  })
  return issues
}

function getComparableUnitKey(unit: UnitView) {
  if (unit.unitType === 'root') return 'root:doc-tree'
  if (unit.unitType === 'leaf') return `doc:${String(unit.sourceId || '').trim()}`
  if (unit.unitType === 'cluster' || unit.unitType === 'branch') {
    const sourcePath = normalizeFolderPath(String(unit.sourcePath || '').trim())
    return sourcePath ? `folder:${sourcePath}` : ''
  }
  return ''
}

function getComparableParentKey(unit: UnitView, unitById: Map<string, UnitView>) {
  if (!unit.parentId) return ''
  const parent = unitById.get(unit.parentId)
  return parent ? getComparableUnitKey(parent) : unit.parentId
}

function getRelationComparisonKey(relation: RelationViewRecord) {
  return [
    relation.sourceUnitId,
    relation.targetUnitId,
    relation.predicateId,
    relation.status
  ].join('\u0000')
}

function buildManualOrderIndex(manualTreeOrders: ManualTreeOrders) {
  const map = new Map<string, number>()
  Object.entries(manualTreeOrders || {}).forEach(([parentId, entries]) => {
    if (!Array.isArray(entries)) return
    entries.forEach((entryId, index) => {
      const normalizedEntryId = String(entryId || '').trim()
      if (!normalizedEntryId) return
      map.set(`${parentId}\u0000${normalizedEntryId}`, index)
    })
  })
  return map
}

function buildFieldTreeOrderIndex(treeOrders: DocTreeOrders) {
  const map = new Map<string, number>()
  Object.entries(treeOrders || {}).forEach(([parentNodeId, childNodeIds]) => {
    if (!Array.isArray(childNodeIds)) return
    childNodeIds.forEach((childNodeId, index) => {
      const normalizedChildId = String(childNodeId || '').trim()
      if (!normalizedChildId) return
      map.set(`${String(parentNodeId || '').trim()}\u0000${normalizedChildId}`, index)
    })
  })
  return map
}

function canUseDocLibraryFieldTree(options: {
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
}) {
  return Array.isArray(options.treeNodes)
    && options.treeNodes.length > 0
    && options.treeDiffReport?.canUseFieldTree !== false
}

function normalizeDocTreeNodesForUnitView(treeNodes: DocTreeNodeRecord[]) {
  return treeNodes
    .filter((node) => node && typeof node === 'object')
    .map((node) => ({
      ...node,
      nodeId: String(node.nodeId || '').trim(),
      parentId: node.parentId === null ? null : String(node.parentId || '').trim(),
      title: String(node.title || '').trim(),
      documentId: String(node.documentId || '').trim() || undefined,
      legacyDisplayPath: normalizeFolderPath(String(node.legacyDisplayPath || '').trim())
    }))
    .filter((node) => node.nodeId && node.nodeId !== DOC_ROOT_UNIT_ID && node.status !== 'deleted')
}

function resolveFieldTreeParentUnitId(
  node: DocTreeNodeRecord,
  nodeById: Map<string, DocTreeNodeRecord>,
  warnings: UnitViewAdapterWarning[]
) {
  const parentId = String(node.parentId || DOC_ROOT_UNIT_ID).trim() || DOC_ROOT_UNIT_ID
  if (parentId === DOC_ROOT_UNIT_ID) return DOC_ROOT_UNIT_ID
  const parent = nodeById.get(parentId)
  if (parent?.nodeKind === 'folder') return parent.nodeId
  warnings.push({
    code: 'doc_field_tree_missing_parent',
    message: '字段树节点缺少可用父级，UnitView 已挂到世界树根。',
    sourceId: node.nodeId,
    sourcePath: node.legacyDisplayPath,
    details: { parentId }
  })
  return DOC_ROOT_UNIT_ID
}

function rebuildFieldTreeFolderPath(node: DocTreeNodeRecord, nodeById: Map<string, DocTreeNodeRecord>) {
  if (node.legacyDisplayPath) return normalizeFolderPath(node.legacyDisplayPath)
  const names = [node.title]
  let currentParentId = node.parentId
  const visited = new Set<string>()
  while (currentParentId && currentParentId !== DOC_ROOT_UNIT_ID && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = nodeById.get(currentParentId)
    if (!parent) break
    names.unshift(parent.title)
    currentParentId = parent.parentId
  }
  return normalizeFolderPath(`/${names.filter(Boolean).join('/')}`)
}

function collectManualOrderOrphans(manualTreeOrders: ManualTreeOrders, units: UnitView[]): UnitViewAdapterWarning[] {
  const knownEntries = new Set<string>()
  units.forEach((unit) => {
    if (unit.unitId.startsWith('doc-tree:')) {
      const path = unit.sourcePath || unit.sourceId || ''
      if (path) knownEntries.add(`folder:${path}`)
    }
    if (unit.unitId.startsWith('doc:')) {
      knownEntries.add(`document:${unit.sourceId || unit.unitId.replace(/^doc:/, '')}`)
    }
  })
  const warnings: UnitViewAdapterWarning[] = []
  Object.entries(manualTreeOrders || {}).forEach(([parentId, entries]) => {
    if (!Array.isArray(entries)) return
    entries.forEach((entryId) => {
      const normalizedEntryId = String(entryId || '').trim()
      if (!normalizedEntryId || knownEntries.has(normalizedEntryId)) return
      warnings.push({
        code: 'manual_order_orphan',
        message: '排序桶里存在当前树读不到的条目。',
        sourceId: parentId,
        details: { entryId: normalizedEntryId }
      })
    })
  })
  return warnings
}

function warningToValidationIssue(warning: UnitViewAdapterWarning, index: number): UnitViewValidationIssue {
  const code = warning.code
  const base = {
    issueId: `${code}:${warning.unitId || warning.sourceId || warning.sourcePath || index}`,
    code,
    unitId: warning.unitId,
    sourceId: warning.sourceId,
    sourcePath: warning.sourcePath,
    details: warning.details
  }
  switch (code) {
    case 'doc_empty_path':
      return {
        ...base,
        severity: 'blocker',
        actionLevel: 'must_fix',
        title: '文档缺少路径',
        problem: warning.message,
        impact: '文档无法稳定进入树，后续召回和关系投影可能找不到它的归属。',
        suggestion: '给这个文档补一个唯一 displayPath，再重新生成 UnitView。'
      }
    case 'doc_duplicate_path':
      return {
        ...base,
        severity: 'blocker',
        actionLevel: 'must_fix',
        title: '文档路径重复',
        problem: warning.message,
        impact: '两个文档会被读成同一个树位置，移动、排序、召回都可能混淆。',
        suggestion: '保留其中一个路径，给另一个文档改成同父级下唯一路径。'
      }
    case 'doc_missing_compile_page':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'can_defer',
        title: '文档缺少公共编译页',
        problem: warning.message,
        impact: '当前可用顶层摘要和标签兜底，但关系候选和召回质量会变差。',
        suggestion: '整理文档时补齐公共编译页的 summary、tags、relationHints。'
      }
    case 'manual_order_orphan':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'can_defer',
        title: '排序桶引用了不存在的条目',
        problem: warning.message,
        impact: '树展示可能仍能工作，但排序配置里有废项，后续迁移时会制造噪音。',
        suggestion: '清理排序配置中当前树读不到的 entryId。'
      }
    case 'character_brain_orphan_node':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'can_defer',
        title: '角色大脑节点父级不存在',
        problem: warning.message,
        impact: '读取层会把它放回分区根下，但真实父子关系已经不可靠。',
        suggestion: '确认这个节点应该属于哪个父级，再修正 parentId。'
      }
    case 'trace_non_day_unit':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'must_fix',
        title: '轨迹存在非日正式节点',
        problem: warning.message,
        impact: '新轨迹真值要求正式时间单位只有日节点，非日节点后续必须转为组。',
        suggestion: '迁移时把它改为组单位，组内挂日节点。'
      }
    case 'trace_range_unit':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'must_fix',
        title: '轨迹存在范围节点',
        problem: warning.message,
        impact: '范围节点混合了时间单位和组概念，和新模型冲突。',
        suggestion: '迁移时把范围节点拆成日节点集合，或转成只负责归纳的组单位。'
      }
    case 'trace_inner_entries':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'must_fix',
        title: '轨迹节点含内部条目',
        problem: warning.message,
        impact: '内部条目不是独立时间节点，后续需要改为组内子节点或日节点。',
        suggestion: '迁移时把 innerEntries 提升为可展开的组内子项。'
      }
    case 'brain_link_target_missing':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'can_defer',
        title: '角色大脑链接目标不存在',
        problem: warning.message,
        impact: '关系候选无法生成完整边，关系视图会少一条连接。',
        suggestion: '删除无效目标，或恢复对应节点后再生成关系候选。'
      }
    case 'relation_hint_invalid_predicate':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'must_fix',
        title: '关系提示谓词非法',
        problem: warning.message,
        impact: '该强关系不会进入声明关系，避免非法关系词污染关系网和召回。',
        suggestion: '从受控谓词词典中选择合法谓词，或先扩展词典后再保存。'
      }
    case 'relation_hint_invalid_format':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'can_defer',
        title: '关系提示格式无效',
        problem: warning.message,
        impact: '该行不会进入强关系解析，也不会降级成普通相关关系。',
        suggestion: '改成 `[[源单位]]_关系词_[[目标单位]]`，或只保留单个 `[[文档名]]` 作为弱提示。'
      }
    case 'relation_hint_title_ambiguous':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'must_fix',
        title: '关系提示端点歧义',
        problem: warning.message,
        impact: '系统不会在上下文仍不唯一时自动猜端点，避免把声明关系连到错误单位。',
        suggestion: '补充更明确的单位上下文，或后续使用稳定 ID / 选择器入口写入关系。'
      }
    case 'relation_hint_duplicate_relation':
      return {
        ...base,
        severity: 'info',
        actionLevel: 'notice',
        title: '关系提示重复',
        problem: warning.message,
        impact: '重复声明已跳过，关系视图和召回不会多出一条同义边。',
        suggestion: '可删除重复行，或保留原有关系作为唯一证据。'
      }
    case 'relation_hint_target_missing':
      return {
        ...base,
        severity: 'info',
        actionLevel: 'notice',
        title: '关系提示暂未匹配目标',
        problem: warning.message,
        impact: '关系候选不会自动生成，但正文和编译页本身不受影响。',
        suggestion: '确认目标标题是否已存在；如果只是未来资料，可以暂时保留。'
      }
    case 'duplicate_sibling_title':
      return {
        ...base,
        severity: 'warning',
        actionLevel: 'can_defer',
        title: '同父级标题重复',
        problem: warning.message,
        impact: '用户阅读时会难以区分，关系提示按标题匹配时也可能误连。',
        suggestion: '给同父级重复标题补更明确的名称。'
      }
    case 'compile_page_incomplete':
      return {
        ...base,
        severity: 'info',
        actionLevel: 'notice',
        title: '编译页字段不完整',
        problem: warning.message,
        impact: '召回和关系候选仍可运行，但摘要、标签或关系提示可能不够稳定。',
        suggestion: '后续整理文档或角色大脑节点时补齐 summary、tags、relationHints。'
      }
    default:
      return {
        ...base,
        severity: 'info',
        actionLevel: 'notice',
        title: '读取校验提醒',
        problem: warning.message,
        impact: '当前只作为读取层提醒。',
        suggestion: '进入对应迁移批次时再处理。'
      }
  }
}

function collectDuplicateSiblingTitleIssues(units: UnitView[]): UnitViewValidationIssue[] {
  const groups = new Map<string, UnitView[]>()
  units.forEach((unit) => {
    const parentId = unit.parentId || '__root__'
    const titleKey = normalizeTitleKey(unit.title)
    if (!titleKey) return
    const key = `${parentId}\u0000${titleKey}`
    groups.set(key, [...(groups.get(key) || []), unit])
  })
  const issues: UnitViewValidationIssue[] = []
  groups.forEach((items) => {
    if (items.length < 2) return
    const [first] = items
    issues.push(warningToValidationIssue({
      code: 'duplicate_sibling_title',
      message: `同父级下存在重复标题：${first.title}`,
      unitId: first.unitId,
      sourceId: first.sourceId,
      sourcePath: first.sourcePath,
      details: {
        parentId: first.parentId,
        title: first.title,
        unitIds: items.map((item) => item.unitId)
      }
    }, issues.length))
  })
  return issues
}

function collectCompilePageIssues(units: UnitView[]): UnitViewValidationIssue[] {
  const issues: UnitViewValidationIssue[] = []
  units.forEach((unit) => {
    if (!unit.compilePage) return
    const missing: string[] = []
    if (!unit.compilePage.summary.trim()) missing.push('summary')
    if (!Array.isArray(unit.compilePage.tags)) missing.push('tags')
    if (!Array.isArray(unit.compilePage.relationHints)) missing.push('relationHints')
    if (!missing.length) return
    issues.push(warningToValidationIssue({
      code: 'compile_page_incomplete',
      message: `编译页字段不完整：${missing.join(', ')}`,
      unitId: unit.unitId,
      sourceId: unit.sourceId,
      sourcePath: unit.sourcePath,
      details: { missing }
    }, issues.length))
  })
  return issues
}

function dedupeValidationIssues(issues: UnitViewValidationIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = [
      issue.code,
      issue.unitId,
      issue.sourceId,
      issue.sourcePath,
      JSON.stringify(issue.details || {})
    ].join('\u0000')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function severityRank(severity: UnitViewValidationIssue['severity']) {
  if (severity === 'blocker') return 0
  if (severity === 'warning') return 1
  return 2
}

function readDocumentCompilePage(document: BrainDocumentRecord): UnitViewCompilePage {
  const page = document.publicCompilePage
  return {
    summary: String(page?.summary ?? document.summary ?? '').trim(),
    tags: normalizeStringList(page?.tags ?? document.tags),
    relationHints: normalizeStringList(page?.relationHints),
    updatedAt: String(page?.updatedAt ?? document.updatedAt ?? '').trim() || undefined
  }
}

function createRootUnit(unitId: string, domain: UnitView['domain'], title: string): UnitView {
  return {
    unitId,
    domain,
    unitType: 'root',
    contentKind: 'group',
    title,
    status: 'normal'
  }
}

function createBrainRootUnit(
  unitId: string,
  parentId: string,
  characterId: string,
  title: string,
  unitType: UnitViewType,
  orderIndex: number,
  sourceId = `${characterId}:${unitType}`,
  body = ''
): UnitView {
  return {
    unitId,
    domain: 'characterBrain',
    unitType,
    contentKind: 'group',
    title,
    parentId,
    orderIndex,
    sourceId,
    body,
    status: 'normal'
  }
}

function buildDocUnitId(documentId: string) {
  return `doc:${encodeUnitSegment(documentId)}`
}

function getDocumentId(document: BrainDocumentRecord) {
  return String(document.documentId || document.id || document.stableId || '').trim()
}

function buildDocFolderUnitId(folderPath: string) {
  return `doc-tree:${encodeUnitSegment(normalizeFolderPath(folderPath))}`
}

function buildBrainUnitId(characterId: string, nodeId: string) {
  return `brain:${encodeUnitSegment(characterId)}:${encodeUnitSegment(nodeId)}`
}

function buildCoreBrainRelationRefId(characterId: string, nodeId: string) {
  const compactNodeId = String(nodeId || '').trim().replace(/^brain:/, '')
  if (!characterId || !compactNodeId) return ''
  return `brain:${encodeUnitSegment(`${characterId}:${compactNodeId}`)}`
}

function buildBrainTraceUnitId(characterId: string, node: CharacterBrainTraceNode) {
  if (isFormalTraceDayNode(node)) {
    const date = node.pointDate || node.startDate || node.id
    return `trace:${encodeUnitSegment(characterId)}:day:${encodeUnitSegment(date)}`
  }
  if (node.systemRole === 'eventLeaf') {
    return `trace:${encodeUnitSegment(characterId)}:event:${encodeUnitSegment(node.id)}`
  }
  if (node.systemRole === 'arrangementLeaf') {
    return `trace:${encodeUnitSegment(characterId)}:arrangement:${encodeUnitSegment(node.id)}`
  }
  return `trace:${encodeUnitSegment(characterId)}:group:${encodeUnitSegment(node.id)}`
}

function buildBrainTraceParentUnitId(characterId: string, parentNodeId: string, traceById: Map<string, CharacterBrainTraceNode>) {
  const parentNode = traceById.get(parentNodeId)
  return parentNode ? buildBrainTraceUnitId(characterId, parentNode) : buildBrainUnitId(characterId, TRACE_ROOT_ID)
}

function buildDocumentReferencePathProjection(
  characterId: string,
  cognitionNodes: Array<{
    id: string
    title: string
    parentId?: string
    kind?: string
    sourceDisplayPath?: string
  }>
) {
  const virtualUnits: UnitView[] = []
  const parentByNodeId = new Map<string, string>()
  const orderByNodeId = new Map<string, number>()
  const hiddenIndexNodeIds = new Set<string>()
  const pathToUnitId = new Map<string, string>()
  const pathToParentNodeId = new Map<string, string>()
  const syntheticPaths = new Set<string>()

  cognitionNodes.forEach((node) => {
    const path = normalizeWorldTreePath(node.sourceDisplayPath)
    if (!path) return
    const unitId = buildBrainUnitId(characterId, node.id)
    if (node.kind === 'group') {
      pathToUnitId.set(path, unitId)
      pathToParentNodeId.set(path, node.id)
      return
    }
    if (isPathBackedDocumentNode(node) && isIndexMarkdownPath(path)) {
      const folderPath = parentFolderPath(path)
      if (folderPath) {
        if (pathToUnitId.has(folderPath)) {
          hiddenIndexNodeIds.add(node.id)
        } else {
          pathToUnitId.set(folderPath, unitId)
          pathToParentNodeId.set(folderPath, node.id)
        }
      }
    }
  })

  const ensureFolderUnit = (folderPath: string, ancestorNodeId: string, ancestorPath: string) => {
    const path = normalizeWorldTreePath(folderPath)
    if (!path) return ''
    const existing = pathToUnitId.get(path)
    if (existing) return existing

    const parentPath = parentFolderPath(path)
    const parentUnitId = parentPath && parentPath !== path && parentPath.startsWith(ancestorPath)
      ? ensureFolderUnit(parentPath, ancestorNodeId, ancestorPath)
      : buildBrainUnitId(characterId, ancestorNodeId)

    const unitId = buildVirtualReferenceFolderUnitId(characterId, ancestorNodeId, path)
    if (!syntheticPaths.has(path)) {
      const depthOffset = Math.max(0, splitDisplayPath(path).length - splitDisplayPath(ancestorPath).length)
      virtualUnits.push({
        unitId,
        domain: 'characterBrain',
        unitType: 'branch',
        contentKind: 'group',
        title: lastPathSegment(path),
        parentId: parentUnitId,
        orderIndex: depthOffset * 100,
        sourceId: `virtual-doc-folder:${path}`,
        sourcePath: path,
        status: 'normal',
        metadata: {
          kind: 'virtualDocFolder',
          sourceDisplayPath: path
        }
      })
      syntheticPaths.add(path)
    }
    pathToUnitId.set(path, unitId)
    return unitId
  }

  const referenceNodes = cognitionNodes
    .filter((node) => (
      isPathBackedDocumentNode(node)
      && normalizeWorldTreePath(node.sourceDisplayPath)
      && !hiddenIndexNodeIds.has(node.id)
    ))

  referenceNodes.forEach((node) => {
    const path = normalizeWorldTreePath(node.sourceDisplayPath)
    const documentFolderPath = isIndexMarkdownPath(path) ? parentFolderPath(parentFolderPath(path)) : parentFolderPath(path)
    if (!documentFolderPath) return

    const ancestor = findNearestSourcePathAncestor(documentFolderPath, pathToParentNodeId)
    if (!ancestor) return
    const parentUnitId = documentFolderPath === ancestor.path
      ? buildBrainUnitId(characterId, ancestor.nodeId)
      : ensureFolderUnit(documentFolderPath, ancestor.nodeId, ancestor.path)
    if (parentUnitId) parentByNodeId.set(node.id, parentUnitId)
    orderByNodeId.set(node.id, isIndexMarkdownPath(path) ? 0 : 1000 + referenceNodes.indexOf(node))
  })

  return { virtualUnits, parentByNodeId, orderByNodeId, hiddenIndexNodeIds }
}

function isPathBackedDocumentNode(node: { kind?: string; sourceDisplayPath?: string }) {
  return (node.kind === 'reference' || node.kind === 'private') && Boolean(normalizeWorldTreePath(node.sourceDisplayPath))
}

function normalizeWorldTreePath(path: unknown) {
  const normalized = normalizeDocLibraryDisplayPath(String(path || '').replace(/\\/g, '/'))
  if (!normalized) return ''
  return normalized.startsWith('/世界树/') || normalized === '/世界树'
    ? normalized
    : `/世界树${normalized}`
}

function isIndexMarkdownPath(path: string) {
  return /\/index\.md$/i.test(path)
}

function parentFolderPath(path: string) {
  const segments = splitDisplayPath(path)
  if (segments.length <= 1) return ''
  return `/${segments.slice(0, -1).join('/')}`
}

function lastPathSegment(path: string) {
  const segments = splitDisplayPath(path)
  return stripMarkdownExtension(segments[segments.length - 1] || '')
}

function findNearestSourcePathAncestor(path: string, pathToParentNodeId: Map<string, string>) {
  const segments = splitDisplayPath(path)
  for (let length = segments.length; length > 0; length -= 1) {
    const candidate = `/${segments.slice(0, length).join('/')}`
    const nodeId = pathToParentNodeId.get(candidate)
    if (nodeId) return { path: candidate, nodeId }
  }
  return null
}

function buildVirtualReferenceFolderUnitId(characterId: string, ancestorNodeId: string, path: string) {
  return `brain-virtual-folder:${encodeUnitSegment(characterId)}:${encodeUnitSegment(ancestorNodeId)}:${encodeUnitSegment(path)}`
}

function buildRelationId(prefix: string, sourceUnitId: string, targetUnitId: string, predicateId: string) {
  return `relation:${prefix}:${encodeUnitSegment(sourceUnitId)}:${encodeUnitSegment(predicateId)}:${encodeUnitSegment(targetUnitId)}`
}

function encodeUnitSegment(value: string) {
  return encodeURIComponent(String(value || '').trim()).replace(/%/g, '~')
}

function normalizeFolderPath(folderPath: string) {
  return normalizeDocLibraryFolderPath(folderPath)
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean)
  return []
}

function normalizeCompilePage(page: { summary: string; tags: string[]; relationHints: string[]; updatedAt?: string }): UnitViewCompilePage {
  return {
    summary: String(page.summary || '').trim(),
    tags: normalizeStringList(page.tags),
    relationHints: normalizeStringList(page.relationHints),
    updatedAt: String(page.updatedAt || '').trim() || undefined
  }
}

function readCoreFieldValue(character: Character, fieldKey: CharacterBrainFieldKey) {
  switch (fieldKey) {
    case 'avatarPath':
      return String(character.avatarPath ?? character.avatar_path ?? '').trim()
    case 'defaultPreset':
      return String(character.defaultPreset ?? character.default_preset ?? '').trim()
    case 'defaultModel':
      return String(character.defaultModel ?? character.default_model ?? '').trim()
    case 'speakingStyle':
      return String(character.speakingStyle ?? character.speaking_style ?? '').trim()
    case 'nicknames':
      return Array.isArray(character.nicknames) ? character.nicknames.join('，') : String(character.nicknames || '').trim()
    default:
      return String(character[fieldKey as keyof Character] ?? '').trim()
  }
}

function collectTraceWarnings(
  node: CharacterBrainTraceNode,
  unitId: string,
  warnings: UnitViewAdapterWarning[]
) {
  if (node.kind !== 'day' || node.granularity !== 'day') {
    warnings.push({
      code: 'trace_non_day_unit',
      message: '轨迹存在非日正式节点，后续需要迁为组单位。',
      unitId,
      sourceId: node.id,
      details: { kind: node.kind, granularity: node.granularity }
    })
  }
  if (node.nodeType === 'range') {
    warnings.push({
      code: 'trace_range_unit',
      message: '轨迹存在 range 节点，后续需要迁为组单位或日节点集合。',
      unitId,
      sourceId: node.id,
      details: { startDate: node.startDate, endDate: node.endDate }
    })
  }
  if (Array.isArray(node.innerEntries) && node.innerEntries.length > 0) {
    warnings.push({
      code: 'trace_inner_entries',
      message: '轨迹节点含 innerEntries，后续需要迁为组内子项。',
      unitId,
      sourceId: node.id,
      details: { count: node.innerEntries.length }
    })
  }
}

function parseBrainLinks(character: Character): Record<string, string[]> {
  const raw = character.brainLinks ?? character.brain_links
  const parsed = typeof raw === 'string' ? parseJsonRecord(raw) : raw
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const links: Record<string, string[]> = {}
  Object.entries(parsed as Record<string, unknown>).forEach(([sourceId, rawTargets]) => {
    const targets = normalizeStringList(rawTargets)
    if (sourceId && targets.length) links[sourceId] = targets
  })
  return links
}

function buildBrainLinkCandidates(
  character: Character,
  unitIdBySourceId: Map<string, string>,
  unitIds: Set<string>,
  warnings: UnitViewAdapterWarning[]
) {
  const candidates: RelationViewRecord[] = []
  Object.entries(parseBrainLinks(character)).forEach(([sourceNodeId, targetNodeIds]) => {
    const sourceUnitId = unitIdBySourceId.get(sourceNodeId) || ''
    if (!unitIds.has(sourceUnitId)) return
    targetNodeIds.forEach((targetNodeId) => {
      const targetUnitId = unitIdBySourceId.get(targetNodeId) || ''
      if (!unitIds.has(targetUnitId)) {
        warnings.push({
          code: 'brain_link_target_missing',
          message: 'brainLinks 指向当前 UnitView 读不到的节点。',
          unitId: sourceUnitId,
          sourceId: sourceNodeId,
          details: { targetNodeId }
        })
        return
      }
      candidates.push({
        relationId: buildRelationId('brain-link', sourceUnitId, targetUnitId, GENERAL_RELATED_TO_PREDICATE_ID),
        sourceUnitId,
        targetUnitId,
        predicateId: GENERAL_RELATED_TO_PREDICATE_ID,
        direction: 'bidirectional',
        status: 'candidate',
        evidence: [{ sourceType: 'brain', sourceId: sourceNodeId }]
      })
    })
  })
  return dedupeRelations(candidates)
}

function createHintEvidence(unit: UnitView, hint: string): RelationViewEvidence {
  return {
    sourceType: 'compilePage',
    sourceId: unit.sourceId || unit.unitId,
    excerpt: hint
  }
}

function normalizeTitleKey(title: string) {
  return String(title || '').trim().toLocaleLowerCase('zh-Hans-CN')
}

function parseJsonRecord(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function dedupeRelations(relations: RelationViewRecord[]) {
  const seen = new Set<string>()
  return relations.filter((relation) => {
    const key = getNormalizedRelationKey(relation)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getNormalizedRelationKey(relation: RelationViewRecord) {
  const endpoints = relation.direction === 'bidirectional'
    ? [relation.sourceUnitId, relation.targetUnitId].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
    : [relation.sourceUnitId, relation.targetUnitId]
  return [
    endpoints[0],
    endpoints[1],
    relation.predicateId,
    relation.direction
  ].join('\u0000')
}

function sortUnits(units: UnitView[]) {
  return [...units].sort((left, right) => {
    const parentCompare = String(left.parentId || '').localeCompare(String(right.parentId || ''), 'zh-Hans-CN')
    if (parentCompare !== 0) return parentCompare
    const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.title.localeCompare(right.title, 'zh-Hans-CN')
  })
}

function sortRelations(relations: RelationViewRecord[]) {
  return [...relations].sort((left, right) => left.relationId.localeCompare(right.relationId, 'zh-Hans-CN'))
}
