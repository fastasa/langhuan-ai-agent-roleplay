<template>
  <div class="context-bar">
    <div class="context-bar__left">
      <span v-if="tool === 'brush' || tool === 'eraser'" class="context-bar__badge">{{ tool === 'brush' ? '笔刷' : '橡皮' }} {{ brushSize }} px</span>
      <span v-if="tool === 'brush' || tool === 'eraser'" class="context-bar__hint">
        尺寸 1~32 ·
        <button type="button" class="context-bar__step" :title="`笔刷尺寸减小（${sizeDownLabel}）`" :disabled="brushSize <= 1" @click="$emit('update:brushSize', clamp(brushSize - 1))">[</button>
        减
        <button type="button" class="context-bar__step" :title="`笔刷尺寸增大（${sizeUpLabel}）`" :disabled="brushSize >= 32" @click="$emit('update:brushSize', clamp(brushSize + 1))">]</button>
        增
      </span>

      <label v-if="tool === 'rect' || tool === 'ellipse'" class="context-bar__toggle">
        <input type="checkbox" :checked="shapeFilled" @change="$emit('update:shapeFilled', ($event.target as HTMLInputElement).checked)" />
        <span>实心</span>
      </label>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { type KeymapState, chordToLabel, getEffectiveChord } from './keymap'
import type { PixelToolKind } from './uiTypes'

const props = defineProps<{
  tool: PixelToolKind
  brushSize: number
  shapeFilled: boolean
  keymap: KeymapState
}>()

defineEmits<{
  (e: 'update:brushSize', size: number): void
  (e: 'update:shapeFilled', filled: boolean): void
}>()

function clamp(n: number): number {
  return Math.max(1, Math.min(32, Math.round(n)))
}

const sizeDownLabel = computed(() => chordToLabel(getEffectiveChord(props.keymap, 'brush.sizeDown')))
const sizeUpLabel = computed(() => chordToLabel(getEffectiveChord(props.keymap, 'brush.sizeUp')))
</script>

<style scoped>
.context-bar {
  flex: none;
  display: flex;
  align-items: center;
  min-width: 0;
  margin-right: 2px;
  padding-right: 8px;
  border-right: 1px solid var(--ps-border-strong);
  font-size: 12px;
  color: var(--ps-text-secondary);
}
.context-bar__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.context-bar__badge {
  font-weight: 600;
  color: var(--ps-text);
  background: var(--ps-bg-control);
  border-radius: 5px;
  padding: 2px 8px;
}
.context-bar__hint {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}
.context-bar__step {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--ps-border-strong);
  background: var(--ps-bg-control);
  color: var(--ps-text);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  font-family: 'Consolas', 'SFMono-Regular', monospace;
}
.context-bar__step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.context-bar__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
