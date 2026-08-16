<template>
  <!-- 多选操作胶囊：与 MobileGlassNav 同款液态玻璃，原位替换底部主导航胶囊（单层，绝不叠加） -->
  <div v-if="open" class="mobile-selection-bar" role="region" :aria-label="$t('mobile.selection.aria')">
    <div class="mobile-selection-bar__pill">
      <span class="mobile-selection-bar__blur" aria-hidden="true" />
      <span class="mobile-selection-bar__edge" aria-hidden="true" />
      <button
        type="button"
        class="mobile-selection-bar__close"
        :aria-label="$t('mobile.selection.exit')"
        @click="$emit('cancel')"
      >
        <MobileLineIcon name="x" :size="20" :stroke-width="1.9" />
      </button>
      <span class="mobile-selection-bar__count">{{ $t('mobile.selection.selectedCount', { count }) }}</span>
      <span class="mobile-selection-bar__sep" aria-hidden="true" />
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="mobile-selection-bar__action"
        :class="{ 'mobile-selection-bar__action--danger': action.danger }"
        :disabled="action.disabled"
        @click="$emit('action', action.id)"
      >
        <MobileLineIcon v-if="action.icon" :name="action.icon" :size="18" :stroke-width="1.8" />
        <span class="mobile-selection-bar__action-label">{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import MobileLineIcon from './MobileLineIcon.vue'
import type { MobileSelectionAction } from './mobileWorkspaceTypes'

defineProps<{
  open: boolean
  count: number
  actions: MobileSelectionAction[]
}>()

defineEmits<{
  cancel: []
  action: [actionId: string]
}>()
</script>

<style scoped>
/* 悬浮容器：与导航胶囊同位置、同居中、贴底部安全区 */
.mobile-selection-bar {
  position: fixed;
  z-index: 40;
  right: 0;
  left: 0;
  bottom: max(24px, env(safe-area-inset-bottom, 24px));
  display: flex;
  justify-content: center;
  padding: 0 10px;
  pointer-events: none;
}

/* 玻璃胶囊本体（毛玻璃 + 高光边框，与 MobileGlassNav 同款） */
.mobile-selection-bar__pill {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  overflow: hidden;
  border-radius: 999px;
  padding: 5px 7px;
  pointer-events: auto;
  box-shadow:
    0 2px 8px rgba(56, 46, 38, 0.12),
    0 16px 34px rgba(56, 46, 38, 0.15);
}

.mobile-selection-bar__blur {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.62);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.mobile-selection-bar__edge {
  position: absolute;
  inset: 0;
  border: 0.5px solid rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  box-shadow:
    inset 1.5px 1.5px 1px rgba(255, 255, 255, 0.78),
    inset -1px -1px 1px rgba(255, 255, 255, 0.4);
}

.mobile-selection-bar__close {
  position: relative;
  display: inline-flex;
  width: 38px;
  height: 50px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}

.mobile-selection-bar__count {
  position: relative;
  flex-shrink: 0;
  color: var(--lhm-text, #333);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  padding: 0 6px 0 1px;
}

.mobile-selection-bar__sep {
  position: relative;
  width: 1px;
  height: 24px;
  flex-shrink: 0;
  margin: 0 3px;
  background: rgba(120, 113, 98, 0.22);
}

/* 操作项：图标在上、文字在下，与导航项同尺寸节奏 */
.mobile-selection-bar__action {
  position: relative;
  display: inline-flex;
  min-width: 48px;
  height: 50px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  padding: 0 7px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-selection-bar__action-label {
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}

.mobile-selection-bar__action--danger {
  color: var(--lhm-danger, #c0665a);
}

.mobile-selection-bar__action:disabled {
  color: var(--lhm-text-faint, #b6b0a7);
  cursor: default;
  opacity: 0.42;
}

/* 暗色玻璃（对齐 MobileGlassNav 暗色规则） */
[data-theme='dark'] .mobile-selection-bar__pill {
  box-shadow:
    0 2px 10px rgba(0, 0, 0, 0.4),
    0 16px 36px rgba(0, 0, 0, 0.34);
}

[data-theme='dark'] .mobile-selection-bar__blur {
  background: rgba(46, 43, 39, 0.62);
}

[data-theme='dark'] .mobile-selection-bar__edge {
  border-color: rgba(255, 255, 255, 0.13);
  box-shadow:
    inset 1.5px 1.5px 1px rgba(255, 255, 255, 0.13),
    inset -1px -1px 1px rgba(255, 255, 255, 0.05);
}

[data-theme='dark'] .mobile-selection-bar__sep {
  background: rgba(255, 255, 255, 0.16);
}
</style>
