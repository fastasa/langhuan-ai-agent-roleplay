export const AI_USAGE_FEATURES = [
  'role_message',
  'narration',
  'narration_debug',
  'write_back',
  'event_candidate',
  'agent',
  'xingyi',
  'embedding',
  'chat_title',
  'other'
] as const

export type AiUsageFeature = typeof AI_USAGE_FEATURES[number]

export const AI_USAGE_FEATURE_LABELS: Record<AiUsageFeature, string> = {
  role_message: '角色消息',
  narration: '旁白',
  narration_debug: '调试信息',
  write_back: '写入',
  event_candidate: '事件候选',
  agent: 'Agent',
  xingyi: '星依',
  embedding: '嵌入',
  chat_title: '会话命名',
  other: '其他'
}

const LEGACY_AI_USAGE_FEATURE_ALIASES: Record<string, AiUsageFeature> = {
  role_message: 'role_message',
  chat: 'role_message',
  role: 'role_message',
  role_chat: 'role_message',
  character_message: 'role_message',
  debug: 'narration_debug',
  narration_debug: 'narration_debug',
  narration: 'narration',
  write: 'write_back',
  writeback: 'write_back',
  write_back: 'write_back',
  event_candidate: 'event_candidate',
  event_candidates: 'event_candidate',
  event_pool: 'event_candidate',
  personality_tide: 'other',
  affect_gate: 'other',
  emotion_tide: 'other',
  agent: 'agent',
  brain_agent: 'agent',
  xingyi: 'xingyi',
  embedding: 'embedding',
  embeddings: 'embedding',
  chat_title: 'chat_title',
  session_title: 'chat_title',
  title: 'chat_title',
  other: 'other'
}

export const AI_USAGE_FEATURE_FILTER_VALUES: Record<AiUsageFeature, string[]> = {
  role_message: ['role_message', 'chat', 'role', 'role_chat', 'character_message'],
  narration: ['narration'],
  narration_debug: ['narration_debug', 'debug'],
  write_back: ['write_back', 'write', 'writeback'],
  event_candidate: ['event_candidate', 'event_candidates', 'event_pool'],
  agent: ['agent', 'brain_agent'],
  xingyi: ['xingyi'],
  embedding: ['embedding', 'embeddings'],
  chat_title: ['chat_title', 'session_title', 'title'],
  other: ['other']
}

export const AI_USAGE_AGENT_FEATURES = new Set<AiUsageFeature>([
  'agent',
  'xingyi',
  'chat_title',
  'write_back',
  'event_candidate'
])

export function normalizeAiUsageFeature(value: unknown): AiUsageFeature {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return 'role_message'
  return LEGACY_AI_USAGE_FEATURE_ALIASES[text] || 'other'
}

export function resolveAiUsageFeatureLabel(value: unknown): string {
  return AI_USAGE_FEATURE_LABELS[normalizeAiUsageFeature(value)]
}

export function getAiUsageFeatureFilterValues(value: unknown): string[] {
  const feature = normalizeAiUsageFeature(value)
  return AI_USAGE_FEATURE_FILTER_VALUES[feature] || AI_USAGE_FEATURE_FILTER_VALUES.other
}

export function isAiUsageAgentFeature(value: unknown): boolean {
  return AI_USAGE_AGENT_FEATURES.has(normalizeAiUsageFeature(value))
}
