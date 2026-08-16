<template>
  <div class="pixel-palette">
    <section class="pixel-palette__board" :style="{ height: `${colorBoardHeight}px` }">
      <PixelColorPicker :initial-hex="currentHex ?? undefined" @pick="onPick" />
    </section>

    <PixelResizeHandle class="pixel-palette__resize" axis="horizontal" @resize="$emit('resize-color-board', $event)" @resize-end="$emit('resize-end')" />

    <section class="pixel-palette__cards">
      <div class="pixel-palette__grid">
        <button
          v-for="code in usedCodes"
          :key="code"
          type="button"
          class="pixel-swatch"
          :class="{ 'pixel-swatch--active': selectedCodes.includes(code), 'pixel-swatch--paint': code === currentColor }"
          :style="{ background: palette[code].hex }"
          @click="onSwatchClick(code, $event)"
        >
          <span class="pixel-swatch__tooltip">{{ code }} · {{ pctLabel(code) }}</span>
        </button>
        <button
          type="button"
          class="pixel-swatch pixel-swatch--transparent"
          :class="{ 'pixel-swatch--paint': currentColor === TRANSPARENT_CODE }"
          @click="onTransparentClick"
        >
          <span class="pixel-swatch__tooltip">透明 · {{ pctLabel(TRANSPARENT_CODE) }}</span>
        </button>
      </div>
      <p v-if="usedCodes.length === 0" class="pixel-palette__empty">颜色真正画到画布后才会出现在这里</p>
    </section>

    <aside v-if="selectedDetails.length" class="pixel-palette__drawer">
      <header class="pixel-palette__drawer-head">
        <div class="pixel-palette__drawer-title">
          <template v-if="singleDetail">
            <span class="pixel-palette__detail-swatch" :style="{ background: singleDetail.hex }" />
            <button v-if="!editingName" type="button" class="pixel-palette__name-trigger" title="点击编辑颜色名" @click="startNameEdit">
              {{ singleDetail.name || singleDetail.code }}
            </button>
            <span v-if="singleDetail.name && !editingName" class="pixel-palette__code-note">{{ singleDetail.code }}</span>
            <div v-if="editingName" class="pixel-palette__name-editor">
              <input ref="nameInputRef" v-model="nameDraft" type="text" maxlength="40" placeholder="颜色名（可选）" @keydown.enter="saveName" @keydown.esc="cancelNameEdit" />
              <button type="button" class="pixel-palette__primary" @click="saveName">保存</button>
              <button type="button" @click="cancelNameEdit">取消</button>
            </div>
          </template>
          <template v-else>
            <strong>已选择 {{ selectedDetails.length }} 个颜色</strong>
            <span class="pixel-palette__selection-preview">
              <i v-for="item in selectedDetails.slice(0, 8)" :key="item.code" :style="{ background: item.hex }" />
            </span>
          </template>
        </div>
        <button type="button" class="pixel-palette__detail-close" title="关闭" @click="closeDrawer">×</button>
      </header>

      <template v-if="singleDetail">
        <div class="pixel-palette__detail-row">
          <input type="color" class="pixel-palette__color-input" :value="singleDetail.hex" @change="onEditHex(($event.target as HTMLInputElement).value)" />
          <input type="text" class="pixel-palette__hex-input" :value="singleDetail.hex" maxlength="7" @change="onEditHex(($event.target as HTMLInputElement).value)" />
        </div>
        <div class="pixel-palette__detail-row pixel-palette__muted">RGB {{ rgbText }}</div>
        <div class="pixel-palette__detail-row pixel-palette__muted">
          <span>{{ selectedCount }} 格</span><span>{{ selectedPct }}</span>
        </div>
        <div class="pixel-palette__hsv-group">
          <label>色相 <input type="range" min="0" max="359" :value="Math.round(singleHsv.h)" @change="setSingleHsv('h', $event)" /><output>{{ Math.round(singleHsv.h) }}°</output></label>
          <label>饱和度 <input type="range" min="0" max="100" :value="Math.round(singleHsv.s * 100)" @change="setSingleHsv('s', $event)" /><output>{{ Math.round(singleHsv.s * 100) }}%</output></label>
          <label>明度 <input type="range" min="0" max="100" :value="Math.round(singleHsv.v * 100)" @change="setSingleHsv('v', $event)" /><output>{{ Math.round(singleHsv.v * 100) }}%</output></label>
        </div>
        <label class="pixel-palette__highlight-toggle">
          <input type="checkbox" :checked="highlightOn" @change="toggleHighlight" /> 高亮画布
        </label>

        <section v-if="replaceTarget" class="pixel-palette__replace-section">
          <strong>替换 {{ replaceTarget }}</strong>
          <span>点右侧色卡、在上方取色，或输入短码</span>
          <div class="pixel-palette__replace-row">
            <input v-model="replaceInput" class="pixel-palette__replace-input" type="text" maxlength="2" placeholder="a1 / .." @keydown.enter="onReplaceInputEnter" @keydown.esc.prevent="cancelReplace" />
            <button type="button" class="pixel-palette__replace-cancel" @click="cancelReplace">取消</button>
          </div>
        </section>

        <div class="pixel-palette__detail-actions">
          <button type="button" class="pixel-palette__delete" @click="onDelete">删除</button>
          <button type="button" class="pixel-palette__replace" @click="startReplace">替换为</button>
        </div>
      </template>

      <template v-else>
        <p class="pixel-palette__muted">三项滑杆会给所有选中颜色施加相同偏移，保留它们原本的色差。</p>
        <div class="pixel-palette__hsv-group">
          <label>色相偏移 <input v-model.number="multiAdjustment.hue" type="range" min="-180" max="180" /><output>{{ signed(multiAdjustment.hue) }}°</output></label>
          <label>饱和度偏移 <input v-model.number="multiAdjustment.saturation" type="range" min="-100" max="100" /><output>{{ signed(multiAdjustment.saturation) }}%</output></label>
          <label>明度偏移 <input v-model.number="multiAdjustment.brightness" type="range" min="-100" max="100" /><output>{{ signed(multiAdjustment.brightness) }}%</output></label>
        </div>
        <div class="pixel-palette__detail-actions pixel-palette__detail-actions--stack">
          <button type="button" class="pixel-palette__primary" :disabled="!hasMultiAdjustment" @click="applyMultiAdjustment">应用统一调整</button>
          <button type="button" @click="averageSelected">平均并统一为一个颜色</button>
        </div>
      </template>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ColorStatEntry, HsvAdjustment, PixelCode, PixelPalette } from '../core'
import { TRANSPARENT_CODE, hexToHsv, hexToRgb, hsvToHex } from '../core'
import { isValidHexColor } from './pixelUiUtils'
import PixelColorPicker from './PixelColorPicker.vue'
import PixelResizeHandle from './PixelResizeHandle.vue'

const props = defineProps<{
  palette: PixelPalette
  currentColor: PixelCode | null
  currentHex: string | null
  stats: ColorStatEntry[]
  highlightCode: PixelCode | null
  colorBoardHeight: number
}>()

const emit = defineEmits<{
  (e: 'select-color', code: PixelCode): void
  (e: 'pick-color', hex: string): void
  (e: 'update-color', code: PixelCode, hex: string, name?: string): void
  (e: 'remove-color', code: PixelCode, replaceWith: PixelCode): void
  (e: 'replace-color-hex', code: PixelCode, hex: string): void
  (e: 'adjust-colors', codes: PixelCode[], adjustment: HsvAdjustment): void
  (e: 'average-colors', codes: PixelCode[]): void
  (e: 'update:highlight-code', code: PixelCode | null): void
  (e: 'resize-color-board', delta: number): void
  (e: 'resize-end'): void
}>()

const statsMap = computed(() => new Map(props.stats.map((entry) => [entry.code, entry])))
const usedCodes = computed(() => props.stats
  .filter((entry) => entry.code !== TRANSPARENT_CODE && entry.count > 0 && !!props.palette[entry.code])
  .map((entry) => entry.code)
  .sort())
const selectedCodes = ref<PixelCode[]>([])
const selectionAnchor = ref<PixelCode | null>(null)
const selectedDetails = computed(() => selectedCodes.value.flatMap((code) => {
  const color = props.palette[code]
  return color ? [{ code, hex: color.hex, name: color.name }] : []
}))
const singleDetail = computed(() => selectedDetails.value.length === 1 ? selectedDetails.value[0] : null)

watch(usedCodes, (codes) => {
  const allowed = new Set(codes)
  selectedCodes.value = selectedCodes.value.filter((code) => allowed.has(code))
  if (selectionAnchor.value && !allowed.has(selectionAnchor.value)) selectionAnchor.value = null
}, { flush: 'sync' })

function pctLabel(code: PixelCode): string {
  return `${((statsMap.value.get(code)?.pct ?? 0) * 100).toFixed(1)}%`
}

function onSwatchClick(code: PixelCode, event: MouseEvent) {
  if (replaceTarget.value) {
    resolveReplacement(code)
    return
  }
  const codes = usedCodes.value
  const wasHighlighting = !!props.highlightCode
  const plainClick = !event.shiftKey && !event.ctrlKey && !event.metaKey
  if (event.shiftKey && selectionAnchor.value) {
    const from = codes.indexOf(selectionAnchor.value)
    const to = codes.indexOf(code)
    if (from >= 0 && to >= 0) selectedCodes.value = codes.slice(Math.min(from, to), Math.max(from, to) + 1)
  } else if (event.ctrlKey || event.metaKey) {
    selectedCodes.value = selectedCodes.value.includes(code)
      ? selectedCodes.value.filter((item) => item !== code)
      : [...selectedCodes.value, code]
    selectionAnchor.value = code
  } else {
    selectedCodes.value = [code]
    selectionAnchor.value = code
  }
  emit('select-color', code)
  if (wasHighlighting && plainClick) emit('update:highlight-code', code)
}

function onTransparentClick() {
  cancelReplace()
  selectedCodes.value = []
  selectionAnchor.value = null
  emit('select-color', TRANSPARENT_CODE)
}

function closeDrawer() {
  selectedCodes.value = []
  selectionAnchor.value = null
  cancelReplace()
}

const rgbText = computed(() => {
  if (!singleDetail.value) return ''
  const { r, g, b } = hexToRgb(singleDetail.value.hex)
  return `${r}, ${g}, ${b}`
})
const singleHsv = computed(() => singleDetail.value ? hexToHsv(singleDetail.value.hex) : { h: 0, s: 0, v: 0 })
const selectedCount = computed(() => selectedCodes.value.reduce((sum, code) => sum + (statsMap.value.get(code)?.count ?? 0), 0))
const selectedPct = computed(() => `${(selectedCodes.value.reduce((sum, code) => sum + (statsMap.value.get(code)?.pct ?? 0), 0) * 100).toFixed(1)}%`)

function onEditHex(hex: string) {
  if (!singleDetail.value || !isValidHexColor(hex)) return
  emit('update-color', singleDetail.value.code, hex.toLowerCase(), undefined)
}
function setSingleHsv(field: 'h' | 's' | 'v', event: Event) {
  if (!singleDetail.value) return
  const value = Number((event.target as HTMLInputElement).value)
  const hsv = { ...singleHsv.value }
  hsv[field] = field === 'h' ? value : value / 100
  emit('update-color', singleDetail.value.code, hsvToHex(hsv.h, hsv.s, hsv.v), undefined)
}

const editingName = ref(false)
const nameDraft = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)
function startNameEdit() {
  if (!singleDetail.value) return
  nameDraft.value = singleDetail.value.name ?? ''
  editingName.value = true
  nextTick(() => nameInputRef.value?.focus())
}
function cancelNameEdit() { editingName.value = false }
function saveName() {
  if (!singleDetail.value) return
  emit('update-color', singleDetail.value.code, singleDetail.value.hex, nameDraft.value.trim())
  editingName.value = false
}

const highlightOn = computed(() => !!singleDetail.value && props.highlightCode === singleDetail.value.code)
function toggleHighlight() {
  if (!singleDetail.value) return
  emit('update:highlight-code', highlightOn.value ? null : singleDetail.value.code)
}
watch(selectedCodes, () => {
  if (!singleDetail.value && props.highlightCode) emit('update:highlight-code', null)
  editingName.value = false
}, { deep: true })

const replaceTarget = ref<PixelCode | null>(null)
const replaceInput = ref('')
function startReplace() {
  if (!singleDetail.value) return
  replaceTarget.value = singleDetail.value.code
  replaceInput.value = ''
}
function cancelReplace() {
  replaceTarget.value = null
  replaceInput.value = ''
}
function resolveReplacement(newCode: PixelCode) {
  const from = replaceTarget.value
  if (!from || newCode === from) return
  emit('remove-color', from, newCode)
  emit('select-color', newCode)
  closeDrawer()
}
function onReplaceInputEnter() {
  const code = replaceInput.value.trim()
  if (code === TRANSPARENT_CODE || code in props.palette) resolveReplacement(code)
}
function onPick(hex: string) {
  const lower = hex.toLowerCase()
  if (replaceTarget.value) {
    const existing = Object.keys(props.palette).find((code) => props.palette[code].hex.toLowerCase() === lower)
    if (existing) resolveReplacement(existing)
    else {
      const from = replaceTarget.value
      emit('replace-color-hex', from, lower)
      closeDrawer()
    }
    return
  }
  emit('pick-color', lower)
}
function onDelete() {
  if (!singleDetail.value) return
  emit('remove-color', singleDetail.value.code, TRANSPARENT_CODE)
  closeDrawer()
}

const multiAdjustment = ref<HsvAdjustment>({ hue: 0, saturation: 0, brightness: 0 })
const hasMultiAdjustment = computed(() => multiAdjustment.value.hue !== 0 || multiAdjustment.value.saturation !== 0 || multiAdjustment.value.brightness !== 0)
function signed(value: number): string { return value > 0 ? `+${value}` : String(value) }
function applyMultiAdjustment() {
  if (!hasMultiAdjustment.value || selectedCodes.value.length < 2) return
  emit('adjust-colors', [...selectedCodes.value], { ...multiAdjustment.value })
  multiAdjustment.value = { hue: 0, saturation: 0, brightness: 0 }
}
function averageSelected() {
  if (selectedCodes.value.length < 2) return
  emit('average-colors', [...selectedCodes.value])
  selectedCodes.value = selectedCodes.value.slice(0, 1)
}
</script>

<style scoped>
.pixel-palette { display: flex; flex-direction: column; min-height: 0; overflow: visible; }
.pixel-palette__board { flex: none; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.pixel-palette__cards { flex: 1; min-height: 0; overflow-y: auto; padding-top: 24px; }
.pixel-palette__grid { display: grid; grid-template-columns: repeat(auto-fill, 34px); grid-auto-rows: 34px; justify-content: start; gap: 4px; padding: 0 12px 12px; }
.pixel-swatch { position: relative; width: 34px; height: 34px; border-radius: 5px; border: 2px solid var(--ps-border-strong); cursor: pointer; padding: 0; }
.pixel-swatch--active { border-color: var(--ps-accent-active-border); box-shadow: inset 0 0 0 2px var(--ps-bg-panel); }
.pixel-swatch--paint::after { content: ''; position: absolute; inset: -4px; border: 1px solid var(--ps-accent-active-border); border-radius: 7px; pointer-events: none; }
.pixel-swatch--transparent { background-color: var(--ps-checker-a); background-image: linear-gradient(45deg,var(--ps-checker-b) 25%,transparent 25%),linear-gradient(-45deg,var(--ps-checker-b) 25%,transparent 25%); background-size: 8px 8px; }
.pixel-swatch__tooltip { position: absolute; left: 50%; bottom: calc(100% + 4px); transform: translateX(-50%); white-space: nowrap; font-size: 10px; line-height: 1.4; padding: 2px 6px; border-radius: 4px; color: #fff; background: rgba(0,0,0,.75); opacity: 0; pointer-events: none; transition: opacity .1s; z-index: 5; }
.pixel-swatch:hover .pixel-swatch__tooltip { opacity: 1; }
.pixel-palette__empty { margin: 8px 16px; color: var(--ps-text-weak); font-size: 12px; line-height: 1.5; }
.pixel-palette__drawer { position: absolute; z-index: 12; right: 100%; top: 0; bottom: 0; width: 310px; box-sizing: border-box; padding: 16px; overflow-y: auto; border-left: 1px solid var(--ps-border); border-top: 1px solid var(--ps-border); border-bottom: 1px solid var(--ps-border); background: var(--ps-bg-panel); display: flex; flex-direction: column; gap: 12px; }
.pixel-palette__drawer-head { display: flex; align-items: flex-start; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--ps-border); }
.pixel-palette__drawer-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.pixel-palette__detail-swatch { width: 26px; height: 26px; border-radius: 5px; border: 1px solid var(--ps-border-strong); flex: none; }
.pixel-palette__name-trigger { min-width: 0; padding: 2px 4px; border: 1px solid transparent; background: transparent; color: var(--ps-accent-strong-text); font: inherit; font-weight: 700; cursor: text; text-align: left; }
.pixel-palette__name-trigger:hover { border-color: var(--ps-border-strong); background: var(--ps-bg-control); }
.pixel-palette__code-note { color: var(--ps-text-weak); font-family: Consolas,monospace; font-size: 11px; }
.pixel-palette__name-editor { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr auto auto; gap: 5px; }
.pixel-palette__name-editor input { min-width: 0; }
.pixel-palette__detail-close { border: 0; background: transparent; color: var(--ps-text-weak); font-size: 18px; cursor: pointer; }
.pixel-palette__selection-preview { display: flex; margin-left: auto; }
.pixel-palette__selection-preview i { width: 13px; height: 24px; border: 1px solid var(--ps-bg-panel); }
.pixel-palette__detail-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.pixel-palette__color-input { width: 28px; height: 28px; padding: 0; border: 0; background: transparent; }
.pixel-palette__hex-input { width: 86px; font-family: Consolas,monospace; }
.pixel-palette__muted { color: var(--ps-text-secondary); font-size: 12px; line-height: 1.5; }
.pixel-palette__hsv-group { display: flex; flex-direction: column; gap: 10px; padding: 10px; border-radius: 8px; background: var(--ps-bg-control); }
.pixel-palette__hsv-group label { display: grid; grid-template-columns: 76px 1fr 42px; align-items: center; gap: 6px; font-size: 12px; }
.pixel-palette__hsv-group input { min-width: 0; }
.pixel-palette__hsv-group output { text-align: right; color: var(--ps-text-secondary); font-family: Consolas,monospace; }
.pixel-palette__highlight-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.pixel-palette__replace-section { display: flex; flex-direction: column; gap: 7px; padding: 10px; border: 1px solid var(--ps-accent-active-border); border-radius: 8px; background: var(--ps-accent-active-bg); color: var(--ps-accent-active-text); font-size: 12px; }
.pixel-palette__replace-row { display: flex; gap: 6px; }
.pixel-palette__replace-row input { width: 62px; font-family: Consolas,monospace; }
.pixel-palette__detail-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 4px; }
.pixel-palette__detail-actions--stack { flex-direction: column; }
.pixel-palette__detail-actions button,.pixel-palette__name-editor button,.pixel-palette__replace-row button { padding: 5px 10px; border: 1px solid var(--ps-border-strong); border-radius: 5px; background: var(--ps-bg-control); color: var(--ps-text); cursor: pointer; }
.pixel-palette__detail-actions button:disabled { opacity: .45; cursor: not-allowed; }
.pixel-palette__detail-actions .pixel-palette__delete { color: var(--ps-danger); border-color: var(--ps-danger); background: transparent; }
.pixel-palette__primary { color: var(--ps-accent-active-text) !important; border-color: var(--ps-accent-active-border) !important; background: var(--ps-accent-active-bg) !important; }
</style>
