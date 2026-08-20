import { describe, expect, it, vi } from 'vitest'
import {
  createBuildPlayableWorldTool,
  createReadPlayableWorldBuildReceiptTool,
  resolvePlayableWorldMatch,
  validatePlayableWorldBlueprint
} from '../../../src/app/xingyiPlayableWorldBuilder.ts'
import { createXingyiPlayableWorldDocumentLibrary } from '../../../src/app/xingyiPlayableWorldDocumentLibrary.ts'
import { createXingyiDocLibraryCrudAdapter } from '../../../src/app/xingyiUnitCrudDocLibraryAdapter.ts'

function blueprint() {
  const names = ['千羽澪', '神代朔', '雨宫灯']
  return {
    library: {
      title: '雾海群岛世界簇',
      overview: '这是一个漂浮在雾海之上的群岛世界。古代星炉维持岛屿航路，骑士团、商会与失落神殿围绕星火展开竞争。'.repeat(4),
      documents: [
        ['世界总览', 'world'],
        ['地理与文化', 'region'],
        ['力量与游戏机制', 'law_system'],
        ['主要角色档案', 'character'],
        ['开场与冲突', 'event']
      ].map(([title, semanticType]) => ({
        title,
        semanticType,
        body: `# ${title}\n\n世界资料、约束、可行动线索与游戏主持规则。`.repeat(20),
        summary: `${title}的独立摘要，包含正式事实、使用边界和开场时可直接调用的行动信息。`,
        tags: ['日式奇幻', title]
      }))
    },
    characters: names.map((name, index) => ({
      name,
      brief: `${name}是第${index + 1}位主要角色，拥有明确目标、秘密、能力限制、说话习惯、与其他角色的张力，以及能在开场立刻采取的行动。`.repeat(5),
      avatarPrompt: `${name}的日式奇幻动画头像，雾海群岛服装，独特发色与饰物，柔和电影光线，神态鲜明。`
    })),
    world: {
      name: '雾海星炉群岛',
      description: '漂浮岛屿依靠古代星炉维持航路的日式奇幻世界。',
      matchKeywords: ['雾海', '星炉', '群岛']
    },
    session: {
      title: '星炉熄灭前的最后一班船',
      openingLocation: '雾海群岛/白汐港/末班飞空艇甲板',
      avatarPrompt: '三名冒险者站在星炉与飞空艇前的群像徽章，蓝金配色，日式奇幻动画风格。'
    },
    narrativeSeeds: [
      {
        type: 'countdown', title: '主星炉即将熄灭', description: '主星炉的光正在周期性衰减。', cause: '封印核心被盗走。',
        currentProgress: '港口已经停航一半。', expectedOutcome: '众人找到核心或群岛坠入雾海。', startTime: '群岛历317年星降祭前夜',
        locationText: '雾海群岛/白汐港/中央星炉', impactScope: '整个雾海群岛与所有航路', status: 'active',
        visibilityMode: 'participants', allowFrontstage: true, participantNames: names
      },
      {
        type: 'foreshadow', title: '末班船上的第四张票', description: '乘客簿上出现不存在的第四张票。', cause: '失踪守炉人留下了身份替换术。',
        currentProgress: '票据刚被检票机关识别。', expectedOutcome: '第四张票把众人引向失落神殿。', startTime: '末班飞空艇起航前十分钟',
        locationText: '雾海群岛/白汐港/末班飞空艇甲板', impactScope: '三名主要角色与守炉人秘密', status: 'dormant',
        visibilityMode: 'director_only', allowFrontstage: false, participantNames: names.slice(0, 2)
      }
    ]
  }
}

function image(id) {
  return { id, kind: 'image', url: `data:image/png;base64,${id}`, mime: 'image/png' }
}

describe('xingyiPlayableWorldBuilder', () => {
  it('真实文档 Adapter 能用树簇路径写概览编译页，并可原地重复续建', async () => {
    let state = {
      schemaVersion: 1,
      documents: [],
      manualTreeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    }
    const ports = {
      fetchState: async () => structuredClone(state),
      saveState: async (next) => { state = structuredClone(next) },
      notifySaved: vi.fn()
    }
    const adapter = createXingyiDocLibraryCrudAdapter(ports)
    const input = blueprint().library

    const first = await createXingyiPlayableWorldDocumentLibrary({ adapter, fetchState: ports.fetchState }, input)
    const firstIds = [...first.documentIds].sort()
    const second = await createXingyiPlayableWorldDocumentLibrary({ adapter, fetchState: ports.fetchState }, input)

    expect(first.documentIds).toHaveLength(6)
    expect([...second.documentIds].sort()).toEqual(firstIds)
    expect(state.documents).toHaveLength(6)
    const overview = state.documents.find((document) => document.displayPath === '/雾海群岛世界簇/index.md')
    expect(overview.semanticType).toBe('world')
    expect(overview.publicCompilePage.summary).toContain('漂浮在雾海之上的群岛世界')
    expect(overview.publicCompilePage.relationHints).toEqual(['无'])
  })

  it('文档库执行体创建树簇、叶文档和编译页，并回读正式 documentId', async () => {
    const state = { documents: [] }
    const compileEdits = []
    let id = 0
    const adapter = {
      planCreate: vi.fn(async (input) => ({
        confirmLines: [],
        apply: async () => {
          if (input.kind === 'folder') {
            state.documents.push({ documentId: `doc_${++id}`, displayPath: `/${input.title}/index.md` })
          } else {
            state.documents.push({ documentId: `doc_${++id}`, displayPath: `${input.parent}/${input.title}.md` })
          }
          return { ok: true, message: 'ok' }
        }
      })),
      planEditCompilePage: vi.fn(async (input) => ({
        confirmLines: [],
        apply: async () => { compileEdits.push(input); return { ok: true, message: 'ok' } }
      }))
    }

    const result = await createXingyiPlayableWorldDocumentLibrary({
      adapter,
      fetchState: async () => state
    }, blueprint().library)

    expect(result.rootPath).toBe('/雾海群岛世界簇')
    expect(result.documentIds).toHaveLength(6)
    expect(adapter.planCreate).toHaveBeenCalledTimes(6)
    expect(compileEdits).toHaveLength(6)
    expect(compileEdits[0].unit).toBe('/雾海群岛世界簇')
    expect(compileEdits.slice(1).every((item) => item.unit.startsWith('doc_'))).toBe(true)
    expect(compileEdits.every((item) => item.edit.relationHints[0] === '无')).toBe(true)
  })

  it('世界匹配只接受明确命中，歧义关键词不会擅自复用', () => {
    const request = blueprint().world
    expect(resolvePlayableWorldMatch([{ id: 'w1', name: request.name, description: '' }], request)?.world.id).toBe('w1')
    expect(resolvePlayableWorldMatch([
      { id: 'w1', name: '北方群岛', description: '雾海与星炉' },
      { id: 'w2', name: '南方群岛', description: '雾海与星炉' }
    ], request)).toBe(null)
  })

  it('完整蓝图要求至少五篇叶文档和三个角色', () => {
    expect(validatePlayableWorldBlueprint(blueprint())).toBe(null)
    const tooFewDocs = blueprint()
    tooFewDocs.library.documents.pop()
    expect(validatePlayableWorldBlueprint(tooFewDocs)).toContain('5～12')
  })

  it('只读验收工具把历史世界的全部正式 ID 和完成状态直接返回给模型', async () => {
    const provider = {
      inspectBuild: vi.fn(async () => ({
        world: { id: 'world_1', name: '雾海星炉群岛' },
        session: { id: 'session_1', title: '星炉熄灭前的最后一班船', worldId: 'world_1', avatarReady: true },
        documentIds: ['overview', 'doc_1', 'doc_2', 'doc_3', 'doc_4', 'doc_5'],
        characters: [
          { id: 'char_1', name: '千羽澪', participantId: 'participant_1', presenceState: 'present', avatarReady: true },
          { id: 'char_2', name: '神代朔', participantId: 'participant_2', presenceState: 'present', avatarReady: true },
          { id: 'char_3', name: '雨宫灯', participantId: 'participant_3', presenceState: 'present', avatarReady: true }
        ],
        narrativeSeeds: [{ id: 'seed_1', title: '主星炉即将熄灭' }, { id: 'seed_2', title: '末班船上的第四张票' }]
      }))
    }
    const tool = createReadPlayableWorldBuildReceiptTool(provider)

    const result = await tool.execute({ args: { world: '雾海星炉群岛' } }, { turnIndex: 0 })

    expect(provider.inspectBuild).toHaveBeenCalledWith({ world: '雾海星炉群岛' })
    expect(result.acted).toBe(false)
    expect(result.details).toMatchObject({ complete: true, verificationStatus: 'verified_complete' })
    expect(result.content).toContain('worldId: world_1')
    expect(result.content).toContain('sessionId: session_1')
    expect(result.content).toContain('presenceParticipantIds: participant_1、participant_2、participant_3（全员 present）')
    expect(result.content).toContain('请把相关 TODO 标为完成')
  })

  it('只读验收工具只报告精确缺项，不把残缺链路误报为完成', async () => {
    const tool = createReadPlayableWorldBuildReceiptTool({
      inspectBuild: vi.fn(async () => ({
        world: { id: 'world_1', name: '雾海星炉群岛' },
        session: { id: 'session_1', title: '末班船', worldId: '', avatarReady: false },
        documentIds: ['overview'],
        characters: [
          { id: 'char_1', name: '千羽澪', participantId: 'participant_1', presenceState: 'absent', avatarReady: false }
        ],
        narrativeSeeds: []
      }))
    })

    const result = await tool.execute({ args: { world: 'world_1', session: 'session_1' } }, { turnIndex: 0 })

    expect(result.details).toMatchObject({ complete: false, verificationStatus: 'incomplete' })
    expect(result.content).toContain('会话未挂载到目标世界')
    expect(result.content).toContain('未确认在场：千羽澪')
    expect(result.content).toContain('头像未设置')
  })

  it('严格按内容主链执行，并把所有头像生成放在叙事种子之后', async () => {
    const events = []
    const provider = {
      createDocumentLibrary: vi.fn(async ({ documents }) => {
        events.push('documents')
        return { rootPath: '/雾海群岛世界簇', documentIds: ['overview', ...documents.map((_, index) => `doc_${index}`)] }
      }),
      generateCharacter: vi.fn(async ({ requestedName }) => {
        events.push(`character:${requestedName}`)
        return { ok: true, characterId: `char_${requestedName}`, name: requestedName, message: 'ok' }
      }),
      findCharacterByName: vi.fn(async () => null),
      listWorlds: vi.fn(async () => [{ id: 'world_existing', name: '雾海星炉群岛', description: '既有世界' }]),
      createWorld: vi.fn(async () => { throw new Error('不应新建世界') }),
      readWorldDocumentIds: vi.fn(async () => ['old_doc']),
      mountWorldDocuments: vi.fn(async (_worldId, ids) => { events.push('mount-documents'); return ids }),
      createConversation: vi.fn(async ({ title }) => { events.push('conversation'); return { sessionId: 'session_1', title } }),
      findConversation: vi.fn(async () => null),
      attachSessionToWorld: vi.fn(async () => { events.push('attach-world'); return { worldId: 'world_existing' } }),
      markCharactersPresent: vi.fn(async ({ characterIds }) => { events.push('presence'); return { participantIds: characterIds.map((id) => `participant_${id}`) } }),
      createNarrativeSeed: vi.fn(async (_worldId, seed) => { events.push(`seed:${seed.title}`); return { id: `seed_${events.length}` } }),
      findNarrativeSeedByTitle: vi.fn(async () => null),
      hasCharacterAvatar: vi.fn(async () => false),
      hasSessionAvatar: vi.fn(async () => false),
      generateAvatar: vi.fn(async (prompt) => { events.push(`avatar:${prompt.slice(0, 8)}`); return image(`image_${events.length}`) }),
      assignCharacterAvatar: vi.fn(async () => { events.push('assign-character-avatar') }),
      assignSessionAvatar: vi.fn(async () => { events.push('assign-session-avatar') })
    }
    const confirmWrite = vi.fn(async () => true)
    const tool = createBuildPlayableWorldTool({ provider, confirmWrite, hasReadSkill: () => true })

    const result = await tool.execute({ args: blueprint() }, { turnIndex: 0 })

    expect(result.status).not.toBe('error')
    expect(result.details.complete).toBe(true)
    expect(result.details.verificationStatus).toBe('verified_complete')
    expect(result.details.world).toMatchObject({ id: 'world_existing', resolution: 'matched' })
    expect(result.details.mountedDocumentIds).toEqual(expect.arrayContaining(['overview', 'doc_0']))
    expect(result.details.presenceParticipantIds).toHaveLength(3)
    expect(result.content).toContain('【正式完成回执｜本工具已回读验收')
    expect(result.content).toContain('verificationStatus: verified_complete')
    expect(result.content).toContain('worldId: world_existing')
    expect(result.content).toContain('请直接把相关 TODO 标为完成')
    expect(provider.createWorld).not.toHaveBeenCalled()
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(provider.markCharactersPresent).toHaveBeenCalledWith(expect.objectContaining({
      characterIds: ['char_千羽澪', 'char_神代朔', 'char_雨宫灯']
    }))
    const lastSeedIndex = Math.max(...events.map((event, index) => event.startsWith('seed:') ? index : -1))
    const firstAvatarIndex = events.findIndex((event) => event.startsWith('avatar:'))
    expect(lastSeedIndex).toBeGreaterThan(events.indexOf('presence'))
    expect(firstAvatarIndex).toBeGreaterThan(lastSeedIndex)
    expect(provider.assignCharacterAvatar).toHaveBeenCalledTimes(3)
    expect(provider.assignSessionAvatar).toHaveBeenCalledTimes(1)
  })

  it('相同蓝图续跑时复用角色、会话、种子与头像，不重复创建', async () => {
    const data = blueprint()
    const characters = data.characters.map((character) => ({
      id: `char_${character.name}`,
      name: character.name,
      requestedName: character.name
    }))
    const provider = {
      createDocumentLibrary: vi.fn(async ({ documents }) => ({
        rootPath: '/雾海群岛世界簇', documentIds: ['overview', ...documents.map((_, index) => `doc_${index}`)]
      })),
      findCharacterByName: vi.fn(async (name) => characters.find((character) => character.name === name) || null),
      generateCharacter: vi.fn(),
      listWorlds: vi.fn(async () => [{ id: 'world_1', name: data.world.name, description: data.world.description }]),
      createWorld: vi.fn(),
      readWorldDocumentIds: vi.fn(async () => ['overview', ...data.library.documents.map((_, index) => `doc_${index}`)]),
      mountWorldDocuments: vi.fn(async (_worldId, ids) => ids),
      findConversation: vi.fn(async () => ({ sessionId: 'session_1', title: data.session.title })),
      createConversation: vi.fn(),
      attachSessionToWorld: vi.fn(async () => ({ worldId: 'world_1' })),
      markCharactersPresent: vi.fn(async () => ({ participantIds: ['p1', 'p2', 'p3'] })),
      findNarrativeSeedByTitle: vi.fn(async (_worldId, title) => ({ id: `seed_${title}` })),
      createNarrativeSeed: vi.fn(),
      hasCharacterAvatar: vi.fn(async () => true),
      hasSessionAvatar: vi.fn(async () => true),
      generateAvatar: vi.fn(),
      assignCharacterAvatar: vi.fn(),
      assignSessionAvatar: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    const tool = createBuildPlayableWorldTool({ provider, confirmWrite, hasReadSkill: () => true })

    const result = await tool.execute({ args: data }, { turnIndex: 0 })

    expect(result.details.complete).toBe(true)
    expect(provider.generateCharacter).not.toHaveBeenCalled()
    expect(provider.createWorld).not.toHaveBeenCalled()
    expect(provider.createConversation).not.toHaveBeenCalled()
    expect(provider.createNarrativeSeed).not.toHaveBeenCalled()
    expect(provider.generateAvatar).not.toHaveBeenCalled()
    expect(result.details.receipts.at(-1).message).toContain('已存在 4 个')
  })

  it('同一轮用相同蓝图重试会沿用总确认，并返回可重试错误提示', async () => {
    const data = blueprint()
    let documentAttempt = 0
    const provider = {
      createDocumentLibrary: vi.fn(async ({ documents }) => {
        documentAttempt += 1
        if (documentAttempt === 1) throw new Error('模拟编译页瞬时失败')
        return { rootPath: '/雾海群岛世界簇', documentIds: ['overview', ...documents.map((_, index) => `doc_${index}`)] }
      }),
      findCharacterByName: vi.fn(async (name) => ({ id: `char_${name}`, name, requestedName: name })),
      generateCharacter: vi.fn(),
      listWorlds: vi.fn(async () => [{ id: 'world_1', name: data.world.name, description: '' }]),
      createWorld: vi.fn(),
      readWorldDocumentIds: vi.fn(async () => []),
      mountWorldDocuments: vi.fn(async (_worldId, ids) => ids),
      findConversation: vi.fn(async () => ({ sessionId: 'session_1', title: data.session.title })),
      createConversation: vi.fn(),
      attachSessionToWorld: vi.fn(async () => ({ worldId: 'world_1' })),
      markCharactersPresent: vi.fn(async () => ({ participantIds: ['p1', 'p2', 'p3'] })),
      findNarrativeSeedByTitle: vi.fn(async (_worldId, title) => ({ id: `seed_${title}` })),
      createNarrativeSeed: vi.fn(),
      hasCharacterAvatar: vi.fn(async () => true),
      hasSessionAvatar: vi.fn(async () => true),
      generateAvatar: vi.fn(),
      assignCharacterAvatar: vi.fn(),
      assignSessionAvatar: vi.fn()
    }
    const confirmWrite = vi.fn(async () => true)
    const tool = createBuildPlayableWorldTool({ provider, confirmWrite, hasReadSkill: () => true })

    const failed = await tool.execute({ args: data }, { turnIndex: 0 })
    const resumed = await tool.execute({ args: data }, { turnIndex: 1 })

    expect(failed.error).toMatchObject({ retryable: true })
    expect(failed.content).toContain('完全相同的蓝图再次调用')
    expect(resumed.details.complete).toBe(true)
    expect(confirmWrite).toHaveBeenCalledTimes(1)
  })

  it('未读取 Skill 时硬拒绝，不做任何写入', async () => {
    const provider = { listWorlds: vi.fn() }
    const tool = createBuildPlayableWorldTool({ provider, confirmWrite: async () => true, hasReadSkill: () => false })
    const result = await tool.execute({ args: blueprint() }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('readPlayableWorldBuilderSkill')
    expect(provider.listWorlds).not.toHaveBeenCalled()
  })
})
