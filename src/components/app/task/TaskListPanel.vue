<template>
  <div v-if="filteredTasks.length > 0" style="margin-bottom: 20px;">
    <div
      v-for="task in filteredTasks"
      :key="task.id"
      class="task-item"
      :class="{
        'task-expanded': expandedTaskId === task.id,
        'task-completed': task.status === 'completed',
        'task-failed': task.status === 'failed'
      }"
    >
      <div
        :class="'task-type-stripe ' + (task.type || 'daily')"
        :style="{ background: task.type === 'daily' ? '#4caf50' : task.type === 'longterm' ? '#6a5acd' : '#ff9800' }"
      ></div>

      <div class="task-card-header" @click="$emit('update:expanded-task-id', expandedTaskId === task.id ? null : task.id)">
        <div class="task-info">
          <div class="task-name">
            <span v-if="task.type === 'daily'" class="task-type-badge daily"></span>
            <span v-else-if="task.type === 'longterm'" class="task-type-badge longterm"></span>
            <span v-else-if="task.type === 'bounty'" class="task-type-badge bounty"></span>
            {{ task.name || task.title }}
            <span
              v-if="Number(task.timerState?.accumulatedTime || 0) > 0 || task.timerState?.isRunning"
              class="task-timer-preview"
            >
              {{ formatTimerTime(getTaskElapsedTime(String(task.id || ''))) }}
            </span>
            <span
              v-if="getLastMarkDelta(task) !== null"
              class="task-timer-delta"
            >
              +{{ formatDuration(getLastMarkDelta(task) || 0) }}
            </span>
          </div>

          <div
            v-if="buildMarkDurationSummary(task).length > 0"
            class="task-marks-preview"
            style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; justify-content: flex-start;"
          >
            <span
              v-for="item in buildMarkDurationSummary(task)"
              :key="`${task.id}_${item.name}`"
              class="task-mark-chip"
              :class="{ 'task-mark-chip-running': isTagRunning(task, item.name) }"
              :style="getMarkChipStyle(task, item.name)"
            >
              {{ item.name }}：{{ formatDuration(item.durationMs) }}
            </span>
          </div>

          <div class="task-desc" v-if="task.desc">{{ task.desc }}</div>
          <div v-if="task.category" class="task-category-line">分类：{{ task.category }}</div>
          <div v-if="task.from" style="font-size: 0.8rem; color: var(--morandi-text-light);">派发者：{{ task.from }}</div>
          <div v-if="task.type === 'daily' && task.resetTime" class="task-timer" :class="{ 'task-expired': isTaskExpired(task) }">
            <span v-if="isTaskExpired(task)">已超时</span>
            <span v-else>{{ formatResetTime(task.resetTime ?? '') }}</span>
          </div>

          <div
            v-if="expandedTaskId !== task.id && hasTaskTimeline(task)"
            style="margin-top: 8px; width: 66.666%; max-width: 66.666%; min-width: 220px;"
          >
            <TaskTimeline :items="getTaskTimelineNodes(task)" :min-width="190" :adaptive-scale="true" :show-labels="false" :compact="true" />
          </div>
        </div>

        <div class="task-header-actions" @click.stop>
          <button
            v-if="!task.timerState?.isRunning"
            class="btn btn-success task-control-btn"
            @click.stop="$emit('start-task', String(task.id || ''))"
          >开始</button>
          <button
            v-else
            class="btn btn-warning task-control-btn"
            @click.stop="$emit('pause-task', String(task.id || ''))"
          >暂停</button>
          <button
            class="btn btn-secondary task-control-btn reset-btn"
            :class="{ 'reset-btn-pressed': pressingResetTaskId === String(task.id || '') }"
            :disabled="!canResetTask(task)"
            @click.stop="handleResetClick(task)"
          >{{ pressingResetTaskId === String(task.id || '') ? '归零中' : '归零' }}</button>
        </div>
        <span class="expand-arrow">{{ expandedTaskId === task.id ? '▼' : '▶' }}</span>
      </div>

      <div v-if="expandedTaskId === task.id" class="task-detail">
        <div class="task-detail-reward">
          奖励：+{{ task.expReward || task.reward || 0 }}exp
        </div>
        <div class="task-timer-control">
          <div class="timer-display">
            <span class="timer-time">{{ formatTimerTime(getTaskElapsedTime(String(task.id || ''))) }}</span>
            <span v-if="task.timerState?.isRunning" class="timer-status running">运行</span>
            <span v-else-if="Number(task.timerState?.accumulatedTime || 0) > 0" class="timer-status paused">暂停</span>
            <span
              v-if="getLastMarkDelta(task) !== null"
              class="timer-delta"
              style="font-size: 0.82rem; color: var(--morandi-text-light); font-family: monospace;"
            >
              +{{ formatDuration(getLastMarkDelta(task) || 0) }}
            </span>
          </div>
        </div>

        <div class="mark-input-group" style="margin-top: 12px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-small" @click.stop="$emit('open-tag-manager')" title="标签管理">自定义标签</button>
        </div>

        <div v-if="customTags.length > 0" class="custom-tags-row" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--morandi-text-light);">标签</span>
          <span
            v-for="tag in customTags"
            :key="tag.id"
            class="custom-tag-btn"
            :class="{ 'custom-tag-btn-running': isTagRunning(task, String(tag.name || ''), tag.id) }"
            :style="getTagChipStyle(task, tag)"
            @click.stop="$emit('use-custom-tag', tag)"
            style="display: inline-block; padding: 2px 8px; margin: 2px; border: 1px solid; border-radius: 10px; font-size: 0.75rem; cursor: pointer;"
          >
            {{ tag.name }}
          </span>
        </div>

        <div v-if="recentMarkTypes.length > 0" class="recent-marks" style="margin-top: 8px;">
          <span style="font-size: 0.75rem; color: var(--morandi-text-light);">最近：</span>
          <span
            v-for="type in recentMarkTypes.slice(0, 5)"
            :key="type"
            class="recent-mark-tag"
            @click.stop="$emit('quick-mark', { type, taskId: task.id })"
            style="display: inline-block; padding: 2px 8px; margin: 2px; background: var(--morandi-hover); border-radius: 10px; font-size: 0.75rem; cursor: pointer;"
          >
            {{ type }}
          </span>
        </div>

        <div v-if="hasTaskTimeline(task)" style="margin-top: 12px;">
          <div style="font-size: 0.75rem; color: var(--morandi-text-light); margin-bottom: 4px;">时间轴</div>
          <TaskTimeline :items="getTaskTimelineNodes(task)" :auto-scroll-on-updates="false" />
        </div>

        <div
          v-if="Number(task.timerState?.marks?.length || 0) > 0"
          class="marks-list"
          style="margin-top: 12px; max-height: 180px; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;"
        >
          <div
            v-for="(mark, index) in getSortedMarks(task)"
            :key="mark.id"
            class="mark-item"
            style="display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid var(--morandi-border); border-radius: 6px; font-size: 0.78rem;"
          >
            <span style="min-width: 0; display: grid; gap: 2px;">
              <span><strong>{{ mark.type }}</strong> {{ mark.isStart ? '开始' : '结束' }}<span v-if="mark.note"> - {{ mark.note }}</span></span>
              <span style="color: var(--morandi-text-light); font-size: 0.72rem;">较上一标签 +{{ formatDuration(getMarkDelta(task, index)) }}</span>
            </span>
            <span style="color: var(--morandi-text-light); margin-left: 6px; white-space: nowrap;">{{ formatDuration(Number(mark.time || 0)) }}</span>
          </div>
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label style="font-size: 0.78rem; color: var(--morandi-text-light);">完成 / 失败备注</label>
          <textarea
            :value="task.completionNote || task.completion_note || ''"
            rows="3"
            placeholder="记录完成说明、失败原因、补充信息"
            style="width: 100%; resize: vertical;"
            @input="updateTaskNoteDraft(task, ($event.target as HTMLTextAreaElement).value)"
            @blur="persistTaskNote(task)"
          ></textarea>
        </div>

        <div class="task-actions" style="margin-top: 12px; display: flex; gap: 8px;">
          <button v-if="task.status === 'active' || task.status === 'pending'" class="btn btn-success btn-small" @click.stop="$emit('complete-task', task)">完成</button>
          <button v-if="task.status === 'active' || task.status === 'pending'" class="btn btn-danger btn-small" @click.stop="$emit('fail-task', task)">失败</button>
          <button class="btn btn-secondary btn-small" @click.stop="$emit('delete-task', String(task.id || ''))">删除</button>
        </div>
      </div>
    </div>
  </div>

  <div v-else style="text-align: center; padding: 20px; color: var(--morandi-text-light);">
    暂无{{ { all: '任务', daily: '每日', longterm: '长期', bounty: '悬赏' }[currentTaskTab] || '任务' }}
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TaskTimeline from '../../common/TaskTimeline.vue'
import { buildTaskDurationSummary, getOpenTimerMarkIntervals } from '../../../utils/taskTimeline'
import type { TimelineNode } from '../../../utils/taskTimeline'
import type { TimerMark } from '../../../types'
import type { CustomTagLike, TaskItemViewModel } from '../../../types/panelContracts'

const props = defineProps<{
  filteredTasks: TaskItemViewModel[]
  expandedTaskId: string | null
  customMarkType: string
  customMarkNote: string
  customTags: CustomTagLike[]
  currentTaskTab: string
  recentMarkTypes: string[]
  hasTaskTimeline: (task: TaskItemViewModel) => boolean
  getTaskTimelineNodes: (task: TaskItemViewModel) => TimelineNode[]
  formatTimerTime: (ms: number) => string
  getTaskElapsedTime: (taskId: string) => number
  isTaskExpired: (task: TaskItemViewModel) => boolean
  formatResetTime: (resetTime: unknown) => string
  updateTask: (taskId: string, payload: Partial<TaskItemViewModel>) => void
}>()

const emit = defineEmits([
  'update:expanded-task-id',
  'start-task',
  'pause-task',
  'reset-task',
  'update:custom-mark-type',
  'update:custom-mark-note',
  'add-task-mark',
  'open-tag-manager',
  'use-custom-tag',
  'quick-mark',
  'complete-task',
  'fail-task',
  'delete-task'
])

const pressingResetTaskId = ref<string | null>(null)

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (hours > 0) {
    return `${hours}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function getTagChipStyle(task: TaskItemViewModel, tag: CustomTagLike) {
  const color = getResolvedTagColor(task, tag?.name, tag?.id)
  const highContrastText = getTagTextColor(tag?.name, color)
  const running = isTagRunning(task, String(tag?.name || ''), tag?.id)
  return {
    backgroundColor: running ? color : `${color}22`,
    borderColor: color,
    color: running ? highContrastText : color,
    fontWeight: '600',
    boxShadow: running ? 'none' : 'none',
    '--tag-glow-color': getTagGlowColor(tag?.name, color),
    '--tag-breathe-scale': String(isWorkTag(tag?.name) ? 1.025 : 1.02)
  }
}

function getMarkChipStyle(task: TaskItemViewModel, tagName: string) {
  const color = getResolvedTagColor(task, tagName)
  const running = isTagRunning(task, tagName)
  const highContrastText = getTagTextColor(tagName, color)
  return {
    backgroundColor: running ? color : `${color}22`,
    color: running ? highContrastText : color,
    borderColor: `${color}66`,
    boxShadow: running ? 'none' : 'none',
    '--tag-glow-color': getTagGlowColor(tagName, color),
    '--tag-breathe-scale': String(isWorkTag(tagName) ? 1.025 : 1.02)
  }
}

function getResolvedTagColor(task: TaskItemViewModel, tagName?: string, tagId?: string) {
  if (String(tagName || '') === '工作') {
    return '#75c1c4'
  }

  const tags = Array.isArray(props.customTags) ? props.customTags : []
  const byId = tagId
    ? tags.find((tag) => String(tag?.id || '') === String(tagId))
    : null
  if (byId?.color) return String(byId.color)

  const byName = tags.find((tag) => String(tag?.name || '') === String(tagName || ''))
  if (byName?.color) return String(byName.color)

  const marks = Array.isArray(task?.timerState?.marks) ? task.timerState.marks : []
  const related = [...marks]
    .filter((mark) => {
      if (tagId && String(mark?.tagId || '') === String(tagId)) return true
      return String(mark?.type || '') === String(tagName || '')
    })
    .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
  const latestTagId = related.find((mark) => mark?.tagId)?.tagId
  if (latestTagId) {
    const relatedTag = tags.find((tag) => String(tag?.id || '') === String(latestTagId))
    if (relatedTag?.color) return String(relatedTag.color)
  }

  const latestByName = [...marks]
    .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
    .find((mark) => String(mark?.type || '') === String(tagName || '') && mark?.tagId)
  if (latestByName?.tagId) {
    const relatedTag = tags.find((tag) => String(tag?.id || '') === String(latestByName.tagId))
    if (relatedTag?.color) return String(relatedTag.color)
  }

  return '#8b7355'
}

function getTagTextColor(tagName: string | undefined, backgroundColor: string) {
  if (String(tagName || '') === '工作') {
    return '#0f2a2d'
  }
  return getContrastText(backgroundColor)
}

function getTagGlowColor(tagName: string | undefined, color: string) {
  if (isWorkTag(tagName)) {
    return 'rgba(63, 158, 163, 0.22)'
  }
  return `${color}55`
}

function isWorkTag(tagName: string | undefined) {
  return String(tagName || '') === '工作'
}

function getContrastText(hex: string) {
  const normalized = hex.replace('#', '')
  const fullHex = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) return '#2f2a24'
  const r = parseInt(fullHex.slice(0, 2), 16)
  const g = parseInt(fullHex.slice(2, 4), 16)
  const b = parseInt(fullHex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.66 ? '#2f2a24' : '#fff'
}

function getSortedMarks(task: TaskItemViewModel): TimerMark[] {
  return Array.isArray(task?.timerState?.marks)
    ? [...task.timerState.marks].sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
    : []
}

function getMarkDelta(task: TaskItemViewModel, index: number) {
  const marks = getSortedMarks(task)
  const currentTime = Number(marks[index]?.time || 0)
  const previousTime = index > 0 ? Number(marks[index - 1]?.time || 0) : 0
  return Math.max(0, currentTime - previousTime)
}

function getLastMarkDelta(task: TaskItemViewModel) {
  const marks = getSortedMarks(task)
  if (!marks.length) return null
  const elapsed = Number(props.getTaskElapsedTime(String(task.id || '')) || 0)
  const lastMarkTime = Number(marks[marks.length - 1]?.time || 0)
  return Math.max(0, elapsed - lastMarkTime)
}

function handleResetClick(task: TaskItemViewModel) {
  if (!canResetTask(task)) return
  pressingResetTaskId.value = String(task.id || '')
  emit('reset-task', String(task.id || ''))
  window.setTimeout(() => {
    if (pressingResetTaskId.value === String(task.id || '')) {
      pressingResetTaskId.value = null
    }
  }, 420)
}

function canResetTask(task: TaskItemViewModel) {
  return Boolean(task?.timerState?.isRunning)
    || Number(props.getTaskElapsedTime(String(task.id || '')) || 0) > 0
    || (task?.timerState?.marks?.length || 0) > 0
}

function buildMarkDurationSummary(task: TaskItemViewModel) {
  const elapsed = Number(props.getTaskElapsedTime(String(task.id || '')) || 0)
  return buildTaskDurationSummary(task?.timerState?.marks, elapsed)
}

function isTagRunning(task: TaskItemViewModel, tagName: string, tagId?: string) {
  if (String(tagName || '') === '工作') {
    return isWorkSegmentRunning(task)
  }

  if (!task?.timerState?.isRunning) return false
  return getOpenTagIntervals(task).some((interval) => {
    if (tagId && interval.tagId === String(tagId)) return true
    return interval.type === String(tagName || '')
  })
}

function isWorkSegmentRunning(task: TaskItemViewModel) {
  if (!task?.timerState?.isRunning) return false
  return getOpenTagIntervals(task).length === 0
}

function getOpenTagIntervals(task: TaskItemViewModel) {
  return getOpenTimerMarkIntervals(task?.timerState?.marks)
}

function updateTaskNoteDraft(task: TaskItemViewModel, value: string) {
  task.completionNote = value
  task.completion_note = value
}

function persistTaskNote(task: TaskItemViewModel) {
  const value = task?.completionNote || task?.completion_note || ''
  props.updateTask(String(task.id || ''), { completionNote: value })
}
</script>

<style scoped>
.task-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.task-control-btn {
  min-width: 46px;
  padding: 5px 9px;
  font-size: 0.74rem;
  line-height: 1.15;
  border-radius: 999px;
  white-space: nowrap;
  transition: transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
}

.task-control-btn:active {
  transform: translateY(1px) scale(0.97);
}

.task-timer-preview {
  margin-left: 8px;
  font-size: 1rem;
  color: var(--morandi-text);
  font-family: monospace;
  font-weight: 700;
}

.task-timer-delta {
  margin-left: 8px;
  font-size: 0.88rem;
  color: var(--morandi-text-light);
  font-family: monospace;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.task-mark-chip {
  font-size: 0.72rem;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--morandi-soft-bg-strong);
  color: var(--morandi-text);
  white-space: nowrap;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.task-mark-chip-running {
  transform-origin: center;
  animation: task-tag-breathe 1.9s ease-in-out infinite;
}

.custom-tag-btn-running {
  transform-origin: center;
  animation: task-tag-breathe 1.9s ease-in-out infinite;
}

@keyframes task-tag-breathe {
  0%, 100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 0 2px var(--tag-glow-color, rgba(139, 115, 85, 0.28)), 0 6px 14px rgba(0, 0, 0, 0.08);
    filter: brightness(1);
  }
  50% {
    transform: translateY(-1px) scale(var(--tag-breathe-scale, 1.02));
    box-shadow: 0 0 0 4px var(--tag-glow-color, rgba(139, 115, 85, 0.42)), 0 10px 18px rgba(0, 0, 0, 0.12);
    filter: brightness(1.03);
  }
}

.reset-btn-pressed {
  transform: translateY(1px) scale(0.97);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
  background: var(--morandi-soft-bg-strong);
}

.reset-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.task-detail-reward {
  margin-bottom: 10px;
  font-size: 0.78rem;
  color: var(--morandi-text-light);
  font-weight: 600;
}

.task-category-line {
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

@media (max-width: 768px) {
  .task-control-btn {
    min-width: 42px;
    padding: 4px 8px;
    font-size: 0.7rem;
  }

  .task-timer-preview {
    font-size: 0.94rem;
  }

  .task-timer-delta {
    font-size: 0.8rem;
  }
}
</style>
