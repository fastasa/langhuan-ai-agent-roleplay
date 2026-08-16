import { describe, expect, it, vi } from 'vitest'
import {
  createXingyiCreateConversationTool,
  createXingyiSetImageAsAvatarTool,
  createXingyiViewAvatarTool
} from '../../../src/app/xingyiConversationAvatarTools.ts'

function context(overrides = {}) {
  const provider = {
    listCharacters: () => [{ id: 'char_1', name: '惊雨' }, { id: 'char_2', name: '奥黛丽' }],
    listAliases: () => [{ id: 'alias_1', name: '剑士马甲' }],
    listSessions: () => [{ id: 'session_1', name: '旧会话' }],
    getCurrentSession: () => ({ id: 'session_1', name: '旧会话' }),
    getUser: () => ({ id: 'user_profile', name: '沈一' }),
    readAvatar: vi.fn(async (target) => ({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      label: `${target.kind}:${target.name}`
    })),
    createConversation: vi.fn(async (input) => ({ sessionId: 'session_new', title: input.title })),
    assignAvatar: vi.fn(async () => true)
  }
  return {
    provider,
    listImages: () => [
      { id: 'upload_1', url: '/chat-images/upload.png', label: '用户上传图', source: 'user' },
      { id: 'generated_1', url: '/chat-images/generated.png', label: '星依生成图', source: 'generated' }
    ],
    onAvatarViewed: vi.fn(() => true),
    confirmWrite: vi.fn(async () => true),
    ...overrides
  }
}

describe('星依创建会话与设置头像工具', () => {
  it('创建会话使用成员默认标题且成员概率为 100', async () => {
    const ctx = context()
    const tool = createXingyiCreateConversationTool(ctx)

    const result = await tool.execute({ id: 'c1', name: tool.name, args: { members: ['惊雨', '奥黛丽'] } }, { signal: new AbortController().signal })

    expect(result.status).not.toBe('error')
    expect(ctx.provider.createConversation).toHaveBeenCalledWith({
      title: '惊雨、奥黛丽',
      members: [
        { id: 'char_1', name: '惊雨', probability: 100 },
        { id: 'char_2', name: '奥黛丽', probability: 100 }
      ]
    })
  })

  it('设置头像缺省优先使用最近生成图并解析当前会话', async () => {
    const ctx = context()
    const tool = createXingyiSetImageAsAvatarTool(ctx)

    const result = await tool.execute({
      id: 'c2',
      name: tool.name,
      args: { targetKind: 'session', target: '当前会话' }
    }, { signal: new AbortController().signal })

    expect(result.status).not.toBe('error')
    expect(ctx.provider.assignAvatar).toHaveBeenCalledWith(
      { id: 'session_1', name: '旧会话', kind: 'session' },
      expect.objectContaining({ id: 'generated_1', source: 'generated' }),
      { focusX: 0.5, focusY: 0.5, zoom: 1 }
    )
  })

  it('把模型给出的焦点百分比与缩放传给统一裁剪预览', async () => {
    const ctx = context()
    const tool = createXingyiSetImageAsAvatarTool(ctx)

    const result = await tool.execute({
      id: 'c2-crop',
      name: tool.name,
      args: { targetKind: 'character', target: '惊雨', focusX: 72, focusY: 34, zoom: 1.45 }
    }, { signal: new AbortController().signal })

    expect(result.status).not.toBe('error')
    expect(ctx.provider.assignAvatar).toHaveBeenCalledWith(
      { id: 'char_1', name: '惊雨', kind: 'character' },
      expect.objectContaining({ id: 'generated_1' }),
      { focusX: 0.72, focusY: 0.34, zoom: 1.45 }
    )
    expect(result.details.crop).toEqual({ focusX: 0.72, focusY: 0.34, zoom: 1.45 })
  })

  it('用户在裁剪预览中取消时不把头像报告成已保存', async () => {
    const ctx = context({
      provider: { ...context().provider, assignAvatar: vi.fn(async () => false) }
    })
    const tool = createXingyiSetImageAsAvatarTool(ctx)

    const result = await tool.execute({
      id: 'c2-cancel',
      name: tool.name,
      args: { targetKind: 'alias', target: '剑士马甲' }
    }, { signal: new AbortController().signal })

    expect(result.content).toContain('取消了头像裁剪')
    expect(result.details.cancelled).toBe(true)
  })

  it('实际读取用户头像时只把 data:image 交给下一轮视觉队列，不在工具正文泄露图片数据', async () => {
    const ctx = context()
    const tool = createXingyiViewAvatarTool(ctx)

    const result = await tool.execute({
      id: 'view-user',
      name: tool.name,
      args: { targetKind: 'user' }
    }, { signal: new AbortController().signal })

    expect(result.status).not.toBe('error')
    expect(ctx.provider.readAvatar).toHaveBeenCalledWith({ id: 'user_profile', name: '沈一', kind: 'user' })
    expect(ctx.onAvatarViewed).toHaveBeenCalledWith(expect.objectContaining({
      id: 'avatar:user:user_profile',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      targetKind: 'user',
      targetName: '沈一'
    }))
    expect(result.content).toContain('下一轮视觉输入')
    expect(result.content).not.toContain('data:image')
    expect(JSON.stringify(result.details)).not.toContain('data:image')
  })

  it('会话头像缺省解析当前会话；未设置时如实返回且不伪装成已经看图', async () => {
    const base = context()
    const ctx = context({
      provider: { ...base.provider, readAvatar: vi.fn(async () => null) }
    })
    const tool = createXingyiViewAvatarTool(ctx)

    const result = await tool.execute({
      id: 'view-session',
      name: tool.name,
      args: { targetKind: 'session' }
    }, { signal: new AbortController().signal })

    expect(ctx.provider.readAvatar).toHaveBeenCalledWith({ id: 'session_1', name: '旧会话', kind: 'session' })
    expect(result.content).toContain('没有设置头像')
    expect(result.details).toMatchObject({ targetKind: 'session', targetId: 'session_1', hasAvatar: false })
    expect(ctx.onAvatarViewed).not.toHaveBeenCalled()
  })

  it('角色名称歧义时拒绝猜测 id', async () => {
    const ctx = context({
      provider: {
        ...context().provider,
        listCharacters: () => [{ id: 'a', name: '小雨' }, { id: 'b', name: '大雨' }]
      }
    })
    const tool = createXingyiCreateConversationTool(ctx)

    const result = await tool.execute({ id: 'c3', name: tool.name, args: { members: ['雨'] } }, { signal: new AbortController().signal })

    expect(result.status).toBe('error')
    expect(result.content).toContain('多个匹配')
  })
})
