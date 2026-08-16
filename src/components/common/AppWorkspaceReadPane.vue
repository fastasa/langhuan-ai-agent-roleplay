<template>
  <section class="app-workspace-read-pane">
    <header class="app-workspace-read-pane__header">
      <div class="app-workspace-read-pane__path">
        <span v-for="(part, index) in pathParts" :key="`${part}:${index}`">
          <span v-if="index > 0" class="app-workspace-read-pane__sep">/</span>
          {{ part }}
        </span>
      </div>
      <div v-if="$slots.actions" class="app-workspace-read-pane__actions">
        <slot name="actions" />
      </div>
      <div v-else-if="meta" class="app-workspace-read-pane__meta">{{ meta }}</div>
    </header>
    <article class="app-workspace-read-pane__body">
      <header v-if="title || $slots['before-content']" class="app-workspace-read-pane__document-head">
        <h1 v-if="title" class="app-workspace-read-pane__title">{{ title }}</h1>
        <slot name="before-content" />
      </header>
      <div v-if="html" class="app-workspace-read-pane__content" v-html="html"></div>
      <div v-else class="app-workspace-read-pane__content app-workspace-read-pane__content--plain">
        {{ text || emptyText }}
      </div>
      <slot />
    </article>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  pathParts?: string[]
  title?: string
  meta?: string
  html?: string
  text?: string
  emptyText?: string
}>(), {
  pathParts: () => [],
  title: '',
  meta: '',
  html: '',
  text: '',
  emptyText: '当前内容为空。'
})
</script>

<style scoped>
.app-workspace-read-pane {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.app-workspace-read-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 clamp(18px, 3vw, 36px);
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 70%, transparent);
  color: var(--morandi-text-light, #6c7468);
  font-size: 13px;
}

.app-workspace-read-pane__path {
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--morandi-text, #364034) 76%, #6f9276 24%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-workspace-read-pane__sep {
  padding: 0 8px;
  color: var(--morandi-text-light, #6c7468);
}

.app-workspace-read-pane__meta {
  flex: 0 0 auto;
  color: var(--morandi-text-light, #6c7468);
  font-size: 12px;
  white-space: nowrap;
}

.app-workspace-read-pane__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.app-workspace-read-pane__actions :slotted(button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #6c7468);
  cursor: pointer;
}

.app-workspace-read-pane__actions :slotted(button:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--morandi-border, #cfd7c8) 34%, transparent);
  color: var(--morandi-text, #364034);
}

.app-workspace-read-pane__actions :slotted(button:disabled) {
  opacity: 0.38;
  cursor: not-allowed;
}

.app-workspace-read-pane__actions :slotted(svg) {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-workspace-read-pane__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 22px clamp(22px, 4vw, 48px);
  overflow: auto;
  color: var(--morandi-text, #364034);
}

.app-workspace-read-pane__document-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.app-workspace-read-pane__title {
  margin: 0;
  color: var(--morandi-text, #364034);
  font-size: clamp(1.25rem, 1.7vw, 1.62rem);
  font-weight: 700;
  line-height: 1.36;
}

.app-workspace-read-pane__document-head :deep(.compile-entry) {
  margin: 0;
}

.app-workspace-read-pane__content {
  line-height: 1.85;
}

.app-workspace-read-pane__content :deep(h1),
.app-workspace-read-pane__content :deep(h2),
.app-workspace-read-pane__content :deep(h3) {
  margin: 1.2em 0 0.5em;
  color: var(--morandi-text, #364034);
  line-height: 1.35;
}

.app-workspace-read-pane__content :deep(p) {
  margin: 0.6em 0;
}

.app-workspace-read-pane__content :deep(hr) {
  margin: 1.8em 0;
  border: none;
  border-top: 1px solid var(--morandi-border, #cfd7c8);
}

.app-workspace-read-pane__content :deep(code) {
  border-radius: 5px;
  background: color-mix(in srgb, var(--morandi-accent, #7ea79d) 11%, transparent);
  padding: 0.1em 0.35em;
}

.app-workspace-read-pane__content :deep(pre) {
  overflow: auto;
  border: 1px solid var(--morandi-border, #cfd7c8);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-surface, #f8f7f1) 88%, #ffffff 12%);
  padding: 12px;
}

.app-workspace-read-pane__content--plain {
  white-space: pre-wrap;
}
</style>
