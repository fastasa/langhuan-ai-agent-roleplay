<template>
  <!-- 人在环上交互的共享停靠层：始终位于信息流与输入区之间，不参与消息滚动。 -->
  <section class="agent-interaction-dock" role="region" :aria-label="label">
    <div class="agent-interaction-dock__scroll">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
}>(), {
  label: '待确认操作'
})
</script>

<style scoped>
.agent-interaction-dock {
  /* 活动卡优先保住自身自然高度，消息/工具信息流先收缩；超过上限后才由本层内部滚动。 */
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: min(58%, 460px);
  padding: 8px 12px;
  border-top: 1px solid var(--morandi-border);
  background: var(--morandi-card);
  box-sizing: border-box;
  overflow: hidden;
}

.agent-interaction-dock__scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.agent-interaction-dock__scroll::-webkit-scrollbar {
  width: 6px;
}

.agent-interaction-dock__scroll::-webkit-scrollbar-track {
  background: transparent;
}

.agent-interaction-dock__scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-text-light) 35%, transparent);
}
</style>
