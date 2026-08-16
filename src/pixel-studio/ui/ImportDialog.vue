<template>
  <PixelDialog title="导入图片" @close="onClose">
    <input type="file" accept="image/*" @change="onFileChange" />

    <template v-if="sourceImage">
      <label class="pixel-field">
        <span>目标分辨率（长边）</span>
        <select v-model.number="longEdge">
          <option v-for="p in presets" :key="p" :value="p">{{ p }}</option>
          <option :value="-1">自定义</option>
        </select>
        <input v-if="longEdge === -1" v-model.number="customLongEdge" type="number" min="1" max="512" />
      </label>
      <div class="pixel-import__size-hint">目标尺寸：{{ targetSize.width }} × {{ targetSize.height }}</div>

      <label class="pixel-field">
        <span>最大颜色数：{{ maxColors }}</span>
        <input v-model.number="maxColors" type="range" min="2" max="64" />
      </label>

      <div class="pixel-import__preview">
        <canvas ref="previewCanvasEl" class="pixel-import__preview-canvas" :width="targetSize.width" :height="targetSize.height" />
      </div>
    </template>

    <template #footer>
      <button type="button" @click="onClose">取消</button>
      <button type="button" class="pixel-dialog__primary" :disabled="!sourceImage" @click="onConfirm">确认导入（替换当前文档）</button>
    </template>
  </PixelDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PixelPalette } from '../core'
import { downsampleImage, quantizeCells } from '../core'
import type { DownsampleResult } from '../core'
import { computeImportTargetSize, filenameToDocName } from './pixelUiUtils'
import { drawGridToCanvas } from './pixelRender'
import PixelDialog from './PixelDialog.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', payload: { name: string; width: number; height: number; palette: PixelPalette; grid: string[] }): void
}>()

const presets = [32, 48, 64, 96, 128]
const longEdge = ref(64)
const customLongEdge = ref(64)
const maxColors = ref(24)

const fileName = ref('')
const sourceImage = ref<{ rgba: Uint8ClampedArray; width: number; height: number } | null>(null)
const previewCanvasEl = ref<HTMLCanvasElement | null>(null)

const effectiveLongEdge = computed(() => (longEdge.value === -1 ? Math.max(1, Math.min(512, customLongEdge.value || 1)) : longEdge.value))
const targetSize = computed(() => {
  if (!sourceImage.value) return { width: 64, height: 64 }
  return computeImportTargetSize(sourceImage.value.width, sourceImage.value.height, effectiveLongEdge.value)
})

let lastQuantized: { palette: PixelPalette; grid: string[] } | null = null

// 选图代际计数：每次选择新文件自增，FileReader/Image 的异步 onload 回调里捕获的代际若已不是最新，
// 说明用户在读取完成前又选了另一张图，直接丢弃这次结果，避免慢的一次异步覆盖快的一次（竞态）
let selectionGen = 0

// 降采样结果缓存：只有 (源图, 目标尺寸) 变化才重跑 downsampleImage；单独拖动"最大颜色数"滑条只重跑 quantizeCells。
let cachedDownsample: { source: NonNullable<typeof sourceImage.value>; width: number; height: number; result: DownsampleResult } | null = null

function getDownsampleResult(): DownsampleResult | null {
  if (!sourceImage.value) return null
  const { width, height } = targetSize.value
  if (
    cachedDownsample &&
    cachedDownsample.source === sourceImage.value &&
    cachedDownsample.width === width &&
    cachedDownsample.height === height
  ) {
    return cachedDownsample.result
  }
  const result = downsampleImage({
    rgba: sourceImage.value.rgba,
    srcWidth: sourceImage.value.width,
    srcHeight: sourceImage.value.height,
    targetWidth: width,
    targetHeight: height
  })
  cachedDownsample = { source: sourceImage.value, width, height, result }
  return result
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  const gen = ++selectionGen
  const reader = new FileReader()
  reader.onload = () => {
    if (gen !== selectionGen) return
    const img = new Image()
    img.onload = () => {
      if (gen !== selectionGen) return
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      sourceImage.value = { rgba: data.data, width: canvas.width, height: canvas.height }
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
}

function renderPreview() {
  const sample = getDownsampleResult()
  if (!sample) return
  const result = quantizeCells(sample, maxColors.value)
  lastQuantized = result
  const canvas = previewCanvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = targetSize.value
  ctx.clearRect(0, 0, width, height)
  drawGridToCanvas(ctx, { width, height, grid: result.grid, palette: result.palette }, 1)
}

let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [sourceImage, targetSize, maxColors],
  () => {
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer)
    renderDebounceTimer = setTimeout(() => {
      renderDebounceTimer = null
      nextTick(renderPreview)
    }, 150)
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (renderDebounceTimer) clearTimeout(renderDebounceTimer)
})

function onClose() {
  emit('close')
}

function onConfirm() {
  if (!sourceImage.value || !lastQuantized) return
  emit('confirm', {
    name: filenameToDocName(fileName.value),
    width: targetSize.value.width,
    height: targetSize.value.height,
    palette: lastQuantized.palette,
    grid: lastQuantized.grid
  })
}
</script>

<style scoped>
.pixel-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.pixel-import__size-hint {
  font-size: 12px;
  opacity: 0.7;
}
.pixel-import__preview {
  display: flex;
  justify-content: center;
  padding: 8px;
  background-image: linear-gradient(45deg, var(--ps-checker-b, #ccc) 25%, transparent 25%), linear-gradient(-45deg, var(--ps-checker-b, #ccc) 25%, transparent 25%);
  background-size: 8px 8px;
  background-color: var(--ps-checker-a, transparent);
}
.pixel-import__preview-canvas {
  image-rendering: pixelated;
  width: 200px;
  height: auto;
}
</style>
