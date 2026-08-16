<template>
  <section class="role-workspace__form">
    <div class="role-workspace__document-editor">
      <div class="role-workspace__document-chrome">
        <div class="role-workspace__document-breadcrumbs">
          <div class="role-workspace__document-breadcrumb-path">
            <span v-for="(part, index) in pathParts" :key="`${part}:${index}`">
              <span v-if="index > 0" class="role-workspace__document-breadcrumb-sep">/</span>
              {{ part }}
            </span>
          </div>
        </div>
        <div class="role-workspace__markdown-toolbar">
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.bold')" :aria-label="$t('brain.roleWorkspace.bold')" @click="emit('wrap-selection', '**')">B</button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.italic')" :aria-label="$t('brain.roleWorkspace.italic')" @click="emit('wrap-selection', '_')">I</button>
          <button type="button" class="role-workspace__toolbar-btn role-workspace__toolbar-btn--disabled" :title="$t('brain.roleWorkspace.underlineDisabled')" :aria-label="$t('brain.roleWorkspace.underlineDisabled')" disabled>U</button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.strikethrough')" :aria-label="$t('brain.roleWorkspace.strikethrough')" @click="emit('wrap-selection', '~~')">S</button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.insertLink')" :aria-label="$t('brain.roleWorkspace.insertLink')" @click="emit('insert-link')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 1 0-7.07-7.07L11 5"/>
              <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 19"/>
            </svg>
          </button>
          <span class="role-workspace__toolbar-sep"></span>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.heading1')" :aria-label="$t('brain.roleWorkspace.heading1')" @click="emit('insert-heading', 1)">H1</button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.heading2')" :aria-label="$t('brain.roleWorkspace.heading2')" @click="emit('insert-heading', 2)">H2</button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.heading3')" :aria-label="$t('brain.roleWorkspace.heading3')" @click="emit('insert-heading', 3)">H3</button>
          <span class="role-workspace__toolbar-sep"></span>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.insertTable')" :aria-label="$t('brain.roleWorkspace.insertTable')" @click="emit('insert-table')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="1"/>
              <path d="M3 10h18"/>
              <path d="M3 14h18"/>
              <path d="M9 5v14"/>
              <path d="M15 5v14"/>
            </svg>
          </button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.insertCodeBlock')" :aria-label="$t('brain.roleWorkspace.insertCodeBlock')" @click="emit('insert-code-block')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 8l-4 4 4 4"/>
              <path d="M16 8l4 4-4 4"/>
            </svg>
          </button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.insertImage')" :aria-label="$t('brain.roleWorkspace.insertImage')" @click="emit('insert-image')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <circle cx="9" cy="10" r="2"/>
              <path d="M21 16l-5-5-8 8"/>
            </svg>
          </button>
          <span class="role-workspace__toolbar-sep"></span>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.roleWorkspace.undo')" :aria-label="$t('brain.roleWorkspace.undo')" @click="emit('undo-draft')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14 4 9l5-5"/>
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
            </svg>
          </button>
          <button type="button" class="role-workspace__toolbar-btn" :title="$t('brain.card.redo')" :aria-label="$t('brain.card.redo')" @click="emit('redo-draft')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 14 5-5-5-5"/>
              <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>
            </svg>
          </button>
          <span class="role-workspace__toolbar-spacer"></span>
          <button type="button" class="role-workspace__toolbar-btn role-workspace__toolbar-btn--success" :title="$t('common.save')" :aria-label="$t('common.save')" @click="emit('save')">
            <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 4h11l3 3v13H5z"/>
              <path d="M8 4v6h8V4"/>
              <path d="M9 20v-6h6v6"/>
            </svg>
          </button>
        </div>
        <div class="role-workspace__document-meta">
          <label class="role-workspace__document-field">
            <span>{{ $t('brain.field.title') }}</span>
            <input
              class="role-workspace__control role-workspace__document-title"
              :class="{ 'role-workspace__document-title--readonly': titleReadonly }"
              :value="title"
              :placeholder="$t('brain.roleWorkspace.pageTitlePlaceholder')"
              :readonly="titleReadonly"
              @input="emit('update:title', ($event.target as HTMLInputElement).value)"
            >
          </label>
          <label v-if="showSubtitle" class="role-workspace__document-field">
            <span>{{ $t('brain.roleWorkspace.subtitle') }}</span>
            <input
              class="role-workspace__control role-workspace__document-title"
              :value="subtitle"
              :placeholder="$t('brain.roleWorkspace.subtitlePlaceholder')"
              @input="emit('update:subtitle', ($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>
        <section v-if="arrangementSettings" class="role-workspace__arrangement-panel" :aria-label="$t('brain.roleWorkspace.arrangementSettings')">
          <div class="role-workspace__arrangement-head">
            <span>{{ $t('brain.roleWorkspace.activationRule') }}</span>
            <div class="role-workspace__segmented" role="group" :aria-label="$t('brain.roleWorkspace.recallStrength')">
              <button type="button" :class="{ active: arrangementSettings.recallPriority !== 'must' }" @click="emitArrangementPatch({ recallPriority: 'normal' })">{{ $t('brain.roleWorkspace.normalRecall') }}</button>
              <button type="button" :class="{ active: arrangementSettings.recallPriority === 'must' }" @click="emitArrangementPatch({ recallPriority: 'must' })">{{ $t('brain.roleWorkspace.mustRecall') }}</button>
            </div>
          </div>
          <div class="role-workspace__arrangement-grid">
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.date') }}</span>
              <input class="role-workspace__control role-workspace__control--compact" type="date" :value="arrangementSettings.date" @input="emitArrangementPatch({ date: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.repeat') }}</span>
              <select class="role-workspace__control role-workspace__control--compact" :value="arrangementSettings.recurrence" @change="emitArrangementPatch({ recurrence: ($event.target as HTMLSelectElement).value })">
                <option value="once">{{ $t('brain.roleWorkspace.repeatOnce') }}</option>
                <option value="daily">{{ $t('brain.roleWorkspace.repeatDaily') }}</option>
                <option value="weekly">{{ $t('brain.roleWorkspace.repeatWeekly') }}</option>
                <option value="monthly">{{ $t('brain.roleWorkspace.repeatMonthly') }}</option>
                <option value="yearly">{{ $t('brain.roleWorkspace.repeatYearly') }}</option>
              </select>
            </label>
            <label class="role-workspace__arrangement-field role-workspace__arrangement-field--inline">
              <input type="checkbox" :checked="arrangementSettings.allDay" @change="emitArrangementPatch({ allDay: ($event.target as HTMLInputElement).checked })">
              <span>{{ $t('brain.roleWorkspace.allDay') }}</span>
            </label>
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.start') }}</span>
              <input class="role-workspace__control role-workspace__control--compact" type="time" :value="arrangementSettings.startTime" :disabled="arrangementSettings.allDay" @input="emitArrangementPatch({ startTime: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.end') }}</span>
              <input class="role-workspace__control role-workspace__control--compact" type="time" :value="arrangementSettings.endTime" :disabled="arrangementSettings.allDay" @input="emitArrangementPatch({ endTime: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.read') }}</span>
              <select class="role-workspace__control role-workspace__control--compact" :value="arrangementSettings.recallLevel" @change="emitArrangementPatch({ recallLevel: ($event.target as HTMLSelectElement).value })">
                <option value="summary">{{ $t('brain.field.summary') }}</option>
                <option value="body">{{ $t('brain.field.body') }}</option>
              </select>
            </label>
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.leadMinutes') }}</span>
              <input class="role-workspace__control role-workspace__control--compact" type="number" min="0" max="1440" :value="arrangementSettings.prewarmMinutes" @input="emitArrangementPatch({ prewarmMinutes: ($event.target as HTMLInputElement).value })">
            </label>
            <label class="role-workspace__arrangement-field">
              <span>{{ $t('brain.roleWorkspace.graceMinutes') }}</span>
              <input class="role-workspace__control role-workspace__control--compact" type="number" min="0" max="1440" :value="arrangementSettings.graceMinutes" @input="emitArrangementPatch({ graceMinutes: ($event.target as HTMLInputElement).value })">
            </label>
          </div>
        </section>
      </div>
      <CompilePageEntryButton
        :status="compileStatusText"
        :warning="compileStatusWarning"
        @open="emit('open-compile-page')"
      />
      <textarea
        ref="textareaRef"
        class="role-workspace__markdown-textarea"
        :value="content"
        spellcheck="false"
        @keydown="handleContentKeydown"
        @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
        @scroll="emit('editor-scroll')"
      ></textarea>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import CompilePageEntryButton from '../../recall/CompilePageEntryButton.vue'
import type { RelationHintValidationItem } from '../../../app/relationSystem'
import {
  formatCompilePageEntryStatus,
  isCompilePageEntryStatusWarning
} from '../../../app/compilePageIndicators'
import type { UnitViewCompilePage } from '../../../types/unitView'
import { applyLanghuanMarkdownIndentShortcut } from '../../../utils/markdown'

export type RoleArrangementEditorSettings = {
  date: string
  recurrence: string
  allDay: boolean
  startTime: string
  endTime: string
  prewarmMinutes: string
  graceMinutes: string
  recallLevel: string
  recallPriority: string
}

const props = defineProps<{
  pathParts: string[]
  title: string
  subtitle?: string
  showSubtitle?: boolean
  titleReadonly?: boolean
  content: string
  compilePage: UnitViewCompilePage
  arrangementSettings?: RoleArrangementEditorSettings | null
  relationValidationItems?: RelationHintValidationItem[]
}>()

const emit = defineEmits<{
  'update:title': [value: string]
  'update:subtitle': [value: string]
  'update:content': [value: string]
  'update:compile-page': [value: UnitViewCompilePage]
  'update:arrangement-settings': [value: Partial<RoleArrangementEditorSettings>]
  'open-compile-page': []
  'wrap-selection': [marker: string]
  'insert-heading': [level: 1 | 2 | 3]
  'insert-link': []
  'insert-table': []
  'insert-code-block': []
  'insert-image': []
  'undo-draft': []
  'redo-draft': []
  save: []
  'editor-scroll': []
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const relationErrorCount = computed(() => (props.relationValidationItems || []).filter((item) => item.status === 'warning').length)
const compileStatusText = computed(() => formatCompilePageEntryStatus(props.compilePage, relationErrorCount.value))
const compileStatusWarning = computed(() => isCompilePageEntryStatusWarning(compileStatusText.value))
const showSubtitle = computed(() => Boolean(props.showSubtitle))

function emitArrangementPatch(patch: Partial<RoleArrangementEditorSettings>) {
  emit('update:arrangement-settings', patch)
}

function getTextareaElement() {
  return textareaRef.value
}

function handleContentKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const hasShortcutModifier = event.ctrlKey || event.metaKey
  if (hasShortcutModifier && !event.altKey && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) emit('redo-draft')
    else emit('undo-draft')
    return
  }
  if (hasShortcutModifier && !event.shiftKey && !event.altKey && key === 'y') {
    event.preventDefault()
    emit('redo-draft')
    return
  }
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return
  const textarea = event.target
  if (!(textarea instanceof HTMLTextAreaElement)) return
  event.preventDefault()
  const result = applyLanghuanMarkdownIndentShortcut(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    event.shiftKey
  )
  emit('update:content', result.value)
  nextTick(() => {
    textareaRef.value?.focus()
    textareaRef.value?.setSelectionRange(result.selectionStart, result.selectionEnd)
  })
}

defineExpose({
  getTextareaElement
})
</script>

<style scoped>
.role-workspace__form,
.role-workspace__document-editor {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: color-mix(in srgb, var(--morandi-bg) 82%, #ffffff 18%);
}

.role-workspace__document-chrome {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
}

.role-workspace__document-breadcrumbs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
  padding-bottom: 12px;
  color: color-mix(in srgb, var(--morandi-text) 76%, #6f9276 24%);
}

.role-workspace__document-breadcrumb-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-workspace__document-breadcrumb-sep {
  padding: 0 9px;
  color: color-mix(in srgb, var(--morandi-text-light) 70%, transparent);
}

.role-workspace__markdown-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 38px;
  overflow-x: auto;
}

.role-workspace__toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  width: 32px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text);
  cursor: pointer;
  font-size: 13px;
}

.role-workspace__toolbar-btn:hover {
  background: color-mix(in srgb, var(--morandi-accent) 10%, transparent);
}

.role-workspace__toolbar-btn:disabled {
  cursor: default;
  opacity: 0.38;
}

.role-workspace__toolbar-btn--success {
  color: #6f9276;
}

.role-workspace__toolbar-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.role-workspace__toolbar-sep {
  flex: 0 0 auto;
  width: 1px;
  height: 20px;
  margin: 0;
  background: color-mix(in srgb, var(--morandi-border) 84%, transparent);
}

.role-workspace__toolbar-spacer {
  flex: 1 1 auto;
  min-width: 4px;
}

.role-workspace__document-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
}

.role-workspace__document-field {
  display: grid;
  align-items: center;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 10px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-workspace__document-field > span {
  white-space: nowrap;
}

.role-workspace__control {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-surface) 90%, var(--morandi-bg) 10%);
  color: var(--morandi-text);
  padding: 9px 12px;
  outline: none;
}

.role-workspace__control--compact {
  min-height: 32px;
  padding: 6px 9px;
  font-size: 13px;
}

.role-workspace__document-title {
  min-height: 34px;
  border-color: color-mix(in srgb, var(--morandi-border) 82%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 88%, var(--morandi-bg) 12%);
  font-size: 14px;
}

.role-workspace__document-title--readonly {
  color: color-mix(in srgb, var(--morandi-text) 78%, transparent);
  background: color-mix(in srgb, var(--morandi-bg) 74%, #ffffff 26%);
}

.role-workspace__arrangement-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 14px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
  container-type: inline-size;
}

.role-workspace__arrangement-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-workspace__segmented {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 84%, transparent);
}

.role-workspace__segmented button {
  min-width: 46px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
  padding: 5px 9px;
  background: transparent;
  color: var(--morandi-text-light);
  font: inherit;
  cursor: pointer;
}

.role-workspace__segmented button:last-child {
  border-right: 0;
}

.role-workspace__segmented button.active {
  background: color-mix(in srgb, var(--morandi-accent) 16%, var(--morandi-surface));
  color: var(--morandi-text);
}

.role-workspace__arrangement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  gap: 8px;
}

.role-workspace__arrangement-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.role-workspace__arrangement-field--inline {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 32px;
  margin-top: 18px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 80%, transparent);
}

.role-workspace__arrangement-field--inline input {
  margin: 0;
}

@container (min-width: 760px) {
  .role-workspace__arrangement-grid {
    grid-template-columns: minmax(132px, 1.2fr) minmax(96px, 0.8fr) minmax(74px, 0.5fr) repeat(5, minmax(78px, 0.7fr));
  }
}

@container (max-width: 520px) {
  .role-workspace__arrangement-head {
    align-items: stretch;
    flex-direction: column;
  }

  .role-workspace__segmented {
    width: max-content;
    max-width: 100%;
  }
}

@media (max-width: 980px) {
  .role-workspace__arrangement-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.role-workspace__markdown-textarea {
  flex: 1 1 auto;
  min-height: 0;
  border: none;
  background: transparent;
  color: var(--morandi-text);
  padding: 20px 24px 32px;
  resize: none;
  outline: none;
  font: 14px/1.76 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
</style>
