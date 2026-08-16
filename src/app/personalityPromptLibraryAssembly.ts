import { CHAT_HISTORY_PLACEHOLDER } from '../utils/promptContext'
import {
  assemblePromptFromSources,
  type PromptAssemblyResult,
  type PromptSource
} from './promptAssemblyPipeline'

type PromptMessageLike = {
  role?: string
  content?: unknown
}

export interface PersonalityPromptLibraryAssemblyInput {
  promptMessages?: PromptMessageLike[]
  scenarioMountedPromptText?: string
}

export interface PersonalityPromptLibraryAssemblyResult {
  systemPrompt: string
  assembly: PromptAssemblyResult
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function isScenarioMountedPromptContent(content: string, scenarioMountedPromptText?: string): boolean {
  const mountedText = toText(scenarioMountedPromptText)
  return Boolean(mountedText && content === mountedText)
}

export function buildPersonalityPromptLibraryAssembly(
  input: PersonalityPromptLibraryAssemblyInput = {}
): PersonalityPromptLibraryAssemblyResult {
  const sources: PromptSource[] = []
  const messages = Array.isArray(input.promptMessages) ? input.promptMessages : []
  messages.forEach((message, index) => {
    if (message?.role !== 'system') return
    const content = toText(message.content)
    if (!content || content === CHAT_HISTORY_PLACEHOLDER || content === '开始对话。') return
    const isMounted = isScenarioMountedPromptContent(content, input.scenarioMountedPromptText)
    sources.push({
      id: isMounted ? `scenario_mounted_${sources.length + 1}` : `prompt_library_${sources.length + 1}`,
      title: isMounted ? '情境挂载提示词' : `提示词库系统提示词 ${sources.length + 1}`,
      kind: isMounted ? 'scenario_mounted' : 'prompt_library',
      role: 'system',
      content,
      orderIndex: index,
      metadata: { promptMessageIndex: index }
    })
  })

  const assembly = assemblePromptFromSources({
    mode: 'personality_model',
    policy: {
      id: 'personality-prompt-library-system',
      defaultRole: 'system',
      mergeAdjacentSameRole: true
    },
    sources
  })

  return {
    assembly,
    systemPrompt: assembly.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .filter(Boolean)
      .join('\n\n')
  }
}
