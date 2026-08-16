<template>
  <div
    v-if="normalizedItems.length > 0"
    class="task-timeline-scroll"
    :class="{ compact: isCompact, 'with-labels': showLabels && !isCompact }"
    ref="scrollRef"
  >
    <div class="task-timeline" :class="{ compact: isCompact, 'with-labels': showLabels && !isCompact }" :style="timelineStyle">
      <div class="task-timeline-axis"></div>
      <div
        v-for="tick in ticks"
        :key="`tick_${tick.ms}`"
        class="task-timeline-tick"
        :class="tick.kind"
        :style="{ left: `${toPx(tick.ms)}px` }"
      ></div>
      <div
        v-for="item in positionedItems"
        :key="item.id"
        class="task-timeline-node"
        :class="item.isStart ? 'is-start' : 'is-end'"
        :style="{ left: `${item.positionPx}px` }"
      >
        <span class="task-timeline-dot" :style="dotStyle(item)"></span>
        <span
          v-if="showLabels"
          class="task-timeline-connector"
          :class="[
            item.laneSide === 'top' ? 'lane-top' : 'lane-bottom',
            `lane-depth-${item.laneDepth}`
          ]"
        ></span>
        <div
          v-if="showLabels"
          class="task-timeline-label"
          :class="[
            item.laneSide === 'top' ? 'lane-top' : 'lane-bottom',
            `lane-depth-${item.laneDepth}`
          ]"
        >
          <span class="task-timeline-label-name">{{ item.label }}</span>
          <span class="task-timeline-label-time">{{ formatTimelineTime(item.time) }}</span>
        </div>
        <div class="task-timeline-tip">
          {{ item.label }} · {{ formatTimelineTime(item.time) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatTimelineTime, type TimelineNode } from '../../utils/taskTimeline'

const props = withDefaults(defineProps<{
  items: TimelineNode[]
  minWidth?: number
  adaptiveScale?: boolean
  showLabels?: boolean
  compact?: boolean
  autoScrollOnUpdates?: boolean
}>(), {
  minWidth: 420,
  adaptiveScale: false,
  showLabels: true,
  compact: false,
  autoScrollOnUpdates: true
})
const TIMELINE_SCALE_KEY = 'langhuan_timeline_px_per_minute'
const TIMELINE_SCALE_EVENT = 'langhuan_timeline_scale_change'
const DEFAULT_PX_PER_MINUTE = 50
const MIN_TIMELINE_MS = 10 * 60_000
const PADDING = 14
const END_PADDING = 24
const scrollRef = ref<HTMLElement | null>(null)
const compactWidth = ref(0)
let compactResizeObserver: ResizeObserver | null = null
const showLabels = computed(() => Boolean(props.showLabels))
const isCompact = computed(() => Boolean(props.compact))
const timelinePxPerMinute = ref(readTimelineScale())
const pxPerMs = computed(() => timelinePxPerMinute.value / 60_000)

const normalizedItems = computed(() => {
  const base = Array.isArray(props.items) ? props.items : []
  return [...base].sort((a, b) => a.time - b.time)
})

const totalMs = computed(() => {
  const last = normalizedItems.value[normalizedItems.value.length - 1]
  return Math.max(last?.time || 0, MIN_TIMELINE_MS)
})

const timelineStyle = computed(() => {
  if (isCompact.value) {
    return {
      width: '100%',
      minWidth: '0'
    }
  }
  const autoWidth = props.adaptiveScale
    ? Math.max((Math.ceil(totalMs.value / 60_000) + 2) * timelinePxPerMinute.value, normalizedItems.value.length * 18)
    : Math.ceil(PADDING * 2 + totalMs.value * pxPerMs.value + END_PADDING)
  return {
    minWidth: `${Math.max(props.minWidth, autoWidth)}px`
  }
})

const positionedItems = computed(() => {
  const width = resolveTimelineWidth()
  const usable = Math.max(1, width - PADDING * 2)
  const base = normalizedItems.value.map((item) => ({
    ...item,
    positionPx: props.adaptiveScale
      ? PADDING + Math.min(usable, Math.max(0, (item.time / totalMs.value) * usable))
      : Math.min(width - PADDING, PADDING + Math.max(0, item.time) * pxPerMs.value)
  }))

  if (!showLabels.value) {
    return base.map((item) => ({ ...item, laneSide: 'top', laneDepth: 0 }))
  }

  type LaneKey = 'top0' | 'bottom0' | 'top1' | 'bottom1' | 'top2' | 'bottom2'
  const laneRightEdge = new Map<LaneKey, number>([
    ['top0', -Infinity],
    ['bottom0', -Infinity],
    ['top1', -Infinity],
    ['bottom1', -Infinity],
    ['top2', -Infinity],
    ['bottom2', -Infinity]
  ])
  const minGap = 8

  return base.map((item, index) => {
    const estimatedLabelWidth = estimateLabelWidth(item.label, formatTimelineTime(item.time))
    const preferTop = index % 2 === 0
    const candidateLanes: LaneKey[] = preferTop
      ? ['top0', 'bottom0', 'top1', 'bottom1', 'top2', 'bottom2']
      : ['bottom0', 'top0', 'bottom1', 'top1', 'bottom2', 'top2']

    let pickedLane: LaneKey = candidateLanes[candidateLanes.length - 1]
    for (const lane of candidateLanes) {
      const right = laneRightEdge.get(lane) || -Infinity
      const left = item.positionPx - estimatedLabelWidth / 2
      if (left - right >= minGap) {
        pickedLane = lane
        break
      }
    }

    laneRightEdge.set(pickedLane, item.positionPx + estimatedLabelWidth / 2)
    const laneSide = pickedLane.startsWith('top') ? 'top' : 'bottom'
    const laneDepth = Number(pickedLane.slice(-1))

    return {
      ...item,
      laneSide,
      laneDepth
    }
  })
})

const ticks = computed(() => {
  const result: Array<{ ms: number; kind: 'minor' | 'major' }> = []
  const totalMinutes = Math.ceil(totalMs.value / 60_000)
  for (let minute = 0; minute <= totalMinutes; minute += 5) {
    const ms = minute * 60_000
    result.push({ ms, kind: minute % 10 === 0 ? 'major' : 'minor' })
  }
  return result
})

function resolveTimelineWidth() {
  if (isCompact.value) {
    return Math.max(1, compactWidth.value)
  }
  const autoWidth = props.adaptiveScale
    ? Math.max((Math.ceil(totalMs.value / 60_000) + 2) * timelinePxPerMinute.value, normalizedItems.value.length * 18)
    : Math.ceil(PADDING * 2 + totalMs.value * pxPerMs.value + END_PADDING)
  return Math.max(props.minWidth, autoWidth)
}

function toPx(ms: number) {
  const width = resolveTimelineWidth()
  const usable = Math.max(1, width - PADDING * 2)
  if (props.adaptiveScale) {
    return PADDING + Math.min(usable, Math.max(0, (ms / totalMs.value) * usable))
  }
  return Math.min(width - PADDING, PADDING + Math.max(0, ms) * pxPerMs.value)
}

function defaultColor(isStart: boolean) {
  return isStart ? '#5f9f6f' : '#c97b63'
}

function dotStyle(item: TimelineNode) {
  const color = item.color || defaultColor(item.isStart)
  if (item.isStart) {
    return {
      borderColor: color,
      background: `linear-gradient(90deg, ${color} 0 50%, #fff 50% 100%)`
    }
  }
  return {
    borderColor: color,
    backgroundColor: color
  }
}

function estimateLabelWidth(label: string, timeText: string) {
  const labelText = String(label || '')
  const time = String(timeText || '')
  const estimated = Math.max(labelText.length * 7.2, time.length * 6.2) + 46
  return Math.max(78, Math.min(168, Math.ceil(estimated)))
}

function readTimelineScale() {
  if (typeof window === 'undefined') return DEFAULT_PX_PER_MINUTE
  const raw = Number(window.localStorage.getItem(TIMELINE_SCALE_KEY))
  if (!Number.isFinite(raw)) return DEFAULT_PX_PER_MINUTE
  return clampTimelineScale(raw)
}

function clampTimelineScale(value: number) {
  return Math.min(200, Math.max(1, Math.round(value)))
}

function handleTimelineScaleChange(event: Event) {
  const customEvent = event as CustomEvent<{ value?: number }>
  const incoming = Number(customEvent?.detail?.value)
  if (Number.isFinite(incoming)) {
    timelinePxPerMinute.value = clampTimelineScale(incoming)
    return
  }
  timelinePxPerMinute.value = readTimelineScale()
}

onMounted(() => {
  timelinePxPerMinute.value = readTimelineScale()
  window.addEventListener(TIMELINE_SCALE_EVENT, handleTimelineScaleChange as EventListener)

  const refreshCompactWidth = () => {
    compactWidth.value = Math.max(1, scrollRef.value?.clientWidth || 0)
  }
  refreshCompactWidth()
  if (typeof ResizeObserver !== 'undefined' && scrollRef.value) {
    compactResizeObserver = new ResizeObserver(() => {
      refreshCompactWidth()
    })
    compactResizeObserver.observe(scrollRef.value)
  }

  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollLeft = scrollRef.value.scrollWidth
    }
  })
})

onUnmounted(() => {
  window.removeEventListener(TIMELINE_SCALE_EVENT, handleTimelineScaleChange as EventListener)
  compactResizeObserver?.disconnect()
  compactResizeObserver = null
})

watch(positionedItems, async () => {
  if (!props.autoScrollOnUpdates) return
  await nextTick()
  if (scrollRef.value) {
    scrollRef.value.scrollLeft = scrollRef.value.scrollWidth
  }
}, { immediate: true })
</script>

<style scoped>
.task-timeline-scroll {
  overflow-x: auto;
  overflow-y: visible;
  padding: 3px 0 2px;
  scrollbar-width: thin;
}

.task-timeline-scroll.with-labels {
  padding-top: 8px;
}

.task-timeline-scroll.compact {
  padding: 1px 0;
  overflow-x: hidden;
}

.task-timeline-scroll::-webkit-scrollbar {
  height: 4px;
}

.task-timeline-scroll::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.45);
  border-radius: 999px;
}

.task-timeline {
  position: relative;
  height: 64px;
  padding: 0 14px;
}

.task-timeline.with-labels {
  height: 240px;
}

.task-timeline.compact {
  height: 26px;
}

.task-timeline-axis {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 30px;
  height: 1px;
  background: rgba(121, 110, 96, 0.28);
}

.task-timeline.with-labels .task-timeline-axis {
  top: 98px;
}

.task-timeline.compact .task-timeline-axis {
  top: 14px;
}

.task-timeline-tick {
  position: absolute;
  top: 30px;
  transform: translateX(-50%);
  width: 1px;
  background: rgba(121, 110, 96, 0.28);
}

.task-timeline.with-labels .task-timeline-tick {
  top: 98px;
}

.task-timeline.compact .task-timeline-tick {
  top: 14px;
}

.task-timeline-tick.minor {
  height: 6px;
}

.task-timeline-tick.major {
  height: 10px;
}

.task-timeline.compact .task-timeline-tick.minor {
  height: 4px;
}

.task-timeline.compact .task-timeline-tick.major {
  height: 6px;
}

.task-timeline-node {
  position: absolute;
  top: 30px;
  transform: translateX(-50%);
  width: 0;
  z-index: 2;
}

.task-timeline.with-labels .task-timeline-node {
  top: 98px;
}

.task-timeline.compact .task-timeline-node {
  top: 14px;
}

.task-timeline-dot {
  position: absolute;
  left: 50%;
  top: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid;
  box-shadow: 0 0 0 1px rgba(123, 111, 96, 0.2);
  transform: translate(-50%, -50%);
  cursor: pointer;
}

.task-timeline.compact .task-timeline-dot {
  width: 7px;
  height: 7px;
  border-width: 1.5px;
}

.task-timeline-connector {
  position: absolute;
  left: 50%;
  width: 1px;
  background: rgba(121, 110, 96, 0.45);
  transform: translateX(-50%);
}

.task-timeline-connector.lane-top {
  bottom: 7px;
  height: 14px;
  transform: translate(-50%, -100%);
}

.task-timeline-connector.lane-bottom {
  top: 7px;
  height: 14px;
}

.task-timeline-connector.lane-top.lane-depth-1 {
  height: 30px;
}

.task-timeline-connector.lane-bottom.lane-depth-1 {
  height: 30px;
}

.task-timeline-connector.lane-top.lane-depth-2 {
  height: 46px;
}

.task-timeline-connector.lane-bottom.lane-depth-2 {
  height: 46px;
}

.task-timeline-label {
  position: absolute;
  left: 50%;
  display: grid;
  gap: 1px;
  white-space: nowrap;
  transform: translateX(-50%);
  text-align: center;
  color: #534a40;
}

.task-timeline-label.lane-top {
  bottom: 24px;
  transform: translate(-50%, -100%);
}

.task-timeline-label.lane-bottom {
  top: 24px;
}

.task-timeline-label.lane-top.lane-depth-1 {
  bottom: 40px;
}

.task-timeline-label.lane-bottom.lane-depth-1 {
  top: 40px;
}

.task-timeline-label.lane-top.lane-depth-2 {
  bottom: 56px;
}

.task-timeline-label.lane-bottom.lane-depth-2 {
  top: 56px;
}

.task-timeline-label-name {
  font-size: 0.58rem;
  font-weight: 600;
  line-height: 1.1;
}

.task-timeline-label-time {
  font-size: 0.56rem;
  line-height: 1.1;
  color: #7a6f63;
}

.task-timeline-tip {
  position: absolute;
  left: 50%;
  bottom: 13px;
  transform: translateX(-50%);
  white-space: nowrap;
  background: rgba(35, 35, 35, 0.92);
  color: #fff;
  font-size: 0.7rem;
  line-height: 1.2;
  padding: 4px 6px;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.task-timeline-node:hover .task-timeline-tip {
  opacity: 1;
}
</style>
