import { describe, expect, it, vi } from 'vitest'
import { buildXingyiRelationHintSkillBody } from '../../../src/app/agentKnowledge/xingyiRelationHintKnowledge.ts'
import { getPredicateDictionaryEntries } from '../../../src/app/relationPredicateDictionary.ts'
import { createReadXingyiRelationHintSkillTool } from '../../../src/app/xingyiRelationHintSkill.ts'

describe('星依关系提示专项 Skill', () => {
  it('Markdown 提供流程，运行时附录直接覆盖现役谓词字典全部词项', () => {
    const body = buildXingyiRelationHintSkillBody()

    expect(body).toContain('必须先调用 `readRelationHintSkill`')
    expect(body).toContain('整组覆盖')
    expect(body).not.toContain('{{PREDICATE_DICTIONARY}}')
    for (const entry of getPredicateDictionaryEntries()) {
      expect(body).toContain(`**${entry.label}**`)
      for (const term of [...entry.forwardTerms, ...entry.reverseTerms]) {
        expect(body).toContain(term)
      }
    }
  })

  it('只有正文成功装配后才打开本轮写入门禁', async () => {
    const markRead = vi.fn()
    const tool = createReadXingyiRelationHintSkillTool({ markRead })

    const result = await tool.execute({ args: {} }, { turnIndex: 0 })

    expect(result.status).not.toBe('error')
    expect(result.content).toContain('运行时合法谓词附录')
    expect(result.details.kind).toBe('xingyiRelationHintSkill')
    expect(markRead).toHaveBeenCalledOnce()
  })
})
