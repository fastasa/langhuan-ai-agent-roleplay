<template>
  <div class="mobile-roleplay-text chat-text" :class="{ 'tidiao-pe-whole': wholeFallback }" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderChatMarkdownToHtml, renderChatMarkdownWithPrecisionShimmer } from '../../utils/chatMarkdown'

const props = defineProps<{
  text: string
  /** 提调精修中：正在改的片段(oldText)列表，命中即段级 shimmer 高亮（提调修改消息·状态提示 B1）。 */
  segments?: string[]
}>()

const renderedHtml = computed(() => {
  const segments = props.segments || []
  if (!segments.length) return renderChatMarkdownToHtml(props.text || '')
  return renderChatMarkdownWithPrecisionShimmer(props.text || '', segments).html
})

/** 有精修片段但正文里一个都没定位到→整条退化高亮。 */
const wholeFallback = computed(() => {
  const segments = props.segments || []
  if (!segments.length) return false
  return renderChatMarkdownWithPrecisionShimmer(props.text || '', segments).matchedCount === 0
})
</script>

<style scoped>
.mobile-roleplay-text {
  color: var(--lhm-text, #333);
  font-size: 15px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.mobile-roleplay-text :deep(p) {
  margin: 0 0 0.62em;
}

.mobile-roleplay-text :deep(p:last-child) {
  margin-bottom: 0;
}

/* 角色扮演四色标记：*动作*绿斜体 · {心理}棕斜体 · [强调]金中粗 · (旁白)灰斜体 */
.mobile-roleplay-text :deep(.chat-style-segment.action) {
  color: var(--lhm-rp-action, #5c8a5c);
  font-style: italic;
}

.mobile-roleplay-text :deep(.chat-style-segment.bracket-curly) {
  color: var(--lhm-rp-thought, #8b7355);
  font-style: italic;
}

.mobile-roleplay-text :deep(.chat-style-segment.bracket-square) {
  color: var(--lhm-rp-emph, #d4a843);
  font-weight: 500;
}

.mobile-roleplay-text :deep(.chat-style-segment.bracket-square-double) {
  color: var(--lhm-rp-monologue, #8b7bb5);
  font-style: italic;
}

.mobile-roleplay-text :deep(.chat-style-segment.bracket-round) {
  color: var(--lhm-rp-comment, #7f8c8d);
  font-style: italic;
}

.mobile-roleplay-text :deep(.think-block) {
  margin: 8px 0;
  border-left: 2px solid var(--lhm-border-line, #e5e5e5);
  padding-left: 10px;
  color: var(--lhm-text-light, #666);
}

/* 数据表格：细边、暖色表头（对齐原型 DataTable） */
.mobile-roleplay-text :deep(table) {
  width: 100%;
  margin: 6px 0;
  border: 1px solid var(--lhm-border, #e0e0e0);
  border-radius: 8px;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  font-size: 12px;
}

.mobile-roleplay-text :deep(th),
.mobile-roleplay-text :deep(td) {
  padding: 7px 10px;
  text-align: left;
  border-right: 1px solid var(--lhm-border, #e0e0e0);
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
}

.mobile-roleplay-text :deep(th:last-child),
.mobile-roleplay-text :deep(td:last-child) {
  border-right: 0;
}

.mobile-roleplay-text :deep(tr:last-child td) {
  border-bottom: 0;
}

.mobile-roleplay-text :deep(th) {
  background: rgba(139, 115, 85, 0.06);
  color: var(--lhm-text, #333);
  font-weight: 600;
}

.mobile-roleplay-text :deep(td) {
  color: var(--lhm-text-light, #666);
}
</style>
