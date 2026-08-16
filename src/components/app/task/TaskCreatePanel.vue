<template>
  <h4 style="color: var(--morandi-text); margin-bottom: 12px; font-weight: 500; font-size: 0.95rem;">添加任务</h4>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <div style="display: flex; gap: 8px; align-items: center;">
      <input class="task-input" :value="newTaskName" @input="$emit('update:new-task-name', ($event.target as HTMLInputElement).value)" placeholder="任务名字" style="flex: 1;" @keyup.enter="$emit('add-custom-task')">
      <select :value="currentTaskTab" @change="$emit('update:current-task-tab', ($event.target as HTMLSelectElement).value)" style="padding: 6px; border: 1px solid var(--morandi-border); border-radius: 4px; font-size: 0.85rem; min-width: 90px;">
        <option value="daily">每日</option>
        <option value="longterm">长期</option>
        <option value="bounty">悬赏</option>
      </select>
    </div>
    <input class="task-input" :value="newTaskDesc" @input="$emit('update:new-task-desc', ($event.target as HTMLInputElement).value)" placeholder="任务备注（可选）" style="width: 100%;">
    <div style="display: flex; gap: 8px; align-items: center;">
      <input class="task-input" :value="newTaskCategory" @input="$emit('update:new-task-category', ($event.target as HTMLInputElement).value)" placeholder="分类（如学习/生活）" style="flex: 1;">
      <input class="task-input" :value="newTaskBonus" @input="$emit('update:new-task-bonus', ($event.target as HTMLInputElement).value)" placeholder="奖励点数" style="width: 120px;" type="number" min="0" @keyup.enter="$emit('add-custom-task')">
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <input class="task-input" :value="newTaskReward" @input="$emit('update:new-task-reward', ($event.target as HTMLInputElement).value)" placeholder="完成奖励经验（默认10）" style="flex: 1;" type="number" min="0" @keyup.enter="$emit('add-custom-task')">
      <button class="btn btn-primary" @click="$emit('add-custom-task')" :disabled="!newTaskName.trim()">添加到任务</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  currentTaskTab: string
  newTaskName: string
  newTaskDesc: string
  newTaskReward: string
  newTaskCategory: string
  newTaskBonus: string
}>()

defineEmits([
  'update:current-task-tab',
  'update:new-task-name',
  'update:new-task-desc',
  'update:new-task-reward',
  'update:new-task-category',
  'update:new-task-bonus',
  'add-custom-task'
])
</script>
