<template>
  <Transition name="floating-workspace-window-shift" mode="out-in">
    <button
      v-if="!embedded && showCollapsedTab && (!open || minimizedEdge)"
      key="edge"
      type="button"
      class="floating-workspace-window__edge-tab"
      :class="`floating-workspace-window__edge-tab--${minimizedEdge || 'right'}`"
      :style="minimizedStyle"
      :title="edgeTitle || `展开${title || '浮动窗口'}`"
      :aria-label="edgeAriaLabel || edgeTitle || `展开${title || '浮动窗口'}`"
      @pointerdown="startTabDrag"
      @click="handleEdgeClick"
    >
      <!-- edge 具名 slot（2026-07-11 未打开态与靠边收起态统一为同一份书签签牌）：缺省回退纯文字标题，
           星依浮坞传星星状态灯（与旧的独立 .xingyi-launcher 同外观，现已合并进本组件——不再是两套代码）。 -->
      <slot name="edge">
        <span>{{ title || '窗口' }}</span>
      </slot>
    </button>
    <section
      v-else-if="open || embedded"
      key="window"
      ref="windowRef"
      class="floating-workspace-window"
      :class="[transitionEdgeClass, { 'floating-workspace-window--embedded': embedded }]"
      :style="windowStyle"
      role="dialog"
      :aria-label="title || '浮动窗口'"
    >
      <header class="floating-workspace-window__header" :title="embedded ? undefined : '拖动窗口'" @pointerdown="startDrag">
        <!-- title 具名 slot（2026-07-11 星依浮坞头部融合状态灯用）：缺省回退纯文字标题，其他浮窗不受影响。
             自定义内容自己负责 flex:1 + min-width:0，避免把右侧工具钮挤走。 -->
        <slot name="title">
          <span class="floating-workspace-window__title">{{ title }}</span>
        </slot>
        <div class="floating-workspace-window__tools">
          <!-- tools 具名 slot（2026-07-11 星依浮坞私有主题钮用）：缺省为空，其他浮窗不受影响 -->
          <slot name="tools"></slot>
          <button v-if="!embedded" type="button" class="floating-workspace-window__tool" title="关闭窗口" aria-label="关闭窗口" @click.stop="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18"/>
              <path d="M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </header>

      <div class="floating-workspace-window__body">
        <slot />
      </div>

      <span
        v-for="handle in embedded ? [] : resizeHandles"
        :key="handle"
        class="floating-workspace-window__resize"
        :class="`floating-workspace-window__resize--${handle}`"
        @pointerdown.stop="startResize($event, handle)"
      ></span>
    </section>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'

/** 四角 + 四边（批I·2026-07-12 真机反馈补齐四条边）：角=双向对角缩放，边=单轴缩放。 */
type ResizeHandle =
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'top' | 'right' | 'bottom' | 'left'
type WindowRect = {
  left: number
  top: number
  width: number
  height: number
}
const props = withDefaults(defineProps<{
  /** 是否展开为完整窗口；false 时不再直接消失，而是显示靠边签牌（2026-07-11 未打开态并入靠边收起态）。 */
  open: boolean
  title?: string
  storageKey?: string
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  minHeight?: number
  defaultTop?: number
  defaultRight?: number
  /** 窗口层级（默认 96=普通浮窗）。星依浮坞传 12900：高于普通浮层（≤12000），低于模态弹窗（≥13000）与全局遮罩（14000），确保弹窗/加载时浮坞一并进入背景模糊层。 */
  zIndex?: number
  /** 是否启用靠边签牌（默认 true）。false 同时禁用关闭态签牌与拖窗靠边收起。 */
  showCollapsedTab?: boolean
  /** 靠边签牌的 title/aria-label 覆盖（不传时回退成「展开{title}」）。星依浮坞传状态灯文案+快捷键提示。 */
  edgeTitle?: string
  edgeAriaLabel?: string
  /** 静态嵌入其他工作区：复用同一内容实例，但停用浮动定位、边缘签牌、拖动、缩放和关闭键。 */
  embedded?: boolean
}>(), {
  title: '',
  storageKey: '',
  defaultWidth: 560,
  defaultHeight: 420,
  minWidth: 320,
  minHeight: 260,
  defaultTop: 52,
  defaultRight: 24,
  zIndex: 96,
  showCollapsedTab: true,
  edgeTitle: '',
  edgeAriaLabel: '',
  embedded: false
})

const emit = defineEmits<{
  (e: 'close'): void
  /** 点击靠边签牌、且当前尚未展开时触发（已展开时点击签牌走内部 restoreFromEdge，不需要通知外部）。 */
  (e: 'expand'): void
}>()

// 四边在前四角在后（角的命中区避让见 CSS：边条从角块 14px 之后开始，互不重叠）。
const resizeHandles: ResizeHandle[] = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
const windowRef = ref<HTMLElement | null>(null)
const rect = ref<WindowRect>({
  left: 0,
  top: props.defaultTop,
  width: props.defaultWidth,
  height: props.defaultHeight
})
const minimizedEdge = ref<'' | 'left' | 'right'>('')
const transitionEdge = ref<'' | 'left' | 'right'>('')
// 签牌自由上下拖动的位置记忆（2026-07-11）：null=没拖动过，走 tabTopFallback() 的旧推算位置；
// 一旦手动拖过，就固定成用户选的位置，不再被窗口 rect 变化牵着走（除非又被拖窗口到边缘覆盖，见 syncTabTopFromRect）。
const tabTop = ref<number | null>(readStoredTabTop())
let tabDragMoved = false
let stopPointerInteraction: null | (() => void) = null

const windowStyle = computed<CSSProperties>(() => (props.embedded
  ? { width: '100%', height: '100%' }
  : {
      left: `${rect.value.left}px`,
      top: `${rect.value.top}px`,
      width: `${rect.value.width}px`,
      height: `${rect.value.height}px`,
      zIndex: props.zIndex
    }))

// 靠边签牌尺寸（2026-07-11 统一为书签签牌样式后 34x46，需与下方 CSS .floating-workspace-window__edge-tab 同步）
const EDGE_TAB_HEIGHT = 46
const EDGE_TAB_MARGIN = 12

// 没手动拖过签牌时的推算位置：跟窗口 rect 走（保留「拖窗口到边缘自动收起」时签牌落在窗口原位置附近的观感）
function tabTopFallback(): number {
  const bounds = getContainerBounds()
  return clamp(
    rect.value.top + Math.min(rect.value.height, 520) / 2 - EDGE_TAB_HEIGHT / 2,
    EDGE_TAB_MARGIN,
    Math.max(EDGE_TAB_MARGIN, bounds.height - EDGE_TAB_HEIGHT - EDGE_TAB_MARGIN)
  )
}

const minimizedStyle = computed<CSSProperties>(() => {
  const bounds = getContainerBounds()
  // 未展开态没有真实 minimizedEdge（从没拖动过），默认停右缘——与旧 .xingyi-launcher 位置一致
  const edge = minimizedEdge.value || 'right'
  const top = clamp(
    tabTop.value ?? tabTopFallback(),
    EDGE_TAB_MARGIN,
    Math.max(EDGE_TAB_MARGIN, bounds.height - EDGE_TAB_HEIGHT - EDGE_TAB_MARGIN)
  )
  const style: CSSProperties = {
    top: `${top}px`,
    zIndex: props.zIndex
  }
  if (edge === 'right') {
    style.right = `${getViewportRightInset()}px`
  } else {
    style.left = `${getViewportLeftInset()}px`
  }
  return style
})
const transitionEdgeClass = computed(() => transitionEdge.value
  ? `floating-workspace-window--edge-${transitionEdge.value}`
  : ''
)

watch(() => props.open, (open) => {
  if (!open) return
  nextTick(() => {
    minimizedEdge.value = ''
    transitionEdge.value = ''
    rect.value = clampRect(readStoredRect() || createDefaultRect())
    saveRect()
  })
}, { immediate: true })

onBeforeUnmount(() => {
  stopPointerInteraction?.()
})

function startDrag(event: PointerEvent) {
  if (props.embedded) return
  if (typeof window === 'undefined') return
  if (event.button !== 0) return
  event.preventDefault()
  stopPointerInteraction?.()
  const startX = event.clientX
  const startY = event.clientY
  const startRect = { ...rect.value }
  const handleMove = (moveEvent: PointerEvent) => {
    rect.value = clampRect({
      ...startRect,
      left: startRect.left + moveEvent.clientX - startX,
      top: startRect.top + moveEvent.clientY - startY
    })
  }
  const stop = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    minimizeIfNearHorizontalEdge()
    saveRect()
    stopPointerInteraction = null
  }
  stopPointerInteraction = stop
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function startResize(event: PointerEvent, handle: ResizeHandle) {
  if (typeof window === 'undefined') return
  if (event.button !== 0) return
  event.preventDefault()
  stopPointerInteraction?.()
  const startX = event.clientX
  const startY = event.clientY
  const startRect = { ...rect.value }
  // 方位按 token 判定（批I 支持单边 handle：'top' 只动北缘，不能再用旧的 right/else 二分——
  // 旧逻辑对纯 'top'/'bottom' 会误落西缘分支连带改 left/width）。
  const parts = handle.split('-')
  const north = parts.includes('top')
  const south = parts.includes('bottom')
  const west = parts.includes('left')
  const east = parts.includes('right')
  const handleMove = (moveEvent: PointerEvent) => {
    const deltaX = moveEvent.clientX - startX
    const deltaY = moveEvent.clientY - startY
    const next = { ...startRect }
    if (east) next.width = startRect.width + deltaX
    if (west) {
      // 西/北缘拖动=位置与尺寸同步走；delta 先夹住（不越过最小宽高、不越出容器左/上缘），
      // 防「缩到最小后 left/top 还在走 → 窗口漂移」。
      const d = clamp(deltaX, -startRect.left, startRect.width - props.minWidth)
      next.left = startRect.left + d
      next.width = startRect.width - d
    }
    if (south) next.height = startRect.height + deltaY
    if (north) {
      const d = clamp(deltaY, -startRect.top, startRect.height - props.minHeight)
      next.top = startRect.top + d
      next.height = startRect.height - d
    }
    rect.value = clampRect(next)
  }
  const stop = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    saveRect()
    stopPointerInteraction = null
  }
  stopPointerInteraction = stop
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

/** 签牌自由上下拖动（2026-07-11）：只认竖直位移，横向不动（左右由停靠哪条边决定，不是自由拖）。
 *  用一个"是否发生过真实拖动"的位移阈值，跟随后的 click 事件区分"点一下展开"与"拖一下挪位置"——
 *  浏览器在同一元素上完成 pointerdown→pointerup 后仍会补发 click，不特殊处理会拖完顺带被当成点击展开。 */
function startTabDrag(event: PointerEvent) {
  if (typeof window === 'undefined') return
  if (event.button !== 0) return
  event.preventDefault()
  stopPointerInteraction?.()
  const startY = event.clientY
  const startTop = tabTop.value ?? tabTopFallback()
  tabDragMoved = false
  const handleMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientY - startY
    if (Math.abs(delta) > 3) tabDragMoved = true
    const bounds = getContainerBounds()
    tabTop.value = clamp(startTop + delta, EDGE_TAB_MARGIN, Math.max(EDGE_TAB_MARGIN, bounds.height - EDGE_TAB_HEIGHT - EDGE_TAB_MARGIN))
  }
  const stop = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    if (tabDragMoved) saveTabTop()
    stopPointerInteraction = null
  }
  stopPointerInteraction = stop
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

/** 点签牌展开（2026-07-11 未打开态并入靠边收起态）：已展开只是被拖靠边——本地直接展开；
 *  尚未展开（含从没打开过）——本地没有"之前的窗口"可展开，通知外部把 open 打开，外部 prop 流回来后
 *  上面的 watch(() => props.open, ...) 自然会摆出默认/记忆位置，不需要在这里重复处理。
 *  刚发生过真实拖动时不展开（拖完签牌只是换个位置，不代表想打开窗口）。 */
function handleEdgeClick() {
  if (tabDragMoved) {
    tabDragMoved = false
    return
  }
  if (props.open) {
    restoreFromEdge()
    return
  }
  emit('expand')
}

function restoreFromEdge() {
  const bounds = getContainerBounds()
  const edge = minimizedEdge.value
  transitionEdge.value = edge
  minimizedEdge.value = ''
  rect.value = clampRect({
    ...rect.value,
    left: edge === 'right'
      ? Math.max(12, bounds.width - rect.value.width - 24)
      : 24
  })
  saveRect()
}

function minimizeIfNearHorizontalEdge() {
  if (!props.showCollapsedTab) return
  const bounds = getContainerBounds()
  const edgeThreshold = 10
  if (rect.value.left <= edgeThreshold) {
    transitionEdge.value = 'left'
    minimizedEdge.value = 'left'
    syncTabTopFromRect()
    return
  }
  if (rect.value.left + rect.value.width >= bounds.width - edgeThreshold) {
    transitionEdge.value = 'right'
    minimizedEdge.value = 'right'
    syncTabTopFromRect()
  }
}

/** 拖窗口到边缘自动收起时，把签牌位置记忆同步成窗口当时的位置（覆盖掉之前手动拖签牌留下的位置）——
 *  两种"摆放签牌"的手势（直接拖签牌 / 拖窗口到边缘）共用同一份位置记忆，谁最后动的听谁的。 */
function syncTabTopFromRect() {
  tabTop.value = tabTopFallback()
  saveTabTop()
}

function createDefaultRect(): WindowRect {
  const bounds = getContainerBounds()
  const width = Math.min(props.defaultWidth, Math.max(props.minWidth, bounds.width - 24))
  const height = Math.min(props.defaultHeight, Math.max(props.minHeight, bounds.height - props.defaultTop - 16))
  return {
    left: Math.max(0, bounds.width - width - props.defaultRight),
    top: Math.max(0, Math.min(props.defaultTop, bounds.height - height)),
    width,
    height
  }
}

function clampRect(input: WindowRect): WindowRect {
  const bounds = getContainerBounds()
  const width = clamp(input.width, props.minWidth, Math.max(props.minWidth, bounds.width))
  const height = clamp(input.height, props.minHeight, Math.max(props.minHeight, bounds.height))
  return {
    width,
    height,
    left: clamp(input.left, 0, Math.max(0, bounds.width - width)),
    top: clamp(input.top, 0, Math.max(0, bounds.height - height))
  }
}

function getContainerBounds() {
  if (typeof window !== 'undefined') {
    const workspaceRect = getWorkspaceViewportRect()
    if (workspaceRect) {
      return {
        width: workspaceRect.right,
        height: workspaceRect.bottom
      }
    }
    const root = document.documentElement
    return {
      width: root?.clientWidth || window.innerWidth,
      height: root?.clientHeight || window.innerHeight
    }
  }
  return {
    width: props.defaultWidth,
    height: props.defaultHeight
  }
}

function getWorkspaceViewportRect() {
  if (typeof window === 'undefined') return null
  const workspace = document.querySelector('#app') as HTMLElement | null
  const rect = workspace?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return rect
}

function getViewportLeftInset() {
  if (typeof window === 'undefined') return 0
  const workspaceRect = getWorkspaceViewportRect()
  return workspaceRect ? Math.max(0, workspaceRect.left) : 0
}

function getViewportRightInset() {
  if (typeof window === 'undefined') return 0
  const workspaceRect = getWorkspaceViewportRect()
  if (workspaceRect) return Math.max(0, window.innerWidth - workspaceRect.right)
  const rootWidth = document.documentElement?.clientWidth || window.innerWidth
  return Math.max(0, window.innerWidth - rootWidth)
}

function readStoredRect(): WindowRect | null {
  if (!props.storageKey || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(props.storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WindowRect>
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top) || !Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) {
      return null
    }
    return {
      left: Number(parsed.left),
      top: Number(parsed.top),
      width: Number(parsed.width),
      height: Number(parsed.height)
    }
  } catch {
    return null
  }
}

function saveRect() {
  if (!props.storageKey || typeof window === 'undefined') return
  window.localStorage.setItem(props.storageKey, JSON.stringify(rect.value))
}

function readStoredTabTop(): number | null {
  if (!props.storageKey || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${props.storageKey}::tabTop`)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function saveTabTop() {
  if (!props.storageKey || typeof window === 'undefined' || tabTop.value === null) return
  window.localStorage.setItem(`${props.storageKey}::tabTop`, String(tabTop.value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
</script>

<style scoped>
.floating-workspace-window {
  position: fixed;
  z-index: 96;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 78%, transparent);
  border-radius: 8px;
  background: #fbfaf5;
  box-shadow: 0 18px 42px rgba(67, 77, 58, 0.16);
  color: var(--morandi-text, #364034);
  overflow: hidden;
  transform-origin: center center;
}

.floating-workspace-window--embedded {
  position: relative;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  animation: none;
}

.floating-workspace-window--embedded .floating-workspace-window__header {
  cursor: default;
}

.floating-workspace-window--edge-left {
  transform-origin: left center;
}

.floating-workspace-window--edge-right {
  transform-origin: right center;
}

/* 靠边收起态（2026-07-11 统一为书签签牌样式）：外观与全局收起入口 .xingyi-launcher（XingyiDock.vue）对齐
   ——同款尺寸/圆角/阴影/token 底色，联动标注：改这里的形状语言时另一处也要同步。
   背景改用 --morandi-card token 而非硬编码色，靠自身 data-theme 属性（星依浮坞私有主题透传）自动重解析深浅色，
   不再需要单独的深色硬编码底色覆盖。 */
.floating-workspace-window__edge-tab {
  position: fixed;
  z-index: 96;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 46px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 90%, transparent);
  background: var(--morandi-card, #fffdf8);
  box-shadow: 0 3px 10px rgba(56, 46, 38, 0.08), var(--lh-edge-light, inset 0 1px 0 rgba(255, 255, 255, 0.55));
  color: var(--morandi-text-light, #6c7468);
  cursor: grab;
  touch-action: none;
  transition: box-shadow var(--lh-dur, 0.18s) ease, background var(--lh-dur, 0.18s) ease;
}

.floating-workspace-window__edge-tab:active {
  cursor: grabbing;
}

.floating-workspace-window-shift-enter-active,
.floating-workspace-window-shift-leave-active {
  transition:
    opacity 240ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.floating-workspace-window-shift-enter-from,
.floating-workspace-window-shift-leave-to {
  opacity: 0;
  filter: blur(1px);
}

.floating-workspace-window-shift-enter-from.floating-workspace-window {
  transform: scale(0.985);
}

.floating-workspace-window-shift-leave-to.floating-workspace-window {
  transform: scaleX(0.06) scaleY(0.28);
}

.floating-workspace-window-shift-enter-from.floating-workspace-window__edge-tab,
.floating-workspace-window-shift-leave-to.floating-workspace-window__edge-tab {
  transform: scaleY(0.72);
}

.floating-workspace-window__edge-tab--left {
  border-left: 0;
  border-radius: 0 10px 10px 0;
}

.floating-workspace-window__edge-tab--right {
  border-right: 0;
  border-radius: 10px 0 0 10px;
}

.floating-workspace-window__edge-tab span {
  max-height: 38px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  writing-mode: vertical-rl;
}

.floating-workspace-window__edge-tab:hover {
  background: var(--morandi-hover, #f3eee6);
  box-shadow: var(--lh-glow-accent-rest, 0 0 0 1px rgba(92, 138, 92, 0.32)), 0 3px 10px rgba(56, 46, 38, 0.08);
  color: var(--morandi-text, #364034);
}

.floating-workspace-window__header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 70%, transparent);
  background: color-mix(in srgb, var(--langhuan-paper-bg, #faf8f0) 90%, var(--morandi-bg, #edf0e8) 10%);
  cursor: move;
  user-select: none;
}

.floating-workspace-window__title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.floating-workspace-window__tools {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.floating-workspace-window__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #6c7468);
  cursor: pointer;
}

.floating-workspace-window__tool:hover {
  background: color-mix(in srgb, var(--morandi-border, #cfd7c8) 34%, transparent);
  color: var(--morandi-text, #364034);
}

.floating-workspace-window__tool svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.floating-workspace-window__body {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: #fbfaf5;
  overflow: hidden;
}

/* 按窗主题换肤（2026-07-11 星依浮坞私有主题）：仅当使用方把 data-theme 直接挂到本窗根上时生效
   （attr 透传，目前只有 XingyiDock 传）。token 色自动跟随该属性重解析，这里只补硬编码亮色的三处：
   窗体底 / 正文底 / 边缘签。不挂属性的浮窗完全不受影响。 */
.floating-workspace-window[data-theme='dark'] {
  background: var(--morandi-bg, #2a2825);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
}

.floating-workspace-window[data-theme='dark'] .floating-workspace-window__body {
  background: var(--morandi-bg, #2a2825);
}

.floating-workspace-window__edge-tab[data-theme='dark'] {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4), var(--lh-edge-light, inset 0 1px 0 rgba(255, 255, 255, 0.06));
}

.floating-workspace-window__edge-tab[data-theme='dark']:hover {
  background: var(--morandi-hover, #4d4741);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
}

.floating-workspace-window__resize {
  position: absolute;
  z-index: 2;
  width: 14px;
  height: 14px;
}

.floating-workspace-window__resize--top-left {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.floating-workspace-window__resize--top-right {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.floating-workspace-window__resize--bottom-left {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

.floating-workspace-window__resize--bottom-right {
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
}

/* 四条边 handle（批I·2026-07-12；批M1 收窄 7px→4px）：4px 命中条贴最外缘，两端避让 14px 角块
   （角优先吃对角光标）。收窄原因（批M1 真机反馈）：窗根 overflow:hidden 会把窗外部分裁掉且吃不到
   pointer 事件（骑跨边框方案不可行），而 7px 窗内条盖死坞内容区的 6px 纵向滚动条——改 4px 并配合
   XingyiDock 消息区 margin-right:4px（滚动条整体内移），拖拽条与滚动条互不侵占（联动：改这里的
   宽度口径，XingyiDock .xingyi-dock__messages 的让位 margin 也要同步）。
   顶边条只占窗口最上 4px，标题栏（36px 高）其余区域仍是拖动移动，不会被误触。 */
.floating-workspace-window__resize--top,
.floating-workspace-window__resize--bottom {
  left: 14px;
  right: 14px;
  width: auto;
  height: 4px;
  cursor: ns-resize;
}

.floating-workspace-window__resize--top {
  top: 0;
}

.floating-workspace-window__resize--bottom {
  bottom: 0;
}

.floating-workspace-window__resize--left,
.floating-workspace-window__resize--right {
  top: 14px;
  bottom: 14px;
  width: 4px;
  height: auto;
  cursor: ew-resize;
}

.floating-workspace-window__resize--left {
  left: 0;
}

.floating-workspace-window__resize--right {
  right: 0;
}

@media (prefers-reduced-motion: reduce) {
  .floating-workspace-window__edge-tab {
    transition: none;
  }
}
</style>
