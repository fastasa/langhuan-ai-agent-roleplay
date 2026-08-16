<template>
  <div class="chat-notes-panel">
    <div v-if="loading" class="chat-notes-panel__state">{{ t('common.loading') }}</div>
    <div v-else-if="!notes.length" class="chat-notes-panel__state">{{ t('chat.noNotes') }}</div>
    <ol v-else class="chat-notes-panel__list">
      <li v-for="note in notes" :key="String(note.id)" class="chat-notes-panel__item">
        <div class="chat-notes-panel__item-head">
          <div>
            <strong>{{ getNoteTitle(note) }}</strong>
            <span>{{ getNoteMeta(note) }}</span>
          </div>
          <div class="chat-notes-panel__actions">
            <button type="button" :title="t('chat.copyNote')" :aria-label="t('chat.copyNote')" @click="$emit('copy-note', note)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v11H9z"/><path d="M5 15H4V4h11v1"/></svg>
            </button>
            <button type="button" :title="t('chat.jumpToMessage')" :aria-label="t('chat.jumpToMessage')" @click="$emit('jump-message', note)">↗</button>
          </div>
        </div>
        <blockquote>{{ getNoteText(note) }}</blockquote>
        <div class="chat-notes-panel__foot">
          <span>{{ getNoteSourceMode(note) }}</span>
          <button type="button" @click="$emit('delete-note', note)">{{ t('common.delete') }}</button>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ChatMessageNote } from '../../../types'

const { t } = useI18n()

defineProps<{
  notes: ChatMessageNote[]
  loading: boolean
}>()

defineEmits<{
  (e: 'jump-message', note: ChatMessageNote): void
  (e: 'copy-note', note: ChatMessageNote): void
  (e: 'delete-note', note: ChatMessageNote): void
}>()

function readText(value: unknown) {
  return String(value ?? '').trim()
}

function getNoteTitle(note: ChatMessageNote) {
  const floor = readText(note.floorLabel ?? note.floor_label) || t('chat.floorItemFallback', { index: (Number(note.messageIndex ?? note.message_index ?? 0) || 0) + 1 })
  const speaker = readText(note.speakerName ?? note.speaker_name) || t('chat.unknown')
  return `${floor} · ${speaker}`
}

function getNoteMeta(note: ChatMessageNote) {
  return [
    readText(note.envDate ?? note.env_date),
    readText(note.envLocation ?? note.env_location),
    readText(note.envWeather ?? note.env_weather),
    readText(note.model)
  ].filter(Boolean).join(' · ')
}

function getNoteText(note: ChatMessageNote) {
  return readText(note.sourceText ?? note.source_text)
}

function getNoteSourceMode(note: ChatMessageNote) {
  // 比较值 'selection' 是存储的来源模式（保留）；返回的是显示标签（可翻）。
  return readText(note.sourceMode ?? note.source_mode) === 'selection' ? t('chat.sourceSelection') : t('chat.sourceWholeMessage')
}
</script>

<style scoped>
.chat-notes-panel {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.chat-notes-panel__state {
  padding: 18px 2px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.chat-notes-panel__list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0 2px 2px;
  overflow-y: auto;
  list-style: none;
}

.chat-notes-panel__item {
  padding: 10px 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 68%, transparent);
}

.chat-notes-panel__item-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.chat-notes-panel__item-head strong,
.chat-notes-panel__item-head span {
  display: block;
  min-width: 0;
}

.chat-notes-panel__item-head strong {
  color: var(--morandi-text);
  font-size: 13px;
  font-weight: 650;
}

.chat-notes-panel__item-head span,
.chat-notes-panel__foot {
  color: var(--morandi-text-light);
  font-size: 11px;
}

.chat-notes-panel button {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.chat-notes-panel button:hover {
  background: color-mix(in srgb, var(--morandi-border) 34%, transparent);
  color: var(--morandi-text);
}

.chat-notes-panel__actions {
  display: inline-flex;
  gap: 3px;
}

.chat-notes-panel__item-head button {
  width: 28px;
  height: 28px;
}

.chat-notes-panel__item-head svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.chat-notes-panel blockquote {
  max-height: 168px;
  margin: 8px 0 0;
  padding: 0 0 0 9px;
  overflow: auto;
  border-left: 2px solid color-mix(in srgb, var(--morandi-accent) 42%, var(--morandi-border));
  color: var(--morandi-text);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.chat-notes-panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.chat-notes-panel__foot button {
  height: 24px;
  padding: 0 7px;
  font-size: 11px;
}
</style>
