// 世界观导入稿冲突对照的行级 diff：只服务 WorldDraftImportDialog 的高亮展示，不参与导入真值。
// 语义：incoming 侧 added=导入稿新增行、modified=与库版配对但内容不同；existing 侧 removed=库版将被移除行、modified=被改行。

export type WorldDraftDiffLineKind = 'same' | 'added' | 'removed' | 'modified'

export interface WorldDraftDiffLine {
  text: string
  kind: WorldDraftDiffLineKind
}

export interface WorldDraftTextDiff {
  existingLines: WorldDraftDiffLine[]
  incomingLines: WorldDraftDiffLine[]
  changed: boolean
}

// 超过这个规模不做逐行 diff（O(n*m) 防卡），整段按原样展示
const MAX_LCS_CELLS = 400_000

export function diffWorldDraftText(oldText: string, newText: string): WorldDraftTextDiff {
  const changed = oldText !== newText
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  if (!changed) {
    return {
      existingLines: oldLines.map((text) => ({ text, kind: 'same' as const })),
      incomingLines: newLines.map((text) => ({ text, kind: 'same' as const })),
      changed: false
    }
  }
  if (oldLines.length * newLines.length > MAX_LCS_CELLS) {
    return {
      existingLines: oldLines.map((text) => ({ text, kind: 'same' as const })),
      incomingLines: newLines.map((text) => ({ text, kind: 'same' as const })),
      changed: true
    }
  }

  const ops = buildLineOps(oldLines, newLines)
  return { ...pairModifiedRuns(ops), changed: true }
}

type LineOp = { type: 'same' | 'del' | 'ins'; text: string }

function splitLines(text: string): string[] {
  return String(text ?? '').split(/\r?\n/)
}

function buildLineOps(oldLines: string[], newLines: string[]): LineOp[] {
  const rows = oldLines.length
  const cols = newLines.length
  // LCS 长度表（rows+1 × cols+1）
  const table: number[] = new Array((rows + 1) * (cols + 1)).fill(0)
  const at = (row: number, col: number) => row * (cols + 1) + col
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      table[at(row, col)] = oldLines[row] === newLines[col]
        ? table[at(row + 1, col + 1)] + 1
        : Math.max(table[at(row + 1, col)], table[at(row, col + 1)])
    }
  }

  const ops: LineOp[] = []
  let row = 0
  let col = 0
  while (row < rows && col < cols) {
    if (oldLines[row] === newLines[col]) {
      ops.push({ type: 'same', text: oldLines[row] })
      row += 1
      col += 1
    } else if (table[at(row + 1, col)] >= table[at(row, col + 1)]) {
      ops.push({ type: 'del', text: oldLines[row] })
      row += 1
    } else {
      ops.push({ type: 'ins', text: newLines[col] })
      col += 1
    }
  }
  while (row < rows) {
    ops.push({ type: 'del', text: oldLines[row] })
    row += 1
  }
  while (col < cols) {
    ops.push({ type: 'ins', text: newLines[col] })
    col += 1
  }
  return ops
}

// 相邻的删除段+插入段按位置配对成「修改」；配不上的保持删除/新增
function pairModifiedRuns(ops: LineOp[]): Pick<WorldDraftTextDiff, 'existingLines' | 'incomingLines'> {
  const existingLines: WorldDraftDiffLine[] = []
  const incomingLines: WorldDraftDiffLine[] = []
  let index = 0
  while (index < ops.length) {
    const op = ops[index]
    if (op.type === 'same') {
      existingLines.push({ text: op.text, kind: 'same' })
      incomingLines.push({ text: op.text, kind: 'same' })
      index += 1
      continue
    }
    const dels: string[] = []
    const inss: string[] = []
    while (index < ops.length && ops[index].type !== 'same') {
      if (ops[index].type === 'del') dels.push(ops[index].text)
      else inss.push(ops[index].text)
      index += 1
    }
    const pairedCount = Math.min(dels.length, inss.length)
    dels.forEach((text, delIndex) => {
      existingLines.push({ text, kind: delIndex < pairedCount ? 'modified' : 'removed' })
    })
    inss.forEach((text, insIndex) => {
      incomingLines.push({ text, kind: insIndex < pairedCount ? 'modified' : 'added' })
    })
  }
  return { existingLines, incomingLines }
}

// 编译页字段（摘要/标签/关系）的整块变更标记：库版空→新增，两边不同→修改
export function diffWorldDraftField(existingValue: string, incomingValue: string): 'same' | 'added' | 'modified' {
  const oldText = String(existingValue ?? '').trim()
  const newText = String(incomingValue ?? '').trim()
  if (oldText === newText) return 'same'
  if (!oldText && newText) return 'added'
  return 'modified'
}
