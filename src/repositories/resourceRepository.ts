import { API } from '../config/api'
import type { HistoryItem, Ticket } from '../types'

type ResourcePayload = {
  points: number
  bigTimeCount: number
  smallTimeCount: number
  money: number
}

export interface ResolvedResourceState {
  points: number
  bigTimeCount: number
  smallTimeCount: number
  money: number
  tickets: Ticket[]
  ticketCategories: Array<{ id?: string; name?: string }>
  history: HistoryItem[]
  categories: string[]
}

export interface ResourceStoreStateTarget {
  points: { value: number }
  bigTimeCount: { value: number }
  smallTimeCount: { value: number }
  money: { value: number }
  tickets: { value: Ticket[] }
  ticketCategories: { value: Array<{ id?: string; name?: string }> }
  history: { value: HistoryItem[] }
  categories: { value: string[] }
}

function toSafeNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

export function resolveResourceState(input: unknown): ResolvedResourceState {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const resources = data.resources && typeof data.resources === 'object'
    ? data.resources as Record<string, unknown>
    : {}
  const ticketCategories = Array.isArray(data.ticketCategories)
    ? data.ticketCategories as Array<{ id?: string; name?: string }>
    : []

  const categories = ticketCategories
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean)

  return {
    points: toSafeNumber(resources.points),
    bigTimeCount: toSafeNumber(resources.bigTimeCount),
    smallTimeCount: toSafeNumber(resources.smallTimeCount),
    money: toSafeNumber(resources.money),
    tickets: Array.isArray(data.tickets) ? data.tickets as Ticket[] : [],
    ticketCategories,
    history: Array.isArray(data.history) ? data.history as HistoryItem[] : [],
    categories
  }
}

export function applyResolvedResourceState(target: ResourceStoreStateTarget, resolved: ResolvedResourceState): void {
  target.points.value = resolved.points
  target.bigTimeCount.value = resolved.bigTimeCount
  target.smallTimeCount.value = resolved.smallTimeCount
  target.money.value = resolved.money
  target.tickets.value = resolved.tickets
  target.ticketCategories.value = resolved.ticketCategories
  target.history.value = resolved.history
  if (resolved.categories.length > 0) {
    target.categories.value = resolved.categories
  }
}

async function sendJson(url: string, method: string, body: unknown, fallbackMessage: string): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
}

async function sendDelete(url: string, fallbackMessage: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
}

export async function saveResourceValues(payload: ResourcePayload): Promise<void> {
  await sendJson(API.RESOURCES, 'PUT', payload, '保存资源失败')
}

export async function createTicketRecord(ticket: Ticket): Promise<void> {
  await sendJson(API.TICKETS, 'POST', ticket, '添加票据失败')
}

export async function updateTicketRecord(id: string, changes: Partial<Ticket>): Promise<void> {
  await sendJson(`${API.TICKETS}/${encodeURIComponent(id)}`, 'PUT', changes, '更新票据失败')
}

export async function deleteTicketRecord(id: string): Promise<void> {
  await sendDelete(`${API.TICKETS}/${encodeURIComponent(id)}`, '删除票据失败')
}

export async function createHistoryRecord(payload: Pick<HistoryItem, 'action' | 'detail'>): Promise<void> {
  await sendJson(API.HISTORY, 'POST', payload, '添加历史记录失败')
}

export async function saveTicketCategoryRecords(categories: Array<{ name: string; orderIndex: number }>): Promise<void> {
  for (const category of Array.isArray(categories) ? categories : []) {
    await sendJson(API.TICKET_CATEGORIES, 'POST', category, '保存票据分类失败')
  }
}
