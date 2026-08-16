<template>
  <section class="personality-model-observation" :aria-label="$t('diagnostics.observation.aria')">
    <div v-if="errorText" class="personality-model-observation__notice personality-model-observation__notice--error">
      {{ errorText }}
    </div>
    <div v-else-if="!sessionId" class="personality-model-observation__notice">
      {{ $t('diagnostics.observation.noSession') }}
    </div>

    <div v-else class="personality-model-observation__main">
      <div class="observation-detail">
        <section class="detail-section">
          <header class="detail-section__header">
            <strong>{{ $t('diagnostics.observation.replyPlan') }}</strong>
            <span>{{ traceViews.length ? $t('diagnostics.observation.expandAllCandidates') : $t('diagnostics.observation.noRecord') }}</span>
          </header>

          <div v-if="traceViews.length" class="trace-accordion" :aria-label="$t('diagnostics.observation.planScoreAria')">
            <article
              v-for="trace in traceViews"
              :key="trace.id"
              :ref="(el) => setTraceCardRef(trace.id, el)"
              class="trace-card"
              :class="{ 'trace-card--open': isTraceOpen(trace.id) }"
            >
              <button
                type="button"
                class="trace-card__summary"
                :aria-expanded="isTraceOpen(trace.id)"
                @click="toggleTrace(trace.id)"
              >
                <span class="trace-card__summary-main">
                  <strong>{{ trace.title }}</strong>
                  <small>{{ trace.meta }}</small>
                </span>
                <span v-if="trace.selectedPlans.length || trace.expressionMix.length" class="selected-plan-strip">
                  <span v-if="trace.expressionMix.length" class="selected-plan-chip selected-plan-chip--synthesis">
                    <span>{{ $t('diagnostics.observation.expressionRatio') }}</span>
                    <strong>{{ expressionMixHint(trace.expressionMix) }}</strong>
                  </span>
                  <span v-for="plan in trace.selectedPlans" :key="plan.key" class="selected-plan-chip">
                    <span>{{ plan.shortText }}</span>
                    <strong>{{ plan.scoreText }}</strong>
                  </span>
                </span>
                <span v-else class="empty-line">{{ $t('diagnostics.observation.noSelectedPlan') }}</span>
                <span class="trace-card__toggle">{{ isTraceOpen(trace.id) ? $t('common.collapse') : $t('common.expand') }}</span>
              </button>

              <div v-if="isTraceOpen(trace.id)" class="trace-card__body">
                <section v-if="trace.expressionMix.length" class="trace-card__section">
                  <h4>{{ $t('diagnostics.observation.expressionRatio') }}</h4>
                  <div class="synthesis-panel">
                    <div class="synthesis-mix" :aria-label="$t('diagnostics.observation.roundExpressionRatioAria')">
                      <div
                        v-for="item in trace.expressionMix"
                        :key="item.key"
                        class="synthesis-mix__row"
                      >
                        <span>{{ item.label }}</span>
                        <div class="synthesis-mix__track">
                          <i :style="{ width: `${item.value}%` }"></i>
                        </div>
                        <strong>{{ item.value }}%</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="trace-card__section">
                  <h4>{{ $t('diagnostics.observation.selectedPlan') }}</h4>
                  <div v-if="trace.selectedPlans.length" class="selected-plan-list">
                    <article v-for="plan in trace.selectedPlans" :key="plan.key" class="selected-plan-row">
                      <div>
                        <span>{{ plan.scoreText }}</span>
                      </div>
                      <p>{{ plan.content }}</p>
                    </article>
                  </div>
                  <div v-else class="empty-line">{{ $t('diagnostics.observation.noSelectedPlanRecord') }}</div>
                </section>

                <section class="trace-card__section">
                  <h4>{{ $t('diagnostics.observation.allCandidatesScores') }}</h4>
                  <div class="candidate-list" :aria-label="$t('diagnostics.observation.candidatesScoresAria')">
                    <article
                      v-for="plan in trace.candidatePlans"
                      :key="plan.key"
                      class="candidate-row"
                      :class="{ 'candidate-row--selected': plan.selected }"
                    >
                      <div class="candidate-row__rank">
                        <span>{{ plan.order }}</span>
                        <strong>{{ plan.scoreText }}</strong>
                      </div>
                      <div class="candidate-row__body">
                        <div class="candidate-row__title">
                          <strong>{{ $t('diagnostics.observation.planN', { order: plan.order }) }}</strong>
                          <em v-if="plan.selected">{{ $t('diagnostics.observation.selected') }}</em>
                        </div>
                        <p>{{ plan.content }}</p>
                      </div>
                    </article>
                    <div v-if="!trace.candidatePlans.length" class="empty-line">{{ $t('diagnostics.observation.noCandidateRecord') }}</div>
                  </div>
                </section>

              </div>
            </article>
          </div>
          <div v-else class="empty-line empty-line--padded">{{ $t('diagnostics.observation.noProcessRecord') }}</div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchChatPersonalityModelObservationsBySessionId,
  type ChatGenerationAttemptArtifactEntry,
  type ChatPersonalityModelObservationPage
} from '../../../repositories/chatRepository'

const { t } = useI18n()

const props = defineProps<{
  sessionId: string
  getCharNameById?: (charId: string) => string
}>()

defineEmits<{
  (e: 'open-prompt-log', payload: { logId?: string }): void
}>()

const loading = ref(false)
const errorText = ref('')
const page = ref<ChatPersonalityModelObservationPage>({
  sessionId: '',
  projections: [],
  visibility: [],
  attempts: [],
  traces: []
})
const openTraceIds = ref<Record<string, boolean>>({})
// 记录每条 trace 卡片的 DOM，便于打开时滚动定位到最新一条
const traceCardEls = ref<Record<string, HTMLElement | null>>({})

const sessionId = computed(() => String(props.sessionId || '').trim())
// observations 的 traces 现含通用 reply_workflow_trace（普通召回过程轨）；本面板是人格模型专属审计视图，
// 只消费 personality_model_trace（无 kind 的旧记录按人格模型兜底），不得把普通召回 trace 渲染成人格观察卡。
const traces = computed(() => (page.value.traces || []).filter((trace) => {
  const kind = String((trace as Record<string, unknown>)?.artifactKind || '').trim()
  return !kind || kind === 'personality_model_trace'
}))

type ReadablePlan = {
  key: string
  order: number
  content: string
  shortText: string
  scoreText: string
  selected: boolean
}

type ReadableExpressionMixItem = {
  key: string
  label: string
  value: number
}

type ReadableTrace = {
  id: string
  title: string
  meta: string
  selectedPlans: ReadablePlan[]
  candidatePlans: ReadablePlan[]
  /** 表达占比唯一真值：编排器生成轮产出（批次2 前移、批次4 去融合后直接驱动最终回复）。 */
  expressionMix: ReadableExpressionMixItem[]
}

// key 是数据比较值保留；label 走 i18n（labelKey + readExpressionMix 里 t() 填充）
const EXPRESSION_MIX_LABELS: Array<{ key: string; labelKey: string }> = [
  { key: 'action', labelKey: 'diagnostics.observation.dimAction' },
  { key: 'dialogue', labelKey: 'diagnostics.observation.dimDialogue' },
  { key: 'expression', labelKey: 'diagnostics.observation.dimExpression' },
  { key: 'innerState', labelKey: 'diagnostics.observation.dimInnerState' },
  { key: 'narration', labelKey: 'diagnostics.observation.dimNarration' }
]

const traceViews = computed<ReadableTrace[]>(() => {
  // traces 后端按 created_at 升序返回：index 0 最旧，末尾最新。
  // 按真实消息顺序排列、按真实条数编号：最旧=第1条在最前，最新=第N条在最后。
  return traces.value.map((trace, index) => buildTraceView(trace, index + 1))
})

watch(sessionId, () => {
  reload()
}, { immediate: true })

async function reload() {
  if (!sessionId.value) {
    page.value = { sessionId: '', projections: [], visibility: [], attempts: [], traces: [] }
    openTraceIds.value = {}
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    page.value = await fetchChatPersonalityModelObservationsBySessionId(sessionId.value)
    ensureTraceOpenState()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error || t('diagnostics.observation.readFailed'))
  } finally {
    loading.value = false
  }
}

function formatScore(value: unknown): string {
  const score = Number(value)
  if (!Number.isFinite(score)) return t('diagnostics.observation.notScored')
  return String(Number(score.toFixed(6))).replace(/^-0$/, '0')
}

function buildTraceView(trace: ChatGenerationAttemptArtifactEntry, order: number): ReadableTrace {
  const payload = readPayload(trace)
  const orchestration = readObject(payload.orchestration ?? payload.orchestration_json)
  const candidateRows = readPlanRows(payload.candidatePlans ?? payload.candidate_plans)
  const topRows = readPlanRows(payload.topPlans ?? payload.top_plans)
  const expressionMix = readExpressionMix(payload.expressionMix ?? payload.expression_mix ?? orchestration?.expressionMix ?? orchestration?.expression_mix)
  const selectedKeys = buildSelectedPlanKeys(topRows)
  const selectedTexts = new Set(topRows.map((plan) => normalizePlanText(plan)).filter(Boolean))
  const candidatePlans = candidateRows.map((plan, index) => buildReadablePlan(plan, index, {
    selected: selectedKeys.has(String(plan.id || '')) || selectedTexts.has(normalizePlanText(plan))
  }))
  const selectedPlans = topRows.length
    ? topRows.map((plan, index) => buildReadablePlan(plan, index, { selected: true }))
    : candidatePlans
      .filter((plan) => plan.selected || plan.scoreText !== t('diagnostics.observation.notScored'))
      .slice()
      .sort((left, right) => readScoreNumber(right.scoreText) - readScoreNumber(left.scoreText))
      .slice(0, 3)
      .map((plan) => ({ ...plan, selected: true }))
  const speakerName = String(payload.speakerName || payload.speaker_name || payload.speakerTargetId || payload.speaker_target_id || '').trim()
  return {
    id: trace.id,
    title: t('diagnostics.observation.traceTitle', { order }),
    meta: [speakerName || t('diagnostics.observation.unknownSpeaker'), formatTraceTime(trace.createdAt)].filter(Boolean).join(' · '),
    selectedPlans,
    candidatePlans,
    expressionMix
  }
}

function readPayload(trace: ChatGenerationAttemptArtifactEntry): Record<string, any> {
  const payload = trace.payload
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, any> : {}
}

function readObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

function readPlanRows(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, any> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function readExpressionMix(value: unknown): ReadableExpressionMixItem[] {
  const mixRaw = readObject(value)
  if (!mixRaw) return []
  const items = EXPRESSION_MIX_LABELS.map((item) => ({
    key: item.key,
    label: t(item.labelKey),
    value: formatPercent(mixRaw[item.key] ?? mixRaw[toSnakeCase(item.key)])
  }))
  return items.some((item) => item.value > 0) ? items : []
}

function expressionMixHint(mix: ReadableExpressionMixItem[]): string {
  return mix
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((item) => `${item.label}${item.value}%`)
    .join(' · ')
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function formatPercent(value: unknown): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 0
  return Math.max(0, Math.min(100, Math.round(numberValue)))
}

function buildSelectedPlanKeys(plans: Array<Record<string, any>>): Set<string> {
  return new Set(plans.map((plan) => String(plan.id || '').trim()).filter(Boolean))
}

function buildReadablePlan(plan: Record<string, any>, index: number, options: { selected: boolean }): ReadablePlan {
  const content = normalizePlanText(plan) || t('diagnostics.observation.noContent')
  return {
    key: String(plan.id || `${index}_${content}`).trim() || `plan_${index + 1}`,
    order: index + 1,
    content,
    shortText: toShortText(content),
    scoreText: formatScore(plan.score),
    selected: options.selected
  }
}

function normalizePlanText(plan: Record<string, any>): string {
  return String(plan.content || plan.plan || plan.body || plan.replyPlan || plan.reply_plan || '').trim()
}

function toShortText(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > 36 ? `${text.slice(0, 35).trim()}...` : text || t('diagnostics.observation.noContent')
}

function readScoreNumber(value: string): number {
  const score = Number(String(value || '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? Number.NEGATIVE_INFINITY)
  return Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
}

function formatTraceTime(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function ensureTraceOpenState() {
  // 最新一条在数组末尾：默认展开它，并在渲染后滚动定位过去（打开时直接看到最新）
  const latest = traceViews.value[traceViews.value.length - 1]
  openTraceIds.value = latest?.id ? { [latest.id]: true } : {}
  scrollToLatestTrace()
}

function setTraceCardRef(traceId: string, el: unknown) {
  if (el instanceof HTMLElement) traceCardEls.value[traceId] = el
  else delete traceCardEls.value[traceId]
}

function scrollToLatestTrace() {
  nextTick(() => {
    const latest = traceViews.value[traceViews.value.length - 1]
    const el = latest?.id ? traceCardEls.value[latest.id] : null
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  })
}

function isTraceOpen(traceId: string): boolean {
  return Boolean(openTraceIds.value[traceId])
}

function toggleTrace(traceId: string) {
  openTraceIds.value = {
    ...openTraceIds.value,
    [traceId]: !openTraceIds.value[traceId]
  }
}
</script>

<style scoped>
.personality-model-observation {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--morandi-bg);
  color: var(--morandi-text);
}

.detail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(64, 50, 35, 0.12);
}

.detail-section__header strong {
  display: block;
  font-size: 14px;
}

.detail-section__header span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--morandi-text-light);
}

.personality-model-observation__main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.candidate-row__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-line,
.candidate-row small {
  font-size: 12px;
  color: var(--morandi-text-light);
}

.empty-line--padded {
  padding: 12px;
}

.observation-detail {
  height: 100%;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 10px;
}

.detail-section {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(64, 50, 35, 0.12);
  background: var(--morandi-card);
  border-radius: 8px;
  overflow: hidden;
}

.trace-accordion {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 1px;
  background: rgba(64, 50, 35, 0.08);
}

.trace-card {
  background: var(--morandi-card);
}

.trace-card--open {
  background: var(--morandi-hover);
}

.trace-card__summary {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: grid;
  grid-template-columns: minmax(150px, 0.28fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 11px 12px;
  text-align: left;
  cursor: pointer;
}

.trace-card__summary:hover {
  background: rgba(94, 76, 48, 0.05);
}

.trace-card__summary-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.trace-card__summary-main strong {
  font-size: 13px;
}

.trace-card__summary-main small {
  font-size: 12px;
  color: var(--morandi-text-light);
}

.selected-plan-strip {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.selected-plan-chip {
  min-width: 0;
  max-width: 240px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(64, 50, 35, 0.12);
  background: var(--morandi-hover);
  padding: 4px 7px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--morandi-text-light);
}

.selected-plan-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-plan-chip strong {
  flex: 0 0 auto;
  color: var(--morandi-text);
}

.selected-plan-chip--synthesis {
  border-color: rgba(92, 138, 92, 0.22);
  background: rgba(92, 138, 92, 0.1);
  color: #496849;
}

.selected-plan-chip--synthesis strong {
  color: #3f5f3f;
}

.trace-card__toggle {
  border: 1px solid rgba(64, 50, 35, 0.14);
  background: var(--morandi-card);
  color: var(--morandi-text-light);
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 12px;
}

.trace-card__body {
  display: grid;
  gap: 12px;
  padding: 0 12px 12px;
  max-height: min(620px, calc(100vh - 260px));
  overflow: auto;
  overscroll-behavior: contain;
}

.trace-card__section {
  display: grid;
  gap: 8px;
  border-top: 1px solid rgba(64, 50, 35, 0.1);
  padding-top: 10px;
}

.trace-card__section h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.synthesis-panel {
  display: grid;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(92, 138, 92, 0.18);
  background: rgba(92, 138, 92, 0.07);
  border-radius: 8px;
}

.synthesis-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--morandi-text-light);
}

.synthesis-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--morandi-card);
  border: 1px solid rgba(64, 50, 35, 0.1);
}

.synthesis-meta b {
  max-width: 220px;
  color: var(--morandi-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.synthesis-mix {
  display: grid;
  gap: 6px;
}

.synthesis-mix__row {
  display: grid;
  grid-template-columns: 38px minmax(70px, 1fr) 42px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--morandi-text-light);
}

.synthesis-mix__track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(64, 50, 35, 0.1);
}

.synthesis-mix__track i {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: inherit;
  background: var(--morandi-accent);
}

.synthesis-mix__row strong {
  font-size: 12px;
  color: var(--morandi-text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.synthesis-panel p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--morandi-text);
  white-space: pre-wrap;
}

.synthesis-guide {
  color: var(--morandi-text-light) !important;
}

.selected-plan-list {
  display: grid;
  gap: 1px;
  background: rgba(64, 50, 35, 0.08);
}

.selected-plan-row {
  padding: 9px 10px;
  background: var(--morandi-card);
}

.selected-plan-row > div {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  font-size: 13px;
}

.selected-plan-row > div span {
  flex: 0 0 auto;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.selected-plan-row p,
.candidate-row p {
  margin: 5px 0;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.selected-plan-row small {
  font-size: 12px;
  color: var(--morandi-text-light);
}

.candidate-list {
  display: grid;
  gap: 1px;
  background: rgba(64, 50, 35, 0.08);
}

.candidate-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  background: var(--morandi-card);
}

.candidate-row--selected {
  background: var(--morandi-hover);
}

.candidate-row__rank {
  min-width: 0;
  display: grid;
  align-content: start;
  justify-items: center;
  gap: 4px;
  color: var(--morandi-text-light);
}

.candidate-row__rank strong {
  max-width: 100%;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--morandi-text);
  overflow-wrap: anywhere;
  text-align: center;
}

.candidate-row__body {
  min-width: 0;
}

.candidate-row__title {
  flex-wrap: wrap;
  font-size: 13px;
}

.candidate-row__title em {
  font-style: normal;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.personality-model-observation__notice {
  padding: 10px 14px;
  color: var(--morandi-text-light);
  border-bottom: 1px solid rgba(64, 50, 35, 0.1);
}

.personality-model-observation__notice--error {
  color: var(--morandi-danger);
  background: color-mix(in srgb, var(--morandi-danger) 14%, transparent);
}

@media (max-width: 720px) {
  .trace-card__summary {
    grid-template-columns: 1fr;
  }

  .selected-plan-strip {
    flex-wrap: wrap;
  }

  .trace-card__toggle {
    justify-self: start;
  }
}
</style>
