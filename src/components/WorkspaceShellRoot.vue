<template>
  <div id="app" :class="{ 'dark-mode': app.settingStore.darkMode }">
    <Transition name="workspace-loading-fade">
      <div
        v-if="showWorkspaceLoading"
        class="workspace-loading-mask"
        :class="`stage-${workspaceLoadingStage}`"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="workspace-loading-mark" :class="{ 'workspace-loading-mark--error': isWorkspaceLoadingError }">
          <LanghuanLoadingMark
            class="workspace-loading-icon"
            size="clamp(72px, 12vw, 108px)"
            :stroke-scale="0.95"
            :error="isWorkspaceLoadingError"
          />
          <div v-if="isWorkspaceLoadingError" class="workspace-loading-error" role="alert">{{ workspaceLoadingText }}</div>
        </div>
      </div>
    </Transition>

    <AppGlobalOverlays
      :toast-visible="toastVisible"
      :toast-type="toastType"
      :toast-message="toastMessage"
      :timer-complete-visible="timerCompleteVisible"
      :timer-complete-ticket-name="timerCompleteTicketName"
      :timer-complete-message="timerCompleteMessage"
      :timer-complete-title="timerCompleteTitle"
      :timer-complete-type="timerCompleteType"
      @close-timer-complete="app.closeTimerCompleteModal"
    />

    <component
      v-if="useMobileWorkspace"
      :is="MobileWorkspaceShell"
      :state="app.desktopState"
    />

    <component
      v-else
      :is="AppDesktopPanel"
      v-bind="app.desktopState"
    />

    <AppUtilityModals :state="app.utilityModalState" />

    <UserEditor
      v-if="showUserEditor"
      :user-form="app.userForm"
      @close="closeUserEditor"
      @save="app.handleUserSave"
    />

    <AppCharacterEditorModals :state="app.characterEditorModalState" />
    <AppSettingsModals :state="app.settingsModalState" />
    <AppRoleModals :state="app.roleModalState" />
    <AppChatManageModals :state="app.chatManageModalState" />
    <AppPromptPresetModal :state="app.promptPresetModalState" />
    <AppFullscreenImageModal :state="app.fullscreenModalState" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppShell } from '../composables/app/useAppShell'
import LanghuanLoadingMark from './common/LanghuanLoadingMark.vue'
import { shouldUseMobileWorkspace } from './mobile-workspace/mobileWorkspaceSurface'

const AppGlobalOverlays = defineAsyncComponent(() => import('./app/AppGlobalOverlays.vue'))
const AppDesktopPanel = defineAsyncComponent(() => import('./app/AppDesktopPanel.vue'))
const MobileWorkspaceShell = defineAsyncComponent(() => import('./mobile-workspace/MobileWorkspaceShell.vue'))
const UserEditor = defineAsyncComponent(() => import('./Modals/UserEditor.vue'))
const AppUtilityModals = defineAsyncComponent(() => import('./app/modals/AppUtilityModals.vue'))
const AppSettingsModals = defineAsyncComponent(() => import('./app/modals/AppSettingsModals.vue'))
const AppCharacterEditorModals = defineAsyncComponent(() => import('./app/modals/character/AppCharacterEditorModals.vue'))
const AppRoleModals = defineAsyncComponent(() => import('./app/modals/character/AppRoleModals.vue'))
const AppChatManageModals = defineAsyncComponent(() => import('./app/modals/chat/AppChatManageModals.vue'))
const AppPromptPresetModal = defineAsyncComponent(() => import('./app/modals/preset/AppPromptPresetModal.vue'))
const AppFullscreenImageModal = defineAsyncComponent(() => import('./app/modals/common/AppFullscreenImageModal.vue'))

const { t } = useI18n()
const app = useAppShell()
const useMobileWorkspace = computed(() => {
  if (typeof window === 'undefined') return false
  return shouldUseMobileWorkspace(window.location.search)
})

function readShellValue<T>(source: T | { value: T } | null | undefined, fallback: T): T {
  const value =
    source && typeof source === 'object' && 'value' in source
      ? (source as { value: T }).value
      : source
  return value === undefined || value === null ? fallback : value
}

/** 全局打开大图预览（输入框图片上传计划批5·星依浮坞接线）：星依浮坞 Teleport 到 body，拿不到
 *  app.fullscreenModalState（只在本文件内经 useAppShell() 创建一次，没有 props/store 下发给浮坞）——
 *  与本文件已有的 langhuan:open-workspace-view 全局事件同一范式，这里补监听把 detail.url 写回
 *  app.fullscreenModalState.fullscreenImage（唯一真值），让浮坞点击缩略图放大能复用同一个全屏 modal。 */
function handleOpenFullscreenImage(event: Event) {
  const url = String((event as CustomEvent<{ url?: string }>).detail?.url || '').trim()
  if (!url) return
  // app 的推导类型链很深（useWorkspaceShellController 层层组装），这里同 useAppShellPanelBuilders.ts
  // 现役写法（ctx: any 直接 .value 赋值）松类型直写，不为一个全屏预览接缝新增严格类型改造面。
  const fullscreenImage = (app as any).fullscreenModalState?.fullscreenImage
  if (fullscreenImage) fullscreenImage.value = url
}

onMounted(() => {
  window.addEventListener('langhuan:open-fullscreen-image', handleOpenFullscreenImage)
})

onBeforeUnmount(() => {
  window.removeEventListener('langhuan:open-fullscreen-image', handleOpenFullscreenImage)
})

const workspaceLoadingStage = computed(() => String(readShellValue(app.workspaceLoadingStage, 'idle') || 'idle'))
const workspaceLoadingMessage = computed(() => readShellValue(app.workspaceLoadingMessage, ''))
const toastVisible = computed(() => readShellValue(app.toastVisible, false))
const toastType = computed(() => readShellValue(app.toastType, 'info'))
const toastMessage = computed(() => readShellValue(app.toastMessage, ''))
const timerCompleteVisible = computed(() => readShellValue(app.timerCompleteVisible, false))
const timerCompleteTicketName = computed(() => readShellValue(app.timerCompleteTicketName, ''))
const timerCompleteMessage = computed(() => readShellValue(app.timerCompleteMessage, ''))
const timerCompleteTitle = computed(() => readShellValue(app.timerCompleteTitle, ''))
const timerCompleteType = computed(() => readShellValue(app.timerCompleteType, 'single'))
const showUserEditor = computed(() => readShellValue(app.showUserEditor, false))

const showWorkspaceLoading = computed(() => {
  const stage = workspaceLoadingStage.value
  return stage !== 'idle' && stage !== 'ready'
})

const isWorkspaceLoadingError = computed(() => {
  const stage = workspaceLoadingStage.value
  return stage === 'error'
})

const workspaceLoadingText = computed(() => {
  return sanitizeWorkspaceLoadingError(workspaceLoadingMessage.value)
})

function closeUserEditor() {
  const target = app.showUserEditor as { value?: boolean } | null | undefined
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = false
  }
}

function sanitizeWorkspaceLoadingError(rawMessage: unknown) {
  const message = String(rawMessage || '').trim()
  if (!message) return t('workspaceShell.notReady')
  const normalized = message.toLowerCase()
  if (/(401|403|unauthorized|forbidden)/i.test(message)) {
    return t('workspaceShell.accessDenied')
  }
  if (/(failed to fetch|networkerror|network error|服务器暂时不可用|econnrefused|enotfound|502|503|504)/i.test(message)) {
    return t('workspaceShell.serverUnreachable')
  }
  if (/(timeout|timed out|超时)/i.test(message)) {
    return t('workspaceShell.timeout')
  }
  if (/(quota|indexeddb|localstorage|sessionstorage|storage|缓存|存储)/i.test(message)) {
    return t('workspaceShell.storageUnavailable')
  }
  if (/(json|syntaxerror|snapshot|schema|parse|解析|格式)/i.test(message) || normalized.includes('unexpected token')) {
    return t('workspaceShell.dataFormat')
  }
  if (/(sqlite|database|table|column|constraint|typeerror|referenceerror|stack|trace|\/api\/)/i.test(message)) {
    return t('workspaceShell.readError')
  }
  return message.length > 42 ? t('workspaceShell.notReady') : message
}

</script>

<style scoped>
.workspace-loading-mask {
  position: fixed;
  inset: 0;
  /* 全局阻断层必须高于星依浮坞（12900）与业务弹窗（13000~13180），
     让加载期间所有可交互表面统一进入遮罩后的模糊背景。 */
  z-index: 14000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
  backdrop-filter: blur(4px);
}

.workspace-loading-fade-enter-active,
.workspace-loading-fade-leave-active {
  transition:
    opacity 420ms ease,
    backdrop-filter 420ms ease,
    background-color 420ms ease;
}

.workspace-loading-fade-enter-from,
.workspace-loading-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
  background-color: transparent;
}

.workspace-loading-fade-leave-active .workspace-loading-mark {
  transition:
    opacity 360ms ease,
    filter 420ms ease,
    transform 420ms ease;
}

.workspace-loading-fade-leave-to .workspace-loading-mark {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(8px) scale(0.97);
}

.workspace-loading-mark {
  display: grid;
  justify-items: center;
  gap: 14px;
  width: min(300px, calc(100vw - 48px));
  color: #4f6f58;
}

:global([data-theme="dark"] .workspace-loading-mark){
  color: #8fae96;
}

.workspace-loading-icon {
  display: inline-grid;
}

.workspace-loading-mark--error .workspace-loading-icon {
  opacity: 1;
}

.workspace-loading-error {
  max-width: min(360px, calc(100vw - 40px));
  font-size: 13px;
  line-height: 1.6;
  color: var(--morandi-danger, #C0665A);
  text-align: center;
  overflow-wrap: anywhere;
}

:global([data-theme="dark"] .workspace-loading-error){
  color: #d8a4aa;
}

</style>
