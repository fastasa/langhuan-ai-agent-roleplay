import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'

const DOC_LIBRARY_TREE_ORDER_CONFIG_KEY = 'docLibraryManualTreeOrders'
const DOC_LIBRARY_SCHEMA_VERSION_CONFIG_KEY = 'docLibrarySchemaVersion'
const DOC_LIBRARY_TREE_NODES_CONFIG_KEY = 'docLibraryTreeNodes'
const DOC_LIBRARY_FIELD_TREE_ORDERS_CONFIG_KEY = 'docLibraryTreeOrders'
const DOC_LIBRARY_TREE_MIGRATION_META_CONFIG_KEY = 'docLibraryTreeMigrationMeta'
const DOC_LIBRARY_TREE_DIFF_REPORT_CONFIG_KEY = 'docLibraryTreeDiffReport'
const DOC_LIBRARY_RELATION_SYSTEM_CONFIG_KEY = 'docLibraryRelationSystemState'

type DocLibraryDb = Pick<typeof db, 'prepare'> & Partial<Pick<typeof db, '_save'>>

function normalizeTreeOrders(input: unknown) {
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

function parseTreeOrders(value: unknown) {
  if (typeof value !== 'string') return {}
  try {
    return normalizeTreeOrders(JSON.parse(value))
  } catch {
    return {}
  }
}

function normalizeJsonArray(input: unknown) {
  return Array.isArray(input)
    ? input.filter((item) => item && typeof item === 'object')
    : []
}

function parseJsonArray(value: unknown) {
  if (typeof value !== 'string') return []
  try {
    return normalizeJsonArray(JSON.parse(value))
  } catch {
    return []
  }
}

function normalizeJsonObject(input: unknown) {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
}

function parseJsonObject(value: unknown) {
  if (typeof value !== 'string') return {}
  try {
    return normalizeJsonObject(JSON.parse(value))
  } catch {
    return {}
  }
}

function normalizeRelationSystemState(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const predicates = Array.isArray(source.predicates) ? source.predicates : []
  const relationDecisions = Array.isArray(source.relationDecisions) ? source.relationDecisions : []
  return {
    predicates: predicates
      .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : null)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        predicateId: String(item.predicateId || '').trim(),
        family: String(item.family || 'general').trim() || 'general',
        key: String(item.key || '').trim(),
        label: String(item.label || '').trim(),
        inverseKey: String(item.inverseKey || '').trim() || undefined,
        description: String(item.description || '').trim() || undefined,
        status: String(item.status || 'confirmed').trim() === 'rejected' ? 'rejected' : 'confirmed'
      }))
      .filter((item) => item.predicateId && item.key && item.label),
    relationDecisions: relationDecisions
      .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : null)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        relationId: String(item.relationId || '').trim(),
        status: String(item.status || '').trim(),
        predicateId: String(item.predicateId || '').trim() || undefined,
        updatedAt: String(item.updatedAt || '').trim() || new Date().toISOString()
      }))
      .filter((item) => item.relationId && (item.status === 'confirmed' || item.status === 'rejected'))
  }
}

function parseRelationSystemState(value: unknown) {
  if (typeof value !== 'string') return normalizeRelationSystemState({})
  try {
    return normalizeRelationSystemState(JSON.parse(value))
  } catch {
    return normalizeRelationSystemState({})
  }
}

function getScopedConfigValue(database: DocLibraryDb, key: string) {
  const userId = getActiveUserId()
  const workspaceId = getActiveWorkspaceId()
  return database.prepare(`
    /* unscoped */ SELECT value
    FROM config
    WHERE key = ?
      AND (
        config_scope = 'system'
        OR (config_scope = 'user' AND user_id = ? AND workspace_id = ?)
        OR COALESCE(config_scope, '') = ''
      )
    ORDER BY CASE WHEN config_scope = 'user' THEN 0 WHEN config_scope = 'system' THEN 1 ELSE 2 END
    LIMIT 1
  `).get(key, userId, workspaceId) as { value?: string } | undefined
}

function replaceScopedConfigValue(database: DocLibraryDb, key: string, value: string) {
  const userId = getActiveUserId()
  const workspaceId = getActiveWorkspaceId()
  database.prepare(`
    /* unscoped */ INSERT OR REPLACE INTO config (key, value, config_scope, user_id, workspace_id)
    VALUES (?, ?, 'user', ?, ?)
  `).run(key, value, userId, workspaceId)
}

export function createDocLibraryRepository(database: DocLibraryDb = db) {
  const persist = () => {
    database._save?.()
  }

  return {
    getDocuments() {
      return database
        .prepare('SELECT * FROM doc_library_documents ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC')
        .all()
        .map(toCamel)
    },
    replaceDocuments(rows: Array<{
      id: string
      stableId: string
      title: string
      displayPath: string
      kind: string
      summary: string
      tags: string
      content: string
      publicCompilePage: string
      sourceDocumentIds: string
      relatedNeuronIds: string
      sourceMeta?: string
      semanticType?: string
      versionState: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM doc_library_documents WHERE user_id = ? AND workspace_id = ?')
        .run(getActiveUserId(), getActiveWorkspaceId())
      const stmt = database.prepare(`
        INSERT INTO doc_library_documents (
          id, stable_id, title, display_path, kind, summary, tags, content,
          public_compile_page, source_document_ids, related_neuron_ids, source_meta, semantic_type, version_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.stableId,
          row.title,
          row.displayPath,
          row.kind,
          row.summary,
          row.tags,
          row.content,
          row.publicCompilePage,
          row.sourceDocumentIds,
          row.relatedNeuronIds,
          row.sourceMeta || '',
          row.semanticType || 'other',
          row.versionState,
          row.createdAt,
          row.updatedAt
        )
      })
      persist()
    },
    getManualTreeOrders() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_TREE_ORDER_CONFIG_KEY)
      return parseTreeOrders(row?.value)
    },
    replaceManualTreeOrders(input: unknown) {
      const value = JSON.stringify(normalizeTreeOrders(input))
      replaceScopedConfigValue(database, DOC_LIBRARY_TREE_ORDER_CONFIG_KEY, value)
      persist()
    },
    getSchemaVersion() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_SCHEMA_VERSION_CONFIG_KEY)
      const version = Number(row?.value)
      return version === 2 ? 2 : 1
    },
    replaceSchemaVersion(input: unknown) {
      const version = Number(input) === 2 ? 2 : 1
      replaceScopedConfigValue(database, DOC_LIBRARY_SCHEMA_VERSION_CONFIG_KEY, String(version))
      persist()
    },
    getTreeNodes() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_TREE_NODES_CONFIG_KEY)
      return parseJsonArray(row?.value)
    },
    replaceTreeNodes(input: unknown) {
      replaceScopedConfigValue(database, DOC_LIBRARY_TREE_NODES_CONFIG_KEY, JSON.stringify(normalizeJsonArray(input)))
      persist()
    },
    getTreeOrders() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_FIELD_TREE_ORDERS_CONFIG_KEY)
      return parseTreeOrders(row?.value)
    },
    replaceTreeOrders(input: unknown) {
      replaceScopedConfigValue(database, DOC_LIBRARY_FIELD_TREE_ORDERS_CONFIG_KEY, JSON.stringify(normalizeTreeOrders(input)))
      persist()
    },
    getTreeMigrationMeta() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_TREE_MIGRATION_META_CONFIG_KEY)
      return parseJsonObject(row?.value)
    },
    replaceTreeMigrationMeta(input: unknown) {
      replaceScopedConfigValue(database, DOC_LIBRARY_TREE_MIGRATION_META_CONFIG_KEY, JSON.stringify(normalizeJsonObject(input)))
      persist()
    },
    getTreeDiffReport() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_TREE_DIFF_REPORT_CONFIG_KEY)
      return parseJsonObject(row?.value)
    },
    replaceTreeDiffReport(input: unknown) {
      replaceScopedConfigValue(database, DOC_LIBRARY_TREE_DIFF_REPORT_CONFIG_KEY, JSON.stringify(normalizeJsonObject(input)))
      persist()
    },
    getRelationSystemState() {
      const row = getScopedConfigValue(database, DOC_LIBRARY_RELATION_SYSTEM_CONFIG_KEY)
      return parseRelationSystemState(row?.value)
    },
    replaceRelationSystemState(input: unknown) {
      const value = JSON.stringify(normalizeRelationSystemState(input))
      replaceScopedConfigValue(database, DOC_LIBRARY_RELATION_SYSTEM_CONFIG_KEY, value)
      persist()
    }
  }
}

export const docLibraryRepository = createDocLibraryRepository()
