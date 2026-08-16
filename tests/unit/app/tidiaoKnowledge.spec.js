import { describe, it, expect } from 'vitest'
import {
  buildTidiaoCharacterPlanningPriority,
  buildTidiaoKnowledgeInjection,
  buildTidiaoKnowledgeIndex,
  matchTidiaoEnvironmentManualSelectors
} from '@/app/agentKnowledge/tidiaoKnowledge'

// 支线②·提调知识库渐进披露：恒注入身份/口吻/能力清单/速览索引，环境细节按当轮关键词命中注入。
// 批D·D2（2026-07-12·缓存重排）：buildTidiaoKnowledgeInjection 返回值拆成 { constantBlock, matchedEnvBlock }
// （此前是拼成一个字符串）——constantBlock=恒定部分（system 层0 用），matchedEnvBlock=命中环境节（随语料变化·
// user 侧靠后位置用）。以下断言按新返回形状分别核对两块，文本内容口径不变。
describe('提调知识库·渐进披露注入', () => {
  it('selector 匹配只返回小节键，供授权后的 loader 再读取正文', () => {
    expect(matchTidiaoEnvironmentManualSelectors({ userText: '把右上角地点改成宾馆，再建一张状态栏' }))
      .toEqual(expect.arrayContaining(['2.4', '2.15']))
  })
  it('恒注入身份+过程输出口吻+能力清单+速览索引（均在 constantBlock）', () => {
    const { constantBlock } = buildTidiaoKnowledgeInjection({ userText: '你好' })
    expect(constantBlock).toContain('提调知识库·按需披露') // 注入头
    expect(constantBlock).toContain('过程输出口吻') // 第一节·口吻（人设要点）
    expect(constantBlock).toContain('优雅') // 神女气质
    expect(constantBlock).toContain('能力清单') // 第三节·能做/做不到
    expect(constantBlock).toContain('速览索引') // 2.0 索引
    expect(constantBlock).toContain('先识别运行形态')
    expect(constantBlock).toContain('普通前置统筹')
    expect(constantBlock).toContain('快速回复/动作输入后的轮后收束')
    expect(constantBlock).toContain('动作输入前台规划')
    expect(constantBlock).toContain('你不写最终正文')
    expect(constantBlock).toContain('角色计划与方向：性格第一')
    expect(constantBlock).toContain('角色性格是最高优先级的创作判断')
  })

  it('精简规划入口从常驻知识唯一真值单取性格优先规则', () => {
    const block = buildTidiaoCharacterPlanningPriority()
    expect(block).toContain('角色计划与方向：性格第一')
    expect(block).toContain('普通统筹、快速回复、动作输入、轮后补演、纠偏重排')
    expect(block).toContain('不能为了剧情需要让角色瞬间换人格')
    expect(block).not.toContain('过程输出口吻')
  })

  it('快速回复、动作输入和轮后信号会按需加载回复链路模式说明', () => {
    for (const text of ['快速回复后开始轮后审计', '这是一条动作输入', '只做轮后核账', '只生成写作计划与表达占比']) {
      expect(matchTidiaoEnvironmentManualSelectors({ directives: [text] })).toContain('2.13')
    }
  })

  it('两块都不泄露维护者用的「真值来源」行', () => {
    const { constantBlock, matchedEnvBlock } = buildTidiaoKnowledgeInjection({ userText: '帮我改右上角地点' })
    expect(constantBlock).not.toContain('真值来源')
    expect(matchedEnvBlock).not.toContain('真值来源')
  })

  it('当轮提到「改右上角地点」→ matchedEnvBlock 按需补「帷幕」小节细节（constantBlock 不含）', () => {
    const { constantBlock, matchedEnvBlock } = buildTidiaoKnowledgeInjection({ userText: '把右上角的地点改到宾馆' })
    expect(matchedEnvBlock).toContain('改帷幕 ≠ 改消息原文里的时间词') // 2.4 帷幕小节独有
    expect(constantBlock).not.toContain('改帷幕 ≠ 改消息原文里的时间词')
  })

  it('当轮提到旁白 → matchedEnvBlock 按需补「旁白」小节细节', () => {
    const { matchedEnvBlock } = buildTidiaoKnowledgeInjection({ userText: '这一轮安排一条旁白承接环境' })
    expect(matchedEnvBlock).toContain('旁白是什么') // 2.8 旁白小节标题正文
  })

  it('无关话题不拉入无关环境小节（如显示与渲染）：matchedEnvBlock 为空', () => {
    const { matchedEnvBlock } = buildTidiaoKnowledgeInjection({ userText: '你好' })
    expect(matchedEnvBlock).toBe('')
    expect(matchedEnvBlock).not.toContain('动作美化符号') // 2.14 独有，不该被无关话题拉入
  })

  it('提调指令命中也触发按需披露（不只看 userText）', () => {
    const { matchedEnvBlock } = buildTidiaoKnowledgeInjection({ userText: '', directives: ['把场景时间快进到傍晚'] })
    expect(matchedEnvBlock).toContain('改帷幕 ≠ 改消息原文里的时间词') // 「时间」命中 2.4
  })

  // 增量4（2026-07-01·层1承载 2.0 索引）：群聊统筹路 includeEnvIndex:false 时知识块不带 2.0 索引，索引改由层1渲染。
  it('includeEnvIndex:false 时 constantBlock 不含 2.0 速览索引（身份/口吻/能力清单仍在）', () => {
    const { constantBlock } = buildTidiaoKnowledgeInjection({ userText: '你好' }, { includeEnvIndex: false })
    expect(constantBlock).toContain('过程输出口吻') // 第一节仍在
    expect(constantBlock).toContain('能力清单') // 第三节仍在
    expect(constantBlock).not.toContain('速览索引') // 2.0 索引改由层1承载，此处不带
  })

  // 层0 任务化（2026-07-05）：纠偏/精修轮 includeCapability:false 撤掉第三节统筹能力清单（能力真值=层1 本轮真注册工具）。
  it('includeCapability:false 时 constantBlock 不含第三节能力清单，导语改指向层1 工具清单', () => {
    const { constantBlock } = buildTidiaoKnowledgeInjection({ userText: '你好' }, { includeEnvIndex: false, includeCapability: false })
    expect(constantBlock).toContain('过程输出口吻') // 第一节仍在
    expect(constantBlock).not.toContain('三、你能操作什么') // 第三节（统筹工具清单）撤掉
    expect(constantBlock).not.toContain('finishRound') // 统筹决策工具不再出现在纠偏轮知识块
    expect(constantBlock).toContain('以【1·可调用资料】里本轮真注册的工具清单为准') // 导语指向层1 能力真值
  })

  it('buildTidiaoKnowledgeIndex 单取 2.0 速览索引（含各环境小节地图·不含身份/能力清单）', () => {
    const index = buildTidiaoKnowledgeIndex()
    expect(index).toContain('速览索引')
    expect(index).toContain('帷幕') // 2.x 环境小节名出现在索引表里
    expect(index).not.toContain('过程输出口吻') // 只取索引，不含第一节
    expect(index).not.toContain('真值来源') // 维护者行已剔除
  })
})
