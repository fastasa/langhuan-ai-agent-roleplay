<template>
  <div class="recall-activity-panel">
    <header class="recall-activity-panel__header">
      <div>
        <strong>{{ panelTitle }}</strong>
        <span>{{ panelSubtitle }}</span>
      </div>
      <div class="recall-activity-panel__header-actions">
        <button
          v-if="props.canUseDetailPanel"
          type="button"
          class="recall-activity-panel__mode-button"
          :title="isDetailPanel ? t('diagnostics.recallTrace.toProcess') : t('diagnostics.recallTrace.toDetails')"
          :aria-label="isDetailPanel ? t('diagnostics.recallTrace.toProcess') : t('diagnostics.recallTrace.toDetails')"
          @click="togglePanelMode"
        >{{ isDetailPanel ? t('diagnostics.recallTrace.tabProcess') : t('diagnostics.recallTrace.tabDetails') }}</button>
        <button type="button" :title="t('diagnostics.recallPool.closeSidebar')" :aria-label="t('diagnostics.recallPool.closeSidebar')" @click="closePanel">×</button>
      </div>
    </header>

    <nav v-if="props.messageNavigationItems.length" class="recall-activity-panel__message-nav" :aria-label="t('diagnostics.recallTrace.messageNavAria')">
      <button
        v-for="item in props.messageNavigationItems"
        :key="item.messageId"
        type="button"
        class="recall-activity-panel__message-nav-item"
        :class="{ 'recall-activity-panel__message-nav-item--active': item.messageId === props.activeMessageId }"
        :title="`${item.speakerName}: ${item.excerpt}`"
        @click="emit('select-message', item.messageId)"
      >
        <span>{{ item.role === 'user' ? t('chat.meFallback') : item.speakerName }}</span>
        <strong>{{ item.excerpt }}</strong>
      </button>
    </nav>

    <template v-if="activity && !isDetailPanel">
      <section class="recall-activity-panel__public-summary" :aria-label="t('diagnostics.recallTrace.processOverviewAria')">
        <span>{{ publicStatusLabel }}</span>
        <strong>{{ publicHeadline }}</strong>
        <small>{{ publicSummaryText }}</small>
      </section>

      <section
        v-if="cachedConfirmedUnits.length"
        class="recall-activity-panel__confirmed recall-activity-panel__confirmed--public"
        :class="{ 'recall-activity-panel__confirmed--resizing': isConfirmedPanelResizing }"
        :style="confirmedPanelStyle"
        :aria-label="t('diagnostics.recallTrace.confirmedUnitsTitle')"
      >
        <div class="recall-activity-panel__section-title">{{ t('diagnostics.recallTrace.confirmedUnitsTitle') }}</div>
        <div class="recall-activity-panel__unit-list recall-activity-panel__unit-list--public">
          <div
            v-for="unit in cachedConfirmedUnits"
            :key="unit.id"
            class="recall-activity-panel__unit-item"
            :class="{ 'recall-activity-panel__unit-item--expanded': expandedUnitId === unit.id }"
          >
            <button
              type="button"
              @click="toggleUnitPreview(unit)"
            >
              <span>{{ formatUnitTitle(unit) }}</span>
              <small v-if="formatUnitMeta(unit)">{{ formatUnitMeta(unit) }}</small>
            </button>
          </div>
        </div>
      </section>
      <article
        v-if="expandedConfirmedUnit"
        class="recall-activity-panel__unit-card recall-activity-panel__unit-card--detached"
        :aria-label="t('diagnostics.recallTrace.referencePreviewAria')"
      >
        <header>
          <strong>{{ expandedConfirmedUnit.title || expandedConfirmedUnit.id }}</strong>
          <div>
            <button type="button" :title="t('diagnostics.recallTrace.jumpToBrain')" :aria-label="t('diagnostics.recallTrace.jumpToBrain')" @click.stop="emit('jump-unit', expandedConfirmedUnit)">{{ t('diagnostics.recallTrace.jump') }}</button>
            <button type="button" :title="t('diagnostics.recallTrace.closePreview')" :aria-label="t('diagnostics.recallTrace.closePreview')" @click.stop="expandedUnitId = ''">×</button>
          </div>
        </header>
        <div class="recall-activity-panel__unit-body">{{ formatUnitPreviewBody(expandedConfirmedUnit) }}</div>
      </article>
      <div
        v-if="cachedConfirmedUnits.length"
        class="recall-activity-panel__splitter"
        role="separator"
        :aria-label="t('diagnostics.recallTrace.resizeReferenceAria')"
        aria-orientation="horizontal"
        :aria-valuenow="confirmedPanelHeight"
        :aria-valuemin="CONFIRMED_PANEL_MIN_HEIGHT"
        :aria-valuemax="CONFIRMED_PANEL_MAX_HEIGHT"
        :title="t('diagnostics.recallTrace.resizeReferenceTitle')"
        @pointerdown="startConfirmedPanelResize"
      ></div>
    </template>

    <template v-if="activity && isDetailPanel">
      <section class="recall-activity-panel__summary" :aria-label="t('diagnostics.recallTrace.metricsOverviewAria')">
        <dl>
          <div>
            <dt>{{ t('diagnostics.recallTrace.totalElapsed') }}</dt>
            <dd>{{ elapsedText }}</dd>
          </div>
          <div>
            <dt>{{ t('diagnostics.recallTrace.totalToken') }}</dt>
            <dd>{{ totalUsageText || t('diagnostics.recallTrace.none') }}</dd>
          </div>
          <div>
            <dt>{{ t('diagnostics.recallTrace.smartCalls') }}</dt>
            <dd>{{ t('diagnostics.recallTrace.timesValue', { count: totalCallCount }) }}</dd>
          </div>
          <div>
            <dt>{{ t('diagnostics.recallTrace.confirmedUnitCountLabel') }}</dt>
            <dd>{{ t('diagnostics.recallTrace.confirmedUnitCountValue', { count: confirmedUnitCount }) }}</dd>
          </div>
        </dl>
        <div class="recall-activity-panel__meta">
          <span>{{ t('diagnostics.recallTrace.eventCountValue', { count: activity.events.length }) }}</span>
          <span>{{ t('diagnostics.recallTrace.confirmedCriteria') }}</span>
          <span v-if="activity.error">{{ t('diagnostics.recallTrace.failedWithError', { error: activity.error }) }}</span>
        </div>
      </section>

      <section
        v-if="cachedConfirmedUnits.length"
        class="recall-activity-panel__confirmed"
        :class="{ 'recall-activity-panel__confirmed--resizing': isConfirmedPanelResizing }"
        :style="confirmedPanelStyle"
        :aria-label="t('diagnostics.recallTrace.confirmedUnitsTitle')"
      >
        <div class="recall-activity-panel__section-title">{{ t('diagnostics.recallTrace.confirmedUnitsTitle') }}</div>
        <div class="recall-activity-panel__unit-list">
          <div
            v-for="unit in cachedConfirmedUnits"
            :key="unit.id"
            class="recall-activity-panel__unit-item"
            :class="{ 'recall-activity-panel__unit-item--expanded': expandedUnitId === unit.id }"
          >
            <button
              type="button"
              @click="toggleUnitPreview(unit)"
            >
              <span>{{ formatUnitTitle(unit) }}</span>
              <small v-if="formatUnitMeta(unit)">{{ formatUnitMeta(unit) }}</small>
            </button>
          </div>
        </div>
      </section>
      <article
        v-if="expandedConfirmedUnit"
        class="recall-activity-panel__unit-card recall-activity-panel__unit-card--detached"
        :aria-label="t('diagnostics.recallTrace.unitPreviewAria')"
      >
        <header>
          <strong>{{ expandedConfirmedUnit.title || expandedConfirmedUnit.id }}</strong>
          <div>
            <button type="button" :title="t('diagnostics.recallTrace.jumpToBrain')" :aria-label="t('diagnostics.recallTrace.jumpToBrain')" @click.stop="emit('jump-unit', expandedConfirmedUnit)">{{ t('diagnostics.recallTrace.jump') }}</button>
            <button type="button" :title="t('diagnostics.recallTrace.closePreview')" :aria-label="t('diagnostics.recallTrace.closePreview')" @click.stop="expandedUnitId = ''">×</button>
          </div>
        </header>
        <div class="recall-activity-panel__unit-body">{{ formatUnitPreviewBody(expandedConfirmedUnit) }}</div>
      </article>
      <div
        v-if="cachedConfirmedUnits.length"
        class="recall-activity-panel__splitter"
        role="separator"
        :aria-label="t('diagnostics.recallTrace.resizeConfirmedAria')"
        aria-orientation="horizontal"
        :aria-valuenow="confirmedPanelHeight"
        :aria-valuemin="CONFIRMED_PANEL_MIN_HEIGHT"
        :aria-valuemax="CONFIRMED_PANEL_MAX_HEIGHT"
        :title="t('diagnostics.recallTrace.resizeConfirmedTitle')"
        @pointerdown="startConfirmedPanelResize"
      ></div>

    </template>

    <div v-if="!isDetailPanel" class="recall-activity-panel__events recall-activity-panel__events--public">
      <article
        v-for="event in displayedPublicTimelineEvents"
        :key="event.id"
        class="recall-activity-event recall-activity-event--public"
        :class="`recall-activity-event--${event.statusKey}`"
      >
        <div class="recall-activity-event__head">
          <span class="recall-activity-event__dot"></span>
          <div>
            <strong>{{ event.title }}</strong>
            <span>{{ event.status }}</span>
          </div>
        </div>
        <div class="recall-activity-event__summary">
          <span v-for="line in event.lines" :key="line">{{ line }}</span>
        </div>
        <div v-if="event.meta.length" class="recall-activity-event__public-meta">
          <span v-for="item in event.meta" :key="item">{{ item }}</span>
        </div>
      </article>

      <article
        v-if="shouldShowThoughtEvent"
        class="recall-activity-event recall-activity-event--thought"
      >
        <div class="recall-activity-event__head">
          <span class="recall-activity-event__dot"></span>
          <div>
            <strong>{{ props.isThinking ? t('diagnostics.recallTrace.organizingReply') : t('diagnostics.recallTrace.replyOrganized') }}</strong>
            <span>{{ props.isThinking ? t('diagnostics.recallTrace.inProgress') : t('diagnostics.recallTrace.done') }}</span>
          </div>
        </div>
        <div class="recall-activity-event__summary recall-activity-event__summary--thought">
          <p v-for="(block, index) in thoughtBlocks" :key="index">{{ block }}</p>
        </div>
      </article>

      <div v-if="!displayedPublicTimelineEvents.length && !shouldShowThoughtEvent" class="recall-activity-panel__empty-note">
        {{ t('diagnostics.recallTrace.noProcessYet') }}
      </div>
    </div>

    <div v-else class="recall-activity-panel__events">
      <article
        v-for="event in visibleEvents"
        :key="event.id"
        class="recall-activity-event"
        :class="`recall-activity-event--${event.status}`"
      >
        <div class="recall-activity-event__head">
          <span class="recall-activity-event__dot"></span>
          <div>
            <strong>{{ event.stepLabel }}</strong>
          </div>
        </div>
        <div class="recall-activity-event__metrics">
          <span>{{ t('diagnostics.recallTrace.durationLine', { value: formatEventDuration(event) }) }}</span>
          <span>{{ t('diagnostics.recallTrace.tokenLine', { value: eventUsageText(event) || t('diagnostics.recallTrace.none') }) }}</span>
          <span v-if="event.metrics?.callCount !== undefined">{{ t('diagnostics.recallTrace.callLine', { count: event.metrics.callCount }) }}</span>
          <span v-if="event.parallelGroup">{{ t('diagnostics.recallTrace.parallelGroupLine', { group: event.parallelGroup }) }}</span>
        </div>
        <div v-if="formatEventSummary(event).length" class="recall-activity-event__summary">
          <span v-for="line in formatEventSummary(event)" :key="line">{{ line }}</span>
        </div>
        <div v-if="buildEventReadableSections(event).length" class="recall-activity-event__readable">
          <section
            v-for="section in buildEventReadableSections(event)"
            :key="section.title"
            class="recall-activity-event__readable-section"
          >
            <div class="recall-activity-event__readable-title">
              <strong>{{ section.title }}</strong>
              <span v-if="section.hint">{{ section.hint }}</span>
            </div>
            <div class="recall-activity-event__readable-lines">
              <span v-for="line in section.lines" :key="line">{{ line }}</span>
              <div
                v-for="table in section.tables"
                :key="table.title"
                class="recall-activity-event__table-wrap"
              >
                <div v-if="table.title" class="recall-activity-event__table-caption">{{ table.title }}</div>
                <table class="recall-activity-event__table">
                  <colgroup>
                    <col
                      v-for="column in table.columns"
                      :key="column.key"
                      :style="tableColumnStyle(table, column)"
                    >
                  </colgroup>
                  <thead>
                    <tr>
                      <th
                        v-for="column in table.columns"
                        :key="column.key"
                        :class="tableCellClass(column)"
                      >{{ column.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rowIndex) in table.rows" :key="rowIndex">
                      <td
                        v-for="column in table.columns"
                        :key="column.key"
                        :class="tableCellClass(column)"
                      >{{ row[column.key] || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
        <details class="recall-activity-event__details">
          <summary>{{ t('diagnostics.recallTrace.rawData') }}</summary>
          <div v-if="buildEventRawTables(event).length" class="recall-activity-event__raw-tables">
            <div
              v-for="table in buildEventRawTables(event)"
              :key="table.title"
              class="recall-activity-event__table-wrap"
            >
              <div class="recall-activity-event__table-caption">{{ table.title }}</div>
              <table class="recall-activity-event__table">
                <colgroup>
                  <col
                    v-for="column in table.columns"
                    :key="column.key"
                    :style="tableColumnStyle(table, column)"
                  >
                </colgroup>
                <thead>
                  <tr>
                    <th
                      v-for="column in table.columns"
                      :key="column.key"
                      :class="tableCellClass(column)"
                    >{{ column.label }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in table.rows" :key="rowIndex">
                    <td
                      v-for="column in table.columns"
                      :key="column.key"
                      :class="tableCellClass(column)"
                    >{{ row[column.key] || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <pre>{{ formatEventPayload(event) }}</pre>
        </details>
      </article>

      <article
        v-if="shouldShowThoughtEvent"
        class="recall-activity-event recall-activity-event--thought"
      >
        <div class="recall-activity-event__head">
          <span class="recall-activity-event__dot"></span>
          <div>
            <strong>{{ t('diagnostics.recallTrace.characterThinking') }}</strong>
            <span>{{ props.isThinking ? 'thinking' : 'completed' }}</span>
          </div>
        </div>
        <div class="recall-activity-event__summary recall-activity-event__summary--thought">
          <p v-for="(block, index) in thoughtBlocks" :key="index">{{ block }}</p>
        </div>
      </article>

      <div v-if="!visibleEvents.length && !shouldShowThoughtEvent" class="recall-activity-panel__empty-note">
        {{ t('diagnostics.recallTrace.noRecallActivity') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecallTraceState } from '../../../app/recallTraceState'
import type { RecallActivityRun } from '../../../app/recallTraceState'
import { buildPublicRecallMilestonesFromEvents } from '../../../app/recallPublicMilestones'
import type { PublicRecallMilestone, RecallActivityCandidateRef, RecallActivityEvent, RecallActivityUnitRef, RecallTokenUsage } from '../../../types/docBrain'
import { extractAiThoughtBlocks } from '../../../utils/aiOutput'

type ReadableSection = {
  title: string
  hint?: string
  lines: string[]
  tables?: ReadableTable[]
}

type ReadableTable = {
  title?: string
  columns: ReadableTableColumn[]
  rows: ReadableTableRow[]
}

type ReadableTableColumn = {
  key: string
  label: string
}

type ReadableTableRow = Record<string, string>

type ScoreRecord = {
  id: string
  title: string
  ruleMatchScore?: number
  ruleInitialIncludeScore?: number
  ruleInitialExpandScore?: number
  rawEmbeddingScore?: number
  embeddingIntentScore?: number
  temporalRuleScore?: number
  relationRuleScore?: number
  structurePriorityScore?: number
  baselineRecallBoost?: number
  compileDirectBaseScore?: number
  compileExpandBaseScore?: number
  selfAnchorScore?: number
  userAnchorScore?: number
  otherAnchorScore?: number
  runtimeUserAnchorScore?: number
  runtimeOtherAnchorScore?: number
  runtimeWorldEntityScore?: number
  compileAnchorScore?: number
  agentIncludeDelta?: number
  agentExpandDelta?: number
  includeScore?: number
  expandScore?: number
  candidateBaseScore?: number
  score?: number
}

type JudgmentRecord = {
  id: string
  includeDecision?: string
  expandDecision?: string
  includeScoreBefore?: number
  includeScoreDelta?: number
  includeScoreAfter?: number
  expandScoreBefore?: number
  expandScoreDelta?: number
  expandScoreAfter?: number
  summaryQuality?: string
  readNeed?: string
  decision?: string
  readDecision?: string
  evidenceReasonCodes?: string[]
  confidence?: number
}

type PublicTimelineEvent = {
  id: string
  statusKey: RecallActivityEvent['status']
  title: string
  status: string
  lines: string[]
  meta: string[]
  displayDelayMs?: number
}

type MessageNavigationItem = {
  messageId: number
  role: 'user' | 'assistant'
  speakerName: string
  excerpt: string
}

const revealedPublicMilestoneIdsByRun = new Map<string, string[]>()

const props = withDefaults(defineProps<{
  thinkingText?: string
  thinkingPanelText?: string
  thinkingSpeakerName?: string
  isThinking?: boolean
  cacheScopeKey?: string
  canUseDetailPanel?: boolean
  messageNavigationItems?: MessageNavigationItem[]
  activeMessageId?: number
  resolveUnitPreview?: (unit: RecallActivityUnitRef) => { summary?: string; contentText?: string } | null
  activityOverride?: RecallActivityRun | null
  panelTitleOverride?: string
}>(), {
  thinkingText: '',
  thinkingPanelText: '',
  thinkingSpeakerName: '',
  isThinking: false,
  cacheScopeKey: '',
  canUseDetailPanel: false,
  messageNavigationItems: () => [],
  activeMessageId: 0,
  resolveUnitPreview: undefined,
  activityOverride: null,
  panelTitleOverride: ''
})
const emit = defineEmits<{
  (e: 'jump-unit', unit: RecallActivityUnitRef): void
  (e: 'select-message', messageId: number): void
  (e: 'close'): void
}>()

const { t } = useI18n()
const { activity: globalActivity, setSidebarOpen } = useRecallTraceState()
const activity = computed(() => props.activityOverride || globalActivity.value)
const now = ref(Date.now())
// 本地工作区默认展示详情视图，可通过头部按钮切换到简化过程。
const panelMode = ref<'process' | 'detail'>('detail')
const expandedUnitId = ref('')
const confirmedUnitPanelCache = ref<{ key: string; units: CachedConfirmedUnit[] }>({ key: '', units: [] })
const CONFIRMED_PANEL_MIN_HEIGHT = 96
const CONFIRMED_PANEL_MAX_HEIGHT = 420
const CONFIRMED_PANEL_BASE_HEIGHT = 43
const CONFIRMED_PANEL_ROW_HEIGHT = 31
// 高度自适应必须跟确认单位列表的 CSS grid 列数同步。
const CONFIRMED_PANEL_DETAIL_COLUMNS = 3
const CONFIRMED_PANEL_PUBLIC_COLUMNS = 3
const confirmedPanelHeight = ref(CONFIRMED_PANEL_MIN_HEIGHT)
const isConfirmedPanelResizing = ref(false)
const visiblePublicMilestoneIds = ref<string[]>([])
const visiblePublicMilestoneRunId = ref('')
let stopConfirmedPanelResize: null | (() => void) = null
let publicMilestoneTimer: number | null = null
const timer = window.setInterval(() => {
  now.value = Date.now()
}, 1000)

onBeforeUnmount(() => {
  window.clearInterval(timer)
  if (publicMilestoneTimer !== null) window.clearTimeout(publicMilestoneTimer)
  stopConfirmedPanelResize?.()
})

const isDetailPanel = computed(() => Boolean(props.activityOverride) || (props.canUseDetailPanel && panelMode.value === 'detail'))

function closePanel(): void {
  if (props.activityOverride) {
    emit('close')
    return
  }
  setSidebarOpen(false)
}

const panelTitle = computed(() => props.panelTitleOverride || (isDetailPanel.value ? t('diagnostics.recallTrace.detailPanelTitle') : t('diagnostics.recallTrace.processTitle')))

const statusText = computed(() => {
  if (!activity.value) return t('diagnostics.recallTrace.idle')
  if (activity.value.status === 'running') return t('diagnostics.recallTrace.recalling')
  if (activity.value.status === 'completed') return t('diagnostics.recallTrace.recallDone')
  if (activity.value.status === 'failed') return t('diagnostics.recallTrace.recallFailed')
  return t('diagnostics.recallTrace.idle')
})

const panelSubtitle = computed(() => {
  if (activity.value) return t('diagnostics.recallTrace.subtitleJoin', { name: activity.value.characterName, status: statusText.value })
  return t('diagnostics.recallTrace.subtitleJoin', {
    name: props.thinkingSpeakerName || t('chat.characterFallback'),
    status: props.isThinking ? t('diagnostics.recallTrace.thinking') : t('diagnostics.recallTrace.thinkingProcess')
  })
})

const publicStatusLabel = computed(() => {
  if (!activity.value) return props.isThinking ? t('diagnostics.recallTrace.thinkingNow') : t('diagnostics.recallTrace.pending')
  if (activity.value.status === 'running') return t('diagnostics.recallTrace.searching')
  if (activity.value.status === 'completed') return t('diagnostics.recallTrace.searchDone')
  if (activity.value.status === 'failed') return t('diagnostics.recallTrace.searchInterrupted')
  return t('diagnostics.recallTrace.processTitle')
})

const publicHeadline = computed(() => {
  if (!activity.value) return props.isThinking ? t('diagnostics.recallTrace.organizingInfo') : t('diagnostics.recallTrace.noProcessToShow')
  if (activity.value.status === 'running') return latestPublicStepTitle.value || t('diagnostics.recallTrace.searchingMaterials')
  if (activity.value.status === 'failed') return activity.value.error || t('diagnostics.recallTrace.processIncomplete')
  return confirmedUnitCount.value > 0 ? t('diagnostics.recallTrace.referenceCount', { count: confirmedUnitCount.value }) : t('diagnostics.recallTrace.notIncluded')
})

const publicSummaryText = computed(() => {
  if (!activity.value) return t('diagnostics.recallTrace.publicSummaryPlaceholder')
  const done = publicTimelineEvents.value.filter((item) => item.statusKey === 'completed').length
  const running = publicTimelineEvents.value.some((item) => item.statusKey === 'started')
  const parts = [t('diagnostics.recallTrace.stepCount', { count: done })]
  if (running) parts.push(t('diagnostics.recallTrace.stillRunning'))
  parts.push(elapsedText.value)
  return parts.join(' · ')
})

const elapsedText = computed(() => {
  if (!activity.value) return '0s'
  const end = activity.value.completedAt ? new Date(activity.value.completedAt).getTime() : now.value
  const start = new Date(activity.value.startedAt).getTime()
  return formatDuration(Math.max(0, end - start))
})

const totalUsage = computed<RecallTokenUsage | null>(() => {
  const events = activity.value?.events || []
  const summaryUsage = events
    .slice()
    .reverse()
    .find((event) => event.stepKey === 'recall_metrics_summary' && event.metrics?.usageTotal)
    ?.metrics?.usageTotal
  const summaryModelUsage = events
    .slice()
    .reverse()
    .find((event) => event.stepKey === 'recall_metrics_summary')
  const summaryModelCallsUsage = summaryModelUsage
    ? sumUsages(readModelCallUsages(readObject(summaryModelUsage.output).modelCalls))
    : null
  const eventUsage = sumUsages(events
    .filter((event) => event.stepKey !== 'recall_metrics_summary')
    .flatMap((event) => collectEventUsages(event)))
  return [summaryUsage, summaryModelCallsUsage, eventUsage]
    .filter((usage): usage is RecallTokenUsage => Boolean(usage))
    .sort((left, right) => right.totalTokens - left.totalTokens)[0] || null
})

const totalUsageText = computed(() => totalUsage.value ? formatUsage(totalUsage.value) : '')

const visibleEvents = computed(() => {
  const events = activity.value?.events || []
  const visible: RecallActivityEvent[] = []
  for (const event of events) {
    if (event.status === 'started') {
      visible.push(event)
      continue
    }
    const startedIndex = findReplaceableStartedEventIndex(visible, event)
    if (startedIndex >= 0) {
      visible.splice(startedIndex, 1, event)
    } else {
      visible.push(event)
    }
  }
  return visible
})

const publicTimelineSourceEvents = computed(() => visibleEvents.value)

const publicTimelineEvents = computed<PublicTimelineEvent[]>(() => {
  const stored = activity.value?.publicMilestones
  const milestones = Array.isArray(stored) && stored.length
    ? stored
    : buildPublicRecallMilestonesFromEvents(publicTimelineSourceEvents.value)
  return milestones.map(toPublicTimelineEvent)
})

const displayedPublicTimelineEvents = computed(() => {
  const allowed = new Set(visiblePublicMilestoneIds.value)
  return publicTimelineEvents.value.filter((item) => allowed.has(item.id))
})

const latestPublicStepTitle = computed(() => (
  publicTimelineEvents.value
    .slice()
    .reverse()
    .find((item) => item.statusKey === 'started')?.title
  || publicTimelineEvents.value[publicTimelineEvents.value.length - 1]?.title
  || ''
))

const candidateTitleById = computed(() => {
  const titleMap = new Map<string, string>()
  for (const event of activity.value?.events || []) {
    const input = readObject(event.input)
    const output = readObject(event.output)
    for (const ref of [
      ...readCandidateRefs(input.candidateRefs),
      ...readCandidateRefs(output.candidates),
      ...readUnitRefs(output.directUnits),
      ...readUnitRefs(output.expandedUnits),
      ...readUnitRefs(output.confirmed),
      ...readUnitRefs(event.metrics?.directUnits),
      ...readUnitRefs(event.metrics?.expandedUnits),
      ...readUnitRefs(event.metrics?.confirmedUnits)
    ]) {
      if (ref.id && ref.title && ref.title !== ref.id && !titleMap.has(ref.id)) {
        titleMap.set(ref.id, ref.title)
      }
    }
  }
  return titleMap
})

const totalCallCount = computed(() => {
  const summaryCallCount = activity.value?.events
    .slice()
    .reverse()
    .find((event) => event.stepKey === 'recall_metrics_summary' && event.metrics?.callCount !== undefined)
    ?.metrics?.callCount
  if (summaryCallCount !== undefined) return summaryCallCount
  return activity.value?.events.reduce((sum, event) => sum + (event.metrics?.callCount || 0), 0) || 0
})

const finalConfirmedUnits = computed<RecallActivityUnitRef[]>(() => {
  const events = activity.value?.events || []
  const metricsUnits = events
    .slice()
    .reverse()
    .find((event) => event.metrics?.confirmedUnits?.length)
    ?.metrics?.confirmedUnits
  if (metricsUnits?.length) return dedupeUnitRefs(metricsUnits)
  const outputUnits = events
    .slice()
    .reverse()
    .flatMap((event) => readUnitRefs(readObject(event.output).confirmed))
  if (outputUnits.length) return dedupeUnitRefs(outputUnits)
  const milestoneUnits = (activity.value?.publicMilestones || [])
    .flatMap((milestone) => readUnitRefs(milestone.relatedUnits))
  if (milestoneUnits.length) return dedupeUnitRefs(milestoneUnits)
  const ids = activity.value?.result?.confirmedIds || []
  return dedupeUnitRefs(ids.map((id) => ({ id, title: id })))
})

type CachedConfirmedUnit = RecallActivityUnitRef & {
  previewBody: string
}

const confirmedUnitCacheKey = computed(() => {
  const run = activity.value
  if (!run) return `${props.cacheScopeKey || ''}:empty`
  const latestEvent = run.events[run.events.length - 1]
  return [
    props.cacheScopeKey || '',
    run.id,
    run.status,
    run.completedAt || '',
    run.result?.confirmedIds?.join(',') || '',
    run.events.length,
    latestEvent?.id || '',
    latestEvent?.status || '',
    latestEvent?.completedAt || latestEvent?.startedAt || ''
  ].join(':')
})

const cachedConfirmedUnits = computed<CachedConfirmedUnit[]>(() => {
  const key = confirmedUnitCacheKey.value
  if (confirmedUnitPanelCache.value.key !== key) {
    confirmedUnitPanelCache.value = {
      key,
      units: finalConfirmedUnits.value.map((unit) => ({
        ...unit,
        previewBody: resolveUnitPreviewBody(unit)
      }))
    }
  }
  return confirmedUnitPanelCache.value.units
})

const expandedConfirmedUnit = computed(() => (
  cachedConfirmedUnits.value.find((unit) => unit.id === expandedUnitId.value) || null
))

const confirmedPanelStyle = computed(() => ({
  height: `${confirmedPanelHeight.value}px`
}))

const currentConfirmedPanelColumns = computed(() => (
  isDetailPanel.value ? CONFIRMED_PANEL_DETAIL_COLUMNS : CONFIRMED_PANEL_PUBLIC_COLUMNS
))

watch(confirmedUnitCacheKey, () => {
  expandedUnitId.value = ''
}, { flush: 'sync' })

watch(cachedConfirmedUnits, (units) => {
  if (isConfirmedPanelResizing.value) return
  confirmedPanelHeight.value = calculateConfirmedPanelHeight(units.length, currentConfirmedPanelColumns.value)
}, { immediate: true, flush: 'sync' })

watch(currentConfirmedPanelColumns, () => {
  if (isConfirmedPanelResizing.value) return
  confirmedPanelHeight.value = calculateConfirmedPanelHeight(cachedConfirmedUnits.value.length, currentConfirmedPanelColumns.value)
}, { flush: 'sync' })

watch(publicTimelineEvents, (items) => {
  const run = activity.value
  const runId = run?.id || ''
  const nextIds = items.map((item) => item.id)
  if (visiblePublicMilestoneRunId.value !== runId) {
    visiblePublicMilestoneRunId.value = runId
    visiblePublicMilestoneIds.value = []
  }
  if (run?.status && run.status !== 'running') {
    visiblePublicMilestoneIds.value = nextIds
    rememberVisiblePublicMilestones()
    return
  }
  const remembered = runId ? revealedPublicMilestoneIdsByRun.get(runId) || [] : []
  visiblePublicMilestoneIds.value = Array.from(new Set([...remembered, ...visiblePublicMilestoneIds.value])).filter((id) => nextIds.includes(id))
  if (!visiblePublicMilestoneIds.value.length && nextIds.length) {
    visiblePublicMilestoneIds.value = [...nextIds]
  }
  rememberVisiblePublicMilestones()
  scheduleNextPublicMilestone()
}, { immediate: true, flush: 'sync' })

function toggleUnitPreview(unit: RecallActivityUnitRef): void {
  expandedUnitId.value = expandedUnitId.value === unit.id ? '' : unit.id
}

function togglePanelMode(): void {
  panelMode.value = isDetailPanel.value ? 'process' : 'detail'
}

const confirmedUnitCount = computed(() => cachedConfirmedUnits.value.length || activity.value?.result?.confirmedIds.length || 0)
const thoughtBlocks = computed(() => extractAiThoughtBlocks(props.thinkingPanelText || props.thinkingText))
const shouldShowThoughtEvent = computed(() => {
  if (!thoughtBlocks.value.length) return false
  if (!activity.value) return true
  return activity.value.status !== 'running'
})

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 100) / 10
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

function formatEventDuration(event: RecallActivityEvent): string {
  if (event.durationMs !== undefined) return formatDuration(event.durationMs)
  const start = Date.parse(event.startedAt || '')
  const end = event.completedAt ? Date.parse(event.completedAt) : 0
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return formatDuration(end - start)
  }
  return event.status === 'started' ? t('diagnostics.recallTrace.inProgress') : t('diagnostics.recallTrace.unknown')
}

function formatUsage(usage: RecallTokenUsage | undefined): string {
  if (!usage) return ''
  const total = usage.totalTokens || usage.promptTokens + usage.completionTokens
  return `${total.toLocaleString('zh-CN')} tokens`
}

function toUsage(value: unknown): RecallTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const promptTokens = Number(record.promptTokens ?? record.prompt_tokens ?? 0)
  const completionTokens = Number(record.completionTokens ?? record.completion_tokens ?? 0)
  const totalTokens = Number(record.totalTokens ?? record.total_tokens ?? 0) || promptTokens + completionTokens
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return undefined
  return {
    promptTokens: Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) && completionTokens > 0 ? completionTokens : 0,
    totalTokens
  }
}

function sumUsages(usages: Array<RecallTokenUsage | undefined>): RecallTokenUsage | null {
  const valid = usages.filter((usage): usage is RecallTokenUsage => Boolean(usage))
  if (!valid.length) return null
  return valid.reduce<RecallTokenUsage>((sum, usage) => ({
    promptTokens: sum.promptTokens + usage.promptTokens,
    completionTokens: sum.completionTokens + usage.completionTokens,
    totalTokens: sum.totalTokens + (usage.totalTokens || usage.promptTokens + usage.completionTokens)
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 })
}

function collectEventUsages(event: RecallActivityEvent): Array<RecallTokenUsage | undefined> {
  const output = readObject(event.output)
  const modelCallUsages = readModelCallUsages(output.modelCalls)
  if (modelCallUsages.length) return modelCallUsages
  return [
    event.metrics?.usage,
    event.metrics?.usageTotal,
    toUsage(output.usage),
    toUsage(output.usageTotal)
  ]
}

function readModelCallUsages(value: unknown): Array<RecallTokenUsage | undefined> {
  const modelCalls = Array.isArray(value) ? value : []
  return modelCalls.flatMap((item) => {
    const call = readObject(item)
    return [toUsage(call.usage), toUsage(call.usageTotal)]
  })
}

function findReplaceableStartedEventIndex(events: RecallActivityEvent[], completedEvent: RecallActivityEvent): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.status !== 'started') continue
    if (event.id === completedEvent.id) return index
    if (event.stepKey && event.stepKey === completedEvent.stepKey && event.parallelGroup === completedEvent.parallelGroup) return index
  }
  return -1
}

function readDecisionLabel(value: unknown): string {
  if (value === 'summary_only') return t('diagnostics.recallTrace.decSummary')
  if (value === 'body_required') return t('diagnostics.recallTrace.decBody')
  if (value === 'body_if_budget') return t('diagnostics.recallTrace.decBodyInBudget')
  if (value === 'skip_body') return t('diagnostics.recallTrace.decSkipBody')
  return ''
}

function scheduleNextPublicMilestone(): void {
  if (publicMilestoneTimer !== null) return
  if (activity.value?.status && activity.value.status !== 'running') return
  const ids = publicTimelineEvents.value.map((item) => item.id)
  const visible = visiblePublicMilestoneIds.value
  if (!ids.some((id) => !visible.includes(id))) return
  const currentLast = publicTimelineEvents.value.slice().reverse().find((item) => visible.includes(item.id))
  publicMilestoneTimer = window.setTimeout(() => {
    publicMilestoneTimer = null
    const next = publicTimelineEvents.value.find((item) => !visiblePublicMilestoneIds.value.includes(item.id))
    if (next) {
      visiblePublicMilestoneIds.value = [...visiblePublicMilestoneIds.value, next.id]
      rememberVisiblePublicMilestones()
    }
    scheduleNextPublicMilestone()
  }, currentLast?.displayDelayMs || randomPublicMilestoneDelay())
}

function randomPublicMilestoneDelay(): number {
  return 1000 + Math.floor(Math.random() * 1001)
}

function toPublicTimelineEvent(milestone: PublicRecallMilestone): PublicTimelineEvent {
  const statusKey = milestone.status
  return {
    id: milestone.id,
    title: milestone.title,
    statusKey,
    status: statusKey === 'started' ? t('diagnostics.recallTrace.inProgress') : statusKey === 'failed' ? t('diagnostics.recallTrace.failed') : t('diagnostics.recallTrace.done'),
    lines: [milestone.text].filter(Boolean),
    meta: milestoneMetaLines(milestone),
    displayDelayMs: milestone.displayDelayMs
  }
}

function milestoneMetaLines(milestone: PublicRecallMilestone): string[] {
  const units = milestone.relatedUnits || []
  return [
    milestone.durationMs !== undefined ? t('diagnostics.recallTrace.metaDuration', { value: formatDuration(milestone.durationMs) }) : '',
    milestone.modelLabel ? t('diagnostics.recallTrace.metaModel', { value: milestone.modelLabel }) : '',
    units.length ? t('diagnostics.recallTrace.metaConfirmed', { units: `${units.slice(0, 5).map((unit) => unit.title || unit.id).join('、')}${units.length > 5 ? t('diagnostics.recallTrace.etc') : ''}` }) : ''
  ].filter(Boolean)
}

function rememberVisiblePublicMilestones(): void {
  const runId = activity.value?.id
  if (!runId) return
  revealedPublicMilestoneIdsByRun.set(runId, [...visiblePublicMilestoneIds.value])
}

function clampConfirmedPanelHeight(value: number): number {
  return Math.min(CONFIRMED_PANEL_MAX_HEIGHT, Math.max(CONFIRMED_PANEL_MIN_HEIGHT, Math.round(value)))
}

function calculateConfirmedPanelHeight(unitCount: number, columnCount: number): number {
  if (unitCount <= 0) return CONFIRMED_PANEL_MIN_HEIGHT
  const rows = Math.ceil(unitCount / Math.max(1, columnCount))
  return clampConfirmedPanelHeight(CONFIRMED_PANEL_BASE_HEIGHT + rows * CONFIRMED_PANEL_ROW_HEIGHT)
}

function startConfirmedPanelResize(event: PointerEvent): void {
  if (typeof window === 'undefined') return
  event.preventDefault()
  stopConfirmedPanelResize?.()
  const startY = event.clientY
  const startHeight = confirmedPanelHeight.value
  isConfirmedPanelResizing.value = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'row-resize'
  const handleMove = (moveEvent: PointerEvent) => {
    confirmedPanelHeight.value = clampConfirmedPanelHeight(startHeight + moveEvent.clientY - startY)
  }
  const stop = () => {
    isConfirmedPanelResizing.value = false
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    stopConfirmedPanelResize = null
  }
  stopConfirmedPanelResize = stop
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function formatUnitTitle(unit: RecallActivityUnitRef): string {
  return unit.title || unit.id
}

function formatUnitMeta(unit: RecallActivityUnitRef): string {
  return [readDecisionLabel(unit.readDecision), formatUnitScore(unit)]
    .filter(Boolean)
    .join(' · ')
}

function formatUnitScore(unit: RecallActivityUnitRef): string {
  return unit.score !== undefined ? formatScoreValue(unit.score) : ''
}

function formatUnitLabel(unit: RecallActivityUnitRef): string {
  const decision = readDecisionLabel(unit.readDecision)
  const score = unit.score !== undefined ? ` · ${formatScoreValue(unit.score)}` : ''
  return `${unit.title}${decision ? `（${decision}）` : ''}${score}`
}

function formatCandidateLabel(candidate: RecallActivityCandidateRef): string {
  return candidate.title && candidate.title !== candidate.id
    ? candidate.title
    : candidate.id
}

function resolveUnitPreviewBody(unit: RecallActivityUnitRef): string {
  const content = String(unit.contentText || '').trim()
  if (content) return content
  const summary = String(unit.summary || '').trim()
  if (summary) return summary
  const resolved = props.resolveUnitPreview?.(unit)
  const resolvedContent = String(resolved?.contentText || '').trim()
  if (resolvedContent) return resolvedContent
  const resolvedSummary = String(resolved?.summary || '').trim()
  if (resolvedSummary) return resolvedSummary
  return t('diagnostics.recallTrace.noBodyOrSummary')
}

function formatUnitPreviewBody(unit: CachedConfirmedUnit): string {
  return unit.previewBody
}

function formatUnits(units: RecallActivityUnitRef[] | undefined): string {
  if (!units?.length) return t('diagnostics.recallTrace.none')
  return units.map(formatUnitLabel).join('、')
}

function eventUsageText(event: RecallActivityEvent): string {
  const usage = sumUsages(collectEventUsages(event)) || undefined
  return usage ? formatUsage(usage) : ''
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function readNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function formatScoreValue(value: unknown): string {
  const numberValue = readNumber(value)
  if (numberValue === undefined) return ''
  const rounded = Math.round(numberValue * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function formatSignedScoreValue(value: unknown): string {
  const numberValue = readNumber(value)
  if (numberValue === undefined) return ''
  if (numberValue === 0) return '+0'
  if (numberValue > 0) return `+${formatScoreValue(numberValue)}`
  return formatScoreValue(numberValue)
}

function mapTitleByIdFromEvent(event: RecallActivityEvent): Map<string, string> {
  const map = new Map<string, string>()
  const input = readObject(event.input)
  const output = readObject(event.output)
  for (const ref of [
    ...readCandidateRefs(input.candidateRefs),
    ...readCandidateRefs(output.candidates),
    ...readUnitRefs(output.directUnits),
    ...readUnitRefs(output.expandedUnits),
    ...readUnitRefs(output.confirmed),
    ...readUnitRefs(event.metrics?.directUnits),
    ...readUnitRefs(event.metrics?.expandedUnits),
    ...readUnitRefs(event.metrics?.confirmedUnits)
  ]) {
    if (ref.id && ref.title) map.set(ref.id, ref.title)
  }
  for (const [id, title] of candidateTitleById.value) {
    if (!map.has(id)) map.set(id, title)
  }
  return map
}

function readScoreRecords(value: unknown, titleById = new Map<string, string>()): ScoreRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): ScoreRecord | null => {
      const record = readObject(item)
      const id = String(record.id || '').trim()
      if (!id) return null
      const title = String(record.title || titleById.get(id) || candidateTitleById.value.get(id) || id)
      return {
        id,
        title,
        ruleMatchScore: readNumber(record.ruleMatchScore),
        ruleInitialIncludeScore: readNumber(record.ruleInitialIncludeScore),
        ruleInitialExpandScore: readNumber(record.ruleInitialExpandScore),
        rawEmbeddingScore: readNumber(record.rawEmbeddingScore ?? record.score),
        embeddingIntentScore: readNumber(record.embeddingIntentScore),
        temporalRuleScore: readNumber(record.temporalRuleScore),
        relationRuleScore: readNumber(record.relationRuleScore),
        structurePriorityScore: readNumber(record.structurePriorityScore),
        baselineRecallBoost: readNumber(record.baselineRecallBoost),
        compileDirectBaseScore: readNumber(record.compileDirectBaseScore),
        compileExpandBaseScore: readNumber(record.compileExpandBaseScore),
        selfAnchorScore: readNumber(record.selfAnchorScore),
        userAnchorScore: readNumber(record.userAnchorScore),
        otherAnchorScore: readNumber(record.otherAnchorScore),
        runtimeUserAnchorScore: readNumber(record.runtimeUserAnchorScore),
        runtimeOtherAnchorScore: readNumber(record.runtimeOtherAnchorScore),
        runtimeWorldEntityScore: readNumber(record.runtimeWorldEntityScore),
        compileAnchorScore: readNumber(record.compileAnchorScore),
        agentIncludeDelta: readNumber(record.agentIncludeDelta),
        agentExpandDelta: readNumber(record.agentExpandDelta),
        includeScore: readNumber(record.includeScore),
        expandScore: readNumber(record.expandScore),
        candidateBaseScore: readNumber(record.candidateBaseScore),
        score: readNumber(record.score)
      }
    })
    .filter((item): item is ScoreRecord => Boolean(item))
}

function readJudgmentRecords(value: unknown): JudgmentRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): JudgmentRecord | null => {
      const record = readObject(item)
      const id = String(record.id || '').trim()
      if (!id) return null
      return {
        id,
        includeDecision: typeof record.includeDecision === 'string' ? record.includeDecision : undefined,
        expandDecision: typeof record.expandDecision === 'string' ? record.expandDecision : undefined,
        includeScoreBefore: readNumber(record.includeScoreBefore),
        includeScoreDelta: readNumber(record.includeScoreDelta),
        includeScoreAfter: readNumber(record.includeScoreAfter),
        expandScoreBefore: readNumber(record.expandScoreBefore),
        expandScoreDelta: readNumber(record.expandScoreDelta),
        expandScoreAfter: readNumber(record.expandScoreAfter),
        summaryQuality: typeof record.summaryQuality === 'string' ? record.summaryQuality : undefined,
        readNeed: typeof record.readNeed === 'string' ? record.readNeed : undefined,
        decision: typeof record.decision === 'string' ? record.decision : undefined,
        readDecision: typeof record.readDecision === 'string' ? record.readDecision : undefined,
        evidenceReasonCodes: readStringList(record.evidenceReasonCodes),
        confidence: readNumber(record.confidence)
      }
    })
    .filter((item): item is JudgmentRecord => Boolean(item))
}

function decisionText(value: unknown): string {
  if (value === 'confirm') return t('diagnostics.recallTrace.decConfirm')
  if (value === 'reject') return t('diagnostics.recallTrace.decReject')
  if (value === 'uncertain') return t('diagnostics.recallTrace.decUncertain')
  if (value === 'expand') return t('diagnostics.recallTrace.decExpand')
  if (value === 'no_expand') return t('diagnostics.recallTrace.decNoExpand')
  if (value === 'promote') return t('diagnostics.recallTrace.decPromote')
  if (value === 'summary') return t('diagnostics.recallTrace.decSummary')
  if (value === 'body') return t('diagnostics.recallTrace.decBody')
  if (value === 'budget') return t('diagnostics.recallTrace.decBudget')
  if (value === 'skip') return t('diagnostics.recallTrace.decSkip')
  return value ? String(value) : ''
}

function summaryQualityText(value: unknown): string {
  if (value === 'enough') return t('diagnostics.recallTrace.sqEnough')
  if (value === 'generic') return t('diagnostics.recallTrace.sqGeneric')
  if (value === 'missing_specific_fact') return t('diagnostics.recallTrace.sqMissingFact')
  return value ? String(value) : ''
}

function readNeedText(value: unknown): string {
  if (value === 'summary_only') return t('diagnostics.recallTrace.rnSummaryOnly')
  if (value === 'full_content') return t('diagnostics.recallTrace.rnFullContent')
  if (value === 'uncertain') return t('diagnostics.recallTrace.decUncertain')
  return value ? String(value) : ''
}

function scoreCell(value: unknown): string {
  const text = formatScoreValue(value)
  return text || '-'
}

function signedScoreCell(value: unknown): string {
  const text = formatSignedScoreValue(value)
  return text || '-'
}

function scoreFormulaCell(before: unknown, delta: unknown, after: unknown): string {
  const base = formatScoreValue(before)
  const correction = formatSignedScoreValue(delta) || '+0'
  const result = formatScoreValue(after)
  if (!base && !result) return correction
  return `${base || '-'} ${correction} = ${result || '-'}`
}

function buildRuleScoreTable(scores: ScoreRecord[], limit = 8): ReadableTable {
  return {
    columns: [
      { key: 'title', label: t('diagnostics.recallTrace.colCandidate') },
      { key: 'direct', label: t('diagnostics.recallTrace.colDirect') },
      { key: 'expand', label: t('diagnostics.recallTrace.colExpand') },
      { key: 'ruleBase', label: t('diagnostics.recallTrace.colRuleBase') },
      { key: 'time', label: t('diagnostics.recallTrace.colTime') },
      { key: 'relation', label: t('diagnostics.recallTrace.colRelation') },
      { key: 'structure', label: t('diagnostics.recallTrace.colStructure') },
      { key: 'baseline', label: t('diagnostics.recallTrace.colBaseline') },
      { key: 'directBase', label: t('diagnostics.recallTrace.colDirectBase') },
      { key: 'expandBase', label: t('diagnostics.recallTrace.colExpandBase') },
      { key: 'selfAnchor', label: t('diagnostics.recallTrace.colSelf') },
      { key: 'userAnchor', label: t('diagnostics.recallTrace.colUser') },
      { key: 'otherAnchor', label: t('diagnostics.recallTrace.colOther') },
      { key: 'entityAnchor', label: t('diagnostics.recallTrace.colEntity') }
    ],
    rows: scores.slice(0, limit).map((score) => ({
      title: score.title,
      direct: scoreCell(score.includeScore),
      expand: scoreCell(score.expandScore),
      ruleBase: scoreCell(score.ruleMatchScore),
      time: scoreCell(score.temporalRuleScore),
      relation: scoreCell(score.relationRuleScore),
      structure: scoreCell(score.structurePriorityScore),
      baseline: score.baselineRecallBoost !== undefined ? scoreCell(score.baselineRecallBoost) : '-',
      directBase: scoreCell(score.compileDirectBaseScore),
      expandBase: scoreCell(score.compileExpandBaseScore),
      selfAnchor: scoreCell(score.selfAnchorScore ?? score.compileAnchorScore),
      userAnchor: scoreCell(score.runtimeUserAnchorScore ?? score.userAnchorScore),
      otherAnchor: scoreCell(score.runtimeOtherAnchorScore ?? score.otherAnchorScore),
      entityAnchor: scoreCell(score.runtimeWorldEntityScore)
    }))
  }
}

function buildEmbeddingScoreTable(scores: ScoreRecord[], limit = 8): ReadableTable {
  return {
    columns: [
      { key: 'title', label: t('diagnostics.recallTrace.colCandidate') },
      { key: 'raw', label: t('diagnostics.recallTrace.colRawCosine') },
      { key: 'direct', label: t('diagnostics.recallTrace.colNormEmbedding') }
    ],
    rows: scores.slice(0, limit).map((score) => ({
      title: score.title,
      raw: scoreCell(score.rawEmbeddingScore ?? score.score),
      direct: scoreCell(score.embeddingIntentScore ?? score.includeScore)
    }))
  }
}

function buildMergeScoreTable(scores: ScoreRecord[], limit = 10): ReadableTable {
  return {
    columns: [
      { key: 'title', label: t('diagnostics.recallTrace.colCandidate') },
      { key: 'direct', label: t('diagnostics.recallTrace.colDirect') },
      { key: 'expand', label: t('diagnostics.recallTrace.colExpand') },
      { key: 'ruleDirect', label: t('diagnostics.recallTrace.colRuleDirect') },
      { key: 'ruleExpand', label: t('diagnostics.recallTrace.colRuleExpand') },
      { key: 'term', label: t('diagnostics.recallTrace.colTermHit') },
      { key: 'baseline', label: t('diagnostics.recallTrace.colBaseline') },
      { key: 'rawEmbedding', label: t('diagnostics.recallTrace.colRawCosine') },
      { key: 'embedding', label: t('diagnostics.recallTrace.colEmbedding') }
    ],
    rows: scores.slice(0, limit).map((score) => ({
      title: score.title,
      direct: scoreCell(score.includeScore),
      expand: scoreCell(score.expandScore),
      ruleDirect: scoreCell(score.ruleInitialIncludeScore),
      ruleExpand: scoreCell(score.ruleInitialExpandScore),
      term: scoreCell(score.ruleMatchScore),
      baseline: score.baselineRecallBoost !== undefined ? scoreCell(score.baselineRecallBoost) : '-',
      rawEmbedding: scoreCell(score.rawEmbeddingScore),
      embedding: scoreCell(score.embeddingIntentScore)
    }))
  }
}

function buildScoreTable(event: RecallActivityEvent, scores: ScoreRecord[]): ReadableTable {
  if (event.stepKey === 'candidate_rules_score') return buildRuleScoreTable(scores)
  if (event.stepKey === 'candidate_embedding_score') return buildEmbeddingScoreTable(scores)
  return buildMergeScoreTable(scores)
}

function buildScoreSection(event: RecallActivityEvent): ReadableSection | null {
  const output = readObject(event.output)
  const scores = readScoreRecords(output.scores, mapTitleByIdFromEvent(event))
  if (!scores.length) return null
  const table = buildScoreTable(event, scores)
  const lines = scores.length > table.rows.length
    ? [t('diagnostics.recallTrace.truncatedNote', { shown: table.rows.length, total: scores.length })]
    : []
  const title = event.stepKey === 'candidate_embedding_score' ? t('diagnostics.recallTrace.titleEmbeddingScore') : event.stepKey === 'candidate_rules_score' ? t('diagnostics.recallTrace.titleRulesScore') : t('diagnostics.recallTrace.titleMergeScore')
  const hint = event.stepKey === 'candidate_rules_score'
    ? t('diagnostics.recallTrace.hintRulesScore')
    : event.stepKey === 'candidate_embedding_score'
      ? t('diagnostics.recallTrace.hintEmbeddingScore')
      : t('diagnostics.recallTrace.hintMergeScore')
  return {
    title,
    hint,
    lines,
    tables: [table]
  }
}

function buildJudgmentTable(event: RecallActivityEvent, judgments: JudgmentRecord[]): ReadableTable {
  const titleById = mapTitleByIdFromEvent(event)
  const isReadGate = event.stepKey.includes('read') || event.stepKey === 'confirmed_content_read'
  const columns: ReadableTableColumn[] = isReadGate
    ? [
      { key: 'title', label: t('diagnostics.recallTrace.colCandidate') },
      { key: 'read', label: t('diagnostics.recallTrace.colRead') },
      { key: 'summary', label: t('diagnostics.recallTrace.decSummary') },
      { key: 'need', label: t('diagnostics.recallTrace.colBodyNeed') },
      { key: 'confidence', label: t('diagnostics.recallTrace.colConfidence') },
      { key: 'reason', label: t('diagnostics.recallTrace.colReason') }
    ]
    : [
      { key: 'title', label: t('diagnostics.recallTrace.colCandidate') },
      { key: 'includeDelta', label: t('diagnostics.recallTrace.colDirectDelta') },
      { key: 'expandDelta', label: t('diagnostics.recallTrace.colExpandDelta') },
      { key: 'confidence', label: t('diagnostics.recallTrace.colConfidence') },
      { key: 'reason', label: t('diagnostics.recallTrace.colReason') }
    ]
  return {
    columns,
    rows: judgments.map((judgment) => ({
      title: titleById.get(judgment.id) || judgment.id,
      includeDelta: scoreFormulaCell(judgment.includeScoreBefore, judgment.includeScoreDelta, judgment.includeScoreAfter),
      expandDelta: scoreFormulaCell(judgment.expandScoreBefore, judgment.expandScoreDelta, judgment.expandScoreAfter),
      decision: decisionText(judgment.decision) || '-',
      read: readDecisionLabel(judgment.readDecision) || decisionText(judgment.readDecision) || '-',
      summary: summaryQualityText(judgment.summaryQuality) || '-',
      need: readNeedText(judgment.readNeed) || '-',
      confidence: scoreCell(judgment.confidence),
      reason: judgment.evidenceReasonCodes?.join(', ') || '-'
    }))
  }
}

function buildJudgmentSection(event: RecallActivityEvent): ReadableSection | null {
  const output = readObject(event.output)
  const judgments = readJudgmentRecords(output.judgments)
  if (!judgments.length) return null
  const title = event.stepKey.includes('read') ? t('diagnostics.recallTrace.titleReadGate') : t('diagnostics.recallTrace.titleModelJudgment')
  return { title, lines: [], tables: [buildJudgmentTable(event, judgments)] }
}

function buildBoundarySection(event: RecallActivityEvent): ReadableSection | null {
  if (!event.stepKey.includes('boundary_update')) return null
  const output = readObject(event.output)
  return {
    title: t('diagnostics.recallTrace.titleBoundaryUpdate'),
    lines: [],
    tables: [{
      columns: [
        { key: 'frontierDebt', label: t('diagnostics.recallTrace.colFrontierDebt') },
        { key: 'stop', label: t('diagnostics.recallTrace.colStopAllowed') }
      ],
      rows: [{
        frontierDebt: `${event.metrics?.frontierDebtBefore ?? '?'} -> ${event.metrics?.frontierDebtAfter ?? output.frontierDebt ?? '?'}`,
        stop: event.metrics?.stopAllowed ?? output.stopAllowed ? t('common.yes') : t('common.no')
      }]
    }]
  }
}

function buildConfirmedReadSection(event: RecallActivityEvent): ReadableSection | null {
  if (event.stepKey !== 'confirmed_content_read' && event.stepKey !== 'recall_metrics_summary') return null
  const output = readObject(event.output)
  const units = readUnitRefs(output.confirmed).length ? readUnitRefs(output.confirmed) : event.metrics?.confirmedUnits || []
  if (!units.length) return { title: t('diagnostics.recallTrace.titleFinalConfirm'), lines: [t('diagnostics.recallTrace.finalSelectedNone')] }
  return {
    title: event.stepKey === 'recall_metrics_summary' ? t('diagnostics.recallTrace.titleSummary') : t('diagnostics.recallTrace.titleFinalConfirm'),
    lines: [],
    tables: [{
      columns: [
        { key: 'title', label: t('diagnostics.recallTrace.colUnit') },
        { key: 'read', label: t('diagnostics.recallTrace.colRead') },
        { key: 'score', label: t('diagnostics.recallTrace.colScore') }
      ],
      rows: units.map((unit) => ({
        title: unit.title || unit.id,
        read: readDecisionLabel(unit.readDecision) || t('diagnostics.recallTrace.enterContext'),
        score: scoreCell(unit.score)
      }))
    }]
  }
}

function buildEventReadableSections(event: RecallActivityEvent): ReadableSection[] {
  return [
    buildScoreSection(event),
    buildJudgmentSection(event),
    buildBoundarySection(event),
    buildConfirmedReadSection(event)
  ].filter((section): section is ReadableSection => Boolean(section && (section.lines.length || section.tables?.some((table) => table.rows.length))))
}

function tableWithTitle(title: string, table: ReadableTable): ReadableTable {
  return { ...table, title }
}

function tableCellClass(column: ReadableTableColumn): string {
  if (column.key === 'reason') return 'recall-activity-event__table-cell--reason'
  if (['includeDelta', 'expandDelta'].includes(column.key)) return 'recall-activity-event__table-cell--formula'
  if (['include', 'expand', 'confidence'].includes(column.key)) return 'recall-activity-event__table-cell--short'
  if (['score', 'summary', 'need', 'decision'].includes(column.key)) {
    return 'recall-activity-event__table-cell--compact'
  }
  return ''
}

function tableColumnStyle(table: ReadableTable, column: ReadableTableColumn): Partial<Record<'width', string>> {
  if (column.key === 'title') {
    return { width: `${contentColumnWidthCh(table, column, 10, 30)}ch` }
  }
  if (column.key === 'reason') return { width: 'auto' }
  if (column.key === 'read') {
    return { width: `${contentColumnWidthCh(table, column, 8, 18)}ch` }
  }
  if (['includeDelta', 'expandDelta'].includes(column.key)) {
    return { width: `${contentColumnWidthCh(table, column, 18, 28)}ch` }
  }
  if (column.key === 'confidence') {
    return { width: '6ch' }
  }
  if (['score', 'summary', 'need', 'decision'].includes(column.key)) {
    return { width: '9ch' }
  }
  return {}
}

function contentColumnWidthCh(table: ReadableTable, column: ReadableTableColumn, min: number, max: number): number {
  const widths = [
    readableTextWidth(column.label),
    ...table.rows.map((row) => readableTextWidth(row[column.key] || ''))
  ]
  return Math.min(max, Math.max(min, Math.max(...widths) + 2))
}

function readableTextWidth(value: string): number {
  return Array.from(String(value || '')).reduce((width, char) => {
    return width + (char.charCodeAt(0) > 255 ? 2 : 1)
  }, 0)
}

function buildRawUnitTable(title: string, units: RecallActivityUnitRef[]): ReadableTable | null {
  if (!units.length) return null
  return {
    title,
    columns: [
      { key: 'title', label: t('diagnostics.recallTrace.colUnit') },
      { key: 'id', label: 'ID' },
      { key: 'read', label: t('diagnostics.recallTrace.colRead') },
      { key: 'score', label: t('diagnostics.recallTrace.colScore') }
    ],
    rows: units.map((unit) => ({
      title: unit.title || unit.id,
      id: unit.id,
      read: readDecisionLabel(unit.readDecision) || '-',
      score: scoreCell(unit.score)
    }))
  }
}

function buildRawIdTable(title: string, ids: string[]): ReadableTable | null {
  if (!ids.length) return null
  return {
    title,
    columns: [
      { key: 'title', label: t('diagnostics.recallTrace.colCandidate') },
      { key: 'id', label: 'ID' }
    ],
    rows: ids.map((id) => ({
      title: candidateTitleById.value.get(id) || id,
      id
    }))
  }
}

function buildEventRawTables(event: RecallActivityEvent): ReadableTable[] {
  const input = readObject(event.input)
  const output = readObject(event.output)
  const scores = readScoreRecords(output.scores, mapTitleByIdFromEvent(event))
  const judgments = readJudgmentRecords(output.judgments)
  return [
    scores.length && event.stepKey === 'candidate_rules_score' ? tableWithTitle(t('diagnostics.recallTrace.rawRulesScore'), buildRuleScoreTable(scores, scores.length)) : null,
    scores.length && event.stepKey === 'candidate_embedding_score' ? tableWithTitle(t('diagnostics.recallTrace.rawEmbeddingScore'), buildEmbeddingScoreTable(scores, scores.length)) : null,
    scores.length && event.stepKey !== 'candidate_rules_score' && event.stepKey !== 'candidate_embedding_score' ? tableWithTitle(t('diagnostics.recallTrace.rawMergeScore'), buildMergeScoreTable(scores, scores.length)) : null,
    judgments.length ? tableWithTitle(t('diagnostics.recallTrace.rawModelJudgment'), buildJudgmentTable(event, judgments)) : null,
    buildRawUnitTable(t('diagnostics.recallTrace.rawDirectUnits'), readUnitRefs(output.directUnits).length ? readUnitRefs(output.directUnits) : event.metrics?.directUnits || []),
    buildRawUnitTable(t('diagnostics.recallTrace.rawExpandedUnits'), readUnitRefs(output.expandedUnits).length ? readUnitRefs(output.expandedUnits) : event.metrics?.expandedUnits || []),
    buildRawUnitTable(t('diagnostics.recallTrace.rawFinalConfirmed'), readUnitRefs(output.confirmed).length ? readUnitRefs(output.confirmed) : event.metrics?.confirmedUnits || []),
    buildRawIdTable(t('diagnostics.recallTrace.rawCandidateIds'), readStringList(input.candidateIds)),
  ].filter((table): table is ReadableTable => Boolean(table && table.rows.length))
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function readUnitRefs(value: unknown): RecallActivityUnitRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): RecallActivityUnitRef | null => {
      if (typeof item === 'string') {
        const id = item.trim()
        return id ? { id, title: id } : null
      }
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const id = String(record.id || '').trim()
      const title = String(record.title || id).trim()
      if (!id && !title) return null
      return {
        id: id || title,
        title: title || id,
        ownerCharacterId: typeof record.ownerCharacterId === 'string' ? record.ownerCharacterId : typeof record.owner_character_id === 'string' ? record.owner_character_id : undefined,
        contentText: typeof record.contentText === 'string' ? record.contentText : typeof record.content_text === 'string' ? record.content_text : undefined,
        summary: typeof record.summary === 'string' ? record.summary : undefined,
        readDecision: (record.readDecision ?? record.read_decision) as RecallActivityUnitRef['readDecision'],
        score: typeof record.score === 'number' ? record.score : undefined
      }
    })
    .filter((item): item is RecallActivityUnitRef => Boolean(item))
}

function dedupeUnitRefs(units: RecallActivityUnitRef[]): RecallActivityUnitRef[] {
  const seen = new Set<string>()
  return units.filter((unit) => {
    const key = String(unit.id || unit.title || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function readCandidateRefs(value: unknown): RecallActivityCandidateRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): RecallActivityCandidateRef | null => {
      if (typeof item === 'string') {
        const id = item.trim()
        return id ? { id, title: id } : null
      }
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const id = String(record.id || '').trim()
      const title = String(record.title || record.t || id).trim()
      if (!id && !title) return null
      return {
        id: id || title,
        title: title || id
      }
    })
    .filter((item): item is RecallActivityCandidateRef => Boolean(item))
}

function buildEventCandidateLabels(event: RecallActivityEvent): string[] {
  const input = readObject(event.input)
  const output = readObject(event.output)
  const refs = [
    ...readCandidateRefs(input.candidateRefs),
    ...readCandidateRefs(output.candidates),
    ...readUnitRefs(output.directUnits),
    ...readUnitRefs(output.expandedUnits),
    ...readUnitRefs(output.confirmed),
    ...readUnitRefs(event.metrics?.directUnits),
    ...readUnitRefs(event.metrics?.expandedUnits),
    ...readUnitRefs(event.metrics?.confirmedUnits)
  ]
  const titleById = new Map(refs.map((ref) => [ref.id, ref.title || ref.id]))
  for (const [id, title] of candidateTitleById.value) {
    if (!titleById.has(id)) titleById.set(id, title)
  }
  const ids = readStringList(input.candidateIds)
  const candidates = ids.length
    ? ids.map((id) => ({ id, title: titleById.get(id) || id }))
    : readCandidateRefs(input.candidateRefs)
  return candidates.map(formatCandidateLabel)
}

function buildEventConfirmedLabels(event: RecallActivityEvent): string[] {
  if (event.metrics?.confirmedUnits?.length) {
    return event.metrics.confirmedUnits.map((unit) => unit.title || unit.id).filter(Boolean)
  }
  const input = readObject(event.input)
  const output = readObject(event.output)
  const refs = [
    ...readCandidateRefs(input.candidateRefs),
    ...readCandidateRefs(output.candidates),
    ...readUnitRefs(output.confirmed)
  ]
  const titleById = new Map(refs.map((ref) => [ref.id, ref.title || ref.id]))
  const judgments = readJudgmentRecords(output.judgments)
  const confirmedIds = judgments
    .filter((item) => item.includeDecision === 'confirm' || item.decision === 'promote')
    .map((item) => item.id)
    .filter(Boolean)
  const outputConfirmedIds = readUnitRefs(output.confirmed).map((unit) => unit.id)
  return [...new Set([...confirmedIds, ...outputConfirmedIds])]
    .map((id) => titleById.get(id) || candidateTitleById.value.get(id) || id)
    .filter(Boolean)
}

function formatEventSummary(event: RecallActivityEvent): string[] {
  const metrics = event.metrics
  const input = readObject(event.input)
  const output = readObject(event.output)
  if (!metrics && !Object.keys(input).length && !Object.keys(output).length) return []
  const lines: string[] = []
  const actualModelText = [metrics?.presetName, metrics?.model].filter(Boolean).join(' / ')
  if (actualModelText) {
    lines.push(t('diagnostics.recallTrace.lineModel', { value: actualModelText }))
  }
  const retryMode = typeof input.retryMode === 'string' ? input.retryMode : ''
  if (retryMode) lines.push(t('diagnostics.recallTrace.lineRetryMode', { value: retryMode }))
  const candidateLabels = buildEventCandidateLabels(event)
  if (candidateLabels.length) lines.push(t('diagnostics.recallTrace.lineCandidates', { value: candidateLabels.join('、') }))
  if (candidateLabels.length) {
    const confirmedLabels = buildEventConfirmedLabels(event)
    lines.push(t('diagnostics.recallTrace.lineConfirmed', { value: confirmedLabels.length ? confirmedLabels.join('、') : t('diagnostics.recallTrace.notSelected') }))
  }
  if (metrics?.directUnits) {
    lines.push(t('diagnostics.recallTrace.lineDirect', { value: formatUnits(metrics.directUnits) }))
  }
  if (metrics?.expandedUnits) {
    lines.push(t('diagnostics.recallTrace.lineExpand', { value: formatUnits(metrics.expandedUnits) }))
  }
  if (metrics?.frontierDebtBefore !== undefined || metrics?.frontierDebtAfter !== undefined) {
    lines.push(t('diagnostics.recallTrace.lineFrontierDebt', { before: metrics.frontierDebtBefore ?? '?', after: metrics.frontierDebtAfter ?? '?' }))
  }
  if (metrics?.unresolvedChildren !== undefined) {
    lines.push(t('diagnostics.recallTrace.lineUnresolved', { value: metrics.unresolvedChildren }))
  }
  if (metrics?.cacheHits !== undefined || metrics?.cacheMisses !== undefined) {
    lines.push(t('diagnostics.recallTrace.lineCache', { hits: metrics.cacheHits || 0, misses: metrics.cacheMisses || 0 }))
  }
  if (metrics?.stopAllowed !== undefined) {
    lines.push(t('diagnostics.recallTrace.lineStopAllowed', { value: metrics.stopAllowed ? t('common.yes') : t('common.no') }))
  }
  if (metrics?.confirmedUnits) {
    lines.push(t('diagnostics.recallTrace.lineFinalSelected', { value: formatUnits(metrics.confirmedUnits) }))
  }
  if (metrics?.callCount !== undefined && !metrics.model && !metrics.presetName) {
    lines.push(t('diagnostics.recallTrace.lineSmartCall', { count: metrics.callCount }))
  }
  const confirmed = readStringList(output.confirmed)
  const skipped = readStringList(output.skipped)
  if (confirmed.length) lines.push(t('diagnostics.recallTrace.lineOutputConfirmed', { value: confirmed.join('、') }))
  if (skipped.length) lines.push(t('diagnostics.recallTrace.lineOutputSkipped', { value: skipped.join('、') }))
  return lines
}

function formatEventPayload(event: RecallActivityEvent): string {
  return JSON.stringify({
    status: event.status,
    startedAt: event.startedAt,
    completedAt: event.completedAt,
    durationMs: event.durationMs,
    input: event.input,
    output: event.output,
    metrics: event.metrics,
    error: event.error
  }, null, 2)
}
</script>

<style scoped>
.recall-activity-panel {
  display: flex;
  container-type: inline-size;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  color: var(--morandi-text);
}

.recall-activity-panel__header {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  padding: 10px 14px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
}

.recall-activity-panel__header strong,
.recall-activity-panel__header span {
  display: block;
  min-width: 0;
}

.recall-activity-panel__header strong {
  font-size: 13px;
}

.recall-activity-panel__header span,
.recall-activity-panel__meta {
  color: var(--morandi-text-light);
  font-size: 12px;
}

.recall-activity-panel__header-actions {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.recall-activity-panel__header button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.recall-activity-panel__header button:hover {
  background: color-mix(in srgb, var(--morandi-border) 34%, transparent);
  color: var(--morandi-text);
}

.recall-activity-panel__header .recall-activity-panel__mode-button {
  width: auto;
  min-width: 38px;
  padding: 0 8px;
  font-size: 12px;
}

.recall-activity-panel__message-nav {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 7px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
  scrollbar-width: thin;
}

.recall-activity-panel__message-nav-item {
  display: grid;
  flex: 0 0 min(210px, 64%);
  min-width: 132px;
  max-width: 230px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
  padding: 5px 7px;
  text-align: left;
}

.recall-activity-panel__message-nav-item span {
  color: var(--morandi-text-light);
  font-size: 11px;
  white-space: nowrap;
}

.recall-activity-panel__message-nav-item strong {
  overflow: hidden;
  color: var(--morandi-text);
  font-size: 12px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-panel__message-nav-item:hover,
.recall-activity-panel__message-nav-item--active {
  border-color: color-mix(in srgb, var(--morandi-accent) 34%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-surface) 74%, #ffffff);
}

.recall-activity-panel__public-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
}

.recall-activity-panel__public-summary span,
.recall-activity-panel__public-summary small {
  color: var(--morandi-text-light);
  font-size: 12px;
  white-space: nowrap;
}

.recall-activity-panel__public-summary strong {
  overflow: hidden;
  color: var(--morandi-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-panel__summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
}

.recall-activity-panel__summary dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.recall-activity-panel__summary dl div {
  min-width: 0;
}

.recall-activity-panel__summary dt {
  color: var(--morandi-text-light);
  font-size: 11px;
}

.recall-activity-panel__summary dd {
  overflow: hidden;
  margin: 3px 0 0;
  color: var(--morandi-text);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-panel__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.recall-activity-panel__confirmed {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 96px;
  max-height: 420px;
  flex-direction: column;
  box-sizing: border-box;
  padding: 8px 14px 9px;
  overflow: hidden;
  border-bottom: 0;
}

.recall-activity-panel__confirmed--public {
  min-height: 96px;
}

.recall-activity-panel__confirmed--resizing {
  user-select: none;
}

.recall-activity-panel__section-title {
  flex: 0 0 auto;
  margin-bottom: 6px;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.recall-activity-panel__unit-list {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 0;
  grid-auto-rows: min-content;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px 8px;
  overflow: auto;
  padding-right: 2px;
}

.recall-activity-panel__unit-list--public {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@container (max-width: 460px) {
  .recall-activity-panel__unit-list,
  .recall-activity-panel__unit-list--public {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.recall-activity-panel__unit-item {
  position: relative;
  min-width: 0;
}

.recall-activity-panel__unit-item--expanded {
  z-index: 1;
}

.recall-activity-panel__unit-item > button {
  display: grid;
  width: 100%;
  min-height: 26px;
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 5px;
  padding: 3px 6px;
  background: color-mix(in srgb, var(--morandi-surface) 84%, #ffffff);
  color: var(--morandi-text);
  cursor: pointer;
  font-size: 12px;
  line-height: 1.25;
  text-align: left;
}

.recall-activity-panel__unit-item > button span,
.recall-activity-panel__unit-item > button small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-panel__unit-item > button small {
  color: var(--morandi-text-light);
  font-size: 11px;
  font-weight: 500;
}

.recall-activity-panel__unit-item > button:hover {
  border-color: color-mix(in srgb, var(--morandi-border) 96%, transparent);
  background: color-mix(in srgb, var(--morandi-surface) 62%, #ffffff);
}

.recall-activity-panel__unit-item--expanded > button {
  border-color: color-mix(in srgb, var(--morandi-accent) 36%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-surface) 52%, #ffffff);
}

.recall-activity-panel__unit-card {
  width: 100%;
  margin-top: 6px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--langhuan-paper-bg) 94%, #ffffff);
  box-shadow: 0 8px 22px color-mix(in srgb, #000 10%, transparent);
}

.recall-activity-panel__unit-card--detached {
  flex: 0 0 auto;
  width: auto;
  margin: 0 14px 8px;
}

.recall-activity-panel__unit-card header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 58%, transparent);
}

.recall-activity-panel__unit-card strong {
  overflow: hidden;
  color: var(--morandi-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-panel__unit-card header div {
  display: flex;
  align-items: center;
  gap: 4px;
}

.recall-activity-panel__unit-card header button {
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
  font-size: 12px;
}

.recall-activity-panel__unit-card header button:hover {
  background: color-mix(in srgb, var(--morandi-border) 32%, transparent);
  color: var(--morandi-text);
}

.recall-activity-panel__unit-body {
  max-height: min(34vh, 280px);
  overflow: auto;
  padding: 9px;
  color: var(--morandi-text);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.recall-activity-panel__splitter {
  position: relative;
  flex: 0 0 9px;
  cursor: row-resize;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
  background: color-mix(in srgb, var(--langhuan-paper-bg) 92%, #ffffff);
}

.recall-activity-panel__splitter::before {
  position: absolute;
  top: 4px;
  left: 50%;
  width: 40px;
  height: 1px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-border) 86%, transparent);
  content: "";
  transform: translateX(-50%);
}

.recall-activity-panel__splitter:hover::before {
  background: color-mix(in srgb, var(--morandi-text-light) 52%, transparent);
}

.recall-activity-panel__events {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  overflow: auto;
  padding: 12px 14px 18px;
}

.recall-activity-panel__events--public {
  gap: 8px;
}

.recall-activity-panel__empty-note {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.recall-activity-event {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-surface) 84%, #ffffff);
  padding: 10px;
}

.recall-activity-event--public {
  border-color: color-mix(in srgb, var(--morandi-border) 62%, transparent);
  background: transparent;
}

.recall-activity-event__head {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}

.recall-activity-event__dot {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: #b8a27f;
}

.recall-activity-event--completed .recall-activity-event__dot {
  background: #6e9a74;
}

.recall-activity-event--failed .recall-activity-event__dot {
  background: #b36b62;
}

.recall-activity-event--thought .recall-activity-event__dot {
  background: #9a927f;
}

.recall-activity-event__head strong {
  display: block;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-event__head span,
.recall-activity-event__metrics,
.recall-activity-event__summary,
.recall-activity-event__details {
  color: var(--morandi-text-light);
  font-size: 12px;
}

.recall-activity-event__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding-left: 18px;
}

.recall-activity-event__summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 18px;
  line-height: 1.45;
}

.recall-activity-event__public-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 18px;
}

.recall-activity-event__public-meta span {
  min-width: 0;
  max-width: 100%;
  padding: 2px 7px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 66%, transparent);
  border-radius: 6px;
  color: var(--morandi-text-light);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recall-activity-event__readable {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
  padding-left: 18px;
}

.recall-activity-event__readable-section {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 62%, transparent);
  padding-top: 7px;
}

.recall-activity-event__readable-title {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  color: var(--morandi-text);
  font-size: 12px;
}

.recall-activity-event__readable-title strong {
  color: var(--morandi-text);
  font-weight: 650;
}

.recall-activity-event__readable-title span {
  color: var(--morandi-text-light);
  font-size: 12px;
  font-weight: 400;
}

.recall-activity-event__readable-lines {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.45;
}

.recall-activity-event__readable-lines span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.recall-activity-event__table-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 68%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--langhuan-paper-bg) 90%, #ffffff);
}

.recall-activity-event__table-caption {
  padding: 6px 7px 0;
  color: var(--morandi-text-light);
  font-size: 11px;
}

.recall-activity-event__table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--morandi-text);
  font-size: 11px;
  line-height: 1.35;
}

.recall-activity-event__table th,
.recall-activity-event__table td {
  overflow: hidden;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 52%, transparent);
  padding: 5px 6px;
  text-align: left;
  text-overflow: ellipsis;
  vertical-align: top;
  white-space: nowrap;
}

.recall-activity-event__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--langhuan-paper-bg) 96%, #ffffff);
  color: var(--morandi-text-light);
  font-weight: 650;
}

.recall-activity-event__table td:first-child,
.recall-activity-event__table th:first-child {
  min-width: 112px;
}

.recall-activity-event__table .recall-activity-event__table-cell--compact {
  width: 9%;
  min-width: 58px;
}

.recall-activity-event__table .recall-activity-event__table-cell--formula {
  min-width: 132px;
}

.recall-activity-event__table .recall-activity-event__table-cell--short {
  min-width: 44px;
}

.recall-activity-event__table .recall-activity-event__table-cell--reason {
  width: 34%;
  min-width: 220px;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.recall-activity-event__table td {
  font-variant-numeric: tabular-nums;
}

.recall-activity-event__table tbody tr:last-child td {
  border-bottom: 0;
}

.recall-activity-event__table tbody tr:hover td {
  background: color-mix(in srgb, var(--morandi-border) 22%, transparent);
}

.recall-activity-event__summary--thought {
  max-height: none;
  padding-left: 18px;
  white-space: pre-wrap;
}

.recall-activity-event__summary--thought p {
  margin: 0;
}

.recall-activity-event__details summary {
  cursor: pointer;
}

.recall-activity-event__raw-tables {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.recall-activity-event__details pre {
  max-height: 280px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--morandi-bg) 76%, #ffffff);
  color: var(--morandi-text);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
