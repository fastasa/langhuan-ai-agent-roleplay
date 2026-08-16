<!--
  components/app/XingyiChatComposer.vue

  星依输入框共享组件，只负责「textarea 外观与自增高 + 发送/停止按钮外观与图标切换」；
  写权限圆点、图片附件条、斜杠命令面板这些业务专属元素仍由各自调用方持有；只有需要精确贴合
  文本输入字段宽度的任务 TODO 通过 task-todo 插槽投进定位壳，本组件不读取或修改其业务状态。

  停止能力是可选的：调用方保持 running=false 时按钮始终为发送态。
-->
<template>
  <div class="xingyi-chat-composer">
    <div class="xingyi-chat-composer__input-shell">
      <slot name="task-todo"></slot>
      <textarea
        ref="textareaEl"
        class="xingyi-chat-composer__input"
        :class="{ 'xingyi-chat-composer__input--resizable': resizable }"
        :rows="rows"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="handleInput"
        @keydown="(event) => emit('keydown', event)"
        @paste="(event) => emit('paste', event)"
      ></textarea>
    </div>
    <button
      type="button"
      class="xingyi-chat-composer__send"
      :class="{
        'xingyi-chat-composer__send--ready': sendReady,
        'xingyi-chat-composer__send--stop': running
      }"
      :title="running ? stopTitle : sendTitle"
      :aria-label="running ? stopTitle : sendTitle"
      :disabled="sendDisabled"
      @click="running ? emit('stop') : emit('submit')"
    >
      <svg v-if="running" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="1.5"/>
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>
        <path d="m21.854 2.147-10.94 10.939"/>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  /** 运行中可中断能力开关。 */
  running?: boolean
  /** textarea 是否禁止输入（一般=运行中/额度用尽/token 失效）。 */
  disabled?: boolean
  sendDisabled?: boolean
  /** 就绪辉光（有内容可发 + 非运行中）。 */
  sendReady?: boolean
  placeholder?: string
  rows?: number
  sendTitle?: string
  stopTitle?: string
  /** 是否允许手动拖拽垂直调高（默认 false，保持正式浮坞纯自增高不可拖）。 */
  resizable?: boolean
}>(), {
  running: false,
  disabled: false,
  sendDisabled: false,
  sendReady: false,
  placeholder: '',
  rows: 1,
  sendTitle: '',
  stopTitle: '',
  resizable: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'stop'): void
  (e: 'keydown', event: KeyboardEvent): void
  (e: 'paste', event: ClipboardEvent): void
}>()

const textareaEl = ref<HTMLTextAreaElement | null>(null)

/** 自增高：初始一行高，随内容长高到上限 140px 再内部滚动——与正式浮坞逐字节同源的行为，
 *  收进组件内部自理，调用方不需要各自再接一份 autoGrow + ResizeObserver。 */
function autoGrow() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`
}

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  nextTick(autoGrow)
}

// 程序性改 modelValue（发送后清空、/clear、恢复历史……）也要同步回弹高度。
watch(() => props.modelValue, () => { nextTick(autoGrow) })

// textareaEl 会随宿主的 Transition 重建（浮坞每次开窗都是新 DOM），watch 而非 onMounted 重新挂 observer。
let resizeObserver: ResizeObserver | null = null
watch(textareaEl, (el) => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => autoGrow())
  resizeObserver.observe(el)
}, { immediate: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

/** 暴露真实 textarea DOM 节点：调用方需要做「聚焦」「判断当前焦点是不是这个输入框」等场景
 *  （如全局快捷键守卫）时，不能只拿到本组件实例代理，要拿到原生元素本体。 */
defineExpose({
  textareaEl,
  focus: () => textareaEl.value?.focus()
})
</script>

<style scoped>
.xingyi-chat-composer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

.xingyi-chat-composer__input-shell {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.xingyi-chat-composer__input {
  position: relative;
  z-index: 2;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--morandi-text, #333);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  min-height: 36px;
  max-height: 140px;
  overflow-y: auto;
  scrollbar-width: none;
  box-sizing: border-box;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.xingyi-chat-composer__input::-webkit-scrollbar {
  display: none;
}

.xingyi-chat-composer__input:hover {
  background: var(--morandi-soft-bg, rgba(0, 0, 0, 0.04));
}

.xingyi-chat-composer__input:focus {
  outline: none;
  background: var(--morandi-card, #fffdf8);
  border-color: var(--morandi-accent, #5C8A5C);
}

.xingyi-chat-composer__input:disabled {
  background: var(--morandi-soft-bg-strong, rgba(0, 0, 0, 0.06));
  color: var(--morandi-text-light, #999);
  cursor: not-allowed;
}

/* resizable=true 的调用方需要手动拖拽调高；主浮坞不传该 prop 保持纯自增高。 */
.xingyi-chat-composer__input--resizable {
  resize: vertical;
}

.xingyi-chat-composer__send {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--morandi-text-light, #666);
  cursor: pointer;
}

.xingyi-chat-composer__send:hover:not(:disabled) {
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 40%, transparent);
  color: var(--morandi-accent, #5C8A5C);
}

/* 有内容待发送（2026-07-11 设计稿）：实底橄榄圆钮 + 就绪辉光（与聊天主发送键 lh-ready-glow 同语义） */
.xingyi-chat-composer__send--ready {
  color: #fff;
  background: var(--morandi-accent, #5C8A5C);
  animation: lh-ready-glow 3.2s ease-in-out infinite alternate;
}

.xingyi-chat-composer__send--ready:hover:not(:disabled) {
  color: #fff;
  background: var(--morandi-accent, #5C8A5C);
  filter: brightness(1.05);
}

/* 发送后原位切成停止键：尺寸不变，克制风险色只提示「这里可中断」。 */
.xingyi-chat-composer__send--stop {
  color: #fff;
  background: var(--morandi-danger, #C0665A);
}

.xingyi-chat-composer__send--stop:hover:not(:disabled) {
  color: #fff;
  background: color-mix(in srgb, var(--morandi-danger, #C0665A) 88%, #000);
}

.xingyi-chat-composer__send--stop svg {
  fill: currentColor;
  stroke: none;
}

.xingyi-chat-composer__send:disabled {
  opacity: 0.4;
  cursor: default;
}

.xingyi-chat-composer__send svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  .xingyi-chat-composer__send--ready {
    animation: none;
  }
}
</style>
