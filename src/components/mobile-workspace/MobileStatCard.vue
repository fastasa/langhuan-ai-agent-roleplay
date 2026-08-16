<template>
  <div class="mobile-stat-card">
    <div class="mobile-stat-card__hero">
      <div class="mobile-stat-card__total">{{ total }}</div>
      <div class="mobile-stat-card__total-label">{{ totalLabel }}</div>
    </div>
    <div class="mobile-stat-card__divider" aria-hidden="true" />
    <div class="mobile-stat-card__deltas">
      <div v-for="(delta, index) in deltas" :key="index" class="mobile-stat-card__delta">
        <div
          class="mobile-stat-card__delta-value"
          :class="`mobile-stat-card__delta-value--${isZero(delta.value) ? 'zero' : (delta.tone || 'default')}`"
        >
          {{ delta.value }}
        </div>
        <div class="mobile-stat-card__delta-label">{{ delta.label }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type StatDelta = {
  value: string | number
  label: string
  tone?: 'accent' | 'info' | 'gold' | 'default'
}

defineProps<{
  total: string | number
  totalLabel: string
  deltas: StatDelta[]
}>()

function isZero(value: string | number) {
  return String(value).trim() === '0'
}
</script>

<style scoped>
.mobile-stat-card {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 14px;
  background: var(--lhm-card, #fffdf8);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.mobile-stat-card__hero {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: center;
  padding: 15px 22px 15px 20px;
}

.mobile-stat-card__total {
  color: var(--lhm-text, #333);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}

.mobile-stat-card__total-label {
  margin-top: 7px;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mobile-stat-card__divider {
  width: 1px;
  margin: 14px 0;
  background: var(--lhm-border-line, #e5e5e5);
}

.mobile-stat-card__deltas {
  display: flex;
  flex: 1;
}

.mobile-stat-card__delta {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.mobile-stat-card__delta-value {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
}

.mobile-stat-card__delta-value--default {
  color: var(--lhm-text, #333);
}

.mobile-stat-card__delta-value--accent {
  color: var(--lhm-accent, #5c8a5c);
}

.mobile-stat-card__delta-value--info {
  color: var(--lhm-info, #a0b5c4);
}

.mobile-stat-card__delta-value--gold {
  color: var(--lhm-gold, #d4a843);
}

.mobile-stat-card__delta-value--zero {
  color: var(--lhm-text-faint, #b6b0a7);
}

.mobile-stat-card__delta-label {
  color: var(--lhm-text-muted, #999);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}
</style>
