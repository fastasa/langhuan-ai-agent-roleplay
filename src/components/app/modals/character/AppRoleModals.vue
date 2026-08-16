<template>
  <!-- 群众角色编辑弹窗 -->
  <AppFormDialog
    :open="state.showCrowdEditor.value"
    :title="state.editingCrowdId.value ? '编辑群众角色元素' : '新建群众角色元素'"
    size="lg"
    @cancel="state.showCrowdEditor.value = false"
  >
      <div class="form-group">
        <label>Emoji</label>
        <input v-model="state.crowdForm.emoji" placeholder="👥" style="width: 60px; text-align: center; font-size: 1.2rem;">
      </div>
      <div class="form-group">
        <label>群众名称 *</label>
        <input v-model="state.crowdForm.name" placeholder="例如：路人甲乙丙、街坊邻居">
      </div>
      <div class="form-group">
        <label>昵称，用于 @ 功能</label>
        <input v-model="state.crowdForm.nickname" placeholder="例如：路人们、街坊们">
      </div>
      <div class="form-group">
        <label>API 配置</label>
        <select v-model="state.crowdForm.apiPreset">
          <option value="">使用默认 API</option>
          <option v-for="p in state.viewModel.apiPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>成员列表</label>
        <div v-for="(member, i) in state.crowdForm.members" :key="i" style="display: flex; gap: 6px; margin-bottom: 6px; align-items: center;">
          <input v-model="member.name" placeholder="名字" style="flex: 1; min-width: 80px;">
          <input v-model="member.nickname" placeholder="昵称" style="flex: 1; min-width: 70px;">
          <textarea v-model="member.brief" placeholder="简介，例如：男，上班族" style="flex: 2; min-width: 120px; resize: both; min-height: 36px;"></textarea>
          <button class="btn btn-tiny btn-danger" @click="state.crowdForm.members.splice(i, 1)">×</button>
        </div>
        <button class="btn btn-small btn-secondary" @click="state.crowdForm.members.push({ name: '', nickname: '', brief: '' })">+ 添加成员</button>
      </div>
      <div class="form-group">
        <label>常去地点，逗号分隔</label>
        <input v-model="state.crowdForm.locations" placeholder="公园, 商场, 学校">
      </div>
      <div class="form-group">
        <label>所属组别</label>
        <select v-model="state.crowdForm.groupId">
          <option value="">未分组</option>
          <option v-for="grp in state.characterGroups" :key="grp.id" :value="grp.id">{{ grp.name }}</option>
        </select>
      </div>

      <template #actions>
        <button v-if="state.editingCrowdId.value" class="btn btn-danger" @click="state.deleteCrowd()" style="margin-right: auto;">删除</button>
        <button class="btn btn-secondary" @click="state.showCrowdEditor.value = false">取消</button>
        <button class="btn btn-primary" @click="state.saveCrowd()">保存</button>
      </template>
  </AppFormDialog>

  <!-- 帷幕统一入口 -->
  <AppFormDialog
    :open="state.showCurtainPanel.value"
    title="帷幕"
    size="md"
    @cancel="state.showCurtainPanel.value = false"
  >
      <div class="curtain-summary">这里管理当前对话的临时舞台状态，会影响之后发给角色的上下文。</div>
      <div class="curtain-quick-actions">
        <button class="curtain-card" type="button" @click="openSceneEditorFromCurtain">
          <span class="curtain-card-header">
            <span class="curtain-card-title">场景设置</span>
            <span class="curtain-card-action">调整</span>
          </span>
          <span class="curtain-card-body">
            <span>{{ state.viewModel.currentScene?.location || '跟随当前地点' }}</span>
            <span>{{ state.viewModel.currentScene?.time || state.viewModel.currentScene?.weather || '跟随当前时间天气' }}</span>
          </span>
        </button>
        <button class="curtain-card" type="button" @click="openAliasSelectorFromCurtain">
          <span class="curtain-card-header">
            <span class="curtain-card-title">切换马甲</span>
            <span class="curtain-card-action">选择</span>
          </span>
          <span class="curtain-card-body">
            <span>{{ state.viewModel.currentAlias?.name || '使用默认身份' }}</span>
          </span>
        </button>
      </div>

      <template #actions>
        <button class="btn btn-primary" @click="state.showCurtainPanel.value = false">关闭</button>
      </template>
  </AppFormDialog>

    <!-- 虚拟场景编辑弹窗 -->
  <AppFormDialog
    :open="state.showSceneEditor.value"
    title="虚拟场景设置"
    subtitle="设置时间、地点和天气，角色会按这里的设定行动。"
    size="md"
    body-compact
    @cancel="state.showSceneEditor.value = false"
  >
      <div class="scene-editor-form">
        <section class="scene-editor-section">
          <div class="scene-editor-section-title">地点</div>
          <label v-if="state.sceneForm.worldId && state.sceneForm.worldMapSheets.length" class="form-group scene-world-sheet-field">
            <span>世界图纸</span>
            <select v-model="state.sceneForm.locationSheetId">
              <option value="">跟随默认（{{ sceneDefaultMapSheetName }}）</option>
              <option v-for="sheet in state.sceneForm.worldMapSheets" :key="sheet.id" :value="sheet.id">{{ sheet.name || sheet.id }}</option>
            </select>
          </label>
          <div class="scene-location-grid">
            <div class="form-group">
              <label>大地点</label>
              <input v-model="state.sceneForm.locationLarge" placeholder="例如：维斯珂">
            </div>
            <div class="form-group">
              <label>中地点</label>
              <input v-model="state.sceneForm.locationMiddle" placeholder="例如：旧宅">
            </div>
            <div class="form-group">
              <label>小地点</label>
              <input v-model="state.sceneForm.locationSmall" placeholder="例如：书房">
            </div>
            <div class="form-group">
              <label>现实地点</label>
              <input v-model="state.sceneForm.realLocation" placeholder="例如：临平">
            </div>
          </div>
        </section>

        <section class="scene-editor-section">
          <div class="scene-editor-section-title">时间与天气</div>
          <div class="scene-runtime-grid">
            <div class="form-group">
              <label>虚拟时间</label>
              <input v-model="state.sceneForm.time" type="datetime-local">
            </div>
            <div class="form-group">
              <label>时间流速</label>
              <div class="scene-rate-row">
                <input v-model.number="state.sceneForm.timeRate" type="range" min="0" max="20" step="0.5">
                <span>{{ Number(state.sceneForm.timeRate ?? 1).toFixed(1) }}x</span>
              </div>
              <div class="scene-field-hint">1x 同步现实，0x 暂停</div>
            </div>
            <div class="form-group">
              <label>虚拟天气</label>
              <div
                class="scene-weather-row"
                :class="{ 'scene-weather-row--custom': state.sceneForm.weatherMode === 'custom' }"
              >
                <select v-model="state.sceneForm.weatherMode">
                  <option value="real">跟随现实天气</option>
                  <option value="custom">自定义天气</option>
                </select>
                <input
                  v-if="state.sceneForm.weatherMode === 'custom'"
                  v-model="state.sceneForm.weather"
                  placeholder="例如：薄雾，小雨，12°C"
                >
                <span v-if="state.sceneForm.weatherMode === 'custom' && state.sceneForm.weather" class="scene-weather-emoji">
                  {{ state.getWeatherEmoji(state.sceneForm.weather) }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <template #actions>
        <button
          type="button"
          class="btn btn-danger scene-editor-action scene-editor-action--restore"
          style="margin-right: auto;"
          @click="state.clearScene()"
        >
          恢复现实
        </button>
        <button
          type="button"
          class="btn btn-secondary scene-editor-action"
          @click="state.showSceneEditor.value = false"
        >
          取消
        </button>
        <button
          type="button"
          class="btn btn-primary scene-editor-action scene-editor-action--primary"
          @click="state.saveScene()"
        >
          保存
        </button>
      </template>
  </AppFormDialog>

  <!-- 马甲编辑弹窗 -->
  <CharacterProfileDialog
    :open="state.showAliasEditor.value"
    :title="`${state.editingAliasId.value ? '编辑' : '新建'}马甲`"
    subtitle="马甲是用户在不同世界或场景中的身份。"
    size="xl"
    :z-index="13060"
    :form="state.aliasForm"
    avatar-field="avatarPath"
    :show-group="false"
    :show-config="false"
    basic-hint="马甲的基础身份信息"
    impression-title="身份印象"
    impression-hint="用于当前场景里的用户身份表达"
    :show-speaking-style="false"
    name-label="马甲名称 *"
    name-placeholder="例如：阿什菲尔德家的管家"
    desc-placeholder="身份简介、补充说明..."
    confirm-text="保存"
    cancel-text="取消"
    @cancel="state.showAliasEditor.value = false"
    @confirm="state.saveAlias()"
    @pick-avatar="aliasAvatarInputRef?.click()"
    @clear-avatar="state.aliasForm.avatarPath = ''"
  >
    <template #actions-left>
      <button v-if="state.editingAliasId.value" class="btn btn-danger" type="button" @click="state.deleteAlias()">删除</button>
    </template>
  </CharacterProfileDialog>
  <input ref="aliasAvatarInputRef" type="file" accept="image/*" style="display: none;" @change="handleAliasAvatarUpload">

  <!-- 马甲选择弹窗 -->
  <AppFormDialog
    :open="state.showAliasSelector.value"
    title="选择马甲"
    subtitle="为当前聊天选择使用的身份。"
    size="sm"
    @cancel="state.showAliasSelector.value = false"
  >
      <div
        class="alias-selector-card"
        :class="{ 'alias-selector-card--active': !getCurrentBoundAliasId() }"
        @click="state.bindAlias('')"
      >
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="alias-selector-avatar alias-selector-avatar--default">
            <img v-if="state.viewModel.userProfile?.avatarPath" :src="state.viewModel.userProfile.avatarPath" style="width: 100%; height: 100%; object-fit: cover;">
            <span v-else style="font-size: 1.5rem;">{{ state.viewModel.userProfile?.emoji || '👤' }}</span>
          </div>
          <div>
            <div style="font-weight: 500;">使用默认身份</div>
            <div style="font-size: 0.8rem; color: var(--morandi-text-light);">{{ state.viewModel.userProfile?.name || '我' }}</div>
          </div>
        </div>
      </div>
      <div
        v-for="alias in state.viewModel.aliases"
        :key="alias.id"
        class="alias-selector-card"
        :class="{ 'alias-selector-card--active': getCurrentBoundAliasId() === alias.id }"
        @click="state.bindAlias(alias.id)"
      >
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="alias-selector-avatar">
            <img v-if="alias.avatarPath" :src="normalizeAvatarUrl(alias.avatarPath)" :alt="alias.name">
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="3.2"/>
              <path d="M5 19c1.5-3.2 4.2-4.8 7-4.8s5.5 1.6 7 4.8"/>
            </svg>
          </div>
          <div>
            <div style="font-weight: 500;">{{ alias.name }}</div>
            <div style="font-size: 0.8rem; color: var(--morandi-text-light);">{{ alias.background || alias.desc || '无描述' }}</div>
          </div>
        </div>
      </div>
      <div v-if="state.viewModel.aliases.length === 0" class="alias-selector-empty">
        暂无马甲，点击下方按钮创建
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="openAliasEditorFromSelector()">+ 新建马甲</button>
        <button class="btn btn-primary" @click="state.showAliasSelector.value = false">关闭</button>
      </template>
  </AppFormDialog>

  <!-- 创建群聊弹窗 -->
  <AppFormDialog
    :open="state.showCreateGroup.value"
    :title="state.editingGroupId.value ? '编辑群聊元素' : '新建群聊元素'"
    size="lg"
    @cancel="state.showCreateGroup.value = false"
  >
      <div class="form-group">
        <label>Emoji</label>
        <input v-model="state.groupForm.emoji" placeholder="👥" style="width: 60px; text-align: center; font-size: 1.2rem;">
      </div>
      <div class="form-group">
        <label>群聊头像</label>
        <div class="alias-avatar-editor">
          <button type="button" class="alias-avatar-trigger" @click="groupAvatarInputRef?.click()">
            <img v-if="state.groupForm.avatarPath" :src="normalizeAvatarUrl(state.groupForm.avatarPath)" alt="群聊头像">
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/>
              <path d="M8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/>
              <path d="M8 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/>
              <path d="M2 20v-1a3 3 0 0 1 3-3h3"/>
            </svg>
          </button>
          <div class="alias-avatar-actions">
            <button class="btn btn-small btn-secondary" type="button" @click="groupAvatarInputRef?.click()">选择头像</button>
            <button v-if="state.groupForm.avatarPath" class="btn btn-small btn-secondary" type="button" @click="state.groupForm.avatarPath = ''">清除</button>
          </div>
          <input ref="groupAvatarInputRef" type="file" accept="image/*" style="display: none;" @change="handleGroupAvatarUpload($event, 'create')">
          <div class="upload-policy-hint">仅支持 PNG/JPEG，文件只保存在当前设备的本地服务中。</div>
        </div>
      </div>
      <div class="form-group">
        <label>群名 *</label>
        <input v-model="state.groupForm.name" placeholder="输入群聊名称">
      </div>
      <div class="form-group">
        <label>成员</label>
        <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--morandi-border); border-radius: 8px; padding: 8px;">
          <div v-for="(member, i) in state.groupForm.members" :key="i" style="display: flex; align-items: center; gap: 8px; padding: 6px; margin-bottom: 4px;">
            <select v-model="member.characterId" style="flex: 1; padding: 4px; border: 1px solid var(--morandi-border); border-radius: 4px;">
              <option v-for="char in state.viewModel.characters" :key="char.id" :value="char.id">{{ char.emoji }} {{ char.name }}</option>
            </select>
            <span style="font-size: 0.8rem;">概率(%):</span>
            <input v-model.number="member.probability" type="number" min="0" max="100" step="1" style="width: 64px; padding: 4px; border: 1px solid var(--morandi-border); border-radius: 4px;">
            <button class="btn btn-small btn-danger" @click="state.groupForm.members.splice(i, 1)"></button>
          </div>
        </div>
        <button class="btn btn-small btn-secondary" @click="state.groupForm.members.push({ characterId: '', probability: 100 })" style="margin-top: 6px;">+ 添加成员</button>
      </div>
      <div class="form-group">
        <label>所属组别</label>
        <select v-model="state.groupForm.groupId">
          <option value="">未分组</option>
          <option v-for="grp in state.characterGroups" :key="grp.id" :value="grp.id">{{ grp.name }}</option>
        </select>
      </div>

      <template #actions>
        <button v-if="state.editingGroupId.value" class="btn btn-danger" @click="state.deleteGroup()" style="margin-right: auto;">删除群聊</button>
        <button class="btn btn-secondary" @click="state.showCreateGroup.value = false">取消</button>
        <button class="btn btn-primary" @click="state.saveGroup()">保存</button>
      </template>
  </AppFormDialog>

  <!-- 会话编辑 -->
  <AppFormDialog
    :open="state.showGroupEditor.value"
    :title="isCreatingSession ? '新建会话' : '编辑会话'"
    size="xl"
    @cancel="state.showGroupEditor.value = false"
  >
      <div class="session-editor">
        <section class="session-editor-identity">
            <button type="button" class="session-avatar-button" @click="groupEditAvatarInputRef?.click()" title="上传照片">
              <img v-if="state.groupEditForm.avatarPath" :src="normalizeAvatarUrl(state.groupEditForm.avatarPath)" alt="会话头像">
              <span v-else>{{ state.groupEditForm.emoji || '会' }}</span>
              <span class="session-avatar-camera" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </span>
            </button>
          <label class="session-name-field">
            <span>会话名称</span>
            <input v-model="state.groupEditForm.name" placeholder="会话名称">
          </label>
          <input ref="groupEditAvatarInputRef" type="file" accept="image/*" class="session-file-input" @change="handleGroupAvatarUpload($event, 'edit')">
        </section>

        <div class="session-editor-main">
          <section class="session-members-panel">
            <div class="session-panel-title">角色与发言概率</div>
            <div v-if="state.groupEditForm.members.length" class="session-member-group-list">
              <section
                v-for="group in sessionMemberGroups"
                :key="group.id"
                class="session-member-group"
              >
                <button
                  class="session-member-group-header"
                  type="button"
                  :aria-expanded="isSessionMemberGroupExpanded(group.id)"
                  @click="toggleSessionMemberGroup(group.id)"
                >
                  <svg class="session-member-group-caret" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <strong>{{ group.label }}</strong>
                  <em>{{ group.members.length }} 个角色</em>
                </button>
                <div v-if="isSessionMemberGroupExpanded(group.id)" class="session-member-grid">
                  <div v-for="item in group.members" :key="item.index" class="session-member-row">
                    <div class="session-member-select-wrap">
                      <span class="session-member-face">
                        <img v-if="getMemberAvatar(item.member)" :src="getMemberAvatar(item.member)" alt="">
                        <span v-else>{{ getMemberEmoji(item.member) }}</span>
                      </span>
                      <button class="session-member-name" type="button" @click="openSessionMemberDialog(Number(item.index))">
                        <strong>{{ getMemberName(item.member) }}</strong>
                        <em>{{ getMemberStateModeLabel(item.member) }}</em>
                      </button>
                    </div>
                    <div class="session-probability-stepper">
                      <button type="button" @click="adjustSessionMemberProbability(item.member, -10)">−</button>
                      <input v-model.number="item.member.probability" type="number" min="0" max="100" step="1" aria-label="发言概率">
                      <button type="button" @click="adjustSessionMemberProbability(item.member, 10)">+</button>
                    </div>
                    <div class="session-member-actions">
                      <button
                        class="session-row-action session-row-edit"
                        type="button"
                        aria-label="编辑角色资料"
                        title="编辑角色资料"
                        :disabled="!findMemberCharacter(item.member)"
                        @click="openSessionMemberCharacterEditor(item.member)"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                        </svg>
                      </button>
                      <button class="session-row-action session-row-delete" type="button" aria-label="删除角色" title="删除角色" @click="removeSessionMember(Number(item.index))">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
            <div v-else-if="isCreatingSession" class="session-member-empty">
              <button class="session-add-member session-add-member--empty" type="button" @click="openSessionMemberDialog()">
                <svg class="session-add-member-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" x2="19" y1="8" y2="14" />
                  <line x1="22" x2="16" y1="11" y2="11" />
                </svg>
                添加角色
              </button>
            </div>
            <div v-if="state.groupEditForm.members.length" class="session-member-footer">
              <button class="session-add-member" type="button" @click="openSessionMemberDialog()">
                <svg class="session-add-member-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" x2="19" y1="8" y2="14" />
                  <line x1="22" x2="16" y1="11" y2="11" />
                </svg>
                添加角色
              </button>
            </div>
          </section>

          <!-- 高频设置：回复链路 / 帷幕 / 临时数据，默认显眼 -->
          <section class="session-primary-settings">
            <div class="session-primary-reply">
              <div class="session-setting-header session-setting-header--static">
                <svg class="session-setting-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="7" height="7" rx="2" />
                  <rect x="14" y="4" width="7" height="7" rx="2" />
                  <rect x="8.5" y="15" width="7" height="7" rx="2" />
                  <path d="M10 7.5h4" />
                  <path d="M12 11v4" />
                </svg>
                <span>会话默认回复链路</span>
              </div>
              <div class="session-reply-mode-toggle" role="group" aria-label="会话默认回复链路">
                <button
                  v-for="item in replyPipelineModeOptions"
                  :key="item.value"
                  type="button"
                  :class="{ selected: state.groupEditForm.replyPipelineMode === item.value }"
                  @click="selectReplyPipelineMode(item.value)"
                >
                  {{ item.label }}
                </button>
              </div>
              <div class="session-setting-summary">{{ replyPipelineModeSummary }}</div>
            </div>
            <!-- 会话编排倾向不在角色编辑弹窗维护；世界级稳定剧本基调在剧本工作台配置。 -->
            <div class="session-primary-entries">
              <button class="session-entry" type="button" @click="showSessionTemporaryDataDialog = true">
                <svg class="session-setting-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
                <span class="session-entry-text">
                  <strong>临时数据管理</strong>
                  <em>{{ temporaryDataSummary }}</em>
                </span>
                <svg class="session-setting-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
            <!-- 当前会话马甲：显眼展示，打开即见 -->
            <button class="session-entry session-entry--alias" type="button" @click="showSessionAliasDialog = true">
              <span class="session-entry-avatar">
                <img v-if="boundAliasAvatar" :src="boundAliasAvatar" alt="">
                <span v-else>{{ boundAliasEmoji }}</span>
              </span>
              <span class="session-entry-text">
                <strong>{{ boundAliasIsDefault ? '使用默认身份' : boundAliasName }}</strong>
                <em>{{ boundAliasIsDefault ? `${boundAliasName} · 点此切换马甲` : '当前会话马甲 · 点此切换或编辑' }}</em>
              </span>
              <svg class="session-setting-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <div class="session-primary-entries">
              <button class="session-entry" type="button" @click="showSessionDisplayDialog = true">
                <svg class="session-setting-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7V4h16v3" />
                  <path d="M9 20h6" />
                  <path d="M12 4v16" />
                </svg>
                <span class="session-entry-text">
                  <strong>显示设置</strong>
                  <em>{{ displaySummary }}</em>
                </span>
                <svg class="session-setting-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <button class="session-entry" type="button" @click="showSessionNarrationDialog = true">
                <svg class="session-setting-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 14a2 2 0 0 0 2-2V8h-2" />
                  <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
                  <path d="M8 14a2 2 0 0 0 2-2V8H8" />
                </svg>
                <span class="session-entry-text">
                  <strong>旁白设置</strong>
                  <em>{{ narrationSummary }}</em>
                </span>
                <svg class="session-setting-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </section>

        </div>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showGroupEditor.value = false">取消</button>
        <button class="btn btn-primary" @click="handleSaveGroupEdit()">{{ isCreatingSession ? '创建' : '保存' }}</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="showSessionTemporaryDataDialog"
    title="临时数据管理"
    size="xl"
    :z-index="13044"
    @cancel="showSessionTemporaryDataDialog = false"
  >
      <div class="session-temp-data-dialog">
        <section class="session-temp-data-content">
          <SessionTemporaryCharactersPanel
            class="session-temp-data-panel"
            :open="showSessionTemporaryDataDialog"
            :session-id="temporaryDataSessionId"
          />
        </section>
      </div>

      <template #actions>
        <button class="btn btn-primary" @click="showSessionTemporaryDataDialog = false">关闭</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="showSessionMemberDialog"
    :title="sessionMemberDialogTitle"
    size="xl"
    @cancel="closeSessionMemberDialog"
  >
      <div class="session-member-dialog" :class="{ 'session-member-dialog--add': editingSessionMemberIndex === null }">
        <div
          class="session-character-pick-list"
          role="listbox"
          :aria-multiselectable="editingSessionMemberIndex === null"
        >
          <button
            v-for="char in state.viewModel.characters"
            :key="char.id"
            type="button"
            class="session-character-pick"
            :class="{
              selected: isSessionCharacterSelected(char),
              disabled: isSessionCharacterDisabled(char)
            }"
            :disabled="isSessionCharacterDisabled(char)"
            role="option"
            :aria-selected="isSessionCharacterSelected(char)"
            @click="toggleSessionCharacterPick(char)"
          >
            <span class="session-member-face">
              <img v-if="getCharacterAvatar(char)" :src="getCharacterAvatar(char)" alt="">
              <span v-else>{{ char.emoji || '人' }}</span>
            </span>
            <span>
              <strong>{{ char.name || '未命名角色' }}</strong>
              <em>{{ getSessionCharacterPickMeta(char) }}</em>
            </span>
          </button>
        </div>
        <div class="session-member-dialog-side">
          <template v-if="editingSessionMemberIndex !== null">
            <label class="session-dialog-field">
              <span>发言概率(%)</span>
              <div class="session-probability-stepper session-probability-stepper--dialog">
                <button type="button" @click="adjustSessionMemberProbability(sessionMemberDraft, -10)">−</button>
                <input v-model.number="sessionMemberDraft.probability" type="number" min="0" max="100" step="1">
                <button type="button" @click="adjustSessionMemberProbability(sessionMemberDraft, 10)">+</button>
              </div>
            </label>
            <div class="session-character-state-fields">
              <label class="session-dialog-field">
                <span>角色状态</span>
                <select v-model="sessionMemberDraft.characterStateMode" @change="handleSessionMemberStateModeChange(sessionMemberDraft)">
                  <option value="follow_main">跟随角色主线</option>
                  <option value="independent_snapshot">本会话独立副本</option>
                </select>
              </label>
              <label v-if="sessionMemberDraft.characterStateMode === 'independent_snapshot'" class="session-dialog-field">
                <span>独立副本来源</span>
                <select v-model="sessionMemberDraft.sourceSnapshotId" :disabled="isSessionSnapshotLoading(sessionMemberDraft.characterId)">
                  <option value="">{{ sessionMemberDraft.characterBranchId ? '保留当前独立分支' : '当前角色主线' }}</option>
                  <option v-for="snapshot in snapshotOptionsFor(sessionMemberDraft.characterId)" :key="snapshot.id" :value="snapshot.id">
                    {{ snapshot.label }} · {{ formatSessionSnapshotDate(snapshot.createdAt) }}
                  </option>
                </select>
              </label>
              <p v-if="sessionMemberDraft.characterStateMode === 'independent_snapshot'" class="session-character-state-hint">
                会话会复制一份私有状态；后续回复和自动写入只修改本会话，不回写角色主线。
              </p>
            </div>
          </template>
          <template v-else>
            <div class="session-selected-member-head">
              <span>已选角色</span>
              <em>{{ selectedSessionMemberDrafts.length }} 个</em>
            </div>
            <div v-if="selectedSessionMemberDrafts.length" class="session-selected-member-list">
              <div
                v-for="draft in selectedSessionMemberDrafts"
                :key="draft.member.characterId"
                class="session-selected-member-row"
              >
                <div class="session-selected-member-title">
                  <span class="session-member-face">
                    <img v-if="getCharacterAvatar(draft.character)" :src="getCharacterAvatar(draft.character)" alt="">
                    <span v-else>{{ draft.character?.emoji || '人' }}</span>
                  </span>
                  <strong>{{ draft.character?.name || '未命名角色' }}</strong>
                </div>
                <div class="session-selected-member-state">
                  <select v-model="draft.member.characterStateMode" aria-label="角色状态挂载方式" @change="handleSessionMemberStateModeChange(draft.member)">
                    <option value="follow_main">跟随主线</option>
                    <option value="independent_snapshot">独立副本</option>
                  </select>
                  <select
                    v-if="draft.member.characterStateMode === 'independent_snapshot'"
                    v-model="draft.member.sourceSnapshotId"
                    aria-label="独立副本来源"
                    :disabled="isSessionSnapshotLoading(draft.member.characterId)"
                  >
                    <option value="">当前角色主线</option>
                    <option v-for="snapshot in snapshotOptionsFor(draft.member.characterId)" :key="snapshot.id" :value="snapshot.id">
                      {{ snapshot.label }} · {{ formatSessionSnapshotDate(snapshot.createdAt) }}
                    </option>
                  </select>
                  <em v-if="draft.member.characterStateMode === 'independent_snapshot'">只写本会话</em>
                </div>
                <div class="session-probability-stepper session-probability-stepper--dialog">
                  <button type="button" @click="adjustSessionMemberProbability(draft.member, -10)">−</button>
                  <input v-model.number="draft.member.probability" type="number" min="0" max="100" step="1">
                  <button type="button" @click="adjustSessionMemberProbability(draft.member, 10)">+</button>
                </div>
                <button
                  class="session-selected-member-remove"
                  type="button"
                  aria-label="移除已选角色"
                  @click="removeSessionMemberDraft(draft.member.characterId)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div v-else class="session-selected-member-empty">从左侧选择一个或多个角色</div>
          </template>
        </div>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="closeSessionMemberDialog">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!canSaveSessionMemberDraft"
          @click="saveSessionMemberDraft"
        >
          {{ editingSessionMemberIndex === null ? '添加' : '保存' }}
        </button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="showSessionDisplayDialog"
    title="显示设置"
    size="lg"
    :z-index="13041"
    @cancel="showSessionDisplayDialog = false"
  >
      <div class="session-setting-dialog-grid session-setting-dialog-grid--single">
        <label class="session-dialog-field">
          <span>聊天字号</span>
          <div class="session-font-scale-control">
            <button type="button" @click="adjustSessionFontScale(-0.05)">−</button>
            <input
              v-model.number="state.groupEditForm.chatFontScale"
              type="range"
              min="0.85"
              max="1.25"
              step="0.05"
              @change="state.groupEditForm.chatFontScale = normalizeSessionFontScale(state.groupEditForm.chatFontScale)"
            >
            <button type="button" @click="adjustSessionFontScale(0.05)">+</button>
            <strong>{{ displayScalePercent }}%</strong>
          </div>
        </label>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.groupEditForm.chatFontScale = 1">恢复默认</button>
        <button class="btn btn-primary" @click="saveSessionDisplayDialog">保存</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="showSessionNarrationDialog"
    title="旁白设置"
    :subtitle="narrationDialogSubtitle"
    size="xl"
    height-preset="tall"
    :z-index="13042"
    @cancel="showSessionNarrationDialog = false"
  >
      <!-- 与输入框左下角旁白按钮同款 message-square-quote 图标，后续若统一修改需同步 ChatInputBar.vue -->
      <template #title-icon>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 14a2 2 0 0 0 2-2V8h-2" />
          <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
          <path d="M8 14a2 2 0 0 0 2-2V8H8" />
        </svg>
      </template>

      <div class="session-narration-dialog">
        <label class="session-narration-force">
          <input v-model="state.groupEditForm.narrationForceEnabled" type="checkbox">
          <span class="session-narration-force-track" aria-hidden="true"></span>
          <span class="session-narration-force-copy">
            <strong>每轮必定旁白</strong>
            <small>打开后跳过是否生成判断，情境 hook 会强制旁白 agent 生成</small>
          </span>
        </label>

        <div class="session-narration-toolbar">
          <div class="session-narration-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input v-model="narrationSearch" type="text" placeholder="搜索名称…">
          </div>
          <button type="button" class="session-narration-txtbtn" @click="toggleAllNarrationRows">
            {{ narrationAllExpanded ? '全部折叠' : '全部展开' }}
          </button>
          <button type="button" class="session-narration-txtbtn session-narration-txtbtn--accent" @click="addNarrationProfile">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>新增类型
          </button>
        </div>

        <section class="session-narration-list">
          <article
            v-for="(profile, index) in narrationProfiles"
            v-show="narrationMatches(profile)"
            :key="profile.id"
            class="session-narration-row"
            :class="{ 'is-open': isNarrationRowOpen(profile) }"
          >
            <div class="session-narration-rowhead" @click="toggleNarrationRow(profile)">
              <span class="session-narration-chev" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
              </span>
              <span class="session-narration-name">{{ profile.name || '未命名旁白' }}</span>
              <span class="session-narration-summary-meta">
                <span>{{ profile.triggerDescription || '未填写触发描述' }}</span>
              </span>
            </div>

            <div v-show="isNarrationRowOpen(profile)" class="session-narration-body">
              <div class="session-narration-grid">
                <label class="session-dialog-field session-narration-f4">
                  <span>名称</span>
                  <input v-model="profile.name" placeholder="例如：环境旁白">
                </label>
                <label class="session-dialog-field session-narration-f8">
                  <span>触发描述</span>
                  <textarea v-model="profile.triggerDescription" rows="3" placeholder="告诉旁白 agent 什么情况下应该读取这个 skill"></textarea>
                </label>
              </div>

              <label class="session-dialog-field session-narration-prefix">
                <span>内容本体</span>
                <textarea v-model="profile.content" rows="12" placeholder="写给旁白 agent 读取的 skill 内容"></textarea>
              </label>

              <div v-if="isCustomNarrationProfile(profile)" class="session-narration-row-actions">
                <button type="button" class="btn btn-tiny btn-danger" @click="removeNarrationProfile(index)">删除此自定义旁白</button>
              </div>
            </div>
          </article>

          <div v-show="!narrationVisibleCount" class="session-narration-empty">未找到匹配的旁白类型</div>
        </section>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="showSessionNarrationDialog = false">取消</button>
        <button class="btn btn-primary" @click="saveSessionNarrationDialog">保存</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="showSessionAliasDialog"
    title="马甲设置"
    size="xl"
    :z-index="13040"
    @cancel="showSessionAliasDialog = false"
  >
      <div class="session-alias-dialog-list">
        <button
          type="button"
          class="session-alias-option"
          :class="{ selected: !state.groupEditForm.boundAlias }"
          @click="selectSessionAlias('')"
        >
          <span class="alias-selector-avatar alias-selector-avatar--default">
            <img v-if="state.viewModel.userProfile.avatarPath" :src="normalizeAvatarUrl(state.viewModel.userProfile.avatarPath)" alt="">
            <span v-else>{{ state.viewModel.userProfile.emoji || '我' }}</span>
          </span>
          <span class="session-alias-option-text">
            <strong>使用默认身份</strong>
            <em>{{ state.viewModel.userProfile.name || '默认身份' }}</em>
          </span>
        </button>
        <div
          v-for="alias in state.viewModel.aliases"
          :key="alias.id"
          class="session-alias-option"
          :class="{ selected: state.groupEditForm.boundAlias === alias.id }"
        >
          <button type="button" class="session-alias-pick" @click="selectSessionAlias(alias.id)">
            <span class="alias-selector-avatar">
              <img v-if="alias.avatarPath" :src="normalizeAvatarUrl(alias.avatarPath)" alt="">
              <span v-else>{{ alias.emoji || '我' }}</span>
            </span>
            <span class="session-alias-option-text">
              <strong>{{ alias.name || '未命名马甲' }}</strong>
              <em>{{ alias.desc || alias.bio || '未填写简介' }}</em>
            </span>
          </button>
          <span class="session-alias-actions">
            <button type="button" class="session-alias-icon-button" title="编辑马甲" aria-label="编辑马甲" @click.stop="openAliasEditorFromSession(alias)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5z" />
                <path d="M13.5 6 18 10.5" />
              </svg>
            </button>
            <button type="button" class="session-alias-icon-button session-alias-icon-button--danger" title="删除马甲" aria-label="删除马甲" @click.stop="openAliasDeleteFromSession(alias)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 7V5.8c0-.9.7-1.6 1.6-1.6h4.8c.9 0 1.6.7 1.6 1.6V7" />
                <path d="M5.5 7h13" />
                <path d="M7 9l.7 10.2c.1.8.7 1.4 1.5 1.4h5.6c.8 0 1.4-.6 1.5-1.4L17 9" />
                <path d="M10 11.2v6" />
                <path d="M14 11.2v6" />
              </svg>
            </button>
          </span>
        </div>
      </div>

      <template #actions>
        <button class="btn btn-secondary" style="margin-right: auto;" @click="openAliasEditorFromSession()">+ 新建马甲</button>
        <button class="btn btn-primary" @click="showSessionAliasDialog = false">完成</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="imageAvatarTargetOpen"
    title="设置为头像"
    subtitle="选择头像归属，下一步可调整方形裁剪。"
    size="sm"
    :z-index="13080"
    @cancel="closeImageAvatarTarget"
  >
    <div class="image-avatar-targets">
      <section v-if="currentAvatarSessionTarget" class="image-avatar-target-section">
        <div class="image-avatar-target-heading">当前会话</div>
        <button type="button" class="image-avatar-target" @click="selectImageAvatarTarget(currentAvatarSessionTarget)">
          <span class="image-avatar-target-mark">会</span>
          <span>{{ currentAvatarSessionTarget.name }}</span>
        </button>
      </section>
      <section v-if="state.viewModel.characters.length" class="image-avatar-target-section">
        <div class="image-avatar-target-heading">角色</div>
        <button
          v-for="character in state.viewModel.characters"
          :key="character.id"
          type="button"
          class="image-avatar-target"
          @click="selectImageAvatarTarget({ kind: 'character', id: String(character.id), name: String(character.name || '未命名角色') })"
        >
          <span class="image-avatar-target-mark">{{ character.emoji || '人' }}</span>
          <span>{{ character.name || '未命名角色' }}</span>
        </button>
      </section>
      <section v-if="state.viewModel.aliases.length" class="image-avatar-target-section">
        <div class="image-avatar-target-heading">马甲</div>
        <button
          v-for="alias in state.viewModel.aliases"
          :key="alias.id"
          type="button"
          class="image-avatar-target"
          @click="selectImageAvatarTarget({ kind: 'alias', id: String(alias.id), name: String(alias.name || '未命名马甲') })"
        >
          <span class="image-avatar-target-mark">{{ alias.emoji || '我' }}</span>
          <span>{{ alias.name || '未命名马甲' }}</span>
        </button>
      </section>
      <div v-if="!hasImageAvatarTargets" class="image-avatar-target-empty">当前没有可设置的会话、角色或马甲。</div>
    </div>
  </AppFormDialog>

  <PhotoCropDialog
    :open="photoCropOpen"
    :source="photoCropSource"
    :title="photoCropTitle"
    :z-index="13090"
    @cancel="closePhotoCrop"
    @confirm="applyPhotoCrop"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, unref, watch } from 'vue'
import { normalizeChatSessionReplyPipelineMode, type ChatSessionReplyPipelineMode } from '../../../../app/chatReplyPipelineMode'
import { OPEN_STATUS_SYSTEM_PANEL_EVENT } from '../../../../app/statusSystemPresets'
import AppFormDialog from '../../../common/AppFormDialog.vue'
import PhotoCropDialog from '../../../common/PhotoCropDialog.vue'
import CharacterProfileDialog from './CharacterProfileDialog.vue'
import SessionTemporaryCharactersPanel from '../../chat/SessionTemporaryCharactersPanel.vue'
import type { createRoleModalState } from '../../../../composables/app/modalState/createRoleModalState'
import {
  createDefaultNarrationProfile,
  normalizeNarrationFrequency,
  normalizeNarrationProfiles,
  normalizeNarrationTemperature,
  type NarrationProfile
} from '../../../../app/narrationProtocol'
import { readImageInputAsDataUrl, readImageUrlAsDataUrl } from '../../../../utils/photoFile'
import {
  OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT,
  type ChatImageAvatarAssignmentRequest
} from '../../../../app/chatImageAvatarAssignment'
import {
  listCharacterSnapshotRecords,
  type CharacterSnapshotMetadata
} from '../../../../repositories/characterRepository'

type RoleModalState = ReturnType<typeof createRoleModalState>

const props = defineProps<{ state: RoleModalState }>()
const state = props.state
const aliasAvatarInputRef = ref<HTMLInputElement | null>(null)
const groupAvatarInputRef = ref<HTMLInputElement | null>(null)
const groupEditAvatarInputRef = ref<HTMLInputElement | null>(null)
const showSessionMemberDialog = ref(false)
const editingSessionMemberIndex = ref<number | null>(null)
type SessionMemberDraft = {
  characterId: string
  probability: number
  characterStateMode: 'follow_main' | 'independent_snapshot'
  characterBranchId: string
  sourceSnapshotId: string
}
const sessionMemberDraft = reactive<SessionMemberDraft>({
  characterId: '', probability: 100, characterStateMode: 'follow_main', characterBranchId: '', sourceSnapshotId: ''
})
const sessionMemberMultiDrafts = ref<SessionMemberDraft[]>([])
const sessionSnapshotOptions = ref<Record<string, CharacterSnapshotMetadata[]>>({})
const sessionSnapshotLoadingIds = ref<Set<string>>(new Set())
const showSessionAliasDialog = ref(false)
const showSessionNarrationDialog = ref(false)
const showSessionDisplayDialog = ref(false)
const showSessionTemporaryDataDialog = ref(false)
// 批次4 融合：临时数据面板「状态栏」按钮跳状态系统面板时，本弹窗（z-index 更高）收起防遮挡。
function handleOpenStatusSystemPanelEvent() {
  showSessionTemporaryDataDialog.value = false
}
type ImageAvatarTarget = { kind: 'session' | 'character' | 'alias'; id: string; name: string }
const imageAvatarTargetOpen = ref(false)
const imageAvatarRequest = ref<ChatImageAvatarAssignmentRequest | null>(null)
const imageAvatarTarget = ref<ImageAvatarTarget | null>(null)

function handleOpenImageAvatarAssignment(event: Event) {
  const detail = (event as CustomEvent<ChatImageAvatarAssignmentRequest>).detail
  if (!detail?.imageUrl) return
  imageAvatarRequest.value = detail
  imageAvatarTargetOpen.value = true
}
onMounted(() => {
  window.addEventListener(OPEN_STATUS_SYSTEM_PANEL_EVENT, handleOpenStatusSystemPanelEvent)
  window.addEventListener(OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT, handleOpenImageAvatarAssignment)
})
onBeforeUnmount(() => {
  window.removeEventListener(OPEN_STATUS_SYSTEM_PANEL_EVENT, handleOpenStatusSystemPanelEvent)
  window.removeEventListener(OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT, handleOpenImageAvatarAssignment)
})
const expandedSessionMemberGroups = ref<Set<string>>(new Set())
const photoCropOpen = ref(false)
const photoCropSource = ref('')
const photoCropTarget = ref<'alias' | 'groupCreate' | 'groupEdit' | 'imageAssignment'>('alias')
const isCreatingSession = computed(() => state.groupEditForm.mode === 'create')
const temporaryDataSessionId = computed(() => {
  return String(state.groupEditForm.sessionId || state.viewModel.currentSession?.id || '').trim()
})
const currentAvatarSessionTarget = computed<ImageAvatarTarget | null>(() => {
  const session = state.viewModel.currentSession as Record<string, any> | null
  const id = String(session?.id || '').trim()
  if (!id) return null
  return { kind: 'session', id, name: String(session?.title || '当前会话') }
})
const hasImageAvatarTargets = computed(() => Boolean(
  currentAvatarSessionTarget.value || state.viewModel.characters.length || state.viewModel.aliases.length
))
function handleSaveGroupEdit() {
  return state.saveGroupEdit()
}
const photoCropTitle = computed(() => {
  if (photoCropTarget.value === 'imageAssignment') return `裁剪${imageAvatarTarget.value?.name || ''}头像`
  if (photoCropTarget.value === 'alias') return '裁剪马甲头像'
  if (photoCropTarget.value === 'groupEdit') return '裁剪会话头像'
  return '裁剪群聊头像'
})
const sceneDefaultMapSheetName = computed(() => {
  const defaultId = String(state.sceneForm.worldDefaultMapSheetId || '')
  return state.sceneForm.worldMapSheets.find((sheet: { id: string }) => sheet.id === defaultId)?.name || '默认图纸'
})

// 当前会话绑定的马甲（空表示使用默认身份），用于在弹窗顶部显眼展示
const boundAlias = computed<any | null>(() => {
  const aliasId = String(state.groupEditForm.boundAlias || '').trim()
  if (!aliasId) return null
  return (state.viewModel.aliases || []).find((item: any) => String(item?.id || '') === aliasId) || null
})

const boundAliasIsDefault = computed(() => !boundAlias.value)

const boundAliasName = computed(() => {
  if (boundAlias.value) return String(boundAlias.value.name || '未命名马甲')
  return String(state.viewModel.userProfile?.name || '默认身份')
})

const boundAliasAvatar = computed(() => {
  const source = boundAlias.value?.avatarPath || (boundAlias.value ? '' : state.viewModel.userProfile?.avatarPath)
  return normalizeAvatarUrl(source || '')
})

const boundAliasEmoji = computed(() => {
  return String(boundAlias.value?.emoji || state.viewModel.userProfile?.emoji || '我')
})

function ensureNarrationProfileDraft(): NarrationProfile[] {
  const form = state.groupEditForm as any
  if (!Array.isArray(form.narrationProfiles) || !form.narrationProfiles.length) {
    form.narrationProfiles = normalizeNarrationProfiles(form.narrationProfiles, {
      frequency: state.groupEditForm.narrationFrequency,
      temperature: state.groupEditForm.narrationTemperature
    })
  }
  return form.narrationProfiles
}
const narrationProfiles = computed<NarrationProfile[]>(() => {
  return ensureNarrationProfileDraft()
})
const narrationSummary = computed(() => {
  const profiles = narrationProfiles.value
  const mode = state.groupEditForm.narrationForceEnabled ? '必定旁白' : '按情境'
  if (!profiles.length) return `${mode} · 未配置`
  return `${mode} · ` + profiles
    .slice(0, 2)
    .map((item) => item.name)
    .join(' / ') + (profiles.length > 2 ? ` 等 ${profiles.length} 个` : '')
})

// 旁白设置弹窗：折叠式列表的本地交互状态（open 仅 UI 态，不持久化）
const narrationSearch = ref('')
const narrationOpenMap = ref<Record<string, boolean>>({})

function isNarrationRowOpen(profile: NarrationProfile): boolean {
  return narrationOpenMap.value[profile.id] === true
}
function toggleNarrationRow(profile: NarrationProfile) {
  narrationOpenMap.value[profile.id] = !isNarrationRowOpen(profile)
}
const narrationAllExpanded = computed(() => {
  const list = narrationProfiles.value
  return list.length > 0 && list.every((profile) => narrationOpenMap.value[profile.id] === true)
})
function toggleAllNarrationRows() {
  const target = !narrationAllExpanded.value
  narrationProfiles.value.forEach((profile) => {
    narrationOpenMap.value[profile.id] = target
  })
}
function narrationMatches(profile: NarrationProfile): boolean {
  const q = narrationSearch.value.trim().toLowerCase()
  if (!q) return true
  return String(profile.name || '').toLowerCase().includes(q)
}
const narrationVisibleCount = computed(() =>
  narrationProfiles.value.filter((profile) => narrationMatches(profile)).length
)
const narrationDialogSubtitle = computed(() => {
  const total = narrationProfiles.value.length
  return `${total} 个旁白 skill`
})

function isCustomNarrationProfile(profile: NarrationProfile): boolean {
  return !['environment', 'appearance', 'event_push'].includes(String(profile.id || ''))
}

const displayScalePercent = computed(() => {
  return Math.round(normalizeSessionFontScale(state.groupEditForm.chatFontScale) * 100)
})

const displaySummary = computed(() => {
  return `聊天字号 ${displayScalePercent.value}%`
})

const temporaryDataSummary = computed(() => {
  if (isCreatingSession.value) return '创建会话后可管理临时数据'
  return '角色、建筑、地理区域、势力、物品'
})

const replyPipelineModeOptions: Array<{ value: ChatSessionReplyPipelineMode; label: string }> = [
  { value: 'normal_recall', label: '普通召回' },
  { value: 'personality_model', label: '人格模型' },
  { value: 'fast_reply', label: '快速回复' },
  { value: 'pure_prompt', label: '纯净回复' }
]

const replyPipelineModeSummary = computed(() => {
  const mode = normalizeChatSessionReplyPipelineMode(state.groupEditForm.replyPipelineMode)
  return mode === 'pure_prompt'
    ? '只带可见历史和本次输入，不读召回、旁白和自动写入'
    : mode === 'fast_reply'
    ? '仅从正式在场角色中按概率随机发言；先写可见回复，再由提调串行核账'
    : mode === 'personality_model'
    ? '按当前回复角色读取消息投影，生成候选计划并评分后回复'
    : '未单独指定的角色走环境、召回、旁白与自动写入链'
})

const sessionMemberDialogTitle = computed(() => {
  return editingSessionMemberIndex.value === null ? '添加角色' : '编辑角色'
})

const existingSessionMemberIds = computed(() => {
  const skippedIndex = editingSessionMemberIndex.value
  return new Set(
    state.groupEditForm.members
      .map((member: any, index: number) => {
        if (skippedIndex !== null && index === skippedIndex) return ''
        return String(member?.characterId || member?.character_id || '').trim()
      })
      .filter(Boolean)
  )
})

const selectedSessionMemberDrafts = computed(() => {
  return sessionMemberMultiDrafts.value
    .map((member) => ({
      member,
      character: findCharacterById(member.characterId)
    }))
    .filter((draft) => draft.character)
})

const canSaveSessionMemberDraft = computed(() => {
  if (editingSessionMemberIndex.value !== null) return Boolean(String(sessionMemberDraft.characterId || '').trim())
  return selectedSessionMemberDrafts.value.length > 0
})

const sessionMemberGroups = computed(() => {
  const groups = new Map<string, { id: string; label: string; order: number; members: Array<{ member: any; index: number }> }>()
  const knownGroups = Array.isArray(state.characterGroups) ? state.characterGroups : []
  knownGroups.forEach((group: any, index: number) => {
    const id = String(group?.id || '').trim()
    if (!id || id === 'default') return
    groups.set(id, {
      id,
      label: String(group?.name || '未命名组别'),
      order: index,
      members: []
    })
  })
  const fallbackOrder = knownGroups.length + 1
  state.groupEditForm.members.forEach((member: any, index: number) => {
    const character = findMemberCharacter(member)
    const rawGroupId = String(character?.groupId ?? character?.group_id ?? '').trim()
    const groupId = rawGroupId && rawGroupId !== 'default' ? rawGroupId : 'default'
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        label: groupId === 'default' ? '未分组' : '未命名组别',
        order: groupId === 'default' ? fallbackOrder : fallbackOrder + groups.size,
        members: []
      })
    }
    groups.get(groupId)?.members.push({ member, index })
  })
  return Array.from(groups.values())
    .filter((group) => group.members.length > 0)
    .sort((a, b) => a.order - b.order)
})

function isSessionMemberGroupExpanded(groupId: string) {
  return expandedSessionMemberGroups.value.has(groupId)
}

function toggleSessionMemberGroup(groupId: string) {
  const next = new Set(expandedSessionMemberGroups.value)
  if (next.has(groupId)) {
    next.delete(groupId)
  } else {
    next.add(groupId)
  }
  expandedSessionMemberGroups.value = next
}

function selectSessionAlias(aliasId: string) {
  state.groupEditForm.boundAlias = String(aliasId || '')
}

function openAliasEditorFromSelector() {
  state.showAliasSelector.value = false
  if (typeof state.openAliasEditor === 'function') {
    state.openAliasEditor()
    return
  }
  state.showAliasEditor.value = true
}

function openAliasEditorFromSession(alias?: any) {
  showSessionAliasDialog.value = false
  nextTick(() => {
    if (typeof state.openAliasEditor === 'function') {
      state.openAliasEditor(alias)
      return
    }
    state.showAliasEditor.value = true
  })
}

function openAliasDeleteFromSession(alias: any) {
  showSessionAliasDialog.value = false
  nextTick(() => {
    state.deleteAlias(String(alias?.id || ''))
  })
}

function findMemberCharacter(member: any) {
  const id = String(member?.characterId || member?.character_id || '').trim()
  return findCharacterById(id)
}

function findCharacterById(characterId: string) {
  const id = String(characterId || '').trim()
  if (!id) return null
  return (state.viewModel.characters || []).find((item: any) => String(item?.id || '') === id) || null
}

function getMemberAvatar(member: any) {
  const character = findMemberCharacter(member)
  return normalizeAvatarUrl(character?.avatarPath || character?.avatar_path || '')
}

function getMemberEmoji(member: any) {
  const character = findMemberCharacter(member)
  return String(character?.emoji || '人')
}

function getMemberName(member: any) {
  const character = findMemberCharacter(member)
  return String(character?.name || '选择角色')
}

function getMemberStateModeLabel(member: any) {
  return String(member?.characterStateMode ?? member?.character_state_mode) === 'independent_snapshot'
    ? '本会话独立副本'
    : '跟随角色主线'
}

function openSessionMemberCharacterEditor(member: any) {
  const character = findMemberCharacter(member)
  if (!character || typeof state.editCharacter !== 'function') return
  state.editCharacter(character)
  state.showCharacterEditor.value = true
}

function getCharacterAvatar(character: any) {
  return normalizeAvatarUrl(character?.avatarPath || character?.avatar_path || '')
}

function getCharacterId(character: any) {
  return String(character?.id || '').trim()
}

function isSessionCharacterDisabled(character: any) {
  const characterId = getCharacterId(character)
  return Boolean(characterId && existingSessionMemberIds.value.has(characterId))
}

function isSessionCharacterSelected(character: any) {
  const characterId = getCharacterId(character)
  if (!characterId) return false
  if (editingSessionMemberIndex.value !== null) return sessionMemberDraft.characterId === characterId
  return sessionMemberMultiDrafts.value.some((draft) => draft.characterId === characterId)
}

function getSessionCharacterPickMeta(character: any) {
  if (isSessionCharacterDisabled(character)) return '已在会话'
  if (isSessionCharacterSelected(character)) return '已选'
  return '可添加'
}

function snapshotOptionsFor(characterId: string) {
  return sessionSnapshotOptions.value[String(characterId || '').trim()] || []
}

function isSessionSnapshotLoading(characterId: string) {
  return sessionSnapshotLoadingIds.value.has(String(characterId || '').trim())
}

async function ensureSessionSnapshotOptions(characterId: string) {
  const id = String(characterId || '').trim()
  if (!id || Object.prototype.hasOwnProperty.call(sessionSnapshotOptions.value, id) || sessionSnapshotLoadingIds.value.has(id)) return
  sessionSnapshotLoadingIds.value = new Set([...sessionSnapshotLoadingIds.value, id])
  try {
    sessionSnapshotOptions.value = {
      ...sessionSnapshotOptions.value,
      [id]: await listCharacterSnapshotRecords(id)
    }
  } catch (error) {
    state.toast(`读取角色快照失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    sessionSnapshotOptions.value = { ...sessionSnapshotOptions.value, [id]: [] }
  } finally {
    const next = new Set(sessionSnapshotLoadingIds.value)
    next.delete(id)
    sessionSnapshotLoadingIds.value = next
  }
}

function handleSessionMemberStateModeChange(member: SessionMemberDraft) {
  if (member.characterStateMode !== 'independent_snapshot') {
    member.sourceSnapshotId = ''
    return
  }
  void ensureSessionSnapshotOptions(member.characterId)
}

function formatSessionSnapshotDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function toggleSessionCharacterPick(character: any) {
  const characterId = getCharacterId(character)
  if (!characterId || isSessionCharacterDisabled(character)) return
  if (editingSessionMemberIndex.value !== null) {
    if (sessionMemberDraft.characterId !== characterId) {
      sessionMemberDraft.characterStateMode = 'follow_main'
      sessionMemberDraft.characterBranchId = ''
      sessionMemberDraft.sourceSnapshotId = ''
    }
    sessionMemberDraft.characterId = characterId
    return
  }
  const draftIndex = sessionMemberMultiDrafts.value.findIndex((draft) => draft.characterId === characterId)
  if (draftIndex >= 0) {
    sessionMemberMultiDrafts.value.splice(draftIndex, 1)
    return
  }
  sessionMemberMultiDrafts.value.push({
    characterId,
    probability: 100,
    characterStateMode: 'follow_main',
    characterBranchId: '',
    sourceSnapshotId: ''
  })
}

function openSessionMemberDialog(index?: number) {
  const nextIndex = typeof index === 'number' ? index : null
  const source = nextIndex !== null ? state.groupEditForm.members[nextIndex] : null
  editingSessionMemberIndex.value = nextIndex
  sessionMemberDraft.characterId = String(source?.characterId || source?.character_id || '')
  sessionMemberDraft.probability = Number(source?.probability || 100) || 100
  sessionMemberDraft.characterStateMode = String(source?.characterStateMode ?? source?.character_state_mode) === 'independent_snapshot'
    ? 'independent_snapshot'
    : 'follow_main'
  sessionMemberDraft.characterBranchId = String(source?.characterBranchId ?? source?.character_branch_id ?? '')
  sessionMemberDraft.sourceSnapshotId = String(source?.sourceSnapshotId ?? source?.source_snapshot_id ?? '')
  if (sessionMemberDraft.characterStateMode === 'independent_snapshot') {
    void ensureSessionSnapshotOptions(sessionMemberDraft.characterId)
  }
  sessionMemberMultiDrafts.value = []
  showSessionMemberDialog.value = true
}

function closeSessionMemberDialog() {
  showSessionMemberDialog.value = false
  editingSessionMemberIndex.value = null
  sessionMemberDraft.characterId = ''
  sessionMemberDraft.probability = 100
  sessionMemberDraft.characterStateMode = 'follow_main'
  sessionMemberDraft.characterBranchId = ''
  sessionMemberDraft.sourceSnapshotId = ''
  sessionMemberMultiDrafts.value = []
}

function saveSessionMemberDraft() {
  if (editingSessionMemberIndex.value !== null) {
    const characterId = String(sessionMemberDraft.characterId || '').trim()
    if (!characterId) return
    const nextMember = {
      characterId,
      probability: Math.max(0, Math.min(100, Number(sessionMemberDraft.probability || 100) || 100)),
      characterStateMode: sessionMemberDraft.characterStateMode,
      characterBranchId: sessionMemberDraft.characterStateMode === 'independent_snapshot' ? sessionMemberDraft.characterBranchId : '',
      sourceSnapshotId: sessionMemberDraft.characterStateMode === 'independent_snapshot' ? sessionMemberDraft.sourceSnapshotId : ''
    }
    state.groupEditForm.members.splice(editingSessionMemberIndex.value, 1, nextMember)
  } else {
    const existingIds = existingSessionMemberIds.value
    const additions = sessionMemberMultiDrafts.value
      .map((draft) => ({
        characterId: String(draft.characterId || '').trim(),
        probability: Math.max(0, Math.min(100, Number(draft.probability || 100) || 100)),
        characterStateMode: draft.characterStateMode,
        characterBranchId: draft.characterStateMode === 'independent_snapshot' ? draft.characterBranchId : '',
        sourceSnapshotId: draft.characterStateMode === 'independent_snapshot' ? draft.sourceSnapshotId : ''
      }))
      .filter((draft) => draft.characterId && !existingIds.has(draft.characterId))
    if (!additions.length) return
    state.groupEditForm.members.push(...additions)
  }
  closeSessionMemberDialog()
}

function removeSessionMemberDraft(characterId: string) {
  const draftIndex = sessionMemberMultiDrafts.value.findIndex((draft) => draft.characterId === characterId)
  if (draftIndex >= 0) sessionMemberMultiDrafts.value.splice(draftIndex, 1)
}

function removeSessionMember(index: number) {
  state.groupEditForm.members.splice(index, 1)
}

function adjustSessionMemberProbability(member: any, step: number) {
  const next = Math.max(0, Math.min(100, Math.round(Number(member?.probability || 0) + step)))
  member.probability = next
}

function addNarrationProfile() {
  const list = ensureNarrationProfileDraft()
  const next = createDefaultNarrationProfile({
    kind: 'custom',
    frequency: state.groupEditForm.narrationFrequency,
    temperature: state.groupEditForm.narrationTemperature
  })
  next.id = `narration_${Date.now().toString(36)}`
  next.name = `自定义旁白 ${Math.max(1, list.filter((item) => isCustomNarrationProfile(item)).length + 1)}`
  list.push(next)
  // 新增后默认展开，方便立即编辑
  narrationOpenMap.value[next.id] = true
}

function removeNarrationProfile(index: number) {
  const list = ensureNarrationProfileDraft()
  list.splice(index, 1)
  if (!list.length) {
    list.push(createDefaultNarrationProfile({
      frequency: state.groupEditForm.narrationFrequency,
      temperature: state.groupEditForm.narrationTemperature
    }))
  }
}

function normalizeSessionFontScale(value: unknown) {
  const raw = Number(value ?? 1)
  if (!Number.isFinite(raw)) return 1
  return Math.round(Math.min(1.25, Math.max(0.85, raw)) * 100) / 100
}

function adjustSessionFontScale(step: number) {
  state.groupEditForm.chatFontScale = normalizeSessionFontScale(Number(state.groupEditForm.chatFontScale || 1) + step)
}

function selectReplyPipelineMode(mode: ChatSessionReplyPipelineMode) {
  state.groupEditForm.replyPipelineMode = normalizeChatSessionReplyPipelineMode(mode)
}

async function saveSessionNarrationDialog() {
  state.groupEditForm.narrationFrequency = normalizeNarrationFrequency(state.groupEditForm.narrationFrequency)
  state.groupEditForm.narrationTemperature = normalizeNarrationTemperature(state.groupEditForm.narrationTemperature)
  state.groupEditForm.narrationForceEnabled = state.groupEditForm.narrationForceEnabled === true
  ;(state.groupEditForm as any).narrationProfiles = normalizeNarrationProfiles((state.groupEditForm as any).narrationProfiles, {
    frequency: state.groupEditForm.narrationFrequency,
    temperature: state.groupEditForm.narrationTemperature
  }).map((profile) => ({
    id: profile.id,
    name: String(profile.name || '').trim(),
    triggerDescription: String(profile.triggerDescription || '').trim(),
    content: String(profile.content || '').trim()
  }))
  if (typeof state.saveSessionNarrationDraft === 'function' && !isCreatingSession.value) {
    const saved = await state.saveSessionNarrationDraft()
    if (!saved) return
  }
  showSessionNarrationDialog.value = false
}

async function saveSessionDisplayDialog() {
  state.groupEditForm.chatFontScale = normalizeSessionFontScale(state.groupEditForm.chatFontScale)
  if (typeof state.saveSessionDisplayDraft === 'function' && !isCreatingSession.value) {
    const saved = await state.saveSessionDisplayDraft()
    if (!saved) return
  }
  showSessionDisplayDialog.value = false
}

function getCurrentBoundAliasId() {
  return String(unref(state.viewModel.currentBoundAlias) || '')
}

function openAliasSelectorFromCurtain() {
  state.showCurtainPanel.value = false
  nextTick(() => {
    state.showAliasSelector.value = true
  })
}

function openSceneEditorFromCurtain() {
  state.showCurtainPanel.value = false
  nextTick(() => {
    if (typeof state.openSceneEditor === 'function') {
      state.openSceneEditor()
      return
    }
    state.showSceneEditor.value = true
  })
}

function normalizeAvatarUrl(path?: string | null): string {
  if (!path) return ''
  const trimmed = String(path).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return '/' + trimmed.replace(/^\/+/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

async function handleAliasAvatarUpload(event: Event) {
  await openPhotoCrop(event, 'alias')
}

async function handleGroupAvatarUpload(event: Event, mode: 'create' | 'edit') {
  await openPhotoCrop(event, mode === 'edit' ? 'groupEdit' : 'groupCreate')
}

async function openPhotoCrop(event: Event, target: 'alias' | 'groupCreate' | 'groupEdit') {
  try {
    const source = await readImageInputAsDataUrl(event)
    if (!source) return
    photoCropTarget.value = target
    photoCropSource.value = source
    photoCropOpen.value = true
  } catch (error) {
    console.error('读取头像失败:', error)
  }
}

function closeImageAvatarTarget() {
  imageAvatarTargetOpen.value = false
  imageAvatarRequest.value = null
}

async function selectImageAvatarTarget(target: ImageAvatarTarget) {
  const request = imageAvatarRequest.value
  if (!request?.imageUrl) return
  imageAvatarTarget.value = target
  imageAvatarTargetOpen.value = false
  try {
    photoCropSource.value = await readImageUrlAsDataUrl(request.imageUrl)
    if (!photoCropSource.value) throw new Error('图片内容为空')
    photoCropTarget.value = 'imageAssignment'
    photoCropOpen.value = true
  } catch (error: any) {
    state.toast?.(`读取图片失败：${error?.message || error}`, 'error')
  }
}

function closePhotoCrop() {
  photoCropOpen.value = false
  photoCropSource.value = ''
}

async function applyPhotoCrop(dataUrl: string) {
  if (photoCropTarget.value === 'imageAssignment') {
    const target = imageAvatarTarget.value
    if (target) await state.assignImageAvatar(target, dataUrl)
    imageAvatarRequest.value = null
    imageAvatarTarget.value = null
    closePhotoCrop()
    return
  }
  if (photoCropTarget.value === 'alias') {
    state.aliasForm.avatarPath = dataUrl
  } else if (photoCropTarget.value === 'groupEdit') {
    state.groupEditForm.avatarPath = dataUrl
  } else {
    state.groupForm.avatarPath = dataUrl
  }
  closePhotoCrop()
}
</script>

<style scoped>
.image-avatar-targets {
  max-height: min(58vh, 480px);
  overflow-y: auto;
}

.image-avatar-target-section + .image-avatar-target-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--morandi-border);
}

.image-avatar-target-heading {
  margin-bottom: 5px;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.image-avatar-target {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 9px;
  padding: 7px 6px;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
}

.image-avatar-target:hover,
.image-avatar-target:focus-visible {
  background: var(--morandi-soft-bg);
}

.image-avatar-target-mark {
  display: grid;
  flex: none;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--morandi-border);
  border-radius: 50%;
  background: var(--morandi-card);
  font-size: 13px;
}

.image-avatar-target-empty {
  padding: 18px 4px;
  color: var(--morandi-text-light);
  text-align: center;
}

.curtain-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.curtain-summary {
  color: var(--morandi-text-light);
  font-size: 0.86rem;
  line-height: 1.6;
  margin-bottom: 12px;
}

.curtain-quick-actions {
  display: grid;
  gap: 10px;
}

.curtain-card {
  width: 100%;
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-card) 86%, transparent);
  padding: 14px;
  text-align: left;
  cursor: pointer;
}

.curtain-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.curtain-card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--morandi-text);
}

.curtain-card-action {
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.curtain-card-body {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.84rem;
  color: var(--morandi-text);
}

.scene-location-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px 10px;
}

.scene-editor-form {
  display: grid;
  gap: 12px;
  margin-top: -2px;
}

.scene-editor-section {
  display: grid;
  gap: 8px;
}

.scene-editor-section + .scene-editor-section {
  border-top: 1px solid var(--morandi-border);
  padding-top: 10px;
}

.scene-editor-section-title {
  color: var(--morandi-text-light);
  font-size: 0.78rem;
  line-height: 1.2;
}

.scene-editor-form :deep(.form-group) {
  margin-bottom: 0;
}

.scene-editor-form :deep(.form-group label) {
  margin-bottom: 4px;
  font-size: 0.82rem;
}

.scene-editor-form :deep(.form-group input),
.scene-editor-form :deep(.form-group select) {
  min-height: 36px;
  padding: 8px 10px;
  font-size: 0.86rem;
}

.scene-runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px 10px;
}

.scene-runtime-grid > .form-group:last-child {
  grid-column: 1 / -1;
}

.scene-rate-row,
.scene-weather-row {
  display: grid;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.scene-rate-row {
  grid-template-columns: minmax(0, 1fr) 42px;
}

.scene-rate-row input[type="range"] {
  min-height: auto;
  padding: 0;
}

.scene-rate-row span {
  color: var(--morandi-text);
  font-size: 0.84rem;
  text-align: right;
}

.scene-field-hint {
  margin-top: 3px;
  color: var(--morandi-text-light);
  font-size: 0.74rem;
}

.scene-weather-row {
  grid-template-columns: minmax(0, 1fr);
}

.scene-weather-row--custom {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) auto;
}

.scene-weather-emoji {
  color: var(--morandi-text);
  font-size: 0.9rem;
}

.scene-editor-action {
  width: 88px !important;
  min-width: 0 !important;
  height: 34px !important;
  border-radius: 10px !important;
  font-size: 0.84rem !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  padding: 0 12px !important;
}

.scene-editor-action--restore {
  width: 96px !important;
}

.scene-editor-action--primary {
  width: 92px !important;
}

.alias-avatar-editor {
  display: flex;
  align-items: center;
  gap: 14px;
}

.alias-avatar-trigger,
.alias-selector-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--morandi-text-light);
  flex-shrink: 0;
}

.alias-avatar-trigger {
  cursor: pointer;
}

.alias-avatar-trigger img,
.alias-selector-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.alias-avatar-trigger svg,
.alias-selector-avatar svg {
  width: 28px;
  height: 28px;
}

.alias-avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.upload-policy-hint {
  flex-basis: 100%;
  color: var(--morandi-text-light);
  font-size: 0.74rem;
  line-height: 1.45;
}

.alias-selector-card {
  padding: 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  background: var(--morandi-card);
}

.alias-selector-card--active {
  background: rgba(155, 139, 122, 0.15);
}

.alias-selector-avatar--default {
  background: var(--morandi-border);
}

.alias-selector-empty {
  text-align: center;
  color: var(--morandi-text-light);
  padding: 20px;
}

.session-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.session-editor-identity {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
}

.session-avatar-button {
  position: relative;
  width: 78px;
  height: 78px;
  border: 1px dashed rgba(139, 168, 158, 0.62);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(139, 168, 158, 0.12), color-mix(in srgb, var(--morandi-card) 88%, transparent));
  color: var(--morandi-text);
  font-size: 1.55rem;
  overflow: hidden;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--morandi-card) 74%, transparent);
}

.session-avatar-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.session-avatar-button:hover {
  border-color: rgba(139, 168, 158, 0.92);
  background: rgba(139, 168, 158, 0.12);
}

.session-avatar-camera {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--morandi-card) 86%, transparent);
  background: rgba(139, 168, 158, 0.95);
  color: #fff;
}

.session-avatar-camera svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-alias-option em {
  font-style: normal;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.session-name-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.session-name-field span,
.session-setting-body span {
  color: var(--morandi-text);
  font-weight: 600;
}

.session-name-field input,
.session-setting-body input,
.session-setting-body select,
.session-setting-body textarea,
.session-member-select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text);
  padding: 10px 12px;
  font-size: 0.94rem;
}

.session-file-input {
  display: none;
}

.session-editor-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.session-members-panel,
.session-primary-settings {
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  padding: 14px;
}

.session-members-panel {
  display: flex;
  flex-direction: column;
}

.session-panel-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--morandi-text);
  margin-bottom: 10px;
}

.session-member-group-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.session-member-group {
  border-bottom: 1px solid rgba(209, 204, 197, 0.72);
}

.session-member-group:first-child {
  border-top: 1px solid rgba(209, 204, 197, 0.72);
}

.session-member-group-header {
  width: 100%;
  min-height: 38px;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  text-align: left;
  padding: 8px 6px;
  cursor: pointer;
}

.session-member-group-header:hover {
  background: rgba(139, 168, 158, 0.08);
}

.session-member-group-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}

.session-member-group-header em {
  font-style: normal;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.session-member-group-caret {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--morandi-text-light);
  transition: transform 0.16s ease;
}

.session-member-group-header[aria-expanded="true"] .session-member-group-caret {
  transform: rotate(90deg);
}

.session-member-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 8px;
  padding: 0 6px 10px 26px;
}

.session-member-empty {
  flex: 1 1 auto;
  min-height: 220px;
  display: grid;
  place-items: center;
  padding: 18px;
}

.session-member-row {
  min-height: 48px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 136px 72px;
  gap: 8px;
  align-items: center;
  border: 1px solid rgba(209, 204, 197, 0.72);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 62%, transparent);
  padding: 6px 8px;
}

.session-member-select-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.session-member-face {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(139, 168, 158, 0.13);
  overflow: hidden;
  flex-shrink: 0;
}

.session-member-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.session-member-name {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
  padding: 6px 4px;
}

.session-member-name strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.session-member-name em {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--morandi-text-light);
  font-size: 0.7rem;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-probability-stepper {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 30px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--langhuan-dialog-input-bg, #ffffff);
  min-height: 32px;
}

.session-probability-stepper button,
.session-row-action {
  border: 0;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text);
  cursor: pointer;
}

.session-probability-stepper input {
  width: 100%;
  border: 0;
  border-left: 1px solid var(--morandi-border);
  border-right: 1px solid var(--morandi-border);
  text-align: center;
  padding: 6px 4px;
}

.session-member-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.session-row-action {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  justify-self: center;
  display: grid;
  place-items: center;
  background: transparent;
}

.session-row-action:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.session-row-edit {
  color: var(--morandi-green);
}

.session-row-delete:hover {
  background: rgba(191, 95, 85, 0.08);
}

.session-row-delete {
  color: var(--morandi-danger);
}

.session-row-edit:not(:disabled):hover {
  background: rgba(139, 168, 158, 0.1);
}

.session-row-action svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-add-member,
.session-reset-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(139, 168, 158, 0.42);
  border-radius: 8px;
  background: rgba(139, 168, 158, 0.08);
  color: var(--morandi-green);
  padding: 8px 12px;
  cursor: pointer;
}

.session-add-member--empty {
  width: min(280px, 100%);
  min-height: 96px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 600;
}

.session-add-member-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-add-member--empty .session-add-member-icon {
  width: 30px;
  height: 30px;
  box-sizing: border-box;
  padding: 5px;
  border-radius: 50%;
  border: 1px solid rgba(104, 120, 102, 0.28);
}

.session-member-footer {
  margin-top: auto;
  padding-top: 12px;
}

.session-primary-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-primary-entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--morandi-border);
}

/* 高频入口与「更多设置」内的入口共用同一套轻量行样式 */
.session-entry {
  width: 100%;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 16px;
  gap: 8px;
  align-items: center;
  text-align: left;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text);
  padding: 10px 12px;
  cursor: pointer;
}

.session-entry:hover {
  border-color: rgba(139, 168, 158, 0.6);
  background: rgba(139, 168, 158, 0.08);
}

.session-entry-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-entry-text strong {
  font-size: 0.94rem;
  font-weight: 700;
}

.session-entry-text em {
  font-style: normal;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 当前马甲：整行显眼入口，带头像 */
.session-entry--alias {
  grid-template-columns: 38px minmax(0, 1fr) 16px;
  background: rgba(139, 168, 158, 0.08);
  border-color: rgba(139, 168, 158, 0.4);
}

.session-entry--alias:hover {
  background: rgba(139, 168, 158, 0.14);
}

.session-entry-avatar {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  border: 1px solid var(--morandi-border);
  font-size: 1.1rem;
  color: var(--morandi-text);
}

.session-entry-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.session-setting-header {
  width: 100%;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 24px;
  gap: 8px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  font-weight: 700;
  font-size: 0.96rem;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.session-setting-header--static {
  cursor: default;
}

.session-setting-icon {
  width: 18px;
  height: 18px;
  justify-self: center;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--morandi-green);
}

.session-setting-chevron {
  width: 16px;
  height: 16px;
  justify-self: end;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: color-mix(in srgb, var(--morandi-text) 78%, var(--morandi-text-light) 22%);
}

.session-setting-summary {
  margin-top: 8px;
  color: var(--morandi-text-light);
  line-height: 1.45;
  font-size: 0.82rem;
}

.session-reply-mode-toggle {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin-top: 10px;
  padding: 3px;
  border: 1px solid rgba(209, 204, 197, 0.82);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
}

.session-reply-mode-toggle button {
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 0.84rem;
  cursor: pointer;
}

.session-reply-mode-toggle button:hover {
  background: rgba(139, 168, 158, 0.08);
  color: var(--morandi-text);
}

.session-reply-mode-toggle button.selected {
  background: rgba(139, 168, 158, 0.16);
  color: var(--morandi-green);
  font-weight: 700;
}

.session-temp-data-dialog {
  display: flex;
  min-height: min(62vh, 620px);
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
}

.session-temp-data-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.session-temp-data-panel {
  height: 100%;
}

.session-setting-body {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-setting-body label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-setting-body textarea {
  min-height: 86px;
  resize: vertical;
}

.session-rate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  align-items: center;
  gap: 10px;
}

.session-alias-list {
  gap: 10px;
}

.session-alias-option {
  width: 100%;
  min-height: 92px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  padding: 12px;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  text-align: left;
  color: var(--morandi-text);
  cursor: pointer;
}

.session-member-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.7fr);
  gap: 14px;
  min-height: 300px;
}

.session-character-pick-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 10px;
  align-content: start;
  max-height: min(54vh, 500px);
  overflow: auto;
}

.session-alias-dialog-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(340px, 1fr));
  gap: 10px;
  align-content: start;
  max-height: min(54vh, 500px);
  overflow: auto;
}

.session-character-pick {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  padding: 8px;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
}

.session-character-pick:disabled {
  cursor: not-allowed;
}

.session-character-pick.selected,
.session-character-pick:hover {
  border-color: rgba(139, 168, 158, 0.56);
  background: rgba(139, 168, 158, 0.12);
}

.session-character-pick.disabled {
  opacity: 0.48;
  background: color-mix(in srgb, var(--morandi-card) 76%, transparent);
}

.session-character-pick.disabled:hover {
  border-color: var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 76%, transparent);
}

.session-character-pick strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.session-character-pick em {
  display: block;
  margin-top: 2px;
  color: var(--morandi-text-light);
  font-size: 0.76rem;
  font-style: normal;
}

.session-member-dialog-side {
  border-left: 1px solid rgba(209, 204, 197, 0.78);
  padding-left: 14px;
  min-width: 0;
}

.session-selected-member-head {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--morandi-text);
  font-weight: 700;
  font-size: 0.9rem;
}

.session-selected-member-head em {
  color: var(--morandi-text-light);
  font-size: 0.8rem;
  font-style: normal;
  font-weight: 500;
}

.session-selected-member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(48vh, 430px);
  overflow: auto;
  padding: 8px 2px 2px 0;
}

.session-selected-member-row {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(170px, 230px) 136px 30px;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  border-bottom: 1px solid rgba(209, 204, 197, 0.58);
  padding: 4px 0 8px;
}

.session-selected-member-state {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.session-selected-member-state select {
  width: 100%;
  min-width: 0;
  height: 30px;
  border: 1px solid var(--morandi-border);
  border-radius: 5px;
  color: var(--morandi-text);
  background: var(--langhuan-dialog-input-bg, var(--morandi-card));
  font-size: 0.76rem;
  padding: 0 7px;
}

.session-selected-member-state em {
  color: var(--morandi-text-light);
  font-size: 0.7rem;
  font-style: normal;
}

.session-selected-member-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.session-selected-member-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--morandi-text);
  font-size: 0.88rem;
  font-weight: 500;
}

.session-selected-member-remove {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--morandi-text-light);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.session-selected-member-remove:hover {
  background: rgba(191, 95, 85, 0.08);
  color: var(--morandi-danger);
}

.session-selected-member-remove svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-selected-member-empty {
  min-height: 118px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(209, 204, 197, 0.92);
  border-radius: 8px;
  color: var(--morandi-text-light);
  font-size: 0.86rem;
  margin-top: 8px;
  padding: 16px;
}

.session-dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.session-dialog-field span {
  color: var(--morandi-text);
  font-weight: 600;
  font-size: 0.88rem;
}

.session-dialog-field input,
.session-dialog-field select,
.session-dialog-field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  color: var(--morandi-text);
  padding: 9px 10px;
  font-size: 0.92rem;
}

.session-dialog-field textarea {
  min-height: 88px;
  resize: vertical;
}

.session-dialog-field--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
}

.session-dialog-field--inline input[type="checkbox"] {
  width: auto;
  min-width: 18px;
  height: 18px;
  padding: 0;
}

.session-character-state-fields {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--morandi-border);
}

.session-character-state-hint {
  margin: 0;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
  line-height: 1.55;
}

.session-probability-stepper--dialog {
  grid-template-columns: 40px minmax(0, 1fr) 40px;
}

.session-font-scale-control {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px 58px;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.session-font-scale-control button {
  width: 38px;
  height: 34px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  color: var(--morandi-text);
  cursor: pointer;
}

.session-font-scale-control input[type="range"] {
  padding: 0;
}

.session-font-scale-control strong {
  color: var(--morandi-text);
  font-size: 0.9rem;
  font-weight: 700;
  text-align: right;
}

.session-setting-dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.session-setting-dialog-grid--single {
  grid-template-columns: 1fr;
}

.session-dialog-field--wide {
  grid-column: 1 / -1;
}

.session-narration-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-narration-force {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  padding: 10px 12px;
  cursor: pointer;
}

.session-narration-force input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.session-narration-force-track {
  position: relative;
  width: 42px;
  height: 24px;
  flex: none;
  border-radius: 999px;
  background: rgba(148, 139, 125, 0.28);
  transition: background-color 0.16s ease;
}

.session-narration-force-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.16s ease;
}

.session-narration-force input:checked + .session-narration-force-track {
  background: var(--morandi-accent);
}

.session-narration-force input:checked + .session-narration-force-track::after {
  transform: translateX(18px);
}

.session-narration-force-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-narration-force-copy strong {
  color: var(--morandi-text);
  font-size: 0.9rem;
  font-weight: 600;
}

.session-narration-force-copy small {
  color: var(--morandi-text-light);
  font-size: 0.74rem;
  line-height: 1.35;
}

/* ---- 工具栏：搜索 / 全部展开折叠 / 新增类型 ---- */
.session-narration-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.session-narration-search {
  flex: 1;
  min-width: 0;
  height: 38px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #ffffff);
  padding: 0 13px;
  transition: border-color 0.15s ease;
}

.session-narration-search:focus-within {
  border-color: var(--morandi-accent);
}

.session-narration-search svg {
  width: 16px;
  height: 16px;
  flex: none;
  fill: none;
  stroke: var(--morandi-text-light);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-narration-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--morandi-text);
  font-size: 0.92rem;
}

.session-narration-txtbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  padding: 7px 9px;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.session-narration-txtbtn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-narration-txtbtn:hover {
  background: var(--morandi-hover);
}

.session-narration-txtbtn--accent {
  color: var(--morandi-accent);
}

/* ---- 折叠列表 ---- */
.session-narration-list {
  display: flex;
  flex-direction: column;
  max-height: min(62vh, 640px);
  overflow: auto;
  padding: 2px 2px 4px;
}

.session-narration-empty {
  padding: 38px 16px;
  text-align: center;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
}

.session-narration-row {
  border-radius: 12px;
  transition: background-color 0.18s ease;
}

/* 相邻两个折叠态之间用暖色细分隔线串联；展开成卡片时不显示 */
.session-narration-row:not(.is-open) + .session-narration-row:not(.is-open) > .session-narration-rowhead {
  border-top: 1px solid rgba(139, 115, 85, 0.12);
}

.session-narration-row.is-open {
  background: var(--morandi-card);
  margin: 6px 0;
  border: 1px solid var(--morandi-border);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
}

.session-narration-rowhead {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px;
  cursor: pointer;
  user-select: none;
  border-radius: 12px;
  transition: background-color 0.15s ease;
}

.session-narration-row:not(.is-open) .session-narration-rowhead:hover {
  background: var(--morandi-hover);
}

.session-narration-chev {
  width: 14px;
  height: 14px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--morandi-text-light);
  transition: transform 0.18s ease;
}

.session-narration-chev svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-narration-row.is-open .session-narration-chev {
  transform: rotate(90deg);
}

.session-narration-name {
  font-size: 0.95rem;
  font-weight: 500;
  flex: none;
  color: var(--morandi-text);
}

.session-narration-summary-meta {
  margin-left: auto;
  min-width: 0;
  flex: 1;
  font-size: 0.72rem;
  color: var(--morandi-text-light);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.session-narration-summary-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-narration-summary-meta .sep {
  color: var(--morandi-border);
}

.session-narration-summary-meta b {
  color: var(--morandi-text);
  font-weight: 600;
}

/* ---- 展开后的设置区 ---- */
.session-narration-body {
  padding: 2px 16px 16px;
}

.session-narration-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.session-narration-f2 {
  grid-column: span 2;
}

.session-narration-f3 {
  grid-column: span 3;
}

.session-narration-f4 {
  grid-column: span 4;
}

.session-narration-f6 {
  grid-column: span 6;
}

.session-narration-f8 {
  grid-column: span 8;
}

.session-narration-prefix {
  margin-bottom: 12px;
}

.session-narration-row-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.session-alias-dialog-list {
  min-height: 214px;
}

.session-alias-option.selected {
  background: rgba(139, 168, 158, 0.16);
  border-color: rgba(139, 168, 158, 0.48);
}

.session-alias-pick {
  min-width: 0;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.session-alias-option:has(.session-alias-pick) {
  grid-template-columns: minmax(0, 1fr) auto;
  cursor: default;
}

.session-alias-option-text {
  min-width: 0;
}

.session-alias-actions {
  display: inline-flex;
  gap: 4px;
  justify-self: end;
  align-self: center;
}

.session-alias-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(206, 200, 190, 0.78);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 86%, transparent);
  color: var(--morandi-text-light);
  cursor: pointer;
}

.session-alias-icon-button:hover {
  color: var(--morandi-text);
  border-color: rgba(139, 168, 158, 0.48);
  background: rgba(139, 168, 158, 0.1);
}

.session-alias-icon-button--danger:hover {
  color: var(--morandi-danger);
  border-color: rgba(155, 79, 74, 0.32);
  background: rgba(155, 79, 74, 0.08);
}

.session-alias-icon-button svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.session-alias-option strong,
.session-alias-option em {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .session-primary-entries {
    grid-template-columns: 1fr;
  }

  .session-editor {
    gap: 10px;
  }

  .session-editor-identity {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 10px;
    align-items: end;
    padding: 10px 12px;
  }

  .session-avatar-button {
    width: 58px;
    height: 58px;
    font-size: 1.18rem;
  }

  .session-avatar-camera {
    right: 3px;
    bottom: 3px;
    width: 19px;
    height: 19px;
  }

  .session-avatar-camera svg {
    width: 11px;
    height: 11px;
  }

  .session-name-field {
    gap: 5px;
  }

  .session-name-field span {
    font-size: 0.88rem;
  }

  .session-name-field input {
    padding: 8px 10px;
  }

  .session-editor-main {
    gap: 10px;
  }

  .session-members-panel,
  .session-primary-settings {
    padding: 12px;
  }

  .session-panel-title {
    margin-bottom: 8px;
    font-size: 0.95rem;
  }

  .session-member-group-list {
    max-height: 172px;
  }

  .session-reply-mode-toggle {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .session-member-grid,
  .session-member-row {
    grid-template-columns: 1fr;
  }

  .session-member-grid {
    padding-left: 24px;
  }

  .session-member-empty {
    flex: 0 0 auto;
    min-height: auto;
    place-items: stretch;
    padding: 8px 0 10px;
  }

  .session-add-member--empty {
    width: 100%;
    min-height: 48px;
    flex-direction: row;
    gap: 6px;
    font-size: 0.94rem;
  }

  .session-add-member--empty .session-add-member-icon {
    width: 22px;
    height: 22px;
    padding: 3px;
  }

  .session-character-pick-list,
  .session-alias-dialog-list {
    grid-template-columns: 1fr;
  }

  .session-member-dialog {
    grid-template-columns: 1fr;
    min-height: 0;
    gap: 12px;
  }

  .session-character-pick-list {
    max-height: 228px;
  }

  .session-member-dialog-side {
    border-left: 0;
    border-top: 1px solid rgba(209, 204, 197, 0.78);
    padding-left: 0;
    padding-top: 12px;
  }

  .session-selected-member-list {
    max-height: 240px;
  }

  .session-selected-member-row {
    grid-template-columns: minmax(0, 1fr) 124px 30px;
  }

  .session-narration-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .session-narration-f2,
  .session-narration-f3,
  .session-narration-f4,
  .session-narration-f6,
  .session-narration-f8 {
    grid-column: auto;
  }

  .session-narration-summary-meta {
    display: none;
  }

  .session-member-actions {
    justify-self: end;
  }
}

@media (max-width: 640px) {
  .session-narration-dialog {
    min-width: 0;
    gap: 10px;
  }

  .session-narration-force {
    align-items: flex-start;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 9px;
  }

  .session-narration-force-copy small {
    overflow-wrap: anywhere;
  }

  .session-narration-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
  }

  .session-narration-search {
    height: 34px;
    gap: 7px;
    padding: 0 10px;
  }

  .session-narration-search input {
    font-size: 0.86rem;
  }

  .session-narration-txtbtn {
    min-width: 0;
    padding: 7px 6px;
    font-size: 0.78rem;
  }

  .session-narration-list {
    max-height: none;
    overflow: visible;
    padding: 0;
  }

  .session-narration-row.is-open {
    margin: 4px 0;
    border-radius: 10px;
  }

  .session-narration-rowhead {
    gap: 8px;
    padding: 11px 10px;
    border-radius: 10px;
  }

  .session-narration-name {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-narration-summary-meta {
    display: none;
  }

  .session-narration-body {
    padding: 0 10px 12px;
  }

  .session-narration-grid {
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }

  .session-narration-f2,
  .session-narration-f3,
  .session-narration-f4,
  .session-narration-f6,
  .session-narration-f8 {
    grid-column: 1 / -1;
  }

  .session-narration-prefix {
    margin-bottom: 10px;
  }

  .session-narration-row-actions .btn {
    width: 100%;
  }
}
</style>
