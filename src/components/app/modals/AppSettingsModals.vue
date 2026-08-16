<template>
  <AppFormDialog
    :open="state.showCharGroupManager.value"
    :title="`管理${state.viewModel.charGroupTypeLabel}分组`"
    subtitle="新增、删除组别，并调整组内成员。移出成员只会回到默认分组。"
    size="xl"
    height-preset="tall"
    @cancel="state.actions.cancelEditCharGroup(); state.showCharGroupManager.value = false"
  >
      <div class="char-group-manager-layout">
        <aside class="char-group-list-panel">
          <div class="char-group-panel-head">
            <span>组别</span>
            <button type="button" class="char-group-text-button" @click="state.actions.startNewCharGroup()">新增</button>
          </div>
          <button
            v-for="group in state.viewModel.characterGroups"
            :key="group.id"
            type="button"
            class="char-group-list-item"
            :class="{ active: state.viewModel.charGroupEditForm.id === group.id }"
            @click="state.actions.startEditCharGroup(group)"
          >
            <span class="char-group-list-name">{{ group.name }}</span>
            <span class="char-group-list-count">{{ getGroupMemberCount(group.id) }}</span>
          </button>
          <div v-if="state.viewModel.characterGroups.length === 0" class="char-group-empty">还没有自定义分组</div>
        </aside>

        <section class="char-group-edit-panel">
          <div class="char-group-panel-head">
            <span>{{ state.viewModel.charGroupEditForm.id ? '编辑组别' : '新增组别' }}</span>
            <button
              v-if="state.viewModel.charGroupEditForm.id"
              type="button"
              class="char-group-text-button char-group-text-button--danger"
              @click="state.actions.deleteCharGroup(state.viewModel.charGroupEditForm.id)"
            >删除</button>
          </div>

          <div class="form-group">
            <label>组别名称</label>
            <input
              v-model="state.viewModel.charGroupEditForm.name"
              class="char-group-input"
              placeholder="输入组别名称"
            >
          </div>

          <div class="char-group-member-columns">
            <div class="char-group-member-column">
              <div class="char-group-member-title">组内成员</div>
              <div class="char-group-member-list">
                <button
                  v-for="item in selectedGroupMembers"
                  :key="`selected-${item.id}`"
                  type="button"
                  class="char-group-member-item selected"
                  @click="removeGroupMember(item.id)"
                >
                  <span class="char-group-member-face">{{ getGroupMemberFace(item) }}</span>
                  <span class="char-group-member-copy">
                    <span class="char-group-member-name">{{ getGroupMemberName(item) }}</span>
                    <span class="char-group-member-meta">{{ getGroupMemberMeta(item) }}</span>
                  </span>
                  <span class="char-group-member-action">移出</span>
                </button>
                <div v-if="selectedGroupMembers.length === 0" class="char-group-member-empty">暂无成员</div>
              </div>
            </div>

            <div class="char-group-member-column">
              <div class="char-group-member-title">可添加角色</div>
              <div class="char-group-member-list">
                <button
                  v-for="item in availableGroupMembers"
                  :key="`available-${item.id}`"
                  type="button"
                  class="char-group-member-item"
                  @click="addGroupMember(item.id)"
                >
                  <span class="char-group-member-face">{{ getGroupMemberFace(item) }}</span>
                  <span class="char-group-member-copy">
                    <span class="char-group-member-name">{{ getGroupMemberName(item) }}</span>
                    <span class="char-group-member-meta">{{ getGroupMemberMeta(item) }}</span>
                  </span>
                  <span class="char-group-member-action">添加</span>
                </button>
                <div v-if="availableGroupMembers.length === 0" class="char-group-member-empty">没有可添加成员</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.actions.cancelEditCharGroup(); state.showCharGroupManager.value = false">取消</button>
        <button class="btn btn-primary" @click="saveCharGroup()" :disabled="!state.viewModel.charGroupEditForm.name.trim()">
          {{ state.viewModel.charGroupEditForm.id ? '保存组别' : '创建组别' }}
        </button>
      </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppFormDialog from '../../common/AppFormDialog.vue'
import type { createSettingsModalState } from '../../../composables/app/modalState/createSettingsModalState'
import type { NamedEntity } from '../../../types/panelContracts'

type SettingsModalState = ReturnType<typeof createSettingsModalState>
type CharacterGroupMember = NamedEntity & { groupId?: string; group_id?: string; group?: string }

const props = defineProps<{ state: SettingsModalState }>()

const selectedGroupMembers = computed(() => {
  const selectedIds = new Set(getSelectedGroupMemberIds())
  return props.state.viewModel.charGroupSelectableItems.filter((item: CharacterGroupMember) => selectedIds.has(item.id))
})

const availableGroupMembers = computed(() => {
  const selectedIds = new Set(getSelectedGroupMemberIds())
  return props.state.viewModel.charGroupSelectableItems.filter((item: CharacterGroupMember) => !selectedIds.has(item.id))
})

function getSelectedGroupMemberIds() {
  return Array.isArray(props.state.viewModel.charGroupEditForm.memberIds)
    ? props.state.viewModel.charGroupEditForm.memberIds.map((item: string) => String(item || '').trim()).filter(Boolean)
    : []
}

function getGroupMemberMeta(character: CharacterGroupMember) {
  const groupId = String(character?.groupId ?? character?.group_id ?? character?.group ?? '').trim()
  if (!groupId || groupId === 'default') return '当前在默认分组'
  const currentGroup = props.state.viewModel.characterGroups.find((item: NamedEntity) => item.id === groupId)
  return currentGroup ? `当前在 ${currentGroup.name}` : '当前未分组'
}

function getGroupMemberName(item: CharacterGroupMember) {
  return String(item?.name || '').trim() || '未命名'
}

function getGroupMemberFace(item: CharacterGroupMember) {
  return String((item as { emoji?: string }).emoji || '').trim() || '人'
}

function getGroupMemberCount(groupId: string) {
  return props.state.viewModel.getItemsByGroup(groupId).length
}

function addGroupMember(memberId: string) {
  if (getSelectedGroupMemberIds().includes(memberId)) return
  props.state.actions.toggleCharGroupMember(memberId)
}

function removeGroupMember(memberId: string) {
  if (!getSelectedGroupMemberIds().includes(memberId)) return
  props.state.actions.toggleCharGroupMember(memberId)
}

function saveCharGroup() {
  if (props.state.viewModel.charGroupEditForm.id) {
    props.state.actions.saveCharGroupEdit()
    return
  }
  props.state.actions.addNewCharGroup()
}
</script>

<style scoped>
.char-group-dialog-tip {
  margin-bottom: 12px;
  font-size: 0.85rem;
  color: var(--morandi-text-light);
}

.char-group-manager-layout {
  display: grid;
  grid-template-columns: minmax(180px, 0.34fr) minmax(0, 1fr);
  gap: 18px;
  min-height: 520px;
}

.char-group-list-panel,
.char-group-edit-panel {
  min-width: 0;
}

.char-group-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--morandi-text);
}

.char-group-text-button {
  border: 0;
  background: transparent;
  color: var(--morandi-accent);
  font-size: 0.82rem;
  cursor: pointer;
  padding: 3px 4px;
}

.char-group-text-button:hover,
.char-group-text-button:focus-visible {
  color: var(--morandi-text);
}

.char-group-text-button--danger {
  color: var(--morandi-danger);
}

.char-group-list-panel {
  border-right: 1px solid var(--morandi-border);
  padding-right: 12px;
}

.char-group-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
}

.char-group-list-item:hover,
.char-group-list-item.active {
  border-color: rgba(139, 115, 85, 0.22);
  background: rgba(139, 115, 85, 0.08);
}

.char-group-list-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-group-list-count {
  color: var(--morandi-text-light);
  font-size: 0.78rem;
}

.char-group-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
}

.char-group-member-columns {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(360px, 1.35fr);
  gap: 16px;
}

.char-group-member-title {
  margin-bottom: 6px;
  font-size: 0.82rem;
  color: var(--morandi-text-light);
}

.char-group-member-list {
  height: 360px;
  max-height: min(46vh, 420px);
  overflow-y: auto;
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  padding: 8px;
  background: var(--morandi-soft-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.char-group-member-item {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 9px 11px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--morandi-card);
  width: 100%;
  text-align: left;
}

.char-group-member-item:hover {
  background: rgba(139, 115, 85, 0.08);
}

.char-group-member-item.selected {
  border-color: rgba(139, 115, 85, 0.28);
  background: rgba(139, 115, 85, 0.08);
}

.char-group-member-face {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(130, 153, 135, 0.08);
  font-size: 1rem;
  line-height: 1;
}

.char-group-member-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.char-group-member-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--morandi-text);
  font-size: 0.94rem;
  font-weight: 600;
}

.char-group-member-meta {
  font-size: 0.75rem;
  color: var(--morandi-text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-group-member-action {
  color: var(--morandi-accent);
  font-size: 0.78rem;
  white-space: nowrap;
}

.char-group-member-empty {
  padding: 16px 10px;
  color: var(--morandi-text-light);
  font-size: 0.84rem;
  text-align: center;
}

.char-group-empty {
  padding: 16px 12px;
  border: 1px dashed var(--morandi-border);
  border-radius: 10px;
  background: var(--morandi-card);
}

@media (max-width: 768px) {
  .char-group-manager-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .char-group-list-panel {
    border-right: 0;
    border-bottom: 1px solid var(--morandi-border);
    padding-right: 0;
    padding-bottom: 12px;
  }

  .char-group-member-columns {
    grid-template-columns: 1fr;
  }

  .char-group-member-list {
    height: auto;
    max-height: 260px;
  }
}
</style>
