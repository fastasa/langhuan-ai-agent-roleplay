import { describe, expect, it } from 'vitest'
import { buildXingyiCompilePageDiagnostics } from '../../../src/app/xingyiCompilePageDiagnostics.ts'

function makeUnit(overrides = {}) {
  return {
    unitId: 'u-doc',
    domain: 'docLibrary',
    unitType: 'document',
    contentKind: 'page',
    title: '文档',
    status: 'normal',
    ...overrides
  }
}

function makeResult(units, warnings = []) {
  return { units, relations: [], warnings }
}

describe('buildXingyiCompilePageDiagnostics（树灯同源体检报告）', () => {
  it('全绿：没有任何黄/红灯时输出全绿判据句', () => {
    const result = makeResult([
      makeUnit({
        unitId: 'u1',
        title: '完整文档',
        compilePage: { summary: '有摘要', tags: ['标签'], relationHints: ['[[完整文档]]'] }
      })
    ])
    const report = buildXingyiCompilePageDiagnostics(result, { label: '世界书文档库' })
    expect(report.clean).toBe(true)
    expect(report.redUnitCount).toBe(0)
    expect(report.yellowUnitCount).toBe(0)
    expect(report.text).toContain('✅ 全绿')
  })

  it('黄灯直查（字段空缺）与红灯警告（重复关系）同报，红灯排前', () => {
    const yellow = makeUnit({
      unitId: 'u-yellow',
      title: '缺字段文档',
      sourcePath: '/甲/缺字段文档.md',
      compilePage: { summary: '', tags: [], relationHints: [] }
    })
    const red = makeUnit({
      unitId: 'u-red',
      title: '重复关系文档',
      sourcePath: '/乙/重复关系文档.md',
      compilePage: { summary: '有摘要', tags: ['标签'], relationHints: ['[[甲]]_包含_[[乙]]'] }
    })
    const result = makeResult([yellow, red], [
      {
        code: 'relation_hint_duplicate_relation',
        message: '关系提示归一后与已有关系重复，已跳过重复声明。',
        unitId: 'u-red',
        details: { hint: '[[甲]]_包含_[[乙]]', lineIndex: 0 }
      }
    ])
    const report = buildXingyiCompilePageDiagnostics(result, { label: '世界书文档库' })
    expect(report.clean).toBe(false)
    expect(report.redUnitCount).toBe(1)
    expect(report.yellowUnitCount).toBe(1)
    expect(report.text).toContain('缺失字段：摘要、标签、关系提示')
    expect(report.text).toContain('关系提示重复')
    expect(report.text).toContain('提示行：[[甲]]_包含_[[乙]]')
    expect(report.text).toContain('修法')
    // 红灯单位排在黄灯单位前
    expect(report.text.indexOf('重复关系文档')).toBeLessThan(report.text.indexOf('缺字段文档'))
  })

  it('doc_missing_compile_page 警告只带 sourceId 时也能映射回单位（黄灯）', () => {
    const unit = makeUnit({ unitId: 'u-a', sourceId: 'doc-a', title: '无编译页文档' })
    const result = makeResult([unit], [
      { code: 'doc_missing_compile_page', message: '文档缺少公共编译页', sourceId: 'doc-a' }
    ])
    const report = buildXingyiCompilePageDiagnostics(result, { label: '世界书文档库' })
    expect(report.yellowUnitCount).toBe(1)
    expect(report.text).toContain('无编译页文档')
    expect(report.text).toContain('缺少公共编译页')
  })

  it('scopeUnitIds 限定范围：范围外的问题单位不进报告', () => {
    const inScope = makeUnit({ unitId: 'u-in', title: '范围内', compilePage: { summary: '', tags: [], relationHints: [] } })
    const outScope = makeUnit({ unitId: 'u-out', title: '范围外', compilePage: { summary: '', tags: [], relationHints: [] } })
    const report = buildXingyiCompilePageDiagnostics(makeResult([inScope, outScope]), {
      label: '世界书文档库',
      scopeLabel: '「范围内」子树',
      scopeUnitIds: new Set(['u-in'])
    })
    expect(report.scannedCount).toBe(1)
    expect(report.text).toContain('范围内')
    expect(report.text).not.toContain('范围外')
  })

  it('maxUnits 截断时给出未展开提示', () => {
    const units = Array.from({ length: 3 }, (_, index) => makeUnit({
      unitId: `u-${index}`,
      title: `缺字段${index}`,
      compilePage: { summary: '', tags: [], relationHints: [] }
    }))
    const report = buildXingyiCompilePageDiagnostics(makeResult(units), { label: '世界书文档库', maxUnits: 1 })
    expect(report.text).toContain('还有 2 个问题单位未展开')
  })
})
