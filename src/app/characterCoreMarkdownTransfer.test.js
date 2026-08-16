import { describe, expect, it } from 'vitest'
import {
  buildCharacterCoreMarkdown,
  buildCharacterCoreMarkdownPrompt,
  getCharacterCoreMarkdownFilename,
  parseCharacterCoreMarkdown
} from './characterCoreMarkdownTransfer'

describe('characterCoreMarkdownTransfer', () => {
  it('exports core fields without avatar, group, or preset config', () => {
    const markdown = buildCharacterCoreMarkdown({
      name: '惊稚',
      emoji: '✦',
      gender: '女',
      age: 22,
      desc: '角色简介',
      brainDocuments: {
        'brain:goal_value': '守住真实关系，不为安全感牺牲判断。'
      },
      appearance: '外貌文本',
      speakingStyle: '短句',
      personality: '敏锐',
      outfit: '黑裙',
      hobbies: '读书',
      abilities: '观察',
      experience: '旧事',
      worldview: '规则',
      background: '背景',
      affection: 61,
      ttsVoice: 'voice-a',
      nicknames: ['阿稚'],
      currentActivities: ['调查'],
      locations: ['书房'],
      schedule: { mon: [{ startTime: '09:00', activity: '阅读' }] },
      yearlySchedule: [{ startMonth: 1, endMonth: 3, activity: '筹备' }],
      relationships: { char_a: { nickname: '朋友', affection: 55 } },
      avatar: 'data:image/png;base64,xx',
      avatarPath: '/avatar.png',
      groupId: 'group_a',
      group_id: 'group_a',
      defaultPreset: 'preset-a',
      defaultModel: 'model-a',
      default_preset: 'preset-a',
      default_model: 'model-a'
    })

    expect(markdown).toContain('## 名称')
    expect(markdown).toContain('惊稚')
    expect(markdown).toContain('## 目标与价值')
    expect(markdown).toContain('守住真实关系')
    expect(markdown).not.toContain('## 当前活动')
    expect(markdown).not.toContain('## 常驻地点')
    expect(markdown).not.toContain('## 每周日程')
    expect(markdown).not.toContain('## 年度日程')
    expect(markdown).not.toContain('## 关系')
    expect(markdown).not.toContain('avatar')
    expect(markdown).not.toContain('/avatar.png')
    expect(markdown).not.toContain('group_a')
    expect(markdown).not.toContain('preset-a')
    expect(markdown).not.toContain('model-a')
    expect(markdown).toContain('✦')
  })

  it('imports exported markdown back into update changes', () => {
    const changes = parseCharacterCoreMarkdown(`
# 惊稚

<!-- langhuan:character-core-markdown v1 -->

## 名称

惊稚

## 图标

✦

## 年龄

22

## 说话风格

短句

## 目标与价值

守住真实关系

## 昵称

- 阿稚
- 小惊

`)

    expect(changes.name).toBe('惊稚')
    expect(changes.emoji).toBe('✦')
    expect(changes.age).toBe(22)
    expect(changes.speakingStyle).toBe('短句')
    expect(changes.speaking_style).toBe('短句')
    expect(changes.brainDocuments).toEqual({
      'brain:goal_value': '守住真实关系'
    })
    expect(changes.nicknames).toBeUndefined()
    expect(changes.currentActivities).toBeUndefined()
    expect(changes.schedule).toBeUndefined()
    expect(changes.yearlySchedule).toBeUndefined()
  })

  it('imports age values that include the Chinese age suffix', () => {
    const changes = parseCharacterCoreMarkdown(`
## 名称

张元英

## 年龄

21岁
`)

    expect(changes.age).toBe(21)
  })

  it('uses safe markdown filenames', () => {
    expect(getCharacterCoreMarkdownFilename({ name: '惊稚/星' })).toBe('惊稚_星.md')
  })

  it('wraps markdown with an external AI completion prompt', () => {
    const prompt = buildCharacterCoreMarkdownPrompt('# 惊稚\n\n## 名称\n\n惊稚')
    expect(prompt).toContain('立体、真实、有血有肉')
    expect(prompt).toContain('严格保留 Markdown 单位结构')
    expect(prompt).toContain('名称：只填写一个')
    expect(prompt).toContain('目标与价值：写角色长期想守住什么')
    expect(prompt).toContain('世界观：写角色看待世界')
    expect(prompt).toContain('背景：写势力背景、家族背景、阶层背景、文化教育背景')
    expect(prompt).toContain('现实人物：如果任务环境允许联网或用户提供可靠资料')
    expect(prompt).toContain('虚拟人物：不要输出语言示例')
    expect(prompt).toContain('## 名称')
  })
})
