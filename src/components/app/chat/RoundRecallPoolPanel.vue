<template>
  <!-- 资料池侧栏（2026-06-29 对话级·可编辑）：列每角色资料池 + 世界知识池，支持用户删卡 / 加自定义卡。
       卡片折叠规则（用户 2026-06-23）：
       - 有格式（标题/摘要/正文）：折叠显标题 + 摘要，展开显正文。
       - 无格式：取正文/摘要前 30 字当标题，展开显全文。
       数据由父层从对话级资料池缓存（recallRoundPoolCache·按 sessionId）读出当作 prop 传入；
       编辑直接调同一模块级单例缓存（删卡写墓碑·召回不复活 / 加卡入角色或世界池），版本号自增让全链路即时刷新。
       入口常驻（2026-07-03）：纯按需取料下空池是常态——pools 为 null 时用 sessionId prop 兜底，仍可手动加卡。
       2026-07-10 双形态（与 DirectorStateInspector 同范式）：variant='inline' 不 Teleport、不遮罩，
       整块作为 AppChatSection 挤压 aside 的内容渲染；缺省 'overlay' 保持旧浮层（移动端零回归）。 -->
  <Teleport to="body" :disabled="variant === 'inline'">
    <div
      class="rrp-overlay"
      :class="{ 'rrp-overlay--inline': variant === 'inline' }"
      @click.self="variant !== 'inline' && emit('close')"
    >
      <aside class="rrp" role="dialog" :aria-modal="variant !== 'inline'" :aria-label="$t('diagnostics.recallPool.aria')">
        <header class="rrp-head">
          <span class="rrp-head-icon"><PoolIcon name="database" :size="16" /></span>
          <span class="rrp-head-title">{{ $t('diagnostics.recallPool.title') }}</span>
          <span class="rrp-spacer"></span>
          <button type="button" class="rrp-close" :title="$t('diagnostics.recallPool.closeSidebar')" :aria-label="$t('diagnostics.recallPool.closeSidebar')" @click="emit('close')">×</button>
        </header>

        <div class="rrp-body">
          <section v-for="group in groups" :key="group.key" class="rrp-group">
            <div class="rrp-group-head">
              <span class="rrp-group-icon" :class="group.world ? 'rrp-group-icon--world' : 'rrp-group-icon--char'">
                <PoolIcon :name="group.world ? 'globe' : 'user'" :size="13" />
              </span>
              <span class="rrp-group-name">{{ group.name }}</span>
              <span class="rrp-group-count">{{ $t('diagnostics.recallPool.cardCount', { count: group.cards.length }) }}</span>
              <span v-if="group.world" class="rrp-group-tag">{{ $t('diagnostics.recallPool.narrationOnly') }}</span>
            </div>
            <div class="rrp-cards">
              <div
                v-for="card in group.cards"
                :key="card.id"
                class="rrp-card"
                :class="{ 'is-open': isOpen(card.id) }"
              >
                <div class="rrp-card-row">
                  <button
                    type="button"
                    class="rrp-card-head"
                    :class="{ 'rrp-card-head--static': !cardExpandable(card) }"
                    :disabled="!cardExpandable(card)"
                    @click="cardExpandable(card) && toggle(card.id)"
                  >
                    <span v-if="cardExpandable(card)" class="rrp-card-chev"><PoolIcon name="chevron-down" :size="12" :stroke="1.9" /></span>
                    <span v-else class="rrp-card-dot"></span>
                    <span class="rrp-card-title">{{ cardTitle(card) }}</span>
                  </button>
                  <button
                    v-if="editable"
                    type="button"
                    class="rrp-card-del"
                    :title="$t('diagnostics.recallPool.removeCardTitle')"
                    :aria-label="$t('diagnostics.recallPool.removeCard')"
                    @click.stop="onRemove(card.id)"
                  >×</button>
                </div>
                <div v-if="!isOpen(card.id) && cardFoldedSummary(card)" class="rrp-card-summary">{{ cardFoldedSummary(card) }}</div>
                <div v-if="isOpen(card.id) && cardBody(card)" class="rrp-card-body">{{ cardBody(card) }}</div>
              </div>
            </div>
          </section>
          <div v-if="!groups.length" class="rrp-empty-all">{{ $t('diagnostics.recallPool.emptyAll') }}</div>

          <!-- 用户加自定义资料卡（对话级）：选归属（某角色私有池 / 世界知识池）+ 标题 + 正文。 -->
          <section v-if="editable && sessionId" class="rrp-add">
            <button v-if="!addOpen" type="button" class="rrp-add-toggle" @click="addOpen = true">{{ $t('diagnostics.recallPool.addCustomCard') }}</button>
            <div v-else class="rrp-add-form">
              <div class="rrp-add-row">
                <label class="rrp-add-label">{{ $t('diagnostics.recallPool.attribution') }}</label>
                <select v-model="addTarget" class="rrp-add-select">
                  <option v-for="opt in addTargetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <input v-model="addTitle" class="rrp-add-input" type="text" :placeholder="$t('diagnostics.recallPool.titlePlaceholder')" maxlength="80" />
              <textarea v-model="addBody" class="rrp-add-textarea" rows="3" :placeholder="$t('diagnostics.recallPool.bodyPlaceholder')"></textarea>
              <div class="rrp-add-actions">
                <button type="button" class="rrp-add-cancel" @click="closeAdd">{{ $t('common.cancel') }}</button>
                <button type="button" class="rrp-add-confirm" :disabled="!canAdd" @click="onAdd">{{ $t('common.add') }}</button>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RecallPoolCard, RoundRecallPools } from '../../../app/recallRoundPool'
import { createLocalRecallRoundPoolCache, recallPoolStoreVersion } from '../../../app/recallRoundPoolCache'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    pools: RoundRecallPools | null
    /** 入口常驻（2026-07-03）·空池兜底会话 id：pools 为 null（会话还没有池）时增删靠它定位对话池
     *  （addCard 对不存在的会话池会自建）；pools 非空时以 pools.sessionId 为准。 */
    sessionId?: string
    /** 入口常驻·加卡归属选项：当前会话成员 characterId 列表（与已有池角色并集去重）；
     *  缺省只列已有池角色+世界池（空池时仅世界池可选）。 */
    castCharacterIds?: string[]
    /** characterId → 角色名（父层从 charStore 传）；缺省回退 characterId。 */
    resolveName?: (characterId: string) => string
    /** 可编辑（删卡 / 加自定义卡）。默认 true——对话级池任意时刻可由用户增删。 */
    editable?: boolean
    /** 2026-07-10 双形态：'overlay'=Teleport 浮层（缺省·移动端）；'inline'=挤压侧栏内容（AppChatSection aside 壳内）。 */
    variant?: 'overlay' | 'inline'
  }>(),
  { sessionId: '', castCharacterIds: () => [], resolveName: undefined, editable: true, variant: 'overlay' }
)

const emit = defineEmits<{ (e: 'close'): void }>()

// 共享模块级单例缓存：编辑直接写它（删卡写墓碑 / 加卡），版本号自增让父层 computed + 本组件即时刷新。
const poolCache = createLocalRecallRoundPoolCache()
const sessionId = computed(() => String(props.pools?.sessionId || props.sessionId || '').trim())

interface PoolGroup {
  key: string
  name: string
  world: boolean
  cards: RecallPoolCard[]
}

// 分组：每个角色池（有卡才列）+ 世界池（有卡才列，标「仅供旁白」）。依赖版本号 → 用户增删后即时重算。
const groups = computed<PoolGroup[]>(() => {
  void recallPoolStoreVersion.value
  const out: PoolGroup[] = []
  const characterPools = props.pools?.characterPools || {}
  for (const [characterId, pool] of Object.entries(characterPools)) {
    const cards = Array.isArray(pool?.cards) ? pool.cards : []
    if (!cards.length) continue
    out.push({
      key: `char_${characterId}`,
      name: props.resolveName ? props.resolveName(characterId) : characterId,
      world: false,
      cards
    })
  }
  const worldCards = props.pools?.worldPool?.cards || []
  if (worldCards.length) out.push({ key: '__world', name: t('diagnostics.recallPool.worldKnowledge'), world: true, cards: worldCards })
  return out
})

// ===== 用户编辑（对话级·2026-06-29） =====
function onRemove(cardId: string): void {
  if (!sessionId.value) return
  poolCache.removeCard(sessionId.value, cardId)
}

// 加卡表单态。归属：会话成员（castCharacterIds）∪ 已有池角色（并集去重）+ 世界知识池——
// 入口常驻后空池也能给任一会话成员手动加第一张卡，不再只限已有池的角色。
const addOpen = ref(false)
const addTarget = ref('') // 'world' 或 'char:<characterId>'
const addTitle = ref('')
const addBody = ref('')
const addTargetOptions = computed<Array<{ value: string; label: string }>>(() => {
  void recallPoolStoreVersion.value
  const opts: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const raw of [...(props.castCharacterIds || []), ...Object.keys(props.pools?.characterPools || {})]) {
    const characterId = String(raw || '').trim()
    if (!characterId || seen.has(characterId)) continue
    seen.add(characterId)
    opts.push({ value: `char:${characterId}`, label: t('diagnostics.recallPool.charPrivateLabel', { name: props.resolveName ? props.resolveName(characterId) : characterId }) })
  }
  opts.push({ value: 'world', label: t('diagnostics.recallPool.worldKnowledgeNarrationOnly') })
  if (!addTarget.value || !opts.some((o) => o.value === addTarget.value)) addTarget.value = opts[0]?.value || 'world'
  return opts
})
const canAdd = computed(() => Boolean(addBody.value.trim() || addTitle.value.trim()))
function closeAdd(): void {
  addOpen.value = false
  addTitle.value = ''
  addBody.value = ''
}
function onAdd(): void {
  if (!sessionId.value || !canAdd.value) return
  const id = `user_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const card = { id, title: addTitle.value.trim(), bodyText: addBody.value.trim() }
  const target = addTarget.value === 'world'
    ? { kind: 'world' as const }
    : { kind: 'character' as const, characterId: addTarget.value.replace(/^char:/, '') }
  poolCache.addCard(sessionId.value, target, card)
  closeAdd()
}

// 卡片折叠态（按 id）。
const openCards = ref<Set<string>>(new Set())
function isOpen(id: string): boolean {
  return openCards.value.has(id)
}
function toggle(id: string): void {
  const next = new Set(openCards.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openCards.value = next
}

function cardHasTitle(card: RecallPoolCard): boolean {
  return Boolean(String(card.title || '').trim())
}
// 无格式卡的全文内容（正文优先、摘要兜底）；有格式卡取前 30 字当标题也用它。
function cardContent(card: RecallPoolCard): string {
  return String(card.bodyText || card.summary || '').trim()
}
// 标题：有标题用标题；无标题取内容前 30 字（超长加省略号），全空兜底。
function cardTitle(card: RecallPoolCard): string {
  if (cardHasTitle(card)) return String(card.title).trim()
  const content = cardContent(card)
  if (!content) return t('diagnostics.recallPool.emptyCard')
  return content.length > 30 ? content.slice(0, 30) + '…' : content
}
// 折叠态摘要行：仅有标题的卡显示摘要（无标题卡的标题本身已是内容预览，不再重复摘要）。
function cardFoldedSummary(card: RecallPoolCard): string {
  return cardHasTitle(card) ? String(card.summary || '').trim() : ''
}
// 展开正文：有标题卡只用正文（无正文则不可展开）；无标题卡展开看全文内容。
function cardBody(card: RecallPoolCard): string {
  return cardHasTitle(card) ? String(card.bodyText || '').trim() : cardContent(card)
}
// 可展开：正文非空，且与折叠态摘要不同（避免展开后看到一模一样的内容）。
function cardExpandable(card: RecallPoolCard): boolean {
  const body = cardBody(card)
  return Boolean(body) && body !== cardFoldedSummary(card)
}

// 内联线性图标（与 TidiaoDirectorStreamBand 同一 Lucide 家族、同款渲染方式）。
const ICONS: Record<string, string> = {
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>'
}

const PoolIcon = defineComponent({
  name: 'PoolIcon',
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
/* 与 TidiaoDirectorStreamBand 同一视觉语言（纸面气质、克制圆角、morandi token）。 */
.rrp-overlay {
  position: fixed; inset: 0; z-index: 13000;
  background: color-mix(in srgb, #000 28%, transparent);
  display: flex; justify-content: flex-end;
}
.rrp {
  width: min(420px, 92vw); height: 100%;
  background: var(--morandi-card); border-left: 1px solid var(--morandi-border);
  display: flex; flex-direction: column; box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
  animation: rrp-slide 0.18s ease;
}
@keyframes rrp-slide { from { transform: translateX(24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }
/* inline（挤压侧栏内容形态·与 DirectorStateInspector 同范式）：去遮罩/去定位/去滑入，撑满 AppChatSection aside 壳；
   壳（.prompt-log-sidebar）自带左边框与底色语义，这里不再叠边框阴影。 */
.rrp-overlay--inline {
  position: static; inset: auto; z-index: auto;
  background: none; display: flex; flex-direction: column; height: 100%; min-height: 0;
}
.rrp-overlay--inline .rrp {
  width: 100%; flex: 1 1 auto; height: auto; min-height: 0;
  border-left: none; box-shadow: none; animation: none;
  background: none;
}

.rrp-head {
  display: flex; align-items: center; gap: 9px; flex: none;
  padding: 14px 16px; border-bottom: 1px solid var(--morandi-border);
}
.rrp-head-icon {
  width: 28px; height: 28px; flex: none; border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-info) 12%, transparent);
  display: flex; align-items: center; justify-content: center; color: var(--morandi-info);
}
.rrp-head-title { font-size: 0.92rem; font-weight: 700; color: var(--morandi-primary); }
.rrp-spacer { flex: 1; }
.rrp-close {
  width: 28px; height: 28px; flex: none; border: none; background: none; cursor: pointer;
  font-size: 1.2rem; line-height: 1; color: var(--morandi-secondary); border-radius: 8px;
}
.rrp-close:hover { background: var(--morandi-hover); color: var(--morandi-text); }

.rrp-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; }

.rrp-group { margin-bottom: 16px; }
.rrp-group-head { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.rrp-group-icon {
  width: 22px; height: 22px; flex: none; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.rrp-group-icon--char { background: color-mix(in srgb, var(--morandi-primary) 14%, transparent); color: var(--morandi-primary); }
.rrp-group-icon--world { background: color-mix(in srgb, var(--morandi-accent) 14%, transparent); color: var(--morandi-accent); }
.rrp-group-name { font-size: 0.85rem; font-weight: 700; color: var(--morandi-text); }
.rrp-group-count { font-size: 0.7rem; color: var(--morandi-primary); background: color-mix(in srgb, var(--morandi-primary) 10%, transparent); border-radius: 999px; padding: 1px 8px; }
.rrp-group-tag { font-size: 0.68rem; color: var(--morandi-accent); background: color-mix(in srgb, var(--morandi-accent) 10%, transparent); border-radius: 999px; padding: 1px 8px; }

.rrp-cards { display: flex; flex-direction: column; gap: 7px; }
.rrp-card {
  background: var(--morandi-surface); border: 1px solid var(--morandi-border); border-radius: 9px;
  padding: 8px 10px;
}
.rrp-card.is-open { border-color: color-mix(in srgb, var(--morandi-info) 32%, var(--morandi-border)); }
.rrp-card-head {
  display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
  background: none; border: none; padding: 0; cursor: pointer; color: var(--morandi-text);
}
.rrp-card-head--static { cursor: default; }
.rrp-card-chev { display: inline-flex; flex: none; color: var(--morandi-info); }
.rrp-card-chev :deep(svg) { transition: transform 0.18s ease; }
.rrp-card.is-open .rrp-card-chev :deep(svg) { transform: rotate(180deg); }
.rrp-card-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--morandi-secondary); margin: 0 3px; }
.rrp-card-title { font-size: 0.82rem; font-weight: 600; color: var(--morandi-text); min-width: 0; line-height: 1.45; }
.rrp-card-summary {
  font-size: 0.78rem; color: var(--morandi-text-light); line-height: 1.5; margin-top: 5px; padding-left: 18px;
}
.rrp-card-body {
  font-size: 0.8rem; color: var(--morandi-text-light); line-height: 1.6; margin-top: 6px; padding-left: 18px;
  white-space: pre-wrap; word-break: break-word;
  border-top: 1px dashed color-mix(in srgb, var(--morandi-primary) 14%, transparent); padding-top: 6px;
}
.rrp-empty-all { font-size: 0.82rem; color: var(--morandi-secondary); font-style: italic; padding: 12px 2px; }

/* 卡片行：展开头 + 删除按钮并排（删除按钮不嵌进展开 button）。 */
.rrp-card-row { display: flex; align-items: flex-start; gap: 6px; }
.rrp-card-row .rrp-card-head { flex: 1; min-width: 0; }
.rrp-card-del {
  flex: none; width: 20px; height: 20px; border: none; background: none; cursor: pointer;
  font-size: 1rem; line-height: 1; color: var(--morandi-secondary); border-radius: 6px; padding: 0;
  opacity: 0.5; transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.rrp-card:hover .rrp-card-del { opacity: 1; }
.rrp-card-del:hover { background: color-mix(in srgb, var(--morandi-danger, #c0584f) 14%, transparent); color: var(--morandi-danger, #c0584f); }

/* 用户加自定义资料卡。 */
.rrp-add { margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--morandi-border); }
.rrp-add-toggle {
  width: 100%; padding: 8px; border: 1px dashed var(--morandi-border); border-radius: 9px;
  background: none; cursor: pointer; font-size: 0.8rem; color: var(--morandi-primary);
}
.rrp-add-toggle:hover { background: var(--morandi-hover); border-color: color-mix(in srgb, var(--morandi-primary) 32%, var(--morandi-border)); }
.rrp-add-form { display: flex; flex-direction: column; gap: 8px; }
.rrp-add-row { display: flex; align-items: center; gap: 8px; }
.rrp-add-label { font-size: 0.78rem; color: var(--morandi-secondary); flex: none; }
.rrp-add-select, .rrp-add-input, .rrp-add-textarea {
  font-size: 0.8rem; color: var(--morandi-text); background: var(--morandi-surface);
  border: 1px solid var(--morandi-border); border-radius: 8px; padding: 6px 8px; font-family: inherit;
}
.rrp-add-select { flex: 1; min-width: 0; }
.rrp-add-input { width: 100%; }
.rrp-add-textarea { width: 100%; resize: vertical; line-height: 1.5; }
.rrp-add-select:focus, .rrp-add-input:focus, .rrp-add-textarea:focus { outline: none; border-color: color-mix(in srgb, var(--morandi-info) 40%, var(--morandi-border)); }
.rrp-add-actions { display: flex; justify-content: flex-end; gap: 8px; }
.rrp-add-cancel, .rrp-add-confirm {
  font-size: 0.8rem; padding: 6px 14px; border-radius: 8px; cursor: pointer; border: 1px solid var(--morandi-border);
}
.rrp-add-cancel { background: none; color: var(--morandi-secondary); }
.rrp-add-cancel:hover { background: var(--morandi-hover); }
.rrp-add-confirm { background: var(--morandi-primary); color: #fff; border-color: var(--morandi-primary); }
.rrp-add-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
.rrp-add-confirm:not(:disabled):hover { filter: brightness(1.05); }
</style>
