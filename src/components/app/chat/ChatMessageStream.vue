<template>
  <div class="chat-messages" :ref="bindMessagesAreaRef" :style="chatFontScaleStyle" @contextmenu.prevent>
    <div
      v-if="selectionNoteMenu.visible"
      ref="selectionNoteMenuRef"
      class="message-note-selection-menu"
      :style="{ left: `${selectionNoteMenu.x}px`, top: `${selectionNoteMenu.y}px` }"
    >
      <button type="button" @click="addSelectionToNote">
        <svg class="message-note-selection-menu__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
          <path d="M2 6h4"/>
          <path d="M2 10h4"/>
          <path d="M2 14h4"/>
          <path d="M2 18h4"/>
          <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
        </svg>
        <span>{{ t('chat.addToNote') }}</span>
      </button>
      <button type="button" @click="copySelectionText">
        <svg class="message-note-selection-menu__icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <span>{{ t('common.copy') }}</span>
      </button>
    </div>
    <!-- 提调坞属于聊天区常驻外壳，不依赖角色/会话数据。空工作区也显示原生细绿条；
         启动加载或会话切换时暂时隐藏，避免旧会话的坞在骨架屏上闪现。 -->
    <TidiaoDirectorDock
      v-if="!isBootLoading && !isSessionSwitching"
      :rounds="directorDockRounds"
      :auto-expand="String(replyPipelineMode || '').trim() !== 'fast_reply'"
      :context-key="directorDockContextKey"
      :resolve-avatar="getCharAvatar"
      :resolve-name="resolveCharacterName"
      :pool-session-id="activeRecallPoolSessionId"
      :pool-cast-character-ids="recallPoolCastIds"
      @open-recall="openDirectorRecall"
      @open-orchestration="openDirectorOrchestration"
    />
    <div v-if="isBootLoading" class="chat-refresh-loading" :aria-label="t('chat.refreshingChat')">
      <span class="chat-refresh-spinner"></span>
    </div>
    <!-- 会话切换乐观跳转（2026-07-11）：fetch 尚未回来时用骨架屏整体代替旧会话的坞/消息列表——
         旧会话内容一帧不闪现，只在这里露出（与 chatStoreMessageRemoteActions.switchSession 的乐观切换联动）。 -->
    <div v-else-if="isSessionSwitching" class="chat-skeleton" :aria-label="t('chat.loadingShort')">
      <!-- 骨架气泡宽度错落=模拟真实消息长度：气泡本身给显式宽度（长消息宽/短消息窄），
           内部文字条首行满宽、末行短尾做段落感（空 div 撑不出宽度，长度必须落在气泡上）。 -->
      <div class="chat-skeleton-row">
        <div class="chat-skeleton-header">
          <div class="chat-skeleton-avatar sk"></div>
          <div class="chat-skeleton-name sk"></div>
        </div>
        <div class="chat-skeleton-bubble" style="width: 76%">
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk" style="width: 58%"></div>
        </div>
      </div>
      <div class="chat-skeleton-row chat-skeleton-row--self">
        <div class="chat-skeleton-header">
          <div class="chat-skeleton-avatar sk"></div>
          <div class="chat-skeleton-name sk"></div>
        </div>
        <div class="chat-skeleton-bubble" style="width: 54%">
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk" style="width: 70%"></div>
        </div>
      </div>
      <div class="chat-skeleton-row">
        <div class="chat-skeleton-header">
          <div class="chat-skeleton-avatar sk"></div>
          <div class="chat-skeleton-name sk"></div>
        </div>
        <div class="chat-skeleton-bubble" style="width: 64%">
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk" style="width: 48%"></div>
        </div>
      </div>
      <div class="chat-skeleton-row chat-skeleton-row--self">
        <div class="chat-skeleton-header">
          <div class="chat-skeleton-avatar sk"></div>
          <div class="chat-skeleton-name sk"></div>
        </div>
        <div class="chat-skeleton-bubble" style="width: 70%">
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk" style="width: 82%"></div>
        </div>
      </div>
      <div class="chat-skeleton-row">
        <div class="chat-skeleton-header">
          <div class="chat-skeleton-avatar sk"></div>
          <div class="chat-skeleton-name sk"></div>
        </div>
        <div class="chat-skeleton-bubble" style="width: 44%">
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk" style="width: 68%"></div>
        </div>
      </div>
      <div class="chat-skeleton-row chat-skeleton-row--self">
        <div class="chat-skeleton-header">
          <div class="chat-skeleton-avatar sk"></div>
          <div class="chat-skeleton-name sk"></div>
        </div>
        <div class="chat-skeleton-bubble" style="width: 58%">
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk"></div>
          <div class="chat-skeleton-line sk" style="width: 40%"></div>
        </div>
      </div>
    </div>
    <div v-else-if="!currentTarget" class="chat-empty-start">
      <div class="chat-empty-start__text">{{ t('chat.selectCharToStart') }}</div>
      <button type="button" class="btn btn-small chat-empty-start__action" @click="$emit('create-first-character')">
        {{ t('sidebar.addCharacter') }}
      </button>
    </div>
    <template v-else>
      <div
        v-if="hasOlderMessages || loadingOlderMessages || localOlderMessagesLoading"
        class="chat-older-sentinel"
      >
        <button
          type="button"
          class="chat-older-sentinel__button"
          :disabled="loadingOlderMessages || localOlderMessagesLoading"
          @click="loadOlderMessagesFromTop"
        >
          {{ loadingOlderMessages || localOlderMessagesLoading ? t('chat.loadingShort') : t('chat.loadMoreMessages') }}
        </button>
      </div>
      <!-- 加载更早消息骨架（2026-07-11）：in-flight 时在列表顶部露 2 行同款骨架条，复用 chat-skeleton 全局类。 -->
      <div v-if="loadingOlderMessages || localOlderMessagesLoading" class="chat-skeleton chat-skeleton--older">
        <div class="chat-skeleton-row">
          <div class="chat-skeleton-header">
            <div class="chat-skeleton-avatar sk"></div>
            <div class="chat-skeleton-name sk"></div>
          </div>
          <div class="chat-skeleton-bubble" style="width: 68%">
            <div class="chat-skeleton-line sk"></div>
            <div class="chat-skeleton-line sk" style="width: 84%"></div>
          </div>
        </div>
        <div class="chat-skeleton-row chat-skeleton-row--self">
          <div class="chat-skeleton-header">
            <div class="chat-skeleton-avatar sk"></div>
            <div class="chat-skeleton-name sk"></div>
          </div>
          <div class="chat-skeleton-bubble" style="width: 52%">
            <div class="chat-skeleton-line sk"></div>
            <div class="chat-skeleton-line sk" style="width: 90%"></div>
          </div>
        </div>
      </div>
      <template
        v-for="(msg, i) in currentMessages"
        :key="i"
      >
        <!-- 提调带（2026-07-04 位置改造）：历史轮内联带已移除，历史轮 + 活动轮统一收进顶部提调坞
             TidiaoDirectorDock（壳上 ‹ N/M › 切轮回看）；轮分组数据源 roundDirectorStreamGroups 保留供坞消费。 -->
        <div
          v-if="isNarrationDebugMessage(msg) && isDebugGroupStart(i)"
          class="chat-debug-group"
          :class="{ 'is-expanded': isDebugGroupExpanded(i) }"
          :ref="(el) => bindMessageRowRef(i, el)"
        >
          <button
            type="button"
            class="chat-debug-group__summary"
            :aria-expanded="isDebugGroupExpanded(i)"
            @click="toggleDebugGroup(i)"
          >
            <span class="chat-debug-group__chevron" aria-hidden="true">›</span>
            <span class="chat-debug-group__title">{{ t('chat.debugInfo') }}</span>
            <span class="chat-debug-group__count">{{ t('chat.itemsCount', { count: getDebugGroupAt(i).messages.length }) }}</span>
          </button>
          <div v-if="isDebugGroupExpanded(i)" class="chat-debug-group__body">
            <div
              v-for="entry in getDebugGroupAt(i).messages"
              :key="entry.index"
              class="chat-message chat-message--narration-debug"
              :ref="(el) => bindMessageRowRef(entry.index, el)"
            >
              <div class="chat-bubble">
                <div
                  v-if="displayChatText(getDisplayedContent(entry.message, entry.index))"
                  class="chat-text"
                  v-html="formatMessageText(entry.message, displayChatText(getDisplayedContent(entry.message, entry.index)))"
                ></div>
                <div class="msg-actions">
                  <button
                    v-if="entry.message.role !== 'user' && entry.message.id"
                    class="msg-action-btn"
                    :data-prompt-message-id="resolvePromptLogMessageId(entry.message)"
                    @click="openPromptLog(entry.message)"
                    :title="t('chat.viewPromptLog')"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>
                      <path d="m10 8-3 3 3 3"/>
                      <path d="m14 14 3-3-3-3"/>
                    </svg>
                  </button>
                  <button
                    v-if="canUseLocalTools && shouldShowMessageRecallAction(entry.message)"
                    class="msg-action-btn"
                    :data-recall-message-id="resolveMessageId(entry.message)"
                    @click="openRecallActivityForMessage(entry.message)"
                    :title="t('chat.viewRecallProcessDetails')"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/>
                      <path d="M4 6h.01"/>
                      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/>
                      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/>
                      <path d="M12 18h.01"/>
                      <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/>
                      <circle cx="12" cy="12" r="2"/>
                      <path d="m13.41 10.59 5.66-5.66"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      <div
        v-else-if="!isNarrationDebugMessage(msg)"
        class="chat-message"
        :class="{
          self: msg.role === 'user',
          'chat-message--narration': isNarrationMessage(msg),
          'chat-message--narration-debug': isNarrationDebugMessage(msg),
          'chat-message--focused-action': isFocusedAction(msg),
          'chat-message--focused-action-private': isPrivateFocusedAction(msg)
        }"
        :data-chat-message-id="resolveMessageId(msg) || undefined"
        :data-chat-message-index="i"
        :ref="(el) => bindMessageRowRef(i, el)"
      >
        <div class="chat-message-header">
          <button
            type="button"
            class="chat-avatar"
            :class="{ 'chat-avatar--clickable': canOpenProfileFromAvatar(msg) }"
            :title="getAvatarActionTitle(msg)"
            :aria-label="getAvatarActionTitle(msg)"
            @click="handleMessageAvatarClick(msg, $event)"
          >
            <span v-if="isNarrationDebugMessage(msg)">{{ t('chat.debugBadge') }}</span>
            <span v-else-if="isNarrationMessage(msg)">{{ t('chat.narrationBadge') }}</span>
            <img v-else-if="msg.role === 'assistant' && getCharAvatar(msg.name || '')" :src="getCharAvatar(msg.name || '')" />
            <img v-else-if="msg.role === 'user' && currentUserAvatar" :src="currentUserAvatar" />
            <span v-else>{{ msg.role === 'user' ? currentUserEmoji : (getCharEmoji(msg.name || '') || t('chat.characterFallback')) }}</span>
          </button>
          <div v-if="!isNarrationDebugMessage(msg)" class="chat-sender">{{ getMessageSenderLabel(msg) }}</div>
        </div>
        <div
          class="chat-bubble"
          @mousedown="handleMessageSelectionMousedown(msg, i, $event)"
          @mouseup="handleMessageSelectionMouseup(msg, i, $event)"
        >
          <div v-if="isFocusedAction(msg)" class="chat-focused-action-meta">
            <svg class="chat-focused-action-meta__icon" viewBox="0 0 24 24" aria-hidden="true">
              <template v-if="isPrivateFocusedAction(msg)">
                <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>
                <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
                <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>
                <path d="m2 2 20 20"/>
              </template>
              <template v-else>
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="12" r="9" />
              </template>
            </svg>
            <span>{{ t('chat.focusedAction') }}</span>
            <span class="chat-focused-action-meta__visibility">· {{ isPrivateFocusedAction(msg) ? t('chat.focusedActionPrivate') : t('chat.focusedActionPublic') }}</span>
          </div>
          <div v-if="msg.image" style="margin: 4px 0; cursor: pointer;" @click="$emit('open-fullscreen-image', msg.image)">
            <img :src="msg.image" :alt="t('chat.messageImage')" style="max-width: 200px; border-radius: 8px;">
          </div>
          <div
            v-if="messageAttachments(msg).length"
            class="chat-message-images"
            :class="{ 'chat-message-images--single': messageAttachments(msg).length === 1 }"
          >
            <div
              v-for="att in messageAttachments(msg)"
              :key="att.id"
              class="chat-message-image-item"
            >
              <button type="button" class="chat-message-image" @click="$emit('open-fullscreen-image', att.url)">
                <img :src="att.url" :alt="t('chat.messageImage')">
              </button>
              <button
                type="button"
                class="chat-message-image-avatar"
                title="设为头像"
                aria-label="设为头像"
                @click.stop="requestChatImageAvatarAssignment(att.url, att.originalName)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="3"/></svg>
              </button>
            </div>
          </div>
          <template v-if="editingMessageIndex !== i">
            <template v-if="isRegeneratingAt(i)">
              <ChatProcessMotion v-if="isRegeneratingNarrationAt(i, msg) && !hasProcessTrace(msg)" :label="t('chat.narrationRegenerating')" />
              <div v-else-if="!hasProcessTrace(msg)" class="chat-typing"><span></span><span></span><span></span></div>
              <div v-if="!isNarrationMessage(msg) && !isNarrationDebugMessage(msg) && thoughtBlocks(streamingText).length" class="chat-think-list">
                <div
                  v-for="(block, thoughtIndex) in thoughtBlocks(streamingText)"
                  :key="messageThoughtKey(msg, i, thoughtIndex)"
                  class="think-block"
                  :class="{ 'is-expanded': isThoughtExpanded(messageThoughtKey(msg, i, thoughtIndex)) }"
                >
                  <div class="think-body">
                    <div class="think-content think-content-preview" v-html="formatThoughtText(block)"></div>
                    <button
                      type="button"
                      class="think-show-more"
                      :aria-expanded="isThoughtExpanded(messageThoughtKey(msg, i, thoughtIndex))"
                      @click="toggleThought(messageThoughtKey(msg, i, thoughtIndex))"
                    ></button>
                  </div>
                </div>
              </div>
              <div v-if="displayChatText(streamingText)" class="chat-text" v-html="formatChatText(displayChatText(streamingText))"></div>
            </template>
            <template v-else>
              <ChatProcessMotion v-if="isLocalRecallLoadingMessage(msg) && !hasProcessTrace(msg)" :label="t('chat.recalling')" />
              <div v-else-if="isLocalAssistantLoadingMessage(msg) && !hasProcessTrace(msg)" class="chat-typing"><span></span><span></span><span></span></div>
              <div v-if="msg.role === 'assistant' && !isNarrationMessage(msg) && !isNarrationDebugMessage(msg) && thoughtBlocks(getDisplayedContent(msg, i)).length" class="chat-think-list">
                <div
                  v-for="(block, thoughtIndex) in thoughtBlocks(getDisplayedContent(msg, i))"
                  :key="messageThoughtKey(msg, i, thoughtIndex)"
                  class="think-block"
                  :class="{ 'is-expanded': isThoughtExpanded(messageThoughtKey(msg, i, thoughtIndex)) }"
                >
                  <div class="think-body">
                    <div class="think-content think-content-preview" v-html="formatThoughtText(block)"></div>
                    <button
                      type="button"
                      class="think-show-more"
                      :aria-expanded="isThoughtExpanded(messageThoughtKey(msg, i, thoughtIndex))"
                      @click="toggleThought(messageThoughtKey(msg, i, thoughtIndex))"
                    ></button>
                  </div>
                </div>
              </div>
              <div
                v-if="displayChatText(getDisplayedContent(msg, i))"
                class="chat-text"
                :class="{ 'tidiao-pe-whole': precisionWholeFallback(msg, displayChatText(getDisplayedContent(msg, i))) }"
                v-html="formatMessageText(msg, displayChatText(getDisplayedContent(msg, i)))"
              ></div>
            </template>
          </template>
          <div v-else :ref="(el) => bindEditingAreaRef(i, el)" style="margin-top: 4px;">
            <textarea :value="editingMessageContent" @input="$emit('update:editing-message-content', ($event.target as HTMLTextAreaElement).value)" rows="8" style="width: min(840px, calc(100vw - 160px)); min-width: 520px; max-width: 95vw; padding: 12px; border: 1px solid var(--morandi-border); border-radius: 8px; font-size: 0.95rem; resize: vertical; background: var(--morandi-card); color: var(--morandi-text);"></textarea>
            <div :ref="(el) => bindEditingActionsRef(i, el)" style="display: flex; gap: 6px; margin-top: 4px;">
              <button class="btn btn-small btn-secondary" @click="$emit('cancel-edit-message')">{{ t('common.cancel') }}</button>
              <button class="btn btn-small btn-primary" @click="$emit('save-edit-message', i)">{{ t('common.ok') }}</button>
              <button v-if="msg.role === 'user'" class="btn btn-small" style="background: #4CAF50; color: white;" @click="$emit('save-and-regenerate', i)">{{ t('chat.saveAndRegenerate') }}</button>
            </div>
          </div>
          <div class="chat-time" v-if="editingMessageIndex !== i && !isRegeneratingAt(i) && !isNarrationDebugMessage(msg)">
            <span v-if="getChatFloorLabel(msg)" class="chat-floor-label">{{ getChatFloorLabel(msg) }}</span>
            <span v-if="getMessageDisplayTime(msg)">{{ getMessageDisplayTime(msg) }}</span>
            <span v-if="getMessageEnvironmentMeta(msg)" class="chat-time-extra">· {{ getMessageEnvironmentMeta(msg) }}</span>
            <span v-if="getMessageModelMeta(msg)" class="chat-time-extra">· {{ getMessageModelMeta(msg) }}</span>
            <span
              v-if="getHiddenMarkerText(msg)"
              class="chat-hidden-marker"
              :title="getHiddenMarkerTitle(msg)"
            >{{ getHiddenMarkerText(msg) }}</span>
          </div>
          <div class="msg-actions" v-if="editingMessageIndex !== i && !isRegeneratingAt(i)">
            <div v-if="!isNarrationDebugMessage(msg) && getVersionTotal(msg) > 1" class="msg-version-switch" :aria-label="t('chat.messageVersionSwitch')">
              <button class="msg-version-btn" @click="$emit('select-message-version', { index: i, nextIndex: getActiveVersionIndex(msg) - 1 })" :disabled="getActiveVersionIndex(msg) <= 0" :title="t('chat.prevVersion')">‹</button>
              <span class="msg-version-indicator">{{ getActiveVersionIndex(msg) + 1 }}/{{ getVersionTotal(msg) }}</span>
              <button class="msg-version-btn" @click="$emit('select-message-version', { index: i, nextIndex: getActiveVersionIndex(msg) + 1 })" :disabled="getActiveVersionIndex(msg) >= getVersionTotal(msg) - 1" :title="t('chat.nextVersion')">›</button>
            </div>
            <button v-if="canAddMessageNote(msg)" class="msg-action-btn" @click="addWholeMessageToNote(msg, i)" :title="t('chat.addMessageToNote')">
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/>
                  <path d="M2 6h4"/>
                  <path d="M2 10h4"/>
                  <path d="M2 14h4"/>
                  <path d="M2 18h4"/>
                  <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('chat.notes') }}</span>
            </button>
            <button v-if="!isNarrationDebugMessage(msg)" class="msg-action-btn btn-copy" @click="$emit('copy-message', i)" :title="t('common.copy')">
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('common.copy') }}</span>
            </button>
            <button v-if="!isNarrationDebugMessage(msg)" class="msg-action-btn" @click="$emit('start-edit-message', i)" :title="t('common.edit')">
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('common.edit') }}</span>
            </button>
            <button v-if="!isNarrationDebugMessage(msg)" class="msg-action-btn" @click="$emit('delete-message', i)" :title="t('common.delete')">
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  <path d="M3 6h18"/>
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('common.delete') }}</span>
            </button>
            <button
              v-if="msg.role !== 'user' && msg.id"
              class="msg-action-btn"
              :data-prompt-message-id="resolvePromptLogMessageId(msg)"
              @click="openPromptLog(msg)"
              :title="t('chat.viewPromptLog')"
            >
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>
                  <path d="m10 8-3 3 3 3"/>
                  <path d="m14 14 3-3-3-3"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('chat.promptWord') }}</span>
            </button>
            <button
              v-if="canUseLocalTools && msg.role !== 'user' && msg.id"
              class="msg-action-btn"
              :data-orchestration-message-id="resolveMessageId(msg)"
              @click="openOrchestrationAudit(msg)"
              :title="t('chat.viewOrchestrationAudit')"
            >
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <line x1="6" y1="3" x2="6" y2="15"/>
                  <circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('chat.orchestration') }}</span>
            </button>
            <button
              v-if="canUseLocalTools && shouldShowMessageRecallAction(msg)"
              class="msg-action-btn"
              :data-recall-message-id="resolveMessageId(msg)"
              @click="openRecallActivityForMessage(msg)"
              :title="t('chat.viewRecallProcessDetails')"
            >
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/>
                  <path d="M4 6h.01"/>
                  <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/>
                  <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/>
                  <path d="M12 18h.01"/>
                  <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/>
                  <circle cx="12" cy="12" r="2"/>
                  <path d="m13.41 10.59 5.66-5.66"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('chat.recall') }}</span>
            </button>
            <button
              v-if="shouldShowProjectionLamp(msg)"
              class="msg-action-btn msg-action-btn--projection-lamp"
              :class="[
                `msg-action-btn--projection-${getProjectionLampState(msg)}`,
                { 'is-projection-active': isProjectionDisplayActive(msg) }
              ]"
              :disabled="!canUseProjectionLamp(msg)"
              :aria-pressed="isProjectionDisplayActive(msg)"
              :aria-label="getProjectionLampTitle(msg)"
              :title="getProjectionLampTitle(msg)"
              @click="handleProjectionLampClick(msg)"
            >
              <span class="msg-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5A5 5 0 1 0 7.5 11.5c.8.8 1.3 1.5 1.5 2.5"/>
                  <path d="M9 18h6"/>
                  <path d="M10 22h4"/>
                  <path d="M8.5 14h7"/>
                </svg>
              </span>
              <span class="msg-action-title">{{ t('chat.projection') }}</span>
            </button>
            <div
              v-if="!isNarrationDebugMessage(msg) && msg.role !== 'user'"
              class="msg-action-menu"
            >
              <!-- 重试按钮只保留单一语义「按提示词重试」（用户 2026-06-20）：点击直接按原提示词重试，
                   不再悬浮出选项；想改具体内容/纠偏请用输入栏上方的常驻纠偏框。 -->
              <button
                class="msg-action-btn"
                @click="$emit('regenerate-message', { index: i, mode: 'prompt_replay' })"
                :title="t('chat.retryByPrompt')"
              >
                <span class="msg-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                </span>
                <span class="msg-action-title">{{ t('common.retry') }}</span>
              </button>
            </div>
            <button
              v-if="!isNarrationDebugMessage(msg)"
              class="msg-action-btn msg-action-btn--prompt-visibility"
              :class="{ 'is-hidden-from-prompt': isHiddenFromPrompt(msg) }"
              :aria-pressed="isHiddenFromPrompt(msg)"
              :aria-label="isHiddenFromPrompt(msg) ? t('chat.restoreToPrompt') : t('chat.hideFromPrompt')"
              @click="$emit('toggle-message-prompt-visibility', i)"
              :title="getPromptVisibilityButtonTitle(msg)"
            >
              <span class="msg-action-icon" aria-hidden="true">
                <svg v-if="isHiddenFromPrompt(msg)" viewBox="0 0 24 24">
                  <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>
                  <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>
                  <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>
                  <path d="m2 2 20 20"/>
                </svg>
                <svg v-else viewBox="0 0 24 24">
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span v-if="getProjectionVisibilityHiddenCount(msg)" class="msg-action-badge">
                  {{ getProjectionVisibilityHiddenCount(msg) }}
                </span>
              </span>
              <span class="msg-action-title">{{ isHiddenFromPrompt(msg) ? t('chat.restore') : t('chat.hide') }}</span>
            </button>
          </div>
        </div>
      </div>
      <!-- 提调真·导演 loop 轮级流式载体（2026-07-04 位置改造）：不再内联锚在用户消息后，
           改由顶部提调坞承载（directorDockRounds 里 live=true 的最后一轮）。 -->
      </template>
      <div
        v-if="shouldShowEnvironmentNarrationLoading"
        class="chat-message chat-message--narration chat-message--process"
      >
        <div class="chat-message-header">
          <div class="chat-avatar">
            <span>{{ t('chat.narrationBadge') }}</span>
          </div>
          <div class="chat-sender">{{ t('chat.narration') }}</div>
        </div>
        <div class="chat-bubble">
          <ChatProcessMotion :label="t('chat.narrationGenerating')" />
        </div>
      </div>
      <div
        v-if="shouldShowStreamingBubble"
        class="chat-message"
        :class="{ 'chat-message--narration': isNarrationTyping }"
      >
        <div class="chat-message-header">
          <div class="chat-avatar">
            <img v-if="typingAvatar" :src="typingAvatar" />
            <span v-else>{{ typingEmoji || t('chat.characterFallback') }}</span>
          </div>
          <div class="chat-sender">{{ typingSpeakerName || currentChatTitle }}</div>
        </div>
        <div class="chat-bubble">
          <ChatProcessMotion v-if="isNarrationTyping" :label="narrationTypingLabel" />
          <div v-else class="chat-typing"><span></span><span></span><span></span></div>
          <div v-if="!isNarrationTyping && thoughtBlocks(streamingText).length" class="chat-think-list">
            <div
              v-for="(block, thoughtIndex) in thoughtBlocks(streamingText)"
              :key="streamingThoughtKey(thoughtIndex)"
              class="think-block"
              :class="{ 'is-expanded': isThoughtExpanded(streamingThoughtKey(thoughtIndex)) }"
            >
              <div class="think-body">
                <div class="think-content think-content-preview" v-html="formatThoughtText(block)"></div>
                <button
                  type="button"
                  class="think-show-more"
                  :aria-expanded="isThoughtExpanded(streamingThoughtKey(thoughtIndex))"
                  @click="toggleThought(streamingThoughtKey(thoughtIndex))"
                ></button>
              </div>
            </div>
          </div>
          <div v-if="displayChatText(streamingText)" class="chat-text" v-html="formatChatText(displayChatText(streamingText))"></div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRefs, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessageViewModel, ChatPanelViewModel, UserProfileViewModel } from '../../../types/panelContracts'
import { getMessageEnvironmentLabel } from '../../../utils/messageEnvironment'
import { extractAiThoughtBlocks, stripAiThoughtContent } from '../../../utils/aiOutput'
import { requestPromptLogFocus } from '../../../app/promptLogPanelState'
import { requestChatImageAvatarAssignment } from '../../../app/chatImageAvatarAssignment'
import { chatProjectionObservationTick } from '../../../app/chatProjectionObservationSignal'
import { useRecallTraceState } from '../../../app/recallTraceState'
import type { RecallActivityRun } from '../../../app/recallTraceState'
import { isPublicRecallEvent, readLatestPublicRecallMilestoneText } from '../../../app/recallPublicMilestones'
import {
  buildProcessTraceMapFromTraces,
  canUseProjectionLampState,
  isProjectionRowSuccess,
  pickRoundDirectorTraceGroup,
  readMessageProcessTrace as readReplyWorkflowMessageProcessTrace,
  readProjectionRunStatus,
  resolveProjectionLampState,
  resolveProjectionLampTitle,
  type ReplyWorkflowProcessTraceView,
  type RoundDirectorTraceCandidate
} from '../../../app/replyWorkflowMessageView'
import {
  fetchChatPersonalityModelObservationsBySessionId,
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession,
  locateChatRecallActivityLog,
  locateChatRecallActivityLogBySessionId,
  normalizeChatSessionCharacterParticipants,
  normalizeChatTargetId,
  runChatMessageProjectionBySessionId,
  type ChatPersonalityModelObservationProjection,
  type ChatPersonalityModelObservationVisibility
} from '../../../repositories/chatRepository'
import { useChatStore } from '../../../stores/chatStore'
import { resolveChatMessageSpeakerName } from '../../../app/chatMessageSpeaker'
import { useWorkspaceRuntimeStore } from '../../../app/workspaceRuntimeStore'
import { useToast } from '../../../composables/useToast'
import type { UseStickToBottomResult } from '../../../composables/useStickToBottom'
import ChatProcessMotion from '../../common/ChatProcessMotion.vue'
// 角色镜钻取明细适配器（buildTidiaoShotDetail）供新带角色镜展开用；ChatProcessTrace.vue 已于 D3 删除。
import { buildTidiaoShotDetail, type TidiaoShotDetail } from '../../../app/tidiaoBandModel'
// 提调真·导演 loop 轮级流式载体（决策流+并排实时分镜，锚在用户消息与角色正文之间）：
// loop 进行中/刚结束由 directorStreamRound 实时渲染，历史复原由 roundDirectorStreamFor 读落库快照渲染。
import TidiaoDirectorDock, { type TidiaoDirectorDockRound } from './TidiaoDirectorDock.vue'
import { activeTidiaoDirectorStreamRound } from '../../../app/tidiaoDirectorStreamState'
// state 查看器·提调真读那份：把本带 appendLog（活动轮内存 / 历史轮落库快照）投影成「喂模型原文」md，透给带→侧栏。
import { getActiveDirectorPrompt, getAppendLogEvents } from '../../../app/agentState/appendLog'
// option C（2026-07-01·发送时留存真实 prompt）：查看器「喂模型原文」改显示真实 prompt + loop 真实往来（未折叠），
// 不再显示旧压缩台账；renderDirectorMemoryDocument 是读侧唯一入口（活动/历史/桌面/移动共用·prompt 空时内部回退旧投影）。
import { renderDirectorMemoryDocument } from '../../../app/agentState/appendLogProjection'
import type { AppendLogEvent } from '../../../app/agentState/appendLogTypes'
import { createLocalRecallRoundPoolCache, recallPoolStoreVersion } from '../../../app/recallRoundPoolCache'
import { useCharacterStore } from '../../../stores/characterStore'
import { activeTidiaoPrecisionEditIndicator, getTidiaoPrecisionEditSegments } from '../../../app/tidiaoMessageEditIndicatorState'
import { renderChatMarkdownWithPrecisionShimmer } from '../../../utils/chatMarkdown'
import type { TidiaoDirectorStream } from '../../../app/tidiaoDirectorStream'
import { assignChatFloorNumbers, classifyChatFloorKind, type ChatFloorKind } from '../../../app/chatMessageFloor'
// 输入框图片上传计划批4：气泡多图渲染，旧 msg.image 单图分支保留观察（处置清单：不复用，不改动）。
import { readMessageAttachments } from '../../../utils/chatAttachments'
import {
  isFocusedActionMessage,
  readFocusedActionVisibility
} from '../../../../shared/focusedAction'

type RefTarget = Element | ComponentPublicInstance | null

const props = withDefaults(defineProps<{
  currentTarget: string
  isTyping: boolean
  currentMessages: ChatMessageViewModel[]
  hasOlderMessages?: boolean
  loadingOlderMessages?: boolean
  /** 会话切换乐观跳转（2026-07-11）：正在切换中（fetch 尚未回来）——渲染骨架屏代替 currentMessages，旧会话消息一帧不闪现。 */
  isSessionSwitching?: boolean
  isBootLoading: boolean
  currentAlias: ChatPanelViewModel['currentAlias']
  userProfile: UserProfileViewModel
  currentChatTitle: string
  editingMessageIndex: number
  editingMessageContent: string
  regeneratingMessageIndex: number
  formatChatText: (text: string) => string
  getCharAvatar: (name: string) => string
  getCharEmoji: (name: string) => string
  currentCharacterAvatar: string | null
  currentCharacter: ChatPanelViewModel['currentCharacter']
  activeSessionId?: string
  replyPipelineMode?: string
  streamingText: string
  streamingSpeakerName?: string
  environmentNarrationLoading?: boolean
  previewSpeakerName?: string
  streamingTargetId?: string
  setMessagesAreaRef: (el: RefTarget) => void
  chatStickToBottom: UseStickToBottomResult
  getDisplayedMessageContent: (index: number) => string
  loadOlderMessages?: (beforeId?: number) => unknown
  chatFontScale?: number | string
  canUseLocalTools?: boolean
}>(), {
  streamingSpeakerName: '',
  previewSpeakerName: '',
  streamingTargetId: '',
  replyPipelineMode: '',
  hasOlderMessages: false,
  loadingOlderMessages: false,
  isSessionSwitching: false,
  chatFontScale: 1,
  canUseLocalTools: false
})
const {
  currentTarget,
  isTyping,
  currentMessages,
  isBootLoading,
  currentAlias,
  userProfile,
  currentChatTitle,
  editingMessageIndex,
  editingMessageContent,
  regeneratingMessageIndex,
  formatChatText,
  getCharAvatar,
  getCharEmoji,
  currentCharacterAvatar,
  currentCharacter,
  streamingText,
  setMessagesAreaRef
} = toRefs(props)

const { t } = useI18n()

const chatFontScaleStyle = computed(() => {
  const raw = Number(props.chatFontScale ?? 1)
  const scale = Number.isFinite(raw) ? Math.min(1.25, Math.max(0.85, raw)) : 1
  return { '--chat-font-scale': scale.toFixed(2) }
})

const typingSpeakerName = computed(() => {
  return String(
    props.streamingSpeakerName
    || props.previewSpeakerName
    || props.currentCharacter?.name
    || ''
  ).trim()
})

const typingAvatar = computed(() => {
  if (isNarrationTyping.value) return ''
  if (typingSpeakerName.value) {
    return props.getCharAvatar(typingSpeakerName.value)
  }
  return String(props.currentCharacterAvatar || '')
})

const typingEmoji = computed(() => {
  if (isNarrationTyping.value) return ''
  if (typingSpeakerName.value) {
    return props.getCharEmoji(typingSpeakerName.value)
  }
  return props.currentCharacter?.emoji || ''
})

const isNarrationTyping = computed(() => {
  return typingSpeakerName.value === '旁白' || typingSpeakerName.value === '旁白润色中'
})

const narrationTypingLabel = computed(() => {
  // 比较值 '旁白润色中' 是流式说话人数据标识（保留）；返回的是显示标签（可翻）。
  return typingSpeakerName.value === '旁白润色中' ? t('chat.narrationPolishing') : t('chat.narrationGenerating')
})

const currentUserAvatar = computed(() => {
  const alias = props.currentAlias as Record<string, unknown> | null | undefined
  return String(alias?.avatarPath ?? alias?.avatar_path ?? props.userProfile?.avatarPath ?? '').trim()
})

const currentUserEmoji = computed(() => {
  const alias = props.currentAlias as Record<string, unknown> | null | undefined
  return String(alias?.emoji ?? props.userProfile?.emoji ?? '👤').trim() || '👤'
})

const hasLocalStreamingMessage = computed(() => {
  return props.currentMessages.some((msg) => Boolean(msg?._localStreamingKey))
})

const shouldShowStreamingBubble = computed(() => {
  if (!props.isTyping) return false
  if (props.regeneratingMessageIndex >= 0) return false
  if (hasLocalStreamingMessage.value) return false
  const explicitTypingSpeakerName = String(props.streamingSpeakerName || props.previewSpeakerName || '').trim()
  if (!explicitTypingSpeakerName) return false
  const activeTargetId = String(props.currentTarget || '')
  const streamingTargetId = String(props.streamingTargetId || '')
  return !streamingTargetId || activeTargetId === streamingTargetId
})

const shouldShowEnvironmentNarrationLoading = computed(() => {
  if (!props.environmentNarrationLoading) return false
  if (props.regeneratingMessageIndex >= 0) return false
  return !isNarrationTyping.value
})

type DebugMessageGroup = {
  startIndex: number
  messages: Array<{ index: number; message: ChatMessageViewModel }>
}

// 楼层号计数复用共享真值 assignChatFloorNumbers（与移动端、后端提调读会话消息工具同一套编号）；
// 分类仍用本地 getMessageFloorKind 保持原有口径不变。联动：见 chatMessageFloor.ts 头注释。
const messageFloorMap = computed(() => assignChatFloorNumbers(props.currentMessages, getMessageFloorKind))

const debugMessageGroups = computed(() => {
  const groups = new Map<number, DebugMessageGroup>()
  let activeGroup: DebugMessageGroup | null = null
  props.currentMessages.forEach((message, index) => {
    if (!isNarrationDebugMessage(message)) {
      activeGroup = null
      return
    }
    if (!activeGroup) {
      activeGroup = { startIndex: index, messages: [] }
      groups.set(index, activeGroup)
    }
    activeGroup.messages.push({ index, message })
  })
  return groups
})

const messagesAreaRef = ref<HTMLElement | null>(null)
const pendingForceScroll = ref(true)
const messageRowRefs = ref<Record<number, HTMLElement | null>>({})
const editingAreaRefs = ref<Record<number, HTMLElement | null>>({})
const editingActionsRefs = ref<Record<number, HTMLElement | null>>({})
const selectionNoteMenuRef = ref<HTMLElement | null>(null)
const expandedThoughtKeys = ref<Set<string>>(new Set())
const expandedDebugGroupKeys = ref<Set<number>>(new Set())
const recallActivityEntryLabelsByMessageKey = ref<Record<string, string>>({})
const displayableRecallActivityEntryKeys = ref<Record<string, boolean>>({})
const recallActivityAssistantKeysAtRunStart = ref<Record<string, string[]>>({})
const pendingRecallActivityEntryLabelsByRun = ref<Record<string, string>>({})
const loadingRecallActivityEntryLabelsByMessageKey = ref<Record<string, boolean>>({})
const loadedEmptyRecallActivityEntryLabelsByMessageKey = ref<Record<string, boolean>>({})
const projectionRows = ref<ChatPersonalityModelObservationProjection[]>([])
const projectionVisibilityRows = ref<ChatPersonalityModelObservationVisibility[]>([])
const loadingProjectionRows = ref(false)
// 刷新请求撞上进行中加载时的排队标记：finally 里补刷一次，避免投影保存信号被吞。
let projectionRowsReloadQueued = false
/** 历史消息的过程轨：从 observations 的 personality_model_trace / reply_workflow_trace 的 payload.processSummary 按 messageId 复原。 */
const processTraceByMessageId = ref<Map<number, ReplyWorkflowProcessTraceView>>(new Map())
const projectionDisplayMessageIds = ref<Set<number>>(new Set())
const projectionPollTimer = ref<number | null>(null)
const runningProjectionMessageIds = ref<Set<number>>(new Set())
const selectionNoteMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  text: '',
  index: -1,
  messageId: 0
})
const selectionPointerDown = ref<{
  x: number
  y: number
  text: string
  menuVisible: boolean
  index: number
  messageId: number
} | null>(null)
const recallTraceState = useRecallTraceState()
const localOlderMessagesLoading = ref(false)
const runtimeStore = useWorkspaceRuntimeStore()
const { toast } = useToast(runtimeStore)

const isPersonalityModelSession = computed(() => {
  return String(props.replyPipelineMode || '').trim() === 'personality_model'
})

const isProjectionFeatureSession = computed(() => {
  const mode = String(props.replyPipelineMode || '').trim()
  return mode === 'normal_recall' || mode === 'personality_model' || mode === 'fast_reply'
})

const projectionByMessageId = computed(() => {
  const map = new Map<number, ChatPersonalityModelObservationProjection>()
  for (const projection of projectionRows.value) {
    const messageId = Number(projection.messageId || 0)
    if (!Number.isInteger(messageId) || messageId <= 0) continue
    map.set(messageId, projection)
  }
  return map
})

const currentMessageIdSignature = computed(() => {
  return props.currentMessages
    .map((message) => resolveMessageId(message))
    .filter((messageId) => Number.isInteger(messageId) && messageId > 0)
    .join(',')
})

function bindMessagesAreaRef(el: RefTarget) {
  messagesAreaRef.value = el instanceof HTMLElement ? el : null
  props.setMessagesAreaRef(el)
}

function bindMessageRowRef(index: number, el: RefTarget) {
  messageRowRefs.value[index] = el instanceof HTMLElement ? el : null
}

function bindEditingAreaRef(index: number, el: RefTarget) {
  editingAreaRefs.value[index] = el instanceof HTMLElement ? el : null
}

function bindEditingActionsRef(index: number, el: RefTarget) {
  editingActionsRefs.value[index] = el instanceof HTMLElement ? el : null
}

// 智能跟底滚动（2026-07-12）：转发给共享 stick 实例（useAppState 单例），不再自己维护滚动状态——
// force=true 用于 target/session 切换、启动加载完成等强制到底场景；非 force 时受 stickToBottom 门控。
function scrollToBottom(force = false) {
  props.chatStickToBottom.scrollToBottom(force)
}

function ensureEditingAreaVisible(index: number) {
  const container = messagesAreaRef.value
  if (!container || index < 0) return
  const target = editingActionsRefs.value[index] || editingAreaRefs.value[index] || messageRowRefs.value[index]
  if (!target) return

  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const topPadding = 12
  const bottomPadding = 20

  if (targetRect.bottom > containerRect.bottom - bottomPadding) {
    container.scrollTop += targetRect.bottom - (containerRect.bottom - bottomPadding)
  }

  const row = messageRowRefs.value[index]
  if (!row) return
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top < containerRect.top + topPadding) {
    container.scrollTop -= (containerRect.top + topPadding) - rowRect.top
  }
}

async function loadOlderMessagesFromTop() {
  const el = messagesAreaRef.value
  if (!el) return
  if (!props.hasOlderMessages || props.loadingOlderMessages || localOlderMessagesLoading.value) return
  const previousHeight = el.scrollHeight
  const previousTop = el.scrollTop
  const beforeId = readOldestRenderedMessageId()
  localOlderMessagesLoading.value = true
  try {
    const loaded = await props.loadOlderMessages?.(beforeId)
    // 骨架屏（2026-07-11）先于滚动位置计算收起——否则骨架条的高度会被计入 nextEl.scrollHeight，
    // 与真实加载出的更早消息高度叠加，打偏下面的滚动补偿算式。finally 里再兜底一次防中途异常。
    localOlderMessagesLoading.value = false
    await nextTick()
    const nextEl = messagesAreaRef.value
    if (!nextEl) return
    if (loaded !== false) {
      nextEl.scrollTop = nextEl.scrollHeight - previousHeight + previousTop
    }
  } finally {
    localOlderMessagesLoading.value = false
  }
}

function readOldestRenderedMessageId() {
  const ids = props.currentMessages
    .map((message) => resolveMessageId(message))
    .filter((id) => Number.isInteger(id) && id > 0)
  return ids.length ? Math.min(...ids) : 0
}

onMounted(async () => {
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', handleSelectionNoteMenuOutsidePointerDown, true)
  }
  void reloadMessageProjectionRows()
  await nextTick()
  scrollToBottom(true)
  pendingForceScroll.value = false
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', handleSelectionNoteMenuOutsidePointerDown, true)
  }
  stopProjectionPolling()
})

async function reloadMessageProjectionRows() {
  if (!isProjectionFeatureSession.value || !props.activeSessionId) {
    projectionRows.value = []
    projectionVisibilityRows.value = []
    projectionDisplayMessageIds.value = new Set()
    processTraceByMessageId.value = new Map()
    return
  }
  // 进行中时不丢请求而是排队补刷：投影保存信号可能恰好撞上 typing 结束的那次刷新。
  if (loadingProjectionRows.value) {
    projectionRowsReloadQueued = true
    return
  }
  loadingProjectionRows.value = true
  try {
    const page = await fetchChatPersonalityModelObservationsBySessionId(props.activeSessionId)
    projectionRows.value = Array.isArray(page.projections) ? page.projections : []
    projectionVisibilityRows.value = Array.isArray(page.visibility) ? page.visibility : []
    processTraceByMessageId.value = buildProcessTraceMapFromTraces(page.traces)
    pruneProjectionDisplayMessageIds()
  } catch (error) {
    console.error('加载消息投影状态失败:', error)
  } finally {
    loadingProjectionRows.value = false
    if (projectionRowsReloadQueued) {
      projectionRowsReloadQueued = false
      void reloadMessageProjectionRows()
    }
  }
}

function stopProjectionPolling() {
  if (projectionPollTimer.value === null) return
  if (typeof window !== 'undefined') window.clearInterval(projectionPollTimer.value)
  projectionPollTimer.value = null
}

function syncProjectionPolling() {
  if (typeof window === 'undefined') return
  if (!isProjectionFeatureSession.value || !props.activeSessionId || !props.isTyping) {
    stopProjectionPolling()
    return
  }
  if (projectionPollTimer.value !== null) return
  projectionPollTimer.value = window.setInterval(() => {
    void reloadMessageProjectionRows()
  }, 1500)
}

function pruneProjectionDisplayMessageIds() {
  const existingMessageIds = new Set(
    props.currentMessages
      .map((message) => resolveMessageId(message))
      .filter((messageId) => Number.isInteger(messageId) && messageId > 0)
  )
  const next = new Set<number>()
  for (const messageId of projectionDisplayMessageIds.value) {
    if (!existingMessageIds.has(messageId)) continue
    const projection = projectionByMessageId.value.get(messageId)
    if (!isProjectionRowSuccess(projection)) continue
    next.add(messageId)
  }
  projectionDisplayMessageIds.value = next
}

watch(
  () => props.currentMessages.length,
  async (messageCount, previousMessageCount) => {
    await nextTick()
    if (pendingForceScroll.value) {
      scrollToBottom(true)
      pendingForceScroll.value = false
      return
    }
    if (messageCount > 0 && previousMessageCount === 0) {
      scrollToBottom(true)
      return
    }
    if (!props.chatStickToBottom.stickToBottom.value) return
    scrollToBottom()
  },
  { flush: 'post' }
)

watch(
  () => props.currentTarget,
  async () => {
    pendingForceScroll.value = true
    await nextTick()
    scrollToBottom(true)
  },
  { flush: 'post' }
)

watch(
  () => props.activeSessionId,
  async () => {
    pendingForceScroll.value = true
    projectionRows.value = []
    projectionDisplayMessageIds.value = new Set()
    void reloadMessageProjectionRows()
    await nextTick()
    scrollToBottom(true)
  },
  { flush: 'post' }
)

watch(
  () => ({
    sessionId: props.activeSessionId || '',
    mode: props.replyPipelineMode || '',
    messageIds: currentMessageIdSignature.value
  }),
  () => {
    void reloadMessageProjectionRows()
  },
  { flush: 'post' }
)

watch(
  () => props.isTyping,
  (typing) => {
    if (!typing) {
      void reloadMessageProjectionRows()
    }
    syncProjectionPolling()
  },
  { immediate: true, flush: 'post' }
)

// 投影写入完成信号（事件驱动，无轮询）：内嵌投影保存晚于 typing 结束，
// 只靠上面的单次刷新会让投影灯停在黄色；保存成功后这里再拉一次。
watch(chatProjectionObservationTick, () => {
  void reloadMessageProjectionRows()
})

watch(
  () => props.isBootLoading,
  async (loading) => {
    if (loading) return
    pendingForceScroll.value = true
    await nextTick()
    scrollToBottom(true)
  },
  { flush: 'post' }
)

watch(
  () => props.editingMessageIndex,
  async (index) => {
    if (index < 0) return
    await nextTick()
    ensureEditingAreaVisible(index)
  },
  { flush: 'post' }
)

function getDisplayedContent(msg: ChatMessageViewModel, index: number) {
  const messageId = resolveMessageId(msg)
  if (projectionDisplayMessageIds.value.has(messageId)) {
    const projectionText = getProjectionDisplayText(msg)
    if (projectionText) return projectionText
  }
  return props.getDisplayedMessageContent?.(index) || msg.content || ''
}

function getMessageProjection(msg: ChatMessageViewModel) {
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return null
  return projectionByMessageId.value.get(messageId) || null
}

function getProjectionDisplayText(msg: ChatMessageViewModel) {
  const projection = getMessageProjection(msg)
  if (!projection) return ''
  return String(projection.objectiveFact || '').trim()
}

// 投影灯状态机真值在共享模块 replyWorkflowMessageView（桌面与移动端联动）。
function getProjectionLampState(msg: ChatMessageViewModel): 'pending' | 'running' | 'success' | 'failed' {
  const messageId = resolveMessageId(msg)
  return resolveProjectionLampState(getMessageProjection(msg), runningProjectionMessageIds.value.has(messageId))
}

function shouldShowProjectionLamp(msg: ChatMessageViewModel) {
  if (isNarrationDebugMessage(msg)) return false
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return false
  return isProjectionFeatureSession.value || Boolean(getMessageProjection(msg))
}

function canToggleProjectionDisplay(msg: ChatMessageViewModel) {
  return getProjectionLampState(msg) === 'success'
}

function canUseProjectionLamp(msg: ChatMessageViewModel) {
  return canUseProjectionLampState(getProjectionLampState(msg))
}

function isProjectionDisplayActive(msg: ChatMessageViewModel) {
  return projectionDisplayMessageIds.value.has(resolveMessageId(msg))
}

function getProjectionLampTitle(msg: ChatMessageViewModel) {
  return resolveProjectionLampTitle(getProjectionLampState(msg), getMessageProjection(msg), isProjectionDisplayActive(msg))
}

async function handleProjectionLampClick(msg: ChatMessageViewModel) {
  const state = getProjectionLampState(msg)
  if (state === 'success') {
    toggleProjectionDisplay(msg)
    return
  }
  if (state === 'running') {
    toast(t('chat.toastProjecting'), 'info')
    return
  }
  // failed 与 pending 同走一条重投影路径（2026-07-07）：failed 视为「可重试」，不再静默 return。
  if (state !== 'pending' && state !== 'failed') return
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return
  const sessionId = String(props.activeSessionId || '').trim()
  if (!sessionId) {
    toast(t('chat.toastNoProjectableSession'), 'error')
    return
  }
  setLocalProjectionRunning(messageId, true)
  toast(t('chat.toastProjecting'), 'info')
  try {
    const result = await runChatMessageProjectionBySessionId(sessionId, messageId)
    await reloadMessageProjectionRows()
    const status = readProjectionRunStatus(result)
    if (status === 'failed') {
      toast(t('chat.toastProjectionFailed'), 'error')
    } else {
      toast(t('chat.toastProjectionDone'), 'success')
    }
  } catch (error) {
    console.error('运行消息投影失败:', error)
    toast(t('chat.toastProjectionFailed'), 'error')
    void reloadMessageProjectionRows()
  } finally {
    setLocalProjectionRunning(messageId, false)
  }
}

function toggleProjectionDisplay(msg: ChatMessageViewModel) {
  if (!canToggleProjectionDisplay(msg)) return
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return
  const next = new Set(projectionDisplayMessageIds.value)
  if (next.has(messageId)) {
    next.delete(messageId)
  } else {
    next.add(messageId)
  }
  projectionDisplayMessageIds.value = next
}

function setLocalProjectionRunning(messageId: number, running: boolean) {
  const next = new Set(runningProjectionMessageIds.value)
  if (running) {
    next.add(messageId)
  } else {
    next.delete(messageId)
  }
  runningProjectionMessageIds.value = next
}

function isNarrationMessage(msg: ChatMessageViewModel) {
  const messageKind = String(msg?.messageKind ?? msg?.message_kind ?? '').trim()
  const speakerName = String(msg?.name ?? msg?.memberName ?? '').trim()
  return messageKind === 'narration' || speakerName === '旁白'
}

function isFocusedAction(msg: ChatMessageViewModel) {
  return isFocusedActionMessage(msg)
}

function isPrivateFocusedAction(msg: ChatMessageViewModel) {
  return isFocusedAction(msg) && readFocusedActionVisibility(msg) === 'private'
}

// 图片附件（输入框图片上传计划批4）：只解析、不缓存——消息数组本身已是响应式数据，解析成本低于额外缓存复杂度。
// readMessageAttachments 兼容三种真实键名（attachmentsJson/attachments/attachments_json），见其 JSDoc。
function messageAttachments(msg: ChatMessageViewModel) {
  return readMessageAttachments(msg)
}

function isCustomNarrationMessage(msg: ChatMessageViewModel) {
  if (!isNarrationMessage(msg)) return false
  const record = msg as Record<string, unknown>
  const profileKind = String(record.narrationProfileKind ?? record.narration_profile_kind ?? '').trim()
  if (profileKind === 'custom') return true
  const profileId = String(record.narrationProfileId ?? record.narration_profile_id ?? '').trim()
  return profileId.startsWith('custom_')
}

function isNarrationDebugMessage(msg: ChatMessageViewModel) {
  const messageKind = String(msg?.messageKind ?? msg?.message_kind ?? '').trim()
  const speakerName = String(msg?.name ?? msg?.memberName ?? '').trim()
  return messageKind === 'narration_debug' || speakerName === '旁白调试'
}

function isDebugGroupStart(index: number) {
  return debugMessageGroups.value.has(index)
}

function getDebugGroupAt(index: number): DebugMessageGroup {
  return debugMessageGroups.value.get(index) || { startIndex: index, messages: [] }
}

function isDebugGroupExpanded(index: number) {
  return expandedDebugGroupKeys.value.has(index)
}

function toggleDebugGroup(index: number) {
  const next = new Set(expandedDebugGroupKeys.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  expandedDebugGroupKeys.value = next
}

// 楼层分类复用共享真值 classifyChatFloorKind（与移动端、后端提调读会话消息工具同一口径）。
// 联动：见 chatMessageFloor.ts 头注释。注：渲染样式用的 isNarrationMessage/isNarrationDebugMessage 是另一套口径，与楼层分类无关。
function getMessageFloorKind(msg: ChatMessageViewModel): ChatFloorKind | '' {
  return classifyChatFloorKind(msg)
}

function getChatFloorLabel(msg: ChatMessageViewModel) {
  const floor = messageFloorMap.value.get(msg)
  if (!floor || floor.kind === 'debug') return ''
  const label = floor.kind === 'narration' ? t('chat.narration') : t('chat.characterFallback')
  return `${label} ${floor.index}/${floor.total}`
}

function isRegeneratingNarrationAt(index: number, msg: ChatMessageViewModel) {
  return isRegeneratingAt(index) && isNarrationMessage(msg)
}

function getMessageSenderLabel(msg: ChatMessageViewModel) {
  if (isNarrationDebugMessage(msg)) return t('chat.narrationDebug')
  if (isNarrationMessage(msg)) return t('chat.narration')
  return resolveChatMessageSpeakerName(msg, {
    userFallbackName: currentAlias.value?.name || userProfile.value?.name || t('chat.meFallback'),
    assistantFallbackName: currentChatTitle.value
  })
}

function buildMessageNotePayload(msg: ChatMessageViewModel, index: number, sourceMode: 'selection' | 'message', sourceText: string) {
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return null
  const messageText = displayChatText(getDisplayedContent(msg, index)).trim()
  const floorLabel = getChatFloorLabel(msg)
  return {
    messageId,
    sourceMode,
    sourceText: String(sourceText || '').trim(),
    messageSnapshot: messageText,
    messageIndex: index,
    floorLabel: floorLabel || t('chat.floorItemFallback', { index: index + 1 }),
    speakerName: getMessageSenderLabel(msg),
    role: String(msg.role || ''),
    envDate: getMessageVirtualTime(msg),
    envWeather: String(msg?.envWeather ?? (msg as Record<string, unknown>)?.env_weather ?? '').trim(),
    envLocation: String(msg?.envLocation ?? (msg as Record<string, unknown>)?.env_location ?? '').trim(),
    model: getMessageModelMeta(msg)
  }
}

function canAddMessageNote(msg: ChatMessageViewModel) {
  return !isNarrationDebugMessage(msg) && resolveMessageId(msg) > 0
}

function addWholeMessageToNote(msg: ChatMessageViewModel, index: number) {
  const payload = buildMessageNotePayload(msg, index, 'message', displayChatText(getDisplayedContent(msg, index)))
  if (!payload || !payload.sourceText) return
  selectionNoteMenu.value.visible = false
  emit('add-message-note', payload)
}

function resolveSelectionNoteMenuPosition(clientX: number, clientY: number, menuWidth = 132, menuHeight = 68) {
  if (typeof window === 'undefined') {
    return { x: clientX, y: clientY }
  }
  const gap = 10
  const padding = 8
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  let x = clientX + gap
  let y = clientY + gap
  if (x + menuWidth > viewportWidth - padding) {
    x = clientX - menuWidth - gap
  }
  if (y + menuHeight > viewportHeight - padding) {
    y = clientY - menuHeight - gap
  }
  return {
    x: Math.max(padding, Math.min(x, Math.max(padding, viewportWidth - menuWidth - padding))),
    y: Math.max(padding, Math.min(y, Math.max(padding, viewportHeight - menuHeight - padding)))
  }
}

function updateSelectionNoteMenuViewportClamp() {
  const menu = selectionNoteMenuRef.value
  const state = selectionNoteMenu.value
  if (!menu || !state.visible) return
  const rect = menu.getBoundingClientRect()
  const next = resolveSelectionNoteMenuPosition(
    state.anchorX,
    state.anchorY,
    Math.ceil(rect.width || 132),
    Math.ceil(rect.height || 68)
  )
  if (next.x === state.x && next.y === state.y) return
  selectionNoteMenu.value = {
    ...state,
    x: next.x,
    y: next.y
  }
}

function closeSelectionNoteMenu() {
  selectionNoteMenu.value.visible = false
  selectionPointerDown.value = null
}

function handleSelectionNoteMenuOutsidePointerDown(event: PointerEvent) {
  if (!selectionNoteMenu.value.visible) return
  const menu = selectionNoteMenuRef.value
  const target = event.target
  if (menu && target instanceof Node && menu.contains(target)) return
  closeSelectionNoteMenu()
}

function handleMessageSelectionMousedown(msg: ChatMessageViewModel, index: number, event: MouseEvent) {
  selectionPointerDown.value = {
    x: event.clientX,
    y: event.clientY,
    text: String((typeof window !== 'undefined' ? window.getSelection?.()?.toString() : '') || '').trim(),
    menuVisible: selectionNoteMenu.value.visible,
    index,
    messageId: resolveMessageId(msg)
  }
  if (selectionNoteMenu.value.visible) {
    selectionNoteMenu.value.visible = false
  }
}

function handleMessageSelectionMouseup(msg: ChatMessageViewModel, index: number, event: MouseEvent) {
  if (!canAddMessageNote(msg)) {
    selectionNoteMenu.value.visible = false
    selectionPointerDown.value = null
    return
  }
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  const text = String(selection?.toString() || '').trim()
  const row = messageRowRefs.value[index]
  if (!text || !row || !selection || selection.rangeCount <= 0) {
    if (!text) selectionNoteMenu.value.visible = false
    selectionPointerDown.value = null
    return
  }
  const anchor = selection.anchorNode
  const focus = selection.focusNode
  if ((anchor && !row.contains(anchor)) || (focus && !row.contains(focus))) {
    selectionNoteMenu.value.visible = false
    selectionPointerDown.value = null
    return
  }
  const pointerDown = selectionPointerDown.value
  const isPlainClickOnExistingSelection = Boolean(
    pointerDown?.menuVisible
      && pointerDown.index === index
      && pointerDown.messageId === resolveMessageId(msg)
      && pointerDown.text === text
      && Math.abs(pointerDown.x - event.clientX) <= 3
      && Math.abs(pointerDown.y - event.clientY) <= 3
  )
  selectionPointerDown.value = null
  if (isPlainClickOnExistingSelection) {
    selectionNoteMenu.value.visible = false
    return
  }
  const position = resolveSelectionNoteMenuPosition(event.clientX, event.clientY)
  selectionNoteMenu.value = {
    visible: true,
    x: position.x,
    y: position.y,
    anchorX: event.clientX,
    anchorY: event.clientY,
    text,
    index,
    messageId: resolveMessageId(msg)
  }
  nextTick(updateSelectionNoteMenuViewportClamp)
}

function addSelectionToNote() {
  const state = selectionNoteMenu.value
  const msg = props.currentMessages[state.index]
  if (!msg || resolveMessageId(msg) !== state.messageId) {
    selectionNoteMenu.value.visible = false
    return
  }
  const payload = buildMessageNotePayload(msg, state.index, 'selection', state.text)
  selectionNoteMenu.value.visible = false
  if (typeof window !== 'undefined') {
    window.getSelection()?.removeAllRanges()
  }
  if (!payload || !payload.sourceText) return
  emit('add-message-note', payload)
}

async function writeTextToClipboard(text: string) {
  const normalizedText = String(text || '')
  if (!normalizedText) return false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText)
    return true
  }
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = normalizedText
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = Boolean(document.execCommand?.('copy'))
  textarea.remove()
  return copied
}

async function copySelectionText() {
  const state = selectionNoteMenu.value
  selectionNoteMenu.value.visible = false
  if (typeof window !== 'undefined') {
    window.getSelection()?.removeAllRanges()
  }
  await writeTextToClipboard(state.text)
}

function displayChatText(text: string) {
  return stripAiThoughtContent(text)
}

function formatMessageText(msg: ChatMessageViewModel, text: string) {
  if (isNarrationDebugMessage(msg)) return formatDebugMessageText(text)
  const segments = precisionEditSegmentsForMsg(msg)
  if (!segments.length) return props.formatChatText(text)
  // 命中具体段→段级 shimmer span；一段都没定位到→正文原样渲染，整条退化高亮由 precisionWholeFallback 给容器加类。
  return renderChatMarkdownWithPrecisionShimmer(text, segments).html
}

/** 取某条消息当前正在被提调精修的片段（无精修指示时早退）。 */
function precisionEditSegmentsForMsg(msg: ChatMessageViewModel): string[] {
  if (!activeTidiaoPrecisionEditIndicator.value) return []
  return getTidiaoPrecisionEditSegments(resolveMessageId(msg))
}

/** 该条是否需要整条退化高亮：有精修片段、但正文里一个都没定位到。 */
function precisionWholeFallback(msg: ChatMessageViewModel, text: string): boolean {
  const segments = precisionEditSegmentsForMsg(msg)
  if (!segments.length) return false
  return renderChatMarkdownWithPrecisionShimmer(text, segments).matchedCount === 0
}

function thoughtBlocks(text: string) {
  return extractAiThoughtBlocks(text)
}

function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatDebugMessageText(text: string) {
  const raw = String(text || '').trim()
  const match = raw.match(/^【([^】]+)】([\s\S]*)$/)
  if (!match) return props.formatChatText(raw)
  const prefix = escapeHtml(match[1] || t('chat.debug'))
  const body = escapeHtml(String(match[2] || '').replace(/^\s+/, ''))
  return [
    '<span class="debug-line">',
    `<span class="debug-prefix">【${prefix}】</span>`,
    `<span class="debug-body">${body.replace(/\n/g, '<br>')}</span>`,
    '</span>'
  ].join('')
}

function formatThoughtText(text: string) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function readRecallActivityEntryLabel(activity: unknown) {
  const label = readLatestPublicRecallMilestoneText(activity as Partial<RecallActivityRun>)
  return String(label || '').trim()
}

function hasRecallActivityProcess(entry: unknown) {
  const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null
  if (!record || String(record.status || '').trim() === 'deleted') return false
  const activity = record.activity && typeof record.activity === 'object' ? record.activity as Record<string, unknown> : {}
  if (Array.isArray(activity.events)) {
    return activity.events.some((event) => isPublicRecallEvent(event as never))
  }
  if (Array.isArray(activity.publicMilestones) && activity.publicMilestones.length > 0) return true
  const result = activity.result && typeof activity.result === 'object' ? activity.result as Record<string, unknown> : null
  return Boolean(result && Array.isArray(result.confirmedIds))
}

function writeRecallActivityEntryLabel(messageKey: string, label: string) {
  const normalized = String(label || '').trim()
  if (!messageKey || !normalized) return
  recallActivityEntryLabelsByMessageKey.value = {
    ...recallActivityEntryLabelsByMessageKey.value,
    [messageKey]: normalized
  }
}

function setDisplayableRecallActivityEntryKey(messageKey: string, displayable: boolean) {
  if (!messageKey) return
  if (displayable) {
    displayableRecallActivityEntryKeys.value = {
      ...displayableRecallActivityEntryKeys.value,
      [messageKey]: true
    }
    return
  }
  const nextDisplayable = { ...displayableRecallActivityEntryKeys.value }
  delete nextDisplayable[messageKey]
  displayableRecallActivityEntryKeys.value = nextDisplayable
  const nextLabels = { ...recallActivityEntryLabelsByMessageKey.value }
  delete nextLabels[messageKey]
  recallActivityEntryLabelsByMessageKey.value = nextLabels
}

async function loadRecallActivityEntryLabelForMessage(msg: ChatMessageViewModel) {
  const messageKey = resolveMessageDisplayKey(msg)
  if (!messageKey) return
  if (recallActivityEntryLabelsByMessageKey.value[messageKey]) return
  if (loadingRecallActivityEntryLabelsByMessageKey.value[messageKey]) return
  if (loadedEmptyRecallActivityEntryLabelsByMessageKey.value[messageKey]) return

  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return
  const sessionId = String(props.activeSessionId || (msg as Record<string, unknown>)?._sessionId || '').trim()
  const targetId = String(props.currentTarget || '').trim()
  if (!sessionId && !targetId) return

  loadingRecallActivityEntryLabelsByMessageKey.value = {
    ...loadingRecallActivityEntryLabelsByMessageKey.value,
    [messageKey]: true
  }
  try {
    const entry = sessionId
      ? await locateChatRecallActivityLogBySessionId(sessionId, messageId)
      : await locateChatRecallActivityLog(targetId, messageId)
    const label = readRecallActivityEntryLabel(entry?.activity)
    if (label || hasRecallActivityProcess(entry)) {
      setDisplayableRecallActivityEntryKey(messageKey, true)
      writeRecallActivityEntryLabel(messageKey, label || t('chat.viewRecallProcess'))
      return
    }
    setDisplayableRecallActivityEntryKey(messageKey, false)
    loadedEmptyRecallActivityEntryLabelsByMessageKey.value = {
      ...loadedEmptyRecallActivityEntryLabelsByMessageKey.value,
      [messageKey]: true
    }
  } catch (error) {
    console.error('加载召回活动入口文案失败:', error)
    loadedEmptyRecallActivityEntryLabelsByMessageKey.value = {
      ...loadedEmptyRecallActivityEntryLabelsByMessageKey.value,
      [messageKey]: true
    }
  } finally {
    const nextLoading = { ...loadingRecallActivityEntryLabelsByMessageKey.value }
    delete nextLoading[messageKey]
    loadingRecallActivityEntryLabelsByMessageKey.value = nextLoading
  }
}

function shouldHydrateRecallActivityEntryLabel(msg: ChatMessageViewModel, index: number) {
  if (msg?.role === 'user') return false
  if (isCapsFinalReplyMessage(msg)) return false
  if (isNarrationMessage(msg)) return false
  if (recallActivityEntryLabelsByMessageKey.value[resolveMessageDisplayKey(msg)]) return false
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return false
  if (loadedEmptyRecallActivityEntryLabelsByMessageKey.value[resolveMessageDisplayKey(msg)]) return false
  return true
}

function hydrateRecallActivityEntryLabels() {
  props.currentMessages.forEach((msg, index) => {
    if (!shouldHydrateRecallActivityEntryLabel(msg, index)) return
    void loadRecallActivityEntryLabelForMessage(msg)
  })
}

watch(
  () => ({
    status: recallTraceState.activeActivity.value?.status || '',
    runId: recallTraceState.activeActivity.value?.id || '',
    label: readLatestPublicRecallMilestoneText(recallTraceState.activeActivity.value || {}),
    messageKeys: props.currentMessages
      .filter((msg) => msg?.role === 'assistant')
      .map((msg) => resolveMessageDisplayKey(msg))
      .filter(Boolean)
      .join(',')
  }),
  (snapshot) => {
    const runId = String(snapshot.runId || '')
    const currentAssistantKeys = snapshot.messageKeys.split(',').filter(Boolean)
    if (runId && snapshot.status === 'running' && !recallActivityAssistantKeysAtRunStart.value[runId]) {
      recallActivityAssistantKeysAtRunStart.value = {
        ...recallActivityAssistantKeysAtRunStart.value,
        [runId]: currentAssistantKeys
      }
    }
    if (snapshot.status !== 'completed' && snapshot.status !== 'failed') return
    const label = String(snapshot.label || '').trim()
    if (runId && label) {
      pendingRecallActivityEntryLabelsByRun.value = {
        ...pendingRecallActivityEntryLabelsByRun.value,
        [runId]: label
      }
    }
    if (!label) return
    const baseline = new Set(recallActivityAssistantKeysAtRunStart.value[runId] || [])
    const targetAssistant = props.currentMessages
      .filter((msg) => msg?.role === 'assistant')
      .slice()
      .reverse()
      .find((msg) => {
        const messageKey = resolveMessageDisplayKey(msg)
        return messageKey && !baseline.has(messageKey)
      })
    if (!targetAssistant) return
    const messageKey = resolveMessageDisplayKey(targetAssistant)
    writeRecallActivityEntryLabel(messageKey, label)
  },
  { flush: 'post' }
)

watch(
  () => props.currentMessages
    .filter((msg) => msg?.role === 'assistant')
    .map((msg) => resolveMessageDisplayKey(msg))
    .filter(Boolean)
    .join(','),
  () => {
    const entries = Object.entries(pendingRecallActivityEntryLabelsByRun.value)
    if (!entries.length) return
    for (const [runId, label] of entries) {
      const baseline = new Set(recallActivityAssistantKeysAtRunStart.value[runId] || [])
      const targetAssistant = props.currentMessages
        .filter((msg) => msg?.role === 'assistant')
        .slice()
        .reverse()
        .find((msg) => {
          const messageKey = resolveMessageDisplayKey(msg)
          return messageKey && !baseline.has(messageKey)
        })
      if (!targetAssistant) continue
      const messageKey = resolveMessageDisplayKey(targetAssistant)
      writeRecallActivityEntryLabel(messageKey, label)
      const nextPending = { ...pendingRecallActivityEntryLabelsByRun.value }
      delete nextPending[runId]
      pendingRecallActivityEntryLabelsByRun.value = nextPending
    }
  },
  { flush: 'post' }
)

watch(
  () => ({
    sessionId: props.activeSessionId || '',
    targetId: props.currentTarget || '',
    messages: props.currentMessages
      .map((msg, index) => `${resolveMessageDisplayKey(msg)}:${thoughtBlocks(getDisplayedContent(msg, index)).length}`)
      .join('|')
  }),
  hydrateRecallActivityEntryLabels,
  { immediate: true, flush: 'post' }
)

function shouldShowMessageRecallAction(msg: ChatMessageViewModel) {
  if (msg?.role === 'user') return false
  if (isCapsFinalReplyMessage(msg)) return false
  if (isNarrationMessage(msg)) return false
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) return false
  if (!isNarrationDebugMessage(msg)) return true
  if (getMessageRecallRunId(msg)) return true
  if (getMessageRecallActivityLogId(msg)) return true
  const messageKey = resolveMessageDisplayKey(msg)
  return Boolean(messageKey && displayableRecallActivityEntryKeys.value[messageKey])
}

function isCapsFinalReplyMessage(msg: ChatMessageViewModel | null | undefined) {
  const messageKind = String(msg?.messageKind ?? (msg as Record<string, unknown> | null | undefined)?.message_kind ?? '').trim()
  return messageKind === 'caps_reply'
}

function messageThoughtKey(msg: ChatMessageViewModel, index: number, thoughtIndex: number) {
  const messageId = resolveMessageId(msg)
  const versionIndex = getActiveVersionIndex(msg)
  const stableId = Number.isInteger(messageId) && messageId > 0 ? messageId : index
  return `message:${stableId}:v${versionIndex}:think:${thoughtIndex}`
}

function streamingThoughtKey(thoughtIndex: number) {
  return `stream:${props.streamingTargetId || props.currentTarget || 'active'}:${thoughtIndex}`
}

function isThoughtExpanded(key: string) {
  return expandedThoughtKeys.value.has(key)
}

function toggleThought(key: string) {
  const next = new Set(expandedThoughtKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedThoughtKeys.value = next
}

function getVersionList(msg: ChatMessageViewModel) {
  return Array.isArray(msg?.versionList) ? msg.versionList : []
}

function getVersionTotal(msg: ChatMessageViewModel) {
  const versionList = getVersionList(msg)
  return versionList.length > 0 ? versionList.length : 1
}

function getActiveVersionIndex(msg: ChatMessageViewModel) {
  const total = getVersionTotal(msg)
  const rawIndex = Number(msg?.activeVersionIndex)
  if (!Number.isInteger(rawIndex)) return total - 1
  return Math.min(Math.max(rawIndex, 0), total - 1)
}

function isRegeneratingAt(index: number) {
  return props.isTyping && props.regeneratingMessageIndex === index
}

function isRoleOrNarrationMessage(msg: ChatMessageViewModel) {
  if (isNarrationDebugMessage(msg)) return false
  return isNarrationMessage(msg) || msg?.role === 'assistant'
}

function isVisibleChatMessage(msg: ChatMessageViewModel) {
  return !isNarrationDebugMessage(msg)
}

function getMessageVirtualTime(msg: ChatMessageViewModel) {
  return String(
    msg?.envDate
    ?? (msg as Record<string, unknown>)?.env_date
    ?? ''
  ).trim()
}

function getMessageDisplayTime(msg: ChatMessageViewModel) {
  if (isVisibleChatMessage(msg)) return getMessageVirtualTime(msg) || String(msg?.time || '').trim()
  return String(msg?.time || '').trim()
}

function getMessageModelMeta(msg: ChatMessageViewModel) {
  if (!isRoleOrNarrationMessage(msg)) return ''
  return String(msg?.model || '').trim()
}

function getMessageEnvironmentMeta(msg: ChatMessageViewModel) {
  if (isVisibleChatMessage(msg)) {
    const envWeather = String(msg?.envWeather ?? (msg as Record<string, unknown>)?.env_weather ?? '').trim()
    const envLocation = String(msg?.envLocation ?? (msg as Record<string, unknown>)?.env_location ?? '').trim()
    return [envLocation, envWeather].filter(Boolean).join(' ')
  }
  return getMessageEnvironmentLabel(msg)
}

function isHiddenFromPrompt(msg: ChatMessageViewModel) {
  const value = msg?.autoWriteHidden ?? (msg as Record<string, unknown>)?.auto_write_hidden
  return value === true || value === 1 || value === '1' || value === 'true'
}

function getProjectionVisibilityInfo(msg: ChatMessageViewModel) {
  const messageId = resolveMessageId(msg)
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return { hiddenCount: 0, totalCount: 0, hiddenNames: [] as string[], allHidden: false }
  }
  const rows = projectionVisibilityRows.value.filter((row) => Number(row.messageId || 0) === messageId)
  const characterIds = new Set<string>()
  const hiddenCharacterIds = new Set<string>()
  const hiddenNames: string[] = []
  rows.forEach((row) => {
    const characterId = String(row.characterId || '').trim()
    if (characterId) characterIds.add(characterId)
    if (String(row.visibility || '').trim() !== 'hidden') return
    if (characterId) hiddenCharacterIds.add(characterId)
    const name = String(row.characterName || row.characterId || '').trim()
    if (name && !hiddenNames.includes(name)) hiddenNames.push(name)
  })
  const totalCount = characterIds.size
  const hiddenCount = hiddenCharacterIds.size || hiddenNames.length
  return {
    hiddenCount,
    totalCount,
    hiddenNames,
    allHidden: hiddenCount > 0 && totalCount > 0 && hiddenCount >= totalCount
  }
}

function getProjectionVisibilityHiddenCount(msg: ChatMessageViewModel) {
  return getProjectionVisibilityInfo(msg).hiddenCount
}

function getHiddenMarkerText(msg: ChatMessageViewModel) {
  if (isHiddenFromPrompt(msg)) return t('chat.hiddenMarker')
  const info = getProjectionVisibilityInfo(msg)
  if (!info.hiddenCount) return ''
  if (info.allHidden) return t('chat.hiddenMarker')
  return t('chat.hiddenForChars', { count: info.hiddenCount })
}

function getHiddenMarkerTitle(msg: ChatMessageViewModel) {
  if (isHiddenFromPrompt(msg)) return t('chat.msgExcludedFromPrompt')
  const info = getProjectionVisibilityInfo(msg)
  if (!info.hiddenCount) return ''
  const names = info.hiddenNames.join(t('chat.nameSeparator'))
  return info.allHidden
    ? t('chat.msgHiddenForAll', { names })
    : t('chat.msgHiddenForSome', { names })
}

function getPromptVisibilityButtonTitle(msg: ChatMessageViewModel) {
  const action = isHiddenFromPrompt(msg) ? t('chat.restoreToPrompt') : t('chat.hideFromPrompt')
  const info = getProjectionVisibilityInfo(msg)
  if (!info.hiddenCount) return action
  const names = info.hiddenNames.join(t('chat.nameSeparator'))
  const visibility = info.allHidden
    ? t('chat.projectionHiddenForAll', { names })
    : t('chat.projectionHiddenForCount', { count: info.hiddenCount, names })
  return t('chat.promptVisibilityCombined', { visibility, action })
}

const emit = defineEmits([
  'open-char-settings',
  'open-fullscreen-image',
  'update:editing-message-content',
  'cancel-edit-message',
  'save-edit-message',
  'save-and-regenerate',
  'start-edit-message',
  'delete-message',
  'regenerate-message',
  'select-message-version',
  'copy-message',
  'add-message-note',
  'toggle-message-prompt-visibility',
  'assistant-avatar-click',
  'open-user-editor',
  'open-prompt-log-panel',
  'open-recall-activity-panel',
  'open-personality-orchestration-audit',
  'create-first-character'
])

function resolveMessageId(msg: ChatMessageViewModel) {
  const rawMessageId = String(msg?.id || '').trim()
  return Number(rawMessageId.match(/\d+$/)?.[0] || rawMessageId)
}

function resolveMessageDisplayKey(msg: ChatMessageViewModel) {
  const messageId = resolveMessageId(msg)
  if (Number.isInteger(messageId) && messageId > 0) return `id:${messageId}`
  const localKey = String(msg?._localStreamingKey || '').trim()
  if (localKey) return `local:${localKey}`
  return ''
}

function getMessageRecallRunId(msg: ChatMessageViewModel) {
  return String((msg as Record<string, unknown>)?._recallActivityRunId || '').trim()
}

function getMessageRecallActivityLogId(msg: ChatMessageViewModel) {
  return String(
    (msg as Record<string, unknown>)?.recallActivityLogId
    ?? (msg as Record<string, unknown>)?.recall_activity_log_id
    ?? ''
  ).trim()
}

function isLocalRecallLoadingMessage(msg: ChatMessageViewModel) {
  if (!msg?._localStreamingKey) return false
  if (msg.role !== 'assistant') return false
  return (msg as Record<string, unknown>)?._recallLoading === true
}

function isLocalAssistantLoadingMessage(msg: ChatMessageViewModel) {
  if (!msg?._localStreamingKey) return false
  if (msg.role !== 'assistant') return false
  if (displayChatText(String(msg.content || '')).trim()) return false
  return !isLocalRecallLoadingMessage(msg)
}

/** 回复过程轨数据：恢复协议真值在共享模块 replyWorkflowMessageView（桌面与移动端联动）。 */
function readMessageProcessTrace(msg: ChatMessageViewModel) {
  return readReplyWorkflowMessageProcessTrace(msg as Record<string, unknown>, resolveMessageId(msg), processTraceByMessageId.value)
}

function hasProcessTrace(msg: ChatMessageViewModel): boolean {
  return !!readMessageProcessTrace(msg)
}

function processTraceSteps(msg: ChatMessageViewModel): Record<string, string> {
  return readMessageProcessTrace(msg)?.steps || {}
}

function processTraceFailed(msg: ChatMessageViewModel): boolean {
  return readMessageProcessTrace(msg)?.failed === true
}

function processTraceElapsed(msg: ChatMessageViewModel): string {
  return readMessageProcessTrace(msg)?.elapsed || ''
}

function processTraceMode(msg: ChatMessageViewModel): string {
  return readMessageProcessTrace(msg)?.mode || 'personality_model'
}

function processTraceNarration(msg: ChatMessageViewModel) {
  return readMessageProcessTrace(msg)?.narration || null
}

function processTraceReviewDegrade(msg: ChatMessageViewModel) {
  return readMessageProcessTrace(msg)?.reviewDegrade || null
}

function processTraceStepElapsed(msg: ChatMessageViewModel): Record<string, string> {
  return readMessageProcessTrace(msg)?.stepElapsed || {}
}

// ---- 提调编排带·一轮一条（统筹整轮）----
// 一轮 = 一条用户消息后、到下一条用户消息前，连续的非用户非调试消息（所有角色回复 + 所有旁白）。
// 编排带锚在该轮第一条成员前，聚合整轮全部成员的导演决策流；群聊一轮多发言者也只出一条带。

// 批次3·统一锚到用户消息（2026-06-22）：找某轮锚成员 index 之前最近一条用户消息（该轮的「用户消息」）。无则 -1。
// 决策流的即时落库/历史复原统一锚到这条用户消息（与实时带 422 行一致），群聊纠偏/首发刷新后提调带不再消失。
function roundUserMessageIndexFor(anchorIndex: number): number {
  const msgs = currentMessages.value || []
  for (let k = anchorIndex - 1; k >= 0; k--) {
    const m = msgs[k]
    if (m && m.role === 'user' && !isNarrationDebugMessage(m)) return k
  }
  return -1
}
// 取该轮用户消息落库的 directorStream + 同处 appendLog + 真实 prompt（提调真读那份的历史来源）；无快照返回 null。
function roundUserDirectorTraceFor(anchorIndex: number): { stream: TidiaoDirectorStream; appendLog: AppendLogEvent[]; directorPrompt: string } | null {
  const userIdx = roundUserMessageIndexFor(anchorIndex)
  if (userIdx < 0) return null
  const userMsg = currentMessages.value?.[userIdx]
  const trace = userMsg ? readMessageProcessTrace(userMsg) : null
  const stream = trace?.directorStream || null
  if (!stream) return null
  const appendLog = (trace as { appendLog?: unknown })?.appendLog
  // option C：真实 prompt 与 directorStream/appendLog 同处落库，随快照一起取出供「喂模型原文」忠实显示。
  const directorPrompt = String((trace as { directorPrompt?: unknown })?.directorPrompt || '')
  return { stream, appendLog: Array.isArray(appendLog) ? (appendLog as AppendLogEvent[]) : [], directorPrompt }
}

// 轮分组：返回 Map<轮锚消息index, 该轮全部成员index[]>；至少一个成员有过程轨、或该轮用户消息已落决策流时建带。
// 批次3：纳入「该轮用户消息有决策流」——首发/群聊中断时成员尚无 trace、但用户消息已即时落库决策流，仍出带（不丢）。
const roundBandGroups = computed<Map<number, number[]>>(() => {
  const map = new Map<number, number[]>()
  const msgs = currentMessages.value || []
  let i = 0
  while (i < msgs.length) {
    const msg = msgs[i]
    const isMember = !!msg && msg.role !== 'user' && !isNarrationDebugMessage(msg)
    if (!isMember) { i++; continue }
    const members: number[] = []
    let j = i
    while (j < msgs.length) {
      const mj = msgs[j]
      if (!mj || mj.role === 'user' || isNarrationDebugMessage(mj)) break
      members.push(j)
      j++
    }
    const memberHasTrace = members.some((idx) => hasProcessTrace(msgs[idx]))
    if (memberHasTrace || roundUserDirectorTraceFor(i)) map.set(i, members)
    i = j
  }
  return map
})

// ---- O-B：历史轮已落库的导演 loop 快照（刷新持久化复原）----
// 某轮成员过程轨带 directorStream（单聊真·导演 loop 落库的最终快照）时，该轮历史复原走新带
// TidiaoDirectorStreamBand（决策流+并排分镜，含旁白决策步/旁白镜），取代旧 tidiaoBandModel 单聊渲染。
// 与 directorStreamRound（进行中活动轮）互斥：活动轮由下方 anchorMessageId 渲染、本 map 只复原历史结果态。
// 批次3·统一锚到用户消息（2026-06-22）：优先读「该轮用户消息」的决策流（与实时带、写侧锚点一致），
// 取不到再兜底扫成员（旧记录锚成员仍能复原，零回归）。同轮用户锚 + 成员可能都有决策流 → 取决策最多的一条、只渲一条带（防双显）。
// 值携带 stream + 同处 appendLog（提调真读那份的历史来源，与 stream 取自同一条获胜 processTrace）。
const roundDirectorStreamGroups = computed<Map<number, { stream: TidiaoDirectorStream; appendLog: AppendLogEvent[]; directorPrompt: string }>>(() => {
  const map = new Map<number, { stream: TidiaoDirectorStream; appendLog: AppendLogEvent[]; directorPrompt: string }>()
  for (const [anchorIndex, memberIdxs] of roundBandGroups.value) {
    // 候选来源：该轮用户消息 + 各成员。择优收口到共享 pickRoundDirectorTraceGroup（批次K2·与移动端联动）：
    // stream/appendLog 取决策最多者（平局用户锚优先·语义不变），prompt 胜者为空时回退任一候选非空的那份——
    // 锚 artifact 后半程写失败、成员 trace 胜出时不再丢 prompt（丢了查看器就退化旧压缩台账）。
    const candidates: Array<RoundDirectorTraceCandidate | null> = [roundUserDirectorTraceFor(anchorIndex)]
    for (const idx of memberIdxs) {
      const msg = currentMessages.value?.[idx]
      const trace = msg ? readMessageProcessTrace(msg) : null
      const stream = trace?.directorStream || null
      if (!stream) continue
      const appendLog = (trace as { appendLog?: unknown })?.appendLog
      // option C：真实 prompt 与快照同处取出（成员轨旧路无则空串·由共享择优回退兜底）。
      const directorPrompt = String((trace as { directorPrompt?: unknown })?.directorPrompt || '')
      candidates.push({ stream, appendLog: Array.isArray(appendLog) ? (appendLog as AppendLogEvent[]) : [], directorPrompt })
    }
    const best = pickRoundDirectorTraceGroup(candidates)
    if (best) map.set(anchorIndex, best)
  }
  return map
})
function roundDirectorStreamFor(anchorIndex: number): TidiaoDirectorStream | null {
  return roundDirectorStreamGroups.value.get(anchorIndex)?.stream || null
}
// 历史带·提调真读那份（option C）：真实 prompt + 本轮 loop 真实往来（未折叠）；无则空串、侧栏不显示该块。
function roundDirectorMemoryFor(anchorIndex: number): string {
  const group = roundDirectorStreamGroups.value.get(anchorIndex)
  return group ? renderDirectorMemoryDocument(group.directorPrompt, group.appendLog) : ''
}
// 历史新带头部说话人：取快照里第一条角色镜的 label（自包含于快照，无需回查消息）。
function roundDirectorStreamSpeakerFor(anchorIndex: number): string {
  const stream = roundDirectorStreamFor(anchorIndex)
  return stream?.shots.find((shot) => shot.kind === 'character')?.label || ''
}

// ---- 提调真·导演 loop 轮级流式载体（子批5：单聊端到端接线）----
// 与上面 roundBandGroups 旧编排带属联动能力：本载体是 loop 进行中/刚结束的「决策流+并排实时分镜」，
// 锚在用户消息与角色正文之间；旧 band 是历史复原的结果态。某轮被本载体接管时抑制该轮旧 band，
// 避免同一轮双带并排。后续统一退役旧 band（§8 处置清单）时两处需同步维护。
const directorStreamRound = computed(() => {
  const round = activeTidiaoDirectorStreamRound.value
  if (!round) return null
  const sid = String(props.activeSessionId || '').trim()
  if (sid && round.sessionId && sid !== round.sessionId) return null
  return round
})
// 活动带·提调真读那份（option C）：真实 prompt（活动容器 getActiveDirectorPrompt）+ 本轮 loop 真实往来（未折叠）；
// getActiveDirectorPrompt/getAppendLogEvents 内部读 activeAgentAppendLog ref，computed 自动建立响应式依赖、loop 推进即刷新。
const activeDirectorMemory = computed(() => renderDirectorMemoryDocument(getActiveDirectorPrompt(), getAppendLogEvents()))
// 资料池侧栏（2026-06-29 对话级）：池子改为「一会话一池」，按 sessionId 读（跨轮/跨提调带重启持久）。
// 共享模块级单例缓存（pipeline 填池 + 用户增删都写它）；computed 依赖响应式 recallPoolStoreVersion → 召回落池/用户增删即时刷新。
const poolCache = createLocalRecallRoundPoolCache()
const characterStore = useCharacterStore()
function resolveCharacterName(characterId: string): string {
  return characterStore.characters.find((c) => c.id === characterId)?.name || characterId
}
function loadSessionRecallPools(sessionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  recallPoolStoreVersion.value // 建立响应式依赖：任何写入自增版本号 → 重算
  const sid = String(sessionId || '').trim()
  return sid ? poolCache.load(sid) : null
}
const activeRoundRecallPools = computed(() => {
  const sid = directorStreamRound.value?.sessionId || String(props.activeSessionId || '').trim()
  return loadSessionRecallPools(sid)
})
// 历史轮：对话级池全会话共享同一份，历史带与实时带显示同一对话池（anchorIndex 仅保留签名兼容，不再参与取池）。
function roundRecallPoolsFor(_anchorIndex: number) {
  return loadSessionRecallPools(String(props.activeSessionId || '').trim())
}
// 当前会话资料池 sessionId（用户在侧栏增删时用——增删的是对话级池，固定为当前活动会话）。
// 入口常驻（2026-07-03）后传给带子作 poolSessionId：会话还没有池（pools=null）时侧栏增删靠它定位对话池。
const activeRecallPoolSessionId = computed(() => directorStreamRound.value?.sessionId || String(props.activeSessionId || '').trim())
// 入口常驻·加卡归属选项：当前会话成员 characterId（群聊读 participants；单聊/旧主目标兜底）。
// 联动能力：与提及候选 useAppDerivedState.filteredAtCharacters 同口径，那边口径若调整这里要同步。
const chatStoreForPool = useChatStore()
const recallPoolCastIds = computed(() => {
  const participantIds = normalizeChatSessionCharacterParticipants(getChatStoreCurrentSession(chatStoreForPool))
    .map((item) => item.characterId)
    .filter(Boolean)
  if (participantIds.length) return participantIds
  const fallbackId = normalizeChatTargetId(getChatStoreActiveTargetId(chatStoreForPool))
  return fallbackId && !fallbackId.startsWith('group_') && !fallbackId.startsWith('crowd_') ? [fallbackId] : []
})
// 某轮（成员起始 index）的锚用户消息是否正被 director 活动载体接管 → 坞里剔除该历史轮（防同轮双份·向上找最近的用户消息比对 id）。
function isRoundBandSupersededByDirector(memberStartIndex: number): boolean {
  const round = directorStreamRound.value
  if (!round || !round.anchorMessageId) return false
  const msgs = currentMessages.value || []
  for (let k = memberStartIndex - 1; k >= 0; k--) {
    const m = msgs[k]
    if (m && m.role === 'user') return resolveMessageId(m) === round.anchorMessageId
  }
  return false
}

// ---- 形态1·E5：角色镜钻取明细（群聊新带每个角色镜可展开看该角色 per-speaker 回复的取料/评审过程）----
// 数据全来自该轮各角色消息已有的过程轨（不重跑）；按角色名（=shot.label）键入，新带据此挂"点开"。
function buildRoundShotDetails(memberIdxs: number[]): Record<string, TidiaoShotDetail> {
  const map: Record<string, TidiaoShotDetail> = {}
  for (const idx of memberIdxs) {
    const m = currentMessages.value?.[idx]
    if (!m || isNarrationMessage(m) || isNarrationDebugMessage(m)) continue
    const label = getMessageSenderLabel(m)
    if (!label || label === '旁白调试') continue
    const detail = buildTidiaoShotDetail(readMessageProcessTrace(m))
    if (detail && !map[label]) map[label] = detail
  }
  return map
}
// 历史轮：复用 roundBandGroups 的成员 index 构明细。
function roundShotDetailsFor(anchorIndex: number): Record<string, TidiaoShotDetail> {
  return buildRoundShotDetails(roundBandGroups.value.get(anchorIndex) || [])
}
// 活动轮：据 anchorMessageId 找其后连续成员消息（到下一条用户消息前）构明细，随 per-speaker 落库渐进填充。
const activeRoundShotDetails = computed<Record<string, TidiaoShotDetail>>(() => {
  const round = directorStreamRound.value
  if (!round || !round.anchorMessageId) return {}
  const msgs = currentMessages.value || []
  const anchorIdx = msgs.findIndex((m) => resolveMessageId(m) === round.anchorMessageId)
  if (anchorIdx < 0) return {}
  const memberIdxs: number[] = []
  for (let k = anchorIdx + 1; k < msgs.length; k += 1) {
    const m = msgs[k]
    if (!m || m.role === 'user') break
    memberIdxs.push(k)
  }
  return buildRoundShotDetails(memberIdxs)
})

// ---- 提调坞数据源（2026-07-04 位置改造）：历史轮（旧→新）+ 活动轮（固定最后）----
// 重字段（钻取明细/资料池/喂模型原文）传 getter 惰性取：坞只渲染选中那一轮，未选中的轮不算这些重投影。
// 历史轮主键用锚用户消息 id（加载更早消息 index 平移时选中不跳轮）；被活动载体接管的历史轮剔除（防同轮双份）。
const directorDockRounds = computed<TidiaoDirectorDockRound[]>(() => {
  const list: TidiaoDirectorDockRound[] = []
  const anchors = [...roundDirectorStreamGroups.value.keys()].sort((a, b) => a - b)
  for (const anchorIndex of anchors) {
    if (isRoundBandSupersededByDirector(anchorIndex)) continue
    const group = roundDirectorStreamGroups.value.get(anchorIndex)
    if (!group) continue
    const userIdx = roundUserMessageIndexFor(anchorIndex)
    const userMsg = userIdx >= 0 ? currentMessages.value?.[userIdx] : null
    const userMsgId = userMsg ? resolveMessageId(userMsg) : 0
    list.push({
      id: userMsg ? `msg_${userMsgId}` : `idx_${anchorIndex}`,
      live: false,
      stream: group.stream,
      speakerName: roundDirectorStreamSpeakerFor(anchorIndex),
      getShotDetails: () => roundShotDetailsFor(anchorIndex),
      getRecallPools: () => roundRecallPoolsFor(anchorIndex),
      getMemoryProjection: () => roundDirectorMemoryFor(anchorIndex),
      // 消耗溯源（chat DEVELOPMENT.md 10.1）：round_id = round:sessionId:锚用户消息id，与写侧 activateRoundUsageContext 同源。
      usageRoundId: userMsgId > 0 ? `round:${String(props.activeSessionId || '')}:${userMsgId}` : ''
    })
  }
  const live = directorStreamRound.value
  if (live) {
    list.push({
      id: `live_${live.runId}`,
      live: true,
      stream: live.stream,
      speakerName: live.speakerName,
      recallRunId: live.recallRunId || '',
      hasOrchestrationAudit: Boolean(live.orchestrationAudit),
      getShotDetails: () => activeRoundShotDetails.value,
      getRecallPools: () => activeRoundRecallPools.value,
      getMemoryProjection: () => activeDirectorMemory.value,
      usageRoundId: live.anchorMessageId > 0 ? `round:${live.sessionId}:${live.anchorMessageId}` : ''
    })
  }
  return list
})
// 会话切换信号（单聊无 session 实体、activeSessionId 恒空串 → 并上 currentTarget 才能区分单聊目标）。
const directorDockContextKey = computed(() => `${String(props.activeSessionId || '')}|${String(props.currentTarget || '')}`)

function resolvePromptLogMessageId(msg: ChatMessageViewModel) {
  return resolveMessageId(msg)
}

function openPromptLog(msg: ChatMessageViewModel) {
  const numericMessageId = resolvePromptLogMessageId(msg)
  if (!Number.isInteger(numericMessageId) || numericMessageId <= 0) return
  requestPromptLogFocus(numericMessageId)
  emit('open-prompt-log-panel', numericMessageId)
}

// 本地编排详情入口：直跳到该条角色消息的人格模型编排证据。
function openOrchestrationAudit(msg: ChatMessageViewModel) {
  const numericMessageId = resolveMessageId(msg)
  if (!Number.isInteger(numericMessageId) || numericMessageId <= 0) return
  emit('open-personality-orchestration-audit', { messageId: numericMessageId })
}

// 批次I·召回入口：导演载体「召回」按钮——按本轮召回 run id 定位到召回侧栏（loop 期无 messageId，走 isThinking+runId 路径）。
function openDirectorRecall() {
  const round = directorStreamRound.value
  const recallRunId = String(round?.recallRunId || '').trim()
  if (!recallRunId) return
  emit('open-recall-activity-panel', {
    isThinking: true,
    recallRunId,
    thinkingSpeakerName: round?.speakerName || '',
    thinkingText: ''
  })
}

// 批次I·编排入口：导演载体「编排」按钮——把本轮运行态编排 payload 喂给审计面板（loop 期按 runId 走运行态，复用面板渲染）。
function openDirectorOrchestration() {
  const round = directorStreamRound.value
  if (!round?.orchestrationAudit) return
  emit('open-personality-orchestration-audit', { runtimeOrchestration: round.orchestrationAudit })
}

function openRecallActivityForMessage(msg: ChatMessageViewModel) {
  const numericMessageId = resolveMessageId(msg)
  if (!Number.isInteger(numericMessageId) || numericMessageId <= 0) return
  emit('open-recall-activity-panel', {
    thinkingText: msg.content || '',
    thinkingSpeakerName: isNarrationMessage(msg) ? '旁白' : (msg.name || currentChatTitle.value),
    isThinking: false,
    messageId: numericMessageId,
    recallRunId: getMessageRecallRunId(msg)
  })
}

function isRegularAssistantMessage(msg: ChatMessageViewModel) {
  return msg.role === 'assistant' && !isNarrationMessage(msg) && !isNarrationDebugMessage(msg)
}

function canOpenProfileFromAvatar(msg: ChatMessageViewModel) {
  return msg.role === 'user' || isRegularAssistantMessage(msg)
}

function getAvatarActionTitle(msg: ChatMessageViewModel) {
  if (msg.role === 'user') return t('chat.editUserInfo')
  if (isRegularAssistantMessage(msg)) return t('chat.editCharacterProfile')
  return ''
}

function handleMessageAvatarClick(msg: ChatMessageViewModel, event: MouseEvent) {
  if (msg.role === 'user') {
    emit('open-user-editor')
    return
  }
  handleAssistantAvatarClick(msg, event)
}

function handleAssistantAvatarClick(msg: ChatMessageViewModel, event: MouseEvent) {
  if (isNarrationMessage(msg)) return
  if (msg.role !== 'assistant') return
  const characterRef = String(msg.name || msg.memberName || props.currentTarget || '').trim()
  if (!characterRef) return
  if (event.ctrlKey || event.metaKey) {
    emit('assistant-avatar-click', {
      characterRef,
      ctrlKey: Boolean(event.ctrlKey),
      metaKey: Boolean(event.metaKey)
    })
    return
  }
  emit('open-char-settings', characterRef)
}
</script>

<style scoped>
.chat-message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
}

.chat-message-image {
  display: block;
  flex: none;
  width: 96px;
  height: 96px;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 70%, transparent);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

.chat-message-image-item {
  position: relative;
  flex: none;
}

.chat-message-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-message-images--single .chat-message-image-item,
.chat-message-images--single .chat-message-image {
  width: auto;
  height: auto;
  max-width: min(100%, 320px);
  max-height: 420px;
}

.chat-message-images--single .chat-message-image img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
}

.chat-message-image-avatar {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  background: rgba(35, 39, 35, 0.68);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.chat-message-image-item:hover .chat-message-image-avatar,
.chat-message-image-avatar:focus-visible {
  opacity: 1;
}

.chat-message-image-avatar svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}

@media (hover: none) {
  .chat-message-image-avatar {
    opacity: 1;
  }
}

/* 提调带样式已随 2026-07-04 位置改造移入 TidiaoDirectorDock.vue（顶部坞）；本组件不再直渲带子。 */

.chat-avatar {
  border: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  cursor: default;
}

.chat-avatar--clickable {
  cursor: pointer;
}

.chat-avatar--clickable:hover {
  outline: 1px solid color-mix(in srgb, var(--morandi-accent, #8b7355) 42%, transparent);
  outline-offset: 2px;
}

.chat-avatar--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--morandi-accent, #8b7355) 58%, transparent);
  outline-offset: 2px;
}

.chat-messages {
  position: relative;
}

.chat-empty-start {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 40px;
  color: #999;
  text-align: center;
}

.chat-empty-start__action {
  min-width: 104px;
  border-color: color-mix(in srgb, var(--morandi-accent) 38%, var(--morandi-border));
  background: color-mix(in srgb, var(--langhuan-paper-bg) 88%, var(--morandi-accent) 12%);
  color: var(--morandi-text);
}

.chat-empty-start__action:hover {
  border-color: color-mix(in srgb, var(--morandi-accent) 58%, var(--morandi-border));
}

.chat-older-sentinel {
  display: flex;
  justify-content: center;
  min-height: 36px;
  padding: 4px 0 12px;
}

.chat-older-sentinel__button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--langhuan-paper-bg) 88%, #ffffff 12%);
  color: color-mix(in srgb, var(--morandi-text-light) 88%, var(--morandi-text));
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.chat-older-sentinel__button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--morandi-accent) 44%, var(--morandi-border));
  color: var(--morandi-text);
}

.chat-older-sentinel__button:disabled {
  cursor: default;
  opacity: 0.66;
}

.message-note-selection-menu {
  position: fixed;
  z-index: 12000;
  padding: 4px;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--morandi-border) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--langhuan-paper-bg);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  white-space: nowrap;
  min-width: 118px;
}

.chat-messages ::selection {
  background: rgba(6, 153, 175, 0.2);
  color: #486f91;
}

:global([data-theme="dark"]) .chat-messages ::selection {
  background: rgba(0, 214, 230, 0.28);
  color: #5ff4ff;
}

.message-note-selection-menu button {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--langhuan-menu-radius, 0);
  background: transparent;
  color: var(--morandi-text);
  font-size: 12px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
}

.message-note-selection-menu button:hover {
  background: color-mix(in srgb, var(--morandi-border) 34%, transparent);
}

.message-note-selection-menu__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-hidden-marker {
  color: #8b5cf6;
  font-weight: 600;
}

.msg-action-icon {
  position: relative;
}

.msg-action-badge {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 12px;
  height: 12px;
  padding: 0 2px;
  border-radius: 999px;
  background: #8b5cf6;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 12px;
  text-align: center;
  box-shadow: 0 0 0 1px var(--morandi-card);
  pointer-events: none;
}

.chat-floor-label {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  color: color-mix(in srgb, var(--morandi-text-light) 68%, transparent);
  font-weight: 400;
}

.msg-action-btn--projection-lamp {
  --projection-lamp-color: #b98213;
}

.msg-action-btn--projection-lamp .msg-action-icon {
  color: var(--projection-lamp-color);
}

.msg-action-btn--projection-lamp:disabled {
  cursor: default;
}

.msg-action-btn--projection-pending {
  --projection-lamp-color: #b98213;
}

.msg-action-btn--projection-success {
  --projection-lamp-color: #2f8f59;
}

.msg-action-btn--projection-failed {
  --projection-lamp-color: #b34d43;
}

</style>
