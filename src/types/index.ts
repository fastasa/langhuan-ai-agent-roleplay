/**
 * 共享类型定义
 */

export * from './docBrain'
export * from './worldDraftImport'
export * from './characterBrain'
export * from './personalityKernel'
export * from './unitView'
export * from './unitContentPort'
export type {
  SessionNarrativeOverride,
  SessionOrchestrationState,
  SessionOrchestrationMaterials
} from '../../shared/orchestrationWorkspace'

import type {
  BrainDocumentRecord,
  BrainNeuronRecord,
  DocLibraryTreeDiffReport,
  DocLibraryTreeMigrationMeta,
  DocTreeNodeRecord,
  DocTreeOrders
} from './docBrain'
import type { RelationSystemState } from './unitView'
import type {
  CharacterBrainCandidateChange,
  CharacterBrainCognitionNode,
  CharacterBrainNodePositions,
  CharacterBrainPinnedOffsets,
  CharacterBrainRecallMetaMap,
  CharacterBrainTraceNode,
  CharacterBrainTrajectoryMeta
} from './characterBrain'
import type { PersonalityKernel } from './personalityKernel'

// ===== 票据相关 =====
export interface Ticket {
  id: string
  name: string
  cost: number
  count: number
  category?: string
  desc?: string
  // 数据库字段（下划线风格）
  category_id?: string
  timer_minutes?: number
  auto_consume_next?: number | boolean
  order_index?: number
  // 前端常用属性（驼峰风格）
  categoryId?: string
  timerMinutes?: number
  autoConsumeNext?: boolean
  orderIndex?: number
}

export interface TicketCategory {
  id: string
  name: string
  // 前端常用属性（驼峰风格）
  orderIndex?: number
}

export interface HistoryItem {
  action: string
  detail: string
  createdAt: string
}

// ===== 角色相关 =====
export interface Character {
  id: string
  name: string
  gender: string
  age: string
  emoji: string
  // 数据库字段（下划线风格）
  avatar_path: string
  group_id: string
  desc: string
  appearance: string
  outfit: string
  personality: string
  hobbies: string
  abilities: string
  experience: string
  worldview: string
  background: string
  speaking_style: string
  nicknames: string
  default_preset: string
  default_model: string
  role_temperature?: number | string
  role_max_tokens?: number | string
  role_thinking?: ModelThinkingMode | ''
  reply_pipeline_mode_override?: 'follow_session' | 'normal_recall' | 'personality_model' | string
  schedule: string
  yearly_schedule: string
  current_activities: string
  relationships: string
  affection: number
  locations: string
  orderIndex: number
  created_at: string
  // 前端常用属性（驼峰风格）
  avatarPath?: string
  groupId?: string
  speakingStyle?: string
  yearlySchedule?: string
  currentActivities?: string
  defaultPreset?: string
  defaultModel?: string
  roleTemperature?: number | string
  roleMaxTokens?: number | string
  roleThinking?: ModelThinkingMode | ''
  replyPipelineModeOverride?: 'follow_session' | 'normal_recall' | 'personality_model' | string
  brainLinks?: Record<string, string[]> | string
  brain_links?: string
  brainDocuments?: Record<string, string> | string
  brain_documents?: string
  brainCognitionNodes?: CharacterBrainCognitionNode[] | string
  brain_cognition_nodes?: string
  brainTraceNodes?: CharacterBrainTraceNode[] | string
  brain_trace_nodes?: string
  brainTrajectoryMeta?: CharacterBrainTrajectoryMeta | string
  brain_trajectory_meta?: string
  brainPinnedOffsets?: CharacterBrainPinnedOffsets | string
  brain_pinned_offsets?: string
  brainNodePositions?: CharacterBrainNodePositions | string
  brain_node_positions?: string
  brainCandidateChanges?: CharacterBrainCandidateChange[] | string
  brain_candidate_changes?: string
  personalityKernel?: PersonalityKernel | string
  personality_kernel?: string
  brainRecallMeta?: CharacterBrainRecallMetaMap | string
  brain_recall_meta?: string
}

export interface CharacterGroup {
  id: string
  name: string
  emoji?: string
  orderIndex?: number
}

// 群群（人群）
export interface Crowd {
  id: string
  name: string
  // 数据库字段（下划线风格）
  members: string | string[] | Array<Record<string, unknown>>
  default_preset: string
  group_id?: string
  // 前端常用属性（驼峰风格）
  defaultPreset?: string
  apiPreset?: string
  emoji?: string
  nickname?: string
  membersArr?: string[]
  locations?: string[]
  apiConfig?: { preset: string }
  groupId?: string
  orderIndex?: number
}

export interface Group {
  id: string
  name: string
  emoji: string
  members: string | string[] | Array<Record<string, unknown>>
  orderIndex?: number
  avatar_path?: string
  avatarPath?: string
  group_id?: string
  groupId?: string
}

// 别名（平行角色）
export interface Alias {
  id: string
  name: string
  gender: string
  age: string
  desc: string
  // 数据库字段（下划线风格）
  affections: string
  avatar_path?: string
  // 前端常用属性（驼峰风格）
  emoji?: string
  avatarPath?: string
  appearance?: string
  personality?: string
  outfit?: string
  hobbies?: string
  abilities?: string
  experience?: string
  worldview?: string
  background?: string
}

// 用户资料
export interface UserProfile {
  displayName?: string
  name: string
  gender: string
  age: string
  desc: string
  // 前端常用属性（驼峰风格）
  emoji?: string
  avatarPath?: string
  appearance?: string
  personality?: string
  outfit?: string
  hobbies?: string
  abilities?: string
  experience?: string
  worldview?: string
  background?: string
}

// ===== 聊天相关 =====
export interface ChatMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'system'
  message_kind?: 'chat' | 'narration' | 'narration_debug' | 'system' | string
  content: string
  time: string
  name?: string
  env_date?: string
  env_weather?: string
  env_location?: string
  image: string
  model: string
  crowd_name?: string
  member_name?: string
  narration_profile_id?: string
  narration_profile_name?: string
  narration_profile_kind?: string
  include_in_context?: number | boolean
  message_source_kind?: string
  focused_action_group_id?: string
  focused_action_visibility?: 'private' | 'public' | string
  versions_json?: string | ChatMessageVersion[]
  active_version_index?: number
  // 图片附件真值：本条消息的附件数组 JSON（见 src/utils/chatAttachments.ts 的 ChatImageAttachment/parseChatAttachments）。
  // ⚠️ 服务端 GET 消息列表经 toCamel 转换后键名是 attachmentsJson（已自动 JSON.parse 成数组），
  // 不是这里的 attachments_json（那是 DB 列名/未转换原始行的兜底）；读取一律用 readMessageAttachments(message)。
  attachments_json?: string
  attachmentsJson?: unknown
  // 星依过程流真值：本条 assistant 消息收编的轮次/工具流水 JSON（见 src/app/xingyiTurnStreamState.ts）。
  // Agent 对话信息流持久化投影；正式解析入口是 parseAgentTurnStream，业务视图不要自行 JSON.parse。
  turn_stream_json?: string
  turnStreamJson?: unknown
  auto_write_hidden?: number | boolean
  auto_write_hidden_at?: string
  auto_write_batch_id?: string
  auto_write_hidden_reason?: string
  created_at: string
  // 前端常用属性（驼峰风格）
  messageKind?: 'chat' | 'narration' | 'narration_debug' | 'system' | string
  crowdName?: string
  memberName?: string
  narrationProfileId?: string
  narrationProfileName?: string
  narrationProfileKind?: string
  includeInContext?: boolean
  messageSourceKind?: string
  focusedActionGroupId?: string
  focusedActionVisibility?: 'private' | 'public' | string
  envDate?: string
  envWeather?: string
  envLocation?: string
  versionsJson?: string | ChatMessageVersion[]
  activeVersionIndex?: number
  versionList?: ChatMessageVersion[]
  autoWriteHidden?: boolean
  autoWriteHiddenAt?: string
  autoWriteBatchId?: string
  autoWriteHiddenReason?: string
  hiddenForCharacterIds?: string[]
  hiddenForCharacterNames?: string[]
  hiddenForCharacterCount?: number
}

export interface ChatMessageNote {
  id: string
  session_id?: string
  sessionId?: string
  message_id?: number
  messageId?: number
  source_mode?: 'selection' | 'message' | string
  sourceMode?: 'selection' | 'message' | string
  source_text?: string
  sourceText?: string
  message_snapshot?: string
  messageSnapshot?: string
  message_index?: number
  messageIndex?: number
  floor_label?: string
  floorLabel?: string
  speaker_name?: string
  speakerName?: string
  role?: string
  env_date?: string
  envDate?: string
  env_weather?: string
  envWeather?: string
  env_location?: string
  envLocation?: string
  model?: string
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
}

export interface ChatMessageVersion {
  content: string
  time?: string
  model?: string
  memberName?: string
  crowdName?: string
  createdAt?: string
}

export interface ChatPromptLogBlock {
  role: 'system' | 'user' | 'assistant'
  title: string
  content: string
}

export interface ChatPromptLogEntry {
  id: string
  sessionId: string
  pageIndex: number
  entryIndex: number
  totalIndex?: number
  totalCount?: number
  kindIndex?: number
  kindTotal?: number
  messageKind?: string
  assistantMessageId?: number
  speakerName?: string
  targetId?: string
  logKind?: string
  hasReply?: boolean
  hasProjection?: boolean
  finalPrompt: string
  promptBlocks: ChatPromptLogBlock[]
  deleted?: boolean
  createdAt: string
}

export interface ChatPromptLogPage {
  sessionId: string
  currentPage: number
  pageSize: number
  totalEntries: number
  totalPages: number
  items: ChatPromptLogEntry[]
}

export interface ChatPromptLogLocateResult {
  page: number
  logId: string
  entry?: ChatPromptLogEntry
  hasReply?: boolean
  hasProjection?: boolean
}

export interface ChatRecallActivityLogEntry {
  id: string
  sessionId: string
  pageIndex: number
  entryIndex: number
  inputMessageId?: number
  assistantMessageId?: number
  speakerName?: string
  targetId?: string
  runId?: string
  status?: string
  activity: Record<string, unknown>
  createdAt: string
}

export interface ChatRecallActivityLogPage {
  sessionId: string
  currentPage: number
  pageSize: number
  totalEntries: number
  totalPages: number
  items: ChatRecallActivityLogEntry[]
}

// 聊天摘要
export interface Summary {
  id: string
  title: string
  content: string
  tags: string[]
  // 数据库字段（下划线风格）
  char_id: string
  created_at: string
  // 前端常用属性（驼峰风格）
  charId?: string
}

// 小摘要（用于列表）
export interface SmallSummary {
  id: string
  // 数据库字段（下划线风格）
  char_id: string
  session_id: string
  // 前端常用属性（驼峰风格）
  charId?: string
  sessionId?: string
  name?: string
  content?: string
  tags?: string[]
}

export interface ChatSessionParticipant {
  id: string
  session_id: string
  participant_target_id: string
  participant_type: 'char' | 'group' | 'crowd' | string
  display_order?: number
  reply_probability?: number
  role?: string
  character_state_mode?: 'follow_main' | 'independent_snapshot' | string
  character_branch_id?: string
  created_at?: string
  updated_at?: string
  // 前端常用属性（驼峰风格）
  sessionId?: string
  participantTargetId?: string
  participantType?: 'char' | 'group' | 'crowd' | string
  displayOrder?: number
  replyProbability?: number
  characterStateMode?: 'follow_main' | 'independent_snapshot' | string
  characterBranchId?: string
  resolvedCharacter?: Character | Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface ChatSessionTemporaryCharacter {
  id: string
  session_id: string
  name: string
  aliases_json?: string
  markdown?: string
  source_ledger_json?: string
  locked_fields_json?: string
  status?: string
  created_at?: string
  updated_at?: string
  // 前端常用属性（驼峰风格）
  sessionId?: string
  aliases?: string[]
  aliasesJson?: string
  sourceLedger?: Array<Record<string, unknown>>
  sourceLedgerJson?: string
  lockedFields?: string[]
  lockedFieldsJson?: string
  createdAt?: string
  updatedAt?: string
}

export type SessionTemporaryEntityKind = 'character' | 'building' | 'region' | 'faction' | 'item' | string

export interface ChatSessionTemporaryEntity {
  id: string
  session_id: string
  kind: SessionTemporaryEntityKind
  name: string
  aliases_json?: string
  markdown?: string
  tags_json?: string
  source_ledger_json?: string
  status?: string
  persisted_target_json?: string
  world_id?: string
  created_at?: string
  updated_at?: string
  // 前端常用属性（驼峰风格）
  sessionId?: string
  aliases?: string[]
  aliasesJson?: string
  tags?: string[]
  tagsJson?: string
  sourceLedger?: Array<Record<string, unknown>>
  sourceLedgerJson?: string
  persistedTarget?: Record<string, unknown>
  persistedTargetJson?: string
  worldId?: string
  createdAt?: string
  updatedAt?: string
}

// ── 状态栏积木（对话级骨架·计划书 2026-07-08_状态系统积木骨架计划）──
// 字段六型：text/number/list 普通值、ref 单位引用、binding 既有真值穿透、asset 正式不可变图片资产引用。
export type StatusPanelFieldValueType = 'text' | 'number' | 'list' | 'ref' | 'binding' | 'asset'

export interface StatusPanelFieldDef {
  key: string
  label: string
  /** 独立单位元数据；数值本身保持纯 number，展示时统一拼到标题后。 */
  unit?: string
  valueType: StatusPanelFieldValueType
  binding?: string
  description?: string
  defaultValue?: unknown
  /** 面板视觉分区：short=挤进顶部紧凑 HUD 格（情绪/健康/数值等一眼看的短状态），long=整行长字段。
   *  缺省时按 valueType 推断（number→short，其余→long）；只影响展示排版，不改真值。 */
  size?: 'short' | 'long'
}

export type StatusPanelKind = 'character' | 'organization' | 'building' | string

/** 状态栏宿主：character=正式角色 / temp_entity=会话临时实体 / user=用户本人（2026-07-10 用户拍板
 *  「玩家也要有状态栏」·一会话一用户故无 hostId）/ none=独立实体（物品/组织/世界级）。 */
export type StatusPanelHostType = 'character' | 'session_character' | 'temp_entity' | 'world_entity' | 'user' | 'none'

export interface ChatStatusPanelTemplate {
  id: string
  sessionId: string
  kind: StatusPanelKind
  name: string
  description?: string
  fields: StatusPanelFieldDef[]
  fieldsJson?: string
  /** 受控展示协议种子；实例新建时复制，之后独立演化。 */
  presentation?: import('../../shared/statusPanelPresentation').StatusPanelPresentation | null
  presentationJson?: string
  createdBy?: 'user' | 'agent' | string
  /** 模板乐观锁版本；新建为 1，更新必须以当前版本为 expectedVersion。 */
  version: number
  status?: string
  createdAt?: string
  updatedAt?: string
}

export interface ChatStatusPanel {
  id: string
  sessionId: string
  templateId: string
  name: string
  /** 这张实例具体记录什么；用于短目录检索，不复制字段当前值。 */
  description?: string
  hostType: StatusPanelHostType
  hostId?: string
  values: Record<string, unknown>
  valuesJson?: string
  /** 实例自带字段快照（多维表格化批次B）：新建时从模板拷贝、之后各自演化；空数组=旧实例，消费方回退模板字段。 */
  fields?: StatusPanelFieldDef[]
  fieldsJson?: string
  /** 实例展示快照；不跟随模板后续修改。 */
  presentation?: import('../../shared/statusPanelPresentation').StatusPanelPresentation | null
  presentationJson?: string
  /** 服务端按当前正式值计算的可见降级诊断，不落第二份数值真值。 */
  presentationDiagnostics?: import('../../shared/statusPanelPresentation').StatusPanelPresentationDiagnostic[]
  // binding 字段的当前真值（服务端读侧解析下发，真值住在绑定目标处不落 values）
  bindingValues?: Record<string, string>
  /** 乐观锁版本；新建提交 expectedVersion=0，更新/删除必须回传当前版本。 */
  version: number
  status?: string
  createdAt?: string
  updatedAt?: string
}

export interface StatusPanelAssetRef {
  assetId: string
  kind: 'image'
  alt: string
  caption?: string
}

export interface ChatStatusAsset {
  id: string
  sessionId: string
  worldId?: string
  kind: 'image'
  originalFilename: string
  mimeType: string
  sizeBytes: number
  sourceType: 'upload' | 'pixel_snapshot'
  sourceRef?: Record<string, unknown>
  status?: string
  createdAt?: string
  updatedAt?: string
}

export type ChatStatusPanelEventType = 'created' | 'patched' | 'deleted'

export interface ChatStatusPanelEvent {
  id: string
  panelId: string
  sessionId: string
  worldId?: string
  eventType: ChatStatusPanelEventType
  fromVersion: number
  toVersion: number
  patchJson?: string
  source?: string
  idempotencyKey: string
  createdAt?: string
}

// ── 剧本统一编排：会话世界线角色在场（批次 1）──
export type CharacterPresenceState = 'unknown' | 'present' | 'offstage'
export type CharacterPresenceEventType = 'proposed' | 'committed' | 'cancelled' | 'corrected'
export type CharacterPresenceTransition = 'enter' | 'exit' | 'stay' | 'unknown_to_present' | 'unknown_to_offstage'

export interface ChatSessionCharacterPresence {
  id: string
  sessionId: string
  worldId: string
  participantId: string
  presenceState: CharacterPresenceState
  locationText?: string
  mapSheetId?: string
  mapFeatureId?: string
  sinceMessageId?: string
  version: number
  lastModifiedSource?: string
  createdAt?: string
  updatedAt?: string
  persisted?: boolean
}

export interface ChatSessionCharacterPresenceEvent {
  id: string
  presenceId: string
  sessionId: string
  worldId: string
  participantId: string
  eventType: CharacterPresenceEventType
  transition: CharacterPresenceTransition
  fromState: CharacterPresenceState
  toState: CharacterPresenceState
  provisional: boolean
  proposalEventId?: string
  sourceMessageId?: string
  sourceDirectorRunId?: string
  sourceAgentRunId?: string
  evidenceSummary?: string
  idempotencyKey: string
  createdAt?: string
}

export interface ChatSessionCharacterPresenceBundle {
  sessionId: string
  worldId: string
  items: ChatSessionCharacterPresence[]
}

// ── 世界（跨会话共享一等实体·地图系统批2·计划书 2026-07-10_地图系统计划书）──
// 地图图纸与状态栏世界级归属的根；会话经 chat_sessions.world_id 挂入（空串=未挂）
export interface World {
  id: string
  name: string
  description?: string
  status?: string
  createdAt?: string
  updatedAt?: string
  /** 被多少会话挂入（服务端列表接口附带的展示辅助，非库字段） */
  sessionCount?: number
  /** 挂了多少张舆图图纸（服务端列表接口附带的展示辅助，非库字段·星依世界寻址批·2026-07-13） */
  mapSheetCount?: number
  /** 世界默认图纸唯一真值；服务端会把历史空值/脏引用投影为有效回退值。 */
  defaultMapSheetId?: string
}

export type WorldEntityKind = 'organization' | 'item' | 'location' | 'building' | 'region' | 'other'

export interface WorldEntity {
  id: string
  worldId: string
  kind: WorldEntityKind
  name: string
  aliases?: string[]
  markdown?: string
  tags?: string[]
  sourceLedger?: unknown[]
  mapSheetId?: string
  mapFeatureId?: string
  status?: string
  version?: number
  createdAt?: string
  updatedAt?: string
}

// ── 地图数据骨架（地图系统批4）：服务端 bundle 视图形状（JSON 列已在 service 层 parse 成对象）──
export interface WorldMapFeatureRecord {
  id: string
  sheetId: string
  worldId: string
  kind: 'region' | 'path' | 'marker' | string
  category: string
  name: string
  layer: 'terrain' | 'civic' | string
  /** 几何真值：坐标单位米；region=轮廓多边形 / path=折线 / marker=单点；spine=山脉走向脊线；
   *  elevationM=海拔米数（批1·地图视觉大改物理真值，region 专用，缺省按类目兜底表渲染） */
  geometry: { pts: Array<[number, number]>; spine?: Array<[number, number]>; elevationM?: number; depthM?: number }
  /** 呈现参数（rough/label 系列/minScale 等，展开进 MapFeature 顶层渲染）——注释里禁写「星号+斜杠」连写，会提前闭合块注释 */
  style?: Record<string, unknown> | null
  /** 状态锚点（批7 联动实装） */
  links?: { panelId?: string; hostType?: string; hostId?: string } | null
  /** 来源追溯（originSessionId/seed 等） */
  meta?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
}

export interface WorldMapSheet {
  id: string
  worldId: string
  name: string
  /** 已探范围多边形（迷雾挖洞+陆地底+已探面积三合一真值）；null=还没探索 */
  explored: { pts: Array<[number, number]> } | null
  features: WorldMapFeatureRecord[]
  createdAt?: string
  updatedAt?: string
}

export interface WorldMapBundle {
  world: World
  defaultMapSheetId: string
  sheets: WorldMapSheet[]
}

// ── 地图版本历史（2026-07-12 批L）：服务端按 run 分组的变更历史视图形状 ──
/** 地图写调用的派发运行标识（绘舆子agent 派发链路注入；用户手动/旧调用方不传=服务端记 'manual'） */
export interface WorldMapWriteRunMeta {
  runKey?: string
  runLabel?: string
}

export interface WorldMapChangeItem {
  id: string
  op: 'add' | 'update' | 'delete' | string
  featureId: string
  /** 该笔操作后的要素快照（delete=删除前最后快照）；服务端已 parse 成对象，对照模式直接取几何画幽灵轮廓 */
  snapshot: Partial<WorldMapFeatureRecord> & Record<string, unknown>
  createdAt: string
}

export interface WorldMapChangeRunGroup {
  groupId: string
  runKey: string
  runLabel: string
  startedAt: string
  endedAt: string
  counts: { add: number; update: number; delete: number }
  items: WorldMapChangeItem[]
}

export interface ChatSession {
  id: string
  target_id: string
  target_type: string
  title?: string
  conversation_avatar_path?: string
  conversation_emoji?: string
  is_archived?: number | boolean
  archive_name?: string
  archive_category?: string
  linked_archive_id?: string
  source_target_id?: string
  created_at?: string
  // 数据库字段（下划线风格）
  loaded_summary_ids: string | string[]
  caps_residue_state_json?: string
  virtual_scene_name?: string
  virtual_scene_desc?: string
  virtual_location: string
  virtual_location_large?: string
  virtual_location_middle?: string
  virtual_location_small?: string
  virtual_scene_world_id?: string
  virtual_location_sheet_id?: string
  virtual_location_feature_id?: string
  virtual_real_location?: string
  virtual_time: string
  virtual_time_anchor?: number
  virtual_time_base: number
  virtual_time_rate?: number
  virtual_weather?: string
  virtual_weather_mode?: string
  bound_alias: string
  narration_frequency?: 'silent' | 'standard' | 'active' | string
  narration_temperature?: 'documentary' | 'light' | 'standard' | 'open' | 'bloom' | string
  narration_profiles?: string | unknown[]
  narration_force_enabled?: number | boolean
  chat_font_scale?: number
  dynamic_world_enabled?: number | boolean
  reply_pipeline_mode?: 'normal_recall' | 'pure_prompt' | 'personality_model' | 'fast_reply' | string
  temp_model: string
  temp_preset: string
  /** 会话所属世界（地图系统批2）：空串=未挂；挂接只走 POST /chat-sessions/:id/world */
  world_id?: string
  world_entity_count?: number
  updated_at: string
  participants?: ChatSessionParticipant[]
  // 前端常用属性（驼峰风格）
  conversationAvatarPath?: string
  conversationEmoji?: string
  loadedSummaryIds?: string | string[]
  capsResidueState?: Record<string, unknown>
  capsResidueStateJson?: string
  virtualSceneName?: string
  virtualSceneDesc?: string
  virtualLocation?: string
  virtualLocationLarge?: string
  virtualLocationMiddle?: string
  virtualLocationSmall?: string
  virtualSceneWorldId?: string
  virtualLocationSheetId?: string
  virtualLocationFeatureId?: string
  virtualRealLocation?: string
  virtualTime?: string
  virtualTimeAnchor?: number
  virtualTimeBase?: number
  virtualTimeRate?: number
  virtualWeather?: string
  virtualWeatherMode?: string
  boundAlias?: string
  narrationFrequency?: 'silent' | 'standard' | 'active' | string
  narrationTemperature?: 'documentary' | 'light' | 'standard' | 'open' | 'bloom' | string
  narrationProfiles?: string | unknown[]
  narrationForceEnabled?: boolean
  chatFontScale?: number
  dynamicWorldEnabled?: boolean
  replyPipelineMode?: 'normal_recall' | 'pure_prompt' | 'personality_model' | 'fast_reply' | string
  tempModel?: string
  tempPreset?: string
  worldId?: string
  /** 当前世界地图/帷幕的服务端只读投影。 */
  worldName?: string
  worldDefaultMapSheetId?: string
  worldMapSheets?: Array<{ id: string; name: string }>
  curtainWorldId?: string
  curtainMapSheetId?: string
  curtainMapFeatureName?: string
  /** 服务端按 world_doc_library_links 计算的只读投影，不是会话写入字段。 */
  worldDocLibraryDocumentIds?: string[]
  worldEntityCount?: number
  worldEntitySummaries?: Array<{ id: string; kind: string; name: string }>
  isArchived?: boolean
  archiveName?: string
  archiveCategory?: string
  linkedArchiveId?: string
  sourceTargetId?: string
  targetId?: string
}

// ===== 任务相关 =====
export interface Task {
  id: string
  title: string
  type: 'daily' | 'longterm' | 'bounty'
  status: 'active' | 'completed' | 'failed' | 'done'
  // 数据库字段（下划线风格）
  points_reward?: number
  exp_reward?: number
  deadline: string
  description: string
  assigner_name?: string
  publish_note?: string
  completion_note?: string
  timer_state?: TimerState | string
  category?: string
  order_index?: number
  created_at?: string
  // 前端常用属性（驼峰风格）
  pointsReward?: number
  expReward?: number
  orderIndex?: number
  createdAt?: number
  assignerName?: string
  publishNote?: string
  completionNote?: string
  resetTime?: number
  completedCount?: number
  failureReason?: string
  timerState?: TimerState
}

export interface TimerState {
  isRunning: boolean
  startTime: number | null
  accumulatedTime: number
  marks: TimerMark[]
}

export interface TimerMark {
  id: string
  type: string
  note: string
  time: number
  createdAt: string
  isStart?: boolean  // 是否是开始标记
  tagId?: string     // 关联的自定义标签ID
}

// 自定义标签
export interface CustomTag {
  id: string
  name: string
  color: string
  createdAt?: string
}

// 事栈条目
export interface EventStackItem {
  id: string
  date: string
  taskId?: string
  taskName: string
  taskType: 'daily' | 'longterm' | 'bounty' | 'resource'
  status?: 'active' | 'completed' | 'failed' | 'done'
  expReward: number
  durationSeconds: number
  timeAxis?: string
  notes?: string
  ticketsUsed?: Record<string, number>
  ticketsExchanged?: Record<string, number>
  pointsDelta: number
  moneyDelta: number
  timeBlocks?: string
  realLocation?: string
  realWeather?: string
  realTime?: string
  timelineJson?: Array<{ label: string; time: number; isStart?: boolean; note?: string; color?: string }>
  createdAt?: string
}

// 事栈每日汇总
export interface EventStackSummary {
  events: EventStackItem[]
  summary: {
    totalPoints: number
    totalMoney: number
    ticketChanges: Record<string, { used: number, exchanged: number }>
  }
}

export interface CustomTag {
  id: string
  name: string
  color: string
  createdAt?: string
  created_at?: string
}

export interface TaskLog {
  id: number
  // 数据库字段（下划线风格）
  task_id: string
  task_title: string
  completed_at: string
  duration_seconds: number
  timer_marks: string
  notes: string
  exp_earned: number
  // 前端常用属性（驼峰风格）
  taskId?: string
  taskTitle?: string
  completedAt?: string
  durationSeconds?: number
  timerMarks?: string
  expEarned?: number
}

export interface DailyReport {
  id: number
  date: string
  content: string
  // 数据库字段（下划线风格）
  tasks_summary: string
  tomorrow_tasks: string
  created_at: string
  name?: string
  card_color?: string
  category?: string
  // 前端常用属性（驼峰风格）
  tasksSummary?: string
  tomorrowTasks?: string
  createdAt?: string
  cardColor?: string
}

export interface UserLevel {
  level: number
  exp: number
  expToNext: number
  totalExp: number
  pointsBonus: number
}

export interface DailyActivity {
  date: string
  completedCount: number
  targetCount: number
}

// ===== API预设相关 =====
export interface ApiPreset {
  name: string
  originalName?: string
  provider_type?: string
  // 数据库字段（下划线风格）
  base_url?: string
  api_key?: string
  model: string
  available_models?: string[] | string
  max_tokens?: number
  temperature?: number
  is_default?: boolean
  fallback_preset?: string
  max_concurrency?: number
  min_interval?: number
  // 前端常用属性（驼峰风格）
  providerType?: string
  baseUrl?: string
  apiKey?: string
  hasApiKey?: boolean
  availableModels?: string[]
  maxTokens?: number
  isDefault?: boolean
  fallbackPreset?: string
  // 该端点的并发上限：全局令牌池按预设共享此值，默认 6
  maxConcurrency?: number
  // 该 API 凭据两次调用最短间隔（秒），默认 0（不节流）。
  minInterval?: number
  // 识图标记（输入框图片上传计划批2）：用户手工勾选，aiAppService 图片双通道分流据此判断内联/拍平。
  supports_vision?: number
  supportsVision?: boolean
}

export type AiProviderMode = 'custom'

export type RecallConfirmedContentStrategy = 'summary_gate' | 'full_aware'
export type RecallCandidateGenerationMode = 'parallel_merge' | 'rules_first' | 'embedding_first'
export type RecallIntentSnapshotMode = 'rules' | 'smart'
export type WriteBackAuditLogLevel = 'summary' | 'standard' | 'debug'
// 文本槽四值=书童 fast（最快最省·格式化/小判断）/校书 balanced（均衡·默认主力）/
// 执笔 message（角色消息与旁白正文专用）/掌阁 smart（最聪明最贵·创作与难题）。第五槽「编目」=嵌入向量，
// 走 embeddingPresetId 独立链路（服务端管理预设·与文本槽不同源），
// 不进本枚举——嵌入不经 buildModelUsageAiOptions 文本调用链，塞进来只会造出永远不该被调用的假档。
// 旧九槽 id（roleMessage/narrationMessage/quickJudge1/quickJudge2/balanced/orchestration/highVolume/highIntelligence/xingyi）
// 由 modelUsageConfig.normalizeModelUsageConfigs 读侧迁移映射兼容，库内旧字段不动、天然可回退。
export type ModelUsageSlotId = 'fast' | 'balanced' | 'message' | 'smart'
export type ModelThinkingMode = 'enabled' | 'disabled'
export type ModelServiceTier = '' | 'fast'
// 订阅桥 effort 来自本机 CLI/App Server 的当前模型目录；保留 string 才能兼容后续新增档位。
// 空串表示跟随模型默认值，不向桥协议显式传参。
export type ModelReasoningEffort = string

export interface ModelUsageConfig {
  id: ModelUsageSlotId
  label: string
  presetName: string
  model: string
  temperature: number
  maxTokens: number
  thinking: ModelThinkingMode
  /** 空串跟随渠道默认；fast 只由模型目录明确声明支持时开放。 */
  serviceTier: ModelServiceTier
}

export interface AgentModelConfig {
  id: string
  name: string
  agentType: 'brain' | string
  modelUsageConfigs?: ModelUsageConfig[]
  presetName: string
  recallModel?: string
  recallMaxTokens?: number
  disableRecallThinking?: boolean
  fallbackPresetName?: string
  fallbackRecallModel?: string
  fallbackRecallMaxTokens?: number
  embeddingPresetId?: string
  narrationQuickJudgePresetName?: string
  narrationQuickJudgeModel?: string
  narrativeBeatPresetName?: string
  narrativeBeatModel?: string
  narrativeBeatMaxTokens?: number
  narrationGenerationPresetName?: string
  narrationGenerationModel?: string
  virtualSceneLocationPresetName?: string
  virtualSceneLocationModel?: string
  virtualSceneLocationMaxTokens?: number
  intentSnapshotMode?: RecallIntentSnapshotMode
  recallCandidateMode: RecallCandidateGenerationMode
  recallContentStrategy: RecallConfirmedContentStrategy
  writeBackMaxReviewRounds: number
  writeBackAuditLogLevel: WriteBackAuditLogLevel
  enabled: boolean
  capabilities: string[]
}

export interface PromptPreset {
  id: string
  name: string
  content: string
  scene: string
  frequency: number | 'always' | 'once' | 'rare'
  enabled: boolean
  orderIndex: number
  role?: string
  promptGroup?: 'system' | 'recall' | 'scene' | 'preset_migration'
  usageMode?: 'always' | 'conditional' | 'manual'
  isRequired?: boolean | null
  scope?: 'chat_reply' | 'candidate_collect' | 'trajectory_merge' | 'soul_update' | 'compile_rewrite' | 'recall_compress' | 'recall_judge' | 'general'
  priority?: number
  summary?: string
  updatedAt?: string
}

// ===== 服务器加载数据 =====
export interface ServerData {
  resources?: {
    points: number
    bigTimeCount: number
    smallTimeCount: number
    money: number
  }
  tickets?: Ticket[]
  ticketCategories?: TicketCategory[]
  history?: HistoryItem[]
  characters?: Character[]
  characterGroups?: CharacterGroup[]
  groups?: Group[]
  crowds?: Crowd[]
  aliases?: Alias[]
  userProfile?: UserProfile
  personalityTrainingDatasets?: Array<Record<string, unknown>>
  personalityTrainingRuns?: Array<Record<string, unknown>>
  personalityModelVersions?: Array<Record<string, unknown>>
  personalityEvaluationSets?: Array<Record<string, unknown>>
  chatSessions?: ChatSession[]
  chatSessionParticipants?: ChatSessionParticipant[]
  characterSnapshots?: Array<Record<string, unknown>>
  chatSessionCharacterBranches?: Array<Record<string, unknown>>
  chatSessionTemporaryCharacters?: ChatSessionTemporaryCharacter[]
  chatSessionTemporaryEntities?: ChatSessionTemporaryEntity[]
  chatMessages?: ChatMessage[]
  chatMessageNotes?: ChatMessageNote[]
  chatAffectGateAudits?: Array<Record<string, unknown>>
  chatAffectLedgerEntries?: Array<Record<string, unknown>>
  chatAffectResidueCheckpoints?: Array<Record<string, unknown>>
  chatPromptLogs?: ChatPromptLogEntry[]
  chatRecallActivityLogs?: ChatRecallActivityLogEntry[]
  currentChatTarget?: string
  currentSession?: ChatSession | null
  currentMessages?: ChatMessage[]
  summaryLibrary?: Summary[]
  smallSummaries?: SmallSummary[]
  bigSummaries?: Array<{ id: string; name: string; content: string; merged_summary_ids?: string[]; created_at?: string; updated_at?: string }>
  documents?: BrainDocumentRecord[]
  documentTreeOrders?: Record<string, string[]>
  docLibrarySchemaVersion?: 1 | 2
  docLibraryTreeNodes?: DocTreeNodeRecord[]
  docLibraryTreeOrders?: DocTreeOrders
  docLibraryTreeMigrationMeta?: DocLibraryTreeMigrationMeta
  docLibraryTreeDiffReport?: DocLibraryTreeDiffReport
  docLibraryRelationSystemState?: RelationSystemState
  brainNeurons?: BrainNeuronRecord[]
  tasks?: Task[]
  taskLogs?: TaskLog[]
  dailyReports?: DailyReport[]
  recentMarkTypes?: string[]
  userLevel?: UserLevel
  dailyActivity?: DailyActivity
  settings?: Record<string, unknown>
  customTags?: CustomTag[]
  eventStack?: EventStackItem[]
  config?: Record<string, string>
}
