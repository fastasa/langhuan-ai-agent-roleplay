<template>
  <AppFormDialog
    :open="open"
    :title="$t('unitTree.publicCompilePage')"
    :subtitle="subtitleText"
    :size="dialogSize"
    body-compact
    :cancel-text="$t('common.close')"
    :submit-text="$t('unitTree.compileDialog.saveApply')"
    @cancel="emit('close')"
    @submit="emit('save-apply')"
  >
    <div class="compile-dialog">
      <div class="compile-dialog__layout" :class="{ 'compile-dialog__layout--single': !hasIssues }">
        <section class="compile-dialog__editor-pane" :aria-label="$t('unitTree.compileDialog.editorAria')">
          <label class="compile-dialog__field">
            <span class="compile-dialog__field-label">{{ $t('unitTree.compileDialog.summary') }}</span>
            <span class="compile-dialog__field-control">
              <textarea
                :value="summaryText"
                class="compile-dialog__textarea"
                rows="4"
                :placeholder="$t('unitTree.compileDialog.summaryPlaceholder')"
                @input="updateSummary"
              ></textarea>
            </span>
          </label>

          <label class="compile-dialog__field">
            <span class="compile-dialog__field-label">{{ $t('unitTree.compileDialog.tags') }}</span>
            <span class="compile-dialog__field-control">
              <input
                :value="tagsText"
                class="compile-dialog__input"
                type="text"
                :placeholder="$t('unitTree.compileDialog.tagsPlaceholder')"
                @input="updateTags"
              >
            </span>
          </label>

          <section class="compile-dialog__score-section" :aria-label="$t('unitTree.compileDialog.scoreAria')">
            <div class="compile-dialog__score-head">
              <span class="compile-dialog__section-title">{{ $t('unitTree.compilePanel.scoreLabel') }}</span>
              <span class="compile-dialog__section-meta">{{ $t('unitTree.compilePanel.scoreHint') }}</span>
            </div>
            <div class="compile-dialog__score-grid">
              <label
                v-for="field in scoreFields"
                :key="field.key"
                class="compile-dialog__score-field"
              >
                <span>{{ field.label }}</span>
                <input
                  :value="field.value"
                  class="compile-dialog__input compile-dialog__score-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  :placeholder="field.placeholder"
                  @input="updateScore(field.key, $event)"
                >
              </label>
            </div>
          </section>

          <label class="compile-dialog__field">
            <span class="compile-dialog__field-label">{{ $t('unitTree.compileDialog.type') }}</span>
            <span class="compile-dialog__field-control">
              <select
                :value="semanticTypeValue"
                class="compile-dialog__select"
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
            </span>
          </label>

          <section class="compile-dialog__relation-section" :aria-label="$t('unitTree.compileDialog.relationAria')">
            <div class="compile-dialog__relation-head">
              <div>
                <span class="compile-dialog__section-title">{{ $t('unitTree.compilePanel.relationHintsLabel') }}</span>
                <span class="compile-dialog__section-meta">{{ $t('unitTree.compileDialog.countUnit', { count: relationHints.length }) }}</span>
              </div>
              <div
                class="compile-dialog__status"
                :class="hasIssues ? 'compile-dialog__status--warning' : 'compile-dialog__status--ok'"
              >
                {{ relationStatusText }}
              </div>
            </div>

            <textarea
              ref="relationHintsTextarea"
              :value="relationHintsText"
              class="compile-dialog__relation-textarea"
              :placeholder="$t('unitTree.compileDialog.relationPlaceholder')"
              @input="updateRelationHintsText"
              @click="refreshReferencePickerFromTextarea"
              @keyup="refreshReferencePickerFromTextarea"
              @select="refreshReferencePickerFromTextarea"
            ></textarea>

            <div
              v-if="activeReferenceSuggestions.length"
              class="compile-dialog__reference-picker"
              :aria-label="$t('unitTree.compileDialog.referenceAria')"
            >
              <button
                v-for="candidate in activeReferenceSuggestions"
                :key="candidate.unitId"
                type="button"
                class="compile-dialog__reference-option"
                @mousedown.prevent="applyReferenceCandidate(candidate)"
              >
                <span class="compile-dialog__reference-title">{{ candidate.referenceTitle }}</span>
                <span class="compile-dialog__reference-summary">{{ candidate.summary || $t('unitTree.compileDialog.noSummary') }}</span>
              </button>
            </div>

            <div
              v-if="hasIssues"
              class="compile-dialog__issue-index"
              :aria-label="$t('unitTree.compileDialog.issueIndexAria')"
            >
              <button
                v-for="(issue, index) in issues"
                :key="issue.id"
                type="button"
                class="compile-dialog__issue-index-row"
                :class="{
                  'compile-dialog__issue-index-row--active': selectedIssue?.id === issue.id,
                  'compile-dialog__issue-index-row--reviewed': reviewedIssueIds.has(issue.id)
                }"
                @click="selectIssue(issue.id)"
              >
                <span class="compile-dialog__issue-index-seq">{{ index + 1 }}</span>
                <span class="compile-dialog__issue-index-type">{{ issue.title }}</span>
                <span class="compile-dialog__issue-index-text">{{ issue.line || $t('unitTree.compileDialog.noOriginalText') }}</span>
              </button>
            </div>
          </section>
        </section>

        <aside v-if="hasIssues" class="compile-dialog__issue-pane" :aria-label="$t('unitTree.compileDialog.issuePaneAria')">
          <article v-if="selectedIssue" class="compile-dialog__issue-card">
            <section class="compile-dialog__issue-summary">
              <div class="compile-dialog__issue-summary-head">
                <div class="compile-dialog__issue-summary-main">
                  <span class="compile-dialog__issue-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 3.5l9 16H3l9-16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                      <path d="M12 8v5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <circle cx="12" cy="16.6" r="1" fill="currentColor"/>
                    </svg>
                  </span>
                  <div class="compile-dialog__issue-heading">
                    <div class="compile-dialog__issue-title-row">
                      <span class="compile-dialog__issue-title">{{ selectedIssue.title }}</span>
                      <span class="compile-dialog__issue-severity">{{ formatSeverity(selectedIssue.severity) }}</span>
                      <button
                        v-if="selectedIssue.type === 'duplicate_relation' && duplicateRelationIssues.length > 0"
                        type="button"
                        class="compile-dialog__issue-inline-action"
                        @click="emit('delete-all-duplicate-relation-hints', duplicateRelationIssues)"
                      >
                        {{ $t('unitTree.compileDialog.deleteAllDuplicateLines') }}
                      </button>
                    </div>
                  </div>
                </div>
                <span class="compile-dialog__issue-count">{{ $t('unitTree.compileDialog.warnCount', { count: issues.length }) }}</span>
              </div>

              <dl class="compile-dialog__issue-details">
                <div v-if="selectedIssue.sourceTitle || selectedIssue.targetTitle">
                  <dt>{{ $t('unitTree.compileDialog.normalizedRelation') }}</dt>
                  <dd>{{ formatIssueObjects(selectedIssue) }}</dd>
                </div>
                <div v-if="selectedIssue.ownerPath">
                  <dt>{{ $t('unitTree.compileDialog.currentPath') }}</dt>
                  <dd>{{ selectedIssue.ownerPath }}</dd>
                </div>
                <div>
                  <dt>{{ $t('unitTree.compileDialog.reason') }}</dt>
                  <dd>{{ selectedIssue.suggestion || selectedIssue.reason }}</dd>
                </div>
              </dl>
            </section>

            <section class="compile-dialog__matched-panel">
              <div class="compile-dialog__matched-head">
                <span class="compile-dialog__matched-heading">{{ issueDetailPanel.title }}</span>
              </div>

              <p v-if="issueDetailPanel.summary" class="compile-dialog__matched-summary">
                {{ issueDetailPanel.summary }}
              </p>

              <div v-if="selectedIssue.type === 'duplicate_relation'" class="compile-dialog__duplicate-panel">
                <div v-if="selectedIssue.duplicateEvidence.length > 0" class="compile-dialog__duplicate-lines">
                  <article
                    v-for="(entry, duplicateIndex) in selectedIssue.duplicateEvidence"
                    :key="`${entry.ownerUnitId || entry.ownerTitle || 'duplicate'}:${entry.lineIndex ?? duplicateIndex}:${entry.line}`"
                    class="compile-dialog__duplicate-line"
                  >
                    <div class="compile-dialog__duplicate-line-main">
                      <div class="compile-dialog__duplicate-title-row">
                        <span class="compile-dialog__duplicate-title">{{ entry.ownerTitle || $t('unitTree.compileDialog.unknownDocument') }}</span>
                        <span class="compile-dialog__duplicate-line-label">{{ formatDuplicateEvidenceLine(entry) }}</span>
                      </div>
                      <div v-if="entry.ownerPath" class="compile-dialog__duplicate-path">{{ entry.ownerPath }}</div>
                      <code class="compile-dialog__duplicate-line-code">{{ entry.line }}</code>
                    </div>
                    <div class="compile-dialog__duplicate-actions">
                      <button
                        type="button"
                        class="compile-dialog__issue-btn"
                        @click="emit('edit-duplicate-relation-hint', entry)"
                      >
                        {{ $t('common.edit') }}
                      </button>
                      <button
                        type="button"
                        class="compile-dialog__issue-btn"
                        @click="emit('delete-duplicate-relation-hint', entry)"
                      >
                        {{ $t('common.delete') }}
                      </button>
                    </div>
                  </article>
                </div>
                <div v-else class="compile-dialog__duplicate-empty">
                  {{ $t('unitTree.compileDialog.noDuplicateEvidence') }}
                </div>
              </div>

              <div v-if="selectedIssue.matchedUnits.length > 0" class="compile-dialog__matched-list">
                <article
                  v-for="unit in selectedIssue.matchedUnits"
                  :key="unit.unitId"
                  class="compile-dialog__matched-item"
                >
                  <div class="compile-dialog__matched-main">
                    <div class="compile-dialog__matched-title-row">
                      <span class="compile-dialog__matched-label">{{ $t('unitTree.compileDialog.unitName') }}</span>
                      <span class="compile-dialog__matched-title">{{ unit.title || $t('unitTree.compileDialog.unnamedUnit') }}</span>
                      <span
                        v-if="unit.unitId === selectedIssue.ownerUnitId"
                        class="compile-dialog__matched-badge"
                      >
                        {{ $t('unitTree.compileDialog.currentDocument') }}
                      </span>
                    </div>
                    <div class="compile-dialog__matched-path-row">
                      <span class="compile-dialog__matched-label">{{ $t('unitTree.compileDialog.path') }}</span>
                      <span class="compile-dialog__matched-path">{{ unit.path || $t('unitTree.compileDialog.noPath') }}</span>
                    </div>
                  </div>
                  <div class="compile-dialog__matched-actions">
                    <button
                      type="button"
                      class="compile-dialog__issue-btn"
                      @click="emit('edit-related-unit', unit.unitId)"
                    >
                      {{ $t('common.edit') }}
                    </button>
                    <button
                      type="button"
                      class="compile-dialog__issue-btn"
                      @click="emit('delete-related-unit', unit.unitId)"
                    >
                      {{ $t('common.delete') }}
                    </button>
                  </div>
                </article>
              </div>
              <div v-else-if="selectedIssue.type !== 'duplicate_relation'" class="compile-dialog__issue-guidance">
                <div
                  v-for="tip in issueDetailPanel.tips"
                  :key="tip"
                  class="compile-dialog__issue-guidance-row"
                >
                  {{ tip }}
                </div>
                <div v-if="selectedIssue.suggestedText" class="compile-dialog__issue-suggested">
                  <span class="compile-dialog__issue-suggested-label">{{ $t('unitTree.compileDialog.suggestedWriting') }}</span>
                  <code class="compile-dialog__issue-suggested-code">{{ selectedIssue.suggestedText }}</code>
                </div>
              </div>
            </section>

            <div class="compile-dialog__issue-actions">
              <button
                v-if="selectedIssue.actionKinds.includes('apply_suggested_text') && selectedIssue.suggestedText"
                type="button"
                class="compile-dialog__issue-btn compile-dialog__issue-btn--primary"
                @click="applySuggestedText(selectedIssue)"
              >
                {{ $t('unitTree.compileDialog.applySuggestion') }}
              </button>
              <button
                v-if="selectedIssue.actionKinds.includes('delete_line')"
                type="button"
                class="compile-dialog__issue-btn"
                @click="deleteIssueLine(selectedIssue)"
              >
                {{ $t('unitTree.compileDialog.deleteThisLine') }}
              </button>
              <button
                type="button"
                class="compile-dialog__issue-btn"
                :class="{ 'compile-dialog__issue-btn--muted': reviewedIssueIds.has(selectedIssue.id) }"
                @click="markIssueReviewed(selectedIssue)"
              >
                {{ reviewedIssueIds.has(selectedIssue.id) ? $t('unitTree.compileDialog.reviewed') : $t('unitTree.compileDialog.markReviewed') }}
              </button>
            </div>
          </article>
        </aside>
      </div>

      <div v-if="!hasIssues" class="compile-dialog__normal-hint">
        {{ normalStateText }}
      </div>
    </div>

    <template #actions>
      <button type="button" class="compile-dialog__footer-btn" @click="emit('close')">
        {{ $t('common.close') }}
      </button>
      <button type="button" class="compile-dialog__footer-btn" @click="emit('save-draft')">
        {{ $t('unitTree.compileDialog.saveDraft') }}
      </button>
      <button type="button" class="compile-dialog__footer-btn compile-dialog__footer-btn--primary" @click="emit('save-apply')">
        {{ $t('unitTree.compileDialog.saveApply') }}
      </button>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppFormDialog from '../common/AppFormDialog.vue'
import type { RecallCompilePageFields, UnitSemanticType } from '../../types'
import {
  buildCompileRelationIssues,
  type CompileRelationIssue,
  type CompileRelationIssueDuplicateEvidence,
  type RelationHintValidationItem
} from '../../app/relationSystem'
import {
  normalizeUnitSemanticType,
  UNIT_SEMANTIC_TYPE_OPTIONS
} from '../../app/unitSemanticTypes'
import { parseRelationHintReference } from '../../app/relationHintReference'
import { applyRelationHintBracketCompletion } from '../../utils/relationHintInput'

export interface RelationHintReferenceCandidate {
  unitId: string
  title: string
  referenceTitle: string
  refId: string
  summary?: string
  path?: string
}

const props = withDefaults(defineProps<{
  open: boolean
  modelValue: RecallCompilePageFields
  semanticType: UnitSemanticType
  relationValidationItems?: RelationHintValidationItem[]
  relationReferenceCandidates?: RelationHintReferenceCandidate[]
  unitTitle?: string
  unitPath?: string
}>(), {
  relationValidationItems: () => [],
  relationReferenceCandidates: () => [],
  unitTitle: '',
  unitPath: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: RecallCompilePageFields): void
  (e: 'update:semanticType', value: UnitSemanticType): void
  (e: 'close'): void
  (e: 'save-draft'): void
  (e: 'save-apply'): void
  (e: 'revalidate'): void
  (e: 'edit-related-unit', unitId: string): void
  (e: 'delete-related-unit', unitId: string): void
  (e: 'edit-duplicate-relation-hint', entry: CompileRelationIssueDuplicateEvidence): void
  (e: 'delete-duplicate-relation-hint', entry: CompileRelationIssueDuplicateEvidence): void
  (e: 'delete-all-duplicate-relation-hints', issues: CompileRelationIssue[]): void
}>()

const { t } = useI18n()
const reviewedIssueIds = ref(new Set<string>())
const relationHintsTextarea = ref<HTMLTextAreaElement | null>(null)
const selectedIssueId = ref('')
const activeReferenceToken = ref<{ start: number; end: number; title: string } | null>(null)

const summaryText = computed(() => String(props.modelValue?.summary || ''))
const tags = computed(() => normalizeList(props.modelValue?.tags))
const relationHints = computed(() => normalizeRelationHints(props.modelValue?.relationHints))
const relationHintsText = computed(() => relationHints.value.join('\n'))
const tagsText = computed(() => tags.value.join('，'))
const scoreFields = computed(() => [
  { key: 'scoreDirectBase' as const, label: t('unitTree.compilePanel.scoreDirectBase'), value: props.modelValue?.scoreDirectBase, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreExpandBase' as const, label: t('unitTree.compilePanel.scoreExpandBase'), value: props.modelValue?.scoreExpandBase, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreSelfAnchor' as const, label: t('unitTree.compilePanel.scoreSelfAnchor'), value: props.modelValue?.scoreSelfAnchor, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreUserAnchor' as const, label: t('unitTree.compilePanel.scoreUserAnchor'), value: props.modelValue?.scoreUserAnchor, placeholder: t('unitTree.compilePanel.scoreDefault') },
  { key: 'scoreOtherAnchor' as const, label: t('unitTree.compilePanel.scoreOtherAnchor'), value: props.modelValue?.scoreOtherAnchor, placeholder: t('unitTree.compilePanel.scoreDefault') }
])
const semanticTypeOptions = UNIT_SEMANTIC_TYPE_OPTIONS
const semanticTypeValue = computed(() => normalizeUnitSemanticType(props.semanticType))
const issues = computed(() => buildCompileRelationIssues(props.relationValidationItems))
const duplicateRelationIssues = computed(() => issues.value.filter((issue) => issue.type === 'duplicate_relation'))
const hasIssues = computed(() => issues.value.length > 0)
const dialogSize = computed(() => (hasIssues.value ? 'xl' : 'lg'))
const selectedIssue = computed(() => issues.value.find((issue) => issue.id === selectedIssueId.value) || issues.value[0])
const issueDetailPanel = computed(() => buildIssueDetailPanel(selectedIssue.value))
const subtitleText = computed(() => {
  const path = props.unitPath.trim()
  return path || props.unitTitle.trim() || t('unitTree.compileDialog.currentUnit')
})
const relationStatusText = computed(() => {
  if (issues.value.length > 0) return t('unitTree.compileDialog.warnCount', { count: issues.value.length })
  if (relationHints.value.length === 0) return t('unitTree.compileDialog.notFilled')
  return t('unitTree.compileDialog.normalAvailable', { count: relationHints.value.length })
})
const normalStateText = computed(() => (
  relationHints.value.length === 0
    ? t('unitTree.compileDialog.emptyHintNew')
    : t('unitTree.compileDialog.noIssues')
))
const activeReferenceSuggestions = computed(() => {
  const token = activeReferenceToken.value
  if (!token?.title) return []
  const matches = props.relationReferenceCandidates.filter((candidate) => (
    candidate.title.trim() === token.title.trim()
  ))
  return matches.length > 1 ? matches : []
})

watch(issues, (nextIssues) => {
  if (nextIssues.some((issue) => issue.id === selectedIssueId.value)) return
  selectedIssueId.value = nextIssues[0]?.id || ''
}, { immediate: true })

function normalizeList(input: unknown) {
  if (!Array.isArray(input)) return []
  return input.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeRelationHints(input: unknown) {
  if (!Array.isArray(input)) return []
  return input.map((item) => String(item || '').trim())
}

function normalizeScoreInput(value: string): number | undefined {
  const text = String(value || '').trim()
  if (!text) return undefined
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

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

function updateSummary(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) return
  patch({ summary: target.value })
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

function updateRelationHintsText(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) return
  const result = applyRelationHintBracketCompletion(target.value, target.selectionStart || 0, target.selectionEnd || 0)
  if (result.completed) {
    target.value = result.value
  }
  patch({ relationHints: splitList(result.value) })
  refreshReferencePicker(result.value, result.selectionStart)
  if (!result.completed) return
  nextTick(() => {
    target.focus()
    target.setSelectionRange(result.selectionStart, result.selectionEnd)
    refreshReferencePicker(target.value, result.selectionStart)
  })
}

function refreshReferencePickerFromTextarea() {
  const target = relationHintsTextarea.value
  if (!target) return
  refreshReferencePicker(target.value, target.selectionStart || 0)
}

function refreshReferencePicker(value: string, cursor: number) {
  activeReferenceToken.value = findActiveReferenceToken(value, cursor)
}

function findActiveReferenceToken(value: string, cursor: number) {
  const text = String(value || '')
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const start = text.lastIndexOf('[[', safeCursor)
  if (start < 0) return null
  const end = text.indexOf(']]', start + 2)
  if (end < 0 || safeCursor > end + 2) return null
  const rawContent = text.slice(start + 2, end)
  const reference = parseRelationHintReference(rawContent)
  const title = String(reference.title || '').trim()
  if (!title || reference.refId) return null
  return { start: start + 2, end, title }
}

function applyReferenceCandidate(candidate: RelationHintReferenceCandidate) {
  const token = activeReferenceToken.value
  const textarea = relationHintsTextarea.value
  if (!token || !textarea) return
  const current = textarea.value
  const nextValue = `${current.slice(0, token.start)}${candidate.referenceTitle}${current.slice(token.end)}`
  const nextCursor = token.start + candidate.referenceTitle.length
  textarea.value = nextValue
  patch({ relationHints: splitList(nextValue) })
  activeReferenceToken.value = null
  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(nextCursor, nextCursor)
  })
}

function deleteRelationHint(index: number) {
  patch({ relationHints: relationHints.value.filter((_, itemIndex) => itemIndex !== index) })
}

function selectIssue(issueId: string) {
  selectedIssueId.value = issueId
}

function applySuggestedText(issue: CompileRelationIssue) {
  if (!issue.suggestedText) return
  const lineIndex = issue.relatedLineIndexes[0]
  if (typeof lineIndex !== 'number') return
  const next = [...relationHints.value]
  next[lineIndex] = issue.suggestedText
  patch({ relationHints: next })
}

function deleteIssueLine(issue: CompileRelationIssue) {
  const lineIndex = typeof issue.lineIndex === 'number'
    ? issue.lineIndex
    : issue.relatedLineIndexes[0]
  if (typeof lineIndex !== 'number') return
  deleteRelationHint(lineIndex)
}

function markIssueReviewed(issue: CompileRelationIssue) {
  reviewedIssueIds.value = new Set([...reviewedIssueIds.value, issue.id])
}

function formatIssueObjects(issue: CompileRelationIssue) {
  const source = issue.sourceTitle || issue.ownerTitle || t('unitTree.compilePanel.unknownSource')
  const predicate = issue.surfacePredicate || issue.predicateLabel || t('unitTree.compilePanel.relationFallback')
  const target = issue.targetTitle || t('unitTree.compilePanel.unknownTarget')
  return `${source} / ${predicate} / ${target}`
}

function formatDuplicateEvidenceLine(entry: CompileRelationIssueDuplicateEvidence) {
  return typeof entry.lineIndex === 'number'
    ? t('unitTree.compilePanel.lineLabel', { line: entry.lineIndex + 1 })
    : t('unitTree.compileDialog.noLineNumber')
}

function buildIssueDetailPanel(issue: CompileRelationIssue | undefined) {
  if (!issue) {
    return {
      title: t('unitTree.compileDialog.detail.adviceTitle'),
      summary: '',
      tips: []
    }
  }
  if (issue.matchedUnits.length > 0) {
    return {
      title: t('unitTree.compileDialog.detail.ambiguityTitle'),
      summary: t('unitTree.compileDialog.detail.ambiguitySummary'),
      tips: []
    }
  }
  switch (issue.type) {
    case 'invalid_format':
      return {
        title: t('unitTree.compileDialog.detail.formatTitle'),
        summary: t('unitTree.compileDialog.detail.formatSummary'),
        tips: [
          t('unitTree.compileDialog.detail.formatTip1'),
          t('unitTree.compileDialog.detail.formatTip2'),
          t('unitTree.compileDialog.detail.formatTip3')
        ]
      }
    case 'invalid_predicate':
      return {
        title: t('unitTree.compileDialog.detail.predicateTitle'),
        summary: t('unitTree.compileDialog.detail.predicateSummary'),
        tips: [
          t('unitTree.compileDialog.detail.predicateTip1'),
          t('unitTree.compileDialog.detail.predicateTip2'),
          t('unitTree.compileDialog.detail.predicateTip3')
        ]
      }
    case 'missing_target':
      return {
        title: t('unitTree.compileDialog.detail.targetTitle'),
        summary: t('unitTree.compileDialog.detail.targetSummary'),
        tips: [
          t('unitTree.compileDialog.detail.targetTip1'),
          t('unitTree.compileDialog.detail.targetTip2'),
          t('unitTree.compileDialog.detail.targetTip3')
        ]
      }
    case 'duplicate_relation':
      return {
        title: t('unitTree.compileDialog.detail.duplicateTitle'),
        summary: t('unitTree.compileDialog.detail.duplicateSummary'),
        tips: []
      }
    case 'direction_conflict':
      return {
        title: t('unitTree.compileDialog.detail.directionTitle'),
        summary: t('unitTree.compileDialog.detail.directionSummary'),
        tips: [
          t('unitTree.compileDialog.detail.directionTip1'),
          t('unitTree.compileDialog.detail.directionTip2'),
          t('unitTree.compileDialog.detail.directionTip3')
        ]
      }
    default:
      return {
        title: t('unitTree.compileDialog.detail.adviceTitle'),
        summary: issue.description || t('unitTree.compileDialog.detail.defaultSummary'),
        tips: [
          issue.suggestion || issue.reason || t('unitTree.compileDialog.detail.defaultTip')
        ].filter(Boolean)
      }
  }
}

function formatSeverity(severity: CompileRelationIssue['severity']) {
  if (severity === 'blocking') return t('unitTree.compileDialog.severityBlocking')
  if (severity === 'suggestion') return t('unitTree.compileDialog.severitySuggestion')
  return t('unitTree.compilePanel.warn')
}
</script>

<style scoped>
.compile-dialog {
  display: grid;
  gap: 16px;
}

.compile-dialog__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  gap: 18px;
  min-height: clamp(500px, 66vh, 720px);
}

.compile-dialog__layout--single {
  grid-template-columns: minmax(0, 1fr);
  min-height: auto;
}

.compile-dialog__editor-pane,
.compile-dialog__issue-pane {
  min-width: 0;
  min-height: 0;
}

.compile-dialog__editor-pane {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.compile-dialog__field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.compile-dialog__field-label {
  flex: 0 0 56px;
  padding-top: 4px;
  color: color-mix(in srgb, var(--morandi-text) 84%, transparent);
  font-size: 13px;
  font-weight: 600;
}

.compile-dialog__field-control {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
}

.compile-dialog__input,
.compile-dialog__select,
.compile-dialog__textarea,
.compile-dialog__relation-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text);
  font-size: 13px;
  line-height: 1.55;
  outline: none;
  padding: 8px 10px;
}

.compile-dialog__textarea {
  min-height: 128px;
  resize: vertical;
}

.compile-dialog__select {
  min-height: 42px;
}

.compile-dialog__score-section {
  display: grid;
  gap: 8px;
}

.compile-dialog__score-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.compile-dialog__score-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.compile-dialog__score-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: color-mix(in srgb, var(--morandi-text) 74%, transparent);
  font-size: 12px;
}

.compile-dialog__score-input {
  min-height: 36px;
  padding: 7px 8px;
}

.compile-dialog__relation-section {
  display: grid;
  gap: 10px;
  min-height: 0;
}

.compile-dialog__relation-textarea {
  min-height: 176px;
  resize: vertical;
}

.compile-dialog__reference-picker {
  display: grid;
  gap: 4px;
  max-height: 118px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--morandi-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
}

.compile-dialog__reference-option {
  display: grid;
  grid-template-columns: minmax(120px, 0.92fr) minmax(120px, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
}

.compile-dialog__reference-option:hover {
  background: rgba(177, 135, 78, 0.12);
}

.compile-dialog__reference-title {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.compile-dialog__reference-summary {
  overflow: hidden;
  color: var(--morandi-text-light);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.compile-dialog__relation-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.compile-dialog__section-title {
  color: color-mix(in srgb, var(--morandi-text) 94%, transparent);
  font-size: 14px;
  font-weight: 700;
}

.compile-dialog__section-meta {
  margin-left: 8px;
  color: color-mix(in srgb, var(--morandi-text) 58%, transparent);
  font-size: 12px;
}

.compile-dialog__status {
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  padding: 6px 9px;
}

.compile-dialog__status--ok {
  background: rgba(76, 122, 93, 0.11);
  color: rgba(42, 94, 61, 0.95);
}

.compile-dialog__status--warning {
  background: rgba(188, 126, 42, 0.13);
  color: rgba(130, 80, 25, 0.96);
}

.compile-dialog__issue-index {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--morandi-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
}

.compile-dialog__issue-index-row {
  display: grid;
  grid-template-columns: 34px 80px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--morandi-card) 76%, transparent);
  color: inherit;
  cursor: pointer;
  padding: 9px 12px;
  text-align: left;
}

.compile-dialog__issue-index-row--active {
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  box-shadow: inset 0 0 0 1px rgba(198, 134, 51, 0.32);
}

.compile-dialog__issue-index-row--reviewed {
  background: color-mix(in srgb, var(--morandi-card) 88%, transparent);
}

.compile-dialog__issue-index-seq,
.compile-dialog__issue-index-type {
  color: color-mix(in srgb, var(--morandi-text) 92%, transparent);
  font-size: 12px;
  line-height: 1.2;
}

.compile-dialog__issue-index-type {
  font-weight: 700;
}

.compile-dialog__issue-index-text {
  min-width: 0;
  color: color-mix(in srgb, var(--morandi-text) 88%, transparent);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compile-dialog__ghost-btn,
.compile-dialog__issue-btn,
.compile-dialog__footer-btn {
  border: 1px solid var(--morandi-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  color: color-mix(in srgb, var(--morandi-text) 72%, transparent);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 7px 9px;
}

.compile-dialog__issue-pane {
  border: 1px solid var(--morandi-border);
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--morandi-card) 94%, transparent), color-mix(in srgb, var(--morandi-card) 90%, transparent));
  overflow: hidden;
}

.compile-dialog__issue-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 14px;
}

.compile-dialog__issue-summary {
  display: grid;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--morandi-border);
}

.compile-dialog__issue-summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.compile-dialog__issue-summary-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.compile-dialog__issue-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  color: rgba(191, 131, 45, 0.96);
}

.compile-dialog__issue-icon svg {
  width: 100%;
  height: 100%;
}

.compile-dialog__issue-heading {
  min-width: 0;
}

.compile-dialog__issue-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.compile-dialog__issue-title {
  color: color-mix(in srgb, var(--morandi-text) 96%, transparent);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.compile-dialog__issue-severity,
.compile-dialog__issue-count {
  border-radius: 999px;
  background: rgba(188, 126, 42, 0.13);
  color: rgba(130, 80, 25, 0.96);
  font-size: 11px;
  line-height: 1;
  padding: 6px 9px;
}

.compile-dialog__issue-inline-action {
  min-height: 24px;
  border: 1px solid color-mix(in srgb, var(--morandi-danger) 22%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  color: var(--morandi-danger);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
}

.compile-dialog__issue-inline-action:hover {
  background: rgba(174, 81, 69, 0.08);
}

.compile-dialog__issue-details {
  display: grid;
  gap: 8px;
  margin: 0;
  color: color-mix(in srgb, var(--morandi-text) 78%, transparent);
  font-size: 12px;
}

.compile-dialog__issue-details div {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.compile-dialog__issue-details dt {
  color: color-mix(in srgb, var(--morandi-text) 62%, transparent);
}

.compile-dialog__issue-details dd {
  margin: 0;
  color: color-mix(in srgb, var(--morandi-text) 90%, transparent);
  line-height: 1.55;
  word-break: break-word;
}

.compile-dialog__matched-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding-top: 14px;
}

.compile-dialog__matched-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
}

.compile-dialog__matched-heading {
  color: color-mix(in srgb, var(--morandi-text) 94%, transparent);
  font-size: 16px;
  font-weight: 700;
}

.compile-dialog__matched-summary {
  margin: 0 0 10px;
  color: color-mix(in srgb, var(--morandi-text) 72%, transparent);
  font-size: 12px;
  line-height: 1.55;
}

.compile-dialog__matched-list {
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  flex: 1 1 auto;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.compile-dialog__matched-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-card) 74%, transparent);
  padding: 9px 10px;
}

.compile-dialog__matched-main {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.compile-dialog__matched-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.compile-dialog__matched-path-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
}

.compile-dialog__matched-label {
  color: color-mix(in srgb, var(--morandi-text) 58%, transparent);
  font-size: 11px;
  line-height: 1.4;
}

.compile-dialog__matched-title {
  color: color-mix(in srgb, var(--morandi-text) 92%, transparent);
  font-size: 14px;
  font-weight: 700;
}

.compile-dialog__matched-badge {
  border-radius: 999px;
  background: rgba(126, 167, 157, 0.16);
  color: rgba(46, 96, 85, 0.92);
  font-size: 11px;
  line-height: 1;
  padding: 4px 7px;
}

.compile-dialog__matched-path {
  color: color-mix(in srgb, var(--morandi-text) 68%, transparent);
  font-size: 11px;
  line-height: 1.45;
  word-break: break-all;
}

.compile-dialog__matched-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.compile-dialog__issue-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
}

.compile-dialog__issue-guidance {
  display: grid;
  gap: 8px;
}

.compile-dialog__issue-guidance-row {
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 74%, transparent);
  color: color-mix(in srgb, var(--morandi-text) 86%, transparent);
  font-size: 12px;
  line-height: 1.55;
  padding: 9px 10px;
}

.compile-dialog__duplicate-panel {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
}

.compile-dialog__duplicate-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 68%, transparent);
  box-shadow: 0 1px 3px rgba(64, 52, 39, 0.04);
  padding: 8px 9px;
}

.compile-dialog__duplicate-lines {
  display: grid;
  gap: 5px;
}

.compile-dialog__duplicate-line-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.compile-dialog__duplicate-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}

.compile-dialog__duplicate-title {
  color: color-mix(in srgb, var(--morandi-text) 94%, transparent);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}

.compile-dialog__duplicate-line-label {
  color: color-mix(in srgb, var(--morandi-text) 62%, transparent);
  font-size: 11px;
  line-height: 1.35;
}

.compile-dialog__duplicate-path,
.compile-dialog__duplicate-line-code {
  color: color-mix(in srgb, var(--morandi-text) 82%, transparent);
  font-size: 11px;
  line-height: 1.42;
  overflow-wrap: anywhere;
}

.compile-dialog__duplicate-path {
  color: color-mix(in srgb, var(--morandi-text) 66%, transparent);
}

.compile-dialog__duplicate-line-code {
  font-family: inherit;
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: color-mix(in srgb, var(--morandi-text) 86%, transparent);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compile-dialog__duplicate-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.compile-dialog__duplicate-empty {
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 74%, transparent);
  color: color-mix(in srgb, var(--morandi-text) 72%, transparent);
  font-size: 12px;
  padding: 9px 10px;
}

.compile-dialog__issue-suggested {
  display: grid;
  gap: 6px;
  padding-top: 4px;
}

.compile-dialog__issue-suggested-label {
  color: color-mix(in srgb, var(--morandi-text) 62%, transparent);
  font-size: 11px;
}

.compile-dialog__issue-suggested-code {
  display: block;
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 88%, transparent);
  color: color-mix(in srgb, var(--morandi-text) 92%, transparent);
  font-size: 12px;
  line-height: 1.55;
  padding: 10px;
  word-break: break-all;
}

.compile-dialog__issue-btn--primary,
.compile-dialog__footer-btn--primary {
  border-color: var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.compile-dialog__issue-btn--muted {
  background: rgba(239, 245, 241, 0.86);
  color: rgba(42, 94, 61, 0.9);
}

.compile-dialog__normal-hint {
  color: color-mix(in srgb, var(--morandi-text) 72%, transparent);
  font-size: 13px;
  line-height: 1.6;
}

.compile-dialog__normal-hint {
  padding-top: 2px;
}

.compile-dialog__footer-btn {
  min-width: 92px;
}

@media (max-width: 760px) {
  .compile-dialog__layout,
  .compile-dialog__layout--single,
  .compile-dialog__issue-details div,
  .compile-dialog__matched-item,
  .compile-dialog__field {
    grid-template-columns: 1fr;
  }

  .compile-dialog__field {
    gap: 6px;
  }

  .compile-dialog__field-label {
    flex-basis: auto;
    padding-top: 0;
  }

  .compile-dialog__score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
