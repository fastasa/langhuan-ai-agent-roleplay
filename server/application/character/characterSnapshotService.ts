import { randomBytes } from 'crypto'
import { characterRepository } from '../../repositories/characterRepository.js'
import {
  characterSnapshotRepository,
  CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT
} from '../../repositories/characterSnapshotRepository.js'
import { personalityTrainingRepository } from '../../repositories/personalityTrainingRepository.js'
import {
  CHARACTER_SNAPSHOT_FORMAT,
  createCharacterSnapshotPayload,
  decodeCharacterSnapshotPayload,
  encodeCharacterSnapshotPayload
} from './characterSnapshotCodec.js'
import { applyCharacterSnapshotState, pickCharacterSnapshotState } from '../../../shared/characterSnapshotState.js'

function createSnapshotId() {
  return `charsnap_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`
}

function createBranchId() {
  return `charbranch_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`
}

function normalizedLabel(value: unknown, fallback: string) {
  const label = String(value || '').trim().replace(/\s+/g, ' ')
  if (!label) return fallback
  return label.slice(0, 80)
}

function snapshotMetadata(row: Record<string, any> | null) {
  if (!row) return null
  const { payloadGzip: _payloadGzip, payload_gzip: _payloadGzipSnake, ...metadata } = row
  return metadata
}

export function createCharacterSnapshotService(deps: {
  characters?: typeof characterRepository
  snapshots?: typeof characterSnapshotRepository
  personalityModels?: typeof personalityTrainingRepository
  now?: () => Date
  createId?: () => string
  createBranchId?: () => string
} = {}) {
  const characters = deps.characters ?? characterRepository
  const snapshots = deps.snapshots ?? characterSnapshotRepository
  const personalityModels = deps.personalityModels ?? personalityTrainingRepository
  const now = deps.now ?? (() => new Date())
  const createId = deps.createId ?? createSnapshotId
  const nextBranchId = deps.createBranchId ?? createBranchId
  const overwriteLocks = new Set<string>()

  function getCharacterOrThrow(characterId: string) {
    const normalizedId = String(characterId || '').trim()
    const character = characters.getCharacterById(normalizedId)
    if (!character) throw new Error('角色不存在')
    return { characterId: normalizedId, character: character as Record<string, unknown> }
  }

  function resolvePersonalityModelVersionId(characterId: string, character: Record<string, unknown>) {
    const modelPath = String(character.personalityModelPath ?? character.personality_model_path ?? '').trim()
    if (!modelPath) return ''
    const version = personalityModels.ensureInstalledVersionForCurrentPath(characterId, modelPath) as Record<string, unknown> | null
    return String(version?.versionId ?? version?.version_id ?? '')
  }

  function createSnapshot(characterId: string, input: {
    label?: unknown
    snapshotKind: 'manual' | 'automatic'
    sourceSessionId?: string
    sourceSnapshotId?: string
  }) {
    const resolved = getCharacterOrThrow(characterId)
    const createdAt = now().toISOString()
    const personalityModelVersionId = resolvePersonalityModelVersionId(resolved.characterId, resolved.character)
    const payload = createCharacterSnapshotPayload({
      character: resolved.character,
      personalityModelVersionId,
      capturedAt: createdAt
    })
    const fallbackLabel = input.snapshotKind === 'automatic'
      ? `覆盖前保护 ${createdAt}`
      : `手工快照 ${createdAt}`
    const inserted = snapshots.insertSnapshot({
      id: createId(),
      characterId: resolved.characterId,
      label: normalizedLabel(input.label, fallbackLabel),
      snapshotKind: input.snapshotKind,
      sourceSessionId: String(input.sourceSessionId || ''),
      sourceSnapshotId: String(input.sourceSnapshotId || ''),
      payloadFormat: CHARACTER_SNAPSHOT_FORMAT,
      payloadGzip: encodeCharacterSnapshotPayload(payload),
      personalityModelVersionId,
      createdAt,
      updatedAt: createdAt
    })
    return {
      ...snapshotMetadata(inserted.snapshot),
      cleanup: inserted.cleanup
    }
  }

  function resolveBranch(characterId: string, branchId: string) {
    const resolved = getCharacterOrThrow(characterId)
    const branch = snapshots.getBranchById(String(branchId || '').trim()) as Record<string, any> | null
    if (!branch || String(branch.characterId || '') !== resolved.characterId) {
      throw new Error('会话角色分支不存在或不属于该角色')
    }
    if (String(branch.payloadFormat || '') !== CHARACTER_SNAPSHOT_FORMAT) {
      throw new Error(`不支持的会话角色分支格式：${String(branch.payloadFormat || '')}`)
    }
    const payload = decodeCharacterSnapshotPayload(branch.payloadGzip ?? branch.payload_gzip)
    return {
      branch: snapshotMetadata(branch),
      payload,
      character: applyCharacterSnapshotState(resolved.character, payload.state)
    }
  }

  return {
    exportCompleteCharacter(characterId: string) {
      const resolved = getCharacterOrThrow(characterId)
      const exportedAt = now().toISOString()
      return {
        format: 'langhuan_character_complete_v1',
        exportedAt,
        identity: {
          name: String(resolved.character.name || ''),
          emoji: String(resolved.character.emoji || '👤')
        },
        configuration: {
          groupId: String(resolved.character.groupId ?? resolved.character.group_id ?? 'default'),
          nicknames: resolved.character.nicknames ?? [],
          defaultPreset: String(resolved.character.defaultPreset ?? resolved.character.default_preset ?? ''),
          defaultModel: String(resolved.character.defaultModel ?? resolved.character.default_model ?? ''),
          roleTemperature: resolved.character.roleTemperature ?? resolved.character.role_temperature ?? '',
          roleMaxTokens: resolved.character.roleMaxTokens ?? resolved.character.role_max_tokens ?? '',
          roleThinking: String(resolved.character.roleThinking ?? resolved.character.role_thinking ?? ''),
          replyPipelineModeOverride: String(resolved.character.replyPipelineModeOverride ?? resolved.character.reply_pipeline_mode_override ?? 'follow_session')
        },
        snapshot: createCharacterSnapshotPayload({
          character: resolved.character,
          personalityModelVersionId: resolvePersonalityModelVersionId(resolved.characterId, resolved.character),
          capturedAt: exportedAt
        })
      }
    },

    listCharacterSnapshots(characterId: string) {
      const resolved = getCharacterOrThrow(characterId)
      return snapshots.listSnapshots(resolved.characterId).map((row) => snapshotMetadata(row))
    },

    getCharacterSnapshot(characterId: string, snapshotId: string) {
      const resolved = getCharacterOrThrow(characterId)
      const row = snapshots.getSnapshot(resolved.characterId, String(snapshotId || '').trim()) as Record<string, any> | null
      if (!row) throw new Error('角色快照不存在')
      if (String(row.payloadFormat || '') !== CHARACTER_SNAPSHOT_FORMAT) {
        throw new Error(`不支持的角色快照格式：${String(row.payloadFormat || '')}`)
      }
      return {
        ...snapshotMetadata(row),
        payload: decodeCharacterSnapshotPayload(row.payloadGzip ?? row.payload_gzip)
      }
    },

    createManualCharacterSnapshot(characterId: string, input: Record<string, unknown> = {}) {
      return createSnapshot(characterId, {
        label: input.label,
        snapshotKind: 'manual'
      })
    },

    createAutomaticCharacterSnapshot(characterId: string, input: {
      label?: unknown
      sourceSessionId?: string
      sourceSnapshotId?: string
    } = {}) {
      return createSnapshot(characterId, {
        ...input,
        snapshotKind: 'automatic'
      })
    },

    deleteCharacterSnapshot(characterId: string, snapshotId: string) {
      const resolved = getCharacterOrThrow(characterId)
      const normalizedSnapshotId = String(snapshotId || '').trim()
      const existing = snapshots.getSnapshot(resolved.characterId, normalizedSnapshotId)
      if (!existing) throw new Error('角色快照不存在')
      snapshots.deleteSnapshot(resolved.characterId, normalizedSnapshotId)
      return { ok: true, id: normalizedSnapshotId }
    },

    cleanupAutomaticCharacterSnapshots(characterId: string, input: Record<string, unknown> = {}) {
      const resolved = getCharacterOrThrow(characterId)
      const requested = Number(input.keepAutomaticCount ?? input.keep_automatic_count ?? CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT)
      const keepAutomaticCount = Number.isFinite(requested)
        ? Math.max(0, Math.min(CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT, Math.trunc(requested)))
        : CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT
      return snapshots.cleanupAutomaticSnapshots(resolved.characterId, keepAutomaticCount)
    },

    forkSessionCharacterBranch(input: {
      sessionId: string
      participantId: string
      characterId: string
      sourceSnapshotId?: string
    }) {
      const sessionId = String(input.sessionId || '').trim()
      const participantId = String(input.participantId || '').trim()
      const sourceSnapshotId = String(input.sourceSnapshotId || '').trim()
      if (!sessionId || !participantId) throw new Error('会话或参与者不能为空')
      const resolved = getCharacterOrThrow(input.characterId)
      const createdAt = now().toISOString()
      let payload
      if (sourceSnapshotId) {
        const snapshot = snapshots.getSnapshot(resolved.characterId, sourceSnapshotId) as Record<string, any> | null
        if (!snapshot) throw new Error('用于 fork 的角色快照不存在或不属于该角色')
        if (String(snapshot.payloadFormat || '') !== CHARACTER_SNAPSHOT_FORMAT) {
          throw new Error(`不支持的角色快照格式：${String(snapshot.payloadFormat || '')}`)
        }
        payload = decodeCharacterSnapshotPayload(snapshot.payloadGzip ?? snapshot.payload_gzip)
      } else {
        payload = createCharacterSnapshotPayload({
          character: resolved.character,
          personalityModelVersionId: resolvePersonalityModelVersionId(resolved.characterId, resolved.character),
          capturedAt: createdAt
        })
      }
      const branch = snapshots.insertBranch({
        id: nextBranchId(),
        sessionId,
        participantId,
        characterId: resolved.characterId,
        sourceSnapshotId,
        payloadFormat: CHARACTER_SNAPSHOT_FORMAT,
        payloadGzip: encodeCharacterSnapshotPayload(payload),
        createdAt,
        updatedAt: createdAt
      }) as Record<string, any> | null
      if (!branch) throw new Error('会话角色分支创建失败')
      return snapshotMetadata(branch)
    },

    resolveSessionCharacterBranch(characterId: string, branchId: string) {
      return resolveBranch(characterId, branchId)
    },

    patchSessionCharacterBranch(characterId: string, branchId: string, changes: Record<string, unknown>) {
      const resolved = resolveBranch(characterId, branchId)
      const nextCharacter = applyCharacterSnapshotState(
        resolved.character as Record<string, unknown>,
        pickCharacterSnapshotState(changes)
      )
      const nextPayload = createCharacterSnapshotPayload({
        character: nextCharacter,
        personalityModelVersionId: resolved.payload.personalityModelVersionId,
        capturedAt: resolved.payload.capturedAt
      })
      const updated = snapshots.updateBranchPayload(
        String(branchId || '').trim(),
        CHARACTER_SNAPSHOT_FORMAT,
        encodeCharacterSnapshotPayload(nextPayload),
        now().toISOString()
      )
      if (!updated) throw new Error('会话角色分支写入失败')
      return { ok: true, character: nextCharacter }
    },

    deleteSessionCharacterBranchByParticipant(participantId: string) {
      return snapshots.deleteBranchByParticipant(String(participantId || '').trim())
    },

    overwriteCharacterMainFromSnapshot(characterId: string, snapshotId: string) {
      const resolved = getCharacterOrThrow(characterId)
      if (overwriteLocks.has(resolved.characterId)) throw new Error('该角色正在执行另一项快照覆盖，请稍后再试')
      overwriteLocks.add(resolved.characterId)
      try {
        const blockers = snapshots.listCharacterStateBlockers(resolved.characterId)
        if (blockers.generationAttempts.length || blockers.projectionWritebacks.length) {
          return {
            ok: false as const,
            status: 409,
            error: '角色仍有活跃生成或投影写回，暂不能覆盖主真值',
            blockers
          }
        }
        const target = snapshots.getSnapshot(resolved.characterId, String(snapshotId || '').trim()) as Record<string, any> | null
        if (!target) throw new Error('角色快照不存在')
        if (String(target.payloadFormat || '') !== CHARACTER_SNAPSHOT_FORMAT) {
          throw new Error(`不支持的角色快照格式：${String(target.payloadFormat || '')}`)
        }
        const targetPayload = decodeCharacterSnapshotPayload(target.payloadGzip ?? target.payload_gzip)
        const protectedAt = now().toISOString()
        const currentVersionId = resolvePersonalityModelVersionId(resolved.characterId, resolved.character)
        const protectionPayload = createCharacterSnapshotPayload({
          character: resolved.character,
          personalityModelVersionId: currentVersionId,
          capturedAt: protectedAt
        })
        const result = snapshots.overwriteCharacterMain({
          characterId: resolved.characterId,
          targetState: targetPayload.state,
          targetPersonalityModelVersionId: targetPayload.personalityModelVersionId,
          protectionSnapshot: {
            id: createId(),
            characterId: resolved.characterId,
            label: `覆盖前保护 ${protectedAt}`,
            snapshotKind: 'automatic',
            sourceSnapshotId: String(target.id || ''),
            payloadFormat: CHARACTER_SNAPSHOT_FORMAT,
            payloadGzip: encodeCharacterSnapshotPayload(protectionPayload),
            personalityModelVersionId: currentVersionId,
            createdAt: protectedAt,
            updatedAt: protectedAt
          }
        })
        return {
          ok: true as const,
          snapshotId: String(target.id || ''),
          protectionSnapshot: snapshotMetadata(result.protectionSnapshot),
          cleanup: result.cleanup,
          personalityModelVersionId: result.personalityModelVersionId,
          personalityModelPath: result.personalityModelPath,
          degradedToNormalRecall: result.degradedToNormalRecall
        }
      } finally {
        overwriteLocks.delete(resolved.characterId)
      }
    }
  }
}

export const characterSnapshotService = createCharacterSnapshotService()
