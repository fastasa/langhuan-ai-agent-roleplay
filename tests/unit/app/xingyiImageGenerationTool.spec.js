/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import {
  createXingyiBatchImageGenerationTool,
  createXingyiImageGenerationTools,
  XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT
} from '../../../src/app/xingyiImageGenerationTool.ts'

function attachment(id) {
  return { id, kind: 'image', url: `/chat-images/${id}.png`, mime: 'image/png' }
}

describe('星依批量生图工具', () => {
  it('与单图工具一起装配，并用一次调用生成三张附件', async () => {
    const generated = []
    const ctx = {
      generate: vi.fn(async (prompt) => attachment(`img_${prompt}`)),
      onGenerated: (item) => generated.push(item)
    }
    expect(createXingyiImageGenerationTools(ctx).map((tool) => tool.name)).toEqual(['generateImage', 'generateImagesBatch'])
    const result = await createXingyiBatchImageGenerationTool(ctx).execute({ args: {
      images: [{ prompt: '春' }, { prompt: '夏' }, { prompt: '秋' }]
    } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(ctx.generate).toHaveBeenCalledTimes(3)
    expect(generated.map((item) => item.id)).toEqual(['img_春', 'img_夏', 'img_秋'])
    expect(result.details).toMatchObject({ requested: 3, succeeded: 3, failed: 0 })
  })

  it('受控并发且成功附件仍按请求顺序输出', async () => {
    let active = 0
    let peak = 0
    const generated = []
    const ctx = {
      generate: vi.fn(async (prompt) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, prompt === '慢' ? 25 : 5))
        active -= 1
        return attachment(`img_${prompt}`)
      }),
      onGenerated: (item) => generated.push(item)
    }
    const result = await createXingyiBatchImageGenerationTool(ctx).execute({ args: {
      images: [{ prompt: '慢' }, { prompt: '快1' }, { prompt: '快2' }, { prompt: '快3' }],
      concurrency: 2
    } }, { turnIndex: 0 })
    expect(peak).toBe(2)
    expect(result.details.concurrency).toBe(2)
    expect(generated.map((item) => item.id)).toEqual(['img_慢', 'img_快1', 'img_快2', 'img_快3'])
  })

  it('并行参数硬钳到 3，单张失败不拖垮整批', async () => {
    const generated = []
    const ctx = {
      generate: vi.fn(async (prompt) => {
        if (prompt === '失败图') throw new Error('上游失败')
        return attachment(`img_${prompt}`)
      }),
      onGenerated: (item) => generated.push(item)
    }
    const result = await createXingyiBatchImageGenerationTool(ctx).execute({ args: {
      images: [{ prompt: '图1' }, { prompt: '失败图' }, { prompt: '图2' }], concurrency: 99
    } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.details.concurrency).toBe(XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT)
    expect(result.details).toMatchObject({ succeeded: 2, failed: 1 })
    expect(generated.map((item) => item.id)).toEqual(['img_图1', 'img_图2'])
    expect(result.content).toContain('上游失败')
  })

  it('全部失败返回错误态，少于两张在执行前拒绝', async () => {
    const ctx = { generate: vi.fn(async () => { throw new Error('不可用') }), onGenerated: vi.fn() }
    const tool = createXingyiBatchImageGenerationTool(ctx)
    const badCount = await tool.execute({ args: { images: [{ prompt: '只有一张' }] } }, { turnIndex: 0 })
    expect(badCount.status).toBe('error')
    expect(ctx.generate).not.toHaveBeenCalled()

    const failed = await tool.execute({ args: { images: [{ prompt: '一' }, { prompt: '二' }] } }, { turnIndex: 0 })
    expect(failed.status).toBe('error')
    expect(failed.error.retryable).toBe(false)
    expect(ctx.onGenerated).not.toHaveBeenCalled()
  })
})
