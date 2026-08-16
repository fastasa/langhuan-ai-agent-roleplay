<template>
  <AppFormDialog
    :open="state.showPromptPresetEditor.value"
    title="编辑预设"
    size="lg"
    @cancel="state.showPromptPresetEditor.value = false"
  >
      <div class="app-prompt-preset__head">
        <button
          type="button"
          class="preset-switch"
          :class="{ 'preset-switch--on': state.promptPresetForm.enabled }"
          :aria-pressed="state.promptPresetForm.enabled"
          :title="state.promptPresetForm.enabled ? '当前已启用' : '当前已停用'"
          @click="state.promptPresetForm.enabled = !state.promptPresetForm.enabled"
        >
          <span class="preset-switch__thumb"></span>
        </button>
      </div>
      <div class="form-group">
        <label>预设名称（标题）</label>
        <input v-model="state.promptPresetForm.name" placeholder="给预设起个名字，方便识别">
      </div>
      <div class="form-group">
        <label>角色</label>
        <select v-model="state.promptPresetForm.role">
          <option value="system">system</option>
          <option value="user">user</option>
          <option value="assistant">assistant</option>
          <option value="placeholder">placeholder</option>
        </select>
      </div>
      <div style="display: flex; gap: 10px;">
        <div class="form-group" style="flex: 1;">
          <label>场景</label>
          <select v-model="state.promptPresetForm.scene">
            <option value="">通用</option>
            <option value="chat">聊天</option>
            <option value="eval">评价</option>
            <option value="task">任务</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label>频率</label>
          <select v-model="state.promptPresetForm.frequency">
            <option value="">默认</option>
            <option value="always">每次</option>
            <option value="once">仅一</option>
            <option value="rare">偶尔</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>内容</label>
        <textarea v-model="state.promptPresetForm.content" rows="10" style="width: 100%; font-family: monospace; font-size: 0.85rem; padding: 8px; border: 1px solid var(--morandi-border); border-radius: 6px; resize: vertical;" placeholder="预设内容..."></textarea>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showPromptPresetEditor.value = false">取消</button>
        <button class="btn btn-primary" @click="state.savePromptPresetEdit()">保存</button>
      </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import AppFormDialog from '../../../common/AppFormDialog.vue'
import type { createPromptPresetModalState } from '../../../../composables/app/modalState/createPromptPresetModalState'

type PromptPresetModalState = ReturnType<typeof createPromptPresetModalState>

defineProps<{ state: PromptPresetModalState }>()
</script>

<style scoped>
.app-prompt-preset__head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
}

.preset-switch {
  width: 38px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: #d7e3e1;
  padding: 3px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s ease;
}

.preset-switch--on {
  background: #9fbdbc;
}

.preset-switch__thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(58, 77, 78, 0.18);
  transition: transform 0.2s ease;
}

.preset-switch--on .preset-switch__thumb {
  transform: translateX(16px);
}
</style>
