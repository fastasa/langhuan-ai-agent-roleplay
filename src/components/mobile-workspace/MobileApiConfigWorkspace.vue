<template>
  <div class="mobile-api-workspace">
    <MobileTopBar
      :title="$t('mobile.apiWs.title')"
      :crumb="$t('mobile.tab.me')"
      :subtitle="topSubtitle"
      variant="detail"
      show-back
      @back="$emit('back')"
    />

    <div class="mobile-api-tabs" role="tablist" :aria-label="$t('mobile.apiWs.tabsAria')">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="mobile-api-body lhm-scroll">
      <section v-if="activeTab === 'presets'" class="mobile-api-section" :aria-label="$t('mobile.apiWs.modelPresets')">
        <div class="mobile-api-block">
          <div class="mobile-api-block__head">
            <div>
              <strong>{{ $t('mobile.apiWs.aiSource') }}</strong>
              <small>{{ sourceSummary }}</small>
            </div>
          </div>
          <div class="mobile-api-segmented" role="group" :aria-label="$t('mobile.me.aiSourceModeAria')">
            <button type="button" class="active">{{ $t('mobile.apiWs.providerOwnApi') }}</button>
          </div>
        </div>

        <template>
          <div class="mobile-api-block">
            <div class="mobile-api-block__head">
              <div>
                <strong>{{ $t('mobile.apiWs.ownApiPresets') }}</strong>
                <small>{{ $t('mobile.apiWs.defaultPrefix', { name: effectiveDefaultPresetName || $t('mobile.me.notSet') }) }}</small>
              </div>
              <button type="button" class="mobile-api-lite-button" @click="startNewPreset">{{ $t('common.create') }}</button>
            </div>
            <div v-if="apiPresets.length" class="mobile-api-preset-list">
              <button
                v-for="(preset, index) in apiPresets"
                :key="`${String(preset.name || index)}-${index}`"
                type="button"
                class="mobile-api-preset-row"
                :class="{ active: selectedPresetIndex === index }"
                @click="selectPreset(index)"
              >
                <span>{{ preset.name || $t('mobile.apiWs.unnamedPreset') }}</span>
                <small>{{ isDefaultPreset(preset) ? $t('mobile.apiWs.currentDefault') : formatPresetProvider(preset) }}</small>
              </button>
            </div>
            <div v-else class="mobile-api-empty">{{ $t('mobile.apiWs.noOwnPresets') }}</div>
          </div>

          <div class="mobile-api-block">
            <div class="mobile-api-block__head">
              <div>
                <strong>{{ editingExistingPreset ? $t('mobile.apiWs.editPreset') : $t('mobile.apiWs.newPreset') }}</strong>
                <small>{{ draftPresetForm.hasApiKey && !draftPresetForm.apiKey ? $t('mobile.apiWs.keySavedHint') : $t('mobile.apiWs.savedSyncHint') }}</small>
              </div>
            </div>
            <div class="mobile-api-form">
              <label>
                <span>{{ $t('mobile.apiWs.provider') }}</span>
                <select :value="draftPresetForm.providerType" @change="applyProviderTemplate(($event.target as HTMLSelectElement).value)">
                  <option
                    v-for="provider in apiConfig.apiProviderTemplates"
                    :key="String(provider.id || provider.name)"
                    :value="String(provider.id || provider.name)"
                  >
                    {{ provider.name }}
                  </option>
                </select>
              </label>
              <label>
                <span>{{ $t('mobile.apiWs.presetNameLabel') }}</span>
                <input v-model="draftPresetForm.name" :placeholder="$t('mobile.apiWs.presetNamePlaceholder')">
              </label>
              <label>
                <span>{{ $t('mobile.apiWs.apiUrl') }}</span>
                <input v-model="draftPresetForm.apiUrl" placeholder="https://api.deepseek.com">
              </label>
              <label>
                <span>{{ $t('mobile.apiWs.apiKey') }}</span>
                <input v-model="draftPresetForm.apiKey" type="password" :placeholder="draftPresetForm.hasApiKey ? $t('mobile.apiWs.keySavedPlaceholder') : 'sk-xxx'">
              </label>
            </div>
            <div class="mobile-api-inline-actions">
              <button type="button" class="mobile-api-lite-button" :disabled="!draftPresetForm.name || effectiveDefaultPresetName === draftPresetForm.name" @click="setDraftDefaultPreset(draftPresetForm.name)">{{ $t('mobile.apiWs.setDefault') }}</button>
              <button type="button" class="mobile-api-lite-button" :disabled="!canUseDraftApi" @click="testConnection">{{ $t('mobile.me.testConnection') }}</button>
            </div>
            <div class="mobile-api-footer-actions">
              <button v-if="editingExistingPreset && apiPresets.length > 1" type="button" class="mobile-api-danger-button" @click="confirmDeleteOpen = true">{{ $t('mobile.apiWs.deletePreset') }}</button>
              <button type="button" class="mobile-api-primary-button" @click="savePresetSettings">{{ $t('mobile.apiWs.saveConfig') }}</button>
            </div>
          </div>
        </template>
      </section>

      <section v-else-if="activeTab === 'agent'" class="mobile-api-section" :aria-label="$t('mobile.apiWs.tabAgent')">
        <div class="mobile-api-block">
          <div class="mobile-api-block__head">
            <div>
              <strong>{{ $t('mobile.apiWs.modelUsage') }}</strong>
              <small>{{ $t('mobile.apiWs.modelUsageHint') }}</small>
            </div>
            <button type="button" class="mobile-api-primary-button mobile-api-primary-button--compact" @click="saveAgentSettings">{{ $t('common.save') }}</button>
          </div>
          <div class="mobile-api-usage-list">
            <article v-for="slot in modelUsageSlots" :key="slot.id" class="mobile-api-usage-card">
              <div class="mobile-api-usage-card__title">
                <strong>{{ slot.label }}</strong>
                <small>{{ slot.hint }}</small>
              </div>
              <label>
                <span>{{ $t('mobile.apiWs.readonlyPreset') }}</span>
                <select
                  :value="getUsageConfig(slot.id).presetName"
                  @change="selectUsagePreset(slot.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ $t('mobile.apiWs.followGlobal') }}</option>
                  <option v-for="preset in apiPresets" :key="`${slot.id}-${String(preset.name)}`" :value="String(preset.name || '')">{{ preset.name }}</option>
                </select>
              </label>
              <label>
                <span>{{ $t('mobile.apiWs.modelLabel') }}</span>
                <input
                  :value="getUsageConfig(slot.id).model"
                  :placeholder="$t('mobile.apiWs.followPreset')"
                  @input="updateUsageModel(slot.id, ($event.target as HTMLInputElement).value)"
                >
              </label>
              <div class="mobile-api-inline-actions">
                <button type="button" class="mobile-api-lite-button" :disabled="isUsageModelLoading(slot.id) || !canLoadUsageModels(slot.id)" @click="loadUsageModels(slot.id)">
                  {{ isUsageModelLoading(slot.id) ? $t('mobile.apiWs.loadingShort') : $t('mobile.apiWs.loadModels') }}
                </button>
                <button type="button" class="mobile-api-lite-button" @click="openUsageParams(slot.id)">{{ $t('mobile.apiWs.params') }}</button>
              </div>
              <div v-if="getUsageModelOptions(slot.id).length" class="mobile-api-model-list">
                <button
                  v-for="model in getUsageModelOptions(slot.id)"
                  :key="`${slot.id}-${model}`"
                  type="button"
                  @click="selectUsageModel(slot.id, model)"
                >
                  {{ model }}
                </button>
              </div>
            </article>
            <!-- 编目嵌入模型跟随本地配置。 -->
            <article class="mobile-api-usage-card">
              <div class="mobile-api-usage-card__title">
                <strong>{{ $t('mobile.apiWs.catalogEmbedding') }}</strong>
                <small>{{ $t('mobile.apiWs.catalogHint') }}</small>
              </div>
            </article>
          </div>
        </div>

        <div class="mobile-api-block">
          <div class="mobile-api-block__head">
            <div>
              <strong>{{ $t('mobile.apiWs.recallWriteStrategy') }}</strong>
              <small>{{ $t('mobile.apiWs.recallWriteHint') }}</small>
            </div>
          </div>
          <div class="mobile-api-form">
            <label>
              <span>{{ $t('mobile.apiWs.intentSnapshot') }}</span>
              <select v-model="draftAgentConfig.intentSnapshotMode">
                <option value="rules">{{ $t('mobile.apiWs.snapshotRules') }}</option>
                <option value="smart">{{ $t('mobile.apiWs.snapshotSmart') }}</option>
              </select>
            </label>
            <label>
              <span>{{ $t('mobile.apiWs.candidateGen') }}</span>
              <select v-model="draftAgentConfig.recallCandidateMode">
                <option value="parallel_merge">{{ $t('mobile.apiWs.candidateParallel') }}</option>
                <option value="rules_first">{{ $t('mobile.apiWs.candidateRulesFirst') }}</option>
                <option value="embedding_first">{{ $t('mobile.apiWs.candidateEmbeddingFirst') }}</option>
              </select>
            </label>
            <label>
              <span>{{ $t('mobile.apiWs.confirmRead') }}</span>
              <select v-model="draftAgentConfig.recallContentStrategy">
                <option value="summary_gate">{{ $t('mobile.apiWs.strategySummaryGate') }}</option>
                <option value="full_aware">{{ $t('mobile.apiWs.strategyFullAware') }}</option>
              </select>
            </label>
            <label>
              <span>{{ $t('mobile.apiWs.writeReviewRounds') }}</span>
              <input v-model.number="draftAgentConfig.writeBackMaxReviewRounds" type="number" min="1" max="10">
            </label>
            <label>
              <span>{{ $t('mobile.apiWs.writeAuditLevel') }}</span>
              <select v-model="draftAgentConfig.writeBackAuditLogLevel">
                <option value="summary">summary</option>
                <option value="standard">standard</option>
                <option value="debug">debug</option>
              </select>
            </label>
          </div>
          <button type="button" class="mobile-api-primary-button" @click="saveAgentSettings">{{ $t('mobile.apiWs.saveAgentConfig') }}</button>
        </div>
      </section>

      <section v-else class="mobile-api-section" :aria-label="$t('mobile.apiWs.weatherSection')">
        <div class="mobile-api-block">
          <div class="mobile-api-block__head">
            <div>
              <strong>{{ $t('mobile.apiWs.weatherSection') }}</strong>
              <small>{{ $t('mobile.apiWs.weatherSyncHint') }}</small>
            </div>
          </div>
          <div class="mobile-api-form">
            <label>
              <span>API Key</span>
              <input v-model="draftWeatherApiKey" type="password" :placeholder="$t('mobile.apiWs.weatherKeyPlaceholder')">
            </label>
            <label>
              <span>{{ $t('mobile.apiWs.version') }}</span>
              <select v-model="draftWeatherApiDomain">
                <option value="devapi.qweather.com">{{ $t('mobile.apiWs.weatherDevVersion') }}</option>
                <option value="api.qweather.com">{{ $t('mobile.apiWs.weatherProVersion') }}</option>
              </select>
            </label>
          </div>
          <button type="button" class="mobile-api-primary-button mobile-api-primary-button--weather" @click="saveWeatherSettings">{{ $t('mobile.apiWs.saveWeatherConfig') }}</button>
        </div>
      </section>
    </div>

    <MobileSheet :open="confirmDeleteOpen" :title="$t('mobile.apiWs.deletePreset')" @close="confirmDeleteOpen = false">
      <div class="mobile-api-confirm">
        <p>{{ $t('mobile.apiWs.deleteConfirmBody', { name: draftPresetForm.name || $t('mobile.apiWs.unnamedPreset') }) }}</p>
        <div class="mobile-api-footer-actions">
          <button type="button" class="mobile-api-lite-button" @click="confirmDeleteOpen = false">{{ $t('common.cancel') }}</button>
          <button type="button" class="mobile-api-danger-button" @click="deleteCurrentPreset">{{ $t('common.delete') }}</button>
        </div>
      </div>
    </MobileSheet>

    <MobileSheet :open="Boolean(editingUsageSlot)" :title="$t('mobile.apiWs.modelParams')" @close="editingUsageSlot = ''">
      <div v-if="editingUsageSlot" class="mobile-api-form mobile-api-param-form">
        <label v-if="!isEditingUsageSubscriptionBridge">
          <span>{{ $t('mobile.apiWs.temperature') }}</span>
          <input :value="getUsageConfig(editingUsageSlot).temperature" type="number" min="0" max="2" step="0.1" @input="updateUsageConfig(editingUsageSlot, { temperature: Number(($event.target as HTMLInputElement).value) })">
        </label>
        <label>
          <span>{{ $t('mobile.apiWs.maxTokens') }}</span>
          <input :value="getUsageConfig(editingUsageSlot).maxTokens" type="number" min="1" max="32768" @input="updateUsageConfig(editingUsageSlot, { maxTokens: Number(($event.target as HTMLInputElement).value) })">
        </label>
        <label>
          <span>{{ isEditingUsageAgySubscriptionBridge ? $t('mobile.apiWs.reasoningSummaryUnavailable') : (isEditingUsageSubscriptionBridge ? $t('mobile.apiWs.reasoningSummary') : $t('mobile.apiWs.thinking')) }}</span>
          <select :value="isEditingUsageAgySubscriptionBridge ? 'disabled' : getUsageConfig(editingUsageSlot).thinking" :disabled="isEditingUsageAgySubscriptionBridge" @change="updateUsageConfig(editingUsageSlot, { thinking: (($event.target as HTMLSelectElement).value === 'enabled' ? 'enabled' : 'disabled') })">
            <option value="disabled">{{ isEditingUsageSubscriptionBridge ? $t('mobile.apiWs.reasoningSummaryOff') : $t('mobile.apiWs.thinkingOff') }}</option>
            <option value="enabled">{{ isEditingUsageSubscriptionBridge ? $t('mobile.apiWs.reasoningSummaryOn') : $t('mobile.apiWs.thinkingOn') }}</option>
          </select>
        </label>
        <div v-if="editingUsageFastAvailable" class="mobile-api-option-row">
          <span>
            <strong>{{ $t('mobile.apiWs.fastService') }}</strong>
            <small>{{ $t('mobile.apiWs.fastServiceHint') }}</small>
          </span>
          <button
            type="button"
            class="mobile-api-lite-button"
            :class="{ 'is-active': getUsageConfig(editingUsageSlot).serviceTier === 'fast' }"
            :aria-pressed="getUsageConfig(editingUsageSlot).serviceTier === 'fast'"
            @click="toggleEditingUsageFast"
          >Fast</button>
        </div>
        <button type="button" class="mobile-api-primary-button" @click="editingUsageSlot = ''">{{ $t('common.done') }}</button>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAiProviderTemplate, isKeylessAiProvider, normalizeAiProviderType } from '../../../shared/aiProviders'
import { API } from '../../config/api'
import type {
  AgentModelConfig,
  AiProviderMode,
  ModelThinkingMode,
  ModelUsageConfig,
  ModelUsageSlotId,
  RecallCandidateGenerationMode,
  RecallConfirmedContentStrategy,
  RecallIntentSnapshotMode,
  WriteBackAuditLogLevel
} from '../../types'
import type { ApiPresetFormViewModel, NamedEntity } from '../../types/panelContracts'
import { DEFAULT_MODEL_USAGE_CONFIGS, normalizeModelUsageConfigs } from '../../utils/modelUsageConfig'
import {
  isSubscriptionBridgeProvider,
  modelSupportsServiceTier,
  subscriptionBridgeReturnsThinkingSummary,
  type AiModelCatalogItem
} from '../../utils/subscriptionBridgeParameters'
import MobileSheet from './MobileSheet.vue'
import MobileTopBar from './MobileTopBar.vue'
import type { MobileWorkspaceShellProps } from './mobileWorkspaceTypes'

type TabId = 'presets' | 'agent' | 'weather'

const props = defineProps<MobileWorkspaceShellProps>()
defineEmits<{
  back: []
}>()

const { t } = useI18n()

// 模块级 const 里不能调 t()：改为 labelKey 定义 + computed 里 t() 填充
const TAB_DEFS: Array<{ id: TabId; labelKey: string }> = [
  { id: 'presets', labelKey: 'mobile.apiWs.modelPresets' },
  { id: 'agent', labelKey: 'mobile.apiWs.tabAgent' },
  { id: 'weather', labelKey: 'mobile.apiWs.tabWeather' }
]
const tabs = computed<Array<{ id: TabId; label: string }>>(() =>
  TAB_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey) }))
)

// 文本槽四档+编目（嵌入·服务端管理默认，模板单独展示行）。
// ⚠️ 联动：AppApiConfigSection.vue 的 modelUsageSlots 是同一份口径的桌面端版本，改这里要同步改那边。
const MODEL_USAGE_SLOT_DEFS: Array<{ id: ModelUsageSlotId; labelKey: string; hintKey: string }> = [
  { id: 'fast', labelKey: 'mobile.apiWs.slotFast', hintKey: 'mobile.apiWs.slotFastHint' },
  { id: 'balanced', labelKey: 'mobile.apiWs.slotBalanced', hintKey: 'mobile.apiWs.slotBalancedHint' },
  { id: 'message', labelKey: 'mobile.apiWs.slotMessage', hintKey: 'mobile.apiWs.slotMessageHint' },
  { id: 'smart', labelKey: 'mobile.apiWs.slotSmart', hintKey: 'mobile.apiWs.slotSmartHint' }
]
const modelUsageSlots = computed<Array<{ id: ModelUsageSlotId; label: string; hint: string }>>(() =>
  MODEL_USAGE_SLOT_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey), hint: t(def.hintKey) }))
)

const defaultBrainAgentConfig: AgentModelConfig = {
  id: 'brain_agent',
  name: '大脑 Agent',
  agentType: 'brain',
  modelUsageConfigs: DEFAULT_MODEL_USAGE_CONFIGS.map((item) => ({ ...item })),
  presetName: '',
  recallModel: '',
  recallMaxTokens: 512,
  disableRecallThinking: true,
  fallbackPresetName: '',
  fallbackRecallModel: '',
  fallbackRecallMaxTokens: 512,
  embeddingPresetId: '',
  narrationQuickJudgePresetName: '',
  narrationQuickJudgeModel: '',
  narrativeBeatPresetName: '',
  narrativeBeatModel: '',
  narrativeBeatMaxTokens: 8192,
  narrationGenerationPresetName: '',
  narrationGenerationModel: '',
  virtualSceneLocationPresetName: '',
  virtualSceneLocationModel: '',
  virtualSceneLocationMaxTokens: 512,
  intentSnapshotMode: 'rules',
  recallCandidateMode: 'parallel_merge',
  recallContentStrategy: 'summary_gate',
  writeBackMaxReviewRounds: 3,
  writeBackAuditLogLevel: 'standard',
  enabled: true,
  capabilities: ['recall_judgment', 'writeback_review', 'narration_quick_judge', 'narrative_beat', 'narration_generation', 'virtual_scene_location_scan']
}

const activeTab = ref<TabId>('presets')
const selectedPresetIndex = ref(0)
const draftAiProviderMode = ref<AiProviderMode>('custom')
const draftDefaultPresetName = ref('')
const draftPresetForm = reactive<ApiPresetFormViewModel>(clonePresetForm())
const draftWeatherApiKey = ref('')
const draftWeatherApiDomain = ref('devapi.qweather.com')
const draftAgentConfig = ref<AgentModelConfig>(cloneAgentConfig())
const confirmDeleteOpen = ref(false)
const isPresetDraftLocal = ref(false)
const isDefaultPresetDraftLocal = ref(false)
const editingUsageSlot = ref<ModelUsageSlotId | ''>('')
const usageModelOptions = ref<Record<ModelUsageSlotId, string[]>>(emptyUsageModelOptions())
const usageModelLoading = ref<Record<ModelUsageSlotId, boolean>>(emptyUsageModelLoading())
const usageModelCatalogs = ref<Partial<Record<ModelUsageSlotId, AiModelCatalogItem[]>>>({})

const state = computed(() => props.state)
const apiConfig = computed(() => state.value.panelViewModels.apiConfig)
const apiActions = computed(() => state.value.panelActions.apiConfig)
const apiPresets = computed(() => apiConfig.value.apiPresets || [])
const storedDefaultPresetName = computed(() => text(apiPresets.value.find((preset) => preset.is_default || preset.isDefault)?.name))
const effectiveDefaultPresetName = computed(() => draftDefaultPresetName.value || storedDefaultPresetName.value)
const topSubtitle = computed(() => {
  if (activeTab.value === 'agent') return t('mobile.apiWs.subtitleAgent')
  if (activeTab.value === 'weather') return t('mobile.apiWs.subtitleWeather')
  return t('mobile.apiWs.ownApiPresets')
})
const sourceSummary = computed(() => t('mobile.me.apiSummary', {
  mode: t('mobile.apiWs.providerOwnApi'),
  count: apiConfig.value.apiPresetCount || apiPresets.value.length
}))
const canUseDraftApi = computed(() => Boolean(
  String(draftPresetForm.apiUrl || '').trim()
  && (isKeylessAiProvider(draftPresetForm.providerType)
    || String(draftPresetForm.apiKey || '').trim()
    || draftPresetForm.hasApiKey)
))
const editingExistingPreset = computed(() => Boolean(draftPresetForm.originalName || selectedPresetIndex.value >= 0))
const brainAgentConfig = computed(() => {
  return apiConfig.value.agentModelConfigs.find((item) => item.id === 'brain_agent') || defaultBrainAgentConfig
})
const editingUsageProviderType = computed(() => editingUsageSlot.value ? getUsageProviderType(editingUsageSlot.value) : '')
const isEditingUsageSubscriptionBridge = computed(() => isSubscriptionBridgeProvider(editingUsageProviderType.value))
const isEditingUsageAgySubscriptionBridge = computed(() => isEditingUsageSubscriptionBridge.value
  && !subscriptionBridgeReturnsThinkingSummary(editingUsageProviderType.value))
const editingUsageFastAvailable = computed(() => {
  if (!editingUsageSlot.value || editingUsageProviderType.value !== 'codex-subscription') return false
  const config = getUsageConfig(editingUsageSlot.value)
  if (config.serviceTier === 'fast') return true
  return modelSupportsServiceTier(
    editingUsageProviderType.value,
    getEffectiveUsageModel(editingUsageSlot.value),
    usageModelCatalogs.value[editingUsageSlot.value] || [],
    'fast'
  )
})

watch(
  apiConfig,
  (next) => {
    draftAiProviderMode.value = 'custom'
    if (!isDefaultPresetDraftLocal.value) {
      draftDefaultPresetName.value = next.defaultPresetName || storedDefaultPresetName.value
    }
    if (!isPresetDraftLocal.value) {
      selectedPresetIndex.value = Number.isFinite(Number(next.currentApiPresetIndex)) ? Number(next.currentApiPresetIndex) : 0
      setPresetForm(next.apiPresetForm)
    }
    draftWeatherApiKey.value = next.weatherApiKey || ''
    draftWeatherApiDomain.value = normalizeWeatherApiDomain(next.weatherApiDomain)
  },
  { immediate: true }
)

watch(
  brainAgentConfig,
  (next) => {
    draftAgentConfig.value = cloneAgentConfig(next)
  },
  { immediate: true, deep: true }
)

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeWeatherApiDomain(value: unknown): string {
  const raw = text(value).replace(/^https?:\/\//i, '').replace(/\/+$/g, '')
  return raw === 'api.qweather.com' ? 'api.qweather.com' : 'devapi.qweather.com'
}

function toNumber(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function normalizeTemperature(value: unknown, fallback: number): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(0, Math.min(2, next))
}

function normalizeMaxTokens(value: unknown, fallback: number): number {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return fallback
  return Math.max(1, Math.min(32768, Math.trunc(next)))
}

function normalizeThinking(value: unknown, fallback: ModelThinkingMode): ModelThinkingMode {
  return value === 'enabled' || value === 'disabled' ? value : fallback
}

function normalizeIntentSnapshotMode(value: unknown): RecallIntentSnapshotMode {
  return value === 'smart' ? 'smart' : 'rules'
}

function normalizeRecallCandidateMode(value: unknown): RecallCandidateGenerationMode {
  return value === 'rules_first' || value === 'embedding_first' ? value : 'parallel_merge'
}

function normalizeRecallContentStrategy(value: unknown): RecallConfirmedContentStrategy {
  return value === 'full_aware' ? 'full_aware' : 'summary_gate'
}

function normalizeWriteBackAuditLogLevel(value: unknown): WriteBackAuditLogLevel {
  return value === 'summary' || value === 'debug' ? value : 'standard'
}

function clonePresetForm(source: Partial<ApiPresetFormViewModel> = {}): ApiPresetFormViewModel {
  return {
    originalName: text(source.originalName || source.name),
    name: text(source.name),
    providerType: text(source.providerType || 'openai-compatible'),
    apiUrl: text(source.apiUrl),
    apiKey: '',
    hasApiKey: Boolean(source.hasApiKey),
    model: '',
    temperature: undefined,
    maxTokens: undefined,
    fallbackPreset: ''
  }
}

function presetToForm(preset: NamedEntity): ApiPresetFormViewModel {
  return clonePresetForm({
    originalName: text(preset.name),
    name: text(preset.name),
    providerType: text(preset.providerType || preset.provider_type || 'openai-compatible'),
    apiUrl: text(preset.baseUrl || preset.apiUrl),
    hasApiKey: Boolean(preset.hasApiKey)
  })
}

function setPresetForm(source: Partial<ApiPresetFormViewModel> = {}) {
  Object.assign(draftPresetForm, clonePresetForm(source))
}

function cloneAgentConfig(source: Partial<AgentModelConfig> = {}): AgentModelConfig {
  const modelUsageConfigs = normalizeModelUsageConfigs(source, DEFAULT_MODEL_USAGE_CONFIGS).map((item) => ({ ...item }))
  return {
    ...defaultBrainAgentConfig,
    ...source,
    id: source.id || defaultBrainAgentConfig.id,
    name: source.name || defaultBrainAgentConfig.name,
    agentType: source.agentType || defaultBrainAgentConfig.agentType,
    modelUsageConfigs,
    embeddingPresetId: '',
    intentSnapshotMode: normalizeIntentSnapshotMode(source.intentSnapshotMode),
    recallCandidateMode: normalizeRecallCandidateMode(source.recallCandidateMode),
    recallContentStrategy: normalizeRecallContentStrategy(source.recallContentStrategy),
    writeBackMaxReviewRounds: Math.max(1, Math.min(10, Math.trunc(toNumber(source.writeBackMaxReviewRounds, defaultBrainAgentConfig.writeBackMaxReviewRounds)))),
    writeBackAuditLogLevel: normalizeWriteBackAuditLogLevel(source.writeBackAuditLogLevel),
    enabled: source.enabled !== false,
    capabilities: Array.isArray(source.capabilities) && source.capabilities.length ? [...source.capabilities] : [...defaultBrainAgentConfig.capabilities]
  }
}

function emptyUsageModelOptions(): Record<ModelUsageSlotId, string[]> {
  return {
    fast: [],
    balanced: [],
    message: [],
    smart: []
  }
}

function emptyUsageModelLoading(): Record<ModelUsageSlotId, boolean> {
  return {
    fast: false,
    balanced: false,
    message: false,
    smart: false
  }
}

function isDefaultPreset(preset: NamedEntity): boolean {
  return text(preset.name) === effectiveDefaultPresetName.value
}

function formatPresetProvider(preset: NamedEntity): string {
  return text(preset.providerType || preset.provider_type) || t('mobile.apiWs.providerOwnApi')
}

function selectPreset(index: number) {
  const preset = apiPresets.value[index]
  if (!preset) return
  isPresetDraftLocal.value = true
  selectedPresetIndex.value = index
  setPresetForm(presetToForm(preset))
}

function startNewPreset() {
  isPresetDraftLocal.value = true
  selectedPresetIndex.value = -1
  setPresetForm({ providerType: 'openai-compatible' })
  usageModelOptions.value = emptyUsageModelOptions()
}

function applyProviderTemplate(providerType: string) {
  isPresetDraftLocal.value = true
  const template = getAiProviderTemplate(providerType)
  draftPresetForm.providerType = template.type
  draftPresetForm.apiUrl = template.baseUrl
  draftPresetForm.name = draftPresetForm.name || template.label
  draftPresetForm.model = ''
  draftPresetForm.temperature = undefined
  draftPresetForm.maxTokens = undefined
  draftPresetForm.fallbackPreset = ''
}

function setDraftDefaultPreset(name: string) {
  const next = text(name)
  if (!next) return
  isDefaultPresetDraftLocal.value = true
  draftDefaultPresetName.value = next
}

function syncPresetFormToActions() {
  if (selectedPresetIndex.value < 0) {
    apiActions.value.addNewApiPreset()
  } else if (selectedPresetIndex.value !== apiConfig.value.currentApiPresetIndex) {
    apiActions.value.loadApiPreset(selectedPresetIndex.value)
  }
  apiActions.value.updateApiPresetForm({ key: 'originalName', value: draftPresetForm.originalName || '' })
  apiActions.value.updateApiPresetForm({ key: 'name', value: draftPresetForm.name })
  apiActions.value.updateApiPresetForm({ key: 'providerType', value: draftPresetForm.providerType })
  apiActions.value.updateApiPresetForm({ key: 'apiUrl', value: draftPresetForm.apiUrl })
  apiActions.value.updateApiPresetForm({ key: 'apiKey', value: draftPresetForm.apiKey })
  apiActions.value.updateApiPresetForm({ key: 'hasApiKey', value: Boolean(draftPresetForm.hasApiKey) })
  apiActions.value.updateApiPresetForm({ key: 'model', value: '' })
  apiActions.value.updateApiPresetForm({ key: 'temperature', value: undefined })
  apiActions.value.updateApiPresetForm({ key: 'maxTokens', value: undefined })
  apiActions.value.updateApiPresetForm({ key: 'fallbackPreset', value: '' })
}

async function savePresetSettings() {
  if (draftAiProviderMode.value !== apiConfig.value.aiProviderMode) {
    await Promise.resolve(apiActions.value.setAiProviderMode(draftAiProviderMode.value))
  }
  const originalName = draftPresetForm.originalName
  const nextName = text(draftPresetForm.name)
  syncPresetFormToActions()
  await Promise.resolve(apiActions.value.saveApiPreset())
  if (originalName && draftDefaultPresetName.value === originalName && nextName) {
    draftDefaultPresetName.value = nextName
  }
  if (draftDefaultPresetName.value) {
    await Promise.resolve(apiActions.value.setDefaultPreset(draftDefaultPresetName.value))
  }
  if (nextName) {
    setPresetForm({
      ...draftPresetForm,
      originalName: nextName,
      name: nextName,
      hasApiKey: Boolean(draftPresetForm.hasApiKey || draftPresetForm.apiKey)
    })
  }
  isPresetDraftLocal.value = false
  isDefaultPresetDraftLocal.value = false
}

async function testConnection() {
  syncPresetFormToActions()
  await Promise.resolve(apiActions.value.testApiConnection())
}

async function deleteCurrentPreset() {
  if (selectedPresetIndex.value >= 0 && selectedPresetIndex.value !== apiConfig.value.currentApiPresetIndex) {
    apiActions.value.loadApiPreset(selectedPresetIndex.value)
  }
  await Promise.resolve(apiActions.value.deleteCurrentApiPreset())
  confirmDeleteOpen.value = false
  isPresetDraftLocal.value = false
  selectedPresetIndex.value = 0
  const firstPreset = apiPresets.value[0]
  setPresetForm(firstPreset ? presetToForm(firstPreset) : { providerType: 'openai-compatible' })
}

function getUsageConfig(slotId: ModelUsageSlotId): ModelUsageConfig {
  return draftAgentConfig.value.modelUsageConfigs?.find((item) => item.id === slotId) || DEFAULT_MODEL_USAGE_CONFIGS.find((item) => item.id === slotId)!
}

function updateUsageConfig(slotId: ModelUsageSlotId, changes: Partial<ModelUsageConfig>) {
  const nextConfigs = normalizeModelUsageConfigs(draftAgentConfig.value, DEFAULT_MODEL_USAGE_CONFIGS).map((item) => {
    if (item.id !== slotId) return { ...item }
    return {
      ...item,
      ...changes,
      presetName: changes.presetName !== undefined ? text(changes.presetName) : item.presetName,
      model: changes.model !== undefined ? text(changes.model) : item.model,
      temperature: changes.temperature !== undefined ? normalizeTemperature(changes.temperature, item.temperature) : item.temperature,
      maxTokens: changes.maxTokens !== undefined ? normalizeMaxTokens(changes.maxTokens, item.maxTokens) : item.maxTokens,
      thinking: changes.thinking !== undefined ? normalizeThinking(changes.thinking, item.thinking) : item.thinking,
      serviceTier: changes.serviceTier === undefined ? item.serviceTier : (changes.serviceTier === 'fast' ? 'fast' : '')
    }
  })
  // 批次3（2026-07-08 槽位收束）：平铺 legacy 字段同步源改新槽（与桌面 AppApiConfigSection/settingRepository 同口径）。
  const byId = new Map(nextConfigs.map((item) => [item.id, item]))
  const balanced = byId.get('balanced')
  const quick = byId.get('fast')
  const highVolume = byId.get('smart')
  draftAgentConfig.value = cloneAgentConfig({
    ...draftAgentConfig.value,
    modelUsageConfigs: nextConfigs,
    presetName: balanced?.presetName || '',
    recallModel: balanced?.model || '',
    recallMaxTokens: balanced?.maxTokens || defaultBrainAgentConfig.recallMaxTokens,
    disableRecallThinking: balanced?.thinking !== 'enabled',
    narrationQuickJudgePresetName: quick?.presetName || '',
    narrationQuickJudgeModel: quick?.model || '',
    narrativeBeatPresetName: highVolume?.presetName || '',
    narrativeBeatModel: highVolume?.model || '',
    narrativeBeatMaxTokens: highVolume?.maxTokens || defaultBrainAgentConfig.narrativeBeatMaxTokens,
    narrationGenerationPresetName: balanced?.presetName || '',
    narrationGenerationModel: balanced?.model || ''
  })
}

async function openUsageParams(slotId: ModelUsageSlotId) {
  editingUsageSlot.value = slotId
  if (getUsageProviderType(slotId) === 'codex-subscription' && !usageModelCatalogs.value[slotId]) {
    await loadUsageModels(slotId)
  }
}

function getUsageModelOptions(slotId: ModelUsageSlotId): string[] {
  return usageModelOptions.value[slotId] || []
}

function isUsageModelLoading(slotId: ModelUsageSlotId): boolean {
  return Boolean(usageModelLoading.value[slotId])
}

function getPresetByName(name: string): NamedEntity | null {
  const target = text(name)
  if (!target) return null
  return apiPresets.value.find((preset) => text(preset.name) === target) || null
}

function getEffectiveUsagePresetName(slotId: ModelUsageSlotId): string {
  const current = getUsageConfig(slotId)
  return text(current.presetName || draftDefaultPresetName.value)
}

function getUsageProviderType(slotId: ModelUsageSlotId): string {
  const preset = getPresetByName(getEffectiveUsagePresetName(slotId))
  return normalizeAiProviderType((preset as Record<string, unknown> | null)?.providerType
    ?? (preset as Record<string, unknown> | null)?.provider_type)
}

function getEffectiveUsageModel(slotId: ModelUsageSlotId): string {
  const configured = text(getUsageConfig(slotId).model)
  const preset = getPresetByName(getEffectiveUsagePresetName(slotId)) as Record<string, unknown> | null
  return configured || text(preset?.model) || 'default'
}

function selectUsagePreset(slotId: ModelUsageSlotId, presetName: string) {
  usageModelOptions.value = { ...usageModelOptions.value, [slotId]: [] }
  const nextCatalogs = { ...usageModelCatalogs.value }
  delete nextCatalogs[slotId]
  usageModelCatalogs.value = nextCatalogs
  updateUsageConfig(slotId, { presetName, model: '', serviceTier: '' })
}

function selectUsageModel(slotId: ModelUsageSlotId, model: string) {
  updateUsageModel(slotId, model)
}

function updateUsageModel(slotId: ModelUsageSlotId, model: string) {
  const current = getUsageConfig(slotId)
  const keepFast = current.serviceTier === 'fast' && modelSupportsServiceTier(
    getUsageProviderType(slotId),
    model || 'default',
    usageModelCatalogs.value[slotId] || [],
    'fast'
  )
  updateUsageConfig(slotId, { model, serviceTier: keepFast ? 'fast' : '' })
}

function toggleEditingUsageFast() {
  if (!editingUsageSlot.value || !editingUsageFastAvailable.value) return
  const current = getUsageConfig(editingUsageSlot.value)
  updateUsageConfig(editingUsageSlot.value, { serviceTier: current.serviceTier === 'fast' ? '' : 'fast' })
}

function canLoadUsageModels(slotId: ModelUsageSlotId): boolean {
  return Boolean(getPresetByName(getEffectiveUsagePresetName(slotId)))
}

async function loadUsageModels(slotId: ModelUsageSlotId) {
  const preset = getPresetByName(getEffectiveUsagePresetName(slotId))
  if (!preset) return
  usageModelLoading.value = { ...usageModelLoading.value, [slotId]: true }
  try {
    const response = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await response.json() as { data?: AiModelCatalogItem[]; error?: string }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
    const catalog = Array.isArray(data.data) ? data.data.filter((item) => text(item?.id)) : []
    usageModelOptions.value = {
      ...usageModelOptions.value,
      [slotId]: catalog.map((item) => text(item.id)).filter(Boolean)
    }
    usageModelCatalogs.value = { ...usageModelCatalogs.value, [slotId]: catalog }
  } catch (error) {
    console.error('加载用途模型列表失败:', error)
    usageModelOptions.value = { ...usageModelOptions.value, [slotId]: [] }
    const nextCatalogs = { ...usageModelCatalogs.value }
    delete nextCatalogs[slotId]
    usageModelCatalogs.value = nextCatalogs
  } finally {
    usageModelLoading.value = { ...usageModelLoading.value, [slotId]: false }
  }
}

async function saveAgentSettings() {
  const next = cloneAgentConfig({
    ...draftAgentConfig.value,
    intentSnapshotMode: normalizeIntentSnapshotMode(draftAgentConfig.value.intentSnapshotMode),
    recallCandidateMode: normalizeRecallCandidateMode(draftAgentConfig.value.recallCandidateMode),
    recallContentStrategy: normalizeRecallContentStrategy(draftAgentConfig.value.recallContentStrategy),
    writeBackAuditLogLevel: normalizeWriteBackAuditLogLevel(draftAgentConfig.value.writeBackAuditLogLevel),
    writeBackMaxReviewRounds: Math.max(1, Math.min(10, Math.trunc(toNumber(draftAgentConfig.value.writeBackMaxReviewRounds, 3)))),
    embeddingPresetId: '',
    enabled: true
  })
  draftAgentConfig.value = next
  apiActions.value.updateAgentModelConfig({ id: next.id, changes: { ...next } })
  await Promise.resolve(apiActions.value.saveAgentModelConfig())
}

async function saveWeatherSettings() {
  apiActions.value.updateWeatherApiKey(draftWeatherApiKey.value)
  apiActions.value.updateWeatherApiDomain(normalizeWeatherApiDomain(draftWeatherApiDomain.value))
  await Promise.resolve(apiActions.value.saveWeatherApiConfig())
}
</script>

<style scoped>
.mobile-api-workspace {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.mobile-api-tabs {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  padding-bottom: 8px;
}

.mobile-api-tabs button {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 8px 4px;
}

.mobile-api-tabs button.active {
  background: color-mix(in srgb, var(--lhm-accent, #5c8a5c) 12%, transparent);
  color: var(--lhm-accent, #5c8a5c);
  font-weight: 600;
}

.mobile-api-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}

.mobile-api-section,
.mobile-api-usage-list {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.mobile-api-block,
.mobile-api-usage-card {
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  padding: 0 2px 14px;
}

.mobile-api-block__head,
.mobile-api-usage-card__title,
.mobile-api-footer-actions,
.mobile-api-inline-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mobile-api-block__head strong,
.mobile-api-usage-card__title strong {
  display: block;
  color: var(--lhm-text, #333);
  font-size: 14px;
  font-weight: 650;
}

.mobile-api-block__head small,
.mobile-api-usage-card__title small {
  display: block;
  margin-top: 2px;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
}

.mobile-api-segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 11px;
}

.mobile-api-segmented button,
.mobile-api-lite-button,
.mobile-api-primary-button,
.mobile-api-danger-button {
  border: 1px solid var(--lhm-border, #e0e0e0);
  border-radius: 7px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 8px 10px;
}

.mobile-api-segmented button.active {
  border-color: color-mix(in srgb, var(--lhm-accent, #5c8a5c) 45%, var(--lhm-border, #e0e0e0));
  background: color-mix(in srgb, var(--lhm-accent, #5c8a5c) 12%, transparent);
  color: var(--lhm-accent, #5c8a5c);
  font-weight: 600;
}

.mobile-api-lite-button:disabled,
.mobile-api-primary-button:disabled {
  cursor: default;
  opacity: 0.45;
}

.mobile-api-lite-button.is-active {
  border-color: var(--lhm-accent, #5c8a5c);
  background: var(--lhm-accent, #5c8a5c);
  color: #fff;
  font-weight: 600;
}

.mobile-api-primary-button {
  border-color: var(--lhm-accent, #5c8a5c);
  background: var(--lhm-accent, #5c8a5c);
  color: #fff;
  font-weight: 600;
}

.mobile-api-primary-button--compact {
  flex-shrink: 0;
  padding: 7px 10px;
}

.mobile-api-primary-button--weather {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 10px 12px;
}

.mobile-api-danger-button {
  border-color: color-mix(in srgb, #b85c5c 35%, var(--lhm-border, #e0e0e0));
  color: #a84d4d;
}

.mobile-api-readonly {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.mobile-api-readonly div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--lhm-text-light, #666);
  font-size: 12px;
}

.mobile-api-readonly strong {
  color: var(--lhm-text, #333);
  font-weight: 600;
}

.mobile-api-readonly p,
.mobile-api-empty,
.mobile-api-confirm p {
  margin: 0;
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
  line-height: 1.65;
}

.mobile-api-preset-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 11px;
}

.mobile-api-preset-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  background: transparent;
  color: var(--lhm-text, #333);
  cursor: pointer;
  font: inherit;
  padding: 9px 0;
  text-align: left;
}

.mobile-api-preset-row.active {
  color: var(--lhm-accent, #5c8a5c);
  font-weight: 600;
}

.mobile-api-preset-row small {
  flex-shrink: 0;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
  font-weight: 400;
}

.mobile-api-form {
  display: grid;
  gap: 11px;
  margin-top: 12px;
}

.mobile-api-form label,
.mobile-api-usage-card label {
  display: grid;
  gap: 5px;
  color: var(--lhm-text-light, #666);
  font-size: 12px;
}

.mobile-api-form input,
.mobile-api-form select,
.mobile-api-usage-card input,
.mobile-api-usage-card select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--lhm-border, #e0e0e0);
  border-radius: 7px;
  background: color-mix(in srgb, var(--lhm-card, #fffdf8) 82%, transparent);
  color: var(--lhm-text, #333);
  font: inherit;
  font-size: 13px;
  padding: 9px 10px;
}

.mobile-api-inline-actions {
  flex-wrap: wrap;
  justify-content: flex-start;
  margin-top: 12px;
}

.mobile-api-footer-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.mobile-api-model-list {
  display: flex;
  max-height: 116px;
  flex-wrap: wrap;
  gap: 6px;
  overflow: auto;
  margin-top: 10px;
}

.mobile-api-model-list span,
.mobile-api-model-list button {
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 6px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  font: inherit;
  font-size: 11px;
  padding: 5px 7px;
}

.mobile-api-param-form {
  margin-top: 4px;
}

.mobile-api-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 7px;
  background: color-mix(in srgb, var(--lhm-card, #fffdf8) 62%, transparent);
}

.mobile-api-option-row > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.mobile-api-option-row strong {
  color: var(--lhm-text, #333);
  font-size: 13px;
}

.mobile-api-option-row small {
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
  line-height: 1.35;
}
</style>
