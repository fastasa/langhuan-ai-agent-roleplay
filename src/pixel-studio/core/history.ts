import { cloneDocument } from './model'
import { PixelDocument } from './types'

export interface PixelHistory {
  /** 记录一份快照（通常在编辑前调用，传入编辑前的文档），会清空 redo 栈 */
  push(doc: PixelDocument): void
  /** 撤销：把 current 压入 redo 栈，弹出并返回上一份快照；栈空返回 null */
  undo(current: PixelDocument): PixelDocument | null
  /** 重做：把 current 压入 undo 栈，弹出并返回下一份快照；栈空返回 null */
  redo(current: PixelDocument): PixelDocument | null
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}

/** 快照式撤销/重做栈：文档很小（≤512²），直接深拷贝整份文档，无需增量 diff */
export function createHistory(limit = 100): PixelHistory {
  let undoStack: PixelDocument[] = []
  let redoStack: PixelDocument[] = []

  return {
    push(doc: PixelDocument): void {
      undoStack.push(cloneDocument(doc))
      if (undoStack.length > limit) {
        undoStack.shift()
      }
      // 新编辑发生，redo 历史失效
      redoStack = []
    },
    undo(current: PixelDocument): PixelDocument | null {
      const prev = undoStack.pop()
      if (!prev) {
        return null
      }
      redoStack.push(cloneDocument(current))
      return prev
    },
    redo(current: PixelDocument): PixelDocument | null {
      const next = redoStack.pop()
      if (!next) {
        return null
      }
      undoStack.push(cloneDocument(current))
      return next
    },
    canUndo(): boolean {
      return undoStack.length > 0
    },
    canRedo(): boolean {
      return redoStack.length > 0
    },
    clear(): void {
      undoStack = []
      redoStack = []
    }
  }
}
