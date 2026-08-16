import { API } from '../config/api'
import type { ChatStoreRemoteActionDeps } from './chatStoreRemoteActionTypes'
import {
  appendChatCollectionItem,
  createSummaryRecord,
  deleteSummaryRecord,
  patchChatCollectionItem,
  prependChatCollectionItem,
  removeChatCollectionItem,
  updateSummaryRecord
} from '../repositories/chatRepository'

export function createChatStoreSummaryRemoteActions(deps: ChatStoreRemoteActionDeps) {
  async function addSummary(summary: any): Promise<void> {
    await createSummaryRecord(API.SUMMARIES, summary, '添加总结失败')
    deps.summaryLibrary.value = prependChatCollectionItem(deps.summaryLibrary.value, summary)
  }

  async function updateSummary(id: string, changes: Record<string, any>): Promise<void> {
    await updateSummaryRecord(API.SUMMARIES, id, changes, '更新总结失败')
    deps.summaryLibrary.value = patchChatCollectionItem(deps.summaryLibrary.value, id, changes)
  }

  async function deleteSummary(id: string): Promise<void> {
    await deleteSummaryRecord(API.SUMMARIES, id, '删除总结失败')
    deps.summaryLibrary.value = removeChatCollectionItem(deps.summaryLibrary.value, id)
  }

  async function addSmallSummary(summary: any): Promise<void> {
    await createSummaryRecord(API.SMALL_SUMMARIES, summary, '添加小总结失败')
    deps.smallSummaries.value = appendChatCollectionItem(deps.smallSummaries.value, summary)
  }

  async function updateSmallSummary(id: string, changes: Record<string, any>): Promise<void> {
    await updateSummaryRecord(API.SMALL_SUMMARIES, id, changes, '更新小总结失败')
    deps.smallSummaries.value = patchChatCollectionItem(deps.smallSummaries.value, id, changes)
  }

  async function deleteSmallSummary(id: string): Promise<void> {
    await deleteSummaryRecord(API.SMALL_SUMMARIES, id, '删除小总结失败')
    deps.smallSummaries.value = removeChatCollectionItem(deps.smallSummaries.value, id)
  }

  async function addBigSummary(summary: any): Promise<void> {
    await createSummaryRecord(API.BIG_SUMMARIES, summary, '添加大总结失败')
    deps.bigSummaries.value = appendChatCollectionItem(deps.bigSummaries.value, summary)
  }

  async function updateBigSummary(id: string, changes: Record<string, any>): Promise<void> {
    await updateSummaryRecord(API.BIG_SUMMARIES, id, changes, '更新大总结失败')
    deps.bigSummaries.value = patchChatCollectionItem(deps.bigSummaries.value, id, changes)
  }

  async function deleteBigSummary(id: string): Promise<void> {
    await deleteSummaryRecord(API.BIG_SUMMARIES, id, '删除大总结失败')
    deps.bigSummaries.value = removeChatCollectionItem(deps.bigSummaries.value, id)
  }

  return {
    addSummary,
    updateSummary,
    deleteSummary,
    addSmallSummary,
    updateSmallSummary,
    deleteSmallSummary,
    addBigSummary,
    updateBigSummary,
    deleteBigSummary
  }
}
