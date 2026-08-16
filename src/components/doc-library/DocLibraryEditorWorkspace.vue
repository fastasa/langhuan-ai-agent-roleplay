<template>
  <section class="leaf-docs__editor">
    <div class="leaf-docs__editor-path" :aria-label="$t('docLibrary.editor.pathAria')">
      <div class="leaf-docs__editor-path-text">
        <template v-for="(part, index) in pathParts" :key="`${part}:${index}`">
          <span v-if="index > 0" class="leaf-docs__editor-path-sep">/</span>
          <span class="leaf-docs__editor-path-part">{{ part }}</span>
        </template>
      </div>
    </div>
    <div class="leaf-docs__toolbar">
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.bold')" :aria-label="$t('brain.roleWorkspace.bold')" @click="emit('wrap-selection', '**')">B</button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.italic')" :aria-label="$t('brain.roleWorkspace.italic')" @click="emit('wrap-selection', '_')">I</button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.strikethrough')" :aria-label="$t('brain.roleWorkspace.strikethrough')" @click="emit('wrap-selection', '~~')">S</button>
      <button type="button" class="leaf-docs__toolbar-btn" :aria-label="$t('brain.roleWorkspace.insertLink')" @click="emit('insert-link')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 1 0-7.07-7.07L11 5"/>
          <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 19"/>
        </svg>
      </button>
      <span class="leaf-docs__toolbar-sep"></span>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.heading1')" :aria-label="$t('brain.roleWorkspace.heading1')" @click="emit('insert-heading', 1)">H1</button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.heading2')" :aria-label="$t('brain.roleWorkspace.heading2')" @click="emit('insert-heading', 2)">H2</button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.heading3')" :aria-label="$t('brain.roleWorkspace.heading3')" @click="emit('insert-heading', 3)">H3</button>
      <span class="leaf-docs__toolbar-sep"></span>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.insertTable')" :aria-label="$t('brain.roleWorkspace.insertTable')" @click="emit('insert-table')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="1"/>
          <path d="M3 10h18"/>
          <path d="M3 14h18"/>
          <path d="M9 5v14"/>
          <path d="M15 5v14"/>
        </svg>
      </button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.insertCodeBlock')" :aria-label="$t('brain.roleWorkspace.insertCodeBlock')" @click="emit('insert-code-block')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 8l-4 4 4 4"/>
          <path d="M16 8l4 4-4 4"/>
        </svg>
      </button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.insertImage')" :aria-label="$t('brain.roleWorkspace.insertImage')" @click="emit('insert-image')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <circle cx="9" cy="10" r="2"/>
          <path d="M21 16l-5-5-8 8"/>
        </svg>
      </button>
      <span class="leaf-docs__toolbar-sep"></span>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.roleWorkspace.undo')" :aria-label="$t('brain.roleWorkspace.undo')" @click="emit('undo-draft')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14 4 9l5-5"/>
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
        </svg>
      </button>
      <button type="button" class="leaf-docs__toolbar-btn" :title="$t('brain.card.redo')" :aria-label="$t('brain.card.redo')" @click="emit('redo-draft')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 14 5-5-5-5"/>
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>
        </svg>
      </button>
      <span class="leaf-docs__toolbar-spacer"></span>
      <button
        type="button"
        class="leaf-docs__toolbar-btn leaf-docs__toolbar-btn--success"
        :title="saveLabel"
        :disabled="!canSave"
        :aria-label="saveLabel"
        @click="emit('save')"
      >
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5z"/>
          <path d="M8 4v6h8V4"/>
          <path d="M9 20v-6h6v6"/>
        </svg>
      </button>
    </div>

    <div class="leaf-docs__editor-body">
      <div class="leaf-docs__editor-pane">
        <div class="leaf-docs__editor-meta">
          <label class="leaf-docs__editor-title-field">
            <span>{{ $t('brain.field.title') }}</span>
            <input
              class="leaf-docs__input"
              type="text"
              :placeholder="$t('brain.roleWorkspace.pageTitlePlaceholder')"
              :value="title"
              @input="emit('update:title', ($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>
        <CompilePageEntryButton
          :status="compileStatusText"
          :warning="compileStatusWarning"
          @open="emit('open-compile-page')"
        />
        <textarea
          ref="editorTextarea"
          class="leaf-docs__textarea"
          :value="content"
          spellcheck="false"
          @keydown="handleContentKeydown"
          @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
          @scroll="emit('editor-scroll')"
        ></textarea>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { applyLanghuanMarkdownIndentShortcut } from '../../utils/markdown'
import type { UnitSemanticType } from '../../types'
import type { RelationHintValidationItem } from '../../app/relationSystem'
import {
  formatCompilePageEntryStatus,
  isCompilePageEntryStatusWarning
} from '../../app/compilePageIndicators'
import CompilePageEntryButton from '../recall/CompilePageEntryButton.vue'

type CompilePageModel = {
  summary: string
  tags: string[]
  relationHints: string[]
}

const props = defineProps<{
  pathParts: string[]
  title: string
  content: string
  compilePage: CompilePageModel
  semanticType: UnitSemanticType
  relationValidationItems?: RelationHintValidationItem[]
  saveLabel: string
  canSave: boolean
}>()

const emit = defineEmits<{
  'update:title': [value: string]
  'update:content': [value: string]
  'update:compile-page': [value: CompilePageModel]
  'update:semantic-type': [value: UnitSemanticType]
  'open-compile-page': []
  'wrap-selection': [marker: string]
  'insert-heading': [level: number]
  'insert-link': []
  'insert-table': []
  'insert-code-block': []
  'insert-image': []
  'undo-draft': []
  'redo-draft': []
  save: []
  'editor-scroll': []
}>()

const editorTextarea = ref<HTMLTextAreaElement | null>(null)
const relationErrorCount = computed(() => (props.relationValidationItems || []).filter((item) => item.status === 'warning').length)
const compileStatusText = computed(() => formatCompilePageEntryStatus(props.compilePage, relationErrorCount.value))
const compileStatusWarning = computed(() => isCompilePageEntryStatusWarning(compileStatusText.value))

function getTextareaElement() {
  return editorTextarea.value
}

function focusEditor() {
  editorTextarea.value?.focus?.()
}

function handleContentKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const hasShortcutModifier = event.ctrlKey || event.metaKey
  if (hasShortcutModifier && !event.altKey && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) emit('redo-draft')
    else emit('undo-draft')
    return
  }
  if (hasShortcutModifier && !event.shiftKey && !event.altKey && key === 'y') {
    event.preventDefault()
    emit('redo-draft')
    return
  }
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return
  const textarea = event.target
  if (!(textarea instanceof HTMLTextAreaElement)) return
  event.preventDefault()
  const result = applyLanghuanMarkdownIndentShortcut(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    event.shiftKey
  )
  emit('update:content', result.value)
  nextTick(() => {
    editorTextarea.value?.focus()
    editorTextarea.value?.setSelectionRange(result.selectionStart, result.selectionEnd)
  })
}

defineExpose({
  getTextareaElement,
  focusEditor
})
</script>

<style scoped>
.leaf-docs__editor {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  position: relative;
}

.leaf-docs__editor-path {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 clamp(18px, 3vw, 36px);
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 70%, transparent);
  background: color-mix(in srgb, var(--leaf-bg, #f8f7f1) 88%, #ffffff 12%);
}

.leaf-docs__editor-path-text {
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--morandi-text, #364034) 76%, #6f9276 24%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaf-docs__editor-path-part {
  display: inline;
}

.leaf-docs__editor-path-sep {
  padding: 0 8px;
  color: var(--morandi-text-light, #6c7468);
}

.leaf-docs__toolbar {
  display: flex;
  align-items: center;
  gap: 1px;
  min-height: 40px;
  padding: 0 4px;
  border-bottom: 1px solid var(--leaf-border);
  background: var(--leaf-panel);
  overflow-x: auto;
}

.leaf-docs__toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 22px;
  width: 22px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.78rem;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.leaf-docs__toolbar-btn:hover {
  background: color-mix(in srgb, var(--leaf-accent, #7ea79d) 7%, transparent);
  border-color: transparent;
}

.leaf-docs__toolbar-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.leaf-docs__toolbar-btn--success {
  color: #6f9276;
}

.leaf-docs__toolbar-sep {
  width: 1px;
  height: 20px;
  margin: 0;
  background: var(--leaf-border);
}

.leaf-docs__toolbar-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}

.leaf-docs__icon-svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.8;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.leaf-docs__editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.leaf-docs__editor-pane {
  display: flex;
  min-width: 0;
  min-height: 100%;
  flex: 1;
  flex-direction: column;
  background: transparent;
}

.leaf-docs__editor-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 14px 18px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--leaf-border) 72%, transparent);
}

.leaf-docs__editor-title-field {
  display: grid;
  align-items: center;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 10px;
  color: var(--leaf-text-soft);
  font-size: 0.9rem;
}

.leaf-docs__input {
  width: 100%;
  border: 1px solid var(--leaf-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--leaf-bg) 92%, #ffffff 8%);
  color: var(--leaf-text);
  padding: 10px 12px;
  font-size: 0.94rem;
  outline: none;
}

.leaf-docs__input:focus {
  border-color: var(--leaf-border-strong);
}

.leaf-docs__textarea {
  flex: 1 0 280px;
  min-height: 280px;
  border: none;
  background: transparent;
  color: var(--leaf-text);
  padding: 18px 22px 32px;
  resize: none;
  outline: none;
  font: 0.94rem/1.7 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

@media (max-width: 720px) {
  .leaf-docs__editor-body {
    flex-direction: column;
  }

  .leaf-docs__editor-meta {
    flex-direction: column;
    grid-template-columns: 1fr;
  }
}
</style>
