<template>
  <!-- 桌面正式入口：桌宠胸口 hover 圆钮按现役 open 真值切换打开/关闭；
       旧身体任意点击与右缘书签签牌均已退役。 -->
  <XingyiDesktopPet
    v-if="canUse && !isMobileShell && !statusWorkspaceXingyiHost"
    :global-status="globalStatus"
    :pet-visible="desktopPetVisible"
    :dock-open="open"
    closable
    @toggle-dock="open = !open"
    @close-pet="setDesktopPetVisible(false)"
  />
  <!-- 浮坞业务实例与窗口引擎原样保留；桌面签牌/靠边收起对星依实例关闭，Shift+X 与移动 FAB 共用 open。
       地图/剧本工作区左栏已各自独立为舆图师/编剧（WorkspaceAgentShell），不再 Teleport 复用本实例
       （2026-07-15 地图与剧本工作区专业Agent计划批D 旧入口退出）。状态工作区按用户 2026-07-20
       明确要求暂用通用星依，故只对 statusWorkspaceXingyiHost 开放同实例过渡宿主；状态专业 Agent 上线后删除。 -->
  <Teleport :to="statusWorkspaceXingyiHost || 'body'" :disabled="!statusWorkspaceXingyiHost">
  <FloatingWorkspaceWindow
    v-if="canUse"
    :open="dockVisible"
    :embedded="Boolean(statusWorkspaceXingyiHost)"
    :show-collapsed-tab="false"
    :title="t('xingyi.title')"
    storage-key="langhuan.xingyiDock.window"
    :default-width="380"
    :default-height="520"
    :min-width="300"
    :min-height="360"
    :z-index="12900"
    :data-theme="dockTheme"
    @close="open = false"
    @expand="open = true"
  >
    <!-- 头部融合状态灯：星星同为灯 + 状态文字进标题栏。 -->
    <template #title>
      <XingyiDockHeader :status="globalStatus" />
    </template>
    <!-- 浮坞私有夜间开关（2026-07-11）：只翻浮坞窗体皮肤（data-theme 挂窗根整树换 token），不动全局主题与签牌。 -->
    <template #tools>
      <!-- 立即生成当前本地工作区的今日日记；/diary 斜杠命令复用同一触发函数。 -->
      <button
        type="button"
        class="xingyi-dock__theme-toggle xingyi-dock__diary-generate-toggle"
        :title="t('xingyi.diaryGenerateNow')"
        :aria-label="t('xingyi.diaryGenerateNow')"
        :disabled="diaryGenerating"
        :class="{ 'xingyi-dock__diary-generate-toggle--busy': diaryGenerating }"
        @click.stop="triggerXingyiDiaryGenerateFromToolbar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
      </button>
      <button
        type="button"
        class="xingyi-dock__theme-toggle"
        :title="dockThemeToggleTitle"
        :aria-label="dockThemeToggleTitle"
        @click.stop="toggleDockTheme"
      >
        <svg v-if="dockTheme === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2"/>
          <path d="M12 20v2"/>
          <path d="m4.93 4.93 1.41 1.41"/>
          <path d="m17.66 17.66 1.41 1.41"/>
          <path d="M2 12h2"/>
          <path d="M20 12h2"/>
          <path d="m6.34 17.66-1.41 1.41"/>
          <path d="m19.07 4.93-1.41 1.41"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      </button>
      <!-- 星依设置入口：桌宠显示和日记视角都是本地工作区设置。 -->
      <button
        type="button"
        class="xingyi-dock__theme-toggle xingyi-dock__settings-toggle"
        :title="t('xingyi.xingyiSettingsAria')"
        :aria-label="t('xingyi.xingyiSettingsAria')"
        @click.stop="xingyiSettingsOpen = true"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </template>
    <div class="xingyi-dock">
      <!-- Agent 任务面板（2026-07-10 收编原右上角全局提示灯）：真值仍是 workspaceRuntimeStore.agentTaskNotice，
           这里直读 Pinia 单例做展示；步骤/错误/前往确认与旧提示卡同语义，成功 5 秒自动消失由 store 计时器负责。 -->
      <div v-if="taskNotice" class="xingyi-dock__task" :class="`xingyi-dock__task--${taskNotice.status}`">
        <div
          class="xingyi-dock__task-head"
          role="button"
          tabindex="0"
          :aria-expanded="taskExpanded"
          :aria-label="t('xingyi.taskDetail')"
          @click="taskExpanded = !taskExpanded"
          @keydown.enter.prevent="taskExpanded = !taskExpanded"
          @keydown.space.prevent="taskExpanded = !taskExpanded"
        >
          <XingyiStarIcon class="xingyi-dock__task-star" :class="`xy-star--${taskNotice.status}`" />
          <div class="xingyi-dock__task-text">
            <div class="xingyi-dock__task-title">{{ taskNotice.title }}</div>
            <div class="xingyi-dock__task-message">{{ taskNotice.message }}</div>
          </div>
          <svg class="xingyi-dock__task-chevron" :class="{ 'xingyi-dock__task-chevron--open': taskExpanded }" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 18 6-6-6-6"/>
          </svg>
          <button
            v-if="taskNotice.status !== 'running'"
            type="button"
            class="xingyi-dock__task-close"
            :title="t('xingyi.taskDismiss')"
            :aria-label="t('xingyi.taskDismiss')"
            @click.stop="dismissTaskNotice"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6L6 18"/>
              <path d="M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div v-if="taskExpanded" class="xingyi-dock__task-body">
          <div v-if="taskNotice.sourceLabel" class="xingyi-dock__task-source">{{ taskNotice.sourceLabel }}</div>
          <ol class="xingyi-dock__task-steps">
            <li
              v-for="step in visibleTaskSteps"
              :key="step.id"
              :class="`xingyi-dock__task-step--${step.status}`"
            >
              <span class="xingyi-dock__task-step-dot" aria-hidden="true"></span>
              <div class="xingyi-dock__task-step-text">
                <div class="xingyi-dock__task-step-label">{{ step.label }}</div>
                <div v-if="step.detail" class="xingyi-dock__task-step-detail">{{ step.detail }}</div>
              </div>
            </li>
          </ol>
          <button
            v-if="taskNotice.status === 'waiting'"
            type="button"
            class="xingyi-dock__task-action"
            @click="openTaskSource"
          >{{ t('xingyi.taskGoConfirm') }}</button>
          <div v-if="taskNotice.error" class="xingyi-dock__task-error" role="alert">{{ taskNotice.error }}</div>
        </div>
      </div>
      <div ref="scrollRef" class="xingyi-dock__messages">
        <!-- 星依派出的子agent运行卡（地图严谨协作与运行卡计划批1·2026-07-11）：绘舆/纠偏轮，与提调带
             同源复用共享组件——多张并行的观察卡，不是 pendingAsk/pendingConfirm 那套一次一张的阻塞交互卡。
             为空时组件自身不渲染任何 DOM，不影响下方空态判断。 -->
        <SubagentDispatchCardList
          :sources="xingyiDispatchSources"
          :include-settled="true"
          dispatcher-label="星依"
        />
        <AgentConversationEmptyState v-if="!messages.length && !running" :text="t('xingyi.emptyHint')" />
        <template v-for="(message, index) in messages" :key="index">
          <!-- 历史信息流统一由 AgentTurnStream 回放在对应回复上方，顺序固定为先过程、后结果。 -->
          <AgentTurnStream
            v-if="message.turnStream && message.turnStream.length"
            :entries="message.turnStream"
            placement="inline"
          />
          <XingyiChatBubble
            :role="message.role"
            :content="message.content === imageOnlyPlaceholderText ? '' : message.content"
          >
            <!-- 纯图片无文字时正文是占位文案，不重复显示（图片本身已经表达内容）——批5 -->
            <div
              v-if="readMessageAttachments(message).length"
              class="xingyi-dock__bubble-images"
              :class="{ 'xingyi-dock__bubble-images--single': readMessageAttachments(message).length === 1 }"
            >
              <div
                v-for="att in readMessageAttachments(message)"
                :key="att.id"
                class="xingyi-dock__bubble-image-item"
              >
                <button type="button" class="xingyi-dock__bubble-image" @click="openFullscreenImage(att.url)">
                  <img :src="att.url" :alt="att.originalName || t('chat.imageAttachThumbAlt')">
                </button>
                <button
                  type="button"
                  class="xingyi-dock__bubble-image-avatar"
                  title="设为头像"
                  aria-label="设为头像"
                  @click.stop="requestChatImageAvatarAssignment(att.url, att.originalName)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="3"/></svg>
                </button>
              </div>
            </div>
            <!-- 带图乐观发送失败态（2026-07-11）：消息已经乐观显示，后台上传/发送最终出错时给个轻量视觉提示，
                 不撤回不遮挡——与下方 xingyi.errorReply 的独立助手回复共存，不重复同一件事。 -->
            <div v-if="message._sendFailed" class="xingyi-dock__bubble-failed">{{ t('xingyi.sendFailedHint') }}</div>
          </XingyiChatBubble>
        </template>
        <div v-if="running && !pendingConfirm && !pendingAsk && !pendingStatusScope" class="xingyi-dock__activity">
          <XingyiStarIcon class="xingyi-dock__activity-star xy-star--running" />
          <span class="xingyi-dock__activity-text">{{ activity || t('xingyi.thinking') }}</span>
        </div>
        <!-- 星依当轮信息流：AgentTurnStream 是权威展示入口，非空直出且跟随消息区滚动。 -->
        <AgentTurnStream
          v-if="xingyiTurnStreamState.entries.length"
          :entries="xingyiTurnStreamState.entries"
          :running="xingyiTurnStreamState.running"
        />
      </div>
      <!-- 三类 InteractionRequest 共用同一底部停靠层：卡片不再随消息/工具信息流上移。 -->
      <AgentInteractionDock v-if="pendingInteraction">
        <div v-if="pendingConfirm" class="xingyi-dock__confirm">
          <div class="xingyi-dock__confirm-title">{{ pendingConfirm.title }}</div>
          <div v-for="(line, index) in pendingConfirm.lines" :key="index" class="xingyi-dock__confirm-line">{{ line }}</div>
          <div class="xingyi-dock__confirm-feedback">
            <input
              v-model="confirmFeedbackInput"
              class="xingyi-dock__confirm-input"
              placeholder="有不同意见？写下希望怎么改…"
              @keydown.enter="handleConfirmFeedbackKeydown"
            >
            <button type="button" class="xingyi-dock__confirm-send" :disabled="!confirmFeedbackInput.trim()" @click="submitConfirmFeedback">发送意见</button>
          </div>
          <div class="xingyi-dock__confirm-actions">
            <button type="button" class="xingyi-dock__confirm-btn xingyi-dock__confirm-btn--cancel" @click="resolvePendingConfirm(false)">{{ t('common.cancel') }}</button>
            <button type="button" class="xingyi-dock__confirm-btn xingyi-dock__confirm-btn--ok" @click="resolvePendingConfirm(true)">{{ t('xingyi.confirmExecute') }}</button>
          </div>
        </div>
        <div v-else-if="pendingAsk" class="xingyi-dock__ask">
          <div class="xingyi-dock__ask-q">{{ pendingAsk.question }}</div>
          <!-- 「在地图上看草案」入口（地图草案剪影可视化计划批3）：只在这张确认卡带了剪影清单时才露出。 -->
          <button
            v-if="pendingAsk.sketches && pendingAsk.sketches.length"
            type="button"
            class="xingyi-dock__ask-map-btn"
            @click="huiyuSketchMapOpen = true"
          >{{ t('xingyi.viewDraftOnMap') }}</button>
          <button
            v-for="(option, index) in pendingAsk.options"
            :key="index"
            type="button"
            class="xingyi-dock__ask-opt"
            @click="resolvePendingAsk(option.label)"
          >
            <span class="xingyi-dock__ask-opt-label">{{ option.label }}</span>
            <span v-if="option.note" class="xingyi-dock__ask-opt-note">{{ option.note }}</span>
          </button>
          <!-- 自己输入框始终提供（2026-07-09 用户拍板：除了星依给的选项，永远留一个用户自己写的口子） -->
          <div class="xingyi-dock__ask-other">
            <input
              v-model="askOtherInput"
              class="xingyi-dock__ask-input"
              placeholder="其他想法…（选项都不合意就自己写）"
              @keydown.enter="handleAskOtherKeydown"
            >
            <button type="button" class="xingyi-dock__ask-send" :disabled="!askOtherInput.trim()" @click="submitAskOther">发送</button>
          </div>
        </div>
        <!-- scope 确认卡（2026-07-10 抽共享 StatusScopeConfirmCard·提调坞同源复用·联动能力）：
             星依侧仍是 Promise 直等接缝——confirm/cancel 事件 resolve pendingStatusScope。 -->
        <StatusScopeConfirmCard
          v-else-if="pendingStatusScope"
          :purpose="pendingStatusScope.request.purpose"
          :character-options="pendingStatusScope.characterOptions"
          :character-hint="pendingStatusScope.request.characterHint || ''"
          :session-hint="pendingStatusScope.request.sessionHint || ''"
          hint="先选对角色、对话和文档库范围，星依只会在你确认的范围里查资料，不会串到别的对话。"
          allow-feedback
          @confirm="resolvePendingStatusScope($event)"
          @feedback="resolvePendingStatusScopeFeedback($event)"
          @cancel="resolvePendingStatusScope(null)"
        />
      </AgentInteractionDock>
      <!-- 写权限模式（2026-07-15 收进输入框最左侧小圆球）：胶囊+提示行两处占位收成一个圆点，
           点按/Shift+Tab 快捷键切换逻辑不变，只是不再常驻展示切换提示文字，省空间。 -->
      <div
        class="xingyi-dock__composer"
        @dragover.prevent="handleComposerDragOver"
        @drop.prevent="handleComposerDrop"
      >
        <AgentModelPickerPanel
          v-if="modelPickerOpen"
          ref="modelPickerRef"
          :model-value="modelSelection"
          @update:model-value="updateModelSelection"
          @close="modelPickerOpen = false"
        />
        <AgentWriteModeToggle
          :auto-approve="autoApproveWrites"
          :auto-label="t('xingyi.autoApproveOn')"
          :confirm-label="t('xingyi.autoApproveOff')"
          :auto-hint="t('xingyi.autoApproveOnHint')"
          :confirm-hint="t('xingyi.autoApproveOffHint')"
          :auto-glyph="t('xingyi.autoApproveGlyphOn')"
          :confirm-glyph="t('xingyi.autoApproveGlyphOff')"
          @toggle="toggleWriteMode"
        />
        <!-- 图片附件悬浮缩略图条（输入框图片上传计划批5）：与主聊天 ChatInputBar 同一份共享组件，
             悬浮在输入框上方（.xingyi-dock__composer 已是 position:relative 锚点）。 -->
        <ImageAttachmentChips
          v-if="visiblePendingImageAttachments.length"
          class="xingyi-dock__attachment-chips"
          :images="visiblePendingImageAttachments"
          @remove="chatImageAttachments.removeImage"
          @retry="chatImageAttachments.retryUpload"
          @preview="openFullscreenImage"
        />
        <AgentSlashCommandPanel
          v-if="slashPanelMode"
          ref="slashPanelRef"
          :items="slashPanelItems"
          :selected-index="slashSelectedIndex"
          :title="slashPanelMode === 'sessions' ? t('xingyi.resumeTitle') : ''"
          :loading="slashPanelMode === 'sessions' && resumeLoading"
          :loading-text="t('common.loading')"
          :empty-text="slashPanelMode === 'sessions' ? t('xingyi.resumeEmpty') : t('xingyi.noMatchCommand')"
          :delete-label="t('xingyi.deleteConversation')"
          @update:selected-index="slashSelectedIndex = $event"
          @select="selectSlashPanelItem"
          @delete="deleteSlashPanelItem"
          @close="closeSlashPanel"
        />
        <XingyiChatComposer
          ref="composerRef"
          v-model="draft"
          :running="running"
          :disabled="running"
          :send-disabled="!running && !draft.trim() && !hasReadyImageAttachment"
          :send-ready="!running && (Boolean(draft.trim()) || hasReadyImageAttachment)"
          :placeholder="t('xingyi.inputPlaceholder')"
          :send-title="t('chat.send')"
          :stop-title="t('xingyi.stopTurn')"
          @keydown="handleComposerKeydown"
          @paste="handleComposerPaste"
          @submit="send"
          @stop="stopXingyiTurn"
        >
          <!-- 待办卡锚定真实输入字段，宽度按输入字段而不是整条工具栏计算。 -->
          <template #task-todo>
            <AgentTaskTodoCard :snapshot="taskTodoSnapshot" />
          </template>
        </XingyiChatComposer>
      </div>
    </div>
  </FloatingWorkspaceWindow>
  </Teleport>
  <PhotoCropDialog
    :open="avatarCropOpen"
    :source="avatarCropSource"
    :title="avatarCropTitle"
    :initial-focus-x="avatarCropPreset.focusX"
    :initial-focus-y="avatarCropPreset.focusY"
    :initial-zoom="avatarCropPreset.zoom"
    :z-index="13110"
    @cancel="finishAvatarCrop(null)"
    @confirm="finishAvatarCrop"
  />
  <!-- 星依设置面板。 -->
  <XingyiSettingsDialog
    :open="xingyiSettingsOpen"
    :desktop-pet-visible="desktopPetVisible"
    :show-diary-settings="true"
    @update:desktop-pet-visible="setDesktopPetVisible($event)"
    @close="xingyiSettingsOpen = false"
  />
  <!-- 剪影草案地图弹窗（地图草案剪影可视化计划批3）：独立于 FloatingWorkspaceWindow 的顶层节点
       （组件内部自带 Teleport to body）；session-id 用确认卡透传的 worldSessionId——绘舆此次派发的目标
       会话，可能不是当前活动会话，故不能复用 AppChatSection 那份按活动会话绑定的舆图弹窗实例。
       world-id（星依世界寻址批·2026-07-13）：world 直达派发时 worldSessionId 传的是星依浮坞自身会话
       （合成宿主，见 dispatchXingyiMapWorkToWorld），弹窗按它查不到目标世界——这里补传 worldId 兜底，
       MapViewerDialog.loadWorldState 查不到会话世界时会改用该 prop（世界必须真实存在于 fetchWorlds 才生效）。 -->
  <MapViewerDialog
    v-if="pendingMapDraftReview || (huiyuSketchMapOpen && pendingAsk)"
    :open="Boolean(pendingMapDraftReview) || huiyuSketchMapOpen"
    :session-id="pendingMapDraftReview?.sessionId || pendingAsk?.worldSessionId || ''"
    :world-id="pendingMapDraftReview?.request.worldId || pendingAsk?.worldId || ''"
    :draft-sketches="pendingMapDraftReview ? [] : (pendingAsk?.sketches || [])"
    :draft-review-items="pendingMapDraftReview?.request.items || []"
    @close="handleDraftMapClose"
    @sketch-decision="handleHuiyuSketchDecision"
    @draft-review-decision="handleMapDraftReviewDecision"
  />
</template>

<script setup lang="ts">
/**
 * 星依浮坞（XingyiDock）—— 陈星依总 agent 的全局唤出入口（批次1）。
 *
 * - 挂在 AppGlobalOverlays（Teleport 到 body），Shift+X 全局唤出/收起；组件自持开合状态（不进 store）。
 * - 会话持久：星依常驻会话在主库（kind='xingyi'，服务端幂等 ensure），消息走现役 chat 消息接口。
 * - 模型调用：runXingyiAgent（deferred+toolsearch）+ callAIWithTools + 「星依」模型用途槽 + feature:'xingyi'。
 * - 深色适配：只用 --morandi-* token（teleport 到 body 后 #app.dark-mode 选不中，勿改用它）。
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FloatingWorkspaceWindow from '../common/FloatingWorkspaceWindow.vue'
import PhotoCropDialog from '../common/PhotoCropDialog.vue'
import { useSettingStore } from '../../stores/settingStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useChatStore } from '../../stores/chatStore'
import { isAgentSessionKind } from '../../../shared/agentSessionKinds'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { statusWorkspaceXingyiHost } from '../../app/statusWorkspaceXingyiHost'
import { XINGYI_DOCK_OPEN_REQUEST_EVENT, readXingyiDockOpenRequest } from '../../app/xingyiDockOpenRequest'
import { requestChatImageAvatarAssignment } from '../../app/chatImageAvatarAssignment'
import { useAI } from '../../composables/useAI'
import { runXingyiAgent, type XingyiHistoryMessage } from '../../app/xingyiAgentHarness'
import { NARRATIVE_SEED_WORKSPACE_SUBAGENT_ID, runNarrativeSeedWorkspaceAgent } from '../../app/narrativeSeedWorkspaceAgent'
import type { XingyiAvatarCropPreset } from '../../app/xingyiConversationAvatarTools'
import { createXingyiBatchCharacterProvider } from '../../app/xingyiBatchCharacterProvider'
import type { XingyiConversationMember } from '../../app/xingyiConversationMemberTools'
import { createXingyiPlayableWorldDocumentLibrary } from '../../app/xingyiPlayableWorldDocumentLibrary'
import { createCurtainTimeFlowPatch, formatLocalCurtainTime } from './script/curtainSettings'
import type { XingyiWriteConfirmRequest } from '../../app/xingyiFunctionTools'
import type { XingyiAskUserRequest } from '../../app/xingyiAskUserTool'
import type { XingyiStatusScopeRequest, XingyiStatusScopeSelection } from '../../app/xingyiStatusScopeTool'
// 人在环上通道统一契约（2026-07-12 架构审查批C）：写确认/选择/scope 三卡合并单一真值的公共信封类型，
// 本文件只 import 消费，不编辑该契约文件（并行 agent 领地）。
import type { InteractionRequest, InteractionAnswer } from '../../app/agentRuntime/interactionContract'
// scope 确认卡（2026-07-10 抽共享·提调坞同源复用）：对话选项/文档库树/预选逻辑都在卡内自包含。
import StatusScopeConfirmCard from './StatusScopeConfirmCard.vue'
import type { XingyiChatContact } from '../../app/xingyiTidiaoDispatchTools'
import { createXingyiCharacterBrainCrudAdapter } from '../../app/xingyiUnitCrudBrainAdapter'
import { createXingyiDocLibraryCrudAdapter, DOC_LIBRARY_EXTERNAL_UPDATED_EVENT } from '../../app/xingyiUnitCrudDocLibraryAdapter'
import { fetchDocLibraryState, saveDocLibraryState } from '../../repositories/docBrainRepository'
import {
  createManualCharacterSnapshotRecord,
  listCharacterSnapshotRecords
} from '../../repositories/characterRepository'
import type { AgentRuntimeProgressEvent } from '../../app/agentRuntime/runtime'
import type { AgentTaskTodoSnapshot } from '../../app/agentRuntime/taskTodo'
import { toOpenAiTools } from '../../app/agentRuntime/toolRegistry'
import { buildTaskModelAiOptions } from '../../utils/modelTaskTiers'
// 输入框图片上传计划批5（星依浮坞接线）：与主聊天输入框批4同一套共享件，浮坞各自 new 一份
// useImageAttachments 实例（两处上传是并行的两条队伍，互不共享 pendingImages）。
import { useImageAttachments, type CaptionUpdateListener } from '../../composables/app/useImageAttachments'
import ImageAttachmentChips from './chat/ImageAttachmentChips.vue'
import { readMessageAttachments, type ChatImageAttachment } from '../../utils/chatAttachments'
import {
  activateXingyiChatSession,
  buildChatSessionPatch,
  createChatMessageBySessionId,
  createChatSession,
  createWorld,
  createXingyiChatSession,
  deleteChatSessionById,
  ensureXingyiChatSession,
  executeOrchestrationCommands,
  fetchChatSessionBundleById,
  fetchChatSessionCharacterPresence,
  fetchNarrativeSeeds,
  fetchNarrativeSeedDetail,
  fetchStatusPanelTemplates,
  fetchStatusPanels,
  fetchOrchestrationWorkspaceProjection,
  fetchWorldDetail,
  createNarrativeSeed,
  updateNarrativeSeed,
  deleteNarrativeSeed,
  // 星依世界直达（2026-07-13）：listWorlds 工具与 readWorldMap 只读摘要的浮坞侧真值来源。
  fetchWorlds,
  fetchWorldMapBundle,
  getChatSessionBoundAlias,
  getChatStoreActiveSessionId,
  getChatStoreActiveTargetId,
  getChatStoreCurrentMessages,
  getChatStoreCurrentSession,
  listXingyiChatSessions,
  normalizeChatSessionCharacterParticipants,
  attachSessionWorld,
  saveWorldDocLinks,
  saveStatusPanelTemplate,
  saveStatusPanel,
  setChatSessionCharacterPresence,
  saveChatSessionPatchById,
  // 带图乐观发送（2026-07-11）：caption 后台补全完成后，用它把合并好的完整附件数组整体回填落库消息。
  updateChatMessageBySessionId,
  // 立即生成今天日记（日记化归档批次3 修正·2026-07-16）：从设置面板挪到工具栏按钮+/diary斜杠命令，
  // 由 XingyiDock 直接调用，不再经 XingyiSettingsDialog 内部按钮。
  triggerXingyiDiaryGenerateNow,
  type ChatSessionBundle,
  type XingyiSessionSummary
} from '../../repositories/chatRepository'
import {
  resolveXingyiChatContact,
  XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX,
  extractTidiaoCorrectionTaskTitle
} from '../../app/xingyiTidiaoDispatchTools'
import {
  buildHuiyuToolset,
  renderHuiyuDispatchOutcome,
  runHuiyuMapWork,
  HUIYU_SUBAGENT_ID_PREFIX,
  HUIYU_DRAFT_SUBAGENT_ID_PREFIX,
  extractHuiyuTaskTitle,
  type HuiyuMapWorkInput,
  type HuiyuDraftSketchItem
} from '../../app/huiyuSubagent'
// 绘舆共享编排引擎（笔刷约束系统批D）：草案确认/阶段管线的编排真值在 huiyuOrchestration.ts，
// 浮坞只注入 UI 依赖（阻塞确认通道=requestAskUser 卡片）。
// serializeHuiyuSketchDecision（批3）：地图弹窗决策提交后统一走它序列化，双坞共用同一份、不各自拼 JSON。
import { buildBlockingConfirmChannel, runHuiyuDraftThenDraw, runHuiyuStage, serializeHuiyuSketchDecision, type HuiyuSketchDecision } from '../../app/huiyuOrchestration'
import { createHuiyuAuditRunner, renderMapSummary, resolveCurrentMapStage } from '../../app/huiyuMapTools'
// 装甲快画（装甲地图系统批A2·2026-07-13）：一次模型调用画一座山脉，不经绘舆 20 分钟多轮 loop——
// armorOrchestration 是端到端编排（读图→点阵投影→装甲画师→展开→落库），这里只注入 UI 依赖
// （callModel + 手动 begin/end 运行卡，因为它不是 runSubagentLoop 骨架的 agentic loop，是一次/两次直调）。
import {
  runMountainArmorWork,
  runGrassArmorWork,
  ARMOR_SUBAGENT_ID_PREFIX,
  renderArmorBrief,
  extractArmorTaskTitle
} from '../../app/mapArmor/armorOrchestration'
import { runRiverArmorWork } from '../../app/mapArmor/riverOrchestration'
import { runWaterArmorWork } from '../../app/mapArmor/waterOrchestration'
import type { ArmorPainterCallModel } from '../../app/mapArmor/armorPainter'
import {
  runVectorPrimitiveWork,
  VECTOR_SUBAGENT_ID_PREFIX,
  renderVectorBrief,
  extractVectorTaskTitle
} from '../../app/mapDrawing/vectorOrchestration'
import type { XingyiMapWorkTaskInput } from '../../app/xingyiMapDispatchTools'
import { buildMapTaskPlacementRequest } from '../../app/mapTaskPlacement'
import type {
  MapDraftReviewDecision,
  MapDraftReviewRequest,
  MapDraftReviewResolution
} from '../../app/mapDraftReview'
import { appendSubagentRunTimeline, beginSubagentRun, endSubagentRun } from '../../app/subagentRunStatus'
import { renderMapDrawTrace } from '../../app/mapDrawTrace'
// terraform 系列级授权（提速批B·2026-07-12）：一次批准 30 分钟内本会话+同世界的后续 terraform 免卡沿用。
// 只在这里（星依阻塞确认通道）接线；提调 advisory 流（useChatSendPipeline）不接，弹卡行为不变。
import { recordHuiyuTerraformGrant, reuseHuiyuTerraformGrant } from '../../app/huiyuTerraformGrantState'
// 派采风钻探（地图严谨协作与运行卡计划批2·2026-07-11）：与派绘舆同构装配，deps 全量装齐
// （retrievalContext/projectionContext/chatMessageReadContext/statusSystem，见下方 buildXingyiCaifengDeps，
// 绘舆自查用的 research 装配换成同一份，消灭两套残缺/全量并存）。
import {
  buildCaifengToolset,
  renderCaifengDispatchOutcome,
  runCaifengResearch,
  CAIFENG_SUBAGENT_ID_PREFIX,
  extractCaifengTaskTitle,
  type CaifengToolsetDeps
} from '../../app/caifengSubagent'
import {
  buildZaoceToolset,
  runZaoceBuild,
  ZAOCE_SUBAGENT_ID_PREFIX
} from '../../app/zaoceSubagent'
import type {
  XingyiZaoceStatusDesignFocus,
  XingyiZaoceStatusDesignInput
} from '../../app/xingyiZaoceStatusDesignTools'
import { STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT } from '../../app/xingyiStatusSystemTools'
import { loadRenderedAgentContext } from '../../app/agentContext/agentContextProvider'
import { createTidiaoChatMessageReadContext } from '../../app/tidiaoChatMessageTools'
import { createTidiaoMessageProjectionContext } from '../../app/tidiaoMessageProjectionTools'
import { buildTidiaoStatusSystemSeam, loadDirectorProjectionObservations } from '../../app/tidiaoCorrectionAssembly'
import { buildToolsearchOverrideProtocol } from '../../app/tidiaoGlobalTools'
import { prepareCurtainSceneUpdate } from '../../app/curtainSceneUpdate'
import { noteCurtainSceneUpdated } from '../../app/tidiaoDirectorStreamState'
// 星依派出的子agent运行卡（地图严谨协作与运行卡计划批1·2026-07-11）：与提调带同源复用共享展示组件，
// 星依侧多加一层「在飞登记」——浮坞不属于任何目标会话，登记表记「派发过去哪个会话+哪个子agent前缀」，
// 据此跨会话汇总卡片（真值仍是 subagentRunStatus 单一状态表，登记表不做双写）。
import SubagentDispatchCardList, { type SubagentDispatchCardSource } from './chat/SubagentDispatchCardList.vue'
import AgentTurnStream from './AgentTurnStream.vue'
import AgentInteractionDock from './AgentInteractionDock.vue'
import AgentTaskTodoCard from './AgentTaskTodoCard.vue'
import AgentModelPickerPanel from './AgentModelPickerPanel.vue'
import AgentSlashCommandPanel from './AgentSlashCommandPanel.vue'
import {
  beginXingyiTurnStream,
  clearXingyiTurnStream,
  drainXingyiTurnStreamEntries,
  endXingyiTurnStream,
  feedXingyiTurnStreamProgress,
  settleAllOpenXingyiTurnStreamEntries,
  xingyiTurnStreamState,
  type XingyiTurnStreamEntry
} from '../../app/xingyiTurnStreamState'
import { parseAgentTurnStream, serializeAgentTurnStream } from '../../app/agentTurnStream'
import {
  clearXingyiDispatchRegistry,
  listXingyiDispatchRegistry,
  registerXingyiDispatch
} from '../../app/xingyiSubagentDispatchRegistry'
import {
  createSubagentControlCapability,
  registerActiveSubagentControl
} from '../../app/agentRuntime/subagentControl'
import {
  clearAgentConversationContinuation,
  readAgentConversationContinuation,
  saveAgentConversationDeferredTools,
  saveAgentConversationModelSelection,
  saveAgentConversationTaskTodo
} from '../../app/agentRuntime/conversationContinuation'
import {
  PLAYABLE_WORLD_SLASH_COMMAND_NAME,
  filterSlashCommands,
  parsePlayableWorldSlashCommand,
  parseSlashQuery,
  type XingyiSlashCommand
} from '../../app/xingyiSlashCommands'
import { resolveXingyiGlobalStatus, xingyiDockRunStatus } from '../../app/xingyiGlobalStatus'
import {
  buildAgentConversationModelAiOptions,
  createDefaultAgentConversationModelSelection,
  normalizeAgentConversationModelSelection,
  type AgentConversationModelSelection
} from '../../app/agentConversationModelSelection'
import {
  notifyNarrativeSeedsExternalUpdatedAfterPersistence,
  type NarrativeSeedsExternalUpdatedDetail
} from '../../app/narrativeSeedWorkspaceEvents'
import { readActiveSessionContext, resolveXingyiSessionCandidate, type XingyiSessionContext } from '../../app/xingyiSessionContext'
import { isCartographerBusyForWorld } from '../../app/workspaceAgentScopeState'
import { shouldUseMobileWorkspace } from '../mobile-workspace/mobileWorkspaceSurface'
import XingyiStarIcon from './XingyiStarIcon.vue'
import XingyiDesktopPet from './XingyiDesktopPet.vue'
import XingyiSettingsDialog from './XingyiSettingsDialog.vue'
// 气泡壳 + 输入框壳：由共享聊天组件统一维护，
// 改这两份共享外观时两处一并核对是否要跟。
import XingyiChatBubble from './XingyiChatBubble.vue'
import XingyiChatComposer from './XingyiChatComposer.vue'
import AgentWriteModeToggle from './AgentWriteModeToggle.vue'
import XingyiDockHeader from './XingyiDockHeader.vue'
import AgentConversationEmptyState from './AgentConversationEmptyState.vue'
import { logger } from '../../utils/logger'
import { useStickToBottom } from '../../composables/useStickToBottom'
import { readImageUrlAsDataUrl } from '../../utils/photoFile'

// 剪影草案地图弹窗（地图草案剪影可视化计划批3）：懒加载，与主聊天舆图弹窗同一份组件——本坞独立持有
// 一个实例（不复用 AppChatSection 那份，二者绑的 sessionId 可能不同：星依可跨会话派发绘舆，见下方
// requestAskUser 的 worldSessionId 字段）。
const MapViewerDialog = defineAsyncComponent(() => import('./map/MapViewerDialog.vue'))

const { t } = useI18n()
const settingStore = useSettingStore()
const charStore = useCharacterStore()
const chatStore = useChatStore()
const runtimeStore = useWorkspaceRuntimeStore()
const ai = useAI()

/** 带图乐观发送（2026-07-11）：本地展示消息在 XingyiHistoryMessage 之上加一个仅前端用的失败标记——
 *  乐观 push 后台流程（上传/落库/AI 调用）出错时置真，气泡下方给个轻量提示；不进落库 payload，
 *  也不影响 readMessageAttachments 等既有读侧解析（额外字段，非侵入）。
 *  turnStream：本条 assistant 消息「收编」到的信息流（drain 单例拿到的片段），非空时由
 *  AgentTurnStream 在该消息上方回放；随消息一起落库 turn_stream_json，
 *  刷新/切会话/隔天回来经 applySessionBundle 水合回填，实现历史回放。 */
type XingyiDisplayMessage = XingyiHistoryMessage & { _sendFailed?: boolean; turnStream?: XingyiTurnStreamEntry[] }

const open = ref(false)
const DESKTOP_PET_VISIBLE_KEY = 'langhuan.xingyiPet.visible'

function readDesktopPetVisible(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(DESKTOP_PET_VISIBLE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** 桌宠显示偏好的唯一真值：桌宠关闭按钮与设置面板都只改这一份设备级状态。 */
const desktopPetVisible = ref(readDesktopPetVisible())

function setDesktopPetVisible(visible: boolean) {
  desktopPetVisible.value = visible
  try {
    window.localStorage.setItem(DESKTOP_PET_VISIBLE_KEY, String(visible))
  } catch {
    // localStorage 不可用时仅放弃跨刷新记忆，本次页面内状态仍然有效。
  }
}
// 状态工作区过渡期只移动本组件同一个实例：即使自由浮坞原本关闭，进入状态工作区也应完整显示。
const dockVisible = computed(() => open.value || Boolean(statusWorkspaceXingyiHost.value))
const sessionId = ref('')
const sessionLoaded = ref(false)
const messages = ref<XingyiDisplayMessage[]>([])
const draft = ref('')
const running = ref(false)
const activity = ref('')
const taskTodoSnapshot = ref<AgentTaskTodoSnapshot | null>(null)
const deferredActiveTools = ref<string[]>([])
const modelSelection = ref<AgentConversationModelSelection>(
  createDefaultAgentConversationModelSelection('xingyi')
)
const modelPickerOpen = ref(false)
/** turn 级停止（2026-07-13）：send() 开跑时新建，finally 清空——signal 全链穿透给 runXingyiAgent/
 *  callOrchestrator/dispatchXingyiResearch/dispatchXingyiMapWork 各处 ai.callAIWithTools 与子代理 deps，
 *  停子代理不留孤儿。只管本轮星依 loop，不进 chatTaskRuns（不是「中断保留+纠偏续回」协议，见任务书）。 */
const xingyiAbortController = ref<AbortController | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
// 输入框壳组件实例（textarea 交给 XingyiChatComposer.vue 自理）：需要真实 DOM 节点做「聚焦」「判断
// 当前焦点是不是这个输入框」时，取 composerRef.value?.textareaEl（组件 defineExpose 暴露）。
const composerRef = ref<InstanceType<typeof XingyiChatComposer> | null>(null)
const modelPickerRef = ref<InstanceType<typeof AgentModelPickerPanel> | null>(null)
const slashPanelRef = ref<InstanceType<typeof AgentSlashCommandPanel> | null>(null)

const canUse = computed(() => true)

/** 图片附件（输入框图片上传计划批5）：星依浮坞输入状态本来就是组件本地 draft ref，附件同层放组件里
 *  是一致做法——不像主聊天走 useChatUiState 的共享层。getCaptionDeps 的 agentConfig/callAI 与 send()
 *  里 runXingyiAgent 的 callOrchestrator 同源（settingStore.getBrainAgentConfig / ai.callAI），
 *  sessionId 用星依活动会话 id（懒读 .value，caption 触发时才取当下值，不会读到过期会话）。
 *  ⚠️ 星依主力走订阅桥原生识图，caption 默认不触发——见 useImageAttachments.ts::IMAGE_CAPTION_ENABLED
 *  （用户 2026-07-11 拍板默认关闭）。这段注入保留不删，是复活开关时唯一依赖的依赖源。 */
const chatImageAttachments = useImageAttachments({
  getCaptionDeps: () => ({
    agentConfig: settingStore.getBrainAgentConfig?.() || null,
    callAI: ai.callAI,
    sessionId: sessionId.value
  })
})
// 顶层扁平绑定（供模板直接访问 .length/传 prop）：chatImageAttachments 本身是普通对象非 ref，
// 模板对嵌套属性 chatImageAttachments.pendingImages 不会自动解包，需落一份顶层 ref 绑定。
const pendingImageAttachments = chatImageAttachments.pendingImages
const hasReadyImageAttachment = computed(() => pendingImageAttachments.value.some((img) => img.status === 'ready'))
/** 带图乐观发送（2026-07-11）：send() 按下的瞬间只是「视觉隐藏」chips——把这一轮附件 id 记进这个集合，
 *  底层 pendingImages/上传/caption 生命周期完全不受影响，交给后台 takeAttachments 自然完成+clear()。
 *  这样发送这一刻 chips 立刻清空，同时上传/caption 不会被打断（同一份 pendingImages 不能提前清空，
 *  否则 processFile/triggerCaption 的 findEntry 幽灵回写守卫会误判「已被删除」而中止后续状态流转）。 */
const sendingImageIds = ref<Set<string>>(new Set())
const visiblePendingImageAttachments = computed(() =>
  pendingImageAttachments.value.filter((img) => !sendingImageIds.value.has(img.id))
)
/** 纯图片无文字时落库/本地气泡都用这句占位（服务端要求 content 非空）；渲染层拿它跟 message.content
 *  比对，命中就不重复显示文字（图片本身已表达内容），见下方消息气泡模板。 */
const imageOnlyPlaceholderText = computed(() => t('xingyi.imageOnlyPlaceholder'))

function handleComposerPaste(event: ClipboardEvent) {
  if (chatImageAttachments.handlePaste(event)) event.preventDefault()
}

function handleComposerDragOver(event: DragEvent) {
  chatImageAttachments.handleDragOver(event)
}

function handleComposerDrop(event: DragEvent) {
  chatImageAttachments.handleDrop(event)
}

/** 全局打开大图预览（批5）：浮坞 Teleport 到 body、拿不到 app.fullscreenModalState（那份状态只在
 *  WorkspaceShellRoot 内部创建一次，未经 props/store 下发给浮坞）——照搬本文件已有的
 *  langhuan:open-workspace-view 全局事件范式，新开一个同类事件，由 WorkspaceShellRoot 监听并写回
 *  app.fullscreenModalState.fullscreenImage（唯一真值），与主聊天点击放大最终走的是同一个全屏 modal。 */
function openFullscreenImage(url: string) {
  if (typeof window === 'undefined' || !url) return
  window.dispatchEvent(new CustomEvent('langhuan:open-fullscreen-image', { detail: { url } }))
}

/** 运行状态灯（批 D）：只反映本地 UI 状态，不新增真值。上轮出错标记，下轮发送时清掉。 */
const lastTurnError = ref(false)

/** 对话成功收尾的绿灯脉冲（2026-07-17 用户拍板）：浮坞关闭时常驻不消失（当作"有新完成"的提醒），
 *  浮坞打开时（或之后才打开时）维持 5 秒后自动熄灭；与 agentTaskNotice 自己的 5 秒 success 互不干扰。 */
const successPulseActive = ref(false)
let successPulseTimer: ReturnType<typeof setTimeout> | null = null

function clearSuccessPulseTimer() {
  if (successPulseTimer) {
    clearTimeout(successPulseTimer)
    successPulseTimer = null
  }
}

function markTurnSucceeded() {
  clearSuccessPulseTimer()
  successPulseActive.value = true
  // 完成时浮坞已经打开：立即开始 5 秒倒计时；关闭态则不计时，一直亮到用户真正打开浮坞看到为止。
  if (open.value) {
    successPulseTimer = setTimeout(() => { successPulseActive.value = false }, 5000)
  }
}

// 关闭态攒着的绿灯：用户打开浮坞那一刻起才开始 5 秒倒计时（“打开之后 5 秒”，不是完成之后 5 秒）。
watch(open, (isOpen) => {
  if (isOpen && successPulseActive.value && !successPulseTimer) {
    successPulseTimer = setTimeout(() => { successPulseActive.value = false }, 5000)
  }
})

const dockStatus = computed<'idle' | 'running' | 'waiting' | 'error' | 'success'>(() => {
  // 挂起确认/询问/范围卡时优先显示「等你确认」（此时 running 仍为 true，卡片在等用户点选）
  if (running.value) return (pendingConfirm.value || pendingAsk.value || pendingStatusScope.value) ? 'waiting' : 'running'
  if (lastTurnError.value) return 'error'
  return successPulseActive.value ? 'success' : 'idle'
})

// 浮坞本轮状态同步进共享视图 ref（移动 FAB 状态灯只读它；联动标注：MobileWorkspaceShell.vue 同源消费）。
// 不用 immediate：共享 ref 初值就是 idle，且 setup 期立即求值 dockStatus 会踩到下方 pending refs 的暂时性死区。
watch(dockStatus, (next) => { xingyiDockRunStatus.value = next })

/** 收起态全局入口（2026-07-10）：移动壳判定与 WorkspaceShellRoot 同一入口函数，加载时判一次不中途切换。 */
const isMobileShell = typeof window !== 'undefined' && shouldUseMobileWorkspace(window.location.search)

/** 浮坞私有主题（2026-07-11）：null=跟随全局；'dark'/'light'=固定覆盖（localStorage 持久）。
 *  只翻浮坞窗体（生效主题挂窗根 data-theme，token 整树重解析），全局主题与签牌不受影响。 */
const DOCK_THEME_KEY = 'langhuan.xingyiDock.theme'

function readDockThemeOverride(): 'dark' | 'light' | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(DOCK_THEME_KEY)
  return raw === 'dark' || raw === 'light' ? raw : null
}

const dockThemeOverride = ref<'dark' | 'light' | null>(readDockThemeOverride())
/** 星依设置面板开合（批次3 修正·2026-07-16）：齿轮按钮点开，与浮坞私有主题同层的组件内本地态。 */
const xingyiSettingsOpen = ref(false)
/** 立即生成今天日记的进行中状态（批次3 修正）：工具栏按钮 + /diary 斜杠命令共用同一个函数与同一个状态，
 *  防重复触发（已在生成中直接 return），成功/失败都推一条本地临时消息（不落库，仿 newChatFailed 同套写法）。 */
const diaryGenerating = ref(false)

async function triggerXingyiDiaryGenerateFromToolbar() {
  if (diaryGenerating.value) return
  diaryGenerating.value = true
  try {
    const result = await triggerXingyiDiaryGenerateNow()
    messages.value.push({ role: 'assistant', content: t('xingyi.diaryGenerateSuccess', { dateStr: result.dateStr }) })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    messages.value.push({ role: 'assistant', content: t('xingyi.diaryGenerateFailed', { detail }) })
  } finally {
    diaryGenerating.value = false
  }
}
const globalTheme = computed<'dark' | 'light'>(() => (settingStore.darkMode ? 'dark' : 'light'))
const dockTheme = computed<'dark' | 'light'>(() => dockThemeOverride.value ?? globalTheme.value)
const dockThemeToggleTitle = computed(() => t(dockTheme.value === 'dark' ? 'xingyi.dockThemeToLight' : 'xingyi.dockThemeToDark'))

function toggleDockTheme() {
  const next = dockTheme.value === 'dark' ? 'light' : 'dark'
  // 切回与全局一致时清掉覆盖（回到跟随全局），不留一个看不见的固定值
  dockThemeOverride.value = next === globalTheme.value ? null : next
  if (typeof window === 'undefined') return
  if (dockThemeOverride.value) window.localStorage.setItem(DOCK_THEME_KEY, dockThemeOverride.value)
  else window.localStorage.removeItem(DOCK_THEME_KEY)
}

/** Agent 任务提示（原右上角全局提示灯真值，展示层收编进浮坞）：直读 Pinia 单例 store。 */
const taskNotice = computed(() => runtimeStore.agentTaskNotice)
const taskExpanded = ref(false)
const visibleTaskSteps = computed(() => (taskNotice.value?.steps || []).slice(-8))

// 换了一条任务提示时收起详情（与旧提示卡同语义）
watch(() => taskNotice.value?.id, () => { taskExpanded.value = false })

function dismissTaskNotice() {
  runtimeStore.dismissAgentTaskNotice()
}

/** 「前往确认」：与旧右上角提示卡同一跳转协议（联动标注：AppDesktopPanel / AppChatSection 监听同一事件名）。 */
function openTaskSource() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('langhuan:open-workspace-view', {
    detail: {
      view: 'roles',
      characterId: String(taskNotice.value?.sourceCharacterId || '')
    }
  }))
}

/** 收起态状态灯：浮坞本轮状态 + 任务提示双源合并（优先级 error > waiting > running > success > idle）。 */
const globalStatus = computed(() => resolveXingyiGlobalStatus(dockStatus.value, taskNotice.value?.status ?? null))

/** 斜杠命令上拉栏（/clear、/resume）：命令态由草稿以 / 开头驱动，Esc 关闭后改动草稿会重新打开。 */
const slashDismissed = ref(false)
const slashSelectedIndex = ref(0)
const resumePanelOpen = ref(false)
const resumeLoading = ref(false)
const resumeSessions = ref<XingyiSessionSummary[]>([])

const slashQuery = computed(() => parseSlashQuery(draft.value))
// 本地版直接开放全部斜杠命令。
const slashCommands = computed(() => {
  if (slashQuery.value === null) return []
  return filterSlashCommands(slashQuery.value)
})
const slashPanelMode = computed<'commands' | 'sessions' | null>(() => {
  if (modelPickerOpen.value) return null
  if (resumePanelOpen.value) return 'sessions'
  if (!slashDismissed.value && slashQuery.value !== null) return 'commands'
  return null
})
const slashPanelItems = computed(() => slashPanelMode.value === 'sessions'
  ? resumeSessions.value.map((item) => ({
      id: item.id,
      label: item.name,
      description: `${item.id === sessionId.value ? t('xingyi.currentSessionMark') : ''}${t('xingyi.messageCount', { count: item.messageCount })}`,
      deletable: true
    }))
  : slashCommands.value.map((command) => ({
      id: command.name,
      label: command.usage,
      description: t(command.descriptionKey)
    }))
)

watch(draft, (next) => {
  slashDismissed.value = false
  slashSelectedIndex.value = 0
  // 只在真的输入了内容时收起过往对话面板（/resume 执行时会先清空草稿，空串不能误关）
  if (next) resumePanelOpen.value = false
  // 输入框自动增高（含拖拽变宽后的重算）已收进 XingyiChatComposer.vue 自理，这里不用再管。
})

/** 人在环上通道统一真值（2026-07-12 批C）：写确认/选择/scope 三卡合并为单一 pendingInteraction——
 *  同一时刻只应有一张卡片挂起，与 UI 实际单卡渲染的心智模型一致。下方 pendingConfirm/pendingAsk/
 *  pendingStatusScope 三个只读投影仍保留原名字与原字段形状，模板逐字节不用改；三个 request* 函数
 *  仍是原签名，只在内部把契约类型翻译成/翻译回各自的业务类型（薄适配器）。 */
const pendingInteraction = ref<{ request: InteractionRequest; resolve: (answer: InteractionAnswer) => void } | null>(null)

/** 星依头像工具的最终裁剪预览：工具给出推荐焦点/缩放，用户仍可在共享裁剪器里微调后保存。 */
const avatarCropOpen = ref(false)
const avatarCropSource = ref('')
const avatarCropTitle = ref('裁剪头像')
const avatarCropPreset = ref<XingyiAvatarCropPreset>({ focusX: 0.5, focusY: 0.5, zoom: 1 })
let avatarCropResolver: ((dataUrl: string | null) => void) | null = null

function requestAvatarCrop(
  source: string,
  title: string,
  preset: XingyiAvatarCropPreset
): Promise<string | null> {
  finishAvatarCrop(null)
  avatarCropSource.value = source
  avatarCropTitle.value = title
  avatarCropPreset.value = { ...preset }
  avatarCropOpen.value = true
  return new Promise<string | null>((resolve) => {
    avatarCropResolver = resolve
  })
}

function finishAvatarCrop(dataUrl: string | null) {
  const resolve = avatarCropResolver
  avatarCropResolver = null
  avatarCropOpen.value = false
  avatarCropSource.value = ''
  if (resolve) resolve(dataUrl)
}

/** 新请求顶替旧卡 / turn 异常收尾兜底：按当前挂起卡的 kind 给「取消」语义收掉，保证 promise 不悬挂。
 *  合并前三态各自独立 ref，新请求只顶掉「同类」旧卡；合并后单一真值下新请求会顶掉任意旧卡——
 *  这是合并单一真值的必然结果（此前理论上可能三卡同时挂起，与 UI 单卡渲染的实际心智模型不符），
 *  也顺带修掉旧 finally 兜底遗漏收 pendingAsk（选择卡）的 promise 泄漏。 */
function dismissPendingInteraction() {
  const cur = pendingInteraction.value
  if (!cur) return
  if (cur.request.kind === 'confirm') { resolvePendingConfirm(false); return }
  if (cur.request.kind === 'choice') { resolvePendingAsk(''); return }
  resolvePendingStatusScope(null)
}

/** 写操作确认卡片（批次2 统一确认门的浮坞侧实现）：工具 execute 前挂起等待，用户点确认/取消后放行。
 *  投影自 pendingInteraction（kind='confirm' 时非空）。 */
const pendingConfirm = computed(() => {
  const cur = pendingInteraction.value
  return cur && cur.request.kind === 'confirm' ? { title: cur.request.title, lines: cur.request.lines || [] } : null
})

/** 写权限模式（Shift+Tab 切换）：false=每次写操作弹确认卡（默认）；true=自动放行不弹卡。
 *  只存内存不持久——每次进应用回到需确认的安全默认；切换不影响已经弹出的卡片（那张仍要手点）。 */
const autoApproveWrites = ref(false)

function toggleWriteMode() {
  autoApproveWrites.value = !autoApproveWrites.value
}

/** 星依会话历史进 prompt 的截断上限（只控 prompt 体积，完整历史仍在库里）。 */
const HISTORY_LIMIT = 40

/** 只读工具名单（取料三件套+批次3b 会话定位/提调记忆检索）：过程轨文案区分「查资料」和「做事情」。 */
const RETRIEVAL_TOOL_NAMES = new Set([
  'recallSemantic', 'searchWorldText', 'fetchUnitDetail',
  'listChatContacts', 'readChatSessionMessages', 'searchDirectorMemory'
])

const confirmFeedbackInput = ref('')

/** 确认卡通用请求器（写确认门 + 删除对话共用）：确认、取消、用户意见都走统一 InteractionAnswer。 */
function requestConfirmCard(title: string, lines: string[], toolName: string): Promise<InteractionAnswer> {
  if (xingyiAbortController.value?.signal.aborted) return Promise.resolve({ status: 'denied' })
  // 极端情况兜底：上一张卡片还没被处理就来了新请求，旧的按取消收掉，保证 promise 不悬挂
  dismissPendingInteraction()
  confirmFeedbackInput.value = ''
  return new Promise<InteractionAnswer>((resolve) => {
    pendingInteraction.value = {
      request: { kind: 'confirm', title, lines, source: { agent: 'xingyi', toolName } },
      resolve
    }
    scrollToBottom()
  })
}

function requestWriteConfirm(request: XingyiWriteConfirmRequest): Promise<InteractionAnswer> {
  if (xingyiAbortController.value?.signal.aborted) return Promise.resolve({ status: 'denied' })
  // 放行模式：确认门仍然在（硬门结构不变），只是浮坞侧直接放行不弹卡
  if (autoApproveWrites.value) return Promise.resolve({ status: 'confirmed' })
  return requestConfirmCard(request.title, request.lines, 'confirmWrite')
}

function resolvePendingConfirm(ok: boolean) {
  const cur = pendingInteraction.value
  if (!cur || cur.request.kind !== 'confirm') return
  cur.resolve(ok ? { status: 'confirmed' } : { status: 'denied' })
  pendingInteraction.value = null
  confirmFeedbackInput.value = ''
}

// IME 选字确认回车守卫（同 handleComposerKeydown 口径）：这两个 input 没有 v-model 之外的合成态跟踪，
// 直接判 event.isComposing / keyCode 229，composing 中放行原生行为，不抢发半拼文本。
function handleConfirmFeedbackKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submitConfirmFeedback()
}

function handleAskOtherKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submitAskOther()
}

function submitConfirmFeedback() {
  const feedback = confirmFeedbackInput.value.trim()
  const cur = pendingInteraction.value
  if (!feedback || !cur || cur.request.kind !== 'confirm') return
  cur.resolve({ status: 'answered', answer: feedback })
  pendingInteraction.value = null
  confirmFeedbackInput.value = ''
}

/** 询问用户选择卡片（内核统一批·批C）：askUser 工具挂起等用户点选/输入，返回答复文本（空串=用户关掉没答）。
 *  投影自 pendingInteraction（kind='choice' 时非空）。sketches/worldId/worldSessionId（批3）：只在绘舆
 *  草案确认卡带了剪影清单时才有，走 InteractionRequest.payload 扩展槽（不改公共契约文件）。 */
const pendingAsk = computed(() => {
  const cur = pendingInteraction.value
  if (!cur || cur.request.kind !== 'choice') return null
  const payload = cur.request.payload as { sketches?: HuiyuDraftSketchItem[]; worldId?: string; worldSessionId?: string } | undefined
  return {
    question: cur.request.title,
    options: cur.request.options || [],
    ...(payload?.sketches?.length ? { sketches: payload.sketches, worldId: payload.worldId, worldSessionId: payload.worldSessionId } : {})
  }
})
const askOtherInput = ref('')
// 剪影草案地图弹窗开合（批3）：本地态，与 pendingAsk 生命周期无关（用户可能开着弹窗看图但还没提交决策）；
// 但 pendingAsk 卡片本身消失（答完/被新请求顶替）时弹窗留着无意义，顺带关掉。
const huiyuSketchMapOpen = ref(false)
watch(pendingAsk, (ask) => { if (!ask) huiyuSketchMapOpen.value = false })

// 新写链最终草稿确认门：与旧 pendingAsk/粗剪影协议分离。候选几何只存在于这个 Promise 生命周期里，
// 用户提交决策或关闭地图后立即释放；正式写入仍由 armor/vector orchestration 在并发复查后执行。
const pendingMapDraftReview = ref<{ sessionId: string; request: MapDraftReviewRequest } | null>(null)
let mapDraftReviewResolver: ((resolution: MapDraftReviewResolution) => void) | null = null

function finishMapDraftReview(resolution: MapDraftReviewResolution) {
  const resolve = mapDraftReviewResolver
  mapDraftReviewResolver = null
  pendingMapDraftReview.value = null
  if (resolve) resolve(resolution)
}

function requestMapDraftReview(sessionId: string, request: MapDraftReviewRequest): Promise<MapDraftReviewResolution> {
  if (xingyiAbortController.value?.signal.aborted) return Promise.resolve({ status: 'cancelled' })
  if (mapDraftReviewResolver) finishMapDraftReview({ status: 'cancelled' })
  huiyuSketchMapOpen.value = false
  pendingMapDraftReview.value = { sessionId, request }
  return new Promise<MapDraftReviewResolution>((resolve) => {
    mapDraftReviewResolver = resolve
  })
}

function handleMapDraftReviewDecision(decision: MapDraftReviewDecision) {
  finishMapDraftReview({ status: 'submitted', decision })
}

function handleDraftMapClose() {
  if (pendingMapDraftReview.value) {
    finishMapDraftReview({ status: 'cancelled' })
    return
  }
  huiyuSketchMapOpen.value = false
}

/** askUser 卡族留档（2026-07-11 用户真机拍板：答完卡片不消失）：把「卡片正文+选项+答复」作为对话记录
 *  写进消息流并落库——草案确认卡等重要确认从此有证据链，刷新/重开会话仍在。顺序落库（先问后答），避免两条并发乱序。
 *  过程流内联收编（2026-07-13）：归档的「问句」assistant 消息收编「问出这张卡片之前」积累的轮次/工具流水——
 *  与最终回复/错误回复同一收编语义（drain 单例→挂 turnStream→随 persistMessage 落库 turn_stream_json）。 */
function archivePendingAskRecord(answer: string) {
  const ask = pendingAsk.value
  if (!ask) return
  const lines = [t('xingyi.askArchiveTitle'), ask.question]
  if (ask.options.length) {
    lines.push('', ...ask.options.map((opt, i) => `${i + 1}. ${opt.label}${opt.note ? `（${opt.note}）` : ''}`))
  }
  const question = lines.join('\n')
  const reply = String(answer || '').trim() || t('xingyi.askDismissedAnswer')
  const drained = drainXingyiTurnStreamEntries()
  messages.value.push(
    { role: 'assistant', content: question, ...(drained.length ? { turnStream: drained } : {}) },
    { role: 'user', content: reply }
  )
  void (async () => {
    await persistMessage('assistant', question, undefined, drained)
    await persistMessage('user', reply)
  })()
}

/** requestAskUser 扩展入参（批3）：绘舆确认通道额外携带剪影清单+世界 id+目标会话 id，供确认卡渲染
 *  「在地图上看草案」按钮；普通 askUser 工具调用（模型直接调 askUser 工具）不会带这三项。 */
type XingyiHuiyuAskUserRequest = XingyiAskUserRequest & {
  sketches?: HuiyuDraftSketchItem[]
  worldId?: string
  /** 绘舆此次派发的目标会话 id（可能不是当前活动会话——星依可跨会话派发，见 dispatchXingyiMapWork）：
   *  地图弹窗按它拉世界，与 dispatchXingyiHuiyuEngineDeps 解析 worldId 时用的是同一个 sessionId、
   *  同一套 fetchChatSessionBundleById 查询，天然落到同一个世界，不需要弹窗支持"直传 worldId"。 */
  worldSessionId?: string
}

function requestAskUser(request: XingyiHuiyuAskUserRequest): Promise<string> {
  if (xingyiAbortController.value?.signal.aborted) return Promise.resolve('')
  // 兜底：上一张卡片还没处理就来了新请求，旧的按取消语义收掉（choice 卡走留档），保证 promise 不悬挂
  dismissPendingInteraction()
  askOtherInput.value = ''
  return new Promise<string>((resolve) => {
    pendingInteraction.value = {
      request: {
        kind: 'choice',
        title: request.question,
        options: request.options,
        allowOtherInput: request.allowOtherInput,
        source: { agent: 'xingyi', toolName: 'askUser' },
        ...(request.sketches?.length
          ? { payload: { sketches: request.sketches, worldId: request.worldId, worldSessionId: request.worldSessionId } }
          : {})
      },
      resolve: (answer) => resolve(answer.status === 'answered' ? answer.answer : '')
    }
    scrollToBottom()
  })
}

function resolvePendingAsk(answer: string) {
  const cur = pendingInteraction.value
  if (!cur || cur.request.kind !== 'choice') return
  const reply = String(answer || '').trim()
  archivePendingAskRecord(reply)
  cur.resolve(reply ? { status: 'answered', answer: reply } : { status: 'dismissed' })
  pendingInteraction.value = null
  askOtherInput.value = ''
}

function submitAskOther() {
  const text = askOtherInput.value.trim()
  if (text) resolvePendingAsk(text)
}

/** 地图弹窗提交决策（地图草案剪影可视化计划批3）→ 序列化成决策 JSON，等价于用户在自由输入框里写了
 *  这段答复——直接复用 resolvePendingAsk 同一条答案路径（留档/resolve/收卡逐字节一致）。 */
function handleHuiyuSketchDecision(payload: { kind: 'huiyu-sketch-decision' } & HuiyuSketchDecision) {
  huiyuSketchMapOpen.value = false
  resolvePendingAsk(serializeHuiyuSketchDecision(payload))
}

/** 建状态栏前「确认取料范围」卡片（2026-07-09）：卡片 UI/交互（角色单选+对话多选+文档库两级树+预选）
 *  已抽共享 StatusScopeConfirmCard（2026-07-10 融入计划批次4·提调坞同源复用·联动能力：交互/口径改动两侧同生效）。
 *  星依侧仍是 Promise 直等接缝：软约束（纲领要求建前先调 confirmStatusScope）+ 软锁（确认范围当提示回给模型）；
 *  可靠性主要靠让用户亲手选对角色/对话/范围，结构性避免状态栏挂错会话、跨对话捞资料。
 *  投影自 pendingInteraction（kind='scope' 时非空）：复杂载荷（原始 request + 角色选项）落在
 *  InteractionRequest.payload 里，读出时按原形状拼回，模板消费字段不变。 */
const pendingStatusScope = computed(() => {
  const cur = pendingInteraction.value
  if (!cur || cur.request.kind !== 'scope') return null
  const payload = cur.request.payload as {
    request: XingyiStatusScopeRequest
    characterOptions: Array<{ id: string; name: string }>
  } | undefined
  return payload || null
})

/** 确认取料范围接缝（注入给 harness 的 confirmStatusScope）：弹 scope 卡、等用户确认，返回结构化范围。 */
function requestStatusScope(request: XingyiStatusScopeRequest): Promise<XingyiStatusScopeSelection | { feedback: string } | null> {
  if (xingyiAbortController.value?.signal.aborted) return Promise.resolve(null)
  // 兜底：上一张卡片还没处理就来新请求，旧的按取消收掉，保证 promise 不悬挂
  dismissPendingInteraction()
  // 星依侧角色选项=全部角色（跨对话总 agent 语义；提调侧传会话成员，见 TidiaoDirectorDock）
  const characterOptions = (charStore.characters || [])
    .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
    .filter((item) => item.id)
  return new Promise<XingyiStatusScopeSelection | { feedback: string } | null>((resolve) => {
    pendingInteraction.value = {
      request: {
        kind: 'scope',
        title: request.purpose,
        source: { agent: 'xingyi', toolName: 'confirmStatusScope' },
        payload: { request, characterOptions }
      },
      resolve: (answer) => {
        if (answer.status === 'selection') resolve(answer.selection as XingyiStatusScopeSelection | null)
        else if (answer.status === 'answered') resolve({ feedback: answer.answer })
        else resolve(null)
      }
    }
    scrollToBottom()
  })
}

function resolvePendingStatusScope(selection: XingyiStatusScopeSelection | null) {
  const cur = pendingInteraction.value
  if (!cur || cur.request.kind !== 'scope') return
  cur.resolve({ status: 'selection', selection })
  pendingInteraction.value = null
}

function resolvePendingStatusScopeFeedback(feedback: string) {
  const cur = pendingInteraction.value
  const answer = String(feedback || '').trim()
  if (!answer || !cur || cur.request.kind !== 'scope') return
  cur.resolve({ status: 'answered', answer })
  pendingInteraction.value = null
}

// 智能跟底滚动（2026-07-12）：scrollRef 每次开窗都因外壳 FloatingWorkspaceWindow 的
// Transition mode="out-in" 整窗重建成新元素；过程中新增的 activity 状态行/SubagentDispatchCardList
// 卡片没有 messages.length 变化可依赖，改靠 MutationObserver 感知（观察 childList/subtree）。
const scrollStick = useStickToBottom(scrollRef, { observeMutations: true })
// force=true 用于开窗/DOM 重建等必须看到底部的场景；非 force 时受 stickToBottom 门控——
// 用户上滑阅读时不再被确认卡/选择卡拽回底部。
function scrollToBottom(force = false) {
  nextTick(() => {
    scrollStick.scrollToBottom(force)
  })
}

// 会话水合跟随“真实可见态”，不能只盯自由浮坞的 open：状态工作区会把同一实例 Teleport
// 到面板里，此时 open 仍为 false。若漏掉这个入口，历史只能等首次发送时被 send() 顺带加载。
watch(dockVisible, (next) => {
  if (!next) return
  void loadSession().then(() => scrollToBottom(true))
  // 状态工作区打开时不抢主工作区焦点；自由浮坞仍保持原来的自动聚焦体验。
  if (open.value) nextTick(() => composerRef.value?.focus())
}, { immediate: true })

// 浮坞外壳（FloatingWorkspaceWindow）经 Transition 重建内容，滚动容器每次打开都是新 DOM（scrollTop 归零）；
// 以滚动容器挂载为准强制跳到底部并重置 stick，保证一打开就看到最新消息。
watch(scrollRef, (el) => {
  if (el) scrollToBottom(true)
})

/** 把服务端会话 bundle 落进浮坞视图（ensure / /clear / /resume 三条链共用同一映射）。
 *  附件（批5）：读侧一律用 readMessageAttachments——GET 消息列表经 toCamel 后是驼峰键 attachmentsJson，
 *  与主聊天批4踩的键名坑同一份真值，不另开一套解析（详见 chatAttachments.ts::readMessageAttachments）。
 *  过程流回放（过程流内联持久化计划·2026-07-13）：turn_stream_json 经 toCamel 后是驼峰键 turnStreamJson
 *  （已是原始 JSON 字符串，需自行 parse），与 attachmentsJson 同一套「服务端整体透传」读法；parse 失败/非
 *  数组静默忽略，不影响消息本体渲染。同时 clear 单例防串台——本函数是 ensure/新建/恢复三条链的共同落地点，
 *  旧会话尾部残留的过程流水不该串到新会话视图里（与 drain 语义独立，clear 只清空不产出数据）。 */
function applySessionBundle(bundle: ChatSessionBundle) {
  clearXingyiTurnStream()
  sessionId.value = String(bundle?.session?.id || '')
  const continuation = readAgentConversationContinuation(sessionId.value)
  taskTodoSnapshot.value = continuation.taskTodo
  deferredActiveTools.value = continuation.deferredActiveTools
  modelSelection.value = normalizeAgentConversationModelSelection(continuation.modelSelection, 'xingyi')
  modelPickerOpen.value = false
  messages.value = (Array.isArray(bundle?.messages) ? bundle.messages : [])
    .map((item): XingyiDisplayMessage | null => {
      const role = String(item?.role || '')
      const content = String(item?.content || '')
      if ((role !== 'user' && role !== 'assistant') || !content) return null
      const attachments = readMessageAttachments(item)
      const turnStream = parseAgentTurnStream(item?.turnStreamJson)
      return {
        role: role as 'user' | 'assistant',
        content,
        ...(attachments.length ? { attachments } : {}),
        ...(turnStream ? { turnStream } : {})
      }
    })
    .filter((item): item is XingyiDisplayMessage => item !== null)
  sessionLoaded.value = true
}

async function loadSession() {
  if (sessionLoaded.value || !canUse.value) return
  try {
    applySessionBundle(await ensureXingyiChatSession())
  } catch (error) {
    logger.error('加载星依会话失败:', error)
  }
}

function closeSlashPanel() {
  resumePanelOpen.value = false
  slashDismissed.value = true
}

async function executeSlashCommand(command: XingyiSlashCommand) {
  if (command.name === PLAYABLE_WORLD_SLASH_COMMAND_NAME) {
    draft.value = '/build-world '
    slashSelectedIndex.value = 0
    await nextTick()
    composerRef.value?.focus?.()
    return
  }
  draft.value = ''
  slashSelectedIndex.value = 0
  if (command.name === 'clear') {
    await startNewConversation()
  } else if (command.name === 'resume') {
    await openResumePanel()
  } else if (command.name === 'model') {
    await loadSession()
    modelPickerOpen.value = true
  } else if (command.name === 'diary') {
    await triggerXingyiDiaryGenerateFromToolbar()
  }
}

function selectSlashPanelItem(index: number) {
  if (slashPanelMode.value === 'sessions') {
    const session = resumeSessions.value[index]
    if (session) void resumeSession(session)
    return
  }
  const command = slashCommands.value[index]
  if (command) void executeSlashCommand(command)
}

function deleteSlashPanelItem(index: number) {
  if (slashPanelMode.value !== 'sessions') return
  const session = resumeSessions.value[index]
  if (session) void deleteXingyiSession(session)
}

/** /clear：服务端新开星依会话（旧会话保留，可 /resume 找回），浮坞切到空对话。 */
async function startNewConversation() {
  try {
    const bundle = await createXingyiChatSession()
    clearXingyiDispatchRegistry()
    applySessionBundle(bundle)
  } catch (error) {
    logger.error('星依开启新对话失败:', error)
    messages.value.push({ role: 'assistant', content: t('xingyi.newChatFailed') })
  }
}

function updateModelSelection(selection: AgentConversationModelSelection) {
  modelSelection.value = normalizeAgentConversationModelSelection(selection, 'xingyi')
  if (sessionId.value) saveAgentConversationModelSelection(sessionId.value, modelSelection.value)
}

/** /resume：拉过往会话清单，进入上拉栏第二态（键盘上下+回车选中恢复）。 */
async function openResumePanel() {
  resumeLoading.value = true
  resumePanelOpen.value = true
  slashSelectedIndex.value = 0
  try {
    resumeSessions.value = await listXingyiChatSessions()
  } catch (error) {
    logger.error('星依读取过往对话失败:', error)
    resumeSessions.value = []
  } finally {
    resumeLoading.value = false
  }
}

/** 删除一段星依浮坞对话（管理·硬删除·不能恢复）：复用统一确认卡（不受写权限放行影响·删除必确认）。
 *  删的是当前对话就顺手开一段新对话；否则只从清单移除，面板停在 /resume 继续管理。 */
async function confirmDeleteConversation(name: string): Promise<boolean> {
  const answer = await requestConfirmCard(
    t('xingyi.deleteConversation'),
    [`「${name || t('xingyi.untitledConversation')}」`, t('xingyi.deleteConversationWarn')],
    'deleteConversation'
  )
  if (answer.status === 'answered') {
    draft.value = answer.answer
    nextTick(() => composerRef.value?.focus())
  }
  return answer.status === 'confirmed'
}

async function deleteXingyiSession(item: XingyiSessionSummary) {
  if (!item?.id) return
  const ok = await confirmDeleteConversation(item.name)
  if (!ok) return
  try {
    await deleteChatSessionById(item.id)
    clearAgentConversationContinuation(item.id)
    resumeSessions.value = resumeSessions.value.filter((session) => session.id !== item.id)
    // 删的是当前对话 → 开一段新的空对话（当前视图不能停在已删会话上）
    if (item.id === sessionId.value) await startNewConversation()
  } catch (error) {
    logger.error('删除星依对话失败:', error)
    messages.value.push({ role: 'assistant', content: t('xingyi.deleteConversationFailed') })
  }
}

async function resumeSession(item: XingyiSessionSummary) {
  resumePanelOpen.value = false
  if (!item?.id || item.id === sessionId.value) return
  try {
    applySessionBundle(await activateXingyiChatSession(item.id))
    scrollToBottom()
  } catch (error) {
    logger.error('星依恢复过往对话失败:', error)
    messages.value.push({ role: 'assistant', content: t('xingyi.resumeFailed') })
  }
}

/** 输入框统一键盘处理：上拉栏开着时上下键选中、回车执行、Esc 关闭；否则回车（无修饰键）发送。 */
function handleComposerKeydown(event: KeyboardEvent) {
  // IME 选字确认回车会以 key==='Enter' 触发（isComposing=true / keyCode 229），必须放行原生行为，
  // 否则会把半拼文本当发送/命令执行（与 MobileChatThread.vue handleComposerKeydown 同一口径）。
  if (event.isComposing || event.keyCode === 229) return
  if (modelPickerOpen.value && modelPickerRef.value?.handleKeydown(event)) return
  if (slashPanelMode.value && slashPanelRef.value?.handleKeydown(event)) return
  // 与原 @keydown.enter.exact.prevent="send" 同语义（无修饰键的回车才发送）
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault()
    void send()
  }
}

function handleProgress(event: AgentRuntimeProgressEvent) {
  // 星依当轮工作流（批G）：全部过程事件先喂进模块级流水（浮坞「工作流」区实时渲染），再更新一行字指示。
  feedXingyiTurnStreamProgress(event)
  if (event.kind === 'thought' && event.thought) {
    activity.value = event.thought
    return
  }
  if (event.kind === 'tool-start') {
    activity.value = RETRIEVAL_TOOL_NAMES.has(String(event.toolName || ''))
      ? t('xingyi.activitySearching', { tool: event.toolName })
      : t('xingyi.activityWorking', { tool: event.toolName })
  }
}

/** 指挥提调的联系人清单（会话定位数据源）：角色+群，与侧栏同一份 store 真值。 */
function listChatContacts(): XingyiChatContact[] {
  const characters = (charStore.characters || []).map((item): XingyiChatContact => ({
    targetId: String(item?.id || ''),
    name: String(item?.name || item?.id || ''),
    kind: 'character'
  }))
  const groups = (charStore.groups || []).map((item): XingyiChatContact => ({
    targetId: String(item?.id || ''),
    name: String(item?.name || item?.id || ''),
    kind: 'group'
  }))
  return [...characters, ...groups].filter((contact) => contact.targetId)
}

/** 联系人 targetId → 本地已存在的会话 id（不触发服务端补建）：
 *  chatStore.entities.chatSessions 按 session.id 为键——legacy 单会话惯例下 id 直接等于 targetId，
 *  先按此直查；多会话场景再退化扫描 targetId/target_id 命中项。两条路都排掉星依浮坞内部会话（kind='xingyi'）。 */
function findExistingContactSessionId(targetId: string): string {
  const sessions = (chatStore.entities.chatSessions || {}) as Record<string, { id?: string; kind?: string; targetId?: string; target_id?: string }>
  const direct = sessions[targetId]
  if (direct && !isAgentSessionKind(direct.kind)) return String(direct.id || targetId)
  const fallback = Object.values(sessions).find((session) => {
    if (isAgentSessionKind(session?.kind)) return false
    const sessionTargetId = String(session?.targetId ?? session?.target_id ?? '').trim()
    return sessionTargetId === targetId
  })
  return fallback ? String(fallback.id || '') : ''
}

function listExistingSessionContexts(): Array<XingyiSessionContext & { targetId: string }> {
  const sessions = Object.values((chatStore.entities.chatSessions || {}) as Record<string, Record<string, unknown>>)
  return sessions.flatMap((session) => {
    if (isAgentSessionKind(session?.kind)) return []
    const sessionId = String(session?.id || '').trim()
    if (!sessionId) return []
    const members = normalizeChatSessionCharacterParticipants(session as never)
    return [{
      sessionId,
      sessionTitle: String(session.title || session.name || '会话'),
      targetId: String(session.targetId ?? session.target_id ?? '').trim(),
      characterOptions: members.map((member) => ({
        id: member.characterId,
        participantId: member.participantId,
        name: String((charStore.getCharacter(member.characterId) as { name?: string } | null)?.name || member.characterId)
      }))
    }]
  })
}

// scope 卡的对话选项构造已随卡片抽进 StatusScopeConfirmCard（组件自取·与侧栏「最近对话」同口径）。

/** 编排模型配置（联动标注：与 useChatSendPipeline.readBrainAgentConfigFromList 同口径——找 brain_agent 项，没有=null）。 */
function loadDispatchAgentConfig(): Record<string, unknown> | null {
  const configs = settingStore.agentModelConfigs
  return Array.isArray(configs)
    ? ((configs.find((item) => String(item?.id || '').trim() === 'brain_agent') as unknown as Record<string, unknown> | undefined) || null)
    : null
}

/** dispatch 写回后同步打开中的会话视图：活动会话命中才补内存（防 UI 旧值反盖新版本），非活动会话刷新自然可见。 */
function applyDispatchEditToOpenSession(patch: { sessionId: string; messageId: number; payload: Record<string, unknown> }) {
  if (getChatStoreActiveSessionId(chatStore) !== patch.sessionId) return
  const msg = getChatStoreCurrentMessages(chatStore).find((item) => Number(item?.id || 0) === patch.messageId)
  if (!msg) return
  msg.content = patch.payload.content
  msg.time = patch.payload.time
  msg.versionList = patch.payload.versionList
  msg.activeVersionIndex = patch.payload.activeVersionIndex
}

// 单位增删改移动接缝（2026-07-07 单位工具计划批次1+2）：两领域适配器都走真值直写（不要求页面在场）。
// 文档库=仓库直写+保存后广播事件让打开中的文档库页面强刷三件套；角色大脑=store 直写（响应式自动刷新）。
const unitCrudAdapters = {
  docLibrary: createXingyiDocLibraryCrudAdapter({
    fetchState: (options) => fetchDocLibraryState(options),
    saveState: (payload) => saveDocLibraryState(payload),
    notifySaved: () => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DOC_LIBRARY_EXTERNAL_UPDATED_EVENT))
    }
  }),
  characterBrain: createXingyiCharacterBrainCrudAdapter({
    listCharacters: () => (charStore.characters || [])
      .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
      .filter((item) => item.id),
    readCharacter: (characterId) => (charStore.getCharacter(characterId) as never) || null,
    updateCharacter: async (characterId, changes) => {
      await charStore.updateCharacter(characterId, changes as never)
    }
  })
}

// 采风 deps 全量装配（地图严谨协作与运行卡计划批2·2026-07-11）：与提调侧 buildCaifengDispatchSeam
// （useChatSendPipeline.ts）同一份口径——retrievalContext（星依文档库全局语境，docLibraryOnly+allDocuments
// 与 runXingyiAgent 顶层同源）+ statusSystem（buildTidiaoStatusSystemSeam 自包含·只需 sessionId）+
// chatMessageReadContext/projectionContext（按楼层精读原文/投影·需现取目标会话消息与投影观察）。
// recallPoolAppend 本批不接（追加落池副作用绑的是聊天轮 anchorMessageId/会话资料池语义，星依跨会话派发
// 没有这个锚点，硬接=发明假锚污染真正的轮级资料池；readChatProjection/searchChatProjection 全貌+搜投影两件套
// 已在 buildCaifengToolset 内无条件装配，不受此处 deps 影响）——recallCharacterBrain 因此本批仍不装配，
// 是本批明确的取舍（回执说明）。取数失败不阻断派发，缺项对应工具静默不装配（与派发本身仍可成行同一容错口径）。
// 供 dispatchXingyiResearch 与绘舆自查 research 装配共用（消灭两套 research 并存·用户拍板旧内容处置项）。
async function buildXingyiCaifengDeps(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> }
): Promise<CaifengToolsetDeps> {
  const candidates = session.characterOptions.map((option) => ({ characterId: option.id, name: option.name }))
  let chatMessageReadContext: CaifengToolsetDeps['chatMessageReadContext']
  let projectionContext: CaifengToolsetDeps['projectionContext']
  try {
    const bundle = await fetchChatSessionBundleById(session.sessionId)
    const messages = Array.isArray(bundle?.messages) ? bundle.messages : []
    chatMessageReadContext = createTidiaoChatMessageReadContext(messages)
    try {
      const observations = await loadDirectorProjectionObservations(session.sessionId)
      projectionContext = createTidiaoMessageProjectionContext(messages, observations.projectionMap)
    } catch (error) {
      logger.warn('星依采风 deps 取投影观察失败（不阻断·本次无楼层投影精读）:', error)
    }
  } catch (error) {
    logger.warn('星依采风 deps 取会话消息失败（不阻断·本次无楼层原文/投影精读）:', error)
  }
  return {
    sessionId: session.sessionId,
    sessionTitle: session.sessionTitle,
    candidates,
    ...(chatMessageReadContext ? { chatMessageReadContext } : {}),
    ...(projectionContext ? { projectionContext } : {}),
    retrievalContext: ai.buildTidiaoRetrievalContext('', { docLibraryOnly: true, allDocuments: true }),
    statusSystem: buildTidiaoStatusSystemSeam(session.sessionId, session.characterOptions)
  }
}

// 星依 → 造册的既有状态栏总览重构桥：只给造册正式状态读口与原子 batch 写口，
// 不附带聊天、文档库或角色大脑取料，避免“只改展示”任务越界吸收新事实。
let xingyiZaoceStatusDesignCounter = 0

function buildZaoceStatusDesignSkillActivations(focus: XingyiZaoceStatusDesignFocus[]) {
  const selectors = new Set<string>(['visual_carrier_selection'])
  if (focus.includes('composition')) selectors.add('categorical_chart')
  if (focus.includes('resources')) selectors.add('resource_dashboard')
  if (focus.includes('media')) selectors.add('rich_media_scaffold')
  return [...selectors].map((selector) => ({
    skillId: 'zaoce.advanced-authoring' as const,
    activation: 'explicit_route' as const,
    selector,
    reason: `星依派遣造册重构状态总览：${selector}`
  }))
}

async function dispatchXingyiZaoceStatusDesign(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string; participantId?: string }> },
  input: XingyiZaoceStatusDesignInput,
  agentConfig: unknown
) {
  xingyiZaoceStatusDesignCounter += 1
  const taskKey = `xingyi:${xingyiZaoceStatusDesignCounter}`
  const sourceAgentRunId = `zaoce_status_design_${Date.now().toString(36)}_${xingyiZaoceStatusDesignCounter}`
  const focusText = input.focus.length ? input.focus.join('、') : '由字段语义判断'
  const brief = [
    '【任务类型】既有状态栏受控总览重构',
    `【目标状态栏】${input.panel}`,
    `【关注类型】${focusText}`,
    `【用户要求】${input.directive}`,
    '【范围硬边界】只读取并复用这张状态栏及其模板的现役字段、值、单位、引用和正式资产；不要查询聊天、文档库或角色大脑，不要新增故事事实。',
    '【写入要求】先用 readStatusPanels 回读准确实例，再用 applyStatusPanelBatch 只更新该实例的 presentation；字段和值除非修复服务端明确诊断所必需，否则保持原样。提交后回读并调用 submitPanels 交稿。'
  ].join('\n')

  registerXingyiDispatch(session.sessionId, ZAOCE_SUBAGENT_ID_PREFIX)
  const [contextBlock, orchestration] = await Promise.all([
    loadRenderedAgentContext({
      agentKind: 'zaoce',
      sessionId: session.sessionId,
      userText: brief
    }).then((result) => result.text),
    fetchOrchestrationWorkspaceProjection(session.sessionId)
  ])
  const statusSystem = buildTidiaoStatusSystemSeam(session.sessionId, session.characterOptions)
  const candidates = session.characterOptions.map((option) => ({ characterId: option.id, name: option.name }))
  const tools = buildZaoceToolset({
    sessionId: session.sessionId,
    sessionTitle: session.sessionTitle,
    candidates,
    batchContext: {
      ...statusSystem,
      worldId: String(orchestration.workspace.scope.worldId || ''),
      sourceAgentRunId,
      execute: executeOrchestrationCommands
    }
  })
  const signal = xingyiAbortController.value?.signal
  const result = await runZaoceBuild(brief, {
    sessionId: session.sessionId,
    contextBlock,
    taskKey,
    tools,
    skillActivations: buildZaoceStatusDesignSkillActivations(input.focus),
    signal,
    callModel: async ({ messages, toolBriefs, toolCatalog }) => {
      const toolsearchProtocol = buildToolsearchOverrideProtocol(toolCatalog)
      const sentMessages = toolsearchProtocol
        ? messages.map((message, index) => (
            index === messages.findIndex((item) => item.role === 'system')
              ? { ...message, content: `${message.content}\n\n${toolsearchProtocol}` }
              : message
          ))
        : messages
      const response = await ai.callAIWithTools(sentMessages as never, {
        ...buildTaskModelAiOptions(agentConfig as never, 'zaoceBuild', { maxTokens: 2048, temperature: 0.3, thinking: 'disabled' }),
        tools: toOpenAiTools(toolBriefs),
        feature: 'agent',
        logLabel: 'zaoce-status-design-xingyi',
        usageLabel: '造册·总览设计(星依派发)',
        placeLabel: session.sessionTitle,
        sessionId: session.sessionId,
        sessionLabel: session.sessionTitle,
        signal
      })
      return {
        content: response?.content ?? '',
        toolCalls: response?.toolCalls ?? [],
        ...(response?.usage ? {
          usage: {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            cacheReadTokens: response.usage.cacheReadTokens,
            cacheCreationTokens: response.usage.cacheCreationTokens
          }
        } : {})
      }
    }
  })
  if (result.ok && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT))
  }
  return result
}

// 派绘舆作图（地图系统批6·2026-07-11；地图严谨协作批3 两段式派发；笔刷约束系统批D 起编排逻辑
// 全部收进 src/app/huiyuOrchestration.ts 共享引擎——这里只做 UI 依赖注入：worldId/research 装配、
// callModel（消耗溯源两档标签）、浮坞确认卡通道（buildBlockingConfirmChannel(requestAskUser)，真阻塞）。
// mode:'draw' 仍走本地 runXingyiHuiyuDrawPhase（批6 原逻辑不动，零回归）；mode:'draft' 走引擎
// runHuiyuDraftThenDraw；mode:'staged'/override:'terraform' 走引擎 runHuiyuStage（阶段管线）。
let xingyiHuiyuTaskCounter = 0

/** 星依侧绘舆 callModel 工厂：草案/落笔/阶段管线共用一个形态，只差消耗溯源标签（拟稿 vs 落笔两档）。 */
function buildXingyiHuiyuCallModel(
  session: { sessionId: string; sessionTitle: string },
  agentConfig: unknown,
  labels: { logLabel: string; usageLabel: string }
) {
  return async ({ messages, toolBriefs }: {
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  }) => {
    const response = await ai.callAIWithTools(messages as never, {
      ...buildTaskModelAiOptions(agentConfig as never, 'mapDraw', { maxTokens: 2048, temperature: 0.3, thinking: 'disabled' }),
      tools: toOpenAiTools(toolBriefs),
      feature: 'agent',
      logLabel: labels.logLabel,
      usageLabel: labels.usageLabel,
      placeLabel: session.sessionTitle,
      sessionId: session.sessionId,
      sessionLabel: session.sessionTitle,
      // 停止按钮（2026-07-13）：星依 turn 级 signal 穿透——中断时掐断在途 HTTP 请求（不止步骤边界收束）。
      signal: xingyiAbortController.value?.signal
    })
    return {
      content: response?.content ?? '',
      toolCalls: response?.toolCalls ?? [],
      ...(response?.usage ? {
        usage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          cacheReadTokens: response.usage.cacheReadTokens,
          cacheCreationTokens: response.usage.cacheCreationTokens
        }
      } : {})
    }
  }
}

async function loadXingyiHuiyuContextBlock(
  session: { sessionId: string },
  input: HuiyuMapWorkInput
): Promise<string> {
  const sessionId = String(session.sessionId || '').trim()
  if (!sessionId) throw new Error('绘舆缺少正式会话作用域，无法加载统一原始可见上下文')
  try {
    return (await loadRenderedAgentContext({
      agentKind: 'huiyu_dispatch',
      sessionId,
      userText: input.instructions
    })).text
  } catch (error) {
    throw new Error(`绘舆统一原始可见上下文加载失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 落笔轮执行体（mode:'draw'）：批6 原逻辑——小笔直画不经引擎，行为与批A~W 完全一致（零回归）。 */
async function runXingyiHuiyuDrawPhase(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: HuiyuMapWorkInput,
  agentConfig: unknown,
  worldId: string
) {
  const contextBlock = await loadXingyiHuiyuContextBlock(session, input)
  xingyiHuiyuTaskCounter += 1
  // 运行卡登记（批1）：真值仍是 runHuiyuMapWork 内部的 beginSubagentRun/endSubagentRun（huiyuSubagent.ts
  // 早已埋点），这里只登记「去哪查」，让浮坞知道要跨会话汇总这个 sessionId 下的 huiyu 前缀。
  registerXingyiDispatch(session.sessionId, HUIYU_SUBAGENT_ID_PREFIX)
  // research 装配（批2）：换成与派采风同一份全量 deps（此前只传 sessionId/title/candidates 的残缺版已消灭）。
  const tools = buildHuiyuToolset({
    map: { worldId },
    research: await buildXingyiCaifengDeps(session)
  })
  const result = await runHuiyuMapWork(input, {
    sessionId: session.sessionId,
    contextBlock,
    taskKey: `xingyi:${xingyiHuiyuTaskCounter}`,
    tools,
    audit: createHuiyuAuditRunner({ worldId }),
    callModel: buildXingyiHuiyuCallModel(session, agentConfig, { logLabel: 'huiyu-mapwork-xingyi', usageLabel: '绘舆(星依派发)' }),
    // 停止按钮（2026-07-13）：穿透给绘舆小 loop（runSubagentLoop spec.signal）——中断时子代理运行卡落「被停止」。
    signal: xingyiAbortController.value?.signal
  })
  return {
    content: renderHuiyuDispatchOutcome(input, result),
    ok: result.ok,
    details: {
      changes: result.changes,
      mapDigest: result.mapDigest,
      ...(result.missingInfo?.length ? { missingInfo: result.missingInfo } : {}),
      ...(result.error ? { error: result.error } : {})
    }
  }
}

/** 引擎公共 deps 装配（draft/staged 共用）：注册两个运行卡前缀（引擎内一次 run 可能先后跑草案/落笔两条
 *  loop，各有独立运行卡），research/审计/双档 callModel/浮坞阻塞确认通道一次配齐。 */
async function buildXingyiHuiyuEngineDeps(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  agentConfig: unknown,
  worldId: string,
  input: HuiyuMapWorkInput
) {
  const contextBlock = await loadXingyiHuiyuContextBlock(session, input)
  registerXingyiDispatch(session.sessionId, HUIYU_DRAFT_SUBAGENT_ID_PREFIX)
  registerXingyiDispatch(session.sessionId, HUIYU_SUBAGENT_ID_PREFIX)
  xingyiHuiyuTaskCounter += 1
  return {
    sessionId: session.sessionId,
    contextBlock,
    taskKey: `xingyi:${xingyiHuiyuTaskCounter}`,
    worldId,
    research: await buildXingyiCaifengDeps(session),
    callModel: buildXingyiHuiyuCallModel(session, agentConfig, { logLabel: 'huiyu-mapwork-xingyi', usageLabel: '绘舆(星依派发)' }),
    draftCallModel: buildXingyiHuiyuCallModel(session, agentConfig, { logLabel: 'huiyu-layoutdraft-xingyi', usageLabel: '绘舆·拟稿(星依派发)' }),
    // 类型适配：浮坞 XingyiAskUserRequest.allowOtherInput 必填，引擎侧可选（缺省视为允许自由输入）。
    // sketches/worldId 透传（地图草案剪影可视化计划批3）：worldSessionId 用本函数闭包捕获的 session.sessionId——
    // 经会话派发时与上面解析 worldId 用的是同一个会话 id，地图弹窗按它拉世界必然对上，不需要弹窗支持"直传 worldId"。
    // ⚠️ world 直达派发（星依世界寻址批·2026-07-13）例外：此时 session 是 dispatchXingyiMapWorkToWorld
    // 合成的星依浮坞自身会话，worldSessionId 传的是星依自身会话 id——弹窗按它查不到目标世界，正是靠
    // MapViewerDialog 新加的 worldId prop（草案确认卡模板已补传 pendingAsk.worldId）兜底才显示正确世界。
    confirmChannel: buildBlockingConfirmChannel((request) => requestAskUser({
      question: request.question,
      options: request.options,
      allowOtherInput: request.allowOtherInput ?? true,
      ...(request.sketches?.length ? { sketches: request.sketches, worldId: request.worldId, worldSessionId: session.sessionId } : {})
    })),
    audit: createHuiyuAuditRunner({ worldId }),
    // terraform 系列级授权（提速批B）：键=聊天会话+世界（会话切换/换世界自然不命中回到逐次弹卡）。
    // 内存态不持久化（刷新即失效）；「批准」记录、「不批准」不记录、沿用滑动续期都在 grantState 模块。
    terraformGrant: {
      use: () => reuseHuiyuTerraformGrant(session.sessionId, worldId),
      record: () => recordHuiyuTerraformGrant(session.sessionId, worldId)
    },
    // 停止按钮（2026-07-13）：穿透给引擎（RunHuiyuStageDeps/RunHuiyuDraftThenDrawDeps 均已声明 signal?
    // 字段并透传到各小 loop deps，见 huiyuOrchestration.ts）——草案/落笔两条 loop 都能被中断。
    signal: xingyiAbortController.value?.signal
  }
}

/** 阶段管线派发（mode:'staged'·笔刷约束系统批D）：星依确认通道真阻塞（浮坞卡片），从当前阶段
 *  （meta.confirmedAtStage 现查推导）起内联推进「草案→确认→落笔→收尾确认→盖戳锁定→下一阶段」，
 *  直至人文阶段收尾、用户驳回或失败。override:'terraform' 时引擎只做一次高门槛改造（不推进阶段）。 */
async function dispatchXingyiHuiyuStaged(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: HuiyuMapWorkInput & { override?: 'terraform' },
  agentConfig: unknown,
  worldId: string
) {
  const stageLabel: Record<string, string> = { terrain: '地形', water: '水系', civic: '人文' }
  const reports: string[] = []
  let stage = await resolveCurrentMapStage(worldId)
  // 防御上限=3（terrain/water/civic 各至多一轮）；terraform/civic 收尾无 nextStage 自然退出。
  for (let round = 0; round < 3; round += 1) {
    const deps = await buildXingyiHuiyuEngineDeps(session, agentConfig, worldId, input)
    const result = await runHuiyuStage(stage, input, deps)
    if (result.status === 'completed') {
      const stamped = result.stampedFeatureIds?.length ? `（本阶段 ${result.stampedFeatureIds.length} 个要素已确认锁定）` : ''
      reports.push(`【${stageLabel[result.stage] || result.stage}阶段完成】${result.summary}${stamped}`)
      if (result.mapDigest) reports.push(`当前格局：${result.mapDigest}`)
      if (!result.nextStage) break
      stage = result.nextStage
      continue
    }
    // rejected/failed：如实收束（阶段状态靠 meta 戳自持，之后可再派发续推）
    const tail = result.status === 'rejected'
      ? `【${stageLabel[result.stage] || result.stage}阶段止步】${result.error || '未获确认'}${result.summary ? `\n${result.summary}` : ''}`
      : `【${stageLabel[result.stage] || result.stage}阶段失败】${result.error || '未知原因'}${result.missingInfo?.length ? `\n缺料清单：${result.missingInfo.map((item) => `· ${item}`).join(' ')}` : ''}`
    reports.push(tail)
    return {
      content: `绘舆阶段制任务「${input.task}」：\n${reports.join('\n')}`,
      ok: false,
      details: { reason: result.status, stage: result.stage, ...(result.error ? { error: result.error } : {}) }
    }
  }
  return {
    content: `绘舆阶段制任务「${input.task}」已推进完成：\n${reports.join('\n')}`,
    ok: true,
    details: { mode: 'staged' }
  }
}

/** 两段式派发（mode:'draft'）：编排真值已抽到 huiyuOrchestration.runHuiyuDraftThenDraw（批D），
 *  行为与批3 完全一致（拟草案→浮坞确认卡→确认/驳回/修改→落笔），这里只注入 UI 依赖。 */
async function dispatchXingyiHuiyuDraftThenDraw(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: HuiyuMapWorkInput,
  agentConfig: unknown,
  worldId: string
) {
  const deps = await buildXingyiHuiyuEngineDeps(session, agentConfig, worldId, input)
  const outcome = await runHuiyuDraftThenDraw(input, deps)
  return { content: outcome.content, ok: outcome.ok, details: outcome.details }
}

/** 装甲快画执行体（mode:'armor'·批A2）：runMountainArmorWork 不是 runSubagentLoop 骨架的
 *  agentic loop（没有工具调用，只是一次/最多两次直接模型调用），运行卡 begin/end 因此手动埋点——
 *  与 runHuiyuMapWork 靠 runSubagentLoop 自动埋点不同，这里显式镜像同一套语义（成功/失败都要 end，
 *  否则浮坞秒表停不下来）。callModel 仿 buildXingyiHuiyuCallModel 组，复用绘舆 mapDraw 模型档
 *  （装甲画师是"更快的绘舆"，没必要单独开一档）；usageLabel 独立标注消耗溯源。 */
let xingyiArmorTaskCounter = 0

async function runXingyiArmorPhase(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: XingyiMapWorkTaskInput,
  agentConfig: unknown,
  worldId: string
) {
  xingyiArmorTaskCounter += 1
  const subagentId = `${ARMOR_SUBAGENT_ID_PREFIX}:xingyi:${xingyiArmorTaskCounter}`
  registerXingyiDispatch(session.sessionId, ARMOR_SUBAGENT_ID_PREFIX)
  const brief = renderArmorBrief(input)
  beginSubagentRun(session.sessionId, subagentId, { input: brief })
  const subagentController = new AbortController()
  const unregisterSubagentControl = registerActiveSubagentControl({
    sessionId: session.sessionId,
    subagentId,
    controller: subagentController
  })
  const callModel: ArmorPainterCallModel = async ({ system, user }) => {
    const response = await ai.callAIWithTools([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ] as never, {
      ...buildTaskModelAiOptions(agentConfig as never, 'mapDraw', { maxTokens: 2048, temperature: 0.3, thinking: 'disabled' }),
      feature: 'agent',
      logLabel: `armor-${input.terrain || 'terrain'}-xingyi`,
      usageLabel: '地貌师(星依派发)',
      placeLabel: session.sessionTitle,
      sessionId: session.sessionId,
      sessionLabel: session.sessionTitle,
      // 停止按钮（2026-07-13）：与绘舆/采风同一套 signal 穿透——中断时掐断在途 HTTP 请求。
      signal: subagentController.signal
    })
    return response?.content ?? ''
  }
  try {
    const requestedWidthM = Number(input.widthKm) > 0 ? Number(input.widthKm) * 1000 : undefined
    const requestedHeightM = Number(input.heightKm) > 0 ? Number(input.heightKm) * 1000 : undefined
    // 山脉/河流的 width/height 是任务域尺寸；草原的 width/height 是成图尺寸，inside 时仍由锚点范围约束，
    // expand 时才为 organic 轮廓额外留 15% 任务域余量，不能把“成图大小”和“可画边界”重新绑成一件事。
    const placement = buildMapTaskPlacementRequest(input, input.terrain === 'grass'
      ? (input.placementMode === 'expand'
          ? { widthM: requestedWidthM ? requestedWidthM * 1.15 : undefined, heightM: requestedHeightM ? requestedHeightM * 1.15 : undefined }
          : undefined)
      : { widthM: requestedWidthM, heightM: requestedHeightM })
    const result = input.terrain === 'grass'
      ? await runGrassArmorWork({
        worldId,
        name: input.name || input.task,
        ...(requestedWidthM ? { widthM: requestedWidthM } : {}),
        ...(requestedHeightM ? { heightM: requestedHeightM } : {}),
        shape: input.shape === 'circle' || input.shape === 'ellipse' ? 'exact' : 'organic',
        ...(Number.isFinite(Number(input.ruggedness)) ? { ruggedness: Number(input.ruggedness) } : {}),
        ...(Number.isFinite(Number(input.seed)) ? { seed: Number(input.seed) } : {}),
        placement,
        deps: { reviewDraft: (request) => requestMapDraftReview(session.sessionId, request) }
      })
      : input.terrain === 'river'
        ? await runRiverArmorWork({
          worldId,
          task: brief,
          name: input.name || input.task,
          sourceFeature: input.sourceFeature,
          mouthFeature: input.mouthFeature,
          params: {
            sourceWidthM: input.sourceWidthM,
            mouthWidthM: input.mouthWidthM,
            growthExponent: input.growthExponent,
            bankRoughness: input.bankRoughness,
            mouthCap: input.mouthCap,
            mouthFlareRatio: input.mouthFlareRatio
          },
          ...(Number.isFinite(Number(input.seed)) ? { seed: Number(input.seed) } : {}),
          callModel,
          placement,
            deps: { reviewDraft: (request) => requestMapDraftReview(session.sessionId, request) }
          })
        : input.terrain === 'water'
          ? await runWaterArmorWork({
            worldId,
            task: brief,
            name: input.name || input.task,
            waterKind: input.waterKind,
            params: {
              waterKind: input.waterKind,
              maxDepthM: input.maxDepthM,
              shoreShelfRatio: input.shoreShelfRatio,
              depthCurve: input.depthCurve,
              ruggedness: input.ruggedness,
              layers: input.waterLayers,
              connectionGapM: input.connectionGapM
            },
            ...(Number.isFinite(Number(input.seed)) ? { seed: Number(input.seed) } : {}),
            callModel,
            placement,
            deps: { reviewDraft: (request) => requestMapDraftReview(session.sessionId, request) }
          })
        : await runMountainArmorWork({
        worldId,
        task: brief,
        callModel,
        placement,
        deps: { reviewDraft: (request) => requestMapDraftReview(session.sessionId, request) }
        })
    for (const step of result.trace?.steps || []) {
      appendSubagentRunTimeline(session.sessionId, subagentId, { kind: 'tool', label: step.label, status: step.status })
    }
    const reviewHandled = ['modify', 'deleted', 'cancelled'].includes(String(result.reviewStatus || ''))
    endSubagentRun(session.sessionId, subagentId, {
      ok: result.ok || reviewHandled,
      ...(result.ok || reviewHandled ? {} : { error: result.error || '地貌绘制失败' }),
      ...(result.trace ? { output: renderMapDrawTrace(result.trace) } : result.summary ? { output: result.summary } : {})
    })
    const content = result.ok
      ? `地貌绘制任务「${input.task}」已确认并写入地图：${result.summary}`
      : result.reviewStatus === 'modify'
        ? `${result.summary}\n请严格按这条修改意见重新调用 dispatchMapWork 生成一份新草稿，再交给用户确认。`
        : result.reviewStatus === 'deleted' || result.reviewStatus === 'cancelled'
          ? result.summary
          : `地貌绘制任务「${input.task}」未完成：${result.error || '未知原因'}。可把任务描述写得更具体（大致方位/走向/规模）重派一次。`
    return {
      content,
      ok: result.ok,
      details: {
        mode: 'armor',
        ...(result.groupId ? { groupId: result.groupId } : {}),
        ...(result.reviewStatus ? { reviewStatus: result.reviewStatus } : {}),
        ...(result.reviewFeedback ? { reviewFeedback: result.reviewFeedback } : {}),
        ...(result.error ? { error: result.error } : {})
      }
    }
  } catch (error) {
    const message = (error as Error)?.message || String(error)
    endSubagentRun(session.sessionId, subagentId, {
      ok: false,
      ...(subagentController.signal.aborted ? { cancelled: true } : {}),
      error: message
    })
    return {
      content: `地貌绘制任务「${input.task}」执行异常：${message}`,
      ok: false,
      details: { mode: 'armor', error: message }
    }
  } finally {
    unregisterSubagentControl()
  }
}

async function runXingyiVectorPhase(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: XingyiMapWorkTaskInput,
  worldId: string
) {
  xingyiArmorTaskCounter += 1
  const subagentId = `${VECTOR_SUBAGENT_ID_PREFIX}:xingyi:${xingyiArmorTaskCounter}`
  registerXingyiDispatch(session.sessionId, VECTOR_SUBAGENT_ID_PREFIX)
  const brief = renderVectorBrief(input)
  beginSubagentRun(session.sessionId, subagentId, { input: brief })
  try {
    const layer = ['road', 'street', 'building', 'organization', 'landmark', 'urban', 'character'].includes(String(input.category || '')) ? 'civic' : 'terrain'
    const pointsRelativeM = input.pointsKm?.map(([x, y]) => [x * 1000, y * 1000] as [number, number])
    const radiusM = Number(input.radiusKm) > 0 ? Number(input.radiusKm) * 1000 : undefined
    const widthM = Number(input.widthKm) > 0 ? Number(input.widthKm) * 1000 : undefined
    const heightM = Number(input.heightKm) > 0 ? Number(input.heightKm) * 1000 : undefined
    const placement = buildMapTaskPlacementRequest(input, {
      widthM: input.shape === 'circle' && radiusM ? radiusM * 2 : widthM,
      heightM: input.shape === 'circle' && radiusM ? radiusM * 2 : heightM
    })
    const result = await runVectorPrimitiveWork({
      worldId,
      shape: input.shape as 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path',
      category: String(input.category || ''),
      name: input.name || input.task,
      layer,
      ...(radiusM ? { radiusM } : {}),
      ...(widthM ? { widthM } : {}),
      ...(heightM ? { heightM } : {}),
      ...(pointsRelativeM?.length ? { pointsRelativeM } : {}),
      placement,
      deps: { reviewDraft: (request) => requestMapDraftReview(session.sessionId, request) }
    })
    for (const step of result.trace?.steps || []) {
      appendSubagentRunTimeline(session.sessionId, subagentId, { kind: 'tool', label: step.label, status: step.status })
    }
    const reviewHandled = ['modify', 'deleted', 'cancelled'].includes(String(result.reviewStatus || ''))
    endSubagentRun(session.sessionId, subagentId, {
      ok: result.ok || reviewHandled,
      ...(result.trace ? { output: renderMapDrawTrace(result.trace) } : result.summary ? { output: result.summary } : {}),
      ...(!result.ok && !reviewHandled && result.error ? { error: result.error } : {})
    })
    const content = result.ok
      ? `矢量直画任务「${input.task}」已确认并写入地图：${result.summary}`
      : result.reviewStatus === 'modify'
        ? `${result.summary}\n请严格按这条修改意见重新调用 dispatchMapWork 生成一份新草稿，再交给用户确认。`
        : result.reviewStatus === 'deleted' || result.reviewStatus === 'cancelled'
          ? result.summary
          : `矢量直画任务「${input.task}」未完成：${result.error || '未知原因'}`
    return {
      content,
      ok: result.ok,
      details: {
        mode: 'vector',
        ...(result.featureId ? { featureId: result.featureId } : {}),
        ...(result.reviewStatus ? { reviewStatus: result.reviewStatus } : {}),
        ...(result.reviewFeedback ? { reviewFeedback: result.reviewFeedback } : {}),
        ...(result.error ? { error: result.error } : {})
      }
    }
  } catch (error) {
    const message = (error as Error)?.message || String(error)
    endSubagentRun(session.sessionId, subagentId, { ok: false, error: message })
    return { content: `矢量直画任务「${input.task}」执行异常：${message}`, ok: false, details: { mode: 'vector', error: message } }
  }
}

async function dispatchXingyiMapWork(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: XingyiMapWorkTaskInput,
  agentConfig: unknown
) {
  let worldId = ''
  let sessionRow: Record<string, unknown> | null = null
  try {
    const bundle = await fetchChatSessionBundleById(session.sessionId, { limit: 1 })
    sessionRow = (bundle?.session || null) as unknown as Record<string, unknown> | null
    worldId = String(sessionRow?.worldId ?? sessionRow?.world_id ?? '').trim()
  } catch {
    worldId = ''
  }
  if (!worldId) {
    return {
      content: `${input.mode === 'armor' ? '地貌绘制' : '矢量直画'}任务「${input.task}」未执行：会话「${session.sessionTitle}」还没有加入世界，没有可作图的舆图（可在该会话的舆图弹窗一键创建/选择世界）。`,
      ok: false,
      details: { reason: 'no-world' }
    }
  }
  if (isCartographerBusyForWorld(worldId)) {
    const worldName = String(sessionRow?.worldName ?? sessionRow?.world_name ?? '').trim() || worldId
    return {
      content: `世界「${worldName}」当前有舆图师正在处理这张地图（可能在绘制或删除地形），为避免同时改地图冲突，请先告诉用户舆图师正在处理、建议稍后再操作，这一轮不要重复派发或重试。`,
      ok: false,
      details: { reason: 'cartographer-busy', worldId }
    }
  }
  if (input.mode === 'armor') return runXingyiArmorPhase(session, input, agentConfig, worldId)
  return runXingyiVectorPhase(session, input, worldId)
}

/** 世界直达派发（星依世界寻址批·2026-07-13）：dispatchMapWork 的 world 参数命中后走这里——跳过
 *  dispatchXingyiMapWork 的会话现查（不需要该世界挂任何会话），直接用已解析好的 worldId 复用四个既有
 *  执行体（与 dispatchXingyiMapWork 同一套 mode/override 分支，零重复实现）。宿主会话固定用星依浮坞
 *  自身会话（sessionId.value）——运行卡登记、消耗记账、terraform 授权键都挂它，不是目标世界曾经挂过的
 *  某个会话；理论上浮坞已初始化后 sessionId.value 恒非空，仍兜底一个可重试提示防御极端时序。 */
async function dispatchXingyiMapWorkToWorld(
  world: { worldId: string; worldName: string },
  input: XingyiMapWorkTaskInput,
  agentConfig: unknown
) {
  const hostSessionId = sessionId.value
  if (!hostSessionId) {
    return {
      content: '星依浮坞还没准备好自身会话，请稍后再试一次。',
      ok: false,
      details: { reason: 'xingyi-session-not-ready' }
    }
  }
  if (isCartographerBusyForWorld(world.worldId)) {
    return {
      content: `世界「${world.worldName}」当前有舆图师正在处理这张地图（可能在绘制或删除地形），为避免同时改地图冲突，请先告诉用户舆图师正在处理、建议稍后再操作，这一轮不要重复派发或重试。`,
      ok: false,
      details: { reason: 'cartographer-busy', worldId: world.worldId }
    }
  }
  const session = { sessionId: hostSessionId, sessionTitle: `世界·${world.worldName}`, characterOptions: [] }
  if (input.mode === 'armor') return runXingyiArmorPhase(session, input, agentConfig, world.worldId)
  return runXingyiVectorPhase(session, input, world.worldId)
}

// 派采风钻探（地图严谨协作与运行卡计划批2·2026-07-11）：与统筹侧 buildCaifengDispatchSeam
// （useChatSendPipeline.ts）同构装配（复用 caifengSubagent.ts 的 buildCaifengToolset/runCaifengResearch/
// renderCaifengDispatchOutcome 三件真值，模型档同用 'caifengResearch' 校书档）——差异只在会话来源：
// 这里的 session 已由 dispatchResearch 工具经 resolveXingyiSessionForCall 解析好。
let xingyiCaifengTaskCounter = 0
async function dispatchXingyiResearch(
  session: { sessionId: string; sessionTitle: string; characterOptions: Array<{ id: string; name: string }> },
  input: { task: string; instructions: string; focus?: string; timeoutMinutes?: number },
  agentConfig: unknown
) {
  xingyiCaifengTaskCounter += 1
  // 运行卡登记（批1）：真值仍是 runCaifengResearch 内部的 beginSubagentRun/endSubagentRun
  // （caifengSubagent.ts 早已埋点），这里只登记「去哪查」，让浮坞知道要跨会话汇总这个 sessionId 下的 caifeng 前缀。
  registerXingyiDispatch(session.sessionId, CAIFENG_SUBAGENT_ID_PREFIX)
  const deps = await buildXingyiCaifengDeps(session)
  const contextBlock = (await loadRenderedAgentContext({
    agentKind: 'caifeng',
    sessionId: session.sessionId,
    userText: input.instructions
  })).text
  const result = await runCaifengResearch(input, {
    sessionId: session.sessionId,
    taskKey: `xingyi:${xingyiCaifengTaskCounter}`,
    tools: buildCaifengToolset(deps),
    contextBlock,
    ...(input.timeoutMinutes !== undefined ? { timeoutMs: input.timeoutMinutes * 60_000 } : {}),
    // 停止按钮（2026-07-13）：穿透给采风小 loop（runSubagentLoop spec.signal）——中断时运行卡落「被停止」。
    signal: xingyiAbortController.value?.signal,
    callModel: async ({ messages, toolBriefs }) => {
      const response = await ai.callAIWithTools(messages as never, {
        ...buildTaskModelAiOptions(agentConfig as never, 'caifengResearch', { maxTokens: 2048, temperature: 0.3, thinking: 'disabled' }),
        tools: toOpenAiTools(toolBriefs),
        feature: 'agent',
        logLabel: 'caifeng-research-xingyi',
        usageLabel: '采风(星依派发)',
        placeLabel: session.sessionTitle,
        sessionId: session.sessionId,
        sessionLabel: session.sessionTitle,
        // 停止按钮（2026-07-13）：中断时掐断在途 HTTP 请求。
        signal: xingyiAbortController.value?.signal
      })
      return {
        content: response?.content ?? '',
        toolCalls: response?.toolCalls ?? [],
        ...(response?.usage ? {
          usage: {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            cacheReadTokens: response.usage.cacheReadTokens,
            cacheCreationTokens: response.usage.cacheCreationTokens
          }
        } : {})
      }
    }
  })
  return {
    content: renderCaifengDispatchOutcome(input, result),
    ok: result.ok,
    details: { coverage: result.coverage, ...(result.error ? { error: result.error } : {}), ...(result.failure ? { failure: result.failure } : {}) }
  }
}

// 星依派出的子agent运行卡（批1）：与提调带同源复用 SubagentDispatchCardList，本坞只负责按「在飞登记」的
// (sessionId, prefix) 组合拼 sources；includeSettled 恒 true——登记条目一旦出现就常驻显示（浮坞没有"轮"的
// 概念，不像提调带按 liveRound 门控历史轮），done/error 卡靠 subagentRunStatus 自身的 MAX_ENTRIES 淘汰自然消退。
// 绘舆沿用与提调带一致的中文措辞（不新增 i18n·联动能力：改文案两处同步）；纠偏轮是本批新引入的卡种，
// 星依浮坞自身已全量 i18n 化，故走 xingyi.dispatchTidiao* 三语键。
function xingyiDispatchCardMetas(): Record<string, SubagentDispatchCardSource['meta']> {
  return {
    // 采风卡（批2）：与提调带一致的中文措辞硬编码（联动能力：改文案两处同步，同批1 绘舆卡取舍口径）。
    [CAIFENG_SUBAGENT_ID_PREFIX]: { prefix: CAIFENG_SUBAGENT_ID_PREFIX, label: '采风', icon: 'compass', runningVerb: '钻取中', fallbackTitle: '钻取任务', extractTitle: extractCaifengTaskTitle },
    [HUIYU_SUBAGENT_ID_PREFIX]: { prefix: HUIYU_SUBAGENT_ID_PREFIX, label: '绘舆', icon: 'map', runningVerb: '绘图中', fallbackTitle: '更新舆图', extractTitle: extractHuiyuTaskTitle },
    // 草案轮卡（批3 两段式派发）：与落笔轮同 label/icon，仅 runningVerb 不同（拟稿中 vs 绘图中），
    // 前缀 huiyu-draft 与 huiyu 互不匹配（listSubagentRunStatuses 按 `${prefix}:` 前缀过滤），两卡各自独立。
    [HUIYU_DRAFT_SUBAGENT_ID_PREFIX]: { prefix: HUIYU_DRAFT_SUBAGENT_ID_PREFIX, label: '绘舆', icon: 'map', runningVerb: '拟稿中', fallbackTitle: '拟格局草案', extractTitle: extractHuiyuTaskTitle },
    // 装甲快画卡（批A2）：复用 map 图标（同属地图作图·与 huiyu/huiyu-draft 共用图标同一取舍），
    // 中文措辞同样硬编码不接 i18n（同批1 绘舆卡取舍口径）。
    [ARMOR_SUBAGENT_ID_PREFIX]: { prefix: ARMOR_SUBAGENT_ID_PREFIX, label: '地貌师', icon: 'map', runningVerb: '绘制地形中', fallbackTitle: '地貌绘制', extractTitle: extractArmorTaskTitle },
    [VECTOR_SUBAGENT_ID_PREFIX]: { prefix: VECTOR_SUBAGENT_ID_PREFIX, label: '矢量', icon: 'map', runningVerb: '矢量绘图中', fallbackTitle: '矢量直画', extractTitle: extractVectorTaskTitle },
    [NARRATIVE_SEED_WORKSPACE_SUBAGENT_ID]: {
      prefix: NARRATIVE_SEED_WORKSPACE_SUBAGENT_ID,
      label: '编剧',
      icon: 'scroll-text',
      runningVerb: '编剧中',
      fallbackTitle: '剧本精修',
      extractTitle: (input) => String(input || '').match(/【用户对剧本的修改指令（必须执行）】\n([^\n]+)/)?.[1]?.trim() || ''
    },
    [XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX]: {
      prefix: XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX,
      label: t('xingyi.dispatchTidiaoLabel'),
      icon: 'clapperboard',
      runningVerb: t('xingyi.dispatchTidiaoVerb'),
      fallbackTitle: t('xingyi.dispatchTidiaoFallbackTitle'),
      extractTitle: extractTidiaoCorrectionTaskTitle
    }
  }
}
const xingyiDispatchSources = computed<SubagentDispatchCardSource[]>(() => {
  const metaByPrefix = xingyiDispatchCardMetas()
  return listXingyiDispatchRegistry()
    .map((entry): SubagentDispatchCardSource | null => {
      const meta = metaByPrefix[entry.prefix]
      return meta ? { sessionId: entry.sessionId, meta } : null
    })
    .filter((source): source is SubagentDispatchCardSource => Boolean(source))
})

/** 返回值改为落库消息 id（带图乐观发送·2026-07-11）：0 表示未落库（无 sessionId/请求失败），
 *  调用方用它把 caption 后台补全的回填请求指到正确的一条消息。
 *  turnStream（过程流内联持久化计划·2026-07-13）：调用方传入 drainXingyiTurnStreamEntries() 收编到的
 *  片段，非空才带上 turn_stream_json（已序列化字符串，服务端原样存，不做二次处理），与 attachments 的
 *  「非空才传」写法保持一致；调用方自己决定何时 drain（本函数不动单例）。 */
async function persistMessage(
  role: 'user' | 'assistant',
  content: string,
  attachments?: ChatImageAttachment[],
  turnStream?: XingyiTurnStreamEntry[]
): Promise<number> {
  if (!sessionId.value) return 0
  try {
    const serializedTurnStream = serializeAgentTurnStream(turnStream)
    return await createChatMessageBySessionId(sessionId.value, {
      role,
      content,
      ...(attachments && attachments.length ? { attachments } : {}),
      ...(serializedTurnStream ? { turn_stream_json: serializedTurnStream } : {})
    })
  } catch (error) {
    // 持久失败不打断对话（消息仍在本地视图），下轮刷新会丢这条——记日志便于排查
    logger.warn('星依消息落库失败:', error)
    return 0
  }
}

/** caption 后台补全落库回填（带图乐观发送·2026-07-11）：整组附件覆盖写 attachments_json——
 *  调用方自己持有当前合并好的完整附件数组（不是增量 patch），服务端直接整体序列化落库。 */
async function persistAttachmentsUpdate(messageId: number, attachments: ChatImageAttachment[]): Promise<void> {
  if (!sessionId.value || !messageId) return
  try {
    await updateChatMessageBySessionId(sessionId.value, messageId, { attachments })
  } catch (error) {
    logger.warn('星依图片转述回填落库失败:', error)
  }
}

/**
 * 星依这一轮的「后台」部分（带图乐观发送·2026-07-11 拆分自 send()）：真正取走附件（等上传拿真 url，
 * 不等 caption）、落库、发 AI、收尾——全程不阻塞 UI，send() 早已同步把乐观消息塞进 messages 并返回。
 * liveMessage 是 messages.value 里那条乐观消息的响应式引用（push 后立即从数组按下标取回，参见 send()），
 * 全程通过它回填真实附件/失败态，读写都走同一个响应式代理，能正确触发气泡重渲染。
 */
async function runXingyiTurn(
  text: string,
  displayText: string,
  history: XingyiHistoryMessage[],
  sendingIds: string[],
  liveMessage: XingyiDisplayMessage
) {
  const playableWorldSlashRequest = parsePlayableWorldSlashCommand(text)
  const agentUserText = playableWorldSlashRequest === null
    ? text
    : playableWorldSlashRequest || '请创建一个完整、可以直接开始游玩的世界；请自行确定有辨识度的主题和开场。'
  const continuationSessionId = sessionId.value
  let capturedMessageId = 0
  let captionFlushNeeded = false
  let narrativeSeedsRefresh: NarrativeSeedsExternalUpdatedDetail | null = null
  const emittedInterimMessages = new Set<string>()
  // caption 后台补全通知（useImageAttachments.takeAttachments 的 onCaptionUpdate 回调）：不管此刻消息
  // 是否已经落库（messageId 还没拿到），先把合并结果写回本地乐观消息；messageId 还没就位就先记个待补标记，
  // 落库 promise resolve 时统一补一次（顺序不管谁先谁后，两边都兜到）。
  const onCaptionUpdate: CaptionUpdateListener = (attachmentId, patch) => {
    const current = Array.isArray(liveMessage.attachments) ? liveMessage.attachments : []
    liveMessage.attachments = current.map((att) => (att.id === attachmentId ? { ...att, ...patch } : att))
    if (capturedMessageId) {
      void persistAttachmentsUpdate(capturedMessageId, liveMessage.attachments)
    } else {
      captionFlushNeeded = true
    }
  }
  try {
    // 真正取走本轮附件：只等上传（拿真 url），caption 不再阻塞；停止信号可提前结束上传等待，
    // 避免用户在图片仍上传时点停止却还要卡满 30 秒。附件阶段也必须在本 try 内，保证任何退出都走 finally。
    const attachments = await chatImageAttachments.takeAttachments(onCaptionUpdate, xingyiAbortController.value?.signal)
    // 乐观气泡从本地 previewUrl 切回真实 url——发给 AI/落库都必须用真 url，blob 后端访问不到。
    liveMessage.attachments = attachments.length ? attachments : undefined
    if (xingyiAbortController.value?.signal.aborted) {
      const error = new Error('生成已停止')
      error.name = 'AbortError'
      throw error
    }
    const persistPromise = persistMessage('user', displayText, attachments)
    persistPromise.then((messageId) => {
      capturedMessageId = messageId
      if (messageId && captionFlushNeeded) {
        void persistAttachmentsUpdate(messageId, liveMessage.attachments || [])
      }
    })
    const agentConfig = settingStore.getBrainAgentConfig?.() || null
    const batchCharacterProvider = createXingyiBatchCharacterProvider({
      listGroups: () => (charStore.characterGroups || []).map((group) => ({
        id: String(group.id || ''),
        name: String(group.name || group.id || '')
      })),
      store: {
        addCharacter: (character) => charStore.addCharacter(character),
        updateCharacter: (characterId, changes) => charStore.updateCharacter(characterId, changes),
        getCharacter: (characterId) => charStore.getCharacter(characterId)
      },
      getAgentConfig: () => settingStore.getBrainAgentConfig(),
      callAI: ai.callAI as never
    })
    const activeContextSessionId = getChatStoreActiveSessionId(chatStore)
    const agentContextBlock = activeContextSessionId
      ? (await loadRenderedAgentContext({
          agentKind: 'xingyi',
          sessionId: activeContextSessionId,
          userText: agentUserText
        })).text
      : ''
    const result = await runXingyiAgent({
      userText: agentUserText,
      ...(playableWorldSlashRequest !== null ? { skillActivations: [{
        skillId: 'xingyi.playable-world-builder',
        activation: 'explicit_route' as const,
        reason: 'slash_command:/build-world'
      }] } : {}),
      history,
      ...(agentContextBlock ? { agentContextBlock } : {}),
      ...(attachments.length ? { attachments } : {}),
      retrievalContext: ai.buildTidiaoRetrievalContext('', { docLibraryOnly: true, allDocuments: true }) ?? undefined,
      // 停止按钮（2026-07-13）：turn 级 signal——runAgentRuntime 每轮起点/工具执行前查 abort，callModel 内
      // 转给 callOrchestrator（下方）掐断在途 HTTP 请求。
      signal: xingyiAbortController.value?.signal,
      subagentControl: createSubagentControlCapability(() => (
        listXingyiDispatchRegistry().map((entry) => entry.sessionId)
      )),
      initialTaskTodo: taskTodoSnapshot.value,
      initialDeferredActiveTools: deferredActiveTools.value,
      onDeferredActiveToolsChange: (toolNames) => {
        saveAgentConversationDeferredTools(continuationSessionId, toolNames)
        if (sessionId.value === continuationSessionId) deferredActiveTools.value = [...toolNames]
      },
      confirmWrite: requestWriteConfirm,
      // 询问用户接缝（内核统一批·批C）：askUser 工具弹选择卡片、等用户点选或输入「其他想法」。
      askUser: requestAskUser,
      // 原生生图：模型经 generateImage 业务工具显式发起，服务端只接受 Codex 订阅桥预设；返回的附件
      // 已通过 magic bytes 校验和 uploads 台账登记，本轮收尾时与 assistant 消息一起落 attachments_json。
      imageGeneration: {
        generate: async (prompt, signal) => {
          const generated = await ai.generateImage(prompt, {
            ...buildTaskModelAiOptions(agentConfig, 'xingyiAgent', { thinking: 'disabled' }),
            feature: 'xingyi',
            sessionId: sessionId.value,
            sessionLabel: '星依',
            signal
          })
          return generated.attachment
        }
      },
      webSearch: {
        search: async (query, signal) => {
          return await ai.searchWeb(query, {
            ...buildTaskModelAiOptions(agentConfig, 'xingyiAgent', { thinking: 'disabled' }),
            feature: 'xingyi',
            sessionId: sessionId.value,
            sessionLabel: '星依',
            signal
          })
        }
      },
      // 会话创建、图片设头像与头像识图：目标只从现役 store 解析；写头像仍走共享裁剪与正式保存链，
      // 读头像则把正式路径转成临时 data:image 交给下一轮模型，不把路径塞进工具结果。
      conversationAvatar: {
        listCharacters: () => (charStore.characters || [])
          .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
          .filter((item) => item.id),
        listAliases: () => (charStore.aliases || [])
          .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
          .filter((item) => item.id),
        listSessions: () => Object.values((chatStore.entities?.chatSessions || {}) as Record<string, any>)
          .filter((item: any) => !isAgentSessionKind(item?.kind))
          .map((item: any) => ({ id: String(item?.id || ''), name: String(item?.title || item?.targetName || item?.id || '') }))
          .filter((item) => item.id),
        getCurrentSession: () => {
          const session = getChatStoreCurrentSession(chatStore)
          const id = String(session?.id || '').trim()
          if (!id || isAgentSessionKind(session?.kind)) return null
          return { id, name: String(session?.title || session?.targetName || id) }
        },
        getUser: () => {
          const profile = (charStore.userProfile || {}) as Record<string, unknown>
          return {
            id: 'user_profile',
            name: String(profile.displayName || profile.display_name || profile.name || '用户')
          }
        },
        readAvatar: async (target) => {
          let record: Record<string, unknown> | null = null
          if (target.kind === 'character') {
            record = (charStore.getCharacter(target.id) as unknown as Record<string, unknown> | null) || null
          } else if (target.kind === 'alias') {
            record = ((charStore.aliases || []).find((item) => String(item?.id || '') === target.id) as unknown as Record<string, unknown> | undefined) || null
          } else if (target.kind === 'user') {
            record = (charStore.userProfile || {}) as Record<string, unknown>
          } else {
            record = (Object.values((chatStore.entities?.chatSessions || {}) as Record<string, any>)
              .find((item: any) => String(item?.id || '') === target.id) as Record<string, unknown> | undefined) || null
          }
          const avatarPath = String(
            target.kind === 'session'
              ? record?.conversationAvatarPath ?? record?.conversation_avatar_path ?? record?.avatarPath ?? record?.avatar_path ?? ''
              : record?.avatarPath ?? record?.avatar_path ?? record?.avatar ?? ''
          ).trim()
          if (!avatarPath) return null
          const sourceUrl = avatarPath.startsWith('data:') || /^https?:\/\//i.test(avatarPath) || avatarPath.startsWith('/')
            ? avatarPath
            : `/${avatarPath}`
          const dataUrl = await readImageUrlAsDataUrl(sourceUrl)
          if (!dataUrl) return null
          const targetLabel = target.kind === 'session' ? '会话' : target.kind === 'character' ? '角色' : target.kind === 'alias' ? '马甲' : '用户'
          return { dataUrl, label: `${targetLabel}「${target.name}」头像` }
        },
        createConversation: async ({ title, members }) => {
          const first = members[0]
          if (!first) throw new Error('至少需要一个角色')
          const bundle = await createChatSession({
            targetId: first.id,
            targetType: 'char',
            title,
            participants: members.map((member, index) => ({
              targetId: member.id,
              targetType: 'char',
              displayName: member.name,
              displayOrder: index,
              role: 'member',
              probability: member.probability
            }))
          })
          const createdSessionId = String(bundle?.session?.id || '').trim()
          if (!createdSessionId) throw new Error('创建会话后没有返回 sessionId')
          await chatStore.switchSession?.(createdSessionId)
          return { sessionId: createdSessionId, title: String(bundle?.session?.title || title) }
        },
        assignAvatar: async (target, image, crop) => {
          const source = await readImageUrlAsDataUrl(image.url)
          const targetLabel = target.kind === 'session' ? '会话' : target.kind === 'character' ? '角色' : '马甲'
          const avatarDataUrl = await requestAvatarCrop(source, `裁剪${targetLabel}头像`, crop)
          if (!avatarDataUrl) return false
          if (target.kind === 'character') {
            await charStore.updateCharacter(target.id, { avatarPath: avatarDataUrl } as never)
            return true
          }
          if (target.kind === 'alias') {
            await charStore.updateAlias(target.id, { avatarPath: avatarDataUrl } as never)
            return true
          }
          if (getChatStoreActiveSessionId(chatStore) === target.id) {
            await chatStore.updateSession(target.id, { conversationAvatarPath: avatarDataUrl })
            return true
          }
          await saveChatSessionPatchById(target.id, buildChatSessionPatch({ conversationAvatarPath: avatarDataUrl }))
          return true
        }
      },
      // 会话成员、发言概率与角色版本：读写 chat_session_participants 正式真值；版本清单复用角色快照正式 API。
      conversationMembers: {
        listCharacters: () => (charStore.characters || [])
          .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
          .filter((item) => item.id),
        readMembers: async (targetSessionId) => {
          const bundle = await fetchChatSessionBundleById(targetSessionId, { limit: 1 })
          const rows = Array.isArray(bundle?.participants)
            ? bundle.participants
            : Array.isArray(bundle?.session?.participants)
              ? bundle.session.participants
              : []
          return rows.flatMap((row: any, index): XingyiConversationMember[] => {
            const participantType = String(row?.participantType ?? row?.participant_type ?? 'char') || 'char'
            const characterId = String(
              row?.participantTargetId
              ?? row?.participant_target_id
              ?? row?.targetId
              ?? row?.target_id
              ?? ''
            ).trim()
            if (participantType !== 'char' || !characterId) return []
            const probabilityRaw = Number(row?.replyProbability ?? row?.reply_probability ?? row?.probability ?? 100)
            const replyProbability = Number.isFinite(probabilityRaw)
              ? Math.max(0, Math.min(100, Math.round(probabilityRaw)))
              : 100
            const character = charStore.getCharacter(characterId) as { name?: string } | null
            return [{
              participantId: String(row?.id || '').trim() || undefined,
              characterId,
              name: String(row?.resolvedCharacter?.name ?? row?.resolved_character?.name ?? character?.name ?? characterId),
              displayOrder: Number.isFinite(Number(row?.displayOrder ?? row?.display_order))
                ? Number(row?.displayOrder ?? row?.display_order)
                : index,
              replyProbability,
              role: String(row?.role || 'member'),
              characterStateMode: String(row?.characterStateMode ?? row?.character_state_mode) === 'independent_snapshot'
                ? 'independent_snapshot'
                : 'follow_main',
              characterBranchId: String(row?.characterBranchId ?? row?.character_branch_id ?? ''),
              createdAt: String(row?.createdAt ?? row?.created_at ?? ''),
              updatedAt: String(row?.updatedAt ?? row?.updated_at ?? '')
            }]
          })
        },
        replaceMembers: async (targetSessionId, members) => {
          await saveChatSessionPatchById(targetSessionId, {
            participants: members.map((member, index) => ({
              ...(member.participantId ? { id: member.participantId } : {}),
              targetId: member.characterId,
              targetType: 'char',
              displayName: member.name,
              displayOrder: index,
              role: member.role || 'member',
              replyProbability: member.replyProbability,
              characterStateMode: member.characterStateMode,
              characterBranchId: member.characterBranchId || '',
              sourceSnapshotId: member.sourceSnapshotId || '',
              createdAt: member.createdAt || undefined,
              updatedAt: member.updatedAt || undefined
            }))
          })
          // 当前或已加载会话都回读服务端结果，避免浮坞写完后角色头部仍显示旧成员/概率。
          await chatStore.refreshSessionMeta?.(targetSessionId)
        },
        listCharacterVersions: async (characterId) => await listCharacterSnapshotRecords(characterId),
        createCharacterVersion: async (characterId, label) => await createManualCharacterSnapshotRecord(characterId, label)
      },
      // 建状态栏前确认取料范围接缝（2026-07-09）：confirmStatusScope 工具弹 scope 卡（角色/对话/文档库范围），
      // 等用户确认后把范围回给模型（软锁）；结构性避免状态栏挂错会话、跨对话捞资料。
      confirmStatusScope: requestStatusScope,
      // 既有状态栏总览重构：星依只派发目标与人话设计要求，造册独占 advanced-authoring 与原子 presentation 写入口。
      zaoceStatusDesign: {
        dispatch: (session, input) => dispatchXingyiZaoceStatusDesign(session, input, agentConfig)
      },
      // 当前帷幕直改：复用提调同一份 patch/快照/撤销准备逻辑，只在星依侧补统一确认门与当前会话寻址。
      curtainScene: {
        resolveCurrentSession: () => {
          const session = getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
          const targetId = getChatStoreActiveTargetId(chatStore)
          const currentSessionId = String(session?.id || '').trim()
          if (!session || !currentSessionId || !targetId || isAgentSessionKind(session.kind)) return null
          return {
            sessionId: currentSessionId,
            targetId,
            label: String(session.title || session.targetName || session.target_name || targetId),
            session: { ...session }
          }
        },
        updateCurtainScene: async (target, toolCall) => {
          const result = prepareCurtainSceneUpdate({
            session: target.session,
            defaults: {
              currentTime: settingStore.currentTime,
              currentWeather: settingStore.currentWeather,
              currentLocation: settingStore.currentLocation
            },
            toolCall
          })
          if (!result.changed) return result
          const patch = result.patch || {}
          if (getChatStoreActiveSessionId(chatStore) === target.sessionId) {
            await chatStore.updateSession(target.targetId, patch)
          } else {
            await saveChatSessionPatchById(target.sessionId, buildChatSessionPatch(patch))
          }
          noteCurtainSceneUpdated()
          return result
        }
      },
      // 指挥提调接缝（批次3b）：runner deps 与聊天内纠偏同口径（orchestration 用途在 runner 内部拼）。
      tidiaoDispatch: {
        runnerDeps: {
          hasRunningChatRound: () => Boolean(runtimeStore.hasRunningChatTasks),
          // 停止统一（2026-07-06）：外部提调轮登记进 chatTaskRuns——输入框停止按钮点亮、abortChat「停止一切」可停。
          registerChatTaskRun: ({ label, targetId, sessionId: runSessionId, abortController }) => {
            const run = runtimeStore.startChatTaskRun({
              taskKind: 'tidiaoDispatch',
              label,
              targetId,
              sessionId: runSessionId,
              abortController,
              foreground: true
            })
            const id = String(run?.id || '')
            if (!id) return null
            return {
              complete: () => { if (runtimeStore.isChatTaskRunActive(id)) runtimeStore.completeChatTaskRun(id) },
              fail: (error: unknown) => { if (runtimeStore.isChatTaskRunActive(id)) runtimeStore.failChatTaskRun(id, error) },
              stop: () => { runtimeStore.stopChatTaskRun(id) }
            }
          },
          callAIWithTools: (messages, options) => ai.callAIWithTools(messages as never, options as never),
          loadAgentConfig: loadDispatchAgentConfig,
          loadAgentContextBlock: async ({ sessionId: runSessionId }) => (await loadRenderedAgentContext({
            sessionId: runSessionId,
            agentKind: 'tidiao'
          })).text,
          readUserAddressName: () => String(charStore.userProfile?.name || '').trim() || '用户',
          getTargetName: (targetId) => listChatContacts().find((contact) => contact.targetId === targetId)?.name || targetId,
          readCurtainDefaults: () => ({
            currentTime: settingStore.currentTime,
            currentWeather: settingStore.currentWeather,
            currentLocation: settingStore.currentLocation
          })
        },
        listChatContacts,
        onMessagePatched: applyDispatchEditToOpenSession,
        notifyActivity: (text) => { if (running.value) activity.value = text }
      },
      // 角色人格工具接缝（批次4）：自包含直挂——写路径是全局 store/服务端 HTTP 真值，不要求训练弹窗在场。
      personality: {
        callAI: (personalityMessages, options) => ai.callAI(personalityMessages as never, options as never),
        loadAgentConfig: () => (settingStore.getBrainAgentConfig?.() as never) || null,
        listCharacters: () => (charStore.characters || [])
          .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
          .filter((item) => item.id),
        readCharacter: (characterId) => (charStore.getCharacter(characterId) as Record<string, unknown> | null) || null,
        updateCharacterPersonality: async (characterId, personality) => {
          await charStore.updateCharacter(characterId, { personality } as never)
        },
        notifyActivity: (text) => { if (running.value) activity.value = text }
      },
      // 单位增删改移动接缝（2026-07-07）：批次1 只挂文档库领域，confirmWrite 统一取顶层同一道确认门。
      unitCrud: { adapters: unitCrudAdapters },
      // 马甲管理接缝（2026-07-12）：provider 包 charStore 马甲 CRUD（与帷幕「马甲设置」弹窗同一套 store 写入链路）
      // + 会话绑定切换——活动会话走 chatStore.updateSession（内存同步），非活动会话走 saveChatSessionPatchById 服务端直写。
      aliasManage: {
        provider: {
          getUserProfile: () => ({ ...(charStore.userProfile || {}) }) as Record<string, unknown>,
          listAliases: () => (charStore.aliases || []) as unknown as Array<Record<string, unknown>>,
          createAlias: async (alias) => { await charStore.addAlias(alias as never) },
          updateAlias: async (id, changes) => { await charStore.updateAlias(id, changes as never) },
          deleteAlias: async (id) => { await charStore.deleteAlias(id) },
          bindSessionAlias: async (sessionId, aliasId) => {
            if (getChatStoreActiveSessionId(chatStore) === sessionId) {
              await chatStore.updateSession(getChatStoreActiveTargetId(chatStore), { boundAlias: aliasId })
              return
            }
            await saveChatSessionPatchById(sessionId, buildChatSessionPatch({ boundAlias: aliasId }))
          },
          getActiveSessionBoundAliasId: () => {
            const session = getChatStoreCurrentSession(chatStore)
            return session ? getChatSessionBoundAlias(session) : null
          }
        }
      },
      // 读本地工作区日记接缝。
      diary: {},
      // 派绘舆作图接缝（地图系统批6+星依世界寻址批2026-07-13）：dispatch 执行体见上方 dispatchXingyiMapWork
      // （同构统筹/纠偏 buildHuiyuDispatchSeam）；session 定位复用下方同一个 resolveSessionContext。
      // dispatchToWorld/listWorlds/readWorldMapSummary 三项（2026-07-13 新增）：世界直达通道——
      // dispatchToWorld 见上方 dispatchXingyiMapWorkToWorld；listWorlds 直接复用世界选择器同一份 fetchWorlds；
      // readWorldMapSummary 现拉该世界 bundle 后走 renderMapSummary 纯函数渲染（与绘舆读图摘要同一份真值）。
      mapWork: {
        dispatch: (session, input) => dispatchXingyiMapWork(session, input, agentConfig),
        dispatchToWorld: (world, input) => dispatchXingyiMapWorkToWorld(world, input, agentConfig),
        listWorlds: () => fetchWorlds(),
        readWorldMapSummary: async (worldId) => renderMapSummary(await fetchWorldMapBundle(worldId))
      },
      scriptwriterDispatch: {
        getSessionContext: () => readActiveSessionContext({}),
        dispatch: async (session, directive, timeout) => {
          const bundle = await fetchChatSessionBundleById(session.sessionId, { limit: 30 })
          const sessionTruth = bundle.session as any
          // 服务端 bundle 才是当前会话成员真值。嵌入工作台时浮坞缓存可能尚未装入完整会话，
          // 不能让空的 characterOptions 覆盖 bundle 中真实的多人会话成员；采风与编剧共用这一份真值。
          const bundleParticipantRows = Array.isArray(bundle.participants)
            ? bundle.participants
            : (Array.isArray(sessionTruth?.participants) ? sessionTruth.participants : [])
          const participantRowsById = new Map(bundleParticipantRows.map((row: any) => [
            String(row?.participantTargetId ?? row?.participant_target_id ?? row?.targetId ?? row?.target_id ?? ''),
            row
          ]))
          const formalCharacterOptions = normalizeChatSessionCharacterParticipants({ participants: bundleParticipantRows })
            .map(({ characterId }) => {
              const row = participantRowsById.get(characterId) as any
              const resolvedName = String(row?.resolvedCharacter?.name ?? row?.resolved_character?.name ?? '').trim()
              return {
                id: characterId,
                name: resolvedName || String((charStore.getCharacter(characterId) as { name?: string } | null)?.name || characterId)
              }
            })
          const formalSession = {
            ...session,
            characterOptions: formalCharacterOptions.length ? formalCharacterOptions : session.characterOptions
          }
          const worldId = String(sessionTruth?.worldId ?? sessionTruth?.world_id ?? '')
          if (!worldId) return { ok: false, error: '目标会话尚未挂载世界，不能写世界剧本真值。' }
          const worldName = String(sessionTruth?.worldName ?? sessionTruth?.world_name ?? worldId)
          const summaries = await fetchNarrativeSeeds(worldId)
          const seeds = await Promise.all(summaries.slice(0, 120).map((seed) => fetchNarrativeSeedDetail(worldId, String(seed.id))))
          const contextBlock = (await loadRenderedAgentContext({
            agentKind: 'scriptwriter_workspace',
            sessionId: session.sessionId,
            userText: directive
          })).text
          registerXingyiDispatch(session.sessionId, NARRATIVE_SEED_WORKSPACE_SUBAGENT_ID)
          const workspaceResult = await runNarrativeSeedWorkspaceAgent({
            sessionId: session.sessionId,
            directive,
            contextBlock,
            seeds,
            timeoutMs: timeout.timeoutMs,
            research: {
              dispatch: (input) => dispatchXingyiResearch(formalSession, input, agentConfig)
            },
            callModel: async ({ messages, toolBriefs }) => {
              const response = await ai.callAIWithTools(messages as never, {
                ...buildTaskModelAiOptions(agentConfig as never, 'scriptwriterConsult', { maxTokens: 4096, temperature: 0.55, thinking: 'enabled' }),
                tools: toOpenAiTools(toolBriefs),
                feature: 'agent',
                logLabel: 'scriptwriter-xingyi',
                usageLabel: '编剧(星依派发)',
                placeLabel: session.sessionTitle,
                sessionId: session.sessionId,
                sessionLabel: session.sessionTitle,
                signal: xingyiAbortController.value?.signal
              })
              return {
                content: response?.content ?? '',
                toolCalls: response?.toolCalls ?? [],
                ...(response?.usage ? { usage: {
                  promptTokens: response.usage.promptTokens,
                  completionTokens: response.usage.completionTokens,
                  cacheReadTokens: response.usage.cacheReadTokens,
                  cacheCreationTokens: response.usage.cacheCreationTokens
                } } : {})
              }
            }
          })
          if (workspaceResult.error) return {
            ok: false,
            error: workspaceResult.error,
            retryable: ['timeout', 'runtime-error'].includes(String(workspaceResult.failure?.kind || ''))
          }
          const operations = workspaceResult.operations
          if (!operations.length) {
            return summaries.length
              ? { ok: true, guidance: '编剧判断本次不需要修改现有世界种子。', changedFields: [] }
              : { ok: false, error: '当前世界仍没有任何叙事种子，编剧也没有提交创建方案；本次不能标记为剧本已完成。', retryable: false }
          }
          const changedFields: string[] = []
          for (const operation of operations) {
            if (operation.action === 'create') {
              await createNarrativeSeed(worldId, { ...(operation.patch || {}), lastModifiedSource: 'xingyi_scriptwriter', sourceSessionId: session.sessionId })
            } else {
              const current = seeds.find((seed) => String(seed.id) === operation.seedId)
              if (!current) continue
              if (operation.action === 'delete') await deleteNarrativeSeed(worldId, String(current.id), Number(current.version))
              else await updateNarrativeSeed(worldId, String(current.id), { ...(operation.patch || {}), expectedVersion: Number(current.version), lastModifiedSource: 'xingyi_scriptwriter', sourceSessionId: session.sessionId })
            }
            changedFields.push(operation.summary)
          }
          if (changedFields.length) narrativeSeedsRefresh = { worldId, sessionId: session.sessionId }
          return {
            ok: true,
            guidance: `已按世界「${worldName}」的正式种子真值完成 ${changedFields.length} 项变更。`,
            changedFields
          }
        }
      },
      // 派采风钻探接缝（地图严谨协作与运行卡计划批2）：dispatch 执行体见上方 dispatchXingyiResearch
      // （同构统筹 buildCaifengDispatchSeam）；session 定位同复用下方同一个 resolveSessionContext。
      research: {
        dispatch: (session, input) => dispatchXingyiResearch(session, input, agentConfig)
      },
      // 读角色大脑接缝（取料闭环计划批次2·只读星依管理专用）：与 personality 同源 charStore 角色只读。
      characterBrain: {
        listCharacters: () => (charStore.characters || [])
          .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || item?.id || '') }))
          .filter((item) => item.id),
        readCharacter: (characterId) => (charStore.getCharacter(characterId) as Record<string, unknown> | null) || null
      },
      // 角色分组管理：分组和成员归属都直接消费 charStore 正式真值；写入复用侧栏同款 Store 动作。
      characterGroups: {
        listGroups: () => (charStore.characterGroups || []).map((group) => ({
          id: String(group.id || ''),
          name: String(group.name || group.id || ''),
          orderIndex: Number(group.orderIndex || 0)
        })),
        listCharacters: () => (charStore.characters || []).map((character) => ({
          id: String(character.id || ''),
          name: String(character.name || character.id || ''),
          groupId: String(character.groupId || character.group_id || 'default')
        })),
        createGroup: (group) => charStore.addCharGroup(group),
        updateGroup: (groupId, changes) => charStore.updateCharGroup(groupId, changes),
        deleteGroup: (groupId) => charStore.deleteCharGroup(groupId),
        assignCharacters: async (characterIds, groupId) => {
          for (const characterId of characterIds) {
            await charStore.updateCharacter(characterId, { groupId, group_id: groupId } as never)
          }
        },
        moveGroup: (groupId, direction) => charStore.moveCharGroup(groupId, direction)
      },
      batchCharacters: batchCharacterProvider,
      playableWorldBuilder: {
        createDocumentLibrary: (library) => createXingyiPlayableWorldDocumentLibrary({
          adapter: unitCrudAdapters.docLibrary,
          fetchState: (options) => fetchDocLibraryState(options)
        }, library),
        generateCharacter: async ({ requestedName, brief, signal }) => {
          const outcome = await batchCharacterProvider.generateCharacter({
            brief: `角色姓名必须固定为「${requestedName}」。\n${brief}`,
            groupId: 'default',
            signal
          })
          if (outcome.characterId && String(outcome.name || '').trim() !== requestedName) {
            await charStore.updateCharacter(outcome.characterId, { name: requestedName } as never)
            return { ...outcome, name: requestedName }
          }
          return outcome
        },
        findCharacterByName: async (name) => {
          const matches = (charStore.characters || []).filter((character) => String(character?.name || '').trim() === name.trim())
          if (matches.length > 1) throw new Error(`已有 ${matches.length} 个同名角色「${name}」，无法安全判断应复用哪一个`)
          const existing = matches[0]
          return existing ? { id: String(existing.id), name: String(existing.name || name), requestedName: name } : null
        },
        ensureCharacterGroups: async (requests) => {
          const receipts = []
          for (const request of requests) {
            const groupName = String(request.groupName || '').trim()
            const matches = (charStore.characterGroups || []).filter((group) => String(group?.name || '').trim() === groupName)
            if (matches.length > 1) throw new Error(`已有 ${matches.length} 个同名角色分组「${groupName}」，无法安全续建`)
            let group: { id: string; name: string; emoji?: string; orderIndex?: number } | null = matches[0] || null
            let created = false
            if (!group) {
              const groupId = `character_group_world_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
              await charStore.addCharGroup({ id: groupId, name: groupName, emoji: '组' })
              group = (charStore.characterGroups || []).find((item) => String(item.id) === groupId) || null
              created = true
            }
            if (!group || String(group.id) === 'default') throw new Error(`无法创建或解析正式角色分组「${groupName}」`)
            const groupId = String(group.id)
            for (const characterId of request.characterIds) {
              const character = charStore.getCharacter(characterId) as Record<string, unknown> | null
              const currentGroupId = String(character?.groupId ?? character?.group_id ?? 'default')
              if (currentGroupId !== groupId) {
                await charStore.updateCharacter(characterId, { groupId, group_id: groupId } as never)
              }
            }
            const assignedIds = request.characterIds.filter((characterId) => {
              const character = charStore.getCharacter(characterId) as Record<string, unknown> | null
              return String(character?.groupId ?? character?.group_id ?? '') === groupId
            })
            receipts.push({ id: groupId, name: groupName, created, characterIds: assignedIds })
          }
          return receipts
        },
        listWorlds: async () => (await fetchWorlds()).map((world) => ({
          id: String(world.id || ''),
          name: String(world.name || ''),
          description: String(world.description || '')
        })),
        createWorld: async (world) => {
          const created = await createWorld(world)
          return { id: created.id, name: created.name, description: created.description }
        },
        readWorldDocumentIds: async (worldId) => (await fetchWorldDetail(worldId)).docLinks,
        mountWorldDocuments: (worldId, documentIds) => saveWorldDocLinks(worldId, documentIds),
        createConversation: async ({ title, members }) => {
          const first = members[0]
          if (!first) throw new Error('创建可玩会话至少需要一个正式角色')
          const bundle = await createChatSession({
            targetId: first.id,
            targetType: 'char',
            title,
            participants: members.map((member, index) => ({
              targetId: member.id,
              targetType: 'char',
              displayName: member.name,
              displayOrder: index,
              role: 'member',
              probability: 100
            }))
          })
          const createdSessionId = String(bundle?.session?.id || '').trim()
          if (!createdSessionId) throw new Error('创建会话后没有返回 sessionId')
          await chatStore.switchSession?.(createdSessionId)
          return { sessionId: createdSessionId, title: String(bundle?.session?.title || title) }
        },
        findConversation: async ({ title, members, worldId }) => {
          const expectedMemberIds = [...new Set(members.map((member) => member.id))].sort()
          const candidates = Object.values((chatStore.entities?.chatSessions || {}) as Record<string, any>)
            .filter((candidate: any) => !isAgentSessionKind(candidate?.kind) && String(candidate?.title || candidate?.name || '').trim() === title.trim())
          const compatible: Array<{ sessionId: string; title: string }> = []
          for (const candidate of candidates) {
            const candidateSessionId = String(candidate?.id || '').trim()
            if (!candidateSessionId) continue
            const bundle = await fetchChatSessionBundleById(candidateSessionId, { limit: 1 })
            const candidateMemberIds = normalizeChatSessionCharacterParticipants({
              participants: Array.isArray(bundle?.participants) ? bundle.participants : bundle?.session?.participants || []
            }).map((participant) => participant.characterId).sort()
            if (JSON.stringify(candidateMemberIds) !== JSON.stringify(expectedMemberIds)) continue
            const boundWorldId = String(bundle?.session?.worldId ?? bundle?.session?.world_id ?? '').trim()
            if (boundWorldId && boundWorldId !== worldId) {
              throw new Error(`同名会话「${title}」已挂载另一个世界，不能把它改挂到当前世界`)
            }
            compatible.push({ sessionId: candidateSessionId, title: String(bundle?.session?.title || title) })
          }
          if (compatible.length > 1) throw new Error(`找到 ${compatible.length} 个同名同成员会话「${title}」，无法安全选择续建目标`)
          return compatible[0] || null
        },
        attachSessionToWorld: async (targetSessionId, worldId) => {
          const attached = await attachSessionWorld(targetSessionId, { worldId })
          await chatStore.switchSession?.(targetSessionId)
          return { worldId: String(attached.world?.id || attached.session?.worldId || '') }
        },
        configureSessionScene: async ({ sessionId: targetSessionId, worldId, openingLocation, openingWeather, openingTime, timeRate }) => {
          const [locationLarge, locationMiddle, locationSmall] = String(openingLocation || '').split('/').map((item) => item.trim())
          if (!locationLarge || !locationMiddle || !locationSmall) throw new Error('开场地点必须是完整的大地点/中地点/小地点')
          const effectiveTime = String(openingTime || '').trim() || formatLocalCurtainTime(new Date())
          const timePatch = createCurtainTimeFlowPatch(effectiveTime, timeRate ?? 1)
          const sceneChanges = {
            virtualSceneName: locationSmall,
            virtualSceneDesc: `世界 ${worldId} 的开场场景：${openingLocation}；天气：${openingWeather}`,
            virtualSceneWorldId: worldId,
            virtualLocationLarge: locationLarge,
            virtualLocationMiddle: locationMiddle,
            virtualLocationSmall: locationSmall,
            virtualLocation: openingLocation,
            ...timePatch,
            virtualWeather: openingWeather,
            virtualWeatherMode: 'custom'
          }
          const scenePatch = buildChatSessionPatch(sceneChanges)
          if (getChatStoreActiveSessionId(chatStore) === targetSessionId) {
            await chatStore.updateSession(targetSessionId, sceneChanges)
          } else {
            await saveChatSessionPatchById(targetSessionId, scenePatch)
          }
          const bundle = await fetchChatSessionBundleById(targetSessionId, { limit: 1 })
          const saved = (bundle?.session || {}) as unknown as Record<string, unknown>
          return {
            openingTime: String(saved.virtualTime ?? saved.virtual_time ?? ''),
            timeRate: Number(saved.virtualTimeRate ?? saved.virtual_time_rate ?? NaN),
            openingLocation: [
              saved.virtualLocationLarge ?? saved.virtual_location_large,
              saved.virtualLocationMiddle ?? saved.virtual_location_middle,
              saved.virtualLocationSmall ?? saved.virtual_location_small
            ].map((item) => String(item || '').trim()).filter(Boolean).join('/'),
            openingWeather: String(saved.virtualWeather ?? saved.virtual_weather ?? '')
          }
        },
        markCharactersPresent: async ({ sessionId: targetSessionId, worldId, characterIds, locationText }) => {
          const bundle = await fetchChatSessionBundleById(targetSessionId, { limit: 1 })
          const participantRows = Array.isArray(bundle?.participants)
            ? bundle.participants
            : Array.isArray(bundle?.session?.participants) ? bundle.session.participants : []
          const participantByCharacterId = new Map<string, string>()
          for (const row of participantRows as any[]) {
            const participantType = String(row?.participantType ?? row?.participant_type ?? 'char')
            const characterId = String(row?.participantTargetId ?? row?.participant_target_id ?? row?.targetId ?? row?.target_id ?? '').trim()
            const participantId = String(row?.id || '').trim()
            if (participantType === 'char' && characterId && participantId) participantByCharacterId.set(characterId, participantId)
          }
          const missing = characterIds.filter((characterId) => !participantByCharacterId.has(characterId))
          if (missing.length) throw new Error(`会话成员没有正式 participantId：${missing.join('、')}`)
          const before = await fetchChatSessionCharacterPresence(targetSessionId)
          const beforeByParticipant = new Map(before.items.map((item) => [item.participantId, item]))
          for (const characterId of characterIds) {
            const participantId = participantByCharacterId.get(characterId)!
            const current = beforeByParticipant.get(participantId)
            if (current?.presenceState === 'present') continue
            await setChatSessionCharacterPresence(targetSessionId, {
              participantId,
              worldId,
              presenceState: 'present',
              locationText,
              expectedVersion: Number(current?.version || 0),
              idempotencyKey: `playable-world:${targetSessionId}:${participantId}:present`,
              evidenceSummary: '一键开玩世界创建会话时，用户要求所有新角色在开场处在场。',
              lastModifiedSource: 'xingyi_playable_world_builder'
            })
          }
          const after = await fetchChatSessionCharacterPresence(targetSessionId)
          const expectedParticipantIds = characterIds.map((characterId) => participantByCharacterId.get(characterId)!)
          const presentParticipantIds = after.items
            .filter((item) => expectedParticipantIds.includes(item.participantId) && item.presenceState === 'present')
            .map((item) => item.participantId)
          return { participantIds: presentParticipantIds }
        },
        ensureCharacterStatusPanels: async ({ sessionId: targetSessionId, template, characters }) => {
          const templateMatches = (await fetchStatusPanelTemplates(targetSessionId))
            .filter((item) => String(item.name || '').trim() === template.name.trim())
          if (templateMatches.length > 1) throw new Error(`已有 ${templateMatches.length} 个同名状态栏模板「${template.name}」，无法安全续建`)
          let savedTemplate = templateMatches[0]
          if (savedTemplate) {
            const existingShape = savedTemplate.fields.map((field) => `${field.key}:${field.valueType}`).join('|')
            const requestedShape = template.fields.map((field) => `${field.key}:${field.valueType}`).join('|')
            if (existingShape !== requestedShape || String(savedTemplate.kind || '') !== 'character') {
              throw new Error(`同名状态栏模板「${template.name}」已存在，但字段结构或分类不同；请为本世界换一个专用模板名`)
            }
          } else {
            savedTemplate = await saveStatusPanelTemplate(targetSessionId, {
              name: template.name,
              kind: 'character',
              description: template.description,
              fields: template.fields,
              createdBy: 'agent',
              expectedVersion: 0
            } as never)
          }
          const bundle = await fetchChatSessionBundleById(targetSessionId, { limit: 1 })
          const participantRows = Array.isArray(bundle?.participants)
            ? bundle.participants
            : Array.isArray(bundle?.session?.participants) ? bundle.session.participants : []
          const participantByCharacterId = new Map(
            normalizeChatSessionCharacterParticipants({ participants: participantRows })
              .map((item) => [item.characterId, item.participantId] as const)
          )
          let panels = await fetchStatusPanels(targetSessionId)
          const panelReceipts = []
          for (const character of characters) {
            const participantId = String(participantByCharacterId.get(character.id) || '').trim()
            if (!participantId) throw new Error(`主要角色「${character.name}」缺少正式 participantId，不能挂状态栏`)
            const exactHostPanels = panels.filter((panel) => panel.hostType === 'session_character' && panel.hostId === participantId)
            const matching = exactHostPanels.filter((panel) => panel.templateId === savedTemplate.id)
            if (matching.length > 1) throw new Error(`角色「${character.name}」已有 ${matching.length} 张同模板状态栏，无法安全续建`)
            let panel = matching[0]
            if (!panel) {
              const nameCollision = panels.find((item) => item.name === character.name && (item.hostId !== participantId || item.templateId !== savedTemplate.id))
              if (nameCollision) throw new Error(`状态栏名称「${character.name}」已被其他宿主或模板使用，无法安全续建`)
              panel = await saveStatusPanel(targetSessionId, {
                templateId: savedTemplate.id,
                name: character.name,
                description: character.status.description,
                hostType: 'session_character',
                hostId: participantId,
                values: character.status.values,
                expectedVersion: 0,
                idempotencyKey: `playable-world:${targetSessionId}:${participantId}:status-panel`,
                source: 'xingyi_playable_world_builder'
              } as never)
              panels = [...panels, panel]
            }
            panelReceipts.push({ characterId: character.id, panelId: panel.id })
          }
          return { templateId: savedTemplate.id, panels: panelReceipts }
        },
        createNarrativeSeed: async (worldId, input) => {
          const created = await createNarrativeSeed(worldId, input)
          const createdId = String(created?.id || '').trim()
          const sourceSessionId = String(input.sourceSessionId || '').trim()
          if (createdId && sourceSessionId) narrativeSeedsRefresh = {
            worldId,
            sessionId: sourceSessionId
          }
          return { id: createdId }
        },
        findNarrativeSeedByTitle: async (worldId, title) => {
          const matches = (await fetchNarrativeSeeds(worldId)).filter((seed) => String(seed?.title || '').trim() === title.trim())
          if (matches.length > 1) throw new Error(`世界中已有 ${matches.length} 条同名叙事种子「${title}」，无法安全判断应复用哪一条`)
          const id = String(matches[0]?.id || '').trim()
          return id ? { id } : null
        },
        hasCharacterAvatar: async (characterId) => {
          const character = charStore.getCharacter(characterId) as Record<string, unknown> | null
          return Boolean(String(character?.avatarPath ?? character?.avatar_path ?? '').trim())
        },
        hasSessionAvatar: async (targetSessionId) => {
          const local = (chatStore.entities?.chatSessions || {})[targetSessionId] as Record<string, unknown> | undefined
          if (local && String(local.conversationAvatarPath ?? local.conversation_avatar_path ?? '').trim()) return true
          const bundle = await fetchChatSessionBundleById(targetSessionId, { limit: 1 })
          return Boolean(String(bundle?.session?.conversationAvatarPath ?? bundle?.session?.conversation_avatar_path ?? '').trim())
        },
        generateAvatar: async (prompt, signal) => {
          const generated = await ai.generateImage(prompt, {
            ...buildTaskModelAiOptions(agentConfig, 'xingyiAgent', { thinking: 'disabled' }),
            feature: 'xingyi',
            sessionId: sessionId.value,
            sessionLabel: '星依',
            signal
          })
          return generated.attachment
        },
        assignCharacterAvatar: async (characterId, image) => {
          const avatarDataUrl = await readImageUrlAsDataUrl(image.url)
          if (!avatarDataUrl) throw new Error('角色头像文件读取失败')
          await charStore.updateCharacter(characterId, { avatarPath: avatarDataUrl } as never)
        },
        assignSessionAvatar: async (targetSessionId, image) => {
          const avatarDataUrl = await readImageUrlAsDataUrl(image.url)
          if (!avatarDataUrl) throw new Error('群聊头像文件读取失败')
          if (getChatStoreActiveSessionId(chatStore) === targetSessionId) {
            await chatStore.updateSession(targetSessionId, { conversationAvatarPath: avatarDataUrl })
            return
          }
          await saveChatSessionPatchById(targetSessionId, buildChatSessionPatch({ conversationAvatarPath: avatarDataUrl }))
        },
        inspectBuild: async ({ world: worldIdentifier, session: sessionIdentifier }) => {
          const normalizedWorldIdentifier = String(worldIdentifier || '').trim()
          const worlds = await fetchWorlds()
          const matchedWorlds = worlds.filter((candidate) => {
            const candidateId = String(candidate?.id || '').trim()
            const candidateName = String(candidate?.name || '').trim()
            return candidateId === normalizedWorldIdentifier || candidateName === normalizedWorldIdentifier
          })
          if (!matchedWorlds.length) throw new Error(`没有找到世界「${normalizedWorldIdentifier}」，请填写精确世界名称或 worldId`)
          if (matchedWorlds.length > 1) throw new Error(`找到 ${matchedWorlds.length} 个精确匹配的世界，请改用 worldId`)
          const matchedWorld = matchedWorlds[0]
          const worldId = String(matchedWorld.id || '').trim()
          const detail = await fetchWorldDetail(worldId)
          const normalizedSessionIdentifier = String(sessionIdentifier || '').trim()
          const sessionCandidates = normalizedSessionIdentifier
            ? detail.sessions.filter((candidate) => (
                String(candidate.id || '').trim() === normalizedSessionIdentifier
                || String(candidate.name || '').trim() === normalizedSessionIdentifier
              ))
            : detail.sessions
          if (!sessionCandidates.length) {
            throw new Error(normalizedSessionIdentifier
              ? `世界「${matchedWorld.name}」下没有会话「${normalizedSessionIdentifier}」`
              : `世界「${matchedWorld.name}」下没有可验收的会话`)
          }
          if (sessionCandidates.length > 1) {
            throw new Error(normalizedSessionIdentifier
              ? `世界下有 ${sessionCandidates.length} 个同名会话，请改用 sessionId`
              : `世界下有 ${sessionCandidates.length} 个会话，请同时填写 session 名称或 sessionId`)
          }
          const matchedSession = sessionCandidates[0]
          const targetSessionId = String(matchedSession.id || '').trim()
          const bundle = await fetchChatSessionBundleById(targetSessionId, { limit: 1 })
          const participantRows = Array.isArray(bundle?.participants)
            ? bundle.participants
            : Array.isArray(bundle?.session?.participants) ? bundle.session.participants : []
          const participants = normalizeChatSessionCharacterParticipants({ participants: participantRows })
          const presence = await fetchChatSessionCharacterPresence(targetSessionId)
          const statusPanels = await fetchStatusPanels(targetSessionId)
          const presenceByParticipantId = new Map(presence.items.map((item) => [item.participantId, item.presenceState]))
          const characters = participants.map((participant) => {
            const character = charStore.getCharacter(participant.characterId) as Record<string, unknown> | null
            const participantId = String(participant.participantId || '').trim()
            const groupId = String(character?.groupId ?? character?.group_id ?? '').trim()
            const groupName = String((charStore.characterGroups || []).find((group) => String(group.id) === groupId)?.name || '').trim()
            const matchingStatusPanels = statusPanels.filter((panel) => panel.hostType === 'session_character' && panel.hostId === participantId)
            return {
              id: participant.characterId,
              name: String(character?.name || participant.characterId),
              participantId,
              presenceState: participantId ? String(presenceByParticipantId.get(participantId) || 'unknown') : 'unknown',
              avatarReady: Boolean(String(character?.avatarPath ?? character?.avatar_path ?? '').trim()),
              groupId,
              groupName,
              statusPanelId: String(matchingStatusPanels[0]?.id || '')
            }
          })
          const seeds = await fetchNarrativeSeeds(worldId)
          const sessionWorldId = String(bundle?.session?.worldId ?? bundle?.session?.world_id ?? '').trim()
          const sessionAvatarPath = String(
            bundle?.session?.conversationAvatarPath
            ?? bundle?.session?.conversation_avatar_path
            ?? ''
          ).trim()
          return {
            world: { id: worldId, name: String(matchedWorld.name || worldId) },
            session: {
              id: targetSessionId,
              title: String(bundle?.session?.title || matchedSession.name || targetSessionId),
              worldId: sessionWorldId,
              avatarReady: Boolean(sessionAvatarPath),
              scene: {
                openingTime: String(bundle?.session?.virtualTime ?? bundle?.session?.virtual_time ?? ''),
                timeRate: Number(bundle?.session?.virtualTimeRate ?? bundle?.session?.virtual_time_rate ?? NaN),
                openingLocation: [
                  bundle?.session?.virtualLocationLarge ?? bundle?.session?.virtual_location_large,
                  bundle?.session?.virtualLocationMiddle ?? bundle?.session?.virtual_location_middle,
                  bundle?.session?.virtualLocationSmall ?? bundle?.session?.virtual_location_small
                ].map((item) => String(item || '').trim()).filter(Boolean).join('/'),
                openingWeather: String(bundle?.session?.virtualWeather ?? bundle?.session?.virtual_weather ?? '')
              }
            },
            documentIds: [...new Set(detail.docLinks.map((id) => String(id || '').trim()).filter(Boolean))],
            characters,
            narrativeSeeds: seeds
              .map((seed) => ({ id: String(seed?.id || '').trim(), title: String(seed?.title || '').trim() }))
              .filter((seed) => seed.id)
          }
        }
      },
      // 显式会话解析器（取料闭环计划批次3）：把 session 参数（会话名/联系人名/targetId/sessionId）
      // 解析成完整上下文（含成员角色），让状态系统/读投影工具能操作非活动会话（没打开对话时指定用）。
      resolveSessionContext: async (identifier) => {
        const id = String(identifier || '').trim()
        if (!id) return null
        const sessions = listExistingSessionContexts()
        const sessionResolved = resolveXingyiSessionCandidate(sessions, id)
        if (sessionResolved.error) return { error: sessionResolved.error }
        const contact = resolveXingyiChatContact(listChatContacts(), id).contact
        let bundle: ChatSessionBundle | null = null
        try {
          if (sessionResolved.context) {
            bundle = await fetchChatSessionBundleById(sessionResolved.context.sessionId)
          } else if (contact) {
            // 禁按 targetId fetch：fetchChatSessionBundle 打 GET /chat/:targetId，服务端 getChat 会自动补建
            // 缺失会话——等于复活被删会话（真机反馈的会话再生 bug）。只认本地已存在的会话，没有就当解析失败。
            const matchedSessions = sessions.filter((item) => item.targetId === contact.targetId)
            if (matchedSessions.length > 1) {
              const ambiguity = resolveXingyiSessionCandidate(matchedSessions.map((item) => ({ ...item, sessionTitle: contact.name })), contact.name)
              return { error: ambiguity.error || `联系人「${contact.name}」存在多个会话，请用 sessionId 指定。` }
            }
            const existingSessionId = matchedSessions[0]?.sessionId || findExistingContactSessionId(contact.targetId)
            if (!existingSessionId) return null
            bundle = await fetchChatSessionBundleById(existingSessionId)
          } else {
            bundle = await fetchChatSessionBundleById(id)
          }
        } catch {
          return null
        }
        const session = (bundle?.session || null) as unknown as Record<string, unknown> | null
        const sessionId = String(session?.id || '').trim()
        if (!session || !sessionId) return null
        const memberIds = Array.from(new Set(
          normalizeChatSessionCharacterParticipants(session as never)
            .map((participant) => String(participant.characterId || '').trim())
            .filter(Boolean)
        ))
        return {
          sessionId,
          sessionTitle: String(session.title || session.name || contact?.name || '会话'),
          characterOptions: memberIds.map((cid) => ({
            id: cid,
            name: String((charStore.getCharacter(cid) as { name?: string } | null)?.name || cid)
          }))
        }
      },
      onIntermediateMessage: async ({ content }) => {
        const interim = String(content || '').trim()
        if (!interim || emittedInterimMessages.has(interim) || xingyiAbortController.value?.signal.aborted) return
        emittedInterimMessages.add(interim)
        const interimDrained = drainXingyiTurnStreamEntries()
        messages.value.push({
          role: 'assistant',
          content: interim,
          ...(interimDrained.length ? { turnStream: interimDrained } : {})
        })
        await persistMessage('assistant', interim, undefined, interimDrained)
      },
      onTaskTodoChange: (snapshot) => {
        const retained = saveAgentConversationTaskTodo(continuationSessionId, snapshot)
        if (sessionId.value === continuationSessionId) taskTodoSnapshot.value = retained
      },
      onProgress: handleProgress,
      callOrchestrator: async ({ messages: turnMessages, toolBriefs, toolChoice }) => {
        const response = await ai.callAIWithTools(turnMessages as never, {
          // 主循环模型由当前星依对话选择；书童/校书/掌阁的全局槽只提供具体预设与模型。
          ...buildAgentConversationModelAiOptions(agentConfig, modelSelection.value, { temperature: 0.6, maxTokens: 4096, thinking: 'enabled' }),
          tools: toOpenAiTools(toolBriefs),
          ...(toolChoice ? { toolChoice } : {}),
          feature: 'xingyi',
          logLabel: 'xingyi-agent',
          usageLabel: '星依总agent',
          placeLabel: '星依浮坞',
          sessionId: sessionId.value,
          sessionLabel: '星依',
          // 停止按钮（2026-07-13）：中断时掐断在途 HTTP 请求（不止等到步骤边界才收束）。
          signal: xingyiAbortController.value?.signal
        })
        return { content: response?.content ?? '', toolCalls: response?.toolCalls ?? [] }
      }
    })
    if (result.terminalReason === 'aborted') {
      // 用户主动停止（工具执行中途被 abort：runAgentRuntime 在下一轮起点干净收束，不抛错）——
      // 静默收尾，不追加任何回复（含「星依这轮没说出话来」空回复兜底文案），不算失败。
      settleAllOpenXingyiTurnStreamEntries('error')
      return
    }
    const reply = result.reply.trim() || t('xingyi.emptyReply')
    // 过程流内联收编（2026-07-13）：最终回复收编本轮累积的轮次/工具流水（分段语义——若本轮期间已有
    // askUser 归档等中途收编，这里只拿「上一次收编以来」的新增片段，见 drainXingyiTurnStreamEntries 注释）。
    const finalDrained = drainXingyiTurnStreamEntries()
    messages.value.push({
      role: 'assistant',
      content: reply,
      ...(result.attachments.length ? { attachments: result.attachments } : {}),
      ...(finalDrained.length ? { turnStream: finalDrained } : {})
    })
    const assistantPersistence = result.reply.trim() || result.attachments.length
      ? persistMessage('assistant', reply, result.attachments, finalDrained)
      : Promise.resolve(0)
    if (narrativeSeedsRefresh) {
      await notifyNarrativeSeedsExternalUpdatedAfterPersistence(assistantPersistence, narrativeSeedsRefresh)
    } else {
      void assistantPersistence
    }
    if (result.terminalReason === 'done' || result.terminalReason === 'closing-note') {
      markTurnSucceeded()
    }
  } catch (error) {
    // 用户主动停止（在途模型 HTTP 请求被 abort：useAI.ts 统一转成 name='AbortError' 的 Error，见
    // callAIWithTools/callAI 实现）——静默收尾，不标 _sendFailed、不 push「星依这边出错了」报错气泡。
    const aborted = (error instanceof Error && error.name === 'AbortError') || Boolean(xingyiAbortController.value?.signal.aborted)
    if (aborted) {
      settleAllOpenXingyiTurnStreamEntries('error')
    } else {
      const detail = error instanceof Error ? error.message : String(error)
      lastTurnError.value = true
      // 乐观用户消息标失败态（带图乐观发送·2026-07-11）：与下面的独立助手错误回复共存，不重复同一件事——
      // 这条是「你刚发的那条消息可能没成功」的轻量视觉提示，助手回复是「星依这边出错了：xxx」的详细说明。
      liveMessage._sendFailed = true
      // 过程流内联收编（2026-07-13）：错误回复本身不落库（历史行为——刷新即丢，此处不新增持久化，
      // 只在本次会话内本地挂 turnStream 供即时查看；不调 persistMessage，避免把以前从不落库的报错内容
      // 悄悄变成永久聊天记录，这是本批任务书与现状的一处出入，已在报告里向用户标出）。
      const errorDrained = drainXingyiTurnStreamEntries()
      messages.value.push({ role: 'assistant', content: t('xingyi.errorReply', { detail }), ...(errorDrained.length ? { turnStream: errorDrained } : {}) })
    }
  } finally {
    for (const id of sendingIds) sendingImageIds.value.delete(id)
    // 兜底：本轮异常结束时若还有卡片挂起（含此前遗漏的选择卡·2026-07-12 通道统一批C 修复泄漏），
    // 按各自「取消」语义收掉，避免 promise 悬挂与卡片残留跨轮误导下一次交互。
    dismissPendingInteraction()
    if (pendingMapDraftReview.value) finishMapDraftReview({ status: 'cancelled' })
    running.value = false
    activity.value = ''
    // 星依当轮工作流（批G）：只熄 running（未定行停转菊花），流水保留到下一轮开始供回看
    endXingyiTurnStream()
    // turn 级停止（2026-07-13）：本轮结束，清空 controller——停止按钮只在 running 时显示，
    // 之后再点也拿不到已失效的旧 controller（下一轮 send() 会新建一个）。
    xingyiAbortController.value = null
  }
}

async function send() {
  const text = draft.value.trim()
  // 发送可用性（批5）：原来 draft 非空才发，改为 draft 非空或有 ready 附件（图片可以单独发，不强制配文字）。
  if ((!text && !hasReadyImageAttachment.value) || running.value || !canUse.value) return
  await loadSession()
  draft.value = ''
  const history = messages.value.slice(-HISTORY_LIMIT)
  // 乐观发送（真机反馈修卡顿）：同步取当前附件快照就地显示，图片真正上传/生成 caption 转进
  // runXingyiTurn 后台完成——不再像旧版等 caption（最长 20s）才让消息出现在聊天列表里。
  const attachmentSnapshot = chatImageAttachments.peekAttachments()
  const readySnapshot = attachmentSnapshot.filter((img) => img.status === 'ready')
  if (!text && !readySnapshot.length) return // 极端竞态兜底：await loadSession 期间图片恰好被用户移除
  const sendingIds = attachmentSnapshot.map((img) => img.id)
  // 视觉隐藏 chips：只加进这个集合，不动底层 pendingImages/上传/caption 生命周期（见 sendingImageIds 定义处注释）。
  for (const id of sendingIds) sendingImageIds.value.add(id)
  // 纯图片无文字时给一个可读占位（服务端要求 content 非空；有文字则原样存文字，不叠加占位）。
  const displayText = text || t('xingyi.imageOnlyPlaceholder')
  // 乐观显示只用「当前已 ready」的图（真 url 已就位，不会稍后又从气泡里消失）；已就绪的图也优先展示本地
  // previewUrl（浏览器内存里现成的解码结果，秒开，不用等一次 /chat-images 网络往返）。
  const optimisticAttachments: ChatImageAttachment[] = readySnapshot.map((img) => {
    const { status: _status, previewUrl, errorMessage: _errorMessage, ...attachment } = img
    return { ...attachment, url: previewUrl || attachment.url }
  })
  messages.value.push({ role: 'user', content: displayText, ...(optimisticAttachments.length ? { attachments: optimisticAttachments } : {}) })
  // 从数组按下标取回响应式代理引用（不是刚 push 进去的原始对象）：后续通过它改 attachments/_sendFailed
  // 才能正确触发气泡重渲染，直接改原始对象引用不会被 Vue 的依赖追踪感知到。
  const liveMessage = messages.value[messages.value.length - 1]
  running.value = true
  activity.value = ''
  lastTurnError.value = false
  // turn 级停止（2026-07-13）：本轮专属 AbortController，finally 里清空——见下方 stopXingyiTurn/各注入点。
  xingyiAbortController.value = new AbortController()
  // 星依当轮工作流（批G）：新一轮开始清空上一轮流水（entries 只属于当前/最近一轮）
  beginXingyiTurnStream()
  void runXingyiTurn(text, displayText, history, sendingIds, liveMessage)
}

/** 停止按钮（2026-07-13）：先释放人在环上等待，再 abort 模型与子代理。只 abort 会让正在等确认卡或头像
 *  裁剪预览的 Promise 永远悬挂，runXingyiTurn 进不了 finally，表现就是「停止不了」。running/时间线的最终收尾
 *  仍只走 runXingyiTurn 的正常出口，避免另立第二套状态源；各 request* 也检查 aborted，封住停止竞态。 */
function stopXingyiTurn() {
  const controller = xingyiAbortController.value
  if (controller && !controller.signal.aborted) controller.abort()
  dismissPendingInteraction()
  if (pendingMapDraftReview.value) finishMapDraftReview({ status: 'cancelled' })
  finishAvatarCrop(null)
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = String(el.tagName || '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(el.isContentEditable)
}

/** Shift+X 全局唤出/收起（键位已核对全仓无冲突；输入态不触发，浮坞自己的输入框除外——收起也顺手）。
 *  Shift+Tab（浮坞打开时）切换写权限模式：同一套输入态守卫；窗口级监听保证运行中输入框禁用时也能切。 */
function handleShortcut(event: KeyboardEvent) {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  const key = String(event.key || '').toLowerCase()
  if (key === 'tab') {
    if (!open.value) return
    if (isEditableTarget(event.target) && event.target !== composerRef.value?.textareaEl) return
    event.preventDefault()
    toggleWriteMode()
    return
  }
  if (key !== 'x') return
  if (isEditableTarget(event.target) && event.target !== composerRef.value?.textareaEl) return
  event.preventDefault()
  open.value = !open.value
}

/** 全局唤出事件（批次4·移动端等无键盘场景的唤出通路，与 Shift+X 共用同一个 open 状态）。
 *  联动标注：事件名与 MobileWorkspaceShell.vue 的星依悬浮按钮 dispatch 是同一字符串，改名两处同步。 */
function handleToggleEvent() {
  open.value = !open.value
}

/** 需要带任务草稿进入浮坞的全局入口：只改本组件现役 open/draft，不创建第二套浮坞状态。 */
function handleOpenRequest(event: Event) {
  const request = readXingyiDockOpenRequest(event)
  open.value = true
  if (request.draft !== undefined) draft.value = request.draft
  nextTick(() => composerRef.value?.focus())
}

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('langhuan:toggle-xingyi', handleToggleEvent)
  window.addEventListener(XINGYI_DOCK_OPEN_REQUEST_EVENT, handleOpenRequest)
})

onBeforeUnmount(() => {
  stopXingyiTurn()
  finishAvatarCrop(null)
  clearSuccessPulseTimer()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('langhuan:toggle-xingyi', handleToggleEvent)
  window.removeEventListener(XINGYI_DOCK_OPEN_REQUEST_EVENT, handleOpenRequest)
})
</script>

<style scoped>
.xingyi-dock {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

/* 2026-07-16：XingyiStarIcon 改画像素风五角星后，星体在自身 40 视窗里只占约 55%（旧版 lucide sparkles
   占约 87%），同样容器下星体视觉尺寸明显缩水、描边也因此细到接近不可见——本浮坞里凡是把它当「紧凑状态灯」用
   （任务面板星星/活动提示星星，两处都挂 xy-star--{status} 决定颜色；头部标题栏与空状态图标已抽进
   共享组件自带同款补偿，不在这个选择器组里）统一在这里补偿：
   放大 + 加粗描边 + 隐藏三根放射光线（那是给 58px 桌宠状态星的呼吸光效设计的，紧凑场景下只是几根细毛刺，
   2026-07-17 起空状态图标也要与头部灯视觉同步，同样隐藏）+ 关掉 crispEdges 像素级渲染
   （像素风格是给桌宠原生整数倍缩放设计的；这几处容器都是零点几倍的非整数缩放，crispEdges 会让填充层与描边层
   各自独立走"贴像素网格"取整、彼此取整方向不一致，肉眼看起来像叠了两个纵向错位的星星——换回默认抗锯齿渲染
   即可消除，与桌宠自己 58px 原生整数缩放场景互不影响）。
   ⚠️踩坑：.xingyi-star-icon__rays/__outline 是 XingyiStarIcon 子组件内部渲染的元素，不是本组件模板的根节点——
   Vue scoped 样式默认只把作用域属性加到选择器最后一段，且该属性只会出现在"子组件根节点"上（宽高这条能生效
   正是因为它直接选中的就是子组件根节点本身）；选中子组件内部非根节点必须用 :deep() 穿透，否则选择器编译后
   永远选不中真实渲染出来的元素，样式静默不生效（不报错，肉眼看不出原因）。 */
.xingyi-dock__task-star,
.xingyi-dock__activity-star {
  shape-rendering: auto;
}

.xingyi-dock__task-star :deep(.xingyi-star-icon__rays),
.xingyi-dock__activity-star :deep(.xingyi-star-icon__rays) {
  display: none;
}

.xingyi-dock__task-star :deep(.xingyi-star-icon__outline),
.xingyi-dock__activity-star :deep(.xingyi-star-icon__outline) {
  stroke-width: 3;
}

/* 头部融合状态灯（星星+名称+状态文字）已抽成共享组件 XingyiDockHeader.vue（2026-07-17，
   这里不再重复维护 .xingyi-dock__head* 视觉。 */

/* 停止按钮（2026-07-13）：仿主题切换按钮同款 class 体系（尺寸/圆角/悬停节奏一致），图标改实心方块+
   危险色调，与主题切换视觉区分（停止是中断动作，非常态切换）。仅 running 时渲染（模板 v-if）。 */
/* 浮坞私有夜间开关钮：与外壳工具钮同款外观（外壳 scoped 样式够不到 slot 内容，这里写同款·联动标注：
   尺寸/悬停跟 FloatingWorkspaceWindow .floating-workspace-window__tool 保持一致） */
.xingyi-dock__theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #6c7468);
  cursor: pointer;
}

.xingyi-dock__theme-toggle:hover {
  background: color-mix(in srgb, var(--morandi-border, #cfd7c8) 34%, transparent);
  color: var(--morandi-text, #364034);
}

.xingyi-dock__theme-toggle svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 立即生成今天日记按钮的进行中态（批次3 修正·2026-07-16）：不做复杂动画，降透明度+禁用光标即可表达忙碌。 */
.xingyi-dock__diary-generate-toggle--busy {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 全局夜间 + 浮坞强制日间时，中和 main.css「[data-theme="dark"] input/textarea」的 !important 硬底色
   （那条规则按祖先 html 命中，会穿透进强制日间的子树；同 !important 但本选择器特异度更高）。
   .xingyi-dock__input 平时无底色（更沉浸），只在这里兜底聚焦态；.xingyi-dock__ask-input 不改，维持常驻底色。 */
[data-theme='light'] .xingyi-dock__input:focus {
  background: var(--morandi-card, #fffdf8) !important;
  color: var(--morandi-text, #333) !important;
  border-color: var(--morandi-accent, #5C8A5C) !important;
}
[data-theme='light'] .xingyi-dock__ask-input {
  background: var(--morandi-card, #fffdf8) !important;
  color: var(--morandi-text, #333) !important;
  border-color: var(--morandi-border, #e0e0e0) !important;
}

/* Agent 任务面板（收编原右上角提示灯）：细线浅底折叠条，灯点表达状态，详情内滚不撑窗 */
.xingyi-dock__task {
  flex: 0 0 auto;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 55%, transparent);
  animation: lh-rise var(--lh-dur, 0.18s) var(--lh-ease-out, ease);
}

.xingyi-dock__task-head {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  cursor: pointer;
}

.xingyi-dock__task-head:hover {
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 22%, transparent);
}

/* 任务面板的灯也是星星（2026-07-11 设计稿·状态色由 xy-star--* 全局类族提供） */
.xingyi-dock__task-star {
  width: 22px;
  height: 22px;
}

.xingyi-dock__task-text {
  min-width: 0;
}

.xingyi-dock__task-title {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--morandi-text, #333);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xingyi-dock__task-message {
  overflow: hidden;
  font-size: 11px;
  line-height: 1.4;
  color: var(--morandi-text-light, #666);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xingyi-dock__task-chevron {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--morandi-text-light, #666);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--lh-dur, 0.18s) ease;
}

.xingyi-dock__task-chevron--open {
  transform: rotate(90deg);
}

.xingyi-dock__task-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light, #666);
  cursor: pointer;
}

.xingyi-dock__task-close:hover {
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 40%, transparent);
  color: var(--morandi-text, #333);
}

.xingyi-dock__task-close svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.xingyi-dock__task-body {
  max-height: 200px;
  overflow-y: auto;
  padding: 6px 10px 10px 12px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 40%, transparent);
}

.xingyi-dock__task-source {
  margin-bottom: 6px;
  font-size: 11px;
  color: color-mix(in srgb, var(--morandi-text-light, #666) 80%, transparent);
}

.xingyi-dock__task-steps {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.xingyi-dock__task-steps li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.xingyi-dock__task-step-dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-text-light, #666) 40%, transparent);
}

.xingyi-dock__task-step--running .xingyi-dock__task-step-dot { background: #d99a2b; }
.xingyi-dock__task-step--waiting .xingyi-dock__task-step-dot { background: var(--langhuan-dialog-primary-bg, #4f867c); }
.xingyi-dock__task-step--success .xingyi-dock__task-step-dot { background: var(--morandi-accent, #5C8A5C); }
.xingyi-dock__task-step--error .xingyi-dock__task-step-dot { background: var(--morandi-danger, #c0564f); }

.xingyi-dock__task-step-text {
  min-width: 0;
}

.xingyi-dock__task-step-label {
  font-size: 12px;
  line-height: 1.45;
  color: var(--morandi-text, #333);
  overflow-wrap: anywhere;
}

.xingyi-dock__task-step-detail {
  margin-top: 1px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--morandi-text-light, #666);
  overflow-wrap: anywhere;
}

.xingyi-dock__task-action {
  width: 100%;
  margin-top: 8px;
  padding: 4px 0;
  border: 1px solid color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 8%, var(--morandi-card, #fffdf8));
  color: var(--langhuan-dialog-primary-bg, #4f867c);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.xingyi-dock__task-action:hover {
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 14%, var(--morandi-card, #fffdf8));
}

.xingyi-dock__task-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--morandi-danger, #c0564f);
  overflow-wrap: anywhere;
}

.xingyi-dock__messages {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px 12px 18px;
  /* 批M1：给浮窗右缘 4px resize 条让位——消息区整体右缩 4px，自家 6px 滚动条完全落在拖拽条内侧，
     滑块可点可拖、窗边缘仍可 ew-resize（联动：FloatingWorkspaceWindow 边缘条宽度改口径这里同步）。 */
  margin-right: 4px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 纸纹底（2026-07-11 设计稿）：与聊天主区同一纸面语义，夜间 token 自动退化纯色 */
  background: var(--langhuan-paper-bg, transparent);
}

/* 自家细滑块（真机反馈：原生滚动条在浮坞里太突兀）：与聊天区 .chat-messages 同语言——6px、透明轨道、圆角 thumb。
   thumb 颜色走 text-light token 的 color-mix，随浮坞私有主题（最近 data-theme）自动分日夜深浅，无需选择器分支。
   .xingyi-dock__input 不在这份可见滑块名单里（2026-07-16）：会自动增高到上限才需要内部滚动，
   常态几乎用不上，滑块常驻反而显得重——同侧栏 .sidebar-list 一样走"隐形但可滚"，见下方单独规则。 */
.xingyi-dock__messages::-webkit-scrollbar,
.xingyi-dock__task-body::-webkit-scrollbar {
  width: 6px;
}

.xingyi-dock__messages::-webkit-scrollbar-track,
.xingyi-dock__task-body::-webkit-scrollbar-track {
  background: transparent;
}

.xingyi-dock__messages::-webkit-scrollbar-thumb,
.xingyi-dock__task-body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--morandi-text-light, #666) 38%, transparent);
  border-radius: 3px;
}

.xingyi-dock__messages::-webkit-scrollbar-thumb:hover,
.xingyi-dock__task-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--morandi-text-light, #666) 58%, transparent);
}

/* 气泡壳（行对齐方向 + 圆角/投影/配色）已抽进 XingyiChatBubble.vue 共享组件，
   这里不再重复维护 .xingyi-dock__row/.xingyi-dock__bubble 视觉；输入框的滚动条隐藏同理抽进
   XingyiChatComposer.vue。以下只保留气泡内部图片附件/失败提示这些 Dock 专属内容的样式。 */

/* 气泡内图片附件缩略图（输入框图片上传计划批5）：多图横排换行，约 120px 圆角方格，点击放大。 */
.xingyi-dock__bubble-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.xingyi-dock__bubble-images:not(:first-child) {
  margin-top: 6px;
}

.xingyi-dock__bubble-image {
  display: block;
  flex: none;
  width: 120px;
  height: 120px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 70%, transparent);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: transparent;
}

.xingyi-dock__bubble-image-item {
  position: relative;
  flex: none;
}

.xingyi-dock__bubble-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.xingyi-dock__bubble-images--single .xingyi-dock__bubble-image-item,
.xingyi-dock__bubble-images--single .xingyi-dock__bubble-image {
  width: auto;
  height: auto;
  max-width: min(100%, 320px);
  max-height: 420px;
}

.xingyi-dock__bubble-images--single .xingyi-dock__bubble-image img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
}

.xingyi-dock__bubble-image-avatar {
  position: absolute;
  top: 7px;
  right: 7px;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  background: rgba(35, 39, 35, 0.68);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.xingyi-dock__bubble-image-item:hover .xingyi-dock__bubble-image-avatar,
.xingyi-dock__bubble-image-avatar:focus-visible {
  opacity: 1;
}

.xingyi-dock__bubble-image-avatar svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}

@media (hover: none) {
  .xingyi-dock__bubble-image-avatar {
    opacity: 1;
  }
}

/* 带图乐观发送失败态（2026-07-11）：轻量提示，不遮挡气泡正文，颜色走既有 danger token（同 chips 失败态）。 */
.xingyi-dock__bubble-failed {
  margin-top: 4px;
  font-size: 11px;
  color: var(--morandi-danger);
}

.xingyi-dock__activity {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--morandi-text-light, #666);
}

.xingyi-dock__activity-star {
  flex: 0 0 auto;
  width: 21px;
  height: 21px;
}

.xingyi-dock__activity-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.xingyi-dock__confirm {
  padding: 8px 10px;
  border: 1px solid var(--morandi-accent, #5C8A5C);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-accent, #5C8A5C) 8%, var(--morandi-card, #fffdf8));
  font-size: 12px;
  line-height: 1.6;
  color: var(--morandi-text, #333);
  animation: lh-rise var(--lh-dur, 0.18s) var(--lh-ease-out, ease);
}

.xingyi-dock__confirm-title {
  font-weight: 600;
  margin-bottom: 2px;
}

.xingyi-dock__confirm-line {
  color: var(--morandi-text-light, #666);
  word-break: break-word;
}

.xingyi-dock__confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}

.xingyi-dock__confirm-feedback {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.xingyi-dock__confirm-input {
  min-width: 0;
  flex: 1;
  padding: 4px 7px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 6px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
}

.xingyi-dock__confirm-input:focus {
  outline: none;
  border-color: var(--morandi-accent, #5C8A5C);
}

.xingyi-dock__confirm-send {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 6px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 11px;
  cursor: pointer;
}

.xingyi-dock__confirm-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.xingyi-dock__confirm-btn {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
  cursor: pointer;
}

.xingyi-dock__confirm-btn--ok {
  border-color: var(--morandi-accent, #5C8A5C);
  background: var(--morandi-accent, #5C8A5C);
  color: #fff;
}

.xingyi-dock__confirm-btn--cancel:hover {
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 40%, transparent);
}

.xingyi-dock__confirm-btn--ok:hover {
  filter: brightness(1.05);
}

/* 询问用户选择卡片（批C·askUser）：问题 + 选项(带建议) + 其他想法自由输入 */
.xingyi-dock__ask {
  padding: 8px 10px;
  border: 1px solid var(--langhuan-dialog-primary-bg, #4f867c);
  border-radius: 8px;
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 8%, var(--morandi-card, #fffdf8));
  font-size: 12px;
  line-height: 1.55;
  color: var(--morandi-text, #333);
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: lh-rise var(--lh-dur, 0.18s) var(--lh-ease-out, ease);
}

.xingyi-dock__ask-q {
  font-weight: 600;
  word-break: break-word;
  /* 草案确认卡正文靠换行分节（依据/假设/缺料清单·地图严谨协作批3），必须保留 \n；单行问题不受影响 */
  white-space: pre-line;
}

/* 「在地图上看草案」入口（批3）：与选项按钮同容器语言，但用主色描边区分「查看」与「决策」两类动作
   （联动能力：与 TidiaoDirectorDock.vue 的 .tds-dock__huiyu-confirm-map-btn 同一份样式，改一处需同步）。 */
.xingyi-dock__ask-map-btn {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--morandi-card, #fffdf8);
  color: var(--langhuan-dialog-primary-bg, #4f867c);
  font-size: 11px;
  cursor: pointer;
}

.xingyi-dock__ask-map-btn:hover {
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 10%, var(--morandi-card, #fffdf8));
}

.xingyi-dock__ask-opt {
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
  padding: 6px 9px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 7px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  cursor: pointer;
}

.xingyi-dock__ask-opt:hover {
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 10%, var(--morandi-card, #fffdf8));
}

.xingyi-dock__ask-opt-label {
  font-weight: 600;
}

.xingyi-dock__ask-opt-note {
  color: var(--morandi-text-light, #666);
  font-size: 11px;
}

.xingyi-dock__ask-other {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.xingyi-dock__ask-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 6px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
}

.xingyi-dock__ask-input:focus {
  outline: none;
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
}

.xingyi-dock__ask-send {
  flex: 0 0 auto;
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.xingyi-dock__ask-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}



.xingyi-dock__composer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 8px 10px 6px;
  background: var(--langhuan-paper-bg, transparent);
}

/* 图片附件缩略图条：悬浮在输入框上方，不挤压布局（与主聊天 .chat-input-attachment-chips 同一份
   悬浮定位思路，锚点是上面 .xingyi-dock__composer 的 position:relative）。 */
.xingyi-dock__attachment-chips {
  position: absolute;
  left: 10px;
  bottom: calc(100% + 6px);
  z-index: 5;
}

/* textarea 与发送/停止按钮外观（自增高、就绪辉光、停止态配色）已抽进 XingyiChatComposer.vue
   共享组件，这里不再重复维护 .xingyi-dock__input/.xingyi-dock__send 视觉。 */

/* 装饰性动效统一静止分支（星光动画的静止分支在 main.css xy-star 节，这里只管本组件自有动效；
   靠边签牌的 transition 静止分支在 FloatingWorkspaceWindow.vue 自己维护，未打开态并入靠边收起态后
   签牌本体已不在本组件作用域内） */
@media (prefers-reduced-motion: reduce) {
  .xingyi-dock__task,
  .xingyi-dock__confirm,
  .xingyi-dock__ask {
    animation: none;
  }
}
</style>
