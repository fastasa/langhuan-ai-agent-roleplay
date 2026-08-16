<template>
  <AppFormDialog
    :open="open"
    :title="$t('unitTree.compileImport.title')"
    :subtitle="summaryText"
    size="xl"
    :body-compact="true"
    :submit-text="$t('unitTree.compileImport.confirmImport')"
    @cancel="$emit('cancel')"
    @submit="submit"
  >
    <div class="compile-import">
      <div class="compile-import__toolbar">
        <button type="button" :class="{ 'is-active': isAllActionActive('skip') }" :aria-pressed="isAllActionActive('skip')" @click="setAll('skip')">{{ $t('unitTree.compileImport.skipAllExisting') }}</button>
        <button type="button" :class="{ 'is-active': isAllActionActive('overwrite') }" :aria-pressed="isAllActionActive('overwrite')" @click="setAll('overwrite')">{{ $t('unitTree.compileImport.overwriteAllExisting') }}</button>
        <button type="button" :class="{ 'is-active': isFillEmptyOnlyActive() }" :aria-pressed="isFillEmptyOnlyActive()" @click="fillEmptyOnly">{{ $t('unitTree.compileImport.fillEmptyOnly') }}</button>
      </div>

      <div class="compile-import__field-tools" :aria-label="$t('unitTree.compileImport.fieldBatchAria')">
        <span class="compile-import__field-tools-label">{{ $t('unitTree.compileImport.applyByField') }}</span>
        <div class="compile-import__field-action-grid">
          <div v-for="field in fieldKeys" :key="field" class="compile-import__field-action">
            <span>{{ fieldLabelText(field) }}</span>
            <button type="button" :class="{ 'is-active': isFieldActionActive(field, 'overwrite') }" :aria-pressed="isFieldActionActive(field, 'overwrite')" @click="setField(field, 'overwrite')">{{ $t('unitTree.compileImport.overwrite') }}</button>
            <button type="button" :class="{ 'is-active': isFieldActionActive(field, 'skip') }" :aria-pressed="isFieldActionActive(field, 'skip')" @click="setField(field, 'skip')">{{ $t('unitTree.compileImport.skip') }}</button>
          </div>
        </div>
      </div>

      <div class="compile-import__summary">
        <span>{{ $t('unitTree.compileImport.willOverwrite', { count: stats.overwrite }) }}</span>
        <span>{{ $t('unitTree.compileImport.willSkip', { count: stats.skipped }) }}</span>
        <span>{{ $t('unitTree.compileImport.conflictCount', { count: stats.conflict }) }}</span>
      </div>

      <div class="compile-import__table">
        <div class="compile-import__head">
          <span>{{ $t('unitTree.compileImport.unit') }}</span>
          <span v-for="field in fieldKeys" :key="field">{{ fieldLabelText(field) }}</span>
          <span>{{ $t('unitTree.compileImport.thisUnit') }}</span>
        </div>
        <div v-for="unit in plan.units" :key="unit.unitId" class="compile-import__unit">
          <button type="button" class="compile-import__row" @click="toggleExpanded(unit.unitId)">
            <span class="compile-import__unit-name">
              <strong>{{ unit.title }}</strong>
              <small v-if="unit.path">{{ unit.path }}</small>
            </span>
            <span v-for="field in unit.fields" :key="field.key" :class="['compile-import__badge', badgeClass(unit.unitId, field)]">
              {{ fieldBadge(unit.unitId, field) }}
            </span>
            <span class="compile-import__unit-actions" @click.stop>
              <button type="button" :class="{ 'is-active': isUnitActionActive(unit.unitId, 'overwrite') }" :aria-pressed="isUnitActionActive(unit.unitId, 'overwrite')" @click="setUnit(unit.unitId, 'overwrite')">{{ $t('unitTree.compileImport.overwriteAll') }}</button>
              <button type="button" :class="{ 'is-active': isUnitActionActive(unit.unitId, 'skip') }" :aria-pressed="isUnitActionActive(unit.unitId, 'skip')" @click="setUnit(unit.unitId, 'skip')">{{ $t('unitTree.compileImport.skipAll') }}</button>
            </span>
          </button>

          <div v-if="expandedUnitIds.has(unit.unitId)" class="compile-import__details">
            <div
              v-for="field in unit.fields.filter((item) => item.hasConflict || item.hasIncoming)"
              :key="field.key"
              class="compile-import__detail"
            >
              <div class="compile-import__detail-title">
                <strong>{{ fieldLabelText(field.key) }}</strong>
                <span>{{ field.hasConflict ? $t('unitTree.compileImport.contentDiffers') : field.isSame ? $t('unitTree.compileImport.contentSame') : $t('unitTree.compileImport.currentEmpty') }}</span>
              </div>
              <div class="compile-import__compare">
                <div>
                  <b>{{ $t('unitTree.compileImport.current') }}</b>
                  <p>{{ field.currentText || $t('unitTree.compileImport.empty') }}</p>
                </div>
                <div>
                  <b>{{ $t('unitTree.compileImport.incoming') }}</b>
                  <p>{{ field.incomingText || $t('unitTree.compileImport.empty') }}</p>
                </div>
              </div>
              <div class="compile-import__choice">
                <button type="button" :class="{ 'is-active': getDecision(unit.unitId, field.key) === 'skip' }" :aria-pressed="getDecision(unit.unitId, field.key) === 'skip'" @click="setDecision(unit.unitId, field.key, 'skip')">{{ $t('unitTree.compileImport.skip') }}</button>
                <button type="button" :class="{ 'is-active': getDecision(unit.unitId, field.key) === 'overwrite' }" :aria-pressed="getDecision(unit.unitId, field.key) === 'overwrite'" @click="setDecision(unit.unitId, field.key, 'overwrite')">{{ $t('unitTree.compileImport.overwrite') }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  countCompilePageImportPlan,
  createDefaultCompilePageImportDecisions,
  type CompilePageImportDecision,
  type CompilePageImportDecisionMap,
  type CompilePageImportFieldKey,
  type CompilePageImportFieldPlan,
  type CompilePageImportPlan
} from '../../app/compilePageImportConflict'
import AppFormDialog from './AppFormDialog.vue'

const props = defineProps<{
  open: boolean
  plan: CompilePageImportPlan
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'apply', decisions: CompilePageImportDecisionMap): void
}>()

const { t } = useI18n()
const fieldKeys: CompilePageImportFieldKey[] = ['summary', 'tags', 'semanticType', 'relationHints']
const decisions = ref<CompilePageImportDecisionMap>({})
const expandedUnitIds = ref<Set<string>>(new Set())

// 字段名走 i18n（key 与 CompilePageImportFieldKey 对齐），取代原 COMPILE_PAGE_IMPORT_FIELD_LABELS 中文表
function fieldLabelText(field: CompilePageImportFieldKey) {
  return t(`unitTree.compileImport.field.${field}`)
}

const stats = computed(() => countCompilePageImportPlan(props.plan, decisions.value))
const summaryText = computed(() => t('unitTree.compileImport.summaryText', { units: props.plan.units.length, conflict: stats.value.conflict }))

watch(() => props.open, (open) => {
  if (!open) return
  decisions.value = createDefaultCompilePageImportDecisions(props.plan)
  expandedUnitIds.value = new Set(props.plan.units.slice(0, 2).map((unit) => unit.unitId))
}, { immediate: true })

watch(() => props.plan, () => {
  if (!props.open) return
  decisions.value = createDefaultCompilePageImportDecisions(props.plan)
}, { deep: true })

function getDecision(unitId: string, field: CompilePageImportFieldKey) {
  return decisions.value[unitId]?.[field] || 'skip'
}

function isActionableField(field: CompilePageImportFieldPlan) {
  return field.hasIncoming && !field.isSame
}

function isAllActionActive(decision: CompilePageImportDecision) {
  let hasActionable = false
  return props.plan.units.every((unit) => {
    return unit.fields.every((field) => {
      if (!isActionableField(field)) return true
      hasActionable = true
      return getDecision(unit.unitId, field.key) === decision
    })
  }) && hasActionable
}

function isFillEmptyOnlyActive() {
  const defaults = createDefaultCompilePageImportDecisions(props.plan)
  return props.plan.units.every((unit) => {
    return unit.fields.every((field) => getDecision(unit.unitId, field.key) === defaults[unit.unitId]?.[field.key])
  })
}

function isFieldActionActive(fieldKey: CompilePageImportFieldKey, decision: CompilePageImportDecision) {
  let hasActionable = false
  return props.plan.units.every((unit) => {
    const field = unit.fields.find((item) => item.key === fieldKey)
    if (!field || !isActionableField(field)) return true
    hasActionable = true
    return getDecision(unit.unitId, fieldKey) === decision
  }) && hasActionable
}

function isUnitActionActive(unitId: string, decision: CompilePageImportDecision) {
  const unit = props.plan.units.find((item) => item.unitId === unitId)
  if (!unit) return false
  let hasActionable = false
  return unit.fields.every((field) => {
    if (!isActionableField(field)) return true
    hasActionable = true
    return getDecision(unitId, field.key) === decision
  }) && hasActionable
}

function setDecision(unitId: string, field: CompilePageImportFieldKey, decision: CompilePageImportDecision) {
  decisions.value = {
    ...decisions.value,
    [unitId]: {
      ...(decisions.value[unitId] || {}),
      [field]: decision
    }
  }
}

function setAll(decision: CompilePageImportDecision) {
  const next = createDefaultCompilePageImportDecisions(props.plan)
  props.plan.units.forEach((unit) => {
    unit.fields.forEach((field) => {
      if (field.hasIncoming && !field.isSame) next[unit.unitId][field.key] = decision
    })
  })
  decisions.value = next
}

function fillEmptyOnly() {
  decisions.value = createDefaultCompilePageImportDecisions(props.plan)
}

function setField(fieldKey: CompilePageImportFieldKey, decision: CompilePageImportDecision) {
  const next = { ...decisions.value }
  props.plan.units.forEach((unit) => {
    const field = unit.fields.find((item) => item.key === fieldKey)
    if (!field?.hasIncoming || field.isSame) return
    next[unit.unitId] = { ...(next[unit.unitId] || {}), [fieldKey]: decision }
  })
  decisions.value = next
}

function setUnit(unitId: string, decision: CompilePageImportDecision) {
  const unit = props.plan.units.find((item) => item.unitId === unitId)
  if (!unit) return
  const next = { ...(decisions.value[unitId] || {}) } as Record<CompilePageImportFieldKey, CompilePageImportDecision>
  unit.fields.forEach((field) => {
    if (field.hasIncoming && !field.isSame) next[field.key] = decision
  })
  decisions.value = { ...decisions.value, [unitId]: next }
}

function toggleExpanded(unitId: string) {
  const next = new Set(expandedUnitIds.value)
  if (next.has(unitId)) next.delete(unitId)
  else next.add(unitId)
  expandedUnitIds.value = next
}

function badgeClass(unitId: string, field: CompilePageImportFieldPlan) {
  if (field.isSame && field.hasIncoming) return 'compile-import__badge--same'
  if (!field.hasIncoming) return 'compile-import__badge--empty'
  return getDecision(unitId, field.key) === 'overwrite'
    ? 'compile-import__badge--overwrite'
    : 'compile-import__badge--skip'
}

function fieldBadge(unitId: string, field: CompilePageImportFieldPlan) {
  if (!field.hasIncoming) return t('unitTree.compileImport.noIncoming')
  if (field.isSame) return t('unitTree.compileImport.same')
  if (!field.hasCurrent) return t('unitTree.compileImport.added')
  return getDecision(unitId, field.key) === 'overwrite'
    ? t('unitTree.compileImport.overwrite')
    : t('unitTree.compileImport.skip')
}

function submit() {
  emit('apply', decisions.value)
}
</script>

<style scoped>
.compile-import {
  display: grid;
  gap: 10px;
  color: var(--morandi-text, #4f463f);
}

.compile-import__toolbar,
.compile-import__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.compile-import__toolbar button,
.compile-import__field-tools button,
.compile-import__unit-actions button,
.compile-import__choice button {
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  color: var(--morandi-text-light);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 0.78rem;
  cursor: pointer;
}

.compile-import__toolbar button:hover,
.compile-import__field-tools button:hover,
.compile-import__unit-actions button:hover,
.compile-import__choice button:hover {
  border-color: rgba(126, 167, 157, 0.72);
  background: color-mix(in srgb, rgba(126, 167, 157, 1) 12%, var(--morandi-card));
  color: #4f776d;
}

.compile-import__toolbar button.is-active,
.compile-import__field-tools button.is-active,
.compile-import__unit-actions button.is-active,
.compile-import__choice button.is-active {
  border-color: rgba(126, 167, 157, 0.88);
  background: rgba(126, 167, 157, 0.18);
  color: #3f695f;
  box-shadow: inset 0 0 0 1px rgba(126, 167, 157, 0.24);
}

.compile-import__field-tools {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px 10px;
  padding: 6px 0;
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.compile-import__field-tools-label {
  padding-top: 8px;
  white-space: nowrap;
}

.compile-import__field-action-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(78px, 1fr));
  gap: 8px;
  max-width: 520px;
}

.compile-import__field-action {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  align-items: center;
  padding: 6px;
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
}

.compile-import__field-action span {
  grid-column: 1 / -1;
  color: var(--morandi-text-light);
  font-size: 0.74rem;
  line-height: 1.2;
}

.compile-import__field-action button {
  width: 100%;
  min-width: 0;
  padding-inline: 6px;
}

.compile-import__summary {
  color: var(--morandi-text-light);
  font-size: 0.82rem;
}

.compile-import__summary span {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-text) 8%, transparent);
}

.compile-import__table {
  max-height: 52vh;
  overflow: auto;
  border: 1px solid var(--morandi-border);
}

.compile-import__head,
.compile-import__row {
  display: grid;
  grid-template-columns: minmax(150px, 1.5fr) repeat(4, minmax(70px, 0.55fr)) minmax(132px, 0.8fr);
  align-items: center;
  gap: 8px;
}

.compile-import__head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  background: var(--morandi-card);
  border-bottom: 1px solid var(--morandi-border);
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.compile-import__unit {
  border-bottom: 1px solid var(--morandi-border);
}

.compile-import__unit:last-child {
  border-bottom: none;
}

.compile-import__row {
  width: 100%;
  border: none;
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
}

.compile-import__row:hover {
  background: color-mix(in srgb, var(--morandi-text) 6%, transparent);
}

.compile-import__unit-name {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.compile-import__unit-name strong,
.compile-import__unit-name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compile-import__unit-name small {
  color: var(--morandi-text-light);
  font-size: 0.72rem;
}

.compile-import__badge {
  justify-self: start;
  min-width: 46px;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 0.74rem;
  text-align: center;
}

.compile-import__badge--overwrite {
  background: rgba(126, 167, 157, 0.16);
  color: #4f776d;
}

.compile-import__badge--skip {
  background: rgba(181, 145, 114, 0.15);
  color: #8a674b;
}

.compile-import__badge--same {
  background: rgba(142, 132, 111, 0.1);
  color: #756c62;
}

.compile-import__badge--empty {
  color: var(--morandi-text-light);
}

.compile-import__unit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.compile-import__details {
  display: grid;
  gap: 8px;
  padding: 0 10px 10px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
}

.compile-import__detail {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
}

.compile-import__detail-title,
.compile-import__choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.compile-import__detail-title span {
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.compile-import__compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.compile-import__compare div {
  min-width: 0;
}

.compile-import__compare b {
  display: block;
  margin-bottom: 2px;
  color: var(--morandi-text-light);
  font-size: 0.73rem;
}

.compile-import__compare p {
  max-height: 72px;
  overflow: auto;
  margin: 0;
  padding: 6px;
  background: color-mix(in srgb, var(--morandi-text) 6%, transparent);
  color: var(--morandi-text);
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
}

.compile-import__choice {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .compile-import__field-tools {
    grid-template-columns: 1fr;
  }

  .compile-import__field-tools-label {
    padding-top: 0;
  }

  .compile-import__field-action-grid {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
    max-width: none;
  }
}
</style>
