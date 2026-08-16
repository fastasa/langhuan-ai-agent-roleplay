import { describe, expect, it } from 'vitest'
import {
  createTidiaoMessagePromptContext,
  runTidiaoEditMessagePrompt,
  runTidiaoReadMessagePrompt
} from '../../../src/app/tidiaoMessagePromptTools.ts'

// pipeline 预取 promptLog 后提供的目标消息提示词来源（已带 kind/index，本工厂只按 kind 桶 + index 定位）。
function sampleSources() {
  return [
    { kind: 'role', index: 1, messageId: 2, speakerName: '阿澈', promptText: '请用温柔的语气回复，重点写凉风正好。' },
    { kind: 'role', index: 2, messageId: 5, speakerName: '阿澈', promptText: '请简短回应，表达答应一起走走。' },
    { kind: 'narration', index: 1, messageId: 3, speakerName: '旁白', promptText: '写一段夜色清冷的环境旁白。' }
  ]
}

describe('tidiaoMessagePromptTools（批次 P1 中策·读/改提示词）', () => {
  it('readMessagePrompt 按楼层读到该消息已存提示词文本（可多目标）', async () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    const { reads } = await runTidiaoReadMessagePrompt({ ref: '角色1、旁白1' }, ctx)
    expect(reads).toHaveLength(2)
    expect(reads[0]).toMatchObject({
      ref: '角色1', kind: 'role', index: 1, matched: true, messageId: 2, speakerName: '阿澈',
      promptText: '请用温柔的语气回复，重点写凉风正好。'
    })
    expect(reads[1]).toMatchObject({
      ref: '旁白1', kind: 'narration', index: 1, matched: true, messageId: 3, promptText: '写一段夜色清冷的环境旁白。'
    })
  })

  it('readMessagePrompt 越界/无来源 → matched:false + total，不报错', async () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    const { reads } = await runTidiaoReadMessagePrompt({ ref: '角色7' }, ctx)
    expect(reads[0]).toMatchObject({ ref: '角色7', matched: false, total: 2, messageId: 0, promptText: '' })
  })

  it('editMessagePrompt 对提示词做 str_replace、其余不动 + 累积写回', () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    const result = runTidiaoEditMessagePrompt(
      { ref: '角色1', oldText: '凉风正好', newText: '夜色撩人' },
      ctx
    )
    expect(result.edit).toMatchObject({
      ref: '角色1', kind: 'role', index: 1, matched: true, messageId: 2, speakerName: '阿澈',
      outcome: 'applied', occurrences: 1, promptText: '请用温柔的语气回复，重点写夜色撩人。'
    })
    expect(ctx.collectPromptEdits()).toEqual([
      {
        kind: 'role', index: 1, messageId: 2, speakerName: '阿澈', ref: '角色1',
        promptText: '请用温柔的语气回复，重点写夜色撩人。', editCount: 1
      }
    ])
  })

  it('同一条提示词多次精改累加到同一工作副本', () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    runTidiaoEditMessagePrompt({ ref: '角色1', oldText: '温柔的语气', newText: '俏皮的语气' }, ctx)
    const second = runTidiaoEditMessagePrompt({ ref: '角色1', oldText: '凉风正好', newText: '夜色撩人' }, ctx)
    expect(second.edit.promptText).toBe('请用俏皮的语气回复，重点写夜色撩人。')
    const commits = ctx.collectPromptEdits()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ messageId: 2, editCount: 2, promptText: '请用俏皮的语气回复，重点写夜色撩人。' })
  })

  it('多目标：分别改角色与旁白提示词各落一条 commit（按楼层有序）', () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    runTidiaoEditMessagePrompt({ ref: '旁白1', oldText: '清冷', newText: '温柔' }, ctx)
    runTidiaoEditMessagePrompt({ ref: '角色2', oldText: '简短', newText: '热情' }, ctx)
    const commits = ctx.collectPromptEdits()
    expect(commits.map((c) => c.ref)).toEqual(['角色2', '旁白1'])
    expect(commits.find((c) => c.ref === '旁白1').promptText).toBe('写一段夜色温柔的环境旁白。')
    expect(commits.find((c) => c.ref === '角色2').promptText).toBe('请热情回应，表达答应一起走走。')
  })

  it('未命中片段 → outcome not-found、不计入 commit', () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    const result = runTidiaoEditMessagePrompt({ ref: '角色1', oldText: '查无此句', newText: 'x' }, ctx)
    expect(result.edit.outcome).toBe('not-found')
    expect(result.edit.matched).toBe(true)
    expect(ctx.collectPromptEdits()).toEqual([])
  })

  it('越界楼层改提示词 → matched:false + total，不报错、不计入 commit', () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    const result = runTidiaoEditMessagePrompt({ ref: '角色7', oldText: 'a', newText: 'b' }, ctx)
    expect(result.edit).toMatchObject({ ref: '角色7', matched: false, total: 2, messageId: 0, outcome: 'not-found' })
    expect(ctx.collectPromptEdits()).toEqual([])
  })

  it('无可解析楼层引用 → edit:null / reads 空', async () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    expect(runTidiaoEditMessagePrompt({ ref: '随便改改', oldText: 'a', newText: 'b' }, ctx).edit).toBeNull()
    expect((await runTidiaoReadMessagePrompt({ ref: '随便看看' }, ctx)).reads).toEqual([])
  })

  it('floorTotal 缺省按来源桶大小；传 totals 用消息总数（供未命中回报）', async () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    expect(ctx.floorTotal('role')).toBe(2)
    expect(ctx.floorTotal('narration')).toBe(1)
    const withTotals = createTidiaoMessagePromptContext(sampleSources(), { role: 5, narration: 3 })
    expect(withTotals.floorTotal('role')).toBe(5)
    expect(withTotals.floorTotal('narration')).toBe(3)
    // 越界读取的 total 反映真实消息总数，提调据此知道「角色7 不存在、共 5 条」。
    expect((await runTidiaoReadMessagePrompt({ ref: '角色7' }, withTotals)).reads[0].total).toBe(5)
  })

  // 批次E·层4：readPromptByFloor 允许返回 Promise——统筹 loop 懒取接缝（真调工具时才 fetch promptLog）。
  it('批次E 懒取接缝：readPromptByFloor 返回 Promise 时 reads 正常解析（异步/同步实现同口径）', async () => {
    const lazyCtx = {
      floorTotal: () => 3,
      readPromptByFloor: async (kind, index) => (kind === 'role' && index === 2
        ? { ref: '角色2', kind, index, total: 3, matched: true, messageId: 5, speakerName: '阿澈', promptText: '懒取到的提示词全文' }
        : null),
      editPromptByFloor: () => null,
      collectPromptEdits: () => []
    }
    const { reads } = await runTidiaoReadMessagePrompt({ ref: '角色2、角色3' }, lazyCtx)
    expect(reads[0]).toMatchObject({ ref: '角色2', matched: true, promptText: '懒取到的提示词全文' })
    expect(reads[1]).toMatchObject({ ref: '角色3', matched: false, total: 3, promptText: '' })
  })
})

// 2026-07-06 懒取兜底（真机修「无提示词可读」死胡同）：预取只有纠偏目标一条，提调定位到其他楼层
// 走中策就撞死。lazyFetch 在位时未预取楼层按需 fetch 并落工作副本桶，读→改→collect 与预取来源同语义。
describe('createTidiaoMessagePromptContext lazyFetch 懒取兜底（2026-07-06）', () => {
  const lazySource = { kind: 'role', index: 3, messageId: 9, speakerName: '陈星依', promptText: '请用陈星依的口吻回应用户，态度别那么冲。' }

  it('未预取楼层经 lazyFetch 命中：读到提示词，且落桶后可继续改+收集（与预取来源同语义）', async () => {
    const { vi } = await import('vitest')
    const lazyFetch = vi.fn(async (kind, index) => (kind === 'role' && index === 3 ? { ...lazySource } : null))
    const ctx = createTidiaoMessagePromptContext(sampleSources(), { role: 5, narration: 2 }, { lazyFetch })
    const read = await ctx.readPromptByFloor('role', 3)
    expect(read).toMatchObject({ matched: true, messageId: 9, speakerName: '陈星依' })
    expect(read.promptText).toContain('态度别那么冲')
    // 落桶后同步改提示词照常工作，并进 collectPromptEdits。
    const edit = ctx.editPromptByFloor('role', 3, { oldText: '态度别那么冲', newText: '态度要符合她外冷内热的人设' })
    expect(edit).toMatchObject({ outcome: 'applied', messageId: 9 })
    const commits = ctx.collectPromptEdits()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ kind: 'role', index: 3, messageId: 9 })
    expect(commits[0].promptText).toContain('外冷内热')
    // 再读走桶内工作副本（含刚才的改动），lazyFetch 不再被调。
    const reread = await ctx.readPromptByFloor('role', 3)
    expect(reread.promptText).toContain('外冷内热')
    expect(lazyFetch).toHaveBeenCalledTimes(1)
  })

  it('lazyFetch 查不到：返回 null 且记 miss，不重复 fetch；预取楼层不经 lazyFetch', async () => {
    const { vi } = await import('vitest')
    const lazyFetch = vi.fn(async () => null)
    const ctx = createTidiaoMessagePromptContext(sampleSources(), { role: 5, narration: 2 }, { lazyFetch })
    expect(await ctx.readPromptByFloor('role', 4)).toBeNull()
    expect(await ctx.readPromptByFloor('role', 4)).toBeNull()
    expect(lazyFetch).toHaveBeenCalledTimes(1)
    // 预取命中的楼层同步返回，不走 lazyFetch。
    const read = ctx.readPromptByFloor('role', 1)
    expect(read).toMatchObject({ matched: true, messageId: 2 })
    expect(lazyFetch).toHaveBeenCalledTimes(1)
  })

  it('不传 lazyFetch：未预取楼层仍同步 null（旧行为零回归）', () => {
    const ctx = createTidiaoMessagePromptContext(sampleSources())
    expect(ctx.readPromptByFloor('role', 3)).toBeNull()
  })
})
