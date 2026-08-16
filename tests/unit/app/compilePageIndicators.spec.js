import { describe, expect, it } from 'vitest'
import {
  buildUnitCompilePageIndicatorLookup,
  buildUnitCompilePageIndicatorMap,
  formatCompilePageEntryStatus,
  isCompilePageEntryStatusWarning
} from '../../../src/app/compilePageIndicators.ts'

describe('compilePageIndicators', () => {
  it('formats compile entry status as missing when any compile field is empty', () => {
    expect(formatCompilePageEntryStatus({
      summary: '有摘要',
      tags: ['核心'],
      relationHints: []
    })).toBe('未填写')
    expect(formatCompilePageEntryStatus({
      summary: '有摘要',
      tags: [],
      relationHints: ['[[源]]_属于_[[目标]]']
    })).toBe('未填写')
    expect(formatCompilePageEntryStatus({
      summary: '',
      tags: ['核心'],
      relationHints: ['[[源]]_属于_[[目标]]']
    })).toBe('未填写')
    expect(formatCompilePageEntryStatus({
      summary: '有摘要',
      tags: ['核心'],
      relationHints: ['[[源]]_属于_[[目标]]']
    })).toBe('正常')
    expect(formatCompilePageEntryStatus({
      summary: '有摘要',
      tags: ['核心'],
      relationHints: ['[[源]]_属于_[[目标]]']
    }, 2)).toBe('错误')
    expect(formatCompilePageEntryStatus({
      summary: '',
      tags: [],
      relationHints: []
    }, 1)).toBe('错误')
    expect(isCompilePageEntryStatusWarning('未填写')).toBe(true)
    expect(isCompilePageEntryStatusWarning('错误')).toBe(true)
    expect(isCompilePageEntryStatusWarning('正常')).toBe(false)
  })

  it('marks missing compile fields and relation hint errors independently', () => {
    const result = {
      units: [
        {
          unitId: 'unit-a',
          domain: 'docLibrary',
          unitType: 'leaf',
          contentKind: 'markdown',
          title: '缺字段单位',
          sourceId: 'doc-a',
          compilePage: {
            summary: '',
            tags: [],
            relationHints: []
          },
          status: 'normal'
        },
        {
          unitId: 'unit-b',
          domain: 'docLibrary',
          unitType: 'leaf',
          contentKind: 'markdown',
          title: '错误单位',
          sourceId: 'doc-b',
          compilePage: {
            summary: '有摘要',
            tags: ['标签'],
            relationHints: ['[[不存在]]']
          },
          status: 'normal'
        }
      ],
      relations: [],
      warnings: [{
        code: 'relation_hint_target_missing',
        message: '关系提示目标不存在',
        sourceId: 'doc-b'
      }]
    }

    const indicators = buildUnitCompilePageIndicatorMap(result)

    expect(indicators.get('unit-a')).toMatchObject({
      missing: true,
      error: false,
      title: '编译页缺失字段'
    })
    expect(indicators.get('unit-b')).toMatchObject({
      missing: false,
      error: true,
      title: '编译页存在错误'
    })
  })

  it('allows missing and error indicators on the same unit', () => {
    const result = {
      units: [{
        unitId: 'unit-a',
        domain: 'characterBrain',
        unitType: 'soulNode',
        contentKind: 'markdown',
        title: '双状态单位',
        sourceId: 'node-a',
        compilePage: {
          summary: '有摘要',
          tags: [],
          relationHints: ['[[源]]_错谓词_[[目标]]']
        },
        status: 'normal'
      }],
      relations: [],
      warnings: [{
        code: 'relation_hint_invalid_predicate',
        message: '关系谓词非法',
        unitId: 'unit-a'
      }]
    }

    expect(buildUnitCompilePageIndicatorMap(result).get('unit-a')).toMatchObject({
      missing: true,
      error: true,
      title: '编译页缺失字段；编译页存在错误'
    })
  })

  it('propagates child indicators to every ancestor', () => {
    const result = {
      units: [
        {
          unitId: 'cluster-a',
          domain: 'docLibrary',
          unitType: 'cluster',
          contentKind: 'group',
          title: '亚什基诺',
          status: 'normal'
        },
        {
          unitId: 'branch-a',
          domain: 'docLibrary',
          unitType: 'branch',
          contentKind: 'group',
          title: '世界地图',
          parentId: 'cluster-a',
          status: 'normal'
        },
        {
          unitId: 'branch-b',
          domain: 'docLibrary',
          unitType: 'branch',
          contentKind: 'group',
          title: '八大洋',
          parentId: 'branch-a',
          status: 'normal'
        },
        {
          unitId: 'leaf-a',
          domain: 'docLibrary',
          unitType: 'leaf',
          contentKind: 'markdown',
          title: '咸水',
          parentId: 'branch-b',
          sourceId: 'doc-a',
          compilePage: {
            summary: '有摘要',
            tags: ['海洋'],
            relationHints: ['[[不存在]]']
          },
          status: 'normal'
        }
      ],
      relations: [],
      warnings: [{
        code: 'relation_hint_target_missing',
        message: '关系提示目标不存在',
        sourceId: 'doc-a'
      }]
    }

    const indicators = buildUnitCompilePageIndicatorMap(result)

    expect(indicators.get('leaf-a')).toMatchObject({ error: true, title: '编译页存在错误' })
    expect(indicators.get('branch-b')).toMatchObject({ error: true, title: '编译页存在错误' })
    expect(indicators.get('branch-a')).toMatchObject({ error: true, title: '编译页存在错误' })
    expect(indicators.get('cluster-a')).toMatchObject({ error: true, title: '编译页存在错误' })
  })

  it('maps propagated indicators to source keys used by sidebar rows', () => {
    const result = {
      units: [
        {
          unitId: 'cluster-node',
          domain: 'docLibrary',
          unitType: 'cluster',
          contentKind: 'group',
          title: '亚什基诺',
          sourceId: 'cluster-node',
          sourcePath: '/亚什基诺',
          status: 'normal'
        },
        {
          unitId: 'branch-node',
          domain: 'docLibrary',
          unitType: 'branch',
          contentKind: 'group',
          title: '八大洋',
          parentId: 'cluster-node',
          sourceId: 'branch-node',
          sourcePath: '/亚什基诺/八大洋',
          status: 'normal'
        },
        {
          unitId: 'doc:doc-a',
          domain: 'docLibrary',
          unitType: 'leaf',
          contentKind: 'markdown',
          title: '咸水',
          parentId: 'branch-node',
          sourceId: 'doc-a',
          sourcePath: '/亚什基诺/八大洋/咸水.md',
          compilePage: {
            summary: '有摘要',
            tags: ['海洋'],
            relationHints: ['[[不存在]]']
          },
          status: 'normal'
        }
      ],
      relations: [],
      warnings: [{
        code: 'relation_hint_target_missing',
        message: '关系提示目标不存在',
        sourceId: 'doc-a'
      }]
    }

    const lookup = buildUnitCompilePageIndicatorLookup(result)

    expect(lookup.get('doc-a')).toMatchObject({ error: true, title: '编译页存在错误' })
    expect(lookup.get('branch-node')).toMatchObject({ error: true, title: '编译页存在错误' })
    expect(lookup.get('/亚什基诺/八大洋')).toMatchObject({ error: true, title: '编译页存在错误' })
    expect(lookup.get('cluster-node')).toMatchObject({ error: true, title: '编译页存在错误' })
  })
})
