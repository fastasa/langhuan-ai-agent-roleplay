<template>
  <div class="card chat-card" :class="{ 'chat-card--workspace-open': workspacePrimaryView === 'roles' }">
    <div v-if="workspacePrimaryView !== 'roles'" class="card-title">聊天</div>

    <div class="chat-layout">
      <div
        class="chat-sidebar-slot"
        :class="{
          'chat-sidebar-slot--force-collapsed': isRoleSidebarForceCollapsed && !sidebarVisualPresent,
          'chat-sidebar-slot--hover-open': sidebarVisualExpanded,
          'chat-sidebar-slot--visual-present': sidebarVisualPresent,
          'chat-sidebar-slot--closing': sidebarLeaving,
          'chat-sidebar-slot--animating': sidebarTransitioning,
          'chat-sidebar-slot--floating': sidebarVisualPresent && !currentSidebarPinned
        }"
        :style="sidebarSlotStyle"
        @pointerover="handleSidebarSlotPointerOver"
        @pointermove="handleSidebarSlotPointerMove"
        @pointerleave="handleSidebarSlotPointerLeave"
        @click.capture="handleSidebarSlotClickCapture"
        @focusin="handleSidebarSlotFocusIn"
        @focusout="handleSidebarSlotFocusOut"
        @transitionend="handleSidebarSlotTransitionEnd"
      >
        <AppChatSidebar
          :sidebar-open="viewModel.sidebarOpen"
          :workspace-primary-view="workspacePrimaryView"
          :desktop-display-view="sidebarDisplayView"
          :desktop-width="chatSidebarWidth"
          :desktop-resizable="isDesktopViewport && effectiveSidebarOpen"
          :desktop-sidebar-style="chatSidebarStyle"
          :desktop-hover-open="sidebarVisualExpanded"
          :desktop-visual-present="sidebarVisualPresent"
          :desktop-sidebar-leaving="sidebarLeaving"
          :desktop-floating-mode="isDesktopViewport"
          :desktop-sidebar-pinned="currentSidebarPinned"
          @pin-sidebar="handlePinSidebar"
          @unpin-sidebar="handleUnpinSidebar"
          :collapsed-groups="viewModel.collapsedGroups"
          :characters="viewModel.characters"
          :character-groups="viewModel.characterGroups"
          :groups="viewModel.groups"
          :crowds="viewModel.crowds"
          :chat-session-rows="viewModel.chatSessionRows || []"
          :active-session-id="viewModel.activeSessionId || ''"
          :user-profile="viewModel.userProfile"
          :current-target="sidebarCurrentTarget"
          :dark-mode="viewModel.darkMode"
          :active-utility-panel="activeUtilityPanel"
          :can-use-local-tools="canUseLocalAdvancedFeatures"
          :open-chat-session-creator="actions.openChatSessionCreator"
          :rename-chat-session="actions.renameChatSession"
          :delete-chat-session="actions.deleteChatSession"
          :delete-chat-sessions="actions.deleteChatSessions"
          :archive-chat-session="actions.archiveChatSession"
          :get-characters-by-group="actions.getCharactersByGroup"
          :get-char-avatar-by-id="getCharAvatarById"
          :doc-sidebar-state="docSidebarState"
          @update:sidebar-open="actions.updateSidebarOpen"
          @toggle-group-collapse="actions.toggleGroupCollapse"
          @switch-chat="actions.switchChat"
          @switch-session="handleSwitchSession"
          @select-role-character="selectRoleCharacter"
          @open-character-editor="handleOpenCharacterEditor"
          @open-char-group-manager="actions.openCharGroupManager"
          @open-add-character="handleOpenAddCharacter"
          @open-create-group="handleOpenCreateGroup"
          @open-crowd-editor="handleOpenCrowdEditor"
          @open-user-editor="actions.openUserEditor"
          @open-chat-history="actions.openChatHistory"
          @open-chat-utility="$emit('open-chat-utility', $event)"
          @toggle-dark-mode="actions.toggleDarkMode"
          @sort-contacts="actions.openContactSort?.()"
          @reorder-contacts="actions.reorderContacts?.($event)"
          :active-role-unit-id="activeRoleUnitId"
          @create-group-from-contacts="actions.createGroupFromContacts?.($event)"
          @delete-contacts="actions.deleteContacts?.($event)"
          @import-character-core-markdown="actions.importCharacterCoreMarkdown?.($event)"
          @delete-char-group="actions.deleteCharGroup?.($event)"
          @reorder-character-groups="actions.reorderCharacterGroups?.($event)"
          @undo-contact-ops="actions.undoContactOps?.()"
          @redo-contact-ops="actions.redoContactOps?.()"
          @edit-char-group="actions.editCharGroup?.($event)"
          @edit-group="actions.editGroup"
          @edit-crowd="actions.editCrowd"
          @start-resize="startSidebarResizeWithHoverLock"
          @switch-workspace-view="$emit('switch-workspace-view', $event)"
          @select-role-unit="openRoleUnitWindow"
          @role-brain-clipboard-change="handleRoleBrainClipboardChange"
          @open-role-brain-drawer="openRoleBrainDrawer"
          @doc-set-active-tab="handleDocSetActiveTab"
          @doc-toggle-worldbook-tree="handleDocToggleWorldbookTree"
          @doc-expand-worldbook="handleDocExpandWorldbook"
          @doc-collapse-worldbook="handleDocCollapseWorldbook"
          @doc-expand-worldbook-cluster="handleDocExpandWorldbookCluster"
          @doc-expand-worldbook-folder="handleDocExpandWorldbookFolder"
          @doc-collapse-worldbook-cluster="handleDocCollapseWorldbookCluster"
          @doc-export-worldbook-json="handleDocExportWorldbookJson"
          @doc-import-worldbook-json="handleDocImportWorldbookJson"
          @doc-import-worldbook-json-error="handleDocImportWorldbookJsonError"
          @doc-create-cluster="handleDocCreateCluster"
          @doc-create-page="handleDocCreatePage"
          @doc-create-section="handleDocCreateSection"
          @doc-import-world-draft="handleDocImportWorldDraft"
          @doc-undo-worldbook-ops="handleDocUndoWorldbookOps"
          @doc-redo-worldbook-ops="handleDocRedoWorldbookOps"
          @doc-worldbook-cluster-click="handleDocWorldbookClusterClick"
          @doc-worldbook-cluster-toggle="handleDocWorldbookClusterToggle"
          @doc-worldbook-folder-toggle="handleDocWorldbookFolderToggle"
          @doc-worldbook-reorder-clusters="handleDocWorldbookClusterReorder"
          @doc-worldbook-reorder-rows="handleDocWorldbookRowReorder"
          @doc-worldbook-row-click="handleDocWorldbookRowClick"
          @doc-worldbook-menu-action="handleDocWorldbookMenuAction"
          @doc-worldbook-reorder="handleDocWorldbookReorder"
          @doc-worldbook-reorder-folders="handleDocWorldbookFolderReorder"
          @doc-worldbook-move-into="handleDocWorldbookMoveInto"
          @doc-worldbook-drop-rows="handleDocWorldbookRowsDrop"
          @doc-set-relation-tab="handleDocSetRelationTab"
          @doc-prompt-row-click="handleDocPromptRowClick"
          @doc-open-prompt-create="handleDocOpenPromptCreate"
          @doc-toggle-prompt-drag="handleDocTogglePromptDrag"
          @doc-set-prompt-filter="handleDocSetPromptFilter"
          @doc-prompt-reorder="handleDocPromptReorder"
          @contact-dragging-change="handleContactDraggingChange"
        />
      </div>

      <ChatWorkspaceSection
        v-if="workspacePrimaryView === 'chat'"
        :view-model="viewModel"
        :actions="actions"
        :environment-pills="environmentPills"
        :conversation-visual="currentConversationVisual"
        :group-members="currentGroupMembers"
        :reply-preview-name="replyPreview.name"
        :format-chat-text="formatChatText"
        :get-char-avatar="getCharAvatar"
        :get-char-emoji="getCharEmoji"
        :set-messages-area-ref="setMessagesAreaRef"
        :chat-stick-to-bottom="chatStickToBottom"
        :get-displayed-message-content="getDisplayedMessageContent"
        :get-char-name-by-id="getCharNameById"
        :set-menu-container-ref="setMenuContainerRef"
        :set-chat-input-ref="setChatInputRef"
        :allow-summary-action="canUseLocalAdvancedFeatures"
        @open-session-settings="openCurrentSessionSettings"
        @assistant-avatar-click="handleAssistantAvatarClick"
        @open-thinking-panel="handleOpenThinkingPanel"
        @open-personality-orchestration-audit="openOrchestrationAudit"
        @open-notes-panel="openChatNotesSidebar"
        @open-map-viewer="openMapViewer"
        @open-script-workspace="scriptWorkspaceOpen = true"
        @open-status-system-panel="openStatusSystemPanel()"
        @open-prompt-log-panel="handleOpenPromptLogPanel"
        @add-message-note="handleAddMessageNote"
      />
      <!-- 舆图弹窗（地图系统批1·自带 Teleport to body）：外层 v-if=按需加载，关闭即销毁（重开重建场景）。
           批2：传 sessionId 供弹窗自治拉世界真值（世界列表+会话 worldId 都由弹窗自己 fetch，不走 viewModel 透传）。 -->
      <MapViewerDialog
        v-if="mapViewerOpen"
        :open="mapViewerOpen"
        :session-id="String(viewModel.activeSessionId || '')"
        @close="closeMapViewer"
      />
      <ScriptWorkspaceDialog
        v-if="viewModel.activeSessionId"
        :open="scriptWorkspaceOpen && !scriptCoveredByMap"
        :session-id="String(viewModel.activeSessionId || '')"
        @close="scriptWorkspaceOpen = false"
        @open-status="openStatusSystemPanel($event)"
        @open-map="openMapFromScript"
        @curtain-saved="refreshCurtainSessionMeta"
      />
      <!-- 状态系统与舆图/剧本同属大工作区弹窗；组件自带 Teleport 与完整编辑区，不再占用聊天侧栏宽度。 -->
      <ChatStatusSystemPanel
        v-if="viewModel.activeSessionId"
        :open="statusSystemPanelOpen"
        :session-id="String(viewModel.activeSessionId || '')"
        :character-options="statusSystemCharacterOptions"
        :focus-host-id="statusSystemPanelFocusHostId"
        @close="closeStatusSystemDialog"
      />
      <!-- 2026-07-08：桌面「人格模型观察」浮窗随头部入口一并撤下（移动端 MobileChatThread 仍保留自己的入口与面板）。 -->
      <aside
        v-if="workspacePrimaryView === 'chat' && chatNotesSidebarOpen"
        class="prompt-log-sidebar chat-notes-sidebar"
        :style="chatNotesSidebarStyle"
        aria-label="消息笔记侧栏"
      >
        <button
          type="button"
          class="prompt-log-sidebar__resize-handle"
          title="拖动调整笔记宽度"
          aria-label="拖动调整笔记宽度"
          @pointerdown="startChatNotesSidebarResize"
        ></button>
        <header class="prompt-log-sidebar__header">
          <div>
            <strong>笔记</strong>
            <span>{{ chatMessageNotes.length }} 条摘录</span>
          </div>
          <button
            type="button"
            title="关闭笔记"
            aria-label="关闭笔记"
            @click="closeChatNotesSidebar"
          >×</button>
        </header>
        <ChatNotesSidebar
          class="prompt-log-sidebar__panel"
          :notes="chatMessageNotes"
          :loading="chatNotesLoading"
          @jump-message="jumpToMessageNote"
          @copy-note="copyMessageNote"
          @delete-note="deleteMessageNote"
        />
      </aside>
      <aside
        v-else-if="workspacePrimaryView === 'chat' && viewModel.promptLogPanelOpen"
        class="prompt-log-sidebar"
        :style="promptLogSidebarStyle"
        aria-label="提示词日志侧栏"
      >
        <button
          type="button"
          class="prompt-log-sidebar__resize-handle"
          title="拖动调整提示词日志宽度"
          aria-label="拖动调整提示词日志宽度"
          @pointerdown="startPromptLogSidebarResize"
        ></button>
        <header class="prompt-log-sidebar__header">
          <div>
            <strong>提示词日志</strong>
            <span>当前对话的实际出站提示词</span>
          </div>
          <button
            type="button"
            title="关闭提示词日志"
            aria-label="关闭提示词日志"
            @click="closePromptLogSidebar"
          >×</button>
        </header>
        <PromptLogPanel
          class="prompt-log-sidebar__panel"
          :open="Boolean(viewModel.promptLogPanelOpen)"
          :focus-message-id="Number(viewModel.promptLogFocusMessageId || 0)"
        />
      </aside>

      <!-- 提调带面板挤压侧栏（2026-07-10 四面板统一·仿 PromptLogPanel 壳·面板自带头部关闭·同 orchestration audit 范式）：
           打开态在模块桥 tidiaoPanelSidebarTarget（带子点场记/剧本/待办/资料池写入·getter 保活动带实时刷新），
           按 kind 渲染对应面板（窄化 computed 保 TS 类型），四面板共用同一壳与宽度真值。 -->
      <aside
        v-else-if="workspacePrimaryView === 'chat' && tidiaoPanelSidebarTarget"
        class="prompt-log-sidebar director-state-sidebar"
        :style="directorStateSidebarStyle"
        :aria-label="tidiaoPanelSidebarAriaLabel"
      >
        <button
          type="button"
          class="prompt-log-sidebar__resize-handle"
          title="拖动调整侧栏宽度"
          aria-label="拖动调整侧栏宽度"
          @pointerdown="startDirectorStateSidebarResize"
        ></button>
        <DirectorStateInspector
          v-if="tidiaoStatePanelTarget"
          class="prompt-log-sidebar__panel"
          variant="inline"
          :stream="tidiaoStatePanelTarget.getStream()"
          :shot-details="tidiaoStatePanelTarget.getShotDetails()"
          :memory-projection="tidiaoStatePanelTarget.getMemoryProjection()"
          @close="closeTidiaoPanelSidebar"
        />
        <RoundRecallPoolPanel
          v-else-if="tidiaoPoolPanelTarget"
          class="prompt-log-sidebar__panel"
          variant="inline"
          :pools="tidiaoPoolPanelTarget.getPools()"
          :session-id="tidiaoPoolPanelTarget.getSessionId()"
          :cast-character-ids="tidiaoPoolPanelTarget.getCastCharacterIds()"
          :resolve-name="tidiaoPoolPanelTarget.getResolveName()"
          @close="closeTidiaoPanelSidebar"
        />
      </aside>

      <aside
        v-else-if="workspacePrimaryView === 'chat' && canUseLocalAdvancedFeatures && orchestrationAuditOpen"
        class="prompt-log-sidebar orchestration-audit-sidebar"
        :style="orchestrationAuditSidebarStyle"
        aria-label="人格模型编排审计侧栏"
      >
        <button
          type="button"
          class="prompt-log-sidebar__resize-handle"
          title="拖动调整编排审计宽度"
          aria-label="拖动调整编排审计宽度"
          @pointerdown="startOrchestrationAuditSidebarResize"
        ></button>
        <PersonalityModelOrchestrationAuditPanel
          class="prompt-log-sidebar__panel"
          :session-id="String(viewModel.activeSessionId || '')"
          :selected-message-id="orchestrationAuditMessageId"
          :runtime-orchestration="orchestrationAuditRuntime"
          @close="closeOrchestrationAudit"
        />
      </aside>

      <aside
        v-else-if="workspacePrimaryView === 'chat' && recallTraceState.sidebarOpen.value"
        class="recall-activity-sidebar"
        :style="recallActivitySidebarStyle"
        aria-label="处理过程侧栏"
      >
        <button
          type="button"
          class="recall-activity-sidebar__resize-handle"
          title="拖动调整召回面板宽度"
          aria-label="拖动调整召回面板宽度"
          @pointerdown="startRecallActivitySidebarResize"
        ></button>
        <div class="recall-activity-sidebar__content">
          <RecallTracePanel
            :thinking-text="viewModel.streamingText"
            :thinking-panel-text="selectedThinkingPanel.text"
            :thinking-speaker-name="selectedThinkingPanel.speakerName || viewModel.currentStreamingSpeakerName || viewModel.currentChatTitle"
            :is-thinking="selectedThinkingPanel.isThinking"
            :message-navigation-items="recallActivityNavigationItems"
            :active-message-id="selectedThinkingPanel.messageId"
            :cache-scope-key="viewModel.activeSessionId || ''"
            :can-use-detail-panel="canUseLocalAdvancedFeatures"
            :resolve-unit-preview="resolveRecallUnitPreview"
            @select-message="openRecallActivityForMessageId"
            @jump-unit="openRecallConfirmedUnit"
          />
          <Transition name="recall-activity-loading-fade">
            <div v-if="recallActivityPanelLoading" class="recall-activity-sidebar__loading" role="status" aria-live="polite">
              <div class="recall-activity-sidebar__loading-mark">
                <LanghuanLoadingMark
                  class="recall-activity-sidebar__loading-icon"
                  size="clamp(48px, 8vw, 72px)"
                  :stroke-scale="0.95"
                  :blur-rest-opacity="0.08"
                  :blur-peak-opacity="0.22"
                  title="正在载入召回面板"
                />
              </div>
            </div>
          </Transition>
        </div>
      </aside>

      <div
        v-else-if="workspacePrimaryView === 'roles'"
        class="chat-main role-main"
        :class="{ 'role-main--hydrating': isRoleBrainWorkspaceHydrating }"
        :aria-busy="isRoleBrainWorkspaceHydrating ? 'true' : 'false'"
      >
        <aside
          v-if="selectedRoleEntity && roleBrainDrawerOpen"
          class="role-brain-drawer"
          :style="roleBrainDrawerStyle"
          aria-label="角色大脑"
        >
          <section class="role-brain-drawer__panel">
            <div class="role-brain-drawer__header">
              <div class="role-brain-drawer__identity">
                <div class="role-brain-drawer__avatar">
                  <img v-if="selectedRoleAvatar" :src="selectedRoleAvatar" alt="">
                  <span v-else>{{ selectedRoleEmoji || '角' }}</span>
                </div>
                <div class="role-brain-drawer__identity-main">
                  <div class="role-brain-drawer__name">{{ selectedRoleEntity.name || '未命名角色' }}</div>
                  <div class="role-brain-drawer__meta">{{ selectedRoleEntity.gender || '未知' }} {{ selectedRoleEntity.age || '' }}</div>
                </div>
              </div>
              <button
                type="button"
                class="role-brain-drawer__edit"
                title="编辑角色资料"
                aria-label="编辑角色资料"
                @click.stop="openSelectedRoleEditor"
              >
                <svg class="role-brain-drawer__edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
            <dl class="role-brain-drawer__stats" aria-label="大脑神经元统计">
              <div v-for="stat in selectedRoleNeuronStats" :key="stat.label">
                <dt>{{ stat.label }}</dt>
                <dd>{{ stat.value }}</dd>
              </div>
            </dl>
          </section>
          <RoleBrainSidebarTree
            class="role-brain-drawer__tree"
            :entity="selectedRoleEntity"
            :active-unit-id="activeRoleUnitId"
            :root-unit-types="['core', 'soul', 'trace']"
            @select-unit="openRoleUnitWindow"
            @open-created-unit="openCreatedRoleUnitEditor"
            @clipboard-change="handleRoleBrainClipboardChange"
            @expanded-change="handleRoleBrainTreeExpandedChange"
            @import-save-success="toast($event, 'success')"
            @import-save-error="toast($event, 'error')"
          />
          <button
            v-if="isDesktopViewport"
            type="button"
            class="role-brain-drawer__resize-handle"
            title="拖动调整角色大脑宽度"
            aria-label="拖动调整角色大脑宽度"
            @pointerdown="startRoleBrainDrawerResize"
          ></button>
        </aside>
        <AppWorkspaceShell
          v-if="selectedRoleEntity && roleBrainDrawerOpen"
          :windows="roleWorkspaceWindows"
          :active-window-id="activeRoleWorkspaceWindowId"
          :get-window-style="getRoleWorkspaceWindowStyle"
          draggable-tabs
          hide-tabs
          aria-label="角色工作区窗口"
          @activate="activateRoleWorkspaceWindow"
          @close-window="closeRoleWorkspaceWindow"
          @tab-drag-start="handleRoleWindowTabDragStart"
          @tab-drop="handleRoleWindowTabDrop"
          @tab-drag-end="handleRoleWindowTabDragEnd"
          @split-resize="startRoleWorkspaceSplitResize"
        >
          <template #default="{ window }">
            <RoleUnitFormWorkspace
              v-if="window.kind === 'form' && hasRoleUnitFormFields(window.sourceId || '') && !canEditRoleUnitDocument(window.sourceId || '')"
              :title="getRoleUnitTitle(window.sourceId || '')"
              :fields="getRoleUnitFormFields(window.sourceId || '')"
              :draft="getRoleFormDraft(window.sourceId || '')"
              :api-presets="apiPresets"
              :model-options="getRoleFormModelOptions(window.sourceId || '')"
              :show-custom-model="shouldShowRoleCustomModel(window.sourceId || '')"
              :model-loading="modelLoadingRoleUnitId === window.sourceId"
              :compact="shouldUseCompactRoleForm(window.sourceId || '')"
              @save="saveRoleUnitForm(window.sourceId || '')"
              @update-field="(fieldKey, value) => updateRoleFormDraftValue(window.sourceId || '', fieldKey, value)"
              @load-models="loadRoleUnitPresetModels(window.sourceId || '')"
            />
            <RoleDocumentEditorWorkspace
              v-else-if="window.kind === 'form' && canEditRoleUnitDocument(window.sourceId || '')"
              :ref="(el) => setRoleDocumentEditorRef(window.sourceId || '', el)"
              :path-parts="getRoleUnitPathParts(window.sourceId || '')"
              :title="getRoleFormDraftValue(window.sourceId || '', 'documentTitle')"
              :subtitle="getRoleFormDraftValue(window.sourceId || '', 'documentSubtitle')"
              :show-subtitle="shouldShowRoleDocumentSubtitle(window.sourceId || '')"
              :title-readonly="isRoleDocumentTitleReadonly(window.sourceId || '')"
              :content="getRoleFormDraftValue(window.sourceId || '', 'documentContent')"
              :compile-page="getRoleCompileDraft(window.sourceId || '')"
              :arrangement-settings="getRoleArrangementSettings(window.sourceId || '')"
              :relation-validation-items="getRoleCompileValidationItems(window.sourceId || '')"
              @update:title="updateRoleFormDraftValue(window.sourceId || '', 'documentTitle', $event)"
              @update:subtitle="updateRoleFormDraftValue(window.sourceId || '', 'documentSubtitle', $event)"
              @update:content="updateRoleFormDraftValue(window.sourceId || '', 'documentContent', $event)"
              @update:compile-page="updateRoleCompileDraft(window.sourceId || '', $event)"
              @update:arrangement-settings="updateRoleArrangementSettings(window.sourceId || '', $event)"
              @open-compile-page="openRoleCompilePageDialog(window.sourceId || '')"
              @wrap-selection="wrapRoleDocumentSelection(window.sourceId || '', $event)"
              @insert-heading="insertRoleDocumentHeading(window.sourceId || '', $event)"
              @insert-link="insertRoleDocumentLink(window.sourceId || '')"
              @insert-table="insertRoleDocumentTable(window.sourceId || '')"
              @insert-code-block="insertRoleDocumentCodeBlock(window.sourceId || '')"
              @insert-image="insertRoleDocumentImage(window.sourceId || '')"
              @undo-draft="undoRoleDocumentDraft(window.sourceId || '')"
              @redo-draft="redoRoleDocumentDraft(window.sourceId || '')"
              @save="saveRoleUnitForm(window.sourceId || '')"
              @editor-scroll="syncRoleDocumentScrollFromEditor(window.sourceId || '')"
            />
            <CharacterBrainUnitReadPane
              v-else-if="getRoleUnitContentPort(window.sourceId || '')"
              :port="getRoleUnitContentPort(window.sourceId || '')!"
              :path-parts="getRoleUnitPathParts(window.sourceId || '')"
              :relation-validation-items="getRoleCompileValidationItems(window.sourceId || '')"
              @open-compile-page="openRoleCompilePageDialog(window.sourceId || '')"
              @confirm-pending="confirmRolePendingVersion(window.sourceId || '')"
              @reject-pending="rejectRolePendingVersion(window.sourceId || '')"
              @edit-pending="openRoleUnitWindow(window.sourceId || '', 'form')"
            >
              <template v-if="roleAuxPanelMode === 'none'" #actions>
                <button type="button" class="app-workspace-shell__tool role-unit-action" title="编辑当前簇枝桠" aria-label="编辑当前簇枝桠" @click="openRoleUnitWindow(window.sourceId || '', 'form')">
                  <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                  </svg>
                  <span class="role-unit-action__label">编辑</span>
                </button>
                <button type="button" class="app-workspace-shell__tool role-unit-action role-unit-action--relation" title="打开关系视图" aria-label="打开关系视图" @click="openRoleRelationPanel(window.sourceId || '')">
                  <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="16" y="16" width="6" height="6" rx="1"/>
                    <rect x="2" y="16" width="6" height="6" rx="1"/>
                    <rect x="9" y="2" width="6" height="6" rx="1"/>
                    <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                    <path d="M12 12V8"/>
                  </svg>
                  <span class="role-unit-action__label">关系视图</span>
                </button>
              </template>
            </CharacterBrainUnitReadPane>
            <AppWorkspaceReadPane
              v-else
              :path-parts="getRoleUnitPathParts(window.sourceId || '')"
              :meta="getRoleUnitKindLabel(window.sourceId || '')"
              :html="renderRoleUnitMarkdown(window.sourceId || '')"
              empty-text="当前簇枝桠还没有正文。"
            >
              <template v-if="roleAuxPanelMode === 'none'" #actions>
                <button type="button" class="app-workspace-shell__tool role-unit-action" title="编辑当前簇枝桠" aria-label="编辑当前簇枝桠" @click="openRoleUnitWindow(window.sourceId || '', 'form')">
                  <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                  </svg>
                  <span class="role-unit-action__label">编辑</span>
                </button>
                <button type="button" class="app-workspace-shell__tool role-unit-action role-unit-action--relation" title="打开关系视图" aria-label="打开关系视图" @click="openRoleRelationPanel(window.sourceId || '')">
                  <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="16" y="16" width="6" height="6" rx="1"/>
                    <rect x="2" y="16" width="6" height="6" rx="1"/>
                    <rect x="9" y="2" width="6" height="6" rx="1"/>
                    <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                    <path d="M12 12V8"/>
                  </svg>
                  <span class="role-unit-action__label">关系视图</span>
                </button>
              </template>
            </AppWorkspaceReadPane>
          </template>

          <template #empty>
            <section class="role-main__empty role-main__empty--brain-open">
              <div class="role-main__empty-inner">
                <svg class="role-main__empty-book role-main__empty-branch" viewBox="0 0 120 96" aria-hidden="true">
                  <path d="M60 82V34M60 46 39 27M60 58l24-23M39 27l-18-8M39 27l-4-17M84 35l17-8M84 35l4-18" />
                  <circle cx="21" cy="19" r="7" /><circle cx="35" cy="10" r="7" /><circle cx="101" cy="27" r="7" /><circle cx="88" cy="17" r="7" />
                  <path d="M32 84h56" />
                </svg>
                <div class="role-main__empty-copy">
                  <div class="role-main__empty-title">{{ selectedRoleEntity.name || '角色' }}</div>
                  <div class="role-main__empty-text">在左侧角色大脑中选择一个簇枝桠</div>
                </div>
                <div class="role-main__empty-features role-main__empty-features--compact" aria-label="角色大脑分区提示">
                  <div class="role-main__empty-feature">
                    <span class="role-main__empty-feature-heading">
                      <span class="role-main__empty-feature-mark role-main__empty-feature-mark--core" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M12 4.8L18.2 15.5H5.8L12 4.8Z"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linejoin="round"
                            stroke-linecap="round"
                          />
                          <path
                            d="M12 19.2L5.8 8.5H18.2L12 19.2Z"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linejoin="round"
                            stroke-linecap="round"
                          />
                        </svg>
                      </span>
                      <span class="role-main__empty-feature-title">核心</span>
                    </span>
                    <span class="role-main__empty-feature-desc">阅读基础设定与身份资料</span>
                  </div>
                  <div class="role-main__empty-feature">
                    <span class="role-main__empty-feature-heading">
                      <span class="role-main__empty-feature-mark role-main__empty-feature-mark--soul" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="6.7" stroke="currentColor" stroke-width="1.5" />
                          <path
                            d="M12 8.2L13.2 10.8L15.8 12L13.2 13.2L12 15.8L10.8 13.2L8.2 12L10.8 10.8L12 8.2Z"
                            stroke="currentColor"
                            stroke-width="1.4"
                            stroke-linejoin="round"
                          />
                          <path d="M12 5.2V6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                          <path d="M12 17.6V18.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                          <path d="M5.2 12H6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                          <path d="M17.6 12H18.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                        </svg>
                      </span>
                      <span class="role-main__empty-feature-title">灵魂</span>
                    </span>
                    <span class="role-main__empty-feature-desc">整理理解、记忆与私有文档</span>
                  </div>
                  <div class="role-main__empty-feature">
                    <span class="role-main__empty-feature-heading">
                      <span class="role-main__empty-feature-mark role-main__empty-feature-mark--trace" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 17.8C7.2 15.4 8.8 14.2 10.8 14.2C12.5 14.2 13.1 15.8 14.7 15.8C16.8 15.8 17.5 12.3 19 9"
                            stroke="currentColor"
                            stroke-width="1.7"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <circle cx="5" cy="17.8" r="1.6" fill="currentColor" />
                          <circle cx="19" cy="9" r="1.6" fill="currentColor" />
                        </svg>
                      </span>
                      <span class="role-main__empty-feature-title">轨迹</span>
                    </span>
                    <span class="role-main__empty-feature-desc">查看事件、时间与关系变化</span>
                  </div>
                </div>
                <div class="role-main__empty-guide role-main__empty-guide--brain-open" aria-hidden="true">
                  <svg class="role-main__empty-arrow" viewBox="0 0 120 42" aria-hidden="true"><path d="M112 8C81 8 60 20 27 31" /><path d="m35 20-10 12 16 3" /></svg>
                  <span>从左侧角色大脑开始</span>
                </div>
              </div>
            </section>
          </template>

        </AppWorkspaceShell>
        <aside
          v-if="selectedRoleEntity && roleAuxPanelMounted"
          v-show="roleAuxPanelMode !== 'none'"
          class="role-aux-panel"
          :class="`role-aux-panel--${roleAuxPanelMode}`"
          :style="roleAuxPanelStyle"
        >
          <button
            v-if="isDesktopViewport"
            type="button"
            class="role-aux-panel__resize-handle"
            title="拖动调整右侧面板宽度"
            aria-label="拖动调整右侧面板宽度"
            @pointerdown="startRoleAuxPanelResize"
          ></button>
          <header class="role-aux-panel__header">
            <div v-if="activeRoleDocumentEditorUnitId" class="role-aux-panel__actions role-aux-panel__actions--mode" aria-label="右侧面板切换">
              <button
                type="button"
                class="app-workspace-shell__tool role-unit-action"
                :class="{ active: roleAuxPanelMode === 'preview' }"
                title="查看渲染预览"
                aria-label="查看渲染预览"
                @click="openRolePreviewPanel(activeRoleDocumentEditorUnitId)"
              >
                <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span class="role-unit-action__label">渲染</span>
              </button>
              <button
                type="button"
                class="app-workspace-shell__tool role-unit-action role-unit-action--relation"
                :class="{ active: roleAuxPanelMode === 'relation' }"
                title="打开关系视图"
                aria-label="打开关系视图"
                @click="openRoleRelationPanel(activeRoleDocumentEditorUnitId)"
              >
                <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="16" y="16" width="6" height="6" rx="1"/>
                  <rect x="2" y="16" width="6" height="6" rx="1"/>
                  <rect x="9" y="2" width="6" height="6" rx="1"/>
                  <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                  <path d="M12 12V8"/>
                </svg>
                <span class="role-unit-action__label">关系视图</span>
              </button>
            </div>
            <div v-else-if="roleAuxPanelMode === 'relation' && roleRelationUnit" class="role-aux-panel__actions">
              <button type="button" class="app-workspace-shell__tool role-unit-action" title="编辑当前簇枝桠" aria-label="编辑当前簇枝桠" @click="openRoleUnitWindow(roleRelationUnit.unitId, 'form')">
                <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                </svg>
                <span class="role-unit-action__label">编辑</span>
              </button>
              <button type="button" class="app-workspace-shell__tool role-unit-action role-unit-action--relation active" title="当前为关系视图" aria-label="当前为关系视图" @click="openRoleRelationPanel(roleRelationUnit.unitId)">
                <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="16" y="16" width="6" height="6" rx="1"/>
                  <rect x="2" y="16" width="6" height="6" rx="1"/>
                  <rect x="9" y="2" width="6" height="6" rx="1"/>
                  <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                  <path d="M12 12V8"/>
                </svg>
                <span class="role-unit-action__label">关系视图</span>
              </button>
            </div>
            <button
              type="button"
              class="role-aux-panel__close"
              title="关闭右侧面板"
              aria-label="关闭右侧面板"
              @click="closeRoleAuxPanel"
            >
              <svg class="role-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>
          </header>
          <RoleDocumentPreviewPane
            v-if="rolePreviewPanelMounted"
            v-show="roleAuxPanelMode === 'preview'"
            :ref="(el) => setRoleDocumentPreviewPaneRef(activeRoleDocumentEditorUnitId, el)"
            :html="renderRoleDocumentPreviewHtml(activeRoleDocumentEditorUnitId)"
            @preview-scroll="syncRoleDocumentScrollFromPreview(activeRoleDocumentEditorUnitId)"
          />
          <section
            v-if="roleRelationPanelMounted"
            v-show="roleAuxPanelMode === 'relation'"
            class="role-aux-panel__relation-body"
          >
            <div class="role-aux-panel__relation-graph">
              <RoleRelationBrainView
                v-if="roleRelationPanelReady && roleRelationUnit"
                :character-id="selectedRoleCharacterId"
                :active-unit="roleRelationUnit"
                :units="roleUnitView.units"
                :relations="roleUnitView.relations"
                :clipboard-mode="roleBrainClipboard.mode"
                :clipboard-unit-ids="roleBrainClipboard.unitIds"
                :trajectory-expanded-unit-ids="roleBrainExpandedUnitIds"
                @open-unit="handleRoleRelationOpenUnit"
                @ready="finishRoleRelationPanelLoad"
              />
              <Transition name="role-relation-loading-fade">
                <div v-if="roleRelationPanelLoading" class="role-aux-panel__loading" role="status" aria-live="polite">
                  <div class="role-aux-panel__loading-mark">
                    <LanghuanLoadingMark
                      class="role-aux-panel__loading-icon"
                      size="clamp(48px, 8vw, 72px)"
                      :stroke-scale="0.95"
                      :blur-rest-opacity="0.08"
                      :blur-peak-opacity="0.22"
                      title="正在载入关系视图"
                    />
                  </div>
                </div>
              </Transition>
            </div>
          </section>
        </aside>
        <RecallCompilePageConflictDialog
          :open="isRoleCompilePageDialogOpen"
          :model-value="activeRoleCompilePageModel"
          :semantic-type="activeRoleCompileSemanticType"
          :relation-validation-items="activeRoleCompileValidationItems"
          :relation-reference-candidates="roleRelationHintReferenceCandidates"
          :unit-title="activeRoleCompileUnitTitle"
          :unit-path="activeRoleCompileUnitPath"
          @update:model-value="updateActiveRoleCompileDraft"
          @update:semantic-type="updateActiveRoleCompileSemanticType"
          @close="closeRoleCompilePageDialog"
          @save-draft="saveRoleCompilePageDialogDraft"
          @save-apply="saveRoleCompilePageDialogApply"
          @revalidate="revalidateRoleCompilePageDialog"
          @edit-related-unit="openRoleUnitWindow($event, 'form')"
          @delete-related-unit="openRoleUnitWindow($event, 'viewer')"
          @edit-duplicate-relation-hint="editRoleDuplicateRelationHint"
          @delete-duplicate-relation-hint="deleteRoleDuplicateRelationHint"
          @delete-all-duplicate-relation-hints="deleteAllRoleDuplicateRelationHints"
        />
        <section v-if="!selectedRoleEntity || !roleBrainDrawerOpen" class="role-main__empty role-main__empty--no-role">
          <svg class="role-main__empty-book" viewBox="0 0 160 112" aria-hidden="true">
            <path d="M80 93c-17-13-36-18-60-15V23c24-3 43 2 60 15v55Z" />
            <path d="M80 93c17-13 36-18 60-15V23c-24-3-43 2-60 15v55Z" />
            <path d="M34 43c12 0 22 3 32 9M34 58c12 0 22 3 32 9M126 43c-12 0-22 3-32 9M126 58c-12 0-22 3-32 9" />
          </svg>
          <div class="role-main__empty-copy">
            <div class="role-main__empty-title">请选择角色</div>
            <div class="role-main__empty-text">选择角色后进入「角色大脑」与编辑工作台</div>
          </div>
          <div class="role-main__empty-features" aria-label="角色页能力提示">
            <div class="role-main__empty-feature">
              <span class="role-main__empty-feature-heading">
                <span class="role-main__empty-feature-mark" aria-hidden="true">◇</span>
                <span class="role-main__empty-feature-title">深入理解角色</span>
              </span>
              <span class="role-main__empty-feature-desc">查看完整的角色背景与设定</span>
            </div>
            <div class="role-main__empty-feature">
              <span class="role-main__empty-feature-heading">
                <span class="role-main__empty-feature-mark" aria-hidden="true">◎</span>
                <span class="role-main__empty-feature-title">可视化角色大脑</span>
              </span>
              <span class="role-main__empty-feature-desc">探索角色的思维与记忆网络</span>
            </div>
            <div class="role-main__empty-feature">
              <span class="role-main__empty-feature-heading">
                <span class="role-main__empty-feature-mark" aria-hidden="true">✎</span>
                <span class="role-main__empty-feature-title">编辑与优化</span>
              </span>
              <span class="role-main__empty-feature-desc">随时调整设定与行为准则</span>
            </div>
          </div>
          <div class="role-main__empty-guide" aria-hidden="true">
            <svg class="role-main__empty-arrow" viewBox="0 0 120 42" aria-hidden="true"><path d="M112 8C81 8 60 20 27 31" /><path d="m35 20-10 12 16 3" /></svg>
            <span>从左侧选择一个角色，开启探索之旅吧～</span>
          </div>
        </section>
      </div>

      <DocWorkspaceSection
        :opened="hasOpenedDocWorkspace"
        :active="workspacePrimaryView === 'docs'"
        :set-doc-library-ref="setDocLibraryRef"
        @sidebar-state-change="handleDocWorkspaceSidebarStateChange"
      />
      <AppApiConfigSection
        v-if="workspacePrimaryView === 'config'"
        class="api-config-workspace-page"
        :view-model="apiConfigViewModel"
        :actions="apiConfigActions"
        @close="$emit('switch-workspace-view', 'chat')"
      />
      <AppDataManagePage
        v-if="workspacePrimaryView === 'data'"
      />
      <WorldManagerSection
        v-if="workspacePrimaryView === 'worlds'"
        :chat-session-rows="viewModel.chatSessionRows || []"
        @close="$emit('switch-workspace-view', 'chat')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import type { ApiConfigPanelActions, ApiConfigPanelViewModel, ChatMessageNoteCreatePayload, ChatPanelActions, ChatPanelViewModel, ChatUtilityPanelId, EnvironmentViewModel, NamedEntity, PanelEntityRef } from '../../../types/panelContracts'
import type { WorkspaceWindowRecord } from '../../../app/workspaceWindowProtocol'
import type { UseStickToBottomResult } from '../../../composables/useStickToBottom'
import { buildCharacterBrainSidebarShellUnitView, buildCharacterBrainUnitView } from '../../../app/unitViewAdapters'
import { buildCharacterBrainContentPorts } from '../../../app/unitContentPort'
import { createProgressiveHydrationController, type ProgressiveHydrationStage } from '../../../app/progressiveHydration'
import { resolveCreatedRoleUnitId } from '../../../app/roleCreatedUnitNavigation'
import {
  applyCharacterBrainCardDraft,
  buildCharacterBrainCard,
  readCharacterBrainCognitionNodes,
  readCharacterBrainCompilePage,
  readCharacterBrainTraceNodes
} from '../../../app/characterBrain'
import {
  confirmCharacterBrainPendingVersion,
  rejectCharacterBrainPendingVersion
} from '../../../app/characterBrainTreeModel'
import {
  activateWorkspaceWindow,
  closeWorkspaceWindow,
  createUnitWorkspaceWindow,
  createWorkspaceWindowState,
  getWorkspaceWindowFlexStyle,
  reorderWorkspaceWindow,
  resizeWorkspaceWindow
} from '../../../app/workspaceWindowProtocol'
import { useResizablePanel } from '../../../composables/app/useResizablePanel'
import { useCharacterStore } from '../../../stores/characterStore'
import { useChatStore } from '../../../stores/chatStore'
import { useSettingStore } from '../../../stores/settingStore'
import { useWorkspaceRuntimeStore } from '../../../app/workspaceRuntimeStore'
import { useToast } from '../../../composables/useToast'
import { handleWorkspaceSaveShortcut } from '../../../composables/useWorkspaceSaveShortcut'
import { createDraftSaveVersionGuard } from '../../../app/draftSaveVersions'
import RoleRelationBrainView from '../RoleRelationBrainView.vue'
import RoleBrainSidebarTree from '../RoleBrainSidebarTree.vue'
import LanghuanLoadingMark from '../../common/LanghuanLoadingMark.vue'
import CharacterBrainUnitReadPane from '../../brain/CharacterBrainUnitReadPane.vue'
import AppWorkspaceShell from '../../common/AppWorkspaceShell.vue'
import AppWorkspaceReadPane from '../../common/AppWorkspaceReadPane.vue'
import RoleUnitFormWorkspace from '../roles/RoleUnitFormWorkspace.vue'
import RoleDocumentEditorWorkspace, { type RoleArrangementEditorSettings } from '../roles/RoleDocumentEditorWorkspace.vue'
import RoleDocumentPreviewPane from '../roles/RoleDocumentPreviewPane.vue'
import RecallCompilePageConflictDialog from '../../recall/RecallCompilePageConflictDialog.vue'
import ChatWorkspaceSection from './ChatWorkspaceSection.vue'
import PromptLogPanel from './PromptLogPanel.vue'
import RecallTracePanel from './RecallTracePanel.vue'
import ChatNotesSidebar from './ChatNotesSidebar.vue'
// 状态系统面板（对话级·2026-07-08 批次2）：头部「状态」按钮唤出的模板+实例管理弹窗。
import ChatStatusSystemPanel from './ChatStatusSystemPanel.vue'
// 舆图弹窗（地图系统批1）：懒加载——渲染器+样例世界只在首次打开时拉取。
const MapViewerDialog = defineAsyncComponent(() => import('../map/MapViewerDialog.vue'))
const ScriptWorkspaceDialog = defineAsyncComponent(() => import('../script/ScriptWorkspaceDialog.vue'))
import { OPEN_STATUS_SYSTEM_PANEL_EVENT } from '../../../app/statusSystemPresets'
// 提调带面板挤压侧栏（2026-07-10 四面板统一·前身=批次G state 专用）：带子（消息流深层）经模块桥请求打开，
// 这里按 kind 渲染场记/剧本/待办/资料池四面板之一（inline 形态·不遮盖聊天区·同一 aside 壳与宽度真值）。
import DirectorStateInspector from './DirectorStateInspector.vue'
import RoundRecallPoolPanel from './RoundRecallPoolPanel.vue'
import { closeTidiaoPanelSidebar, tidiaoPanelSidebarTarget } from '../../../app/tidiaoPanelSidebarState'
import PersonalityModelOrchestrationAuditPanel from './PersonalityModelOrchestrationAuditPanel.vue'
import DocWorkspaceSection from './DocWorkspaceSection.vue'
import AppDataManagePage from '../pages/AppDataManagePage.vue'
import AppApiConfigSection from '../sections/AppApiConfigSection.vue'
// 世界管理页（世界一等公民 P1 批2）：顶层工作区视图 'worlds'，与 config/data 同级——不再是自治弹窗
import WorldManagerSection from '../world/WorldManagerSection.vue'
import { API } from '../../../config/api'
import { prefetchDocLibraryState } from '../../../repositories/docBrainRepository'
import type { DocLibraryModuleTab } from '../../../app/docLibraryModules'
import { renderMarkdownToHtml } from '../../../utils/markdown'
import { syncScrollByRatio } from '../../../utils/syncedScroll'
import { stripAiThoughtContent } from '../../../utils/aiOutput'
import { isPublicRecallEvent } from '../../../app/recallPublicMilestones'
import { resolveChatMessageSpeakerName } from '../../../app/chatMessageSpeaker'
import { clearTidiaoDirectorStreamRoundIfOtherSession } from '../../../app/tidiaoDirectorStreamState'
import {
  clearRecallActivityIfBoundToOtherSession,
  setCurrentRecallActivity,
  setRecallActivityPanelBinding,
  showActiveRecallActivityInPanel,
  showRecallActivityRunInPanel,
  useRecallTraceState,
  type RecallActivityRun
} from '../../../app/recallTraceState'
import {
  createChatMessageNoteBySessionId,
  deleteChatMessageNoteBySessionId,
  fetchChatMessageNotesBySessionId,
  loadAllChatRecallActivityLogsBySessionId,
  locateChatRecallActivityLogBySessionId
} from '../../../repositories/chatRepository'
import type { ApiPreset, Character, ChatMessageNote, ChatRecallActivityLogEntry } from '../../../types'
import type { CharacterBrainCardFormField } from '../../../types/characterBrain'
import type { UnitViewCompilePage } from '../../../types/unitView'
import type { UnitViewAdapterResult } from '../../../types/unitView'
import type { UnitContentPort } from '../../../types/unitContentPort'
import type { RecallActivityUnitRef, UnitSemanticType } from '../../../types/docBrain'
import {
  buildRelationHintValidationItems,
  buildRelationSystemReadModel,
  type CompileRelationIssue,
  type CompileRelationIssueDuplicateEvidence
} from '../../../app/relationSystem'
import {
  formatRelationHintReferenceTitle,
  getUnitRelationRefId
} from '../../../app/relationHintReference'
import { normalizeUnitSemanticType } from '../../../app/unitSemanticTypes'

const AppChatSidebar = defineAsyncComponent(() => import('../AppChatSidebar.vue'))
const loadDocLibraryComponent = () => import('../../DocLibrary.vue')
const runtimeStore = useWorkspaceRuntimeStore()
const characterStore = useCharacterStore()
const chatStore = useChatStore()
const settingStore = useSettingStore()
const { toast } = useToast(runtimeStore)

type RefTarget = Element | ComponentPublicInstance | null
type DocSidebarRow = {
  id: string
  kind: 'folder' | 'document'
  label: string
  depth: number
  clusterId: string
  folderId?: string
  itemId?: string
  parentFolderId: string
  open?: boolean
  active?: boolean
  selected?: boolean
}
type DocSidebarCluster = {
  id: string
  label: string
  open: boolean
  count: number
}
type PromptSidebarRow = {
  id: string
  group: string
  groupLabel: string
  title: string
  meta: string
  enabled: boolean
  active: boolean
  recordKind: 'preset' | 'legacy'
}
type RelationPanelTab = 'predicates' | 'candidates' | 'confirmed'
type DocSidebarState = {
  activeTab: DocLibraryModuleTab
  worldbook: {
    treeVisible: boolean
    clusters: DocSidebarCluster[]
    selectedCount: number
    clipboardMode: '' | 'copy' | 'cut'
    clipboardHasData: boolean
    rows: DocSidebarRow[]
    rowsByCluster: Record<string, DocSidebarRow[]>
  }
  prompt: {
    selectedId: string
    totalCount: number
    dragEnabled?: boolean
    filterMode?: 'all' | 'required'
    rows: PromptSidebarRow[]
  }
  relation: {
    activeTab: RelationPanelTab
    predicatesCount: number
    candidatesCount: number
    confirmedCount: number
  }
}
type DocLibraryExpose = {
  setActiveLibraryTab?: (tab: DocSidebarState['activeTab']) => void
  setRelationTab?: (tab: RelationPanelTab) => void
  toggleWorldbookTreeVisible?: () => void
  toggleWorldbookCluster?: (clusterId: string) => void
  toggleWorldbookFolder?: (folderId: string) => void
  expandWorldbookCluster?: (clusterId: string) => void
  expandWorldbookFolder?: (folderId: string) => void
  collapseWorldbookCluster?: (clusterId: string) => void
  expandAllFolders?: () => void
  collapseAllFolders?: () => void
  exportWorldbookJson?: () => void
  queueImportWorldbookJson?: (payload: unknown) => void
  handleWorldbookJsonTransferError?: (message: string) => void
  createCluster?: () => void
  createPage?: () => void
  createSection?: () => void
  createPageFromTreeToolbar?: () => void
  createSectionFromTreeToolbar?: () => void
  openWorldDraftImportDialog?: () => void
  sortDocuments?: () => void
  undoWorldbookOps?: () => void
  redoWorldbookOps?: () => void
  reorderWorldbookClusters?: (payload: { clusterIds: string[]; targetId: string; position?: 'before' | 'after' }) => void
  reorderWorldbookSidebarRows?: (payload: { rowIds: string[]; targetId: string; position?: 'before' | 'after' }) => void
  handleWorldbookSidebarClusterClick?: (payload: { clusterId: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void
  handleWorldbookSidebarRowClick?: (payload: { kind: 'folder' | 'document'; folderId?: string; itemId?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void
  runWorldbookSidebarMenuAction?: (action: string, payload: { kind: 'folder' | 'document'; folderId?: string; itemId?: string }) => void
  reorderWorldbookSidebarItems?: (payload: { itemIds: string[]; targetId: string; position?: 'before' | 'after' }) => void
  reorderWorldbookSidebarFolders?: (payload: { folderIds: string[]; targetId: string; parentFolderId?: string; position?: 'before' | 'after' }) => void
  moveWorldbookRowsInto?: (payload: { rowKind: 'document' | 'folder' | 'cluster'; ids: string[]; targetKind: 'folder' | 'cluster'; targetId: string }) => void
  dropWorldbookRows?: (payload: { rowKind: 'document' | 'folder' | 'cluster'; ids: string[]; target: { kind: 'root' | 'document' | 'folder' | 'cluster'; id: string; mode: 'before' | 'after' | 'inside' } }) => void
  handlePromptSidebarRowClick?: (payload: { itemId?: string }) => void
  openPromptCreateDialog?: () => void
  togglePromptDragMode?: () => void
  setPromptFilterMode?: (mode: 'all' | 'required') => void
  reorderPromptSidebarItems?: (payload: { sourceId: string; targetId: string; position?: 'before' | 'after' }) => void
}

type GroupMemberChip = {
  id: string
  name: string
  avatar: string
  emoji: string
}
type WorkspacePrimaryView = 'chat' | 'roles' | 'docs' | 'config' | 'data' | 'worlds'
type EnvironmentPillsConfig = {
  viewModel: Pick<EnvironmentViewModel, 'currentLocation' | 'currentTime' | 'timeRate' | 'weatherDetail'>
  isLoadingLocation: boolean
  isLoadingWeather: boolean
  editingLocation: boolean
  tempLocation: string
  showWeatherDetail: boolean
  weatherText: string
  temperatureText: string
  timeRate?: number
  formatDateOnly: (s: string) => string
  formatTimeOnly: (s: string) => string
  formatObsTime: (s: string) => string
  getWeatherIcon: (iconCode: string) => string
  editLocation: () => void
  saveLocation: () => void
  cancelLocationEdit: () => void
  syncWeather: (locationOverride?: string) => void
  toggleSceneTimePaused: () => void
  syncTime: () => void
  toggleWeatherDetail: () => void
  closeWeatherDetail: () => void
  updateTempLocation: (value: string) => void
}

const props = defineProps<{
  viewModel: ChatPanelViewModel
  actions: ChatPanelActions
  environmentPills?: EnvironmentPillsConfig
  workspacePrimaryView: WorkspacePrimaryView
  desktopSidebarWidthOverride?: number
  desktopSidebarStyleOverride?: Record<string, string>
  startSidebarResizeOverride?: (event: PointerEvent) => void
  getCharAvatarById: (char: NamedEntity | PanelEntityRef) => string
  getWeatherEmoji: (weather: string) => string
  formatChatText: (text: string) => string
  getCharAvatar: (name: string) => string
  getCharEmoji: (name: string) => string
  activeUtilityPanel?: ChatUtilityPanelId | ''
  setMessagesAreaRef: (el: RefTarget) => void
  chatStickToBottom: UseStickToBottomResult
  getDisplayedMessageContent: (index: number) => string
  getCharNameById: (charId: string) => string
  setMenuContainerRef: (el: RefTarget) => void
  setChatInputRef: (el: RefTarget) => void
  apiConfigViewModel: ApiConfigPanelViewModel
  apiConfigActions: ApiConfigPanelActions
}>()
const canUseLocalAdvancedFeatures = computed(() => true)
const recallTraceState = useRecallTraceState()
const selectedThinkingPanel = ref({
  text: '',
  speakerName: '',
  isThinking: false,
  messageId: 0
})
const recallActivityPanelLoading = ref(false)
const recallActivityLogEntries = ref<ChatRecallActivityLogEntry[]>([])
const chatNotesSidebarOpen = ref(false)
// 状态系统面板开关（对话级·2026-07-08 批次2）；focusHostId=批次4 从临时数据面板跳入时按宿主下钻的目标。
// 舆图弹窗开关（地图系统批1·纯前端样例）
const mapViewerOpen = ref(false)
const scriptWorkspaceOpen = ref(false)
// 从剧本工作台打开舆图时只临时遮住剧本，不销毁工作台实例或丢失当前分区/草稿。
const scriptCoveredByMap = ref(false)
const statusSystemPanelOpen = ref(false)
const statusSystemPanelFocusHostId = ref('')
function openMapViewer() {
  scriptCoveredByMap.value = false
  mapViewerOpen.value = true
}
function openMapFromScript() {
  scriptCoveredByMap.value = true
  mapViewerOpen.value = true
}
function closeMapViewer() {
  mapViewerOpen.value = false
  scriptCoveredByMap.value = false
}
async function refreshCurtainSessionMeta(sessionId: string) {
  const targetSessionId = String(sessionId || '').trim()
  if (!targetSessionId) return
  try {
    await chatStore.refreshSessionMeta(targetSessionId)
  } catch (error) {
    console.warn('静默刷新会话帷幕失败:', error)
  }
}
function openStatusSystemPanel(focusHostId = '') {
  statusSystemPanelFocusHostId.value = String(focusHostId || '')
  statusSystemPanelOpen.value = true
}
function closeStatusSystemDialog() {
  statusSystemPanelOpen.value = false
  statusSystemPanelFocusHostId.value = ''
}
// 批次4 融合：临时数据面板「状态栏」按钮经全局事件唤起状态面板并下钻到该实体的状态栏。
function handleOpenStatusSystemPanelEvent(event: Event) {
  const hostId = String((event as CustomEvent<{ hostId?: string }>).detail?.hostId || '')
  openStatusSystemPanel(hostId)
}
function handleOpenScriptWorkspaceEvent() {
  scriptWorkspaceOpen.value = true
}
onMounted(() => {
  window.addEventListener(OPEN_STATUS_SYSTEM_PANEL_EVENT, handleOpenStatusSystemPanelEvent)
  window.addEventListener('langhuan:open-script-workspace', handleOpenScriptWorkspaceEvent)
})
onBeforeUnmount(() => {
  window.removeEventListener(OPEN_STATUS_SYSTEM_PANEL_EVENT, handleOpenStatusSystemPanelEvent)
  window.removeEventListener('langhuan:open-script-workspace', handleOpenScriptWorkspaceEvent)
})
// 本地编排诊断侧栏：与人格模型观察浮窗同源联动的更深一层。
const orchestrationAuditOpen = ref(false)
const orchestrationAuditMessageId = ref<number | string | null>(null)
// 批次I·编排入口：loop 期无消息 messageId，导演载体按 runId 折叠的运行态编排 payload 直接喂面板渲染。
const orchestrationAuditRuntime = ref<Record<string, unknown> | null>(null)
const chatNotesLoading = ref(false)
const chatMessageNotes = ref<ChatMessageNote[]>([])
let recallActivityLoadTimer: ReturnType<typeof setTimeout> | null = null
let recallActivityLoadStartedAt = 0
let recallActivityLoadSeq = 0
let recallActivityLogLoadSeq = 0
let recallActivityLogLoadController: AbortController | null = null

const emit = defineEmits<{
  (e: 'switch-workspace-view', nextView: WorkspacePrimaryView): void
  (e: 'open-chat-utility', panelId: ChatUtilityPanelId): void
}>()

const isDesktopViewport = ref(false)
const viewportWidth = ref(0)
const sidebarPointerInside = ref(false)
const sidebarFocusOpen = ref(false)
const sidebarRootHoverView = ref<WorkspacePrimaryView | ''>('')
const sidebarContactDragging = ref(false)
const sidebarWidthDragging = ref(false)
// 桌面端「钉住」态：点击根入口持久展开并挤压主区，与 hover 暂态悬浮区分。
// 全局单真值（同一时刻最多一个视图钉住）：只有直接点击聊天/角色根图标才切换钉住态，
// 收起=整体回 hover 模式；禁止旧的双布尔各自记忆（曾导致 hover 预览点单位后复活另一视图的残留钉住）。
const sidebarPinnedView = ref<'chat' | 'roles' | ''>('')
const sidebarContentAnimating = ref(false)
const sidebarFrozenWidth = ref(280)
type SidebarMotionPhase = 'closed' | 'opening' | 'open' | 'closing'
const sidebarMotionPhase = ref<SidebarMotionPhase>('closed')
const SIDEBAR_OPEN_MS = 200
const SIDEBAR_CLOSE_MS = 150
const SIDEBAR_MOTION_BUFFER_MS = 40
const SIDEBAR_HOVER_CLOSE_DELAY_MS = 200
const SIDEBAR_ROOT_HOVER_BRIDGE_PX = 48
let sidebarHoverCloseTimer: ReturnType<typeof setTimeout> | null = null
let sidebarMotionTimer: ReturnType<typeof setTimeout> | null = null
let sidebarLastPointerPosition: { x: number; y: number } | null = null
const docLibraryRef = ref<DocLibraryExpose | null>(null)
const hasOpenedDocWorkspace = ref(false)
const roleSelectionCharacterId = ref('')
const roleCharacterId = ref('')
const activeRoleUnitId = ref('')
const pendingRecallUnitOpen = ref<{ characterId: string; unitId: string } | null>(null)
const pendingRoleBrainOpen = ref('')
const roleBrainDrawerOpen = ref(false)
let roleSelectionHydrationFrame: number | null = null
const keepRoleBrainOnNextSidebarClose = ref(false)
const forceRoleSidebarCollapsed = ref(false)
const ROLE_SIDEBAR_MIN_WIDTH = 280
const ROLE_SIDEBAR_COLLAPSE_THRESHOLD = 248
const roleBrainClipboard = ref<{ mode: 'copy' | 'cut' | ''; unitIds: string[] }>({ mode: '', unitIds: [] })
const roleBrainExpandedUnitIds = ref<string[]>([])
const roleWorkspaceState = ref(createWorkspaceWindowState())
const roleAuxPanelMode = ref<'none' | 'preview' | 'relation'>('none')
const rolePreviewPanelMounted = ref(false)
const roleRelationPanelMounted = ref(false)
const roleRelationPanelReady = ref(false)
const roleRelationPanelLoading = ref(false)
const roleRelationUnitId = ref('')
const roleCompileDialogUnitId = ref('')
const roleFormDrafts = reactive<Record<string, Record<string, unknown>>>({})
const roleDocumentDraftHistories = reactive<Record<string, { values: string[]; index: number }>>({})
const roleDraftSaveVersions = createDraftSaveVersionGuard()

async function handleOpenThinkingPanel(payload: { thinkingText: string; thinkingSpeakerName: string; isThinking: boolean; messageId?: number; recallRunId?: string }) {
  closeChatSidebars('recall')
  const messageId = Number(payload?.messageId || 0)
  const recallRunId = String(payload?.recallRunId || '').trim()
  selectedThinkingPanel.value = {
    text: payload?.isThinking ? '' : String(payload?.thinkingText || ''),
    speakerName: String(payload?.thinkingSpeakerName || ''),
    isThinking: Boolean(payload?.isThinking),
    messageId
  }
  const loadSeq = ++recallActivityLoadSeq
  startRecallActivityPanelLoad()
  props.actions.openRecallActivityPanel()
  const sessionId = String(props.viewModel.activeSessionId || '')
  void refreshRecallActivityLogEntries()
  setRecallActivityPanelBinding(sessionId && messageId > 0 ? { sessionId, messageId } : null)
  if (payload?.isThinking) {
    if (!recallRunId || !showRecallActivityRunInPanel(recallRunId)) {
      showActiveRecallActivityInPanel()
    }
  }
  if (!payload?.isThinking && sessionId && Number.isInteger(messageId) && messageId > 0) {
    try {
      const entry = await locateChatRecallActivityLogBySessionId(sessionId, messageId)
      if (loadSeq !== recallActivityLoadSeq) return
      if (entry?.activity && hasRecallActivityProcess(entry)) {
        setCurrentRecallActivity(entry.activity as unknown as RecallActivityRun)
        upsertRecallActivityLogEntry(entry)
      } else if (recallTraceState.activeActivity.value?.status === 'running') {
        showActiveRecallActivityInPanel()
      } else {
        setCurrentRecallActivity(null)
      }
    } catch (error) {
      if (loadSeq !== recallActivityLoadSeq) return
      console.error('加载召回活动日志失败:', error)
      if (recallTraceState.activeActivity.value?.status === 'running') {
        showActiveRecallActivityInPanel()
      } else {
        setCurrentRecallActivity(null)
      }
    }
  } else {
    finishRecallActivityPanelLoad()
    return
  }
  if (loadSeq !== recallActivityLoadSeq) return
  finishRecallActivityPanelLoad()
}

const recallActivityMessageIds = computed(() => {
  const ids = new Set<number>()
  for (const entry of recallActivityLogEntries.value) {
    if (!hasRecallActivityProcess(entry)) continue
    for (const messageId of recallActivityEntryMessageIds(entry)) ids.add(messageId)
  }
  const active = recallTraceState.activity.value || recallTraceState.activeActivity.value
  const binding = recallTraceState.panelBinding.value
  if (active?.events?.length && binding?.messageId) ids.add(Number(binding.messageId))
  return ids
})

const recallActivityNavigationItems = computed(() => {
  const availableMessageIds = recallActivityMessageIds.value
  return (props.viewModel.currentMessages || [])
    .map((message, index) => {
      const messageId = resolveChatMessageNumericId(message)
      if (!Number.isInteger(messageId) || messageId <= 0) return null
      if (message.role !== 'assistant') return null
      if (!availableMessageIds.has(messageId)) return null
      const excerpt = buildRecallNavigationExcerpt(props.getDisplayedMessageContent?.(index) || message.content || '')
      if (!excerpt) return null
      return {
        messageId,
        role: 'assistant' as const,
        speakerName: String(message.name || props.viewModel.currentChatTitle || '角色'),
        excerpt
      }
    })
    .filter((item): item is { messageId: number; role: 'assistant'; speakerName: string; excerpt: string } => Boolean(item))
})

async function refreshRecallActivityLogEntries() {
  const sessionId = String(props.viewModel.activeSessionId || '').trim()
  const seq = ++recallActivityLogLoadSeq
  recallActivityLogLoadController?.abort()
  recallActivityLogLoadController = new AbortController()
  const controller = recallActivityLogLoadController
  if (!sessionId) {
    recallActivityLogEntries.value = []
    return
  }
  try {
    const entries = await loadAllChatRecallActivityLogsBySessionId(sessionId, {
      signal: controller.signal,
      concurrency: 4
    })
    if (seq !== recallActivityLogLoadSeq) return
    recallActivityLogEntries.value = dedupeRecallActivityLogEntries(entries)
  } catch (error) {
    if (seq !== recallActivityLogLoadSeq) return
    if (controller.signal.aborted) return
    console.error('加载召回活动消息导航失败:', error)
    recallActivityLogEntries.value = []
  }
}

function upsertRecallActivityLogEntry(entry: ChatRecallActivityLogEntry) {
  if (!entry?.id) return
  recallActivityLogEntries.value = dedupeRecallActivityLogEntries([
    entry,
    ...recallActivityLogEntries.value.filter((item) => item.id !== entry.id)
  ])
}

function dedupeRecallActivityLogEntries(entries: ChatRecallActivityLogEntry[]): ChatRecallActivityLogEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = String(entry?.id || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function hasRecallActivityProcess(entry: ChatRecallActivityLogEntry): boolean {
  if (!entry || String(entry.status || '').trim() === 'deleted') return false
  const activity = entry.activity && typeof entry.activity === 'object' ? entry.activity as Record<string, unknown> : {}
  if (Array.isArray(activity.events)) {
    return activity.events.some((event) => isPublicRecallEvent(event as never))
  }
  if (Array.isArray(activity.publicMilestones) && activity.publicMilestones.length > 0) return true
  const result = activity.result && typeof activity.result === 'object' ? activity.result as Record<string, unknown> : null
  return Boolean(result && Array.isArray(result.confirmedIds))
}

function recallActivityEntryMessageIds(entry: ChatRecallActivityLogEntry): number[] {
  return [
    Number(entry.inputMessageId || 0),
    Number(entry.assistantMessageId || 0)
  ].filter((item) => Number.isInteger(item) && item > 0)
}

function openRecallActivityForMessageId(messageId: number) {
  const numericMessageId = Number(messageId || 0)
  if (!Number.isInteger(numericMessageId) || numericMessageId <= 0) return
  const messages = props.viewModel.currentMessages || []
  const index = messages.findIndex((message) => resolveChatMessageNumericId(message) === numericMessageId)
  const message = index >= 0 ? messages[index] : null
  handleOpenThinkingPanel({
    thinkingText: message ? stripAiThoughtContent(props.getDisplayedMessageContent?.(index) || message.content || '') : '',
    thinkingSpeakerName: resolveChatMessageSpeakerName(message, {
      userFallbackName: props.viewModel.currentAlias?.name || props.viewModel.userProfile?.name || '我',
      assistantFallbackName: props.viewModel.currentChatTitle || '角色'
    }),
    isThinking: false,
    messageId: numericMessageId
  })
}

function resolveChatMessageNumericId(message: { id?: unknown } | null | undefined): number {
  const rawMessageId = String(message?.id || '').trim()
  return Number(rawMessageId.match(/\d+$/)?.[0] || rawMessageId)
}

function buildRecallNavigationExcerpt(text: string): string {
  return stripAiThoughtContent(text)
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52)
}

function startRecallActivityPanelLoad() {
  if (recallActivityLoadTimer) {
    clearTimeout(recallActivityLoadTimer)
    recallActivityLoadTimer = null
  }
  recallActivityPanelLoading.value = true
  recallActivityLoadStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function finishRecallActivityPanelLoad() {
  if (!recallActivityPanelLoading.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const remaining = Math.max(0, 520 - (now - recallActivityLoadStartedAt))
  if (recallActivityLoadTimer) clearTimeout(recallActivityLoadTimer)
  recallActivityLoadTimer = setTimeout(() => {
    recallActivityLoadTimer = null
    recallActivityPanelLoading.value = false
  }, remaining)
}

function cancelRecallActivityPanelLoad() {
  if (recallActivityLoadTimer) {
    clearTimeout(recallActivityLoadTimer)
    recallActivityLoadTimer = null
  }
  recallActivityPanelLoading.value = false
}

function openRecallConfirmedUnit(unitRef: string | RecallActivityUnitRef) {
  const normalized = String(typeof unitRef === 'string' ? unitRef : unitRef?.id || '').trim()
  if (!normalized) return
  const target = resolveRecallUnitTarget(unitRef)
  if (!target) {
    toast('没有找到这个召回单位对应的角色卡片')
    return
  }
  if (props.workspacePrimaryView !== 'roles') {
    pendingRecallUnitOpen.value = target
    emit('switch-workspace-view', 'roles')
    return
  }
  openRoleUnitForCharacter(target.characterId, target.unitId)
}

function openRoleUnitForCharacter(characterId: string, unitId: string) {
  const nextCharacterId = String(characterId || '').trim()
  const nextUnitId = String(unitId || '').trim()
  if (!nextCharacterId || !nextUnitId) return
  roleSelectionCharacterId.value = nextCharacterId
  scheduleRoleCharacterHydration(nextCharacterId, () => {
    nextTick(() => {
      openRoleUnitWindow(nextUnitId, 'viewer')
    })
  })
}

function openRoleBrainForCharacter(characterId: string) {
  const nextCharacterId = String(characterId || '').trim()
  if (!nextCharacterId) return
  const isSameCharacter = selectedRoleCharacterId.value === nextCharacterId
  roleSelectionCharacterId.value = nextCharacterId
  if (isSameCharacter) {
    roleBrainDrawerOpen.value = true
    nextTick(() => {
      roleBrainDrawerOpen.value = true
    })
    return
  }
  scheduleRoleCharacterHydration(nextCharacterId)
}

function handleOpenWorkspaceView(event: Event) {
  const detail = (event as CustomEvent<{ view?: string; characterId?: string }>).detail || {}
  if (String(detail.view || '') !== 'roles') return
  const characterId = String(detail.characterId || '').trim()
  if (!characterId) return
  if (props.workspacePrimaryView !== 'roles') {
    pendingRoleBrainOpen.value = characterId
    return
  }
  openRoleBrainForCharacter(characterId)
}

function resolveRecallUnitTarget(unitRef: string | RecallActivityUnitRef): { characterId: string; unitId: string } | null {
  const normalized = String(typeof unitRef === 'string' ? unitRef : unitRef?.id || '').trim()
  if (!normalized) return null
  const ownerCharacterId = typeof unitRef === 'string' ? '' : String(unitRef.ownerCharacterId || '').trim()
  const characters = ownerCharacterId
    ? props.viewModel.characters.filter((character) => String(character?.id || '').trim() === ownerCharacterId)
    : props.viewModel.characters

  for (const character of characters) {
    const characterId = String(character?.id || '').trim()
    if (!characterId) continue
    const unitView = buildCharacterBrainUnitView(character as never)
    const unit = unitView.units.find((item) => (
      String(item.unitId || '').trim() === normalized
      || String(item.sourceId || '').trim() === normalized
    ))
    if (unit) return { characterId, unitId: unit.unitId }
  }

  const unit = roleUnitMap.value.get(normalized)
    || roleUnitView.value.units.find((item) => String(item.sourceId || '').trim() === normalized)
  if (unit && selectedRoleCharacterId.value) return { characterId: selectedRoleCharacterId.value, unitId: unit.unitId }
  return null
}

function resolveRecallUnitPreview(unitRef: RecallActivityUnitRef): { summary?: string; contentText?: string } | null {
  const target = resolveRecallUnitTarget(unitRef)
  if (!target) return null
  const character = props.viewModel.characters.find((item) => String(item?.id || '').trim() === target.characterId)
  if (!character) return null
  const unitView = buildCharacterBrainUnitView(character as never)
  const unit = unitView.units.find((item) => item.unitId === target.unitId)
  if (!unit) return null
  const contentText = String(unit.body || '').trim()
  const summary = String(unit.compilePage?.summary || '').trim()
  if (contentText || summary) return { contentText, summary }
  if (unit.contentKind === 'group') {
    const childCount = unitView.units.filter((item) => item.parentId === unit.unitId).length
    return { summary: `${unit.title} 下包含 ${childCount} 个子簇枝桠。` }
  }
  return null
}

function closePromptLogSidebar() {
  props.actions.closePromptLogPanel?.()
}

function closeChatSidebars(except: 'notes' | 'promptLog' | 'recall' | 'orchestration' | 'tidiaoPanel' | '' = '') {
  if (except !== 'notes') chatNotesSidebarOpen.value = false
  if (except !== 'promptLog') props.actions.closePromptLogPanel?.()
  if (except !== 'recall') recallTraceState.setSidebarOpen(false)
  if (except !== 'orchestration') orchestrationAuditOpen.value = false
  // 提调带面板挤压侧栏（场记/剧本/待办/资料池·打开态在模块桥 tidiaoPanelSidebarState）纳入互斥。
  if (except !== 'tidiaoPanel') closeTidiaoPanelSidebar()
}

// 提调带面板挤压侧栏：打开动作发生在消息流深层的带子（经模块桥），这里 watch 到非空即关掉其它侧栏保持互斥。
watch(tidiaoPanelSidebarTarget, (target) => {
  if (target) closeChatSidebars('tidiaoPanel')
})

// 四面板窄化 computed（union 按 kind 拆·模板属性表达式拿到精确类型）+ aria-label。
const tidiaoStatePanelTarget = computed(() =>
  tidiaoPanelSidebarTarget.value?.kind === 'state' ? tidiaoPanelSidebarTarget.value : null
)
const tidiaoPoolPanelTarget = computed(() =>
  tidiaoPanelSidebarTarget.value?.kind === 'pool' ? tidiaoPanelSidebarTarget.value : null
)
const tidiaoPanelSidebarAriaLabel = computed(() => {
  const kind = tidiaoPanelSidebarTarget.value?.kind
  return kind === 'pool' ? '资料池侧栏'
    : '提调场记侧栏'
})

function closeChatNotesSidebar() {
  chatNotesSidebarOpen.value = false
}

// 编排审计侧栏：本地工作区直接可用；可携带某条角色消息 id 直跳并高亮该条编排证据。
function openOrchestrationAudit(payload?: { messageId?: number | string | null; runtimeOrchestration?: Record<string, unknown> | null }) {
  if (!canUseLocalAdvancedFeatures.value) return
  closeChatSidebars('orchestration')
  // 批次I：运行态编排（导演 loop 期）与 messageId 互斥——有运行态则直渲，无则走既有 messageId 持久化路径。
  orchestrationAuditRuntime.value = payload?.runtimeOrchestration ?? null
  orchestrationAuditMessageId.value = payload?.runtimeOrchestration ? null : (payload?.messageId ?? null)
  orchestrationAuditOpen.value = true
}

function closeOrchestrationAudit() {
  orchestrationAuditOpen.value = false
}

async function openChatNotesSidebar() {
  closeChatSidebars('notes')
  chatNotesSidebarOpen.value = true
  await loadChatMessageNotes()
}

function handleOpenPromptLogPanel(messageId?: number) {
  closeChatSidebars('promptLog')
  props.actions.openPromptLogPanel(messageId)
}

async function loadChatMessageNotes(sessionId = String(props.viewModel.activeSessionId || '')) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) {
    chatMessageNotes.value = []
    return
  }
  chatNotesLoading.value = true
  try {
    chatMessageNotes.value = await fetchChatMessageNotesBySessionId(normalizedSessionId)
  } catch (error) {
    console.error('加载消息笔记失败:', error)
    toast('加载笔记失败', 'error')
  } finally {
    chatNotesLoading.value = false
  }
}

async function handleAddMessageNote(payload: ChatMessageNoteCreatePayload) {
  const sessionId = String(props.viewModel.activeSessionId || '').trim()
  if (!sessionId) {
    toast('当前没有会话，不能添加笔记', 'info')
    return
  }
  try {
    const saved = await createChatMessageNoteBySessionId(sessionId, payload as unknown as Record<string, unknown>)
    chatMessageNotes.value = [
      saved,
      ...chatMessageNotes.value.filter((item) => String(item.id || '') !== String(saved.id || ''))
    ]
    closeChatSidebars('notes')
    chatNotesSidebarOpen.value = true
    toast('已加入笔记', 'success')
  } catch (error) {
    console.error('添加消息笔记失败:', error)
    toast('加入笔记失败', 'error')
  }
}

async function deleteMessageNote(note: ChatMessageNote) {
  const sessionId = String(props.viewModel.activeSessionId || '').trim()
  const noteId = String(note?.id || '').trim()
  if (!sessionId || !noteId) return
  try {
    await deleteChatMessageNoteBySessionId(sessionId, noteId)
    chatMessageNotes.value = chatMessageNotes.value.filter((item) => String(item.id || '') !== noteId)
    toast('已删除', 'success')
  } catch (error) {
    console.error('删除消息笔记失败:', error)
    toast('删除笔记失败', 'error')
  }
}

async function copyMessageNote(note: ChatMessageNote) {
  const text = String(note.sourceText ?? note.source_text ?? '').trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast('已复制', 'success')
  } catch (error) {
    console.error('复制消息笔记失败:', error)
    toast('复制失败', 'error')
  }
}

function jumpToMessageNote(note: ChatMessageNote) {
  const messageId = Number(note.messageId ?? note.message_id ?? 0)
  const index = Number(note.messageIndex ?? note.message_index ?? -1)
  nextTick(() => {
    const selector = Number.isInteger(messageId) && messageId > 0
      ? `[data-chat-message-id="${messageId}"]`
      : `[data-chat-message-index="${index}"]`
    const target = document.querySelector(`.chat-messages ${selector}`) as HTMLElement | null
    if (!target) {
      toast('原消息当前不在列表中', 'info')
      return
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.classList.add('chat-message--note-focus')
    window.setTimeout(() => target.classList.remove('chat-message--note-focus'), 1200)
  })
}

function setDocLibraryRef(target: unknown) {
  docLibraryRef.value = target as DocLibraryExpose | null
}

function handleDocWorkspaceSidebarStateChange(state: unknown) {
  handleDocSidebarStateChange(state as DocSidebarState)
}

type RoleDocumentEditorWorkspaceExpose = {
  getTextareaElement: () => HTMLTextAreaElement | null
}
type RoleDocumentPreviewPaneExpose = {
  getPreviewElement: () => HTMLElement | null
}
const roleDocumentEditorRefs = new Map<string, RoleDocumentEditorWorkspaceExpose>()
const roleDocumentPreviewPaneRefs = new Map<string, RoleDocumentPreviewPaneExpose>()
const modelLoadingRoleUnitId = ref('')
const draggingRoleWindowId = ref('')
let stopRoleWorkspaceSplitResize: null | (() => void) = null
let docLibraryWarmupStarted = false
let roleRelationLoadFrame: number | null = null
let roleRelationLoadTimer: ReturnType<typeof setTimeout> | null = null
let roleRelationLoadStartedAt = 0
let isSyncingRoleDocumentScroll = false
const docSidebarState = ref<DocSidebarState>({
  activeTab: 'worldbook',
  worldbook: {
    treeVisible: true,
    clusters: [],
    selectedCount: 0,
    clipboardMode: '',
    clipboardHasData: false,
    rows: [],
    rowsByCluster: {}
  },
  prompt: {
    selectedId: '',
    totalCount: 0,
    dragEnabled: false,
    filterMode: 'all',
    rows: []
  },
  relation: {
    activeTab: 'candidates',
    predicatesCount: 0,
    candidatesCount: 0,
    confirmedCount: 0
  }
})

function updateDesktopViewport() {
  if (typeof window === 'undefined') {
    isDesktopViewport.value = false
    viewportWidth.value = 0
    return
  }
  viewportWidth.value = window.innerWidth
  isDesktopViewport.value = window.innerWidth > 768
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  const tagName = element.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable
}

function handleSidebarShortcut(event: KeyboardEvent) {
  if (!isDesktopViewport.value) return
  const key = event.key.toLowerCase()
  const commandPressed = event.ctrlKey || event.metaKey
  if (handleWorkspaceSaveShortcut(event, {
    canSave: () => props.workspacePrimaryView === 'roles' && Boolean(selectedRoleEntity.value),
    save: saveCurrentRoleWorkspaceData
  })) {
    return
  }
  if (isEditableTarget(event.target)) return
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && key === 'o') {
    event.preventDefault()
    emit('switch-workspace-view', 'docs')
    return
  }
  if (!event.ctrlKey || key !== 'b') return
  event.preventDefault()
  props.actions.updateSidebarOpen(false)
}

function saveCurrentRoleWorkspaceData() {
  const activeWindow = activeRoleWorkspaceWindow.value
  const unitId = String(activeWindow?.sourceId || activeRoleUnitId.value || '').trim()
  if (unitId && activeWindow?.kind === 'form' && (hasRoleUnitFormFields(unitId) || canEditRoleUnitDocument(unitId))) {
    void saveRoleUnitForm(unitId)
    return
  }
  toast('当前没有可保存的角色大脑编辑内容', 'info')
}

function warmupDocLibraryWorkspace() {
  if (docLibraryWarmupStarted) return
  docLibraryWarmupStarted = true
  const run = () => {
    void loadDocLibraryComponent().catch(() => {})
    void prefetchDocLibraryState().catch(() => {})
    hasOpenedDocWorkspace.value = true
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number })
      .requestIdleCallback?.(run, { timeout: 1600 })
    return
  }
  globalThis.setTimeout(run, 320)
}

const {
  width: chatSidebarWidth,
  panelStyle: desktopPanelStyle,
  startResize: startChatSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_chat_sidebar_width',
  defaultWidth: 280,
  minWidth: 160,
  maxWidth: 630,
  enabled: computed(() => isDesktopViewport.value && props.viewModel.sidebarOpen)
})

const {
  width: roleSidebarWidth,
  panelStyle: roleSidebarPanelStyle,
  startResize: startRoleSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_role_sidebar_width',
  defaultWidth: 280,
  minWidth: ROLE_SIDEBAR_MIN_WIDTH,
  maxWidth: 430,
  enabled: computed(() => isDesktopViewport.value && props.viewModel.sidebarOpen && props.workspacePrimaryView === 'roles'),
  collapseThreshold: ROLE_SIDEBAR_COLLAPSE_THRESHOLD,
  onCollapse: collapseRoleSelectionSidebarFromResize
})

const {
  panelStyle: roleBrainDrawerStyle,
  startResize: startRoleBrainDrawerResize
} = useResizablePanel({
  storageKey: 'langhuan_role_brain_drawer_width',
  defaultWidth: 300,
  minWidth: 248,
  maxWidth: 460,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'roles' && roleBrainDrawerOpen.value)
})
const {
  panelStyle: roleAuxPanelStyle,
  startResize: startRoleAuxPanelResize
} = useResizablePanel({
  storageKey: 'langhuan_role_aux_panel_width',
  defaultWidth: 520,
  minWidth: 420,
  maxWidth: 720,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'roles' && roleAuxPanelMode.value !== 'none'),
  edge: 'left'
})

const currentDesktopSidebarWidth = computed(() => {
  if (typeof props.desktopSidebarWidthOverride === 'number') return props.desktopSidebarWidthOverride
  // 宽度跟实际展示视图走（hover 预览另一视图时用那个视图记忆的宽度）。
  return sidebarDisplayView.value === 'roles' ? roleSidebarWidth.value : chatSidebarWidth.value
})

const chatSidebarStyle = computed(() => {
  if (!isDesktopViewport.value) return {}
  const shouldKeepSidebarSized = canUseDesktopHoverSidebar.value || effectiveSidebarOpen.value || sidebarVisualPresent.value || sidebarContentAnimating.value
  if (!shouldKeepSidebarSized) return {}
  const width = sidebarVisualWidth.value
  const baseStyle = props.desktopSidebarStyleOverride
    || (sidebarDisplayView.value === 'roles' ? roleSidebarPanelStyle.value : desktopPanelStyle.value)
  return {
    ...baseStyle,
    width,
    minWidth: width,
    maxWidth: width,
    flexBasis: width,
    '--langhuan-sidebar-visual-width': width,
    '--langhuan-sidebar-freeze-width': width
  }
})

// 强制收拢（专注工作区）只影响「当下收起」，不关闭 hover 能力：收拢后仍可 hover 根图标再唤出二级侧栏。
const canUseDesktopHoverSidebar = computed(() => (
  isDesktopViewport.value
  && props.workspacePrimaryView !== 'docs'
))

const isDesktopSidebarHoverOpen = computed(() => (
  canUseDesktopHoverSidebar.value
  && (
    sidebarRootHoverView.value === props.workspacePrimaryView
    // hover 预览（2026-07-07）：非钉住 hover 阶段，悬停另一个聊天/角色根图标也展开对应二级侧栏；
    // 钉住态保持旧口径——hover 无变化，仅点击才切换。
    || ((sidebarRootHoverView.value === 'chat' || sidebarRootHoverView.value === 'roles') && !currentSidebarPinned.value)
  )
  && (sidebarPointerInside.value || sidebarFocusOpen.value || sidebarContactDragging.value || sidebarWidthDragging.value)
))

// 当前视图是否处于「钉住」态（仅桌面端聊天 / 角色）。钉住才挤压主区，hover 只悬浮。
const currentSidebarPinned = computed(() => {
  if (!isDesktopViewport.value) return false
  return sidebarPinnedView.value !== '' && sidebarPinnedView.value === props.workspacePrimaryView
})

// 视觉展开（present / expanded / 动画相位）由「钉住 OR hover」共同驱动；
// 是否挤压占位则只认钉住，见 effectiveSidebarOpen。
const wantsDesktopSidebarOpen = computed(() => (
  canUseDesktopHoverSidebar.value && (currentSidebarPinned.value || isDesktopSidebarHoverOpen.value)
))

// hover 预览视图（2026-07-07）：非钉住 hover 展开阶段，悬停另一个根图标时二级侧栏直接预览该视图内容。
// 预览值在收起动画期间保留（不随 hover 清空立刻回落），避免关闭瞬间内容闪回当前视图。
const sidebarHoverPreviewView = ref<'chat' | 'roles' | ''>('')

watch([sidebarRootHoverView, isDesktopSidebarHoverOpen], ([hover, hoverOpen]) => {
  if (!hoverOpen) return
  if (hover === props.workspacePrimaryView) {
    sidebarHoverPreviewView.value = ''
    return
  }
  if ((hover === 'chat' || hover === 'roles') && !currentSidebarPinned.value) {
    sidebarHoverPreviewView.value = hover
  }
})

// 预览退出口：侧栏彻底收拢、当前视图被钉住、或预览视图已成为当前视图（点击跟进）时清空。
watch([sidebarMotionPhase, () => props.workspacePrimaryView, currentSidebarPinned], () => {
  if (
    sidebarMotionPhase.value === 'closed'
    || currentSidebarPinned.value
    || sidebarHoverPreviewView.value === props.workspacePrimaryView
  ) {
    sidebarHoverPreviewView.value = ''
  }
})

// 二级侧栏实际展示的视图：预览优先（仅非钉住），其余跟随当前工作区视图。宽度、面板样式、内容渲染都吃它。
const sidebarDisplayView = computed<WorkspacePrimaryView>(() => (
  sidebarHoverPreviewView.value && !currentSidebarPinned.value
    ? sidebarHoverPreviewView.value
    : props.workspacePrimaryView
))

const sidebarVisualPresent = computed(() => {
  if (props.workspacePrimaryView === 'docs') return props.viewModel.sidebarOpen
  return wantsDesktopSidebarOpen.value || sidebarMotionPhase.value !== 'closed'
})

const sidebarVisualExpanded = computed(() => {
  if (props.workspacePrimaryView === 'docs') return props.viewModel.sidebarOpen
  return wantsDesktopSidebarOpen.value && sidebarMotionPhase.value !== 'closing'
})

const sidebarLeaving = computed(() => sidebarMotionPhase.value === 'closing')

const sidebarTransitioning = computed(() => (
  sidebarMotionPhase.value === 'opening' || sidebarMotionPhase.value === 'closing'
))

const sidebarVisualWidth = computed(() => {
  const width = sidebarContentAnimating.value
    ? sidebarFrozenWidth.value
    : currentDesktopSidebarWidth.value
  return `${Math.max(0, Math.round(width || 280))}px`
})

// 占位/挤压口径：docs 仍用自身 sidebarOpen；聊天 / 角色桌面端只在「钉住」时才占位挤压，
// hover 暂态不撑宽 slot（侧栏改为悬浮覆盖在主区之上）。
const effectiveSidebarOpen = computed(() => (
  isDesktopViewport.value
    ? (props.workspacePrimaryView === 'docs' ? props.viewModel.sidebarOpen : currentSidebarPinned.value)
    : props.viewModel.sidebarOpen
))

const desktopLeftOccupancy = computed(() => {
  if (!isDesktopViewport.value) return 0
  const rootRailWidth = 48
  if (props.workspacePrimaryView === 'roles' && forceRoleSidebarCollapsed.value) {
    return rootRailWidth
  }
  const desktopWidth = typeof props.desktopSidebarWidthOverride === 'number'
    ? props.desktopSidebarWidthOverride
    : props.workspacePrimaryView === 'roles'
      ? roleSidebarWidth.value
      : chatSidebarWidth.value
  return effectiveSidebarOpen.value ? desktopWidth + rootRailWidth : rootRailWidth
})

watch(canUseDesktopHoverSidebar, (canUse) => {
  if (canUse) return
  cancelSidebarHoverCloseTimer()
  stopSidebarContentAnimationFreeze()
  sidebarContactDragging.value = false
  sidebarWidthDragging.value = false
  sidebarFocusOpen.value = false
  sidebarRootHoverView.value = ''
  sidebarHoverPreviewView.value = ''
})

watch(isDesktopViewport, (isDesktop) => {
  if (isDesktop) return
  cancelSidebarHoverCloseTimer()
  stopSidebarContentAnimationFreeze()
  sidebarContactDragging.value = false
  sidebarWidthDragging.value = false
  sidebarPointerInside.value = false
  sidebarFocusOpen.value = false
  sidebarRootHoverView.value = ''
  sidebarHoverPreviewView.value = ''
})

watch(wantsDesktopSidebarOpen, (nextOpen, previousOpen) => {
  if (sidebarMotionTimer) {
    clearTimeout(sidebarMotionTimer)
    sidebarMotionTimer = null
  }

  if (previousOpen === undefined) {
    sidebarMotionPhase.value = nextOpen ? 'open' : 'closed'
    sidebarContentAnimating.value = false
    return
  }

  sidebarFrozenWidth.value = currentDesktopSidebarWidth.value || sidebarFrozenWidth.value || 280
  sidebarContentAnimating.value = true

  if (nextOpen) {
    sidebarMotionPhase.value = 'opening'
    sidebarMotionTimer = setTimeout(() => {
      if (!wantsDesktopSidebarOpen.value) return
      sidebarMotionPhase.value = 'open'
      sidebarContentAnimating.value = false
      sidebarMotionTimer = null
    }, SIDEBAR_OPEN_MS + SIDEBAR_MOTION_BUFFER_MS)
    return
  }

  sidebarMotionPhase.value = 'closing'
  sidebarMotionTimer = setTimeout(() => {
    if (wantsDesktopSidebarOpen.value) return
    sidebarMotionPhase.value = 'closed'
    sidebarContentAnimating.value = false
    sidebarMotionTimer = null
  }, SIDEBAR_CLOSE_MS + SIDEBAR_MOTION_BUFFER_MS)
}, { immediate: true, flush: 'sync' })

const recallActivitySidebarMaxWidth = computed(() => {
  if (!isDesktopViewport.value) return 860
  const reservedChatWidth = 360
  const layoutGutter = 24
  return Math.max(380, Math.min(860, viewportWidth.value - desktopLeftOccupancy.value - reservedChatWidth - layoutGutter))
})

const promptLogSidebarMaxWidth = computed(() => {
  if (!isDesktopViewport.value) return 720
  const reservedChatWidth = 360
  const layoutGutter = 24
  return Math.max(360, Math.min(720, viewportWidth.value - desktopLeftOccupancy.value - reservedChatWidth - layoutGutter))
})

const {
  panelStyle: recallActivitySidebarStyle,
  startResize: startRecallActivitySidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_recall_activity_sidebar_width',
  defaultWidth: 560,
  minWidth: 380,
  maxWidth: recallActivitySidebarMaxWidth,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'chat' && recallTraceState.sidebarOpen.value),
  edge: 'left'
})

const {
  panelStyle: promptLogSidebarStyle,
  startResize: startPromptLogSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_prompt_log_sidebar_width',
  defaultWidth: 460,
  minWidth: 360,
  maxWidth: promptLogSidebarMaxWidth,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'chat' && Boolean(props.viewModel.promptLogPanelOpen)),
  edge: 'left'
})

const {
  panelStyle: chatNotesSidebarStyle,
  startResize: startChatNotesSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_chat_notes_sidebar_width',
  defaultWidth: 420,
  minWidth: 340,
  maxWidth: promptLogSidebarMaxWidth,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'chat' && chatNotesSidebarOpen.value),
  edge: 'left'
})

const {
  panelStyle: orchestrationAuditSidebarStyle,
  startResize: startOrchestrationAuditSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_orchestration_audit_sidebar_width',
  defaultWidth: 444,
  minWidth: 380,
  maxWidth: promptLogSidebarMaxWidth,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'chat' && canUseLocalAdvancedFeatures.value && orchestrationAuditOpen.value),
  edge: 'left'
})

// 提调带面板挤压侧栏宽度（2026-07-10 四面板共用一份宽度真值·与提示词日志同一约束口径；
// storageKey 沿用旧名保住用户已拖宽度）。
const {
  panelStyle: directorStateSidebarStyle,
  startResize: startDirectorStateSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_director_state_sidebar_width',
  defaultWidth: 480,
  minWidth: 380,
  maxWidth: promptLogSidebarMaxWidth,
  enabled: computed(() => isDesktopViewport.value && props.workspacePrimaryView === 'chat' && Boolean(tidiaoPanelSidebarTarget.value)),
  edge: 'left'
})

const sidebarSlotStyle = computed(() => {
  if (!isDesktopViewport.value) {
    return {
      width: '0px',
      minWidth: '0px',
      flexBasis: '0px',
      '--langhuan-sidebar-visual-width': sidebarVisualWidth.value,
      '--langhuan-sidebar-freeze-width': sidebarVisualWidth.value
    }
  }
  const width = `${desktopLeftOccupancy.value}px`
  return {
    width,
    minWidth: width,
    flexBasis: width,
    '--langhuan-sidebar-visual-width': sidebarVisualWidth.value,
    '--langhuan-sidebar-freeze-width': sidebarVisualWidth.value
  }
})

const isRoleSidebarForceCollapsed = computed(() => (
  props.workspacePrimaryView === 'roles'
  && forceRoleSidebarCollapsed.value
))

type SidebarRootHoverView = WorkspacePrimaryView | 'none'

function normalizeSidebarRootHoverView(view: string | undefined): SidebarRootHoverView | '' {
  if (view === 'chat' || view === 'roles' || view === 'docs') return view
  if (view === 'config' || view === 'data' || view === 'worlds' || view === 'none') return 'none'
  return ''
}

function resolveSidebarRootHoverView(target: EventTarget | null): SidebarRootHoverView | '' {
  if (!(target instanceof Element)) return ''
  const root = target.closest<HTMLElement>('[data-sidebar-root-view]')
  return normalizeSidebarRootHoverView(root?.dataset.sidebarRootView)
}

function resolveSidebarRootHoverViewFromCoordinates(root: HTMLElement | null, x: number, y: number, options: { includeNonHoverBridge?: boolean } = {}): SidebarRootHoverView | '' {
  if (!canUseDesktopHoverSidebar.value) return ''
  if (!root) return ''
  const navItems = Array.from(root.querySelectorAll<HTMLElement>('[data-sidebar-root-view]'))
  for (const item of navItems) {
    const view = normalizeSidebarRootHoverView(item.dataset.sidebarRootView)
    if (!view) continue
    const rect = item.getBoundingClientRect()
    const isHoverRoot = view === 'chat' || view === 'roles'
    // 非钉住时聊天/角色图标都可 hover 预览，桥接区一并放开（否则指针从预览图标滑进侧栏会掉出命中区）。
    const isCurrentHoverView = isHoverRoot && (view === props.workspacePrimaryView || !currentSidebarPinned.value)
    const bridgeWidth = isCurrentHoverView || (!isHoverRoot && options.includeNonHoverBridge)
      ? Math.max(rect.width, SIDEBAR_ROOT_HOVER_BRIDGE_PX)
      : 0
    const left = rect.left
    const right = rect.right + bridgeWidth
    const top = rect.top
    const bottom = rect.bottom
    if (
      x >= left
      && x <= right
      && y >= top
      && y <= bottom
    ) {
      return view
    }
  }
  return ''
}

function resolveSidebarRootHoverViewFromPoint(event: PointerEvent): SidebarRootHoverView | '' {
  return resolveSidebarRootHoverViewFromCoordinates(
    event.currentTarget as HTMLElement | null,
    event.clientX,
    event.clientY,
    { includeNonHoverBridge: true }
  )
}

function isInsideSidebarRootNav(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.chat-nav'))
}

function isInsideSecondarySidebar(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.chat-sidebar'))
}

function isPointerInsideSecondarySidebarRect(pointer: { x: number; y: number } | null) {
  if (!pointer || typeof document === 'undefined') return false
  const sidebars = Array.from(document.querySelectorAll<HTMLElement>('.chat-sidebar-slot .chat-sidebar'))
  return sidebars.some((sidebar) => {
    const rect = sidebar.getBoundingClientRect()
    return (
      pointer.x >= rect.left
      && pointer.x <= rect.right
      && pointer.y >= rect.top
      && pointer.y <= rect.bottom
    )
  })
}

function refreshSidebarHoverFromPointerPosition(pointer: { x: number; y: number } | null) {
  if (!canUseDesktopHoverSidebar.value || !pointer || typeof document === 'undefined') return false
  const target = document.elementFromPoint(pointer.x, pointer.y)
  const rootView = resolveSidebarRootHoverView(target)
    || resolveSidebarRootHoverViewFromCoordinates(document.querySelector<HTMLElement>('.chat-sidebar-slot'), pointer.x, pointer.y, { includeNonHoverBridge: true })
  if (rootView === 'chat' || rootView === 'roles') {
    // 钉住态不响应其他视图图标的 hover（仅点击切换）；非钉住可 hover 预览另一视图。
    if (rootView !== props.workspacePrimaryView && currentSidebarPinned.value) return false
    cancelSidebarHoverCloseTimer()
    sidebarRootHoverView.value = rootView
    sidebarPointerInside.value = true
    return true
  }
  if (rootView === 'docs' || rootView === 'none') return false
  if (isInsideSecondarySidebar(target) || isPointerInsideSecondarySidebarRect(pointer)) {
    cancelSidebarHoverCloseTimer()
    sidebarPointerInside.value = true
    return true
  }
  return false
}

function cancelSidebarHoverCloseTimer() {
  if (!sidebarHoverCloseTimer) return
  clearTimeout(sidebarHoverCloseTimer)
  sidebarHoverCloseTimer = null
}

function cancelSidebarContentAnimationTimer() {
  if (!sidebarMotionTimer) return
  clearTimeout(sidebarMotionTimer)
  sidebarMotionTimer = null
}

function stopSidebarContentAnimationFreeze() {
  cancelSidebarContentAnimationTimer()
  sidebarMotionPhase.value = wantsDesktopSidebarOpen.value ? 'open' : 'closed'
  sidebarContentAnimating.value = false
}

function handleSidebarSlotTransitionEnd(event: TransitionEvent) {
  if (event.target !== event.currentTarget) return
  if (event.propertyName !== 'width' && event.propertyName !== 'min-width' && event.propertyName !== 'flex-basis') return
  stopSidebarContentAnimationFreeze()
}

function scheduleSidebarHoverClose() {
  if (sidebarContactDragging.value || sidebarWidthDragging.value) return
  if (sidebarHoverCloseTimer) return
  sidebarHoverCloseTimer = setTimeout(() => {
    sidebarHoverCloseTimer = null
    if (refreshSidebarHoverFromPointerPosition(sidebarLastPointerPosition)) return
    clearSidebarHoverOpen()
  }, SIDEBAR_HOVER_CLOSE_DELAY_MS)
}

function clearSidebarHoverOpen() {
  if (sidebarContactDragging.value || sidebarWidthDragging.value) return
  cancelSidebarHoverCloseTimer()
  sidebarPointerInside.value = false
  sidebarFocusOpen.value = false
  sidebarRootHoverView.value = ''
}

// hover 预览态点击预览侧栏内部（capture 先于行级点击）：视为「跟去那个视图」——
// 先把工作区切到预览视图，行级点击（选会话/选角色）随后照常生效；根图标不在此列（走 togglePrimaryNav 钉住路径）。
function handleSidebarSlotClickCapture(event: MouseEvent) {
  const previewView = sidebarHoverPreviewView.value
  if (!previewView || previewView === props.workspacePrimaryView || currentSidebarPinned.value) return
  if (!isInsideSecondarySidebar(event.target)) return
  emit('switch-workspace-view', previewView)
}

// 点击根入口：把目标视图二级侧栏钉住（持久展开 + 挤压主区）。单真值天然解掉其他视图的钉住。
function handlePinSidebar(view: 'chat' | 'roles') {
  if (!isDesktopViewport.value) return
  sidebarPinnedView.value = view
}

// 点击侧栏右上角收起按钮：全局解除钉住（回 hover 模式），并清掉 hover 残留，确保彻底收回一级窄栏。
function handleUnpinSidebar() {
  sidebarPinnedView.value = ''
  clearSidebarHoverOpen()
}

function collapseRoleSelectionSidebarFromResize() {
  if (props.workspacePrimaryView !== 'roles') return
  forceRoleSidebarCollapsed.value = true
  keepRoleBrainOnNextSidebarClose.value = true
  if (sidebarPinnedView.value === 'roles') sidebarPinnedView.value = ''
  clearSidebarHoverOpen()
  props.actions.updateSidebarOpen(false)
}

function handleContactDraggingChange(dragging: boolean) {
  sidebarContactDragging.value = dragging
  if (!dragging) {
    scheduleSidebarHoverClose()
    return
  }
  cancelSidebarHoverCloseTimer()
  // 拖动锁按「实际展示视图」锁（hover 预览中拖动不能把内容闪回当前视图）。
  sidebarRootHoverView.value = sidebarDisplayView.value === 'chat' || sidebarDisplayView.value === 'roles'
    ? sidebarDisplayView.value
    : sidebarRootHoverView.value
  sidebarPointerInside.value = true
}

function stopSidebarWidthDragLock() {
  sidebarWidthDragging.value = false
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerup', stopSidebarWidthDragLock)
    window.removeEventListener('pointercancel', stopSidebarWidthDragLock)
  }
  scheduleSidebarHoverClose()
}

function startSidebarWidthDragLock() {
  if (!canUseDesktopHoverSidebar.value) return
  cancelSidebarHoverCloseTimer()
  sidebarWidthDragging.value = true
  sidebarRootHoverView.value = sidebarDisplayView.value === 'chat' || sidebarDisplayView.value === 'roles'
    ? sidebarDisplayView.value
    : sidebarRootHoverView.value
  sidebarPointerInside.value = true
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerup', stopSidebarWidthDragLock)
    window.removeEventListener('pointercancel', stopSidebarWidthDragLock)
    window.addEventListener('pointerup', stopSidebarWidthDragLock)
    window.addEventListener('pointercancel', stopSidebarWidthDragLock)
  }
}

function openSidebarHoverForView(view: WorkspacePrimaryView) {
  if (!isDesktopViewport.value || view === 'docs') return
  cancelSidebarHoverCloseTimer()
  sidebarRootHoverView.value = view
  sidebarPointerInside.value = true
  sidebarFocusOpen.value = true
}

function setSidebarHoverOpen(rootView: SidebarRootHoverView | '') {
  if (rootView === 'chat' || rootView === 'roles') {
    cancelSidebarHoverCloseTimer()
    sidebarRootHoverView.value = rootView
    sidebarPointerInside.value = true
    return
  }
  if (rootView === 'none' || rootView === 'docs') {
    sidebarFocusOpen.value = false
    scheduleSidebarHoverClose()
  }
}

function updateSidebarHoverOpen(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  if (!canUseDesktopHoverSidebar.value) return
  sidebarLastPointerPosition = { x: event.clientX, y: event.clientY }
  const rootView = resolveSidebarRootHoverView(event.target) || resolveSidebarRootHoverViewFromPoint(event)
  if (!rootView) {
    if (isInsideSecondarySidebar(event.target)) {
      cancelSidebarHoverCloseTimer()
      sidebarPointerInside.value = true
      return
    }
    if (isInsideSidebarRootNav(event.target)) scheduleSidebarHoverClose()
    return
  }
  if ((rootView === 'chat' || rootView === 'roles') && rootView !== props.workspacePrimaryView && currentSidebarPinned.value) {
    // 钉住态维持旧行为：hover 其他根图标无变化，仅点击切换。
    scheduleSidebarHoverClose()
    return
  }
  setSidebarHoverOpen(rootView)
}

function handleSidebarSlotPointerOver(event: PointerEvent) {
  updateSidebarHoverOpen(event)
}

function handleSidebarSlotPointerMove(event: PointerEvent) {
  updateSidebarHoverOpen(event)
}

function handleSidebarSlotPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  sidebarLastPointerPosition = { x: event.clientX, y: event.clientY }
  sidebarFocusOpen.value = false
  if (refreshSidebarHoverFromPointerPosition(sidebarLastPointerPosition)) return
  scheduleSidebarHoverClose()
}

function handleWindowSidebarPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  sidebarLastPointerPosition = { x: event.clientX, y: event.clientY }
  if (sidebarRootHoverView.value || sidebarHoverCloseTimer) {
    if (refreshSidebarHoverFromPointerPosition(sidebarLastPointerPosition)) return
    sidebarFocusOpen.value = false
    scheduleSidebarHoverClose()
  }
}

function handleSidebarSlotFocusIn(event: FocusEvent) {
  if (!canUseDesktopHoverSidebar.value) return
  const rootView = resolveSidebarRootHoverView(event.target)
  if (!rootView) {
    if (isInsideSidebarRootNav(event.target)) {
      sidebarFocusOpen.value = false
      sidebarRootHoverView.value = ''
    }
    return
  }
  if (rootView !== 'chat' && rootView !== 'roles') {
    sidebarFocusOpen.value = false
    sidebarRootHoverView.value = ''
    return
  }
  sidebarRootHoverView.value = rootView
  sidebarFocusOpen.value = true
}

function handleSidebarSlotFocusOut(event: FocusEvent) {
  const current = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (current && next && current.contains(next)) return
  sidebarFocusOpen.value = false
}

const sidebarResizeHandler = computed(() => (
  props.startSidebarResizeOverride || (props.workspacePrimaryView === 'roles' ? startRoleSidebarResize : startChatSidebarResize)
))

function startSidebarResizeWithHoverLock(event: PointerEvent) {
  startSidebarWidthDragLock()
  sidebarResizeHandler.value(event)
}
const selectedRoleCharacterId = computed(() => roleSelectionCharacterId.value || roleCharacterId.value)
const selectedRoleEntity = computed(() => {
  const selectedId = selectedRoleCharacterId.value
  return [...props.viewModel.characters, ...props.viewModel.crowds]
    .find((entity) => String(entity?.id || '') === selectedId) || null
})
const hydrationRoleEntity = computed(() => {
  const selectedId = roleCharacterId.value
  return [...props.viewModel.characters, ...props.viewModel.crowds]
    .find((entity) => String(entity?.id || '') === selectedId) || null
})
type RoleBrainWorkspaceProjection = {
  characterId: string
  contentPorts: UnitContentPort[]
  unitView: UnitViewAdapterResult
}
const emptyRoleBrainProjection = (): RoleBrainWorkspaceProjection => ({
  characterId: '',
  contentPorts: [],
  unitView: { units: [], relations: [], warnings: [] }
})
const roleBrainHydrationStage = ref<ProgressiveHydrationStage>('idle')
const roleBrainProjectionState = ref<RoleBrainWorkspaceProjection>(emptyRoleBrainProjection())
const roleBrainProjection = createProgressiveHydrationController<Character, RoleBrainWorkspaceProjection>({
  buildShell: (character) => ({
    characterId: String(character.id || '').trim(),
    contentPorts: [],
    unitView: buildCharacterBrainSidebarShellUnitView(character)
  }),
  hydrate: (character) => ({
    characterId: String(character.id || '').trim(),
    contentPorts: buildCharacterBrainContentPorts(character, characterStore.documents || []),
    unitView: buildCharacterBrainUnitView(character)
  }),
  onResult: (projection, _stage, token) => {
    if (token !== roleBrainProjection.getToken()) return
    roleBrainProjectionState.value = projection
  },
  onStage: (stage) => {
    roleBrainHydrationStage.value = stage
  },
  onError: (error) => {
    console.error('[AppChatSection] role brain progressive hydration failed', error)
  }
})
const isRoleBrainWorkspaceHydrating = computed(() => (
  roleBrainHydrationStage.value === 'shell' || roleBrainHydrationStage.value === 'hydrating'
))
const roleUnitView = computed(() => roleBrainProjectionState.value.unitView)
const roleContentPorts = computed(() => roleBrainProjectionState.value.contentPorts)
const roleUnitMap = computed(() => new Map(roleUnitView.value.units.map((unit) => [unit.unitId, unit] as const)))
const roleContentPortMap = computed(() => new Map(roleContentPorts.value.map((port) => [port.unitId, port] as const)))
const selectedRoleUnit = computed(() => roleUnitMap.value.get(activeRoleUnitId.value) || roleUnitView.value.units[0] || null)
const roleRelationUnit = computed(() => roleUnitMap.value.get(roleRelationUnitId.value) || null)
const isRoleCompilePageDialogOpen = computed(() => Boolean(roleCompileDialogUnitId.value))
const roleRelationReadModel = computed(() => buildRelationSystemReadModel([roleUnitView.value]))
const roleRelationHintValidationItems = computed(() => buildRelationHintValidationItems(
  roleRelationReadModel.value,
  roleUnitView.value.warnings
))
const roleRelationHintReferenceCandidates = computed(() => roleRelationReadModel.value.units
  .filter((unit) => unit.unitType !== 'root' && unit.unitType !== 'character')
  .map((unit) => {
    const referenceTitle = formatRelationHintReferenceTitle(unit)
    return {
      unitId: unit.unitId,
      title: String(unit.title || '').trim(),
      referenceTitle,
      refId: getUnitRelationRefId(unit),
      path: String(unit.sourcePath || '').trim(),
      summary: trimRoleReferenceSummary(unit.compilePage?.summary || unit.body || '')
    }
  })
  .filter((item) => item.title && item.referenceTitle && item.refId))
function getRoleBrainHydrationDeps(character: Character | null) {
  if (!character) return []
  return [
    character.id,
    character.name,
    character.groupId || character.group_id,
    character.desc,
    character.appearance,
    character.outfit,
    character.personality,
    character.hobbies,
    character.abilities,
    character.experience,
    character.worldview,
    character.background,
    character.speakingStyle || character.speaking_style,
    character.nicknames,
    character.defaultPreset || character.default_preset,
    character.defaultModel || character.default_model,
    character.brainDocuments,
    character.brain_documents,
    character.brainLinks,
    character.brain_links,
    character.brainTrajectoryMeta,
    character.brain_trajectory_meta,
    character.brainCognitionNodes,
    character.brain_cognition_nodes,
    character.brainTraceNodes,
    character.brain_trace_nodes,
    characterStore.documents
  ]
}
const activeRoleCompileUnit = computed(() => roleUnitMap.value.get(roleCompileDialogUnitId.value) || null)
const activeRoleCompileUnitTitle = computed(() => activeRoleCompileUnit.value?.title || '')
const activeRoleCompileUnitPath = computed(() => {
  const unitId = roleCompileDialogUnitId.value
  return unitId ? `/${getRoleUnitPathParts(unitId).join('/')}` : ''
})
const activeRoleCompilePageModel = computed(() => getRoleCompileDraft(roleCompileDialogUnitId.value))
const activeRoleCompileSemanticType = computed(() => getRoleCompileSemanticDraft(roleCompileDialogUnitId.value))
const activeRoleCompileValidationItems = computed(() => getRoleCompileValidationItems(roleCompileDialogUnitId.value))
const selectedRoleAvatar = computed(() => selectedRoleEntity.value ? props.getCharAvatarById(selectedRoleEntity.value as never) : '')
const selectedRoleEmoji = computed(() => String((selectedRoleEntity.value as { emoji?: string } | null)?.emoji || ''))
const roleAuxPanelMounted = computed(() => rolePreviewPanelMounted.value || roleRelationPanelMounted.value)
const selectedRoleNeuronStats = computed(() => {
  const units = roleUnitView.value.units.filter((unit) => unit.unitType !== 'character')
  const character = selectedRoleEntity.value as Character | null
  const cognitionNodes = character ? readCharacterBrainCognitionNodes(character) : []
  const traceNodes = character ? readCharacterBrainTraceNodes(character) : []
  const pendingNodes = [...cognitionNodes, ...traceNodes].filter((node) => node.pendingReview)
  const created = pendingNodes.filter((node) => node.pendingReview?.mode === 'create').length
  const updated = pendingNodes.filter((node) => node.pendingReview?.mode === 'update').length
  const pending = units.filter((unit) => unit.status === 'pending').length

  return [
    { label: '大脑神经元', value: units.length },
    { label: '新增神经元', value: created },
    { label: '修改过的神经元', value: updated },
    { label: '未确认神经元', value: pending }
  ]
})
const roleWorkspaceWindows = computed<WorkspaceWindowRecord[]>(() => {
  const ids = new Set(roleUnitView.value.units.map((unit) => unit.unitId))
  return (roleWorkspaceState.value.windows || []).filter((window) => (
    ids.has(String(window.sourceId || ''))
  ))
})
const activeRoleWorkspaceWindowId = computed(() => (
  roleWorkspaceWindows.value.some((window) => window.id === roleWorkspaceState.value.activeWindowId)
    ? roleWorkspaceState.value.activeWindowId
    : roleWorkspaceWindows.value[0]?.id || ''
))
const activeRoleWorkspaceWindow = computed(() => (
  roleWorkspaceWindows.value.find((window) => window.id === activeRoleWorkspaceWindowId.value) || null
))
const activeRoleDocumentEditorUnitId = computed(() => {
  const window = activeRoleWorkspaceWindow.value
  if (!window || window.kind !== 'form') return ''
  const unitId = String(window.sourceId || '').trim()
  return canEditRoleUnitDocument(unitId) ? unitId : ''
})
const roleAuxPanelTitle = computed(() => roleAuxPanelMode.value === 'relation' ? '关系视图' : '渲染结果')
const apiPresets = computed<ApiPreset[]>(() => settingStore.apiPresets || [])
const sidebarCurrentTarget = computed(() => props.workspacePrimaryView === 'roles'
  ? selectedRoleCharacterId.value
  : props.viewModel.currentTarget
)
const currentGroupMembers = computed<GroupMemberChip[]>(() => {
  const targetId = String(props.viewModel.currentTarget || '')
  const sessionMembers = Array.isArray(props.viewModel.currentSession?.participants)
    ? props.viewModel.currentSession.participants
    : []
  let rawMembers: Array<any> = sessionMembers
  if (!rawMembers.length && targetId.startsWith('group_')) {
    const rawGroupId = targetId.replace(/^group_/, '')
    const groups = Array.isArray(props.viewModel.groups) ? props.viewModel.groups : []
    const group = groups.find((item) => {
      const itemId = String(item?.id || '')
      return itemId === rawGroupId || itemId === targetId || `group_${itemId}` === targetId
    })
    rawMembers = Array.isArray(group?.members) || typeof group?.members === 'string'
      ? group.members as any
      : []
  }
  let parsedMembers: Array<string | {
    characterId?: string
    character_id?: string
    charId?: string
    char_id?: string
    participantTargetId?: string
    participant_target_id?: string
    targetId?: string
    target_id?: string
    id?: string
    name?: string
    characterName?: string
    character_name?: string
  }> = []
  if (typeof rawMembers === 'string') {
    try {
      const next = JSON.parse(rawMembers)
      if (Array.isArray(next)) parsedMembers = next
    } catch {
      parsedMembers = []
    }
  } else if (Array.isArray(rawMembers)) {
    parsedMembers = rawMembers
  }
  const characters = Array.isArray(props.viewModel.characters) ? props.viewModel.characters : []
  return parsedMembers
    .map((item) => {
      const characterId = typeof item === 'string'
        ? String(item || '').trim()
        : String(
            item?.characterId
            || item?.character_id
            || item?.participantTargetId
            || item?.participant_target_id
            || item?.targetId
            || item?.target_id
            || item?.charId
            || item?.char_id
            || item?.id
            || item?.name
            || item?.characterName
            || item?.character_name
            || ''
          ).trim()
      const character = characters.find((char) => {
        const charId = String(char?.id || '').trim()
        const charName = String(char?.name || '').trim()
        return charId === characterId || charName === characterId
      })
      if (!characterId || !character) return null
      return {
        id: String(character?.id || characterId),
        name: String(character?.name || '角色'),
        avatar: props.getCharAvatarById(character),
        emoji: String(character?.emoji || '')
      }
    })
    .filter((item): item is GroupMemberChip => Boolean(item))
})

// 状态系统角色宿主只认会话参与者 id；不能再用全局 character id 猜写会话世界线。
const statusSystemCharacterOptions = computed<Array<{ id: string; name: string }>>(() => {
  const participants = Array.isArray(props.viewModel.currentSession?.participants)
    ? props.viewModel.currentSession.participants
    : []
  const characters = Array.isArray(props.viewModel.characters) ? props.viewModel.characters : []
  return participants
    .filter((participant: any) => String(participant?.participantType ?? participant?.participant_type ?? '') === 'char')
    .map((participant: any) => {
      const participantId = String(participant?.id || '').trim()
      const characterId = String(participant?.participantTargetId ?? participant?.participant_target_id ?? '').trim()
      const character = characters.find((item: any) => String(item?.id || '').trim() === characterId)
      const resolvedCharacter = participant?.resolvedCharacter ?? participant?.resolved_character
      return {
        id: participantId,
        name: String(resolvedCharacter?.name || character?.name || characterId || participantId)
      }
    })
    .filter((item: { id: string; name: string }) => Boolean(item.id))
})

const currentConversationVisual = computed(() => {
  const targetId = String(props.viewModel.currentTarget || '')
  const sessionAvatar = String(props.viewModel.currentSession?.conversationAvatarPath || props.viewModel.currentSession?.conversation_avatar_path || '')
  const sessionEmoji = String(props.viewModel.currentSession?.conversationEmoji || props.viewModel.currentSession?.conversation_emoji || '')
  if (sessionAvatar || sessionEmoji) {
    return {
      avatar: sessionAvatar,
      emoji: sessionEmoji
    }
  }
  if (currentGroupMembers.value.length > 1) {
    return {
      avatar: '',
      emoji: '会'
    }
  }
  if (targetId.startsWith('group_')) {
    const rawGroupId = targetId.replace(/^group_/, '')
    const group = (Array.isArray(props.viewModel.groups) ? props.viewModel.groups : []).find((item) => {
      const itemId = String(item?.id || '')
      return itemId === rawGroupId || itemId === targetId || `group_${itemId}` === targetId
    }) as (NamedEntity & { avatarPath?: string; avatar_path?: string; emoji?: string }) | undefined
    return {
      avatar: String(group?.avatarPath || group?.avatar_path || ''),
      emoji: String(group?.emoji || '群')
    }
  }
  if (targetId.startsWith('crowd_')) {
    const rawCrowdId = targetId.replace(/^crowd_/, '')
    const crowd = (Array.isArray(props.viewModel.crowds) ? props.viewModel.crowds : []).find((item) => {
      const itemId = String(item?.id || '')
      return itemId === rawCrowdId || itemId === targetId || `crowd_${itemId}` === targetId
    }) as (NamedEntity & { avatarPath?: string; avatar_path?: string; emoji?: string }) | undefined
    return {
      avatar: String(crowd?.avatarPath || crowd?.avatar_path || ''),
      emoji: String(crowd?.emoji || '人')
    }
  }
  const character = props.viewModel.currentCharacter as (NamedEntity & { avatarPath?: string; avatar_path?: string; emoji?: string }) | null
  return {
    avatar: String(props.viewModel.currentCharacterAvatar || character?.avatarPath || character?.avatar_path || ''),
    emoji: String(character?.emoji || '')
  }
})

function openCurrentSessionSettings(targetId: string) {
  closeChatSidebars('')
  const normalizedTargetId = String(targetId || props.viewModel.currentTarget || '').trim()
  if (!normalizedTargetId) return
  if (normalizedTargetId.startsWith('group_')) {
    props.actions.editGroup?.(normalizedTargetId)
    return
  }
  if (normalizedTargetId.startsWith('crowd_')) {
    props.actions.editCrowd?.(normalizedTargetId.replace(/^crowd_/, ''))
    return
  }
  props.actions.editGroup?.(normalizedTargetId)
}

function handleSwitchSession(sessionId: string) {
  return props.actions.switchSession?.(sessionId)
}

const replyPreview = computed<GroupMemberChip>(() => {
  const currentTarget = String(props.viewModel.currentTarget || '').trim()
  const activeName = String(props.viewModel.currentStreamingSpeakerName || '').trim()
  if (currentGroupMembers.value.length > 1 || currentTarget.startsWith('group_')) {
    const activeMember = currentGroupMembers.value.find((member) => member.name === activeName)
    if (activeMember) return activeMember
    const plannedMember = currentGroupMembers.value.find((member) => {
      return (props.viewModel.plannedGroupSpeakers || []).some((speaker) => String(speaker?.id || '').trim() === String(member.id || '').trim())
    })
    if (plannedMember) return plannedMember
    return {
      id: '',
      name: '',
      avatar: '',
      emoji: ''
    }
  }
  const currentCharacter = props.viewModel.currentCharacter
  const fallbackName = activeName || String(currentCharacter?.name || props.viewModel.currentChatTitle || '角色').trim() || '角色'
  return {
    id: String(currentCharacter?.id || fallbackName),
    name: fallbackName,
    avatar: String(props.viewModel.currentCharacterAvatar || props.getCharAvatar(fallbackName) || ''),
    emoji: String(currentCharacter?.emoji || props.getCharEmoji(fallbackName) || '')
  }
})


watch(() => props.workspacePrimaryView, (nextView, previousView) => {
  if (nextView === 'docs') {
    sidebarFocusOpen.value = false
  }
  if (isDesktopViewport.value && nextView !== 'docs' && props.viewModel.sidebarOpen) {
    openSidebarHoverForView(nextView)
  }
  if (nextView !== 'chat') {
    cancelRecallActivityPanelLoad()
  }
  if (nextView === 'docs') {
    hasOpenedDocWorkspace.value = true
  }
  if (nextView === 'roles' && previousView !== 'roles') {
    const pending = pendingRecallUnitOpen.value
    if (pending) {
      pendingRecallUnitOpen.value = null
      openRoleUnitForCharacter(pending.characterId, pending.unitId)
      return
    }
    const pendingRoleCharacterId = pendingRoleBrainOpen.value
    if (pendingRoleCharacterId) {
      pendingRoleBrainOpen.value = ''
      openRoleBrainForCharacter(pendingRoleCharacterId)
      return
    }
    resetRoleWorkspaceEntry()
  }
}, { immediate: true })

watch(() => props.viewModel.sidebarOpen, (nextOpen, previousOpen) => {
  if (nextOpen && isDesktopViewport.value && props.workspacePrimaryView !== 'docs') {
    openSidebarHoverForView(props.workspacePrimaryView)
  }
  if (!nextOpen && previousOpen) {
    clearSidebarHoverOpen()
  }
})

watch(roleCharacterId, (nextCharacterId) => {
  activeRoleUnitId.value = ''
  roleBrainDrawerOpen.value = Boolean(nextCharacterId)
  roleBrainClipboard.value = { mode: '', unitIds: [] }
  roleBrainExpandedUnitIds.value = []
  roleAuxPanelMode.value = 'none'
  resetRoleRelationPanelState()
  roleWorkspaceState.value = createWorkspaceWindowState()
  clearRoleFormDrafts()
  if (!nextCharacterId) {
    roleSelectionCharacterId.value = ''
  }
})

watch(() => getRoleBrainHydrationDeps(hydrationRoleEntity.value as Character | null), () => {
  const character = hydrationRoleEntity.value as Character | null
  if (!character) {
    roleBrainProjection.cancel()
    roleBrainProjectionState.value = emptyRoleBrainProjection()
    return
  }
  const characterId = String(character.id || '').trim()
  const activeProjectionCharacterId = String(roleBrainProjection.getActiveInput()?.id || '').trim()
  if (activeProjectionCharacterId !== characterId) {
    roleBrainProjection.start(character)
    return
  }
  roleBrainProjection.refresh(character)
}, { immediate: true })

watch(() => props.viewModel.sidebarOpen, (nextOpen, previousOpen) => {
  if (nextOpen) {
    sidebarFocusOpen.value = false
  }
  if (props.workspacePrimaryView !== 'roles') return
  if (nextOpen && !previousOpen) {
    forceRoleSidebarCollapsed.value = false
    if (shouldPreserveRoleWorkspaceWhenTogglingRoleSidebar()) {
      return
    }
    resetRoleWorkspaceEntry()
    return
  }
  if (!nextOpen && previousOpen) {
    if (keepRoleBrainOnNextSidebarClose.value) {
      keepRoleBrainOnNextSidebarClose.value = false
      return
    }
    if (shouldPreserveRoleWorkspaceWhenTogglingRoleSidebar()) {
      return
    }
    resetRoleWorkspaceEntry()
  }
})

watch(() => props.viewModel.activeSessionId, (nextSessionId, previousSessionId) => {
  if (nextSessionId !== previousSessionId) {
    recallActivityLoadSeq += 1
    recallActivityLogLoadSeq += 1
    recallActivityLogLoadController?.abort()
    recallActivityLogEntries.value = []
    cancelRecallActivityPanelLoad()
    clearRecallActivityIfBoundToOtherSession(String(nextSessionId || ''))
    // 修问题①·跨会话残留：切到别的会话时，把属于「别的会话」的提调导演带载体清掉，避免纠偏续跑误取别会话的决策流。
    clearTidiaoDirectorStreamRoundIfOtherSession(String(nextSessionId || ''))
    selectedThinkingPanel.value = {
      text: '',
      speakerName: '',
      isThinking: false,
      messageId: 0
    }
    void loadChatMessageNotes(String(nextSessionId || ''))
  }
}, { immediate: true })

watch(
  () => ({
    sessionId: props.viewModel.activeSessionId || '',
    sidebarOpen: recallTraceState.sidebarOpen.value,
    messageIds: (props.viewModel.currentMessages || [])
      .map((message) => resolveChatMessageNumericId(message))
      .filter((messageId) => Number.isInteger(messageId) && messageId > 0)
      .join(',')
  }),
  (snapshot) => {
    if (!snapshot.sessionId) {
      recallActivityLogEntries.value = []
      return
    }
    if (!snapshot.sidebarOpen) return
    void refreshRecallActivityLogEntries()
  },
  { immediate: true }
)

watch(activeRoleDocumentEditorUnitId, (unitId) => {
  if (!unitId) return
  if (roleAuxPanelMode.value === 'relation') {
    focusRoleRelationPanel(unitId, { loading: !roleRelationPanelReady.value })
    return
  }
  if (roleAuxPanelMode.value === 'none') {
    roleAuxPanelMode.value = 'preview'
  }
  if (roleAuxPanelMode.value === 'preview') {
    rolePreviewPanelMounted.value = true
    nextTick(() => syncRoleDocumentPreviewScroll(unitId))
  }
})

function resetRoleWorkspaceEntry() {
  forceRoleSidebarCollapsed.value = false
  roleSelectionCharacterId.value = ''
  roleCharacterId.value = ''
  activeRoleUnitId.value = ''
  roleBrainDrawerOpen.value = false
  roleBrainClipboard.value = { mode: '', unitIds: [] }
  roleBrainExpandedUnitIds.value = []
  roleAuxPanelMode.value = 'none'
  resetRoleRelationPanelState()
  roleWorkspaceState.value = createWorkspaceWindowState()
  clearRoleFormDrafts()
}

function shouldPreserveRoleWorkspaceWhenTogglingRoleSidebar() {
  return Boolean(
    roleCharacterId.value
    && (
      roleBrainDrawerOpen.value
      || roleWorkspaceState.value.windows.length > 0
      || roleAuxPanelMode.value !== 'none'
    )
  )
}

function selectRoleCharacter(characterId: string) {
  const nextCharacterId = String(characterId || '').trim()
  if (!nextCharacterId) return
  const isSameCharacter = selectedRoleCharacterId.value === nextCharacterId
  roleSelectionCharacterId.value = nextCharacterId
  if (isSameCharacter) {
    roleBrainDrawerOpen.value = true
    return
  }
  scheduleRoleCharacterHydration(nextCharacterId)
}

function scheduleRoleCharacterHydration(characterId: string, afterCommit?: () => void) {
  const nextCharacterId = String(characterId || '').trim()
  if (!nextCharacterId) return
  roleBrainDrawerOpen.value = false
  if (roleSelectionHydrationFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(roleSelectionHydrationFrame)
    roleSelectionHydrationFrame = null
  }
  const commit = () => {
    roleSelectionHydrationFrame = null
    if (roleSelectionCharacterId.value !== nextCharacterId) return
    roleCharacterId.value = nextCharacterId
    roleBrainDrawerOpen.value = true
    afterCommit?.()
  }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    roleSelectionHydrationFrame = window.requestAnimationFrame(commit)
    return
  }
  nextTick(commit)
}

function shouldOpenRoleUnitAsForm(unit: { sourceId?: string; contentKind?: string }) {
  const sourceId = String(unit?.sourceId || '').trim()
  return unit?.contentKind === 'form'
    || sourceId === 'brain:avatar'
    || sourceId === 'brain:preset'
    || sourceId === 'brain:trajectory'
}

function shouldUseCompactRoleForm(unitId: string) {
  const sourceId = getRoleUnitSourceNodeId(unitId)
  return sourceId === 'brain:avatar' || sourceId === 'brain:preset'
}

function openRoleUnitWindow(unitId: string, preferredKind?: 'viewer' | 'form') {
  const unit = roleUnitMap.value.get(String(unitId || '').trim())
  if (!unit) return
  activeRoleUnitId.value = unit.unitId
  const shouldKeepFormMode = activeRoleWorkspaceWindow.value?.kind === 'form'
    && (hasRoleUnitFormFields(unit.unitId) || canEditRoleUnitDocument(unit.unitId))
  const requestedKind = shouldOpenRoleUnitAsForm(unit) || (!preferredKind && shouldKeepFormMode)
    ? 'form'
    : (preferredKind || 'viewer')
  const kind = requestedKind === 'form' && !hasRoleUnitFormFields(unit.unitId) && !canEditRoleUnitDocument(unit.unitId)
    ? 'viewer'
    : requestedKind
  roleBrainDrawerOpen.value = true
  if (shouldCollapseRoleSelectionSidebarForUnit(unit.unitId, kind)) {
    collapseRoleSelectionSidebarForFocusedWorkspace()
  }
  if (kind === 'form') {
    initRoleFormDraft(unit.unitId)
  }
  if (kind === 'form' && canEditRoleUnitDocument(unit.unitId)) {
    rolePreviewPanelMounted.value = true
    if (roleAuxPanelMode.value === 'none') {
      roleAuxPanelMode.value = 'preview'
    } else if (roleAuxPanelMode.value === 'relation') {
      focusRoleRelationPanel(unit.unitId, { loading: !roleRelationPanelReady.value })
    }
  } else if (roleAuxPanelMode.value === 'relation') {
    focusRoleRelationPanel(unit.unitId, { loading: !roleRelationPanelReady.value })
  }
  const nextWindow = createUnitWorkspaceWindow({
    domain: 'characterBrain',
    id: `role-unit:${kind}:${unit.unitId}`,
    kind,
    title: kind === 'form' ? `${unit.title} · 编辑` : unit.title,
    unitId: unit.unitId,
    sourceId: unit.unitId,
    sourceKind: String(unit.unitType || unit.contentKind || 'unit'),
    closable: true
  })
  roleWorkspaceState.value = createWorkspaceWindowState([nextWindow])
}

function handleRoleBrainTreeExpandedChange(unitIds: string[]) {
  roleBrainExpandedUnitIds.value = normalizeRoleUnitIdList(unitIds)
}

function handleRoleRelationOpenUnit(unitId: string) {
  const unit = roleUnitMap.value.get(String(unitId || '').trim())
  if (!unit) return
  if (isTrajectoryExpandableRoleUnit(unit)) {
    toggleRoleTrajectoryAxisUnit(unit.unitId)
  }
  openRoleUnitWindow(unit.unitId, 'viewer')
}

function toggleRoleTrajectoryAxisUnit(unitId: string) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const next = new Set(roleBrainExpandedUnitIds.value)
  if (next.has(normalizedUnitId)) {
    next.delete(normalizedUnitId)
    collectRoleUnitDescendantIds(normalizedUnitId).forEach((descendantId) => next.delete(descendantId))
  } else {
    next.add(normalizedUnitId)
  }
  roleBrainExpandedUnitIds.value = Array.from(next)
}

function collectRoleUnitDescendantIds(unitId: string) {
  const result: string[] = []
  const visited = new Set<string>()
  const visit = (parentId: string) => {
    if (visited.has(parentId)) return
    visited.add(parentId)
    roleUnitView.value.units
      .filter((unit) => String(unit.parentId || '') === parentId)
      .forEach((unit) => {
        result.push(unit.unitId)
        visit(unit.unitId)
      })
  }
  visit(unitId)
  return result
}

function isTrajectoryExpandableRoleUnit(unit: { domain?: string; unitType?: string; contentKind?: string }) {
  return unit.domain === 'trace' && (unit.contentKind === 'group' || unit.unitType === 'traceGroup')
}

function normalizeRoleUnitIdList(unitIds: string[]) {
  return Array.from(new Set((unitIds || []).map((unitId) => String(unitId || '').trim()).filter(Boolean)))
}

function collapseRoleSelectionSidebarForFocusedWorkspace() {
  if (props.workspacePrimaryView !== 'roles') return
  forceRoleSidebarCollapsed.value = true
  if (!isDesktopViewport.value) return
  // 专注工作区=本次收起：解除角色视图钉住并清 hover（hover 能力保留，之后仍可 hover 根图标唤出）。
  if (sidebarPinnedView.value === 'roles') sidebarPinnedView.value = ''
  clearSidebarHoverOpen()
  if (!props.viewModel.sidebarOpen) return
  keepRoleBrainOnNextSidebarClose.value = true
  props.actions.updateSidebarOpen(false)
}

function shouldCollapseRoleSelectionSidebarForUnit(unitId: string, kind: 'viewer' | 'form') {
  if (kind === 'form') return true
  const port = getRoleUnitContentPort(unitId)
  return Boolean(port && port.domain === 'characterCore' && port.contentKind === 'markdown')
}

function getRoleUnitSourceNodeId(unitId: string) {
  return String(roleUnitMap.value.get(String(unitId || '').trim())?.sourceId || '').trim()
}

function getSelectedRoleCharacter() {
  const entity = selectedRoleEntity.value
  if (!entity || !String(entity.id || '').trim()) return null
  return entity as unknown as Character
}

function buildRoleUnitCard(unitId: string) {
  const character = getSelectedRoleCharacter()
  const sourceNodeId = getRoleUnitSourceNodeId(unitId)
  if (!character || !sourceNodeId) return null
  return buildCharacterBrainCard(character, sourceNodeId)
}

const getRoleUnitFormFields = (unitId: string): CharacterBrainCardFormField[] => {
  return buildRoleUnitCard(unitId)?.formFields || []
}

const hasRoleUnitFormFields = (unitId: string) => {
  return getRoleUnitFormFields(unitId).length > 0
}

const canEditRoleUnitDocument = (unitId: string) => {
  const port = getRoleUnitContentPort(unitId)
  if (String(port?.sourceId || '').trim() === 'brain:trajectory') return false
  return Boolean(port && (
    (port.domain === 'characterCore' && port.contentKind === 'markdown')
    || (port.domain === 'characterSoul' && (
      port.contentKind === 'markdown'
      || port.contentKind === 'group'
    ))
    || (port.domain === 'characterTrace' && (
      port.contentKind === 'markdown'
      || port.contentKind === 'group'
    ))
  ))
}

function isRoleDocumentTitleReadonly(unitId: string) {
  const unit = roleUnitMap.value.get(String(unitId || '').trim())
  return Boolean(unit?.metadata?.titleReadonly)
}

function shouldShowRoleDocumentSubtitle(unitId: string) {
  const unit = roleUnitMap.value.get(String(unitId || '').trim())
  return unit?.unitType === 'traceDay' || unit?.unitType === 'traceGroup'
}

function getRoleStoredCompilePage(unitId: string) {
  const character = getSelectedRoleCharacter()
  const sourceNodeId = getRoleUnitSourceNodeId(unitId)
  if (!character || !sourceNodeId) return null
  return readCharacterBrainCompilePage(character, sourceNodeId)
}

async function openCreatedRoleUnitEditor(sourceId: string) {
  await nextTick()
  const unitId = resolveCreatedRoleUnitId(roleUnitView.value.units, sourceId)
  if (unitId) openRoleUnitWindow(unitId, 'form')
}

function initRoleFormDraft(unitId: string) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const port = getRoleUnitContentPort(normalizedUnitId)
  if (canEditRoleUnitDocument(normalizedUnitId)) {
    const storedCompilePage = getRoleStoredCompilePage(normalizedUnitId)
    const compilePage = port?.effectiveVersion.compilePage || {
      summary: port?.summary || '',
      tags: port?.tags || [],
      relationHints: port?.relationHints || []
    }
    const documentContent = port?.effectiveVersion.body || port?.body || port?.formText || ''
    roleFormDrafts[normalizedUnitId] = {
      documentTitle: port?.effectiveVersion.title || port?.title || getRoleUnitTitle(normalizedUnitId),
      documentSubtitle: String(port?.metadata?.subtitle || ''),
      documentContent,
      ...buildRoleArrangementDraftFields(port),
      'compile.summary': compilePage.summary || '',
      'compile.tags': [...(compilePage.tags || [])],
      'compile.relationHints': [...(compilePage.relationHints || [])],
      'compile.scoreDirectBase': compilePage.scoreDirectBase,
      'compile.scoreExpandBase': compilePage.scoreExpandBase,
      'compile.scoreSelfAnchor': compilePage.scoreSelfAnchor,
      'compile.scoreUserAnchor': compilePage.scoreUserAnchor,
      'compile.scoreOtherAnchor': compilePage.scoreOtherAnchor,
      'compile.semanticType': storedCompilePage?.semanticType || 'other',
      sourceDocumentId: port?.metadata?.sourceDocumentId || '',
      sourceSnapshotTitle: port?.title || '',
      sourceSnapshotSummary: port?.summary || ''
    }
    resetRoleDocumentDraftHistory(normalizedUnitId, documentContent)
    return
  }
  const fields = getRoleUnitFormFields(normalizedUnitId)
  if (fields.length) {
    roleFormDrafts[normalizedUnitId] = Object.fromEntries(
      fields.map((field) => [field.key, String(field.value ?? '')])
    )
    return
  }
  const compilePage = port?.effectiveVersion.compilePage || {
    summary: port?.summary || '',
    tags: port?.tags || [],
    relationHints: port?.relationHints || []
  }
  const documentContent = port?.effectiveVersion.body || port?.body || port?.formText || ''
  roleFormDrafts[normalizedUnitId] = {
    documentTitle: port?.effectiveVersion.title || port?.title || getRoleUnitTitle(normalizedUnitId),
    documentSubtitle: String(port?.metadata?.subtitle || ''),
    documentContent,
    ...buildRoleArrangementDraftFields(port),
    'compile.summary': compilePage.summary || '',
    'compile.tags': [...(compilePage.tags || [])],
    'compile.relationHints': [...(compilePage.relationHints || [])],
    'compile.scoreDirectBase': compilePage.scoreDirectBase,
    'compile.scoreExpandBase': compilePage.scoreExpandBase,
    'compile.scoreSelfAnchor': compilePage.scoreSelfAnchor,
    'compile.scoreUserAnchor': compilePage.scoreUserAnchor,
    'compile.scoreOtherAnchor': compilePage.scoreOtherAnchor,
    sourceDocumentId: port?.metadata?.sourceDocumentId || '',
    sourceSnapshotTitle: port?.title || '',
    sourceSnapshotSummary: port?.summary || ''
  }
  resetRoleDocumentDraftHistory(normalizedUnitId, documentContent)
}

function buildRoleArrangementDraftFields(port: UnitContentPort | null | undefined): Record<string, unknown> {
  if (!port || port.metadata?.systemRole !== 'arrangementLeaf') return {}
  const activationRule = (port.metadata?.activationRule || {}) as Record<string, unknown>
  const recallPolicy = (port.metadata?.recallPolicy || {}) as Record<string, unknown>
  const startTime = String(activationRule.startTime || '').trim()
  const endTime = String(activationRule.endTime || '').trim()
  return {
    'arrangement.date': String(activationRule.date || port.metadata?.pointDate || '').trim(),
    'arrangement.recurrence': String(activationRule.recurrence || 'once').trim(),
    'arrangement.allDay': !startTime && !endTime,
    'arrangement.startTime': startTime,
    'arrangement.endTime': endTime,
    'arrangement.prewarmMinutes': String(activationRule.prewarmMinutes ?? 0),
    'arrangement.graceMinutes': String(activationRule.graceMinutes ?? 0),
    'arrangement.recallLevel': recallPolicy.level === 'body' ? 'body' : 'summary',
    'arrangement.recallPriority': recallPolicy.priority === 'must' ? 'must' : 'normal'
  }
}

function clearRoleFormDrafts() {
  Object.keys(roleFormDrafts).forEach((key) => {
    delete roleFormDrafts[key]
  })
  Object.keys(roleDocumentDraftHistories).forEach((key) => {
    delete roleDocumentDraftHistories[key]
  })
  roleDraftSaveVersions.clear()
}

function getRoleFormDraft(unitId: string) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return {}
  if (!roleFormDrafts[normalizedUnitId]) initRoleFormDraft(normalizedUnitId)
  return roleFormDrafts[normalizedUnitId] || {}
}

function getRoleFormDraftValue(unitId: string, fieldKey: string) {
  return String(getRoleFormDraft(unitId)[fieldKey] ?? '')
}

function isRoleArrangementUnit(unitId: string) {
  return roleUnitMap.value.get(String(unitId || '').trim())?.unitType === 'traceArrangement'
}

function getRoleArrangementSettings(unitId: string): RoleArrangementEditorSettings | null {
  const normalizedUnitId = String(unitId || '').trim()
  if (!isRoleArrangementUnit(normalizedUnitId)) return null
  const draft = getRoleFormDraft(normalizedUnitId)
  return {
    date: String(draft['arrangement.date'] || ''),
    recurrence: String(draft['arrangement.recurrence'] || 'once'),
    allDay: Boolean(draft['arrangement.allDay']),
    startTime: String(draft['arrangement.startTime'] || ''),
    endTime: String(draft['arrangement.endTime'] || ''),
    prewarmMinutes: String(draft['arrangement.prewarmMinutes'] ?? '0'),
    graceMinutes: String(draft['arrangement.graceMinutes'] ?? '0'),
    recallLevel: String(draft['arrangement.recallLevel'] || 'summary'),
    recallPriority: String(draft['arrangement.recallPriority'] || 'normal')
  }
}

function updateRoleArrangementSettings(unitId: string, patch: Partial<RoleArrangementEditorSettings>) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!isRoleArrangementUnit(normalizedUnitId)) return
  Object.entries(patch).forEach(([key, value]) => {
    updateRoleFormDraftValue(normalizedUnitId, `arrangement.${key}`, value)
  })
  if (patch.allDay === true) {
    updateRoleFormDraftValue(normalizedUnitId, 'arrangement.startTime', '')
    updateRoleFormDraftValue(normalizedUnitId, 'arrangement.endTime', '')
  }
}

function updateRoleFormDraftValue(unitId: string, fieldKey: string, value: unknown) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId || !fieldKey) return
  if (!roleFormDrafts[normalizedUnitId]) initRoleFormDraft(normalizedUnitId)
  roleDraftSaveVersions.touch(normalizedUnitId)
  roleFormDrafts[normalizedUnitId][fieldKey] = value
  if (fieldKey === 'documentContent') {
    pushRoleDocumentDraftHistory(normalizedUnitId, String(value ?? ''))
    nextTick(() => syncRoleDocumentPreviewScroll(normalizedUnitId))
  }
}

function normalizeOptionalCompileScore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function resetRoleDocumentDraftHistory(unitId: string, value: string) {
  roleDocumentDraftHistories[unitId] = { values: [value], index: 0 }
}

function pushRoleDocumentDraftHistory(unitId: string, value: string) {
  const current = roleDocumentDraftHistories[unitId]
  if (!current) {
    resetRoleDocumentDraftHistory(unitId, value)
    return
  }
  const values = current.values.slice(0, current.index + 1)
  if (values[values.length - 1] === value) return
  values.push(value)
  current.values = values.slice(-60)
  current.index = current.values.length - 1
}

function applyRoleDocumentDraftHistory(unitId: string, direction: 'undo' | 'redo') {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  if (!roleFormDrafts[normalizedUnitId]) initRoleFormDraft(normalizedUnitId)
  const currentContent = getRoleFormDraftValue(normalizedUnitId, 'documentContent')
  if (!roleDocumentDraftHistories[normalizedUnitId]) {
    resetRoleDocumentDraftHistory(normalizedUnitId, currentContent)
  }
  const history = roleDocumentDraftHistories[normalizedUnitId]
  if (!history) return
  if (direction === 'undo') {
    if (history.index <= 0) return
    history.index -= 1
  } else {
    if (history.index >= history.values.length - 1) return
    history.index += 1
  }
  roleFormDrafts[normalizedUnitId].documentContent = history.values[history.index] || ''
  nextTick(() => syncRoleDocumentPreviewScroll(normalizedUnitId))
}

function undoRoleDocumentDraft(unitId: string) {
  applyRoleDocumentDraftHistory(unitId, 'undo')
}

function redoRoleDocumentDraft(unitId: string) {
  applyRoleDocumentDraftHistory(unitId, 'redo')
}

const getRoleCompileDraft = (unitId: string): UnitViewCompilePage => {
  const draft = getRoleFormDraft(unitId)
  return {
    summary: String(draft['compile.summary'] ?? '').trim(),
    tags: Array.isArray(draft['compile.tags'])
      ? draft['compile.tags'].map((item) => String(item || '').trim()).filter(Boolean)
      : String(draft['compile.tags'] ?? '').split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean),
    relationHints: Array.isArray(draft['compile.relationHints'])
      ? draft['compile.relationHints'].map((item) => String(item || '').trim()).filter(Boolean)
      : String(draft['compile.relationHints'] ?? '').split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean),
    scoreDirectBase: normalizeOptionalCompileScore(draft['compile.scoreDirectBase']),
    scoreExpandBase: normalizeOptionalCompileScore(draft['compile.scoreExpandBase']),
    scoreSelfAnchor: normalizeOptionalCompileScore(draft['compile.scoreSelfAnchor']),
    scoreUserAnchor: normalizeOptionalCompileScore(draft['compile.scoreUserAnchor']),
    scoreOtherAnchor: normalizeOptionalCompileScore(draft['compile.scoreOtherAnchor'])
  }
}

const getRoleCompileSemanticDraft = (unitId: string): UnitSemanticType => {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return 'other'
  const draft = getRoleFormDraft(normalizedUnitId)
  return normalizeUnitSemanticType(
    draft['compile.semanticType']
      ?? getRoleStoredCompilePage(normalizedUnitId)?.semanticType
      ?? roleUnitMap.value.get(normalizedUnitId)?.semanticType
      ?? 'other'
  )
}

const updateRoleCompileDraft = (unitId: string, page: UnitViewCompilePage) => {
  updateRoleFormDraftValue(unitId, 'compile.summary', page.summary || '')
  updateRoleFormDraftValue(unitId, 'compile.tags', [...(page.tags || [])])
  updateRoleFormDraftValue(unitId, 'compile.relationHints', [...(page.relationHints || [])])
  updateRoleFormDraftValue(unitId, 'compile.scoreDirectBase', page.scoreDirectBase)
  updateRoleFormDraftValue(unitId, 'compile.scoreExpandBase', page.scoreExpandBase)
  updateRoleFormDraftValue(unitId, 'compile.scoreSelfAnchor', page.scoreSelfAnchor)
  updateRoleFormDraftValue(unitId, 'compile.scoreUserAnchor', page.scoreUserAnchor)
  updateRoleFormDraftValue(unitId, 'compile.scoreOtherAnchor', page.scoreOtherAnchor)
}

function updateRoleCompileSemanticDraft(unitId: string, semanticType: UnitSemanticType) {
  updateRoleFormDraftValue(unitId, 'compile.semanticType', normalizeUnitSemanticType(semanticType))
}

function getRoleCompileValidationItems(unitId: string) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return []
  const unit = roleUnitMap.value.get(normalizedUnitId)
  if (!unit) return []
  return roleRelationHintValidationItems.value.filter((item) => item.ownerUnitId === unit.unitId)
}

function trimRoleReferenceSummary(input: unknown) {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  return text.length > 30 ? `${text.slice(0, 30)}...` : text
}

function openRoleCompilePageDialog(unitId: string) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId || !canEditRoleUnitDocument(normalizedUnitId)) return
  initRoleFormDraft(normalizedUnitId)
  roleCompileDialogUnitId.value = normalizedUnitId
}

function closeRoleCompilePageDialog() {
  roleCompileDialogUnitId.value = ''
}

function updateActiveRoleCompileDraft(page: UnitViewCompilePage) {
  if (!roleCompileDialogUnitId.value) return
  updateRoleCompileDraft(roleCompileDialogUnitId.value, page)
}

function updateActiveRoleCompileSemanticType(semanticType: UnitSemanticType) {
  if (!roleCompileDialogUnitId.value) return
  updateRoleCompileSemanticDraft(roleCompileDialogUnitId.value, semanticType)
}

function saveRoleCompilePageDialogDraft() {
  toast('已暂存', 'success')
}

function saveRoleCompilePageDialogApply() {
  const unitId = roleCompileDialogUnitId.value
  if (!unitId) return
  closeRoleCompilePageDialog()
  saveRoleUnitForm(unitId, { waitForPersist: false })
}

function revalidateRoleCompilePageDialog() {
  toast('已重新校验', 'success')
}

function removeRoleRelationHintLines(unitId: string, lines: string[]) {
  const normalizedUnitId = String(unitId || '').trim()
  const targets = new Set(lines.map((line) => String(line || '').trim()).filter(Boolean))
  if (!normalizedUnitId || !targets.size) return
  const page = getRoleCompileDraft(normalizedUnitId)
  updateRoleCompileDraft(normalizedUnitId, {
    ...page,
    relationHints: page.relationHints.filter((line) => !targets.has(String(line || '').trim()))
  })
}

function deleteRoleDuplicateRelationHint(entry: CompileRelationIssueDuplicateEvidence) {
  const unitId = roleCompileDialogUnitId.value
  if (!unitId || !entry?.line) return
  removeRoleRelationHintLines(unitId, [entry.line])
}

function editRoleDuplicateRelationHint(entry: CompileRelationIssueDuplicateEvidence) {
  if (!entry?.ownerUnitId) return
  openRoleUnitWindow(entry.ownerUnitId, 'form')
}

function deleteAllRoleDuplicateRelationHints(issues: CompileRelationIssue[]) {
  const unitId = roleCompileDialogUnitId.value
  if (!unitId) return
  removeRoleRelationHintLines(unitId, issues.map((issue) => issue.line))
}

function setRoleDocumentEditorRef(unitId: string, element: Element | ComponentPublicInstance | null) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const candidate = element as ComponentPublicInstance & Partial<RoleDocumentEditorWorkspaceExpose>
  if (typeof candidate?.getTextareaElement === 'function') {
    roleDocumentEditorRefs.set(normalizedUnitId, {
      getTextareaElement: candidate.getTextareaElement
    })
    return
  }
  roleDocumentEditorRefs.delete(normalizedUnitId)
}

function setRoleDocumentPreviewPaneRef(unitId: string, element: Element | ComponentPublicInstance | null) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const candidate = element as ComponentPublicInstance & Partial<RoleDocumentPreviewPaneExpose>
  if (typeof candidate?.getPreviewElement === 'function') {
    roleDocumentPreviewPaneRefs.set(normalizedUnitId, {
      getPreviewElement: candidate.getPreviewElement
    })
    nextTick(() => syncRoleDocumentPreviewScroll(normalizedUnitId))
    return
  }
  roleDocumentPreviewPaneRefs.delete(normalizedUnitId)
}

function renderRoleDocumentPreviewHtml(unitId: string) {
  const content = getRoleFormDraftValue(unitId, 'documentContent').trim()
  return content ? renderMarkdownToHtml(content) : ''
}

function runRoleDocumentScrollSync(unitId: string, direction: 'editor-to-preview' | 'preview-to-editor') {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const textarea = roleDocumentEditorRefs.get(normalizedUnitId)?.getTextareaElement() || null
  const preview = roleDocumentPreviewPaneRefs.get(normalizedUnitId)?.getPreviewElement() || null
  if (!textarea || !preview || isSyncingRoleDocumentScroll) return
  isSyncingRoleDocumentScroll = true
  if (direction === 'editor-to-preview') {
    syncScrollByRatio(textarea, preview)
  } else {
    syncScrollByRatio(preview, textarea)
  }
  requestAnimationFrame(() => {
    isSyncingRoleDocumentScroll = false
  })
}

function syncRoleDocumentPreviewScroll(unitId: string) {
  runRoleDocumentScrollSync(unitId, 'editor-to-preview')
}

function syncRoleDocumentScrollFromEditor(unitId: string) {
  runRoleDocumentScrollSync(unitId, 'editor-to-preview')
}

function syncRoleDocumentScrollFromPreview(unitId: string) {
  runRoleDocumentScrollSync(unitId, 'preview-to-editor')
}

function replaceRoleDocumentSelection(unitId: string, buildText: (selectedText: string) => string) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const currentContent = getRoleFormDraftValue(normalizedUnitId, 'documentContent')
  const textarea = roleDocumentEditorRefs.get(normalizedUnitId)?.getTextareaElement() || null
  const start = textarea?.selectionStart ?? currentContent.length
  const end = textarea?.selectionEnd ?? currentContent.length
  const selectedText = currentContent.slice(start, end)
  const nextText = buildText(selectedText)
  const nextContent = `${currentContent.slice(0, start)}${nextText}${currentContent.slice(end)}`
  updateRoleFormDraftValue(normalizedUnitId, 'documentContent', nextContent)
  nextTick(() => {
    const nextTextarea = roleDocumentEditorRefs.get(normalizedUnitId)?.getTextareaElement() || null
    if (!nextTextarea) return
    nextTextarea.focus()
    nextTextarea.setSelectionRange(start, start + nextText.length)
  })
}

function wrapRoleDocumentSelection(unitId: string, marker: string, endMarker = marker) {
  replaceRoleDocumentSelection(unitId, (selectedText) => {
    const text = selectedText || '文本'
    return `${marker}${text}${endMarker}`
  })
}

function insertRoleDocumentHeading(unitId: string, level: 1 | 2 | 3) {
  replaceRoleDocumentSelection(unitId, (selectedText) => {
    const title = selectedText.trim() || '标题'
    return `${'#'.repeat(level)} ${title}`
  })
}

function insertRoleDocumentLink(unitId: string) {
  replaceRoleDocumentSelection(unitId, (selectedText) => `[${selectedText || '链接文字'}](https://)`)
}

function insertRoleDocumentTable(unitId: string) {
  replaceRoleDocumentSelection(unitId, () => '\n| 标题 | 说明 |\n| --- | --- |\n| 内容 | 内容 |\n')
}

function insertRoleDocumentCodeBlock(unitId: string) {
  replaceRoleDocumentSelection(unitId, (selectedText) => `\n\`\`\`\n${selectedText || '代码'}\n\`\`\`\n`)
}

function insertRoleDocumentImage(unitId: string) {
  replaceRoleDocumentSelection(unitId, (selectedText) => `![${selectedText || '图片描述'}](图片地址)`)
}

function normalizeAvailableModels(rawModels: unknown): string[] {
  if (Array.isArray(rawModels)) {
    return rawModels.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof rawModels !== 'string') return []
  try {
    const parsed = JSON.parse(rawModels)
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function getRoleFormPreset(unitId: string) {
  const presetName = getRoleFormDraftValue(unitId, 'defaultPreset')
  return apiPresets.value.find((item) => item.name === presetName) || null
}

function getRoleFormModelOptions(unitId: string) {
  const preset = getRoleFormPreset(unitId)
  return normalizeAvailableModels(preset?.availableModels ?? preset?.available_models)
}

function shouldShowRoleCustomModel(unitId: string) {
  const model = getRoleFormDraftValue(unitId, 'defaultModel').trim()
  return Boolean(model) && !getRoleFormModelOptions(unitId).includes(model)
}

async function loadRoleUnitPresetModels(unitId: string) {
  const preset = getRoleFormPreset(unitId)
  if (!preset) return
  modelLoadingRoleUnitId.value = String(unitId || '').trim()
  try {
    const res = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await res.json() as { data?: Array<{ id?: string }>; error?: string }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    const models = Array.isArray(data.data)
      ? data.data.map((item) => String(item.id || '').trim()).filter(Boolean)
      : []
    await settingStore.updateApiPreset(preset.name, { availableModels: models })
  } catch (error) {
    console.error('加载角色页模型列表失败:', error)
  } finally {
    modelLoadingRoleUnitId.value = ''
  }
}

type RoleUnitSaveOptions = {
  waitForPersist?: boolean
}

function deferRoleUnitSave(task: () => void) {
  if (typeof window === 'undefined') {
    task()
    return
  }
  window.setTimeout(task, 0)
}

function saveRoleUnitForm(unitId: string, options: RoleUnitSaveOptions = {}) {
  const normalizedUnitId = String(unitId || '').trim()
  const waitForPersist = options.waitForPersist !== false
  if (!waitForPersist) {
    deferRoleUnitSave(() => {
      void saveRoleUnitForm(normalizedUnitId, { waitForPersist: true })
    })
    return true
  }
  const character = getSelectedRoleCharacter()
  const sourceNodeId = getRoleUnitSourceNodeId(normalizedUnitId)
  if (!character || !sourceNodeId) return false
  const saveToken = roleDraftSaveVersions.begin(normalizedUnitId)
  const changes = applyCharacterBrainCardDraft(character, sourceNodeId, getRoleFormDraft(normalizedUnitId))
  if (!Object.keys(changes).length) {
    toast('没有需要保存的修改', 'info')
    return true
  }
  const persist = characterStore.updateCharacter(String(character.id || ''), changes as Partial<Character>)
  const handleConfirmedSuccess = () => {
    if (!roleDraftSaveVersions.isLatest(saveToken)) return
    initRoleFormDraft(normalizedUnitId)
    toast('已保存', 'success')
  }
  const handleFailure = (error: unknown) => {
    if (!roleDraftSaveVersions.isLatest(saveToken)) {
      console.error('保存角色页单位失败，已保留更新后的草稿:', error)
      return
    }
    initRoleFormDraft(normalizedUnitId)
    console.error('保存角色页单位失败:', error)
    toast('保存失败', 'error')
  }
  return persist
    .then(() => {
      handleConfirmedSuccess()
      return true
    })
    .catch((error) => {
      handleFailure(error)
      return false
    })
}

function resolveRolePendingTarget(unitId: string): 'soul' | 'trace' | 'arrangement' | '' {
  const port = getRoleUnitContentPort(unitId)
  if (!port?.pendingVersion) return ''
  if (port.domain === 'characterSoul') return 'soul'
  if (port.domain === 'characterArrangement') return 'arrangement'
  if (port.domain === 'characterTrace') return 'trace'
  return ''
}

async function confirmRolePendingVersion(unitId: string) {
  const character = getSelectedRoleCharacter()
  const sourceNodeId = getRoleUnitSourceNodeId(unitId)
  const target = resolveRolePendingTarget(unitId)
  if (!character || !sourceNodeId || !target) return
  try {
    const changes = confirmCharacterBrainPendingVersion(character, target, sourceNodeId)
    if (!Object.keys(changes).length) {
      toast('没有可应用的待确认版本', 'info')
      return
    }
    await characterStore.updateCharacter(String(character.id || ''), changes as Partial<Character>)
    initRoleFormDraft(unitId)
    toast('已应用待确认版本', 'success')
  } catch (error) {
    console.error('应用角色页待确认版本失败:', error)
    toast('应用待确认版本失败', 'error')
  }
}

async function rejectRolePendingVersion(unitId: string) {
  const character = getSelectedRoleCharacter()
  const sourceNodeId = getRoleUnitSourceNodeId(unitId)
  const target = resolveRolePendingTarget(unitId)
  if (!character || !sourceNodeId || !target) return
  try {
    const changes = rejectCharacterBrainPendingVersion(character, target, sourceNodeId)
    if (!Object.keys(changes).length) {
      toast('没有可退回的待确认版本', 'info')
      return
    }
    await characterStore.updateCharacter(String(character.id || ''), changes as Partial<Character>)
    if (roleWorkspaceState.value.windows.some((window) => window.sourceId === unitId)) {
      closeRoleWorkspaceWindowBySource(unitId)
    }
    toast('已退回待确认版本', 'success')
  } catch (error) {
    console.error('退回角色页待确认版本失败:', error)
    toast('退回待确认版本失败', 'error')
  }
}

function openSelectedRoleUnitViewer() {
  if (!activeRoleUnitId.value) return
  openRoleUnitWindow(activeRoleUnitId.value, 'viewer')
}

function openSelectedRoleUnitEditor() {
  if (!activeRoleUnitId.value) return
  openRoleUnitWindow(activeRoleUnitId.value, 'form')
}

function openRoleBrainDrawer() {
  roleBrainDrawerOpen.value = true
}

function openSelectedRoleEditor() {
  const character = selectedRoleEntity.value
  if (!character) return
  props.actions.openCharacterEditor?.(character as never)
}

function openRoleRelationPanel(unitId?: string) {
  if (!selectedRoleEntity.value) return
  const nextUnitId = String(unitId || activeRoleUnitId.value || '').trim()
  if (nextUnitId && roleUnitMap.value.has(nextUnitId)) activeRoleUnitId.value = nextUnitId
  const targetUnitId = nextUnitId && roleUnitMap.value.has(nextUnitId)
    ? nextUnitId
    : selectedRoleUnit.value?.unitId || ''
  if (!targetUnitId) return
  if (props.workspacePrimaryView === 'roles') {
    forceRoleSidebarCollapsed.value = true
  }
  roleBrainDrawerOpen.value = true
  collapseRoleSelectionSidebarForFocusedWorkspace()
  const shouldLoad = roleAuxPanelMode.value !== 'relation'
    || !roleRelationPanelMounted.value
    || !roleRelationPanelReady.value
  roleAuxPanelMode.value = 'relation'
  focusRoleRelationPanel(targetUnitId, { loading: shouldLoad })
}

function openRolePreviewPanel(unitId?: string) {
  const nextUnitId = String(unitId || activeRoleDocumentEditorUnitId.value || activeRoleUnitId.value || '').trim()
  if (!nextUnitId || !canEditRoleUnitDocument(nextUnitId)) return
  activeRoleUnitId.value = nextUnitId
  rolePreviewPanelMounted.value = true
  roleAuxPanelMode.value = 'preview'
  nextTick(() => syncRoleDocumentPreviewScroll(nextUnitId))
}

function closeRoleAuxPanel() {
  const editorUnitId = activeRoleDocumentEditorUnitId.value
  roleAuxPanelMode.value = 'none'
  resetRoleRelationPanelState()
  if (editorUnitId) {
    closeRoleDocumentEditorToViewer(editorUnitId)
  }
}

function closeRoleDocumentEditorToViewer(unitId: string) {
  const unit = roleUnitMap.value.get(String(unitId || '').trim())
  if (!unit) return
  activeRoleUnitId.value = unit.unitId
  roleBrainDrawerOpen.value = true
  const viewerWindow = createUnitWorkspaceWindow({
    domain: 'characterBrain',
    id: `role-unit:viewer:${unit.unitId}`,
    kind: 'viewer',
    title: unit.title,
    unitId: unit.unitId,
    sourceId: unit.unitId,
    sourceKind: String(unit.unitType || unit.contentKind || 'unit'),
    closable: true
  })
  roleWorkspaceState.value = createWorkspaceWindowState([viewerWindow])
}

function resetRoleRelationPanelState() {
  cancelRoleRelationPanelLoad()
  roleRelationPanelMounted.value = false
  roleRelationPanelReady.value = false
  roleRelationPanelLoading.value = false
  roleRelationUnitId.value = ''
}

function cancelRoleRelationPanelLoad() {
  if (roleRelationLoadFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(roleRelationLoadFrame)
  }
  roleRelationLoadFrame = null
  if (roleRelationLoadTimer) {
    clearTimeout(roleRelationLoadTimer)
    roleRelationLoadTimer = null
  }
}

function scheduleRoleRelationPanelLoad(unitId: string) {
  cancelRoleRelationPanelLoad()
  roleRelationPanelReady.value = false
  roleRelationPanelLoading.value = true
  roleRelationLoadStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (typeof window === 'undefined') {
    roleRelationUnitId.value = unitId
    roleRelationPanelReady.value = true
    finishRoleRelationPanelLoad()
    return
  }
  roleRelationLoadFrame = window.requestAnimationFrame(() => {
    roleRelationLoadFrame = null
    roleRelationUnitId.value = unitId
    roleRelationPanelReady.value = true
  })
}

function focusRoleRelationPanel(unitId: string, options: { loading?: boolean } = {}) {
  const targetUnitId = String(unitId || '').trim()
  if (!targetUnitId || !roleUnitMap.value.has(targetUnitId)) return
  roleRelationPanelMounted.value = true
  if (options.loading || !roleRelationPanelReady.value) {
    scheduleRoleRelationPanelLoad(targetUnitId)
    return
  }
  cancelRoleRelationPanelLoad()
  roleRelationUnitId.value = targetUnitId
  roleRelationPanelReady.value = true
  roleRelationPanelLoading.value = false
}

function finishRoleRelationPanelLoad() {
  if (!roleRelationPanelLoading.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const remaining = Math.max(0, 980 - (now - roleRelationLoadStartedAt))
  if (roleRelationLoadTimer) clearTimeout(roleRelationLoadTimer)
  roleRelationLoadTimer = setTimeout(() => {
    roleRelationLoadTimer = null
    roleRelationPanelLoading.value = false
  }, remaining)
}

function handleRoleBrainClipboardChange(state: { mode: 'copy' | 'cut' | ''; unitIds: string[] }) {
  roleBrainClipboard.value = {
    mode: state?.mode === 'copy' || state?.mode === 'cut' ? state.mode : '',
    unitIds: Array.from(new Set((state?.unitIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
  }
}

function activateRoleWorkspaceWindow(windowId: string) {
  roleWorkspaceState.value = activateWorkspaceWindow(roleWorkspaceState.value, windowId)
  const activeWindow = roleWorkspaceState.value.windows.find((window) => window.id === windowId)
  const unitId = String(activeWindow?.sourceId || '').trim()
  if (unitId && roleUnitMap.value.has(unitId)) activeRoleUnitId.value = unitId
}

function closeRoleWorkspaceWindow(windowId: string) {
  const targetWindow = roleWorkspaceState.value.windows.find((window) => window.id === windowId)
  roleWorkspaceState.value = closeWorkspaceWindow(roleWorkspaceState.value, windowId)
  if (targetWindow?.kind === 'form' && roleAuxPanelMode.value === 'preview') {
    roleAuxPanelMode.value = 'none'
  }
}

function closeRoleWorkspaceWindowBySource(unitId: string) {
  const targetId = String(unitId || '').trim()
  if (!targetId) return
  roleWorkspaceState.value.windows
    .filter((window) => String(window.sourceId || '') === targetId)
    .forEach((window) => closeRoleWorkspaceWindow(window.id))
}

function handleRoleWindowTabDragStart(windowId: string, event: DragEvent) {
  draggingRoleWindowId.value = String(windowId || '').trim()
  event.dataTransfer?.setData('text/plain', draggingRoleWindowId.value)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleRoleWindowTabDrop(targetWindowId: string, event: DragEvent) {
  const sourceWindowId = draggingRoleWindowId.value || event.dataTransfer?.getData('text/plain') || ''
  const targetId = String(targetWindowId || '').trim()
  if (!sourceWindowId || !targetId || sourceWindowId === targetId) return
  const targetElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const targetRect = targetElement?.getBoundingClientRect()
  const position = targetRect && event.clientX > targetRect.left + targetRect.width / 2 ? 'after' : 'before'
  roleWorkspaceState.value = activateWorkspaceWindow(
    reorderWorkspaceWindow(roleWorkspaceState.value, sourceWindowId, targetId, position),
    sourceWindowId
  )
}

function handleRoleWindowTabDragEnd() {
  draggingRoleWindowId.value = ''
}

function getRoleWorkspaceWindowStyle(window: WorkspaceWindowRecord) {
  return getWorkspaceWindowFlexStyle(roleWorkspaceState.value, roleWorkspaceWindows.value, window)
}

function getPreviousRoleWorkspaceWindowId(index: number) {
  return roleWorkspaceWindows.value[Math.max(0, index - 1)]?.id || ''
}

function startRoleWorkspaceSplitResize(event: PointerEvent, windowId: string) {
  if (typeof window === 'undefined') return
  if (!windowId) return
  event.preventDefault()
  stopRoleWorkspaceSplitResize?.()
  const startX = event.clientX
  const startWidth = roleWorkspaceState.value.widths?.[windowId] || 420
  const handleMove = (moveEvent: PointerEvent) => {
    const nextWidth = startWidth + moveEvent.clientX - startX
    roleWorkspaceState.value = resizeWorkspaceWindow(roleWorkspaceState.value, windowId, nextWidth, {
      minWidth: 240,
      maxWidth: Math.max(320, window.innerWidth - desktopLeftOccupancy.value - 260)
    })
  }
  const stop = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    stopRoleWorkspaceSplitResize = null
  }
  stopRoleWorkspaceSplitResize = stop
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function getRoleUnitTitle(unitId: string) {
  return roleUnitMap.value.get(unitId)?.title || '簇枝桠'
}

const getRoleUnitContentPort = (unitId: string) => {
  return roleContentPortMap.value.get(String(unitId || '').trim()) || null
}

function getRoleUnitBody(unitId: string) {
  const unit = roleUnitMap.value.get(unitId)
  if (!unit) return ''
  const body = String(unit.body || '').trim()
  if (body) return body
  if (unit.compilePage?.summary) return unit.compilePage.summary
  if (unit.contentKind === 'group') return `${unit.title} 下包含 ${roleUnitView.value.units.filter((item) => item.parentId === unit.unitId).length} 个子簇枝桠。`
  return ''
}

function renderRoleUnitMarkdown(unitId: string) {
  return renderMarkdownToHtml(getRoleUnitBody(unitId))
}

function getRoleUnitPathParts(unitId: string) {
  const parts: string[] = selectedRoleEntity.value?.name
    ? [String(selectedRoleEntity.value.name)]
    : []
  const seen = new Set<string>()
  let current = roleUnitMap.value.get(unitId)
  while (current && !seen.has(current.unitId)) {
    seen.add(current.unitId)
    if (current.unitType !== 'character') {
      parts.splice(1, 0, current.title)
    }
    current = current.parentId ? roleUnitMap.value.get(current.parentId) : undefined
  }
  return parts.length ? parts : [getRoleUnitTitle(unitId)]
}

function getRoleUnitKindLabel(unitId: string) {
  const unit = roleUnitMap.value.get(unitId)
  if (!unit) return '簇枝桠'
  if (unit.unitType === 'character') return '根簇'
  if (unit.unitType === 'core' || unit.unitType === 'soul' || unit.unitType === 'trace') return '簇'
  if (unit.unitType === 'traceGroup') return '枝'
  if (unit.contentKind === 'group') return '枝'
  return '桠'
}

function handleDocSidebarStateChange(state: DocSidebarState) {
  docSidebarState.value = state
}

function handleDocSetActiveTab(tab: DocSidebarState['activeTab']) {
  docLibraryRef.value?.setActiveLibraryTab?.(tab)
}

function handleDocSetRelationTab(tab: RelationPanelTab) {
  docLibraryRef.value?.setRelationTab?.(tab)
}

function handleDocToggleWorldbookTree() {
  docLibraryRef.value?.toggleWorldbookTreeVisible?.()
}

function handleDocExpandWorldbook() {
  docLibraryRef.value?.expandAllFolders?.()
}

function handleDocCollapseWorldbook() {
  docLibraryRef.value?.collapseAllFolders?.()
}

function handleOpenCharacterEditor(char: unknown) {
  props.actions.openCharacterEditor?.(char as never)
}

function handleOpenAddCharacter(groupId: string) {
  props.actions.openAddCharacter?.(groupId, {
    collapseSidebar: !isDesktopViewport.value
  })
}

function handleOpenCreateGroup(groupId: string) {
  props.actions.openCreateGroup?.(groupId)
}

function handleOpenCrowdEditor(groupId: string) {
  props.actions.openCrowdEditor?.(groupId)
}

function resolveCharacterTargetId(characterRef: string) {
  const raw = String(characterRef || '').trim()
  if (!raw || raw.startsWith('group_') || raw.startsWith('crowd_')) return ''
  if (props.viewModel.characters.some((char) => String(char?.id || '').trim() === raw)) {
    return raw
  }
  const matchedCharacter = props.viewModel.characters.find((char) => {
    const charId = String(char?.id || '').trim()
    const charName = String(char?.name || '').trim()
    return charId === raw || charName === raw
  })
  return String(matchedCharacter?.id || '').trim()
}

function handleAssistantAvatarClick(payload: { characterRef?: string; ctrlKey?: boolean; metaKey?: boolean }) {
  const hasModifier = Boolean(payload?.ctrlKey || payload?.metaKey)
  const nextTargetId = resolveCharacterTargetId(String(payload?.characterRef || ''))
  if (!hasModifier || !nextTargetId) return
  props.actions.switchChat?.(nextTargetId)
}

function handleDocExpandWorldbookCluster(clusterId: string) {
  docLibraryRef.value?.expandWorldbookCluster?.(clusterId)
}

function handleDocExpandWorldbookFolder(folderId: string) {
  docLibraryRef.value?.expandWorldbookFolder?.(folderId)
}

function handleDocCollapseWorldbookCluster(clusterId: string) {
  docLibraryRef.value?.collapseWorldbookCluster?.(clusterId)
}

function handleDocExportWorldbookJson() {
  docLibraryRef.value?.exportWorldbookJson?.()
}

function handleDocImportWorldbookJson(payload: unknown) {
  docLibraryRef.value?.queueImportWorldbookJson?.(payload)
}

function handleDocImportWorldbookJsonError(message: string) {
  docLibraryRef.value?.handleWorldbookJsonTransferError?.(message)
}

function handleDocCreateCluster() {
  docLibraryRef.value?.createCluster?.()
}

function handleDocCreatePage() {
  const docLibrary = docLibraryRef.value
  ;(docLibrary?.createPageFromTreeToolbar || docLibrary?.createPage)?.()
}

function handleDocCreateSection() {
  const docLibrary = docLibraryRef.value
  ;(docLibrary?.createSectionFromTreeToolbar || docLibrary?.createSection)?.()
}

function handleDocImportWorldDraft() {
  docLibraryRef.value?.openWorldDraftImportDialog?.()
}

function handleDocUndoWorldbookOps() {
  docLibraryRef.value?.undoWorldbookOps?.()
}

function handleDocRedoWorldbookOps() {
  docLibraryRef.value?.redoWorldbookOps?.()
}

function handleDocWorldbookRowClick(payload: { kind: 'folder' | 'document'; folderId?: string; itemId?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
  docLibraryRef.value?.handleWorldbookSidebarRowClick?.(payload)
}

function handleDocWorldbookClusterClick(payload: { clusterId: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
  docLibraryRef.value?.handleWorldbookSidebarClusterClick?.(payload)
}

function handleDocWorldbookMenuAction(payload: { action: string; row: { kind: 'folder' | 'document'; folderId?: string; itemId?: string } }) {
  docLibraryRef.value?.runWorldbookSidebarMenuAction?.(payload.action, payload.row)
}

function handleDocWorldbookClusterToggle(clusterId: string) {
  docLibraryRef.value?.toggleWorldbookCluster?.(clusterId)
}

function handleDocWorldbookFolderToggle(folderId: string) {
  docLibraryRef.value?.toggleWorldbookFolder?.(folderId)
}

function handleDocWorldbookClusterReorder(payload: { clusterIds: string[]; targetId: string; position?: 'before' | 'after' }) {
  docLibraryRef.value?.reorderWorldbookClusters?.(payload)
}

function handleDocWorldbookRowReorder(payload: { rowIds: string[]; targetId: string; position?: 'before' | 'after' }) {
  docLibraryRef.value?.reorderWorldbookSidebarRows?.(payload)
}

function handleDocWorldbookReorder(payload: { itemIds: string[]; targetId: string; position?: 'before' | 'after' }) {
  docLibraryRef.value?.reorderWorldbookSidebarItems?.(payload)
}

function handleDocWorldbookFolderReorder(payload: { folderIds: string[]; targetId: string; parentFolderId?: string; position?: 'before' | 'after' }) {
  docLibraryRef.value?.reorderWorldbookSidebarFolders?.(payload)
}

function handleDocWorldbookMoveInto(payload: { rowKind: 'document' | 'folder' | 'cluster'; ids: string[]; targetKind: 'folder' | 'cluster'; targetId: string }) {
  docLibraryRef.value?.moveWorldbookRowsInto?.(payload)
}

function handleDocWorldbookRowsDrop(payload: { rowKind: 'document' | 'folder' | 'cluster'; ids: string[]; target: { kind: 'root' | 'document' | 'folder' | 'cluster'; id: string; mode: 'before' | 'after' | 'inside' } }) {
  docLibraryRef.value?.dropWorldbookRows?.(payload)
}

function handleDocPromptRowClick(payload: { itemId?: string }) {
  docLibraryRef.value?.handlePromptSidebarRowClick?.(payload)
}

function handleDocOpenPromptCreate() {
  docLibraryRef.value?.openPromptCreateDialog?.()
}

function handleDocTogglePromptDrag() {
  docLibraryRef.value?.togglePromptDragMode?.()
}

function handleDocSetPromptFilter(mode: 'all' | 'required') {
  docLibraryRef.value?.setPromptFilterMode?.(mode)
}

function handleDocPromptReorder(payload: { sourceId: string; targetId: string; position?: 'before' | 'after' }) {
  docLibraryRef.value?.reorderPromptSidebarItems?.(payload)
}

onMounted(() => {
  updateDesktopViewport()
  warmupDocLibraryWorkspace()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateDesktopViewport)
    window.addEventListener('keydown', handleSidebarShortcut)
    window.addEventListener('pointermove', handleWindowSidebarPointerMove)
    window.addEventListener('langhuan:open-workspace-view', handleOpenWorkspaceView)
  }
})

onBeforeUnmount(() => {
  cancelSidebarHoverCloseTimer()
  stopSidebarContentAnimationFreeze()
  stopSidebarWidthDragLock()
  cancelRecallActivityPanelLoad()
  recallActivityLogLoadController?.abort()
  if (roleSelectionHydrationFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(roleSelectionHydrationFrame)
    roleSelectionHydrationFrame = null
  }
  roleBrainProjection.cancel()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateDesktopViewport)
    window.removeEventListener('keydown', handleSidebarShortcut)
    window.removeEventListener('pointermove', handleWindowSidebarPointerMove)
    window.removeEventListener('langhuan:open-workspace-view', handleOpenWorkspaceView)
  }
  cancelRoleRelationPanelLoad()
  stopRoleWorkspaceSplitResize?.()
})
</script>

<style scoped>
.chat-card--workspace-open {
  padding: 0;
  border-radius: 0;
  border: 0;
  box-shadow: none;
  margin-bottom: 0;
  overflow: hidden;
}

.chat-layout {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.chat-sidebar-slot {
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  position: relative;
  align-self: stretch;
  overflow: visible;
  transition: none;
  contain: layout style;
}

.chat-sidebar-slot--hover-open {
  transition: none;
}

/* hover 暂态（未钉住）：slot 保持 48px 占位，侧栏本体溢出悬浮在主工作区之上，需抬升层级避免被内容覆盖。
   必须高于聊天头部（ChatMainHeader z-index:70）和底部输入栏（ChatInputBar z-index:105），
   否则悬浮态侧栏顶部会被满宽的聊天头部标题盖住（顶部残缺）；仍低于真正的弹窗/灯箱（1200+）。
   钉住态因 slot 实际撑宽、侧栏并排不重叠，故不加这层 z-index。 */
.chat-sidebar-slot--floating {
  z-index: 200;
}

.chat-sidebar-slot--force-collapsed {
  overflow: hidden;
  transition: none;
}

.chat-sidebar-slot--force-collapsed :deep(.chat-sidebar) {
  width: 0;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
  transition: none;
}

.chat-sidebar-slot :deep(.chat-sidebar) {
  left: var(--chat-rail-width) !important;
  width: var(--langhuan-sidebar-visual-width) !important;
  min-width: var(--langhuan-sidebar-visual-width) !important;
  max-width: var(--langhuan-sidebar-visual-width) !important;
  flex-basis: var(--langhuan-sidebar-visual-width) !important;
  clip-path: none !important;
  overflow: hidden;
  transition:
    transform 150ms ease-in,
    box-shadow 280ms ease;
  transform-origin: left center;
  transform: translate3d(-100%, 0, 0);
  will-change: transform;
  background: var(--chat-sidebar-open-bg) !important;
}

.chat-sidebar-slot--hover-open :deep(.chat-sidebar) {
  transition:
    transform 200ms ease-out,
    box-shadow 280ms ease;
  transform: translate3d(0, 0, 0);
}

/* 展开动画结束后释放独立合成层。稳定态若继续保留 translate3d(0) + will-change，
   二级侧栏右缘会产生 1~2px 抗锯齿合成缝，纸色选中行的凹角处尤其明显。 */
.chat-sidebar-slot--hover-open.chat-sidebar-slot--visual-present:not(.chat-sidebar-slot--animating):not(.chat-sidebar-slot--closing) :deep(.chat-sidebar) {
  transform: none;
  will-change: auto;
}

.chat-sidebar-slot--closing :deep(.chat-sidebar),
.chat-sidebar-slot--closing :deep(.chat-sidebar.open) {
  transition:
    transform 150ms ease-in,
    box-shadow 280ms ease;
  transform: translate3d(-100%, 0, 0) !important;
}

.chat-sidebar-slot--animating :deep(.chat-sidebar) {
  left: var(--chat-rail-width) !important;
  width: var(--langhuan-sidebar-visual-width) !important;
  min-width: var(--langhuan-sidebar-visual-width) !important;
  max-width: var(--langhuan-sidebar-visual-width) !important;
  flex-basis: var(--langhuan-sidebar-visual-width) !important;
}

.chat-sidebar-slot:not(.chat-sidebar-slot--visual-present) :deep(.chat-sidebar) {
  visibility: hidden;
  pointer-events: none;
  box-shadow: none;
}

.chat-sidebar-slot--visual-present :deep(.chat-sidebar) {
  visibility: visible;
  opacity: 1;
}

.chat-sidebar-slot :deep(.chat-nav) {
  transition:
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.chat-sidebar-slot :deep(.chat-nav) {
  opacity: 1;
  transform: translateX(0);
}

.doc-main {
  display: flex;
  flex: 1 1 auto;
  max-width: none;
  margin: 0;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.role-main {
  padding-right: 0 !important;
  background: var(--langhuan-paper-bg);
  flex-direction: row !important;
  align-items: stretch;
}

.role-brain-drawer {
  position: relative;
  display: flex;
  flex: 0 0 268px;
  width: 268px;
  min-width: 220px;
  max-width: 420px;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  background: var(--langhuan-paper-bg);
  overflow: hidden;
}

.role-brain-drawer__resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  z-index: 4;
  width: 7px;
  height: 100%;
  border: 0;
  background: color-mix(in srgb, var(--morandi-surface) 94%, var(--morandi-bg) 6%);
  cursor: col-resize;
}

.role-brain-drawer__resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 3px;
  width: 2px;
  height: 58px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-border) 72%, transparent);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.18s ease, background 0.18s ease;
}

.role-brain-drawer__resize-handle:hover::after,
.role-brain-drawer__resize-handle:focus-visible::after {
  background: color-mix(in srgb, var(--morandi-accent) 42%, var(--morandi-border));
  opacity: 1;
}

.role-brain-drawer__panel {
  flex: 0 0 auto;
  padding: 16px 18px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  background: var(--langhuan-paper-bg, var(--morandi-bg, #f8f4ee));
}

.role-brain-drawer__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.role-brain-drawer__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.role-brain-drawer__edit:hover {
  background: color-mix(in srgb, var(--morandi-border) 32%, transparent);
  color: var(--morandi-text);
}

.role-brain-drawer__edit-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.role-brain-drawer__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.role-brain-drawer__avatar {
  display: grid;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: color-mix(in srgb, var(--morandi-accent) 16%, #ffffff);
  color: var(--morandi-text);
  font-size: 22px;
}

.role-brain-drawer__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.role-brain-drawer__identity-main {
  min-width: 0;
}

.role-brain-drawer__name {
  overflow: hidden;
  color: var(--morandi-text);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-brain-drawer__meta {
  margin-top: 2px;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.role-brain-drawer__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 14px 0 0;
}

.role-brain-drawer__stats div {
  min-width: 0;
}

.role-brain-drawer__stats dt {
  display: block;
  margin: 0;
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.role-brain-drawer__stats dd {
  display: block;
  margin: 2px 0 0;
  color: var(--morandi-text);
  font-size: 17px;
  font-weight: 650;
  line-height: 1.2;
}

.role-brain-drawer__tree {
  box-sizing: border-box;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 100%;
  padding: 8px 12px 18px 14px;
  background: var(--langhuan-paper-bg, var(--morandi-bg, #f8f4ee));
  overflow-x: hidden;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  -ms-overflow-style: auto;
}

.role-brain-drawer__tree :deep(.role-brain-tree-scroll)::-webkit-scrollbar {
  display: block;
  width: 4px;
  height: 4px;
}

.role-brain-drawer__tree :deep(.role-brain-tree-scroll.sone-tree-scroll-host--scrollbar-near),
.role-brain-drawer__tree :deep(.role-brain-tree-scroll:focus-within) {
  scrollbar-color: rgba(116, 111, 101, 0.32) transparent;
}

.role-brain-drawer__tree :deep(.role-brain-tree-scroll::-webkit-scrollbar-thumb) {
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: transparent;
  background-clip: content-box;
}

.role-brain-drawer__tree :deep(.role-brain-tree-scroll.sone-tree-scroll-host--scrollbar-near::-webkit-scrollbar-thumb),
.role-brain-drawer__tree :deep(.role-brain-tree-scroll:focus-within::-webkit-scrollbar-thumb),
.role-brain-drawer__tree :deep(.role-brain-tree-scroll::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(116, 111, 101, 0.34);
}

.role-brain-drawer__tree :deep(.role-brain-tree) {
  padding-top: 0;
}

.role-brain-drawer__tree :deep(.sidebar-tree-rows__row) {
  width: calc(100% - 12px);
  margin-right: 10px;
  color: #625f56;
}

.role-brain-drawer__tree :deep(.sidebar-tree-rows__row.folder) {
  color: #435145;
}

.role-brain-drawer__tree :deep(.sidebar-tree-rows__row.document) {
  width: calc(100% - 20px);
  margin-right: 18px;
  color: #615e55;
}

.role-brain-drawer__tree :deep(.sidebar-tree-rows__row.document.active),
.role-brain-drawer__tree :deep(.sidebar-tree-rows__row.document.selected) {
  background: rgba(200, 197, 177, 0.38);
  color: #4d584c;
}

.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row),
.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.document),
.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.folder) {
  width: min(var(--sone-selection-width, 156px), calc(100% - 12px));
  margin-right: 8px;
}

.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.active),
.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.selected),
.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.document.active),
.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.document.selected),
.role-brain-drawer__tree :deep(.sone-tree .sidebar-tree-rows__row.folder.selected) {
  background: transparent;
  color: #4f594d;
}

.role-brain-drawer__tree :deep(.doc-sidebar-row-toggle) {
  color: rgba(86, 100, 87, 0.78);
}

.role-brain-drawer__tree :deep(.doc-sidebar-row-actions) {
  display: none;
}

.role-brain-drawer__tree :deep(.sidebar-row-action) {
  width: 24px;
  height: 24px;
}

.role-workspace {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.role-workspace__window-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 32px;
  padding: 0 8px;
  border-bottom: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-surface) 86%, var(--morandi-bg) 14%);
  overflow: hidden;
}

.role-workspace__window-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 210px;
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 66%, transparent);
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 -1px 0 transparent;
}

.role-workspace__window-tab.active {
  background: color-mix(in srgb, #ffffff 34%, transparent);
  color: var(--morandi-text);
  box-shadow: inset 0 -2px 0 rgba(88, 112, 82, 0.5);
}

.role-workspace__window-tab > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-workspace__window-close,
.role-workspace__window-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.role-workspace__window-close {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
}

.role-workspace__window-tool {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}

.role-workspace__window-tools-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}

.role-workspace__window-strip {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.role-workspace__window-pane {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
  background: transparent;
}

.role-workspace__window-pane:last-child {
  border-right: 0;
}

.role-workspace__window-pane.active {
  box-shadow: inset 0 2px 0 rgba(130, 153, 135, 0.24);
}

.role-workspace__window-splitter {
  flex: 0 0 6px;
  margin-left: -3px;
  margin-right: -3px;
  cursor: col-resize;
  z-index: 2;
}

.role-workspace__window-splitter:hover {
  background: color-mix(in srgb, var(--morandi-border) 54%, transparent);
}

.role-workspace__viewer,
.role-workspace__form,
.role-workspace__graph {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.role-workspace__pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 48px;
  padding: 0 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 74%, transparent);
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-workspace__pane-header span:first-child {
  min-width: 0;
  overflow: hidden;
  color: var(--morandi-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-workspace__viewer-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 22px 36px;
  overflow: auto;
  color: var(--morandi-text);
  line-height: 1.8;
}

.role-workspace__form-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 50px;
  padding: 0 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 74%, transparent);
  color: var(--morandi-text);
  font-size: 14px;
  font-weight: 600;
}

.role-workspace__form--compact .role-workspace__form-toolbar {
  min-height: 42px;
  padding: 0 18px;
}

.role-workspace__markdown-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  margin: 0 -18px;
  padding: 0 22px;
  border: 0;
  background: color-mix(in srgb, var(--morandi-surface) 92%, #ffffff 8%);
  overflow-x: auto;
}

.role-workspace__toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  width: 32px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text);
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.role-workspace__toolbar-btn:hover {
  background: color-mix(in srgb, var(--morandi-accent) 10%, transparent);
}

.role-workspace__toolbar-btn:disabled {
  cursor: default;
  opacity: 0.38;
}

.role-workspace__toolbar-btn--danger {
  color: #b4534a;
}

.role-workspace__toolbar-btn--success {
  color: #6f9276;
}

.role-workspace__toolbar-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.role-main :deep(.app-workspace-read-pane__actions .role-unit-action) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 6px;
  width: auto !important;
  min-width: 82px;
  height: 34px !important;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 74%, #ffffff 26%);
  color: color-mix(in srgb, var(--morandi-text) 82%, var(--morandi-text-light) 18%);
  font-weight: 650;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
}

.role-aux-panel__actions .role-unit-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 6px;
  width: auto !important;
  min-width: 82px;
  height: 34px !important;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 74%, #ffffff 26%);
  color: color-mix(in srgb, var(--morandi-text) 82%, var(--morandi-text-light) 18%);
  font-weight: 650;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
}

.role-main :deep(.app-workspace-read-pane__actions .role-unit-action:hover:not(:disabled)),
.role-aux-panel__actions .role-unit-action:hover:not(:disabled),
.role-aux-panel__actions .role-unit-action.active {
  border-color: color-mix(in srgb, var(--morandi-accent) 38%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-accent) 12%, var(--morandi-surface));
  color: var(--morandi-text);
}

.role-main :deep(.role-unit-action--relation),
.role-aux-panel__actions .role-unit-action--relation {
  min-width: 110px;
}

.role-main :deep(.role-unit-action .app-workspace-shell__icon),
.role-aux-panel__actions .role-unit-action .app-workspace-shell__icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.role-main :deep(.role-unit-action__label),
.role-aux-panel__actions .role-unit-action__label {
  flex: 0 0 auto;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

.role-main :deep(.app-workspace-read-pane__body) {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.role-main :deep(.app-workspace-read-pane__body::-webkit-scrollbar) {
  width: 0;
  height: 0;
  display: none;
}

.role-workspace__toolbar-sep {
  flex: 0 0 auto;
  width: 1px;
  height: 20px;
  margin: 0;
  background: color-mix(in srgb, var(--morandi-border) 84%, transparent);
}

.role-workspace__toolbar-spacer {
  flex: 1 1 auto;
  min-width: 4px;
}

.role-workspace__save-btn,
.role-workspace__secondary-btn {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 86%, transparent);
  border-radius: 8px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--morandi-surface) 76%, #ffffff);
  color: var(--morandi-text);
  font-size: 13px;
  cursor: pointer;
}

.role-workspace__save-btn:hover:not(:disabled),
.role-workspace__secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--morandi-accent) 14%, var(--morandi-surface));
}

.role-workspace__save-btn:disabled,
.role-workspace__secondary-btn:disabled {
  cursor: default;
  opacity: 0.48;
}

.role-workspace__form-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 18px 16px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 22px 28px 28px;
  overflow: auto;
}

.role-workspace__document-editor {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.role-workspace__document-chrome {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
}

.role-workspace__document-breadcrumbs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
  padding: 0 0 10px;
  color: var(--morandi-text-light);
  font-size: 13px;
  line-height: 1.3;
}

.role-workspace__document-breadcrumb-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-workspace__document-breadcrumb-sep {
  padding: 0 9px;
  color: color-mix(in srgb, var(--morandi-text-light) 70%, transparent);
}

.role-workspace__form--compact .role-workspace__form-body {
  grid-template-columns: 1fr;
  align-content: start;
  gap: 12px;
  padding: 16px 18px 18px;
}

.role-workspace__field {
  display: flex;
  flex-direction: column;
  align-self: start;
  min-width: 0;
  min-height: 0;
  gap: 8px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-workspace__field > span {
  line-height: 1.35;
}

.role-workspace__form--compact .role-workspace__field {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.role-workspace__field--span-2 {
  grid-column: 1 / -1;
}

.role-workspace__control {
  width: 100%;
  min-height: 42px;
  box-sizing: border-box;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.28);
  color: var(--morandi-text);
  font: inherit;
}

.role-workspace__form--compact .role-workspace__control {
  min-height: 36px;
  padding: 7px 10px;
}

.role-workspace__control--textarea {
  min-height: 160px;
  resize: vertical;
  line-height: 1.7;
}

.role-workspace__control--detail-textarea {
  min-height: 112px;
}

.role-workspace__control--detail-long-textarea {
  min-height: 148px;
}

.role-workspace__control--document {
  min-height: 280px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

.role-workspace__document-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
}

.role-workspace__document-field {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-workspace__document-field > span {
  white-space: nowrap;
}

.role-workspace__document-title {
  min-height: 34px;
  border-color: color-mix(in srgb, var(--morandi-border) 82%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 88%, var(--morandi-bg) 12%);
  font-size: 14px;
}

.role-workspace__markdown-textarea {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  padding: 28px 28px 56px;
  background: color-mix(in srgb, var(--morandi-surface) 94%, var(--morandi-bg) 6%);
  color: var(--morandi-text);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 15px;
  line-height: 1.8;
  outline: none;
  resize: none;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.role-workspace__markdown-textarea::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.role-aux-panel {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  width: clamp(420px, 27.5vw, 560px);
  min-width: 420px;
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid rgba(96, 110, 91, 0.28);
  background: var(--langhuan-paper-bg);
}

.role-aux-panel__resize-handle {
  position: absolute;
  z-index: 3;
  top: 0;
  bottom: 0;
  left: -5px;
  width: 10px;
  border: 0;
  background: transparent;
  cursor: col-resize;
}

.role-aux-panel__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
}

.role-aux-panel__header > div:first-child {
  min-width: 0;
}

.role-aux-panel__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  justify-self: end;
  min-width: 0;
}

.role-aux-panel__header strong {
  display: block;
  color: var(--morandi-text);
  font-size: 14px;
  font-weight: 650;
}

.role-aux-panel__header span {
  display: block;
  max-width: 220px;
  overflow: hidden;
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-aux-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.role-aux-panel__close:hover {
  background: color-mix(in srgb, var(--morandi-border) 34%, transparent);
  color: var(--morandi-text);
}

.role-aux-panel__preview-body,
.role-aux-panel__relation-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.role-aux-panel__preview-body {
  padding: 24px 26px 42px;
}

.role-aux-panel__preview-content {
  color: var(--morandi-text);
  line-height: 1.85;
}

.role-aux-panel__preview-empty {
  display: grid;
  min-height: 160px;
  place-items: center;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-aux-panel__relation-body {
  position: relative;
  display: flex;
  flex-direction: column;
}

.role-aux-panel__relation-graph {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.role-aux-panel__relation-graph .role-relation-brain-view {
  position: relative;
  z-index: 0;
  flex: 1 1 auto;
  min-height: 0;
}

.role-aux-panel__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4f6f58;
  background: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

:global([data-theme="dark"] .role-aux-panel__loading){
  color: #8fae96;
}

.role-relation-loading-fade-enter-active {
  transition: none;
}

.role-relation-loading-fade-leave-active {
  transition:
    opacity 420ms ease,
    backdrop-filter 420ms ease,
    background-color 420ms ease;
}

.role-relation-loading-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
  background-color: transparent;
}

.role-relation-loading-fade-enter-from {
  opacity: 1;
  backdrop-filter: blur(4px);
  background-color: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
}

.role-relation-loading-fade-leave-active .role-aux-panel__loading-mark {
  transition:
    opacity 360ms ease,
    filter 420ms ease,
    transform 420ms ease;
}

.role-relation-loading-fade-leave-to .role-aux-panel__loading-mark {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(8px) scale(0.97);
}

.role-aux-panel__loading-mark {
  display: grid;
  justify-items: center;
  gap: 14px;
  width: min(300px, calc(100% - 48px));
  color: #4f6f58;
}

.role-aux-panel__loading-icon {
  display: inline-grid;
}

.role-workspace__model-picker {
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex-wrap: wrap;
}

.role-workspace__form--compact .role-workspace__model-picker {
  flex-wrap: nowrap;
}

.role-workspace__model-picker .role-workspace__control {
  flex: 1 1 220px;
}

.role-workspace__form--compact .role-workspace__model-picker .role-workspace__control {
  flex-basis: 160px;
}

.role-workspace__avatar-picker {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.role-workspace__form--compact .role-workspace__avatar-picker {
  align-items: center;
}

.role-workspace__avatar-preview {
  display: grid;
  flex: 0 0 76px;
  width: 76px;
  height: 76px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-surface) 70%, #ffffff);
  color: var(--morandi-text-light);
}

.role-workspace__form--compact .role-workspace__avatar-preview {
  flex-basis: 56px;
  width: 56px;
  height: 56px;
  border-radius: 8px;
}

.role-workspace__avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.role-workspace__avatar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.role-workspace__avatar-actions input {
  max-width: 210px;
  color: var(--morandi-text-light);
}

.role-main__empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--morandi-text-light);
  text-align: center;
  padding: 28px;
}

.role-main__empty--no-role,
.role-main__empty--brain-open {
  gap: 0;
  justify-content: center;
  color: #6d6256;
  padding: clamp(28px, 7vh, 64px) 28px 40px;
}

.role-main__empty--brain-open {
  padding: 28px clamp(28px, 5vw, 72px);
}

.role-main__empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(640px, 100%);
  min-height: min(620px, 100%);
  margin: auto;
}

.role-main__empty-book {
  display: block;
  width: clamp(150px, 14vw, 206px);
  max-width: 58vw;
  height: auto;
  margin: 0 auto 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: rgba(92, 138, 92, 0.68);
  opacity: 0.92;
  pointer-events: none;
  user-select: none;
}

.role-main__empty-branch {
  width: clamp(132px, 12vw, 180px);
  margin-bottom: 10px;
}

.role-main__empty-copy {
  display: grid;
  gap: 10px;
  justify-items: center;
}

.role-main__empty--no-role .role-main__empty-title,
.role-main__empty--brain-open .role-main__empty-title {
  color: #3f372f;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: 0;
}

.role-main__empty--no-role .role-main__empty-text,
.role-main__empty--brain-open .role-main__empty-text {
  max-width: 360px;
  color: #665c50;
  font-size: 13px;
  line-height: 1.6;
}

.role-main__empty-features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: min(620px, 100%);
  margin-top: 30px;
  color: #71675b;
}

.role-main__empty-features--compact {
  width: min(560px, 100%);
  margin-top: 26px;
}

.role-main__empty-feature {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 20px;
}

.role-main__empty-feature + .role-main__empty-feature {
  border-left: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
}

.role-main__empty-feature-heading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
}

.role-main__empty-feature-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  color: #6f896f;
  line-height: 1;
}

.role-main__empty-feature-mark svg {
  display: block;
  width: 19px;
  height: 19px;
}

.role-main__empty-feature-mark--trace svg {
  transform: translateY(-1px);
}

.role-main__empty-feature-title {
  color: #4a4037;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
}

.role-main__empty-feature-desc {
  color: #7b7064;
  font-size: 11.5px;
  line-height: 1.4;
}

.role-main__empty-guide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  margin-top: 30px;
  color: color-mix(in srgb, var(--morandi-accent) 52%, #6d6256 48%);
  font-family: "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif;
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: 0;
}

.role-main__empty-guide--brain-open {
  margin-top: 34px;
}

.role-main__empty-arrow {
  display: block;
  width: clamp(76px, 9vw, 116px);
  height: auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: rgba(92, 138, 92, 0.72);
  opacity: 0.72;
  pointer-events: none;
  user-select: none;
}

.role-main__empty-illustration {
  position: relative;
  width: 118px;
  height: 98px;
  margin-bottom: 6px;
}

.role-main__empty-illustration::before {
  content: '';
  position: absolute;
  inset: 18px 12px 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 84%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(90deg, transparent 49%, color-mix(in srgb, var(--morandi-border) 62%, transparent) 50%, transparent 51%),
    color-mix(in srgb, var(--morandi-surface) 88%, #ffffff);
  box-shadow: 0 14px 26px color-mix(in srgb, var(--morandi-shadow) 34%, transparent);
}

.role-main__empty-illustration span {
  position: absolute;
  display: block;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-accent) 42%, var(--morandi-surface));
  opacity: 0.7;
}

.role-main__empty-illustration span:nth-child(1) {
  width: 18px;
  height: 18px;
  top: 8px;
  left: 24px;
}

.role-main__empty-illustration span:nth-child(2) {
  width: 12px;
  height: 12px;
  top: 28px;
  right: 20px;
  opacity: 0.55;
}

.role-main__empty-illustration span:nth-child(3) {
  width: 46px;
  height: 4px;
  left: 36px;
  bottom: 24px;
  border-radius: 0;
  opacity: 0.48;
}

.role-main__empty-title {
  color: var(--morandi-text);
  font-size: 16px;
  font-weight: 600;
}

.role-main__empty-text {
  max-width: 320px;
  font-size: 13px;
  line-height: 1.7;
}

.role-main__empty-hints {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 360px;
  margin-top: 4px;
}

.role-main__empty-hints span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-surface) 76%, transparent);
  color: var(--morandi-text-muted);
  font-size: 12px;
}

.chat-layout > .chat-main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  max-width: none !important;
  margin: 0 !important;
  width: auto;
  min-height: 0;
  box-sizing: border-box;
  padding-right: 12px;
  overflow: hidden;
  transition: padding-right 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.api-config-workspace-page {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.recall-activity-sidebar,
.prompt-log-sidebar {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: clamp(380px, 32vw, 860px);
  min-width: 360px;
  max-width: 100%;
  min-height: 0;
  border-left: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
  background: var(--langhuan-paper-bg);
  user-select: text;
  -webkit-user-select: text;
}

.prompt-log-sidebar {
  flex: 0 0 clamp(360px, 25vw, 520px);
  width: clamp(360px, 25vw, 520px);
}

.chat-notes-sidebar {
  flex: 0 0 clamp(340px, 24vw, 500px);
  width: clamp(340px, 24vw, 500px);
}

:deep(.chat-message--note-focus .chat-bubble) {
  outline: 1px solid color-mix(in srgb, var(--morandi-accent) 48%, var(--morandi-border));
  outline-offset: 4px;
  transition: outline-color 0.2s ease;
}

.recall-activity-sidebar--event-line {
  flex: 0 0 clamp(320px, 24vw, 500px);
  width: clamp(320px, 24vw, 500px);
  min-width: 300px;
}

.recall-activity-sidebar__resize-handle,
.prompt-log-sidebar__resize-handle {
  position: absolute;
  top: 0;
  left: -4px;
  z-index: 4;
  width: 8px;
  height: 100%;
  border: 0;
  background: transparent;
  cursor: col-resize;
}

.recall-activity-sidebar__resize-handle::after,
.prompt-log-sidebar__resize-handle::after {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 2px;
  height: 64px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-border) 72%, transparent);
  content: "";
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 0.18s ease, background 0.18s ease;
}

.recall-activity-sidebar__resize-handle:hover::after,
.recall-activity-sidebar__resize-handle:focus-visible::after,
.prompt-log-sidebar__resize-handle:hover::after,
.prompt-log-sidebar__resize-handle:focus-visible::after {
  background: color-mix(in srgb, var(--morandi-accent) 42%, var(--morandi-border));
  opacity: 1;
}

.recall-activity-sidebar :deep(pre),
.recall-activity-sidebar :deep(p),
.recall-activity-sidebar :deep(span),
.recall-activity-sidebar :deep(strong),
.recall-activity-sidebar :deep(dd),
.recall-activity-sidebar :deep(dt),
.recall-activity-sidebar :deep(summary),
.prompt-log-sidebar :deep(pre),
.prompt-log-sidebar :deep(span),
.prompt-log-sidebar :deep(strong),
.prompt-log-sidebar :deep(h4) {
  user-select: text;
  -webkit-user-select: text;
}

.prompt-log-sidebar {
  flex-direction: column;
}

.recall-activity-sidebar__content {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.recall-activity-sidebar__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4f6f58;
  background: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

:global([data-theme="dark"] .recall-activity-sidebar__loading){
  color: #8fae96;
}

.recall-activity-loading-fade-enter-active {
  transition: none;
}

.recall-activity-loading-fade-leave-active {
  transition:
    opacity 420ms ease,
    backdrop-filter 420ms ease,
    background-color 420ms ease;
}

.recall-activity-loading-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
  background-color: transparent;
}

.recall-activity-loading-fade-enter-from {
  opacity: 1;
  backdrop-filter: blur(4px);
  background-color: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
}

.recall-activity-loading-fade-leave-active .recall-activity-sidebar__loading-mark {
  transition:
    opacity 360ms ease,
    filter 420ms ease,
    transform 420ms ease;
}

.recall-activity-loading-fade-leave-to .recall-activity-sidebar__loading-mark {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(8px) scale(0.97);
}

.recall-activity-sidebar__loading-mark {
  display: grid;
  justify-items: center;
  gap: 14px;
  width: min(300px, calc(100% - 48px));
  color: #4f6f58;
}

.recall-activity-sidebar__loading-icon {
  display: inline-grid;
}

.prompt-log-sidebar__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
}

.prompt-log-sidebar__header strong,
.prompt-log-sidebar__header span {
  display: block;
  min-width: 0;
}

.prompt-log-sidebar__header strong {
  color: var(--morandi-text);
  font-size: 14px;
}

.prompt-log-sidebar__header span {
  color: var(--morandi-text-light);
  font-size: 12px;
}

.prompt-log-sidebar__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.prompt-log-sidebar__header button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.prompt-log-sidebar__header-actions button:first-child {
  width: auto;
  padding: 0 8px;
  font-size: 12px;
}

.prompt-log-sidebar__header button:hover {
  background: color-mix(in srgb, var(--morandi-border) 34%, transparent);
  color: var(--morandi-text);
}

.prompt-log-sidebar__panel {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px 14px 14px;
  overflow: hidden;
}

.prompt-log-sidebar__panel :deep(.prompt-log-panel__list) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.prompt-log-sidebar__panel :deep(.prompt-log-entry--focus::before) {
  left: -10px;
}

.doc-main :deep(.leaf-docs--embedded) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}

.role-workspace *,
.role-workspace *::before,
.role-workspace *::after {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.role-workspace *::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

@media (max-width: 768px) {
  .chat-layout {
    width: 100%;
  }

  .chat-layout > .chat-main {
    padding-right: 0;
  }

  .recall-activity-sidebar,
  .prompt-log-sidebar {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 12;
    width: min(92vw, 420px);
    min-width: 0;
    box-shadow: -12px 0 28px rgba(0, 0, 0, 0.12);
  }

  .prompt-log-sidebar__resize-handle {
    display: none;
  }

  .doc-main :deep(.leaf-docs--embedded) {
    min-height: auto;
  }

  .role-workspace__form-body {
    grid-template-columns: 1fr;
  }

  .role-main__empty--no-role,
  .role-main__empty--brain-open {
    padding: 28px 18px 34px;
  }

  .role-main__empty-book {
    width: min(160px, 56vw);
    margin-bottom: 10px;
  }

  .role-main__empty-branch {
    width: min(138px, 48vw);
  }

  .role-main__empty-features {
    grid-template-columns: 1fr;
    gap: 14px;
    width: min(320px, 100%);
    margin-top: 28px;
  }

  .role-main__empty-feature {
    padding: 0;
  }

  .role-main__empty-feature + .role-main__empty-feature {
    border-left: 0;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
  }

  .role-main__empty-guide {
    gap: 10px;
    margin-top: 30px;
    font-size: 15px;
  }

  .role-main__empty-arrow {
    width: 72px;
  }

  .role-main {
    flex-direction: column !important;
  }

  .role-brain-drawer {
    flex: 0 0 auto;
    width: 100%;
    max-width: none;
    min-height: 210px;
    max-height: 34vh;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  }

  .role-aux-panel {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    max-height: 36vh;
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
  }

}
</style>
