import { describe, expect, it } from 'vitest'
import {
  TEMPORARY_ENTITY_FIELDS,
  buildTemporaryEntityContext,
  buildTemporaryEntityProfilePrompt,
  mergeTemporaryEntityMarkdown,
  parseTemporaryEntityOrganizeCommand
} from '../../../src/app/temporaryEntityCommand.ts'

describe('temporaryEntityCommand', () => {
  it('解析五类整理命令', () => {
    expect(parseTemporaryEntityOrganizeCommand('/整理角色 杂货商')).toEqual(expect.objectContaining({
      kind: 'character',
      kindLabel: '角色',
      targetName: '杂货商'
    }))
    expect(parseTemporaryEntityOrganizeCommand('/整理建筑 铜叶子旅店')).toEqual(expect.objectContaining({ kind: 'building' }))
    expect(parseTemporaryEntityOrganizeCommand('/整理地理区域 旧港区')).toEqual(expect.objectContaining({ kind: 'region' }))
    expect(parseTemporaryEntityOrganizeCommand('/整理势力 银灯会')).toEqual(expect.objectContaining({ kind: 'faction' }))
    expect(parseTemporaryEntityOrganizeCommand('/整理物品 旧铜币')).toEqual(expect.objectContaining({ kind: 'item' }))
    expect(parseTemporaryEntityOrganizeCommand('/整理角色')).toBeNull()
  })

  it('复用上下文证据并排除已使用来源', () => {
    const command = parseTemporaryEntityOrganizeCommand('/整理建筑 铜叶子旅店')
    const first = buildTemporaryEntityContext({
      command,
      messages: [
        { id: 1, role: 'user', messageKind: 'chat', content: '铜叶子旅店在旧巷尽头。', name: '我' },
        { id: 2, role: 'assistant', messageKind: 'narration_debug', content: '调试不进入。' }
      ]
    })
    const second = buildTemporaryEntityContext({
      command,
      messages: [
        { id: 1, role: 'user', messageKind: 'chat', content: '铜叶子旅店在旧巷尽头。', name: '我' }
      ],
      existingSourceLedger: first.sourceLedger
    })

    expect(first.newMaterials).toHaveLength(1)
    expect(first.sanitizedContextText).toContain('铜叶子旅店在旧巷尽头')
    expect(first.sanitizedContextText).not.toContain('调试不进入')
    expect(second.newMaterials).toHaveLength(0)
  })

  it('按类型生成不同字段并合并更新 Markdown', () => {
    const command = parseTemporaryEntityOrganizeCommand('/整理物品 旧铜币')
    const trace = buildTemporaryEntityProfilePrompt({
      command,
      sanitizedContextText: 'S1 | 消息 1\n旧铜币会被杂货商收走。',
      mode: 'create'
    })
    expect(trace.finalPrompt).toContain('会话临时物品')
    expect(trace.finalPrompt).toContain('## 物品类型')
    expect(trace.finalPrompt).toContain('## 限制与代价')

    const characterCommand = parseTemporaryEntityOrganizeCommand('/整理角色 杂货商')
    const characterTrace = buildTemporaryEntityProfilePrompt({
      command: characterCommand,
      sanitizedContextText: 'S1 | 消息 1\n杂货商递出一枚旧铜币。',
      mode: 'create'
    })
    expect(characterTrace.finalPrompt).toContain('名称：只填写一个')
    expect(characterTrace.finalPrompt).toContain('说话风格：必须特点鲜明')
    expect(characterTrace.finalPrompt).toContain('虚拟人物：不要输出语言示例')

    expect(mergeTemporaryEntityMarkdown({
      kind: 'item',
      mode: 'update',
      existingMarkdown: '## 名称\n\n### v1 | 来源 S1\n旧铜币',
      newMarkdown: '## 限制与代价\n\n### v1 | 来源 S2\n只能用一次。'
    })).toContain('## 限制与代价')
  })

  // 批次4（2026-07-08 用户拍板「让位」）：状态类字段移出 Markdown 模板、归状态系统状态栏。
  it('状态类字段已从字段模板让位给状态栏', () => {
    expect(TEMPORARY_ENTITY_FIELDS.character).not.toContain('当前处境')
    expect(TEMPORARY_ENTITY_FIELDS.building).not.toContain('当前状态')
    expect(TEMPORARY_ENTITY_FIELDS.region).not.toContain('当前局势')
    expect(TEMPORARY_ENTITY_FIELDS.faction).not.toContain('当前状态')
    expect(TEMPORARY_ENTITY_FIELDS.item).not.toContain('当前状态')
    expect(TEMPORARY_ENTITY_FIELDS.item).not.toContain('持有者或位置')
    // 静态资料字段保留
    expect(TEMPORARY_ENTITY_FIELDS.character).toContain('外貌与可见特征')
    // event_note 不挂状态栏，字段模板原样
    expect(TEMPORARY_ENTITY_FIELDS.event_note).toContain('当前结果')
  })

  it('合并更新时存量资料里已让位的旧节原样保留在末尾（不静默丢内容）', () => {
    const merged = mergeTemporaryEntityMarkdown({
      kind: 'item',
      mode: 'update',
      existingMarkdown: '## 名称\n\n### v1 | 来源 S1\n旧铜币\n\n## 当前状态\n\n### v1 | 来源 S1\n在杂货商手里。',
      newMarkdown: '## 来历\n\n### v1 | 来源 S2\n先帝年间铸造。'
    })
    expect(merged).toContain('## 来历')
    expect(merged).toContain('## 当前状态')
    expect(merged).toContain('在杂货商手里。')
    // 旧节排在模板字段之后
    expect(merged.indexOf('## 当前状态')).toBeGreaterThan(merged.indexOf('## 来历'))
  })
})
