<template>
  <section ref="previewBody" class="leaf-docs__aux-panel-preview-body" @scroll="emit('preview-scroll')">
    <div
      v-if="html"
      class="leaf-docs__aux-panel-preview-content"
      v-html="html"
    ></div>
    <div v-else class="leaf-docs__aux-panel-preview-empty">{{ $t('brain.roleWorkspace.previewEmpty') }}</div>
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

const previewBody = ref<HTMLElement | null>(null)

function getPreviewElement() {
  return previewBody.value
}

defineExpose({
  getPreviewElement
})
</script>

<style scoped>
.leaf-docs__aux-panel-preview-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.leaf-docs__aux-panel-preview-content {
  padding: 22px 26px 34px;
  color: var(--leaf-text);
  font-size: 0.96rem;
  line-height: 1.78;
}

.leaf-docs__aux-panel-preview-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: var(--leaf-text-faint);
  font-size: 0.9rem;
}

.leaf-docs__aux-panel-preview-content :deep(h1),
.leaf-docs__aux-panel-preview-content :deep(h2),
.leaf-docs__aux-panel-preview-content :deep(h3) {
  margin: 1.2em 0 0.5em;
  color: var(--leaf-text);
  line-height: 1.35;
}

.leaf-docs__aux-panel-preview-content :deep(p) {
  margin: 0.6em 0;
}

.leaf-docs__aux-panel-preview-content :deep(code) {
  border-radius: 5px;
  background: color-mix(in srgb, var(--leaf-accent, #7ea79d) 11%, transparent);
  padding: 0.1em 0.35em;
}

.leaf-docs__aux-panel-preview-content :deep(pre) {
  overflow: auto;
  border: 1px solid var(--leaf-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--leaf-bg, #f8f7f1) 88%, #ffffff 12%);
  padding: 12px;
}
</style>
