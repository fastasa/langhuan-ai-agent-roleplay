<template>
  <section class="timeline-dock" :class="{ 'timeline-dock--expanded': expanded }" :style="dockStyle">
    <PixelResizeHandle v-if="expanded" class="timeline-dock__resizer" axis="horizontal" @resize="resizeDock" @resize-end="saveLayout" />
    <header class="timeline-dock__header">
      <button type="button" class="timeline-dock__toggle" :title="expanded ? '收起时间轴' : '展开时间轴'" @click="toggleExpanded">
        <PixelIcon :name="expanded ? 'chevron-down' : 'chevron-up'" />
        <span>时间轴</span>
      </button>
      <template v-if="expanded && doc.timeline">
        <span class="timeline-dock__meta">{{ doc.timeline.fps }} fps · {{ rangeLength }} 帧</span>
        <div class="timeline-dock__spacer" />
        <button type="button" title="上一画帧" @click="$emit('previous-frame')"><PixelIcon name="skip-back" /></button>
        <button type="button" :title="playing ? '暂停' : '播放'" class="timeline-dock__play" @click="$emit('toggle-play')"><PixelIcon :name="playing ? 'pause' : 'play'" /></button>
        <button type="button" title="下一画帧" @click="$emit('next-frame')"><PixelIcon name="skip-forward" /></button>
        <label class="timeline-dock__loop"><input :checked="doc.playback.loop" type="checkbox" @change="$emit('toggle-loop')" />循环</label>
        <span class="timeline-dock__divider" />
        <button type="button" title="新增空白画帧" @click="$emit('add-frame')"><PixelIcon name="plus" /></button>
        <button type="button" title="复制当前画帧" @click="$emit('duplicate-frame')"><PixelIcon name="copy" /></button>
        <button type="button" title="删除当前画帧" :disabled="doc.frames.length <= 1" @click="$emit('delete-frame')"><PixelIcon name="trash-2" /></button>
      </template>
    </header>

    <div v-if="expanded" class="timeline-dock__content">
      <button v-if="!doc.timeline" type="button" class="timeline-dock__create" @click="$emit('create-timeline')">
        <PixelIcon name="plus" />新建时间轴
      </button>
      <div v-else ref="scrollerEl" class="timeline-dock__scroller" @scroll="extendSurfaceOnScroll" @pointermove="updateHover" @pointerleave="hoverFrame = null">
        <div class="timeline-dock__surface" :style="surfaceStyle" @pointerdown="selectAtPointer">
          <div class="timeline-dock__ruler">
            <span v-for="tick in rulerTicks" :key="tick" class="timeline-dock__tick" :style="{ left: `${(tick - 1) * CELL_WIDTH}px` }">{{ tick }}</span>
          </div>
          <div class="timeline-dock__track">
            <div class="timeline-dock__range" :style="rangeStyle" />
            <button
              class="timeline-dock__boundary timeline-dock__boundary--start"
              :style="startBoundaryStyle"
              title="拖动播放起点"
              @pointerdown.stop="startBoundaryDrag($event, 'start')"
            />
            <button
              class="timeline-dock__boundary timeline-dock__boundary--end"
              :style="endBoundaryStyle"
              title="拖动播放终点"
              @pointerdown.stop="startBoundaryDrag($event, 'end')"
            />
            <div
              v-for="segment in segments"
              :key="segment.frame.id"
              class="timeline-dock__segment"
              :class="{ 'timeline-dock__segment--active': segment.index === currentFrameIndex }"
              :style="segment.style"
              draggable="true"
              :title="`画帧 ${segment.index + 1} · ${segment.frame.exposureFrames} 格`"
              @dragstart.stop="dragFrameIndex = segment.index"
              @dragover.prevent
              @drop.stop="dropFrame(segment.index)"
              @pointerdown.stop="$emit('select-frame', segment.index, segment.start)"
            >
              <span>{{ segment.index + 1 }}</span>
              <button type="button" class="timeline-dock__exposure-handle" title="拖动调整曝光长度" draggable="false" @dragstart.prevent @pointerdown.stop="startExposureDrag($event, segment.index)" />
            </div>
            <div class="timeline-dock__playhead" :style="playheadStyle"><span>{{ playheadFrame }}</span></div>
            <div v-if="hoverFrame !== null" class="timeline-dock__hover-cell" :style="hoverCellStyle"><span>第 {{ hoverFrame }} 帧</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PixelDocument } from '../core'
import PixelIcon from './PixelIcon.vue'
import PixelResizeHandle from './PixelResizeHandle.vue'

const CELL_WIDTH = 28
const STORAGE_KEY = 'pixel-studio:timeline-layout'
const props = defineProps<{ doc: PixelDocument; currentFrameIndex: number; playheadFrame: number; playing: boolean }>()
const emit = defineEmits<{
  (e: 'create-timeline'): void
  (e: 'toggle-play'): void
  (e: 'toggle-loop'): void
  (e: 'previous-frame'): void
  (e: 'next-frame'): void
  (e: 'add-frame'): void
  (e: 'duplicate-frame'): void
  (e: 'delete-frame'): void
  (e: 'select-frame', index: number, timelineFrame: number): void
  (e: 'reorder-frame', sourceIndex: number, targetIndex: number): void
  (e: 'resize-exposure', index: number, exposureFrames: number): void
  (e: 'set-boundary', edge: 'start' | 'end', frameNumber: number): void
  (e: 'edit-start'): void
  (e: 'edit-end'): void
}>()

function loadLayout() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as { expanded?: boolean; height?: number } | null
    return { expanded: value?.expanded === true, height: typeof value?.height === 'number' ? value.height : 230 }
  } catch { return { expanded: false, height: 230 } }
}
const stored = loadLayout()
const expanded = ref(stored.expanded)
const height = ref(Math.max(150, Math.min(window.innerHeight * 0.55, stored.height)))
const scrollerEl = ref<HTMLElement | null>(null)
const hoverFrame = ref<number | null>(null)
const dragFrameIndex = ref<number | null>(null)
const dockStyle = computed(() => ({ height: expanded.value ? `${height.value}px` : '28px' }))
const rangeLength = computed(() => props.doc.timeline ? props.doc.timeline.rangeEndFrame - props.doc.timeline.rangeStartFrame + 1 : 0)
const extendedRenderEnd = ref(240)
const renderEnd = computed(() => Math.max(extendedRenderEnd.value, (props.doc.timeline?.rangeEndFrame ?? 1) + 60))
const surfaceStyle = computed(() => ({ width: `${renderEnd.value * CELL_WIDTH}px` }))
const rangeStyle = computed(() => props.doc.timeline ? ({ left: `${(props.doc.timeline.rangeStartFrame - 1) * CELL_WIDTH}px`, width: `${rangeLength.value * CELL_WIDTH}px` }) : {})
const startBoundaryStyle = computed(() => ({ left: `${((props.doc.timeline?.rangeStartFrame ?? 1) - 1) * CELL_WIDTH}px` }))
const endBoundaryStyle = computed(() => ({ left: `${(props.doc.timeline?.rangeEndFrame ?? 1) * CELL_WIDTH}px` }))
const playheadStyle = computed(() => ({ left: `${(props.playheadFrame - 1) * CELL_WIDTH}px` }))
const hoverCellStyle = computed(() => ({ left: `${((hoverFrame.value ?? 1) - 1) * CELL_WIDTH}px` }))
const rulerTicks = computed(() => {
  const step = renderEnd.value > 2000 ? 100 : renderEnd.value > 600 ? 20 : 5
  const ticks: number[] = []
  for (let value = 1; value <= renderEnd.value; value += step) ticks.push(value)
  return ticks
})
const segments = computed(() => {
  let cursor = props.doc.timeline?.rangeStartFrame ?? 1
  return props.doc.frames.map((frame, index) => {
    const start = cursor
    cursor += frame.exposureFrames
    return { frame, index, start, style: { left: `${(start - 1) * CELL_WIDTH}px`, width: `${frame.exposureFrames * CELL_WIDTH}px` } }
  })
})

function saveLayout() { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ expanded: expanded.value, height: height.value })) }
function toggleExpanded() { expanded.value = !expanded.value; saveLayout() }
function resizeDock(delta: number) { height.value = Math.max(150, Math.min(window.innerHeight * 0.55, height.value - delta)) }
function frameFromClientX(clientX: number) {
  const rect = scrollerEl.value?.getBoundingClientRect()
  if (!rect || !scrollerEl.value) return 1
  return Math.max(1, Math.min(renderEnd.value, Math.floor((clientX - rect.left + scrollerEl.value.scrollLeft) / CELL_WIDTH) + 1))
}
function updateHover(event: PointerEvent) { hoverFrame.value = frameFromClientX(event.clientX) }
function extendSurfaceOnScroll() {
  const scroller = scrollerEl.value
  if (!scroller || scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 200) return
  extendedRenderEnd.value = Math.min(36000, extendedRenderEnd.value + 240)
}
function selectAtPointer(event: PointerEvent) {
  if (!props.doc.timeline) return
  const frameNumber = Math.max(props.doc.timeline.rangeStartFrame, Math.min(props.doc.timeline.rangeEndFrame, frameFromClientX(event.clientX)))
  let cursor = props.doc.timeline.rangeStartFrame
  const index = props.doc.frames.findIndex((frame) => { cursor += frame.exposureFrames; return frameNumber < cursor })
  emit('select-frame', Math.max(0, index), frameNumber)
}
function dropFrame(targetIndex: number) { if (dragFrameIndex.value !== null) emit('reorder-frame', dragFrameIndex.value, targetIndex); dragFrameIndex.value = null }

let activeDrag: { kind: 'boundary'; edge: 'start' | 'end' } | { kind: 'exposure'; index: number; origin: number; startX: number } | null = null
function startBoundaryDrag(event: PointerEvent, edge: 'start' | 'end') { emit('edit-start'); activeDrag = { kind: 'boundary', edge }; window.addEventListener('pointermove', onGlobalPointerMove); window.addEventListener('pointerup', stopDrag); event.preventDefault() }
function startExposureDrag(event: PointerEvent, index: number) { emit('edit-start'); activeDrag = { kind: 'exposure', index, origin: props.doc.frames[index].exposureFrames, startX: event.clientX }; window.addEventListener('pointermove', onGlobalPointerMove); window.addEventListener('pointerup', stopDrag); event.preventDefault() }
function onGlobalPointerMove(event: PointerEvent) {
  if (!activeDrag) return
  if (activeDrag.kind === 'boundary') emit('set-boundary', activeDrag.edge, frameFromClientX(event.clientX))
  else emit('resize-exposure', activeDrag.index, Math.max(1, activeDrag.origin + Math.round((event.clientX - activeDrag.startX) / CELL_WIDTH)))
}
function stopDrag() { if (activeDrag) emit('edit-end'); activeDrag = null; window.removeEventListener('pointermove', onGlobalPointerMove); window.removeEventListener('pointerup', stopDrag) }
onBeforeUnmount(stopDrag)
</script>

<style scoped>
.timeline-dock { flex: none; min-height: 28px; overflow: hidden; border-top: 1px solid var(--ps-border-strong); background: var(--ps-bg-panel); color: var(--ps-text); zoom: .9; }
.timeline-dock__resizer { height: 7px; }
.timeline-dock__header { height: 28px; display: flex; align-items: center; gap: 4px; padding: 0 8px; border-bottom: 1px solid var(--ps-border); }
.timeline-dock__header button,.timeline-dock__toggle { width: 25px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--ps-text-secondary); }
.timeline-dock__header button:hover:not(:disabled) { background: var(--ps-bg-control); color: var(--ps-text); }
.timeline-dock__header button:disabled { opacity: .35; }
.timeline-dock__header svg { width: 14px; height: 14px; }
.timeline-dock__toggle { width: auto !important; gap: 5px; padding: 0 4px; font-size: 11px; }
.timeline-dock__toggle svg { width: 13px; }
.timeline-dock__meta { margin-left: 8px; color: var(--ps-text-secondary); font-size: 10px; }
.timeline-dock__spacer { flex: 1; }
.timeline-dock__divider { width: 1px; height: 15px; margin: 0 3px; background: var(--ps-border); }
.timeline-dock__loop { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; color: var(--ps-text-secondary); font-size: 10px; }
.timeline-dock__loop input { accent-color: var(--ps-accent-bg); }
.timeline-dock__content { height: calc(100% - 35px); min-height: 0; }
.timeline-dock__create { display: inline-flex; align-items: center; gap: 6px; margin: 18px; padding: 6px 12px; border: 1px solid var(--ps-border-strong); border-radius: 3px; background: var(--ps-bg-control); color: var(--ps-text); }
.timeline-dock__create svg { width: 14px; height: 14px; }
.timeline-dock__scroller { height: 100%; overflow: auto; }
.timeline-dock__surface { position: relative; min-height: 100%; background-image: repeating-linear-gradient(90deg, transparent 0, transparent 27px, var(--ps-border) 27px, var(--ps-border) 28px); }
.timeline-dock__ruler { position: sticky; top: 0; z-index: 8; height: 25px; border-bottom: 1px solid var(--ps-border-strong); background: color-mix(in srgb,var(--ps-bg-panel) 96%,transparent); }
.timeline-dock__tick { position: absolute; top: 5px; padding-left: 3px; color: var(--ps-text-secondary); font-size: 9px; }
.timeline-dock__track { position: relative; height: 58px; margin-top: 8px; }
.timeline-dock__range { position: absolute; inset-block: 0; border-block: 1px solid color-mix(in srgb,var(--ps-accent-bg) 55%,transparent); background: color-mix(in srgb,var(--ps-accent-bg) 5%,transparent); }
.timeline-dock__boundary { position: absolute; top: -6px; z-index: 7; width: 7px; height: 70px; padding: 0; transform: translateX(-3px); border: 0; border-left: 2px solid #4f82ad; background: transparent; cursor: ew-resize; }
.timeline-dock__boundary::before { content: ''; position: absolute; left: -5px; top: 0; border-style: solid; border-width: 5px 5px 0; border-color: #4f82ad transparent transparent; }
.timeline-dock__segment { position: absolute; top: 8px; z-index: 3; height: 34px; min-width: 28px; overflow: hidden; border: 1px solid color-mix(in srgb,var(--ps-accent-bg) 50%,var(--ps-border)); background: color-mix(in srgb,var(--ps-accent-bg) 20%,var(--ps-bg-panel)); color: var(--ps-text); text-align: left; }
.timeline-dock__segment:nth-of-type(even) { background: color-mix(in srgb,var(--ps-accent-bg) 12%,var(--ps-bg-control)); }
.timeline-dock__segment--active { z-index: 4; border-color: var(--ps-accent-bg); background: color-mix(in srgb,var(--ps-accent-bg) 30%,var(--ps-bg-panel)); }
.timeline-dock__segment > span { position: sticky; left: 5px; font-size: 10px; }
.timeline-dock__exposure-handle { position: absolute; top: 0; right: 0; width: 7px; height: 100%; padding: 0; border: 0; border-left: 1px solid color-mix(in srgb,var(--ps-accent-bg) 55%,transparent); background: transparent; cursor: ew-resize; }
.timeline-dock__playhead { position: absolute; top: -22px; bottom: -3px; z-index: 6; width: 2px; pointer-events: none; background: #b84a4a; }
.timeline-dock__playhead > span { position: absolute; top: 0; left: 0; min-width: 18px; padding: 1px 3px; transform: translateX(-1px); background: #b84a4a; color: #fff; font-size: 9px; text-align: center; }
.timeline-dock__hover-cell { position: absolute; inset-block: 0; width: 28px; z-index: 2; pointer-events: none; background: color-mix(in srgb,var(--ps-accent-bg) 10%,transparent); }
.timeline-dock__hover-cell span { position: absolute; top: 43px; left: 2px; width: max-content; padding: 2px 4px; border: 1px solid var(--ps-border); background: var(--ps-bg-panel); color: var(--ps-text-secondary); font-size: 9px; }
</style>
