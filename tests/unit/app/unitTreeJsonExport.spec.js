import { describe, expect, it } from 'vitest'
import {
  buildUnitTreeMarkdown,
  buildUnitTreeMarkdownWithBodyPrompt,
  buildUnitTreeMarkdownWithCompilePrompt
} from '../../../src/app/unitTreeJsonExport'

function createUnit(overrides = {}) {
  return {
    unitId: 'unit-root',
    domain: 'docLibrary',
    unitType: 'branch',
    contentKind: 'group',
    title: '地理与区域',
    parentId: 'doc-tree:root',
    orderIndex: 0,
    status: 'normal',
    body: '',
    compilePage: {
      summary: '',
      tags: [],
      relationHints: []
    },
    metadata: {},
    ...overrides
  }
}

describe('unitTreeJsonExport markdown', () => {
  it('builds readable markdown blocks from exported units', () => {
    const markdown = buildUnitTreeMarkdown({
      sourceLabel: '地理与区域',
      rootUnitIds: ['unit-root'],
      units: [
        createUnit(),
        createUnit({
          unitId: 'folder-river',
          title: '河流水系',
          parentId: 'unit-root'
        }),
        createUnit({
          unitId: 'doc-river',
          unitType: 'leaf',
          contentKind: 'markdown',
          title: '伊森弗鲁斯河',
          parentId: 'folder-river',
          orderIndex: 1,
          body: '第一段\\n\\n第二段',
          compilePage: {
            summary: '',
            tags: ['河流', '地理'],
            relationHints: ['[[长白山山脉]]_流经_[[赫兹塔尔盆地]]']
          }
        })
      ]
    })

    expect(markdown).toContain('# relationHints 生成材料：地理与区域')
    expect(markdown).toContain('## 资料库中已有单位标题')
    expect(markdown).toContain('- 地理与区域@unit-root')
    expect(markdown).toContain('- 河流水系@folder-river')
    expect(markdown).toContain('- 伊森弗鲁斯河@doc-river')
    expect(markdown).toContain('## 文档 1：伊森弗鲁斯河@doc-river')
    expect(markdown).toContain('路径：地理与区域 / 河流水系 / 伊森弗鲁斯河')
    expect(markdown).toContain('摘要：\n空')
    expect(markdown).toContain('标签：\n河流、地理')
    expect(markdown).toContain('正文：\n第一段\\n\\n第二段')
    expect(markdown).toContain('已有 relationHints：\n[[长白山山脉]]_流经_[[赫兹塔尔盆地]]')
    expect(markdown).toContain('待生成 relationHints：')
  })

  it('drops duplicated child selections and prints empty placeholders when needed', () => {
    const markdown = buildUnitTreeMarkdown({
      sourceLabel: '角色大脑',
      rootUnitIds: ['root', 'child'],
      units: [
        createUnit({
          unitId: 'root',
          domain: 'characterBrain',
          unitType: 'soulNode',
          contentKind: 'group',
          title: '灵魂'
        }),
        createUnit({
          unitId: 'child',
          domain: 'characterBrain',
          unitType: 'soulNode',
          contentKind: 'form',
          title: '设定卡',
          parentId: 'root',
          compilePage: {
            summary: '',
            tags: [],
            relationHints: []
          }
        })
      ]
    })

    expect(markdown.match(/## 文档 /g)).toHaveLength(1)
    expect(markdown).toContain('## 文档 1：空')
    expect(markdown).toContain('路径：空')
  })

  it('can append the compile page prompt without replacing the base markdown', () => {
    const markdown = buildUnitTreeMarkdownWithCompilePrompt({
      sourceLabel: '镜湖平原',
      rootUnitIds: ['unit-root'],
      units: [
        createUnit({
          unitId: 'unit-root',
          title: '镜湖平原',
          contentKind: 'markdown',
          body: '平原正文'
        })
      ]
    })

    expect(markdown).toContain('# relationHints 生成材料：镜湖平原')
    expect(markdown).toContain('# 外部 AI 编译页生成提示词')
    expect(markdown).toContain('# 琅嬛编译页')
    expect(markdown).toContain('## 摘要')
    expect(markdown).toContain('## 标签')
    expect(markdown).toContain('## 类型')
    expect(markdown).toContain('## 关系提示')
    expect(markdown).toContain('[[源单位]]_谓词_[[目标单位]]')
  })

  it('tells trajectory body generation not to create empty continuous year branches', () => {
    const prompt = buildUnitTreeMarkdownWithBodyPrompt({
      sourceLabel: '惊雨角色资料',
      rootUnitIds: [],
      units: []
    }, 'trajectory')

    expect(prompt).toContain('不要为了覆盖时间连续性而输出空年份、空月份或空日期')
    expect(prompt).toContain('跨多个年份的阶段必须写成一个多年枝条目')
    expect(prompt).toContain('不要输出内部字段')
    expect(prompt).toContain('日期真值只写在三级标题的时间段里')
    expect(prompt).toContain('“建议挂载”只写粒度提示')
    expect(prompt).toContain('### 多年枝｜阶段标题｜YYYY-01-01 至 YYYY-12-31｜建议挂载：多年枝')
    expect(prompt).toContain('- 导入为：概览；月枝只能承载阶段概览，不要写事件或安排')
  })

  it('explains trajectory event and arrangement fields without asking for internal ids', () => {
    const prompt = buildUnitTreeMarkdownWithBodyPrompt({
      sourceLabel: '惊雨角色资料',
      rootUnitIds: [],
      units: []
    }, 'trajectory')

    expect(prompt).toContain('事件单位只写已经发生或资料明确记载的事实')
    expect(prompt).toContain('事件字段：参与者、发生地点、发生时间、经过、结果、影响、依据')
    expect(prompt).toContain('安排单位只写角色在某时间段应位于何处')
    expect(prompt).toContain('安排单位正文必须使用 Markdown')
    expect(prompt).toContain('不要在正文里写地点关键词')
    expect(prompt).toContain('## 角色具体位置')
    expect(prompt).toContain('激活规则：日期 YYYY-MM-DD；开始 HH:mm；结束 HH:mm；重复 once')
    expect(prompt).toContain('召回策略：读取正文，必须召回')
    expect(prompt).toContain('编译页摘要')
    expect(prompt).toContain('编译页标签')
    expect(prompt).toContain('编译页关系提示')
    expect(prompt).toContain('不要输出 activationRule / recallPolicy JSON')
    expect(prompt).toContain('禁止字段：不要写 id、sourceId、sourcePath、systemRole、parentId、orderIndex、activationRule、recallPolicy')
  })
})
