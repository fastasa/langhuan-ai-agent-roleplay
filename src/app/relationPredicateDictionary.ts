import type { PredicateFamily, PredicateView, RelationViewDirection } from '../types/unitView'

export type PredicateDictionaryDirection =
  | 'direct'
  | 'reverse'
  | 'bidirectional'

export interface PredicateDictionaryEntry {
  canonicalPredicateId: string
  family: PredicateFamily
  key: string
  label: string
  forwardTerms: string[]
  reverseTerms: string[]
  direction: RelationViewDirection
}

export interface PredicateDictionaryMatch {
  entry: PredicateDictionaryEntry
  surfacePredicate: string
  direction: PredicateDictionaryDirection
}

const PREDICATE_ENTRIES: PredicateDictionaryEntry[] = [
  entry('structure', 'contains', '包含', ['包含', '含有', '包括', '下辖', '统辖', '管辖', '由其组成'], ['属于', '归属', '归入', '从属于', '是其一部分', '构成'], 'directed'),
  entry('spatial_location', 'located_in', '位于', ['位于', '位处', '处于', '地处', '分布于', '存在于'], ['覆盖', '囊括', '容纳'], 'directed'),
  entry('spatial_neighbor', 'adjacent_to', '相邻', ['相邻', '接壤', '毗邻', '靠近', '临近', '相连'], ['相邻', '接壤', '毗邻', '靠近', '临近', '相连'], 'bidirectional'),
  entry('origin', 'derived_from', '源自', ['源自', '起源于', '来自', '继承自', '分化自', '脱胎于', '延伸自'], ['产生', '孕育', '派生出', '延伸出'], 'directed'),
  entry('power', 'controls', '控制', ['控制', '统治', '占据', '占领', '掌控', '支配', '管理', '镇守'], ['受控于', '受统治于', '受管辖于', '被占据'], 'directed'),
  entry('activity', 'active_in', '活动于', ['活动于', '生活于', '居住于', '驻扎于', '出没于', '常驻于', '迁徙至'], ['驻有', '生活着', '分布着', '栖居着'], 'directed'),
  entry('affiliation', 'member_of', '隶属于', ['隶属于', '效忠于', '加入', '任职于', '服务于', '归队于'], ['拥有成员', '统领', '招募', '收编'], 'directed'),
  entry('conflict', 'hostile_to', '敌对', ['敌对', '对抗', '交战', '冲突', '争夺', '袭击', '入侵'], ['敌对', '对抗', '交战', '冲突', '遭袭'], 'bidirectional'),
  entry('alliance', 'allied_with', '同盟', ['同盟', '结盟', '合作', '协助', '庇护', '交易', '互通'], ['同盟', '结盟', '合作', '协助', '受庇护'], 'bidirectional'),
  entry('event_effect', 'affects', '影响', ['影响', '导致', '引发', '改变', '破坏', '促成', '牵涉'], ['受到影响', '源于', '由其引发'], 'directed'),
  entry('kinship', 'kin_of', '亲属', ['父亲', '母亲', '子女', '兄弟', '姐妹', '配偶', '亲族', '血亲'], ['父亲', '母亲', '子女', '兄弟', '姐妹', '配偶', '亲族', '血亲'], 'bidirectional'),
  entry('belief_culture', 'believes_in', '信仰', ['信仰', '崇拜', '祭祀', '遵循', '使用习俗', '传承文化'], ['被信仰', '被崇拜', '被祭祀', '影响文化'], 'directed'),
  entry('resource_output', 'produces', '产出', ['产出', '出产', '盛产', '开采', '制造', '生产'], ['产自', '出自', '由其生产', '由其制造'], 'directed'),
  entry('trade_flow', 'trades_with', '贸易', ['贸易', '交易', '输入', '输出', '运输', '流通', '供应'], ['贸易', '交易', '输入', '输出', '运输', '流通', '受供应'], 'directed'),
  entry('craft_inheritance', 'inherits_from', '传承', ['传承', '继承', '学习自', '改良自', '制作', '铸造', '编纂'], ['传给', '教导', '由其制作', '由其编纂'], 'directed'),
  entry('general', 'related_to', '相关', ['相关', '有关', '关联', '联系', '涉及'], ['相关', '有关', '关联', '联系', '涉及'], 'bidirectional')
]

export const PREDICATE_DICTIONARY = Object.freeze(PREDICATE_ENTRIES.map((item) => freezeEntry(item)))

export const PREDICATE_DICTIONARY_PREDICATES: PredicateView[] = PREDICATE_DICTIONARY.map((item) => ({
  predicateId: item.canonicalPredicateId,
  family: item.family,
  key: item.key,
  label: item.label,
  status: 'confirmed'
}))

const TERM_INDEX = buildTermIndex(PREDICATE_DICTIONARY)

export function findPredicateDictionaryMatch(rawPredicate: string): PredicateDictionaryMatch | null {
  const normalized = normalizePredicateTerm(rawPredicate)
  return normalized ? TERM_INDEX.get(normalized) || null : null
}

export function getPredicateDictionaryEntries(): PredicateDictionaryEntry[] {
  return PREDICATE_DICTIONARY.map((item) => ({ ...item }))
}

export function normalizePredicateTerm(input: string): string {
  return String(input || '').replace(/\s+/gu, '').trim()
}

function entry(
  family: PredicateFamily,
  key: string,
  label: string,
  forwardTerms: string[],
  reverseTerms: string[],
  direction: RelationViewDirection
): PredicateDictionaryEntry {
  return {
    canonicalPredicateId: `predicate:${family}:${key}`,
    family,
    key,
    label,
    forwardTerms,
    reverseTerms,
    direction
  }
}

function freezeEntry(entryInput: PredicateDictionaryEntry): PredicateDictionaryEntry {
  return Object.freeze({
    ...entryInput,
    forwardTerms: Object.freeze([...entryInput.forwardTerms]) as unknown as string[],
    reverseTerms: Object.freeze([...entryInput.reverseTerms]) as unknown as string[]
  })
}

function buildTermIndex(entries: readonly PredicateDictionaryEntry[]) {
  const map = new Map<string, PredicateDictionaryMatch>()
  entries.forEach((item) => {
    item.forwardTerms.forEach((term) => {
      const normalized = normalizePredicateTerm(term)
      if (!normalized) return
      map.set(normalized, {
        entry: item,
        surfacePredicate: term,
        direction: item.direction === 'bidirectional' ? 'bidirectional' : 'direct'
      })
    })
    item.reverseTerms.forEach((term) => {
      const normalized = normalizePredicateTerm(term)
      if (!normalized || map.has(normalized)) return
      map.set(normalized, {
        entry: item,
        surfacePredicate: term,
        direction: item.direction === 'bidirectional' ? 'bidirectional' : 'reverse'
      })
    })
  })
  return map
}
