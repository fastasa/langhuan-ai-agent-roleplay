/**
 * 提调「3·对话可见历史」逐条结构化渲染（2026-07-01 增量2 起 · 2026-07-02 增量5 升级为「统一可见投影壳」）。
 *
 * 背景与演进：
 *   增量2：默认路 buildGroupCastRecentContext 只吐「谁：说啥（80字）」，元数据全丢 → 本函数渲染逐条结构化壳
 *          `〔序号·类型·名〕时间 · 地点 · 天气 · 模型\n正文`。
 *   增量5（用户 2026-07-02 拍板「对话可见历史=全是投影·只增不减·只显示对提调可见」）：把「元数据壳」与旧投影路
 *          renderDirectorProjectionRecentContext 合并成**一套统一壳**——正文换成**投影客观事实**（projectionResolver 提供时；
 *          该楼层无投影则兜底原文），加**可见性过滤（部分·见下方⚠️）**与 **300 兜底窗口**。「谁读投影都带时间/地点/天气/模型/序号」、且只喂对提调可见的。
 *
 * 可见性口径（2026-07-02 实查修正·已删除旧错误认知·别再被误导）：
 *   - {@link isVisibleRecallMessage}（chatAIRecallPreparation·角色提示词组装同款）：剔 narration_debug + 剔 autoWriteHidden。
 *     ⚠️ autoWriteHidden 现役语义**只管手动眼睛隐藏 + 旁白 profile 排除**（见 docs/features/chat/DEVELOPMENT.md 4/742），**不是**投影写轨迹消化标记。
 *   - {@link isMessageVisibleToDirector}（chatRepository·并集口径正式真值 P21）：任一候选角色可见即提调可见；靠每条消息的
 *     hidden 角色集（黑名单）——仅当**所有候选角色都 hidden**时该条才对提调不可见（并集）。
 *   - 「投影写轨迹后对某角色消化隐藏」的真数据在 **chat_message_projection_visibility** 表（per 投影×角色·visible/hidden）。
 *     ✅ 增量5.5（方案B·2026-07-02·复用不新建端点）已接入：调用方经 `hiddenCharacterIdsResolver` 把该消息 hidden 的角色集喂进来
 *     （数据来源＝现役观察端点已带的 `visibility` 行·本轮已随投影一并取回·见 useChatSendPipeline `loadDirectorProjectionObservations`），
 *     本函数按并集口径真正过滤掉「已被所有出场角色消化」的老消息。缺省 resolver 时回退 `message.hiddenForCharacterIds`（今全库未填充→空操作·兼容旧调用）。
 *
 * 序号真值：复用 {@link assignChatFloorNumbers}（角色N/旁白M），与提调 readChatMessage/readMessageProjection 回查同一套楼层号——
 *   「3·对话可见历史」标的序号，就是「4·已读资料」交叉标注（增量6）能回指的锚。用户消息不入楼层桶（标「用户（扮演X）」）。
 *
 * 联动维护：楼层分类规则若改，见 chatMessageFloor.ts 顶部「联动维护」清单。
 */

import { assignChatFloorNumbers, classifyChatFloorKind } from './chatMessageFloor'
import { isVisibleRecallMessage } from './chatAIRecallPreparation'
import { isMessageVisibleToDirector } from '../repositories/chatRepository'
// 批次B（2026-07-02·层3 兜底原文修正）：无投影兜底原文不再截断，但必须剔干净两类非正文——
// 思维链（<think>/【思考过程】·stripAiThoughtContent）与内嵌消息投影块（parseEmbeddedMessageProjectionOutput 取 visibleText）。
import { stripAiThoughtContent } from '../utils/aiOutput'
import { parseEmbeddedMessageProjectionOutput } from './messageProjectionAgent'
// 输入框图片上传计划批4·点C：历史用户消息带图时追加 caption 文字（提调层3 一律不带原生图）。
import { formatAttachmentNote, readMessageAttachments } from '../utils/chatAttachments'

/** 渲染所需最小消息形状（兼容 ChatMessage 库态 snake / 前端驼峰双写）。 */
export interface DirectorHistoryMessageLike {
  id?: unknown
  messageId?: unknown
  role?: unknown
  content?: unknown
  name?: unknown
  memberName?: unknown
  member_name?: unknown
  messageKind?: unknown
  message_kind?: unknown
  time?: unknown
  envDate?: unknown
  env_date?: unknown
  envLocation?: unknown
  env_location?: unknown
  envWeather?: unknown
  env_weather?: unknown
  model?: unknown
  autoWriteHidden?: unknown
  auto_write_hidden?: unknown
  hiddenForCharacterIds?: string[]
  // 图片附件（批4）：真实键名随消息来源浮动（toCamel 后的 attachmentsJson / 本地乐观回显的 attachments /
  // 兜底 attachments_json），一律经 readMessageAttachments(m) 探测，此处不强绑单一键名（见该函数 JSDoc）。
  attachmentsJson?: unknown
  attachments?: unknown
  attachments_json?: unknown
}

/** 投影正文解析结果（调用方从 projectionContext 读投影后按此形状回传·让本纯函数不耦合运行时投影读取）。 */
export interface DirectorHistoryProjectionRead {
  hasProjection?: boolean
  objectiveFact?: unknown
  endEnvText?: unknown
  changedText?: unknown
}

export interface RenderDirectorVisibleHistoryOptions {
  /** 兜底窗口·默认 300 条（可见集末 N 条；投影短·日常不触发）。<=0 表示不截断。 */
  maxMessages?: number
  /** 并集可见性口径的候选角色集（isMessageVisibleToDirector·空则不按角色收窄）。 */
  candidateCharacterIds?: readonly string[]
  /**
   * 每条消息「hidden 了哪些角色」的解析（增量5.5·方案B·投影写轨迹消化过滤）。
   * 提供即优先于 message.hiddenForCharacterIds；返回该消息被隐藏的角色 id 集（并集口径：所有候选都在集内才剔）。
   * 缺省则回退 message.hiddenForCharacterIds（兼容旧调用·今全库未填充→空操作）。
   */
  hiddenCharacterIdsResolver?: (message: DirectorHistoryMessageLike) => readonly string[] | null | undefined
  /** 投影正文解析（提供即「正文=投影客观事实·无投影兜底原文」；缺省=正文走原文·增量2 行为）。 */
  projectionResolver?: (
    kind: 'role' | 'narration',
    index: number,
    message: DirectorHistoryMessageLike
  ) => DirectorHistoryProjectionRead | null | undefined
  /**
   * 本轮分界锚（批次J1·2026-07-02 用户真机反馈）：本轮用户消息 id。提供且 >0 时，在**第一条 id 大于它的消息**前
   * 插一行 {@link DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK}——让提调（尤其纠偏/整轮重排时）一眼分出
   * 「哪些消息是这一轮刚生成的、用户意见针对的」，不必再调工具自查。本轮尚无新消息（无 id 更大者）则不插、零痕迹。
   */
  currentRoundBoundaryMessageId?: number
}

/** 本轮分界标注行（批次J1）：插在层3 里本轮新生成消息之前（单一真值·纠偏/重排入口与测试都认它）。 */
export const DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK = '〔本轮分界〕从此处开始，以下消息均为本轮刚生成（用户这次的意见针对的就是这些）。'

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

/**
 * 渲染提调「对话可见历史」（对提调可见的消息·统一投影壳·末 maxMessages 条兜底）。
 * 每条：`〔角色N·星依〕时间 · 地点 · 天气 · 模型 xxx\n<正文>`；正文＝投影客观事实（有 resolver 且该楼层有投影），
 * 无投影兜底原文——**不截断**，但剔思维链与内嵌【消息投影】块（层3 保持纯净·批次B 2026-07-02）。
 * 兼容旧位置参 maxMessages（number·增量2 遗留调用）；空列表返回空串（首轮无历史·调用方据此不注入该层）。
 */
export function renderDirectorVisibleHistory(
  messages: ReadonlyArray<DirectorHistoryMessageLike>,
  options: RenderDirectorVisibleHistoryOptions | number = {}
): string {
  const opts: RenderDirectorVisibleHistoryOptions = typeof options === 'number' ? { maxMessages: options } : (options || {})
  const maxMessages = opts.maxMessages ?? 300
  const candidateIds = opts.candidateCharacterIds || []
  const list = Array.isArray(messages) ? messages : []
  if (!list.length) return ''
  // 楼层号在全列表上算（保证「角色N/旁白M」编号与 UI/回查工具一致），再过滤可见性、取最近窗口渲染。
  const floorMap = assignChatFloorNumbers(list)
  // 可见性过滤（对提调可见）：剔调试旁白 + 剔手动隐藏(autoWriteHidden·非投影写轨迹消化) + 并集口径。
  // 并集黑名单来源：优先 hiddenCharacterIdsResolver（增量5.5·投影写轨迹消化真数据·chat_message_projection_visibility），
  //   缺省回退 message.hiddenForCharacterIds（兼容旧调用·今全库未填充→空操作）。
  const resolveHidden = opts.hiddenCharacterIdsResolver
  const visible = list.filter((m) => {
    if (!isVisibleRecallMessage(m)) return false
    const hiddenIds = resolveHidden ? resolveHidden(m) : m.hiddenForCharacterIds
    return isMessageVisibleToDirector(hiddenIds, candidateIds)
  })
  const recent = maxMessages > 0 ? visible.slice(-maxMessages) : visible.slice()
  const lines: string[] = []
  // 批次J1·本轮分界：锚 >0 时在第一条「id 大于锚」的消息前插标注行（id 缺失的消息视为历史·不触发）。
  const boundaryId = Number(opts.currentRoundBoundaryMessageId || 0)
  let boundaryInserted = false
  for (const m of recent) {
    if (boundaryId > 0 && !boundaryInserted) {
      const msgId = Number(m.id ?? m.messageId) || 0
      if (msgId > boundaryId) {
        lines.push(DIRECTOR_CURRENT_ROUND_BOUNDARY_MARK)
        boundaryInserted = true
      }
    }
    const kind = classifyChatFloorKind(m)
    const name = pick(m.memberName, m.name, m.member_name)
    // 序号·类型·名：角色/旁白用楼层号做序号；用户不入楼层，标「用户（扮演X）」。
    const labelParts: string[] = []
    const info = floorMap.get(m)
    if (kind === 'role') {
      labelParts.push(`角色${info ? info.index : '?'}`)
      if (name) labelParts.push(name)
    } else if (kind === 'narration') {
      labelParts.push(`旁白${info ? info.index : '?'}`)
    } else {
      labelParts.push('用户')
      if (name) labelParts.push(`扮演${name}`)
    }
    // 元数据：时间（优先剧内 env_date）· 地点 · 天气 · 模型（仅 AI 生成的角色/旁白有意义）。
    const time = pick(m.envDate, m.env_date, m.time)
    const location = pick(m.envLocation, m.env_location)
    const weather = pick(m.envWeather, m.env_weather)
    const model = kind === 'role' || kind === 'narration' ? pick(m.model) : ''
    const meta: string[] = []
    if (time) meta.push(time)
    if (location) meta.push(location)
    if (weather) meta.push(weather)
    if (model) meta.push(`模型 ${model}`)
    const header = `〔${labelParts.join('·')}〕${meta.length ? ` ${meta.join(' · ')}` : ''}`
    // 正文：投影优先（有 resolver 且该楼层有投影）→ 客观事实 +（起止环境/变化）；否则原文截断。
    let body = ''
    if (opts.projectionResolver && info && (kind === 'role' || kind === 'narration')) {
      const read = opts.projectionResolver(kind, info.index, m)
      if (read && read.hasProjection) {
        const objective = String(read.objectiveFact ?? '').replace(/\s+/g, ' ').trim()
        const envParts: string[] = []
        const endEnv = String(read.endEnvText ?? '').trim()
        const changed = String(read.changedText ?? '').trim()
        if (endEnv) envParts.push(endEnv)
        if (changed && changed !== '无时间/地点变化') envParts.push(changed)
        body = envParts.length ? `${objective}（${envParts.join('；')}）` : objective
      }
    }
    // 兜底原文（该楼层无投影）：不截断——先剔思维链（<think>/【思考过程】），再剔内嵌【消息投影】块取 visibleText，
    // 折叠空白成单行（保持「壳一行+正文一行」的逐条格式）。层3 纯净：思维链与投影块都不是可见正文。
    if (!body) {
      const withoutThink = stripAiThoughtContent(String(m.content ?? ''))
      const embedded = parseEmbeddedMessageProjectionOutput(withoutThink)
      const visibleSource = embedded.hasProjection ? embedded.visibleText : withoutThink
      body = String(visibleSource ?? '').replace(/\s+/g, ' ').trim()
    }
    // 输入框图片上传计划批4·点C：用户消息带附件时追加 caption 文字（层3 一律不带原生图，省 token）。
    if (kind !== 'role' && kind !== 'narration' && String(m.role ?? '').trim() === 'user') {
      const note = formatAttachmentNote(readMessageAttachments(m))
      if (note) body = `${body}${note}`
    }
    lines.push(body ? `${header}\n${body}` : header)
  }
  return lines.join('\n')
}
