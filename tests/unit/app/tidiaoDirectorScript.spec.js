import { describe, expect, it, vi } from 'vitest'
import { buildGroupDirectorMessages } from '../../../src/app/groupDirectorPass.ts'
import { createConsultScriptTool, createFinishRoundTool } from '../../../src/app/tidiaoGlobalTools.ts'

describe('提调编剧接缝（叙事种子合并计划批次3）', () => {
  it('纲领只教异步派发与三栏收件箱，不再教 deviation/nextBeat 快路径', () => {
    const prompt = buildGroupDirectorMessages({ userText: '继续', candidates: [], forcedCharacterIds: [], excludedCharacterIds: [] }, { decisionTools: true, scriptTool: true })[0].content
    expect(prompt).toContain('0.5) 异步派编剧')
    expect(prompt).toContain('不得原地等待或重复调用')
    expect(prompt).toContain('已确认事实、候选判断和建议动作')
    expect(prompt).toContain('createNarrativeSeed / updateNarrativeSeed')
    expect(prompt).not.toContain('deviation 偏差档')
    expect(prompt).not.toContain('预写「下一拍」')
  })

  it('consultScript 立即返回派发确认，只传 brief/asks，不暴露旧整本字段', async () => {
    const dispatched = []
    const ctx = {
      holder: { consulted: false },
      dispatchScriptwriter: (input) => {
        dispatched.push(input)
        return { callId: 'call_async_1' }
      }
    }
    const tool = createConsultScriptTool(ctx)
    expect(tool.schema.properties).not.toHaveProperty('deviation')
    expect(tool.schema.properties).not.toHaveProperty('directive')
    const result = await tool.execute({ args: { brief: '用户已经进入钟楼', asks: '判断旧钟伏笔是否触发' } })
    expect(result.content).toContain('已异步派发')
    expect(result.content).toContain('call_async_1')
    expect(result.content).toContain('不要等待')
    expect(result.acted).toBe(false)
    expect(ctx.holder.consulted).toBe(true)
    expect(dispatched).toEqual([{ brief: '用户已经进入钟楼', asks: '判断旧钟伏笔是否触发' }])
  })

  it('派发异常人话报错，但发起过仍算已咨询，不锁死 finishRound', async () => {
    const ctx = {
      holder: { consulted: false },
      dispatchScriptwriter: () => { throw new Error('后台通道不可用') }
    }
    const result = await createConsultScriptTool(ctx).execute({ args: { brief: '开场' } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('编剧派发失败')
    expect(ctx.holder.consulted).toBe(true)
  })

  it('finishRound 只要求本轮派过一次；不等待异步回报', async () => {
    const state = { scenarioCode: 'chat', scenarioBody: '', cast: [{ characterId: 'c1', direction: '接话' }], finishSituation: '' }
    const consulted = { value: false }
    const tool = createFinishRoundTool({
      candidateSet: new Set(['c1']), candidateNameById: new Map([['c1', '星依']]), excludedSet: new Set(), state,
      hasConsultedScript: () => consulted.value
    })
    const first = await tool.execute({ args: { situation: '闲聊' } })
    expect(first.status).toBe('error')
    expect(first.content).toContain('还没派编剧')
    consulted.value = true
    const second = await tool.execute({ args: { situation: '闲聊' } })
    expect(second.status).not.toBe('error')
  })
})
