<template>
  <div class="tds-timeline" :class="{ 'tds-timeline--parent-scroll': !contained }">
    <template v-for="(entry, index) in entries" :key="entryKey(entry, index)">
      <!-- 耗时（批I）：仅落定行显示（durationMs 由数据层在 settle/换轮/收尾时回填），未落定不显示 -->
      <div v-if="entry.kind === 'turn'" class="tds-timeline-turn">
        {{ entry.label }}<span v-if="entry.durationMs != null" class="tds-timeline-dur"> · {{ formatSubagentRunDuration(entry.durationMs) }}</span>
      </div>
      <div
        v-else
        class="tds-tool"
        :class="[`tds-tool--${toolStatusOf(entry)}`, { 'tds-tool--expandable': hasDetail(entry), 'tds-tool--expanded': isExpanded(entry, index) }]"
        :role="hasDetail(entry) ? 'button' : undefined"
        :tabindex="hasDetail(entry) ? 0 : undefined"
        :aria-expanded="hasDetail(entry) ? isExpanded(entry, index) : undefined"
        @click="toggleEntry(entry, index)"
        @keydown.enter.prevent="toggleEntry(entry, index)"
        @keydown.space.prevent="toggleEntry(entry, index)"
      >
        <div class="tds-tool-head">
          <span class="tds-tool-icon"><TlIcon name="tool" :size="11" :stroke="1.9" /></span>
          <span class="tds-tool-label">{{ entry.label }}</span>
          <span v-if="entry.detail" class="tds-tool-detail">{{ entry.detail }}</span>
          <span class="tds-tool-status">
            <span v-if="toolStatusOf(entry) === 'running'" class="tds-tool-spin"></span>
            <TlIcon v-else-if="entry.status === 'success'" name="check" :size="11" :stroke="2.2" />
            <TlIcon v-else-if="entry.status === 'error'" name="alert" :size="11" :stroke="1.9" />
          </span>
          <span v-if="entry.durationMs != null" class="tds-timeline-dur">{{ formatSubagentRunDuration(entry.durationMs) }}</span>
          <span v-if="hasDetail(entry)" class="tds-tool-chevron" :class="{ 'is-open': isExpanded(entry, index) }">
            <TlIcon name="chevron" :size="11" :stroke="1.9" />
          </span>
        </div>
        <div v-if="hasDetail(entry) && isExpanded(entry, index)" class="tds-tool-expanded" @click.stop>{{ entry.detail }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 子agent工作流时间线·共享纯展示组件（批G·2026-07-12）：逐条渲染「第N轮/工具调用」流水，
 * 供 SubagentDispatchCardList（运行卡展开态）与 XingyiDock（星依当轮工作流区）同源复用——
 * 一份样式两处消费，避免第三份 scoped 拷贝。
 *
 * 只认 entries（轮次分隔 + 工具行）数组，不知道来源是 subagentRunStatus.timeline
 * 还是 xingyiTurnStreamState（两者条目形状同构，鸭子类型足够）；本地只持有纯视图的展开键集。
 * running=宿主 loop 是否还在跑：未定态（无 status）工具行只在 running 时转菊花，结束后静默
 * （防中断/超时留下的未定行永久空转）。
 */
import { defineComponent, h, ref } from 'vue'
import { formatSubagentRunDuration } from '../../../app/subagentRunStatus'

/** 时间线条目展示形状：与 subagentRunStatus.SubagentRunTimelineEntry /
 *  xingyiTurnStreamState 条目结构同构（联动：改形状三处同步）。 */
export interface SubagentTimelineDisplayEntry {
  kind: 'turn' | 'tool'
  label: string
  detail?: string
  status?: 'success' | 'error'
  at: number
  /** 耗时（批I）：落定行才有（工具行=settle 回填；轮行=换轮/收尾回填），缺省不显示。 */
  durationMs?: number
}

const props = withDefaults(defineProps<{
  entries: SubagentTimelineDisplayEntry[]
  /** 宿主 loop 是否运行中（未定态工具行是否转菊花）。缺省 false。 */
  running?: boolean
  /** true=组件自己限高滚动（运行卡）；false=由外层消息流统一滚动（星依浮坞）。 */
  contained?: boolean
}>(), {
  running: false,
  contained: true
})

const expandedKeys = ref<Set<string>>(new Set())

function entryKey(entry: SubagentTimelineDisplayEntry, index: number): string {
  return `${entry.at}:${entry.kind}:${entry.label}:${index}`
}

function hasDetail(entry: SubagentTimelineDisplayEntry): boolean {
  return Boolean(String(entry.detail || '').trim())
}

function isExpanded(entry: SubagentTimelineDisplayEntry, index: number): boolean {
  return expandedKeys.value.has(entryKey(entry, index))
}

function toggleEntry(entry: SubagentTimelineDisplayEntry, index: number): void {
  if (!hasDetail(entry)) return
  const key = entryKey(entry, index)
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}

/** 条目 → 工具条状态 class 后缀（与提调坞 .tds-tool--running/done/error 同一命名语言）。 */
function toolStatusOf(entry: SubagentTimelineDisplayEntry): 'running' | 'done' | 'error' | 'idle' {
  if (entry.status === 'success') return 'done'
  if (entry.status === 'error') return 'error'
  return props.running ? 'running' : 'idle'
}

// 最小图标子集（同 TidiaoDirectorStreamBand.vue 私有 DirIcon 同构·联动能力：路径改动两处同步）。
const ICONS: Record<string, string> = {
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>'
}

const TlIcon = defineComponent({
  name: 'TlIcon',
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
/* 工具条样式从 TidiaoDirectorStreamBand.vue 的 .tds-tool 家族拷贝最小必要子集（细行+状态色·scoped
   不能跨 SFC 共享）——此处与提调坞工具条是联动副本，改视觉需同步看两处。
   detail 默认单行摘要，展开后在同一轻量行内显示全文，不再叠第二层卡片。 */
.tds-timeline {
  display: flex; flex-direction: column;
  max-height: 200px; overflow-y: auto; overflow-x: hidden;
  padding-right: 2px;
}
.tds-timeline--parent-scroll { max-height: none; overflow: visible; padding-right: 0; }
.tds-timeline-turn {
  font-size: 0.7rem; font-weight: 600; letter-spacing: 0.02em;
  color: var(--morandi-secondary); margin-top: 8px;
}
.tds-timeline-turn:first-child { margin-top: 0; }
.tds-tool {
  display: flex; flex-direction: column; gap: 4px; align-self: flex-start; max-width: 100%; margin-top: 6px;
  background: var(--morandi-surface); border: 1px solid var(--morandi-border); border-radius: 8px; padding: 5px 10px;
  font-size: 0.78rem; color: var(--morandi-text-light);
}
.tds-tool--expandable { cursor: pointer; transition: background 0.16s ease, border-color 0.16s ease; }
.tds-tool--expandable:hover,
.tds-tool--expandable:focus-visible { background: color-mix(in srgb, var(--morandi-accent) 6%, var(--morandi-surface)); }
.tds-tool--expandable:focus-visible { outline: 1px solid color-mix(in srgb, var(--morandi-accent) 42%, transparent); outline-offset: 1px; }
.tds-tool-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.tds-tool-icon { display: inline-flex; color: var(--morandi-info); flex: none; }
.tds-tool-label { color: var(--morandi-text); font-weight: 500; flex: none; }
.tds-tool-detail { color: var(--morandi-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tds-tool-status { display: inline-flex; align-items: center; flex: none; }
.tds-tool-chevron { display: inline-flex; flex: none; color: var(--morandi-secondary); transition: transform 0.16s ease; }
.tds-tool-chevron.is-open { transform: rotate(90deg); }
.tds-tool-expanded {
  width: 100%; padding-top: 5px; border-top: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent);
  color: var(--morandi-text); font-size: 0.75rem; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; cursor: text;
  user-select: text;
}
/* 耗时（批I）：轻量灰字——工具行挂在状态图标后、轮行内联在标签后。 */
.tds-timeline-dur { flex: none; font-size: 0.7rem; font-weight: 400; color: var(--morandi-secondary); }
.tds-tool--done .tds-tool-status { color: var(--morandi-accent); }
.tds-tool--error { border-color: color-mix(in srgb, var(--morandi-danger) 32%, transparent); }
.tds-tool--error .tds-tool-status { color: var(--morandi-danger); }
.tds-tool-spin {
  width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--morandi-info) 30%, transparent);
  border-top-color: var(--morandi-info); animation: tds-timeline-spin 0.8s linear infinite;
}
@keyframes tds-timeline-spin { to { transform: rotate(360deg); } }
</style>
