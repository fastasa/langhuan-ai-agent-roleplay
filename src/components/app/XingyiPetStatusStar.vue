<template>
  <Transition name="xingyi-pet-status-star" mode="out-in" :duration="{ enter: 620, leave: 480 }">
    <span
      v-if="visible"
      :key="colorGroup"
      class="xingyi-pet-status-star"
      :class="`xy-star--${status}`"
      :style="{ left, top }"
      aria-hidden="true"
    >
      <svg class="xingyi-pet-status-star__ray-field" viewBox="0 0 58 58" shape-rendering="crispEdges" aria-hidden="true">
        <line
          v-for="ray in PET_STATUS_RAYS"
          :key="ray.id"
          class="xingyi-pet-status-star__ray"
          x1="29"
          y1="9"
          x2="29"
          y2="2"
          :style="{
            '--xy-ray-angle': `${ray.angle}deg`,
            '--xy-ray-duration': `${ray.duration}s`,
            '--xy-ray-delay': `${ray.delay}s`,
            '--xy-ray-in': ray.inScale,
            '--xy-ray-out': ray.outScale,
          }"
        />
      </svg>
      <XingyiStarIcon class="xingyi-pet-status-star__icon" :class="`xy-star--${status}`" />
    </span>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { XingyiGlobalStatus } from '../../app/xingyiGlobalStatus'
import XingyiStarIcon from './XingyiStarIcon.vue'

type PetStatusRay = {
  id: string
  angle: number
  duration: number
  delay: number
  inScale: number
  outScale: number
}

/* 八根光线统一同一长度（`y2="-3"` 定死在模板上）、同一粗细、同一颜色（继承自父级 xy-star--running）；
   只靠角度错开、各自独立的时长/延迟/呼吸幅度制造错落感，不再用长短分档，避免观感突兀。 */
const PET_STATUS_RAYS: PetStatusRay[] = [
  { id: 'ray-0', angle: 0, duration: 2.35, delay: -0.18, inScale: 0.93, outScale: 1.04 },
  { id: 'ray-1', angle: 45, duration: 3.1, delay: -1.32, inScale: 0.94, outScale: 1.05 },
  { id: 'ray-2', angle: 90, duration: 2.7, delay: -0.74, inScale: 0.92, outScale: 1.03 },
  { id: 'ray-3', angle: 135, duration: 2.9, delay: -1.65, inScale: 0.95, outScale: 1.04 },
  { id: 'ray-4', angle: 180, duration: 3.45, delay: -0.44, inScale: 0.93, outScale: 1.05 },
  { id: 'ray-5', angle: 225, duration: 2.45, delay: -1.18, inScale: 0.94, outScale: 1.03 },
  { id: 'ray-6', angle: 270, duration: 3.2, delay: -0.92, inScale: 0.92, outScale: 1.04 },
  { id: 'ray-7', angle: 315, duration: 2.62, delay: -1.84, inScale: 0.95, outScale: 1.05 },
]

const props = defineProps<{
  /** 星依全局状态灯真值；idle 不渲染，其余四态各自换色。 */
  status: XingyiGlobalStatus
  /** 由桌宠宿主在一次出现时选定，驻留期间保持不变。 */
  left: string
  top: string
}>()

const visible = computed(() => props.status !== 'idle')
/* §4.2.1 第4条：待确认仍是黄色，不触发换色出入场——running/waiting 共用同一个 key，
   Transition 不会因为进/出确认卡而把星星整个退场再长出来，只是 class 换挡（class 仍按真实 status
   走，驱动旋转/描边等具体样式差异）。 */
const colorGroup = computed(() => (props.status === 'waiting' ? 'running' : props.status))
</script>

<style scoped>
.xingyi-pet-status-star {
  position: absolute;
  z-index: 2;
  width: 58px;
  height: 58px;
  margin: -29px 0 0 -29px;
  pointer-events: none;
}

.xingyi-pet-status-star__icon {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  transform: scale(0.85);
}

.xingyi-pet-status-star__ray-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
