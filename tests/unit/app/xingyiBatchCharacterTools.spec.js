/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import { createGenerateCharactersBatchTool, XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT } from '../../../src/app/xingyiBatchCharacterTools'

function context(overrides = {}) {
  return {
    provider: {
      listGroups: () => [{ id: 'default', name: '默认' }, { id: 'team', name: '冒险队' }],
      generateCharacter: vi.fn(async ({ brief }) => ({ ok: true, name: brief, characterId: `id_${brief}`, message: '完成' })),
      ...overrides.provider
    },
    confirmWrite: Object.prototype.hasOwnProperty.call(overrides, 'confirmWrite')
      ? overrides.confirmWrite
      : vi.fn(async () => true)
  }
}

describe('generateCharactersBatch', () => {
  it('整批只确认一次，并把同一目标组传给所有独立链路', async () => {
    const ctx = context()
    const tool = createGenerateCharactersBatchTool(ctx)
    const result = await tool.execute({ args: {
      characters: [{ brief: '剑士' }, { brief: '法师' }, { brief: '医师' }],
      group: '冒险队',
      concurrency: 3
    } }, { turnIndex: 0 })
    expect(ctx.confirmWrite).toHaveBeenCalledOnce()
    expect(ctx.provider.generateCharacter).toHaveBeenCalledTimes(3)
    expect(ctx.provider.generateCharacter.mock.calls.every(([input]) => input.groupId === 'team')).toBe(true)
    expect(result.content).toContain('成功 3 个')
    expect(result.details).toMatchObject({ requested: 3, succeeded: 3, failed: 0, concurrency: 3 })
  })

  it('并行上限被硬钳到 4', async () => {
    const ctx = context()
    const result = await createGenerateCharactersBatchTool(ctx).execute({ args: {
      characters: [{ brief: '1' }, { brief: '2' }], concurrency: 99
    } }, { turnIndex: 0 })
    expect(result.details.concurrency).toBe(XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT)
  })

  it('确实同时运行多条链路，且在飞数量不超过指定上限', async () => {
    let active = 0
    let peak = 0
    const ctx = context({ provider: {
      generateCharacter: vi.fn(async ({ brief }) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 15))
        active -= 1
        return { ok: true, name: brief, characterId: `id_${brief}`, message: '完成' }
      })
    } })
    await createGenerateCharactersBatchTool(ctx).execute({ args: {
      characters: [{ brief: '1' }, { brief: '2' }, { brief: '3' }, { brief: '4' }],
      concurrency: 2
    } }, { turnIndex: 0 })
    expect(peak).toBe(2)
  })

  it('一句需求展开为六条角色简述后，可在一次工具调用中完整创建六个角色', async () => {
    const ctx = context()
    const characters = ['剑士', '法师', '医师', '斥候', '工匠', '学者'].map((brief) => ({ brief }))
    const result = await createGenerateCharactersBatchTool(ctx).execute({ args: { characters } }, { turnIndex: 0 })
    expect(ctx.confirmWrite).toHaveBeenCalledOnce()
    expect(ctx.provider.generateCharacter).toHaveBeenCalledTimes(6)
    expect(result.details).toMatchObject({ requested: 6, succeeded: 6, failed: 0 })
  })

  it('单项失败隔离，其余角色仍完成', async () => {
    const ctx = context({ provider: {
      generateCharacter: vi.fn(async ({ brief }) => {
        if (brief === '坏任务') throw new Error('模型失败')
        return { ok: true, name: brief, characterId: `id_${brief}`, message: '完成' }
      })
    } })
    const result = await createGenerateCharactersBatchTool(ctx).execute({ args: {
      characters: [{ brief: '角色甲' }, { brief: '坏任务' }, { brief: '角色乙' }]
    } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('成功 2 个')
    expect(result.content).toContain('失败 1 个')
    expect(result.content).toContain('模型失败')
  })

  it('全部失败时返回错误态', async () => {
    const ctx = context({ provider: { generateCharacter: vi.fn(async () => { throw new Error('上游不可用') }) } })
    const result = await createGenerateCharactersBatchTool(ctx).execute({ args: {
      characters: [{ brief: '角色甲' }, { brief: '角色乙' }]
    } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.error?.retryable).toBe(false)
  })

  it('未知分组和不足两个角色在写入前被拒绝', async () => {
    const ctx = context()
    const badGroup = await createGenerateCharactersBatchTool(ctx).execute({ args: {
      characters: [{ brief: '甲' }, { brief: '乙' }], group: '不存在'
    } }, { turnIndex: 0 })
    expect(badGroup.error?.type).toBe('INVALID_ARGUMENT')
    expect(ctx.confirmWrite).not.toHaveBeenCalled()
    expect(createGenerateCharactersBatchTool(ctx).validateArgs({ characters: [{ brief: '甲' }] })).toContain('至少')
  })

  it('用户取消或缺确认通道时不启动任何链路', async () => {
    const denied = context({ confirmWrite: vi.fn(async () => false) })
    const deniedResult = await createGenerateCharactersBatchTool(denied).execute({ args: {
      characters: [{ brief: '甲' }, { brief: '乙' }]
    } }, { turnIndex: 0 })
    expect(deniedResult.details.denied).toBe(true)
    expect(denied.provider.generateCharacter).not.toHaveBeenCalled()

    const missing = context({ confirmWrite: undefined })
    const missingResult = await createGenerateCharactersBatchTool(missing).execute({ args: {
      characters: [{ brief: '甲' }, { brief: '乙' }]
    } }, { turnIndex: 0 })
    expect(missingResult.status).toBe('error')
    expect(missing.provider.generateCharacter).not.toHaveBeenCalled()
  })
})
