/**
 * 装甲地图系统 · 端到端编排（批A2·2026-07-13 装甲地图系统计划书）。
 *
 * 数据流：拉舆图 bundle → 由当前内容派生任务工作框并收集既有水域/山体（点阵禁区来源）→ 生成点阵投影 →
 * 派装甲画师（armorPainter.ts）出一条骨架笔画 → 骨架转世界坐标 → 生成本次 seed → 装甲展开
 * （mountainArmor.ts，2~3 层嵌套 region）→ 组装 world_map_features 写库条目 → 批量落库
 * （saveWorldMapFeaturesRemote 会自动 bumpWorldMapRevision，地图弹窗因此自动刷新）。
 *
 * ⚠️meta.armor.params 存的是"本次实际传给 expandMountainArmor 的那个（可能残缺的）params 对象"，
 * 不是 expandMountainArmor 返回的 resolvedParams——见 mountainArmor.ts/types.ts 里写清楚的原因：
 * peakElevationM/baseWidthM 缺省时靠 `params.x ?? 随机表达式` 补参，缺省字段才会消耗一次 rng()；
 * resolvedParams 把全部字段填成显式数值，重新传入会让这些字段短路跳过 rng() 消耗，rng 游标错位，
 * 重新展开出的坐标会变（不是逐字节复现）。「以能重现为准」= 必须存本次真正传入的那份 params，不能存
 * resolvedParams——这是装甲计划书任务书里明确交给本批判断的取舍点，已实测验证（见 mapArmor.spec.js）。
 */

import { fetchWorldMapBundle, saveWorldMapFeaturesRemote } from '../../repositories/chatRepository'
import { polygonsOverlap, type MapPoint } from '../mapGeometry'
import {
  buildMapDraftReviewItem,
  createMapSheetRevision,
  runMapDraftReviewGate,
  type ReviewMapDraft
} from '../mapDraftReview'
import {
  resolveMapTaskPlacement,
  validatePointSetsInTaskPlacement,
  type MapTaskPlacementRequest
} from '../mapTaskPlacement'
import { buildMountainDotMatrix, strokeToWorldSkeleton } from './dotMatrix'
import { expandGrassArmor } from './grassArmor'
import { expandMountainArmor } from './mountainArmor'
import { runArmorPainter, type ArmorPainterCallModel } from './armorPainter'
import type { MapDrawTrace } from './types'

/** 星依浮坞运行卡子agent前缀（与 huiyuSubagent.ts 的 HUIYU_SUBAGENT_ID_PREFIX 同一套用法：
 *  subagentId = `${ARMOR_SUBAGENT_ID_PREFIX}:${taskKey}`，供 subagentRunStatus 按键登记）。 */
export const ARMOR_SUBAGENT_ID_PREFIX = 'armor'

/** 地貌任务书 → 运行卡 input 原文（首行【地貌任务】供 extractArmorTaskTitle 解析，
 *  与 huiyuSubagent.renderHuiyuBrief 同构写法，供浮坞子agent运行卡标题提取复用）。 */
export function renderArmorBrief(input: { task: string; instructions: string; focus?: string }): string {
  const lines = [`【地貌任务】${String(input.task || '').trim()}`, '', '【任务书】', String(input.instructions || '').trim()]
  const focus = String(input.focus || '').trim()
  if (focus) lines.push('', `【建议方向】${focus}`)
  return lines.join('\n')
}

/** 从运行卡 input 原文提取任务标题（浮坞 SubagentDispatchCardSource.extractTitle 消费）。 */
export function extractArmorTaskTitle(input: string | undefined): string {
  const firstLine = String(input || '').split('\n', 1)[0] || ''
  const match = firstLine.match(/^【地貌任务】(.*)$/)
  return match ? match[1].trim() : ''
}

export interface RunMountainArmorWorkDeps {
  /** 测试注入点：缺省=真实 fetchWorldMapBundle。 */
  fetchBundle?: typeof fetchWorldMapBundle
  /** 测试注入点：缺省=真实 saveWorldMapFeaturesRemote。 */
  saveFeatures?: typeof saveWorldMapFeaturesRemote
  /** 星依 UI 注入的最终矢量审阅门；缺省为空时保留底层直接写入能力。 */
  reviewDraft?: ReviewMapDraft
}

export interface RunMountainArmorWorkResult {
  ok: boolean
  /** 人话摘要（成功=展开摘要+落库件数；失败时为空串，原因在 error）。 */
  summary: string
  /** 本次装甲组 id（成功才有，供回执/历史面板核对）。 */
  groupId?: string
  trace?: MapDrawTrace
  error?: string
  reviewStatus?: 'confirmed' | 'modify' | 'deleted' | 'cancelled' | 'stale'
  reviewFeedback?: string
}

export interface RunGrassArmorWorkInput {
  worldId: string
  name?: string
  /** 相对当前内容工作框中心的偏移，单位米。 */
  offsetXM?: number
  offsetYM?: number
  widthM?: number
  heightM?: number
  shape?: 'exact' | 'organic'
  ruggedness?: number
  seed?: number
  placement?: MapTaskPlacementRequest
  deps?: RunMountainArmorWorkDeps
}

/** 一次调用画一座山脉：读图 → 点阵投影 → 装甲画师出骨架 → 代码展开 → 批量落库。
 *  永不抛错——网络/校验/落库失败都会被捕获成 {ok:false}，调用方按结果分支处理。 */
export async function runMountainArmorWork(input: {
  worldId: string
  task: string
  callModel: ArmorPainterCallModel
  placement?: MapTaskPlacementRequest
  deps?: RunMountainArmorWorkDeps
}): Promise<RunMountainArmorWorkResult> {
  const fetchBundle = input.deps?.fetchBundle ?? fetchWorldMapBundle
  const saveFeatures = input.deps?.saveFeatures ?? saveWorldMapFeaturesRemote

  let bundle: Awaited<ReturnType<typeof fetchWorldMapBundle>>
  try {
    bundle = await fetchBundle(input.worldId)
  } catch (error) {
    return { ok: false, summary: '', error: `读取舆图失败：${(error as Error)?.message || String(error)}` }
  }

  const sheet = bundle.sheets?.[0]
  if (!sheet) {
    return { ok: false, summary: '', error: '这个世界还没有舆图图纸，请先在舆图弹窗创建一张图纸再来画山。' }
  }
  const baseRevision = createMapSheetRevision(sheet)
  const waterRegions: MapPoint[][] = []
  const mountainRegions: MapPoint[][] = []
  for (const feature of sheet.features || []) {
    if (feature.kind !== 'region' || !feature.geometry?.pts?.length) continue
    if (feature.category === 'water') waterRegions.push(feature.geometry.pts as MapPoint[])
    else if (feature.category === 'mountain') mountainRegions.push(feature.geometry.pts as MapPoint[])
  }
  let placement: ReturnType<typeof resolveMapTaskPlacement>
  try {
    placement = resolveMapTaskPlacement({
      features: (sheet.features || []).map((feature) => ({
        id: String(feature.id), name: String(feature.name || ''), kind: feature.kind as 'region' | 'path' | 'marker',
        category: String(feature.category || ''), pts: (feature.geometry?.pts || []) as MapPoint[]
      })),
      request: input.placement
    })
  } catch (error) {
    return { ok: false, summary: '', error: `作画任务域无效：${(error as Error)?.message || String(error)}` }
  }
  const taskFrame = placement.frame
  // 缺省山宽最高约脊线长 25%，ruggedness 还会把单侧半宽放大约 20%；预留短边 12% 可覆盖这一上界。
  // 模型若显式给出更宽 baseWidthM，最终几何硬校验仍会兜住，绝不静默裁切或越域落库。
  const armorClearanceM = Math.min(taskFrame.widthM, taskFrame.heightM) * 0.12
  const trace: MapDrawTrace = {
    version: 1,
    kind: 'mountain-armor',
    steps: [{ key: 'task-frame', label: '作画任务域', status: 'success', data: { placement, armorClearanceM } }]
  }

  let projection: ReturnType<typeof buildMountainDotMatrix>
  try {
    projection = buildMountainDotMatrix({
      framePts: taskFrame.pts,
      waterRegions,
      mountainRegions,
      containmentRegion: placement.containmentRegion,
      clearanceM: armorClearanceM
    })
    trace.steps.push({
      key: 'dot-matrix', label: '点阵投影', status: 'success',
      data: { spec: projection.spec, text: projection.text, waterObstacleCount: waterRegions.length, mountainObstacleCount: mountainRegions.length }
    })
  } catch (error) {
    const message = `点阵投影生成失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'dot-matrix', label: '点阵投影', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }

  const paint = await runArmorPainter({ task: input.task, projection, callModel: input.callModel })
  trace.steps.push({ key: 'model-output', label: '模型原文、归一化命令与逐次校验', status: paint.ok ? 'success' : 'error', data: paint.attemptTrace })
  if (!paint.ok || !paint.strokes?.length) {
    return { ok: false, summary: '', error: paint.error || '地貌师未能产出合法笔画', trace }
  }

  const skeleton = strokeToWorldSkeleton(paint.strokes[0], projection.spec)
  trace.steps.push({ key: 'world-skeleton', label: '世界坐标骨架', status: 'success', data: skeleton })
  // seed 在编排入口生成一次、随本次结果一起存进真值（meta.armor.seed）——展开层本身禁止用
  // Math.random，但"选一个 seed"这件事恰恰只能发生在纯函数外部，这里是唯一合法落点。
  const seed = Math.floor(Math.random() * 0x7fffffff)
  const groupId = `armor-${seed}-${Math.random().toString(36).slice(2, 8)}`
  // 本次实际传给 expandMountainArmor 的 params（可能残缺）——重现基准，见文件头注释。
  const usedParams = paint.params || {}
  const expansion = expandMountainArmor(skeleton, usedParams, seed)
  trace.steps.push({
    key: 'armor-expansion', label: '代码生成地貌', status: 'success',
    data: { seed, inputParams: usedParams, resolvedParams: expansion.resolvedParams, features: expansion.features }
  })
  const placementCheck = validatePointSetsInTaskPlacement(expansion.features.map((feature) => feature.pts), placement)
  const base = expansion.features[0]?.pts || []
  const obstacleKind = waterRegions.find((region) => polygonsOverlap(base, region))
    ? '已有水域'
    : mountainRegions.find((region) => polygonsOverlap(base, region)) ? '已有山体' : ''
  if (!placementCheck.ok || obstacleKind) {
    const reason = placementCheck.reason || `最终山体与${obstacleKind}重叠`
    trace.steps.push({ key: 'final-geometry-validation', label: '最终地貌占地校验', status: 'error', data: { reason } })
    return { ok: false, summary: '', error: `最终地貌占地校验失败：${reason}。本次没有写入地图。`, trace }
  }
  trace.steps.push({
    key: 'final-geometry-validation', label: '最终地貌占地校验', status: 'success',
    data: { mode: placement.mode, anchor: placement.anchor, featureCount: expansion.features.length }
  })
  const mountainName = paint.name || '新山脉'

  trace.steps.push({ key: 'save-validation', label: '落库前校验', status: 'success', data: { featureCount: expansion.features.length, sheetId: sheet.id, groupId } })
  const armorMeta = { armor: { type: 'mountain', skeleton, params: usedParams, seed, groupId, placement }, drawTrace: trace }
  const items = expansion.features.map((draft) => ({
    sheetId: sheet.id,
    kind: draft.kind,
    category: draft.category,
    name: `${mountainName}·${draft.name}`,
    layer: draft.layer,
    geometry: {
      pts: draft.pts,
      ...(draft.spine ? { spine: draft.spine } : {}),
      elevationM: draft.elevationM
    },
    // 装甲展开本身已经给出最终碎折边界；禁止正式渲染再按服务端随机 id 二次粗糙化，确保审阅态与成图一致。
    style: { rough: { iter: 0, amp: 0 } },
    meta: armorMeta
  }))

  if (input.deps?.reviewDraft) {
    const reviewId = `terrain:${groupId}`
    const request = {
      kind: 'map-final-draft-review' as const,
      worldId: input.worldId,
      sheetId: sheet.id,
      baseRevision,
      title: `确认山脉「${mountainName}」的最终落笔`,
      items: [buildMapDraftReviewItem({
        id: reviewId,
        label: mountainName,
        category: 'mountain',
        kind: 'region',
        change: `新增 ${items.length} 层联动山体；当前形状、范围与海拔层就是确认后的成图`,
        basis: '已通过点阵骨架、任务域、障碍重叠与最终占地校验',
        features: items
      })]
    }
    let gate: Awaited<ReturnType<typeof runMapDraftReviewGate>>
    try {
      gate = await runMapDraftReviewGate({
        request,
        review: input.deps.reviewDraft,
        reloadSheet: async () => {
          const fresh = await fetchBundle(input.worldId)
          return fresh.sheets?.find((candidate) => candidate.id === sheet.id) || null
        }
      })
    } catch (error) {
      const message = `最终草稿审阅失败：${(error as Error)?.message || String(error)}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'error', data: { error: message } })
      return { ok: false, summary: '', error: message, trace }
    }
    if (gate.status !== 'submitted') {
      const message = gate.status === 'cancelled'
        ? '已取消这次最终草稿，地图没有写入。'
        : gate.status === 'stale' ? gate.error : gate.error
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: gate.status === 'cancelled' ? 'success' : 'error', data: { status: gate.status, message } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: gate.status === 'stale' ? 'stale' : 'cancelled' }
    }
    if (gate.decision.modified.includes(reviewId)) {
      const feedback = String(gate.decision.comments[reviewId] || '').trim()
      const message = `用户要求修改「${mountainName}」：${feedback}。当前草稿已丢弃，地图没有写入。`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'modify', feedback } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: 'modify', reviewFeedback: feedback }
    }
    if (gate.decision.deleted.includes(reviewId)) {
      const note = String(gate.decision.notes?.[reviewId] || '').trim()
      const message = `已删除山脉草稿「${mountainName}」，地图没有写入。${note ? ` 备注：${note}` : ''}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'deleted' } })
      return { ok: false, summary: message, trace, reviewStatus: 'deleted' }
    }
    const itemNote = String(gate.decision.notes?.[reviewId] || '').trim()
    items.forEach((item) => Object.assign(item.meta, {
      draftReview: {
        decision: 'confirmed',
        ...(itemNote ? { note: itemNote } : {}),
        ...(gate.decision.note ? { overallNote: gate.decision.note } : {})
      }
    }))
    trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'confirmed' } })
  }

  try {
    await saveFeatures(input.worldId, items, {
      runKey: `armor-${groupId}`,
      runLabel: `地貌绘制·${mountainName}`
    })
  } catch (error) {
    const message = `落库失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'save-result', label: '落库结果', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }

  const summary = `${expansion.summary} · 山名「${mountainName}」 · 落库 ${items.length} 件`
  trace.steps.push({ key: 'save-result', label: '落库结果', status: 'success', data: { summary, featureCount: items.length } })
  return { ok: true, summary, groupId, trace, ...(input.deps?.reviewDraft ? { reviewStatus: 'confirmed' as const } : {}) }
}

/** 一次调用画一片草原：工作框定位 → 参数装甲展开 → 只落一个 grass region。 */
export async function runGrassArmorWork(input: RunGrassArmorWorkInput): Promise<RunMountainArmorWorkResult> {
  const fetchBundle = input.deps?.fetchBundle ?? fetchWorldMapBundle
  const saveFeatures = input.deps?.saveFeatures ?? saveWorldMapFeaturesRemote
  let bundle: Awaited<ReturnType<typeof fetchWorldMapBundle>>
  try {
    bundle = await fetchBundle(input.worldId)
  } catch (error) {
    return { ok: false, summary: '', error: `读取舆图失败：${(error as Error)?.message || String(error)}` }
  }
  const sheet = bundle.sheets?.[0]
  if (!sheet) return { ok: false, summary: '', error: '这个世界还没有舆图图纸，请先在舆图弹窗创建一张图纸再来画草原。' }
  const baseRevision = createMapSheetRevision(sheet)

  let placement: ReturnType<typeof resolveMapTaskPlacement>
  try {
    placement = resolveMapTaskPlacement({
      features: (sheet.features || []).map((feature) => ({
        id: String(feature.id), name: String(feature.name || ''), kind: feature.kind as 'region' | 'path' | 'marker',
        category: String(feature.category || ''), pts: (feature.geometry?.pts || []) as MapPoint[]
      })),
      request: {
        ...(input.placement || {}),
        ...(Number.isFinite(Number(input.offsetXM)) ? { offsetXM: Number(input.offsetXM) } : {}),
        ...(Number.isFinite(Number(input.offsetYM)) ? { offsetYM: Number(input.offsetYM) } : {})
      }
    })
  } catch (error) {
    return { ok: false, summary: '', error: `作画任务域无效：${(error as Error)?.message || String(error)}` }
  }
  const taskFrame = placement.frame
  const trace: MapDrawTrace = { version: 1, kind: 'grass-armor', steps: [{ key: 'task-frame', label: '作画任务域', status: 'success', data: { placement } }] }
  const baseSpan = Math.max(taskFrame.widthM, taskFrame.heightM)
  const widthM = Number(input.widthM ?? baseSpan * 0.3)
  const heightM = Number(input.heightM ?? widthM)
  const center: MapPoint = [
    taskFrame.center[0],
    taskFrame.center[1]
  ]
  const seed = Number.isFinite(Number(input.seed)) ? Math.trunc(Number(input.seed)) : Math.floor(Math.random() * 0x7fffffff)
  const groupId = `armor-grass-${seed}-${Math.random().toString(36).slice(2, 8)}`
  let expansion: ReturnType<typeof expandGrassArmor>
  try {
    expansion = expandGrassArmor({ center, widthM, heightM, shape: input.shape, ruggedness: input.ruggedness }, seed)
  } catch (error) {
    const message = `草原地貌参数无效：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'armor-expansion', label: '草原参数与代码展开', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  trace.steps.push({ key: 'armor-expansion', label: '草原参数与代码展开', status: 'success', data: { seed, resolvedParams: expansion.resolvedParams, feature: expansion.feature } })
  const placementCheck = validatePointSetsInTaskPlacement([expansion.feature.pts], placement)
  if (!placementCheck.ok) {
    trace.steps.push({ key: 'final-geometry-validation', label: '最终地貌占地校验', status: 'error', data: placementCheck })
    return { ok: false, summary: '', error: `最终地貌占地校验失败：${placementCheck.reason}。本次没有写入地图。`, trace }
  }
  trace.steps.push({ key: 'final-geometry-validation', label: '最终地貌占地校验', status: 'success', data: { mode: placement.mode, anchor: placement.anchor } })
  const name = String(input.name || '').trim() || '新草原'
  const item = {
    sheetId: sheet.id,
    kind: expansion.feature.kind,
    category: expansion.feature.category,
    name,
    layer: expansion.feature.layer,
    geometry: { pts: expansion.feature.pts, elevationM: expansion.feature.elevationM },
    style: { rough: { iter: 0, amp: 0 } },
    meta: {
      armor: {
        type: 'grass',
        params: { center, widthM, heightM, shape: input.shape, ruggedness: input.ruggedness },
        resolvedParams: expansion.resolvedParams,
        seed,
        groupId,
        placement
      },
      drawTrace: trace
    }
  }
  if (input.deps?.reviewDraft) {
    const reviewId = `terrain:${groupId}`
    const request = {
      kind: 'map-final-draft-review' as const,
      worldId: input.worldId,
      sheetId: sheet.id,
      baseRevision,
      title: `确认草原「${name}」的最终落笔`,
      items: [buildMapDraftReviewItem({
        id: reviewId,
        label: name,
        category: 'grass',
        kind: 'region',
        change: '新增一片草原；当前轮廓与范围就是确认后的成图',
        basis: '已通过参数展开、任务域与最终占地校验',
        features: [item]
      })]
    }
    let gate: Awaited<ReturnType<typeof runMapDraftReviewGate>>
    try {
      gate = await runMapDraftReviewGate({
        request,
        review: input.deps.reviewDraft,
        reloadSheet: async () => {
          const fresh = await fetchBundle(input.worldId)
          return fresh.sheets?.find((candidate) => candidate.id === sheet.id) || null
        }
      })
    } catch (error) {
      const message = `最终草稿审阅失败：${(error as Error)?.message || String(error)}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'error', data: { error: message } })
      return { ok: false, summary: '', error: message, trace }
    }
    if (gate.status !== 'submitted') {
      const message = gate.status === 'cancelled' ? '已取消这次最终草稿，地图没有写入。' : gate.error
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: gate.status === 'cancelled' ? 'success' : 'error', data: { status: gate.status, message } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: gate.status === 'stale' ? 'stale' : 'cancelled' }
    }
    if (gate.decision.modified.includes(reviewId)) {
      const feedback = String(gate.decision.comments[reviewId] || '').trim()
      const message = `用户要求修改「${name}」：${feedback}。当前草稿已丢弃，地图没有写入。`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'modify', feedback } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: 'modify', reviewFeedback: feedback }
    }
    if (gate.decision.deleted.includes(reviewId)) {
      const note = String(gate.decision.notes?.[reviewId] || '').trim()
      const message = `已删除草原草稿「${name}」，地图没有写入。${note ? ` 备注：${note}` : ''}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'deleted' } })
      return { ok: false, summary: message, trace, reviewStatus: 'deleted' }
    }
    const itemNote = String(gate.decision.notes?.[reviewId] || '').trim()
    Object.assign(item.meta, {
      draftReview: {
        decision: 'confirmed',
        ...(itemNote ? { note: itemNote } : {}),
        ...(gate.decision.note ? { overallNote: gate.decision.note } : {})
      }
    })
    trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'confirmed' } })
  }
  try {
    trace.steps.push({ key: 'save-validation', label: '落库前校验', status: 'success', data: { featureCount: 1, sheetId: sheet.id, groupId } })
    await saveFeatures(input.worldId, [item], { runKey: `armor-${groupId}`, runLabel: `地貌绘制·${name}` })
  } catch (error) {
    const message = `落库失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'save-result', label: '落库结果', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  const summary = `${expansion.summary} · 草原「${name}」 · 落库 1 件`
  trace.steps.push({ key: 'save-result', label: '落库结果', status: 'success', data: { summary, featureCount: 1 } })
  return { ok: true, summary, groupId, trace, ...(input.deps?.reviewDraft ? { reviewStatus: 'confirmed' as const } : {}) }
}
