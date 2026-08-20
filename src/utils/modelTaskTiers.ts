import type { AgentModelConfig, ModelReasoningEffort, ModelUsageConfig, ModelUsageSlotId } from '../types'
import { buildModelUsageAiOptions } from './modelUsageConfig'

/**
 * 任务分级表（2026-07-08 批次3·用户拍板「一轮消息提速省 token」计划）：
 * 「调用场景 → 槽位档」的代码内唯一映射。调用点一律经 {@link buildTaskModelAiOptions} 取档、
 * 不再直接点名槽位——改档只动本表，不动调用点。
 *
 * 档位口径（用户拍板）：
 *   掌阁 smart——星依总 agent（2026-07-23 真机反馈：复杂跨文档任务改走最高档）、
 *              灵魂自动写、琅嬛助理/人格校准/人格训练（原高量三处）
 *   校书 balanced——提调统筹/纠偏/精修 loop、编剧 subagent、采风钻取 subagent、回复计划编排 loop、召回裁判等默认主力
 *   执笔 message——角色消息与旁白消息正文专用
 *   书童 fast——人格/普通召回计划批次、人格内核解析、里程碑改写等格式化小任务
 *   编目 embedding——嵌入向量（embeddingPresetId 独立链路·不经文本槽，不在本表）
 *
 * 温度/maxTokens/thinking 由调用点覆写；serviceTier 与 effort 随槽位统一继承；具体 Agent 对话可显式覆盖 effort；
 * 原角色消息 temp1/4096、旁白 0.8/800、高量 8192 等槽默认已落各调用点覆写，行为不变。
 * loop 型 subagent（采风/造册/编剧）一律在本表取档（subagentSpec 单次调用注册表已于 2026-07-10 退役）。
 */
export type ModelTaskId =
  | 'directorLoop'          // 统筹/纠偏/精修决策 loop（buildDeferredLoopModelCall + 外部纠偏 runner）
  | 'replyRouteJudge'       // 上一轮情境续接轻判（不生成回复、不运行工具）
  | 'focusedActionJudge'    // 动作输入书童前置判断（隐私/形式/立即任务）
  | 'replyPlanMain'         // 回复计划编排 loop 主判
  | 'replyPlanLite'         // 回复计划编排 loop 轻判
  | 'roleMessage'           // 角色消息正文
  | 'narrationMessage'      // 旁白消息正文
  | 'rimworldText'          // 环世界最终角色回复（局部固定书童，不改网页角色分级）
  | 'xingyiAgent'           // 星依总 agent
  | 'soulAutoWrite'         // 轨迹→灵魂自动写
  | 'langhuanAssist'        // 琅嬛助理
  | 'personalityCalibration'// 人格校准
  | 'personalityTraining'   // 人格训练
  | 'kernelParse'           // 人格内核解析
  | 'recallJudge'           // 召回候选裁判
  | 'recallFormat'          // 召回过程润色/里程碑改写等格式化小任务
  | 'messageProjection'     // 消息投影（服务端·格式化小任务）
  | 'xingyiDiary'           // 星依日记整理 mini agent（服务端·跨会话素材改写）
  | 'improvCharacterExtract'// 即兴角色核心资料提取（服务端·原高量档）
  | 'projectionWriteback'   // 投影写回轨迹 agent（服务端）
  | 'sessionTempProfile'    // 会话临时角色/实体资料整理（服务端）
  | 'caifengResearch'       // 「采风」知识钻取 subagent 小 loop（统筹派遣·状态系统融入提调计划批次2）
  | 'zaoceBuild'            // 「造册」建状态栏 subagent 小 loop（scope 确认后后台建栏·并行编排计划批次B）
  | 'scriptwriterConsult'   // 「编剧」剧本咨询 subagent 小 loop（统一走校书档）
  | 'mapDraw'               // 「绘舆」地图作图 subagent 小 loop（统筹/纠偏派遣·地图系统批5）
  | 'imageCaption'          // 「图片转述」聊天图片文字转述（输入框图片上传计划批2）——
                            // 图片转述需要该档配识图模型，档位本身不保证识图（能否真识图由 preset.supports_vision 决定）

export const MODEL_TASK_TIERS: Record<ModelTaskId, ModelUsageSlotId> = {
  directorLoop: 'balanced',
  replyRouteJudge: 'fast',
  focusedActionJudge: 'fast',
  replyPlanMain: 'balanced',
  replyPlanLite: 'balanced',
  roleMessage: 'message',
  narrationMessage: 'message',
  rimworldText: 'fast',
  xingyiAgent: 'smart',
  soulAutoWrite: 'smart',
  langhuanAssist: 'smart',
  personalityCalibration: 'smart',
  personalityTraining: 'smart',
  kernelParse: 'fast',
  recallJudge: 'balanced',
  recallFormat: 'fast',
  messageProjection: 'fast',
  xingyiDiary: 'balanced',
  improvCharacterExtract: 'smart',
  projectionWriteback: 'balanced',
  sessionTempProfile: 'balanced',
  caifengResearch: 'balanced',
  zaoceBuild: 'balanced',
  scriptwriterConsult: 'balanced',
  mapDraw: 'balanced',
  imageCaption: 'balanced'
}

/** 按任务分级表取模型调用选项：查表得槽位档 → buildModelUsageAiOptions（覆写机制原样透传）。 */
export function buildTaskModelAiOptions(
  agentConfig: Partial<AgentModelConfig> | null | undefined,
  taskId: ModelTaskId,
  overrides: Partial<Pick<ModelUsageConfig, 'maxTokens' | 'temperature' | 'thinking'>>
    & { effort?: ModelReasoningEffort } = {}
) {
  return buildModelUsageAiOptions(agentConfig, MODEL_TASK_TIERS[taskId], overrides)
}
