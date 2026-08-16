import type { TimerCompleteEvent, TimerCompleteResult } from '../useTimer'
import { saveTicketCategoryRecords } from '../../repositories/resourceRepository'
import { normalizeAiOutputText } from '../../utils/aiOutput'
import { getChatStoreActiveTargetId } from '../../repositories/chatRepository'

export function useTicketOps({
  resourceStore,
  timerComposable,
  settingStore,
  charStore,
  chatStore,
  showEditTicket,
  showAddTicket,
  editingTicketId,
  ticketForm,
  spendAmount,
  spendReason,
  batchTicket,
  batchAmount,
  newCategoryName,
  categoryEditList,
  showCategoryEditor,
  addResourceEventToStack,
  buildSystemPrompt,
  getAIOptions,
  callAIStream,
  openConfirmDialog,
  toast
}: any) {
  function toSafeNumber(value: unknown): number {
    const numeric = Number(value ?? 0)
    return Number.isFinite(numeric) ? numeric : 0
  }

  function normalizeTicket(ticket: any) {
    if (!ticket?.id) return null
    const liveTicket = resourceStore.tickets.find((item: any) => item.id === ticket.id)
    return liveTicket || ticket
  }

  function isAutoConsumeEnabled(ticket: any): boolean {
    return Boolean(ticket?.autoConsumeNext ?? ticket?.auto_consume_next)
  }

  async function exchangeTicket(ticket: any, amount: number = 1) {
    const currentTicket = normalizeTicket(ticket)
    if (!currentTicket) return
    const useAmount = amount || 1
    const totalCost = toSafeNumber(currentTicket.cost) * toSafeNumber(useAmount)
    if (toSafeNumber(resourceStore.points) < totalCost) {
      toast('积分不足', 'error')
      return
    }
    await resourceStore.exchangeTicket(currentTicket.id, useAmount)
    await addResourceEventToStack?.({
      title: `兑换${currentTicket.name}`,
      notes: `兑换 ${useAmount} 张「${currentTicket.name}」，消耗 ${totalCost} 点数`,
      pointsDelta: -totalCost,
      ticketsExchanged: { [currentTicket.name]: useAmount }
    })
    toast(`已兑换 ${useAmount} 张${currentTicket.name}`, 'success')
  }

  async function useTicket(ticket: any, amount: number = 1, options: { silentToast?: boolean } = {}) {
    const currentTicket = normalizeTicket(ticket)
    if (!currentTicket) return false

    const useAmount = amount || 1
    if (toSafeNumber(currentTicket.count) < toSafeNumber(useAmount)) {
      toast('库存不足', 'error')
      return false
    }

    if (currentTicket.name === '金票') {
      const moneyGain = useAmount * 15
      await resourceStore.useTicket(currentTicket.id, useAmount)
      await resourceStore.addMoney(moneyGain)
      await resourceStore.addHistory('使用金票', `${useAmount}张→¥${moneyGain}`)
      await addResourceEventToStack?.({
        title: '使用金票',
        notes: `消耗 ${useAmount} 张「${currentTicket.name}」，获得 ¥${moneyGain}`,
        moneyDelta: moneyGain,
        ticketsUsed: { [currentTicket.name]: useAmount }
      })
      if (!options.silentToast) {
        toast(`已将 ${useAmount} 张金票转换为 ¥${moneyGain}`, 'success')
      }
      return true
    }

    await resourceStore.useTicket(currentTicket.id, useAmount)
    await addResourceEventToStack?.({
      title: `使用${currentTicket.name}`,
      notes: currentTicket.timerMinutes > 0
        ? `消耗 ${useAmount} 张「${currentTicket.name}」，启动 ${useAmount} 个 ${currentTicket.timerMinutes} 分钟计时`
        : `消耗 ${useAmount} 张「${currentTicket.name}」`,
      ticketsUsed: { [currentTicket.name]: useAmount }
    })
    if (currentTicket.timerMinutes > 0) {
      for (let i = 0; i < useAmount; i++) {
        await timerComposable.startTimer(currentTicket.id, currentTicket.name, currentTicket.timerMinutes)
      }
    }

    if (!options.silentToast) {
      toast(`已使用 ${useAmount} 张${currentTicket.name}`, 'success')
    }
    return true
  }

  function openEditTicket(ticket: any) {
    editingTicketId.value = ticket.id
    Object.assign(ticketForm, {
      name: ticket.name,
      cost: ticket.cost,
      count: ticket.count,
      category: ticket.category || ticket.categoryId || '',
      desc: ticket.desc || '',
      timerMinutes: ticket.timerMinutes || 0,
      autoConsumeNext: isAutoConsumeEnabled(ticket)
    })
    showEditTicket.value = true
  }

  async function saveTicket() {
    const payload = {
      ...ticketForm,
      categoryId: ticketForm.category || '',
      autoConsumeNext: Boolean(ticketForm.autoConsumeNext)
    }
    if (showEditTicket.value && editingTicketId.value) {
      await resourceStore.updateTicket(editingTicketId.value, payload)
      showEditTicket.value = false
      toast('券已更新', 'success')
    } else {
      await resourceStore.addTicket({ ...payload, id: Date.now().toString() })
      showAddTicket.value = false
      toast('券已添加', 'success')
    }
    Object.assign(ticketForm, { name: '', cost: 0, count: 0, category: '', desc: '', timerMinutes: 0, autoConsumeNext: false })
    editingTicketId.value = null
  }

  async function deleteEditingTicket() {
    if (!editingTicketId.value) return

    const ticketId = String(editingTicketId.value)
    const ticketName = String(ticketForm.name || '')
    const runDelete = async () => {
      try {
        const timers = timerComposable.getTicketTimers(ticketId) || []
        for (const timer of timers) {
          await timerComposable.removeTimer(timer.id)
        }
        await resourceStore.deleteTicket(ticketId)
        showEditTicket.value = false
        editingTicketId.value = null
        Object.assign(ticketForm, { name: '', cost: 0, count: 0, category: '', desc: '', timerMinutes: 0, autoConsumeNext: false })
        toast(`已删除票据${ticketName ? `：${ticketName}` : ''}`, 'success')
      } catch (error) {
        toast('删除票据失败', 'error')
        console.error('删除票据失败:', error)
      }
    }

    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('删除票据', '确定删除这张票据吗？该操作不可撤销。', () => {
        void runDelete()
      })
      return
    }

    await runDelete()
  }

  async function confirmSpendMoney(amount?: number, reason?: string) {
    const useAmount = amount || spendAmount.value
    const useReason = reason || spendReason.value
    if (useAmount <= 0) return
    await resourceStore.addMoney(-useAmount)
    await resourceStore.addHistory(`花费 ${useAmount} 金钱: ${useReason}`)
    await addResourceEventToStack?.({
      title: '消费金钱',
      notes: useReason ? `消费 ¥${useAmount}，用途：${useReason}` : `消费 ¥${useAmount}`,
      moneyDelta: -useAmount
    })
    toast(`已消费 ${useAmount} 金钱`, 'success')
  }

  async function executeBatchExchange() {
    const ticket = batchTicket.value
    if (!ticket) return
    const amount = parseInt(batchAmount.value)
    if (isNaN(amount) || amount <= 0) { toast('请输入有效数', 'error'); return }
    const currentTicket = normalizeTicket(ticket)
    if (!currentTicket) return
    const totalCost = toSafeNumber(currentTicket.cost) * toSafeNumber(amount)
    if (toSafeNumber(resourceStore.points) < totalCost) { toast(`积分不足，需要 ${totalCost} 点`, 'error'); return }
    await resourceStore.exchangeTicket(currentTicket.id, amount)
    batchTicket.value = null
    batchAmount.value = 1
    toast(`已批量兑换 ${amount} 张${currentTicket.name}`, 'success')
  }

  async function executeBatchUse() {
    const ticket = batchTicket.value
    if (!ticket) return
    const amount = parseInt(batchAmount.value)
    if (isNaN(amount) || amount <= 0) { toast('请输入有效数', 'error'); return }
    const currentTicket = normalizeTicket(ticket)
    if (!currentTicket) return
    if (toSafeNumber(currentTicket.count) < toSafeNumber(amount)) { toast(`票据数量不足，当前仅剩 ${currentTicket.count} 张`, 'error'); return }
    await useTicket(currentTicket, amount)
    batchTicket.value = null
    batchAmount.value = 1
  }

  async function executeAddBigTime() {
    resourceStore.bigTimeCount += 1
    await resourceStore.saveResources()
    await resourceStore.addHistory('+1大时间块')
    await addResourceEventToStack?.({
      title: '增加大时间块',
      notes: '新增 1 个大时间块',
      timeBlocks: { bigTimeDelta: 1, smallTimeDelta: 0 }
    })
    toast('已添加 1 个大时间块', 'success')
  }

  async function executeAddSmallTime() {
    resourceStore.smallTimeCount += 1
    await resourceStore.saveResources()
    await resourceStore.addHistory('+1小时间块')
    await addResourceEventToStack?.({
      title: '增加小时间块',
      notes: '新增 1 个小时间块',
      timeBlocks: { bigTimeDelta: 0, smallTimeDelta: 1 }
    })
    toast('已添加 1 个小时间块', 'success')
  }

  async function executeConvertToPoints() {
    const originalBigTime = Number(resourceStore.bigTimeCount || 0)
    const originalSmallTime = Number(resourceStore.smallTimeCount || 0)
    const pts = originalBigTime * 10 + originalSmallTime * 2
    if (pts <= 0) { toast('没有时间块可兑换', 'error'); return }
    resourceStore.points += pts
    const detail = `${originalBigTime}大 + ${originalSmallTime}小 = ${pts}点`
    resourceStore.bigTimeCount = 0
    resourceStore.smallTimeCount = 0
    await resourceStore.saveResources()
    await resourceStore.addHistory('兑换点数', detail)
    await addResourceEventToStack?.({
      title: '时间块兑换点数',
      notes: detail,
      pointsDelta: pts,
      timeBlocks: {
        bigTimeDelta: -originalBigTime,
        smallTimeDelta: -originalSmallTime
      }
    })
    toast(`已兑换 ${pts} 点数`, 'success')
  }

  function getGoldTicketCount() {
    const goldTicket = resourceStore.tickets.find((t: any) => t.name === '金票')
    return goldTicket ? (goldTicket.count || 0) : 0
  }

  function addCategory() {
    if (!newCategoryName.value) return
    if (categoryEditList.value.includes(newCategoryName.value)) {
      toast('分类已存', 'error')
      return
    }
    categoryEditList.value.push(newCategoryName.value)
    newCategoryName.value = ''
  }

  async function saveCategories() {
    try {
      await saveTicketCategoryRecords(
        categoryEditList.value.map((cat: string, index: number) => ({
          name: cat,
          orderIndex: index
        }))
      )
      resourceStore.categories = [...categoryEditList.value]
      showCategoryEditor.value = false
      toast('分类已保', 'success')
    } catch (e) {
      toast('保存分类失败', 'error')
    }
  }

  function openCategoryEditor() {
    categoryEditList.value = [...resourceStore.categories]
    showCategoryEditor.value = true
  }

  function pickRandomEvaluator() {
    const targetId = String(getChatStoreActiveTargetId(chatStore) || '')
    if (!targetId) return null

    if (targetId.startsWith('group_')) {
      const group = charStore.groups.find((g: any) => g.id === targetId || `group_${g.id}` === targetId)
      const ids = (group?.members || [])
        .map((m: any) => m?.characterId)
        .filter((id: string) => id && !String(id).startsWith('crowd'))
      if (ids.length > 0) {
        const randomId = ids[Math.floor(Math.random() * ids.length)]
        return charStore.getCharacter(randomId)
      }
    }

    const direct = charStore.getCharacter(targetId)
    if (direct) return direct

    const chars = Array.isArray(charStore.characters) ? charStore.characters : []
    if (chars.length === 0) return null
    return chars[Math.floor(Math.random() * chars.length)]
  }

  async function buildTicketExhaustedAiMessage(ticketName: string): Promise<{ evaluatorName: string; message: string } | null> {
    if (!settingStore.aiEvaluationEnabled) return null
    const evaluator = pickRandomEvaluator()
    if (!evaluator) return null

    const messages = [
      { role: 'system', content: buildSystemPrompt(evaluator.id, 'eval') || '' },
      { role: 'user', content: `票据「${ticketName}」已经耗尽。请用一句话给我一个简短评价（最多60字）。` }
    ]
    const options = {
      ...getAIOptions(evaluator.id),
      usageLabel: `票据评价：${ticketName}`,
      placeLabel: '票据计时',
      placeType: 'other'
    }
    let fullReply = ''
    const returnedText = await callAIStream(messages, options, (chunk: string) => {
      fullReply += chunk
    })
    const clean = String(normalizeAiOutputText(returnedText || fullReply) || '').trim()
    if (!clean) return null
    return {
      evaluatorName: evaluator.name || 'AI',
      message: clean
    }
  }

  async function handleTimerComplete(event: TimerCompleteEvent): Promise<TimerCompleteResult> {
    const ticket = resourceStore.tickets.find((item: any) => item.id === event.ticketId)
    if (!ticket) {
      return {
        title: '票据计时完成',
        type: 'warning',
        notificationTitle: `${event.ticketName} 计时结束`,
        notificationBody: '票据时间已用完'
      }
    }

    if (isAutoConsumeEnabled(ticket) && Number(ticket.count || 0) > 0) {
      const ok = await useTicket(ticket, 1, { silentToast: true })
      if (ok) {
        return {
          title: '已自动续耗',
          type: 'success',
          notificationTitle: `${event.ticketName} 已自动续耗`,
          notificationBody: '自动消耗了下一张，新的计时已开始',
          modalMessage: `自动消耗了下一张「${event.ticketName}」，新的计时已开始`
        }
      }
    }

    if (Number(ticket.count || 0) <= 0 && settingStore.aiEvaluationEnabled) {
      toast('已触发 AI 评价，请稍等片刻', 'info')
      const aiResult = await buildTicketExhaustedAiMessage(event.ticketName)
      if (aiResult && settingStore.aiEvaluationEnabled) {
        const targetId = String(
          getChatStoreActiveTargetId(chatStore)
        )
        if (targetId) {
          await chatStore.addMessage(targetId, {
            role: 'assistant',
            content: aiResult.message,
            time: new Date().toLocaleTimeString(),
            name: aiResult.evaluatorName,
            model: ''
          })
        }
        return {
          title: '票据已耗尽',
          type: 'warning',
          notificationTitle: `${event.ticketName} 已耗尽`,
          notificationBody: aiResult.message,
          modalMessage: aiResult.message
        }
      }
    }

    return {
      title: '票据计时完成',
      type: 'warning',
      notificationTitle: `${event.ticketName} 计时结束`,
      notificationBody: '票据时间已用完',
      modalMessage: `${event.ticketName} 时间已用完`
    }
  }

  return {
    exchangeTicket,
    useTicket,
    openEditTicket,
    saveTicket,
    deleteEditingTicket,
    confirmSpendMoney,
    executeBatchExchange,
    executeBatchUse,
    executeAddBigTime,
    executeAddSmallTime,
    executeConvertToPoints,
    getGoldTicketCount,
    addCategory,
    saveCategories,
    openCategoryEditor,
    handleTimerComplete
  }
}
