import { describe, expect, it } from 'vitest'
import {
  buildImprovisedCharacterExtractionPrompt,
  buildImprovisedCharacterContext,
  normalizeImprovisedCharacterExtractionOutput,
  parseImprovisedCharacterCreateCommand,
  parseLegacyImprovisedCharacterCreateCommand,
  sanitizeImprovisedCharacterContextText
} from '../../../src/app/improvisedCharacterCommand.ts'
import { parseCharacterCoreMarkdown } from '../../../src/app/characterCoreMarkdownTransfer.ts'

describe('improvisedCharacterCommand', () => {
  it('parses /创建角色 commands with a target name', () => {
    expect(parseImprovisedCharacterCreateCommand('/创建角色 杂货商')).toEqual({
      type: 'improvised_character_create',
      targetName: '杂货商',
      rawText: '/创建角色 杂货商'
    })
    expect(parseImprovisedCharacterCreateCommand('/创建角色')).toBeNull()
    expect(parseImprovisedCharacterCreateCommand(' /创建角色   流浪汉  ')).toEqual(expect.objectContaining({
      targetName: '流浪汉'
    }))
    expect(parseImprovisedCharacterCreateCommand('/create 杂货商')).toBeNull()
    expect(parseImprovisedCharacterCreateCommand('你好 /创建角色 杂货商')).toBeNull()
  })

  it('recognizes legacy /create only for migration hints', () => {
    expect(parseLegacyImprovisedCharacterCreateCommand('/create 杂货商')).toEqual({
      type: 'improvised_character_create',
      targetName: '杂货商',
      rawText: '/create 杂货商'
    })
    expect(parseLegacyImprovisedCharacterCreateCommand('/create')).toEqual(expect.objectContaining({
      targetName: ''
    }))
    expect(parseLegacyImprovisedCharacterCreateCommand(' /Create   流浪汉  ')).toEqual(expect.objectContaining({
      targetName: '流浪汉'
    }))
    expect(parseLegacyImprovisedCharacterCreateCommand('你好 /create 杂货商')).toBeNull()
  })

  it('sanitizes think blocks and decorative symbols without rewriting facts', () => {
    expect(sanitizeImprovisedCharacterContextText('杂货商<think>秘密推理</think> *递来* $硬币$【旧巷】')).toBe('杂货商 递来 硬币旧巷')
  })

  it('collects visible matched messages, neighbors, and narration only', () => {
    const command = parseImprovisedCharacterCreateCommand('/创建角色 杂货商')
    const result = buildImprovisedCharacterContext({
      command,
      messages: [
        { id: 1, role: 'user', content: '我走进旧巷。', messageKind: 'chat', name: '我' },
        { id: 2, role: 'assistant', content: '杂货商抬头看了我一眼。<think>不要读</think>', messageKind: 'chat', memberName: '陈星依' },
        { id: 3, role: 'assistant', content: '货架后传来铃声。', messageKind: 'narration', name: '旁白' },
        { id: 4, role: 'assistant', content: '杂货商的隐藏旧资料。', messageKind: 'chat', autoWriteHidden: true },
        { id: 5, role: 'assistant', content: '旁白快判：杂货商会导致地点变化。', messageKind: 'narration_debug', name: '旁白调试' },
        { id: 6, role: 'assistant', content: '他把柜台上的灰尘擦开。', messageKind: 'chat', memberName: '陈星依' }
      ]
    })

    expect(result.matchedMessageIds).toEqual([2])
    expect(result.includedMessageIds).toEqual([1, 2, 3])
    expect(result.sanitizedContextText).toContain('杂货商抬头看了我一眼。')
    expect(result.sanitizedContextText).toContain('货架后传来铃声。')
    expect(result.sanitizedContextText).not.toContain('隐藏旧资料')
    expect(result.sanitizedContextText).not.toContain('旁白快判')
    expect(result.sanitizedContextText).not.toContain('不要读')
  })

  it('builds an extraction prompt with the improvised character field boundary', () => {
    const trace = buildImprovisedCharacterExtractionPrompt({
      targetName: '杂货商',
      sanitizedContextText: '杂货商递出一枚旧铜币。'
    })

    expect(trace.finalPrompt).toContain('只输出 Markdown')
    expect(trace.finalPrompt).toContain('名称：只填写一个')
    expect(trace.finalPrompt).toContain('背景：写势力背景、家族背景、阶层背景、文化教育背景')
    expect(trace.finalPrompt).toContain('性格：必须有优点、缺点、欲望、弱点、矛盾')
    expect(trace.finalPrompt).toContain('## 名称')
    expect(trace.finalPrompt).toContain('## 背景')
    expect(trace.finalPrompt).not.toContain('## 好感度')
    expect(trace.finalPrompt).not.toContain('## TTS 语音')
    expect(trace.finalPrompt).not.toContain('## 昵称')
    expect(trace.promptBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '即兴角色提取 · 清洗后上下文' })
    ]))
  })

  it('normalizes extracted markdown through character core fields without disallowed fields', () => {
    const output = normalizeImprovisedCharacterExtractionOutput([
      '## 名称',
      '杂货商',
      '',
      '## 图标',
      '🪙',
      '',
      '## 性别',
      '',
      '',
      '## 年龄',
      '',
      '',
      '## 简介',
      '旧巷里递出铜币的人。',
      '',
      '## 好感度',
      '99',
      '',
      '## TTS 语音',
      'secret',
      '',
      '## 昵称',
      '- 老板'
    ].join('\n'), '杂货商', parseCharacterCoreMarkdown)

    expect(output.characterCore).toEqual(expect.objectContaining({
      name: '杂货商',
      emoji: '🪙',
      desc: '旧巷里递出铜币的人。'
    }))
    expect(output.characterCore).not.toHaveProperty('age')
    expect(output.characterCore).not.toHaveProperty('affection')
    expect(output.characterCore).not.toHaveProperty('ttsVoice')
    expect(output.characterCore).not.toHaveProperty('nicknames')
  })
})
