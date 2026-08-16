export interface RelevantNarrativeSeedSummary {
  id: string
  type: string
  title: string
  currentProgress: string
  expectedOutcome: string
  startTime: string
  locationText: string
  impactScope: string
  status: string
  allowFrontstage: boolean
  knowledgeBoundary: string
  currentCurtainTime?: string
  overdueByMs?: number
  relevanceScore: number
  relevanceReasons: string[]
}

export interface RelevantNarrativeSeedBundle {
  worldId: string
  sessionId: string
  deterministic: boolean
  scannedCount: number
  items: RelevantNarrativeSeedSummary[]
}

function line(value: unknown, maxLength = 240): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function formatElapsedDuration(value: unknown): string {
  const ms = Math.max(0, Number(value) || 0)
  if (!ms) return ''
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return [days ? `${days}天` : '', hours ? `${hours}小时` : '', minutes ? `${minutes}分钟` : '']
    .filter(Boolean)
    .join('') || '不足1分钟'
}

/**
 * 给提调的是经过硬代码筛选的候选判断，不是已发生事实。
 * 完整描述、因果和关系只允许通过 readNarrativeSeed 按 id 展开。
 */
export function renderRelevantNarrativeSeedsBlock(bundle: RelevantNarrativeSeedBundle | null | undefined): string {
  const items = Array.isArray(bundle?.items) ? bundle!.items : []
  if (!items.length) {
    return [
      '〔本轮相关叙事种子·候选判断〕',
      '硬代码没有筛到与当前时间、帷幕地点或参与者相关的种子。这里为空不代表世界没有种子；不得回退到其它世界或把远处种子硬拉进本轮。'
    ].join('\n')
  }
  return [
    '〔本轮相关叙事种子·候选判断〕',
    '以下条目是本轮可能相关的既有因果线，不是已发生事实，也不是要求照着演的固定路线。先看知情边界；需要完整因果、参与者或关系时，用 readNarrativeSeed 按 id 展开。ready_to_trigger（待引爆）证明帷幕时间已越过开始时间：预期后果仍需核证，但原种子必须在本轮结算并退出该状态，不能原样留到下一轮。',
    ...items.map((item, index) => {
      const timing = item.startTime ? `开始 ${line(item.startTime, 80)}` : ''
      const progress = line(item.currentProgress || item.expectedOutcome, 180)
      const elapsed = item.status === 'ready_to_trigger' ? formatElapsedDuration(item.overdueByMs) : ''
      const readyDirective = item.status === 'ready_to_trigger'
        ? '｜本轮硬要求：先读完整种子，按已越过时长核定对世界、人物状态或后继种子的实际影响；可感知部分安排进旁白或角色方向，后台部分写入正式进展，并用 updateNarrativeSeed 让原种子退出 ready_to_trigger'
        : ''
      return `${index + 1}. ${line(item.title, 100)}（id: ${item.id}）｜状态：${item.status === 'ready_to_trigger' ? '待引爆' : line(item.status, 60)}｜${item.knowledgeBoundary}｜相关原因：${item.relevanceReasons.join('、') || '未说明'}${item.locationText ? `｜地点：${line(item.locationText, 100)}` : ''}${timing ? `｜时间：${timing}` : ''}${elapsed ? `｜已越过：${elapsed}` : ''}${item.currentCurtainTime ? `｜当前帷幕：${line(item.currentCurtainTime, 80)}` : ''}${progress ? `｜当前线索：${progress}` : ''}${readyDirective}`
    })
  ].join('\n')
}

export function renderNarrativeSeedDetail(seed: Record<string, any>): string {
  const participants = Array.isArray(seed?.participants) ? seed.participants : []
  const links = Array.isArray(seed?.links) ? seed.links : []
  const visibility = seed?.visibility && typeof seed.visibility === 'object' ? seed.visibility : {}
  return [
    `叙事种子：${line(seed?.title, 120)}（id: ${line(seed?.id, 160)}）`,
    `状态：${line(seed?.status, 60)}；类型：${line(seed?.type, 60)}；版本：${Number(seed?.version || 0)}`,
    `描述：${line(seed?.description, 1200) || '未记录'}`,
    `起因：${line(seed?.cause, 600) || '未记录'}`,
    `当前进展：${line(seed?.currentProgress, 600) || '未记录'}`,
    `预期后果：${line(seed?.expectedOutcome, 600) || '未记录'}`,
    `开始时间：${line(seed?.startTime, 100) || '未记录'}；超过该时间后由编剧根据现有因果与进展判断，不读取预写的无人干预后果。`,
    `地点：${line(seed?.locationText, 300) || '未记录'}；影响范围：${line(seed?.impactScope, 300) || '未记录'}；精确要素=${line(seed?.mapFeatureId, 160) || '无'}；图纸由会话世界自动绑定。`,
    `参与者：${participants.length ? participants.map((item: any) => `${line(item.displayName || item.participantId, 100)}[${line(item.relationRole, 60) || 'involved'}]`).join('、') : '未记录'}`,
    `关系：${links.length ? links.map((item: any) => `${line(item.relationType, 60)}→${line(item.targetSeedId, 160)}`).join('、') : '无'}`,
    `知情范围：${line(seed?.visibilityMode, 80)}；允许前台提示=${seed?.allowFrontstage ? '是' : '否'}；已知者=${Array.isArray(visibility.knownByParticipantIds) ? visibility.knownByParticipantIds.join('、') || '无' : '无'}；明确隐藏=${Array.isArray(visibility.hiddenFromParticipantIds) ? visibility.hiddenFromParticipantIds.join('、') || '无' : '无'}`,
    '边界：这是既有世界状态；不得把预期后果当成已发生事实，也不得向不知情角色泄露仅提调可知的信息。'
  ].join('\n')
}
