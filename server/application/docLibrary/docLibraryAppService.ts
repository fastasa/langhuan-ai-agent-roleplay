import { docLibraryRepository } from '../../repositories/docLibraryRepository.js'
import { normalizeBrainDocumentReplaceRow } from '../character/brainRecordNormalizer.js'
import { createSillyTavernWorldbookImportAppService } from '../character/sillyTavernWorldbookImportAppService.js'
import { createWorldDraftImportAppService } from './worldDraftImportAppService.js'
import { pathTreeToFieldTree } from '../../../src/app/docLibraryTreeMigration.js'
import { buildDocLibraryTreeDiffReport } from '../../../src/app/docLibraryTreeDiffReport.js'
import type { SillyTavernWorldbookImportConflictStrategy } from '../../../src/types/index.js'

function normalizeManualTreeOrders(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        String(key || '').trim(),
        Array.isArray(value)
          ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
          : []
      ])
      .filter(([key]) => Boolean(key))
  )
}

function hasStoredFieldTree(source: {
  treeNodes?: unknown[]
  treeOrders?: Record<string, string[]>
}) {
  return Array.isArray(source.treeNodes)
    && source.treeNodes.length > 0
    && source.treeOrders
    && typeof source.treeOrders === 'object'
}

function buildFieldTreeCompatState(
  documents: Record<string, unknown>[],
  manualTreeOrders: Record<string, string[]>,
  stored: {
    schemaVersion?: number
    treeNodes?: unknown[]
    treeOrders?: Record<string, string[]>
    treeMigrationMeta?: Record<string, unknown>
    treeDiffReport?: Record<string, unknown>
    forceRebuild?: boolean
  } = {}
) {
  if (!stored.forceRebuild && stored.schemaVersion === 2 && hasStoredFieldTree(stored)) {
    const treeDiffReport = buildDocLibraryTreeDiffReport({
      documents: documents as any[],
      manualTreeOrders,
      treeNodes: stored.treeNodes as any[],
      treeOrders: stored.treeOrders,
      treeSource: 'field'
    })
    return {
      schemaVersion: 2,
      treeNodes: stored.treeNodes,
      treeOrders: stored.treeOrders,
      treeMigrationMeta: stored.treeMigrationMeta || {
        treeSource: 'field',
        generatedAt: new Date().toISOString(),
        hasBlockingIssues: false
      },
      treeDiffReport
    }
  }

  try {
    const converted = pathTreeToFieldTree({
      documents: documents as any[],
      manualTreeOrders,
      generatedAt: new Date().toISOString()
    })
    return {
      schemaVersion: 2,
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeMigrationMeta: converted.treeMigrationMeta,
      treeDiffReport: buildDocLibraryTreeDiffReport({
        documents: documents as any[],
        manualTreeOrders,
        treeNodes: converted.treeNodes,
        treeOrders: converted.treeOrders,
        treeSource: 'path'
      })
    }
  } catch (error) {
    return {
      schemaVersion: 1,
      treeNodes: [],
      treeOrders: {},
      treeMigrationMeta: {
        treeSource: 'path',
        generatedAt: new Date().toISOString(),
        hasBlockingIssues: true,
        error: (error as Error).message
      },
      treeDiffReport: {
        generatedAt: new Date().toISOString(),
        treeSource: 'path',
        blockerCount: 1,
        warningCount: 0,
        documentPathMismatchCount: 0,
        manualOrderMismatchCount: 0,
        missingDocumentNodeCount: 0,
        extraDocumentNodeCount: 0,
        issues: [{
          severity: 'blocker',
          code: 'server_field_tree_convert_failed',
          message: (error as Error).message
        }],
        canUseFieldTree: false
      }
    }
  }
}

function getFieldTreeBlockerMessage(fieldTreeState: { treeDiffReport?: Record<string, unknown> }) {
  const treeDiffReport = fieldTreeState.treeDiffReport
  const blockerCount = Number(treeDiffReport?.blockerCount || 0)
  if (blockerCount <= 0) return ''
  const issue = Array.isArray(treeDiffReport?.issues)
    ? (treeDiffReport.issues as Array<Record<string, unknown>>)[0]
    : undefined
  return String(issue?.message || '字段树差异报告存在阻断项')
}

export function createDocLibraryAppService(repository = docLibraryRepository) {
  const sillyTavernWorldbookImportAppService = createSillyTavernWorldbookImportAppService(repository)
  const worldDraftImportAppService = createWorldDraftImportAppService(repository)

  return {
    getState() {
      const documents = repository.getDocuments()
      const manualTreeOrders = repository.getManualTreeOrders()
      const stored = {
        schemaVersion: repository.getSchemaVersion?.(),
        treeNodes: repository.getTreeNodes?.(),
        treeOrders: repository.getTreeOrders?.(),
        treeMigrationMeta: repository.getTreeMigrationMeta?.(),
        treeDiffReport: repository.getTreeDiffReport?.()
      }
      const fieldTreeState = buildFieldTreeCompatState(documents, manualTreeOrders, stored)
      return {
        documents,
        manualTreeOrders,
        ...fieldTreeState,
        relationSystemState: repository.getRelationSystemState()
      }
    },
    replaceState(payload: Record<string, unknown> | unknown) {
      const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      const nextDocuments = Array.isArray(source.documents) ? source.documents as Record<string, any>[] : []
      const manualTreeOrders = normalizeManualTreeOrders(source.manualTreeOrders)
      const relationSystemState = source.relationSystemState || {}
      const incomingSchemaVersion = Number(source.schemaVersion) === 2 ? 2 : 1
      const fieldTreeState = buildFieldTreeCompatState(nextDocuments, manualTreeOrders, {
        schemaVersion: incomingSchemaVersion,
        treeNodes: Array.isArray(source.treeNodes) ? source.treeNodes : undefined,
        treeOrders: normalizeManualTreeOrders(source.treeOrders),
        treeMigrationMeta: source.treeMigrationMeta && typeof source.treeMigrationMeta === 'object'
          ? source.treeMigrationMeta as Record<string, unknown>
          : undefined,
        treeDiffReport: source.treeDiffReport && typeof source.treeDiffReport === 'object'
          ? source.treeDiffReport as Record<string, unknown>
          : undefined
      })
      const blockerMessage = getFieldTreeBlockerMessage(fieldTreeState)
      if (blockerMessage) {
        throw new Error(`文档库字段树保存失败：${blockerMessage}`)
      }
      const blockerCount = Number((fieldTreeState.treeDiffReport as Record<string, unknown> | undefined)?.blockerCount || 0)
      repository.replaceDocuments(nextDocuments.map((item: Record<string, any>, index: number) => (
        normalizeBrainDocumentReplaceRow(item, index)
      )))
      repository.replaceManualTreeOrders(manualTreeOrders)
      repository.replaceSchemaVersion?.(fieldTreeState.schemaVersion)
      repository.replaceTreeNodes?.(fieldTreeState.treeNodes)
      repository.replaceTreeOrders?.(fieldTreeState.treeOrders)
      repository.replaceTreeMigrationMeta?.(fieldTreeState.treeMigrationMeta)
      repository.replaceTreeDiffReport?.(fieldTreeState.treeDiffReport)
      repository.replaceRelationSystemState(relationSystemState)
      return {
        ok: true,
        count: nextDocuments.length,
        manualOrderBucketCount: Object.keys(manualTreeOrders).length,
        schemaVersion: fieldTreeState.schemaVersion,
        treeNodeCount: Array.isArray(fieldTreeState.treeNodes) ? fieldTreeState.treeNodes.length : 0,
        treeDiffBlockerCount: blockerCount,
        relationDecisionCount: Array.isArray((relationSystemState as Record<string, unknown>).relationDecisions)
          ? ((relationSystemState as Record<string, unknown>).relationDecisions as unknown[]).length
          : 0
      }
    },
    previewSillyTavernWorldbookImport() {
      return sillyTavernWorldbookImportAppService.preview()
    },
    applySillyTavernWorldbookImport(payload: Record<string, any> = {}) {
      return sillyTavernWorldbookImportAppService.apply(
        (payload.conflictStrategy || 'skip') as SillyTavernWorldbookImportConflictStrategy
      )
    },
    previewWorldDraftImport(payload: Record<string, any> = {}) {
      return worldDraftImportAppService.preview(payload)
    },
    applyWorldDraftImport(payload: Record<string, any> = {}) {
      return worldDraftImportAppService.apply(payload)
    }
  }
}

export const docLibraryAppService = createDocLibraryAppService()
