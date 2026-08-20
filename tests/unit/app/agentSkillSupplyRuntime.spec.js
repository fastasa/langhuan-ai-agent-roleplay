import { describe, expect, it, vi } from 'vitest'
import { AGENT_SKILL_CATALOG, renderAgentStableSupplyDescriptor } from '../../../shared/agentSupplyManifest'
import {
  AGENT_SKILL_LOADER_REGISTRY,
  AgentSkillLoaderError,
  assembleAgentSkillSupply,
  hashAgentSkillSupplyText,
  resolveAgentPromptSupplyTrace,
  resolveAgentRuntimeToolSupply
} from '../../../src/app/agentSupply'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

describe('Agent Skill Supply Runtime 批次 1B', () => {
  it('工具供给 helper 只取 manifest common 与真实 registry 交集，未知 common 留诊断但不补权', () => {
    const registry = new ToolRegistry([
      { name: 'readScenarioSkill', brief: '判情境', execute: () => ({ content: 'ok' }) },
      { name: 'lowFrequencyEvidence', brief: '低频取料', execute: () => ({ content: 'ok' }) }
    ])
    const supply = resolveAgentRuntimeToolSupply('tidiao.director-round', registry)

    expect(supply.deferredToolMode).toBe(true)
    expect(supply.initialActiveTools).toEqual(['readScenarioSkill'])
    expect(supply.recommendedTools).toEqual(['readScenarioSkill'])
    expect(supply.initialActiveTools).not.toContain('lowFrequencyEvidence')
    expect(supply.initialActiveTools).not.toContain('writeTodo')
    expect(supply.diagnostics).toContainEqual(expect.objectContaining({
      kind: 'manifest_common_tool_not_registered',
      profileId: 'tidiao.director-round',
      toolName: 'consultScript'
    }))
  })

  it('共享 wrapper 可从完整 assembly 或独立 trace 读取审计轨，拒绝两路重复传入', () => {
    const trace = [{
      profileId: 'caifeng.research', skillId: 'caifeng.projection-catalog', source: 'fixture://catalog',
      layer: '0', loadState: 'loaded', chars: 2, hash: 'fnv1a32:test', reason: 'resident_always'
    }]
    expect(resolveAgentPromptSupplyTrace({ skillAssembly: { trace } })).toBe(trace)
    expect(resolveAgentPromptSupplyTrace({ promptSupplyTrace: trace })).toBe(trace)
    expect(() => resolveAgentPromptSupplyTrace({
      skillAssembly: { trace },
      promptSupplyTrace: trace
    })).toThrow('不能同时传')
  })

  it('提调稳定 descriptor 包含现役导演轮高频工具集，低频工具不混入 common', () => {
    const descriptor = JSON.parse(renderAgentStableSupplyDescriptor('tidiao.director-round'))
    expect(descriptor.commonTools).toEqual([
      'addCastDirection',
      'confirmNarrationCall',
      'consultScript',
      'finishRound',
      'readNarrationSkill',
      'readScenarioSkill',
      'reviseCastDirection',
      'reviseNarrationDirection'
    ])
    expect(descriptor.commonTools).not.toContain('writeTodo')
    expect(descriptor.commonTools).not.toContain('updateTodo')
    expect(descriptor.commonTools).not.toContain('dispatchResearch')
    expect(descriptor.commonTools).not.toContain('readRunStatus')
  })

  it('默认 registry 为每个正式 Skill 提供显式 loader，不按 bodySource 自动发现', () => {
    expect(Object.keys(AGENT_SKILL_LOADER_REGISTRY).sort()).toEqual([
      'caifeng.projection-catalog',
      'huiyu.map-core',
      'huiyu.map-manual',
      'personality_question_author.workflow',
      'personality_trainer.workflow',
      'scriptwriter.storycraft-manual',
      'tidiao.environment-manual',
      'xingyi.doc-library-editing',
      'xingyi.knowledge-topics',
      'xingyi.playable-world-builder',
      'xingyi.relation-hint-authoring',
      'zaoce.advanced-authoring',
      'zaoce.basic-authoring'
    ])
  })

  it('鉴心工作规范只作为主 profile 的常驻 Skill 装配', async () => {
    const result = await assembleAgentSkillSupply({ profileId: 'personality_trainer.workspace' })

    expect(result.layers['0']).toContain('【鉴心工作规范】')
    expect(result.layers['0']).toContain('默认目标是尚未人工确认的题')
    expect(result.layers['1']).toBe('')
    expect(result.layers['4']).toBe('')
    expect(result.trace).toContainEqual(expect.objectContaining({
      profileId: 'personality_trainer.workspace',
      skillId: 'personality_trainer.workflow',
      layer: '0',
      loadState: 'loaded'
    }))
  })

  it('设问拥有独立后台 profile 与制卷常驻知识', async () => {
    const result = await assembleAgentSkillSupply({ profileId: 'personality_question_author.background' })
    expect(result.layers['0']).toContain('【常驻 Skill｜设问制卷规范】')
    expect(result.layers['0']).toContain('【人格问卷情境设计协议 v8】')
    expect(result.trace).toContainEqual(expect.objectContaining({
      profileId: 'personality_question_author.background',
      skillId: 'personality_question_author.workflow',
      layer: '0',
      loadState: 'loaded'
    }))
  })

  it('造册基础正文只常驻层 0，进阶目录只在层 1，selector 命中后正文只进入层 4', async () => {
    const idle = await assembleAgentSkillSupply({ profileId: 'zaoce.status-panel' })

    expect(idle.layers['0']).toContain('【造册基础制作规范】')
    expect(idle.layers['0']).toContain('每个字段必须有非空、可区分的 `label`')
    expect(idle.layers['0']).toContain('禁止发布只有大号数字、没有字段名的指标')
    expect(idle.layers['0']).not.toContain('【造册进阶：自定义模板】')
    expect(idle.layers['1']).toContain('zaoce.advanced-authoring')
    expect(idle.layers['1']).not.toContain('【造册基础制作规范】')
    expect(idle.layers['1']).not.toContain('【造册进阶：自定义模板】')
    expect(idle.layers['4']).toBe('')

    const activated = await assembleAgentSkillSupply({
      profileId: 'zaoce.status-panel',
      activations: [{
        skillId: 'zaoce.advanced-authoring',
        activation: 'model_tool',
        selector: 'advanced_template'
      }]
    })

    expect(activated.layers['0']).toBe(idle.layers['0'])
    expect(activated.layers['1']).toBe(idle.layers['1'])
    expect(activated.layers['4']).toContain('【造册进阶：自定义模板】')
    expect(activated.layers['4']).not.toContain('【造册基础制作规范】')
    expect(activated.layers['4']).not.toContain('【造册进阶：跨状态栏引用】')
    expect(activated.layers['4']).not.toContain('【造册进阶：富媒体脚手架】')
  })

  it.each([
    ['advanced_template', '【造册进阶：自定义模板】'],
    ['cross_panel_reference', '【造册进阶：跨状态栏引用】'],
    ['rich_media_scaffold', '【造册进阶：富媒体脚手架】']
  ])('造册进阶 selector %s 只读取对应正文', async (selector, heading) => {
    const result = await assembleAgentSkillSupply({
      profileId: 'zaoce.status-panel',
      activations: [{ skillId: 'zaoce.advanced-authoring', activation: 'explicit_route', selector }]
    })

    expect(result.layers['4']).toContain(heading)
    expect(result.layers['4'].match(/【造册进阶：/g)).toHaveLength(1)
  })

  it('造册进阶缺 selector 或 selector 未注册时不倾倒正文，并留下 optional 失败 trace', async () => {
    const missing = await assembleAgentSkillSupply({
      profileId: 'zaoce.status-panel',
      activations: [{ skillId: 'zaoce.advanced-authoring', activation: 'model_tool' }]
    })
    expect(missing.layers['4']).toBe('')
    expect(missing.trace).toContainEqual(expect.objectContaining({
      skillId: 'zaoce.advanced-authoring', layer: '4', loadState: 'load_failed_optional',
      chars: 0, reason: 'skill_selector_required'
    }))

    const unknown = await assembleAgentSkillSupply({
      profileId: 'zaoce.status-panel',
      activations: [{ skillId: 'zaoce.advanced-authoring', activation: 'model_tool', selector: 'unknown' }]
    })
    expect(unknown.layers['4']).toBe('')
    expect(unknown.trace).toContainEqual(expect.objectContaining({
      skillId: 'zaoce.advanced-authoring', layer: '4', loadState: 'load_failed_optional',
      chars: 0, reason: 'skill_selector_not_found'
    }))
  })

  it('未授权 Skill 在 loader 之前拒绝，bodySource 不会触发扫描或读取', async () => {
    const unauthorizedLoader = vi.fn(async () => '绝不能被读取')
    const result = await assembleAgentSkillSupply({
      profileId: 'zaoce.status-panel',
      activations: [{ skillId: 'huiyu.map-manual', activation: 'model_tool' }],
      loaderRegistry: {
        'zaoce.basic-authoring': async () => '造册常驻基础',
        'huiyu.map-manual': unauthorizedLoader
      }
    })

    expect(unauthorizedLoader).not.toHaveBeenCalled()
    expect(result.layers['0']).toContain('造册常驻基础')
    expect(result.layers['1']).toContain('zaoce.advanced-authoring')
    expect(result.layers['4']).toBe('')
    expect(result.rejected).toEqual([{ skillId: 'huiyu.map-manual', reason: 'not_authorized' }])
    expect(result.trace).toContainEqual(expect.objectContaining({
      profileId: 'zaoce.status-panel', skillId: 'huiyu.map-manual', source: 'docs/agents/绘舆/skills/map-manual/SKILL.md',
      layer: null, loadState: 'rejected', chars: 0, reason: 'not_authorized'
    }))
  })

  it('resident / catalog / activated 正文只进入 0 / 1 / 4 层，未激活正文不出现', async () => {
    const coreLoader = vi.fn(async () => '绘舆常驻核心正文')
    const manualLoader = vi.fn(async () => '绘舆低频手册正文')
    const idle = await assembleAgentSkillSupply({
      profileId: 'huiyu.dispatch',
      loaderRegistry: {
        'huiyu.map-core': coreLoader,
        'huiyu.map-manual': manualLoader
      }
    })

    expect(idle.layers['0']).toContain('绘舆常驻核心正文')
    expect(idle.layers['0']).not.toContain('绘舆低频手册正文')
    expect(idle.layers['1']).toContain('huiyu.map-manual')
    expect(idle.layers['1']).not.toContain('绘舆低频手册正文')
    expect(idle.layers['4']).toBe('')
    expect(coreLoader).toHaveBeenCalledTimes(1)
    expect(manualLoader).not.toHaveBeenCalled()

    const activated = await assembleAgentSkillSupply({
      profileId: 'huiyu.dispatch',
      activations: [{ skillId: 'huiyu.map-manual', activation: 'model_tool', selector: '十三' }],
      loaderRegistry: {
        'huiyu.map-core': coreLoader,
        'huiyu.map-manual': manualLoader
      }
    })
    expect(activated.layers['0']).toContain('绘舆常驻核心正文')
    expect(activated.layers['1']).toBe(idle.layers['1'])
    expect(activated.layers['4']).toContain('绘舆低频手册正文')
    expect(manualLoader).toHaveBeenCalledWith({ skillId: 'huiyu.map-manual', selector: '十三' })
  })

  it('显式 skillId 与准确 selector 在同次装配进入 4 层，不需要额外分类调用', async () => {
    const topicLoader = vi.fn(async ({ selector }) => `星依主题正文：${selector}`)
    const result = await assembleAgentSkillSupply({
      profileId: 'xingyi.global',
      activations: [{
        skillId: 'xingyi.knowledge-topics',
        activation: 'explicit_route',
        selector: '路由与知识补全::2.1 状态栏',
        reason: 'slash_command'
      }],
      loaderRegistry: { 'xingyi.knowledge-topics': topicLoader }
    })

    expect(topicLoader).toHaveBeenCalledTimes(1)
    expect(result.layers['4']).toContain('星依主题正文：路由与知识补全::2.1 状态栏')
    expect(result.trace).toContainEqual(expect.objectContaining({
      profileId: 'xingyi.global', skillId: 'xingyi.knowledge-topics', layer: '4',
      loadState: 'loaded', reason: 'slash_command', selector: '路由与知识补全::2.1 状态栏'
    }))
  })

  it('星依 topic 缺 selector 时不倾倒全文，按 optional 策略留下 trace', async () => {
    const result = await assembleAgentSkillSupply({
      profileId: 'xingyi.global',
      activations: [{ skillId: 'xingyi.knowledge-topics', activation: 'explicit_route' }]
    })

    expect(result.layers['4']).toBe('')
    expect(result.trace).toContainEqual(expect.objectContaining({
      skillId: 'xingyi.knowledge-topics', layer: '4', loadState: 'load_failed_optional',
      chars: 0, hash: hashAgentSkillSupplyText(''), reason: 'topic_selector_required'
    }))
  })

  it('提调与绘舆的 on-demand 手册缺 selector 时不退回整节或整本正文', async () => {
    const tidiao = await assembleAgentSkillSupply({
      profileId: 'tidiao.director-round',
      activations: [{ skillId: 'tidiao.environment-manual', activation: 'code_prefetch' }]
    })
    expect(tidiao.layers['4']).toBe('')
    expect(tidiao.trace).toContainEqual(expect.objectContaining({
      skillId: 'tidiao.environment-manual', layer: '4', loadState: 'load_failed_optional',
      chars: 0, reason: 'skill_selector_required'
    }))

    const huiyu = await assembleAgentSkillSupply({
      profileId: 'huiyu.dispatch',
      activations: [{ skillId: 'huiyu.map-manual', activation: 'model_tool' }]
    })
    expect(huiyu.layers['0']).toContain('核心速览')
    expect(huiyu.layers['4']).toBe('')
    expect(huiyu.layers['0']).not.toContain('## 十三、笔刷画法手册')
    expect(huiyu.trace).toContainEqual(expect.objectContaining({
      skillId: 'huiyu.map-manual', layer: '4', loadState: 'load_failed_optional',
      chars: 0, reason: 'skill_selector_required'
    }))
  })

  it('required loader 失败立即抛出并携带失败 trace，optional 失败继续装配', async () => {
    await expect(assembleAgentSkillSupply({
      profileId: 'scriptwriter.workspace',
      loaderRegistry: {
        'scriptwriter.storycraft-manual': async () => {
          throw new AgentSkillLoaderError('fixture_required_failure', '测试 required 失败')
        }
      }
    })).rejects.toMatchObject({
      name: 'AgentSkillSupplyRequiredLoadError',
      trace: [expect.objectContaining({
        skillId: 'scriptwriter.storycraft-manual', layer: '0', loadState: 'load_failed_required',
        chars: 0, reason: 'fixture_required_failure'
      })]
    })

    const optional = await assembleAgentSkillSupply({
      profileId: 'huiyu.dispatch',
      activations: [{ skillId: 'huiyu.map-manual', activation: 'model_tool' }],
      loaderRegistry: {
        'huiyu.map-core': async () => '可用核心',
        'huiyu.map-manual': async () => {
          throw new AgentSkillLoaderError('fixture_optional_failure', '测试 optional 失败')
        }
      }
    })
    expect(optional.layers['0']).toContain('可用核心')
    expect(optional.layers['4']).toBe('')
    expect(optional.trace).toContainEqual(expect.objectContaining({
      skillId: 'huiyu.map-manual', loadState: 'load_failed_optional', reason: 'fixture_optional_failure'
    }))
  })

  it('trace 含来源、落层、字符数与本地 hash，但不声称供应商 cache hit', async () => {
    const result = await assembleAgentSkillSupply({
      profileId: 'caifeng.research',
      loaderRegistry: { 'caifeng.projection-catalog': async () => '正式投影目录' }
    })
    expect(result.trace).toEqual([
      expect.objectContaining({
        profileId: 'caifeng.research', skillId: 'caifeng.projection-catalog',
        source: 'src/app/agentContext/renderProjectionCatalogManual.ts', layer: '0',
        loadState: 'loaded', chars: 6, hash: hashAgentSkillSupplyText('正式投影目录'), reason: 'resident_always'
      })
    ])
    expect(JSON.stringify(result.trace)).not.toMatch(/cache.?hit|cacheRead/i)
  })

  it('稳定 descriptor 不随当轮激活与 selector 改变', async () => {
    const before = renderAgentStableSupplyDescriptor('huiyu.dispatch')
    const result = await assembleAgentSkillSupply({
      profileId: 'huiyu.dispatch',
      activations: [{ skillId: 'huiyu.map-manual', activation: 'model_tool', selector: '十三' }],
      loaderRegistry: {
        'huiyu.map-core': async () => '核心',
        'huiyu.map-manual': async () => '手册'
      }
    })
    expect(result.stableDescriptor).toBe(before)
    expect(renderAgentStableSupplyDescriptor('huiyu.dispatch')).toBe(before)
    expect(before).not.toContain('十三')
    expect(before).not.toContain('activated')
  })

  it('默认动态 loader 能装配真实 resident 与代码预取正文', async () => {
    const scriptwriter = await assembleAgentSkillSupply({ profileId: 'scriptwriter.workspace' })
    expect(scriptwriter.layers['0']).toContain('剧作方法论')
    expect(scriptwriter.layers['1']).toBe('')
    expect(scriptwriter.layers['4']).toBe('')

    const tidiao = await assembleAgentSkillSupply({
      profileId: 'tidiao.director-round',
      activations: [{ skillId: 'tidiao.environment-manual', activation: 'code_prefetch', selector: '2.15' }]
    })
    expect(tidiao.layers['0']).toBe('')
    expect(tidiao.layers['1']).toContain('tidiao.environment-manual')
    expect(tidiao.layers['4']).toContain('状态')
    expect(tidiao.layers['4']).not.toContain('## 一、')
  })

  it('人工知识来源统一指向 Agent 通用知识或 Skill 子目录，不回指 TypeScript 正文', () => {
    const sources = Object.values(AGENT_SKILL_CATALOG)
      .map((skill) => skill.bodySource)
      .filter((source) => source.startsWith('docs/agents/'))
    expect(sources).toContain('docs/agents/造册/通用知识.md')
    expect(sources).toContain('docs/agents/造册/skills/advanced-authoring/SKILL.md')
    for (const source of sources) {
      expect(source).toMatch(/^docs\/agents\/[^/]+\/(?:通用知识\.md|skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md)$/)
    }
    expect(sources.some((source) => source.includes('知识库草稿'))).toBe(false)
    expect(sources.some((source) => source.includes('src/app/agentKnowledge/zaoceKnowledge.ts#'))).toBe(false)
  })
})
