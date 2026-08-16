import {
  PERSONALITY_CALIBRATION_ROUND_SIZE,
  PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_VERSION,
  renderPersonalityQuestionnaireDesignProtocol
} from '../../../shared/personalityQuestionnaireDesign.js'

type CharacterProfile = Record<string, unknown>

function text(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function profileLine(label: string, value: unknown) {
  const content = text(value).trim()
  return content ? `- ${label}: ${content}` : ''
}

// 聊天投影优化出题（第 6 批）：训练材料只读消息投影的客观事实，不读聊天原文长历史。
// 每条投影事实生成一组三选一题；预设答案只作未人工改选时的正式兜底。
export function buildPersonalityChatSamplePrompt(input: {
  character: CharacterProfile
  projectionItems: Array<{ fact: string; speakerName?: string; sessionTitle?: string; time?: string }>
}) {
  const character = input.character || {}
  const items = (input.projectionItems || []).filter((item) => text(item.fact).trim())
  const basePrompt = [
    '你是琅嬛的人格模型训练数据设计助手。',
    '你的任务是根据角色正式资料和该角色真实会话的消息投影事实，生成可由用户逐条确认的选择题式训练草稿。',
    '输出必须是 JSON，不要输出 Markdown，不要解释内部规则。',
    '',
    '角色资料:',
    profileLine('角色名', character.name),
    profileLine('性别', character.gender),
    profileLine('年龄', character.age),
    profileLine('简介', character.desc),
    profileLine('性格', character.personality),
    profileLine('说话风格', character.speakingStyle ?? character.speaking_style),
    profileLine('经历', character.experience),
    '',
    '会话投影事实列表（已按角色可见性过滤的客观事实，不含台词原文）:',
    ...items.map((item, index) => {
      const meta = [text(item.sessionTitle).trim(), text(item.time).trim()].filter(Boolean).join(' · ')
      return `${index + 1}. ${meta ? `[${meta}] ` : ''}${text(item.fact).trim()}`
    })
  ].filter(Boolean).join('\n')

  const promptPatchSet = [
    {
      id: 'chat-sample-question-groups',
      content: `为上面每条投影事实生成一组容易快速回答的训练题，共 ${items.length} 组。每组包含 question、candidates、presetAnswerId、dimension、difficulty、sourceHints。question 只把对应投影事实压缩成一个明确决策点：只写外部可观察事实，不写角色内心，不引用台词原文，也不得补造原事实里没有的人物、资源、选项、转折或后续事件。candidates 恰好 3 个候选计划：其中一个贴近角色在该情境下的实际做法，另外两个是可信但有偏差的反应，不得让错误项过于离谱。候选只能使用 question 已经给出的事实；如果 question 明确列出可选方案，就必须列全 3 个方案，禁止只给 A/B 再让候选选择不存在的 C。候选自身的 A/B/C id 只是答卷标签。每个候选的 text 用一句简短表达同时写清角色心里的真实反应和表面对外的实际表现。presetAnswerId 填写最贴近角色实际做法的候选 id；人工选择优先，没有人工选择时它作为正式默认答案。`
    },
    {
      id: 'answer-boundary',
      content: '除 presetAnswerId 外，不要再输出正确性分数、排序或分析理由；用户可以逐条改选，未改选时保留预设代选。'
    },
    {
      id: 'dimension-mapping',
      content: 'dimension 按情境归入：稳定特质 / 关系边界 / 压力反应 / 亲密表达 / 冲突处理 / 行动优先级 / 公共场合 / 危险场景 / 长期承诺 之一；dimension 必须填写中文维度名，不填写 d01/d02 等内部 id。'
    },
    {
      id: 'output-schema',
      content: '输出结构: { "dimensionPlan": [], "questionGroups": [] }。不要生成 evaluationQuestions。所有字段用中文自然语言，id 使用稳定短字符串。'
    }
  ]

  return {
    promptKind: 'personality_chat_sample_generation',
    version: 3,
    basePrompt,
    promptPatchSet,
    finalPrompt: [basePrompt, ...promptPatchSet.map((patch) => patch.content)].join('\n\n'),
    targetTrainingGroupCount: items.length,
    targetEvaluationQuestionCount: 0
  }
}

export function buildPersonalityQuestionnairePrompt(input: {
  character: CharacterProfile
  targetTrainingGroupCount?: number
  targetEvaluationQuestionCount?: number
}) {
  const character = input.character || {}
  const targetTrainingGroupCount = Number(input.targetTrainingGroupCount || PERSONALITY_CALIBRATION_ROUND_SIZE)
  const targetEvaluationQuestionCount = Number(input.targetEvaluationQuestionCount ?? 0)
  const basePrompt = [
    '你是琅嬛的人格模型训练数据设计助手。',
    '你的任务是根据角色正式资料，生成可由用户确认的选择题式训练草稿。',
    '输出必须是 JSON，不要输出 Markdown，不要解释内部规则。',
    '',
    '角色资料:',
    profileLine('角色名', character.name),
    profileLine('性别', character.gender),
    profileLine('年龄', character.age),
    profileLine('简介', character.desc),
    profileLine('外貌', character.appearance),
    profileLine('性格', character.personality),
    profileLine('说话风格', character.speakingStyle ?? character.speaking_style),
    profileLine('经历', character.experience),
    profileLine('世界观', character.worldview),
    profileLine('背景', character.background)
  ].filter(Boolean).join('\n')

  const promptPatchSet = [
    {
      id: 'training-question-groups',
      content: `生成 ${targetTrainingGroupCount} 组低认知负担、可快速直觉回答的训练题。运行时每 10 题生成并持久化一次，不要求单次模型调用产出整卷。每组必须包含 question、candidates、presetAnswerId、dimension、difficulty、scenarioType、pressureLevel、diversityNote、sourceHints。dimension 必须填写维度规划里的中文 name，不填写 d01/d02 等内部 id，也不留空。scenarioType 写具体事件机制，不照抄维度名；pressureLevel 只能是 low/medium/high，表示处境压力程度而非题面复杂度；diversityNote 说明相对最接近旧题在类型、程度或二者组合上的实质差异。每连续 10 题固定 9 道单线简单题、最多 1 道可增加一个条件的复杂题。candidates 恰好 3 个，其中只有一个最符合角色；每个候选必须使用 { "id": "A", "text": "...", "label": "A" } 结构，不使用 plan 字段。候选只能使用 question 已给出的事实；题干若明确列方案必须列全 3 个，禁止只给 A/B 再让候选补造 C。候选自身的 A/B/C id 只是答卷标签。每个候选的 text 用一句简短表达同时写清角色心里的真实反应和表面对外的实际表现。presetAnswerId 填写最符合角色的候选 id，作为无人工选择时的正式默认回答；用户可编辑候选或改选，人工选择永远优先。`
    },
    {
      id: 'shared-questionnaire-design-protocol',
      content: renderPersonalityQuestionnaireDesignProtocol()
    },
    {
      id: 'evaluation-set',
      content: `另生成 ${targetEvaluationQuestionCount} 道冻结评测题，放入 evaluationQuestions。评测题不得复用训练题原文，也不得泄露正确答案。`
    },
    {
      id: 'answer-boundary',
      content: '用户有明确人工选择时以人工答案为准；没有人工选择时，合法 presetAnswerId 作为正式默认选择进入训练和评测。人工确认数与预设代选数必须在摘要中分开展示。'
    },
    {
      id: 'output-schema',
      content: '整卷合并后的输出结构: { "dimensionPlan": [], "questionGroups": [], "evaluationQuestions": [] }。分批生成时只输出当前批次要求的顶层字段。所有字段用中文自然语言，id 使用稳定短字符串。'
    }
  ]

  return {
    promptKind: 'personality_questionnaire_generation',
    version: PERSONALITY_QUESTIONNAIRE_DESIGN_PROTOCOL_VERSION,
    basePrompt,
    promptPatchSet,
    finalPrompt: [basePrompt, ...promptPatchSet.map((patch) => patch.content)].join('\n\n'),
    targetTrainingGroupCount,
    targetEvaluationQuestionCount
  }
}
