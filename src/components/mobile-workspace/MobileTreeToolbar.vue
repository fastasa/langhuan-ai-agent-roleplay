<template>
  <div class="mobile-tree-toolbar" role="toolbar" :aria-label="toolbarAria">
    <button
      type="button"
      class="mobile-tree-toolbar__toggle"
      :aria-label="allExpanded ? $t('mobile.tree.collapseAll') : $t('mobile.tree.expandAll')"
      :disabled="!canToggleAll"
      @click="$emit('action', 'toggle-all')"
    >
      <MobileLineIcon :name="allExpanded ? 'chevrons-down-up' : 'chevrons-up-down'" :size="15" :stroke-width="1.9" />
      <span>{{ allExpanded ? $t('mobile.tree.collapseAll') : $t('mobile.tree.expandAll') }}</span>
    </button>

    <span class="mobile-tree-toolbar__spacer" />

    <button
      type="button"
      class="mobile-tree-toolbar__icon"
      :title="$t('mobile.tree.undo')"
      :aria-label="$t('mobile.tree.undo')"
      :disabled="!canUndo"
      @click="$emit('action', 'undo')"
    >
      <MobileLineIcon name="undo-2" :size="18" :stroke-width="1.8" />
    </button>
    <button
      type="button"
      class="mobile-tree-toolbar__icon"
      :title="$t('mobile.tree.redo')"
      :aria-label="$t('mobile.tree.redo')"
      :disabled="!canRedo"
      @click="$emit('action', 'redo')"
    >
      <MobileLineIcon class="mobile-tree-toolbar__flip" name="undo-2" :size="18" :stroke-width="1.8" />
    </button>
    <button
      v-if="canCreate"
      type="button"
      class="mobile-tree-toolbar__icon"
      :title="$t('common.create')"
      :aria-label="$t('common.create')"
      @click="$emit('action', 'create')"
    >
      <MobileLineIcon name="plus" :size="19" :stroke-width="1.8" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MobileLineIcon from './MobileLineIcon.vue'
import type { MobileTreeToolbarAction } from './mobileWorkspaceTypes'

const props = withDefaults(
  defineProps<{
    ariaLabel?: string
    canUndo?: boolean
    canRedo?: boolean
    canToggleAll?: boolean
    canCreate?: boolean
    allExpanded?: boolean
  }>(),
  {
    // 默认 '' → 用 i18n 兜底文案（withDefaults 里不能调 t）
    ariaLabel: '',
    canUndo: false,
    canRedo: false,
    canToggleAll: true,
    canCreate: true,
    allExpanded: false
  }
)

defineEmits<{
  action: [action: MobileTreeToolbarAction]
}>()

const { t } = useI18n()
const toolbarAria = computed(() => props.ariaLabel || t('mobile.tree.aria'))
</script>

<style scoped>
.mobile-tree-toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 0 8px;
}

.mobile-tree-toolbar__spacer {
  flex: 1;
}

.mobile-tree-toolbar__toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  padding: 5px 10px 5px 7px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-tree-toolbar__toggle :deep(.mobile-line-icon) {
  color: var(--lhm-text-muted, #999);
}

.mobile-tree-toolbar__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lhm-text-muted, #999);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mobile-tree-toolbar__flip {
  transform: scaleX(-1);
}

.mobile-tree-toolbar__toggle:disabled,
.mobile-tree-toolbar__icon:disabled {
  cursor: default;
  opacity: 0.42;
}
</style>
