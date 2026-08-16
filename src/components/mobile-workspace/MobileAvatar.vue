<template>
  <span
    class="mobile-avatar"
    :class="{ 'mobile-avatar--ring': ring }"
    :style="avatarStyle"
    aria-hidden="true"
  >
    <img v-if="src" class="mobile-avatar__img" :src="src" alt="">
    <slot v-else>{{ label }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string
    size?: number
    color?: string
    src?: string
    ring?: boolean
  }>(),
  {
    label: '',
    size: 38,
    color: 'var(--lhm-av-brown, #8b7355)',
    src: '',
    ring: false
  }
)

const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: props.color,
  fontSize: `${Math.round(props.size * 0.4)}px`
}))
</script>

<style scoped>
.mobile-avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  box-sizing: border-box;
  color: #fff;
  font-family: 'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans SC', -apple-system, sans-serif;
  font-weight: 600;
  line-height: 1;
}

.mobile-avatar--ring {
  border: 2px solid #fbfaf7;
}

.mobile-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
