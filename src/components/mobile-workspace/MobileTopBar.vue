<template>
  <header class="mobile-top-bar" :class="`mobile-top-bar--${variant}`">
    <button
      v-if="showBack"
      type="button"
      class="mobile-top-bar__back"
      :aria-label="$t('common.back')"
      @click="$emit('back')"
    >
      <MobileLineIcon name="chevron-left" :size="24" :stroke-width="1.8" />
    </button>

    <span v-if="$slots.leading" class="mobile-top-bar__leading">
      <slot name="leading" />
    </span>

    <div class="mobile-top-bar__title-block">
      <p v-if="crumb" class="mobile-top-bar__crumb">{{ crumb }}</p>
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="mobile-top-bar__subtitle">{{ subtitle }}</p>
    </div>

    <div class="mobile-top-bar__actions">
      <slot name="actions" />
      <button
        v-if="actionLabel"
        type="button"
        class="mobile-top-bar__action"
        @click="$emit('primary')"
      >
        <MobileLineIcon :name="actionIcon" :size="15" :stroke-width="2" />
        <span>{{ actionLabel }}</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import MobileLineIcon from './MobileLineIcon.vue'
import type { MobileWorkspaceIconName } from './mobileWorkspaceTypes'

withDefaults(
  defineProps<{
    title: string
    crumb?: string
    subtitle?: string
    variant?: 'page' | 'detail'
    showBack?: boolean
    actionLabel?: string
    actionIcon?: MobileWorkspaceIconName
  }>(),
  {
    crumb: '',
    subtitle: '',
    variant: 'page',
    showBack: false,
    actionLabel: '',
    actionIcon: 'plus'
  }
)

defineEmits<{
  back: []
  primary: []
}>()
</script>

<style scoped>
.mobile-top-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
  /* 作为 grid/flex 项时允许收缩到容器宽度：否则 nowrap 标题/副标题的 min-content
     会把顶部栏撑得比视口宽，导致整页横向溢出被裁切 */
  min-width: 0;
}

.mobile-top-bar--page {
  padding: 2px 0 4px;
}

.mobile-top-bar--detail {
  padding: 2px 0 11px;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
}

/* 无边框返回箭头（对齐原型 34px 触控热区） */
.mobile-top-bar__back {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  margin-left: -6px;
}

.mobile-top-bar__leading {
  display: inline-flex;
  flex-shrink: 0;
}

.mobile-top-bar__title-block {
  min-width: 0;
  flex: 1;
}

.mobile-top-bar__crumb {
  margin: 0 0 1px;
  overflow: hidden;
  color: var(--lhm-accent, #5c8a5c);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-top-bar__subtitle {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-top-bar h1 {
  margin: 0;
  overflow: hidden;
  color: var(--lhm-text, #333);
  letter-spacing: -0.01em;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-top-bar--page h1 {
  font-size: 28px;
  font-weight: 700;
}

.mobile-top-bar--detail h1 {
  font-size: 16.5px;
  font-weight: 600;
}

.mobile-top-bar__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

/* 实心绿主按钮（新建 / 新建会话） */
.mobile-top-bar__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--lhm-accent, #5c8a5c);
  border-radius: 8px;
  background: var(--lhm-accent, #5c8a5c);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  padding: 7px 13px;
  -webkit-tap-highlight-color: transparent;
}
</style>
