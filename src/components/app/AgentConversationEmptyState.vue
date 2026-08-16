<!-- 超级 Agent、编剧与舆图师共用的对话空态。紧凑对话区只显示干净星体；三根放射线留给桌宠状态星。 -->
<template>
  <div class="agent-conversation-empty-state" :class="{ 'is-muted': muted }">
    <XingyiStarIcon class="agent-conversation-empty-state__icon xy-star--idle" />
    <div class="agent-conversation-empty-state__text">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
import XingyiStarIcon from './XingyiStarIcon.vue'

withDefaults(defineProps<{
  text: string
  muted?: boolean
}>(), {
  muted: false
})
</script>

<style scoped>
.agent-conversation-empty-state {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 12px;
  color: color-mix(in srgb, var(--morandi-text-light, #666) 75%, transparent);
  text-align: center;
}

.agent-conversation-empty-state__icon {
  width: 26px;
  height: 26px;
  opacity: 0.5;
  shape-rendering: auto;
}

.agent-conversation-empty-state__icon :deep(.xingyi-star-icon__rays) {
  display: none;
}

.agent-conversation-empty-state__icon :deep(.xingyi-star-icon__outline) {
  stroke-width: 3;
}

.agent-conversation-empty-state__text {
  max-width: 220px;
  font-size: 12px;
  line-height: 1.6;
}

.agent-conversation-empty-state.is-muted .agent-conversation-empty-state__icon {
  opacity: 0.34;
}
</style>
