/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CharacterBrainWorldTreeImportDialog from '../../../src/components/brain/CharacterBrainWorldTreeImportDialog.vue'

function createDocument(id, title, displayPath) {
  return {
    documentId: id,
    id,
    stableId: id,
    title,
    displayPath,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: `${title}摘要`,
    tags: [],
    content: '',
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z'
  }
}

function mountDialog() {
  return mount(CharacterBrainWorldTreeImportDialog, {
    props: {
      open: true,
      parentId: 'brain:cognition',
      parentTitle: '灵魂',
      existingNodes: [],
      documents: [
        createDocument('doc-empire-index', 'index', '/亚什基诺/维斯珂帝国/index.md'),
        createDocument('doc-capital', '帝国大熔炉', '/亚什基诺/维斯珂帝国/帝国大熔炉.md'),
        createDocument('doc-arena', '凯旋大竞技场', '/亚什基诺/维斯珂帝国/凯旋大竞技场.md'),
        createDocument('doc-edu', '维斯珂教育体系', '/亚什基诺/维斯珂教育体系.md')
      ]
    },
    global: {
      stubs: {
        AppFormDialog: {
          props: ['open'],
          template: '<section v-if="open"><slot /></section>'
        }
      }
    }
  })
}

describe('CharacterBrainWorldTreeImportDialog', () => {
  it('selects a group unit together with all descendants', async () => {
    const wrapper = mountDialog()
    await nextTick()

    const clusterRow = wrapper.findAll('[role="treeitem"]').find((row) => row.text().includes('亚什基诺'))
    expect(clusterRow).toBeTruthy()

    await clusterRow.trigger('click')

    expect(wrapper.text()).toContain('已选 5 项')
    expect(wrapper.vm.selectedIds).toEqual([
      'cluster:/亚什基诺',
      'folder:/亚什基诺/维斯珂帝国',
      'document:doc-capital',
      'document:doc-arena',
      'document:doc-edu'
    ])
  })

  it('uses normal group-row clicks to toggle expansion', async () => {
    const wrapper = mountDialog()
    await nextTick()

    const folderRow = wrapper.findAll('[role="treeitem"]').find((row) => row.text().includes('维斯珂帝国'))
    expect(folderRow).toBeTruthy()
    expect(folderRow.attributes('aria-expanded')).toBe('true')

    await folderRow.trigger('click')

    const collapsedFolderRow = wrapper.findAll('[role="treeitem"]').find((row) => row.text().includes('维斯珂帝国'))
    expect(collapsedFolderRow.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).not.toContain('帝国大熔炉')
  })

  it('marks adjacent selected descendants as one connected selection block', async () => {
    const wrapper = mountDialog()
    await nextTick()

    const folderRow = wrapper.findAll('[role="treeitem"]').find((row) => row.text().includes('维斯珂帝国'))
    expect(folderRow).toBeTruthy()

    await folderRow.trigger('click', { ctrlKey: true })

    const selectedRows = wrapper.findAll('.brain-world-tree-import__row--selected')
    expect(selectedRows.map((row) => row.text())).toEqual([
      '维斯珂帝国',
      '帝国大熔炉',
      '凯旋大竞技场'
    ])
    expect(selectedRows[1].classes()).toContain('brain-world-tree-import__row--selected-before')
    expect(selectedRows[1].classes()).toContain('brain-world-tree-import__row--selected-after')
  })

  it('hides index.md overview documents from the selectable tree', async () => {
    const wrapper = mountDialog()
    await nextTick()

    expect(wrapper.findAll('[role="treeitem"]').map((row) => row.text())).toEqual([
      '亚什基诺',
      '维斯珂帝国',
      '帝国大熔炉',
      '凯旋大竞技场',
      '维斯珂教育体系'
    ])
  })
})
