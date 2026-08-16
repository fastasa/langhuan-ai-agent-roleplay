<template>
  <AppModalShell
    :open="open"
    :title="title"
    :subtitle="subtitle"
    :size="size"
    :body-compact="true"
    @close="$emit('cancel')"
  >
    <slot name="search" />

    <div class="app-choice-dialog__list">
      <button
        v-for="item in options"
        :key="item.id"
        type="button"
        class="app-choice-dialog__item"
        :class="{ 'app-choice-dialog__item--active': selectedId === item.id }"
        :disabled="disabled || loading"
        @click="$emit('select', item.id)"
      >
        <span v-if="item.badge" class="app-choice-dialog__badge">{{ item.badge }}</span>
        <span class="app-choice-dialog__main">
          <span class="app-choice-dialog__label">{{ item.label }}</span>
          <span v-if="item.description" class="app-choice-dialog__description">{{ item.description }}</span>
        </span>
      </button>

      <div v-if="options.length === 0" class="app-choice-dialog__empty">
        {{ emptyText }}
      </div>
    </div>

    <template #actions>
      <button type="button" class="app-choice-dialog__btn app-choice-dialog__btn--secondary" :disabled="loading" @click="$emit('cancel')">
        {{ cancelText }}
      </button>
      <button
        type="button"
        class="app-choice-dialog__btn app-choice-dialog__btn--primary"
        :disabled="disabled || confirmDisabled || loading"
        @click="$emit('confirm')"
      >
        {{ loading ? loadingText : confirmText }}
      </button>
    </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import AppModalShell from './AppModalShell.vue'

export type AppChoiceDialogOption = {
  id: string
  label: string
  description?: string
  badge?: string
}

withDefaults(defineProps<{
  open: boolean
  title: string
  subtitle?: string
  options: AppChoiceDialogOption[]
  selectedId?: string
  emptyText?: string
  cancelText?: string
  confirmText?: string
  loadingText?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  confirmDisabled?: boolean
  loading?: boolean
}>(), {
  subtitle: '',
  selectedId: '',
  emptyText: '暂无可选项',
  cancelText: '取消',
  confirmText: '确认',
  loadingText: '处理中...',
  size: 'md',
  disabled: false,
  confirmDisabled: false,
  loading: false
})

defineEmits<{
  (e: 'select', id: string): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<style scoped>
.app-choice-dialog__list {
  display: grid;
  gap: 10px;
  max-height: 320px;
  overflow: auto;
}

.app-choice-dialog__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  border: 1px solid rgba(198, 196, 191, 0.92);
  border-radius: 14px;
  background: color-mix(in srgb, var(--morandi-card) 84%, transparent);
  color: var(--morandi-text, #4f463f);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}

.app-choice-dialog__item:hover {
  transform: translateY(-1px);
  border-color: rgba(130, 153, 135, 0.45);
  box-shadow: 0 10px 22px rgba(78, 66, 55, 0.08);
}

.app-choice-dialog__item--active {
  border-color: rgba(130, 153, 135, 0.72);
  background: color-mix(in srgb, var(--morandi-accent) 20%, var(--morandi-card));
  box-shadow: 0 12px 24px rgba(78, 66, 55, 0.1);
}

.app-choice-dialog__item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.app-choice-dialog__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 999px;
  background: rgba(139, 115, 85, 0.12);
  color: var(--morandi-primary, #8b7355);
  font-size: 0.82rem;
  font-weight: 600;
}

.app-choice-dialog__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-choice-dialog__label {
  font-size: 0.96rem;
  font-weight: 600;
  line-height: 1.45;
}

.app-choice-dialog__description {
  margin-top: 3px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.8rem;
  line-height: 1.5;
  word-break: break-all;
}

.app-choice-dialog__empty {
  padding: 18px 14px;
  border: 1px dashed rgba(139, 115, 85, 0.22);
  border-radius: 14px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text-light, #7b746b);
  text-align: center;
}

.app-choice-dialog__btn {
  min-width: 112px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.app-choice-dialog__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-choice-dialog__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.app-choice-dialog__btn--secondary:hover:not(:disabled) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.app-choice-dialog__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.app-choice-dialog__btn--primary:hover:not(:disabled) {
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67);
  background: var(--langhuan-dialog-primary-bg-hover, #416f67);
}

.app-choice-dialog__btn--primary:disabled {
  border-color: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1);
  background: var(--langhuan-dialog-primary-disabled-bg, #9bb8b1);
}
</style>
