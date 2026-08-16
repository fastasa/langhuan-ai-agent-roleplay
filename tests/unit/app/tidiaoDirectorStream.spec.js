import { describe, expect, it } from 'vitest'
import {
  buildTidiaoDirectorStream,
  emptyTidiaoDirectorStream
} from '../../../src/app/tidiaoDirectorStream.ts'

describe('emptyTidiaoDirectorStream', () => {
  it('idle 占位：无决策无分镜、待命动作（loop 未起也能占位）', () => {
    const stream = emptyTidiaoDirectorStream()
    expect(stream.phase).toBe('idle')
    expect(stream.decisions).toEqual([])
    expect(stream.shots).toEqual([])
    expect(stream.currentAction).toContain('待命')
  })
})

describe('buildTidiaoDirectorStream', () => {
  it('空事件 → idle 占位', () => {
    const stream = buildTidiaoDirectorStream()
    expect(stream.phase).toBe('idle')
    expect(stream.decisions).toEqual([])
  })

  it('有事件但无终态相位 → running，末句标流式打字机', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '在分析这条消息…' },
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' }
    ])
    expect(stream.phase).toBe('running')
    expect(stream.currentAction).toContain('排这一轮')
    expect(stream.decisions).toHaveLength(2)
    expect(stream.decisions[0].streaming).toBeUndefined()
    expect(stream.decisions[1].streaming).toBe(true)
    // 自动分配 id
    expect(stream.decisions[0].id).toBe('decision_1')
    expect(stream.decisions[1].id).toBe('decision_2')
  })

  it('phase 事件显式收束 done：末句不流式', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '在分析这条消息…' },
      { type: 'phase', phase: 'done' }
    ])
    expect(stream.phase).toBe('done')
    expect(stream.currentAction).toBe('本轮编排完成')
    expect(stream.decisions[0].streaming).toBeUndefined()
  })

  it('工具调用条：决策附 tool（与叙述表现上分开的数据载体）', () => {
    const stream = buildTidiaoDirectorStream([
      {
        type: 'decision',
        kind: 'situation',
        text: '读取对应情境 skill',
        tool: { tool: 'readScenarioSkill', label: '读取情境', detail: 'casual', resultPreview: '读到情境正文', status: 'done' }
      },
      { type: 'phase', phase: 'done' }
    ])
    expect(stream.decisions[0].tool).toEqual({
      tool: 'readScenarioSkill', label: '读取情境', detail: 'casual', resultPreview: '读到情境正文', status: 'done'
    })
  })

  it('决策带 shot：同步挂镜、order 自动分配、shotId 回链该决策', () => {
    const stream = buildTidiaoDirectorStream([
      {
        type: 'decision',
        kind: 'narrationDir',
        text: '今晚天气值得描写，来一段旁白，方向：写夜色/凉意',
        shot: { kind: 'narration', label: '旁白', direction: '写夜色/凉意烘托' }
      },
      {
        type: 'decision',
        kind: 'castDir',
        text: '角色A会附和用户、觉得有道理',
        shot: { kind: 'character', label: '林雪云', direction: '附和、表示认同' }
      },
      { type: 'phase', phase: 'done' }
    ])
    expect(stream.shots).toEqual([
      { id: 'shot_1', kind: 'narration', label: '旁白', order: 1, direction: '写夜色/凉意烘托' },
      { id: 'shot_2', kind: 'character', label: '林雪云', order: 2, direction: '附和、表示认同', avatar: '林' }
    ])
    // 决策回链对应那一镜
    expect(stream.decisions[0].shotId).toBe('shot_1')
    expect(stream.decisions[1].shotId).toBe('shot_2')
  })

  it('角色镜默认头像取首字；显式 avatar 优先；旁白镜无头像', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'shot', kind: 'character', label: '张元英' },
      { type: 'shot', kind: 'character', label: '陈星依', avatar: '★' },
      { type: 'shot', kind: 'narration', label: '旁白' }
    ])
    expect(stream.shots[0].avatar).toBe('张')
    expect(stream.shots[1].avatar).toBe('★')
    expect(stream.shots[2].avatar).toBeUndefined()
  })

  it('旁白二分类标注：informationBearing 透传，未给则不标注', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'shot', kind: 'narration', label: '环境旁白', informationBearing: true },
      { type: 'shot', kind: 'narration', label: '纯描写旁白', informationBearing: false },
      { type: 'shot', kind: 'narration', label: '未标注旁白' }
    ])
    expect(stream.shots[0].informationBearing).toBe(true)
    expect(stream.shots[1].informationBearing).toBe(false)
    expect(stream.shots[2].informationBearing).toBeUndefined()
  })

  it('纠偏：新决策追加在末尾、旧决策不消失（kind:correction）', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'castDir', text: '大小姐会嗤之以鼻' },
      { type: 'decision', kind: 'correction', text: '用户希望 B 改为附和 → 调整 B 方向为附和' },
      { type: 'phase', phase: 'done' }
    ])
    expect(stream.decisions.map((d) => d.kind)).toEqual(['castDir', 'correction'])
    expect(stream.decisions[1].text).toContain('调整 B 方向为附和')
  })

  it('fail 事件 → failed 相位 + 失败原因', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '在分析…' },
      { type: 'fail', reason: '模型连接超时' }
    ])
    expect(stream.phase).toBe('failed')
    expect(stream.failureReason).toBe('模型连接超时')
    expect(stream.currentAction).toBe('模型连接超时')
  })

  it('fail 无原因 → failed 相位 + 默认中断文案', () => {
    const stream = buildTidiaoDirectorStream([{ type: 'fail' }])
    expect(stream.phase).toBe('failed')
    expect(stream.failureReason).toBeUndefined()
    expect(stream.currentAction).toBe('编排中断')
  })

  it('correction.active 覆盖为 correcting（半成品停在原地、带纠偏文本）', () => {
    const stream = buildTidiaoDirectorStream(
      [
        { type: 'decision', kind: 'situation', text: '闲聊情境' },
        { type: 'decision', kind: 'castDir', text: '大小姐嗤之以鼻', shot: { kind: 'character', label: '大小姐' } }
      ],
      { correction: { active: true, text: '大小姐今天心情好，会附和我' } }
    )
    expect(stream.phase).toBe('correcting')
    expect(stream.correction).toBe('大小姐今天心情好，会附和我')
    expect(stream.currentAction).toBe('已暂停 · 在下方输入框继续指挥提调')
    // 半成品停在原地：决策与分镜仍在
    expect(stream.decisions).toHaveLength(2)
    expect(stream.shots).toHaveLength(1)
    // correcting 不算 running，末句不流式
    expect(stream.decisions[1].streaming).toBeUndefined()
  })

  it('correction.active 覆盖 failed（停止挂起优先于失败判定）', () => {
    const stream = buildTidiaoDirectorStream(
      [{ type: 'fail', reason: '中断' }],
      { correction: { active: true } }
    )
    expect(stream.phase).toBe('correcting')
    expect(stream.correction).toBe('')
  })

  it('correction.active=false 不进 correcting（维持事件态相位）', () => {
    const stream = buildTidiaoDirectorStream(
      [{ type: 'decision', kind: 'analyze', text: '分析' }, { type: 'phase', phase: 'done' }],
      { correction: { active: false, text: 'x' } }
    )
    expect(stream.phase).toBe('done')
    expect(stream.correction).toBeUndefined()
  })

  it('显式 id 透传（loop 用稳定 id 增量更新）', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '分析', id: 'd-analyze', shot: { kind: 'character', label: '甲', id: 'shot-jia' } },
      { type: 'phase', phase: 'done' }
    ])
    expect(stream.decisions[0].id).toBe('d-analyze')
    expect(stream.decisions[0].shotId).toBe('shot-jia')
    expect(stream.shots[0].id).toBe('shot-jia')
  })

  it('天气样例端到端：判情境→读skill→定旁白方向→定A→定B→深化→分镜累积', () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '在分析这条消息…' },
      {
        type: 'decision', kind: 'situation', text: '这是闲聊放松的情境，读取对应情境 skill',
        tool: { tool: 'readScenarioSkill', label: '读取情境', detail: 'casual', status: 'done' }
      },
      {
        type: 'decision', kind: 'narrationDir', text: '今晚天气值得描写，来一段旁白，方向：写夜色/凉意',
        shot: { kind: 'narration', label: '旁白', direction: '写夜色/凉意烘托' }
      },
      {
        type: 'decision', kind: 'castDir', text: '角色A会附和用户、觉得有道理',
        shot: { kind: 'character', label: '林雪云', direction: '附和、认同' }
      },
      {
        type: 'decision', kind: 'castDir', text: '角色B是傲娇毒舌大小姐，会嗤之以鼻',
        shot: { kind: 'character', label: '苏曼', direction: '傲娇毒舌、嗤之以鼻' }
      },
      { type: 'decision', kind: 'deepen', text: '在这几条线上继续深化延伸' }
    ])
    expect(stream.phase).toBe('running')
    expect(stream.decisions).toHaveLength(6)
    // 分镜并排累积：旁白 + A + B，顺序 1/2/3
    expect(stream.shots.map((s) => `${s.order}:${s.label}`)).toEqual(['1:旁白', '2:林雪云', '3:苏曼'])
    // 末句深化标流式
    expect(stream.decisions[5].streaming).toBe(true)
  })
})
