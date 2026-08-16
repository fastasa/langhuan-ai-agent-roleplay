import { describe, expect, it, vi } from 'vitest'
import {
  applyCompilePageEdit,
  applyXingyiUnitBodyEdit,
  createXingyiUnitCrudTools
} from '../../../src/app/xingyiUnitCrudTools.ts'
import {
  DOC_LIBRARY_EXTERNAL_UPDATED_EVENT,
  createXingyiDocLibraryCrudAdapter
} from '../../../src/app/xingyiUnitCrudDocLibraryAdapter.ts'
import { applyDocLibraryTreeCommand } from '../../../src/app/docLibraryTreeCommands.ts'

function createDocument(documentId, displayPath, content = '') {
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title: displayPath.split('/').filter(Boolean).at(-1)?.replace(/\.md$/i, '') || documentId,
    displayPath,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '',
    tags: [],
    content,
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}

/** 内存文档库：fetch 深拷贝、save 覆盖，模拟仓库真值。 */
function createMemoryPorts(initialDocuments) {
  const store = {
    current: {
      schemaVersion: 1,
      documents: initialDocuments,
      manualTreeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    },
    saved: [],
    notifiedCount: 0
  }
  const ports = {
    fetchState: async () => JSON.parse(JSON.stringify(store.current)),
    saveState: async (payload) => {
      store.current = JSON.parse(JSON.stringify(payload))
      store.saved.push(store.current)
    },
    notifySaved: () => { store.notifiedCount += 1 }
  }
  return { store, ports }
}

function createWorldPorts() {
  return createMemoryPorts([
    createDocument('doc_world', '/世界观/index.md', '# 世界观总览\n\n这是总览。'),
    createDocument('doc_hall', '/世界观/地点/大厅.md', '# 大厅\n\n大厅有一座喷泉。'),
    createDocument('doc_manual', '/操作手册/入门.md', '手册内容')
  ])
}

function createTools(ports, overrides = {}) {
  const confirmWrite = overrides.confirmWrite ?? vi.fn(async () => true)
  const adapter = createXingyiDocLibraryCrudAdapter(ports)
  const tools = createXingyiUnitCrudTools({
    ...(confirmWrite ? { confirmWrite } : {}),
    hasReadRelationHintSkill: overrides.hasReadRelationHintSkill ?? (() => true),
    adapters: { docLibrary: adapter }
  })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  return { tools, byName, confirmWrite }
}

describe('applyXingyiUnitBodyEdit', () => {
  it('replaces a unique anchor in the body', () => {
    const result = applyXingyiUnitBodyEdit('大厅有一座喷泉。', { replaceInBody: { oldText: '喷泉', newText: '雕像' } })
    expect(result.next).toBe('大厅有一座雕像。')
    expect(result.changedLines[0]).toContain('喷泉')
  })

  it('rejects a missing anchor and an ambiguous anchor', () => {
    expect(applyXingyiUnitBodyEdit('abc', { replaceInBody: { oldText: 'zzz', newText: 'x' } }).error).toContain('没有找到')
    expect(applyXingyiUnitBodyEdit('aXbXc', { replaceInBody: { oldText: 'X', newText: 'Y' } }).error).toContain('2 次')
  })

  it('supports whole-body overwrite with a change preview', () => {
    const result = applyXingyiUnitBodyEdit('旧正文', { body: '新正文内容' })
    expect(result.next).toBe('新正文内容')
    expect(result.changedLines[0]).toContain('整段覆盖')
  })
})

describe('applyCompilePageEdit（2026-07-11 批2 自 xingyiFunctionTools 迁入）', () => {
  const CURRENT = {
    summary: '两位老人从支离中重建第三世界，第三世界跨洋航行非常困难。',
    tags: ['创世', '世界观'],
    semanticType: 'event',
    relationHints: ['[[创世与支离]]_属于_[[规则与概念]]']
  }

  it('唯一片段定点替换；未命中/多次命中/零变化都报可读错误', () => {
    const ok = applyCompilePageEdit(CURRENT, { replaceInSummary: { oldText: '跨洋航行非常困难', newText: '跨洋航行几乎不可能' } })
    expect(ok.next.summary).toContain('几乎不可能')
    expect(ok.changedLines[0]).toContain('摘要片段')

    expect(applyCompilePageEdit(CURRENT, { replaceInSummary: { oldText: '不存在的句子', newText: 'x' } }).error).toContain('没有找到')
    expect(applyCompilePageEdit(CURRENT, { replaceInSummary: { oldText: '第三世界', newText: '新世界' } }).error).toContain('次')
    expect(applyCompilePageEdit(CURRENT, {}).error).toContain('没有产生任何变化')
    expect(applyCompilePageEdit(CURRENT, { relationHints: ['不是合法格式'] }).error).toContain('格式不对')
    expect(applyCompilePageEdit(CURRENT, { relationHints: ['[[甲]]_守护着_[[乙]]'] }).error).toContain('未登记谓词')
    expect(applyCompilePageEdit(CURRENT, { relationHints: ['无', '[[甲]]_相关_[[乙]]'] }).error).toContain('唯一一行')
    expect(applyCompilePageEdit(CURRENT, { relationHints: ['无'] }).next.relationHints).toEqual(['无'])
  })

  it('类型只收编译页枚举值；合法改动产出 before→after 变化行', () => {
    expect(applyCompilePageEdit(CURRENT, { type: '概念' }).error).toContain('枚举')
    const ok = applyCompilePageEdit(CURRENT, { type: 'concept', tags: ['领域', '术式'] })
    expect(ok.next.semanticType).toBe('concept')
    expect(ok.next.tags).toEqual(['领域', '术式'])
    expect(ok.changedLines.join('\n')).toContain('类型')
  })
})

describe('xingyiUnitCrudTools 硬门与分发', () => {
  it('registers the nine-tool suite', () => {
    const { tools } = createTools(createWorldPorts().ports)
    expect(tools.map((tool) => tool.name)).toEqual([
      'listUnitTree', 'readUnit', 'diagnoseCompilePages',
      'createUnit', 'editUnitBody', 'editUnitCompilePage', 'renameUnit', 'moveUnit', 'deleteUnit'
    ])
  })

  it('refuses write tools when confirmWrite is missing (hard gate)', async () => {
    const { ports } = createWorldPorts()
    const adapter = createXingyiDocLibraryCrudAdapter(ports)
    const tools = createXingyiUnitCrudTools({ adapters: { docLibrary: adapter } })
    const deleteTool = tools.find((tool) => tool.name === 'deleteUnit')
    const result = await deleteTool.execute({ args: { domain: 'docLibrary', unit: '大厅' } })
    expect(result.status).toBe('error')
    expect(result.error.message).toContain('confirmWrite 缺失')
  })

  it('editUnitCompilePage 只有写 relationHints 时才要求本轮先读专项 Skill', async () => {
    const { ports } = createWorldPorts()
    const { byName, confirmWrite } = createTools(ports, { hasReadRelationHintSkill: () => false })

    const relationResult = await byName.editUnitCompilePage.execute({
      args: { domain: 'docLibrary', unit: '大厅', relationHints: ['无'] }
    })
    expect(relationResult.status).toBe('error')
    expect(relationResult.content).toContain('readRelationHintSkill')
    expect(confirmWrite).not.toHaveBeenCalled()

    const summaryResult = await byName.editUnitCompilePage.execute({
      args: { domain: 'docLibrary', unit: '大厅', summary: '大厅中央有一座喷泉，是世界观资料中的明确地点。' }
    })
    expect(summaryResult.status).not.toBe('error')
    expect(confirmWrite).toHaveBeenCalledOnce()
  })

  it('returns a respectful cancelled result when user denies, without applying', async () => {
    const { store, ports } = createWorldPorts()
    const confirmWrite = vi.fn(async () => false)
    const { byName } = createTools(ports, { confirmWrite })
    const result = await byName.deleteUnit.execute({ args: { domain: 'docLibrary', unit: '大厅' } })
    expect(result.details.denied).toBe(true)
    expect(store.saved).toHaveLength(0)
  })

  it('rejects an unmounted domain and demands characterName for characterBrain', async () => {
    const { ports } = createWorldPorts()
    const { byName } = createTools(ports)
    // 未挂载的领域：执行与校验都报 domain 错
    const result = await byName.readUnit.execute({ args: { domain: 'characterBrain', unit: 'x' } })
    expect(result.status).toBe('error')
    expect(byName.readUnit.validateArgs({ domain: 'characterBrain', unit: 'x' })).toContain('domain')
    // 挂载了 characterBrain 桩适配器后：缺 characterName 被校验拦下
    const stubAdapter = { label: '角色大脑（桩）' }
    const tools = createXingyiUnitCrudTools({
      adapters: { docLibrary: createXingyiDocLibraryCrudAdapter(ports), characterBrain: stubAdapter }
    })
    const readUnit = tools.find((tool) => tool.name === 'readUnit')
    expect(readUnit.validateArgs({ domain: 'characterBrain', unit: 'x' })).toContain('characterName')
    expect(readUnit.validateArgs({ domain: 'characterBrain', characterName: '星依', unit: 'x' })).toBeNull()
  })
})

describe('文档库适配器·只读', () => {
  it('lists the world tree with kinds and ids', async () => {
    const { ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const result = await byName.listUnitTree.execute({ args: { domain: 'docLibrary' } })
    expect(result.content).toContain('世界观')
    expect(result.content).toContain('大厅（文档·')
    expect(result.content).toContain('地点（枝·')
  })

  it('reads a document body and a folder overview plus child listing', async () => {
    const { ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const doc = await byName.readUnit.execute({ args: { domain: 'docLibrary', unit: '大厅' } })
    expect(doc.content).toContain('大厅有一座喷泉')
    const folder = await byName.readUnit.execute({ args: { domain: 'docLibrary', unit: '地点' } })
    expect(folder.content).toContain('直属子单位')
    expect(folder.content).toContain('大厅')
    expect(folder.content).toContain('缺少 index.md 概览正文')

    const cluster = await byName.readUnit.execute({ args: { domain: 'docLibrary', unit: '世界观' } })
    expect(cluster.content).toContain('世界观总览')
    expect(cluster.content).not.toContain('枝本身没有正文')
  })

  it('gives readable candidates for ambiguous unit references', async () => {
    const { ports } = createMemoryPorts([
      createDocument('doc_a', '/甲/同名.md', 'a'),
      createDocument('doc_b', '/乙/同名.md', 'b')
    ])
    const { byName } = createTools(ports)
    const result = await byName.readUnit.execute({ args: { domain: 'docLibrary', unit: '同名' } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('同名单位')
  })
})

describe('文档库适配器·写操作', () => {
  it('creates a document under a new auto-created path', async () => {
    const { store, ports } = createWorldPorts()
    const confirmWrite = vi.fn(async () => true)
    const { byName } = createTools(ports, { confirmWrite })
    const result = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'document', title: '北境风物', parent: '/世界观/势力', body: '北境很冷。' }
    })
    expect(result.details.ok).toBe(true)
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('自动逐级建枝')
    const saved = store.current
    const created = saved.documents.find((item) => item.title === '北境风物')
    expect(created?.displayPath).toBe('/世界观/势力/北境风物.md')
    expect(created?.content).toBe('北境很冷。')
    expect(store.notifiedCount).toBe(1)
  })

  it('requires a parent when creating a document', async () => {
    const { ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const result = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'document', title: '孤儿文档' }
    })
    expect(result.status).toBe('error')
    expect(result.content).toContain('parent')
  })

  it('creates a folder with an index overview and rejects duplicates', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const created = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'folder', title: '势力', parent: '世界观' }
    })
    expect(created.details.ok).toBe(true)
    expect(store.current.treeNodes.some((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/世界观/势力')).toBe(true)
    const overview = store.current.documents.find((item) => item.displayPath === '/世界观/势力/index.md')
    expect(overview?.content).toContain('本枝用于整理与「势力」相关的资料')
    const folderNode = store.current.treeNodes.find((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/世界观/势力')
    expect(folderNode?.overviewDocumentId).toBe(overview?.documentId)
    const readBack = await byName.readUnit.execute({ args: { domain: 'docLibrary', unit: '势力' } })
    expect(readBack.content).toContain('本枝用于整理与「势力」相关的资料')
    const duplicated = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'folder', title: '地点', parent: '世界观' }
    })
    expect(duplicated.status).toBe('error')
    expect(duplicated.content).toContain('已存在')
  })

  it('keeps a supplied branch overview and can backfill index.md for a historical empty branch', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const suppliedBody = '# 学派概览\n\n这里记录各个学派的来源与分支。'
    const created = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'folder', title: '学派', parent: '世界观', body: suppliedBody }
    })
    expect(created.details.ok).toBe(true)
    expect(store.current.documents.find((item) => item.displayPath === '/世界观/学派/index.md')?.content).toBe(suppliedBody)

    const emptyCreated = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'folder', title: '历史空枝', parent: '世界观' }
    })
    expect(emptyCreated.details.ok).toBe(true)
    const emptyOverview = store.current.documents.find((item) => item.displayPath === '/世界观/历史空枝/index.md')
    const withoutDocument = applyDocLibraryTreeCommand(store.current, {
      type: 'delete_documents',
      documentIds: [emptyOverview.documentId]
    })
    store.current = applyDocLibraryTreeCommand(withoutDocument, {
      type: 'set_folder_overview',
      folderPath: '/世界观/历史空枝',
      overviewDocumentId: ''
    })

    const backfilled = await byName.editUnitBody.execute({
      args: { domain: 'docLibrary', unit: '历史空枝', body: '# 历史空枝概览\n\n这是补建后的概览。' }
    })
    expect(backfilled.details.ok, backfilled.content).toBe(true)
    const repairedOverview = store.current.documents.find((item) => item.displayPath === '/世界观/历史空枝/index.md')
    expect(repairedOverview?.content).toContain('这是补建后的概览')
    expect(store.current.treeNodes.find((node) => node.legacyDisplayPath === '/世界观/历史空枝')?.overviewDocumentId)
      .toBe(repairedOverview?.documentId)
  })

  it('auto-created parent branches also receive index overviews', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)

    const result = await byName.createUnit.execute({
      args: { domain: 'docLibrary', kind: 'document', title: '远郊哨站', parent: '/新世界/北境/据点', body: '哨站正文。' }
    })

    expect(result.details.ok).toBe(true)
    for (const path of ['/新世界/index.md', '/新世界/北境/index.md', '/新世界/北境/据点/index.md']) {
      expect(store.current.documents.some((item) => item.displayPath === path)).toBe(true)
    }
    expect(store.current.documents.some((item) => item.displayPath === '/新世界/北境/据点/远郊哨站.md')).toBe(true)
  })

  it('edits a document body via unique anchor, recomputed on the freshest state', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const result = await byName.editUnitBody.execute({
      args: { domain: 'docLibrary', unit: '大厅', replaceInBody: { oldText: '喷泉', newText: '青铜雕像' } }
    })
    expect(result.details.ok).toBe(true)
    expect(store.current.documents.find((item) => item.documentId === 'doc_hall')?.content).toContain('青铜雕像')
  })

  it('renames a document and moves it into another folder', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const renamed = await byName.renameUnit.execute({
      args: { domain: 'docLibrary', unit: '大厅', newTitle: '中央大厅' }
    })
    expect(renamed.details.ok).toBe(true)
    expect(store.current.documents.find((item) => item.documentId === 'doc_hall')?.title).toBe('中央大厅')
    const moved = await byName.moveUnit.execute({
      args: { domain: 'docLibrary', unit: '中央大厅', newParent: '/世界观/旧址' }
    })
    expect(moved.details.ok).toBe(true)
    expect(store.current.documents.find((item) => item.documentId === 'doc_hall')?.displayPath).toContain('/世界观/旧址/')
    expect(store.current.documents.some((item) => item.displayPath === '/世界观/旧址/index.md')).toBe(true)
  })

  it('refuses to move a folder into its own descendant', async () => {
    const { ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const result = await byName.moveUnit.execute({
      args: { domain: 'docLibrary', unit: '世界观', newParent: '/世界观/地点' }
    })
    expect(result.status).toBe('error')
    expect(result.content).toContain('子孙')
  })

  it('deletes a folder with severe warnings and descendant counts on the confirm card', async () => {
    const { store, ports } = createWorldPorts()
    const confirmWrite = vi.fn(async () => true)
    const { byName } = createTools(ports, { confirmWrite })
    const result = await byName.deleteUnit.execute({ args: { domain: 'docLibrary', unit: '地点' } })
    expect(result.details.ok).toBe(true)
    const lines = confirmWrite.mock.calls[0][0].lines.join('\n')
    expect(lines).toContain('⚠️ 严重警告')
    expect(lines).toContain('1 份文档')
    expect(lines).toContain('永久')
    expect(store.current.documents.some((item) => item.documentId === 'doc_hall')).toBe(false)
  })

  it('fails safely when the target vanished between plan and apply', async () => {
    const { store, ports } = createWorldPorts()
    let confirmedResolve
    const confirmWrite = vi.fn(() => new Promise((resolve) => { confirmedResolve = resolve }))
    const { byName } = createTools(ports, { confirmWrite })
    const pending = byName.renameUnit.execute({
      args: { domain: 'docLibrary', unit: '大厅', newTitle: '中央大厅' }
    })
    await vi.waitFor(() => expect(confirmWrite).toHaveBeenCalled())
    // 确认卡片挂着期间，文档被别处删掉
    store.current.documents = store.current.documents.filter((item) => item.documentId !== 'doc_hall')
    confirmedResolve(true)
    const result = await pending
    expect(result.details.ok).toBe(false)
    expect(result.content).toContain('已不存在')
  })

  it('exposes the external update event name for the doc library page', () => {
    expect(DOC_LIBRARY_EXTERNAL_UPDATED_EVENT).toBe('langhuan:doc-library-external-updated')
  })
})

describe('文档库适配器·编译页体检与精修（2026-07-11 批1/2）', () => {
  function createCompilePage(overrides = {}) {
    return {
      summary: '大厅是要塞的核心聚集地。',
      tags: ['地点'],
      relationHints: ['[[大厅]]_位于_[[世界观]]'],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-07-01T00:00:00.000Z',
      ...overrides
    }
  }

  it('diagnoseCompilePages：黄灯（缺编译页）与红灯（重复关系）同报，且与全绿判据互斥', async () => {
    const hall = createDocument('doc_hall', '/世界观/地点/大厅.md', '大厅正文')
    hall.publicCompilePage = createCompilePage({
      relationHints: ['[[大厅]]_位于_[[入门]]', '[[大厅]]_位于_[[入门]]']
    })
    const { ports } = createMemoryPorts([
      hall,
      createDocument('doc_manual', '/操作手册/入门.md', '手册内容')
    ])
    const { byName } = createTools(ports)
    const result = await byName.diagnoseCompilePages.execute({ args: { domain: 'docLibrary' } })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('红灯')
    expect(result.content).toContain('重复')
    expect(result.content).toContain('黄灯')
    expect(result.content).toContain('入门')
    expect(result.content).not.toContain('✅ 全绿')
  })

  it('diagnoseCompilePages：parent 限定子树后，范围外的问题不再出现', async () => {
    const hall = createDocument('doc_hall', '/世界观/地点/大厅.md', '大厅正文')
    hall.publicCompilePage = createCompilePage()
    hall.semanticType = 'settlement'
    const { ports } = createMemoryPorts([
      hall,
      createDocument('doc_manual', '/操作手册/入门.md', '手册内容')
    ])
    const { byName } = createTools(ports)
    const scoped = await byName.diagnoseCompilePages.execute({ args: { domain: 'docLibrary', parent: '地点' } })
    expect(scoped.content).toContain('子树')
    expect(scoped.content).toContain('✅ 全绿')
    expect(scoped.content).not.toContain('入门')
  })

  it('editUnitCompilePage：定点替换+改类型落到 publicCompilePage，保留召回分数', async () => {
    const hall = createDocument('doc_hall', '/世界观/地点/大厅.md', '大厅正文')
    hall.publicCompilePage = createCompilePage({ scoreDirectBase: 80 })
    const { store, ports } = createMemoryPorts([hall])
    const confirmWrite = vi.fn(async () => true)
    const { byName } = createTools(ports, { confirmWrite })
    const result = await byName.editUnitCompilePage.execute({
      args: {
        domain: 'docLibrary',
        unit: '大厅',
        replaceInSummary: { oldText: '核心聚集地', newText: '中央集会厅' },
        type: 'settlement'
      }
    })
    expect(result.details.ok).toBe(true)
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('→')
    const saved = store.current.documents.find((item) => item.documentId === 'doc_hall')
    expect(saved.publicCompilePage.summary).toContain('中央集会厅')
    expect(saved.publicCompilePage.scoreDirectBase).toBe(80)
    expect(saved.publicCompilePage.sourceState).toBe('manual_confirmed')
    expect(saved.semanticType).toBe('settlement')
  })

  it('editUnitCompilePage：没有正式编译页也能直接补齐三字段（修黄灯不依赖 generateCompilePage）', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const result = await byName.editUnitCompilePage.execute({
      args: {
        domain: 'docLibrary',
        unit: '大厅',
        summary: '大厅是要塞的核心聚集地，居民日常在此交易与集会。',
        tags: ['地点', '要塞'],
        relationHints: ['[[大厅]]_位于_[[世界观]]']
      }
    })
    expect(result.details.ok).toBe(true)
    const saved = store.current.documents.find((item) => item.documentId === 'doc_hall')
    expect(saved.publicCompilePage.summary).toContain('核心聚集地')
    expect(saved.publicCompilePage.tags).toEqual(['地点', '要塞'])
    expect(saved.publicCompilePage.relationHints).toEqual(['[[大厅]]_位于_[[世界观]]'])
  })

  it('editUnitCompilePage：非法类型/非法关系提示格式在计划期被拦，不写库', async () => {
    const { store, ports } = createWorldPorts()
    const { byName } = createTools(ports)
    const badType = await byName.editUnitCompilePage.execute({
      args: { domain: 'docLibrary', unit: '大厅', type: '概念' }
    })
    expect(badType.status).toBe('error')
    expect(badType.content).toContain('枚举')
    const badHint = await byName.editUnitCompilePage.execute({
      args: { domain: 'docLibrary', unit: '大厅', relationHints: ['大厅位于世界观'] }
    })
    expect(badHint.status).toBe('error')
    expect(badHint.content).toContain('格式不对')
    expect(store.saved).toHaveLength(0)
  })
})
