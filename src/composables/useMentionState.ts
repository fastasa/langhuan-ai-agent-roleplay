import { computed, ref } from 'vue'

interface UseMentionStateOptions {
  getCharacters: () => any[]
  getCurrentTarget: () => string
  onExcludedAdd?: () => void
}

export function useMentionState(options: UseMentionStateOptions) {
  const { getCharacters, getCurrentTarget, onExcludedAdd } = options

  const atMenuOpen = ref(false)
  const atSearchText = ref('')
  const mentionSelectedChars = ref<string[]>([])
  const mentionExcludedChars = ref<string[]>([])

  const filteredAtCharacters = computed(() => {
    let chars = getCharacters() || []
    const target = getCurrentTarget()
    if (target) {
      chars = chars.filter((char: any) => char.id !== target)
    }
    const keyword = atSearchText.value.trim().toLowerCase()
    if (!keyword) return chars
    return chars.filter((c: any) => String(c.name || '').toLowerCase().includes(keyword))
  })

  function getCharNameById(charId: string): string {
    const char = (getCharacters() || []).find((c: any) => c.id === charId)
    return char ? char.name : '未知'
  }

  function addMentionChar(charId: string): void {
    if (mentionExcludedChars.value.includes(charId)) {
      onExcludedAdd?.()
      return
    }
    mentionSelectedChars.value.push(charId)
  }

  function removeMentionChar(index: number): void {
    mentionSelectedChars.value.splice(index, 1)
  }

  function toggleExcludeChar(charId: string): void {
    const idx = mentionExcludedChars.value.indexOf(charId)
    if (idx > -1) {
      mentionExcludedChars.value.splice(idx, 1)
      return
    }
    mentionExcludedChars.value.push(charId)
    const selIdx = mentionSelectedChars.value.indexOf(charId)
    if (selIdx > -1) {
      mentionSelectedChars.value.splice(selIdx, 1)
    }
  }

  return {
    atMenuOpen,
    atSearchText,
    mentionSelectedChars,
    mentionExcludedChars,
    filteredAtCharacters,
    getCharNameById,
    addMentionChar,
    removeMentionChar,
    toggleExcludeChar
  }
}
