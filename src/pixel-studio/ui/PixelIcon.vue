<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="sizeStyle"
  >
    <component :is="el.tag" v-for="(el, i) in PIXEL_ICONS[name]" :key="i" v-bind="el.attrs" />
  </svg>
</template>

<script setup lang="ts">
// 图标 svg 包装收敛：此前 ToolRail 与 MenuBar（撤销/重做）各自内联同一份 svg 外壳，这里统一成唯一入口。
// class/其余属性透传给根 <svg>（Vue 单根组件自动 fallthrough），尺寸仍优先由调用方 CSS 类控制。
import { computed } from 'vue'
import { PIXEL_ICONS, type PixelIconName } from './icons'

const props = defineProps<{
  name: PixelIconName
  /** 可选显式尺寸（数字按 px），不传则完全由外部 CSS 类控制 */
  size?: number | string
}>()

const sizeStyle = computed(() => {
  if (props.size === undefined) return undefined
  const v = typeof props.size === 'number' ? `${props.size}px` : props.size
  return { width: v, height: v }
})
</script>
