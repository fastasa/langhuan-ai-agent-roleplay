import type { Ref } from 'vue'
import {
  fetchApiModels,
  testApiEndpointConnection
} from '../../repositories/settingRepository'
import { getAiProviderTemplate, isKeylessAiProvider, normalizeAiProviderType } from '../../../shared/aiProviders'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ApiPresetItem {
  name?: string
  originalName?: string
  providerType?: string
  provider_type?: string
  baseUrl?: string
  apiUrl?: string
  apiKey?: string
  hasApiKey?: boolean
  model?: string
  availableModels?: string[]
  isDefault?: boolean
  maxConcurrency?: number
  minInterval?: number
  supportsVision?: boolean
}

interface ApiPresetFormState {
  originalName?: string
  name: string
  providerType: string
  apiUrl: string
  apiKey: string
  hasApiKey?: boolean
  model?: string
  temperature?: number
  maxTokens?: number
  fallbackPreset?: string
  isDefault?: boolean
  maxConcurrency?: number
  minInterval?: number
  supportsVision?: boolean
}

interface ApiPresetContext {
  settingStore: {
    apiPresets: ApiPresetItem[]
    updateApiPreset: (name: string, data: Partial<ApiPresetItem>) => Promise<void>
    addApiPreset: (data: ApiPresetItem & { name: string; model: string }) => Promise<void>
  }
  apiPresetForm: ApiPresetFormState
  modelList: Ref<Array<{ id: string }>>
  showAddApiPreset: Ref<boolean>
  showEditApiPreset: Ref<boolean>
  currentApiPresetIndex: Ref<number>
  isLoadingModels: Ref<boolean>
  isTestingApi: Ref<boolean>
  toast: (msg: string, type?: ToastType) => void
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err ?? '')
}

export function useApiPresetManager({
  settingStore,
  apiPresetForm,
  modelList,
  showAddApiPreset,
  showEditApiPreset,
  currentApiPresetIndex,
  isLoadingModels,
  isTestingApi,
  toast
}: ApiPresetContext) {
  function editApiPreset(preset: ApiPresetItem) {
    apiPresetForm.originalName = preset.originalName || preset.name || ''
    apiPresetForm.name = preset.name || ''
    apiPresetForm.providerType = normalizeAiProviderType(preset.providerType || preset.provider_type)
    apiPresetForm.apiUrl = preset.baseUrl || preset.apiUrl || ''
    apiPresetForm.apiKey = ''
    apiPresetForm.hasApiKey = Boolean(preset.hasApiKey)
    apiPresetForm.model = ''
    apiPresetForm.temperature = undefined
    apiPresetForm.maxTokens = undefined
    apiPresetForm.fallbackPreset = ''
    apiPresetForm.isDefault = preset.isDefault || false
    apiPresetForm.maxConcurrency = preset.maxConcurrency ?? 6
    apiPresetForm.minInterval = preset.minInterval ?? 0
    apiPresetForm.supportsVision = Boolean(preset.supportsVision)
    modelList.value = []
    showEditApiPreset.value = true
  }

  function loadApiPreset(index: number) {
    const preset = settingStore.apiPresets[index]
    if (!preset) return
    currentApiPresetIndex.value = index
    apiPresetForm.originalName = preset.originalName || preset.name || ''
    apiPresetForm.name = preset.name || ''
    apiPresetForm.providerType = normalizeAiProviderType(preset.providerType || preset.provider_type)
    apiPresetForm.apiUrl = preset.baseUrl || preset.apiUrl || ''
    apiPresetForm.apiKey = ''
    apiPresetForm.hasApiKey = Boolean(preset.hasApiKey)
    apiPresetForm.model = ''
    apiPresetForm.temperature = undefined
    apiPresetForm.maxTokens = undefined
    apiPresetForm.fallbackPreset = ''
    apiPresetForm.isDefault = preset.isDefault || false
    apiPresetForm.maxConcurrency = preset.maxConcurrency ?? 6
    apiPresetForm.minInterval = preset.minInterval ?? 0
    apiPresetForm.supportsVision = Boolean(preset.supportsVision)
    modelList.value = []
    showEditApiPreset.value = true
    showAddApiPreset.value = false
  }

  function addNewApiPreset() {
    Object.assign(apiPresetForm, { originalName: '', name: '', providerType: 'openai-compatible', apiUrl: '', apiKey: '', hasApiKey: false, model: '', temperature: undefined, maxTokens: undefined, fallbackPreset: '', maxConcurrency: 6, minInterval: 0, supportsVision: false })
    modelList.value = []
    showAddApiPreset.value = true
    showEditApiPreset.value = false
    currentApiPresetIndex.value = -1
  }

  async function loadModels() {
    // 本机订阅桥无需密钥，只要求地址模板值存在
    if (!apiPresetForm.apiUrl || (!isKeylessAiProvider(apiPresetForm.providerType) && !apiPresetForm.apiKey && !apiPresetForm.hasApiKey)) {
      toast('\u8BF7\u5148\u586B\u5199API\u5730\u5740\u548C\u5BC6\u94A5', 'error')
      return
    }
    isLoadingModels.value = true
    try {
      const savedPresetName = String(apiPresetForm.originalName || apiPresetForm.name || '').trim()
      const useSavedPresetKey = !apiPresetForm.apiKey && apiPresetForm.hasApiKey && savedPresetName
      modelList.value = await fetchApiModels(useSavedPresetKey
        ? { presetName: savedPresetName }
        : {
            baseUrl: apiPresetForm.apiUrl,
            apiKey: apiPresetForm.apiKey,
            providerType: apiPresetForm.providerType,
            allowDirectConfig: true
          })
      if (savedPresetName && settingStore.apiPresets.some((preset) => preset.name === savedPresetName)) {
        await settingStore.updateApiPreset(savedPresetName, {
          availableModels: modelList.value.map((item) => item.id)
        })
      }
      toast(`\u5DF2\u52A0\u8F7D ${modelList.value.length} \u4E2A\u6A21\u578B`, 'success')
    } catch (e: unknown) {
      toast(`\u52A0\u8F7D\u6A21\u578B\u5931\u8D25: ${getErrorMessage(e)}`, 'error')
    } finally {
      isLoadingModels.value = false
    }
  }

  async function testApiConnection() {
    // 与 loadModels 同口径：本机订阅桥免密钥
    if (!apiPresetForm.apiUrl || (!isKeylessAiProvider(apiPresetForm.providerType) && !apiPresetForm.apiKey && !apiPresetForm.hasApiKey)) {
      toast('\u8BF7\u5148\u586B\u5199API\u5730\u5740\u548C\u5BC6\u94A5', 'error')
      return
    }
    isTestingApi.value = true
    try {
      const savedPresetName = String(apiPresetForm.originalName || apiPresetForm.name || '').trim()
      const useSavedPresetKey = !apiPresetForm.apiKey && apiPresetForm.hasApiKey && savedPresetName
      const result = await testApiEndpointConnection(useSavedPresetKey
        ? { presetName: savedPresetName }
        : {
            baseUrl: apiPresetForm.apiUrl,
            apiKey: apiPresetForm.apiKey,
            providerType: apiPresetForm.providerType,
            allowDirectConfig: true
          })
      if (result.ok) {
        toast('\u8FDE\u63A5\u6210\u529F', 'success')
      } else {
        toast(`\u8FDE\u63A5\u5931\u8D25: ${result.error || result.status}`, 'error')
      }
    } catch (e: unknown) {
      toast(`\u8FDE\u63A5\u9519\u8BEF: ${getErrorMessage(e)}`, 'error')
    } finally {
      isTestingApi.value = false
    }
  }

  async function saveApiPreset() {
    const nextName = String(apiPresetForm.name || '').trim()
    const originalName = String(apiPresetForm.originalName || '').trim()
    if (!nextName) {
      toast('\u8BF7\u586B\u5199\u9884\u8BBE\u540D', 'error')
      return
    }
    const duplicate = settingStore.apiPresets.some((preset) => {
      const name = String(preset.name || '').trim()
      return name === nextName && (!showEditApiPreset.value || name !== originalName)
    })
    if (duplicate) {
      toast('\u5DF2\u5B58\u5728\u540C\u540D API \u9884\u8BBE', 'error')
      return
    }
    const data: ApiPresetItem & { name: string; model: string } = {
      name: nextName,
      providerType: apiPresetForm.providerType,
      baseUrl: apiPresetForm.apiUrl,
      model: '',
      isDefault: apiPresetForm.isDefault,
      maxConcurrency: apiPresetForm.maxConcurrency ?? 6,
      minInterval: apiPresetForm.minInterval ?? 0,
      supportsVision: Boolean(apiPresetForm.supportsVision)
    }
    if (apiPresetForm.apiKey) {
      data.apiKey = apiPresetForm.apiKey
    }
    try {
      if (showEditApiPreset.value) {
        await settingStore.updateApiPreset(originalName || nextName, data)
        apiPresetForm.originalName = nextName
        apiPresetForm.hasApiKey = Boolean(apiPresetForm.hasApiKey || apiPresetForm.apiKey)
        const idx = settingStore.apiPresets.findIndex((p) => p.name === nextName)
        if (idx >= 0) currentApiPresetIndex.value = idx
      } else {
        await settingStore.addApiPreset(data)
        apiPresetForm.originalName = nextName
        apiPresetForm.hasApiKey = Boolean(apiPresetForm.apiKey)
        showAddApiPreset.value = false
        showEditApiPreset.value = true
        const idx = settingStore.apiPresets.findIndex((p) => p.name === nextName)
        if (idx >= 0) currentApiPresetIndex.value = idx
      }
      toast('API\u9884\u8BBE\u5DF2\u4FDD\u5B58', 'success')
    } catch (err: unknown) {
      toast(`\u4FDD\u5B58\u5931\u8D25: ${getErrorMessage(err)}`, 'error')
    }
  }

  async function runSaveApiPresetCommand() {
    await saveApiPreset()
  }

  function applyProviderTemplate(providerType: string) {
    const template = getAiProviderTemplate(providerType)
    apiPresetForm.providerType = template.type
    apiPresetForm.apiUrl = template.baseUrl
    if (!apiPresetForm.name) {
      apiPresetForm.name = template.label
    }
    apiPresetForm.model = ''
    apiPresetForm.temperature = undefined
    apiPresetForm.maxTokens = undefined
    modelList.value = []
  }

  return {
    editApiPreset,
    loadApiPreset,
    addNewApiPreset,
    loadModels,
    testApiConnection,
    saveApiPreset,
    runSaveApiPresetCommand,
    applyProviderTemplate
  }
}
