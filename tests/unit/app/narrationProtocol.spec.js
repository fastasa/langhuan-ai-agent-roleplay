import { describe, expect, it } from 'vitest'

import {
  isNarrationMessage,
  normalizeNarrationProfiles,
  normalizeNarrationFrequency,
  normalizeNarrationTemperature,
  shouldNarrationProfileEnterContext,
  NARRATION_MESSAGE_KIND
} from '../../../src/app/narrationProtocol'

describe('narrationProtocol', () => {
  it('keeps narration messages separate from user and role chat identity', () => {
    expect(isNarrationMessage({
      id: 1,
      session_id: 'session_1',
      role: 'system',
      messageKind: NARRATION_MESSAGE_KIND,
      content: '门外传来脚步声。',
      time: '',
      image: '',
      model: '',
      created_at: ''
    })).toBe(true)

    expect(isNarrationMessage({
      id: 2,
      session_id: 'session_1',
      role: 'assistant',
      content: '我听见了。',
      time: '',
      image: '',
      model: '',
      created_at: ''
    })).toBe(false)
  })

  it('normalizes session narration frequency and temperature', () => {
    expect(normalizeNarrationFrequency('active')).toBe('active')
    expect(normalizeNarrationFrequency('noisy')).toBe('standard')
    expect(normalizeNarrationTemperature('bloom')).toBe('bloom')
    expect(normalizeNarrationTemperature('wild')).toBe('standard')
  })

  it('normalizes narration skills and migrates old prompt fields', () => {
    const profiles = normalizeNarrationProfiles([
      { id: 'environment', kind: 'environment', includeInContext: false, keyword: '下雨', promptPrefix: '只写雨声。' },
      { id: 'custom_private', name: '只显示', kind: 'custom', includeInContext: false, includeRecentInPrompt: true, content: '只写屏幕灯影。' }
    ])
    const environment = profiles.find((item) => item.id === 'environment')
    const custom = profiles.find((item) => item.id === 'custom_private')

    expect(environment?.triggerDescription).toBe('下雨')
    expect(environment?.content).toBe('只写雨声。')
    expect(custom?.content).toBe('只写屏幕灯影。')
    expect('includeInContext' in (custom || {})).toBe(false)
    expect('includeRecentInPrompt' in (custom || {})).toBe(false)
    expect(shouldNarrationProfileEnterContext(environment)).toBe(true)
    expect(shouldNarrationProfileEnterContext(custom)).toBe(true)
  })
})
