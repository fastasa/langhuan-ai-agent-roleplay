/**
 * 提调「改/读消息」工具族契约 —— 提调目标定位计划书 批次 2（C·工具说明收口）。
 *
 * 单一真值源：每个提调工具的「何时用（whenToUse）」与「原生 function-calling 参数 schema」只在这里写一份，
 * 群聊导演 harness、回复编排 harness、单聊纠偏 loop、单聊精修 loop 四处统一引用——
 * 不再各处另写内联 brief 或各工具文件里的 `..._WHEN_TO_USE` 常量（已迁来这里）。
 *
 * 与 {@link ./tidiaoRetrievalContract}（取料三件套契约）同范式、互补：那份管「取信息」三件套，这份管
 * 「读/改会话消息、读/改提示词、读/标记投影、升级、重生成」工具族。toolName 用字面量、不 import 各工具文件，
 * 避免「工具文件 ↔ 契约」循环依赖（与取料契约一致）。
 *
 * whenToUse 文案保持中性（不写「上策/中策/精修」这类入口特化词）：上→中→下 择优叙事归
 * {@link ./tidiaoCorrectionLoop} 的 buildTidiaoCorrectionProtocol 协议散文负责，本契约只描述「这个工具何时用 + 参数」。
 */

/** 单个提调工具契约：机器名 + 中文标签 + 何时用 + 原生 function-calling 参数 schema。 */
export interface TidiaoToolContract {
  /** 工具机器名（与各 loop/harness 注册的 ToolDefinition.name 一一对应）。 */
  toolName: string
  /** 面向审计/调试的中文标签。 */
  label: string
  /** 揉进工具的轻量 skill：「何时用」描述（作为 ToolDefinition.brief 下发，渐进式暴露入口）。 */
  whenToUse: string
  /** 原生 function-calling 参数 schema（经 toOpenAiTools 下发；缺它会被兜底成空参数，故必填）。 */
  schema: Record<string, unknown>
}

/** 单个楼层引用参数 schema 片段（多个工具复用：editChatMessage/读提示词/读改投影/重生成都按单条 ref 工作）。 */
const REF_PROPERTY = { type: 'string', description: '单个楼层引用，如「角色2」（必填）。' } as const

/** 上策·读会话消息：支持范围/多目标，故参数名为 query（与精确读单条的 ref 区分）。 */
export const TIDIAO_READ_CHAT_MESSAGE_CONTRACT: TidiaoToolContract = {
  toolName: 'readChatMessage',
  label: '读会话消息',
  whenToUse:
      '只在需要逐字原文且手上没有最新原文时用：优先接收投影给出的稳定 reference/messageId；人工操作也可按 UI 楼层号引用「角色N / 旁白M」，'
    + '支持范围「角色3-5」与多目标「角色2、旁白3」。返回原文 + 楼层号 + 稳定 messageId，'
    + '作为改原文锚定 oldText 的位置信息。判断剧情/指代看【3·对话可见历史】就够；读过的原文留在【4·已读资料】、'
    + '改动工具的回执就是改后真值——这些都不需要再调本工具重复读。',
  schema: {
    type: 'object',
    properties: {
        query: { type: 'string', description: '人工可读楼层引用，如「角色2」「角色3-5、旁白2」（与稳定引用二选一）。' },
        reference: {
          type: 'object',
          description: '投影返回的稳定消息引用。',
          properties: {
            kind: { type: 'string', enum: ['chat_message'] },
            sessionId: { type: 'string' },
            messageId: { type: 'number' }
          },
          required: ['kind', 'sessionId', 'messageId']
        },
        messageId: { type: 'number', description: '稳定消息 ID；有 reference 时优先传 reference。' },
        references: { type: 'array', items: { type: 'object' }, description: '批量稳定消息引用。' }
      },
      required: [],
      anyOf: [{ required: ['query'] }, { required: ['reference'] }, { required: ['messageId'] }, { required: ['references'] }]
  }
}

/** 上策·改原文：旧片段→新片段精改。 */
export const TIDIAO_EDIT_CHAT_MESSAGE_CONTRACT: TidiaoToolContract = {
  toolName: 'editChatMessage',
  label: '改会话消息原文',
  whenToUse:
    '当只需改会话里某条角色/旁白消息的某一段、其余不动时用：按 UI 楼层号引用「角色N / 旁白M」，'
    + '给 oldText（要替换的旧片段，必须是该消息当前内容里唯一出现的连续片段）+ newText（新片段，可为空=删除）。'
    + 'newText 必须模仿这条消息已有的文风文法（用词、句式、叙述人称、节奏），与前后文自然衔接、读不出改动痕迹。'
    + '多处相同片段需 replaceAll:true 全替换，否则报多处命中让你给更长的唯一片段。'
    + '先用 readChatMessage 读到该消息最新原文再锚定 oldText。整条重写=退化情形（oldText=整段、newText=新整段）。'
    + '若是给消息补写新增内容（如输出被截断没写完），用 appendChatMessage，不要拿本工具硬凑。',
  schema: {
    type: 'object',
    properties: {
      ref: REF_PROPERTY,
      oldText: { type: 'string', description: '要替换的旧片段，必须是该消息当前内容里唯一出现的连续片段（必填，可为整段=整条重写）。' },
      newText: { type: 'string', description: '替换成的新片段，空串表示删除（必填）。' },
      replaceAll: { type: 'boolean', description: '旧片段在该消息里多处相同时设 true 全替换（可选，默认 false）。' }
    },
    required: ['ref', 'oldText', 'newText']
  }
}

/** 上策·精准增加：给某条消息补写新增内容（截断补完主路径），与 editChatMessage 共用工作副本/落库链路。 */
export const TIDIAO_APPEND_CHAT_MESSAGE_CONTRACT: TidiaoToolContract = {
  toolName: 'appendChatMessage',
  label: '补写消息内容',
  whenToUse:
    '当某条角色/旁白消息的输出被截断没写完、或需要在原文基础上精准补一段新内容时用：按 UI 楼层号引用「角色N / 旁白M」，'
    + '把补写的内容放进 text。**text 必须由你亲自续写**，且必须模仿这条消息已有的文风文法（用词、句式、叙述人称、节奏），'
    + '从断点自然接续、读不出接缝；补截断时先看清最后一句断在哪里，接着写完它。'
    + '拿不准这条消息原本要写什么方向时，可先用 readMessagePrompt 看它当初的生成提示词。'
    + '缺省追加到消息末尾（补截断用这个就够）；只有要插到消息中间时才给 afterText（该消息当前内容里唯一出现的连续片段，新内容插在它后面）。'
    + '本工具只增不改：要替换/删除已有文字用 editChatMessage。',
  schema: {
    type: 'object',
    properties: {
      ref: REF_PROPERTY,
      text: { type: 'string', description: '要补写的新内容，模仿该消息已有文风、从断点自然接续（必填，不能为空）。' },
      afterText: { type: 'string', description: '插入锚点：该消息当前内容里唯一出现的连续片段，新内容插在它后面（可选，缺省=追加到消息末尾）。' }
    },
    required: ['ref', 'text']
  }
}

/** 中策·读某条消息当初生成用的提示词。 */
export const TIDIAO_READ_MESSAGE_PROMPT_CONTRACT: TidiaoToolContract = {
  toolName: 'readMessagePrompt',
  label: '读消息提示词',
  whenToUse:
    '当要改某条消息的生成方向/要点、需要先看它当初是用什么提示词生成的时候用：'
    + '按 UI 楼层号引用「角色N / 旁白M」读到该消息已存的提示词文本，作为 editMessagePrompt 锚定 oldText 的依据。',
  schema: {
    type: 'object',
    properties: { ref: REF_PROPERTY },
    required: ['ref']
  }
}

/** 中策·改提示词：改完由正常回复模型据新提示词重生成。 */
export const TIDIAO_EDIT_MESSAGE_PROMPT_CONTRACT: TidiaoToolContract = {
  toolName: 'editMessagePrompt',
  label: '改消息提示词',
  whenToUse:
    '当改原文不够、但情境判断没错、只是这条消息的生成方向/要点要调时用——'
    + '按 UI 楼层号引用「角色N / 旁白M」，给 oldText（该消息提示词里唯一出现的连续片段）+ newText（改后的片段，可为空=删除）。'
    + '多处相同片段需 replaceAll:true。先用 readMessagePrompt 读到提示词最新文本再锚定 oldText。'
    + '改完提示词后系统会用正常的回复模型据新提示词重新生成这条消息（不是你来生成正文）。',
  schema: {
    type: 'object',
    properties: {
      ref: REF_PROPERTY,
      oldText: { type: 'string', description: '该消息提示词里要替换的旧片段，必须是唯一出现的连续片段（必填）。' },
      newText: { type: 'string', description: '替换成的新片段，空串表示删除（必填）。' },
      replaceAll: { type: 'boolean', description: '旧片段在提示词里多处相同时设 true 全替换（可选，默认 false）。' }
    },
    required: ['ref', 'oldText', 'newText']
  }
}

/** 读消息投影：判断改完原文后客观事实投影是否过时。 */
export const TIDIAO_READ_MESSAGE_PROJECTION_CONTRACT: TidiaoToolContract = {
  toolName: 'readMessageProjection',
  label: '读消息投影',
  whenToUse:
    '当改了某条消息原文、想判断它的客观事实投影是否还匹配新原文时用：按 UI 楼层号引用「角色N / 旁白M」，'
    + '返回该消息当前投影事实（客观事实摘要 + 起止环境 + 时间/地点变化）。投影是抽给别人读的客观事实，'
    + '据它和新原文对比判断要不要重投影。',
  schema: {
    type: 'object',
    properties: { ref: REF_PROPERTY },
    required: ['ref']
  }
}

/** 标记重投影：原文改动大、投影过时时标记。 */
export const TIDIAO_REPROJECT_MESSAGE_CONTRACT: TidiaoToolContract = {
  toolName: 'reprojectMessage',
  label: '标记重投影',
  whenToUse:
    '当改后原文改动较大、投影已过时（发生的事、对象、动作、时间或地点变了）时用：按 UI 楼层号引用「角色N / 旁白M」'
    + '标记这条需要重投影。重投影会在保存后基于新原文自动重新生成投影，你只需判断要不要重投并标记，不用自己写投影内容。',
  schema: {
    type: 'object',
    properties: { ref: REF_PROPERTY },
    required: ['ref']
  }
}

/** 下策·升级重判情境重排。 */
export const TIDIAO_ESCALATE_CORRECTION_CONTRACT: TidiaoToolContract = {
  toolName: 'escalateCorrection',
  label: '升级重排',
  whenToUse:
    '当改原文、改提示词都救不了（连情境都判错了、整轮要重判重排）时用：给出升级原因，'
    + '交系统重判情境、重新编排这一轮。这是最彻底也最贵的，只在前两种策略都救不了时才用。',
  schema: {
    type: 'object',
    properties: { reason: { type: 'string', description: '升级原因，一句人话（必填）。' } },
    required: ['reason']
  }
}

/** 中策·据新提示词重生成（重生成接缝注入时才注册）。 */
export const TIDIAO_REGENERATE_FROM_PROMPT_CONTRACT: TidiaoToolContract = {
  toolName: 'regenerateFromPrompt',
  label: '据提示词重生成',
  whenToUse:
    '当改完某条消息的提示词、想据新提示词用正常回复模型重生成这条消息时用（你能看到重生成结果，不满意可继续调）；'
    + '若用户只是要按原提示重新出一版、并不需要改提示词，也可直接用本工具不必先改提示词。',
  schema: {
    type: 'object',
    properties: { ref: REF_PROPERTY },
    required: ['ref']
  }
}

/** 没把握先问用户：遇到目标歧义/做法多解/越界/找不到指代时，先停下来问用户、给带推荐的选项，得到答复再动手。 */
export const TIDIAO_ASK_USER_CONTRACT: TidiaoToolContract = {
  toolName: 'askUser',
  label: '问用户',
  whenToUse:
    '当你对该怎么做拿不准、不该自己瞎猜时用——典型场景：①目标有歧义（如用户说「旁白」但既可能指独立旁白楼层、也可能指角色消息开头的环境描写）；'
    + '②做法有多种合理解读；③用户的要求可能越界或与现状冲突；④找不到用户指代的对象。'
    + '把问题用一句人话写进 question，并在 options 里给出 2~4 个具体可选项、recommended 写你最推荐的那个（连同理由一句话）。'
    + '调用后本轮就停下等用户答复，不要自己替用户决定；本轮最多问一次。能自己判断清楚时不要滥用本工具。',
  schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '要问用户的问题，一句人话说清你拿不准什么（必填）。' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: '给用户的 2~4 个具体可选项（可选，强烈建议给）。'
      },
      recommended: { type: 'string', description: '你最推荐的选项 + 一句理由（可选）。' }
    },
    required: ['question']
  }
}

/** 续回统筹（2026-07-08 停止=中断保留闭环）：用户要求继续被中断/未完成的统筹编排、且需要统筹阶段能力时，
 *  纠偏轮据此收尾并交回统筹阶段续做剩余部分（已有消息与决策流全部保留）。 */
export const TIDIAO_RESUME_ORCHESTRATION_CONTRACT: TidiaoToolContract = {
  toolName: 'resumeOrchestration',
  label: '续回统筹',
  whenToUse:
    '当用户要求继续/接续上一轮被中断或未完成的统筹编排任务、且剩余部分需要统筹阶段能力（安排角色出场/旁白/收尾）时调用：'
    + '调用后本轮纠偏立即收尾，系统会带着已保留的决策流、待办和情境重新进入统筹阶段续做剩余部分，已有消息全部保留。'
    + '若只是补完/改写某条已有消息（如截断补写），优先用 editChatMessage/appendChatMessage 就地补，不要切回统筹。'
    + 'instruction 可带用户对继续统筹的补充要求（可选，纯继续可不填）。',
  schema: {
    type: 'object',
    properties: {
      instruction: { type: 'string', description: '续接补充指令（可选）：用户对继续统筹的额外要求；纯继续可不填。' }
    },
    required: []
  }
}

/** 提调改/读消息工具族契约清单（单一真值源）。 */
export const TIDIAO_TOOL_CONTRACTS: readonly TidiaoToolContract[] = [
  TIDIAO_READ_CHAT_MESSAGE_CONTRACT,
  TIDIAO_EDIT_CHAT_MESSAGE_CONTRACT,
  TIDIAO_APPEND_CHAT_MESSAGE_CONTRACT,
  TIDIAO_READ_MESSAGE_PROMPT_CONTRACT,
  TIDIAO_EDIT_MESSAGE_PROMPT_CONTRACT,
  TIDIAO_READ_MESSAGE_PROJECTION_CONTRACT,
  TIDIAO_REPROJECT_MESSAGE_CONTRACT,
  TIDIAO_ESCALATE_CORRECTION_CONTRACT,
  TIDIAO_REGENERATE_FROM_PROMPT_CONTRACT,
  TIDIAO_ASK_USER_CONTRACT,
  TIDIAO_RESUME_ORCHESTRATION_CONTRACT
] as const

/** 按工具机器名取契约（取不到抛错，避免静默回退成空说明/空 schema）。 */
export function getTidiaoToolContract(toolName: string): TidiaoToolContract {
  const contract = TIDIAO_TOOL_CONTRACTS.find((c) => c.toolName === toolName)
  if (!contract) throw new Error(`未知的提调工具契约：${toolName}`)
  return contract
}

/** 取契约的 brief+schema 两字段，直接 spread 进 ToolDefinition（一处接入、避免两次查找）。 */
export function tidiaoToolBriefFields(toolName: string): { brief: string; schema: Record<string, unknown> } {
  const contract = getTidiaoToolContract(toolName)
  return { brief: contract.whenToUse, schema: contract.schema }
}
