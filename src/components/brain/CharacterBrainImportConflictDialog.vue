<template>
  <AppFormDialog
    :open="open"
    :title="$t('brain.importConflict.title')"
    :subtitle="$t('brain.importConflict.subtitle')"
    size="md"
    :submit-text="$t('brain.importConflict.submit')"
    :submit-disabled="saving"
    @cancel="$emit('cancel')"
    @submit="submit"
  >
    <div class="brain-import-conflict">
      <label class="brain-import-conflict__global">
        <span>{{ $t('brain.importConflict.eachNext') }}</span>
        <select v-model="defaultAction" class="brain-import-conflict__select">
          <option value="skip">{{ $t('common.skip') }}</option>
          <option value="overwrite">{{ $t('brain.importConflict.overwrite') }}</option>
        </select>
      </label>
      <label
        v-for="conflict in conflicts"
        :key="conflict.draftTempId"
        class="brain-import-conflict__item"
      >
        <span>
          <strong>{{ conflict.title }}</strong>
          <small>{{ conflict.path }}</small>
        </span>
        <select v-model="actions[conflict.draftTempId]" class="brain-import-conflict__select">
          <option value="">{{ $t('brain.importConflict.followAll') }}</option>
          <option value="skip">{{ $t('common.skip') }}</option>
          <option value="overwrite">{{ $t('brain.importConflict.overwrite') }}</option>
        </select>
      </label>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { CharacterBrainImportConflict, CharacterBrainImportConflictAction } from '../../types/characterBrain'
import AppFormDialog from '../common/AppFormDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  conflicts: CharacterBrainImportConflict[]
  saving?: boolean
}>(), {
  saving: false
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'submit', payload: {
    defaultAction: CharacterBrainImportConflictAction
    actions: Record<string, CharacterBrainImportConflictAction>
  }): void
}>()

const defaultAction = ref<CharacterBrainImportConflictAction>('skip')
const actions = reactive<Record<string, CharacterBrainImportConflictAction | ''>>({})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    defaultAction.value = 'skip'
    Object.keys(actions).forEach((key) => delete actions[key])
  }
)

function submit() {
  const normalizedActions: Record<string, CharacterBrainImportConflictAction> = {}
  Object.entries(actions).forEach(([key, value]) => {
    if (value) normalizedActions[key] = value
  })
  emit('submit', {
    defaultAction: defaultAction.value,
    actions: normalizedActions
  })
}
</script>

<style scoped>
.brain-import-conflict {
  display: grid;
  gap: 10px;
}

.brain-import-conflict__global,
.brain-import-conflict__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brain-import-conflict__item {
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
  padding: 10px 12px;
}

.brain-import-conflict__item span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.brain-import-conflict__item small {
  color: var(--morandi-text-light);
  word-break: break-all;
}

.brain-import-conflict__select {
  min-height: 32px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text);
  padding: 0 8px;
}
</style>
