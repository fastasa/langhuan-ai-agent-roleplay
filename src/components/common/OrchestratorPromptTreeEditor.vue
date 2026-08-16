<template>
  <!-- 回复编排器「提示词树」共享编辑组件（2026-06-20 迁移）。
       旧实现内联在 PersonalityModelOrchestrationAuditPanel.vue；本组件供本地编排诊断面板编辑。
       数据真值：全局回复编排器配置（system 基线），fetchOrchestratorConfig 读 / saveOrchestratorConfig 写。
       readonly：只保留查看（树结构 + 标签 + 启用态 + 本轮已读取/已调用标记），去掉所有编辑入口与弹窗。 -->
  <div class="opt-root">
    <div v-if="!readonly && saveError" class="oc-error">{{ saveError }}</div>
    <div v-else-if="!readonly && configNotice" class="oc-notice">{{ configNotice }}</div>

    <div v-if="loading" class="cp-empty">正在加载全局编排配置…</div>
    <div v-else-if="config" class="ptree">
      <!-- LANGHUAN.md（上游角色 / 世界总入口，只读） -->
      <div class="tn" :class="{ interactive: !readonly }" :style="{ paddingLeft: '6px' }" @click="!readonly && openLanghuan()">
        <span class="tn-tog"><span class="tn-leafdot"></span></span>
        <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>
        <span class="tn-label">LANGHUAN.md</span>
      </div>
      <!-- 回复编排器总提示词 -->
      <div class="tn" :class="{ interactive: !readonly }" :style="{ paddingLeft: '6px' }" @click="!readonly && openEditSystem()">
        <span class="tn-tog"><span class="tn-leafdot"></span></span>
        <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
        <span class="tn-label">回复编排器总提示词</span>
      </div>
      <!-- 情境skill 文件夹（可点开合，readonly 也可折叠） -->
      <div class="tn interactive" :style="{ paddingLeft: '6px' }" @click="promptGroupOpen = !promptGroupOpen">
        <span class="tn-tog">
          <svg class="tn-chev" :class="{ open: promptGroupOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
        </span>
        <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        <span class="tn-label">情境skill<span class="tn-sub">{{ config.scenarios.length }}</span></span>
      </div>
      <template v-if="promptGroupOpen">
        <!-- 每个情境 = 一个文件，挂载提示词紧跟在其下方 -->
        <template v-for="s in config.scenarios" :key="s.code">
          <div
            class="tn"
            :class="{ interactive: !readonly }"
            :style="{ paddingLeft: '21px' }"
            :title="readonly ? '' : '右键新建挂载提示词'"
            @click="!readonly && openEditScenario(s)"
            @contextmenu="onScenarioContextMenu($event, s.code)"
          >
            <span class="tn-tog"><span class="tn-leafdot"></span></span>
            <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
            <span class="tn-label">{{ s.code }}<span class="tn-sub">{{ s.label }}</span></span>
            <span v-if="activeScenarioCode && s.code === activeScenarioCode" class="tn-read" title="本轮已读取"></span>
            <span v-if="!readonly" class="tn-actwrap">
              <button type="button" class="tn-act" title="新建挂载提示词" @click.stop="openNewMountedPrompt(s.code)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button type="button" class="tn-act danger" title="删除情境" @click.stop="deleteScenario(s.code)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </span>
          </div>
          <div
            v-for="p in sortedMountedPrompts(s)"
            :key="`${s.code}_${p.id}`"
            class="tn tn-mounted"
            :class="{ interactive: !readonly, muted: !p.enabled }"
            :style="{ paddingLeft: '38px' }"
            @click="!readonly && openEditMountedPrompt(s.code, p)"
          >
            <span class="tn-tog"><span class="tn-leafdot"></span></span>
            <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>
            <span class="tn-label">{{ p.title || '挂载提示词' }}<span class="tn-sub">{{ p.enabled ? '挂载' : '停用' }}</span></span>
            <span v-if="!readonly" class="tn-actwrap">
              <button type="button" class="tn-act danger" title="删除挂载提示词" @click.stop="deleteMountedPrompt(s.code, p.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </span>
          </div>
        </template>
        <div v-if="!readonly" class="tn-add" :style="{ paddingLeft: '21px' }" @click="openNewScenario">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          新建情境skill
        </div>
      </template>
      <!-- 可调用工具 文件夹（渐进式工具注册表，只读查看 brief/manual） -->
      <div class="tn interactive" :style="{ paddingLeft: '6px' }" @click="toolGroupOpen = !toolGroupOpen">
        <span class="tn-tog">
          <svg class="tn-chev" :class="{ open: toolGroupOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
        </span>
        <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        <span class="tn-label">可调用工具<span class="tn-sub">{{ config.tools.length }}</span></span>
      </div>
      <template v-if="toolGroupOpen">
        <div
          v-for="t in config.tools"
          :key="`tooltn_${t.name}`"
          class="tn"
          :class="{ interactive: !readonly }"
          :style="{ paddingLeft: '21px' }"
          @click="!readonly && openViewTool(t)"
        >
          <span class="tn-tog"><span class="tn-leafdot"></span></span>
          <svg class="tn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
          <span class="tn-label mono">{{ t.name }}<span class="tn-sub">{{ t.kind === 'meta' ? '元工具' : '执行工具' }}</span></span>
          <span v-if="usedToolNames && t.kind === 'plan' && usedToolNames.has(t.name)" class="tn-read" title="本轮已调用"></span>
        </div>
        <div v-if="!config.tools.length" class="tn-empty" :style="{ paddingLeft: '21px' }">未注册工具</div>
      </template>
    </div>

    <!-- 全局编排配置编辑弹窗（提示词树新建 / 编辑 / 删除）；仅可编辑模式渲染 -->
    <AppModalShell
      v-if="!readonly"
      :open="editor.open && !isScenarioEditor"
      size="sm"
      :title="EDITOR_TITLES[editor.mode]"
      :subtitle="editor.mode === 'langhuan' ? 'Agent 根宪法 · 只读' : editor.mode === 'tool' ? '渐进式工具注册表 · 只读' : '全局编排配置 · 影响未来所有回复'"
      @close="closeEditor"
    >
      <template #title-icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
      </template>

      <!-- 弹窗被 AppModalShell teleport 到 body，需就地携带 --lh-* 别名块，否则 .oc-* 变量级联断裂 -->
      <div class="opt-modal-fields">
      <template v-if="editor.mode === 'system'">
        <label class="oc-label">编排器总提示词</label>
        <textarea v-model="editor.systemPrompt" class="oc-textarea oc-textarea--tall" spellcheck="false"></textarea>
        <div class="oc-hint">情境清单会自动附在总提示词之后，无需在此手写各情境枚举。</div>
      </template>

      <template v-else-if="editor.mode === 'langhuan'">
        <div class="oc-readonly-note">LANGHUAN.md 是所有运行时 Agent 的根宪法：它只放阶段边界、真值、工具失败和审计可见性等底层约束。它不属于编排配置，因此此处只读；情境规则和融合规则仍由各阶段提示词按需读取。</div>
      </template>

      <template v-else-if="editor.mode === 'tool'">
        <div class="oc-readonly-note">渐进式工具注册表为只读展示：<b>brief</b> 注入编排器工具清单，<b>manual</b> 由编排器调 getToolManual 按需取回。当前不在此编辑。</div>
        <div class="oc-field"><label class="oc-label">工具名</label><div class="oc-readonly mono">{{ editor.toolName }}<span class="tl-kind" :class="{ meta: editor.toolKind === 'meta' }">{{ editor.toolKind === 'meta' ? '元工具' : '执行工具' }}</span></div></div>
        <div class="oc-field"><label class="oc-label">brief（简介）</label><div class="oc-readonly oc-readonly--wrap">{{ editor.toolBrief || '—' }}</div></div>
        <div class="oc-field"><label class="oc-label">manual（精确格式 + 示例）</label><pre class="oc-pre">{{ editor.toolManual || '—' }}</pre></div>
      </template>

      <template v-else-if="editor.mode === 'mountedPrompt' || editor.mode === 'newMountedPrompt'">
        <div class="oc-field">
          <label class="oc-label">归属情境</label>
          <div class="oc-readonly mono">{{ editor.scenarioCode }}</div>
        </div>
        <div class="oc-field">
          <label class="oc-label">标题</label>
          <input v-model="editor.mountedPromptTitle" class="oc-input" placeholder="如 喜悦文风示例" />
        </div>
        <div class="oc-field">
          <label class="oc-label">描述（给提调看）</label>
          <textarea v-model="editor.mountedPromptDescription" class="oc-textarea" spellcheck="false" placeholder="一句话说明这段挂载提示词是干什么的；提调读取该情境后先看描述判断要不要用，必要时再读原文。"></textarea>
        </div>
        <div class="oc-field">
          <label class="oc-label">启用状态</label>
          <select v-model="editor.mountedPromptEnabledText" class="oc-input">
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </div>
        <div class="oc-field">
          <label class="oc-label">挂载提示词原文</label>
          <textarea v-model="editor.mountedPromptContent" class="oc-textarea oc-textarea--tall" spellcheck="false" placeholder="这里写的原文会在该情境命中时直接注入最终角色消息提示词。"></textarea>
        </div>
      </template>

      <div v-if="editor.error" class="oc-err">{{ editor.error }}</div>
      </div>

      <template #actions>
        <template v-if="editor.mode === 'langhuan' || editor.mode === 'tool'">
          <button type="button" class="btn btn-primary" @click="closeEditor">关闭</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="closeEditor">取消</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="submitEditor">
            {{ saving ? '保存中…' : (editor.mode === 'newScenario' || editor.mode === 'newMountedPrompt' ? '新建' : '保存') }}
          </button>
        </template>
      </template>
    </AppModalShell>

    <!-- 情境skill 编辑 / 新建：设计稿大号两栏弹窗（代号弱化、名字可编辑、正文为主）；仅可编辑模式渲染 -->
    <Teleport v-if="!readonly" to="body">
      <div
        v-if="editor.open && isScenarioEditor"
        class="skill-overlay"
        @pointerdown.capture="scenarioOverlayGuard.handleOverlayPointerDown"
        @click.self="onScenarioOverlayClick"
      >
        <div class="skill-modal" role="dialog" aria-modal="true" :aria-label="EDITOR_TITLES[editor.mode]">
          <div class="skill-head">
            <span class="skill-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="12" r="2.4" />
                <path d="M8.3 7.4 15.7 11M8.3 16.6 15.7 13" />
              </svg>
            </span>
            <div class="skill-titles">
              <div class="skill-title">{{ EDITOR_TITLES[editor.mode] }}</div>
              <div class="skill-sub">全局编排配置 · 影响未来所有回复</div>
            </div>
            <button type="button" class="skill-x" aria-label="关闭" @click="closeEditor">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" /></svg>
            </button>
          </div>

          <div class="skill-body">
            <!-- 左栏：代号（弱化）/ 名字（可编辑）/ 触发说明 -->
            <div class="skill-meta scrollbar-thin">
              <div class="field-block">
                <template v-if="editor.mode === 'scenario'">
                  <div class="code-line">
                    <span class="clbl">情境代号</span>
                    <span class="code-val">{{ editor.code }}</span>
                  </div>
                </template>
                <template v-else>
                  <div class="skill-fl"><span class="lbl">情境代号</span><span class="hint">小写字母开头</span></div>
                  <input v-model="editor.code" class="skill-input mono" placeholder="如 calm / anger" />
                </template>

                <div class="skill-fl fl-gap">
                  <span class="lbl">情境名字</span><span class="hint">可编辑</span>
                </div>
                <input v-model="editor.label" class="skill-input" placeholder="如 平静" />
              </div>

              <div class="field-block">
                <div class="skill-fl"><span class="lbl">情境触发说明</span><span class="hint">短，路由用</span></div>
                <textarea v-model="editor.trigger" class="skill-ta trigger" spellcheck="false" placeholder="该情境的触发条件（短），注入编排器「可用情境清单」帮助判别本轮情境。"></textarea>
              </div>
            </div>

            <!-- 右栏：情境正文为主，纵向铺满 -->
            <div class="skill-main">
              <div class="field-block grow">
                <div class="skill-fl">
                  <span class="lbl">情境正文</span>
                  <span class="hint">自然语言，按需读取</span>
                  <span class="count">共 {{ scenarioBodyCount }} 字</span>
                </div>
                <textarea v-model="editor.body" class="skill-ta body scrollbar-thin" spellcheck="false" placeholder="该情境的反应类别、强度档位与生成要求（自然语言）。编排器判定情境后调 readScenarioSkill 读取正文，据此发起计划工具。"></textarea>
              </div>
            </div>
          </div>

          <div v-if="editor.error" class="skill-err">{{ editor.error }}</div>

          <div class="skill-foot">
            <button type="button" class="mbtn mbtn-secondary" :disabled="saving" @click="closeEditor">取消</button>
            <button type="button" class="mbtn mbtn-primary" :disabled="saving" @click="submitEditor">
              {{ saving ? '保存中…' : (editor.mode === 'newScenario' ? '新建' : '保存') }}
            </button>
          </div>

          <div class="skill-toast" :class="{ show: scenarioToast }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            已保存 · 将影响未来所有回复
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG,
  type ReplyPlanOrchestratorConfig,
  type ReplyPlanScenarioConfig,
  type ReplyPlanScenarioMountedPrompt
} from '../../app/personalityPlanOrchestrator'
import { fetchOrchestratorConfig, saveOrchestratorConfig } from '../../repositories/orchestratorConfigRepository'
import AppModalShell from './AppModalShell.vue'
import { createOverlayDismissGuard } from '../../utils/overlayDismissGuard'

const props = withDefaults(defineProps<{
  /** 只读：树只保留查看，去掉所有编辑入口与弹窗（聊天编排审计侧栏用）。 */
  readonly?: boolean
  /** 聊天专属视图标记：本轮命中的情境 code，命中情境节点显示「本轮已读取」圆点。 */
  activeScenarioCode?: string
  /** 聊天专属视图标记：本轮已调用的 plan 工具名集合，命中工具节点显示「本轮已调用」圆点。 */
  usedToolNames?: Set<string> | null
}>(), {
  readonly: false,
  activeScenarioCode: '',
  usedToolNames: null
})

const emit = defineEmits<{
  /** 保存成功后抛出最新本地配置。 */
  (e: 'saved', config: ReplyPlanOrchestratorConfig): void
  /** 初始加载完成后抛出当前配置（父层可同步自用副本）。 */
  (e: 'loaded', config: ReplyPlanOrchestratorConfig): void
}>()

const config = ref<ReplyPlanOrchestratorConfig | null>(null)
const loading = ref(true)
const saving = ref(false)
const saveError = ref('')
const configNotice = ref('')
let configNoticeTimer: ReturnType<typeof setTimeout> | null = null

// 文件夹展开态（视图真值，本地）
const promptGroupOpen = ref(true)
const toolGroupOpen = ref(false)

type EditorMode = 'system' | 'scenario' | 'newScenario' | 'mountedPrompt' | 'newMountedPrompt' | 'langhuan' | 'tool'
const editor = reactive({
  open: false,
  mode: 'system' as EditorMode,
  scenarioCode: '',
  systemPrompt: '',
  code: '',
  label: '',
  trigger: '',
  body: '',
  mountedPromptId: '',
  mountedPromptTitle: '',
  mountedPromptContent: '',
  mountedPromptDescription: '',
  mountedPromptEnabledText: 'enabled',
  toolName: '',
  toolKind: '' as '' | 'plan' | 'meta',
  toolBrief: '',
  toolManual: '',
  error: ''
})

const isScenarioEditor = computed(() => editor.mode === 'scenario' || editor.mode === 'newScenario')
const scenarioBodyCount = computed(() => editor.body.replace(/\s/g, '').length)

const scenarioToast = ref(false)
let scenarioToastTimer: ReturnType<typeof setTimeout> | null = null
function showScenarioToast() {
  scenarioToast.value = true
  if (scenarioToastTimer) clearTimeout(scenarioToastTimer)
  scenarioToastTimer = setTimeout(() => { scenarioToast.value = false }, 1900)
}

function showConfigNotice(message = '已保存') {
  configNotice.value = message
  if (configNoticeTimer) clearTimeout(configNoticeTimer)
  configNoticeTimer = setTimeout(() => {
    configNotice.value = ''
    configNoticeTimer = null
  }, 2200)
}

// 遮罩按下→抬起都落在遮罩本身才算关闭，避免在文本框内拖选误关
const scenarioOverlayGuard = createOverlayDismissGuard()
function onScenarioOverlayClick(event: MouseEvent) {
  if (scenarioOverlayGuard.shouldDismissFromOverlayClick(event)) closeEditor()
}

function onScenarioContextMenu(event: MouseEvent, code: string) {
  if (props.readonly) return
  event.preventDefault()
  openNewMountedPrompt(code)
}

const EDITOR_TITLES: Record<EditorMode, string> = {
  system: '编辑回复编排器总提示词',
  scenario: '编辑情境skill',
  newScenario: '新建情境skill',
  mountedPrompt: '编辑挂载提示词',
  newMountedPrompt: '新建挂载提示词',
  langhuan: 'LANGHUAN.md',
  tool: '可调用工具'
}

function createMountedPromptId(): string {
  return `mounted_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function sortedMountedPrompts(scenario: Pick<ReplyPlanScenarioConfig, 'mountedPrompts'> | null | undefined): ReplyPlanScenarioMountedPrompt[] {
  const prompts = Array.isArray(scenario?.mountedPrompts) ? scenario.mountedPrompts : []
  return [...prompts]
    .map((prompt, index) => ({
      id: String(prompt.id || '').trim() || createMountedPromptId(),
      title: String(prompt.title || '').trim(),
      content: String(prompt.content || '').trim(),
      description: String(prompt.description || '').trim(),
      enabled: prompt.enabled !== false,
      orderIndex: Number.isFinite(Number(prompt.orderIndex)) ? Number(prompt.orderIndex) : 2.1 + index / 100,
      createdAt: String(prompt.createdAt || ''),
      updatedAt: String(prompt.updatedAt || '')
    }))
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
      return left.title.localeCompare(right.title, 'zh-CN')
    })
}

function cloneOrchestratorConfig(source: ReplyPlanOrchestratorConfig): ReplyPlanOrchestratorConfig {
  return {
    systemPrompt: source.systemPrompt,
    scenarios: (source.scenarios || []).map((scenario) => ({
      code: scenario.code,
      label: scenario.label,
      trigger: scenario.trigger,
      body: scenario.body,
      mountedPrompts: sortedMountedPrompts(scenario).map((prompt) => ({ ...prompt }))
    })),
    tools: (source.tools || []).map((tool) => ({
      name: tool.name,
      kind: tool.kind,
      brief: tool.brief,
      manual: tool.manual
    }))
  }
}

function openLanghuan() {
  editor.mode = 'langhuan'
  editor.error = ''
  editor.open = true
}

function openEditSystem() {
  const current = config.value
  if (!current) return
  editor.mode = 'system'
  editor.systemPrompt = current.systemPrompt
  editor.error = ''
  editor.open = true
}

function openEditScenario(scenario: { code: string; label: string; trigger: string; body: string }) {
  editor.mode = 'scenario'
  editor.scenarioCode = scenario.code
  editor.code = scenario.code
  editor.label = scenario.label
  editor.trigger = scenario.trigger
  editor.body = scenario.body
  editor.error = ''
  editor.open = true
}

function openNewScenario() {
  editor.mode = 'newScenario'
  editor.code = ''
  editor.label = ''
  editor.trigger = ''
  editor.body = ''
  editor.error = ''
  editor.open = true
}

function openNewMountedPrompt(scenarioCode: string) {
  const code = String(scenarioCode || '').trim()
  if (!code) return
  editor.mode = 'newMountedPrompt'
  editor.scenarioCode = code
  editor.mountedPromptId = ''
  editor.mountedPromptTitle = ''
  editor.mountedPromptContent = ''
  editor.mountedPromptDescription = ''
  editor.mountedPromptEnabledText = 'enabled'
  editor.error = ''
  editor.open = true
}

function openEditMountedPrompt(scenarioCode: string, prompt: ReplyPlanScenarioMountedPrompt) {
  editor.mode = 'mountedPrompt'
  editor.scenarioCode = String(scenarioCode || '').trim()
  editor.mountedPromptId = String(prompt.id || '').trim()
  editor.mountedPromptTitle = String(prompt.title || '').trim()
  editor.mountedPromptContent = String(prompt.content || '').trim()
  editor.mountedPromptDescription = String(prompt.description || '').trim()
  editor.mountedPromptEnabledText = prompt.enabled === false ? 'disabled' : 'enabled'
  editor.error = ''
  editor.open = true
}

function openViewTool(tool: { name: string; kind: 'plan' | 'meta'; brief: string; manual: string }) {
  editor.mode = 'tool'
  editor.toolName = tool.name
  editor.toolKind = tool.kind
  editor.toolBrief = tool.brief
  editor.toolManual = tool.manual
  editor.error = ''
  editor.open = true
}

function closeEditor() {
  editor.open = false
  scenarioToast.value = false
  if (scenarioToastTimer) { clearTimeout(scenarioToastTimer); scenarioToastTimer = null }
}

async function persistConfig(next: ReplyPlanOrchestratorConfig, onSuccess?: () => void) {
  saving.value = true
  saveError.value = ''
  configNotice.value = ''
  try {
    const saved = await saveOrchestratorConfig(next)
    const effective = cloneOrchestratorConfig(saved || next)
    config.value = effective
    emit('saved', effective)
    onSuccess?.()
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存编排配置失败'
    editor.error = saveError.value
  } finally {
    saving.value = false
  }
}

async function deleteMountedPrompt(scenarioCode: string, promptId: string) {
  const current = config.value
  if (!current) return
  const next = cloneOrchestratorConfig(current)
  const scenario = next.scenarios.find((item) => item.code === scenarioCode)
  if (!scenario) return
  scenario.mountedPrompts = sortedMountedPrompts(scenario).filter((prompt) => prompt.id !== promptId)
  await persistConfig(next, () => { showConfigNotice('挂载提示词已删除') })
}

async function deleteScenario(code: string) {
  const current = config.value
  if (!current) return
  if (!window.confirm(`确认删除情境「${code}」？这会影响未来所有回复的编排。`)) return
  const next = cloneOrchestratorConfig(current)
  next.scenarios = next.scenarios.filter((scenario) => scenario.code !== code)
  if (!next.systemPrompt.trim() && next.scenarios.length === 0) {
    saveError.value = '至少保留总提示词或一个情境，不能全部删除'
    return
  }
  await persistConfig(next)
}

async function submitEditor() {
  const current = config.value
  if (!current) return
  const next = cloneOrchestratorConfig(current)
  editor.error = ''
  const codeReg = /^[a-z][a-z0-9_]*$/

  if (editor.mode === 'system') {
    if (!editor.systemPrompt.trim()) { editor.error = '总提示词不能为空'; return }
    next.systemPrompt = editor.systemPrompt.trim()
    await persistConfig(next, () => { editor.open = false })
    return
  } else if (editor.mode === 'scenario') {
    const scenario = next.scenarios.find((item) => item.code === editor.scenarioCode)
    if (!scenario) { editor.error = '情境不存在'; return }
    if (!editor.label.trim()) { editor.error = '情境名称不能为空'; return }
    scenario.label = editor.label.trim()
    scenario.trigger = editor.trigger.trim()
    scenario.body = editor.body.trim()
    await persistConfig(next, () => { showScenarioToast() })
    return
  } else if (editor.mode === 'newScenario') {
    const code = editor.code.trim().toLowerCase()
    if (!codeReg.test(code)) { editor.error = '情境代号需小写字母开头，仅含小写字母 / 数字 / 下划线'; return }
    if (next.scenarios.some((item) => item.code === code)) { editor.error = '情境代号已存在'; return }
    if (!editor.label.trim()) { editor.error = '情境名称不能为空'; return }
    next.scenarios.push({ code, label: editor.label.trim(), trigger: editor.trigger.trim(), body: editor.body.trim(), mountedPrompts: [] })
    promptGroupOpen.value = true
    await persistConfig(next, () => {
      editor.mode = 'scenario'
      editor.scenarioCode = code
      editor.code = code
      showScenarioToast()
    })
    return
  } else if (editor.mode === 'mountedPrompt' || editor.mode === 'newMountedPrompt') {
    const scenario = next.scenarios.find((item) => item.code === editor.scenarioCode)
    if (!scenario) { editor.error = '情境不存在'; return }
    if (!editor.mountedPromptTitle.trim()) { editor.error = '标题不能为空'; return }
    if (!editor.mountedPromptContent.trim()) { editor.error = '挂载提示词正文不能为空'; return }
    const now = new Date().toISOString()
    const currentPrompts = sortedMountedPrompts(scenario)
    if (editor.mode === 'mountedPrompt') {
      const target = currentPrompts.find((item) => item.id === editor.mountedPromptId)
      if (!target) { editor.error = '挂载提示词不存在'; return }
      target.title = editor.mountedPromptTitle.trim()
      target.content = editor.mountedPromptContent.trim()
      target.description = editor.mountedPromptDescription.trim()
      target.enabled = editor.mountedPromptEnabledText === 'enabled'
      target.updatedAt = now
    } else {
      const maxOrder = currentPrompts.reduce((max, prompt) => Math.max(max, Number(prompt.orderIndex) || 0), 2)
      currentPrompts.push({
        id: createMountedPromptId(),
        title: editor.mountedPromptTitle.trim(),
        content: editor.mountedPromptContent.trim(),
        description: editor.mountedPromptDescription.trim(),
        enabled: editor.mountedPromptEnabledText === 'enabled',
        orderIndex: maxOrder + 0.01,
        createdAt: now,
        updatedAt: now
      })
    }
    scenario.mountedPrompts = currentPrompts
    await persistConfig(next, () => {
      editor.open = false
      showConfigNotice('挂载提示词已保存')
    })
    return
  }
}

async function load() {
  loading.value = true
  try {
    const loaded = await fetchOrchestratorConfig()
    config.value = cloneOrchestratorConfig(loaded || DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG)
  } catch {
    config.value = cloneOrchestratorConfig(DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG)
  } finally {
    loading.value = false
    if (config.value) emit('loaded', config.value)
  }
}

onMounted(load)

// 父层需要时可手动重载（如后台在别处改了配置）
defineExpose({ reload: load })
</script>

<style scoped>
/* --lh-* 别名块：组件自带，使其脱离诊断面板根节点也能正常显色。
   树渲染在 .opt-root 内；通用编辑弹窗被 teleport 到 body，故 .opt-modal-fields 同样就地定义。 */
.opt-root,
.opt-modal-fields {
  --lh-card: var(--morandi-card);
  --lh-surface: var(--morandi-surface);
  --lh-soft-bg: var(--morandi-soft-bg);
  --lh-soft-bg-strong: var(--morandi-soft-bg-strong);
  --lh-hover: var(--morandi-hover);
  --lh-accent: var(--morandi-accent);
  --lh-primary: var(--morandi-primary);
  --lh-danger: var(--morandi-danger);
  --lh-secondary: #b5a99a;
  --lh-text: var(--morandi-text);
  --lh-text-light: var(--morandi-text-light);
  --lh-text-muted: #8d8d8d;
  --lh-text-faint: #b6b0a7;
  --lh-border: var(--morandi-border);
  --lh-border-line: var(--morandi-border);
  --lh-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --lh-radius-md: 8px;
  --lh-dur-fast: 0.15s;
  --lh-dur: 0.18s;
  --lh-ease: ease;
}
.opt-root { width: 100%; }
.ptree { font-size: 0.8rem; user-select: none; }
.tn { display: flex; align-items: center; gap: 6px; height: 28px; border-radius: 6px; position: relative; color: var(--lh-text-light); padding: 0 5px 0 6px; }
.tn.interactive { cursor: pointer; }
.tn.interactive:hover { background: var(--lh-hover); }
.tn.muted { opacity: 0.58; }
.tn-mounted { height: 24px; font-size: 0.76rem; }
.tn-mounted::before { content: ''; position: absolute; left: 28px; top: -4px; bottom: -4px; width: 1px; background: color-mix(in srgb, var(--lh-border-line) 76%, transparent); }
.tn-mounted .tn-ic { width: 12px; height: 12px; color: var(--lh-secondary); }
.tn-tog { width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tn-leafdot { width: 3px; height: 3px; border-radius: 50%; background: var(--lh-text-faint); }
.tn-ic { width: 13px; height: 13px; color: var(--lh-text-muted); flex-shrink: 0; }
.tn-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tn-sub { color: var(--lh-text-muted); margin-left: 6px; font-size: 0.72rem; font-weight: 400; }
.tn-read { width: 5px; height: 5px; border-radius: 50%; background: var(--lh-accent); flex-shrink: 0; margin-left: 4px; }
.tn-chev { width: 12px; height: 12px; color: var(--lh-text-faint); transition: transform var(--lh-dur-fast); cursor: pointer; }
.tn-chev.open { transform: rotate(90deg); }
.tn-actwrap { margin-left: auto; display: flex; gap: 1px; flex-shrink: 0; }
.tn-act { width: 22px; height: 22px; border: none; background: none; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: var(--lh-text-faint); cursor: pointer; opacity: 0; transition: opacity var(--lh-dur-fast), background var(--lh-dur-fast), color var(--lh-dur-fast); }
.tn:hover .tn-act { opacity: 1; }
.tn-act svg { width: 13px; height: 13px; }
.tn-act:hover { background: rgba(139, 115, 85, 0.12); color: var(--lh-text-light); }
.tn-act.danger:hover { color: var(--lh-danger); }
.tn-add { display: flex; align-items: center; gap: 6px; height: 26px; font-size: 0.74rem; color: var(--lh-text-muted); cursor: pointer; border-radius: 6px; }
.tn-add svg { width: 12px; height: 12px; }
.tn-add:hover { background: var(--lh-hover); color: var(--lh-accent); }
.tn-empty { display: flex; align-items: center; height: 24px; font-size: 0.72rem; color: var(--lh-text-faint); }

.oc-error { padding: 8px 10px; margin-bottom: 10px; border: 1px solid rgba(192, 102, 90, 0.32); background: rgba(192, 102, 90, 0.06); border-radius: var(--lh-radius-md); font-size: 0.72rem; color: var(--lh-danger); }
.oc-notice { padding: 7px 10px; margin-bottom: 10px; border: 1px solid rgba(143, 170, 152, 0.34); background: rgba(143, 170, 152, 0.08); border-radius: var(--lh-radius-md); font-size: 0.72rem; color: #556b59; }
.oc-field { margin-bottom: 12px; }
.oc-field:last-child { margin-bottom: 0; }
.oc-label { display: block; font-size: 0.78rem; font-weight: 500; color: var(--lh-text); margin-bottom: 5px; }
.oc-input { width: 100%; box-sizing: border-box; border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); padding: 8px 11px; font: inherit; font-size: 0.82rem; color: var(--lh-text); background: var(--lh-card); }
.oc-input:focus { outline: none; border-color: var(--lh-accent); }
.oc-textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); padding: 9px 11px; font-family: var(--lh-font-mono); font-size: 0.78rem; line-height: 1.6; color: var(--lh-text); background: var(--lh-card); min-height: 110px; resize: vertical; white-space: pre-wrap; }
.oc-textarea--tall { min-height: 220px; }
.oc-textarea:focus { outline: none; border-color: var(--lh-accent); }
.oc-readonly { font-family: var(--lh-font-mono); font-size: 0.78rem; color: var(--lh-text-light); padding: 7px 11px; background: var(--lh-soft-bg-strong); border-radius: var(--lh-radius-md); display: flex; align-items: center; gap: 8px; }
.oc-readonly--wrap { display: block; font-family: inherit; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.oc-pre { margin: 0; font-family: var(--lh-font-mono); font-size: 0.75rem; line-height: 1.6; color: var(--lh-text); padding: 9px 11px; background: var(--lh-soft-bg-strong); border-radius: var(--lh-radius-md); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
.oc-hint { font-size: 0.68rem; color: var(--lh-text-muted); margin-top: 4px; line-height: 1.5; }
.oc-err { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(192, 102, 90, 0.32); background: rgba(192, 102, 90, 0.06); border-radius: var(--lh-radius-md); font-size: 0.74rem; color: var(--lh-danger); }
.oc-readonly-note { font-size: 0.8rem; line-height: 1.7; color: var(--lh-text-light); padding: 12px 14px; background: var(--lh-soft-bg-strong); border-radius: var(--lh-radius-md); }
.oc-readonly-note b { color: var(--lh-text); }
.tl-kind { margin-left: 8px; font-size: 0.66rem; padding: 1px 6px; border-radius: 4px; background: var(--lh-soft-bg-strong); color: var(--lh-text-muted); }
.tl-kind.meta { color: var(--lh-accent); }
.cp-empty { font-size: 0.78rem; color: var(--lh-text-muted); padding: 8px 2px; line-height: 1.55; }

/* ============================================================
   情境skill 编辑弹窗（设计稿大号两栏 · 高保真）
   弹窗 Teleport 到 body，--lh-* 别名必须就地定义在弹窗根节点上。
   ============================================================ */
.skill-overlay {
  --lh-modal-bg: #f3f2ef;
  --lh-accent: #5c8a5c;
  --lh-teal: #525e43;
  --lh-text: #333333;
  --lh-text-light: #666666;
  --lh-text-muted: #999999;
  --lh-text-faint: #b6b0a7;
  --lh-border: #e0e0e0;
  --lh-border-line: #e5e5e5;
  --lh-danger: #c0665a;
  --lh-input-bg: #fff;
  --lh-secondary-bg: #efe5d8;
  --lh-secondary-border: #b69f86;
  --lh-secondary-text: #4f4034;
  --lh-secondary-hover: #e4d6c4;
  --lh-radius-md: 8px;
  --lh-radius-modal: 22px;
  --lh-shadow-modal: 0 22px 56px rgba(72, 58, 47, 0.12);
  --lh-shadow-toast: 0 16px 34px rgba(42, 47, 40, 0.24);
  --lh-font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --lh-font-cjk: "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", -apple-system, sans-serif;
  --lh-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --lh-dur: 0.18s;
  --lh-dur-fast: 0.15s;
  --lh-ease: ease;

  position: fixed;
  inset: 0;
  z-index: 13000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(72, 68, 63, 0.18);
  backdrop-filter: blur(6px);
}

/* 本弹窗设计稿走独立局部变量（不接全局 morandi token），夜间在此整体改写别名值即可级联生效。 */
:global([data-theme="dark"] .skill-overlay){
  --lh-modal-bg: var(--morandi-card);
  --lh-text: var(--morandi-text);
  --lh-text-light: var(--morandi-text-light);
  --lh-text-muted: var(--morandi-text-light);
  --lh-text-faint: var(--morandi-text-light);
  --lh-border: var(--morandi-border);
  --lh-border-line: var(--morandi-border);
  --lh-input-bg: var(--langhuan-dialog-input-bg);
  --lh-secondary-bg: var(--morandi-soft-bg-strong);
  --lh-secondary-border: var(--morandi-border);
  --lh-secondary-text: var(--morandi-text);
  --lh-secondary-hover: var(--morandi-hover);
}

.skill-modal {
  width: min(1000px, 94%);
  height: min(700px, 90%);
  background: var(--lh-modal-bg);
  border: 1px solid var(--lh-border-line);
  border-radius: var(--lh-radius-modal);
  box-shadow: var(--lh-shadow-modal);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  color: var(--lh-text);
  font-family: var(--lh-font-ui);
  animation: skill-modal-in var(--lh-dur) var(--lh-ease);
}
@keyframes skill-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: none; }
}

.skill-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--lh-border-line);
}
.skill-brand { width: 30px; height: 30px; flex: none; color: var(--lh-accent); transform: rotate(5deg); margin-top: 1px; }
.skill-brand svg { width: 100%; height: 100%; stroke-width: 1.7; }
.skill-titles { flex: 1; min-width: 0; }
.skill-title { font-size: 1.08rem; font-weight: 700; color: var(--lh-text); line-height: 1.4; }
.skill-sub { font-size: 0.85rem; color: var(--lh-text-light); margin-top: 5px; line-height: 1.5; }
.skill-x {
  margin-left: auto; width: 28px; height: 28px; flex: none;
  border: none; background: transparent; color: var(--lh-text-light);
  border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--lh-dur-fast);
}
.skill-x svg { width: 17px; height: 17px; stroke-width: 1.8; }
.skill-x:hover { background: rgba(130, 153, 135, 0.08); }

.skill-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 300px 1fr; }
.skill-meta {
  padding: 18px 22px; border-right: 1px solid var(--lh-border-line);
  display: flex; flex-direction: column; gap: 20px; overflow-y: auto;
}
.skill-main { padding: 16px 24px 8px; display: flex; flex-direction: column; min-height: 0; }

.skill-fl { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; }
.skill-fl.fl-gap { margin-top: 14px; }
.skill-fl .lbl { font-size: 0.9rem; font-weight: 500; color: var(--lh-text); }
.skill-fl .hint { font-size: 0.78rem; color: var(--lh-text-muted); }
.skill-fl .count { margin-left: auto; font-size: 0.75rem; color: var(--lh-text-faint); font-variant-numeric: tabular-nums; }

/* 情境代号 — 弱化为名字上方的一行小号灰字 */
.code-line { display: flex; flex-direction: column; gap: 3px; }
.code-line .clbl { font-size: 0.76rem; font-weight: 500; color: var(--lh-text-muted); }
.code-line .code-val { font-family: var(--lh-font-mono); font-size: 0.8rem; color: var(--lh-text-light); letter-spacing: 0.3px; }

.skill-input {
  width: 100%; box-sizing: border-box; padding: 10px 14px;
  border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md);
  background: var(--lh-input-bg); color: var(--lh-text);
  font-family: var(--lh-font-ui); font-size: 0.95rem; font-weight: 600;
  outline: none; transition: border-color var(--lh-dur-fast);
}
.skill-input.mono { font-family: var(--lh-font-mono); font-weight: 500; }
.skill-ta {
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md);
  background: var(--lh-input-bg); color: var(--lh-text);
  font-family: var(--lh-font-cjk); font-size: 0.9rem; line-height: 1.75;
  padding: 11px 14px; resize: none; outline: none;
  transition: border-color var(--lh-dur-fast);
}
.skill-input:focus, .skill-ta:focus { border-color: var(--lh-teal); }
.skill-ta.trigger { height: 118px; }
.skill-ta.body { flex: 1; min-height: 0; }

.field-block { display: flex; flex-direction: column; }
.field-block.grow { flex: 1; min-height: 0; }

.skill-err {
  margin: 0 24px; padding: 8px 10px;
  border: 1px solid rgba(192, 102, 90, 0.32); background: rgba(192, 102, 90, 0.06);
  border-radius: var(--lh-radius-md); font-size: 0.78rem; color: var(--lh-danger);
}

.skill-foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px; border-top: 1px solid var(--lh-border-line);
}
.skill-foot .mbtn {
  min-width: 96px; height: 38px; border-radius: 12px;
  font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: var(--lh-font-ui);
  transition: background var(--lh-dur-fast), border-color var(--lh-dur-fast);
}
.skill-foot .mbtn:disabled { opacity: 0.55; cursor: default; }
.mbtn-secondary { border: 1px solid var(--lh-secondary-border); background: var(--lh-secondary-bg); color: var(--lh-secondary-text); }
.mbtn-secondary:hover:not(:disabled) { background: var(--lh-secondary-hover); }
.mbtn-primary { border: 1px solid var(--lh-teal); background: var(--lh-teal); color: #fff; }
.mbtn-primary:hover:not(:disabled) { background: #44503a; border-color: #44503a; }

/* 保存反馈 toast */
.skill-toast {
  position: absolute; left: 50%; bottom: 26px;
  transform: translateX(-50%) translateY(10px);
  background: #2f342c; color: #f3efe9;
  padding: 10px 18px; border-radius: 8px;
  box-shadow: var(--lh-shadow-toast);
  font-size: 13px; display: flex; align-items: center; gap: 8px;
  opacity: 0; pointer-events: none;
  transition: opacity var(--lh-dur) var(--lh-ease), transform var(--lh-dur) var(--lh-ease);
  z-index: 5;
}
.skill-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.skill-toast svg { width: 15px; height: 15px; stroke-width: 2; color: var(--lh-accent); }

.skill-modal .scrollbar-thin::-webkit-scrollbar { width: 6px; }
.skill-modal .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--lh-border-line); border-radius: 3px; }
.skill-modal .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }

@media (max-width: 720px) {
  .skill-modal { width: 94%; height: 88%; }
  .skill-body { grid-template-columns: 1fr; }
}
</style>
