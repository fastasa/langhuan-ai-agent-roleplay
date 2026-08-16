// 影子模式（shadow mode，第 7 批）：
// 新模型只参与旁路打分和差异记录，不影响实际回复选择。
// 边界真值（与计划书风险条目一致）：
// 1. 第一版只在桌面端运行；第二个模型按需加载，结束观察即调用 releasePersonalityReranker 释放。
// 2. 差异记录是浏览器本地临时观察台账（localStorage 环形缓冲），不进正式版本台账，不进云快照。
// 3. 影子打分失败绝不影响真实回复链路（全程吞错，只在控制台告警）。

export type PersonalityShadowConfig = {
  versionId: string
  modelPath: string
  versionLabel: string
  startedAt: string
}

export type PersonalityShadowDiffEntry = {
  time: string
  situationExcerpt: string
  basePick: string
  shadowPick: string
  baseScore: number
  shadowScore: number
}

export type PersonalityShadowLog = {
  total: number
  agree: number
  diffs: PersonalityShadowDiffEntry[]
}

const CONFIG_KEY_PREFIX = 'langhuan.personalityShadow.config.'
const LOG_KEY_PREFIX = 'langhuan.personalityShadow.log.'
const MAX_DIFF_ENTRIES = 30
// 桌面端门槛：影子模式双模型内存约翻倍，窄端一律不跑
const DESKTOP_MIN_WIDTH = 900

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function readJson<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (!storageAvailable()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存满或隐私模式：放弃记录，不影响主流程
  }
}

export function getPersonalityShadowConfig(characterId: string): PersonalityShadowConfig | null {
  const config = readJson<PersonalityShadowConfig | null>(`${CONFIG_KEY_PREFIX}${characterId}`, null)
  return config && config.modelPath ? config : null
}

export function startPersonalityShadowObservation(characterId: string, config: Omit<PersonalityShadowConfig, 'startedAt'>): void {
  writeJson(`${CONFIG_KEY_PREFIX}${characterId}`, { ...config, startedAt: new Date().toISOString() })
  writeJson(`${LOG_KEY_PREFIX}${characterId}`, { total: 0, agree: 0, diffs: [] } satisfies PersonalityShadowLog)
}

export async function stopPersonalityShadowObservation(characterId: string): Promise<void> {
  const config = getPersonalityShadowConfig(characterId)
  if (storageAvailable()) {
    window.localStorage.removeItem(`${CONFIG_KEY_PREFIX}${characterId}`)
  }
  if (config?.modelPath) {
    try {
      const { releasePersonalityReranker } = await import('./personalityRerankerBrowser')
      await releasePersonalityReranker(config.modelPath)
    } catch {
      // 释放失败不阻断
    }
  }
}

export function getPersonalityShadowLog(characterId: string): PersonalityShadowLog {
  return readJson<PersonalityShadowLog>(`${LOG_KEY_PREFIX}${characterId}`, { total: 0, agree: 0, diffs: [] })
}

export function clearPersonalityShadowLog(characterId: string): void {
  writeJson(`${LOG_KEY_PREFIX}${characterId}`, { total: 0, agree: 0, diffs: [] } satisfies PersonalityShadowLog)
}

function excerpt(value: unknown, max: number): string {
  const textValue = String(value ?? '').replace(/\s+/g, ' ').trim()
  return textValue.length > max ? `${textValue.slice(0, max)}…` : textValue
}

/**
 * 旁路影子打分：用影子版本模型对同一候选组打分，记录与当前模型首选的排序差异。
 * 从回复链路 fire-and-forget 调用；任何失败都只告警，不影响真实回复。
 */
export async function maybeRunPersonalityShadowScoring(input: {
  characterId: string
  situation: string
  candidates: Array<{ id: string; content: string; score?: number }>
  basePickId: string
}): Promise<void> {
  try {
    if (typeof window === 'undefined' || window.innerWidth < DESKTOP_MIN_WIDTH) return
    const characterId = String(input.characterId || '').trim()
    if (!characterId) return
    const config = getPersonalityShadowConfig(characterId)
    if (!config) return
    const candidates = (input.candidates || []).filter((candidate) => String(candidate.content || '').trim())
    if (candidates.length < 2) return

    const { scorePersonalityPlans } = await import('./personalityRerankerBrowser')
    const shadowScores = await scorePersonalityPlans({
      personalityModelPath: config.modelPath,
      situation: String(input.situation || ''),
      plans: candidates.map((candidate) => String(candidate.content || ''))
    })
    if (shadowScores.length !== candidates.length) return

    let shadowTopIndex = 0
    for (let i = 1; i < shadowScores.length; i += 1) {
      if (shadowScores[i] > shadowScores[shadowTopIndex]) shadowTopIndex = i
    }
    const shadowPickCandidate = candidates[shadowTopIndex]
    const basePickCandidate = candidates.find((candidate) => candidate.id === input.basePickId) || candidates[0]
    const agree = String(shadowPickCandidate.id) === String(basePickCandidate.id)

    const log = getPersonalityShadowLog(characterId)
    log.total += 1
    if (agree) {
      log.agree += 1
    } else {
      log.diffs.unshift({
        time: new Date().toISOString(),
        situationExcerpt: excerpt(input.situation, 60),
        basePick: excerpt(basePickCandidate.content, 50),
        shadowPick: excerpt(shadowPickCandidate.content, 50),
        baseScore: Number(basePickCandidate.score ?? 0),
        shadowScore: Number(shadowScores[shadowTopIndex] ?? 0)
      })
      log.diffs = log.diffs.slice(0, MAX_DIFF_ENTRIES)
    }
    writeJson(`${LOG_KEY_PREFIX}${characterId}`, log)
  } catch (error) {
    console.warn('[personality-shadow] 影子打分失败（不影响真实回复）:', error)
  }
}
