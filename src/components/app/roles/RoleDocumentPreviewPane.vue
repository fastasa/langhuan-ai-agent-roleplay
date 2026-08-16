<template>
  <section ref="previewRef" class="role-aux-panel__preview-body" @scroll="emit('preview-scroll')">
    <div
      v-if="html"
      class="role-aux-panel__preview-content"
      v-html="html"
    ></div>
    <div v-else class="role-aux-panel__preview-empty">{{ $t('brain.roleWorkspace.previewEmpty') }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  html: string
}>()

const emit = defineEmits<{
  'preview-scroll': []
}>()

const previewRef = ref<HTMLElement | null>(null)

function getPreviewElement() {
  return previewRef.value
}

defineExpose({
  getPreviewElement
})
</script>

<style scoped>
.role-aux-panel__preview-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 24px 26px 42px;
}

.role-aux-panel__preview-content {
  color: var(--morandi-text);
  line-height: 1.85;
}

.role-aux-panel__preview-empty {
  display: grid;
  min-height: 160px;
  place-items: center;
  color: var(--morandi-text-light);
  font-size: 13px;
}
</style>
