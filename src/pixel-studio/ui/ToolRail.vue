<template>
  <div class="tool-rail">
    <button
      v-for="item in TOOLS"
      :key="item.key"
      type="button"
      class="tool-rail__btn"
      :class="{ 'tool-rail__btn--active': tool === item.key }"
      :title="`${item.label}（${chordLabel(item.actionId)}）`"
      @click="$emit('update:tool', item.key)"
    >
      <PixelIcon class="tool-rail__icon" :name="item.icon" />
      <span class="tool-rail__badge">{{ chordLabel(item.actionId) }}</span>
    </button>

    <div class="tool-rail__spacer" />

    <div class="tool-rail__swatch-block">
      <span class="tool-rail__swatch" :class="{ 'tool-rail__swatch--transparent': currentHex === null }" :style="swatchStyle" />
      <span class="tool-rail__swatch-label">{{ currentColor === TRANSPARENT_CODE ? '--' : currentColor ?? '新色' }} · X 换</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PixelCode, PixelPalette } from '../core'
import { TRANSPARENT_CODE } from '../core'
import { type KeymapState, chordToLabel, getEffectiveChord } from './keymap'
import type { PixelActionId } from './keymap'
import type { PixelToolKind } from './uiTypes'
import type { PixelIconName } from './icons'
import PixelIcon from './PixelIcon.vue'

const props = defineProps<{
  tool: PixelToolKind
  hasSelection: boolean
  currentColor: PixelCode | null
  currentHex: string | null
  palette: PixelPalette
  keymap: KeymapState
}>()

defineEmits<{
  (e: 'update:tool', tool: PixelToolKind): void
}>()

const TOOLS: { key: PixelToolKind; label: string; actionId: PixelActionId; icon: PixelIconName }[] = [
  { key: 'select', label: '选择', actionId: 'tool.select', icon: 'mouse-pointer-2' },
  { key: 'marquee', label: '矩形选区', actionId: 'tool.marquee', icon: 'square-dashed' },
  { key: 'lasso', label: '套索', actionId: 'tool.lasso', icon: 'lasso-select' },
  { key: 'brush', label: '笔刷', actionId: 'tool.brush', icon: 'pencil' },
  { key: 'eraser', label: '橡皮', actionId: 'tool.eraser', icon: 'eraser' },
  { key: 'bucket', label: '油漆桶', actionId: 'tool.bucket', icon: 'paint-bucket' },
  { key: 'line', label: '直线', actionId: 'tool.line', icon: 'minus' },
  { key: 'rect', label: '矩形', actionId: 'tool.rect', icon: 'square' },
  { key: 'ellipse', label: '椭圆', actionId: 'tool.ellipse', icon: 'circle' },
  { key: 'eyedropper', label: '取色器', actionId: 'tool.eyedropper', icon: 'pipette' },
  { key: 'zoom', label: '放大镜', actionId: 'tool.zoom', icon: 'search' }
]

function chordLabel(actionId: PixelActionId): string {
  return chordToLabel(getEffectiveChord(props.keymap, actionId))
}

const swatchStyle = computed(() => {
  return props.currentHex ? { background: props.currentHex } : {}
})
</script>

<style scoped>
.tool-rail {
  /* 界面 90% 密度化：chrome 统一缩放，联动说明见 MenuBar.vue .menu-bar */
  zoom: 0.9;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  height: 100%;
  background: var(--ps-bg-panel);
}
.tool-rail__btn {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ps-text-secondary);
  cursor: pointer;
}
.tool-rail__btn:hover {
  background: var(--ps-bg-control);
  color: var(--ps-text);
}
.tool-rail__btn--active {
  background: var(--ps-accent-active-bg);
  border-color: var(--ps-accent-active-border);
  color: var(--ps-accent-active-text);
}
.tool-rail__icon {
  width: 17px;
  height: 17px;
}
.tool-rail__badge {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 8px;
  line-height: 1;
  opacity: 0.55;
  pointer-events: none;
}
.tool-rail__spacer {
  flex: 1;
}
.tool-rail__swatch-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-bottom: 4px;
}
.tool-rail__swatch {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 2px solid var(--ps-border-strong);
  background: var(--ps-checker-a);
}
.tool-rail__swatch--transparent {
  background-image: linear-gradient(45deg, var(--ps-checker-b) 25%, transparent 25%), linear-gradient(-45deg, var(--ps-checker-b) 25%, transparent 25%);
  background-size: 8px 8px;
}
.tool-rail__swatch-label {
  font-size: 9px;
  color: var(--ps-text-weak);
  font-family: 'Consolas', 'SFMono-Regular', monospace;
}
</style>
