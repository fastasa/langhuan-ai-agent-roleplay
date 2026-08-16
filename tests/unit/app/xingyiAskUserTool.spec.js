/**
 * @vitest-environment node
 * 星依 askUser 询问工具（内核统一批·批C）回归锁：
 * 通道未接入→如实报 / 用户选选项→回答复 / 用户输入其他想法→回答复 / 用户关掉→dismissed / 参数校验。
 */
import { describe, it, expect, vi } from 'vitest'
import { createAskUserTool } from '../../../src/app/xingyiAskUserTool'

const QUESTION = '张元英是修仙角色，要不要给状态栏加「境界」字段？'
const OPTIONS = [
  { label: '加境界字段', note: '修仙世界观常用，能记录突破进度' },
  { label: '先不加', note: '保持模板通用，之后需要再补' }
]

describe('createAskUserTool', () => {
  it('askUser 通道未接入 → 如实报不可用（error）', async () => {
    const tool = createAskUserTool({})
    const result = await tool.execute({ args: { question: QUESTION, options: OPTIONS } })
    expect(result.error?.type).toBe('TOOL_RUNTIME_ERROR')
    expect(result.content).toContain('未接入')
  })

  it('用户选了某个选项 → 答复原样回给模型，并带 allowOtherInput 缺省 true', async () => {
    const askUser = vi.fn(async () => '加境界字段')
    const tool = createAskUserTool({ askUser })
    const result = await tool.execute({ args: { question: QUESTION, options: OPTIONS } })
    expect(askUser).toHaveBeenCalledWith({ question: QUESTION, options: OPTIONS, allowOtherInput: true })
    expect(result.details).toMatchObject({ answer: '加境界字段' })
    expect(result.content).toContain('加境界字段')
    expect(result.content).toContain('继续把事情做完')
  })

  it('用户输入「其他想法」自由文本 → 原样作为答复', async () => {
    const askUser = vi.fn(async () => '改叫「修为」而不是境界')
    const tool = createAskUserTool({ askUser })
    const result = await tool.execute({ args: { question: QUESTION, options: OPTIONS, allowOtherInput: true } })
    expect(result.details).toMatchObject({ answer: '改叫「修为」而不是境界' })
  })

  it('用户关掉卡片没答（空串）→ dismissed，提示不要擅自替用户决定', async () => {
    const askUser = vi.fn(async () => '')
    const tool = createAskUserTool({ askUser })
    const result = await tool.execute({ args: { question: QUESTION, options: OPTIONS } })
    expect(result.details).toMatchObject({ dismissed: true })
    expect(result.content).toContain('不要擅自替用户决定')
  })

  it('参数校验：缺 question / 选项不足 2 个 → 拦下', () => {
    const tool = createAskUserTool({ askUser: vi.fn() })
    expect(tool.validateArgs({})).toContain('缺少 question')
    expect(tool.validateArgs({ question: QUESTION, options: [{ label: '只有一个' }] })).toContain('至少 2 个')
    expect(tool.validateArgs({ question: QUESTION, options: OPTIONS })).toBeNull()
  })
})
