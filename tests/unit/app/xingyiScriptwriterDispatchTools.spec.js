import { describe, expect, it, vi } from 'vitest'
import { createXingyiDispatchScriptwriterTool } from '../../../src/app/xingyiScriptwriterDispatchTools.ts'

const SESSION = { sessionId: 'session_1', sessionTitle: '雨夜会谈', characterOptions: [] }

describe('createXingyiDispatchScriptwriterTool', () => {
  it('缺确认通道时硬拒绝，不派遣', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, dispatch })
    const result = await tool.execute({ args: { directive: '生成第一版剧本' } })
    expect(result.status).toBe('error')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('确认后把活动会话和原指令交给编剧，并返回字段与质量摘要', async () => {
    const dispatch = vi.fn(async () => ({ ok: true, guidance: '先让嫌疑人退场。', changedFields: ['主线', '人物调度'], qualitySummary: '6/6 项就绪' }))
    const confirmWrite = vi.fn(async () => true)
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, confirmWrite, dispatch })
    const result = await tool.execute({ args: { directive: '提高第二幕张力' } })
    expect(confirmWrite).toHaveBeenCalledWith(expect.objectContaining({ title: '派遣编剧修改剧本' }))
    expect(dispatch).toHaveBeenCalledWith(SESSION, '提高第二幕张力', { timeoutMinutes: 30, timeoutMs: 30 * 60_000, explicitlySet: false })
    expect(result.content).toContain('主线、人物调度')
    expect(result.content).toContain('6/6 项就绪')
  })

  it('把父 Agent 指定的长时限透传给编剧，并拒绝越界预算', async () => {
    const dispatch = vi.fn(async () => ({ ok: true, changedFields: ['主线'] }))
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, confirmWrite: vi.fn(async () => true), dispatch })
    await tool.execute({ args: { directive: '跨文档采风后编排', timeoutMinutes: 150 } })
    expect(dispatch).toHaveBeenCalledWith(SESSION, '跨文档采风后编排', { timeoutMinutes: 150, timeoutMs: 150 * 60_000, explicitlySet: true })
    expect(tool.validateArgs({ directive: 'x', timeoutMinutes: 500 })).toContain('1~360')
  })

  it('零变更必须明确保持原样，不能宣称已同步到工作台', async () => {
    const dispatch = vi.fn(async () => ({ ok: true, guidance: '现有种子无需修改。', changedFields: [] }))
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, confirmWrite: vi.fn(async () => true), dispatch })
    const result = await tool.execute({ args: { directive: '检查当前剧本' } })
    expect(result.content).toContain('没有写入任何世界种子变更')
    expect(result.content).toContain('工作台内容保持原样')
    expect(result.content).not.toContain('完整结果与变更历史已同步')
    expect(result.details.noChanges).toBe(true)
  })

  it('确定性空交稿失败不可盲目重派，只有显式瞬时故障才可重试', async () => {
    const dispatch = vi.fn(async () => ({ ok: false, error: '正式开本交了空数组。', retryable: false }))
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, confirmWrite: vi.fn(async () => true), dispatch })
    const result = await tool.execute({ args: { directive: '建立正式剧本' } })
    expect(result.status).toBe('error')
    expect(result.error.retryable).toBe(false)
  })

  it('任务书说明不得编造参与者机器状态', () => {
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, confirmWrite: vi.fn(async () => true), dispatch: vi.fn() })
    expect(tool.brief).toContain('不要自行断言会话未挂世界、没有参与者或成员未知')
    expect(tool.schema.properties.directive.description).toContain('验收条件')
  })

  it('用户取消是成功态回执，编剧不运行', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchScriptwriterTool({ getSessionContext: () => SESSION, confirmWrite: vi.fn(async () => false), dispatch })
    const result = await tool.execute({ args: { directive: '清空全部伏笔' } })
    expect(result.details.denied).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('显式同名会话歧义必须回报候选并停止派遣', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchScriptwriterTool({
      getSessionContext: () => SESSION,
      resolveSessionContext: async () => ({ error: '找到 2 个同名会话「咒术回战」，请调用 askUser：1. 五条悟｜sessionId s1；2. 三轮霞、庵歌姬｜sessionId s2' }),
      confirmWrite: vi.fn(async () => true),
      dispatch
    })
    const result = await tool.execute({ args: { directive: '制作剧本', session: '咒术回战' } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('2 个同名会话')
    expect(result.content).toContain('sessionId s2')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
