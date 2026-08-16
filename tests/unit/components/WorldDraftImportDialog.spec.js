/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WorldDraftImportDialog from '../../../src/components/doc-library/WorldDraftImportDialog.vue'
import { applyWorldDraftImport, previewWorldDraftImport } from '../../../src/repositories/docBrainRepository'

vi.mock('../../../src/repositories/docBrainRepository', () => ({
  previewWorldDraftImport: vi.fn(),
  applyWorldDraftImport: vi.fn()
}))

const CONTRACT = {
  formatVersion: 1,
  provider: 'langhuan_world_draft',
  world: '亚什基诺',
  units: []
}

const PREVIEW = {
  world: '亚什基诺',
  units: [
    {
      draftKey: 'source:doc-lung',
      status: 'conflict',
      matchKind: 'source_id',
      displayPath: '/亚什基诺/规则与概念/能/肺能.md',
      path: '规则与概念/能/肺能.md',
      incoming: {
        title: '肺能',
        semanticType: 'ability',
        summary: '导入稿摘要',
        tags: ['能'],
        relationHints: ['[[肺能]]_属于_[[能体系]]'],
        content: '导入稿正文'
      },
      existing: {
        documentId: 'doc-lung',
        title: '肺能',
        summary: '库里旧摘要',
        tags: ['旧标签'],
        relationHints: [],
        content: '库里旧正文',
        updatedAt: '2026-06-25T00:00:00.000Z'
      }
    },
    {
      draftKey: 'path:/亚什基诺/文明/新文明.md',
      status: 'new',
      displayPath: '/亚什基诺/文明/新文明.md',
      path: '文明/新文明.md',
      incoming: {
        title: '新文明',
        semanticType: 'polity',
        summary: '',
        tags: [],
        relationHints: [],
        content: '新文明正文'
      }
    }
  ],
  tree: [],
  warnings: [],
  stats: { unitCount: 2, newCount: 1, conflictCount: 1, warningCount: 0 }
}

const APPLY_RESULT = {
  ok: true,
  world: '亚什基诺',
  addedCount: 1,
  overwrittenCount: 1,
  editedCount: 1,
  skippedCount: 0,
  documentCount: 2,
  outcomes: [
    { draftKey: 'source:doc-lung', displayPath: '/亚什基诺/规则与概念/能/肺能.md', title: '肺能', outcome: 'edited_overwritten' },
    { draftKey: 'path:/亚什基诺/文明/新文明.md', displayPath: '/亚什基诺/文明/新文明.md', title: '新文明', outcome: 'added' }
  ]
}

async function pickContractFile() {
  const input = document.body.querySelector('input[type="file"]')
  const file = new File([JSON.stringify(CONTRACT)], '亚什基诺-导入稿.json', { type: 'application/json' })
  if (typeof file.text !== 'function') {
    file.text = () => Promise.resolve(JSON.stringify(CONTRACT))
  }
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

describe('WorldDraftImportDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(previewWorldDraftImport).mockReset().mockResolvedValue(JSON.parse(JSON.stringify(PREVIEW)))
    vi.mocked(applyWorldDraftImport).mockReset().mockResolvedValue(JSON.parse(JSON.stringify(APPLY_RESULT)))
  })

  it('starts in pick phase and moves to preview after choosing a contract file', async () => {
    const wrapper = mount(WorldDraftImportDialog, { props: { open: true } })
    expect(document.body.textContent).toContain('选择 contract JSON 文件')

    await pickContractFile()

    expect(previewWorldDraftImport).toHaveBeenCalledWith(CONTRACT)
    expect(document.body.textContent).toContain('已决议 0/1')
    expect(document.body.textContent).toContain('冲突')
    expect(document.body.textContent).toContain('新增 1 项')
  })

  it('defaults conflicts to skip and sends per-unit resolutions on apply', async () => {
    const wrapper = mount(WorldDraftImportDialog, { props: { open: true } })
    await pickContractFile()

    const segButtons = Array.from(document.body.querySelectorAll('.wdi__seg button'))
    const overwriteButton = segButtons.find((button) => button.textContent === '覆盖')
    overwriteButton.click()
    await flushPromises()
    expect(document.body.textContent).toContain('已决议 1/1')

    const applyButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent.includes('应用导入'))
    applyButton.click()
    await flushPromises()

    expect(applyWorldDraftImport).toHaveBeenCalledWith(CONTRACT, {
      'source:doc-lung': { action: 'overwrite' }
    })
    expect(wrapper.emitted('applied')).toHaveLength(1)
    expect(document.body.textContent).toContain('导入完成 · 亚什基诺')
  })

  it('edit mode prefills incoming fields and sends edited values', async () => {
    const wrapper = mount(WorldDraftImportDialog, { props: { open: true } })
    await pickContractFile()

    const segButtons = Array.from(document.body.querySelectorAll('.wdi__seg button'))
    segButtons.find((button) => button.textContent === '修改再覆盖').click()
    await flushPromises()

    const contentArea = document.body.querySelector('.wdi__editor textarea')
    expect(contentArea.value).toBe('导入稿正文')

    contentArea.value = '用户改过的正文'
    contentArea.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent.includes('应用导入')).click()
    await flushPromises()

    expect(applyWorldDraftImport).toHaveBeenCalledWith(CONTRACT, {
      'source:doc-lung': {
        action: 'overwrite',
        content: '用户改过的正文',
        summary: '导入稿摘要',
        tags: ['能'],
        relationHints: ['[[肺能]]_属于_[[能体系]]']
      }
    })
  })

  it('highlights modified and added lines in the expanded comparison', async () => {
    const preview = JSON.parse(JSON.stringify(PREVIEW))
    preview.units[0].existing.content = '标题\n旧内容'
    preview.units[0].incoming.content = '标题\n新内容\n补充一行'
    vi.mocked(previewWorldDraftImport).mockResolvedValue(preview)

    mount(WorldDraftImportDialog, { props: { open: true } })
    await pickContractFile()

    document.body.querySelector('.wdi__chevron').click()
    await flushPromises()

    const deltaChips = Array.from(document.body.querySelectorAll('.wdi__delta-chip')).map((chip) => chip.textContent)
    expect(deltaChips).toContain('+1')
    expect(deltaChips).toContain('~1')

    const incomingKinds = Array.from(document.body.querySelectorAll('.wdi__cmp-col:nth-child(2) .wdi__diff-line'))
      .map((line) => line.className)
    expect(incomingKinds.some((name) => name.includes('is-modified'))).toBe(true)
    expect(incomingKinds.some((name) => name.includes('is-added'))).toBe(true)
    const existingKinds = Array.from(document.body.querySelectorAll('.wdi__cmp-col:nth-child(1) .wdi__diff-line'))
      .map((line) => line.className)
    expect(existingKinds.some((name) => name.includes('is-modified'))).toBe(true)
    expect(document.body.textContent).toContain('新增')
    expect(document.body.querySelector('.wdi__legend')).toBeTruthy()
  })

  it('shows a retryable error when apply fails and keeps the preview', async () => {
    vi.mocked(applyWorldDraftImport).mockRejectedValueOnce(new Error('世界观导入稿未通过字段树检查'))
    const wrapper = mount(WorldDraftImportDialog, { props: { open: true } })
    await pickContractFile()

    Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent.includes('应用导入')).click()
    await flushPromises()

    expect(document.body.textContent).toContain('未通过字段树检查')
    expect(document.body.textContent).toContain('重试应用')
    expect(wrapper.emitted('applied')).toBeUndefined()
  })
})
