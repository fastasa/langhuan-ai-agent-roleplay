<template>
  <section class="doc-workspace-shell">
    <DocLibrary embedded />
  </section>
</template>

<script setup lang="ts">
import DocLibrary from '../../DocLibrary.vue'

defineProps<{
  workspacePrimaryView?: 'chat' | 'roles' | 'docs'
}>()

defineEmits<{
  (e: 'switch-workspace-view', nextView: 'chat' | 'roles' | 'docs'): void
}>()
</script>

<style scoped>
.doc-workspace-shell {
  display: flex;
  min-height: 0;
  flex: 1;
}
</style>
