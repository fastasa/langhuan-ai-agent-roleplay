import type { BrainDocumentRecord } from '../types'

export function normalizeWorldbookFolderPath(folderPath: string) {
  const normalized = `/${String(folderPath || '').trim().replace(/^\/+/, '').replace(/\/+$/g, '')}`.replace(/\/+/g, '/')
  return normalized === '/' ? '' : normalized
}

export function buildWorldbookOverviewDisplayPath(folderPath: string) {
  const normalized = normalizeWorldbookFolderPath(folderPath)
  return normalized ? `${normalized}/index.md` : '/index.md'
}

export function isWorldbookOverviewDocument(document: BrainDocumentRecord, folderPath: string) {
  return String(document.displayPath || '').trim() === buildWorldbookOverviewDisplayPath(folderPath)
}

export function findWorldbookOverviewDocument(
  documents: BrainDocumentRecord[],
  folderPath: string
) {
  const targetPath = buildWorldbookOverviewDisplayPath(folderPath)
  return documents.find((item) => String(item.displayPath || '').trim() === targetPath) || null
}
