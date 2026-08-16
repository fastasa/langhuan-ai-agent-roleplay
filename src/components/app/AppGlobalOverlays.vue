<template>
  <Teleport to="body">
    <!-- 星依浮坞：自持状态（store 直读），Shift+X 全局唤出；不走本组件的 props 桥。
         全局 Agent 任务提示（workspaceRuntimeStore.agentTaskNotice）的展示层已收编进浮坞（2026-07-10），
         原右上角 AgentTaskLanyardNotice 退役删除，本组件不再桥接 notice。 -->
    <XingyiDock />

    <div v-if="toastVisible || timerCompleteVisible" class="global-notice-stack">
      <div v-if="toastVisible" :class="['toast', 'toast-' + toastType]">{{ toastMessage }}</div>

      <div
        v-if="timerCompleteVisible"
        :class="['timer-banner', 'timer-banner-' + timerCompleteType]"
        role="status"
        aria-live="polite"
      >
        <div class="timer-banner-content">
          <div class="timer-banner-title">{{ timerCompleteTitle || '票据计时完成' }}</div>
          <div class="timer-banner-message">{{ timerCompleteMessage || (timerCompleteTicketName + ' 时间已用完') }}</div>
        </div>
        <button class="timer-banner-close" @click="$emit('close-timer-complete')" aria-label="关闭提示">×</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import XingyiDock from './XingyiDock.vue'

defineProps<{
  toastVisible: boolean
  toastType: string
  toastMessage: string
  timerCompleteVisible: boolean
  timerCompleteTicketName: string
  timerCompleteMessage: string
  timerCompleteTitle: string
  timerCompleteType: string
}>()

defineEmits(['close-timer-complete'])
</script>
