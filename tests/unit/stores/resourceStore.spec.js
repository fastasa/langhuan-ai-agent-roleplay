/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResourceStore } from '../../../src/stores/resourceStore.js'

// 模拟 fetch
global.fetch = vi.fn()

describe('resourceStore', () => {
  let store

  beforeEach(() => {
    // 创建新的 Pinia 实例
    const pinia = createPinia()
    setActivePinia(pinia)
    store = useResourceStore()
    vi.clearAllMocks()
  })

  describe('formal loading boundary', () => {
    it('should no longer expose loadFromServer compatibility entry', () => {
      expect(store.loadFromServer).toBeUndefined()
    })
  })

  describe('transaction runtime boundary', () => {
    it('should not expose old pending operation APIs', () => {
      expect(store.addPending).toBeUndefined()
      expect(store.confirmPending).toBeUndefined()
      expect(store.confirmAllPending).toBeUndefined()
      expect(store.cancelPending).toBeUndefined()
      expect(store.cancelAllPending).toBeUndefined()
      expect(store.confirmOp).toBeUndefined()
      expect(store.cancelOp).toBeUndefined()
      expect(store.confirmAllOps).toBeUndefined()
      expect(store.cancelAllOps).toBeUndefined()
    })

    it('should no longer expose transactionMirror compatibility state', () => {
      expect(store.transactionMirror).toBeUndefined()
      expect(store.setTransactionMirror).toBeUndefined()
    })
  })

  describe('ticket operations', () => {
    beforeEach(() => {
      // 重新设置 store 的票据数据
      store.tickets = [
        { id: 't1', name: '电影票', cost: 10, count: 5, timerMinutes: 120 },
        { id: 't2', name: '咖啡券', cost: 5, count: 10, timerMinutes: 30 }
      ]
    })

    it('should exchange ticket when enough points', async () => {
      store.points = 100
      global.fetch.mockResolvedValue({ ok: true })

      await store.exchangeTicket('t1', 2)

      // 消耗20点，获得2张票
      expect(store.points).toBe(80)
      expect(store.tickets[0].count).toBe(7)
    })

    it('should throw error when not enough points', async () => {
      store.points = 5
      store.tickets[0].count = 0

      // 应该抛出错误，点数不足
      await expect(store.exchangeTicket('t1', 2)).rejects.toThrow('点数不足')
    })

    it('should use ticket and grant time blocks', async () => {
      global.fetch.mockResolvedValue({ ok: true })

      await store.useTicket('t1', 1)

      // 电影票120分钟 = 2小时 = 2大时间块
      expect(store.bigTimeCount).toBe(2)
      expect(store.tickets[0].count).toBe(4)
    })
  })

  describe('money operations', () => {
    it('should add money', async () => {
      store.money = 100
      global.fetch.mockResolvedValue({ ok: true })

      await store.addMoney(50)

      expect(store.money).toBe(150)
    })
  })
})
