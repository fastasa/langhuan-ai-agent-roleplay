import type { AgentModelConfig, BrainDocumentRecord, ChatMessage, ChatSession } from '../types'
import { generateAndWriteNarration, type NarrationChatWriteResult } from './narrationChatWrite'
import { findNarrationProfileByKind, normalizeBuiltinNarrationKind, normalizeNarrationFrequency, normalizeNarrationProfiles, normalizeNarrationTemperature, type BuiltinNarrationKind, type NarrationPlan, type NarrationProfile } from './narrationProtocol'

type CallAI = (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: Record<string, unknown>
) => Promise<string | null>

export interface ManualNarrationCommandInput {
  session: Partial<ChatSession> & { sessionId?: string; session_id?: string }
  messages: ChatMessage[]
  documents?: BrainDocumentRecord[]
  roleAppearanceProfiles?: UserNarrationRoleProfile[]
  agentConfig?: Partial<AgentModelConfig> | null
  callAI?: CallAI
  abortSignal?: AbortSignal
  now?: string
  narrationKind?: BuiltinNarrationKind
  narrationProfileId?: string
  scenarioMountedPromptText?: string
}

export interface ManualNarrationCommandResult extends NarrationChatWriteResult {
  candidateBatch?: null
}

export type UserNarrationCommandMode = 'direct' | 'agent_supplement'

export interface UserNarrationCommand {
  mode: UserNarrationCommandMode
  content: string
  rawText: string
}

export interface UserNarrationRoleProfile {
  source: 'formal' | 'sessionTemporary' | 'userAlias'
  name: string
  aliases?: string[]
  description?: string
  appearance?: string
  markdown?: string
}

export interface UserNarrationCommandInput extends ManualNarrationCommandInput {
  command: UserNarrationCommand
  roleProfile?: UserNarrationRoleProfile | null
  messageSourceKind?: 'focused_action'
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function resolveSessionId(session: ManualNarrationCommandInput['session']): string {
  return toText(session.id ?? session.sessionId ?? session.session_id)
}

export function parseUserNarrationCommand(text: string): UserNarrationCommand | null {
  const rawText = String(text ?? '')
  const normalized = rawText.trim()
  const match = normalized.match(/^\/旁白(?:_(AGENT补充))?(?:[\s　]+([\s\S]*))?$/i)
  if (!match) return null
  return {
    mode: match[1] ? 'agent_supplement' : 'direct',
    content: toText(match[2] || ''),
    rawText: normalized
  }
}

function buildUserNarrationPlan(input: UserNarrationCommandInput): NarrationPlan {
  return {
    shouldInsert: true,
    narrationKind: input.roleProfile ? 'appearance' : 'event_push',
    reasons: [input.command.mode === 'agent_supplement' ? 'user_narration_agent_supplement' : 'user_narration_direct'],
    modelTier: input.command.mode === 'agent_supplement' || input.roleProfile ? 'standard' : 'rule',
    frequency: normalizeNarrationFrequency((input.session as Record<string, unknown>).narrationFrequency ?? (input.session as Record<string, unknown>).narration_frequency),
    temperature: normalizeNarrationTemperature((input.session as Record<string, unknown>).narrationTemperature ?? (input.session as Record<string, unknown>).narration_temperature),
    score: 1
  }
}

function readSessionNarrationProfiles(input: {
  session: Partial<ChatSession>
}) {
  return normalizeNarrationProfiles((input.session as Record<string, unknown>).narrationProfiles ?? (input.session as Record<string, unknown>).narration_profiles, {
    frequency: (input.session as Record<string, unknown>).narrationFrequency ?? (input.session as Record<string, unknown>).narration_frequency,
    temperature: (input.session as Record<string, unknown>).narrationTemperature ?? (input.session as Record<string, unknown>).narration_temperature
  })
}

function readSessionNarrationProfile(input: {
  session: Partial<ChatSession>
  kind: BuiltinNarrationKind
}) {
  return findNarrationProfileByKind((input.session as Record<string, unknown>).narrationProfiles ?? (input.session as Record<string, unknown>).narration_profiles, input.kind, {
    frequency: (input.session as Record<string, unknown>).narrationFrequency ?? (input.session as Record<string, unknown>).narration_frequency,
    temperature: (input.session as Record<string, unknown>).narrationTemperature ?? (input.session as Record<string, unknown>).narration_temperature
  })
}

function resolveManualNarrationProfile(input: ManualNarrationCommandInput): NarrationProfile {
  const profileId = toText(input.narrationProfileId)
  if (profileId) {
    const profile = readSessionNarrationProfiles(input).find((item) => item.id === profileId)
    if (!profile) throw new Error('未找到自定义旁白配置')
    return profile
  }
  return readSessionNarrationProfile({
    session: input.session,
    kind: normalizeBuiltinNarrationKind(input.narrationKind || 'event_push')
  })
}

function buildManualNarrationPlan(input: ManualNarrationCommandInput, profile: NarrationProfile): NarrationPlan {
  const narrationKind = normalizeProfileNarrationKind(profile, input.narrationKind)
  const frequency = normalizeNarrationFrequency((input.session as Record<string, unknown>).narrationFrequency ?? (input.session as Record<string, unknown>).narration_frequency)
  const temperature = normalizeNarrationTemperature((input.session as Record<string, unknown>).narrationTemperature ?? (input.session as Record<string, unknown>).narration_temperature)
  return {
    shouldInsert: true,
    narrationKind,
    reasons: profile.id === narrationKind ? [`manual_trigger_${narrationKind}`] : ['manual_trigger_custom_profile'],
    modelTier: narrationKind === 'event_push' ? 'standard' : 'quick',
    frequency,
    temperature,
    profileId: profile.id,
    profileName: profile.name,
    score: 1
  }
}

function normalizeProfileNarrationKind(profile: NarrationProfile | null | undefined, fallback?: unknown): BuiltinNarrationKind {
  const id = toText(profile?.id)
  if (id === 'appearance' || id === 'event_push') return id
  return normalizeBuiltinNarrationKind(fallback || id || 'environment')
}

export async function runManualNarrationCommand(input: ManualNarrationCommandInput): Promise<ManualNarrationCommandResult> {
  const sessionId = resolveSessionId(input.session)
  if (!sessionId) throw new Error('缺少手动旁白会话 ID')
  const messages = Array.isArray(input.messages) ? input.messages : []
  const narrationProfile = resolveManualNarrationProfile(input)
  const plan = buildManualNarrationPlan(input, narrationProfile)
  const writeResult = await generateAndWriteNarration({
    session: input.session,
    plan,
    messages,
    agentConfig: input.agentConfig,
    callAI: input.callAI,
    abortSignal: input.abortSignal,
    now: input.now,
    narrationProfile,
    scenarioMountedPromptText: input.scenarioMountedPromptText,
    roleAppearanceProfiles: input.roleAppearanceProfiles
  })
  return {
    ...writeResult,
    candidateBatch: null
  }
}

export async function runUserNarrationCommand(input: UserNarrationCommandInput): Promise<ManualNarrationCommandResult> {
  const sessionId = resolveSessionId(input.session)
  if (!sessionId) throw new Error('缺少用户旁白会话 ID')
  const content = toText(input.command.content)
  if (!content) throw new Error('旁白内容不能为空')
  const messages = Array.isArray(input.messages) ? input.messages : []
  const writeResult = await generateAndWriteNarration({
    session: input.session,
    plan: buildUserNarrationPlan(input),
    messages,
    agentConfig: input.agentConfig,
    callAI: input.command.mode === 'agent_supplement' || input.roleProfile ? input.callAI : undefined,
    abortSignal: input.abortSignal,
    now: input.now,
    skipCandidateArchive: true,
    narrationProfile: readSessionNarrationProfile({ session: input.session, kind: input.roleProfile ? 'appearance' : 'event_push' }),
    scenarioMountedPromptText: input.scenarioMountedPromptText,
    roleAppearanceProfiles: input.roleAppearanceProfiles,
    userNarrationPatch: {
      mode: input.command.mode === 'agent_supplement' ? 'agent_supplement' : 'direct',
      content,
      roleProfile: input.roleProfile || undefined
    },
    messageSourceKind: input.messageSourceKind
  })
  if (writeResult.skipped) {
    throw new Error(writeResult.skipReason || writeResult.degradation?.message || '旁白没有写入')
  }
  return {
    ...writeResult,
    candidateBatch: null
  }
}
