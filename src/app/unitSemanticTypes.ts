import type { UnitSemanticType } from '../types/docBrain'

export interface UnitSemanticTypeOption {
  value: UnitSemanticType
  label: string
}

export const UNIT_SEMANTIC_TYPES: UnitSemanticType[] = [
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
]

export const DEFAULT_UNIT_SEMANTIC_TYPE: UnitSemanticType = 'other'

export const UNIT_SEMANTIC_TYPE_LABELS: Record<UnitSemanticType, string> = {
  world: '世界',
  region: '区域',
  terrain: '地形',
  settlement: '聚居地',
  character: '人物',
  lineage: '族系',
  organization: '组织',
  polity: '政体',
  role_identity: '身份',
  event: '事件',
  period: '时期',
  law_system: '制度',
  belief: '信仰',
  culture: '文化',
  language: '语言',
  resource: '资源',
  item: '物品',
  ability: '能力',
  species: '物种',
  concept: '概念',
  text_legend: '文本/传说',
  other: '其他'
}

export const UNIT_SEMANTIC_TYPE_OPTIONS: UnitSemanticTypeOption[] = UNIT_SEMANTIC_TYPES.map((value) => ({
  value,
  label: UNIT_SEMANTIC_TYPE_LABELS[value]
}))

const UNIT_SEMANTIC_TYPE_SET = new Set<string>(UNIT_SEMANTIC_TYPES)

export function normalizeUnitSemanticType(input: unknown): UnitSemanticType {
  const normalized = String(input || '').trim()
  return UNIT_SEMANTIC_TYPE_SET.has(normalized)
    ? normalized as UnitSemanticType
    : DEFAULT_UNIT_SEMANTIC_TYPE
}

export function getUnitSemanticTypeLabel(input: unknown): string {
  return UNIT_SEMANTIC_TYPE_LABELS[normalizeUnitSemanticType(input)]
}
