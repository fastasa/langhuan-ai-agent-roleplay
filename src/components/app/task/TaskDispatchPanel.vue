<template>
  <div style="margin-bottom: 16px; background: #F0EDE6; border-radius: 8px; padding: 12px;">
    <div style="display: flex; gap: 8px; margin-bottom: 10px; align-items: center;">
      <select :value="taskAssignerChar" @change="$emit('update:task-assigner-char', ($event.target as HTMLSelectElement).value)" style="flex: 3; font-size: 0.85rem; padding: 6px 8px; border: 1px solid var(--morandi-border); border-radius: 6px;">
        <option value="">选择派发角色...</option>
        <option v-for="char in assignerOptions" :key="char.id" :value="char.id">
          {{ char.name }}
        </option>
      </select>
      <select :value="taskLoadContact" @change="$emit('update:task-load-contact', ($event.target as HTMLSelectElement).value)" style="flex: 2; font-size: 0.85rem; padding: 6px 8px; border: 1px solid var(--morandi-border); border-radius: 6px;">
        <option value="">不加</option>
        <optgroup label="角色">
          <option v-for="char in loadContactCharacters" :key="char.id" :value="char.id">
            {{ char.name }}
          </option>
        </optgroup>
        <optgroup label="群聊" v-if="loadContactGroups.length > 0">
          <option v-for="group in loadContactGroups" :key="group.id" :value="group.id">
            {{ group.name }}
          </option>
        </optgroup>
      </select>
    </div>
    <button class="btn btn-success" style="width: 100%; padding: 6px 10px; font-size: 0.82rem;" @click="$emit('dispatch-ai-task')" :disabled="isRequestingTask || !taskAssignerChar">
      {{ isRequestingTask ? '请求中...' : '请求AI派发任务' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { TaskPanelViewModel } from '../../../types/panelContracts'

defineProps<{
  assignerOptions: TaskPanelViewModel['assignerOptions']
  loadContactCharacters: TaskPanelViewModel['loadContactCharacters']
  loadContactGroups: TaskPanelViewModel['loadContactGroups']
  taskAssignerChar: string
  taskLoadContact: string
  isRequestingTask: boolean
}>()

defineEmits([
  'update:task-assigner-char',
  'update:task-load-contact',
  'dispatch-ai-task'
])
</script>
