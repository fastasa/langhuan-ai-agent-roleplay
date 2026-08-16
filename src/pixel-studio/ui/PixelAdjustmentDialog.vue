<template>
  <PixelDialog
    :title="title"
    :width="width"
    modeless
    draggable
    :close-on-backdrop="false"
    @close="emit('close')"
  >
    <div class="pixel-adjustment__scope">范围：{{ scopeLabel }}</div>
    <slot />
    <div v-if="error" class="pixel-adjustment__error">{{ error }}</div>

    <template #footer>
      <button type="button" class="pixel-adjustment__secondary" @click="emit('reset')">重置</button>
      <label class="pixel-adjustment__preview">
        <input :checked="preview" type="checkbox" @change="emit('update:preview', ($event.target as HTMLInputElement).checked)" />
        <span>预览</span>
      </label>
      <slot name="footer-summary" />
      <span class="pixel-adjustment__spacer" />
      <button type="button" class="pixel-dialog__primary" :disabled="applyDisabled || !!error || busy" @click="emit('apply')">
        {{ busy ? '处理中…' : '应用' }}
      </button>
    </template>
  </PixelDialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import PixelDialog from './PixelDialog.vue'

withDefaults(defineProps<{
  title: string
  scopeLabel: string
  width?: string
  preview: boolean
  applyDisabled?: boolean
  busy?: boolean
  error?: string | null
}>(), { width: '460px', applyDisabled: false, busy: false, error: null })

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:preview', value: boolean): void
  (e: 'reset'): void
  (e: 'apply'): void
}>()

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown, true))
</script>

<style scoped>
.pixel-adjustment__scope {
  color: var(--ps-muted);
  font-size: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ps-border);
}
.pixel-adjustment__error { color: var(--ps-danger, #a8493d); font-size: 12px; }
.pixel-adjustment__secondary {
  border: 1px solid var(--ps-border);
  border-radius: 4px;
  background: var(--ps-bg-panel);
  color: var(--ps-text);
  padding: 4px 12px;
}
.pixel-adjustment__preview { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.pixel-adjustment__preview input { accent-color: var(--ps-accent-bg); }
.pixel-adjustment__spacer { flex: 1; }
</style>
