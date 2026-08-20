import type { DocLibraryStateSnapshot } from '../types'
import type { XingyiUnitCrudAdapter, XingyiUnitWritePlan } from './xingyiUnitCrudTools'
import type { PlayableWorldBlueprint } from './xingyiPlayableWorldBuilder'

export interface XingyiPlayableWorldDocumentLibraryPorts {
  adapter: XingyiUnitCrudAdapter
  fetchState: (options?: { force?: boolean }) => Promise<DocLibraryStateSnapshot>
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function sanitizeTitle(value: string): string {
  return text(value).replace(/[\\/]+/g, '-').trim() || '未命名'
}

function documentIdOf(value: Record<string, unknown>): string {
  return text(value.documentId ?? value.id)
}

async function applyPlan(plan: XingyiUnitWritePlan | { error: string }, action: string): Promise<void> {
  if ('error' in plan) throw new Error(`${action}失败：${plan.error}`)
  const result = await plan.apply()
  if (!result.ok) throw new Error(`${action}失败：${result.message}`)
}

function overviewSummary(body: string): string {
  const normalized = text(body)
    .replace(/^#+\s+.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.slice(0, 220) || '本树簇收录该可玩世界的正式世界观、机制、角色与开场资料。'
}

function normalizedPath(value: unknown): string {
  return text(value).replace(/\\/g, '/')
}

function sameStringSet(left: unknown, right: string[]): boolean {
  const normalized = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean))].sort()
    : []
  return JSON.stringify(normalized(left)) === JSON.stringify([...new Set(right)].sort())
}

function compilePageAlreadyMatches(
  record: Record<string, unknown>,
  target: { summary: string; tags: string[]; semanticType: string }
): boolean {
  const page = (record.publicCompilePage && typeof record.publicCompilePage === 'object')
    ? record.publicCompilePage as Record<string, unknown>
    : {}
  return text(page.summary ?? record.summary) === target.summary
    && sameStringSet(page.tags ?? record.tags, target.tags)
    && text(record.semanticType) === target.semanticType
    && sameStringSet(page.relationHints, ['无'])
}

/**
 * 复用现役文档库 Adapter 的两阶段写路径，但把逐项确认收拢到上层 buildPlayableWorld 的一次总确认。
 * 每次 plan.apply 仍会重新强刷并套增量命令，避免整包 PUT 覆盖确认期间的并发修改。
 */
export async function createXingyiPlayableWorldDocumentLibrary(
  ports: XingyiPlayableWorldDocumentLibraryPorts,
  input: PlayableWorldBlueprint['library']
): Promise<{ rootPath: string; documentIds: string[] }> {
  const rootTitle = sanitizeTitle(input.title)
  const rootPath = `/${rootTitle}`
  const safeDocumentTitles = input.documents.map((document) => sanitizeTitle(document.title))
  if (new Set(safeDocumentTitles).size !== safeDocumentTitles.length) {
    throw new Error('文档标题在文件名安全化后发生冲突，请改成彼此不同的标题')
  }

  let currentState = await ports.fetchState({ force: true })
  const findByPath = (path: string) => currentState.documents.find((document) => (
    normalizedPath(document.displayPath) === path
  ))
  const hasRootContent = currentState.documents.some((document) => {
    const path = normalizedPath(document.displayPath)
    return path === `${rootPath}/index.md` || path.startsWith(`${rootPath}/`)
  })
  if (!hasRootContent) {
    await applyPlan(await ports.adapter.planCreate({
      kind: 'folder',
      title: rootTitle,
      body: input.overview
    }), `创建树簇「${rootTitle}」`)
    currentState = await ports.fetchState({ force: true })
  } else if (!findByPath(`${rootPath}/index.md`)) {
    await applyPlan(await ports.adapter.planEditBody({
      unit: rootPath,
      body: input.overview
    }), `补建树簇「${rootTitle}」概览`)
    currentState = await ports.fetchState({ force: true })
  }

  for (let index = 0; index < input.documents.length; index += 1) {
    const document = input.documents[index]
    const expectedPath = `${rootPath}/${safeDocumentTitles[index]}.md`
    if (findByPath(expectedPath)) continue
    await applyPlan(await ports.adapter.planCreate({
      kind: 'document',
      title: document.title,
      parent: rootPath,
      body: document.body
    }), `创建文档「${document.title}」`)
    currentState = await ports.fetchState({ force: true })
  }

  const createdState = await ports.fetchState({ force: true })
  const createdDocuments = createdState.documents.filter((document) => {
    const path = normalizedPath(document.displayPath)
    return path === `${rootPath}/index.md` || path.startsWith(`${rootPath}/`)
  })
  const byPath = new Map(createdDocuments.map((document) => [normalizedPath(document.displayPath), document]))
  const overview = byPath.get(`${rootPath}/index.md`)
  if (!overview) throw new Error(`树簇「${rootTitle}」创建后没有读到 index.md 概览`)

  const compileTargets = [
    {
      unit: rootPath,
      documentId: documentIdOf(overview as unknown as Record<string, unknown>),
      title: rootTitle,
      summary: overviewSummary(input.overview),
      tags: [rootTitle, '世界观', '可玩世界'],
      semanticType: 'world'
    },
    ...input.documents.map((document, index) => {
      const expectedPath = `${rootPath}/${safeDocumentTitles[index]}.md`
      const record = byPath.get(expectedPath)
      if (!record) throw new Error(`文档「${document.title}」创建后没有在 ${expectedPath} 读回`)
      return {
        unit: documentIdOf(record as unknown as Record<string, unknown>),
        documentId: documentIdOf(record as unknown as Record<string, unknown>),
        title: document.title,
        summary: document.summary,
        tags: [...document.tags],
        semanticType: document.semanticType
      }
    })
  ]

  for (const target of compileTargets) {
    if (!target.documentId) throw new Error(`文档「${target.title}」没有正式 documentId`)
    const record = createdState.documents.find((document) => documentIdOf(document as unknown as Record<string, unknown>) === target.documentId)
    if (record && compilePageAlreadyMatches(record as unknown as Record<string, unknown>, target)) continue
    await applyPlan(await ports.adapter.planEditCompilePage({
      // 枝概览在单位视图中被折进枝单位，必须用枝路径；叶文档才可用 documentId(sourceId)。
      unit: target.unit,
      edit: {
        summary: target.summary,
        tags: target.tags,
        type: target.semanticType,
        relationHints: ['无']
      }
    }), `完善文档「${target.title}」编译页`)
  }

  const finalState = await ports.fetchState({ force: true })
  const documentIds = finalState.documents
    .filter((document) => {
      const path = normalizedPath(document.displayPath)
      return path === `${rootPath}/index.md` || path.startsWith(`${rootPath}/`)
    })
    .map((document) => documentIdOf(document as unknown as Record<string, unknown>))
    .filter(Boolean)

  return { rootPath, documentIds: [...new Set(documentIds)] }
}
