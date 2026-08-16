import { addHistory } from '../shared/dbUtils.js'
import { createWorkspaceMetaRepository, workspaceMetaRepository } from '../../repositories/workspaceMetaRepository.js'
import { encryptApiSecret } from '../../security/localSecretCrypto.js'

function buildEventStackSummary(events: Array<Record<string, any>>) {
  let totalPoints = 0
  let totalMoney = 0
  const ticketChanges: Record<string, { used: number, exchanged: number }> = {}

  for (const event of events) {
    totalPoints += Number(event.pointsDelta || 0)
    totalMoney += Number(event.moneyDelta || 0)

    if (event.ticketsUsed && typeof event.ticketsUsed === 'object') {
      for (const [name, count] of Object.entries(event.ticketsUsed)) {
        if (!ticketChanges[name]) ticketChanges[name] = { used: 0, exchanged: 0 }
        ticketChanges[name].used += Number(count || 0)
      }
    }

    if (event.ticketsExchanged && typeof event.ticketsExchanged === 'object') {
      for (const [name, count] of Object.entries(event.ticketsExchanged)) {
        if (!ticketChanges[name]) ticketChanges[name] = { used: 0, exchanged: 0 }
        ticketChanges[name].exchanged += Number(count || 0)
      }
    }
  }

  return { totalPoints, totalMoney, ticketChanges }
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function getLocalDateKey(input: string | number | Date = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date()
    return `${fallback.getFullYear()}-${padDatePart(fallback.getMonth() + 1)}-${padDatePart(fallback.getDate())}`
  }
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

function createPromptPresetId(): string {
  return `custom_preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeBooleanFlag(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

function normalizePromptPresetForReplace(raw: Record<string, any>, index: number, usedIds: Set<string>) {
  let id = String(raw.id || '').trim()
  if (!id) id = `imported_preset_${Date.now()}_${index}`
  while (usedIds.has(id)) {
    id = `${id}_${index + 1}`
  }
  usedIds.add(id)
  return {
    id,
    name: String(raw.name || `导入预设${index + 1}`),
    content: String(raw.content || ''),
    role: String(raw.role || 'system'),
    scene: String(raw.scene || 'all'),
    frequency: raw.frequency ?? 'always',
    enabled: normalizeBooleanFlag(raw.enabled, true) ? 1 : 0,
    orderIndex: index,
    promptGroup: String(raw.promptGroup ?? raw.prompt_group ?? 'system'),
    usageMode: String(raw.usageMode ?? raw.usage_mode ?? 'always'),
    scope: String(raw.scope ?? 'general'),
    isRequired: raw.isRequired != null || raw.is_required != null
      ? (normalizeBooleanFlag(raw.isRequired ?? raw.is_required, false) ? 1 : 0)
      : null,
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : index,
    summary: String(raw.summary || ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString())
  }
}

export function createWorkspaceMetaAppService(
  repository: ReturnType<typeof createWorkspaceMetaRepository> = workspaceMetaRepository
) {
  return {
    getSummaryLibrary() {
      return repository.getSummaryLibrary()
    },
    addSummary(payload: Record<string, any>) {
      const { id, title, content, tags, charId } = payload
      repository.insertSummary({
        id,
        title: title ?? '',
        content,
        tags: JSON.stringify(tags ?? []),
        charId: charId ?? ''
      })
      return { ok: true }
    },
    updateSummary(id: string, payload: Record<string, any>) {
      const { title, content, tags } = payload
      repository.updateSummary(id, {
        title,
        content,
        tags: tags ? JSON.stringify(tags) : null
      })
      return { ok: true }
    },
    deleteSummary(id: string) {
      repository.deleteSummary(id)
      return { ok: true }
    },
    getSmallSummaries() {
      return repository.getSmallSummaries()
    },
    addSmallSummary(payload: Record<string, any>) {
      const { id, charId, sessionId, name, content, tags } = payload
      repository.insertSmallSummary({
        id: id || '',
        charId: charId || '',
        sessionId: sessionId || '',
        name: name || '',
        content,
        tags: JSON.stringify(tags || [])
      })
      return { ok: true }
    },
    updateSmallSummary(id: string, payload: Record<string, any>) {
      const { name, content, tags } = payload
      repository.updateSmallSummary(id, {
        name: name || '',
        content: content || '',
        tags: JSON.stringify(tags || [])
      })
      return { ok: true }
    },
    deleteSmallSummary(id: string) {
      repository.deleteSmallSummary(id)
      return { ok: true }
    },
    getBigSummaries() {
      return repository.getBigSummaries()
    },
    addBigSummary(payload: Record<string, any>) {
      const { id, name, content, mergedSummaryIds } = payload
      repository.insertBigSummary({
        id: id || '',
        name: name || '',
        content: content || '',
        mergedSummaryIds: JSON.stringify(mergedSummaryIds || [])
      })
      return { ok: true }
    },
    updateBigSummary(id: string, payload: Record<string, any>) {
      const { name, content, mergedSummaryIds } = payload
      repository.updateBigSummary(id, {
        name: name || '',
        content: content || '',
        mergedSummaryIds: JSON.stringify(mergedSummaryIds || [])
      })
      return { ok: true }
    },
    deleteBigSummary(id: string) {
      repository.deleteBigSummary(id)
      return { ok: true }
    },
    getApiPresets() {
      return repository.getApiPresets()
    },
    addApiPreset(payload: Record<string, any>) {
      const name = String(payload.name || '').trim()
      if (!name) return { ok: false, status: 400, error: 'API 预设名称不能为空' }
      if (repository.getApiPresets?.().some((item: any) => String(item.name || '').trim() === name)) {
        return { ok: false, status: 409, error: `API 预设「${name}」已存在` }
      }
      const normalizedIsDefault = !!(payload.isDefault ?? payload.is_default)
      if (normalizedIsDefault) {
        repository.clearDefaultApiPreset()
      }
      repository.upsertApiPreset({
        name,
        providerType: payload.providerType ?? payload.provider_type ?? 'openai-compatible',
        baseUrl: payload.baseUrl ?? payload.base_url ?? '',
        apiKey: payload.apiKey ?? payload.api_key ?? '',
        model: payload.model ?? '',
        availableModels: JSON.stringify(payload.availableModels ?? payload.available_models ?? []),
        maxTokens: payload.maxTokens ?? payload.max_tokens ?? 4096,
        temperature: payload.temperature ?? 0.7,
        isDefault: normalizedIsDefault,
        fallbackPreset: payload.fallbackPreset ?? payload.fallback_preset ?? '',
        maxConcurrency: payload.maxConcurrency ?? payload.max_concurrency ?? 6,
        minInterval: payload.minInterval ?? payload.min_interval ?? 0,
        supportsVision: !!(payload.supportsVision ?? payload.supports_vision)
      })
      return { ok: true }
    },
    updateApiPreset(name: string, payload: Record<string, any>) {
      const originalName = String(name || '').trim()
      const nextName = String(payload.name ?? originalName).trim()
      if (!originalName) return { ok: false, status: 400, error: '缺少要更新的 API 预设' }
      if (!nextName) return { ok: false, status: 400, error: 'API 预设名称不能为空' }
      if (nextName !== originalName && repository.getApiPresets?.().some((item: any) => String(item.name || '').trim() === nextName)) {
        return { ok: false, status: 409, error: `API 预设「${nextName}」已存在` }
      }
      const normalizedIsDefault = payload.isDefault ?? payload.is_default
      const updates: string[] = []
      const values: Array<string | number | null> = []
      if (payload.name !== undefined) {
        updates.push('name = ?')
        values.push(nextName)
      }
      if (payload.providerType !== undefined || payload.provider_type !== undefined) {
        updates.push('provider_type = ?')
        values.push(payload.providerType ?? payload.provider_type)
      }
      if (payload.baseUrl !== undefined || payload.base_url !== undefined) {
        updates.push('base_url = ?')
        values.push(payload.baseUrl ?? payload.base_url)
      }
      if (payload.apiKey !== undefined || payload.api_key !== undefined) {
        const nextApiKey = String(payload.apiKey ?? payload.api_key ?? '').trim()
        if (nextApiKey) {
          updates.push('api_key = ?')
          values.push(encryptApiSecret(nextApiKey))
        }
      }
      if (payload.model !== undefined) {
        updates.push('model = ?')
        values.push(payload.model)
      }
      if (payload.availableModels !== undefined || payload.available_models !== undefined) {
        updates.push('available_models = ?')
        values.push(JSON.stringify(payload.availableModels ?? payload.available_models ?? []))
      }
      if (payload.maxTokens !== undefined || payload.max_tokens !== undefined) {
        updates.push('max_tokens = ?')
        values.push(payload.maxTokens ?? payload.max_tokens)
      }
      if (payload.temperature !== undefined) {
        updates.push('temperature = ?')
        values.push(payload.temperature)
      }
      if (normalizedIsDefault !== undefined) {
        updates.push('is_default = ?')
        values.push(normalizedIsDefault ? 1 : 0)
      }
      if (payload.fallbackPreset !== undefined || payload.fallback_preset !== undefined) {
        updates.push('fallback_preset = ?')
        values.push(payload.fallbackPreset ?? payload.fallback_preset)
      }
      if (payload.maxConcurrency !== undefined || payload.max_concurrency !== undefined) {
        updates.push('max_concurrency = ?')
        values.push(payload.maxConcurrency ?? payload.max_concurrency)
      }
      if (payload.minInterval !== undefined || payload.min_interval !== undefined) {
        updates.push('min_interval = ?')
        values.push(payload.minInterval ?? payload.min_interval)
      }
      if (payload.supportsVision !== undefined || payload.supports_vision !== undefined) {
        updates.push('supports_vision = ?')
        values.push((payload.supportsVision ?? payload.supports_vision) ? 1 : 0)
      }
      if (normalizedIsDefault) {
        repository.clearDefaultApiPreset()
      }
      repository.updateApiPreset(name, updates, values)
      return { ok: true }
    },
    deleteApiPreset(name: string) {
      repository.deleteApiPreset(name)
      return { ok: true }
    },
    getPromptPresets() {
      return repository.getPromptPresets()
    },
    addPromptPreset(payload: Record<string, any>) {
      const updatedAt = String(payload.updatedAt ?? payload.updated_at ?? new Date().toISOString())
      repository.insertPromptPreset({
        id: String(payload.id || '').trim() || createPromptPresetId(),
        name: payload.name,
        content: payload.content,
        role: payload.role ?? 'system',
        scene: payload.scene ?? 'all',
        frequency: payload.frequency ?? 1,
        enabled: payload.enabled !== false,
        orderIndex: payload.orderIndex ?? 0,
        promptGroup: payload.promptGroup ?? payload.prompt_group ?? 'system',
        usageMode: payload.usageMode ?? payload.usage_mode ?? 'always',
        scope: payload.scope ?? 'general',
        isRequired: payload.isRequired ?? payload.is_required ?? null,
        priority: payload.priority ?? payload.orderIndex ?? 0,
        summary: payload.summary ?? '',
        updatedAt
      })
      return { ok: true }
    },
    updatePromptPreset(id: string, payload: Record<string, any>) {
      repository.updatePromptPreset(id, {
        name: payload.name,
        content: payload.content,
        role: payload.role,
        scene: payload.scene,
        frequency: payload.frequency,
        enabled: payload.enabled != null ? (payload.enabled ? 1 : 0) : null,
        orderIndex: payload.orderIndex,
        promptGroup: payload.promptGroup ?? payload.prompt_group,
        usageMode: payload.usageMode ?? payload.usage_mode,
        scope: payload.scope,
        isRequired: payload.isRequired != null || payload.is_required != null
          ? ((payload.isRequired ?? payload.is_required) ? 1 : 0)
          : null,
        priority: payload.priority,
        summary: payload.summary,
        updatedAt: String(payload.updatedAt ?? payload.updated_at ?? new Date().toISOString())
      })
      return { ok: true }
    },
    deletePromptPreset(id: string) {
      repository.deletePromptPreset(id)
      return { ok: true }
    },
    replacePromptPresets(payload: Record<string, any>) {
      const source = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload.promptPresets) ? payload.promptPresets : [])
      if (!source.length) {
        return { ok: false as const, status: 400, error: 'JSON 里没有可导入的预设' }
      }
      const usedIds = new Set<string>()
      const rows = source.map((item: Record<string, any>, index: number) => (
        normalizePromptPresetForReplace(item || {}, index, usedIds)
      ))
      repository.replacePromptPresets(rows)
      return { ok: true as const, data: { ok: true, count: rows.length } }
    },
    getCustomTags() {
      return repository.getCustomTags()
    },
    addCustomTag(payload: Record<string, any>) {
      const { id, name, color } = payload
      if (!id || !name || !color) {
        return { ok: false as const, status: 400, error: '缺少必要参数' }
      }
      repository.insertCustomTag({ id, name, color })
      return { ok: true as const, data: { ok: true } }
    },
    updateCustomTag(id: string, payload: Record<string, any>) {
      repository.updateCustomTag(id, {
        name: payload.name,
        color: payload.color
      })
      return { ok: true }
    },
    deleteCustomTag(id: string) {
      repository.deleteCustomTag(id)
      return { ok: true }
    },
    getEventStack(date?: string) {
      if (date) {
        const events = repository.getEventStack(date)
        return { events, summary: buildEventStackSummary(events as Array<Record<string, any>>), date }
      }
      return repository.getEventStack()
    },
    addEventStack(payload: Record<string, any>) {
      const {
        id, date, taskId, taskName, taskType, status, expReward,
        durationSeconds, timeAxis, notes,
        ticketsUsed, ticketsExchanged, pointsDelta, moneyDelta, timeBlocks,
        realLocation, realWeather, realTime, timelineJson
      } = payload
      if (!id || !date || !taskName) {
        return { ok: false as const, status: 400, error: '缺少必要参数' }
      }
      repository.insertEventStack({
        id,
        date,
        taskId: taskId || null,
        taskName,
        taskType: taskType || 'daily',
        status: status || '',
        expReward: expReward || 0,
        durationSeconds: durationSeconds || 0,
        timeAxis: timeAxis || null,
        notes: notes || null,
        ticketsUsed: ticketsUsed ? JSON.stringify(ticketsUsed) : null,
        ticketsExchanged: ticketsExchanged ? JSON.stringify(ticketsExchanged) : null,
        pointsDelta: pointsDelta || 0,
        moneyDelta: moneyDelta || 0,
        timeBlocks: timeBlocks ? JSON.stringify(timeBlocks) : null,
        realLocation: realLocation || '',
        realWeather: realWeather || '',
        realTime: realTime || '',
        timelineJson: timelineJson ? JSON.stringify(timelineJson) : '[]'
      })
      return { ok: true as const, data: { ok: true } }
    },
    updateEventStack(id: string, payload: Record<string, any>) {
      repository.updateEventStack(id, {
        date: payload.date ?? null,
        taskId: payload.taskId ?? null,
        taskName: payload.taskName ?? null,
        taskType: payload.taskType ?? null,
        status: payload.status ?? null,
        expReward: payload.expReward ?? null,
        durationSeconds: payload.durationSeconds ?? null,
        timeAxis: payload.timeAxis ?? null,
        notes: payload.notes ?? null,
        ticketsUsed: payload.ticketsUsed !== undefined ? JSON.stringify(payload.ticketsUsed) : null,
        ticketsExchanged: payload.ticketsExchanged !== undefined ? JSON.stringify(payload.ticketsExchanged) : null,
        pointsDelta: payload.pointsDelta ?? null,
        moneyDelta: payload.moneyDelta ?? null,
        timeBlocks: payload.timeBlocks !== undefined ? JSON.stringify(payload.timeBlocks) : null,
        realLocation: payload.realLocation ?? null,
        realWeather: payload.realWeather ?? null,
        realTime: payload.realTime ?? null,
        timelineJson: payload.timelineJson !== undefined ? JSON.stringify(payload.timelineJson) : null
      })
      return { ok: true }
    },
    deleteEventStack(id: string) {
      repository.deleteEventStack(id)
      return { ok: true }
    },
    getTodayEventStack(date?: string) {
      const targetDate = date || getLocalDateKey()
      const events = repository.getEventStack(targetDate)
      return { events, summary: buildEventStackSummary(events as Array<Record<string, any>>), date: targetDate }
    },
    getHistory() {
      return repository.getHistory()
    },
    addHistoryEntry(payload: Record<string, any>) {
      addHistory(payload.action, payload.detail ?? '')
      return { ok: true }
    }
  }
}

export const workspaceMetaAppService = createWorkspaceMetaAppService()
