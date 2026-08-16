<template>
  <PixelAdjustmentDialog
    title="去除杂色"
    width="500px"
    :scope-label="hasSelection ? `当前选区 · ${selectedLayerCount} 个图层` : `当前 ${selectedLayerCount} 个图层`"
    :preview="preview"
    :error="displayError"
    :apply-disabled="values.strength === 0 || !report?.changedCellCount"
    @close="emit('close')"
    @update:preview="preview = $event"
    @reset="reset"
    @apply="apply"
  >
    <label class="pixel-cleanup__preset">
      <span>预设</span>
      <select :value="preset" @change="selectPreset(($event.target as HTMLSelectElement).value)">
        <option value="gentle">轻柔净化</option>
        <option value="portrait">立绘规整</option>
        <option value="bold">粗线像素</option>
        <option v-for="item in customPresets" :key="item.id" :value="`saved:${item.id}`">
          {{ item.name }}{{ selectedCustomPreset?.id === item.id && presetDirty ? ' *' : '' }}
        </option>
        <option v-if="preset === 'custom'" value="custom">未保存的自定义</option>
      </select>
    </label>

    <div v-if="preset === 'custom' || selectedCustomPreset" class="pixel-cleanup__preset-editor">
      <input v-model="presetName" type="text" maxlength="32" placeholder="自定义预设名称" @input="onPresetNameInput" />
      <button type="button" :disabled="values.strength === 0" @click="saveCustomPreset">
        {{ selectedCustomPreset ? '再次保存' : '保存预设' }}
      </button>
      <button
        v-if="selectedCustomPreset"
        type="button"
        class="pixel-cleanup__preset-delete"
        @click="deleteCustomPreset"
      >
        {{ deleteConfirm ? '确认删除' : '删除' }}
      </button>
    </div>

    <label class="pixel-cleanup__master">
      <span>强度</span>
      <input v-model.number="values.strength" type="range" min="0" max="100" @input="markCustom" />
      <output>{{ values.strength }}</output>
    </label>

    <details open>
      <summary>色块</summary>
      <CleanupControl v-for="control in colorControls" :key="control.key" :control="control" :values="values" @change="markCustom" />
    </details>
    <details open>
      <summary>线条</summary>
      <CleanupControl v-for="control in lineControls" :key="control.key" :control="control" :values="values" @change="markCustom" />
    </details>
    <details>
      <summary>轮廓与保护</summary>
      <CleanupControl v-for="control in shapeControls" :key="control.key" :control="control" :values="values" @change="markCustom" />
      <div class="pixel-cleanup__protect">
        <span>保护色</span>
        <div class="pixel-cleanup__protect-colors">
          <button
            v-for="code in usedCodes"
            :key="code"
            type="button"
            class="pixel-cleanup__protect-color"
            :class="{ 'pixel-cleanup__protect-color--active': values.protectedCodes?.includes(code) }"
            :style="{ background: palette[code]?.hex }"
            :title="`${code} · ${palette[code]?.name || palette[code]?.hex || '未知颜色'}`"
            @click="toggleProtected(code)"
          />
        </div>
      </div>
    </details>

    <template #footer-summary>
      <span v-if="report" class="pixel-cleanup__report">
        使用色 {{ report.usedColorCountBefore }}→{{ report.usedColorCountAfter }} · 改动 {{ report.changedCellCount }} 格 · 线条 {{ report.processedLineCellCount }} 格
      </span>
    </template>
  </PixelAdjustmentDialog>
</template>

<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import type { PixelCleanupOptions as CleanupOptions } from '../core'

export interface CleanupControlDefinition {
  key: Exclude<keyof CleanupOptions, 'protectedCodes' | 'strength'>
  label: string
  min: number
  max: number
  step?: number
  unit?: string
}

export const CleanupControl = defineComponent({
  name: 'CleanupControl',
  props: {
    control: { type: Object as PropType<CleanupControlDefinition>, required: true },
    values: { type: Object as PropType<CleanupOptions>, required: true }
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('label', { class: 'pixel-cleanup__row' }, [
      h('span', props.control.label),
      h('input', {
        type: 'range',
        min: props.control.min,
        max: props.control.max,
        step: props.control.step ?? 1,
        value: props.values[props.control.key] as number,
        onInput: (event: Event) => {
          ;(props.values[props.control.key] as number) = Number((event.target as HTMLInputElement).value)
          emit('change')
        }
      }),
      h('output', `${props.values[props.control.key]}${props.control.unit ?? ''}`)
    ])
  }
})
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { PIXEL_CLEANUP_PRESETS, TRANSPARENT_CODE, type PixelCleanupOptions, type PixelCleanupReport, type PixelCode, type PixelPalette } from '../core'
import PixelAdjustmentDialog from './PixelAdjustmentDialog.vue'
import { loadPixelCleanupPresets, normalizeCleanupPresetName, savePixelCleanupPresets, type PixelCleanupCustomPreset } from './pixelCleanupPresets'

const props = withDefaults(defineProps<{ hasSelection: boolean; selectedLayerCount?: number; error?: string | null; report?: PixelCleanupReport | null; palette: PixelPalette; usedCodes: PixelCode[] }>(), { selectedLayerCount: 1 })
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'preview', options: PixelCleanupOptions, enabled: boolean): void
  (e: 'confirm', options: PixelCleanupOptions): void
}>()

type BuiltinPreset = keyof typeof PIXEL_CLEANUP_PRESETS
type PresetSelection = BuiltinPreset | 'custom' | `saved:${string}`

const preset = ref<PresetSelection>('portrait')
const lastPreset = ref<BuiltinPreset>('portrait')
const values = reactive<PixelCleanupOptions>({ ...PIXEL_CLEANUP_PRESETS.portrait, protectedCodes: [] })
const preview = ref(true)
const customPresets = ref<PixelCleanupCustomPreset[]>([])
const presetName = ref('')
const presetDirty = ref(false)
const deleteConfirm = ref(false)
const presetError = ref<string | null>(null)
const displayError = computed(() => presetError.value || props.error || null)
const selectedCustomPreset = computed(() => {
  if (!preset.value.startsWith('saved:')) return null
  const id = preset.value.slice('saved:'.length)
  return customPresets.value.find((item) => item.id === id) ?? null
})

const colorControls: CleanupControlDefinition[] = [
  { key: 'colorTolerance', label: '相近色', min: 0, max: 100 },
  { key: 'minRegionArea', label: '小色块', min: 0, max: 8, unit: '格' },
  { key: 'toneLevels', label: '保留阶调', min: 2, max: 8, unit: '档' }
]
const lineControls: CleanupControlDefinition[] = [
  { key: 'lineSensitivity', label: '暗线识别', min: 0, max: 100 },
  { key: 'lineExpansion', label: '描边扩展', min: 0, max: 2, unit: '格' },
  { key: 'gapClosing', label: '断线连接', min: 0, max: 2, unit: '格' },
  { key: 'haloCleanup', label: '线边净化', min: 0, max: 100 }
]
const shapeControls: CleanupControlDefinition[] = [
  { key: 'edgeRegularity', label: '边缘规整', min: 0, max: 100 },
  { key: 'detailProtection', label: '细节保护', min: 0, max: 100 }
]

function assignOptions(options: PixelCleanupOptions) {
  Object.assign(values, options)
  values.protectedCodes = [...(options.protectedCodes ?? [])]
}
function selectPreset(next: string) {
  presetError.value = null
  deleteConfirm.value = false
  if (next.startsWith('saved:')) {
    const item = customPresets.value.find((candidate) => `saved:${candidate.id}` === next)
    if (!item) {
      presetError.value = '所选自定义预设不存在'
      return
    }
    preset.value = next as `saved:${string}`
    presetName.value = item.name
    presetDirty.value = false
    assignOptions(item.options)
    return
  }
  if (next === 'custom') {
    preset.value = 'custom'
    return
  }
  if (!(next in PIXEL_CLEANUP_PRESETS)) return
  const builtin = next as BuiltinPreset
  lastPreset.value = builtin
  preset.value = builtin
  presetName.value = ''
  presetDirty.value = false
  assignOptions({ ...PIXEL_CLEANUP_PRESETS[builtin] })
}
function markCustom() {
  deleteConfirm.value = false
  presetError.value = null
  if (selectedCustomPreset.value) presetDirty.value = true
  else if (preset.value !== 'custom') {
    preset.value = 'custom'
    presetName.value = ''
    presetDirty.value = true
  }
}
function onPresetNameInput() {
  presetDirty.value = true
  deleteConfirm.value = false
  presetError.value = null
}
function toggleProtected(code: PixelCode) {
  if (code === TRANSPARENT_CODE) return
  const selected = new Set(values.protectedCodes ?? [])
  if (selected.has(code)) selected.delete(code)
  else selected.add(code)
  values.protectedCodes = [...selected].sort()
  markCustom()
}
function reset() {
  presetError.value = null
  deleteConfirm.value = false
  const saved = selectedCustomPreset.value
  if (saved) {
    presetName.value = saved.name
    presetDirty.value = false
    assignOptions(saved.options)
    return
  }
  preset.value = lastPreset.value
  presetName.value = ''
  presetDirty.value = false
  assignOptions({ ...PIXEL_CLEANUP_PRESETS[lastPreset.value] })
}
function optionsSnapshot(): PixelCleanupOptions {
  return { ...values, protectedCodes: [...(values.protectedCodes ?? [])] }
}
function saveCustomPreset() {
  presetError.value = null
  deleteConfirm.value = false
  if (values.strength === 0) {
    presetError.value = '强度为 0 时不能保存预设'
    return
  }
  try {
    const name = normalizeCleanupPresetName(presetName.value)
    const current = selectedCustomPreset.value
    const item: PixelCleanupCustomPreset = {
      id: current?.id ?? `cleanup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      options: optionsSnapshot()
    }
    const next = current
      ? customPresets.value.map((candidate) => candidate.id === current.id ? item : candidate)
      : [...customPresets.value, item]
    savePixelCleanupPresets(window.localStorage, next)
    customPresets.value = next
    preset.value = `saved:${item.id}`
    presetName.value = item.name
    presetDirty.value = false
  } catch (error) {
    presetError.value = error instanceof Error ? error.message : '无法保存自定义预设'
  }
}
function deleteCustomPreset() {
  const current = selectedCustomPreset.value
  if (!current) return
  if (!deleteConfirm.value) {
    deleteConfirm.value = true
    return
  }
  try {
    const next = customPresets.value.filter((item) => item.id !== current.id)
    savePixelCleanupPresets(window.localStorage, next)
    customPresets.value = next
    preset.value = lastPreset.value
    presetName.value = ''
    presetDirty.value = false
    deleteConfirm.value = false
    assignOptions({ ...PIXEL_CLEANUP_PRESETS[lastPreset.value] })
  } catch (error) {
    presetError.value = error instanceof Error ? error.message : '无法删除自定义预设'
  }
}
function apply() {
  emit('confirm', optionsSnapshot())
  values.strength = 0
}

let previewTimer: ReturnType<typeof setTimeout> | null = null
watch([values, preview], () => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewTimer = null
    emit('preview', { ...values, protectedCodes: values.protectedCodes ? [...values.protectedCodes] : undefined }, preview.value)
  }, 80)
}, { deep: true, immediate: true })
onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})
onMounted(() => {
  try {
    customPresets.value = loadPixelCleanupPresets(window.localStorage)
  } catch (error) {
    presetError.value = error instanceof Error ? error.message : '无法读取自定义预设'
  }
})
</script>

<style scoped>
.pixel-cleanup__preset,
.pixel-cleanup__master,
:deep(.pixel-cleanup__row) {
  display: grid;
  grid-template-columns: 76px minmax(150px, 1fr) 54px;
  gap: 10px;
  align-items: center;
  min-height: 30px;
  font-size: 13px;
}
.pixel-cleanup__preset { grid-template-columns: 76px 1fr; }
.pixel-cleanup__preset select {
  border: 1px solid var(--ps-border);
  border-radius: 4px;
  background: var(--ps-bg-canvas);
  color: var(--ps-text);
  padding: 4px 6px;
}
.pixel-cleanup__preset-editor {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto auto;
  gap: 6px;
}
.pixel-cleanup__preset-editor input {
  min-width: 0;
  border: 1px solid var(--ps-border);
  border-radius: 4px;
  background: var(--ps-bg-canvas);
  color: var(--ps-text);
  padding: 4px 6px;
}
.pixel-cleanup__preset-editor button {
  border: 1px solid var(--ps-border-strong);
  border-radius: 4px;
  background: var(--ps-bg-control);
  color: var(--ps-text);
  padding: 4px 8px;
}
.pixel-cleanup__preset-editor button:disabled { opacity: 0.45; cursor: not-allowed; }
.pixel-cleanup__preset-editor .pixel-cleanup__preset-delete { color: var(--ps-danger); }
.pixel-cleanup__master { padding-bottom: 4px; }
.pixel-cleanup__master input,
:deep(.pixel-cleanup__row input) { width: 100%; accent-color: var(--ps-accent-bg); }
.pixel-cleanup__master output,
:deep(.pixel-cleanup__row output) { color: var(--ps-muted); text-align: right; font-variant-numeric: tabular-nums; }
details { border-top: 1px solid var(--ps-border); padding-top: 4px; }
summary { cursor: pointer; font-size: 12px; font-weight: 600; padding: 4px 0; }
.pixel-cleanup__report { color: var(--ps-muted); font-size: 11px; white-space: nowrap; }
.pixel-cleanup__protect { display: grid; grid-template-columns: 76px 1fr; gap: 10px; align-items: start; padding-top: 4px; font-size: 13px; }
.pixel-cleanup__protect-colors { display: flex; flex-wrap: wrap; gap: 5px; max-height: 64px; overflow-y: auto; }
.pixel-cleanup__protect-color {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--ps-border-strong);
  border-radius: 3px;
}
.pixel-cleanup__protect-color--active { outline: 2px solid var(--ps-accent-bg); outline-offset: 1px; }
</style>
