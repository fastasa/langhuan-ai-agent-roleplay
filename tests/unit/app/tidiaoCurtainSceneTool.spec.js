import { describe, expect, it, vi } from 'vitest'
import { createUpdateCurtainSceneTool } from '../../../src/app/tidiaoGlobalTools.ts'

function call(tool, args) {
  return tool.execute({
    kind: 'toolCall',
    callId: 'curtain_1',
    toolName: tool.name,
    stage: 'curtain',
    args,
    expectation: '',
    requestedAtTurn: 0
  }, { turnIndex: 0 })
}

describe('updateCurtainScene · 世界精确坐标', () => {
  it('schema 暴露图纸/要素引用，只有精确坐标也属于合法更新', () => {
    const tool = createUpdateCurtainSceneTool({ updateCurtainScene: vi.fn() })
    expect(tool.schema.properties).toHaveProperty('mapSheetId')
    expect(tool.schema.properties).toHaveProperty('mapFeatureId')
    expect(tool.validateArgs({ mapFeatureId: 'feature_1' })).toBeNull()
    expect(tool.validateArgs({})).toContain('地图图纸/要素引用')
  })

  it('把 snake_case/短别名规范成统一 mapSheetId/mapFeatureId 后交给现有写入口', async () => {
    const updateCurtainScene = vi.fn(async () => ({ changed: true, notice: '已更新' }))
    const tool = createUpdateCurtainSceneTool({ updateCurtainScene })

    const result = await call(tool, {
      map_sheet_id: 'sheet_1',
      featureId: 'feature_1',
      reason: '已从当前世界地图核实'
    })

    expect(updateCurtainScene).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'updateCurtainScene',
      mapSheetId: 'sheet_1',
      mapFeatureId: 'feature_1'
    }))
    expect(result.content).toBe('已更新')
  })
})
