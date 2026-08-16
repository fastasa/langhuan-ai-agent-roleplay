import {
  AGENT_SKILL_CATALOG,
  getAgentSupplyManifest,
  renderAgentStableSupplyDescriptor,
  resolveAgentSkillSupplyPlan,
  type AgentSkillActivationMode,
  type AgentSkillId,
  type AgentSupplyProfileId
} from '../../../shared/agentSupplyManifest'
import {
  AGENT_SKILL_LOADER_REGISTRY,
  AgentSkillLoaderError,
  getAgentSkillLoader,
  type AgentSkillLoaderRegistry
} from './agentSkillRegistry'
import type {
  AgentPromptSupplyLoadState,
  AgentPromptSupplyTraceEntry
} from '../agentRuntime/types'

export type AgentSkillActivationRequest = {
  skillId: string
  activation: Exclude<AgentSkillActivationMode, 'always'>
  /** 星依知识使用准确 topicId；其他 Skill 可用作章节键或关键词。 */
  selector?: string
  /** 供 trace 解释为什么本轮激活，不进入模型正文。 */
  reason?: string
}

export type AgentSkillSupplyLoadState = AgentPromptSupplyLoadState
export type AgentSkillSupplyTraceEntry = AgentPromptSupplyTraceEntry

export type AgentSkillPromptSection = {
  skillId: AgentSkillId
  title: string
  source: string
  layer: '0' | '4'
  body: string
}

export type AgentSkillCatalogEntry = {
  skillId: AgentSkillId
  title: string
  description: string
  source: string
  layer: '1'
  text: string
}

export type AgentSkillSupplyAssembly = {
  profileId: AgentSupplyProfileId
  stableDescriptor: string
  resident: AgentSkillPromptSection[]
  catalog: AgentSkillCatalogEntry[]
  activated: AgentSkillPromptSection[]
  rejected: Array<{ skillId: string; reason: string }>
  layers: { '0': string; '1': string; '4': string }
  trace: AgentSkillSupplyTraceEntry[]
}

export class AgentSkillSupplyRequiredLoadError extends Error {
  readonly trace: AgentSkillSupplyTraceEntry[]

  constructor(message: string, trace: AgentSkillSupplyTraceEntry[]) {
    super(message)
    this.name = 'AgentSkillSupplyRequiredLoadError'
    this.trace = trace
  }
}

/** FNV-1a 32-bit，仅用于本地 prompt trace 的内容指纹；不是供应商 cache key 或 cache hit 证明。 */
export function hashAgentSkillSupplyText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

function catalogText(skillId: AgentSkillId): string {
  const skill = AGENT_SKILL_CATALOG[skillId]
  return `- ${skill.id}｜${skill.title}：${skill.description}`
}

function sectionText(section: AgentSkillPromptSection): string {
  const heading = section.layer === '0' ? '常驻 Skill' : '已读 Skill'
  return `【${heading}｜${section.title}】\n${section.body}`
}

function failureReason(error: unknown): string {
  if (error instanceof AgentSkillLoaderError) return error.code
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'skill_loader_failed'
}

async function loadSection(input: {
  profileId: AgentSupplyProfileId
  skillId: AgentSkillId
  layer: '0' | '4'
  selector?: string
  reason: string
  required: boolean
  registry: Partial<AgentSkillLoaderRegistry>
  trace: AgentSkillSupplyTraceEntry[]
}): Promise<AgentSkillPromptSection | null> {
  const skill = AGENT_SKILL_CATALOG[input.skillId]
  try {
    const loader = getAgentSkillLoader(input.skillId, input.registry)
    const body = String(await loader({ skillId: input.skillId, ...(input.selector ? { selector: input.selector } : {}) }) || '').trim()
    if (!body) throw new AgentSkillLoaderError('skill_body_unavailable', `Skill ${input.skillId} 正文为空`)
    input.trace.push({
      profileId: input.profileId,
      skillId: input.skillId,
      source: skill.bodySource,
      layer: input.layer,
      loadState: 'loaded',
      chars: body.length,
      hash: hashAgentSkillSupplyText(body),
      reason: input.reason,
      ...(input.selector ? { selector: input.selector } : {})
    })
    return { skillId: input.skillId, title: skill.title, source: skill.bodySource, layer: input.layer, body }
  } catch (error) {
    const reason = failureReason(error)
    const entry: AgentSkillSupplyTraceEntry = {
      profileId: input.profileId,
      skillId: input.skillId,
      source: skill.bodySource,
      layer: input.layer,
      loadState: input.required ? 'load_failed_required' : 'load_failed_optional',
      chars: 0,
      hash: hashAgentSkillSupplyText(''),
      reason,
      ...(input.selector ? { selector: input.selector } : {})
    }
    input.trace.push(entry)
    if (input.required) {
      throw new AgentSkillSupplyRequiredLoadError(
        `Agent ${input.profileId} 的 required Skill ${input.skillId} 装载失败：${reason}`,
        [...input.trace]
      )
    }
    return null
  }
}

/**
 * manifest 驱动的 Skill 供给装配器。
 * 先规划授权，再读取 resident/已激活正文；未授权、未激活或只进目录的 Skill 不触碰 loader。
 */
export async function assembleAgentSkillSupply(input: {
  profileId: AgentSupplyProfileId
  activations?: readonly AgentSkillActivationRequest[]
  loaderRegistry?: Partial<AgentSkillLoaderRegistry>
}): Promise<AgentSkillSupplyAssembly> {
  const manifest = getAgentSupplyManifest(input.profileId)
  const registry = input.loaderRegistry ?? AGENT_SKILL_LOADER_REGISTRY
  const activations = [...(input.activations || [])]
  const plan = resolveAgentSkillSupplyPlan(input.profileId, activations.map((item) => item.skillId))
  const grants = new Map(manifest.skillGrants.map((grant) => [grant.skillId, grant]))
  const trace: AgentSkillSupplyTraceEntry[] = []
  const rejected: AgentSkillSupplyAssembly['rejected'] = []

  const resident: AgentSkillPromptSection[] = []
  for (const planned of plan.resident) {
    const grant = grants.get(planned.skillId)!
    const loaded = await loadSection({
      profileId: input.profileId,
      skillId: planned.skillId,
      layer: '0',
      reason: 'resident_always',
      required: grant.failurePolicy === 'required',
      registry,
      trace
    })
    if (loaded) resident.push(loaded)
  }

  const catalog: AgentSkillCatalogEntry[] = plan.catalog.map(({ skillId }) => {
    const skill = AGENT_SKILL_CATALOG[skillId]
    const text = catalogText(skillId)
    trace.push({
      profileId: input.profileId,
      skillId,
      source: skill.bodySource,
      layer: '1',
      loadState: 'catalog_only',
      chars: text.length,
      hash: hashAgentSkillSupplyText(text),
      reason: 'authorized_on_demand_catalog'
    })
    return { skillId, title: skill.title, description: skill.description, source: skill.bodySource, layer: '1', text }
  })

  for (const item of plan.rejected) {
    const skill = AGENT_SKILL_CATALOG[item.skillId as AgentSkillId]
    rejected.push({ skillId: item.skillId, reason: item.reason })
    trace.push({
      profileId: input.profileId,
      skillId: item.skillId,
      source: skill?.bodySource ?? null,
      layer: null,
      loadState: 'rejected',
      chars: 0,
      hash: hashAgentSkillSupplyText(''),
      reason: item.reason
    })
  }

  const activated: AgentSkillPromptSection[] = []
  const seenActivationKeys = new Set<string>()
  for (const request of activations) {
    const skillId = String(request.skillId || '').trim() as AgentSkillId
    const grant = grants.get(skillId)
    if (!grant || grant.loadMode !== 'on_demand') continue
    const key = `${skillId}\u0000${request.activation}\u0000${String(request.selector || '').trim()}`
    if (seenActivationKeys.has(key)) continue
    seenActivationKeys.add(key)
    if (!grant.activation.includes(request.activation)) {
      rejected.push({ skillId, reason: 'activation_not_allowed' })
      trace.push({
        profileId: input.profileId,
        skillId,
        source: AGENT_SKILL_CATALOG[skillId].bodySource,
        layer: null,
        loadState: 'rejected',
        chars: 0,
        hash: hashAgentSkillSupplyText(''),
        reason: 'activation_not_allowed',
        ...(request.selector ? { selector: request.selector } : {})
      })
      continue
    }
    const loaded = await loadSection({
      profileId: input.profileId,
      skillId,
      layer: '4',
      ...(request.selector ? { selector: request.selector } : {}),
      reason: request.reason?.trim() || request.activation,
      required: grant.failurePolicy === 'required',
      registry,
      trace
    })
    if (loaded) activated.push(loaded)
  }

  return {
    profileId: input.profileId,
    stableDescriptor: renderAgentStableSupplyDescriptor(input.profileId),
    resident,
    catalog,
    activated,
    rejected,
    layers: {
      '0': resident.map(sectionText).join('\n\n'),
      '1': catalog.map((entry) => entry.text).join('\n'),
      '4': activated.map(sectionText).join('\n\n')
    },
    trace
  }
}
