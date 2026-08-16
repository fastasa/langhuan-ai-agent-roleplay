<template>
  <section class="agent-model-picker" role="dialog" :aria-label="t('workspaceAgent.modelPickerTitle')">
    <header class="agent-model-picker__header">
      <strong>{{ t('workspaceAgent.modelPickerTitle') }}</strong>
      <span>{{ t('workspaceAgent.modelPickerKeyboardHint') }}</span>
    </header>

    <div class="agent-model-picker__models" role="listbox" :aria-label="t('workspaceAgent.modelPickerModelLabel')">
      <button
        v-for="slot in slots"
        :key="slot.id"
        type="button"
        class="agent-model-picker__model"
        :class="{ 'is-active': modelValue.slotId === slot.id }"
        role="option"
        :aria-selected="modelValue.slotId === slot.id"
        @click="selectSlot(slot.id)"
      >
        <span class="agent-model-picker__model-name">{{ t(slot.labelKey) }}</span>
        <span class="agent-model-picker__model-id">{{ configuredModel(slot.id) || t('workspaceAgent.modelPickerFollowPreset') }}</span>
      </button>
    </div>

    <div class="agent-model-picker__effort">
      <span class="agent-model-picker__effort-label">{{ t('workspaceAgent.modelPickerEffortLabel') }}</span>
      <div class="agent-model-picker__effort-options">
        <button
          v-for="option in currentEffortOptions"
          :key="option.value || 'default'"
          type="button"
          :class="{ 'is-active': modelValue.effort === option.value }"
          @click="selectEffort(option.value)"
        >{{ option.label }}</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModelUsageSlotId } from '../../types'
import {
  AGENT_CONVERSATION_MODEL_SLOTS,
  type AgentConversationModelSelection,
  type AgentConversationModelSlotId
} from '../../app/agentConversationModelSelection'
import { getModelUsageConfig } from '../../utils/modelUsageConfig'
import {
  getModelDefaultReasoningEffort,
  getModelReasoningEffortOptions,
  isSubscriptionBridgeProvider,
  type AiModelCatalogItem
} from '../../utils/subscriptionBridgeParameters'
import { normalizeAiProviderType } from '../../../shared/aiProviders'
import { API } from '../../config/api'
import { useSettingStore } from '../../stores/settingStore'

const props = defineProps<{
  modelValue: AgentConversationModelSelection
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: AgentConversationModelSelection): void
  (event: 'close'): void
}>()

const { t } = useI18n()
const settingStore = useSettingStore()
const catalogs = ref<Partial<Record<AgentConversationModelSlotId, AiModelCatalogItem[]>>>({})
const loadingSlots = new Set<AgentConversationModelSlotId>()

const slots = AGENT_CONVERSATION_MODEL_SLOTS.map((id) => ({
  id,
  labelKey: `workspaceAgent.modelSlot.${id}`
}))

function agentConfig() {
  return settingStore.getBrainAgentConfig?.() || null
}

function usageConfig(slotId: ModelUsageSlotId) {
  return getModelUsageConfig(agentConfig(), slotId)
}

function configuredModel(slotId: AgentConversationModelSlotId): string {
  return String(usageConfig(slotId).model || '').trim()
}

function effectivePreset(slotId: AgentConversationModelSlotId) {
  const presetName = String(usageConfig(slotId).presetName || settingStore.defaultPreset?.name || '').trim()
  return settingStore.apiPresets.find((preset) => String(preset.name || '').trim() === presetName)
    || settingStore.defaultPreset
    || null
}

function providerType(slotId: AgentConversationModelSlotId) {
  const preset = effectivePreset(slotId) as Record<string, unknown> | null
  return normalizeAiProviderType(preset?.providerType ?? preset?.provider_type)
}

async function ensureCatalog(slotId: AgentConversationModelSlotId) {
  const provider = providerType(slotId)
  if (!isSubscriptionBridgeProvider(provider) || provider === 'claude-code') return
  if (catalogs.value[slotId] || loadingSlots.has(slotId)) return
  const presetName = String(effectivePreset(slotId)?.name || '').trim()
  if (!presetName) return
  loadingSlots.add(slotId)
  try {
    const response = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName })
    })
    const payload = await response.json() as { data?: AiModelCatalogItem[] }
    catalogs.value = {
      ...catalogs.value,
      [slotId]: response.ok && Array.isArray(payload.data) ? payload.data : []
    }
  } catch {
    catalogs.value = { ...catalogs.value, [slotId]: [] }
  } finally {
    loadingSlots.delete(slotId)
  }
}

const currentEffortOptions = computed(() => {
  const slotId = props.modelValue.slotId
  const model = configuredModel(slotId)
  const catalog = catalogs.value[slotId] || []
  const defaultEffort = getModelDefaultReasoningEffort(model, catalog)
  const defaultLabel = defaultEffort
    ? t('workspaceAgent.modelPickerDefaultEffortWithValue', { effort: defaultEffort })
    : t('workspaceAgent.modelPickerDefaultEffort')
  return [
    { value: '', label: defaultLabel },
    ...getModelReasoningEffortOptions(providerType(slotId), model, catalog)
      .map((option) => ({ value: option.reasoningEffort, label: option.reasoningEffort }))
  ]
})

function selectSlot(slotId: AgentConversationModelSlotId) {
  emit('update:modelValue', { slotId, effort: '' })
  void ensureCatalog(slotId)
}

function selectEffort(effort: string) {
  emit('update:modelValue', { ...props.modelValue, effort })
}

function moveSlot(delta: number) {
  const currentIndex = AGENT_CONVERSATION_MODEL_SLOTS.indexOf(props.modelValue.slotId)
  const nextIndex = (currentIndex + delta + AGENT_CONVERSATION_MODEL_SLOTS.length)
    % AGENT_CONVERSATION_MODEL_SLOTS.length
  selectSlot(AGENT_CONVERSATION_MODEL_SLOTS[nextIndex])
}

function moveEffort(delta: number) {
  const options = currentEffortOptions.value
  if (!options.length) return
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === props.modelValue.effort))
  const nextIndex = (currentIndex + delta + options.length) % options.length
  selectEffort(options[nextIndex].value)
}

function handleKeydown(event: KeyboardEvent): boolean {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveSlot(event.key === 'ArrowUp' ? -1 : 1)
    return true
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    moveEffort(event.key === 'ArrowLeft' ? -1 : 1)
    return true
  }
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return true
  }
  return false
}

watch(() => props.modelValue.slotId, (slotId) => {
  void ensureCatalog(slotId)
})

onMounted(() => {
  void ensureCatalog(props.modelValue.slotId)
})

defineExpose({ handleKeydown })
</script>

<style scoped>
.agent-model-picker {
  position: absolute;
  z-index: 18;
  left: 8px;
  right: 8px;
  bottom: calc(100% + 6px);
  padding: 9px;
  border: 1px solid var(--morandi-border);
  border-radius: 9px;
  background: var(--morandi-card);
  box-shadow: 0 8px 22px rgb(45 41 32 / 13%);
  color: var(--morandi-text);
}
.agent-model-picker__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}
.agent-model-picker__header strong { font-size: 12.5px; font-weight: 650; }
.agent-model-picker__header span { font-size: 10.5px; color: var(--morandi-text-light); }
.agent-model-picker__models {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border: 1px solid var(--morandi-border);
  border-radius: 7px;
  overflow: hidden;
}
.agent-model-picker__model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 7px 6px;
  border: 0;
  border-bottom: 1px solid var(--morandi-border);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.agent-model-picker__model:last-child { border-bottom: 0; }
.agent-model-picker__model.is-active { background: var(--morandi-soft-bg); color: var(--morandi-accent-dark, var(--morandi-accent)); }
.agent-model-picker__model-name,
.agent-model-picker__model-id { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-model-picker__model-name { flex: none; font-size: 12px; font-weight: 650; }
.agent-model-picker__model-id { min-width: 0; font-size: 10px; color: var(--morandi-text-light); }
.agent-model-picker__effort {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.agent-model-picker__effort-label { flex: none; font-size: 11px; color: var(--morandi-text-light); }
.agent-model-picker__effort-options { display: flex; min-width: 0; gap: 3px; overflow-x: auto; }
.agent-model-picker__effort-options button {
  flex: none;
  padding: 3px 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}
.agent-model-picker__effort-options button.is-active {
  border-color: var(--morandi-border);
  background: var(--morandi-soft-bg);
  color: var(--morandi-text);
}
</style>
