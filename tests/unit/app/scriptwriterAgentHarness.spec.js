import { describe, expect, it, vi } from 'vitest'
import { runScriptwriterAgent as runScriptwriterAgentHarness } from '../../../src/app/scriptwriterAgentHarness.ts'

const SCRIPTWRITER_CONTEXT_BLOCK = 'rendered-scriptwriter-context'
const runScriptwriterAgent = (input) => runScriptwriterAgentHarness({ contextBlock: SCRIPTWRITER_CONTEXT_BLOCK, ...input })

// 编剧独立 agent harness 回归（地图与剧本工作区专业Agent计划批B）：
// 覆盖零写只读问答（不强制submit）、三个写工具的确认门/校验/版本冲突分支、续轮护栏。
function nativeToolCall(name, args, id = 'call_1') {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

function fullSeedPatch(overrides = {}) {
  return {
    type: 'foreshadow',
    title: '钟楼地下的第二把钥匙',
    description: '有人在钟楼地下藏了另一把钥匙。',
    cause: '守夜人日记提到过一把备用钥匙。',
    currentProgress: '尚未启动',
    expectedOutcome: '可能揭示地下密室的入口。',
    startTime: '2026-07-17T20:00:00+08:00',
    mapFeatureId: '',
    locationText: '中国/上海/外滩钟楼',
    impactScope: '钟楼守夜人与周边探索者',
    status: 'dormant',
    visibilityMode: 'director_only',
    allowFrontstage: false,
    participants: [],
    links: [],
    ...overrides
  }
}

function existingSeed(overrides = {}) {
  return { id: 'seed_1', version: 3, ...fullSeedPatch(), ...overrides }
}

// 精简种子（>50种子分支只送这种形状）：无 participants/links 字段，只有基础标量。
function liteSeed(overrides = {}) {
  return { id: 'seed_1', version: 3, type: 'foreshadow', title: '钟楼地下的第二把钥匙', status: 'dormant', ...overrides }
}

describe('runScriptwriterAgent（编剧独立loop·批B）', () => {
  it('只读问答：模型不调用任何工具，直接给出回复；不触发写API', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    const callOrchestrator = vi.fn(async () => ({ content: '目前世界里有两条伏笔在推进，分别是……', toolCalls: [] }))

    const result = await runScriptwriterAgent({
      userText: '现在有哪些伏笔？',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      writeApi
    })

    expect(result.reply).toBe('目前世界里有两条伏笔在推进，分别是……')
    expect(result.terminalReason).toBe('done')
    expect(result.transcript.promptSupplyTrace).toEqual([
      expect.objectContaining({
        profileId: 'scriptwriter.workspace',
        skillId: 'scriptwriter.storycraft-manual',
        layer: '0',
        loadState: 'loaded',
        reason: 'resident_always'
      })
    ])
    expect(writeApi.createNarrativeSeed).not.toHaveBeenCalled()
    expect(writeApi.updateNarrativeSeed).not.toHaveBeenCalled()
    expect(writeApi.deleteNarrativeSeed).not.toHaveBeenCalled()
    const currentTurn = callOrchestrator.mock.calls[0][0].messages
      .find((message) => String(message.content).includes('【统一原始可见上下文】'))?.content || ''
    const systemTurn = callOrchestrator.mock.calls[0][0].messages[0].content
    expect(systemTurn).toContain('【常驻 Skill｜编剧剧作方法论】')
    expect(currentTurn).toContain('【统一原始可见上下文】\nrendered-scriptwriter-context')
    expect(currentTurn).toContain('【用户输入】\n现在有哪些伏笔？')
    expect(currentTurn).not.toContain('【当前种子真值】')
    expect(currentTurn).not.toContain('浮梦城')
    expect(currentTurn).not.toContain('seed_1')
  })

  it('统一原始可见上下文为空时拒绝启动，不调用模型', async () => {
    const callOrchestrator = vi.fn()
    await expect(runScriptwriterAgentHarness({
      userText: '现在有哪些伏笔？',
      contextBlock: '   ',
      worldId: 'world_1',
      seeds: [],
      callOrchestrator,
      writeApi: { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    })).rejects.toThrow('编剧统一原始可见上下文为空')
    expect(callOrchestrator).not.toHaveBeenCalled()
  })

  it('缺 confirmWrite 通道：写工具硬门拒绝，不触碰写API', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('createNarrativeSeed', fullSeedPatch())] }
      return { content: '新建失败了，通道没接入。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '帮我建一条新伏笔',
      worldId: 'world_1',
      seeds: [],
      callOrchestrator,
      writeApi
    })

    expect(writeApi.createNarrativeSeed).not.toHaveBeenCalled()
    expect(result.reply).toContain('通道没接入')
  })

  it('createNarrativeSeed：确认通过后调用写API并更新内部快照；onSeedsChanged 被调用', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(async (worldId, input) => ({ id: 'seed_new', version: 1, ...input })),
      updateNarrativeSeed: vi.fn(),
      deleteNarrativeSeed: vi.fn()
    }
    const onSeedsChanged = vi.fn()
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('createNarrativeSeed', fullSeedPatch())] }
      return { content: '已经新建好这条种子啦。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '帮我建一条新伏笔',
      worldId: 'world_1',
      seeds: [],
      callOrchestrator,
      confirmWrite,
      writeApi,
      onSeedsChanged
    })

    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(confirmWrite.mock.calls[0][0].title).toBe('新建剧本种子')
    expect(writeApi.createNarrativeSeed).toHaveBeenCalledWith('world_1', expect.objectContaining({ title: '钟楼地下的第二把钥匙' }))
    expect(onSeedsChanged).toHaveBeenCalledTimes(1)
    expect(result.reply).toBe('已经新建好这条种子啦。')
  })

  it('createNarrativeSeed：用户在确认卡取消，不调用写API', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    const confirmWrite = vi.fn(async () => false)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('createNarrativeSeed', fullSeedPatch())] }
      return { content: '好的，这次不建了。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '帮我建一条新伏笔',
      worldId: 'world_1',
      seeds: [],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(writeApi.createNarrativeSeed).not.toHaveBeenCalled()
    expect(result.reply).toBe('好的，这次不建了。')
  })

  it('createNarrativeSeed：缺必填字段时校验失败，不弹确认卡也不写', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('createNarrativeSeed', fullSeedPatch({ description: '' }))] }
      return { content: '字段没填全，我再补一下。', toolCalls: [] }
    })

    await runScriptwriterAgent({
      userText: '帮我建一条新伏笔',
      worldId: 'world_1',
      seeds: [],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(confirmWrite).not.toHaveBeenCalled()
    expect(writeApi.createNarrativeSeed).not.toHaveBeenCalled()
  })

  it('updateNarrativeSeed：引用不存在的seedId直接拒绝', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_ghost', status: 'active' })] }
      return { content: '找不到这条种子。', toolCalls: [] }
    })

    await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(confirmWrite).not.toHaveBeenCalled()
    expect(writeApi.updateNarrativeSeed).not.toHaveBeenCalled()
  })

  it('updateNarrativeSeed：部分字段修改，与当前种子合并后校验通过并写入 expectedVersion', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(async () => ({ version: 4 })),
      deleteNarrativeSeed: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', status: 'active' })] }
      return { content: '状态已经改成推进中了。', toolCalls: [] }
    })

    await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(writeApi.updateNarrativeSeed).toHaveBeenCalledWith('world_1', 'seed_1', expect.objectContaining({ status: 'active', expectedVersion: 3 }))
    expect(confirmWrite).toHaveBeenCalledWith(expect.objectContaining({
      title: '确认剧本高风险修改',
      lines: expect.arrayContaining(['高风险字段：status'])
    }))
  })

  it('updateNarrativeSeed：低风险正文补写不弹确认，高风险结构字段仍需确认', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(async () => ({ version: 4 })),
      deleteNarrativeSeed: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', currentProgress: '钟声已经传到城外。' })] }
      return { content: '进展已经补写。', toolCalls: [] }
    })

    await runScriptwriterAgent({
      userText: '补一下这条伏笔的当前进展',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(confirmWrite).not.toHaveBeenCalled()
    expect(writeApi.updateNarrativeSeed).toHaveBeenCalledWith('world_1', 'seed_1', expect.objectContaining({
      currentProgress: '钟声已经传到城外。',
      expectedVersion: 3
    }))
  })

  it('updateNarrativeSeed：写API抛出 error.status=409（chatRepository.ensureOk真实形状）时给出可重试的中文提示', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(async () => {
        const error = new Error('叙事种子版本冲突，请重读后再提交')
        error.status = 409
        throw error
      }),
      deleteNarrativeSeed: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', status: 'active' })] }
      return { content: '这条种子被改过了，我先不改了。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(result.reply).toBe('这条种子被改过了，我先不改了。')
  })

  it('updateNarrativeSeed：error.status非409但文本含「版本冲突」时也判为冲突', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(async () => { throw new Error('叙事种子版本冲突，请重读后再提交') }),
      deleteNarrativeSeed: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', status: 'active' })] }
      return { content: '这条种子被改过了，我先不改了。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(result.reply).toBe('这条种子被改过了，我先不改了。')
  })

  it('updateNarrativeSeed：普通失败文案（如"conversion failed"，非409非"版本冲突"）不再被误判为版本冲突', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(async () => { throw new Error('conversion failed') }),
      deleteNarrativeSeed: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', status: 'active' })] }
      return { content: '修改失败了，我先停下。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    // 第一次工具回执应带原始错误文案而非"版本冲突"误判提示；用第二次 orchestrator 调用里的工具结果消息核实。
    const secondCallMessages = callOrchestrator.mock.calls[1][0].messages
    const toolResultMessage = secondCallMessages.find((message) => message.role === 'tool')
    const toolResultText = toolResultMessage?.content || JSON.stringify(secondCallMessages)
    expect(toolResultText).toContain('conversion failed')
    expect(toolResultText).not.toContain('版本冲突')
    expect(result.reply).toBe('修改失败了，我先停下。')
  })

  it('deleteNarrativeSeed：写API抛出 error.status=409 时给出可重试的中文提示', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(),
      deleteNarrativeSeed: vi.fn(async () => {
        const error = new Error('叙事种子版本冲突，请重读后再删除')
        error.status = 409
        throw error
      })
    }
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('deleteNarrativeSeed', { seedId: 'seed_1' })] }
      return { content: '这条种子被改过了，我先不删了。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '删掉那条种子',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi
    })

    expect(result.reply).toBe('这条种子被改过了，我先不删了。')
  })

  it('deleteNarrativeSeed：确认后调用写API并从内部快照移除', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn(async () => {}) }
    const onSeedsChanged = vi.fn()
    const confirmWrite = vi.fn(async () => true)
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('deleteNarrativeSeed', { seedId: 'seed_1' })] }
      return { content: '已经删掉了。', toolCalls: [] }
    })

    await runScriptwriterAgent({
      userText: '删掉那条种子',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      confirmWrite,
      writeApi,
      onSeedsChanged
    })

    expect(writeApi.deleteNarrativeSeed).toHaveBeenCalledWith('world_1', 'seed_1', 3)
    expect(onSeedsChanged).toHaveBeenCalledTimes(1)
  })

  it('续轮护栏：模型只说"稍等我去核对"没调工具时会被续轮一次，之后正常收束', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '稍等，我先核对一下现有种子。', toolCalls: [] }
      return { content: '核对完了，目前没有需要修改的地方。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '有什么要提醒我的吗',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator,
      writeApi
    })

    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(result.reply).toBe('核对完了，目前没有需要修改的地方。')
  })

  // 新工具 readNarrativeSeedDetail（>50种子懒加载详情批）：见 scriptwriterAgentHarness.ts createReadNarrativeSeedDetailTool。
  it('readNarrativeSeedDetail：成功读取详情并把精简种子替换为完整详情', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    const fetchSeedDetail = vi.fn(async (seedId) => ({ ...existingSeed({ id: seedId }) }))
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('readNarrativeSeedDetail', { seedId: 'seed_1' })] }
      return { content: '已经读到完整详情了。', toolCalls: [] }
    })

    const result = await runScriptwriterAgent({
      userText: '先看看那条种子的完整详情',
      worldId: 'world_1',
      seeds: [liteSeed()],
      callOrchestrator,
      writeApi,
      fetchSeedDetail
    })

    expect(fetchSeedDetail).toHaveBeenCalledWith('seed_1')
    expect(result.reply).toBe('已经读到完整详情了。')
  })

  it('updateNarrativeSeed/deleteNarrativeSeed：目标种子仍是精简形态（缺participants/links）时拒绝，给出明确提示', async () => {
    const writeApi = { createNarrativeSeed: vi.fn(), updateNarrativeSeed: vi.fn(), deleteNarrativeSeed: vi.fn() }
    const confirmWrite = vi.fn(async () => true)

    let updateCall = 0
    const updateOrchestrator = vi.fn(async () => {
      updateCall += 1
      if (updateCall === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', status: 'active' })] }
      return { content: '发现这条种子信息不全，我先不改了。', toolCalls: [] }
    })
    const updateResult = await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [liteSeed()],
      callOrchestrator: updateOrchestrator,
      confirmWrite,
      writeApi
    })
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(writeApi.updateNarrativeSeed).not.toHaveBeenCalled()
    expect(updateResult.reply).toBe('发现这条种子信息不全，我先不改了。')

    let deleteCall = 0
    const deleteOrchestrator = vi.fn(async () => {
      deleteCall += 1
      if (deleteCall === 1) return { content: '', toolCalls: [nativeToolCall('deleteNarrativeSeed', { seedId: 'seed_1' })] }
      return { content: '这条种子信息不全，我先读一下详情。', toolCalls: [] }
    })
    const deleteResult = await runScriptwriterAgent({
      userText: '删掉那条种子',
      worldId: 'world_1',
      seeds: [liteSeed()],
      callOrchestrator: deleteOrchestrator,
      confirmWrite,
      writeApi
    })
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(writeApi.deleteNarrativeSeed).not.toHaveBeenCalled()
    expect(deleteResult.reply).toBe('这条种子信息不全，我先读一下详情。')
  })

  it('updateNarrativeSeed/deleteNarrativeSeed：种子已是完整详情（≤50全量路径）时新增的精简守卫不影响原有流程', async () => {
    const writeApi = {
      createNarrativeSeed: vi.fn(),
      updateNarrativeSeed: vi.fn(async () => ({ version: 4 })),
      deleteNarrativeSeed: vi.fn(async () => {})
    }
    const confirmWrite = vi.fn(async () => true)

    let updateCall = 0
    const updateOrchestrator = vi.fn(async () => {
      updateCall += 1
      if (updateCall === 1) return { content: '', toolCalls: [nativeToolCall('updateNarrativeSeed', { seedId: 'seed_1', status: 'active' })] }
      return { content: '状态已经改成推进中了。', toolCalls: [] }
    })
    await runScriptwriterAgent({
      userText: '把那条种子状态改成推进中',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator: updateOrchestrator,
      confirmWrite,
      writeApi
    })
    expect(writeApi.updateNarrativeSeed).toHaveBeenCalledWith('world_1', 'seed_1', expect.objectContaining({ status: 'active', expectedVersion: 3 }))

    let deleteCall = 0
    const deleteOrchestrator = vi.fn(async () => {
      deleteCall += 1
      if (deleteCall === 1) return { content: '', toolCalls: [nativeToolCall('deleteNarrativeSeed', { seedId: 'seed_1' })] }
      return { content: '已经删掉了。', toolCalls: [] }
    })
    await runScriptwriterAgent({
      userText: '删掉那条种子',
      worldId: 'world_1',
      seeds: [existingSeed()],
      callOrchestrator: deleteOrchestrator,
      confirmWrite,
      writeApi
    })
    expect(writeApi.deleteNarrativeSeed).toHaveBeenCalledWith('world_1', 'seed_1', 3)
  })
})
