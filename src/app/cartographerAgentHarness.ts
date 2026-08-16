/**
 * 舆图师独立 agent harness（地图与剧本工作区专业Agent计划批C）。
 *
 * 与 scriptwriterAgentHarness.ts 同一范式（runAgentRuntime 直接组装，不经过 runXingyiAgent/dispatchMapWork），
 * 对话式：允许零写只读问答，写操作各自独立工具+各自门槛。与编剧的关键差异：
 * - armor/vector 两类写工具不是简单"标题+几行字"确认，而是复用现役最终草稿审阅协议
 *   （`mapDraftReview.ts::runMapDraftReviewGate`，逐项几何候选确认/修改/删除+图纸并发签名校验）——
 *   本文件只负责把 `reviewDraft` 通道注入给 runMountainArmorWork/runGrassArmorWork/runRiverArmorWork/
 *   runWaterArmorWork/runVectorPrimitiveWork（这五个函数是现役"新写链"引擎，直接复用，不重新实现绘图逻辑）。
 * - deleteMapFeatures 是唯一走简单 confirmWrite 的写工具（与编剧的三个CRUD工具同款简单确认）。
 * - 已知简化（母计划批C调研已披露）：不做 armor 分组自动展开删除（星依侧 deleteMapFeatures 的
 *   expandArmorGroup 语义此处未复刻，只做精确 featureId/name 删除）；四个装甲函数各自对"当前图纸"的
 *   解析口径本就不一致（有的取 sheets[0]、有的取默认图纸），这是调研发现的既存技术债，不在本批修。
 */

import type { AgentRuntimeMessage, AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import type { AgentTaskTodoSnapshot } from './agentRuntime/taskTodo'
import { createSessionSubagentControlCapability } from './agentRuntime/subagentControl'
import type { AgentTurnStreamController } from './agentTurnStream'
import type { AgentTranscript } from './agentRuntime/types'
import type { ToolDefinition } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel, type ConfirmWriteChannel } from './agentRuntime/interactionContract'
import { invalidArgs, runtimeError, runWorkspaceAgentRuntime } from './agentHarnessShared'
import { assembleAgentSkillSupply } from './agentSupply'
import type { ReviewMapDraft } from './mapDraftReview'
import { buildMapTaskPlacementRequest, type MapExpandDirection, type MapPlacementMode, type MapTaskPlacementRequest } from './mapTaskPlacement'
import { runMountainArmorWork, runGrassArmorWork, type RunMountainArmorWorkResult } from './mapArmor/armorOrchestration'
import { runRiverArmorWork } from './mapArmor/riverOrchestration'
import { runWaterArmorWork } from './mapArmor/waterOrchestration'
import type { ArmorPainterCallModel } from './mapArmor/armorPainter'
import { runVectorPrimitiveWork, type VectorPrimitiveWorkResult } from './mapDrawing/vectorOrchestration'
import { validateVectorPrimitiveCategory } from './mapDrawing/vectorPrimitive'
import type { fetchWorldMapBundle, saveWorldMapFeaturesRemote, deleteWorldMapFeatureRemote } from '../repositories/chatRepository'
import type { WorldMapBundle } from '../types'
import { bumpTerrainRevision } from './mapTerrainRevision'

export const CARTOGRAPHER_AGENT_NAME = '舆图师'

export interface CartographerHistoryMessage { role: 'user' | 'assistant'; content: string }

export interface CartographerOrchestratorRequest {
  messages: AgentRuntimeMessage[]
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  turnIndex: number
}

export interface CartographerWriteApi {
  fetchWorldMapBundle: typeof fetchWorldMapBundle
  saveWorldMapFeaturesRemote: typeof saveWorldMapFeaturesRemote
  deleteWorldMapFeatureRemote: typeof deleteWorldMapFeatureRemote
}

export interface RunCartographerAgentInput {
  userText: string
  history?: CartographerHistoryMessage[]
  /** AgentContext 配方渲染出的完整原始可见上下文。 */
  contextBlock: string
  worldId: string
  /** 当前图纸格局摘要（代码确定性装配，如 renderMapSummary 产出），只读注入 prompt，不做成可调工具。 */
  mapSummary: string
  /** 审计：写入时标记来源聊天（工作区打开它的那个聊天会话id），不作会话归属真值。 */
  sourceSessionId?: string
  callOrchestrator: (request: CartographerOrchestratorRequest) => Promise<{ content: string; toolCalls: unknown[] } | null>
  /** 装甲画师单次模型调用（river/water/mountain 各自调用一次；grass 不调用模型）。 */
  paintCallModel: ArmorPainterCallModel
  /** 破坏性删除的简单确认门。 */
  confirmWrite?: ConfirmWriteChannel
  /** 最终草稿审阅门：armor/vector 五条写链共用同一协议。 */
  reviewDraft: ReviewMapDraft
  writeApi: CartographerWriteApi
  onProgress?: (event: AgentRuntimeProgressEvent) => void
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  initialDeferredActiveTools?: readonly string[]
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  turnStream?: AgentTurnStreamController
  signal?: AbortSignal
  budget?: { maxTurns?: number; maxToolCalls?: number }
}

export interface RunCartographerAgentResult {
  reply: string
  terminalReason: string
  transcript: AgentTranscript
}

function renderArmorResultReply(task: string, result: RunMountainArmorWorkResult): string {
  if (result.ok) return `地貌绘制任务「${task}」已确认并写入地图：${result.summary}`
  if (result.reviewStatus === 'modify') return `${result.summary}\n请严格按这条修改意见重新调用 paintArmor 生成一份新草稿，再交给用户确认。`
  if (result.reviewStatus === 'deleted' || result.reviewStatus === 'cancelled') return result.summary
  return `地貌绘制任务「${task}」未完成：${result.error || '未知原因'}。可把任务描述写得更具体（大致方位/走向/规模）重试一次。`
}

function renderVectorResultReply(task: string, result: VectorPrimitiveWorkResult): string {
  if (result.ok) return `矢量直画任务「${task}」已确认并写入地图：${result.summary}`
  if (result.reviewStatus === 'modify') return `${result.summary}\n请严格按这条修改意见重新调用 drawVectorPrimitive 生成一份新草稿，再交给用户确认。`
  if (result.reviewStatus === 'deleted' || result.reviewStatus === 'cancelled') return result.summary
  return `矢量直画任务「${task}」未完成：${result.error || '未知原因'}`
}

interface CartographerToolContext {
  worldId: string
  paintCallModel: ArmorPainterCallModel
  confirmWrite?: ConfirmWriteChannel
  reviewDraft: ReviewMapDraft
  writeApi: CartographerWriteApi
}

const PLACEMENT_PROPERTIES = {
  placementMode: { type: 'string', enum: ['inside', 'expand'], description: '缺省 inside：最终几何必须留在 anchorFeature 内；只有用户明确要求向外延伸/开拓新区时才用 expand，并填写 direction。' },
  anchorFeature: { type: 'string', description: '放置锚点的准确要素名称或 featureId；inside 时作为包含边界，expand 时作为向外拓展的起点。' },
  direction: { type: 'string', enum: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'], description: 'expand 时必填：相对锚点向哪个方向开拓。' },
  gapKm: { type: 'number', description: 'expand 可选：新任务域与锚点边缘的间隔（公里，缺省 0）。' },
  offsetXKm: { type: 'number', description: '相对当前内容工作框中心向东偏移（公里，向西为负）。' },
  offsetYKm: { type: 'number', description: '相对当前内容工作框中心向南偏移（公里，向北为负）。' }
} as const

function createPaintArmorTool(ctx: CartographerToolContext): ToolDefinition {
  return {
    name: 'paintArmor',
    longRunning: true,
    brief: '用参数装甲画地形：terrain 必填 mountain/grass/river/water；river 只规划脊线，water 只规划闭合表面，河岸与水深都由代码派生。'
      + '山脉/河流/湖泊海洋永远用本工具，禁止用 drawVectorPrimitive 代替。'
      + '新地形通过几何校验后会先在真实地图上打开最终草稿审阅：用户可逐项确认、提出修改或删除；只有确认项会写入正式地图。'
      + '若工具回执带 reviewStatus="modify" 与 reviewFeedback，必须按意见重新调用本工具生成新草稿，不能把旧候选直接写入或口头宣称已完成。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task: { type: 'string', description: '作图任务短标题（必填）。' },
        instructions: { type: 'string', description: '任务书（必填）：用人话说明要画什么、放在哪里、希望多大。' },
        terrain: { type: 'string', enum: ['mountain', 'grass', 'river', 'water'], description: '必填：山脉、草原、河流或水体。' },
        name: { type: 'string', description: '要素名称（可选）。' },
        widthKm: { type: 'number', description: '任务域/成图宽度（公里，可选）。' },
        heightKm: { type: 'number', description: '任务域/成图高度（公里，可选）。' },
        ruggedness: { type: 'number', description: '草原装甲边缘碎折度 0~1（可选）。' },
        shape: { type: 'string', enum: ['organic', 'circle', 'ellipse'], description: 'grass 装甲可用；缺省 organic。' },
        sourceFeature: { type: 'string', description: 'river 可选：源头地形的准确名称或 featureId。' },
        mouthFeature: { type: 'string', description: 'river 可选：入海、入湖或汇流目标的准确名称或 featureId。' },
        sourceWidthM: { type: 'number', description: 'river 可选：源头满宽（米，>0）。' },
        mouthWidthM: { type: 'number', description: 'river 可选：河口满宽（米，>=源头宽度）。' },
        waterKind: { type: 'string', enum: ['lake', 'ocean'], description: 'water 可选：湖泊或海洋。' },
        maxDepthM: { type: 'number', description: 'water 可选：最大水深（米，1~12000）。' },
        seed: { type: 'number', description: '装甲复现种子（可选整数）。' },
        ...PLACEMENT_PROPERTIES
      },
      required: ['task', 'instructions', 'terrain']
    },
    validateArgs: (args) => {
      if (!String(args.task || '').trim()) return 'paintArmor 缺少 task'
      if (!String(args.instructions || '').trim()) return 'paintArmor 缺少 instructions'
      if (!['mountain', 'grass', 'river', 'water'].includes(String(args.terrain || ''))) return 'terrain 必须是 mountain/grass/river/water'
      if (args.placementMode === 'expand' && !String(args.direction || '').trim()) return 'placementMode="expand" 时必须填写 direction'
      return null
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const task = String(args.task || '').trim()
      const instructions = String(args.instructions || '').trim()
      const terrain = String(args.terrain || '')
      const brief = [`【地貌任务】${task}`, '', '【任务书】', instructions].join('\n')
      const widthM = Number(args.widthKm) > 0 ? Number(args.widthKm) * 1000 : undefined
      const heightM = Number(args.heightKm) > 0 ? Number(args.heightKm) * 1000 : undefined
      const placementInput = {
        placementMode: args.placementMode as MapPlacementMode | undefined,
        anchorFeature: args.anchorFeature as string | undefined,
        direction: args.direction as MapExpandDirection | undefined,
        gapKm: args.gapKm as number | undefined,
        offsetXKm: args.offsetXKm as number | undefined,
        offsetYKm: args.offsetYKm as number | undefined
      }
      const deps = {
        fetchBundle: ctx.writeApi.fetchWorldMapBundle,
        saveFeatures: ctx.writeApi.saveWorldMapFeaturesRemote,
        reviewDraft: ctx.reviewDraft
      }
      try {
        const result = terrain === 'grass'
          ? await runGrassArmorWork({
            worldId: ctx.worldId,
            name: String(args.name || task),
            ...(widthM ? { widthM } : {}),
            ...(heightM ? { heightM } : {}),
            shape: args.shape === 'circle' || args.shape === 'ellipse' ? 'exact' : 'organic',
            ...(Number.isFinite(Number(args.ruggedness)) ? { ruggedness: Number(args.ruggedness) } : {}),
            ...(Number.isFinite(Number(args.seed)) ? { seed: Number(args.seed) } : {}),
            placement: buildMapTaskPlacementRequest(placementInput, args.placementMode === 'expand' ? { widthM: widthM ? widthM * 1.15 : undefined, heightM: heightM ? heightM * 1.15 : undefined } : { widthM, heightM }),
            deps
          })
          : terrain === 'river'
            ? await runRiverArmorWork({
              worldId: ctx.worldId,
              task: brief,
              name: String(args.name || task),
              sourceFeature: args.sourceFeature as string | undefined,
              mouthFeature: args.mouthFeature as string | undefined,
              params: {
                sourceWidthM: args.sourceWidthM as number | undefined,
                mouthWidthM: args.mouthWidthM as number | undefined
              },
              ...(Number.isFinite(Number(args.seed)) ? { seed: Number(args.seed) } : {}),
              callModel: ctx.paintCallModel,
              placement: buildMapTaskPlacementRequest(placementInput, { widthM, heightM }),
              deps
            })
            : terrain === 'water'
              ? await runWaterArmorWork({
                worldId: ctx.worldId,
                task: brief,
                name: String(args.name || task),
                waterKind: args.waterKind as 'lake' | 'ocean' | undefined,
                params: { waterKind: args.waterKind as 'lake' | 'ocean' | undefined, maxDepthM: args.maxDepthM as number | undefined },
                ...(Number.isFinite(Number(args.seed)) ? { seed: Number(args.seed) } : {}),
                callModel: ctx.paintCallModel,
                placement: buildMapTaskPlacementRequest(placementInput, { widthM, heightM }),
                deps
              })
              : await runMountainArmorWork({
                worldId: ctx.worldId,
                task: brief,
                callModel: ctx.paintCallModel,
                placement: buildMapTaskPlacementRequest(placementInput, { widthM, heightM }),
                deps
              })
        return {
          content: renderArmorResultReply(task, result),
          ...(result.ok ? { status: 'success' as const } : {}),
          details: {
            ...(result.groupId ? { groupId: result.groupId } : {}),
            ...(result.reviewStatus ? { reviewStatus: result.reviewStatus } : {}),
            ...(result.reviewFeedback ? { reviewFeedback: result.reviewFeedback } : {})
          }
        }
      } catch (error) {
        return runtimeError(`地貌绘制任务「${task}」执行异常：${(error as Error)?.message || String(error)}`)
      }
    }
  }
}

function createDrawVectorPrimitiveTool(ctx: CartographerToolContext): ToolDefinition {
  return {
    name: 'drawVectorPrimitive',
    longRunning: true,
    brief: '用结构化基础图元直画，不调用模型、不接受原始 SVG/XML；shape 支持 circle/ellipse/rect/polygon/path。'
      + '湖泊和海洋必须用 paintArmor，不能用本工具绕过水深与河流连接协议。'
      + '新地形通过几何校验后会先在真实地图上打开最终草稿审阅；只有确认项会写入正式地图。'
      + '若回执带 reviewStatus="modify"，必须按意见重新调用本工具生成新草稿。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task: { type: 'string', description: '作图任务短标题（必填，仅用于展示与回执）。' },
        shape: { type: 'string', enum: ['circle', 'ellipse', 'rect', 'polygon', 'path'], description: '必填。' },
        category: { type: 'string', description: '必填，如 grass/forest/road；不能是 water。' },
        name: { type: 'string', description: '要素名称（可选）。' },
        radiusKm: { type: 'number', description: 'shape=circle 时必填。' },
        widthKm: { type: 'number', description: 'shape=ellipse/rect 时必填。' },
        heightKm: { type: 'number', description: 'shape=ellipse/rect 时必填。' },
        pointsKm: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'polygon/path 点列；每点 [xKm,yKm] 相对本次作画任务域中心。' },
        ...PLACEMENT_PROPERTIES
      },
      required: ['task', 'shape', 'category']
    },
    validateArgs: (args) => {
      const shape = String(args.shape || '')
      if (!['circle', 'ellipse', 'rect', 'polygon', 'path'].includes(shape)) return 'shape 必须是 circle/ellipse/rect/polygon/path'
      if (!String(args.category || '').trim()) return '缺少 category'
      if (String(args.category) === 'water') return '湖泊和海洋必须使用 paintArmor(terrain="water")，不能用 drawVectorPrimitive'
      const compatibilityError = validateVectorPrimitiveCategory(shape as 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path', String(args.category || ''))
      if (compatibilityError) return compatibilityError
      if (shape === 'circle' && !(Number(args.radiusKm) > 0)) return 'shape="circle" 时 radiusKm 必须大于 0'
      if ((shape === 'ellipse' || shape === 'rect') && (!(Number(args.widthKm) > 0) || !(Number(args.heightKm) > 0))) return `${shape} 需要大于 0 的 widthKm 和 heightKm`
      if ((shape === 'polygon' || shape === 'path') && !Array.isArray(args.pointsKm)) return `${shape} 需要 pointsKm 点列`
      if (args.placementMode === 'expand' && !String(args.direction || '').trim()) return 'placementMode="expand" 时必须填写 direction'
      return null
    },
    execute: async (call) => {
      const args = call.args as Record<string, unknown>
      const task = String(args.task || '').trim()
      const shape = args.shape as 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path'
      const category = String(args.category || '')
      const layer = ['road', 'street', 'building', 'organization', 'landmark', 'urban', 'character'].includes(category) ? 'civic' : 'terrain'
      const pointsKm = Array.isArray(args.pointsKm) ? (args.pointsKm as unknown[]) : undefined
      const pointsRelativeM = pointsKm
        ?.filter((point): point is [unknown, unknown] => Array.isArray(point) && point.length >= 2)
        .map((point) => [Number(point[0]) * 1000, Number(point[1]) * 1000] as [number, number])
        .filter((point) => point.every(Number.isFinite))
      const radiusM = Number(args.radiusKm) > 0 ? Number(args.radiusKm) * 1000 : undefined
      const widthM = Number(args.widthKm) > 0 ? Number(args.widthKm) * 1000 : undefined
      const heightM = Number(args.heightKm) > 0 ? Number(args.heightKm) * 1000 : undefined
      const placementInput = {
        placementMode: args.placementMode as MapPlacementMode | undefined,
        anchorFeature: args.anchorFeature as string | undefined,
        direction: args.direction as MapExpandDirection | undefined,
        gapKm: args.gapKm as number | undefined,
        offsetXKm: args.offsetXKm as number | undefined,
        offsetYKm: args.offsetYKm as number | undefined
      }
      try {
        const result = await runVectorPrimitiveWork({
          worldId: ctx.worldId,
          shape,
          category,
          name: String(args.name || task),
          layer,
          ...(radiusM ? { radiusM } : {}),
          ...(widthM ? { widthM } : {}),
          ...(heightM ? { heightM } : {}),
          ...(pointsRelativeM?.length ? { pointsRelativeM } : {}),
          placement: buildMapTaskPlacementRequest(placementInput, {
            widthM: shape === 'circle' && radiusM ? radiusM * 2 : widthM,
            heightM: shape === 'circle' && radiusM ? radiusM * 2 : heightM
          }),
          deps: {
            fetchBundle: ctx.writeApi.fetchWorldMapBundle,
            saveFeatures: ctx.writeApi.saveWorldMapFeaturesRemote,
            reviewDraft: ctx.reviewDraft
          }
        })
        return {
          content: renderVectorResultReply(task, result),
          ...(result.ok ? { status: 'success' as const } : {}),
          details: {
            ...(result.featureId ? { featureId: result.featureId } : {}),
            ...(result.reviewStatus ? { reviewStatus: result.reviewStatus } : {}),
            ...(result.reviewFeedback ? { reviewFeedback: result.reviewFeedback } : {})
          }
        }
      } catch (error) {
        return runtimeError(`矢量直画任务「${task}」执行异常：${(error as Error)?.message || String(error)}`)
      }
    }
  }
}

/** 简化版删除（母计划批C已披露的已知简化）：只按精确 featureId 或精确名称匹配，不做装甲分组自动展开——
 *  星依侧 deleteMapFeatures 的 expandArmorGroup 语义此处未复刻，只删中的那一个要素。 */
function createDeleteMapFeaturesTool(ctx: CartographerToolContext): ToolDefinition {
  return {
    name: 'deleteMapFeatures',
    longRunning: true,
    brief: '从当前世界地图删除一个或多个要素（软删留历史，写操作，会先弹确认）。'
      + 'targets 只传准确 featureId 或完整名称，单删传1项、批删一次传多项；不做同装甲组自动展开，只删中的那个要素。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        targets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 30, description: '要删除的准确 featureId 或完整要素名。' },
        reason: { type: 'string', description: '删除原因（可选，简短，展示在确认卡上）。' }
      },
      required: ['targets']
    },
    validateArgs: (args) => {
      if (!Array.isArray(args.targets) || !args.targets.length) return 'deleteMapFeatures 缺少 targets'
      if (args.targets.length > 30) return 'deleteMapFeatures 单次最多接收 30 个目标，请分批删除'
      if (args.targets.some((target: unknown) => !String(target || '').trim())) return 'targets 不能包含空项'
      return null
    },
    execute: async (call) => {
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '删除地图要素')!
      const rawTargets = (call.args.targets as unknown[]).map((target) => String(target || '').trim())
      const reason = String((call.args as Record<string, unknown>).reason || '').trim()
      let bundle: WorldMapBundle
      try {
        bundle = await ctx.writeApi.fetchWorldMapBundle(ctx.worldId)
      } catch (error) {
        return runtimeError(`读取待删除要素失败：${(error as Error)?.message || String(error)}`)
      }
      const allFeatures = (bundle.sheets || []).flatMap((sheet) => (sheet.features || []).map((feature) => ({ feature, sheetName: sheet.name })))
      const resolved = rawTargets.map((target) => allFeatures.find((item) => item.feature.id === target || item.feature.name === target))
      const missing = rawTargets.filter((target, index) => !resolved[index])
      if (missing.length) return invalidArgs(`找不到以下地图要素：${missing.join('、')}。请先确认准确 featureId 或完整名称。`)
      const items = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item))
      const firstItem = items[0]
      if (!firstItem) return invalidArgs('没有解析到任何待删除要素。')
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: items.length === 1 ? `删除地形「${firstItem.feature.name}」` : `批量删除 ${items.length} 个地图要素`,
        lines: [
          ...items.map((item) => `- ${item.feature.name}（${item.feature.id}，${item.feature.kind}/${item.feature.category}，图纸「${item.sheetName}」）`),
          ...(reason ? [`原因：${reason}`] : []),
          '这些要素会从当前地图移除并保留删除历史；当前没有一键恢复入口。'
        ]
      }, '删除地图要素')
      if (denied) return denied
      const runKey = `cartographer-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const runLabel = `舆图师删除·${reason || (items.length === 1 ? firstItem.feature.name : `${items.length}项`)}`
      const deleted: typeof items = []
      const failed: Array<{ item: typeof items[number]; message: string }> = []
      for (const item of items) {
        try {
          await ctx.writeApi.deleteWorldMapFeatureRemote(ctx.worldId, item.feature.id, { runKey, runLabel })
          deleted.push(item)
        } catch (error) {
          failed.push({ item, message: error instanceof Error ? error.message : String(error) })
        }
      }
      if (deleted.length) bumpTerrainRevision(ctx.worldId)
      const deletedNames = deleted.map((item) => `「${item.feature.name}」`).join('、')
      if (failed.length) {
        const failedText = failed.map(({ item, message }) => `「${item.feature.name}」（${item.feature.id}）：${message}`).join('；')
        return runtimeError(
          deleted.length
            ? `批量删除部分完成：已删除 ${deleted.length} 个要素（${deletedNames}）；另有 ${failed.length} 个失败：${failedText}。已成功的删除不会自动回滚，请不要整批重试，只处理失败项。`
            : `地图要素删除失败：${failedText}`
        )
      }
      const firstDeleted = deleted[0]
      return {
        content: deleted.length === 1 && firstDeleted
          ? `已从地图删除「${firstDeleted.feature.name}」（${firstDeleted.feature.id}）。`
          : `已从地图批量删除 ${deleted.length} 个要素：${deletedNames}。`,
        status: 'success'
      }
    }
  }
}

export async function runCartographerAgent(input: RunCartographerAgentInput): Promise<RunCartographerAgentResult> {
  const contextBlock = String(input.contextBlock || '').trim()
  if (!contextBlock) throw new Error('舆图师统一原始可见上下文为空，已拒绝启动')
  const skillAssembly = await assembleAgentSkillSupply({ profileId: 'huiyu.workspace' })
  const ctx: CartographerToolContext = {
    worldId: input.worldId,
    paintCallModel: input.paintCallModel,
    confirmWrite: input.confirmWrite,
    reviewDraft: input.reviewDraft,
    writeApi: input.writeApi
  }
  const tools: ToolDefinition[] = [
    createPaintArmorTool(ctx),
    createDrawVectorPrimitiveTool(ctx),
    createDeleteMapFeaturesTool(ctx)
  ]

  const systemContent = [
    '你是世界地图管理 Agent（舆图师），只负责当前世界当前图纸。地图新写链只有两条：paintArmor（参数装甲地形）与 drawVectorPrimitive（结构化基础图元）；旧 draft/draw/staged 绘舆链已冻结，不要使用。',
    '你既可以只读回答用户关于当前地图格局的问题（不调用任何写工具，直接给出分析和回复），也可以在用户明确要求时调用写工具。用户没有要求修改时，绝不能为了"完成任务"而擅自调用写工具。',
    '山脉/河流/湖泊/海洋永远用 paintArmor 对应 terrain；不要用 drawVectorPrimitive 绕过装甲协议。',
    '放置缺省 placementMode="inside"：最终几何必须留在锚点/当前内容范围内；只有用户明确要求向外延伸/开拓新区时才用 expand。',
    '新地形写入前会先弹最终草稿审阅，用户可能确认、要求修改或删除某些候选；回执带 reviewStatus="modify"时必须按意见重新调用同一工具生成新草稿，不能直接宣称已完成。'
  ].filter(Boolean).join('\n\n')

  const historyMessages = input.history ?? []
  const messages: AgentRuntimeMessage[] = [
    { role: 'system', content: systemContent },
    ...historyMessages.map((message): AgentRuntimeMessage => ({ role: message.role, content: message.content })),
    {
      role: 'user',
      content: `【统一原始可见上下文】\n${contextBlock}\n\n【当前专业地图摘要】\n${input.mapSummary || '（当前图纸暂无要素）'}\n\n【用户输入】\n${input.userText}`
    }
  ]

  return runWorkspaceAgentRuntime({
    profileId: 'huiyu.workspace',
    skillAssembly,
    agentName: CARTOGRAPHER_AGENT_NAME,
    gateId: 'cartographer-continuation-gate',
    nudgeActionHint: '核对/确认/画/改',
    messages,
    tools,
    callOrchestrator: input.callOrchestrator,
    signal: input.signal,
    ...(input.sourceSessionId
      ? { subagentControl: createSessionSubagentControlCapability(input.sourceSessionId) }
      : {}),
    onProgress: input.onProgress,
    initialTaskTodo: input.initialTaskTodo,
    initialDeferredActiveTools: input.initialDeferredActiveTools,
    onDeferredActiveToolsChange: input.onDeferredActiveToolsChange,
    onTaskTodoChange: input.onTaskTodoChange,
    turnStream: input.turnStream,
    budget: input.budget
  })
}
