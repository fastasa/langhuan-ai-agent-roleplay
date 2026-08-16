<template>
  <div class="mobile-section-label">
    <span class="mobile-section-label__tick" aria-hidden="true" />
    <span class="mobile-section-label__text"><slot /></span>
  </div>
</template>

<style scoped>
.mobile-section-label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 4px 4px;
}

.mobile-section-label__tick {
  width: 3px;
  height: 13px;
  border-radius: 1px;
  background: var(--lhm-primary, #8b7355);
}

.mobile-section-label__text {
  color: var(--lhm-text-light, #666);
  font-size: 12.5px;
  font-weight: 600;
}
</style>
