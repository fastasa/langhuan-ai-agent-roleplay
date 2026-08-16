<template>
  <!-- 「提调纠偏」抽屉条：藏在主输入框（.chat-input-area）身后，静止只露一条橄榄绿细边；
       鼠标移入上方命中区时整条上浮 30px 露出输入框与「提调」按钮（2026-06-22 按设计稿换皮；
       07-23 起输入框聚焦期间也维持上浮，避免输入触发布局重算或鼠标边界抖动时中途沉回、失焦）。
       功能不变：智能二选一（用户 2026-06-20）——带楼层号「角色3-5、旁白2 改委婉点」→ 按楼层精修；
       不带楼层号 → 把整段当纠偏，对上一轮导演决策流纠偏续跑（旧决策保留、新决策追加）。
       ⚠ 与移动端 MobileChatThread.vue 的 .mobile-tds-edit-bar 属于联动能力，外观若统一调整需同步那一处。
       ⚠ 「藏在身后」依赖主输入框 .chat-input-area 为不透明填充 + position/z-index（见 src/assets/main.css）。
       外层命中区 padding-top 改为动态（2026-07-12 用户拍板，用接近区换阅读空间）：静止 2px（连同绿边
       本体命中高度 10px，用户 07-12 调参），抬起时才随 .tds-tab-wrap.is-raised 长到 30px；07-13 再加
       只保留实际露出的绿边作为静止态命中区，禁止透明命中层覆盖末条消息操作按钮。 -->
  <div
    class="tds-tab-wrap"
    :class="{ 'is-raised': raised }"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <form
      class="tds-tab"
      :class="{ 'is-raised': raised }"
      @submit.prevent="submit"
      @click="focusInput"
    >
      <textarea
        ref="inputEl"
        v-model="text"
        class="tds-tab__input"
        rows="1"
        :disabled="disabled"
        :placeholder="props.placeholder || '输入消息，让提调修改聊天'"
        @focus="focused = true"
        @blur="focused = false"
        @keydown.enter.exact="handleTextareaKeydown"
      ></textarea>
      <button
        type="submit"
        class="tds-tab__send"
        :class="{ 'is-active': hasText }"
        :disabled="disabled || !hasText"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="21" y1="4" x2="14" y2="4"></line><line x1="10" y1="4" x2="3" y2="4"></line>
          <line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="20" x2="16" y2="20"></line><line x1="12" y1="20" x2="3" y2="20"></line>
          <line x1="14" y1="2" x2="14" y2="6"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="16" y1="18" x2="16" y2="22"></line>
        </svg>
        提调
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  /** 运行中（生成/精修中）置灰，避免并发触发。 */
  disabled?: boolean
  /** 占位提示（D6·群聊上下文特化）：群聊一轮多发言者，父级传带楼层提示的文案，引导按楼层精修指定角色；
   *  缺省=单聊改皮后的简洁文案。 */
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'submit', refsText: string): void
}>()

const text = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const hovering = ref(false)
const focused = ref(false)

// 输入稳定性优先（07-23 用户纠偏）：鼠标边界可能在 textarea 首次自动测高时短暂离开，
// 聚焦态必须继续托住抽屉；主动失焦后再交还 hover 控制收起。
const raised = computed(() => hovering.value || focused.value)
const hasText = computed(() => text.value.trim().length > 0)

// 文字超一行时整条向上长高容纳（用户 2026-06-23）：textarea 按 scrollHeight 自适应，封顶约 5 行后内部滚动；
// 绿条本体 min-height + 底部留白配合上浮量，保证长出来的行露在主输入框上方（见 style 注释）。
const MAX_INPUT_HEIGHT = 130

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
}

watch(text, () => {
  nextTick(autoResize)
})

function focusInput() {
  inputEl.value?.focus()
}

function submit() {
  if (props.disabled) return
  const value = text.value.trim()
  if (!value) return
  emit('submit', value)
  // 走完保留输入框本体（常驻），清掉草稿便于下一条指令；高度回落到单行。
  text.value = ''
  nextTick(autoResize)
}

// IME 选字确认回车守卫：composing 中放行原生行为，不把半拼文本当纠偏指令提交给提调（同 XingyiDock.vue 口径）。
function handleTextareaKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submit()
}
</script>

<style scoped>
/* 外层命中区：与主输入框同宽居中，靠负 margin 把自己「塞」到主输入框身后；
   padding-top 改为动态（2026-07-12 用户拍板，用接近区换阅读空间）：静止 2px（绿边 8px + 2px = 总命中
   高度 10px，用户 07-12 调参），随 .tds-tab-wrap.is-raised 抬起时才长到 30px 的透明鼠标接近区，
   配合上浮预留空间。 */
.tds-tab-wrap {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 55%;
  margin: 0 auto -40px;
  padding-top: 2px;
  transition: padding-top 0.26s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.tds-tab-wrap.is-raised {
  /* 30px 上浮预留 + 4px 上缘感应缓冲（用户 07-12 定稿：上浮后顶部留 4px 感应区，鼠标贴上边缘不至于一出界就沉回）。 */
  padding-top: 34px;
}
@media (prefers-reduced-motion: reduce) {
  .tds-tab-wrap {
    transition: none;
  }
}

.tds-tab {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  /* 单行静止高度=48px；文字超一行时随 textarea 向上长高。
     底部 12px 留白补足「与主输入框重叠 40 − 上浮 30 = 10px」的被盖高度，保证长出来的行上浮后完整可见。 */
  min-height: 48px;
  margin: 0 16px;
  padding: 6px 12px 12px 16px;
  box-sizing: border-box;
  background: #6e7c57;
  border-radius: 14px;
  box-shadow: 0 -2px 10px rgba(110, 124, 87, 0.18);
  /* 静止不下沉（用户 07-12 三轮调参定稿：可见绿边=48-40=8px）；命中区=2px 透明 padding+8px 绿边=10px。
     抬起 translateY(-30px)，露出量与被盖补偿（底部 12px 留白）口径不变。 */
  transform: translateY(0);
  transition: transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.26s ease;
  /* 与输入框同款米白 I 形光标，边缘空白处也保持一致。 */
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='16' viewBox='0 0 8 16'%3E%3Cpath d='M2 1H6M2 15H6M4 1V15' fill='none' stroke='%23f2ede4' stroke-width='1' stroke-linecap='round'/%3E%3C/svg%3E") 4 8, text;
  overflow: hidden;
}
.tds-tab.is-raised {
  transform: translateY(-30px);
  box-shadow: 0 8px 20px rgba(110, 124, 87, 0.26);
}

.tds-tab__input {
  flex: 1 1 auto;
  min-width: 0;
  /* 高度由 JS 按 scrollHeight 自适应（autoResize）；单行 26px 起，封顶 130px(≈5 行)后内部滚动。 */
  min-height: 26px;
  max-height: 130px;
  border: none;
  outline: none;
  background: transparent;
  color: #f2ede4;
  caret-color: #f2ede4;
  /* 文字整体下移 1px（用户 2026-06-22）。 */
  padding-top: 1px;
  /* 米白 I 形鼠标光标：默认黑色 I 形在橄榄绿底上太暗看不清，换成米白自绘光标（热点居中 6 12）。 */
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='16' viewBox='0 0 8 16'%3E%3Cpath d='M2 1H6M2 15H6M4 1V15' fill='none' stroke='%23f2ede4' stroke-width='1' stroke-linecap='round'/%3E%3C/svg%3E") 4 8, text;
  font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", -apple-system, sans-serif;
  font-size: 13px;
  line-height: 26px;
  /* 字距松一点，别挤在一起（用户 2026-06-22）。 */
  letter-spacing: 1px;
  resize: none;
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.tds-tab__input::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
/* 夜间：main.css 的全局 [data-theme="dark"] textarea 规则会用 !important 强刷 #2a2825 底，
   把这条橄榄绿条中间刷成黑色块（2026-07-12 真机反馈）。这里用更高特指度恢复透明底奶油字；
   移动端联动件 MobileChatThread.vue 的 .mobile-tds-bar__input 有同款覆盖，改动需同步。
   ⚠️scoped 块里 :global 必须包住整条选择器；「:global(前缀) 后代」形式会被本仓编译器吃掉后代变哑弹。 */
:global([data-theme="dark"] .tds-tab__input) {
  background: transparent !important;
  color: #f2ede4 !important;
}
.tds-tab__input::placeholder {
  color: rgba(242, 237, 228, 0.6);
}
.tds-tab__input:disabled {
  cursor: not-allowed;
}

.tds-tab__send {
  flex: none;
  /* 绿条长高时按钮始终垂直居中（textarea 仍顶对齐，不跟着居中）。 */
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 9px;
  border: 1px solid rgba(242, 237, 228, 0.28);
  border-radius: 7px;
  background: rgba(242, 237, 228, 0.16);
  color: #f2ede4;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
/* 有字时高亮（实心浅色 + 深橄榄字），与设计稿一致。 */
.tds-tab__send.is-active:not(:disabled) {
  background: #f2ede4;
  color: #525e43;
  border-color: #f2ede4;
}
.tds-tab__send:disabled {
  cursor: not-allowed;
}

/* 移动端窄屏：跟随主输入框（main.css 同断点）左偏布局，保持对齐；负 margin 仍由基础规则保留。 */
@media (max-width: 768px) {
  .tds-tab-wrap {
    width: calc(100% - 68px);
    margin-left: 56px;
    margin-right: 8px;
  }
  .tds-tab {
    margin: 0 8px;
  }
}
</style>
