import { describe, expect, it, vi } from 'vitest'
import { askConfirmWrite } from '../../../src/app/agentRuntime/interactionContract.ts'

describe('askConfirmWrite 用户意见回流', () => {
  it('confirmed 放行，answered 不放行并返回修订意见，历史 boolean 仍兼容', async () => {
    await expect(askConfirmWrite(vi.fn(async () => ({ status: 'confirmed' })), { title: '确认', lines: [] }, '测试操作')).resolves.toBeNull()
    await expect(askConfirmWrite(vi.fn(async () => true), { title: '确认', lines: [] }, '测试操作')).resolves.toBeNull()

    const result = await askConfirmWrite(
      vi.fn(async () => ({ status: 'answered', answer: '先把第二项删掉' })),
      { title: '确认', lines: [] },
      '测试操作'
    )
    expect(result.content).toContain('先把第二项删掉')
    expect(result.details).toMatchObject({ feedback: '先把第二项删掉', needsRevision: true })
  })
})
