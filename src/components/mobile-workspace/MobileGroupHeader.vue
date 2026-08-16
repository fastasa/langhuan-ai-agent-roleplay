<template>
  <button type="button" class="mobile-group-header" @click="$emit('toggle')">
    <MobileLineIcon
      class="mobile-group-header__chevron"
      :class="{ 'mobile-group-header__chevron--open': open }"
      name="chevron-right"
      :size="14"
      :stroke-width="2"
    />
    <span class="mobile-group-header__tick" aria-hidden="true" />
    <span class="mobile-group-header__label">{{ label }}</span>
    <span v-if="count != null" class="mobile-group-header__count">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
import MobileLineIcon from './MobileLineIcon.vue'

withDefaults(
  defineProps<{
    label: string
    count?: number | string | null
    open?: boolean
  }>(),
  {
    count: null,
    open: true
  }
)

defineEmits<{
  toggle: []
}>()
</script>

<style scoped>
.mobile-group-header {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 14px 4px 9px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.mobile-group-header__chevron {
  flex-shrink: 0;
  color: var(--lhm-text-muted, #999);
  transition: transform 0.16s ease;
}

.mobile-group-header__chevron--open {
  transform: rotate(90deg);
}

.mobile-group-header__tick {
  width: 3px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 1px;
  background: var(--lhm-primary, #8b7355);
}

.mobile-group-header__label {
  color: var(--lhm-text, #333);
  font-size: 14.5px;
  font-weight: 600;
}

.mobile-group-header__count {
  margin-left: auto;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
}
</style>
