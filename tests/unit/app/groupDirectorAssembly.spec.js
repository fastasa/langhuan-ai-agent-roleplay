import { describe, expect, it } from 'vitest'
import {
  assembleGroupDirectorMessages,
  buildGroupDirectorPromptParts,
  DIRECTOR_KNOWLEDGE_MATCHED_SECTION_TITLE
} from '../../../src/app/groupDirectorPass.ts'

const parts = () => buildGroupDirectorPromptParts({
  userText: '下午好',
  candidates: [{ characterId: 'c1', name: '陈星依' }],
  forcedCharacterIds: [],
  excludedCharacterIds: [],
  recentContext: '用户：下午好',
  sceneContext: '深夜·望舒台·小雨'
})

describe('提调消息装配', () => {
  it('动态材料按历史→情境→信息流→已读资料→收束句排列', () => {
    const [, user] = assembleGroupDirectorMessages(
      parts(),
      '- 调用 readChatMessage',
      '逐字全文',
      '【2.4 帷幕】按需正文'
    )
    const order = ['【3·对话可见历史】', '【2·当前情境】', '【5·提调带信息流】', '【4·已读资料】', '请一次统筹本轮剧本']
    for (let i = 1; i < order.length; i++) {
      expect(user.content.indexOf(order[i - 1])).toBeGreaterThanOrEqual(0)
      expect(user.content.indexOf(order[i - 1])).toBeLessThan(user.content.indexOf(order[i]))
    }
    expect(user.content).toContain(DIRECTOR_KNOWLEDGE_MATCHED_SECTION_TITLE)
    expect(user.content).not.toContain('【6·本轮 TODO】')
  })

  it('无已读资料与命中知识时不创建空层4', () => {
    const [, user] = assembleGroupDirectorMessages(parts())
    expect(user.content).not.toContain('【4·已读资料】')
  })
})
