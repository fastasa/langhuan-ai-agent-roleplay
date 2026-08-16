import { describe, expect, it } from 'vitest'
import { settleCharacterBrainRadialClusters } from '../../../src/composables/useCharacterBrainPhysics'

function node(id, x, y, parentId = '') {
  return {
    id,
    parentId,
    edgeKind: 'tree',
    x,
    y,
    layoutX: x,
    layoutY: y,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
    size: 2
  }
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

describe('settleCharacterBrainRadialClusters', () => {
  it('places visible siblings at one radius with equal angular spacing', () => {
    const nodes = [
      node('root', 20, 40),
      node('a', 22, 42, 'root'),
      node('b', 25, 43, 'root'),
      node('c', 19, 45, 'root'),
      node('d', 21, 41, 'root')
    ]
    settleCharacterBrainRadialClusters(nodes, nodes.map((item) => item.id), () => 13, {
      parentChildDistance: 180,
      clusterGap: 260
    })

    const root = nodes[0]
    const children = nodes.slice(1)
    const distances = children.map((child) => distance(root, child))
    distances.forEach((value) => expect(value).toBeCloseTo(distances[0], 6))
    expect(distances[0]).toBeCloseTo(180, 6)

    const angles = children
      .map((child) => ((Math.atan2(child.y - root.y, child.x - root.x) + (Math.PI * 2)) % (Math.PI * 2)))
      .sort((left, right) => left - right)
    const angleGaps = angles.map((angle, index) => {
      const nextAngle = angles[(index + 1) % angles.length] + (index === angles.length - 1 ? Math.PI * 2 : 0)
      return nextAngle - angle
    })
    angleGaps.forEach((value) => expect(value).toBeCloseTo(Math.PI / 2, 6))
  })

  it('packs different visible root clusters with a generous gap', () => {
    const nodes = [
      node('root-a', 0, 0),
      node('a-1', 0, 0, 'root-a'),
      node('a-2', 0, 0, 'root-a'),
      node('root-b', 5, 3),
      node('b-1', 5, 3, 'root-b'),
      node('b-2', 5, 3, 'root-b')
    ]
    settleCharacterBrainRadialClusters(nodes, nodes.map((item) => item.id), () => 13, {
      parentChildDistance: 160,
      clusterGap: 300
    })

    const firstCluster = nodes.filter((item) => item.id === 'root-a' || item.parentId === 'root-a')
    const secondCluster = nodes.filter((item) => item.id === 'root-b' || item.parentId === 'root-b')
    const closestCrossClusterDistance = Math.min(...firstCluster.flatMap((left) => (
      secondCluster.map((right) => distance(left, right))
    )))
    expect(closestCrossClusterDistance).toBeGreaterThanOrEqual(299.99)
  })

  it('keeps nested radial branches from folding straight back onto their ancestors', () => {
    const nodes = [
      node('root', 0, 0),
      node('child', 10, 0, 'root'),
      node('grandchild-a', 0, 0, 'child'),
      node('grandchild-b', 0, 0, 'child')
    ]
    settleCharacterBrainRadialClusters(nodes, nodes.map((item) => item.id), () => 13, {
      parentChildDistance: 180,
      clusterGap: 260
    })

    expect(distance(nodes[0], nodes[2])).toBeGreaterThan(179.99)
    expect(distance(nodes[0], nodes[3])).toBeGreaterThan(179.99)
    expect(distance(nodes[1], nodes[2])).toBeCloseTo(distance(nodes[1], nodes[3]), 6)
    expect(distance(nodes[0], nodes[1])).toBeCloseTo(180, 6)
  })

  it('does not expand the same visible layout again on repeated settle', () => {
    const nodes = [
      node('root', 0, 0),
      node('a', 2, 1, 'root'),
      node('b', 1, 3, 'root'),
      node('a-child', 2, 2, 'a'),
      node('b-child', 1, 2, 'b')
    ]
    const ids = nodes.map((item) => item.id)
    settleCharacterBrainRadialClusters(nodes, ids, () => 13, {
      parentChildDistance: 180,
      clusterGap: 190
    })
    const firstPositions = nodes.map((item) => ({ x: item.x, y: item.y }))
    const movedAgain = settleCharacterBrainRadialClusters(nodes, ids, () => 13, {
      parentChildDistance: 180,
      clusterGap: 190
    })

    expect(movedAgain).toEqual([])
    nodes.forEach((item, index) => {
      expect(item.x).toBeCloseTo(firstPositions[index].x, 6)
      expect(item.y).toBeCloseTo(firstPositions[index].y, 6)
    })
  })

  it('moves only the selected visible cluster and preserves its internal radial geometry', () => {
    const nodes = [
      node('selected-root', 0, 0),
      node('selected-child', 0, 0, 'selected-root'),
      node('fixed', 0, 0)
    ]
    const moved = settleCharacterBrainRadialClusters(nodes, ['selected-root', 'selected-child'], () => 13, {
      parentChildDistance: 180,
      clusterGap: 260
    })

    expect(new Set(moved)).toEqual(new Set(['selected-root', 'selected-child']))
    expect(nodes[2]).toMatchObject({ x: 0, y: 0 })
    expect(distance(nodes[0], nodes[1])).toBeCloseTo(180, 6)
    expect(Math.min(distance(nodes[0], nodes[2]), distance(nodes[1], nodes[2]))).toBeGreaterThan(100)
  })
})
