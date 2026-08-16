<template>
  <!-- 提调坞（2026-07-04 位置改造第一轮·真机二验后定稿）：提调带常驻聊天区顶部。
       贴顶方案：经 Teleport 挂到 ChatWorkspaceSection 的零高度宿主锚点 .tds-dock-host（header 正下方=聊天区顶边），
       结构上保证贴顶、不受消息滚动影响；宿主不存在（单测直挂 ChatMessageStream）时禁用 Teleport 原地渲染降级。
       收起态=95% 宽、两侧带圆角的橄榄绿条（参考主输入框顶缘绿条造型；与 TidiaoPrecisionEditBar 同色系·
       联动能力：#6e7c57 一处改需同步）；桌面**运行时**收起条加宽为信息条显示与底边绿条同一份 headLabel、非运行时保持细线（2026-07-07）；
       展开态=整块抽屉从顶边拉下来（纸面底色·悬浮盖在消息流上不重排），
       橄榄绿只作抽屉「底边框」，切轮（‹ N/M ›）与收起控件都长在这条底边上（壳控件·带内部 UI 不动）。
       普通模式 loop 启动自动展开、跑完(done)自动收起、failed/correcting/帷幕被改动强制弹开；快速回复模式关闭自动展开，点绿条仍可手动开合。
       compact（移动端·2026-07-05 设计稿定稿）：收起条全出血 8px+中央把手（命中区外扩≥32px）、
       抽屉全出血 72vh、底边 32px；带内改「决策流/分镜」tab 二选一（见 TidiaoDirectorStreamBand compact 分支）。 -->
  <Teleport :to="hostEl" :disabled="!hostEl">
  <div class="tds-dock" :class="{ 'is-open': open, 'tds-dock--compact': compact }">
    <!-- 收起态（常驻入口，同资料池入口常驻语义：无轮记录也保留入口）：
         桌面**运行时**（running/correcting）=信息条（2026-07-07 用户拍板·二验澄清「只在运行时」）——
         与展开态底边绿条同宽同信息（轮数/运行中/活秒表），收起也能感知在跑；非运行时=极细绿线不显示文字。
         compact（2026-07-05 设计稿）：全出血通栏 8px + 中央把手，命中区经 ::after 外扩到 ≥32px（触屏拍板）。 -->
    <button
      v-if="!open"
      type="button"
      class="tds-dock__bar"
      :class="{ 'is-running': liveRunning, 'has-pending': hasPendingInteraction, 'tds-dock__bar--info': showCollapsedInfo }"
      :title="collapsedBarTitle"
      :aria-label="collapsedBarTitle"
      @click="openManually"
    >
      <span v-if="hasPendingInteraction" class="tds-dock__pending-dot" aria-hidden="true"></span>
      <span v-if="compact" class="tds-dock__grip" aria-hidden="true"></span>
      <template v-else-if="showCollapsedInfo">
        <span class="tds-dock__label">{{ headLabel }}</span>
        <span class="tds-dock__spacer"></span>
        <svg class="tds-dock__edge-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </template>
    </button>

    <!-- 展开态：抽屉整块下拉（内容纸面底），底边=橄榄绿条承载控件、点击收起 -->
    <div v-else class="tds-dock__drawer" :class="{ 'has-interaction': hasPendingInteraction }">
      <div ref="contentRef" class="tds-dock__content">
        <div v-if="selectedRound" class="tds-dock__band chat-director-band">
          <TidiaoDirectorStreamBand
            :stream="selectedRound.stream"
            :speaker-name="selectedRound.speakerName"
            :resolve-avatar="resolveAvatar"
            :shot-details="selectedRound.getShotDetails()"
            :recall-pools="selectedRound.getRecallPools()"
            :pool-session-id="poolSessionId"
            :pool-cast-character-ids="poolCastCharacterIds"
            :resolve-name="resolveName"
            :memory-projection="selectedRound.getMemoryProjection()"
            :interactive="liveInteractive"
            :compact="compact"
            :recall-run-id="selectedRound.live ? selectedRound.recallRunId || '' : ''"
            :has-orchestration-audit="selectedRound.live ? Boolean(selectedRound.hasOrchestrationAudit) : false"
            :panel-mode="panelMode"
            :round-key="selectedRound.id"
            :live-round="selectedRound.live"
            @open-recall="$emit('open-recall')"
            @open-orchestration="$emit('open-orchestration')"
          />
        </div>
        <div v-else class="tds-dock__empty">本会话还没有提调记录</div>
      </div>
      <!-- advisory 交互虽不阻断提调，但展示仍与 blocking/halt 共用底部停靠协议。 -->
      <AgentInteractionDock v-if="scopePending || huiyuConfirmPending">
        <!-- 建状态栏 scope 确认卡（并行编排计划批次B·2026-07-10 非阻塞）：统筹弹卡后继续排戏，卡固定在带底部
             等用户处理；与 XingyiDock 同一张共享卡。确认=派「造册」子agent，取消=本会话不再重复询问。 -->
        <div v-if="scopePending" class="tds-dock__scope">
          <StatusScopeConfirmCard
            :key="scopeCardKey"
            :purpose="scopeCardPurpose"
            :character-options="scopePending.characterOptions"
            :character-hint="scopePending.request.characterHint || ''"
            :session-hint="scopePending.request.sessionHint || ''"
            :preselect-session-id="scopePending.sessionId"
            :hint="scopeCardHint"
            @confirm="handleScopeResolve($event)"
            @cancel="handleScopeResolve(null)"
          />
        </div>
        <!-- 绘舆阶段确认卡（人在环上通道统一批C·2026-07-12 非阻塞）：statged 派发（草案/阶段收尾/terraform
             改造）遇确认点时挂在这里等用户处理，提调继续照常收尾不打断；视觉语言对齐 StatusScopeConfirmCard/
             XingyiDock 的 .xingyi-dock__ask 选择卡（同一套容器+选项按钮样式）。点选项或发送自由文本都会
             触发续派（复用同一 buildHuiyuDispatchSeam 的 dispatch，后台跑，进展见运行卡）。 -->
        <div v-if="huiyuConfirmPending" class="tds-dock__huiyu-confirm">
          <div class="tds-dock__huiyu-confirm-q">{{ huiyuConfirmPending.request.title }}</div>
          <!-- 「在地图上看草案」入口（地图草案剪影可视化计划批3）：只在这张卡带了剪影清单时才露出，
               打开的地图弹窗与坞共享同一份 poolSessionId（本卡已按 pending.sessionId===poolSessionId 过滤，
               二者天然同一会话，故弹窗内部世界解析必然对上）。 -->
          <button
            v-if="huiyuConfirmPending.sketches && huiyuConfirmPending.sketches.length"
            type="button"
            class="tds-dock__huiyu-confirm-map-btn"
            @click="huiyuSketchMapOpen = true"
          >在地图上看草案</button>
          <button
            v-for="(option, index) in huiyuConfirmPending.request.options || []"
            :key="index"
            type="button"
            class="tds-dock__huiyu-confirm-opt"
            @click="handleHuiyuConfirmAnswer({ status: 'selection', selection: option.label })"
          >
            <span class="tds-dock__huiyu-confirm-opt-label">{{ option.label }}</span>
            <span v-if="option.note" class="tds-dock__huiyu-confirm-opt-note">{{ option.note }}</span>
          </button>
          <div v-if="huiyuConfirmPending.request.allowOtherInput" class="tds-dock__huiyu-confirm-other">
            <input
              v-model="huiyuConfirmOtherInput"
              class="tds-dock__huiyu-confirm-input"
              placeholder="其他想法…（选项都不合意就自己写，如定向修改意见）"
              @keydown.enter="handleHuiyuConfirmOtherKeydown"
            >
            <button type="button" class="tds-dock__huiyu-confirm-send" :disabled="!huiyuConfirmOtherInput.trim()" @click="submitHuiyuConfirmOther">发送</button>
          </div>
        </div>
        <!-- 剪影草案地图弹窗（地图草案剪影可视化计划批3）：懒加载，提交决策走 handleHuiyuSketchDecision，
             序列化后即等价于「用户在卡片自由输入框里回答」，走上面同一条 resume 通道。 -->
      </AgentInteractionDock>
      <MapViewerDialog
        v-if="huiyuSketchMapOpen && huiyuConfirmPending"
        :open="huiyuSketchMapOpen"
        :session-id="poolSessionId"
        :draft-sketches="huiyuConfirmPending.sketches || []"
        @close="huiyuSketchMapOpen = false"
        @sketch-decision="handleHuiyuSketchDecision"
      />
      <!-- 抽屉底边=橄榄绿条：点空白处收起；切轮按钮 stop 冒泡 -->
      <div
        class="tds-dock__edge"
        role="button"
        tabindex="0"
        title="收起提调带"
        aria-label="收起提调带"
        @click="open = false"
        @keydown.enter.prevent="open = false"
      >
        <button
          type="button"
          class="tds-dock__nav"
          :disabled="selectedIndex <= 0"
          title="上一轮"
          aria-label="上一轮"
          @click.stop="step(-1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span class="tds-dock__label">{{ headLabel }}</span>
        <button
          type="button"
          class="tds-dock__nav"
          :disabled="selectedIndex < 0 || selectedIndex >= rounds.length - 1"
          title="下一轮"
          aria-label="下一轮"
          @click.stop="step(1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <span class="tds-dock__spacer"></span>
        <svg class="tds-dock__edge-hint" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script lang="ts">
import type { TidiaoDirectorStream } from '../../../app/tidiaoDirectorStream'
import type { TidiaoShotDetail } from '../../../app/tidiaoBandModel'
import type { RoundRecallPools } from '../../../app/recallRoundPool'

/** 坞里的一轮：历史轮（落库快照）或活动轮（live=true·实时载体）。
 *  重字段（钻取明细/资料池/喂模型原文）用 getter 惰性取——只有被选中渲染那一轮才真算，
 *  getter 内部读父层 computed/响应式源，渲染期调用自动建立依赖、loop 推进即刷新。 */
export interface TidiaoDirectorDockRound {
  /** 稳定主键：历史轮=锚用户消息 id（加载更早消息导致 index 平移时选中不跳轮）；活动轮=runId。 */
  id: string
  live: boolean
  stream: TidiaoDirectorStream
  speakerName: string
  getShotDetails: () => Record<string, TidiaoShotDetail> | undefined
  getRecallPools: () => RoundRecallPools | null
  getMemoryProjection: () => string
  /** 活动轮专属（批次I 入口）：召回 run id / 编排审计就绪标记。 */
  recallRunId?: string
  hasOrchestrationAudit?: boolean
  /** 提调坞·总消耗：ai_usage_ledger 的 round_id（`round:sessionId:锚用户消息id`），
   *  与 aiUsageContext 的 roundId 同源——返工（纠偏/精修/重生成）都并入原轮，故一条即本轮总消耗。
   *  锚点未知（如群聊尚未落定用户消息）时为空串，坞不查询、不显示消耗。 */
  usageRoundId: string
}
</script>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import TidiaoDirectorStreamBand from './TidiaoDirectorStreamBand.vue'
import { useStickToBottom } from '../../../composables/useStickToBottom'
// 建状态栏 scope 确认（并行编排计划批次B·2026-07-10 非阻塞）：共享卡 + 全局 pending（机制见 tidiaoStatusScopeState 头注释）。
import StatusScopeConfirmCard from '../StatusScopeConfirmCard.vue'
import AgentInteractionDock from '../AgentInteractionDock.vue'
import { getTidiaoStatusScopePendingRef, resumeTidiaoStatusScopeOrchestration } from '../../../app/tidiaoStatusScopeState'
import type { XingyiStatusScopeSelection } from '../../../app/xingyiStatusScopeTool'
// 绘舆阶段确认卡（人在环上通道统一批C·2026-07-12 非阻塞）：全局 pending（机制见 huiyuStageConfirmState 头注释）。
import { getHuiyuStageConfirmPendingRef, resumeHuiyuStageConfirmOrchestration } from '../../../app/huiyuStageConfirmState'
import type { InteractionAnswer } from '../../../app/agentRuntime/interactionContract'
// 剪影草案地图弹窗（地图草案剪影可视化计划批3）：与舆图弹窗同一份组件懒加载（联动能力：地图态由弹窗
// 自己按 sessionId 拉取，本坞只透传 sessionId+draftSketches，不重复实现地图渲染）。
import { serializeHuiyuSketchDecision, type HuiyuSketchDecision } from '../../../app/huiyuOrchestration'
// 帷幕修改 UI 信号（2026-07-07）：updateCurtainScene 真改动帷幕时自增，坞据此强制弹开（见下方 watch）。
import { curtainSceneUpdateSignal, readActiveTidiaoDirectorRoundElapsedMs } from '../../../app/tidiaoDirectorStreamState'
import { formatSubagentRunDuration } from '../../../app/subagentRunStatus'
import { fetchDirectorRoundUsageTotals, type DirectorRoundUsageTotals } from '../../../repositories/aiRepository'
import { formatCacheHitHint } from '../../../utils/aiUsage'

const MapViewerDialog = defineAsyncComponent(() => import('../map/MapViewerDialog.vue'))

const props = withDefaults(defineProps<{
  /** 全部轮（旧→新），活动轮固定排最后；被活动轮接管的历史轮由父层剔除（防同轮双份）。 */
  rounds: TidiaoDirectorDockRound[]
  /** 会话切换信号：变化即复位选中轮与开合态（活动轮 watch 会再按需弹开新会话的运行轮）。 */
  contextKey?: string
  resolveAvatar?: (label: string) => string
  resolveName?: (characterId: string) => string
  poolSessionId?: string
  poolCastCharacterIds?: string[]
  /** 移动端接坞（2026-07-04）：带走紧凑单列堆叠；桌面缺省 false 不变。 */
  compact?: boolean
  /** 是否允许运行态/确认卡/帷幕信号自动展开；快速回复关闭，避免轮后审计打断正文阅读。 */
  autoExpand?: boolean
  /** 面板承载（2026-07-10 四面板统一·原 stateInspectorMode）：桌面=sidebar（场记/剧本/待办/资料池
   *  走 AppChatSection 挤压侧栏）；移动传 overlay（带的本地浮层语义）。 */
  panelMode?: 'overlay' | 'sidebar'
}>(), {
  contextKey: '',
  resolveAvatar: undefined,
  resolveName: undefined,
  poolSessionId: '',
  poolCastCharacterIds: () => [],
  compact: false,
  autoExpand: true,
  panelMode: 'sidebar'
})

defineEmits<{
  (e: 'open-recall'): void
  (e: 'open-orchestration'): void
}>()

/** 贴顶宿主锚点（ChatWorkspaceSection 渲染的零高度 .tds-dock-host）：挂载时探测一次，
 *  找到即 Teleport 过去（结构贴顶）；找不到（单测直挂 ChatMessageStream）禁用 Teleport 原地渲染降级。 */
const hostEl = ref<Element | null>(null)
onMounted(() => {
  hostEl.value = document.querySelector('.tds-dock-host')
})

const open = ref(false)
/** 选中轮 id；空串/失配=跟随最新一轮（活动轮在时即活动轮）。 */
const selectedId = ref('')

const liveRound = computed(() => props.rounds.find((round) => round.live) || null)
const livePhase = computed(() => liveRound.value?.stream.phase || '')
const liveRunning = computed(() => livePhase.value === 'running' || livePhase.value === 'correcting')

// 建状态栏 scope 确认卡（批次B·非阻塞）：全局 pending 且属于本坞会话才显示（切会话不串卡）。
const statusScopePendingRef = getTidiaoStatusScopePendingRef()
const scopePending = computed(() => {
  const pending = statusScopePendingRef.value
  if (!pending) return null
  return props.poolSessionId && pending.sessionId === props.poolSessionId ? pending : null
})
const scopeCardTotal = computed(() => Math.max(1, scopePending.value?.requests?.length || 1))
const scopeCardIndex = computed(() => Math.min(scopeCardTotal.value, Math.max(1, Number(scopePending.value?.currentIndex || 0) + 1)))
const scopeCardKey = computed(() => `${scopePending.value?.sessionId || ''}:${scopeCardIndex.value}:${scopePending.value?.request.characterHint || ''}`)
const scopeCardPurpose = computed(() => scopeCardTotal.value > 1
  ? `第 ${scopeCardIndex.value}/${scopeCardTotal.value} 位 · ${scopePending.value?.request.purpose || ''}`
  : scopePending.value?.request.purpose || '')
const scopeCardHint = computed(() => scopeCardTotal.value > 1
  ? `正在逐人确认造册范围。确认后进入下一位，全部选择完才由后台一次批量造册；取消只跳过当前角色，并在本会话内记住不再询问。当前对话不受影响。`
  : '提调想给角色建状态栏：选好角色、参考对话和文档库范围后确认，会由后台建栏专员按已确认范围取料建卡，当前对话不受影响；取消则不建，本会话内不再重复询问。')
// scope 卡出现=必须让人看见：手动收起后卡还挂着也重新弹开（统筹此时仍在照常排戏，卡不影响出戏）。
watch(scopePending, (pending) => {
  if (!pending || !props.autoExpand) return
  if (liveRound.value) selectedId.value = liveRound.value.id
  open.value = true
}, { immediate: true })
/** 确认/取消当前角色后推进下一张；全部处理完才一次派「造册」后台批量建栏。 */
function handleScopeResolve(selection: XingyiStatusScopeSelection | null): void {
  void resumeTidiaoStatusScopeOrchestration(selection).catch((error) => {
    console.error('scope 确认处理失败:', error)
  })
}

// 绘舆阶段确认卡（人在环上通道统一批C·2026-07-12 非阻塞）：全局 pending 且属于本坞会话才显示（切会话不串卡）。
const huiyuConfirmPendingRef = getHuiyuStageConfirmPendingRef()
const huiyuConfirmPending = computed(() => {
  const pending = huiyuConfirmPendingRef.value
  if (!pending) return null
  return props.poolSessionId && pending.sessionId === props.poolSessionId ? pending : null
})
const hasPendingInteraction = computed(() => Boolean(scopePending.value || huiyuConfirmPending.value))
// 剪影草案地图弹窗开合（地图草案剪影可视化计划批3）：本坞本地态，声明提前到下方 watch 之前（watch 带
// immediate:true，setup 阶段就可能同步引用它）。
const huiyuSketchMapOpen = ref(false)
// 卡出现=必须让人看见（与 scope 卡同语义：提调此时仍在照常排戏/收尾，卡不影响出戏）。
// pending 消失（续派 resume 内部先清 pending）时顺带关掉地图弹窗——卡都没了，弹窗留着无意义。
watch(huiyuConfirmPending, (pending) => {
  if (!pending) {
    huiyuSketchMapOpen.value = false
    return
  }
  if (!props.autoExpand) return
  if (liveRound.value) selectedId.value = liveRound.value.id
  open.value = true
}, { immediate: true })
const huiyuConfirmOtherInput = ref('')
/** 点选项/发送自由文本都触发续派（resume 内部先清 pending·卡随之消失，无双击窗口）；失败只记日志。 */
function handleHuiyuConfirmAnswer(answer: InteractionAnswer): void {
  huiyuConfirmOtherInput.value = ''
  void resumeHuiyuStageConfirmOrchestration(answer).catch((error) => {
    console.error('绘舆确认处理失败:', error)
  })
}
function submitHuiyuConfirmOther(): void {
  const text = huiyuConfirmOtherInput.value.trim()
  if (!text) return
  handleHuiyuConfirmAnswer({ status: 'answered', answer: text })
}

// IME 选字确认回车守卫：composing 中放行原生行为，不把半拼文本当答复发给绘舆编排（同 XingyiDock.vue 口径）。
function handleHuiyuConfirmOtherKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submitHuiyuConfirmOther()
}

/** 地图弹窗提交决策（huiyuSketchMapOpen 声明见上方，与 pending 生命周期无关——用户可能开着弹窗看图
 *  但还没提交决策，关闭弹窗不等于放弃决策，卡片仍在等答复）→ 序列化成决策 JSON，等价于用户在自由
 *  输入框里写了这段答复——直接复用同一条 resume 通道（huiyuStageConfirmState 侧续派入口据决策 JSON
 *  分流到批1 compose 语义）。 */
function handleHuiyuSketchDecision(payload: { kind: 'huiyu-sketch-decision' } & HuiyuSketchDecision): void {
  huiyuSketchMapOpen.value = false
  handleHuiyuConfirmAnswer({ status: 'answered', answer: serializeHuiyuSketchDecision(payload) })
}

const selectedIndex = computed(() => {
  if (!props.rounds.length) return -1
  const idx = props.rounds.findIndex((round) => round.id === selectedId.value)
  return idx >= 0 ? idx : props.rounds.length - 1
})
const selectedRound = computed(() => (selectedIndex.value >= 0 ? props.rounds[selectedIndex.value] : null))

/** 交互开关沿用旧口径（running/correcting 亮动作区）；历史轮恒不可交互。 */
const liveInteractive = computed(() => Boolean(selectedRound.value?.live) && liveRunning.value)

// 本轮总耗时（用户 2026-07-07 拍板「记录每一轮的总时间与总消耗」）：终态（done/failed）用落库/内存冻结值，
// 运行中/纠偏中据活动轮秒表实时算（readActiveTidiaoDirectorRoundElapsedMs 内部建立 tick 依赖）。
// 历史轮若是本次改造前的旧记录（无 roundElapsedMs 字段）则不显示，不编造数字。
const roundElapsedMs = computed(() => {
  const round = selectedRound.value
  if (!round) return 0
  if (typeof round.stream.roundElapsedMs === 'number') return round.stream.roundElapsedMs
  return round.live ? readActiveTidiaoDirectorRoundElapsedMs() : 0
})
const roundElapsedLabel = computed(() => (roundElapsedMs.value > 0 ? formatSubagentRunDuration(roundElapsedMs.value) : ''))

// 本轮总消耗（token）：按 usageRoundId 惰性查询 + 按轮缓存（坞只算选中那一轮，切轮/重新打开不重复请求）。
// 运行中的轮消耗还在增长，只在轮到达终态（done/failed）后才查询——查早了只会拿到半截数字。
// 缓存可见性（2026-07-07）：连带存 inputTokens/cacheReadTokens，才能算出「输入缓存命中 X%」。
const roundUsageCache = ref(new Map<string, DirectorRoundUsageTotals>())
const roundUsageLoading = ref('')
watch([() => selectedRound.value?.usageRoundId || '', () => selectedRound.value?.stream.phase || ''], async ([usageRoundId, phase]) => {
  if (!usageRoundId || (phase !== 'done' && phase !== 'failed')) return
  if (roundUsageCache.value.has(usageRoundId) || roundUsageLoading.value === usageRoundId) return
  roundUsageLoading.value = usageRoundId
  try {
    const totals = await fetchDirectorRoundUsageTotals(usageRoundId)
    roundUsageCache.value.set(usageRoundId, totals)
  } finally {
    if (roundUsageLoading.value === usageRoundId) roundUsageLoading.value = ''
  }
}, { immediate: true })
const roundUsageLabel = computed(() => {
  const usageRoundId = selectedRound.value?.usageRoundId || ''
  if (!usageRoundId) return ''
  const totals = roundUsageCache.value.get(usageRoundId)
  if (!totals || totals.totalTokens <= 0) return ''
  const parts = [`全轮 ${totals.totalTokens.toLocaleString('zh-CN')} tokens`]
  // 缓存 token 量与命中率并列展示（2026-07-07 用户点名收起态信息条要能看到缓存 token）。
  if (totals.cacheReadTokens > 0) parts.push(`全轮缓存读 ${totals.cacheReadTokens.toLocaleString('zh-CN')}`)
  const hitHint = formatCacheHitHint(totals.inputTokens, totals.cacheReadTokens)
  if (hitHint) parts.push(`全轮${hitHint}`)
  const appendWarmProfile = (
    label: string,
    profile: DirectorRoundUsageTotals['profiles']['directorRound']
  ) => {
    // provider 没回缓存字段时不能把未知冒充 0%；沿用现役“有真实 cache read 才展示命中率”的边界。
    if (profile.warmCallCount <= 0 || profile.warmInputTokens <= 0 || profile.warmCacheReadTokens <= 0) return
    const warmRate = Math.round((profile.warmCacheReadTokens / profile.warmInputTokens) * 100)
    parts.push(`${label}热命中 ${warmRate}%（${profile.warmCallCount} 次）`)
  }
  appendWarmProfile('统筹', totals.profiles.directorRound)
  appendWarmProfile('轮后', totals.profiles.postRound)
  return parts.join(' · ')
})

// 收起态信息条（桌面·2026-07-07 用户二验澄清）：只在**运行时**（running/correcting）显示——
// 运行中哪怕手动收起也能感知它在跑（轮数/运行中/活秒表）；非运行时收起保持极细绿线、不显示文字。
const showCollapsedInfo = computed(() => !props.compact && (liveRunning.value || hasPendingInteraction.value))

const headLabel = computed(() => {
  const pendingSuffix = hasPendingInteraction.value ? ' · 待确认' : ''
  if (!props.rounds.length) return `提调带${pendingSuffix}`
  const position = `${selectedIndex.value + 1}/${props.rounds.length}`
  const stateSuffix = selectedRound.value?.live && liveRunning.value ? ' · 运行中' : ''
  const metaParts = [roundElapsedLabel.value, roundUsageLabel.value].filter(Boolean)
  const metaSuffix = metaParts.length ? ` · ${metaParts.join(' · ')}` : ''
  return `第 ${position} 轮${stateSuffix}${pendingSuffix}${metaSuffix}`
})

const collapsedBarTitle = computed(() => {
  if (hasPendingInteraction.value) return '提调有待确认操作 · 点击展开'
  return liveRunning.value ? '提调运行中 · 点击展开' : '展开提调带'
})

function step(offset: number): void {
  const next = selectedIndex.value + offset
  if (next < 0 || next >= props.rounds.length) return
  selectedId.value = props.rounds[next].id
}

function openManually(): void {
  selectedId.value = '' // 手动展开默认看最新一轮
  open.value = true
}

// 智能跟底滚动（2026-07-12）：坞内容多为原地变异（decisions/shots/currentAction 等无 length 变化），
// 靠 MutationObserver 感知增长；stream 对象上有惰性 getter（getShotDetails/getRecallPools），
// 这里只监听 DOM 变化、不对 stream 做 deep watch，避免反复触发惰性重算（详见项目记忆里的三坑记录）。
const contentRef = ref<HTMLElement | null>(null)
const contentStick = useStickToBottom(contentRef, { observeMutations: true })

// 抽屉展开（.tds-dock__content 重新挂载）强制到底：展示最新进展，不受上次收起前 stick 状态影响。
watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  contentStick.scrollToBottom(true)
})

// 切轮强制到底：看的是新选中轮的最新内容，不该延续上一轮的贴底/上滑状态。
// ⚠️只认轮身份（id）变化，绝不 watch 轮对象——活动轮每个决策流事件都会重建 rounds 数组、
// selectedRound 换新引用，watch 对象会把每个事件都当成「切轮」force 强滚，用户运行中上滑
// 阅读被逐事件拽回底部（07-13 真机 bug 根因）。同轮内容增长走 MutationObserver 的 gated 跟随。
watch(() => selectedRound.value?.id || '', async (id, oldId) => {
  if (!id || id === oldId) return
  await nextTick()
  contentStick.scrollToBottom(true)
})

// loop 启动自动展开：活动轮出现/换新即弹开并选中它。done 的保留轮（跑完到下一轮起点前载体不清）
// 不算「启动」——切回会话/重挂载时不再把已完成的轮弹出来。
watch(() => liveRound.value?.id || '', (id, oldId) => {
  if (!id || id === oldId || !props.autoExpand) return
  if (livePhase.value === 'done') return
  selectedId.value = id
  open.value = true
}, { immediate: true })

// 相位驱动开合：done=跑完自动收起；failed/correcting=必须让人看见（手动收起后再进这两态也重新弹开）。
watch(livePhase, (phase, oldPhase) => {
  if (phase === oldPhase) return
  if (phase === 'done') {
    open.value = false
  } else if (props.autoExpand && (phase === 'failed' || phase === 'correcting')) {
    if (liveRound.value) selectedId.value = liveRound.value.id
    open.value = true
  }
})

// 帷幕被真的改动（updateCurtainScene changed=true·全局信号·2026-07-07 用户拍板「改帷幕要看得见」）：
// 与 failed/correcting 同「必须让人看见」语义——即便本轮运行中被手动收起也重新弹开并选中活动轮；
// 轮跑完仍由上面的 phase→done watch 自动收起。无活动轮（信号来自本坞不可见的轮）不动。
watch(curtainSceneUpdateSignal, () => {
  if (!props.autoExpand) return
  const live = liveRound.value
  if (!live) return
  selectedId.value = live.id
  open.value = true
})

// 会话切换：复位选中轮；新会话有非 done 活动轮则保持弹开（与活动轮 watch 收敛到同一结果）。
watch(() => props.contextKey, () => {
  selectedId.value = ''
  const live = liveRound.value
  open.value = Boolean(props.autoExpand && live && live.stream.phase !== 'done')
})
</script>

<style scoped>
/* 坞根：绝对定位悬浮在零高度宿主锚点（.tds-dock-host=header 正下方聊天区顶边）之下，
   不占聊天区布局、不受消息滚动影响（宿主在滚动容器之外）。降级原地渲染时同样绝对定位不挤兑消息。 */
.tds-dock {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  pointer-events: none; /* 根只是定位层，命中区交给绿条/抽屉本体 */
}
.tds-dock > * { pointer-events: auto; }

/* 收起态：95% 宽、两侧带圆角的橄榄绿条（参考主输入框顶缘绿条造型；
   与提调纠偏条 TidiaoPrecisionEditBar 同一橄榄绿体系·联动能力·改色需同步那边）。 */
.tds-dock__bar {
  position: relative;
  display: block;
  width: 95%;
  height: 7px;
  margin: 0 auto;
  padding: 0;
  border: none;
  border-radius: 0 0 10px 10px;
  background: #6e7c57;
  box-shadow: 0 2px 8px rgba(110, 124, 87, 0.2);
  cursor: pointer;
  transition: height 0.18s ease, background 0.18s ease;
}
.tds-dock__pending-dot {
  position: absolute;
  top: 50%;
  right: 10px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d8b45c;
  box-shadow: 0 0 0 3px color-mix(in srgb, #d8b45c 24%, transparent);
  transform: translateY(-50%);
}
.tds-dock__bar--info.has-pending {
  padding-right: 28px;
}
.tds-dock__bar:hover {
  height: 10px;
  background: #5f6c4b;
}
/* 收起态信息条（2026-07-07·仅运行时）：running/correcting 时细绿线加宽成与展开态底边绿条同宽同高的信息条，
   显示同一份 headLabel（轮数/运行中/活秒表），右侧向下箭头提示可展开；非运行时保持上方细线样式。 */
.tds-dock__bar--info {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  color: #f2ede4;
  text-align: left;
}
.tds-dock__bar--info:hover {
  height: 24px;
  background: #5f6c4b;
}
.tds-dock__bar--info .tds-dock__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 运行中收起态（2026-07-13 用户拍板去掉「一闪一闪」）：保持稳定绿带、不做 opacity 呼吸动画。
   「还在跑」的感知交给信息条文案（轮数 · 运行中 · 活秒表），不再用闪烁提示。 */

/* 展开态：整块抽屉从顶边拉下来，悬浮盖在消息流上（消息流不重排）。
   与收起绿条同宽同圆角（95%·两侧圆角），内容区=不透明纸面底
   （.tds 自身底色是半透明 color-mix，直接盖消息会透字）；
   橄榄绿只作抽屉「底边框」（.tds-dock__edge），控件都长在底边上。 */
.tds-dock__drawer {
  display: flex;
  flex-direction: column;
  width: 95%;
  margin: 0 auto;
  max-height: min(64vh, 620px);
  background: var(--morandi-card);
  border-radius: 0 0 14px 14px;
  box-shadow: 0 14px 32px rgba(110, 124, 87, 0.26);
  overflow: hidden;
  animation: tds-dock-drop 0.2s ease;
}
/* 待确认是此刻的主任务：整坞提高到 80vh，并为确认区保留稳定的六成高度。
   不能再让长编排记录按内容基准把确认卡挤成只能看到一行的小窗。 */
.tds-dock__drawer.has-interaction {
  height: min(80vh, 760px);
  max-height: min(80vh, 760px);
}
.tds-dock__drawer.has-interaction :deep(.agent-interaction-dock) {
  flex: 0 0 min(58%, 460px);
  max-height: min(58%, 460px);
}
@keyframes tds-dock-drop {
  from { transform: translateY(-10px); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}
.tds-dock__content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 16px 8px;
}
.tds-dock__band { margin: 0; }
/* 带自身的外边距归零，间距交给抽屉内容区（与旧 .chat-director-band 内层同口径）。 */
.tds-dock__band :deep(.tds) { margin: 0; }

/* 建状态栏 scope 确认卡容器（批次4）：弹在带上方，与带留出呼吸间距；卡本体样式在 StatusScopeConfirmCard。 */
.tds-dock__scope { margin: 0 0 8px; }

/* 绘舆阶段确认卡（人在环上通道统一批C·2026-07-12）：容器语言与 StatusScopeConfirmCard(.sscope)/
   XingyiDock(.xingyi-dock__ask) 同一套配方（border+color-mix 底色），选项按钮样式逐字对齐
   .xingyi-dock__ask-opt 系（问题+选项+自由输入·联动能力：三处任一改视觉需同步）。 */
.tds-dock__huiyu-confirm {
  margin: 0 0 8px;
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
}

.tds-dock__huiyu-confirm-q {
  font-weight: 600;
  word-break: break-word;
  white-space: pre-line;
}

/* 「在地图上看草案」入口（批3）：与选项按钮同容器语言，但用主色描边区分「查看」与「决策」两类动作。 */
.tds-dock__huiyu-confirm-map-btn {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--morandi-card, #fffdf8);
  color: var(--langhuan-dialog-primary-bg, #4f867c);
  font-size: 11px;
  cursor: pointer;
}

.tds-dock__huiyu-confirm-map-btn:hover {
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 10%, var(--morandi-card, #fffdf8));
}

.tds-dock__huiyu-confirm-opt {
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

.tds-dock__huiyu-confirm-opt:hover {
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
  background: color-mix(in srgb, var(--langhuan-dialog-primary-bg, #4f867c) 10%, var(--morandi-card, #fffdf8));
}

.tds-dock__huiyu-confirm-opt-label {
  font-weight: 600;
}

.tds-dock__huiyu-confirm-opt-note {
  color: var(--morandi-text-light, #666);
  font-size: 11px;
}

.tds-dock__huiyu-confirm-other {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.tds-dock__huiyu-confirm-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 6px;
  background: var(--morandi-card, #fffdf8);
  color: var(--morandi-text, #333);
  font-size: 12px;
}

.tds-dock__huiyu-confirm-input:focus {
  outline: none;
  border-color: var(--langhuan-dialog-primary-bg, #4f867c);
}

.tds-dock__huiyu-confirm-send {
  flex: 0 0 auto;
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid var(--langhuan-dialog-primary-bg, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.tds-dock__huiyu-confirm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tds-dock__empty {
  padding: 22px 0;
  text-align: center;
  font-size: 12px;
  color: var(--morandi-text-light, #999);
}

/* 抽屉底边=橄榄绿条：整条可点收起（抽屉把手语义），切轮控件长在上面。 */
.tds-dock__edge {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  background: #6e7c57;
  color: #f2ede4;
  cursor: pointer;
  user-select: none;
}
.tds-dock__edge:hover { background: #5f6c4b; }
.tds-dock__label {
  font-size: 11.5px;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.tds-dock__spacer { flex: 1 1 auto; }
.tds-dock__nav {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #f2ede4;
  cursor: pointer;
}
.tds-dock__nav svg { width: 13px; height: 13px; }
.tds-dock__nav:hover:not(:disabled) { background: rgba(242, 237, 228, 0.22); }
.tds-dock__nav:disabled { opacity: 0.35; cursor: default; }
.tds-dock__edge-hint { width: 13px; height: 13px; opacity: 0.8; }

/* ---------- compact（移动端·2026-07-05 设计稿）：全出血通栏 + 触屏命中区 ---------- */
/* 收起态：顶到两边的 8px 通栏绿条（去侧圆角）+ 中央把手；触屏无 hover，取消桌面 hover 长高。 */
.tds-dock--compact .tds-dock__bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 8px;
  border-radius: 0;
}
.tds-dock--compact .tds-dock__pending-dot {
  right: 12px;
}
.tds-dock--compact .tds-dock__bar:hover { height: 8px; background: #6e7c57; }
/* 命中区外扩：8px 条 + 上下各 12px 透明命中 = 32px（拍板 ≥32px）。 */
.tds-dock--compact .tds-dock__bar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -12px;
  bottom: -12px;
}
.tds-dock__grip {
  width: 34px;
  height: 3px;
  border-radius: 2px;
  background: rgba(242, 237, 228, 0.55);
}
/* 展开态抽屉：全出血（左右顶边、仅底部 14px 圆角），max-height 72vh（去桌面 620px 上限对窄屏的浪费）。 */
.tds-dock--compact .tds-dock__drawer {
  width: 100%;
  max-height: 72vh;
  border-radius: 0 0 14px 14px;
}
.tds-dock--compact .tds-dock__drawer.has-interaction {
  height: 82vh;
  max-height: 82vh;
}
.tds-dock--compact .tds-dock__content { padding: 8px 12px 6px; }
/* 底边绿条加高到 32px（触屏命中·唯一收起控件），切轮按钮 28px。 */
.tds-dock--compact .tds-dock__edge { height: 32px; gap: 6px; }
.tds-dock--compact .tds-dock__nav { width: 28px; height: 28px; border-radius: 6px; }
.tds-dock--compact .tds-dock__nav svg { width: 14px; height: 14px; }
.tds-dock--compact .tds-dock__label { font-size: 12px; }
.tds-dock--compact .tds-dock__edge-hint { width: 14px; height: 14px; }
</style>
