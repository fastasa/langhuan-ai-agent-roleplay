<template>
  <div class="card">
    <div class="card-title">当前资源</div>
    <div class="points-display" style="gap: 15px;">
      <div class="point-item">
        <div class="point-value" style="font-size: 1.8rem;">{{ resourceViewModel.points }}</div>
        <div class="point-label">点数</div>
      </div>
      <div class="point-item">
        <div class="point-value" style="font-size: 1.8rem; color: var(--morandi-warning);">¥{{ formattedMoney }}</div>
        <div class="point-label">金钱</div>
      </div>
      <div class="point-item">
        <div class="point-value" style="font-size: 1.8rem;">{{ resourceViewModel.bigTime }}</div>
        <div class="point-label">大时间块</div>
      </div>
      <div class="point-item">
        <div class="point-value" style="font-size: 1.8rem;">{{ resourceViewModel.smallTime }}</div>
        <div class="point-label">小时间块</div>
      </div>
      <div class="point-item">
        <div class="point-value" style="font-size: 1.8rem; color: #c49a6c;">{{ resourceViewModel.goldTickets }}</div>
        <div class="point-label">金票</div>
      </div>
    </div>
    <div class="time-buttons resource-action-row">
      <button class="btn btn-primary btn-small btn-resource-action" @click="$emit('add-big-time')">+大时间块</button>
      <button class="btn btn-primary btn-small btn-resource-action" @click="$emit('add-small-time')">+小时间块</button>
      <button class="btn btn-secondary btn-small btn-resource-action" @click="$emit('convert-points')" :disabled="!resourceViewModel.canExchangePoints">兑换点数</button>
      <button class="btn btn-secondary btn-small btn-resource-action" @click="$emit('spend-money')">消费金钱</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  resourceViewModel: {
    points: number
    money: number
    bigTime: number
    smallTime: number
    goldTickets: number
    canExchangePoints: boolean
  }
}>()

const formattedMoney = computed(() => {
  const money = Number(props.resourceViewModel.money || 0)
  return Number.isFinite(money) ? money.toFixed(0) : '0'
})

defineEmits<{
  (e: 'add-big-time'): void
  (e: 'add-small-time'): void
  (e: 'convert-points'): void
  (e: 'spend-money'): void
}>()
</script>

<style scoped>
.resource-action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--morandi-border);
}

.btn-resource-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 112px;
  min-height: 40px;
  padding: 8px 18px;
  font-size: 0.9rem;
  line-height: 1.5;
  text-align: center;
  white-space: nowrap;
}
</style>
