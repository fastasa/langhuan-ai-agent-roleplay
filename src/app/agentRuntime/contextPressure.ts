/**
 * Agent runtime context-pressure measurement.
 *
 * Provider usage is the preferred anchor because a local character heuristic cannot know the
 * provider tokenizer or the hidden request framing. Cache read/write counts are treated as
 * subsets of provider input tokens when inputTokens is present; they are diagnostics, not extra
 * tokens to add to the context. When the provider omits inputTokens, their sum is only used as a
 * conservative lower-bound anchor.
 */

export interface ProviderContextUsageAnchor {
  inputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface ContextPressureMeasurementInput {
  contextWindowTokens: number
  currentSurface: string
  /** Exact model-visible surface used by the provider call that produced providerUsage. */
  anchorSurface?: string
  providerUsage?: ProviderContextUsageAnchor | null
  /** Compaction/pruning threshold. Defaults to 0.8 of the context window. */
  thresholdRatio?: number
  /** Output/reasoning reserve that must remain outside the input surface. */
  reserveTokens?: number
}

export interface ContextPressureMeasurement {
  source: 'provider-anchor' | 'local-estimate'
  projectedTokens: number
  pressureTokens: number
  pressureRatio: number
  underPressure: boolean
  contextWindowTokens: number
  thresholdTokens: number
  reserveTokens: number
  surfaceEstimateTokens: number
  anchorInputTokens: number | null
  anchorSurfaceEstimateTokens: number | null
  surfaceDeltaTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

const CJK_OR_WIDE_RE = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u
const JSON_STRUCTURE_RE = /[{}\[\],:"]/u
const ASCII_RE = /[\x00-\x7f]/u

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

function normalizeRatio(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return fallback
  return parsed
}

/**
 * Conservative tokenizer-independent estimate.
 *
 * It intentionally budgets CJK/wide characters at 1.25 tokens each, non-ASCII symbols/emoji at
 * 1.5, JSON punctuation at 0.5 and ordinary ASCII at 1/3. This is deliberately more conservative
 * than the common four-characters-per-token shortcut, especially for Chinese and tool schemas.
 * Provider usage should always replace this estimate as soon as it exists.
 */
export function estimateConservativeContextTokens(surface: string): number {
  let weightedTokens = 0
  for (const character of String(surface ?? '')) {
    if (CJK_OR_WIDE_RE.test(character)) {
      weightedTokens += 1.25
    } else if (!ASCII_RE.test(character)) {
      weightedTokens += 1.5
    } else if (JSON_STRUCTURE_RE.test(character)) {
      weightedTokens += 0.5
    } else if (/\s/u.test(character)) {
      weightedTokens += 0.125
    } else {
      weightedTokens += 1 / 3
    }
  }
  return Math.ceil(weightedTokens)
}

function resolveProviderAnchor(usage: ProviderContextUsageAnchor | null | undefined): {
  inputTokens: number | null
  cacheReadTokens: number
  cacheWriteTokens: number
} {
  const cacheReadTokens = nonNegativeInteger(usage?.cacheReadTokens)
  const cacheWriteTokens = nonNegativeInteger(usage?.cacheWriteTokens)
  const reportedInputTokens = nonNegativeInteger(usage?.inputTokens)
  if (reportedInputTokens > 0) {
    // Cache counts are provider-input subsets in the normalized Langhuan ledger. max() protects
    // against a malformed provider reporting a subset larger than its total without double-counting.
    return {
      inputTokens: Math.max(reportedInputTokens, cacheReadTokens, cacheWriteTokens),
      cacheReadTokens,
      cacheWriteTokens
    }
  }
  const cacheLowerBound = cacheReadTokens + cacheWriteTokens
  return {
    inputTokens: cacheLowerBound > 0 ? cacheLowerBound : null,
    cacheReadTokens,
    cacheWriteTokens
  }
}

export function measureContextPressure(
  input: ContextPressureMeasurementInput
): ContextPressureMeasurement {
  const contextWindowTokens = nonNegativeInteger(input.contextWindowTokens)
  if (contextWindowTokens <= 0) {
    throw new Error('measureContextPressure 需要正整数 contextWindowTokens')
  }

  const thresholdRatio = normalizeRatio(input.thresholdRatio, 0.8)
  const reserveTokens = Math.min(
    contextWindowTokens,
    nonNegativeInteger(input.reserveTokens)
  )
  const thresholdTokens = Math.floor(contextWindowTokens * thresholdRatio)
  const surfaceEstimateTokens = estimateConservativeContextTokens(input.currentSurface)
  const provider = resolveProviderAnchor(input.providerUsage)
  const hasProviderAnchor = provider.inputTokens != null && typeof input.anchorSurface === 'string'
  const anchorSurfaceEstimateTokens = hasProviderAnchor
    ? estimateConservativeContextTokens(input.anchorSurface as string)
    : null
  const surfaceDeltaTokens = anchorSurfaceEstimateTokens == null
    ? 0
    : surfaceEstimateTokens - anchorSurfaceEstimateTokens

  // The provider anchor contains framing the local surface may not see. Never project below either
  // the current full-surface estimate or zero after applying a negative surface delta.
  const projectedTokens = hasProviderAnchor
    ? Math.max(
        surfaceEstimateTokens,
        0,
        (provider.inputTokens as number) + surfaceDeltaTokens
      )
    : surfaceEstimateTokens
  const pressureTokens = projectedTokens + reserveTokens
  const pressureRatio = contextWindowTokens > 0 ? pressureTokens / contextWindowTokens : 1

  return {
    source: hasProviderAnchor ? 'provider-anchor' : 'local-estimate',
    projectedTokens,
    pressureTokens,
    pressureRatio,
    underPressure: pressureTokens >= thresholdTokens,
    contextWindowTokens,
    thresholdTokens,
    reserveTokens,
    surfaceEstimateTokens,
    anchorInputTokens: hasProviderAnchor ? provider.inputTokens : null,
    anchorSurfaceEstimateTokens,
    surfaceDeltaTokens,
    cacheReadTokens: provider.cacheReadTokens,
    cacheWriteTokens: provider.cacheWriteTokens
  }
}

/** Best-effort normalization for the response shapes already used by Langhuan providers. */
export function readProviderContextUsage(rawOutput: unknown): ProviderContextUsageAnchor | null {
  if (!rawOutput || typeof rawOutput !== 'object') return null
  const output = rawOutput as Record<string, unknown>
  const rawUsage = output.usage
  if (!rawUsage || typeof rawUsage !== 'object') return null
  const usage = rawUsage as Record<string, unknown>
  const details = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? usage.prompt_tokens_details as Record<string, unknown>
    : null
  const inputTokens = nonNegativeInteger(
    usage.promptTokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.input_tokens
  )
  const cacheReadTokens = nonNegativeInteger(
    usage.cacheReadTokens
      ?? usage.cache_read_tokens
      ?? usage.cache_read_input_tokens
      ?? usage.cachedInputTokens
      ?? details?.cached_tokens
  )
  const cacheWriteTokens = nonNegativeInteger(
    usage.cacheWriteTokens
      ?? usage.cache_write_tokens
      ?? usage.cacheCreationTokens
      ?? usage.cache_creation_input_tokens
      ?? details?.cache_write_tokens
  )
  if (!inputTokens && !cacheReadTokens && !cacheWriteTokens) return null
  return { inputTokens, cacheReadTokens, cacheWriteTokens }
}
