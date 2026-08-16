import type { BrainDocumentRecord, ChatSession } from '../types'

export interface SessionWorldDocLibraryScope {
  worldId: string
  documentIds: string[]
}

function normalizeDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)))
}

export function docLibraryDocumentKeyOf(document: Partial<BrainDocumentRecord> | Record<string, unknown>): string {
  return String(document?.documentId || document?.id || '').trim()
}

/** 会话只读投影：未挂世界时，即便残留旧字段也必须视为空范围。 */
export function readSessionWorldDocLibraryScope(session: Partial<ChatSession> | null | undefined): SessionWorldDocLibraryScope {
  const worldId = String(session?.worldId || session?.world_id || '').trim()
  return {
    worldId,
    documentIds: worldId ? normalizeDocumentIds(session?.worldDocLibraryDocumentIds) : []
  }
}

export function filterDocumentsByWorldScope(
  documentIds: readonly string[],
  documents: BrainDocumentRecord[]
): BrainDocumentRecord[] {
  const allowed = new Set(normalizeDocumentIds(documentIds))
  if (!allowed.size) return []
  return (Array.isArray(documents) ? documents : []).filter((document) => allowed.has(docLibraryDocumentKeyOf(document)))
}

/** 文档 UnitView 的稳定 id 为 doc:${encodeURIComponent(documentId).replace(/%/g, '~')}。 */
export function readDocLibraryDocumentIdFromUnitId(unitId: unknown): string {
  const id = String(unitId || '').trim()
  if (!id.startsWith('doc:')) return ''
  try {
    return decodeURIComponent(id.slice(4).replace(/~/g, '%')).trim()
  } catch {
    return ''
  }
}
