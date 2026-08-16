<template>
  <div class="mobile-md-editor">
    <div class="mobile-md-editor__bar">
      <div class="mobile-md-editor__seg" role="group" :aria-label="$t('mobile.mdEditor.tabAria')">
        <button type="button" :class="{ active: !preview }" :disabled="!canEdit" @click="preview = false">{{ $t('common.edit') }}</button>
        <button type="button" :class="{ active: preview }" @click="preview = true">{{ $t('common.preview') }}</button>
      </div>
      <button
        v-if="canEdit"
        type="button"
        class="mobile-md-editor__save"
        :disabled="!dirty || saving"
        @click="$emit('save', draft)"
      >
        {{ saving ? $t('common.saving') : $t('common.save') }}
      </button>
    </div>

    <div v-if="!canEdit" class="mobile-md-editor__readonly">
      {{ $t('mobile.mdEditor.readonly') }}
    </div>

    <textarea
      v-if="canEdit && !preview"
      ref="textareaRef"
      v-model="draft"
      class="mobile-md-editor__textarea lhm-scroll"
      :placeholder="$t('mobile.mdEditor.placeholder')"
      spellcheck="false"
    ></textarea>
    <div
      v-else
      class="mobile-md-editor__preview lhm-scroll"
      v-html="renderedHtml"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { renderMarkdownToHtml } from '../../utils/markdown'

const props = withDefaults(
  defineProps<{
    modelValue: string
    canEdit?: boolean
    saving?: boolean
  }>(),
  {
    canEdit: true,
    saving: false
  }
)

defineEmits<{
  save: [content: string]
}>()

const draft = ref(props.modelValue || '')
const preview = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 源正文变化（切换单位 / 保存后回读）时同步草稿
watch(
  () => props.modelValue,
  (value) => {
    draft.value = value || ''
  }
)

watch(
  () => props.canEdit,
  (value) => {
    if (!value) preview.value = true
  },
  { immediate: true }
)

const dirty = computed(() => draft.value !== (props.modelValue || ''))
const renderedHtml = computed(() => renderMarkdownToHtml(draft.value || ''))
</script>

<style scoped>
.mobile-md-editor {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.mobile-md-editor__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.mobile-md-editor__seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 8px;
}

.mobile-md-editor__seg button {
  min-width: 56px;
  min-height: 32px;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-md-editor__seg button.active {
  background: rgba(92, 138, 92, 0.14);
  color: var(--lhm-accent, #5c8a5c);
  font-weight: 600;
}

.mobile-md-editor__seg button:disabled {
  opacity: 0.4;
  cursor: default;
}

.mobile-md-editor__save {
  border: 1px solid var(--lhm-accent, #5c8a5c);
  border-radius: 8px;
  background: var(--lhm-accent, #5c8a5c);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 16px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-md-editor__save:disabled {
  opacity: 0.45;
  cursor: default;
}

.mobile-md-editor__readonly {
  color: var(--lhm-text-muted, #999);
  font-size: 12.5px;
  line-height: 1.6;
}

.mobile-md-editor__textarea {
  min-height: 240px;
  flex: 1;
  resize: none;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 12px;
  background: var(--lhm-soft, #faf7f1);
  color: var(--lhm-text, #333);
  font-family: var(--lhm-font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: 13.5px;
  line-height: 1.85;
  padding: 14px;
  outline: none;
}

.mobile-md-editor__textarea:focus {
  border-color: color-mix(in srgb, var(--lhm-accent, #5c8a5c) 42%, var(--lhm-border-line, #e5e5e5));
}

.mobile-md-editor__preview {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  color: var(--lhm-text, #333);
}

.mobile-md-editor__preview :deep(h1),
.mobile-md-editor__preview :deep(h2),
.mobile-md-editor__preview :deep(h3) {
  margin: 18px 0 9px;
  font-size: 16px;
  font-weight: 600;
}

.mobile-md-editor__preview :deep(h1:first-child),
.mobile-md-editor__preview :deep(h2:first-child),
.mobile-md-editor__preview :deep(h3:first-child) {
  margin-top: 0;
}

.mobile-md-editor__preview :deep(p) {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.78;
}

.mobile-md-editor__preview :deep(ul),
.mobile-md-editor__preview :deep(ol) {
  margin: 0 0 14px;
  padding-left: 20px;
  font-size: 15px;
  line-height: 1.7;
}

.mobile-md-editor__preview :deep(code) {
  border-radius: 4px;
  background: rgba(139, 115, 85, 0.08);
  font-family: var(--lhm-font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: 0.9em;
  padding: 1px 4px;
}
</style>
