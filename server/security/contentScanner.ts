export type ContentRiskLevel = 'none' | 'low' | 'medium' | 'high'

export type ContentScanMatch = {
  ruleId: string
  label: string
  riskLevel: ContentRiskLevel
  start: number
  end: number
  preview: string
}

export type ContentScanResult = {
  status: 'scanned'
  riskLevel: ContentRiskLevel
  matches: ContentScanMatch[]
  scannedAt: string
}

type ScanRule = {
  ruleId: string
  label: string
  riskLevel: ContentRiskLevel
  pattern: RegExp
}

const MAX_MATCHES_PER_RULE = 10
const PREVIEW_PADDING = 12

const SCAN_RULES: ScanRule[] = [
  {
    ruleId: 'cn_mobile',
    label: '疑似手机号',
    riskLevel: 'medium',
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g
  },
  {
    ruleId: 'cn_id_card',
    label: '疑似身份证号',
    riskLevel: 'high',
    pattern: /(?<![0-9A-Za-z])\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?![0-9A-Za-z])/g
  },
  {
    ruleId: 'api_key_like',
    label: '疑似 API Key 或 Token',
    riskLevel: 'high',
    pattern: /\b(?:sk|ak|api[_-]?key|token|secret|password|passwd|pwd)[_\-:=\s'"]{0,8}[A-Za-z0-9_\-]{20,}\b/gi
  },
  {
    ruleId: 'bearer_token',
    label: '疑似 Bearer Token',
    riskLevel: 'high',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi
  },
  {
    ruleId: 'private_key',
    label: '疑似私钥',
    riskLevel: 'high',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g
  },
  {
    ruleId: 'sensitive_word_basic',
    label: '基础敏感词',
    riskLevel: 'low',
    pattern: /(?:身份证|银行卡|手机号|密码|密钥|token|api key|secret)/gi
  }
]

function rankRiskLevel(value: ContentRiskLevel) {
  if (value === 'high') return 3
  if (value === 'medium') return 2
  if (value === 'low') return 1
  return 0
}

function maxRiskLevel(matches: ContentScanMatch[]): ContentRiskLevel {
  return matches.reduce<ContentRiskLevel>((current, match) => (
    rankRiskLevel(match.riskLevel) > rankRiskLevel(current) ? match.riskLevel : current
  ), 'none')
}

function buildPreview(text: string, start: number, end: number) {
  const from = Math.max(0, start - PREVIEW_PADDING)
  const to = Math.min(text.length, end + PREVIEW_PADDING)
  return text.slice(from, to).replace(/\s+/g, ' ').trim()
}

export function scanTextForSensitiveContent(input: unknown): ContentScanResult {
  const text = String(input || '')
  const matches: ContentScanMatch[] = []

  for (const rule of SCAN_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)
    let count = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) && count < MAX_MATCHES_PER_RULE) {
      const raw = match[0] || ''
      const start = match.index
      const end = start + raw.length
      matches.push({
        ruleId: rule.ruleId,
        label: rule.label,
        riskLevel: rule.riskLevel,
        start,
        end,
        preview: buildPreview(text, start, end)
      })
      count += 1
      if (!raw) pattern.lastIndex += 1
    }
  }

  return {
    status: 'scanned',
    riskLevel: maxRiskLevel(matches),
    matches,
    scannedAt: new Date().toISOString()
  }
}

export function summarizeScanMatches(matches: ContentScanMatch[]) {
  if (!matches.length) return '未命中'
  return matches
    .slice(0, 5)
    .map((match) => `${match.label}@${match.start}-${match.end}`)
    .join('；')
}
