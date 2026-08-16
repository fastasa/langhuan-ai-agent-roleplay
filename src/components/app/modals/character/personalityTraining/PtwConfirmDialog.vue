<template>
  <AppModalShell
    :open="open"
    :title="title"
    size="sm"
    :z-index="zIndex"
    body-compact
    @close="$emit('cancel')"
  >
    <div class="ptw-confirm__body">
      <p class="ptw-confirm__message"><slot>{{ message }}</slot></p>
      <input
        v-if="requireType"
        v-model="typed"
        class="ptw-confirm__input"
        :placeholder="`输入「${requireType}」以确认`"
      >
    </div>
    <template #actions>
      <button type="button" class="ptw-confirm__btn ptw-confirm__btn--secondary" @click="$emit('cancel')">
        {{ cancelText }}
      </button>
      <button
        type="button"
        class="ptw-confirm__btn ptw-confirm__btn--primary"
        :class="{ 'ptw-confirm__btn--danger': danger }"
        :disabled="!canConfirm"
        @click="$emit('confirm')"
      >
        {{ confirmText }}
      </button>
    </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModalShell from '../../../../common/AppModalShell.vue'

// 工作台内二次确认弹窗：在 AppModalShell 原语上补充“输入指定文字才能确认”的强确认形态。
// 与 AppConfirmDialog 属于联动能力（按钮样式一致）；若用户要求统一改确认弹窗样式，两处要同步。
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  requireType?: string
  zIndex?: number | string
}>(), {
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  requireType: '',
  zIndex: 13180
})

defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const typed = ref('')
const canConfirm = computed(() => !props.requireType || typed.value === props.requireType)

watch(() => props.open, (open) => {
  if (open) typed.value = ''
})
</script>

<style scoped>
.ptw-confirm__body {
  display: grid;
  gap: 12px;
  padding-bottom: 6px;
}

.ptw-confirm__message {
  margin: 0;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.9rem;
  line-height: 1.65;
}

.ptw-confirm__message :deep(b) {
  color: var(--morandi-text, #4f463f);
  font-weight: 600;
}

.ptw-confirm__input {
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text, #4f463f);
  font-size: 0.88rem;
}

.ptw-confirm__input:focus {
  outline: none;
  border-color: rgba(128, 140, 136, 0.78);
}

.ptw-confirm__btn {
  min-width: 112px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.ptw-confirm__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.ptw-confirm__btn--secondary:hover {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.ptw-confirm__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-bg, #525e43);
  background: var(--langhuan-dialog-primary-bg, #525e43);
  color: #fff;
}

.ptw-confirm__btn--primary:hover:not(:disabled) {
  background: var(--langhuan-dialog-primary-bg-hover, #46503a);
}

.ptw-confirm__btn--danger {
  border-color: #c0665a;
  background: #c0665a;
}

.ptw-confirm__btn--danger:hover:not(:disabled) {
  background: #ad594e;
}

.ptw-confirm__btn--primary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
