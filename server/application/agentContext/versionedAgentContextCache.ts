import { createHash } from 'node:crypto'
import type { AgentContextBundle } from '../../../shared/agentContextProjection.js'

export const AGENT_CONTEXT_CACHE_SCHEMA_VERSION = 'agent-context-cache-v1'

export interface AgentContextCacheStats {
  entries: number
  hits: number
  misses: number
  writes: number
  evictions: number
}

function stableValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value !== 'object') return value
  if (seen.has(value as object)) return '[Circular]'
  seen.add(value as object)
  if (Array.isArray(value)) {
    const result = value.map((item) => stableValue(item, seen))
    seen.delete(value)
    return result
  }
  const record = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    result[key] = stableValue(record[key], seen)
  }
  seen.delete(value as object)
  return result
}

export function digestAgentContextCacheValue(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

function cloneBundle(bundle: AgentContextBundle): AgentContextBundle {
  if (typeof structuredClone === 'function') return structuredClone(bundle)
  return JSON.parse(JSON.stringify(bundle)) as AgentContextBundle
}

/**
 * 有界、版本键驱动的投影缓存。调用方必须把配方版本、作用域、视角、输入锚点和来源修订摘要都放进 key。
 * 缓存完整 bundle（包括首次生成的 generatedAt），让未变来源产生逐字稳定的上下文信封。
 */
export function createVersionedAgentContextCache(options: { maxEntries?: number } = {}) {
  const maxEntries = Math.max(1, Math.trunc(Number(options.maxEntries || 128)))
  const entries = new Map<string, AgentContextBundle>()
  const counters = { hits: 0, misses: 0, writes: 0, evictions: 0 }

  return {
    get(key: string): AgentContextBundle | null {
      const value = entries.get(key)
      if (!value) {
        counters.misses += 1
        return null
      }
      counters.hits += 1
      entries.delete(key)
      entries.set(key, value)
      return cloneBundle(value)
    },
    set(key: string, bundle: AgentContextBundle): void {
      if (entries.has(key)) entries.delete(key)
      entries.set(key, cloneBundle(bundle))
      counters.writes += 1
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value as string | undefined
        if (!oldest) break
        entries.delete(oldest)
        counters.evictions += 1
      }
    },
    clear(): void {
      entries.clear()
    },
    stats(): AgentContextCacheStats {
      return { entries: entries.size, ...counters }
    }
  }
}

export type VersionedAgentContextCache = ReturnType<typeof createVersionedAgentContextCache>
