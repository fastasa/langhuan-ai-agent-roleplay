<template>
  <template v-for="item in renderItems" :key="item.key">
    <!-- 已结束卡折叠小结行（2026-07-12）：done/error ≥2 张时合并成一行，默认收起；点开后逐条展示完整卡 -->
    <button
      v-if="item.kind === 'group'"
      type="button"
      class="tds-script-group-head"
      :class="{ 'is-open': finishedOpen }"
      :title="finishedOpen ? '收起已结束的运行卡' : '展开看已结束的运行卡'"
      @click="finishedOpen = !finishedOpen"
    >
      <span class="tds-script-group-summary">已结束 {{ finishedCards.length }} · <span v-if="finishedDoneCount === finishedCards.length" class="tds-script-group-done">全部交稿</span><template v-else><span v-if="finishedDoneCount" class="tds-script-group-done">交稿 {{ finishedDoneCount }}</span><template v-if="finishedCancelledCount"><span v-if="finishedDoneCount"> · </span><span class="tds-script-group-cancelled">停止 {{ finishedCancelledCount }}</span></template><template v-if="finishedErrorCount"><span v-if="finishedDoneCount || finishedCancelledCount"> · </span><span class="tds-script-group-error">失败 {{ finishedErrorCount }}</span></template></template></span>
      <span class="tds-script-group-toggle">
        {{ finishedOpen ? '收起' : '展开' }}
        <DirIcon name="chevron-down" :size="11" :stroke="1.9" />
      </span>
    </button>
    <div
      v-else
      class="tds-script-card tds-caifeng-card"
      :class="['tds-script-card--' + item.card.status.state, { 'is-open': openKeys[item.card.key] }]"
      :style="stickyStyles[item.card.key]"
    >
      <button
        type="button"
        class="tds-script-head"
        :title="openKeys[item.card.key] ? `收起${item.card.label}内部信息流` : `展开看${item.card.label}内部信息流（${dispatcherLabel}下的任务书 + ${item.card.label}交回的结果）`"
        @click="toggleOpen(item.card.key)"
      >
        <span class="tds-script-icon"><DirIcon :name="item.card.icon" :size="12" /></span>
        <span class="tds-script-name">{{ item.card.label }}</span>
        <!-- 任务小标题正常字重（2026-07-10 用户反馈）：只加粗子agent名，分隔符「 · 」归小标题 span -->
        <span class="tds-script-name-sub" :title="item.card.title"> · {{ item.card.title }}</span>
        <span class="tds-script-state">
          <template v-if="item.card.status.state === 'running'">
            <span class="tds-entry-run-dot"></span>{{ item.card.runningVerb }} · {{ item.card.elapsed }}
          </template>
          <template v-else-if="item.card.status.state === 'done'">
            <DirIcon name="check" :size="11" :stroke="2.2" /><template v-if="item.card.doneDuration">{{ item.card.doneDuration }}</template><template v-if="item.card.usageLabel"> · {{ item.card.usageLabel }}</template>
          </template>
          <template v-else-if="item.card.status.state === 'cancelled'">
            <DirIcon name="x" :size="11" :stroke="2" />已停止<template v-if="item.card.doneDuration"> · {{ item.card.doneDuration }}</template>
          </template>
          <template v-else>
            <DirIcon name="alert" :size="11" :stroke="1.9" />失败<template v-if="item.card.doneDuration"> · {{ item.card.doneDuration }}</template><template v-if="item.card.usageLabel"> · {{ item.card.usageLabel }}</template>
          </template>
        </span>
        <span class="tds-script-toggle">
          {{ openKeys[item.card.key] ? '收起' : '展开' }}
          <DirIcon name="chevron-down" :size="11" :stroke="1.9" />
        </span>
      </button>
      <div v-if="openKeys[item.card.key]" class="tds-script-body">
        <div v-if="item.card.status.error" class="tds-script-error">{{ item.card.status.error }}</div>
        <!-- 工作流（批G·2026-07-12）：轮次+工具调用流水，运行中随 subagentRunStatus 实时增长、结束后保留回看；
             空 timeline 不渲染该段 -->
        <div v-if="item.card.status.timeline && item.card.status.timeline.length" class="tds-script-io">
          <div class="tds-script-io-label">工作流</div>
          <SubagentTimelineList :entries="item.card.status.timeline" :running="item.card.status.state === 'running'" />
        </div>
        <div class="tds-script-io">
          <div class="tds-script-io-label">{{ dispatcherLabel }} → {{ item.card.label }}</div>
          <pre v-if="item.card.status.input" class="tds-script-io-text">{{ item.card.status.input }}</pre>
          <div v-else class="tds-script-io-hint">（本次派遣没有留存任务书）</div>
        </div>
        <div class="tds-script-io">
          <div class="tds-script-io-label">{{ item.card.label }} → {{ dispatcherLabel }}</div>
          <pre v-if="item.card.status.output" class="tds-script-io-text">{{ item.card.status.output }}</pre>
          <div v-else-if="item.card.status.state === 'running'" class="tds-script-io-hint">{{ item.card.label }}{{ item.card.runningVerb }}，交稿后在这里显示…</div>
          <div v-else class="tds-script-io-hint">（没有留存结果内容）</div>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
/**
 * 子agent派遣运行卡·共享纯展示组件（地图严谨协作与运行卡计划批1·2026-07-11·从 TidiaoDirectorStreamBand.vue
 * 抽出）。折叠挂起卡（图标+名字+任务小标题+「绘图中·3.2s」脉冲/「✓·耗时·N tokens」，running 钉顶递增堆叠，
 * 点击展开看任务书 input 与回执 output）——提调带（采风/造册/绘舆）与星依浮坞（绘舆/纠偏轮）同源复用同一份组件。
 * 已结束（done/error）卡 ≥2 张时折叠成一行小结（2026-07-12·running 永远逐条；点开小结逐条展示，单卡仍可再展开）。
 * 窄容器防溢出（2026-07-16 用户真机反馈）：done 态省略「已交稿」文字（勾图标已表意）、token 折算 k 位、
 * 隐藏缓存命中率，且状态字改可收缩（flex:1 1 auto），确保最右侧展开/收起箭头恒可见。
 *
 * 零业务逻辑：不知道 caifeng/zaoce/huiyu/tidiao 具体是什么，只认 `sources`（sessionId + 展示元信息）——
 * 具体有哪些子agent、图标/文案/前缀是调用方的领域知识，调用方按需拼 `sources` 喂进来。
 * 真值仍是 subagentRunStatus 单一状态表（本组件只读 listSubagentRunStatuses，不做二次缓存/双写）。
 *
 * 联动能力：外观与交互必须与 TidiaoDirectorStreamBand.vue 内联的编剧卡（.tds-script-card，未抽出、仍服务
 * 编剧 subagent）保持一致——改一处视觉/交互，另一处也要同步看是否要改（scoped 样式不能跨 SFC 共享，
 * 本文件的 .tds-script-card* 样式与图标子集是特意从 band 复制的最小必要子集）。
 */
import { computed, defineComponent, h, ref, watch } from 'vue'
import SubagentTimelineList from './SubagentTimelineList.vue'
import {
  getSubagentRunStatus,
  listAllSubagentRunStatuses,
  listSubagentRunStatuses,
  subagentRunTick,
  formatSubagentRunDuration,
  type SubagentRunStatus,
  type SubagentRunUsage
} from '../../../app/subagentRunStatus'

/** 某类子agent的展示元信息（调用方领域知识：label/icon/文案，本组件只负责渲染）。 */
export interface SubagentDispatchCardMeta {
  /** subagentId 前缀（不含冒号），如 'caifeng'/'zaoce'/'huiyu'/'tidiao'。 */
  prefix: string
  /** 固定单例 id（如 scriptwriter）用 exact；缺省按 `${prefix}:` 收集并行任务。 */
  match?: 'prefix' | 'exact'
  /** 卡头显示名（如「采风」「造册」「绘舆」「提调」）。 */
  label: string
  icon: string
  /** running 态动词（如「钻取中」「建栏中」「绘图中」「纠偏中」）。 */
  runningVerb: string
  /** 从 status.input 提取不到标题时的兜底任务小标题。 */
  fallbackTitle: string
  /** 从 status.input 首行提取任务标题（各子agent自己的 brief 格式各异，调用方传对应提取函数）。 */
  extractTitle: (input?: string) => string
}

/** 一个查询源：去哪个会话查哪类子agent前缀。 */
export interface SubagentDispatchCardSource {
  sessionId: string
  meta: SubagentDispatchCardMeta
}

interface SubagentDispatchCard {
  /** 全局唯一键=`${sessionId}::${subagentId}`（星依浮坞可能同时跨多个目标会话，需要会话前缀防撞）。 */
  key: string
  status: SubagentRunStatus
  label: string
  icon: string
  runningVerb: string
  title: string
  elapsed: string
  doneDuration: string
  usageLabel: string
}

const props = withDefaults(defineProps<{
  sources?: SubagentDispatchCardSource[]
  /** 当前会话自动模式：读取 runSubagentLoop begin 时登记的 presentation，供 WorkspaceAgentShell 固定复用。 */
  sessionId?: string
  /** true=running 与 done/error 都显示；false=只 running 恒显，done/error 需调用方额外开（band 的 liveRound 门）。 */
  includeSettled: boolean
  /** 「提调 → xxx」「xxx → 提调」内部信息流标签的左侧称呼；band=提调（缺省），星依浮坞传「星依」。 */
  dispatcherLabel?: string
  /** running 卡 sticky 堆叠序号起点（band 的编剧卡占用 0 号位时传 1，避免撞叠）。缺省 0。 */
  stickyOrderStart?: number
  /** 变化时清空展开态（band 传 roundKey：切轮全部复位收起）。缺省不重置。 */
  resetKey?: string
}>(), {
  sources: () => [],
  sessionId: '',
  dispatcherLabel: '提调',
  stickyOrderStart: 0
})

const cards = computed<SubagentDispatchCard[]>(() => {
  void subagentRunTick.value // 秒表联动：有运行中的卡时每 500ms 重算 elapsed
  const out: SubagentDispatchCard[] = []
  const seenKeys = new Set<string>()
  for (const source of props.sources) {
    const sessionId = String(source.sessionId || '').trim()
    if (!sessionId) continue
    const statuses = source.meta.match === 'exact'
      ? (() => {
          const status = getSubagentRunStatus(sessionId, source.meta.prefix)
          return status ? [{ subagentId: source.meta.prefix, status }] : []
        })()
      : listSubagentRunStatuses(sessionId, `${source.meta.prefix}:`)
    for (const { subagentId, status } of statuses) {
      if (status.state !== 'running' && !props.includeSettled) continue
      const key = `${sessionId}::${subagentId}`
      seenKeys.add(key)
      out.push({
        key,
        status,
        label: source.meta.label,
        icon: source.meta.icon,
        runningVerb: source.meta.runningVerb,
        title: source.meta.extractTitle(status.input) || source.meta.fallbackTitle,
        elapsed: status.state === 'running' ? formatSubagentRunDuration(Date.now() - status.startedAt) : '',
        doneDuration: typeof status.durationMs === 'number' ? formatSubagentRunDuration(status.durationMs) : '',
        usageLabel: subagentUsageLabelOf(status.usage)
      })
    }
  }
  const directSessionId = String(props.sessionId || '').trim()
  if (directSessionId) {
    for (const { subagentId, status } of listAllSubagentRunStatuses(directSessionId)) {
      const key = `${directSessionId}::${subagentId}`
      if (seenKeys.has(key) || !status.presentation) continue
      if (status.state !== 'running' && !props.includeSettled) continue
      out.push({
        key,
        status,
        label: status.presentation.label,
        icon: status.presentation.icon,
        runningVerb: status.presentation.runningVerb,
        title: status.presentation.title,
        elapsed: status.state === 'running' ? formatSubagentRunDuration(Date.now() - status.startedAt) : '',
        doneDuration: typeof status.durationMs === 'number' ? formatSubagentRunDuration(status.durationMs) : '',
        usageLabel: subagentUsageLabelOf(status.usage)
      })
    }
  }
  return out
})

// running 卡递增钉位（同 band 原逻辑）：只有 running 卡相对最近滚动祖先 sticky 钉顶，按出现顺序内联 top 依次堆叠；
// done/error 无内联 style，回归文档流随滚动滚走。CSS 侧 .tds-script-card--running 保留 top:0 作兜底。
const STICKY_STEP_PX = 38
const stickyStyles = computed<Record<string, { top: string }>>(() => {
  const styles: Record<string, { top: string }> = {}
  let order = props.stickyOrderStart ?? 0
  for (const card of cards.value) {
    if (card.status.state === 'running') styles[card.key] = { top: `${order++ * STICKY_STEP_PX}px` }
  }
  return styles
})

// 已结束卡折叠分组（2026-07-12）：done/error 卡 ≥2 张时合并成一行小结（默认收起），running 卡永远逐条显示；
// 卡从 running 转 done/error 时自然落进折叠组。
// active 保持 cards 原序（= listSubagentRunStatuses 按 startedAt 升序，运行中按开始早晚排是对的）；
// 已结束卡改按 endedAt 升序重排（2026-07-12 bug 修复）——根因：原先直接沿用 cards 顺序=startedAt 顺序，
// 若某张卡开始得早但跑得久，会比后开始、先跑完的卡先出现，导致「最新完成的一张」插在列表中间而非垫底。
function isFinishedCard(card: SubagentDispatchCard): boolean {
  return card.status.state !== 'running'
}
const activeCards = computed(() => cards.value.filter((card) => !isFinishedCard(card)))
const finishedCards = computed(() =>
  cards.value.filter(isFinishedCard).sort((a, b) => (a.status.endedAt ?? 0) - (b.status.endedAt ?? 0))
)
const finishedDoneCount = computed(() => finishedCards.value.filter((card) => card.status.state === 'done').length)
const finishedCancelledCount = computed(() => finishedCards.value.filter((card) => card.status.state === 'cancelled').length)
const finishedErrorCount = computed(() => finishedCards.value.filter((card) => card.status.state === 'error').length)
/** 小结行展开态（纯 UI 态·不持久化）；resetKey 变化时随 openKeys 一起复位收起。 */
const finishedOpen = ref(false)

type SubagentDispatchRenderItem =
  | { kind: 'card'; key: string; card: SubagentDispatchCard }
  | { kind: 'group'; key: string }

const renderItems = computed<SubagentDispatchRenderItem[]>(() => {
  const items: SubagentDispatchRenderItem[] = activeCards.value.map(
    (card) => ({ kind: 'card' as const, key: card.key, card })
  )
  // 已结束卡 ≤1 张没必要折：照旧直接显示
  if (finishedCards.value.length < 2) {
    for (const card of finishedCards.value) items.push({ kind: 'card', key: card.key, card })
    return items
  }
  items.push({ kind: 'group', key: '__finished_group__' })
  if (finishedOpen.value) {
    for (const card of finishedCards.value) items.push({ kind: 'card', key: card.key, card })
  }
  return items
})

// 展开/收起态：组件内部自持（纯 UI 态，非业务真值）；resetKey 变化时清空（band 切轮复位收起）。
const openKeys = ref<Record<string, boolean>>({})
function toggleOpen(key: string): void {
  openKeys.value = { ...openKeys.value, [key]: !openKeys.value[key] }
}
watch(() => props.resetKey, () => { openKeys.value = {}; finishedOpen.value = false })

/** subagent 一次运行的用量文案（token 总量，≥1000 折算 k 位省宽度，如「62.8k tokens」）。
 *  ⚠️ 与 TidiaoDirectorStreamBand.vue 的同名私有函数（编剧卡 scriptwriterUsageLabel 用）逐字同构——
 *  故意不共享 import（两文件都是"自包含展示层"边界），改口径两处要同步。 */
function subagentUsageLabelOf(usage: SubagentRunUsage | undefined): string {
  if (!usage) return ''
  const totalTokens = usage.promptTokens + usage.completionTokens
  if (totalTokens >= 1000) return `${(totalTokens / 1000).toFixed(1)}k tokens`
  return `${totalTokens} tokens`
}

// 卡片图标（同 TidiaoDirectorStreamBand.vue 私有 DirIcon 同构·联动能力：新增卡片图标两处都要加）：
// 只复制本组件实际用到的最小图标子集，不引入 band 私有 ICONS 全集。
const ICONS: Record<string, string> = {
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  clapperboard: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3 5.7"/><path d="m12.4 3.4 3 5.7"/><path d="M4.5 11h15a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-7A1.5 1.5 0 0 1 4.5 11Z"/>'
}

const DirIcon = defineComponent({
  name: 'DirIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 14 },
    stroke: { type: Number, default: 1.8 }
  },
  setup(p) {
    return () => h('svg', {
      width: p.size,
      height: p.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
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
/* 样式从 TidiaoDirectorStreamBand.vue 的 .tds-script-card 家族逐字搬迁（该文件的编剧卡仍留用同一套样式，
   scoped 样式不能跨 SFC 共享，故两处各自持有一份——外观必须保持一致，改一处另一处要同步看）。
   颜色全部走项目 --morandi- token；⚠️ CSS 注释里绝不能出现「星号+斜杠」连写（提前闭合注释会让 style 500）。 */
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
.tds-script-card--cancelled { border-color: color-mix(in srgb, var(--morandi-secondary) 32%, transparent); }
/* 收起态窄容器防溢出（2026-07-12）：head 需 min-width:0 才能让子元素省略生效；标题收缩、状态字恒定不缩，
   展开态标题改多行显示。此处与 TidiaoDirectorStreamBand.vue 编剧卡的 .tds-script-* 是联动副本，改动需同步。 */
.tds-script-head {
  display: flex; align-items: center; gap: 7px; width: 100%;
  min-width: 0;
  padding: 6px 10px; background: none; border: none; cursor: pointer;
  font-size: 0.78rem; color: var(--morandi-text); text-align: left;
}
/* 展开态换行（批I·真机纵排 bug 修复）：head 允许换行，name-sub 用 order 沉到第二行独占整行自然换行
   ——首行保持图标/名/状态字/toggle（若无 order，DOM 序里 basis-100% 的 name-sub 会把状态字/toggle 挤去第三行）。
   收起态规则一个字节不动（省略截断已验收）。 */
.tds-script-card.is-open .tds-script-head { align-items: flex-start; flex-wrap: wrap; }
.tds-script-icon { display: inline-flex; color: var(--morandi-accent); flex: none; }
.tds-script-name { font-weight: 600; flex: none; }
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
.tds-script-card--cancelled .tds-script-state { color: var(--morandi-secondary); }
.tds-script-toggle {
  display: inline-flex; align-items: center; gap: 2px; flex: none; margin-left: auto;
  font-size: 0.7rem; color: var(--morandi-info);
}
.tds-script-toggle :deep(svg) { transition: transform 0.18s ease; }
.tds-script-card.is-open .tds-script-toggle :deep(svg) { transform: rotate(180deg); }
/* 已结束卡折叠小结行（2026-07-12）：视觉语言贴 .tds-script-head（同字号间距·细线浅底）但更轻。
   ⚠️ .tds-script-group-* 系列是本列表组件独有（卡列表分组概念只在这里），不同步进
   TidiaoDirectorStreamBand.vue 编剧卡副本；上方 .tds-script-* 共享规则的联动同步纪律不变。 */
.tds-script-group-head {
  display: flex; align-items: center; gap: 7px; width: 100%; min-width: 0;
  margin-bottom: 10px; padding: 5px 10px;
  background: color-mix(in srgb, var(--morandi-primary) 3%, var(--morandi-card));
  border: 1px solid color-mix(in srgb, var(--morandi-border) 65%, transparent);
  border-radius: 9px; cursor: pointer; text-align: left;
  font-size: 0.74rem; color: var(--morandi-text-light);
}
.tds-script-group-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tds-script-group-done { color: var(--morandi-accent); }
.tds-script-group-error { color: var(--morandi-danger); }
.tds-script-group-cancelled { color: var(--morandi-secondary); }
.tds-script-group-toggle {
  display: inline-flex; align-items: center; gap: 2px; flex: none; margin-left: auto;
  font-size: 0.7rem; color: var(--morandi-info);
}
.tds-script-group-toggle :deep(svg) { transition: transform 0.18s ease; }
.tds-script-group-head.is-open .tds-script-group-toggle :deep(svg) { transform: rotate(180deg); }
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
.tds-entry-run-dot { width: 5px; height: 5px; border-radius: 999px; background: var(--morandi-accent); animation: tds-script-pulse 1.1s ease-in-out infinite; }
@keyframes tds-script-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
</style>
