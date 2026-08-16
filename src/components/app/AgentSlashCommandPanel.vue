<template>
  <div class="agent-slash-command-panel">
    <div v-if="title" class="agent-slash-command-panel__title">{{ title }}</div>
    <div v-if="loading" class="agent-slash-command-panel__empty">{{ loadingText }}</div>
    <template v-else>
      <template v-for="(item, index) in items" :key="item.id">
        <div
          v-if="item.deletable"
          class="agent-slash-command-panel__item agent-slash-command-panel__row"
          :class="{ 'is-active': index === selectedIndex }"
          @mouseenter="selectIndex(index)"
        >
          <button
            type="button"
            class="agent-slash-command-panel__main"
            @mousedown.prevent
            @click="emit('select', index)"
          >
            <span class="agent-slash-command-panel__name">{{ item.label }}</span>
            <span class="agent-slash-command-panel__meta">{{ item.description }}</span>
          </button>
          <button
            type="button"
            class="agent-slash-command-panel__delete"
            :title="deleteLabel"
            :aria-label="deleteLabel"
            @mousedown.prevent
            @click.stop="emit('delete', index)"
          >✕</button>
        </div>
        <button
          v-else
          type="button"
          class="agent-slash-command-panel__item"
          :class="{ 'is-active': index === selectedIndex }"
          @mousedown.prevent
          @mouseenter="selectIndex(index)"
          @click="emit('select', index)"
        >
          <span class="agent-slash-command-panel__name">{{ item.label }}</span>
          <span class="agent-slash-command-panel__description">{{ item.description }}</span>
        </button>
      </template>
      <div v-if="!items.length" class="agent-slash-command-panel__empty">{{ emptyText }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface AgentSlashCommandPanelItem {
  id: string
  label: string
  description: string
  deletable?: boolean
}

const props = withDefaults(defineProps<{
  items: AgentSlashCommandPanelItem[]
  selectedIndex: number
  title?: string
  loading?: boolean
  loadingText?: string
  emptyText?: string
  deleteLabel?: string
}>(), {
  title: '',
  loading: false,
  loadingText: '',
  emptyText: '',
  deleteLabel: ''
})

const emit = defineEmits<{
  (event: 'update:selectedIndex', value: number): void
  (event: 'select', index: number): void
  (event: 'delete', index: number): void
  (event: 'close'): void
}>()

function normalizedIndex(index: number): number {
  if (!props.items.length) return 0
  return Math.min(Math.max(index, 0), props.items.length - 1)
}

function selectIndex(index: number): void {
  emit('update:selectedIndex', normalizedIndex(index))
}

/** 斜杠菜单唯一键盘入口：所有 Agent 宿主都把 textarea 的 keydown 原样交给这里。 */
function handleKeydown(event: KeyboardEvent): boolean {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return true
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!props.items.length) return false
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const current = normalizedIndex(props.selectedIndex)
    emit('update:selectedIndex', (current + delta + props.items.length) % props.items.length)
    return true
  }

  if (
    event.key === 'Enter'
    && !event.shiftKey
    && !event.ctrlKey
    && !event.altKey
    && !event.metaKey
  ) {
    // 面板打开但没有匹配项时也必须吞掉回车，避免把命令错字发给模型。
    event.preventDefault()
    if (props.items.length) emit('select', normalizedIndex(props.selectedIndex))
    return true
  }

  return false
}

defineExpose({ handleKeydown })
</script>

<style scoped>
.agent-slash-command-panel {
  position: absolute;
  z-index: 18;
  left: 10px;
  right: 10px;
  bottom: calc(100% + 4px);
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 8px;
  background: var(--morandi-card, #fffdf8);
  box-shadow: 0 -4px 16px rgb(0 0 0 / 8%);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--morandi-text-light, #666) 38%, transparent) transparent;
}

.agent-slash-command-panel__title {
  padding: 4px 8px 2px;
  color: var(--morandi-text-light, #666);
  font-size: 11px;
}

.agent-slash-command-panel__item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text, #333);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.agent-slash-command-panel__item.is-active {
  background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 12%, transparent);
}

.agent-slash-command-panel__item:hover,
.agent-slash-command-panel__item:focus-visible,
.agent-slash-command-panel__main:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 12%, transparent);
}

.agent-slash-command-panel__row {
  align-items: center;
  gap: 4px;
  padding: 0;
}

.agent-slash-command-panel__main {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.agent-slash-command-panel__delete {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light, #666);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.agent-slash-command-panel__delete:hover {
  background: color-mix(in srgb, var(--morandi-danger, #c0564f) 16%, transparent);
  color: var(--morandi-danger, #c0564f);
}

.agent-slash-command-panel__delete:focus-visible {
  outline: 1px solid var(--morandi-danger, #c0564f);
  outline-offset: 1px;
}

.agent-slash-command-panel__name {
  flex: 0 0 auto;
  max-width: 60%;
  overflow: hidden;
  color: var(--morandi-text, #333);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-slash-command-panel__description,
.agent-slash-command-panel__meta {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--morandi-text-light, #666);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-slash-command-panel__meta {
  flex: 0 0 auto;
  text-align: right;
}

.agent-slash-command-panel__empty {
  padding: 8px;
  color: var(--morandi-text-light, #666);
  font-size: 12px;
}

.agent-slash-command-panel::-webkit-scrollbar {
  width: 6px;
}

.agent-slash-command-panel::-webkit-scrollbar-track {
  background: transparent;
}

.agent-slash-command-panel::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: color-mix(in srgb, var(--morandi-text-light, #666) 38%, transparent);
}

.agent-slash-command-panel::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--morandi-text-light, #666) 58%, transparent);
}
</style>
