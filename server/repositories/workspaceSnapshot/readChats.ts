import { createChatRepository } from '../chatRepository.js'
import { createCharacterSnapshotRepository } from '../characterSnapshotRepository.js'
import type { WorkspaceSnapshotReadOptions } from './readPayload.js'
import { encodeSnapshotBlob } from './shared.js'
import { basename } from 'path'
import { readStatusAssetBytes } from '../statusAssetStorage.js'

type ChatRepository = ReturnType<typeof createChatRepository>
type CharacterSnapshotRepository = ReturnType<typeof createCharacterSnapshotRepository>

// 侧栏预览用：剥离思考/好感度标签后截断，避免把整条长消息塞进 bootstrap 快照
function sanitizeLastMessagePreview(rawContent: unknown): string {
  return String(rawContent || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<affection>[\s\S]*?<\/affection>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

// bootstrap 快照不带 chatMessages（消息按会话懒加载），会话元数据必须自带
// 最后一条消息预览/时间/条数，否则侧栏列表只能显示「暂无消息」
function decorateSessionsWithLastMessage(chatRepository: ChatRepository, sessions: Array<Record<string, any>>) {
  const getLastMessage = typeof chatRepository.getLastMessageBySessionId === 'function'
    ? chatRepository.getLastMessageBySessionId
    : null
  const countMessages = typeof chatRepository.countMessagesBySessionId === 'function'
    ? chatRepository.countMessagesBySessionId
    : null
  if (!getLastMessage && !countMessages) return sessions
  return sessions.map((session) => {
    const sessionId = String(session?.id || '')
    if (!sessionId) return session
    const lastMessage = getLastMessage ? getLastMessage(sessionId) : null
    return {
      ...session,
      lastMessagePreview: sanitizeLastMessagePreview(lastMessage?.content),
      lastMessageAt: String(lastMessage?.created_at ?? lastMessage?.createdAt ?? ''),
      messageCount: countMessages ? countMessages(sessionId) : 0
    }
  })
}

export function readChatSnapshotPartition(
  chatRepository: ChatRepository,
  options: WorkspaceSnapshotReadOptions = {},
  characterSnapshotRepository?: CharacterSnapshotRepository
) {
  const includeAllChats = options.includeAllChats === true
  const includeChatMetadata = includeAllChats || options.includeChatMetadata === true
  const getAllGenerationAttempts = typeof chatRepository.getAllGenerationAttempts === 'function'
    ? chatRepository.getAllGenerationAttempts
    : () => []
  const getAllGenerationAttemptArtifacts = typeof chatRepository.getAllGenerationAttemptArtifacts === 'function'
    ? chatRepository.getAllGenerationAttemptArtifacts
    : () => []
  const snapshotRows = includeAllChats && characterSnapshotRepository
    ? characterSnapshotRepository.getAllSnapshots().map((row: Record<string, any>) => ({
        ...row,
        payloadGzipBase64: encodeSnapshotBlob(row.payloadGzip ?? row.payload_gzip),
        payloadGzip: undefined,
        payload_gzip: undefined
      }))
    : []
  const branchRows = includeAllChats && characterSnapshotRepository
    ? characterSnapshotRepository.getAllBranches().map((row: Record<string, any>) => ({
        ...row,
        payloadGzipBase64: encodeSnapshotBlob(row.payloadGzip ?? row.payload_gzip),
        payloadGzip: undefined,
        payload_gzip: undefined
      }))
    : []
  const statusAssetRows = includeAllChats && typeof chatRepository.getAllStatusAssets === 'function'
    ? chatRepository.getAllStatusAssets().map((row: Record<string, any>) => {
        const bytes = readStatusAssetBytes(row.storedPath ?? row.stored_path)
        if (!bytes) throw new Error(`状态资产文件缺失，无法导出快照：${String(row.id || '')}`)
        return {
          ...row,
          fileName: basename(String(row.storedPath ?? row.stored_path ?? '')),
          fileBase64: encodeSnapshotBlob(bytes),
          storedPath: undefined,
          stored_path: undefined
        }
      })
    : []
  return {
    summaryLibrary: chatRepository.getSummaryLibrary(),
    smallSummaries: chatRepository.getSmallSummaries(),
    bigSummaries: chatRepository.getBigSummaries(),
    chatSessions: includeChatMetadata ? decorateSessionsWithLastMessage(chatRepository, chatRepository.getAllSessions()) : [],
    chatSessionParticipants: includeChatMetadata ? chatRepository.getAllSessionParticipants() : [],
    chatSessionCharacterPresences: includeAllChats && typeof chatRepository.getAllCharacterPresences === 'function'
      ? chatRepository.getAllCharacterPresences()
      : [],
    chatSessionCharacterPresenceEvents: includeAllChats && typeof chatRepository.getAllCharacterPresenceEvents === 'function'
      ? chatRepository.getAllCharacterPresenceEvents()
      : [],
    chatSessionNarrativeOverrides: includeAllChats && typeof chatRepository.getAllSessionNarrativeOverrides === 'function'
      ? chatRepository.getAllSessionNarrativeOverrides()
      : [],
    chatSessionOrchestrationStates: includeAllChats && typeof chatRepository.getAllSessionOrchestrationStates === 'function'
      ? chatRepository.getAllSessionOrchestrationStates()
      : [],
    characterSnapshots: snapshotRows,
    chatSessionCharacterBranches: branchRows,
    chatMessages: includeAllChats ? chatRepository.getAllMessages() : [],
    chatMessageProjections: includeAllChats ? chatRepository.getAllMessageProjections() : [],
    chatMessageProjectionVisibility: includeAllChats ? chatRepository.getAllMessageProjectionVisibility() : [],
    chatProjectionWritebackRuns: includeAllChats ? chatRepository.getAllProjectionWritebackRuns() : [],
    chatSessionTemporaryCharacters: includeAllChats ? chatRepository.getAllSessionTemporaryCharacters() : [],
    chatSessionTemporaryEntities: includeAllChats ? chatRepository.getAllSessionTemporaryEntities() : [],
    chatStatusPanelTemplates: includeAllChats && typeof chatRepository.getAllStatusPanelTemplates === 'function' ? chatRepository.getAllStatusPanelTemplates() : [],
    chatStatusPanels: includeAllChats && typeof chatRepository.getAllStatusPanels === 'function' ? chatRepository.getAllStatusPanels() : [],
    chatStatusPanelEvents: includeAllChats && typeof chatRepository.getAllStatusPanelEvents === 'function' ? chatRepository.getAllStatusPanelEvents() : [],
    chatStatusAssets: statusAssetRows,
    // 世界（地图系统批3 接快照）：世界级归属的根，随聊天域导出
    worlds: includeAllChats && typeof chatRepository.getAllWorlds === 'function' ? chatRepository.getAllWorlds() : [],
    worldEntities: includeAllChats && typeof chatRepository.getAllWorldEntities === 'function' ? chatRepository.getAllWorldEntities() : [],
    // 地图双表（批4 接快照）：图纸+要素随 worlds 一起走，否则世界恢复后地图悬空
    chatMapSheets: includeAllChats && typeof chatRepository.getAllMapSheets === 'function' ? chatRepository.getAllMapSheets() : [],
    chatMapFeatures: includeAllChats && typeof chatRepository.getAllMapFeatures === 'function' ? chatRepository.getAllMapFeatures() : [],
    worldNarrativeConfigs: includeAllChats && typeof chatRepository.getAllNarrativeConfigs === 'function' ? chatRepository.getAllNarrativeConfigs() : [],
    worldNarrativeSeeds: includeAllChats && typeof chatRepository.getAllNarrativeSeeds === 'function' ? chatRepository.getAllNarrativeSeeds() : [],
    worldNarrativeSeedParticipants: includeAllChats && typeof chatRepository.getAllNarrativeSeedParticipants === 'function' ? chatRepository.getAllNarrativeSeedParticipants() : [],
    worldNarrativeSeedLinks: includeAllChats && typeof chatRepository.getAllNarrativeSeedLinks === 'function' ? chatRepository.getAllNarrativeSeedLinks() : [],
    worldNarrativeSeedEvents: includeAllChats && typeof chatRepository.getAllNarrativeSeedEvents === 'function' ? chatRepository.getAllNarrativeSeedEvents() : [],
    chatMessageNotes: includeAllChats ? chatRepository.getAllMessageNotes() : [],
    chatAffectGateAudits: includeAllChats ? chatRepository.getAllAffectGateAudits() : [],
    chatAffectLedgerEntries: includeAllChats ? chatRepository.getAllAffectLedgerEntries() : [],
    chatAffectResidueCheckpoints: includeAllChats ? chatRepository.getAllAffectResidueCheckpoints() : [],
    chatPromptLogs: includeAllChats ? chatRepository.getAllPromptLogs() : [],
    chatRecallActivityLogs: includeAllChats ? chatRepository.getAllRecallActivityLogs() : [],
    chatGenerationAttempts: includeAllChats ? getAllGenerationAttempts() : [],
    chatGenerationAttemptArtifacts: includeAllChats ? getAllGenerationAttemptArtifacts() : []
  }
}
