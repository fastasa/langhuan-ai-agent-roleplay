<!--
  components/app/XingyiDockHeader.vue

  星依浮坞标题栏共享壳：星星状态灯 + 名称 + 状态文字。
  组件只接收 status，并统一计算文案与配色。
-->
<template>
  <div class="xingyi-dock-header">
    <XingyiStarIcon class="xingyi-dock-header__star" :class="`xy-star--${status}`" />
    <span class="xingyi-dock-header__name">{{ nameText }}</span>
    <span class="xingyi-dock-header__status" :class="`xingyi-dock-header__status--${status}`">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { XingyiGlobalStatus } from '../../app/xingyiGlobalStatus'
import XingyiStarIcon from './XingyiStarIcon.vue'

const props = defineProps<{
  status: XingyiGlobalStatus
  name?: string
  statusLabel?: string
}>()

const { t } = useI18n()
const nameText = computed(() => String(props.name || '').trim() || t('xingyi.title'))
const statusText = computed(() => String(props.statusLabel || '').trim() || t(`xingyi.status${props.status.charAt(0).toUpperCase()}${props.status.slice(1)}`))
</script>

<style scoped>
.xingyi-dock-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

/* 2026-07-16：XingyiStarIcon 改画像素风五角星后，星体在自身 40 视窗里只占约 55%，同样容器下星体
   视觉尺寸明显缩水、描边也因此细到接近不可见——标题栏把它当「紧凑状态灯」用，在此补偿：加粗描边 +
   隐藏三根放射光线（那是给 58px 桌宠状态星的呼吸光效设计的，紧凑场景下只是几根细毛刺）+ 关掉
   crispEdges 像素级渲染（同一份补偿此前在 XingyiDock.vue 内对头部/任务面板/活动提示/空状态四处
   星星统一处理，本组件只搬出「头部」这一份，其余三处仍留在 XingyiDock.vue 自己维护）。 */
.xingyi-dock-header__star {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  shape-rendering: auto;
}

.xingyi-dock-header__star :deep(.xingyi-star-icon__rays) {
  display: none;
}

.xingyi-dock-header__star :deep(.xingyi-star-icon__outline) {
  stroke-width: 3;
}

.xingyi-dock-header__name {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--morandi-text, #333);
}

.xingyi-dock-header__status {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  color: var(--morandi-text-light, #999);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xingyi-dock-header__status--running { color: #b07d1e; }
.xingyi-dock-header__status--waiting { color: #a8842a; }
.xingyi-dock-header__status--error { color: var(--morandi-danger, #C0665A); }
.xingyi-dock-header__status--success { color: var(--morandi-accent, #5C8A5C); }
</style>
