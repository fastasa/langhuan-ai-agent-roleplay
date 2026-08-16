<template>
  <div class="selection-action-bar" role="toolbar" aria-label="选区快捷工具" @pointerdown.stop @click.stop>
    <div v-if="adjustMode" class="selection-action-bar__popover" @keydown.esc.stop.prevent="adjustMode = null">
      <label class="selection-action-bar__label" for="selection-adjust-pixels">
        {{ adjustMode === 'grow' ? '扩展' : '收缩' }}像素
      </label>
      <input
        id="selection-adjust-pixels"
        ref="amountInputEl"
        v-model.number="amount"
        class="selection-action-bar__input"
        type="number"
        min="1"
        :max="maxAmount"
        step="1"
        @keydown.enter.stop.prevent="submitAdjust"
      >
      <button type="button" class="selection-action-bar__confirm" @click="submitAdjust">确定</button>
    </div>

    <button type="button" class="selection-action-bar__button" title="取消选择" aria-label="取消选择" @click="run('clear')">
      <PixelIcon name="selection-clear" />
    </button>
    <button type="button" class="selection-action-bar__button" title="反向选择" aria-label="反向选择" @click="run('invert')">
      <PixelIcon name="selection-invert" />
    </button>
    <span class="selection-action-bar__separator" />
    <button type="button" class="selection-action-bar__button" title="扩展选区" aria-label="扩展选区" @click="openAdjust('grow')">
      <PixelIcon name="maximize-2" />
    </button>
    <button type="button" class="selection-action-bar__button" title="收缩选区" aria-label="收缩选区" @click="openAdjust('shrink')">
      <PixelIcon name="minimize-2" />
    </button>
    <span class="selection-action-bar__separator" />
    <button type="button" class="selection-action-bar__button" title="清除选区内像素" aria-label="清除选区内像素" @click="run('delete-inside')">
      <PixelIcon name="trash-2" />
    </button>
    <button type="button" class="selection-action-bar__button" title="清除选区外像素" aria-label="清除选区外像素" @click="run('delete-outside')">
      <PixelIcon name="selection-delete-outside" />
    </button>
    <span class="selection-action-bar__separator" />
    <button type="button" class="selection-action-bar__button" title="用当前颜色填充选区" aria-label="用当前颜色填充选区" @click="run('fill')">
      <PixelIcon name="paint-bucket" />
      <i class="selection-action-bar__color" :class="{ 'selection-action-bar__color--transparent': !currentHex }" :style="currentHex ? { background: currentHex } : undefined" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import PixelIcon from './PixelIcon.vue'

type ImmediateAction = 'clear' | 'invert' | 'delete-inside' | 'delete-outside' | 'fill'
type AdjustMode = 'grow' | 'shrink'

const props = defineProps<{
  currentHex: string | null
  maxAmount: number
}>()
const emit = defineEmits<{
  (e: 'action', action: ImmediateAction): void
  (e: 'adjust', mode: AdjustMode, amount: number): void
}>()

const adjustMode = ref<AdjustMode | null>(null)
const amount = ref(1)
const amountInputEl = ref<HTMLInputElement | null>(null)

function run(action: ImmediateAction) {
  adjustMode.value = null
  emit('action', action)
}

function openAdjust(mode: AdjustMode) {
  adjustMode.value = adjustMode.value === mode ? null : mode
  amount.value = Math.min(Math.max(1, amount.value), props.maxAmount)
  if (adjustMode.value) nextTick(() => amountInputEl.value?.select())
}

function submitAdjust() {
  if (!adjustMode.value) return
  const normalized = Math.min(props.maxAmount, Math.max(1, Math.floor(Number(amount.value) || 1)))
  amount.value = normalized
  emit('adjust', adjustMode.value, normalized)
  adjustMode.value = null
}
</script>

<style scoped>
.selection-action-bar {
  position: absolute;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 3px 5px;
  box-sizing: border-box;
  border: 1px solid var(--ps-selection-toolbar-border);
  border-radius: 3px;
  background: var(--ps-selection-toolbar-bg);
  color: var(--ps-selection-toolbar-text);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
}
.selection-action-bar__button {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.selection-action-bar__button:hover,
.selection-action-bar__button:focus-visible {
  outline: none;
  background: var(--ps-selection-toolbar-hover);
}
.selection-action-bar__button:active { transform: translateY(1px); }
.selection-action-bar__button svg { width: 17px; height: 17px; }
.selection-action-bar__separator { width: 1px; height: 20px; margin: 0 2px; background: var(--ps-selection-toolbar-border); }
.selection-action-bar__color {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 7px;
  height: 7px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.8);
}
.selection-action-bar__color--transparent {
  background: linear-gradient(135deg, #eee 0 42%, #d45b5b 43% 57%, #eee 58% 100%);
}
.selection-action-bar__popover {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid var(--ps-border-strong);
  border-radius: 3px;
  background: var(--ps-bg-panel);
  color: var(--ps-text);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
}
.selection-action-bar__label { font-size: 11px; color: var(--ps-text-secondary); }
.selection-action-bar__input {
  width: 54px;
  height: 26px;
  box-sizing: border-box;
  border: 1px solid var(--ps-border-strong);
  border-radius: 3px;
  background: var(--ps-bg-control);
  color: var(--ps-text);
  text-align: center;
}
.selection-action-bar__confirm {
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 3px;
  background: var(--ps-accent-bg);
  color: var(--ps-accent-text);
  cursor: pointer;
}
</style>
