/**
 * 星依「派绘舆」工具（地图系统批6·2026-07-11）——自包含工厂范式（仿 xingyiTidiaoDispatchTools 同构）。
 *
 * 与提调的 dispatchMapWork（tidiaoGlobalTools.createDispatchMapWorkTool）同名同构，差异只在会话定位：
 * 提调本身就在某会话里，dispatch 闭包早已知道 sessionId；星依是跨会话的全局语境，需要先经
 * {@link resolveXingyiSessionForCall}（与状态系统/投影工具同一套 session 参数解析）定位目标会话，
 * 再把解析出的完整会话上下文（sessionId+sessionTitle+characterOptions）交给浮坞注入的 dispatch 执行接缝
 * （浮坞侧用 huiyuSubagent.ts 的 buildHuiyuToolset/runHuiyuMapWork/renderHuiyuDispatchOutcome 同构装配，
 * 世界判定=会话未挂世界时如实回报，不算工具错误——与统筹/纠偏两处 buildHuiyuDispatchSeam 同一套优雅降级）。
 *
 * 世界直达（2026-07-13·星依世界寻址批）：用户建了世界但没挂任何会话时，原本星依完全找不到入口（唯一定位链
 * 是「会话→会话所挂世界」）。本批新增 world 参数直达通道——dispatchMapWork 的 world 与 session 二选一
 * （同传 world 优先），跳过会话解析直接对着世界派发；另加 listWorlds（列世界清单）与 readWorldMap
 * （只读格局摘要，零模型调用不派绘舆）两件新工具；2026-07-14 再接 deleteMapFeatures（单删/批删共用，
 * 精确目标 + 确认门 + 装甲组展开）。世界名/worldId 解析（resolveXingyiWorld）与派绘舆的
 * 会话解析同构：先精确 id、再精确名字、最后唯一包含匹配，零命中/多命中都给可读候选清单。
 * world 直达时的宿主会话固定用星依浮坞自身会话（浮坞侧合成，见 XingyiDock.vue dispatchXingyiMapWork
 * 的 world 分支）——运行卡登记、消耗记账、terraform 授权键都挂它，不是目标世界曾经挂过的某个会话。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  resolveXingyiSessionForCall,
  type XingyiSessionContext,
  type XingyiSessionContextSeam
} from './xingyiSessionContext'
import {
  deleteWorldMapFeatureRemote,
  fetchChatSessionBundleById,
  fetchWorldMapBundle
} from '../repositories/chatRepository'
import type { World, WorldMapBundle, WorldMapFeatureRecord } from '../types'
import { validateVectorPrimitiveCategory } from './mapDrawing/vectorPrimitive'
import type { MapExpandDirection, MapPlacementMode } from './mapTaskPlacement'
import { askConfirmWrite, requireConfirmWriteChannel, type ConfirmWriteChannel } from './agentRuntime/interactionContract'
import { bumpTerrainRevision } from './mapTerrainRevision'
import { isCartographerBusyForWorld } from './workspaceAgentScopeState'

/** dispatchMapWork/dispatchToWorld 共用的任务输入形状（world 直达与经会话两条路径完全一致）。 */
export interface XingyiMapWorkTaskInput {
  task: string
  instructions: string
  focus?: string
  /** AI 地图写入口只保留新链路；旧 draft/draw/staged 已冻结。 */
  mode: 'armor' | 'vector'
  terrain?: 'mountain' | 'grass' | 'river' | 'water'
  shape?: 'organic' | 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path'
  category?: string
  name?: string
  radiusKm?: number
  widthKm?: number
  heightKm?: number
  offsetXKm?: number
  offsetYKm?: number
  ruggedness?: number
  sourceFeature?: string
  mouthFeature?: string
  sourceWidthM?: number
  mouthWidthM?: number
  growthExponent?: number
  bankRoughness?: number
  mouthCap?: 'flat' | 'flare'
  mouthFlareRatio?: number
  waterKind?: 'lake' | 'ocean'
  maxDepthM?: number
  shoreShelfRatio?: number
  depthCurve?: number
  waterLayers?: 2 | 3
  connectionGapM?: number
  seed?: number
  pointsKm?: Array<[number, number]>
  /** 缺省 inside：新要素必须留在锚点/当前内容范围；只有用户明确要求拓展时才允许 expand。 */
  placementMode?: MapPlacementMode
  anchorFeature?: string
  direction?: MapExpandDirection
  gapKm?: number
}

/** 派绘舆/读世界地图共用的执行结果形状。 */
export interface XingyiMapWorkOutcome {
  content: string
  ok: boolean
  details?: Record<string, unknown>
}

export interface XingyiMapWorkDispatchContext extends XingyiSessionContextSeam {
  /** 新地图写入口：armor=参数/点阵装甲；vector=结构化基础图元。旧绘舆 draft/draw/staged 不再可达。 */
  dispatch: (session: XingyiSessionContext, input: XingyiMapWorkTaskInput) => Promise<XingyiMapWorkOutcome>
  /** 世界直达执行接缝（2026-07-13·浮坞注入）：跳过会话解析，直接对着已解析好的世界跑一次绘舆作图流程——
   *  与 dispatch 语义完全一致，差异只在浮坞侧不现查会话 world_id，
   *  直接用 worldId；宿主会话固定用星依浮坞自身会话（见本文件头注释）。 */
  dispatchToWorld: (world: { worldId: string; worldName: string }, input: XingyiMapWorkTaskInput) => Promise<XingyiMapWorkOutcome>
  /** 世界清单（2026-07-13·浮坞注入=fetchWorlds）：listWorlds 工具与 dispatchMapWork/readWorldMap 的 world
   *  参数解析共用同一份世界列表。 */
  listWorlds: () => Promise<World[]>
  /** 只读地图格局摘要（2026-07-13·浮坞注入=renderMapSummary(await fetchWorldMapBundle(worldId))）：
   *  纯函数渲染，零模型调用、不派绘舆——readWorldMap 工具专用。 */
  readWorldMapSummary: (worldId: string) => Promise<string>
  /** 地图删除属于破坏性写操作，统一复用星依浮坞的 confirmWrite 硬门。 */
  confirmWrite?: ConfirmWriteChannel
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

function runtimeErrorResult(action: string, error: unknown, acted = false): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    acted,
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

/** 世界名/worldId → 世界解析（2026-07-13）：先精确 worldId，再精确名字，最后唯一包含匹配
 *  （世界名含关键词或关键词含世界名）；零命中/多命中都给可读候选清单。
 *  与 resolveXingyiChatContact（xingyiTidiaoDispatchTools.ts）同一套解析心智，作用对象换成世界。
 *  dispatchMapWork 的 world 参数与 readWorldMap 共用本函数（世界寻址批·2026-07-13）。 */
function resolveXingyiWorld(worlds: World[], rawIdentifier: string): { world: World } | { error: string } {
  const identifier = String(rawIdentifier || '').trim()
  const allNames = worlds.length ? worlds.map((world) => world.name).join('、') : '（当前还没有任何世界）'
  if (!identifier) return { error: `缺少 world（世界名或 worldId）。现有世界：${allNames}` }
  const byId = worlds.find((world) => world.id === identifier)
  if (byId) return { world: byId }
  const exact = worlds.filter((world) => world.name === identifier)
  if (exact.length === 1) return { world: exact[0] }
  if (exact.length > 1) {
    return { error: `「${identifier}」有 ${exact.length} 个同名世界，请改用 worldId 指定：${exact.slice(0, 8).map((world) => `${world.name}(${world.id})`).join('、')}` }
  }
  const partial = worlds.filter((world) => world.name && (world.name.includes(identifier) || identifier.includes(world.name)))
  if (partial.length === 1) return { world: partial[0] }
  if (partial.length > 1) {
    return { error: `「${identifier}」匹配到多个世界，请用完整世界名或 worldId：${partial.slice(0, 8).map((world) => `${world.name}(${world.id})`).join('、')}` }
  }
  return { error: `没有找到世界「${identifier}」。现有世界：${allNames}。可先用 listWorlds 确认准确名字。` }
}

/** world/session → 当前真实 worldId。world 在场时优先；经会话时现查 session.worldId，禁止拿旧 UI 快照猜。 */
async function resolveMapWorldTarget(
  ctx: XingyiMapWorkDispatchContext,
  worldArg: unknown,
  sessionArg: unknown,
  action: '读取' | '删除'
): Promise<{ worldId: string; worldName?: string } | { result: ToolExecutionResult }> {
  const worldIdentifier = String(worldArg || '').trim()
  if (worldIdentifier) {
    const worlds = await ctx.listWorlds()
    const resolved = resolveXingyiWorld(worlds, worldIdentifier)
    if ('error' in resolved) return { result: invalidArgumentResult(resolved.error) }
    return { worldId: resolved.world.id, worldName: resolved.world.name }
  }

  const outcome = await resolveXingyiSessionForCall(ctx, sessionArg)
  if ('error' in outcome) return { result: invalidArgumentResult(outcome.error) }
  if ('noActiveSession' in outcome) {
    return {
      result: invalidArgumentResult(
        `没有打开的会话，也没有指定 world 参数，不知道要${action}哪个世界的地图。请先用 listWorlds 看世界清单后传 world 参数指定，或先打开一个会话。`
      )
    }
  }
  let worldId = ''
  try {
    const bundle = await fetchChatSessionBundleById(outcome.context.sessionId, { limit: 1 })
    const sessionRow = (bundle?.session || null) as unknown as Record<string, unknown> | null
    worldId = String(sessionRow?.worldId ?? sessionRow?.world_id ?? '').trim()
  } catch {
    worldId = ''
  }
  if (!worldId) {
    return {
      result: invalidArgumentResult(
        `会话「${outcome.context.sessionTitle}」还没有加入世界，没有可${action}的地图。请先用 listWorlds 看世界清单传 world 参数直达，或在该会话的舆图弹窗建/选世界。`
      )
    }
  }
  return { worldId }
}

interface ResolvedMapFeature {
  feature: WorldMapFeatureRecord
  sheetName: string
}

function flattenMapFeatures(bundle: WorldMapBundle): ResolvedMapFeature[] {
  return bundle.sheets.flatMap((sheet) => sheet.features.map((feature) => ({ feature, sheetName: sheet.name })))
}

function armorGroupIdOf(feature: WorldMapFeatureRecord): string {
  const armor = feature.meta?.armor
  if (!armor || typeof armor !== 'object' || Array.isArray(armor)) return ''
  return String((armor as Record<string, unknown>).groupId || '').trim()
}

/** 删除目标只认精确 featureId 或精确名称。名称同名时拒绝，绝不做包含匹配误删。 */
function resolveMapDeleteTargets(
  bundle: WorldMapBundle,
  rawTargets: string[],
  expandArmorGroup: boolean
): { items: ResolvedMapFeature[] } | { error: string } {
  const all = flattenMapFeatures(bundle)
  const selected: ResolvedMapFeature[] = []
  for (const rawTarget of rawTargets) {
    const target = String(rawTarget || '').trim()
    const byId = all.find((item) => item.feature.id === target)
    if (byId) {
      selected.push(byId)
      continue
    }
    const byName = all.filter((item) => item.feature.name === target)
    if (byName.length === 1) {
      selected.push(byName[0])
      continue
    }
    if (byName.length > 1) {
      return {
        error: `地图上有 ${byName.length} 个同名要素「${target}」，为避免误删，请先用 readWorldMap 读取清单后改传准确 featureId：${byName.map((item) => item.feature.id).join('、')}`
      }
    }
    return { error: `地图上没有找到精确要素「${target}」。请先用 readWorldMap 读取当前要素清单，再传准确 featureId 或完整名称；删除不做模糊匹配。` }
  }

  const expanded = [...selected]
  if (expandArmorGroup) {
    const groupIds = new Set(selected.map((item) => armorGroupIdOf(item.feature)).filter(Boolean))
    if (groupIds.size) {
      expanded.push(...all.filter((item) => groupIds.has(armorGroupIdOf(item.feature))))
    }
  }
  const unique = new Map<string, ResolvedMapFeature>()
  expanded.forEach((item) => unique.set(item.feature.id, item))
  return { items: Array.from(unique.values()) }
}

/** dispatch/dispatchToWorld 结果 → 工具执行结果（closingNote 透传语义两条路径完全一致，见下方两处调用）。 */
function buildMapWorkToolResult(outcome: XingyiMapWorkOutcome, closingNote: string): ToolExecutionResult {
  return {
    content: outcome.content,
    details: { kind: 'huiyuDispatch', ok: outcome.ok, ...(outcome.details || {}) },
    acted: outcome.ok,
    ...(outcome.ok && closingNote ? { closingNote } : {})
  }
}

/** 派「绘舆」作图员（跨会话版）：与提调侧同名 dispatchMapWork，多一个 session 参数定位目标会话。 */
export function createXingyiDispatchMapWorkTool(ctx: XingyiMapWorkDispatchContext): ToolDefinition {
  return {
    name: 'dispatchMapWork',
    // 山脉装甲仍可能有一次校验重试，免受默认单工具超时限制。
    longRunning: true,
    brief: '更新世界舆图的新写入口，只允许两条链：'
      + 'mode="armor" 用参数装甲画地形，terrain 必填 mountain/grass/river/water；river 只规划脊线，water 只规划闭合表面，河岸与水深都由代码派生。'
      + 'mode="vector" 用结构化基础图元直画，不调用第二个模型、不接受原始 SVG/XML；shape 支持 circle/ellipse/rect/polygon/path。'
      + '山脉永远用 mode="armor", terrain="mountain"，禁止用 vector/path 代替。'
      + '河流永远用 mode="armor", terrain="river"，禁止用 vector/path 代替；可用 sourceFeature/mouthFeature 精确指定源头与入海/汇流要素。'
      + '湖泊和海洋永远用 mode="armor", terrain="water"，禁止用 vector/polygon 绕过水深与连接协议。'
      + 'river 的 sourceFeature/mouthFeature 是连接语义；不要把源头顺手填进 anchorFeature，除非整条河确实都必须留在该要素内部。'
      + '湖泊和海洋统一使用 mode="armor", terrain="water"；waterKind 只表达 lake/ocean 语义，maxDepthM 等参数决定同组深水层。近距自由河端会在 connectionGapM 内自动接岸。'
      + '要画规整正圆草原：mode="vector", category="grass", shape="circle", radiusKm=半径；缺省放在当前内容工作框中心。'
      + '放置缺省 placementMode="inside"：最终几何必须留在 anchorFeature（名称或 featureId；未给时用唯一面状要素/当前内容范围）内。'
      + '只有用户明确说向外延伸/旁边新增/开拓新区时才用 placementMode="expand"，并填写 direction；'
      + 'widthKm/heightKm 在山脉、河流和水体装甲中表示作画任务域尺寸，在草原/ellipse/rect 中仍表示成图尺寸。'
      + 'offsetXKm 向东为正、offsetYKm 向南为正；polygon/path 的 pointsKm 是相对本次作画任务域中心的公里坐标。'
      + '新地形通过全部几何校验后会先在真实地图上打开最终草稿审阅：用户可逐项确认、提出修改或删除；只有确认项会写入正式地图。'
      + '若工具回执带 reviewStatus="modify" 与 reviewFeedback，必须按意见重新调用本工具生成新草稿，不能把旧候选直接写入或口头宣称已完成。'
      + '旧 draft/draw/staged 绘舆链已经冻结，不要再调用。'
      + '世界寻址优先：不管目标世界挂没挂会话，先用 listWorlds 看世界清单确认准确名字/worldId，'
      + '再传 world 参数（世界名或 worldId）直达该世界作画（与 session 二选一，同传时 world 优先）；'
      + '仍可以经会话：没打开会话、或要更新别的对话的地图时，先用 listChatContacts 看清单，再传 session 参数'
      + '（会话名/联系人名/targetId/sessionId）指定，缺省=当前活动会话。若经会话且目标会话还没加入世界，'
      + '会如实回报「未加入世界」，转告用户先在该会话的舆图弹窗建/选世界，或改用 world 参数直达。'
      + '可选 closingNote：提前写好的交稿收尾话。仅当派发全部成功（真落笔/阶段全推完，不是缺料回执或用户驳回）时，'
      + '会作为你的最终答复直接发给用户、本轮随即结束（省一轮调用）；驳回/缺料/失败时不会使用，你会正常拿到回执再答复。'
      + '写作要求：简短，不要断言具体成果细节（写它时还不知道结果），细节用户可在运行卡查看。',
    schema: {
      type: 'object',
      properties: {
        world: { type: 'string', description: '世界名或 worldId（可选）：直达该世界的舆图作画，不需要该世界挂任何会话；与 session 二选一，world 优先。先用 listWorlds 看清单。' },
        session: { type: 'string', description: '目标会话（可选·缺省=当前活动会话）：会话名/联系人名/targetId/sessionId。没打开会话时先用 listChatContacts 看清单再指定。' },
        task: { type: 'string', description: '作图任务短标题（必填·显示在运行卡上，如「一行人抵达临澜城」「新增玄岳山道」）。' },
        instructions: { type: 'string', description: '任务书（必填）：用人话说明要画什么、放在哪里、希望多大。结构化参数仍以本工具字段为准。' },
        mode: {
          type: 'string',
          enum: ['armor', 'vector'],
          description: 'armor=装甲地形；vector=结构化基础图元。旧 draft/draw/staged 已冻结。'
        },
        terrain: { type: 'string', enum: ['mountain', 'grass', 'river', 'water'], description: 'mode=armor 必填：山脉、草原、河流或水体。' },
        shape: { type: 'string', enum: ['organic', 'circle', 'ellipse', 'rect', 'polygon', 'path'], description: 'grass 装甲可用 organic/circle/ellipse；vector 可用 circle/ellipse/rect/polygon/path。' },
        category: { type: 'string', description: 'mode=vector 必填，如 grass/forest/road；water 必须走水体装甲。' },
        name: { type: 'string', description: '要素名称（可选）。' },
        radiusKm: { type: 'number', description: 'circle 半径（公里）。' },
        widthKm: { type: 'number', description: 'ellipse/rect/grass 宽度（公里）。' },
        heightKm: { type: 'number', description: 'ellipse/rect/grass 高度（公里）。' },
        offsetXKm: { type: 'number', description: '相对当前内容工作框中心向东偏移（公里，向西为负）。' },
        offsetYKm: { type: 'number', description: '相对当前内容工作框中心向南偏移（公里，向北为负）。' },
        ruggedness: { type: 'number', description: '草原装甲边缘碎折度 0~1；规整圆/椭圆可省略。' },
        sourceFeature: { type: 'string', description: 'river 可选：源头地形的准确名称或 featureId（山地/水域）。' },
        mouthFeature: { type: 'string', description: 'river 可选：入海、入湖或汇流目标的准确名称或 featureId（水域/既有河流）。' },
        sourceWidthM: { type: 'number', description: 'river 可选：源头满宽（米，>0）。' },
        mouthWidthM: { type: 'number', description: 'river 可选：河口满宽（米，>=源头宽度）。' },
        growthExponent: { type: 'number', description: 'river 可选：沿程展宽指数 0.1~2。' },
        bankRoughness: { type: 'number', description: 'river 可选：河岸碎折度 0~0.6。' },
        mouthCap: { type: 'string', enum: ['flat', 'flare'], description: 'river 可选：flat 普通汇入；flare 喇叭河口。' },
        mouthFlareRatio: { type: 'number', description: 'river 且 mouthCap=flare 可选：河口展开倍数 1~10。' },
        waterKind: { type: 'string', enum: ['lake', 'ocean'], description: 'water 可选：湖泊或海洋；二者共用同一装甲。' },
        maxDepthM: { type: 'number', description: 'water 可选：最大水深（米，1~12000）。' },
        shoreShelfRatio: { type: 'number', description: 'water 可选：近岸浅水带比例 0.05~0.45。' },
        depthCurve: { type: 'number', description: 'water 可选：深度增长曲线 0.4~3。' },
        waterLayers: { type: 'number', enum: [2, 3], description: 'water 可选：可见水深层数 2 或 3。' },
        connectionGapM: { type: 'number', description: 'water 可选：河流端点自动接岸最大间距（米，10~5000）。' },
        seed: { type: 'number', description: '装甲复现种子（可选整数）。' },
        pointsKm: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'polygon/path 点列；每点 [xKm,yKm] 相对本次作画任务域中心。' },
        placementMode: { type: 'string', enum: ['inside', 'expand'], description: '缺省 inside；只有用户明确要求拓展现有地图时才用 expand。' },
        anchorFeature: { type: 'string', description: '作画锚点的准确要素名称或 featureId；inside 时作为包含边界，expand 时作为向外拓展的起点。' },
        direction: { type: 'string', enum: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'], description: 'expand 必填：相对锚点向哪个方向开拓。' },
        gapKm: { type: 'number', description: 'expand 可选：新任务域与锚点边缘的间隔（公里，缺省 0）。' },
        focus: { type: 'string', description: '建议方向（可选，如「先挪角色位置再补画新地点」「只扩探索范围不加地物」）。' },
        closingNote: { type: 'string', description: '可选——提前写好的交稿收尾话。仅当派发全部成功时会作为你的最终答复直接发给用户、本轮随即结束（省一轮调用）；失败/驳回/缺料时不会使用。写作要求：简短，不要断言具体成果细节（写它时还不知道结果）。' }
      },
      required: ['task', 'instructions', 'mode']
    },
    validateArgs: (args) => {
      if (!String(args.task || '').trim()) return 'dispatchMapWork 缺少 task（任务短标题）'
      if (!String(args.instructions || '').trim()) return 'dispatchMapWork 缺少 instructions（剧情事实任务书）'
      const mode = String(args.mode || '')
      if (mode !== 'armor' && mode !== 'vector') return 'dispatchMapWork 缺少或非法的 mode（只允许 "armor"/"vector"；旧 draft/draw/staged 已冻结）'
      if (mode === 'armor' && !['mountain', 'grass', 'river', 'water'].includes(String(args.terrain || ''))) return 'mode="armor" 时 terrain 必须是 "mountain"、"grass"、"river" 或 "water"'
      if (mode === 'armor' && String(args.terrain) === 'river') {
        if (args.sourceWidthM !== undefined && !(Number(args.sourceWidthM) > 0)) return 'sourceWidthM 必须大于 0'
        if (args.mouthWidthM !== undefined && !(Number(args.mouthWidthM) > 0)) return 'mouthWidthM 必须大于 0'
        if (args.sourceWidthM !== undefined && args.mouthWidthM !== undefined && Number(args.mouthWidthM) < Number(args.sourceWidthM)) return 'mouthWidthM 不能小于 sourceWidthM'
        if (args.growthExponent !== undefined && !(Number(args.growthExponent) >= 0.1 && Number(args.growthExponent) <= 2)) return 'growthExponent 必须在 0.1~2 之间'
        if (args.bankRoughness !== undefined && !(Number(args.bankRoughness) >= 0 && Number(args.bankRoughness) <= 0.6)) return 'bankRoughness 必须在 0~0.6 之间'
        if (args.mouthCap !== undefined && !['flat', 'flare'].includes(String(args.mouthCap))) return 'mouthCap 只允许 "flat"/"flare"'
        if (args.mouthFlareRatio !== undefined && !(Number(args.mouthFlareRatio) >= 1 && Number(args.mouthFlareRatio) <= 10)) return 'mouthFlareRatio 必须在 1~10 之间'
      }
      if (mode === 'armor' && String(args.terrain) === 'water') {
        if (args.waterKind !== undefined && !['lake', 'ocean'].includes(String(args.waterKind))) return 'waterKind 只允许 "lake"/"ocean"'
        if (args.maxDepthM !== undefined && !(Number(args.maxDepthM) >= 1 && Number(args.maxDepthM) <= 12000)) return 'maxDepthM 必须在 1~12000 之间'
        if (args.shoreShelfRatio !== undefined && !(Number(args.shoreShelfRatio) >= 0.05 && Number(args.shoreShelfRatio) <= 0.45)) return 'shoreShelfRatio 必须在 0.05~0.45 之间'
        if (args.depthCurve !== undefined && !(Number(args.depthCurve) >= 0.4 && Number(args.depthCurve) <= 3)) return 'depthCurve 必须在 0.4~3 之间'
        if (args.waterLayers !== undefined && ![2, 3].includes(Number(args.waterLayers))) return 'waterLayers 只允许 2 或 3'
        if (args.connectionGapM !== undefined && !(Number(args.connectionGapM) >= 10 && Number(args.connectionGapM) <= 5000)) return 'connectionGapM 必须在 10~5000 之间'
      }
      if (mode === 'vector') {
        const shape = String(args.shape || '')
        if (!['circle', 'ellipse', 'rect', 'polygon', 'path'].includes(shape)) return 'mode="vector" 时 shape 必须是 circle/ellipse/rect/polygon/path'
        if (!String(args.category || '').trim()) return 'mode="vector" 时缺少 category'
        if (String(args.category) === 'water') return '湖泊和海洋必须使用 mode="armor", terrain="water"，不能用 vector 绕过水深与河流连接协议'
        const compatibilityError = validateVectorPrimitiveCategory(shape as 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path', String(args.category || ''))
        if (compatibilityError) return compatibilityError
        if (shape === 'circle' && !(Number(args.radiusKm) > 0)) return 'shape="circle" 时 radiusKm 必须大于 0'
        if ((shape === 'ellipse' || shape === 'rect') && (!(Number(args.widthKm) > 0) || !(Number(args.heightKm) > 0))) return `${shape} 需要大于 0 的 widthKm 和 heightKm`
        if ((shape === 'polygon' || shape === 'path') && !Array.isArray(args.pointsKm)) return `${shape} 需要 pointsKm 点列`
      }
      if (args.placementMode !== undefined && !['inside', 'expand'].includes(String(args.placementMode))) return 'placementMode 只允许 "inside"/"expand"'
      if (String(args.placementMode || 'inside') === 'expand' && !String(args.direction || '').trim()) return 'placementMode="expand" 时必须填写 direction'
      if (args.gapKm !== undefined && (!Number.isFinite(Number(args.gapKm)) || Number(args.gapKm) < 0)) return 'gapKm 必须是大于等于 0 的有限数值'
      return null
    },
    execute: async (toolCall) => {
      const numberOrUndefined = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined
      const pointsKm = Array.isArray(toolCall.args.pointsKm)
        ? toolCall.args.pointsKm.filter((point): point is [unknown, unknown] => Array.isArray(point) && point.length >= 2)
          .map((point) => [Number(point[0]), Number(point[1])] as [number, number])
          .filter((point) => point.every(Number.isFinite))
        : undefined
      const input: XingyiMapWorkTaskInput = {
        task: String(toolCall.args.task || '').trim(),
        instructions: String(toolCall.args.instructions || '').trim(),
        mode: toolCall.args.mode as 'armor' | 'vector',
        ...(['mountain', 'grass', 'river', 'water'].includes(String(toolCall.args.terrain)) ? { terrain: toolCall.args.terrain as 'mountain' | 'grass' | 'river' | 'water' } : {}),
        ...(['organic', 'circle', 'ellipse', 'rect', 'polygon', 'path'].includes(String(toolCall.args.shape)) ? { shape: toolCall.args.shape as XingyiMapWorkTaskInput['shape'] } : {}),
        ...(String(toolCall.args.category || '').trim() ? { category: String(toolCall.args.category).trim() } : {}),
        ...(String(toolCall.args.name || '').trim() ? { name: String(toolCall.args.name).trim() } : {}),
        ...(numberOrUndefined(toolCall.args.radiusKm) !== undefined ? { radiusKm: numberOrUndefined(toolCall.args.radiusKm) } : {}),
        ...(numberOrUndefined(toolCall.args.widthKm) !== undefined ? { widthKm: numberOrUndefined(toolCall.args.widthKm) } : {}),
        ...(numberOrUndefined(toolCall.args.heightKm) !== undefined ? { heightKm: numberOrUndefined(toolCall.args.heightKm) } : {}),
        ...(numberOrUndefined(toolCall.args.offsetXKm) !== undefined ? { offsetXKm: numberOrUndefined(toolCall.args.offsetXKm) } : {}),
        ...(numberOrUndefined(toolCall.args.offsetYKm) !== undefined ? { offsetYKm: numberOrUndefined(toolCall.args.offsetYKm) } : {}),
        ...(numberOrUndefined(toolCall.args.ruggedness) !== undefined ? { ruggedness: numberOrUndefined(toolCall.args.ruggedness) } : {}),
        ...(String(toolCall.args.sourceFeature || '').trim() ? { sourceFeature: String(toolCall.args.sourceFeature).trim() } : {}),
        ...(String(toolCall.args.mouthFeature || '').trim() ? { mouthFeature: String(toolCall.args.mouthFeature).trim() } : {}),
        ...(numberOrUndefined(toolCall.args.sourceWidthM) !== undefined ? { sourceWidthM: numberOrUndefined(toolCall.args.sourceWidthM) } : {}),
        ...(numberOrUndefined(toolCall.args.mouthWidthM) !== undefined ? { mouthWidthM: numberOrUndefined(toolCall.args.mouthWidthM) } : {}),
        ...(numberOrUndefined(toolCall.args.growthExponent) !== undefined ? { growthExponent: numberOrUndefined(toolCall.args.growthExponent) } : {}),
        ...(numberOrUndefined(toolCall.args.bankRoughness) !== undefined ? { bankRoughness: numberOrUndefined(toolCall.args.bankRoughness) } : {}),
        ...(['flat', 'flare'].includes(String(toolCall.args.mouthCap)) ? { mouthCap: toolCall.args.mouthCap as 'flat' | 'flare' } : {}),
        ...(numberOrUndefined(toolCall.args.mouthFlareRatio) !== undefined ? { mouthFlareRatio: numberOrUndefined(toolCall.args.mouthFlareRatio) } : {}),
        ...(['lake', 'ocean'].includes(String(toolCall.args.waterKind)) ? { waterKind: toolCall.args.waterKind as 'lake' | 'ocean' } : {}),
        ...(numberOrUndefined(toolCall.args.maxDepthM) !== undefined ? { maxDepthM: numberOrUndefined(toolCall.args.maxDepthM) } : {}),
        ...(numberOrUndefined(toolCall.args.shoreShelfRatio) !== undefined ? { shoreShelfRatio: numberOrUndefined(toolCall.args.shoreShelfRatio) } : {}),
        ...(numberOrUndefined(toolCall.args.depthCurve) !== undefined ? { depthCurve: numberOrUndefined(toolCall.args.depthCurve) } : {}),
        ...([2, 3].includes(Number(toolCall.args.waterLayers)) ? { waterLayers: Number(toolCall.args.waterLayers) as 2 | 3 } : {}),
        ...(numberOrUndefined(toolCall.args.connectionGapM) !== undefined ? { connectionGapM: numberOrUndefined(toolCall.args.connectionGapM) } : {}),
        ...(numberOrUndefined(toolCall.args.seed) !== undefined ? { seed: numberOrUndefined(toolCall.args.seed) } : {}),
        ...(pointsKm?.length ? { pointsKm } : {}),
        ...(['inside', 'expand'].includes(String(toolCall.args.placementMode)) ? { placementMode: toolCall.args.placementMode as MapPlacementMode } : {}),
        ...(String(toolCall.args.anchorFeature || '').trim() ? { anchorFeature: String(toolCall.args.anchorFeature).trim() } : {}),
        ...(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'].includes(String(toolCall.args.direction)) ? { direction: toolCall.args.direction as MapExpandDirection } : {}),
        ...(numberOrUndefined(toolCall.args.gapKm) !== undefined ? { gapKm: numberOrUndefined(toolCall.args.gapKm) } : {}),
        ...(String(toolCall.args.focus || '').trim() ? { focus: String(toolCall.args.focus).trim() } : {})
      }
      const closingNote = String(toolCall.args.closingNote || '').trim()
      const worldArg = String(toolCall.args.world || '').trim()
      // 世界直达（2026-07-13）：world 在场优先，跳过会话解析，不需要该世界挂任何会话。
      if (worldArg) {
        const worlds = await ctx.listWorlds()
        const resolved = resolveXingyiWorld(worlds, worldArg)
        if ('error' in resolved) return invalidArgumentResult(resolved.error)
        const outcome = await ctx.dispatchToWorld({ worldId: resolved.world.id, worldName: resolved.world.name }, input)
        return buildMapWorkToolResult(outcome, closingNote)
      }
      const outcome = await resolveXingyiSessionForCall(ctx, toolCall.args.session)
      if ('error' in outcome) return invalidArgumentResult(outcome.error)
      if ('noActiveSession' in outcome) {
        return invalidArgumentResult('没有打开的会话，也没有指定 session 参数，不知道要更新哪个世界的地图。请先用 listChatContacts 看会话清单，再传 session 参数指定目标会话，或用 listWorlds 看世界清单后传 world 参数直达。')
      }
      // 绘舆失败/会话未挂世界不算工具错误（回执正文如实说明·避免同错熔断误判基础设施故障）；
      // acted 结果级修正：真交稿（ok）才算「本轮做过事」，派了没画成不算。
      const outcome2 = await ctx.dispatch(outcome.context, input)
      return buildMapWorkToolResult(outcome2, closingNote)
    }
  }
}

/** 世界清单（只读·2026-07-13）：世界寻址第一步——用户点名某个世界（不管挂没挂会话）时先用它确认
 *  准确名字/worldId，再传给 dispatchMapWork 的 world 参数或 readWorldMap 直达。 */
export function createXingyiListWorldsTool(ctx: Pick<XingyiMapWorkDispatchContext, 'listWorlds'>): ToolDefinition {
  return {
    name: 'listWorlds',
    brief: '列出全部世界（跨会话共享的地图/状态顶层实体）：名字、worldId、挂了几个会话、舆图图纸张数。'
      + '用户点名某个世界时先用它确认准确名字/worldId——世界不需要挂任何会话，没挂会话的世界也在这份清单里。'
      + '拿到 worldId/世界名后传给 dispatchMapWork 的 world 参数直达作画，或 readWorldMap 只读格局摘要。',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      const worlds = await ctx.listWorlds()
      if (!worlds.length) {
        return { content: '现在还没有任何世界（可在任意会话的舆图弹窗一键创建）。', details: { worlds: [] } }
      }
      const lines = worlds.map((world) => {
        const sheetCount = Number(world.mapSheetCount || 0)
        const sheetText = sheetCount > 0 ? `舆图 ${sheetCount}张图纸` : '尚无舆图'
        return `世界：${world.name}（worldId ${world.id}·${sheetText}·挂 ${Number(world.sessionCount || 0)} 个会话）`
      })
      return {
        content: `共 ${worlds.length} 个世界：\n${lines.join('\n')}`,
        details: { worlds }
      }
    }
  }
}

/** 只读世界地图格局摘要（2026-07-13）：纯函数渲染，零模型调用、不派绘舆——只想「看一眼现在长什么样」用它，
 *  要新增/修改地图内容仍用 dispatchMapWork。world 参数缺省=当前活动会话所挂的世界（与 dispatch 旧链路
 *  同一套「现查会话 world_id」逻辑，见 XingyiDock.vue dispatchXingyiMapWork）。 */
export function createXingyiReadWorldMapTool(ctx: XingyiMapWorkDispatchContext): ToolDefinition {
  return {
    name: 'readWorldMap',
    brief: '只读某个世界当前的地图格局摘要（纯函数渲染，不派绘舆、不调用任何模型）。'
      + '缺省=当前活动会话所挂的世界；也可直接传 world（世界名或 worldId）跨会话/零会话直达——先用 listWorlds 看清单确认准确名字。'
      + '只读不作画，要新增/修改地图内容用 dispatchMapWork。',
    schema: {
      type: 'object',
      properties: {
        world: { type: 'string', description: '世界名或 worldId（可选·缺省=当前活动会话所挂的世界）。先用 listWorlds 看清单确认准确名字。' }
      }
    },
    execute: async (toolCall) => {
      const resolved = await resolveMapWorldTarget(ctx, toolCall.args.world, undefined, '读取')
      if ('result' in resolved) return resolved.result
      const content = await ctx.readWorldMapSummary(resolved.worldId)
      return { content, details: { worldId: resolved.worldId } }
    }
  }
}

/** 星依地图删除（2026-07-14）：单删/批删共用一个工具；先整批精确解析并展开装甲组，再确认，再顺序软删。
 * 后端当前是单要素正式删除端点，因此网络故障时可能部分成功；回执必须逐项给出，不得伪装成原子批处理。 */
export function createXingyiDeleteMapFeaturesTool(ctx: XingyiMapWorkDispatchContext): ToolDefinition {
  const action = '删除地图地形'
  return {
    name: 'deleteMapFeatures',
    longRunning: true,
    brief: '从世界舆图删除一个或多个地形/地图要素（软删留历史，写操作，会先弹确认）。'
      + '固定流程：先用 readWorldMap 读取当前清单，targets 只传准确 featureId 或完整名称；单删传 1 项，批删一次传多项，禁止按模糊名称猜。'
      + 'expandArmorGroup 缺省 true：命中装甲山脉/草原任一层时自动删除同 groupId 的整套要素，避免残留主山体/山脊/峰线；只有用户明确要求只删某一底层要素时才传 false。'
      + 'world 与 session 二选一，world 优先；批量删除会先整批校验，任何目标不明确都不会开始删除。',
    schema: {
      type: 'object',
      properties: {
        world: { type: 'string', description: '世界名或 worldId（可选）：直达该世界；与 session 二选一，world 优先。' },
        session: { type: 'string', description: '目标会话（可选·缺省=当前活动会话）：用它现查所挂世界。' },
        targets: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 30,
          description: '要删除的准确 featureId 或完整要素名。单删给 1 项，批删给多项；先用 readWorldMap 读取。'
        },
        expandArmorGroup: { type: 'boolean', description: '缺省 true：若目标属于装甲地形，自动删除同 groupId 的全部层；明确只删某一底层要素时才设 false。' },
        reason: { type: 'string', description: '删除原因（可选，简短，展示在确认卡和地图历史分组名中）。' }
      },
      required: ['targets']
    },
    validateArgs: (args) => {
      if (!Array.isArray(args.targets)) return 'deleteMapFeatures 缺少 targets 数组'
      if (args.targets.length < 1) return 'deleteMapFeatures 的 targets 至少需要 1 项'
      if (args.targets.length > 30) return 'deleteMapFeatures 单次最多接收 30 个目标，请分批删除'
      if (args.targets.some((target) => !String(target || '').trim())) return 'deleteMapFeatures 的 targets 不能包含空项'
      if (args.expandArmorGroup !== undefined && typeof args.expandArmorGroup !== 'boolean') return 'expandArmorGroup 必须是 boolean'
      return null
    },
    execute: async (toolCall) => {
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, action)!
      const resolvedWorld = await resolveMapWorldTarget(ctx, toolCall.args.world, toolCall.args.session, '删除')
      if ('result' in resolvedWorld) return resolvedWorld.result
      if (isCartographerBusyForWorld(resolvedWorld.worldId)) {
        return {
          content: `世界「${resolvedWorld.worldName || resolvedWorld.worldId}」当前有舆图师正在处理这张地图，为避免同时改地图冲突，请先告诉用户舆图师正在处理、建议稍后再删除，这一轮不要重复尝试。`,
          details: { worldId: resolvedWorld.worldId, cartographerBusy: true }
        }
      }

      let bundle: WorldMapBundle
      try {
        bundle = await fetchWorldMapBundle(resolvedWorld.worldId)
      } catch (error) {
        return runtimeErrorResult('读取待删除地形', error)
      }
      const rawTargets = (toolCall.args.targets as unknown[]).map((target) => String(target || '').trim())
      const expandArmorGroup = toolCall.args.expandArmorGroup !== false
      const resolvedTargets = resolveMapDeleteTargets(bundle, rawTargets, expandArmorGroup)
      if ('error' in resolvedTargets) return invalidArgumentResult(resolvedTargets.error)
      const items = resolvedTargets.items
      const reason = String(toolCall.args.reason || '').trim()
      const previewLimit = 12
      const previewLines = items.slice(0, previewLimit).map((item) =>
        `- ${item.feature.name}（${item.feature.id}，${item.feature.kind}/${item.feature.category}，图纸「${item.sheetName}」）`
      )
      if (items.length > previewLimit) previewLines.push(`- ……另有 ${items.length - previewLimit} 个要素`)
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: items.length === 1 ? `删除地形「${items[0].feature.name}」` : `批量删除 ${items.length} 个地图要素`,
        lines: [
          `世界：${resolvedWorld.worldName || bundle.world.name || resolvedWorld.worldId}`,
          ...previewLines,
          ...(reason ? [`原因：${reason}`] : []),
          '这些要素会从当前地图移除并保留删除历史；当前没有一键恢复入口。'
        ]
      }, action)
      if (denied) return denied

      const runKey = `xingyi-map-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const runLabel = `星依删除地图·${reason || (items.length === 1 ? items[0].feature.name : `${items.length}项`)}`
      const deleted: ResolvedMapFeature[] = []
      const failed: Array<{ item: ResolvedMapFeature; message: string }> = []
      for (const item of items) {
        try {
          await deleteWorldMapFeatureRemote(resolvedWorld.worldId, item.feature.id, { runKey, runLabel })
          deleted.push(item)
        } catch (error) {
          failed.push({ item, message: error instanceof Error ? error.message : String(error) })
        }
      }
      if (deleted.length) bumpTerrainRevision(resolvedWorld.worldId)

      const deletedNames = deleted.map((item) => `「${item.feature.name}」`).join('、')
      if (failed.length) {
        const failedText = failed.map(({ item, message }) => `「${item.feature.name}」（${item.feature.id}）：${message}`).join('；')
        const content = deleted.length
          ? `批量删除部分完成：已删除 ${deleted.length} 个要素（${deletedNames}）；另有 ${failed.length} 个失败：${failedText}。已成功的删除不会自动回滚，请不要整批重试，只处理失败项。`
          : `地图要素删除失败：${failedText}`
        return {
          content,
          status: 'error',
          acted: deleted.length > 0,
          // runtime 错误枚举没有独立 PARTIAL_FAILURE；用 TOOL_RUNTIME_ERROR 承载，结构化 partialFailure
          // 放 details，且 retryable=false 防止模型把已成功的目标整批重删。
          error: { type: 'TOOL_RUNTIME_ERROR', message: failedText, retryable: false },
          details: {
            worldId: resolvedWorld.worldId,
            partialFailure: true,
            deletedFeatureIds: deleted.map((item) => item.feature.id),
            failed: failed.map(({ item, message }) => ({ featureId: item.feature.id, name: item.feature.name, message }))
          }
        }
      }
      return {
        content: deleted.length === 1
          ? `已从地图删除「${deleted[0].feature.name}」（${deleted[0].feature.id}）。`
          : `已从地图批量删除 ${deleted.length} 个要素：${deletedNames}。`,
        acted: true,
        details: {
          worldId: resolvedWorld.worldId,
          deletedFeatureIds: deleted.map((item) => item.feature.id),
          expandedArmorGroup: expandArmorGroup && deleted.length > rawTargets.length,
          runKey
        }
      }
    }
  }
}
