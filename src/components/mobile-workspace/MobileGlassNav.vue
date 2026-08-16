<template>
  <div class="mobile-glass-nav" :aria-label="$t('mobile.nav.aria')">
    <nav class="mobile-glass-nav__pill">
      <span class="mobile-glass-nav__blur" aria-hidden="true" />
      <span class="mobile-glass-nav__edge" aria-hidden="true" />
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="mobile-glass-nav__item"
        :class="{ 'mobile-glass-nav__item--active': item.id === activeItem }"
        :aria-current="item.id === activeItem ? 'page' : undefined"
        :disabled="item.disabled"
        @click="selectItem(item.id)"
      >
        <span v-if="item.id === activeItem" class="mobile-glass-nav__glow" aria-hidden="true" />
        <MobileLineIcon
          class="mobile-glass-nav__icon"
          :name="item.icon"
          :size="21"
          :stroke-width="item.id === activeItem ? 2 : 1.75"
        />
        <span class="mobile-glass-nav__label">{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import MobileLineIcon from './MobileLineIcon.vue'
import type { MobileGlassNavItem } from './mobileWorkspaceTypes'

defineProps<{
  items: MobileGlassNavItem[]
  activeItem: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

function selectItem(id: string) {
  emit('select', id)
}
</script>

<style scoped>
/* 悬浮容器：浮在内容之上、水平居中、贴近底部安全区，本身不挡触控 */
.mobile-glass-nav {
  position: fixed;
  z-index: 40;
  right: 0;
  left: 0;
  bottom: max(24px, env(safe-area-inset-bottom, 24px));
  display: flex;
  justify-content: center;
  pointer-events: none;
}

/* 液态玻璃胶囊本体 */
.mobile-glass-nav__pill {
  position: relative;
  display: inline-flex;
  gap: 2px;
  overflow: hidden;
  border-radius: 999px;
  padding: 5px;
  pointer-events: auto;
  box-shadow:
    0 2px 8px rgba(56, 46, 38, 0.12),
    0 16px 34px rgba(56, 46, 38, 0.15);
}

/* 毛玻璃模糊层 */
.mobile-glass-nav__blur {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.52);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

/* 玻璃高光边框层 */
.mobile-glass-nav__edge {
  position: absolute;
  inset: 0;
  border: 0.5px solid rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  box-shadow:
    inset 1.5px 1.5px 1px rgba(255, 255, 255, 0.78),
    inset -1px -1px 1px rgba(255, 255, 255, 0.4);
}

.mobile-glass-nav__item {
  position: relative;
  display: flex;
  min-width: 58px;
  height: 50px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.5px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  padding: 0 12px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-glass-nav__item:disabled {
  cursor: default;
  opacity: 0.42;
}

/* 选中项绿色高光底 */
.mobile-glass-nav__glow {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(92, 138, 92, 0.15);
  box-shadow: inset 1px 1px 1px rgba(255, 255, 255, 0.45);
}

.mobile-glass-nav__icon,
.mobile-glass-nav__label {
  position: relative;
}

.mobile-glass-nav__label {
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}

.mobile-glass-nav__item--active {
  color: var(--lhm-accent, #5c8a5c);
}

.mobile-glass-nav__item--active .mobile-glass-nav__label {
  font-weight: 600;
}

/* 暗色玻璃 */
[data-theme='dark'] .mobile-glass-nav__pill {
  box-shadow:
    0 2px 10px rgba(0, 0, 0, 0.4),
    0 16px 36px rgba(0, 0, 0, 0.34);
}

[data-theme='dark'] .mobile-glass-nav__blur {
  background: rgba(46, 43, 39, 0.58);
}

[data-theme='dark'] .mobile-glass-nav__edge {
  border-color: rgba(255, 255, 255, 0.13);
  box-shadow:
    inset 1.5px 1.5px 1px rgba(255, 255, 255, 0.13),
    inset -1px -1px 1px rgba(255, 255, 255, 0.05);
}

[data-theme='dark'] .mobile-glass-nav__item {
  color: rgba(231, 226, 216, 0.6);
}

[data-theme='dark'] .mobile-glass-nav__glow {
  background: rgba(92, 138, 92, 0.3);
}
</style>
