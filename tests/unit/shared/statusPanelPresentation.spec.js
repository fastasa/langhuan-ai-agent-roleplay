import { describe, expect, it } from 'vitest'
import {
  evaluateStatusPanelExpression,
  normalizeStatusPanelPresentation,
  validateStatusPanelPresentationValues
} from '../../../shared/statusPanelPresentation'

const fields = [
  { key: 'total', valueType: 'number' },
  { key: 'male', valueType: 'number' },
  { key: 'female', valueType: 'number' },
  { key: 'children', valueType: 'number' },
  { key: 'elderly', valueType: 'number' },
  { key: 'portrait', valueType: 'asset' }
]

describe('statusPanelPresentation', () => {
  it('接受可切换人口环图并保留受控表达式', () => {
    const result = normalizeStatusPanelPresentation({
      schemaVersion: 1,
      blocks: [{
        id: 'population',
        type: 'donut',
        title: '人口结构',
        span: 2,
        total: { op: 'field', fieldKey: 'total' },
        variants: [
          {
            id: 'gender',
            label: '性别',
            segments: [
              { id: 'male', label: '男性', value: { op: 'field', fieldKey: 'male' } },
              { id: 'female', label: '女性', value: { op: 'field', fieldKey: 'female' } }
            ]
          },
          {
            id: 'age',
            label: '年龄',
            segments: [
              { id: 'children', label: '儿童', value: { op: 'field', fieldKey: 'children' } },
              { id: 'adult', label: '成年', value: { op: 'remainder', total: { op: 'field', fieldKey: 'total' }, parts: [{ op: 'field', fieldKey: 'children' }, { op: 'field', fieldKey: 'elderly' }] } },
              { id: 'elderly', label: '老年', value: { op: 'field', fieldKey: 'elderly' } }
            ]
          }
        ]
      }]
    }, fields)
    expect(result.ok).toBe(true)
    if (!result.ok || !result.presentation) return
    const adult = result.presentation.blocks[0].variants[1].segments[1].value
    expect(evaluateStatusPanelExpression(adult, { total: 720000, children: 187000, elderly: 62000 })).toBe(471000)
  })

  it('拒绝脚本、未知属性和错误字段类型', () => {
    const result = normalizeStatusPanelPresentation({
      schemaVersion: 1,
      blocks: [{
        id: 'unsafe',
        type: 'metric',
        value: { op: 'field', fieldKey: 'portrait' },
        script: 'alert(1)'
      }]
    }, fields)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join('\n')).toContain('未支持属性：script')
    expect(result.errors.join('\n')).toContain('必须引用 number 字段')
  })

  it('媒体块只能绑定 asset 字段', () => {
    expect(normalizeStatusPanelPresentation({
      schemaVersion: 1,
      blocks: [{ id: 'image', type: 'media', fieldKey: 'portrait', fit: 'pixelated' }]
    }, fields).ok).toBe(true)
    expect(normalizeStatusPanelPresentation({
      schemaVersion: 1,
      blocks: [{ id: 'image', type: 'media', fieldKey: 'male' }]
    }, fields).ok).toBe(false)
  })

  it('可比较块拒绝混用已标注的不同单位', () => {
    const result = normalizeStatusPanelPresentation({
      schemaVersion: 1,
      blocks: [{ id: 'mixed', type: 'bar', items: [
        { id: 'money', label: '资金', value: { op: 'field', fieldKey: 'money' } },
        { id: 'people', label: '人数', value: { op: 'field', fieldKey: 'people' } }
      ] }]
    }, [
      { key: 'money', valueType: 'number', unit: '金币' },
      { key: 'people', valueType: 'number', unit: '人' }
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('不同单位')
  })

  it('对每个环图分类方案生成正式完整性诊断，不改写原值', () => {
    const result = normalizeStatusPanelPresentation({
      schemaVersion: 1,
      blocks: [{
        id: 'population', type: 'donut', total: { op: 'field', fieldKey: 'total' },
        variants: [{ id: 'gender', label: '按性别', segments: [
          { id: 'male', label: '男性', value: { op: 'field', fieldKey: 'male' } },
          { id: 'female', label: '女性', value: { op: 'field', fieldKey: 'female' } }
        ] }]
      }]
    }, fields)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const values = { total: 10, male: 3, female: 2 }
    expect(validateStatusPanelPresentationValues(result.presentation, values)).toEqual([
      expect.objectContaining({ blockId: 'population', code: 'total_mismatch', message: expect.stringContaining('分类合计 5') })
    ])
    expect(values).toEqual({ total: 10, male: 3, female: 2 })
  })
})
