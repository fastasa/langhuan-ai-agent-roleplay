<template>
  <div class="pixel-color-picker">
    <div class="pixel-color-picker__body">
      <div
        ref="svEl"
        class="pixel-color-picker__sv"
        :style="svStyle"
        @pointerdown="onSvPointerDown"
        @pointermove="onSvPointerMove"
        @pointerup="onSvPointerUp"
        @pointercancel="onSvPointerUp"
      >
        <span class="pixel-color-picker__sv-thumb" :style="svThumbStyle" />
      </div>
      <div
        ref="hueEl"
        class="pixel-color-picker__hue"
        @pointerdown="onHuePointerDown"
        @pointermove="onHuePointerMove"
        @pointerup="onHuePointerUp"
        @pointercancel="onHuePointerUp"
      >
        <span class="pixel-color-picker__hue-thumb" :style="hueThumbStyle" />
      </div>
    </div>
    <div class="pixel-color-picker__hex-row">
      <span class="pixel-color-picker__preview" :style="{ background: currentHex }" />
      <input v-model="hexDraft" type="text" class="pixel-color-picker__hex-input" maxlength="7" @change="onHexChange" />
    </div>
  </div>
</template>

<script setup lang="ts">
// 经典拾色器：SV 方块 + 色相竖条纯 CSS 渐变 + hex 输入框，pointer 拖动取值。内核圈零依赖组件，
// 不持有调色板真值——只负责产出 hex（pick 事件），落点规则（复用已有短码 / 分配新短码）由 PalettePanel 决定。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { hexToHsv, hsvToHex, isValidHexColor } from './pixelUiUtils'

const props = defineProps<{
  /** 当前绘画 hex。外部色卡和画布吸管取色后必须同步回投到 H/S/V 落点。 */
  initialHex?: string
}>()
const emit = defineEmits<{ (e: 'pick', hex: string): void }>()

const seed = props.initialHex && isValidHexColor(props.initialHex) ? hexToHsv(props.initialHex) : { h: 0, s: 1, v: 1 }
const hue = ref(seed.h)
const sat = ref(seed.s)
const val = ref(seed.v)

const currentHex = computed(() => hsvToHex(hue.value, sat.value, val.value))
const hexDraft = ref(currentHex.value)

watch(() => props.initialHex, (hex) => {
  if (!hex || !isValidHexColor(hex)) return
  const lower = hex.toLowerCase()
  if (lower === currentHex.value.toLowerCase() && lower === hexDraft.value.toLowerCase()) return
  const hsv = hexToHsv(lower)
  hue.value = hsv.h
  sat.value = hsv.s
  val.value = hsv.v
  hexDraft.value = lower
})

const svEl = ref<HTMLDivElement | null>(null)
const hueEl = ref<HTMLDivElement | null>(null)

const svStyle = computed(() => ({
  backgroundColor: `hsl(${hue.value}, 100%, 50%)`,
  backgroundImage: 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))'
}))
const svThumbStyle = computed(() => ({ left: `${sat.value * 100}%`, top: `${(1 - val.value) * 100}%` }))
const hueThumbStyle = computed(() => ({ top: `${(hue.value / 360) * 100}%` }))

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function emitPick() {
  const hex = currentHex.value
  hexDraft.value = hex
  emit('pick', hex)
}

let svDragging = false
function updateSvFromEvent(e: PointerEvent) {
  const rect = svEl.value?.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return
  sat.value = clamp01((e.clientX - rect.left) / rect.width)
  val.value = clamp01(1 - (e.clientY - rect.top) / rect.height)
  emitPick()
}
function onSvPointerDown(e: PointerEvent) {
  svEl.value?.setPointerCapture?.(e.pointerId)
  svDragging = true
  updateSvFromEvent(e)
}
function onSvPointerMove(e: PointerEvent) {
  if (svDragging) updateSvFromEvent(e)
}
function onSvPointerUp(e: PointerEvent) {
  svDragging = false
  svEl.value?.releasePointerCapture?.(e.pointerId)
}

let hueDragging = false
function updateHueFromEvent(e: PointerEvent) {
  const rect = hueEl.value?.getBoundingClientRect()
  if (!rect || rect.height === 0) return
  hue.value = clamp01((e.clientY - rect.top) / rect.height) * 360
  emitPick()
}
function onHuePointerDown(e: PointerEvent) {
  hueEl.value?.setPointerCapture?.(e.pointerId)
  hueDragging = true
  updateHueFromEvent(e)
}
function onHuePointerMove(e: PointerEvent) {
  if (hueDragging) updateHueFromEvent(e)
}
function onHuePointerUp(e: PointerEvent) {
  hueDragging = false
  hueEl.value?.releasePointerCapture?.(e.pointerId)
}

function onHexChange() {
  if (!isValidHexColor(hexDraft.value)) {
    hexDraft.value = currentHex.value // 非法输入回退显示当前色，不静默吞掉也不崩
    return
  }
  const lower = hexDraft.value.toLowerCase()
  const hsv = hexToHsv(lower)
  hue.value = hsv.h
  sat.value = hsv.s
  val.value = hsv.v
  hexDraft.value = lower
  emit('pick', lower)
}

onBeforeUnmount(() => {
  svDragging = false
  hueDragging = false
})
</script>

<style scoped>
.pixel-color-picker {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 112px;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--ps-border);
}
.pixel-color-picker__body {
  display: flex;
  flex: 1;
  min-height: 68px;
  gap: 8px;
}
.pixel-color-picker__sv {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 6px;
  border: 1px solid var(--ps-border-strong);
  cursor: crosshair;
  touch-action: none;
}
.pixel-color-picker__sv-thumb {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.pixel-color-picker__hue {
  position: relative;
  width: 16px;
  flex: none;
  border-radius: 6px;
  border: 1px solid var(--ps-border-strong);
  cursor: pointer;
  touch-action: none;
  background: linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
}
.pixel-color-picker__hue-thumb {
  position: absolute;
  left: -2px;
  right: -2px;
  height: 4px;
  border-radius: 2px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  transform: translateY(-50%);
  pointer-events: none;
}
.pixel-color-picker__hex-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pixel-color-picker__preview {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid var(--ps-border-strong);
  flex: none;
}
.pixel-color-picker__hex-input {
  flex: 1;
  min-width: 0;
  font-family: 'Consolas', 'SFMono-Regular', monospace;
}
</style>
