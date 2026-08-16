import { describe, expect, it } from 'vitest'
import { buildUnitTreeMarkdownWithBodyPrompt, buildUnitTreeMarkdownWithCompilePrompt } from './unitTreeJsonExport.ts'

function unit(input) {
  return {
    domain: 'docLibrary',
    unitType: input.unitType || 'leaf',
    contentKind: 'markdown',
    status: 'normal',
    unitId: input.unitId,
    sourceId: input.sourceId || input.unitId,
    title: input.title,
    parentId: input.parentId,
    orderIndex: input.orderIndex || 0,
    body: input.body || '',
    compilePage: input.compilePage || { summary: input.summary || '', tags: [], relationHints: [] },
    metadata: { relationRefId: input.refId || input.sourceId || input.unitId }
  }
}

describe('unitTreeJsonExport', () => {
  it('exports compile prompt with natural summary wording rule', () => {
    const markdown = buildUnitTreeMarkdownWithCompilePrompt({
      units: [
        unit({
          unitId: 'root',
          title: '亚什基诺',
          unitType: 'cluster',
          summary: '世界总览。',
          refId: 'doc:root'
        })
      ],
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      exportedAt: '2026-05-03T00:00:00.000Z'
    })

    expect(markdown).toContain('直接从对象、地点、组织、事件或概念本身说起')
    expect(markdown).toContain('不要写“本页描述”“本页记录”“本文介绍”“该文档说明”等页面指称')
    expect(markdown).toContain('关系提示服务跨目录、跨类型、跨区域联动')
    expect(markdown).toContain('不要批量生成父级包含子级、子级隶属于父级这类重复结构关系')
    expect(markdown).toContain('不要在父级文档列出一整串目录下级“包含”关系')
  })

  it('exports doc library body generation prompt without source body material', () => {
    const markdown = buildUnitTreeMarkdownWithBodyPrompt({
      units: [
        unit({
          unitId: 'trace-year-1',
          title: '十六岁以前',
          unitType: 'traceGroup',
          body: '已有正文',
          refId: 'trace:year:1'
        })
      ],
      rootUnitIds: ['trace-year-1'],
      sourceLabel: '文档库'
    })

    expect(markdown).toContain('# 外部 AI 文档库正文生成提示词')
    expect(markdown).toContain('# 琅嬛批量正文')
    expect(markdown).toContain('<!-- target: 文档标题@正式ID -->')
    expect(markdown).not.toContain('# relationHints 生成材料')
    expect(markdown).not.toContain('正文：')
    expect(markdown).not.toContain('副标题')
    expect(markdown).not.toContain('正式性')
  })

  it('exports role brain body prompt without trajectory-only subtitle field', () => {
    const markdown = buildUnitTreeMarkdownWithBodyPrompt({
      units: [
        unit({
          unitId: 'brain-desc',
          title: '简介',
          unitType: 'coreField',
          body: '已有简介',
          refId: 'brain:desc'
        })
      ],
      rootUnitIds: ['brain-desc'],
      sourceLabel: '角色大脑'
    }, 'roleBrain')

    expect(markdown).toContain('# 外部 AI 角色核心与灵魂正文生成提示词')
    expect(markdown).toContain('核心单位服务角色一致性')
    expect(markdown).toContain('灵魂单位服务角色理解')
    expect(markdown).toContain('目标与价值：写角色长期想守住什么')
    expect(markdown).toContain('世界观：写角色看待世界')
    expect(markdown).toContain('背景：写势力背景、家族背景、阶层背景、文化教育背景')
    expect(markdown).toContain('角色禁止圆滑化、完美化、空泛化')
    expect(markdown).not.toContain('副标题')
    expect(markdown).not.toContain('正式性')
    expect(markdown).not.toContain('已有简介')
  })

  it('exports trajectory body prompt with trajectory-only fields', () => {
    const markdown = buildUnitTreeMarkdownWithBodyPrompt({
      units: [
        unit({
          unitId: 'trace-year-1',
          title: '十六岁以前',
          unitType: 'traceGroup',
          body: '已有正文',
          refId: 'trace:year:1'
        })
      ],
      rootUnitIds: ['trace-year-1'],
      sourceLabel: '轨迹'
    }, 'trajectory')

    expect(markdown).toContain('# 外部 AI 轨迹正文生成提示词')
    expect(markdown).toContain('# 琅嬛轨迹正文')
    expect(markdown).toContain('- 副标题：显示在日期标题旁的短标题')
    expect(markdown).toContain('- 正式性：confirmed 或 unconfirmed')
    expect(markdown).toContain('不要输出内部字段')
    expect(markdown).toContain('sourcePath')
    expect(markdown).toContain('日期真值只写在三级标题的时间段里')
    expect(markdown).toContain('“建议挂载”只写粒度提示')
    expect(markdown).toContain('主要把阶段经历写在年枝或多年枝')
    expect(markdown).not.toContain('# relationHints 生成材料')
    expect(markdown).not.toContain('已有正文')
  })
})
