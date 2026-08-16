import { describe, expect, it, vi } from 'vitest'
import { buildMountainDotMatrix } from '../../../src/app/mapArmor/dotMatrix.ts'
import { runArmorPainter } from '../../../src/app/mapArmor/armorPainter.ts'
import { runMountainArmorWork } from '../../../src/app/mapArmor/armorOrchestration.ts'

// 装甲地图系统批A2（2026-07-13）：接线闭环——单次模型调用画师 + 端到端编排。
// 画师：合法一轮通过/越界重试成功/两轮皆坏判失败/```json 围栏容错解析。
// 编排：注入假 fetchBundle/saveFeatures/callModel，锁 meta.armor 形状与 runMeta 前缀；空白图纸使用默认工作框。

const EXPLORED_SQUARE = [[0, 0], [4000, 0], [4000, 4000], [0, 4000]]

describe('mapArmor/armorPainter · runArmorPainter', () => {
  const projection = buildMountainDotMatrix({ framePts: EXPLORED_SQUARE, waterRegions: [], mountainRegions: [], gridN: 21 })

  it('模型一次给出合法笔画：ok:true，attempts:1', async () => {
    const good = JSON.stringify({ strokes: [{ type: 'smooth', points: [[8, 8], [10, 10], [13, 9]] }], name: '测试山' })
    const callModel = vi.fn().mockResolvedValueOnce(good)
    const result = await runArmorPainter({ task: '画一条山', projection, callModel })
    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(1)
    expect(result.strokes?.length).toBe(1)
    expect(result.name).toBe('测试山')
    expect(result.attemptTrace).toHaveLength(1)
    expect(result.attemptTrace[0].raw).toBe(good)
    expect(result.attemptTrace[0].validation.ok).toBe(true)
    expect(callModel).toHaveBeenCalledTimes(1)
  })

  it('首轮越界，第二轮改对：attempts:2 成功，且第二轮 user 携带越界格信息', async () => {
    const bad = JSON.stringify({ strokes: [{ type: 'straight', points: [[0, 0], [10, 10]] }] })
    const good = JSON.stringify({ strokes: [{ type: 'smooth', points: [[8, 8], [10, 10], [13, 9]] }] })
    const callModel = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good)
    const result = await runArmorPainter({ task: '画一条山', projection, callModel })
    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(2)
    expect(callModel).toHaveBeenCalledTimes(2)
    const secondCallUser = callModel.mock.calls[1][0].user
    expect(secondCallUser).toContain('笔画校验失败')
    expect(secondCallUser).toContain('(0,0)')
  })

  it('两轮都给出越界笔画：ok:false，attempts:2', async () => {
    const bad = JSON.stringify({ strokes: [{ type: 'straight', points: [[0, 0], [10, 10]] }] })
    const callModel = vi.fn().mockResolvedValue(bad)
    const result = await runArmorPainter({ task: '画一条山', projection, callModel })
    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(2)
    expect(result.error).toBeTruthy()
  })

  it('两轮都无法解析成 JSON：ok:false，attempts:2', async () => {
    const callModel = vi.fn().mockResolvedValue('我不知道怎么画，这不是 JSON')
    const result = await runArmorPainter({ task: '画一条山', projection, callModel })
    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(2)
    expect(result.error).toContain('JSON 解析失败')
  })

  it('```json 围栏包裹的输出也能正确解析', async () => {
    const fenced = '这是我的方案：\n```json\n' + JSON.stringify({ strokes: [{ type: 'smooth', points: [[8, 8], [10, 10], [13, 9]] }] }) + '\n```'
    const callModel = vi.fn().mockResolvedValueOnce(fenced)
    const result = await runArmorPainter({ task: '画一条山', projection, callModel })
    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(1)
  })
})

describe('mapArmor/armorOrchestration · runMountainArmorWork', () => {
  function buildBundle(overrides = {}) {
    return {
      world: { id: 'world-1', name: '测试世界' },
      sheets: [{
        id: 'sheet-1',
        worldId: 'world-1',
        name: '主图纸',
        explored: { pts: EXPLORED_SQUARE },
        features: [],
        ...overrides
      }]
    }
  }

  it('成功路径：items 的 meta.armor 含 skeleton/params/seed/groupId，runMeta.runKey 前缀 armor-，summary 非空', async () => {
    const goodResponse = JSON.stringify({ strokes: [{ type: 'smooth', points: [[15, 15], [20, 20], [26, 17]] }], name: '玄岳山' })
    const callModel = vi.fn().mockResolvedValueOnce(goodResponse)
    const fetchBundle = vi.fn().mockResolvedValue(buildBundle())
    const saveFeatures = vi.fn().mockResolvedValue([])

    const result = await runMountainArmorWork({
      worldId: 'world-1',
      task: '画一条玄岳山',
      callModel,
      deps: { fetchBundle, saveFeatures }
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toBeTruthy()
    expect(result.groupId).toMatch(/^armor-/)
    expect(result.trace.steps.map((step) => step.key)).toEqual(['task-frame', 'dot-matrix', 'model-output', 'world-skeleton', 'armor-expansion', 'final-geometry-validation', 'save-validation', 'save-result'])
    expect(saveFeatures).toHaveBeenCalledTimes(1)
    const [worldIdArg, items, runMeta] = saveFeatures.mock.calls[0]
    expect(worldIdArg).toBe('world-1')
    expect(items.length).toBeGreaterThanOrEqual(2) // 至少 layer0+layer1
    for (const item of items) {
      expect(item.sheetId).toBe('sheet-1')
      expect(item.kind).toBe('region')
      expect(item.category).toBe('mountain')
      expect(item.name).toContain('玄岳山')
      expect(item.meta.armor.type).toBe('mountain')
      expect(Array.isArray(item.meta.armor.skeleton)).toBe(true)
      expect(item.meta.armor.skeleton.length).toBeGreaterThanOrEqual(2)
      expect(typeof item.meta.armor.seed).toBe('number')
      expect(item.meta.armor.groupId).toBe(result.groupId)
      expect(item.meta.drawTrace.kind).toBe('mountain-armor')
    }
    expect(runMeta.runKey.startsWith('armor-')).toBe(true)
    expect(runMeta.runLabel).toContain('地貌绘制')
  })

  it('图纸没有已探索范围且没有内容：使用默认 100km 工作框，仍可正常画山', async () => {
    const fetchBundle = vi.fn().mockResolvedValue(buildBundle({ explored: null }))
    const saveFeatures = vi.fn().mockResolvedValue([])
    const callModel = vi.fn().mockResolvedValueOnce(JSON.stringify({ strokes: [{ type: 'smooth', points: [[15, 15], [20, 20], [26, 17]] }] }))

    const result = await runMountainArmorWork({
      worldId: 'world-1',
      task: '画一条山',
      callModel,
      deps: { fetchBundle, saveFeatures }
    })

    expect(result.ok).toBe(true)
    expect(saveFeatures).toHaveBeenCalledTimes(1)
    expect(callModel).toHaveBeenCalledTimes(1)
  })

  it('世界没有任何图纸：ok:false，不调用 saveFeatures', async () => {
    const fetchBundle = vi.fn().mockResolvedValue({ world: { id: 'world-1' }, sheets: [] })
    const saveFeatures = vi.fn()
    const callModel = vi.fn()

    const result = await runMountainArmorWork({
      worldId: 'world-1',
      task: '画一条山',
      callModel,
      deps: { fetchBundle, saveFeatures }
    })

    expect(result.ok).toBe(false)
    expect(saveFeatures).not.toHaveBeenCalled()
  })

  it('inside 锚定唯一草原：点阵预留山体半宽，最终山体必须留在草原真实轮廓内', async () => {
    const grass = [[-20_000, -20_000], [20_000, -20_000], [20_000, 20_000], [-20_000, 20_000]]
    const fetchBundle = vi.fn().mockResolvedValue(buildBundle({
      features: [{ id: 'grass-1', kind: 'region', category: 'grass', name: '中央草原', geometry: { pts: grass } }]
    }))
    const saveFeatures = vi.fn().mockResolvedValue([])
    const callModel = vi.fn().mockResolvedValueOnce(JSON.stringify({
      strokes: [{ type: 'smooth', points: [[12, 12], [20, 28], [29, 13]] }],
      params: { baseWidthM: 4_000, ruggedness: 0.2 },
      name: 'S型山脉'
    }))

    const result = await runMountainArmorWork({ worldId: 'world-1', task: '在中央草原内画S型山脉', callModel, deps: { fetchBundle, saveFeatures } })

    expect(result.ok).toBe(true)
    expect(saveFeatures).toHaveBeenCalledTimes(1)
    const placement = saveFeatures.mock.calls[0][1][0].meta.armor.placement
    expect(placement.mode).toBe('inside')
    expect(placement.anchor.name).toBe('中央草原')
    expect(result.trace.steps.find((step) => step.key === 'final-geometry-validation').status).toBe('success')
  })

  it('最终装甲显式过宽时硬拒且不写库，不用裁切制造假成功', async () => {
    const grass = [[-10_000, -10_000], [10_000, -10_000], [10_000, 10_000], [-10_000, 10_000]]
    const fetchBundle = vi.fn().mockResolvedValue(buildBundle({
      features: [{ id: 'grass-1', kind: 'region', category: 'grass', name: '中央草原', geometry: { pts: grass } }]
    }))
    const saveFeatures = vi.fn()
    const callModel = vi.fn().mockResolvedValueOnce(JSON.stringify({
      strokes: [{ type: 'smooth', points: [[15, 15], [21, 26], [27, 15]] }],
      params: { baseWidthM: 40_000, ruggedness: 0 },
      name: '越界山脉'
    }))

    const result = await runMountainArmorWork({ worldId: 'world-1', task: '画山', callModel, deps: { fetchBundle, saveFeatures } })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('最终地貌占地校验失败')
    expect(saveFeatures).not.toHaveBeenCalled()
  })
})
