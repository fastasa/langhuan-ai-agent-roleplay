import { describe, expect, it } from 'vitest'
import { renderDirectorVisibleHistory, DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK } from '../../../src/app/directorVisibleHistory.ts'

// 7 层骨架 增量2·「三·对话可见历史」逐条结构化渲染（序号/类型/名/时间/地点/天气/模型）。
describe('renderDirectorVisibleHistory', () => {
  const sample = () => [
    { role: 'user', memberName: '陈铭', content: '你好呀', envDate: '07-01', envLocation: '杭州', envWeather: '小雨' },
    { role: 'assistant', name: '星依', content: '用户好呀~', envDate: '07-01', envLocation: '杭州', envWeather: '小雨', model: 'claude-opus-4-8' },
    { role: 'assistant', name: '旁白', message_kind: 'narration', content: '窗外雨声渐密。', envDate: '07-01', envLocation: '杭州', envWeather: '小雨', model: 'claude-sonnet-5' }
  ]

  it('角色用「角色N·名」序号 + 时间/地点/天气/模型；正文另起一行', () => {
    const out = renderDirectorVisibleHistory(sample())
    expect(out).toContain('〔角色1·星依〕')
    expect(out).toContain('07-01 · 杭州 · 小雨 · 模型 claude-opus-4-8')
    expect(out).toContain('\n用户好呀~')
  })

  it('旁白用「旁白N」序号（不带模型标签外的类型混淆）；用户标「用户·扮演X」且无模型', () => {
    const out = renderDirectorVisibleHistory(sample())
    expect(out).toContain('〔旁白1〕')
    expect(out).toContain('模型 claude-sonnet-5')
    expect(out).toContain('〔用户·扮演陈铭〕')
    // 用户消息不带模型字段
    const userLine = out.split('\n').find((l) => l.includes('用户·扮演陈铭'))
    expect(userLine).not.toContain('模型')
  })

  it('楼层号在全列表上算，窗口只取最近 maxMessages 条', () => {
    const many = [
      { role: 'assistant', name: 'A', content: '一' },
      { role: 'assistant', name: 'B', content: '二' },
      { role: 'assistant', name: 'C', content: '三' }
    ]
    const out = renderDirectorVisibleHistory(many, 2)
    // 窗口只取最近 2 条（B、C），但序号仍是全列表楼层号（角色2/角色3）。
    expect(out).not.toContain('一')
    expect(out).toContain('〔角色2·B〕')
    expect(out).toContain('〔角色3·C〕')
  })

  it('空列表返回空串（首轮无历史）', () => {
    expect(renderDirectorVisibleHistory([])).toBe('')
    expect(renderDirectorVisibleHistory(null)).toBe('')
  })

  // 批次J1（2026-07-02 用户真机反馈）：本轮分界标注——纠偏/重排时提调一眼分出哪些消息是本轮刚生成的。
  it('currentRoundBoundaryMessageId：第一条 id 大于锚的消息前插「本轮分界」标注（只插一次）', () => {
    const msgs = [
      { id: 1, role: 'user', memberName: '陈铭', content: '早上好' },
      { id: 2, role: 'assistant', name: '星依', content: '用户早呀' },
      { id: 3, role: 'user', memberName: '陈铭', content: '来一段夜谈' },
      { id: 4, role: 'assistant', name: '星依', content: '本轮生成的台词' },
      { id: 5, role: 'assistant', name: '旁白', message_kind: 'narration', content: '本轮生成的旁白' }
    ]
    const out = renderDirectorVisibleHistory(msgs, { currentRoundBoundaryMessageId: 3 })
    expect(out).toContain(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK)
    // 分界位置：本轮用户消息（锚）之后、本轮第一条生成消息之前。
    expect(out.indexOf('来一段夜谈')).toBeLessThan(out.indexOf(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK))
    expect(out.indexOf(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK)).toBeLessThan(out.indexOf('本轮生成的台词'))
    // 只插一次（首条命中后不再插）。
    expect(out.split(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK)).toHaveLength(2)
  })

  it('本轮分界：锚后无新消息（正常开局）或缺省锚时不插、零痕迹', () => {
    const msgs = [
      { id: 1, role: 'assistant', name: '星依', content: '历史消息' },
      { id: 2, role: 'user', memberName: '陈铭', content: '这轮刚发的' }
    ]
    expect(renderDirectorVisibleHistory(msgs, { currentRoundBoundaryMessageId: 2 })).not.toContain(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK)
    expect(renderDirectorVisibleHistory(msgs)).not.toContain(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK)
  })

  it('缺元数据时只渲染存在的字段，不留空占位', () => {
    const out = renderDirectorVisibleHistory([{ role: 'assistant', name: '星依', content: '嗨' }])
    expect(out).toContain('〔角色1·星依〕')
    expect(out).not.toContain(' · ')
    expect(out).not.toContain('模型')
  })

  // 增量5（2026-07-02）：统一投影壳——正文换投影客观事实（无投影兜底原文）+ 可见性过滤（剔调试/剔已消化 + 并集口径）。
  it('projectionResolver：角色/旁白正文换成投影客观事实（+起止环境/变化）；无投影兜底原文·元数据壳保留', () => {
    const msgs = [
      { role: 'user', memberName: '陈铭', content: '你好呀' },
      { role: 'assistant', name: '星依', content: '原始台词很长很长', model: 'm1', envDate: '07-02' },
      { role: 'assistant', name: '旁白', message_kind: 'narration', content: '原始旁白正文' }
    ]
    const resolver = (kind, index) => {
      if (kind === 'role' && index === 1) return { hasProjection: true, objectiveFact: '星依向父亲问好', endEnvText: '傍晚·杭州', changedText: '无时间/地点变化' }
      return { hasProjection: false } // 旁白1 无投影 → 兜底原文
    }
    const out = renderDirectorVisibleHistory(msgs, { projectionResolver: resolver })
    // 角色1 正文=投影客观事实 + 起止环境（changedText 为「无变化」被略去）
    expect(out).toContain('〔角色1·星依〕 07-02 · 模型 m1')
    expect(out).toContain('星依向父亲问好（傍晚·杭州）')
    expect(out).not.toContain('原始台词很长很长')
    // 旁白1 无投影 → 兜底原文
    expect(out).toContain('原始旁白正文')
    // 用户消息无投影概念 → 正文走原文
    expect(out).toContain('你好呀')
  })

  // autoWriteHidden 现役语义=手动眼睛隐藏 + 旁白 profile 排除（非投影写轨迹消化·那个在 chat_message_projection_visibility 表·待方案B 接）。
  it('可见性过滤：剔 narration_debug + 剔 autoWriteHidden（手动眼睛隐藏/旁白排除）', () => {
    const msgs = [
      { role: 'assistant', name: '甲', content: '正常一' },
      { role: 'assistant', name: '乙', content: '手动隐藏的', autoWriteHidden: true },
      { role: 'assistant', name: '调试', message_kind: 'narration_debug', content: '调试旁白' },
      { role: 'assistant', name: '丙', content: '正常二' }
    ]
    const out = renderDirectorVisibleHistory(msgs)
    expect(out).toContain('正常一')
    expect(out).toContain('正常二')
    expect(out).not.toContain('手动隐藏的') // autoWriteHidden 剔除
    expect(out).not.toContain('调试旁白') // narration_debug 剔除
    // 楼层号在全列表上算：甲=角色1、乙=角色2（被剔）、调试不入楼层、丙=角色3
    expect(out).toContain('〔角色1·甲〕')
    expect(out).toContain('〔角色3·丙〕')
  })

  it('并集口径 isMessageVisibleToDirector：某条对全体候选角色隐藏才移除；任一候选可见则保留', () => {
    const msgs = [
      { role: 'assistant', name: '甲', content: '对c1隐藏但c2可见', hiddenForCharacterIds: ['c1'] },
      { role: 'assistant', name: '乙', content: '对全体候选隐藏', hiddenForCharacterIds: ['c1', 'c2'] }
    ]
    const out = renderDirectorVisibleHistory(msgs, { candidateCharacterIds: ['c1', 'c2'] })
    expect(out).toContain('对c1隐藏但c2可见') // c2 仍可见 → 提调可见（并集）
    expect(out).not.toContain('对全体候选隐藏') // c1、c2 都看不到 → 提调不可见
  })

  // 增量5.5（方案B·2026-07-02）：hiddenCharacterIdsResolver 接投影写轨迹消化真数据（chat_message_projection_visibility），
  //   按并集口径过滤——所有候选角色都消化隐藏才从层3剔掉。
  it('hiddenCharacterIdsResolver：按 messageId 供每条 hidden 角色集，所有候选都 hidden 才剔（并集）', () => {
    const msgs = [
      { id: 10, role: 'assistant', name: '甲', content: '仅c1消化' },
      { id: 11, role: 'assistant', name: '乙', content: '全员消化' },
      { id: 12, role: 'assistant', name: '丙', content: '无人消化' }
    ]
    const hidden = new Map([
      [10, ['c1']],
      [11, ['c1', 'c2']]
    ])
    const out = renderDirectorVisibleHistory(msgs, {
      candidateCharacterIds: ['c1', 'c2'],
      hiddenCharacterIdsResolver: (m) => hidden.get(Number(m.id) || 0)
    })
    expect(out).toContain('仅c1消化') // c2 未消化 → 提调仍可见（并集）
    expect(out).not.toContain('全员消化') // c1、c2 都消化隐藏 → 提调不可见
    expect(out).toContain('无人消化') // 无 hidden 记录 → 可见
  })

  it('hiddenCharacterIdsResolver 优先于 message.hiddenForCharacterIds（缺 resolver 才回退字段）', () => {
    const msgs = [
      { id: 20, role: 'assistant', name: '甲', content: '字段说全隐藏但resolver说可见', hiddenForCharacterIds: ['c1', 'c2'] }
    ]
    // resolver 提供空集 → 该条对所有候选可见，覆盖字段的「全隐藏」。
    const out = renderDirectorVisibleHistory(msgs, {
      candidateCharacterIds: ['c1', 'c2'],
      hiddenCharacterIdsResolver: () => []
    })
    expect(out).toContain('字段说全隐藏但resolver说可见')
  })

  // 批次B（2026-07-02·层3 兜底原文修正）：无投影兜底原文不截断 + 剔思维链 + 剔内嵌【消息投影】块取 visibleText。
  it('兜底原文不截断：超 120 字的原文完整保留（折叠空白成单行）', () => {
    const long = '很长的台词'.repeat(60) // 300 字
    const out = renderDirectorVisibleHistory([{ role: 'assistant', name: '星依', content: long }])
    expect(out).toContain(long)
  })

  it('兜底原文剔思维链：<think> 与【思考过程】都不进层3', () => {
    const msgs = [
      { role: 'assistant', name: '甲', content: '<think>我在琢磨怎么回</think>剔完思维链的正文' },
      { role: 'assistant', name: '乙', content: '【思考过程】盘算一下【回复】真正的回复正文' }
    ]
    const out = renderDirectorVisibleHistory(msgs)
    expect(out).toContain('剔完思维链的正文')
    expect(out).not.toContain('我在琢磨怎么回')
    expect(out).toContain('真正的回复正文')
    expect(out).not.toContain('盘算一下')
    expect(out).not.toContain('【回复】')
  })

  it('兜底原文剔内嵌消息投影块：只留 visibleText', () => {
    const content = '正文可见部分。\n[消息投影]\n{"objectiveFact":"投影载荷不该泄漏"}\n[/消息投影]'
    const out = renderDirectorVisibleHistory([{ role: 'assistant', name: '星依', content }])
    expect(out).toContain('正文可见部分。')
    expect(out).not.toContain('投影载荷不该泄漏')
    expect(out).not.toContain('消息投影')
  })

  it('有投影时仍用投影客观事实，兜底清洗只作用于无投影楼层', () => {
    const msgs = [{ role: 'assistant', name: '星依', content: '<think>思</think>原文' }]
    const out = renderDirectorVisibleHistory(msgs, {
      projectionResolver: () => ({ hasProjection: true, objectiveFact: '客观事实正文' })
    })
    expect(out).toContain('客观事实正文')
    expect(out).not.toContain('原文')
  })

  // 输入框图片上传计划批4·点C：用户消息带附件时追加 caption 文字，层3 一律不带原生图（省 token）。
  it('用户消息带附件时追加 caption 文字；无附件/角色旁白消息零变化', () => {
    const msgs = [
      {
        role: 'user',
        memberName: '陈铭',
        content: '看看这张图',
        attachmentsJson: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', caption: '一只猫', captionStatus: 'done' }]
      },
      { role: 'assistant', name: '星依', content: '好可爱的猫猫' }
    ]
    const out = renderDirectorVisibleHistory(msgs)
    expect(out).toContain('看看这张图\n[图片1：一只猫]')
    // 附件 note 只贴在用户消息正文后；角色消息自己的正文不受影响。
    expect(out).toContain('好可爱的猫猫')
    expect(out).not.toContain('好可爱的猫猫\n[图片1')
  })

  it('兼容乐观回显字段名 attachments（未走 toCamel 时）', () => {
    const msgs = [
      {
        role: 'user',
        memberName: '陈铭',
        content: '刚发的图',
        attachments: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png' }]
      }
    ]
    const out = renderDirectorVisibleHistory(msgs)
    expect(out).toContain('刚发的图\n[图片1：图片]')
  })

  it('兜底窗口支持对象参 maxMessages（与旧位置参等价）', () => {
    const many = [
      { role: 'assistant', name: 'A', content: '一' },
      { role: 'assistant', name: 'B', content: '二' },
      { role: 'assistant', name: 'C', content: '三' }
    ]
    const out = renderDirectorVisibleHistory(many, { maxMessages: 2 })
    expect(out).not.toContain('一')
    expect(out).toContain('〔角色2·B〕')
    expect(out).toContain('〔角色3·C〕')
  })
})
