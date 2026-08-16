import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const allowedVHtmlExpressions = new Map([
  ['src/components/DocLibraryStable.vue', new Set([
    'renderSummaryMarkdown(summaryActiveSummary.content)',
    'renderSummaryMarkdown(summaryDraftContent)'
  ])],
  ['src/components/app/chat/ChatMessageStream.vue', new Set([
    'formatThoughtText(block)',
    'formatMessageText(entry.message, displayChatText(getDisplayedContent(entry.message, entry.index)))',
    'formatChatText(displayChatText(streamingText))',
    'formatMessageText(msg, displayChatText(getDisplayedContent(msg, i)))',
    'formatChatText(displayChatText(getDisplayedContent(msg, i)))'
  ])],
  ['src/components/app/roles/RoleDocumentPreviewPane.vue', new Set([
    'html'
  ])],
  // 状态系统面板种类图标：KIND_META 组件内常量表（SVG path 字符串·无用户输入），多维表格化批次引入、
  // 2026-07-10 全量审计补录。
  ['src/components/app/chat/ChatStatusSystemPanel.vue', new Set([
    "kindMetaOf(templateById(panel.templateId)?.kind || '').icon",
    'kindMetaOf(preset.kind).icon',
    'kindMetaOf(template.kind).icon'
  ])],
  ['src/components/app/chat/StatusPanelCard.vue', new Set([
    'kindMeta.icon'
  ])],
  // 剧本工作台分区图标来自组件内固定 zones 常量，不接受用户或服务端输入。
  ['src/components/app/script/ScriptWorkspaceDialog.vue', new Set([
    'zone.iconInner'
  ])],
  ['src/components/brain/CharacterBrainCard.vue', new Set([
    'renderMarkdown(draftContent)',
    'renderMarkdown(content)'
  ])],
  ['src/components/brain/CharacterBrainUnitBrowserDialog.vue', new Set([
    'renderMarkdown(formatVersion(port.pendingVersion.confirmed))',
    'renderMarkdown(formatVersion(port.pendingVersion.pending))',
    'renderMarkdown(displayBody)'
  ])],
  ['src/components/brain/CharacterBrainUnitReadPane.vue', new Set([
    'renderVersion(pendingVersion.confirmed)',
    'renderVersion(pendingVersion.pending)'
  ])],
  ['src/components/common/AppWorkspaceReadPane.vue', new Set([
    'html'
  ])],
  ['src/components/doc-library/DocLibraryPreviewPane.vue', new Set([
    'html'
  ])],
  ['src/components/mobile-workspace/MobileMarkdownEditor.vue', new Set([
    'renderedHtml'
  ])],
  ['src/components/mobile-workspace/MobileRoleplayText.vue', new Set([
    'renderedHtml'
  ])],
  ['src/components/app/XingyiChatBubble.vue', new Set([
    'renderedContent'
  ])]
])

function walkVueFiles(dir) {
  const files = []
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...walkVueFiles(fullPath))
    } else if (fullPath.endsWith('.vue')) {
      files.push(fullPath)
    }
  }
  return files
}

function collectVHtmlExpressions() {
  const root = process.cwd()
  return walkVueFiles(path.join(root, 'src')).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8')
    const relativeFile = file.replace(/\\/g, '/').replace(`${root.replace(/\\/g, '/')}/`, '')
    const matches = [...source.matchAll(/v-html\s*=\s*"([^"]+)"/g)]
    return matches.map((match) => ({
      file: relativeFile,
      expression: match[1]
    }))
  })
}

describe('safe html usage audit', () => {
  it('keeps all v-html bindings on the reviewed renderer allowlist', () => {
    const usages = collectVHtmlExpressions()
    const unexpected = usages.filter(({ file, expression }) => {
      return !allowedVHtmlExpressions.get(file)?.has(expression)
    })

    expect(unexpected).toEqual([])
  })
})
