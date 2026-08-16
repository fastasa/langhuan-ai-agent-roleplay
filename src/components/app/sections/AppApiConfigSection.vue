<template>
  <section class="api-config-modal">
    <header class="api-config-modal__header">
      <div>
        <h2>API 配置</h2>
        <p>管理并配置模型 API 预设与相关参数，支持多种供应商与模型，便于在不同场景下灵活切换与使用。</p>
      </div>
    </header>

    <nav class="api-config-tabs" role="tablist" aria-label="API 配置页签">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="api-config-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div class="api-config-modal__body">
      <div v-if="activeTab === 'presets'" class="api-config-page api-config-page--presets">
        <aside class="api-preset-sidebar">
          <div class="api-source-switch" aria-label="AI 来源">
            <span class="api-source-switch__item active">本地自有 API</span>
          </div>

          <div class="api-preset-summary">
            <span>共 {{ viewModel.apiPresetCount }} 个预设</span>
            <span>默认：{{ draftDefaultPresetName || '未设置' }}</span>
          </div>

          <div class="api-preset-list">
            <div
              v-for="(preset, i) in viewModel.apiPresets"
              :key="String(preset.name || i)"
              class="api-preset-row"
              :class="{ active: selectedPresetIndex === i }"
            >
              <button type="button" class="api-preset-row__main" @click="selectPresetDraft(i)">
                <span>{{ preset.name }}</span>
              </button>
              <span v-if="isDraftDefaultPreset(preset)" class="api-preset-badge">当前默认</span>
              <button
                v-else
                type="button"
                class="api-preset-inline-action"
                @click="setDraftDefaultPreset(String(preset.name || ''))"
              >
                设为默认
              </button>
            </div>
            <button type="button" class="api-preset-add" @click="startNewPresetDraft">＋ 新建</button>
          </div>

        </aside>

        <section class="api-config-form-panel">
          <div class="api-config-form-panel__head">
            <h3>预设配置</h3>
            <button
              type="button"
              class="api-config-secondary-button"
              :disabled="!draftApiPresetForm.name || draftDefaultPresetName === draftApiPresetForm.name"
              @click="setDraftDefaultPreset(draftApiPresetForm.name)"
            >
              设为默认预设
            </button>
          </div>

          <div class="api-config-form">
            <label class="api-field api-field--select">
              <span>供应商</span>
              <select
                :value="draftApiPresetForm.providerType"
                @change="applyProviderTemplateDraft(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="provider in viewModel.apiProviderTemplates"
                  :key="String(provider.id || provider.name)"
                  :value="provider.id || provider.name"
                >
                  {{ provider.name }}
                </option>
              </select>
            </label>
            <label class="api-field">
              <span>预设名称</span>
              <input
                :value="draftApiPresetForm.name"
                placeholder="如：DeepSeek、OpenAI"
                @input="updateDraftApiPresetForm('name', ($event.target as HTMLInputElement).value)"
              >
            </label>
            <label class="api-field">
              <span>API 地址</span>
              <input
                :value="draftApiPresetForm.apiUrl"
                placeholder="https://api.deepseek.com"
                @input="updateDraftApiPresetForm('apiUrl', ($event.target as HTMLInputElement).value)"
              >
            </label>
            <label class="api-field api-field--secret">
              <span>API 密钥</span>
              <span class="api-secret-input">
                <input
                  :value="draftApiPresetForm.apiKey"
                  type="password"
                  :placeholder="apiKeyPlaceholder"
                  @input="updateDraftApiPresetForm('apiKey', ($event.target as HTMLInputElement).value)"
                >
                <span aria-hidden="true">⌁</span>
              </span>
              <small v-if="draftApiPresetForm.hasApiKey && !draftApiPresetForm.apiKey" class="api-field-hint">已保存密钥，留空会继续保留原 Key</small>
            </label>
            <label class="api-field">
              <span>并发上限</span>
              <input
                :value="draftApiPresetForm.maxConcurrency ?? 6"
                type="number"
                min="1"
                max="64"
                placeholder="该端点最大同时请求数，默认 6"
                @input="updateDraftApiPresetForm('maxConcurrency', Number(($event.target as HTMLInputElement).value) || 6)"
              >
              <small class="api-field-hint">所有用到该预设的调用共享此上限（投影、新消息、召回…加起来不超过它）</small>
            </label>
            <label class="api-field">
              <span>最短间隔(秒)</span>
              <input
                :value="draftApiPresetForm.minInterval ?? 0"
                type="number"
                min="0"
                max="3600"
                placeholder="同一密钥两次调用最短间隔，默认 0（不节流）"
                @input="updateDraftApiPresetForm('minInterval', Number(($event.target as HTMLInputElement).value) || 0)"
              >
              <small class="api-field-hint">本地服务按 baseUrl+apiKey 节流；共用同一密钥的预设请保持一致</small>
            </label>
            <div class="api-option-row">
              <span class="api-option-row__copy">
                <strong>支持识图（视觉）</strong>
                <small>开启后聊天输入框上传的图片会原样发给该模型；未开启则改用文字转述</small>
              </span>
              <button
                type="button"
                class="api-option-button"
                :class="{ 'is-active': Boolean(draftApiPresetForm.supportsVision) }"
                :aria-pressed="Boolean(draftApiPresetForm.supportsVision)"
                @click="updateDraftApiPresetForm('supportsVision', !draftApiPresetForm.supportsVision)"
              >{{ draftApiPresetForm.supportsVision ? '已开启' : '未开启' }}</button>
            </div>
            <details class="api-advanced">
              <summary>高级设置</summary>
              <div class="api-advanced__body">
                <button
                  type="button"
                  class="api-config-secondary-button"
                  :disabled="!canUseDraftApiKey || viewModel.isTestingApi"
                  @click="testApiConnectionForDraft"
                >
                  {{ viewModel.isTestingApi ? '测试中...' : '测试连接' }}
                </button>
                <span>{{ providerLabel }} / {{ draftApiPresetForm.apiUrl || '未填写地址' }}</span>
              </div>
            </details>
          </div>
        </section>
      </div>

      <div v-else-if="activeTab === 'agent'" class="api-config-page api-config-page--agent">
        <div class="agent-review-list agent-review-list--flat">
          <section class="agent-review-card agent-usage-card">
            <h4>模型用途</h4>
            <div class="agent-usage-list">
              <div v-for="slot in modelUsageSlots" :key="slot.id" class="agent-usage-row">
                <div class="agent-usage-row__label">
                  <strong>{{ slot.label }}</strong>
                  <small>{{ slot.hint }}</small>
                </div>
                <label class="api-field api-field--select">
                  <span>预设</span>
                  <select
                    :value="getModelUsageConfig(slot.id).presetName"
                    @change="selectModelUsagePreset(slot.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">跟随全局来源</option>
                    <option v-for="preset in viewModel.apiPresets" :key="`${slot.id}-${String(preset.name)}`" :value="preset.name">{{ preset.name }}</option>
                  </select>
                </label>
                <label class="api-field agent-model-field">
                  <span>模型</span>
                  <span class="agent-model-input-shell">
                    <input
                      :value="getModelUsageConfig(slot.id).model"
                      :disabled="isModelUsageLoading(slot.id)"
                      placeholder="留空则跟随预设"
                      @focus="openModelUsageMenu(slot.id)"
                      @keydown.escape="closeModelUsageMenu"
                      @input="updateModelUsageModelDraft(slot.id, ($event.target as HTMLInputElement).value)"
                    >
                    <button
                      type="button"
                      class="agent-model-arrow"
                      :disabled="!getModelUsageOptions(slot.id).length"
                      @click="toggleModelUsageMenu(slot.id)"
                    >
                      ⌄
                    </button>
                    <div v-if="isModelUsageMenuOpen(slot.id)" class="agent-narration-model-menu">
                      <button
                        v-for="model in getModelUsageOptions(slot.id)"
                        :key="`${slot.id}-model-${model}`"
                        type="button"
                        class="agent-narration-model-option"
                        @mousedown.prevent="selectModelUsageModel(slot.id, model)"
                      >
                        {{ model }}
                      </button>
                    </div>
                  </span>
                </label>
                <button
                  type="button"
                  class="api-config-secondary-button agent-model-load-button"
                  :disabled="isModelUsageLoadDisabled(slot.id)"
                  @click="loadModelUsagePresetModels(slot.id)"
                >
                  {{ isModelUsageLoading(slot.id) ? '加载中...' : '加载模型' }}
                </button>
                <button
                  type="button"
                  class="api-config-secondary-button"
                  @click="openModelUsageSettings(slot.id)"
                >
                  参数
                </button>
              </div>
              <!-- 批次3·第四槽「编目」＝嵌入向量：走服务端管理嵌入预设（capability=embedding·与文本槽不同源），
                   现役恒用琅嬛默认，暂不开放自选（开放与否待用户真机后拍板），此处只展示走向。 -->
              <div class="agent-usage-row agent-usage-row--readonly">
                <div class="agent-usage-row__label">
                  <strong>编目（嵌入）</strong>
                  <small>向量召回/取料嵌入使用：琅嬛默认嵌入预设（服务端统一管理）</small>
                </div>
              </div>
            </div>
          </section>
          <section class="agent-review-card">
            <h4>召回与写入策略</h4>
            <div class="agent-recall-layout">
              <div class="agent-recall-strategy">
                <p class="agent-recall-managed-note">只配置召回策略、读取策略和写入审查参数。</p>
                <label class="api-field api-field--select">
                  <span>意图快照</span>
                  <select
                    :value="draftAgentConfig.intentSnapshotMode || 'rules'"
                    @change="updateAgentDraft({ intentSnapshotMode: (($event.target as HTMLSelectElement).value === 'smart' ? 'smart' : 'rules') })"
                  >
                    <option value="rules">规则快照</option>
                    <option value="smart">智能快照</option>
                  </select>
                </label>
                <label class="api-field api-field--select">
                  <span>候选生成</span>
                  <select
                    :value="draftAgentConfig.recallCandidateMode"
                    @change="updateAgentDraft({ recallCandidateMode: normalizeRecallCandidateMode(($event.target as HTMLSelectElement).value) })"
                  >
                    <option value="parallel_merge">规则与嵌入并行合并</option>
                    <option value="rules_first">规则优先</option>
                    <option value="embedding_first">嵌入优先</option>
                  </select>
                </label>
                <label class="api-field api-field--select">
                  <span>确认区读取</span>
                  <select
                    :value="draftAgentConfig.recallContentStrategy"
                    @change="updateAgentDraft({ recallContentStrategy: normalizeRecallContentStrategy(($event.target as HTMLSelectElement).value) })"
                  >
                    <option value="summary_gate">摘要门控</option>
                    <option value="full_aware">正文感知</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="agent-review-grid agent-review-grid--writeback">
              <label class="api-field">
                <span>写入审查轮数</span>
                <input
                  :value="draftAgentConfig.writeBackMaxReviewRounds"
                  type="number"
                  min="1"
                  max="10"
                  @input="updateAgentDraft({ writeBackMaxReviewRounds: Number(($event.target as HTMLInputElement).value) })"
                >
              </label>
              <label class="api-field api-field--select">
                <span>写入审计粒度</span>
                <select :value="draftAgentConfig.writeBackAuditLogLevel" @change="updateAgentDraft({ writeBackAuditLogLevel: normalizeWriteBackAuditLogLevel(($event.target as HTMLSelectElement).value) })">
                  <option value="summary">summary</option>
                  <option value="standard">standard</option>
                  <option value="debug">debug</option>
                </select>
              </label>
            </div>
          </section>
        </div>
      </div>

      <div v-else class="api-config-page api-config-page--weather">
        <section class="api-config-form-panel api-config-form-panel--weather">
          <div class="api-config-form-panel__head">
            <h3>天气服务</h3>
          </div>
          <div class="api-config-form">
            <label class="api-field api-field--secret">
              <span>API Key</span>
              <span class="api-secret-input">
                <input
                  :value="draftWeatherApiKey"
                  type="password"
                  placeholder="和风天气 API Key"
                  @input="draftWeatherApiKey = ($event.target as HTMLInputElement).value"
                >
                <span aria-hidden="true">⌁</span>
              </span>
            </label>
            <label class="api-field api-field--select">
              <span>版本</span>
              <select :value="draftWeatherApiDomain" @change="draftWeatherApiDomain = ($event.target as HTMLSelectElement).value">
                <option value="devapi.qweather.com">免费开发版 (devapi)</option>
                <option value="api.qweather.com">付费商业版 (api)</option>
              </select>
            </label>
          </div>
        </section>
      </div>
    </div>

    <footer class="api-config-modal__footer">
      <button type="button" class="api-footer-button" @click="emit('close')">取消</button>
      <div class="api-footer-actions">
        <button
          v-if="showLoadModelsAction"
          type="button"
          class="api-footer-button"
          :disabled="!canUseDraftApiKey || viewModel.isLoadingModels"
          @click="loadModelsForDraft"
        >
          {{ viewModel.isLoadingModels ? '加载中...' : '加载列表' }}
        </button>
        <button
          v-if="showDeletePresetAction"
          type="button"
          class="api-footer-button api-footer-button--danger"
          @click="deleteSelectedPreset"
        >
          删除预设
        </button>
        <button type="button" class="api-footer-button api-footer-button--primary" @click="runPrimaryAction">
          {{ primaryActionLabel }}
        </button>
      </div>
    </footer>
    <AppModalShell
      v-if="editingModelUsageSlot"
      :open="Boolean(editingModelUsageSlot)"
      title="模型参数"
      size="sm"
      @close="closeModelUsageSettings"
    >
      <div class="agent-params-dialog">
        <label v-if="!isEditingSubscriptionBridge" class="api-field">
          <span>温度</span>
          <input
            :value="editingModelUsageConfig.temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            @input="updateModelUsageDraft(editingModelUsageSlot, { temperature: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>
        <label class="api-field">
          <span>最大 Token</span>
          <input
            :value="editingModelUsageConfig.maxTokens"
            type="number"
            min="1"
            max="32768"
            @input="updateModelUsageDraft(editingModelUsageSlot, { maxTokens: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>
        <label class="api-field api-field--select">
          <span>{{ isEditingAgySubscriptionBridge ? '思考摘要（AGY 暂不回传）' : (isEditingSubscriptionBridge ? '返回思考摘要' : '思考过程') }}</span>
          <select
            :value="isEditingAgySubscriptionBridge ? 'disabled' : editingModelUsageConfig.thinking"
            :disabled="isEditingAgySubscriptionBridge"
            @change="updateModelUsageDraft(editingModelUsageSlot, { thinking: (($event.target as HTMLSelectElement).value === 'enabled' ? 'enabled' : 'disabled') })"
          >
            <option value="disabled">{{ isEditingSubscriptionBridge ? '不返回' : '不传回' }}</option>
            <option value="enabled">{{ isEditingSubscriptionBridge ? '返回摘要' : '传回' }}</option>
          </select>
        </label>
        <div v-if="editingFastServiceTierAvailable" class="api-option-row api-option-row--compact">
          <span class="api-option-row__copy">
            <strong>快速服务</strong>
            <small>使用当前 Codex 模型提供的快速服务档</small>
          </span>
          <button
            type="button"
            class="api-option-button"
            :class="{ 'is-active': editingModelUsageConfig.serviceTier === 'fast' }"
            :aria-pressed="editingModelUsageConfig.serviceTier === 'fast'"
            @click="toggleEditingFastServiceTier"
          >Fast</button>
        </div>
      </div>
      <template #actions>
        <button type="button" class="api-footer-button api-footer-button--primary" @click="closeModelUsageSettings">完成</button>
      </template>
    </AppModalShell>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
import type {
  AgentModelConfig,
  AiProviderMode,
  ModelUsageConfig,
  ModelUsageSlotId,
  RecallCandidateGenerationMode,
  RecallConfirmedContentStrategy,
  WriteBackAuditLogLevel
  } from '../../../types'
import type {
  ApiConfigPanelActions,
  ApiConfigPanelViewModel,
  ApiPresetFormViewModel,
  NamedEntity
} from '../../../types/panelContracts'
import { API } from '../../../config/api'
import { cloneDefaultModelUsageConfigs, normalizeModelUsageConfigs } from '../../../utils/modelUsageConfig'
import {
  isSubscriptionBridgeProvider,
  modelSupportsServiceTier,
  subscriptionBridgeReturnsThinkingSummary,
  type AiModelCatalogItem
} from '../../../utils/subscriptionBridgeParameters'
import { getAiProviderTemplate, getKeylessAiProviderHint, isKeylessAiProvider, normalizeAiProviderType } from '../../../../shared/aiProviders'
import AppModalShell from '../../common/AppModalShell.vue'

const props = defineProps<{
  viewModel: ApiConfigPanelViewModel
  actions: ApiConfigPanelActions
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const tabs = [
  { id: 'presets', label: '模型预设' },
  { id: 'agent', label: 'Agent模型' },
  { id: 'weather', label: '天气服务' }
] as const

const activeTab = ref<typeof tabs[number]['id']>('presets')

const agentBlocks = [
  { id: 'recall', label: '召回判断' },
  { id: 'writeback', label: '写入审查' },
  { id: 'narration', label: '旁白链路' }
] as const

const defaultModelUsageConfigs = cloneDefaultModelUsageConfigs()

const defaultBrainAgentConfig: AgentModelConfig = {
  id: 'brain_agent',
  name: '大脑 Agent',
  agentType: 'brain',
  modelUsageConfigs: defaultModelUsageConfigs.map((item) => ({ ...item })),
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

// 文本槽四档+编目（嵌入·服务端管理默认，UI 单独展示行）。
// 调用场景→档位由代码内任务分级表决定（src/utils/modelTaskTiers.ts），槽位只管「这一档用哪个预设/模型」。
// ⚠️ 联动：MobileApiConfigWorkspace.vue 的 modelUsageSlots 是同一份口径的移动端复制，改这里要同步改那边。
const modelUsageSlots: Array<{ id: ModelUsageSlotId; label: string; hint: string }> = [
  { id: 'fast', label: '书童（快）', hint: '最快最省：格式化、小判断；也可供 Agent 对话临时选择' },
  { id: 'balanced', label: '校书（均衡）', hint: '默认主力：提调/编排、召回裁判；也可供 Agent 对话临时选择' },
  { id: 'message', label: '执笔（消息）', hint: '正文专用：角色消息与旁白消息' },
  { id: 'smart', label: '掌阁（高智）', hint: '最聪明：Agent 对话默认档、灵魂自动写、人格校准/训练' }
]

const brainAgentConfig = computed<AgentModelConfig>(() => {
  return props.viewModel.agentModelConfigs.find((item) => item.id === 'brain_agent') || {
    ...defaultBrainAgentConfig
  }
})

const draftAiProviderMode = ref<AiProviderMode>('custom')
const selectedPresetIndex = ref(props.viewModel.currentApiPresetIndex)
const draftShowEditApiPreset = ref(props.viewModel.showEditApiPreset)
const draftDefaultPresetName = ref(props.viewModel.defaultPresetName)
const draftApiPresetForm = ref<ApiPresetFormViewModel>(cloneApiPresetForm(props.viewModel.apiPresetForm))
const apiPresetDraftDirty = ref(false)
const draftWeatherApiKey = ref(props.viewModel.weatherApiKey || '')
const draftWeatherApiDomain = ref(props.viewModel.weatherApiDomain || 'devapi.qweather.com')
const draftAgentConfig = ref<AgentModelConfig>(cloneAgentConfig(brainAgentConfig.value))
const primaryAgentModelOptions = ref<string[]>([])
const fallbackAgentModelOptions = ref<string[]>([])
const primaryAgentModelLoading = ref(false)
const fallbackAgentModelLoading = ref(false)
type NarrationModelSlot = 'quickJudge' | 'beat' | 'generation' | 'location'
const narrationModelOptions = ref<Record<NarrationModelSlot, string[]>>({
  quickJudge: [],
  beat: [],
  generation: [],
  location: []
})
const narrationModelLoading = ref<Record<NarrationModelSlot, boolean>>({
  quickJudge: false,
  beat: false,
  generation: false,
  location: false
})
const activeNarrationModelMenu = ref<NarrationModelSlot | ''>('')
const modelUsageOptions = ref<Record<ModelUsageSlotId, string[]>>({
  fast: [],
  balanced: [],
  message: [],
  smart: []
})
const modelUsageCatalogs = ref<Partial<Record<ModelUsageSlotId, AiModelCatalogItem[]>>>({})
const modelUsageLoading = ref<Record<ModelUsageSlotId, boolean>>({
  fast: false,
  balanced: false,
  message: false,
  smart: false
})
const activeModelUsageMenu = ref<ModelUsageSlotId | ''>('')
const editingModelUsageSlot = ref<ModelUsageSlotId | ''>('')

const providerLabel = computed(() => {
  const current = props.viewModel.apiProviderTemplates.find((item) => String(item.id || item.name) === draftApiPresetForm.value.providerType)
  return current?.name || 'OpenAI 兼容'
})

const apiKeyPlaceholder = computed(() => {
  const keylessHint = getKeylessAiProviderHint(draftApiPresetForm.value.providerType)
  if (keylessHint) return keylessHint
  return draftApiPresetForm.value.hasApiKey ? '已保存密钥，留空保留' : 'sk-xxx'
})
const canUseDraftApiKey = computed(() => Boolean(
  String(draftApiPresetForm.value.apiUrl || '').trim()
  // 本机订阅桥免密钥：只要地址（模板伪值）在即可测试/取模型
  && (isKeylessAiProvider(draftApiPresetForm.value.providerType)
    || String(draftApiPresetForm.value.apiKey || '').trim()
    || draftApiPresetForm.value.hasApiKey)
))
const showLoadModelsAction = computed(() => activeTab.value === 'presets')
const showDeletePresetAction = computed(() => (
  activeTab.value === 'presets'
  && props.viewModel.apiPresets.length > 1
  && draftShowEditApiPreset.value
  && selectedPresetIndex.value >= 0
))
const primaryActionLabel = computed(() => {
  if (activeTab.value === 'agent') return '保存配置'
  if (activeTab.value === 'weather') return '保存配置'
  return '保存配置'
})
async function runPrimaryAction() {
  if (activeTab.value === 'presets') {
    await saveDraftApiSettings()
    return
  }
  if (activeTab.value === 'weather') {
    await saveDraftWeatherSettings()
    return
  }
  await saveDraftAgentSettings()
}

function cloneApiPresetForm(source: Partial<ApiPresetFormViewModel> = {}): ApiPresetFormViewModel {
  return {
    originalName: String(source.originalName || source.name || ''),
    name: String(source.name || ''),
    providerType: String(source.providerType || 'openai-compatible'),
    apiUrl: String(source.apiUrl || ''),
    apiKey: String(source.apiKey || ''),
    hasApiKey: Boolean(source.hasApiKey),
    model: '',
    temperature: undefined,
    maxTokens: undefined,
    fallbackPreset: '',
    maxConcurrency: source.maxConcurrency ?? 6,
    minInterval: source.minInterval ?? 0,
    supportsVision: Boolean(source.supportsVision)
  }
}

function hydrateDraftApiPresetForm(form: Partial<ApiPresetFormViewModel>) {
  draftApiPresetForm.value = cloneApiPresetForm(form)
}

function normalizeTemperature(value: unknown, fallback: number): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(0, Math.min(2, next))
}

function normalizeUsageMaxTokens(value: unknown, fallback: number): number {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return fallback
  return Math.max(1, Math.min(32768, Math.trunc(next)))
}

function cloneModelUsageConfigs(source: Partial<AgentModelConfig> = {}): ModelUsageConfig[] {
  return normalizeModelUsageConfigs(source, defaultModelUsageConfigs)
}

function cloneAgentConfig(source: Partial<AgentModelConfig> = {}): AgentModelConfig {
  const modelUsageConfigs = cloneModelUsageConfigs(source)
  // 批次3（2026-07-08 槽位收束）：平铺 legacy 字段同步源改新槽（与 settingRepository.normalizeAgentModelConfig 同口径·
  // 平铺字段只为旧版本回滚可读，不是新真值）：校书→presetName/recallModel/narrationGeneration*、书童→narrationQuickJudge*、掌阁→narrativeBeat*。
  const usageById = new Map(modelUsageConfigs.map((item) => [item.id, item]))
  const narrationUsage = usageById.get('balanced')
  const quickUsage = usageById.get('fast')
  const balancedUsage = usageById.get('balanced')
  const highVolumeUsage = usageById.get('smart')
  return {
    ...defaultBrainAgentConfig,
    ...source,
    modelUsageConfigs,
    id: source.id || defaultBrainAgentConfig.id,
    name: source.name || defaultBrainAgentConfig.name,
    agentType: source.agentType || defaultBrainAgentConfig.agentType,
    presetName: String(balancedUsage?.presetName || source.presetName || ''),
    recallModel: String(balancedUsage?.model || source.recallModel || ''),
    recallMaxTokens: toNumber(balancedUsage?.maxTokens || source.recallMaxTokens, defaultBrainAgentConfig.recallMaxTokens || 512),
    disableRecallThinking: balancedUsage?.thinking ? balancedUsage.thinking === 'disabled' : source.disableRecallThinking !== false,
    fallbackPresetName: String(source.fallbackPresetName || ''),
    fallbackRecallModel: String(source.fallbackRecallModel || ''),
    fallbackRecallMaxTokens: toNumber(source.fallbackRecallMaxTokens, defaultBrainAgentConfig.fallbackRecallMaxTokens || 512),
    embeddingPresetId: '',
    narrationQuickJudgePresetName: String(quickUsage?.presetName || source.narrationQuickJudgePresetName || ''),
    narrationQuickJudgeModel: String(quickUsage?.model || source.narrationQuickJudgeModel || ''),
    narrativeBeatPresetName: String(highVolumeUsage?.presetName || source.narrativeBeatPresetName || ''),
    narrativeBeatModel: String(highVolumeUsage?.model || source.narrativeBeatModel || ''),
    narrativeBeatMaxTokens: toNumber(highVolumeUsage?.maxTokens || source.narrativeBeatMaxTokens, defaultBrainAgentConfig.narrativeBeatMaxTokens || 8192),
    narrationGenerationPresetName: String(narrationUsage?.presetName || source.narrationGenerationPresetName || ''),
    narrationGenerationModel: String(narrationUsage?.model || source.narrationGenerationModel || ''),
    virtualSceneLocationPresetName: String(source.virtualSceneLocationPresetName || ''),
    virtualSceneLocationModel: String(source.virtualSceneLocationModel || ''),
    virtualSceneLocationMaxTokens: toNumber(source.virtualSceneLocationMaxTokens, defaultBrainAgentConfig.virtualSceneLocationMaxTokens || 512),
    intentSnapshotMode: source.intentSnapshotMode === 'smart' ? 'smart' : 'rules',
    recallCandidateMode: normalizeRecallCandidateMode(source.recallCandidateMode),
    recallContentStrategy: normalizeRecallContentStrategy(source.recallContentStrategy),
    writeBackMaxReviewRounds: toNumber(source.writeBackMaxReviewRounds, defaultBrainAgentConfig.writeBackMaxReviewRounds),
    writeBackAuditLogLevel: normalizeWriteBackAuditLogLevel(source.writeBackAuditLogLevel),
    enabled: source.enabled !== false,
    capabilities: Array.isArray(source.capabilities) && source.capabilities.length
      ? [...source.capabilities]
      : [...defaultBrainAgentConfig.capabilities]
  }
}

watch(
  () => props.viewModel.aiProviderMode,
  () => {
    draftAiProviderMode.value = 'custom'
  }
)

watch(
  () => props.viewModel.defaultPresetName,
  (name) => {
    draftDefaultPresetName.value = String(name || '')
  }
)

watch(
  () => props.viewModel.currentApiPresetIndex,
  (index) => {
    if (!draftShowEditApiPreset.value) return
    if (selectedPresetIndex.value !== index) {
      apiPresetDraftDirty.value = false
    }
    selectedPresetIndex.value = index
  }
)

watch(
  () => props.viewModel.showEditApiPreset,
  (show) => {
    if (draftShowEditApiPreset.value !== show) {
      apiPresetDraftDirty.value = false
    }
    draftShowEditApiPreset.value = show
  }
)

watch(
  () => props.viewModel.apiPresetForm,
  (form) => {
    if (!draftShowEditApiPreset.value) return
    if (apiPresetDraftDirty.value) return
    hydrateDraftApiPresetForm(form)
  },
  { deep: true }
)

watch(
  () => props.viewModel.weatherApiKey,
  (key) => {
    draftWeatherApiKey.value = key || ''
  }
)

watch(
  () => props.viewModel.weatherApiDomain,
  (domain) => {
    draftWeatherApiDomain.value = domain || 'devapi.qweather.com'
  }
)

watch(
  brainAgentConfig,
  (config) => {
    draftAgentConfig.value = cloneAgentConfig(config)
  },
  { deep: true }
)

function normalizeAvailableModels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function getPresetByName(presetName: string) {
  const name = String(presetName || '').trim()
  if (!name) return null
  return props.viewModel.apiPresets.find((preset) => String(preset.name || '').trim() === name) || null
}

function getEffectiveAgentPresetName(kind: 'primary' | 'fallback'): string {
  if (kind === 'primary') return String(draftAgentConfig.value.presetName || '').trim()
  return String(draftAgentConfig.value.fallbackPresetName || draftAgentConfig.value.presetName || '').trim()
}

function getStoredAgentModelOptions(kind: 'primary' | 'fallback'): string[] {
  const preset = getPresetByName(getEffectiveAgentPresetName(kind))
  if (!preset) return []
  return normalizeAvailableModels((preset as Record<string, unknown>).availableModels ?? (preset as Record<string, unknown>).available_models)
}

function getPresetDefaultModel(preset: NamedEntity | null): string {
  return String((preset as Record<string, unknown> | null)?.model || '').trim()
}

function mergeModelOptions(options: string[], fallbackModel = ''): string[] {
  return Array.from(new Set([...options, fallbackModel].map((item) => String(item || '').trim()).filter(Boolean)))
}

function getAgentModelOptions(kind: 'primary' | 'fallback'): string[] {
  const loaded = kind === 'primary' ? primaryAgentModelOptions.value : fallbackAgentModelOptions.value
  const preset = getPresetByName(getEffectiveAgentPresetName(kind))
  const stored = getStoredAgentModelOptions(kind)
  return loaded.length ? mergeModelOptions(loaded, getPresetDefaultModel(preset)) : mergeModelOptions(stored, getPresetDefaultModel(preset))
}

function isAgentModelSelectDisabled(kind: 'primary' | 'fallback'): boolean {
  return kind === 'primary'
    ? primaryAgentModelLoading.value
    : fallbackAgentModelLoading.value
}

function isAgentModelLoadDisabled(kind: 'primary' | 'fallback'): boolean {
  const preset = getPresetByName(getEffectiveAgentPresetName(kind))
  const loading = kind === 'primary' ? primaryAgentModelLoading.value : fallbackAgentModelLoading.value
  return loading || !preset
}

function buildAgentModelHint(kind: 'primary' | 'fallback'): string {
  const presetName = getEffectiveAgentPresetName(kind)
  const options = getAgentModelOptions(kind)
  if (options.length) return `已读取 ${options.length} 个模型，可在同一 API 地址下分开选择。`
  return '可与默认预设相同，也可切到另一个 API 预设。'
}

async function loadAgentPresetModels(kind: 'primary' | 'fallback') {
  const preset = getPresetByName(getEffectiveAgentPresetName(kind))
  if (!preset) return

  const loadingRef = kind === 'primary' ? primaryAgentModelLoading : fallbackAgentModelLoading
  const optionsRef = kind === 'primary' ? primaryAgentModelOptions : fallbackAgentModelOptions
  loadingRef.value = true
  try {
    const response = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await response.json() as { data?: Array<{ id: string }>; error?: string }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
    const models = Array.isArray(data.data)
      ? data.data.map((item) => String(item.id || '').trim()).filter(Boolean)
      : []
    optionsRef.value = models
  } catch (error) {
    console.error('加载 Agent 可选模型失败:', error)
    optionsRef.value = []
  } finally {
    loadingRef.value = false
  }
}

function getNarrationPresetField(slot: NarrationModelSlot): keyof AgentModelConfig {
  if (slot === 'quickJudge') return 'narrationQuickJudgePresetName'
  if (slot === 'beat') return 'narrativeBeatPresetName'
  if (slot === 'location') return 'virtualSceneLocationPresetName'
  return 'narrationGenerationPresetName'
}

function getNarrationModelField(slot: NarrationModelSlot): keyof AgentModelConfig {
  if (slot === 'quickJudge') return 'narrationQuickJudgeModel'
  if (slot === 'beat') return 'narrativeBeatModel'
  if (slot === 'location') return 'virtualSceneLocationModel'
  return 'narrationGenerationModel'
}

function getEffectiveNarrationPresetName(slot: NarrationModelSlot): string {
  const presetField = getNarrationPresetField(slot)
  return String((draftAgentConfig.value[presetField] as string) || draftAgentConfig.value.presetName || '').trim()
}

function getStoredNarrationModelOptions(slot: NarrationModelSlot): string[] {
  const preset = getPresetByName(getEffectiveNarrationPresetName(slot))
  if (!preset) return []
  return normalizeAvailableModels((preset as Record<string, unknown>).availableModels ?? (preset as Record<string, unknown>).available_models)
}

function getNarrationModelOptions(slot: NarrationModelSlot): string[] {
  const loaded = narrationModelOptions.value[slot] || []
  const preset = getPresetByName(getEffectiveNarrationPresetName(slot))
  const stored = getStoredNarrationModelOptions(slot)
  return loaded.length ? mergeModelOptions(loaded, getPresetDefaultModel(preset)) : mergeModelOptions(stored, getPresetDefaultModel(preset))
}

function getModelUsageConfig(slotId: ModelUsageSlotId): ModelUsageConfig {
  const source = Array.isArray(draftAgentConfig.value.modelUsageConfigs) ? draftAgentConfig.value.modelUsageConfigs : []
  return source.find((item) => item.id === slotId) || cloneModelUsageConfigs(draftAgentConfig.value).find((item) => item.id === slotId)!
}

const editingModelUsageConfig = computed(() => {
  return editingModelUsageSlot.value
    ? getModelUsageConfig(editingModelUsageSlot.value)
    : defaultModelUsageConfigs[0]
})

const editingModelUsageProviderType = computed(() => {
  if (!editingModelUsageSlot.value) return ''
  const preset = getPresetByName(getEffectiveModelUsagePresetName(editingModelUsageSlot.value))
  return normalizeAiProviderType((preset as Record<string, unknown> | null)?.providerType
    ?? (preset as Record<string, unknown> | null)?.provider_type)
})

const isEditingSubscriptionBridge = computed(() => isSubscriptionBridgeProvider(editingModelUsageProviderType.value))
const isEditingAgySubscriptionBridge = computed(() => isEditingSubscriptionBridge.value
  && !subscriptionBridgeReturnsThinkingSummary(editingModelUsageProviderType.value))

const editingFastServiceTierAvailable = computed(() => {
  if (!editingModelUsageSlot.value || editingModelUsageProviderType.value !== 'codex-subscription') return false
  if (editingModelUsageConfig.value.serviceTier === 'fast') return true
  return modelSupportsServiceTier(
    editingModelUsageProviderType.value,
    getEffectiveModelUsageModel(editingModelUsageSlot.value),
    modelUsageCatalogs.value[editingModelUsageSlot.value] || [],
    'fast'
  )
})

function getEffectiveModelUsagePresetName(slotId: ModelUsageSlotId): string {
  const configured = String(getModelUsageConfig(slotId).presetName || '').trim()
  return configured || String(draftDefaultPresetName.value || '').trim()
}

function getEffectiveModelUsageModel(slotId: ModelUsageSlotId): string {
  const configured = String(getModelUsageConfig(slotId).model || '').trim()
  const preset = getPresetByName(getEffectiveModelUsagePresetName(slotId)) as Record<string, unknown> | null
  return configured || String(preset?.model || '').trim() || 'default'
}

function getStoredModelUsageOptions(slotId: ModelUsageSlotId): string[] {
  const preset = getPresetByName(getEffectiveModelUsagePresetName(slotId))
  if (!preset) return []
  return normalizeAvailableModels((preset as Record<string, unknown>).availableModels ?? (preset as Record<string, unknown>).available_models)
}

function getModelUsageOptions(slotId: ModelUsageSlotId): string[] {
  const loaded = modelUsageOptions.value[slotId] || []
  const preset = getPresetByName(getEffectiveModelUsagePresetName(slotId))
  const stored = getStoredModelUsageOptions(slotId)
  return loaded.length ? mergeModelOptions(loaded, getPresetDefaultModel(preset)) : mergeModelOptions(stored, getPresetDefaultModel(preset))
}

function isModelUsageLoading(slotId: ModelUsageSlotId): boolean {
  return Boolean(modelUsageLoading.value[slotId])
}

function isModelUsageLoadDisabled(slotId: ModelUsageSlotId): boolean {
  const presetName = getEffectiveModelUsagePresetName(slotId)
  const preset = getPresetByName(presetName)
  return isModelUsageLoading(slotId) || !preset
}

function openModelUsageMenu(slotId: ModelUsageSlotId) {
  if (!getModelUsageOptions(slotId).length) return
  activeModelUsageMenu.value = slotId
}

function toggleModelUsageMenu(slotId: ModelUsageSlotId) {
  if (activeModelUsageMenu.value === slotId) {
    closeModelUsageMenu()
    return
  }
  openModelUsageMenu(slotId)
}

function closeModelUsageMenu() {
  activeModelUsageMenu.value = ''
}

function isModelUsageMenuOpen(slotId: ModelUsageSlotId): boolean {
  return activeModelUsageMenu.value === slotId && getModelUsageOptions(slotId).length > 0
}

function selectModelUsageModel(slotId: ModelUsageSlotId, model: string) {
  updateModelUsageModelDraft(slotId, model)
  closeModelUsageMenu()
}

function selectModelUsagePreset(slotId: ModelUsageSlotId, presetName: string) {
  modelUsageOptions.value = { ...modelUsageOptions.value, [slotId]: [] }
  const nextCatalogs = { ...modelUsageCatalogs.value }
  delete nextCatalogs[slotId]
  modelUsageCatalogs.value = nextCatalogs
  updateModelUsageDraft(slotId, { presetName, model: '', serviceTier: '' })
}

function updateModelUsageModelDraft(slotId: ModelUsageSlotId, model: string) {
  const current = getModelUsageConfig(slotId)
  const keepFast = current.serviceTier === 'fast' && modelSupportsServiceTier(
    getUsageProviderTypeForModel(slotId),
    model || 'default',
    modelUsageCatalogs.value[slotId] || [],
    'fast'
  )
  updateModelUsageDraft(slotId, { model, serviceTier: keepFast ? 'fast' : '' })
}

function getUsageProviderTypeForModel(slotId: ModelUsageSlotId): string {
  const preset = getPresetByName(getEffectiveModelUsagePresetName(slotId)) as Record<string, unknown> | null
  return normalizeAiProviderType(preset?.providerType ?? preset?.provider_type)
}

function updateModelUsageDraft(slotId: ModelUsageSlotId, changes: Partial<ModelUsageConfig>) {
  const currentConfigs = cloneModelUsageConfigs(draftAgentConfig.value)
  const nextConfigs = currentConfigs.map((item) => {
    if (item.id !== slotId) return item
    return {
      ...item,
      ...changes,
      id: item.id,
      label: item.label,
      presetName: String(changes.presetName ?? item.presetName ?? ''),
      model: String(changes.model ?? item.model ?? ''),
      temperature: normalizeTemperature(changes.temperature, item.temperature),
      maxTokens: normalizeUsageMaxTokens(changes.maxTokens, item.maxTokens),
      thinking: changes.thinking === 'enabled' || changes.thinking === 'disabled' ? changes.thinking : item.thinking,
      serviceTier: changes.serviceTier === undefined ? item.serviceTier : (changes.serviceTier === 'fast' ? 'fast' : '')
    }
  })
  // 批次3（2026-07-08 槽位收束）：平铺 legacy 字段同步源改新槽（与 cloneAgentConfig/settingRepository 同口径）。
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

async function loadModelUsagePresetModels(slotId: ModelUsageSlotId, openMenuAfterLoad = true) {
  const preset = getPresetByName(getEffectiveModelUsagePresetName(slotId))
  if (!preset) return
  modelUsageLoading.value = {
    ...modelUsageLoading.value,
    [slotId]: true
  }
  try {
    const response = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await response.json() as { data?: AiModelCatalogItem[]; error?: string }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
    const catalog = Array.isArray(data.data)
      ? data.data.filter((item) => String(item?.id || '').trim())
      : []
    const models = catalog
      .map((item) => String(item.id || '').trim()).filter(Boolean)
    modelUsageCatalogs.value = {
      ...modelUsageCatalogs.value,
      [slotId]: catalog
    }
    modelUsageOptions.value = {
      ...modelUsageOptions.value,
      [slotId]: models
    }
    if (openMenuAfterLoad) openModelUsageMenu(slotId)
  } catch (error) {
    console.error('加载用途模型列表失败:', error)
    modelUsageOptions.value = {
      ...modelUsageOptions.value,
      [slotId]: []
    }
    const nextCatalogs = { ...modelUsageCatalogs.value }
    delete nextCatalogs[slotId]
    modelUsageCatalogs.value = nextCatalogs
  } finally {
    modelUsageLoading.value = {
      ...modelUsageLoading.value,
      [slotId]: false
    }
  }
}

async function openModelUsageSettings(slotId: ModelUsageSlotId) {
  editingModelUsageSlot.value = slotId
  if (getUsageProviderTypeForModel(slotId) === 'codex-subscription' && !modelUsageCatalogs.value[slotId]) {
    await loadModelUsagePresetModels(slotId, false)
  }
}

function toggleEditingFastServiceTier() {
  if (!editingModelUsageSlot.value || !editingFastServiceTierAvailable.value) return
  updateModelUsageDraft(editingModelUsageSlot.value, {
    serviceTier: editingModelUsageConfig.value.serviceTier === 'fast' ? '' : 'fast'
  })
}

async function closeModelUsageSettings() {
  const hadEditingSlot = Boolean(editingModelUsageSlot.value)
  editingModelUsageSlot.value = ''
  if (hadEditingSlot) {
    await saveDraftAgentSettings()
  }
}

function isNarrationModelSelectDisabled(slot: NarrationModelSlot): boolean {
  return narrationModelLoading.value[slot]
}

function isNarrationModelLoadDisabled(slot: NarrationModelSlot): boolean {
  const preset = getPresetByName(getEffectiveNarrationPresetName(slot))
  return narrationModelLoading.value[slot] || !preset
}

function openNarrationModelMenu(slot: NarrationModelSlot) {
  if (!getNarrationModelOptions(slot).length) return
  activeNarrationModelMenu.value = slot
}

function closeNarrationModelMenu() {
  activeNarrationModelMenu.value = ''
}

function isNarrationModelMenuOpen(slot: NarrationModelSlot): boolean {
  return activeNarrationModelMenu.value === slot && getNarrationModelOptions(slot).length > 0
}

function selectNarrationModel(slot: NarrationModelSlot, model: string) {
  const modelField = getNarrationModelField(slot)
  updateAgentDraft({
    [modelField]: model
  } as Partial<AgentModelConfig>)
  closeNarrationModelMenu()
}

function updateNarrationPresetDraft(slot: NarrationModelSlot, presetName: string) {
  const presetField = getNarrationPresetField(slot)
  const modelField = getNarrationModelField(slot)
  narrationModelOptions.value = {
    ...narrationModelOptions.value,
    [slot]: []
  }
  updateAgentDraft({
    [presetField]: presetName,
    [modelField]: ''
  } as Partial<AgentModelConfig>)
}

async function loadNarrationPresetModels(slot: NarrationModelSlot) {
  const preset = getPresetByName(getEffectiveNarrationPresetName(slot))
  if (!preset) return

  narrationModelLoading.value = {
    ...narrationModelLoading.value,
    [slot]: true
  }
  try {
    const response = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await response.json() as { data?: Array<{ id: string }>; error?: string }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
    const models = Array.isArray(data.data)
      ? data.data.map((item) => String(item.id || '').trim()).filter(Boolean)
      : []
    narrationModelOptions.value = {
      ...narrationModelOptions.value,
      [slot]: models
    }
    openNarrationModelMenu(slot)
  } catch (error) {
    console.error('加载旁白链路可选模型失败:', error)
    narrationModelOptions.value = {
      ...narrationModelOptions.value,
      [slot]: []
    }
  } finally {
    narrationModelLoading.value = {
      ...narrationModelLoading.value,
      [slot]: false
    }
  }
}

function toNumber(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function presetToForm(preset: NamedEntity): ApiPresetFormViewModel {
  return {
    originalName: String(preset.name || ''),
    name: String(preset.name || ''),
    providerType: normalizeAiProviderType(preset.providerType || preset.provider_type),
    apiUrl: String(preset.baseUrl || preset.apiUrl || ''),
    apiKey: '',
    hasApiKey: Boolean(preset.hasApiKey),
    model: '',
    temperature: undefined,
    maxTokens: undefined,
    fallbackPreset: '',
    supportsVision: Boolean(preset.supportsVision)
  }
}

function selectPresetDraft(index: number) {
  const preset = props.viewModel.apiPresets[index]
  if (!preset) return
  apiPresetDraftDirty.value = false
  selectedPresetIndex.value = index
  draftShowEditApiPreset.value = true
  props.actions.loadApiPreset(index)
  hydrateDraftApiPresetForm(presetToForm(preset))
}

function startNewPresetDraft() {
  apiPresetDraftDirty.value = false
  selectedPresetIndex.value = -1
  draftShowEditApiPreset.value = false
  hydrateDraftApiPresetForm({
    providerType: 'openai-compatible',
    temperature: undefined,
    maxTokens: undefined
  })
}

function updateDraftApiPresetForm<K extends keyof ApiPresetFormViewModel>(key: K, value: ApiPresetFormViewModel[K]) {
  apiPresetDraftDirty.value = true
  draftApiPresetForm.value = {
    ...draftApiPresetForm.value,
    [key]: value
  }
}

function applyProviderTemplateDraft(providerType: string) {
  const template = getAiProviderTemplate(providerType)
  apiPresetDraftDirty.value = true
  draftApiPresetForm.value = {
    ...draftApiPresetForm.value,
    providerType: template.type,
    apiUrl: template.baseUrl,
    name: draftApiPresetForm.value.name || template.label,
    hasApiKey: draftApiPresetForm.value.hasApiKey,
    model: '',
    temperature: undefined,
    maxTokens: undefined,
    fallbackPreset: ''
  }
}

function isDraftDefaultPreset(preset: NamedEntity): boolean {
  return String(preset.name || '') === draftDefaultPresetName.value
}

function setDraftDefaultPreset(name: string) {
  const next = String(name || '').trim()
  if (!next) return
  draftDefaultPresetName.value = next
}

function syncDraftPresetFormToActions() {
  if (!draftShowEditApiPreset.value) {
    props.actions.addNewApiPreset()
  } else if (selectedPresetIndex.value >= 0 && selectedPresetIndex.value !== props.viewModel.currentApiPresetIndex) {
    props.actions.loadApiPreset(selectedPresetIndex.value)
  }
  const form = draftApiPresetForm.value
  props.actions.updateApiPresetForm({ key: 'originalName', value: form.originalName || '' })
  props.actions.updateApiPresetForm({ key: 'name', value: form.name })
  props.actions.updateApiPresetForm({ key: 'providerType', value: form.providerType })
  props.actions.updateApiPresetForm({ key: 'apiUrl', value: form.apiUrl })
  props.actions.updateApiPresetForm({ key: 'apiKey', value: form.apiKey })
  props.actions.updateApiPresetForm({ key: 'hasApiKey', value: form.hasApiKey })
  props.actions.updateApiPresetForm({ key: 'model', value: '' })
  props.actions.updateApiPresetForm({ key: 'temperature', value: undefined })
  props.actions.updateApiPresetForm({ key: 'maxTokens', value: undefined })
  props.actions.updateApiPresetForm({ key: 'fallbackPreset', value: '' })
  props.actions.updateApiPresetForm({ key: 'maxConcurrency', value: form.maxConcurrency ?? 6 })
  props.actions.updateApiPresetForm({ key: 'minInterval', value: form.minInterval ?? 0 })
  props.actions.updateApiPresetForm({ key: 'supportsVision', value: Boolean(form.supportsVision) })
}

async function saveDraftApiSettings() {
  if (draftAiProviderMode.value !== props.viewModel.aiProviderMode) {
    await Promise.resolve(props.actions.setAiProviderMode(draftAiProviderMode.value))
  }
  const originalName = String(draftApiPresetForm.value.originalName || '').trim()
  const nextName = String(draftApiPresetForm.value.name || '').trim()
  syncDraftPresetFormToActions()
  await Promise.resolve(props.actions.saveApiPreset())
  if (originalName && nextName && draftDefaultPresetName.value === originalName) {
    draftDefaultPresetName.value = nextName
  }
  if (draftDefaultPresetName.value) {
    await Promise.resolve(props.actions.setDefaultPreset(draftDefaultPresetName.value))
  }
  if (nextName) {
    hydrateDraftApiPresetForm({
      ...draftApiPresetForm.value,
      originalName: nextName,
      name: nextName,
      hasApiKey: Boolean(draftApiPresetForm.value.hasApiKey || draftApiPresetForm.value.apiKey)
    })
  }
  apiPresetDraftDirty.value = false
}

async function saveDraftWeatherSettings() {
  const keyChanged = draftWeatherApiKey.value !== props.viewModel.weatherApiKey
  const domainChanged = draftWeatherApiDomain.value !== props.viewModel.weatherApiDomain
  if (!keyChanged && !domainChanged) return
  props.actions.updateWeatherApiKey(draftWeatherApiKey.value)
  props.actions.updateWeatherApiDomain(draftWeatherApiDomain.value)
  await Promise.resolve(props.actions.saveWeatherApiConfig())
}

async function saveDraftAgentSettings() {
  props.actions.updateAgentModelConfig({
    id: draftAgentConfig.value.id,
    changes: { ...draftAgentConfig.value, embeddingPresetId: '', enabled: true }
  })
  await Promise.resolve(props.actions.saveAgentModelConfig())
}

async function loadModelsForDraft() {
  syncDraftPresetFormToActions()
  await Promise.resolve(props.actions.loadModels())
}

async function testApiConnectionForDraft() {
  syncDraftPresetFormToActions()
  await Promise.resolve(props.actions.testApiConnection())
}

function deleteSelectedPreset() {
  if (selectedPresetIndex.value >= 0 && selectedPresetIndex.value !== props.viewModel.currentApiPresetIndex) {
    props.actions.loadApiPreset(selectedPresetIndex.value)
  }
  props.actions.deleteCurrentApiPreset()
  selectedPresetIndex.value = 0
  draftShowEditApiPreset.value = true
  const firstPreset = props.viewModel.apiPresets[0]
  if (firstPreset) {
    hydrateDraftApiPresetForm(presetToForm(firstPreset))
  }
}

function updateAgentDraft(changes: Partial<AgentModelConfig>) {
  const nextChanges = { ...changes }
  draftAgentConfig.value = cloneAgentConfig({
    ...draftAgentConfig.value,
    ...nextChanges
  })
}

function normalizeRecallCandidateMode(value: unknown): RecallCandidateGenerationMode {
  return value === 'rules_first' || value === 'embedding_first' ? value : 'parallel_merge'
}

function normalizeRecallContentStrategy(value: unknown): RecallConfirmedContentStrategy {
  return value === 'full_aware' ? 'full_aware' : 'summary_gate'
}

function normalizeWriteBackAuditLogLevel(value: unknown): WriteBackAuditLogLevel {
  return value === 'summary' || value === 'standard' || value === 'debug' ? value : 'standard'
}
</script>

<style scoped>
.api-config-modal {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--morandi-text);
  background: transparent;
}

.api-config-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 26px 10px;
}

.api-config-modal__header h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0;
}

.api-config-modal__header p {
  margin: 8px 0 0;
  color: var(--morandi-text-light);
  font-size: 13px;
  line-height: 1.45;
}

.api-config-modal__close {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 30px;
  line-height: 1;
  cursor: pointer;
}

.api-config-tabs {
  display: flex;
  gap: 28px;
  margin: 0 26px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 20%, transparent);
}

.api-config-tab {
  appearance: none;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--morandi-text-light);
  padding: 12px 0 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.api-config-tab.active {
  color: #4f7658;
  border-bottom-color: #4f7658;
}

.api-config-modal__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 16px 26px 14px;
}

.api-config-page {
  min-height: 100%;
}

.api-config-page--presets {
  display: grid;
  grid-template-columns: 276px minmax(0, 1fr);
  gap: 14px;
}

.api-preset-sidebar,
.api-config-form-panel {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 18%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 58%, transparent);
}

.api-preset-sidebar {
  min-height: 430px;
  padding: 0 14px 14px;
}

.api-source-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin: 0 -14px 12px;
  padding: 7px 14px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 14%, transparent);
}

.api-source-switch__item {
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text-light);
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.api-source-switch__item.active {
  border-color: color-mix(in srgb, var(--morandi-border) 22%, transparent);
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text);
}

.api-preset-summary {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 12px 0;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.api-preset-list {
  display: grid;
  gap: 7px;
}

.api-preset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 16%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--morandi-card) 60%, transparent);
  padding: 0 10px 0 0;
}

.api-preset-row.active {
  border-color: rgba(80, 121, 88, 0.32);
  background: color-mix(in srgb, var(--morandi-accent) 10%, var(--morandi-card));
  box-shadow: inset 3px 0 0 #4f7658;
}

.api-preset-row__main {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  padding: 11px 0 11px 14px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
}

.api-preset-badge,
.api-preset-inline-action {
  color: #4f7658;
  font-size: 13px;
}

.api-preset-inline-action {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.api-preset-add {
  width: 100%;
  border: 1px dashed color-mix(in srgb, var(--morandi-border) 22%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  padding: 11px 14px;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
}

.api-preset-readonly-card {
  display: grid;
  gap: 8px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 16%, transparent);
  border-radius: 8px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.api-preset-readonly-card strong {
  color: var(--morandi-text);
}

.api-config-form-panel {
  padding: 18px 18px;
}

.api-config-form-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.api-config-form-panel__head h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 700;
}

.api-config-form,
.api-readonly-grid {
  display: grid;
  gap: 12px 14px;
}

.api-readonly-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.api-form-inline {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.api-field {
  display: grid;
  gap: 6px;
}

.api-field > span:first-child {
  color: var(--morandi-text);
  font-size: 13px;
}

.api-field-hint {
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.35;
}

.api-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 16%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 56%, transparent);
}

.api-option-row--compact {
  margin-top: 2px;
}

.api-option-row__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.api-option-row__copy strong {
  color: var(--morandi-text);
  font-size: 13px;
  font-weight: 600;
}

.api-option-row__copy small {
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.35;
}

.api-option-button {
  flex: 0 0 auto;
  min-width: 66px;
  min-height: 32px;
  padding: 0 13px;
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  border-radius: 7px;
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
  font-size: 13px;
  cursor: pointer;
}

.api-option-button.is-active {
  border-color: color-mix(in srgb, var(--morandi-accent, #4f7658) 58%, transparent);
  background: var(--morandi-accent, #4f7658);
  color: #fffdf8;
}

.api-option-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--morandi-accent, #4f7658) 38%, transparent);
  outline-offset: 2px;
}

.api-field input,
.api-field select {
  width: 100%;
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 18%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 84%, transparent);
  color: var(--morandi-text);
  padding: 0 11px;
  font-size: 14px;
}

.api-field input:disabled,
.api-field select:disabled {
  color: var(--morandi-text-light);
  background: color-mix(in srgb, var(--morandi-soft-bg) 80%, transparent);
}

.api-field input:focus,
.api-field select:focus {
  outline: none;
  border-color: rgba(80, 121, 88, 0.46);
}

.api-secret-input {
  position: relative;
  display: block;
}

.api-secret-input input {
  padding-right: 38px;
}

.api-secret-input > span {
  position: absolute;
  right: 13px;
  top: 50%;
  color: var(--morandi-text-light);
  transform: translateY(-50%);
}

.api-config-secondary-button,
.api-footer-button {
  min-height: 36px;
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  border-radius: 7px;
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
  padding: 0 16px;
  font-size: 13px;
  cursor: pointer;
}

.api-config-secondary-button:disabled,
.api-footer-button:disabled {
  opacity: 0.46;
  cursor: default;
}

.api-advanced {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 14%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 42%, transparent);
}

.api-advanced summary {
  list-style: none;
  cursor: pointer;
  padding: 10px 12px;
  color: var(--morandi-text);
  font-size: 14px;
}

.api-advanced summary::-webkit-details-marker {
  display: none;
}

.api-advanced summary::after {
  content: "⌄";
  float: right;
  color: var(--morandi-text-light);
}

.api-advanced[open] summary::after {
  transform: rotate(180deg);
}

.api-advanced__body {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 12%, transparent);
  padding: 10px 12px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.agent-review-list {
  display: grid;
  gap: 10px;
}

.agent-review-list--flat {
  align-content: start;
}

.agent-review-card {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 16%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 62%, transparent);
  padding: 14px;
}

.agent-review-card h4 {
  position: relative;
  margin: 0 0 12px;
  padding-left: 14px;
  font-size: 15px;
  line-height: 1.2;
}

.agent-review-card h4::before {
  content: "";
  position: absolute;
  left: 0;
  top: 2px;
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: #4f7658;
}

.agent-usage-card {
  padding: 14px 16px 16px;
}

.agent-params-dialog {
  display: grid;
  gap: 12px;
}

.agent-usage-list {
  display: grid;
  gap: 0;
}

.agent-usage-row {
  display: grid;
  grid-template-columns: minmax(128px, 0.9fr) minmax(150px, 1fr) minmax(220px, 1.55fr) auto auto;
  align-items: end;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 10%, transparent);
}

.agent-usage-row:first-child {
  border-top: 0;
  padding-top: 2px;
}

.agent-usage-row__label {
  display: grid;
  gap: 4px;
  align-self: center;
  min-width: 0;
}

.agent-usage-row__label strong {
  color: var(--morandi-text);
  font-size: 14px;
  line-height: 1.25;
}

.agent-usage-row__label small {
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.3;
}

.agent-model-field {
  position: relative;
}

.agent-model-input-shell {
  position: relative;
  display: block;
}

.agent-model-input-shell input {
  padding-right: 34px;
}

.agent-model-arrow {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.agent-model-arrow:disabled {
  color: var(--morandi-text-light);
  cursor: default;
}

.agent-review-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 22px;
}

.agent-recall-layout {
  display: grid;
  gap: 12px;
}

.agent-recall-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 12%, transparent);
}

.agent-recall-column {
  display: grid;
  gap: 8px;
}

.agent-recall-column > small,
.agent-recall-section small {
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.35;
}

.agent-model-stack {
  display: grid;
  gap: 8px;
}

.agent-model-controls {
  display: grid;
  grid-template-columns: minmax(118px, 140px) minmax(132px, 1fr) 112px;
  align-items: end;
  gap: 8px;
}

.agent-model-controls--fallback {
  grid-template-columns: minmax(118px, 140px) 112px minmax(0, 1fr);
}

.agent-token-field {
  min-width: 0;
}

.agent-rounds-field {
  min-width: 0;
}

.agent-model-load-button {
  width: auto;
  min-height: 38px;
  padding-inline: 10px;
}

.agent-narration-model-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  align-items: end;
  gap: 8px;
}

.agent-narration-model-field .api-field {
  position: relative;
}

.agent-narration-model-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  display: grid;
  max-height: 184px;
  overflow-y: auto;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--morandi-border) 12%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: color-mix(in srgb, var(--morandi-card) 98%, transparent);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  padding: 5px;
}

.agent-narration-model-option {
  min-height: 30px;
  border: none;
  border-radius: var(--langhuan-menu-radius, 0);
  background: transparent;
  color: var(--morandi-text);
  cursor: pointer;
  padding: 0 9px;
  text-align: left;
  font-size: 13px;
}

.agent-narration-model-option:hover,
.agent-narration-model-option:focus {
  outline: none;
  background: var(--morandi-hover);
}

.agent-recall-section {
  display: grid;
  max-width: calc(50% - 8px);
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 12%, transparent);
}

.agent-recall-strategy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.agent-recall-managed-note {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.6;
}

.api-config-form-panel--weather {
  max-width: 680px;
}

.api-config-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 16%, transparent);
  padding: 14px 26px 26px;
}

.api-footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.api-footer-button--danger {
  border-color: color-mix(in srgb, var(--morandi-danger) 50%, transparent);
  color: var(--morandi-danger);
}

.api-footer-button--primary {
  min-width: 118px;
  border-color: var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

@media (max-width: 760px) {
  .api-config-modal__header,
  .api-config-modal__body,
  .api-config-modal__footer {
    padding-left: 18px;
    padding-right: 18px;
  }

  .api-config-tabs {
    margin: 0 18px;
    gap: 22px;
  }

  .api-config-page--presets,
  .agent-review-grid,
  .agent-usage-row,
  .agent-recall-pair,
  .agent-recall-strategy,
  .api-readonly-grid,
  .api-form-inline {
    grid-template-columns: 1fr;
  }

  .agent-model-controls,
  .agent-model-controls--fallback {
    grid-template-columns: 1fr;
  }

  .agent-model-load-button {
    width: 100%;
  }

  .agent-recall-section {
    max-width: none;
  }

  .api-preset-sidebar {
    min-height: 0;
  }

  .api-config-modal__footer,
  .api-footer-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
