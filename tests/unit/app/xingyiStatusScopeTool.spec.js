/**
 * @vitest-environment node
 * 星依「建状态栏前确认取料范围」工具（2026-07-09）回归锁：
 * 通道未接入→如实报 / 用户确认范围→拼指令回模型（软锁·只在范围内取料）/ 用户关掉→dismissed /
 * 只确认角色没选对话→当没确认处理 / 参数校验。
 */
import { describe, it, expect, vi } from 'vitest'
import { createConfirmStatusScopeTool } from '../../../src/app/xingyiStatusScopeTool'

const REQUEST_ARGS = { purpose: '给张元英建角色状态栏', characterHint: '张元英', sessionHint: '星依与未知的演唱会' }

describe('createConfirmStatusScopeTool', () => {
  it('confirmStatusScope 通道未接入 → 如实报不可用（error）', async () => {
    const tool = createConfirmStatusScopeTool({})
    const result = await tool.execute({ args: REQUEST_ARGS })
    expect(result.error?.type).toBe('TOOL_RUNTIME_ERROR')
    expect(result.content).toContain('未接入')
  })

  it('用户确认范围 → 请求原样传给浮坞，回执把范围拼成「只在这些对话/文档库内取料」的指令（软锁）', async () => {
    const confirmStatusScope = vi.fn(async () => ({
      characterName: '张元英',
      sessions: [
        { title: '星依与未知的演唱会', sessionId: 'sess-1' },
        { title: '排练日常', sessionId: 'sess-2' }
      ],
      docScopeSummary: '角色档案（共 12 个文档）'
    }))
    const tool = createConfirmStatusScopeTool({ confirmStatusScope })
    const result = await tool.execute({ args: REQUEST_ARGS })
    expect(confirmStatusScope).toHaveBeenCalledWith({
      purpose: '给张元英建角色状态栏',
      characterHint: '张元英',
      sessionHint: '星依与未知的演唱会'
    })
    expect(result.details).toMatchObject({ confirmed: true, characterName: '张元英' })
    // 范围拼进指令：角色、两个对话（含 sessionId 精确定位）、文档库摘要、并把状态栏建在第一个选定会话上
    expect(result.content).toContain('张元英')
    expect(result.content).toContain('星依与未知的演唱会')
    expect(result.content).toContain('排练日常')
    expect(result.content).toContain('sessionId=sess-1')
    expect(result.content).toContain('session=sess-1')
    expect(result.content).toContain('角色档案（共 12 个文档）')
    expect(result.content).toContain('禁止引入其他对话')
  })

  it('用户关掉卡片没确认（null）→ dismissed，提示别擅自建', async () => {
    const confirmStatusScope = vi.fn(async () => null)
    const tool = createConfirmStatusScopeTool({ confirmStatusScope })
    const result = await tool.execute({ args: REQUEST_ARGS })
    expect(result.details).toMatchObject({ dismissed: true })
    expect(result.content).toContain('不要擅自建状态栏')
  })

  it('用户提交范围修改意见 → 不确认范围，意见回灌模型修订后重提', async () => {
    const confirmStatusScope = vi.fn(async () => ({ feedback: '只看排练日常，不要查文档库' }))
    const tool = createConfirmStatusScopeTool({ confirmStatusScope })
    const result = await tool.execute({ args: REQUEST_ARGS })
    expect(result.content).toContain('只看排练日常')
    expect(result.details).toMatchObject({ needsRevision: true })
  })

  it('用户确认了但没选任何对话 → 当作未确认处理（不看对话没法准确取料）', async () => {
    const confirmStatusScope = vi.fn(async () => ({ characterName: '张元英', sessions: [], docScopeSummary: '' }))
    // sessions 为空 = 用户没选任何对话
    const tool = createConfirmStatusScopeTool({ confirmStatusScope })
    const result = await tool.execute({ args: REQUEST_ARGS })
    expect(result.details).toMatchObject({ dismissed: true })
    expect(result.content).toContain('没有选择任何对话')
  })

  it('参数校验：缺 purpose → 拦下', () => {
    const tool = createConfirmStatusScopeTool({ confirmStatusScope: vi.fn() })
    expect(tool.validateArgs({})).toContain('缺少 purpose')
    expect(tool.validateArgs({ purpose: '建状态栏' })).toBeNull()
  })
})
