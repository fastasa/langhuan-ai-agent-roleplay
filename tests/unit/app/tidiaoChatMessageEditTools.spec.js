import { describe, expect, it } from 'vitest'
import {
  applyStrReplace,
  applyAppend,
  createTidiaoChatMessageEditContext,
  runTidiaoEditChatMessage,
  runTidiaoAppendChatMessage
} from '../../../src/app/tidiaoChatMessageEditTools.ts'

function sampleMessages() {
  return [
    { id: 1, role: 'user', content: '今晚天气不错' },
    { id: 2, role: 'assistant', name: '阿澈', content: '是啊，凉风正好。要不要出去走走？' },
    { id: 3, role: 'assistant', messageKind: 'narration', content: '窗外月色清冷，凉风拂过。' },
    { id: 4, role: 'assistant', messageKind: 'narration_debug', content: '【调试】旁白草稿' },
    { id: 5, role: 'assistant', name: '阿澈', content: '好的好的，那就走走吧。' }
  ]
}

describe('applyStrReplace（纯 str_replace 语义）', () => {
  it('唯一命中 → applied + 新内容', () => {
    const r = applyStrReplace('是啊，凉风正好。', { oldText: '凉风正好', newText: '夜色真美' })
    expect(r).toEqual({ outcome: 'applied', occurrences: 1, content: '是啊，夜色真美。' })
  })

  it('未命中 → not-found、内容不变', () => {
    const r = applyStrReplace('是啊，凉风正好。', { oldText: '不存在', newText: 'x' })
    expect(r).toEqual({ outcome: 'not-found', occurrences: 0, content: '是啊，凉风正好。' })
  })

  it('多处命中且未 replaceAll → ambiguous、内容不变', () => {
    const r = applyStrReplace('走走，再走走。', { oldText: '走走', newText: '逛逛' })
    expect(r.outcome).toBe('ambiguous')
    expect(r.occurrences).toBe(2)
    expect(r.content).toBe('走走，再走走。')
  })

  it('多处命中 + replaceAll → 全替换', () => {
    const r = applyStrReplace('走走，再走走。', { oldText: '走走', newText: '逛逛', replaceAll: true })
    expect(r).toEqual({ outcome: 'applied', occurrences: 2, content: '逛逛，再逛逛。' })
  })

  it('oldText 为空 → empty-old', () => {
    expect(applyStrReplace('abc', { oldText: '', newText: 'x' }).outcome).toBe('empty-old')
  })

  it('oldText===newText → no-op', () => {
    expect(applyStrReplace('abc', { oldText: 'a', newText: 'a' }).outcome).toBe('no-op')
  })

  it('newText 为空 = 删除片段', () => {
    const r = applyStrReplace('是啊，凉风正好。', { oldText: '，凉风正好', newText: '' })
    expect(r).toEqual({ outcome: 'applied', occurrences: 1, content: '是啊。' })
  })
})

describe('applyAppend（精准追加语义·2026-07-07）', () => {
  it('缺省 afterText → 追加到末尾（截断补完主路径）', () => {
    const r = applyAppend('是啊，凉风正', { text: '好。要不要出去走走？' })
    expect(r).toEqual({ outcome: 'applied', occurrences: 0, content: '是啊，凉风正好。要不要出去走走？' })
  })

  it('afterText 唯一命中 → 插在锚点后', () => {
    const r = applyAppend('是啊，凉风正好。走吧。', { text: '月色也美。', afterText: '凉风正好。' })
    expect(r).toEqual({ outcome: 'applied', occurrences: 1, content: '是啊，凉风正好。月色也美。走吧。' })
  })

  it('afterText 未命中 → not-found、内容不变', () => {
    const r = applyAppend('是啊。', { text: 'x', afterText: '不存在' })
    expect(r).toEqual({ outcome: 'not-found', occurrences: 0, content: '是啊。' })
  })

  it('afterText 多处命中 → ambiguous、内容不变', () => {
    const r = applyAppend('走走，再走走。', { text: 'x', afterText: '走走' })
    expect(r.outcome).toBe('ambiguous')
    expect(r.occurrences).toBe(2)
    expect(r.content).toBe('走走，再走走。')
  })

  it('text 为空 → no-op', () => {
    expect(applyAppend('abc', { text: '' }).outcome).toBe('no-op')
  })
})

describe('runTidiaoAppendChatMessage（精准增加内容·与精修同工作副本）', () => {
  it('按楼层号补完截断消息、计入 collectEdits 写回', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    const result = runTidiaoAppendChatMessage({ ref: '角色1', text: '夜里风大，记得带件外套。' }, ctx)
    expect(result.edit).toMatchObject({
      ref: '角色1',
      matched: true,
      messageId: 2,
      outcome: 'applied',
      content: '是啊，凉风正好。要不要出去走走？夜里风大，记得带件外套。'
    })
    expect(ctx.collectEdits()).toEqual([
      expect.objectContaining({ messageId: 2, editCount: 1, content: '是啊，凉风正好。要不要出去走走？夜里风大，记得带件外套。' })
    ])
  })

  it('与 editChatMessage 累积在同一工作副本', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    runTidiaoEditChatMessage({ ref: '角色1', oldText: '凉风正好', newText: '夜色正好' }, ctx)
    const appended = runTidiaoAppendChatMessage({ ref: '角色1', text: '披件外套再出门。', afterText: '要不要出去走走？' }, ctx)
    expect(appended.edit.content).toBe('是啊，夜色正好。要不要出去走走？披件外套再出门。')
    const commits = ctx.collectEdits()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ messageId: 2, editCount: 2 })
  })

  it('越界楼层 → matched:false + total；无可解析引用 → edit:null', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    expect(runTidiaoAppendChatMessage({ ref: '角色7', text: 'x' }, ctx).edit)
      .toMatchObject({ ref: '角色7', matched: false, total: 2, outcome: 'not-found' })
    expect(runTidiaoAppendChatMessage({ ref: '随便', text: 'x' }, ctx).edit).toBeNull()
    expect(ctx.collectEdits()).toEqual([])
  })
})

describe('tidiaoChatMessageEditTools（批次 M3 锚定精修）', () => {
  it('按楼层号对某条消息精修一段、其余不动 + 累积写回', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    const result = runTidiaoEditChatMessage(
      { ref: '角色1', oldText: '凉风正好', newText: '夜色正好' },
      ctx
    )
    expect(result.edit).toMatchObject({
      ref: '角色1',
      kind: 'role',
      index: 1,
      matched: true,
      messageId: 2,
      speakerName: '阿澈',
      outcome: 'applied',
      occurrences: 1,
      content: '是啊，夜色正好。要不要出去走走？'
    })
    expect(ctx.collectEdits()).toEqual([
      {
        kind: 'role',
        index: 1,
        messageId: 2,
        speakerName: '阿澈',
        ref: '角色1',
        content: '是啊，夜色正好。要不要出去走走？',
        editCount: 1
      }
    ])
  })

  it('同一条消息多次精修累加到同一工作副本', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    runTidiaoEditChatMessage({ ref: '角色1', oldText: '凉风正好', newText: '夜色正好' }, ctx)
    const second = runTidiaoEditChatMessage({ ref: '角色1', oldText: '出去走走', newText: '出去散步' }, ctx)
    expect(second.edit.content).toBe('是啊，夜色正好。要不要出去散步？')
    const commits = ctx.collectEdits()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ messageId: 2, editCount: 2, content: '是啊，夜色正好。要不要出去散步？' })
  })

  it('多目标：分别精修角色与旁白各落一条 commit', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    runTidiaoEditChatMessage({ ref: '角色2', oldText: '好的好的', newText: '嗯' }, ctx)
    runTidiaoEditChatMessage({ ref: '旁白1', oldText: '清冷', newText: '温柔' }, ctx)
    const commits = ctx.collectEdits()
    expect(commits.map((c) => c.ref)).toEqual(['角色2', '旁白1'])
    expect(commits.find((c) => c.ref === '角色2').content).toBe('嗯，那就走走吧。')
    expect(commits.find((c) => c.ref === '旁白1').content).toBe('窗外月色温柔，凉风拂过。')
  })

  it('未命中片段 → outcome not-found、不计入 commit', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    const result = runTidiaoEditChatMessage({ ref: '角色1', oldText: '查无此句', newText: 'x' }, ctx)
    expect(result.edit.outcome).toBe('not-found')
    expect(result.edit.matched).toBe(true)
    expect(ctx.collectEdits()).toEqual([])
  })

  it('越界楼层 → matched:false + total，不报错', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    const result = runTidiaoEditChatMessage({ ref: '角色7', oldText: 'a', newText: 'b' }, ctx)
    expect(result.edit).toMatchObject({ ref: '角色7', matched: false, total: 2, messageId: 0, outcome: 'not-found' })
    expect(ctx.collectEdits()).toEqual([])
  })

  it('调试消息不可改、不挤占楼层序号', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    expect(ctx.floorTotal('role')).toBe(2)
    expect(ctx.floorTotal('narration')).toBe(1)
  })

  it('无可解析楼层引用 → edit:null', () => {
    const ctx = createTidiaoChatMessageEditContext(sampleMessages())
    expect(runTidiaoEditChatMessage({ ref: '随便改改', oldText: 'a', newText: 'b' }, ctx).edit).toBeNull()
  })
})
