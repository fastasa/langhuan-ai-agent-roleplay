<template>
  <div class="project-library">
    <div class="project-library__header">
      <span class="project-library__title">像素文档库</span>
      <span class="project-library__count">{{ docs.length }} 份文档</span>
    </div>

    <div class="project-library__grid">
      <button type="button" class="project-library__card project-library__card--new" @click="$emit('new')">
        <span class="project-library__new-plus">+</span>
        <span>新建文档</span>
      </button>

      <div v-for="item in docs" :key="item.id" class="project-library__card" @click="$emit('open', item.id)">
        <div class="project-library__thumb">
          <canvas :ref="(el) => setCanvasRef(item.id, el as HTMLCanvasElement | null)" class="project-library__thumb-canvas" />
          <span v-if="thumbStatus[item.id] !== 'done'" class="project-library__thumb-placeholder">…</span>
        </div>
        <div class="project-library__meta">
          <span class="project-library__name" :title="item.name">{{ item.name }}</span>
          <span class="project-library__dim">{{ item.width }}×{{ item.height }}</span>
          <span class="project-library__time">{{ formatTime(item.updatedAt) }}</span>
        </div>
        <button type="button" class="project-library__delete" title="删除" @click.stop="onDelete(item.id)">删除</button>
      </div>
    </div>

    <div v-if="loading" class="project-library__empty">加载中…</div>
    <div v-else-if="docs.length === 0" class="project-library__empty">还没有保存过文档，点击左上「新建文档」开始创作</div>
  </div>
</template>

<script lang="ts">
// 模块级缩略图缓存：跨组件实例存活（每次进出项目库都会重新挂载 ProjectLibrary），键=文档 id，
// 命中且 updatedAt 未变时直接复用离屏画布内容，不再重发 GET /docs/:id。
const thumbnailCache = new Map<string, { updatedAt: string; canvas: HTMLCanvasElement }>()
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, watch } from 'vue'
import type { PixelDocument } from '../core'
import { getFrame } from '../core'
import { drawGridToCanvas } from './pixelRender'
import { type PixelDocSummary, getPixelDoc } from './pixelApi'

const props = defineProps<{
  docs: PixelDocSummary[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'new'): void
  (e: 'delete', id: string): void
}>()

// 缩略图目标最大边长（css px），实际画布按文档宽高比整数放大后再由 CSS object-fit:contain 收进方格
const THUMB_MAX = 96
// 并发限制 4 个一批，避免文档多时一次性打爆 GET /docs/:id
const THUMB_CONCURRENCY = 4

const thumbStatus = reactive<Record<string, 'loading' | 'done' | 'error'>>({})
const canvasEls: Record<string, HTMLCanvasElement | null> = {}

// 组件卸载（切回编辑器/关闭页面）时中止所有在途缩略图请求，避免请求落地时组件早已销毁
const abortController = new AbortController()
onBeforeUnmount(() => abortController.abort())

function setCanvasRef(id: string, el: HTMLCanvasElement | null) {
  canvasEls[id] = el
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

/** 把文档画进指定画布；返回是否成功画出（jsdom 等无 2D 上下文环境下返回 false） */
function renderDocToCanvas(canvas: HTMLCanvasElement, doc: PixelDocument): boolean {
  const scale = Math.max(1, Math.floor(Math.min(THUMB_MAX / doc.width, THUMB_MAX / doc.height)))
  canvas.width = doc.width * scale
  canvas.height = doc.height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const frame = getFrame(doc)
  for (const layer of frame.layers) {
    if (!layer.visible) continue
    drawGridToCanvas(ctx, { width: doc.width, height: doc.height, grid: layer.grid, palette: layer.palette }, scale)
  }
  return true
}

function drawThumbnail(id: string, doc: PixelDocument) {
  const canvas = canvasEls[id]
  if (!canvas) return
  renderDocToCanvas(canvas, doc)
}

/** GET 成功后：既画到可见画布，也顺带存一份离屏画布进模块级缓存，供 updatedAt 不变时的后续挂载直接复用 */
function cacheThumbnail(id: string, updatedAt: string, doc: PixelDocument) {
  const offscreen = document.createElement('canvas')
  if (renderDocToCanvas(offscreen, doc)) {
    thumbnailCache.set(id, { updatedAt, canvas: offscreen })
  }
}

function drawFromCache(id: string, cached: { canvas: HTMLCanvasElement }) {
  const canvas = canvasEls[id]
  if (!canvas) return
  canvas.width = cached.canvas.width
  canvas.height = cached.canvas.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(cached.canvas, 0, 0)
}

async function loadThumbnails() {
  const targets = props.docs.filter((d) => thumbStatus[d.id] !== 'done' && thumbStatus[d.id] !== 'loading')
  if (targets.length === 0) return

  const toFetch: PixelDocSummary[] = []
  for (const d of targets) {
    const cached = thumbnailCache.get(d.id)
    if (cached && cached.updatedAt === d.updatedAt) {
      thumbStatus[d.id] = 'loading'
      // 缓存命中：只等一次 nextTick 让画布 ref 挂载好，整个过程同步绘制，不发网络请求
      nextTick(() => {
        drawFromCache(d.id, cached)
        thumbStatus[d.id] = 'done'
      })
    } else {
      toFetch.push(d)
    }
  }
  if (toFetch.length === 0) return

  let cursor = 0
  async function worker() {
    while (cursor < toFetch.length) {
      const item = toFetch[cursor++]
      thumbStatus[item.id] = 'loading'
      try {
        const res = await getPixelDoc(item.id, abortController.signal)
        await nextTick()
        drawThumbnail(item.id, res.doc)
        cacheThumbnail(item.id, item.updatedAt, res.doc)
        thumbStatus[item.id] = 'done'
      } catch (e) {
        // 组件卸载触发的中止不算错误态，静默即可；真正失败才置为 error 展示占位
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          thumbStatus[item.id] = 'error'
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(THUMB_CONCURRENCY, toFetch.length) }, worker))
}

// 列表变化（首次进入 / 删除后刷新）就补齐尚未加载的缩略图；已 done 的条目直接跳过，不重复请求
watch(
  () => props.docs,
  () => nextTick(loadThumbnails),
  { immediate: true }
)

function onDelete(id: string) {
  if (window.confirm('确定删除这份文档？此操作不可恢复。')) {
    emit('delete', id)
  }
}
</script>

<style scoped>
.project-library {
  /* 界面 90% 密度化：chrome 统一缩放，联动说明见 MenuBar.vue .menu-bar */
  zoom: 0.9;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ps-bg-app);
  color: var(--ps-text);
}
.project-library__header {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ps-border);
  background: var(--ps-bg-panel);
}
.project-library__title {
  font-size: 16px;
  font-weight: 700;
}
.project-library__count {
  font-size: 12px;
  color: var(--ps-text-weak);
}
.project-library__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
  padding: 20px;
  align-content: start;
}
.project-library__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--ps-border);
  border-radius: 10px;
  background: var(--ps-bg-panel);
  cursor: pointer;
  text-align: left;
}
.project-library__card:hover {
  border-color: var(--ps-border-strong);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.project-library__card--new {
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 150px;
  color: var(--ps-text-secondary);
  border-style: dashed;
}
.project-library__new-plus {
  font-size: 28px;
  line-height: 1;
  color: var(--ps-accent-strong-text);
}
.project-library__thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: linear-gradient(45deg, var(--ps-checker-b) 25%, transparent 25%), linear-gradient(-45deg, var(--ps-checker-b) 25%, transparent 25%);
  background-size: 8px 8px;
  background-color: var(--ps-checker-a);
}
.project-library__thumb-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.project-library__thumb-placeholder {
  position: absolute;
  font-size: 11px;
  color: var(--ps-text-weak);
}
.project-library__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.project-library__name {
  font-weight: 600;
  color: var(--ps-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.project-library__dim,
.project-library__time {
  color: var(--ps-text-weak);
  font-size: 11px;
}
.project-library__delete {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.15s;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid var(--ps-danger);
  background: var(--ps-bg-panel);
  color: var(--ps-danger);
  cursor: pointer;
}
.project-library__card:hover .project-library__delete,
.project-library__card:focus-within .project-library__delete {
  opacity: 1;
}
.project-library__empty {
  padding: 40px;
  text-align: center;
  color: var(--ps-text-weak);
  font-size: 13px;
}
</style>
