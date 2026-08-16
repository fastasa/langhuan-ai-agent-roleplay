<template>
  <PixelDialog title="新建时间轴" width="360px" @close="$emit('close')">
    <label class="pixel-field">
      <span>帧速率</span>
      <div class="timeline-dialog__input-row">
        <input v-model.number="fps" type="number" min="1" max="60" step="1" />
        <span>fps</span>
      </div>
    </label>
    <label class="pixel-field">
      <span>动画总时长</span>
      <div class="timeline-dialog__input-row">
        <input v-model.number="durationSeconds" type="number" :min="1 / safeFps" max="3600" :step="1 / safeFps" />
        <span>秒</span>
      </div>
    </label>
    <div class="timeline-dialog__summary">{{ totalFrames }} 帧 · 每帧 {{ frameDurationLabel }} ms</div>
    <template #footer>
      <button type="button" @click="$emit('close')">取消</button>
      <button type="button" class="pixel-dialog__primary" :disabled="!valid" @click="confirm">创建</button>
    </template>
  </PixelDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PixelDialog from './PixelDialog.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', payload: { fps: number; totalFrames: number }): void
}>()

const fps = ref(10)
const durationSeconds = ref(2)
const safeFps = computed(() => Number.isInteger(fps.value) && fps.value > 0 ? fps.value : 1)
const totalFrames = computed(() => Math.max(1, Math.round(Number(durationSeconds.value) * safeFps.value)))
const valid = computed(() => Number.isInteger(fps.value) && fps.value >= 1 && fps.value <= 60 && Number.isFinite(durationSeconds.value) && durationSeconds.value > 0 && totalFrames.value <= 36000)
const frameDurationLabel = computed(() => (1000 / safeFps.value).toFixed(safeFps.value === 10 ? 0 : 2))

function confirm() {
  if (!valid.value) return
  emit('confirm', { fps: fps.value, totalFrames: totalFrames.value })
}
</script>

<style scoped>
.pixel-field { display: flex; flex-direction: column; gap: 5px; color: var(--ps-text-secondary); font-size: 12px; }
.timeline-dialog__input-row { display: flex; align-items: center; gap: 8px; }
.timeline-dialog__input-row input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--ps-border-strong); border-radius: 3px; background: var(--ps-bg-control); color: var(--ps-text); }
.timeline-dialog__input-row span { width: 28px; }
.timeline-dialog__summary { padding-top: 2px; color: var(--ps-text-secondary); font-size: 11px; }
</style>
