function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function textOrFallback(value: unknown, fallback = ''): string {
  const normalized = text(value, '').trim()
  return normalized || fallback
}

function jsonText(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback)
}

function optionalJsonText(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function publicCompilePageText(item: Record<string, any>, timestamp: string): string {
  const raw = item?.publicCompilePage ?? item?.public_compile_page
  if (typeof raw === 'string' && raw.trim()) return raw
  return jsonText(raw, {
    summary: text(item?.summary),
    shortSummary: text(item?.summary).slice(0, 120),
    tags: item?.tags ?? [],
    entityIndex: [],
    relationHints: [],
    recallSnippets: [],
    sourceState: 'needs_review',
    updatedAt: text(item?.updatedAt ?? item?.updated_at, timestamp)
  })
}

function resolveVersionState(value: unknown): string {
  return text(value, 'pending') === 'confirmed' ? 'confirmed' : 'pending'
}

function resolveDocumentType(value: unknown): string {
  return text(value, 'generic_markdown') || 'generic_markdown'
}

const UNIT_SEMANTIC_TYPES = new Set([
  'world',
  'region',
  'terrain',
  'settlement',
  'character',
  'lineage',
  'organization',
  'polity',
  'role_identity',
  'event',
  'period',
  'law_system',
  'belief',
  'culture',
  'language',
  'resource',
  'item',
  'ability',
  'species',
  'concept',
  'text_legend',
  'other'
])

function resolveSemanticType(value: unknown): string {
  const normalized = text(value, '').trim()
  return UNIT_SEMANTIC_TYPES.has(normalized) ? normalized : 'other'
}

function resolveNeuronKind(value: unknown): string {
  return text(value, 'public_reference') || 'public_reference'
}

export function normalizeBrainDocumentReplaceRow(item: Record<string, any>, index: number) {
  const documentId = textOrFallback(
    item?.documentId ?? item?.document_id ?? item?.id ?? item?.stableId ?? item?.stable_id,
    `document_${index}`
  )
  const stableId = textOrFallback(item?.stableId ?? item?.stable_id ?? documentId, documentId)
  const timestamp = new Date().toISOString()
  return {
    id: documentId,
    stableId,
    title: text(item?.title, '未命名文档'),
    displayPath: text(item?.displayPath ?? item?.display_path, '/未分类/未命名.md'),
    kind: resolveDocumentType(item?.documentType ?? item?.document_type ?? item?.kind),
    semanticType: resolveSemanticType(item?.semanticType ?? item?.semantic_type),
    summary: text(item?.summary),
    tags: jsonText(item?.tags, []),
    content: text(item?.content),
    publicCompilePage: publicCompilePageText(item, timestamp),
    sourceDocumentIds: jsonText(item?.sourceDocumentIds ?? item?.source_document_ids, []),
    relatedNeuronIds: jsonText(item?.relatedNeuronIds ?? item?.related_neuron_ids, []),
    sourceMeta: optionalJsonText(item?.sourceMeta ?? item?.source_meta),
    versionState: resolveVersionState(item?.versionState ?? item?.version_state),
    createdAt: text(item?.createdAt ?? item?.created_at, timestamp),
    updatedAt: text(item?.updatedAt ?? item?.updated_at, timestamp)
  }
}

export function normalizeBrainNeuronReplaceRow(item: Record<string, any>, index: number) {
  const timestamp = new Date().toISOString()
  return {
    brainNeuronId: text(item?.brainNeuronId ?? item?.brain_neuron_id, `brain_neuron_${index}`),
    neuronKind: resolveNeuronKind(item?.neuronKind ?? item?.neuron_kind),
    displayPath: text(item?.displayPath ?? item?.display_path, '/未分类/未命名神经元.md'),
    title: text(item?.title, '未命名神经元'),
    summary: text(item?.summary),
    tags: jsonText(item?.tags, []),
    sourceDocumentIds: jsonText(item?.sourceDocumentIds ?? item?.source_document_ids, []),
    relatedNeuronIds: jsonText(item?.relatedNeuronIds ?? item?.related_neuron_ids, []),
    content: text(item?.content),
    versionState: resolveVersionState(item?.versionState ?? item?.version_state),
    createdAt: text(item?.createdAt ?? item?.created_at, timestamp),
    updatedAt: text(item?.updatedAt ?? item?.updated_at, timestamp)
  }
}
