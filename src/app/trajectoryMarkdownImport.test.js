import { describe, expect, it } from 'vitest'
import { parseTrajectoryMarkdown } from './trajectoryMarkdownImport.ts'

describe('trajectoryMarkdownImport', () => {
  it('parses trajectory body entries for year, month, and day mounts', () => {
    const parsed = parseTrajectoryMarkdown(`# 琅嬛轨迹正文

## 轨迹条目

### 年枝｜离城求学｜起止：1024｜建议挂载：/轨迹/1024
#### 字段
- 时间：1024
- 粒度：年枝
- 涉及对象：导师、旧城
- 标签：求学、离城、待确认
- 简短摘要：离开旧城并开始系统学习。
- 正式性：confirmed

#### 正文
她离开旧城，第一次把家族安排之外的目标放到自己面前。

### 月枝｜密集训练｜起止：1024-03｜建议挂载：/轨迹/1024/1024-03
#### 字段
- 时间：1024-03
- 粒度：月枝
- 涉及对象：无
- 标签：训练、适应
- 简短摘要：训练强度集中升高。
- 正式性：confirmed

#### 正文
三月的训练密度明显提高，她开始适应新的节奏。

### 日桠｜契约签订｜日期：1024-03-18｜建议挂载：/轨迹/1024/1024-03/1024-03-18
#### 字段
- 时间：1024-03-18
- 粒度：日桠
- 涉及对象：契约者
- 标签：契约、转折
- 简短摘要：她签下不可逆契约。
- 正式性：confirmed

#### 正文
这一天她签下契约，代价从此进入长期生命轨迹。`)

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries.map((entry) => entry.granularity)).toEqual(['year', 'month', 'day'])
    expect(parsed.entries[0]).toEqual(expect.objectContaining({
      title: '离城求学',
      time: '1024',
      startDate: '1024-01-01',
      endDate: '1024-12-31',
      mountPath: '/轨迹/1024',
      relatedEntities: ['导师', '旧城'],
      tags: ['求学', '离城', '待确认'],
      summary: '离开旧城并开始系统学习。',
      confirmed: true
    }))
    expect(parsed.entries[2].content).toContain('长期生命轨迹')
  })

  it('skips entries without supported time or body', () => {
    const parsed = parseTrajectoryMarkdown(`### 年枝｜缺正文｜起止：1024
#### 字段
- 时间：1024
- 粒度：年枝

#### 正文

### 奇怪粒度｜坏条目｜起止：1025
#### 字段
- 时间：1025
- 粒度：周枝

#### 正文
正文`)

    expect(parsed.entries).toEqual([])
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(['empty_body', 'invalid_granularity'])
  })
})
