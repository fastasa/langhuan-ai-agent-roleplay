/**
 * @vitest-environment node
 * 星依「读正式角色大脑」工具（取料闭环计划批次2）回归锁：
 * 核心+灵魂+轨迹整合渲染 / sections 选段 / 灵魂跳过 group 文件夹 / 轨迹跳过结构枝留关键经历 /
 * 轨迹超额只给最近 N / 角色名解析(同名歧义/未命中) / provider 缺失 / 缺 character 校验。
 */
import { describe, it, expect } from 'vitest'
import { createReadCharacterBrainTool } from '../../../src/app/xingyiCharacterBrainTools'

const RECORD = {
  id: 'c1',
  name: '张元英',
  personality: '外冷内热',
  appearance: '月白衫',
  brainCognitionNodes: [
    { id: 'grp', title: '认知组', kind: 'group' },
    { id: 's1', title: '重视承诺', kind: 'private', content: '答应的事一定做到' },
    { id: 'r1', title: '对沈青梧', kind: 'relation', summary: '视为挚友' }
  ],
  brainTraceNodes: [
    { id: 'y', title: '2016年', kind: 'year', systemRole: 'yearBranch', pointDate: '2016-01-01' },
    { id: 'e1', title: '入门听雨阁', kind: 'day', systemRole: 'eventLeaf', pointDate: '2016-05-01', note: '拜入听雨阁门下', ageLabel: '15岁' }
  ]
}

function providerWith(record = RECORD, characters = [{ id: 'c1', name: '张元英' }]) {
  return {
    provider: {
      listCharacters: () => characters,
      readCharacter: (id) => (id === (record && record.id) ? record : null)
    }
  }
}

describe('xingyiCharacterBrainTools · readCharacterBrain', () => {
  it('按角色名读整合核心+灵魂+轨迹', async () => {
    const tool = createReadCharacterBrainTool(providerWith())
    const result = await tool.execute({ args: { character: '张元英' } })
    expect(result.details).toMatchObject({ characterId: 'c1' })
    // 核心
    expect(result.content).toContain('张元英')
    expect(result.content).toContain('外冷内热')
    // 灵魂：跳过 group 文件夹（认知组不出现），保留 private/relation
    expect(result.content).toContain('灵魂节点·稳定认知（2 个）')
    expect(result.content).toContain('重视承诺')
    expect(result.content).toContain('答应的事一定做到')
    expect(result.content).toContain('视为挚友')
    expect(result.content).not.toContain('认知组')
    // 轨迹：关键经历(eventLeaf/有 note)出，纯结构枝(yearBranch·无 note)不出
    expect(result.content).toContain('入门听雨阁')
    expect(result.content).toContain('拜入听雨阁门下')
    expect(result.content).toContain('2016-05-01')
    expect(result.content).not.toContain('2016年')
  })

  it('sections 选段只读 soul（省 token）', async () => {
    const tool = createReadCharacterBrainTool(providerWith())
    const result = await tool.execute({ args: { character: '张元英', sections: ['soul'] } })
    expect(result.content).toContain('灵魂节点·稳定认知')
    expect(result.content).not.toContain('核心资料')
    expect(result.content).not.toContain('轨迹·关键经历')
  })

  it('轨迹经历超额只给最近 40 条并提示', async () => {
    const many = Array.from({ length: 45 }, (_, index) => ({
      id: `e${index}`, title: `事件${index}`, kind: 'day', systemRole: 'eventLeaf',
      pointDate: '2016-01-01', note: `经历${index}`
    }))
    const tool = createReadCharacterBrainTool(providerWith({ ...RECORD, brainTraceNodes: many }))
    const result = await tool.execute({ args: { character: '张元英', sections: ['trace'] } })
    expect(result.content).toContain('只列最近 40 条')
    expect(result.content).toContain('经历较多')
  })

  it('同名角色报错给 id 候选', async () => {
    const tool = createReadCharacterBrainTool(providerWith(RECORD, [
      { id: 'c1', name: '张元英' },
      { id: 'c2', name: '张元英' }
    ]))
    const result = await tool.execute({ args: { character: '张元英' } })
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('同名角色')
    expect(result.content).toContain('c1')
    expect(result.content).toContain('c2')
  })

  it('角色未命中给候选清单', async () => {
    const tool = createReadCharacterBrainTool(providerWith())
    const result = await tool.execute({ args: { character: '不存在的人' } })
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('没有找到')
    expect(result.content).toContain('张元英')
  })

  it('没有任何角色时报 provider 缺失', async () => {
    const tool = createReadCharacterBrainTool(providerWith(RECORD, []))
    const result = await tool.execute({ args: { character: '张元英' } })
    expect(result.details).toMatchObject({ providerMissing: true })
  })

  it('缺 character 被 validateArgs 拦下', () => {
    const tool = createReadCharacterBrainTool(providerWith())
    expect(tool.validateArgs({})).toContain('缺少 character')
    expect(tool.validateArgs({ character: '张元英' })).toBeNull()
  })
})
