<template>
  <PixelDialog title="导出 PNG" width="340px" @close="$emit('close')">
    <label v-if="hasTimeline || publishTargets.length" class="pixel-field">
      <span>导出范围</span>
      <select v-model="mode">
        <option value="current">当前画帧</option>
        <option v-if="hasTimeline" value="animation">时间轴 PNG 序列</option>
        <option v-if="publishTargets.length" value="publish">发布当前画帧</option>
      </select>
    </label>
    <label v-if="mode === 'publish'" class="pixel-field">
      <span>{{ publishTargetLabel }}</span>
      <select v-model="targetId">
        <option value="" disabled>请选择…</option>
        <option v-for="target in publishTargets" :key="target.id" :value="target.id">{{ target.label }}</option>
      </select>
    </label>
    <label class="pixel-field">
      <span>放大倍数</span>
      <select v-model.number="scale">
        <option :value="1">1x</option>
        <option :value="4">4x</option>
        <option :value="8">8x</option>
      </select>
    </label>
    <div class="export-dialog__hint">导出尺寸：{{ pixelSize.width }} × {{ pixelSize.height }}<template v-if="mode === 'animation'"> · {{ totalTimelineFrames }} 张</template></div>
    <div v-if="error" class="export-dialog__error">{{ error }}</div>
    <template #footer>
      <button type="button" @click="$emit('close')">取消</button>
      <button type="button" class="pixel-dialog__primary" :disabled="busy || (mode === 'publish' && !targetId)" @click="$emit('confirm', { scale, mode, targetId })">{{ busy ? '处理中…' : mode === 'publish' ? publishActionLabel : '导出' }}</button>
    </template>
  </PixelDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { computeExportPixelSize } from './pixelUiUtils'
import PixelDialog from './PixelDialog.vue'

const props = withDefaults(defineProps<{
  docWidth: number
  docHeight: number
  hasTimeline?: boolean
  totalTimelineFrames?: number
  publishTargets?: Array<{ id: string; label: string }>
  publishTargetLabel?: string
  publishActionLabel?: string
  busy?: boolean
  error?: string
}>(), { publishTargets: () => [], publishTargetLabel: '发布位置', publishActionLabel: '发布快照', error: '' })
defineEmits<{ (e: 'close'): void; (e: 'confirm', payload: { scale: number; mode: 'current' | 'animation' | 'publish'; targetId?: string }): void }>()

const scale = ref(4)
const mode = ref<'current' | 'animation' | 'publish'>('current')
const targetId = ref('')
const pixelSize = computed(() => computeExportPixelSize(props.docWidth, props.docHeight, scale.value))
</script>

<style scoped>
.pixel-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.export-dialog__hint {
  font-size: 12px;
  color: var(--ps-text-secondary);
}
.export-dialog__error { color: #9b5e50; font-size: 12px; }
</style>
