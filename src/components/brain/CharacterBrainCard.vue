<template>
  <section class="brain-card" tabindex="0" @keydown="handleCardKeydown" @wheel.stop>
    <header class="brain-card__header" :title="$t('brain.card.dragHint')" @pointerdown="handleHeaderPointerDown">
      <div class="brain-card__titles">
        <strong>{{ title }}</strong>
      </div>
      <div class="brain-card__actions" @pointerdown.stop>
        <button
          v-if="innerEntries.length"
          type="button"
          class="brain-card__icon-btn brain-card__calendar-toggle"
          :aria-label="calendarOpen ? $t('brain.card.calendarClose') : $t('brain.card.calendarOpen')"
          :title="calendarOpen ? $t('brain.card.calendarClose') : $t('brain.card.calendarOpen')"
          @click="toggleInnerCalendar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4" />
            <path d="M8 3v4" />
            <path d="M3 10h18" />
          </svg>
        </button>
        <button
          v-if="editable && isEditing"
          type="button"
          class="brain-card__icon-btn"
          :aria-label="$t('brain.card.undo')"
          :title="$t('brain.card.undoHint')"
          @click="undoDraft"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
          </svg>
        </button>
        <button
          v-if="editable && isEditing"
          type="button"
          class="brain-card__icon-btn"
          :aria-label="$t('brain.card.redo')"
          :title="$t('brain.card.redoHint')"
          @click="redoDraft"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
          </svg>
        </button>
        <button
          v-if="editable"
          type="button"
          class="brain-card__icon-btn"
          :aria-label="isEditing ? $t('brain.card.toBrowse') : $t('common.edit')"
          :title="isEditing ? $t('brain.card.browse') : $t('common.edit')"
          @click="toggleEdit"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
          </svg>
        </button>
        <button
          v-if="editable && isEditing"
          type="button"
          class="brain-card__icon-btn"
          :aria-label="$t('common.save')"
          :title="$t('common.save')"
          @click="handleSave"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4h12l2 2v14H5z" />
            <path d="M8 4v6h8V4" />
            <path d="M8 17h8" />
          </svg>
        </button>
        <button
          type="button"
          class="brain-card__icon-btn"
          :aria-label="$t('brain.card.minimize')"
          :title="$t('brain.card.minimize')"
          @click="$emit('minimize')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 12h10" />
          </svg>
        </button>
        <button type="button" class="brain-card__icon-btn" :aria-label="$t('common.close')" :title="$t('common.close')" @click="$emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </header>

    <section v-if="calendarOpen" class="brain-card__calendar" @pointerdown.stop>
      <div class="brain-card__calendar-head">
        <button type="button" class="brain-card__calendar-arrow" @click="shiftCalendarMonth(-1)">‹</button>
        <strong>{{ calendarTitle }}</strong>
        <button type="button" class="brain-card__calendar-arrow" @click="shiftCalendarMonth(1)">›</button>
      </div>
      <div class="brain-card__calendar-weekdays" aria-hidden="true">
        <span v-for="weekday in calendarWeekdays" :key="weekday">{{ weekday }}</span>
      </div>
      <div class="brain-card__calendar-grid">
        <button
          v-for="day in calendarDays"
          :key="day.key"
          type="button"
          class="brain-card__calendar-day"
          :class="{
            'brain-card__calendar-day--inactive': !day.hasEntry,
            'brain-card__calendar-day--muted': !day.inCurrentMonth,
            'brain-card__calendar-day--active': day.hasEntry
          }"
          :disabled="!day.hasEntry"
          @click="openInnerEntryByDate(day.isoDate)"
        >
          {{ day.label }}
        </button>
      </div>
      <p class="brain-card__calendar-hint">{{ $t('brain.card.calendarHint') }}</p>
    </section>

    <section v-if="pendingReview" class="brain-card__pending">
      <div class="brain-card__pending-head">
        <strong>{{ pendingReview.mode === 'update' ? $t('brain.pending.updateTitle') : $t('brain.pending.createTitle') }}</strong>
        <span>{{ pendingReview.createdBy }} · {{ pendingReview.createdAt || $t('brain.pending.justGenerated') }}</span>
      </div>
      <p class="brain-card__pending-reason">{{ pendingReview.reason }}</p>
      <article class="brain-card__pending-panel brain-card__pending-panel--current">
        <strong>{{ pendingReview.mode === 'update' ? $t('brain.card.changePreview') : $t('brain.card.pendingContent') }}</strong>
        <div v-if="pendingReview.mode === 'update' && pendingReview.previous" class="brain-card__pending-diff">
          <div
            v-for="line in pendingDiffLines"
            :key="line.key"
            class="brain-card__pending-diff-line"
          >
            <span class="brain-card__pending-diff-label">{{ line.label }}</span>
            <div class="brain-card__pending-diff-value">
              <span
                v-for="(part, index) in line.parts"
                :key="`${line.key}:${index}`"
                class="brain-card__pending-diff-part"
                :class="{
                  'brain-card__pending-diff-part--add': part.kind === 'add',
                  'brain-card__pending-diff-part--remove': part.kind === 'remove'
                }"
              >
                {{ part.text }}
              </span>
            </div>
          </div>
        </div>
        <pre v-else>{{ formatPendingSnapshot(pendingReview.current) }}</pre>
      </article>
      <div class="brain-card__pending-actions" @pointerdown.stop>
        <button type="button" class="brain-card__btn brain-card__btn--danger" @click="$emit('reject-pending')">{{ $t('brain.card.reject') }}</button>
        <button type="button" class="brain-card__btn" @click="$emit('confirm-pending')">{{ $t('brain.card.confirmAdopt') }}</button>
      </div>
    </section>

    <form v-if="cardType === 'form'" class="brain-card__form" @submit.prevent="handleSave">
      <label
        v-for="field in formFields"
        :key="field.key"
        class="brain-card__field"
        :class="[
          field.fieldClassName,
          {
            'brain-card__field--divider': field.dividerBefore,
            'brain-card__field--span-2': (field.columnSpan || 2) === 2
          }
        ]"
      >
        <span>{{ field.label }}</span>
        <select
          v-if="field.type === 'select'"
          v-model="draft[field.key]"
          :disabled="!editable || !isEditing || field.readonly"
          :class="['brain-card__control', field.controlClassName]"
        >
          <option v-for="option in field.options || []" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select
          v-else-if="field.type === 'apiPreset'"
          v-model="draft[field.key]"
          :disabled="!editable || !isEditing || field.readonly"
          :class="['brain-card__control', field.controlClassName]"
        >
          <option value="">{{ $t('brain.card.followGlobal') }}</option>
          <option v-for="preset in apiPresets" :key="preset.name" :value="preset.name">
            {{ preset.name }}
          </option>
        </select>
        <div v-else-if="field.type === 'apiModel'" class="brain-card__model-picker">
          <select
            v-model="draft[field.key]"
            :disabled="!editable || !isEditing || field.readonly"
            :class="['brain-card__control', field.controlClassName]"
          >
            <option value="">{{ $t('brain.card.followPreset') }}</option>
            <option v-for="model in modelOptions" :key="model" :value="model">
              {{ model }}
            </option>
            <option v-if="shouldShowCustomModel" :value="draft[field.key]">
              {{ $t('brain.card.customModelPrefix', { model: draft[field.key] }) }}
            </option>
          </select>
          <button
            type="button"
            class="brain-card__btn brain-card__btn--compact"
            :disabled="!editable || !isEditing || !draft.defaultPreset || modelLoading"
            @click="$emit('load-preset-models', draft.defaultPreset)"
          >
            {{ modelLoading ? $t('common.loading') : $t('brain.card.loadModels') }}
          </button>
          <input
            v-if="shouldShowCustomModel"
            v-model="draft[field.key]"
            :disabled="!editable || !isEditing"
            class="brain-card__control brain-card__control--custom"
            :placeholder="$t('brain.card.customModelPlaceholder')"
          >
        </div>
        <div v-else-if="field.type === 'avatar'" class="brain-card__avatar-picker">
          <button
            type="button"
            class="brain-card__avatar-preview"
            :disabled="!editable || !isEditing"
            @click="openAvatarPicker"
          >
            <img v-if="draft[field.key]" :src="draft[field.key]" :alt="$t('brain.card.avatarPreviewAlt')">
            <span v-else>{{ $t('brain.card.chooseAvatar') }}</span>
          </button>
          <div class="brain-card__avatar-actions">
            <button
              type="button"
              class="brain-card__btn brain-card__btn--compact"
              :disabled="!editable || !isEditing"
              @click="openAvatarPicker"
            >
              {{ $t('brain.card.chooseFromFolder') }}
            </button>
            <button
              type="button"
              class="brain-card__btn brain-card__btn--compact"
              :disabled="!editable || !isEditing || !draft[field.key]"
              @click="requestClearAvatar"
            >
              {{ $t('brain.card.clear') }}
            </button>
          </div>
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            class="brain-card__file-input"
            @change="handleAvatarFileChange"
          >
        </div>
        <div v-else-if="field.type === 'calendarMonthDays'" class="brain-card__calendar-editor">
          <div class="brain-card__calendar-month-grid" role="group" :aria-label="field.label">
            <label
              v-for="month in 12"
              :key="month"
              class="brain-card__calendar-month"
            >
              <span>{{ $t('brain.card.monthUnit', { month }) }}</span>
              <input
                class="brain-card__control brain-card__calendar-month-input"
                type="number"
                min="1"
                :value="getCalendarMonthDayValue(field.key, month)"
                :disabled="!editable || !isEditing || field.readonly"
                @input="updateCalendarMonthDay(field.key, month, ($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
          <div class="brain-card__calendar-actions">
            <button type="button" class="brain-card__btn brain-card__btn--compact" :disabled="!editable || !isEditing || field.readonly" @click="applyGregorianMonthDays(field.key)">{{ $t('brain.card.gregorian') }}</button>
            <button type="button" class="brain-card__btn brain-card__btn--compact" :disabled="!editable || !isEditing || field.readonly" @click="clearCalendarMonthDays(field.key)">{{ $t('brain.card.defaultBtn') }}</button>
          </div>
        </div>
        <label v-else-if="field.type === 'checkbox'" class="brain-card__checkbox">
          <input
            type="checkbox"
            :checked="isChecked(field.key)"
            :disabled="!editable || !isEditing || field.readonly"
            @change="draft[field.key] = ($event.target as HTMLInputElement).checked ? 'true' : ''"
          >
          <span>{{ field.placeholder || $t('brain.card.enable') }}</span>
        </label>
        <textarea
          v-else-if="field.type === 'textarea'"
          v-model="draft[field.key]"
          :disabled="!editable || !isEditing || field.readonly"
          :class="['brain-card__control', 'brain-card__control--textarea', field.controlClassName]"
          :placeholder="field.placeholder"
          rows="3"
        ></textarea>
        <input
          v-else
          :value="resolveFieldDisplayValue(field)"
          :disabled="!editable || !isEditing || field.readonly"
          :class="['brain-card__control', field.controlClassName]"
          :placeholder="field.placeholder"
          @input="handleFieldInput(field.key, $event)"
        >
      </label>
      <RecallCompilePagePanel
        v-if="compilePage"
        :model-value="compileDraft"
        class="brain-card__compile-panel"
        :title="$t('brain.card.compilePanelTitle')"
        :hint="compileRelationHint"
        :editable="editable && isEditing && compilePageEditable"
        :relation-hints-editable="compileRelationHintsEditable"
        @update:model-value="applyCompileDraft"
      />
      <label class="brain-card__field brain-card__field--link-editor">
        <span>{{ $t('brain.card.linkEditor') }}</span>
        <div class="brain-card__link-editor" @pointerdown="activateLinkEditor">
          <textarea
            ref="linkTextareaRef"
            v-model="linkText"
            :disabled="!editable || !isEditing"
            class="brain-card__control brain-card__control--textarea"
            :placeholder="$t('brain.card.linkPlaceholder')"
            rows="3"
            @input="handleLinkInput"
            @keydown="handleLinkKeydown"
          ></textarea>
          <div
            v-if="linkSuggestOpen"
            class="brain-card__link-suggestions"
          >
            <button
              v-for="item in filteredLinkSuggestions"
              :key="item.id"
              type="button"
              class="brain-card__link-suggestion"
              @mousedown.prevent="selectLinkSuggestion(item)"
            >
              <strong>{{ item.title }}</strong>
              <span>{{ item.parentTitle || $t('brain.card.linkParentFallback') }}</span>
            </button>
            <span v-if="!filteredLinkSuggestions.length" class="brain-card__link-empty">
              {{ $t('brain.card.noMatchNode') }}
            </span>
          </div>
        </div>
      </label>
    </form>

    <div v-else class="brain-card__document">
      <div v-if="isEditing" class="brain-card__document-workspace">
        <div class="brain-card__document-editor" :class="{ half: previewVisible }">
          <textarea
            v-model="draftContent"
            class="brain-card__markdown-textarea"
            spellcheck="false"
            :placeholder="$t('brain.card.documentPlaceholder')"
          ></textarea>
        </div>
        <div v-if="previewVisible" class="brain-card__document-divider"></div>
        <div v-if="previewVisible" class="brain-card__document-preview">
          <div class="brain-card__markdown" v-html="renderMarkdown(draftContent)"></div>
        </div>
      </div>
      <div v-else class="brain-card__markdown" v-html="renderMarkdown(content)"></div>
      <RecallCompilePagePanel
        v-if="compilePage"
        :model-value="compileDraft"
        class="brain-card__compile-panel"
        :title="$t('brain.card.compilePanelTitle')"
        :hint="compileRelationHint"
        :editable="editable && isEditing && compilePageEditable"
        :relation-hints-editable="compileRelationHintsEditable"
        @update:model-value="applyCompileDraft"
      />
      <label class="brain-card__field brain-card__field--link-editor">
        <span>{{ $t('brain.card.linkEditor') }}</span>
        <div class="brain-card__link-editor" @pointerdown="activateLinkEditor">
          <textarea
            ref="linkTextareaRef"
            v-model="linkText"
            :disabled="!editable || !isEditing"
            class="brain-card__control brain-card__control--textarea"
            :placeholder="$t('brain.card.linkPlaceholder')"
            rows="3"
            @input="handleLinkInput"
            @keydown="handleLinkKeydown"
          ></textarea>
          <div
            v-if="linkSuggestOpen"
            class="brain-card__link-suggestions"
          >
            <button
              v-for="item in filteredLinkSuggestions"
              :key="item.id"
              type="button"
              class="brain-card__link-suggestion"
              @mousedown.prevent="selectLinkSuggestion(item)"
            >
              <strong>{{ item.title }}</strong>
              <span>{{ item.parentTitle || $t('brain.card.linkParentFallback') }}</span>
            </button>
            <span v-if="!filteredLinkSuggestions.length" class="brain-card__link-empty">
              {{ $t('brain.card.noMatchNode') }}
            </span>
          </div>
        </div>
      </label>
    </div>

    <footer class="brain-card__footer" aria-hidden="true"></footer>

    <AppConfirmDialog
      :open="clearAvatarConfirmOpen"
      :title="$t('brain.card.clearAvatarTitle')"
      :message="$t('brain.card.clearAvatarMessage')"
      :confirm-text="$t('brain.card.clear')"
      tone="danger"
      @cancel="clearAvatarConfirmOpen = false"
      @confirm="confirmClearAvatar"
    />
    <PhotoCropDialog
      :open="photoCropOpen"
      :source="photoCropSource"
      :title="$t('brain.card.cropAvatarTitle')"
      @cancel="closePhotoCrop"
      @confirm="applyPhotoCrop"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppConfirmDialog from '../common/AppConfirmDialog.vue'
import PhotoCropDialog from '../common/PhotoCropDialog.vue'
import RecallCompilePagePanel from '../recall/RecallCompilePagePanel.vue'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { useToast } from '../../composables/useToast'
import type { ApiPreset } from '../../types'
import type {
  CharacterBrainCardFormField,
  CharacterBrainCardType,
  CharacterBrainCompilePage,
  CharacterBrainLinkDraft,
  CharacterBrainLinkSuggestion,
  CharacterBrainTraceInnerEntry,
  CharacterBrainPendingNodeSnapshot,
  CharacterBrainPendingReviewCard
} from '../../types/characterBrain'
import { useMarkdownWorkspaceEditor } from '../../composables/useMarkdownWorkspaceEditor'
import { renderMarkdownToHtml } from '../../utils/markdown'
import { readImageInputAsDataUrl } from '../../utils/photoFile'

const props = defineProps<{
  title: string
  content: string
  cardType?: CharacterBrainCardType
  editable: boolean
  formFields?: CharacterBrainCardFormField[]
  innerEntries?: CharacterBrainTraceInnerEntry[]
  linkDraft?: CharacterBrainLinkDraft
  compilePage?: CharacterBrainCompilePage
  compilePageEditable?: boolean
  compileRelationHintsEditable?: boolean
  compileRelationHint?: string
  linkSuggestions?: CharacterBrainLinkSuggestion[]
  apiPresets?: ApiPreset[]
  modelLoading?: boolean
  pendingReview?: CharacterBrainPendingReviewCard
}>()

const emit = defineEmits<{
  (e: 'save', nextContent: string | Record<string, string | string[] | number | undefined>): void
  (e: 'close'): void
  (e: 'minimize'): void
  (e: 'load-preset-models', presetName: string): void
  (e: 'pin-drag-start', event: PointerEvent): void
  (e: 'confirm-pending'): void
  (e: 'reject-pending'): void
  (e: 'open-inner-entry', entryId: string): void
}>()

const editor = useMarkdownWorkspaceEditor()
const runtimeStore = useWorkspaceRuntimeStore()
const { toast } = useToast(runtimeStore)
const { t } = useI18n()
const isEditing = editor.isEditMode
const previewVisible = editor.previewVisible
const draftContent = editor.draftContent
const formFields = ref<CharacterBrainCardFormField[]>([])
const innerEntries = computed(() => props.innerEntries || [])
const draft = reactive<Record<string, string>>({})
const linkText = ref('')
const linkTargetIds = ref<string[]>([])
const linkTextareaRef = ref<HTMLTextAreaElement | HTMLTextAreaElement[] | null>(null)
const linkSuggestOpen = ref(false)
const linkQuery = ref('')
const avatarInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const clearAvatarConfirmOpen = ref(false)
const photoCropOpen = ref(false)
const photoCropSource = ref('')
const calendarOpen = ref(false)
const calendarCursor = ref('')
const compileSummary = ref('')
const compileTags = ref<string[]>([])
const compileRelationHints = ref<string[]>([])
const compileScoreDirectBase = ref<number | undefined>()
const compileScoreExpandBase = ref<number | undefined>()
const compileScoreSelfAnchor = ref<number | undefined>()
const compileScoreUserAnchor = ref<number | undefined>()
const compileScoreOtherAnchor = ref<number | undefined>()

const cardType = computed<CharacterBrainCardType>(() => props.cardType || (formFields.value.length ? 'form' : 'document'))
const compilePage = computed(() => props.compilePage || null)
const compilePageEditable = computed(() => props.compilePageEditable !== false)
const compileRelationHintsEditable = computed(() => props.compileRelationHintsEditable !== false)
const compileRelationHint = computed(() => props.compileRelationHint || '')
const compileDraft = computed(() => ({
  summary: compileSummary.value,
  tags: [...compileTags.value],
  relationHints: [...compileRelationHints.value],
  scoreDirectBase: compileScoreDirectBase.value,
  scoreExpandBase: compileScoreExpandBase.value,
  scoreSelfAnchor: compileScoreSelfAnchor.value,
  scoreUserAnchor: compileScoreUserAnchor.value,
  scoreOtherAnchor: compileScoreOtherAnchor.value
}))
const apiPresets = computed(() => props.apiPresets || [])
const modelOptions = computed(() => {
  const preset = apiPresets.value.find((item) => item.name === draft.defaultPreset)
  return normalizeAvailableModels(preset?.availableModels ?? preset?.available_models)
})
const shouldShowCustomModel = computed(() => {
  const model = String(draft.defaultModel || '').trim()
  return Boolean(model) && !modelOptions.value.includes(model)
})
const linkSuggestions = computed(() => props.linkSuggestions || [])
const filteredLinkSuggestions = computed(() => {
  const query = normalizeText(linkQuery.value)
  const source = linkSuggestions.value.filter((item) => item.title !== props.title)
  return source
    .filter((item) => !query || normalizeText(item.title).includes(query))
    .slice(0, 10)
})
const pendingDiffLines = computed(() => {
  const pending = props.pendingReview
  if (!pending || pending.mode !== 'update' || !pending.previous) return []
  const previousEntries = buildPendingSnapshotEntries(pending.previous)
  const currentEntries = buildPendingSnapshotEntries(pending.current)
  const nextKeys = Array.from(new Set([
    ...previousEntries.map((entry) => entry.key),
    ...currentEntries.map((entry) => entry.key)
  ]))
  return nextKeys.map((key) => {
    const previousEntry = previousEntries.find((entry) => entry.key === key)
    const currentEntry = currentEntries.find((entry) => entry.key === key)
    const previousValue = previousEntry?.value || ''
    const currentValue = currentEntry?.value || ''
    return {
      key,
      label: currentEntry?.label || previousEntry?.label || key,
      parts: buildPendingDiffParts(previousValue, currentValue)
    }
  })
})
// i18n 红线延后：星期数组与下方 formatCalendarTitle 的「年月」日期格式统一走 locale 日期助手，暂不接字符串键
const calendarWeekdays = ['一', '二', '三', '四', '五', '六', '日'] as const
const innerCalendarBounds = computed(() => buildInnerCalendarBounds(innerEntries.value))
const calendarTitle = computed(() => formatCalendarTitle(calendarCursor.value || innerCalendarBounds.value.monthStart))
const calendarDays = computed(() => buildCalendarDays(calendarCursor.value || innerCalendarBounds.value.monthStart, innerEntries.value))

function handleHeaderPointerDown(event: PointerEvent) {
  emit('pin-drag-start', event)
}

function formatPendingSnapshot(snapshot: CharacterBrainPendingNodeSnapshot) {
  return buildPendingSnapshotEntries(snapshot)
    .map((entry) => `${entry.label}：${entry.multiline ? `\n${entry.value}` : entry.value}`)
    .join('\n\n')
}

function buildPendingSnapshotEntries(snapshot: CharacterBrainPendingNodeSnapshot) {
  return [
    buildPendingEntry('title', t('brain.card.snapshot.title'), snapshot.title),
    buildPendingEntry('timeLabel', t('brain.card.snapshot.timeLabel'), snapshot.timeLabel),
    buildPendingEntry('pointDate', t('brain.card.snapshot.pointDate'), snapshot.pointDate),
    buildPendingEntry('ageLabel', t('brain.card.snapshot.ageLabel'), snapshot.ageLabel),
    buildPendingEntry('summary', t('brain.card.snapshot.summary'), snapshot.summary),
    buildPendingEntry('content', t('brain.card.snapshot.body'), snapshot.content, true),
    buildPendingEntry('relatedEntityIds', t('brain.card.snapshot.relatedEntities'), snapshot.relatedEntityIds?.join('、') || ''),
    buildPendingEntry('tags', t('brain.card.snapshot.tags'), snapshot.tags?.join('、') || ''),
    buildPendingEntry('sourceDisplayPath', t('brain.card.snapshot.sourcePath'), snapshot.sourceDisplayPath),
    buildPendingEntry('sourceDocumentId', t('brain.card.snapshot.sourceDocument'), snapshot.sourceDocumentId)
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; multiline: boolean }>
}

function buildPendingEntry(key: string, label: string, value?: string, multiline = false) {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  return { key, label, value: normalized, multiline }
}

function buildPendingDiffParts(previousValue: string, currentValue: string) {
  if (previousValue === currentValue) {
    return [{ kind: 'same' as const, text: currentValue || t('brain.card.snapshot.notFilled') }]
  }
  const parts: Array<{ kind: 'same' | 'add' | 'remove'; text: string }> = []
  if (previousValue) parts.push({ kind: 'remove', text: previousValue })
  if (currentValue) parts.push({ kind: 'add', text: currentValue })
  if (!parts.length) parts.push({ kind: 'same', text: t('brain.card.snapshot.notFilled') })
  return parts
}

watch(
  () => props.formFields,
  () => {
    syncDraftFromFields()
  },
  { immediate: true, deep: true }
)

watch(
  () => props.linkDraft,
  () => {
    linkText.value = props.linkDraft?.text || ''
    linkTargetIds.value = [...(props.linkDraft?.targetIds || [])]
  },
  { immediate: true, deep: true }
)

watch(
  () => props.compilePage,
  () => {
    compileSummary.value = String(props.compilePage?.summary || '').trim()
    compileTags.value = Array.isArray(props.compilePage?.tags) ? props.compilePage.tags.map((item) => String(item || '').trim()).filter(Boolean) : []
    compileRelationHints.value = Array.isArray(props.compilePage?.relationHints) ? props.compilePage.relationHints.map((item) => String(item || '').trim()).filter(Boolean) : []
    compileScoreDirectBase.value = normalizeOptionalCompileScore(props.compilePage?.scoreDirectBase)
    compileScoreExpandBase.value = normalizeOptionalCompileScore(props.compilePage?.scoreExpandBase)
    compileScoreSelfAnchor.value = normalizeOptionalCompileScore(props.compilePage?.scoreSelfAnchor)
    compileScoreUserAnchor.value = normalizeOptionalCompileScore(props.compilePage?.scoreUserAnchor)
    compileScoreOtherAnchor.value = normalizeOptionalCompileScore(props.compilePage?.scoreOtherAnchor)
  },
  { immediate: true, deep: true }
)

watch(
  () => props.editable,
  (editable) => {
    if (!editable) {
      editor.closeEditor({ title: props.title, content: serializeEditorContent() })
    } else {
      editor.syncFromSource({ title: props.title, content: serializeEditorContent() })
    }
  },
  { immediate: true }
)

watch(
  innerEntries,
  (entries) => {
    if (!entries.length) {
      calendarOpen.value = false
      calendarCursor.value = ''
      return
    }
    if (!calendarCursor.value) {
      calendarCursor.value = buildInnerCalendarBounds(entries).monthStart
    }
  },
  { immediate: true, deep: true }
)

watch(
  draft,
  () => {
    if (cardType.value === 'form' && editor.isEditMode.value) {
      editor.updateDraftContent(serializeDraft())
    }
  },
  { deep: true }
)

watch(
  [compileSummary, compileTags, compileRelationHints, compileScoreDirectBase, compileScoreExpandBase, compileScoreSelfAnchor, compileScoreUserAnchor, compileScoreOtherAnchor],
  () => {
    if (cardType.value === 'form' && editor.isEditMode.value) {
      editor.updateDraftContent(serializeDraft())
    }
  },
  { deep: true }
)

watch(
  () => props.content,
  () => {
    if (cardType.value === 'document' && !editor.isEditMode.value) {
      editor.syncFromSource({ title: props.title, content: props.content })
    }
  }
)

function syncDraftFromFields() {
  formFields.value = props.formFields || []
  const nextKeys = new Set<string>(formFields.value.map((field) => field.key))
  Object.keys(draft).forEach((key) => {
    if (!nextKeys.has(key)) delete draft[key]
  })
  formFields.value.forEach((field) => {
    draft[field.key] = String(field.value || '')
  })
  if (cardType.value === 'form') {
    editor.syncFromSource({ title: props.title, content: serializeDraft() })
  }
}

function resetDraft() {
  syncDraftFromFields()
}

function undoDraft() {
  if (!props.editable || !editor.isEditMode.value) return
  const before = serializeEditorContent()
  editor.undoDraft()
  if (cardType.value === 'form') applyDraftFromSerialized(editor.draftContent.value)
  toast(before === serializeEditorContent() ? t('brain.card.toast.noUndo') : t('brain.card.toast.undone'), 'info')
}

function redoDraft() {
  if (!props.editable || !editor.isEditMode.value) return
  const before = serializeEditorContent()
  editor.redoDraft()
  if (cardType.value === 'form') applyDraftFromSerialized(editor.draftContent.value)
  toast(before === serializeEditorContent() ? t('brain.card.toast.noRedo') : t('brain.card.toast.redone'), 'info')
}

function handleCardKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 's') {
    if (!props.editable || !editor.isEditMode.value) return
    event.preventDefault()
    handleSave()
    return
  }
  if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault()
    redoDraft()
    return
  }
  if (key !== 'z') return
  event.preventDefault()
  undoDraft()
}

function toggleEdit() {
  if (!props.editable) return
  calendarOpen.value = false
  if (editor.isEditMode.value) {
    editor.closeEditor({ title: props.title, content: serializeEditorContent() })
    return
  }
  editor.openEditor({ title: props.title, content: serializeEditorContent() })
}

function toggleInnerCalendar() {
  if (!innerEntries.value.length) return
  if (!calendarCursor.value) {
    calendarCursor.value = innerCalendarBounds.value.monthStart
  }
  calendarOpen.value = !calendarOpen.value
}

function shiftCalendarMonth(delta: number) {
  calendarCursor.value = offsetCalendarMonth(calendarCursor.value || innerCalendarBounds.value.monthStart, delta)
}

function openInnerEntryByDate(dateText: string) {
  const matched = resolveMatchingInnerEntry(dateText, innerEntries.value)
  if (!matched) return
  calendarOpen.value = false
  emit('open-inner-entry', matched.id)
}

function activateLinkEditor(event: PointerEvent) {
  if (!props.editable) return
  if (editor.isEditMode.value) return
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('.brain-card__link-suggestions')) return
  editor.openEditor({ title: props.title, content: serializeEditorContent() })
  nextTick(() => {
    const textarea = Array.isArray(linkTextareaRef.value) ? linkTextareaRef.value[0] : linkTextareaRef.value
    textarea?.focus()
  })
}

function handleSave() {
  if (!props.editable) return
  if (cardType.value === 'document') {
    emit('save', {
      documentContent: draftContent.value,
      'compile.summary': compileSummary.value,
      'compile.tags': [...compileTags.value],
      'compile.relationHints': [...compileRelationHints.value],
      'compile.scoreDirectBase': compileScoreDirectBase.value,
      'compile.scoreExpandBase': compileScoreExpandBase.value,
      'compile.scoreSelfAnchor': compileScoreSelfAnchor.value,
      'compile.scoreUserAnchor': compileScoreUserAnchor.value,
      'compile.scoreOtherAnchor': compileScoreOtherAnchor.value,
      linkText: linkText.value,
      linkTargetIds: resolveLinkTargetIds()
    })
    return
  }
  emit('save', {
    ...draft,
    'compile.summary': compileSummary.value,
    'compile.tags': [...compileTags.value],
    'compile.relationHints': [...compileRelationHints.value],
    'compile.scoreDirectBase': compileScoreDirectBase.value,
    'compile.scoreExpandBase': compileScoreExpandBase.value,
    'compile.scoreSelfAnchor': compileScoreSelfAnchor.value,
    'compile.scoreUserAnchor': compileScoreUserAnchor.value,
    'compile.scoreOtherAnchor': compileScoreOtherAnchor.value,
    linkText: linkText.value,
    linkTargetIds: resolveLinkTargetIds()
  })
}

function serializeDraft() {
  return JSON.stringify({
    ...draft,
    'compile.summary': compileSummary.value,
    'compile.tags': [...compileTags.value],
    'compile.relationHints': [...compileRelationHints.value],
    'compile.scoreDirectBase': compileScoreDirectBase.value,
    'compile.scoreExpandBase': compileScoreExpandBase.value,
    'compile.scoreSelfAnchor': compileScoreSelfAnchor.value,
    'compile.scoreUserAnchor': compileScoreUserAnchor.value,
    'compile.scoreOtherAnchor': compileScoreOtherAnchor.value,
    linkText: linkText.value,
    linkTargetIds: linkTargetIds.value
  })
}

function serializeEditorContent() {
  return cardType.value === 'document' ? draftContent.value || props.content : serializeDraft()
}

function handleFieldInput(key: string, event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  draft[key] = input.value
}

function normalizeOptionalCompileScore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function getCalendarMonthDays(fieldKey: string) {
  const values = String(draft[fieldKey] || '')
    .split(/[\s,，;；/]+/u)
    .map((item) => Math.floor(Number(item)))
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0)
  return Array.from({ length: 12 }, (_, index) => values[index] || '')
}

function getCalendarMonthDayValue(fieldKey: string, month: number) {
  return String(getCalendarMonthDays(fieldKey)[month - 1] || '')
}

function updateCalendarMonthDay(fieldKey: string, month: number, rawValue: string) {
  const values = getCalendarMonthDays(fieldKey)
  const parsed = rawValue.trim() ? Math.floor(Number(rawValue)) : 0
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : ''
  values[month - 1] = value
  draft[fieldKey] = values.map((item) => String(item || '').trim()).join(',')
}

function applyGregorianMonthDays(fieldKey: string) {
  draft[fieldKey] = '31,28,31,30,31,30,31,31,30,31,30,31'
}

function clearCalendarMonthDays(fieldKey: string) {
  draft[fieldKey] = ''
}

function resolveFieldDisplayValue(field: CharacterBrainCardFormField) {
  if (field.key === 'trace.timeLabel') return buildTraceTimeLabelPreview()
  return draft[field.key]
}

function buildTraceTimeLabelPreview() {
  const pointDate = String(draft['trace.pointDate'] || '').trim()
  const ageLabel = String(draft['trace.ageLabel'] || '').trim()
  const stepUnit = String(draft['trace.stepUnit'] || '').trim()
  const stepAmount = String(draft['trace.stepAmount'] || '').trim()
  const unitText = stepUnit === 'day' ? t('brain.card.traceUnitDay') : stepUnit === 'month' ? t('brain.card.traceUnitMonth') : t('brain.card.traceUnitYear')
  const stepText = stepAmount ? t('brain.card.traceAppend', { amount: stepAmount, unit: unitText }) : ''
  return [pointDate, ageLabel, stepText].filter(Boolean).join('｜')
}

function handleLinkInput(event: Event) {
  if (!props.editable || !editor.isEditMode.value) return
  const textarea = event.target
  if (!(textarea instanceof HTMLTextAreaElement)) return
  const cursor = textarea.selectionStart
  const before = linkText.value.slice(0, cursor)
  if (before.endsWith('[[') && !linkText.value.slice(cursor, cursor + 2).startsWith(']]')) {
    linkText.value = `${linkText.value.slice(0, cursor)}]]${linkText.value.slice(cursor)}`
    nextTick(() => {
      textarea.selectionStart = cursor
      textarea.selectionEnd = cursor
    })
  }
  updateLinkSuggestionState(cursor)
}

function handleLinkKeydown(event: KeyboardEvent) {
  if (!linkSuggestOpen.value) return
  if (event.key === 'Escape') {
    linkSuggestOpen.value = false
  }
}

function updateLinkSuggestionState(cursor: number) {
  const before = linkText.value.slice(0, cursor)
  const openIndex = before.lastIndexOf('[[')
  const closeIndex = before.lastIndexOf(']]')
  if (openIndex < 0 || closeIndex > openIndex) {
    linkSuggestOpen.value = false
    linkQuery.value = ''
    return
  }
  linkQuery.value = before.slice(openIndex + 2).trim()
  linkSuggestOpen.value = true
}

function selectLinkSuggestion(item: CharacterBrainLinkSuggestion) {
  const textarea = Array.isArray(linkTextareaRef.value) ? linkTextareaRef.value[0] : linkTextareaRef.value
  const cursor = textarea?.selectionStart ?? linkText.value.length
  const before = linkText.value.slice(0, cursor)
  const after = linkText.value.slice(cursor)
  const openIndex = before.lastIndexOf('[[')
  const nextAfter = after.startsWith(']]') ? after.slice(2) : after
  if (openIndex < 0) {
    linkText.value = `${linkText.value}${linkText.value.endsWith(' ') ? '' : ' '}[[${item.title}]]`
  } else {
    linkText.value = `${before.slice(0, openIndex)}[[${item.title}]]${nextAfter}`
  }
  if (!linkTargetIds.value.includes(item.id)) {
    linkTargetIds.value = [...linkTargetIds.value, item.id]
  }
  linkSuggestOpen.value = false
  nextTick(() => textarea?.focus())
}

function resolveLinkTargetIds() {
  const titleMatches = Array.from(linkText.value.matchAll(/\[\[([^\]]+)\]\]/g))
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean)
  const ids = [...linkTargetIds.value]
  titleMatches.forEach((title) => {
    const matched = linkSuggestions.value.find((item) => item.title === title)
      || linkSuggestions.value.find((item) => normalizeText(item.title) === normalizeText(title))
    if (matched && !ids.includes(matched.id)) ids.push(matched.id)
  })
  return ids.filter((id) => titleMatches.some((title) => {
    const matched = linkSuggestions.value.find((item) => item.id === id)
    return matched ? normalizeText(matched.title) === normalizeText(title) : true
  }))
}

function normalizeText(value: string) {
  return String(value || '').trim().toLowerCase()
}

function applyCompileDraft(value: {
  summary?: string
  tags?: string[]
  relationHints?: string[]
  scoreDirectBase?: number
  scoreExpandBase?: number
  scoreSelfAnchor?: number
  scoreUserAnchor?: number
  scoreOtherAnchor?: number
}) {
  compileSummary.value = String(value.summary || '').trim()
  compileTags.value = Array.isArray(value.tags) ? value.tags.map((item) => String(item || '').trim()).filter(Boolean) : []
  compileRelationHints.value = Array.isArray(value.relationHints) ? value.relationHints.map((item) => String(item || '').trim()).filter(Boolean) : []
  compileScoreDirectBase.value = normalizeOptionalCompileScore(value.scoreDirectBase)
  compileScoreExpandBase.value = normalizeOptionalCompileScore(value.scoreExpandBase)
  compileScoreSelfAnchor.value = normalizeOptionalCompileScore(value.scoreSelfAnchor)
  compileScoreUserAnchor.value = normalizeOptionalCompileScore(value.scoreUserAnchor)
  compileScoreOtherAnchor.value = normalizeOptionalCompileScore(value.scoreOtherAnchor)
}

function isChecked(fieldKey: string) {
  const value = String(draft[fieldKey] ?? '').trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes' || value === 'on'
}

function renderMarkdown(markdown: string) {
  return renderMarkdownToHtml(markdown)
}

function openAvatarPicker() {
  if (!props.editable || !editor.isEditMode.value) return
  const input = Array.isArray(avatarInputRef.value) ? avatarInputRef.value[0] : avatarInputRef.value
  input?.click()
}

async function handleAvatarFileChange(event: Event) {
  try {
    const source = await readImageInputAsDataUrl(event)
    if (!source) return
    photoCropSource.value = source
    photoCropOpen.value = true
  } catch (error) {
    console.error('读取角色头像失败:', error)
    toast(t('brain.card.toast.imageOnly'), 'error')
  }
}

function requestClearAvatar() {
  if (!props.editable || !editor.isEditMode.value) return
  clearAvatarConfirmOpen.value = true
}

function confirmClearAvatar() {
  draft.avatarPath = ''
  clearAvatarConfirmOpen.value = false
  toast(t('brain.card.toast.avatarCleared'), 'warning')
}

function closePhotoCrop() {
  photoCropOpen.value = false
  photoCropSource.value = ''
}

function applyPhotoCrop(dataUrl: string) {
  draft.avatarPath = dataUrl
  closePhotoCrop()
  toast(t('brain.card.toast.avatarCropped'), 'success')
}

function applyDraftFromSerialized(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const nextDraft = parsed as Record<string, unknown>
    formFields.value.forEach((field) => {
      draft[field.key] = String(nextDraft[field.key] ?? '')
    })
    if ('linkText' in nextDraft) {
      linkText.value = String(nextDraft.linkText || '')
    }
    if ('compile.summary' in nextDraft) {
      compileSummary.value = String(nextDraft['compile.summary'] || '').trim()
    }
    if (Array.isArray(nextDraft['compile.tags'])) {
      compileTags.value = nextDraft['compile.tags'].map((item) => String(item || '').trim()).filter(Boolean)
    }
    if (Array.isArray(nextDraft['compile.relationHints'])) {
      compileRelationHints.value = nextDraft['compile.relationHints'].map((item) => String(item || '').trim()).filter(Boolean)
    }
    if ('compile.scoreDirectBase' in nextDraft) {
      compileScoreDirectBase.value = normalizeOptionalCompileScore(nextDraft['compile.scoreDirectBase'])
    }
    if ('compile.scoreExpandBase' in nextDraft) {
      compileScoreExpandBase.value = normalizeOptionalCompileScore(nextDraft['compile.scoreExpandBase'])
    }
    if ('compile.scoreSelfAnchor' in nextDraft) {
      compileScoreSelfAnchor.value = normalizeOptionalCompileScore(nextDraft['compile.scoreSelfAnchor'])
    }
    if ('compile.scoreUserAnchor' in nextDraft) {
      compileScoreUserAnchor.value = normalizeOptionalCompileScore(nextDraft['compile.scoreUserAnchor'])
    }
    if ('compile.scoreOtherAnchor' in nextDraft) {
      compileScoreOtherAnchor.value = normalizeOptionalCompileScore(nextDraft['compile.scoreOtherAnchor'])
    }
    if (Array.isArray(nextDraft.linkTargetIds)) {
      linkTargetIds.value = nextDraft.linkTargetIds.map((item) => String(item || '').trim()).filter(Boolean)
    }
  } catch {
    // 草稿不是 JSON 时保持当前表单，避免误清空。
  }
}

function normalizeAvailableModels(rawModels: unknown): string[] {
  if (Array.isArray(rawModels)) {
    return rawModels.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof rawModels !== 'string') return []
  try {
    const parsed = JSON.parse(rawModels)
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function handleWindowPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('.brain-card__calendar') || target.closest('.brain-card__calendar-toggle')) return
  calendarOpen.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', handleWindowPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown)
})

function buildInnerCalendarBounds(entries: CharacterBrainTraceInnerEntry[]) {
  const ranges = entries
    .map((entry) => resolveEntryDateRange(entry))
    .filter(Boolean) as Array<{ start: string; end: string }>
  const first = ranges[0]
  const monthStart = first ? `${first.start.slice(0, 7)}-01` : formatMonthStart(new Date())
  return { monthStart }
}

function buildCalendarDays(monthStart: string, entries: CharacterBrainTraceInnerEntry[]) {
  const base = parseIsoDate(monthStart)
  if (!base) return []
  const firstDay = createUtcDate(base.year, base.month, 1)
  const firstWeekday = normalizeWeekday(firstDay.getUTCDay())
  const gridStart = addUtcDays(firstDay, -firstWeekday)
  return Array.from({ length: 42 }, (_, index) => {
    const current = addUtcDays(gridStart, index)
    const isoDate = formatUtcDate(current)
    const currentMonth = current.getUTCMonth() + 1
    return {
      key: isoDate,
      isoDate,
      label: String(current.getUTCDate()),
      inCurrentMonth: currentMonth === base.month,
      hasEntry: Boolean(resolveMatchingInnerEntry(isoDate, entries))
    }
  })
}

function resolveMatchingInnerEntry(dateText: string, entries: CharacterBrainTraceInnerEntry[]) {
  const matches = entries
    .map((entry) => {
      const range = resolveEntryDateRange(entry)
      if (!range) return null
      if (dateText < range.start || dateText > range.end) return null
      return {
        entry,
        span: estimateRangeDays(range.start, range.end)
      }
    })
    .filter(Boolean) as Array<{ entry: CharacterBrainTraceInnerEntry; span: number }>
  return matches.sort((left, right) => left.span - right.span)[0]?.entry || null
}

function resolveEntryDateRange(entry: CharacterBrainTraceInnerEntry) {
  const start = normalizeDateText(entry.startDate)
  if (!start) return null
  const end = normalizeDateText(entry.endDate) || inferEntryEndDate(start, entry.granularity)
  return {
    start,
    end: end >= start ? end : start
  }
}

function inferEntryEndDate(startDate: string, granularity: CharacterBrainTraceInnerEntry['granularity']) {
  const parsed = parseIsoDate(startDate)
  if (!parsed) return startDate
  if (granularity === 'day') return startDate
  if (granularity === 'month') {
    const nextMonth = createUtcDate(parsed.year, parsed.month + 1, 1)
    return formatUtcDate(addUtcDays(nextMonth, -1))
  }
  if (granularity === 'year') {
    return formatUtcDate(addUtcDays(createUtcDate(parsed.year + 1, 1, 1), -1))
  }
  if (granularity === 'decade') {
    return formatUtcDate(addUtcDays(createUtcDate(parsed.year + 10, 1, 1), -1))
  }
  return formatUtcDate(addUtcDays(createUtcDate(parsed.year + 100, 1, 1), -1))
}

function offsetCalendarMonth(monthStart: string, delta: number) {
  const parsed = parseIsoDate(monthStart)
  if (!parsed) return monthStart
  const shifted = createUtcDate(parsed.year, parsed.month + delta, 1)
  return formatMonthStart(shifted)
}

function formatCalendarTitle(monthStart: string) {
  const parsed = parseIsoDate(monthStart)
  if (!parsed) return ''
  return `${parsed.year}年${String(parsed.month).padStart(2, '0')}月`
}

function normalizeDateText(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()) ? String(value).trim() : ''
}

function parseIsoDate(value: string) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function addUtcDays(date: Date, delta: number) {
  return new Date(date.getTime() + (delta * 24 * 60 * 60 * 1000))
}

function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthStart(date: Date) {
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-01`
}

function normalizeWeekday(day: number) {
  return day === 0 ? 6 : day - 1
}

function estimateRangeDays(start: string, end: string) {
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  if (!startDate || !endDate) return Number.MAX_SAFE_INTEGER
  const startUtc = createUtcDate(startDate.year, startDate.month, startDate.day)
  const endUtc = createUtcDate(endDate.year, endDate.month, endDate.day)
  return Math.max(0, Math.round((endUtc.getTime() - startUtc.getTime()) / (24 * 60 * 60 * 1000)))
}
</script>

<style scoped>
.brain-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 220px;
  border: 1px solid rgba(27, 43, 26, 0.14);
  border-radius: 8px;
  background: var(--morandi-card);
  box-shadow: 0 12px 28px rgba(25, 40, 31, 0.12);
  box-sizing: border-box;
  padding: 8px 14px 14px;
  color: var(--morandi-text);
  scrollbar-width: none;
  -ms-overflow-style: none;
  overflow: hidden;
  overscroll-behavior: contain;
}

.brain-card::-webkit-scrollbar,
.brain-card__form::-webkit-scrollbar,
.brain-card__control--textarea::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.brain-card__header,
.brain-card__footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brain-card__header {
  position: relative;
  z-index: 4;
  justify-content: flex-start;
  margin: -8px -14px 0;
  padding: 8px 14px 6px;
  background: var(--morandi-card);
  border-bottom: 1px solid rgba(35, 49, 29, 0.08);
  backdrop-filter: blur(10px);
  cursor: grab;
}

.brain-card__header:active {
  cursor: grabbing;
}

.brain-card__titles {
  min-width: 0;
  flex: 1;
  font-size: 13px;
}

.brain-card__actions {
  margin-left: auto;
}

.brain-card__actions {
  display: flex;
  gap: 4px;
}

.brain-card__icon-btn {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.brain-card__icon-btn:hover {
  background: rgba(77, 101, 73, 0.08);
  color: var(--morandi-text);
}

.brain-card__icon-btn svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.brain-card__form {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(92px, 1fr);
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 2px 2px 4px 0;
}

.brain-card__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--morandi-text-light);
}

.brain-card__field--span-2 {
  grid-column: 1 / -1;
}

.brain-card__field--divider {
  border-top: 1px solid rgba(35, 49, 29, 0.12);
  padding-top: 10px;
}

.brain-card__field--link-editor {
  grid-column: 1 / -1;
  border-top: 1px solid rgba(35, 49, 29, 0.12);
  padding-top: 10px;
}

.brain-card__calendar {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(35, 49, 29, 0.12);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
  padding: 10px;
}

.brain-card__calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--morandi-text);
  font-size: 13px;
}

.brain-card__calendar-arrow {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: rgba(77, 101, 73, 0.08);
  color: var(--morandi-text);
  cursor: pointer;
}

.brain-card__calendar-weekdays,
.brain-card__calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.brain-card__calendar-weekdays span {
  text-align: center;
  font-size: 11px;
  color: var(--morandi-text-light);
}

.brain-card__calendar-day {
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
  font-size: 12px;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}

.brain-card__calendar-day:hover:not(:disabled) {
  background: rgba(111, 136, 96, 0.08);
}

.brain-card__calendar-day--muted {
  color: var(--morandi-text-light);
}

.brain-card__calendar-day--inactive {
  background: rgba(35, 49, 29, 0.05);
  border-color: rgba(35, 49, 29, 0.08);
  color: var(--morandi-text-light);
}

.brain-card__calendar-day--active {
  background: rgba(111, 136, 96, 0.16);
  border-color: rgba(111, 136, 96, 0.26);
  color: var(--morandi-text);
  font-weight: 600;
}

.brain-card__calendar-day:disabled {
  cursor: default;
  opacity: 1;
}

.brain-card__calendar-hint {
  margin: 0;
  color: var(--morandi-text-light);
  font-size: 11px;
}

.brain-card__control {
  width: 100%;
  border: 1px solid rgba(38, 56, 34, 0.12);
  border-radius: 6px;
  padding: 7px 9px;
  background: color-mix(in srgb, var(--langhuan-dialog-input-bg) 50%, transparent);
  color: var(--morandi-text);
  font-size: 13px;
  line-height: 1.45;
}

.brain-card__control:disabled {
  color: var(--morandi-text);
  background: transparent;
}

.brain-card__control--textarea {
  min-height: 70px;
  resize: vertical;
  scrollbar-width: none;
  -ms-overflow-style: none;
  overscroll-behavior: contain;
}

.brain-card__calendar-editor {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.brain-card__calendar-month-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.brain-card__calendar-month {
  display: grid;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: var(--morandi-text-light);
}

.brain-card__calendar-month-input {
  min-height: 30px;
  padding: 4px 6px;
}

.brain-card__calendar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.brain-card__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  color: var(--morandi-text);
  font-size: 12px;
}

.brain-card__checkbox input {
  width: 15px;
  height: 15px;
  accent-color: var(--morandi-primary, #7f9f82);
}

.brain-card__field--metric {
  align-self: end;
}

.brain-card__control--compact {
  min-width: 0;
  padding-left: 8px;
  padding-right: 8px;
}

.brain-card__control--narrow {
  max-width: 180px;
}

.brain-card__model-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.brain-card__link-editor {
  position: relative;
}

.brain-card__link-suggestions {
  position: absolute;
  z-index: 8;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  display: grid;
  gap: 4px;
  max-height: 190px;
  overflow: auto;
  border: 1px solid rgba(38, 56, 34, 0.16);
  border-radius: 8px;
  padding: 6px;
  background: color-mix(in srgb, var(--morandi-card) 98%, transparent);
  box-shadow: 0 10px 22px rgba(25, 40, 31, 0.14);
}

.brain-card__link-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 0;
  border-radius: 6px;
  padding: 7px 8px;
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
}

.brain-card__link-suggestion:hover,
.brain-card__link-suggestion--back {
  background: rgba(77, 101, 73, 0.08);
}

.brain-card__link-suggestion span {
  color: var(--morandi-text-light);
  font-size: 11px;
}

.brain-card__link-empty {
  padding: 8px;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.brain-card__avatar-picker {
  display: grid;
  gap: 8px;
}

.brain-card__avatar-preview {
  width: 64px;
  height: 64px;
  border: 1px solid rgba(38, 56, 34, 0.12);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 50%, transparent);
  color: var(--morandi-text-light);
  font-size: 12px;
  cursor: pointer;
  overflow: hidden;
}

.brain-card__avatar-preview:disabled {
  cursor: default;
}

.brain-card__avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.brain-card__avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.brain-card__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.brain-card__control--custom {
  font-size: 12px;
  padding-top: 6px;
  padding-bottom: 6px;
}

.brain-card__footer {
  flex: 0 0 30px;
  min-height: 30px;
  margin: 0 -14px -14px;
  padding: 3px 10px;
  border-top: 1px solid rgba(35, 49, 29, 0.1);
  background: transparent;
  justify-content: flex-end;
  pointer-events: none;
}

.brain-card__btn {
  border: 1px solid rgba(40, 59, 33, 0.14);
  border-radius: 6px;
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
  padding: 6px 12px;
  color: var(--morandi-text);
  font-size: 12px;
  cursor: pointer;
}

.brain-card__btn--compact {
  align-self: flex-start;
  padding: 5px 10px;
  font-size: 11.5px;
}

.brain-card__btn--primary {
  background: color-mix(in srgb, var(--morandi-accent) 16%, var(--morandi-card));
  color: var(--morandi-text);
}

.brain-card__btn--danger {
  background: color-mix(in srgb, var(--morandi-danger) 12%, var(--morandi-card));
  color: var(--morandi-danger);
}

.brain-card__pending {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(164, 112, 97, 0.24);
  border-radius: 10px;
  background: var(--morandi-soft-bg);
}

.brain-card__pending-head,
.brain-card__pending-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brain-card__pending-head span {
  color: var(--morandi-text);
  font-size: 12px;
}

.brain-card__pending-reason {
  margin: 0;
  color: var(--morandi-text);
  font-size: 12.5px;
  line-height: 1.6;
}

.brain-card__pending-panel {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 8px;
  background: var(--morandi-card);
  border: 1px solid rgba(69, 93, 63, 0.12);
}

.brain-card__pending-panel--current {
  border-color: rgba(99, 136, 86, 0.28);
  background: color-mix(in srgb, var(--morandi-accent) 10%, var(--morandi-card));
}

.brain-card__pending-panel pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  color: var(--morandi-text);
  line-height: 1.6;
}

.brain-card__pending-diff {
  display: grid;
  gap: 10px;
}

.brain-card__pending-diff-line {
  display: grid;
  gap: 4px;
}

.brain-card__pending-diff-label {
  font-size: 12px;
  color: var(--morandi-text);
}

.brain-card__pending-diff-value {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.brain-card__pending-diff-part {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
  padding: 4px 6px;
  border-radius: 6px;
}

.brain-card__pending-diff-part--add {
  background: rgba(96, 146, 92, 0.14);
  color: var(--morandi-accent);
}

.brain-card__pending-diff-part--remove {
  background: rgba(198, 96, 86, 0.14);
  color: var(--morandi-danger);
  text-decoration: line-through;
}

.brain-card__document {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
  font-size: 13px;
  line-height: 1.7;
}

.brain-card__compile-panel {
  margin: 12px 0;
}

.brain-card__document-workspace {
  display: flex;
  min-height: 150px;
  max-height: 320px;
  border: 1px solid rgba(38, 56, 34, 0.12);
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--morandi-card) 45%, transparent);
}

.brain-card__document-editor,
.brain-card__document-preview {
  flex: 1 1 0;
  min-width: 0;
}

.brain-card__document-editor.half {
  flex-basis: 50%;
}

.brain-card__markdown-textarea {
  width: 100%;
  height: 100%;
  min-height: 150px;
  border: 0;
  resize: none;
  outline: none;
  padding: 10px;
  background: transparent;
  color: var(--morandi-text);
  font: inherit;
  line-height: 1.65;
}

.brain-card__document-divider {
  flex: 0 0 1px;
  background: rgba(35, 49, 29, 0.1);
}

.brain-card__document-preview {
  overflow: auto;
  padding: 10px 12px;
}

.brain-card__markdown {
  color: var(--morandi-text);
  overflow-wrap: anywhere;
}

.brain-card__markdown :deep(h1),
.brain-card__markdown h1,
.brain-card__markdown :deep(h2),
.brain-card__markdown h2,
.brain-card__markdown :deep(h3),
.brain-card__markdown h3 {
  margin: 0 0 8px;
  color: var(--morandi-text);
  line-height: 1.35;
}

.brain-card__markdown :deep(p),
.brain-card__markdown p,
.brain-card__markdown :deep(li),
.brain-card__markdown li,
.brain-card__markdown :deep(blockquote),
.brain-card__markdown blockquote {
  margin: 0 0 8px;
}

.brain-card__markdown :deep(ul),
.brain-card__markdown ul {
  margin: 0 0 8px;
  padding-left: 18px;
}

.brain-card__markdown :deep(blockquote),
.brain-card__markdown blockquote {
  border-left: 3px solid rgba(77, 101, 73, 0.22);
  padding-left: 10px;
  color: var(--morandi-text-light);
}
</style>
