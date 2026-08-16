<template>
  <AppModalShell
    :open="open"
    :title="title"
    :subtitle="''"
    size="lg"
    :body-compact="true"
    @close="$emit('cancel')"
  >
    <div class="app-move-dialog">
      <div class="app-move-dialog__search">
        <div class="app-move-dialog__selected">
          <span class="app-move-dialog__label">{{ $t('docLibrary.moveDialog.currentSelected') }}</span>
          <div class="app-move-dialog__chips">
            <span v-for="item in sourceLabels" :key="item" class="app-move-dialog__chip">{{ item }}</span>
            <span v-if="!sourceLabels.length" class="app-move-dialog__hint">{{ $t('docLibrary.moveDialog.empty') }}</span>
          </div>
        </div>
        <div class="app-move-dialog__search-row">
          <input
            :value="pathInput"
            class="app-move-dialog__input"
            :placeholder="pathPlaceholder"
            @input="$emit('update:pathInput', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="$emit('jump')"
          >
          <button
            type="button"
            class="app-move-dialog__jump"
            :disabled="jumpDisabled"
            @click="$emit('jump')"
          >
            {{ $t('docLibrary.moveDialog.locate') }}
          </button>
        </div>
      </div>

      <div class="app-move-dialog__tree">
        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="app-move-dialog__row"
          :class="{
            'app-move-dialog__row--selected': selectedId === row.id,
            'app-move-dialog__row--disabled': row.disabled,
            'app-move-dialog__row--selectable': row.selectable
          }"
          :disabled="row.disabled"
          :style="{ '--move-depth': String(row.depth) }"
          @click="handleRowClick(row)"
        >
          <span
            class="app-move-dialog__toggle"
            :class="{ 'app-move-dialog__toggle--placeholder': !row.expandable }"
            @click.stop="row.expandable ? $emit('toggle', row.id) : null"
          >
            <span v-if="row.expandable">{{ row.expanded ? '▾' : '▸' }}</span>
          </span>
          <span class="app-move-dialog__row-main">
            <span class="app-move-dialog__row-label">{{ row.label }}</span>
            <span v-if="row.path" class="app-move-dialog__row-path">{{ row.path }}</span>
          </span>
        </button>

        <div v-if="rows.length === 0" class="app-move-dialog__empty">
          {{ $t('docLibrary.moveDialog.noTarget') }}
        </div>
      </div>
    </div>

    <template #actions>
      <button type="button" class="app-move-dialog__btn app-move-dialog__btn--secondary" @click="$emit('cancel')">
        {{ $t('common.cancel') }}
      </button>
      <button type="button" class="app-move-dialog__btn app-move-dialog__btn--primary" :disabled="confirmDisabled" @click="$emit('confirm')">
        {{ $t('docLibrary.moveDialog.confirmMove') }}
      </button>
    </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import AppModalShell from './AppModalShell.vue'

export type AppMoveDialogRow = {
  id: string
  label: string
  path: string
  depth: number
  expandable: boolean
  expanded: boolean
  selectable: boolean
  disabled?: boolean
}

withDefaults(defineProps<{
  open: boolean
  title: string
  pathInput: string
  pathPlaceholder?: string
  pathHint?: string
  jumpDisabled?: boolean
  confirmDisabled?: boolean
  selectedId?: string
  sourceLabels: string[]
  rows: AppMoveDialogRow[]
}>(), {
  // 默认占位含结构路径示例·当前唯一消费方 DocLibrary 已用 :path-placeholder 覆盖为 i18n 文案（docLibrary.dialog.movePathPlaceholder）；此默认仅无覆盖时兜底，保留
  pathPlaceholder: '输入标准路径，例如 /世界树/镜庭雨城/镜庭地点',
  pathHint: '',
  jumpDisabled: false,
  confirmDisabled: false,
  selectedId: ''
})

const emit = defineEmits<{
  (e: 'update:pathInput', value: string): void
  (e: 'toggle', id: string): void
  (e: 'select', id: string): void
  (e: 'jump'): void
  (e: 'cancel'): void
  (e: 'confirm'): void
}>()

function handleRowClick(row: AppMoveDialogRow) {
  if (!row.selectable || row.disabled) return
  emit('select', row.id)
}
</script>

<style scoped>
.app-move-dialog {
  display: grid;
  gap: 10px;
}

.app-move-dialog__search {
  display: grid;
  gap: 5px;
}

.app-move-dialog__selected {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.app-move-dialog__label {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--morandi-text-light, #7b746b);
  white-space: nowrap;
}

.app-move-dialog__search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.app-move-dialog__input {
  width: 100%;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid var(--morandi-border);
  border-radius: 9px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text, #4f463f);
  font-size: 0.8rem;
}

.app-move-dialog__jump,
.app-move-dialog__btn {
  min-width: 78px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.app-move-dialog__jump:disabled,
.app-move-dialog__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-move-dialog__jump,
.app-move-dialog__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.app-move-dialog__jump:hover:not(:disabled),
.app-move-dialog__btn--secondary:hover:not(:disabled) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.app-move-dialog__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.app-move-dialog__btn--primary:hover:not(:disabled) {
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67);
  background: var(--langhuan-dialog-primary-bg-hover, #416f67);
}

.app-move-dialog__tree {
  min-height: 0;
  padding: 7px;
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  display: grid;
  align-content: start;
  gap: 4px;
  max-height: 460px;
  overflow: auto;
}

.app-move-dialog__row {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  width: 100%;
  padding: 6px 7px 6px calc(7px + var(--move-depth) * 13px);
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--morandi-text, #4f463f);
  text-align: left;
  cursor: pointer;
}

.app-move-dialog__row:hover {
  background: rgba(126, 167, 157, 0.08);
}

.app-move-dialog__row--selected {
  border-color: rgba(126, 167, 157, 0.4);
  background: rgba(126, 167, 157, 0.12);
}

.app-move-dialog__row--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-move-dialog__toggle {
  width: 13px;
  flex: 0 0 13px;
  color: var(--morandi-text-light, #7b746b);
  text-align: center;
  font-size: 0.72rem;
}

.app-move-dialog__toggle--placeholder {
  opacity: 0;
}

.app-move-dialog__row-main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.app-move-dialog__row-label {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.3;
}

.app-move-dialog__row-path,
.app-move-dialog__hint {
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--morandi-text-light, #7b746b);
  word-break: break-all;
}

.app-move-dialog__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.app-move-dialog__chip {
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(139, 115, 85, 0.12);
  color: var(--morandi-text, #4f463f);
  font-size: 0.72rem;
}

.app-move-dialog__empty {
  padding: 12px 10px;
  border: 1px dashed rgba(139, 115, 85, 0.22);
  border-radius: 12px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.76rem;
  text-align: center;
}
</style>
