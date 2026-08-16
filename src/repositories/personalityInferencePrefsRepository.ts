import { API } from '../config/api'

// 本地人格模型推理位置偏好；服务端推理能力始终开放。

export type PersonalityInferenceMode = 'auto' | 'local' | 'server'
export type PersonalityInferencePrefs = { serverAllowed: boolean; mode: PersonalityInferenceMode }

const DEFAULT_PREFS: PersonalityInferencePrefs = { serverAllowed: true, mode: 'auto' }

let cachedMyPrefsPromise: Promise<PersonalityInferencePrefs> | null = null

function normalizeMode(value: unknown): PersonalityInferenceMode {
  const raw = String(value ?? '').trim().toLowerCase()
  return raw === 'local' || raw === 'server' ? raw : 'auto'
}

function normalizePrefs(value: unknown): PersonalityInferencePrefs {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFS }
  const record = value as Record<string, unknown>
  return {
    serverAllowed: record.serverAllowed !== false,
    mode: normalizeMode(record.mode)
  }
}

/** 发送链路用：读取本地偏好；带缓存，失败时回退 auto。 */
export async function fetchMyPersonalityInferencePrefs(): Promise<PersonalityInferencePrefs> {
  if (!cachedMyPrefsPromise) {
    cachedMyPrefsPromise = (async () => {
      try {
        const response = await fetch(API.PERSONALITY_RERANKER_PREFERENCES)
        if (!response.ok) return { ...DEFAULT_PREFS }
        return normalizePrefs(await response.json())
      } catch {
        return { ...DEFAULT_PREFS }
      }
    })()
  }
  return cachedMyPrefsPromise
}

export function invalidateMyPersonalityInferencePrefsCache(): void {
  cachedMyPrefsPromise = null
}

/** 保存本地推理位置偏好；成功后失效缓存。 */
export async function saveMyPersonalityInferenceMode(mode: PersonalityInferenceMode): Promise<PersonalityInferencePrefs> {
  const response = await fetch(API.PERSONALITY_RERANKER_PREFERENCES, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  })
  if (!response.ok) throw new Error('保存推理偏好失败')
  invalidateMyPersonalityInferencePrefsCache()
  return normalizePrefs(await response.json())
}
