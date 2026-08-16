import { describe, expect, it } from 'vitest'
import {
  isFocusedActionMessage,
  readFocusedActionVisibility,
  shouldSuppressFocusedActionAudienceOutputs
} from '../../../shared/focusedAction.ts'

describe('focusedAction protocol', () => {
  it('reads persisted snake/camel message fields and defaults malformed visibility to private', () => {
    expect(isFocusedActionMessage({ message_source_kind: 'focused_action' })).toBe(true)
    expect(readFocusedActionVisibility({ focusedActionVisibility: 'public' })).toBe('public')
    expect(readFocusedActionVisibility({ focused_action_visibility: 'unknown' })).toBe('private')
    expect(shouldSuppressFocusedActionAudienceOutputs({
      messageSourceKind: 'focused_action', focusedActionVisibility: 'private'
    })).toBe(true)
    expect(shouldSuppressFocusedActionAudienceOutputs({
      messageSourceKind: 'focused_action', focusedActionVisibility: 'public'
    })).toBe(false)
    expect(shouldSuppressFocusedActionAudienceOutputs({ role: 'user' })).toBe(false)
  })
})
