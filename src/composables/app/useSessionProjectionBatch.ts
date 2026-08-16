import { computed, ref, watch } from 'vue'
import {
  fetchChatPersonalityModelObservationsBySessionId,
  runChatMessageProjectionBySessionId,
  type ChatPersonalityModelObservationProjection
} from '../../repositories/chatRepository'
import { isProjectionRowSuccess } from '../../app/replyWorkflowMessageView'
import { isProjectionFirstEligibleMessage } from '../../app/projectionFirstMessageView'
import { chatProjectionObservationTick } from '../../app/chatProjectionObservationSignal'
import { runWithConcurrencyPool } from '../../utils/concurrencyPool'
import { makeOperationUnitId } from '../../app/aiUsageContext'

type ToastFn = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void

interface UseSessionProjectionBatchOptions {
  sessionId: () => string
  messages: () => Array<Record<string, unknown>>
  // 是否投影特性会话（normal_recall / personality_model 才有消息投影）
  isProjectionMode: () => boolean
  toast: ToastFn
}

// 客户端 HTTP fan-out 上限：避免一次塞爆浏览器同域连接；真正的供应商并发由服务端令牌池兜底。
const PROJECTION_BATCH_CONCURRENCY = 5

function resolveMessageId(message: Record<string, unknown>): number {
  return Number(message.id ?? message.messageId ?? message.message_id ?? 0)
}

/**
 * 批量投影"当前会话所有未投影消息"。投影行的真值口径、单条触发、tick 同步都与
 * ChatMessageStream.vue 保持一致（共用 chatProjectionObservationTick）：
 * 这里跑完调用 runChatMessageProjectionBySessionId 会 bump 全局 tick，消息流的逐条灯泡随之刷新；
 * 反之消息流单条投影也会反映到这里的未投影计数。后续若两处口径要改，需同步维护。
 */
export function useSessionProjectionBatch(options: UseSessionProjectionBatchOptions) {
  const projectionRows = ref<ChatPersonalityModelObservationProjection[]>([])
  const running = ref(false)

  const projectionByMessageId = computed(() => {
    const map = new Map<number, ChatPersonalityModelObservationProjection>()
    for (const projection of projectionRows.value) {
      const messageId = Number(projection.messageId || 0)
      if (Number.isInteger(messageId) && messageId > 0) map.set(messageId, projection)
    }
    return map
  })

  // 未投影 = 该投影（isProjectionFirstEligibleMessage）且尚未成功投影、也不在投影中。
  const unprojectedMessageIds = computed<number[]>(() => {
    if (!options.isProjectionMode() || !options.sessionId()) return []
    const ids: number[] = []
    for (const message of options.messages()) {
      if (!isProjectionFirstEligibleMessage(message)) continue
      const messageId = resolveMessageId(message)
      if (!Number.isInteger(messageId) || messageId <= 0) continue
      const projection = projectionByMessageId.value.get(messageId)
      if (isProjectionRowSuccess(projection)) continue
      if (String(projection?.status || '').trim() === 'running') continue
      ids.push(messageId)
    }
    return ids
  })

  const unprojectedCount = computed(() => unprojectedMessageIds.value.length)
  const hasUnprojected = computed(() => unprojectedMessageIds.value.length > 0)

  async function reload() {
    const sessionId = options.sessionId()
    if (!options.isProjectionMode() || !sessionId) {
      projectionRows.value = []
      return
    }
    try {
      const page = await fetchChatPersonalityModelObservationsBySessionId(sessionId)
      projectionRows.value = Array.isArray(page.projections) ? page.projections : []
    } catch (error) {
      console.error('加载消息投影状态失败（批量投影灯泡）:', error)
    }
  }

  async function runBatch() {
    if (running.value) {
      options.toast('正在批量投影', 'info')
      return
    }
    const sessionId = options.sessionId()
    if (!sessionId) {
      options.toast('当前没有可投影的会话', 'error')
      return
    }
    const ids = [...unprojectedMessageIds.value]
    if (!ids.length) {
      options.toast('没有需要投影的消息', 'info')
      return
    }
    running.value = true
    options.toast(`开始批量投影 ${ids.length} 条消息`, 'info')
    // 消耗溯源：整次批量投影共用一个操作单元 id，台账里 N 条调用聚成一组、总消耗可算。
    const usageUnit = { unitId: makeOperationUnitId('batch_projection', sessionId), unitKind: 'batch_projection' }
    try {
      const results = await runWithConcurrencyPool(
        ids,
        (messageId) => runChatMessageProjectionBySessionId(sessionId, messageId, usageUnit),
        { limit: PROJECTION_BATCH_CONCURRENCY, retries: 1, retryDelayMs: 500 }
      )
      await reload()
      const failed = results.filter((result) => result.status === 'rejected').length
      const succeeded = results.length - failed
      options.toast(
        failed > 0 ? `批量投影完成：${succeeded} 条成功，${failed} 条失败` : `批量投影完成：${succeeded} 条`,
        failed > 0 ? 'warning' : 'success'
      )
    } catch (error) {
      console.error('批量投影失败:', error)
      options.toast('批量投影失败', 'error')
      void reload()
    } finally {
      running.value = false
    }
  }

  // 会话切换 / 投影模式变化 / 全局投影信号变更时刷新投影行。
  watch(
    [() => options.sessionId(), () => options.isProjectionMode(), chatProjectionObservationTick],
    () => { void reload() },
    { immediate: true }
  )

  return { hasUnprojected, unprojectedCount, running, runBatch, reload }
}
