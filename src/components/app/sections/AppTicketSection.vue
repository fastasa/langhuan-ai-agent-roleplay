<template>
  <div class="collapsible card" style="padding: 0;">
    <div class="collapsible-header" @click="viewModel.sections.tickets = !viewModel.sections.tickets" style="padding: 16px; border-radius: 12px;">
      <span class="card-title" style="margin: 0;">票据管理</span>
      <span class="collapsible-arrow" :class="{ open: viewModel.sections.tickets }">▾</span>
    </div>
    <div class="collapsible-content" :class="{ open: viewModel.sections.tickets }" style="padding: 0 16px 16px 16px;">
      <div class="category-tabs">
        <button class="category-tab" :class="{ active: viewModel.currentTicketCategory === '全部' }" @click="actions.updateCurrentTicketCategory('全部')">全部</button>
        <button v-for="cat in viewModel.categories" :key="cat" class="category-tab" :class="{ active: viewModel.currentTicketCategory === cat }" @click="actions.updateCurrentTicketCategory(cat)">{{ cat }}</button>
        <button class="category-tab" @click="actions.openCategoryEditor()" title="编辑分类">编辑</button>
      </div>
      <div class="tickets-grid">
        <div v-for="ticket in viewModel.filteredTickets" :key="String(ticket.id || ticket.name || '')" class="ticket-item">
          <div class="ticket-header">
            <span class="ticket-name">{{ ticket.name }}</span>
            <span class="ticket-cost">{{ ticket.cost }}点</span>
          </div>
          <div class="ticket-count">{{ ticket.count }}</div>
          <div class="ticket-desc">{{ ticket.desc }}</div>
          <div v-if="Number(ticket.timerMinutes || 0) > 0" class="ticket-timer">{{ Number(ticket.timerMinutes || 0) }}分钟/张</div>
          <div v-for="timer in getTicketTimers(String(ticket.id || ''))" :key="String(timer.id || '')" class="ticket-timer" style="color: var(--morandi-info); font-weight: 500; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span>
              剩余: {{ viewModel.formatRemaining(Number(timer.remainingMs || 0)) }}
              <span v-if="timer.paused" style="color: var(--morandi-warning);">（已暂停）</span>
            </span>
            <button
              class="btn btn-secondary btn-tiny"
              @click="timer.paused ? actions.resumeTicketTimer(String(timer.id || '')) : actions.pauseTicketTimer(String(timer.id || ''))"
            >{{ timer.paused ? '继续' : '暂停' }}</button>
          </div>
          <div v-if="viewModel.getTicketTimerCount(String(ticket.id || '')) > 1" class="ticket-timer" style="color: var(--morandi-text-light);">
            还有 {{ viewModel.getTicketTimerCount(String(ticket.id || '')) - 1 }} 张排队中
          </div>
          <div class="ticket-actions">
            <button class="btn btn-primary btn-small" @click="actions.openBatchExchange(ticket)" :disabled="viewModel.points < Number(ticket.cost || 0)">兑换</button>
            <button class="btn btn-success btn-small" @click="actions.openBatchUse(ticket)" :disabled="Number(ticket.count || 0) <= 0">使用</button>
            <button class="btn btn-secondary btn-small" @click="actions.editTicket(ticket)">编辑</button>
          </div>
        </div>
      </div>
      <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-small" @click="actions.openAddTicket()">+ 添加新票据</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TicketPanelActions, TicketPanelViewModel } from '../../../types/panelContracts'

const props = defineProps<{
  viewModel: TicketPanelViewModel
  actions: TicketPanelActions
}>()

function getTicketTimers(ticketId: string) {
  const list = props.viewModel.getTicketTimers(ticketId)
  return Array.isArray(list) ? list : []
}
</script>

<style scoped>
.collapsible-header .card-title::before {
  display: none;
}

.collapsible-header .card-title {
  gap: 0;
  font-weight: 600;
}
</style>
