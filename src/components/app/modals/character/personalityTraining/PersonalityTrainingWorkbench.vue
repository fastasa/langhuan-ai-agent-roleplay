<template>
  <AppModalShell
    :open="open"
    :aria-label="`人格模型训练 · ${characterName || '角色'}`"
    size="workspace"
    height-preset="tall"
    :z-index="zIndex"
    :show-close="false"
    body-flush
    @close="requestClose"
  >
    <div class="ptw" :class="{ 'ptw--narrow': false }">
      <button
        type="button"
        class="ptw__workspace-close"
        title="关闭人格模型训练"
        aria-label="关闭人格模型训练"
        @click="requestClose"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
      <aside
        class="ptw__agent"
        :class="{ 'ptw__agent--collapsed': personalityTrainerCollapsed }"
        :style="personalityTrainerCollapsed ? undefined : personalityTrainerPanelStyle"
        aria-label="鉴心协作栏"
      >
        <WorkspaceAgentShell
          :key="personalityTrainerViewScopeKey"
          v-model:collapsed="personalityTrainerCollapsed"
          :scope-key="personalityTrainerViewScopeKey"
          agent-kind="personality_trainer"
          :target-id="characterId"
          title="鉴心"
          :identity-label="`鉴心 · ${characterName || '未选择角色'}`"
          :enabled="Boolean(characterId)"
          :active="open"
          unavailable-text="请先选择一个角色，再和鉴心协作。"
          :runner="personalityTrainerRunner"
        />
      </aside>
      <button
        v-if="!personalityTrainerCollapsed"
        type="button"
        class="ptw__agent-resize"
        title="拖动调整鉴心宽度"
        aria-label="拖动调整鉴心宽度"
        @pointerdown.prevent="startPersonalityTrainerResize"
      ></button>

      <nav class="ptw__nav">
        <button
          v-if="personalityTrainerCollapsed"
          type="button"
          class="ptw__agent-expand"
          title="展开鉴心对话框"
          aria-label="展开鉴心对话框"
          aria-expanded="false"
          @click="personalityTrainerCollapsed = false"
        >
          <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M14 9l3 3-3 3" />
          </svg>
          <span>鉴心</span>
        </button>
        <div class="ptw__steps">
          <button
            v-for="(item, i) in steps"
            :key="item.id"
            type="button"
            class="ptw__step"
            :class="{ 'ptw__step--current': step === item.id, 'ptw__step--done': stepDone[item.id] && step !== item.id }"
            @click="goStep(item.id)"
          >
            <span class="ptw__step-num">
              <svg v-if="stepDone[item.id] && step !== item.id" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M20 6 9 17l-5-5"></path></svg>
              <template v-else>{{ i + 1 }}</template>
            </span>
            {{ item.label }}
            <span v-if="item.id === 'answer' && questionGroups.length && !canFormal" class="ptw__step-flag ptw__step-flag--warn"></span>
          </button>
        </div>
        <div class="ptw__summary">
          <div class="ptw__summary-row"><span class="ptw__summary-k">角色</span><span class="ptw__summary-v">{{ characterName || '—' }}</span></div>
          <div class="ptw__summary-row"><span class="ptw__summary-k">数据集</span><span class="ptw__summary-v ptw__summary-v--dim">{{ datasetStatusLabel }}</span></div>
          <div class="ptw__summary-row"><span class="ptw__summary-k">有效答案</span><span class="ptw__summary-v ptw__summary-v--dim">{{ answerCounts.resolved }} / {{ targetGroupCount }}</span></div>
          <div class="ptw__summary-row">
            <span class="ptw__summary-k">训练状态</span>
            <span class="ptw__summary-v">
              <span class="ptw__dot" :class="canFormal ? 'ptw__dot--ok' : 'ptw__dot--warn'"></span>
              {{ questionGroups.length ? (canFormal ? '正式训练' : `有效答案不足 ${MIN_FORMAL_TRAINING_GROUPS}`) : '未制卷' }}
            </span>
          </div>
          <div class="ptw__summary-row"><span class="ptw__summary-k">当前版本</span><span class="ptw__summary-v ptw__summary-v--dim">{{ installedVersionLabel }}</span></div>
        </div>
      </nav>

      <main class="ptw__main">
        <div class="ptw__scroll">
          <div v-if="loading" class="ptw__empty">
            <span class="ptw__spinner"></span>
            <div class="ptw__empty-title">正在读取训练数据…</div>
          </div>

          <div v-else-if="loadError" class="ptw__banner ptw__banner--danger">
            <b>读取失败：</b>{{ loadError }}
            <button type="button" class="ptw__link" @click="loadAll">重试</button>
          </div>

          <!-- ============ 消息选择（聊天记录优化） ============ -->
          <section v-else-if="step === 'source' && msgPickerOpen" class="ptw-step" style="max-width: 780px;">
            <button type="button" class="ptw__link ptw__link--muted" @click="msgPickerOpen = false">← 返回来源</button>
            <h3 class="ptw-step__h" style="margin-top: 10px;">选择消息</h3>
            <p class="ptw-step__sub">挑选能代表这个角色的原消息。进入训练时只读取消息投影，原文仅用于此处人工判断。</p>

            <div v-if="msgLoading" class="ptw__gen-progress"><span class="ptw__spinner"></span>正在读取消息…</div>
            <template v-else>
              <div class="ptw__filterbar">
                <button
                  type="button"
                  class="ptw__filter-chip"
                  :class="{ 'ptw__filter-chip--active': !msgSessionFilter }"
                  @click="msgSessionFilter = ''"
                >全部会话</button>
                <button
                  v-for="session in msgData?.sessions || []"
                  :key="session.sessionId"
                  type="button"
                  class="ptw__filter-chip"
                  :class="{ 'ptw__filter-chip--active': msgSessionFilter === session.sessionId }"
                  @click="msgSessionFilter = session.sessionId"
                >{{ session.title }}</button>
                <span class="ptw__foot-spacer"></span>
                <button type="button" class="ptw__link ptw__link--muted" @click="loadChatMessages">刷新</button>
              </div>

              <div v-if="!filteredMessages.length" class="ptw__empty">
                <div class="ptw__empty-title">没有可选消息</div>
                <div class="ptw__empty-desc">该角色还没有可用于训练的聊天消息。</div>
              </div>
              <div v-else class="ptw__msgs">
                <div
                  v-for="message in filteredMessages"
                  :key="`${message.sessionId}:${message.messageId}`"
                  class="ptw__msg"
                  :class="{ 'ptw__msg--checked': isMsgSelected(message) }"
                  @click="toggleMsg(message)"
                >
                  <span class="ptw__msg-check">
                    <svg v-if="isMsgSelected(message)" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M20 6 9 17l-5-5"></path></svg>
                  </span>
                  <div class="ptw__msg-body">
                    <div class="ptw__msg-top">
                      <span class="ptw__msg-who">{{ message.speakerName }}</span>
                      <span>·</span><span>{{ message.sessionTitle }}</span>
                      <span>·</span><span>{{ message.time || '—' }}</span>
                    </div>
                    <div class="ptw__msg-text">{{ message.text }}</div>
                    <div v-if="message.projection.failureReason" class="ptw__msg-fail">{{ message.projection.failureReason }}</div>
                  </div>
                  <span class="ptw__msg-proj">
                    <span class="ptw__dot" :class="projDotClass(message.projection.state)"></span>
                    {{ projStateLabel(message.projection.state) }}
                    <button
                      v-if="message.projection.state === 'none' || message.projection.state === 'fail'"
                      type="button"
                      class="ptw__link"
                      style="font-size: 0.72rem;"
                      :disabled="projectingKeys.has(`${message.sessionId}:${message.messageId}`)"
                      @click.stop="fixProjection(message)"
                    >{{ projectingKeys.has(`${message.sessionId}:${message.messageId}`) ? '投影中…' : '补投影' }}</button>
                  </span>
                </div>
              </div>

              <div class="ptw__row-actions" style="margin-top: 12px;">
                <span class="ptw__faint">已选 <b style="color: var(--morandi-text, #4f463f);">{{ selectedMsgSummary.total }}</b> 条原消息</span>
                <span class="ptw__faint"><span class="ptw__dot ptw__dot--ok"></span> {{ selectedMsgSummary.ok }} 条有投影</span>
                <span v-if="selectedMsgSummary.need" class="ptw__faint"><span class="ptw__dot ptw__dot--warn"></span> {{ selectedMsgSummary.need }} 条需补投影（不会自动进入训练）</span>
                <span class="ptw__foot-spacer"></span>
                <button type="button" class="ptw__btn" @click="msgPickerOpen = false">取消</button>
                <button type="button" class="ptw__btn ptw__btn--primary" :disabled="!selectedMsgSummary.ok || creatingDataset" @click="useSelectedMessages">
                  {{ creatingDataset ? '正在创建…' : '使用所选消息' }}
                </button>
              </div>
            </template>
          </section>

          <!-- ============ 来源 ============ -->
          <section v-else-if="step === 'source'" class="ptw-step">
            <h3 class="ptw-step__h">训练材料来源</h3>
            <p class="ptw-step__sub">选择用什么来校准这个角色。</p>

            <div class="ptw__choices">
              <div class="ptw__choice" :class="{ 'ptw__choice--active': sourceMode === 'profile' }" @click="sourceMode = 'profile'">
                <span class="ptw__radio"><span v-if="sourceMode === 'profile'" class="ptw__radio-dot"></span></span>
                <div class="ptw__choice-body">
                  <div class="ptw__choice-title">使用角色资料</div>
                  <div class="ptw__choice-desc">读取角色现有资料（简介 / 外貌 / 性格 / 说话风格 / 经历 / 世界观 / 背景）生成情境三选一问卷。</div>
                </div>
              </div>
              <div class="ptw__choice" :class="{ 'ptw__choice--active': sourceMode === 'chat' }" @click="sourceMode = 'chat'">
                <span class="ptw__radio"><span v-if="sourceMode === 'chat'" class="ptw__radio-dot"></span></span>
                <div class="ptw__choice-body">
                  <div class="ptw__choice-title">从聊天记录优化<span class="ptw__tag ptw__tag--green">已有模型适用</span></div>
                  <div class="ptw__choice-desc">从真实会话中挑选消息作为新样本，与旧数据集合并后重新训练。</div>
                  <div v-if="sourceMode === 'chat'" class="ptw__choice-meta">
                    <button type="button" class="ptw__link" @click.stop="openMsgPicker">选择消息…</button>
                  </div>
                </div>
              </div>
              <div class="ptw__choice ptw__choice--disabled">
                <span class="ptw__radio"></span>
                <div class="ptw__choice-body">
                  <div class="ptw__choice-title">手写角色描述<span class="ptw__tag">后续开放</span></div>
                  <div class="ptw__choice-desc">直接写下这个角色是什么样的人，作为出题依据。</div>
                </div>
              </div>
            </div>

            <div v-if="sourceMode === 'chat'" class="ptw__banner ptw__banner--info">
              训练材料只读取消息的<b>投影</b>，不直接使用原文长历史；投影失败的消息需先补投影才能进入训练。
            </div>

            <div class="ptw-step__sec">训练数据集</div>
            <div v-if="!datasets.length" class="ptw__row-actions">
              <button v-if="sourceMode === 'profile'" type="button" class="ptw__btn ptw__btn--primary" :disabled="creatingDataset" @click="createDatasetAndGenerate">
                {{ creatingDataset ? '创建中…' : '创建数据集并派遣设问' }}
              </button>
              <button v-else type="button" class="ptw__btn ptw__btn--primary" @click="openMsgPicker">选择消息…</button>
              <span class="ptw__faint">{{ sourceMode === 'profile' ? '默认首批生成 20 道训练题；也可让鉴心一次指定 50、100 或其它题量，冻结评测另行生成。' : '所选消息的投影将生成逐条确认的训练样本。' }}</span>
            </div>
            <template v-else>
              <div class="ptw__dataset-row">
                <select v-if="datasets.length > 1" v-model="currentDatasetId" class="ptw__select">
                  <option v-for="item in datasets" :key="item.datasetId" :value="item.datasetId">{{ item.title || item.datasetId }}</option>
                </select>
                <span v-else class="ptw__dataset-title">{{ currentDataset?.title || currentDataset?.datasetId }}</span>
                <span class="ptw__tag" :class="{ 'ptw__tag--green': currentDataset?.status === 'ready' }">{{ datasetStatusText(currentDataset?.status) }}</span>
                <span class="ptw__faint">{{ questionGroups.length }} 题 · 更新于 {{ formatVersionTime(currentDataset?.updatedAt) }}</span>
              </div>
              <div class="ptw__row-actions">
                <button type="button" class="ptw__btn ptw__btn--primary" @click="goStep(generationInProgress ? 'gen' : (questionGroups.length ? 'answer' : 'gen'))">
                  {{ generationInProgress ? '继续设问制卷' : (questionGroups.length ? '继续答题' : '去设问') }}
                </button>
                <button v-if="sourceMode === 'profile'" type="button" class="ptw__btn" :disabled="creatingDataset" @click="createDatasetAndGenerate">新建问卷批次</button>
                <button v-else type="button" class="ptw__btn" @click="openMsgPicker">新建聊天优化批次…</button>
              </div>
            </template>
          </section>

          <!-- ============ 出题 ============ -->
          <section v-else-if="step === 'gen'" class="ptw-step">
            <h3 class="ptw-step__h">设问制卷</h3>
            <p class="ptw-step__sub">后台子 Agent「设问」按维度生成三选一情境题；你可以先去别处，完成或失败后会向鉴心会话发回报。</p>

            <div v-if="!currentDataset" class="ptw__empty">
              <div class="ptw__empty-title">还没有训练数据集</div>
              <div class="ptw__empty-desc">先在「来源」创建数据集。</div>
              <div class="ptw__empty-acts"><button type="button" class="ptw__btn ptw__btn--primary" @click="goStep('source')">回到来源</button></div>
            </div>

            <template v-else>
              <div v-if="generateError" class="ptw__banner ptw__banner--danger">
                <b>设问未交卷：</b>{{ generateError }}
                <button type="button" class="ptw__link" @click="runGeneration()">重新派遣并从检查点续跑</button>
              </div>

              <div v-if="generating" class="ptw__gen-progress">
                <span class="ptw__spinner"></span>
                设问后台制卷中 · {{ generationProgress?.label || '准备分批生成题目' }}
                <span v-if="generationProgress" class="ptw__faint">({{ generationProgress.done }} / {{ generationProgress.total }})</span>
              </div>

              <div v-else-if="generationInProgress" class="ptw__gen-status">
                <span class="ptw__gen-status-text">
                  已落库：训练题 {{ questionGroups.length }} / {{ generationCheckpoint?.targetTrainingGroupCount }} · 评测题 {{ generationCheckpoint?.completedEvaluationCount }} / {{ generationCheckpoint?.targetEvaluationQuestionCount }}
                </span>
                <div class="ptw__track"><div class="ptw__track-fill" :style="{ width: genProgressPercent }"></div></div>
                <button type="button" class="ptw__btn ptw__btn--primary" @click="runGeneration()">派遣设问继续</button>
              </div>

              <div v-else-if="!questionGroups.length" class="ptw__row-actions">
                <button type="button" class="ptw__btn ptw__btn--primary" @click="runGeneration()">派遣设问制卷</button>
                <span class="ptw__faint">设问使用「{{ characterName }}」当前资料与正式协议，后台通过质量门后才交卷。</span>
              </div>

              <template v-else>
                <div class="ptw__gen-status">
                  <span class="ptw__gen-status-text">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M20 6 9 17l-5-5"></path></svg>
                    {{ questionGroups.length }} 题已就绪
                  </span>
                  <div class="ptw__track"><div class="ptw__track-fill" :style="{ width: genProgressPercent }"></div></div>
                  <button type="button" class="ptw__link ptw__link--muted" @click="confirmState = { kind: 'regen' }">重新生成整卷…</button>
                </div>

                <div class="ptw-step__sec">维度规划 <span class="ptw__faint">点击维度可预览题目</span></div>
                <div class="ptw__dims">
                  <div v-for="dim in dimensionRows" :key="dim.name" class="ptw__dimwrap">
                    <button type="button" class="ptw__dim" @click="openDimension = openDimension === dim.name ? '' : dim.name">
                      <svg class="line-icon ptw__dim-chev" :class="{ 'ptw__dim-chev--open': openDimension === dim.name }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="m9 18 6-6-6-6"></path></svg>
                      <span class="ptw__dim-name">{{ dim.name }}</span>
                      <div class="ptw__track ptw__dim-track"><div class="ptw__track-fill" :style="{ width: '100%' }"></div></div>
                      <span class="ptw__dim-count">{{ dim.count }} 题</span>
                    </button>
                    <div v-if="openDimension === dim.name" class="ptw__dimx">
                      <div v-for="item in visibleDimensionQuestions(dim)" :key="item.group.id" class="ptw__dimx-q">
                        <div class="ptw__dimx-head">
                          <span>第 {{ item.questionNumber }} 题</span>
                          <span
                            v-if="resolvedDimensionAnswer(item.group)"
                            class="ptw__dimx-source"
                            :class="`ptw__dimx-source--${resolvedDimensionAnswer(item.group)?.source}`"
                          >
                            {{ resolvedDimensionAnswer(item.group)?.source === 'confirmed' ? '人工选择' : '预设代选' }}
                          </span>
                        </div>
                        <div class="ptw__dimx-scene">{{ item.group.question }}</div>
                        <div class="ptw__dimx-plans">
                          <div
                            v-for="(candidate, ci) in item.group.candidates"
                            :key="candidate.id"
                            class="ptw__dimx-plan"
                            :class="{
                              'ptw__dimx-plan--selected': resolvedDimensionAnswer(item.group)?.candidateId === candidate.id,
                              'ptw__dimx-plan--confirmed': resolvedDimensionAnswer(item.group)?.candidateId === candidate.id && resolvedDimensionAnswer(item.group)?.source === 'confirmed',
                              'ptw__dimx-plan--preset': resolvedDimensionAnswer(item.group)?.candidateId === candidate.id && resolvedDimensionAnswer(item.group)?.source === 'preset'
                            }"
                          >
                            <span class="ptw__dimx-key">{{ String.fromCharCode(65 + ci) }}</span>{{ candidate.text }}
                            <span
                              v-if="resolvedDimensionAnswer(item.group)?.candidateId === candidate.id"
                              class="ptw__dimx-picked"
                            >
                              {{ resolvedDimensionAnswer(item.group)?.source === 'confirmed' ? '人工选择' : '预设代选' }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="ptw__dimx-foot">
                        <span>
                          共 {{ dim.count }} 题 ·
                          {{ expandedDimensionQuestions[dim.name] ? '已显示全部' : `先显示前 ${dim.preview.length} 题` }}
                        </span>
                        <button
                          v-if="dim.count > dim.preview.length"
                          type="button"
                          class="ptw__link ptw__link--muted"
                          :aria-expanded="Boolean(expandedDimensionQuestions[dim.name])"
                          @click="toggleDimensionQuestions(dim.name)"
                        >
                          {{ expandedDimensionQuestions[dim.name] ? '收起至前 3 题' : `展开全部 ${dim.count} 题` }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="ptw-step__sec">冻结评测题</div>
                <div class="ptw__checklist">
                  <div class="ptw__checkrow">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span v-if="activeEvalSet" class="ptw__checkrow-name">冻结评测题 · {{ evalQuestions.length }} 道</span>
                    <span v-else class="ptw__checkrow-name">暂无生效评测集</span>
                    <span class="ptw__checkrow-detail">{{ activeEvalSet ? '单独保存，永不进入训练；先检查题目和标准答案，再运行评测' : '人格稳定后，让左侧鉴心依据最新理解派遣设问单独生成' }}</span>
                    <span v-if="activeEvalSet" class="ptw__tag ptw__tag--plain">{{ activeEvalSet.evalSetId }}</span>
                  </div>
                </div>
                <template v-if="activeEvalSet">
                  <div class="ptw__row-actions">
                    <button
                      type="button"
                      class="ptw__btn"
                      :disabled="evalRunning"
                      @click="evalQuizOpen = !evalQuizOpen"
                    >
                      {{ evalQuizOpen ? '收起冻结评测题' : '检查冻结评测题' }}
                    </button>
                    <span class="ptw__faint">
                      已定标准 {{ evalAnswerCounts.confirmed }} · 预设待选 {{ evalAnswerCounts.preset }}
                    </span>
                  </div>
                  <PtwQuizPanel
                    v-if="evalQuizOpen"
                    :groups="evalQuestions"
                    :answers="evalAnswersLocal"
                    editable
                    :locked="evalRunning"
                    standard-answer-mode
                    :prompt-line="`${characterName || '该角色'}的标准答案是？`"
                    @pick="onEvalPick"
                    @edit-question="onEvalQuestionEdit"
                    @edit-candidate="onEvalCandidateEdit"
                  />
                </template>
              </template>
            </template>
          </section>

          <!-- ============ 选择（答题） ============ -->
          <section v-else-if="step === 'answer'" class="ptw-step ptw-step--quiz">
            <div v-if="!questionGroups.length" class="ptw__empty">
              <div class="ptw__empty-title">还没有可作答的题目</div>
              <div class="ptw__empty-desc">先让设问完成制卷，再回到这里选择最符合角色的计划。</div>
              <div class="ptw__empty-acts"><button type="button" class="ptw__btn ptw__btn--primary" @click="goStep('gen')">去设问</button></div>
            </div>
            <div v-if="latestCalibrationRound" class="ptw__banner ptw__banner--info ptw__round-summary">
              <b>第 {{ latestCalibrationRound.roundNumber }} 轮</b>
              <span>九个维度各 2 题 + 2 个轮换探针</span>
              <span>人工确认 {{ latestCalibrationRound.confirmedCount }} / {{ latestCalibrationRound.questionCount }}</span>
              <span v-if="latestCalibrationRound.confirmedCount">
                预设命中 {{ latestCalibrationRound.presetHitCount }} / {{ latestCalibrationRound.confirmedCount }}
              </span>
              <span v-if="adaptiveCalibration.canSuggestStop">最近两轮已达到 90%，可以收束；是否继续仍由你决定。</span>
            </div>
            <PtwQuizPanel
              :groups="questionGroupsForView"
              :answers="answersLocal"
              show-threshold
              editable
              :min-formal="MIN_FORMAL_TRAINING_GROUPS"
              :prompt-line="`${characterName || '该角色'}最可能怎么做？`"
              @pick="onAnswerPick"
              @edit-question="onQuestionEdit"
              @edit-candidate="onCandidateEdit"
            >
              <template #done>
                <button type="button" class="ptw__btn ptw__btn--primary" @click="goStep('samples')">查看样本</button>
              </template>
            </PtwQuizPanel>
          </section>

          <!-- ============ 样本确认 ============ -->
          <section v-else-if="step === 'samples'" class="ptw-step">
            <h3 class="ptw-step__h">样本确认</h3>
            <p class="ptw-step__sub">确认本次进入训练的数据集；持续优化采用合并重训，从公开基底模型重新训练。</p>

            <div class="ptw__stats">
              <div class="ptw__stat"><div class="ptw__stat-v">{{ answerCounts.confirmed }}<span class="ptw__stat-u">题</span></div><div class="ptw__stat-l">人工确认</div></div>
              <div class="ptw__stat"><div class="ptw__stat-v">{{ answerCounts.preset }}<span class="ptw__stat-u">题</span></div><div class="ptw__stat-l">预设代选</div></div>
              <div class="ptw__stat"><div class="ptw__stat-v">{{ answeredDimensionCount }}<span class="ptw__stat-u">/ {{ dimensionRows.length }}</span></div><div class="ptw__stat-l">维度覆盖</div></div>
              <div class="ptw__stat"><div class="ptw__stat-v">{{ posNegRatio }}</div><div class="ptw__stat-l">正反例比例</div></div>
              <div class="ptw__stat"><div class="ptw__stat-v">{{ splitSummary }}</div><div class="ptw__stat-l">训练 / 验证切分</div></div>
            </div>

            <div v-if="!questionGroups.length" class="ptw__banner ptw__banner--info">还没有题目，先在「设问」派遣后台制卷。</div>
            <div v-else-if="!canFormal" class="ptw__banner ptw__banner--warn">
              有效答案 <b>{{ answerCounts.resolved }}</b> 题（人工 {{ answerCounts.confirmed }}，预设代选 {{ answerCounts.preset }}），不足 {{ MIN_FORMAL_TRAINING_GROUPS }} 题。本次只能训练<b>实验模型</b>。
            </div>
            <div v-else class="ptw__banner">
              <b>已达正式训练标准。</b>验证集只用于早停与选轮，正式指标一律来自冻结评测集。
            </div>

            <template v-if="chatSkipped.length">
              <div class="ptw-step__sec">投影未通过 · 已自动跳过（{{ chatSkipped.length }}）</div>
              <div class="ptw__checklist">
                <div v-for="(item, i) in chatSkipped" :key="i" class="ptw__checkrow">
                  <span class="ptw__dot ptw__dot--fail"></span>
                  <span class="ptw__checkrow-name" style="width: auto;">消息 #{{ item.messageId }}</span>
                  <span class="ptw__checkrow-detail">{{ item.reason }}</span>
                </div>
              </div>
              <p class="ptw__faint" style="margin-top: 8px;">这些消息不会自动进入训练；可回到「来源 → 选择消息」补投影后新建批次，或保持跳过。</p>
            </template>
            <p v-if="currentDataset?.sourceKind === 'chat_projection_selection'" class="ptw__faint" style="margin-top: 12px;">
              来自真实会话的样本需在「选择」步逐条确认（每组选出最像角色的计划，未确认的组不进训练），暂不支持批量通过。
            </p>

            <PtwCalibrationPanel
              v-if="questionGroups.length"
              :character-id="characterId"
              :character-name="characterName"
              :samples="calibrationSamples"
              @toast="(message, type) => emit('toast', message, type)"
            />
          </section>

          <!-- ============ 训练 ============ -->
          <section v-else-if="step === 'train'" class="ptw-step">
            <h3 class="ptw-step__h">训练</h3>
            <p class="ptw-step__sub">优先在本机训练；本机条件不足时，可导出 Google Colab 训练包手动训练后导回。</p>

            <div class="ptw-step__sec">训练方式</div>
            <div class="ptw__choices">
              <div class="ptw__choice" :class="{ 'ptw__choice--active': trainMethod === 'local' }" @click="trainMethod = 'local'">
                <span class="ptw__radio"><span v-if="trainMethod === 'local'" class="ptw__radio-dot"></span></span>
                <div class="ptw__choice-body">
                  <div class="ptw__choice-title">本机训练<span class="ptw__tag ptw__tag--green">推荐</span></div>
                  <div class="ptw__choice-desc">数据不离开本机，预检通过后即可开始；关闭工作台后仍在后台训练。</div>
                </div>
              </div>
              <div class="ptw__choice" :class="{ 'ptw__choice--active': trainMethod === 'colab_out' }" @click="trainMethod = 'colab_out'">
                <span class="ptw__radio"><span v-if="trainMethod === 'colab_out'" class="ptw__radio-dot"></span></span>
                <div class="ptw__choice-body">
                  <div class="ptw__choice-title">导出 Colab Notebook 训练包</div>
                  <div class="ptw__choice-desc">在 Google Colab 中手动运行，完成后将模型 zip 导回。</div>
                  <div class="ptw__choice-meta">Colab 账号、算力、费用与数据上传风险由用户自行承担。</div>
                </div>
              </div>
              <div class="ptw__choice" :class="{ 'ptw__choice--active': trainMethod === 'colab_in' }" @click="trainMethod = 'colab_in'">
                <span class="ptw__radio"><span v-if="trainMethod === 'colab_in'" class="ptw__radio-dot"></span></span>
                <div class="ptw__choice-body">
                  <div class="ptw__choice-title">导入 Colab 训练后的模型 zip</div>
                  <div class="ptw__choice-desc">校验通过后保存为新版本（不自动安装），可在「安装」中启用。</div>
                </div>
              </div>
            </div>

            <template v-if="trainMethod === 'local'">
              <div class="ptw-step__sec">
                本机预检
                <button type="button" class="ptw__link ptw__link--muted" :disabled="precheckLoading" @click="runPrecheck">
                  {{ precheckLoading ? '检测中…' : (precheck ? '重新检测' : '开始检测') }}
                </button>
              </div>
              <div v-if="precheck && precheck.failureStage" class="ptw__banner ptw__banner--danger" style="margin-bottom: 10px;">
                <b>预检在「{{ failureStageLabel(precheck.failureStage) }}」阶段失败：</b>{{ precheck.failureReason }}
                <button type="button" class="ptw__link" @click="trainMethod = 'colab_out'">改用 Colab 训练包</button>
              </div>
              <div v-if="precheck" class="ptw__checklist">
                <div v-for="check in precheck.checks" :key="check.id" class="ptw__checkrow" :class="{ 'ptw__checkrow--skip': check.state === 'skip' }">
                  <svg v-if="check.state === 'ok'" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="color: var(--morandi-accent, #5c8a5c);"><path d="M20 6 9 17l-5-5"></path></svg>
                  <svg v-else-if="check.state === 'fail'" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="color: #c0665a;"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                  <svg v-else-if="check.state === 'warn'" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="color: #a07c1e;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
                  <svg v-else class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" style="color: var(--morandi-text-light, #b3ada3);"><path d="M5 12h14"></path></svg>
                  <span class="ptw__checkrow-name">{{ check.name }}</span>
                  <span class="ptw__checkrow-detail">{{ check.detail }}</span>
                </div>
              </div>
              <p v-else class="ptw__faint" style="margin-top: 10px;">先检测本机环境：Python、PyTorch、计算设备、磁盘空间与训练依赖。</p>

              <div class="ptw-step__sec">
                训练进度
                <button v-if="latestRun" type="button" class="ptw__link ptw__link--muted" @click="openRunLog">完整日志</button>
              </div>

              <!-- 进行中：五阶段竖向进度 -->
              <template v-if="activeRun">
                <div v-for="(stage, i) in trainingStages" :key="stage.id" class="ptw__stage" :class="stageState(stage.id, i)">
                  <span class="ptw__stage-rail">
                    <svg v-if="stageState(stage.id, i) === 'ptw__stage--done'" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="color: var(--morandi-accent, #5c8a5c);"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>
                    <span v-else-if="stageState(stage.id, i) === 'ptw__stage--now'" class="ptw__spinner"></span>
                    <svg v-else class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="color: color-mix(in srgb, var(--morandi-border) 96%, transparent);"><circle cx="12" cy="12" r="10"></circle></svg>
                  </span>
                  <span class="ptw__stage-body">
                    <span class="ptw__stage-name">{{ stage.label }}</span>
                    <span v-if="stage.desc" class="ptw__stage-desc">{{ stage.desc }}</span>
                  </span>
                </div>
                <div class="ptw__row-actions">
                  <span class="ptw__faint">{{ activeRunMessage }}</span>
                  <button type="button" class="ptw__link ptw__link--muted" @click="confirmState = { kind: 'cancel-run' }">取消训练</button>
                </div>
              </template>

              <!-- 最近一次失败 -->
              <div v-else-if="latestRun && latestRun.status === 'failed'" class="ptw__banner ptw__banner--danger">
                <b>训练失败：</b>在「{{ failureStageLabel(latestRun.failureStage) }}」阶段中断（{{ latestRun.failureReason || '原因见完整日志' }}）。数据集与已答题不受影响。
                <button type="button" class="ptw__link" @click="startTraining">重试</button>
                <button type="button" class="ptw__link ptw__link--muted" @click="trainMethod = 'colab_out'">改用 Colab</button>
              </div>

              <!-- 最近一次成功 -->
              <div v-else-if="latestRun && latestRun.status === 'succeeded'" class="ptw__banner">
                <b>训练完成。</b>已生成新版本（未安装），可前往「评测」查看或「安装」启用。
                <button type="button" class="ptw__link" @click="goStep('install')">前往安装</button>
                <button type="button" class="ptw__link ptw__link--muted" style="margin-left: 8px;" @click="startTraining">再次训练</button>
              </div>

              <!-- 未开始 -->
              <div v-else class="ptw__row-actions">
                <button
                  type="button"
                  class="ptw__btn ptw__btn--primary"
                  :disabled="startingRun || !answerCounts.resolved || (precheck ? !precheck.canTrain : false)"
                  @click="startTraining"
                >
                  {{ startingRun ? '正在创建训练任务…' : '开始训练' }}
                </button>
                <span v-if="questionGroups.length && !canFormal" class="ptw__tag ptw__tag--gold">有效答案不足 {{ MIN_FORMAL_TRAINING_GROUPS }} 题 · 本次将生成实验模型</span>
                <span v-else-if="answerCounts.resolved" class="ptw__faint">人工选择优先，其余使用预设代选 · 首次训练会自动安装依赖</span>
                <span v-else class="ptw__faint">先补全题目的预设答案，再开始训练。</span>
              </div>
            </template>

            <!-- 导出 Colab 训练包 -->
            <template v-else-if="trainMethod === 'colab_out'">
              <div class="ptw-step__sec">训练包</div>
              <div class="ptw__checklist">
                <div class="ptw__checkrow">
                  <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>
                  <span class="ptw__checkrow-name">训练包内容</span>
                  <span class="ptw__checkrow-detail">Notebook + train / valid JSONL + 说明（已脱敏，不含账号与会话标识）</span>
                  <button type="button" class="ptw__btn" :disabled="exportingPack || !answerCounts.resolved" @click="exportColabPack">
                    {{ exportingPack ? '正在导出…' : '导出训练包' }}
                  </button>
                </div>
              </div>
              <div v-if="awaitingImportRuns.length" class="ptw__banner ptw__banner--info">
                已导出 {{ awaitingImportRuns.length }} 个训练包，等待从 Colab 带模型 zip 回来；完成训练后切到「导入 Colab 训练后的模型 zip」。
              </div>
              <p class="ptw__faint" style="margin-top: 10px;">Colab 账号、算力、费用与数据上传风险由用户自行承担；正式评测仍使用项目内冻结评测集。</p>
            </template>

            <!-- 导入 Colab 训练产物 -->
            <template v-else>
              <div class="ptw-step__sec">等待导入的训练任务</div>
              <div v-if="!awaitingImportRuns.length" class="ptw__banner ptw__banner--info">
                没有等待导入的 Colab 训练任务。先在「导出 Colab Notebook 训练包」生成训练包；如果模型来自其他渠道，可用入口卡片的「上传模型包」直接导入并安装。
              </div>
              <div v-else class="ptw__checklist">
                <div v-for="run in awaitingImportRuns" :key="run.runId" class="ptw__checkrow">
                  <span class="ptw__dot ptw__dot--warn"></span>
                  <span class="ptw__checkrow-name">{{ formatVersionTime(run.createdAt) }}</span>
                  <span class="ptw__checkrow-detail">等待导入 · {{ runStatsLabel(run) }}</span>
                  <button type="button" class="ptw__btn" :disabled="importingRunId === run.runId" @click="pickColabZip(run.runId)">
                    {{ importingRunId === run.runId ? '正在导入…' : '导入模型 zip' }}
                  </button>
                  <button type="button" class="ptw__link ptw__link--muted" @click="cancelAwaitingRun(run.runId)">放弃</button>
                </div>
              </div>
              <input ref="colabFileInputRef" type="file" accept=".zip,application/zip" style="display: none;" @change="handleColabFile">
            </template>
          </section>

          <!-- ============ 评测 ============ -->
          <section v-else-if="step === 'eval'" class="ptw-step ptw-step--quiz">
            <h3 class="ptw-step__h">评测</h3>
            <p class="ptw-step__sub">作答或复用当前冻结评测集。冻结评测题永不进入训练，仅用于版本间对比。</p>

            <div v-if="!activeEvalSet" class="ptw__empty">
              <div class="ptw__empty-title">评测集缺失</div>
              <div class="ptw__empty-desc">当前角色没有生效的冻结评测集；人格稳定并由鉴心复盘后，再单独派遣设问生成。</div>
              <div class="ptw__empty-acts"><button type="button" class="ptw__btn ptw__btn--primary" @click="goStep('gen')">去设问</button></div>
            </div>

            <template v-else>
              <div class="ptw-step__sec">
                本次指标
                <span class="ptw__tag ptw__tag--plain">当前考卷 {{ activeEvalSet.evalSetId }} · {{ evalQuestions.length }} 题</span>
                <select v-if="evaluableVersions.length" v-model="evalVersionId" class="ptw__select" style="margin-left: auto; min-height: 28px; font-size: 0.78rem;">
                  <option v-for="version in evaluableVersions" :key="version.versionId" :value="version.versionId">
                    {{ versionDisplayName(version) }} · {{ versionStatusLabel(version) }}
                  </option>
                </select>
              </div>
              <div v-if="evalMetricsMismatch" class="ptw__banner ptw__banner--warn" style="margin-bottom: 12px; margin-top: 0;">
                <b>考卷不同，不可直接对比。</b>该版本指标使用评测集 {{ evalSelectedMetrics.evaluationSetId }}，当前生效考卷为 {{ activeEvalSet.evalSetId }}；可重新运行评测刷新指标。
              </div>
              <div v-else-if="evalResultsStale" class="ptw__banner ptw__banner--warn" style="margin-bottom: 12px; margin-top: 0;">
                <b>评测结果已过期。</b>这套评测题或标准答案在上次评测后修改过，请重新运行后再比较版本。
              </div>
              <div class="ptw__metrics">
                <div v-for="metric in metricCards" :key="metric.label" class="ptw__metric">
                  <div class="ptw__metric-l">{{ metric.label }}</div>
                  <div class="ptw__metric-v">{{ metric.value }}</div>
                  <div class="ptw__metric-set">{{ metric.footnote }}</div>
                </div>
              </div>
              <div class="ptw__row-actions">
                <button
                  type="button"
                  class="ptw__btn ptw__btn--primary"
                  :disabled="evalRunning || !evalVersionId || !evalAnswerCounts.resolved"
                  @click="runEvaluationForVersion"
                >
                  {{ evalRunning ? `正在评测… ${evalRunProgress}` : '运行评测' }}
                </button>
                <span v-if="!evalAnswerCounts.resolved" class="ptw__faint">考卷没有可用的人工答案或预设答案。</span>
                <span v-else class="ptw__faint">按约一半性能逐题运行（人工标准答案 {{ evalAnswerCounts.confirmed }}，预设标准答案 {{ evalAnswerCounts.preset }}）。</span>
              </div>

              <template v-if="evalDisplayedQuestionResults.length">
                <div class="ptw-step__sec">
                  逐题结果
                  <span class="ptw__faint">
                    已完成 {{ evalDisplayedQuestionResults.length }} / {{ evalRunning ? evalAnswerCounts.resolved : evalDisplayedQuestionResults.length }}
                  </span>
                </div>
                <div class="ptw__eval-results">
                  <div
                    v-for="(result, resultIndex) in evalDisplayedQuestionResults"
                    :key="result.questionId"
                    class="ptw__eval-result"
                    :class="{ 'ptw__eval-result--miss': !result.hit }"
                  >
                    <div class="ptw__eval-result-head">
                      <span>第 {{ resultIndex + 1 }} 题</span>
                      <span v-if="result.dimension" class="ptw__faint">{{ result.dimension }}</span>
                      <span class="ptw__tag" :class="result.hit ? 'ptw__tag--green' : 'ptw__tag--red'">
                        {{ result.hit ? '模型选对了' : '模型未选中标准答案' }}
                      </span>
                    </div>
                    <div class="ptw__eval-result-question">{{ result.question }}</div>
                    <div class="ptw__eval-compare">
                      <div class="ptw__eval-answer ptw__eval-answer--expected">
                        <div class="ptw__eval-answer-label">
                          标准答案 · {{ result.expectedSource === 'confirmed' ? '人工选择' : '预设代选' }}
                        </div>
                        <div class="ptw__eval-answer-text">
                          <span class="ptw__dimx-key">{{ result.expectedAnswer.label }}</span>
                          {{ result.expectedAnswer.text }}
                        </div>
                      </div>
                      <div class="ptw__eval-answer" :class="{ 'ptw__eval-answer--wrong': !result.hit }">
                        <div class="ptw__eval-answer-label">
                          模型实际答案
                          <span class="ptw__faint">
                            · {{ result.hit ? '与标准答案一致' : '与标准答案不一致' }}
                          </span>
                          <span v-if="Number.isFinite(result.modelAnswer.score)" class="ptw__faint">分数 {{ formatEvaluationScore(result.modelAnswer.score) }}</span>
                        </div>
                        <div class="ptw__eval-answer-text">
                          <span class="ptw__dimx-key">{{ result.modelAnswer.label }}</span>
                          {{ result.modelAnswer.text }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <div class="ptw-step__sec">
                评测题与标准答案
                <span class="ptw__faint">有效 {{ evalAnswerCounts.resolved }} / {{ evalQuestions.length }}</span>
              </div>
              <div v-if="!evalQuizOpen" class="ptw__row-actions">
                <button type="button" class="ptw__btn ptw__btn--primary" :disabled="evalRunning" @click="evalQuizOpen = true">
                  {{ evalAnswerCounts.confirmed > 0 ? '继续检查评测题' : '检查评测题' }}
                </button>
                <span v-if="retiredEvalSetCount > 0" class="ptw__faint">历史考卷 {{ retiredEvalSetCount }} 套（已退役）</span>
              </div>
              <PtwQuizPanel
                v-else
                :groups="evalQuestions"
                :answers="evalAnswersLocal"
                editable
                :locked="evalRunning"
                standard-answer-mode
                :prompt-line="`${characterName || '该角色'}的标准答案是？`"
                @pick="onEvalPick"
                @edit-question="onEvalQuestionEdit"
                @edit-candidate="onEvalCandidateEdit"
              >
                <template #done>
                  <button type="button" class="ptw__btn" @click="evalQuizOpen = false">收起</button>
                </template>
              </PtwQuizPanel>

              <p class="ptw__faint" style="margin-top: 16px;">
                角色设定大改时才需要换代考卷：
                <button type="button" class="ptw__link ptw__link--muted" @click="confirmState = { kind: 'regen' }">重新生成整卷（评测集随之换代）…</button>
              </p>
            </template>
          </section>

          <!-- ============ 安装与版本 ============ -->
          <section v-else-if="step === 'install'" class="ptw-step" style="max-width: 780px;">
            <h3 class="ptw-step__h">安装与版本</h3>
            <p class="ptw-step__sub">训练完成的模型先保存为版本，安装后才进入回复链路；旧版本保留，可随时切换回去。</p>

            <!-- 导入其它角色导出的模型包：存为新版本，不自动安装，避免覆盖当前版本 -->
            <div class="ptw__row-actions" style="margin: 0 0 14px;">
              <button type="button" class="ptw__btn" :disabled="importingModelPackage" @click="pickModelPackage">
                {{ importingModelPackage ? '正在导入…' : '导入模型包' }}
              </button>
              <span class="ptw__faint">导入其它角色导出的模型包（zip），保存为新版本（不自动安装）。</span>
              <input ref="modelPackageInputRef" type="file" accept=".zip,application/zip" style="display: none;" @change="handleModelPackageFile">
            </div>

            <!-- 影子模式观察摘要（仅记录排序差异，不展示训练日志） -->
            <template v-if="shadowConfig">
              <div class="ptw-step__sec">
                影子模式 · {{ shadowConfig.versionLabel }} 观察中
                <span class="ptw__tag ptw__tag--plain">不影响实际回复</span>
                <button type="button" class="ptw__link ptw__link--muted" style="margin-left: auto; font-size: 0.76rem;" @click="stopShadow">结束观察</button>
              </div>
              <p class="ptw__faint" style="margin: 0 0 8px;">
                {{ shadowLog.total
                  ? `最近 ${shadowLog.total} 次排序中，新旧模型首选一致 ${shadowLog.agree} 次；不一致差异如下（最多保留 30 条）。`
                  : '尚无记录：在聊天中使用该角色的人格模型回复后，这里会出现新旧模型的排序差异。' }}
              </p>
              <div v-if="shadowLog.diffs.length" class="ptw__checklist">
                <div v-for="(diff, i) in shadowLog.diffs" :key="i" class="ptw__shadow-diff">
                  <span class="ptw__shadow-scene">{{ diff.situationExcerpt }}</span>
                  <span class="ptw__shadow-old">{{ diff.basePick }}</span>
                  <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" style="color: var(--morandi-text-light, #b3ada3); flex-shrink: 0; align-self: center;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                  <span class="ptw__shadow-new">{{ diff.shadowPick }}</span>
                </div>
              </div>
            </template>

            <div v-if="!visibleVersions.length" class="ptw__empty">
              <div class="ptw__empty-title">还没有模型版本</div>
              <div class="ptw__empty-desc">训练完成或上传模型包后，版本会出现在这里。</div>
            </div>

            <template v-else>
              <div class="ptw__vtable">
                <div class="ptw__vrow ptw__vrow--head">
                  <span>版本 / 时间</span><span>来源</span><span>后端</span><span>冻结命中</span><span>状态</span><span></span>
                </div>
                <div v-for="version in visibleVersions" :key="version.versionId" class="ptw__vrow" :class="{ 'ptw__vrow--archived': version.status === 'archived' }">
                  <span class="ptw__vcell" data-label="版本">
                    <span class="ptw__vname">{{ versionDisplayName(version) }}</span>
                    <span class="ptw__vsub">{{ formatVersionTime(version.createdAt) }}</span>
                  </span>
                  <span class="ptw__vcell" data-label="来源">{{ sourceLabel(version) }}</span>
                  <span class="ptw__vcell" data-label="后端">{{ backendLabel(version) }}</span>
                  <span class="ptw__vcell" data-label="冻结命中">
                    {{ formatPercentMetric(version.metrics?.testGroupAccuracy) }}
                    <span v-if="version.metrics?.evaluationSetId" class="ptw__vsub">{{ version.metrics.evaluationSetId }}</span>
                  </span>
                  <span class="ptw__vcell" data-label="状态">
                    <span class="ptw__tag" :class="versionStatusTagClass(version)">{{ versionStatusLabel(version) }}</span>
                    <span v-if="shadowConfig?.versionId === version.versionId" class="ptw__tag ptw__tag--plain" style="margin-left: 4px;">影子观察中</span>
                  </span>
                  <span class="ptw__vcell ptw__vcell--acts">
                    <button
                      v-if="version.status !== 'installed' && version.status !== 'archived'"
                      type="button"
                      class="ptw__link"
                      @click="confirmState = { kind: 'install', version }"
                    >安装</button>
                    <button
                      v-if="version.status === 'installed' && rollbackTarget"
                      type="button"
                      class="ptw__link ptw__link--muted"
                      @click="confirmState = { kind: 'install', version: rollbackTarget }"
                    >回退</button>
                    <button
                      v-if="canShadowObserve(version)"
                      type="button"
                      class="ptw__icon-btn"
                      style="color: var(--morandi-text-light, #7b746b);"
                      title="开启影子模式观察"
                      @click="startShadow(version)"
                    >
                      <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <button
                      v-if="version.status !== 'archived'"
                      type="button"
                      class="ptw__icon-btn"
                      :title="exportingVersionId === version.versionId ? '正在导出…' : '导出模型包（可导入其它角色）'"
                      :disabled="exportingVersionId === version.versionId"
                      @click="exportVersion(version)"
                    >
                      <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg>
                    </button>
                    <button
                      v-if="version.status !== 'archived'"
                      type="button"
                      class="ptw__icon-btn"
                      title="删除版本"
                      @click="requestDeleteVersion(version)"
                    >
                      <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                  </span>
                </div>
              </div>
              <div class="ptw__row-actions" style="margin-top: 10px;">
                <button v-if="archivedCount > 0" type="button" class="ptw__link ptw__link--muted" @click="showArchived = !showArchived">
                  {{ showArchived ? '隐藏已归档' : `显示已归档（${archivedCount}）` }}
                </button>
                <span class="ptw__faint">影子模式只在桌面端运行：开启后聊天中使用人格模型回复时，会旁路记录新旧模型的排序差异，观察结束即释放影子模型。</span>
              </div>
            </template>
          </section>
        </div>

        <footer class="ptw__foot">
          <span class="ptw__draft-note">{{ draftNote }}</span>
          <span v-if="hasActiveBackgroundWork" class="ptw__background-note">
            <span class="ptw__spinner ptw__spinner--tiny"></span>{{ backgroundActivityLabel }}
          </span>
          <button type="button" class="ptw__link ptw__link--muted" @click="requestClose">
            {{ hasActiveBackgroundWork ? '转入后台' : '保存草稿并离开' }}
          </button>
          <span class="ptw__foot-spacer"></span>
          <button type="button" class="ptw__btn" :disabled="stepIndex <= 0" @click="goStep(steps[stepIndex - 1].id)">上一步</button>
          <button v-if="stepIndex < steps.length - 1" type="button" class="ptw__btn ptw__btn--primary" @click="goStep(steps[stepIndex + 1].id)">下一步</button>
          <button v-else type="button" class="ptw__btn ptw__btn--primary" @click="finishAndClose">完成</button>
        </footer>

        <!-- 训练日志抽屉（次级入口，不常驻） -->
        <div v-if="logDrawerOpen" class="ptw__logdrawer">
          <div class="ptw__logdrawer-head">
            <span>训练日志</span>
            <button type="button" class="ptw__icon-btn" style="color: var(--morandi-text-light, #7b746b);" @click="logDrawerOpen = false">
              <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
          </div>
          <pre class="ptw__logdrawer-body">{{ logText || '暂无日志' }}</pre>
        </div>
      </main>
    </div>
  </AppModalShell>

  <!-- 二次确认弹层 -->
  <PtwConfirmDialog
    :open="confirmState?.kind === 'regen'"
    title="重新生成整卷？"
    confirm-text="仍要重新生成"
    require-type="重新生成"
    @cancel="confirmState = null"
    @confirm="doRegenerate"
  >
    将派遣设问按正式协议重新生成全部训练题；<b>已作答记录将被清空</b>，冻结评测集随之换代（旧考卷退役留台账），新旧版本指标因「考卷不同」不可直接对比。这通常只在角色设定大改时才需要。
  </PtwConfirmDialog>

  <PtwConfirmDialog
    :open="confirmState?.kind === 'install'"
    :title="`安装 ${confirmState?.version ? versionDisplayName(confirmState.version) : ''}？`"
    confirm-text="安装"
    @cancel="confirmState = null"
    @confirm="doInstallVersion"
  >
    安装后该版本将进入此角色的回复链路；当前版本保留，可随时切换回去。
    <template v-if="installAdvice"><br><b>{{ installAdvice }}</b></template>
  </PtwConfirmDialog>

  <PtwConfirmDialog
    :open="confirmState?.kind === 'delete'"
    :title="`删除版本 ${confirmState?.version ? versionDisplayName(confirmState.version) : ''}？`"
    confirm-text="删除"
    danger
    @cancel="confirmState = null"
    @confirm="doDeleteVersion"
  >
    模型文件将被移除，版本转入归档台账；训练数据集与已答题记录保留，可随时重新训练。
  </PtwConfirmDialog>

  <PtwConfirmDialog
    :open="confirmState?.kind === 'delete-installed'"
    title="无法直接删除当前安装版本"
    confirm-text="知道了"
    @cancel="confirmState = null"
    @confirm="confirmState = null"
  >
    该版本正在此角色的回复链路中使用。请先<b>安装其他版本</b>，或在角色编辑里把「回复链路」切离人格模型 / 删除当前模型，再删除此版本。
  </PtwConfirmDialog>

  <PtwConfirmDialog
    :open="confirmState?.kind === 'leave'"
    :title="hasActiveBackgroundWork ? '转入后台并关闭？' : '保存草稿并离开？'"
    :confirm-text="hasActiveBackgroundWork ? '转入后台' : '保存并离开'"
    @cancel="confirmState = null"
    @confirm="doClose"
  >
    <template v-if="hasActiveBackgroundWork">
      {{ backgroundActivityLabel }}。关闭只退出工作台，不会取消任务；设问每 10 题继续落库并在结束后向鉴心会话发回报，本机训练与评测完成后也会写回正式结果。
    </template>
    <template v-else>
      当前进度（制卷结果、已答题、评测作答）已自动保存为草稿，下次打开可继续。
    </template>
  </PtwConfirmDialog>

  <PtwConfirmDialog
    :open="confirmState?.kind === 'experimental'"
    title="只能训练实验模型"
    confirm-text="仍要训练实验模型"
    @cancel="confirmState = null"
    @confirm="doStartTraining(true)"
  >
    有效答案 <b>{{ answerCounts.resolved }}</b> 题（人工 {{ answerCounts.confirmed }}，预设代选 {{ answerCounts.preset }}），不足 {{ MIN_FORMAL_TRAINING_GROUPS }} 题。本次训练只能产出<b>实验模型</b>：可保存、可删除，但不能安装到正式回复链路。
  </PtwConfirmDialog>

  <PtwConfirmDialog
    :open="confirmState?.kind === 'cancel-run'"
    title="取消当前训练？"
    confirm-text="取消训练"
    danger
    @cancel="confirmState = null"
    @confirm="doCancelRun"
  >
    训练进程将被终止，本次任务记为失败；数据集与已答题记录不受影响，可随时重新发起。
  </PtwConfirmDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppModalShell from '../../../../common/AppModalShell.vue'
import PtwConfirmDialog from './PtwConfirmDialog.vue'
import PtwQuizPanel from './PtwQuizPanel.vue'
import PtwCalibrationPanel from './PtwCalibrationPanel.vue'
import WorkspaceAgentShell from '../../../workspaceAgent/WorkspaceAgentShell.vue'
import type { PersonalityCalibrationSample } from '../../../../../app/personalityCalibration'
import { useAI } from '../../../../../composables/useAI'
import { useSettingStore } from '../../../../../stores/settingStore'
import { useCharacterStore } from '../../../../../stores/characterStore'
import { useResizablePanel } from '../../../../../composables/app/useResizablePanel'
import type { WorkspaceAgentTurnRunner } from '../../../../../composables/useWorkspaceAgentController'
import {
  buildAgentConversationModelAiOptions,
  normalizeAgentConversationModelSelection
} from '../../../../../app/agentConversationModelSelection'
import { toOpenAiTools } from '../../../../../app/agentRuntime/toolRegistry'
import {
  readAgentConversationContinuation,
  saveAgentConversationDeferredTools,
  saveAgentConversationTaskTodo
} from '../../../../../app/agentRuntime/conversationContinuation'
import { runPersonalityTrainerAgent } from '../../../../../app/personalityTrainerAgentHarness'
import {
  isPersonalityQuestionBatchConfirmation,
  PERSONALITY_QUESTION_AUTHOR_DISPATCH_CONFIRM_TITLE,
  summarizePersonalityQuestionCollection,
  type PersonalityTrainingAgentProvider,
  type PersonalityTrainingQuestionScope
} from '../../../../../app/personalityTrainingAgentTools'
import {
  buildPersonalityTrainerScopeKey,
  createScopeConfirmWriteChannel,
  findScopeState
} from '../../../../../app/workspaceAgentScopeState'
import {
  PERSONALITY_QUESTION_AUTHOR_AGENT_NAME,
  renderPersonalityQuestionAuthorNotice,
  runPersonalityQuestionAuthorSubagent,
  type PersonalityQuestionAuthorMode,
  type PersonalityQuestionAuthorResult
} from '../../../../../app/personalityQuestionAuthorSubagent'
import { createSessionSubagentControlCapability } from '../../../../../app/agentRuntime/subagentControl'
import { buildPersonalityQuestionHistorySnapshot } from '../../../../../app/personalityQuestionHistory'
import {
  buildJianxinQuestionAuthorRecoveryDecision,
  type JianxinQuestionAuthorRecoveryDecision
} from '../../../../../app/personalityQuestionAuthorParentRecovery'
import { appendWorkspaceAgentBackgroundMessage } from '../../../../../app/workspaceAgentBackgroundMessages'
import {
  ensureWorkspaceAgentChatSession,
  fetchChatSessionBundleById
} from '../../../../../repositories/chatRepository'
import {
  MIN_FORMAL_TRAINING_GROUPS,
  PERSONALITY_FAILURE_STAGE_LABELS,
  PERSONALITY_TRAINING_BACKEND_LABELS,
  PERSONALITY_TRAINING_STAGES,
  PERSONALITY_VERSION_SOURCE_LABELS,
  PERSONALITY_VERSION_STATUS_LABELS,
  buildCalibrationSamplesFromDataset,
  buildCompletedPersonalityCalibrationReviewPromptSnapshot,
  buildQuestionnaireCheckpointPromptSnapshot,
  buildQuestionnaireFailurePromptSnapshot,
  buildPersonalityQuestionBatchPromptSnapshot,
  buildQuestionnaireResumeDraft,
  buildQuestionnaireSuccessPromptSnapshot,
  countResolvedQuestionAnswers,
  formatPercentMetric,
  formatVersionTime,
  isActiveTrainingRun,
  personalityTrainingApi,
  readQuestionnaireGenerationCheckpoint,
  resolvePersonalityQuestionAnswer,
  resolvePersonalityQuestionDimension,
  runPersonalityEvaluation,
  runPersonalityQuestionnaireGeneration,
  reconcilePersonalityCalibrationPromptAfterQuestionDeletion,
  summarizePersonalityAdaptiveCalibration,
  type PersonalityAnswerMap,
  type PersonalityChatMessageCandidate,
  type PersonalityChatMessageList,
  type PersonalityEvaluationQuestionResult,
  type PersonalityEvaluationSet,
  type PersonalityQuestionnaireGenerationProgress,
  type PersonalityQuestionnaireGenerationDiagnostic,
  type PersonalityCalibrationRoundReview,
  type PersonalityModelVersion,
  type PersonalityPrecheckResult,
  type PersonalityQuestionGroup,
  type PersonalityTrainingDataset,
  type PersonalityTrainingRun
} from '../../../../../app/personalityTrainingWorkflow'
import {
  buildPersonalityTrainingBackgroundTaskKey,
  getPersonalityTrainingBackgroundTask,
  listPersonalityTrainingBackgroundTasks,
  runPersonalityTrainingBackgroundTask
} from '../../../../../app/personalityTrainingBackgroundTasks'
import {
  getPersonalityShadowConfig,
  getPersonalityShadowLog,
  startPersonalityShadowObservation,
  stopPersonalityShadowObservation,
  type PersonalityShadowConfig,
  type PersonalityShadowLog
} from '../../../../../app/personalityShadowMode'
import {
  PERSONALITY_CALIBRATION_ROUND_SIZE,
  buildDefaultPersonalityQuestionnaireDimensionPlan
} from '../../../../../../shared/personalityQuestionnaireDesign'

// 人格模型训练工作台（第 3 批骨架）：
// 七步导航按 CD 设计稿校验后的结构实现；来源 / 设问 / 选择 / 样本 / 评测 / 安装接真实接口，
// 训练执行（第 4-5 批）、聊天消息选择（第 6 批）、指标与影子模式（第 7 批）保留明确占位，不造假状态。
type StepId = 'source' | 'gen' | 'answer' | 'samples' | 'train' | 'eval' | 'install'
type WorkbenchMode = 'train' | 'optimize' | 'versions'
type ConfirmState = { kind: 'regen' | 'install' | 'delete' | 'delete-installed' | 'leave' | 'experimental' | 'cancel-run'; version?: PersonalityModelVersion } | null
type DimensionQuestionRow = { group: PersonalityQuestionGroup; questionNumber: number }
type DimensionRow = { name: string; count: number; questions: DimensionQuestionRow[]; preview: DimensionQuestionRow[] }

const props = withDefaults(defineProps<{
  open: boolean
  characterId: string
  characterName?: string
  mode?: WorkbenchMode
  refreshToken?: number
  zIndex?: number | string
}>(), {
  characterName: '',
  mode: 'train',
  refreshToken: 0,
  zIndex: 13120
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toast', message: string, type: 'success' | 'error'): void
  (e: 'model-path-changed', path: string): void
  (e: 'upload-model'): void
}>()

const settingStore = useSettingStore()
const characterStore = useCharacterStore()
const ai = useAI()
const { callAI } = ai

const steps: Array<{ id: StepId; label: string }> = [
  { id: 'source', label: '来源' },
  { id: 'gen', label: '设问' },
  { id: 'answer', label: '选择' },
  { id: 'samples', label: '样本' },
  { id: 'train', label: '训练' },
  { id: 'eval', label: '评测' },
  { id: 'install', label: '安装' }
]

const personalityTrainerScopeKey = computed(() => buildPersonalityTrainerScopeKey(props.characterId))
const personalityTrainerViewScopeKey = computed(() => props.characterId
  ? personalityTrainerScopeKey.value
  : 'personality-trainer:unavailable')
const {
  panelStyle: personalityTrainerPanelStyle,
  startResize: startPersonalityTrainerResize
} = useResizablePanel({
  storageKey: 'langhuan_personality_training_agent_width',
  defaultWidth: 340,
  minWidth: 280,
  maxWidth: 500
})
const personalityTrainerCollapsed = ref(false)

const step = ref<StepId>('source')
const loading = ref(false)
const loadError = ref('')
const datasets = ref<PersonalityTrainingDataset[]>([])
const versions = ref<PersonalityModelVersion[]>([])
const evalSets = ref<PersonalityEvaluationSet[]>([])
const currentDatasetId = ref('')
const answersLocal = ref<PersonalityAnswerMap>({})
const evalAnswersLocal = ref<PersonalityAnswerMap>({})
const creatingDataset = ref(false)
const generateError = ref('')
const openDimension = ref('')
const expandedDimensionQuestions = ref<Record<string, boolean>>({})
const trainMethod = ref<'local' | 'colab_out' | 'colab_in'>('local')
const evalQuizOpen = ref(false)
const evaluationLiveResults = ref<PersonalityEvaluationQuestionResult[]>([])
const showArchived = ref(false)
const confirmState = ref<ConfirmState>(null)
const lastSavedAt = ref<Date | null>(null)
const precheck = ref<PersonalityPrecheckResult | null>(null)
const precheckLoading = ref(false)
const runs = ref<PersonalityTrainingRun[]>([])
const startingRun = ref(false)
const logDrawerOpen = ref(false)
const logText = ref('')
const exportingPack = ref(false)
const exportingVersionId = ref('')
const importingModelPackage = ref(false)
const modelPackageInputRef = ref<HTMLInputElement | null>(null)
const importingRunId = ref('')
const pendingImportRunId = ref('')
const colabFileInputRef = ref<HTMLInputElement | null>(null)
const sourceMode = ref<'profile' | 'chat'>('profile')
const msgPickerOpen = ref(false)
const msgLoading = ref(false)
const msgData = ref<PersonalityChatMessageList | null>(null)
const msgSessionFilter = ref('')
const selectedMsgs = ref<Record<string, boolean>>({})
const projectingKeys = ref<Set<string>>(new Set())

let answerSaveTimer: ReturnType<typeof setTimeout> | null = null
let evalSaveTimer: ReturnType<typeof setTimeout> | null = null
let runPollTimer: ReturnType<typeof setInterval> | null = null
let runPollContext = ''
/** 鉴心当轮会话只在派遣瞬间读取；设问接单后不再依赖主 loop 生命周期。 */
let activeJianxinTurnSessionId = ''
/** 设问终态自动唤醒鉴心时的受限授权；只允许同数据集 resume + 非空 correctionBrief。 */
let activeJianxinQuestionAuthorRecovery: JianxinQuestionAuthorRecoveryContext | null = null
let pendingJianxinQuestionAuthorRecovery: JianxinQuestionAuthorRecoveryContext | null = null
const handledJianxinQuestionAuthorRecoveryTaskIds = new Set<string>()
let loadRequestSequence = 0

const trainingStages = PERSONALITY_TRAINING_STAGES

const stepIndex = computed(() => steps.findIndex((item) => item.id === step.value))
const currentDataset = computed(() => datasets.value.find((item) => item.datasetId === currentDatasetId.value) || null)
const questionGroups = computed<PersonalityQuestionGroup[]>(() => currentDataset.value?.questionGroups || [])
const generationCheckpoint = computed(() => readQuestionnaireGenerationCheckpoint(currentDataset.value?.promptSnapshot))
const generationInProgress = computed(() => Boolean(generationCheckpoint.value))
const generationTaskKey = computed(() => buildPersonalityTrainingBackgroundTaskKey(
  'questionnaire_generation',
  props.characterId,
  currentDataset.value?.datasetId || ''
))
const generationTask = computed(() => getPersonalityTrainingBackgroundTask(generationTaskKey.value))
const generating = computed(() => generationTask.value?.status === 'running')
const generationProgress = computed<PersonalityQuestionnaireGenerationProgress | null>(() => {
  const progress = generationTask.value?.progress
  if (!progress?.stage) return null
  return {
    stage: progress.stage as PersonalityQuestionnaireGenerationProgress['stage'],
    done: Number(progress.done) || 0,
    total: Number(progress.total) || 0,
    label: String(progress.label || '')
  }
})
const questionGroupsForView = computed<PersonalityQuestionGroup[]>(() => {
  const plan = currentDataset.value?.dimensionPlan || []
  return questionGroups.value.map((group, index) => ({
    ...group,
    dimension: resolvePersonalityQuestionDimension(group.dimension, plan, index + 1, 'training') || '未分维度'
  }))
})
const targetGroupCount = computed(() => Number((currentDataset.value?.promptSnapshot as any)?.targetTrainingGroupCount || 20))
const answerCounts = computed(() => countResolvedQuestionAnswers(questionGroups.value, answersLocal.value))
const adaptiveCalibration = computed(() => summarizePersonalityAdaptiveCalibration({
  questionGroups: questionGroups.value,
  answers: answersLocal.value,
  promptSnapshot: (currentDataset.value?.promptSnapshot || {}) as Record<string, unknown>
}))
const latestCalibrationRound = computed(() => (
  adaptiveCalibration.value.rounds[adaptiveCalibration.value.rounds.length - 1] || null
))
// 性格校准只使用人工确认样本：与星依 calibratePersonality、鉴心写回工具一处真值。
const calibrationSamples = computed<PersonalityCalibrationSample[]>(() => buildCalibrationSamplesFromDataset({
  dimensionPlan: currentDataset.value?.dimensionPlan || [],
  questionGroups: questionGroups.value,
  answers: answersLocal.value
}))
const canFormal = computed(() => answerCounts.value.resolved >= MIN_FORMAL_TRAINING_GROUPS)
const activeEvalSet = computed(() => evalSets.value.find((item) => item.status === 'active') || null)
const evalQuestions = computed<PersonalityQuestionGroup[]>(() => activeEvalSet.value?.questions || [])
const evalAnswerCounts = computed(() => countResolvedQuestionAnswers(evalQuestions.value, evalAnswersLocal.value))
const retiredEvalSetCount = computed(() => evalSets.value.filter((item) => item.status === 'retired').length)
const archivedCount = computed(() => versions.value.filter((item) => item.status === 'archived').length)
const visibleVersions = computed(() => versions.value.filter((item) => showArchived.value || item.status !== 'archived'))
const installedVersion = computed(() => versions.value.find((item) => item.status === 'installed') || null)
const installedVersionLabel = computed(() => installedVersion.value ? `${versionDisplayName(installedVersion.value)} · 已安装` : '未安装')
const genProgressPercent = computed(() => {
  if (!generationCheckpoint.value) return questionGroups.value.length ? '100%' : '0%'
  const target = generationCheckpoint.value.targetTrainingGroupCount + generationCheckpoint.value.targetEvaluationQuestionCount
  const done = questionGroups.value.length + generationCheckpoint.value.completedEvaluationCount
  return `${Math.min(100, Math.round((done / Math.max(1, target)) * 100))}%`
})

const datasetStatusLabelMap: Record<string, string> = {
  draft: '草稿',
  questionnaire_generating: '设问制卷中·可续跑',
  questionnaire_ready: '已制卷',
  ready: '可训练',
  archived: '已归档'
}

const datasetStatusLabel = computed(() => {
  if (!currentDataset.value) return '未创建'
  return datasetStatusText(currentDataset.value.status)
})

function datasetStatusText(status: unknown) {
  const key = String(status || '')
  return datasetStatusLabelMap[key] || key || '—'
}

const dimensionRows = computed<DimensionRow[]>(() => {
  const order: string[] = []
  const grouped = new Map<string, DimensionQuestionRow[]>()
  for (const [index, group] of questionGroupsForView.value.entries()) {
    const name = String(group.dimension || '未分维度')
    if (!grouped.has(name)) {
      grouped.set(name, [])
      order.push(name)
    }
    grouped.get(name)!.push({ group, questionNumber: index + 1 })
  }
  return order.map((name) => {
    const items = grouped.get(name)!
    return { name, count: items.length, questions: items, preview: items.slice(0, 3) }
  })
})

function visibleDimensionQuestions(dimension: DimensionRow) {
  return expandedDimensionQuestions.value[dimension.name] ? dimension.questions : dimension.preview
}

function toggleDimensionQuestions(dimensionName: string) {
  expandedDimensionQuestions.value = {
    ...expandedDimensionQuestions.value,
    [dimensionName]: !expandedDimensionQuestions.value[dimensionName]
  }
}

function resolvedDimensionAnswer(group: PersonalityQuestionGroup) {
  return resolvePersonalityQuestionAnswer(group, answersLocal.value)
}

const answeredDimensionCount = computed(() => {
  const answered = new Set<string>()
  for (const group of questionGroupsForView.value) {
    if (resolvePersonalityQuestionAnswer(group, answersLocal.value)) {
      answered.add(String(group.dimension || '未分维度'))
    }
  }
  return answered.size
})

const posNegRatio = computed(() => {
  let pos = 0
  let neg = 0
  for (const group of questionGroups.value) {
    if (resolvePersonalityQuestionAnswer(group, answersLocal.value)) {
      pos += 1
      neg += Math.max(0, (group.candidates?.length || 0) - 1)
    }
  }
  return pos ? `${pos} : ${neg}` : '—'
})

const splitSummary = computed(() => {
  const manifest = currentDataset.value?.splitManifest
  const train = manifest?.trainGroupIds?.length || 0
  const valid = manifest?.validGroupIds?.length || 0
  return train + valid > 0 ? `${train} / ${valid}` : '—'
})

// 评测目标版本：默认选最新的可评测版本（有模型文件且未归档），优先未安装的新版本
const evalVersionId = ref('')

const evaluableVersions = computed(() => versions.value.filter((version) => version.status !== 'archived' && version.modelPath))
const evalSelectedVersion = computed(() => evaluableVersions.value.find((version) => version.versionId === evalVersionId.value) || null)
const evalTaskKey = computed(() => buildPersonalityTrainingBackgroundTaskKey(
  'evaluation',
  props.characterId,
  evalSelectedVersion.value?.versionId || '',
  activeEvalSet.value?.evalSetId || ''
))
const evalTask = computed(() => getPersonalityTrainingBackgroundTask(evalTaskKey.value))
const evalRunning = computed(() => evalTask.value?.status === 'running')
const evalRunProgress = computed(() => {
  const progress = evalTask.value?.progress
  return progress?.total ? `${Number(progress.done) || 0} / ${progress.total}` : ''
})
const evalSelectedMetrics = computed(() => (evalSelectedVersion.value?.metrics || {}) as Record<string, any>)
const evalMetricsMismatch = computed(() => {
  const metricsSetId = String(evalSelectedMetrics.value.evaluationSetId || '')
  return Boolean(metricsSetId && activeEvalSet.value && metricsSetId !== activeEvalSet.value.evalSetId)
})
const persistedEvaluationQuestionResults = computed<PersonalityEvaluationQuestionResult[]>(() => (
  Array.isArray(evalSelectedMetrics.value.evaluationQuestionResults)
    ? evalSelectedMetrics.value.evaluationQuestionResults as PersonalityEvaluationQuestionResult[]
    : []
))
const evalDisplayedQuestionResults = computed(() => (
  evalRunning.value
    ? evaluationLiveResults.value
    : (!evalMetricsMismatch.value ? persistedEvaluationQuestionResults.value : [])
))
const evalResultsStale = computed(() => {
  if (evalMetricsMismatch.value || !persistedEvaluationQuestionResults.value.length || !activeEvalSet.value) return false
  const evaluatedAt = Date.parse(String(evalSelectedMetrics.value.evaluatedAt || ''))
  const updatedAt = Date.parse(String(activeEvalSet.value.updatedAt || ''))
  return Number.isFinite(evaluatedAt) && Number.isFinite(updatedAt) && updatedAt > evaluatedAt
})

const metricCards = computed(() => {
  const metrics = evalSelectedMetrics.value
  const metricsSetId = String(metrics.evaluationSetId || '')
  const setNote = metricsSetId ? `评测集 ${metricsSetId}` : '尚未评测'
  return [
    { label: '验证组准确率', value: formatPercentMetric(metrics.validGroupAccuracy), footnote: '验证组 · 训练集划分' },
    { label: '冻结评测集命中率', value: formatPercentMetric(metrics.testGroupAccuracy), footnote: setNote },
    { label: '首选命中率', value: formatPercentMetric(metrics.top1Accuracy), footnote: setNote }
  ]
})

function ensureEvalVersionSelection() {
  if (evaluableVersions.value.some((version) => version.versionId === evalVersionId.value)) return
  const preferred = evaluableVersions.value.find((version) => version.status !== 'installed') || evaluableVersions.value[0]
  evalVersionId.value = preferred?.versionId || ''
}

function formatEvaluationScore(value: unknown) {
  const score = Number(value)
  return Number.isFinite(score) ? score.toFixed(3) : '—'
}

function launchEvaluationTask(version: PersonalityModelVersion, evalSet: PersonalityEvaluationSet) {
  const characterId = String(props.characterId || '').trim()
  const versionId = version.versionId
  const evalSetId = evalSet.evalSetId
  const taskKey = buildPersonalityTrainingBackgroundTaskKey('evaluation', characterId, versionId, evalSetId)
  const questions = [...(evalSet.questions || [])]
  const answers = { ...evalAnswersLocal.value }
  const baseMetrics = { ...((version.metrics || {}) as Record<string, unknown>) }
  evaluationLiveResults.value = []
  evalQuizOpen.value = false
  const promise = runPersonalityTrainingBackgroundTask({
    key: taskKey,
    kind: 'evaluation',
    characterId,
    resourceId: `${versionId}:${evalSetId}`,
    run: async (updateTask) => {
      const result = await runPersonalityEvaluation({
        modelPath: version.modelPath,
        questions,
        answers,
        onProgress: (done, total) => {
          updateTask({ progress: { stage: 'evaluation', done, total, label: `评测 ${done}/${total}` } })
        },
        onQuestionResult: (result) => {
          if (String(props.characterId || '').trim() !== characterId || evalVersionId.value !== versionId) return
          evaluationLiveResults.value = [...evaluationLiveResults.value, result]
        }
      })
      const updated = await personalityTrainingApi.saveModelVersionMetrics(characterId, versionId, {
        ...baseMetrics,
        evaluationSetId: evalSetId,
        testGroupAccuracy: result.top1Accuracy,
        top1Accuracy: result.top1Accuracy,
        evalMrr: result.mrr,
        evaluatedGroups: result.evaluatedGroups,
        evaluationPerformanceBudgetRatio: result.performanceBudgetRatio,
        evaluationQuestionResults: result.questionResults,
        evaluatedAt: new Date().toISOString()
      })
      return { result, updated }
    }
  })
  void promise.then((outcome) => {
    if (props.characterId === characterId) {
      const index = versions.value.findIndex((item) => item.versionId === outcome.updated.versionId)
      if (index >= 0) versions.value.splice(index, 1, outcome.updated)
    }
    emit('toast', `评测完成：${outcome.result.evaluatedGroups} 题命中 ${outcome.result.top1Hits} 题（${Math.round(outcome.result.top1Accuracy * 100)}%）`, 'success')
  }).catch((error) => {
    if (String(props.characterId || '').trim() === characterId && evalVersionId.value === versionId) {
      evaluationLiveResults.value = []
    }
    emit('toast', `评测失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  })
  return getPersonalityTrainingBackgroundTask(taskKey)
}

async function runEvaluationForVersion() {
  const version = evalSelectedVersion.value
  const evalSet = activeEvalSet.value
  if (!version || !evalSet || evalRunning.value) return null
  await flushEvalSave()
  return launchEvaluationTask(version, evalSet)
}

// latestRun 只看本机训练任务（Colab 任务有独立的等待导入区）
const latestRun = computed(() => runs.value.find((run) => run.backend === 'local') || null)
const activeRun = computed(() => runs.value.find((run) => run.backend === 'local' && isActiveTrainingRun(run)) || null)
const awaitingImportRuns = computed(() => runs.value.filter((run) => run.backend === 'colab_notebook' && run.status === 'awaiting_import'))
const activeClientBackgroundTasks = computed(() => listPersonalityTrainingBackgroundTasks(props.characterId)
  .filter((task) => task.status === 'running'))
const hasActiveBackgroundWork = computed(() => Boolean(activeRun.value) || activeClientBackgroundTasks.value.length > 0)
const backgroundActivityLabel = computed(() => {
  const labels: string[] = activeClientBackgroundTasks.value.map((task) => (
    task.kind === 'questionnaire_generation' ? '设问制卷' : '评测'
  ))
  if (activeRun.value) labels.push('训练')
  return `${[...new Set(labels)].join('、') || '任务'}正在后台运行`
})

function runStatsLabel(run: PersonalityTrainingRun) {
  const stats = ((run.metrics || {}) as Record<string, any>).stats || {}
  const train = Number(stats.trainGroups) || 0
  const valid = Number(stats.validGroups) || 0
  return train + valid > 0 ? `训练 ${train} 组 / 验证 ${valid} 组` : 'Colab 训练包'
}
const activeRunMessage = computed(() => {
  const metrics = (activeRun.value?.metrics || {}) as Record<string, unknown>
  return String(metrics.progressMessage || '训练进行中…')
})

function failureStageLabel(stage: unknown) {
  const key = String(stage || '')
  return PERSONALITY_FAILURE_STAGE_LABELS[key] || key || '训练'
}

// 阶段状态：metrics.progressStage 之前的为完成，相同为进行中，之后为待执行
function stageState(stageId: string, index: number) {
  const metrics = (activeRun.value?.metrics || {}) as Record<string, unknown>
  const current = String(metrics.progressStage || 'precheck')
  const currentIndex = trainingStages.findIndex((stage) => stage.id === current)
  if (currentIndex < 0) return index === 0 ? 'ptw__stage--now' : 'ptw__stage--pending'
  if (index < currentIndex) return 'ptw__stage--done'
  if (index === currentIndex) return 'ptw__stage--now'
  return 'ptw__stage--pending'
}

const stepDone = computed<Record<StepId, boolean>>(() => ({
  source: Boolean(currentDataset.value),
  gen: questionGroups.value.length > 0,
  answer: canFormal.value,
  samples: canFormal.value,
  train: latestRun.value?.status === 'succeeded',
  eval: Boolean(activeEvalSet.value) && evalQuestions.value.length > 0 && evalAnswerCounts.value.resolved >= evalQuestions.value.length,
  install: Boolean(installedVersion.value)
}))

const draftNote = computed(() => {
  if (!lastSavedAt.value) return '草稿自动保存'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `草稿已自动保存 · ${pad(lastSavedAt.value.getHours())}:${pad(lastSavedAt.value.getMinutes())}`
})

// 版本展示序号：按创建时间升序派生 v1/v2…，旧上传迁移版本显示“旧上传”。视图真值，不回写台账。
const versionSeqMap = computed(() => {
  const map = new Map<string, number>()
  const ascending = [...versions.value].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  ascending.forEach((item, index) => map.set(item.versionId, index + 1))
  return map
})

function versionDisplayName(version: PersonalityModelVersion) {
  if (String(version.versionId || '').startsWith('pmv_legacy_')) return '旧上传'
  const seq = versionSeqMap.value.get(version.versionId)
  return seq ? `v${seq}` : version.versionId
}

function versionStatusLabel(version: PersonalityModelVersion) {
  return PERSONALITY_VERSION_STATUS_LABELS[String(version.status || '')] || String(version.status || '—')
}

function versionStatusTagClass(version: PersonalityModelVersion) {
  if (version.status === 'installed') return 'ptw__tag--green'
  if (version.status === 'failed') return 'ptw__tag--red'
  if (version.status === 'archived') return ''
  return 'ptw__tag--plain'
}

function sourceLabel(version: PersonalityModelVersion) {
  const base = PERSONALITY_VERSION_SOURCE_LABELS[String(version.sourceKind || '')] || String(version.sourceKind || '—')
  const datasetCount = Array.isArray(version.sourceDatasetIds) ? version.sourceDatasetIds.length : 0
  return datasetCount > 0 ? `${base} · ${datasetCount} 个数据集` : base
}

function backendLabel(version: PersonalityModelVersion) {
  return PERSONALITY_TRAINING_BACKEND_LABELS[String(version.trainingBackend || '')] || String(version.trainingBackend || '—')
}

// ---------- 数据加载 ----------

async function loadAll() {
  const characterId = String(props.characterId || '').trim()
  if (!characterId) return
  loadRequestSequence += 1
  const requestSequence = loadRequestSequence
  loading.value = true
  loadError.value = ''
  try {
    const [versionList, datasetList, evalSetList, runList] = await Promise.all([
      personalityTrainingApi.listModelVersions(characterId),
      personalityTrainingApi.listDatasets(characterId),
      personalityTrainingApi.listEvaluationSets(characterId),
      personalityTrainingApi.listTrainingRuns(characterId)
    ])
    if (requestSequence !== loadRequestSequence || String(props.characterId || '').trim() !== characterId) return
    versions.value = versionList || []
    datasets.value = datasetList || []
    evalSets.value = evalSetList || []
    runs.value = runList || []
    if (!datasets.value.some((item) => item.datasetId === currentDatasetId.value)) {
      currentDatasetId.value = datasets.value[0]?.datasetId || ''
    }
    syncAnswersFromDataset()
    syncEvalAnswersFromSet()
    ensureRunPolling()
    const runningClientTask = listPersonalityTrainingBackgroundTasks(characterId)
      .find((task) => task.status === 'running')
    if (runningClientTask?.kind === 'questionnaire_generation') {
      if (datasets.value.some((item) => item.datasetId === runningClientTask.resourceId)) {
        currentDatasetId.value = runningClientTask.resourceId
      }
      step.value = 'gen'
    } else if (activeRun.value) {
      step.value = 'train'
    } else if (runningClientTask?.kind === 'evaluation') {
      step.value = 'eval'
    }
  } catch (error) {
    if (requestSequence !== loadRequestSequence || String(props.characterId || '').trim() !== characterId) return
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (requestSequence === loadRequestSequence && String(props.characterId || '').trim() === characterId) loading.value = false
  }
}

async function refreshVersions() {
  try {
    versions.value = await personalityTrainingApi.listModelVersions(props.characterId)
  } catch (error) {
    emit('toast', `读取模型版本失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

async function refreshEvalSets() {
  try {
    evalSets.value = await personalityTrainingApi.listEvaluationSets(props.characterId)
    syncEvalAnswersFromSet()
  } catch (error) {
    emit('toast', `读取评测集失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function syncAnswersFromDataset() {
  answersLocal.value = { ...(currentDataset.value?.answers || {}) }
}

function syncEvalAnswersFromSet() {
  evalAnswersLocal.value = { ...(activeEvalSet.value?.answers || {}) }
}

function replaceDataset(updated: PersonalityTrainingDataset | null | undefined) {
  if (!updated) return
  const index = datasets.value.findIndex((item) => item.datasetId === updated.datasetId)
  if (index >= 0) datasets.value.splice(index, 1, updated)
  else datasets.value.unshift(updated)
}

// ---------- 出题 ----------

async function persistGenerationFailure(
  characterId: string,
  dataset: PersonalityTrainingDataset,
  error: unknown,
  stage: string
) {
  try {
    const updated = await personalityTrainingApi.saveDatasetQuestionnaire(characterId, dataset.datasetId, {
      dimensionPlan: dataset.dimensionPlan || [],
      questionGroups: dataset.questionGroups || [],
      promptSnapshot: buildQuestionnaireFailurePromptSnapshot(dataset, error, stage || 'unknown'),
      sourceSummary: dataset.sourceSummary
    })
    if (props.characterId === characterId) {
      replaceDataset(updated)
      lastSavedAt.value = new Date()
    }
  } catch (persistError) {
    console.warn('保存出题失败诊断失败:', persistError)
  }
}

async function createDatasetAndGenerate() {
  if (creatingDataset.value) return
  creatingDataset.value = true
  try {
    const dataset = await personalityTrainingApi.createDatasetDraft(props.characterId, {})
    datasets.value.unshift(dataset)
    currentDatasetId.value = dataset.datasetId
    answersLocal.value = {}
    step.value = 'gen'
    void runGeneration({ agentMode: 'create_new' })
  } catch (error) {
    emit('toast', `创建训练数据集失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    creatingDataset.value = false
  }
}

async function resolveQuestionAuthorNotificationSessionId(preferredSessionId = '') {
  const preferred = String(preferredSessionId || '').trim()
  if (preferred) return preferred
  const scopeSessionId = String(findScopeState(personalityTrainerScopeKey.value)?.sessionId || '').trim()
  if (scopeSessionId) return scopeSessionId
  const bundle = await ensureWorkspaceAgentChatSession(
    'personality_trainer',
    String(props.characterId || '').trim(),
    '鉴心'
  )
  const ensuredSessionId = String(bundle?.session?.id || '').trim()
  if (!ensuredSessionId) throw new Error('无法建立鉴心会话，设问没有可投递的后台回报目标')
  return ensuredSessionId
}

type QuestionAuthorTaskOutcome = {
  draft: Awaited<ReturnType<typeof runPersonalityQuestionnaireGeneration>>
  dataset: PersonalityTrainingDataset
  evaluationSets: PersonalityEvaluationSet[]
  questionAuthorResult: PersonalityQuestionAuthorResult
}

type QuestionAuthorTaskError = Error & {
  questionAuthorResult?: PersonalityQuestionAuthorResult
  diagnostic?: PersonalityQuestionnaireGenerationDiagnostic
}

type JianxinQuestionAuthorRecoveryContext = {
  taskId: string
  taskKey: string
  characterId: string
  datasetId: string
  sessionId: string
  result: PersonalityQuestionAuthorResult
  notice: string
  recoveryDepth: number
  decision: JianxinQuestionAuthorRecoveryDecision
  dispatched: boolean
}

function createQuestionAuthorWaitCapability(characterId: string, sessionId: string) {
  return {
    validate(request: { taskIds: string[] }) {
      const requested = new Set(request.taskIds.map((taskId) => String(taskId || '').trim()).filter(Boolean))
      const runningTaskIds = listPersonalityTrainingBackgroundTasks(characterId)
        .filter((task) => (
          task.kind === 'questionnaire_generation'
          && task.status === 'running'
          && task.workerAgentName === PERSONALITY_QUESTION_AUTHOR_AGENT_NAME
          && task.notification?.sessionId === sessionId
          && requested.has(task.taskId)
        ))
        .map((task) => task.taskId)
      const missing = [...requested].filter((taskId) => !runningTaskIds.includes(taskId))
      return missing.length
        ? {
            ok: false,
            runningTaskIds,
            message: `不能静默候报：任务 ${missing.join('、')} 已经结束、归属别的会话，或没有正式回报通道。请消费最新【设问后台回报】，不要继续轮询。`
          }
        : { ok: runningTaskIds.length > 0, runningTaskIds }
    }
  }
}

async function runGeneration(options: {
  restart?: boolean
  extensionDraft?: {
    dimensionPlan: unknown[]
    questionGroups: PersonalityQuestionGroup[]
    evaluationQuestions: PersonalityQuestionGroup[]
  }
  agentMode?: PersonalityQuestionAuthorMode
  correctionBrief?: string
  notificationSessionId?: string
  /** 0=首次派遣；1=鉴心收到失败回报后的唯一一次自动续派。 */
  automaticRecoveryDepth?: number
} = {}) {
  const initialDataset = currentDataset.value
  if (!initialDataset) return null
  if (generating.value) return generationTask.value
  const characterId = String(props.characterId || '').trim()
  const characterName = String(props.characterName || '')
  const datasetId = initialDataset.datasetId
  const taskKey = buildPersonalityTrainingBackgroundTaskKey('questionnaire_generation', characterId, datasetId)
  const notificationScopeKey = buildPersonalityTrainerScopeKey(characterId)
  const notificationSessionId = await resolveQuestionAuthorNotificationSessionId(
    options.notificationSessionId || activeJianxinTurnSessionId
  )
  if (getPersonalityTrainingBackgroundTask(taskKey)?.status === 'running') {
    return getPersonalityTrainingBackgroundTask(taskKey)
  }
  generateError.value = ''
  const agentMode: PersonalityQuestionAuthorMode = options.agentMode
    || (options.restart ? 'restart_current' : options.extensionDraft ? 'append_batch' : 'resume')

  const taskPromise = runPersonalityTrainingBackgroundTask<QuestionAuthorTaskOutcome>({
    key: taskKey,
    kind: 'questionnaire_generation',
    characterId,
    resourceId: datasetId,
    workerAgentName: PERSONALITY_QUESTION_AUTHOR_AGENT_NAME,
    notification: {
      sessionId: notificationSessionId,
      deliver: async ({ snapshot, result, error }) => {
        const failedResult = (error as QuestionAuthorTaskError | undefined)?.questionAuthorResult
        const fallbackFailure: PersonalityQuestionAuthorResult = {
          ok: false,
          attempts: failedResult?.attempts || 0,
          draft: null,
          summary: error instanceof Error ? error.message : String(error || '设问后台制卷失败'),
          failure: failedResult?.failure || {
            message: error instanceof Error ? error.message : String(error || '设问后台制卷失败'),
            attempt: failedResult?.attempts || 0,
            retryable: true,
            diagnostic: (error as QuestionAuthorTaskError | undefined)?.diagnostic || null
          }
        }
        const terminalResult = result?.questionAuthorResult || failedResult || fallbackFailure
        const notice = renderPersonalityQuestionAuthorNotice({
          characterName,
          datasetId,
          result: terminalResult
        })
        await appendWorkspaceAgentBackgroundMessage({
          scopeKey: notificationScopeKey,
          sessionId: notificationSessionId,
          content: notice
        })
        scheduleJianxinQuestionAuthorRecovery({
          taskId: snapshot.taskId,
          taskKey,
          characterId,
          datasetId,
          sessionId: notificationSessionId,
          result: terminalResult,
          notice,
          recoveryDepth: Math.max(0, Math.trunc(Number(options.automaticRecoveryDepth) || 0))
        })
      }
    },
    run: async (updateTask) => {
      let workingDataset = initialDataset
      if (options.restart) {
        const cleared = await personalityTrainingApi.saveDatasetAnswers(characterId, datasetId, {}, {
          allowClearConfirmed: true,
          clearReason: 'restart_current'
        })
        if (cleared) workingDataset = cleared
        if (props.characterId === characterId) {
          answersLocal.value = {}
          replaceDataset(cleared)
        }
      }
      const taskId = getPersonalityTrainingBackgroundTask(taskKey)?.taskId || taskKey
      const questionAuthorResult = await runPersonalityQuestionAuthorSubagent({
        taskId,
        sessionId: notificationSessionId,
        characterName,
        datasetId,
        mode: agentMode,
        correctionBrief: String(options.correctionBrief || '').trim()
      }, {
        readQuestionHistory: async () => {
          const evaluationSets = await personalityTrainingApi.listEvaluationSets(characterId)
          const currentEvaluation = (evaluationSets || []).find((item) => item.status === 'active') || null
          return buildPersonalityQuestionHistorySnapshot({
            training: {
              resourceId: datasetId,
              questions: workingDataset.questionGroups || []
            },
            evaluation: {
              resourceId: currentEvaluation?.evalSetId || '',
              questions: currentEvaluation?.questions || options.extensionDraft?.evaluationQuestions || []
            }
          })
        },
        generateAttempt: async ({ attempt, correctionBrief, signal }) => {
          let lastStage = 'unknown'
          try {
            const finalPrompt = String((workingDataset.promptSnapshot as any)?.finalPrompt || '')
            const draft = await runPersonalityQuestionnaireGeneration({
              finalPrompt,
              promptSnapshot: (workingDataset.promptSnapshot || {}) as Record<string, unknown>,
              characterName,
              agentConfig: settingStore.getBrainAgentConfig(),
              callAI: callAI as any,
              correctionBrief,
              ...(signal ? { signal } : {}),
              resumeDraft: options.restart && attempt === 1
                ? null
                : (buildQuestionnaireResumeDraft(workingDataset) || options.extensionDraft || null),
              onProgress: (progress) => {
                lastStage = progress.stage
                updateTask({ progress })
              },
              onCheckpoint: async (checkpointDraft, checkpoint) => {
                const updated = await personalityTrainingApi.saveDatasetQuestionnaire(characterId, datasetId, {
                  dimensionPlan: checkpointDraft.dimensionPlan,
                  questionGroups: checkpointDraft.questionGroups,
                  promptSnapshot: buildQuestionnaireCheckpointPromptSnapshot(workingDataset, checkpoint),
                  sourceSummary: workingDataset.sourceSummary
                })
                workingDataset = updated
                if (props.characterId === characterId) {
                  replaceDataset(updated)
                  lastSavedAt.value = new Date()
                }
              }
            })
            return draft
          } catch (error) {
            await persistGenerationFailure(characterId, workingDataset, error, lastStage)
            throw error
          }
        },
        callModel: async ({ messages, toolBriefs, signal }) => {
          const response = await ai.callAIWithTools(messages as never, {
            ...buildAgentConversationModelAiOptions(
              settingStore.getBrainAgentConfig?.() as never,
              { slotId: 'balanced', effort: '' },
              { maxTokens: 4096, temperature: 0.25, thinking: 'enabled' }
            ),
            tools: toOpenAiTools(toolBriefs),
            feature: 'agent',
            logLabel: 'personality-question-author-background',
            usageLabel: '设问(人格问卷后台子Agent)',
            placeLabel: characterName || '人格模型训练',
            sessionId: notificationSessionId,
            sessionLabel: '设问',
            ...(signal ? { signal } : {}),
            registerAbortController: false
          })
          return { content: response?.content ?? '', toolCalls: response?.toolCalls ?? [] }
        }
      })

      if (!questionAuthorResult.ok || !questionAuthorResult.draft) {
        const taskError = new Error(questionAuthorResult.summary || '设问没有通过正式交卷协议') as QuestionAuthorTaskError
        if (questionAuthorResult.cancelled) taskError.name = 'AbortError'
        taskError.questionAuthorResult = questionAuthorResult
        if (questionAuthorResult.failure?.diagnostic) {
          taskError.diagnostic = questionAuthorResult.failure.diagnostic
        }
        await persistGenerationFailure(characterId, workingDataset, taskError, taskError.diagnostic?.stage || 'question_author')
        throw taskError
      }

      const draft = questionAuthorResult.draft
      const updated = await personalityTrainingApi.saveDatasetQuestionnaire(characterId, datasetId, {
        dimensionPlan: draft.dimensionPlan,
        questionGroups: draft.questionGroups,
        evaluationQuestions: draft.evaluationQuestions,
        promptSnapshot: buildQuestionnaireSuccessPromptSnapshot(workingDataset, draft),
        sourceSummary: workingDataset.sourceSummary
      })
      workingDataset = updated
      // 问卷保存层已经按仍存在的题目 ID 原子保留数据库中的最新答案。这里禁止再用派遣时的
      // 前端快照回写，更禁止 resume/自动纠错成功后写入空对象；否则会覆盖后台运行期间的新答案，
      // 或把此前几十道人工确认全部清空。明确 restart 时只在任务开始前清空一次。
      const evaluationSets = await personalityTrainingApi.listEvaluationSets(characterId)
      return {
        draft,
        dataset: workingDataset,
        evaluationSets,
        questionAuthorResult
      }
    }
  })

  void taskPromise.then((outcome) => {
    if (props.characterId === characterId) {
      replaceDataset(outcome.dataset)
      answersLocal.value = { ...(outcome.dataset.answers || {}) }
      evalSets.value = outcome.evaluationSets || []
      syncEvalAnswersFromSet()
      lastSavedAt.value = new Date()
    }
    emit('toast', `设问已交卷：${outcome.draft.questionGroups.length} 道训练题`, 'success')
  }).catch((error) => {
    if (props.characterId === characterId && currentDataset.value?.datasetId === datasetId) {
      generateError.value = error instanceof Error ? error.message : String(error)
    }
  })
  return getPersonalityTrainingBackgroundTask(taskKey)
}

function queueOrRunJianxinQuestionAuthorRecovery(context: JianxinQuestionAuthorRecoveryContext) {
  const state = findScopeState(buildPersonalityTrainerScopeKey(context.characterId))
  const sameSessionForegroundRunning = Boolean(
    state?.sessionId === context.sessionId && state.running
  )
  if (activeJianxinQuestionAuthorRecovery || sameSessionForegroundRunning) {
    pendingJianxinQuestionAuthorRecovery = context
    return
  }
  void runJianxinQuestionAuthorRecovery(context)
}

function scheduleJianxinQuestionAuthorRecovery(input: Omit<
  JianxinQuestionAuthorRecoveryContext,
  'decision' | 'dispatched'
>) {
  if (handledJianxinQuestionAuthorRecoveryTaskIds.has(input.taskId)) return
  handledJianxinQuestionAuthorRecoveryTaskIds.add(input.taskId)
  const decision = buildJianxinQuestionAuthorRecoveryDecision({
    result: input.result,
    notice: input.notice,
    recoveryDepth: input.recoveryDepth
  })
  queueOrRunJianxinQuestionAuthorRecovery({
    ...input,
    decision,
    dispatched: false
  })
}

async function runJianxinQuestionAuthorRecovery(context: JianxinQuestionAuthorRecoveryContext) {
  if (activeJianxinQuestionAuthorRecovery) {
    pendingJianxinQuestionAuthorRecovery = context
    return
  }
  activeJianxinQuestionAuthorRecovery = context
  const scopeKey = buildPersonalityTrainerScopeKey(context.characterId)
  const scopeState = findScopeState(scopeKey)
  const abortController = new AbortController()
  const bindsCurrentView = scopeState?.sessionId === context.sessionId
  if (bindsCurrentView && scopeState) {
    scopeState.running = true
    scopeState.abortController = abortController
  }

  try {
    // 自动接续绝不能追随用户后来切换的角色或数据集，错位时只保留原会话回报。
    if (
      String(props.characterId || '').trim() !== context.characterId
      || currentDataset.value?.datasetId !== context.datasetId
    ) {
      await appendWorkspaceAgentBackgroundMessage({
        scopeKey,
        sessionId: context.sessionId,
        content: '【鉴心后台接续】工作区已经切到别的角色或数据集；为避免串写，本次没有自动续派。设问原回报与检查点都已保留，回到对应问卷后即可继续。'
      })
      return
    }

    const bundle = await fetchChatSessionBundleById(context.sessionId)
    const history = (Array.isArray(bundle?.messages) ? bundle.messages : [])
      .map((message) => ({
        role: String(message?.role || ''),
        content: String(message?.content || '').trim()
      }))
      .filter((message): message is { role: 'user' | 'assistant'; content: string } => (
        (message.role === 'user' || message.role === 'assistant') && Boolean(message.content)
      ))
    const continuation = readAgentConversationContinuation(context.sessionId)
    const modelSelection = normalizeAgentConversationModelSelection(
      continuation.modelSelection || scopeState?.modelSelection,
      'personality_trainer'
    )
    const agentConfig = settingStore.getBrainAgentConfig?.() || null
    const result = await runPersonalityTrainerAgent({
      userText: context.decision.instruction,
      history,
      provider: personalityTrainerProvider,
      signal: abortController.signal,
      // 子 Agent 终态唤醒是同一父会话的续接，不是新任务：保留派遣前 TODO，
      // 让鉴心从被设问结果阻断的条目继续，不重复建表或丢失验收口径。
      initialTaskTodo: continuation.taskTodo,
      initialDeferredActiveTools: continuation.deferredActiveTools,
      onDeferredActiveToolsChange: (toolNames) => {
        saveAgentConversationDeferredTools(context.sessionId, toolNames)
        if (bindsCurrentView && scopeState) scopeState.deferredActiveTools = [...toolNames]
      },
      onTaskTodoChange: (snapshot) => {
        const retained = saveAgentConversationTaskTodo(context.sessionId, snapshot)
        if (bindsCurrentView && scopeState) scopeState.taskTodo = retained
      },
      subagentWait: createQuestionAuthorWaitCapability(context.characterId, context.sessionId),
      subagentControl: createSessionSubagentControlCapability(context.sessionId),
      confirmWrite: async (request) => (
        (
          context.decision.allowRedispatch
          && request.title === PERSONALITY_QUESTION_AUTHOR_DISPATCH_CONFIRM_TITLE
        )
        || (
          context.decision.allowPlannedBatchContinuation
          && isPersonalityQuestionBatchConfirmation(request.title)
        )
          ? { status: 'confirmed' as const }
          : { status: 'dismissed' as const }
      ),
      onIntermediateMessage: async ({ content }) => {
        await appendWorkspaceAgentBackgroundMessage({
          scopeKey,
          sessionId: context.sessionId,
          content
        })
      },
      callOrchestrator: async ({ messages, toolBriefs }) => {
        const response = await ai.callAIWithTools(messages as never, {
          ...buildAgentConversationModelAiOptions(agentConfig as never, modelSelection, {
            maxTokens: 4096,
            temperature: 0.3,
            thinking: 'enabled'
          }),
          tools: toOpenAiTools(toolBriefs),
          feature: 'agent',
          logLabel: 'jianxin-question-author-background-recovery',
          usageLabel: '鉴心(设问后台接续)',
          placeLabel: context.characterId,
          sessionId: context.sessionId,
          sessionLabel: '鉴心',
          signal: abortController.signal,
          registerAbortController: false
        })
        return { content: response?.content ?? '', toolCalls: response?.toolCalls ?? [] }
      },
      budget: { maxTurns: 8, maxToolCalls: 10 }
    })
    const reply = String(result.reply || '').trim()
    if (reply && result.terminalReason !== 'aborted' && !abortController.signal.aborted) {
      await appendWorkspaceAgentBackgroundMessage({
        scopeKey,
        sessionId: context.sessionId,
        content: reply
      })
    }
  } catch (error) {
    const aborted = abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')
    if (!aborted) {
      await appendWorkspaceAgentBackgroundMessage({
        scopeKey,
        sessionId: context.sessionId,
        content: `【鉴心后台接续】自动处理设问回报时遇到错误：${error instanceof Error ? error.message : String(error)}`
      }).catch(() => {})
    }
  } finally {
    // 模型没有按协议派遣时，用同一结构化诊断做一次受限兜底；仍只占用唯一的父级自动续派额度。
    if (
      context.decision.allowRedispatch
      && !context.dispatched
      && !abortController.signal.aborted
      && String(props.characterId || '').trim() === context.characterId
      && currentDataset.value?.datasetId === context.datasetId
    ) {
      try {
        const task = await runGeneration({
          agentMode: 'resume',
          correctionBrief: context.decision.fallbackCorrectionBrief,
          notificationSessionId: context.sessionId,
          automaticRecoveryDepth: context.decision.nextRecoveryDepth
        })
        context.dispatched = Boolean(task)
        if (context.dispatched) {
          await appendWorkspaceAgentBackgroundMessage({
            scopeKey,
            sessionId: context.sessionId,
            content: '【鉴心后台接续】已依据设问的结构化质量诊断定向续派一次；新任务仍在后台运行，完成或失败后会再次回报。'
          })
        }
      } catch (error) {
        await appendWorkspaceAgentBackgroundMessage({
          scopeKey,
          sessionId: context.sessionId,
          content: `【鉴心后台接续】定向续派未能启动：${error instanceof Error ? error.message : String(error)}`
        }).catch(() => {})
      }
    }

    if (bindsCurrentView && scopeState?.abortController === abortController) {
      scopeState.running = false
      scopeState.abortController = null
    }
    activeJianxinQuestionAuthorRecovery = null
    const pending = pendingJianxinQuestionAuthorRecovery
    pendingJianxinQuestionAuthorRecovery = null
    if (pending) queueOrRunJianxinQuestionAuthorRecovery(pending)
  }
}

function doRegenerate() {
  confirmState.value = null
  void runGeneration({ restart: true })
}

// ---------- 答题保存 ----------

async function saveQuestionGroupsPatch(nextGroups: PersonalityQuestionGroup[], successMessage: string) {
  const dataset = currentDataset.value
  if (!dataset) return
  try {
    const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
      dimensionPlan: dataset.dimensionPlan || [],
      questionGroups: nextGroups,
      promptSnapshot: dataset.promptSnapshot || {},
      sourceSummary: dataset.sourceSummary || {}
    })
    replaceDataset(updated)
    lastSavedAt.value = new Date()
    emit('toast', successMessage, 'success')
  } catch (error) {
    emit('toast', `保存题目修改失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function onQuestionEdit(groupId: string, question: string) {
  const groups = currentDataset.value?.questionGroups || []
  const nextGroups = groups.map((group) => group.id === groupId ? { ...group, question } : group)
  void saveQuestionGroupsPatch(nextGroups, '已保存情境修改')
}

function onCandidateEdit(groupId: string, candidateId: string, text: string) {
  const groups = currentDataset.value?.questionGroups || []
  const nextGroups = groups.map((group) => {
    if (group.id !== groupId) return group
    return {
      ...group,
      candidates: (group.candidates || []).map((candidate) => (
        candidate.id === candidateId ? { ...candidate, text } : candidate
      ))
    }
  })
  void saveQuestionGroupsPatch(nextGroups, '已保存应对方式修改')
}

function onAnswerPick(groupId: string, candidateId: string) {
  answersLocal.value = { ...answersLocal.value, [groupId]: { candidateId, reviewState: 'confirmed' } }
  scheduleAnswerSave()
}

function scheduleAnswerSave() {
  if (answerSaveTimer) clearTimeout(answerSaveTimer)
  answerSaveTimer = setTimeout(() => { void flushAnswerSave() }, 800)
}

async function flushAnswerSave() {
  if (answerSaveTimer) {
    clearTimeout(answerSaveTimer)
    answerSaveTimer = null
  }
  const dataset = currentDataset.value
  if (!dataset) return
  try {
    const updated = await personalityTrainingApi.saveDatasetAnswers(props.characterId, dataset.datasetId, answersLocal.value)
    replaceDataset(updated)
    lastSavedAt.value = new Date()
  } catch (error) {
    emit('toast', `保存答题进度失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function onEvalPick(groupId: string, candidateId: string) {
  evalAnswersLocal.value = { ...evalAnswersLocal.value, [groupId]: { candidateId, reviewState: 'confirmed' } }
  scheduleEvalSave()
}

function scheduleEvalSave() {
  if (evalSaveTimer) clearTimeout(evalSaveTimer)
  evalSaveTimer = setTimeout(() => { void flushEvalSave() }, 800)
}

async function flushEvalSave() {
  if (evalSaveTimer) {
    clearTimeout(evalSaveTimer)
    evalSaveTimer = null
  }
  const evalSet = activeEvalSet.value
  if (!evalSet) return
  try {
    const updated = await personalityTrainingApi.saveEvaluationAnswers(props.characterId, evalSet.evalSetId, evalAnswersLocal.value, (evalSet.metrics || {}) as Record<string, unknown>)
    const index = evalSets.value.findIndex((item) => item.evalSetId === updated.evalSetId)
    if (index >= 0) evalSets.value.splice(index, 1, updated)
    lastSavedAt.value = new Date()
  } catch (error) {
    emit('toast', `保存评测作答失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

// 编辑冻结评测题题面（候选 id 不变，已作答与 evalSetId 不动）；改题后旧版本指标需重跑评测刷新。
function onEvalQuestionEdit(groupId: string, question: string) {
  const questions = activeEvalSet.value?.questions || []
  const nextQuestions = questions.map((group) => group.id === groupId ? { ...group, question } : group)
  void saveEvaluationQuestionsPatch(nextQuestions, '已保存评测情境修改')
}

function onEvalCandidateEdit(groupId: string, candidateId: string, text: string) {
  const questions = activeEvalSet.value?.questions || []
  const nextQuestions = questions.map((group) => {
    if (group.id !== groupId) return group
    return {
      ...group,
      candidates: (group.candidates || []).map((candidate) => (
        candidate.id === candidateId ? { ...candidate, text } : candidate
      ))
    }
  })
  void saveEvaluationQuestionsPatch(nextQuestions, '已保存评测选项修改')
}

async function saveEvaluationQuestionsPatch(nextQuestions: PersonalityQuestionGroup[], successMessage: string) {
  const evalSet = activeEvalSet.value
  if (!evalSet) return
  try {
    const updated = await personalityTrainingApi.saveEvaluationQuestions(props.characterId, evalSet.evalSetId, nextQuestions)
    const index = evalSets.value.findIndex((item) => item.evalSetId === updated.evalSetId)
    if (index >= 0) evalSets.value.splice(index, 1, updated)
    lastSavedAt.value = new Date()
    emit('toast', successMessage, 'success')
  } catch (error) {
    emit('toast', `保存评测题修改失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

// ---------- 聊天消息选择（第 6 批） ----------

const filteredMessages = computed(() => {
  const messages = msgData.value?.messages || []
  if (!msgSessionFilter.value) return messages
  return messages.filter((message) => message.sessionId === msgSessionFilter.value)
})

const chatSkipped = computed(() => {
  const summary = (currentDataset.value?.sourceSummary || {}) as Record<string, any>
  return Array.isArray(summary.skipped) ? summary.skipped as Array<{ sessionId: string; messageId: number; reason: string }> : []
})

const selectedMsgSummary = computed(() => {
  const messages = msgData.value?.messages || []
  let total = 0
  let ok = 0
  for (const message of messages) {
    if (!selectedMsgs.value[msgKey(message)]) continue
    total += 1
    if (message.projection.state === 'ok') ok += 1
  }
  return { total, ok, need: total - ok }
})

function msgKey(message: PersonalityChatMessageCandidate) {
  return `${message.sessionId}:${message.messageId}`
}

function isMsgSelected(message: PersonalityChatMessageCandidate) {
  return Boolean(selectedMsgs.value[msgKey(message)])
}

function toggleMsg(message: PersonalityChatMessageCandidate) {
  const key = msgKey(message)
  selectedMsgs.value = { ...selectedMsgs.value, [key]: !selectedMsgs.value[key] }
}

function projDotClass(state: string) {
  if (state === 'ok') return 'ptw__dot--ok'
  if (state === 'fail' || state === 'hidden') return 'ptw__dot--fail'
  return 'ptw__dot--warn'
}

function projStateLabel(state: string) {
  if (state === 'ok') return '已投影'
  if (state === 'fail') return '投影失败'
  if (state === 'running') return '投影中'
  if (state === 'hidden') return '不可见'
  return '待生成'
}

function openMsgPicker() {
  sourceMode.value = 'chat'
  msgPickerOpen.value = true
  selectedMsgs.value = {}
  void loadChatMessages()
}

async function loadChatMessages() {
  msgLoading.value = true
  try {
    msgData.value = await personalityTrainingApi.listChatMessageCandidates(props.characterId)
  } catch (error) {
    emit('toast', `读取消息失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    msgLoading.value = false
  }
}

async function fixProjection(message: PersonalityChatMessageCandidate) {
  const key = msgKey(message)
  projectingKeys.value = new Set([...projectingKeys.value, key])
  try {
    await personalityTrainingApi.runMessageProjection(message.sessionId, message.messageId)
    await loadChatMessages()
  } catch (error) {
    emit('toast', `补投影失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    const next = new Set(projectingKeys.value)
    next.delete(key)
    projectingKeys.value = next
  }
}

async function useSelectedMessages() {
  if (creatingDataset.value) return
  const selections = new Map<string, number[]>()
  for (const message of msgData.value?.messages || []) {
    if (!selectedMsgs.value[msgKey(message)]) continue
    const list = selections.get(message.sessionId) || []
    list.push(message.messageId)
    selections.set(message.sessionId, list)
  }
  if (!selections.size) return
  creatingDataset.value = true
  try {
    const result = await personalityTrainingApi.createChatSampleDraft(
      props.characterId,
      [...selections.entries()].map(([sessionId, messageIds]) => ({ sessionId, messageIds }))
    )
    replaceDataset(result.dataset)
    currentDatasetId.value = result.dataset.datasetId
    answersLocal.value = {}
    msgPickerOpen.value = false
    if (result.skipped.length) {
      emit('toast', `已用 ${result.usableCount} 条投影创建批次；${result.skipped.length} 条因投影未通过被跳过`, 'success')
    } else {
      emit('toast', `已用 ${result.usableCount} 条投影创建训练批次`, 'success')
    }
    step.value = 'gen'
    void runGeneration({ agentMode: 'create_new' })
  } catch (error) {
    emit('toast', `创建聊天优化批次失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    creatingDataset.value = false
  }
}

// ---------- 训练任务（第 4 批：本机训练） ----------

async function runPrecheck() {
  if (precheckLoading.value) return
  precheckLoading.value = true
  try {
    precheck.value = await personalityTrainingApi.precheckLocalTraining(props.characterId)
  } catch (error) {
    emit('toast', `预检失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    precheckLoading.value = false
  }
}

function startTraining() {
  if (!answerCounts.value.resolved) return
  if (!canFormal.value) {
    confirmState.value = { kind: 'experimental' }
    return
  }
  void doStartTraining(false)
}

async function doStartTraining(allowExperimental: boolean) {
  confirmState.value = null
  if (startingRun.value) return
  startingRun.value = true
  try {
    await flushAnswerSave()
    const run = await personalityTrainingApi.startTrainingRun(props.characterId, {
      backend: 'local',
      datasetIds: currentDataset.value ? [currentDataset.value.datasetId] : [],
      allowExperimental
    })
    runs.value = [run, ...runs.value.filter((item) => item.runId !== run.runId)]
    ensureRunPolling()
  } catch (error) {
    emit('toast', `发起训练失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    startingRun.value = false
  }
}

async function doCancelRun() {
  confirmState.value = null
  const run = activeRun.value
  if (!run) return
  try {
    const updated = await personalityTrainingApi.cancelTrainingRun(props.characterId, run.runId)
    replaceRun(updated)
  } catch (error) {
    emit('toast', `取消失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function replaceRun(run: PersonalityTrainingRun | null | undefined) {
  if (!run) return
  const index = runs.value.findIndex((item) => item.runId === run.runId)
  if (index >= 0) runs.value.splice(index, 1, run)
  else runs.value.unshift(run)
}

function ensureRunPolling() {
  const initialRun = activeRun.value
  const characterId = String(props.characterId || '').trim()
  if (!initialRun || !characterId) return
  const context = `${characterId}:${initialRun.runId}`
  if (runPollTimer && runPollContext === context) return
  stopRunPolling()
  runPollContext = context
  runPollTimer = setInterval(async () => {
    if (String(props.characterId || '').trim() !== characterId) {
      stopRunPolling()
      return
    }
    const run = runs.value.find((item) => item.runId === initialRun.runId && isActiveTrainingRun(item))
    if (!run) return stopRunPolling()
    try {
      const updated = await personalityTrainingApi.getTrainingRun(characterId, run.runId)
      replaceRun(updated)
      if (!isActiveTrainingRun(updated)) {
        stopRunPolling()
        if (updated.status === 'succeeded') {
          emit('toast', '训练完成，已生成新版本（未安装）', 'success')
          await refreshVersions()
        } else if (updated.status === 'failed') {
          emit('toast', `训练失败：${failureStageLabel(updated.failureStage)}阶段 · ${updated.failureReason || '见日志'}`, 'error')
        }
      }
    } catch {
      // 轮询失败不打断，下一轮重试
    }
  }, 2500)
}

function stopRunPolling() {
  if (runPollTimer) {
    clearInterval(runPollTimer)
    runPollTimer = null
  }
  runPollContext = ''
}

async function openRunLog() {
  const run = latestRun.value
  if (!run) return
  logDrawerOpen.value = true
  logText.value = '正在读取日志…'
  try {
    const result = await personalityTrainingApi.getTrainingRunLog(props.characterId, run.runId)
    logText.value = result.log || '暂无日志'
  } catch (error) {
    logText.value = `读取日志失败：${error instanceof Error ? error.message : String(error)}`
  }
}

// ---------- Colab 手动后端（第 5 批） ----------

async function exportColabPack() {
  if (exportingPack.value) return
  exportingPack.value = true
  try {
    await flushAnswerSave()
    const result = await personalityTrainingApi.exportColabPackage(props.characterId, {
      datasetIds: currentDataset.value ? [currentDataset.value.datasetId] : [],
      allowExperimental: !canFormal.value
    })
    const url = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.fileName
    anchor.click()
    URL.revokeObjectURL(url)
    runs.value = await personalityTrainingApi.listTrainingRuns(props.characterId)
    emit('toast', '训练包已导出，去 Colab 训练后再回来导入模型 zip', 'success')
  } catch (error) {
    emit('toast', `导出训练包失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    exportingPack.value = false
  }
}

function pickColabZip(runId: string) {
  pendingImportRunId.value = runId
  colabFileInputRef.value?.click()
}

async function handleColabFile(event: Event) {
  const inputEl = event.target as HTMLInputElement
  const file = inputEl.files?.[0]
  inputEl.value = ''
  const runId = pendingImportRunId.value
  pendingImportRunId.value = ''
  if (!file || !runId) return
  importingRunId.value = runId
  try {
    const updated = await personalityTrainingApi.importTrainingRunArtifact(props.characterId, runId, file)
    replaceRun(updated)
    await refreshVersions()
    emit('toast', '已导入 Colab 训练产物，生成新版本（未安装）', 'success')
  } catch (error) {
    runs.value = await personalityTrainingApi.listTrainingRuns(props.characterId).catch(() => runs.value)
    emit('toast', `导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    importingRunId.value = ''
  }
}

async function cancelAwaitingRun(runId: string) {
  try {
    const updated = await personalityTrainingApi.cancelTrainingRun(props.characterId, runId)
    replaceRun(updated)
  } catch (error) {
    emit('toast', `操作失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

// ---------- 版本操作 / 回退 / 影子模式（第 7 批） ----------

// 回退目标：当前安装版本的 parentVersionId（取代关系），需仍在台账且未归档
const rollbackTarget = computed(() => {
  const installed = installedVersion.value
  if (!installed?.parentVersionId) return null
  const target = versions.value.find((version) => version.versionId === installed.parentVersionId)
  return target && target.status !== 'archived' ? target : null
})

// 安装建议：同考卷指标低于当前安装版本时默认不建议安装；考卷不同提示不可比；未评测提示先评测
const installAdvice = computed(() => {
  const candidate = confirmState.value?.kind === 'install' ? confirmState.value.version : null
  if (!candidate) return ''
  const installed = installedVersion.value
  const candidateMetrics = (candidate.metrics || {}) as Record<string, any>
  const candidateSetId = String(candidateMetrics.evaluationSetId || '')
  if (!candidateSetId) return '该版本尚未评测，建议先在「评测」运行评测再决定是否安装。'
  if (!installed || installed.versionId === candidate.versionId) return ''
  const installedMetrics = (installed.metrics || {}) as Record<string, any>
  const installedSetId = String(installedMetrics.evaluationSetId || '')
  if (!installedSetId) return ''
  if (installedSetId !== candidateSetId) return '考卷不同，与当前安装版本的指标不可直接对比。'
  const candidateHit = Number(candidateMetrics.testGroupAccuracy)
  const installedHit = Number(installedMetrics.testGroupAccuracy)
  if (Number.isFinite(candidateHit) && Number.isFinite(installedHit) && candidateHit < installedHit) {
    return `该版本冻结评测命中 ${formatPercentMetric(candidateHit)}，低于当前安装版本的 ${formatPercentMetric(installedHit)}，默认不建议安装。`
  }
  return ''
})

const shadowConfig = ref<PersonalityShadowConfig | null>(null)
const shadowLog = ref<PersonalityShadowLog>({ total: 0, agree: 0, diffs: [] })

function refreshShadowState() {
  shadowConfig.value = getPersonalityShadowConfig(props.characterId)
  shadowLog.value = getPersonalityShadowLog(props.characterId)
}

function canShadowObserve(version: PersonalityModelVersion) {
  if (version.status === 'installed' || version.status === 'archived') return false
  if ((version.metrics as Record<string, any> | undefined)?.experimental === true) return false
  if (shadowConfig.value?.versionId === version.versionId) return false
  return Boolean(version.modelPath)
}

function startShadow(version: PersonalityModelVersion) {
  startPersonalityShadowObservation(props.characterId, {
    versionId: version.versionId,
    modelPath: version.modelPath,
    versionLabel: versionDisplayName(version)
  })
  refreshShadowState()
  emit('toast', `已开启影子观察 ${versionDisplayName(version)}：聊天中使用人格模型回复时会记录排序差异`, 'success')
}

async function stopShadow() {
  await stopPersonalityShadowObservation(props.characterId)
  refreshShadowState()
  emit('toast', '已结束影子观察并释放影子模型', 'success')
}

async function doInstallVersion() {
  const version = confirmState.value?.version
  confirmState.value = null
  if (!version) return
  try {
    const installed = await personalityTrainingApi.installModelVersion(props.characterId, version.versionId)
    // 安装的恰好是影子观察中的版本：影子转正，结束观察并释放
    if (shadowConfig.value?.versionId === version.versionId) {
      await stopPersonalityShadowObservation(props.characterId)
      refreshShadowState()
    }
    emit('model-path-changed', String(installed?.modelPath || version.modelPath || ''))
    emit('toast', `已安装 ${versionDisplayName(version)}`, 'success')
    await refreshVersions()
  } catch (error) {
    emit('toast', `安装失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

async function exportVersion(version: PersonalityModelVersion) {
  if (exportingVersionId.value) return
  exportingVersionId.value = version.versionId
  try {
    const result = await personalityTrainingApi.exportModelVersion(
      props.characterId,
      version.versionId,
      versionDisplayName(version)
    )
    const url = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.fileName
    anchor.click()
    URL.revokeObjectURL(url)
    emit('toast', `已导出 ${versionDisplayName(version)}：可在其它角色用「上传模型包」导入`, 'success')
  } catch (error) {
    emit('toast', `导出失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    exportingVersionId.value = ''
  }
}

function pickModelPackage() {
  modelPackageInputRef.value?.click()
}

async function handleModelPackageFile(event: Event) {
  const inputEl = event.target as HTMLInputElement
  const file = inputEl.files?.[0]
  inputEl.value = ''
  if (!file || importingModelPackage.value) return
  importingModelPackage.value = true
  try {
    await personalityTrainingApi.importModelVersion(props.characterId, file)
    emit('toast', '已导入模型包，生成新版本（未安装），可在下方点「安装」启用', 'success')
    await refreshVersions()
  } catch (error) {
    emit('toast', `导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    importingModelPackage.value = false
  }
}

function requestDeleteVersion(version: PersonalityModelVersion) {
  confirmState.value = { kind: version.status === 'installed' ? 'delete-installed' : 'delete', version }
}

async function doDeleteVersion() {
  const version = confirmState.value?.version
  confirmState.value = null
  if (!version) return
  try {
    await personalityTrainingApi.deleteModelVersion(props.characterId, version.versionId)
    emit('toast', `已删除版本 ${versionDisplayName(version)}`, 'success')
    await refreshVersions()
  } catch (error) {
    emit('toast', `删除失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

// ---------- 鉴心正式数据适配与独立 loop ----------

async function refreshPersonalityTrainerRecords() {
  const characterId = String(props.characterId || '').trim()
  if (!characterId) throw new Error('当前没有角色')
  await Promise.all([flushAnswerSave(), flushEvalSave()])
  const [versionList, datasetList, evalSetList, runList] = await Promise.all([
    personalityTrainingApi.listModelVersions(characterId),
    personalityTrainingApi.listDatasets(characterId),
    personalityTrainingApi.listEvaluationSets(characterId),
    personalityTrainingApi.listTrainingRuns(characterId)
  ])
  if (String(props.characterId || '').trim() !== characterId) throw new Error('读取期间角色已切换，请重试')
  versions.value = versionList || []
  datasets.value = datasetList || []
  evalSets.value = evalSetList || []
  runs.value = runList || []
  if (!datasets.value.some((item) => item.datasetId === currentDatasetId.value)) {
    currentDatasetId.value = datasets.value[0]?.datasetId || ''
  }
  syncAnswersFromDataset()
  syncEvalAnswersFromSet()
  ensureEvalVersionSelection()
  ensureRunPolling()
}

function readCurrentQuestionCollection(scope: PersonalityTrainingQuestionScope) {
  if (scope === 'training') {
    const dataset = currentDataset.value
    if (!dataset) throw new Error('当前没有训练数据集')
    return {
      resourceId: dataset.datasetId,
      questions: [...(dataset.questionGroups || [])],
      answers: { ...answersLocal.value }
    }
  }
  const evalSet = activeEvalSet.value
  if (!evalSet) throw new Error('当前没有生效的冻结评测集')
  return {
    resourceId: evalSet.evalSetId,
    questions: [...(evalSet.questions || [])],
    answers: { ...evalAnswersLocal.value }
  }
}

function readCurrentCharacterPersonality() {
  const character = characterStore.getCharacter(props.characterId)
  if (!character) throw new Error('当前角色档案不存在，无法读取性格字段')
  return {
    characterId: props.characterId,
    characterName: String(character.name || props.characterName || props.characterId),
    personality: String(character.personality || '').trim()
  }
}

const personalityTrainerProvider: PersonalityTrainingAgentProvider = {
  async readSnapshot() {
    await refreshPersonalityTrainerRecords()
    const dataset = currentDataset.value
    const evaluation = activeEvalSet.value
    const datasetCounts = summarizePersonalityQuestionCollection({
      questions: dataset?.questionGroups || [],
      answers: answersLocal.value
    })
    const evaluationCounts = summarizePersonalityQuestionCollection({
      questions: evaluation?.questions || [],
      answers: evalAnswersLocal.value
    })
    return {
      characterId: props.characterId,
      characterName: props.characterName || props.characterId,
      personalityText: readCurrentCharacterPersonality().personality,
      activeStepId: step.value,
      dataset: dataset ? {
        datasetId: dataset.datasetId,
        title: dataset.title,
        status: dataset.status,
        lastGenerationFailure: (
          (dataset.promptSnapshot as Record<string, unknown> | undefined)?.lastGenerationFailure as Record<string, unknown> | null | undefined
        ) || null,
        ...datasetCounts
      } : null,
      calibration: dataset ? summarizePersonalityAdaptiveCalibration({
        questionGroups: dataset.questionGroups || [],
        answers: answersLocal.value,
        promptSnapshot: (dataset.promptSnapshot || {}) as Record<string, unknown>
      }) : null,
      evaluationSet: evaluation ? {
        evalSetId: evaluation.evalSetId,
        status: evaluation.status,
        metrics: (evaluation.metrics || {}) as Record<string, unknown>,
        ...evaluationCounts
      } : null,
      backgroundTasks: listPersonalityTrainingBackgroundTasks(props.characterId),
      trainingRuns: runs.value.map(({ logPath: _logPath, ...run }) => ({ ...run })),
      modelVersions: versions.value.map(({ modelPath, ...version }) => ({
        ...version,
        hasModel: Boolean(modelPath)
      }))
    }
  },
  async readQuestions(scope) {
    await refreshPersonalityTrainerRecords()
    return readCurrentQuestionCollection(scope)
  },
  async deleteQuestions(scope, questionIds) {
    const targetIds = new Set(questionIds.map((id) => String(id || '').trim()).filter(Boolean))
    if (!targetIds.size) return readCurrentQuestionCollection(scope)
    if (scope === 'training') {
      const dataset = currentDataset.value
      if (!dataset) throw new Error('当前没有训练数据集')
      const currentQuestions = dataset.questionGroups || []
      const firstDeletedIndex = currentQuestions.findIndex((question) => targetIds.has(question.id))
      if (firstDeletedIndex < 0) throw new Error('目标题目已经不存在，请重读后再删除')
      const questions = currentQuestions.filter((question) => !targetIds.has(question.id))
      const promptSnapshot = reconcilePersonalityCalibrationPromptAfterQuestionDeletion({
        promptSnapshot: (dataset.promptSnapshot || {}) as Record<string, unknown>,
        firstDeletedQuestionNumber: firstDeletedIndex + 1,
        remainingQuestionCount: questions.length
      })
      const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
        dimensionPlan: dataset.dimensionPlan || [],
        questionGroups: questions,
        promptSnapshot,
        sourceSummary: dataset.sourceSummary || {}
      })
      replaceDataset(updated)
      syncAnswersFromDataset()
    } else {
      const evalSet = activeEvalSet.value
      if (!evalSet) throw new Error('当前没有生效的冻结评测集')
      const questions = (evalSet.questions || []).filter((question) => !targetIds.has(question.id))
      const updated = await personalityTrainingApi.saveEvaluationQuestions(props.characterId, evalSet.evalSetId, questions)
      const index = evalSets.value.findIndex((item) => item.evalSetId === updated.evalSetId)
      if (index >= 0) evalSets.value.splice(index, 1, updated)
      syncEvalAnswersFromSet()
    }
    lastSavedAt.value = new Date()
    return readCurrentQuestionCollection(scope)
  },
  async saveQuestions(scope, questions) {
    if (scope === 'training') {
      const dataset = currentDataset.value
      if (!dataset) throw new Error('当前没有训练数据集')
      const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
        dimensionPlan: dataset.dimensionPlan || [],
        questionGroups: questions,
        promptSnapshot: dataset.promptSnapshot || {},
        sourceSummary: dataset.sourceSummary || {}
      })
      replaceDataset(updated)
      syncAnswersFromDataset()
    } else {
      const evalSet = activeEvalSet.value
      if (!evalSet) throw new Error('当前没有生效的冻结评测集')
      const updated = await personalityTrainingApi.saveEvaluationQuestions(props.characterId, evalSet.evalSetId, questions)
      const index = evalSets.value.findIndex((item) => item.evalSetId === updated.evalSetId)
      if (index >= 0) evalSets.value.splice(index, 1, updated)
      syncEvalAnswersFromSet()
    }
    lastSavedAt.value = new Date()
    return readCurrentQuestionCollection(scope)
  },
  async saveAnswers(scope, answers) {
    if (scope === 'training') {
      const dataset = currentDataset.value
      if (!dataset) throw new Error('当前没有训练数据集')
      const updated = await personalityTrainingApi.saveDatasetAnswers(props.characterId, dataset.datasetId, answers)
      replaceDataset(updated)
      answersLocal.value = { ...(updated.answers || answers) }
    } else {
      const evalSet = activeEvalSet.value
      if (!evalSet) throw new Error('当前没有生效的冻结评测集')
      const updated = await personalityTrainingApi.saveEvaluationAnswers(
        props.characterId,
        evalSet.evalSetId,
        answers,
        (evalSet.metrics || {}) as Record<string, unknown>
      )
      const index = evalSets.value.findIndex((item) => item.evalSetId === updated.evalSetId)
      if (index >= 0) evalSets.value.splice(index, 1, updated)
      evalAnswersLocal.value = { ...(updated.answers || answers) }
    }
    lastSavedAt.value = new Date()
    return readCurrentQuestionCollection(scope)
  },
  async startQuestionnaireGeneration(mode, correctionBrief, questionCount) {
    const backgroundRecovery = activeJianxinQuestionAuthorRecovery
    if (backgroundRecovery) {
      if (!backgroundRecovery.decision.allowRedispatch) {
        throw new Error('本次设问后台接续只允许核对和回报，不能再次派遣')
      }
      if (mode !== 'resume') {
        throw new Error('设问后台纠错只能从现有 checkpoint 续跑，不能新建或清空当前问卷')
      }
      if (!String(correctionBrief || '').trim()) {
        throw new Error('设问后台纠错续派必须携带具体题号、违规规则和改写约束')
      }
      if (
        backgroundRecovery.characterId !== String(props.characterId || '').trim()
        || backgroundRecovery.datasetId !== currentDataset.value?.datasetId
      ) {
        throw new Error('设问后台纠错目标已切换，为避免串写已拒绝续派')
      }
    }
    if (mode === 'create_new') {
      const dataset = await personalityTrainingApi.createDatasetDraft(props.characterId, {})
      replaceDataset(dataset)
      currentDatasetId.value = dataset.datasetId
      answersLocal.value = {}
    }
    let dataset = currentDataset.value
    if (!dataset) throw new Error('当前没有可出题的数据集')
    if (questionCount !== undefined) {
      const safeQuestionCount = Math.trunc(Number(questionCount))
      if (!Number.isSafeInteger(safeQuestionCount) || safeQuestionCount <= 0) {
        throw new Error('设问题量必须是正整数')
      }
      const promptSnapshot = {
        ...((dataset.promptSnapshot || {}) as Record<string, unknown>),
        targetTrainingGroupCount: safeQuestionCount,
        targetEvaluationQuestionCount: 0,
        questionnaireGenerationCheckpoint: null,
        lastGenerationFailure: null
      }
      const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
        dimensionPlan: buildDefaultPersonalityQuestionnaireDimensionPlan(safeQuestionCount, 0),
        questionGroups: dataset.questionGroups || [],
        promptSnapshot,
        sourceSummary: dataset.sourceSummary || {}
      })
      replaceDataset(updated)
      dataset = updated
    }
    step.value = 'gen'
    const taskKey = buildPersonalityTrainingBackgroundTaskKey('questionnaire_generation', props.characterId, dataset.datasetId)
    const task = await runGeneration({
      restart: mode === 'restart_current',
      agentMode: mode,
      correctionBrief,
      ...(backgroundRecovery
        ? {
            notificationSessionId: backgroundRecovery.sessionId,
            automaticRecoveryDepth: backgroundRecovery.decision.nextRecoveryDepth
          }
        : {})
    })
    if (backgroundRecovery && task) backgroundRecovery.dispatched = true
    return {
      taskKey,
      taskId: task?.taskId || '',
      status: task?.status || 'running',
      datasetId: dataset.datasetId,
      questionCount
    }
  },
  async recordCalibrationRoundReview(review: Omit<PersonalityCalibrationRoundReview, 'reviewedAt'>) {
    const dataset = currentDataset.value
    if (!dataset) throw new Error('当前没有可记录复盘的训练数据集')
    const promptSnapshot = buildCompletedPersonalityCalibrationReviewPromptSnapshot({ dataset, review })
    const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
      dimensionPlan: dataset.dimensionPlan || [],
      questionGroups: dataset.questionGroups || [],
      promptSnapshot,
      sourceSummary: dataset.sourceSummary || {}
    })
    replaceDataset(updated)
    return {
      datasetId: dataset.datasetId,
      roundNumber: review.roundNumber,
      status: 'recorded'
    }
  },
  async startQuestionBatch(questionCount) {
    const dataset = currentDataset.value
    if (!dataset) throw new Error('当前没有可追加题目的训练数据集')
    const safeQuestionCount = Math.trunc(Number(questionCount))
    if (!Number.isSafeInteger(safeQuestionCount) || safeQuestionCount <= 0) {
      throw new Error('追加题量必须是正整数')
    }
    const promptSnapshot = buildPersonalityQuestionBatchPromptSnapshot({
      dataset,
      questionCount: safeQuestionCount
    })
    promptSnapshot.adaptiveCalibrationContext = [
      String(promptSnapshot.adaptiveCalibrationContext || '').trim(),
      `角色当前最新性格正文：${readCurrentCharacterPersonality().personality || '（未填写）'}`
    ].filter(Boolean).join('\n')
    const nextTarget = Number(promptSnapshot.targetTrainingGroupCount || 0)
    const nextDimensionPlan = promptSnapshot.promptKind === 'personality_questionnaire_generation'
      ? buildDefaultPersonalityQuestionnaireDimensionPlan(nextTarget, 0)
      : (dataset.dimensionPlan || [])
    const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
      dimensionPlan: nextDimensionPlan,
      questionGroups: dataset.questionGroups || [],
      promptSnapshot,
      sourceSummary: dataset.sourceSummary || {}
    })
    replaceDataset(updated)
    const extensionDraft = {
      dimensionPlan: [...(updated.dimensionPlan || [])],
      questionGroups: [...(updated.questionGroups || [])],
      evaluationQuestions: [] as PersonalityQuestionGroup[]
    }
    step.value = 'gen'
    const taskKey = buildPersonalityTrainingBackgroundTaskKey('questionnaire_generation', props.characterId, dataset.datasetId)
    const task = await runGeneration({ extensionDraft, agentMode: 'append_batch' })
    return {
      taskKey,
      taskId: task?.taskId || '',
      status: task?.status || 'running',
      datasetId: dataset.datasetId,
      questionCount: safeQuestionCount,
      nextTarget
    }
  },
  async startFrozenEvaluationGeneration(questionCount) {
    const dataset = currentDataset.value
    if (!dataset) throw new Error('当前没有可生成冻结评测题的训练数据集')
    const safeCount = Math.max(1, Math.trunc(Number(questionCount) || 24))
    const calibration = summarizePersonalityAdaptiveCalibration({
      questionGroups: dataset.questionGroups || [],
      answers: answersLocal.value,
      promptSnapshot: (dataset.promptSnapshot || {}) as Record<string, unknown>
    })
    const reviewContext = calibration.reviews.map((review) => (
      `第 ${review.roundNumber} 轮：${review.summary}`
    )).join('\n')
    const promptSnapshot = {
      ...((dataset.promptSnapshot || {}) as Record<string, unknown>),
      targetTrainingGroupCount: dataset.questionGroups?.length || 0,
      targetEvaluationQuestionCount: safeCount,
      adaptiveCalibrationContext: [
        '人格校准已由用户确认稳定。下面只生成独立冻结评测题，不再追加训练题。',
        `角色当前最新性格正文：${readCurrentCharacterPersonality().personality || '（未填写）'}`,
        reviewContext ? `历轮复盘：\n${reviewContext}` : ''
      ].filter(Boolean).join('\n'),
      lastGenerationFailure: null
    }
    const nextDimensionPlan = String((dataset.promptSnapshot as Record<string, unknown> | undefined)?.promptKind || '') === 'personality_questionnaire_generation'
      ? buildDefaultPersonalityQuestionnaireDimensionPlan(dataset.questionGroups?.length || 0, safeCount)
      : (dataset.dimensionPlan || [])
    const updated = await personalityTrainingApi.saveDatasetQuestionnaire(props.characterId, dataset.datasetId, {
      dimensionPlan: nextDimensionPlan,
      questionGroups: dataset.questionGroups || [],
      promptSnapshot,
      sourceSummary: dataset.sourceSummary || {}
    })
    replaceDataset(updated)
    const extensionDraft = {
      dimensionPlan: [...(updated.dimensionPlan || [])],
      questionGroups: [...(updated.questionGroups || [])],
      evaluationQuestions: [] as PersonalityQuestionGroup[]
    }
    step.value = 'gen'
    const taskKey = buildPersonalityTrainingBackgroundTaskKey('questionnaire_generation', props.characterId, dataset.datasetId)
    const task = await runGeneration({ extensionDraft, agentMode: 'frozen_evaluation' })
    return {
      taskKey,
      taskId: task?.taskId || '',
      status: task?.status || 'running',
      datasetId: dataset.datasetId,
      evaluationQuestionCount: safeCount
    }
  },
  readCharacterPersonality() {
    return readCurrentCharacterPersonality()
  },
  async saveCharacterPersonality(personality) {
    await characterStore.updateCharacter(props.characterId, { personality } as any)
    return readCurrentCharacterPersonality()
  },
  precheckTraining() {
    return personalityTrainingApi.precheckLocalTraining(props.characterId)
  },
  async startTraining(payload) {
    await flushAnswerSave()
    const run = await personalityTrainingApi.startTrainingRun(props.characterId, payload)
    replaceRun(run)
    ensureRunPolling()
    step.value = 'train'
    return run
  },
  async listTrainingRuns() {
    runs.value = await personalityTrainingApi.listTrainingRuns(props.characterId)
    ensureRunPolling()
    return runs.value
  },
  async getTrainingRun(runId) {
    const run = await personalityTrainingApi.getTrainingRun(props.characterId, runId)
    replaceRun(run)
    return run
  },
  getTrainingRunLog(runId) {
    return personalityTrainingApi.getTrainingRunLog(props.characterId, runId)
  },
  async cancelTraining(runId) {
    const run = await personalityTrainingApi.cancelTrainingRun(props.characterId, runId)
    replaceRun(run)
    return run
  },
  async startEvaluation(versionId) {
    await flushEvalSave()
    const version = versions.value.find((item) => item.versionId === versionId)
    const evalSet = activeEvalSet.value
    if (!version?.modelPath) throw new Error(`模型版本 ${versionId} 没有可评测文件`)
    if (!evalSet) throw new Error('当前没有生效的冻结评测集')
    evalVersionId.value = versionId
    step.value = 'eval'
    const task = launchEvaluationTask(version, evalSet)
    return {
      taskKey: task?.key || buildPersonalityTrainingBackgroundTaskKey('evaluation', props.characterId, versionId, evalSet.evalSetId),
      taskId: task?.taskId || '',
      status: task?.status || 'running',
      evalSetId: evalSet.evalSetId
    }
  },
  async installModelVersion(versionId) {
    const installed = await personalityTrainingApi.installModelVersion(props.characterId, versionId)
    if (shadowConfig.value?.versionId === versionId) {
      await stopPersonalityShadowObservation(props.characterId)
      refreshShadowState()
    }
    emit('model-path-changed', String(installed.modelPath || ''))
    await refreshVersions()
    return installed
  },
  async deleteModelVersion(versionId) {
    const deleted = await personalityTrainingApi.deleteModelVersion(props.characterId, versionId)
    await refreshVersions()
    return deleted
  },
  onChanged() {
    lastSavedAt.value = new Date()
  }
}

const personalityTrainerRunner: WorkspaceAgentTurnRunner = async ({
  sessionId,
  userText,
  history,
  signal,
  turnStream,
  emitInterimMessage,
  initialTaskTodo,
  initialDeferredActiveTools,
  onDeferredActiveToolsChange,
  onTaskTodoChange,
  modelSelection
}) => {
  const characterId = String(props.characterId || '').trim()
  if (!characterId) throw new Error('当前没有角色，无法启动鉴心')
  const agentConfig = settingStore.getBrainAgentConfig?.() || null
  activeJianxinTurnSessionId = sessionId
  try {
    const result = await runPersonalityTrainerAgent({
      userText,
      history,
      provider: personalityTrainerProvider,
      confirmWrite: createScopeConfirmWriteChannel(personalityTrainerScopeKey.value, 'personality_trainer', characterId),
      signal,
      turnStream,
      onIntermediateMessage: ({ content }) => emitInterimMessage?.(content),
      initialTaskTodo,
      initialDeferredActiveTools,
      onDeferredActiveToolsChange,
      onTaskTodoChange,
      subagentWait: createQuestionAuthorWaitCapability(characterId, sessionId),
      subagentControl: createSessionSubagentControlCapability(sessionId),
      callOrchestrator: async ({ messages, toolBriefs }) => {
        const response = await ai.callAIWithTools(messages as never, {
          ...buildAgentConversationModelAiOptions(agentConfig as never, modelSelection, {
            maxTokens: 4096,
            temperature: 0.35,
            thinking: 'enabled'
          }),
          tools: toOpenAiTools(toolBriefs),
          feature: 'agent',
          logLabel: 'jianxin-workspace',
          usageLabel: '鉴心(角色级独立会话)',
          placeLabel: props.characterName || '人格训练',
          sessionId: personalityTrainerScopeKey.value,
          sessionLabel: '鉴心',
          signal
        })
        return { content: response?.content ?? '', toolCalls: response?.toolCalls ?? [] }
      }
    })
    return { reply: result.reply, terminalReason: result.terminalReason }
  } finally {
    if (activeJianxinTurnSessionId === sessionId) activeJianxinTurnSessionId = ''
    // controller 会在 runner 返回后的 finally 才清 running；下一宏任务再消费，避免与刚结束的前台轮次并跑。
    if (pendingJianxinQuestionAuthorRecovery?.sessionId === sessionId) {
      setTimeout(() => {
        const pending = pendingJianxinQuestionAuthorRecovery
        if (!pending || pending.sessionId !== sessionId) return
        pendingJianxinQuestionAuthorRecovery = null
        queueOrRunJianxinQuestionAuthorRecovery(pending)
      }, 0)
    }
  }
}

// ---------- 步骤与关闭 ----------

function goStep(target: StepId) {
  if (step.value === 'answer') void flushAnswerSave()
  if (step.value === 'eval') void flushEvalSave()
  if (target === 'install') refreshShadowState()
  if (target === 'eval') ensureEvalVersionSelection()
  step.value = target
}

function requestClose() {
  confirmState.value = { kind: 'leave' }
}

function doClose() {
  confirmState.value = null
  void flushAnswerSave()
  void flushEvalSave()
  emit('close')
}

function finishAndClose() {
  void flushAnswerSave()
  void flushEvalSave()
  emit('close')
}

watch(() => props.open, (open) => {
  if (!open) {
    logDrawerOpen.value = false
    return
  }
  step.value = props.mode === 'versions' ? 'install' : 'source'
  sourceMode.value = props.mode === 'optimize' ? 'chat' : 'profile'
  refreshShadowState()
  msgPickerOpen.value = false
  msgSessionFilter.value = ''
  selectedMsgs.value = {}
  evalQuizOpen.value = false
  showArchived.value = false
  confirmState.value = null
  generateError.value = ''
  void loadAll()
})

watch(currentDatasetId, () => {
  openDimension.value = ''
  expandedDimensionQuestions.value = {}
  syncAnswersFromDataset()
})

watch(versions, () => {
  ensureEvalVersionSelection()
})

watch(evalVersionId, () => {
  evaluationLiveResults.value = []
})

watch(() => props.refreshToken, () => {
  if (props.open) void refreshVersions()
})

watch(() => props.characterId, (characterId, previousCharacterId) => {
  if (characterId === previousCharacterId) return
  // 服务端训练任务不因切角色而停止；这里只结束旧角色轮询，避免用新角色路由查询旧 runId。
  loadRequestSequence += 1
  stopRunPolling()
  if (props.open) void loadAll()
})

onBeforeUnmount(() => {
  if (answerSaveTimer) clearTimeout(answerSaveTimer)
  if (evalSaveTimer) clearTimeout(evalSaveTimer)
  stopRunPolling()
})
</script>

<style scoped>
.ptw {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.ptw__workspace-close {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 12;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--morandi-text-light, #7b746b);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.ptw__workspace-close:hover,
.ptw__workspace-close:focus-visible {
  outline: 0;
  background: color-mix(in srgb, var(--morandi-accent) 10%, transparent);
  color: var(--morandi-text, #4f463f);
}

.ptw__workspace-close svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ptw__agent {
  display: flex;
  flex: 0 0 340px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  background: var(--morandi-surface, #f7f5f1);
}

.ptw__agent--collapsed {
  width: 0;
  min-width: 0;
  flex-basis: 0;
  border-right: 0;
}

.ptw__agent-resize {
  position: relative;
  z-index: 5;
  width: 7px;
  flex: none;
  margin: 0 -4px;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.ptw__agent-resize:hover {
  background: var(--morandi-soft-bg, rgba(139, 115, 85, 0.08));
}

.ptw__nav {
  width: 188px;
  min-width: 188px;
  display: flex;
  flex-direction: column;
  padding: 12px 10px 10px;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
}

.ptw__agent-expand {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 8px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 10%, transparent);
  color: var(--morandi-accent, #5c8a5c);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.ptw__agent-expand:hover,
.ptw__agent-expand:focus-visible {
  background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 16%, transparent);
  outline: 0;
}

.ptw__agent-expand .line-icon {
  width: 17px;
  height: 17px;
  flex: none;
}

.ptw__steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ptw__step {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #7b746b);
  font: inherit;
  font-size: 0.88rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.ptw__step:hover {
  background: rgba(139, 115, 85, 0.08);
}

.ptw__step--current {
  background: rgba(139, 115, 85, 0.1);
  color: var(--morandi-text, #4f463f);
  font-weight: 600;
}

.ptw__step-num {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 50%;
  background: var(--morandi-card);
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.68rem;
}

.ptw__step--current .ptw__step-num {
  border-color: var(--morandi-accent, #5c8a5c);
  color: var(--morandi-accent, #5c8a5c);
  font-weight: 600;
}

.ptw__step--done .ptw__step-num {
  border-color: rgba(92, 138, 92, 0.5);
  background: rgba(92, 138, 92, 0.12);
  color: var(--morandi-accent, #5c8a5c);
}

.ptw__step-flag {
  margin-left: auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.ptw__step-flag--warn {
  background: #d4a843;
}

.ptw__summary {
  margin-top: auto;
  padding: 12px 10px 2px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
}

.ptw__summary-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
}

.ptw__summary-k {
  flex-shrink: 0;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.72rem;
}

.ptw__summary-v {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.78rem;
  text-align: right;
}

.ptw__summary-v--dim {
  color: var(--morandi-text-light, #7b746b);
}

.ptw__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.ptw__dot--ok { background: var(--morandi-accent, #5c8a5c); }
.ptw__dot--warn { background: #d4a843; }
.ptw__dot--fail { background: #c0665a; }

.ptw__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.ptw__scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 24px 20px;
}

.ptw__foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 22px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  flex-shrink: 0;
}

.ptw__draft-note {
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.72rem;
}

.ptw__background-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--morandi-accent, #5c8a5c);
  font-size: 0.72rem;
}

.ptw__foot-spacer {
  flex: 1;
}

/* ---------- 步骤通用 ---------- */
.ptw-step {
  width: 100%;
  max-width: 980px;
}

.ptw-step--quiz {
  max-width: 1200px;
}

.ptw-step__h {
  margin: 0;
  color: var(--morandi-text, #4f463f);
  font-size: 1.02rem;
  font-weight: 600;
}

.ptw-step__sub {
  margin: 4px 0 0;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.82rem;
  line-height: 1.55;
}

.ptw-step__sec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 8px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.85rem;
  font-weight: 600;
}

.ptw__faint {
  color: var(--morandi-text-light, #9b958c);
  font-size: 0.74rem;
}

.ptw__link {
  border: 0;
  padding: 0;
  background: none;
  color: var(--morandi-accent, #5c8a5c);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.ptw__link:hover {
  text-decoration: underline;
}

.ptw__link--muted {
  color: var(--morandi-text-light, #7b746b);
}

.ptw__btn {
  padding: 7px 14px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text, #4f463f);
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}

.ptw__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--morandi-hover) 96%, transparent);
}

.ptw__btn--primary {
  border-color: var(--langhuan-dialog-primary-bg, #525e43);
  background: var(--langhuan-dialog-primary-bg, #525e43);
  color: #fff;
}

.ptw__btn--primary:hover:not(:disabled) {
  background: var(--langhuan-dialog-primary-bg-hover, #46503a);
}

.ptw__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.ptw__row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.ptw__banner {
  display: block;
  margin-top: 14px;
  padding: 9px 13px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 80%, transparent);
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.82rem;
  line-height: 1.55;
}

.ptw__banner b {
  color: var(--morandi-text, #4f463f);
  font-weight: 600;
}

.ptw__banner--info {
  border-color: rgba(160, 181, 196, 0.45);
  background: rgba(160, 181, 196, 0.1);
}

.ptw__round-summary {
  display: flex;
  align-items: center;
  gap: 6px 14px;
  flex-wrap: wrap;
  margin: 0 0 12px;
}

.ptw__banner--warn {
  border-color: rgba(212, 168, 67, 0.4);
  background: rgba(212, 168, 67, 0.08);
}

.ptw__banner--danger {
  border-color: rgba(192, 102, 90, 0.4);
  background: rgba(192, 102, 90, 0.07);
}

.ptw__banner .ptw__link {
  margin-left: 8px;
}

.ptw__tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(139, 115, 85, 0.1);
  color: #8b7355;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
}

.ptw__tag--green { background: rgba(92, 138, 92, 0.13); color: var(--morandi-accent, #5c8a5c); }
.ptw__tag--gold { background: rgba(212, 168, 67, 0.16); color: #a07c1e; }
.ptw__tag--red { background: rgba(192, 102, 90, 0.12); color: #c0665a; }
.ptw__tag--plain { background: rgba(160, 181, 196, 0.18); color: #567184; }

.ptw__choice-title .ptw__tag {
  margin-left: 8px;
}

/* ---------- 单选行 ---------- */
.ptw__choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.ptw__choice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.ptw__choice:hover:not(.ptw__choice--disabled) {
  border-color: rgba(139, 115, 85, 0.5);
}

.ptw__choice--active {
  border-color: rgba(92, 138, 92, 0.5);
  background: rgba(92, 138, 92, 0.06);
}

.ptw__choice--disabled {
  opacity: 0.55;
  cursor: default;
}

.ptw__radio {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 50%;
  background: var(--morandi-card);
  position: relative;
}

.ptw__choice--active .ptw__radio {
  border-color: var(--morandi-accent, #5c8a5c);
}

.ptw__radio-dot {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--morandi-accent, #5c8a5c);
}

.ptw__choice-body {
  flex: 1;
  min-width: 0;
}

.ptw__choice-title {
  display: flex;
  align-items: center;
  color: var(--morandi-text, #4f463f);
  font-size: 0.92rem;
  font-weight: 500;
}

.ptw__choice-desc {
  margin-top: 3px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.8rem;
  line-height: 1.5;
}

.ptw__choice-meta {
  margin-top: 5px;
  color: var(--morandi-text-light, #9b958c);
  font-size: 0.74rem;
}

/* ---------- 数据集行 ---------- */
.ptw__dataset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.ptw__dataset-title {
  color: var(--morandi-text, #4f463f);
  font-size: 0.88rem;
  font-weight: 500;
}

.ptw__select {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text, #4f463f);
  font-size: 0.84rem;
}

/* ---------- 出题 ---------- */
.ptw__gen-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.84rem;
}

.ptw__gen-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0 4px;
}

.ptw__gen-status-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.8rem;
  white-space: nowrap;
}

.ptw__gen-status-text .line-icon {
  color: var(--morandi-accent, #5c8a5c);
}

.ptw__track {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(139, 115, 85, 0.14);
  overflow: hidden;
}

.ptw__track-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--morandi-accent, #5c8a5c);
  transition: width 0.4s ease;
}

.ptw__dims {
  display: flex;
  flex-direction: column;
}

.ptw__dimwrap {
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
}

.ptw__dimwrap:last-child {
  border-bottom: none;
}

.ptw__dim {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ptw__dim:hover {
  background: rgba(139, 115, 85, 0.06);
}

.ptw__dim-chev {
  flex-shrink: 0;
  color: var(--morandi-text-light, #b3ada3);
  transition: transform 0.15s ease;
}

.ptw__dim-chev--open {
  transform: rotate(90deg);
}

.ptw__dim-name {
  width: 110px;
  flex-shrink: 0;
  color: var(--morandi-text, #4f463f);
  font-size: 0.86rem;
}

.ptw__dim-track {
  flex: 1;
}

.ptw__dim-count {
  width: 56px;
  flex-shrink: 0;
  text-align: right;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.ptw__dimx {
  margin: 2px 0 10px 27px;
  padding: 2px 14px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
}

.ptw__dimx-q {
  padding: 9px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
}

.ptw__dimx-q:last-of-type {
  border-bottom: none;
}

.ptw__dimx-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.7rem;
}

.ptw__dimx-source {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.66rem;
}

.ptw__dimx-source--confirmed {
  background: color-mix(in srgb, var(--morandi-accent) 12%, transparent);
  color: var(--morandi-accent, #5c8a5c);
}

.ptw__dimx-source--preset {
  background: color-mix(in srgb, #b18a31 13%, transparent);
  color: #9a741f;
}

.ptw__dimx-scene {
  color: var(--morandi-text, #4f463f);
  font-size: 0.82rem;
  line-height: 1.6;
}

.ptw__dimx-plans {
  margin-top: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ptw__dimx-plan {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.76rem;
  line-height: 1.55;
}

.ptw__dimx-plan--selected {
  color: var(--morandi-text, #4f463f);
}

.ptw__dimx-plan--confirmed {
  border-color: color-mix(in srgb, var(--morandi-accent) 32%, transparent);
  background: color-mix(in srgb, var(--morandi-accent) 7%, transparent);
}

.ptw__dimx-plan--preset {
  border-color: color-mix(in srgb, #b18a31 30%, transparent);
  background: color-mix(in srgb, #b18a31 6%, transparent);
}

.ptw__dimx-key {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.7rem;
  font-weight: 600;
}

.ptw__dimx-picked {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  color: inherit;
  font-size: 0.66rem;
  white-space: nowrap;
}

.ptw__dimx-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.72rem;
}

.ptw__dimx-foot .ptw__link {
  flex-shrink: 0;
}

/* ---------- 消息选择 ---------- */
.ptw__filterbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 14px 0 10px;
}

.ptw__filter-chip {
  padding: 5px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #7b746b);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
}

.ptw__filter-chip--active {
  background: color-mix(in srgb, var(--morandi-card) 96%, transparent);
  color: var(--morandi-text, #4f463f);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
}

.ptw__msgs {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  overflow: hidden;
}

.ptw__msg {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
  cursor: pointer;
  transition: background 0.15s ease;
}

.ptw__msg:last-child {
  border-bottom: none;
}

.ptw__msg:hover {
  background: rgba(139, 115, 85, 0.06);
}

.ptw__msg--checked {
  background: rgba(92, 138, 92, 0.05);
}

.ptw__msg-check {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-top: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 4px;
  background: var(--morandi-card);
  color: #fff;
}

.ptw__msg--checked .ptw__msg-check {
  border-color: var(--morandi-accent, #5c8a5c);
  background: var(--morandi-accent, #5c8a5c);
}

.ptw__msg-body {
  flex: 1;
  min-width: 0;
}

.ptw__msg-top {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.74rem;
}

.ptw__msg-who {
  color: var(--morandi-text-light, #7b746b);
  font-weight: 500;
}

.ptw__msg-text {
  margin-top: 3px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.85rem;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ptw__msg-fail {
  margin-top: 3px;
  color: #c0665a;
  font-size: 0.72rem;
}

.ptw__msg-proj {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.72rem;
  white-space: nowrap;
}

/* ---------- 清单行 ---------- */
.ptw__checklist {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  overflow: hidden;
}

.ptw__checkrow {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 15px;
  color: var(--morandi-text-light, #8a8278);
}

.ptw__checkrow-name {
  color: var(--morandi-text, #4f463f);
  font-size: 0.86rem;
}

.ptw__checkrow-detail {
  flex: 1;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.78rem;
}

.ptw__checkrow--skip {
  opacity: 0.55;
}

/* ---------- 训练阶段竖向进度 ---------- */
.ptw__stage {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 8px 2px;
}

.ptw__stage-rail {
  width: 18px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 1px;
}

.ptw__stage-body {
  display: block;
}

.ptw__stage-name {
  display: block;
  color: var(--morandi-text, #4f463f);
  font-size: 0.86rem;
}

.ptw__stage-desc {
  display: block;
  margin-top: 2px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.74rem;
}

.ptw__stage--pending .ptw__stage-name {
  color: var(--morandi-text-light, #8a8278);
}

/* ---------- 训练日志抽屉 ---------- */
.ptw__logdrawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 86%);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--morandi-card) 99%, transparent);
  border-left: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  box-shadow: 0 3px 10px rgba(56, 46, 38, 0.08);
  z-index: 40;
  animation: ptw-slide 0.22s ease;
}

@keyframes ptw-slide {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: none; opacity: 1; }
}

.ptw__logdrawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  color: var(--morandi-text, #4f463f);
  font-size: 0.85rem;
  font-weight: 600;
}

.ptw__logdrawer-body {
  flex: 1;
  margin: 0;
  overflow-y: auto;
  padding: 12px 16px;
  color: var(--morandi-text-light, #7b746b);
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ---------- 样本统计 ---------- */
.ptw__stats {
  display: flex;
  margin-top: 16px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  overflow: hidden;
}

.ptw__stat {
  flex: 1;
  padding: 10px 14px;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
}

.ptw__stat:last-child {
  border-right: none;
}

.ptw__stat-v {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: var(--morandi-text, #4f463f);
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ptw__stat-u {
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.72rem;
  font-weight: 400;
}

.ptw__stat-l {
  margin-top: 3px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.72rem;
}

/* ---------- 评测指标 ---------- */
.ptw__metrics {
  display: flex;
  gap: 12px;
}

.ptw__metric {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
}

.ptw__metric-l {
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.76rem;
}

.ptw__metric-v {
  margin-top: 4px;
  color: var(--morandi-text, #4f463f);
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ptw__metric-set {
  margin-top: 6px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.7rem;
}

.ptw__eval-results {
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 76%, transparent);
}

.ptw__eval-result {
  padding: 12px 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
}

.ptw__eval-result:last-child {
  border-bottom: 0;
}

.ptw__eval-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.74rem;
}

.ptw__eval-result-head .ptw__tag {
  margin-left: auto;
}

.ptw__eval-result-question {
  margin-top: 5px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.84rem;
  line-height: 1.6;
}

.ptw__eval-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}

.ptw__eval-answer {
  min-width: 0;
  padding: 7px 9px;
  border-left: 2px solid color-mix(in srgb, var(--morandi-accent) 42%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-accent) 5%, transparent);
}

.ptw__eval-answer--expected {
  border-left-color: color-mix(in srgb, #b18a31 54%, var(--morandi-border));
  background: color-mix(in srgb, #b18a31 5%, transparent);
}

.ptw__eval-answer--wrong {
  border-left-color: color-mix(in srgb, #c0665a 54%, var(--morandi-border));
  background: color-mix(in srgb, #c0665a 5%, transparent);
}

.ptw__eval-answer-label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.68rem;
}

.ptw__eval-answer-label .ptw__faint {
  margin-left: auto;
}

.ptw__eval-answer-text {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 4px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.77rem;
  line-height: 1.55;
}

/* ---------- 版本表 ---------- */
.ptw__vtable {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  overflow: hidden;
  margin-top: 14px;
}

.ptw__vrow {
  display: grid;
  grid-template-columns: minmax(110px, 0.9fr) minmax(120px, 1.2fr) minmax(80px, 0.8fr) minmax(90px, 0.9fr) minmax(82px, 0.7fr) 86px;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
}

.ptw__vrow:last-child {
  border-bottom: none;
}

.ptw__vrow--head {
  padding: 8px 14px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.76rem;
  font-weight: 600;
}

.ptw__vrow--archived {
  opacity: 0.55;
}

.ptw__vcell {
  min-width: 0;
  color: var(--morandi-text, #4f463f);
  font-size: 0.82rem;
  line-height: 1.45;
}

.ptw__vname {
  display: block;
  font-weight: 600;
}

.ptw__vsub {
  display: block;
  color: var(--morandi-text-light, #8a8278);
  font-size: 0.7rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ptw__vcell--acts {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.ptw__icon-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #7b746b);
  cursor: pointer;
}

.ptw__icon-btn:hover {
  background: rgba(192, 102, 90, 0.1);
  color: #c0665a;
}

/* ---------- 影子模式差异行（定稿：差异行，不展示日志） ---------- */
.ptw__shadow-diff {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
  font-size: 0.82rem;
}

.ptw__shadow-diff:last-child {
  border-bottom: none;
}

.ptw__shadow-scene {
  flex: 1;
  min-width: 0;
  color: var(--morandi-text, #4f463f);
}

.ptw__shadow-old {
  color: var(--morandi-text-light, #8a8278);
}

.ptw__shadow-new {
  color: var(--morandi-accent, #5c8a5c);
}

/* ---------- 空态 / 加载 ---------- */
.ptw__empty {
  padding: 48px 20px;
  text-align: center;
  color: var(--morandi-text-light, #8a8278);
}

.ptw__empty-title {
  margin-top: 10px;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.92rem;
}

.ptw__empty-desc {
  margin-top: 5px;
  font-size: 0.78rem;
  line-height: 1.6;
}

.ptw__empty-acts {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  justify-content: center;
}

.ptw__spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: 2px solid rgba(139, 115, 85, 0.2);
  border-top-color: #8b7355;
  border-radius: 50%;
  animation: ptw-spin 0.9s linear infinite;
}

.ptw__spinner--tiny {
  width: 10px;
  height: 10px;
  border-width: 1.5px;
}

@keyframes ptw-spin {
  to { transform: rotate(360deg); }
}

/* ---------- 窄屏降级：步骤导航横滑，摘要隐藏，多列转单列 ---------- */
@media (max-width: 760px) {
  .ptw {
    flex-direction: column;
    height: min(70vh, 700px);
  }

  .ptw__nav {
    width: 100%;
    min-width: 0;
    flex-direction: row;
    align-items: center;
    padding: 6px 52px 6px 10px;
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .ptw__nav::-webkit-scrollbar {
    display: none;
  }

  .ptw__steps {
    flex-direction: row;
  }

  .ptw__step {
    padding: 6px 8px;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .ptw__summary {
    display: none;
  }

  .ptw__scroll {
    padding: 14px 16px 18px;
  }

  .ptw__foot {
    padding: 10px 14px;
  }

  .ptw__draft-note {
    display: none;
  }

  .ptw__metrics {
    flex-direction: column;
  }

  .ptw__eval-compare {
    grid-template-columns: 1fr;
  }

  .ptw__stats {
    flex-wrap: wrap;
  }

  .ptw__stat {
    min-width: 45%;
    border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
  }

  /* 版本表退回卡片流（CD 定稿：窄屏不硬挤宽表格） */
  .ptw__vrow {
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
    padding: 12px 14px;
  }

  .ptw__vrow--head {
    display: none;
  }

  .ptw__vcell::before {
    content: attr(data-label);
    display: block;
    color: var(--morandi-text-light, #9b958c);
    font-size: 0.68rem;
    margin-bottom: 2px;
  }

  .ptw__vcell--acts {
    grid-column: span 2;
    justify-content: flex-start;
  }

  .ptw__vcell--acts::before {
    display: none;
  }
}
</style>
