<template>
  <div ref="menuBarEl" class="menu-bar">
    <div class="menu-bar__left">
      <div class="menu-bar__menus">
        <div v-for="menu in MENUS" :key="menu.id" class="menu-bar__menu-wrap">
          <button
            type="button"
            class="menu-bar__menu-btn"
            :class="{ 'menu-bar__menu-btn--open': openMenu === menu.id }"
            :disabled="interactionLocked && menu.id !== 'view'"
            @click="toggleMenu(menu.id)"
          >
            {{ menu.label }}
          </button>
          <div v-if="openMenu === menu.id" class="menu-bar__dropdown">
            <template v-for="(item, idx) in menu.items" :key="idx">
              <div v-if="item.type === 'divider'" class="menu-bar__divider" />
              <button
                v-else
                type="button"
                class="menu-bar__item"
                :disabled="item.disabled?.()"
                :title="item.hint"
                @click="runItem(item)"
              >
                <span class="menu-bar__item-check">
                  <PixelIcon v-if="item.icon" :name="item.icon" />
                  <template v-else>{{ item.checked?.() ? '✓' : '' }}</template>
                </span>
                <span class="menu-bar__item-label">{{ item.label }}</span>
                <span v-if="item.actionId" class="menu-bar__item-key">{{ label(item.actionId) }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>

      <div class="menu-bar__sep" />

      <div class="menu-bar__doc">
        <input
          ref="nameInputEl"
          class="menu-bar__name"
          type="text"
          :value="docName"
          :disabled="interactionLocked"
          @input="$emit('update:docName', ($event.target as HTMLInputElement).value)"
          @change="$emit('name-change')"
          @dblclick="onNameDblClick"
        />
        <span v-if="dirty" class="menu-bar__dirty-dot" title="有未保存的改动" />
        <span class="menu-bar__saved-at">{{ lastSavedLabel }}</span>
      </div>
    </div>

    <div class="menu-bar__right">
      <slot name="tool-context" />
      <button type="button" class="menu-bar__lib-btn" title="返回项目库" :disabled="interactionLocked" @click="$emit('open-library')">项目库</button>
      <button type="button" class="menu-bar__icon-btn" title="撤销" :disabled="interactionLocked || !canUndo" @click="$emit('edit-undo')">
        <PixelIcon name="undo-2" />
      </button>
      <button type="button" class="menu-bar__icon-btn" title="重做" :disabled="interactionLocked || !canRedo" @click="$emit('edit-redo')">
        <PixelIcon name="redo-2" />
      </button>
      <button type="button" class="menu-bar__save-btn" :disabled="interactionLocked || saveDisabled" @click="$emit('file-save')">{{ saveLabel }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { type KeymapState, type PixelActionId, chordToLabel, getEffectiveChord } from './keymap'
import type { PixelIconName } from './icons'
import PixelIcon from './PixelIcon.vue'

interface MenuItem {
  type?: 'item'
  label: string
  actionId?: PixelActionId
  icon?: PixelIconName
  hint?: string
  run: () => void
  checked?: () => boolean
  disabled?: () => boolean
}
interface MenuDivider {
  type: 'divider'
}
type MenuEntry = MenuItem | MenuDivider

const props = defineProps<{
  docName: string
  dirty: boolean
  lastSavedLabel: string
  canUndo: boolean
  canRedo: boolean
  saveLabel: string
  saveDisabled: boolean
  showGrid: boolean
  showCheckerboard: boolean
  showNavigator: boolean
  keymap: KeymapState
  interactionLocked?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:docName', name: string): void
  (e: 'name-change'): void
  (e: 'file-new'): void
  (e: 'file-open'): void
  (e: 'file-import'): void
  (e: 'file-export'): void
  (e: 'file-save'): void
  (e: 'edit-undo'): void
  (e: 'edit-redo'): void
  (e: 'open-color-adjust'): void
  (e: 'open-pixel-cleanup'): void
  (e: 'view-toggle-grid'): void
  (e: 'view-toggle-checkerboard'): void
  (e: 'view-toggle-navigator'): void
  (e: 'view-fit'): void
  (e: 'view-actual-size'): void
  (e: 'view-zoom-in'): void
  (e: 'view-zoom-out'): void
  (e: 'open-settings'): void
  (e: 'open-library'): void
}>()

const menuBarEl = ref<HTMLDivElement | null>(null)
const nameInputEl = ref<HTMLInputElement | null>(null)
const openMenu = ref<string | null>(null)

function label(actionId: PixelActionId): string {
  return chordToLabel(getEffectiveChord(props.keymap, actionId))
}

const MENUS: { id: string; label: string; items: MenuEntry[] }[] = [
  {
    id: 'file',
    label: '文件',
    items: [
      { label: '新建…', actionId: 'file.new', run: () => emit('file-new') },
      { label: '打开…', actionId: 'file.open', run: () => emit('file-open') },
      { type: 'divider' },
      { label: '导入图片量化…', actionId: 'file.import', run: () => emit('file-import') },
      { label: '导出 PNG…', actionId: 'file.export', run: () => emit('file-export') },
      { type: 'divider' },
      { label: '保存', actionId: 'file.save', run: () => emit('file-save') },
      { label: '重命名…', hint: '双击标题栏同效', run: () => focusRenameInput() }
    ]
  },
  {
    id: 'edit',
    label: '编辑',
    items: [
      { label: '撤销', actionId: 'edit.undo', run: () => emit('edit-undo'), disabled: () => !props.canUndo },
      { label: '重做', actionId: 'edit.redo', run: () => emit('edit-redo'), disabled: () => !props.canRedo },
      { type: 'divider' },
      { label: '色相 / 饱和度 / 明度…', actionId: 'color.adjust', run: () => emit('open-color-adjust') },
      { label: '去除杂色…', icon: 'wand-sparkles', actionId: 'pixel.cleanup', run: () => emit('open-pixel-cleanup') }
    ]
  },
  {
    id: 'view',
    label: '视图',
    items: [
      { label: '网格开关', actionId: 'view.toggleGrid', run: () => emit('view-toggle-grid'), checked: () => props.showGrid },
      { label: '棋盘底开关', run: () => emit('view-toggle-checkerboard'), checked: () => props.showCheckerboard },
      { label: '缩略图', run: () => emit('view-toggle-navigator'), checked: () => props.showNavigator },
      { type: 'divider' },
      { label: '适应窗口', actionId: 'view.fitWindow', run: () => emit('view-fit') },
      { label: '实际大小', actionId: 'view.actualSize', run: () => emit('view-actual-size') },
      { label: '放大', run: () => emit('view-zoom-in') },
      { label: '缩小', run: () => emit('view-zoom-out') }
    ]
  },
  {
    id: 'settings',
    label: '设置',
    items: [{ label: '工具与快捷键…', run: () => emit('open-settings') }]
  }
]

function toggleMenu(id: string) {
  openMenu.value = openMenu.value === id ? null : id
}
function runItem(item: MenuItem) {
  if (item.disabled?.()) return
  item.run()
  openMenu.value = null
}
function focusRenameInput() {
  nameInputEl.value?.focus()
  nameInputEl.value?.select()
}
function onNameDblClick(e: MouseEvent) {
  ;(e.target as HTMLInputElement).select()
}

// 点外关闭：菜单展开期间监听全局 mousedown，命中区域落在菜单栏之外就收起当前展开的下拉
function onDocumentMousedown(e: MouseEvent) {
  if (openMenu.value && menuBarEl.value && !menuBarEl.value.contains(e.target as Node)) {
    openMenu.value = null
  }
}
function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && openMenu.value) {
    openMenu.value = null
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
  document.removeEventListener('keydown', onDocumentKeydown)
})

defineExpose({ focusRenameInput })
</script>

<style scoped>
.menu-bar {
  /* 界面 90% 密度化（2026-07-19 用户拍板）：只缩 chrome 不缩画布区，七处 chrome 根同批联动（menu-bar/context-bar/tool-rail/status-bar/pixel-studio__side/pixel-dialog/project-library） */
  zoom: 0.9;
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--ps-bg-panel);
  border-bottom: 1px solid var(--ps-border);
}
.menu-bar__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.menu-bar__menus {
  display: flex;
  align-items: center;
}
.menu-bar__menu-wrap {
  position: relative;
}
.menu-bar__menu-btn {
  border: none;
  background: transparent;
  color: var(--ps-text-secondary);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.menu-bar__menu-btn:hover,
.menu-bar__menu-btn--open {
  background: var(--ps-bg-control);
  color: var(--ps-text);
}
.menu-bar__menu-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.menu-bar__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 220px;
  background: var(--ps-bg-panel);
  border: 1px solid var(--ps-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 4px;
  z-index: 50;
}
.menu-bar__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--ps-text);
  padding: 6px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}
.menu-bar__item:hover:not(:disabled) {
  background: var(--ps-bg-control);
}
.menu-bar__item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.menu-bar__item-check {
  width: 12px;
  color: var(--ps-accent-strong-text);
  flex: none;
}
.menu-bar__item-check svg { display: block; width: 12px; height: 12px; }
.menu-bar__item-label {
  flex: 1;
}
.menu-bar__item-key {
  color: var(--ps-text-weak);
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 11px;
}
.menu-bar__divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--ps-border);
}
.menu-bar__sep {
  width: 1px;
  height: 20px;
  background: var(--ps-border-strong);
}
.menu-bar__doc {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.menu-bar__name {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 13px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ps-text);
  padding: 4px 6px;
  border-radius: 4px;
  min-width: 100px;
  max-width: 220px;
}
.menu-bar__name:hover,
.menu-bar__name:focus {
  border-color: var(--ps-border-strong);
  background: var(--ps-bg-control);
}
.menu-bar__dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ps-accent-bg);
  flex: none;
}
.menu-bar__saved-at {
  font-size: 11px;
  color: var(--ps-text-weak);
  white-space: nowrap;
}
.menu-bar__right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: auto;
}
.menu-bar__lib-btn {
  border: 1px solid var(--ps-border-strong);
  border-radius: 6px;
  background: var(--ps-bg-control);
  color: var(--ps-text);
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
}
.menu-bar__lib-btn:hover {
  background: var(--ps-bg-panel);
}
.menu-bar__icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--ps-border-strong);
  background: var(--ps-bg-control);
  color: var(--ps-text);
  cursor: pointer;
}
.menu-bar__icon-btn svg {
  width: 16px;
  height: 16px;
}
.menu-bar__icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.menu-bar__save-btn {
  border: none;
  border-radius: 6px;
  background: var(--ps-save-bg);
  color: var(--ps-save-text);
  font-weight: 600;
  padding: 6px 16px;
  cursor: pointer;
}
.menu-bar__save-btn:hover:not(:disabled) {
  background: var(--ps-save-bg-hover);
}
.menu-bar__save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
