export type RelationHintBracketCompletion = {
  value: string
  selectionStart: number
  selectionEnd: number
  completed: boolean
}

export function applyRelationHintBracketCompletion(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null
): RelationHintBracketCompletion {
  const text = String(value || '')
  const start = typeof selectionStart === 'number' ? selectionStart : text.length
  const end = typeof selectionEnd === 'number' ? selectionEnd : start
  if (start !== end || start < 2) {
    return { value: text, selectionStart: start, selectionEnd: end, completed: false }
  }
  if (text.slice(start - 2, start) !== '[[' || text.slice(start, start + 2) === ']]') {
    return { value: text, selectionStart: start, selectionEnd: end, completed: false }
  }
  return {
    value: `${text.slice(0, start)}]]${text.slice(start)}`,
    selectionStart: start,
    selectionEnd: start,
    completed: true
  }
}
