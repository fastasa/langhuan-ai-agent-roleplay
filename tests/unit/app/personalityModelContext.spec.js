import { describe, expect, it } from 'vitest'

import {
  buildPersonalityCandidatePlanPrompt,
  buildPersonalityFinalPrompt,
  buildPersonalityModelContextBundle,
  buildProjectionSceneChangeNotice,
  buildPersonalityRerankerPrompt,
  compressPersonalityContext,
  normalizePersonalityCandidatePlansOutput,
  normalizePersonalityRerankerOutput,
  normalizeProjectionContextItems,
  rankPersonalityPlanCandidates
} from '../../../src/app/personalityModelContext.ts'

describe('personalityModelContext', () => {
  it('builds visible projection context without reading raw chat history', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '星依',
      currentUserInput: '现在怎么办？',
      projections: [
        {
          id: 'projection_1',
          messageId: 1,
          status: 'complete',
          speakerName: '用户',
          audienceNames: ['星依'],
          objectiveFact: '用户在书房告诉星依，门外有人等待。',
          endEnv: { time: '上午九点', locationLarge: '宅邸', locationMiddle: '书房', locationSmall: '窗边' },
          changed: { time: false, location: true }
        },
        {
          id: 'projection_2',
          messageId: 2,
          status: 'failed',
          speakerName: '星依',
          fallbackCleanText: '星依无法确认门外是谁。',
          objectiveFact: '',
          endEnv: { time: '上午九点', location: '宅邸 / 书房 / 窗边' }
        }
      ],
      recallSections: {
        profile: '星依很聪明，但不惯着用户。',
        general: '门外等待者可能牵涉当前冲突。'
      },
      topPlans: [
        { id: 'plan_1', content: '先确认门外身份。' },
        { id: 'plan_2', content: '保持戒备，不直接开门。' },
        { id: 'plan_3', content: '要求用户说明来客来源。' }
      ]
    })

    expect(bundle.projectionContextText).toContain('用户在书房告诉星依')
    expect(bundle.projectionContextText).toContain('星依无法确认门外是谁')
    expect(bundle.projectionContextText).toContain('地点=宅邸 / 书房 / 窗边')
    expect(bundle.projectionContextText.match(/环境：/g)).toHaveLength(1)
    expect(bundle.projectionContextText).not.toContain('[complete]')
    expect(bundle.sourceMaterialText.indexOf('召回结果：')).toBeLessThan(bundle.sourceMaterialText.indexOf('聊天记录投影：'))
    expect(bundle.sourceMaterialText).toContain('星依很聪明')
    expect(bundle.sourceMaterialText).toContain('用户在书房告诉星依')
    expect(bundle.sourceMaterialText).not.toContain('旧长历史原文')
    expect(bundle.finalPrompt.finalPrompt).toContain('【上下文】')
    expect(bundle.finalPrompt.finalPrompt).toContain('先确认门外身份')
  })

  it('compresses context near half size while preserving names, time, place and conflict cues', () => {
    const source = [
      '1. 用户：用户在上午九点抵达宅邸 / 书房 / 窗边。',
      '结束环境：时间=上午九点，地点=宅邸 / 书房 / 窗边',
      '变化：地点变化',
      '2. 星依：星依指出门外等待者和当前冲突有关，需要用户先说明。',
      '3. 无关铺陈：'.repeat(60),
      '现在怎么办？'
    ].join('\n')

    const compressed = compressPersonalityContext(source, {
      currentUserInput: '现在怎么办？',
      minLength: 80,
      maxLength: 260
    })

    expect(compressed.length).toBeLessThan(source.length)
    expect(compressed.length).toBeLessThanOrEqual(320)
    expect(compressed).toContain('用户')
    expect(compressed).toContain('星依')
    expect(compressed).toContain('时间=上午九点')
    expect(compressed).toContain('地点=宅邸 / 书房 / 窗边')
    expect(compressed).toContain('当前冲突')
    expect(compressed).not.toContain('当前用户输入：现在怎么办？')
  })

  it('keeps chat projection lines in source order while compressing', () => {
    const source = [
      '召回结果：',
      '陈星依知道沈志雄刚提出更换衣物。',
      '',
      '聊天记录投影：',
      '开始环境：时间=18:31:45，天气=晴',
      '结束环境：时间=2026-06-08T07:00:00.000Z，地点=灯会 / 戏台下 / 灯会，天气=晴',
      '1. 陈星依：陈星依提醒沈志雄不要靠近。',
      '2. 沈志雄：沈志雄提议先去浴室。',
      '3. 陈星依：陈星依被沈志雄推进浴室。',
      '4. 沈志雄：沈志雄说两小时后出门逛灯会。',
      '5. 旁白：六月夜晚的灯会人群热闹。',
      '6. 陈星依：陈星依在灯会入口主动牵住沈志雄。',
      '7. 沈志雄：沈志雄在灯会戏台下提醒陈星依尼服。',
      '8. 旁白：灯会结束后的清晨，戏台前场地空荡。',
      '9. 陈星依：陈星依清晨仍留在戏台下。',
      '10. 沈志雄：沈志雄继续要求陈星依回应。'
    ].join('\n')

    const compressed = compressPersonalityContext(source, {
      minLength: 80,
      maxLength: 760
    })
    const projectionLines = compressed
      .split('\n')
      .filter((line) => /^\d+\. /.test(line))

    expect(projectionLines).toEqual([
      '1. 陈星依：陈星依被沈志雄推进浴室。',
      '2. 沈志雄：沈志雄说两小时后出门逛灯会。',
      '3. 旁白：六月夜晚的灯会人群热闹。',
      '4. 陈星依：陈星依在灯会入口主动牵住沈志雄。',
      '5. 沈志雄：沈志雄在灯会戏台下提醒陈星依尼服。',
      '6. 旁白：灯会结束后的清晨，戏台前场地空荡。',
      '7. 陈星依：陈星依清晨仍留在戏台下。',
      '8. 沈志雄：沈志雄继续要求陈星依回应。'
    ])
  })

  it('keeps true recall materials inside the half-size personality context', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '星依',
      currentUserInput: '银钥匙怎么办？',
      projections: Array.from({ length: 18 }, (_, index) => ({
        id: `projection_${index + 1}`,
        messageId: index + 1,
        status: 'complete',
        speakerName: index % 2 ? '星依' : '用户',
        audienceNames: ['星依'],
        objectiveFact: `走廊里第 ${index + 1} 条普通事实只用于拉长投影材料，不应挤掉召回资料。`,
        endEnv: { time: '夜晚', locationLarge: '宅邸', locationMiddle: '走廊' }
      })),
      recallSections: {
        profile: '星依知道用户不能直接触碰银钥匙。',
        general: '银钥匙会触发门外契约，是本轮必须参考的角色资料。',
        arrangement: '',
        expression: ''
      }
    })

    expect(bundle.compressedContext).toContain('银钥匙')
    expect(bundle.compressedContext).toContain('门外契约')
    expect(bundle.compressedContext.length).toBeLessThanOrEqual(Math.ceil(bundle.sourceMaterialText.length * 0.6))
  })

  it('candidate and reranker prompts only consume compressed context plus the required current item', () => {
    const compressedContext = '星依知道用户在上午九点位于宅邸 / 书房 / 窗边，门外来客形成当前冲突。'
    const candidatePrompt = buildPersonalityCandidatePlanPrompt({
      characterName: '星依',
      systemPromptPrefix: '注意，你将彻底成为星依。',
      compressedContext,
      currentUserInput: '现在怎么办？',
      planCount: 3,
      strategyLabel: '防御性',
      intensities: ['low', 'medium', 'high']
    })
    const rerankerPrompt = buildPersonalityRerankerPrompt({
      characterName: '星依',
      compressedContext,
      candidatePlan: { id: 'plan_1', content: '先确认门外身份。' }
    })

    expect(candidatePrompt.finalPrompt).toContain(compressedContext)
    expect(candidatePrompt.messages[0].content.startsWith('注意，你将彻底成为星依。')).toBe(true)
    expect(candidatePrompt.finalPrompt).toContain('只根据情境生成 3 条候选计划')
    expect(candidatePrompt.finalPrompt).toContain('本批反应类别：防御性')
    expect(candidatePrompt.finalPrompt).toContain('第三视角表现指令')
    expect(candidatePrompt.finalPrompt).toContain('动作、神态、态度、语气和表达意图')
    expect(candidatePrompt.finalPrompt).toContain('不要写完整台词、引号对白、第一人称独白或可直接发送给用户的回复')
    expect(candidatePrompt.finalPrompt).toContain('情境：')
    expect(candidatePrompt.finalPrompt).not.toContain('方向')
    expect(rerankerPrompt.finalPrompt).toContain('先确认门外身份')
    expect(rerankerPrompt.finalPrompt).toContain('计划：')
    expect(rerankerPrompt.finalPrompt).toContain('score 必须使用评审器原始分数')
    expect(rerankerPrompt.finalPrompt).not.toContain('回复角色')
    expect(rerankerPrompt.finalPrompt).not.toContain('0 到 1')
    expect(rerankerPrompt.finalPrompt).not.toContain('plan_2')
    expect(rerankerPrompt.finalPrompt).not.toContain('旧长历史原文')
  })

  it('合并生成协议：batches 非空时一次声明全部类别×强度，输出模板按声明顺序全列', () => {
    const prompt = buildPersonalityCandidatePlanPrompt({
      characterName: '星依',
      systemPromptPrefix: '注意，你将彻底成为星依。',
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      batches: [
        { strategy: 'aggressive', strategyLabel: '进攻性', intensities: ['low', 'medium', 'high'], planPrompt: '进攻性三档。' },
        { strategy: 'defensive', strategyLabel: '防御性', intensities: ['low', 'medium', 'high'], planPrompt: '防御性三档。' },
        { strategy: 'freeze', strategyLabel: '僵住', intensities: ['low', 'medium', 'high'], planPrompt: '僵住三档。' },
        { strategy: 'avoid', strategyLabel: '逃避', intensities: ['low', 'medium', 'high'], planPrompt: '逃避三档。' }
      ]
    })
    const system = prompt.messages[0].content
    expect(system.startsWith('注意，你将彻底成为星依。')).toBe(true)
    expect(system).toContain('一次性生成 12 条候选计划')
    expect(system).toContain('本次共 4 个反应类别')
    expect(system).toContain('【类别1/4】进攻性（aggressive）')
    expect(system).toContain('【类别4/4】逃避（avoid）')
    expect(system).toContain('任务：防御性三档。')
    expect(system).toContain('plans 数组长度必须等于 12')
    // 输出模板按声明顺序全列（首条=进攻性 low、末条=逃避 high）。
    expect(system).toContain('{"strategy":"aggressive","intensity":"low","content":"计划正文"}')
    expect(system).toContain('{"strategy":"avoid","intensity":"high","content":"计划正文"}')
    expect(system.indexOf('"aggressive"')).toBeLessThan(system.indexOf('"avoid"'))
    // 共同规则保留（计划口吻/禁台词）。
    expect(system).toContain('第三视角表现指令')
    expect(system).toContain('不要写完整台词、引号对白、第一人称独白或可直接发送给用户的回复')
  })

  it('合并生成协议：batches 单项单强度（normal_recall）与旧单批语义等价、总数为 1', () => {
    const prompt = buildPersonalityCandidatePlanPrompt({
      compressedContext: '已整合情境',
      batches: [{ strategy: 'single_reply', strategyLabel: '单计划', intensities: ['default'], planPrompt: '生成一个回复计划。' }]
    })
    const system = prompt.messages[0].content
    expect(system).toContain('一次性生成 1 条候选计划')
    expect(system).toContain('本次共 1 个反应类别')
    expect(system).toContain('plans 数组长度必须等于 1')
  })

  it('builds scene change notice from previous message env to current user input env and injects it into plan prompt', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '星依',
      currentUserInput: '你怎么不说话了？',
      projections: [
        {
          id: 'projection_1',
          messageId: 10,
          status: 'complete',
          speakerName: '星依',
          objectiveFact: '星依在周一夜晚回应用户。',
          endEnv: { time: '周一夜晚', locationLarge: '宅邸', locationMiddle: '书房' }
        },
        {
          id: 'projection_2',
          messageId: 11,
          status: 'complete',
          speakerName: '用户',
          objectiveFact: '用户隔了三天后再次对星依说话。',
          startEnv: { time: '周四清晨', locationLarge: '宅邸', locationMiddle: '庭院' },
          endEnv: { time: '周四清晨', locationLarge: '宅邸', locationMiddle: '庭院' },
          changed: { time: false, location: false }
        }
      ]
    })

    expect(buildProjectionSceneChangeNotice(bundle.projectionItems)).toBe(bundle.sceneChangeNotice)
    expect(bundle.sceneChangeNotice).toContain('上一条可见消息环境：时间=周一夜晚，地点=宅邸 / 书房')
    expect(bundle.sceneChangeNotice).toContain('本次用户输入开始环境：时间=周四清晨，地点=宅邸 / 庭院')
    expect(bundle.sceneChangeNotice).toContain('时间从「周一夜晚」变为「周四清晨」')
    expect(bundle.sceneChangeNotice).toContain('地点从「宅邸 / 书房」变为「宅邸 / 庭院」')
    expect(bundle.sourceMaterialText).toContain('场景变化提醒：')
    expect(bundle.compressedContext).toContain('场景变化提醒：')
    expect(bundle.candidatePlanPrompt.finalPrompt).toContain('场景变化提醒：')
    // #3：脏串「生成候选计划时必须承接这些时间地点差异…」已从场景变化提醒里删除（时间地点差异事实仍在）。
    expect(bundle.sceneChangeNotice).not.toContain('生成候选计划时必须承接这些时间地点差异')
  })

  it('final prompt exposes only allowed personality model materials', () => {
    const finalPrompt = buildPersonalityFinalPrompt({
      characterName: '星依',
      characterIdentity: '星依是聪明、挑剔的女儿。',
      promptLibrarySystemPrompt: '你只能扮演星依。\n动作描写用$包裹。',
      scenarioMountedPromptText: '使用更明亮的短句，句尾可以轻轻上扬。\n示例：太好啦，用户。',
      compressedContext: '投影事实：用户在书房等待回答。',
      topPlans: [
        { content: '先指出风险。', score: 0.92 },
        { content: '再给可执行建议。', score: 0.88 },
        { content: '最后追问缺口。', score: 0.8 },
        { content: '第四计划不得进入。', score: 0.7 }
      ],
      currentUserInput: '继续。',
      sceneChangeNotice: '地点仍在书房。'
    })

    expect(finalPrompt.finalPrompt).toContain('投影事实')
    expect(finalPrompt.finalPrompt).toContain('【提示词库系统提示词】')
    expect(finalPrompt.finalPrompt).toContain('你只能扮演星依')
    expect(finalPrompt.finalPrompt).toContain('使用更明亮的短句，句尾可以轻轻上扬。')
    expect(finalPrompt.finalPrompt).toContain('示例：太好啦，用户。')
    expect(finalPrompt.finalPrompt).not.toContain('挂载提示词')
    expect(finalPrompt.finalPrompt).toContain('先指出风险')
    expect(finalPrompt.finalPrompt).toContain('融合这三条计划')
    expect(finalPrompt.finalPrompt).toContain('不要逐条复述计划')
    expect(finalPrompt.finalPrompt).toContain('地点仍在书房')
    expect(finalPrompt.finalPrompt).not.toContain('你只能依据身份底座、上下文、前三计划、当前用户输入和必要场景变化提醒回复')
    expect(finalPrompt.finalPrompt).not.toContain('提示词库系统提示词只作为角色身份、表达风格和回复约束使用')
    expect(finalPrompt.finalPrompt).not.toContain('上下文是为当前回复角色整理后的聊天记录与必要资料')
    expect(finalPrompt.finalPrompt).not.toContain('第四计划不得进入')
    expect(finalPrompt.finalPrompt).not.toContain('score')
    expect(finalPrompt.finalPrompt).not.toContain('旧长历史原文')
  })

  it('#2 计划融合/禁自由发挥/表达占比结构指令移到 user 消息、紧跟前三计划与表达占比之后（不在系统消息）', () => {
    const finalPrompt = buildPersonalityFinalPrompt({
      characterName: '星依',
      characterIdentity: '星依身份。',
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }, { content: '计划二' }, { content: '计划三' }],
      expressionMix: { action: 40, dialogue: 35, expression: 20, innerState: 5, narration: 0 },
      currentUserInput: '继续。'
    })
    const sys = finalPrompt.messages[0].content
    const user = finalPrompt.messages[1].content
    // 硬指令已从系统消息移到 user 消息。
    expect(sys).not.toContain('禁止脱离计划自由发挥')
    expect(sys).not.toContain('请融合这三条计划')
    expect(sys).not.toContain('不要输出占比数字')
    expect(user).toContain('禁止脱离计划自由发挥')
    // 紧跟在前三计划与表达占比之后。
    expect(user.indexOf('【前三计划】')).toBeLessThan(user.indexOf('请融合这三条计划'))
    expect(user.indexOf('【表达占比】')).toBeLessThan(user.indexOf('禁止脱离计划自由发挥'))
    expect(user.indexOf('禁止脱离计划自由发挥')).toBeLessThan(user.indexOf('【当前用户输入】'))
  })

  it('#6 挂载提示词去重：占位已吸收不重复注入；占位缺失则直接注入（保证配了必注入）', () => {
    const mounted = '使用更明亮的短句。'
    const withLibrary = buildPersonalityFinalPrompt({
      characterName: '星依',
      promptLibrarySystemPrompt: `你只能扮演星依。\n${mounted}`,
      scenarioMountedPromptText: mounted,
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }],
      currentUserInput: '继续。'
    })
    // 占位已把挂载文本吸收进 promptLibrary：系统消息里只出现一次，不重复直接注入。
    expect(withLibrary.messages[0].content.split(mounted).length - 1).toBe(1)
    const noLibrary = buildPersonalityFinalPrompt({
      characterName: '星依',
      promptLibrarySystemPrompt: '你只能扮演星依。',
      scenarioMountedPromptText: mounted,
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }],
      currentUserInput: '继续。'
    })
    // 占位缺失（promptLibrary 不含挂载文本）→ 直接注入，保证不丢。
    expect(noLibrary.messages[0].content).toContain(mounted)
  })

  it('final prompt 展示前三计划 + 表达占比 + 融合指示（批次4 去融合）', () => {
    const finalPrompt = buildPersonalityFinalPrompt({
      characterName: '星依',
      compressedContext: '用户在书房等待回答。',
      topPlans: [
        { id: 'plan_1', content: '先停顿观察。' },
        { id: 'plan_2', content: '再用短句说明边界。' },
        { id: 'plan_3', content: '保留戒备神态。' }
      ],
      expressionMix: { action: 40, dialogue: 35, expression: 20, innerState: 5, narration: 0 },
      currentUserInput: '继续。'
    })

    expect(finalPrompt.finalPrompt).toContain('【前三计划】')
    expect(finalPrompt.finalPrompt).toContain('先停顿观察')
    expect(finalPrompt.finalPrompt).toContain('融合这三条计划')
    expect(finalPrompt.finalPrompt).toContain('【表达占比】')
    expect(finalPrompt.finalPrompt).toContain('动作 40%，语言 35%，神态 20%，心理 5%，旁白 0%')
    expect(finalPrompt.finalPrompt).toContain('不要输出占比数字、百分号、计划 ID 或内部字段')
    expect(finalPrompt.finalPrompt).not.toContain('【回复计划融合结果】')
  })

  it('缺少合法 expressionMix 时只展示前三计划、不展示表达占比块', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '星依',
      compressedContext: '用户在书房等待回答。',
      topPlans: [
        { id: 'plan_1', content: '先指出风险。' },
        { id: 'plan_2', content: '再给可执行建议。' },
        { id: 'plan_3', content: '最后追问缺口。' }
      ],
      expressionMix: null,
      currentUserInput: '继续。'
    })

    expect(bundle.finalPrompt.finalPrompt).toContain('【前三计划】')
    expect(bundle.finalPrompt.finalPrompt).toContain('先指出风险')
    expect(bundle.finalPrompt.finalPrompt).not.toContain('【表达占比】')
  })

  it('字数建议：提调给了区间就用区间（≥500），缺失则按默认 800–1200 兜底（软建议、始终注入）', () => {
    const explicit = buildPersonalityFinalPrompt({
      characterName: '星依',
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }],
      wordCountAdvice: { min: 600, max: 900 },
      currentUserInput: '继续。'
    })
    expect(explicit.finalPrompt).toContain('600–900 字')
    expect(explicit.finalPrompt).toContain('篇幅建议不是硬性限制')
    // 低于硬下限 500 → 抬到 500（同值上下限渲染「500 字左右」）。
    const floored = buildPersonalityFinalPrompt({
      characterName: '星依',
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }],
      wordCountAdvice: { min: 200, max: 360 },
      currentUserInput: '继续。'
    })
    expect(floored.finalPrompt).toContain('500 字左右')
    // 缺省（提调未给）→ 默认 800–1200 兜底，最终回复一律带篇幅建议。
    const fallback = buildPersonalityFinalPrompt({
      characterName: '星依',
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }],
      currentUserInput: '继续。'
    })
    expect(fallback.finalPrompt).toContain('800–1200 字')
    // 非法区间（min>max）也回退默认，不把脏数据写进提示词。
    const invalid = buildPersonalityFinalPrompt({
      characterName: '星依',
      compressedContext: '上下文。',
      topPlans: [{ content: '计划一' }],
      wordCountAdvice: { min: 900, max: 100 },
      currentUserInput: '继续。'
    })
    expect(invalid.finalPrompt).toContain('800–1200 字')
  })

  it('cleans prompt-only headings and keeps current input only in the final input block', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '陈星依',
      currentUserInput: '你好。',
      projections: [
        {
          id: 'projection_1',
          messageId: 1,
          status: 'complete',
          speakerName: '沈志雄',
          audienceNames: ['陈星依'],
          objectiveFact: '沈志雄对陈星依说“你好”。'
        }
      ],
      recallSections: {
        profile: [
          '【当前人物资料】',
          '【当前人物】',
          '名称：陈星依',
          '## 简介',
          '陈星依来自亚什基诺，是用户的养女。',
          '【表达核心】',
          '## 说话风格',
          '直率，语速偏快。'
        ].join('\n'),
        general: '',
        arrangement: '',
        expression: ''
      },
      topPlans: [
        { content: '自然回应问候。' },
        { content: '表现出见到对方的亲近。' },
        { content: '顺势询问来意。' }
      ]
    })

    expect(bundle.sourceMaterialText).toContain('召回结果：')
    expect(bundle.sourceMaterialText).toContain('聊天记录投影：')
    expect(bundle.sourceMaterialText.indexOf('召回结果：')).toBeLessThan(bundle.sourceMaterialText.indexOf('聊天记录投影：'))
    expect(bundle.sourceMaterialText).not.toContain('【当前人物资料】')
    expect(bundle.sourceMaterialText).not.toContain('【当前人物】')
    expect(bundle.sourceMaterialText).not.toContain('## 简介')
    expect(bundle.sourceMaterialText).not.toContain('## 说话风格')
    expect(bundle.compressedContext).toContain('召回结果：')
    expect(bundle.compressedContext).toContain('聊天记录投影：')
    expect(bundle.compressedContext).not.toContain('【')
    expect(bundle.compressedContext).not.toContain('##')
    expect(bundle.compressedContext).not.toContain('当前用户输入：你好。')
    expect(bundle.compressedContext).not.toContain('\n你好。')

    const finalUserText = bundle.finalPrompt.messages.find((message) => message.role === 'user')?.content || ''
    expect(finalUserText.match(/【当前用户输入】/g)).toHaveLength(1)
    expect(finalUserText.trim().endsWith('你好。')).toBe(true)
  })

  it('summarizes projection environments once for the context window', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '陈星依',
      currentUserInput: '继续。',
      projections: [
        {
          id: 'projection_1',
          messageId: 1,
          status: 'complete',
          speakerName: '沈志雄',
          audienceNames: ['陈星依'],
          objectiveFact: '沈志雄对陈星依说“你好”。',
          startEnv: { time: '14:01:27', location: '维斯珂', weather: '雾' },
          endEnv: { time: '14:01:27', location: '维斯珂', weather: '雾' },
          changed: { time: false, location: false }
        },
        {
          id: 'projection_2',
          messageId: 2,
          status: 'complete',
          speakerName: '陈星依',
          audienceNames: ['沈志雄'],
          objectiveFact: '陈星依回应沈志雄的问候。',
          startEnv: { time: '14:01:27', location: '维斯珂', weather: '雾' },
          endEnv: { time: '01:21:07', location: '维斯珂', weather: '雾' },
          changed: { time: true, location: false }
        },
        {
          id: 'projection_3',
          messageId: 3,
          status: 'complete',
          speakerName: '沈志雄',
          audienceNames: ['陈星依'],
          objectiveFact: '沈志雄继续与陈星依交谈。',
          startEnv: { time: '01:21:07', location: '维斯珂', weather: '雾' },
          endEnv: { time: '01:32:32', location: '维斯珂', weather: '雾' },
          changed: { time: true, location: false }
        }
      ]
    })

    expect(bundle.projectionContextText.match(/开始环境：/g)).toHaveLength(1)
    expect(bundle.projectionContextText.match(/结束环境：/g)).toHaveLength(1)
    expect(bundle.projectionContextText).toContain('开始环境：时间=14:01:27')
    expect(bundle.projectionContextText).toContain('结束环境：时间=01:32:32')
    expect(bundle.projectionContextText.match(/维斯珂/g)?.length).toBeLessThanOrEqual(2)
  })

  it('批次4：注入滚动会话记忆摘要，排在召回/投影之前且经压缩保留', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '星依',
      currentUserInput: '继续。',
      sessionMemorySummary: '前期：星依与用户到达山庄，见到神秘老人，约定天黑前查清真相。',
      projections: [
        {
          id: 'projection_1',
          messageId: 1,
          status: 'complete',
          speakerName: '用户',
          audienceNames: ['星依'],
          objectiveFact: '用户提醒星依注意脚下。',
          endEnv: { time: '夜晚', location: '山庄 / 大厅' },
          changed: { time: false, location: false }
        }
      ]
    })

    expect(bundle.sourceMaterialText).toContain('会话记忆摘要：')
    expect(bundle.sourceMaterialText).toContain('见到神秘老人')
    // 记忆块排在召回结果之前
    expect(bundle.sourceMaterialText.indexOf('会话记忆摘要：')).toBeLessThan(bundle.sourceMaterialText.indexOf('召回结果：'))
    // 经压缩仍保留（requiredHints 保护）
    expect(bundle.compressedContext).toContain('会话记忆摘要：')
    expect(bundle.compressedContext).toContain('见到神秘老人')
  })

  it('批次4：无会话记忆摘要时不注入记忆块（零回归）', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '星依',
      currentUserInput: '继续。',
      projections: [
        { id: 'p1', messageId: 1, status: 'complete', speakerName: '用户', audienceNames: ['星依'], objectiveFact: '用户说话。', endEnv: { time: '夜晚' }, changed: { time: false, location: false } }
      ]
    })
    expect(bundle.sourceMaterialText).not.toContain('会话记忆摘要：')
  })

  it('normalizes projection rows from repository field shapes', () => {
    const items = normalizeProjectionContextItems([{
      id: 'projection_1',
      message_id: 8,
      status: 'partial',
      speaker_name: '旁白',
      audience_names_json: '["星依"]',
      objective_fact: '旁白说明时间来到夜晚。',
      end_env_json: '{"time":"夜晚","locationLarge":"宅邸"}',
      changed_json: '{"time":true}'
    }])

    expect(items).toEqual([expect.objectContaining({
      id: 'projection_1',
      messageId: 8,
      speakerName: '旁白',
      audienceNames: ['星依'],
      fact: '旁白说明时间来到夜晚。',
      endEnv: expect.objectContaining({ time: '夜晚', locationLarge: '宅邸' }),
      changed: { time: true, location: false }
    })])
  })

  it('sorts projection context by source message order before numbering', () => {
    const bundle = buildPersonalityModelContextBundle({
      characterName: '陈星依',
      currentUserInput: '继续。',
      projections: [
        {
          id: 'projection_5',
          messageId: 5,
          status: 'complete',
          speakerName: '陈星依',
          objectiveFact: '陈星依整理好衣服后准备回答。'
        },
        {
          id: 'projection_3',
          messageId: 3,
          status: 'complete',
          speakerName: '陈星依',
          objectiveFact: '陈星依换完衣服。'
        },
        {
          id: 'projection_4',
          messageId: 4,
          status: 'complete',
          speakerName: '沈志雄',
          objectiveFact: '沈志雄说两小时后出门。'
        }
      ]
    })

    expect(bundle.projectionContextText).toContain([
      '1. 陈星依：陈星依换完衣服。',
      '2. 沈志雄：沈志雄说两小时后出门。',
      '3. 陈星依：陈星依整理好衣服后准备回答。'
    ].join('\n'))
  })

  it('normalizes legacy fixed-batch 15 candidate plans and ranks by ReRanker scores', () => {
    const plans = normalizePersonalityCandidatePlansOutput(JSON.stringify({
      plans: Array.from({ length: 15 }, (_, index) => ({
        id: `plan_${index + 1}`,
        content: `候选计划 ${index + 1}`
      }))
    }))
    const scores = plans.map((plan, index) => normalizePersonalityRerankerOutput(JSON.stringify({
      candidateId: plan.id,
      score: index === 7 ? 3.25 : -index
    }), plan.id))
    const topPlans = rankPersonalityPlanCandidates(plans, scores, 3)

    expect(plans).toHaveLength(15)
    expect(topPlans[0]).toEqual(expect.objectContaining({
      id: 'plan_8',
      score: 3.25
    }))
    expect(normalizePersonalityRerankerOutput('{"score":-0.42}', 'plan_x')).toEqual({
      candidateId: 'plan_x',
      score: -0.42
    })
  })

  it('recovers real legacy fixed-batch candidate plans from malformed model JSON without inventing plans', () => {
    const malformed = `{
      "plans": [
        ${Array.from({ length: 15 }, (_, index) => {
          const suffix = index === 4 ? '\n继续保持计划口吻' : ''
          return `{"content": "候选计划 ${index + 1}${suffix}"}`
        }).join('\n        ')}
      ]
    }`

    const plans = normalizePersonalityCandidatePlansOutput(malformed)

    expect(plans).toHaveLength(15)
    expect(plans[0]).toEqual(expect.objectContaining({
      id: 'plan_1',
      content: '候选计划 1'
    }))
    expect(plans[4]).toEqual(expect.objectContaining({
      id: 'plan_5',
      content: '候选计划 5 继续保持计划口吻'
    }))
  })

  it('accepts legacy fixed-batch direct string candidate arrays from the model', () => {
    const plans = normalizePersonalityCandidatePlansOutput(JSON.stringify({
      plans: Array.from({ length: 15 }, (_, index) => `候选计划 ${index + 1}`)
    }))

    expect(plans).toHaveLength(15)
    expect(plans[14]).toEqual(expect.objectContaining({
      id: 'plan_15',
      content: '候选计划 15'
    }))
  })

  it('rejects unstable legacy fixed-batch candidate or ReRanker output instead of treating it as success', () => {
    expect(() => normalizePersonalityCandidatePlansOutput('{"plans":[{"content":"只有一条"}]}')).toThrow('不足 15 条')
    expect(() => normalizePersonalityCandidatePlansOutput('{"plans":[{"content":"只有一条"}')).toThrow('解析失败')
    expect(() => normalizePersonalityRerankerOutput('{"score":"高"}', 'plan_1')).toThrow('有效 score')
    expect(() => rankPersonalityPlanCandidates([{ id: 'plan_1', content: '计划' }], [])).toThrow('评分数量不匹配')
  })
})
