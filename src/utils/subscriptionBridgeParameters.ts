export type SubscriptionBridgeProviderType = 'claude-code' | 'codex-subscription' | 'agy-subscription'

export interface AiModelReasoningEffortOption {
  reasoningEffort: string
  description?: string
}

export interface AiModelCatalogItem {
  id: string
  isDefault?: boolean
  supportedReasoningEfforts?: AiModelReasoningEffortOption[]
  defaultReasoningEffort?: string
  /** Codex 旧目录字段，值是界面语义（例如 fast）；新目录以 serviceTiers 为准。 */
  additionalSpeedTiers?: string[]
  serviceTiers?: Array<{ id: string; name?: string; description?: string }>
  defaultServiceTier?: string
}

const CLAUDE_CODE_EFFORTS: AiModelReasoningEffortOption[] = [
  { reasoningEffort: 'low', description: '更快、更省' },
  { reasoningEffort: 'medium', description: '均衡' },
  { reasoningEffort: 'high', description: '默认高质量' },
  { reasoningEffort: 'xhigh', description: '长任务深度推理' },
  { reasoningEffort: 'max', description: '最高投入' }
]

export function isSubscriptionBridgeProvider(value: unknown): value is SubscriptionBridgeProviderType {
  return value === 'claude-code' || value === 'codex-subscription' || value === 'agy-subscription'
}

/** AGY 当前结构化 CLI 不公开可安全回传的思考摘要，界面不得假装支持。 */
export function subscriptionBridgeReturnsThinkingSummary(value: unknown): boolean {
  return value === 'claude-code' || value === 'codex-subscription'
}

export function getModelReasoningEffortOptions(
  providerType: unknown,
  model: unknown,
  catalog: AiModelCatalogItem[]
): AiModelReasoningEffortOption[] {
  const matched = findModelCatalogItem(model, catalog)
  const options = Array.isArray(matched?.supportedReasoningEfforts)
    ? matched.supportedReasoningEfforts
        .map((option) => ({
          reasoningEffort: String(option?.reasoningEffort || '').trim(),
          description: String(option?.description || '').trim()
        }))
        .filter((option) => option.reasoningEffort)
    : []
  if (options.length) return options
  return providerType === 'claude-code' ? CLAUDE_CODE_EFFORTS.map((item) => ({ ...item })) : []
}

export function getModelDefaultReasoningEffort(model: unknown, catalog: AiModelCatalogItem[]): string {
  return String(findModelCatalogItem(model, catalog)?.defaultReasoningEffort || '').trim()
}

function findModelCatalogItem(model: unknown, catalog: AiModelCatalogItem[]): AiModelCatalogItem | undefined {
  const modelId = String(model || '').trim()
  if (modelId && modelId !== 'default') {
    return catalog.find((item) => String(item.id || '').trim() === modelId)
  }
  return catalog.find((item) => item.isDefault === true)
}

/** 服务档由模型目录声明；当前只有 Codex 订阅桥具备正式出站映射。 */
export function modelSupportsServiceTier(
  providerType: unknown,
  model: unknown,
  catalog: AiModelCatalogItem[],
  serviceTier: string
): boolean {
  if (providerType !== 'codex-subscription') return false
  const tier = String(serviceTier || '').trim()
  if (!tier) return false
  const matched = findModelCatalogItem(model, catalog)
  const serviceTiers = Array.isArray(matched?.serviceTiers) ? matched.serviceTiers : []
  if (serviceTiers.some((item) => String(item?.id || '').trim() === tier)) return true
  if (tier !== 'fast') return false
  // Codex 0.147 的真实目录用 additionalSpeedTiers=["fast"] 表示产品能力，
  // 对应 serviceTiers 项却是 { id: "priority", name: "Fast" }；不能把界面语义与协议 id 混为一谈。
  return (Array.isArray(matched?.additionalSpeedTiers)
    && matched.additionalSpeedTiers.some((item) => String(item || '').trim().toLowerCase() === 'fast'))
    || serviceTiers.some((item) => String(item?.name || '').trim().toLowerCase() === 'fast')
}
