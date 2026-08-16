import { describe, expect, it } from 'vitest'

import {
  EMBEDDED_MESSAGE_PROJECTION_END,
  EMBEDDED_MESSAGE_PROJECTION_START,
  buildEmbeddedMessageProjectionInstruction,
  buildMessageProjectionPrompt,
  cleanMessageProjectionSourceText,
  normalizeMessageProjectionAgentOutput,
  parseEmbeddedMessageProjectionOutput,
  stripEmbeddedMessageProjectionFromVisibleText
} from '../../../src/app/messageProjectionAgent.ts'

describe('messageProjectionAgent', () => {
  it('只带紧邻前两条投影，并明确马甲身份、楼层说话人与省略主语边界', () => {
    const prompt = buildMessageProjectionPrompt({
      sessionId: 'session_1',
      message: {
        id: 9,
        role: 'user',
        messageKind: 'chat',
        content: '<think>隐藏思考</think>你刚才说她会来。',
        speakerId: 'user',
        speakerName: '月城凛夜',
        userIdentityName: '月城凛夜',
        audienceIds: ['char_xingyi'],
        audienceNames: ['三轮霞', '星依'],
        env: { time: '上午', location: '书房' }
      },
      participants: [{ id: 'char_xingyi', name: '星依', role: 'member' }],
      previousProjections: Array.from({ length: 6 }, (_, index) => ({
        id: `projection_${index}`,
        messageId: index + 1,
        speakerName: index === 5 ? '五条悟' : '旁白',
        objectiveFact: `事实 ${index}`
      }))
    })

    expect(prompt.messages).toHaveLength(2)
    expect(prompt.finalPrompt).toContain('不要写 JSON')
    expect(prompt.finalPrompt).toContain('固定输出三行')
    expect(prompt.finalPrompt).toContain('你刚才说她会来。')
    expect(prompt.finalPrompt).toContain('说话人：月城凛夜')
    expect(prompt.finalPrompt).toContain('当前用户扮演身份：月城凛夜')
    expect(prompt.finalPrompt).toContain('省略的行动主语默认指“月城凛夜”')
    expect(prompt.finalPrompt).toContain('#5 [旁白] 事实 4')
    expect(prompt.finalPrompt).toContain('#6 [五条悟] 事实 5')
    expect(prompt.finalPrompt).not.toContain('事实 3')
    expect(prompt.finalPrompt).not.toContain('三轮霞')
    expect(prompt.finalPrompt).not.toContain('projection_')
    expect(prompt.finalPrompt).not.toContain('sourceProjectionIds')
  })

  it('复现 #6046：跟着他走应拿月城凛夜身份和五条悟前文，不注入全会话成员', () => {
    const prompt = buildMessageProjectionPrompt({
      sessionId: 'session_shibuya',
      message: {
        id: 6046,
        role: 'user',
        messageKind: 'chat',
        content: '跟着他走',
        speakerId: 'user',
        speakerName: '月城凛夜',
        userIdentityName: '月城凛夜',
        audienceNames: ['三轮霞', '庵歌姬', '五条悟'],
        env: { time: '01:08:14', location: '涩谷高处夜景与周边小店' }
      },
      participants: [],
      previousProjections: [
        {
          id: 'projection_6037',
          messageId: 6037,
          speakerName: '旁白',
          objectiveFact: '月城凛夜在涩谷街头看见一名高挑白发身影。'
        },
        {
          id: 'projection_6038',
          messageId: 6038,
          speakerName: '五条悟',
          objectiveFact: '五条悟表示可以带路，并引导月城凛夜走向更热闹的街道。'
        }
      ]
    })

    expect(prompt.finalPrompt).toContain('说话人：月城凛夜')
    expect(prompt.finalPrompt).toContain('消息原文：\n跟着他走')
    expect(prompt.finalPrompt).toContain('#6038 [五条悟] 五条悟表示可以带路')
    expect(prompt.finalPrompt).toContain('默认是当前身份选择并执行该行动')
    expect(prompt.finalPrompt).not.toContain('沈志雄')
    expect(prompt.finalPrompt).not.toContain('三轮霞')
    expect(prompt.finalPrompt).not.toContain('庵歌姬')
  })

  it('normalizes three-line plain model output into projection fields', () => {
    const result = normalizeMessageProjectionAgentOutput([
      '事实：陈星依对沈志雄的问候感到意外，询问是否有事情，并把雾天联想到秘密任务。',
      '变化：无',
      '不确定：无'
    ].join('\n'), {
      id: 11,
      role: 'assistant',
      messageKind: 'chat',
      content: '“哈？用户怎么突然这么正式跟星依说你好呀？”',
      speakerId: 'char_xingyi',
      speakerName: '陈星依',
      audienceIds: ['user'],
      audienceNames: ['沈志雄'],
      env: { time: '01:21:07', location: '维斯珂', weather: '雾' }
    })

    expect(result).toMatchObject({
      status: 'complete',
      speakerId: 'char_xingyi',
      speakerName: '陈星依',
      audienceIds: ['user'],
      audienceNames: ['沈志雄'],
      participants: ['陈星依', '沈志雄'],
      objectiveFact: '陈星依对沈志雄的问候感到意外，询问是否有事情，并把雾天联想到秘密任务。',
      changed: { time: false, location: false },
      failureReason: ''
    })
  })

  it('tolerates markdown and bullet decoration around the user-message projection labels', () => {
    const result = normalizeMessageProjectionAgentOutput([
      '**事实**：星依笑着答应用户，会去书房等林雪云。',
      '- 变化：无',
      '1. 不确定：无'
    ].join('\n'), {
      id: 13,
      role: 'user',
      messageKind: 'chat',
      content: '我去书房等她。',
      speakerName: '用户',
      audienceNames: ['星依'],
      env: { time: '上午', location: '书房' }
    })

    expect(result.status).toBe('complete')
    expect(result.objectiveFact).toBe('星依笑着答应用户，会去书房等林雪云。')
    expect(result.changed).toEqual({ time: false, location: false })
  })

  it('caps overlong projection facts after parsing', () => {
    const longFact = '陈星依'.repeat(80)
    const result = normalizeMessageProjectionAgentOutput([
      `事实：${longFact}`,
      '变化：无',
      '不确定：无'
    ].join('\n'), {
      id: 12,
      role: 'assistant',
      messageKind: 'chat',
      content: longFact,
      speakerName: '陈星依',
      audienceNames: ['沈志雄'],
      env: { location: '维斯珂' }
    })

    expect(result.objectiveFact.length).toBeLessThanOrEqual(180)
    expect(result.objectiveFact.endsWith('…')).toBe(true)
  })

  it('normalizes complete model output into projection fields', () => {
    const result = normalizeMessageProjectionAgentOutput(`\`\`\`json
{
  "status": "complete",
  "speakerName": "用户",
  "audienceNames": ["星依"],
  "participants": ["用户", "星依"],
  "objectiveFact": "用户告诉星依，林雪云稍后会来书房。",
  "startEnv": { "time": "上午", "location": "书房" },
  "endEnv": { "time": "上午", "location": "书房" },
  "changed": { "time": false, "location": false },
  "sourceProjectionIds": ["projection_1"]
}
\`\`\``, {
      id: 9,
      role: 'user',
      messageKind: 'chat',
      content: '她会来。',
      speakerName: '用户',
      env: { time: '上午', location: '书房' }
    })

    expect(result).toMatchObject({
      status: 'complete',
      speakerName: '用户',
      audienceNames: ['星依'],
      objectiveFact: '用户告诉星依，林雪云稍后会来书房。',
      changed: { time: false, location: false },
      sourceProjectionIds: ['projection_1']
    })
  })

  it('marks unlabeled model output as failed with clean fallback text', () => {
    const result = normalizeMessageProjectionAgentOutput('不是 JSON', {
      id: 10,
      role: 'assistant',
      messageKind: 'chat',
      content: '<think>推理</think>\n调试信息：不用看\n星依说：知道了。',
      speakerName: '星依',
      env: { time: '夜里' }
    })

    expect(result.status).toBe('failed')
    expect(result.failureStage).toBe('parse_output')
    expect(result.failureReason).toContain('事实')
    expect(result.fallbackCleanText).toBe('星依说：知道了。')
  })

  it('cleans think blocks and debug prefixes from source text', () => {
    expect(cleanMessageProjectionSourceText('<think>过程</think>\n旁白调试：不用看\n风声很大。')).toBe('风声很大。')
  })

  it('用户消息：剥离私密提调指令【【…】】，投影源文本不带进角色/旁白', () => {
    expect(cleanMessageProjectionSourceText('好的我们走吧【【提调：让她主动表白】】', { isUserMessage: true })).toBe('好的我们走吧')
    // 单层【】是正常正文，不剥离
    expect(cleanMessageProjectionSourceText('他打开了【机关】', { isUserMessage: true })).toBe('他打开了【机关】')
  })

  it('非用户消息（角色）：双层【【…】】是内心独白，必须完整保留进投影，不剥离', () => {
    // 不传 isUserMessage（默认 false）或显式 false，都不剥离双层括号
    expect(cleanMessageProjectionSourceText('他笑了笑【【她其实早就猜到了】】')).toBe('他笑了笑【【她其实早就猜到了】】')
    expect(cleanMessageProjectionSourceText('他笑了笑【【她其实早就猜到了】】', { isUserMessage: false })).toBe('他笑了笑【【她其实早就猜到了】】')
  })

  it('parses embedded projection block while keeping only visible body for message content', () => {
    const parsed = parseEmbeddedMessageProjectionOutput([
      '正文：星依轻轻点头，说会留意窗外的脚步声。',
      EMBEDDED_MESSAGE_PROJECTION_START,
      '事实：星依答应用户，会留意窗外的脚步声。',
      '变化：无',
      '不确定：无',
      EMBEDDED_MESSAGE_PROJECTION_END
    ].join('\n'))

    expect(parsed).toEqual({
      visibleText: '星依轻轻点头，说会留意窗外的脚步声。',
      projectionText: [
        '事实：星依答应用户，会留意窗外的脚步声。',
        '变化：无',
        '不确定：无'
      ].join('\n'),
      hasProjection: true,
      error: ''
    })
  })

  it('reports missing or malformed embedded projection without leaking the block into visible body', () => {
    const missing = parseEmbeddedMessageProjectionOutput('正文：星依只写了正文。')
    expect(missing.visibleText).toBe('星依只写了正文。')
    expect(missing.hasProjection).toBe(false)
    expect(missing.error).toContain('缺少')

    const malformed = parseEmbeddedMessageProjectionOutput([
      '正文：星依写了正文。',
      EMBEDDED_MESSAGE_PROJECTION_START,
      '事实：第一段。',
      EMBEDDED_MESSAGE_PROJECTION_START,
      '事实：第二段。',
      EMBEDDED_MESSAGE_PROJECTION_END
    ].join('\n'))
    expect(malformed.visibleText).toBe('星依写了正文。')
    expect(malformed.hasProjection).toBe(false)
    expect(malformed.error).toContain('边界')
  })

  it('never leaks projection markers or label into visible body even when the model writes them sloppily', () => {
    // 只有开始标记、没有结束标记：投影残块不能漏进正文
    const unterminated = parseEmbeddedMessageProjectionOutput([
      '正文：星依说她会去。',
      EMBEDDED_MESSAGE_PROJECTION_START,
      '事实：星依答应会去。'
    ].join('\n'))
    expect(unterminated.visibleText).toBe('星依说她会去。')
    expect(unterminated.visibleText).not.toContain(EMBEDDED_MESSAGE_PROJECTION_START)
    expect(unterminated.hasProjection).toBe(false)

    // 正文里混入裸标记与“【正文】”变体标签，都要清掉
    const noisy = parseEmbeddedMessageProjectionOutput([
      '【正文】星依点了点头。',
      EMBEDDED_MESSAGE_PROJECTION_START,
      '事实：星依点头同意。',
      '变化：无',
      '不确定：无',
      EMBEDDED_MESSAGE_PROJECTION_END
    ].join('\n'))
    expect(noisy.visibleText).toBe('星依点了点头。')
    expect(noisy.projectionText).toContain('事实：星依点头同意。')
    expect(noisy.hasProjection).toBe(true)
  })

  it('parses and strips bracket-less projection markers the model writes without 【】', () => {
    // 复现 bug：模型把【消息投影】写成裸“消息投影”，旧正则匹配不到导致整段泄漏进正文。
    const parsed = parseEmbeddedMessageProjectionOutput([
      '他吻过来的时候，张元英没有退。',
      '消息投影',
      '事实：张元英被吻住后没有退开，而是主动回应。',
      '变化：无 不确定：无',
      '/消息投影'
    ].join('\n'))

    expect(parsed.hasProjection).toBe(true)
    expect(parsed.visibleText).toBe('他吻过来的时候，张元英没有退。')
    expect(parsed.visibleText).not.toContain('消息投影')
    expect(parsed.visibleText).not.toContain('事实：')
    expect(parsed.projectionText).toContain('事实：张元英被吻住后没有退开，而是主动回应。')

    // 半角中括号变体同样要被识别与清洗
    const bracketed = parseEmbeddedMessageProjectionOutput([
      '正文写在前面。',
      '[消息投影]',
      '事实：某人做了某事。',
      '变化：无',
      '不确定：无',
      '[/消息投影]'
    ].join('\n'))
    expect(bracketed.hasProjection).toBe(true)
    expect(bracketed.visibleText).toBe('正文写在前面。')
    expect(bracketed.visibleText).not.toContain('消息投影')
  })

  it('strips bracket-less markers even when the model appends trailing punctuation', () => {
    // 复现 bug：模型把裸标记写成“消息投影：”“/消息投影。”带尾随标点，旧正则要求标记独占整行，
    // 尾部一旦有标点就匹配不到，开闭两个标记连同整段投影一起泄漏进正文（用户截图里两个标记都露出）。
    const colon = parseEmbeddedMessageProjectionOutput([
      '他用极具侮辱性的言语羞辱了她。',
      '消息投影：',
      '事实：他羞辱了她，她压抑着哭腔哀求他别那样叫自己。',
      '变化：无 不确定：无',
      '/消息投影：'
    ].join('\n'))
    expect(colon.hasProjection).toBe(true)
    expect(colon.visibleText).toBe('他用极具侮辱性的言语羞辱了她。')
    expect(colon.visibleText).not.toContain('消息投影')
    expect(colon.visibleText).not.toContain('事实：')

    // 句号收尾的变体同样要被识别清洗
    const period = parseEmbeddedMessageProjectionOutput([
      '正文写在前面。',
      '消息投影。',
      '事实：某人做了某事。',
      '/消息投影。'
    ].join('\n'))
    expect(period.hasProjection).toBe(true)
    expect(period.visibleText).toBe('正文写在前面。')
    expect(period.visibleText).not.toContain('消息投影')
  })

  it('keeps a legitimate inline mention of the term when it is not a standalone marker line', () => {
    // 裸标记必须独占一行才被当作标记：正文里内联提到“消息投影”这个词不应被误删。
    const parsed = parseEmbeddedMessageProjectionOutput('星依给用户讲解了消息投影这个功能怎么用。')
    expect(parsed.hasProjection).toBe(false)
    expect(parsed.visibleText).toBe('星依给用户讲解了消息投影这个功能怎么用。')
  })

  it('emits a strict embedded projection instruction forcing [消息投影] bracket markers', () => {
    const instruction = buildEmbeddedMessageProjectionInstruction('本条旁白')
    expect(instruction).toContain('[消息投影]')
    expect(instruction).toContain('[/消息投影]')
    expect(instruction).toContain('本条旁白')
    expect(instruction).toContain('半角中括号')
    // 不再教模型写【】
    expect(instruction).not.toContain('【消息投影】')
  })

  it('strips leaked projection blocks from already-persisted visible text at display time', () => {
    // 复现 bug：历史消息把整段投影块焯进了落库正文（用户截图里 消息投影/.../​/消息投影 都露出）。
    const dirty = [
      '张元英往门口方向又挪了一步，鞋还没穿，但她已经不在乎了。',
      '消息投影',
      '事实：张元英放弃判断，催促沈志雄立刻带路。 变化：无 不确定：无',
      '/消息投影'
    ].join('\n')
    const cleaned = stripEmbeddedMessageProjectionFromVisibleText(dirty)
    expect(cleaned).toBe('张元英往门口方向又挪了一步，鞋还没穿，但她已经不在乎了。')
    expect(cleaned).not.toContain('消息投影')
    expect(cleaned).not.toContain('事实：')

    // 半角中括号包裹的历史正文同样剥掉
    const bracketed = ['正文在前。', '[消息投影]', '事实：某事。', '[/消息投影]'].join('\n')
    expect(stripEmbeddedMessageProjectionFromVisibleText(bracketed)).toBe('正文在前。')
  })

  it('leaves normal visible text untouched (no markers means no reformat)', () => {
    const normal = '星依跟用户说了三句话。\n\n第二段也保留。'
    expect(stripEmbeddedMessageProjectionFromVisibleText(normal)).toBe(normal)
    // 内联提到词不剥
    expect(stripEmbeddedMessageProjectionFromVisibleText('讲解消息投影怎么用'))
      .toBe('讲解消息投影怎么用')
    expect(stripEmbeddedMessageProjectionFromVisibleText('')).toBe('')
    expect(stripEmbeddedMessageProjectionFromVisibleText(null)).toBe('')
  })
})
