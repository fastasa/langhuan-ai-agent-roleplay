<template>
  <div v-if="operations.length > 0" :class="rootClass" :style="rootStyle">
    <div
      v-if="mode === 'floating'"
      class="pending-floating-shell"
      :class="{ 'pending-floating-shell-open': panelExpanded }"
    >
      <button class="pending-floating-trigger" type="button" @click="togglePanel">
        <div class="pending-floating-trigger-main">
          <span class="pending-floating-title">待确认操作（{{ operations.length }}）</span>
        </div>
        <span class="pending-floating-arrow">{{ panelExpanded ? '▾' : '▸' }}</span>
      </button>

      <div v-if="panelExpanded" class="pending-floating-body">
        <div class="pending-ops-list">
          <div
            v-for="(op, index) in operations"
            :key="getOpKey(op, index)"
            class="pending-op-card"
          >
            <div class="pending-op-header" :class="{ 'pending-op-header-expandable': isExpandableOperation(op) }" @click="handleOpClick(op, index)">
              <div class="pending-op-header-main">
                <div class="pending-op-name">{{ getOperationTitle(op) }}</div>
                <div v-if="getOperationBrief(op)" class="pending-op-brief">{{ getOperationBrief(op) }}</div>
              </div>
              <div class="pending-op-header-actions">
                <span v-if="isExpandableOperation(op)" class="pending-op-expand">{{ isOpExpanded(op, index) ? '收起' : '展开' }}</span>
                <button class="pending-op-remove" type="button" @click.stop="$emit('remove', index)">×</button>
              </div>
            </div>

            <div v-if="!isOpExpanded(op, index) && op.extra?.task && hasTaskTimeline(op.extra.task)" class="pending-op-timeline">
              <TaskTimeline :items="getTaskTimelineNodes(op.extra.task)" :min-width="190" :adaptive-scale="true" :show-labels="false" :compact="true" />
            </div>

            <div v-if="isOpExpanded(op, index)" class="pending-op-detail">
              <template v-if="op.extra?.task">
                <div class="pending-task-row">
                  <span class="pending-task-label">任务名</span>
                  <span>{{ getTaskName(op.extra.task) }}</span>
                </div>
                <div class="pending-task-grid">
                  <div class="pending-task-chip">类型：{{ getTaskTypeLabel(op.extra.task) }}</div>
                  <div class="pending-task-chip">状态：{{ getTaskStatusLabel(op.extra.task) }}</div>
                  <div class="pending-task-chip">经验：+{{ getTaskExp(op.extra.task) }}</div>
                  <div v-if="getTaskCategory(op.extra.task)" class="pending-task-chip">分类：{{ getTaskCategory(op.extra.task) }}</div>
                </div>
                <div v-if="getTaskDescription(op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">内容</span>
                  <span>{{ getTaskDescription(op.extra.task) }}</span>
                </div>
                <div v-if="getTaskPublisher(op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">派发者</span>
                  <span>{{ getTaskPublisher(op.extra.task) }}</span>
                </div>
                <div v-if="getTaskPublishNote(op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">派发备注</span>
                  <span>{{ getTaskPublishNote(op.extra.task) }}</span>
                </div>
                <div v-if="getTaskCompletionNote(op, op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">{{ op.type === '任务失败' ? '失败备注' : '完成备注' }}</span>
                  <span>{{ getTaskCompletionNote(op, op.extra.task) }}</span>
                </div>
                <div v-if="getTaskTimerSummary(op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">计时</span>
                  <span>{{ getTaskTimerSummary(op.extra.task) }}</span>
                </div>
                <div v-if="hasTaskTimeline(op.extra.task)" class="pending-op-timeline pending-op-timeline-expanded">
                  <div class="pending-task-label">时间轴</div>
                  <TaskTimeline :items="getTaskTimelineNodes(op.extra.task)" :min-width="360" />
                </div>
              </template>
              <div v-else class="pending-task-row">
                <span>{{ op.desc }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="pending-floating-actions">
          <button class="btn btn-secondary btn-small" @click="$emit('clear')">撤销</button>
          <button class="btn btn-success btn-small" @click="$emit('confirm')" :disabled="isTyping">{{ isTyping ? '确认中...' : '确认' }}</button>
        </div>
      </div>
    </div>

    <template v-else>
      <div class="pending-ops-card">
        <div class="pending-ops-header">
          <span class="pending-ops-title">待确认操作（{{ operations.length }}）</span>
        </div>
        <div class="pending-ops-list">
          <div v-for="(op, index) in operations" :key="getOpKey(op, index)" class="pending-op-card">
            <div class="pending-op-header" :class="{ 'pending-op-header-expandable': isExpandableOperation(op) }" @click="handleOpClick(op, index)">
              <div class="pending-op-header-main">
                <div class="pending-op-name">{{ getOperationTitle(op) }}</div>
                <div v-if="getOperationBrief(op)" class="pending-op-brief">{{ getOperationBrief(op) }}</div>
              </div>
              <div class="pending-op-header-actions">
                <span v-if="isExpandableOperation(op)" class="pending-op-expand">{{ isOpExpanded(op, index) ? '收起' : '展开' }}</span>
                <button class="pending-op-remove" type="button" @click.stop="$emit('remove', index)">×</button>
              </div>
            </div>
            <div v-if="!isOpExpanded(op, index) && op.extra?.task && hasTaskTimeline(op.extra.task)" class="pending-op-timeline">
              <TaskTimeline :items="getTaskTimelineNodes(op.extra.task)" :min-width="190" :adaptive-scale="true" :show-labels="false" :compact="true" />
            </div>
            <div v-if="isOpExpanded(op, index)" class="pending-op-detail">
              <template v-if="op.extra?.task">
                <div class="pending-task-row">
                  <span class="pending-task-label">任务名</span>
                  <span>{{ getTaskName(op.extra.task) }}</span>
                </div>
                <div class="pending-task-grid">
                  <div class="pending-task-chip">类型：{{ getTaskTypeLabel(op.extra.task) }}</div>
                  <div class="pending-task-chip">经验：+{{ getTaskExp(op.extra.task) }}</div>
                  <div v-if="getTaskCategory(op.extra.task)" class="pending-task-chip">分类：{{ getTaskCategory(op.extra.task) }}</div>
                </div>
                <div v-if="getTaskDescription(op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">内容</span>
                  <span>{{ getTaskDescription(op.extra.task) }}</span>
                </div>
                <div v-if="getTaskCompletionNote(op, op.extra.task)" class="pending-task-row">
                  <span class="pending-task-label">{{ op.type === '任务失败' ? '失败备注' : '完成备注' }}</span>
                  <span>{{ getTaskCompletionNote(op, op.extra.task) }}</span>
                </div>
                <div v-if="hasTaskTimeline(op.extra.task)" class="pending-op-timeline pending-op-timeline-expanded">
                  <div class="pending-task-label">时间轴</div>
                  <TaskTimeline :items="getTaskTimelineNodes(op.extra.task)" :min-width="360" />
                </div>
              </template>
              <div v-else class="pending-task-row">
                <span>{{ op.desc }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="pending-floating-actions">
          <button class="btn btn-secondary btn-small" @click="$emit('clear')">撤销</button>
          <button class="btn btn-success btn-small" @click="$emit('confirm')" :disabled="isTyping">{{ isTyping ? '确认中...' : '确认' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TaskTimeline from '../common/TaskTimeline.vue'
import type { TimelineNode } from '../../utils/taskTimeline'
import type { TimelineTaskLike, TransactionOperationViewModel } from '../../types/panelContracts'

const props = withDefaults(defineProps<{
  mode?: 'detailed' | 'compact' | 'floating'
  operations: TransactionOperationViewModel[]
  isTyping?: boolean
  hasTaskTimeline: (task: TimelineTaskLike) => boolean
  getTaskTimelineNodes: (task: TimelineTaskLike) => TimelineNode[]
  formatTimerTime: (seconds: number) => string
  getTaskElapsedTime: (taskId: string) => number
}>(), {
  mode: 'detailed',
  isTyping: false
})

defineEmits<{
  (e: 'clear'): void
  (e: 'confirm'): void
  (e: 'remove', index: number): void
}>()

const expandedOperationKeys = ref<string[]>([])
const panelExpanded = ref(false)

const rootClass = computed(() => props.mode === 'floating' ? 'pending-floating-root' : 'pending-inline-root')
const rootStyle = computed(() => '')

function getOpKey(op: TransactionOperationViewModel, index: number) {
  return String(op?.id || `${op?.type || 'op'}_${index}`)
}

function isOpExpanded(op: TransactionOperationViewModel, index: number) {
  return expandedOperationKeys.value.includes(getOpKey(op, index))
}

function toggleOp(op: TransactionOperationViewModel, index: number) {
  const key = getOpKey(op, index)
  if (expandedOperationKeys.value.includes(key)) {
    expandedOperationKeys.value = expandedOperationKeys.value.filter((item) => item !== key)
    return
  }
  expandedOperationKeys.value.push(key)
}

function isExpandableOperation(op: TransactionOperationViewModel) {
  if (!op?.extra?.task) return false
  return op.type === '完成任务' || op.type === '任务失败'
}

function handleOpClick(op: TransactionOperationViewModel, index: number) {
  if (!isExpandableOperation(op)) return
  toggleOp(op, index)
}

function togglePanel() {
  panelExpanded.value = !panelExpanded.value
}

function getTaskName(task: TimelineTaskLike) {
  return String(task?.name || task?.title || '未命名任务')
}

function getTaskTypeLabel(task: TimelineTaskLike) {
  const type = String(task?.type || '').trim()
  if (type === 'daily') return '每日任务'
  if (type === 'longterm') return '长期任务'
  if (type === 'bounty') return '悬赏任务'
  return type || '未分类'
}

function getTaskStatusLabel(task: TimelineTaskLike) {
  const status = String(task?.status || '').trim()
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '已失败'
  if (status === 'in_progress') return '进行中'
  return status || '待处理'
}

function getTaskExp(task: TimelineTaskLike) {
  return Number(task?.reward || task?.exp || 0)
}

function getTaskCategory(task: TimelineTaskLike) {
  return String(task?.category || '').trim()
}

function getTaskDescription(task: TimelineTaskLike) {
  return String(task?.description || task?.desc || '').trim()
}

function getTaskPublisher(task: TimelineTaskLike) {
  return String(task?.publisher || task?.assigner || '').trim()
}

function getTaskPublishNote(task: TimelineTaskLike) {
  return String(task?.publishNote || task?.assignerNote || '').trim()
}

function getTaskCompletionNote(op: TransactionOperationViewModel, task: TimelineTaskLike) {
  return String(op?.extra?.note || task?.completionNote || task?.failureNote || '').trim()
}

function getTaskTimerSummary(task: TimelineTaskLike) {
  const taskId = String(task?.id || '')
  if (!taskId) return ''
  const elapsed = Number(props.getTaskElapsedTime(taskId) || 0)
  return elapsed > 0 ? props.formatTimerTime(elapsed) : ''
}

function getOperationTitle(op: TransactionOperationViewModel) {
  return String(op?.type || '未命名事务')
}

function getOperationBrief(op: TransactionOperationViewModel) {
  return String(op?.desc || '').trim()
}
</script>

<style scoped>
.pending-inline-root {
  width: 100%;
}

.pending-floating-root {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  width: min(860px, calc(100vw - 120px));
  z-index: 30;
  pointer-events: none;
}

.pending-floating-shell {
  pointer-events: auto;
  border: 1px solid rgba(103, 148, 116, 0.26);
  border-radius: 16px;
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
  box-shadow: 0 14px 36px rgba(80, 58, 36, 0.12);
  overflow: hidden;
}

.pending-floating-trigger {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  cursor: pointer;
  text-align: left;
}

.pending-floating-trigger-main {
  display: grid;
  gap: 2px;
}

.pending-floating-title,
.pending-ops-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--morandi-text);
}

.pending-floating-arrow {
  font-size: 1rem;
  color: var(--morandi-text-light);
}

.pending-floating-body,
.pending-ops-card {
  padding: 10px 14px 14px;
}

.pending-ops-card {
  width: 100%;
  border: 1px solid rgba(103, 148, 116, 0.24);
  border-radius: 18px;
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
  box-shadow: 0 14px 30px rgba(80, 58, 36, 0.08);
}

.pending-ops-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.pending-ops-list {
  display: grid;
  gap: 10px;
}

.pending-op-card {
  border: 1px solid rgba(123, 160, 132, 0.2);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  overflow: hidden;
}

.pending-op-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.pending-op-header-expandable {
  cursor: pointer;
}

.pending-op-header-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.pending-op-name {
  font-size: 0.93rem;
  font-weight: 700;
  color: var(--morandi-text);
}

.pending-op-brief {
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.pending-op-header-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-shrink: 0;
}

.pending-op-expand {
  font-size: 0.76rem;
  color: var(--morandi-text-light);
  padding-top: 2px;
}

.pending-op-remove {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: #c97463;
  color: #fff;
  cursor: pointer;
  line-height: 1;
}

.pending-op-detail {
  border-top: 1px solid rgba(123, 160, 132, 0.16);
  padding: 12px 14px 14px;
  display: grid;
  gap: 10px;
}

.pending-task-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pending-task-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(103, 148, 116, 0.1);
  color: var(--morandi-text);
  font-size: 0.76rem;
}

.pending-task-row {
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--morandi-text);
}

.pending-task-label {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.pending-op-timeline {
  padding: 0 14px 12px;
}

.pending-op-timeline-expanded {
  padding: 0;
}

.pending-floating-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}

@media (max-width: 900px) {
  .pending-floating-root {
    width: calc(100vw - 24px);
    top: 62px;
  }
}
</style>
