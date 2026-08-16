/**
 * stores/resourceStore.ts
 * 管理：点数、金钱、时间块、票据、事务兼容镜像、操作历史
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Ticket, TicketCategory, HistoryItem } from '../types'
import {
  createHistoryRecord,
  createTicketRecord,
  deleteTicketRecord,
  saveResourceValues,
  updateTicketRecord
} from '../repositories/resourceRepository'

export const useResourceStore = defineStore('resource', () => {
  function toSafeNumber(value: unknown): number {
    const numeric = Number(value ?? 0)
    return Number.isFinite(numeric) ? numeric : 0
  }

  // ===== 状态 =====
  const points = ref(0)
  const bigTimeCount = ref(0)
  const smallTimeCount = ref(0)
  const money = ref(0)
  const tickets = ref<Ticket[]>([])          // 票据列表
  const ticketCategories = ref<TicketCategory[]>([]) // 票据分类
  const history = ref<HistoryItem[]>([])     // 操作历史

  // 分类别名（ticketCategories中提取名称）
  const categories = ref<string[]>(['娱乐', '社交', '特殊', '学习'])

  // ===== 更新资源数值（直接写服务器） =====
  async function saveResources(): Promise<void> {
    await saveResourceValues({
      points: points.value,
      bigTimeCount: bigTimeCount.value,
      smallTimeCount: smallTimeCount.value,
      money: money.value
    })
  }

  // ===== 票据操作 =====
  async function updateTicket(id: string, changes: Partial<Ticket>): Promise<void> {
    await updateTicketRecord(id, changes)
    const t = tickets.value.find(t => t.id === id)
    if (t) Object.assign(t, changes)
  }

  async function addTicket(ticket: Ticket): Promise<void> {
    await createTicketRecord(ticket)
    tickets.value.push(ticket)
  }

  async function deleteTicket(id: string): Promise<void> {
    await deleteTicketRecord(id)
    tickets.value = tickets.value.filter(t => t.id !== id)
  }

  // 兑换票据（消耗点数获得票据）
  async function exchangeTicket(ticketId: string, amount: number): Promise<void> {
    const ticket = tickets.value.find(t => t.id === ticketId)
    if (!ticket) return
    const cost = toSafeNumber(ticket.cost) * toSafeNumber(amount)
    if (points.value < cost) {
      throw new Error('点数不足')
    }
    points.value -= cost
    ticket.count = toSafeNumber(ticket.count) + toSafeNumber(amount)
    await saveResources()
    await updateTicket(ticketId, { count: ticket.count })
    await addHistory(`兑换票据：${ticket.name}x${amount}`, `-${cost}点`)
  }

  // 使用票据（消耗票据获得时间）
  async function useTicket(ticketId: string, amount: number): Promise<void> {
    const ticket = tickets.value.find(t => t.id === ticketId)
    if (!ticket) return
    if (toSafeNumber(ticket.count) < toSafeNumber(amount)) {
      throw new Error('票据不足')
    }
    ticket.count -= toSafeNumber(amount)
    // 根据票据类型给予奖励
    if (toSafeNumber(ticket.timerMinutes) > 0) {
      // 时间票据：增加时间块
      const hours = (toSafeNumber(ticket.timerMinutes) * toSafeNumber(amount)) / 60
      if (hours >= 1) {
        bigTimeCount.value += Math.floor(hours)
        smallTimeCount.value += Math.floor((hours % 1) * 60 / 15)
      } else {
        smallTimeCount.value += Math.floor((toSafeNumber(ticket.timerMinutes) * toSafeNumber(amount)) / 15)
      }
    }
    await saveResources()
    await updateTicket(ticketId, { count: ticket.count })
    await addHistory(`使用票据：${ticket.name}x${amount}`, `+${toSafeNumber(ticket.timerMinutes) * toSafeNumber(amount)}分钟`)
  }

  // ===== 金钱操作 =====
  async function addMoney(amount: number): Promise<void> {
    money.value += amount
    await saveResources()
  }

  // ===== 操作历史 =====
  async function addHistory(action: string, detail: string = ''): Promise<void> {
    try {
      await createHistoryRecord({ action, detail })
    } catch (error) {
      console.error('添加历史记录失败', error)
    }
    history.value.unshift({ action, detail, createdAt: new Date().toISOString() })
    if (history.value.length > 100) history.value = history.value.slice(0, 100)
  }

  return {
    points, bigTimeCount, smallTimeCount, money,
    tickets, ticketCategories, categories, history,
    saveResources,
    updateTicket, addTicket, deleteTicket, exchangeTicket, useTicket,
    addMoney, addHistory
  }
})
