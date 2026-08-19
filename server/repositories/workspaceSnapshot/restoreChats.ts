import { createChatRepository } from '../chatRepository.js'
import { createCharacterSnapshotRepository } from '../characterSnapshotRepository.js'
import { normalizeChatSessionReplyPipelineMode } from '../../../src/app/chatReplyPipelineMode.js'
import { decodeSnapshotBlob, toJson, toNum, toText } from './shared.js'
import { restoreStatusAssetBytes } from '../statusAssetStorage.js'
import {
  ORCHESTRATION_PRESENCE_EVENT_TYPES,
  ORCHESTRATION_PRESENCE_STATES,
  ORCHESTRATION_PRESENCE_TRANSITIONS
} from '../../../shared/orchestrationWorkspace.js'

type ChatRepository = ReturnType<typeof createChatRepository>
type CharacterSnapshotRepository = ReturnType<typeof createCharacterSnapshotRepository>

function composeVirtualSceneLocationLabel(
  large: unknown,
  middle: unknown,
  small: unknown,
  legacy: unknown = ''
): string {
  const largeText = toText(large, '')
  const middleText = toText(middle, '')
  const smallText = toText(small, '')
  const legacyText = toText(legacy, '')
  const tail = smallText || (!largeText && !middleText ? legacyText : '')
  const parts = [largeText, middleText, tail].filter(Boolean)
  if (parts.length) return parts.join(' / ')
  return legacyText
}

function splitLegacyVirtualSceneLocation(value: unknown): { large: string; middle: string; small: string } {
  const text = toText(value, '')
  if (!text) return { large: '', middle: '', small: '' }
  const parts = text
    .split(/\s*(?:\/|／|｜|\||>|＞)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length >= 3) {
    return {
      large: parts[0],
      middle: parts[1],
      small: parts.slice(2).join(' / ')
    }
  }
  if (parts.length === 2) {
    return {
      large: parts[0],
      middle: parts[1],
      small: ''
    }
  }
  return {
    large: '',
    middle: '',
    small: text
  }
}

function resolveVirtualSceneLocationParts(session: any): { large: string; middle: string; small: string; legacy: string } {
  const large = toText(session?.virtualLocationLarge ?? session?.virtual_location_large, '')
  const middle = toText(session?.virtualLocationMiddle ?? session?.virtual_location_middle, '')
  const small = toText(session?.virtualLocationSmall ?? session?.virtual_location_small, '')
  const legacy = toText(session?.virtualLocation ?? session?.virtual_location, '')
  if (large || middle || small) return { large, middle, small, legacy }
  return { ...splitLegacyVirtualSceneLocation(legacy), legacy }
}

function parseSnapshotObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function assertStatusAssetReferencesAreRestorable(payload: Record<string, any>) {
  const assetIds = new Set((Array.isArray(payload.chatStatusAssets) ? payload.chatStatusAssets : [])
    .map((item: any) => toText(item?.id, ''))
    .filter(Boolean))
  for (const panel of Array.isArray(payload.chatStatusPanels) ? payload.chatStatusPanels : []) {
    const values = parseSnapshotObject(panel?.values ?? panel?.valuesJson ?? panel?.values_json)
    for (const value of Object.values(values)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const ref = value as Record<string, unknown>
      if (toText(ref.kind, '') !== 'image') continue
      const assetId = toText(ref.assetId ?? ref.asset_id, '')
      if (!assetId || !assetIds.has(assetId)) {
        throw new Error(`状态面板快照引用了缺失的图片资产：${toText(panel?.id, '未知面板')} / ${assetId || '空 assetId'}`)
      }
    }
  }
}

export function applyChatSnapshotPartition(
  chatRepository: ChatRepository,
  payload: Record<string, any>,
  characterSnapshotRepository?: CharacterSnapshotRepository
) {
  // 完整快照是状态面板与富媒体的共同真值：先拒绝悬空引用，不把半套数据写进正式库。
  assertStatusAssetReferencesAreRestorable(payload)
  if (Array.isArray(payload.summaryLibrary)) {
    chatRepository.replaceSummaryLibrary(payload.summaryLibrary.map((item: any, index: number) => ({
      id: toText(item?.id || `summary_${index}`),
      title: toText(item?.title, ''),
      content: toText(item?.content, ''),
      tags: toJson(item?.tags, []),
      charId: toText(item?.charId ?? item?.char_id, ''),
      createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
    })))
  }

  if (Array.isArray(payload.smallSummaries)) {
    chatRepository.replaceSmallSummaries(payload.smallSummaries.map((item: any, index: number) => ({
      id: toText(item?.id || `small_${index}`),
      charId: toText(item?.charId ?? item?.char_id, ''),
      sessionId: toText(item?.sessionId ?? item?.session_id, ''),
      name: toText(item?.name, ''),
      content: toText(item?.content, ''),
      tags: toJson(item?.tags, []),
      createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
      updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
    })))
  }

  if (Array.isArray(payload.bigSummaries)) {
    chatRepository.replaceBigSummaries(payload.bigSummaries.map((item: any, index: number) => ({
      id: toText(item?.id || `big_${index}`),
      name: toText(item?.name, ''),
      content: toText(item?.content, ''),
      mergedSummaryIds: toJson(item?.mergedSummaryIds ?? item?.merged_summary_ids, []),
      createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
      updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
    })))
  }

  const hasFullChatSessions = Array.isArray(payload.chatSessions)
  const hasFullChatMessages = Array.isArray(payload.chatMessages)
  if (hasFullChatSessions || hasFullChatMessages) {
    chatRepository.replaceChatSessions((payload.chatSessions || []).map((session: any) => {
      const sessionId = toText(session?.id ?? session?.targetId ?? session?.target_id, '')
      const locationParts = resolveVirtualSceneLocationParts(session)
      return {
        id: sessionId,
        target_id: toText(session?.targetId ?? session?.target_id, sessionId),
        target_type: toText(session?.targetType ?? session?.target_type, sessionId.startsWith('group_') ? 'group' : (sessionId.startsWith('crowd_') ? 'crowd' : 'char')),
        title: toText(session?.title, ''),
        summary: toText(session?.summary, ''),
        last_summary_time: toText(session?.lastSummaryTime ?? session?.last_summary_time, ''),
        context_summary: toText(session?.contextSummary ?? session?.context_summary, ''),
        context_summary_message_id: toNum(session?.contextSummaryMessageId ?? session?.context_summary_message_id, 0),
        caps_residue_state_json: '{}',
        loaded_summary_ids: toJson(session?.loadedSummaryIds ?? session?.loaded_summary_ids, []),
        virtual_scene_name: toText(session?.virtualSceneName ?? session?.virtual_scene_name, ''),
        virtual_scene_desc: toText(session?.virtualSceneDesc ?? session?.virtual_scene_desc, ''),
        virtual_location_large: locationParts.large,
        virtual_location_middle: locationParts.middle,
        virtual_location_small: locationParts.small,
        virtual_location: composeVirtualSceneLocationLabel(
          locationParts.large,
          locationParts.middle,
          locationParts.small,
          locationParts.legacy
        ),
        virtual_scene_world_id: toText(session?.virtualSceneWorldId ?? session?.virtual_scene_world_id, ''),
        virtual_location_sheet_id: toText(session?.virtualLocationSheetId ?? session?.virtual_location_sheet_id, ''),
        virtual_location_feature_id: toText(session?.virtualLocationFeatureId ?? session?.virtual_location_feature_id, ''),
        virtual_real_location: toText(session?.virtualRealLocation ?? session?.virtual_real_location, ''),
        virtual_time: toText(session?.virtualTime ?? session?.virtual_time, ''),
        virtual_time_anchor: toNum(session?.virtualTimeAnchor ?? session?.virtual_time_anchor, 0),
        virtual_time_base: toNum(session?.virtualTimeBase ?? session?.virtual_time_base, 0),
        virtual_time_rate: toNum(session?.virtualTimeRate ?? session?.virtual_time_rate, 1),
        virtual_weather: toText(session?.virtualWeather ?? session?.virtual_weather, ''),
        virtual_weather_mode: toText(session?.virtualWeatherMode ?? session?.virtual_weather_mode, 'real'),
        bound_alias: toText(session?.boundAlias ?? session?.bound_alias, ''),
        narration_frequency: toText(session?.narrationFrequency ?? session?.narration_frequency, 'standard'),
        narration_temperature: toText(session?.narrationTemperature ?? session?.narration_temperature, 'standard'),
        narration_profiles: Array.isArray(session?.narrationProfiles ?? session?.narration_profiles)
          ? JSON.stringify(session?.narrationProfiles ?? session?.narration_profiles)
          : toText(session?.narrationProfiles ?? session?.narration_profiles, '[]'),
        narration_force_enabled: toNum(session?.narrationForceEnabled ?? session?.narration_force_enabled, 0) ? 1 : 0,
        chat_font_scale: Math.min(1.25, Math.max(0.85, toNum(session?.chatFontScale ?? session?.chat_font_scale, 1))),
        dynamic_world_enabled: toNum(session?.dynamicWorldEnabled ?? session?.dynamic_world_enabled, 0) ? 1 : 0,
        reply_pipeline_mode: normalizeChatSessionReplyPipelineMode(session?.replyPipelineMode ?? session?.reply_pipeline_mode),
        temp_model: toText(session?.tempModel ?? session?.temp_model, ''),
        temp_preset: toText(session?.tempPreset ?? session?.temp_preset, ''),
        linked_archive_id: toText(session?.linkedArchiveId ?? session?.linked_archive_id, ''),
        is_archived: toNum(session?.isArchived ?? session?.is_archived, 0),
        archive_name: toText(session?.archiveName ?? session?.archive_name, ''),
        archive_category: toText(session?.archiveCategory ?? session?.archive_category, ''),
        source_target_id: toText(session?.sourceTargetId ?? session?.source_target_id, ''),
        created_at: toText(session?.createdAt ?? session?.created_at, ''),
        updated_at: toText(session?.updatedAt ?? session?.updated_at, new Date().toISOString()),
        // kind 列进了 sessionBaseColumns 但旧映射漏了它：缺键=undefined 参数会被 db 断言拒绝（既有雷·批3 顺手修）
        kind: toText(session?.kind, 'roleplay'),
        // 会话所属世界（地图系统批3）：旧快照无此键回退空串=未挂
        world_id: toText(session?.worldId ?? session?.world_id, '')
      }
    }))

    chatRepository.replaceChatMessages((payload.chatMessages || []).map((msg: any) => ({
      sessionId: toText(msg?.sessionId ?? msg?.session_id, ''),
      role: toText(msg?.role, 'assistant'),
      messageKind: toText(msg?.messageKind ?? msg?.message_kind, msg?.role === 'system' ? 'system' : 'chat'),
      content: toText(msg?.content, ''),
      time: toText(msg?.time, ''),
      envDate: toText(msg?.envDate ?? msg?.env_date, ''),
      envWeather: toText(msg?.envWeather ?? msg?.env_weather, ''),
      envLocation: toText(msg?.envLocation ?? msg?.env_location, ''),
      image: toText(msg?.image, ''),
      model: toText(msg?.model, ''),
      crowdName: toText(msg?.crowdName ?? msg?.crowd_name, ''),
      memberName: toText(msg?.memberName ?? msg?.member_name ?? msg?.name, ''),
      narrationProfileId: toText(msg?.narrationProfileId ?? msg?.narration_profile_id, ''),
      narrationProfileName: toText(msg?.narrationProfileName ?? msg?.narration_profile_name, ''),
      narrationProfileKind: toText(msg?.narrationProfileKind ?? msg?.narration_profile_kind, ''),
      includeInContext: toNum(msg?.includeInContext ?? msg?.include_in_context, 1),
      messageSourceKind: toText(msg?.messageSourceKind ?? msg?.message_source_kind, ''),
      focusedActionGroupId: toText(msg?.focusedActionGroupId ?? msg?.focused_action_group_id, ''),
      focusedActionVisibility: toText(msg?.focusedActionVisibility ?? msg?.focused_action_visibility, ''),
      versionsJson: toJson(msg?.versionList ?? msg?.versionsJson ?? msg?.versions_json, []),
      activeVersionIndex: Number.isInteger(msg?.activeVersionIndex ?? msg?.active_version_index) ? Number(msg?.activeVersionIndex ?? msg?.active_version_index) : 0,
      // 图片附件真值：导出侧 getAllMessages() 是 SELECT * + toCamel，本来就带 attachmentsJson，这里补上读取即可回填。
      attachmentsJson: toJson(msg?.attachmentsJson ?? msg?.attachments_json, []),
      // 星依过程流真值（过程流内联持久化计划·2026-07-13）：与 attachmentsJson 同构，旧快照没有这个键则回退空串。
      turnStreamJson: toJson(msg?.turnStreamJson ?? msg?.turn_stream_json, ''),
      createdAt: toText(msg?.createdAt ?? msg?.created_at, new Date().toISOString()),
      autoWriteHidden: toNum(msg?.autoWriteHidden ?? msg?.auto_write_hidden, 0),
      autoWriteHiddenAt: toText(msg?.autoWriteHiddenAt ?? msg?.auto_write_hidden_at, ''),
      autoWriteBatchId: toText(msg?.autoWriteBatchId ?? msg?.auto_write_batch_id, ''),
      autoWriteHiddenReason: toText(msg?.autoWriteHiddenReason ?? msg?.auto_write_hidden_reason, '')
    })))

    if (Array.isArray(payload.chatMessageProjections)) {
      chatRepository.replaceMessageProjections(payload.chatMessageProjections.map((projection: any, index: number) => ({
        id: toText(projection?.id, `message_projection_${index}`),
        sessionId: toText(projection?.sessionId ?? projection?.session_id, ''),
        messageId: toNum(projection?.messageId ?? projection?.message_id, 0),
        attemptId: toText(projection?.attemptId ?? projection?.attempt_id, ''),
        status: toText(projection?.status, 'running'),
        messageKind: toText(projection?.messageKind ?? projection?.message_kind, 'chat'),
        speakerId: toText(projection?.speakerId ?? projection?.speaker_id, ''),
        speakerName: toText(projection?.speakerName ?? projection?.speaker_name, ''),
        audienceIdsJson: toJson(projection?.audienceIds ?? projection?.audienceIdsJson ?? projection?.audience_ids_json, []),
        audienceNamesJson: toJson(projection?.audienceNames ?? projection?.audienceNamesJson ?? projection?.audience_names_json, []),
        participantsJson: toJson(projection?.participants ?? projection?.participantsJson ?? projection?.participants_json, []),
        objectiveFact: toText(projection?.objectiveFact ?? projection?.objective_fact, ''),
        fallbackCleanText: toText(projection?.fallbackCleanText ?? projection?.fallback_clean_text, ''),
        startEnvJson: toJson(projection?.startEnv ?? projection?.startEnvJson ?? projection?.start_env_json, {}),
        endEnvJson: toJson(projection?.endEnv ?? projection?.endEnvJson ?? projection?.end_env_json, {}),
        changedJson: toJson(projection?.changed ?? projection?.changedJson ?? projection?.changed_json, {}),
        sourceProjectionIdsJson: toJson(projection?.sourceProjectionIds ?? projection?.sourceProjectionIdsJson ?? projection?.source_projection_ids_json, []),
        failureStage: toText(projection?.failureStage ?? projection?.failure_stage, ''),
        failureReason: toText(projection?.failureReason ?? projection?.failure_reason, ''),
        createdAt: toText(projection?.createdAt ?? projection?.created_at, new Date().toISOString()),
        updatedAt: toText(projection?.updatedAt ?? projection?.updated_at, new Date().toISOString()),
        completedAt: toText(projection?.completedAt ?? projection?.completed_at, '')
      })).filter((projection) => projection.id && projection.sessionId && projection.messageId > 0))
    } else {
      chatRepository.replaceMessageProjections([])
    }

    if (Array.isArray(payload.chatMessageProjectionVisibility)) {
      chatRepository.replaceMessageProjectionVisibility(payload.chatMessageProjectionVisibility.map((visibility: any, index: number) => ({
        id: toText(visibility?.id, `message_projection_visibility_${index}`),
        projectionId: toText(visibility?.projectionId ?? visibility?.projection_id, ''),
        sessionId: toText(visibility?.sessionId ?? visibility?.session_id, ''),
        messageId: toNum(visibility?.messageId ?? visibility?.message_id, 0),
        characterId: toText(visibility?.characterId ?? visibility?.character_id, ''),
        visibility: toText(visibility?.visibility, 'visible'),
        reason: toText(visibility?.reason, 'system'),
        writebackRunId: toText(visibility?.writebackRunId ?? visibility?.writeback_run_id, ''),
        createdAt: toText(visibility?.createdAt ?? visibility?.created_at, new Date().toISOString()),
        updatedAt: toText(visibility?.updatedAt ?? visibility?.updated_at, new Date().toISOString())
      })).filter((visibility) => visibility.id && visibility.projectionId && visibility.sessionId && visibility.characterId))
    } else {
      chatRepository.replaceMessageProjectionVisibility([])
    }

    if (Array.isArray(payload.chatProjectionWritebackRuns)) {
      chatRepository.replaceProjectionWritebackRuns(payload.chatProjectionWritebackRuns.map((run: any, index: number) => ({
        id: toText(run?.id, `projection_writeback_run_${index}`),
        sessionId: toText(run?.sessionId ?? run?.session_id, ''),
        characterId: toText(run?.characterId ?? run?.character_id, ''),
        runKind: toText(run?.runKind ?? run?.run_kind, 'auto'),
        status: toText(run?.status, 'running'),
        rangeStartMessageId: toNum(run?.rangeStartMessageId ?? run?.range_start_message_id, 0),
        rangeEndMessageId: toNum(run?.rangeEndMessageId ?? run?.range_end_message_id, 0),
        sourceProjectionIdsJson: toJson(run?.sourceProjectionIds ?? run?.sourceProjectionIdsJson ?? run?.source_projection_ids_json, []),
        successEventIdsJson: toJson(run?.successEventIds ?? run?.successEventIdsJson ?? run?.success_event_ids_json, []),
        failedEventsJson: toJson(run?.failedEvents ?? run?.failedEventsJson ?? run?.failed_events_json, []),
        errorJson: toJson(run?.error ?? run?.errorJson ?? run?.error_json, {}),
        createdAt: toText(run?.createdAt ?? run?.created_at, new Date().toISOString()),
        updatedAt: toText(run?.updatedAt ?? run?.updated_at, new Date().toISOString()),
        completedAt: toText(run?.completedAt ?? run?.completed_at, '')
      })).filter((run) => run.id && run.sessionId && run.characterId))
    } else {
      chatRepository.replaceProjectionWritebackRuns([])
    }

    if (Array.isArray(payload.chatAffectGateAudits)) {
      chatRepository.replaceChatAffectGateAudits(payload.chatAffectGateAudits.map((entry: any, index: number) => ({
        id: toText(entry?.id, `affect_gate_audit_${index}`),
        sessionId: toText(entry?.sessionId ?? entry?.session_id, ''),
        roundId: toText(entry?.roundId ?? entry?.round_id, ''),
        status: toText(entry?.status, 'failed'),
        source: toText(entry?.source, 'quick_judge'),
        reason: toText(entry?.reason, ''),
        situationFrameJson: toJson(entry?.situationFrame ?? entry?.situationFrameJson ?? entry?.situation_frame_json, {}),
        rawOutput: toText(entry?.rawOutput ?? entry?.raw_output, ''),
        staleAt: toText(entry?.staleAt ?? entry?.stale_at, ''),
        staleReason: toText(entry?.staleReason ?? entry?.stale_reason, ''),
        staleTriggerMessageId: toNum(entry?.staleTriggerMessageId ?? entry?.stale_trigger_message_id, 0),
        createdAt: toText(entry?.createdAt ?? entry?.created_at, new Date().toISOString())
      })).filter((entry) => entry.id && entry.sessionId && entry.roundId))
    } else {
      chatRepository.replaceChatAffectGateAudits([])
    }

    if (Array.isArray(payload.chatAffectLedgerEntries)) {
      chatRepository.replaceChatAffectLedgerEntries(payload.chatAffectLedgerEntries.map((entry: any, index: number) => ({
        id: toText(entry?.id, `affect_ledger_${index}`),
        sessionId: toText(entry?.sessionId ?? entry?.session_id, ''),
        roundId: toText(entry?.roundId ?? entry?.round_id, ''),
        characterId: toText(entry?.characterId ?? entry?.character_id, ''),
        sourceMessageIdsJson: toJson(entry?.sourceMessageIds ?? entry?.sourceMessageIdsJson ?? entry?.source_message_ids_json, []),
        situationTagsJson: toJson(entry?.situationTags ?? entry?.situationTagsJson ?? entry?.situation_tags_json, []),
        policyImpactsJson: toJson(entry?.policyImpacts ?? entry?.policyImpactsJson ?? entry?.policy_impacts_json, {}),
        guardImpactsJson: toJson(entry?.guardImpacts ?? entry?.guardImpactsJson ?? entry?.guard_impacts_json, {}),
        strength: toText(entry?.strength, 'small'),
        halfLifeRounds: Math.max(1, toNum(entry?.halfLifeRounds ?? entry?.half_life_rounds, 3)),
        reason: toText(entry?.reason, ''),
        evidenceHash: toText(entry?.evidenceHash ?? entry?.evidence_hash, ''),
        staleAt: toText(entry?.staleAt ?? entry?.stale_at, ''),
        staleReason: toText(entry?.staleReason ?? entry?.stale_reason, ''),
        staleTriggerMessageId: toNum(entry?.staleTriggerMessageId ?? entry?.stale_trigger_message_id, 0),
        createdAt: toText(entry?.createdAt ?? entry?.created_at, new Date().toISOString())
      })).filter((entry) => entry.id && entry.sessionId && entry.roundId && entry.characterId))
    } else {
      chatRepository.replaceChatAffectLedgerEntries([])
    }

    if (Array.isArray(payload.chatAffectResidueCheckpoints)) {
      chatRepository.replaceChatAffectResidueCheckpoints(payload.chatAffectResidueCheckpoints.map((entry: any, index: number) => ({
        id: toText(entry?.id, `affect_residue_${index}`),
        sessionId: toText(entry?.sessionId ?? entry?.session_id, ''),
        characterId: toText(entry?.characterId ?? entry?.character_id, ''),
        coveredRoundStart: toText(entry?.coveredRoundStart ?? entry?.covered_round_start, ''),
        coveredRoundEnd: toText(entry?.coveredRoundEnd ?? entry?.covered_round_end, ''),
        residuePolicyImpactsJson: toJson(entry?.residuePolicyImpacts ?? entry?.residuePolicyImpactsJson ?? entry?.residue_policy_impacts_json, {}),
        residueGuardImpactsJson: toJson(entry?.residueGuardImpacts ?? entry?.residueGuardImpactsJson ?? entry?.residue_guard_impacts_json, {}),
        residueSummary: toText(entry?.residueSummary ?? entry?.residue_summary, ''),
        sourceEntryIdsHash: toText(entry?.sourceEntryIdsHash ?? entry?.source_entry_ids_hash, ''),
        sourceEntryCount: Math.max(0, toNum(entry?.sourceEntryCount ?? entry?.source_entry_count, 0)),
        createdAt: toText(entry?.createdAt ?? entry?.created_at, new Date().toISOString()),
        updatedAt: toText(entry?.updatedAt ?? entry?.updated_at, new Date().toISOString())
      })).filter((entry) => entry.id && entry.sessionId && entry.characterId))
    } else {
      chatRepository.replaceChatAffectResidueCheckpoints([])
    }

    if (Array.isArray(payload.chatMessageNotes)) {
      chatRepository.replaceChatMessageNotes(payload.chatMessageNotes.map((note: any, index: number) => ({
        id: toText(note?.id, `chat_note_${index}`),
        sessionId: toText(note?.sessionId ?? note?.session_id, ''),
        messageId: toNum(note?.messageId ?? note?.message_id, 0),
        sourceMode: toText(note?.sourceMode ?? note?.source_mode, 'message'),
        sourceText: toText(note?.sourceText ?? note?.source_text, ''),
        messageSnapshot: toText(note?.messageSnapshot ?? note?.message_snapshot, ''),
        messageIndex: toNum(note?.messageIndex ?? note?.message_index, 0),
        floorLabel: toText(note?.floorLabel ?? note?.floor_label, ''),
        speakerName: toText(note?.speakerName ?? note?.speaker_name, ''),
        role: toText(note?.role, ''),
        envDate: toText(note?.envDate ?? note?.env_date, ''),
        envWeather: toText(note?.envWeather ?? note?.env_weather, ''),
        envLocation: toText(note?.envLocation ?? note?.env_location, ''),
        model: toText(note?.model, ''),
        createdAt: toText(note?.createdAt ?? note?.created_at, new Date().toISOString()),
        updatedAt: toText(note?.updatedAt ?? note?.updated_at, new Date().toISOString())
      })).filter((note) => note.id && note.sessionId && note.messageId > 0 && note.sourceText))
    } else {
      chatRepository.replaceChatMessageNotes([])
    }

    if (Array.isArray(payload.chatSessionTemporaryCharacters)) {
      chatRepository.replaceSessionTemporaryCharacters(payload.chatSessionTemporaryCharacters.map((item: any, index: number) => ({
        id: toText(item?.id, `session_temp_character_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        name: toText(item?.name, ''),
        aliasesJson: toJson(item?.aliases ?? item?.aliasesJson ?? item?.aliases_json, []),
        markdown: toText(item?.markdown, ''),
        sourceLedgerJson: toJson(item?.sourceLedger ?? item?.sourceLedgerJson ?? item?.source_ledger_json, []),
        lockedFieldsJson: toJson(item?.lockedFields ?? item?.lockedFieldsJson ?? item?.locked_fields_json, []),
        status: toText(item?.status, 'active'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item) => item.id && item.sessionId && item.name))
    } else {
      chatRepository.replaceSessionTemporaryCharacters([])
    }

    if (Array.isArray(payload.chatSessionTemporaryEntities)) {
      chatRepository.replaceSessionTemporaryEntities(payload.chatSessionTemporaryEntities.map((item: any, index: number) => ({
        id: toText(item?.id, `session_temp_entity_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        kind: toText(item?.kind, 'character'),
        name: toText(item?.name, ''),
        aliasesJson: toJson(item?.aliases ?? item?.aliasesJson ?? item?.aliases_json, []),
        markdown: toText(item?.markdown, ''),
        tagsJson: toJson(item?.tags ?? item?.tagsJson ?? item?.tags_json, []),
        sourceLedgerJson: toJson(item?.sourceLedger ?? item?.sourceLedgerJson ?? item?.source_ledger_json, []),
        status: toText(item?.status, 'active'),
        persistedTargetJson: toJson(item?.persistedTarget ?? item?.persistedTargetJson ?? item?.persisted_target_json, {}),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item) => item.id && item.sessionId && item.kind && item.name))
    } else if (Array.isArray(payload.chatSessionTemporaryCharacters)) {
      chatRepository.replaceSessionTemporaryEntities(payload.chatSessionTemporaryCharacters.map((item: any, index: number) => ({
        id: toText(item?.id, `session_temp_character_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        kind: 'character',
        name: toText(item?.name, ''),
        aliasesJson: toJson(item?.aliases ?? item?.aliasesJson ?? item?.aliases_json, []),
        markdown: toText(item?.markdown, ''),
        tagsJson: '[]',
        sourceLedgerJson: toJson(item?.sourceLedger ?? item?.sourceLedgerJson ?? item?.source_ledger_json, []),
        status: toText(item?.status, 'active'),
        persistedTargetJson: '{}',
        worldId: '',
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item) => item.id && item.sessionId && item.name))
    } else {
      chatRepository.replaceSessionTemporaryEntities([])
    }

    // 世界（地图系统批3 接快照）：状态栏/地图世界级归属的根，先于双表恢复；旧快照无 worlds 键=清空（与会话 world_id 同空自洽）
    if (typeof chatRepository.replaceWorlds === 'function') {
      chatRepository.replaceWorlds((Array.isArray(payload.worlds) ? payload.worlds : []).map((item: any, index: number) => ({
        id: toText(item?.id, `world_${index}`),
        name: toText(item?.name, ''),
        description: toText(item?.description, ''),
        defaultMapSheetId: toText(item?.defaultMapSheetId ?? item?.default_map_sheet_id, ''),
        status: toText(item?.status, 'active'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => item.id && item.name))
    }

    if (typeof chatRepository.replaceWorldEntities === 'function') {
      chatRepository.replaceWorldEntities((Array.isArray(payload.worldEntities) ? payload.worldEntities : []).map((item: any, index: number) => ({
        id: toText(item?.id, `world_entity_${index}`),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        kind: toText(item?.kind, 'other'),
        name: toText(item?.name, ''),
        aliasesJson: toJson(item?.aliases ?? item?.aliasesJson ?? item?.aliases_json, []),
        markdown: toText(item?.markdown, ''),
        tagsJson: toJson(item?.tags ?? item?.tagsJson ?? item?.tags_json, []),
        sourceLedgerJson: toJson(item?.sourceLedger ?? item?.sourceLedgerJson ?? item?.source_ledger_json, []),
        mapSheetId: toText(item?.mapSheetId ?? item?.map_sheet_id, ''),
        mapFeatureId: toText(item?.mapFeatureId ?? item?.map_feature_id, ''),
        status: toText(item?.status, 'active'),
        version: Math.max(1, toNum(item?.version, 1)),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => item.id && item.worldId && item.name))
    }

    // 地图双表（批4 接快照）：随 worlds 恢复；旧快照无键=清空（与空 worlds 自洽）。
    // JSON 列不能用 toText：导出行经 toCamel 已把 JSON 串 parse 成对象，String(对象)='[object Object]' 毁真值
    const toMapJsonText = (value: unknown): string => {
      if (value == null || value === '') return ''
      return toJson(value, '')
    }
    if (typeof chatRepository.replaceMapSheets === 'function') {
      chatRepository.replaceMapSheets((Array.isArray(payload.chatMapSheets) ? payload.chatMapSheets : []).map((item: any, index: number) => ({
        id: toText(item?.id, `map_sheet_${index}`),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        name: toText(item?.name, ''),
        exploredJson: toMapJsonText(item?.exploredJson ?? item?.explored_json ?? item?.explored),
        status: toText(item?.status, 'active'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => item.id && item.worldId && item.name))
    }

    if (typeof chatRepository.replaceMapFeatures === 'function') {
      chatRepository.replaceMapFeatures((Array.isArray(payload.chatMapFeatures) ? payload.chatMapFeatures : []).map((item: any, index: number) => ({
        id: toText(item?.id, `map_feat_${index}`),
        sheetId: toText(item?.sheetId ?? item?.sheet_id, ''),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        kind: toText(item?.kind, 'marker'),
        category: toText(item?.category, ''),
        name: toText(item?.name, ''),
        layer: toText(item?.layer, 'terrain'),
        geometryJson: toMapJsonText(item?.geometryJson ?? item?.geometry_json ?? item?.geometry),
        styleJson: toMapJsonText(item?.styleJson ?? item?.style_json ?? item?.style),
        linksJson: toMapJsonText(item?.linksJson ?? item?.links_json ?? item?.links),
        metaJson: toMapJsonText(item?.metaJson ?? item?.meta_json ?? item?.meta),
        status: toText(item?.status, 'active'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => item.id && item.sheetId && item.worldId))
    }

    // 叙事种子五表随世界完整快照恢复；旧快照无这些键时清空，避免恢复后残留“未来账本”。
    if (typeof chatRepository.replaceNarrativeSeedData === 'function') {
      const jsonObjectText = (value: unknown): string => toJson(value, {})
      chatRepository.replaceNarrativeSeedData({
        configs: (Array.isArray(payload.worldNarrativeConfigs) ? payload.worldNarrativeConfigs : []).map((item: any) => ({
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          content: toText(item?.content, '') || [
            toText(item?.theme, ''),
            toText(item?.longTermTendency ?? item?.long_term_tendency, ''),
            toText(item?.contentBoundaries ?? item?.content_boundaries, ''),
            toText(item?.writerNotes ?? item?.writer_notes, '')
          ].filter(Boolean).join('\n\n'),
          version: Math.max(1, toNum(item?.version, 1)),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
          updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
        })).filter((item: any) => item.worldId),
        seeds: (Array.isArray(payload.worldNarrativeSeeds) ? payload.worldNarrativeSeeds : []).map((item: any) => ({
          id: toText(item?.id, ''),
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          type: toText(item?.type, 'foreshadow'),
          title: toText(item?.title, ''),
          description: toText(item?.description, ''),
          cause: toText(item?.cause, ''),
          currentProgress: toText(item?.currentProgress ?? item?.current_progress, ''),
          expectedOutcome: toText(item?.expectedOutcome ?? item?.expected_outcome, ''),
          startTime: [item?.startTime, item?.start_time, item?.expectedTriggerTime, item?.expected_trigger_time, item?.overdueTime, item?.overdue_time]
            .map((value) => toText(value, ''))
            .find(Boolean) || '',
          lastAdvancedAt: toText(item?.lastAdvancedAt ?? item?.last_advanced_at, ''),
          mapSheetId: toText(item?.mapSheetId ?? item?.map_sheet_id, ''),
          mapFeatureId: toText(item?.mapFeatureId ?? item?.map_feature_id, ''),
          locationText: toText(item?.locationText ?? item?.location_text, ''),
          impactScope: toText(item?.impactScope ?? item?.impact_scope, ''),
          status: toText(item?.status, 'review_required'),
          visibilityMode: toText(item?.visibilityMode ?? item?.visibility_mode, 'director_only'),
          visibilityJson: jsonObjectText(item?.visibilityJson ?? item?.visibility_json ?? item?.visibility),
          allowFrontstage: toNum(item?.allowFrontstage ?? item?.allow_frontstage, 0) ? 1 : 0,
          version: Math.max(1, toNum(item?.version, 1)),
          lastModifiedSource: toText(item?.lastModifiedSource ?? item?.last_modified_source, 'snapshot_restore'),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
          updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
        })).filter((item: any) => item.id && item.worldId && item.title),
        participants: (Array.isArray(payload.worldNarrativeSeedParticipants) ? payload.worldNarrativeSeedParticipants : []).map((item: any) => ({
          id: toText(item?.id, ''),
          seedId: toText(item?.seedId ?? item?.seed_id, ''),
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          participantType: toText(item?.participantType ?? item?.participant_type, 'freeform'),
          participantId: toText(item?.participantId ?? item?.participant_id, ''),
          displayName: toText(item?.displayName ?? item?.display_name, ''),
          relationRole: toText(item?.relationRole ?? item?.relation_role, 'involved'),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
        })).filter((item: any) => item.id && item.seedId && item.worldId),
        links: (Array.isArray(payload.worldNarrativeSeedLinks) ? payload.worldNarrativeSeedLinks : []).map((item: any) => ({
          id: toText(item?.id, ''),
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          sourceSeedId: toText(item?.sourceSeedId ?? item?.source_seed_id, ''),
          targetSeedId: toText(item?.targetSeedId ?? item?.target_seed_id, ''),
          relationType: toText(item?.relationType ?? item?.relation_type, 'caused_by'),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
        })).filter((item: any) => item.id && item.worldId && item.sourceSeedId && item.targetSeedId),
        events: (Array.isArray(payload.worldNarrativeSeedEvents) ? payload.worldNarrativeSeedEvents : []).map((item: any) => ({
          id: toText(item?.id, ''),
          seedId: toText(item?.seedId ?? item?.seed_id, ''),
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          eventType: toText(item?.eventType ?? item?.event_type, 'updated'),
          fromStatus: toText(item?.fromStatus ?? item?.from_status, ''),
          toStatus: toText(item?.toStatus ?? item?.to_status, ''),
          diffJson: jsonObjectText(item?.diffJson ?? item?.diff_json ?? item?.diff),
          sourceSessionId: toText(item?.sourceSessionId ?? item?.source_session_id, ''),
          sourceMessageId: Math.max(0, toNum(item?.sourceMessageId ?? item?.source_message_id, 0)),
          sourceDirectorRunId: toText(item?.sourceDirectorRunId ?? item?.source_director_run_id, ''),
          sourceAgentRunId: toText(item?.sourceAgentRunId ?? item?.source_agent_run_id, ''),
          evidenceSummary: toText(item?.evidenceSummary ?? item?.evidence_summary, ''),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
        })).filter((item: any) => item.id && item.seedId && item.worldId)
      })
    }

    if (typeof chatRepository.replaceStatusPanelTemplates === 'function') {
      chatRepository.replaceStatusPanelTemplates((Array.isArray(payload.chatStatusPanelTemplates) ? payload.chatStatusPanelTemplates : []).map((item: any, index: number) => ({
        id: toText(item?.id, `status_tpl_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        kind: toText(item?.kind, 'character'),
        name: toText(item?.name, ''),
        description: toText(item?.description, ''),
        fieldsJson: toJson(item?.fields ?? item?.fieldsJson ?? item?.fields_json, []),
        presentationJson: (item?.presentation ?? item?.presentationJson ?? item?.presentation_json) == null
          ? ''
          : toJson(item?.presentation ?? item?.presentationJson ?? item?.presentation_json, ''),
        createdBy: toText(item?.createdBy ?? item?.created_by, 'user'),
        version: Math.max(1, toNum(item?.version, 1)),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        status: toText(item?.status, 'active'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => item.id && item.sessionId && item.kind && item.name))
    }

    if (typeof chatRepository.replaceStatusPanels === 'function') {
      const participantIds = new Set((Array.isArray(payload.chatSessionParticipants) ? payload.chatSessionParticipants : [])
        .map((participant: any) => toText(participant?.id, ''))
        .filter(Boolean))
      const statusPanelRows = (Array.isArray(payload.chatStatusPanels) ? payload.chatStatusPanels : []).map((item: any, index: number) => ({
        id: toText(item?.id, `status_panel_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        templateId: toText(item?.templateId ?? item?.template_id, ''),
        name: toText(item?.name, ''),
        description: toText(item?.description, ''),
        hostType: toText(item?.hostType ?? item?.host_type, 'none'),
        hostId: toText(item?.hostId ?? item?.host_id, ''),
        valuesJson: toJson(item?.values ?? item?.valuesJson ?? item?.values_json, {}),
        // 实例字段快照：缺失保持空串（=旧实例回退模板字段），有值才 JSON 化透传
        fieldsJson: (item?.fields ?? item?.fieldsJson ?? item?.fields_json) == null
          ? ''
          : toJson(item?.fields ?? item?.fieldsJson ?? item?.fields_json, []),
        presentationJson: (item?.presentation ?? item?.presentationJson ?? item?.presentation_json) == null
          ? ''
          : toJson(item?.presentation ?? item?.presentationJson ?? item?.presentation_json, ''),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        status: toText(item?.status, 'active'),
        version: Math.max(1, toNum(item?.version, 1)),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => (
        item.id && item.sessionId && item.templateId && item.name
        && (item.hostType !== 'session_character' || participantIds.has(item.hostId))
      ))
      chatRepository.replaceStatusPanels(statusPanelRows)
      const statusPanelIds = new Set(statusPanelRows.map((item: any) => item.id))
      if (typeof chatRepository.replaceStatusPanelEvents === 'function') {
        chatRepository.replaceStatusPanelEvents((Array.isArray(payload.chatStatusPanelEvents) ? payload.chatStatusPanelEvents : []).map((item: any, index: number) => ({
          id: toText(item?.id, `status_panel_event_${index}`),
          panelId: toText(item?.panelId ?? item?.panel_id, ''),
          sessionId: toText(item?.sessionId ?? item?.session_id, ''),
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          eventType: toText(item?.eventType ?? item?.event_type, ''),
          fromVersion: Math.max(0, toNum(item?.fromVersion ?? item?.from_version, 0)),
          toVersion: Math.max(0, toNum(item?.toVersion ?? item?.to_version, 0)),
          patchJson: toJson(item?.patch ?? item?.patchJson ?? item?.patch_json, {}),
          source: toText(item?.source, 'snapshot_restore'),
          idempotencyKey: toText(item?.idempotencyKey ?? item?.idempotency_key, ''),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
        })).filter((item: any) => (
          item.id && item.panelId && item.sessionId && item.idempotencyKey
          && ['created', 'patched', 'deleted'].includes(item.eventType)
          && (statusPanelIds.has(item.panelId) || item.eventType === 'deleted')
        )))
      }
    }

    if (typeof chatRepository.replaceStatusAssets === 'function') {
      const statusAssets = (Array.isArray(payload.chatStatusAssets) ? payload.chatStatusAssets : []).map((item: any, index: number) => {
        const id = toText(item?.id, `status_asset_${index}`)
        const fileName = toText(item?.fileName ?? item?.file_name, '')
        const fileBase64 = toText(item?.fileBase64 ?? item?.file_base64, '')
        if (!fileName || !fileBase64) throw new Error(`状态资产快照缺少文件内容：${id}`)
        const mimeType = toText(item?.mimeType ?? item?.mime_type, '')
        const sizeBytes = Math.max(0, toNum(item?.sizeBytes ?? item?.size_bytes, 0))
        const sha256 = toText(item?.sha256, '')
        return {
          id,
          sessionId: toText(item?.sessionId ?? item?.session_id, ''),
          worldId: toText(item?.worldId ?? item?.world_id, ''),
          kind: 'image',
          originalFilename: toText(item?.originalFilename ?? item?.original_filename, fileName),
          storedPath: restoreStatusAssetBytes(fileName, decodeSnapshotBlob(fileBase64), {
            assetId: id,
            mimeType,
            sha256,
            sizeBytes
          }),
          mimeType,
          sizeBytes,
          sha256,
          sourceType: toText(item?.sourceType ?? item?.source_type, 'upload'),
          sourceRefJson: toJson(item?.sourceRef ?? item?.sourceRefJson ?? item?.source_ref_json, {}),
          status: toText(item?.status, 'active'),
          createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
          updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
        }
      }).filter((item: any) => item.id && item.sessionId && item.mimeType)
      chatRepository.replaceStatusAssets(statusAssets)
    }

    if (Array.isArray(payload.chatSessionParticipants)) {
      const normalizedParticipants = payload.chatSessionParticipants.map((participant: any, index: number) => {
        const sessionId = toText(participant?.sessionId ?? participant?.session_id, '')
        const targetId = toText(participant?.participantTargetId ?? participant?.participant_target_id, '')
        const characterStateMode = toText(participant?.characterStateMode ?? participant?.character_state_mode, '') === 'independent_snapshot'
          ? 'independent_snapshot'
          : 'follow_main'
        return {
          id: toText(participant?.id, sessionId && targetId ? `participant_${sessionId}_${targetId}` : `participant_${index}`),
          sessionId,
          participantTargetId: targetId,
          participantType: toText(participant?.participantType ?? participant?.participant_type, 'char'),
          displayOrder: toNum(participant?.displayOrder ?? participant?.display_order, index),
          replyProbability: toNum(participant?.replyProbability ?? participant?.reply_probability, 100),
          role: toText(participant?.role, 'member'),
          characterStateMode,
          characterBranchId: characterStateMode === 'independent_snapshot'
            ? toText(participant?.characterBranchId ?? participant?.character_branch_id, '')
            : '',
          createdAt: toText(participant?.createdAt ?? participant?.created_at, new Date().toISOString()),
          updatedAt: toText(participant?.updatedAt ?? participant?.updated_at, new Date().toISOString())
        }
      }).filter((participant) => participant.sessionId && participant.participantTargetId)

      const snapshotRows = (Array.isArray(payload.characterSnapshots) ? payload.characterSnapshots : []).map((item: any, index: number) => ({
        id: toText(item?.id, `character_snapshot_${index}`),
        characterId: toText(item?.characterId ?? item?.character_id, ''),
        label: toText(item?.label, ''),
        snapshotKind: toText(item?.snapshotKind ?? item?.snapshot_kind, 'manual') === 'automatic' ? 'automatic' as const : 'manual' as const,
        sourceSessionId: toText(item?.sourceSessionId ?? item?.source_session_id, ''),
        sourceSnapshotId: toText(item?.sourceSnapshotId ?? item?.source_snapshot_id, ''),
        payloadFormat: toText(item?.payloadFormat ?? item?.payload_format, 'character_snapshot_v1'),
        payloadGzip: decodeSnapshotBlob(item?.payloadGzipBase64 ?? item?.payload_gzip_base64 ?? item?.payloadGzip ?? item?.payload_gzip),
        personalityModelVersionId: toText(item?.personalityModelVersionId ?? item?.personality_model_version_id, ''),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item) => item.id && item.characterId)
      const snapshotIds = new Set(snapshotRows.map((item) => item.id))
      const participantsById = new Map(normalizedParticipants.map((item) => [item.id, item]))
      const branchRows = (Array.isArray(payload.chatSessionCharacterBranches) ? payload.chatSessionCharacterBranches : []).map((item: any, index: number) => ({
        id: toText(item?.id, `chat_character_branch_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        participantId: toText(item?.participantId ?? item?.participant_id, ''),
        characterId: toText(item?.characterId ?? item?.character_id, ''),
        sourceSnapshotId: toText(item?.sourceSnapshotId ?? item?.source_snapshot_id, ''),
        payloadFormat: toText(item?.payloadFormat ?? item?.payload_format, 'character_snapshot_v1'),
        payloadGzip: decodeSnapshotBlob(item?.payloadGzipBase64 ?? item?.payload_gzip_base64 ?? item?.payloadGzip ?? item?.payload_gzip),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item) => {
        const participant = participantsById.get(item.participantId)
        return Boolean(
          item.id && item.sessionId && item.participantId && item.characterId
          && participant
          && participant.sessionId === item.sessionId
          && participant.participantTargetId === item.characterId
          && (!item.sourceSnapshotId || snapshotIds.has(item.sourceSnapshotId))
        )
      })
      const validBranchIds = new Set(branchRows.map((item) => item.id))
      normalizedParticipants.forEach((participant) => {
        if (participant.characterStateMode === 'independent_snapshot' && !validBranchIds.has(participant.characterBranchId)) {
          participant.characterStateMode = 'follow_main'
          participant.characterBranchId = ''
        }
      })

      chatRepository.replaceChatSessionParticipants(normalizedParticipants)
      characterSnapshotRepository?.replaceAllSnapshots(snapshotRows)
      characterSnapshotRepository?.replaceAllBranches(branchRows)

      const participantById = new Map(normalizedParticipants.map((item) => [item.id, item]))
      const presenceRows = (Array.isArray(payload.chatSessionCharacterPresences) ? payload.chatSessionCharacterPresences : []).map((item: any, index: number) => ({
        id: toText(item?.id, `presence_restore_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        participantId: toText(item?.participantId ?? item?.participant_id, ''),
        presenceState: toText(item?.presenceState ?? item?.presence_state, 'unknown'),
        locationText: toText(item?.locationText ?? item?.location_text, ''),
        mapSheetId: toText(item?.mapSheetId ?? item?.map_sheet_id, ''),
        mapFeatureId: toText(item?.mapFeatureId ?? item?.map_feature_id, ''),
        sinceMessageId: toText(item?.sinceMessageId ?? item?.since_message_id, ''),
        version: Math.max(1, toNum(item?.version, 1)),
        lastModifiedSource: toText(item?.lastModifiedSource ?? item?.last_modified_source, 'snapshot_restore'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item) => {
        const participant = participantById.get(item.participantId)
        return Boolean(
          item.id && item.sessionId && item.participantId
          && participant
          && participant.sessionId === item.sessionId
          && participant.participantType === 'char'
          && ORCHESTRATION_PRESENCE_STATES.includes(item.presenceState as any)
        )
      })
      const validPresenceIds = new Set(presenceRows.map((item) => item.id))
      const presenceEventRows = (Array.isArray(payload.chatSessionCharacterPresenceEvents) ? payload.chatSessionCharacterPresenceEvents : []).map((item: any, index: number) => ({
        id: toText(item?.id, `presence_event_restore_${index}`),
        presenceId: toText(item?.presenceId ?? item?.presence_id, ''),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        participantId: toText(item?.participantId ?? item?.participant_id, ''),
        eventType: toText(item?.eventType ?? item?.event_type, ''),
        transition: toText(item?.transition, ''),
        fromState: toText(item?.fromState ?? item?.from_state, 'unknown'),
        toState: toText(item?.toState ?? item?.to_state, 'unknown'),
        provisional: item?.provisional === true || item?.provisional === 1,
        proposalEventId: toText(item?.proposalEventId ?? item?.proposal_event_id, ''),
        sourceMessageId: toText(item?.sourceMessageId ?? item?.source_message_id, ''),
        sourceDirectorRunId: toText(item?.sourceDirectorRunId ?? item?.source_director_run_id, ''),
        sourceAgentRunId: toText(item?.sourceAgentRunId ?? item?.source_agent_run_id, ''),
        evidenceSummary: toText(item?.evidenceSummary ?? item?.evidence_summary, ''),
        idempotencyKey: toText(item?.idempotencyKey ?? item?.idempotency_key, ''),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
      })).filter((item) => {
        const participant = participantById.get(item.participantId)
        return Boolean(
          item.id && item.presenceId && item.idempotencyKey && item.sessionId && item.participantId
          && participant
          && participant.sessionId === item.sessionId
          && participant.participantType === 'char'
          && ORCHESTRATION_PRESENCE_EVENT_TYPES.includes(item.eventType as any)
          && ORCHESTRATION_PRESENCE_TRANSITIONS.includes(item.transition as any)
          && ORCHESTRATION_PRESENCE_STATES.includes(item.fromState as any)
          && ORCHESTRATION_PRESENCE_STATES.includes(item.toState as any)
          && (validPresenceIds.has(item.presenceId) || item.eventType === 'proposed' || item.eventType === 'cancelled')
        )
      })
      if (typeof chatRepository.replaceCharacterPresences === 'function') {
        chatRepository.replaceCharacterPresences(presenceRows)
      }
      if (typeof chatRepository.replaceCharacterPresenceEvents === 'function') {
        chatRepository.replaceCharacterPresenceEvents(presenceEventRows)
      }
    } else {
      chatRepository.backfillSessionParticipants()
      characterSnapshotRepository?.replaceAllSnapshots([])
      characterSnapshotRepository?.replaceAllBranches([])
      if (typeof chatRepository.replaceCharacterPresenceEvents === 'function') {
        chatRepository.replaceCharacterPresenceEvents([])
      }
      if (typeof chatRepository.replaceCharacterPresences === 'function') {
        chatRepository.replaceCharacterPresences([])
      }
    }

    const restoredSessionRows = typeof chatRepository.getAllSessions === 'function'
      ? chatRepository.getAllSessions()
      : (Array.isArray(payload.chatSessions) ? payload.chatSessions : [])
    const restoredSessions = new Map(restoredSessionRows.map((session: any) => [toText(session?.id, ''), session]))
    const belongsToRestoredSessionWorld = (item: any) => {
      const sessionId = toText(item?.sessionId ?? item?.session_id, '')
      const worldId = toText(item?.worldId ?? item?.world_id, '')
      const session: any = restoredSessions.get(sessionId)
      return Boolean(session && toText(session?.worldId ?? session?.world_id, '') === worldId)
    }
    if (typeof chatRepository.replaceSessionNarrativeOverrides === 'function') {
      chatRepository.replaceSessionNarrativeOverrides((Array.isArray(payload.chatSessionNarrativeOverrides) ? payload.chatSessionNarrativeOverrides : []).map((item: any, index: number) => ({
        id: toText(item?.id, `narrative_override_restore_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        content: toText(item?.content, ''),
        version: Math.max(1, toNum(item?.version, 1)),
        source: toText(item?.source, 'snapshot_restore'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => item.id && item.content && belongsToRestoredSessionWorld(item)))
    }
    if (typeof chatRepository.replaceSessionOrchestrationStates === 'function') {
      chatRepository.replaceSessionOrchestrationStates((Array.isArray(payload.chatSessionOrchestrationStates) ? payload.chatSessionOrchestrationStates : []).map((item: any, index: number) => ({
        id: toText(item?.id, `orchestration_state_restore_${index}`),
        sessionId: toText(item?.sessionId ?? item?.session_id, ''),
        worldId: toText(item?.worldId ?? item?.world_id, ''),
        scenarioCode: toText(item?.scenarioCode ?? item?.scenario_code, ''),
        scenarioLabel: toText(item?.scenarioLabel ?? item?.scenario_label, ''),
        scenarioSummary: toText(item?.scenarioSummary ?? item?.scenario_summary, ''),
        anchorMessageId: toText(item?.anchorMessageId ?? item?.anchor_message_id, ''),
        sourceArtifactId: toText(item?.sourceArtifactId ?? item?.source_artifact_id, ''),
        dependencySnapshotJson: parseSnapshotObject(
          item?.dependencySnapshot
          ?? item?.dependencySnapshotJson
          ?? item?.dependency_snapshot_json
        ),
        version: Math.max(1, toNum(item?.version, 1)), source: toText(item?.source, 'snapshot_restore'),
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString()),
        updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
      })).filter((item: any) => (
        item.id && item.scenarioCode && belongsToRestoredSessionWorld(item)
        && (item.anchorMessageId || item.sourceArtifactId)
      )))
    }

    if (Array.isArray(payload.chatPromptLogs)) {
      chatRepository.replaceChatPromptLogs(payload.chatPromptLogs.map((log: any, index: number) => ({
        id: toText(log?.id, `prompt_log_${index}`),
        sessionId: toText(log?.sessionId ?? log?.session_id, ''),
        pageIndex: toNum(log?.pageIndex ?? log?.page_index, 1),
        entryIndex: toNum(log?.entryIndex ?? log?.entry_index, 0),
        assistantMessageId: toNum(log?.assistantMessageId ?? log?.assistant_message_id, 0),
        speakerName: toText(log?.speakerName ?? log?.speaker_name, ''),
        targetId: toText(log?.targetId ?? log?.target_id, ''),
        finalPrompt: toText(log?.finalPrompt ?? log?.final_prompt, ''),
        promptBlocksJson: toJson(log?.promptBlocks ?? log?.promptBlocksJson ?? log?.prompt_blocks_json, []),
        logKind: toText(log?.logKind ?? log?.log_kind, 'final_reply'),
        createdAt: toText(log?.createdAt ?? log?.created_at, new Date().toISOString())
      })).filter((log) => log.id && log.sessionId))
    } else {
      chatRepository.replaceChatPromptLogs([])
    }

    if (Array.isArray(payload.chatRecallActivityLogs)) {
      chatRepository.replaceChatRecallActivityLogs(payload.chatRecallActivityLogs.map((log: any, index: number) => ({
        id: toText(log?.id, `recall_activity_${index}`),
        sessionId: toText(log?.sessionId ?? log?.session_id, ''),
        pageIndex: toNum(log?.pageIndex ?? log?.page_index, 1),
        entryIndex: toNum(log?.entryIndex ?? log?.entry_index, 0),
        inputMessageId: toNum(log?.inputMessageId ?? log?.input_message_id, 0),
        assistantMessageId: toNum(log?.assistantMessageId ?? log?.assistant_message_id, 0),
        speakerName: toText(log?.speakerName ?? log?.speaker_name, ''),
        targetId: toText(log?.targetId ?? log?.target_id, ''),
        runId: toText(log?.runId ?? log?.run_id, ''),
        status: toText(log?.status, 'completed'),
        activityJson: toJson(log?.activity ?? log?.activityJson ?? log?.activity_json, {}),
        createdAt: toText(log?.createdAt ?? log?.created_at, new Date().toISOString())
      })).filter((log) => log.id && log.sessionId))
    } else {
      chatRepository.replaceChatRecallActivityLogs([])
    }

    if (Array.isArray(payload.chatGenerationAttempts)) {
      chatRepository.replaceGenerationAttempts?.(payload.chatGenerationAttempts.map((attempt: any, index: number) => ({
        id: toText(attempt?.id, `generation_attempt_${index}`),
        sessionId: toText(attempt?.sessionId ?? attempt?.session_id, ''),
        anchorMessageId: toNum(attempt?.anchorMessageId ?? attempt?.anchor_message_id, 0),
        parentAttemptId: toText(attempt?.parentAttemptId ?? attempt?.parent_attempt_id, ''),
        triggerType: toText(attempt?.triggerType ?? attempt?.trigger_type, 'normal_send'),
        mode: toText(attempt?.mode, 'clean'),
        status: toText(attempt?.status, 'running'),
        targetId: toText(attempt?.targetId ?? attempt?.target_id, ''),
        speakerName: toText(attempt?.speakerName ?? attempt?.speaker_name, ''),
        tidiaoRunId: toText(attempt?.tidiaoRunId ?? attempt?.tidiao_run_id, ''),
        assistantMessageIdsJson: toJson(attempt?.assistantMessageIds ?? attempt?.assistantMessageIdsJson ?? attempt?.assistant_message_ids_json, []),
        replacedMessageIdsJson: toJson(attempt?.replacedMessageIds ?? attempt?.replacedMessageIdsJson ?? attempt?.replaced_message_ids_json, []),
        preCapsResidueStateJson: toJson(attempt?.preCapsResidueState ?? attempt?.preCapsResidueStateJson ?? attempt?.pre_caps_residue_state_json, {}),
        postCapsResidueStateJson: toJson(attempt?.postCapsResidueState ?? attempt?.postCapsResidueStateJson ?? attempt?.post_caps_residue_state_json, {}),
        sourcePromptLogId: toText(attempt?.sourcePromptLogId ?? attempt?.source_prompt_log_id, ''),
        outputPromptLogId: toText(attempt?.outputPromptLogId ?? attempt?.output_prompt_log_id, ''),
        errorJson: toJson(attempt?.error ?? attempt?.errorJson ?? attempt?.error_json, {}),
        createdAt: toText(attempt?.createdAt ?? attempt?.created_at, new Date().toISOString()),
        updatedAt: toText(attempt?.updatedAt ?? attempt?.updated_at, new Date().toISOString())
      })).filter((attempt) => attempt.id && attempt.sessionId))
    } else if (typeof chatRepository.replaceGenerationAttempts === 'function') {
      chatRepository.replaceGenerationAttempts([])
    }

    if (Array.isArray(payload.chatGenerationAttemptArtifacts)) {
      chatRepository.replaceGenerationAttemptArtifacts?.(payload.chatGenerationAttemptArtifacts.map((artifact: any, index: number) => ({
        id: toText(artifact?.id, `generation_attempt_artifact_${index}`),
        attemptId: toText(artifact?.attemptId ?? artifact?.attempt_id, ''),
        sessionId: toText(artifact?.sessionId ?? artifact?.session_id, ''),
        artifactKind: toText(artifact?.artifactKind ?? artifact?.artifact_kind, 'metadata'),
        messageId: toNum(artifact?.messageId ?? artifact?.message_id, 0),
        promptLogId: toText(artifact?.promptLogId ?? artifact?.prompt_log_id, ''),
        recallActivityLogId: toText(artifact?.recallActivityLogId ?? artifact?.recall_activity_log_id, ''),
        payloadJson: toJson(artifact?.payload ?? artifact?.payloadJson ?? artifact?.payload_json, {}),
        createdAt: toText(artifact?.createdAt ?? artifact?.created_at, new Date().toISOString())
      })).filter((artifact) => artifact.id && artifact.attemptId && artifact.sessionId))
    } else if (typeof chatRepository.replaceGenerationAttemptArtifacts === 'function') {
      chatRepository.replaceGenerationAttemptArtifacts([])
    }
  }
}
