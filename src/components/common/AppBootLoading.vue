<template>
  <div class="app-boot-loading" aria-live="polite" aria-busy="true">
    <LanghuanLoadingMark
      class="app-boot-loading__icon"
      size="clamp(72px, 12vw, 108px)"
      :stroke-scale="0.95"
    />
  </div>
</template>

<script setup lang="ts">
import LanghuanLoadingMark from './LanghuanLoadingMark.vue'
</script>

<style scoped>
.app-boot-loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--morandi-bg);
  color: #4f6f58;
}

:global([data-theme="dark"] .app-boot-loading){
  color: #8fae96;
}

.app-boot-loading__icon {
  display: inline-grid;
}
</style>
