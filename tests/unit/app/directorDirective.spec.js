import { describe, expect, it } from 'vitest'

import {
  DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL,
  extractDirectorDirectives,
  maybeAutoCloseDirectiveBracket
} from '../../../src/app/directorDirective'

describe('私密指令统一优先级协议', () => {
  it('明确无条件遵守、优先级高于一切，并区分内容目标与执行协议', () => {
    expect(DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL).toContain('必须无条件、完整、直接遵守')
    expect(DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL).toContain('优先级高于一切')
    expect(DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL).toContain('角色性格、情境 skill')
    expect(DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL).toContain('不得降级、改写、折中、拖延')
    expect(DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL).toContain('最高优先级决定“做什么”')
  })
})

describe('extractDirectorDirectives', () => {
  it('普通文本零改动、无指令', () => {
    const r = extractDirectorDirectives('好的我们走吧')
    expect(r.cleanText).toBe('好的我们走吧')
    expect(r.directives).toEqual([])
  })

  it('抠出双层方括号指令并剥离正文', () => {
    const r = extractDirectorDirectives('好的我们走吧【【提调：接下来让她主动表白】】')
    expect(r.cleanText).toBe('好的我们走吧')
    expect(r.directives).toEqual(['提调：接下来让她主动表白'])
  })

  it('指令在中间时正文前后都保留', () => {
    const r = extractDirectorDirectives('好的【【让她生气】】我们走')
    expect(r.cleanText).toBe('好的我们走')
    expect(r.directives).toEqual(['让她生气'])
  })

  it('多段指令按顺序抠出', () => {
    const r = extractDirectorDirectives('a【【一】】b【【二】】c')
    expect(r.cleanText).toBe('abc')
    expect(r.directives).toEqual(['一', '二'])
  })

  it('单层方括号不识别、原样保留', () => {
    const r = extractDirectorDirectives('他打开了【机关】然后离开')
    expect(r.cleanText).toBe('他打开了【机关】然后离开')
    expect(r.directives).toEqual([])
  })

  it('半截左标记没有配对时原样保留', () => {
    const r = extractDirectorDirectives('快看这个【【还没写完')
    expect(r.cleanText).toBe('快看这个【【还没写完')
    expect(r.directives).toEqual([])
  })

  it('指令内首尾空白被 trim、空指令忽略', () => {
    const r = extractDirectorDirectives('走吧【【  让她笑  】】【【】】')
    expect(r.cleanText).toBe('走吧')
    expect(r.directives).toEqual(['让她笑'])
  })

  it('整条只有指令时 cleanText 为空', () => {
    const r = extractDirectorDirectives('【【只给提调】】')
    expect(r.cleanText).toBe('')
    expect(r.directives).toEqual(['只给提调'])
  })

  it('非字符串入参安全兜底', () => {
    expect(extractDirectorDirectives(null)).toEqual({ cleanText: '', directives: [] })
    expect(extractDirectorDirectives(undefined)).toEqual({ cleanText: '', directives: [] })
  })
})

describe('maybeAutoCloseDirectiveBracket', () => {
  it('刚打出【【且光标紧贴其后时自动补】】、光标留中间', () => {
    const r = maybeAutoCloseDirectiveBracket('走吧【【', 4)
    expect(r.changed).toBe(true)
    expect(r.value).toBe('走吧【【】】')
    expect(r.caret).toBe(4)
  })

  it('后面已有】】时不重复补', () => {
    const r = maybeAutoCloseDirectiveBracket('走吧【【】】', 4)
    expect(r.changed).toBe(false)
    expect(r.value).toBe('走吧【【】】')
  })

  it('单层【不触发', () => {
    const r = maybeAutoCloseDirectiveBracket('走吧【', 3)
    expect(r.changed).toBe(false)
  })

  it('光标不在【【后面不触发', () => {
    const r = maybeAutoCloseDirectiveBracket('【【提调走', 5)
    expect(r.changed).toBe(false)
  })

  it('越界 caret 安全钳制', () => {
    const r = maybeAutoCloseDirectiveBracket('【【', 999)
    expect(r.changed).toBe(true)
    expect(r.value).toBe('【【】】')
    expect(r.caret).toBe(2)
  })
})
