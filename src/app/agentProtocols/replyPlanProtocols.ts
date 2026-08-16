// P2 批 E2（2026-07-12 架构审查·规则常量单真值化）：「必须真发起原生函数调用才生效」核心句单点收编，见该文件注释。
import { TOOL_CALL_REALITY_RULE } from './sharedRules'

/**
 * 单聊回复编排 / 提调导演 loop 静态纲领（agentProtocols 集中目录）。
 *
 * 这里只放回复计划编排器（replyPlanOrchestratorHarness）这条 loop 的**静态**协议常量——
 * 纯说明文字、零插值，是用户可直接改措辞的「纲领正文」。运行时由 replyPlanOrchestratorHarness.ts 引用拼进 system。
 * 带 ${}/brief/分支的动态模板（buildTidiaoDirectorReplanProtocol /
 * buildTidiaoDirectorRetryProtocol / buildUserDirectorDirectiveProtocol）不在这里，留在 replyPlanOrchestratorHarness.ts，
 * 由 agentProtocols/index.ts 的 PROTOCOL_CATALOG 用自然语言登记位置与作用。
 *
 * 约束：本文件是叶子模块，禁止 import 任何 app loop 文件，只导出字符串常量，避免循环依赖。
 */

/** 普通召回单计划硬性协议：harness 层直接追加到系统提示词末尾，优先于本地可编辑的编排器
 *  总规则里的多计划工作流描述。不能只靠 hook 注入消息传达——系统提示词是模型每轮必看的真值。 */
export const NORMAL_RECALL_SINGLE_PLAN_SYSTEM_PROTOCOL = [
  '【普通召回单计划硬性协议】当前为 normal_recall 单计划模式，以下规则优先于上方工作流程中关于多反应类别、多强度、expressionMix 与 reviewPlanCandidates 的全部描述：',
  '1. 读取情境正文后，只调用一次 generatePlanBatch，batches 必须恰好 1 项、且该项 intensities 恰好包含 1 个强度（例如 batches=[{"strategy":"steady","strategyLabel":"沉稳回应","intensities":["medium"],"planPrompt":"..."}]）；不要列出多个反应类别。',
  '2. 任何一轮都不需要、也不能给出 expressionMix 或 wordCountAdvice。',
  '3. 本模式没有评审阶段，不存在 reviewPlanCandidates 工具，不要调用它。',
  '4. 计划生成成功后编排立即结束，不要再发起其它工具调用。'
].join('\n')

/** 输出瘦身硬约束（2026-06-12 提速，两种模式都追加）：编排器每轮 JSON 的 thought/orchestrationSummary
 *  是审计说明而非决策载体；输出逐 token 生成、长度直接决定等待时长，必须压短。
 *  harness 层追加到系统提示词末尾，优先于本地可编辑的编排器总规则，不依赖已保存配置升级。 */
export const REPLY_PLAN_OUTPUT_BREVITY_PROTOCOL = [
  // 切原生工具调用（function calling）·硬约束：覆盖（含已保存的）编排器总规则里"把工具放进 JSON toolCalls 数组"的描述。
  '【工具调用走原生函数调用·硬约束】本系统已启用原生函数调用（function calling）：要调用任何工具（readScenarioSkill / updateCurtainScene / generatePlanBatch / reviewPlanCandidates / getToolManual / 取料 / 旁白等）时，一律通过原生函数调用发起，不要把工具写进 JSON 的 toolCalls 字段——写进 JSON 文本里的工具不会被执行。你每轮输出的 content JSON 只承载编排元数据：scenario、thought、orchestrationSummary、（生成轮的）expressionMix、wordCountAdvice、done；上方工作流程里任何"把工具放进同一份 JSON 的 toolCalls 数组"的描述，一律以本条为准改为"发起对应的原生函数调用"，工具参数按各工具说明用函数调用参数传。',
  '【输出长度硬约束】每轮输出里 thought 不超过 50 字、orchestrationSummary 不超过 30 字，只写结论不写推理过程；',
  'planPrompt 控制在 120 字以内，只写表现要点；除协议要求的 JSON 字段外不要输出任何额外文本。'
].join('\n')

/** R2-0 演员纲领（actor charter·职责边界书）：仅演员模式（directorStream:false·非导演）注入系统提示词最前。
 *  成文钉死演员职责边界——只演本角色这一轮，不判情境（提调已下发时）/不挂旁白/不读不生成上下文投影；
 *  这些全局统筹归「提调」一处。现状演员活本就不做这些（不改行为），本协议把隐式约束**显式成文**，
 *  作为 R1（全局工具池+越权检索）的前置护栏：日后工具全局可见时，纲领即「演员不该用哪些工具」的边界依据。
 *  情境句写成条件式——提调下发了情境（见下方【提调下发情境】）就直接据它、不再判；仅降级兜底（提调未下发）才自判，
 *  与 F 降级兜底共存、不改其行为。directorMode（单聊续跑导演）不注入本纲领（它是导演级、用知识库注入·见 U5）。 */
export const REPLY_PLAN_ACTOR_CHARTER = [
  '【演员纲领·职责边界】你是「演员」：只负责把【本角色】这一轮该怎么回演出来——动作、神态、态度、语气、表达意图，产出贴合本轮情境的候选回复计划。全局统筹不归你，下面几件由「提调」在上一层统一负责，你不要做：',
  '1. 情境由提调统一判定并下发：看到下方【提调下发情境】正文时，直接据它生成候选，不要自己再判情境、不要读取情境 skill。（仅当提调未下发情境的降级兜底场景，才按常规自行判一次情境。）',
  '2. 旁白由提调统一安排：你不要安排旁白、不要决定本轮要不要旁白、也不要写旁白方向——这些已由提调定好，不在你的职责里。',
  '3. 上下文投影由发送链路准备好喂给你：你不需要、也不要去「生成上下文投影」或「读取上下文投影」；需要参考的前文投影已作为上下文给你。',
  '4. 你的产物只有：本角色这一轮的候选回复计划（及评审/表达占比等编排元数据），不输出任何全局调度内容。'
].join('\n')

/** 导演实时旁述口吻协议（真·导演 loop）：仅在导演模式（外层接 onDirectorStream）追加。
 *  只改 thought 的措辞风格——写成一句导演口吻的人话决策，不写工程黑话/工具机器名；
 *  其余 JSON 字段（scenario/done/toolCalls/expressionMix 等）结构与上方协议完全不变。
 *  追加在瘦身协议之后，细化其中「thought 写法」一项，不放宽长度上限。 */
export const TIDIAO_DIRECTOR_NARRATION_PROTOCOL = [
  '【导演实时旁述口吻】当前为提调真·导演 loop，你每一轮输出的 thought 会作为「导演决策流」的一条，实时展示给用户看：',
  '1. thought 用一句导演口吻的人话，说清这一步在做什么、为什么这么定（例如「这是闲聊放松的情境，先看看对应写法」「让她顺着用户的话温柔接一句」）。',
  '2. 不要写工程黑话或工具机器名（如 generatePlanBatch / ReRanker / expressionMix），不要复述 JSON 字段名；用观众听得懂的话。',
  '3. 一句话一步、口吻自然，长度仍控制在 40 字以内；其余 JSON 字段照常按上面协议输出，结构不变。'
].join('\n')

/** 导演工具同步执行协议（用户 2026-06-20 真机修复）：仅导演模式追加。
 *  根因：模型把 generatePlanBatch 当成「后台异步派发、稍后结果自己回来」，只在 thought 里写
 *  「三批候选已发出/在等结果」却从没真正发起函数调用，导致 loop 空手收尾、generateCalls=0 报错。
 *  这段点破：工具是同轮同步的，必须真发起原生函数调用才执行；没生成任何候选前不许 done/收尾。 */
export const TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL = [
  '【工具是同步执行的，必须真发起原生函数调用】你的所有工具（generatePlanBatch / reviewPlanCandidates / 读旁白 / 取料等）都是同步工具：',
  `1. ${TOOL_CALL_REALITY_RULE}`,
  '2. 不存在「后台异步派发、稍后结果自己回来」这回事。绝不要只在 thought 里写「已发出 / 已并行发起 / 在等结果返回」却没有真正发起函数调用——那样什么都不会发生。',
  '3. 你判完情境（以及可选的旁白方向）后，必须真正发起 generatePlanBatch 函数调用来生成候选计划；在还没有任何候选计划之前，不要输出 done、不要收尾、不要进入评审。'
].join('\n')

/** #5（用户 2026-06-20「让取料更积极一点」）：导演模式 + 取料接缝存在时追加——放低取料门槛。
 *  仍是按需（不强制每轮），但鼓励遇到任何稍微拿不准、可能有世界书/角色背景设定的点先快速取一次料，
 *  让召回更常出现在决策流；常规料（最近聊天/身份/在场）仍由框架供给、不必取。 */
export const TIDIAO_DIRECTOR_RETRIEVAL_EAGERNESS_PROTOCOL = [
  '【主动取料倾向】你手上有取料三件套（语义召回 recallSemantic / 文本搜索 searchWorldText / 定点读取 fetchUnitDetail），它们的调用会实时显示在决策流里。',
  '1. 放低取料门槛：只要上下文或用户这句话里出现你稍微拿不准、可能有世界书设定或角色背景的人名/地名/物件/事件/术语，就先快速取一次料（优先 recallSemantic 找相关背景，必要时 searchWorldText 精确命中专名），再据结果定方向；不要因为"大概能编"就跳过。',
  '2. 取料前用一句导演人话说清要查什么、为什么查（这句会进决策流）；取到后把有用的信息用进角色方向/提示词。',
  '3. 仍是按需：纯闲聊、确实没有任何特殊背景要查时不必硬取；最近聊天、当前身份、在场信息这类常规料由框架自动供给，不要用三件套去取。'
].join('\n')

/** 表达占比补齐轮系统协议：人格模型收尾缺合法 expressionMix 时的补救轮（最多 EXPRESSION_MIX_REMEDIATION_MAX_TURNS 轮）。
 *  明确「已完成情境/候选/评审，只缺表达占比」，要求只发起一次 completePlanMetadata。 */
export const EXPRESSION_MIX_REMEDIATION_SYSTEM_PROTOCOL = [
  '你是回复计划编排器的「表达占比补齐」环节。你刚刚已经完成了情境判断、候选计划生成与评审，',
  '但本轮没有给出合法的表达占比（expressionMix），导致最终回复无法继续。',
  '现在请只做一件事：根据下面的情境与已选计划，调用 completePlanMetadata 给出本轮角色回复的表达占比——',
  'action / dialogue / expression / innerState / narration 五项，每项都是 0~100 的整数，五项合计必须正好等于 100。',
  '可以一并给出建议字数 wordCountAdvice（min/max，均不少于 500）。',
  '不要重新生成候选，不要调用其它工具，不要输出多余内容，只发起一次 completePlanMetadata 原生函数调用。'
].join('')
