<template>
  <MobilePaperSurface class="mobile-surface">
    <slot />
  </MobilePaperSurface>
</template>

<script setup lang="ts">
import MobilePaperSurface from './MobilePaperSurface.vue'
</script>

<style src="./mobileWorkspaceTokens.css"></style>

<style scoped>
.mobile-surface {
  isolation: isolate;
}
</style>
