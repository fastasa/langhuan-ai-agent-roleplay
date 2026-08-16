import {
  parseImprovisedCharacterCreateCommand,
  parseLegacyImprovisedCharacterCreateCommand,
  type ImprovisedCharacterCreateCommand
} from './improvisedCharacterCommand'
import {
  parseUserNarrationCommand,
  type UserNarrationCommand
} from './manualNarrationCommand'
import {
  parseTemporaryEntityOrganizeCommand,
  type TemporaryEntityCommand
} from './temporaryEntityCommand'

export type ChatInputRoute =
  | {
    kind: 'empty'
    normalized: ''
  }
  | {
    kind: 'user_narration'
    normalized: string
    command: UserNarrationCommand
  }
  | {
    kind: 'improvised_character_create'
    normalized: string
    command: ImprovisedCharacterCreateCommand
  }
  | {
    kind: 'legacy_improvised_character_create'
    normalized: string
    command: ImprovisedCharacterCreateCommand
  }
  | {
    kind: 'temporary_entity_organize'
    normalized: string
    command: TemporaryEntityCommand
  }
  | {
    kind: 'reply'
    normalized: string
  }

export function parseChatInputRoute(text: unknown): ChatInputRoute {
  const normalized = String(text ?? '').trim()
  if (!normalized) {
    return {
      kind: 'empty',
      normalized: ''
    }
  }

  const userNarrationCommand = parseUserNarrationCommand(normalized)
  if (userNarrationCommand) {
    return {
      kind: 'user_narration',
      normalized,
      command: userNarrationCommand
    }
  }

  const improvisedCharacterCommand = parseImprovisedCharacterCreateCommand(normalized)
  if (improvisedCharacterCommand) {
    return {
      kind: 'improvised_character_create',
      normalized,
      command: improvisedCharacterCommand
    }
  }

  const legacyImprovisedCharacterCommand = parseLegacyImprovisedCharacterCreateCommand(normalized)
  if (legacyImprovisedCharacterCommand) {
    return {
      kind: 'legacy_improvised_character_create',
      normalized,
      command: legacyImprovisedCharacterCommand
    }
  }

  const temporaryEntityCommand = parseTemporaryEntityOrganizeCommand(normalized)
  if (temporaryEntityCommand) {
    return {
      kind: 'temporary_entity_organize',
      normalized,
      command: temporaryEntityCommand
    }
  }

  return {
    kind: 'reply',
    normalized
  }
}
