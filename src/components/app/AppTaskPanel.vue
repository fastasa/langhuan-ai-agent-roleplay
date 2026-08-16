<template>
  <div class="collapsible card" style="padding: 0;">
    <div class="collapsible-header" @click="viewModel.sections.tasks = !viewModel.sections.tasks" style="padding: 16px; border-radius: 12px;">
      <span class="card-title" style="margin: 0;">任务系统</span>
      <div class="user-level-capsule" style="display: flex; align-items: center; gap: 10px; margin-left: auto; margin-right: 8px; background: rgba(92, 138, 92, 0.1); padding: 4px 12px; border-radius: 16px;">
        <span style="font-weight: 600; color: var(--morandi-success);">Lv.{{ viewModel.userLevel.level }}</span>
        <div class="exp-bar" style="width: 50px; height: 5px; background: #e0e0e0; border-radius: 3px; overflow: hidden;">
          <div class="exp-fill" :style="{ width: (viewModel.userLevel.exp / viewModel.userLevel.expToNext * 100) + '%', background: 'var(--morandi-success)', height: '100%' }"></div>
        </div>
        <span style="font-size: 0.65rem; color: #666;">{{ viewModel.userLevel.exp }}/{{ viewModel.userLevel.expToNext }}</span>
        <span style="color: #aaa;">|</span>
        <div class="activity-dots" style="display: flex; gap: 3px;">
          <span v-for="i in 3" :key="i" :style="{ color: i <= viewModel.userLevel.dailyActive ? 'var(--morandi-success)' : '#ddd', fontSize: '0.6rem' }"></span>
        </div>
      </div>
      <span class="collapsible-arrow" :class="{ open: viewModel.sections.tasks }">▾</span>
    </div>

    <div class="collapsible-content" :class="{ open: viewModel.sections.tasks }" style="padding: 0 16px 16px 16px;">
      <div class="timeline-scale-bar">
        <span class="timeline-scale-label">时间轴比例</span>
        <input
          class="timeline-scale-slider"
          type="range"
          min="1"
          max="200"
          step="1"
          :value="timelinePxPerMinute"
          @input="updateTimelineScale(($event.target as HTMLInputElement).value)"
        >
        <span class="timeline-scale-value">{{ timelinePxPerMinute }}pt/分钟</span>
      </div>

      <div style="display: flex; gap: 8px; margin: 12px 0;">
        <button class="btn btn-small btn-secondary" @click="showDispatchPanel = true">派发任务</button>
        <button class="btn btn-small btn-primary" @click="showCreatePanel = true">添加任务</button>
      </div>

      <div class="task-tabs" style="margin-bottom: 12px;">
        <button class="task-tab" :class="{ active: viewModel.currentTaskTab === 'all' }" @click="actions.updateCurrentTaskTab('all')">全部</button>
        <button class="task-tab" :class="{ active: viewModel.currentTaskTab === 'bounty' }" @click="actions.updateCurrentTaskTab('bounty')">悬赏</button>
        <button class="task-tab" :class="{ active: viewModel.currentTaskTab === 'longterm' }" @click="actions.updateCurrentTaskTab('longterm')">长期</button>
        <button class="task-tab" :class="{ active: viewModel.currentTaskTab === 'daily' }" @click="actions.updateCurrentTaskTab('daily')">每日</button>
        <span style="margin-left: auto; font-size: 0.8rem; color: #888; align-self: center;">活跃度 {{ viewModel.dailyActivity.completedCount }}/{{ viewModel.dailyActivity.targetCount }}</span>
      </div>

      <div v-if="availableTaskCategories.length > 1" class="task-tabs" style="margin-bottom: 12px; flex-wrap: wrap;">
        <button
          v-for="category in availableTaskCategories"
          :key="category"
          class="task-tab task-category-tab"
          :class="{ active: selectedTaskCategory === category }"
          @click="selectedTaskCategory = category"
        >
          {{ category }}
        </button>
      </div>

      <AppModalShell
        :open="showDispatchPanel"
        title="AI派发任务"
        size="lg"
        height-preset="tall"
        @close="showDispatchPanel = false"
      >
          <TaskDispatchPanel
            :assigner-options="viewModel.assignerOptions"
            :load-contact-characters="viewModel.loadContactCharacters"
            :load-contact-groups="viewModel.loadContactGroups"
            :task-assigner-char="viewModel.taskAssignerChar"
            :task-load-contact="viewModel.taskLoadContact"
            :is-requesting-task="viewModel.isRequestingTask"
            @update:task-assigner-char="actions.updateTaskAssignerChar"
            @update:task-load-contact="actions.updateTaskLoadContact"
            @dispatch-ai-task="actions.dispatchAiTask"
          />
      </AppModalShell>

      <TaskListPanel
        :filtered-tasks="displayedTasks"
        :expanded-task-id="viewModel.expandedTaskId"
        :custom-mark-type="viewModel.customMarkType"
        :custom-mark-note="viewModel.customMarkNote"
        :custom-tags="viewModel.customTags"
        :current-task-tab="viewModel.currentTaskTab"
        :recent-mark-types="viewModel.recentMarkTypes"
        :has-task-timeline="viewModel.hasTaskTimeline"
        :get-task-timeline-nodes="viewModel.getTaskTimelineNodes"
        :format-timer-time="viewModel.formatTimerTime"
        :get-task-elapsed-time="viewModel.getTaskElapsedTime"
        :is-task-expired="viewModel.isTaskExpired"
        :format-reset-time="viewModel.formatResetTime"
        :update-task="viewModel.updateTask"
        @update:expanded-task-id="actions.updateExpandedTaskId"
        @start-task="actions.startTask"
        @pause-task="actions.pauseTask"
        @reset-task="actions.resetTask"
        @update:custom-mark-type="actions.updateCustomMarkType"
        @update:custom-mark-note="actions.updateCustomMarkNote"
        @add-task-mark="actions.addTaskMark"
        @open-tag-manager="actions.openTagManager"
        @use-custom-tag="actions.useCustomTag"
        @quick-mark="actions.quickMark"
        @complete-task="actions.completeTask"
        @fail-task="actions.failTask"
        @delete-task="actions.deleteTask"
      />

      <AppModalShell
        :open="showCreatePanel"
        title="添加任务"
        size="lg"
        height-preset="tall"
        @close="showCreatePanel = false"
      >
          <TaskCreatePanel
            :current-task-tab="viewModel.currentTaskTab"
            :new-task-name="viewModel.newTaskName"
            :new-task-desc="viewModel.newTaskDesc"
            :new-task-reward="viewModel.newTaskReward"
            :new-task-category="viewModel.newTaskCategory"
            :new-task-bonus="viewModel.newTaskBonus"
            @update:current-task-tab="actions.updateCurrentTaskTab"
            @update:new-task-name="actions.updateNewTaskName"
            @update:new-task-desc="actions.updateNewTaskDesc"
            @update:new-task-reward="actions.updateNewTaskReward"
            @update:new-task-category="actions.updateNewTaskCategory"
            @update:new-task-bonus="actions.updateNewTaskBonus"
            @add-custom-task="actions.addCustomTask"
          />
      </AppModalShell>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TaskDispatchPanel from './task/TaskDispatchPanel.vue'
import TaskListPanel from './task/TaskListPanel.vue'
import TaskCreatePanel from './task/TaskCreatePanel.vue'
import AppModalShell from '../common/AppModalShell.vue'
import type { TaskPanelActions, TaskPanelViewModel } from '../../types/panelContracts'

const showDispatchPanel = ref(false)
const showCreatePanel = ref(false)
const selectedTaskCategory = ref('全部分类')
const TIMELINE_SCALE_KEY = 'langhuan_timeline_px_per_minute'
const TIMELINE_SCALE_EVENT = 'langhuan_timeline_scale_change'
const timelinePxPerMinute = ref(50)

function clampTimelineScale(value: number) {
  return Math.min(200, Math.max(1, Math.round(value)))
}

function loadTimelineScale() {
  const raw = Number(window.localStorage.getItem(TIMELINE_SCALE_KEY))
  timelinePxPerMinute.value = Number.isFinite(raw) ? clampTimelineScale(raw) : 50
}

function updateTimelineScale(rawValue: string) {
  const value = clampTimelineScale(Number(rawValue))
  timelinePxPerMinute.value = value
  window.localStorage.setItem(TIMELINE_SCALE_KEY, String(value))
  window.dispatchEvent(new CustomEvent(TIMELINE_SCALE_EVENT, { detail: { value } }))
}

onMounted(() => {
  loadTimelineScale()
})

const props = defineProps<{
  viewModel: TaskPanelViewModel
  actions: TaskPanelActions
}>()

const availableTaskCategories = computed(() => {
  const set = new Set<string>()
  for (const task of props.viewModel.filteredTasks || []) {
    const category = String(task?.category || '').trim()
    if (category) set.add(category)
  }
  return ['全部分类', ...Array.from(set)]
})

const displayedTasks = computed(() => {
  if (selectedTaskCategory.value === '全部分类') return props.viewModel.filteredTasks
  return (props.viewModel.filteredTasks || []).filter((task) => String(task?.category || '').trim() === selectedTaskCategory.value)
})

watch(availableTaskCategories, (value) => {
  if (!value.includes(selectedTaskCategory.value)) {
    selectedTaskCategory.value = '全部分类'
  }
}, { immediate: true })

</script>

<style scoped>
.timeline-scale-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 8px;
  padding: 8px 10px;
  background: rgba(155, 139, 122, 0.08);
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
}

.timeline-scale-label {
  font-size: 0.78rem;
  color: #6d645a;
  white-space: nowrap;
}

.timeline-scale-slider {
  flex: 1;
  min-width: 120px;
}

.timeline-scale-value {
  min-width: 88px;
  text-align: right;
  font-size: 0.76rem;
  color: #5a5249;
  font-weight: 600;
}

.collapsible-header .card-title::before {
  display: none;
}

.collapsible-header .card-title {
  gap: 0;
  font-weight: 600;
}

</style>
