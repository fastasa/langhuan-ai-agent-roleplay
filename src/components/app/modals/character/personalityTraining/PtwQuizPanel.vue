<template>
  <div class="ptw-quiz">
    <template v-if="currentGroup">
      <div class="ptw-quiz__track"><div class="ptw-quiz__track-fill" :style="{ width: progressPercent }"></div></div>
      <div class="ptw-quiz__meta">
        <span v-if="showThreshold">第 {{ currentRoundNumber }} 轮 · 本轮 {{ currentRoundPosition }} / {{ currentRoundGroups.length }} 题</span>
        <span v-else>第 {{ Math.min(idx + 1, groups.length) }} / {{ groups.length }} 题</span>
        <span>{{ standardAnswerMode ? '已定标准' : '人工' }} {{ showThreshold ? roundCounts.confirmed : counts.confirmed }}</span>
        <span v-if="showThreshold && roundCounts.confirmed">预设命中 {{ roundPresetHits }} / {{ roundCounts.confirmed }}</span>
        <span v-else>{{ standardAnswerMode ? '预设待选' : '预设代选' }} {{ counts.preset }}</span>
        <span v-if="counts.unresolved">未解决 {{ counts.unresolved }}</span>
        <div class="ptw-quiz__meta-right">
          <button
            type="button"
            class="ptw-quiz__jump-toggle"
            :aria-expanded="jumpOpen"
            aria-controls="ptw-quiz-jump-panel"
            @click="toggleJumpPanel"
          >
            跳题
            <span>{{ idx + 1 }} / {{ groups.length }}</span>
          </button>
          <template v-if="showThreshold">
            <span v-if="reachedFormal" class="ptw-quiz__formal-ok">
              <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M20 6 9 17l-5-5"></path></svg>
              已达正式训练标准（≥ {{ minFormal }} 题）
            </span>
            <span v-else class="ptw-quiz__tag ptw-quiz__tag--gold">有效答案不足 {{ minFormal }} 题 · 仅可生成实验模型</span>
          </template>
          <span v-if="currentGroup.dimension" class="ptw-quiz__tag">{{ currentGroup.dimension }}</span>
        </div>
      </div>

      <div v-if="jumpOpen" id="ptw-quiz-jump-panel" class="ptw-quiz__jump-panel">
        <form class="ptw-quiz__jump-form" @submit.prevent="jumpFromInput">
          <label for="ptw-quiz-jump-input">跳到第</label>
          <input
            id="ptw-quiz-jump-input"
            v-model.number="jumpInput"
            class="ptw-quiz__jump-input"
            type="number"
            inputmode="numeric"
            :min="1"
            :max="groups.length"
          />
          <span>题</span>
          <button type="submit" class="ptw-quiz__mini-btn ptw-quiz__mini-btn--primary">前往</button>
          <div class="ptw-quiz__jump-legend" aria-label="题目状态图例">
            <span><i class="ptw-quiz__jump-dot ptw-quiz__jump-dot--confirmed"></i>{{ standardAnswerMode ? '已定标准' : '人工' }}</span>
            <span><i class="ptw-quiz__jump-dot ptw-quiz__jump-dot--preset"></i>{{ standardAnswerMode ? '预设待选' : '预设' }}</span>
            <span><i class="ptw-quiz__jump-dot"></i>未选</span>
          </div>
        </form>
        <div class="ptw-quiz__jump-grid" aria-label="题目快速跳转">
          <button
            v-for="(group, groupIndex) in groups"
            :key="group.id"
            type="button"
            class="ptw-quiz__jump-number"
            :class="jumpNumberClass(group, groupIndex)"
            :aria-current="groupIndex === idx ? 'true' : undefined"
            :title="jumpNumberTitle(group, groupIndex)"
            @click="jumpTo(groupIndex)"
          >
            {{ groupIndex + 1 }}
          </button>
        </div>
      </div>

      <div class="ptw-quiz__scene" :class="{ 'ptw-quiz__scene--editable': editable }">
        <template v-if="isEditingQuestion(currentGroup.id)">
          <textarea v-model="editText" class="ptw-quiz__edit-field ptw-quiz__edit-field--scene" rows="4" @click.stop></textarea>
          <div class="ptw-quiz__edit-actions">
            <button type="button" class="ptw-quiz__mini-btn" @click.stop="cancelEdit">取消</button>
            <button type="button" class="ptw-quiz__mini-btn ptw-quiz__mini-btn--primary" :disabled="!editText.trim()" @click.stop="saveEdit">保存</button>
          </div>
        </template>
        <template v-else>
          <div class="ptw-quiz__scene-text">{{ currentGroup.question }}</div>
          <button v-if="editable && !locked" type="button" class="ptw-quiz__edit-btn ptw-quiz__scene-edit" title="编辑情境" aria-label="编辑情境" @click.stop="startQuestionEdit">
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
        </template>
      </div>
      <div class="ptw-quiz__prompt">{{ promptLine }}</div>

      <div class="ptw-quiz__plans">
        <div
          v-for="(candidate, i) in currentGroup.candidates"
          :key="candidate.id"
          class="ptw-quiz__plan-shell"
        >
          <div v-if="isEditingCandidate(currentGroup.id, candidate.id)" class="ptw-quiz__plan ptw-quiz__plan--editing">
            <span class="ptw-quiz__plan-key">{{ keyLabel(i) }}</span>
            <div class="ptw-quiz__edit-body">
              <textarea v-model="editText" class="ptw-quiz__edit-field" rows="3" @click.stop></textarea>
              <div class="ptw-quiz__edit-actions">
                <button type="button" class="ptw-quiz__mini-btn" @click.stop="cancelEdit">取消</button>
                <button type="button" class="ptw-quiz__mini-btn ptw-quiz__mini-btn--primary" :disabled="!editText.trim()" @click.stop="saveEdit">保存</button>
              </div>
            </div>
          </div>
          <button
            v-else
            type="button"
            class="ptw-quiz__plan"
            :disabled="locked"
            :class="{
              'ptw-quiz__plan--picked': selectedAnswerSource === 'confirmed' && selectedAnswerId === candidate.id,
              'ptw-quiz__plan--preset': selectedAnswerSource === 'preset' && selectedAnswerId === candidate.id
            }"
            @click="pick(candidate.id)"
          >
            <span class="ptw-quiz__plan-key">{{ keyLabel(i) }}</span>
            <span class="ptw-quiz__plan-text">{{ candidate.text }}</span>
            <span
              v-if="selectedAnswerId === candidate.id"
              class="ptw-quiz__answer-label"
              :class="{ 'ptw-quiz__answer-label--preset': selectedAnswerSource === 'preset' }"
            >
              {{ selectedAnswerLabel }}
            </span>
          </button>
          <button v-if="editable && !locked && !isEditingCandidate(currentGroup.id, candidate.id)" type="button" class="ptw-quiz__edit-btn ptw-quiz__plan-edit" title="编辑应对方式" aria-label="编辑应对方式" @click.stop="startCandidateEdit(candidate.id, candidate.text)">
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
        </div>
      </div>

      <div v-if="showThreshold && currentRoundComplete" class="ptw-quiz__round-done">
        <b>第 {{ currentRoundNumber }} 轮已人工确认完成</b>
        <span>预设命中 {{ roundPresetHits }} / {{ roundCounts.confirmed }}（{{ roundPresetHitPercent }}）</span>
        <span>请让左侧鉴心复盘“更丰满还是可能矛盾”，再由你确认是否生成下一轮。</span>
      </div>

      <div class="ptw-quiz__acts">
        <button type="button" class="ptw-quiz__act-btn" :disabled="idx <= 0" @click="prev">上一题</button>
        <button type="button" class="ptw-quiz__act-btn" :disabled="idx >= groups.length - 1" @click="next">下一题</button>
        <span class="ptw-quiz__spacer"></span>
        <span class="ptw-quiz__kbd-hint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>选择</span>
        <span class="ptw-quiz__kbd-hint"><kbd>→</kbd>下一题</span>
        <span class="ptw-quiz__kbd-hint"><kbd>←</kbd>上一题</span>
      </div>
    </template>

    <div v-else class="ptw-quiz__done">
      <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="26" height="26"><path d="M18 6 7 17l-5-5"></path><path d="m22 10-7.5 7.5L13 16"></path></svg>
      <div class="ptw-quiz__done-title">暂无可显示的题目</div>
      <div class="ptw-quiz__done-desc">请先完成出题或选择一套问卷。</div>
      <div class="ptw-quiz__done-acts">
        <slot name="done" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  countResolvedQuestionAnswers,
  resolvePersonalityQuestionAnswer,
  type PersonalityAnswerMap,
  type PersonalityQuestionGroup
} from '../../../../../app/personalityTrainingWorkflow'

// 沉浸单题答题面板（CD 定稿“卡片三选一”）：训练题与冻结评测题作答共用同一套交互。
const props = withDefaults(defineProps<{
  groups: PersonalityQuestionGroup[]
  answers: PersonalityAnswerMap
  showThreshold?: boolean
  minFormal?: number
  promptLine?: string
  editable?: boolean
  locked?: boolean
  standardAnswerMode?: boolean
}>(), {
  showThreshold: false,
  minFormal: 60,
  promptLine: '该角色最可能怎么做？',
  editable: false,
  locked: false,
  standardAnswerMode: false
})

const emit = defineEmits<{
  (e: 'pick', groupId: string, candidateId: string): void
  (e: 'edit-question', groupId: string, question: string): void
  (e: 'edit-candidate', groupId: string, candidateId: string, text: string): void
}>()

const idx = ref(0)
const pickedId = ref<string | null>(null)
const editing = ref<{ type: 'question' | 'candidate'; groupId: string; candidateId?: string } | null>(null)
const editText = ref('')
const jumpOpen = ref(false)
const jumpInput = ref<number | ''>(1)
const counts = computed(() => countResolvedQuestionAnswers(props.groups, props.answers))
const currentGroup = computed(() => props.groups[idx.value] || null)
const roundSize = 20
const currentRoundStart = computed(() => Math.floor(idx.value / roundSize) * roundSize)
const currentRoundGroups = computed(() => props.groups.slice(currentRoundStart.value, currentRoundStart.value + roundSize))
const currentRoundNumber = computed(() => Math.floor(idx.value / roundSize) + 1)
const currentRoundPosition = computed(() => idx.value - currentRoundStart.value + 1)
const roundCounts = computed(() => countResolvedQuestionAnswers(currentRoundGroups.value, props.answers))
const roundPresetHits = computed(() => currentRoundGroups.value.reduce((hits, group) => {
  const resolved = resolvePersonalityQuestionAnswer(group, props.answers)
  return hits + (resolved?.source === 'confirmed' && resolved.candidateId === group.presetAnswerId ? 1 : 0)
}, 0))
const currentRoundComplete = computed(() => (
  currentRoundGroups.value.length === roundSize && roundCounts.value.confirmed === roundSize
))
const roundPresetHitPercent = computed(() => (
  roundCounts.value.confirmed
    ? `${Math.round((roundPresetHits.value / roundCounts.value.confirmed) * 100)}%`
    : '—'
))
const selectedAnswerSource = computed(() => {
  const group = currentGroup.value
  if (!group) return null
  if (pickedId.value) return 'confirmed'
  return resolvePersonalityQuestionAnswer(group, props.answers)?.source || null
})
const selectedAnswerId = computed(() => {
  if (pickedId.value) return pickedId.value
  const group = currentGroup.value
  return group ? String(resolvePersonalityQuestionAnswer(group, props.answers)?.candidateId || '') : ''
})
const selectedAnswerLabel = computed(() => {
  if (selectedAnswerSource.value === 'confirmed') {
    return props.standardAnswerMode ? '标准答案' : '人工选择'
  }
  if (selectedAnswerSource.value === 'preset') {
    return props.standardAnswerMode ? '预设待选' : '预设代选'
  }
  return ''
})
const reachedFormal = computed(() => counts.value.resolved >= props.minFormal)
const progressPercent = computed(() => {
  const total = props.showThreshold ? (currentRoundGroups.value.length || 1) : (props.groups.length || 1)
  const done = props.showThreshold
    ? Math.min(total, roundCounts.value.confirmed)
    : Math.min(total, counts.value.resolved)
  return `${Math.round((done / total) * 100)}%`
})

function firstUnconfirmedIndex(groups = props.groups) {
  const index = groups.findIndex((group) => resolvePersonalityQuestionAnswer(group, props.answers)?.source !== 'confirmed')
  return index < 0 ? 0 : index
}

function keyLabel(i: number) {
  return String.fromCharCode(65 + i)
}

function answerSource(group: PersonalityQuestionGroup) {
  return resolvePersonalityQuestionAnswer(group, props.answers)?.source || 'unresolved'
}

function jumpNumberClass(group: PersonalityQuestionGroup, groupIndex: number) {
  return [
    `ptw-quiz__jump-number--${answerSource(group)}`,
    { 'ptw-quiz__jump-number--current': groupIndex === idx.value }
  ]
}

function jumpNumberTitle(group: PersonalityQuestionGroup, groupIndex: number) {
  const source = answerSource(group)
  const sourceLabel = source === 'confirmed'
    ? (props.standardAnswerMode ? '标准答案' : '人工选择')
    : source === 'preset'
      ? (props.standardAnswerMode ? '预设待选' : '预设代选')
      : '未选择'
  return `第 ${groupIndex + 1} 题 · ${group.dimension || '未分维度'} · ${sourceLabel}`
}

function pick(candidateId: string) {
  const group = currentGroup.value
  if (!group || editing.value || props.locked) return
  pickedId.value = candidateId
  emit('pick', group.id, candidateId)
}

function setCurrentIndex(nextIndex: number) {
  const lastIndex = Math.max(0, props.groups.length - 1)
  idx.value = Math.min(lastIndex, Math.max(0, nextIndex))
  jumpInput.value = idx.value + 1
  pickedId.value = null
}

function next() {
  if (editing.value) return
  setCurrentIndex(idx.value + 1)
}

function prev() {
  if (editing.value) return
  setCurrentIndex(idx.value - 1)
}

function toggleJumpPanel() {
  jumpOpen.value = !jumpOpen.value
  jumpInput.value = idx.value + 1
}

function jumpTo(groupIndex: number) {
  if (editing.value) return
  setCurrentIndex(groupIndex)
  jumpOpen.value = false
}

function jumpFromInput() {
  const target = Number(jumpInput.value)
  if (!Number.isFinite(target)) {
    jumpInput.value = idx.value + 1
    return
  }
  jumpTo(Math.round(target) - 1)
}

function isEditingQuestion(groupId: string) {
  return editing.value?.type === 'question' && editing.value.groupId === groupId
}

function isEditingCandidate(groupId: string, candidateId: string) {
  return editing.value?.type === 'candidate' && editing.value.groupId === groupId && editing.value.candidateId === candidateId
}

function startQuestionEdit() {
  const group = currentGroup.value
  if (!group || !props.editable) return
  editing.value = { type: 'question', groupId: group.id }
  editText.value = group.question
}

function startCandidateEdit(candidateId: string, text: string) {
  const group = currentGroup.value
  if (!group || !props.editable) return
  editing.value = { type: 'candidate', groupId: group.id, candidateId }
  editText.value = text
}

function cancelEdit() {
  editing.value = null
  editText.value = ''
}

function saveEdit() {
  const item = editing.value
  const value = editText.value.trim()
  if (!item || !value) return
  if (item.type === 'question') {
    emit('edit-question', item.groupId, value)
  } else if (item.candidateId) {
    emit('edit-candidate', item.groupId, item.candidateId, value)
  }
  cancelEdit()
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
  if (event.isComposing) return
  if (editing.value) return
  const group = currentGroup.value
  if (!group) return
  if (event.key >= '1' && event.key <= '9') {
    const candidate = group.candidates[Number(event.key) - 1]
    if (candidate) pick(candidate.id)
  } else if (event.key === 'ArrowRight') {
    next()
  } else if (event.key === 'ArrowLeft') {
    prev()
  }
}

watch(() => props.groups, (groups, previousGroups) => {
  const previousGroupId = previousGroups?.[idx.value]?.id
  const preservedIndex = previousGroupId
    ? groups.findIndex((group) => group.id === previousGroupId)
    : -1
  idx.value = preservedIndex >= 0 ? preservedIndex : firstUnconfirmedIndex(groups)
  jumpInput.value = idx.value + 1
  pickedId.value = null
  cancelEdit()
}, { immediate: true })

watch(() => currentGroup.value?.id, () => {
  cancelEdit()
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.ptw-quiz {
  width: 100%;
  max-width: none;
}

.ptw-quiz__track {
  height: 3px;
  border-radius: 2px;
  background: rgba(139, 115, 85, 0.14);
  overflow: hidden;
}

.ptw-quiz__track-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--morandi-accent, #5c8a5c);
  transition: width 0.4s ease;
}

.ptw-quiz__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  row-gap: 5px;
  flex-wrap: wrap;
  margin: 8px 0 16px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.76rem;
}

.ptw-quiz__meta-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ptw-quiz__jump-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 90%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #8a8278);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.ptw-quiz__jump-toggle:hover,
.ptw-quiz__jump-toggle[aria-expanded='true'] {
  border-color: color-mix(in srgb, var(--morandi-accent) 38%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-accent) 7%, transparent);
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__jump-toggle span {
  font-variant-numeric: tabular-nums;
}

.ptw-quiz__jump-panel {
  margin: -7px 0 14px;
  padding: 10px 12px 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 94%, transparent);
}

.ptw-quiz__jump-form {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.76rem;
}

.ptw-quiz__jump-input {
  width: 66px;
  height: 29px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 6px;
  background: var(--langhuan-dialog-input-bg, var(--morandi-card));
  color: var(--morandi-text, #4f463f);
  font: inherit;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.ptw-quiz__jump-input:focus {
  border-color: color-mix(in srgb, var(--morandi-accent) 55%, var(--morandi-border));
}

.ptw-quiz__jump-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.ptw-quiz__jump-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ptw-quiz__jump-dot {
  width: 7px;
  height: 7px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 50%;
  background: transparent;
}

.ptw-quiz__jump-dot--confirmed {
  border-color: var(--morandi-accent, #5c8a5c);
  background: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__jump-dot--preset {
  border-color: #b18a31;
  background: #b18a31;
}

.ptw-quiz__jump-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(31px, 1fr));
  gap: 5px;
  max-height: 154px;
  margin-top: 9px;
  overflow-y: auto;
}

.ptw-quiz__jump-number {
  min-width: 31px;
  height: 28px;
  padding: 0 3px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 86%, transparent);
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light, #8a8278);
  font: inherit;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.ptw-quiz__jump-number:hover {
  background: color-mix(in srgb, var(--morandi-hover) 90%, transparent);
}

.ptw-quiz__jump-number--confirmed {
  border-color: color-mix(in srgb, var(--morandi-accent) 46%, var(--morandi-border));
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__jump-number--preset {
  border-color: color-mix(in srgb, #b18a31 44%, var(--morandi-border));
  color: #9a741f;
}

.ptw-quiz__jump-number--current {
  background: var(--morandi-accent, #5c8a5c);
  border-color: var(--morandi-accent, #5c8a5c);
  color: white;
  font-weight: 600;
}

.ptw-quiz__formal-ok {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(139, 115, 85, 0.1);
  color: #8b7355;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
}

.ptw-quiz__tag--gold {
  background: rgba(212, 168, 67, 0.16);
  color: #a07c1e;
}

.ptw-quiz__scene {
  position: relative;
  margin: 10px 0 14px;
  color: var(--morandi-text, #4f463f);
  font-size: 1rem;
  line-height: 1.7;
}

.ptw-quiz__scene--editable {
  padding-right: 34px;
}

.ptw-quiz__scene-text {
  white-space: pre-wrap;
}

.ptw-quiz__prompt {
  margin-bottom: 10px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.76rem;
}

.ptw-quiz__plans {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ptw-quiz__plan-shell {
  position: relative;
}

.ptw-quiz__plan {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 42px 20px 14px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.ptw-quiz__plan:hover {
  border-color: rgba(139, 115, 85, 0.5);
}

.ptw-quiz__plan:disabled {
  cursor: default;
}

.ptw-quiz__plan--picked {
  border-color: rgba(92, 138, 92, 0.55);
  background: rgba(92, 138, 92, 0.07);
}

.ptw-quiz__plan--preset {
  border-color: color-mix(in srgb, var(--morandi-accent) 34%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-soft-bg) 92%, var(--morandi-accent));
}

.ptw-quiz__plan--editing {
  cursor: default;
}

.ptw-quiz__plan-key {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 90%, transparent);
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.7rem;
  font-weight: 600;
}

.ptw-quiz__plan--picked .ptw-quiz__plan-key {
  border-color: var(--morandi-accent, #5c8a5c);
  background: rgba(92, 138, 92, 0.1);
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__plan-text {
  flex: 1;
  color: var(--morandi-text, #4f463f);
  font-size: 0.88rem;
  line-height: 1.65;
}

.ptw-quiz__answer-label {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--morandi-accent, #5c8a5c);
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
}

.ptw-quiz__answer-label--preset {
  color: var(--morandi-text-light, #8a8278);
  font-weight: 500;
}

.ptw-quiz__edit-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 94%, transparent);
  color: var(--morandi-text-light, #8a8278);
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.ptw-quiz__edit-btn:hover {
  border-color: rgba(92, 138, 92, 0.5);
  background: rgba(92, 138, 92, 0.08);
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__scene-edit {
  position: absolute;
  right: 0;
  bottom: 4px;
}

.ptw-quiz__plan-edit {
  position: absolute;
  right: 8px;
  bottom: 8px;
}

.ptw-quiz__edit-body {
  flex: 1;
}

.ptw-quiz__edit-field {
  width: 100%;
  min-height: 74px;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 98%, transparent);
  color: var(--morandi-text, #4f463f);
  font: inherit;
  font-size: 0.86rem;
  line-height: 1.6;
  outline: none;
}

.ptw-quiz__edit-field:focus {
  border-color: rgba(92, 138, 92, 0.62);
  box-shadow: 0 0 0 2px rgba(92, 138, 92, 0.08);
}

.ptw-quiz__edit-field--scene {
  min-height: 96px;
}

.ptw-quiz__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.ptw-quiz__mini-btn {
  padding: 5px 11px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 94%, transparent);
  color: var(--morandi-text, #4f463f);
  font-size: 0.78rem;
  cursor: pointer;
}

.ptw-quiz__mini-btn--primary {
  border-color: rgba(92, 138, 92, 0.46);
  background: rgba(92, 138, 92, 0.11);
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__mini-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.ptw-quiz__round-done {
  display: flex;
  align-items: center;
  gap: 8px 14px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 9px 11px;
  border-left: 3px solid var(--morandi-accent, #5c8a5c);
  background: color-mix(in srgb, var(--morandi-accent) 7%, transparent);
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.75rem;
  line-height: 1.5;
}

.ptw-quiz__round-done b {
  color: var(--morandi-text, #4f463f);
  font-weight: 600;
}

.ptw-quiz__acts {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.ptw-quiz__act-btn {
  padding: 6px 13px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text, #4f463f);
  font-size: 0.82rem;
  cursor: pointer;
}

.ptw-quiz__act-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--morandi-hover) 96%, transparent);
}

.ptw-quiz__act-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.ptw-quiz__spacer {
  flex: 1;
}

.ptw-quiz__kbd-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.72rem;
}

.ptw-quiz__kbd-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text-light, #8a8278);
  font-family: ui-monospace, monospace;
  font-size: 0.66rem;
}

.ptw-quiz__done {
  padding: 48px 20px;
  text-align: center;
  color: var(--morandi-text-light, #8a8278);
}

.ptw-quiz__done > .line-icon {
  color: var(--morandi-accent, #5c8a5c);
}

.ptw-quiz__done-title {
  margin-top: 12px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.92rem;
}

.ptw-quiz__done-desc {
  margin-top: 5px;
  font-size: 0.78rem;
  line-height: 1.6;
}

.ptw-quiz__done-acts {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  justify-content: center;
}

@media (max-width: 760px) {
  .ptw-quiz__jump-form {
    flex-wrap: wrap;
  }

  .ptw-quiz__jump-legend {
    width: 100%;
    margin-left: 0;
  }
}
</style>
