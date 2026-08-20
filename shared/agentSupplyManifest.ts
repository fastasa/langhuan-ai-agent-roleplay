import {
  AGENT_CONTEXT_KINDS,
  type AgentContextAgentKind,
  type AgentContextFailurePolicy
} from './agentContextRecipes.js'

/**
 * Agent 输入供给协议。
 *
 * 六类供给资产只描述“资料归谁、何时加载、落到七层哪里”，不创建第二套 prompt 层级。
 * 业务真值仍由 AgentContext 投影负责；工具权限、事务、版本与幂等仍由运行时代码负责。
 */

export const AGENT_PROMPT_LAYER_IDS = ['0', '1', '2', '3', '4', '5', '6'] as const
export type AgentPromptLayerId = (typeof AGENT_PROMPT_LAYER_IDS)[number]

export const AGENT_SUPPLY_ASSET_TYPES = [
  'platform_core',
  'agent_resident_core',
  'skill',
  'business_projection',
  'run_state',
  'tool_code_guardrails'
] as const
export type AgentSupplyAssetType = (typeof AGENT_SUPPLY_ASSET_TYPES)[number]

export const AGENT_SUPPLY_ASSET_LAYER_MAP: Readonly<Record<AgentSupplyAssetType, readonly (AgentPromptLayerId | 'runtime')[]>> = {
  platform_core: ['0'],
  agent_resident_core: ['0'],
  skill: ['0', '1', '4'],
  business_projection: ['2', '3'],
  run_state: ['5', '6'],
  tool_code_guardrails: ['runtime']
}

export const AGENT_SKILL_LOAD_MODES = ['resident', 'on_demand'] as const
export type AgentSkillLoadMode = (typeof AGENT_SKILL_LOAD_MODES)[number]

export const AGENT_SKILL_ACTIVATION_MODES = ['always', 'explicit_route', 'code_prefetch', 'model_tool'] as const
export type AgentSkillActivationMode = (typeof AGENT_SKILL_ACTIVATION_MODES)[number]

export type AgentSkillDefinition = {
  id: string
  title: string
  description: string
  bodySource: string
  residentBodyLayer: '0'
  onDemandDirectoryLayer: '1'
  onDemandBodyLayer: '4'
}

export const AGENT_SKILL_CATALOG = {
  'tidiao.environment-manual': {
    id: 'tidiao.environment-manual', title: '提调聊天区环境手册',
    description: '提调对聊天区、状态、消息和编排能力的详细操作知识。',
    bodySource: 'docs/agents/提调/skills/environment-manual/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'scriptwriter.storycraft-manual': {
    id: 'scriptwriter.storycraft-manual', title: '编剧剧作方法论',
    description: '主题、长弧、多线编织、张力和信息差等编剧方法。',
    bodySource: 'docs/agents/编剧/通用知识.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'personality_trainer.workflow': {
    id: 'personality_trainer.workflow', title: '鉴心工作规范',
    description: '人格问卷出题、校准、批量修订、训练、评测与版本操作的完整专业规范。',
    bodySource: 'docs/agents/鉴心/通用知识.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'personality_question_author.workflow': {
    id: 'personality_question_author.workflow', title: '设问制卷规范',
    description: '后台问卷生成、质量门诊断纠错、检查点续跑与结构化交卷规范。',
    bodySource: 'docs/agents/设问/通用知识.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'caifeng.projection-catalog': {
    id: 'caifeng.projection-catalog', title: '采风信息源目录',
    description: '由正式 AgentContext 投影目录生成的取证入口说明。',
    bodySource: 'src/app/agentContext/renderProjectionCatalogManual.ts', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'xingyi.knowledge-topics': {
    id: 'xingyi.knowledge-topics', title: '星依知识专题',
    description: '星依通过 list/search/read 三层工具发现并精读的项目知识专题。',
    bodySource: 'docs/agents/星依/skills/knowledge-topics/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'xingyi.doc-library-editing': {
    id: 'xingyi.doc-library-editing', title: '星依文档库编辑手册',
    description: '全局文档库寻址、枝与 index 概览、单位 CRUD、编译页和关系同步的完整操作规则。',
    bodySource: 'docs/agents/星依/skills/doc-library-editing/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'xingyi.playable-world-builder': {
    id: 'xingyi.playable-world-builder', title: '星依一键开玩世界',
    description: '从一句话连续构造文档库、主要角色、世界、群聊、全员在场、叙事种子与最后头像。',
    bodySource: 'docs/agents/星依/skills/playable-world-builder/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'xingyi.relation-hint-authoring': {
    id: 'xingyi.relation-hint-authoring', title: '星依关系提示编写手册',
    description: '关系提示合法语法、谓词方向、证据边界、同名消歧、整组覆盖和复诊闭环。',
    bodySource: 'docs/agents/星依/skills/relation-hint-authoring/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'zaoce.basic-authoring': {
    id: 'zaoce.basic-authoring', title: '造册基础制作规范',
    description: '造册每轮都要遵守的事实来源、分类、字段和批量交稿规则。',
    bodySource: 'docs/agents/造册/通用知识.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'zaoce.advanced-authoring': {
    id: 'zaoce.advanced-authoring', title: '造册进阶制作手册',
    description: '按准确 selector 读取自定义模板、跨状态栏引用或富媒体脚手架方法。',
    bodySource: 'docs/agents/造册/skills/advanced-authoring/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'huiyu.map-core': {
    id: 'huiyu.map-core', title: '绘舆地图知识核心',
    description: '绘舆每轮都需要的类目、量级、探索和交稿硬规则。',
    bodySource: 'docs/agents/绘舆/通用知识.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  },
  'huiyu.map-manual': {
    id: 'huiyu.map-manual', title: '绘舆地图详细手册',
    description: '绘舆低频画法、笔刷、布局与硬校验详情。',
    bodySource: 'docs/agents/绘舆/skills/map-manual/SKILL.md', residentBodyLayer: '0', onDemandDirectoryLayer: '1', onDemandBodyLayer: '4'
  }
} as const satisfies Readonly<Record<string, AgentSkillDefinition>>

export type AgentSkillId = keyof typeof AGENT_SKILL_CATALOG

export type AgentSkillGrant = {
  skillId: AgentSkillId
  loadMode: AgentSkillLoadMode
  activation: readonly AgentSkillActivationMode[]
  /** 正文装载失败时的正式策略；required 立即失败，optional 只留 trace 并继续装配其余供给。 */
  failurePolicy: 'required' | 'optional'
}

export const AGENT_SUPPLY_AGENT_KINDS = ['tidiao', 'scriptwriter', 'personality_trainer', 'personality_question_author', 'caifeng', 'xingyi', 'role_reply', 'zaoce', 'huiyu'] as const
export type AgentSupplyAgentKind = (typeof AGENT_SUPPLY_AGENT_KINDS)[number]

export const AGENT_SUPPLY_PROFILE_IDS = [
  'tidiao.director-round',
  'tidiao.fast-reply-planner',
  'tidiao.focused-action-planner',
  'tidiao.post-round',
  'tidiao.correction',
  'tidiao.precision',
  'scriptwriter.narrative-analysis',
  'scriptwriter.seed-impact-prediction',
  'scriptwriter.seed-fact-reconciliation',
  'scriptwriter.seed-background-evolution',
  'scriptwriter.seed-workspace',
  'scriptwriter.workspace',
  'personality_trainer.workspace',
  'personality_question_author.background',
  'caifeng.research',
  'xingyi.global',
  'xingyi.diary-generation',
  'role_reply.plan-orchestration',
  'role_reply.personality-narration',
  'role_reply.chat',
  'role_reply.focused-action-message',
  'zaoce.status-panel',
  'huiyu.dispatch',
  'huiyu.workspace'
] as const
export type AgentSupplyProfileId = (typeof AGENT_SUPPLY_PROFILE_IDS)[number]

export type AgentPromptAssemblyKind = 'director_seven_layer' | 'unified_context_block' | 'specialized_subagent_loop'
export type AgentSupplyMigrationState = 'runtime_managed' | 'declared_legacy_prompt' | 'declared_missing_context_recipe'
export type AgentFormalContextSource = {
  kind: 'formal_stage_payload'
  /** 生产代码中构造这份阶段载荷的唯一入口；它不是完整 AgentContext 的别名。 */
  source: string
}
export type AgentCompletionContract =
  | { strategy: 'completion_tool'; toolName: string; mutationToolsAreTerminal: false }
  | { strategy: 'model_judgement'; mutationToolsAreTerminal: false }
  | { strategy: 'runtime_stage_machine'; terminalTools: readonly string[]; mutationToolsAreTerminal: false }

export type AgentSupplyManifest = {
  profileId: AgentSupplyProfileId
  agentKind: AgentSupplyAgentKind
  version: string
  responsibility: string
  entrypoint: string
  promptAssembly: AgentPromptAssemblyKind
  migrationState: AgentSupplyMigrationState
  residentCore: { version: string; source: string }
  contextRecipe: AgentContextAgentKind | null
  contextFailurePolicy: AgentContextFailurePolicy | 'not_registered'
  /** 不走 AgentContext 配方、但有正式机器载荷的专用 Agent 必须在这里点明来源。 */
  contextSource?: AgentFormalContextSource
  skillGrants: readonly AgentSkillGrant[]
  toolPolicy: {
    registrySource: string
    /** 只是初始高频集，不是权限。权限必须在 registry/catalog 构造前完成裁剪。 */
    commonTools: readonly string[]
    deferredDiscovery: boolean
  }
  completion: AgentCompletionContract
}

export const AGENT_SUPPLY_MANIFESTS: Readonly<Record<AgentSupplyProfileId, AgentSupplyManifest>> = {
  'tidiao.director-round': {
    profileId: 'tidiao.director-round', agentKind: 'tidiao', version: 'v1',
    responsibility: '统筹当前轮并形成可审计的导演决策。', entrypoint: 'src/app/groupDirectorHarness.ts',
    promptAssembly: 'director_seven_layer', migrationState: 'runtime_managed',
    residentCore: { version: 'tidiao-core-v1', source: 'src/app/agentKnowledge/tidiaoKnowledge.ts#constantBlock' },
    contextRecipe: 'tidiao', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [{ skillId: 'tidiao.environment-manual', loadMode: 'on_demand', activation: ['code_prefetch'], failurePolicy: 'optional' }],
    toolPolicy: {
      registrySource: 'src/app/groupDirectorHarness.ts#ToolRegistry',
      commonTools: [
        'readScenarioSkill',
        'consultScript',
        'addCastDirection',
        'reviseCastDirection',
        'readNarrationSkill',
        'reviseNarrationDirection',
        'confirmNarrationCall',
        'finishRound'
      ],
      deferredDiscovery: true
    },
    completion: { strategy: 'completion_tool', toolName: 'finishRound', mutationToolsAreTerminal: false }
  },
  'tidiao.fast-reply-planner': {
    profileId: 'tidiao.fast-reply-planner', agentKind: 'tidiao', version: 'v1',
    responsibility: '为快速回复中的单条角色消息确定内容计划、表达占比和建议字数，不写最终正文。',
    entrypoint: 'src/composables/app/useChatSendPipeline.ts#runSingleChat',
    promptAssembly: 'unified_context_block', migrationState: 'runtime_managed',
    residentCore: { version: 'tidiao-message-writing-plan-core-v1', source: 'src/app/messageWritingPlan.ts#buildTidiaoMessageWritingPlanMessages' },
    contextRecipe: 'role_reply', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [],
    toolPolicy: {
      registrySource: 'none:fast-reply-planner-has-no-tools',
      commonTools: [],
      deferredDiscovery: false
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'tidiao.focused-action-planner': {
    profileId: 'tidiao.focused-action-planner', agentKind: 'tidiao', version: 'v1',
    responsibility: '消费书童已判明的动作任务卡与精简事实，确定内容计划、表达占比和建议字数，不写最终正文。',
    entrypoint: 'src/composables/app/useChatSendPipeline.ts#runFocusedActionPipeline',
    promptAssembly: 'unified_context_block', migrationState: 'runtime_managed',
    residentCore: { version: 'tidiao-message-writing-plan-core-v1', source: 'src/app/messageWritingPlan.ts#buildTidiaoMessageWritingPlanMessages' },
    contextRecipe: 'focused_action', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [],
    toolPolicy: {
      registrySource: 'none:focused-action-planner-has-no-tools',
      commonTools: [],
      deferredDiscovery: false
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'tidiao.post-round': {
    profileId: 'tidiao.post-round', agentKind: 'tidiao', version: 'v1',
    responsibility: '在可见正文落库后审计已发生事实、结算剧本与种子、落账状态，并只在必要时补演。',
    entrypoint: 'src/app/groupDirectorHarness.ts#postRoundSupplement',
    promptAssembly: 'director_seven_layer', migrationState: 'runtime_managed',
    residentCore: { version: 'tidiao-post-round-core-v1', source: 'src/app/agentKnowledge/tidiaoKnowledge.ts#constantBlock|src/app/groupDirectorPass.ts#buildPostRoundDecisionLoopSystemPrompt' },
    contextRecipe: 'tidiao', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [{ skillId: 'tidiao.environment-manual', loadMode: 'on_demand', activation: ['code_prefetch'], failurePolicy: 'optional' }],
    toolPolicy: {
      registrySource: 'src/app/groupDirectorHarness.ts#ToolRegistry.postRoundSupplement',
      commonTools: [
        'readScenarioSkill',
        'consultScript',
        'addCastDirection',
        'reviseCastDirection',
        'readNarrationSkill',
        'reviseNarrationDirection',
        'confirmNarrationCall',
        'finishRound'
      ],
      deferredDiscovery: true
    },
    completion: { strategy: 'completion_tool', toolName: 'finishRound', mutationToolsAreTerminal: false }
  },
  'tidiao.correction': {
    profileId: 'tidiao.correction', agentKind: 'tidiao', version: 'v1',
    responsibility: '按用户纠偏指令读取、修改或重生成已有消息及其关联真值。', entrypoint: 'src/app/tidiaoCorrectionLoop.ts#runTidiaoCorrectionLoop',
    promptAssembly: 'director_seven_layer', migrationState: 'runtime_managed',
    residentCore: { version: 'tidiao-correction-core-v1', source: 'src/app/tidiaoCorrectionLoop.ts#buildTidiaoCorrectionDirectiveBlock' },
    contextRecipe: 'tidiao', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [{ skillId: 'tidiao.environment-manual', loadMode: 'on_demand', activation: ['code_prefetch'], failurePolicy: 'optional' }],
    toolPolicy: {
      registrySource: 'src/app/tidiaoCorrectionLoop.ts#correctionTools',
      commonTools: [
        'readChatMessage', 'editChatMessage', 'appendChatMessage',
        'readMessagePrompt', 'editMessagePrompt',
        'escalateCorrection', 'askUser', 'regenerateFromPrompt',
        'regenerateCastFromDirections',
        'resumeOrchestration',
        'readMessageProjection', 'reprojectMessage'
      ],
      deferredDiscovery: true
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'tidiao.precision': {
    profileId: 'tidiao.precision', agentKind: 'tidiao', version: 'v1',
    responsibility: '在锚定消息范围内精确修改原文，并按需重投相关投影。', entrypoint: 'src/app/tidiaoCorrectionLoop.ts#runTidiaoCorrectionLoop.precisionOnly',
    promptAssembly: 'director_seven_layer', migrationState: 'runtime_managed',
    residentCore: { version: 'tidiao-precision-core-v1', source: 'src/app/tidiaoCorrectionLoop.ts#buildTidiaoPrecisionEditDirectiveBlock' },
    contextRecipe: 'tidiao', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [{ skillId: 'tidiao.environment-manual', loadMode: 'on_demand', activation: ['code_prefetch'], failurePolicy: 'optional' }],
    toolPolicy: {
      registrySource: 'src/app/tidiaoCorrectionLoop.ts#correctionTools.precisionOnly',
      commonTools: ['readChatMessage', 'editChatMessage', 'appendChatMessage', 'readMessageProjection', 'reprojectMessage'],
      deferredDiscovery: true
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'scriptwriter.narrative-analysis': {
    profileId: 'scriptwriter.narrative-analysis', agentKind: 'scriptwriter', version: 'v1',
    responsibility: '分析本轮事件对世界叙事种子的影响并结构化交稿。', entrypoint: 'src/app/narrativeScriptwriterSubagent.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'scriptwriter-analysis-core-v1', source: 'src/app/narrativeScriptwriterSubagent.ts#SYSTEM_PROMPT' },
    contextRecipe: 'scriptwriter', contextFailurePolicy: 'abort', skillGrants: [],
    toolPolicy: { registrySource: 'src/app/narrativeScriptwriterSubagent.ts#deps.tools', commonTools: ['submitNarrativeAnalysis'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitNarrativeAnalysis', mutationToolsAreTerminal: false }
  },
  'scriptwriter.seed-impact-prediction': {
    profileId: 'scriptwriter.seed-impact-prediction', agentKind: 'scriptwriter', version: 'v1',
    responsibility: '根据本轮正式统筹载荷预测尚未发生的叙事种子影响。', entrypoint: 'src/app/narrativeSeedImpactAgent.ts#predictNarrativeSeedImpacts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'seed-impact-prediction-core-v1', source: 'src/app/narrativeSeedImpactAgent.ts#predictNarrativeSeedImpacts.system' },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'src/app/narrativeSeedImpactAgent.ts#predictNarrativeSeedImpacts.formalStagePayload' },
    skillGrants: [],
    toolPolicy: { registrySource: 'src/app/narrativeSeedImpactAgent.ts#createSubmitTool', commonTools: ['submitPredictedImpacts'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitPredictedImpacts', mutationToolsAreTerminal: false }
  },
  'scriptwriter.seed-fact-reconciliation': {
    profileId: 'scriptwriter.seed-fact-reconciliation', agentKind: 'scriptwriter', version: 'v1',
    responsibility: '只按正式落库消息与已落账变化核对叙事种子事实。', entrypoint: 'src/app/narrativeSeedImpactAgent.ts#reconcileNarrativeSeedFacts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'seed-fact-reconciliation-core-v1', source: 'src/app/narrativeSeedImpactAgent.ts#reconcileNarrativeSeedFacts.system' },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'src/app/narrativeSeedImpactAgent.ts#reconcileNarrativeSeedFacts.formalStagePayload' },
    skillGrants: [],
    toolPolicy: { registrySource: 'src/app/narrativeSeedImpactAgent.ts#createSubmitTool', commonTools: ['submitFactCommits'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitFactCommits', mutationToolsAreTerminal: false }
  },
  'scriptwriter.seed-background-evolution': {
    profileId: 'scriptwriter.seed-background-evolution', agentKind: 'scriptwriter', version: 'v1',
    responsibility: '根据服务端限定的到期种子载荷执行有限后台叙事演化。', entrypoint: 'src/app/narrativeSeedImpactAgent.ts#evolveOverdueNarrativeSeeds',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'seed-background-evolution-core-v1', source: 'src/app/narrativeSeedImpactAgent.ts#evolveOverdueNarrativeSeeds.system' },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'src/app/narrativeSeedImpactAgent.ts#evolveOverdueNarrativeSeeds.formalStagePayload' },
    skillGrants: [],
    toolPolicy: { registrySource: 'src/app/narrativeSeedImpactAgent.ts#createSubmitTool', commonTools: ['submitBackgroundEvolution'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitBackgroundEvolution', mutationToolsAreTerminal: false }
  },
  'scriptwriter.seed-workspace': {
    profileId: 'scriptwriter.seed-workspace', agentKind: 'scriptwriter', version: 'v1',
    responsibility: '承接星依旧入口，对世界叙事种子执行结构化批量变更。', entrypoint: 'src/app/narrativeSeedWorkspaceAgent.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'seed-workspace-core-v1', source: 'src/app/narrativeSeedWorkspaceAgent.ts#system' },
    contextRecipe: 'scriptwriter_workspace', contextFailurePolicy: 'abort',
    skillGrants: [{ skillId: 'scriptwriter.storycraft-manual', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' }],
    // dispatchResearch 只有接缝在位才会进入真实 registry；运行时 helper 求交，不因 manifest 名字补权。
    toolPolicy: { registrySource: 'src/app/narrativeSeedWorkspaceAgent.ts', commonTools: ['submitNarrativeSeedChanges', 'dispatchResearch'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitNarrativeSeedChanges', mutationToolsAreTerminal: false }
  },
  'scriptwriter.workspace': {
    profileId: 'scriptwriter.workspace', agentKind: 'scriptwriter', version: 'v1',
    responsibility: '在世界级编剧工作区维护叙事种子。', entrypoint: 'src/app/scriptwriterAgentHarness.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'scriptwriter-workspace-core-v1', source: 'src/app/scriptwriterAgentHarness.ts' },
    contextRecipe: 'scriptwriter_workspace', contextFailurePolicy: 'abort',
    skillGrants: [{ skillId: 'scriptwriter.storycraft-manual', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' }],
    toolPolicy: { registrySource: 'src/app/scriptwriterAgentHarness.ts', commonTools: ['readNarrativeSeedDetail', 'createNarrativeSeed', 'updateNarrativeSeed', 'deleteNarrativeSeed'], deferredDiscovery: false },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'personality_trainer.workspace': {
    profileId: 'personality_trainer.workspace', agentKind: 'personality_trainer', version: 'v1',
    responsibility: '以鉴心身份与用户协作校准角色人格，并派遣设问制卷、执行训练、评测和模型版本流程。',
    entrypoint: 'src/app/personalityTrainerAgentHarness.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'personality-trainer-core-v1', source: 'src/app/personalityTrainerAgentHarness.ts#PERSONALITY_TRAINER_SYSTEM_PROMPT' },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'src/app/personalityTrainingAgentTools.ts#PersonalityTrainingAgentWorkspaceSnapshot' },
    skillGrants: [{ skillId: 'personality_trainer.workflow', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' }],
    toolPolicy: {
      registrySource: 'src/app/personalityTrainingAgentTools.ts#createPersonalityTrainingAgentTools',
      commonTools: [
        'readPersonalityTrainingWorkspace',
        'readPersonalityTrainingQuestions',
        'deletePersonalityTrainingQuestions',
        'patchPersonalityTrainingQuestions',
        'setPersonalityTrainingAnswers',
        'rewriteCharacterPersonality',
        'completePersonalityCalibrationRound',
        'startPersonalityQuestionBatch',
        'generatePersonalityFrozenEvaluation',
        'startPersonalityQuestionnaireGeneration',
        'managePersonalityTrainingRun',
        'startPersonalityEvaluation',
        'managePersonalityModelVersion'
      ],
      deferredDiscovery: false
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'personality_question_author.background': {
    profileId: 'personality_question_author.background',
    agentKind: 'personality_question_author',
    version: 'v1',
    responsibility: '接受鉴心派遣，在后台生成或续跑人格问卷，依据结构化质量门诊断有限纠错并交卷。',
    entrypoint: 'src/app/personalityQuestionAuthorSubagent.ts',
    promptAssembly: 'specialized_subagent_loop',
    migrationState: 'runtime_managed',
    residentCore: {
      version: 'personality-question-author-core-v1',
      source: 'src/app/personalityQuestionAuthorSubagent.ts#PERSONALITY_QUESTION_AUTHOR_SYSTEM_PROMPT'
    },
    contextRecipe: null,
    contextFailurePolicy: 'not_registered',
    contextSource: {
      kind: 'formal_stage_payload',
      source: 'src/app/personalityQuestionAuthorSubagent.ts#PersonalityQuestionAuthorInput'
    },
    skillGrants: [{
      skillId: 'personality_question_author.workflow',
      loadMode: 'resident',
      activation: ['always'],
      failurePolicy: 'required'
    }],
    toolPolicy: {
      registrySource: 'src/app/personalityQuestionAuthorSubagent.ts',
      commonTools: ['generateQuestionnaireAttempt', 'submitQuestionnaireGeneration'],
      deferredDiscovery: false
    },
    completion: {
      strategy: 'completion_tool',
      toolName: 'submitQuestionnaireGeneration',
      mutationToolsAreTerminal: false
    }
  },
  'caifeng.research': {
    profileId: 'caifeng.research', agentKind: 'caifeng', version: 'v1',
    responsibility: '在授权范围内钻取证据并带出处交稿。', entrypoint: 'src/app/caifengSubagent.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'caifeng-core-v1', source: 'src/app/caifengSubagent.ts#CAIFENG_SYSTEM_PROMPT' },
    contextRecipe: 'caifeng', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [{ skillId: 'caifeng.projection-catalog', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' }],
    toolPolicy: { registrySource: 'src/app/caifengSubagent.ts#buildCaifengToolset', commonTools: ['submitFindings'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitFindings', mutationToolsAreTerminal: false }
  },
  'xingyi.global': {
    profileId: 'xingyi.global', agentKind: 'xingyi', version: 'v1',
    responsibility: '跨页面理解用户意图并调用已授权能力。', entrypoint: 'src/app/xingyiAgentHarness.ts',
    promptAssembly: 'unified_context_block', migrationState: 'runtime_managed',
    residentCore: { version: 'xingyi-charter-v2', source: 'docs/agents/星依/通用知识.md|src/app/xingyiCharter.ts#TOOL_CALL_REALITY_RULE' },
    contextRecipe: 'xingyi', contextFailurePolicy: 'explicit_unavailable',
    skillGrants: [
      { skillId: 'xingyi.knowledge-topics', loadMode: 'on_demand', activation: ['explicit_route', 'model_tool'], failurePolicy: 'optional' },
      { skillId: 'xingyi.doc-library-editing', loadMode: 'on_demand', activation: ['explicit_route', 'model_tool'], failurePolicy: 'required' },
      { skillId: 'xingyi.playable-world-builder', loadMode: 'on_demand', activation: ['explicit_route', 'model_tool'], failurePolicy: 'required' },
      { skillId: 'xingyi.relation-hint-authoring', loadMode: 'on_demand', activation: ['explicit_route', 'model_tool'], failurePolicy: 'required' }
    ],
    toolPolicy: {
      registrySource: 'src/app/xingyiAgentHarness.ts',
      commonTools: [
        'listXingyiKnowledgeTopics', 'searchXingyiKnowledge', 'readXingyiKnowledgeTopic',
        'readDocLibraryEditingSkill', 'readPlayableWorldBuilderSkill', 'readRelationHintSkill',
        'readPlayableWorldBuildReceipt', 'buildPlayableWorld', 'askUser',
        'searchWeb', 'generateImage', 'generateImagesBatch'
      ],
      deferredDiscovery: true
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'xingyi.diary-generation': {
    profileId: 'xingyi.diary-generation', agentKind: 'xingyi', version: 'v1',
    responsibility: '把服务端选定的当日素材整理为指定视角的日记正文。', entrypoint: 'server/services/xingyiDiaryService.ts#runXingyiDiaryAgent',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'xingyi-diary-core-v1', source: 'server/services/xingyiDiaryService.ts#XINGYI_VIEWPOINT_SYSTEM_PROMPT|OBJECTIVE_VIEWPOINT_SYSTEM_PROMPT' },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'server/services/xingyiDiaryService.ts#runXingyiDiaryAgent.materialsText' },
    skillGrants: [],
    toolPolicy: {
      registrySource: 'server/services/xingyiDiaryService.ts#createXingyiDiaryKnowledgeTools',
      commonTools: ['listXingyiDiaryKnowledgeTopics', 'searchXingyiDiaryKnowledge', 'readXingyiDiaryKnowledgeTopic'],
      deferredDiscovery: false
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'role_reply.plan-orchestration': {
    profileId: 'role_reply.plan-orchestration', agentKind: 'role_reply', version: 'v1',
    responsibility: '根据正式回复阶段载荷生成、评审并收束角色回复计划。', entrypoint: 'src/app/replyPlanOrchestratorHarness.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: {
      version: 'role-reply-plan-core-v1',
      source: 'src/app/replyPlanOrchestratorHarness.ts#buildReplyPlanOrchestratorPrompt|directorMode:buildTidiaoKnowledgeInjection.constantBlock'
    },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'src/app/replyPlanOrchestratorHarness.ts#ReplyPlanOrchestratorHarnessInput' },
    skillGrants: [{
      skillId: 'tidiao.environment-manual',
      loadMode: 'on_demand',
      activation: ['code_prefetch'],
      failurePolicy: 'optional'
    }],
    toolPolicy: {
      registrySource: 'src/app/replyPlanOrchestratorHarness.ts#actorTools',
      commonTools: ['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'generatePlanBatch', 'reviewPlanCandidates'],
      deferredDiscovery: true
    },
    completion: { strategy: 'runtime_stage_machine', terminalTools: ['generatePlanBatch', 'reviewPlanCandidates'], mutationToolsAreTerminal: false }
  },
  'role_reply.personality-narration': {
    profileId: 'role_reply.personality-narration', agentKind: 'role_reply', version: 'v1',
    responsibility: '依据本轮正式旁白载荷选择旁白 Skill，并向正文生成链路提交旁白方向。', entrypoint: 'src/app/personalityNarrationSubagent.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'personality-narration-core-v1', source: 'src/app/personalityNarrationSubagent.ts#buildPersonalityNarrationSubagentMessages' },
    contextRecipe: null, contextFailurePolicy: 'not_registered',
    contextSource: { kind: 'formal_stage_payload', source: 'src/app/personalityNarrationSubagent.ts#PersonalityNarrationSubagentInput' },
    skillGrants: [],
    toolPolicy: {
      registrySource: 'src/app/personalityNarrationSubagent.ts#ToolRegistry',
      commonTools: ['readNarrationSkill', 'confirmNarrationCall'],
      deferredDiscovery: false
    },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'role_reply.chat': {
    profileId: 'role_reply.chat', agentKind: 'role_reply', version: 'v1',
    responsibility: '只按目标角色可见范围生成角色回复。', entrypoint: 'src/composables/app/useChatSendPipeline.ts',
    promptAssembly: 'unified_context_block', migrationState: 'runtime_managed',
    residentCore: { version: 'role-reply-core-v1', source: 'src/composables/app/useChatSendPipeline.ts#buildFinalOutboundPrompt' },
    contextRecipe: 'role_reply', contextFailurePolicy: 'abort', skillGrants: [],
    toolPolicy: { registrySource: 'src/composables/app/useChatSendPipeline.ts#buildFinalOutboundPrompt(no-independent-registry)', commonTools: [], deferredDiscovery: false },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'role_reply.focused-action-message': {
    profileId: 'role_reply.focused-action-message', agentKind: 'role_reply', version: 'v1',
    responsibility: '结合用户可编辑提示词库、提调写作计划和动作正式上下文生成最终可见动作消息。',
    entrypoint: 'src/composables/app/useChatSendPipeline.ts#runFocusedActionPipeline',
    promptAssembly: 'unified_context_block', migrationState: 'runtime_managed',
    residentCore: { version: 'focused-action-message-core-v1', source: 'src/app/focusedActionPrompt.ts#buildFocusedActionFinalMessages' },
    contextRecipe: 'focused_action', contextFailurePolicy: 'abort', skillGrants: [],
    toolPolicy: { registrySource: 'none:focused-action-message-has-no-tools', commonTools: [], deferredDiscovery: false },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  },
  'zaoce.status-panel': {
    profileId: 'zaoce.status-panel', agentKind: 'zaoce', version: 'v2',
    responsibility: '根据正式资料创建或更新状态栏、选择受控展示载体并结构化交稿。', entrypoint: 'src/app/zaoceSubagent.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'zaoce-core-v3', source: 'src/app/zaoceSubagent.ts#ZAOCE_SYSTEM_PROMPT_BASE' },
    contextRecipe: 'zaoce', contextFailurePolicy: 'abort',
    skillGrants: [
      { skillId: 'zaoce.basic-authoring', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' },
      { skillId: 'zaoce.advanced-authoring', loadMode: 'on_demand', activation: ['explicit_route', 'model_tool'], failurePolicy: 'optional' }
    ],
    toolPolicy: { registrySource: 'src/app/zaoceSubagent.ts', commonTools: ['readStatusPanels', 'readZaoceAdvancedSkill', 'applyStatusPanelBatch', 'submitPanels'], deferredDiscovery: true },
    completion: { strategy: 'completion_tool', toolName: 'submitPanels', mutationToolsAreTerminal: false }
  },
  'huiyu.dispatch': {
    profileId: 'huiyu.dispatch', agentKind: 'huiyu', version: 'v1',
    responsibility: '根据提调任务书制作地图或草案并结构化交稿。', entrypoint: 'src/app/huiyuSubagent.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'huiyu-dispatch-core-v1', source: 'src/app/huiyuSubagent.ts#HUIYU_SYSTEM_PROMPT_BASE' },
    contextRecipe: 'huiyu_dispatch', contextFailurePolicy: 'abort',
    skillGrants: [
      { skillId: 'huiyu.map-core', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' },
      { skillId: 'huiyu.map-manual', loadMode: 'on_demand', activation: ['model_tool'], failurePolicy: 'optional' }
    ],
    toolPolicy: { registrySource: 'src/app/huiyuMapTools.ts', commonTools: ['readMapSummary', 'readMapManual', 'submitMap'], deferredDiscovery: false },
    completion: { strategy: 'completion_tool', toolName: 'submitMap', mutationToolsAreTerminal: false }
  },
  'huiyu.workspace': {
    profileId: 'huiyu.workspace', agentKind: 'huiyu', version: 'v1',
    responsibility: '在地图工作区与用户协作编辑当前图纸。', entrypoint: 'src/app/cartographerAgentHarness.ts',
    promptAssembly: 'specialized_subagent_loop', migrationState: 'runtime_managed',
    residentCore: { version: 'huiyu-workspace-core-v1', source: 'src/app/cartographerAgentHarness.ts' },
    contextRecipe: 'huiyu_workspace', contextFailurePolicy: 'abort', skillGrants: [],
    toolPolicy: { registrySource: 'src/app/cartographerAgentHarness.ts', commonTools: ['paintArmor', 'drawVectorPrimitive', 'deleteMapFeatures'], deferredDiscovery: false },
    completion: { strategy: 'model_judgement', mutationToolsAreTerminal: false }
  }
}

export function getAgentSupplyManifest(profileId: AgentSupplyProfileId): AgentSupplyManifest {
  const manifest = AGENT_SUPPLY_MANIFESTS[profileId]
  if (!manifest) throw new Error(`未知 Agent 供给清单：${String(profileId)}`)
  return manifest
}

export function listAgentResidentSkillIds(profileId: AgentSupplyProfileId): AgentSkillId[] {
  return getAgentSupplyManifest(profileId).skillGrants.filter((grant) => grant.loadMode === 'resident').map((grant) => grant.skillId)
}

export function listAgentOnDemandSkillIds(profileId: AgentSupplyProfileId): AgentSkillId[] {
  return getAgentSupplyManifest(profileId).skillGrants.filter((grant) => grant.loadMode === 'on_demand').map((grant) => grant.skillId)
}

export type AgentSkillSupplyPlan = {
  resident: Array<{ skillId: AgentSkillId; layer: '0' }>
  catalog: Array<{ skillId: AgentSkillId; layer: '1' }>
  activated: Array<{ skillId: AgentSkillId; layer: '4' }>
  rejected: Array<{ skillId: string; reason: 'not_authorized' | 'not_on_demand' }>
}

/**
 * 只做授权与落层规划，不读取正文。缺少 grant 即 unavailable；调用方不得先加载正文再要求模型忽略。
 * 正文读取和实际 prompt 注入属于批次 1B 的 loader/assembler 工作。
 */
export function resolveAgentSkillSupplyPlan(
  profileId: AgentSupplyProfileId,
  requestedSkillIds: readonly string[] = []
): AgentSkillSupplyPlan {
  const manifest = getAgentSupplyManifest(profileId)
  const grants = new Map(manifest.skillGrants.map((grant) => [grant.skillId, grant]))
  const resident = manifest.skillGrants
    .filter((grant) => grant.loadMode === 'resident')
    .map((grant) => ({ skillId: grant.skillId, layer: '0' as const }))
  const catalog = manifest.skillGrants
    .filter((grant) => grant.loadMode === 'on_demand')
    .map((grant) => ({ skillId: grant.skillId, layer: '1' as const }))
  const activated: AgentSkillSupplyPlan['activated'] = []
  const rejected: AgentSkillSupplyPlan['rejected'] = []
  for (const requested of [...new Set(requestedSkillIds.map((item) => String(item || '').trim()).filter(Boolean))]) {
    const grant = grants.get(requested as AgentSkillId)
    if (!grant) {
      rejected.push({ skillId: requested, reason: 'not_authorized' })
      continue
    }
    if (grant.loadMode !== 'on_demand') {
      rejected.push({ skillId: requested, reason: 'not_on_demand' })
      continue
    }
    activated.push({ skillId: grant.skillId, layer: '4' })
  }
  return { resident, catalog, activated, rejected }
}

/**
 * 可用于缓存/trace 的稳定供给描述；不含当轮激活正文、业务投影、日志或 TODO。
 * 这是可审计描述，不冒充模型供应商返回的真实 cache key。
 */
export function renderAgentStableSupplyDescriptor(profileId: AgentSupplyProfileId): string {
  const manifest = getAgentSupplyManifest(profileId)
  const stableGrant = (grant: AgentSkillGrant) => ({
    skillId: grant.skillId,
    activation: [...grant.activation].sort(),
    failurePolicy: grant.failurePolicy
  })
  return JSON.stringify({
    profileId: manifest.profileId,
    agentKind: manifest.agentKind,
    version: manifest.version,
    promptAssembly: manifest.promptAssembly,
    residentCore: manifest.residentCore,
    contextRecipe: manifest.contextRecipe,
    contextSource: manifest.contextSource ?? null,
    residentSkills: manifest.skillGrants.filter((grant) => grant.loadMode === 'resident').map(stableGrant).sort((a, b) => a.skillId.localeCompare(b.skillId)),
    catalogSkills: manifest.skillGrants.filter((grant) => grant.loadMode === 'on_demand').map(stableGrant).sort((a, b) => a.skillId.localeCompare(b.skillId)),
    commonTools: [...manifest.toolPolicy.commonTools].sort(),
    deferredDiscovery: manifest.toolPolicy.deferredDiscovery
  })
}

export function validateAgentSupplyManifestRegistry(
  manifests: Readonly<Record<string, AgentSupplyManifest>> = AGENT_SUPPLY_MANIFESTS
): string[] {
  const issues: string[] = []
  const knownSkillIds = new Set(Object.keys(AGENT_SKILL_CATALOG))
  const registeredContextKinds = new Set<string>(AGENT_CONTEXT_KINDS)
  const seenProfiles = new Set<string>()

  for (const [key, manifest] of Object.entries(manifests)) {
    if (key !== manifest.profileId) issues.push(`${key}: registry key 与 profileId 不一致`)
    if (seenProfiles.has(manifest.profileId)) issues.push(`${manifest.profileId}: Agent profile 重复`)
    seenProfiles.add(manifest.profileId)
    if (!manifest.version.trim()) issues.push(`${manifest.profileId}: 缺少 manifest version`)
    if (!manifest.entrypoint.trim()) issues.push(`${manifest.profileId}: 缺少运行入口`)
    if (!manifest.residentCore.version.trim() || !manifest.residentCore.source.trim()) issues.push(`${manifest.profileId}: 常驻核缺少版本或来源`)
    if (manifest.contextRecipe) {
      if (!registeredContextKinds.has(manifest.contextRecipe)) issues.push(`${manifest.profileId}: 引用了未注册上下文配方 ${manifest.contextRecipe}`)
      if (manifest.contextFailurePolicy === 'not_registered') issues.push(`${manifest.profileId}: 已有上下文配方却标记 not_registered`)
    } else if (manifest.contextFailurePolicy !== 'not_registered') {
      issues.push(`${manifest.profileId}: 没有上下文配方却声明了失败策略`)
    }
    if (manifest.contextSource) {
      if (manifest.contextRecipe) issues.push(`${manifest.profileId}: AgentContext 配方与 formal stage payload 不能同时冒充上下文真值`)
      if (manifest.contextSource.kind !== 'formal_stage_payload' || !manifest.contextSource.source.trim()) {
        issues.push(`${manifest.profileId}: formal stage payload 缺少明确来源`)
      }
    }
    if (manifest.completion.mutationToolsAreTerminal !== false) issues.push(`${manifest.profileId}: mutation tool 不得自动终止 Agent`)
    for (const grant of manifest.skillGrants) {
      if (!knownSkillIds.has(grant.skillId)) issues.push(`${manifest.profileId}: 未知 Skill ${grant.skillId}`)
      if (!['required', 'optional'].includes(grant.failurePolicy)) issues.push(`${manifest.profileId}/${grant.skillId}: Skill 缺少 required/optional 装载失败策略`)
      if (grant.loadMode === 'resident' && !grant.activation.includes('always')) issues.push(`${manifest.profileId}/${grant.skillId}: resident Skill 必须 always 装配`)
      if (grant.loadMode === 'on_demand' && grant.activation.includes('always')) issues.push(`${manifest.profileId}/${grant.skillId}: on_demand Skill 不得 always 装配`)
    }
  }

  for (const contextKind of AGENT_CONTEXT_KINDS) {
    const matches = Object.values(manifests).filter((manifest) => manifest.contextRecipe === contextKind)
    if (!matches.length) issues.push(`${contextKind}: 已注册上下文配方没有任何 Agent profile 使用`)
  }
  return issues
}
