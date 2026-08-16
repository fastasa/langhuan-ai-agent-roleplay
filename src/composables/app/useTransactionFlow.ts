import { normalizeAiOutputText } from '../../utils/aiOutput'
import {
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession,
  isMultiCharacterChatSession,
  normalizeChatSessionCharacterParticipants
} from '../../repositories/chatRepository'

export function useTransactionFlow({
  workspaceRuntimeStore,
  resourceStore,
  timerComposable,
  addResourceEventToStack,
  chatStore,
  charStore,
  settingStore,
  toast,
  submitTask,
  failTaskConfirm,
  buildSystemPrompt,
  getAIOptions,
  callAIStream,
  transactionExecuting
}: any) {
  function getActiveTargetId() {
    return getChatStoreActiveTargetId(chatStore)
  }

  function getTransactionList() {
    if (Array.isArray(workspaceRuntimeStore?.pendingTransactions)) {
      return workspaceRuntimeStore.pendingTransactions
    }
    return []
  }

  function setTransactionList(nextOperations: any[]) {
    const safeList = Array.isArray(nextOperations) ? nextOperations : []
    if (typeof workspaceRuntimeStore?.replacePendingTransactions === 'function') {
      workspaceRuntimeStore.replacePendingTransactions(safeList)
    }
  }

  function createTransactionId() {
    return `transaction_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function ensureNumber(value: any) {
    const numeric = Number(value || 0)
    return Number.isFinite(numeric) ? numeric : 0
  }

  function effectKeyForTicket(ticketId: string) {
    return `ticket:${ticketId}:count`
  }

  function getLiveTicket(ticket: any) {
    if (!ticket?.id) return null
    return resourceStore.tickets.find((item: any) => String(item.id) === String(ticket.id)) || null
  }

  function intersects(left: string[] = [], right: string[] = []) {
    if (!left.length || !right.length) return false
    const rightSet = new Set(right)
    return left.some((item) => rightSet.has(item))
  }

  function collectDependencyIds(readKeys: string[] = []) {
    if (!readKeys.length) return []
    return getTransactionList()
      .filter((item: any) => item?.mode === 'optimistic' && intersects(item.effectKeys || [], readKeys))
      .map((item: any) => item.id)
  }

  function getDescendantIds(rootIds: string[]) {
    const rootSet = new Set(rootIds)
    let changed = true

    while (changed) {
      changed = false
      getTransactionList().forEach((item: any) => {
        if (rootSet.has(item?.id)) return
        const depends = Array.isArray(item?.dependencyIds) ? item.dependencyIds : []
        if (depends.some((depId: string) => rootSet.has(depId))) {
          rootSet.add(item.id)
          changed = true
        }
      })
    }

    return rootSet
  }

  function getTimeBlockDelta(ticket: any, amount: number) {
    const timerMinutes = ensureNumber(ticket?.timerMinutes ?? ticket?.timer_minutes)
    if (timerMinutes <= 0) {
      return { bigTimeDelta: 0, smallTimeDelta: 0 }
    }
    const hours = (timerMinutes * amount) / 60
    if (hours >= 1) {
      return {
        bigTimeDelta: Math.floor(hours),
        smallTimeDelta: Math.floor((hours % 1) * 60 / 15)
      }
    }
    return {
      bigTimeDelta: 0,
      smallTimeDelta: Math.floor((timerMinutes * amount) / 15)
    }
  }

  function mutateResources(delta: Record<string, number>) {
    resourceStore.points += ensureNumber(delta.points)
    resourceStore.bigTimeCount += ensureNumber(delta.bigTimeCount)
    resourceStore.smallTimeCount += ensureNumber(delta.smallTimeCount)
    resourceStore.money += ensureNumber(delta.money)
  }

  function mutateTicketCount(ticketId: string, delta: number) {
    const liveTicket = resourceStore.tickets.find((item: any) => String(item.id) === String(ticketId))
    if (!liveTicket) {
      throw new Error('票据不存在')
    }
    liveTicket.count = ensureNumber(liveTicket.count) + ensureNumber(delta)
    return liveTicket
  }

  async function startPendingTimers(op: any) {
    const timerPlan = op?.timerPlan
    if (!timerPlan || ensureNumber(timerPlan.count) <= 0 || ensureNumber(timerPlan.minutes) <= 0) {
      op.activeTimerIds = []
      return
    }
    const startedIds: string[] = []
    for (let i = 0; i < timerPlan.count; i += 1) {
      const timerId = await timerComposable.startTimer(timerPlan.ticketId, timerPlan.ticketName, timerPlan.minutes)
      if (timerId) startedIds.push(String(timerId))
    }
    op.activeTimerIds = startedIds
  }

  async function stopPendingTimers(op: any) {
    const timerIds = Array.isArray(op?.activeTimerIds) ? [...op.activeTimerIds] : []
    for (const timerId of timerIds) {
      await timerComposable.removeTimer(timerId)
    }
    op.activeTimerIds = []
  }

  async function applyOptimisticOperation(op: any) {
    mutateResources(op.resourceDelta || {})
    const ticketDeltas = op.ticketDeltas || {}
    Object.entries(ticketDeltas).forEach(([ticketId, delta]) => {
      mutateTicketCount(ticketId, ensureNumber(delta))
    })
    await startPendingTimers(op)
  }

  async function rollbackOptimisticOperation(op: any) {
    await stopPendingTimers(op)
    const ticketDeltas = op.ticketDeltas || {}
    Object.entries(ticketDeltas).forEach(([ticketId, delta]) => {
      mutateTicketCount(ticketId, -ensureNumber(delta))
    })
    mutateResources({
      points: -ensureNumber(op.resourceDelta?.points),
      bigTimeCount: -ensureNumber(op.resourceDelta?.bigTimeCount),
      smallTimeCount: -ensureNumber(op.resourceDelta?.smallTimeCount),
      money: -ensureNumber(op.resourceDelta?.money)
    })
  }

  function buildOptimisticOperation(type: string, desc: string, extra: any = null) {
    const base = {
      id: createTransactionId(),
      type,
      desc,
      extra,
      timestamp: Date.now(),
      mode: 'deferred',
      dependencyIds: [] as string[],
      readKeys: [] as string[],
      effectKeys: [] as string[],
      resourceDelta: { points: 0, bigTimeCount: 0, smallTimeCount: 0, money: 0 },
      ticketDeltas: {} as Record<string, number>,
      timerPlan: null as null | { ticketId: string; ticketName: string; minutes: number; count: number },
      activeTimerIds: [] as string[],
      finalizeData: null as any
    }

    if (type === '兑换大时间块') {
      return {
        ...base,
        mode: 'optimistic',
        effectKeys: ['resource:bigTimeCount'],
        resourceDelta: { points: 0, bigTimeCount: 1, smallTimeCount: 0, money: 0 },
        finalizeData: {
          history: { action: '+1大时间块', detail: '' },
          event: {
            title: '增加大时间块',
            notes: '新增 1 个大时间块',
            timeBlocks: { bigTimeDelta: 1, smallTimeDelta: 0 }
          }
        }
      }
    }

    if (type === '兑换小时间块') {
      return {
        ...base,
        mode: 'optimistic',
        effectKeys: ['resource:smallTimeCount'],
        resourceDelta: { points: 0, bigTimeCount: 0, smallTimeCount: 1, money: 0 },
        finalizeData: {
          history: { action: '+1小时间块', detail: '' },
          event: {
            title: '增加小时间块',
            notes: '新增 1 个小时间块',
            timeBlocks: { bigTimeDelta: 0, smallTimeDelta: 1 }
          }
        }
      }
    }

    if (type === '兑换点数') {
      const currentBigTime = ensureNumber(resourceStore.bigTimeCount)
      const currentSmallTime = ensureNumber(resourceStore.smallTimeCount)
      const pointsGain = currentBigTime * 10 + currentSmallTime * 2
      if (pointsGain <= 0) {
        throw new Error('没有时间块可兑换')
      }
      const detail = `${currentBigTime}大 + ${currentSmallTime}小 = ${pointsGain}点`
      return {
        ...base,
        mode: 'optimistic',
        readKeys: ['resource:bigTimeCount', 'resource:smallTimeCount'],
        effectKeys: ['resource:bigTimeCount', 'resource:smallTimeCount', 'resource:points'],
        resourceDelta: {
          points: pointsGain,
          bigTimeCount: -currentBigTime,
          smallTimeCount: -currentSmallTime,
          money: 0
        },
        finalizeData: {
          history: { action: '兑换点数', detail },
          event: {
            title: '时间块兑换点数',
            notes: detail,
            pointsDelta: pointsGain,
            timeBlocks: {
              bigTimeDelta: -currentBigTime,
              smallTimeDelta: -currentSmallTime
            }
          }
        }
      }
    }

    if (type === '消费金钱') {
      const amount = ensureNumber(extra?.amount)
      if (amount <= 0) {
        throw new Error('请输入有效金额')
      }
      const reason = String(extra?.reason || '').trim()
      return {
        ...base,
        mode: 'optimistic',
        effectKeys: ['resource:money'],
        resourceDelta: { points: 0, bigTimeCount: 0, smallTimeCount: 0, money: -amount },
        finalizeData: {
          history: { action: `花费 ${amount} 金钱: ${reason}`, detail: '' },
          event: {
            title: '消费金钱',
            notes: reason ? `消费 ¥${amount}，用途：${reason}` : `消费 ¥${amount}`,
            moneyDelta: -amount
          }
        }
      }
    }

    if (type === '兑换票据') {
      const currentTicket = getLiveTicket(extra?.ticket)
      const amount = ensureNumber(extra?.amount) || 1
      if (!currentTicket) {
        throw new Error('票据不存在')
      }
      if (amount <= 0) {
        throw new Error('请输入有效数量')
      }
      const totalCost = ensureNumber(currentTicket.cost) * amount
      if (ensureNumber(resourceStore.points) < totalCost) {
        throw new Error('积分不足')
      }
      return {
        ...base,
        mode: 'optimistic',
        readKeys: ['resource:points'],
        effectKeys: ['resource:points', effectKeyForTicket(String(currentTicket.id))],
        resourceDelta: { points: -totalCost, bigTimeCount: 0, smallTimeCount: 0, money: 0 },
        ticketDeltas: { [String(currentTicket.id)]: amount },
        finalizeData: {
          ticketIds: [String(currentTicket.id)],
          history: {
            action: `兑换票据：${currentTicket.name}x${amount}`,
            detail: `-${totalCost}点`
          },
          event: {
            title: `兑换${currentTicket.name}`,
            notes: `兑换 ${amount} 张「${currentTicket.name}」，消耗 ${totalCost} 点数`,
            pointsDelta: -totalCost,
            ticketsExchanged: { [currentTicket.name]: amount }
          }
        }
      }
    }

    if (type === '使用票据') {
      const currentTicket = getLiveTicket(extra?.ticket)
      const amount = ensureNumber(extra?.amount) || 1
      if (!currentTicket) {
        throw new Error('票据不存在')
      }
      if (amount <= 0) {
        throw new Error('请输入有效数量')
      }
      if (ensureNumber(currentTicket.count) < amount) {
        throw new Error('库存不足')
      }
      const ticketId = String(currentTicket.id)
      const ticketName = String(currentTicket.name || '票据')
      const readKeys = [effectKeyForTicket(ticketId)]

      if (ticketName === '金票') {
        const moneyGain = amount * 15
        return {
          ...base,
          mode: 'optimistic',
          readKeys,
          effectKeys: [effectKeyForTicket(ticketId), 'resource:money'],
          resourceDelta: { points: 0, bigTimeCount: 0, smallTimeCount: 0, money: moneyGain },
          ticketDeltas: { [ticketId]: -amount },
          finalizeData: {
            ticketIds: [ticketId],
            history: {
              action: '使用金票',
              detail: `${amount}张→¥${moneyGain}`
            },
            event: {
              title: '使用金票',
              notes: `消耗 ${amount} 张「${ticketName}」，获得 ¥${moneyGain}`,
              moneyDelta: moneyGain,
              ticketsUsed: { [ticketName]: amount }
            }
          }
        }
      }

      const timeBlockDelta = getTimeBlockDelta(currentTicket, amount)
      const timerMinutes = ensureNumber(currentTicket.timerMinutes ?? currentTicket.timer_minutes)
      return {
        ...base,
        mode: 'optimistic',
        readKeys,
        effectKeys: [
          effectKeyForTicket(ticketId),
          'resource:bigTimeCount',
          'resource:smallTimeCount'
        ],
        resourceDelta: {
          points: 0,
          bigTimeCount: timeBlockDelta.bigTimeDelta,
          smallTimeCount: timeBlockDelta.smallTimeDelta,
          money: 0
        },
        ticketDeltas: { [ticketId]: -amount },
        timerPlan: timerMinutes > 0 ? {
          ticketId,
          ticketName,
          minutes: timerMinutes,
          count: amount
        } : null,
        finalizeData: {
          ticketIds: [ticketId],
          history: {
            action: `使用票据：${ticketName}x${amount}`,
            detail: timerMinutes > 0 ? `+${timerMinutes * amount}分钟` : ''
          },
          event: {
            title: `使用${ticketName}`,
            notes: timerMinutes > 0
              ? `消耗 ${amount} 张「${ticketName}」，启动 ${amount} 个 ${timerMinutes} 分钟计时`
              : `消耗 ${amount} 张「${ticketName}」`,
            ticketsUsed: { [ticketName]: amount }
          }
        }
      }
    }

    return base
  }

  async function stageTransaction(type: string, desc: string, extra: any = null) {
    const nextTransaction = buildOptimisticOperation(type, desc, extra)
    if (nextTransaction.mode === 'optimistic') {
      nextTransaction.dependencyIds = collectDependencyIds(nextTransaction.readKeys)
      await applyOptimisticOperation(nextTransaction)
      toast('已暂存', 'success')
    }
    setTransactionList([...getTransactionList(), nextTransaction])
    return nextTransaction
  }

  async function rollbackOperations(operations: any[]) {
    for (let index = operations.length - 1; index >= 0; index -= 1) {
      const op = operations[index]
      if (op?.mode === 'optimistic') {
        await rollbackOptimisticOperation(op)
      }
    }
  }

  async function reapplyOperations(operations: any[]) {
    for (const op of operations) {
      if (op?.mode === 'optimistic') {
        await applyOptimisticOperation(op)
      }
    }
  }

  async function removeTransactionAt(index: number) {
    const currentOperations = getTransactionList()
    if (index < 0 || index >= currentOperations.length) return
    const target = currentOperations[index]
    if (!target?.id) return

    const removeIds = getDescendantIds([target.id])
    const removedOps = currentOperations.filter((item: any) => removeIds.has(item.id))
    await rollbackOperations(removedOps)
    setTransactionList(currentOperations.filter((item: any) => !removeIds.has(item.id)))
    const removedCount = removedOps.length
    toast(removedCount > 1 ? `已撤销 ${removedCount} 条相关操作` : '已撤销该操作', 'info')
  }

  async function runRemoveTransactionCommand(index: number) {
    await removeTransactionAt(index)
  }

  async function clearTransactions() {
    const currentOperations = getTransactionList()
    if (currentOperations.length === 0) return
    const allOperations = [...currentOperations]
    await rollbackOperations(allOperations)
    setTransactionList([])
    toast('待处理事务已全部撤销', 'info')
  }

  async function runClearTransactionsCommand() {
    await clearTransactions()
  }

  async function persistOptimisticOperations(operations: any[]) {
    const optimisticOps = operations.filter((item: any) => item?.mode === 'optimistic')
    if (optimisticOps.length === 0) return

    await resourceStore.saveResources()

    const ticketIds = [...new Set(
      optimisticOps.flatMap((item: any) => Array.isArray(item?.finalizeData?.ticketIds) ? item.finalizeData.ticketIds : [])
    )]

    for (const ticketId of ticketIds) {
      const liveTicket = resourceStore.tickets.find((item: any) => String(item.id) === String(ticketId))
      if (!liveTicket) continue
      await resourceStore.updateTicket(String(ticketId), { count: ensureNumber(liveTicket.count) })
    }

    for (const op of optimisticOps) {
      const historyData = op?.finalizeData?.history
      if (historyData?.action) {
        await resourceStore.addHistory(historyData.action, historyData.detail || '')
      }
      if (op?.finalizeData?.event) {
        await addResourceEventToStack?.(op.finalizeData.event)
      }
    }
  }

  async function confirmTransactions(indices?: number[]) {
    await executeConfirmTransactionsCommand({
      getTransactionList,
      setTransactionList,
      rollbackOperations,
      reapplyOperations,
      persistOptimisticOperations,
      executeOperation,
      triggerOperationEvaluation,
      transactionExecuting,
      toast
    }, indices)
  }

  async function runConfirmTransactionsCommand(indices?: number[]) {
    await executeConfirmTransactionsCommand({
      getTransactionList,
      setTransactionList,
      rollbackOperations,
      reapplyOperations,
      persistOptimisticOperations,
      executeOperation,
      triggerOperationEvaluation,
      transactionExecuting,
      toast
    }, indices)
  }

  async function executeOperation(op: any) {
    switch (op.type) {
      case '兑换大时间块':
      case '兑换小时间块':
      case '兑换点数':
      case '使用票据':
      case '兑换票据':
      case '消费金钱':
        break
      case '完成任务':
        if (op.extra?.task) {
          await submitTask(op.extra.task)
        }
        break
      case '任务失败':
        if (op.extra?.task) {
          await failTaskConfirm(op.extra.task, true)
        } else if (op.extra?.taskId) {
          await failTaskConfirm(op.extra.taskId, true)
        }
        break
      default:
        console.log('未知操作类型:', op.type)
    }
  }

  async function triggerOperationEvaluation(operations: any[]) {
    if (!settingStore.aiEvaluationEnabled) return

    const targetId = getActiveTargetId()
    if (!targetId) return

    let evaluator = null
    const currentSession = getChatStoreCurrentSession(chatStore)
    const sessionParticipants = normalizeChatSessionCharacterParticipants(currentSession)

    if (sessionParticipants.length) {
      evaluator = charStore.getCharacter?.(sessionParticipants[0].characterId)
    } else if (targetId.startsWith('group_')) {
      const group = charStore.groups.find((g: any) => 'group_' + g.id === targetId)
      if (group?.members) {
        for (const member of group.members) {
          if (!member.characterId) continue
          const char = charStore.characters.find((c: any) => c.id === member.characterId)
          if (char && char.groupId !== 'crowd') {
            evaluator = char
            break
          }
        }
      }
    } else {
      evaluator = charStore.getCharacter(targetId)
    }

    if (!evaluator) {
      toast('未找到可用于评价的角色', 'error')
      return
    }

    const evalPreset = settingStore.promptPresets.find((p: any) => p.enabled && p.scene === 'eval')
    if (!evalPreset) {
      toast('请先启用评价预设（设置→预设管理→评价）', 'error')
      return
    }

    const operationList = operations.map(op => `- ${op.type}: ${op.desc}`).join('\n')
    const messages = [
      { role: 'system', content: buildSystemPrompt(evaluator.id, 'eval') || '' },
      { role: 'user', content: `我刚刚执行了以下操作：\n${operationList}\n请对这些操作进行评价。` }
    ]

    const targetName = String(targetId.startsWith('group_')
      ? (charStore.groups.find((g: any) => 'group_' + g.id === targetId)?.name || targetId)
      : (charStore.getCharacter?.(targetId)?.name || targetId))
    const multiCharacterSession = isMultiCharacterChatSession(currentSession, targetId)
    const options = {
      ...getAIOptions(evaluator.id),
      usageLabel: `操作评价：${evaluator.name}`,
      placeLabel: `会话：${targetName}`,
      placeType: multiCharacterSession ? 'group' : 'single'
    }
    let fullReply = ''
    const returnedText = await callAIStream(messages, options, (chunk: string) => {
      fullReply += chunk
    })

    const normalizedReply = normalizeAiOutputText(returnedText || fullReply)
    if (normalizedReply) {
      chatStore.addMessage(targetId, {
        role: 'assistant',
        content: normalizedReply,
        time: new Date().toLocaleTimeString(),
        name: evaluator.name,
        model: ''
      })
    }
  }

  return {
    stageTransaction,
    removeTransactionAt,
    runRemoveTransactionCommand,
    clearTransactions,
    runClearTransactionsCommand,
    confirmTransactions,
    runConfirmTransactionsCommand,
    executeOperation,
    triggerOperationEvaluation
  }
}

export async function executeConfirmTransactionsCommand({
  getTransactionList,
  setTransactionList,
  rollbackOperations,
  reapplyOperations,
  persistOptimisticOperations,
  executeOperation,
  triggerOperationEvaluation,
  transactionExecuting,
  toast
}: any, indices?: number[]) {
  const selectedIndexes = Array.isArray(indices)
    ? [...new Set(indices)].filter(index => index >= 0 && index < getTransactionList().length)
    : getTransactionList().map((_: any, index: number) => index)

  if (selectedIndexes.length === 0) return

  const queue = selectedIndexes.map((index: number) => ({
    index,
    operation: getTransactionList()[index]
  })).filter((item: any) => item.operation)

  if (queue.length === 0) return

  if (transactionExecuting) transactionExecuting.value = true
  const completedIndexes = new Set<number>()
  const executedOps: any[] = []
  const failedMessages: string[] = []

  try {
    const selectedIds = new Set(queue.map((item: any) => item.operation?.id).filter(Boolean))
    const unselectedOptimisticOps = getTransactionList().filter((item: any) => item?.mode === 'optimistic' && !selectedIds.has(item.id))
    await rollbackOperations(unselectedOptimisticOps)

    try {
      await persistOptimisticOperations(queue.map((item: any) => item.operation))

      for (const item of queue) {
        try {
          if (item.operation?.mode !== 'optimistic') {
            await executeOperation(item.operation)
          }
          completedIndexes.add(item.index)
          executedOps.push(item.operation)
        } catch (error: any) {
          failedMessages.push(error?.message || `${item.operation.type} 执行失败`)
        }
      }
    } finally {
      await reapplyOperations(unselectedOptimisticOps)
    }

    if (completedIndexes.size > 0) {
      setTransactionList(getTransactionList().filter((_: any, index: number) => !completedIndexes.has(index)))
    }

    if (executedOps.length > 0) {
      await triggerOperationEvaluation(executedOps)
    }

    if (failedMessages.length > 0) {
      toast(`部分操作执行失败：${failedMessages[0]}`, 'error')
    }
  } finally {
    if (transactionExecuting) transactionExecuting.value = false
  }
}
