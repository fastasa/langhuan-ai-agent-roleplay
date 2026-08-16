<template>
  <span class="json-transfer-buttons">
    <button
      type="button"
      :class="['json-transfer-buttons__action', props.buttonClass]"
      :title="props.exportTitle"
      :aria-label="props.exportTitle"
      :disabled="props.exportDisabled"
      @click="emit('export')"
    >
      <svg class="json-transfer-buttons__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v11"/>
        <path d="M8 11l4 4 4-4"/>
        <path d="M5 19h14"/>
      </svg>
    </button>
    <button
      type="button"
      :class="['json-transfer-buttons__action', props.buttonClass]"
      :title="props.importTitle"
      :aria-label="props.importTitle"
      :disabled="props.importDisabled"
      @click="triggerImport"
    >
      <svg class="json-transfer-buttons__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20V9"/>
        <path d="M8 13l4-4 4 4"/>
        <path d="M5 5h14"/>
      </svg>
    </button>
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,application/json"
      class="json-transfer-buttons__input"
      @change="handleImportChange"
    >
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  exportTitle?: string
  importTitle?: string
  buttonClass?: string
  exportDisabled?: boolean
  importDisabled?: boolean
}>(), {
  exportTitle: '导出 JSON',
  importTitle: '导入 JSON',
  buttonClass: '',
  exportDisabled: false,
  importDisabled: false
})

const emit = defineEmits<{
  (e: 'export'): void
  (e: 'import', payload: unknown): void
  (e: 'error', message: string): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerImport() {
  fileInputRef.value?.click()
}

function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}'))
      emit('import', payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON 解析失败'
      emit('error', message)
    } finally {
      if (input) input.value = ''
    }
  }
  reader.onerror = () => {
    emit('error', '读取文件失败')
    if (input) input.value = ''
  }
  reader.readAsText(file, 'utf-8')
}
</script>

<style scoped>
.json-transfer-buttons {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.json-transfer-buttons__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.json-transfer-buttons__icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.json-transfer-buttons__input {
  display: none;
}
</style>
