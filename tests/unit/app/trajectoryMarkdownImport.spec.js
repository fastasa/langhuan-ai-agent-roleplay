import { describe, expect, it } from 'vitest'
import {
  parseTrajectoryMarkdown,
  validateTrajectoryRootImportBirthDate
} from '../../../src/app/trajectoryMarkdownImport'

describe('trajectoryMarkdownImport', () => {
  it('allows root import only when the first day matches the trajectory birth date', () => {
    const parsed = parseTrajectoryMarkdown(`# 琅嬛轨迹正文

### 日桠｜出生｜0067-05-01｜建议挂载：日期

#### 字段

- 副标题：第一天
- 简短摘要：出生。
- 标签：出生
- 涉及对象：惊雨
- 正式性：confirmed

#### 正文

出生正文。

### 年枝｜童年｜0067-01-01 至 0073-12-31｜建议挂载：10 年枝

#### 字段

- 副标题：童年
- 简短摘要：童年阶段。
- 标签：童年
- 涉及对象：惊雨
- 正式性：confirmed

#### 正文

童年正文。
`)

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries.map((entry) => [entry.granularity, entry.startDate, entry.endDate])).toEqual([
      ['multiYear', '0067-01-01', '0073-12-31'],
      ['day', '0067-05-01', '0067-05-01']
    ])
    expect(parsed.entries[0].subtitle).toBe('童年')
    expect(validateTrajectoryRootImportBirthDate(parsed.entries, '0067-05-01')).toEqual({ ok: true })
    expect(validateTrajectoryRootImportBirthDate(parsed.entries, '0067-05-02')).toEqual({
      ok: false,
      message: '轨迹根导入要求第一天等于出生日期：当前出生日期是 0067-05-02，材料第一天是 0067-05-01。'
    })
  })

  it('rejects root import material without a day entry', () => {
    const parsed = parseTrajectoryMarkdown(`# 琅嬛轨迹正文

### 年枝｜童年｜0067-01-01 至 0073-12-31｜建议挂载：10 年枝

#### 字段

- 副标题：童年
- 简短摘要：童年阶段。
- 标签：童年
- 涉及对象：惊雨
- 正式性：confirmed

#### 正文

童年正文。
`)

    expect(validateTrajectoryRootImportBirthDate(parsed.entries, '0067-05-01')).toEqual({
      ok: false,
      message: '从轨迹根导入正文时，材料里至少需要一个日桠作为第一天。'
    })
  })

  it('keeps heading title and field subtitle separate', () => {
    const parsed = parseTrajectoryMarkdown(`# 琅嬛轨迹正文

### 年枝｜十二岁后的求学中止｜0079-05-01 至 0079-12-31｜建议挂载：年份

#### 字段

- 副标题：没有走进专精学院
- 简短摘要：十二岁后，惊雨因家境与天赋限制未能继续求学。
- 标签：十二岁、求学中止
- 涉及对象：惊雨、专精学院
- 正式性：confirmed

#### 正文

求学中止正文。
`)

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0]).toMatchObject({
      granularity: 'year',
      title: '十二岁后的求学中止',
      subtitle: '没有走进专精学院',
      startDate: '0079-05-01',
      endDate: '0079-12-31'
    })
  })

  it('routes day entries to event, arrangement, or overview targets', () => {
    const parsed = parseTrajectoryMarkdown(`# 琅嬛轨迹正文

### 日桠｜签订契约｜1024-03-18｜建议挂载：日期

#### 字段

- 副标题：不可逆契约
- 简短摘要：她签下不可逆契约。
- 标签：契约
- 涉及对象：契约者
- 正式性：confirmed

#### 正文

契约正文。

### 日桠｜夜间巡查｜1024-03-18｜建议挂载：安排

#### 字段

- 副标题：夜间巡查
- 简短摘要：这天夜里要巡查。
- 标签：巡查
- 涉及对象：无
- 正式性：confirmed

#### 正文

巡查安排正文。

### 日桠｜当日概览｜1024-03-19｜建议挂载：日期

#### 字段

- 导入为：概览
- 副标题：当日概览
- 简短摘要：这一天的整体概览。
- 标签：概览
- 涉及对象：无
- 正式性：confirmed

#### 正文

概览正文。
`)

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries.map((entry) => entry.dayTarget)).toEqual(['event', 'arrangement', 'overview'])
  })
})
