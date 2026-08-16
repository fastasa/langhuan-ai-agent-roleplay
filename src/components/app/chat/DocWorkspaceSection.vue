<template>
  <div v-if="opened" class="chat-main doc-main" :class="{ 'doc-main--inactive': !active }" :aria-hidden="!active">
    <DocLibrary
      :ref="props.setDocLibraryRef"
      embedded
      external-sidebar
      @sidebar-state-change="$emit('sidebar-state-change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const DocLibrary = defineAsyncComponent(() => import('../../DocLibrary.vue'))

const props = defineProps<{
  opened: boolean
  active: boolean
  setDocLibraryRef: (target: unknown) => void
}>()

defineEmits<{
  (e: 'sidebar-state-change', state: unknown): void
}>()
</script>

<style scoped>
.doc-main--inactive {
  display: none !important;
}
</style>
