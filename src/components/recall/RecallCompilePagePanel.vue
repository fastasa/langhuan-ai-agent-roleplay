<template>
  <section class="recall-compile-panel">
    <div class="recall-compile-panel__header">
      <span>{{ titleText }}</span>
      <span v-if="hint" class="recall-compile-panel__hint">{{ hint }}</span>
    </div>

    <div class="recall-compile-panel__grid">
      <label class="recall-compile-panel__field recall-compile-panel__field--wide">
        <span class="recall-compile-panel__label">{{ $t('unitTree.compilePanel.summaryLabel') }}</span>
        <textarea
          v-if="editable"
          :value="summaryText"
          class="recall-compile-panel__textarea"
          :placeholder="summaryPlaceholderText"
          @input="updateSummary"
        ></textarea>
        <div v-else class="recall-compile-panel__value recall-compile-panel__value--multiline">{{ summaryText || $t('unitTree.compilePanel.none') }}</div>
      </label>

      <label class="recall-compile-panel__field">
        <span class="recall-compile-panel__label">{{ $t('unitTree.compilePanel.tagsLabel') }}</span>
        <input
          v-if="editable"
          :value="tagsText"
          class="recall-compile-panel__input"
          type="text"
          :placeholder="tagsPlaceholderText"
          @input="updateTags"
        >
        <div v-else class="recall-compile-panel__value">{{ tagsInlineText || $t('unitTree.compilePanel.none') }}</div>
      </label>

      <section class="recall-compile-panel__field recall-compile-panel__field--wide recall-compile-panel__score-section">
        <div class="recall-compile-panel__score-head">
          <span class="recall-compile-panel__label">{{ $t('unitTree.compilePanel.scoreLabel') }}</span>
          <span class="recall-compile-panel__score-meta">{{ $t('unitTree.compilePanel.scoreHint') }}</span>
        </div>
        <div class="recall-compile-panel__score-grid">
          <label
            v-for="field in scoreFields"
            :key="field.key"
            class="recall-compile-panel__score-field"
          >
            <span>{{ field.label }}</span>
            <input
              v-if="editable"
              :value="field.value"
              class="recall-compile-panel__input recall-compile-panel__score-input"
              type="number"
              min="0"
              max="100"
              step="1"
              :placeholder="field.placeholder"
              @input="updateScore(field.key, $event)"
            >
            <div v-else class="recall-compile-panel__value recall-compile-panel__score-value">
              {{ formatScoreDisplay(field.value) }}
            </div>
          </label>
        </div>
      </section>

      <label v-if="showSemanticType" class="recall-compile-panel__field">
        <span class="recall-compile-panel__label">{{ $t('unitTree.compilePanel.unitTypeLabel') }}</span>
        <select
          v-if="editable"
          :value="semanticTypeValue"
          class="recall-compile-panel__select"
          @change="updateSemanticType"
        >
          <option
            v-for="option in semanticTypeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <div v-else class="recall-compile-panel__value">{{ semanticTypeLabel }}</div>
      </label>

      <label class="recall-compile-panel__field recall-compile-panel__field--wide">
        <span class="recall-compile-panel__label">{{ $t('unitTree.compilePanel.relationHintsLabel') }}</span>
        <textarea
          v-if="editable && relationHintsEditable"
          ref="relationHintsTextarea"
          :value="relationHintsText"
          class="recall-compile-panel__textarea"
          :placeholder="relationHintsPlaceholderText"
          @input="updateRelationHints"
        ></textarea>
        <div v-else class="recall-compile-panel__value recall-compile-panel__value--multiline">{{ relationHintsText || $t('unitTree.compilePanel.none') }}</div>
      </label>

      <section v-if="relationValidationItems.length > 0" class="recall-compile-panel__field recall-compile-panel__field--wide recall-compile-panel__validation">
        <div class="recall-compile-panel__validation-head">
          <span>{{ $t('unitTree.compilePanel.relationValidation') }}</span>
          <span>{{ validationSummaryText }}</span>
        </div>
        <div class="recall-compile-panel__validation-list">
          <article
            v-for="item in relationValidationItems"
            :key="item.id"
            class="recall-compile-panel__validation-item"
            :class="`recall-compile-panel__validation-item--${item.status}`"
          >
            <div class="recall-compile-panel__validation-main">
              <span class="recall-compile-panel__validation-badge">{{ item.status === 'valid' ? $t('unitTree.compilePanel.pass') : $t('unitTree.compilePanel.warn') }}</span>
              <span class="recall-compile-panel__validation-title">{{ formatValidationTitle(item) }}</span>
            </div>
            <div class="recall-compile-panel__validation-meta">
              <span>{{ formatLineLabel(item.lineIndex) }}</span>
              <span v-if="item.surfacePredicate">{{ $t('unitTree.compilePanel.surfacePrefix', { value: item.surfacePredicate }) }}</span>
              <span v-if="item.predicateLabel">{{ $t('unitTree.compilePanel.standardPrefix', { value: item.predicateLabel }) }}</span>
            </div>
            <div class="recall-compile-panel__validation-message">{{ item.message }}</div>
            <div class="recall-compile-panel__validation-line-row">
              <button
                type="button"
                class="recall-compile-panel__locate"
                :disabled="!canLocateRelationHintLine(item)"
                @click="locateRelationHintLine(item)"
              >
                {{ $t('unitTree.compilePanel.locate') }}
              </button>
              <div class="recall-compile-panel__validation-line">{{ item.line || $t('unitTree.compilePanel.noOriginalLine') }}</div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RecallCompilePageFields, UnitSemanticType } from '../../types'
import type { RelationHintValidationItem } from '../../app/relationSystem'
import {
  getUnitSemanticTypeLabel,
  normalizeUnitSemanticType,
  UNIT_SEMANTIC_TYPE_OPTIONS
} from '../../app/unitSemanticTypes'
import { applyRelationHintBracketCompletion } from '../../utils/relationHintInput'

const props = withDefaults(defineProps<{
  modelValue: RecallCompilePageFields
  title?: string
  hint?: string
  editable?: boolean
  relationHintsEditable?: boolean
  showSemanticType?: boolean
  semanticType?: UnitSemanticType
  relationValidationItems?: RelationHintValidationItem[]
  summaryPlaceholder?: string
  tagsPlaceholder?: string
  relationHintsPlaceholder?: string
}>(), {
  title: '',
  hint: '',
  editable: false,
  relationHintsEditable: true,
  showSemanticType: false,
  semanticType: 'other',
  summaryPlaceholder: '',
  tagsPlaceholder: '',
  relationHintsPlaceholder: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: RecallCompilePageFields): void
  (e: 'update:semanticType', value: UnitSemanticType): void
}>()

const { t } = useI18n()
// 未显式传入时回退到 i18n 默认文案
const titleText = computed(() => props.title || t('unitTree.compilePanel.defaultTitle'))
const summaryPlaceholderText = computed(() => props.summaryPlaceholder || t('unitTree.compilePanel.summaryPlaceholder'))
const tagsPlaceholderText = computed(() => props.tagsPlaceholder || t('unitTree.compilePanel.tagsPlaceholder'))
const relationHintsPlaceholderText = computed(() => props.relationHintsPlaceholder || t('unitTree.compilePanel.relationHintsPlaceholder'))

const relationHintsTextarea = ref<HTMLTextAreaElement | null>(null)
const summaryText = computed(() => String(props.modelValue?.summary || '').trim())
const tags = computed(() => Array.isArray(props.modelValue?.tags) ? props.modelValue.tags.map((item) => String(item || '').trim()).filter(Boolean) : [])
const relationHints = computed(() => Array.isArray(props.modelValue?.relationHints) ? props.modelValue.relationHints.map((item) => String(item || '').trim()).filter(Boolean) : [])
const tagsText = computed(() => tags.value.join('，'))
const tagsInlineText = computed(() => tags.value.join('，'))
const relationHintsText = computed(() => relationHints.value.join('\n'))
const scoreFields = computed(() => [
  { key: 'scoreDirectBase' as const, label: t('unitTree.compilePanel.scoreDirectBase'), value: props.modelValue?.scoreDirectBase, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreExpandBase' as const, label: t('unitTree.compilePanel.scoreExpandBase'), value: props.modelValue?.scoreExpandBase, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreSelfAnchor' as const, label: t('unitTree.compilePanel.scoreSelfAnchor'), value: props.modelValue?.scoreSelfAnchor, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreUserAnchor' as const, label: t('unitTree.compilePanel.scoreUserAnchor'), value: props.modelValue?.scoreUserAnchor, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreOtherAnchor' as const, label: t('unitTree.compilePanel.scoreOtherAnchor'), value: props.modelValue?.scoreOtherAnchor, placeholder: t('unitTree.compilePanel.scoreDefault') }
])
const relationValidationItems = computed(() => Array.isArray(props.relationValidationItems) ? props.relationValidationItems : [])
const validationSummaryText = computed(() => {
  const warnings = relationValidationItems.value.filter((item) => item.status === 'warning').length
  const valid = relationValidationItems.value.filter((item) => item.status === 'valid').length
  return t('unitTree.compilePanel.validationSummary', { valid, warnings })
})
const semanticTypeOptions = UNIT_SEMANTIC_TYPE_OPTIONS
const semanticTypeValue = computed(() => normalizeUnitSemanticType(props.semanticType))
const semanticTypeLabel = computed(() => getUnitSemanticTypeLabel(props.semanticType))

function splitList(value: string) {
  return String(value || '')
    .split(/[\n,，]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function patch(next: Partial<RecallCompilePageFields>) {
  emit('update:modelValue', {
    summary: summaryText.value,
    tags: tags.value,
    relationHints: relationHints.value,
    scoreDirectBase: props.modelValue?.scoreDirectBase,
    scoreExpandBase: props.modelValue?.scoreExpandBase,
    scoreSelfAnchor: props.modelValue?.scoreSelfAnchor,
    scoreUserAnchor: props.modelValue?.scoreUserAnchor,
    scoreOtherAnchor: props.modelValue?.scoreOtherAnchor,
    ...next
  })
}

function normalizeScoreInput(value: string): number | undefined {
  const text = String(value || '').trim()
  if (!text) return undefined
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function formatScoreDisplay(value: unknown) {
  return Number.isFinite(Number(value))
    ? t('unitTree.compilePanel.scoreUnit', { value: Number(value) })
    : t('unitTree.compilePanel.scoreDefault')
}

function updateSummary(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) return
  patch({ summary: target.value.trim() })
}

function updateTags(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  patch({ tags: splitList(target.value) })
}

function updateScore(key: keyof Pick<RecallCompilePageFields, 'scoreDirectBase' | 'scoreExpandBase' | 'scoreSelfAnchor' | 'scoreUserAnchor' | 'scoreOtherAnchor'>, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  patch({ [key]: normalizeScoreInput(target.value) })
}

function updateSemanticType(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  emit('update:semanticType', normalizeUnitSemanticType(target.value))
}

function updateRelationHints(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) return
  const result = applyRelationHintBracketCompletion(
    target.value,
    target.selectionStart,
    target.selectionEnd
  )
  if (result.completed) {
    target.value = result.value
  }
  patch({ relationHints: splitList(result.value) })
  if (!result.completed) return
  nextTick(() => {
    target.focus()
    target.setSelectionRange(result.selectionStart, result.selectionEnd)
  })
}

function formatValidationTitle(item: RelationHintValidationItem) {
  const source = item.sourceTitle || item.ownerTitle || t('unitTree.compilePanel.unknownSource')
  const target = item.targetTitle || t('unitTree.compilePanel.unknownTarget')
  const predicate = item.predicateLabel || item.surfacePredicate || t('unitTree.compilePanel.relationFallback')
  return `${source} - ${predicate} - ${target}`
}

function formatLineLabel(lineIndex: number | undefined) {
  return typeof lineIndex === 'number'
    ? t('unitTree.compilePanel.lineLabel', { line: lineIndex + 1 })
    : t('unitTree.compilePanel.originalLine')
}

function canLocateRelationHintLine(item: RelationHintValidationItem) {
  return Boolean(props.editable && props.relationHintsEditable && resolveRelationHintRange(item))
}

function locateRelationHintLine(item: RelationHintValidationItem) {
  const range = resolveRelationHintRange(item)
  const textarea = relationHintsTextarea.value
  if (!range || !textarea) return
  textarea.focus()
  textarea.setSelectionRange(range.start, range.end)
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight || '0') || 20
  textarea.scrollTop = Math.max(0, lineHeight * Math.max(0, range.lineIndex - 2))
}

function resolveRelationHintRange(item: RelationHintValidationItem) {
  const lines = relationHints.value
  let lineIndex = typeof item.lineIndex === 'number' ? item.lineIndex : -1
  if (lineIndex < 0 || lineIndex >= lines.length) {
    lineIndex = lines.findIndex((line) => String(line || '').trim() === String(item.line || '').trim())
  }
  if (lineIndex < 0 || lineIndex >= lines.length) return null
  const start = lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0)
  return {
    lineIndex,
    start,
    end: start + lines[lineIndex].length
  }
}
</script>

<style scoped>
.recall-compile-panel {
  border-top: 1px solid rgba(120, 120, 120, 0.16);
  padding-top: 12px;
}

.recall-compile-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--morandi-text);
  font-size: 12px;
}

.recall-compile-panel__hint {
  color: var(--morandi-text-light);
  text-align: right;
}

.recall-compile-panel__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.recall-compile-panel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.recall-compile-panel__field--wide {
  grid-column: 1 / -1;
}

.recall-compile-panel__score-section {
  gap: 8px;
}

.recall-compile-panel__score-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.recall-compile-panel__score-meta {
  color: var(--morandi-text-light);
  font-size: 12px;
}

.recall-compile-panel__score-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.recall-compile-panel__score-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--morandi-text);
  font-size: 12px;
}

.recall-compile-panel__label {
  font-size: 12px;
  color: var(--morandi-text);
}

.recall-compile-panel__input,
.recall-compile-panel__select,
.recall-compile-panel__textarea,
.recall-compile-panel__value {
  width: 100%;
  border: 1px solid rgba(120, 120, 120, 0.16);
  border-radius: 10px;
  background: color-mix(in srgb, var(--langhuan-dialog-input-bg) 78%, transparent);
  color: var(--morandi-text);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  box-sizing: border-box;
}

.recall-compile-panel__input,
.recall-compile-panel__select,
.recall-compile-panel__textarea {
  outline: none;
}

.recall-compile-panel__select {
  min-height: 42px;
}

.recall-compile-panel__textarea {
  min-height: 84px;
  resize: vertical;
}

.recall-compile-panel__score-input,
.recall-compile-panel__score-value {
  min-height: 36px;
  padding: 7px 8px;
}

.recall-compile-panel__value--multiline {
  white-space: pre-wrap;
}

.recall-compile-panel__validation {
  gap: 8px;
}

.recall-compile-panel__validation-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--morandi-text);
  font-size: 12px;
}

.recall-compile-panel__validation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recall-compile-panel__validation-item {
  border: 1px solid rgba(120, 120, 120, 0.14);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 54%, transparent);
  padding: 9px 10px;
}

.recall-compile-panel__validation-item--warning {
  border-color: rgba(188, 126, 42, 0.28);
  background: color-mix(in srgb, var(--morandi-warning) 14%, var(--morandi-card));
}

.recall-compile-panel__validation-main,
.recall-compile-panel__validation-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.recall-compile-panel__validation-badge {
  border-radius: 999px;
  background: rgba(76, 122, 93, 0.12);
  color: var(--morandi-accent);
  font-size: 11px;
  line-height: 1;
  padding: 4px 7px;
}

.recall-compile-panel__validation-item--warning .recall-compile-panel__validation-badge {
  background: rgba(188, 126, 42, 0.14);
  color: var(--morandi-warning);
}

.recall-compile-panel__validation-title {
  color: var(--morandi-text);
  font-size: 12px;
}

.recall-compile-panel__validation-meta,
.recall-compile-panel__validation-message,
.recall-compile-panel__validation-line {
  margin-top: 5px;
  color: var(--morandi-text-light);
  font-size: 11px;
}

.recall-compile-panel__validation-line {
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  color: var(--morandi-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 5px 7px;
  word-break: break-word;
}

.recall-compile-panel__validation-line-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 6px;
  margin-top: 5px;
}

.recall-compile-panel__locate {
  border: 1px solid rgba(120, 120, 120, 0.16);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  color: var(--morandi-text-light);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 6px 8px;
}

.recall-compile-panel__locate:hover:not(:disabled) {
  border-color: rgba(86, 122, 104, 0.26);
  color: var(--morandi-accent);
}

.recall-compile-panel__locate:disabled {
  cursor: default;
  opacity: 0.42;
}

@media (max-width: 720px) {
  .recall-compile-panel__grid {
    grid-template-columns: 1fr;
  }

  .recall-compile-panel__score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
