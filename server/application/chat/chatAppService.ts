import { addHistory } from '../shared/dbUtils.js'
import { chatRepository } from '../../repositories/chatRepository.js'

export function createChatAppService(repository = chatRepository) {
  return {
    getChat(targetId: string) {
      const messages = repository.getMessagesBySessionId(targetId)
      const session = repository.getSessionByTargetId(targetId)
      return { messages, session }
    },
    addMessage(targetId: string, payload: Record<string, any>) {
      const {
        role,
        content,
        name,
        time,
        envDate,
        envWeather,
        envLocation,
        crowdName,
        memberName,
        narrationProfileId,
        narration_profile_id,
        narrationProfileName,
        narration_profile_name,
        narrationProfileKind,
        narration_profile_kind,
        includeInContext,
        include_in_context,
        image,
        model,
        autoWriteHidden,
        auto_write_hidden,
        autoWriteHiddenAt,
        auto_write_hidden_at,
        autoWriteBatchId,
        auto_write_batch_id,
        autoWriteHiddenReason,
        auto_write_hidden_reason
      } = payload
      const createdAt = new Date().toISOString()
      const result = repository.insertMessage(targetId, {
        role,
        messageKind: payload.messageKind ?? payload.message_kind,
        content,
        name: name || '',
        time: time || '',
        envDate: envDate || '',
        envWeather: envWeather || '',
        envLocation: envLocation || '',
        image: image || '',
        model: model || '',
        crowdName: crowdName || '',
        memberName: memberName || '',
        narrationProfileId: narrationProfileId ?? narration_profile_id ?? '',
        narrationProfileName: narrationProfileName ?? narration_profile_name ?? '',
        narrationProfileKind: narrationProfileKind ?? narration_profile_kind ?? '',
        includeInContext: includeInContext ?? include_in_context,
        createdAt,
        autoWriteHidden: autoWriteHidden ?? auto_write_hidden,
        autoWriteHiddenAt: autoWriteHiddenAt ?? auto_write_hidden_at ?? '',
        autoWriteBatchId: autoWriteBatchId ?? auto_write_batch_id ?? '',
        autoWriteHiddenReason: autoWriteHiddenReason ?? auto_write_hidden_reason ?? ''
      })
      return { ok: true, id: Number((result as any)?.lastInsertRowid || 0), createdAt }
    },
    updateMessage(msgId: string, content: string) {
      repository.updateMessage(msgId, content)
      return { ok: true }
    },
    deleteMessage(msgId: string) {
      repository.deleteMessage(msgId)
      return { ok: true }
    },
    clearChat(targetId: string) {
      repository.clearMessagesBySessionId(targetId)
      addHistory('CLEAR_CHAT', targetId)
      return { ok: true }
    },
    updateSession(targetId: string, payload: Record<string, any>) {
      const { summary, lastSummaryTime, loadedSummaryIds, contextSummary } = payload
      const serializedLoadedSummaryIds = JSON.stringify(loadedSummaryIds || [])
      if (repository.hasSessionByTargetId(targetId)) {
        repository.updateSessionByTargetId(
          targetId,
          summary || '',
          lastSummaryTime || null,
          serializedLoadedSummaryIds,
          contextSummary || ''
        )
      } else {
        repository.insertSession(
          targetId,
          summary || '',
          lastSummaryTime || null,
          serializedLoadedSummaryIds,
          contextSummary || ''
        )
      }
      return { ok: true }
    },
    getSummaries() {
      return repository.getSummaries()
    },
    addSummary(payload: Record<string, any>) {
      const { id, name, content, tags } = payload
      const createdAt = new Date().toISOString()
      repository.insertSummary(
        id,
        name,
        content,
        JSON.stringify(tags || []),
        createdAt
      )
      addHistory('ADD_SUMMARY', name)
      return { ok: true, id, createdAt }
    },
    updateSummary(id: string, payload: Record<string, any>) {
      const { name, content, tags } = payload
      repository.updateSummary(id, name, content, JSON.stringify(tags || []))
      return { ok: true }
    },
    deleteSummary(id: string) {
      repository.deleteSummary(id)
      return { ok: true }
    }
  }
}

export const chatAppService = createChatAppService()
