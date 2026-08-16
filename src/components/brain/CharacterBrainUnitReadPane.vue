<template>
  <AppWorkspaceReadPane
    :path-parts="resolvedPathParts"
    :title="port.title"
    :meta="metaText"
    :html="bodyHtml"
    :text="bodyText"
    :empty-text="emptyText"
  >
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
    <template #before-content>
      <CompilePageEntryButton
        v-if="compilePage"
        compact
        :status="compileStatusText"
        :warning="compileStatusWarning"
        @open="emit('open-compile-page')"
      />
    </template>
    <section v-if="pendingVersion" class="brain-unit-read-pending" :aria-label="$t('brain.pending.pendingVersion')">
      <div class="brain-unit-read-pending__header">
        <div>
          <strong>{{ pendingVersion.mode === 'update' ? $t('brain.pending.updateTitle') : $t('brain.pending.createTitle') }}</strong>
          <span>{{ pendingVersion.createdBy || 'brain_agent' }} · {{ pendingVersion.createdAt || $t('brain.pending.justGenerated') }}</span>
        </div>
        <div class="brain-unit-read-pending__actions">
          <button type="button" @click="emit('edit-pending')">{{ $t('common.edit') }}</button>
          <button type="button" @click="emit('reject-pending')">{{ $t('brain.pending.reject') }}</button>
          <button type="button" class="brain-unit-read-pending__apply" @click="emit('confirm-pending')">{{ $t('common.apply') }}</button>
        </div>
      </div>
      <p v-if="pendingVersion.reason" class="brain-unit-read-pending__reason">{{ pendingVersion.reason }}</p>
      <div class="brain-unit-read-pending__versions" :class="{ 'brain-unit-read-pending__versions--single': !pendingVersion.confirmed }">
        <article v-if="pendingVersion.confirmed" class="brain-unit-read-pending__version">
          <span>{{ $t('brain.pending.confirmedVersion') }}</span>
          <div v-html="renderVersion(pendingVersion.confirmed)"></div>
        </article>
        <article class="brain-unit-read-pending__version brain-unit-read-pending__version--pending">
          <span>{{ $t('brain.pending.pendingVersion') }}</span>
          <div v-html="renderVersion(pendingVersion.pending)"></div>
        </article>
      </div>
    </section>
  </AppWorkspaceReadPane>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnitContentPort } from '../../types'
import type { UnitContentEffectiveVersion } from '../../types/unitContentPort'
import AppWorkspaceReadPane from '../common/AppWorkspaceReadPane.vue'
import CompilePageEntryButton from '../recall/CompilePageEntryButton.vue'
import type { RelationHintValidationItem } from '../../app/relationSystem'
import {
  formatCompilePageEntryStatus,
  isCompilePageEntryStatusWarning
} from '../../app/compilePageIndicators'
import { renderMarkdownToHtml } from '../../utils/markdown'

const props = defineProps<{
  port: UnitContentPort
  pathParts?: string[]
  relationValidationItems?: RelationHintValidationItem[]
}>()
const emit = defineEmits<{
  'open-compile-page': []
  'confirm-pending': []
  'reject-pending': []
  'edit-pending': []
}>()

const { t } = useI18n()

const compilePage = computed(() => props.port.effectiveVersion.compilePage || null)
const pendingVersion = computed(() => props.port.pendingVersion || null)
const relationErrorCount = computed(() => (props.relationValidationItems || []).filter((item) => item.status === 'warning').length)
const compileStatusText = computed(() => formatCompilePageEntryStatus(compilePage.value, relationErrorCount.value))
const compileStatusWarning = computed(() => isCompilePageEntryStatusWarning(compileStatusText.value))
const bodyText = computed(() => {
  const port = props.port
  if (port.domain === 'characterCore' && port.contentKind !== 'group' && !port.recallableInChat && !port.hasCompilePage) return ''
  return String(port.effectiveVersion.body || port.body || port.formText || '').trim()
})
const bodyHtml = computed(() => bodyText.value ? renderMarkdownToHtml(bodyText.value) : '')
const resolvedPathParts = computed(() => {
  if (props.pathParts?.length) {
    return props.pathParts.map((item) => String(item || '').trim()).filter(Boolean)
  }
  const path = String(props.port.sourcePath || '').trim()
  if (path) return path.split('/').map((item) => item.trim()).filter(Boolean)
  return [domainLabel.value, props.port.title].filter(Boolean)
})
const metaText = computed(() => {
  const meta = [domainLabel.value]
  if (props.port.recallableInChat) meta.push(t('brain.meta.recallable'))
  if (props.port.writableByAI) meta.push(t('brain.meta.writableDraft'))
  return meta.join(' / ')
})
const emptyText = computed(() => {
  if (props.port.contentKind === 'group') return t('brain.read.groupEmpty')
  if (props.port.domain === 'characterCore' && !props.port.recallableInChat) return t('brain.read.systemConfigNotRecall')
  return t('brain.read.bodyEmpty')
})
const domainLabel = computed(() => {
  switch (props.port.domain) {
    case 'docLibrary':
      return t('brain.domainLabel.docLibrary')
    case 'characterCore':
      return t('brain.domainLabel.core')
    case 'characterSoul':
      return t('brain.domainLabel.soul')
    case 'characterTrace':
      return t('brain.domainLabel.trace')
    case 'characterArrangement':
      return t('brain.domainLabel.arrangement')
    default:
      return t('brain.domainLabel.unit')
  }
})

function renderVersion(version: UnitContentEffectiveVersion) {
  return renderMarkdownToHtml([
    version.title ? `# ${version.title}` : '',
    version.summary ? `## ${t('brain.field.summary')}\n${version.summary}` : '',
    version.body ? `## ${t('brain.field.body')}\n${version.body}` : ''
  ].filter(Boolean).join('\n\n'))
}
</script>

<style scoped>
.brain-unit-read-pending {
  margin-top: 22px;
  border-top: 1px solid color-mix(in srgb, #9b6ce8 30%, transparent);
  padding-top: 16px;
}

.brain-unit-read-pending__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.brain-unit-read-pending__header > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.brain-unit-read-pending__header strong {
  color: color-mix(in srgb, var(--morandi-text, #364034) 82%, #9b6ce8 18%);
  font-size: 14px;
}

.brain-unit-read-pending__header span,
.brain-unit-read-pending__reason {
  color: var(--morandi-text-light, #6c7468);
  font-size: 12px;
}

.brain-unit-read-pending__actions {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
}

.brain-unit-read-pending__actions button {
  min-width: 48px;
  height: 26px;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 78%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--morandi-surface, #f8f7f1) 88%, #ffffff 12%);
  color: var(--morandi-text, #364034);
  font-size: 12px;
  cursor: pointer;
}

.brain-unit-read-pending__actions button:hover {
  border-color: color-mix(in srgb, #9b6ce8 38%, var(--morandi-border, #cfd7c8));
}

.brain-unit-read-pending__apply {
  background: color-mix(in srgb, #9b6ce8 16%, #ffffff) !important;
  color: color-mix(in srgb, var(--morandi-text, #364034) 78%, #6d45c8 22%) !important;
}

.brain-unit-read-pending__versions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.brain-unit-read-pending__versions--single {
  grid-template-columns: minmax(0, 1fr);
}

.brain-unit-read-pending__version {
  min-width: 0;
  max-height: 34vh;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 62%, transparent);
  border-radius: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--morandi-surface, #f8f7f1) 84%, #ffffff 16%);
  font-size: 13px;
  line-height: 1.7;
}

.brain-unit-read-pending__version--pending {
  border-color: color-mix(in srgb, #9b6ce8 34%, var(--morandi-border, #cfd7c8));
}

.brain-unit-read-pending__version > span {
  display: block;
  margin-bottom: 6px;
  color: var(--morandi-text-light, #6c7468);
  font-size: 12px;
}

.brain-unit-read-pending__version :deep(h1),
.brain-unit-read-pending__version :deep(h2),
.brain-unit-read-pending__version :deep(h3) {
  margin: 10px 0 6px;
  font-size: 0.95rem;
}

.brain-unit-read-pending__version :deep(p) {
  margin: 0 0 8px;
}

@media (max-width: 720px) {
  .brain-unit-read-pending__header {
    flex-direction: column;
  }

  .brain-unit-read-pending__versions {
    grid-template-columns: 1fr;
  }
}
</style>
