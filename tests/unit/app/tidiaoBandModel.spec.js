import { describe, expect, it } from 'vitest'
import { buildTidiaoBandModel, buildTidiaoShotDetail } from '../../../src/app/tidiaoBandModel.ts'

function doneView(overrides = {}) {
  return {
    steps: { scenario: 'done', plan: 'done', reply: 'done' },
    failed: false,
    elapsed: '3.2s',
    mode: 'personality_model',
    narration: null,
    reviewDegrade: null,
    stepElapsed: {},
    orchestration: null,
    ...overrides
  }
}

describe('buildTidiaoBandModel', () => {
  it('view 为空返回 null', () => {
    expect(buildTidiaoBandModel(null)).toBeNull()
    expect(buildTidiaoBandModel(undefined)).toBeNull()
  })

  it('全步骤收束 → done 相位 + 完成动作 + 步骤计数', () => {
    const model = buildTidiaoBandModel(doneView())
    expect(model.phase).toBe('done')
    expect(model.currentAction).toContain('本轮编排完成')
    expect(model.currentAction).toContain('3.2s')
    expect(model.stepLabel).toBe('3 / 3')
  })

  it('failed → failed 相位 + 失败原因', () => {
    const model = buildTidiaoBandModel(doneView({ failed: true, reviewDegrade: { reason: '模型连接超时' } }))
    expect(model.phase).toBe('failed')
    expect(model.failureReason).toBe('模型连接超时')
    expect(model.currentAction).toBe('模型连接超时')
  })

  it('有步骤未收束 → running 相位', () => {
    const model = buildTidiaoBandModel(doneView({ steps: { scenario: 'done', plan: 'running' } }))
    expect(model.phase).toBe('running')
    expect(model.currentAction).toBe('正在统筹本轮…')
  })

  it('orchestration 映射理解(情境标签)与留痕(orchestrationSummary)', () => {
    const model = buildTidiaoBandModel(doneView({
      orchestration: { scenario: 'pressure', orchestrationSummary: '本轮以压力情境推进，埋下冲突。', strategies: ['正面回应'] }
    }))
    expect(model.script.understanding.tags[0].label).toBe('压力')
    expect(model.script.trace.note).toBe('本轮以压力情境推进，埋下冲突。')
  })

  it('未知 scenario 原样作标签', () => {
    const model = buildTidiaoBandModel(doneView({ orchestration: { scenario: 'mystery', orchestrationSummary: '', strategies: [] } }))
    expect(model.script.understanding.tags[0].label).toBe('mystery')
  })

  it('旁白 willGenerate + 角色 → 分镜两镜(旁白不打二分类标注)', () => {
    const model = buildTidiaoBandModel(
      doneView({ narration: { willGenerate: true, reason: '描写大厅引出老人' } }),
      { speakerName: '林雪云', speakerAvatar: '林' }
    )
    expect(model.script.shots).toHaveLength(2)
    expect(model.script.shots[0].kind).toBe('narration')
    expect(model.script.shots[0].sub).toBe('描写大厅引出老人')
    expect(model.script.shots[0].informationBearing).toBeUndefined() // 现役无二分类源，不标注
    expect(model.script.shots[1].kind).toBe('character')
    expect(model.script.shots[1].label).toBe('林雪云')
    expect(model.script.shots[1].avatar).toBe('林')
  })

  it('orchestration.narrationCalls → 旁白镜暴露提示词预览 + 点亮二分类', () => {
    const model = buildTidiaoBandModel(
      doneView({
        orchestration: {
          scenario: '', orchestrationSummary: '', strategies: [],
          narrationCalls: [{ label: '环境旁白', reason: '承接进屋', promptPreview: '壁炉火光下长桌旁坐着陌生老人', informationBearing: true }]
        }
      }),
      { speakerName: '林雪云', speakerAvatar: '林' }
    )
    expect(model.script.shots).toHaveLength(2)
    expect(model.script.shots[0].kind).toBe('narration')
    expect(model.script.shots[0].label).toBe('环境旁白')
    expect(model.script.shots[0].sub).toBe('提示词：壁炉火光下长桌旁坐着陌生老人')
    expect(model.script.shots[0].informationBearing).toBe(true) // 二分类已接通
  })

  it('narrationCalls 无提示词预览时回退确认理由，纯描写标注', () => {
    const model = buildTidiaoBandModel(doneView({
      orchestration: {
        scenario: '', orchestrationSummary: '', strategies: [],
        narrationCalls: [{ label: '旁白', reason: '仅烘托夜色', promptPreview: '', informationBearing: false }]
      }
    }))
    expect(model.script.shots[0].sub).toBe('仅烘托夜色')
    expect(model.script.shots[0].informationBearing).toBe(false)
  })

  it('orchestration.retrieval → 取料块工具中文标签 + 检索词（批次3 D4）', () => {
    const model = buildTidiaoBandModel(doneView({
      orchestration: {
        scenario: '', orchestrationSummary: '', strategies: [], narrationCalls: [],
        retrieval: [
          { tool: 'searchWorldText', query: '鹿角厅', reason: '用户提到不认识的专名', hitCount: 1 },
          { tool: 'fetchUnitDetail', query: '山庄大厅设定', reason: '取正文细节', hitCount: 0 }
        ]
      }
    }))
    expect(model.script.retrieval).toEqual([
      { tool: '文本搜索', query: '鹿角厅' },
      { tool: '定点读取', query: '山庄大厅设定' }
    ])
  })

  it('retrieval 缺省（旧持久化数据）不报错、不出取料块', () => {
    const model = buildTidiaoBandModel(doneView({
      orchestration: { scenario: 'pressure', orchestrationSummary: '', strategies: [], narrationCalls: [] }
    }))
    expect(model.script.retrieval).toBeUndefined()
    expect(model.script.understanding.tags[0].label).toBe('压力')
  })

  it('未知取料工具名原样保留作标签', () => {
    const model = buildTidiaoBandModel(doneView({
      orchestration: {
        scenario: '', orchestrationSummary: '', strategies: [], narrationCalls: [],
        retrieval: [{ tool: 'recallSemantic', query: '大厅氛围', reason: '', hitCount: 3 }]
      }
    }))
    expect(model.script.retrieval).toEqual([{ tool: '语义召回', query: '大厅氛围' }])
  })

  it('无旁白无 orchestration 但有角色 → 仅一镜角色、无理解无留痕', () => {
    const model = buildTidiaoBandModel(doneView(), { speakerName: '星依' })
    expect(model.script.shots).toHaveLength(1)
    expect(model.script.shots[0].label).toBe('星依')
    expect(model.script.understanding).toBeUndefined()
    expect(model.script.trace).toBeUndefined()
  })

  it('什么富块都没有 → script 为 undefined（band 仅显示相位/底栏）', () => {
    const model = buildTidiaoBandModel(doneView())
    expect(model.script).toBeUndefined()
    expect(model.narration).toEqual([])
  })

  it('实时旁述（D5）：thoughts → narration 行，done 相位均不流式', () => {
    const model = buildTidiaoBandModel(doneView({ thoughts: ['先读情境', '查不认识的专名', '生成候选'] }))
    expect(model.narration).toEqual([
      { text: '先读情境' },
      { text: '查不认识的专名' },
      { text: '生成候选' }
    ])
  })

  it('实时旁述（D5）：running 相位最后一句标流式（带光标）', () => {
    const model = buildTidiaoBandModel(doneView({
      steps: { scenario: 'done', plan: 'running' },
      thoughts: ['先读情境', '正在生成候选']
    }))
    expect(model.phase).toBe('running')
    expect(model.narration).toEqual([
      { text: '先读情境' },
      { text: '正在生成候选', streaming: true }
    ])
  })

  it('实时旁述（D5）：thoughts 缺省/空串 → narration 空、不报错', () => {
    expect(buildTidiaoBandModel(doneView()).narration).toEqual([])
    expect(buildTidiaoBandModel(doneView({ thoughts: ['', '  '] })).narration).toEqual([])
  })

  it('mode 选项透传', () => {
    expect(buildTidiaoBandModel(doneView(), { mode: 'expand' }).mode).toBe('expand')
    expect(buildTidiaoBandModel(doneView()).mode).toBe('expand') // 默认
  })

  // 批次5b：编排带停止挂起 → correcting 相位覆盖 + 底栏纠偏文本 + 暂停动作。
  it('correction.active → correcting 相位覆盖 running/done，带纠偏文本与暂停动作', () => {
    const model = buildTidiaoBandModel(
      doneView({ steps: { scenario: 'done', plan: 'running' } }),
      { correction: { active: true, text: '老人这轮先别出场' } }
    )
    expect(model.phase).toBe('correcting')
    expect(model.correction).toBe('老人这轮先别出场')
    expect(model.currentAction).toBe('已暂停 · 在下方输入框继续指挥提调')
  })

  it('correction.active 覆盖 failed 相位（停止挂起优先于失败判定）', () => {
    const model = buildTidiaoBandModel(
      doneView({ failed: true, reviewDegrade: { reason: '中断' } }),
      { correction: { active: true } }
    )
    expect(model.phase).toBe('correcting')
    expect(model.correction).toBe('')
  })

  it('correction.active=false 不进 correcting（维持原相位、不带 correction 字段）', () => {
    const model = buildTidiaoBandModel(doneView(), { correction: { active: false, text: 'x' } })
    expect(model.phase).toBe('done')
    expect(model.correction).toBeUndefined()
  })

  // 纠偏挂起仍保留半成品实时旁述/剧本（停在原地），只换相位与底栏。
  it('correcting 仍保留 thoughts/script（半成品停在原地）', () => {
    const model = buildTidiaoBandModel(
      doneView({ thoughts: ['先读情境', '查专名'], orchestration: { scenario: 'pressure', orchestrationSummary: '埋悬念', strategies: [], narrationCalls: [] } }),
      { correction: { active: true, text: '改一下' } }
    )
    expect(model.phase).toBe('correcting')
    expect(model.narration).toEqual([{ text: '先读情境' }, { text: '查专名' }])
    expect(model.script.understanding.tags[0].label).toBe('压力')
    expect(model.script.trace.note).toBe('埋悬念')
  })
})

describe('buildTidiaoShotDetail（形态1·E5 角色镜钻取明细）', () => {
    it('view 为空返回 null', () => {
      expect(buildTidiaoShotDetail(null)).toBeNull()
      expect(buildTidiaoShotDetail(undefined)).toBeNull()
    })

    it('含步骤/情境/取料 → 明细齐全 + personality_model 标 hasReview', () => {
      const detail = buildTidiaoShotDetail(doneView({
        orchestration: {
          scenario: 'pressure',
          orchestrationSummary: '',
          strategies: [],
          retrieval: [{ tool: 'recallSemantic', query: '望舒台', reason: '', hitCount: 3 }]
        }
      }))
      expect(detail.stepLabel).toBe('3 / 3')
      expect(detail.elapsed).toBe('3.2s')
      expect(detail.scenario).toBe('压力')
      // 取料工具机器名→中文标签复用 buildTidiaoBandModel 的映射，避免重复维护标签表。
      expect(detail.retrieval).toEqual([{ tool: '语义召回', query: '望舒台' }])
      expect(detail.hasReview).toBe(true)
    })

    it('normal_recall 模式无评审步 → hasReview=false', () => {
      const detail = buildTidiaoShotDetail(doneView({ mode: 'normal_recall' }))
      expect(detail.hasReview).toBe(false)
      // 仅步骤、无情境/取料时仍返回（步骤可展示）。
      expect(detail.stepLabel).toBe('3 / 3')
      expect(detail.scenario).toBeUndefined()
      expect(detail.retrieval).toBeUndefined()
    })

    it('无步骤/情境/取料（全空）→ 返回 null（不给角色镜挂"点开"）', () => {
      expect(buildTidiaoShotDetail({
        steps: {}, failed: false, elapsed: '', mode: 'personality_model',
        narration: null, reviewDegrade: null, stepElapsed: {}, orchestration: null
      })).toBeNull()
    })

    // 动态工作流步骤轨：复刻旧工作流节点轨骨架，但只长出实际跑过的步骤（id 在 steps 里出现才成节点）。
    it('动态步骤轨：按注册表顺序只长出实际跑过的步骤 + 中文标签/图标/状态/单步耗时', () => {
      const detail = buildTidiaoShotDetail(doneView({
        steps: { projection: 'done', recall: 'running', compose: 'waiting' },
        stepElapsed: { projection: '0.3s', recall: '1.1s' }
      }))
      expect(detail.steps.map((s) => s.id)).toEqual(['projection', 'recall', 'compose'])
      expect(detail.steps[0]).toEqual({ id: 'projection', label: '生成上下文投影', icon: 'layers', status: 'done', elapsed: '0.3s' })
      // 运行中不带半截耗时
      expect(detail.steps[1]).toMatchObject({ id: 'recall', status: 'running' })
      expect(detail.steps[1].elapsed).toBeUndefined()
      expect(detail.steps[2]).toMatchObject({ id: 'compose', status: 'waiting' })
    })

    it('plan 步文案随 mode 区分：personality_model=候选计划 / normal_recall=回复计划', () => {
      expect(buildTidiaoShotDetail(doneView({ steps: { plan: 'done' } })).steps[0].label).toBe('生成候选计划')
      expect(buildTidiaoShotDetail(doneView({ steps: { plan: 'done' }, mode: 'normal_recall' })).steps[0].label).toBe('生成回复计划')
    })

    it('未知 step id（未来灵活步骤）兜底追加在已知步骤后：id 作标签、无图标', () => {
      const detail = buildTidiaoShotDetail(doneView({ steps: { projection: 'done', webSearch: 'done' } }))
      expect(detail.steps.map((s) => s.id)).toEqual(['projection', 'webSearch'])
      expect(detail.steps.find((s) => s.id === 'webSearch')).toMatchObject({ label: 'webSearch', icon: '' })
    })

    it('评审降级 / 失败态透传到钻取明细', () => {
      const detail = buildTidiaoShotDetail(doneView({
        steps: { review: 'failed' },
        failed: true,
        reviewDegrade: { reason: 'ReRanker 未运行' }
      }))
      expect(detail.reviewDegrade).toEqual({ reason: 'ReRanker 未运行' })
      expect(detail.failed).toBe(true)
    })
  })
