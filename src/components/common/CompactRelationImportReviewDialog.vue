<template>
  <AppFormDialog
    :open="open"
    :title="$t('unitTree.compactReview.title')"
    :subtitle="summaryText"
    size="xl"
    :body-compact="true"
    :submit-text="$t('unitTree.compactReview.confirmImport')"
    @cancel="$emit('cancel')"
    @submit="submit"
  >
    <div class="compact-relation-review">
      <div class="compact-relation-review__toolbar">
        <button type="button" :class="{ 'is-active': isBulkActive('add') }" @click="setAll('add')">{{ $t('unitTree.compactReview.addAll') }}</button>
        <button type="button" :class="{ 'is-active': isBulkActive('skip') }" @click="setAll('skip')">{{ $t('unitTree.compactReview.skipAll') }}</button>
        <button type="button" :class="{ 'is-active': isDefaultActive }" @click="resetDefault">{{ $t('unitTree.compactReview.addNewSkipDuplicate') }}</button>
      </div>

      <div class="compact-relation-review__summary">
        <span>{{ $t('unitTree.compactReview.addLabel') }} {{ stats.add }}</span>
        <span>{{ $t('unitTree.compactReview.replaceLabel') }} {{ stats.replace }}</span>
        <span>{{ $t('unitTree.compactReview.skipLabel') }} {{ stats.skip }}</span>
        <span>{{ $t('unitTree.compactReview.duplicateLabel') }} {{ stats.same }}</span>
        <span>{{ $t('unitTree.compactReview.conflictLabel') }} {{ stats.conflict }}</span>
      </div>

      <div v-if="plan.warnings.length" class="compact-relation-review__warnings">
        <div v-for="(warning, index) in plan.warnings.slice(0, 4)" :key="index">{{ warning }}</div>
        <div v-if="plan.warnings.length > 4">{{ $t('unitTree.compactReview.moreWarnings', { count: plan.warnings.length - 4 }) }}</div>
      </div>

      <div class="compact-relation-review__list">
        <article v-for="item in plan.items" :key="item.id" class="compact-relation-review__item">
          <div class="compact-relation-review__main">
            <div class="compact-relation-review__unit">{{ item.unitTitle }}</div>
            <div class="compact-relation-review__incoming">{{ item.incomingText }}</div>
            <div v-if="item.currentMatches.length" class="compact-relation-review__current">
              {{ $t('unitTree.compactReview.currentPrefix', { value: item.currentMatches.map(formatRelationHintForReview).join('；') }) }}
            </div>
          </div>
          <div class="compact-relation-review__actions">
            <span :class="['compact-relation-review__badge', `is-${item.status}`]">{{ statusLabel(item.status) }}</span>
            <button type="button" :class="{ 'is-active': getDecision(item.id) === 'add' }" @click="setDecision(item.id, 'add')">{{ $t('unitTree.compactReview.addLabel') }}</button>
            <button
              type="button"
              :disabled="!item.currentMatches.length"
              :class="{ 'is-active': getDecision(item.id) === 'replace' }"
              @click="setDecision(item.id, 'replace')"
            >{{ $t('unitTree.compactReview.replaceLabel') }}</button>
            <button type="button" :class="{ 'is-active': getDecision(item.id) === 'skip' }" @click="setDecision(item.id, 'skip')">{{ $t('unitTree.compactReview.skipLabel') }}</button>
          </div>
        </article>
      </div>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  countCompactRelationImportPlan,
  createDefaultCompactRelationImportDecisions,
  formatRelationHintForReview,
  type CompactRelationImportAction,
  type CompactRelationImportDecisionMap,
  type CompactRelationImportPlan,
  type CompactRelationImportStatus
} from '../../app/compactRelationImportReview'
import AppFormDialog from './AppFormDialog.vue'

const props = defineProps<{
  open: boolean
  plan: CompactRelationImportPlan
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'apply', decisions: CompactRelationImportDecisionMap): void
}>()

const { t } = useI18n()
const decisions = ref<CompactRelationImportDecisionMap>({})
const stats = computed(() => countCompactRelationImportPlan(props.plan, decisions.value))
const summaryText = computed(() => t('unitTree.compactReview.summaryText', { items: props.plan.items.length, skipped: props.plan.skipped }))
const isDefaultActive = computed(() => {
  const defaults = createDefaultCompactRelationImportDecisions(props.plan)
  return props.plan.items.every((item) => getDecision(item.id) === defaults[item.id])
})

watch(() => props.open, (open) => {
  if (!open) return
  resetDefault()
}, { immediate: true })

watch(() => props.plan, () => {
  if (!props.open) return
  resetDefault()
}, { deep: true })

function getDecision(itemId: string) {
  return decisions.value[itemId] || 'skip'
}

function setDecision(itemId: string, action: CompactRelationImportAction) {
  decisions.value = { ...decisions.value, [itemId]: action }
}

function setAll(action: CompactRelationImportAction) {
  const next: CompactRelationImportDecisionMap = {}
  props.plan.items.forEach((item) => {
    next[item.id] = action
  })
  decisions.value = next
}

function resetDefault() {
  decisions.value = createDefaultCompactRelationImportDecisions(props.plan)
}

function isBulkActive(action: CompactRelationImportAction) {
  return props.plan.items.length > 0 && props.plan.items.every((item) => getDecision(item.id) === action)
}

function statusLabel(status: CompactRelationImportStatus) {
  if (status === 'new') return t('unitTree.compactReview.statusNew')
  if (status === 'same') return t('unitTree.compactReview.statusSame')
  return t('unitTree.compactReview.statusSameEndpoint')
}

function submit() {
  emit('apply', decisions.value)
}
</script>

<style scoped>
.compact-relation-review {
  display: grid;
  gap: 10px;
  color: var(--morandi-text, #4f463f);
}

.compact-relation-review__toolbar,
.compact-relation-review__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.compact-relation-review__toolbar button,
.compact-relation-review__actions button {
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  color: var(--morandi-text-light);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 0.78rem;
  cursor: pointer;
}

.compact-relation-review__toolbar button:hover,
.compact-relation-review__actions button:hover:not(:disabled) {
  border-color: rgba(126, 167, 157, 0.72);
  background: color-mix(in srgb, rgba(126, 167, 157, 1) 12%, var(--morandi-card));
  color: #4f776d;
}

.compact-relation-review__toolbar button.is-active,
.compact-relation-review__actions button.is-active {
  border-color: rgba(126, 167, 157, 0.88);
  background: rgba(126, 167, 157, 0.18);
  color: #3f695f;
}

.compact-relation-review__actions button:disabled {
  cursor: default;
  opacity: 0.42;
}

.compact-relation-review__summary {
  color: var(--morandi-text-light);
  font-size: 0.82rem;
}

.compact-relation-review__summary span {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-text) 8%, transparent);
}

.compact-relation-review__warnings {
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(181, 145, 114, 0.24);
  background: rgba(181, 145, 114, 0.08);
  color: #8a674b;
  font-size: 0.78rem;
}

.compact-relation-review__list {
  display: grid;
  max-height: 52vh;
  overflow: auto;
  border: 1px solid var(--morandi-border);
}

.compact-relation-review__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
}

.compact-relation-review__item:last-child {
  border-bottom: none;
}

.compact-relation-review__main {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.compact-relation-review__unit {
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.compact-relation-review__incoming {
  overflow: hidden;
  color: var(--morandi-text);
  font-size: 0.86rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-relation-review__current {
  overflow: hidden;
  color: var(--morandi-text-light);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-relation-review__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.compact-relation-review__badge {
  min-width: 48px;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 0.74rem;
  text-align: center;
}

.compact-relation-review__badge.is-new {
  background: rgba(126, 167, 157, 0.16);
  color: #4f776d;
}

.compact-relation-review__badge.is-same {
  background: rgba(142, 132, 111, 0.1);
  color: #756c62;
}

.compact-relation-review__badge.is-conflict {
  background: rgba(181, 145, 114, 0.15);
  color: #8a674b;
}

@media (max-width: 720px) {
  .compact-relation-review__item {
    grid-template-columns: 1fr;
  }

  .compact-relation-review__actions {
    justify-content: flex-end;
  }
}
</style>
