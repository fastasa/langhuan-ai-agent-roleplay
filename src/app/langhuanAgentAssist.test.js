import { describe, expect, it, vi } from 'vitest'
import {
  buildLanghuanAgentCharacterCorePrompt,
  runLanghuanAgentCharacterCore,
  runLanghuanAgentCompilePage,
  runLanghuanAgentRelationOptimize
} from './langhuanAgentAssist.ts'

function unit(input) {
  return {
    domain: 'docLibrary',
    unitType: input.unitType || 'leaf',
    contentKind: 'markdown',
    status: 'normal',
    unitId: input.unitId,
    sourceId: input.sourceId,
    title: input.title,
    parentId: input.parentId || '',
    orderIndex: input.orderIndex || 0,
    body: input.body || '',
    compilePage: input.compilePage || { summary: input.summary || '', tags: [], relationHints: [] },
    metadata: { relationRefId: input.refId || input.sourceId }
  }
}

const units = [
  unit({ unitId: 'root', sourceId: 'root', title: '亚什基诺', unitType: 'cluster', summary: '世界总览。', refId: 'doc:root' }),
  unit({ unitId: 'river', sourceId: 'doc-river', parentId: 'root', title: '白河', summary: '贯穿北境的河流。', refId: 'doc:river' }),
  unit({ unitId: 'city', sourceId: 'doc-city', parentId: 'root', title: '北境城', summary: '依河而建的城市。', refId: 'doc:city' })
]

describe('langhuanAgentAssist', () => {
  it('calls the high-volume slot for compile page generation and validates batch markdown', async () => {
    const callAI = vi.fn(async () => [
      '# 琅嬛批量编译页',
      '',
      '<!-- target: 白河@doc:river -->',
      '',
      '## 摘要',
      '北境重要河流。',
      '',
      '## 标签',
      '河流、北境',
      '',
      '## 类型',
      'place',
      '',
      '## 关系提示',
      '无'
    ].join('\n'))

    const result = await runLanghuanAgentCompilePage({
      units,
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      agentConfig: {
        modelUsageConfigs: [
          { id: 'highVolume', label: '高量模型', presetName: '高量预设', model: 'high-volume-model', temperature: 0.6, maxTokens: 6000, thinking: 'disabled' }
        ]
      },
      callAI
    })

    expect(result.entryCount).toBe(1)
    // 批次3（2026-07-08 槽位收束）：旧高量槽退役归掌阁——预设/模型指向经迁移链保留；
    // 参数改由调用点覆写定死（旧高量默认 8192/0.8/disabled），槽级参数不再透传。
    expect(callAI).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: expect.stringContaining('编译页生成') })]),
      expect.objectContaining({
        modelUsageSlotId: 'smart',
        presetName: '高量预设',
        model: 'high-volume-model',
        maxTokens: 8192,
        temperature: 0.8,
        thinking: 'disabled',
        feature: 'agent',
        logLabel: 'langhuan-agent-compile-page'
      })
    )
  })

  it('rejects invalid compile page output before any importer writes fields', async () => {
    const callAI = vi.fn(async () => '随便写一点解释')
    await expect(runLanghuanAgentCompilePage({
      units,
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      agentConfig: {},
      callAI
    })).rejects.toThrow('批量编译页')
    // 批次2.5-①：校验失败自动带报错修一轮，两次都不过才抛
    expect(callAI).toHaveBeenCalledTimes(2)
  })

  it('repairs invalid first output: second call carries failure reason and prior output, result adopted', async () => {
    const validMarkdown = [
      '# 琅嬛批量编译页',
      '',
      '<!-- target: 白河@doc:river -->',
      '',
      '## 摘要',
      '北境重要河流。',
      '',
      '## 标签',
      '河流、北境',
      '',
      '## 类型',
      'place',
      '',
      '## 关系提示',
      '无'
    ].join('\n')
    const callAI = vi.fn()
      .mockResolvedValueOnce('这不是编译页格式')
      .mockResolvedValueOnce(validMarkdown)

    const result = await runLanghuanAgentCompilePage({
      units,
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      agentConfig: {},
      callAI
    })

    expect(result.entryCount).toBe(1)
    expect(callAI).toHaveBeenCalledTimes(2)
    const repairMessages = callAI.mock.calls[1][0]
    expect(repairMessages[0].content).toContain('校验失败原因')
    expect(repairMessages[0].content).toContain('这不是编译页格式')
    expect(callAI.mock.calls[1][1]).toMatchObject({ logLabel: 'langhuan-agent-compile-page-repair' })
  })

  it('uses relation v2 material and validates compact relation output through the mapping', async () => {
    const callAI = vi.fn(async (messages) => {
      const exportId = messages[0].content.match(/exportId:\s*([A-Za-z0-9_-]+)/)?.[1] || ''
      return [
        '# 琅嬛关系整合结果',
        `exportId: ${exportId}`,
        '```text',
        'u3 位于 u2',
        '```'
      ].join('\n')
    })

    const result = await runLanghuanAgentRelationOptimize({
      units,
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      agentConfig: {},
      callAI
    })

    expect(result.relationCount).toBe(1)
    expect(result.mapping.entries.map((entry) => entry.code)).toEqual(['u1', 'u2', 'u3'])
    expect(callAI.mock.calls[0][0][0].content).toContain('promptVersion: v2')
    expect(callAI.mock.calls[0][1]).toMatchObject({ feature: 'agent', logLabel: 'langhuan-agent-relation-optimize' })
  })

  it('builds character generation prompt with brain seed sections and parses core + seed together', async () => {
    // 2026-07-08：生成范围扩为核心+灵魂+轨迹种子，提示词必须讲清三分区且不再自相矛盾
    const prompt = buildLanghuanAgentCharacterCorePrompt('旧档案馆修复师')
    expect(prompt).toContain('## 出生日期')
    expect(prompt).toContain('## 灵魂')
    expect(prompt).toContain('## 关键经历')
    expect(prompt).toContain('灵魂不是流水账')
    expect(prompt).not.toContain('只生成角色核心 Markdown 字段')
    expect(prompt).not.toContain('只输出同样的单位标题，不新增单位')
    expect(prompt).toContain('不得输出好感度、TTS 语音、昵称')

    const callAI = vi.fn(async () => [
      '# 陈映书',
      '',
      '## 名称',
      '陈映书',
      '',
      '## 简介',
      '旧档案馆修复师。',
      '',
      '## 说话风格',
      '轻声、谨慎，但会在关键处变得尖锐。',
      '',
      '## 出生日期',
      '',
      '1998-04-02',
      '',
      '## 灵魂',
      '',
      '### 古籍修复的手艺直觉',
      '判断纸张年代时先看纤维走向再闻气味，这是师父传下的顺序，她深信不疑。',
      '',
      '## 关键经历',
      '',
      '### 2016-09-01 进入档案馆当学徒',
      '高中毕业后被师父收留，从扫地和调浆糊做起。'
    ].join('\n'))

    const result = await runLanghuanAgentCharacterCore({
      brief: '旧档案馆修复师',
      agentConfig: {},
      callAI
    })

    expect(result.changes.name).toBe('陈映书')
    expect(result.seed.birthDate).toBe('1998-04-02')
    expect(result.seed.soulNodes).toHaveLength(1)
    expect(result.seed.experiences).toEqual([
      expect.objectContaining({ date: '2016-09-01', title: '进入档案馆当学徒' })
    ])
    expect(callAI.mock.calls[0][1]).toMatchObject({ feature: 'agent', logLabel: 'langhuan-agent-character-core' })
  })

  it('rejects character output missing seed sections and repairs with the failure reason', async () => {
    const coreOnly = ['# 陈映书', '', '## 名称', '陈映书'].join('\n')
    const callAI = vi.fn(async () => coreOnly)

    await expect(runLanghuanAgentCharacterCore({
      brief: '旧档案馆修复师',
      agentConfig: {},
      callAI
    })).rejects.toThrow('出生日期')
    // 校验失败走修正重跑链：第二次带失败原因
    expect(callAI).toHaveBeenCalledTimes(2)
    expect(callAI.mock.calls[1][0][0].content).toContain('校验失败原因')
  })
})
