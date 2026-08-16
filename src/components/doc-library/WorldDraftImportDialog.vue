<template>
  <AppFormDialog
    :open="open"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    size="xl"
    height-preset="tall"
    @cancel="handleCancel"
  >
    <div class="wdi">
      <!-- 选文件态 -->
      <template v-if="phase === 'pick'">
        <label class="wdi__drop">
          <input class="wdi__file" type="file" accept=".json,application/json" @change="handleFilePicked" />
          <svg class="wdi__drop-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M12 18v-6" />
            <path d="m15 15-3-3-3 3" />
          </svg>
          <span class="wdi__drop-title">{{ $t('docLibrary.worldDraft.pickTitle') }}</span>
          <span class="wdi__drop-hint">{{ $t('docLibrary.worldDraft.pickHint') }}</span>
        </label>
        <div v-if="loading" class="wdi__note">{{ $t('docLibrary.sillyTavern.generatingPreview') }}</div>
        <div v-if="error" class="wdi__error">{{ error }}</div>
        <div class="wdi__note">{{ $t('docLibrary.worldDraft.incrementalNote') }}</div>
      </template>

      <!-- 预览 + 逐条决议态 -->
      <template v-else-if="phase === 'preview' && preview">
        <div class="wdi__stats">
          <span>{{ $t('docLibrary.worldDraft.statUnit') }}<b>{{ preview.stats.unitCount }}</b></span>
          <span>{{ $t('docLibrary.worldDraft.add') }}<b>{{ preview.stats.newCount }}</b></span>
          <span class="is-danger">{{ $t('docLibrary.worldDraft.statConflict') }}<b>{{ preview.stats.conflictCount }}</b></span>
          <span v-if="preview.stats.warningCount" class="is-gold">{{ $t('docLibrary.worldDraft.statWarning') }}<b>{{ preview.stats.warningCount }}</b></span>
        </div>

        <section v-if="conflictUnits.length" class="wdi__sect">
          <div class="wdi__sect-head">
            <span class="wdi__sect-title">{{ $t('docLibrary.worldDraft.statConflict') }}</span>
            <span class="wdi__sect-meta">{{ $t('docLibrary.worldDraft.resolved', { done: resolvedCount, total: conflictUnits.length }) }}</span>
            <span class="wdi__sect-grow"></span>
            <button type="button" class="wdi__txt-btn" @click="setAllConflicts('skip')">{{ $t('docLibrary.worldDraft.skipAll') }}</button>
            <button type="button" class="wdi__txt-btn" @click="setAllConflicts('overwrite')">{{ $t('docLibrary.worldDraft.overwriteAll') }}</button>
          </div>

          <div v-for="unit in conflictUnits" :key="unit.draftKey" class="wdi__row">
            <div class="wdi__line">
              <button type="button" class="wdi__chevron" :class="{ 'is-open': expandedKeys.has(unit.draftKey) }" :aria-label="expandedKeys.has(unit.draftKey) ? $t('docLibrary.worldDraft.collapseCompare') : $t('docLibrary.worldDraft.expandCompare')" @click="toggleExpanded(unit.draftKey)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              <span class="wdi__title">{{ unit.incoming.title }}</span>
              <span class="wdi__path">{{ unit.displayPath }}</span>
              <span class="wdi__delta">
                <span v-if="deltaFor(unit).added" class="wdi__delta-chip is-added">+{{ deltaFor(unit).added }}</span>
                <span v-if="deltaFor(unit).modified" class="wdi__delta-chip is-modified">~{{ deltaFor(unit).modified }}</span>
                <span v-if="deltaFor(unit).removed" class="wdi__delta-chip is-removed">-{{ deltaFor(unit).removed }}</span>
                <span v-if="deltaFor(unit).fieldChanged" class="wdi__delta-chip is-modified">{{ $t('docLibrary.worldDraft.deltaField') }}</span>
                <span v-if="deltaFor(unit).fallbackChanged" class="wdi__delta-chip is-modified">{{ $t('docLibrary.worldDraft.deltaChanged') }}</span>
                <span v-if="deltaFor(unit).unchanged" class="wdi__delta-chip is-none">{{ $t('docLibrary.worldDraft.deltaUnchanged') }}</span>
              </span>
              <span class="wdi__badge" :class="matchKindClass(unit.matchKind)">{{ matchKindLabel(unit.matchKind) }}</span>
              <span class="wdi__seg" role="radiogroup" :aria-label="$t('docLibrary.worldDraft.conflictDecisionAria')">
                <button type="button" :class="{ 'on-skip': modeOf(unit.draftKey) === 'skip' }" @click="setMode(unit.draftKey, 'skip')">{{ $t('docLibrary.worldDraft.skip') }}</button>
                <button type="button" :class="{ 'on-ow': modeOf(unit.draftKey) === 'overwrite' }" @click="setMode(unit.draftKey, 'overwrite')">{{ $t('docLibrary.worldDraft.overwrite') }}</button>
                <button type="button" :class="{ 'on-edit': modeOf(unit.draftKey) === 'edit' }" @click="setMode(unit.draftKey, 'edit')">{{ $t('docLibrary.worldDraft.editReapply') }}</button>
              </span>
            </div>

            <div v-if="expandedKeys.has(unit.draftKey)" class="wdi__cmp">
              <div class="wdi__cmp-col">
                <div class="wdi__cmp-head"><span>{{ $t('docLibrary.worldDraft.existingVersion') }}</span><span class="wdi__cmp-when">{{ $t('docLibrary.worldDraft.updatedAt', { day: formatDay(unit.existing?.updatedAt) }) }}</span></div>
                <div class="wdi__cmp-body">
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fSummary') }}</div>
                  <div class="wdi__f-text">{{ unit.existing?.summary || '—' }}</div>
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fTags') }}</div>
                  <div class="wdi__chips"><span v-for="tag in unit.existing?.tags || []" :key="tag" class="wdi__chip">{{ tag }}</span><span v-if="!(unit.existing?.tags || []).length" class="wdi__f-text">—</span></div>
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fRelation') }}</div>
                  <div class="wdi__f-rel">{{ (unit.existing?.relationHints || []).join('；') || '—' }}</div>
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fBody') }}</div>
                  <div class="wdi__body-box wdi__body-box--diff">
                    <template v-if="unit.existing?.content">
                      <div v-for="(line, lineIndex) in diffFor(unit).existingLines" :key="lineIndex" class="wdi__diff-line" :class="`is-${line.kind}`">{{ line.text }}</div>
                    </template>
                    <span v-else>{{ $t('docLibrary.worldDraft.empty') }}</span>
                  </div>
                </div>
              </div>
              <div class="wdi__cmp-col">
                <div class="wdi__cmp-head">
                  <span class="is-incoming">{{ $t('docLibrary.worldDraft.draftVersion') }}</span>
                  <span class="wdi__legend"><i class="is-added"></i>{{ $t('docLibrary.worldDraft.add') }}<i class="is-modified"></i>{{ $t('docLibrary.worldDraft.modified') }}</span>
                  <span class="wdi__cmp-when">worlds · {{ unit.path }}</span>
                </div>
                <div class="wdi__cmp-body">
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fSummary') }}</div>
                  <div class="wdi__f-text" :class="fieldClass(unit.existing?.summary || '', unit.incoming.summary)">{{ unit.incoming.summary || '—' }}</div>
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fTags') }}</div>
                  <div class="wdi__chips" :class="fieldClass((unit.existing?.tags || []).join('，'), unit.incoming.tags.join('，'))"><span v-for="tag in unit.incoming.tags" :key="tag" class="wdi__chip">{{ tag }}</span><span v-if="!unit.incoming.tags.length" class="wdi__f-text">—</span></div>
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fRelation') }}</div>
                  <div class="wdi__f-rel" :class="fieldClass((unit.existing?.relationHints || []).join('\n'), unit.incoming.relationHints.join('\n'))">{{ unit.incoming.relationHints.join('；') || '—' }}</div>
                  <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fBody') }}</div>
                  <div class="wdi__body-box wdi__body-box--diff">
                    <template v-if="unit.incoming.content">
                      <div v-for="(line, lineIndex) in diffFor(unit).incomingLines" :key="lineIndex" class="wdi__diff-line" :class="`is-${line.kind}`">{{ line.text }}</div>
                    </template>
                    <span v-else>{{ $t('docLibrary.worldDraft.empty') }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="modeOf(unit.draftKey) === 'edit'" class="wdi__editor">
              <div class="wdi__editor-head">
                <span>{{ $t('docLibrary.worldDraft.editHint') }}</span>
                <span class="wdi__sect-grow"></span>
                <button type="button" class="wdi__txt-btn is-gold-btn" @click="resetEdit(unit)">{{ $t('docLibrary.worldDraft.resetToDraft') }}</button>
              </div>
              <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fBody') }}</div>
              <textarea v-model="editStates[unit.draftKey].content" class="wdi__ed-area" rows="6"></textarea>
              <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fSummary') }}</div>
              <input v-model="editStates[unit.draftKey].summary" class="wdi__ed-input" type="text" />
              <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.fTags') }}</div>
              <div class="wdi__chips">
                <span v-for="(tag, index) in editStates[unit.draftKey].tags" :key="`${tag}-${index}`" class="wdi__chip wdi__chip--x">
                  {{ tag }}
                  <button type="button" :aria-label="$t('docLibrary.worldDraft.removeTagAria', { tag })" @click="removeEditTag(unit.draftKey, index)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                </span>
                <input
                  v-model="editStates[unit.draftKey].tagInput"
                  class="wdi__chip-input"
                  type="text"
                  :placeholder="$t('docLibrary.worldDraft.tagPlaceholder')"
                  @keydown.enter.prevent="addEditTag(unit.draftKey)"
                />
              </div>
              <div class="wdi__f-label">{{ $t('docLibrary.worldDraft.relationHintsLabel') }}</div>
              <textarea v-model="editStates[unit.draftKey].relationsText" class="wdi__ed-area" rows="3"></textarea>
            </div>
          </div>
        </section>

        <section class="wdi__sect">
          <button type="button" class="wdi__sect-head wdi__sect-head--toggle" @click="newListOpen = !newListOpen">
            <span class="wdi__chevron" :class="{ 'is-open': newListOpen }">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </span>
            <span class="wdi__sect-title">{{ $t('docLibrary.worldDraft.newCount', { count: preview.stats.newCount }) }}</span>
            <span class="wdi__sect-grow"></span>
            <span class="wdi__sect-meta">{{ $t('docLibrary.worldDraft.treePreview') }}</span>
          </button>
          <div v-if="newListOpen" class="wdi__new-list">
            <div v-for="unit in newUnits" :key="unit.draftKey" class="wdi__new-row">
              <span class="wdi__title">{{ unit.incoming.title }}</span>
              <span class="wdi__path">{{ unit.displayPath }}</span>
            </div>
          </div>
        </section>

        <div v-if="preview.warnings.length" class="wdi__warnings">
          <div v-for="(warning, index) in preview.warnings" :key="index" class="wdi__note">{{ warning }}</div>
        </div>

        <div v-if="error" class="wdi__error">{{ error }}</div>
      </template>

      <!-- 结果态 -->
      <template v-else-if="phase === 'result' && result">
        <div class="wdi__stats">
          <span>{{ $t('docLibrary.worldDraft.add') }}<b>{{ result.addedCount }}</b></span>
          <span>{{ $t('docLibrary.worldDraft.overwrite') }}<b>{{ result.overwrittenCount - result.editedCount }}</b></span>
          <span>{{ $t('docLibrary.worldDraft.editReapply') }}<b>{{ result.editedCount }}</b></span>
          <span>{{ $t('docLibrary.worldDraft.skip') }}<b>{{ result.skippedCount }}</b></span>
        </div>
        <section class="wdi__sect">
          <div v-for="outcome in visibleOutcomes" :key="outcome.draftKey" class="wdi__new-row">
            <span class="wdi__title" :class="{ 'is-muted': outcome.outcome === 'skipped' }">{{ outcome.title }}</span>
            <span class="wdi__path">{{ outcome.displayPath }}</span>
            <span class="wdi__res-badge" :class="outcomeClass(outcome.outcome)">{{ outcomeLabel(outcome.outcome) }}</span>
          </div>
          <div v-if="hiddenOutcomeCount > 0" class="wdi__new-row wdi__note">{{ $t('docLibrary.worldDraft.moreNew', { count: hiddenOutcomeCount }) }}</div>
        </section>
      </template>
    </div>

    <template #actions>
      <span v-if="phase === 'preview' && preview" class="wdi__foot-meta">{{ $t('docLibrary.worldDraft.footApplied', { new: preview.stats.newCount, overwrite: plannedOverwriteCount, edit: plannedEditCount, skip: plannedSkipCount }) }}</span>
      <span class="wdi__foot-grow"></span>
      <template v-if="phase === 'result'">
        <button type="button" class="wdi__btn wdi__btn--primary" @click="handleCancel">{{ $t('docLibrary.worldDraft.done') }}</button>
      </template>
      <template v-else>
        <button type="button" class="wdi__btn wdi__btn--secondary" :disabled="applying" @click="handleCancel">{{ $t('common.cancel') }}</button>
        <button
          v-if="phase === 'preview'"
          type="button"
          class="wdi__btn wdi__btn--primary"
          :disabled="applying || loading"
          @click="handleApply"
        >{{ applying ? $t('docLibrary.worldDraft.importing') : error ? $t('docLibrary.worldDraft.retryApply') : $t('docLibrary.worldDraft.applyImport') }}</button>
      </template>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppFormDialog from '../common/AppFormDialog.vue'
import { applyWorldDraftImport, previewWorldDraftImport } from '../../repositories/docBrainRepository'
import { diffWorldDraftField, diffWorldDraftText, type WorldDraftTextDiff } from '../../app/worldDraftTextDiff'
import type {
  WorldDraftApplyResult,
  WorldDraftConflictMatchKind,
  WorldDraftImportPreview,
  WorldDraftPreviewUnit,
  WorldDraftResolutionMap,
  WorldDraftUnitOutcome
} from '../../types'

// 世界观导入稿导入弹窗：选 contract JSON → 预览 → 冲突逐条决议（跳过/覆盖/修改再覆盖）→ 应用。
// 设计稿真值：docs/features/doc-library/世界观导入UI设计brief.md + claude_design「世界观导入稿导入流」。

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'applied', result: WorldDraftApplyResult): void
}>()

const { t } = useI18n()

type ConflictMode = 'skip' | 'overwrite' | 'edit'
type EditState = { content: string; summary: string; tags: string[]; relationsText: string; tagInput: string }

const phase = ref<'pick' | 'preview' | 'result'>('pick')
const fileName = ref('')
const contract = ref<unknown>(null)
const preview = ref<WorldDraftImportPreview | null>(null)
const result = ref<WorldDraftApplyResult | null>(null)
const loading = ref(false)
const applying = ref(false)
const error = ref('')
const newListOpen = ref(false)
const modes = reactive<Record<string, ConflictMode>>({})
const editStates = reactive<Record<string, EditState>>({})
const touchedKeys = reactive(new Set<string>())
const expandedKeys = reactive(new Set<string>())
// 对照 diff 只在展开时算一次，按 draftKey 缓存；换文件时随 resetAll 清空
const diffCache = new Map<string, WorldDraftTextDiff>()

watch(() => props.open, (open) => {
  if (open) resetAll()
})

function resetAll() {
  phase.value = 'pick'
  fileName.value = ''
  contract.value = null
  preview.value = null
  result.value = null
  loading.value = false
  applying.value = false
  error.value = ''
  newListOpen.value = false
  Object.keys(modes).forEach((key) => delete modes[key])
  Object.keys(editStates).forEach((key) => delete editStates[key])
  touchedKeys.clear()
  expandedKeys.clear()
  diffCache.clear()
  deltaCache.clear()
}

function diffFor(unit: WorldDraftPreviewUnit): WorldDraftTextDiff {
  const cached = diffCache.get(unit.draftKey)
  if (cached) return cached
  const diff = diffWorldDraftText(unit.existing?.content || '', unit.incoming.content)
  diffCache.set(unit.draftKey, diff)
  return diff
}

function fieldClass(existingValue: string, incomingValue: string) {
  const kind = diffWorldDraftField(existingValue, incomingValue)
  return kind === 'same' ? '' : `wdi__field--${kind}`
}

type UnitDelta = {
  added: number
  modified: number
  removed: number
  fieldChanged: boolean
  fallbackChanged: boolean
  unchanged: boolean
}

const deltaCache = new Map<string, UnitDelta>()

// 列表行变化指示：绿+n=新增行 · 金~n=修改行 · 红-n=删减行 · 字段=编译页字段有变 · 无变化=完全一致
function deltaFor(unit: WorldDraftPreviewUnit): UnitDelta {
  const cached = deltaCache.get(unit.draftKey)
  if (cached) return cached
  const diff = diffFor(unit)
  const added = diff.incomingLines.filter((line) => line.kind === 'added').length
  const modified = diff.incomingLines.filter((line) => line.kind === 'modified').length
  const removed = diff.existingLines.filter((line) => line.kind === 'removed').length
  const fieldChanged = diffWorldDraftField(unit.existing?.summary || '', unit.incoming.summary) !== 'same'
    || diffWorldDraftField((unit.existing?.tags || []).join('，'), unit.incoming.tags.join('，')) !== 'same'
    || diffWorldDraftField((unit.existing?.relationHints || []).join('\n'), unit.incoming.relationHints.join('\n')) !== 'same'
  // 超规模防卡回退时 diff.changed 为真但行计数全 0，用「有变化」兜底提示
  const fallbackChanged = diff.changed && added + modified + removed === 0
  const delta: UnitDelta = {
    added,
    modified,
    removed,
    fieldChanged,
    fallbackChanged: fallbackChanged && !fieldChanged,
    unchanged: !diff.changed && !fieldChanged
  }
  deltaCache.set(unit.draftKey, delta)
  return delta
}

const conflictUnits = computed(() => (preview.value?.units || []).filter((unit) => unit.status === 'conflict'))
const newUnits = computed(() => (preview.value?.units || []).filter((unit) => unit.status === 'new'))
const resolvedCount = computed(() => conflictUnits.value.filter((unit) => touchedKeys.has(unit.draftKey)).length)
const plannedOverwriteCount = computed(() => conflictUnits.value.filter((unit) => modeOf(unit.draftKey) === 'overwrite').length)
const plannedEditCount = computed(() => conflictUnits.value.filter((unit) => modeOf(unit.draftKey) === 'edit').length)
const plannedSkipCount = computed(() => conflictUnits.value.filter((unit) => modeOf(unit.draftKey) === 'skip').length)

const RESULT_LIST_LIMIT = 60
const visibleOutcomes = computed(() => {
  const outcomes = result.value?.outcomes || []
  // 非新增结果（覆盖/改后覆盖/跳过）优先展示，新增只露前若干条避免超长列表
  const decided = outcomes.filter((item) => item.outcome !== 'added')
  const added = outcomes.filter((item) => item.outcome === 'added')
  return [...decided, ...added].slice(0, RESULT_LIST_LIMIT)
})
const hiddenOutcomeCount = computed(() => Math.max(0, (result.value?.outcomes.length || 0) - RESULT_LIST_LIMIT))

const dialogTitle = computed(() => (phase.value === 'result' ? t('docLibrary.worldDraft.dialogTitleDone', { world: result.value?.world || '' }) : t('docLibrary.tree.importWorldDraft')))
const dialogSubtitle = computed(() => {
  if (phase.value === 'pick') return t('docLibrary.worldDraft.subtitlePick')
  if (phase.value === 'preview') return `${preview.value?.world || ''} · ${fileName.value}`
  if (!result.value) return ''
  return t('docLibrary.worldDraft.subtitleResult', { added: result.value.addedCount, overwrite: result.value.overwrittenCount - result.value.editedCount, edit: result.value.editedCount, skip: result.value.skippedCount })
})

function modeOf(draftKey: string): ConflictMode {
  return modes[draftKey] || 'skip'
}

function setMode(draftKey: string, mode: ConflictMode) {
  modes[draftKey] = mode
  touchedKeys.add(draftKey)
  if (mode === 'edit') {
    ensureEditState(draftKey)
    expandedKeys.add(draftKey)
  }
}

function setAllConflicts(mode: Exclude<ConflictMode, 'edit'>) {
  conflictUnits.value.forEach((unit) => {
    modes[unit.draftKey] = mode
    touchedKeys.add(unit.draftKey)
  })
}

function toggleExpanded(draftKey: string) {
  if (expandedKeys.has(draftKey)) expandedKeys.delete(draftKey)
  else expandedKeys.add(draftKey)
}

function ensureEditState(draftKey: string) {
  if (editStates[draftKey]) return
  const unit = conflictUnits.value.find((item) => item.draftKey === draftKey)
  if (!unit) return
  editStates[draftKey] = buildEditState(unit)
}

function buildEditState(unit: WorldDraftPreviewUnit): EditState {
  return {
    content: unit.incoming.content,
    summary: unit.incoming.summary,
    tags: [...unit.incoming.tags],
    relationsText: unit.incoming.relationHints.join('\n'),
    tagInput: ''
  }
}

function resetEdit(unit: WorldDraftPreviewUnit) {
  editStates[unit.draftKey] = buildEditState(unit)
}

function addEditTag(draftKey: string) {
  const state = editStates[draftKey]
  if (!state) return
  const tag = state.tagInput.trim()
  if (tag && !state.tags.includes(tag)) state.tags.push(tag)
  state.tagInput = ''
}

function removeEditTag(draftKey: string, index: number) {
  editStates[draftKey]?.tags.splice(index, 1)
}

function matchKindLabel(matchKind?: WorldDraftConflictMatchKind) {
  if (matchKind === 'source_id') return t('docLibrary.worldDraft.matchSourceId')
  if (matchKind === 'source_meta') return t('docLibrary.worldDraft.matchSourceMeta')
  return t('docLibrary.worldDraft.matchSamePath')
}

function matchKindClass(matchKind?: WorldDraftConflictMatchKind) {
  if (matchKind === 'source_id') return 'is-src'
  if (matchKind === 'source_meta') return 'is-meta'
  return 'is-path'
}

function outcomeLabel(outcome: WorldDraftUnitOutcome) {
  if (outcome === 'added') return t('docLibrary.worldDraft.add')
  if (outcome === 'overwritten') return t('docLibrary.worldDraft.overwrite')
  if (outcome === 'edited_overwritten') return t('docLibrary.worldDraft.editedOutcome')
  return t('docLibrary.worldDraft.skip')
}

function outcomeClass(outcome: WorldDraftUnitOutcome) {
  if (outcome === 'added') return 'is-add'
  if (outcome === 'overwritten') return 'is-ow'
  if (outcome === 'edited_overwritten') return 'is-edit'
  return 'is-skip'
}

function formatDay(value?: string) {
  const text = String(value || '').trim()
  return text ? text.slice(0, 10) : t('docLibrary.worldDraft.unknownDay')
}

async function handleFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    error.value = t('docLibrary.worldDraft.errInvalidJson')
    return
  }
  fileName.value = file.name
  contract.value = parsed
  loading.value = true
  try {
    preview.value = await previewWorldDraftImport(parsed)
    phase.value = 'preview'
  } catch (previewError) {
    preview.value = null
    error.value = (previewError as Error).message || t('docLibrary.toast.previewFailed')
  } finally {
    loading.value = false
  }
}

function buildResolutions(): WorldDraftResolutionMap {
  const resolutions: WorldDraftResolutionMap = {}
  conflictUnits.value.forEach((unit) => {
    const mode = modeOf(unit.draftKey)
    if (mode === 'skip') {
      resolutions[unit.draftKey] = { action: 'skip' }
      return
    }
    if (mode === 'overwrite') {
      resolutions[unit.draftKey] = { action: 'overwrite' }
      return
    }
    const state = editStates[unit.draftKey]
    resolutions[unit.draftKey] = state
      ? {
        action: 'overwrite',
        content: state.content,
        summary: state.summary,
        tags: [...state.tags],
        relationHints: state.relationsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      }
      : { action: 'overwrite' }
  })
  return resolutions
}

async function handleApply() {
  if (!contract.value || applying.value) return
  applying.value = true
  error.value = ''
  try {
    const applied = await applyWorldDraftImport(contract.value, buildResolutions())
    result.value = applied
    phase.value = 'result'
    emit('applied', applied)
  } catch (applyError) {
    error.value = (applyError as Error).message || t('docLibrary.worldDraft.errApplyFailed')
  } finally {
    applying.value = false
  }
}

function handleCancel() {
  if (applying.value) return
  emit('cancel')
}
</script>

<style scoped>
.wdi {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 0.92rem;
}

.wdi__drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 52px 20px;
  border: 1px dashed var(--morandi-border);
  border-radius: 10px;
  background: var(--morandi-soft-bg);
  color: var(--morandi-text-light);
  cursor: pointer;
}

.wdi__file {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.wdi__drop-icon {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: var(--morandi-text-light);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wdi__drop-title {
  color: var(--morandi-text);
}

.wdi__drop-hint,
.wdi__note {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.wdi__error {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.82rem;
  color: var(--morandi-danger);
  background: rgba(192, 102, 90, 0.08);
  border: 1px solid rgba(192, 102, 90, 0.28);
  border-radius: 8px;
  padding: 8px 12px;
}

.wdi__stats {
  display: flex;
  gap: 18px;
  align-items: baseline;
  font-size: 0.82rem;
  color: var(--morandi-text-light);
}

.wdi__stats b {
  font-weight: 600;
  color: var(--morandi-text);
  margin-left: 4px;
}

.wdi__stats .is-danger b {
  color: var(--morandi-danger);
}

.wdi__stats .is-gold b {
  color: #b08a2e;
}

.wdi__sect {
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: var(--morandi-card);
  overflow: hidden;
}

.wdi__sect-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  width: 100%;
  border: none;
  background: none;
  text-align: left;
  font-size: 0.82rem;
}

.wdi__sect-head--toggle {
  cursor: pointer;
}

.wdi__sect-title {
  font-weight: 600;
  color: var(--morandi-text);
}

.wdi__sect-meta {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.wdi__sect-grow,
.wdi__foot-grow {
  flex: 1;
}

.wdi__txt-btn {
  border: none;
  background: none;
  color: #8b7355;
  font-size: 0.82rem;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.wdi__txt-btn:hover {
  background: rgba(139, 115, 85, 0.08);
}

.wdi__txt-btn.is-gold-btn {
  color: #8a6f1d;
}

.wdi__row {
  border-top: 1px solid var(--morandi-border);
}

.wdi__line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
}

.wdi__chevron {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--morandi-text-light);
  cursor: pointer;
  padding: 0;
  flex: none;
}

.wdi__chevron svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s ease;
}

.wdi__chevron.is-open svg {
  transform: rotate(90deg);
}

.wdi__title {
  font-weight: 600;
  color: var(--morandi-text);
  flex: none;
}

.wdi__title.is-muted {
  color: var(--morandi-text-light);
}

.wdi__path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  color: var(--morandi-text-light);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wdi__badge {
  font-size: 0.72rem;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  flex: none;
}

.wdi__badge.is-src {
  background: rgba(139, 115, 85, 0.1);
  color: #7a6248;
  border-color: rgba(139, 115, 85, 0.25);
}

.wdi__badge.is-meta {
  background: rgba(160, 181, 196, 0.16);
  color: #5d7382;
  border-color: rgba(160, 181, 196, 0.4);
}

.wdi__badge.is-path {
  background: rgba(212, 184, 150, 0.18);
  color: #8a6f4d;
  border-color: rgba(212, 184, 150, 0.5);
}

.wdi__seg {
  display: inline-flex;
  border: 1px solid var(--morandi-border);
  border-radius: 6px;
  overflow: hidden;
  flex: none;
}

.wdi__seg button {
  font-size: 0.72rem;
  padding: 4px 10px;
  color: var(--morandi-text-light);
  border: none;
  border-left: 1px solid var(--morandi-border);
  background: none;
  cursor: pointer;
}

.wdi__seg button:first-child {
  border-left: none;
}

.wdi__seg button.on-skip {
  background: var(--morandi-soft-bg);
  color: var(--morandi-text);
  font-weight: 600;
}

.wdi__seg button.on-ow {
  background: rgba(92, 138, 92, 0.14);
  color: #3f6b3f;
  font-weight: 600;
}

.wdi__seg button.on-edit {
  background: rgba(212, 168, 67, 0.16);
  color: #8a6f1d;
  font-weight: 600;
}

.wdi__cmp {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 14px 12px 38px;
}

.wdi__cmp-col {
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-soft-bg);
  overflow: hidden;
  min-width: 0;
}

.wdi__cmp-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--morandi-border);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--morandi-text-light);
}

.wdi__cmp-head .is-incoming {
  color: #3f6b3f;
}

.wdi__cmp-when {
  font-weight: 400;
  color: var(--morandi-text-light);
  margin-left: auto;
}

.wdi__cmp-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wdi__f-label {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.wdi__f-text {
  font-size: 0.82rem;
  color: var(--morandi-text);
  line-height: 1.5;
}

.wdi__f-rel {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
  line-height: 1.5;
  word-break: break-all;
}

.wdi__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.wdi__chip {
  font-size: 0.72rem;
  padding: 1px 8px;
  border-radius: 6px;
  background: rgba(139, 115, 85, 0.08);
  color: var(--morandi-text);
}

.wdi__chip--x {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.wdi__chip--x button {
  border: none;
  background: none;
  padding: 0;
  display: inline-flex;
  cursor: pointer;
  color: var(--morandi-text-light);
}

.wdi__chip--x svg {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.wdi__chip-input {
  border: 1px dashed var(--morandi-border);
  border-radius: 6px;
  background: none;
  font-size: 0.72rem;
  padding: 1px 8px;
  width: 72px;
  color: var(--morandi-text);
}

.wdi__body-box {
  border: 1px solid var(--morandi-border);
  border-radius: 6px;
  background: var(--morandi-card);
  max-height: 130px;
  overflow: auto;
  padding: 8px 10px;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--morandi-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.wdi__body-box--diff {
  padding: 6px 0;
}

.wdi__diff-line {
  padding: 0 10px;
  min-height: 1.3em;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 高亮语义：绿=导入稿新增行，金=被修改行（两侧配对），红=库版将被移除行 */
.wdi__diff-line.is-added {
  background: rgba(92, 138, 92, 0.16);
}

.wdi__diff-line.is-modified {
  background: rgba(212, 168, 67, 0.2);
}

.wdi__diff-line.is-removed {
  background: rgba(192, 102, 90, 0.12);
}

.wdi__field--added {
  background: rgba(92, 138, 92, 0.16);
  border-radius: 4px;
  padding: 2px 6px;
}

.wdi__field--modified {
  background: rgba(212, 168, 67, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
}

.wdi__legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 400;
  color: var(--morandi-text-light);
}

.wdi__legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
  margin-left: 6px;
}

.wdi__legend i.is-added {
  background: rgba(92, 138, 92, 0.45);
}

.wdi__legend i.is-modified {
  background: rgba(212, 168, 67, 0.5);
}

.wdi__editor {
  border: 1px solid rgba(212, 168, 67, 0.45);
  border-radius: 8px;
  background: var(--morandi-card);
  margin: 0 14px 12px 38px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wdi__editor-head {
  display: flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: #8a6f1d;
}

.wdi__ed-input,
.wdi__ed-area {
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  padding: 8px 12px;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--morandi-text);
  font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", -apple-system, sans-serif;
  resize: vertical;
}

.wdi__ed-input:focus,
.wdi__ed-area:focus,
.wdi__chip-input:focus {
  outline: none;
  border-color: #8b7355;
}

.wdi__new-list {
  border-top: 1px solid var(--morandi-border);
  max-height: 220px;
  overflow: auto;
}

.wdi__new-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-top: 1px solid var(--morandi-border);
  font-size: 0.82rem;
}

.wdi__new-row:first-child {
  border-top: none;
}

.wdi__warnings {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wdi__res-badge {
  font-size: 0.72rem;
  padding: 1px 8px;
  border-radius: 999px;
  flex: none;
}

.wdi__res-badge.is-add {
  background: rgba(92, 138, 92, 0.14);
  color: #3f6b3f;
}

.wdi__res-badge.is-ow {
  background: rgba(139, 115, 85, 0.14);
  color: #6d5940;
}

.wdi__res-badge.is-edit {
  background: rgba(212, 168, 67, 0.16);
  color: #8a6f1d;
}

.wdi__res-badge.is-skip {
  background: color-mix(in srgb, var(--morandi-text) 8%, transparent);
  color: var(--morandi-text-light);
}

.wdi__foot-meta {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
  align-self: center;
}

/* 与 AppFormDialog 弹窗按钮同款（其样式 scoped 吃不到插槽内容，这里等价复刻，属联动能力：那边改这边同步） */
.wdi__btn {
  min-width: 112px;
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.wdi__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wdi__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.wdi__btn--secondary:hover:not(:disabled) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.wdi__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.wdi__btn--primary:hover:not(:disabled) {
  background: var(--langhuan-dialog-primary-bg-hover, #416f67);
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67);
}

.wdi__btn--primary:focus-visible,
.wdi__btn--secondary:focus-visible {
  outline: 2px solid var(--langhuan-dialog-focus-ring, rgba(79, 134, 124, 0.32));
  outline-offset: 2px;
}

.wdi__delta {
  display: inline-flex;
  gap: 4px;
  flex: none;
  align-items: center;
}

.wdi__delta-chip {
  font-size: 0.68rem;
  padding: 0 6px;
  border-radius: 999px;
  line-height: 1.5;
  font-weight: 600;
}

.wdi__delta-chip.is-added {
  background: rgba(92, 138, 92, 0.16);
  color: #3f6b3f;
}

.wdi__delta-chip.is-modified {
  background: rgba(212, 168, 67, 0.2);
  color: #8a6f1d;
}

.wdi__delta-chip.is-removed {
  background: rgba(192, 102, 90, 0.14);
  color: #a2554a;
}

.wdi__delta-chip.is-none {
  background: color-mix(in srgb, var(--morandi-text) 8%, transparent);
  color: var(--morandi-text-light);
  font-weight: 400;
}
</style>
