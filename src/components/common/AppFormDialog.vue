<template>
  <AppModalShell
    :open="open"
    :title="title"
    :subtitle="subtitle"
    :title-icon-src="titleIconSrc"
    :title-icon-alt="titleIconAlt"
    :size="size"
    :height-preset="heightPreset"
    :body-compact="bodyCompact"
    :z-index="zIndex"
    @close="$emit('cancel')"
  >
    <template v-if="$slots['title-icon']" #title-icon>
      <slot name="title-icon" />
    </template>

    <template v-if="$slots['header-actions']" #header-actions>
      <slot name="header-actions" />
    </template>

    <div class="app-form-dialog__content">
      <slot />
    </div>

    <template #actions>
      <div class="app-form-dialog__actions">
        <slot name="actions">
          <button type="button" class="app-form-dialog__btn app-form-dialog__btn--secondary" @click="$emit('cancel')">
            {{ cancelText }}
          </button>
          <button type="button" class="app-form-dialog__btn app-form-dialog__btn--primary" :disabled="submitDisabled" @click="$emit('submit')">
            {{ submitText }}
          </button>
        </slot>
      </div>
    </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import AppModalShell from './AppModalShell.vue'

withDefaults(defineProps<{
  open: boolean
  title: string
  subtitle?: string
  titleIconSrc?: string
  titleIconAlt?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  heightPreset?: 'default' | 'tall'
  bodyCompact?: boolean
  zIndex?: number | string
  cancelText?: string
  submitText?: string
  submitDisabled?: boolean
}>(), {
  subtitle: '',
  titleIconSrc: '',
  titleIconAlt: '',
  size: 'md',
  heightPreset: 'default',
  bodyCompact: false,
  zIndex: 13000,
  cancelText: '取消',
  submitText: '保存',
  submitDisabled: false
})

defineEmits<{
  (e: 'cancel'): void
  (e: 'submit'): void
}>()
</script>

<style scoped>
.app-form-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.app-form-dialog__content {
  display: grid;
  gap: 16px;
}

.app-form-dialog__btn {
  min-width: 112px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.app-form-dialog__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-form-dialog__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.app-form-dialog__btn--secondary:hover:not(:disabled) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.app-form-dialog__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.app-form-dialog__btn--primary:hover:not(:disabled) {
  background: var(--langhuan-dialog-primary-bg-hover, #416f67);
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67);
}

.app-form-dialog__btn--primary:disabled {
  background: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1);
  border-color: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1);
}

.app-form-dialog__btn:focus-visible {
  outline: 2px solid var(--langhuan-dialog-focus-ring, rgba(79, 134, 124, 0.32));
  outline-offset: 2px;
}

.app-form-dialog__content :deep(.form-group input),
.app-form-dialog__content :deep(.form-group select),
.app-form-dialog__content :deep(.form-group textarea) {
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.app-form-dialog__content :deep(.form-group input:focus),
.app-form-dialog__content :deep(.form-group select:focus),
.app-form-dialog__content :deep(.form-group textarea:focus) {
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.app-form-dialog__content :deep(input),
.app-form-dialog__content :deep(select),
.app-form-dialog__content :deep(textarea) {
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.app-form-dialog__actions :deep(.btn-primary),
.app-form-dialog__actions :deep(.btn-success),
.app-form-dialog__actions :deep(.leaf-docs__primary-btn),
.app-form-dialog__actions :deep(.prompt-library__primary-btn),
.app-form-dialog__actions :deep(.role-brain-tree-dialog-action--primary),
.app-form-dialog__actions :deep(.new-character-flow-action--primary),
.app-form-dialog__actions :deep(.compile-dialog__footer-btn--primary),
.app-form-dialog__actions :deep(.starter-sync-btn:not(.starter-sync-btn--ghost)) {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c) !important;
  background: var(--langhuan-dialog-primary-bg, #4f867c) !important;
  color: #fff !important;
  box-shadow: none !important;
}

.app-form-dialog__actions :deep(.btn-primary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.btn-success:hover:not(:disabled)),
.app-form-dialog__actions :deep(.leaf-docs__primary-btn:hover:not(:disabled)),
.app-form-dialog__actions :deep(.prompt-library__primary-btn:hover:not(:disabled)),
.app-form-dialog__actions :deep(.role-brain-tree-dialog-action--primary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.new-character-flow-action--primary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.compile-dialog__footer-btn--primary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.starter-sync-btn:not(.starter-sync-btn--ghost):hover:not(:disabled)) {
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67) !important;
  background: var(--langhuan-dialog-primary-bg-hover, #416f67) !important;
}

.app-form-dialog__actions :deep(.btn-primary:disabled),
.app-form-dialog__actions :deep(.btn-success:disabled),
.app-form-dialog__actions :deep(.leaf-docs__primary-btn:disabled),
.app-form-dialog__actions :deep(.prompt-library__primary-btn:disabled),
.app-form-dialog__actions :deep(.role-brain-tree-dialog-action--primary:disabled),
.app-form-dialog__actions :deep(.new-character-flow-action--primary:disabled),
.app-form-dialog__actions :deep(.compile-dialog__footer-btn--primary:disabled),
.app-form-dialog__actions :deep(.starter-sync-btn:not(.starter-sync-btn--ghost):disabled) {
  border-color: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1) !important;
  background: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1) !important;
  color: #fff !important;
}

.app-form-dialog__actions :deep(.btn-secondary),
.app-form-dialog__actions :deep(.btn-danger),
.app-form-dialog__actions :deep(.btn-warning),
.app-form-dialog__actions :deep(.btn-info),
.app-form-dialog__actions :deep(.leaf-docs__secondary-btn),
.app-form-dialog__actions :deep(.prompt-library__secondary-btn),
.app-form-dialog__actions :deep(.role-brain-tree-dialog-action--secondary),
.app-form-dialog__actions :deep(.new-character-flow-action--secondary),
.app-form-dialog__actions :deep(.compile-dialog__footer-btn),
.app-form-dialog__actions :deep(.starter-sync-btn--ghost) {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86) !important;
  background: var(--langhuan-dialog-secondary-bg, #efe5d8) !important;
  color: var(--langhuan-dialog-secondary-text, #4f4034) !important;
  box-shadow: none !important;
}

.app-form-dialog__actions :deep(.btn-secondary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.btn-danger:hover:not(:disabled)),
.app-form-dialog__actions :deep(.btn-warning:hover:not(:disabled)),
.app-form-dialog__actions :deep(.btn-info:hover:not(:disabled)),
.app-form-dialog__actions :deep(.leaf-docs__secondary-btn:hover:not(:disabled)),
.app-form-dialog__actions :deep(.prompt-library__secondary-btn:hover:not(:disabled)),
.app-form-dialog__actions :deep(.role-brain-tree-dialog-action--secondary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.new-character-flow-action--secondary:hover:not(:disabled)),
.app-form-dialog__actions :deep(.compile-dialog__footer-btn:hover:not(:disabled)),
.app-form-dialog__actions :deep(.starter-sync-btn--ghost:hover:not(:disabled)) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4) !important;
}

.app-form-dialog__actions :deep(.btn-secondary:disabled),
.app-form-dialog__actions :deep(.btn-danger:disabled),
.app-form-dialog__actions :deep(.btn-warning:disabled),
.app-form-dialog__actions :deep(.btn-info:disabled),
.app-form-dialog__actions :deep(.leaf-docs__secondary-btn:disabled),
.app-form-dialog__actions :deep(.prompt-library__secondary-btn:disabled),
.app-form-dialog__actions :deep(.role-brain-tree-dialog-action--secondary:disabled),
.app-form-dialog__actions :deep(.new-character-flow-action--secondary:disabled),
.app-form-dialog__actions :deep(.compile-dialog__footer-btn:disabled),
.app-form-dialog__actions :deep(.starter-sync-btn--ghost:disabled) {
  border-color: color-mix(in srgb, var(--langhuan-dialog-secondary-border, #b69f86) 55%, #ffffff 45%) !important;
  background: color-mix(in srgb, var(--langhuan-dialog-secondary-bg, #efe5d8) 64%, #ffffff 36%) !important;
  color: color-mix(in srgb, var(--langhuan-dialog-secondary-text, #4f4034) 55%, #ffffff 45%) !important;
}
</style>
