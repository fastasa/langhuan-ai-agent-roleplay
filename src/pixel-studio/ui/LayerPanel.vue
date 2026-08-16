<template>
  <section class="pixel-layers" aria-label="图层">
    <header class="pixel-layers__head">
      <span>图层<span v-if="selectedLayerIds.length > 1" class="pixel-layers__selected-count"> · {{ selectedLayerIds.length }} 选</span></span>
      <label class="pixel-layers__solo" title="开启后只显示当前图层；切换图层时自动对照">
        <input type="checkbox" :checked="soloMode" @change="$emit('update:solo-mode', ($event.target as HTMLInputElement).checked)" />
        对照
      </label>
    </header>

    <div class="pixel-layers__list">
      <div
        v-for="layer in displayLayers"
        :key="layer.id"
        type="button"
        class="pixel-layer"
        :class="{ 'pixel-layer--active': layer.id === activeLayerId, 'pixel-layer--selected': selectedLayerIds.includes(layer.id) }"
        draggable="true"
        @click="onSelectLayer($event, layer.id)"
        @keydown.enter="$emit('select', layer.id, 'replace')"
        @contextmenu.prevent.stop="openContextMenu($event, layer.id)"
        @dragstart="onDragStart($event, layer.id)"
        @dragover.prevent
        @drop.prevent="onDrop(layer.id)"
      >
        <span
          class="pixel-layer__visibility"
          :title="layer.visible ? '隐藏图层' : '显示图层'"
          role="button"
          tabindex="0"
          @click.stop="$emit('toggle-visible', layer.id)"
          @keydown.enter.stop="$emit('toggle-visible', layer.id)"
        >
          <PixelIcon :name="layer.visible ? 'eye' : 'eye-off'" />
        </span>
        <span class="pixel-layer__thumb" :class="{ 'pixel-layer__thumb--hidden': !layer.visible }">
          <canvas :ref="(el) => setThumbCanvas(layer.id, el)" width="56" height="48" aria-hidden="true" />
        </span>
        <input
          v-if="renamingId === layer.id"
          ref="renameInputEl"
          v-model="renameDraft"
          class="pixel-layer__name-input"
          @click.stop
          @keydown.enter.prevent="commitRename(layer.id)"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename(layer.id)"
        />
        <span v-else class="pixel-layer__name">{{ layer.name }}</span>
      </div>
    </div>

    <div v-if="contextLayerId" class="pixel-layer-menu" :style="contextMenuStyle" @pointerdown.stop @click.stop>
      <button type="button" @click="startRename">重命名</button>
      <button type="button" class="pixel-layer-menu__danger" :disabled="layers.length <= 1" @click="removeFromMenu">删除</button>
    </div>

    <footer class="pixel-layers__actions">
      <button type="button" title="新建图层" @click="$emit('add')"><PixelIcon name="plus" /></button>
      <button type="button" title="删除当前图层" :disabled="layers.length <= 1" @click="$emit('remove')"><PixelIcon name="trash-2" /></button>
      <span class="pixel-layers__hint" title="Ctrl/Command 点选切换单层，Shift 点选连续范围">N 新建 · Ctrl+Q 删除 · Shift+A/S 切层</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TRANSPARENT_CODE, type PixelLayer } from '../core'
import PixelIcon from './PixelIcon.vue'

const props = withDefaults(defineProps<{
  layers: PixelLayer[]
  activeLayerId: string
  selectedLayerIds?: string[]
  soloMode: boolean
  docWidth: number
  docHeight: number
  renderVersion: number
}>(), { selectedLayerIds: () => [] })
const emit = defineEmits<{
  (e: 'select', id: string, mode: 'replace' | 'toggle' | 'range'): void
  (e: 'add'): void
  (e: 'remove'): void
  (e: 'remove-layer', id: string): void
  (e: 'rename-layer', id: string, name: string): void
  (e: 'reorder-layer', sourceId: string, targetId: string): void
  (e: 'toggle-visible', id: string): void
  (e: 'update:solo-mode', value: boolean): void
}>()

const displayLayers = computed(() => [...props.layers].reverse())
const contextLayerId = ref<string | null>(null)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuStyle = computed(() => ({ left: `${contextMenuPos.value.x}px`, top: `${contextMenuPos.value.y}px` }))
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const renameInputEl = ref<HTMLInputElement[] | null>(null)
const thumbCanvasById = new Map<string, HTMLCanvasElement>()
let draggedLayerId: string | null = null

function onSelectLayer(event: MouseEvent, id: string) {
  const mode = event.shiftKey ? 'range' : (event.ctrlKey || event.metaKey) ? 'toggle' : 'replace'
  emit('select', id, mode)
}

function setThumbCanvas(id: string, element: unknown) {
  if (element instanceof HTMLCanvasElement) thumbCanvasById.set(id, element)
  else thumbCanvasById.delete(id)
}

function renderLayerThumbnails() {
  const layers = displayLayers.value
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex]
    const canvas = thumbCanvasById.get(layer.id)
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) continue
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let minX = props.docWidth
    let minY = props.docHeight
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < props.docHeight; y++) {
      for (let x = 0; x < props.docWidth; x++) {
        const code = layer.grid[y]?.slice(x * 2, x * 2 + 2)
        if (!code || code === TRANSPARENT_CODE || !layer.palette[code]) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    if (maxX < minX || maxY < minY) continue
    const usedWidth = maxX - minX + 1
    const usedHeight = maxY - minY + 1
    const padding = 3
    const scale = Math.min((canvas.width - padding * 2) / usedWidth, (canvas.height - padding * 2) / usedHeight)
    const offsetX = (canvas.width - usedWidth * scale) / 2
    const offsetY = (canvas.height - usedHeight * scale) / 2
    ctx.imageSmoothingEnabled = false
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const code = layer.grid[y]?.slice(x * 2, x * 2 + 2)
        const color = code ? layer.palette[code] : null
        if (!color || code === TRANSPARENT_CODE) continue
        ctx.fillStyle = color.hex
        ctx.fillRect(offsetX + (x - minX) * scale, offsetY + (y - minY) * scale, Math.max(1, scale), Math.max(1, scale))
      }
    }
  }
}

watch(() => [props.renderVersion, props.layers.length, props.docWidth, props.docHeight], () => nextTick(renderLayerThumbnails))

function closeContextMenu() {
  contextLayerId.value = null
}
function openContextMenu(event: MouseEvent, id: string) {
  const panel = (event.currentTarget as HTMLElement).closest('.pixel-layers')?.getBoundingClientRect()
  if (!panel) return
  contextLayerId.value = id
  contextMenuPos.value = {
    x: Math.max(4, Math.min(event.clientX - panel.left, panel.width - 132)),
    y: Math.max(4, Math.min(event.clientY - panel.top, panel.height - 70))
  }
}
function startRename() {
  const layer = props.layers.find((item) => item.id === contextLayerId.value)
  if (!layer) return
  renamingId.value = layer.id
  renameDraft.value = layer.name
  closeContextMenu()
  nextTick(() => renameInputEl.value?.[0]?.select())
}
function commitRename(id: string) {
  if (renamingId.value !== id) return
  emit('rename-layer', id, renameDraft.value)
  renamingId.value = null
}
function cancelRename() {
  renamingId.value = null
}
function removeFromMenu() {
  if (contextLayerId.value) emit('remove-layer', contextLayerId.value)
  closeContextMenu()
}
function onDragStart(event: DragEvent, id: string) {
  draggedLayerId = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDrop(targetId: string) {
  if (draggedLayerId) emit('reorder-layer', draggedLayerId, targetId)
  draggedLayerId = null
}
function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}
onMounted(() => {
  window.addEventListener('pointerdown', closeContextMenu)
  window.addEventListener('keydown', onWindowKeydown)
  nextTick(renderLayerThumbnails)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeContextMenu)
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<style scoped>
.pixel-layers { position: relative; flex: none; min-height: 0; overflow: hidden; background: var(--ps-bg-panel); display: flex; flex-direction: column; }
.pixel-layers__head { height: 34px; padding: 0 10px 0 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 650; border-bottom: 1px solid var(--ps-border); }
.pixel-layers__selected-count { color: var(--ps-text-secondary); font-weight: 500; }
.pixel-layers__solo { display: flex; align-items: center; gap: 4px; color: var(--ps-text-secondary); font-weight: 400; cursor: pointer; }
.pixel-layers__solo input { accent-color: var(--ps-accent-bg); }
.pixel-layers__list { flex: 1; overflow-y: auto; min-height: 0; padding: 4px 0; }
.pixel-layer { width: 100%; height: 38px; padding: 0 10px; display: flex; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--ps-text); cursor: pointer; text-align: left; }
.pixel-layer:hover { background: var(--ps-bg-control); }
.pixel-layer--selected { background: color-mix(in srgb, var(--ps-accent-active-bg) 68%, transparent); }
.pixel-layer--active { background: var(--ps-accent-active-bg); color: var(--ps-accent-active-text); }
.pixel-layer__visibility { width: 24px; height: 28px; display: grid; place-items: center; color: var(--ps-text-secondary); }
.pixel-layer__visibility :deep(svg) { width: 14px; height: 14px; }
.pixel-layer__thumb { width: 28px; height: 24px; flex: none; overflow: hidden; border: 1px solid var(--ps-border-strong); background-color: var(--ps-checker-a); background-image: linear-gradient(45deg,var(--ps-checker-b) 25%,transparent 25%),linear-gradient(-45deg,var(--ps-checker-b) 25%,transparent 25%); background-size: 8px 8px; }
.pixel-layer__thumb canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.pixel-layer__thumb--hidden { opacity: .45; }
.pixel-layer__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.pixel-layer__name-input { min-width: 0; flex: 1; height: 26px; border: 1px solid var(--ps-border-strong); background: var(--ps-bg-panel); color: var(--ps-text); font: inherit; padding: 0 5px; outline: none; }
.pixel-layer-menu { position: absolute; z-index: 8; width: 128px; padding: 4px 0; border: 1px solid var(--ps-border-strong); background: var(--ps-bg-panel); box-shadow: 0 4px 14px color-mix(in srgb,var(--ps-text) 12%,transparent); }
.pixel-layer-menu button { width: 100%; height: 30px; padding: 0 12px; border: 0; background: transparent; color: var(--ps-text); text-align: left; cursor: pointer; }
.pixel-layer-menu button:hover:not(:disabled),.pixel-layer-menu button:focus-visible { background: var(--ps-bg-control); }
.pixel-layer-menu button:disabled { opacity: .35; cursor: not-allowed; }
.pixel-layer-menu__danger { color: var(--ps-danger) !important; }
.pixel-layers__actions { height: 34px; padding: 0 8px; border-top: 1px solid var(--ps-border); display: flex; align-items: center; gap: 3px; }
.pixel-layers__actions button { width: 28px; height: 28px; border: 0; background: transparent; color: var(--ps-text-secondary); display: grid; place-items: center; cursor: pointer; }
.pixel-layers__actions button:hover:not(:disabled) { background: var(--ps-bg-control); color: var(--ps-text); }
.pixel-layers__actions button:disabled { opacity: .35; cursor: not-allowed; }
.pixel-layers__actions button :deep(svg) { width: 14px; height: 14px; }
.pixel-layers__hint { margin-left: auto; color: var(--ps-text-weak); font-size: 10px; }
</style>
