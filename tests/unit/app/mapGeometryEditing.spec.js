import { describe, expect, it } from 'vitest'
import {
  createMapGeometryEditDraft,
  insertMapGeometryPointNearIndex,
  insertMapGeometryPointOnSegment,
  moveMapGeometryPoint,
  removeMapGeometryPoint,
  setMapGeometrySnap,
  validateMapGeometryEditDraft
} from '../../../src/app/mapGeometryEditing'

describe('mapGeometryEditing', () => {
  it('统一创建开放山脉骨架和闭合多边形顶点草稿', () => {
    const mountain = createMapGeometryEditDraft('mountain-skeleton', [[0, 0], [10_000, 0]])
    const polygon = createMapGeometryEditDraft('polygon-vertices', [[0, 0], [10_000, 0], [0, 10_000]])
    expect(mountain).toMatchObject({ topology: 'open', snapEnabled: true })
    expect(polygon).toMatchObject({ topology: 'closed', snapEnabled: true })
  })

  it('拖动时按统一网格吸附，也可按住 Alt 临时关闭吸附', () => {
    const geometry = createMapGeometryEditDraft('path-vertices', [[0, 0], [10_000, 0]], { snapStepM: 1000 })
    expect(moveMapGeometryPoint(geometry, 1, [9450, 1510]).points[1]).toEqual([9000, 2000])
    expect(moveMapGeometryPoint(geometry, 1, [9450, 1510], { disableSnap: true }).points[1]).toEqual([9450, 1510])
    expect(moveMapGeometryPoint(setMapGeometrySnap(geometry, false), 1, [9450, 1510]).points[1]).toEqual([9450, 1510])
  })

  it('河流端点优先吸附跨要素的源头/入海/汇流语义候选', () => {
    const geometry = createMapGeometryEditDraft('river-spine', [[0, 0], [10_000, 0], [20_000, 0]], {
      snapStepM: 1000,
      semanticCandidates: [
        { id: 's1', label: '山源', role: 'source', point: [2000, 2000] },
        { id: 'm1', label: '入海口', role: 'shore', point: [22_000, 3000] },
        { id: 'j1', label: '汇流点', role: 'junction', point: [10_000, 4000] }
      ]
    })
    expect(moveMapGeometryPoint(geometry, 0, [2300, 1800]).points[0]).toEqual([2000, 2000])
    expect(moveMapGeometryPoint(geometry, 2, [21_500, 3200]).points[2]).toEqual([22_000, 3000])
    expect(moveMapGeometryPoint(geometry, 1, [10_100, 3900]).points[1]).toEqual([10_000, 4000])
  })

  it('线段双击与面板添加都插入同一份控制点序列', () => {
    const geometry = createMapGeometryEditDraft('polygon-vertices', [[0, 0], [10_000, 0], [0, 10_000]], { snapStepM: 100 })
    const direct = insertMapGeometryPointOnSegment(geometry, 0, [5000, 120])
    expect(direct.index).toBe(1)
    expect(direct.geometry.points[1]).toEqual([5000, 100])

    const near = insertMapGeometryPointNearIndex(geometry, 2)
    expect(near.index).toBe(3)
    expect(near.geometry.points).toHaveLength(4)
  })

  it('删点遵守拓扑最小点数，多边形拒绝自相交', () => {
    const path = createMapGeometryEditDraft('path-vertices', [[0, 0], [1000, 0], [2000, 0]])
    expect(removeMapGeometryPoint(path, 1).points).toHaveLength(2)
    expect(() => removeMapGeometryPoint(removeMapGeometryPoint(path, 1), 0)).toThrow(/至少保留 2/)

    expect(() => validateMapGeometryEditDraft({
      ...createMapGeometryEditDraft('polygon-vertices', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]),
      points: [[0, 0], [1000, 1000], [1000, 0], [0, 1000]]
    })).toThrow(/不能自相交/)
  })
})
