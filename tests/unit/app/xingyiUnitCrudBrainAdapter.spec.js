import { describe, expect, it, vi } from 'vitest'
import { createXingyiCharacterBrainCrudAdapter } from '../../../src/app/xingyiUnitCrudBrainAdapter.ts'
import { createXingyiUnitCrudTools } from '../../../src/app/xingyiUnitCrudTools.ts'

const T = '2026-07-01T00:00:00.000Z'

function createCharacter() {
  return {
    id: 'char-1',
    name: '临渊',
    desc: '一位剑客。',
    personality: '冷静。',
    brainCognitionNodes: [
      { id: 'brain:cognition:node:g1', title: '人际', summary: '', parentId: '', kind: 'group', createdAt: T, updatedAt: T },
      { id: 'brain:cognition:node:n1', title: '对星依的认知', summary: '', parentId: 'brain:cognition:node:g1', kind: 'private', content: '星依是可靠的伙伴。', createdAt: T, updatedAt: T }
    ],
    brainTraceNodes: [
      {
        id: 'brain:trajectory:node:day-0001-01-01',
        kind: 'day',
        granularity: 'day',
        nodeType: 'single',
        title: '0001-01-01',
        pointDate: '0001-01-01',
        startDate: '0001-01-01',
        parentId: '',
        createdAt: T,
        updatedAt: T
      }
    ],
    brainDocuments: {}
  }
}

/** 内存角色 store：read 深拷贝、update 合并补丁，模拟 characterStore 真值。 */
function createBrainPorts(character = createCharacter()) {
  const store = { character: JSON.parse(JSON.stringify(character)), updates: [] }
  const ports = {
    listCharacters: () => [{ id: store.character.id, name: store.character.name }],
    readCharacter: (id) => (id === store.character.id ? JSON.parse(JSON.stringify(store.character)) : null),
    updateCharacter: async (id, changes) => {
      store.updates.push(changes)
      Object.assign(store.character, changes)
    }
  }
  return { store, ports }
}

function createBrainTools(ports, overrides = {}) {
  const confirmWrite = overrides.confirmWrite ?? vi.fn(async () => true)
  const adapter = createXingyiCharacterBrainCrudAdapter(ports)
  const tools = createXingyiUnitCrudTools({ confirmWrite, adapters: { characterBrain: adapter } })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  return { byName, confirmWrite }
}

function soulNodes(store) {
  return store.character.brainCognitionNodes
}

describe('角色大脑适配器·只读', () => {
  it('lists the three sections and soul nodes for the resolved character', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.listUnitTree.execute({ args: { domain: 'characterBrain', characterName: '临渊' } })
    expect(result.content).toContain('核心区')
    expect(result.content).toContain('灵魂区')
    expect(result.content).toContain('轨迹区')
    expect(result.content).toContain('对星依的认知（灵魂单位·')
  })

  it('reads a soul node body and reports unknown characters readably', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const ok = await byName.readUnit.execute({ args: { domain: 'characterBrain', characterName: '临渊', unit: '对星依的认知' } })
    expect(ok.content).toContain('星依是可靠的伙伴')
    const missing = await byName.readUnit.execute({ args: { domain: 'characterBrain', characterName: '不存在的人', unit: 'x' } })
    expect(missing.status).toBe('error')
    expect(missing.content).toContain('没有找到')
  })
})

describe('角色大脑适配器·写操作', () => {
  it('creates a soul node under a soul group', async () => {
    const { store, ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.createUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', kind: 'soulNode', title: '对用户的认知', parent: '人际', body: '用户很温柔。' }
    })
    expect(result.details.ok).toBe(true)
    const created = soulNodes(store).find((node) => node.title === '对用户的认知')
    expect(created?.parentId).toBe('brain:cognition:node:g1')
    expect(created?.content).toBe('用户很温柔。')
    expect(created?.id).toMatch(/^brain:cognition:node:/)
  })

  it('rejects creating units in the core section and unknown kinds', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.createUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', kind: 'coreField', title: '新字段' }
    })
    expect(result.status).toBe('error')
    expect(result.content).toContain('核心区结构固定')
  })

  it('edits a core field body through the unified card draft entry', async () => {
    const { store, ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.editUnitBody.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '简介', replaceInBody: { oldText: '剑客', newText: '大剑客' } }
    })
    expect(result.details.ok).toBe(true)
    expect(store.character.desc).toBe('一位大剑客。')
  })

  it('edits a soul node body and keeps the brainDocuments mirror in sync', async () => {
    const { store, ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.editUnitBody.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '对星依的认知', replaceInBody: { oldText: '可靠的伙伴', newText: '最可靠的家人' } }
    })
    expect(result.details.ok).toBe(true)
    const node = soulNodes(store).find((item) => item.id === 'brain:cognition:node:n1')
    expect(node?.content).toContain('最可靠的家人')
    expect(store.character.brainDocuments['brain:cognition:node:n1']).toContain('最可靠的家人')
  })

  it('renames a soul node but refuses renaming system-dated trace nodes and core fields', async () => {
    const { store, ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const renamed = await byName.renameUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '人际', newTitle: '人际网络' }
    })
    expect(renamed.details.ok).toBe(true)
    expect(soulNodes(store).find((node) => node.id === 'brain:cognition:node:g1')?.title).toBe('人际网络')

    const traceDenied = await byName.renameUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '0001-01-01', newTitle: '随便' }
    })
    expect(traceDenied.status).toBe('error')
    expect(traceDenied.content).toContain('日期')

    const coreDenied = await byName.renameUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '简介', newTitle: '介绍' }
    })
    expect(coreDenied.status).toBe('error')
  })

  it('moves a soul node and refuses cross-section moves', async () => {
    const { store, ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const moved = await byName.moveUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '对星依的认知', newParent: '灵魂' }
    })
    expect(moved.details.ok).toBe(true)
    expect(soulNodes(store).find((node) => node.id === 'brain:cognition:node:n1')?.parentId).not.toBe('brain:cognition:node:g1')

    const crossDenied = await byName.moveUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '人际', newParent: '轨迹' }
    })
    expect(crossDenied.status).toBe('error')
    expect(crossDenied.content).toContain('跨区')
  })

  it('deletes a soul group with severe warnings including descendant counts', async () => {
    const { store, ports } = createBrainPorts()
    const confirmWrite = vi.fn(async () => true)
    const { byName } = createBrainTools(ports, { confirmWrite })
    const result = await byName.deleteUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '人际' }
    })
    expect(result.details.ok).toBe(true)
    const lines = confirmWrite.mock.calls[0][0].lines.join('\n')
    expect(lines).toContain('⚠️ 严重警告')
    expect(lines).toContain('1 个子孙单位')
    expect(lines).toContain('永久')
    expect(soulNodes(store)).toHaveLength(0)
  })

  it('refuses deleting core fields and section roots', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const coreDenied = await byName.deleteUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '简介' }
    })
    expect(coreDenied.status).toBe('error')
    const rootDenied = await byName.deleteUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '灵魂' }
    })
    expect(rootDenied.status).toBe('error')
  })

  it('surfaces the missing-birth-date error when creating a trace day', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.createUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', kind: 'traceDay', title: '初次相遇', date: '0001-02-01' }
    })
    expect(result.details.ok).toBe(false)
    expect(result.content).toContain('出生日期')
  })

  it('diagnoses brain compile pages page-independently (yellow lamps for empty fields)', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.diagnoseCompilePages.execute({
      args: { domain: 'characterBrain', characterName: '临渊' }
    })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('角色大脑·临渊')
    expect(result.content).toContain('黄灯')
    expect(result.content).not.toContain('✅ 全绿')
  })

  it('edits a soul-node compile page through the unified card draft entry', async () => {
    const { store, ports } = createBrainPorts()
    const confirmWrite = vi.fn(async () => true)
    const { byName } = createBrainTools(ports, { confirmWrite })
    const result = await byName.editUnitCompilePage.execute({
      args: {
        domain: 'characterBrain',
        characterName: '临渊',
        unit: '对星依的认知',
        summary: '临渊把星依视作最可靠的家人般的伙伴。',
        tags: ['人际', '信任']
      }
    })
    expect(result.details.ok).toBe(true)
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('→')
    const node = soulNodes(store).find((item) => item.id === 'brain:cognition:node:n1')
    expect(node?.compilePage?.summary).toContain('最可靠的家人')
    expect(node?.tags).toEqual(['人际', '信任'])
    expect(Object.values(store.character.brainDocuments).some((raw) => String(raw).includes('最可靠的家人'))).toBe(true)
  })

  it('refuses compile-page edits on units without a compile page (section roots)', async () => {
    const { ports } = createBrainPorts()
    const { byName } = createBrainTools(ports)
    const result = await byName.editUnitCompilePage.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '灵魂', summary: '不该写进去' }
    })
    expect(result.status).toBe('error')
    expect(result.content).toContain('没有编译页')
  })

  it('fails safely when the unit vanished between plan and apply', async () => {
    const { store, ports } = createBrainPorts()
    let confirmedResolve
    const confirmWrite = vi.fn(() => new Promise((resolve) => { confirmedResolve = resolve }))
    const { byName } = createBrainTools(ports, { confirmWrite })
    const pending = byName.renameUnit.execute({
      args: { domain: 'characterBrain', characterName: '临渊', unit: '对星依的认知', newTitle: '新认知' }
    })
    await vi.waitFor(() => expect(confirmWrite).toHaveBeenCalled())
    store.character.brainCognitionNodes = store.character.brainCognitionNodes.filter((node) => node.id !== 'brain:cognition:node:n1')
    confirmedResolve(true)
    const result = await pending
    expect(result.details.ok).toBe(false)
    expect(result.content).toContain('已不存在')
  })
})
