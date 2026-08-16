<template>
  <div class="ptwc">
    <div class="ptwc__sec">
      性格校准 · 据有效样本
      <span v-if="phase === 'done'" class="ptw__tag ptw__tag--plain">建议</span>
    </div>

    <!-- 入口 -->
    <div v-if="phase === 'idle'" class="ptwc__cta">
      <div class="ptwc__cta-body">
        <div class="ptwc__cta-t">据有效样本校准角色性格</div>
        <div class="ptwc__cta-d">
          以本轮 <b>{{ samples.length }}</b> 条有效样本为准（人工选择优先、预设答案兜底），对照{{ characterName || '该角色' }}当前性格正文，
          判断性格有没有变化、标出分歧，并给出一段<b>修改后的性格正文</b>。仅生成建议，应用前可自行编辑；不影响本次训练样本。
        </div>
      </div>
      <button type="button" class="ptw__btn" :disabled="!samples.length" @click="run">
        <svg class="ptwc__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>
        开始对照
      </button>
    </div>
    <div v-if="phase === 'idle' && !samples.length" class="ptwc__faint">还没有有效样本，请先补全题目的预设答案或人工选择。</div>

    <!-- 分析中 -->
    <div v-else-if="phase === 'analyzing'" class="ptwc__cta ptwc__cta--analyzing">
      <span class="ptwc__spinner"></span>
      <span class="ptwc__analyzing-t">{{ analyzingLabel }}</span>
    </div>

    <!-- 失败 -->
    <div v-else-if="phase === 'error'" class="ptw__banner ptw__banner--danger">
      <b>对照失败：</b>{{ errorMsg }}
      <button type="button" class="ptw__link" @click="run">重试</button>
    </div>

    <!-- 结果 -->
    <template v-else-if="phase === 'done'">
      <div class="ptwc__meta">
        <span>依据 <b>{{ samples.length }}</b> 条有效样本</span>
        <span class="ptwc__sep">·</span>
        <span>建议调整 <b>{{ summary.adjust }}</b> · 新增 <b>{{ summary.new }}</b> · 保留 <b>{{ summary.keep }}</b></span>
        <button type="button" class="ptw__link ptw__link--muted ptwc__rerun" @click="run">重新对照</button>
      </div>

      <!-- 维度卡：纯直观展示，哪里变了 + 依据 -->
      <div v-for="trait in traits" :key="trait.id" class="ptwc__card" :class="{ 'ptwc__card--keep': trait.status === 'keep' }">
        <div class="ptwc__card-head">
          <span class="ptwc__dim">{{ trait.dim }}</span>
          <span v-if="trait.status === 'keep'" class="ptw__tag ptw__tag--green">与样本一致</span>
          <span v-else-if="trait.status === 'new'" class="ptw__tag ptw__tag--gold">新增倾向</span>
          <span v-else class="ptw__tag ptw__tag--gold">建议调整</span>
          <span v-if="trait.conflict" class="ptwc__flag">
            <svg class="ptwc__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            与原性格分歧
          </span>
        </div>

        <!-- 刻度对照 -->
        <div class="ptwc__spectrum">
          <div class="ptwc__sp-labels"><span>{{ trait.axisLabels[0] }}</span><span>{{ trait.axisLabels[1] }}</span></div>
          <div class="ptwc__sp-track">
            <div v-if="trait.oldPos != null && trait.status !== 'keep'" class="ptwc__sp-shift" :style="shiftStyle(trait)"></div>
            <span v-if="trait.oldPos != null" class="ptwc__sp-old" :style="{ left: pct(trait.oldPos) }" title="性格当前"></span>
            <span class="ptwc__sp-new" :class="{ 'ptwc__sp-new--keep': trait.status === 'keep' }" :style="{ left: pct(trait.newPos) }" title="据样本建议"></span>
          </div>
        </div>

        <!-- 修改前 / 修改意见 -->
        <div class="ptwc__diff">
          <div class="ptwc__diff-row">
            <span class="ptwc__diff-tag">修改前</span>
            <span class="ptwc__diff-before" :class="{ 'ptwc__diff-before--empty': trait.status === 'new' }">{{ trait.status === 'new' ? '原性格正文未涉及此项' : (trait.before || '—') }}</span>
          </div>
          <div class="ptwc__diff-row">
            <span class="ptwc__diff-tag ptwc__diff-tag--after">{{ trait.status === 'keep' ? '保留' : '修改意见' }}</span>
            <span class="ptwc__diff-after">{{ trait.after || '—' }}</span>
          </div>
        </div>

        <!-- 依据 -->
        <div v-if="trait.evidence.length" class="ptwc__evchips">
          <span class="ptwc__ev-lead">依据</span>
          <span v-for="(ev, i) in trait.evidence" :key="i" class="ptwc__evchip" :class="'ptwc__evchip--' + ev.kind">
            <span v-if="ev.kind === 'pos'" class="ptw__dot ptw__dot--ok"></span>
            <span v-else-if="ev.kind === 'neg'" class="ptw__dot ptw__dot--fail"></span>
            {{ ev.text }}
          </span>
        </div>
      </div>

      <!-- 修改后性格正文（可编辑整段） -->
      <div class="ptwc__sec ptwc__sec--revised">
        修改后性格正文
        <span class="ptwc__faint-inline">人工优先、预设兜底 · 可直接编辑</span>
        <button type="button" class="ptw__link ptw__link--muted ptwc__compare-toggle" @click="showOriginal = !showOriginal">
          {{ showOriginal ? '收起原性格' : '对照原性格' }}
        </button>
      </div>
      <div v-if="showOriginal" class="ptwc__original">
        <div class="ptwc__original-tag">修改前 · 原性格正文</div>
        <div class="ptwc__original-text">{{ originalPersonality || '（角色当前没有填写性格正文）' }}</div>
      </div>
      <textarea
        v-model="revisedText"
        class="ptwc__revised"
        rows="6"
        spellcheck="false"
        placeholder="修改后性格正文"
      ></textarea>

      <!-- 应用 -->
      <div v-if="applied" class="ptw__banner">
        已写入{{ characterName || '该角色' }}的<b>性格正文</b>（以有效样本为准），可在角色编辑中查看或继续修改；本次训练样本不受影响。
        <button type="button" class="ptw__link" @click="applied = false">继续编辑</button>
      </div>
      <div v-else class="ptwc__apply">
        <span :class="{ 'ptwc__apply-dirty': revisedText.trim() !== originalPersonality.trim() }">
          {{ revisedText.trim() === originalPersonality.trim() ? '当前与原性格一致' : '将以上修改后性格写入角色性格字段' }}
        </span>
        <button type="button" class="ptw__btn ptw__btn--primary" :disabled="!canApply || applying" @click="apply">
          {{ applying ? '写入中…' : '应用到角色性格' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAI } from '../../../../../composables/useAI'
import { useCharacterStore } from '../../../../../stores/characterStore'
import { useSettingStore } from '../../../../../stores/settingStore'
import { runPersonalityKernelParser } from '../../../../../app/personalityKernelParser'
import {
  runPersonalityCalibration,
  type PersonalityCalibrationSample,
  type PersonalityCalibrationTrait
} from '../../../../../app/personalityCalibration'

const props = withDefaults(defineProps<{
  characterId: string
  characterName?: string
  samples: PersonalityCalibrationSample[]
}>(), {
  characterName: ''
})

const emit = defineEmits<{
  (e: 'toast', message: string, type: 'success' | 'error'): void
  (e: 'character-updated'): void
}>()

const { callAI } = useAI()
const characterStore = useCharacterStore()
const settingStore = useSettingStore()

type Phase = 'idle' | 'analyzing' | 'done' | 'error'
const phase = ref<Phase>('idle')
const analyzingLabel = ref('正在对照有效样本与性格正文…')
const errorMsg = ref('')
const traits = ref<PersonalityCalibrationTrait[]>([])
const summary = ref({ adjust: 0, new: 0, keep: 0 })
const originalPersonality = ref('')
const revisedText = ref('')
const showOriginal = ref(false)
const applied = ref(false)
const applying = ref(false)

const canApply = computed(() => {
  const next = revisedText.value.trim()
  return Boolean(next) && next !== originalPersonality.value.trim()
})

function pct(x: number): string {
  return `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`
}

function shiftStyle(trait: PersonalityCalibrationTrait) {
  if (trait.oldPos == null) return {}
  const lo = Math.min(trait.oldPos, trait.newPos)
  const hi = Math.max(trait.oldPos, trait.newPos)
  return { left: pct(lo), width: pct(hi - lo) }
}

function readPersonalityText(character: Record<string, unknown>): string {
  return String(character.personality ?? (character as any).personality_text ?? '').trim()
}

async function run() {
  applied.value = false
  errorMsg.value = ''
  phase.value = 'analyzing'
  try {
    const character = characterStore.getCharacter(props.characterId)
    if (!character) throw new Error('找不到该角色，请重新打开训练弹窗。')

    const personalityText = readPersonalityText(character as unknown as Record<string, unknown>)
    originalPersonality.value = personalityText
    const agentConfig = settingStore.getBrainAgentConfig() as any

    // 即时解析 8 维内核（不依赖已停用的自动 persist）；解析失败不阻断，按无内核继续。
    let kernel = null
    if (personalityText) {
      analyzingLabel.value = '正在解析角色性格内核…'
      const kernelResult = await runPersonalityKernelParser({
        characterId: props.characterId,
        characterName: props.characterName,
        personalityText,
        agentConfig,
        callAI: callAI as any
      })
      kernel = kernelResult.status === 'parsed' ? kernelResult.kernel : null
    }

    analyzingLabel.value = '正在对照有效样本与性格正文…'
    const result = await runPersonalityCalibration({
      characterName: props.characterName,
      personalityText,
      samples: props.samples,
      kernel,
      agentConfig,
      callAI: callAI as any
    })

    if (result.status !== 'ok') {
      throw new Error(result.reason || '模型未给出有效的对照建议。')
    }

    traits.value = result.traits
    summary.value = result.summary
    revisedText.value = result.revisedPersonality || personalityText
    showOriginal.value = false
    phase.value = 'done'
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : String(error)
    phase.value = 'error'
  }
}

async function apply() {
  if (applying.value || !canApply.value) return
  applying.value = true
  try {
    await characterStore.updateCharacter(props.characterId, { personality: revisedText.value.trim() } as any)
    originalPersonality.value = revisedText.value.trim()
    applied.value = true
    emit('character-updated')
    emit('toast', '已写入角色性格正文', 'success')
  } catch (error) {
    emit('toast', `写入角色性格失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.ptwc {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
}

.ptwc__sec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--morandi-text, #4f463f);
}
.ptwc__sec--revised { margin-top: 16px; }
.ptwc__faint-inline { font-size: 0.72rem; font-weight: 400; color: var(--morandi-text-light, #8a8278); }
.ptwc__compare-toggle { margin-left: auto; font-size: 0.74rem; }

.ptwc__faint {
  font-size: 0.74rem;
  color: var(--morandi-text-light, #8a8278);
  margin-top: 8px;
  line-height: 1.55;
}

/* 入口 / 分析中 */
.ptwc__cta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 60%, transparent);
}

.ptwc__cta--analyzing { gap: 10px; }
.ptwc__cta-body { flex: 1; min-width: 0; }
.ptwc__cta-t { font-size: 0.88rem; font-weight: 600; color: var(--morandi-text, #4f463f); }
.ptwc__cta-d { font-size: 0.78rem; color: var(--morandi-text-light, #7b746b); line-height: 1.6; margin-top: 4px; }
.ptwc__cta-d b { color: var(--morandi-text, #4f463f); font-weight: 600; }
.ptwc__cta .ptw__btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; }

.ptwc__analyzing-t { font-size: 0.83rem; color: var(--morandi-text-light, #7b746b); }
.ptwc__spinner {
  width: 15px; height: 15px; flex-shrink: 0;
  border: 2px solid rgba(92, 138, 92, 0.25);
  border-top-color: var(--morandi-accent, #5c8a5c);
  border-radius: 50%;
  animation: ptwc-spin 0.7s linear infinite;
}
@keyframes ptwc-spin { to { transform: rotate(360deg); } }

.ptwc__ico { flex-shrink: 0; }

/* 结果元信息 */
.ptwc__meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 0.76rem; color: var(--morandi-text-light, #7b746b); margin-bottom: 8px;
}
.ptwc__meta b { color: var(--morandi-text, #4f463f); font-weight: 600; font-variant-numeric: tabular-nums; }
.ptwc__sep { color: var(--morandi-text-light, #b3aca1); }
.ptwc__rerun { margin-left: auto; font-size: 0.74rem; }

/* 维度卡 */
.ptwc__card {
  padding: 13px 15px; margin-bottom: 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent); border-radius: 12px;
  background: var(--morandi-card);
}
.ptwc__card--keep { background: color-mix(in srgb, var(--morandi-soft-bg) 50%, transparent); }

.ptwc__card-head { display: flex; align-items: center; gap: 8px; }
.ptwc__dim { font-size: 0.88rem; font-weight: 600; color: var(--morandi-text, #4f463f); }
.ptwc__flag { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; color: #a07c1e; }

/* 刻度 */
.ptwc__spectrum { margin: 13px 0 14px; }
.ptwc__sp-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--morandi-text-light, #8a8278); margin-bottom: 7px; }
.ptwc__sp-track { position: relative; height: 4px; border-radius: 999px; background: rgba(139, 115, 85, 0.16); }
.ptwc__sp-shift { position: absolute; top: 0; height: 4px; border-radius: 999px; background: rgba(92, 138, 92, 0.28); }
.ptwc__sp-old {
  position: absolute; top: 50%; width: 11px; height: 11px; border-radius: 50%;
  background: var(--morandi-card); border: 1.5px solid var(--morandi-text-light, #8a8278); transform: translate(-50%, -50%); z-index: 1;
}
.ptwc__sp-new {
  position: absolute; top: 50%; width: 13px; height: 13px; border-radius: 50%;
  background: var(--morandi-accent, #5c8a5c); border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--morandi-accent, #5c8a5c); transform: translate(-50%, -50%); z-index: 2;
}
.ptwc__sp-new--keep { background: #a0b5c4; box-shadow: 0 0 0 1px #a0b5c4; }

/* diff */
.ptwc__diff { font-size: 0.82rem; line-height: 1.62; }
.ptwc__diff-row { display: flex; gap: 10px; padding: 3px 0; }
.ptwc__diff-tag { flex-shrink: 0; width: 52px; font-size: 0.72rem; color: var(--morandi-text-light, #8a8278); padding-top: 2px; }
.ptwc__diff-tag--after { color: var(--morandi-accent, #5c8a5c); }
.ptwc__diff-before { color: var(--morandi-text-light, #8a8278); text-decoration: line-through; text-decoration-color: rgba(139, 115, 85, 0.45); }
.ptwc__diff-before--empty { text-decoration: none; font-style: italic; color: var(--morandi-text-light, #b3aca1); }
.ptwc__diff-after { color: var(--morandi-text, #4f463f); }

/* 依据 */
.ptwc__evchips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 11px; }
.ptwc__ev-lead { font-size: 0.72rem; color: var(--morandi-text-light, #8a8278); margin-right: 1px; }
.ptwc__evchip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 0.72rem; padding: 3px 9px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent); background: color-mix(in srgb, var(--morandi-soft-bg) 60%, transparent); color: var(--morandi-text-light, #7b746b);
}
.ptwc__evchip--pos { border-color: rgba(92, 138, 92, 0.3); }
.ptwc__evchip--neg { border-color: rgba(192, 102, 90, 0.3); }
.ptw__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.ptw__dot--ok { background: var(--morandi-accent, #5c8a5c); }
.ptw__dot--fail { background: #c0665a; }

/* 修改前 / 修改后整段 */
.ptwc__original {
  margin-bottom: 8px; padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent); border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 50%, transparent);
}
.ptwc__original-tag { font-size: 0.72rem; color: var(--morandi-text-light, #8a8278); margin-bottom: 4px; }
.ptwc__original-text { font-size: 0.82rem; line-height: 1.62; color: var(--morandi-text-light, #8a8278); white-space: pre-wrap; }

.ptwc__revised {
  width: 100%; box-sizing: border-box; resize: vertical;
  padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent); border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff); color: var(--morandi-text, #4f463f);
  font: inherit; font-size: 0.84rem; line-height: 1.62;
}
.ptwc__revised:focus { outline: none; border-color: var(--morandi-accent, #5c8a5c); }

/* 应用 */
.ptwc__apply {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 13px; border-top: 1px solid color-mix(in srgb, var(--morandi-border) 60%, transparent);
  font-size: 0.8rem; color: var(--morandi-text-light, #8a8278);
}
.ptwc__apply-dirty { color: var(--morandi-text-light, #7b746b); }
.ptwc__apply .ptw__btn { margin-left: auto; }

/* 复用工作台 tag / banner / link / btn 视觉 */
.ptw__tag { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; background: rgba(139, 115, 85, 0.1); color: #8b7355; font-size: 0.7rem; font-weight: 500; white-space: nowrap; }
.ptw__tag--green { background: rgba(92, 138, 92, 0.13); color: var(--morandi-accent, #5c8a5c); }
.ptw__tag--gold { background: rgba(212, 168, 67, 0.16); color: #a07c1e; }
.ptw__tag--plain { background: rgba(160, 181, 196, 0.18); color: #567184; }
.ptw__link { border: 0; padding: 0; background: none; color: var(--morandi-accent, #5c8a5c); font: inherit; font-size: 0.8rem; cursor: pointer; }
.ptw__link:hover { text-decoration: underline; }
.ptw__link--muted { color: var(--morandi-text-light, #7b746b); }
.ptw__btn { padding: 7px 14px; border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--morandi-card) 90%, transparent); color: var(--morandi-text, #4f463f); font: inherit; font-size: 0.84rem; cursor: pointer; }
.ptw__btn:hover:not(:disabled) { background: color-mix(in srgb, var(--morandi-hover) 96%, transparent); }
.ptw__btn--primary { border-color: var(--langhuan-dialog-primary-bg, #525e43); background: var(--langhuan-dialog-primary-bg, #525e43); color: #fff; }
.ptw__btn--primary:hover:not(:disabled) { background: var(--langhuan-dialog-primary-bg-hover, #46503a); }
.ptw__btn:disabled { opacity: 0.45; cursor: default; }
.ptw__banner { display: block; margin-top: 14px; padding: 9px 13px; border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--morandi-soft-bg) 80%, transparent); color: var(--morandi-text-light, #7b746b); font-size: 0.82rem; line-height: 1.55; }
.ptw__banner b { color: var(--morandi-text, #4f463f); font-weight: 600; }
.ptw__banner--danger { border-color: rgba(192, 102, 90, 0.4); background: rgba(192, 102, 90, 0.07); }
.ptw__banner .ptw__link { margin-left: 8px; }
</style>
