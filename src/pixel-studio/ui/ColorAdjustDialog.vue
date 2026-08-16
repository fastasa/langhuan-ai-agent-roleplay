<template>
  <PixelAdjustmentDialog
    title="色相 / 饱和度 / 明度"
    width="430px"
    :scope-label="hasSelection ? `当前选区 · ${selectedLayerCount} 个图层` : `当前 ${selectedLayerCount} 个图层`"
    :preview="preview"
    :error="error"
    :apply-disabled="isZero"
    @close="emit('close')"
    @update:preview="preview = $event"
    @reset="reset"
    @apply="apply"
  >
    <label v-for="control in controls" :key="control.key" class="pixel-color-adjust__row">
      <span>{{ control.label }}</span>
      <input
        v-model.number="values[control.key]"
        type="range"
        :min="control.min"
        :max="control.max"
        step="1"
      />
      <input
        v-model.number="values[control.key]"
        class="pixel-color-adjust__number"
        type="number"
        :min="control.min"
        :max="control.max"
        step="1"
      />
    </label>

  </PixelAdjustmentDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { HsvAdjustment } from '../core'
import PixelAdjustmentDialog from './PixelAdjustmentDialog.vue'

withDefaults(defineProps<{ hasSelection: boolean; selectedLayerCount?: number; error?: string | null }>(), { selectedLayerCount: 1 })
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'preview', adjustment: HsvAdjustment, enabled: boolean): void
  (e: 'confirm', adjustment: HsvAdjustment): void
}>()

type AdjustmentKey = keyof HsvAdjustment
const controls: Array<{ key: AdjustmentKey; label: string; min: number; max: number }> = [
  { key: 'hue', label: '色相', min: -180, max: 180 },
  { key: 'saturation', label: '饱和度', min: -100, max: 100 },
  { key: 'brightness', label: '明度', min: -100, max: 100 }
]
const values = reactive<HsvAdjustment>({ hue: 0, saturation: 0, brightness: 0 })
const preview = ref(true)
const isZero = computed(() => values.hue === 0 && values.saturation === 0 && values.brightness === 0)

function clamp(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : 0
  return Math.max(min, Math.min(max, Math.round(finite)))
}
function normalizedValues(): HsvAdjustment {
  return {
    hue: clamp(values.hue, -180, 180),
    saturation: clamp(values.saturation, -100, 100),
    brightness: clamp(values.brightness, -100, 100)
  }
}
function reset() {
  values.hue = 0
  values.saturation = 0
  values.brightness = 0
}
function apply() {
  emit('confirm', normalizedValues())
  reset()
}

watch([values, preview], () => emit('preview', normalizedValues(), preview.value), { deep: true, immediate: true })
</script>

<style scoped>
.pixel-color-adjust__row { display: grid; grid-template-columns: 56px minmax(150px,1fr) 62px; gap: 10px; align-items: center; min-height: 34px; font-size: 13px; }
.pixel-color-adjust__row input[type="range"] { width: 100%; accent-color: var(--ps-accent-bg); }
.pixel-color-adjust__number { width: 62px; box-sizing: border-box; border: 1px solid var(--ps-border); border-radius: 4px; background: var(--ps-bg-canvas); color: var(--ps-text); padding: 4px 5px; }
</style>
