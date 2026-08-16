<template>
  <span
    class="three-body"
    :style="motionStyle"
    aria-hidden="true"
  >
    <span class="three-body__dot"></span>
    <span class="three-body__dot"></span>
    <span class="three-body__dot"></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  size?: number | string
  speed?: string
  color?: string
}>(), {
  size: 26,
  speed: '0.8s',
  color: ''
})

const formatCssSize = (value: number | string) => typeof value === 'number' ? `${value}px` : value

const motionStyle = computed(() => ({
  '--uib-size': formatCssSize(props.size),
  '--uib-speed': props.speed,
  '--uib-color': props.color || 'color-mix(in srgb, var(--morandi-text-light) 76%, var(--morandi-primary))'
}))
</script>

<style scoped>
.three-body {
  position: relative;
  display: inline-block;
  height: var(--uib-size);
  width: var(--uib-size);
  animation: three-body-spin calc(var(--uib-speed) * 2.5) infinite linear;
  color: var(--uib-color);
  flex: 0 0 auto;
}

.three-body__dot {
  position: absolute;
  height: 100%;
  width: 30%;
}

.three-body__dot::after {
  content: "";
  position: absolute;
  height: 0;
  width: 100%;
  padding-bottom: 100%;
  background-color: var(--uib-color);
  border-radius: 50%;
}

.three-body__dot:nth-child(1) {
  bottom: 5%;
  left: 0;
  transform: rotate(60deg);
  transform-origin: 50% 85%;
}

.three-body__dot:nth-child(1)::after {
  bottom: 0;
  left: 0;
  animation: three-body-wobble-1 var(--uib-speed) infinite ease-in-out;
  animation-delay: calc(var(--uib-speed) * -0.3);
}

.three-body__dot:nth-child(2) {
  bottom: 5%;
  right: 0;
  transform: rotate(-60deg);
  transform-origin: 50% 85%;
}

.three-body__dot:nth-child(2)::after {
  bottom: 0;
  left: 0;
  animation: three-body-wobble-1 var(--uib-speed) infinite calc(var(--uib-speed) * -0.15) ease-in-out;
}

.three-body__dot:nth-child(3) {
  bottom: -5%;
  left: 0;
  transform: translateX(116.666%);
}

.three-body__dot:nth-child(3)::after {
  top: 0;
  left: 0;
  animation: three-body-wobble-2 var(--uib-speed) infinite ease-in-out;
}

@keyframes three-body-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes three-body-wobble-1 {
  0%,
  100% {
    transform: translateY(0%) scale(1);
    opacity: 1;
  }

  50% {
    transform: translateY(-66%) scale(0.65);
    opacity: 0.8;
  }
}

@keyframes three-body-wobble-2 {
  0%,
  100% {
    transform: translateY(0%) scale(1);
    opacity: 1;
  }

  50% {
    transform: translateY(66%) scale(0.65);
    opacity: 0.8;
  }
}
</style>
