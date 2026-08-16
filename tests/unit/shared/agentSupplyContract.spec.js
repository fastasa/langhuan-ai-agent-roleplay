import { describe, expect, it } from 'vitest'
import { AGENT_CONTEXT_KINDS } from '../../../shared/agentContextRecipes'
import {
  AGENT_PROMPT_LAYER_IDS,
  AGENT_SKILL_CATALOG,
  AGENT_SUPPLY_ASSET_LAYER_MAP,
  AGENT_SUPPLY_MANIFESTS,
  AGENT_SUPPLY_PROFILE_IDS,
  getAgentSupplyManifest,
  renderAgentStableSupplyDescriptor,
  resolveAgentSkillSupplyPlan,
  validateAgentSupplyManifestRegistry
} from '../../../shared/agentSupplyManifest'

describe('AgentSupplyManifest 批次 1P 契约', () => {
  it('当前任务 TODO 由 runtime 保留，任何业务 profile 都不再声明旧提调工具', () => {
    for (const manifest of Object.values(AGENT_SUPPLY_MANIFESTS)) {
      expect(manifest.toolPolicy.commonTools, manifest.profileId).not.toContain('writeTodo')
      expect(manifest.toolPolicy.commonTools, manifest.profileId).not.toContain('updateTodo')
    }
  })

  it('六类供给资产只映射到现役七层或 runtime，不形成第二套层号', () => {
    expect(Object.keys(AGENT_SUPPLY_ASSET_LAYER_MAP)).toEqual([
      'platform_core', 'agent_resident_core', 'skill', 'business_projection', 'run_state', 'tool_code_guardrails'
    ])
    expect(AGENT_SUPPLY_ASSET_LAYER_MAP).toEqual({
      platform_core: ['0'],
      agent_resident_core: ['0'],
      skill: ['0', '1', '4'],
      business_projection: ['2', '3'],
      run_state: ['5', '6'],
      tool_code_guardrails: ['runtime']
    })
    expect(AGENT_PROMPT_LAYER_IDS).toEqual(['0', '1', '2', '3', '4', '5', '6'])
  })

  it('每个 profile 唯一且完整，所有上下文配方至少被一个运行 profile 引用', () => {
    expect(Object.keys(AGENT_SUPPLY_MANIFESTS).sort()).toEqual([...AGENT_SUPPLY_PROFILE_IDS].sort())
    expect(validateAgentSupplyManifestRegistry()).toEqual([])
    for (const kind of AGENT_CONTEXT_KINDS) {
      expect(Object.values(AGENT_SUPPLY_MANIFESTS).some((manifest) => manifest.contextRecipe === kind)).toBe(true)
    }
  })

  it('同一产品 Agent 的不同运行形态必须使用不同 profileId', () => {
    expect(getAgentSupplyManifest('scriptwriter.narrative-analysis')).toMatchObject({
      agentKind: 'scriptwriter', completion: { strategy: 'completion_tool', toolName: 'submitNarrativeAnalysis' }
    })
    expect(getAgentSupplyManifest('scriptwriter.workspace')).toMatchObject({
      agentKind: 'scriptwriter', completion: { strategy: 'model_judgement' }
    })
    expect(getAgentSupplyManifest('scriptwriter.seed-workspace')).toMatchObject({
      agentKind: 'scriptwriter',
      migrationState: 'runtime_managed',
      contextRecipe: 'scriptwriter_workspace',
      completion: { strategy: 'completion_tool', toolName: 'submitNarrativeSeedChanges' }
    })
    expect(getAgentSupplyManifest('personality_trainer.workspace')).toMatchObject({
      agentKind: 'personality_trainer',
      contextRecipe: null,
      contextFailurePolicy: 'not_registered',
      contextSource: { kind: 'formal_stage_payload' },
      skillGrants: [{ skillId: 'personality_trainer.workflow', loadMode: 'resident' }],
      completion: { strategy: 'model_judgement' }
    })
    expect(getAgentSupplyManifest('personality_question_author.background')).toMatchObject({
      agentKind: 'personality_question_author',
      contextRecipe: null,
      contextFailurePolicy: 'not_registered',
      contextSource: { kind: 'formal_stage_payload' },
      skillGrants: [{ skillId: 'personality_question_author.workflow', loadMode: 'resident' }],
      completion: { strategy: 'completion_tool', toolName: 'submitQuestionnaireGeneration' }
    })
    expect(getAgentSupplyManifest('huiyu.dispatch').entrypoint).not.toBe(getAgentSupplyManifest('huiyu.workspace').entrypoint)
    expect([
      getAgentSupplyManifest('scriptwriter.seed-impact-prediction').completion.toolName,
      getAgentSupplyManifest('scriptwriter.seed-fact-reconciliation').completion.toolName,
      getAgentSupplyManifest('scriptwriter.seed-background-evolution').completion.toolName
    ]).toEqual(['submitPredictedImpacts', 'submitFactCommits', 'submitBackgroundEvolution'])
  })

  it('叙事影响三阶段声明 formal_stage_payload，不冒充完整 AgentContext 配方', () => {
    for (const profileId of [
      'scriptwriter.seed-impact-prediction',
      'scriptwriter.seed-fact-reconciliation',
      'scriptwriter.seed-background-evolution'
    ]) {
      const manifest = getAgentSupplyManifest(profileId)
      expect(manifest).toMatchObject({
        migrationState: 'runtime_managed',
        contextRecipe: null,
        contextFailurePolicy: 'not_registered',
        contextSource: { kind: 'formal_stage_payload' }
      })
      expect(manifest.contextSource.source).toContain('narrativeSeedImpactAgent.ts')
    }
  })

  it('内部生产 Agent 有独立 profile，正式阶段载荷不冒充 AgentContext', () => {
    for (const profileId of [
      'role_reply.plan-orchestration',
      'role_reply.personality-narration'
    ]) {
      const manifest = getAgentSupplyManifest(profileId)
      expect(manifest).toMatchObject({
        migrationState: 'runtime_managed',
        contextRecipe: null,
        contextFailurePolicy: 'not_registered',
        contextSource: { kind: 'formal_stage_payload' }
      })
    }

    expect(getAgentSupplyManifest('role_reply.plan-orchestration')).toMatchObject({
      entrypoint: 'src/app/replyPlanOrchestratorHarness.ts',
      residentCore: {
        source: expect.stringContaining('directorMode:buildTidiaoKnowledgeInjection.constantBlock')
      },
      skillGrants: [{
        skillId: 'tidiao.environment-manual',
        loadMode: 'on_demand',
        activation: ['code_prefetch'],
        failurePolicy: 'optional'
      }],
      toolPolicy: { deferredDiscovery: true },
      completion: {
        strategy: 'runtime_stage_machine',
        terminalTools: ['generatePlanBatch', 'reviewPlanCandidates']
      }
    })
    expect(getAgentSupplyManifest('role_reply.personality-narration')).toMatchObject({
      toolPolicy: { commonTools: ['readNarrationSkill', 'confirmNarrationCall'], deferredDiscovery: false },
      completion: { strategy: 'model_judgement' }
    })
    expect(getAgentSupplyManifest('xingyi.diary-generation')).toMatchObject({
      migrationState: 'runtime_managed',
      contextRecipe: null,
      contextFailurePolicy: 'not_registered',
      contextSource: { kind: 'formal_stage_payload' },
      entrypoint: 'server/services/xingyiDiaryService.ts#runXingyiDiaryAgent',
      toolPolicy: {
        commonTools: ['listXingyiDiaryKnowledgeTopics', 'searchXingyiDiaryKnowledge', 'readXingyiDiaryKnowledgeTopic'],
        deferredDiscovery: false
      },
      completion: { strategy: 'model_judgement' }
    })
  })

  it('纠偏与精修共用 tidiao 正式投影，但职责、常用工具集和 profile 身份分离', () => {
    const correction = getAgentSupplyManifest('tidiao.correction')
    const precision = getAgentSupplyManifest('tidiao.precision')
    for (const manifest of [correction, precision]) {
      expect(manifest).toMatchObject({
        migrationState: 'runtime_managed',
        contextRecipe: 'tidiao',
        contextFailurePolicy: 'explicit_unavailable',
        toolPolicy: { deferredDiscovery: true },
        completion: { strategy: 'model_judgement' }
      })
      expect(manifest.contextSource).toBeUndefined()
    }
    expect(correction.entrypoint).not.toBe(precision.entrypoint)
    expect(correction.toolPolicy.commonTools).toEqual(expect.arrayContaining(['readChatMessage', 'editChatMessage']))
    expect(correction.toolPolicy.commonTools).not.toEqual(expect.arrayContaining(['writeTodo', 'updateTodo']))
    expect(correction.toolPolicy.commonTools).toContain('askUser')
    expect(correction.toolPolicy.commonTools).not.toContain('readNarrationSkill')
    expect(correction.toolPolicy.commonTools).not.toContain('readStatusPanels')
    expect(correction.toolPolicy.commonTools).not.toContain('searchDirectorMemory')
    expect(precision.toolPolicy.commonTools).not.toContain('askUser')
    expect(getAgentSupplyManifest('xingyi.global').toolPolicy.commonTools).toEqual(expect.arrayContaining([
      'askUser', 'searchWeb', 'generateImage', 'generateImagesBatch'
    ]))
    expect(precision.toolPolicy.commonTools).toEqual(expect.arrayContaining(['readChatMessage', 'editChatMessage']))
    expect(precision.toolPolicy.commonTools).not.toEqual(expect.arrayContaining(['writeTodo', 'updateTodo']))
  })

  it('role_reply.chat 无 Skill/独立 ToolRegistry，统一 role_reply 投影与最终 Prompt 单入口已满足其完整门槛', () => {
    expect(getAgentSupplyManifest('role_reply.chat')).toMatchObject({
      migrationState: 'runtime_managed',
      contextRecipe: 'role_reply',
      contextFailurePolicy: 'abort',
      skillGrants: [],
      toolPolicy: { commonTools: [], deferredDiscovery: false },
      completion: { strategy: 'model_judgement' }
    })
  })

  it('快速回复与动作输入把提调规划和正式消息成文登记为不同运行形态', () => {
    expect(getAgentSupplyManifest('tidiao.fast-reply-planner')).toMatchObject({
      agentKind: 'tidiao', contextRecipe: 'role_reply', responsibility: expect.stringContaining('不写最终正文')
    })
    expect(getAgentSupplyManifest('tidiao.focused-action-planner')).toMatchObject({
      agentKind: 'tidiao', contextRecipe: 'focused_action', responsibility: expect.stringContaining('不写最终正文')
    })
    expect(getAgentSupplyManifest('role_reply.focused-action-message')).toMatchObject({
      agentKind: 'role_reply', contextRecipe: 'focused_action', responsibility: expect.stringContaining('生成最终可见动作消息')
    })
  })

  it('已完成统一上下文、Skill、trace 与工具策略接线的 profile 全部退出 declared_*', () => {
    for (const profileId of [
      'tidiao.director-round',
      'tidiao.fast-reply-planner',
      'tidiao.focused-action-planner',
      'tidiao.post-round',
      'tidiao.correction',
      'tidiao.precision',
      'scriptwriter.narrative-analysis',
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
    ]) {
      expect(getAgentSupplyManifest(profileId).migrationState).toBe('runtime_managed')
    }
  })

  it('resident / catalog / activated body 分别只规划到 0 / 1 / 4 层，未授权请求在读取正文前拒绝', () => {
    expect(resolveAgentSkillSupplyPlan('huiyu.dispatch', ['huiyu.map-manual'])).toEqual({
      resident: [{ skillId: 'huiyu.map-core', layer: '0' }],
      catalog: [{ skillId: 'huiyu.map-manual', layer: '1' }],
      activated: [{ skillId: 'huiyu.map-manual', layer: '4' }],
      rejected: []
    })
    expect(resolveAgentSkillSupplyPlan('zaoce.status-panel', ['huiyu.map-manual']).rejected).toEqual([
      { skillId: 'huiyu.map-manual', reason: 'not_authorized' }
    ])
    expect(resolveAgentSkillSupplyPlan('huiyu.dispatch', ['huiyu.map-core']).rejected).toEqual([
      { skillId: 'huiyu.map-core', reason: 'not_on_demand' }
    ])

    expect(resolveAgentSkillSupplyPlan('zaoce.status-panel', ['zaoce.advanced-authoring'])).toEqual({
      resident: [{ skillId: 'zaoce.basic-authoring', layer: '0' }],
      catalog: [{ skillId: 'zaoce.advanced-authoring', layer: '1' }],
      activated: [{ skillId: 'zaoce.advanced-authoring', layer: '4' }],
      rejected: []
    })
    expect(getAgentSupplyManifest('zaoce.status-panel')).toMatchObject({
      skillGrants: [
        { skillId: 'zaoce.basic-authoring', loadMode: 'resident', activation: ['always'], failurePolicy: 'required' },
        { skillId: 'zaoce.advanced-authoring', loadMode: 'on_demand', activation: ['explicit_route', 'model_tool'], failurePolicy: 'optional' }
      ],
      toolPolicy: {
        commonTools: ['readStatusPanels', 'readZaoceAdvancedSkill', 'applyStatusPanelBatch', 'submitPanels'],
        deferredDiscovery: true
      }
    })
  })

  it('稳定供给描述不含当轮激活正文，且所有 mutation tool 都不是自动终止点', () => {
    const before = renderAgentStableSupplyDescriptor('huiyu.dispatch')
    resolveAgentSkillSupplyPlan('huiyu.dispatch', ['huiyu.map-manual'])
    expect(renderAgentStableSupplyDescriptor('huiyu.dispatch')).toBe(before)
    expect(before).not.toContain('activated')
    for (const manifest of Object.values(AGENT_SUPPLY_MANIFESTS)) {
      expect(manifest.completion.mutationToolsAreTerminal).toBe(false)
    }
  })

  it('Skill 目录的正文入口和 resident/on-demand 0/1/4 落点完整且唯一', () => {
    const skills = Object.values(AGENT_SKILL_CATALOG)
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length)
    for (const skill of skills) {
      expect(skill.bodySource).toBeTruthy()
      expect(skill.residentBodyLayer).toBe('0')
      expect(skill.onDemandDirectoryLayer).toBe('1')
      expect(skill.onDemandBodyLayer).toBe('4')
    }
  })

  it('每个 Skill grant 都显式声明 required / optional 装载失败策略', () => {
    for (const manifest of Object.values(AGENT_SUPPLY_MANIFESTS)) {
      for (const grant of manifest.skillGrants) {
        expect(['required', 'optional']).toContain(grant.failurePolicy)
      }
    }
  })
})
