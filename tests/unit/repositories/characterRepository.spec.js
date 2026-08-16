import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  applyResolvedCharacterState,
  normalizeCharacterShape,
  overwriteCharacterMainFromSnapshotRecord,
  resolveCharacterState,
  updateCharacterRecord
} from '../../../src/repositories/characterRepository.ts'

describe('characterRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('统一整理角色快照并补默认分组', () => {
    const resolved = resolveCharacterState({
      characters: [
        { id: 'c1', name: '星依', avatar: 'avatars/xingyi.png', group_id: 'main' }
      ],
      characterGroups: [],
      groups: [
        { id: 'g1', members: '[{\"name\":\"星依\",\"chance\":80}]' }
      ],
      crowds: [
        { id: 'crowd_1', members: '[\"路人甲\"]', default_preset: 'preset_a' }
      ],
      aliases: [{ id: 'a1', name: '别名' }],
      userProfile: {
        name: '用户',
        avatarPath: 'avatars/user.png'
      }
    })

    expect(resolved.characters[0].avatarPath).toBe('/avatars/xingyi.png')
    expect(resolved.characterGroups[0]).toEqual(expect.objectContaining({ id: 'default' }))
    expect(resolved.groups[0].members).toEqual([{ characterId: 'c1', probability: 80 }])
    expect(resolved.crowds[0].apiPreset).toBe('preset_a')
    expect(resolved.userProfile?.avatarPath).toBe('/avatars/user.png')
  })

  it('统一把解析后的角色状态写回 store 目标', () => {
    const target = {
      characters: ref([]),
      characterGroups: ref([]),
      groups: ref([]),
      crowds: ref([]),
      aliases: ref([]),
      userProfile: ref({ name: '旧用户' })
    }

    applyResolvedCharacterState(target, resolveCharacterState({
      characters: [{ id: 'c1', name: '星依' }],
      characterGroups: [],
      userProfile: { name: '用户' }
    }))

    expect(target.characters.value).toHaveLength(1)
    expect(target.characterGroups.value[0]).toEqual(expect.objectContaining({ id: 'default' }))
    expect(target.userProfile.value).toEqual(expect.objectContaining({ name: '用户' }))
  })

  it('标准化角色结构时会把旧投影偏移并入正式视图偏移', () => {
    const normalized = normalizeCharacterShape({
      id: 'c1',
      name: '星依',
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        projectionOffsets: {
          'brain:trajectory:node:year_2005': { x: 32, y: -18 }
        }
      }
    })

    expect(normalized.brainTrajectoryMeta?.viewOffsets).toEqual({
      'brain:trajectory:node:year_2005': { x: 32, y: -18 }
    })
  })

  it('标准化角色结构时会解析节点固定基线', () => {
    const normalized = normalizeCharacterShape({
      id: 'c1',
      name: '星依',
      brain_pinned_offsets: JSON.stringify({
        'brain:cognition:node:1': { x: 12, y: -8 }
      })
    })

    expect(normalized.brainPinnedOffsets).toEqual({
      'brain:cognition:node:1': { x: 12, y: -8 }
    })
    expect(normalized.brain_pinned_offsets).toContain('brain:cognition:node:1')
  })

  it('标准化角色结构时会保留人格内核派生字段', () => {
    const kernel = {
      characterId: 'c1',
      version: 1,
      sourceTextHash: 'hash_a',
      stableSummary: '稳定摘要',
      guardDimensions: [],
      reactionPolicies: []
    }

    const normalized = normalizeCharacterShape({
      id: 'c1',
      name: '星依',
      personalityKernel: kernel
    })

    expect(normalized.personalityKernel).toEqual(kernel)
    expect(normalized.personality_kernel).toBe(JSON.stringify(kernel))
  })

  it('标准化角色结构时会把旧 CAPS 覆盖退回跟随会话', () => {
    const normalized = normalizeCharacterShape({
      id: 'c1',
      name: '星依',
      reply_pipeline_mode_override: 'caps'
    })

    expect(normalized.replyPipelineModeOverride).toBe('follow_session')
    expect(normalized.reply_pipeline_mode_override).toBe('follow_session')
  })

  it('标准化角色结构时会保留人格模型回复链路覆盖', () => {
    const normalized = normalizeCharacterShape({
      id: 'c1',
      name: '星依',
      reply_pipeline_mode_override: 'personality'
    })

    expect(normalized.replyPipelineModeOverride).toBe('personality_model')
    expect(normalized.reply_pipeline_mode_override).toBe('personality_model')
  })

  it('旧角色没有回复链路覆盖时默认跟随会话', () => {
    const normalized = normalizeCharacterShape({
      id: 'c1',
      name: '星依'
    })

    expect(normalized.replyPipelineModeOverride).toBe('follow_session')
    expect(normalized.reply_pipeline_mode_override).toBe('follow_session')
  })

  it('角色更新失败时会透传服务端 JSON 错误信息', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      text: vi.fn(async () => JSON.stringify({ error: 'near "AND": syntax error' }))
    })

    await expect(updateCharacterRecord('char_1', { name: '星依' })).rejects.toThrow('near "AND": syntax error')
  })

  it('角色更新失败时会保留纯文本错误信息', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      text: vi.fn(async () => 'gateway timeout')
    })

    await expect(updateCharacterRecord('char_1', { name: '星依' })).rejects.toThrow('gateway timeout')
  })

  it('覆盖主线被服务端硬门阻断时会保留具体运行项', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: vi.fn(async () => JSON.stringify({
        error: '角色仍有活跃生成或投影写回',
        blockers: {
          generationAttempts: [{ id: 'attempt_1', sessionId: 'session_1' }],
          projectionWritebacks: []
        }
      }))
    })

    let received
    try {
      await overwriteCharacterMainFromSnapshotRecord('char_1', 'snapshot_1')
    } catch (error) {
      received = error
    }
    expect(received).toEqual(expect.objectContaining({ status: 409 }))
    expect(received.blockers.generationAttempts[0]).toEqual(expect.objectContaining({ id: 'attempt_1' }))
  })
})
