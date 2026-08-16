import { describe, expect, it } from 'vitest'
import {
  buildDocLibraryWorldClusterRelationProjection,
  buildDocLibraryRelationClipboardEntries,
  resolveDocLibraryRelationClipboardUnitIds,
  resolveDocLibraryRelationPasteTarget
} from '../../../src/app/docLibraryRelationSourceAdapter'

describe('docLibraryRelationSourceAdapter', () => {
  const units = [
    {
      unitId: 'doc-tree:root',
      domain: 'docLibrary',
      unitType: 'root',
      contentKind: 'group',
      title: '世界树',
      status: 'normal'
    },
    {
      unitId: 'doc-tree:~2F亚什基诺',
      domain: 'docLibrary',
      unitType: 'cluster',
      contentKind: 'group',
      title: '亚什基诺',
      parentId: 'doc-tree:root',
      sourceId: '/亚什基诺',
      sourcePath: '/亚什基诺',
      status: 'normal'
    },
    {
      unitId: 'doc-tree:~2F亚什基诺~2F地理',
      domain: 'docLibrary',
      unitType: 'branch',
      contentKind: 'group',
      title: '地理',
      parentId: 'doc-tree:~2F亚什基诺',
      sourceId: '/亚什基诺/地理',
      sourcePath: '/亚什基诺/地理',
      status: 'normal'
    },
    {
      unitId: 'doc:doc_geo',
      domain: 'docLibrary',
      unitType: 'leaf',
      contentKind: 'markdown',
      title: '亚什基诺世界地理',
      parentId: 'doc-tree:~2F亚什基诺~2F地理',
      sourceId: 'doc_geo',
      sourcePath: '/亚什基诺/地理/亚什基诺世界地理.md',
      status: 'normal'
    }
  ]

  it('maps worldbook clipboard entries to relation units', () => {
    expect(resolveDocLibraryRelationClipboardUnitIds([
      { kind: 'folder', id: '/亚什基诺/地理' },
      { kind: 'document', id: 'doc_geo' }
    ], units)).toEqual(['doc-tree:~2F亚什基诺~2F地理', 'doc:doc_geo'])
  })

  it('builds worldbook clipboard entries from relation units', () => {
    expect(buildDocLibraryRelationClipboardEntries([
      'doc-tree:~2F亚什基诺~2F地理',
      'doc:doc_geo'
    ], units)).toEqual([
      { kind: 'folder', id: '/亚什基诺/地理', label: '地理' },
      { kind: 'document', id: 'doc_geo', label: '亚什基诺世界地理' }
    ])
  })

  it('resolves paste targets without exposing document truth to the graph', () => {
    const documentMap = new Map([
      ['doc_geo', { displayPath: '/亚什基诺/地理/亚什基诺世界地理.md' }]
    ])

    expect(resolveDocLibraryRelationPasteTarget('doc-tree:root', units, documentMap)).toEqual({
      folderPath: ''
    })
    expect(resolveDocLibraryRelationPasteTarget('doc-tree:~2F亚什基诺~2F地理', units, documentMap)).toEqual({
      folderPath: '/亚什基诺/地理'
    })
    expect(resolveDocLibraryRelationPasteTarget('doc:doc_geo', units, documentMap)).toEqual({
      folderPath: '/亚什基诺/地理',
      targetDocumentId: 'doc_geo'
    })
  })

  it('projects root clusters as an isolated forest and removes every cross-cluster edge', () => {
    const otherClusterUnits = [
      {
        unitId: 'doc-tree:~2F纳维拉岛',
        domain: 'docLibrary',
        unitType: 'cluster',
        contentKind: 'group',
        title: '纳维拉岛',
        parentId: 'doc-tree:root',
        sourceId: '/纳维拉岛',
        status: 'normal'
      },
      {
        unitId: 'doc:navira',
        domain: 'docLibrary',
        unitType: 'leaf',
        contentKind: 'markdown',
        title: '纳维拉岛生态',
        parentId: 'doc-tree:~2F纳维拉岛',
        sourceId: 'navira',
        status: 'normal'
      }
    ]
    const projection = buildDocLibraryWorldClusterRelationProjection(
      [...units, ...otherClusterUnits],
      [
        { relationId: 'root-a', sourceUnitId: 'doc-tree:root', targetUnitId: 'doc-tree:~2F亚什基诺', predicateId: 'contains', status: 'projection' },
        { relationId: 'inside-a', sourceUnitId: 'doc-tree:~2F亚什基诺', targetUnitId: 'doc:doc_geo', predicateId: 'contains', status: 'projection' },
        { relationId: 'inside-b', sourceUnitId: 'doc-tree:~2F纳维拉岛', targetUnitId: 'doc:navira', predicateId: 'contains', status: 'projection' },
        { relationId: 'cross', sourceUnitId: 'doc:doc_geo', targetUnitId: 'doc:navira', predicateId: 'related', status: 'declared' }
      ]
    )

    expect(projection.forestRootUnitIds).toEqual([
      'doc-tree:~2F亚什基诺',
      'doc-tree:~2F纳维拉岛'
    ])
    expect(projection.relations.map((relation) => relation.relationId)).toEqual(['inside-a', 'inside-b'])
  })
})
