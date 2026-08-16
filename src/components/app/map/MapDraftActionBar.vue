<!-- 草案剪影底部操作条（地图草案剪影可视化计划批2）：贴弹窗底部、半透明、可折叠成细条——纯 UI 组件，
     不持有决策状态（选中集/三态标记/意见全在 MapViewerDialog，本组件只转发交互事件），
     从 MapViewerDialog.vue 拆出以控制该文件 diff 大小（联动能力：样式沿用 map-viewer 现有卡片/按钮视觉语言，
     后续如果 map-viewer 弹窗整体改配色，这里要同步）。 -->
<template>
  <div class="map-draft-bar" :class="{ closed: !open }">
    <header class="map-draft-bar__head" @click="emit('toggle')">
      <button type="button" class="map-draft-bar__toggle" :aria-label="open ? t('chat.mapDraftCollapse') : t('chat.mapDraftExpand')">
        <svg class="map-draft-bar__licon" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <span class="map-draft-bar__count">{{ t('chat.mapDraftSelectedCount', { count: selectedCount }) }}</span>
      <p v-if="open" class="map-draft-bar__hint">{{ mode === 'final' ? t('chat.mapFinalDraftHint') : t('chat.mapDraftHint') }}</p>
    </header>
    <div v-if="open" class="map-draft-bar__body" @click.stop>
      <div class="map-draft-bar__actions">
        <button type="button" :disabled="!selectedCount" @click="emit('accept')">{{ mode === 'final' ? t('chat.mapFinalDraftConfirm') : t('chat.mapDraftAccept') }}</button>
        <button type="button" :disabled="!selectedCount" @click="emit('reject')">{{ mode === 'final' ? t('chat.mapFinalDraftDelete') : t('chat.mapDraftReject') }}</button>
        <button type="button" :disabled="!hasReadyItems" @click="emit('accept-all-ready')">{{ mode === 'final' ? t('chat.mapFinalDraftConfirmAll') : t('chat.mapDraftAcceptAllReady') }}</button>
      </div>
      <div class="map-draft-bar__row">
        <input
          v-model="commentDraft"
          type="text"
          class="map-draft-bar__input"
          :disabled="!selectedCount"
          :placeholder="mode === 'final' ? t('chat.mapFinalDraftModifyPlaceholder') : t('chat.mapDraftCommentPlaceholder')"
          @keyup.enter="confirmComment"
        />
        <button type="button" class="map-draft-bar__comment-btn" :disabled="!selectedCount || !commentDraft.trim()" @click="confirmComment">
          {{ mode === 'final' ? t('chat.mapFinalDraftModify') : t('chat.mapDraftCommentConfirm') }}
        </button>
      </div>
      <div class="map-draft-bar__row">
        <input
          :value="note"
          type="text"
          class="map-draft-bar__input"
          :placeholder="t('chat.mapDraftNotePlaceholder')"
          @input="emit('update:note', ($event.target as HTMLInputElement).value)"
        />
        <button type="button" class="map-draft-bar__submit" :disabled="!submitEnabled" @click="emit('submit')">
          {{ submitLabel }}
        </button>
      </div>
      <!-- 已决策清单"挂起区"（真机返工批A）：折叠列表——色点+label+三态标签+意见摘要，点击行=地图选中并居中，
           行内可改意见/撤销。跟随本条已有的折叠操作条视觉语言，不另起浮层。 -->
      <div v-if="decidedItems.length" class="map-draft-bar__decided">
        <button type="button" class="map-draft-bar__decided-toggle" @click="decidedOpen = !decidedOpen">
          <svg class="map-draft-bar__licon" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
          {{ t('chat.mapDraftDecidedToggle', { count: decidedItems.length }) }}
        </button>
        <ul v-if="decidedOpen" class="map-draft-bar__decided-list">
          <li v-for="item in decidedItems" :key="item.id" class="map-draft-bar__decided-item">
            <button type="button" class="map-draft-bar__decided-row" @click="emit('select-decided', item.id)">
              <span class="map-draft-bar__decided-dot" :class="`c-${item.confidence}`"></span>
              <span class="map-draft-bar__decided-label">{{ item.label }}</span>
              <span class="map-draft-bar__decided-tag" :class="`m-${item.mark}`">{{ markLabel(item.mark) }}</span>
            </button>
            <p v-if="item.comment && editingId !== item.id" class="map-draft-bar__decided-comment">{{ item.comment }}</p>
            <div v-if="editingId === item.id" class="map-draft-bar__decided-edit">
              <input
                v-model="editDraft"
                type="text"
                class="map-draft-bar__input"
                :placeholder="t('chat.mapDraftDecidedEditPlaceholder')"
                @keyup.enter="confirmEdit(item.id)"
              />
              <button type="button" class="map-draft-bar__comment-btn" :disabled="!editDraft.trim()" @click="confirmEdit(item.id)">
                {{ t('chat.mapDraftDecidedEditConfirm') }}
              </button>
            </div>
            <div class="map-draft-bar__decided-actions">
              <button type="button" @click="startEdit(item)">{{ editActionLabel(item) }}</button>
              <button type="button" @click="emit('revoke-decided', item.id)">{{ t('chat.mapDraftDecidedRevoke') }}</button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** 已决策清单一行的展示数据（真机返工批A）：由父级（MapViewerDialog）从 draftSketches+sketchMarks+
 *  sketchComments 拼出，本组件只负责渲染与转发交互事件，不持有决策真值。 */
export interface MapDraftDecidedItem {
  id: string
  label: string
  confidence: 'ready' | 'confirm' | 'risk'
  mark: 'accepted' | 'rejected' | 'commented'
  comment?: string
}

const props = withDefaults(defineProps<{
  /** layout=旧格局剪影；final=新写链最终矢量确认门。 */
  mode?: 'layout' | 'final'
  /** 折叠态：true=展开。 */
  open: boolean
  /** 当前选中的剪影数量（驱动「已选 N 项」文案与批量按钮禁用态）。 */
  selectedCount: number
  /** 是否存在 confidence='ready' 项（「绿色全部采纳」按钮可用性）。 */
  hasReadyItems: boolean
  /** 是否已有任意三态标记（无标记时提交按钮禁用）。 */
  submitEnabled: boolean
  /** 整体意见（可选·随决策一并提交），受控输入——父持有真值。 */
  note: string
  /** 已采纳/已弃用/已给意见的数量（真机返工批A：提交按钮带计数文案）。 */
  acceptedCount: number
  rejectedCount: number
  commentedCount: number
  /** 已决策清单（真机返工批A 新增"挂起区"）。 */
  decidedItems: MapDraftDecidedItem[]
}>(), { mode: 'layout' })

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'accept'): void
  (e: 'reject'): void
  (e: 'accept-all-ready'): void
  /** 对当前选中项批注确认（回车或点按钮）：text 已 trim 且非空。 */
  (e: 'comment', text: string): void
  (e: 'update:note', value: string): void
  (e: 'submit'): void
  /** 点击已决策清单某行：地图选中并居中该剪影（真机返工批A）。 */
  (e: 'select-decided', id: string): void
  /** 改意见确认（真机返工批A）：text 已 trim 且非空。 */
  (e: 'edit-decided-comment', payload: { id: string; text: string }): void
  /** 撤销该项决策，回到未决态（真机返工批A）。 */
  (e: 'revoke-decided', id: string): void
}>()

const { t } = useI18n()

// 对选中项的批注框：确认后清空，等待下一次输入（不复用 note 的受控模式，避免每次按键都触发父级写 comments）。
const commentDraft = ref('')
function confirmComment() {
  const text = commentDraft.value.trim()
  if (!text || !props.selectedCount) return
  emit('comment', text)
  commentDraft.value = ''
}

// 提交按钮带计数文案（真机返工批A）：未标记任何项时保持朴素文案（此时按钮本就禁用），
// 有标记后改「提交决策（采纳3·弃用1·意见2）」，让用户一眼看清这轮决策的构成。
const submitLabel = computed(() => {
  if (props.mode === 'final') {
    return props.submitEnabled
      ? t('chat.mapFinalDraftSubmitWithCounts', { confirmed: props.acceptedCount, deleted: props.rejectedCount, modified: props.commentedCount })
      : t('chat.mapFinalDraftSubmit')
  }
  return props.submitEnabled
    ? t('chat.mapDraftSubmitWithCounts', { accepted: props.acceptedCount, rejected: props.rejectedCount, commented: props.commentedCount })
    : t('chat.mapDraftSubmit')
})

// 已决策清单折叠态 + 行内改意见的编辑态（真机返工批A）
const decidedOpen = ref(false)
const editingId = ref('')
const editDraft = ref('')
function markLabel(mark: MapDraftDecidedItem['mark']): string {
  if (props.mode === 'final') {
    if (mark === 'accepted') return t('chat.mapFinalDraftMarkedConfirmed')
    if (mark === 'rejected') return t('chat.mapFinalDraftMarkedDeleted')
    return t('chat.mapFinalDraftMarkedModified')
  }
  if (mark === 'accepted') return t('chat.mapDraftMarkAccepted')
  if (mark === 'rejected') return t('chat.mapDraftMarkRejected')
  return t('chat.mapDraftMarkCommented')
}
function startEdit(item: MapDraftDecidedItem) {
  editingId.value = item.id
  editDraft.value = item.comment || ''
}
function editActionLabel(item: MapDraftDecidedItem): string {
  if (props.mode !== 'final') return t('chat.mapDraftDecidedEdit')
  if (item.mark === 'commented') return t('chat.mapFinalDraftEditRevision')
  return item.comment ? t('chat.mapFinalDraftEditNote') : t('chat.mapFinalDraftAddNote')
}
function confirmEdit(id: string) {
  const text = editDraft.value.trim()
  if (!text) return
  emit('edit-decided-comment', { id, text })
  editingId.value = ''
  editDraft.value = ''
}
</script>

<style scoped>
.map-draft-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--morandi-card) 88%, transparent);
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(72, 58, 47, 0.16);
  backdrop-filter: blur(6px);
  transition: gap 0.16s ease;
}

.map-draft-bar.closed {
  gap: 0;
  padding: 6px 12px;
}

.map-draft-bar__head {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  user-select: none;
}

.map-draft-bar__toggle {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  background: none;
  color: #8a8177;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.map-draft-bar__licon { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.18s ease; }
.map-draft-bar.closed .map-draft-bar__licon { transform: rotate(-90deg); }

.map-draft-bar__count {
  flex: 0 0 auto;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--morandi-text);
}

.map-draft-bar__hint {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.74rem;
  color: var(--morandi-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.map-draft-bar__body {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.map-draft-bar__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.map-draft-bar__actions button {
  padding: 5px 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 999px;
  background: var(--morandi-card);
  font-size: 0.8rem;
  color: var(--morandi-text);
  cursor: pointer;
  transition: background 0.14s ease, opacity 0.14s ease;
}

.map-draft-bar__actions button:hover:not(:disabled) { background: var(--morandi-hover); }
.map-draft-bar__actions button:disabled { cursor: default; opacity: 0.45; }

.map-draft-bar__row {
  display: flex;
  gap: 6px;
}

.map-draft-bar__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg);
  font-size: 0.82rem;
  color: var(--morandi-text);
}

.map-draft-bar__input:focus { outline: none; border-color: #5C8A5C; }
.map-draft-bar__input:disabled { opacity: 0.5; cursor: default; }

.map-draft-bar__comment-btn,
.map-draft-bar__submit {
  flex: 0 0 auto;
  padding: 6px 13px;
  border: 0;
  border-radius: 8px;
  background: #5C8A5C;
  color: #FFFDF8;
  font-size: 0.8rem;
  cursor: pointer;
  transition: opacity 0.14s ease;
}

.map-draft-bar__comment-btn:hover:not(:disabled),
.map-draft-bar__submit:hover:not(:disabled) { opacity: 0.9; }
.map-draft-bar__comment-btn:disabled,
.map-draft-bar__submit:disabled { cursor: default; opacity: 0.45; }

/* 已决策清单"挂起区"（真机返工批A）：折叠列表，视觉语言沿用本条已有的按钮/输入框样式 */
.map-draft-bar__decided {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 7px;
  border-top: 1px solid var(--morandi-border);
}

.map-draft-bar__decided-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 4px;
  border: 0;
  background: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--morandi-text);
  cursor: pointer;
}

.map-draft-bar__decided-toggle .map-draft-bar__licon { width: 12px; height: 12px; }

.map-draft-bar__decided-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}

.map-draft-bar__decided-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--morandi-card);
  border: 1px solid var(--morandi-border);
}

.map-draft-bar__decided-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.map-draft-bar__decided-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.map-draft-bar__decided-dot.c-ready { background: #3E7D4E; }
.map-draft-bar__decided-dot.c-confirm { background: #C4863B; }
.map-draft-bar__decided-dot.c-risk { background: #C0665A; }

.map-draft-bar__decided-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  color: var(--morandi-text);
}

.map-draft-bar__decided-tag {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.68rem;
}
.map-draft-bar__decided-tag.m-accepted { background: rgba(62, 125, 78, 0.14); color: #2f5f3a; }
.map-draft-bar__decided-tag.m-rejected { background: rgba(192, 102, 90, 0.14); color: #9a4638; }
.map-draft-bar__decided-tag.m-commented { background: rgba(196, 134, 59, 0.14); color: #8c5f28; }

.map-draft-bar__decided-comment {
  margin: 0;
  padding-left: 15px;
  font-size: 0.74rem;
  color: var(--morandi-text-light);
}

.map-draft-bar__decided-edit {
  display: flex;
  gap: 6px;
  padding-left: 15px;
}

.map-draft-bar__decided-actions {
  display: flex;
  gap: 10px;
  padding-left: 15px;
}

.map-draft-bar__decided-actions button {
  border: 0;
  background: none;
  padding: 0;
  font-size: 0.72rem;
  color: #47704a;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
