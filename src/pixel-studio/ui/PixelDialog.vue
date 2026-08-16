<template>
  <div class="pixel-dialog-mask" :class="{ 'pixel-dialog-mask--modeless': modeless }" @click.self="onBackdropClick">
    <div ref="dialogEl" class="pixel-dialog" :style="dialogStyle">
      <div
        class="pixel-dialog__header"
        :class="{ 'pixel-dialog__header--draggable': draggable }"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span>{{ title }}</span>
        <button type="button" class="pixel-dialog__close" @click="$emit('close')">×</button>
      </div>
      <div class="pixel-dialog__body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="pixel-dialog__footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
// 弹窗（新建文档/导入图片/导出 PNG/快捷键设置）共用骨架：遮罩 + 卡片 + 头部 + 关闭按钮 + 内容区 + 可选底部按钮区。
// 打开文档已由全屏 ProjectLibrary 取代，不再走本弹窗骨架。
// modeless+draggable 供需要对照画布的工具窗使用；普通弹窗仍保持遮罩和点击遮罩关闭。
const props = withDefaults(defineProps<{
  title: string
  width?: string
  modeless?: boolean
  draggable?: boolean
  closeOnBackdrop?: boolean
}>(), { width: '420px', modeless: false, draggable: false, closeOnBackdrop: true })
const emit = defineEmits<{ (e: 'close'): void }>()
const dialogEl = ref<HTMLDivElement | null>(null)
const dragOffset = ref({ x: 0, y: 0 })
let dragPointerId: number | null = null
let dragLast = { x: 0, y: 0 }
const dialogStyle = computed(() => ({
  width: `min(${props.width}, 90vw)`,
  transform: `translate(${dragOffset.value.x}px, ${dragOffset.value.y}px)`
}))

function onBackdropClick() {
  if (props.closeOnBackdrop) emit('close')
}
function onDragStart(e: PointerEvent) {
  if (!props.draggable || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
  dragPointerId = e.pointerId
  dragLast = { x: e.clientX, y: e.clientY }
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  e.preventDefault()
}
function onDragMove(e: PointerEvent) {
  if (dragPointerId !== e.pointerId) return
  const dialog = dialogEl.value
  if (!dialog) return
  const rect = dialog.getBoundingClientRect()
  const rawDx = e.clientX - dragLast.x
  const rawDy = e.clientY - dragLast.y
  const dx = Math.max(8 - rect.left, Math.min(rawDx, window.innerWidth - 8 - rect.right))
  const dy = Math.max(8 - rect.top, Math.min(rawDy, window.innerHeight - 8 - rect.bottom))
  dragOffset.value = { x: dragOffset.value.x + dx, y: dragOffset.value.y + dy }
  dragLast = { x: e.clientX, y: e.clientY }
}
function onDragEnd(e: PointerEvent) {
  if (dragPointerId !== e.pointerId) return
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  dragPointerId = null
}
</script>

<style>
/* 骨架样式故意不用 scoped：footer/默认 slot 内容归属调用方组件的样式作用域，
   scoped 规则打不到从父组件插槽传入的元素（如各弹窗footer里的确认按钮），必须走全局可见的类名。 */
.pixel-dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.pixel-dialog-mask--modeless {
  background: transparent;
  pointer-events: none;
}
.pixel-dialog-mask--modeless .pixel-dialog {
  pointer-events: auto;
}
.pixel-dialog {
  /* 界面 90% 密度化：chrome 统一缩放，联动说明见 MenuBar.vue .menu-bar；已知小取舍=可拖弹窗的拖动位移与光标有 10% 系数 */
  zoom: 0.9;
  background: var(--ps-bg-panel, #fffefb);
  color: var(--ps-text, #2b2c30);
  border-radius: 10px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.pixel-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--ps-border, rgba(0, 0, 0, 0.08));
}
.pixel-dialog__header--draggable {
  cursor: move;
  touch-action: none;
  user-select: none;
}
.pixel-dialog__close {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.pixel-dialog__body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.pixel-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--ps-border, rgba(0, 0, 0, 0.08));
}
.pixel-dialog__primary {
  background: var(--ps-accent-bg, #5c8a5c);
  color: var(--ps-accent-text, #ffffff);
  border: none;
  border-radius: 4px;
  font-weight: 600;
  padding: 4px 12px;
}
.pixel-dialog__primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
