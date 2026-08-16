import { afterEach, describe, expect, it } from 'vitest'
import {
  createTidiaoDirectorStreamAccumulator,
  directorKindFromStage,
  directorToolLabel
} from '../../../src/app/tidiaoDirectorStreamAccumulator.ts'
import {
  activeAgentAppendLog,
  beginAppendLog,
  getAppendLogEvents
} from '../../../src/app/agentState/appendLog.ts'

describe('directorKindFromStage', () => {
  it('stage 映射决策类型', () => {
    expect(directorKindFromStage('scenario-routing')).toBe('situation')
    expect(directorKindFromStage('plan-generation')).toBe('generate')
    expect(directorKindFromStage('plan-review')).toBe('review')
    expect(directorKindFromStage('manual-reading')).toBe('note')
  })

  it('stage 无法定性时按文本关键词兜底', () => {
    expect(directorKindFromStage('unknown', '系统已自动触发评审，挑最优三条')).toBe('review')
    expect(directorKindFromStage('unknown', '这一段先来点旁白烘托')).toBe('narrationDir')
    expect(directorKindFromStage('unknown', '随便一句')).toBe('note')
  })

  it('O-C3 旁白两件套 stage → narrationDir', () => {
    expect(directorKindFromStage('narration-skill-read')).toBe('narrationDir')
    expect(directorKindFromStage('narration-routing')).toBe('narrationDir')
  })
})

describe('directorToolLabel', () => {
  it('机器名 → 中文标签，未知原样', () => {
    expect(directorToolLabel('readScenarioSkill')).toBe('读取情境')
    expect(directorToolLabel('generatePlanBatch')).toBe('生成候选计划')
    expect(directorToolLabel('mysteryTool')).toBe('mysteryTool')
  })

  it('O-C3 旁白两件套中文标签', () => {
    expect(directorToolLabel('readNarrationSkill')).toBe('读旁白skill')
    expect(directorToolLabel('confirmNarrationCall')).toBe('定旁白方向')
  })

  it('提问工具标签为「提问」（面向所有用户，不写「问用户」）', () => {
    expect(directorToolLabel('askUser')).toBe('提问')
  })
})

describe('createTidiaoDirectorStreamAccumulator', () => {
  it('thought 事件 → 决策流条目（running 末句流式）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '这是闲聊放松的情境', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.phase).toBe('running')
    expect(stream.decisions).toHaveLength(1)
    expect(stream.decisions[0]).toMatchObject({ kind: 'situation', text: '这是闲聊放松的情境', streaming: true })
  })

  it('空 thought 不产生决策', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '  ', turnIndex: 0 })
    expect(acc.snapshot().decisions).toEqual([])
  })

  it('thought + 同轮 tool-start/result → 工具条挂在本轮决策、running→done', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '读对应情境写法', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'scenario-routing', toolName: 'readScenarioSkill', turnIndex: 0 })
    // tool-start 后工具条 running
    expect(acc.snapshot().decisions[0].tool).toMatchObject({ tool: 'readScenarioSkill', label: '读取情境', status: 'running' })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'scenario-routing', toolName: 'readScenarioSkill', status: 'success', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.decisions).toHaveLength(1)
    expect(stream.decisions[0].tool).toMatchObject({ tool: 'readScenarioSkill', status: 'done' })
  })

  it('本轮无 thought 的工具 → 新起一条工具行决策（文本=工具标签）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'manual-reading', toolName: 'getToolManual', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.decisions).toHaveLength(1)
    expect(stream.decisions[0].text).toBe('查工具手册')
    expect(stream.decisions[0].tool.label).toBe('查工具手册')
  })

  it('同轮第二个工具 → 各自独立成行', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '先读情境再改帷幕', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'scenario-routing', toolName: 'readScenarioSkill', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'scenario-routing', toolName: 'updateCurtainScene', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.decisions).toHaveLength(2)
    expect(stream.decisions[0].tool.tool).toBe('readScenarioSkill')
    expect(stream.decisions[1].tool.tool).toBe('updateCurtainScene')
    expect(stream.decisions[1].text).toBe('调整时间地点') // 工具行决策文本=标签
  })

  it('提问（askUser）：问题作为正常文字（决策正文），不挤进工具条灰字 detail', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    // 本轮无 thought，直接调 askUser：问题文本经 runtime 以 detail 携带
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'manual-reading', toolName: 'askUser', detail: '你说的「旁白」是指哪个？', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.decisions).toHaveLength(1)
    // 问题提升为决策正文（正常文字），决策类型按对话语义
    expect(stream.decisions[0].text).toBe('你说的「旁白」是指哪个？')
    expect(stream.decisions[0].kind).toBe('correction')
    // 工具条只留「提问」标签，不再把问题塞进灰字 detail
    expect(stream.decisions[0].tool).toMatchObject({ tool: 'askUser', label: '提问', status: 'running' })
    expect(stream.decisions[0].tool.detail).toBeUndefined()
  })

  it('提问（askUser）：已有 thought 时问题接在其后成正文', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'manual-reading', toolName: '', thought: '指代两可，先问一下', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'manual-reading', toolName: 'askUser', detail: '指独立旁白楼层还是角色开头环境段？', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.decisions).toHaveLength(1)
    expect(stream.decisions[0].text).toBe('指代两可，先问一下：指独立旁白楼层还是角色开头环境段？')
    expect(stream.decisions[0].tool.detail).toBeUndefined()
  })

  it('生成步给单聊出场角色挂一镜，方向取该步决策文本', () => {
    const acc = createTidiaoDirectorStreamAccumulator({ characterName: '林雪云' })
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '让她顺着话头温柔接一句', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 1 })
    const stream = acc.snapshot()
    expect(stream.shots).toEqual([
      { id: 'shot_1', kind: 'character', label: '林雪云', order: 1, direction: '让她顺着话头温柔接一句', avatar: '林' }
    ])
    // 决策回链该镜
    expect(stream.decisions[0].shotId).toBe('shot_1')
  })

  it('无 characterName 不挂角色镜', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '生成候选', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 0 })
    expect(acc.snapshot().shots).toEqual([])
  })

  it('多次生成只挂一次角色镜', () => {
    const acc = createTidiaoDirectorStreamAccumulator({ characterName: '甲' })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 0 })
    expect(acc.snapshot().shots).toHaveLength(1)
  })

  it('tool-result error → 工具条 error', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-generation', toolName: 'generatePlanBatch', status: 'error', turnIndex: 0 })
    expect(acc.snapshot().decisions[0].tool.status).toBe('error')
  })

  // 2026-07-04 真机修：confirmNarrationCall 挂镜在 tool-start，被参数校验退回时必须摘镜——
  // 真机复现：两次退回留下两面幽灵旁白镜（分镜列 2 镜、实际零成功确认）。
  it('confirmNarrationCall 失败摘幽灵旁白镜；成功的保留', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'unknown', toolName: '', thought: '先铺一段穿越旁白', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'confirmNarrationCall', turnIndex: 0 })
    expect(acc.snapshot().shots).toHaveLength(1)
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'confirmNarrationCall', status: 'error', errorMessage: 'generatedPrompt 太短', turnIndex: 0 })
    expect(acc.snapshot().shots).toHaveLength(0)
    // 第二次确认成功 → 旁白镜保留（前次的错误不影响后续成功挂镜）。
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'confirmNarrationCall', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'confirmNarrationCall', status: 'success', turnIndex: 1 })
    const shots = acc.snapshot().shots
    expect(shots).toHaveLength(1)
    expect(shots[0].kind).toBe('narration')
  })

  it('批次G：tool-start detail → 工具条参数预览', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'scenario-routing', toolName: 'readScenarioSkill', detail: 'casual', turnIndex: 0 })
    expect(acc.snapshot().decisions[0].tool).toMatchObject({ tool: 'readScenarioSkill', detail: 'casual', status: 'running' })
  })

  it('批次G：tool-result success resultPreview → 工具条结果摘要', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'recallSemantic', detail: '鹿角厅', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'recallSemantic', status: 'success', resultPreview: '命中 3 条', turnIndex: 0 })
    const tool = acc.snapshot().decisions[0].tool
    expect(tool).toMatchObject({ status: 'done', resultPreview: '命中 3 条' })
  })

  it('批次G：错误条带错误信息（报错也输出）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-generation', toolName: 'generatePlanBatch', status: 'error', errorMessage: '候选数量与强度不一致', turnIndex: 0 })
    const tool = acc.snapshot().decisions[0].tool
    expect(tool.status).toBe('error')
    expect(tool.resultPreview).toBe('候选数量与强度不一致')
  })

  it('批次G：重试条标「重试中」（重试也输出）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-generation', toolName: 'generatePlanBatch', status: 'error', errorMessage: '候选不足', retried: true, turnIndex: 0 })
    expect(acc.snapshot().decisions[0].tool.resultPreview).toBe('候选不足 · 重试中')
  })

  it('批次G·遗留2：notice 事件 → 追加一条人话决策（非工具条）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '生成候选', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'notice', stage: 'terminal', toolName: '', thought: '已到步数上限，先收这一轮', turnIndex: 0 })
    const stream = acc.snapshot()
    expect(stream.decisions).toHaveLength(2)
    expect(stream.decisions[1]).toMatchObject({ kind: 'note', text: '已到步数上限，先收这一轮' })
    expect(stream.decisions[1].tool).toBeUndefined()
  })

  it('批次G·遗留3：noteCastDirection 实时把角色镜方向覆盖为权威方向', () => {
    const acc = createTidiaoDirectorStreamAccumulator({ characterName: '林雪云' })
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '先随便想个方向', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 1 })
    // 挂镜时占位方向 = 生成步 thought
    expect(acc.snapshot().shots[0].direction).toBe('先随便想个方向')
    // 拿到权威方向（planPrompt）后实时覆盖
    acc.noteCastDirection('顺着用户的话，温柔地附和今晚的夜色')
    expect(acc.snapshot().shots[0].direction).toBe('顺着用户的话，温柔地附和今晚的夜色')
    // 只认首个权威方向，第二个 strategy 的 planPrompt 不再覆盖
    acc.noteCastDirection('换个进攻性的方向')
    expect(acc.snapshot().shots[0].direction).toBe('顺着用户的话，温柔地附和今晚的夜色')
  })

  it('O-C3 confirmNarrationCall 挂旁白镜，noteNarrationShot 补全二分类（方向取导演人话）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'narration-routing', toolName: '', thought: '来一段夜色旁白烘托', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'narration-routing', toolName: 'confirmNarrationCall', turnIndex: 1 })
    // 挂镜：旁白镜（kind narration），方向先取导演人话。
    expect(acc.snapshot().shots).toEqual([
      { id: 'shot_1', kind: 'narration', label: '旁白', order: 1, direction: '来一段夜色旁白烘托' }
    ])
    // noteNarrationShot 补全二分类（informationBearing）；人话方向更可读，保留不被 generatedPrompt 覆盖。
    acc.noteNarrationShot({ profileIds: ['environment'], profileNames: ['环境描写'], narrationKind: 'environment', informationBearing: false, reason: 'x', score: 1, generatedPrompt: '写一段清冷夜色的环境旁白。' })
    const shot = acc.snapshot().shots[0]
    expect(shot).toMatchObject({ kind: 'narration', informationBearing: false, direction: '来一段夜色旁白烘托' })
    // 决策类型 = narrationDir，工具条收口 done。
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'narration-routing', toolName: 'confirmNarrationCall', status: 'success', turnIndex: 1 })
    const decision = acc.snapshot().decisions.at(-1)
    expect(decision.kind).toBe('narrationDir')
    expect(decision.tool).toMatchObject({ tool: 'confirmNarrationCall', label: '定旁白方向', status: 'done' })
  })

  it('O-C3 无导演人话的旁白镜：方向回退取确认的 generatedPrompt；多条旁白按确认顺序对应', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    // 第一条：无 thought，方向回退 generatedPrompt
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'narration-routing', toolName: 'confirmNarrationCall', turnIndex: 1 })
    acc.noteNarrationShot({ informationBearing: true, generatedPrompt: '甲段旁白' })
    // 第二条
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'narration-routing', toolName: 'confirmNarrationCall', turnIndex: 1 })
    acc.noteNarrationShot({ informationBearing: false, generatedPrompt: '乙段旁白' })
    const shots = acc.snapshot().shots.filter((s) => s.kind === 'narration')
    expect(shots).toHaveLength(2)
    expect(shots[0]).toMatchObject({ informationBearing: true, direction: '甲段旁白' })
    expect(shots[1]).toMatchObject({ informationBearing: false, direction: '乙段旁白' })
  })

  it('setPhase(done) → done 相位，末句不流式', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '收尾', turnIndex: 0 })
    acc.setPhase('done')
    const stream = acc.snapshot()
    expect(stream.phase).toBe('done')
    expect(stream.decisions[0].streaming).toBeUndefined()
  })

  it('fail → failed 相位 + 原因；fail 后 setPhase 无效', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '分析', turnIndex: 0 })
    acc.fail('模型连接超时')
    acc.setPhase('done')
    const stream = acc.snapshot()
    expect(stream.phase).toBe('failed')
    expect(stream.failureReason).toBe('模型连接超时')
  })

  it('fail 后所有写入入口惰性（#2）：abort 后的 in-flight 回调不再 mutate/emit、不污染失败快照', () => {
    const snapshots = []
    const acc = createTidiaoDirectorStreamAccumulator({ onStream: (s) => snapshots.push(s) })
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '判情境', turnIndex: 0 })
    acc.fail('回复计划编排已取消')
    const emitsAfterFail = snapshots.length
    // 模拟 abort 后才落地的 in-flight 回调（旁白确认/工具结果/补镜/补决策）——全部应被守卫挡掉。
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '迟到的一步', turnIndex: 1 })
    acc.noteNarrationShot({ profileId: 'environment', generatedPrompt: '迟到旁白', informationBearing: false })
    acc.noteCastDirection('迟到方向')
    acc.noteDecision('note', '迟到决策')
    acc.addShot({ kind: 'character', label: '迟到角色' })
    // fail 之后不应再产生任何 emit；最终快照仍是失败态、决策只有 fail 前那一条。
    expect(snapshots.length).toBe(emitsAfterFail)
    const stream = acc.snapshot()
    expect(stream.phase).toBe('failed')
    expect(stream.decisions).toHaveLength(1)
    expect(stream.shots).toHaveLength(0)
  })

  it('onStream 每次变化整份上抛快照', () => {
    const snapshots = []
    const acc = createTidiaoDirectorStreamAccumulator({ onStream: (s) => snapshots.push(s) })
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '一', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '二', turnIndex: 1 })
    acc.setPhase('done')
    expect(snapshots).toHaveLength(3)
    expect(snapshots[0].decisions).toHaveLength(1)
    expect(snapshots[1].decisions).toHaveLength(2)
    expect(snapshots[2].phase).toBe('done')
  })

  it('单聊端到端：判情境(读skill)→生成(挂角色镜)→自动评审收束→done', () => {
    const events = []
    const acc = createTidiaoDirectorStreamAccumulator({ characterName: '林雪云', onStream: (s) => events.push(s) })
    // turn0：判情境
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '这是闲聊放松的情境，先读写法', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'scenario-routing', toolName: 'readScenarioSkill', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'scenario-routing', toolName: 'readScenarioSkill', status: 'success', turnIndex: 0 })
    // turn1：生成
    acc.onRuntimeProgress({ kind: 'thought', stage: 'plan-generation', toolName: '', thought: '让她温柔附和一句', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'generatePlanBatch', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-generation', toolName: 'generatePlanBatch', status: 'success', turnIndex: 1 })
    // turn2：自动评审收束轮（stage unknown，文本含「评审」）
    acc.onRuntimeProgress({ kind: 'thought', stage: 'unknown', toolName: '', thought: '候选齐了，自动评审挑最优', turnIndex: 2 })
    acc.setPhase('done')

    const stream = acc.snapshot()
    expect(stream.phase).toBe('done')
    expect(stream.decisions.map((d) => d.kind)).toEqual(['situation', 'generate', 'review'])
    expect(stream.decisions[0].tool.tool).toBe('readScenarioSkill')
    expect(stream.decisions[1].tool.tool).toBe('generatePlanBatch')
    // 分镜：单聊出场角色一镜
    expect(stream.shots).toEqual([
      { id: 'shot_1', kind: 'character', label: '林雪云', order: 1, direction: '让她温柔附和一句', avatar: '林' }
    ])
  })

  // E1 群聊收束补整轮剧本入口
  it('E1 readMessageProjection 中文标签', () => {
    expect(directorToolLabel('readMessageProjection')).toBe('读投影')
  })

  it('E1 noteDecision：收束补无镜决策（不挂工具/不挂镜）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.noteDecision('note', '让星依先接话')
    acc.noteDecision('situation', '回忆昨天的望舒台')
    const stream = acc.snapshot()
    expect(stream.decisions.map((d) => d.text)).toEqual(['让星依先接话', '回忆昨天的望舒台'])
    expect(stream.decisions.every((d) => d.tool === undefined && d.shotId === undefined)).toBe(true)
    // 空文本不产决策
    acc.noteDecision('note', '   ')
    expect(acc.snapshot().decisions).toHaveLength(2)
  })

  it('E1 addShot：收束补独立分镜（角色镜/旁白镜，order 自动递增）', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.addShot({ kind: 'narration', label: '旁白', direction: '用雨声烘托暖意' })
    acc.addShot({ kind: 'character', label: '星依', direction: '星依回忆望舒台' })
    const stream = acc.snapshot()
    expect(stream.shots).toEqual([
      { id: 'shot_1', kind: 'narration', label: '旁白', order: 1, direction: '用雨声烘托暖意' },
      { id: 'shot_2', kind: 'character', label: '星依', order: 2, direction: '星依回忆望舒台', avatar: '星' }
    ])
    // 无 label 不挂镜
    acc.addShot({ kind: 'character', label: '' })
    expect(acc.snapshot().shots).toHaveLength(2)
  })

  it('分镜方向修改（2026-07-07）：reviseCastShotDirection 原地改已挂角色镜方向，不新增镜、追加一条决策', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.addShot({ kind: 'character', label: '星依', direction: '星依温柔地问候' })
    acc.reviseCastShotDirection('星依', '星依态度转为强硬质问', '据纠偏，语气应更强硬')
    const stream = acc.snapshot()
    // 仍只有一镜，方向已更新（不是裂成两镜）。
    expect(stream.shots).toEqual([
      { id: 'shot_1', kind: 'character', label: '星依', order: 1, direction: '星依态度转为强硬质问', avatar: '星' }
    ])
    expect(stream.decisions.at(-1)).toMatchObject({ kind: 'castDir', text: '改 星依 的本轮方向：据纠偏，语气应更强硬' })
  })

  it('reviseCastShotDirection：找不到该角色镜（未曾 addShot）时安静忽略，不追加决策', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.reviseCastShotDirection('不存在的角色', '新方向', '')
    const stream = acc.snapshot()
    expect(stream.shots).toEqual([])
    expect(stream.decisions).toEqual([])
  })

  it('分镜方向修改（2026-07-07）：reviseNarrationShotDirection 按确认顺序改第 index 面旁白镜方向', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'unknown', toolName: '', thought: '先定第一条旁白', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'confirmNarrationCall', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'confirmNarrationCall', status: 'success', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'thought', stage: 'unknown', toolName: '', thought: '再定第二条旁白', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'confirmNarrationCall', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'confirmNarrationCall', status: 'success', turnIndex: 1 })
    acc.reviseNarrationShotDirection(1, '第二条旁白改写为更浓的秋意', '据纠偏调整氛围')
    const stream = acc.snapshot()
    const narrationShots = stream.shots.filter((s) => s.kind === 'narration')
    expect(narrationShots).toHaveLength(2)
    expect(narrationShots[0].direction).toBe('先定第一条旁白') // 第一条未改，保留原方向
    expect(narrationShots[1].direction).toBe('第二条旁白改写为更浓的秋意')
    expect(stream.decisions.at(-1)).toMatchObject({ kind: 'narrationDir', text: '改旁白2方向：据纠偏调整氛围' })
  })

  it('reviseNarrationShotDirection：下标越界时安静忽略，不追加决策', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'unknown', toolName: '', thought: '定一条旁白', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'confirmNarrationCall', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'confirmNarrationCall', status: 'success', turnIndex: 0 })
    const beforeCount = acc.snapshot().decisions.length
    acc.reviseNarrationShotDirection(5, '越界的新方向', '')
    expect(acc.snapshot().decisions).toHaveLength(beforeCount)
  })

  it('E1 群聊收束端到端：grounding 决策(onProgress) + 收束补 thoughts 决策 + cast/旁白镜 + done', () => {
    const acc = createTidiaoDirectorStreamAccumulator()
    // grounding 期：per-turn thought + 读工具条
    acc.onRuntimeProgress({ kind: 'thought', stage: 'unknown', toolName: '', thought: '先读历史', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'unknown', toolName: 'readChatMessage', turnIndex: 0 })
    acc.onRuntimeProgress({ kind: 'tool-result', stage: 'unknown', toolName: 'readChatMessage', status: 'success', turnIndex: 0 })
    // 收束：补 thoughts 决策 + 整轮分镜
    acc.noteDecision('note', '让星依先接话')
    acc.addShot({ kind: 'narration', label: '旁白', direction: '雨声旁白' })
    acc.addShot({ kind: 'character', label: '星依', direction: '星依回忆望舒台' })
    acc.setPhase('done')

    const stream = acc.snapshot()
    expect(stream.phase).toBe('done')
    // 决策流：grounding 旁述（带工具条）+ 计划旁述（一份）
    expect(stream.decisions[0].text).toBe('先读历史')
    expect(stream.decisions[0].tool).toMatchObject({ tool: 'readChatMessage', label: '读会话消息', status: 'done' })
    expect(stream.decisions.at(-1).text).toBe('让星依先接话')
    // 分镜：旁白镜 + 角色镜（独立镜，不绑定决策）
    expect(stream.shots).toEqual([
      { id: 'shot_1', kind: 'narration', label: '旁白', order: 1, direction: '雨声旁白' },
      { id: 'shot_2', kind: 'character', label: '星依', order: 2, direction: '星依回忆望舒台', avatar: '星' }
    ])
  })
})

// R3-3「directorStream 是 log 投影」：收束时把最终人话决策 flush 进 append log（保真源）。
describe('R3-3·决策 flush 进 append log', () => {
  afterEach(() => { activeAgentAppendLog.value = null })

  it('setPhase(done) 把人话决策 flush 进活动 log，跳过纯工具行占位', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '判定为宾馆清晨', turnIndex: 0 })
    // 纯工具行（无 thought 那轮）：决策 text 等于工具标签 → 不进 log（结果由 toolResult 事件保真）。
    acc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-generation', toolName: 'recallSemantic', turnIndex: 1 })
    acc.onRuntimeProgress({ kind: 'tool-result', toolName: 'recallSemantic', status: 'success', resultPreview: '命中', turnIndex: 1 })
    acc.setPhase('done')
    const decisions = getAppendLogEvents('r1').filter((e) => e.type === 'decision')
    expect(decisions).toHaveLength(1)
    expect(decisions[0].decision.text).toBe('判定为宾馆清晨')
  })

  it('done/fail 不重复 flush（一次性）；无活动 log 时零副作用', () => {
    // 无活动 log：不抛错、零副作用
    const accNoLog = createTidiaoDirectorStreamAccumulator()
    accNoLog.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: 'x', turnIndex: 0 })
    expect(() => accNoLog.setPhase('done')).not.toThrow()

    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    const acc = createTidiaoDirectorStreamAccumulator()
    acc.onRuntimeProgress({ kind: 'thought', stage: 'scenario-routing', toolName: '', thought: '只此一条', turnIndex: 0 })
    acc.setPhase('done')
    acc.setPhase('done') // 再次：不重复 flush
    expect(getAppendLogEvents('r1').filter((e) => e.type === 'decision')).toHaveLength(1)
  })
})
