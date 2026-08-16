<template>
  <img
    class="langhuan-icon"
    :style="iconStyle"
    :src="langhuanIconSvg"
    :alt="title"
    draggable="false"
    :aria-hidden="title ? undefined : 'true'"
  >
</template>

<script setup lang="ts">
import { computed } from 'vue'
import langhuanIconSvg from '../../assets/langhuan-icon.svg'

const props = withDefaults(defineProps<{
  size?: number | string
  color?: string
  strokeScale?: number | string
  title?: string
}>(), {
  size: '',
  color: 'currentColor',
  strokeScale: 1,
  title: ''
})

const formatCssSize = (value: number | string) => {
  return typeof value === 'number' ? `${value}px` : value
}

const iconStyle = computed(() => {
  const style: Record<string, string> = {
    color: props.color
  }
  if (props.size !== '') {
    style.width = formatCssSize(props.size)
    style.height = formatCssSize(props.size)
  }
  return style
})
</script>

<style scoped>
.langhuan-icon {
  display: inline-block;
  flex: 0 0 auto;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
</style>
