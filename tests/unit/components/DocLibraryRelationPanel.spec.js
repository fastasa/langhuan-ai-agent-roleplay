/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import DocLibrary from '../../../src/components/DocLibrary.vue'
import { useCharacterStore } from '../../../src/stores/characterStore.ts'

vi.mock('../../../src/repositories/docBrainRepository.ts', async () => {
  const actual = await vi.importActual('../../../src/repositories/docBrainRepository.ts')
  const createMockDocument = (overrides = {}) => ({
    documentId: 'doc_1',
    id: 'doc_1',
    stableId: 'doc_1',
    title: '文档',
    displayPath: '/文档/文档.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '',
    tags: [],
    content: '',
    publicCompilePage: {
      summary: '',
      tags: [],
      relationHints: [],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-24T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides
  })
  return {
    ...actual,
    fetchDocLibraryState: vi.fn(async () => ({
      documents: [
        createMockDocument({
          documentId: 'doc_night',
          id: 'doc_night',
          title: '夜巡者',
          displayPath: '/亚什基诺/组织/夜巡者.md',
          publicCompilePage: {
            summary: '',
            tags: [],
            relationHints: ['[[镜庭主城]]'],
            sourceState: 'manual_confirmed',
            updatedAt: '2026-04-24T00:00:00.000Z'
          }
        }),
        createMockDocument({
          documentId: 'doc_city',
          id: 'doc_city',
          title: '镜庭主城',
          displayPath: '/亚什基诺/地点/镜庭主城.md'
        }),
        createMockDocument({
          documentId: 'doc_org_index',
          id: 'doc_org_index',
          title: '组织',
          displayPath: '/亚什基诺/组织/index.md'
        })
      ],
      manualTreeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    })),
    saveDocLibraryState: vi.fn(async () => {})
  }
})

function createDocument(overrides = {}) {
  return {
    documentId: 'doc_1',
    id: 'doc_1',
    stableId: 'doc_1',
    title: '文档',
    displayPath: '/文档/文档.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '',
    tags: [],
    content: '',
    publicCompilePage: {
      summary: '',
      tags: [],
      relationHints: [],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-24T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides
  }
}

function mountDocLibrary() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCharacterStore()
  store.setDocuments([
    createDocument({
      documentId: 'doc_night',
      id: 'doc_night',
      title: '夜巡者',
      displayPath: '/亚什基诺/组织/夜巡者.md',
      publicCompilePage: {
        summary: '',
        tags: [],
        relationHints: ['[[镜庭主城]]'],
        sourceState: 'manual_confirmed',
        updatedAt: '2026-04-24T00:00:00.000Z'
      }
    }),
    createDocument({
      documentId: 'doc_city',
      id: 'doc_city',
      title: '镜庭主城',
      displayPath: '/亚什基诺/地点/镜庭主城.md'
    }),
    createDocument({
      documentId: 'doc_org_index',
      id: 'doc_org_index',
      title: '组织',
      displayPath: '/亚什基诺/组织/index.md'
    })
  ])
  return mount(DocLibrary, {
    global: {
      plugins: [pinia],
      stubs: {
        DocLibraryStable: true,
        PromptLibraryPanel: true,
        RecallCompilePagePanel: true,
        SidebarFloatingMenu: true,
        UnitRelationBrainView: {
          name: 'UnitRelationBrainView',
          props: ['source'],
          emits: ['ready', 'open-unit'],
          mounted() {
            this.$emit('ready')
          },
          template: '<div class="unit-relation-brain-view-stub"></div>'
        },
        AppChoiceDialog: true,
        AppConfirmDialog: true,
        AppFormDialog: true,
        AppMoveDialog: true,
        teleport: true
      }
    }
  })
}

describe('DocLibrary relation panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the summary module entry and redirects programmatic summary switches', async () => {
    const wrapper = mountDocLibrary()
    await flushPromises()

    const tabLabels = wrapper.findAll('.leaf-docs__module-tab').map((button) => button.text())
    expect(tabLabels).not.toContain('总结')

    wrapper.vm.setActiveLibraryTab('summary')
    await nextTick()

    expect(wrapper.vm.getSidebarState().activeTab).toBe('worldbook')

    wrapper.unmount()
  })

  it('renders relation tab without treating weak hints as candidates', async () => {
    const wrapper = mountDocLibrary()
    await flushPromises()
    await wrapper.findAll('.leaf-docs__module-tab').find((button) => button.text() === '关系').trigger('click')
    await nextTick()

    expect(wrapper.find('.leaf-docs__relation-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('谓词库')
    expect(wrapper.text()).toContain('候选关系')
    expect(wrapper.text()).toContain('已确认关系')
    expect(wrapper.text()).toContain('候选关系0')
    expect(wrapper.text()).toContain('当前没有待确认关系')
    expect(wrapper.text()).not.toContain('镜庭主城')

    wrapper.unmount()
  })

  it('replaces reader with editor and opens preview or relation in the right panel', async () => {
    const wrapper = mountDocLibrary()
    await flushPromises()

    await wrapper.vm.openEditor()
    await nextTick()
    expect(wrapper.find('.app-workspace-shell__tab').exists()).toBe(false)
    expect(wrapper.findAll('.app-workspace-shell__pane')).toHaveLength(1)
    expect(wrapper.find('.leaf-docs__editor').exists()).toBe(true)
    const editorChildClasses = Array.from(wrapper.find('.leaf-docs__editor').element.children)
      .map((element) => element.className)
    expect(editorChildClasses[0]).toContain('leaf-docs__editor-path')
    expect(editorChildClasses[1]).toContain('leaf-docs__toolbar')
    expect(wrapper.findAll('.leaf-docs__editor-path-actions .role-unit-action')).toHaveLength(0)
    expect(wrapper.find('.leaf-docs__editor-title-field input').element.value).toBe('夜巡者')
    expect(wrapper.find('.leaf-docs__aux-panel-preview-body').exists()).toBe(true)
    expect(wrapper.findAll('.leaf-docs__aux-panel-actions--mode .role-unit-action')).toHaveLength(2)
    expect(wrapper.find('.leaf-docs__aux-panel-close').exists()).toBe(true)
    expect(wrapper.findAll('.leaf-docs__editor-path-actions .role-unit-action')).toHaveLength(0)

    wrapper.vm.selectDocument('doc_city')
    await nextTick()
    expect(wrapper.find('.leaf-docs__editor').exists()).toBe(true)
    expect(wrapper.find('.leaf-docs__aux-panel-preview-body').exists()).toBe(true)
    expect(wrapper.find('.leaf-docs__editor-title-field input').element.value).toBe('镜庭主城')

    wrapper.vm.openDocumentSidePreview()
    await nextTick()
    expect(wrapper.findAll('.app-workspace-shell__pane')).toHaveLength(1)
    expect(wrapper.find('.leaf-docs__aux-panel-preview-body').exists()).toBe(true)
    expect(wrapper.findAll('.leaf-docs__aux-panel-actions--mode .role-unit-action')).toHaveLength(2)
    expect(wrapper.text()).toContain('渲染')

    vi.useFakeTimers()
    wrapper.vm.openRelationWindow()
    await nextTick()
    expect(wrapper.find('.leaf-docs__aux-panel-loading').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(20)
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()
    expect(wrapper.find('.app-workspace-shell__tab').exists()).toBe(false)
    expect(wrapper.find('.leaf-docs__aux-panel').exists()).toBe(true)
    expect(wrapper.find('.leaf-docs__aux-panel-relation-body').exists()).toBe(true)
    expect(wrapper.find('.unit-relation-brain-view-stub').exists()).toBe(true)
    expect(wrapper.find('.leaf-docs__aux-panel-loading').exists()).toBe(false)
    expect(wrapper.findAll('.leaf-docs__aux-panel-tag')).toHaveLength(0)
    expect(wrapper.findAll('.leaf-docs__aux-panel-actions--mode .role-unit-action')).toHaveLength(2)

    const relationStub = wrapper.findComponent({ name: 'UnitRelationBrainView' })
    const relationElement = relationStub.element
    const groupUnit = relationStub.props('source').units.find((unit) => unit.title === '组织' && unit.unitType !== 'leaf')
    expect(groupUnit).toBeTruthy()
    relationStub.vm.$emit('open-unit', groupUnit.unitId)
    await nextTick()
    expect(wrapper.find('.leaf-docs__aux-panel-loading').exists()).toBe(false)
    expect(wrapper.find('.unit-relation-brain-view-stub').element).toBe(relationElement)
    expect(wrapper.find('.leaf-docs__editor-title-field input').element.value).toBe('组织')

    const docUnit = relationStub.props('source').units.find((unit) => unit.sourceId === 'doc_night')
    expect(docUnit).toBeTruthy()
    relationStub.vm.$emit('open-unit', docUnit.unitId)
    await nextTick()
    expect(wrapper.find('.leaf-docs__editor').exists()).toBe(true)
    expect(wrapper.find('.leaf-docs__aux-panel-relation-body').exists()).toBe(true)
    expect(wrapper.find('.leaf-docs__editor-title-field input').element.value).toBe('夜巡者')

    await wrapper.find('.leaf-docs__aux-panel-close').trigger('click')
    await nextTick()
    expect(wrapper.find('.leaf-docs__aux-panel').exists()).toBe(false)
    expect(wrapper.find('.leaf-docs__editor').exists()).toBe(false)
    expect(wrapper.find('.app-workspace-read-pane').exists()).toBe(true)

    wrapper.unmount()
  })
})
