<template>
  <!-- 添加/编辑票据模态框 -->
  <AppFormDialog
    :open="state.showAddTicket.value || state.showEditTicket.value"
    :title="state.showEditTicket.value ? '编辑票据' : '添加新票据'"
    size="md"
    @cancel="state.showAddTicket.value = false; state.showEditTicket.value = false"
  >
      <div class="form-group">
        <label>票据名称</label>
        <input v-model="state.ticketForm.name" placeholder="例如：游戏票">
      </div>
      <div class="form-group">
        <label>兑换所需点数</label>
        <input v-model.number="state.ticketForm.cost" type="number" min="1" placeholder="1">
      </div>
      <div class="form-group">
        <label>分类</label>
        <select v-model="state.ticketForm.category">
          <option v-for="cat in state.viewModel.categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>简介</label>
        <textarea v-model="state.ticketForm.desc" rows="2" placeholder="例如：可以刷0.5小时抖音"></textarea>
      </div>
      <div class="form-group">
        <label>计时时长（分钟，0表示不计时）</label>
        <input v-model.number="state.ticketForm.timerMinutes" type="number" min="0" placeholder="0">
      </div>
      <div class="form-group ticket-setting-card">
        <div class="ticket-setting-row">
          <div class="ticket-setting-text">
            <div class="ticket-setting-title">自动消耗下一张</div>
          <div class="ticket-setting-desc">这张票计时结束后，如果库存里还有同名票据，就立刻续上下一张，不用用户手动再点一次。</div>
          </div>
          <label class="ticket-switch">
            <input v-model="state.ticketForm.autoConsumeNext" type="checkbox">
            <span class="ticket-switch-track"></span>
          </label>
        </div>

        <div class="notification-permission-card">
          <div class="notification-permission-head">
            <span class="notification-permission-title">浏览器通知权限</span>
            <span :class="['notification-permission-badge', notificationPermissionClass]">
              {{ notificationPermissionText }}
            </span>
          </div>
          <div class="notification-permission-desc">
            {{ notificationPermissionDesc }}
          </div>
          <button
            v-if="state.notificationSupported?.value && state.notificationPermission?.value !== 'granted'"
            class="btn btn-info btn-small"
            @click="requestPermission"
          >
            请求通知权限
          </button>
        </div>
      </div>

      <template #actions>
        <button v-if="state.showEditTicket.value" class="btn btn-danger" @click="state.actions.deleteEditingTicket()">删除票据</button>
        <button class="btn btn-secondary" @click="state.showAddTicket.value = false; state.showEditTicket.value = false">取消</button>
        <button class="btn btn-primary" @click="state.actions.saveTicket()">保存</button>
      </template>
  </AppFormDialog>

  <!-- 标签管理模态框 -->
  <AppFormDialog
    :open="state.showTagManager.value"
    title="自定义计时标"
    size="md"
    @cancel="state.showTagManager.value = false"
  >
      <p style="font-size: 0.85rem; color: var(--morandi-text-light); margin-bottom: 12px;">标签成对使用：第一次点击添加开始标记，第二次点击添加结束标</p>

      <div class="tag-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">
        <div v-for="tag in state.customTags.value" :key="tag.id" class="tag-item" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--morandi-soft-bg); border-radius: 6px; margin-bottom: 6px;">
          <span :style="{ backgroundColor: tag.color, width: '16px', height: '16px', borderRadius: '4px', display: 'inline-block' }"></span>
          <span style="flex: 1;">{{ tag.name }}</span>
          <button class="btn btn-small btn-secondary" @click="state.actions.editCustomTag(tag)">编辑</button>
          <button class="btn btn-small btn-danger" @click="state.actions.deleteCustomTag(tag.id)">删除</button>
        </div>
        <div v-if="state.customTags.value.length === 0" style="text-align: center; color: var(--morandi-text-light); padding: 20px;">暂无自定义标</div>
      </div>

      <div style="padding: 12px; background: var(--morandi-soft-bg); border-radius: 8px; margin-bottom: 12px;">
        <div class="form-group">
          <label>{{ state.editingTagId.value ? '编辑标签' : '添加新标签' }}</label>
          <input v-model="state.newTagName.value" placeholder="标签名字（如：休息、用餐）">
        </div>
        <div class="form-group">
          <label>标签颜色</label>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            <span
              v-for="color in state.tagColorPresets"
              :key="color"
              :style="{ backgroundColor: color, width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', border: state.newTagColor.value === color ? '2px solid var(--morandi-text)' : '1px solid var(--morandi-border)' }"
              @click="state.newTagColor.value = color"
            ></span>
          </div>
          <div style="margin-top: 6px;">
            <span :style="{ backgroundColor: state.newTagColor.value, width: '20px', height: '20px', borderRadius: '4px', display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }"></span>
            <span style="font-size: 0.85rem;">{{ state.newTagName.value || '预览' }}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button v-if="state.editingTagId.value" class="btn btn-secondary" @click="state.editingTagId.value = null; state.newTagName.value = ''">取消编辑</button>
          <button class="btn btn-primary" @click="state.actions.saveCustomTag()">{{ state.editingTagId.value ? '更新' : '添加' }}标签</button>
        </div>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showTagManager.value = false; state.editingTagId.value = null; state.newTagName.value = ''">关闭</button>
      </template>
  </AppFormDialog>

  <!-- 消费金钱模态框 -->
  <AppFormDialog
    :open="state.showSpendMoney.value"
    title="消费金钱"
    size="sm"
    @cancel="state.showSpendMoney.value = false"
  >
      <div class="form-group">
        <label>消费金额 (当前余额: ¥{{ typeof state.viewModel.money === 'number' ? state.viewModel.money.toFixed(2) : state.viewModel.money }})</label>
        <input v-model.number="state.spendAmount.value" type="number" step="0.01" min="0" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>消费说明</label>
        <input v-model="state.spendReason.value" placeholder="例如：买了一杯奶茶">
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showSpendMoney.value = false">取消</button>
        <button
          class="btn btn-primary"
          @click="state.actions.addTransaction('消费金钱', `消费¥${state.spendAmount.value} ${state.spendReason.value || ''}`, { amount: state.spendAmount.value, reason: state.spendReason.value }); state.showSpendMoney.value = false; state.spendAmount.value = 0; state.spendReason.value = ''"
          :disabled="state.spendAmount.value <= 0"
        >暂存并生效</button>
      </template>
  </AppFormDialog>

  <!-- 兑换数量选择模态框 -->
  <AppFormDialog
    :open="state.showBatchExchange.value"
    :title="`兑换 ${state.batchTicket.value?.name || '票据'}`"
    size="sm"
    @cancel="state.showBatchExchange.value = false"
  >
      <div style="margin-bottom: 12px; font-size: 0.9rem; color: var(--morandi-text-light);">
        {{ state.batchTicket.value?.cost || 0 }}点/张
      </div>
      <div class="form-group">
        <label>兑换数量</label>
        <input v-model.number="state.batchAmount.value" type="number" min="1" placeholder="1">
      </div>
      <div v-if="state.batchTicket.value" style="margin-bottom: 16px; padding: 10px; background: rgba(155, 139, 122, 0.1); border-radius: 8px; font-size: 0.9rem; color: var(--morandi-text);">
        总计：{{ (state.batchTicket.value.cost || 0) * state.batchAmount.value }} 点
        <span v-if="Number(state.viewModel.points || 0) < Number(state.batchTicket.value.cost || 0) * Number(state.batchAmount.value || 0)" style="color: var(--morandi-danger);">（点数不足）</span>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showBatchExchange.value = false">取消</button>
        <button
          class="btn btn-primary"
          @click="state.actions.addTransaction('兑换票据', `兑换${state.batchAmount.value}张${state.batchTicket.value?.name}`, { ticket: state.batchTicket.value, amount: state.batchAmount.value }); state.showBatchExchange.value = false; state.batchTicket.value = null; state.batchAmount.value = 1"
          :disabled="!state.batchTicket.value || state.batchAmount.value <= 0 || Number(state.viewModel.points || 0) < Number(state.batchTicket.value.cost || 0) * Number(state.batchAmount.value || 0)"
        >暂存并生效</button>
      </template>
  </AppFormDialog>

  <!-- 使用数量选择模态框 -->
  <AppFormDialog
    :open="state.showBatchUse.value"
    :title="`使用 ${state.batchTicket.value?.name || '票据'}`"
    size="sm"
    @cancel="state.showBatchUse.value = false"
  >
      <div style="margin-bottom: 12px; font-size: 0.9rem; color: var(--morandi-text-light);">
        当前持有：{{ state.batchTicket.value?.count || 0 }}张
      </div>
      <div class="form-group">
        <label>使用数量</label>
        <input v-model.number="state.batchAmount.value" type="number" min="1" :max="state.batchTicket.value?.count || 1" placeholder="1">
      </div>
      <div v-if="state.batchTicket.value?.timerMinutes > 0" style="margin-bottom: 16px; padding: 10px; background: rgba(168, 181, 160, 0.1); border-radius: 8px; font-size: 0.9rem; color: var(--morandi-text);">
        计时：{{ (state.batchTicket.value.timerMinutes || 0) * state.batchAmount.value }} 分钟
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showBatchUse.value = false">取消</button>
        <button
          class="btn btn-success"
          @click="state.actions.addTransaction('使用票据', `使用${state.batchAmount.value}张${state.batchTicket.value?.name}`, { ticket: state.batchTicket.value, amount: state.batchAmount.value }); state.showBatchUse.value = false; state.batchTicket.value = null; state.batchAmount.value = 1"
          :disabled="!state.batchTicket.value || state.batchAmount.value <= 0 || state.batchAmount.value > (state.batchTicket.value?.count || 0)"
        >暂存并生效</button>
      </template>
  </AppFormDialog>

  <!-- 票据分类编辑弹窗 -->
  <AppFormDialog
    :open="state.showCategoryEditor.value"
    title="编辑票据分类"
    size="sm"
    @cancel="state.showCategoryEditor.value = false"
  >
      <div style="max-height: 300px; overflow-y: auto;">
        <div v-for="(cat, index) in state.categoryEditList.value" :key="index" style="display: flex; gap: 8px; margin-bottom: 8px;">
          <input v-model="state.categoryEditList.value[index]" style="flex: 1; padding: 8px; border: 1px solid var(--morandi-border); border-radius: 4px;">
          <button class="btn btn-tiny btn-danger" @click="state.categoryEditList.value.splice(index, 1)">×</button>
        </div>
      </div>
      <div style="margin-top: 12px;">
        <input v-model="state.newCategoryName.value" placeholder="新分类名" style="width: calc(100% - 80px); padding: 8px; border: 1px solid var(--morandi-border); border-radius: 4px;">
        <button class="btn btn-small btn-secondary" @click="state.addCategory" style="width: 70px;">添加</button>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showCategoryEditor.value = false">取消</button>
        <button class="btn btn-primary" @click="state.saveCategories">保存</button>
      </template>
  </AppFormDialog>

  <AppConfirmDialog
    :open="Boolean(state.showConfirmDialog.value)"
    :title="state.confirmDialog.title"
    :message="state.confirmDialog.message"
    :confirm-text="state.confirmDialog.confirmText"
    :size="state.confirmDialog.size || 'sm'"
    :height-preset="state.confirmDialog.heightPreset || 'default'"
    :confirm-action="handleConfirmDialog"
    :tone="confirmDialogTone"
    @cancel="state.showConfirmDialog.value = false"
  />

  <AppConfirmDialog
    :open="Boolean(state.showClearChatContextDialog.value)"
    title="清空对话"
    message="将清空当前对话内的消息、提示词日志和召回活动。此操作不可撤销。"
    confirm-text="清空"
    size="md"
    tone="danger"
    :confirm-action="handleClearChatContextConfirm"
    @cancel="handleClearChatContextCancel"
  >
    <div class="clear-chat-context-options">
      <label class="clear-chat-context-option">
        <input v-model="state.clearChatContextDialog.clearSessionTemporaryCharacters" type="checkbox">
        <span>一并清掉临时角色信息</span>
      </label>
    </div>
  </AppConfirmDialog>

  <AppFormDialog
    :open="Boolean(state.showPromptDialog.value)"
    :title="state.promptDialog.title"
    :subtitle="state.promptDialog.message"
    size="sm"
    :submit-text="state.promptDialog.confirmText || '确认'"
    :submit-disabled="Boolean(promptDialogError)"
    @cancel="handleClosePromptDialog"
    @submit="state.handlePromptSubmit()"
  >
    <div class="app-prompt-dialog">
      <label v-if="state.promptDialog.inputLabel" class="app-prompt-dialog__label">
        {{ state.promptDialog.inputLabel }}
      </label>
      <input
        v-model="state.promptDialog.value"
        class="app-prompt-dialog__input"
        :placeholder="state.promptDialog.placeholder || ''"
        @keydown.enter="handlePromptEnter"
      >
      <div v-if="promptDialogError" class="app-prompt-dialog__error">
        {{ promptDialogError }}
      </div>
    </div>
  </AppFormDialog>

  <AppChoiceDialog
    :open="Boolean(state.showChatTransferDialog.value)"
    :title="state.chatTransferDialog.title"
    subtitle="选择一个目标聊天，把当前会话记录复制过去。聊天记忆和场景设置不会一起复制。"
    :options="transferChoiceOptions"
    :selected-id="state.chatTransferDialog.targetId"
    empty-text="没有找到匹配的目标聊天"
    confirm-text="开始复制"
    loading-text="复制中..."
    :loading="state.chatTransferDialog.loading"
    :confirm-disabled="!state.chatTransferDialog.targetId"
    @cancel="handleCloseChatTransferDialog()"
    @select="handleSelectChatTransferTarget"
    @confirm="handleConfirmChatTransfer()"
  >
    <template #search>
      <div class="app-choice-dialog-search">
        <label class="app-choice-dialog-search__label">搜索目标</label>
        <input
          v-model="state.chatTransferDialog.input"
          class="app-choice-dialog-search__input"
          placeholder="输入编号、名称或 ID"
          :disabled="state.chatTransferDialog.loading"
        >
      </div>
    </template>
  </AppChoiceDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { createUtilityModalState } from '../../../composables/app/modalState/createUtilityModalState'
import AppConfirmDialog from '../../common/AppConfirmDialog.vue'
import AppChoiceDialog from '../../common/AppChoiceDialog.vue'
import AppFormDialog from '../../common/AppFormDialog.vue'
import type { AppChoiceDialogOption } from '../../common/AppChoiceDialog.vue'

type UtilityModalState = ReturnType<typeof createUtilityModalState>
type TransferCandidate = { id: string; name: string }

const props = defineProps<{ state: UtilityModalState }>()

const notificationPermissionText = computed(() => {
  const permission = props.state.notificationPermission?.value
  if (!props.state.notificationSupported?.value) return '当前浏览器不支持'
  if (permission === 'granted') return '已允许'
  if (permission === 'denied') return '已拒绝'
  return '未请求'
})

const notificationPermissionClass = computed(() => {
  const permission = props.state.notificationPermission?.value
  if (!props.state.notificationSupported?.value) return 'unsupported'
  if (permission === 'granted') return 'granted'
  if (permission === 'denied') return 'denied'
  return 'default'
})

const notificationPermissionDesc = computed(() => {
  const permission = props.state.notificationPermission?.value
  if (!props.state.notificationSupported?.value) {
    return '当前环境不支持系统通知，不过应用内顶部横幅还是会正常提醒。'
  }
  if (permission === 'granted') {
    return '系统通知已开启。即使切到后台，票据计时完成、耗尽或自动续耗也会尽量提醒。'
  }
  if (permission === 'denied') {
    return '浏览器当前拒绝了通知权限。你仍然会看到应用内顶部横幅；如果要系统通知，需要在浏览器站点权限里重新允许。'
  }
  return '有些浏览器会静默拦截自动请求。点下面这个按钮手动授权，通知成功率会更稳。'
})

const filteredTransferCandidates = computed<TransferCandidate[]>(() => {
  const keyword = String(props.state.chatTransferDialog?.input || '').trim().toLowerCase()
  const source: TransferCandidate[] = Array.isArray(props.state.chatTransferDialog?.candidates)
    ? props.state.chatTransferDialog.candidates
    : []
  if (!keyword) return source
  return source.filter((item) => {
    const id = String(item.id || '').toLowerCase()
    const name = String(item.name || '').toLowerCase()
    return id.includes(keyword) || name.includes(keyword)
  })
})

const transferChoiceOptions = computed<AppChoiceDialogOption[]>(() =>
  filteredTransferCandidates.value.map((item, index) => ({
    id: item.id,
    label: item.name,
    description: item.id,
    badge: String(index + 1)
  }))
)

const confirmDialogTone = computed<'danger' | 'warning' | 'default'>(() => {
  const text = String(props.state.confirmDialog?.confirmText || '')
  const title = String(props.state.confirmDialog?.title || '')
  const combined = `${title} ${text}`
  if (combined.includes('删除')) return 'danger'
  if (combined.includes('重置') || combined.includes('清空')) return 'warning'
  return 'default'
})

const promptDialogError = computed(() => {
  const validator = props.state.promptDialog?.validator
  if (typeof validator !== 'function') return ''
  return String(validator(String(props.state.promptDialog?.value || '')) || '')
})

async function requestPermission() {
  await props.state.requestNotificationPermission?.()
}

function handleConfirmDialog() {
  const handler = props.state.actions?.handleConfirmClick
  const fallback = props.state.confirmDialog?.onConfirm
  if (typeof fallback === 'function') {
    fallback()
    if (props.state.showConfirmDialog) {
      props.state.showConfirmDialog.value = false
    }
    return
  }
  if (typeof handler === 'function') {
    handler()
    if (props.state.showConfirmDialog) {
      props.state.showConfirmDialog.value = false
    }
    return
  }
  if (props.state.showConfirmDialog) {
    props.state.showConfirmDialog.value = false
  }
}

function handleClearChatContextCancel() {
  if (props.state.clearChatContextDialog) {
    props.state.clearChatContextDialog.onConfirm = null
  }
  if (props.state.showClearChatContextDialog) {
    props.state.showClearChatContextDialog.value = false
  }
}

function handleClearChatContextConfirm() {
  const dialog = props.state.clearChatContextDialog
  const handler = dialog?.onConfirm
  if (typeof handler === 'function') {
    handler({
      clearSessionTemporaryCharacters: Boolean(dialog.clearSessionTemporaryCharacters)
    })
  }
  handleClearChatContextCancel()
}

function handleCloseChatTransferDialog() {
  if (props.state.chatTransferDialog) {
    props.state.chatTransferDialog.title = ''
    props.state.chatTransferDialog.sourceTarget = ''
    props.state.chatTransferDialog.toSingle = false
    props.state.chatTransferDialog.candidates = []
    props.state.chatTransferDialog.input = ''
    props.state.chatTransferDialog.targetId = ''
    props.state.chatTransferDialog.loading = false
    props.state.chatTransferDialog.onConfirm = null
  }
  if (props.state.showChatTransferDialog) {
    props.state.showChatTransferDialog.value = false
  }
}

function handleClosePromptDialog() {
  props.state.closePromptDialog?.()
}

function handlePromptEnter(event: KeyboardEvent) {
  // IME 选字回车不提交（与全站桌面输入框 2026-07-17 统一守卫口径一致）。
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (promptDialogError.value) return
  props.state.handlePromptSubmit?.()
}

function handleConfirmChatTransfer() {
  props.state.chatTransferDialog?.onConfirm?.()
}

function handleSelectChatTransferTarget(id: string) {
  if (!props.state.chatTransferDialog) return
  const match = filteredTransferCandidates.value.find((item) => item.id === id)
  props.state.chatTransferDialog.targetId = id
  if (match) {
    props.state.chatTransferDialog.input = match.name
  }
}
</script>

<style scoped>
.app-choice-dialog-search {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.app-choice-dialog-search__label {
  color: var(--morandi-text, #4f463f);
  font-size: 0.9rem;
  font-weight: 600;
}

.app-choice-dialog-search__input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text, #4f463f);
  outline: none;
}

.app-choice-dialog-search__input:focus {
  border-color: rgba(130, 153, 135, 0.72);
}

.app-prompt-dialog {
  display: grid;
  gap: 10px;
}

.app-prompt-dialog__label {
  color: var(--morandi-text, #4f463f);
  font-size: 0.9rem;
  font-weight: 600;
}

.app-prompt-dialog__input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text, #4f463f);
  outline: none;
}

.app-prompt-dialog__input:focus {
  border-color: rgba(130, 153, 135, 0.72);
}

.app-prompt-dialog__error {
  color: var(--morandi-danger);
  font-size: 0.82rem;
  line-height: 1.5;
}

.clear-chat-context-options {
  display: grid;
  gap: 10px;
  padding-top: 2px;
}

.clear-chat-context-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.9rem;
}

.clear-chat-context-option input {
  width: 15px;
  height: 15px;
  accent-color: #7ea79d;
}

.clear-chat-context-option input:disabled + span {
  color: var(--morandi-text-light, #8d8177);
}
</style>
