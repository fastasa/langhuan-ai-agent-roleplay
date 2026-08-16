<template>
  <div class="sscope">
    <div class="sscope__title">确认取料范围</div>
    <div class="sscope__purpose">{{ purpose }}</div>
    <div class="sscope__hint">{{ hint }}</div>

    <div class="sscope__section">
      <div class="sscope__label">给谁建（角色或用户本人）</div>
      <div class="sscope__chips">
        <button
          v-for="option in hostOptions"
          :key="option.id"
          type="button"
          class="sscope__chip"
          :class="{ 'sscope__chip--on': selectedCharacter === option.name }"
          @click="selectedCharacter = selectedCharacter === option.name ? '' : option.name"
        >{{ option.name }}</button>
      </div>
    </div>

    <div class="sscope__section">
      <div class="sscope__label">参考哪些对话（可多选，只看这些）</div>
      <div class="sscope__chips">
        <button
          v-for="option in sessionOptions"
          :key="option.sessionId"
          type="button"
          class="sscope__chip"
          :class="{ 'sscope__chip--on': selectedSessions.includes(option.sessionId) }"
          @click="toggleSession(option.sessionId)"
        >{{ option.title }}<span v-if="option.label" class="sscope__chip-tag">{{ option.label }}</span></button>
        <div v-if="!sessionOptions.length" class="sscope__empty">还没有对话</div>
      </div>
    </div>

    <div class="sscope__section">
      <div class="sscope__label">文档库范围（可多选文件夹/文件·不选=不限）</div>
      <input v-model="docSearch" class="sscope__search" type="text" placeholder="搜索标题或路径…">
      <div class="sscope__tree">
        <div v-if="docLoading" class="sscope__empty">正在加载文档库…</div>
        <div v-else-if="!docRows.length" class="sscope__empty">文档库还没有可选内容</div>
        <div v-else-if="!visibleDocRows.length" class="sscope__empty">没有匹配「{{ docSearch }}」的内容</div>
        <template v-else>
          <div
            v-for="row in visibleDocRows"
            :key="row.id"
            class="sscope__tree-item"
            :class="{
              'sscope__tree-item--on': docRowState(row) === 'all',
              'sscope__tree-item--partial': docRowState(row) === 'partial',
              'sscope__tree-item--disabled': !row.docKeys.length
            }"
            :style="{ marginLeft: `${row.depth * 14}px` }"
            @click="toggleDocRow(row)"
          >
            <button
              v-if="row.isFolder"
              type="button"
              class="sscope__caret"
              :class="{ 'sscope__caret--collapsed': docCollapsed.has(row.id) }"
              :disabled="Boolean(docSearch.trim())"
              aria-label="展开/收起"
              @click.stop="toggleDocCollapse(row)"
            >▾</button>
            <span v-else class="sscope__caret sscope__caret--placeholder"></span>
            <span class="sscope__box">{{ docRowState(row) === 'all' ? '✓' : (docRowState(row) === 'partial' ? '–' : '') }}</span>
            <span class="sscope__tree-text">{{ row.title }}</span>
          </div>
        </template>
      </div>
    </div>

    <div v-if="allowFeedback" class="sscope__feedback">
      <input v-model="feedbackInput" class="sscope__search" type="text" placeholder="范围不合适？写下希望怎么改…" @keydown.enter="handleFeedbackKeydown">
      <button type="button" class="sscope__btn" :disabled="!feedbackInput.trim()" @click="submitFeedback">发送意见</button>
    </div>

    <div class="sscope__actions">
      <button type="button" class="sscope__btn sscope__btn--cancel" @click="$emit('cancel')">取消</button>
      <button
        type="button"
        class="sscope__btn sscope__btn--ok"
        :disabled="!selectedCharacter || !selectedSessions.length"
        @click="confirmCard"
      >确认范围</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 「建状态栏前确认取料范围」共享卡片（融入计划批次4·2026-07-10 从 XingyiDock 抽出）。
 *
 * 两处同源复用（联动能力·改交互/口径两侧同生效）：
 * - 星依浮坞 XingyiDock：Promise 直等接缝（confirm/cancel 事件 → resolve pendingStatusScope）；
 * - 提调坞 TidiaoDirectorDock：挂起-续跑模式（confirm/cancel → resumeTidiaoStatusScopeOrchestration 续跑统筹）。
 *
 * 自包含：对话选项自取（真聊天会话列表·非角色名册·sessionId 区分同名）、文档库两级树自取
 * （复用通用文档库勾选树纯函数）、预选逻辑内置
 * （角色按 characterHint 精确/子串；对话优先 preselectSessionId → 当前打开会话 → sessionHint）。
 * 卡片用 v-if 挂载/卸载：每次弹卡都是新实例，预选与树在 setup 期初始化一次。
 */
import { computed, ref } from 'vue'
import { useCharacterStore } from '../../stores/characterStore'
import { useChatStore } from '../../stores/chatStore'
import { isAgentSessionKind } from '../../../shared/agentSessionKinds'
import type { XingyiStatusScopeSelection } from '../../app/xingyiStatusScopeTool'
import {
  applyDocLibraryLinkRowCollapse,
  buildDocLibraryLinkTreeRows,
  docLinkRowSelectionState,
  filterDocLibraryLinkTreeRows,
  toggleDocLinkRow,
  type DocLibraryLinkTreeRow
} from '../../app/docLibraryLinkTree'
import { getCachedDocLibraryUnitView } from '../../app/docLibraryUnitViewCache'
import { fetchDocLibraryState } from '../../repositories/docBrainRepository'
import {
  countChatSessionCharacterParticipants,
  getChatStoreActiveSessionId,
  getChatStoreEntityMap
} from '../../repositories/chatRepository'
import { logger } from '../../utils/logger'

const props = withDefaults(defineProps<{
  /** 这次要建什么（卡顶展示，如「给张元英建角色状态栏」）。 */
  purpose: string
  /** 角色单选 chip 选项（状态栏宿主候选）：星依侧=全部角色；提调侧=会话成员。 */
  characterOptions: Array<{ id: string; name: string }>
  /** 预选角色名提示（精确/子串命中即预选·没命中留空让用户选）。 */
  characterHint?: string
  /** 预选对话名提示（优先级最低·见 preselectSessions）。 */
  sessionHint?: string
  /** 优先预选的 sessionId（提调侧=挂起会话·比「当前打开会话」更准）。 */
  preselectSessionId?: string
  /** 顶部说明文案（星依/提调各自口径）。 */
  hint?: string
  /** 星依阻塞式卡片开启；提调共享卡缺省关闭，避免改变其非阻塞编排协议。 */
  allowFeedback?: boolean
}>(), {
  characterHint: '',
  sessionHint: '',
  preselectSessionId: '',
  hint: '先选对角色、对话和文档库范围，取料只会在你确认的范围里进行，不会串到别的对话。',
  allowFeedback: false
})

const emit = defineEmits<{
  (e: 'confirm', selection: XingyiStatusScopeSelection): void
  (e: 'feedback', feedback: string): void
  (e: 'cancel'): void
}>()

const charStore = useCharacterStore()
const chatStore = useChatStore()

interface ScopeSessionOption { sessionId: string; title: string; label: string }

/** 对话选项 = 真正的聊天会话列表（不是角色/群名册！一个角色可能有多个会话，必须用 sessionId 区分）。
 *  与侧栏「最近对话」同源 chatStore.entities.chatSessions（排除星依常驻会话·排除归档·按 updatedAt 倒序）。
 *  搬迁自 XingyiDock listChatSessionOptions（2026-07-10 抽共享·口径逐字保留）。 */
function listChatSessionOptions(): ScopeSessionOption[] {
  const sessions = getChatStoreEntityMap<Record<string, Record<string, unknown>>>(chatStore, 'chatSessions') || {}
  const nameByTargetId = new Map<string, string>()
  for (const item of (charStore.characters || []) as Array<{ id?: unknown; name?: unknown }>) {
    const id = String(item?.id || '')
    if (id) nameByTargetId.set(id, String(item?.name || id))
  }
  for (const item of (charStore.groups || []) as Array<{ id?: unknown; name?: unknown }>) {
    const id = String(item?.id || '')
    if (id) nameByTargetId.set(id, String(item?.name || id))
  }
  return Object.values(sessions)
    .map((session): (ScopeSessionOption & { updatedAt: string }) | null => {
      const sessionId = String(session?.id || '').trim()
      // agent 内部会话（星依/编剧/舆图师，名单=shared/agentSessionKinds.ts）不作为可选对话（与侧栏同一隔离口径）
      if (!sessionId || isAgentSessionKind(session?.kind)) return null
      // 与侧栏「最近对话」同口径：归档会话不列入
      if (Boolean(session?.isArchived ?? session?.is_archived)) return null
      const targetId = String(session?.targetId ?? session?.target_id ?? '')
      const resolvedName = String(session?.title || nameByTargetId.get(targetId) || '').trim()
      // 解析不出名字的孤儿会话（archive_*/char_* 残留）不显示
      if (!resolvedName) return null
      const participantCount = countChatSessionCharacterParticipants(session)
      const updatedAt = String(
        session?.updatedAt ?? session?.updated_at ?? session?.lastMessageAt ?? session?.last_message_at ?? ''
      )
      // 「N人」展示=角色参与者+用户本人（2026-07-10 拍板·与侧栏/会话面板同口径）。
      return { sessionId, title: resolvedName, label: participantCount >= 2 ? `${participantCount + 1}人` : '', updatedAt }
    })
    .filter((item): item is ScopeSessionOption & { updatedAt: string } => Boolean(item))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map(({ updatedAt: _updatedAt, ...rest }) => rest)
}

const sessionOptions = ref<ScopeSessionOption[]>(listChatSessionOptions())

/** 宿主候选=固定「用户」chip（hostType='user'·2026-07-10 用户拍板玩家也要有状态栏）+ 传入角色。 */
const hostOptions = computed<Array<{ id: string; name: string }>>(() => [
  { id: '__user__', name: '用户' },
  ...props.characterOptions
])

/** 预选宿主：命中 hint（精确/子串）就预选其名，没命中留空让用户选。 */
function preselectCharacter(): string {
  const value = String(props.characterHint || '').trim()
  if (!value) return ''
  const exact = hostOptions.value.find((item) => item.name === value || item.id === value)
  if (exact) return exact.name
  const partial = hostOptions.value.find((item) => item.name.includes(value))
  return partial ? partial.name : ''
}

/** 预选对话：preselectSessionId（提调挂起会话）→ 当前打开会话 → sessionHint 命中；都没有留空让用户亲手选。
 *  宁可让用户自己选，也不自动挑错对话（同名会话认错正是要根治的 bug）。 */
function preselectSessions(): string[] {
  const preset = String(props.preselectSessionId || '').trim()
  if (preset && sessionOptions.value.some((item) => item.sessionId === preset)) return [preset]
  const activeSessionId = String(getChatStoreActiveSessionId(chatStore) || '').trim()
  if (activeSessionId && sessionOptions.value.some((item) => item.sessionId === activeSessionId)) return [activeSessionId]
  const value = String(props.sessionHint || '').trim()
  if (!value) return []
  const exact = sessionOptions.value.find((item) => item.title === value || item.sessionId === value)
  if (exact) return [exact.sessionId]
  const partial = sessionOptions.value.find((item) => item.title.includes(value))
  return partial ? [partial.sessionId] : []
}

const selectedCharacter = ref(preselectCharacter())
const selectedSessions = ref<string[]>(preselectSessions())
const feedbackInput = ref('')

function submitFeedback() {
  const feedback = feedbackInput.value.trim()
  if (feedback) emit('feedback', feedback)
}

// IME 选字确认回车守卫：composing 中放行原生行为，不把半拼文本当反馈发出去（同 XingyiDock.vue 口径）。
function handleFeedbackKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submitFeedback()
}

function toggleSession(sessionId: string) {
  const set = new Set(selectedSessions.value)
  if (set.has(sessionId)) set.delete(sessionId)
  else set.add(sessionId)
  selectedSessions.value = Array.from(set)
}

// ── 文档库范围两级树（复用通用文档库勾选树纯函数） ──
const docRows = ref<DocLibraryLinkTreeRow[]>([])
const docLoading = ref(false)
const docSearch = ref('')
const docDraft = ref<string[]>([])
const docCollapsed = ref<Set<string>>(new Set())

const docDraftSet = computed(() => new Set(docDraft.value))
// 搜索时忽略折叠展示命中分支，无关键字时按折叠集裁可见
const visibleDocRows = computed(() => {
  const keyword = docSearch.value.trim()
  if (keyword) return filterDocLibraryLinkTreeRows(docRows.value, keyword)
  return applyDocLibraryLinkRowCollapse(docRows.value, docCollapsed.value)
})
function docRowState(row: DocLibraryLinkTreeRow) {
  return docLinkRowSelectionState(docDraftSet.value, row)
}
function toggleDocRow(row: DocLibraryLinkTreeRow) {
  docDraft.value = toggleDocLinkRow(docDraft.value, row)
}
function toggleDocCollapse(row: DocLibraryLinkTreeRow) {
  const next = new Set(docCollapsed.value)
  if (next.has(row.id)) next.delete(row.id)
  else next.add(row.id)
  docCollapsed.value = next
}

async function loadDocTree() {
  docLoading.value = true
  try {
    const snapshot = await fetchDocLibraryState()
    const unitView = getCachedDocLibraryUnitView(snapshot.documents || [], snapshot.manualTreeOrders || {}, {
      treeNodes: snapshot.treeNodes,
      treeOrders: snapshot.treeOrders,
      treeDiffReport: snapshot.treeDiffReport
    })
    docRows.value = buildDocLibraryLinkTreeRows(unitView.units)
  } catch (error) {
    logger.warn('scope 卡加载文档库范围树失败:', error)
    docRows.value = []
  } finally {
    docLoading.value = false
  }
}
void loadDocTree()

/** 文档库范围的人话摘要（软锁提示用）：收「完整选中且父级未完整选中」的最上层行标题，去重限量。 */
function buildDocSummary(): string {
  const count = docDraft.value.length
  if (!count) return ''
  const selectedSet = docDraftSet.value
  const rowById = new Map(docRows.value.map((row) => [row.id, row]))
  const labels: string[] = []
  for (const row of docRows.value) {
    if (!row.docKeys.length || docLinkRowSelectionState(selectedSet, row) !== 'all') continue
    const parent = row.parentRowId ? rowById.get(row.parentRowId) : null
    if (parent && docLinkRowSelectionState(selectedSet, parent) === 'all') continue // 父已整选，取父即可
    labels.push(row.title)
    if (labels.length >= 6) break
  }
  const head = labels.length ? labels.join('、') : `${count} 个文档`
  return `${head}（共 ${count} 个文档）`
}

function confirmCard() {
  // 角色 + 至少一个对话都选了才放行（用户要求：建前必须确认选对角色和对话）
  if (!selectedCharacter.value || !selectedSessions.value.length) return
  const sessions = sessionOptions.value
    .filter((option) => selectedSessions.value.includes(option.sessionId))
    .map((option) => ({ title: option.title, sessionId: option.sessionId }))
  emit('confirm', {
    characterName: selectedCharacter.value,
    sessions,
    docScopeSummary: buildDocSummary()
  })
}
</script>

<style scoped>
/* 样式搬迁自 XingyiDock 的 .xingyi-dock__scope 系（2026-07-10 抽共享·外观逐字保留），
   色彩全走 --morandi- 与 --langhuan- 系 token（teleport/坞内深浅色都适配）。
   ⚠️ CSS 注释里绝不能出现「星号+斜杠」连写（会提前闭合注释·style 块 500 连坐 import 链）。 */
.sscope {
  padding: 9px 10px;
  border: 1px solid var(--langhuan-dialog-primary-bg, #4f867c);
  border-radius: 8px;
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 7%, var(--morandi-card, #fffdf8));
  font-size: 12px;
  line-height: 1.5;
  color: var(--morandi-text, #333);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sscope__title {
  font-weight: 600;
  font-size: 12px;
}

.sscope__purpose {
  font-weight: 600;
  color: var(--langhuan-dialog-primary-bg, #4f867c);
  word-break: break-word;
}

.sscope__hint {
  font-size: 11px;
  color: var(--morandi-text-light, #666);
}

.sscope__section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sscope__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--morandi-text-light, #666);
}

.sscope__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.sscope__chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 999px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
  cursor: pointer;
}

.sscope__chip:hover {
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
}

.sscope__chip--on {
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.sscope__chip-tag {
  font-size: 10px;
  opacity: 0.8;
}

.sscope__empty {
  padding: 4px 2px;
  font-size: 11px;
  color: var(--morandi-text-light, #666);
}

.sscope__search {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 6px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
}

.sscope__search:focus {
  outline: none;
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
}

.sscope__tree {
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 70%, transparent);
  border-radius: 6px;
  padding: 3px;
  background: var(--morandi-card, #fffdf8);
}

.sscope__tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  border-radius: 5px;
  cursor: pointer;
}

.sscope__tree-item:hover {
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 8%, transparent);
}

.sscope__tree-item--disabled {
  opacity: 0.5;
  cursor: default;
}

.sscope__tree-item--disabled:hover {
  background: transparent;
}

.sscope__caret {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--morandi-text-light, #666);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}

.sscope__caret--collapsed {
  transform: rotate(-90deg);
}

.sscope__caret--placeholder {
  cursor: default;
}

.sscope__box {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: var(--morandi-card, #fffdf8);
}

.sscope__tree-item--on .sscope__box,
.sscope__tree-item--partial .sscope__box {
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
}

.sscope__tree-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sscope__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 2px;
}

.sscope__feedback {
  display: flex;
  gap: 6px;
}

.sscope__btn {
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
  cursor: pointer;
}

.sscope__btn--ok {
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.sscope__btn--ok:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sscope__btn--cancel:hover {
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 40%, transparent);
}
</style>
