import type { RecallCompilePageFields, UnitSemanticType } from '../types/docBrain'
import { parseRelationHintReference } from './relationHintReference'
import { normalizeUnitSemanticType } from './unitSemanticTypes'

export type CompilePageMarkdownImportResult = {
  compilePage: RecallCompilePageFields
  semanticType: UnitSemanticType
}

export type CompilePageMarkdownBatchEntry = CompilePageMarkdownImportResult & {
  target: string
  targetTitle: string
  targetRefId: string
  rawMarkdown: string
}

export type CompilePageMarkdownBatchWarning = {
  code: 'missing_target_ref' | 'duplicate_target' | 'empty_compile_page'
  target?: string
  message: string
}

export type CompilePageMarkdownBatchImportResult = {
  entries: CompilePageMarkdownBatchEntry[]
  warnings: CompilePageMarkdownBatchWarning[]
}

const SECTION_TITLES = ['摘要', '标签', '类型', '关系提示']
const TARGET_COMMENT_PATTERN = /<!--\s*target\s*:\s*([^>]+?)\s*-->/giu

export function parseCompilePageMarkdown(input: string): CompilePageMarkdownImportResult {
  const text = String(input || '').replace(/\r\n/g, '\n').trim()
  if (!text) {
    return createEmptyResult()
  }

  const sections = collectSections(text)
  return {
    compilePage: {
      summary: normalizeSummary(sections.get('摘要')),
      tags: normalizeTags(sections.get('标签')),
      relationHints: normalizeRelationHints(sections.get('关系提示'))
    },
    semanticType: normalizeUnitSemanticType(firstContentLine(sections.get('类型')) || 'other')
  }
}

export function parseCompilePageMarkdownBatch(input: string): CompilePageMarkdownBatchImportResult {
  const text = String(input || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { entries: [], warnings: [] }

  const targetMatches = Array.from(text.matchAll(TARGET_COMMENT_PATTERN))
  if (!targetMatches.length) return { entries: [], warnings: [] }

  const entries: CompilePageMarkdownBatchEntry[] = []
  const warnings: CompilePageMarkdownBatchWarning[] = []
  const seenTargetRefIds = new Set<string>()

  targetMatches.forEach((match, index) => {
    const rawTarget = String(match[1] || '').trim()
    const blockStart = match.index || 0
    const nextStart = index + 1 < targetMatches.length ? targetMatches[index + 1].index || text.length : text.length
    const rawMarkdown = text.slice(blockStart, nextStart).trim()
    const targetRef = parseRelationHintReference(rawTarget)
    const targetRefId = String(targetRef.refId || '').trim()
    const targetTitle = String(targetRef.title || '').trim()
    if (!targetRefId) {
      warnings.push({
        code: 'missing_target_ref',
        target: rawTarget,
        message: `批量编译页目标缺少正式 ID：${rawTarget || '空'}`
      })
      return
    }
    if (seenTargetRefIds.has(targetRefId)) {
      warnings.push({
        code: 'duplicate_target',
        target: rawTarget,
        message: `批量编译页目标重复：${rawTarget}`
      })
      return
    }

    const parsed = parseCompilePageMarkdown(rawMarkdown)
    const hasContent = Boolean(
      parsed.compilePage.summary
      || parsed.compilePage.tags.length
      || parsed.compilePage.relationHints.length
      || parsed.semanticType !== 'other'
    )
    if (!hasContent) {
      warnings.push({
        code: 'empty_compile_page',
        target: rawTarget,
        message: `批量编译页目标没有可导入内容：${rawTarget}`
      })
      return
    }

    seenTargetRefIds.add(targetRefId)
    entries.push({
      target: rawTarget,
      targetTitle,
      targetRefId,
      rawMarkdown,
      ...parsed
    })
  })

  return { entries, warnings }
}

function createEmptyResult(): CompilePageMarkdownImportResult {
  return {
    compilePage: {
      summary: '',
      tags: [],
      relationHints: []
    },
    semanticType: 'other'
  }
}

function collectSections(text: string) {
  const sections = new Map<string, string>()
  let current = ''
  let buffer: string[] = []

  const flush = () => {
    if (!current) return
    sections.set(current, buffer.join('\n').trim())
  }

  text.split('\n').forEach((line) => {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    const title = heading?.[1]?.trim() || ''
    if (SECTION_TITLES.includes(title)) {
      flush()
      current = title
      buffer = []
      return
    }
    if (current) buffer.push(line)
  })

  flush()
  return sections
}

function normalizeSummary(value = '') {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isInstructionLine(line))
    .join('\n')
    .trim()
}

function normalizeTags(value = '') {
  return uniqueStrings(
    stripFences(value)
      .split(/\n|、|，|,/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line && !isInstructionLine(line) && line !== '无')
  )
}

function normalizeRelationHints(value = '') {
  return uniqueStrings(
    stripFences(value)
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line && line !== '无' && !isInstructionLine(line))
      .filter((line) => /^\[\[.+?\]\]_.+?_\[\[.+?\]\]$/.test(line) || /^\[\[.+?\]\]$/.test(line))
  )
}

function firstContentLine(value = '') {
  return stripFences(value)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !isInstructionLine(line) && line !== '无') || ''
}

function stripFences(value = '') {
  return String(value || '')
    .split('\n')
    .filter((line) => !/^```/.test(line.trim()))
    .join('\n')
}

function isInstructionLine(line: string) {
  return /^(标签要求|类型只能|关系提示要求|用\s*80|只能从以下值|world,|1\.|2\.|3\.|4\.|5\.|6\.|7\.|8\.|9\.|10\.)/.test(line.trim())
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
