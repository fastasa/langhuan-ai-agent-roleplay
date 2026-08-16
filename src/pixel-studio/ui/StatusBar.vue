<template>
  <div class="status-bar">
    <div class="status-bar__left">
      <span v-if="cursor">({{ cursor.x }}, {{ cursor.y }})</span>
      <span v-else>(--, --)</span>
      <span class="status-bar__sep">·</span>
      <span v-if="cursor">{{ cursor.code === TRANSPARENT_CODE ? '透明' : cursor.code }}</span>
      <span v-else>--</span>
      <span v-if="cursor?.hex" class="status-bar__swatch" :style="{ background: cursor.hex }" />
      <span v-if="cursor?.hex">{{ cursor.hex }}</span>
    </div>
    <div class="status-bar__right">
      <span>{{ docWidth }} × {{ docHeight }}</span>
      <span class="status-bar__sep">·</span>
      <span>{{ zoomLabel }}</span>
      <span class="status-bar__sep">·</span>
      <span>帧 1/1 · 时间轴二期预留</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PixelCode } from '../core'
import { TRANSPARENT_CODE } from '../core'

defineProps<{
  cursor: { x: number; y: number; code: PixelCode; hex: string | null } | null
  docWidth: number
  docHeight: number
  zoomLabel: string
}>()
</script>

<style scoped>
.status-bar {
  /* 界面 90% 密度化：chrome 统一缩放，联动说明见 MenuBar.vue .menu-bar */
  zoom: 0.9;
  height: 30px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--ps-bg-panel);
  border-top: 1px solid var(--ps-border);
  font-size: 11px;
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  color: var(--ps-text-secondary);
}
.status-bar__left,
.status-bar__right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-bar__sep {
  opacity: 0.5;
}
.status-bar__swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid var(--ps-border-strong);
  display: inline-block;
}
</style>
