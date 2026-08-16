<template>
  <div
    v-if="state.fullscreenImage.value"
    style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); display: flex; justify-content: center; align-items: center; z-index: 20000; cursor: pointer;"
    @click="state.fullscreenImage.value = null"
  >
    <img :src="state.fullscreenImage.value" alt="查看大图" style="max-width: 90%; max-height: 90%; object-fit: contain;" @click.stop>
  </div>
</template>

<script setup lang="ts">
import type { createFullscreenModalState } from '../../../../composables/app/modalState/createFullscreenModalState'

type FullscreenModalState = ReturnType<typeof createFullscreenModalState>

defineProps<{ state: FullscreenModalState }>()
</script>
