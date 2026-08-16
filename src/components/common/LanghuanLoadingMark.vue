<template>
  <span
    class="langhuan-loading-mark"
    :class="{ 'langhuan-loading-mark--error': error }"
    :style="markStyle"
    :aria-hidden="title ? undefined : 'true'"
    :aria-label="title || undefined"
    :role="title ? 'img' : undefined"
  >
    <LanghuanIcon
      class="langhuan-loading-mark__icon langhuan-loading-mark__icon--sharp"
      size="100%"
      color="currentColor"
      :stroke-scale="strokeScale"
    />
    <LanghuanIcon
      class="langhuan-loading-mark__icon langhuan-loading-mark__icon--blur"
      size="100%"
      color="currentColor"
      :stroke-scale="strokeScale"
    />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LanghuanIcon from './LanghuanIcon.vue'

const props = withDefaults(defineProps<{
  size?: number | string
  strokeScale?: number | string
  blurRestOpacity?: number | string
  blurPeakOpacity?: number | string
  title?: string
  error?: boolean
}>(), {
  size: '',
  strokeScale: 1,
  blurRestOpacity: 0.2,
  blurPeakOpacity: 0.5,
  title: '',
  error: false
})

const formatCssSize = (value: number | string) => {
  return typeof value === 'number' ? `${value}px` : value
}

const markStyle = computed(() => {
  const style: Record<string, string> = {
    '--langhuan-loading-blur-rest-opacity': String(props.blurRestOpacity),
    '--langhuan-loading-blur-peak-opacity': String(props.blurPeakOpacity)
  }
  if (props.size !== '') {
    const size = formatCssSize(props.size)
    style.width = size
    style.height = size
  }
  return style
})
</script>

<style scoped>
.langhuan-loading-mark {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 72px;
  height: 72px;
  color: currentColor;
  animation: langhuan-loading-drift 8s ease-in-out infinite;
  will-change: transform;
}

.langhuan-loading-mark__icon {
  grid-area: 1 / 1;
  display: block;
  width: 100%;
  height: 100%;
}

.langhuan-loading-mark__icon--sharp {
  animation: langhuan-loading-sharp 8s ease-in-out infinite;
}

.langhuan-loading-mark__icon--blur {
  filter: blur(5px);
  animation: langhuan-loading-blur 8s ease-in-out infinite;
}

.langhuan-loading-mark--error,
.langhuan-loading-mark--error .langhuan-loading-mark__icon {
  animation: none;
}

.langhuan-loading-mark--error .langhuan-loading-mark__icon--sharp {
  opacity: 0.54;
}

.langhuan-loading-mark--error .langhuan-loading-mark__icon--blur {
  opacity: 0;
}

@keyframes langhuan-loading-sharp {
  0%,
  15.625%,
  31.25%,
  46.875%,
  62.5%,
  100% {
    opacity: 0.8;
  }

  7.8125%,
  23.4375%,
  39.0625%,
  54.6875% {
    opacity: 0.05;
  }
}

@keyframes langhuan-loading-blur {
  0%,
  15.625%,
  31.25%,
  46.875%,
  62.5%,
  100% {
    opacity: var(--langhuan-loading-blur-rest-opacity);
  }

  7.8125%,
  23.4375%,
  39.0625%,
  54.6875% {
    opacity: var(--langhuan-loading-blur-peak-opacity);
  }
}

@keyframes langhuan-loading-drift {
  0%,
  15.625%,
  31.25%,
  46.875%,
  62.5%,
  100% {
    transform: translateY(0) scale(1);
  }

  7.8125%,
  23.4375%,
  39.0625%,
  54.6875% {
    transform: translateY(2px) scale(0.99);
  }
}
</style>
