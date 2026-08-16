<template>
  <AppFormDialog
    :open="open"
    :title="$t('brain.trash.title')"
    :subtitle="$t('brain.trash.subtitle')"
    size="md"
    :submit-text="$t('common.close')"
    @cancel="$emit('close')"
    @submit="$emit('close')"
  >
    <div class="brain-trash-dialog">
      <div v-if="nodes.length" class="brain-trash-dialog__actions">
        <button type="button" class="brain-trash-dialog__button" @click="$emit('restore-all')">{{ $t('brain.trash.restoreAll') }}</button>
        <button type="button" class="brain-trash-dialog__button brain-trash-dialog__button--danger" @click="$emit('delete-all')">{{ $t('brain.trash.deleteAllForever') }}</button>
      </div>
      <div v-if="nodes.length" class="brain-trash-dialog__list">
        <div v-for="node in nodes" :key="node.id" class="brain-trash-dialog__item">
          <span>
            <strong>{{ node.title }}</strong>
            <small>{{ node.summary || $t('brain.trash.noSummary') }}</small>
          </span>
          <span class="brain-trash-dialog__item-actions">
            <button type="button" class="brain-trash-dialog__button" @click="$emit('restore', node.id)">{{ $t('brain.trash.restore') }}</button>
            <button type="button" class="brain-trash-dialog__button brain-trash-dialog__button--danger" @click="$emit('delete', node.id)">{{ $t('brain.trash.deleteForever') }}</button>
          </span>
        </div>
      </div>
      <p v-else class="brain-trash-dialog__empty">{{ $t('brain.trash.empty') }}</p>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import type { CharacterBrainNodeModel } from '../../types/characterBrain'
import AppFormDialog from '../common/AppFormDialog.vue'

defineProps<{
  open: boolean
  nodes: CharacterBrainNodeModel[]
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'restore', nodeId: string): void
  (e: 'restore-all'): void
  (e: 'delete', nodeId: string): void
  (e: 'delete-all'): void
}>()
</script>

<style scoped>
.brain-trash-dialog {
  display: grid;
  gap: 12px;
}

.brain-trash-dialog__actions,
.brain-trash-dialog__item,
.brain-trash-dialog__item-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brain-trash-dialog__list {
  display: grid;
  gap: 8px;
}

.brain-trash-dialog__item {
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
  padding: 10px 12px;
}

.brain-trash-dialog__item span:first-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.brain-trash-dialog__item small,
.brain-trash-dialog__empty {
  color: var(--morandi-text-light);
}

.brain-trash-dialog__button {
  min-height: 32px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-card);
  color: var(--morandi-text);
  padding: 0 10px;
  cursor: pointer;
}

.brain-trash-dialog__button--danger {
  color: var(--morandi-danger);
}
</style>
