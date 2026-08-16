export const AI_PROVIDER_TYPES = ['openai-compatible', 'deepseek', 'glm', 'minimax', 'claude-code', 'codex-subscription', 'agy-subscription'] as const
export const AI_PRESET_CAPABILITIES = ['chat', 'embedding', 'both'] as const
export const AI_EMBEDDING_DIMENSIONS = [256, 512, 1024, 2048] as const

export type AiProviderType = typeof AI_PROVIDER_TYPES[number]
export type AiPresetCapability = typeof AI_PRESET_CAPABILITIES[number]
export type AiEmbeddingDimension = typeof AI_EMBEDDING_DIMENSIONS[number]

export type AiProviderTemplate = {
  type: AiProviderType
  label: string
  baseUrl: string
  model: string
  maxTokens: number
  temperature: number
}

export const AI_PROVIDER_TEMPLATES: AiProviderTemplate[] = [
  {
    type: 'openai-compatible',
    label: 'OpenAI 兼容',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    maxTokens: 4096,
    temperature: 1
  },
  {
    type: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    maxTokens: 4096,
    temperature: 1
  },
  {
    type: 'glm',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.1',
    maxTokens: 8192,
    temperature: 1
  },
  {
    type: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2.7',
    maxTokens: 8192,
    temperature: 1
  },
  {
    // Claude Code 订阅桥：不走 HTTP，服务端本地 spawn claude CLI（见 server/application/ai/claudeCodeBridge.ts）。
    // baseUrl 为伪协议标记，仅用于识别与并发池分池，绝不会真正外呼。
    type: 'claude-code',
    label: 'Claude Code（订阅桥）',
    baseUrl: 'claude-code://local',
    model: 'sonnet',
    maxTokens: 8192,
    temperature: 1
  },
  {
    // Codex 订阅桥：服务端连接本机 Codex App Server，复用 ChatGPT 管理的 Codex 登录态。
    // 模型目录由 model/list 动态读取；default 表示使用当前账号目录标记的默认模型。
    type: 'codex-subscription',
    label: 'Codex（订阅桥）',
    baseUrl: 'codex://local',
    model: 'default',
    maxTokens: 8192,
    temperature: 1
  },
  {
    // AGY 订阅桥：服务端调用本机官方 agy CLI，复用系统 keyring 中的 Google 登录态。
    // 模型目录由 `agy models` 动态读取；default 表示交给当前 AGY 版本选择默认模型。
    type: 'agy-subscription',
    label: 'AGY（订阅桥）',
    baseUrl: 'agy://local',
    model: 'default',
    maxTokens: 8192,
    temperature: 1
  }
]

export function normalizeAiProviderType(value: unknown): AiProviderType {
  const normalized = String(value || '').trim()
  return AI_PROVIDER_TYPES.includes(normalized as AiProviderType)
    ? normalized as AiProviderType
    : 'openai-compatible'
}

export function normalizeAiPresetCapability(value: unknown, fallback: AiPresetCapability = 'chat'): AiPresetCapability {
  const normalized = String(value || '').trim()
  return AI_PRESET_CAPABILITIES.includes(normalized as AiPresetCapability)
    ? normalized as AiPresetCapability
    : fallback
}

export function presetSupportsCapability(value: unknown, required: 'chat' | 'embedding') {
  const capability = normalizeAiPresetCapability(value)
  return capability === 'both' || capability === required
}

export function normalizeAiEmbeddingDimension(value: unknown, fallback: AiEmbeddingDimension = 512): AiEmbeddingDimension {
  const numeric = Number(value)
  return AI_EMBEDDING_DIMENSIONS.includes(numeric as AiEmbeddingDimension)
    ? numeric as AiEmbeddingDimension
    : fallback
}

/** 本机订阅桥不需要 API 密钥。前端测试/取模型门禁只认这一处真值。 */
export function isKeylessAiProvider(value: unknown): boolean {
  const provider = normalizeAiProviderType(value)
  return provider === 'claude-code' || provider === 'codex-subscription' || provider === 'agy-subscription'
}

export function getKeylessAiProviderHint(value: unknown): string {
  const provider = normalizeAiProviderType(value)
  if (provider === 'codex-subscription') return '订阅桥无需密钥（用本机 Codex 的 ChatGPT 登录态）'
  if (provider === 'claude-code') return '订阅桥无需密钥（用本机 Claude Code 登录态）'
  if (provider === 'agy-subscription') return '订阅桥无需密钥（用本机 AGY 的 Google 登录态）'
  return ''
}

export function getAiProviderTemplate(value: unknown): AiProviderTemplate {
  const type = normalizeAiProviderType(value)
  return AI_PROVIDER_TEMPLATES.find((item) => item.type === type) || AI_PROVIDER_TEMPLATES[0]
}
