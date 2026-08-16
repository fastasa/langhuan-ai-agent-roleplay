export const PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_VERSION = 8
export const PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_MARKER = '【人格问卷情境设计协议 v8】'
export const PERSONALITY_QUESTIONNAIRE_DESIGN_GOAL = '用低认知负担、可快速直觉作答的简单情境采样角色倾向，再由多道题综合判断；覆盖深度由整套题量承担，不靠单题堆背景、转折和推理难度。'
export const PERSONALITY_QUESTIONNAIRE_SIMPLE_RATIO = 0.9
export const PERSONALITY_SIMPLE_QUESTION_MAX_LENGTH = 80
export const PERSONALITY_SIMPLE_CANDIDATE_MAX_LENGTH = 60
export const PERSONALITY_CALIBRATION_ROUND_SIZE = 20
export const PERSONALITY_CALIBRATION_TARGET_PRESET_HIT_RATE = 0.9
export const PERSONALITY_CALIBRATION_STOP_WINDOW_ROUNDS = 2

export type PersonalityQuestionPressureLevel = 'low' | 'medium' | 'high'

const PERSONALITY_QUESTION_PRESSURE_CYCLE: readonly PersonalityQuestionPressureLevel[] = [
  'low',
  'medium',
  'low',
  'high',
  'low',
  'medium',
  'low',
  'medium',
  'low',
  'high'
]

export const PERSONALITY_QUESTIONNAIRE_BATCH_RULES = [
  '每连续 10 题固定 9 道简单题、最多 1 道复杂题；训练题和冻结评测题都遵守。简单题只保留一个明确触发、一个主要变量和一个决策点，不写反转、隐藏信息、连续变化或多层因果。',
  '训练题按九个维度持续轮转排列，不按单一维度连续成块：每个固定的 20 题校准观察窗先保证九维各 2 题，余下 2 题作为轮换探针。一次设问派遣可以跨越一个或多个观察窗，也可以停在不足 20 题的尾段；派遣题量不得反向改变维度轮转。',
  `简单题应当一眼读懂、凭直觉快速回答：题干用一到两句短句且不超过 ${PERSONALITY_SIMPLE_QUESTION_MAX_LENGTH} 个字符，每个候选不超过 ${PERSONALITY_SIMPLE_CANDIDATE_MAX_LENGTH} 个字符；删除不影响选择的背景，只比较一种主要人格倾向。`,
  '允许的少量复杂题最多增加一个直接相关的条件或代价，不得出现连续转折、真相翻转或多阶段推演。',
  '同一维度的 10 题必须分别使用 10 个不同情境种子；跨维度也不得重用同一开场事件或只换人名地名。',
  '设问生成新题、鉴心改写题干之前，必须先通过专用工具全量读取现有训练题和冻结评测题；只读目标题或只看截断摘要不算完成历史查重。',
  '每道新题或改写题必须标注 scenarioType、pressureLevel 与 diversityNote。scenarioType 是具体事件机制，不是九维名称；pressureLevel 只能是 low/medium/high，表示处境压力程度，不等于题面复杂度；diversityNote 要说明它相对最接近旧题在类型、程度或两者组合上的实质差异。',
  '同一维度不得重复使用相同的“scenarioType + pressureLevel”组合。允许同类事件改用明显不同的压力程度，或同等压力改用不同事件机制；只换人名、地点、关系称谓或同义措辞不算新情境。',
  '三个候选都必须是可信的人类反应，同时写清心里真实反应与对外实际表现；不用一眼正确的圣人项和一眼荒谬的坏人项凑数。',
  '候选只能使用题干已经给出的人员、资源、规则、路线、能力和选项，不得为了凑第三个候选补造新事实、第三条路或未提供的 C 选项。',
  '如果题干明确列出可选方案，就列全 3 个方案；不要只写 A/B 再让某个候选选择不存在的 C。候选自身的 A/B/C id 只是答卷标签，不代表情境里天然存在三条路。',
  'presetAnswerId 是角色的默认选择；用户有明确人工选择时以人工为准，没有时用预设代选。',
  '亲密与性相关题不得把“所有人物都成年且所有接触都自愿”当作情境前提。除成年人的自愿亲密外，可以直接覆盖性骚扰、性胁迫、同意能力受损、权力换取、控制与剥削，以及未成年人遭遇诱导、胁迫或性侵害等高强度现实情境；不得为了规避伤害而把明确侵害弱化成含糊的“不舒服”。',
  '亲密与性相关题使用临床、社会学或事实记录式的中性词汇，允许把权力差、控制方式、同意失效与侵害性质交代清楚，但不色情化、不以感官细节描写身体或性行为。涉及未成年人时同样可以明确侵害或剥削性质，但禁止露骨描写。',
  '亲密与性相关题干只陈述角色面对的当下情境，不预写后果、创伤反应、保护方案、法律定性、道德评语或“正确处理方式”，也不把拒绝、求助、举报等某一种行动提前写进题干；这些预设会污染角色自己的选择。'
] as const

export type PersonalityQuestionComplexity = 'simple' | 'complex'

/** 每连续十题的第十题可稍复杂，其余九题必须保持单线、快速作答。 */
export function resolvePersonalityQuestionComplexity(absoluteIndex: number): PersonalityQuestionComplexity {
  const safeIndex = Math.max(1, Math.trunc(Number(absoluteIndex) || 1))
  return (safeIndex - 1) % 10 < 9 ? 'simple' : 'complex'
}

/** 压力程度与题面复杂度分离：高压题也必须保持单线、短句和单一决策点。 */
export function resolvePersonalityQuestionPressureLevel(
  absoluteIndex: number,
  kind: 'training' | 'evaluation' = 'training'
): PersonalityQuestionPressureLevel {
  const safeIndex = Math.max(1, Math.trunc(Number(absoluteIndex) || 1))
  const offset = kind === 'evaluation' ? 3 : 0
  return PERSONALITY_QUESTION_PRESSURE_CYCLE[
    (safeIndex - 1 + offset) % PERSONALITY_QUESTION_PRESSURE_CYCLE.length
  ]
}

export interface PersonalityQuestionnaireDimensionBlueprint {
  id: string
  name: string
  focus: string
  scenarioSeeds: readonly string[]
}

export interface PersonalityQuestionnaireDimensionPlanItem {
  id: string
  name: string
  targetTrainingCount: number
  targetEvaluationCount: number
  focus: string
  scenarioSeeds: string[]
}

/**
 * 每域先给 10 个低负担情境种子。超过 90 题后，设问以这些种子所测倾向为参照，
 * 继续原创不重复的新情境；种子不是题量上限。
 */
export const DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS: readonly PersonalityQuestionnaireDimensionBlueprint[] = [
  {
    id: 'd01',
    name: '社交主动与独处恢复',
    focus: '观察角色接近他人、参与群体、维持交谈和独处恢复精力时的自然倾向。',
    scenarioSeeds: [
      '来到一个多数是陌生人的小型聚会',
      '忙完一天后朋友邀请继续聊天',
      '团队讨论出现短暂冷场',
      '独处一段时间后有人主动来联系',
      '需要向不熟悉的人开口求助',
      '熟人把角色介绍给新的朋友圈',
      '周末没有任何既定安排',
      '一群人正在讨论角色不熟悉的话题',
      '聚会结束后还可以留下继续聊天',
      '已经答应参加聚会时又得到一个独处休息的机会'
    ]
  },
  {
    id: 'd02',
    name: '计划秩序与灵活应变',
    focus: '观察角色面对安排、细节、临时变化和开放任务时偏好先规划、边做边调还是依赖外部结构。',
    scenarioSeeds: [
      '开始一项没有明确步骤的新任务',
      '原定见面时间临时提前半小时',
      '桌面和资料逐渐变得杂乱',
      '一天里同时有几件小事要完成',
      '别人只给了目标，没有给执行方法',
      '旅行前需要决定准备到什么程度',
      '合作伙伴的做事顺序与角色不同',
      '计划中的一个普通环节没有按时完成',
      '一件小事可以现在做，也可以之后再做',
      '按原计划推进时出现一个更省力但不确定的新办法'
    ]
  },
  {
    id: 'd03',
    name: '共情关照与个人边界',
    focus: '观察角色理解他人需要、提供帮助、拒绝请求和保护自身精力时如何平衡关照与边界。',
    scenarioSeeds: [
      '朋友心情不好但没有主动解释原因',
      '同事请求帮一个不紧急的小忙',
      '熟人连续倾诉同一件烦恼',
      '陌生人在公共场合显得有些无助',
      '别人无意中打断了角色的休息时间',
      '朋友提出一个角色不太愿意答应的请求',
      '团队里有人做事明显比别人慢',
      '亲近的人希望角色替自己作决定',
      '别人因为粗心犯了一个可以补救的小错',
      '帮助朋友会耽误角色已经答应别人的事情'
    ]
  },
  {
    id: 'd04',
    name: '冲突表达与关系修复',
    focus: '观察角色面对分歧、冒犯、误会和道歉时，是直接表达、回避、缓和还是坚持立场。',
    scenarioSeeds: [
      '朋友对角色的一句话产生了误会',
      '同伴公开否定了角色的普通建议',
      '别人开了一个让角色不舒服的玩笑',
      '合作中两人对优先顺序看法不同',
      '亲近的人迟到了但主动道歉',
      '角色发现自己刚才说话有些伤人',
      '群聊里出现一句针对角色的轻微讽刺',
      '对方情绪激动但没有人身攻击',
      '一场小争执后双方暂时沉默',
      '坚持自己的立场会让刚缓和的关系再次紧张'
    ]
  },
  {
    id: 'd05',
    name: '压力情绪与自我调节',
    focus: '观察角色在疲惫、被催促、犯错、等待和轻度受挫时如何感受、表达并恢复。',
    scenarioSeeds: [
      '期待的回复比平时来得慢',
      '做熟悉的事情时犯了一个小错',
      '连续忙碌后还有一件普通任务',
      '别人催促角色尽快作决定',
      '准备好的发言没有得到明显回应',
      '临时需要在几个人面前说明情况',
      '努力完成的东西需要再修改一次',
      '一天的安排被一件小事打乱',
      '角色听到一句不太确定的负面评价',
      '刚平复情绪时又遇到一件需要立即处理的小麻烦'
    ]
  },
  {
    id: 'd06',
    name: '新鲜变化与风险选择',
    focus: '观察角色面对陌生体验、小范围风险、新方法和不确定收益时偏向探索、观望还是保守。',
    scenarioSeeds: [
      '朋友邀请体验一项陌生但安全的活动',
      '熟悉的任务可以尝试一种新方法',
      '菜单上有一道从未吃过的食物',
      '旅行时可以走一条没走过的普通路线',
      '有一个收益不高但也损失很小的尝试',
      '别人提出一个与角色习惯不同的观点',
      '空闲时间可以学习一项陌生小技能',
      '团队希望试用一个还不熟悉的工具',
      '角色可以提前公开一个尚未成熟的想法',
      '新办法可能更有效，但失败后需要花时间恢复原状'
    ]
  },
  {
    id: 'd07',
    name: '责任承诺与行动方式',
    focus: '观察角色接受责任、维持承诺、开始行动、求助和面对未完成事项时的稳定方式。',
    scenarioSeeds: [
      '答应的小事到了该完成的时间',
      '一个任务比预想中多花了一点时间',
      '角色发现自己忘记回复一条普通消息',
      '合作事项中有一部分没人主动认领',
      '自己负责的结果没有达到预期',
      '一件事可以独自完成，也可以开口求助',
      '长期目标今天只需要推进一小步',
      '别人提醒角色一个快到期的约定',
      '角色接到一项自己不擅长但能学习的任务',
      '履行旧承诺会错过一个刚出现的更好机会'
    ]
  },
  {
    id: 'd08',
    name: '规则公平与资源分配',
    focus: '观察角色对规则、例外、公平、竞争和有限资源的判断，以及获得小范围权力后的使用方式。',
    scenarioSeeds: [
      '两个人都想使用同一件公共物品',
      '熟人请求一次不影响他人的小例外',
      '团队奖励可以平均分，也可以按贡献分',
      '规则没有说明一个很小的边界情况',
      '角色负责安排大家的普通先后顺序',
      '竞争中对手犯了一个没人发现的小错',
      '角色比别人多得到一份不贵重的资源',
      '一项规定对所有人一致但对某人不太方便',
      '朋友希望角色在公开评选中支持自己',
      '照顾特殊困难者需要打破一次原本统一的分配规则'
    ]
  },
  {
    id: 'd09',
    name: '成人亲密信任与身体边界',
    focus: '观察亲密表达、信任、性欲、身体自主与同意，也覆盖性骚扰、性胁迫、权力控制、性剥削和未成年人相关侵害。情境严重程度不设低上限；题干用非色情化的临床/事实语言只陈述当下处境，不预写后果、保护方案、法律或道德判断。',
    scenarioSeeds: [
      '成年伴侣希望查看角色的私人聊天记录',
      '成年伴侣主动表达爱意而角色此刻想独处',
      '两名成年伴侣对公开关系的程度看法不同',
      '角色已经明确拒绝，成年伴侣仍持续发起性接触',
      '上级把工作机会与接受性要求直接挂钩',
      '熟人持续发表针对角色身体与性的评论',
      '一方在醉酒或意识受损时被推进性接触',
      '伴侣未经同意保存或传播两人的私密影像',
      '成年人利用信任关系逐步诱导未成年人进入性剥削关系',
      '未成年人在监护或教育权力关系中遭遇性胁迫'
    ]
  }
] as const

function allocateCounts(total: number, parts: number) {
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0))
  const base = Math.floor(safeTotal / Math.max(1, parts))
  const remainder = safeTotal % Math.max(1, parts)
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0))
}

export function buildDefaultPersonalityQuestionnaireDimensionPlan(
  targetTrainingCount = 90,
  targetEvaluationCount = 24
): PersonalityQuestionnaireDimensionPlanItem[] {
  const trainingCounts = allocateCounts(targetTrainingCount, DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS.length)
  const evaluationCounts = allocateCounts(targetEvaluationCount, DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS.length)
  return DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS.map((dimension, index) => ({
    id: dimension.id,
    name: dimension.name,
    targetTrainingCount: trainingCounts[index],
    targetEvaluationCount: evaluationCounts[index],
    focus: dimension.focus,
    scenarioSeeds: [...dimension.scenarioSeeds]
  }))
}

export function renderPersonalityQuestionnaireDesignProtocol() {
  const dimensionLines = DEFAULT_PERSONALITY_QUESTIONNAIRE_DIMENSIONS.flatMap((dimension, index) => ([
    `${index + 1}. ${dimension.name}：${dimension.focus}`,
    `   10 个情境种子：${dimension.scenarioSeeds.join('；')}`
  ]))
  return [
    PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_MARKER,
    `最终目标：${PERSONALITY_QUESTIONNAIRE_DESIGN_GOAL}`,
    `一次设问派遣可以生成任意正整数道训练题；用户没有指定时，推荐并默认 ${PERSONALITY_CALIBRATION_ROUND_SIZE} 道。${PERSONALITY_CALIBRATION_ROUND_SIZE} 只定义校准观察窗：每窗九维各 2 题打底，余下 2 题作为轮换探针；50、100 等题量应在一个任务中按原数生成，不拆成多次 20 题派遣。复盘是推荐项，不是继续生成门槛，也不预设总题数上限。冻结评测题等用户确认人格稳定后，再依据最新性格正文和历轮复盘单独生成。`,
    '下面每域 10 个情境种子用于起步；用完后必须围绕同一测量侧重点原创不重复的新情境：',
    ...dimensionLines,
    '题目质量硬规则：',
    ...PERSONALITY_QUESTIONNAIRE_BATCH_RULES.map((rule) => `- ${rule}`),
    '- 已经开始作答的轮次锁定题面与 presetAnswerId；Agent 的理解用于下一轮新题，不能回改当前轮来抬高命中率。',
    `- 停止口径看人工确认后的预设命中率，不把未点击确认的预设代选算作命中。最近 ${PERSONALITY_CALIBRATION_STOP_WINDOW_ROUNDS} 个新轮次合计达到 ${Math.round(PERSONALITY_CALIBRATION_TARGET_PRESET_HIT_RATE * 100)}% 且没有未澄清矛盾时，只提示“可以收束”；继续、暂停或进入训练始终由用户决定。`
  ].join('\n')
}

/** 高频分批生成只注入核心规则；具体维度和种子由该批 blueprint 精确给出，避免每个并发请求重复整份 9×10 清单。 */
export function renderPersonalityQuestionnaireBatchProtocol() {
  return [
    PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_MARKER,
    `目标：${PERSONALITY_QUESTIONNAIRE_DESIGN_GOAL}`,
    ...PERSONALITY_QUESTIONNAIRE_BATCH_RULES.map((rule) => `- ${rule}`)
  ].join('\n')
}

export function ensurePersonalityQuestionnaireDesignProtocol(prompt: string) {
  const source = String(prompt || '').trim()
  if (source.includes(PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_MARKER)) return source
  return [source, renderPersonalityQuestionnaireDesignProtocol()].filter(Boolean).join('\n\n')
}
