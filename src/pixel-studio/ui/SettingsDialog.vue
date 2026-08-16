<template>
  <PixelDialog title="设置 · 工具与快捷键" width="560px" @close="$emit('close')">
    <div class="settings-group">
      <div class="settings-group__title">临时工具</div>
      <label class="settings-select-row">
        <span class="settings-row__label">长按 Alt 临时切换工具</span>
        <select v-model="temporaryToolDraft" class="settings-select">
          <option v-for="option in TOOL_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>

    <div v-for="group in groupEntries" :key="group.name" class="settings-group">
      <div class="settings-group__title">{{ group.name }}</div>
      <div v-for="def in group.defs" :key="def.id" class="settings-row" :class="{ 'settings-row--recording': recording === def.id }" @click="startRecording(def.id)">
        <span class="settings-row__label">{{ def.label }}</span>
        <span v-if="recording === def.id" class="settings-row__recording">按下新快捷键…（Esc 取消）</span>
        <span v-else class="settings-row__key" :class="{ 'settings-row__key--unbound': !effectiveChord(def.id) }">
          {{ chordToLabel(effectiveChord(def.id)) }}
        </span>
      </div>
    </div>

    <template #footer>
      <button type="button" @click="onResetDefaults">恢复默认</button>
      <button type="button" class="pixel-dialog__primary" @click="onSave">保存</button>
    </template>
  </PixelDialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  type KeymapState,
  type PixelActionId,
  actionsByGroup,
  chordFromEvent,
  chordToLabel,
  getEffectiveChord,
  rebindAction,
  resetToDefaults
} from './keymap'
import type { PixelToolKind } from './uiTypes'
import PixelDialog from './PixelDialog.vue'

const props = withDefaults(defineProps<{ keymap: KeymapState; temporaryTool?: PixelToolKind }>(), {
  temporaryTool: 'eyedropper'
})
const emit = defineEmits<{ (e: 'close'): void; (e: 'save', state: KeymapState, temporaryTool: PixelToolKind): void }>()

const TOOL_OPTIONS: Array<{ value: PixelToolKind; label: string }> = [
  { value: 'select', label: '选择' },
  { value: 'marquee', label: '矩形选区' },
  { value: 'lasso', label: '套索' },
  { value: 'brush', label: '笔刷' },
  { value: 'eraser', label: '橡皮' },
  { value: 'bucket', label: '油漆桶' },
  { value: 'line', label: '直线' },
  { value: 'rect', label: '矩形' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'eyedropper', label: '取色器' },
  { value: 'zoom', label: '放大镜' }
]

// 草稿态：弹窗内的所有改动先落在本地副本，点「保存」才回传父组件持久化，取消/关闭不影响当前生效键位
const draft = ref<KeymapState>({ ...props.keymap })
const temporaryToolDraft = ref<PixelToolKind>(props.temporaryTool)
const recording = ref<PixelActionId | null>(null)

const GROUP_ORDER = ['工具', '画布', '图层', '动画', '编辑'] as const
const groupEntries = GROUP_ORDER.map((name) => ({ name, defs: actionsByGroup()[name] }))

function effectiveChord(id: PixelActionId) {
  return getEffectiveChord(draft.value, id)
}

function startRecording(id: PixelActionId) {
  recording.value = id
}

// 修饰键单独按下（Shift/Ctrl/Alt/Meta）不构成有效组合，等真正的功能键按下才提交
const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

function onWindowKeydown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    recording.value = null
    return
  }
  if (MODIFIER_ONLY_KEYS.has(e.key)) return
  const chord = chordFromEvent(e)
  const { state } = rebindAction(draft.value, recording.value, chord)
  draft.value = state
  recording.value = null
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown, true))

function onResetDefaults() {
  draft.value = resetToDefaults()
  temporaryToolDraft.value = 'eyedropper'
  recording.value = null
}
function onSave() {
  emit('save', draft.value, temporaryToolDraft.value)
}
</script>

<style scoped>
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-group__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ps-text-secondary);
  padding: 6px 2px 2px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.settings-select-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 8px;
  font-size: 13px;
}
.settings-select {
  min-width: 132px;
  padding: 4px 7px;
  border: 1px solid var(--ps-border-strong);
  border-radius: 4px;
  color: var(--ps-text);
  background: var(--ps-bg-control);
}
.settings-row:hover {
  background: var(--ps-bg-control);
}
.settings-row--recording {
  background: var(--ps-accent-active-bg);
}
.settings-row__label {
  color: var(--ps-text);
}
.settings-row__key {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 12px;
  border-radius: 4px;
  padding: 2px 8px;
  background: var(--ps-bg-control);
  border: 1px solid var(--ps-border-strong);
  color: var(--ps-text);
}
.settings-row__key--unbound {
  color: var(--ps-danger);
  border-color: var(--ps-danger);
}
.settings-row__recording {
  font-size: 12px;
  color: var(--ps-accent-active-text);
}
</style>
