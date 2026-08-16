<template>
  <section class="spv" aria-label="状态栏总览">
    <article
      v-for="block in presentation.blocks"
      :key="block.id"
      class="spv-block"
      :class="`spv-span-${block.span || 1}`"
    >
      <header v-if="block.title" class="spv-title">{{ block.title }}</header>

      <template v-if="block.type === 'metric'">
        <div class="spv-metric">{{ formatNumber(valueOf(block.value)) }}<small v-if="block.unit">{{ block.unit }}</small></div>
        <div v-if="block.subtitle" class="spv-subtitle">{{ block.subtitle }}</div>
      </template>

      <template v-else-if="block.type === 'donut'">
        <div v-if="block.variants.length > 1" class="spv-tabs" role="tablist" :aria-label="`${block.title || '环图'}分类`">
          <button
            v-for="variant in block.variants"
            :key="variant.id"
            type="button"
            :class="{ active: activeVariant(block) === variant.id }"
            @click="variantState[block.id] = variant.id"
          >{{ variant.label }}</button>
        </div>
        <div class="spv-donut-row">
          <div class="spv-donut" :style="donutStyle(block)" role="img" :aria-label="donutAria(block)">
            <div><strong>{{ formatNumber(valueOf(block.total)) }}</strong><span>合计</span></div>
          </div>
          <ol class="spv-legend">
            <li v-for="(segment, index) in donutSegments(block)" :key="segment.id">
              <i :style="{ backgroundColor: palette[index % palette.length] }"></i>
              <span>{{ segment.label }}</span><strong>{{ formatNumber(segment.value) }}</strong>
            </li>
          </ol>
        </div>
      </template>

      <template v-else-if="block.type === 'bar'">
        <ol class="spv-bars">
          <li v-for="item in barItems(block)" :key="item.id">
            <span>{{ item.label }}</span>
            <div><i :style="{ width: `${item.percent}%` }"></i></div>
            <strong>{{ formatNumber(item.value) }}<small v-if="block.unit">{{ block.unit }}</small></strong>
          </li>
        </ol>
      </template>

      <template v-else-if="block.type === 'progress'">
        <div class="spv-progress-meta"><span>{{ block.label || '当前进度' }}</span><strong>{{ formatNumber(valueOf(block.value)) }} / {{ formatNumber(valueOf(block.total)) }} {{ block.unit || '' }}</strong></div>
        <div class="spv-progress"><i :style="{ width: `${progressPercent(block)}%` }"></i></div>
      </template>

      <dl v-else-if="block.type === 'field-list'" class="spv-fields">
        <template v-for="fieldKey in block.fieldKeys" :key="fieldKey">
          <dt>{{ fieldLabel(fieldKey) }}</dt><dd>{{ fieldText(fieldKey) }}</dd>
        </template>
      </dl>

      <div v-else-if="block.type === 'reference-list'" class="spv-refs">
        <button v-for="refId in refIds(block.fieldKey)" :key="refId" type="button" @click="$emit('refOpen', refId)">{{ panelNameById(refId) }} ↗</button>
        <span v-if="!refIds(block.fieldKey).length">暂无引用</span>
      </div>

      <figure v-else-if="block.type === 'media'" class="spv-media">
        <img
          v-if="assetRef(block.fieldKey) && !assetFailed(block.fieldKey)"
          :src="API.chatStatusAssetContent(sessionId, assetRef(block.fieldKey)!.assetId)"
          :alt="assetRef(block.fieldKey)!.alt"
          :class="`spv-fit-${block.fit || 'contain'}`"
          @error="markAssetFailed(block.fieldKey)"
        >
        <div v-else class="spv-media-empty">{{ assetRef(block.fieldKey) ? `图片不可用：${assetRef(block.fieldKey)!.alt}，请切到数据视图重新上传` : '还没有图片' }}</div>
        <figcaption v-if="assetRef(block.fieldKey)?.caption">{{ assetRef(block.fieldKey)?.caption }}</figcaption>
      </figure>

      <p v-if="blockError(block)" class="spv-error">数据不一致：{{ blockError(block) }}</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import type { ChatStatusPanel, StatusPanelAssetRef, StatusPanelFieldDef } from '../../../types'
import type {
  StatusPanelBarBlock,
  StatusPanelDonutBlock,
  StatusPanelPresentation,
  StatusPanelPresentationBlock,
  StatusPanelProgressBlock,
  StatusPanelValueExpression
} from '../../../../shared/statusPanelPresentation'
import { evaluateStatusPanelExpression, validateStatusPanelPresentationValues } from '../../../../shared/statusPanelPresentation'
import { statusPanelFieldDisplayLabel } from '../../../../shared/statusPanelField'
import { API } from '../../../config/api'

type PanelValueDraft = Record<string, unknown>
const props = defineProps<{
  sessionId: string
  panel: ChatStatusPanel
  fields: StatusPanelFieldDef[]
  draft: PanelValueDraft
  presentation: StatusPanelPresentation
  panelNameById: (panelId: string) => string
}>()
defineEmits<{ (e: 'refOpen', refId: string): void }>()

const palette = [
  'var(--morandi-accent, #5c8a5c)',
  'var(--morandi-info, #78938a)',
  'var(--morandi-primary, #8b7355)',
  'var(--morandi-secondary, #8998ac)',
  'var(--morandi-danger, #a47783)',
  'var(--morandi-warning, #b9ad78)'
]
const variantState = reactive<Record<string, string>>({})
const failedAssets = reactive<Record<string, boolean>>({})

function numericValues(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props.draft).map(([key, value]) => [key, typeof value === 'string' && value.trim() !== '' ? Number(value) : value]))
}
function valueOf(expression: StatusPanelValueExpression): number {
  return evaluateStatusPanelExpression(expression, numericValues())
}
function formatNumber(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) : '—'
}
function activeVariant(block: StatusPanelDonutBlock): string {
  return variantState[block.id] || block.variants[0]?.id || ''
}
function donutSegments(block: StatusPanelDonutBlock) {
  const variant = block.variants.find((item) => item.id === activeVariant(block)) || block.variants[0]
  return (variant?.segments || []).map((segment) => ({ ...segment, value: valueOf(segment.value) }))
}
function donutStyle(block: StatusPanelDonutBlock) {
  const total = valueOf(block.total)
  let cursor = 0
  const stops = donutSegments(block).map((segment, index) => {
    const start = total > 0 ? (cursor / total) * 100 : 0
    cursor += Math.max(0, segment.value)
    const end = total > 0 ? (cursor / total) * 100 : 0
    return `${palette[index % palette.length]} ${start}% ${end}%`
  })
  return { background: stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--morandi-border, #ebe7dd)' }
}
function donutAria(block: StatusPanelDonutBlock): string {
  return donutSegments(block).map((item) => `${item.label}${formatNumber(item.value)}`).join('，')
}
function barItems(block: StatusPanelBarBlock) {
  const items = block.items.map((item) => ({ ...item, value: valueOf(item.value) }))
  const max = Math.max(0, ...items.map((item) => Number.isFinite(item.value) ? item.value : 0))
  return items.map((item) => ({ ...item, percent: max > 0 ? Math.max(0, item.value / max * 100) : 0 }))
}
function progressPercent(block: StatusPanelProgressBlock): number {
  const total = valueOf(block.total)
  const value = valueOf(block.value)
  return total > 0 && Number.isFinite(value) ? Math.max(0, Math.min(100, value / total * 100)) : 0
}
function fieldOf(key: string) { return props.fields.find((field) => field.key === key) }
function fieldLabel(key: string) { const field = fieldOf(key); return field ? statusPanelFieldDisplayLabel(field) : key }
function fieldText(key: string) {
  const value = props.draft[key]
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join('、') || '—'
  if (value && typeof value === 'object') return (value as StatusPanelAssetRef).alt || '图片'
  return String(value ?? '').trim() || '—'
}
function refIds(key: string): string[] { return Array.isArray(props.draft[key]) ? (props.draft[key] as unknown[]).map(String).filter(Boolean) : [] }
function assetRef(key: string): StatusPanelAssetRef | null {
  const value = props.draft[key]
  return value && typeof value === 'object' && !Array.isArray(value) && String((value as Record<string, unknown>).assetId || '').trim()
    ? value as StatusPanelAssetRef
    : null
}
function assetFailureKey(key: string) { return `${key}:${assetRef(key)?.assetId || ''}` }
function assetFailed(key: string) { return Boolean(failedAssets[assetFailureKey(key)]) }
function markAssetFailed(key: string) { failedAssets[assetFailureKey(key)] = true }
function blockError(block: StatusPanelPresentationBlock): string {
  const activeVariantId = block.type === 'donut' ? activeVariant(block) : ''
  const issue = validateStatusPanelPresentationValues(
    { schemaVersion: 1, blocks: block.type === 'donut'
      ? [{ ...block, variants: block.variants.filter((variant) => variant.id === activeVariantId) }]
      : [block] },
    numericValues()
  )[0]
  return issue?.message.replace(/^[^：]+：/, '') || ''
}
</script>

<style scoped>
.spv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--morandi-border, #ddd9cf); }
.spv-block { min-width: 0; padding: 14px; border-right: 1px solid var(--morandi-border, #ddd9cf); border-bottom: 1px solid var(--morandi-border, #ddd9cf); background: color-mix(in srgb, var(--morandi-card, #fffdf8) 72%, transparent); }
.spv-span-2 { grid-column: span 2; } .spv-span-3 { grid-column: span 3; }
.spv-title { margin-bottom: 10px; color: var(--morandi-text-light, #81796f); font-size: .78rem; font-weight: 700; letter-spacing: .04em; }
.spv-metric { color: var(--morandi-text, #403b35); font-size: clamp(1.35rem, 3vw, 2.2rem); font-weight: 760; font-variant-numeric: tabular-nums; }
.spv-metric small, .spv-bars small { margin-left: 4px; color: var(--morandi-text-light, #81796f); font-size: .72rem; font-weight: 500; }
.spv-subtitle, .spv-media figcaption { margin-top: 5px; color: var(--morandi-text-light, #918a80); font-size: .74rem; }
.spv-tabs { display: flex; gap: 4px; margin: -2px 0 12px; }
.spv-tabs button { border: 1px solid var(--morandi-border, #d8d4ca); border-radius: 999px; padding: 3px 10px; background: transparent; color: var(--morandi-text-light, #736d65); font-size: .74rem; }
.spv-tabs button.active { border-color: var(--morandi-accent, #5c8a5c); background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 14%, transparent); color: var(--morandi-accent, #5c8a5c); }
.spv-donut-row { display: flex; align-items: center; gap: 18px; }
.spv-donut { flex: 0 0 132px; width: 132px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; }
.spv-donut > div { width: 72%; aspect-ratio: 1; border-radius: 50%; display: grid; place-content: center; text-align: center; background: var(--langhuan-paper-bg, var(--morandi-card, #fffdf8)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--morandi-accent, #5c8a5c) 12%, transparent); }
.spv-donut strong { font-size: 1rem; } .spv-donut span { color: var(--morandi-text-light, #918a80); font-size: .68rem; }
.spv-legend, .spv-bars { flex: 1; list-style: none; margin: 0; padding: 0; }
.spv-legend li { display: grid; grid-template-columns: 8px 1fr auto; gap: 7px; align-items: center; padding: 4px 0; font-size: .76rem; }
.spv-legend i { width: 8px; height: 8px; border-radius: 2px; } .spv-legend strong { font-variant-numeric: tabular-nums; }
.spv-bars li { display: grid; grid-template-columns: minmax(56px, .8fr) 2fr auto; gap: 9px; align-items: center; margin: 8px 0; font-size: .75rem; }
.spv-bars li > div, .spv-progress { height: 8px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--morandi-border, #e8e4da) 72%, transparent); }
.spv-bars i, .spv-progress i { display: block; height: 100%; border-radius: inherit; background: var(--morandi-accent, #5c8a5c); }
.spv-progress-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: .76rem; }
.spv-fields { display: grid; grid-template-columns: minmax(72px, .8fr) 2fr; margin: 0; font-size: .77rem; }
.spv-fields dt, .spv-fields dd { margin: 0; padding: 6px 0; border-bottom: 1px solid var(--morandi-border, #e7e3da); } .spv-fields dt { color: var(--morandi-text-light, #81796f); }
.spv-refs { display: flex; flex-wrap: wrap; gap: 6px; } .spv-refs button { border: 1px solid var(--morandi-border, #d8d4ca); border-radius: 7px; padding: 5px 8px; background: transparent; color: var(--morandi-accent, #5f795f); }
.spv-media { margin: 0; } .spv-media img, .spv-media-empty { width: 100%; min-height: 150px; max-height: 320px; border: 1px solid var(--morandi-border, #ded9cf); background: var(--morandi-soft-bg, #f0ede5); }
.spv-fit-contain { object-fit: contain; } .spv-fit-cover { object-fit: cover; } .spv-fit-pixelated { object-fit: contain; image-rendering: pixelated; }
.spv-media-empty { display: grid; place-items: center; padding: 12px; color: var(--morandi-text-light, #9a9287); font-size: .78rem; text-align: center; }
.spv-error { margin: 10px 0 0; padding-top: 8px; border-top: 1px dashed color-mix(in srgb, var(--morandi-danger, #c0665a) 58%, var(--morandi-border, #c6a895)); color: var(--morandi-danger, #9b5e50); font-size: .72rem; }
@media (max-width: 760px) { .spv { grid-template-columns: 1fr; } .spv-span-2, .spv-span-3 { grid-column: span 1; } .spv-donut-row { align-items: flex-start; } .spv-donut { flex-basis: 108px; width: 108px; } }
</style>
