<template>
  <section class="role-relation-brain-view">
    <UnitRelationBrainView
      :source="relationSource"
      @open-unit="$emit('open-unit', $event)"
      @ready="$emit('ready')"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PredicateView, RelationViewRecord, RelationViewStatus, UnitView } from '../../types/unitView'
import {
  buildTrajectoryAxisRelationRecords,
  createRelationProjectionCharacter,
  createUnitRelationSourceAdapter,
  shouldUseTrajectoryAxisRelationLayout
} from '../../app/unitRelationSourceAdapter'
import UnitRelationBrainView from './UnitRelationBrainView.vue'

const props = defineProps<{
  characterId: string
  activeUnit?: UnitView | null
  units: UnitView[]
  relations?: RelationViewRecord[]
  predicates?: PredicateView[]
  predicateIds?: string[]
  relationStatuses?: RelationViewStatus[]
  clipboardMode?: 'copy' | 'cut' | ''
  clipboardUnitIds?: string[]
  trajectoryExpandedUnitIds?: string[]
}>()

defineEmits<{
  (e: 'open-unit', unitId: string): void
  (e: 'ready'): void
}>()

const { t } = useI18n()

const relationSource = computed(() => createUnitRelationSourceAdapter({
  characterId: props.characterId,
  title: t('unitTree.relationView.rootTitle'),
  activeUnit: props.activeUnit || null,
  units: props.units,
  projectionCharacter: relationProjectionCharacter.value,
  projectionLayout: shouldUseTrajectoryAxisRelationLayout(props.activeUnit) ? 'trajectoryAxis' : 'default',
  projectionExpandedUnitIds: props.trajectoryExpandedUnitIds || [],
  relations: shouldUseTrajectoryAxisRelationLayout(props.activeUnit)
    ? [
        ...buildTrajectoryAxisRelationRecords(props.units, props.activeUnit, props.trajectoryExpandedUnitIds || []),
        ...relationsWithoutTrajectoryTreeProjection.value
      ]
    : (props.relations || []),
  predicates: props.predicates || [],
  predicateFilter: {
    predicateIds: props.predicateIds || [],
    statuses: props.relationStatuses || []
  },
  clipboard: {
    mode: props.clipboardMode || '',
    unitIds: props.clipboardUnitIds || [],
    writable: false
  }
}))

const relationsWithoutTrajectoryTreeProjection = computed(() => {
  const traceUnitIds = new Set(props.units
    .filter((unit) => unit.unitType === 'trace' || unit.domain === 'trace')
    .map((unit) => unit.unitId))
  return (props.relations || []).filter((relation) => {
    const touchesTrace = traceUnitIds.has(relation.sourceUnitId) || traceUnitIds.has(relation.targetUnitId)
    if (!touchesTrace) return true
    return relation.status !== 'projection'
  })
})

const relationProjectionCharacter = computed(() => createRelationProjectionCharacter(
  props.characterId,
  props.units.find((unit) => unit.unitType === 'character' || unit.unitType === 'root')?.title || t('unitTree.relationView.rootTitle')
))
</script>

<style scoped>
.role-relation-brain-view {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.role-relation-brain-view :deep(.brain-workspace),
.role-relation-brain-view :deep(.brain-workspace__board),
.role-relation-brain-view :deep(.brain-workspace__canvas-shell) {
  height: 100%;
  min-height: 0;
}
</style>
