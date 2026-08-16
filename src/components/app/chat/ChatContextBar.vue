<template>
  <!-- 封存说明：这是旧聊天顶部“环境 / 已加载记忆总结”灰条。桌面聊天头部已经撤下它；后续统一清理确认无移动端依赖后可删除。 -->
  <div class="chat-context-bar">
    <div class="chat-context-content">
      <span v-if="currentScene?.time" class="chat-context-text">时间：{{ currentScene.time }}</span>
      <span v-if="currentScene?.location" class="chat-context-text">地点：{{ currentScene.location }}</span>
      <span v-if="currentScene?.weather" class="chat-context-text">{{ getWeatherEmoji(currentScene.weather) }} {{ currentScene.weather }}</span>
      <span v-if="currentAlias?.name" class="chat-context-text strong">{{ currentAlias.name }}</span>
      <div
        v-for="item in props.loadedSummaryItems"
        :key="item.id"
        class="chat-memory-swipe"
      >
        <button
          class="chat-memory-inline"
          type="button"
          :aria-expanded="expandedSummaryId === item.id"
          @click.stop="toggleSummaryCard(item.id)"
        >
          {{ item.name }}
        </button>
        <button class="chat-memory-delete-btn" @click.stop="emit('unload-summary', item.id)" aria-label="删除记忆">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4.8c0-.88.72-1.6 1.6-1.6h4.8c.88 0 1.6.72 1.6 1.6V6"/>
            <path d="M6.5 6.5l.8 12a2 2 0 0 0 2 1.87h5.4a2 2 0 0 0 2-1.87l.8-12"/>
            <path d="M10 10.5v6"/>
            <path d="M14 10.5v6"/>
          </svg>
        </button>
        <article
          v-if="expandedSummaryId === item.id"
          class="chat-memory-card"
          @click.stop
        >
          <header class="chat-memory-card__header">
            <span class="chat-memory-card__title">{{ item.name }}</span>
            <span v-if="item.kind" class="chat-memory-card__kind">{{ getSummaryKindLabel(item.kind) }}</span>
          </header>
          <div :ref="(element) => setSummaryCardBodyRef(element, item.id)" class="chat-memory-card__body">
            {{ item.content || '这个总结暂时没有正文内容。' }}
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ChatPanelViewModel } from '../../../types/panelContracts'
import type { ChatSummaryListItem } from '../../../types/panelContracts'

const props = withDefaults(defineProps<{
  currentScene: ChatPanelViewModel['currentScene']
  currentAlias: ChatPanelViewModel['currentAlias']
  loadedSummaryCount: number
  loadedSummaryItems: ChatSummaryListItem[]
  getWeatherEmoji: (weather: string) => string
}>(), {
  loadedSummaryItems: () => []
})

const emit = defineEmits<{
  (e: 'unload-summary', summaryId: string): void
}>()

const expandedSummaryId = ref('')
const summaryCardBodyRef = ref<HTMLElement | null>(null)

async function toggleSummaryCard(summaryId: string) {
  const shouldClose = expandedSummaryId.value === summaryId
  expandedSummaryId.value = shouldClose ? '' : summaryId
  summaryCardBodyRef.value = null
  if (!shouldClose) {
    await nextTick()
    scrollSummaryCardToBottom()
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollSummaryCardToBottom)
    })
  }
}

function setSummaryCardBodyRef(element: unknown, summaryId: string) {
  if (summaryId !== expandedSummaryId.value) return
  summaryCardBodyRef.value = element instanceof HTMLElement ? element : null
}

function scrollSummaryCardToBottom() {
  const body = summaryCardBodyRef.value
  if (!body) return
  body.scrollTop = body.scrollHeight
}

function closeSummaryCardByBlankClick(event: MouseEvent) {
  if (!expandedSummaryId.value) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.chat-memory-swipe')) return
  expandedSummaryId.value = ''
}

function getSummaryKindLabel(kind: string) {
  if (kind === 'small') return '小总结'
  if (kind === 'big') return '大总结'
  return '总结'
}

onMounted(() => {
  document.addEventListener('click', closeSummaryCardByBlankClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeSummaryCardByBlankClick)
})
</script>

<style scoped>
.chat-context-bar {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: rgba(155, 139, 122, 0.12);
  border-bottom: 1px solid var(--morandi-border);
}

.chat-context-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.chat-context-text {
  font-size: 0.74rem;
  color: var(--morandi-text);
  font-weight: 500;
}

.chat-memory-swipe {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding-right: 0;
}

.chat-memory-inline {
  border: none;
  background: rgba(155, 139, 122, 0.12);
  color: var(--morandi-text);
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1.45;
  padding: 2px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: padding-right 0.18s ease, background 0.18s ease;
  position: relative;
  z-index: 2;
}

.chat-memory-inline[aria-expanded="true"] {
  background: rgba(155, 139, 122, 0.2);
}

.chat-memory-delete-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: rgba(192, 102, 90, 0.14);
  color: #b25547;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 3;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, background 0.18s ease;
}

.chat-memory-swipe:hover .chat-memory-inline {
  padding-right: 30px;
}

.chat-memory-swipe:hover .chat-memory-delete-btn {
  opacity: 1;
  pointer-events: auto;
}

.chat-memory-delete-btn svg {
  width: 14px;
  height: 14px;
}

.chat-memory-card {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  width: min(360px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid var(--langhuan-menu-border, rgba(155, 139, 122, 0.14));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--morandi-card);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  color: var(--morandi-text);
  z-index: 30;
}

.chat-memory-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.chat-memory-card__title {
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-memory-card__kind {
  flex-shrink: 0;
  font-size: 0.68rem;
  color: var(--morandi-text-light);
}

.chat-memory-card__body {
  max-height: min(260px, 40vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: 0.78rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 139, 122, 0.28) transparent;
}

.chat-memory-card__body::-webkit-scrollbar {
  width: 2pt;
}

.chat-memory-card__body:hover {
  scrollbar-color: rgba(155, 139, 122, 0.76) transparent;
}

.chat-memory-card__body::-webkit-scrollbar-track {
  background: transparent;
}

.chat-memory-card__body::-webkit-scrollbar-thumb {
  background: rgba(155, 139, 122, 0.28);
  border-radius: 999px;
}

.chat-memory-card__body:hover::-webkit-scrollbar-thumb {
  background: rgba(155, 139, 122, 0.76);
}

.chat-context-text.strong {
  font-weight: 500;
}

</style>
