<template>
  <Transition name="mobile-toast">
    <div v-if="message" class="mobile-toast" role="status" aria-live="polite">
      {{ message }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<style scoped>
.mobile-toast {
  position: fixed;
  z-index: 90;
  left: 50%;
  bottom: max(92px, calc(env(safe-area-inset-bottom, 0px) + 92px));
  max-width: min(78vw, 320px);
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 72%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--morandi-card, #fffdf8) 92%, transparent);
  box-shadow: 0 6px 20px rgba(56, 46, 38, 0.12);
  color: var(--morandi-text, #333);
  font-size: 0.82rem;
  line-height: 1.45;
  padding: 8px 12px;
  text-align: center;
  backdrop-filter: blur(14px);
}

.mobile-toast-enter-active,
.mobile-toast-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.mobile-toast-enter-from,
.mobile-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
