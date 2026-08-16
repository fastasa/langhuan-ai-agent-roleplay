import { describe, expect, it } from 'vitest'
import { buildGroupDirectorMessages } from '../../../src/app/groupDirectorPass.ts'
import { renderLastScenarioBlock } from '../../../src/app/orchestrationMaterialPresentation.ts'

// 批次 C·上一轮情境（并进提调主判·轻判变没变）：注入轮级提调统筹决策 loop 的 user 侧。
// 硬边界：① 仅 decisionTools 模式注入（非 decision 一次性 JSON 路径无 readScenarioSkill·谈不上沿用）；
//         ② 缺省/空串零注入·行为不变；③ 纠偏路径由管线控制不传（此处只验 builder 口径）。
const candidates = [{ characterId: 'c1', name: '阿澈' }]
const input = { userText: '早上好呀', candidates, forcedCharacterIds: [], excludedCharacterIds: [] }
const BLOCK = renderLastScenarioBlock({ code: 'morning_home', summary: '在家吃早饭' })

describe('批次 C·上一轮情境注入口径（轮级提调统筹）', () => {
  it('decisionTools + lastScenarioBlock 非空 → user 含上一轮情境承接块与 code', () => {
    const [, user] = buildGroupDirectorMessages(input, { decisionTools: true, lastScenarioBlock: BLOCK })
    expect(user.content).toContain('上一轮情境')
    expect(user.content).toContain('morning_home')
  })

  it('decisionTools 但缺省/空串 → user 不含承接块（零注入）', () => {
    const [, base] = buildGroupDirectorMessages(input, { decisionTools: true })
    const [, blank] = buildGroupDirectorMessages(input, { decisionTools: true, lastScenarioBlock: '   ' })
    expect(base.content).not.toContain('上一轮情境')
    expect(blank.content).not.toContain('上一轮情境')
  })

  it('硬边界：非 decisionTools（一次性 JSON 路径）即使传 lastScenarioBlock 也不注入', () => {
    const [, user] = buildGroupDirectorMessages(input, { lastScenarioBlock: BLOCK })
    expect(user.content).not.toContain('上一轮情境')
  })
})
