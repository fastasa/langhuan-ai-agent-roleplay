<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="app-modal-shell__overlay"
      :style="{ zIndex }"
      @pointerdown.capture="overlayDismissGuard.handleOverlayPointerDown"
      @click.self="handleOverlayClose"
    >
      <div
        class="app-modal-shell"
        :class="[`app-modal-shell--${size}`, `app-modal-shell--height-${heightPreset}`]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        :aria-label="!title && ariaLabel ? ariaLabel : undefined"
      >
        <header v-if="title || subtitle || showClose" class="app-modal-shell__header">
          <div class="app-modal-shell__heading-wrap">
            <span v-if="$slots['title-icon']" class="app-modal-shell__title-glyph">
              <slot name="title-icon" />
            </span>
            <img
              v-else-if="titleIconSrc"
              class="app-modal-shell__title-icon"
              :src="titleIconSrc"
              :alt="titleIconAlt"
            >
            <div class="app-modal-shell__heading">
              <div v-if="title" :id="titleId" class="app-modal-shell__title">{{ title }}</div>
              <div v-if="subtitle || $slots['header-actions']" class="app-modal-shell__subtitle-row">
                <div v-if="subtitle" class="app-modal-shell__subtitle">{{ subtitle }}</div>
                <div v-if="$slots['header-actions']" class="app-modal-shell__header-actions">
                  <slot name="header-actions" />
                </div>
              </div>
            </div>
          </div>
          <button
            v-if="showClose"
            type="button"
            class="app-modal-shell__close"
            :disabled="closeDisabled"
            aria-label="关闭"
            @click="handleClose"
          >
            <svg class="app-modal-shell__close-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <div
          class="app-modal-shell__body"
          :class="{
            'app-modal-shell__body--compact': bodyCompact,
            'app-modal-shell__body--flush': bodyFlush
          }"
        >
          <slot />
        </div>

        <footer v-if="$slots.actions" class="app-modal-shell__actions">
          <slot name="actions" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { createOverlayDismissGuard } from '../../utils/overlayDismissGuard'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  ariaLabel?: string
  subtitle?: string
  titleIconSrc?: string
  titleIconAlt?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'workspace'
  heightPreset?: 'default' | 'tall'
  showClose?: boolean
  closeOnOverlay?: boolean
  closeDisabled?: boolean
  bodyCompact?: boolean
  bodyFlush?: boolean
  zIndex?: number | string
}>(), {
  title: '',
  ariaLabel: '',
  subtitle: '',
  titleIconSrc: '',
  titleIconAlt: '',
  size: 'md',
  heightPreset: 'default',
  showClose: true,
  closeOnOverlay: true,
  closeDisabled: false,
  bodyCompact: false,
  bodyFlush: false,
  zIndex: 13000
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const titleId = `app-modal-shell-title-${Math.random().toString(36).slice(2, 8)}`
const overlayDismissGuard = createOverlayDismissGuard()

function handleOverlayClose(event: MouseEvent) {
  if (!props.closeDisabled && props.closeOnOverlay && overlayDismissGuard.shouldDismissFromOverlayClick(event)) {
    emit('close')
  }
}

function handleClose() {
  if (!props.closeDisabled) emit('close')
}
</script>

<style scoped>
.app-modal-shell__overlay {
  position: fixed;
  inset: 0;
  z-index: 13000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--langhuan-dialog-overlay, rgba(72, 68, 63, 0.18));
  backdrop-filter: blur(6px);
  /* 遮罩淡入；keyframes 定义在 main.css「动效与光效」节（2026-07-10 设计系统同步，属联动应用点） */
  animation: lh-fade var(--lh-dur, 0.18s) ease;
}

.app-modal-shell {
  width: min(560px, calc(100vw - 32px));
  max-height: min(74vh, 640px);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(201, 199, 194, 0.96);
  border-radius: 22px;
  background: var(--langhuan-dialog-surface, #f3f2ef);
  box-shadow: 0 22px 56px rgba(72, 58, 47, 0.12);
  color: var(--morandi-text, #4f463f);
  overflow: hidden;
  /* 弹窗绽放入场：上移 10px + 0.97 缩放淡入，带一丝过冲 */
  animation: lh-modal-in var(--lh-dur-slow, 0.3s) var(--lh-ease-bloom, ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .app-modal-shell__overlay,
  .app-modal-shell {
    animation: none;
  }
}

.app-modal-shell--sm {
  width: min(420px, calc(100vw - 32px));
}

.app-modal-shell--lg {
  width: min(720px, calc(100vw - 32px));
}

.app-modal-shell--xl {
  width: min(1080px, calc(100vw - 32px));
  max-height: min(86vh, 820px);
}

.app-modal-shell--workspace {
  width: min(1760px, calc(100vw - 36px));
  height: min(960px, calc(100vh - 36px));
  max-height: calc(100vh - 36px);
  border-radius: 18px;
}

.app-modal-shell--workspace .app-modal-shell__body {
  flex: 1 1 auto;
  overflow: hidden;
}

.app-modal-shell--height-tall {
  max-height: min(91vh, 900px);
}

.app-modal-shell--xl.app-modal-shell--height-tall {
  max-height: min(93vh, 960px);
}

.app-modal-shell--workspace.app-modal-shell--height-tall {
  max-height: calc(100vh - 36px);
}

.app-modal-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 0;
}

.app-modal-shell__heading-wrap {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-modal-shell__title-icon {
  width: 60px;
  height: 60px;
  flex: 0 0 60px;
  object-fit: contain;
  transform: rotate(5deg);
  transform-origin: center;
}

/* 内联线性图标（无底色），用于标题左侧的小图标。
   尺寸/描边由 svg 自身的内联属性决定；这里只负责定位与颜色（color 会跨插槽继承到 stroke:currentColor）。 */
.app-modal-shell__title-glyph {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--morandi-accent, #5c8a5c);
}

.app-modal-shell__heading {
  min-width: 0;
  flex: 1 1 auto;
}

.app-modal-shell__title {
  font-size: 1.08rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--morandi-text, #4f463f);
}

.app-modal-shell__subtitle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 6px;
}

.app-modal-shell__subtitle {
  min-width: 0;
  flex: 1 1 auto;
  margin-top: 6px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.92rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.app-modal-shell__subtitle-row > .app-modal-shell__subtitle {
  margin-top: 0;
}

.app-modal-shell__header-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 18px;
}

.app-modal-shell__close {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(104, 96, 88, 0.82);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.app-modal-shell__close:hover {
  background: rgba(130, 153, 135, 0.08);
  color: var(--morandi-text, #4f463f);
}

.app-modal-shell__close:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.app-modal-shell__close-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-modal-shell__body {
  min-height: 0;
  overflow: auto;
  padding: 18px 24px 0;
}

.app-modal-shell__body :deep(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
.app-modal-shell__body :deep(select),
.app-modal-shell__body :deep(textarea) {
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.app-modal-shell__body :deep(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus),
.app-modal-shell__body :deep(select:focus),
.app-modal-shell__body :deep(textarea:focus) {
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.app-modal-shell__body--compact {
  padding-top: 10px;
}

.app-modal-shell__body--flush {
  padding: 0;
}

.app-modal-shell__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 18px 24px 24px;
}

.app-modal-shell__actions :slotted(.btn) {
  min-width: 112px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 600;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.app-modal-shell__actions :slotted(.btn-secondary),
.app-modal-shell__actions :slotted(.btn-danger),
.app-modal-shell__actions :slotted(.btn-warning),
.app-modal-shell__actions :slotted(.btn-info) {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86) !important;
  background: var(--langhuan-dialog-secondary-bg, #efe5d8) !important;
  color: var(--langhuan-dialog-secondary-text, #4f4034) !important;
  box-shadow: none !important;
}

.app-modal-shell__actions :slotted(.btn-secondary:hover:not(:disabled)),
.app-modal-shell__actions :slotted(.btn-danger:hover:not(:disabled)),
.app-modal-shell__actions :slotted(.btn-warning:hover:not(:disabled)),
.app-modal-shell__actions :slotted(.btn-info:hover:not(:disabled)) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4) !important;
}

.app-modal-shell__actions :slotted(.btn-primary),
.app-modal-shell__actions :slotted(.btn-success) {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c) !important;
  background: var(--langhuan-dialog-primary-bg, #4f867c) !important;
  color: #fff !important;
  box-shadow: none !important;
}

.app-modal-shell__actions :slotted(.btn-primary:hover:not(:disabled)),
.app-modal-shell__actions :slotted(.btn-success:hover:not(:disabled)) {
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67) !important;
  background: var(--langhuan-dialog-primary-bg-hover, #416f67) !important;
}

.app-modal-shell__actions :slotted(.btn-primary:disabled),
.app-modal-shell__actions :slotted(.btn-success:disabled) {
  border-color: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1) !important;
  background: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1) !important;
  color: #fff !important;
}

@media (max-width: 640px) {
  .app-modal-shell__overlay {
    padding: 12px;
    align-items: center;
  }

  .app-modal-shell {
    width: min(92vw, 560px);
    max-height: min(76vh, 640px);
    border-radius: 18px;
  }

  .app-modal-shell--height-tall,
  .app-modal-shell--xl.app-modal-shell--height-tall {
    max-height: min(90vh, 760px);
  }

  .app-modal-shell--sm {
    width: min(88vw, 400px);
  }

  .app-modal-shell--lg {
    width: min(94vw, 620px);
  }

  .app-modal-shell--workspace {
    width: calc(100vw - 24px);
    height: min(90vh, 760px);
    max-height: min(90vh, 760px);
  }

  .app-modal-shell__header,
  .app-modal-shell__body,
  .app-modal-shell__actions {
    padding-left: 18px;
    padding-right: 18px;
  }

  .app-modal-shell__actions {
    flex-direction: column-reverse;
  }

  .app-modal-shell__subtitle-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
