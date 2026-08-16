<template>
  <!-- Weather icons use Lucide's ISC-licensed line-icon geometry, kept local to avoid adding a new runtime dependency. -->
  <svg
    class="weather-line-icon"
    :style="iconStyle"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'moon'">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </template>
    <template v-else-if="name === 'cloud-sun'">
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 1 0-4.585-4.585" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </template>
    <template v-else-if="name === 'cloud-moon'">
      <path d="M12 3a6 6 0 0 0 6 9 8 8 0 1 1-6-9Z" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </template>
    <template v-else-if="name === 'cloud'">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </template>
    <template v-else-if="name === 'cloud-drizzle'">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      <path d="M8 19v1" />
      <path d="M8 14v1" />
      <path d="M16 19v1" />
      <path d="M16 14v1" />
      <path d="M12 21v1" />
      <path d="M12 16v1" />
    </template>
    <template v-else-if="name === 'cloud-rain'">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      <path d="M16 14v6" />
      <path d="M8 14v6" />
      <path d="M12 16v6" />
    </template>
    <template v-else-if="name === 'cloud-snow'">
      <path d="M17.5 17H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      <path d="M8 21h.01" />
      <path d="M8 17h.01" />
      <path d="M12 19h.01" />
      <path d="M12 23h.01" />
      <path d="M16 21h.01" />
      <path d="M16 17h.01" />
    </template>
    <template v-else-if="name === 'cloud-fog'">
      <path d="M17.5 17H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      <path d="M5 20h14" />
      <path d="M7 23h10" />
    </template>
    <template v-else-if="name === 'cloud-lightning'">
      <path d="M17.5 17H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      <path d="m13 14-2 4h3l-2 4" />
    </template>
    <template v-else-if="name === 'wind'">
      <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
      <path d="M17.5 8.2A2.5 2.5 0 1 1 19 12H2" />
      <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
    </template>
    <template v-else-if="name === 'tornado'">
      <path d="M21 4H3" />
      <path d="M18 8H6" />
      <path d="M19 12H9" />
      <path d="M16 16h-6" />
      <path d="M11 20H9" />
    </template>
    <template v-else-if="name === 'thermometer-sun'">
      <path d="M12 9a4 4 0 0 0-2 7.46" />
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </template>
    <template v-else-if="name === 'thermometer-snowflake'">
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
      <path d="m19 12-2 2" />
      <path d="m17 12 2 2" />
      <path d="M18 11v4" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WeatherIconName } from '../../utils/environmentFormat'

const props = withDefaults(
  defineProps<{
    name: WeatherIconName
    size?: number
    strokeWidth?: number
  }>(),
  {
    size: 16,
    strokeWidth: 1.8
  }
)

const iconStyle = computed(() => ({
  '--weather-line-icon-size': `${props.size}px`
}))
</script>

<style scoped>
.weather-line-icon {
  width: var(--weather-line-icon-size, 16px);
  height: var(--weather-line-icon-size, 16px);
  flex: 0 0 auto;
}
</style>
