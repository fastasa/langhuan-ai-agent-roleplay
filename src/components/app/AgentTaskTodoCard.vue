<template>
  <section
    v-if="snapshot && snapshot.state !== 'completed' && snapshot.items.length"
    class="agent-task-todo"
    :class="{ 'agent-task-todo--expanded': expanded }"
    aria-label="当前任务进度"
  >
    <button
      v-if="!expanded"
      type="button"
      class="agent-task-todo__collapsed"
      :aria-label="`展开任务进度，已完成 ${completedCount}/${snapshot.items.length}`"
      :title="collapsedTitle"
      @click="expandManually"
    >
      <span>待办 {{ completedCount }}/{{ snapshot.items.length }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
    </button>

    <div v-else class="agent-task-todo__panel">
      <button
        type="button"
        class="agent-task-todo__head"
        aria-expanded="true"
        title="收起并停止自动弹出；再次手动展开后恢复自动弹出"
        @click="collapseManually"
      >
        <span class="agent-task-todo__title">当前待办</span>
        <span class="agent-task-todo__progress">{{ completedCount }}/{{ snapshot.items.length }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      <ol class="agent-task-todo__items">
        <li
          v-for="item in snapshot.items"
          :key="item.id"
          class="agent-task-todo__item"
          :class="`agent-task-todo__item--${item.status}`"
        >
          <span class="agent-task-todo__check" aria-hidden="true">
            <svg v-if="item.status === 'completed'" viewBox="0 0 20 20"><path d="m4 10 4 4 8-9" /></svg>
            <span v-else-if="item.status === 'in_progress'"></span>
          </span>
          <span class="agent-task-todo__copy">
            <span class="agent-task-todo__text">{{ item.text }}</span>
            <span class="agent-task-todo__acceptance">验收：{{ item.acceptance }}</span>
          </span>
        </li>
      </ol>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AgentTaskTodoSnapshot } from '../../app/agentRuntime/taskTodo'

const AUTO_EXPAND_STORAGE_KEY = 'langhuan.agentTaskTodo.autoExpand.v1'

const props = defineProps<{
  snapshot: AgentTaskTodoSnapshot | null
}>()

function readAutoExpandPreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(AUTO_EXPAND_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function persistAutoExpandPreference(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AUTO_EXPAND_STORAGE_KEY, String(value))
  } catch {
    // 本机存储不可用时只放弃跨刷新记忆，本次组件实例内的手动偏好仍然生效。
  }
}

const autoExpand = ref(readAutoExpandPreference())
const expanded = ref(false)
const completedCount = computed(() =>
  props.snapshot?.items.filter((item) => item.status === 'completed').length ?? 0
)
const collapsedTitle = computed(() => autoExpand.value
  ? '展开任务进度'
  : '展开任务进度，并恢复任务变化时自动弹出'
)

watch(
  () => props.snapshot
    ? `${props.snapshot.taskId}:${props.snapshot.revision}:${props.snapshot.state}`
    : '',
  () => {
    const snapshot = props.snapshot
    if (!snapshot?.items.length || snapshot.state === 'completed') {
      expanded.value = false
      return
    }
    if (autoExpand.value) expanded.value = true
  },
  { immediate: true }
)

function collapseManually(): void {
  expanded.value = false
  autoExpand.value = false
  persistAutoExpandPreference(false)
}

function expandManually(): void {
  expanded.value = true
  autoExpand.value = true
  persistAutoExpandPreference(true)
}
</script>

<style scoped>
.agent-task-todo {
  position: absolute;
  z-index: 1;
  left: 50%;
  /* 收起条只压入输入框 1px，保证静默模式仍有完整、可点击的恢复入口。 */
  bottom: calc(100% - 1px);
  width: 90%;
  max-width: 90%;
  min-width: 0;
  margin: 0;
  padding: 0;
  transform: translateX(-50%);
  color: var(--morandi-text);
  box-sizing: border-box;
  --agent-task-todo-olive: #7f7f4d;
}

.agent-task-todo--expanded {
  /* 展开卡继续沿用原有压边关系，底部藏进输入栏后面而不额外占布局高度。 */
  bottom: calc(100% - 11px);
}

.agent-task-todo__collapsed {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 20px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--agent-task-todo-olive) 72%, var(--morandi-border));
  border-radius: 7px 7px 2px 2px;
  background: var(--agent-task-todo-olive);
  color: #fffdf8;
  font: inherit;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 -1px 3px color-mix(in srgb, var(--morandi-shadow, #4b463d) 10%, transparent);
  opacity: 0.92;
}

.agent-task-todo__collapsed:hover {
  opacity: 1;
}

.agent-task-todo__head svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.agent-task-todo__collapsed svg {
  position: absolute;
  top: 50%;
  right: 10px;
  width: 12px;
  height: 12px;
  transform: translateY(-50%);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.agent-task-todo__panel {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 88%, transparent);
  border-radius: 9px 9px 3px 3px;
  background: color-mix(in srgb, var(--morandi-card) 96%, var(--morandi-surface));
  box-shadow: 0 -3px 10px color-mix(in srgb, var(--morandi-shadow, #4b463d) 11%, transparent);
}

.agent-task-todo__head {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 29px;
  gap: 7px;
  padding: 0 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
  background: transparent;
  color: var(--morandi-text);
  font: inherit;
  cursor: pointer;
}

.agent-task-todo__head:hover {
  background: color-mix(in srgb, var(--morandi-hover) 72%, transparent);
}

.agent-task-todo__title {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  font-size: 11.5px;
  font-weight: 600;
}

.agent-task-todo__progress {
  font-size: 10.5px;
  color: var(--agent-task-todo-olive);
}

.agent-task-todo__items {
  max-height: 172px;
  margin: 0;
  padding: 5px 9px 12px;
  list-style: none;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.agent-task-todo__item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 5px 2px;
}

.agent-task-todo__check {
  display: grid;
  flex: 0 0 17px;
  width: 17px;
  height: 17px;
  margin-top: 1px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--morandi-text-light) 54%, transparent);
  border-radius: 6px;
  box-sizing: border-box;
}

.agent-task-todo__check svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: var(--morandi-card);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.agent-task-todo__item--in_progress .agent-task-todo__check {
  border-color: var(--agent-task-todo-olive);
}

.agent-task-todo__item--in_progress .agent-task-todo__check span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--agent-task-todo-olive);
}

.agent-task-todo__item--completed .agent-task-todo__check {
  border-color: var(--agent-task-todo-olive);
  background: var(--agent-task-todo-olive);
}

.agent-task-todo__copy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.agent-task-todo__text {
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.agent-task-todo__acceptance {
  color: var(--morandi-text-light);
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.agent-task-todo__item--completed .agent-task-todo__text {
  color: var(--morandi-text-light);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.agent-task-todo__items::-webkit-scrollbar {
  width: 5px;
}

.agent-task-todo__items::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--agent-task-todo-olive) 38%, transparent);
}

</style>
