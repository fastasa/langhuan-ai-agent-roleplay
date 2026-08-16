import { describe, expect, it } from 'vitest'
import {
  createListXingyiKnowledgeTopicsTool,
  createReadXingyiKnowledgeTopicTool,
  createSearchXingyiKnowledgeTool,
  createXingyiKnowledgeTools,
  parseXingyiKnowledgeSections,
  searchXingyiKnowledgeSections
} from '../../../src/app/agentKnowledge/xingyiKnowledge.ts'

const SAMPLE = [
  '## 来源：基础手册.md',
  '',
  '# 星依知识库',
  '',
  '## 二、功能地图',
  '',
  '### 2.2 编译页',
  '编译页四字段：摘要、标签、类型、关系提示。target 注释必须原样复制。',
  '',
  '### 2.3 关系提示',
  '格式 [[源单位]]_谓词_[[目标单位]]，导入前弹 review。',
  '',
  '## 来源：报错手册.md',
  '',
  '## 三、报错处置',
  '',
  '### 3.1 对应页面未打开',
  '不是故障，转告用户打开页面。'
].join('\n')

async function searchRealTopic(query, titleIncludes) {
  const searchTool = createSearchXingyiKnowledgeTool()
  const searchResult = await searchTool.execute({ args: { query } }, { turnIndex: 0 })
  expect(searchResult.details.hitCount).toBeGreaterThan(0)
  const topic = searchResult.details.topics.find((item) => item.title.includes(titleIncludes))
  expect(topic, `查询“${query}”应命中标题含“${titleIncludes}”的主题`).toBeTruthy()
  const readTool = createReadXingyiKnowledgeTopicTool()
  return readTool.execute({ args: { topicId: topic.topicId } }, { turnIndex: 0 })
}

describe('xingyiKnowledge（星依知识库三层查询）', () => {
  it('按来源和 ### 小节切分，生成稳定 topicId，## 顶节不吃进正文', () => {
    const sections = parseXingyiKnowledgeSections(SAMPLE)
    expect(sections.map((s) => s.title)).toEqual(['2.2 编译页', '2.3 关系提示', '3.1 对应页面未打开'])
    expect(sections[0]).toMatchObject({ source: '基础手册.md', topicId: '基础手册::2.2 编译页' })
    expect(sections[2]).toMatchObject({ source: '报错手册.md', topicId: '报错手册::3.1 对应页面未打开' })
    expect(sections[0].content).toContain('四字段')
    expect(sections[0].content).not.toContain('报错处置')
  })

  it('同名标题用来源+标题作唯一键，不会静默 find 到第一份正文', () => {
    const raw = [
      '## 来源：甲.md',
      '### 1.1 同名主题',
      '只属于甲的边界。',
      '## 来源：乙.md',
      '### 1.1 同名主题',
      '只属于乙的冷门证据。'
    ].join('\n')
    const sections = parseXingyiKnowledgeSections(raw)
    expect(sections.map((section) => section.topicId)).toEqual(['甲::1.1 同名主题', '乙::1.1 同名主题'])
    const hits = searchXingyiKnowledgeSections('乙 冷门证据', raw)
    expect(hits[0]).toMatchObject({ topicId: '乙::1.1 同名主题', source: '乙.md' })
    expect(hits[0].content).toContain('只属于乙')
  })

  it('关键词命中标题或正文，按得分降序并保留来源', () => {
    const hits = searchXingyiKnowledgeSections('编译页 格式', SAMPLE)
    expect(hits[0]).toMatchObject({ title: '2.2 编译页', source: '基础手册.md' })
    const errHits = searchXingyiKnowledgeSections('页面未打开', SAMPLE)
    expect(errHits.some((s) => s.topicId === '报错手册::3.1 对应页面未打开')).toBe(true)
  })

  it('知识三件套统一装配，避免 harness 漏挂任一层', () => {
    expect(createXingyiKnowledgeTools().map((tool) => tool.name)).toEqual([
      'listXingyiKnowledgeTopics',
      'searchXingyiKnowledge',
      'readXingyiKnowledgeTopic'
    ])
  })

  it('list 只返回主题目录元数据，并引导按 topicId 精读', async () => {
    const tool = createListXingyiKnowledgeTopicsTool()
    const result = await tool.execute({ args: { query: '编译页' } }, { turnIndex: 0 })
    expect(result.details.topicCount).toBeGreaterThan(0)
    expect(result.content).toContain('topicId：')
    expect(result.content).toContain('来源：知识库.md')
    expect(result.content).toContain('readXingyiKnowledgeTopic')
  })

  it('search 只返回候选摘要，read 才返回编译页完整规则', async () => {
    const searchTool = createSearchXingyiKnowledgeTool()
    const searchResult = await searchTool.execute({ args: { query: '编译页 格式' } }, { turnIndex: 0 })
    expect(searchResult.details.hitCount).toBeGreaterThan(0)
    expect(searchResult.content).toContain('topicId：')
    expect(searchResult.content).toContain('readXingyiKnowledgeTopic')

    const readResult = await searchRealTopic('编译页 格式', '2.2 编译页')
    expect(readResult.content).toContain('琅嬛批量编译页')
    expect(readResult.content).toContain('来源：知识库.md')
  })

  it('重要跨域：文档资料生成正式角色并归组，精读后不会误走 moveUnit', async () => {
    const result = await searchRealTopic('文档库 咒术回战 相关角色 没有生成 生成一下 新的分组 角色都放进去', '从文档库资料生成缺失角色')
    expect(result.content).toContain('generateCharactersBatch')
    expect(result.content).toContain('assignCharactersToGroup')
    expect(result.content).toContain('不要移动或重建这些文档单位')
  })

  it('基础直达：创建马甲精读后包含用户资料默认姓名与外貌规则', async () => {
    const result = await searchRealTopic('创建马甲 用户资料 角色扮演姓名 外貌 默认', '用户资料与马甲')
    expect(result.content).toContain('readUserProfile')
    expect(result.content).toContain('角色扮演姓名')
    expect(result.content).toContain('appearance')
    expect(result.content).toContain('发送意见')
  })

  it('状态系统知识锁定六型字段与受控总览，不教模型生成任意前端代码', async () => {
    const result = await searchRealTopic('状态系统 搭建 图片资产 饼图 总览', '状态系统（积木搭建范式）')
    expect(result.content).toContain('六型选型原则')
    expect(result.content).toContain('assetId/kind=image/alt')
    expect(result.content).toContain('总览不是第二套数据')
    expect(result.content).toContain('dispatchZaoceStatusDesign')
    expect(result.content).toContain('不能虚构“在状态面板里手动配置总览”的入口')
    expect(result.content).toContain('zaoce.advanced-authoring')
    expect(result.content).toContain('禁止脚本')
  })

  it('知识不足查询能精读按知识类型选择渠道的规则', async () => {
    const result = await searchRealTopic('知识不足 去哪里补 当前系统有什么', '知识不足时去哪里补')
    expect(result.content).toContain('先判断缺的是哪一种知识')
    expect(result.content).toContain('list/read')
    expect(result.content).toContain('工具 schema')
  })

  it('基础直达：子 Agent 超时时限能定位声明预算与恢复规则', async () => {
    const result = await searchRealTopic('子agent 派遣 超时 设置时限 timeoutMinutes', '显式派遣时怎样设置时限')
    expect(result.content).toContain('timeoutMinutes')
    expect(result.content).toContain('30 分钟')
    expect(result.content).toContain('当轮 schema')
  })

  it('重要跨域：剧本采风不会拿检索结果覆盖正式参与者真值', async () => {
    const result = await searchRealTopic('剧本 编剧 派采风 19人会话 没有参与者', '剧本编排与采风的分工')
    expect(result.content).toContain('精确 sessionId')
    expect(result.content).toContain('参与者')
    expect(result.content).toContain('采风不得猜')
  })

  it('基础直达：编剧任务书包含交付物、质量标准与验收条件', async () => {
    const result = await searchRealTopic('编剧 提示词 任务书 要求 标准 验收条件', '给编剧的任务书与验收条件')
    expect(result.content).toContain('必要交付物')
    expect(result.content).toContain('质量标准')
    expect(result.content).toContain('不得用空数组')
    expect(result.content).toContain('机器真值')
  })

  it('重要跨域：星依能精读叙事种子字段审稿与聚焦补交规则', async () => {
    const result = await searchRealTopic('叙事种子 漏填字段 地点格式 地图图纸 开始时间 后台变化 补交', '叙事种子交稿怎样审字段与要求补交')
    expect(result.content).toContain('模型字段固定检查 15 项')
    expect(result.content).toContain('大地点/中地点/小地点')
    expect(result.content).toContain('mapSheetId')
    expect(result.content).toContain('startTime')
    expect(result.content).toContain('聚焦补交')
    expect(result.content).toContain('后台变化')
  })

  it('冷门错误：编剧空交稿不能靠外层连续重派', async () => {
    const result = await searchRealTopic('编剧 submit 绿色勾 空数组 三次重派 失败', '编剧交稿失败与重复派遣')
    expect(result.content).toContain('不等于服务端已经接收')
    expect(result.content).toContain('同一次编剧运行')
    expect(result.content).toContain('不能原样连续重派')
    expect(result.content).toContain('聚焦补交指令')
  })

  it('冷门错误：反复超时应延长或拆分，不能解释成没有资料', async () => {
    const result = await searchRealTopic('每次调用都超时 每次都失败 原始错误 延长重试', '子 Agent 超时后怎样处理')
    expect(result.content).toContain('超时是一种运行结果')
    expect(result.content).toContain('提高')
    expect(result.content).not.toContain('超时就是没有资料')
  })

  it('冷门报错：对应页面未打开能定位并精读正确处置', async () => {
    const result = await searchRealTopic('对应页面未打开', '对应页面未打开')
    expect(result.content).toContain('如实转告用户去打开页面')
  })

  it('多文件知识边界不会把维护 README 或下一文件前言粘进主题全文', async () => {
    const result = await searchRealTopic('知识来源 优先级 冲突处理', '知识来源的优先级')
    expect(result.content).toContain('### 0.5')
    expect(result.content).not.toContain('本文件给维护者阅读')
    expect(result.content).not.toContain('# 星依知识架构')
  })

  it('read 拒绝猜测不存在的 topicId，并引导先 list/search', async () => {
    const tool = createReadXingyiKnowledgeTopicTool()
    const result = await tool.execute({ args: { topicId: '知识库::不存在' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.error.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('不要按标题猜')
  })

  it('负向未命中只引导换词或看目录，不倾倒全目录', async () => {
    const tool = createSearchXingyiKnowledgeTool()
    const result = await tool.execute({ args: { query: 'zzzz不可能命中的词qqqq' } }, { turnIndex: 0 })
    expect(result.details.hitCount).toBe(0)
    expect(result.content).toContain('listXingyiKnowledgeTopics')
    expect(result.content).not.toContain('2.1 文档库与世界书树')
  })
})
