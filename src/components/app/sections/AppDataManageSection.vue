<template>
  <div class="collapsible">
    <div class="collapsible-header" @click="viewModel.sections.dataManage = !viewModel.sections.dataManage">
      <span>数据安全</span>
      <span class="collapsible-arrow" :class="{ open: viewModel.sections.dataManage }">▾</span>
    </div>
    <div class="collapsible-content" :class="{ open: viewModel.sections.dataManage }">
      <div class="local-data-note">
        <strong>本地工作区</strong>
        <span>数据只保存在这台电脑上。导入、导出与重置均由用户主动执行。</span>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-secondary" @click="actions.exportData()">导出数据</button>
        <button class="btn btn-secondary" @click="actions.importData()">导入数据</button>
        <button class="btn btn-danger" @click="actions.resetData()">重置数据</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DataManagePanelActions, DataManagePanelViewModel } from '../../../types/panelContracts'

defineProps<{
  viewModel: DataManagePanelViewModel
  actions: DataManagePanelActions
}>()
</script>

<style scoped>
.local-data-note {
  margin-bottom: 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 55%, transparent);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.local-data-note span {
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

</style>
