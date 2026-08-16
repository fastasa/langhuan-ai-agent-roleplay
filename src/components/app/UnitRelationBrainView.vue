<template>
  <section class="unit-relation-brain-view">
    <div class="unit-relation-brain-view__canvas">
      <CharacterBrainWorkspace
        ref="workspaceRef"
        :character-id="activeSource.characterId"
        :embedded="true"
        :read-only="true"
        :allow-layout-mode-switch="false"
        :initial-focus-node-id="canvasFocusNodeId"
        :projection-units="canvasProjectionUnits"
        :projection-relation-node-ids="canvasProjectionRelationNodeIds"
        :projection-relation-edges="projectionRelationEdges"
        :projection-exact-relation-mode="hasActiveFilters"
        :projection-character="activeSource.projectionCharacter || null"
        :projection-layout="activeSource.projectionLayout || 'default'"
        :projection-expanded-node-ids="projectionExpandedNodeIds"
        :projection-forest-root-node-ids="projectionForestRootNodeIds"
        @projection-open="handleProjectionOpen"
      />
    </div>
    <footer class="unit-relation-brain-view__filters" :aria-label="$t('unitTree.relationView.filterAria')">
      <div class="unit-relation-brain-view__filter-row unit-relation-brain-view__filter-row--main">
        <label class="unit-relation-brain-view__field">
          <span>{{ $t('unitTree.relationView.relation') }}</span>
          <select v-model="activePredicateFamily" class="unit-relation-brain-view__select">
            <option value="">{{ $t('unitTree.relationView.all') }}</option>
            <option v-for="family in predicateFamilies" :key="family" :value="family">{{ getPredicateFamilyLabel(family) }}</option>
          </select>
        </label>
        <label class="unit-relation-brain-view__field">
          <span>{{ $t('unitTree.relationView.object') }}</span>
          <select v-model="activeSemanticType" class="unit-relation-brain-view__select">
            <option value="">{{ $t('unitTree.relationView.all') }}</option>
            <option v-for="option in semanticTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <span class="unit-relation-brain-view__count">
          <strong>{{ activeSource.visibleRelations.length }}</strong>
          <span>/ {{ activeSource.relations.length }}</span>
        </span>
        <button
          type="button"
          class="unit-relation-brain-view__detail"
          :class="{ active: isAdvancedFilterOpen || hasAdvancedFilters }"
          :aria-expanded="isAdvancedFilterOpen"
          @click="isAdvancedFilterOpen = !isAdvancedFilterOpen"
        >{{ $t('unitTree.relationView.advancedFilter') }}</button>
        <button
          v-if="hasActiveFilters"
          type="button"
          class="unit-relation-brain-view__reset"
          @click="resetFilters"
        >{{ $t('unitTree.relationView.clearFilter') }}</button>
      </div>
      <div v-if="isAdvancedFilterOpen" class="unit-relation-brain-view__filter-row unit-relation-brain-view__filter-row--advanced">
        <label class="unit-relation-brain-view__field">
          <span>{{ $t('unitTree.relationView.status') }}</span>
          <select v-model="activeStatusFilter" class="unit-relation-brain-view__select">
            <option v-for="option in statusSelectOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="unit-relation-brain-view__field">
          <span>{{ $t('unitTree.relationView.predicate') }}</span>
          <select v-model="activePredicateId" class="unit-relation-brain-view__select">
            <option value="">{{ $t('unitTree.relationView.all') }}</option>
            <option v-for="predicate in predicateOptions" :key="predicate.predicateId" :value="predicate.predicateId">
              {{ predicate.label }}
            </option>
          </select>
        </label>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PredicateFamily, RelationViewStatus, UnitView } from '../../types/unitView'
import type { UnitSemanticType } from '../../types/docBrain'
import type { UnitRelationSourceAdapter } from '../../app/unitRelationSourceAdapter'
import {
  createUnitRelationSourceAdapter,
  mapUnitRelationSourceNodeIdToUnitId,
  resolveUnitRelationSourceFocusNodeId
} from '../../app/unitRelationSourceAdapter'
import { resolveUnitRelationProjectionNodeId } from '../../app/characterBrainWorkspaceProjection'
import { UNIT_SEMANTIC_TYPE_OPTIONS } from '../../app/unitSemanticTypes'

const CharacterBrainWorkspace = defineAsyncComponent(() => import('../brain/CharacterBrainWorkspace.vue'))

const props = defineProps<{
  source: UnitRelationSourceAdapter
}>()

const emit = defineEmits<{
  (e: 'open-unit', unitId: string): void
  (e: 'ready'): void
}>()

const { t } = useI18n()

const fallbackSource: UnitRelationSourceAdapter = {
  characterId: '',
  title: '',
  units: [],
  activeUnit: null,
  projectionCharacter: null,
  projectionLayout: 'default',
  projectionExpandedUnitIds: [],
  projectionForestRootUnitIds: [],
  predicates: [],
  relations: [],
  predicateFilter: {
    predicateIds: [],
    predicateFamilies: [],
    semanticTypes: [],
    statuses: []
  },
  visibleRelations: [],
  relationScope: {
    focusUnitId: '',
    maxHops: 2,
    maxNodeCount: 48,
    maxRelationCount: 80
  },
  clipboard: {
    mode: '',
    unitIds: [],
    writable: false
  },
  copyUnits: () => {},
  cutUnits: () => {},
  pasteUnits: () => {}
}

type StatusFilterValue = 'all' | 'declared' | 'candidate' | 'confirmed' | 'projection'

// label 走 i18n：模块级 const 存 labelKey，展示时在 computed 里 t() 填充（value/statuses 是逻辑值保留）
const statusOptions: Array<{ value: StatusFilterValue; labelKey: string; statuses: RelationViewStatus[] }> = [
  { value: 'all', labelKey: 'unitTree.relationView.all', statuses: ['projection', 'declared', 'authored', 'candidate', 'confirmed'] },
  { value: 'declared', labelKey: 'unitTree.relationView.statusDeclared', statuses: ['declared', 'authored'] },
  { value: 'candidate', labelKey: 'unitTree.relationView.statusCandidate', statuses: ['candidate'] },
  { value: 'confirmed', labelKey: 'unitTree.relationView.statusConfirmed', statuses: ['confirmed'] },
  { value: 'projection', labelKey: 'unitTree.relationView.statusTree', statuses: ['projection'] }
]

const baseSource = computed(() => props.source || fallbackSource)
const activeStatusFilter = ref<StatusFilterValue>('all')
const activePredicateFamily = ref('')
const activePredicateId = ref('')
const activeSemanticType = ref<'' | UnitSemanticType>('')
const isAdvancedFilterOpen = ref(false)
const workspaceRef = ref<ComponentPublicInstance | null>(null)
// 谓词家族 label 走 i18n：模块级 const 存 labelKey，getPredicateFamilyLabel 里 t() 填充（family 值本身是数据）
const predicateFamilyLabelKeys: Partial<Record<PredicateFamily, string>> = {
  structure: 'unitTree.predicateFamily.structure',
  spatial_location: 'unitTree.predicateFamily.spatial_location',
  spatial_neighbor: 'unitTree.predicateFamily.spatial_neighbor',
  origin: 'unitTree.predicateFamily.origin',
  power: 'unitTree.predicateFamily.power',
  activity: 'unitTree.predicateFamily.activity',
  affiliation: 'unitTree.predicateFamily.affiliation',
  conflict: 'unitTree.predicateFamily.conflict',
  alliance: 'unitTree.predicateFamily.alliance',
  event_effect: 'unitTree.predicateFamily.event_effect',
  kinship: 'unitTree.predicateFamily.kinship',
  belief_culture: 'unitTree.predicateFamily.belief_culture',
  resource_output: 'unitTree.predicateFamily.resource_output',
  trade_flow: 'unitTree.predicateFamily.trade_flow',
  craft_inheritance: 'unitTree.predicateFamily.craft_inheritance',
  general: 'unitTree.predicateFamily.general',
  spatial: 'unitTree.predicateFamily.spatial',
  causal: 'unitTree.predicateFamily.causal',
  event: 'unitTree.predicateFamily.event',
  lineage: 'unitTree.predicateFamily.lineage',
  character: 'unitTree.predicateFamily.character'
}

const activeStatusOption = computed(() => statusOptions.find((option) => option.value === activeStatusFilter.value) || statusOptions[0])
const activeStatuses = computed(() => (
  activeStatusFilter.value === 'all' && baseSource.value.predicateFilter.statuses.length
    ? baseSource.value.predicateFilter.statuses
    : activeStatusOption.value.statuses
))
const availableStatusValues = computed(() => {
  const relationStatuses = new Set(baseSource.value.visibleRelations.map((relation) => relation.status))
  return new Set<StatusFilterValue>(statusOptions
    .filter((option) => option.value === 'all' || option.statuses.some((status) => relationStatuses.has(status)))
    .map((option) => option.value))
})
const statusSelectOptions = computed(() => statusOptions
  .filter((option) => availableStatusValues.value.has(option.value))
  .map((option) => ({ value: option.value, label: t(option.labelKey), statuses: option.statuses })))
const availableRelations = computed(() => {
  const availableStatuses = activeStatusFilter.value === 'all'
    ? new Set<RelationViewStatus>()
    : new Set(activeStatuses.value)
  return baseSource.value.visibleRelations.filter((relation) => (
    !availableStatuses.size || availableStatuses.has(relation.status)
  ))
})
const predicateById = computed(() => new Map(baseSource.value.predicates.map((predicate) => [predicate.predicateId, predicate] as const)))
const availablePredicateIds = computed(() => new Set(availableRelations.value.map((relation) => relation.predicateId)))
const predicateFamilies = computed(() => Array.from(new Set(availableRelations.value
  .map((relation) => String(predicateById.value.get(relation.predicateId)?.family || '').trim())
  .filter(Boolean))))
const predicateOptions = computed(() => {
  return baseSource.value.predicates.filter((predicate) => (
    availablePredicateIds.value.has(predicate.predicateId)
      && (!activePredicateFamily.value || predicate.family === activePredicateFamily.value)
  ))
})
const semanticTypeOptions = computed(() => {
  const unitById = new Map(baseSource.value.units.map((unit) => [unit.unitId, unit] as const))
  const focusUnitId = String(baseSource.value.relationScope.focusUnitId || '').trim()
  const present = new Set<UnitSemanticType>()
  availableRelations.value.forEach((relation) => {
    const endpointIds = focusUnitId && relation.sourceUnitId === focusUnitId
      ? [relation.targetUnitId]
      : focusUnitId && relation.targetUnitId === focusUnitId
        ? [relation.sourceUnitId]
        : [relation.sourceUnitId, relation.targetUnitId]
    endpointIds.forEach((unitId) => {
      const semanticType = unitById.get(unitId)?.semanticType
      if (semanticType) present.add(semanticType)
    })
  })
  return UNIT_SEMANTIC_TYPE_OPTIONS.filter((option) => present.has(option.value))
})
const hasActiveFilters = computed(() => (
  activeStatusFilter.value !== 'all'
    || Boolean(activePredicateFamily.value)
    || Boolean(activePredicateId.value)
    || Boolean(activeSemanticType.value)
))
const hasAdvancedFilters = computed(() => activeStatusFilter.value !== 'all' || Boolean(activePredicateId.value))
const activeSource = computed(() => createUnitRelationSourceAdapter({
  characterId: baseSource.value.characterId,
  title: baseSource.value.title,
  activeUnit: baseSource.value.activeUnit || null,
  units: baseSource.value.units,
  projectionCharacter: baseSource.value.projectionCharacter || null,
  projectionLayout: baseSource.value.projectionLayout || 'default',
  projectionExpandedUnitIds: baseSource.value.projectionExpandedUnitIds || [],
  projectionForestRootUnitIds: baseSource.value.projectionForestRootUnitIds || [],
  predicates: baseSource.value.predicates,
  relations: baseSource.value.relations,
  predicateFilter: {
    predicateIds: activePredicateId.value ? [activePredicateId.value] : baseSource.value.predicateFilter.predicateIds,
    predicateFamilies: activePredicateFamily.value ? [activePredicateFamily.value] : baseSource.value.predicateFilter.predicateFamilies,
    semanticTypes: activeSemanticType.value ? [activeSemanticType.value] : baseSource.value.predicateFilter.semanticTypes,
    statuses: activeStatuses.value
  },
  relationScope: baseSource.value.relationScope,
  clipboard: baseSource.value.clipboard,
  copyUnits: baseSource.value.copyUnits,
  cutUnits: baseSource.value.cutUnits,
  pasteUnits: baseSource.value.pasteUnits
}))
const focusNodeId = computed(() => resolveUnitRelationSourceFocusNodeId(activeSource.value))
const unitById = computed(() => new Map(activeSource.value.units.map((unit) => [unit.unitId, unit] as const)))
const relationEndpointUnitIds = computed(() => {
  const unitIds = new Set<string>()
  activeSource.value.visibleRelations.forEach((relation) => {
    if (unitById.value.has(relation.sourceUnitId)) unitIds.add(relation.sourceUnitId)
    if (unitById.value.has(relation.targetUnitId)) unitIds.add(relation.targetUnitId)
  })
  return unitIds
})
const canvasProjectionUnits = computed<UnitView[]>(() => {
  if (!hasActiveFilters.value) return activeSource.value.units
  return activeSource.value.units.filter((unit) => relationEndpointUnitIds.value.has(unit.unitId))
})
const projectionExpandedNodeIds = computed(() => (activeSource.value.projectionExpandedUnitIds || [])
  .map((unitId) => unitById.value.get(unitId))
  .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
  .map((unit) => resolveUnitRelationProjectionNodeId(unit, activeSource.value.characterId))
  .filter(Boolean))
const projectionForestRootNodeIds = computed(() => (activeSource.value.projectionForestRootUnitIds || [])
  .map((unitId) => unitById.value.get(unitId))
  .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
  .map((unit) => resolveUnitRelationProjectionNodeId(unit, activeSource.value.characterId))
  .filter(Boolean))
const projectionRelationNodeIds = computed(() => {
  const nodeIds = new Set<string>()
  activeSource.value.visibleRelations.forEach((relation) => {
    const sourceUnit = unitById.value.get(relation.sourceUnitId)
    const targetUnit = unitById.value.get(relation.targetUnitId)
    if (sourceUnit) nodeIds.add(resolveUnitRelationProjectionNodeId(sourceUnit, activeSource.value.characterId))
    if (targetUnit) nodeIds.add(resolveUnitRelationProjectionNodeId(targetUnit, activeSource.value.characterId))
  })
  return Array.from(nodeIds)
})
const canvasProjectionRelationNodeIds = computed(() => (
  hasActiveFilters.value ? projectionRelationNodeIds.value : []
))
const canvasFocusNodeId = computed(() => {
  if (!hasActiveFilters.value) return focusNodeId.value
  if (projectionRelationNodeIds.value.includes(focusNodeId.value)) return focusNodeId.value
  return projectionRelationNodeIds.value[0] || focusNodeId.value
})
const projectionRelationEdges = computed(() => activeSource.value.visibleRelations.map((relation) => {
  const sourceUnit = unitById.value.get(relation.sourceUnitId)
  const targetUnit = unitById.value.get(relation.targetUnitId)
  if (!sourceUnit || !targetUnit) return null
  return {
    id: relation.relationId,
    sourceNodeId: resolveUnitRelationProjectionNodeId(sourceUnit, activeSource.value.characterId),
    targetNodeId: resolveUnitRelationProjectionNodeId(targetUnit, activeSource.value.characterId)
  }
}).filter(Boolean) as Array<{ id: string; sourceNodeId: string; targetNodeId: string }>)

watch(workspaceRef, async (instance) => {
  if (!instance) return
  await nextTick()
  emit('ready')
}, { flush: 'post' })

watch(activePredicateFamily, () => {
  if (!activePredicateId.value) return
  const stillVisible = predicateOptions.value.some((predicate) => predicate.predicateId === activePredicateId.value)
  if (!stillVisible) activePredicateId.value = ''
})

watch([predicateFamilies, predicateOptions, semanticTypeOptions, availableStatusValues], () => {
  if (activePredicateFamily.value && !predicateFamilies.value.includes(activePredicateFamily.value)) {
    activePredicateFamily.value = ''
  }
  if (activePredicateId.value && !predicateOptions.value.some((predicate) => predicate.predicateId === activePredicateId.value)) {
    activePredicateId.value = ''
  }
  if (activeSemanticType.value && !semanticTypeOptions.value.some((option) => option.value === activeSemanticType.value)) {
    activeSemanticType.value = ''
  }
  if (activeStatusFilter.value !== 'all' && !availableStatusValues.value.has(activeStatusFilter.value)) {
    activeStatusFilter.value = 'all'
  }
}, { flush: 'post' })

function handleProjectionOpen(nodeId: string) {
  const unitId = mapUnitRelationSourceNodeIdToUnitId(activeSource.value, nodeId)
  if (unitId) emit('open-unit', unitId)
}

function getPredicateFamilyLabel(family: string) {
  const key = predicateFamilyLabelKeys[family as PredicateFamily]
  return key ? t(key) : family
}

function resetFilters() {
  activeStatusFilter.value = 'all'
  activePredicateFamily.value = ''
  activePredicateId.value = ''
  activeSemanticType.value = ''
  isAdvancedFilterOpen.value = false
}
</script>

<style scoped>
.unit-relation-brain-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 320px;
  background: var(--langhuan-paper-bg);
}

.unit-relation-brain-view__canvas {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.unit-relation-brain-view :deep(.brain-workspace),
.unit-relation-brain-view :deep(.brain-workspace__board),
.unit-relation-brain-view :deep(.brain-workspace__canvas-shell) {
  height: 100%;
  min-height: 0;
  background: var(--langhuan-paper-bg);
}

.unit-relation-brain-view :deep(.brain-workspace__canvas) {
  background: transparent;
}

.unit-relation-brain-view__filters {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 0 0 auto;
  min-height: 0;
  margin: 0 0 10px;
  padding: 6px 9px 7px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 68%, transparent);
  background: color-mix(in srgb, var(--langhuan-paper-bg, #faf8f0) 94%, var(--morandi-bg, #f8f4ee) 6%);
}

.unit-relation-brain-view__filter-row {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.unit-relation-brain-view__filter-row--main {
  display: grid;
  grid-template-columns: minmax(96px, 1fr) minmax(88px, 0.82fr) auto auto auto;
}

.unit-relation-brain-view__filter-row--advanced {
  display: grid;
  grid-template-columns: minmax(92px, 0.78fr) minmax(104px, 1fr);
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 48%, transparent);
}

.unit-relation-brain-view__field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--morandi-text-muted, #687164);
  font-size: 12px;
}

.unit-relation-brain-view__field span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.unit-relation-brain-view__select {
  height: 27px;
  min-width: 0;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 72%, transparent);
  border-radius: 6px;
  color: var(--morandi-text, #27301f);
  background: color-mix(in srgb, var(--langhuan-dialog-input-bg, #fff) 42%, transparent);
  font-size: 12px;
}

.unit-relation-brain-view__count {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--morandi-text-muted, #687164);
  font-size: 12px;
  white-space: nowrap;
}

.unit-relation-brain-view__count strong {
  color: var(--morandi-text, #27301f);
  font-weight: 600;
}

.unit-relation-brain-view__detail,
.unit-relation-brain-view__reset {
  flex: 0 0 auto;
  min-height: 27px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 60%, transparent);
  border-radius: 6px;
  color: var(--morandi-text-muted, #687164);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}

.unit-relation-brain-view__detail.active {
  color: var(--morandi-text, #27301f);
  background: rgba(130, 153, 135, 0.14);
}

.unit-relation-brain-view__detail:hover,
.unit-relation-brain-view__reset:hover {
  color: var(--morandi-text, #27301f);
  background: color-mix(in srgb, var(--morandi-card, #fffdf8) 34%, transparent);
}

.unit-relation-brain-view :deep(.brain-workspace__toolbar) {
  top: 8px;
  right: 10px;
}

.unit-relation-brain-view :deep(.brain-workspace__toolbar-actions) {
  padding: 2px 4px;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 64%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--langhuan-paper-bg, #faf8f0) 96%, var(--morandi-bg, #f8f4ee) 4%);
  box-shadow: 0 8px 20px rgba(67, 77, 58, 0.08);
}

.unit-relation-brain-view :deep(.brain-node),
.unit-relation-brain-view :deep(.brain-node--focus-muted),
.unit-relation-brain-view :deep(.brain-node--selection-muted) {
  opacity: 1;
}

.unit-relation-brain-view :deep(.brain-node--density-5 .brain-node__dot),
.unit-relation-brain-view :deep(.brain-node--focus-active .brain-node__dot),
.unit-relation-brain-view :deep(.brain-node--focus-related .brain-node__dot),
.unit-relation-brain-view :deep(.brain-node--selection-active .brain-node__dot) {
  fill: #3f5f43;
}

.unit-relation-brain-view :deep(.brain-node--density-4 .brain-node__dot) {
  fill: #59745c;
}

.unit-relation-brain-view :deep(.brain-node--density-3 .brain-node__dot) {
  fill: #71836e;
}

.unit-relation-brain-view :deep(.brain-node--density-2 .brain-node__dot) {
  fill: #8e9a87;
}

.unit-relation-brain-view :deep(.brain-node--density-1 .brain-node__dot),
.unit-relation-brain-view :deep(.brain-node--focus-muted .brain-node__dot),
.unit-relation-brain-view :deep(.brain-node--selection-muted .brain-node__dot) {
  fill: #b2b9ab;
}

.unit-relation-brain-view :deep(.brain-node--density-1 .brain-node__label),
.unit-relation-brain-view :deep(.brain-node--focus-muted .brain-node__label),
.unit-relation-brain-view :deep(.brain-node--selection-muted .brain-node__label) {
  opacity: 1;
  fill: #6d746a;
}
</style>
