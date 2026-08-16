import { describe, expect, it } from 'vitest'
import { contentToText, formatAttachmentNote, parseChatAttachments, readMessageAttachments, serializeChatAttachments, upgradeCurrentUserMessageWithAttachments } from '../../../src/utils/chatAttachments.ts'

function makeAttachment(overrides = {}) {
  return {
    id: 'attach_1',
    kind: 'image',
    url: '/chat-images/attach_1.png',
    mime: 'image/png',
    ...overrides
  }
}

describe('chatAttachments parseChatAttachments', () => {
  it('parses a JSON string column into attachment objects', () => {
    const raw = JSON.stringify([makeAttachment()])
    expect(parseChatAttachments(raw)).toEqual([makeAttachment()])
  })

  it('accepts an already-parsed array (toCamel auto JSON.parse behavior)', () => {
    const list = [makeAttachment({ id: 'attach_2' })]
    expect(parseChatAttachments(list)).toEqual(list)
  })

  it('falls back to an empty array for missing/empty/malformed input', () => {
    expect(parseChatAttachments(undefined)).toEqual([])
    expect(parseChatAttachments(null)).toEqual([])
    expect(parseChatAttachments('')).toEqual([])
    expect(parseChatAttachments('not json')).toEqual([])
    expect(parseChatAttachments('{}')).toEqual([])
  })

  it('drops malformed entries that are missing required fields', () => {
    const raw = JSON.stringify([
      makeAttachment(),
      { id: 'attach_bad', kind: 'image' }, // 缺 url/mime
      { kind: 'image', url: '/chat-images/x.png', mime: 'image/png' } // 缺 id
    ])
    expect(parseChatAttachments(raw)).toEqual([makeAttachment()])
  })
})

describe('chatAttachments serializeChatAttachments', () => {
  it('round-trips through parseChatAttachments', () => {
    const list = [makeAttachment(), makeAttachment({ id: 'attach_2', caption: '一只猫', captionStatus: 'done' })]
    expect(parseChatAttachments(serializeChatAttachments(list))).toEqual(list)
  })

  it('serializes non-array input as an empty array', () => {
    expect(serializeChatAttachments(undefined)).toBe('[]')
  })
})

describe('chatAttachments formatAttachmentNote', () => {
  it('returns empty string for an empty list', () => {
    expect(formatAttachmentNote([])).toBe('')
  })

  it('uses the caption when captionStatus is done', () => {
    const note = formatAttachmentNote([makeAttachment({ caption: '一只橘猫趴在窗台上', captionStatus: 'done' })])
    expect(note).toBe('\n[图片1：一只橘猫趴在窗台上]')
  })

  it('falls back to a neutral filename placeholder when caption is missing or failed（2026-07-11 caption 默认关闭·占位文案改中性）', () => {
    const missing = formatAttachmentNote([makeAttachment({ originalName: '截图.png' })])
    expect(missing).toBe('\n[图片1：截图.png]')

    const failed = formatAttachmentNote([makeAttachment({ caption: '', captionStatus: 'failed', originalName: '截图.png' })])
    expect(failed).toBe('\n[图片1：截图.png]')
  })

  it('falls back to a generic 图片 label when originalName is also missing', () => {
    expect(formatAttachmentNote([makeAttachment()])).toBe('\n[图片1：图片]')
  })

  it('numbers multiple attachments in order', () => {
    const note = formatAttachmentNote([
      makeAttachment({ id: 'a1', caption: '第一张', captionStatus: 'done' }),
      makeAttachment({ id: 'a2', originalName: '第二张.png' })
    ])
    expect(note).toBe('\n[图片1：第一张]\n[图片2：第二张.png]')
  })
})

describe('chatAttachments contentToText（批2·图片双通道兜底）', () => {
  it('字符串 content 原样返回', () => {
    expect(contentToText('普通文字')).toBe('普通文字')
    expect(contentToText('')).toBe('')
  })

  it('parts 数组合并 text part，image part 换成占位', () => {
    expect(contentToText([
      { type: 'text', text: '你好' },
      { type: 'image_url', image_url: { url: '/chat-images/x.png' } },
      { type: 'text', text: '世界' }
    ])).toBe('你好[图片]世界')
  })

  it('null/undefined/非数组非字符串 → 空字符串', () => {
    expect(contentToText(null)).toBe('')
    expect(contentToText(undefined)).toBe('')
  })
})

describe('chatAttachments readMessageAttachments（批4·真实键名踩坑兜底）', () => {
  it('优先读 attachmentsJson（服务端 toCamel 后的主路径，已是数组）', () => {
    const message = { role: 'user', content: '图', attachmentsJson: [makeAttachment()], attachments: [makeAttachment({ id: 'wrong' })] }
    expect(readMessageAttachments(message)).toEqual([makeAttachment()])
  })

  it('其次读 attachments（本地乐观回显，未走 toCamel）', () => {
    const message = { role: 'user', content: '图', attachments: [makeAttachment({ id: 'a2' })] }
    expect(readMessageAttachments(message)).toEqual([makeAttachment({ id: 'a2' })])
  })

  it('兜底读 attachments_json 字符串（理论上客户端不会见到，防御性兜底）', () => {
    const message = { role: 'user', content: '图', attachments_json: JSON.stringify([makeAttachment({ id: 'a3' })]) }
    expect(readMessageAttachments(message)).toEqual([makeAttachment({ id: 'a3' })])
  })

  it('三个键都没有/消息非对象时返回空数组', () => {
    expect(readMessageAttachments({ role: 'user', content: '没有图' })).toEqual([])
    expect(readMessageAttachments(null)).toEqual([])
    expect(readMessageAttachments(undefined)).toEqual([])
    expect(readMessageAttachments('not an object')).toEqual([])
  })
})

describe('chatAttachments upgradeCurrentUserMessageWithAttachments（批4·通道A当轮原生图）', () => {
  it('把最后一条 user 消息升级为 parts 数组（文字+每图 image_url）', () => {
    const messages = [
      { role: 'system', content: '系统提示' },
      { role: 'assistant', content: '上一轮回复' },
      { role: 'user', content: '看看这张图' }
    ]
    const result = upgradeCurrentUserMessageWithAttachments(messages, [makeAttachment({ caption: '一只猫', captionStatus: 'done' })])
    expect(result[0]).toEqual(messages[0])
    expect(result[1]).toEqual(messages[1])
    expect(result[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '看看这张图\n[图片1：一只猫]' },
        { type: 'image_url', image_url: { url: '/chat-images/attach_1.png' } }
      ]
    })
  })

  it('多图逐条追加 image_url part', () => {
    const messages = [{ role: 'user', content: '两张图' }]
    const result = upgradeCurrentUserMessageWithAttachments(messages, [
      makeAttachment({ id: 'a1' }),
      makeAttachment({ id: 'a2', url: '/chat-images/attach_2.png' })
    ])
    expect(result[0].content).toEqual([
      { type: 'text', text: '两张图\n[图片1：图片]\n[图片2：图片]' },
      { type: 'image_url', image_url: { url: '/chat-images/attach_1.png' } },
      { type: 'image_url', image_url: { url: '/chat-images/attach_2.png' } }
    ])
  })

  it('只升级最后一条 user 消息，不动更早的历史 user 消息', () => {
    const messages = [
      { role: 'user', content: '第一轮' },
      { role: 'assistant', content: '回复' },
      { role: 'user', content: '第二轮' }
    ]
    const result = upgradeCurrentUserMessageWithAttachments(messages, [makeAttachment()])
    expect(result[0]).toEqual(messages[0])
    expect(Array.isArray(result[2].content)).toBe(true)
  })

  it('空附件/无 user 消息/空数组时原样返回（identity，零变化）', () => {
    const messages = [{ role: 'system', content: '无用户消息' }]
    expect(upgradeCurrentUserMessageWithAttachments(messages, [])).toBe(messages)
    expect(upgradeCurrentUserMessageWithAttachments(messages, undefined)).toBe(messages)
    expect(upgradeCurrentUserMessageWithAttachments([], [makeAttachment()])).toEqual([])
    expect(upgradeCurrentUserMessageWithAttachments(messages, [makeAttachment()])).toBe(messages)
  })

  it('已是 parts 数组的 user 消息也能正确合并文字前缀', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: '原有文字' }] }]
    const result = upgradeCurrentUserMessageWithAttachments(messages, [makeAttachment()])
    expect(result[0].content[0]).toEqual({ type: 'text', text: '原有文字\n[图片1：图片]' })
  })
})
