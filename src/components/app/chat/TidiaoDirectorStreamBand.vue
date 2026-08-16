<template>
  <!-- 提调「真·导演 agent loop」轮级流式载体（子批4：新编排带 Vue）。
       消费子批1 契约 TidiaoDirectorStream：决策流（过程，逐字逐句 + 工具条表现分开）
       ＋ 并排始终可见的实时分镜区（结果，边决策边累积）。
       现役唯一编排带：loop 进行中的轮级载体 + 历史复原（读落库 directorStream 快照）都走它，
       旧六块带 TidiaoOrchestrationBand.vue 已于 2026-06-29 退役删除。
       本组件为纯展示层（子批4）：只渲染、不接聊天流；数据由父层注入 stream，交互经 emit 上抛，
       真实接线（单聊定位 / 中粒度纠偏）在子批5 / 批次E。 -->
  <!-- R3-5·P25：部分完成（failed 但有产出）走 done 容器样式，不套 failed 红框。 -->
  <div class="tds" :class="[`tds--${isPartialOutcome ? 'done' : stream.phase}`, { 'tds--compact': compact }]">
    <!-- ===== 决策流 ＋ 并排实时分镜（2026-07-07 起无带内折叠态：开合全交坞·见下方注释） ===== -->
    <div class="tds-expand">
      <!-- header -->
      <div class="tds-head">
        <span class="tds-head-icon"><DirIcon name="clapperboard" :size="16" /></span>
        <span class="tds-head-name">提调</span>
        <span v-if="speakerName" class="tds-head-speaker">· {{ speakerName }}</span>
        <span class="tds-chip" :class="chipClass">
          <span v-if="stream.phase === 'running'" class="tds-dot-pulse"></span>
          <DirIcon v-else-if="stream.phase === 'done'" name="check" :size="12" :stroke="2.2" />
          <!-- R3-5·P25：部分完成用柔和 check，不用 alert 红字图标。 -->
          <DirIcon v-else-if="stream.phase === 'failed' && isPartialOutcome" name="check" :size="12" :stroke="2.2" />
          <DirIcon v-else-if="stream.phase === 'failed'" name="alert" :size="12" :stroke="1.9" />
          {{ stream.currentAction }}
        </span>
        <span class="tds-spacer"></span>
        <!-- compact（移动端·2026-07-05 设计稿）：这排入口图标化收进下方 tab 行右侧，头部只留 图标+提调+发言人+状态chip。
             带内「收起」按钮已全端撤掉（2026-07-07 桌面跟进 compact）——坞底边橄榄绿条是唯一收起控件，带内折叠态随之退役。 -->
        <template v-if="!compact">
          <!-- 批次I·侧栏入口联动：召回完成挂「召回」入口、编排就绪挂「编排」入口，点击定位对应侧栏 -->
          <button v-if="recallRunId" type="button" class="tds-entry" title="查看本轮召回侧栏" @click="emit('open-recall')">
            <DirIcon name="search" :size="12" />召回
          </button>
          <!-- 资料池入口（2026-07-03 改常驻）：对话级池随时可看可增删——纯按需取料下空池是常态，
               空池也挂入口，点开抽屉能看空态并手动加第一张卡（此前空池无任何入口）。 -->
          <button type="button" class="tds-entry" title="查看本对话各角色资料池与世界知识池（可增删）" @click="openPoolPanel">
            <DirIcon name="database" :size="12" />资料池
          </button>
          <button v-if="hasOrchestrationAudit" type="button" class="tds-entry" title="查看本轮编排审计" @click="emit('open-orchestration')">
            <DirIcon name="layers" :size="12" />编排
          </button>
          <!-- 提调剧本入口（2026-07-06·用户「剧本功能」）：编剧 subagent 维护的会话级剧本可视化，可编辑/清空
               （入口常驻语义同资料池：无剧本也保留入口，点开看空态）。 -->
          <!-- 编剧运行实况（2026-07-07）：consultScript 调用中入口亮脉冲点+活秒表（真值=subagentRunStatus·与剧本面板状态条同一口径）。 -->
          <button type="button" class="tds-entry" :class="{ 'is-script-running': scriptwriterRunning }" :title="scriptwriterRunning ? `编剧运行中·已 ${scriptwriterElapsed}` : '查看/编辑本对话剧本（编剧 subagent 维护）'" @click="openScriptPanel">
            <DirIcon name="scroll-text" :size="12" />剧本<span v-if="scriptwriterRunning" class="tds-entry-run"><span class="tds-entry-run-dot"></span>{{ scriptwriterElapsed }}</span>
          </button>
          <!-- 场记入口（2026-06-29 生·原名「state」·2026-07-10 改中文名）：看本带排演过程记录——主记录（统筹决策流）
               + 子记录（各演员子 loop 钻取明细），只读。
               批次G：桌面（panelMode='sidebar'）开 AppChatSection 挤压侧栏；移动/缺省仍开本地浮层。 -->
          <button type="button" class="tds-entry" title="查看本带排演过程记录（主记录 / 子记录）" @click="openStatePanel">
            <DirIcon name="clipboard-pen" :size="12" />场记
          </button>
        </template>
      </div>

      <!-- compact tab 行（2026-07-05 移动端适配拍板）：「信息流 / 分镜」扁平下划线 tab 二选一显示（沿用项目 tab 范式）；
           分镜 tab 带镜数徽标、运行中新镜落地点亮小绿点（切到分镜即熄）；右侧=图标化入口（命中区 ≥40px），
           召回/编排仍按有无数据显隐。入口按钮语义与上方桌面 .tds-entry 同一套，联动能力：入口增减两处同步。 -->
      <div v-if="compact" class="tds-tabs">
        <button type="button" class="tds-tab-btn" :class="{ 'is-on': compactTab === 'flow' }" @click="selectCompactTab('flow')">信息流</button>
        <button type="button" class="tds-tab-btn" :class="{ 'is-on': compactTab === 'shots' }" @click="selectCompactTab('shots')">
          分镜
          <span v-if="shots.length" class="tds-tab-badge">{{ shots.length }}</span>
          <span v-if="shotsTabDot" class="tds-tab-dot" aria-hidden="true"></span>
        </button>
        <span class="tds-spacer"></span>
        <button v-if="recallRunId" type="button" class="tds-tab-entry" title="召回" aria-label="查看本轮召回侧栏" @click="emit('open-recall')">
          <DirIcon name="search" :size="15" />
        </button>
        <button type="button" class="tds-tab-entry" title="资料池" aria-label="查看本对话各角色资料池与世界知识池" @click="openPoolPanel">
          <DirIcon name="database" :size="15" />
        </button>
        <button v-if="hasOrchestrationAudit" type="button" class="tds-tab-entry" title="编排" aria-label="查看本轮编排审计" @click="emit('open-orchestration')">
          <DirIcon name="layers" :size="15" />
        </button>
        <button type="button" class="tds-tab-entry" :title="scriptwriterRunning ? `编剧运行中·已 ${scriptwriterElapsed}` : '剧本'" aria-label="查看/编辑本对话剧本" @click="openScriptPanel">
          <DirIcon name="scroll-text" :size="15" />
          <span v-if="scriptwriterRunning" class="tds-tab-dot tds-tab-dot--pulse" aria-hidden="true"></span>
        </button>
        <button type="button" class="tds-tab-entry" title="场记" aria-label="查看本带排演过程记录（主记录 / 子记录）" @click="openStatePanel">
          <DirIcon name="clipboard-pen" :size="15" />
        </button>
      </div>

      <!-- 两栏：信息流（过程·数据=decisions 决策流） ｜ 实时分镜（结果）。
           compact：tab 二选一显示（v-show 保 DOM 与展开态，切 tab 不丢钻取/工具展开进度）；桌面两栏并排不变。 -->
      <div class="tds-grid">
        <!-- 信息流（2026-07-10 用户拍板改名·数据仍是 decisions 决策流契约·副标题小字同轮删除） -->
        <section v-show="!compact || compactTab === 'flow'" class="tds-flow">
          <div class="tds-col-head">
            <span class="tds-col-title">信息流</span>
          </div>
          <!-- 编剧运行态卡（2026-07-07 用户「运行态要进信息流·持久可见·可展开看内部信息流」）：
               sticky 按运行状态（2026-07-10 用户真机反馈）：running 才钉顶持久悬浮（编剧卡固定占 0 号钉位，
               地图严谨协作与运行卡计划批1·2026-07-11：下方派遣卡改用共享组件自己的堆叠序号，此处
               scriptwriterStickyStyle 只管编剧卡自身），done/error 回归文档流随滚动滚走；点头行展开编剧内部信息流
               （提调交给编剧的原文 + 编剧原始返回，真值=subagentRunStatus.input/output·纯内存刷新即清）。
               done/error 只在活动轮显示（liveRound·防历史轮串台），running 恒显。
               联动能力：状态口径与「剧本」入口秒表、世界剧本工作台运行卡同一 subagentRunStatus。 -->
          <div
            v-if="scriptwriterCardVisible"
            class="tds-script-card"
            :class="['tds-script-card--' + scriptwriterStatus!.state, { 'is-open': scriptCardOpen }]"
            :style="scriptwriterStickyStyle"
          >
            <button
              type="button"
              class="tds-script-head"
              :title="scriptCardOpen ? '收起编剧内部信息流' : '展开看编剧内部信息流（提调交给编剧的原文 + 编剧返回）'"
              @click="scriptCardOpen = !scriptCardOpen"
            >
              <span class="tds-script-icon"><DirIcon name="scroll-text" :size="12" /></span>
              <span class="tds-script-name">编剧</span>
              <span class="tds-script-state">
                <template v-if="scriptwriterStatus!.state === 'running'">
                  <span class="tds-entry-run-dot"></span>执笔中 · {{ scriptwriterElapsed }}
                </template>
                <template v-else-if="scriptwriterStatus!.state === 'done'">
                  <DirIcon name="check" :size="11" :stroke="2.2" /><template v-if="scriptwriterDoneDuration">{{ scriptwriterDoneDuration }}</template><template v-if="scriptwriterUsageLabel"> · {{ scriptwriterUsageLabel }}</template>
                </template>
                <template v-else>
                  <DirIcon name="alert" :size="11" :stroke="1.9" />失败<template v-if="scriptwriterDoneDuration"> · {{ scriptwriterDoneDuration }}</template><template v-if="scriptwriterUsageLabel"> · {{ scriptwriterUsageLabel }}</template>
                </template>
              </span>
              <span class="tds-script-toggle">
                {{ scriptCardOpen ? '收起' : '展开' }}
                <DirIcon name="chevron-down" :size="11" :stroke="1.9" />
              </span>
            </button>
            <div v-if="scriptCardOpen" class="tds-script-body">
              <div v-if="scriptwriterStatus!.error" class="tds-script-error">{{ scriptwriterStatus!.error }}</div>
              <div class="tds-script-io">
                <div class="tds-script-io-label">提调 → 编剧</div>
                <pre v-if="scriptwriterStatus!.input" class="tds-script-io-text">{{ scriptwriterStatus!.input }}</pre>
                <div v-else class="tds-script-io-hint">（本次调用没有留存入参）</div>
              </div>
              <div class="tds-script-io">
                <div class="tds-script-io-label">编剧 → 提调</div>
                <pre v-if="scriptwriterStatus!.output" class="tds-script-io-text">{{ scriptwriterStatus!.output }}</pre>
                <div v-else-if="scriptwriterStatus!.state === 'running'" class="tds-script-io-hint">编剧执笔中，返回后在这里显示…</div>
                <div v-else class="tds-script-io-hint">（没有留存返回内容）</div>
              </div>
            </div>
          </div>
          <!-- 派遣子agent运行卡（融入计划批次2 采风 + 并行编排批次B 造册 + 地图系统批5 绘舆·2026-07-10/11）：
               统筹/scope 确认派出的后台任务·并行多卡（同一 subagentRunStatus 状态表）。
               地图严谨协作与运行卡计划批1（2026-07-11）：卡块+sticky 逻辑已抽成共享纯展示组件
               SubagentDispatchCardList（星依浮坞同源复用），本带只负责拼 dispatchSources（领域知识：
               采风/造册/绘舆三类前缀+图标+文案）；行为零变化（原 dispatchCards 的过滤/映射逻辑原样搬进共享组件）。 -->
          <SubagentDispatchCardList
            :sources="dispatchSources"
            :include-settled="liveRound"
            :sticky-order-start="scriptwriterRunning ? 1 : 0"
            :reset-key="roundKey"
          />
          <div class="tds-decisions">
            <span v-if="decisions.length" class="tds-rail" aria-hidden="true"></span>
            <div
              v-for="(d, i) in decisions"
              :key="'dec' + i"
              class="tds-dec"
              :class="{ 'tds-dec--stream': i === streamingIndex }"
            >
              <span class="tds-node" :class="nodeClass(d.kind)">
                <DirIcon v-if="kindIcon(d.kind)" :name="kindIcon(d.kind)" :size="13" />
                <span v-else class="tds-node-dot"></span>
              </span>
              <div class="tds-dec-body">
                <div class="tds-dec-text">
                  {{ i === streamingIndex ? typedText : d.text }}
                </div>
                <!-- 工具调用条：与正常编排叙述表现上分开。
                     参数/结果默认折叠（省略），点击整条展开看全文（用户 2026-06-20·不用省略号硬截断）。 -->
                <div
                  v-if="d.tool"
                  class="tds-tool"
                  :class="[`tds-tool--${d.tool.status}`, { 'tds-tool--expandable': toolHasText(d.tool), 'tds-tool--open': isToolOpen(i) }]"
                  :title="toolHasText(d.tool) ? (isToolOpen(i) ? '点击收起' : '点击展开看全文') : ''"
                  @click="toolHasText(d.tool) && toggleTool(i)"
                >
                  <div class="tds-tool-head">
                    <span class="tds-tool-icon"><DirIcon name="tool" :size="11" :stroke="1.9" /></span>
                    <span class="tds-tool-label">{{ d.tool.label }}</span>
                    <span v-if="d.tool.detail" class="tds-tool-detail">{{ d.tool.detail }}</span>
                    <span class="tds-tool-status">
                      <span v-if="d.tool.status === 'running'" class="tds-tool-spin"></span>
                      <DirIcon v-else-if="d.tool.status === 'done'" name="check" :size="11" :stroke="2.2" />
                      <DirIcon v-else name="alert" :size="11" :stroke="1.9" />
                    </span>
                    <span v-if="toolHasText(d.tool)" class="tds-tool-toggle">{{ isToolOpen(i) ? '收起' : '展开' }}</span>
                  </div>
                  <div v-if="d.tool.resultPreview" class="tds-tool-result">{{ d.tool.resultPreview }}</div>
                </div>
              </div>
            </div>
            <div v-if="!decisions.length" class="tds-empty">提调待命，发一条消息看它开排…</div>
          </div>
        </section>

        <!-- 实时分镜：始终可见，边决策边累积（compact 下收进「分镜」tab） -->
        <aside v-show="!compact || compactTab === 'shots'" class="tds-shots">
          <div class="tds-col-head">
            <span class="tds-col-title">分镜</span>
            <span v-if="shots.length" class="tds-shots-count">{{ shots.length }} 镜</span>
          </div>
          <div v-if="shots.length" class="tds-shot-list">
            <div
              v-for="shot in shots"
              :key="shot.id"
              class="tds-shot"
              :class="shot.kind === 'narration' ? 'tds-shot--narr' : 'tds-shot--char'"
            >
              <!-- 竖长方形头像作左侧视觉锚（角色取真实头像、无则首字竖底；旁白用图标），
                   序号做头像左上角标——去掉旧独立序号列，消除分镜左侧空白。 -->
              <div class="tds-shot-figure">
                <img
                  v-if="shot.kind !== 'narration' && shotAvatarUrl(shot)"
                  :src="shotAvatarUrl(shot)"
                  class="tds-shot-portrait"
                  :alt="shot.label"
                />
                <span v-else-if="shot.kind === 'narration'" class="tds-shot-portrait tds-shot-portrait--narr"><DirIcon name="narrate" :size="16" /></span>
                <span v-else class="tds-shot-portrait tds-shot-portrait--initial">{{ shot.avatar }}</span>
                <span class="tds-shot-order">{{ shot.order }}</span>
              </div>
              <div class="tds-shot-body">
                <div class="tds-shot-title">
                  <span class="tds-shot-name">{{ shot.label }}</span>
                  <span v-if="shot.kind === 'narration' && shot.informationBearing === true" class="tds-shot-tag">信息承载</span>
                  <span v-else-if="shot.kind === 'narration' && shot.informationBearing === false" class="tds-shot-tag tds-shot-tag--plain">纯描写</span>
                  <!-- 展开按钮（批次B·合并能力）：①角色镜展开看自己编排过程（步骤/取料/情境/评审，形态1·E5）；
                       ②方向超 100 字（尤其旁白）默认折叠，展开看全文。角色镜两者皆有时，一个按钮一起展开。 -->
                  <button
                    v-if="shotExpandable(shot)"
                    type="button"
                    class="tds-shot-drill"
                    :class="{ 'is-open': isShotOpen(shot.id) }"
                    :title="shotToggleTitle(shot)"
                    @click="toggleShot(shot.id)"
                  >
                    {{ isShotOpen(shot.id) ? '收起' : '展开' }}
                    <DirIcon name="chevron-down" :size="11" :stroke="1.9" />
                  </button>
                </div>
                <!-- 方向：超 100 字默认折叠（展开按钮控制）；旁白方向通常很长，靠这里收纳，不再整段铺开。 -->
                <div v-if="shot.direction" class="tds-shot-dir">{{ directionDisplay(shot) }}</div>
                <!-- 钻取抽屉：本角色 per-speaker 回复的过程摘要（数据来自该角色消息过程轨，不重跑）。 -->
                <div v-if="detailOf(shot) && isShotOpen(shot.id)" class="tds-shot-detail">
                  <div v-if="detailOf(shot)!.stepLabel || detailOf(shot)!.elapsed || detailOf(shot)!.scenario" class="tds-sd-row">
                    <span v-if="detailOf(shot)!.stepLabel" class="tds-sd-step">步骤 {{ detailOf(shot)!.stepLabel }}</span>
                    <span v-if="detailOf(shot)!.elapsed" class="tds-sd-meta">· {{ detailOf(shot)!.elapsed }}</span>
                    <span v-if="detailOf(shot)!.scenario" class="tds-sd-scn">情境：{{ detailOf(shot)!.scenario }}</span>
                  </div>
                  <!-- 动态工作流步骤轨（复刻旧 ChatProcessTrace 节点轨骨架，喂该角色实际过程数据；
                       只长出实际跑过的步骤，提调灵活调用哪些步就显哪些节点）。 -->
                  <div v-if="detailOf(shot)!.steps && detailOf(shot)!.steps!.length" class="tds-wf">
                    <span class="tds-wf-rail" aria-hidden="true"></span>
                    <template v-for="step in detailOf(shot)!.steps" :key="'wf' + shot.id + step.id">
                      <div class="tds-wf-row">
                        <span class="tds-wf-node" :class="'tds-wf-node--' + wfVisual(step.status)">
                          <span v-if="wfVisual(step.status) === 'running'" class="tds-wf-spin"></span>
                          <DirIcon v-else-if="step.status === 'done'" name="check" :size="11" :stroke="2.2" />
                          <DirIcon v-else-if="step.status === 'failed'" name="x" :size="11" :stroke="2.2" />
                          <DirIcon v-else-if="step.icon" :name="step.icon" :size="11" />
                          <span v-else class="tds-node-dot"></span>
                        </span>
                        <span class="tds-wf-label">{{ step.label }}</span>
                        <span v-if="step.status === 'retry'" class="tds-wf-tag tds-wf-tag--run">重试</span>
                        <span v-else-if="step.status === 'running'" class="tds-wf-tag tds-wf-tag--run">运行中</span>
                        <span v-else-if="step.status === 'failed'" class="tds-wf-tag tds-wf-tag--fail">失败</span>
                        <span v-if="step.elapsed" class="tds-wf-time">{{ step.elapsed }}</span>
                        <!-- 评审降级：本地 ReRanker 跑不动时按候选顺序降级出回复，点击看原因 -->
                        <button
                          v-if="step.id === 'review' && detailOf(shot)!.reviewDegrade"
                          type="button"
                          class="tds-wf-tag tds-wf-tag--skip"
                          @click="toggleWfNote(shot.id, 'review')"
                        >降级</button>
                      </div>
                      <div
                        v-if="step.id === 'review' && detailOf(shot)!.reviewDegrade && isWfNoteOpen(shot.id, 'review')"
                        class="tds-wf-note"
                      >本地 ReRanker 评审未能运行，已按候选顺序降级产出回复。原因：{{ detailOf(shot)!.reviewDegrade!.reason }}</div>
                    </template>
                  </div>
                  <div
                    v-for="(r, ri) in (detailOf(shot)!.retrieval || [])"
                    :key="'sd' + shot.id + ri"
                    class="tds-sd-tool"
                  >
                    <span class="tds-sd-tool-icon"><DirIcon name="tool" :size="10" :stroke="1.9" /></span>
                    取料：{{ r.tool }}「{{ r.query }}」
                  </div>
                  <div v-if="!(detailOf(shot)!.retrieval || []).length" class="tds-sd-hint">本轮未额外取料</div>
                  <div v-if="detailOf(shot)!.hasReview" class="tds-sd-hint">送评审挑最优 · 候选打分详情见上方「编排」入口</div>
                </div>
                <!-- 旁白镜钻取抽屉（旁白独立分镜工作流 2026-06-30）：复用 tds-wf 视觉，
                     展示「定方向（恒 done）→ 生成旁白（随 narrationGen running→done/失败）」两节点轨。
                     旁白镜不走取料/评审，故无那些行。 -->
                <div v-if="shot.kind === 'narration' && isShotOpen(shot.id)" class="tds-shot-detail">
                  <div class="tds-wf">
                    <span class="tds-wf-rail" aria-hidden="true"></span>
                    <div
                      v-for="step in narrationWfSteps(shot)"
                      :key="'nwf' + shot.id + step.id"
                      class="tds-wf-row"
                    >
                      <span class="tds-wf-node" :class="'tds-wf-node--' + wfVisual(step.status)">
                        <span v-if="wfVisual(step.status) === 'running'" class="tds-wf-spin"></span>
                        <DirIcon v-else-if="step.status === 'done'" name="check" :size="11" :stroke="2.2" />
                        <DirIcon v-else-if="step.status === 'failed'" name="x" :size="11" :stroke="2.2" />
                        <DirIcon v-else-if="step.icon" :name="step.icon" :size="11" />
                        <span v-else class="tds-node-dot"></span>
                      </span>
                      <span class="tds-wf-label">{{ step.label }}</span>
                      <span v-if="step.status === 'running'" class="tds-wf-tag tds-wf-tag--run">生成中</span>
                      <span v-else-if="step.status === 'failed'" class="tds-wf-tag tds-wf-tag--fail">失败</span>
                      <span v-if="step.elapsed" class="tds-wf-time">{{ step.elapsed }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 分镜空态文案 2026-07-10 用户拍板删除：没有分镜时列内留白即可。 -->
        </aside>
      </div>

      <!-- ===== 底栏四态 ===== -->
      <div class="tds-bottom">
        <!-- 停止统一（2026-07-04 用户拍板）：带上停止按钮退役，运行中只显状态；
             全局唯一停止入口 = 输入框右下角 abortChat（掐断提调 loop + 演员链路）。 -->
        <template v-if="stream.phase === 'running'">
          <span class="tds-bottom-hint">提调编排中…</span>
        </template>

        <!-- 纠偏态（提调「问用户」后挂起）：内联输入框已退役（2026-06-22）。
             与提调对话统一走输入栏上方的「橄榄绿提调框」——在那里输入即续跑这一挂起轮、答复提调的提问。
             这里只显示状态提示，不再内嵌 输入/继续/取消。 -->
        <template v-else-if="stream.phase === 'correcting'">
          <span class="tds-corr-icon"><DirIcon name="message" :size="14" /></span>
          <span class="tds-bottom-hint">{{ stream.currentAction }}<template v-if="stream.correction"> · {{ stream.correction }}</template></span>
        </template>

        <template v-else-if="stream.phase === 'done'">
          <span class="tds-bottom-ok">
            <DirIcon name="check" :size="12" :stroke="2.2" />本轮编排完成 · 可滚动查看回复
          </span>
        </template>

        <!-- R3-5·P25：已出内容但某步未完成 → 柔和「部分完成」（不报红字错误），仍给重试。 -->
        <template v-else-if="stream.phase === 'failed' && isPartialOutcome">
          <button v-if="interactive" type="button" class="tds-btn tds-btn--retry" @click="emit('retry')">
            <DirIcon name="rotate-ccw" :size="13" :stroke="1.8" />重试本轮
          </button>
          <span class="tds-bottom-partial">
            <DirIcon name="check" :size="12" :stroke="2.2" />本轮已出内容<template v-if="stream.failureReason"> · 个别步骤未完成：{{ stream.failureReason }}</template>
          </span>
        </template>

        <!-- 真结构性失败（零产出）：保留红字错误态 + 重试。 -->
        <template v-else-if="stream.phase === 'failed'">
          <button v-if="interactive" type="button" class="tds-btn tds-btn--retry" @click="emit('retry')">
            <DirIcon name="rotate-ccw" :size="13" :stroke="1.8" />重试本轮
          </button>
          <span class="tds-bottom-fail">
            <DirIcon name="alert" :size="12" :stroke="1.9" />{{ stream.failureReason || stream.currentAction }}
          </span>
        </template>

        <template v-else>
          <span class="tds-bottom-hint">{{ stream.currentAction }}</span>
        </template>
      </div>
    </div>

    <!-- 资料池侧栏抽屉（Teleport 到 body·浮于全局）：对话级各角色池 + 世界知识池（可增删）。
         入口常驻后 pools 可能为 null（会话还没有池）：poolSessionId 兜底定位对话池、poolCastCharacterIds 供加卡归属选项。 -->
    <RoundRecallPoolPanel
      v-if="poolPanelOpen"
      :pools="recallPools || null"
      :session-id="poolSessionId"
      :cast-character-ids="poolCastCharacterIds"
      :resolve-name="resolveName"
      @close="poolPanelOpen = false"
    />
    <!-- 场记浮层（只读·overlay 模式=移动端）：主记录（决策流）+ 子记录（各演员钻取明细）。 -->
    <DirectorStateInspector
      v-if="stateInspectorOpen"
      :stream="stream"
      :shot-details="shotDetails"
      :memory-projection="memoryProjection"
      @close="stateInspectorOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onUnmounted, ref, watch } from 'vue'
import type { TidiaoDecisionKind, TidiaoDirectorStream, TidiaoStreamShot } from '../../../app/tidiaoDirectorStream'
import type { TidiaoShotDetail, TidiaoShotStep } from '../../../app/tidiaoBandModel'
import type { RoundRecallPools } from '../../../app/recallRoundPool'
import RoundRecallPoolPanel from './RoundRecallPoolPanel.vue'
// 批次3（2026-07-07 范式优化）：运行状态泛化为 subagentRunStatus（(sessionId, subagentId) 键控·编剧 id 常量取自 spec 家）。
import { getSubagentRunStatus, subagentRunTick, formatSubagentRunDuration, type SubagentRunUsage } from '../../../app/subagentRunStatus'
import { NARRATIVE_SCRIPTWRITER_SUBAGENT_ID } from '../../../app/narrativeScriptwriterSubagent'
// 派遣子agent运行卡（融入计划批次2 采风 + 并行编排批次B 造册·2026-07-10；地图严谨协作与运行卡计划批1·
// 2026-07-11 卡块渲染+sticky 逻辑抽成共享组件，本带只保留「拼 sources」这部分领域知识）。
import SubagentDispatchCardList, { type SubagentDispatchCardSource } from './SubagentDispatchCardList.vue'
import { CAIFENG_SUBAGENT_ID_PREFIX, extractCaifengTaskTitle } from '../../../app/caifengSubagent'
import { ZAOCE_SUBAGENT_ID_PREFIX, extractZaoceTaskTitle } from '../../../app/zaoceSubagent'
import { HUIYU_SUBAGENT_ID_PREFIX, extractHuiyuTaskTitle } from '../../../app/huiyuSubagent'
import DirectorStateInspector from './DirectorStateInspector.vue'
// 挤压侧栏桥（2026-07-10 四面板统一·前身=批次G state 专用桥）：sidebar 模式点击场记/剧本/待办/资料池
// → 模块 ref 通知 AppChatSection 开内联 aside（getter 保响应式）；overlay 模式（移动/缺省）开带内本地浮层。
import {
  allocateTidiaoPanelSidebarOwnerKey,
  closeTidiaoPanelSidebarIfOwner,
  openTidiaoPanelSidebar
} from '../../../app/tidiaoPanelSidebarState'

// 纯展示层：消费子批1 契约 TidiaoDirectorStream（决策流 + 并排实时分镜）。
// interactive 默认 false：仅显示状态文字，隐藏重试等动作按钮；由父层对活动轮传 interactive=true。
//（停止按钮已退役·2026-07-04：全局唯一停止入口=输入框右下角 abortChat。）折叠/展开始终可用（本地态）。
const props = withDefaults(
  defineProps<{
    stream: TidiaoDirectorStream
    speakerName?: string
    compact?: boolean
    interactive?: boolean
    /** 批次I·召回入口：本轮召回活动 run id，有值即显示「召回」入口按钮。 */
    recallRunId?: string
    /** 批次I·编排入口：本轮编排审计运行态是否就绪，true 即显示「编排」入口按钮。 */
    hasOrchestrationAudit?: boolean
    /** 分镜真实头像解析：按角色名取头像 URL（无则空，回退首字圆底）。父层传 getCharAvatar。 */
    resolveAvatar?: (label: string) => string
    /** 形态1·E5：角色镜钻取明细（角色名→该角色编排过程：步骤/取料/情境/评审）。群聊新带据此让每个
     *  角色镜可展开看自己的复杂过程；单聊不传（单聊决策流本就含全过程，无需钻取）。 */
    shotDetails?: Record<string, TidiaoShotDetail>
    /** 对话级资料池（角色池+世界池）：父层从 recallRoundPoolCache 按 sessionId 读出传入；会话还没有池时为 null。
     *  入口常驻（2026-07-03）：不论空否都挂「资料池」入口，点击展开侧栏抽屉（空池显示空态+可手动加卡）。 */
    recallPools?: RoundRecallPools | null
    /** 入口常驻·空池兜底会话 id：pools 为 null 时侧栏增删靠它定位对话池（缺省空=只读空态）。 */
    poolSessionId?: string
    /** 入口常驻·加卡归属选项：当前会话成员 characterId 列表（面板内与已有池角色并集去重）；缺省只列已有池角色+世界池。 */
    poolCastCharacterIds?: string[]
    /** 资料池侧栏 characterId→角色名解析（父层从 charStore 传）；缺省回退 characterId。 */
    resolveName?: (characterId: string) => string
    /** state 查看器·提调真读那份：父层用 renderDirectorMemoryDocument 拼出的「喂模型原文」md（真实 prompt + 本轮 loop 真实往来·option C），透传给 DirectorStateInspector。 */
    memoryProjection?: string
    /** 面板承载形态（2026-07-10 四面板统一·原 stateInspectorMode）：'overlay'=带内 Teleport 浮层
     *  （缺省·移动端 MobileChatThread 用·零回归）；'sidebar'=场记/剧本/待办/资料池经模块桥开
     *  AppChatSection 挤压侧栏（桌面缺省）。 */
    panelMode?: 'overlay' | 'sidebar'
    /** 轮稳定标识（2026-07-05 移动端适配）：坞传选中轮 id。compact tab 选择态记在轮内、
     *  切轮复位到决策流——不能 watch stream 对象本身（活动轮每个事件都换新对象，会把 tab 打回决策流）。 */
    roundKey?: string
    /** 编剧卡活动轮门（2026-07-07）：坞传「当前显示的是活动轮」。subagentRunStatus 是会话级实况，
     *  done/error 残影只该出现在活动轮上——历史轮不传/false 即不显示（running 恒显不受此门约束）。 */
    liveRound?: boolean
  }>(),
  { speakerName: '', compact: false, interactive: false, recallRunId: '', hasOrchestrationAudit: false, recallPools: null, poolSessionId: '', poolCastCharacterIds: () => [], resolveName: undefined, memoryProjection: '', panelMode: 'overlay', roundKey: '', liveRound: false }
)

const emit = defineEmits<{
  (e: 'retry'): void
  /** 批次I：点击「召回」入口（父层据轮级 recallRunId 调 showRecallActivityRunInPanel 定位）。 */
  (e: 'open-recall'): void
  /** 批次I：点击「编排」入口（父层据轮级 orchestrationAudit 打开审计面板运行态）。 */
  (e: 'open-orchestration'): void
}>()

// 带内折叠态已于 2026-07-07 全端退役（坞底边橄榄绿条是唯一收起控件），带恒展开。

// compact tab（2026-07-05 移动端适配）：信息流/分镜二选一显示；选择态记在轮内，切轮（roundKey 变）复位到信息流。
const compactTab = ref<'flow' | 'shots'>('flow')
// 运行中新镜落地、且当前不在分镜 tab 时点亮小绿点；切到分镜即熄。
const shotsTabDot = ref(false)
function selectCompactTab(tab: 'flow' | 'shots'): void {
  compactTab.value = tab
  if (tab === 'shots') shotsTabDot.value = false
}
watch(() => props.roundKey, () => {
  compactTab.value = 'flow'
  shotsTabDot.value = false
  // 编剧卡展开态也是轮内视图态：切轮复位收起（卡本身显隐由 scriptwriterCardVisible 管）。
  scriptCardOpen.value = false
  // 派遣卡（采风/造册/绘舆）展开态同轮内视图态：切轮全部复位收起——已交给共享组件的 reset-key（=roundKey）自理。
})

// 资料池侧栏（入口常驻·2026-07-03）：入口不再按池空否门控；overlay 模式的带内浮层本地态。
const poolPanelOpen = ref(false)
// 提调待办侧栏（2026-07-06·入口常驻）：会话级 todo 清单可视化（勾选/编辑/删除）；overlay 模式本地态。
// 提调剧本侧栏（2026-07-06·入口常驻）：编剧 subagent 维护的会话级剧本可视化（编辑/清空）；overlay 模式本地态。
// 2026-07-10 四面板统一挤压侧栏：sidebar 模式下三入口改走模块桥（与场记同款·getter 闭包捕获响应式 props），
// AppChatSection 渲染内联 aside；overlay 模式（移动端）保持上面三个本地浮层 ref 零回归。
function openPoolPanel(): void {
  if (props.panelMode === 'sidebar') {
    openTidiaoPanelSidebar({
      kind: 'pool',
      ownerKey: panelSidebarOwnerKey,
      getPools: () => props.recallPools || null,
      getSessionId: () => props.poolSessionId || '',
      getCastCharacterIds: () => props.poolCastCharacterIds || [],
      getResolveName: () => props.resolveName
    })
    return
  }
  poolPanelOpen.value = true
}
function openScriptPanel(): void {
  window.dispatchEvent(new CustomEvent('langhuan:open-script-workspace', { detail: { sessionId: props.poolSessionId || '' } }))
}
// 编剧运行实况（2026-07-07）：runSubagent 埋点写 subagentRunStatus（纯内存·(sessionId,scriptwriter) 键控）；
// 桌面入口=脉冲点+活秒表、compact=图标脉冲点；点击统一打开世界剧本工作台。
const scriptwriterStatus = computed(() => (props.poolSessionId ? getSubagentRunStatus(props.poolSessionId, NARRATIVE_SCRIPTWRITER_SUBAGENT_ID) : null))
const scriptwriterRunning = computed(() => scriptwriterStatus.value?.state === 'running')
const scriptwriterElapsed = computed(() => {
  void subagentRunTick.value
  const status = scriptwriterStatus.value
  if (!status || status.state !== 'running') return ''
  return formatSubagentRunDuration(Date.now() - status.startedAt)
})
// 决策流 sticky 编剧卡（2026-07-07）：running 恒显（滚动持久可见）；done/error 只在活动轮显示（防历史轮串台）。
// 点头行展开内部信息流（input=提调交给编剧原文 / output=编剧原始返回），切轮复位收起。
const scriptCardOpen = ref(false)
const scriptwriterCardVisible = computed(() => {
  const status = scriptwriterStatus.value
  if (!status) return false
  return status.state === 'running' || props.liveRound
})
const scriptwriterDoneDuration = computed(() => {
  const status = scriptwriterStatus.value
  return status && typeof status.durationMs === 'number' ? formatSubagentRunDuration(status.durationMs) : ''
})
// 用量文案（2026-07-07）：subagent 一次运行的 token 总量，≥1000 折算 k 位省宽度，如「62.8k tokens」。
// ⚠️ 与 SubagentDispatchCardList.vue 的同名私有函数逐字同构（编剧卡与派遣卡同一口径），改口径两处要同步。
function subagentUsageLabelOf(usage: SubagentRunUsage | undefined): string {
  if (!usage) return ''
  const totalTokens = usage.promptTokens + usage.completionTokens
  if (totalTokens >= 1000) return `${(totalTokens / 1000).toFixed(1)}k tokens`
  return `${totalTokens} tokens`
}
const scriptwriterUsageLabel = computed(() => subagentUsageLabelOf(scriptwriterStatus.value?.usage))
// 派遣子agent运行卡查询源（融入计划批次2 采风 + 并行编排批次B 造册·2026-07-10；地图严谨协作与运行卡计划批1·
// 2026-07-11 拆分：本带只保留「哪几类子agent、图标/文案怎么写」这份领域知识，卡块渲染+过滤+sticky 逻辑
// 已抽进 SubagentDispatchCardList（喂它 sources 即可，includeSettled 传 liveRound 保「done/error 仅活动轮」
// 语义不变）。采风=统筹同轮多路钻取（subagentId=`caifeng:<n>`）、造册=scope 确认后的后台建栏（`zaoce:<n>`）、
// 绘舆=统筹/纠偏/星依派发的作图任务（`huiyu:<n>`）。卡名从 status.input 首行提取
// （契约=renderCaifengBrief「【钻取任务】」/ buildZaoceBrief「【建栏任务】」/ renderHuiyuBrief「【作图任务】」）。
const dispatchSources = computed<SubagentDispatchCardSource[]>(() => {
  if (!props.poolSessionId) return []
  const sessionId = props.poolSessionId
  return [
    { sessionId, meta: { prefix: CAIFENG_SUBAGENT_ID_PREFIX, label: '采风', icon: 'compass', runningVerb: '钻取中', fallbackTitle: '钻取任务', extractTitle: extractCaifengTaskTitle } },
    { sessionId, meta: { prefix: ZAOCE_SUBAGENT_ID_PREFIX, label: '造册', icon: 'list-checks', runningVerb: '建栏中', fallbackTitle: '建状态栏', extractTitle: extractZaoceTaskTitle } },
    { sessionId, meta: { prefix: HUIYU_SUBAGENT_ID_PREFIX, label: '绘舆', icon: 'map', runningVerb: '绘图中', fallbackTitle: '更新舆图', extractTitle: extractHuiyuTaskTitle } }
  ]
})
// 编剧卡自身 sticky（2026-07-10 用户真机反馈：完成卡持久悬浮、钻取中的反而滚走→反转为按运行状态）：
// 编剧卡固定占 0 号钉位；下方派遣卡的堆叠序号已交共享组件自理（band 传 :sticky-order-start="scriptwriterRunning ? 1 : 0"
// 让派遣卡续着编剧卡的钉位往下堆叠，见模板）。
const scriptwriterStickyStyle = computed<{ top: string } | undefined>(() => (scriptwriterRunning.value ? { top: '0px' } : undefined))
// 场记（2026-06-29 生·原「state 查看器」）：点击「场记」入口看本带主记录（决策流）+ 子记录（各演员钻取明细）。
// 批次G：sidebar 模式（桌面）经模块桥开 AppChatSection 挤压侧栏；payload 传 getter（闭包捕获响应式 props）
// ——活动带 loop 推进时侧栏实时刷新，不是点击时的死快照。overlay 模式（移动/缺省）仍开本地浮层。
const stateInspectorOpen = ref(false)
// 四面板共用一个 ownerKey：带子卸载时不论侧栏当前开的是哪个面板，只要是本带发起的就关。
const panelSidebarOwnerKey = allocateTidiaoPanelSidebarOwnerKey()
function openStatePanel(): void {
  if (props.panelMode === 'sidebar') {
    openTidiaoPanelSidebar({
      kind: 'state',
      ownerKey: panelSidebarOwnerKey,
      getStream: () => props.stream || null,
      getShotDetails: () => props.shotDetails,
      getMemoryProjection: () => props.memoryProjection || ''
    })
    return
  }
  stateInspectorOpen.value = true
}
// 带子卸载（会话切换/轮被替换）时只关自己发起的挤压面板，防 getter 指向已冻结的旧 props。
onUnmounted(() => closeTidiaoPanelSidebarIfOwner(panelSidebarOwnerKey))
// 渲染兜底：直播态 stream 永远经 builder 规整、decisions/shots 必是数组；但历史复原走的是落库裸 JSON
// （半成品 correcting/failed 快照也会落库），可能缺字段。模板一律消费下面两个规整 computed，
// 杜绝 `undefined.length` 在渲染期抛 TypeError → 无 ErrorBoundary 时整棵组件树崩白屏。
const decisions = computed(() => (Array.isArray(props.stream?.decisions) ? props.stream.decisions : []))
const shots = computed(() => (Array.isArray(props.stream?.shots) ? props.stream.shots : []))

// compact 新镜绿点：只在 running 相位对「镜数增长」点灯——历史轮切换时 shots.length 跳变
//（phase 已是 done/failed）不误点；watch 必须放在 shots 定义之后（创建时即求值一次）。
watch(() => shots.value.length, (len, old) => {
  if (!props.compact || props.stream?.phase !== 'running') return
  if (compactTab.value !== 'shots' && len > (old ?? 0)) shotsTabDot.value = true
})

// R3-5·P25 修误判：区分「结构性失败=没产出」与「已出内容但后置某步未完成」。
// failed 但已有决策/分镜（提调真做过编排、通常已出回复）→ 不报刺眼红字错误，柔和标「部分完成」并仍给重试；
// failed 且零产出（真结构性失败）才保留红字错误态。根治「给了回复但没调成功工具被误判成错误态」（P25）。
const isPartialOutcome = computed(() =>
  props.stream?.phase === 'failed' && (decisions.value.length > 0 || shots.value.length > 0)
)

// 工具条参数/结果默认折叠（省略），点击整条展开看全文——按决策「位置下标」记展开态（每条决策至多挂一个工具）。
// 不用决策 id：纠偏/重生成续跑会把上一轮决策并入本轮，两段各自从 decision_1 起编号 → id 可能重复，
// 按 id 记会让同 id 的旧决策跟着一起展开（串台）。决策流 append-only，位置下标才是稳定唯一的真身份。
const openTools = ref<Set<number>>(new Set())
function toolHasText(tool?: { detail?: string; resultPreview?: string }): boolean {
  return Boolean(String(tool?.detail || '').trim() || String(tool?.resultPreview || '').trim())
}
function isToolOpen(index: number): boolean {
  return openTools.value.has(index)
}
function toggleTool(index: number): void {
  const next = new Set(openTools.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  openTools.value = next
}

// 形态1·E5：角色镜钻取明细（按 shot.id 记展开态——shot.id 在一份快照里唯一稳定）。
// 只角色镜可钻取；旁白镜 / 无明细的角色镜不挂"点开"。
const openShots = ref<Set<string>>(new Set())
function detailOf(shot: TidiaoStreamShot): TidiaoShotDetail | null {
  if (shot.kind !== 'character') return null
  return props.shotDetails?.[shot.label] || null
}
// 旁白镜钻取（旁白独立分镜工作流 2026-06-30）：旁白镜不走角色编排明细（取料/评审/情境），
// 只展示一条「定方向（提调本轮已定·恒 done）→ 生成旁白（随 shot.narrationGen running→done/failed）」的工作流轨，
// 复用角色镜 tds-wf 视觉。narrationGen：running=生成中 / failed=失败 / pending=方向已定待生成（waiting）/
// done 或 undefined（历史快照无该字段）按已完成兜底，避免老快照旁白镜空轨。
function narrationWfSteps(shot: TidiaoStreamShot): TidiaoShotStep[] {
  if (shot.kind !== 'narration') return []
  const gen = shot.narrationGen
  const genStatus: TidiaoShotStep['status'] =
    gen === 'running' ? 'running'
      : gen === 'failed' ? 'failed'
        : gen === 'pending' ? 'waiting'
          : 'done'
  const elapsed = String(shot.narrationGenElapsed || '').trim()
  return [
    { id: 'direction', label: '定方向', icon: 'check', status: 'done' },
    {
      id: 'narrationGen',
      label: '生成旁白',
      icon: 'narrate',
      status: genStatus,
      ...((genStatus === 'done' || genStatus === 'failed') && elapsed ? { elapsed } : {})
    }
  ]
}
function isShotOpen(id: string): boolean {
  return openShots.value.has(id)
}
function toggleShot(id: string): void {
  const next = new Set(openShots.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openShots.value = next
}

// 批次B·方向折叠：方向超 100 字默认折叠（旁白方向通常很长，靠这里收纳），展开按钮控制看全文。
const DIRECTION_FOLD_LIMIT = 100
function directionNeedsFold(shot: TidiaoStreamShot): boolean {
  return String(shot.direction || '').length > DIRECTION_FOLD_LIMIT
}
// 折叠态截断到 100 字 + 省略号；展开态（isShotOpen）或本就不超长则给全文。
function directionDisplay(shot: TidiaoStreamShot): string {
  const text = String(shot.direction || '')
  if (!directionNeedsFold(shot) || isShotOpen(shot.id)) return text
  return text.slice(0, DIRECTION_FOLD_LIMIT) + '…'
}
// 展开按钮出现条件（合并）：①旁白镜恒可钻取（看「定方向→生成旁白」轨）；②角色镜有编排明细（detailOf）
// 或方向需折叠（超 100 字）其一即挂按钮。
function shotExpandable(shot: TidiaoStreamShot): boolean {
  if (shot.kind === 'narration') return true
  return Boolean(detailOf(shot)) || directionNeedsFold(shot)
}
// 按钮 title 随镜种/是否带编排明细给不同说明：旁白镜一键展开全文方向 + 旁白生成过程；
// 角色镜一键同时展开全文方向 + 取料/评审过程；纯方向折叠只展开全文。
function shotToggleTitle(shot: TidiaoStreamShot): string {
  const open = isShotOpen(shot.id)
  if (shot.kind === 'narration') return open ? '收起方向全文与旁白生成过程' : '展开看方向全文 + 旁白生成过程'
  if (detailOf(shot)) return open ? '收起全文与本角色编排过程' : '展开看全文方向 + 本角色取料/评审过程'
  return open ? '收起方向全文' : '展开看方向全文'
}

// 工作流步骤节点视觉态：retry 视觉等同 running（转圈 + 强调色），仅标签文案不同；未知态回退 waiting。
function wfVisual(status: string): 'waiting' | 'running' | 'done' | 'failed' {
  if (status === 'retry') return 'running'
  if (status === 'running' || status === 'done' || status === 'failed') return status
  return 'waiting'
}

// 评审降级原因 / 旁白结论理由：点击对应步骤 tag 后就地内联展开（按 shotId:kind 记展开态）。
const openWfNotes = ref<Set<string>>(new Set())
function wfNoteKey(shotId: string, kind: 'review'): string {
  return `${shotId}:${kind}`
}
function isWfNoteOpen(shotId: string, kind: 'review'): boolean {
  return openWfNotes.value.has(wfNoteKey(shotId, kind))
}
function toggleWfNote(shotId: string, kind: 'review'): void {
  const key = wfNoteKey(shotId, kind)
  const next = new Set(openWfNotes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openWfNotes.value = next
}

const chipClass = computed(() => ({
  'tds-chip--run': props.stream.phase === 'running',
  // R3-5·P25：部分完成（failed 但有产出）走 done 视觉、不走红字 fail。
  'tds-chip--done': props.stream.phase === 'done' || isPartialOutcome.value,
  'tds-chip--fail': props.stream.phase === 'failed' && !isPartialOutcome.value,
  'tds-chip--corr': props.stream.phase === 'correcting'
}))

// running 末句打字机逐字（§4 拍板①：loop 句级真实 + 前端逐字）。
// builder 只在 phase==='running' 时给最后一条决策标 streaming，所以这里取「末条且 streaming」为打字目标。
const streamingDecision = computed(() => {
  // 叠一道 phase==='running' 守卫：done/correcting/failed 及历史复原一律静态全显（与旧 band 同口径）。
  if (props.stream?.phase !== 'running') return null
  const ds = decisions.value
  const last = ds[ds.length - 1]
  return last && last.streaming ? last : null
})
// 用「末条位置下标」而非决策 id 标记流式行：纠偏/重生成续跑会把上一轮决策并入本轮，两段各自从
// decision_1 起编号 → id 可能重复；按 id 匹配会让上一轮那条同 id 的旧决策跟着一起重播打字 + 绿光标
// （用户 2026-06-22 反馈「之前的消息和最新的一起播放动画」的根因）。append-only 流里位置才是唯一真身份。
const streamingIndex = computed(() => (streamingDecision.value ? decisions.value.length - 1 : -1))

const TYPE_INTERVAL_MS = 30
const typedChars = ref(0)
let typeTimer: ReturnType<typeof setInterval> | null = null
let lastStreamIndex = -1
function stopTypeTimer() { if (typeTimer) { clearInterval(typeTimer); typeTimer = null } }

const typedText = computed(() => {
  const d = streamingDecision.value
  if (!d) return ''
  return d.text.slice(0, Math.min(typedChars.value, d.text.length))
})

// 监听打字目标（末条位置 + 文本）：换条决策（位置变）从头打；同条文本增长保留进度；越界归零。
watch(
  () => {
    const d = streamingDecision.value
    return d ? `${streamingIndex.value} ${d.text}` : ''
  },
  () => {
    stopTypeTimer()
    const d = streamingDecision.value
    if (!d) { lastStreamIndex = -1; return }
    if (streamingIndex.value !== lastStreamIndex) { typedChars.value = 0; lastStreamIndex = streamingIndex.value }
    if (typedChars.value > d.text.length) typedChars.value = 0
    typeTimer = setInterval(() => {
      const target = streamingDecision.value
      if (!target || typedChars.value >= target.text.length) { stopTypeTimer(); return }
      typedChars.value += 1
    }, TYPE_INTERVAL_MS)
  },
  { immediate: true }
)

onUnmounted(stopTypeTimer)

// 角色镜真实头像 URL（按角色名取，无则空 → 模板回退首字竖底）。旁白镜不取头像。
function shotAvatarUrl(shot: { kind: string; label?: string }): string {
  if (shot.kind === 'narration') return ''
  return String(props.resolveAvatar?.(String(shot.label || '')) || '')
}

// 决策类型 → 节点图标（无图标的兜底 note 用小圆点）。
const KIND_ICON: Record<TidiaoDecisionKind, string> = {
  analyze: 'search',
  recall: 'radar',
  situation: 'compass',
  narrationDir: 'narrate',
  castDir: 'user',
  deepen: 'layers',
  planPrompt: 'pen',
  generate: 'sparkles',
  review: 'gauge',
  compose: 'pen',
  edit: 'pen',
  correction: 'message',
  note: ''
}
function kindIcon(kind: TidiaoDecisionKind): string {
  return KIND_ICON[kind] ?? ''
}

// 决策类型 → 节点配色（克制色板：蓝=分析/取料/计划，主色=角色方向，金=评审，强调色=旁白/正文/纠偏，幽灵=兜底）。
function nodeClass(kind: TidiaoDecisionKind): string {
  switch (kind) {
    case 'analyze':
    case 'recall':
    case 'situation':
    case 'planPrompt':
    case 'generate':
      return 'tds-node--blue'
    case 'castDir':
      return 'tds-node--primary'
    case 'review':
      return 'tds-node--gold'
    case 'narrationDir':
    case 'compose':
    case 'correction':
      return 'tds-node--accent'
    default:
      return 'tds-node--ghost'
  }
}

// Lucide 线性图标内联 path（沿用旧带 TidiaoOrchestrationBand（已删除）的 BandIcon 渲染方式，同一 Lucide 家族，非平行体系）。
const ICONS: Record<string, string> = {
  clapperboard: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3 5.7"/><path d="m12.4 3.4 3 5.7"/><path d="M4.5 11h15a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-7A1.5 1.5 0 0 1 4.5 11Z"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  narrate: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h2v2a2 2 0 0 1-2 2"/><path d="M14 9h2v2a2 2 0 0 1-2 2"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  // 绘舆运行卡（地图系统批5）：Lucide map 折叠地图。
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sparkles: '<path d="M9.94 14.06A2 2 0 0 0 8.5 12.6l-5.6-1.45a.5.5 0 0 1 0-.96L8.5 8.74a2 2 0 0 0 1.44-1.44L11.39 1.7a.5.5 0 0 1 .96 0l1.45 5.6a2 2 0 0 0 1.44 1.44l5.6 1.45a.5.5 0 0 1 0 .96l-5.6 1.45a2 2 0 0 0-1.44 1.44l-1.45 5.6a.5.5 0 0 1-.96 0Z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8"/><path d="M3 4v4h4"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  // 角色镜工作流步骤轨节点图标（与旧 ChatProcessTrace 同款 Lucide path）。
  'file-search': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="11" cy="14" r="2"/><path d="m12.5 15.5 2 2"/>',
  radar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
  'scan-text': '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h10"/><path d="M7 16h6"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  // 剧本入口（2026-07-06）：卷轴（scroll-text）——clapperboard 已是提调带头部 logo，剧本入口避开撞语义。
  'scroll-text': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  'pen-line': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'clipboard-pen': '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6.5"/><path d="M4 13.5V6a2 2 0 0 1 2-2h2"/>'
}

const DirIcon = defineComponent({
  name: 'DirIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 14 },
    stroke: { type: Number, default: 1.8 },
    solid: { type: Boolean, default: false }
  },
  setup(p) {
    return () => h('svg', {
      width: p.size,
      height: p.size,
      viewBox: '0 0 24 24',
      fill: p.solid ? 'currentColor' : 'none',
      stroke: p.solid ? 'none' : 'currentColor',
      'stroke-width': p.stroke,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      innerHTML: ICONS[p.name] || ''
    })
  }
})
</script>

<style scoped>
/* 颜色全部走项目 token；浅色衬底用 color-mix 透明混合，暗色模式随 token 自动适配。
   沿用旧带 TidiaoOrchestrationBand（已删除）的视觉语言（细线、浅底、克制圆角、纸面气质）。 */
.tds {
  margin: 16px 0;
  padding: 16px 22px;
  background: color-mix(in srgb, var(--morandi-primary) 4%, transparent);
  /* 四角圆角卡片（取代旧的上下边框横条），克制圆角 + 细边，沿用纸面气质。 */
  border: 1px solid color-mix(in srgb, var(--morandi-primary) 13%, transparent);
  border-radius: 14px;
  color: var(--morandi-text);
  font-size: 0.85rem;
}

/* ---------- 展开态 header ---------- */
.tds-head { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
.tds-head-icon {
  width: 28px; height: 28px; flex: none; border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-accent) 12%, transparent);
  display: flex; align-items: center; justify-content: center; color: var(--morandi-accent);
}
.tds-head-name { font-size: 0.92rem; font-weight: 700; color: var(--morandi-primary); letter-spacing: 0.01em; flex: none; }
.tds-head-speaker { font-size: 0.8rem; color: var(--morandi-secondary); flex: none; }
.tds-chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: 0.74rem;
  border-radius: 999px; padding: 2px 10px; white-space: nowrap; max-width: 50%;
  overflow: hidden; text-overflow: ellipsis;
}
.tds-chip--run { color: var(--morandi-accent); background: color-mix(in srgb, var(--morandi-accent) 10%, transparent); padding-left: 8px; }
.tds-chip--done { color: var(--morandi-accent); background: color-mix(in srgb, var(--morandi-accent) 10%, transparent); }
.tds-chip--corr { color: color-mix(in srgb, var(--morandi-exp-gold) 70%, #000); background: color-mix(in srgb, var(--morandi-exp-gold) 16%, transparent); }
.tds-chip--fail { color: var(--morandi-danger); background: color-mix(in srgb, var(--morandi-danger) 10%, transparent); }
.tds-dot-pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--morandi-accent); animation: tds-pulse 1.6s infinite; }
.tds-spacer { flex: 1; }
/* 批次I·侧栏入口按钮：细边浅底胶囊，与工具条同一克制语言 */
.tds-entry {
  display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem; flex: none;
  color: var(--morandi-info); background: color-mix(in srgb, var(--morandi-info) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--morandi-info) 24%, transparent); border-radius: 999px;
  padding: 3px 10px; cursor: pointer;
}
.tds-entry:hover { background: color-mix(in srgb, var(--morandi-info) 15%, transparent); }
/* 编剧运行角标：consultScript 调用中的脉冲点+活秒表。 */
.tds-entry.is-script-running { border-color: color-mix(in srgb, var(--morandi-accent) 45%, transparent); }
.tds-entry-run { display: inline-flex; align-items: center; gap: 4px; margin-left: 2px; font-size: 0.68rem; color: var(--morandi-accent); }
.tds-entry-run-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--morandi-accent); animation: tds-script-pulse 1.1s ease-in-out infinite; }
@keyframes tds-script-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }

/* ---------- 两栏 ---------- */
/* 分镜栏加宽（用户 2026-06-22：旧 220px 太窄、每角色取料/评审过程挤在一起）：
   拓到 360px，给角色镜「点开」后的工作流步骤轨足够横向空间。窄屏/compact 仍堆叠成一栏。 */
.tds-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; align-items: start; }
.tds-col-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.tds-col-title { font-size: 0.78rem; font-weight: 700; color: var(--morandi-text); letter-spacing: 0.02em; }

/* ---------- 决策流 · 子agent运行卡（编剧/采风共用骨架） ---------- */
/* sticky 改按运行状态（2026-07-10 用户真机反馈）：只有 running 卡相对最近滚动祖先（坞内容区
   .tds-dock__content）钉顶持久悬浮，多卡并行时内联 top 按联合序号递增堆叠（这里的 top:0 是兜底）；
   done/error 回归文档流，随滚动滚走。底色必须不透明（纸面 card 混一点主色），否则钉住时下面滚过的决策文字会透出来。 */
.tds-script-card {
  margin-bottom: 10px;
  background: color-mix(in srgb, var(--morandi-primary) 5%, var(--morandi-card));
  border: 1px solid var(--morandi-border);
  border-radius: 9px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.tds-script-card--running {
  position: sticky; top: 0; z-index: 6;
  border-color: color-mix(in srgb, var(--morandi-accent) 38%, transparent);
}
.tds-script-card--error { border-color: color-mix(in srgb, var(--morandi-danger) 32%, transparent); }
/* 收起态窄容器防溢出（2026-07-12）：head 需 min-width:0 才能让子元素省略生效；标题收缩、状态字恒定不缩，
   展开态标题改多行显示。此处与 SubagentDispatchCardList.vue 的 .tds-script-* 是联动副本，改动需同步
   （本文件的编剧卡无 name-sub/is-open 实际用点，仍保持规则同构）。
   例外：该组件的 .tds-script-group-*（已结束卡折叠小结行）是卡列表独有概念，不在同步范围。 */
.tds-script-head {
  display: flex; align-items: center; gap: 7px; width: 100%;
  min-width: 0;
  padding: 6px 10px; background: none; border: none; cursor: pointer;
  font-size: 0.78rem; color: var(--morandi-text); text-align: left;
}
/* 展开态换行（批I·真机纵排 bug 修复·与 SubagentDispatchCardList.vue 同步）：head 允许换行，
   name-sub 用 order 沉到第二行独占整行自然换行——首行保持图标/名/状态字/toggle。收起态规则不动。 */
.tds-script-card.is-open .tds-script-head { align-items: flex-start; flex-wrap: wrap; }
.tds-script-icon { display: inline-flex; color: var(--morandi-accent); flex: none; }
.tds-script-name { font-weight: 600; flex: none; }
/* 采风卡任务小标题正常字重（2026-07-10 用户反馈）：字号/颜色随 .tds-script-head 继承与名字一致，只是不加粗。 */
.tds-script-name-sub {
  font-weight: 400; flex: 0 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tds-script-card.is-open .tds-script-name-sub {
  flex: 1 1 100%; order: 10; min-width: 0;
  white-space: normal; overflow: visible; text-overflow: clip; word-break: break-word;
}
.tds-script-state {
  display: inline-flex; align-items: center; gap: 5px; min-width: 0; flex: 1 1 auto;
  font-size: 0.74rem; color: var(--morandi-accent);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tds-script-card--error .tds-script-state { color: var(--morandi-danger); }
.tds-script-toggle {
  display: inline-flex; align-items: center; gap: 2px; flex: none; margin-left: auto;
  font-size: 0.7rem; color: var(--morandi-info);
}
.tds-script-toggle :deep(svg) { transition: transform 0.18s ease; }
.tds-script-card.is-open .tds-script-toggle :deep(svg) { transform: rotate(180deg); }
.tds-script-body {
  display: flex; flex-direction: column; gap: 6px;
  padding: 7px 10px 9px; margin: 0 6px 0;
  border-top: 1px dashed color-mix(in srgb, var(--morandi-primary) 16%, transparent);
}
.tds-script-error { font-size: 0.74rem; color: var(--morandi-danger); line-height: 1.45; word-break: break-word; }
.tds-script-io-label { font-size: 0.7rem; font-weight: 600; color: var(--morandi-secondary); margin-bottom: 3px; }
.tds-script-io-text {
  margin: 0; padding: 6px 8px; max-height: 180px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
  font-family: inherit; font-size: 0.74rem; line-height: 1.5; color: var(--morandi-text-light);
  background: var(--morandi-surface); border: 1px solid var(--morandi-border); border-radius: 7px;
}
.tds-script-io-hint { font-size: 0.72rem; color: var(--morandi-secondary); font-style: italic; }

/* ---------- 决策流 ---------- */
.tds-decisions { position: relative; }
.tds-rail {
  position: absolute; left: 11px; top: 6px; bottom: 8px; width: 1.5px;
  background: linear-gradient(color-mix(in srgb, var(--morandi-primary) 22%, transparent), color-mix(in srgb, var(--morandi-primary) 12%, transparent));
}
.tds-dec { position: relative; padding-left: 34px; padding-bottom: 12px; }
.tds-node {
  position: absolute; left: 0; top: 0; width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.tds-node--accent { background: color-mix(in srgb, var(--morandi-accent) 16%, var(--morandi-card)); color: var(--morandi-accent); }
.tds-node--primary { background: color-mix(in srgb, var(--morandi-primary) 16%, var(--morandi-card)); color: var(--morandi-primary); }
.tds-node--gold { background: color-mix(in srgb, var(--morandi-exp-gold) 22%, var(--morandi-card)); color: color-mix(in srgb, var(--morandi-exp-gold) 78%, #000); }
.tds-node--blue { background: color-mix(in srgb, var(--morandi-info) 22%, var(--morandi-card)); color: color-mix(in srgb, var(--morandi-info) 72%, #000); }
.tds-node--ghost { background: var(--morandi-hover); color: var(--morandi-secondary); }
.tds-node-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.tds-dec-body { min-width: 0; padding-top: 2px; }
.tds-dec-text { font-size: 0.86rem; color: var(--morandi-text-light); line-height: 1.55; }
.tds-dec--stream .tds-dec-text { color: var(--morandi-text); }

/* 工具调用条：表现上与叙述分开（浅底细边 + 状态点）。
   折叠态：参数单行省略、结果裁剪两行；展开态（点击）：参数与结果全文显示。 */
.tds-tool {
  display: flex; flex-direction: column; gap: 4px; align-self: flex-start; max-width: 100%; margin-top: 6px;
  background: var(--morandi-surface); border: 1px solid var(--morandi-border); border-radius: 8px; padding: 5px 10px;
  font-size: 0.78rem; color: var(--morandi-text-light);
}
.tds-tool--expandable { cursor: pointer; }
.tds-tool--expandable:hover { border-color: color-mix(in srgb, var(--morandi-info) 34%, var(--morandi-border)); }
.tds-tool-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.tds-tool-icon { display: inline-flex; color: var(--morandi-info); flex: none; }
.tds-tool-label { color: var(--morandi-text); font-weight: 500; flex: none; }
.tds-tool-detail { color: var(--morandi-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tds-tool-status { display: inline-flex; align-items: center; flex: none; }
.tds-tool-toggle { flex: none; margin-left: auto; color: var(--morandi-info); font-size: 0.7rem; }
.tds-tool-result { color: var(--morandi-text-light); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* 展开态：参数与结果都显示全文 */
.tds-tool--open .tds-tool-detail { overflow: visible; white-space: normal; word-break: break-word; }
.tds-tool--open .tds-tool-result { -webkit-line-clamp: unset; overflow: visible; white-space: pre-wrap; word-break: break-word; }
.tds-tool--done .tds-tool-status { color: var(--morandi-accent); }
.tds-tool--error { border-color: color-mix(in srgb, var(--morandi-danger) 32%, transparent); }
.tds-tool--error .tds-tool-status { color: var(--morandi-danger); }
.tds-tool-spin {
  width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--morandi-info) 30%, transparent);
  border-top-color: var(--morandi-info); animation: tds-spin 0.8s linear infinite;
}

.tds-empty { font-size: 0.8rem; color: var(--morandi-secondary); padding: 4px 0 4px 2px; font-style: italic; }

/* ---------- 实时分镜 ---------- */
.tds-shots-count { font-size: 0.72rem; color: var(--morandi-primary); background: color-mix(in srgb, var(--morandi-primary) 10%, transparent); border-radius: 999px; padding: 1px 8px; }
.tds-shot-list { display: flex; flex-direction: column; gap: 7px; }
.tds-shot {
  display: flex; gap: 10px; align-items: center;
  background: var(--morandi-card); border: 1px solid var(--morandi-border); border-radius: 9px; padding: 7px 10px;
}
.tds-shot--narr { border-left: 3px solid var(--morandi-accent); }
.tds-shot--char { border-left: 3px solid var(--morandi-primary); }
/* 竖长方形头像作左侧视觉锚（真实头像/首字竖底/旁白图标），序号做左上角标——去旧独立序号列，消除左侧空白。 */
.tds-shot-figure { position: relative; flex: none; }
.tds-shot-portrait {
  width: 34px; height: 44px; border-radius: 8px; object-fit: cover; display: block;
  background: var(--morandi-soft-bg-strong); border: 1px solid var(--morandi-border);
}
.tds-shot-portrait--initial {
  display: flex; align-items: center; justify-content: center;
  color: var(--morandi-primary); font-size: 0.92rem; font-weight: 600;
}
.tds-shot-portrait--narr {
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--morandi-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--morandi-accent) 30%, transparent);
  color: var(--morandi-accent);
}
.tds-shot-order {
  position: absolute; top: -5px; left: -5px;
  min-width: 16px; height: 16px; padding: 0 3px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.66rem; font-weight: 700; line-height: 1;
  color: #fff; background: var(--morandi-primary);
  border-radius: 999px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.tds-shot--narr .tds-shot-order { background: var(--morandi-accent); }
.tds-shot-body { min-width: 0; flex: 1 1 auto; }
.tds-shot-title { font-size: 0.83rem; color: var(--morandi-text); display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.tds-shot-name { font-weight: 600; }
.tds-shot-tag { font-size: 0.7rem; color: var(--morandi-accent); background: color-mix(in srgb, var(--morandi-accent) 10%, transparent); border-radius: 999px; padding: 1px 7px; }
.tds-shot-tag--plain { color: var(--morandi-secondary); background: color-mix(in srgb, var(--morandi-primary) 8%, transparent); }
.tds-shot-dir { font-size: 0.8rem; color: var(--morandi-text-light); margin-top: 2px; line-height: 1.5; }

/* ---------- 形态1·E5 角色镜钻取（per-speaker 过程可见性） ---------- */
.tds-shot-drill {
  display: inline-flex; align-items: center; gap: 2px; flex: none; margin-left: auto;
  font-size: 0.68rem; color: var(--morandi-info); background: none; border: none; cursor: pointer; padding: 0;
}
.tds-shot-drill :deep(svg) { transition: transform 0.18s ease; }
.tds-shot-drill.is-open :deep(svg) { transform: rotate(180deg); }
.tds-shot-drill:hover { color: color-mix(in srgb, var(--morandi-info) 78%, #000); }
.tds-shot-detail {
  margin-top: 7px; padding-top: 7px;
  border-top: 1px dashed color-mix(in srgb, var(--morandi-primary) 16%, transparent);
  display: flex; flex-direction: column; gap: 4px;
}
.tds-sd-row { font-size: 0.74rem; color: var(--morandi-text-light); display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.tds-sd-step { font-weight: 600; color: var(--morandi-text); }
.tds-sd-meta { color: var(--morandi-secondary); }
.tds-sd-scn { color: var(--morandi-text-light); }
.tds-sd-tool {
  display: flex; align-items: center; gap: 5px; font-size: 0.73rem; color: var(--morandi-text-light);
  word-break: break-word; line-height: 1.45;
}
.tds-sd-tool-icon { display: inline-flex; color: var(--morandi-info); flex: none; }
.tds-sd-hint { font-size: 0.7rem; color: var(--morandi-secondary); font-style: italic; line-height: 1.45; }

/* ---------- 角色镜动态工作流步骤轨（复刻旧 ChatProcessTrace 节点轨骨架，沿用同一克制视觉语言） ---------- */
.tds-wf { position: relative; padding: 2px 0; }
.tds-wf-rail {
  position: absolute; left: 10px; top: 14px; bottom: 14px; width: 1.5px;
  background: linear-gradient(color-mix(in srgb, var(--morandi-primary) 22%, transparent), color-mix(in srgb, var(--morandi-primary) 10%, transparent));
}
.tds-wf-row { position: relative; display: flex; align-items: center; gap: 7px; min-height: 26px; padding-left: 30px; }
.tds-wf-node {
  position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 21px; height: 21px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--morandi-card); border: 1px solid var(--morandi-border); color: var(--morandi-secondary);
}
.tds-wf-node--running { background: color-mix(in srgb, var(--morandi-accent) 14%, var(--morandi-card)); border-color: color-mix(in srgb, var(--morandi-accent) 32%, transparent); color: var(--morandi-accent); }
.tds-wf-node--done { background: color-mix(in srgb, var(--morandi-accent) 16%, var(--morandi-card)); border-color: transparent; color: var(--morandi-accent); }
.tds-wf-node--failed { background: color-mix(in srgb, var(--morandi-danger) 14%, var(--morandi-card)); border-color: color-mix(in srgb, var(--morandi-danger) 32%, transparent); color: var(--morandi-danger); }
.tds-wf-node .tds-node-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.tds-wf-label { font-size: 0.78rem; color: var(--morandi-text-light); min-width: 0; }
.tds-wf-node--done + .tds-wf-label,
.tds-wf-node--running + .tds-wf-label { color: var(--morandi-text); }
.tds-wf-tag { font-size: 0.66rem; line-height: 1; border-radius: 999px; padding: 2px 7px; flex: none; border: none; cursor: default; }
button.tds-wf-tag { cursor: pointer; }
.tds-wf-tag--run { color: var(--morandi-accent); background: color-mix(in srgb, var(--morandi-accent) 12%, transparent); }
.tds-wf-tag--fail { color: var(--morandi-danger); background: color-mix(in srgb, var(--morandi-danger) 12%, transparent); }
.tds-wf-tag--skip { color: color-mix(in srgb, var(--morandi-exp-gold) 70%, #000); background: color-mix(in srgb, var(--morandi-exp-gold) 16%, transparent); }
.tds-wf-time { font-size: 0.68rem; color: var(--morandi-secondary); margin-left: auto; flex: none; }
.tds-wf-note {
  margin: 0 0 4px 30px; padding: 5px 9px; font-size: 0.72rem; line-height: 1.45;
  color: var(--morandi-text-light); background: var(--morandi-surface);
  border: 1px solid var(--morandi-border); border-radius: 7px; word-break: break-word;
}
.tds-wf-spin {
  width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--morandi-accent) 30%, transparent);
  border-top-color: var(--morandi-accent); animation: tds-spin 0.8s linear infinite;
}

/* ---------- 底栏 ---------- */
.tds-bottom {
  display: flex; align-items: center; gap: 9px; margin-top: 14px; padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-primary) 10%, transparent);
}
.tds-btn {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 0.79rem;
  border-radius: 8px; padding: 6px 13px; cursor: pointer; border: none;
}
.tds-btn--retry { color: var(--langhuan-dialog-secondary-text); background: var(--morandi-soft-bg-strong); }
.tds-btn--retry:hover { background: var(--morandi-hover); }
.tds-bottom-hint { font-size: 0.75rem; color: var(--morandi-secondary); }
.tds-bottom-ok { font-size: 0.75rem; color: var(--morandi-text-light); display: inline-flex; align-items: center; gap: 5px; }
.tds-bottom-ok :deep(svg) { color: var(--morandi-accent); }
.tds-bottom-fail { font-size: 0.75rem; color: var(--morandi-danger); display: inline-flex; align-items: center; gap: 5px; }
/* R3-5·P25：部分完成——柔和中性色（同 ok 基调，不报红字），仍带「个别步骤未完成」说明。 */
.tds-bottom-partial { font-size: 0.75rem; color: var(--morandi-text-light); display: inline-flex; align-items: center; gap: 5px; }
.tds-bottom-partial :deep(svg) { color: var(--morandi-accent); }
.tds-corr-icon { flex: none; color: var(--morandi-primary); display: inline-flex; }

/* ---------- 窄屏 / 移动端紧凑（2026-07-05 设计稿）：tab 二选一取代两栏堆叠 ---------- */
.tds--compact { padding: 10px 14px 8px; }
/* 必须 minmax(0,1fr) 而非裸 1fr（真机一验修）：裸 1fr 最小宽=min-content，工具条 nowrap 参数预览
   （.tds-tool-detail）会把整列撑得比屏宽 → 决策流要横向拖才能看全；minmax(0) 封死后 nowrap 走省略号、正文换行。 */
.tds--compact .tds-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
/* tab 行本身已标明「信息流/分镜」（分镜数在 tab 徽标上），栏内小标题在 compact 下冗余、隐藏。 */
.tds--compact .tds-col-head { display: none; }
.tds--compact .tds-head { margin-bottom: 8px; }

/* compact tab 行：扁平下划线 tab（项目 tab 范式·非药丸）＋右侧图标化入口。 */
.tds-tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  margin: 0 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-primary) 13%, transparent);
}
.tds-tab-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 10px 9px;
  font-size: 0.82rem;
  color: var(--morandi-secondary);
  background: none;
  border: none;
  cursor: pointer;
}
.tds-tab-btn.is-on { color: var(--morandi-text); font-weight: 600; }
.tds-tab-btn.is-on::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2px;
  background: var(--morandi-accent);
}
.tds-tab-badge {
  font-size: 0.66rem;
  color: var(--morandi-primary);
  background: color-mix(in srgb, var(--morandi-primary) 10%, transparent);
  border-radius: 999px;
  padding: 1px 6px;
  line-height: 1.3;
}
.tds-tab-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--morandi-accent); }
.tds-tab-dot--pulse { animation: tds-script-pulse 1.1s ease-in-out infinite; }
/* 图标化入口：视觉小、命中区 ≥40px（触屏拍板）。 */
.tds-tab-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-height: 40px;
  align-self: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--morandi-info);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tds-tab-entry:active { color: color-mix(in srgb, var(--morandi-info) 72%, #000); }
@media (max-width: 560px) {
  /* 同上：minmax(0,1fr) 防 nowrap 内容撑出横向滚动（桌面窄窗堆叠同病同修）。 */
  .tds-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
}

@keyframes tds-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--morandi-accent) 45%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes tds-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .tds-dot-pulse, .tds-tool-spin, .tds-wf-spin { animation: none; }
}
</style>
