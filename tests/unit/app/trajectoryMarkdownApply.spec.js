import { describe, expect, it } from 'vitest'
import { readCharacterBrainTraceNodes } from '../../../src/app/characterBrain'
import { applyTrajectoryMarkdownToCharacter } from '../../../src/app/trajectoryMarkdownApply'

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '陈星依',
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '', calendarId: 'gregorian', calendarConfig: {} },
    brain_trajectory_meta: '{"birthDate":"2004-05-02","zeroNote":"","calendarId":"gregorian","calendarConfig":{}}',
    ...overrides
  }
}

describe('trajectoryMarkdownApply', () => {
  it('creates day branch children as event and arrangement leaves', () => {
    const result = applyTrajectoryMarkdownToCharacter(createCharacter(), `# 琅嬛轨迹正文

### 日桠｜清晨争执｜2004-05-02｜建议挂载：日期

#### 字段

- 副标题：清晨争执
- 简短摘要：清晨发生了一次争执。
- 标签：争执
- 涉及对象：陈星依
- 正式性：confirmed

#### 正文

清晨争执正文。

### 日桠｜夜间巡查｜2004-05-02｜建议挂载：安排

#### 字段

- 导入为：安排
- 副标题：夜间巡查
- 简短摘要：夜里需要巡查。
- 标签：巡查
- 涉及对象：陈星依
- 正式性：confirmed
- 激活规则：日期 2004-05-02；开始 20:00；结束 22:30；重复 weekly；提前 15 分钟；宽限 5 分钟
- 召回策略：读取正文，必须召回

#### 正文

巡查安排正文。
`, { now: '2026-05-09T00:00:00.000Z' })

    expect(result.ok).toBe(true)
    expect(result.importedCount).toBe(2)
    const nodes = readCharacterBrainTraceNodes(createCharacter(result.changes))
    expect(nodes.find((node) => node.systemRole === 'dayLeaf')).toMatchObject({
      pointDate: '2004-05-02'
    })
    expect(nodes.find((node) => node.systemRole === 'eventLeaf')).toMatchObject({
      title: '清晨争执',
      content: '清晨争执正文。'
    })
    expect(nodes.find((node) => node.systemRole === 'arrangementLeaf')).toMatchObject({
      title: '夜间巡查',
      tags: ['巡查'],
      relatedEntityIds: ['陈星依'],
      activationRule: {
        date: '2004-05-02',
        startTime: '20:00',
        endTime: '22:30',
        recurrence: 'weekly',
        prewarmMinutes: 15,
        graceMinutes: 5
      },
      recallPolicy: { level: 'body', priority: 'must' }
    })
  })
})
