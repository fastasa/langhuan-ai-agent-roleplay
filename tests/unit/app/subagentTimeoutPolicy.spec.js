import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SUBAGENT_TIMEOUT_MINUTES,
  resolveSubagentTimeout,
  validateSubagentTimeoutMinutes
} from '../../../src/app/subagentTimeoutPolicy.ts'
import { createXingyiDispatchResearchTool } from '../../../src/app/xingyiResearchDispatchTools.ts'

describe('subagentTimeoutPolicy', () => {
  it('缺省 30 分钟，父 Agent 可在 1~360 分钟内逐次声明时限', () => {
    expect(resolveSubagentTimeout(undefined)).toEqual({
      timeoutMinutes: DEFAULT_SUBAGENT_TIMEOUT_MINUTES,
      timeoutMs: 30 * 60_000,
      explicitlySet: false
    })
    expect(resolveSubagentTimeout(120)).toEqual({ timeoutMinutes: 120, timeoutMs: 120 * 60_000, explicitlySet: true })
    expect(validateSubagentTimeoutMinutes(360)).toBeNull()
    expect(validateSubagentTimeoutMinutes(0)).toContain('1~360')
    expect(validateSubagentTimeoutMinutes(361)).toContain('1~360')
  })

  it('星依显式派采风把逐次时限透传给目标会话执行接缝', async () => {
    const session = { sessionId: 's1', sessionTitle: '咒术回战', characterOptions: [] }
    const dispatch = vi.fn(async () => ({ ok: true, content: '已交稿' }))
    const tool = createXingyiDispatchResearchTool({ getSessionContext: () => session, dispatch })
    await tool.execute({ args: { task: '查涩谷背景', instructions: '跨文档核对', timeoutMinutes: 180 } })
    expect(dispatch).toHaveBeenCalledWith(session, expect.objectContaining({ timeoutMinutes: 180 }))
    expect(tool.validateArgs({ task: 'x', instructions: 'y', timeoutMinutes: 999 })).toContain('1~360')
  })
})
