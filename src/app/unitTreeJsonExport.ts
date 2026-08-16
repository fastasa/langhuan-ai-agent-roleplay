import type { UnitView } from '../types/unitView'
import { getUnitRelationRefId } from './relationHintReference'
import { buildCharacterCoreFieldGuide } from './characterProfilePromptGuidelines'

export type UnitTreeJsonNode = {
  unitId: string
  title: string
  domain: UnitView['domain']
  unitType: UnitView['unitType']
  contentKind: UnitView['contentKind']
  status: UnitView['status']
  parentId?: string
  sourceId?: string
  sourcePath?: string
  semanticType?: UnitView['semanticType']
  orderIndex?: number
  path: string[]
  body?: string
  compilePage?: UnitView['compilePage']
  metadata?: Record<string, unknown>
  children: UnitTreeJsonNode[]
}

export type UnitTreeJsonPayload = {
  kind: 'langhuan-unit-tree'
  schemaVersion: 1
  exportedAt: string
  sourceLabel?: string
  roots: UnitTreeJsonNode[]
}

export type BuildUnitTreeJsonPayloadInput = {
  units: UnitView[]
  rootUnitIds: string[]
  sourceLabel?: string
  exportedAt?: string
}

export type BuildUnitTreeMarkdownInput = BuildUnitTreeJsonPayloadInput
export type UnitTreeBodyPromptKind = 'docLibrary' | 'roleBrain' | 'trajectory'

export function buildUnitTreeJsonPayload(input: BuildUnitTreeJsonPayloadInput): UnitTreeJsonPayload {
  const exportedAt = input.exportedAt || new Date().toISOString()
  const units = Array.isArray(input.units) ? input.units : []
  const unitById = new Map(units.map((unit) => [unit.unitId, unit]))
  const childrenByParentId = new Map<string, UnitView[]>()
  units.forEach((unit) => {
    const parentId = String(unit.parentId || '').trim()
    if (!parentId) return
    if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, [])
    childrenByParentId.get(parentId)?.push(unit)
  })
  childrenByParentId.forEach((children) => children.sort(compareUnitOrder))
  const rootUnitIds = normalizeRootUnitIds(input.rootUnitIds, unitById)

  return {
    kind: 'langhuan-unit-tree',
    schemaVersion: 1,
    exportedAt,
    sourceLabel: input.sourceLabel,
    roots: rootUnitIds.map((unitId) => buildNode(unitById.get(unitId), childrenByParentId, []))
  }
}

export function buildUnitTreeMarkdown(input: BuildUnitTreeMarkdownInput): string {
  const payload = buildUnitTreeJsonPayload(input)
  const allNodes = payload.roots.flatMap((root) => flattenTree(root))
  const titleLines = Array.from(new Set(
    allNodes
      .map((node) => formatNodeReferenceTitle(node))
      .filter(Boolean)
  ))
  const documentNodes = allNodes.filter(shouldExportMarkdownBlock)
  const headerLabel = String(input.sourceLabel || payload.sourceLabel || '未命名单位').trim() || '未命名单位'
  const lines: string[] = [
    `# relationHints 生成材料：${headerLabel}`,
    '',
    '## 资料库中已有单位标题',
    ''
  ]
  if (titleLines.length) {
    titleLines.forEach((title) => {
      lines.push(`- ${title}`)
    })
  } else {
    lines.push('- 空')
  }

  documentNodes.forEach((node, index) => {
    lines.push(
      '',
      '---',
      '',
      `## 文档 ${index + 1}：${formatNodeReferenceTitle(node) || '未命名单位'}`,
      '',
      `路径：${formatPath(node.path)}`,
      '',
      '摘要：',
      formatMultilineBlock(node.compilePage?.summary),
      '',
      '标签：',
      formatTags(node.compilePage?.tags),
      '',
      '正文：',
      formatMultilineBlock(node.body),
      '',
      '已有 relationHints：',
      formatRelationHints(node.compilePage?.relationHints),
      '',
      '待生成 relationHints：'
    )
  })

  if (!documentNodes.length) {
    lines.push(
      '',
      '---',
      '',
      '## 文档 1：空',
      '',
      '路径：空',
      '',
      '摘要：',
      '空',
      '',
      '标签：',
      '空',
      '',
      '正文：',
      '空',
      '',
      '已有 relationHints：',
      '空',
      '',
      '待生成 relationHints：'
    )
  }

  return lines.join('\n')
}

export function buildUnitTreeMarkdownWithCompilePrompt(input: BuildUnitTreeMarkdownInput): string {
  return [
    buildUnitTreeMarkdown(input),
    '',
    '---',
    '',
    buildCompilePagePrompt()
  ].join('\n')
}

export function buildUnitTreeMarkdownWithBodyPrompt(input: BuildUnitTreeMarkdownInput, kind: UnitTreeBodyPromptKind = 'docLibrary'): string {
  return buildBodyPrompt(kind, input.sourceLabel)
}

function buildBodyPrompt(kind: UnitTreeBodyPromptKind, sourceLabel = '') {
  if (kind === 'trajectory') return buildTrajectoryBodyPrompt(sourceLabel)
  if (kind === 'roleBrain') return buildRoleBrainBodyPrompt(sourceLabel)
  return buildDocLibraryBodyPrompt(sourceLabel)
}

function buildDocLibraryBodyPrompt(sourceLabel = '') {
  return [
    '# 外部 AI 文档库正文生成提示词',
    '',
    `你将根据用户另行提供的文档库资料${sourceLabel ? `（${sourceLabel}）` : ''}，生成一个可导入的“批量正文 Markdown”。`,
    '',
    '## 输出总规则',
    '',
    '1. 只输出一个“# 琅嬛批量正文”Markdown，不要在结构外补解释文字。',
    '2. 必须为需要补写或改写正文的文档库单位生成独立正文块；不需要改写的单位可以不输出。',
    '3. 每个正文块必须先写一行 HTML 注释：<!-- target: 标题@正式ID -->，target 必须原样复制上方文档标题，包括 @正式ID。',
    '4. 不要改目标标题、路径、父子结构、来源链、关系系统状态或编译页关系提示。',
    '5. 正文要能直接写入琅嬛正文编辑器，不要写“本页描述”“本文记录”“该文档说明”等页面指称。',
    '6. 不要编造资料中没有的关键事实；信息不足时写成待确认表述，并在标签里加入“待确认”。',
    '7. 文档库正文要服务世界观资料沉淀，优先补足定义、结构、边界、来源、影响、与其他单位的差异，不要把摘要和标签机械扩写。',
    '',
    '## 可导入格式',
    '',
    '# 琅嬛批量正文',
    '',
    '<!-- target: 文档标题@正式ID -->',
    '',
    '## 字段',
    '- 简短摘要：80 字以内，概括正文最重要的变化或事实',
    '- 标签：3-8 个短标签，用顿号分隔；没有就写“无”',
    '',
    '## 正文',
    '这里写可直接导入目标单位的 Markdown 正文。使用自然段、列表或小标题均可；不要输出代码块包裹整篇正文。',
    '',
    '<!-- target: 下一篇文档标题@正式ID -->',
    '',
    '## 字段',
    '- 简短摘要：下一篇正文的摘要',
    '- 标签：标签1、标签2、标签3',
    '',
    '## 正文',
    '下一篇正文。'
  ].join('\n')
}

function buildRoleBrainBodyPrompt(sourceLabel = '') {
  return [
    '# 外部 AI 角色核心与灵魂正文生成提示词',
    '',
    `你将根据用户另行提供的角色资料${sourceLabel ? `（${sourceLabel}）` : ''}，生成一个可导入的“批量正文 Markdown”。`,
    '',
    '## 输出总规则',
    '',
    '1. 只输出一个“# 琅嬛批量正文”Markdown，不要在结构外补解释文字。',
    '2. 每个正文块必须先写一行 HTML 注释：<!-- target: 标题@正式ID -->，target 必须原样复制目标标题，包括 @正式ID。',
    '3. 核心单位服务角色一致性，只需要写正文；灵魂单位服务角色理解、价值判断、关系倾向和长期变化，可以同时写摘要与标签。',
    '4. 不要改目标标题、父子结构、来源链、关系系统状态或编译页关系提示。',
    '5. 正文要能直接写入琅嬛正文编辑器，不要写“本字段说明”“该节点记录”“本文描述”等页面指称。',
    '6. 不要编造资料中没有的关键事实；信息不足时写成待确认表述，并在标签里加入“待确认”。',
    '7. 核心正文应直接服务对应单位：简介、性格、目标与价值、外貌、说话风格、能力、经历、世界观、背景故事等；系统信息只记录姓名、性别、年龄、头像和预设，不写成人格正文。',
    '',
    buildCharacterCoreFieldGuide(),
    '',
    '## 可导入格式',
    '',
    '# 琅嬛批量正文',
    '',
    '<!-- target: 核心或灵魂标题@正式ID -->',
    '',
    '## 字段',
    '- 简短摘要：灵魂单位建议填写；核心单位可写“无”',
    '- 标签：灵魂单位建议写 3-8 个短标签；核心单位可写“无”',
    '',
    '## 正文',
    '这里写可直接导入目标核心单位或灵魂单位的 Markdown 正文。使用自然段、列表或小标题均可；不要输出代码块包裹整篇正文。',
    '',
    '<!-- target: 下一个核心或灵魂标题@正式ID -->',
    '',
    '## 字段',
    '- 简短摘要：下一篇正文的摘要或“无”',
    '- 标签：标签1、标签2、标签3，或“无”',
    '',
    '## 正文',
    '下一篇正文。'
  ].join('\n')
}

function buildTrajectoryBodyPrompt(sourceLabel = '') {
  return [
    '# 外部 AI 轨迹正文生成提示词',
    '',
    `你将根据用户另行提供的角色资料和时间资料${sourceLabel ? `（${sourceLabel}）` : ''}，生成一个可导入的“轨迹正文 Markdown”。`,
    '',
    '## 输出总规则',
    '',
    '1. 只输出一个“# 琅嬛轨迹正文”Markdown，不要在结构外补解释文字。',
    '2. 主要把阶段经历写在年枝或多年枝；少数高密度连续阶段写在月枝；极少数不可逆关键事件写成日桠。',
    '3. 每个条目必须写清粒度、标题、起止日期或日期，并补好副标题、简短摘要、标签、涉及对象、正式性和正文。',
    '4. 轨迹正文服务阶段经历，不要把角色设定表重新抄一遍；重点写变化、选择、代价、关系转折、长期影响。',
    '5. 不要编造资料中没有的关键事实；信息不足时写成待确认表述，并把正式性写为 unconfirmed。',
    '6. 日桠只用于极少数关键日，不要把普通阶段拆成大量日桠。',
    '7. 不要为了覆盖时间连续性而输出空年份、空月份或空日期；没有独立正文的年份不要单独写年枝。',
    '8. 跨多个年份的阶段必须写成一个多年枝条目，不要拆成每一年；只列重要阶段、重要月份和重要日期。',
    '9. 不要输出内部字段：id、sourceId、sourcePath、systemRole、startDate、endDate、pointDate、parentId、orderIndex。这些由琅嬛导入器根据时间和挂载范围生成。',
    '10. 日期真值只写在三级标题的时间段里；字段区不要另写“时间 / 起止 / 日期”，避免同一条目出现两套日期。',
    '11. “建议挂载”只写粒度提示：多年枝、年份、月份或日期；不要编造完整路径。',
    '12. 日桠默认导入为当天事件单位；如果确实是整天概述，字段区写“导入为：概览”；如果是角色在某时间段需要稳定遵守或被地点门禁读取的地点安排，字段区写“导入为：安排”。',
    '13. 事件单位只写已经发生或资料明确记载的事实：参与者、发生地点、发生时间、行为经过、结果、影响和资料依据；不要把未来计划、命令、待办或地点约束写成事件。',
    '14. 安排单位只写角色在某时间段应位于何处或应遵守的地点约束，不负责记录“在做什么”的活动流水；同地点不同活动通常不拆成多个地点安排。',
    '15. 安排单位正文必须使用 Markdown，正文顺序固定为“## 时间段”“## 地点描述”“## 角色具体位置”，最后可写“## 依据”。不要在正文里写地点关键词；关键词只写在标签、编译页标签和 locationKeywords 类材料里。',
    '16. “## 地点描述”要把地点层级和地点包含范围合并成自然语言：大地点简写，中地点稍作说明，小地点和中地点到小地点的过渡写清楚，让模型知道这一片区域的情况。',
    '17. “## 角色具体位置”要根据前面的地点描述写清角色在该时间段处于哪个具体位置或可活动范围。',
    '18. 安排单位字段区必须补“激活规则”和“召回策略”：激活规则写可读的日期、开始时间、结束时间、重复规则；召回策略默认写“读取正文，必须召回”。这些是给导入器和人工复核看的自然字段，不要输出 activationRule / recallPolicy JSON。',
    '19. 安排单位还要在字段区补“编译页摘要 / 编译页标签 / 编译页关系提示”：摘要说明某角色在某时段位于某地以及包含范围；标签写角色名、具体地点、局部地点、地点安排、出场约束；关系提示只写可读中文标题关系，不写 @内部ID。',
    '',
    '## 可导入格式',
    '',
    '# 琅嬛轨迹正文',
    '',
    '### 多年枝｜阶段标题｜YYYY-01-01 至 YYYY-12-31｜建议挂载：多年枝',
    '',
    '#### 字段',
    '- 副标题：显示在日期标题旁的短标题',
    '- 简短摘要：80 字以内，概括这一阶段最重要的经历变化',
    '- 标签：3-8 个短标签，用顿号分隔；没有就写“无”',
    '- 涉及对象：相关人物、组织、地点或事件，用顿号分隔；没有就写“无”',
    '- 正式性：confirmed 或 unconfirmed',
    '- 禁止字段：不要写 startDate、endDate、pointDate、sourcePath、id、systemRole',
    '',
    '#### 正文',
    '这里写该多年枝承载的跨年阶段正文。',
    '',
    '### 年枝｜标题｜YYYY-01-01 至 YYYY-12-31｜建议挂载：年份',
    '',
    '#### 字段',
    '- 副标题：显示在年份标题旁的短标题',
    '- 简短摘要：80 字以内，概括这一年最重要的经历变化',
    '- 标签：3-8 个短标签，用顿号分隔；没有就写“无”',
    '- 涉及对象：相关人物、组织、地点或事件，用顿号分隔；没有就写“无”',
    '- 正式性：confirmed 或 unconfirmed',
    '- 禁止字段：不要写 startDate、endDate、pointDate、sourcePath、id、systemRole',
    '',
    '#### 正文',
    '这里只写具有独立正文的重要年份；不要补空年份。',
    '',
    '### 月枝｜标题｜YYYY-MM-01 至 YYYY-MM-DD｜建议挂载：月份',
    '',
    '#### 字段',
    '- 副标题：显示在月份标题旁的短标题',
    '- 简短摘要：这个高密度阶段的摘要',
    '- 标签：标签1、标签2、标签3',
    '- 涉及对象：对象1、对象2',
    '- 正式性：confirmed',
    '- 导入为：概览；月枝只能承载阶段概览，不要写事件或安排',
    '- 禁止字段：不要写 startDate、endDate、pointDate、sourcePath、id、systemRole',
    '',
    '#### 正文',
    '这里写该月枝承载的连续阶段正文。',
    '',
    '### 日桠｜标题｜YYYY-MM-DD｜建议挂载：日期',
    '',
    '#### 字段',
    '- 副标题：显示在日期标题旁的短标题',
    '- 简短摘要：这个关键日发生了什么',
    '- 标签：标签1、标签2、标签3',
    '- 涉及对象：对象1、对象2',
    '- 正式性：confirmed',
    '- 导入为：事件；事件单位表示当天已经发生或资料明确记载的事实，不写时默认就是事件',
    '- 事件字段：参与者、发生地点、发生时间、经过、结果、影响、依据',
    '- 禁止字段：不要写 startDate、endDate、pointDate、sourcePath、id、systemRole',
    '',
    '#### 正文',
    '这里写该关键日事件正文。',
    '',
    '### 日桠｜标题｜YYYY-MM-DD｜建议挂载：安排',
    '',
    '#### 字段',
    '- 副标题：显示在日期标题旁的短标题',
    '- 简短摘要：某角色在某时间段位于某地点，包含哪些局部地点',
    '- 标签：角色名、具体地点、局部地点、地点安排、出场约束',
    '- 涉及对象：角色、地点或组织；没有就写“无”',
    '- 正式性：confirmed 或 unconfirmed',
    '- 导入为：安排',
    '- 激活规则：日期 YYYY-MM-DD；开始 HH:mm；结束 HH:mm；重复 once；提前 0 分钟；宽限 0 分钟',
    '- 召回策略：读取正文，必须召回',
    '- 编译页摘要：某角色在某时段位于某地点，当前地点包含哪些区域',
    '- 编译页标签：角色名、具体地点、局部地点、地点安排、出场约束',
    '- 编译页关系提示：[[局部地点]]_位于_[[当前地点]]；没有明确证据就写“无”',
    '- 禁止字段：不要写 id、sourceId、sourcePath、systemRole、parentId、orderIndex、activationRule、recallPolicy',
    '',
    '#### 正文',
    '## 时间段\nYYYY-MM-DD HH:mm 至 YYYY-MM-DD HH:mm。\n\n## 地点描述\n大地点简写背景；中地点说明它在大地点中的位置和功能；小地点写清入口、相邻区域、可算入范围和不自动算入的边界。\n\n## 角色具体位置\n某角色在这个时间段主要位于小地点内的某处，或在上述包含范围内活动。\n\n## 依据\n引用资料中支持这个安排的原句或事实来源。'
  ].join('\n')
}

function buildCompilePagePrompt() {
  return [
    '# 外部 AI 编译页生成提示词',
    '',
    '你将根据上方琅嬛枝桠资料，生成一个可导入的“批量编译页 Markdown”。',
    '',
    '## 输出总规则',
    '',
    '1. 只输出一个“# 琅嬛批量编译页”Markdown，不要在结构外补解释文字。',
    '2. 必须为上方每个“## 文档 N：标题@正式ID”生成一个独立编译页块。',
    '3. 每个编译页块必须先写一行 HTML 注释：<!-- target: 标题@正式ID -->，target 必须原样复制对应文档标题，包括 @正式ID。',
    '4. 每个编译页块内部只生成编译页必要字段，不要生成正文、来源、优先级、可见性、备注、实体索引、召回片段等字段。',
    '5. 不要改写原始正文，不要编造资料中没有的事实。',
    '6. 每个编译页块必须严格按“# 琅嬛编译页 / ## 摘要 / ## 标签 / ## 类型 / ## 关系提示”的 Markdown 结构。',
    '7. 如果某个字段没有明确内容，摘要和标签仍要根据正文生成；关系提示没有明确证据时写“无”。',
    '8. 摘要要用正常资料口吻直接概括对象本身，不要用“本页描述”“本页记录”“本文介绍”“该文档说明”等模板开头。',
    '9. 关系提示服务跨目录、跨类型、跨区域联动，不是树目录复述；不要批量生成父级包含子级、子级隶属于父级这类重复结构关系。',
    '',
    '## 可导入格式',
    '',
    '# 琅嬛批量编译页',
    '',
    '<!-- target: 文档标题@正式ID -->',
    '',
    '# 琅嬛编译页',
    '',
    '## 摘要',
    '用 80 到 180 字概括当前枝桠的核心内容。摘要要服务召回：说明它是什么、有什么关键事实、适合在什么语境下被想起。请直接从对象、地点、组织、事件或概念本身说起，写成自然的资料摘要；不要写“本页描述”“本页记录”“本文介绍”“该文档说明”等页面指称，也不要写空泛评价。',
    '',
    '## 标签',
    '- 标签1',
    '- 标签2',
    '- 标签3',
    '',
    '标签要求：',
    '- 3 到 8 个短标签。',
    '- 用名词或短词。',
    '- 不要使用“重要”“其他”“资料”这类空标签。',
    '',
    '## 类型',
    'other',
    '',
    '类型只能从以下值中选择一个：',
    'world, region, terrain, settlement, character, lineage, organization, polity, role_identity, event, period, law_system, belief, culture, language, resource, item, ability, species, concept, text_legend, other',
    '',
    '## 关系提示',
    '```text',
    '[[源单位]]_谓词_[[目标单位]]',
    '```',
    '',
    '<!-- target: 下一篇文档标题@正式ID -->',
    '',
    '# 琅嬛编译页',
    '',
    '## 摘要',
    '下一篇文档的摘要。',
    '',
    '## 标签',
    '- 标签1',
    '- 标签2',
    '- 标签3',
    '',
    '## 类型',
    'other',
    '',
    '## 关系提示',
    '```text',
    '无',
    '```',
    '',
    '关系提示要求：',
    '1. 只输出关系提示本身，每行一条；没有明确关系时写“无”。',
    '2. 必须原样使用资料库中已有单位标题，包括 @正式ID，不得修改或者私自编造。',
    '3. 只能使用格式：[[源单位]]_谓词_[[目标单位]]。',
    '4. 谓词只能从下列标准词中选一个：包含、位于、相邻、源自、控制、活动于、隶属于、敌对、同盟、影响、亲属、信仰、产出、贸易、传承、相关。',
    '5. 源单位和目标单位必须使用资料库中已经存在，或本段文本里能明确确认的正式标题。',
    '6. 不要输出不确定、推测、比喻、泛泛而谈的关系。',
    '7. 每份文档最多输出 3 到 8 条，优先保留最关键、最稳定、最能帮助召回的关系。',
    '8. 不要重复同义关系，不要同时写“相关”和更具体的关系；如果能写具体关系，就不要退成“相关”。',
    '9. 默认使用正向标准词，不要用“属于、来自、受控于”这类反向说法。',
    '10. 关系提示必须放在纯文本代码块里，避免 Markdown 把短下横线解析成斜体。',
    '11. 路径和树父子结构只用于定位资料，不是关系证据；不要因为 A 在 B 目录下就输出“B_包含_A”。',
    '12. 只有正文、摘要或已有关系提示明确表达组成、归属、管辖、地理覆盖等语义时，才允许输出“包含”。',
    '13. 同一对单位只保留归一后最有信息量的一条关系；不要在父级文档写一次、子级文档再反向重复写一次。',
    '14. 不要在父级文档列出一整串目录下级“包含”关系，也不要在每个子级文档反向写“隶属于”关系。',
    '15. 优先发现跨枝、跨类型、跨区域关系，例如控制、活动于、产出、贸易、信仰、影响、相邻、同盟、敌对。',
    '16. 正文里出现但不在“资料库中已有单位标题”列表里的名词，不能当作关系端点写入。',
    '',
    '在心里先完成这三步，但不要把思考过程输出出来：',
    '- 先列出文中出现的实体。',
    '- 只保留有明确证据支持的实体对。',
    '- 再从允许谓词里选最具体的那个。',
    '',
    '推荐示例：',
    '```text',
    '[[镜湖平原]]_位于_[[亚什基诺]]',
    '[[清水河三角洲]]_相邻_[[天镜湖]]',
    '[[镜湖平原]]_产出_[[粮食]]',
    '```'
  ].join('\n')
}

function normalizeRootUnitIds(rootUnitIds: string[], unitById: Map<string, UnitView>) {
  const unique = Array.from(new Set(
    rootUnitIds.map((unitId) => String(unitId || '').trim()).filter((unitId) => unitById.has(unitId))
  ))
  return unique.filter((unitId) => !unique.some((otherId) => otherId !== unitId && isDescendantOf(unitById, unitId, otherId)))
}

function isDescendantOf(unitById: Map<string, UnitView>, unitId: string, ancestorId: string) {
  let current = unitById.get(unitId)
  const visited = new Set<string>()
  while (current?.parentId) {
    const parentId = String(current.parentId || '').trim()
    if (!parentId || visited.has(parentId)) return false
    if (parentId === ancestorId) return true
    visited.add(parentId)
    current = unitById.get(parentId)
  }
  return false
}

function buildNode(
  unit: UnitView | undefined,
  childrenByParentId: Map<string, UnitView[]>,
  parentPath: string[]
): UnitTreeJsonNode {
  if (!unit) {
    return {
      unitId: '',
      title: '',
      domain: 'docLibrary',
      unitType: 'root',
      contentKind: 'group',
      status: 'placeholder',
      path: parentPath,
      children: []
    }
  }
  const path = [...parentPath, unit.title]
  const node: UnitTreeJsonNode = {
    unitId: unit.unitId,
    title: unit.title,
    domain: unit.domain,
    unitType: unit.unitType,
    contentKind: unit.contentKind,
    status: unit.status,
    parentId: unit.parentId,
    sourceId: unit.sourceId,
    sourcePath: unit.sourcePath,
    semanticType: unit.semanticType,
    orderIndex: unit.orderIndex,
    path,
    body: unit.body,
    compilePage: unit.compilePage,
    metadata: unit.metadata,
    children: (childrenByParentId.get(unit.unitId) || []).map((child) => buildNode(child, childrenByParentId, path))
  }
  return stripUndefined(node)
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function compareUnitOrder(left: UnitView, right: UnitView) {
  const orderCompare = Number(left.orderIndex ?? 9999) - Number(right.orderIndex ?? 9999)
  if (orderCompare !== 0) return orderCompare
  return left.title.localeCompare(right.title, 'zh-Hans-CN')
}

function flattenTree(node: UnitTreeJsonNode): UnitTreeJsonNode[] {
  return [node, ...node.children.flatMap((child) => flattenTree(child))]
}

function shouldExportMarkdownBlock(node: UnitTreeJsonNode) {
  if (node.contentKind === 'markdown') return true
  if (String(node.body || '').trim()) return true
  if (String(node.compilePage?.summary || '').trim()) return true
  if (Array.isArray(node.compilePage?.tags) && node.compilePage?.tags.some((tag) => String(tag || '').trim())) return true
  return Array.isArray(node.compilePage?.relationHints) && node.compilePage.relationHints.some((item) => String(item || '').trim())
}

function formatNodeReferenceTitle(node: UnitTreeJsonNode) {
  const title = String(node.title || '').trim()
  const refId = getUnitRelationRefId(node as unknown as UnitView)
  if (!title || !refId) return title
  return `${title}@${refId}`
}

function formatPath(path: string[]) {
  const safePath = path.map((part) => String(part || '').trim()).filter(Boolean)
  return safePath.length ? safePath.join(' / ') : '空'
}

function formatMultilineBlock(value?: string) {
  const safeValue = String(value || '').trim()
  return safeValue || '空'
}

function formatTags(tags?: string[]) {
  const safeTags = Array.isArray(tags) ? tags.map((tag) => String(tag || '').trim()).filter(Boolean) : []
  return safeTags.length ? safeTags.join('、') : '空'
}

function formatRelationHints(relationHints?: string[]) {
  const safeHints = Array.isArray(relationHints)
    ? relationHints.map((hint) => String(hint || '').trim()).filter(Boolean)
    : []
  return safeHints.length ? safeHints.join('\n') : '空'
}
