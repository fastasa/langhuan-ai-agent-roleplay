<template>
  <AppModalShell
    :open="open"
    size="xl"
    height-preset="tall"
    body-compact
    @close="$emit('close')"
  >
    <slot />
  </AppModalShell>
</template>

<script setup lang="ts">
import AppModalShell from '../common/AppModalShell.vue'

withDefaults(defineProps<{
  open: boolean
}>(), {
  open: false
})

defineEmits<{
  (e: 'close'): void
}>()
</script>
