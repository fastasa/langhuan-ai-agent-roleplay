<template>
  <div
    class="chat-process-motion"
    role="status"
    :aria-label="label"
  >
    <ThreeBodyMotion :size="size" />
  </div>
</template>

<script setup lang="ts">
import ThreeBodyMotion from './ThreeBodyMotion.vue'

withDefaults(defineProps<{
  label?: string
  size?: number | string
}>(), {
  label: '处理中',
  size: 26
})
</script>

<style scoped>
.chat-process-motion {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 24px;
  padding: 6px 0 4px;
  color: var(--morandi-text-light);
}
</style>
