<template>
  <AppModalShell
    :open="Boolean(detail)"
    title="操作详情"
    size="sm"
    @close="$emit('close')"
  >
      <template v-if="detail">
      <div style="padding: 16px;">
        <p><strong>类型</strong>{{ detail.type }}</p>
        <p><strong>描述</strong>{{ detail.desc }}</p>
        <div v-if="detail.extra">
          <p><strong>详细信息</strong></p>
          <pre style="background: #f5f5f0; padding: 8px; border-radius: 4px; white-space: pre-wrap; font-size: 0.85rem;">{{ JSON.stringify(detail.extra, null, 2) }}</pre>
        </div>
      </div>
      </template>

      <template #actions>
        <button class="btn btn-primary" @click="$emit('close')">关闭</button>
      </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import type { OperationDetailState } from '../../types/panelContracts'
import AppModalShell from '../common/AppModalShell.vue'

defineProps<{
  detail: OperationDetailState
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>
