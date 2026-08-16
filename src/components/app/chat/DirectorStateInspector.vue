<template>
  <!-- 提调场记（2026-06-29 生·原名「state 查看器」·2026-07-10 改中文名「场记」——剧组里记录每场排演过程的角色，
       与提调/编剧/剧本/分镜/旁白同一剧场隐喻；只读·用户要求「看到每个提调带内部 state、子 state」）：
       · 提调真读那份 = memoryProjection：父层用 renderDirectorMemoryDocument 拼出的「喂模型原文」（option C·2026-07-01）——
         发送时留存的真实 prompt（纲领/编排倾向/情境·旁白清单/协议 + 舞台/名单/聊天历史/诉求/资料池）+ 本轮 loop 真实往来
         （每步 thought/工具调用/工具结果·未折叠），即提调上下文里真正读到的整段；旧数据无真实 prompt 时内部回退旧压缩台账。
       · 主 state = 该带的 TidiaoDirectorStream（phase/currentAction/决策流/分镜），给人看的决策流视图。
       · 子 state = 各演员子 loop 的钻取明细 shotDetails（按角色名分组：步骤/取料/情境/评审）。
       2026-06-30 md 化（用户要求「易读」）：决策/分镜/子state 一律渲染人话 md，不再裸 JSON。
       纯只读：折叠分块，不接编辑/不接运行时。视觉与 RoundRecallPoolPanel 同语言。
       批次G（2026-07-03·挤压侧栏）：variant='inline' 时不 Teleport、不遮罩——整块作为 AppChatSection
       挤压 aside（仿 PromptLogPanel）的内容渲染（自带头部关闭·同 orchestration audit 壳范式）；
       缺省 'overlay' 保持旧浮层形态（移动端 MobileChatThread 继续用·零回归）。一份模板两形态。 -->
  <Teleport to="body" :disabled="variant === 'inline'">
    <div
      class="dsi-overlay"
      :class="{ 'dsi-overlay--inline': variant === 'inline' }"
      @click.self="variant !== 'inline' && emit('close')"
    >
      <aside class="dsi" role="dialog" :aria-modal="variant !== 'inline'" aria-label="提调场记">
        <header class="dsi-head">
          <span class="dsi-head-icon"><InspIcon name="clipboard-pen" :size="16" /></span>
          <span class="dsi-head-title">提调场记</span>
          <span class="dsi-spacer"></span>
          <button type="button" class="dsi-close" title="关闭" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="dsi-body">
          <!-- 提调真正读到的记忆（喂模型原文·md·option C）：与下面「主记录视图」是同一条带的两种呈现——
               本块是发送时真正喂给模型的整段（真实 prompt + 本轮 loop 真实往来·未折叠），
               主/子记录则是给人看的决策流视图。memoryProjection 为空（首轮无历史/历史带无落库）时整块不显示。
               标题行「提调本轮真正读到的记忆（喂模型原文）」2026-07-10 用户拍板删除，只留内容。 -->
          <section v-if="memoryProjection" class="dsi-section">
            <pre class="dsi-md">{{ memoryProjection }}</pre>
          </section>

          <!-- 主记录（原「主 state」·场记改名同步） -->
          <section class="dsi-section">
            <div class="dsi-section-title">主记录（导演决策流·人话视图）</div>
            <div class="dsi-kv"><span class="dsi-k">phase</span><span class="dsi-v" :class="`dsi-v--${stream?.phase || 'unknown'}`">{{ stream?.phase || '—' }}</span></div>
            <div class="dsi-kv"><span class="dsi-k">currentAction</span><span class="dsi-v">{{ stream?.currentAction || '—' }}</span></div>
            <div v-if="stream?.correction" class="dsi-kv"><span class="dsi-k">correction</span><span class="dsi-v">{{ stream.correction }}</span></div>
            <div v-if="stream?.failureReason" class="dsi-kv"><span class="dsi-k">failureReason</span><span class="dsi-v dsi-v--failed">{{ stream.failureReason }}</span></div>

            <button type="button" class="dsi-block-head" @click="toggle('decisions')">
              <InspIcon name="chevron-down" :size="12" :class="{ 'dsi-rot': isOpen('decisions') }" />
              <span>决策流</span><span class="dsi-count">{{ decisions.length }}</span>
            </button>
            <pre v-if="isOpen('decisions')" class="dsi-md">{{ decisionsMd }}</pre>

            <button type="button" class="dsi-block-head" @click="toggle('shots')">
              <InspIcon name="chevron-down" :size="12" :class="{ 'dsi-rot': isOpen('shots') }" />
              <span>分镜</span><span class="dsi-count">{{ shots.length }}</span>
            </button>
            <pre v-if="isOpen('shots')" class="dsi-md">{{ shotsMd }}</pre>
          </section>

          <!-- 子记录：各演员子 loop 钻取明细 -->
          <section class="dsi-section">
            <div class="dsi-section-title">子记录（各演员子 loop 过程）</div>
            <template v-if="shotDetailEntries.length">
              <div v-for="entry in shotDetailEntries" :key="entry.label" class="dsi-sub">
                <button type="button" class="dsi-block-head" @click="toggle('sub_' + entry.label)">
                  <InspIcon name="chevron-down" :size="12" :class="{ 'dsi-rot': isOpen('sub_' + entry.label) }" />
                  <span>{{ entry.label }}</span>
                </button>
                <pre v-if="isOpen('sub_' + entry.label)" class="dsi-md">{{ toReadable(entry.detail) }}</pre>
              </div>
            </template>
            <div v-else class="dsi-empty">无子记录（该轮分镜未携带演员钻取明细）。</div>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import type { TidiaoDirectorStream } from '../../../app/tidiaoDirectorStream'
import type { TidiaoShotDetail } from '../../../app/tidiaoBandModel'

const props = defineProps<{
  stream: TidiaoDirectorStream | null
  /** 各角色子 loop 钻取明细（角色名 → 编排过程）。 */
  shotDetails?: Record<string, TidiaoShotDetail>
  /** 提调真读那份：父层用 renderDirectorMemoryDocument 拼出的「喂模型原文」md（真实 prompt + 本轮 loop 真实往来·option C）；空则不显示该块。 */
  memoryProjection?: string
  /** 批次G：'overlay'=旧浮层（Teleport+遮罩·移动端/缺省）；'inline'=挤压侧栏内容（AppChatSection aside 壳内·不遮盖聊天区）。 */
  variant?: 'overlay' | 'inline'
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const decisions = computed(() => (Array.isArray(props.stream?.decisions) ? props.stream!.decisions : []))
const shots = computed(() => (Array.isArray(props.stream?.shots) ? props.stream!.shots : []))
const shotDetailEntries = computed(() =>
  Object.entries(props.shotDetails || {}).map(([label, detail]) => ({ label, detail }))
)

// 决策 kind → 人话标签（与 tidiaoDirectorStream.ts TidiaoDecisionKind 对齐；缺省回退原 kind）。
const DECISION_LABELS: Record<string, string> = {
  analyze: '分析', recall: '取料', situation: '判定情境', narrationDir: '旁白方向',
  castDir: '角色方向', deepen: '深化', planPrompt: '写提示词', generate: '生成候选',
  review: '评审', compose: '生成正文', edit: '精修', correction: '纠偏', note: '备注'
}

const NARRATION_GEN_LABELS: Record<string, string> = {
  pending: '待生成', running: '生成中', done: '已生成', failed: '生成失败'
}

// 决策流 → 人话 md：每条「序号·〔标签〕正文」，带工具调用时另起一行「· 工具 名（机器名）· 状态 · 参数 · 结果/报错」。
const decisionsMd = computed(() => {
  const list = decisions.value
  if (!list.length) return '（本轮暂无决策）'
  return list.map((d, i) => {
    const label = DECISION_LABELS[d.kind] || d.kind || '决策'
    const lines = [`${i + 1}. 〔${label}〕${String(d.text || '').trim()}`]
    const tool = d.tool
    if (tool) {
      const name = String(tool.label || tool.tool || '').trim()
      const seg: string[] = []
      const machine = String(tool.tool || '').trim()
      seg.push(machine && machine !== name ? `${name}（${machine}）` : name)
      if (tool.status) seg.push(tool.status === 'error' ? '失败' : tool.status === 'running' ? '进行中' : '完成')
      const detail = String(tool.detail || '').trim()
      if (detail) seg.push(`参数：${detail}`)
      const result = String(tool.resultPreview || '').trim()
      if (result) seg.push(`${tool.status === 'error' ? '报错' : '结果'}：${result}`)
      lines.push(`    · 工具 ${seg.filter(Boolean).join(' · ')}`)
    }
    return lines.join('\n')
  }).join('\n')
})

// 分镜 → 人话 md：每镜「镜N · 角色/旁白 名」，下挂方向、旁白正文生成态。
const shotsMd = computed(() => {
  const list = shots.value
  if (!list.length) return '（本轮暂无分镜）'
  return list.map((s) => {
    const kind = s.kind === 'narration' ? '旁白' : '角色'
    const lines = [`镜${s.order} · ${kind}${s.label ? ` ${s.label}` : ''}`]
    const direction = String(s.direction || '').trim()
    if (direction) lines.push(`    方向：${direction}`)
    if (s.kind === 'narration' && s.narrationGen) {
      const gen = NARRATION_GEN_LABELS[s.narrationGen] || s.narrationGen
      lines.push(`    旁白正文：${gen}${s.narrationGenElapsed ? `（${s.narrationGenElapsed}）` : ''}`)
    }
    return lines.join('\n')
  }).join('\n\n')
})

// 子 state 通用人话渲染（演员钻取明细结构可能随版本变，用通用递归比写死字段更稳）：
// 字符串/数值/布尔原样；数组逐项编号；对象按「键：值」展开，空值跳过。
function toReadable(value: unknown, depth = 0): string {
  const pad = '  '.repeat(depth)
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (!value.length) return '（空）'
    return value.map((item, i) => {
      const body = toReadable(item, depth + 1)
      return body.includes('\n') ? `${pad}${i + 1})\n${body}` : `${pad}${i + 1}) ${body}`
    }).join('\n')
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => {
      if (v == null) return false
      if (typeof v === 'string' && !v.trim()) return false
      if (Array.isArray(v) && !v.length) return false
      return true
    })
    if (!entries.length) return '（空）'
    return entries.map(([k, v]) => {
      const body = toReadable(v, depth + 1)
      return body.includes('\n') ? `${pad}${k}:\n${body}` : `${pad}${k}: ${body}`
    }).join('\n')
  }
  return String(value)
}

// 折叠态（按 key）。默认全收起（state 体量可能大）。
const openKeys = ref<Set<string>>(new Set())
function isOpen(key: string): boolean {
  return openKeys.value.has(key)
}
function toggle(key: string): void {
  const next = new Set(openKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openKeys.value = next
}

// 内联线性图标（与 RoundRecallPoolPanel / TidiaoDirectorStreamBand 同一 Lucide 家族）。
// 场记=clipboard-pen（场记夹板·UI_STYLE 固定语义·带子入口同图标）。
const ICONS: Record<string, string> = {
  'clipboard-pen': '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6.5"/><path d="M4 13.5V6a2 2 0 0 1 2-2h2"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>'
}
const InspIcon = defineComponent({
  name: 'InspIcon',
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
.dsi-overlay {
  position: fixed; inset: 0; z-index: 13000;
  background: color-mix(in srgb, #000 28%, transparent);
  display: flex; justify-content: flex-end;
}
.dsi {
  width: min(480px, 94vw); height: 100%;
  background: var(--morandi-card); border-left: 1px solid var(--morandi-border);
  display: flex; flex-direction: column; box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
  animation: dsi-slide 0.18s ease;
}
@keyframes dsi-slide { from { transform: translateX(24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }
/* 批次G·inline（挤压侧栏内容形态）：去遮罩/去定位/去滑入，撑满 AppChatSection aside 壳；
   壳（.prompt-log-sidebar）自带左边框与底色语义，这里不再叠边框阴影。 */
.dsi-overlay--inline {
  position: static; inset: auto; z-index: auto;
  background: none; display: flex; flex-direction: column; height: 100%; min-height: 0;
}
.dsi-overlay--inline .dsi {
  width: 100%; flex: 1 1 auto; height: auto; min-height: 0;
  border-left: none; box-shadow: none; animation: none;
  background: none;
}

.dsi-head {
  display: flex; align-items: center; gap: 9px; flex: none;
  padding: 14px 16px; border-bottom: 1px solid var(--morandi-border);
}
.dsi-head-icon {
  width: 28px; height: 28px; flex: none; border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-info) 12%, transparent);
  display: flex; align-items: center; justify-content: center; color: var(--morandi-info);
}
.dsi-head-title { font-size: 0.92rem; font-weight: 700; color: var(--morandi-primary); }
.dsi-spacer { flex: 1; }
.dsi-close {
  width: 28px; height: 28px; flex: none; border: none; background: none; cursor: pointer;
  font-size: 1.2rem; line-height: 1; color: var(--morandi-secondary); border-radius: 8px;
}
.dsi-close:hover { background: var(--morandi-hover); color: var(--morandi-text); }

.dsi-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; }
.dsi-section { margin-bottom: 18px; }
.dsi-section-title { font-size: 0.8rem; font-weight: 700; color: var(--morandi-text); margin-bottom: 8px; }

.dsi-kv { display: flex; gap: 8px; font-size: 0.78rem; line-height: 1.6; padding: 1px 0; }
.dsi-k { flex: none; min-width: 100px; color: var(--morandi-secondary); }
.dsi-v { color: var(--morandi-text); word-break: break-word; }
.dsi-v--running { color: var(--morandi-info); }
.dsi-v--done { color: var(--morandi-success, #5a8f6e); }
.dsi-v--failed { color: var(--morandi-danger, #c0584f); }

.dsi-block-head {
  display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; margin-top: 8px;
  background: var(--morandi-surface); border: 1px solid var(--morandi-border); border-radius: 8px;
  padding: 6px 9px; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: var(--morandi-text);
}
.dsi-block-head:hover { background: var(--morandi-hover); }
.dsi-block-head :deep(svg) { transition: transform 0.18s ease; color: var(--morandi-info); flex: none; }
.dsi-block-head .dsi-rot { transform: rotate(180deg); }
.dsi-count {
  margin-left: auto; font-size: 0.7rem; color: var(--morandi-primary);
  background: color-mix(in srgb, var(--morandi-primary) 10%, transparent); border-radius: 999px; padding: 1px 8px;
}
/* md 易读块（取代旧裸 JSON 的 .dsi-json）：人话文本，自动换行，保留缩进层次。 */
.dsi-md {
  margin: 6px 0 0; padding: 10px 12px; border-radius: 8px; max-height: 420px; overflow: auto;
  background: color-mix(in srgb, var(--morandi-primary) 5%, var(--morandi-surface));
  border: 1px solid var(--morandi-border);
  font-family: var(--font-sans, system-ui), sans-serif;
  font-size: 0.78rem; line-height: 1.7; color: var(--morandi-text);
  white-space: pre-wrap; word-break: break-word;
}
.dsi-sub { margin-bottom: 2px; }
.dsi-empty { font-size: 0.8rem; color: var(--morandi-secondary); font-style: italic; padding: 6px 2px; }
</style>
