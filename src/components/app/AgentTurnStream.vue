<template>
  <div v-if="entries.length" class="agent-turn-stream" :class="{ 'agent-turn-stream--inline': placement === 'inline' }">
    <SubagentTimelineList
      class="agent-turn-stream__list"
      :entries="entries"
      :running="running"
      :contained="false"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Agent 对话信息流权威展示组件。
 * 星依、编剧、舆图师以及未来工作区 Agent 都只消费本组件；历史回复上方用 inline，当前轮尾部用 live。
 */
import SubagentTimelineList from './chat/SubagentTimelineList.vue'
import type { AgentTurnStreamEntry } from '../../app/agentTurnStream'

withDefaults(defineProps<{
  entries: AgentTurnStreamEntry[]
  running?: boolean
  placement?: 'live' | 'inline'
}>(), {
  running: false,
  placement: 'live'
})
</script>

<style scoped>
.agent-turn-stream {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0 4px;
}

.agent-turn-stream--inline {
  margin-bottom: 4px;
}
</style>
