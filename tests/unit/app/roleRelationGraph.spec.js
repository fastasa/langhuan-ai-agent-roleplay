import { describe, expect, it } from 'vitest'
import { resolveRoleRelationFocusNodeId } from '../../../src/app/roleRelationGraph'

describe('resolveRoleRelationFocusNodeId', () => {
  it('maps root role units to legacy brain roots', () => {
    expect(resolveRoleRelationFocusNodeId({ unitType: 'character' })).toBe('brain:root')
    expect(resolveRoleRelationFocusNodeId({ unitType: 'core' })).toBe('brain:see_me')
    expect(resolveRoleRelationFocusNodeId({ unitType: 'soul' })).toBe('brain:cognition')
    expect(resolveRoleRelationFocusNodeId({ unitType: 'trace' })).toBe('brain:trajectory')
  })

  it('falls back to sourceId for concrete units', () => {
    expect(resolveRoleRelationFocusNodeId({ unitType: 'coreField', sourceId: 'brain:basic_info' })).toBe('brain:basic_info')
    expect(resolveRoleRelationFocusNodeId({ unitType: 'soulNode', sourceId: 'brain:cognition:node:1' })).toBe('brain:cognition:node:1')
  })

  it('falls back to brain root when input is empty', () => {
    expect(resolveRoleRelationFocusNodeId()).toBe('brain:root')
    expect(resolveRoleRelationFocusNodeId({ unitType: 'coreField' })).toBe('brain:root')
  })
})
