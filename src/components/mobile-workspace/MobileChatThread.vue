<template>
  <section class="mobile-chat-thread" :aria-label="$t('mobile.chatThread.aria')">
    <MobileTopBar
      variant="detail"
      :title="currentChatTitle"
      show-back
      @back="$emit('back')"
    >
      <template #leading>
        <MobileAvatar :label="threadAvatar" :src="headerPhoto" :size="30" color="var(--lhm-av-brown, #8b7355)" />
      </template>
      <template #actions>
        <!-- 帷幕：暂停键 + 完整时间·地点·天气与齿轮同一行，点开即进抽屉里的帷幕设置（同桌面 pills 点击编辑语义） -->
        <div v-if="hasEnv" class="mobile-chat-env">
          <button
            v-if="envTime"
            type="button"
            class="mobile-chat-env__pause"
            :title="isSceneTimePaused ? $t('mobile.chatThread.resumeSceneTime') : $t('mobile.chatThread.pauseSceneTime')"
            :aria-label="isSceneTimePaused ? $t('mobile.chatThread.resumeSceneTime') : $t('mobile.chatThread.pauseSceneTime')"
            @click="toggleSceneTimePaused"
          >
            <MobileLineIcon :name="isSceneTimePaused ? 'play' : 'pause'" :size="12" :stroke-width="2" />
          </button>
          <button type="button" class="mobile-chat-env__open" :aria-label="$t('mobile.curtain.settingsSection')" @click="openCurtain">
            <span v-if="envTime" class="mobile-chat-env__item mobile-chat-env__item--time">
              {{ envTime }}
            </span>
            <span v-if="envLocation" class="mobile-chat-env__item">
              <MobileLineIcon name="pin" :size="12" />{{ envLocation }}
            </span>
            <span v-if="envWeather" class="mobile-chat-env__item">
              <WeatherLineIcon :name="envWeatherIconName" :size="12" />{{ envWeather }}
            </span>
          </button>
        </div>
        <button type="button" class="mobile-chat-thread__gear" :aria-label="$t('mobile.chatThread.sessionTools')" :title="$t('mobile.chatThread.sessionTools')" @click="openGear">
          <MobileLineIcon name="settings" :size="20" :stroke-width="1.8" />
        </button>
      </template>
    </MobileTopBar>

    <div class="mobile-chat-thread__stream">
      <!-- 提调坞（2026-07-04 移动端接坞，与桌面 TidiaoDirectorDock 同一组件）：提调带收进消息区顶部常驻坞。
           宿主锚点=零高度 .tds-dock-host（顶栏正下方=消息区顶边），坞经 Teleport 挂来贴顶不随滚动；
           jsdom 单测找不到已挂载宿主时原地渲染降级（就在锚点旁，位置等价）。 -->
      <div class="tds-dock-host"></div>
      <TidiaoDirectorDock
        :rounds="directorDockRounds"
        :context-key="directorDockContextKey"
        :resolve-avatar="state.getCharAvatar"
        :resolve-name="resolveCharacterName"
        :pool-session-id="activeRecallPoolSessionId"
        :pool-cast-character-ids="recallPoolCastIds"
        :compact="true"
        panel-mode="overlay"
        @open-orchestration="openDirectorOrchestration"
      />

      <div ref="messageListRef" class="mobile-chat-thread__messages lhm-scroll" role="log" aria-live="polite">
      <button
        v-if="state.chatViewModel.hasOlderMessages"
        type="button"
        class="mobile-chat-thread__older"
        :disabled="state.chatViewModel.loadingOlderMessages"
        @click="loadOlderMessages"
      >
        {{ state.chatViewModel.loadingOlderMessages ? $t('mobile.apiWs.loadingShort') : $t('chat.loadMoreMessages') }}
      </button>

      <template v-for="(message, index) in currentMessages" :key="resolveMessageKey(message, index)">
        <!-- 提调带（2026-07-04 移动端接坞）：历史轮内联带已移除，历史轮 + 活动轮统一收进顶部提调坞
             TidiaoDirectorDock（壳上 ‹ N/M › 切轮回看）；轮分组数据源 roundDirectorStreamGroups 保留供坞消费。 -->
        <div
          v-if="isNarrationMessage(message) || isDebugMessage(message)"
          class="mobile-chat-narration"
          :data-chat-message-id="messageNumericId(message)"
          :data-chat-message-index="index"
        >
          <template v-if="editingIndex === index">
            <textarea class="mobile-chat-edit__textarea" :value="editingContent" rows="5" @input="onEditInput"></textarea>
            <div class="mobile-chat-edit__actions">
              <button type="button" class="mobile-chat-edit__btn" @click="cancelEdit">{{ $t('common.cancel') }}</button>
              <button type="button" class="mobile-chat-edit__btn mobile-chat-edit__btn--primary" @click="saveEdit()">{{ $t('common.ok') }}</button>
            </div>
          </template>
          <template v-else>
            <MobileRoleplayText
              v-if="resolveMessageContent(message, index)"
              :text="resolveMessageContent(message, index)"
              :segments="precisionSegmentsForMessage(message)"
            />
            <div v-if="shouldShowMessageMeta(message)" class="mobile-chat-meta mobile-chat-meta--narration">
              <span v-if="getChatFloorLabel(message)">{{ getChatFloorLabel(message) }}</span>
              <span v-if="getMessageDisplayTime(message)">{{ getMessageDisplayTime(message) }}</span>
              <span v-if="getMessageEnvironmentMeta(message)">· {{ getMessageEnvironmentMeta(message) }}</span>
              <span v-if="getMessageModelMeta(message)">· {{ getMessageModelMeta(message) }}</span>
            </div>
            <MobileMessageActions
              :message="message"
              :index="index"
              :state="state"
              :projection-lamp="projectionLampViewFor(message)"
              @open-prompt-log="openPromptLogForMessage"
              @open-orchestration-audit="openOrchestrationAuditForMessage"
              @open-recall="openRecallForMessage"
              @projection-lamp="onProjectionLamp(message)"
            />
          </template>
        </div>

        <div
          v-else-if="message.role === 'user'"
          class="mobile-chat-user"
          :data-chat-message-id="messageNumericId(message)"
          :data-chat-message-index="index"
        >
          <div class="mobile-chat-user__body">
            <template v-if="editingIndex === index">
              <textarea class="mobile-chat-edit__textarea" :value="editingContent" rows="5" @input="onEditInput"></textarea>
              <div class="mobile-chat-edit__actions">
                <button type="button" class="mobile-chat-edit__btn" @click="cancelEdit">{{ $t('common.cancel') }}</button>
                <button type="button" class="mobile-chat-edit__btn mobile-chat-edit__btn--primary" @click="saveEdit()">{{ $t('common.ok') }}</button>
                <button type="button" class="mobile-chat-edit__btn mobile-chat-edit__btn--accent" @click="saveAndRegenerate()">{{ $t('chat.saveAndRegenerate') }}</button>
              </div>
            </template>
            <template v-else>
              <MobileRoleplayText
                v-if="resolveMessageContent(message, index)"
                :text="resolveMessageContent(message, index)"
                :segments="precisionSegmentsForMessage(message)"
              />
              <img
                v-if="message.image"
                class="mobile-chat-user__image"
                :src="message.image"
                :alt="$t('mobile.chatThread.messageImageAlt')"
                @click="state.chatActions.openFullscreenImage(message.image || '')"
              >
              <div
                v-if="messageAttachments(message).length"
                class="mobile-chat-user__attachments"
                :class="{ 'mobile-chat-attachments--single': messageAttachments(message).length === 1 }"
              >
                <div
                  v-for="att in messageAttachments(message)"
                  :key="att.id"
                  class="mobile-chat-attachment-item"
                >
                  <button type="button" class="mobile-chat-attachment-thumb" @click="state.chatActions.openFullscreenImage(att.url)">
                    <img :src="att.url" :alt="$t('mobile.chatThread.messageImageAlt')">
                  </button>
                  <button type="button" class="mobile-chat-attachment-avatar" aria-label="设为头像" @click.stop="requestChatImageAvatarAssignment(att.url, att.originalName)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="3"/></svg>
                  </button>
                </div>
              </div>
              <div v-if="shouldShowMessageMeta(message)" class="mobile-chat-meta mobile-chat-meta--user">
                <span v-if="getChatFloorLabel(message)">{{ getChatFloorLabel(message) }}</span>
                <span v-if="getMessageDisplayTime(message)">{{ getMessageDisplayTime(message) }}</span>
                <span v-if="getMessageEnvironmentMeta(message)">· {{ getMessageEnvironmentMeta(message) }}</span>
                <span v-if="getMessageModelMeta(message)">· {{ getMessageModelMeta(message) }}</span>
              </div>
              <MobileMessageActions
                :message="message"
                :index="index"
                :state="state"
                :projection-lamp="projectionLampViewFor(message)"
                @open-prompt-log="openPromptLogForMessage"
                @open-orchestration-audit="openOrchestrationAuditForMessage"
                @open-recall="openRecallForMessage"
                @projection-lamp="onProjectionLamp(message)"
              />
            </template>
          </div>
          <button
            type="button"
            class="mobile-chat-avatar-button"
            :aria-label="$t('chat.editUserInfo')"
            :title="$t('chat.editUserInfo')"
            @click="openUserEditor"
          >
            <MobileAvatar
              :label="userAvatarLabel"
              :src="userPhoto"
              :size="32"
              color="var(--lhm-av-brown, #8b7355)"
            />
          </button>
        </div>

        <div
          v-else
          class="mobile-chat-ai"
          :data-chat-message-id="messageNumericId(message)"
          :data-chat-message-index="index"
        >
          <button
            type="button"
            class="mobile-chat-avatar-button"
            :aria-label="$t('chat.editCharacterProfile')"
            :title="$t('chat.editCharacterProfile')"
            @click="openCharacterProfile(message)"
          >
            <MobileAvatar
              :label="resolveCharacterAvatarLabel(message)"
              :src="resolveCharPhoto(message)"
              :size="32"
              color="var(--lhm-av-brown, #8b7355)"
            />
          </button>
          <div class="mobile-chat-ai__body">
            <div class="mobile-chat-ai__name">{{ resolveMessageSender(message) }}</div>
            <template v-if="editingIndex === index">
              <textarea class="mobile-chat-edit__textarea" :value="editingContent" rows="5" @input="onEditInput"></textarea>
              <div class="mobile-chat-edit__actions">
                <button type="button" class="mobile-chat-edit__btn" @click="cancelEdit">{{ $t('common.cancel') }}</button>
                <button type="button" class="mobile-chat-edit__btn mobile-chat-edit__btn--primary" @click="saveEdit()">{{ $t('common.ok') }}</button>
              </div>
            </template>
            <template v-else>
              <MobileRoleplayText
                v-if="resolveMessageContent(message, index)"
                :text="resolveMessageContent(message, index)"
                :segments="precisionSegmentsForMessage(message)"
              />
              <img
                v-if="message.image"
                class="mobile-chat-ai__image"
                :src="message.image"
                :alt="$t('mobile.chatThread.messageImageAlt')"
                @click="state.chatActions.openFullscreenImage(message.image || '')"
              >
              <div
                v-if="messageAttachments(message).length"
                class="mobile-chat-ai__attachments"
                :class="{ 'mobile-chat-attachments--single': messageAttachments(message).length === 1 }"
              >
                <div
                  v-for="att in messageAttachments(message)"
                  :key="att.id"
                  class="mobile-chat-attachment-item"
                >
                  <button type="button" class="mobile-chat-attachment-thumb" @click="state.chatActions.openFullscreenImage(att.url)">
                    <img :src="att.url" :alt="$t('mobile.chatThread.messageImageAlt')">
                  </button>
                  <button type="button" class="mobile-chat-attachment-avatar" aria-label="设为头像" @click.stop="requestChatImageAvatarAssignment(att.url, att.originalName)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-2z"/><circle cx="12" cy="13" r="3"/></svg>
                  </button>
                </div>
              </div>
              <div v-if="shouldShowMessageMeta(message)" class="mobile-chat-meta mobile-chat-meta--ai">
                <span v-if="getChatFloorLabel(message)">{{ getChatFloorLabel(message) }}</span>
                <span v-if="getMessageDisplayTime(message)">{{ getMessageDisplayTime(message) }}</span>
                <span v-if="getMessageEnvironmentMeta(message)">· {{ getMessageEnvironmentMeta(message) }}</span>
                <span v-if="getMessageModelMeta(message)">· {{ getMessageModelMeta(message) }}</span>
              </div>
              <MobileMessageActions
                :message="message"
                :index="index"
                :state="state"
                :projection-lamp="projectionLampViewFor(message)"
                @open-prompt-log="openPromptLogForMessage"
                @open-orchestration-audit="openOrchestrationAuditForMessage"
                @open-recall="openRecallForMessage"
                @projection-lamp="onProjectionLamp(message)"
              />
            </template>
          </div>
        </div>
        <!-- 提调真·导演 loop 轮级流式载体（2026-07-04 移动端接坞）：不再内联锚在用户消息后，
             改由顶部提调坞承载（directorDockRounds 里 live=true 的最后一轮）。 -->
      </template>

      <div v-if="showStreamingMessage" class="mobile-chat-ai">
        <MobileAvatar
          v-if="streamingPhoto"
          :src="streamingPhoto"
          :size="32"
          color="var(--lhm-av-brown, #8b7355)"
        />
        <div class="mobile-chat-ai__body">
          <div class="mobile-chat-ai__name">{{ streamingSpeaker }}</div>
          <MobileRoleplayText v-if="state.chatViewModel.streamingText" :text="state.chatViewModel.streamingText" />
          <div v-else class="mobile-chat-thread__typing" :aria-label="$t('mobile.chatThread.generating')">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <div v-if="!currentMessages.length && !showStreamingMessage" class="mobile-chat-thread__empty" aria-hidden="true" />
      </div>
    </div>

    <div class="mobile-chat-composer-wrap">
      <!-- 提调纠偏条（2026-07-05 设计稿换皮·旧白底胶囊+棕「纠偏」按钮退役）：
           与桌面 TidiaoPrecisionEditBar 同一橄榄绿皮（#6e7c57/米白字/「提调」按钮有字反白）——联动能力：外观统一调整需同步那一处。
           默认收成主输入框顶缘约 20px「绿舌」（场记板图标+「提调」）；点舌展开橄榄绿条（底缘略叠入输入框身后·
           触屏无 hover 上浮语义）；右侧收起 chevron；输入为空时点条外也收回；correcting（提调问用户挂起）自动展开+聚焦，
           占位换「回复提调，续跑本轮」。智能二选一逻辑不动（用户 2026-06-20）：带楼层号按楼层精修；不带整段纠偏续跑。 -->
      <div
        v-if="chatVm.currentTarget && state.chatActions.applyDirectorPrecisionEdits"
        ref="tdsZoneRef"
        class="mobile-tds-zone"
      >
        <button v-if="!tdsBarOpen" type="button" class="mobile-tds-tongue" :aria-label="$t('mobile.chatThread.expandTds')" @click="openTdsBar">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="M4.5 11h15a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-7A1.5 1.5 0 0 1 4.5 11Z"/></svg>
          {{ $t('mobile.chatThread.tds') }}
        </button>
        <form v-else class="mobile-tds-bar" @submit.prevent="submitPrecisionEdit">
          <textarea
            ref="precisionEditInput"
            v-model="precisionEditText"
            class="mobile-tds-bar__input"
            rows="1"
            :disabled="Boolean(state.chatViewModel.isTyping || state.chatViewModel.hasForegroundChatTask)"
            :placeholder="precisionEditPlaceholder"
          ></textarea>
          <button type="button" class="mobile-tds-bar__fold" :aria-label="$t('mobile.chatThread.collapseTds')" :title="$t('common.collapse')" @click="tdsBarOpen = false">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <button
            type="submit"
            class="mobile-tds-bar__send"
            :class="{ 'is-active': precisionEditText.trim().length > 0 }"
            :disabled="Boolean(state.chatViewModel.isTyping || state.chatViewModel.hasForegroundChatTask) || !precisionEditText.trim()"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="21" y1="4" x2="14" y2="4"></line><line x1="10" y1="4" x2="3" y2="4"></line>
              <line x1="21" y1="12" x2="12" y2="12"></line><line x1="8" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="20" x2="16" y2="20"></line><line x1="12" y1="20" x2="3" y2="20"></line>
              <line x1="14" y1="2" x2="14" y2="6"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="16" y1="18" x2="16" y2="22"></line>
            </svg>
            {{ $t('mobile.chatThread.tds') }}
          </button>
        </form>
      </div>
      <form class="mobile-chat-composer" @submit.prevent="sendChat">
        <button type="button" class="mobile-chat-composer__plus" :aria-label="$t('common.more')" :title="$t('common.more')" @click="openPlus">
          <MobileLineIcon name="plus" :size="22" :stroke-width="1.8" />
        </button>
        <textarea
          :value="localInputText"
          rows="1"
          :placeholder="$t('mobile.chatThread.inputPlaceholder')"
          @input="handleInput"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
          @keydown="handleComposerKeydown"
        ></textarea>
        <button
          v-if="state.chatViewModel.isTyping || state.chatViewModel.hasForegroundChatTask"
          type="button"
          class="mobile-chat-composer__stop"
          :aria-label="$t('mobile.chatThread.stopGenerating')"
          :title="$t('chat.stop')"
          @click="state.chatActions.abortChat()"
        >
          <MobileLineIcon name="square" :size="15" :stroke-width="1.8" />
        </button>
        <button
          v-else
          type="submit"
          class="mobile-chat-composer__send"
          :disabled="!canSend"
          :aria-label="$t('chat.send')"
        >
          <MobileLineIcon name="send" :size="16" :stroke-width="1.9" />
        </button>
      </form>
      <p v-if="sendErrorText" class="mobile-chat-composer__error" role="status">{{ sendErrorText }}</p>
    </div>

    <!-- 加号主抽屉：聊天文件管理 / 提及 / 总结 / 旁白 / 清空；提及、旁白用二次抽屉 -->
    <MobileSheet :open="plusSheetOpen" :title="$t('mobile.chatThread.moreActions')" @close="plusSheetOpen = false">
      <button type="button" class="mobile-chat-tool-row" @click="plusHistory">
        <MobileLineIcon name="folder-plus" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.chatFileManage') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="mentionSheetOpen = true">
        <MobileLineIcon name="at-sign" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.mention') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="plusSummary">
        <MobileLineIcon name="list" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.summarizeChat') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" :disabled="!canTriggerNarration" @click="openNarrationSheet">
        <MobileLineIcon name="spark" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.narration') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row mobile-chat-tool-row--danger" @click="plusClear">
        <MobileLineIcon name="x" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.clearChat') }}</span>
      </button>
    </MobileSheet>

    <!-- 提及二次抽屉：选择角色（按顺序），复用桌面 mention 动作 -->
    <MobileSheet :open="mentionSheetOpen" :title="$t('mobile.chatThread.mentionTitle')" @close="mentionSheetOpen = false">
      <button type="button" class="mobile-chat-sheet-back" @click="mentionSheetOpen = false">
        <MobileLineIcon name="chevron-left" :size="16" /><span>{{ $t('common.back') }}</span>
      </button>
      <div v-if="mentionSelected.length" class="mobile-chat-mention-selected">
        <div class="mobile-chat-mention-selected__head">
          <span>{{ $t('mobile.chatThread.selectedOrder') }}</span>
          <button type="button" class="mobile-chat-mention-clear" @click="clearMention">{{ $t('common.clear') }}</button>
        </div>
        <div v-for="(charId, idx) in mentionSelected" :key="'sel_' + charId + '_' + idx" class="mobile-chat-mention-selected__row">
          <span class="mobile-chat-mention-selected__idx">{{ idx + 1 }}</span>
          <span class="mobile-chat-mention-selected__name">{{ charName(charId) }}</span>
          <button type="button" class="mobile-chat-mention-selected__remove" :aria-label="$t('common.remove')" @click="removeMention(idx)">×</button>
        </div>
      </div>
      <div class="mobile-chat-mention-list">
        <div
          v-for="char in atCharacters"
          :key="String(char.id || char.name || '')"
          class="mobile-chat-mention-item"
          :class="{ 'is-excluded': isMentionExcluded(char) }"
          @click="addMention(String(char.id || ''))"
        >
          <span class="mobile-chat-mention-item__main">
            <span class="mobile-chat-mention-item__name">{{ char.emoji }} {{ char.name }}</span>
            <span class="mobile-chat-mention-item__meta">
              <span>{{ mentionKindLabel(char) }}</span>
              <span v-if="mentionSummary(char)" class="mobile-chat-mention-item__summary">{{ mentionSummary(char) }}</span>
            </span>
          </span>
          <span v-if="isMentionSelected(char)" class="mobile-chat-mention-item__picked">{{ $t('mobile.chatThread.picked') }}</span>
          <button
            type="button"
            class="mobile-chat-mention-item__exclude"
            :class="{ 'is-on': isMentionExcluded(char) }"
            @click.stop="toggleExclude(String(char.id || ''))"
          >{{ isMentionExcluded(char) ? $t('mobile.chatThread.excluded') : $t('mobile.chatThread.exclude') }}</button>
        </div>
        <p v-if="!atCharacters.length" class="mobile-chat-tool-hint">{{ $t('mobile.chatThread.noMentionable') }}</p>
      </div>
    </MobileSheet>

    <!-- 旁白二次抽屉：与桌面同款的旁白选择，自定义旁白与自拟旁白平铺为分区 -->
    <MobileSheet :open="narrationSheetOpen" :title="$t('mobile.chatThread.narration')" @close="narrationSheetOpen = false">
      <button type="button" class="mobile-chat-sheet-back" @click="narrationSheetOpen = false">
        <MobileLineIcon name="chevron-left" :size="16" /><span>{{ $t('common.back') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="genNarration('event_push')">
        <MobileLineIcon name="target" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.narrEvent') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="genNarration('appearance')">
        <MobileLineIcon name="circle-user" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.narrCharacter') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="genNarration('environment')">
        <MobileLineIcon name="sun" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.narrEnvironment') }}</span>
      </button>

      <div class="mobile-chat-sheet-section">{{ $t('mobile.chatThread.narrCustomSection') }}</div>
      <button
        v-for="profile in customNarrationProfiles"
        :key="profile.id"
        type="button"
        class="mobile-chat-tool-row"
        @click="genCustomNarration(profile.id)"
      >
        <MobileLineIcon name="book-open" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ profile.name || $t('mobile.chatThread.unnamedNarration') }}</span>
      </button>
      <p v-if="!customNarrationProfiles.length" class="mobile-chat-tool-hint">{{ $t('mobile.chatThread.noCustomNarration') }}</p>

      <div class="mobile-chat-sheet-section">{{ $t('mobile.chatThread.customNarrSection') }}</div>
      <button type="button" class="mobile-chat-tool-row" @click="insertNarrationCommand('/旁白')">
        <MobileLineIcon name="square-pen" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.narrDirectOutput') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="insertNarrationCommand('/旁白_AGENT补充')">
        <MobileLineIcon name="spark" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.narrAgentPolish') }}</span>
      </button>
    </MobileSheet>

    <!-- 齿轮「会话工具」菜单：已接通项 + 待挂载面板占位（先骨架，逐批接面板） -->
    <MobileSheet :open="gearSheetOpen" :title="$t('mobile.chatThread.sessionTools')" @close="gearSheetOpen = false">
      <button type="button" class="mobile-chat-tool-row" @click="gearSessionSettings">
        <MobileLineIcon name="settings-2" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.sessionSettings') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="gearSummary">
        <MobileLineIcon name="list" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.summarizeChat') }}</span>
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="gearDark">
        <MobileLineIcon name="moon" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.me.nightMode') }}</span>
      </button>

      <div class="mobile-chat-sheet-section">{{ $t('mobile.chatThread.panelsSection') }}</div>
      <button type="button" class="mobile-chat-tool-row" @click="openCurtain">
        <MobileLineIcon name="curtain" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.curtain') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="openPromptLog">
        <MobileLineIcon name="prompt-log" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.msgActions.promptLog') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="openRecall">
        <MobileLineIcon name="radar" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.recallPanel') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="openPersonalityModel">
        <MobileLineIcon name="personality-model" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.personalityModel') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="openOrchestrationAudit">
        <MobileLineIcon name="git-branch" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.msgActions.orchestrationAudit') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button type="button" class="mobile-chat-tool-row" @click="openNotes">
        <MobileLineIcon name="note" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ $t('mobile.chatThread.notes') }}</span>
        <MobileLineIcon class="mobile-chat-tool-row__chevron" name="chevron-right" :size="18" />
      </button>
      <button
        v-for="item in pendingPanelItems"
        :key="item.key"
        type="button"
        class="mobile-chat-tool-row mobile-chat-tool-row--pending"
        disabled
      >
        <MobileLineIcon :name="item.icon" :size="20" />
        <span class="mobile-chat-tool-row__label">{{ item.label }}</span>
        <span class="mobile-chat-tool-row__tag">{{ $t('mobile.chatThread.comingSoon') }}</span>
      </button>
    </MobileSheet>

    <!-- 移动全屏面板宿主：提示词日志（复用桌面 PromptLogPanel，自读全局 chatStore） -->
    <MobileSheet tall :open="promptLogSheetOpen" :title="$t('mobile.msgActions.promptLog')" @close="closePromptLog">
      <PromptLogPanel class="mobile-chat-panel-host" :open="promptLogSheetOpen" :focus-message-id="promptLogFocusId" />
    </MobileSheet>

    <!-- 移动全屏面板宿主：召回面板（MobileRecallPanel 封装召回数据加载 + 复用桌面 RecallTracePanel） -->
    <MobileSheet tall :open="recallSheetOpen" :title="$t('mobile.chatThread.recallPanel')" @close="closeRecall">
      <MobileRecallPanel class="mobile-chat-panel-host" :state="state" :open="recallSheetOpen" :initial-message-id="recallInitialMessageId" :can-use-detail-panel="true" @close="closeRecall" />
    </MobileSheet>

    <!-- 移动全屏面板宿主：人格模型观察（复用桌面 PersonalityModelObservationPanel，自读 session 观察记录） -->
    <MobileSheet tall :open="personalityModelSheetOpen" :title="$t('mobile.chatThread.personalityModelObs')" @close="closePersonalityModel">
      <PersonalityModelObservationPanel
        class="mobile-chat-panel-host"
        :session-id="state.chatViewModel.activeSessionId || ''"
        :get-char-name-by-id="state.getCharNameById"
        @open-prompt-log="openPromptLog"
      />
    </MobileSheet>

    <!-- 移动全屏面板宿主：本地编排诊断（复用桌面面板，只做窄屏容器适配） -->
    <MobileSheet tall :open="orchestrationAuditSheetOpen" :title="$t('mobile.msgActions.orchestrationAudit')" @close="closeOrchestrationAudit">
      <PersonalityModelOrchestrationAuditPanel
        class="mobile-chat-panel-host mobile-orchestration-audit-host"
        :session-id="state.chatViewModel.activeSessionId || ''"
        :selected-message-id="orchestrationAuditMessageId"
        :runtime-orchestration="orchestrationAuditRuntime"
        @close="closeOrchestrationAudit"
      />
    </MobileSheet>

    <!-- 移动全屏面板宿主：笔记（MobileNotesPanel 封装按会话拉取 + 复用桌面 ChatNotesSidebar） -->
    <MobileSheet tall :open="notesSheetOpen" :title="$t('mobile.chatThread.notes')" @close="closeNotes">
      <MobileNotesPanel
        class="mobile-chat-panel-host"
        :state="state"
        :open="notesSheetOpen"
        @close="closeNotes"
        @jump-message="jumpToNote"
      />
    </MobileSheet>

    <!-- 帷幕环境编辑：复用桌面 AppEnvironmentPills + 场景设置/切换马甲直达入口，普通抽屉承载 -->
    <MobileSheet :open="curtainSheetOpen" :title="$t('mobile.chatThread.curtain')" @close="closeCurtain">
      <MobileCurtainPanel :state="state" @close="closeCurtain" />
    </MobileSheet>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessageViewModel } from '../../types/panelContracts'
import type { ChatMessageNote } from '../../types'
import { normalizeNarrationProfiles, type NarrationProfile } from '../../app/narrationProtocol'
import { maybeAutoCloseDirectiveBracket } from '../../app/directorDirective'
import { parseVirtualSceneDisplayTime } from '../../utils/virtualScene'
import MobileAvatar from './MobileAvatar.vue'
import WeatherLineIcon from '../common/WeatherLineIcon.vue'
import MobileLineIcon from './MobileLineIcon.vue'
import MobileRoleplayText from './MobileRoleplayText.vue'
import MobileSheet from './MobileSheet.vue'
import MobileTopBar from './MobileTopBar.vue'
import MobileMessageActions from './MobileMessageActions.vue'
import { buildTidiaoShotDetail, type TidiaoShotDetail } from '../../app/tidiaoBandModel'
// 提调真·导演 loop 轮级流式载体（子批5：单聊端到端接线，与桌面 ChatMessageStream.vue 同源）。
// 提调坞（2026-07-04 移动端接坞）：与桌面同一组件，带（TidiaoDirectorStreamBand）由坞内部渲染。
import TidiaoDirectorDock, { type TidiaoDirectorDockRound } from '../app/chat/TidiaoDirectorDock.vue'
import { activeTidiaoDirectorStreamRound, clearTidiaoDirectorStreamRoundIfOtherSession } from '../../app/tidiaoDirectorStreamState'
// state 查看器·提调真读那份（与桌面 ChatMessageStream.vue 同源）：本带 appendLog → 「喂模型原文」md。
import { getActiveDirectorPrompt, getAppendLogEvents } from '../../app/agentState/appendLog'
// option C（2026-07-01·发送时留存真实 prompt·与桌面 ChatMessageStream 同源）：查看器「喂模型原文」改显示
// 真实 prompt + loop 真实往来（未折叠），不再显示旧压缩台账；renderDirectorMemoryDocument 是读侧唯一入口。
import { renderDirectorMemoryDocument } from '../../app/agentState/appendLogProjection'
import type { AppendLogEvent } from '../../app/agentState/appendLogTypes'
import { createLocalRecallRoundPoolCache, recallPoolStoreVersion } from '../../app/recallRoundPoolCache'
import { useCharacterStore } from '../../stores/characterStore'
import { activeTidiaoPrecisionEditIndicator, getTidiaoPrecisionEditSegments } from '../../app/tidiaoMessageEditIndicatorState'
import type { TidiaoDirectorStream } from '../../app/tidiaoDirectorStream'
import { assignChatFloorNumbers, classifyChatFloorKind, type ChatFloorKind } from '../../app/chatMessageFloor'
// 输入框图片上传计划批4：气泡多图渲染，旧 message.image 单图分支保留观察（处置清单：不复用，不改动）。
import { readMessageAttachments } from '../../utils/chatAttachments'
import { requestChatImageAvatarAssignment } from '../../app/chatImageAvatarAssignment'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { useToast } from '../../composables/useToast'
import { useStickToBottom } from '../../composables/useStickToBottom'
import {
  fetchChatPersonalityModelObservationsBySessionId,
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession,
  normalizeChatSessionCharacterParticipants,
  normalizeChatTargetId,
  runChatMessageProjectionBySessionId,
  type ChatPersonalityModelObservationProjection
} from '../../repositories/chatRepository'
import { useChatStore } from '../../stores/chatStore'
// 回复工作流消息视图共享真值（过程轨恢复 + 投影灯状态机）：与桌面 ChatMessageStream.vue 联动，
// 状态机或恢复协议调整时两端同步生效，不得在移动端另写一套。
import {
  buildProcessTraceMapFromTraces,
  canUseProjectionLampState,
  isProjectionFeatureMode,
  isProjectionRowSuccess,
  pickRoundDirectorTraceGroup,
  readMessageProcessTrace,
  readProjectionRunStatus,
  resolveProjectionLampState,
  resolveProjectionLampTitle,
  type ProjectionLampState,
  type ReplyWorkflowProcessTraceView,
  type RoundDirectorTraceCandidate
} from '../../app/replyWorkflowMessageView'
import { chatProjectionObservationTick } from '../../app/chatProjectionObservationSignal'
import type { MobileWorkspaceIconName, MobileWorkspaceShellProps } from './mobileWorkspaceTypes'
import { resolveWeatherIconName } from '../../utils/environmentFormat'

// 桌面端面板组件按需复用进移动全屏面板宿主，异步加载避免拖累聊天首屏
const PromptLogPanel = defineAsyncComponent(() => import('../app/chat/PromptLogPanel.vue'))
const MobileRecallPanel = defineAsyncComponent(() => import('./MobileRecallPanel.vue'))
const PersonalityModelObservationPanel = defineAsyncComponent(() => import('../app/chat/PersonalityModelObservationPanel.vue'))
const PersonalityModelOrchestrationAuditPanel = defineAsyncComponent(() => import('../app/chat/PersonalityModelOrchestrationAuditPanel.vue'))
const MobileNotesPanel = defineAsyncComponent(() => import('./MobileNotesPanel.vue'))
const MobileCurtainPanel = defineAsyncComponent(() => import('./MobileCurtainPanel.vue'))

const props = defineProps<MobileWorkspaceShellProps>()

defineEmits<{
  back: []
}>()

const messageListRef = ref<HTMLElement | null>(null)
const localInputText = ref('')
// 批次 M3-4：持久提调精修迷你行（移动端）。
const precisionEditText = ref('')
const precisionEditInput = ref<HTMLTextAreaElement | null>(null)
const isComposingInput = ref(false)
const plusSheetOpen = ref(false)
const gearSheetOpen = ref(false)
const mentionSheetOpen = ref(false)
const narrationSheetOpen = ref(false)
const promptLogSheetOpen = ref(false)
const promptLogFocusId = ref(0)
const recallSheetOpen = ref(false)
const recallInitialMessageId = ref(0)
const personalityModelSheetOpen = ref(false)
const orchestrationAuditSheetOpen = ref(false)
const orchestrationAuditMessageId = ref<number | string | null>(null)
// 批次I·编排入口：导演 loop 期运行态编排 payload（按 runId 折叠），直接喂审计面板渲染。
const orchestrationAuditRuntime = ref<Record<string, unknown> | null>(null)
const notesSheetOpen = ref(false)
const curtainSheetOpen = ref(false)
const sendErrorText = ref('')
const { t } = useI18n()
const state = computed(() => props.state)
const chatVm = computed(() => state.value.chatViewModel)
const currentMessages = computed(() => state.value.chatViewModel.currentMessages || [])
// 楼层号计数复用共享真值 assignChatFloorNumbers（与桌面端、后端提调读会话消息工具同一套编号）；
// 分类仍用本地 getMessageFloorKind 保持原有口径不变。联动：见 chatMessageFloor.ts 头注释。
const messageFloorMap = computed(() => assignChatFloorNumbers(currentMessages.value, getMessageFloorKind))
// 编辑态：与桌面同源，editingMessageIndex 命中某条消息时该条改为可编辑文本域
const editingIndex = computed(() => Number(state.value.chatViewModel.editingMessageIndex ?? -1))
const editingContent = computed(() => String(state.value.chatViewModel.editingMessageContent || ''))
function onEditInput(event: Event) {
  state.value.chatActions.updateEditingMessageContent?.((event.target as HTMLTextAreaElement).value)
}
function saveEdit() {
  // saveEditMessage 无参：编辑 index 存在 chatViewModel.editingMessageIndex
  state.value.chatActions.saveEditMessage?.()
}
function cancelEdit() {
  state.value.chatActions.cancelEditMessage?.()
}
function saveAndRegenerate() {
  state.value.chatActions.saveAndRegenerate?.()
}
const currentChatTitle = computed(() => state.value.chatViewModel.currentChatTitle || t('mobile.chatThread.noSessionSelected'))
const activeSessionRow = computed(() => {
  const activeId = String(chatVm.value.activeSessionId || '').trim()
  return (chatVm.value.chatSessionRows || []).find((row) => String(row.sessionId || '') === activeId) || null
})
const currentSessionRecord = computed(() => chatVm.value.currentSession as Record<string, unknown> | null | undefined)
const currentSessionParticipantCount = computed(() => {
  const participants = currentSessionRecord.value?.participants
  if (Array.isArray(participants) && participants.length) return participants.length
  return Number(activeSessionRow.value?.participantCount || 1)
})
const currentSessionEmoji = computed(() => readFirstText(
  currentSessionRecord.value?.conversationEmoji,
  currentSessionRecord.value?.conversation_emoji,
  activeSessionRow.value?.emoji,
  resolveCharacterEmoji(currentChatTitle.value)
))
const currentSessionAvatar = computed(() => normalizeAvatarUrl(readFirstText(
  currentSessionRecord.value?.conversationAvatarPath,
  currentSessionRecord.value?.conversation_avatar_path,
  activeSessionRow.value?.avatarPath
)))
const threadAvatar = computed(() => currentSessionEmoji.value || (currentSessionParticipantCount.value >= 2 ? '👥' : '👤'))
// 顶部帷幕条：读当前会话场景 currentScene 的时间·地点·天气（即当前会话的帷幕投影，抽屉里编辑
// environmentViewModel 最终回流到这里），切会话时跟着变；点帷幕条进抽屉里的帷幕设置。
// 紧凑天气：完整串形如「晴, 32°C, 体感31°C, 湿度40%, 风…」只取「状况 + 温度」（如「晴 32°C」）。
function compactWeather(raw: unknown) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const segments = text.split(/[，,]/).map((part) => part.trim()).filter(Boolean)
  if (segments.length <= 1) return text
  const condition = segments[0]
  const temp = segments.find((part) => /[°℃]/.test(part))
  return temp && temp !== condition ? `${condition} ${temp}` : condition
}
const sceneRaw = computed(() => state.value.chatViewModel.currentScene)
// 完整帷幕时间：与桌面 AppEnvironmentPills.compactTimeText 同格式「时:分:秒 年/月/日」，
// 联动：桌面格式调整时此处需同步。
const envTime = computed(() => {
  const raw = String(sceneRaw.value?.time || '').trim()
  if (!raw) return ''
  const date = parseVirtualSceneDisplayTime(raw)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
})
// 暂停态与写入都走桌面同一份环境真值链路（environmentViewModel.timeRate / environmentActions.toggleSceneTimePaused）
const isSceneTimePaused = computed(() => Number(state.value.environmentViewModel?.timeRate ?? 1) <= 0)
function toggleSceneTimePaused() {
  state.value.environmentActions?.toggleSceneTimePaused?.()
}
const envLocation = computed(() => String(sceneRaw.value?.location || '').trim())
const envWeather = computed(() => compactWeather(sceneRaw.value?.weather))
const envWeatherIconName = computed(() => resolveWeatherIconName(String(sceneRaw.value?.weather || envWeather.value || '')))
const hasEnv = computed(() => Boolean(envTime.value || envLocation.value || envWeather.value))
const canSend = computed(() => {
  if (state.value.chatViewModel.isTyping || state.value.chatViewModel.hasForegroundChatTask) return false
  return Boolean(String(localInputText.value || state.value.chatViewModel.chatInputText || '').trim())
})
function isActiveInlineProcessTrace(message: ChatMessageViewModel) {
  const source = ((message as Record<string, unknown>)?._processTrace || (message as Record<string, unknown>)?.processTrace) as Record<string, unknown> | undefined
  if (!source || typeof source !== 'object') return false
  if (source.failed === true) return false
  const steps = (source.steps && typeof source.steps === 'object' && !Array.isArray(source.steps))
    ? source.steps as Record<string, string>
    : {}
  if (!Object.keys(steps).length) return false
  if (steps.compose === 'done') return false
  return Object.values(steps).some((status) => String(status || 'waiting') !== 'waiting')
}
const hasActiveInlineProcessTrace = computed(() => currentMessages.value.some(isActiveInlineProcessTrace))
const showStreamingMessage = computed(() => {
  if (state.value.chatViewModel.streamingText) return true
  if (!(state.value.chatViewModel.isTyping || state.value.chatViewModel.hasForegroundChatTask)) return false
  return !hasActiveInlineProcessTrace.value
})
const streamingSpeaker = computed(() => (
  state.value.chatViewModel.currentStreamingSpeakerName
  || currentChatTitle.value
  || t('chat.characterFallback')
))
// 角色照片按说话人名走 state.getCharAvatar（已规范化为可用 URL，群聊也能逐角色取对应照片）。
const headerPhoto = computed(() => String(
  currentSessionAvatar.value
  || state.value.chatViewModel.currentCharacterAvatar
  || state.value.getCharAvatar?.(currentChatTitle.value)
  || ''
))
const streamingPhoto = computed(() => String(state.value.getCharAvatar?.(streamingSpeaker.value) || ''))
function resolveCharPhoto(message: ChatMessageViewModel) {
  return String(state.value.getCharAvatar?.(resolveMessageSender(message)) || '')
}
function resolveCharacterAvatarLabel(message: ChatMessageViewModel) {
  const sender = resolveMessageSender(message)
  const fromMessage = String((message as Record<string, unknown>)?.emoji || '').trim()
  return fromMessage || resolveCharacterEmoji(sender) || '👤'
}

function readFirstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function resolveCharacterEmoji(name: string) {
  const normalizedName = String(name || '').trim()
  if (!normalizedName) return ''
  const characters = Array.isArray(chatVm.value.characters) ? chatVm.value.characters : []
  const matched = characters.find((character) => String(character?.name || '').trim() === normalizedName)
  return String(matched?.emoji || '').trim()
}

// 相对路径头像补前缀，data:/http 直接用（与桌面 ChatMainHeader 规则一致）
function normalizeAvatarUrl(path?: string | null) {
  const trimmed = String(path || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
// 用户消息头像：当前会话马甲头像优先，未设置时回退用户资料头像（文档 19.1）
const userPhoto = computed(() => {
  const alias = chatVm.value.currentAlias as { avatarPath?: string; avatar_path?: string } | null
  const aliasAvatar = String(alias?.avatarPath || alias?.avatar_path || '')
  const profileAvatar = String(chatVm.value.userProfile?.avatarPath || '')
  return normalizeAvatarUrl(aliasAvatar || profileAvatar)
})
const userAvatarLabel = computed(() => {
  const alias = chatVm.value.currentAlias as { emoji?: string; name?: string } | null
  return String(alias?.emoji || chatVm.value.userProfile?.emoji || '🙂').trim() || '🙂'
})

// 滚动吸底：仅当用户本就停在底部附近时才随新消息/流式增长自动滚到底；
// 上滑查看历史时不再被弹回底部。切换会话时强制回到底部。
// 2026-07-13 收编共用 useStickToBottom（与桌面主聊天同构）：方向感知门控 + 同步竞态检测，
// 根治原地实现的「流式逐 chunk 程序滚底 + scroll 事件异步无状态重算」竞态。不开
// observeMutations——流式 watch 本身就是触发源，与桌面主聊天同构。
const { scrollToBottom } = useStickToBottom(messageListRef)

watch(
  () => state.value.chatViewModel.activeSessionId,
  (nextSessionId) => {
    // 修问题①·跨会话残留：切到别的会话时清掉属于「别的会话」的提调导演带载体（移动端与桌面同源）。
    clearTidiaoDirectorStreamRoundIfOtherSession(String(nextSessionId || ''))
    // force=置真+强滚一步到位；nextTick 保住老实现「等 DOM/挂载完再滚」语义
    // （immediate 首跑时 messageListRef 可能还是 null）。
    nextTick(() => scrollToBottom(true))
  },
  { immediate: true, flush: 'post' }
)

watch(
  () => [currentMessages.value.length, state.value.chatViewModel.streamingText],
  () => {
    // composable 内部走门控+同步竞态检测；watch 已 flush:'post'，DOM 已更新，无需再包 nextTick。
    scrollToBottom()
  },
  { flush: 'post' }
)

watch(
  () => state.value.chatViewModel.chatInputText,
  (value) => {
    if (isComposingInput.value) return
    localInputText.value = String(value || '')
  },
  { immediate: true }
)

function syncComposerText(value: string) {
  sendErrorText.value = ''
  state.value.chatActions.inputChatText(value)
}

// 私密提调指令自动补全：插入类输入后，若刚打出「【【」则自动补「】】」、光标留中间。与 ChatInputBar 同源。
function applyDirectiveAutoClose(textarea: HTMLTextAreaElement, value: string): string {
  const result = maybeAutoCloseDirectiveBracket(value, textarea.selectionStart ?? value.length)
  if (!result.changed) return value
  textarea.value = result.value
  textarea.setSelectionRange(result.caret, result.caret)
  return result.value
}

function handleInput(event: Event) {
  sendErrorText.value = ''
  if (isComposingInput.value || (event as InputEvent).isComposing) {
    return
  }
  const textarea = event.target as HTMLTextAreaElement
  let value = textarea.value
  if (String((event as InputEvent).inputType || '').startsWith('insert')) {
    value = applyDirectiveAutoClose(textarea, value)
  }
  localInputText.value = value
  state.value.chatActions.inputChatText(localInputText.value)
}

// 持久纠偏栏提交 → 智能二选一（带楼层号精修 / 不带楼层号纠偏续跑），由 ops applyDirectorPrecisionEdits 分流（走完保留本体、清草稿）。
function submitPrecisionEdit() {
  if (state.value.chatViewModel.isTyping || state.value.chatViewModel.hasForegroundChatTask) return
  const value = precisionEditText.value.trim()
  if (!value) return
  state.value.chatActions.applyDirectorPrecisionEdits?.(value)
  precisionEditText.value = ''
  nextTick(autoResizePrecisionInput)
}

// 纠偏条 textarea 自适应长高（与桌面 TidiaoPrecisionEditBar 同口径·联动能力）：按 scrollHeight 长，封顶约 5 行后内部滚动。
const PRECISION_INPUT_MAX_HEIGHT = 130
function autoResizePrecisionInput() {
  const el = precisionEditInput.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, PRECISION_INPUT_MAX_HEIGHT)}px`
}
watch(precisionEditText, () => {
  nextTick(autoResizePrecisionInput)
})

function handleCompositionStart() {
  isComposingInput.value = true
}

function handleCompositionEnd(event: CompositionEvent) {
  isComposingInput.value = false
  const textarea = event.target as HTMLTextAreaElement
  // 合成结束属于插入：中文输入法下「【【」常在合成结束才落定，需触发自动补全。
  localInputText.value = applyDirectiveAutoClose(textarea, textarea.value)
  syncComposerText(localInputText.value)
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
  if (isComposingInput.value || event.isComposing) return
  event.preventDefault()
  void sendChat()
}

async function sendChat() {
  if (isComposingInput.value) return
  if (!canSend.value) return
  const text = String(localInputText.value || state.value.chatViewModel.chatInputText || '').trim()
  if (!text) return
  // 发送自己消息时强制吸底，即使之前上滑看过历史；force 置真并立即滚，
  // 消息落地后流式 watch 会继续 gated 跟随。
  scrollToBottom(true)
  try {
    const result = await state.value.chatActions.sendChat({ text })
    if (isFailedPanelActionResult(result)) {
      restoreFailedSendInput(text)
      sendErrorText.value = readPanelActionErrorMessage(result)
      console.error('移动端发送聊天消息失败:', result)
      return
    }
    localInputText.value = ''
  } catch (error) {
    restoreFailedSendInput(text)
    sendErrorText.value = readPanelActionErrorMessage(error)
    console.error('移动端发送聊天消息失败:', error)
  }
}

function restoreFailedSendInput(text: string) {
  localInputText.value = text
  try {
    syncComposerText(text)
  } catch {
    // 失败提示已经在发送路径处理；这里仅尽力恢复输入框状态。
  }
}

function isFailedPanelActionResult(result: unknown) {
  return Boolean(
    result
    && typeof result === 'object'
    && 'ok' in result
    && (result as { ok?: unknown }).ok === false
  )
}

function readPanelActionErrorMessage(result: unknown) {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    const message = String(record.message || record.error || '').trim()
    if (message) return message
  }
  if (result instanceof Error && result.message) return result.message
  return t('mobile.chatThread.sendFailedRetry')
}

function openUserEditor() {
  state.value.chatActions.openUserEditor?.()
}

function openCharacterProfile(message: ChatMessageViewModel) {
  const characterRef = String(
    (message as Record<string, unknown>)?.speakerTargetId
    ?? (message as Record<string, unknown>)?.speaker_target_id
    ?? message.name
    ?? message.memberName
    ?? ''
  ).trim()
  if (!characterRef) return
  state.value.chatActions.openCharSettings?.(characterRef)
}

function loadOlderMessages() {
  const sessionId = state.value.chatViewModel.activeSessionId || ''
  state.value.chatActions.loadOlderMessages?.(sessionId)
}

// 抽屉只接「移动端真有可见效果」的动作：管线动作（总结/旁白）+ 全局弹窗动作（聊天文件管理/清空/会话设置）。
// 依赖桌面侧栏/浮窗的面板（提示词日志/召回/笔记/人格模型/帷幕）逐批接入移动壳，未接通时先做占位骨架。

// 互斥开合：打开一个主抽屉时先关掉另一个，避免叠层。
function openPlus() {
  gearSheetOpen.value = false
  mentionSheetOpen.value = false
  narrationSheetOpen.value = false
  plusSheetOpen.value = true
}
function openGear() {
  plusSheetOpen.value = false
  mentionSheetOpen.value = false
  narrationSheetOpen.value = false
  gearSheetOpen.value = true
}

// 旁白门禁与自定义旁白配置（与桌面同源：当前会话有目标才允许；自定义旁白读会话 narrationProfiles）
const canTriggerNarration = computed(() => Boolean(chatVm.value.activeSessionId && chatVm.value.currentTarget))
const currentTarget = computed(() => String(chatVm.value.currentTarget || ''))
const customNarrationProfiles = computed<NarrationProfile[]>(() => {
  const session = chatVm.value.currentSession as { narrationProfiles?: unknown; narration_profiles?: unknown } | null | undefined
  return normalizeNarrationProfiles(session?.narrationProfiles ?? session?.narration_profiles).filter((profile) => !['environment', 'appearance', 'event_push'].includes(String(profile.id || '')))
})

// 提及（@）数据与动作，复用桌面 mention 链路真值
const mentionSelected = computed(() => chatVm.value.mentionSelectedChars || [])
const mentionExcluded = computed(() => chatVm.value.mentionExcludedChars || [])
const atCharacters = computed(() => chatVm.value.filteredAtCharacters || [])
function charName(charId: string) {
  return state.value.getCharNameById?.(charId) || charId
}
function isMentionSelected(char: Record<string, unknown>) {
  return mentionSelected.value.includes(String(char.id || ''))
}
function isMentionExcluded(char: Record<string, unknown>) {
  return mentionExcluded.value.includes(String(char.id || ''))
}
function mentionKindLabel(char: Record<string, unknown>) {
  return char.kind === 'sessionTemporary' ? t('mobile.chatThread.tempCharacter') : t('mobile.chatThread.formalCharacter')
}
function mentionSummary(char: Record<string, unknown>) {
  const source = char.desc || char.description || char.personality || char.speaking_style || char.speakingStyle || ''
  return String(source || '').replace(/\s+/g, ' ').trim().slice(0, 15)
}
function addMention(charId: string) {
  if (!charId) return
  state.value.chatActions.addMentionChar?.(charId)
}
function removeMention(index: number) {
  state.value.chatActions.removeMentionChar?.(index)
}
function toggleExclude(charId: string) {
  if (!charId) return
  state.value.chatActions.toggleExcludeChar?.(charId)
}
function clearMention() {
  state.value.chatActions.clearMentionSelected?.()
}

// 加号主抽屉动作（全局弹窗在移动壳同样渲染，非死按钮）
function plusHistory() {
  plusSheetOpen.value = false
  state.value.chatActions.openChatHistory?.()
}
function plusSummary() {
  plusSheetOpen.value = false
  state.value.chatActions.openChatSummary?.()
}
function plusClear() {
  plusSheetOpen.value = false
  state.value.chatActions.requestClearCurrentChatContext?.()
}
function openNarrationSheet() {
  if (!canTriggerNarration.value) return
  narrationSheetOpen.value = true
}

// 旁白二次抽屉动作
async function genNarration(kind: 'environment' | 'appearance' | 'event_push') {
  narrationSheetOpen.value = false
  plusSheetOpen.value = false
  try {
    await state.value.chatActions.triggerManualNarration?.({ kind })
  } catch (error) {
    console.error('生成旁白失败:', error)
  }
}
async function genCustomNarration(profileId: string) {
  if (!profileId) return
  narrationSheetOpen.value = false
  plusSheetOpen.value = false
  try {
    await state.value.chatActions.triggerManualNarration?.({ profileId })
  } catch (error) {
    console.error('生成自定义旁白失败:', error)
  }
}
function insertNarrationCommand(command: '/旁白' | '/旁白_AGENT补充') {
  const current = String(localInputText.value || '').trim()
  const content = current.replace(/^\/旁白(?:_AGENT补充)?(?:[\s　]+)?/i, '').trim()
  const next = content ? `${command} ${content}` : `${command} `
  localInputText.value = next
  state.value.chatActions.inputChatText(next)
  narrationSheetOpen.value = false
  plusSheetOpen.value = false
}

// 齿轮抽屉：已接通项
function gearSessionSettings() {
  gearSheetOpen.value = false
  const target = currentTarget.value
  if (!target) return
  if (target.startsWith('crowd_')) state.value.chatActions.editCrowd?.(target.replace(/^crowd_/, ''))
  else state.value.chatActions.editGroup?.(target)
}
function gearSummary() {
  gearSheetOpen.value = false
  state.value.chatActions.openChatSummary?.()
}
function gearDark() {
  gearSheetOpen.value = false
  state.value.chatActions.toggleDarkMode?.()
}

// 已接通的面板：提示词日志（PromptLogPanel 自给自足，移动全屏面板宿主承载）
function openPromptLog() {
  gearSheetOpen.value = false
  promptLogFocusId.value = 0
  promptLogSheetOpen.value = true
  state.value.chatActions.openPromptLogPanel?.()
}
// 消息行「提示词」按钮：聚焦该条消息的提示词
function openPromptLogForMessage(messageId: number) {
  promptLogFocusId.value = Number(messageId || 0)
  promptLogSheetOpen.value = true
  state.value.chatActions.openPromptLogPanel?.(Number(messageId || 0))
}
function closePromptLog() {
  promptLogSheetOpen.value = false
  state.value.chatActions.closePromptLogPanel?.()
}

// 召回面板：MobileRecallPanel 自带数据加载（开面板时拉取并写入共享召回态），这里只管开合宿主。
function openRecall() {
  gearSheetOpen.value = false
  recallInitialMessageId.value = 0
  recallSheetOpen.value = true
}
// 消息行「召回」按钮：直达该条消息的召回过程
function openRecallForMessage(messageId: number) {
  recallInitialMessageId.value = Number(messageId || 0)
  recallSheetOpen.value = true
}
function closeRecall() {
  recallSheetOpen.value = false
}

// 人格模型观察：PersonalityModelObservationPanel 自读 session 观察记录，这里只管开合宿主。
function openPersonalityModel() {
  gearSheetOpen.value = false
  personalityModelSheetOpen.value = true
}
function closePersonalityModel() {
  personalityModelSheetOpen.value = false
}

// 编排审计：移动端复用桌面审计面板，只换近全屏抽屉宿主；消息按钮传 messageId，工具区入口展示会话列表。
function openOrchestrationAudit() {
  gearSheetOpen.value = false
  orchestrationAuditRuntime.value = null
  orchestrationAuditMessageId.value = null
  orchestrationAuditSheetOpen.value = true
}
function openOrchestrationAuditForMessage(messageId: number) {
  orchestrationAuditRuntime.value = null
  orchestrationAuditMessageId.value = Number(messageId || 0) || null
  orchestrationAuditSheetOpen.value = true
}
// 批次I·编排入口：导演载体「编排」按钮——按 runId 折叠的运行态编排直接喂面板（loop 期无 messageId）。
function openDirectorOrchestration() {
  const round = directorStreamRound.value
  if (!round?.orchestrationAudit) return
  orchestrationAuditMessageId.value = null
  orchestrationAuditRuntime.value = round.orchestrationAudit
  orchestrationAuditSheetOpen.value = true
}
function closeOrchestrationAudit() {
  orchestrationAuditSheetOpen.value = false
}

// 笔记：MobileNotesPanel 自带按会话拉取，这里只管开合宿主与跳转原消息。
function openNotes() {
  gearSheetOpen.value = false
  notesSheetOpen.value = true
}
function closeNotes() {
  notesSheetOpen.value = false
}
// 跳转原消息：关笔记宿主后在移动消息列表里按 messageId / index 定位并居中高亮。
function jumpToNote(note: ChatMessageNote) {
  notesSheetOpen.value = false
  const messageId = Number(note.messageId ?? note.message_id ?? 0)
  const index = Number(note.messageIndex ?? note.message_index ?? -1)
  nextTick(() => {
    const container = messageListRef.value
    if (!container) return
    const selector = Number.isInteger(messageId) && messageId > 0
      ? `[data-chat-message-id="${messageId}"]`
      : `[data-chat-message-index="${index}"]`
    const target = container.querySelector(selector) as HTMLElement | null
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.classList.add('mobile-chat-message--note-focus')
    window.setTimeout(() => target.classList.remove('mobile-chat-message--note-focus'), 1200)
  })
}

// 帷幕环境编辑：MobileCurtainPanel 复用桌面 AppEnvironmentPills，这里只管开合抽屉。
function openCurtain() {
  gearSheetOpen.value = false
  curtainSheetOpen.value = true
}
function closeCurtain() {
  curtainSheetOpen.value = false
}

// 待挂载面板占位（先骨架，后续批次逐个把桌面面板接进移动全屏面板宿主）
const pendingPanelItems: Array<{ key: string; label: string; icon: MobileWorkspaceIconName }> = []

function resolveMessageContent(message: ChatMessageViewModel, index: number) {
  // 投影灯绿色切换态：正文替换为投影事实（与桌面 getDisplayedContent 同语义）。
  const messageId = messageNumericId(message)
  if (projectionDisplayMessageIds.value.has(messageId)) {
    const projectionText = String(projectionByMessageId.value.get(messageId)?.objectiveFact || '').trim()
    if (projectionText) return projectionText
  }
  const displayed = state.value.getDisplayedMessageContent(index)
  return String(displayed || message.content || '')
}

/** 取某条消息当前正在被提调精修的片段（无精修指示时早退；提调修改消息·状态提示 B1）。 */
function precisionSegmentsForMessage(message: ChatMessageViewModel): string[] {
  if (!activeTidiaoPrecisionEditIndicator.value) return []
  return getTidiaoPrecisionEditSegments(messageNumericId(message))
}

// ---- 回复工作流视图（过程轨 + 投影灯）：数据获取为移动端薄接线，状态机真值在共享模块 ----
const runtimeStore = useWorkspaceRuntimeStore()
const { toast } = useToast(runtimeStore)
const processTraceByMessageId = ref<Map<number, ReplyWorkflowProcessTraceView>>(new Map())
const projectionByMessageId = ref<Map<number, ChatPersonalityModelObservationProjection>>(new Map())
const runningProjectionMessageIds = ref<Set<number>>(new Set())
const projectionDisplayMessageIds = ref<Set<number>>(new Set())
const replyPipelineMode = computed(() => {
  const session = chatVm.value.currentSession as Record<string, unknown> | null | undefined
  return String(session?.replyPipelineMode ?? session?.reply_pipeline_mode ?? '')
})
const isProjectionFeatureSession = computed(() => isProjectionFeatureMode(replyPipelineMode.value))

// 进行中加载与排队标记：并发触发时只排队补刷一次，避免旧响应覆盖新数据。
let reloadingReplyWorkflowObservations = false
let replyWorkflowObservationsReloadQueued = false

async function reloadReplyWorkflowObservations() {
  const sessionId = String(chatVm.value.activeSessionId || '').trim()
  if (!sessionId || !isProjectionFeatureSession.value) {
    processTraceByMessageId.value = new Map()
    projectionByMessageId.value = new Map()
    projectionDisplayMessageIds.value = new Set()
    return
  }
  if (reloadingReplyWorkflowObservations) {
    replyWorkflowObservationsReloadQueued = true
    return
  }
  reloadingReplyWorkflowObservations = true
  try {
    const page = await fetchChatPersonalityModelObservationsBySessionId(sessionId)
    processTraceByMessageId.value = buildProcessTraceMapFromTraces(page.traces)
    const nextProjections = new Map<number, ChatPersonalityModelObservationProjection>()
    for (const projection of page.projections || []) {
      const messageId = Number(projection.messageId || 0)
      if (Number.isInteger(messageId) && messageId > 0) nextProjections.set(messageId, projection)
    }
    projectionByMessageId.value = nextProjections
  } catch (error) {
    console.warn('移动端读取回复工作流观察数据失败:', error)
  } finally {
    reloadingReplyWorkflowObservations = false
    if (replyWorkflowObservationsReloadQueued) {
      replyWorkflowObservationsReloadQueued = false
      void reloadReplyWorkflowObservations()
    }
  }
}

watch(
  () => ({ sessionId: String(chatVm.value.activeSessionId || ''), typing: Boolean(chatVm.value.isTyping) }),
  (next, prev) => {
    if (next.sessionId !== prev?.sessionId) {
      projectionDisplayMessageIds.value = new Set()
      void reloadReplyWorkflowObservations()
      return
    }
    // 回复结束后刷新一次：拿到新写入的过程轨与内嵌投影。
    if (prev?.typing && !next.typing) void reloadReplyWorkflowObservations()
  },
  { immediate: true, flush: 'post' }
)

// 投影写入完成信号（事件驱动，无轮询）：内嵌投影保存晚于 typing 结束，
// 只靠上面的单次刷新会让投影灯停在黄色；保存成功后这里再拉一次。
watch(chatProjectionObservationTick, () => {
  void reloadReplyWorkflowObservations()
})

function messageTrace(message: ChatMessageViewModel): ReplyWorkflowProcessTraceView | null {
  return readMessageProcessTrace(message as Record<string, unknown>, messageNumericId(message), processTraceByMessageId.value)
}

// ---- 提调编排带·一轮一条（统筹整轮，与桌面 ChatMessageStream 同源）----
// 一轮 = 一条用户消息后、到下一条用户消息前，连续的非用户非调试消息（所有角色回复 + 所有旁白）。
// 编排带锚在该轮第一条成员前，聚合整轮全部成员的导演决策流；群聊一轮多发言者也只出一条带。密度走 compact。

// 批次3·统一锚到用户消息（2026-06-22，与桌面 ChatMessageStream.vue 同源·改一处另一处同步）：
// 找某轮锚成员 index 之前最近一条用户消息（该轮的「用户消息」），决策流统一锚到它。无则 -1。
function roundUserMessageIndexFor(anchorIndex: number): number {
  const msgs = currentMessages.value || []
  for (let k = anchorIndex - 1; k >= 0; k--) {
    const m = msgs[k]
    if (m && m.role === 'user' && !isDebugMessage(m)) return k
  }
  return -1
}
// 取该轮用户消息落库的 directorStream + 同处 appendLog（提调真读那份的历史来源）；无快照返回 null。
function roundUserDirectorTraceFor(anchorIndex: number): { stream: TidiaoDirectorStream; appendLog: AppendLogEvent[]; directorPrompt: string } | null {
  const userIdx = roundUserMessageIndexFor(anchorIndex)
  if (userIdx < 0) return null
  const userMsg = currentMessages.value?.[userIdx]
  const trace = userMsg ? messageTrace(userMsg) : null
  const stream = trace?.directorStream || null
  if (!stream) return null
  const appendLog = (trace as { appendLog?: unknown })?.appendLog
  // option C：真实 prompt 与 directorStream/appendLog 同处落库，随快照一起取出供「喂模型原文」忠实显示。
  const directorPrompt = String((trace as { directorPrompt?: unknown })?.directorPrompt || '')
  return { stream, appendLog: Array.isArray(appendLog) ? (appendLog as AppendLogEvent[]) : [], directorPrompt }
}

// 轮分组：Map<轮锚消息index, 该轮全部成员index[]>；至少一个成员有过程轨、或该轮用户消息已落决策流时建带。
// 批次3：纳入「该轮用户消息有决策流」——首发/群聊中断时成员尚无 trace、但用户消息已即时落库决策流，仍出带。
const roundBandGroups = computed<Map<number, number[]>>(() => {
  const map = new Map<number, number[]>()
  const msgs = currentMessages.value || []
  let i = 0
  while (i < msgs.length) {
    const msg = msgs[i]
    const isMember = !!msg && msg.role !== 'user' && !isDebugMessage(msg)
    if (!isMember) { i++; continue }
    const members: number[] = []
    let j = i
    while (j < msgs.length) {
      const mj = msgs[j]
      if (!mj || mj.role === 'user' || isDebugMessage(mj)) break
      members.push(j)
      j++
    }
    const memberHasTrace = members.some((idx) => !!messageTrace(msgs[idx]))
    if (memberHasTrace || roundUserDirectorTraceFor(i)) map.set(i, members)
    i = j
  }
  return map
})

// ---- O-B：历史轮已落库的导演 loop 快照（刷新持久化复原，与桌面 ChatMessageStream.vue 同源）----
// 批次3·统一锚到用户消息：优先读该轮用户消息决策流，取不到再兜底扫成员（旧记录），取决策最多者、只渲一条（防双显）。
// 值携带 stream + 同处 appendLog（提调真读那份的历史来源，与 stream 取自同一条获胜 processTrace）。
const roundDirectorStreamGroups = computed<Map<number, { stream: TidiaoDirectorStream; appendLog: AppendLogEvent[]; directorPrompt: string }>>(() => {
  const map = new Map<number, { stream: TidiaoDirectorStream; appendLog: AppendLogEvent[]; directorPrompt: string }>()
  for (const [anchorIndex, memberIdxs] of roundBandGroups.value) {
    // 批次K2·择优收口到共享 pickRoundDirectorTraceGroup（与桌面 ChatMessageStream 联动）：
    // stream/appendLog 取决策最多者（平局用户锚优先·语义不变），prompt 胜者为空时回退任一候选非空的那份。
    const candidates: Array<RoundDirectorTraceCandidate | null> = [roundUserDirectorTraceFor(anchorIndex)]
    for (const idx of memberIdxs) {
      const msg = currentMessages.value?.[idx]
      const trace = msg ? messageTrace(msg) : null
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
// 历史带·提调真读那份（option C·与桌面同源）：真实 prompt + 本轮 loop 真实往来（未折叠）；无则空串、侧栏不显示该块。
function roundDirectorMemoryFor(anchorIndex: number): string {
  const group = roundDirectorStreamGroups.value.get(anchorIndex)
  return group ? renderDirectorMemoryDocument(group.directorPrompt, group.appendLog) : ''
}
function roundDirectorStreamSpeakerFor(anchorIndex: number): string {
  const stream = roundDirectorStreamFor(anchorIndex)
  return stream?.shots.find((shot) => shot.kind === 'character')?.label || ''
}

// ---- 提调真·导演 loop 轮级流式载体（子批5：单聊端到端接线，与桌面 ChatMessageStream.vue 同源）----
// 本载体 = loop 进行中/刚结束的「决策流+并排实时分镜」，锚在用户消息与角色正文之间；
// 旧 roundBandGroups band = 历史复原结果态。某轮被本载体接管时抑制该轮旧 band，避免同一轮双带并排。
const directorStreamRound = computed(() => {
  const round = activeTidiaoDirectorStreamRound.value
  if (!round) return null
  const sid = String(chatVm.value.activeSessionId || '').trim()
  if (sid && round.sessionId && sid !== round.sessionId) return null
  return round
})

// ---- 提调纠偏条开合（2026-07-05 设计稿换皮）----
// 默认收成主输入框顶缘「绿舌」；点舌展开并聚焦；correcting（提调问用户挂起）自动展开+聚焦、占位换续跑口径。
// 本块只管「开合与呈现」；提交/二选一逻辑在上方 submitPrecisionEdit，一行未动。
const tdsBarOpen = ref(false)
const tdsZoneRef = ref<HTMLElement | null>(null)
function openTdsBar(): void {
  tdsBarOpen.value = true
  nextTick(() => precisionEditInput.value?.focus())
}
const directorCorrecting = computed(() => directorStreamRound.value?.stream?.phase === 'correcting')
// immediate：挂载/切回页面时若本就处在 correcting 挂起，也要立即弹开等回复。
watch(directorCorrecting, (correcting) => {
  if (correcting) openTdsBar()
}, { immediate: true })
const precisionEditPlaceholder = computed(() => (
  directorCorrecting.value ? t('mobile.chatThread.tdsPlaceholderResume') : t('mobile.chatThread.tdsPlaceholderDefault')
))
// 输入为空时点条外收回绿舌（chevron 是显式收起控件；有草稿时点外不收，防误丢半写的指令）。
function onDocumentPointerDown(event: Event): void {
  if (!tdsBarOpen.value) return
  if (precisionEditText.value.trim()) return
  const zone = tdsZoneRef.value
  if (zone && event.target instanceof Node && zone.contains(event.target)) return
  tdsBarOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))
// 活动带·提调真读那份（option C·与桌面同源）：真实 prompt（活动容器 getActiveDirectorPrompt）+ 本轮 loop 真实往来（未折叠）；
// computed 自动随 activeAgentAppendLog 刷新。
const activeDirectorMemory = computed(() => renderDirectorMemoryDocument(getActiveDirectorPrompt(), getAppendLogEvents()))
// 资料池侧栏（2026-06-29 对话级·与桌面 ChatMessageStream 同源）：池子改「一会话一池」，按 sessionId 读（跨轮持久）。
// computed 依赖响应式 recallPoolStoreVersion → 召回落池 / 用户增删即时刷新。
const poolCache = createLocalRecallRoundPoolCache()
const characterStore = useCharacterStore()
function resolveCharacterName(characterId: string): string {
  return characterStore.characters.find((c) => c.id === characterId)?.name || characterId
}
const activeRoundRecallPools = computed(() => {
  void recallPoolStoreVersion.value
  const sid = directorStreamRound.value?.sessionId || String(chatVm.value.activeSessionId || '').trim()
  return sid ? poolCache.load(sid) : null
})
// 入口常驻（2026-07-03·与桌面 ChatMessageStream 同源）：poolSessionId=会话还没有池（pools=null）时侧栏增删的兜底定位；
// recallPoolCastIds=加卡归属选项（群聊读 participants；单聊/旧主目标兜底）。
// 联动能力：与提及候选 useAppDerivedState.filteredAtCharacters 同口径，那边口径若调整这里要同步。
const activeRecallPoolSessionId = computed(() => directorStreamRound.value?.sessionId || String(chatVm.value.activeSessionId || '').trim())
const chatStoreForPool = useChatStore()
const recallPoolCastIds = computed(() => {
  const participantIds = normalizeChatSessionCharacterParticipants(getChatStoreCurrentSession(chatStoreForPool))
    .map((item) => item.characterId)
    .filter(Boolean)
  if (participantIds.length) return participantIds
  const fallbackId = normalizeChatTargetId(getChatStoreActiveTargetId(chatStoreForPool))
  return fallbackId && !fallbackId.startsWith('group_') && !fallbackId.startsWith('crowd_') ? [fallbackId] : []
})
function isRoundBandSupersededByDirector(memberStartIndex: number): boolean {
  const round = directorStreamRound.value
  if (!round || !round.anchorMessageId) return false
  const msgs = currentMessages.value || []
  for (let k = memberStartIndex - 1; k >= 0; k--) {
    const m = msgs[k]
    if (m && m.role === 'user') return messageNumericId(m) === round.anchorMessageId
  }
  return false
}
// ---- 形态1·E5：角色镜钻取明细（与桌面同源）：群聊新带每个角色镜可展开看该角色 per-speaker 回复过程 ----
// 数据全来自该轮各角色消息已有的过程轨（不重跑），按角色名键入；新带据此挂"点开"。
function buildRoundShotDetails(memberMsgs: ChatMessageViewModel[]): Record<string, TidiaoShotDetail> {
  const map: Record<string, TidiaoShotDetail> = {}
  for (const m of memberMsgs) {
    if (!m || isNarrationMessage(m)) continue
    const name = resolveMessageSender(m)
    if (!name || name === '旁白调试') continue
    const detail = buildTidiaoShotDetail(messageTrace(m))
    if (detail && !map[name]) map[name] = detail
  }
  return map
}
function roundShotDetailsFor(anchorIndex: number): Record<string, TidiaoShotDetail> {
  const idxs = roundBandGroups.value.get(anchorIndex) || []
  return buildRoundShotDetails(idxs.map((i) => currentMessages.value?.[i]).filter((m): m is ChatMessageViewModel => !!m))
}
// 活动轮：据 anchorMessageId 找其后连续成员消息构明细，随 per-speaker 落库渐进填充。
const activeRoundShotDetails = computed<Record<string, TidiaoShotDetail>>(() => {
  const round = directorStreamRound.value
  if (!round || !round.anchorMessageId) return {}
  const msgs = currentMessages.value || []
  const anchorIdx = msgs.findIndex((m) => messageNumericId(m) === round.anchorMessageId)
  if (anchorIdx < 0) return {}
  const members: ChatMessageViewModel[] = []
  for (let k = anchorIdx + 1; k < msgs.length; k += 1) {
    const m = msgs[k]
    if (!m || m.role === 'user') break
    members.push(m)
  }
  return buildRoundShotDetails(members)
})

// ---- 提调坞数据源（2026-07-04 移动端接坞，与桌面 ChatMessageStream.directorDockRounds 联动·改一处另一处同步）----
// 历史轮（旧→新）+ 活动轮（固定最后）；重字段传 getter 惰性取（坞只算选中那一轮）。
// 历史轮主键=锚用户消息 id（加载更早消息 index 平移时选中不跳轮）；被活动载体接管的历史轮剔除（防同轮双份）。
// 与桌面差异：资料池是会话级同一份（activeRoundRecallPools），历史/活动轮共用；
// 活动轮不带 recallRunId（移动召回 sheet 按 messageId 定位、loop 期无消息 id——沿用接坞前无召回入口的行为）。
const directorDockRounds = computed<TidiaoDirectorDockRound[]>(() => {
  const list: TidiaoDirectorDockRound[] = []
  const anchors = [...roundDirectorStreamGroups.value.keys()].sort((a, b) => a - b)
  for (const anchorIndex of anchors) {
    if (isRoundBandSupersededByDirector(anchorIndex)) continue
    const group = roundDirectorStreamGroups.value.get(anchorIndex)
    if (!group) continue
    const userIdx = roundUserMessageIndexFor(anchorIndex)
    const userMsg = userIdx >= 0 ? currentMessages.value?.[userIdx] : null
    const userMsgId = userMsg ? messageNumericId(userMsg) : 0
    list.push({
      id: userMsg ? `msg_${userMsgId}` : `idx_${anchorIndex}`,
      live: false,
      stream: group.stream,
      speakerName: roundDirectorStreamSpeakerFor(anchorIndex),
      getShotDetails: () => roundShotDetailsFor(anchorIndex),
      getRecallPools: () => activeRoundRecallPools.value,
      getMemoryProjection: () => roundDirectorMemoryFor(anchorIndex),
      // 消耗溯源（chat DEVELOPMENT.md 10.1）：round_id = round:sessionId:锚用户消息id，与桌面同源、与写侧 activateRoundUsageContext 同源。
      usageRoundId: userMsgId > 0 ? `round:${String(chatVm.value.activeSessionId || '')}:${userMsgId}` : ''
    })
  }
  const live = directorStreamRound.value
  if (live) {
    list.push({
      id: `live_${live.runId}`,
      live: true,
      stream: live.stream,
      speakerName: live.speakerName,
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
const directorDockContextKey = computed(() => `${String(chatVm.value.activeSessionId || '')}|${String(chatVm.value.currentTarget || '')}`)

function projectionLampViewFor(message: ChatMessageViewModel): { state: ProjectionLampState; title: string; active: boolean; disabled: boolean } | null {
  if (isDebugMessage(message)) return null
  const messageId = messageNumericId(message)
  if (messageId <= 0) return null
  const projection = projectionByMessageId.value.get(messageId) || null
  if (!isProjectionFeatureSession.value && !projection) return null
  const lampState = resolveProjectionLampState(projection, runningProjectionMessageIds.value.has(messageId))
  const active = projectionDisplayMessageIds.value.has(messageId)
  return {
    state: lampState,
    title: resolveProjectionLampTitle(lampState, projection, active),
    active,
    disabled: !canUseProjectionLampState(lampState)
  }
}

async function onProjectionLamp(message: ChatMessageViewModel) {
  const messageId = messageNumericId(message)
  if (messageId <= 0) return
  const projection = projectionByMessageId.value.get(messageId) || null
  const lampState = resolveProjectionLampState(projection, runningProjectionMessageIds.value.has(messageId))
  if (lampState === 'success') {
    if (!isProjectionRowSuccess(projection)) return
    const next = new Set(projectionDisplayMessageIds.value)
    if (next.has(messageId)) next.delete(messageId)
    else next.add(messageId)
    projectionDisplayMessageIds.value = next
    return
  }
  if (lampState === 'running') {
    toast(t('chat.toastProjecting'), 'info')
    return
  }
  // failed 与 pending 同走一条重投影路径（2026-07-07）：failed 视为「可重试」，不再静默 return。
  if (lampState !== 'pending' && lampState !== 'failed') return
  const sessionId = String(chatVm.value.activeSessionId || '').trim()
  if (!sessionId) {
    toast(t('chat.toastNoProjectableSession'), 'error')
    return
  }
  const nextRunning = new Set(runningProjectionMessageIds.value)
  nextRunning.add(messageId)
  runningProjectionMessageIds.value = nextRunning
  toast(t('chat.toastProjecting'), 'info')
  try {
    const result = await runChatMessageProjectionBySessionId(sessionId, messageId)
    await reloadReplyWorkflowObservations()
    const status = readProjectionRunStatus(result as Record<string, unknown>)
    toast(status === 'failed' ? t('chat.toastProjectionFailed') : t('chat.toastProjectionDone'), status === 'failed' ? 'error' : 'success')
  } catch (error) {
    console.error('移动端运行消息投影失败:', error)
    toast(t('chat.toastProjectionFailed'), 'error')
    void reloadReplyWorkflowObservations()
  } finally {
    const done = new Set(runningProjectionMessageIds.value)
    done.delete(messageId)
    runningProjectionMessageIds.value = done
  }
}

function resolveMessageKey(message: ChatMessageViewModel, index: number) {
  return message.id ? `message:${message.id}` : `index:${index}:${message._localStreamingKey || ''}`
}

// 笔记跳转用：从 message.id 提取末尾数字 id，与笔记里的 messageId 对齐
function messageNumericId(message: ChatMessageViewModel) {
  const raw = String(message.id || '').trim()
  return Number(raw.match(/\d+$/)?.[0] || raw) || 0
}

function resolveMessageKind(message: ChatMessageViewModel) {
  return String(message.messageKind || message.message_kind || '').trim()
}

function isNarrationMessage(message: ChatMessageViewModel) {
  return resolveMessageKind(message) === 'narration'
}

function isDebugMessage(message: ChatMessageViewModel) {
  return resolveMessageKind(message) === 'narration_debug'
}

// 图片附件（输入框图片上传计划批4）：只解析、不缓存，消息数组本身已是响应式数据。
// readMessageAttachments 兼容三种真实键名（attachmentsJson/attachments/attachments_json），见其 JSDoc。
function messageAttachments(message: ChatMessageViewModel) {
  return readMessageAttachments(message)
}

function resolveMessageSender(message: ChatMessageViewModel) {
  if (message.role === 'user') return state.value.chatViewModel.currentAlias?.name || state.value.chatViewModel.userProfile?.displayName || t('chat.meFallback')
  return message.name || message.memberName || currentChatTitle.value || t('chat.characterFallback')
}

function shouldShowMessageMeta(message: ChatMessageViewModel) {
  return !isDebugMessage(message) && Boolean(
    getChatFloorLabel(message)
    || getMessageDisplayTime(message)
    || getMessageEnvironmentMeta(message)
    || getMessageModelMeta(message)
  )
}

// 楼层分类复用共享真值 classifyChatFloorKind（与桌面端、后端提调读会话消息工具同一口径）。
// 联动：见 chatMessageFloor.ts 头注释。注：渲染样式用的 isNarrationMessage/isDebugMessage 是另一套口径，与楼层分类无关。
function getMessageFloorKind(message: ChatMessageViewModel): ChatFloorKind | '' {
  return classifyChatFloorKind(message)
}

function getChatFloorLabel(message: ChatMessageViewModel) {
  const floor = messageFloorMap.value.get(message)
  if (!floor || floor.kind === 'debug') return ''
  const label = floor.kind === 'narration' ? t('mobile.chatThread.narration') : t('chat.characterFallback')
  return `${label} ${floor.index}/${floor.total}`
}

function getMessageVirtualTime(message: ChatMessageViewModel) {
  const record = message as Record<string, unknown>
  return String(message.envDate ?? record.env_date ?? '').trim()
}

function getMessageDisplayTime(message: ChatMessageViewModel) {
  if (!isDebugMessage(message)) return getMessageVirtualTime(message) || String(message.time || '').trim()
  return String(message.time || '').trim()
}

function getMessageEnvironmentMeta(message: ChatMessageViewModel) {
  const record = message as Record<string, unknown>
  const envWeather = String(message.envWeather ?? record.env_weather ?? '').trim()
  const envLocation = String(message.envLocation ?? record.env_location ?? '').trim()
  return [envLocation, envWeather].filter(Boolean).join(' ')
}

function getMessageModelMeta(message: ChatMessageViewModel) {
  if (!isNarrationMessage(message) && message.role !== 'assistant') return ''
  const record = message as Record<string, unknown>
  return String(message.model ?? record.model ?? '').trim()
}
</script>

<style scoped>
.mobile-chat-thread {
  display: grid;
  min-height: 0;
  /* 单列显式 minmax(0,1fr) + min-width:0：阻止头部/输入栏等 grid 项因 nowrap 内容
     (如超长天气副标题) 的 min-content 把整行撑得比视口宽、被祖先 overflow:hidden 横向裁切 */
  min-width: 0;
  flex: 1;
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

/* 帷幕：暂停键 + 与齿轮同一行的完整时间·地点·天气，点开进帷幕设置 */
.mobile-chat-env {
  display: inline-flex;
  min-width: 0;
  max-width: 56vw;
  align-items: center;
  gap: 2px;
  overflow: hidden;
  color: var(--lhm-text-light, #6b6b6b);
  font-size: 11.5px;
}

/* 暂停/继续帷幕时间：与桌面时间胶囊左侧暂停键同语义 */
.mobile-chat-env__pause {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--lhm-text-light, #6b6b6b);
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-env__pause :deep(.mobile-line-icon) {
  color: #87937c;
}

.mobile-chat-env__open {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  padding: 2px 0;
  -webkit-tap-highlight-color: transparent;
}

/* 完整时间不参与收缩省略，收缩交给地点/天气段 */
.mobile-chat-env__item--time {
  flex-shrink: 0;
}

.mobile-chat-env__item {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-chat-env__item :deep(.mobile-line-icon) {
  color: #87937c;
}

.mobile-chat-env__item :deep(.weather-line-icon) {
  color: #87937c;
}

.mobile-chat-thread__gear {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-thread__messages {
  display: flex;
  flex: 1 1 auto; /* 在 .mobile-chat-thread__stream 包裹层内占满原 1fr 行 */
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  gap: 18px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 2px 8px;
}

.mobile-chat-thread__older {
  display: block;
  align-self: center;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 999px;
  background: var(--lhm-card, #fffdf8);
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 5px 14px;
}

/* 旁白：居中、无头像 */
.mobile-chat-narration {
  text-align: center;
  color: var(--lhm-text-muted, #999);
  padding: 0 22px;
}

/* 旁白正文=楷体小说体（2026-07-12·与桌面 main.css 同气质联动）：升到正文级字号+墨色+楷体，不再靠灰色小字区分旁白 */
.mobile-chat-narration :deep(.mobile-roleplay-text) {
  color: var(--lhm-narration-ink, #42463f);
  font-size: 16px;
  line-height: 1.6;
  font-family: "Kaiti SC", "STKaiti", "KaiTi", "SimKai", "楷体", serif;
}

/* AI 消息：无气泡 */
.mobile-chat-ai {
  display: flex;
  gap: 10px;
  /* 角色消息靠左、头像在左，右边缘需留白避免顶屏；与用户消息 padding-left 镜像联动 */
  padding-right: 30px;
}

.mobile-chat-avatar-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-self: flex-start;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.mobile-chat-avatar-button:hover {
  outline: 1px solid color-mix(in srgb, var(--lhm-accent, #8b7355) 42%, transparent);
  outline-offset: 2px;
}

.mobile-chat-avatar-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--lhm-accent, #8b7355) 58%, transparent);
  outline-offset: 2px;
}

.mobile-chat-ai__body {
  min-width: 0;
  /* 角色消息不再占满整行，最多约 75% 宽，正文左对齐 */
  flex: 0 1 auto;
  max-width: 75%;
}

.mobile-chat-ai__name {
  margin-bottom: 4px;
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
}

/* 提调坞宿主（2026-07-04 移动端接坞）：包一层相对定位的流区，让消息滚动容器与零高度锚点共占原 1fr 行；
   坞（收起绿条/展开抽屉）绝对定位悬浮在锚点之下，不占布局、不随消息滚动。
   联动能力：与桌面 ChatWorkspaceSection.vue 的 .tds-dock-host 同语义，改一处另一处同步。 */
.mobile-chat-thread__stream {
  position: relative;
  display: flex;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
}
.tds-dock-host {
  position: relative;
  height: 0;
  z-index: 40; /* 高于消息区；低于 MobileSheet 抽屉（80） */
}

.mobile-chat-ai__body :deep(.mobile-roleplay-text) {
  font-size: 15px;
  line-height: 1.65;
  color: #2d302c;
}

.mobile-chat-ai__image,
.mobile-chat-user__image {
  display: block;
  max-width: min(100%, 240px);
  margin-top: 6px;
  border-radius: 10px;
}

/* 图片附件多图渲染（输入框图片上传计划批4）：单图约 240px 宽圆角，多图网格排布。 */
.mobile-chat-ai__attachments,
.mobile-chat-user__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.mobile-chat-attachment-thumb {
  display: block;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: transparent;
  width: 96px;
  height: 96px;
}

.mobile-chat-attachment-item {
  position: relative;
  flex: none;
}
.mobile-chat-attachment-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mobile-chat-attachments--single .mobile-chat-attachment-item,
.mobile-chat-attachments--single .mobile-chat-attachment-thumb {
  width: auto;
  height: auto;
  max-width: min(100%, 280px);
  max-height: 380px;
}
.mobile-chat-attachments--single .mobile-chat-attachment-thumb img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 380px;
  object-fit: contain;
}

.mobile-chat-attachment-avatar {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  background: rgba(35, 39, 35, 0.7);
  color: #fff;
}

.mobile-chat-attachment-avatar svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}

.mobile-chat-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  margin-top: 5px;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
  line-height: 1.35;
  word-break: break-word;
}

.mobile-chat-meta--user {
  justify-content: flex-end;
  text-align: right;
}

.mobile-chat-meta--ai {
  justify-content: flex-start;
  text-align: left;
}

.mobile-chat-meta--narration {
  justify-content: center;
  text-align: center;
}

/* 用户消息：与角色一致，无气泡底色；靠右对齐 + 右侧头像区分自己 */
.mobile-chat-user {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  align-items: flex-start;
  /* 用户消息靠右、头像在右，左边缘需留白；与角色消息 padding-right 镜像联动 */
  padding-left: 30px;
}

.mobile-chat-user__body {
  min-width: 0;
  /* 用户消息固定靠右、最多约 75% 宽（父级 flex-end + margin 双保险） */
  max-width: 75%;
  margin-left: auto;
}

.mobile-chat-user__body :deep(.mobile-roleplay-text) {
  font-size: 15px;
  line-height: 1.65;
  color: #2d302c;
}

.mobile-chat-thread__typing {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  min-height: 24px;
}

.mobile-chat-thread__typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lhm-text-light, #666);
  opacity: 0.46;
}

.mobile-chat-thread__empty {
  min-height: 1px;
}

/* 底部胶囊输入栏 */
/* 提调纠偏绿舌 + 橄榄绿条（2026-07-05 设计稿换皮，取代旧白底胶囊 .mobile-tds-edit-bar）：
   与桌面 TidiaoPrecisionEditBar 同一橄榄绿体系（#6e7c57 / 米白 #f2ede4）——联动能力：改色需同步那一处。
   「叠入输入框身后」依赖下方 .mobile-chat-composer 不透明填充 + z-index 层序（同桌面 .chat-input-area 语义）。 */
.mobile-tds-zone {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
}
/* 绿舌：约 20px 露头（场记板图标+「提调」居中），底缘塞进输入框身后（gap 6px − margin 10px = 叠入 4px）。
   宽度占输入框 95%（真机一验·用户拍板：与桌面收起绿条同占比，不做窄舌头）。 */
.mobile-tds-tongue {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 95%;
  height: 20px;
  margin-bottom: -10px;
  padding: 0 14px 3px;
  box-sizing: border-box;
  border: none;
  border-radius: 10px 10px 0 0;
  background: #6e7c57;
  color: #f2ede4;
  font-size: 10.5px;
  letter-spacing: 1px;
  box-shadow: 0 -2px 8px rgba(110, 124, 87, 0.18);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
/* 展开条：橄榄绿整条，底缘叠入输入框后约 10px（gap 6px − margin 16px），textarea 长高时向上长。 */
.mobile-tds-bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: calc(100% - 16px);
  min-height: 48px;
  margin-bottom: -16px;
  padding: 8px 10px 16px 14px;
  box-sizing: border-box;
  background: #6e7c57;
  border-radius: 14px;
  box-shadow: 0 8px 20px rgba(110, 124, 87, 0.26);
}
.mobile-tds-bar__input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 26px;
  max-height: 130px;
  border: none;
  outline: none;
  background: transparent;
  color: #f2ede4;
  caret-color: #f2ede4;
  padding: 1px 0 0;
  font-size: 13px;
  line-height: 24px;
  letter-spacing: 1px;
  resize: none;
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.mobile-tds-bar__input::-webkit-scrollbar { width: 0; height: 0; display: none; }
/* 夜间：压过 main.css 全局 [data-theme="dark"] textarea 的 !important 黑底强刷，
   保持橄榄绿条内透明底奶油字；与桌面 TidiaoPrecisionEditBar.vue 的同款覆盖联动，改动需同步。 */
:global([data-theme="dark"] .mobile-tds-bar__input){
  background: transparent !important;
  color: #f2ede4 !important;
}
.mobile-tds-bar__input::placeholder { color: rgba(242, 237, 228, 0.6); }
.mobile-tds-bar__input:disabled { opacity: 0.55; }
.mobile-tds-bar__fold {
  flex: none;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  color: rgba(242, 237, 228, 0.7);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.mobile-tds-bar__send {
  flex: none;
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid rgba(242, 237, 228, 0.28);
  border-radius: 7px;
  background: rgba(242, 237, 228, 0.16);
  color: #f2ede4;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
/* 有字时高亮反白（实心米白 + 深橄榄字），与桌面同款。 */
.mobile-tds-bar__send.is-active:not(:disabled) {
  background: #f2ede4;
  color: #525e43;
  border-color: #f2ede4;
}
.mobile-tds-bar__send:disabled { cursor: not-allowed; }

.mobile-chat-composer-wrap {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.mobile-chat-composer {
  position: relative;
  /* 压在提调纠偏条上方（叠入身后造型）：z-index 高于 .mobile-tds-zone(1)。 */
  z-index: 2;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--lhm-border-warm, rgba(139, 115, 85, 0.12));
  border-radius: 20px;
  /* 不透明填充（原 70% 透明混合改与页底色预混·视觉等价）：绿条叠入身后时不透色。 */
  background: color-mix(in srgb, var(--lhm-card, #fffdf8) 70%, var(--lhm-bg, #f8f4ee));
  padding: 7px 8px 7px 12px;
  padding-bottom: max(7px, env(safe-area-inset-bottom, 7px));
}

.mobile-chat-composer__plus {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-composer textarea {
  min-width: 0;
  flex: 1;
  min-height: 24px;
  max-height: 116px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--lhm-text, #333);
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
  padding: 3px 0;
}

.mobile-chat-composer textarea::placeholder {
  color: rgba(72, 67, 61, 0.38);
}

.mobile-chat-composer__send,
.mobile-chat-composer__stop {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: var(--lhm-accent, #5c8a5c);
  color: #fff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-composer__stop {
  background: var(--lhm-text-light, #666);
}

.mobile-chat-composer__send:disabled {
  cursor: default;
  opacity: 0.4;
}

.mobile-chat-composer__error {
  margin: 0 8px;
  color: var(--lhm-danger, #b4533f);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

/* 抽屉列表行（加号 / 旁白 / 齿轮通用） */
.mobile-chat-tool-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 13px;
  border: 0;
  border-top: 1px solid var(--lhm-border-line, #e5e5e5);
  background: transparent;
  color: var(--lhm-text, #333);
  cursor: pointer;
  font: inherit;
  font-size: 14.5px;
  text-align: left;
  padding: 12px 2px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-tool-row:first-of-type {
  border-top: 0;
}

.mobile-chat-tool-row__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-chat-tool-row :deep(.mobile-line-icon) {
  color: var(--lhm-primary, #8b7355);
}

.mobile-chat-tool-row :deep(.mobile-chat-tool-row__chevron) {
  color: var(--lhm-text-muted, #999);
}

.mobile-chat-tool-row--danger {
  color: #a9574e;
}

.mobile-chat-tool-row--danger :deep(.mobile-line-icon) {
  color: #a9574e;
}

.mobile-chat-tool-row--pending,
.mobile-chat-tool-row:disabled {
  cursor: default;
  opacity: 0.5;
}

.mobile-chat-tool-row__tag {
  flex: 0 0 auto;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 999px;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
  padding: 2px 8px;
}

/* 二次抽屉返回条 */
.mobile-chat-sheet-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 4px;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 4px 2px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-sheet-back :deep(.mobile-line-icon) {
  color: var(--lhm-text-light, #666);
}

/* 抽屉内分区标题 */
.mobile-chat-sheet-section {
  margin: 14px 2px 2px;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  font-weight: 600;
}

.mobile-chat-tool-hint {
  margin: 12px 2px 0;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  line-height: 1.6;
}

/* 提及二次抽屉 */
.mobile-chat-mention-selected {
  margin-bottom: 10px;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 12px;
  background: var(--lhm-soft, #faf7f1);
  padding: 10px 12px;
}

.mobile-chat-mention-selected__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
}

.mobile-chat-mention-clear {
  border: 0;
  background: transparent;
  color: var(--lhm-primary, #8b7355);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 0;
}

.mobile-chat-mention-selected__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.mobile-chat-mention-selected__idx {
  flex: 0 0 auto;
  min-width: 18px;
  border-radius: 8px;
  background: var(--lhm-primary, #8b7355);
  color: #fff;
  font-size: 11px;
  text-align: center;
  padding: 1px 0;
}

.mobile-chat-mention-selected__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.mobile-chat-mention-selected__remove {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--lhm-text-muted, #999);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
}

.mobile-chat-mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--lhm-border-line, #e5e5e5);
  cursor: pointer;
  padding: 11px 2px;
}

.mobile-chat-mention-item.is-excluded {
  opacity: 0.45;
}

.mobile-chat-mention-item__main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.mobile-chat-mention-item__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14.5px;
  color: var(--lhm-text, #333);
}

.mobile-chat-mention-item__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
}

.mobile-chat-mention-item__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-chat-mention-item__picked {
  flex: 0 0 auto;
  color: var(--lhm-primary, #8b7355);
  font-size: 11.5px;
}

.mobile-chat-mention-item__exclude {
  flex: 0 0 auto;
  border: 1px solid #e0857c;
  border-radius: 6px;
  background: transparent;
  color: #c0665a;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 3px 8px;
}

.mobile-chat-mention-item__exclude.is-on {
  background: #e0857c;
  color: #fff;
}

/* 移动全屏面板宿主：让复用的桌面面板撑满宽度，由 MobileSheet tall 的 __body 提供滚动 */
.mobile-chat-panel-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.mobile-orchestration-audit-host {
  --morandi-card: var(--lhm-card, #fffdf8);
  --morandi-surface: var(--lhm-surface, #fbf7f0);
  --morandi-soft-bg: var(--lhm-soft, #faf7f1);
  --morandi-soft-bg-strong: var(--lhm-soft-strong, #f1eae0);
  --morandi-hover: var(--lhm-hover, #f3eee6);
  --morandi-accent: var(--lhm-accent, #5c8a5c);
  --morandi-primary: var(--lhm-primary, #8b7355);
  --morandi-danger: var(--lhm-danger, #c0665a);
  --morandi-text: var(--lhm-text, #333);
  --morandi-text-light: var(--lhm-text-light, #666);
  --morandi-border: var(--lhm-border-line, #e5e5e5);
}

.mobile-orchestration-audit-host :deep(.aud-head) {
  padding: 12px 12px 10px;
}

.mobile-orchestration-audit-host :deep(.aud-scroll),
.mobile-orchestration-audit-host :deep(.aud-list-wrap) {
  -webkit-overflow-scrolling: touch;
}

.mobile-orchestration-audit-host :deep(.aud-list-wrap),
.mobile-orchestration-audit-host :deep(.aud-skeleton) {
  padding-inline: 12px;
}

.mobile-orchestration-audit-host :deep(.aud-list-item),
.mobile-orchestration-audit-host :deep(.li-meta),
.mobile-orchestration-audit-host :deep(.po-row),
.mobile-orchestration-audit-host :deep(.rt-line),
.mobile-orchestration-audit-host :deep(.syn-top-row) {
  min-width: 0;
}

.mobile-orchestration-audit-host :deep(.po-row) {
  flex-direction: column;
  gap: 4px;
}

.mobile-orchestration-audit-host :deep(.po-k) {
  width: auto;
  min-width: 0;
}

.mobile-orchestration-audit-host :deep(.rt-line) {
  flex-wrap: wrap;
}

.mobile-orchestration-audit-host :deep(.rt-stage) {
  min-width: 0;
}

.mobile-orchestration-audit-host :deep(.rt-thought) {
  flex-basis: 100%;
  padding-left: 33px;
}

.mobile-orchestration-audit-host :deep(.syn-top-row) {
  grid-template-columns: 18px minmax(0, auto) minmax(0, auto);
}

.mobile-orchestration-audit-host :deep(.syn-mix-row) {
  grid-template-columns: 34px minmax(72px, 1fr) 38px;
}

/* 消息编辑态：文本域 + 取消/确定/保存并重新生成 */
.mobile-chat-edit__textarea {
  width: 100%;
  min-height: 96px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--lhm-border-warm, rgba(139, 115, 85, 0.2));
  border-radius: 10px;
  background: var(--lhm-card, #fffdf8);
  color: #2d302c;
  font: inherit;
  font-size: 14.5px;
  line-height: 1.6;
  padding: 10px 12px;
}

.mobile-chat-edit__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.mobile-chat-edit__btn {
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 999px;
  background: var(--lhm-card, #fffdf8);
  color: var(--lhm-text, #333);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 6px 14px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-chat-edit__btn--primary {
  border-color: var(--lhm-primary, #8b7355);
  background: var(--lhm-primary, #8b7355);
  color: #fff;
}

.mobile-chat-edit__btn--accent {
  border-color: var(--lhm-accent, #5c8a5c);
  background: var(--lhm-accent, #5c8a5c);
  color: #fff;
}

/* 笔记跳转高亮：短暂柔和底色提示定位到的原消息 */
.mobile-chat-message--note-focus {
  animation: mobile-chat-note-focus 1.2s ease;
  border-radius: 10px;
}

@keyframes mobile-chat-note-focus {
  0%, 100% { background: transparent; }
  30% { background: color-mix(in srgb, var(--lhm-accent, #5c8a5c) 18%, transparent); }
}
</style>
