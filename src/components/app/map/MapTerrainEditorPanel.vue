<template>
  <aside class="map-terrain-editor" aria-label="地图编辑">
    <header class="map-terrain-editor__head">
      <b>{{ t('chat.mapEditPanelTitle') }}</b>
      <button type="button" class="map-terrain-editor__close" :aria-label="t('common.close')" @click="emit('close')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
    </header>

    <div v-if="!session" class="map-terrain-editor__empty">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      <p>{{ selectionMessage || t('chat.mapEditSelectHint') }}</p>
    </div>

    <div v-else class="map-terrain-editor__body">
      <label class="map-terrain-editor__name">
        <span>{{ t('chat.mapEditName') }}</span>
        <input :value="session.name" maxlength="50" @input="emitText('name', $event)" />
      </label>

      <div class="map-terrain-editor__meta">
        <span>{{ typeLabel }}</span>
        <span v-if="session.featureIds.length > 1">{{ t('chat.mapEditFeatureCount', { count: session.featureIds.length }) }}</span>
      </div>

      <section v-if="session.geometry" class="map-terrain-editor__geometry">
        <div class="map-terrain-editor__geometry-head">
          <span>{{ t('chat.mapEditControlPointCount', { count: session.geometry.points.length }) }}</span>
          <button
            type="button"
            class="map-terrain-editor__snap"
            :class="{ on: session.geometry.snapEnabled }"
            :aria-pressed="session.geometry.snapEnabled"
            @click="emit('toggle-snap')"
          >
            {{ t('chat.mapEditSnap', { step: formatSnapStep(session.geometry.snapStepM) }) }}
          </button>
        </div>
        <div class="map-terrain-editor__geometry-actions">
          <button type="button" @click="emit('add-point')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            {{ t('chat.mapEditAddPoint') }}
          </button>
          <button type="button" class="danger" :disabled="!canDeletePoint" @click="emit('delete-point')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
            {{ t('chat.mapEditDeletePoint') }}
          </button>
        </div>
        <p>{{ t('chat.mapEditGeometryHint') }}</p>
      </section>

      <div v-if="session.type === 'grass'" class="map-terrain-editor__choice" role="group" :aria-label="t('chat.mapEditShape')">
        <button type="button" :class="{ on: session.values.shape === 'organic' }" @click="emit('update-value', { key: 'shape', value: 'organic' })">
          {{ t('chat.mapEditShapeOrganic') }}
        </button>
        <button type="button" :class="{ on: session.values.shape === 'exact' }" @click="emit('update-value', { key: 'shape', value: 'exact' })">
          {{ t('chat.mapEditShapeExact') }}
        </button>
      </div>

      <div v-if="session.type === 'river'" class="map-terrain-editor__choice" role="group" :aria-label="t('chat.mapEditRiverMouth')">
        <button type="button" :class="{ on: session.values.mouthCap === 'flat' }" @click="emit('update-value', { key: 'mouthCap', value: 'flat' })">
          {{ t('chat.mapEditRiverMouthFlat') }}
        </button>
        <button type="button" :class="{ on: session.values.mouthCap === 'flare' }" @click="emit('update-value', { key: 'mouthCap', value: 'flare' })">
          {{ t('chat.mapEditRiverMouthFlare') }}
        </button>
      </div>

      <div v-if="session.type === 'water'" class="map-terrain-editor__choice" role="group" :aria-label="t('chat.mapEditWaterKind')">
        <button type="button" :class="{ on: session.values.waterKind === 'lake' }" @click="emit('update-value', { key: 'waterKind', value: 'lake' })">
          {{ t('chat.mapEditWaterLake') }}
        </button>
        <button type="button" :class="{ on: session.values.waterKind === 'ocean' }" @click="emit('update-value', { key: 'waterKind', value: 'ocean' })">
          {{ t('chat.mapEditWaterOcean') }}
        </button>
      </div>

      <div class="map-terrain-editor__fields">
        <label v-for="field in fields" :key="field.key" class="map-terrain-editor__field">
          <span class="map-terrain-editor__field-label">{{ field.label }}</span>
          <div class="map-terrain-editor__field-control" :class="{ 'no-range': !field.slider }">
            <input
              v-if="field.slider"
              class="map-terrain-editor__range"
              type="range"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :value="numberValue(field.key)"
              @input="emitNumber(field.key, $event)"
            />
            <span v-if="field.readonly" class="map-terrain-editor__readonly">{{ displayValue(field) }}</span>
            <input
              v-else
              class="map-terrain-editor__number"
              type="number"
              :min="field.displayMin"
              :max="field.displayMax"
              :step="field.displayStep"
              :value="displayValue(field)"
              @input="emitDisplayNumber(field, $event)"
            />
            <small>{{ field.unit }}</small>
          </div>
        </label>
      </div>

      <p v-if="previewError || saveError" class="map-terrain-editor__error">{{ previewError || saveError }}</p>

      <footer class="map-terrain-editor__actions">
        <button type="button" class="map-terrain-editor__cancel" :disabled="saving" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="map-terrain-editor__save" :disabled="saving || Boolean(previewError)" @click="emit('save')">
          {{ saving ? t('chat.mapEditSaving') : t('common.save') }}
        </button>
      </footer>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MapTerrainEditSession } from '../../../app/mapTerrainEditing'
import { mapGeometryMinimumPointCount } from '../../../app/mapGeometryEditing'

type Field = {
  key: string
  label: string
  unit: string
  slider?: boolean
  readonly?: boolean
  min?: number
  max?: number
  step?: number
  scale?: number
  displayMin?: number
  displayMax?: number
  displayStep?: number
}

const props = defineProps<{
  session: MapTerrainEditSession | null
  selectionMessage?: string
  previewError?: string
  saveError?: string
  saving?: boolean
  selectedPointIndex?: number | null
}>()

const emit = defineEmits<{
  (e: 'update-value', payload: { key: string; value: number | string }): void
  (e: 'save'): void
  (e: 'cancel'): void
  (e: 'close'): void
  (e: 'add-point'): void
  (e: 'delete-point'): void
  (e: 'toggle-snap'): void
}>()

const { t } = useI18n()

const typeLabel = computed(() => {
  const type = props.session?.type
  if (type === 'mountain') return t('chat.mapEditTypeMountain')
  if (type === 'river') return t('chat.mapEditTypeRiver')
  if (type === 'water') return t('chat.mapEditTypeWater')
  if (type === 'grass') return t('chat.mapEditTypeGrass')
  if (type === 'circle') return t('chat.mapEditTypeCircle')
  if (type === 'ellipse') return t('chat.mapEditTypeEllipse')
  if (type === 'polygon') return t('chat.mapEditTypePolygon')
  if (type === 'path') return t('chat.mapEditTypePath')
  return t('chat.mapEditTypeRect')
})

const canDeletePoint = computed(() => Boolean(
  props.session?.geometry
  && props.selectedPointIndex !== null
  && props.selectedPointIndex !== undefined
  && props.session.geometry.points.length > mapGeometryMinimumPointCount(props.session.geometry)
))

function formatSnapStep(stepM: number): string {
  if (stepM >= 1000) return `${Number((stepM / 1000).toFixed(2))}km`
  return `${Math.round(stepM)}m`
}

function spanMax(key: string, floor: number): number {
  const value = Number(props.session?.values[key]) || 0
  return Math.max(floor, Math.ceil(value * 2.5 / 1000) * 1000)
}

const fields = computed<Field[]>(() => {
  const type = props.session?.type
  if (type === 'mountain') return [
    { key: 'peakElevationM', label: t('chat.mapEditPeakElevation'), unit: 'm', slider: true, min: 300, max: 6000, step: 50, displayStep: 50 },
    { key: 'baseWidthM', label: t('chat.mapEditBaseWidth'), unit: 'km', slider: true, min: 100, max: spanMax('baseWidthM', 100000), step: 100, scale: 0.001, displayMin: 0.1, displayStep: 0.1 },
    { key: 'steepness', label: t('chat.mapEditSteepness'), unit: '', slider: true, min: 0, max: 1, step: 0.05, displayMin: 0, displayMax: 1, displayStep: 0.05 },
    { key: 'ruggedness', label: t('chat.mapEditRuggedness'), unit: '', slider: true, min: 0, max: 1, step: 0.05, displayMin: 0, displayMax: 1, displayStep: 0.05 },
    { key: 'asymmetry', label: t('chat.mapEditAsymmetry'), unit: '', slider: true, min: -1, max: 1, step: 0.05, displayMin: -1, displayMax: 1, displayStep: 0.05 },
    { key: 'layers', label: t('chat.mapEditLayers'), unit: t('chat.mapEditLayersUnit'), readonly: true }
  ]
  if (type === 'river') {
    const result: Field[] = [
      { key: 'sourceWidthM', label: t('chat.mapEditRiverSourceWidth'), unit: 'm', slider: true, min: 1, max: spanMax('sourceWidthM', 1000), step: 1, displayMin: 1, displayStep: 1 },
      { key: 'mouthWidthM', label: t('chat.mapEditRiverMouthWidth'), unit: 'm', slider: true, min: 1, max: spanMax('mouthWidthM', 5000), step: 1, displayMin: 1, displayStep: 1 },
      { key: 'growthExponent', label: t('chat.mapEditRiverGrowth'), unit: '', slider: true, min: 0.1, max: 2, step: 0.05, displayMin: 0.1, displayMax: 2, displayStep: 0.05 },
      { key: 'bankRoughness', label: t('chat.mapEditRiverBankRoughness'), unit: '', slider: true, min: 0, max: 0.6, step: 0.02, displayMin: 0, displayMax: 0.6, displayStep: 0.02 }
    ]
    if (props.session?.values.mouthCap === 'flare') result.push(
      { key: 'mouthFlareRatio', label: t('chat.mapEditRiverFlareRatio'), unit: '×', slider: true, min: 1, max: 10, step: 0.25, displayMin: 1, displayMax: 10, displayStep: 0.25 }
    )
    return result
  }
  if (type === 'water') return [
    { key: 'maxDepthM', label: t('chat.mapEditWaterMaxDepth'), unit: 'm', slider: true, min: 1, max: 12000, step: 10, displayMin: 1, displayMax: 12000, displayStep: 10 },
    { key: 'shoreShelfRatio', label: t('chat.mapEditWaterShelf'), unit: '', slider: true, min: 0.05, max: 0.45, step: 0.01, displayMin: 0.05, displayMax: 0.45, displayStep: 0.01 },
    { key: 'depthCurve', label: t('chat.mapEditWaterDepthCurve'), unit: '', slider: true, min: 0.4, max: 3, step: 0.05, displayMin: 0.4, displayMax: 3, displayStep: 0.05 },
    { key: 'ruggedness', label: t('chat.mapEditWaterCoastRoughness'), unit: '', slider: true, min: 0, max: 1, step: 0.05, displayMin: 0, displayMax: 1, displayStep: 0.05 },
    { key: 'connectionGapM', label: t('chat.mapEditWaterConnectGap'), unit: 'm', slider: true, min: 10, max: 5000, step: 10, displayMin: 10, displayMax: 5000, displayStep: 10 },
    { key: 'layers', label: t('chat.mapEditWaterLayers'), unit: t('chat.mapEditLayersUnit'), readonly: true }
  ]
  const common: Field[] = [
    { key: 'centerX', label: t('chat.mapEditCenterX'), unit: 'km', scale: 0.001, displayStep: 0.1 },
    { key: 'centerY', label: t('chat.mapEditCenterY'), unit: 'km', scale: 0.001, displayStep: 0.1 }
  ]
  if (type === 'circle') return [...common,
    { key: 'radiusM', label: t('chat.mapEditRadius'), unit: 'km', slider: true, min: 100, max: spanMax('radiusM', 50000), step: 100, scale: 0.001, displayMin: 0.1, displayStep: 0.1 }
  ]
  if (type === 'ellipse' || type === 'rect' || type === 'grass') {
    const result = [...common,
      { key: 'widthM', label: t('chat.mapEditWidth'), unit: 'km', slider: true, min: 100, max: spanMax('widthM', 100000), step: 100, scale: 0.001, displayMin: 0.1, displayStep: 0.1 },
      { key: 'heightM', label: t('chat.mapEditHeight'), unit: 'km', slider: true, min: 100, max: spanMax('heightM', 100000), step: 100, scale: 0.001, displayMin: 0.1, displayStep: 0.1 }
    ]
    if (type === 'grass' && props.session?.values.shape === 'organic') result.push(
      { key: 'ruggedness', label: t('chat.mapEditRuggedness'), unit: '', slider: true, min: 0, max: 1, step: 0.05, displayMin: 0, displayMax: 1, displayStep: 0.05 }
    )
    return result
  }
  return []
})

function numberValue(key: string): number {
  return Number(props.session?.values[key]) || 0
}

function displayValue(field: Field): number {
  const value = numberValue(field.key) * (field.scale || 1)
  return Number(value.toFixed(field.scale ? 2 : 3))
}

function emitNumber(key: string, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) emit('update-value', { key, value })
}

function emitDisplayNumber(field: Field, event: Event) {
  const shown = Number((event.target as HTMLInputElement).value)
  const value = shown / (field.scale || 1)
  if (Number.isFinite(value)) emit('update-value', { key: field.key, value })
}

function emitText(key: string, event: Event) {
  emit('update-value', { key, value: (event.target as HTMLInputElement).value })
}
</script>

<style scoped>
.map-terrain-editor { width: 278px; min-width: 278px; height: 100%; display: flex; flex-direction: column; background: var(--morandi-card); border-left: 1px solid var(--morandi-border); color: var(--morandi-text); }
.map-terrain-editor__head { height: 44px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 10px 0 14px; border-bottom: 1px solid var(--morandi-border); }
.map-terrain-editor__head b { font-size: 13px; font-weight: 600; }
.map-terrain-editor__close { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: var(--morandi-text-light); cursor: pointer; }
.map-terrain-editor__close:hover { background: var(--morandi-soft-bg); color: var(--morandi-text); }
.map-terrain-editor__close svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.map-terrain-editor__empty { margin: auto 22px; text-align: center; color: var(--morandi-text-light); }
.map-terrain-editor__empty svg { width: 25px; height: 25px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.75; }
.map-terrain-editor__empty p { margin: 9px 0 0; font-size: 12px; line-height: 1.65; }
.map-terrain-editor__body { min-height: 0; flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 12px 14px 0; }
.map-terrain-editor__name { display: grid; gap: 5px; }
.map-terrain-editor__name > span, .map-terrain-editor__field-label { font-size: 11px; color: var(--morandi-text-light); }
.map-terrain-editor__name input, .map-terrain-editor__number { box-sizing: border-box; border: 1px solid var(--morandi-border); background: var(--morandi-surface); color: var(--morandi-text); outline: none; }
.map-terrain-editor__name input { width: 100%; height: 32px; padding: 0 9px; font-size: 12px; }
.map-terrain-editor__name input:focus, .map-terrain-editor__number:focus { border-color: #7e9a81; }
.map-terrain-editor__meta { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0 12px; font-size: 10.5px; color: var(--morandi-text-light); }
.map-terrain-editor__geometry { margin: 0 0 12px; padding: 0 0 11px; border-bottom: 1px solid var(--morandi-border); }
.map-terrain-editor__geometry-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--morandi-text-light); }
.map-terrain-editor__snap { height: 25px; padding: 0 7px; border: 1px solid var(--morandi-border); background: transparent; color: var(--morandi-text-light); font-size: 10.5px; cursor: pointer; }
.map-terrain-editor__snap.on { color: #47704a; border-color: color-mix(in srgb, #5C8A5C 55%, var(--morandi-border)); background: color-mix(in srgb, #5C8A5C 8%, transparent); }
.map-terrain-editor__geometry-actions { display: flex; gap: 4px; margin-top: 8px; }
.map-terrain-editor__geometry-actions button { min-width: 0; height: 27px; display: inline-flex; align-items: center; gap: 4px; padding: 0 7px; border: 0; background: transparent; color: var(--morandi-text-light); font-size: 10.5px; cursor: pointer; }
.map-terrain-editor__geometry-actions button:hover:not(:disabled) { background: var(--morandi-soft-bg); color: var(--morandi-text); }
.map-terrain-editor__geometry-actions button.danger:hover:not(:disabled) { color: #A85249; }
.map-terrain-editor__geometry-actions button:disabled { opacity: 0.38; cursor: default; }
.map-terrain-editor__geometry-actions svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.map-terrain-editor__geometry p { margin: 6px 0 0; color: var(--morandi-text-light); font-size: 10px; line-height: 1.45; }
.map-terrain-editor__choice { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--morandi-border); margin-bottom: 12px; }
.map-terrain-editor__choice button { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--morandi-text-light); padding: 6px 4px; font-size: 11.5px; cursor: pointer; }
.map-terrain-editor__choice button.on { color: #47704a; border-bottom-color: #5C8A5C; }
.map-terrain-editor__fields { display: grid; gap: 13px; }
.map-terrain-editor__field { display: grid; gap: 6px; }
.map-terrain-editor__field-control { display: grid; grid-template-columns: minmax(0, 1fr) 58px auto; gap: 7px; align-items: center; }
.map-terrain-editor__field-control:has(.map-terrain-editor__readonly) { grid-template-columns: 1fr auto; }
.map-terrain-editor__field-control.no-range:not(:has(.map-terrain-editor__readonly)) { grid-template-columns: 76px auto; justify-content: end; }
.map-terrain-editor__field-control.no-range .map-terrain-editor__number { width: 76px; }
.map-terrain-editor__range { width: 100%; height: 3px; accent-color: #5C8A5C; }
.map-terrain-editor__number { width: 58px; height: 25px; padding: 0 5px; font-size: 11px; }
.map-terrain-editor__readonly { font-size: 12px; color: var(--morandi-text); }
.map-terrain-editor__field-control small { font-size: 10px; color: var(--morandi-text-light); }
.map-terrain-editor__error { margin: 14px 0 0; padding-top: 10px; border-top: 1px solid color-mix(in srgb, #C0665A 28%, transparent); color: #A85249; font-size: 11px; line-height: 1.55; }
.map-terrain-editor__actions { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; padding: 12px 0 14px; background: var(--morandi-card); border-top: 1px solid var(--morandi-border); }
.map-terrain-editor__actions button { height: 30px; padding: 0 13px; border: 1px solid var(--morandi-border); font-size: 12px; cursor: pointer; }
.map-terrain-editor__cancel { background: transparent; color: var(--morandi-text-light); }
.map-terrain-editor__save { background: #5C8A5C; border-color: #5C8A5C !important; color: #fff; }
.map-terrain-editor__actions button:disabled { opacity: 0.45; cursor: default; }
@media (prefers-reduced-motion: reduce) { .map-terrain-editor__choice button { transition: none; } }
</style>
