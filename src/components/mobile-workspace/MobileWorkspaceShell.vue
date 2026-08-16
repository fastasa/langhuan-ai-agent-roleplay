<template>
  <MobileSurface>
    <main
      class="mobile-workspace-shell"
      :class="{ 'mobile-workspace-shell--thread': activeTab === 'chat' && chatPane === 'thread', 'mobile-workspace-shell--focused': (activeTab === 'roles' && rolePaneDeep) || (activeTab === 'docs' && docPaneDeep) }"
      data-mobile-workspace-shell="true"
    >
      <section v-if="activeTab === 'chat'" class="mobile-page" :aria-label="$t('mobile.page.chat')">
        <MobileChatList
          v-if="chatPane === 'list'"
          :state="state"
          @open-thread="chatPane = 'thread'"
          @create-session="createChatSessionFromList"
          @selection="onSelection"
        />
        <MobileChatThread
          v-else
          :state="state"
          @back="chatPane = 'list'"
        />
      </section>

      <section v-else-if="activeTab === 'roles'" class="mobile-page" :aria-label="$t('mobile.page.roles')">
        <MobileRoleWorkspace :state="state" @depth-change="rolePaneDeep = $event" @selection="onSelection" />
      </section>

      <section v-else-if="activeTab === 'docs'" class="mobile-page" :aria-label="$t('mobile.page.docs')">
        <MobileDocWorkspace :state="state" @depth-change="docPaneDeep = $event" @selection="onSelection" />
      </section>

      <section v-else class="mobile-page" :aria-label="$t('mobile.page.me')">
        <MobileApiConfigWorkspace
          v-if="mePane === 'apiConfig'"
          :state="state"
          @back="mePane = 'home'"
        />
        <MobileMeWorkspace
          v-else
          :state="state"
          @open-api-config="mePane = 'apiConfig'"
        />
      </section>

      <!-- 星依唤出悬浮按钮（批次4）：浮坞本体已由 AppGlobalOverlays 全局挂载（Teleport 到 body），
           移动端没有 Shift+X，这里只负责派发唤出事件；联动标注：事件名与 XingyiDock.vue 监听是同一字符串 -->
      <button
        v-if="showRootNav"
        type="button"
        class="mobile-xingyi-fab"
        :title="$t('mobile.shell.summonXingyi')"
        :aria-label="$t('mobile.shell.summonXingyi')"
        @click="toggleXingyiDock"
      >
        <span class="mobile-xingyi-fab__blur" aria-hidden="true" />
        <span class="mobile-xingyi-fab__edge" aria-hidden="true" />
        <!-- 星星本体即状态灯（2026-07-11 设计稿）：与桌面签牌同源（状态=xingyiGlobalStatus 合并；
             五态光效=main.css xy-star--* 全局类族）。待命时不挂状态类，保持 FAB 原本安静的样子。 -->
        <XingyiStarIcon
          class="mobile-xingyi-fab__icon"
          :class="xingyiStatus === 'idle' ? '' : `xy-star--${xingyiStatus}`"
        />
      </button>

      <MobileGlassNav v-if="showRootNav" :items="rootTabs" :active-item="activeTab" @select="selectRootTab" />
      <MobileSelectionActionBar
        :open="selection.open"
        :count="selection.count"
        :actions="selection.actions"
        @cancel="selection.onCancel"
        @action="selection.onAction"
      />
    </main>
  </MobileSurface>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MobileChatList from './MobileChatList.vue'
import MobileChatThread from './MobileChatThread.vue'
import MobileDocWorkspace from './MobileDocWorkspace.vue'
import MobileApiConfigWorkspace from './MobileApiConfigWorkspace.vue'
import MobileGlassNav from './MobileGlassNav.vue'
import MobileMeWorkspace from './MobileMeWorkspace.vue'
import MobileRoleWorkspace from './MobileRoleWorkspace.vue'
import MobileSelectionActionBar from './MobileSelectionActionBar.vue'
import MobileSurface from './MobileSurface.vue'
import XingyiStarIcon from '../app/XingyiStarIcon.vue'
import { resolveXingyiGlobalStatus, xingyiDockRunStatus } from '../../app/xingyiGlobalStatus'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import type { MobileGlassNavItem, MobileSelectionDescriptor, MobileWorkspaceIconName, MobileWorkspaceRootTab, MobileWorkspaceShellProps } from './mobileWorkspaceTypes'

const props = defineProps<MobileWorkspaceShellProps>()
const { t } = useI18n()

// 星依状态灯：只读视图合并（浮坞本轮状态 ref + Agent 任务提示），不新增移动端真值
const workspaceRuntimeStore = useWorkspaceRuntimeStore()
const xingyiStatus = computed(() => resolveXingyiGlobalStatus(xingyiDockRunStatus.value, workspaceRuntimeStore.agentTaskNotice?.status ?? null))

const activeTab = ref<MobileWorkspaceRootTab>('chat')
const chatPane = ref<'list' | 'thread'>('list')
const rolePaneDeep = ref(false)
const docPaneDeep = ref(false)
const mePane = ref<'home' | 'apiConfig'>('home')
const pendingCreatedChatThread = ref(false)
const pendingKnownChatSessionIds = ref<Set<string>>(new Set())

// 底部胶囊由壳层统一裁决：子页通过 @selection 上报多选描述符；多选态时隐藏导航胶囊、原位显示操作胶囊
const CLOSED_SELECTION: MobileSelectionDescriptor = { open: false, count: 0, actions: [], onCancel: () => {}, onAction: () => {} }
const selection = ref<MobileSelectionDescriptor>(CLOSED_SELECTION)
function onSelection(descriptor: MobileSelectionDescriptor) {
  selection.value = descriptor
}

// 模块级 const 里不能调 t()：改为「id/icon/labelKey 定义 + computed 里 t() 填充 label」
const ROOT_TAB_DEFS: { id: MobileWorkspaceRootTab; labelKey: string; icon: MobileWorkspaceIconName }[] = [
  { id: 'chat', labelKey: 'sidebar.navContacts', icon: 'message-circle' },
  { id: 'roles', labelKey: 'sidebar.navRoles', icon: 'user-round' },
  { id: 'docs', labelKey: 'mobile.tab.docs', icon: 'library-big' },
  { id: 'me', labelKey: 'mobile.tab.me', icon: 'circle-user' }
]
const rootTabs = computed<MobileGlassNavItem[]>(() =>
  ROOT_TAB_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey), icon: def.icon }))
)

const state = computed(() => props.state)
const showRootNav = computed(() => {
  // 多选态下底部让位给操作胶囊，导航胶囊隐藏（单层替换）
  if (selection.value.open) return false
  if (activeTab.value === 'chat') return chatPane.value === 'list'
  if (activeTab.value === 'roles') return !rolePaneDeep.value
  if (activeTab.value === 'docs') return !docPaneDeep.value
  if (activeTab.value === 'me') return mePane.value === 'home'
  return true
})
function selectRootTab(tabId: string) {
  if (ROOT_TAB_DEFS.some((item) => item.id === tabId)) {
    selection.value = CLOSED_SELECTION
    activeTab.value = tabId as MobileWorkspaceRootTab
    if (activeTab.value !== 'chat') {
      chatPane.value = 'list'
    }
    if (activeTab.value !== 'roles') {
      rolePaneDeep.value = false
    }
    if (activeTab.value !== 'docs') {
      docPaneDeep.value = false
    }
    if (activeTab.value !== 'me') {
      mePane.value = 'home'
    }
  }
}

function toggleXingyiDock() {
  window.dispatchEvent(new CustomEvent('langhuan:toggle-xingyi'))
}

function createChatSessionFromList() {
  pendingCreatedChatThread.value = true
  pendingKnownChatSessionIds.value = new Set(
    (state.value.chatViewModel.chatSessionRows || [])
      .map((row) => String(row.sessionId || ''))
      .filter(Boolean)
  )
  state.value.chatActions.openChatSessionCreator?.()
}

watch(
  () => String(state.value.chatViewModel.activeSessionId || ''),
  (nextSessionId) => {
    if (!pendingCreatedChatThread.value) return
    if (!nextSessionId) return
    if (pendingKnownChatSessionIds.value.has(nextSessionId)) return
    pendingCreatedChatThread.value = false
    pendingKnownChatSessionIds.value = new Set()
    activeTab.value = 'chat'
    chatPane.value = 'thread'
  }
)
</script>

<style scoped>
.mobile-workspace-shell {
  position: relative;
  display: flex;
  /* 填满固定高度的 MobilePaperSurface，不再自撑高；min-height:0 让内部 flex 滚动区拿到有界高度 */
  height: 100%;
  min-height: 0;
  flex-direction: column;
  padding: max(10px, env(safe-area-inset-top, 0)) 16px 100px;
  font-family: var(--lhm-font-ui);
  color: var(--lhm-text, #333);
}

/* 聊天对话页用底部输入栏代替浮动胶囊，收窄底部留白；并收窄横向留白让头像/气泡更贴近边界 */
.mobile-workspace-shell--thread {
  padding-right: 8px;
  padding-left: 8px;
  padding-bottom: 14px;
}

.mobile-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}

.mobile-empty,
.mobile-page--placeholder {
  border: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 72%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--morandi-card, #fffdf8) 78%, transparent);
}

.mobile-empty,
.mobile-page--placeholder {
  color: var(--morandi-text-light, #666);
  line-height: 1.7;
  padding: 18px;
}

/* 星依唤出悬浮按钮：贴右下、悬在底部导航胶囊上方，玻璃质感与 MobileGlassNav 同语言 */
.mobile-xingyi-fab {
  position: fixed;
  z-index: 40;
  right: 18px;
  bottom: calc(max(24px, env(safe-area-inset-bottom, 24px)) + 66px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  overflow: hidden;
  background: transparent;
  color: var(--lhm-accent, #5c8a5c);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  box-shadow:
    0 2px 8px rgba(56, 46, 38, 0.12),
    0 12px 26px rgba(56, 46, 38, 0.15);
}

.mobile-xingyi-fab__blur {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.52);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.mobile-xingyi-fab__edge {
  position: absolute;
  inset: 0;
  border: 0.5px solid rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  box-shadow:
    inset 1.5px 1.5px 1px rgba(255, 255, 255, 0.78),
    inset -1px -1px 1px rgba(255, 255, 255, 0.4);
}

.mobile-xingyi-fab__icon {
  position: relative;
  width: 20px;
  height: 20px;
}

[data-theme='dark'] .mobile-xingyi-fab {
  box-shadow:
    0 2px 10px rgba(0, 0, 0, 0.4),
    0 12px 28px rgba(0, 0, 0, 0.34);
}

[data-theme='dark'] .mobile-xingyi-fab__blur {
  background: rgba(46, 43, 39, 0.58);
}

[data-theme='dark'] .mobile-xingyi-fab__edge {
  border-color: rgba(255, 255, 255, 0.13);
  box-shadow:
    inset 1.5px 1.5px 1px rgba(255, 255, 255, 0.13),
    inset -1px -1px 1px rgba(255, 255, 255, 0.05);
}
</style>
