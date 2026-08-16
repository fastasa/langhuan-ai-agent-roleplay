export interface StrictMentionCandidate {
  id: string
  name: string
  nicknames?: string[] | string
  kind?: 'formal' | 'sessionTemporary'
}

export interface StrictMentionMatch {
  candidate: StrictMentionCandidate
  label: string
  atIndex: number
  endIndex: number
}

function normalizeNicknameList(value: StrictMentionCandidate['nicknames']): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }
  return String(value || '')
    .split(/[,\n，、]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function buildLabels(candidate: StrictMentionCandidate): string[] {
  const labels = [String(candidate.name || '').trim(), ...normalizeNicknameList(candidate.nicknames)]
    .filter(Boolean)
  return [...new Set(labels)]
}

function isMentionBoundary(text: string, index: number): boolean {
  return index >= text.length || /\s/.test(text[index] || '')
}

function compareCandidateLabel(
  a: { candidate: StrictMentionCandidate; label: string },
  b: { candidate: StrictMentionCandidate; label: string }
): number {
  const labelDiff = b.label.length - a.label.length
  if (labelDiff !== 0) return labelDiff
  if (a.candidate.kind === 'formal' && b.candidate.kind !== 'formal') return -1
  if (a.candidate.kind !== 'formal' && b.candidate.kind === 'formal') return 1
  return 0
}

export function parseStrictMentions(
  text: string,
  candidates: StrictMentionCandidate[]
): StrictMentionMatch[] {
  const source = String(text || '')
  const entries = (candidates || [])
    .filter(candidate => candidate?.id)
    .flatMap(candidate => buildLabels(candidate).map(label => ({ candidate, label })))
    .sort(compareCandidateLabel)

  const matches: StrictMentionMatch[] = []
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '@') continue
    const contentStart = index + 1
    const match = entries.find(entry => {
      if (!source.startsWith(entry.label, contentStart)) return false
      return isMentionBoundary(source, contentStart + entry.label.length)
    })
    if (!match) continue
    matches.push({
      candidate: match.candidate,
      label: match.label,
      atIndex: index,
      endIndex: contentStart + match.label.length
    })
    index = contentStart + match.label.length - 1
  }

  return matches
}

export interface StrictUnknownMentionMatch {
  label: string
  atIndex: number
  endIndex: number
}

export function parseStrictUnknownMentions(
  text: string,
  candidates: StrictMentionCandidate[] = []
): StrictUnknownMentionMatch[] {
  const source = String(text || '')
  const known = parseStrictMentions(source, candidates)
  const knownIndexes = new Set(known.map((item) => item.atIndex))
  const matches: StrictUnknownMentionMatch[] = []
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '@') continue
    if (knownIndexes.has(index)) continue
    const contentStart = index + 1
    let endIndex = contentStart
    while (endIndex < source.length && !/\s/.test(source[endIndex] || '')) {
      endIndex += 1
    }
    const label = source.slice(contentStart, endIndex).trim()
    if (!label) continue
    if (/[，,。！？!?；;：:“”"‘’'、]/.test(label)) continue
    if (!isMentionBoundary(source, endIndex)) continue
    matches.push({ label, atIndex: index, endIndex })
    index = endIndex - 1
  }
  return matches
}
