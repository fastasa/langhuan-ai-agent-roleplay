<template>
  <AppFormDialog
    :open="state.showAddCharacter.value && !newCharacterManualDialogOpen"
    title="新建角色"
    subtitle="先选择创建方式"
    size="lg"
    :z-index="13055"
    body-compact
    @cancel="closeNewCharacterFlow"
  >
    <div class="new-character-flow">
      <AppStepper
        v-model="newCharacterStep"
        :steps="newCharacterStepperSteps"
        hide-footer
        disable-step-indicators
      >
        <template #mode>
          <div class="new-character-choice-grid">
            <button
              type="button"
              class="new-character-choice"
              :class="{ active: newCharacterMode === 'ai' }"
              @click="selectNewCharacterMode('ai')"
            >
              <span>AI 生成角色</span>
              <small>先写一句角色方向，再复制提示词给外部 AI。</small>
            </button>
            <button
              type="button"
              class="new-character-choice"
              :class="{ active: newCharacterMode === 'manual' }"
              @click="selectNewCharacterMode('manual')"
            >
              <span>手动填写</span>
              <small>进入角色填写表单。</small>
            </button>
          </div>
        </template>

        <template #brief>
          <label class="new-character-field">
            <span>简要角色描述</span>
            <textarea
              v-model="newCharacterBrief"
              rows="7"
              maxlength="1200"
              placeholder="例如：来自雨城旧档案馆的年轻修复师，记忆力异常好，表面温和，实际很难信任别人。"
            ></textarea>
          </label>
          <div class="new-character-field-count">{{ newCharacterBrief.length }}/1200</div>
        </template>

        <template #generate>
          <div class="new-character-generate-panel">
            <button
              type="button"
              class="new-character-generate-action"
              :disabled="!canRunNewCharacterAgent"
              @click="generateNewCharacterWithAgent"
            >
              <span>{{ newCharacterGenerating ? '生成中...' : '琅嬛 agent 生成' }}</span>
              <small>{{ newCharacterGenerating ? '正在调用高量模型' : '调用高量模型并直接创建正式角色' }}</small>
            </button>
            <button
              type="button"
              class="new-character-generate-action new-character-generate-action--primary"
              :class="{ 'new-character-generate-action--copied': newCharacterPromptCopied }"
              :disabled="!canCopyNewCharacterPrompt"
              @click="copyNewCharacterPrompt"
            >
              <span>{{ newCharacterPromptCopied ? '已复制' : '复制提示词' }}</span>
              <small>{{ newCharacterPromptCopied ? '复制成功，可以去导入外部 AI 返回的 Markdown。' : '复制后交给外部 AI 补全角色核心单位。' }}</small>
            </button>
          </div>
          <div
            v-if="newCharacterPromptCopied"
            class="new-character-copy-status"
            role="status"
            aria-live="polite"
          >
            提示词已复制，可以进入导入步骤
          </div>
        </template>

        <template #import>
          <div class="new-character-import-panel">
            <p>把外部 AI 返回的角色 Markdown 放进剪贴板，然后从这里导入并新建正式角色。</p>
            <button
              type="button"
              class="new-character-import-action"
              :disabled="newCharacterImporting"
              @click="importNewCharacterFromClipboard"
            >
              {{ newCharacterImporting ? '导入中...' : '从剪贴板导入并新建角色' }}
            </button>
          </div>
        </template>
      </AppStepper>
    </div>

    <template #actions>
      <button
        v-if="newCharacterStep > 1"
        type="button"
        class="new-character-flow-action new-character-flow-action--secondary"
        @click="goBackNewCharacterStep"
      >
        上一步
      </button>
      <span v-else aria-hidden="true"></span>
      <div class="new-character-flow-actions__right">
        <button
          v-if="newCharacterStep < 3"
          type="button"
          class="new-character-flow-action new-character-flow-action--secondary"
          @click="closeNewCharacterFlow"
        >
          取消
        </button>
        <button
          v-else-if="newCharacterStep === 3"
          type="button"
          class="new-character-flow-action new-character-flow-action--secondary"
          :disabled="!canCopyNewCharacterPrompt"
          @click="copyNewCharacterPrompt"
        >
          复制
        </button>
        <button v-else type="button" class="new-character-flow-action new-character-flow-action--secondary" @click="closeNewCharacterFlow">
          关闭
        </button>
        <button
          type="button"
          class="new-character-flow-action new-character-flow-action--primary"
          :disabled="newCharacterNextDisabled"
          @click="goNextNewCharacterStep"
        >
          {{ newCharacterPrimaryActionText }}
        </button>
      </div>
    </template>
  </AppFormDialog>

  <CharacterProfileDialog
    :open="state.showAddCharacter.value && newCharacterManualDialogOpen"
    title="新建角色"
    subtitle="优先填写必要信息，更多设定可逐步展开"
    size="xl"
    :z-index="13060"
    :form="state.newCharForm"
    avatar-field="avatar"
    :groups="state.viewModel.characterGroups"
    :api-presets="state.viewModel.apiPresets"
    :model-options="getModelOptions('new')"
    :model-loading="modelLoading.new"
    :custom-model-visible="shouldShowCustomModelInput('new')"
    :nicknames="state.newCharForm.nicknames || []"
    :nickname-input="newNicknameInput"
    nickname-key-prefix="new-nick"
    confirm-text="创建角色"
    @cancel="closeNewCharacterFlow"
    @confirm="confirmAddNewCharacter"
    @pick-avatar="openNewCharAvatarPicker"
    @clear-avatar="state.newCharForm.avatar = ''"
    @load-models="loadRolePresetModels('new')"
    @add-nickname="addNewNickname"
    @remove-nickname="removeNewNickname"
    @update:nickname-input="newNicknameInput = $event"
  >
    <template #actions-left>
      <button
        type="button"
        class="btn btn-secondary character-profile-footer-button new-character-manual-back-button"
        @click="returnToNewCharacterModeStep"
      >
        上一步
      </button>
    </template>
    <template #header-actions>
      <div class="character-profile-json-actions">
        <button type="button" class="character-profile-link-button" @click="openImportCharacterJson">导入角色 JSON</button>
        <button type="button" class="character-profile-link-button" @click="state.exportCharacterJsonTemplate()">导出 JSON 模板</button>
      </div>
    </template>
  </CharacterProfileDialog>

  <CharacterProfileDialog
    :open="Boolean(state.showCharacterEditor.value && safeCurrentCharacter)"
    :title="`编辑角色资料: ${safeCurrentCharacter?.name || ''}`"
    subtitle="基础资料与深度设定"
    size="xl"
    :z-index="13060"
    :form="state.charEditForm"
    avatar-field="avatar"
    :groups="state.viewModel.characterGroups"
    :api-presets="state.viewModel.apiPresets"
    :model-options="getModelOptions('edit')"
    :model-loading="modelLoading.edit"
    :custom-model-visible="shouldShowCustomModelInput('edit')"
    :nicknames="state.charEditForm.nicknames || []"
    :nickname-input="state.newNicknameInput.value"
    nickname-key-prefix="edit-nick"
    confirm-text="保存"
    :show-personality-model="true"
    :personality-model-path="editPersonalityModelPath"
    :personality-model-uploading="personalityModelUploading"
    :personality-model-uploadable="Boolean(editCharacterId)"
    :personality-model-version-count="personalityModelVersionCount"
    :personality-model-installed-summary="personalityModelInstalledSummary"
    @cancel="state.showCharacterEditor.value = false"
    @confirm="state.saveCharacterEdit()"
    @pick-avatar="openCharAvatarPicker"
    @clear-avatar="state.charEditForm.avatar = ''"
    @load-models="loadRolePresetModels('edit')"
    @add-nickname="state.addNickname()"
    @remove-nickname="state.removeNickname"
    @update:nickname-input="state.newNicknameInput.value = $event"
    @pick-personality-model="openPersonalityModelPicker"
    @delete-personality-model="deletePersonalityModel"
    @train-personality-model="openPersonalityWorkbench('train')"
    @optimize-personality-model="openPersonalityWorkbench('optimize')"
    @open-personality-model-versions="openPersonalityWorkbench('versions')"
  >
    <template #header-actions>
      <div class="character-profile-json-actions">
        <button type="button" class="character-profile-link-button" @click="exportCompleteCharacterJson">导出完整角色</button>
        <button type="button" class="character-profile-link-button" @click="state.exportCurrentCharacterJson()">兼容 JSON</button>
      </div>
    </template>
    <template #after-sections>
      <CharacterSnapshotSection
        :snapshots="characterSnapshots"
        :loading="characterSnapshotsLoading"
        :busy="characterSnapshotBusy"
        :session-labels="snapshotSessionLabels"
        :known-personality-model-version-ids="knownPersonalityModelVersionIds"
        @refresh="refreshCharacterSnapshots"
        @create="createManualSnapshot"
        @cleanup="openSnapshotCleanupConfirm"
        @delete="openSnapshotDeleteConfirm"
        @overwrite="openSnapshotOverwriteConfirm"
      />
    </template>
  </CharacterProfileDialog>

  <AppConfirmDialog
    :open="snapshotConfirmAction?.kind === 'delete'"
    title="删除角色快照"
    :message="`将永久删除「${snapshotConfirmAction?.snapshot?.label || '未命名快照'}」。此操作不会改变角色主线。`"
    confirm-text="删除"
    tone="danger"
    :z-index="13130"
    @cancel="snapshotConfirmAction = null"
    @confirm="confirmSnapshotDelete"
  />

  <AppConfirmDialog
    :open="snapshotConfirmAction?.kind === 'cleanup'"
    title="清理自动快照"
    message="只会删除未被活会话使用的旧自动保护快照；手工快照不会被清理。"
    confirm-text="开始清理"
    tone="warning"
    size="md"
    :z-index="13130"
    @cancel="snapshotConfirmAction = null"
    @confirm="confirmSnapshotCleanup"
  >
    <label class="snapshot-cleanup-field">
      <span>保留最近的自动快照</span>
      <input v-model.number="snapshotCleanupKeepCount" type="number" min="0" max="20" step="1">
      <em>范围 0–20；仍被会话使用的快照会保留并列入结果。</em>
    </label>
  </AppConfirmDialog>

  <AppConfirmDialog
    :open="snapshotConfirmAction?.kind === 'overwrite'"
    title="用快照覆盖角色主线"
    :message="`将把「${snapshotConfirmAction?.snapshot?.label || '未命名快照'}」复制到角色主真值。`"
    confirm-text="确认覆盖"
    tone="warning"
    size="md"
    :z-index="13130"
    @cancel="snapshotConfirmAction = null"
    @confirm="confirmSnapshotOverwrite"
  >
    <div class="snapshot-overwrite-warning">
      <p>覆盖前会自动保存当前主线；现有独立会话分支不会被移动或合并。</p>
      <p>关系认知来自不同时间点时可能错位，请在覆盖后复核角色关系。</p>
      <p v-if="snapshotConfirmAction?.snapshot && isSnapshotModelMissing(snapshotConfirmAction.snapshot)" class="is-danger">
        该快照绑定的人格模型版本已清理，覆盖后会清空失效指针并降级为普通召回。
      </p>
    </div>
  </AppConfirmDialog>

  <AppFormDialog
    :open="Boolean(snapshotOverwriteBlockers)"
    title="暂时不能覆盖主线"
    subtitle="角色仍有生成或投影写回在运行，服务端已阻断本次操作。"
    size="md"
    :z-index="13140"
    @cancel="snapshotOverwriteBlockers = null"
  >
    <div class="snapshot-blocker-list">
      <div v-for="item in snapshotBlockerItems" :key="item.key" class="snapshot-blocker-row">
        <strong>{{ item.title }}</strong>
        <span>{{ item.detail }}</span>
      </div>
    </div>
    <template #actions>
      <button type="button" class="btn btn-primary" @click="snapshotOverwriteBlockers = null">知道了</button>
    </template>
  </AppFormDialog>

  <input type="file" ref="newCharAvatarInputRef" @change="handleCharacterAvatarInput($event, 'new')" accept="image/*" style="display: none;">
  <input type="file" ref="importCharacterJsonInputRef" @change="state.importCharacterJson($event)" accept=".json,application/json" style="display: none;">
  <input type="file" ref="charAvatarInputRef" @change="handleCharacterAvatarInput($event, 'edit')" accept="image/*" style="display: none;">
  <input type="file" ref="personalityModelInputRef" @change="handlePersonalityModelUpload" accept=".zip,application/zip" style="display: none;">
  <PersonalityTrainingWorkbench
    :open="Boolean(personalityWorkbenchMode)"
    :character-id="editCharacterId"
    :character-name="String(state.charEditForm?.name || safeCurrentCharacter?.name || '')"
    :mode="personalityWorkbenchMode || 'train'"
    :refresh-token="personalityWorkbenchRefreshToken"
    :z-index="13120"
    @close="closePersonalityWorkbench"
    @toast="(message, type) => state.toast(message, type)"
    @model-path-changed="applyPersonalityModelPathToStore"
    @upload-model="openPersonalityModelPicker"
  />
  <PhotoCropDialog
    :open="photoCropOpen"
    :source="photoCropSource"
    :title="photoCropTarget === 'new' ? '裁剪角色头像' : '裁剪角色头像'"
    :z-index="13090"
    @cancel="closePhotoCrop"
    @confirm="applyPhotoCrop"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, unref, watch } from 'vue'
import { API } from '../../../../config/api'
import AppFormDialog from '../../../common/AppFormDialog.vue'
import AppConfirmDialog from '../../../common/AppConfirmDialog.vue'
import AppStepper, { type AppStepperStep } from '../../../common/AppStepper.vue'
import CharacterProfileDialog from './CharacterProfileDialog.vue'
import CharacterSnapshotSection from './CharacterSnapshotSection.vue'
import PersonalityTrainingWorkbench from './personalityTraining/PersonalityTrainingWorkbench.vue'
import PhotoCropDialog from '../../../common/PhotoCropDialog.vue'
import {
  PERSONALITY_TRAINING_BACKEND_LABELS,
  formatPercentMetric,
  formatVersionTime,
  personalityTrainingApi,
  type PersonalityModelVersion
} from '../../../../app/personalityTrainingWorkflow'
import type { createCharacterEditorModalState } from '../../../../composables/app/modalState/createCharacterEditorModalState'
import { readImageInputAsDataUrl } from '../../../../utils/photoFile'
import { parseCharacterCoreMarkdown } from '../../../../app/characterCoreMarkdownTransfer'
import {
  buildLanghuanAgentCharacterCorePrompt,
  runLanghuanAgentCharacterCore
} from '../../../../app/langhuanAgentAssist'
import {
  buildCharacterBrainSeedChanges,
  parseCharacterBrainSeedMarkdown,
  type CharacterBrainSeed
} from '../../../../app/characterBrainSeedFromGeneration'
import { registerXingyiFunctionProvider } from '../../../../app/xingyiFunctionBridge'
import { useCharacterStore } from '../../../../stores/characterStore'
import { useChatStore } from '../../../../stores/chatStore'
import { useSettingStore } from '../../../../stores/settingStore'
import { useAI } from '../../../../composables/useAI'
import { useWorkspaceRuntimeStore } from '../../../../app/workspaceRuntimeStore'
import { applyCharacterSnapshotState } from '../../../../../shared/characterSnapshotState'
import {
  cleanupCharacterSnapshotRecords,
  createManualCharacterSnapshotRecord,
  deleteCharacterSnapshotRecord,
  exportCompleteCharacterRecord,
  getCharacterSnapshotRecord,
  listCharacterSnapshotRecords,
  overwriteCharacterMainFromSnapshotRecord,
  type CharacterSnapshotMetadata,
  type CharacterSnapshotOverwriteBlockers
} from '../../../../repositories/characterRepository'

type CharacterEditorModalState = ReturnType<typeof createCharacterEditorModalState>
type ApiPresetOption = {
  name?: string
  availableModels?: unknown
  available_models?: unknown
  baseUrl?: string
  base_url?: string
  apiKey?: string
  api_key?: string
}

const props = defineProps<{ state: CharacterEditorModalState }>()
const { state } = props
const settingStore = useSettingStore()
const charStore = useCharacterStore()
const chatStore = useChatStore()
const runtimeStore = useWorkspaceRuntimeStore()
const { callAI } = useAI()
const newCharAvatarInputRef = ref<HTMLInputElement | null>(null)
const importCharacterJsonInputRef = ref<HTMLInputElement | null>(null)
const charAvatarInputRef = ref<HTMLInputElement | null>(null)
const personalityModelInputRef = ref<HTMLInputElement | null>(null)
const personalityModelUploading = ref(false)
// 编辑弹窗里展示用的当前人格模型路径：打开时从 store 角色同步，上传/删除后本地更新。
const editPersonalityModelPath = ref('')
// 人格模型版本台账（只读展示）：编辑弹窗打开时拉取，用于入口卡片的版本数与已安装摘要。
const personalityModelVersions = ref<PersonalityModelVersion[]>([])
const characterSnapshots = ref<CharacterSnapshotMetadata[]>([])
const characterSnapshotsLoading = ref(false)
const characterSnapshotBusy = ref(false)
const snapshotConfirmAction = ref<{ kind: 'delete' | 'cleanup' | 'overwrite'; snapshot?: CharacterSnapshotMetadata } | null>(null)
const snapshotCleanupKeepCount = ref(20)
const snapshotOverwriteBlockers = ref<CharacterSnapshotOverwriteBlockers | null>(null)
// 训练工作台：null 关闭；train/optimize/versions 决定初始步骤。
const personalityWorkbenchMode = ref<'train' | 'optimize' | 'versions' | null>(null)
// 上传/删除模型后自增，通知工作台刷新版本列表。
const personalityWorkbenchRefreshToken = ref(0)
const newNicknameInput = ref('')
const modelLoading = reactive({ new: false, edit: false })
const photoCropOpen = ref(false)
const photoCropSource = ref('')
const photoCropTarget = ref<'new' | 'edit'>('new')
const newCharacterStep = ref(1)
const newCharacterMode = ref<'ai' | 'manual' | ''>('')
const newCharacterBrief = ref('')
const newCharacterManualDialogOpen = ref(false)
const newCharacterPromptCopied = ref(false)
const newCharacterImporting = ref(false)
const newCharacterGenerating = ref(false)
const roleModelOptions = reactive<{ new: string[]; edit: string[] }>({
  new: [],
  edit: []
})
const newCharacterStepperSteps: AppStepperStep[] = [
  { key: 'mode', label: '方式' },
  { key: 'brief', label: '描述' },
  { key: 'generate', label: '生成' },
  { key: 'import', label: '导入' }
]

const canCopyNewCharacterPrompt = computed(() => Boolean(newCharacterBrief.value.trim()))
const canRunNewCharacterAgent = computed(() => Boolean(newCharacterBrief.value.trim()) && !newCharacterGenerating.value)
const newCharacterNextDisabled = computed(() => {
  if (newCharacterStep.value === 1) return !newCharacterMode.value
  if (newCharacterStep.value === 2) return !newCharacterBrief.value.trim()
  if (newCharacterStep.value === 3) return !newCharacterPromptCopied.value
  return false
})
const newCharacterPrimaryActionText = computed(() => {
  if (newCharacterStep.value === 3) return newCharacterPromptCopied.value ? '去导入' : '复制后继续'
  if (newCharacterStep.value === newCharacterStepperSteps.length) return '关闭'
  return '下一步'
})

const safeCurrentCharacter = computed(() => {
  const currentCharacterRef = state?.currentCharacter
  if (currentCharacterRef && typeof currentCharacterRef === 'object' && 'value' in currentCharacterRef) {
    return currentCharacterRef.value || null
  }
  const form = state?.charEditForm
  if (form && (form.id || form.name)) {
    return form
  }
  return null
})

// 人格模型按角色绑定，需要已存在的角色 ID；新建未保存角色没有 ID，UI 禁用上传。
const editCharacterId = computed(() => String(state.charEditForm?.id || safeCurrentCharacter.value?.id || '').trim())

const personalityModelVersionCount = computed(() => personalityModelVersions.value.filter((item) => item.status !== 'archived').length)

const personalityModelInstalledSummary = computed(() => {
  const installed = personalityModelVersions.value.find((item) => item.status === 'installed')
  if (!installed) return ''
  const parts: string[] = []
  const frozenHit = formatPercentMetric(installed.metrics?.testGroupAccuracy)
  if (frozenHit !== '—') parts.push(`冻结评测命中 ${frozenHit}`)
  const backend = PERSONALITY_TRAINING_BACKEND_LABELS[String(installed.trainingBackend || '')] || ''
  if (backend) parts.push(backend)
  parts.push(formatVersionTime(installed.installedAt || installed.createdAt))
  return parts.join(' · ')
})

const knownPersonalityModelVersionIds = computed(() => personalityModelVersions.value
  .map((item) => String(item.versionId || '').trim())
  .filter(Boolean))

const snapshotSessionLabels = computed<Record<string, string>>(() => {
  const sessions = Array.isArray((chatStore as any).chatSessions) ? (chatStore as any).chatSessions : []
  return Object.fromEntries(sessions
    .map((session: any) => [String(session?.id || '').trim(), String(session?.title || session?.name || '未命名会话')])
    .filter(([id]: [string, string]) => Boolean(id)))
})

const snapshotBlockerItems = computed(() => {
  const blockers = snapshotOverwriteBlockers.value
  if (!blockers) return []
  return [
    ...blockers.generationAttempts.map((item, index) => ({
      key: `generation-${String(item.id || index)}`,
      title: '生成任务仍在运行',
      detail: `任务 ${String(item.id || '未知')} · 会话 ${String(item.sessionId || item.session_id || '未知')}`
    })),
    ...blockers.projectionWritebacks.map((item, index) => ({
      key: `writeback-${String(item.id || index)}`,
      title: '角色投影仍在写回',
      detail: `写回 ${String(item.id || '未知')} · 会话 ${String(item.sessionId || item.session_id || '未知')}`
    }))
  ]
})

function isSnapshotModelMissing(snapshot: CharacterSnapshotMetadata) {
  const versionId = String(snapshot.personalityModelVersionId || '')
  return Boolean(versionId && !knownPersonalityModelVersionIds.value.includes(versionId))
}

async function refreshCharacterSnapshots() {
  const characterId = editCharacterId.value
  if (!characterId) {
    characterSnapshots.value = []
    return
  }
  characterSnapshotsLoading.value = true
  try {
    characterSnapshots.value = await listCharacterSnapshotRecords(characterId)
  } catch (error) {
    console.error('读取角色快照失败:', error)
    state.toast(`读取角色快照失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    characterSnapshotsLoading.value = false
  }
}

async function exportCompleteCharacterJson() {
  const characterId = editCharacterId.value
  if (!characterId) return
  try {
    const payload = await exportCompleteCharacterRecord(characterId)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${String(payload.identity?.name || '角色')}.完整角色.json`
    anchor.click()
    URL.revokeObjectURL(url)
    state.toast('完整角色已导出；人格模型文件需另行备份', 'success')
  } catch (error) {
    state.toast(`导出完整角色失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

async function createManualSnapshot(label: string) {
  const characterId = editCharacterId.value
  if (!characterId || characterSnapshotBusy.value) return
  characterSnapshotBusy.value = true
  try {
    await createManualCharacterSnapshotRecord(characterId, label)
    await refreshCharacterSnapshots()
    state.toast('已保存角色快照', 'success')
  } catch (error) {
    state.toast(`保存角色快照失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    characterSnapshotBusy.value = false
  }
}

function openSnapshotDeleteConfirm(snapshot: CharacterSnapshotMetadata) {
  snapshotConfirmAction.value = { kind: 'delete', snapshot }
}

function openSnapshotCleanupConfirm() {
  snapshotCleanupKeepCount.value = Math.min(20, characterSnapshots.value.filter((item) => item.snapshotKind === 'automatic').length)
  snapshotConfirmAction.value = { kind: 'cleanup' }
}

function openSnapshotOverwriteConfirm(snapshot: CharacterSnapshotMetadata) {
  snapshotConfirmAction.value = { kind: 'overwrite', snapshot }
}

async function confirmSnapshotDelete() {
  const snapshot = snapshotConfirmAction.value?.snapshot
  snapshotConfirmAction.value = null
  if (!snapshot || characterSnapshotBusy.value) return
  characterSnapshotBusy.value = true
  try {
    await deleteCharacterSnapshotRecord(editCharacterId.value, snapshot.id)
    await refreshCharacterSnapshots()
    state.toast('角色快照已删除', 'success')
  } catch (error) {
    state.toast(`删除角色快照失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    characterSnapshotBusy.value = false
  }
}

async function confirmSnapshotCleanup() {
  snapshotConfirmAction.value = null
  if (characterSnapshotBusy.value) return
  characterSnapshotBusy.value = true
  try {
    const keepCount = Math.max(0, Math.min(20, Math.trunc(Number(snapshotCleanupKeepCount.value) || 0)))
    const result = await cleanupCharacterSnapshotRecords(editCharacterId.value, keepCount)
    await refreshCharacterSnapshots()
    const protectedText = result.protectedIds.length ? `，${result.protectedIds.length} 份仍被会话保护` : ''
    state.toast(`已清理 ${result.deletedIds.length} 份自动快照${protectedText}`, 'success')
  } catch (error) {
    state.toast(`清理自动快照失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    characterSnapshotBusy.value = false
  }
}

async function confirmSnapshotOverwrite() {
  const snapshot = snapshotConfirmAction.value?.snapshot
  snapshotConfirmAction.value = null
  if (!snapshot || characterSnapshotBusy.value) return
  characterSnapshotBusy.value = true
  try {
    const detail = await getCharacterSnapshotRecord(editCharacterId.value, snapshot.id)
    const result = await overwriteCharacterMainFromSnapshotRecord(editCharacterId.value, snapshot.id)
    const current = safeCurrentCharacter.value as Record<string, unknown> | null
    if (current) Object.assign(current, applyCharacterSnapshotState(current, detail.payload.state), {
      personalityModelPath: result.personalityModelPath,
      personality_model_path: result.personalityModelPath
    })
    Object.assign(state.charEditForm, applyCharacterSnapshotState(state.charEditForm, detail.payload.state))
    editPersonalityModelPath.value = result.personalityModelPath
    await Promise.all([refreshCharacterSnapshots(), refreshPersonalityModelVersions()])
    state.toast(result.degradedToNormalRecall
      ? '主线已覆盖；快照的人格模型版本已失效，当前已降级为普通召回'
      : '角色主线已从快照覆盖，覆盖前状态已自动保护', result.degradedToNormalRecall ? 'warning' : 'success')
  } catch (error) {
    const typed = error as Error & { status?: number; blockers?: CharacterSnapshotOverwriteBlockers }
    if (typed.status === 409 && typed.blockers) {
      snapshotOverwriteBlockers.value = typed.blockers
    } else {
      state.toast(`覆盖角色主线失败：${typed.message || String(error)}`, 'error')
    }
  } finally {
    characterSnapshotBusy.value = false
  }
}

async function refreshPersonalityModelVersions() {
  const characterId = editCharacterId.value
  if (!characterId) {
    personalityModelVersions.value = []
    return
  }
  try {
    personalityModelVersions.value = await personalityTrainingApi.listModelVersions(characterId)
  } catch (error) {
    // 入口摘要属于辅助信息，读取失败不打断角色编辑主流程
    console.error('读取人格模型版本失败:', error)
    personalityModelVersions.value = []
  }
}

function openPersonalityWorkbench(mode: 'train' | 'optimize' | 'versions') {
  if (!editCharacterId.value) {
    state.toast('请先保存角色后再训练人格模型', 'error')
    return
  }
  personalityWorkbenchMode.value = mode
}

function closePersonalityWorkbench() {
  personalityWorkbenchMode.value = null
  // 工作台内可能安装 / 删除版本，回到编辑弹窗时同步入口摘要
  void refreshPersonalityModelVersions()
}

function openNewCharAvatarPicker() {
  newCharAvatarInputRef.value?.click()
}

function openPersonalityModelPicker() {
  if (!editCharacterId.value) {
    state.toast('请先保存角色后再上传人格模型', 'error')
    return
  }
  personalityModelInputRef.value?.click()
}

// 上传成功后同步本地展示路径，并直接写回 store 角色对象的 personalityModelPath，
// 让发送链路（按角色读取 personalityModelPath）立即看到，无需刷新页面。
function applyPersonalityModelPathToStore(path: string) {
  editPersonalityModelPath.value = path
  const character = safeCurrentCharacter.value as Record<string, unknown> | null
  if (character) character.personalityModelPath = path
}

async function handlePersonalityModelUpload(event: Event) {
  const inputEl = event.target as HTMLInputElement
  const file = inputEl.files?.[0]
  // 重置输入，保证同一文件可再次触发 change。
  inputEl.value = ''
  if (!file) return
  const characterId = editCharacterId.value
  if (!characterId) {
    state.toast('请先保存角色后再上传人格模型', 'error')
    return
  }
  personalityModelUploading.value = true
  try {
    const formData = new FormData()
    formData.append('model', file)
    const res = await fetch(API.characterPersonalityModel(characterId), {
      method: 'POST',
      body: formData
    })
    // 先读文本再安全解析：服务端 413 / 网关错误等可能返回非 JSON，直接 res.json() 会抛错盖掉真实状态。
    const raw = await res.text()
    let data: { ok?: boolean; personalityModelPath?: string; error?: string; fileCount?: number } = {}
    try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
    if (!res.ok || data.ok === false || data.error) {
      const detail = data.error || (raw ? raw.slice(0, 200) : '') || '无响应内容'
      throw new Error(`HTTP ${res.status} ${detail}`)
    }
    applyPersonalityModelPathToStore(String(data.personalityModelPath || ''))
    state.toast('人格模型已上传', 'success')
    personalityWorkbenchRefreshToken.value += 1
    void refreshPersonalityModelVersions()
  } catch (error) {
    console.error('人格模型上传失败:', error)
    state.toast(`人格模型上传失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    personalityModelUploading.value = false
  }
}

async function deletePersonalityModel() {
  const characterId = editCharacterId.value
  if (!characterId) return
  personalityModelUploading.value = true
  try {
    const res = await fetch(API.characterPersonalityModel(characterId), { method: 'DELETE' })
    const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (!res.ok || data.ok === false || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    applyPersonalityModelPathToStore('')
    state.toast('人格模型已删除', 'success')
    personalityWorkbenchRefreshToken.value += 1
    void refreshPersonalityModelVersions()
  } catch (error) {
    console.error('人格模型删除失败:', error)
    state.toast(`人格模型删除失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    personalityModelUploading.value = false
  }
}

function openImportCharacterJson() {
  importCharacterJsonInputRef.value?.click()
}

function openCharAvatarPicker() {
  charAvatarInputRef.value?.click()
}

function resetNewCharacterFlow() {
  newCharacterStep.value = 1
  newCharacterMode.value = ''
  newCharacterBrief.value = ''
  newCharacterManualDialogOpen.value = false
  newCharacterPromptCopied.value = false
  newCharacterImporting.value = false
  newCharacterGenerating.value = false
}

function closeNewCharacterFlow() {
  state.showAddCharacter.value = false
  resetNewCharacterFlow()
}

function selectNewCharacterMode(mode: 'ai' | 'manual') {
  newCharacterMode.value = mode
}

function goBackNewCharacterStep() {
  newCharacterStep.value = Math.max(1, newCharacterStep.value - 1)
}

function returnToNewCharacterModeStep() {
  newCharacterManualDialogOpen.value = false
  newCharacterStep.value = 1
  newCharacterMode.value = ''
}

function goNextNewCharacterStep() {
  if (newCharacterStep.value === 1 && newCharacterMode.value === 'manual') {
    newCharacterManualDialogOpen.value = true
    return
  }
  if (newCharacterStep.value < newCharacterStepperSteps.length) {
    newCharacterStep.value += 1
    return
  }
  closeNewCharacterFlow()
}

function buildNewCharacterPromptText() {
  return buildLanghuanAgentCharacterCorePrompt(newCharacterBrief.value.trim())
}

async function writeClipboardText(text: string) {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function copyNewCharacterPrompt() {
  if (!canCopyNewCharacterPrompt.value) return
  const ok = await writeClipboardText(buildNewCharacterPromptText())
  if (ok) newCharacterPromptCopied.value = true
  state.toast(ok ? '生成角色提示词已复制' : '当前环境无法写入剪贴板', ok ? 'success' : 'error')
}

async function readClipboardText() {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    throw new Error('当前环境无法读取剪贴板')
  }
  return await navigator.clipboard.readText()
}

function applyCharacterCoreChangesToNewForm(changes: Record<string, unknown>) {
  const currentGroup = String(state.newCharForm.group || '').trim()
  Object.assign(state.newCharForm, {
    name: String(changes.name || '').trim(),
    emoji: String(changes.emoji || '').trim(),
    gender: String(changes.gender || '').trim(),
    age: Number(changes.age || 0) || 0,
    desc: String(changes.desc || '').trim(),
    appearance: String(changes.appearance || '').trim(),
    speakingStyle: String(changes.speakingStyle || changes.speaking_style || '').trim(),
    personality: String(changes.personality || '').trim(),
    outfit: String(changes.outfit || '').trim(),
    hobbies: String(changes.hobbies || '').trim(),
    abilities: String(changes.abilities || '').trim(),
    experience: String(changes.experience || '').trim(),
    worldview: String(changes.worldview || '').trim(),
    background: String(changes.background || '').trim(),
    nicknames: [],
    group: currentGroup,
    avatar: '',
    defaultPreset: '',
    defaultModel: '',
    roleTemperature: '',
    roleMaxTokens: '',
    roleThinking: '',
    replyPipelineModeOverride: 'follow_session',
    currentActivities: [],
    locations: [],
    schedule: {},
    yearlySchedule: [],
    relationships: {},
    brainDocuments: changes.brainDocuments && typeof changes.brainDocuments === 'object' && !Array.isArray(changes.brainDocuments)
      ? changes.brainDocuments
      : {}
  })
  if (!String(state.newCharForm.name || '').trim()) {
    throw new Error('角色核心内容缺少角色名称')
  }
}

function applyImportedCharacterCoreToNewForm(markdown: string) {
  applyCharacterCoreChangesToNewForm(parseCharacterCoreMarkdown(markdown))
}

async function importNewCharacterFromClipboard() {
  if (newCharacterImporting.value) return
  newCharacterImporting.value = true
  try {
    const markdown = await readClipboardText()
    applyImportedCharacterCoreToNewForm(markdown)
    const createdId = await state.addNewCharacter()
    if (!state.showAddCharacter.value) resetNewCharacterFlow()
    // 外部 AI 产物若带大脑种子段落（出生日期/灵魂/关键经历）则一并写入；旧格式没有种子段时静默跳过
    if (createdId) {
      let seed: CharacterBrainSeed | null = null
      try {
        seed = parseCharacterBrainSeedMarkdown(markdown)
      } catch {
        seed = null
      }
      if (seed) await applyBrainSeedToCreatedCharacter(String(createdId), seed)
    }
  } catch (error) {
    state.toast(`导入角色失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    newCharacterImporting.value = false
  }
}

/** 创建成功后把大脑种子写进新角色正式真值（灵魂节点+出生日期+轨迹日桠/事件），返回汇报片段。
 *  直接落正式、不走待确认（2026-07-08 用户拍板）；agent 生成与剪贴板导入两条创建链共用。 */
async function applyBrainSeedToCreatedCharacter(createdId: string, seed: CharacterBrainSeed): Promise<string> {
  const created = charStore.getCharacter(createdId)
  if (!created) throw new Error('新角色创建后读取失败，无法写入灵魂/轨迹')
  const result = buildCharacterBrainSeedChanges(created as never, seed, new Date().toISOString())
  await charStore.updateCharacter(createdId, result.changes as never)
  return `灵魂 ${result.soulCount} 节点、轨迹 ${result.dayCount} 日桠 ${result.eventCount} 事件`
}

// 联动标注（双入口一真值）：本函数是「新建角色弹窗按钮」和「星依 generateCharacter 工具」共用的 execute 核心，
// 经 xingyiFunctionBridge 注册（见下方 registerXingyiFunctionProvider）；返回 {ok,message} 供星依回报。
async function runNewCharacterAgentCore(brief: string): Promise<{ ok: boolean; message: string }> {
  const noticeId = runtimeStore.startAgentTaskNotice({
    title: '自动生成角色',
    message: '正在整理角色方向',
    sourceLabel: '新建角色',
    step: '已读取简要描述'
  })
  try {
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: '正在调用 Agent 生成角色核心',
      step: 'Agent 生成中'
    })
    const result = await runLanghuanAgentCharacterCore({
      brief,
      agentConfig: settingStore.getBrainAgentConfig(),
      callAI: callAI as any
    })
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: '正在写入正式角色',
      step: '已收到角色核心单位'
    })
    applyCharacterCoreChangesToNewForm(result.changes)
    const createdId = await state.addNewCharacter()
    if (createdId === false) {
      throw new Error('角色写入失败（详见页面提示）')
    }
    if (!state.showAddCharacter.value) resetNewCharacterFlow()
    const createdName = String(result.changes.name || '新角色')
    // 大脑种子写入：角色本体已创建成功，种子失败单独如实报告（不回滚角色）
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: '正在写入灵魂与轨迹',
      step: `角色 ${createdName} 已创建`
    })
    let seedSummary = ''
    try {
      seedSummary = await applyBrainSeedToCreatedCharacter(String(createdId), result.seed)
    } catch (seedError) {
      const detail = seedError instanceof Error ? seedError.message : String(seedError)
      runtimeStore.failAgentTaskNotice({
        id: noticeId,
        message: '灵魂/轨迹写入失败',
        step: '角色本体已创建',
        error: seedError
      })
      return { ok: false, message: `角色「${createdName}」已创建，但灵魂/轨迹写入失败：${detail}` }
    }
    runtimeStore.completeAgentTaskNotice({
      id: noticeId,
      message: '角色已创建',
      step: `已创建 ${createdName}`
    })
    return { ok: true, message: `已按简要描述创建角色「${createdName}」（核心字段 + ${seedSummary}）` }
  } catch (error) {
    runtimeStore.failAgentTaskNotice({
      id: noticeId,
      message: '角色生成失败',
      step: '失败原因已记录',
      error
    })
    return { ok: false, message: `角色生成失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

async function generateNewCharacterWithAgent() {
  if (!canRunNewCharacterAgent.value) return
  newCharacterGenerating.value = true
  try {
    const result = await runNewCharacterAgentCore(newCharacterBrief.value.trim())
    if (!result.ok) state.toast(result.message, 'error')
  } finally {
    newCharacterGenerating.value = false
  }
}

// 星依批次2：自动生成角色能力注册进星依功能桥（组件常驻挂载于 WorkspaceShellRoot，随壳注册/注销）
const unregisterXingyiCharacterCreateProvider = registerXingyiFunctionProvider('characterCreate', {
  generateCharacter: async (brief: string) => {
    if (newCharacterGenerating.value) {
      return { ok: false, message: '角色生成正在进行中，等当前这次完成再试。' }
    }
    newCharacterGenerating.value = true
    try {
      return await runNewCharacterAgentCore(String(brief || '').trim())
    } finally {
      newCharacterGenerating.value = false
    }
  }
})

onBeforeUnmount(() => {
  unregisterXingyiCharacterCreateProvider()
})

async function confirmAddNewCharacter() {
  await state.addNewCharacter()
  resetNewCharacterFlow()
}

async function handleCharacterAvatarInput(event: Event, target: 'new' | 'edit') {
  try {
    const source = await readImageInputAsDataUrl(event)
    if (!source) return
    photoCropTarget.value = target
    photoCropSource.value = source
    photoCropOpen.value = true
  } catch (error) {
    console.error('读取角色头像失败:', error)
  }
}

function closePhotoCrop() {
  photoCropOpen.value = false
  photoCropSource.value = ''
}

function applyPhotoCrop(dataUrl: string) {
  if (photoCropTarget.value === 'new') {
    state.newCharForm.avatar = dataUrl
  } else {
    state.charEditForm.avatar = dataUrl
  }
  closePhotoCrop()
}

function ensureNewNicknames() {
  if (!Array.isArray(state.newCharForm.nicknames)) {
    state.newCharForm.nicknames = []
  }
  return state.newCharForm.nicknames
}

function addNewNickname() {
  const value = newNicknameInput.value.trim()
  if (!value) return
  const nicknames = ensureNewNicknames()
  if (!nicknames.includes(value)) {
    nicknames.push(value)
  }
  newNicknameInput.value = ''
}

function removeNewNickname(idx: string | number) {
  ensureNewNicknames().splice(Number(idx), 1)
}

function normalizeAvailableModels(rawModels: unknown): string[] {
  if (Array.isArray(rawModels)) return rawModels.filter((item) => typeof item === 'string' && item.trim())
  if (typeof rawModels === 'string') {
    try {
      const parsed = JSON.parse(rawModels)
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : []
    } catch {
      return []
    }
  }
  return []
}

function getPresetByName(presetName: string) {
  return (unref(state.viewModel.apiPresets) || []).find((presetItem: ApiPresetOption) => presetItem.name === presetName) || null
}

function getStoredPresetModels(presetName: string): string[] {
  const preset = getPresetByName(presetName)
  if (!preset) return []
  const rawModels = preset?.availableModels ?? preset?.available_models
  return normalizeAvailableModels(rawModels)
}

function getModelOptions(kind: 'new' | 'edit'): string[] {
  const presetName = kind === 'new' ? state.newCharForm.defaultPreset : state.charEditForm.defaultPreset
  const loaded = roleModelOptions[kind]
  return loaded.length > 0 ? loaded : getStoredPresetModels(presetName)
}

async function loadRolePresetModels(kind: 'new' | 'edit') {
  const presetName = kind === 'new' ? state.newCharForm.defaultPreset : state.charEditForm.defaultPreset
  const preset = getPresetByName(presetName)
  if (!preset) return

  modelLoading[kind] = true
  try {
    const res = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await res.json() as { data?: Array<{ id: string }>; error?: string }
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`)
    }
    const models = Array.isArray(data.data)
      ? data.data.map((item) => String(item.id || '').trim()).filter(Boolean)
      : []
    roleModelOptions[kind] = models
    if (typeof state.viewModel.updateApiPreset === 'function') {
      await state.viewModel.updateApiPreset(preset.name, { availableModels: models })
    }
  } catch (error) {
    console.error('加载角色可选模型失败:', error)
  } finally {
    modelLoading[kind] = false
  }
}

function shouldShowCustomModelInput(kind: 'new' | 'edit'): boolean {
  const model = kind === 'new' ? state.newCharForm.defaultModel : state.charEditForm.defaultModel
  if (!model) return false
  return !getModelOptions(kind).includes(model)
}

watch(() => state.showAddCharacter.value, (open) => {
  if (!open) {
    newNicknameInput.value = ''
    resetNewCharacterFlow()
  }
})

watch(newCharacterBrief, () => {
  newCharacterPromptCopied.value = false
})

watch(() => state.showCharacterEditor.value, (open) => {
  if (open) {
    editPersonalityModelPath.value = String((safeCurrentCharacter.value as Record<string, unknown> | null)?.personalityModelPath || '')
    void refreshPersonalityModelVersions()
    void refreshCharacterSnapshots()
    return
  }
  personalityWorkbenchMode.value = null
  characterSnapshots.value = []
  snapshotConfirmAction.value = null
  snapshotOverwriteBlockers.value = null
  if (state.newNicknameInput) {
    state.newNicknameInput.value = ''
  }
})

watch(() => state.newCharForm.defaultPreset, () => {
  roleModelOptions.new = []
})

watch(() => state.charEditForm.defaultPreset, () => {
  roleModelOptions.edit = []
})
</script>

<style scoped>
.character-profile-json-actions {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
}

.character-profile-link-button {
  border: 0;
  background: transparent;
  color: #727f7b;
  font-size: 0.84rem;
  cursor: pointer;
  padding: 4px 0;
}

.character-profile-link-button:hover {
  color: #58645f;
}

.snapshot-cleanup-field {
  display: grid;
  grid-template-columns: 1fr 86px;
  gap: 7px 12px;
  align-items: center;
  color: var(--morandi-text);
}

.snapshot-cleanup-field input {
  width: 86px;
  height: 36px;
  padding: 0 9px;
  border: 1px solid var(--morandi-border);
  border-radius: 5px;
  color: var(--morandi-text);
  background: var(--langhuan-dialog-input-bg, var(--morandi-card));
}

.snapshot-cleanup-field em {
  grid-column: 1 / -1;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
  font-style: normal;
}

.snapshot-overwrite-warning {
  display: grid;
  gap: 7px;
  color: var(--morandi-text-light);
  font-size: 0.84rem;
  line-height: 1.55;
}

.snapshot-overwrite-warning p { margin: 0; }
.snapshot-overwrite-warning .is-danger { color: var(--danger-color, #9b5b55); }
.snapshot-blocker-list { display: grid; gap: 8px; }
.snapshot-blocker-row { display: grid; gap: 3px; padding-bottom: 8px; border-bottom: 1px solid var(--morandi-border); }
.snapshot-blocker-row:last-child { border-bottom: 0; }
.snapshot-blocker-row strong { color: var(--morandi-text); font-size: 0.86rem; }
.snapshot-blocker-row span { color: var(--morandi-text-light); font-size: 0.78rem; }

.new-character-manual-back-button {
  margin-right: 8px;
}

.new-character-flow {
  min-height: 270px;
}

.new-character-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.new-character-choice,
.new-character-generate-action {
  display: grid;
  gap: 7px;
  min-height: 118px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 80%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
  color: var(--morandi-text);
  text-align: left;
  padding: 16px;
  cursor: pointer;
}

.new-character-choice.active {
  border-color: rgba(126, 167, 157, 0.72);
  background: color-mix(in srgb, var(--morandi-accent) 10%, var(--morandi-card));
}

.new-character-choice span,
.new-character-generate-action span {
  font-size: 0.98rem;
  font-weight: 700;
}

.new-character-choice small,
.new-character-generate-action small {
  color: var(--morandi-text-light);
  line-height: 1.55;
}

.new-character-field {
  display: grid;
  gap: 8px;
  color: var(--morandi-text);
  font-size: 0.9rem;
  font-weight: 700;
}

.new-character-field textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 80%, transparent);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #ffffff);
  color: var(--morandi-text);
  line-height: 1.65;
  padding: 12px;
}

.new-character-field-count {
  margin-top: 6px;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  text-align: right;
}

.new-character-generate-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.new-character-generate-action:disabled {
  cursor: default;
  opacity: 0.58;
}

.new-character-generate-action--primary:not(:disabled) {
  border-color: rgba(126, 167, 157, 0.76);
  background: color-mix(in srgb, var(--morandi-accent) 12%, var(--morandi-card));
}

.new-character-generate-action--copied:not(:disabled) {
  border-color: rgba(105, 145, 133, 0.9);
  background: color-mix(in srgb, var(--morandi-accent) 14%, var(--morandi-card));
}

.new-character-copy-status {
  margin-top: 12px;
  border-left: 2px solid rgba(105, 145, 133, 0.72);
  padding-left: 10px;
  color: var(--morandi-accent);
  font-size: 0.84rem;
  font-weight: 700;
}

.new-character-import-panel {
  display: grid;
  gap: 14px;
  color: var(--morandi-text);
}

.new-character-import-panel p {
  margin: 0;
  line-height: 1.65;
}

.new-character-import-action {
  min-height: 54px;
  border: 1px solid rgba(126, 167, 157, 0.66);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-accent) 12%, var(--morandi-card));
  color: var(--morandi-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.new-character-import-action:disabled {
  cursor: default;
  opacity: 0.55;
}

.new-character-flow-actions__right {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.new-character-flow-action {
  min-width: 96px;
  height: 38px;
  border-radius: 8px;
  padding: 0 14px;
  font: inherit;
  cursor: pointer;
}

.new-character-flow-action--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.new-character-flow-action--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.new-character-flow-action:disabled {
  cursor: default;
  opacity: 0.48;
}

@media (max-width: 720px) {
  .new-character-choice-grid,
  .new-character-generate-panel {
    grid-template-columns: 1fr;
  }
}
</style>
