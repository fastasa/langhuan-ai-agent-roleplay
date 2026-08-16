<template>
  <AppModalShell
    :open="open"
    :title="title"
    :subtitle="message"
    :size="size"
    :height-preset="heightPreset"
    :z-index="zIndex"
    :body-compact="true"
    @close="$emit('cancel')"
  >
    <slot />
    <template #actions>
      <button type="button" class="app-confirm-dialog__btn app-confirm-dialog__btn--secondary" @click="$emit('cancel')">
        {{ cancelText ?? t('common.cancel') }}
      </button>
      <button type="button" class="app-confirm-dialog__btn app-confirm-dialog__btn--primary" @click="handleConfirmClick">
        {{ confirmText ?? t('common.confirm') }}
      </button>
    </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppModalShell from './AppModalShell.vue'

const { t } = useI18n()

// confirmText/cancelText 不传时回退到公共词典（common.confirm / common.cancel），随语言切换本地化
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'warning' | 'default'
  size?: 'sm' | 'md'
  heightPreset?: 'default' | 'tall'
  zIndex?: number | string
  confirmAction?: () => void
}>(), {
  tone: 'default',
  size: 'sm',
  heightPreset: 'default',
  zIndex: 13080
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function handleConfirmClick() {
  props.confirmAction?.()
  emit('confirm')
}
</script>

<style scoped>
.app-confirm-dialog__btn {
  min-width: 112px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.app-confirm-dialog__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.app-confirm-dialog__btn--secondary:hover:not(:disabled) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.app-confirm-dialog__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  color: #fff;
  background: var(--langhuan-dialog-primary-bg, #4f867c);
}

.app-confirm-dialog__btn--primary:hover:not(:disabled) {
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67);
  background: var(--langhuan-dialog-primary-bg-hover, #416f67);
}

.app-confirm-dialog__btn--primary:disabled {
  border-color: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1);
  background: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1);
}

.app-confirm-dialog__btn:focus-visible {
  outline: 2px solid var(--langhuan-dialog-focus-ring, rgba(79, 134, 124, 0.32));
  outline-offset: 2px;
}
</style>
