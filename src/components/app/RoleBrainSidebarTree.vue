<template>
  <div
    class="role-brain-tree-shell"
    :class="{ 'role-brain-tree-shell--hydrating': isRoleBrainHydrating }"
    :aria-busy="isRoleBrainHydrating ? 'true' : 'false'"
    @contextmenu.prevent
  >
    <div class="role-brain-tree-toolbar" :aria-label="$t('brain.roleWorkspace.treeToolbarAria')">
      <div class="role-brain-tree-toolbar__surface">
        <button type="button" class="role-brain-tree-toolbar__btn" :title="$t('brain.card.undo')" :aria-label="$t('brain.card.undo')" :disabled="!canUndoRoleBrainOps" @click="undoRoleBrainOps">
          <svg class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7H4v5"/>
            <path d="M4 12c1.8-3.5 5-5 8.5-5 4.3 0 7.6 2.3 8.5 6"/>
          </svg>
        </button>
        <button type="button" class="role-brain-tree-toolbar__btn" :title="$t('brain.card.redo')" :aria-label="$t('brain.card.redo')" :disabled="!canRedoRoleBrainOps" @click="redoRoleBrainOps">
          <svg class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 7h5v5"/>
            <path d="M20 12c-1.8-3.5-5-5-8.5-5-4.3 0-7.6 2.3-8.5 6"/>
          </svg>
        </button>
        <button type="button" class="role-brain-tree-toolbar__btn" :title="roleBrainExpandToggleLabel" :aria-label="roleBrainExpandToggleLabel" :disabled="!allExpandableRoleBrainUnitIds.length" @click="toggleAllRoleBrainUnits">
          <svg v-if="isAllRoleBrainUnitsExpanded" class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 18l5-5 5 5"/>
            <path d="M7 13l5-5 5 5"/>
          </svg>
          <svg v-else class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 6l5 5 5-5"/>
            <path d="M7 11l5 5 5-5"/>
          </svg>
        </button>
        <button type="button" class="role-brain-tree-toolbar__btn" :title="roleBrainToolbarBranchCreateTitle" :aria-label="roleBrainToolbarBranchCreateTitle" :disabled="!canCreateRoleBrainBranchFromToolbar" @click="openRoleBrainCreateDialogFromToolbar('branch')">
          <svg class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h6l2 2h8v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>
            <path d="M12 11v6"/>
            <path d="M9 14h6"/>
          </svg>
        </button>
        <button type="button" class="role-brain-tree-toolbar__btn" :title="$t('brain.roleWorkspace.newLeaf')" :aria-label="$t('brain.roleWorkspace.newLeaf')" :disabled="!canCreateRoleBrainLeafFromToolbar" @click="openRoleBrainCreateDialogFromToolbar('leaf')">
          <svg class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4h9l3 3v13H6z"/>
            <path d="M15 4v4h4"/>
            <path d="M12 11v6"/>
            <path d="M9 14h6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="role-brain-tree-scroll">
      <SoneTreeRows
        v-if="treeRows.length"
        class="role-brain-tree"
        :rows="treeRows"
        :menu-style="floatingMenuStyle"
        @select="selectUnit"
        @toggle="toggleUnit"
        @menu="toggleUnitMenu"
        @menu-action="runUnitMenuAction"
        @row-pointerdown="handleUnitPointerDown"
        @row-pointermove="handleUnitPointerMove"
        @row-pointerend="handleUnitPointerEnd"
      />
    </div>
    <CharacterBrainWorldTreeImportDialog
      :open="worldTreeImportDialog.open"
      :parent-id="worldTreeImportDialog.parentId"
      :parent-title="worldTreeImportParentTitle"
      :existing-nodes="currentCognitionNodes"
      :documents="characterStore.documents"
      :saving="worldTreeImportDialog.saving"
      @cancel="closeWorldTreeImportDialog"
      @submit="confirmWorldTreeImport"
    />
    <AppConfirmDialog
      :open="deleteConfirm.open"
      :title="deleteConfirm.title"
      :message="deleteConfirm.message"
      :confirm-text="$t('common.delete')"
      tone="danger"
      :confirm-action="confirmDeleteRoleBrainUnits"
      @cancel="closeDeleteConfirm"
    />
    <AppConfirmDialog
      :open="duplicateRelationConfirm.open"
      :title="$t('brain.roleWorkspace.deleteDupRelationTitle')"
      :message="$t('brain.roleWorkspace.deleteDupRelationMessage', { count: duplicateRelationConfirm.targets.length })"
      :confirm-text="$t('common.delete')"
      tone="danger"
      :confirm-action="confirmDeleteRoleDuplicateRelationHints"
      @cancel="closeDuplicateRelationConfirm"
    />
    <CompilePageImportConflictDialog
      :open="compileImportConflictDialog.open"
      :plan="compileImportConflictDialog.plan"
      @cancel="cancelCompileImportConflictDialog"
      @apply="applyCompileImportConflictDialog"
    />
    <CompactRelationImportReviewDialog
      :open="compactRelationImportReviewDialog.open"
      :plan="compactRelationImportReviewDialog.plan"
      @cancel="cancelCompactRelationImportReview"
      @apply="applyCompactRelationImportReview"
    />
    <AppFormDialog
      :open="createDialog.open"
      :title="createDialogTargetSection === 'trace' ? $t('brain.roleWorkspace.newTraceBranch') : (createDialog.kind === 'branch' ? $t('brain.roleWorkspace.newBranch') : $t('brain.roleWorkspace.newLeaf'))"
      :subtitle="createDialogParentTitle"
      :size="createDialogTargetSection === 'trace' ? 'lg' : 'md'"
      :submit-text="createDialogTargetSection === 'trace' && !isTraceCreateLastStep ? $t('common.next') : $t('brain.nodeForm.submitCreate')"
      :submit-disabled="!createDialogCanSubmit"
      @cancel="closeCreateDialog"
      @submit="confirmCreateRoleBrainUnit"
    >
      <div class="role-brain-tree-dialog-form">
        <AppStepper
          v-if="createDialogTargetSection === 'trace'"
          v-model="createDialog.traceStep"
          :steps="traceCreateStepperSteps"
          hide-footer
          disable-step-indicators
        >
          <template #granularity>
            <div class="role-brain-tree-trace-create">
              <div class="role-brain-tree-trace-create__granularity">
                <button
                  v-for="option in traceCreateGranularityOptions"
                  :key="option.value"
                  type="button"
                  class="role-brain-tree-trace-create__granularity-button"
                  :class="{ active: createDialog.traceGranularity === option.value }"
                  :disabled="option.disabled"
                  @click="setTraceCreateGranularity(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <small>{{ option.caption }}</small>
                </button>
              </div>
            </div>
          </template>
          <template #year>
            <div class="role-brain-tree-field role-brain-tree-field--wide">
              <span>{{ $t('brain.roleWorkspace.year') }}</span>
              <LanghuanCalendarPicker
                :model-value="traceCreateSelectedYearDate"
                view-mode="year"
                :available-modes="['year']"
                :calendar-state="traceCreateYearCalendarState"
                :selected-values="createDialog.traceSelectedYears"
                :multi-select="createDialog.traceGranularity === 'year'"
                :continuous-year-selection="createDialog.traceGranularity === 'year'"
                lock-view-mode
                hide-navigation-arrows
                compact
                @select="selectTraceCreateYear"
                @multi-select-change="updateTraceCreateYears"
              />
            </div>
          </template>
          <template #month>
            <div class="role-brain-tree-field role-brain-tree-field--wide">
              <span>{{ $t('brain.roleWorkspace.month') }}</span>
              <LanghuanCalendarPicker
                :model-value="traceCreateSelectedMonthDate"
                view-mode="month"
                :available-modes="['month']"
                :calendar-state="traceCreateMonthCalendarState"
                :selected-values="createDialog.traceSelectedMonths"
                :month-count="traceCreateSelectedYearMonthCount"
                :multi-select="createDialog.traceGranularity === 'month'"
                lock-view-mode
                hide-navigation-arrows
                compact
                @select="selectTraceCreateMonth"
                @multi-select-change="updateTraceCreateMonths"
              />
            </div>
          </template>
          <template #day>
            <div class="role-brain-tree-field role-brain-tree-field--wide">
              <span>{{ $t('brain.roleWorkspace.date') }}</span>
              <LanghuanCalendarPicker
                :model-value="traceCreateSelectedDateValue"
                view-mode="date"
                :available-modes="['date']"
                :calendar-state="traceCreateDayCalendarState"
                :selected-values="createDialog.traceSelectedDates"
                :month-count="traceCreateSelectedYearMonthCount"
                multi-select
                lock-view-mode
                hide-navigation-arrows
                compact
                @select="selectTraceCreateDay"
                @multi-select-change="updateTraceCreateDates"
              />
            </div>
          </template>
          <template #subtitle>
            <label class="role-brain-tree-field">
              <span>{{ $t('brain.roleWorkspace.subtitle') }}</span>
              <input v-model="createDialog.title" type="text" :placeholder="createDialogTitlePlaceholder">
            </label>
          </template>
        </AppStepper>
        <label v-if="createDialogTargetSection !== 'trace'" class="role-brain-tree-field">
          <span>{{ $t('brain.roleWorkspace.name') }}</span>
          <input v-model="createDialog.title" type="text" :placeholder="createDialogTitlePlaceholder">
        </label>
        <label v-if="createDialogTargetSection !== 'trace'" class="role-brain-tree-field">
          <span>{{ $t('brain.roleWorkspace.placementPath') }}</span>
          <input
            v-model="createDialog.pathInput"
            type="text"
            :placeholder="`${roleBrainRootPath}/`"
            @input="sanitizeRoleCreatePathInput"
            @blur="sanitizeRoleCreatePathInput"
          >
        </label>
      </div>
      <template v-if="createDialogTargetSection === 'trace'" #actions>
        <div class="role-brain-tree-dialog-actions role-brain-tree-dialog-actions--trace">
          <button
            v-if="createDialog.traceStep > 1"
            type="button"
            class="role-brain-tree-dialog-action role-brain-tree-dialog-action--secondary"
            @click="goBackTraceCreateStep"
          >
            {{ $t('common.prev') }}
          </button>
          <span v-else aria-hidden="true"></span>
          <div class="role-brain-tree-dialog-actions__right">
            <button
              type="button"
              class="role-brain-tree-dialog-action role-brain-tree-dialog-action--secondary"
              @click="closeCreateDialog"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              type="button"
              class="role-brain-tree-dialog-action role-brain-tree-dialog-action--primary"
              :disabled="!createDialogCanSubmit"
              @click="confirmCreateRoleBrainUnit"
            >
              {{ isTraceCreateLastStep ? $t('brain.nodeForm.submitCreate') : $t('common.next') }}
            </button>
          </div>
        </div>
      </template>
    </AppFormDialog>
    <AppFormDialog
      :open="renameDialog.open"
      :title="$t('common.rename')"
      size="md"
      :submit-text="$t('common.save')"
      :submit-disabled="!renameDialogCanSubmit"
      @cancel="closeRenameDialog"
      @submit="confirmRenameRoleBrainUnit"
    >
      <div class="role-brain-tree-dialog-form">
        <label class="role-brain-tree-field">
          <span>{{ $t('brain.roleWorkspace.name') }}</span>
          <input v-model="renameDialog.title" type="text" :placeholder="$t('brain.roleWorkspace.unitNamePlaceholder')">
        </label>
      </div>
    </AppFormDialog>
    <AppFormDialog
      :open="sortDialog.open"
      :title="$t('brain.roleWorkspace.sortCurrentLevel')"
      size="lg"
      :submit-text="$t('brain.roleWorkspace.saveSort')"
      :submit-disabled="sortDialog.items.length < 2"
      @cancel="closeSortDialog"
      @submit="saveRoleBrainSortDialog"
    >
      <div ref="sortDialogList" class="role-brain-sort-shell">
        <TransitionGroup name="role-brain-sort" tag="div" class="role-brain-sort-list">
          <div
            v-for="(item, index) in sortDialog.items"
            :key="item.id"
            class="role-brain-sort-item"
            :class="getRoleBrainSortItemClasses(index)"
            :data-sort-dialog-id="item.id"
          >
            <span class="role-brain-sort-label">{{ item.label }}</span>
            <div class="role-brain-sort-actions">
              <button type="button" class="role-brain-sort-btn" :disabled="isRoleBrainSortMoveDisabled(index)" @click="moveRoleBrainSortItem(index, -1)" :aria-label="$t('brain.roleWorkspace.moveUp')">
                <svg class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M6 11l6-6 6 6"/></svg>
              </button>
              <button type="button" class="role-brain-sort-btn" :disabled="isRoleBrainSortMoveDisabled(index)" @click="moveRoleBrainSortItem(index, 1)" :aria-label="$t('brain.roleWorkspace.moveDown')">
                <svg class="role-brain-tree-toolbar__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="M18 13l-6 6-6-6"/></svg>
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </AppFormDialog>
  </div>
</template>

<script lang="ts">
import type {
  CompilePageImportDecisionMap as PendingCompilePageImportDecisionMap,
  CompilePageImportPlan as PendingCompilePageImportPlan
} from '../../app/compilePageImportConflict'

type PendingRoleBrainCompileImport = {
  id: string
  sourceCharacterId: string
  plan: PendingCompilePageImportPlan
  resolve: (decisions: PendingCompilePageImportDecisionMap | null) => void
}

let pendingRoleBrainCompileImport: PendingRoleBrainCompileImport | null = null
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Character, UnitSemanticType } from '../../types'
import type { CharacterBrainCompilePage, CharacterBrainCognitionNode, CharacterBrainFieldKey, CharacterBrainTraceNode } from '../../types/characterBrain'
import type { CharacterBrainImportConflictAction, CharacterBrainImportDraft } from '../../types'
import type { UnitView, UnitViewAdapterResult } from '../../types/unitView'
import { buildCharacterBrainSidebarShellUnitView, buildCharacterBrainUnitView } from '../../app/unitViewAdapters'
import {
  buildCharacterBrainTreeCoreFieldChange,
  createCharacterBrainTraceArrangementTreeNode,
  createCharacterBrainTraceBranchTreeNode,
  createCharacterBrainTraceBatchTreeNodes,
  createCharacterBrainTraceEventTreeNode,
  deleteCharacterBrainSoulTreeNode,
  deleteCharacterBrainTraceTreeNode,
  updateCharacterBrainSoulTreeNode,
  updateCharacterBrainTraceTreeNode
} from '../../app/characterBrainTreeModel'
import {
  resolveTraceCreateDefaultDateDraft,
  type TraceCreateGranularity
} from '../../app/trajectoryCreateSelection'
import { parseCompilePageMarkdown, parseCompilePageMarkdownBatch } from '../../app/compilePageMarkdownImport'
import {
  parseTrajectoryMarkdown,
  validateTrajectoryRootImportBirthDate,
  type TrajectoryMarkdownImportEntry
} from '../../app/trajectoryMarkdownImport'
import {
  applyCompilePageImportDecisions,
  createCompilePageImportUnitPlan,
  createDefaultCompilePageImportDecisions,
  hasCompilePageImportConflicts,
  type CompilePageImportDecisionMap,
  type CompilePageImportIncoming,
  type CompilePageImportPlan
} from '../../app/compilePageImportConflict'
import {
  applyCompactRelationImportDecisions,
  countCompactRelationImportPlan,
  createCompactRelationImportPlan,
  type CompactRelationImportDecisionMap,
  type CompactRelationImportPlan
} from '../../app/compactRelationImportReview'
import { buildUnitTreeMarkdown, buildUnitTreeMarkdownWithBodyPrompt, buildUnitTreeMarkdownWithCompilePrompt } from '../../app/unitTreeJsonExport'
import { parseUnitBodyMarkdown, parseUnitBodyMarkdownBatch, type UnitBodyMarkdownEntry } from '../../app/unitBodyMarkdownImport'
import { parseCharacterCoreMarkdown } from '../../app/characterCoreMarkdownTransfer'
import {
  buildCompactRelationMarkdown,
  extractCompactRelationExportId,
  loadCompactRelationExportMapping,
  parseCompactRelationMarkdown,
  saveCompactRelationExportMapping,
  type CompactRelationPromptVersion
} from '../../app/unitRelationCompactMarkdown'
import { getUnitRelationRefId } from '../../app/relationHintReference'
import { normalizeUnitSemanticType } from '../../app/unitSemanticTypes'
import { buildUnitCompilePageIndicatorMap } from '../../app/compilePageIndicators'
import {
  buildCompileRelationIssues,
  buildRelationHintValidationItems,
  buildRelationSystemReadModel,
  type CompileRelationIssue,
  type CompileRelationIssueDuplicateEvidence
} from '../../app/relationSystem'
import {
  normalizeUnitTreePathInput,
  syncUnitTreeCreateTargetFromPath
} from '../../app/unitTreePathTargets'
import { buildUnitTreeCommonMenuItems } from '../../app/unitTreeActionMenu'
import {
  runLanghuanAgentCompilePage,
  runLanghuanAgentRelationOptimize
} from '../../app/langhuanAgentAssist'
import { registerXingyiFunctionProvider } from '../../app/xingyiFunctionBridge'
import { buildTrajectoryCalendarMonthState, buildTrajectoryTraceDayPickerState } from '../../app/langhuanCalendarAdapter'
import { buildTrajectoryCalendarRule } from '../../app/trajectoryCalendar'
import {
  applyCharacterBrainImportDraft,
  buildCharacterBrainImportPreview
} from '../../app/characterBrainImport'
import {
  buildCharacterBrainCognitionNodesChange,
  buildCharacterBrainCompileDocumentKey,
  buildCharacterBrainTraceNodesChange,
  readCharacterBrainDocuments,
  readCharacterBrainCompilePage,
  readCharacterBrainCognitionNodes,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from '../../app/characterBrain'
import { useCharacterStore } from '../../stores/characterStore'
import { useSettingStore } from '../../stores/settingStore'
import { useAI } from '../../composables/useAI'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { useSidebarFloatingMenuKit } from '../../composables/useSidebarFloatingMenuKit'
import { useSidebarSelectionMenuKit } from '../../composables/useSidebarSelectionMenuKit'
import SoneTreeRows, { type SoneTreeMenuItem, type SoneTreeRowView } from './SoneTreeRows.vue'
import CharacterBrainWorldTreeImportDialog from '../brain/CharacterBrainWorldTreeImportDialog.vue'
import AppConfirmDialog from '../common/AppConfirmDialog.vue'
import AppFormDialog from '../common/AppFormDialog.vue'
import AppStepper, { type AppStepperStep } from '../common/AppStepper.vue'
import CompilePageImportConflictDialog from '../common/CompilePageImportConflictDialog.vue'
import CompactRelationImportReviewDialog from '../common/CompactRelationImportReviewDialog.vue'
import LanghuanCalendarPicker, { type LanghuanCalendarSelection } from '../common/LanghuanCalendarPicker.vue'
import { moveSortDialogDraftItems, type SortDialogDraftDirection } from '../../utils/sortDialogDraft'
import { createProgressiveHydrationController, type ProgressiveHydrationStage } from '../../app/progressiveHydration'
import {
  createOperationPatch,
  createRedoPatch,
  createUndoPatch,
  type OperationPatch,
  type OperationPatchKind,
  type RedoPatch,
  type UndoPatch
} from '../../app/operationPatches'
import { createOperationQueue } from '../../app/optimisticOperation'
import { measureAsync, measureSync, reportDuration } from '../../utils/performanceMarks'
import { hasActiveBrowserTextSelection } from '../../utils/textSelection'
import { useTreeExpandPersistence } from '../../composables/useTreeExpandPersistence'

type RoleBrainClipboardEntry = {
  section: 'soul' | 'trace'
  unitId: string
  sourceId: string
  title: string
}

type RoleBrainClipboardState = {
  mode: 'copy' | 'cut' | ''
  unitIds: string[]
  labels: string[]
  entries: RoleBrainClipboardEntry[]
}

type RoleBrainHistoryPatch = {
  undoPatch: UndoPatch
  redoPatch: RedoPatch
}

type RoleBrainCreateKind = 'branch' | 'leaf'

type RoleBrainSidebarTreeRow = SoneTreeRowView & {
  unit: UnitView
}

const SOUL_ROOT_SOURCE_ID = 'brain:cognition'
const TRACE_ROOT_SOURCE_ID = 'brain:trajectory'
const COGNITION_NODE_ID_PREFIX = 'brain:cognition:node:'
const TRACE_NODE_ID_PREFIX = 'brain:trajectory:node:'
// 步骤 label 走 i18n（在 traceCreateStepperSteps 计算时用 t 填充；此处只保留 key 与顺序）
const TRACE_CREATE_STEP_LABEL_KEYS: Record<'granularity' | 'year' | 'month' | 'day' | 'subtitle', string> = {
  granularity: 'brain.roleWorkspace.granularity',
  year: 'brain.roleWorkspace.year',
  month: 'brain.roleWorkspace.month',
  day: 'brain.roleWorkspace.date',
  subtitle: 'brain.roleWorkspace.subtitle'
}
const TRACE_CREATE_STEP_ORDER: Array<AppStepperStep & { key: 'granularity' | 'year' | 'month' | 'day' | 'subtitle' }> = [
  { key: 'granularity', label: '' },
  { key: 'year', label: '' },
  { key: 'month', label: '' },
  { key: 'day', label: '' },
  { key: 'subtitle', label: '' }
]

const props = defineProps<{
  entity: unknown
  activeUnitId?: string
  rootUnitTypes?: string[]
}>()

const emit = defineEmits<{
  (e: 'select-unit', unitId: string): void
  (e: 'open-created-unit', sourceId: string): void
  (e: 'clipboard-change', state: { mode: 'copy' | 'cut' | ''; unitIds: string[] }): void
  (e: 'expanded-change', unitIds: string[]): void
  (e: 'import-save-success', message: string): void
  (e: 'import-save-error', message: string): void
}>()

type CompileImportDecisionOptions = {
  onWaitConfirmation?: (unitCount: number) => void
  sourceCharacterId?: string
}

const characterStore = useCharacterStore()
const settingStore = useSettingStore()
const runtimeStore = useWorkspaceRuntimeStore()
const { callAI } = useAI()
const { t } = useI18n()
// 展开态默认折叠：单位 id 全局唯一，持久化不区分角色，只记录"哪些单位展开过"
const roleBrainExpandPersistence = useTreeExpandPersistence('langhuan_character_brain_expanded_units_v1')
const expandedIds = ref<Set<string>>(roleBrainExpandPersistence.loadExpandedIds())
const roleBrainClipboard = ref<RoleBrainClipboardState>({ mode: '', unitIds: [], labels: [], entries: [] })
const roleBrainUndoStack = ref<RoleBrainHistoryPatch[]>([])
const roleBrainRedoStack = ref<RoleBrainHistoryPatch[]>([])
const isApplyingRoleBrainHistory = ref(false)
const roleBrainHydrationStage = ref<ProgressiveHydrationStage>('idle')
const roleBrainOperationQueue = createOperationQueue()
const pendingRoleBrainUnitStatus = ref<Record<string, 'saving' | 'deleting'>>({})
const worldTreeImportDialog = ref({
  open: false,
  parentId: '',
  saving: false
})
const createDialog = ref(createEmptyRoleBrainCreateDialog())
const renameDialog = ref({
  open: false,
  unitId: '',
  title: ''
})
const sortDialog = ref<{
  open: boolean
  parentUnitId: string
  section: 'soul' | 'trace' | ''
  items: Array<{ id: string; sourceId: string; label: string; selected?: boolean }>
}>({
  open: false,
  parentUnitId: '',
  section: '',
  items: []
})
const sortDialogList = ref<HTMLElement | null>(null)
const deleteConfirm = ref({
  open: false,
  rowId: '',
  unitIds: [] as string[],
  title: '',
  message: ''
})
const duplicateRelationConfirm = ref({
  open: false,
  targets: [] as DuplicateRelationHintDeletionTarget[]
})
const compileImportConflictDialog = ref<{ open: boolean; plan: CompilePageImportPlan }>({
  open: false,
  plan: { units: [] }
})
const pendingCompileImportResolver = ref<null | ((decisions: CompilePageImportDecisionMap | null) => void)>(null)
const compactRelationImportReviewDialog = ref<{ open: boolean; plan: CompactRelationImportPlan }>({
  open: false,
  plan: { items: [], skipped: 0, warnings: [] }
})
const pendingCompactRelationImportResolver = ref<null | ((decisions: CompactRelationImportDecisionMap | null) => void)>(null)
const { floatingMenuStyle, updateFloatingMenuPosition, clearFloatingMenuPosition } = useSidebarFloatingMenuKit({
  menuWidth: 210,
  estimatedHeight: 312,
  constrainHeight: false
})

function createEmptyRoleBrainCreateDialog() {
  return {
    open: false,
    kind: 'leaf' as RoleBrainCreateKind,
    parentUnitId: '',
    pathInput: '',
    initialPathInput: '',
    title: '',
    date: '',
    traceBranchKind: 'month' as 'month' | 'year' | 'multiYear',
    traceYear: '',
    traceMonth: '',
    traceSpanYears: '10',
    traceStep: 1,
    traceGranularity: 'day' as TraceCreateGranularity,
    traceSelectedYears: [] as string[],
    traceSelectedMonths: [] as string[],
    traceSelectedDates: [] as string[],
    insertAfterSourceId: '',
    insertParentUnitId: ''
  }
}

const unitView = shallowRef<UnitViewAdapterResult>(buildCharacterBrainSidebarShellUnitView(props.entity as Character))
const rootUnitId = computed(() => unitView.value.units.find((unit) => unit.unitType === 'character')?.unitId || '')
const unitById = computed(() => new Map(unitView.value.units.map((unit) => [unit.unitId, unit])))
const compilePageIndicatorByUnitId = computed(() => buildUnitCompilePageIndicatorMap(unitView.value))
const relationHintValidationItems = computed(() => buildRelationHintValidationItems(
  buildRelationSystemReadModel([unitView.value]),
  unitView.value.warnings
))
const currentCognitionNodes = computed(() => {
  const character = resolveEditableCharacter()
  return character ? readCharacterBrainCognitionNodes(character) : []
})
const worldTreeImportParentTitle = computed(() => {
  const unit = unitView.value.units.find((item) => String(item.sourceId || '') === worldTreeImportDialog.value.parentId)
  return unit?.title || t('brain.domainLabel.soul')
})
const canUndoRoleBrainOps = computed(() => roleBrainUndoStack.value.length > 0)
const canRedoRoleBrainOps = computed(() => roleBrainRedoStack.value.length > 0)
const hasRoleBrainClipboardData = computed(() => roleBrainClipboard.value.entries.length > 0)
const createDialogParentTitle = computed(() => {
  return t('brain.roleWorkspace.parentPathLabel', { path: createDialog.value.pathInput || `${roleBrainRootPath.value}/` })
})
const createDialogTargetSection = computed(() => {
  return resolveRoleBrainCreateSectionFromPath(createDialog.value.pathInput)
    || getRoleBrainCreateTargetSection(createDialog.value.parentUnitId)
    || ''
})
const createDialogTitlePlaceholder = computed(() => {
  if (createDialogTargetSection.value === 'trace') return t('brain.roleWorkspace.subtitleTracePlaceholder')
  return createDialog.value.kind === 'branch' ? t('brain.roleWorkspace.newBranchTitle') : t('brain.roleWorkspace.newLeafTitle')
})
const createDialogCanSubmit = computed(() => {
  if (createDialogTargetSection.value !== 'trace') return true
  return isTraceCreateCurrentStepComplete.value
})
const traceCreateAllowedGranularities = computed<TraceCreateGranularity[]>(() => {
  const parentUnit = unitById.value.get(createDialog.value.parentUnitId)
  const systemRole = parentUnit?.metadata?.systemRole
  if (systemRole === 'monthBranch') return ['day']
  if (systemRole === 'yearBranch') return ['day', 'month']
  return ['day', 'month', 'year']
})
const traceCreateGranularityOptions = computed(() => {
  const allowed = new Set(traceCreateAllowedGranularities.value)
  return [
    { value: 'day' as const, label: t('brain.roleWorkspace.traceDay'), caption: t('brain.roleWorkspace.createDayLeaf'), disabled: !allowed.has('day') },
    { value: 'month' as const, label: t('brain.roleWorkspace.traceMonth'), caption: t('brain.roleWorkspace.createMonthBranch'), disabled: !allowed.has('month') },
    { value: 'year' as const, label: t('brain.roleWorkspace.traceYear'), caption: t('brain.roleWorkspace.createYearBranch'), disabled: !allowed.has('year') }
  ]
})
const traceCreateStepperSteps = computed<AppStepperStep[]>(() => {
  const granularity = createDialog.value.traceGranularity
  const keys = granularity === 'year'
    ? ['granularity', 'year', 'subtitle']
    : granularity === 'month'
      ? ['granularity', 'year', 'month', 'subtitle']
      : ['granularity', 'year', 'month', 'day', 'subtitle']
  return TRACE_CREATE_STEP_ORDER
    .filter((step) => keys.includes(step.key))
    .map((step) => ({ ...step, label: t(TRACE_CREATE_STEP_LABEL_KEYS[step.key]) }))
})
const isTraceCreateLastStep = computed(() => createDialog.value.traceStep >= traceCreateStepperSteps.value.length)
const activeTraceCreateStepKey = computed(() => traceCreateStepperSteps.value[createDialog.value.traceStep - 1]?.key || 'granularity')
const isTraceCreateCurrentStepComplete = computed(() => {
  const key = activeTraceCreateStepKey.value
  if (key === 'granularity') return traceCreateAllowedGranularities.value.includes(createDialog.value.traceGranularity)
  if (key === 'year') return createDialog.value.traceSelectedYears.length > 0
  if (key === 'month') return createDialog.value.traceSelectedMonths.length > 0
  if (key === 'day') return createDialog.value.traceSelectedDates.length > 0
  return true
})
const traceCreateSelectedYearDate = computed(() => {
  const year = Number(createDialog.value.traceSelectedYears[0] || createDialog.value.traceYear || 1)
  return `${String(year).padStart(4, '0')}-01-01`
})
const traceCreateSelectedMonthDate = computed(() => {
  const selectedMonth = parseTraceMonthSelection(createDialog.value.traceSelectedMonths[0])
  const year = selectedMonth?.year || Number(createDialog.value.traceSelectedYears[0] || createDialog.value.traceYear || 1)
  const month = selectedMonth?.month || Number(createDialog.value.traceMonth || 1)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
})
const traceCreateSelectedDateValue = computed(() => {
  return createDialog.value.traceSelectedDates[0] || traceCreateSelectedMonthDate.value
})
const traceCreateSelectedYearMonthCount = computed(() => {
  const character = resolveEditableCharacter()
  if (!character) return 12
  const meta = readCharacterBrainTrajectoryMeta(character)
  const selectedYear = Number(createDialog.value.traceSelectedYears[0] || createDialog.value.traceYear || String(meta.birthDate || '').split('-')[0] || 1)
  return Math.max(1, buildTrajectoryCalendarRule('trajectory', meta.calendarConfig || {}).monthsInYear(selectedYear))
})
const traceCreateYearCalendarState = computed(() => {
  const character = resolveEditableCharacter()
  if (!character) return undefined
  const meta = readCharacterBrainTrajectoryMeta(character)
  const range = resolveTraceCreateContextRange(createDialog.value.parentUnitId)
  const birthYear = Number(String(meta.birthDate || '').split('-')[0] || 1)
  const minYear = Number(String(range.minDate || '').split('-')[0] || birthYear)
  const rawMaxYear = Number(String(range.maxDate || '').split('-')[0] || 0)
  const maxYear = rawMaxYear >= 9000
    ? rawMaxYear
    : (rawMaxYear || Math.max(minYear + 23, birthYear + 23))
  const year = Math.max(birthYear, minYear, Number(createDialog.value.traceSelectedYears[0] || createDialog.value.traceYear || birthYear) || birthYear)
  return {
    selectedDate: `${String(year).padStart(4, '0')}-01-01`,
    minDate: `${String(Math.max(birthYear, minYear)).padStart(4, '0')}-01-01`,
    maxDate: `${String(Math.max(year, maxYear)).padStart(4, '0')}-12-31`,
    enableDates: [],
    disableDates: [],
    dateStates: []
  }
})
const traceCreateMonthCalendarState = computed(() => {
  const character = resolveEditableCharacter()
  if (!character) return undefined
  const meta = readCharacterBrainTrajectoryMeta(character)
  const range = resolveTraceCreateContextRange(createDialog.value.parentUnitId)
  const selectedYear = Number(createDialog.value.traceSelectedYears[0] || createDialog.value.traceYear || String(meta.birthDate || '').split('-')[0] || 1)
  const selectedMonth = Number(createDialog.value.traceMonth || 1)
  const monthState = buildTrajectoryCalendarMonthState({
    year: selectedYear,
    month: selectedMonth,
    calendarConfig: meta.calendarConfig || {},
    selectedDate: traceCreateSelectedMonthDate.value,
    selectableDates: []
  })
  return {
    ...monthState.pickerState,
    selectedDate: traceCreateSelectedMonthDate.value,
    minDate: range.minDate,
    maxDate: range.maxDate,
    enableDates: [],
    disableDates: monthState.pickerState.disableDates,
    dateStates: monthState.pickerState.dateStates.map((date) => ({
      ...date,
      selectable: false,
      status: 'disabled' as const,
      reason: 'month-create-calendar'
    }))
  }
})
const traceCreateDayCalendarState = computed(() => {
  const character = resolveEditableCharacter()
  if (!character) return undefined
  const meta = readCharacterBrainTrajectoryMeta(character)
  const existingDates = readCharacterBrainTraceNodes(character)
    .filter((node) => node.kind === 'day' && node.granularity === 'day' && node.nodeType === 'single')
    .map((node) => String(node.pointDate || node.startDate || '').trim())
    .filter(Boolean)
  const selectedMonth = parseTraceMonthSelection(createDialog.value.traceSelectedMonths[0])
  const selectedYear = selectedMonth?.year || Number(createDialog.value.traceSelectedYears[0] || createDialog.value.traceYear || String(meta.birthDate || '').split('-')[0] || 1)
  const month = selectedMonth?.month || Number(createDialog.value.traceMonth || 1)
  const monthState = buildTrajectoryCalendarMonthState({
    year: selectedYear,
    month,
    calendarConfig: meta.calendarConfig || {},
    selectedDate: traceCreateSelectedDateValue.value,
    existingDates,
    disabledDates: buildTraceDisabledDatesForMonth(selectedYear, month),
    allowExistingDates: false
  })
  return monthState.pickerState
})
const defaultTraceCreateDraft = computed(() => {
  const character = resolveEditableCharacter()
  const fallback = { year: '', month: '', date: '' }
  if (!character) return fallback
  const meta = readCharacterBrainTrajectoryMeta(character)
  const nodes = readCharacterBrainTraceNodes(character)
  return resolveTraceCreateDefaultDateDraft(nodes, {
    birthDate: String(meta.birthDate || '').trim(),
    calendarConfig: meta.calendarConfig || {},
    coverageEndDate: String(meta.coverageRange?.endDate || meta.coverageEndDate || '').trim()
  }, {
    units: unitView.value.units
  })
})
const renameDialogCanSubmit = computed(() => renameDialog.value.title.trim().length > 0)
const roleBrainRootPath = computed(() => String((props.entity as { name?: unknown })?.name || t('brain.roleWorkspace.characterRoot')).trim() || t('brain.roleWorkspace.characterRoot'))
const childrenByParentId = computed(() => {
  const map = new Map<string, UnitView[]>()
  unitView.value.units.forEach((unit) => {
    const parentId = String(unit.parentId || '')
    if (!parentId) return
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId)?.push(unit)
  })
  map.forEach((items) => {
    items.sort((left, right) => {
      const orderCompare = Number(left.orderIndex ?? 9999) - Number(right.orderIndex ?? 9999)
      if (orderCompare !== 0) return orderCompare
      return left.title.localeCompare(right.title, 'zh-Hans-CN')
    })
  })
  return map
})

const allExpandableRoleBrainUnitIds = computed(() => {
  const rootId = rootUnitId.value
  if (!rootId) return []
  const expandableUnitIds: string[] = []
  const walk = (parentId: string, depth: number) => {
    const children = (childrenByParentId.value.get(parentId) || []).filter((unit) => {
      if (depth !== 0 || !props.rootUnitTypes?.length) return true
      return props.rootUnitTypes.includes(String(unit.unitType || ''))
    })
    children.forEach((unit) => {
      const hasChildren = (childrenByParentId.value.get(unit.unitId) || []).length > 0 || depth === 0
      if (hasChildren) expandableUnitIds.push(unit.unitId)
      walk(unit.unitId, depth + 1)
    })
  }
  walk(rootId, 0)
  return expandableUnitIds
})
const isAllRoleBrainUnitsExpanded = computed(() => (
  allExpandableRoleBrainUnitIds.value.length > 0
  && allExpandableRoleBrainUnitIds.value.every((unitId) => expandedIds.value.has(unitId))
))
const roleBrainExpandToggleLabel = computed(() => (isAllRoleBrainUnitsExpanded.value ? t('brain.roleWorkspace.collapseAll') : t('brain.roleWorkspace.expandAll')))

const baseTreeRows = computed<Array<RoleBrainSidebarTreeRow>>(() => {
  const rootId = rootUnitId.value
  if (!rootId) return []
  const rows: Array<RoleBrainSidebarTreeRow> = []
  const walk = (parentId: string, depth: number) => {
    const children = (childrenByParentId.value.get(parentId) || []).filter((unit) => {
      if (depth !== 0 || !props.rootUnitTypes?.length) return true
      return props.rootUnitTypes.includes(String(unit.unitType || ''))
    })
    children.forEach((unit) => {
      const childUnits = childrenByParentId.value.get(unit.unitId) || []
      const hasChildren = childUnits.length > 0 || depth === 0
      rows.push({
        id: unit.unitId,
        label: resolveRoleBrainSidebarLabel(unit),
        depth,
        kind: hasChildren ? 'folder' : 'document',
        open: expandedIds.value.has(unit.unitId),
        active: props.activeUnitId === unit.unitId,
        groupRunId: parentId,
        unit
      })
      if (hasChildren && expandedIds.value.has(unit.unitId)) {
        walk(unit.unitId, depth + 1)
      }
    })
  }
  walk(rootId, 0)
  return rows
})

const renderedUnitIds = computed(() => baseTreeRows.value.map((row) => row.id))
const roleUnitSelection = useSidebarSelectionMenuKit({
  getOrderedIds: () => renderedUnitIds.value,
  getRenderedIds: () => renderedUnitIds.value,
  getResetKey: () => String((props.entity as Character)?.id || '').trim()
})
const selectedRoleUnitIdSet = computed(() => new Set(roleUnitSelection.selectedIds.value))
const renderedUnitIndexById = computed(() => new Map(renderedUnitIds.value.map((unitId, index) => [unitId, index])))

function hasAdjacentSelectedRoleUnit(unitId: string, direction: -1 | 1) {
  const index = renderedUnitIndexById.value.get(unitId)
  if (index === undefined) return false
  const neighborId = renderedUnitIds.value[index + direction]
  return Boolean(neighborId) && selectedRoleUnitIdSet.value.has(neighborId)
}

const treeRows = computed<SoneTreeRowView[]>(() => baseTreeRows.value.map((row) => {
  const selected = selectedRoleUnitIdSet.value.has(row.id)
  const menuOpen = roleUnitSelection.isMenuOpen(row.id)
  const pendingStatus = pendingRoleBrainUnitStatus.value[row.id]
  return {
    id: row.id,
    label: row.label,
    subtitle: resolveRoleBrainSidebarSubtitle(row.unit, pendingStatus),
    depth: row.depth,
    kind: row.kind,
    open: row.open,
    active: row.active,
    selected,
    cutPending: isRoleBrainClipboardPending(row.id) || pendingStatus === 'deleting',
    selectedPrev: selected && hasAdjacentSelectedRoleUnit(row.id, -1),
    selectedNext: selected && hasAdjacentSelectedRoleUnit(row.id, 1),
    hasMenu: roleUnitSelection.shouldShowMenuTrigger(row.id),
    menuOpen,
    menuItems: menuOpen ? getUnitMenuItems(row.id) : undefined,
    multiSelectId: row.id,
    icon: row.depth === 0 ? getRoleBrainTreeIcon(row.unit) : undefined,
    groupRunId: row.groupRunId,
    pendingIndicator: row.unit.status === 'pending'
      ? { title: t('brain.roleWorkspace.pendingReviewHint') }
      : undefined,
    compilePageIndicator: pendingStatus === 'saving'
      ? { missing: true, title: t('brain.roleWorkspace.savingHint') }
      : compilePageIndicatorByUnitId.value.get(row.unit.unitId)
  }
}))

function resolveRoleBrainSidebarLabel(unit: UnitView) {
  const sidebarTitle = String(unit.metadata?.sidebarTitle || '').trim()
  return sidebarTitle || unit.title
}

function resolveRoleBrainSidebarSubtitle(unit: UnitView, pendingStatus?: 'saving' | 'deleting') {
  if (pendingStatus === 'deleting') return t('brain.roleWorkspace.deleting')
  if (pendingStatus === 'saving') return t('brain.roleWorkspace.saving')
  if (
    unit.unitType !== 'traceDay'
    && unit.unitType !== 'traceGroup'
    && unit.unitType !== 'traceEvent'
    && unit.unitType !== 'traceArrangement'
  ) return ''
  return String(unit.metadata?.subtitle || '').trim()
}

function isRoleBrainTitleReadonly(unit: UnitView | undefined) {
  return Boolean(unit?.metadata?.titleReadonly)
}

const canCreateRoleBrainLeafFromToolbar = computed(() => {
  const contextUnit = resolveRoleBrainToolbarContextUnit()
  if (contextUnit?.unitType === 'traceDay') return false
  if (contextUnit?.unitType === 'traceEvent' || contextUnit?.unitType === 'traceArrangement') return false
  if (contextUnit && getRoleBrainUnitSection(contextUnit) === 'trace') return false
  return Boolean(resolveRoleBrainCreationParentUnitId('leaf'))
})
const canCreateRoleBrainBranchFromToolbar = computed(() => {
  return Boolean(resolveRoleBrainCreationParentUnitId('branch'))
})
const roleBrainToolbarBranchCreateTitle = computed(() => {
  const contextUnit = resolveRoleBrainToolbarContextUnit()
  return contextUnit && getRoleBrainUnitSection(contextUnit) === 'trace' ? t('brain.roleWorkspace.newTraceBranch') : t('brain.roleWorkspace.newBranch')
})
const isRoleBrainHydrating = computed(() => roleBrainHydrationStage.value === 'shell' || roleBrainHydrationStage.value === 'hydrating')

let projectedCharacterId = ''
const roleBrainProjection = createProgressiveHydrationController<Character, UnitViewAdapterResult>({
  buildShell: (character) => buildCharacterBrainSidebarShellUnitView(character),
  hydrate: (character) => measureSync('roleBrain.projection.hydrate', () => buildCharacterBrainUnitView(character), {
    characterId: String(character.id || '').trim(),
    cognitionNodes: readCharacterBrainCognitionNodes(character).length,
    traceNodes: readCharacterBrainTraceNodes(character).length
  }, 30),
  onResult: (result, stage, token) => {
    const characterId = String((props.entity as Character)?.id || '').trim()
    if (stage === 'shell') {
      projectedCharacterId = String(result.units.find((unit) => unit.unitType === 'character')?.sourceId || characterId)
    }
    if (token !== roleBrainProjection.getToken()) return
    unitView.value = result
  },
  onStage: (stage) => {
    roleBrainHydrationStage.value = stage
  },
  onError: (error) => {
    console.error('[RoleBrainSidebarTree] progressive hydration failed', error)
  }
})

function getRoleBrainProjectionDeps(character: Character) {
  return [
    character.id,
    character.name,
    character.groupId || character.group_id,
    character.desc,
    character.appearance,
    character.outfit,
    character.personality,
    character.hobbies,
    character.abilities,
    character.experience,
    character.worldview,
    character.background,
    character.speakingStyle || character.speaking_style,
    character.nicknames,
    character.defaultPreset || character.default_preset,
    character.defaultModel || character.default_model,
    character.brainDocuments,
    character.brain_documents,
    character.brainLinks,
    character.brain_links,
    character.brainTrajectoryMeta,
    character.brain_trajectory_meta,
    character.brainCognitionNodes,
    character.brain_cognition_nodes,
    character.brainTraceNodes,
    character.brain_trace_nodes
  ]
}

function scheduleRoleBrainProjection(character: Character) {
  const characterId = String(character.id || '').trim()
  const activeProjectionCharacterId = String(roleBrainProjection.getActiveInput()?.id || '').trim()
  if (activeProjectionCharacterId !== characterId) {
    console.debug('[perf] roleBrain.projection.schedule', { mode: 'start', characterId })
    roleBrainProjection.start(character)
    return
  }
  console.debug('[perf] roleBrain.projection.schedule', { mode: 'refresh', characterId })
  roleBrainProjection.refresh(character)
}

watch(rootUnitId, () => {
  roleUnitSelection.clearSelection()
  roleUnitSelection.closeMenu()
  clearRoleBrainClipboard()
  roleBrainUndoStack.value = []
  roleBrainRedoStack.value = []
  closeCreateDialog()
  closeRenameDialog()
  closeSortDialog()
  clearFloatingMenuPosition()
}, { immediate: true })

watch(expandedIds, (next) => {
  emit('expanded-change', Array.from(next))
  roleBrainExpandPersistence.saveExpandedIds(next)
}, { immediate: true, deep: true })

watch(() => getRoleBrainProjectionDeps(props.entity as Character), () => {
  scheduleRoleBrainProjection(props.entity as Character)
}, { immediate: true })

watch(() => unitView.value.units, () => {
  clearMissingRoleBrainPendingUnits()
})

function toggleUnit(unitId: string) {
  const next = new Set(expandedIds.value)
  if (next.has(unitId)) {
    next.delete(unitId)
    collectDescendantUnitIds(unitId).forEach((descendantId) => {
      next.delete(descendantId)
    })
  } else {
    next.add(unitId)
  }
  expandedIds.value = next
}

function collectDescendantUnitIds(unitId: string) {
  const result: string[] = []
  const seen = new Set<string>()
  const visit = (parentId: string) => {
    if (seen.has(parentId)) return
    seen.add(parentId)
    ;(childrenByParentId.value.get(parentId) || []).forEach((child) => {
      result.push(child.unitId)
      visit(child.unitId)
    })
  }
  visit(unitId)
  return result
}

function getRoleBrainDuplicateRelationIssuesForUnitIds(unitIds: string[]) {
  const scopedUnitIds = new Set(normalizeUnitIdsInput(unitIds).flatMap((unitId) => [unitId, ...collectDescendantUnitIds(unitId)]))
  if (!scopedUnitIds.size) return []
  return buildCompileRelationIssues(
    relationHintValidationItems.value.filter((item) => scopedUnitIds.has(String(item.ownerUnitId || '').trim()))
  ).filter((issue) => issue.type === 'duplicate_relation')
}

function getRenderedTreeRow(unitId: string) {
  return baseTreeRows.value.find((row) => row.id === unitId)
}

function getRoleBrainTreeIcon(unit: UnitView) {
  if (unit.unitType === 'core') return 'core'
  if (
    unit.unitType === 'trace'
    || unit.unitType === 'traceDay'
    || unit.unitType === 'traceGroup'
    || unit.unitType === 'traceEvent'
    || unit.unitType === 'traceArrangement'
  ) return 'trace'
  if (unit.unitType === 'soul') return 'soul'
  if (unit.unitType === 'soulNode') {
    return unit.contentKind === 'group' ? 'folder' : 'document'
  }
  return unit.contentKind === 'group' ? 'folder' : 'document'
}

function selectUnit(unitId: string, event: MouseEvent | KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.sidebar-row-action') || target?.closest('.sidebar-tree-rows__row-menu')) return
  roleUnitSelection.closeMenu()
  clearFloatingMenuPosition()
  const row = getRenderedTreeRow(unitId)
  if (event instanceof MouseEvent) {
    const hasSelectionModifier = Boolean(event.shiftKey || event.ctrlKey || event.metaKey)
    if (row?.kind === 'folder' && !hasSelectionModifier && !roleUnitSelection.selectionMode.value) {
      roleUnitSelection.selectOnly(unitId)
      toggleUnit(unitId)
      emit('select-unit', unitId)
      return
    }
    roleUnitSelection.handleItemClick({
      id: unitId,
      event,
      onDefault: () => {
        if (row?.kind === 'folder') {
          toggleUnit(unitId)
        }
        emit('select-unit', unitId)
      }
    })
    return
  }
  if (row?.kind === 'folder') {
    roleUnitSelection.selectOnly(unitId)
    toggleUnit(unitId)
  }
  roleUnitSelection.selectOnly(unitId)
  emit('select-unit', unitId)
}

function handleUnitPointerDown(unitId: string, event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.sidebar-row-action') || target?.closest('.sidebar-tree-rows__row-menu')) return
  roleUnitSelection.handlePointerDown(unitId, event)
}

function handleUnitPointerMove(_unitId: string, event: PointerEvent) {
  roleUnitSelection.handlePointerMove(event)
}

function handleUnitPointerEnd(_unitId: string, event: PointerEvent) {
  roleUnitSelection.handlePointerEnd(event)
}

function toggleUnitMenu(unitId: string, event: MouseEvent) {
  updateFloatingMenuPosition(event)
  roleUnitSelection.openContextMenuFor(unitId)
  emit('select-unit', unitId)
}

function getSelectedUnitsForMenu(rowId: string) {
  const mode = roleUnitSelection.getMenuMode(rowId)
  const ids = mode === 'batch' ? roleUnitSelection.selectedIds.value : [rowId]
  return ids
    .map((id) => unitById.value.get(id))
    .filter((unit): unit is UnitView => Boolean(unit))
}

function getUnitMenuItems(rowId: string): SoneTreeMenuItem[] {
  const units = getSelectedUnitsForMenu(rowId)
  const isBatch = roleUnitSelection.getMenuMode(rowId) === 'batch'
  const canCutOrCopy = units.length > 0 && units.every(isEditableRoleBrainUnit)
  const canPaste = canPasteRoleBrainClipboardInto(rowId)
  const canImportWorldTree = !isBatch && canImportWorldTreeInto(rowId)
  const canCreateLeaf = !isBatch && canCreateRoleBrainLeafUnder(rowId)
  const menuSection = units[0] ? getRoleBrainUnitSection(units[0]) : ''
  const canCreateBranch = !isBatch && canCreateRoleBrainBranchUnder(rowId)
  const isTraceMenu = menuSection === 'trace'
  const canCreateTraceUnit = !isBatch && canCreateTraceRoleBrainUnitUnder(rowId)
  const canCreateTraceEvent = !isBatch && canCreateTraceDocumentUnder(rowId)
  const canCreateTraceArrangement = !isBatch && canCreateTraceDocumentUnder(rowId)
  const canSortLayer = isBatch ? canSortSelectedRoleBrainLayer(units) : canSortRoleBrainLayer(rowId)
  const canDelete = units.length > 0 && units.every(isEditableRoleBrainUnit)
  const canRename = !isBatch && units.length === 1 && isEditableRoleBrainUnit(units[0]) && !isRoleBrainTitleReadonly(units[0])
  const isReferenceOnly = units.length > 0 && units.every(isDocumentReferenceRoleBrainUnit)
  const markdownImportRootIds = isBatch ? units.map((unit) => unit.unitId) : [rowId]
  const canAgentCompilePage = canImportCompilePageMarkdownInto(markdownImportRootIds)
  const hasDuplicateRelations = Boolean(getRoleBrainDuplicateRelationIssuesForUnitIds(markdownImportRootIds).length)
  const items = buildUnitTreeCommonMenuItems({
    t,
    open: isBatch ? false : {},
    groupAsBranch: isBatch
      ? false
      : isTraceMenu
        ? { label: t('brain.roleWorkspace.newTraceBranch'), action: 'new-trace-unit', disabled: !canCreateTraceUnit, dividerBefore: true }
        : { label: t('brain.roleWorkspace.newBranch'), action: 'new-branch', disabled: !canCreateBranch, dividerBefore: true },
    createLeaf: isBatch
      ? false
      : isTraceMenu
        ? { label: t('brain.roleWorkspace.newEvent'), action: 'new-trace-event', disabled: !canCreateTraceEvent }
        : { action: 'new-leaf', disabled: !canCreateLeaf },
    rename: isBatch ? false : { disabled: !canRename },
    importSource: isBatch
      ? false
      : { key: 'import-world-tree', action: 'import-world-tree', disabled: !canImportWorldTree },
    sortLayer: { disabled: !canSortLayer, dividerBefore: isBatch },
    clipboard: {
      cut: { disabled: !canCutOrCopy, dividerBefore: !isBatch },
      copy: { disabled: !canCutOrCopy },
      paste: { disabled: !canPaste }
    },
    copyTitle: { dividerBefore: !isBatch, shortcut: '' },
    copyPath: {},
    langhuanAgent: {
      disabled: !canAgentCompilePage,
      compilePageDisabled: !canAgentCompilePage,
      relationOptimizeDisabled: !canAgentCompilePage,
      duplicateRelationDisabled: !hasDuplicateRelations
    },
    markdownExport: {},
    markdownImport: {
      disabled: !canAgentCompilePage && !canImportRoleBrainBodyMarkdownInto(markdownImportRootIds),
      bodyDisabled: !canImportRoleBrainBodyMarkdownInto(markdownImportRootIds),
      compilePageDisabled: !canAgentCompilePage,
      compactRelationDisabled: !canAgentCompilePage
    },
    delete: {
      label: isReferenceOnly ? t('brain.roleWorkspace.removeReference') : t('brain.roleWorkspace.deleteUnit'),
      disabled: !canDelete,
      dividerBefore: true,
      danger: true
    }
  })
  if (isTraceMenu && !isBatch) {
    const eventIndex = items.findIndex((item) => item.action === 'new-trace-event')
    const arrangementItem: SoneTreeMenuItem = {
      key: 'new-trace-arrangement',
      label: t('brain.roleWorkspace.newArrangement'),
      action: 'new-trace-arrangement',
      disabled: !canCreateTraceArrangement
    }
    if (eventIndex >= 0) items.splice(eventIndex + 1, 0, arrangementItem)
    else items.splice(1, 0, arrangementItem)
  }
  return items
}

function runUnitMenuAction(action: string, rowId: string) {
  const units = getSelectedUnitsForMenu(rowId)
  roleUnitSelection.closeMenu()
  clearFloatingMenuPosition()
  if (action === 'open') {
    emit('select-unit', rowId)
    return
  }
  if (action === 'cut' || action === 'copy') {
    const clipboard = buildRoleBrainClipboard(units, action)
    if (clipboard) setRoleBrainClipboard(clipboard)
    return
  }
  if (action === 'paste') {
    pasteRoleBrainClipboardIntoUnit(rowId).catch(() => {})
    return
  }
  if (action === 'new-leaf') {
    createRoleBrainLeaf(rowId).catch(() => {})
    return
  }
  if (action === 'new-trace-unit') {
    createRoleBrainTraceUnit(rowId).catch(() => {})
    return
  }
  if (action === 'new-trace-event') {
    createRoleBrainTraceDocument(rowId, 'event').catch(() => {})
    return
  }
  if (action === 'new-trace-arrangement') {
    createRoleBrainTraceDocument(rowId, 'arrangement').catch(() => {})
    return
  }
  if (action === 'new-branch') {
    createRoleBrainBranch(rowId).catch(() => {})
    return
  }
  if (action === 'sort-layer') {
    openRoleBrainSortDialog(rowId, roleUnitSelection.getMenuMode(rowId) === 'batch'
      ? units.map((unit) => unit.unitId)
      : [])
    return
  }
  if (action === 'rename') {
    openRenameDialog(rowId)
    return
  }
  if (action === 'import-world-tree') {
    openWorldTreeImportDialog(rowId)
    return
  }
  if (action === 'copy-title') {
    copyText(units.map((unit) => unit.title).join('\n'))
    return
  }
  if (action === 'copy-path') {
    copyText(units.map((unit) => getUnitPath(unit.unitId)).join('\n'))
    return
  }
  if (action === 'copy-json') {
    copyText(buildRoleBrainUnitTreeMarkdown(units.map((unit) => unit.unitId)))
    return
  }
  if (action === 'copy-markdown-with-compile-prompt') {
    copyText(buildRoleBrainUnitTreeMarkdownWithCompilePrompt(units.map((unit) => unit.unitId)))
    return
  }
  if (action === 'copy-markdown-with-body-prompt') {
    copyText(buildRoleBrainUnitTreeMarkdownWithBodyPrompt(units.map((unit) => unit.unitId)))
    return
  }
  if (isCompactRelationCopyAction(action)) {
    copyText(buildRoleBrainCompactRelationMarkdown(
      units.map((unit) => unit.unitId),
      units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value,
      getCompactRelationPromptVersionFromAction(action)
    ))
    return
  }
  if (action === 'langhuan-agent-generate-compile-page') {
    runRoleBrainAgentGenerateCompilePage(
      units.map((unit) => unit.unitId),
      units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value
    ).catch(() => {})
    return
  }
  if (action === 'langhuan-agent-optimize-relations') {
    runRoleBrainAgentOptimizeRelations(
      units.map((unit) => unit.unitId),
      units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value
    ).catch(() => {})
    return
  }
  if (action === 'langhuan-agent-delete-duplicate-relations') {
    openDeleteRoleDuplicateRelationsConfirm(units.map((unit) => unit.unitId))
    return
  }
  if (action === 'export-json') {
    exportRoleBrainUnitTreeJsonFile(units.map((unit) => unit.unitId), units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value)
    return
  }
  if (action === 'export-markdown-with-compile-prompt') {
    exportRoleBrainUnitTreeMarkdownFile(units.map((unit) => unit.unitId), units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value, true)
    return
  }
  if (action === 'export-markdown-with-body-prompt') {
    exportRoleBrainUnitTreeMarkdownFile(units.map((unit) => unit.unitId), units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value, 'body')
    return
  }
  if (isCompactRelationExportAction(action)) {
    exportRoleBrainCompactRelationMarkdownFile(
      units.map((unit) => unit.unitId),
      units.length > 1 ? `${roleBrainRootPath.value}-${t('brain.roleWorkspace.multiSelectSuffix')}` : units[0]?.title || roleBrainRootPath.value,
      getCompactRelationPromptVersionFromAction(action)
    )
    return
  }
  if (action === 'import-compile-page-md') {
    openCompilePageMarkdownFilePicker(units.map((unit) => unit.unitId))
    return
  }
  if (action === 'import-compile-page-md-from-clipboard') {
    importCompilePageMarkdownFromClipboard(units.map((unit) => unit.unitId)).catch(() => {})
    return
  }
  if (action === 'import-body-md') {
    openTrajectoryBodyMarkdownFilePicker(units.map((unit) => unit.unitId))
    return
  }
  if (action === 'import-body-md-from-clipboard') {
    importTrajectoryBodyMarkdownFromClipboard(units.map((unit) => unit.unitId)).catch(() => {})
    return
  }
  if (action === 'import-compact-relation-md') {
    openCompactRelationMarkdownFilePicker(units.map((unit) => unit.unitId))
    return
  }
  if (action === 'import-compact-relation-md-from-clipboard') {
    importCompactRelationMarkdownFromClipboard(units.map((unit) => unit.unitId)).catch(() => {})
    return
  }
  if (action === 'delete') {
    openDeleteConfirm(rowId, units)
  }
}

function getUnitPath(unitId: string) {
  const parts: string[] = []
  const seen = new Set<string>()
  let current = unitById.value.get(unitId)
  while (current && !seen.has(current.unitId)) {
    seen.add(current.unitId)
    parts.unshift(current.title)
    current = current.parentId ? unitById.value.get(current.parentId) : undefined
  }
  return parts.join('/')
}

function isEditableRoleBrainUnit(unit: UnitView) {
  return unit.unitType === 'soulNode'
    || unit.unitType === 'traceDay'
    || unit.unitType === 'traceGroup'
    || unit.unitType === 'traceEvent'
    || unit.unitType === 'traceArrangement'
}

function isCompilePageWritableRoleBrainUnit(unit: UnitView) {
  if (unit.unitType === 'coreField') return unit.contentKind === 'markdown'
  return unit.unitType === 'soulNode'
    || unit.unitType === 'traceDay'
    || unit.unitType === 'traceGroup'
    || unit.unitType === 'traceEvent'
    || unit.unitType === 'traceArrangement'
}

function isBodyWritableRoleBrainUnit(unit: UnitView) {
  return isCompilePageWritableRoleBrainUnit(unit)
}

function isDocumentReferenceRoleBrainUnit(unit: UnitView) {
  return unit.unitType === 'soulNode' && String(unit.metadata?.kind || '') === 'reference'
}

function getRoleBrainUnitSection(unit: UnitView): 'soul' | 'trace' | '' {
  if (unit.unitType === 'soul' || unit.unitType === 'soulNode') return 'soul'
  if (
    unit.unitType === 'trace'
    || unit.unitType === 'traceDay'
    || unit.unitType === 'traceGroup'
    || unit.unitType === 'traceEvent'
    || unit.unitType === 'traceArrangement'
  ) return 'trace'
  return ''
}

function normalizeUnitIdsInput(unitIds: string | string[]) {
  return (Array.isArray(unitIds) ? unitIds : [unitIds])
    .map((unitId) => String(unitId || '').trim())
    .filter(Boolean)
}

function areStringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

type DuplicateRelationHintDeletionTarget = {
  sourceId: string
  lineIndex: number
  line: string
}
type DuplicateRelationHintDeletionSource = Pick<
  CompileRelationIssue | CompileRelationIssueDuplicateEvidence,
  'ownerUnitId' | 'ownerPath' | 'lineIndex' | 'line'
>

function resolveRoleDuplicateRelationHintSourceId(source: DuplicateRelationHintDeletionSource) {
  const ownerUnitId = String(source.ownerUnitId || '').trim()
  const ownerPath = String(source.ownerPath || '').trim()
  const unit = unitView.value.units.find((item) => (
    item.unitId === ownerUnitId
    || String(item.sourceId || '').trim() === ownerUnitId
    || String(item.sourcePath || '').trim() === ownerPath
  ))
  return String(unit?.sourceId || '').trim()
}

function resolveRoleDuplicateRelationHintDeletionTarget(source: DuplicateRelationHintDeletionSource): DuplicateRelationHintDeletionTarget | null {
  const sourceId = resolveRoleDuplicateRelationHintSourceId(source)
  const lineIndex = typeof source.lineIndex === 'number' ? source.lineIndex : -1
  const line = String(source.line || '').trim()
  if (!sourceId || lineIndex < 0 || !line) return null
  return { sourceId, lineIndex, line }
}

function collectRoleDuplicateRelationHintDeletionTargets(sources: DuplicateRelationHintDeletionSource[]) {
  const seen = new Set<string>()
  return sources
    .map(resolveRoleDuplicateRelationHintDeletionTarget)
    .filter((target): target is DuplicateRelationHintDeletionTarget => Boolean(target))
    .filter((target) => {
      const key = `${target.sourceId}:${target.lineIndex}:${target.line}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function openDeleteRoleDuplicateRelationsConfirm(unitIds: string[]) {
  const issues = getRoleBrainDuplicateRelationIssuesForUnitIds(unitIds)
  const targets = collectRoleDuplicateRelationHintDeletionTargets(issues)
  if (!targets.length) {
    emit('import-save-error', t('brain.roleWorkspace.noDupRelationToDelete'))
    return
  }
  duplicateRelationConfirm.value = { open: true, targets }
}

function closeDuplicateRelationConfirm() {
  duplicateRelationConfirm.value = { open: false, targets: [] }
}

async function confirmDeleteRoleDuplicateRelationHints() {
  const character = resolveEditableCharacter()
  const targets = duplicateRelationConfirm.value.targets
  closeDuplicateRelationConfirm()
  if (!character || !targets.length) return

  const targetsBySourceId = new Map<string, DuplicateRelationHintDeletionTarget[]>()
  targets.forEach((target) => {
    targetsBySourceId.set(target.sourceId, [...(targetsBySourceId.get(target.sourceId) || []), target])
  })

  const now = new Date().toISOString()
  const nextDocuments = {
    ...readCharacterBrainDocuments(character)
  }
  const compilePageBySourceId = new Map<string, CharacterBrainCompilePage>()
  let deletedLineCount = 0

  targetsBySourceId.forEach((sourceTargets, sourceId) => {
    const unit = unitView.value.units.find((item) => String(item.sourceId || '').trim() === sourceId)
    if (!unit) return
    const current = getRoleBrainCompilePageCurrent(character, unit)
    const deletableLineIndexes = new Set<number>()
    sourceTargets.forEach((target) => {
      if (String(current.relationHints[target.lineIndex] || '').trim() === target.line) {
        deletableLineIndexes.add(target.lineIndex)
      }
    })
    if (!deletableLineIndexes.size) return
    const nextCompilePage: CharacterBrainCompilePage = {
      summary: current.summary,
      tags: [...current.tags],
      relationHints: current.relationHints.filter((_, index) => !deletableLineIndexes.has(index)),
      semanticType: normalizeUnitSemanticType(current.semanticType),
      updatedAt: now
    }
    deletedLineCount += deletableLineIndexes.size
    compilePageBySourceId.set(sourceId, nextCompilePage)
    nextDocuments[buildCharacterBrainCompileDocumentKey(sourceId)] = JSON.stringify(nextCompilePage)
  })

  if (!compilePageBySourceId.size) {
    emit('import-save-error', t('brain.roleWorkspace.dupRelationChanged'))
    return
  }

  const nextCognitionNodes = readCharacterBrainCognitionNodes(character).map((node) => {
    const compilePage = compilePageBySourceId.get(node.id)
    if (!compilePage) return node
    return {
      ...node,
      summary: compilePage.summary || node.summary,
      tags: [...compilePage.tags],
      relationHints: [...compilePage.relationHints],
      compilePage,
      updatedAt: now
    }
  })
  const nextTraceNodes = readCharacterBrainTraceNodes(character).map((node) => {
    const compilePage = compilePageBySourceId.get(node.id)
    if (!compilePage) return node
    return {
      ...node,
      summary: compilePage.summary || node.summary,
      note: compilePage.summary || node.note,
      tags: [...compilePage.tags],
      updatedAt: now
    }
  })

  persistRoleBrainImportChanges(character, {
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments),
    ...buildCharacterBrainCognitionNodesChange(nextCognitionNodes),
    ...buildCharacterBrainTraceNodesChange(nextTraceNodes)
  }, t('brain.roleWorkspace.op.deleteDupRelation'))
  emit('import-save-success', t('brain.roleWorkspace.deletedDupRelation', { count: deletedLineCount }))
}

function deferRoleBrainImportSave(task: () => void) {
  if (typeof window === 'undefined') {
    task()
    return
  }
  window.setTimeout(task, 0)
}

function buildRoleBrainSourceQueueKey(characterId: string, section: string, sourceId = '') {
  return ['role-brain', characterId, section || 'unknown', sourceId || 'scope'].join(':')
}

function getRoleBrainSourceUnitIds(sourceIds: string[]) {
  const wanted = new Set(sourceIds.map((sourceId) => String(sourceId || '').trim()).filter(Boolean))
  if (!wanted.size) return []
  return unitView.value.units
    .filter((unit) => wanted.has(String(unit.sourceId || '').trim()))
    .map((unit) => unit.unitId)
}

function getRoleBrainPendingUnitIds(sourceIds: string[], extraUnitIds: string[] = []) {
  return Array.from(new Set([
    ...getRoleBrainSourceUnitIds(sourceIds),
    ...extraUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  ]))
}

function resolveChangedRoleBrainSourceIds(
  beforeNodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[],
  afterNodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
) {
  const beforeById = new Map(beforeNodes.map((node) => [node.id, JSON.stringify(node)] as const))
  const afterById = new Map(afterNodes.map((node) => [node.id, JSON.stringify(node)] as const))
  const ids = new Set<string>()
  beforeById.forEach((value, id) => {
    if (afterById.get(id) !== value) ids.add(id)
  })
  afterById.forEach((value, id) => {
    if (beforeById.get(id) !== value) ids.add(id)
  })
  return Array.from(ids)
}

function markRoleBrainUnitPending(unitIds: string[], status: 'saving' | 'deleting') {
  const ids = unitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!ids.length) return
  pendingRoleBrainUnitStatus.value = {
    ...pendingRoleBrainUnitStatus.value,
    ...Object.fromEntries(ids.map((unitId) => [unitId, status]))
  }
}

function clearRoleBrainUnitPending(unitIds: string[]) {
  const ids = new Set(unitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean))
  if (!ids.size) return
  const next = { ...pendingRoleBrainUnitStatus.value }
  ids.forEach((unitId) => {
    delete next[unitId]
  })
  pendingRoleBrainUnitStatus.value = next
}

function clearMissingRoleBrainPendingUnits() {
  const valid = new Set(unitView.value.units.map((unit) => unit.unitId))
  const next = { ...pendingRoleBrainUnitStatus.value }
  let changed = false
  Object.keys(next).forEach((unitId) => {
    if (!valid.has(unitId)) {
      delete next[unitId]
      changed = true
    }
  })
  if (changed) pendingRoleBrainUnitStatus.value = next
}

async function queueRoleBrainCharacterOperation(options: {
  character: Character
  changes: Partial<Character>
  kind: OperationPatchKind
  section: 'soul' | 'trace'
  sourceIds?: string[]
  pendingUnitIds?: string[]
  pendingStatus?: 'saving' | 'deleting'
  useCommit?: boolean
  metadata?: Record<string, unknown>
}) {
  const sourceIds = options.sourceIds || []
  const pendingUnitIds = options.pendingUnitIds || getRoleBrainSourceUnitIds(sourceIds)
  const queueKey = buildRoleBrainSourceQueueKey(options.character.id, options.section, sourceIds[0])
  return roleBrainOperationQueue.enqueue({
    patch: createOperationPatch({
      kind: options.kind,
      version: 1,
      target: {
        module: 'character-brain',
        scopeId: String(options.character.id || ''),
        unitId: sourceIds[0],
        queueKey
      },
      changes: [{
        type: 'custom',
        label: `role-brain:${options.kind}`,
        payload: {
          sourceIds,
          changes: options.changes
        } as Record<string, unknown>
      }],
      metadata: options.metadata
    }),
    applyLocal: () => {
      if (options.pendingStatus) markRoleBrainUnitPending(pendingUnitIds, options.pendingStatus)
    },
    commit: async () => {
      if (options.useCommit) {
        await characterStore.commitCharacterUpdate(options.character.id, options.changes)
      } else {
        await characterStore.updateCharacter(options.character.id, options.changes)
      }
      return true
    },
    rollback: () => {
      clearRoleBrainUnitPending(pendingUnitIds)
    },
    reconcile: () => {
      clearRoleBrainUnitPending(pendingUnitIds)
    }
  })
}

function persistRoleBrainImportChanges(character: Character, changes: Record<string, unknown>, label: string) {
  if (!Object.keys(changes).length) return
  const hasTraceChange = changes.brainTraceNodes !== undefined || changes.brain_trace_nodes !== undefined
  const section: 'soul' | 'trace' = hasTraceChange ? 'trace' : 'soul'
  const beforeNodes = cloneRoleBrainNodesForSection(character, section)
  const afterCharacter = { ...character, ...changes } as Character
  const afterNodes = section === 'soul'
    ? readCharacterBrainCognitionNodes(afterCharacter)
    : readCharacterBrainTraceNodes(afterCharacter)
  const changedSourceIds = resolveChangedRoleBrainSourceIds(beforeNodes, afterNodes)
  pushRoleBrainHistoryFromNodes({
    character,
    section,
    kind: 'import',
    sourceIds: changedSourceIds,
    beforeNodes,
    afterNodes,
    metadata: { label }
  })
  deferRoleBrainImportSave(() => {
    void queueRoleBrainCharacterOperation({
      character,
      changes: changes as Partial<Character>,
      kind: 'import',
      section,
      sourceIds: changedSourceIds,
      pendingUnitIds: getRoleBrainPendingUnitIds(changedSourceIds),
      pendingStatus: 'saving',
      metadata: { label }
    })
      .then(() => {
        emit('import-save-success', t('brain.roleWorkspace.op.done', { label }))
      })
      .catch((error) => {
        console.error(`${label}失败`, error)
        emit('import-save-error', t('brain.roleWorkspace.op.failed', { label }))
      })
  })
}

function cloneRoleBrainNodesForSection(character: Character, section: 'soul' | 'trace') {
  return section === 'soul'
    ? readCharacterBrainCognitionNodes(character).map((node) => ({ ...node }))
    : readCharacterBrainTraceNodes(character).map((node) => ({ ...node }))
}

function buildRoleBrainNodeChanges(section: 'soul' | 'trace', nodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]) {
  return section === 'soul'
    ? buildCharacterBrainCognitionNodesChange(nodes as CharacterBrainCognitionNode[]) as Partial<Character>
    : buildCharacterBrainTraceNodesChange(nodes as CharacterBrainTraceNode[]) as Partial<Character>
}

function createRoleBrainHistoryPatch(options: {
  character: Character
  section: 'soul' | 'trace'
  kind: OperationPatchKind
  sourceIds?: string[]
  beforeNodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
  afterNodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
  metadata?: Record<string, unknown>
}): RoleBrainHistoryPatch {
  const sourceIds = options.sourceIds || []
  const queueKey = buildRoleBrainSourceQueueKey(options.character.id, options.section, sourceIds[0])
  const sourcePatch = createOperationPatch({
    kind: options.kind,
    version: 1,
    target: {
      module: 'character-brain',
      scopeId: String(options.character.id || ''),
      unitId: sourceIds[0],
      queueKey
    },
    changes: [{
      type: 'custom',
      label: `role-brain-history:${options.kind}`,
      payload: {
        section: options.section,
        sourceIds,
        beforeNodes: options.beforeNodes,
        afterNodes: options.afterNodes
      } as Record<string, unknown>
    }],
    metadata: options.metadata
  })
  const undoPatch = createUndoPatch(sourcePatch, [{
    type: 'custom',
    label: `role-brain-history:undo:${options.kind}`,
    payload: {
      section: options.section,
      sourceIds,
      nodes: options.beforeNodes
    } as Record<string, unknown>
  }])
  const redoPatch = createRedoPatch(sourcePatch, [{
    type: 'custom',
    label: `role-brain-history:redo:${options.kind}`,
    payload: {
      section: options.section,
      sourceIds,
      nodes: options.afterNodes
    } as Record<string, unknown>
  }])
  return { undoPatch, redoPatch }
}

function pushRoleBrainHistoryPatch(patch: RoleBrainHistoryPatch | null | undefined) {
  if (isApplyingRoleBrainHistory.value) return
  if (!patch) return
  roleBrainUndoStack.value = [...roleBrainUndoStack.value.slice(-39), patch]
  roleBrainRedoStack.value = []
}

function pushRoleBrainHistoryFromNodes(options: {
  character: Character
  section: 'soul' | 'trace'
  kind: OperationPatchKind
  sourceIds?: string[]
  beforeNodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
  afterNodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
  metadata?: Record<string, unknown>
}) {
  pushRoleBrainHistoryPatch(createRoleBrainHistoryPatch(options))
}

function resolveRoleBrainHistoryPatchNodes(patch: OperationPatch): {
  section: 'soul' | 'trace'
  nodes: CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
} | null {
  const change = patch.changes.find((item) => item.type === 'custom')
  if (!change || change.type !== 'custom') return null
  const payload = change.payload as {
    section?: unknown
    nodes?: unknown
  }
  const section = payload.section === 'soul' ? 'soul' : payload.section === 'trace' ? 'trace' : ''
  if (!section || !Array.isArray(payload.nodes)) return null
  return {
    section,
    nodes: payload.nodes as CharacterBrainCognitionNode[] | CharacterBrainTraceNode[]
  }
}

async function applyRoleBrainHistoryPatch(patch: OperationPatch) {
  const character = resolveEditableCharacter()
  if (!character) return
  const resolved = resolveRoleBrainHistoryPatchNodes(patch)
  if (!resolved) return
  isApplyingRoleBrainHistory.value = true
  try {
    await queueRoleBrainCharacterOperation({
      character,
      changes: buildRoleBrainNodeChanges(resolved.section, resolved.nodes),
      kind: patch.kind,
      section: resolved.section,
      sourceIds: [String(patch.target.unitId || '')].filter(Boolean),
      pendingStatus: 'saving',
      metadata: {
        historyPatchId: patch.id,
        sourcePatchId: (patch as UndoPatch | RedoPatch).sourcePatchId
      }
    })
  } finally {
    isApplyingRoleBrainHistory.value = false
  }
}

async function undoRoleBrainOps() {
  const previous = roleBrainUndoStack.value[roleBrainUndoStack.value.length - 1]
  if (!previous) return
  roleBrainUndoStack.value = roleBrainUndoStack.value.slice(0, -1)
  roleBrainRedoStack.value = [...roleBrainRedoStack.value, previous]
  await applyRoleBrainHistoryPatch(previous.undoPatch)
}

async function redoRoleBrainOps() {
  const next = roleBrainRedoStack.value[roleBrainRedoStack.value.length - 1]
  if (!next) return
  roleBrainRedoStack.value = roleBrainRedoStack.value.slice(0, -1)
  roleBrainUndoStack.value = [...roleBrainUndoStack.value, next]
  await applyRoleBrainHistoryPatch(next.redoPatch)
}

function toggleAllRoleBrainUnits() {
  if (isAllRoleBrainUnitsExpanded.value) {
    expandedIds.value = new Set()
    return
  }
  expandedIds.value = new Set(allExpandableRoleBrainUnitIds.value)
}

function normalizeRoleBrainPathInput(value: string) {
  return normalizeUnitTreePathInput(value, {
    rootLabel: roleBrainRootPath.value,
    leadingSlash: false,
    trailingSlashWhenRoot: true
  })
}

function sanitizeRoleCreatePathInput() {
  createDialog.value.pathInput = normalizeRoleBrainPathInput(createDialog.value.pathInput)
}

function syncRoleCreateDialogTargetFromInput() {
  const pathInput = normalizeRoleBrainPathInput(createDialog.value.pathInput)
  const pathChanged = pathInput !== createDialog.value.initialPathInput
  const synced = syncUnitTreeCreateTargetFromPath({
    pathInput,
    initialPathInput: createDialog.value.initialPathInput,
    preserveCurrentTarget: Boolean(createDialog.value.parentUnitId) && !pathChanged,
    currentTarget: { parentUnitId: createDialog.value.parentUnitId },
    normalizePathInput: normalizeRoleBrainPathInput,
    resolveTarget: (normalizedPath) => ({ parentUnitId: resolveRoleBrainCreateParentUnitIdFromPath(normalizedPath) })
  })
  createDialog.value = {
    ...createDialog.value,
    pathInput: synced.pathInput,
    initialPathInput: synced.pathInput,
    parentUnitId: String(synced.target.parentUnitId || '')
  }
}

function resolveRoleBrainCreationParentUnitId(kind: RoleBrainCreateKind = 'leaf') {
  const candidates = [
    roleUnitSelection.selectedIds.value.length === 1 ? roleUnitSelection.selectedIds.value[0] : '',
    props.activeUnitId || '',
    unitView.value.units.find((unit) => unit.unitType === 'soul')?.unitId || ''
  ].filter(Boolean)
  return candidates.find((unitId) => kind === 'branch'
    ? canCreateRoleBrainBranchUnder(unitId)
    : canCreateRoleBrainLeafUnder(unitId)
  ) || ''
}

function resolveRoleBrainToolbarContextUnit() {
  const selectedId = roleUnitSelection.selectedIds.value.length === 1
    ? roleUnitSelection.selectedIds.value[0]
    : ''
  return unitById.value.get(selectedId) || unitById.value.get(props.activeUnitId || '') || null
}

function resolveRoleBrainToolbarCreateTarget(kind: RoleBrainCreateKind = 'leaf') {
  const selectedId = roleUnitSelection.selectedIds.value.length === 1
    ? roleUnitSelection.selectedIds.value[0]
    : ''
  const selectedUnit = selectedId ? unitById.value.get(selectedId) : null
  const contextUnit = resolveRoleBrainToolbarContextUnit()
  if (selectedUnit && getRoleBrainUnitSection(selectedUnit) === 'soul' && isEditableRoleBrainUnit(selectedUnit)) {
    const parentUnitId = String(selectedUnit.parentId || '')
    const parentUnit = parentUnitId ? unitById.value.get(parentUnitId) : null
    const canUseSameLevel = parentUnit && canCreateRoleBrainLeafUnder(parentUnitId)
    if (canUseSameLevel) {
      return {
        parentUnitId,
        pathInput: resolveRoleBrainCreationPathInput(parentUnitId),
        insertAfterSourceId: String(selectedUnit.sourceId || '').trim(),
        insertParentUnitId: parentUnitId
      }
    }
  }
  if (kind === 'branch' && contextUnit && getRoleBrainUnitSection(contextUnit) === 'trace') {
    if (contextUnit.unitType === 'trace' && canCreateRoleBrainBranchUnder(contextUnit.unitId)) {
      return {
        parentUnitId: contextUnit.unitId,
        pathInput: resolveRoleBrainCreationPathInput(contextUnit.unitId),
        insertAfterSourceId: '',
        insertParentUnitId: ''
      }
    }
    const parentUnitId = String(contextUnit.parentId || '')
    const parentUnit = parentUnitId ? unitById.value.get(parentUnitId) : null
    if (parentUnit && canCreateRoleBrainBranchUnder(parentUnitId)) {
      return {
        parentUnitId,
        pathInput: resolveRoleBrainCreationPathInput(parentUnitId),
        insertAfterSourceId: selectedUnit ? String(contextUnit.sourceId || '').trim() : '',
        insertParentUnitId: parentUnitId
      }
    }
  }
  if (kind === 'leaf' && contextUnit && getRoleBrainUnitSection(contextUnit) === 'trace' && contextUnit.unitType !== 'traceDay' && contextUnit.unitType !== 'traceEvent' && contextUnit.unitType !== 'traceArrangement') {
    if (contextUnit.unitType === 'traceGroup' && canCreateRoleBrainLeafUnder(contextUnit.unitId)) {
      return {
        parentUnitId: contextUnit.unitId,
        pathInput: resolveRoleBrainCreationPathInput(contextUnit.unitId),
        insertAfterSourceId: '',
        insertParentUnitId: ''
      }
    }
    const parentUnitId = String(contextUnit.parentId || '')
    const parentUnit = parentUnitId ? unitById.value.get(parentUnitId) : null
    if (parentUnit && canCreateRoleBrainLeafUnder(parentUnitId)) {
      return {
        parentUnitId,
        pathInput: resolveRoleBrainCreationPathInput(parentUnitId),
        insertAfterSourceId: selectedUnit ? String(contextUnit.sourceId || '').trim() : '',
        insertParentUnitId: parentUnitId
      }
    }
  }
  const parentUnitId = resolveRoleBrainCreationParentUnitId(kind)
  return {
    parentUnitId,
    pathInput: resolveRoleBrainCreationPathInput(parentUnitId),
    insertAfterSourceId: '',
    insertParentUnitId: ''
  }
}

function resolveRoleBrainCreationPathInput(parentUnitId = '') {
  const unitId = parentUnitId || resolveRoleBrainCreationParentUnitId()
  const unit = unitId ? unitById.value.get(unitId) : null
  if (unit && (getRoleBrainUnitSection(unit) === 'soul' || getRoleBrainUnitSection(unit) === 'trace')) {
    return getUnitPath(unit.unitId)
  }
  return `${roleBrainRootPath.value}/`
}

function openRoleBrainCreateDialogFromToolbar(kind: RoleBrainCreateKind) {
  const target = resolveRoleBrainToolbarCreateTarget(kind)
  const pathInput = normalizeRoleBrainPathInput(target.pathInput)
  const targetSection = getRoleBrainCreateTargetSection(target.parentUnitId)
  if (targetSection === 'trace') {
    openTraceCreateDialog(target.parentUnitId, pathInput, {
      insertAfterSourceId: target.insertAfterSourceId,
      insertParentUnitId: target.insertParentUnitId
    })
    return
  }
  createDialog.value = {
    ...createEmptyRoleBrainCreateDialog(),
    open: true,
    kind,
    parentUnitId: target.parentUnitId,
    pathInput,
    initialPathInput: pathInput,
    title: kind === 'branch' ? t('brain.roleWorkspace.newBranchTitle') : t('brain.roleWorkspace.newLeafTitle'),
    date: '',
    insertAfterSourceId: target.insertAfterSourceId,
    insertParentUnitId: target.insertParentUnitId
  }
}

function closeCreateDialog() {
  createDialog.value = createEmptyRoleBrainCreateDialog()
}

function openTraceCreateDialog(parentUnitId: string, pathInput: string, options: { insertAfterSourceId?: string; insertParentUnitId?: string } = {}) {
  const draft = resolveTraceCreateDialogDefaultDraft(options.insertAfterSourceId)
  const initial = createEmptyRoleBrainCreateDialog()
  const nextGranularity = resolveDefaultTraceCreateGranularity(parentUnitId)
  const selectedYear = draft.year ? [draft.year] : []
  const selectedMonth = draft.year && draft.month ? [`${String(Number(draft.year)).padStart(4, '0')}-${String(Number(draft.month)).padStart(2, '0')}`] : []
  createDialog.value = {
    ...initial,
    open: true,
    kind: 'leaf',
    parentUnitId,
    pathInput,
    initialPathInput: pathInput,
    title: '',
    date: draft.date,
    traceYear: draft.year,
    traceMonth: draft.month,
    traceGranularity: nextGranularity,
    traceSelectedYears: selectedYear,
    traceSelectedMonths: selectedMonth,
    traceSelectedDates: draft.date ? [draft.date] : [],
    insertAfterSourceId: options.insertAfterSourceId || '',
    insertParentUnitId: options.insertParentUnitId || ''
  }
}

function resolveDefaultTraceCreateGranularity(parentUnitId: string): TraceCreateGranularity {
  const allowed = new Set(resolveTraceCreateGranularitiesForParent(parentUnitId))
  if (allowed.has('day')) return 'day'
  if (allowed.has('month')) return 'month'
  return 'year'
}

function resolveTraceCreateGranularitiesForParent(parentUnitId: string): TraceCreateGranularity[] {
  const parentUnit = unitById.value.get(String(parentUnitId || '').trim())
  const systemRole = parentUnit?.metadata?.systemRole
  if (systemRole === 'monthBranch') return ['day']
  if (systemRole === 'yearBranch') return ['day', 'month']
  return ['day', 'month', 'year']
}

function setTraceCreateGranularity(granularity: TraceCreateGranularity) {
  if (!traceCreateAllowedGranularities.value.includes(granularity)) return
  createDialog.value.traceGranularity = granularity
  createDialog.value.traceStep = 1
}

function selectTraceCreateYear(selection: LanghuanCalendarSelection) {
  if (!selection.year) return
  const year = String(selection.year)
  createDialog.value.traceYear = year
  if (createDialog.value.traceGranularity === 'year') {
    if (!createDialog.value.traceSelectedYears.length) createDialog.value.traceSelectedYears = [year]
  } else {
    createDialog.value.traceSelectedYears = [year]
  }
  createDialog.value.traceSelectedMonths = createDialog.value.traceSelectedMonths.filter((value) => value.startsWith(`${year.padStart(4, '0')}-`))
  createDialog.value.traceSelectedDates = createDialog.value.traceSelectedDates.filter((value) => value.startsWith(`${year.padStart(4, '0')}-`))
}

function updateTraceCreateYears(payload: { values: string[] }) {
  const years = payload.values.map((value) => String(Number(value) || '').trim()).filter(Boolean)
  createDialog.value.traceSelectedYears = years
  if (years[0]) createDialog.value.traceYear = years[0]
}

function selectTraceCreateMonth(selection: LanghuanCalendarSelection) {
  if (!selection.year || !selection.month) return
  const value = `${String(selection.year).padStart(4, '0')}-${String(selection.month).padStart(2, '0')}`
  createDialog.value.traceYear = String(selection.year)
  createDialog.value.traceMonth = String(selection.month)
  if (!createDialog.value.traceSelectedMonths.length) createDialog.value.traceSelectedMonths = [value]
}

function updateTraceCreateMonths(payload: { values: string[] }) {
  createDialog.value.traceSelectedMonths = payload.values
  const selected = parseTraceMonthSelection(payload.values[0])
  if (selected) {
    createDialog.value.traceYear = String(selected.year)
    createDialog.value.traceMonth = String(selected.month)
  }
}

function selectTraceCreateDay(selection: LanghuanCalendarSelection) {
  if (!selection.date) return
  createDialog.value.date = selection.date
  if (!createDialog.value.traceSelectedDates.length) createDialog.value.traceSelectedDates = [selection.date]
}

function updateTraceCreateDates(payload: { values: string[] }) {
  createDialog.value.traceSelectedDates = payload.values
  if (payload.values[0]) createDialog.value.date = payload.values[0]
}

function goBackTraceCreateStep() {
  createDialog.value.traceStep = Math.max(1, createDialog.value.traceStep - 1)
}

function parseTraceMonthSelection(value: string) {
  const match = String(value || '').match(/^(\d{1,6})-(\d{1,2})$/)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) }
}

function buildTraceDisabledDatesForMonth(year: number, month: number) {
  const character = resolveEditableCharacter()
  if (!character) return []
  const meta = readCharacterBrainTrajectoryMeta(character)
  const range = resolveTraceCreateContextRange(createDialog.value.parentUnitId)
  const minDate = String(range.minDate || meta.birthDate || '').trim()
  const maxDate = String(range.maxDate || '').trim()
  const birthDate = String(meta.birthDate || '').trim()
  const min = [minDate, birthDate].filter(Boolean).sort().slice(-1)[0] || ''
  const monthState = buildTrajectoryCalendarMonthState({
    year,
    month,
    calendarConfig: meta.calendarConfig || {},
    selectedDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
  })
  return monthState.dates
    .map((date) => date.date)
    .filter((date) => (min && date < min) || (maxDate && date > maxDate))
}

function resolveTraceCreateContextRange(parentUnitId: string) {
  const parentUnit = unitById.value.get(String(parentUnitId || '').trim())
  const sourceId = String(parentUnit?.sourceId || '').trim()
  const character = resolveEditableCharacter()
  const parentTrace = character
    ? readCharacterBrainTraceNodes(character).find((node) => String(node.id || '') === sourceId)
    : null
  const minDate = String(parentTrace?.startDate || parentTrace?.pointDate || '').trim()
  const maxDate = String(parentTrace?.endDate || parentTrace?.pointDate || '').trim()
  return {
    minDate: minDate || '0001-01-01',
    maxDate: maxDate || '9999-12-31'
  }
}

async function confirmCreateRoleBrainUnit() {
  if (!createDialogCanSubmit.value) return
  syncRoleCreateDialogTargetFromInput()
  if (createDialogTargetSection.value === 'trace' && !isTraceCreateLastStep.value) {
    createDialog.value.traceStep = Math.min(traceCreateStepperSteps.value.length, createDialog.value.traceStep + 1)
    return
  }
  const draft = { ...createDialog.value }
  closeCreateDialog()
  window.setTimeout(() => {
    void createRoleBrainUnit(draft.parentUnitId, draft.kind, draft.title, draft)
      .then((createdSourceId) => {
        if (createdSourceId) emit('open-created-unit', createdSourceId)
      })
      .catch((error) => {
        console.error('创建角色页单位失败:', error)
      })
  }, 0)
}

function openRenameDialog(unitId: string) {
  const unit = unitById.value.get(unitId)
  if (!unit || !isEditableRoleBrainUnit(unit)) return
  renameDialog.value = {
    open: true,
    unitId,
    title: unit.title || ''
  }
}

function closeRenameDialog() {
  renameDialog.value = { open: false, unitId: '', title: '' }
}

async function confirmRenameRoleBrainUnit() {
  if (!renameDialogCanSubmit.value) return
  const character = resolveEditableCharacter()
  const unit = unitById.value.get(renameDialog.value.unitId)
  if (!character || !unit || !isEditableRoleBrainUnit(unit)) return
  const sourceId = String(unit.sourceId || '').trim()
  if (!sourceId) return
  const nextTitle = renameDialog.value.title.trim()
  closeRenameDialog()
  const now = new Date().toISOString()
  const section = getRoleBrainUnitSection(unit) as 'soul' | 'trace'
  const beforeNodes = cloneRoleBrainNodesForSection(character, section)
  const changes = section === 'soul'
    ? updateCharacterBrainSoulTreeNode(character, sourceId, { title: nextTitle, now })
    : updateCharacterBrainTraceTreeNode(character, sourceId, { title: nextTitle, now })
  const afterNodes = section === 'soul'
    ? readCharacterBrainCognitionNodes({ ...character, ...changes } as Character)
    : readCharacterBrainTraceNodes({ ...character, ...changes } as Character)
  pushRoleBrainHistoryFromNodes({
    character,
    section,
    kind: 'rename',
    sourceIds: [sourceId],
    beforeNodes,
    afterNodes,
    metadata: { title: nextTitle }
  })
  await queueRoleBrainCharacterOperation({
    character,
    changes: changes as Partial<Character>,
    kind: 'rename',
    section,
    sourceIds: [sourceId],
    pendingUnitIds: [unit.unitId],
    pendingStatus: 'saving',
    metadata: { title: nextTitle }
  })
}

function openDeleteConfirm(rowId: string, selectedUnits?: UnitView[]) {
  const units = (selectedUnits?.length ? selectedUnits : getSelectedUnitsForMenu(rowId))
    .filter(isEditableRoleBrainUnit)
    .filter((unit, index, array) => array.findIndex((item) => item.unitId === unit.unitId) === index)
  if (!units.length) return
  const referenceCount = units.filter(isDocumentReferenceRoleBrainUnit).length
  const title = units.length > 1
    ? t('brain.roleWorkspace.deleteUnitsMultiTitle', { count: units.length })
    : t('brain.roleWorkspace.deleteUnitSingleTitle', { title: units[0]?.title || t('brain.roleWorkspace.unnamedUnit') })
  const referenceMessage = referenceCount > 0
    ? t('brain.roleWorkspace.deleteRefNote', { count: referenceCount })
    : ''
  deleteConfirm.value = {
    open: true,
    rowId,
    unitIds: units.map((unit) => unit.unitId),
    title,
    message: [
      units.length > 1 ? t('brain.roleWorkspace.deleteUnitsMultiBody') : t('brain.roleWorkspace.deleteUnitSingleBody'),
      referenceMessage,
      t('brain.roleWorkspace.deleteIrreversible')
    ].filter(Boolean).join('\n')
  }
}

function closeDeleteConfirm() {
  deleteConfirm.value = { open: false, rowId: '', unitIds: [], title: '', message: '' }
}

async function confirmDeleteRoleBrainUnits() {
  const character = resolveEditableCharacter()
  const units = deleteConfirm.value.unitIds
    .map((unitId) => unitById.value.get(unitId))
    .filter((unit): unit is UnitView => Boolean(unit))
    .filter(isEditableRoleBrainUnit)
  closeDeleteConfirm()
  if (!character || !units.length) return
  const roots = units.filter((unit) => !units.some((other) => other.unitId !== unit.unitId && isUnitDescendantOf(unit.unitId, other.unitId)))
  let nextChanges: Record<string, unknown> = {}
  let workingCharacter = character
  roots.forEach((unit) => {
    const sourceId = String(unit.sourceId || '').trim()
    if (!sourceId) return
    const changes = getRoleBrainUnitSection(unit) === 'soul'
      ? deleteCharacterBrainSoulTreeNode(workingCharacter, sourceId)
      : deleteCharacterBrainTraceTreeNode(workingCharacter, sourceId)
    nextChanges = { ...nextChanges, ...changes }
    workingCharacter = { ...workingCharacter, ...changes } as Character
  })
  if (!Object.keys(nextChanges).length) return
  const section = getRoleBrainUnitSection(roots[0]) as 'soul' | 'trace'
  const beforeNodes = cloneRoleBrainNodesForSection(character, section)
  const afterNodes = section === 'soul'
    ? readCharacterBrainCognitionNodes(workingCharacter)
    : readCharacterBrainTraceNodes(workingCharacter)
  const pendingUnitIds = roots.flatMap((unit) => [unit.unitId, ...collectDescendantUnitIds(unit.unitId)])
  const sourceIds = roots.map((unit) => String(unit.sourceId || '').trim()).filter(Boolean)
  pushRoleBrainHistoryFromNodes({
    character,
    section,
    kind: 'delete',
    sourceIds,
    beforeNodes,
    afterNodes,
    metadata: { deletedCount: roots.length }
  })
  await queueRoleBrainCharacterOperation({
    character,
    changes: nextChanges as Partial<Character>,
    kind: 'delete',
    section,
    sourceIds,
    pendingUnitIds,
    pendingStatus: 'deleting',
    useCommit: true,
    metadata: { deletedCount: roots.length }
  })
  roleUnitSelection.clearSelection()
  roleUnitSelection.closeMenu()
  clearFloatingMenuPosition()
  clearRoleBrainClipboard()
}

function buildRoleBrainClipboard(units: UnitView[], mode: 'copy' | 'cut'): RoleBrainClipboardState | null {
  const unique = units
    .filter(isEditableRoleBrainUnit)
    .filter((unit, index, array) => array.findIndex((item) => item.unitId === unit.unitId) === index)
  const roots = unique.filter((unit) => !unique.some((other) => other.unitId !== unit.unitId && isUnitDescendantOf(unit.unitId, other.unitId)))
  const entries = roots.map((unit) => ({
    section: getRoleBrainUnitSection(unit) as 'soul' | 'trace',
    unitId: unit.unitId,
    sourceId: String(unit.sourceId || '').trim(),
    title: unit.title || t('brain.graphPreview.unnamedNode')
  })).filter((entry) => entry.section && entry.sourceId)
  if (!entries.length) return null
  return {
    mode,
    unitIds: entries.map((entry) => entry.unitId),
    labels: entries.map((entry) => entry.title),
    entries
  }
}

function setRoleBrainClipboard(state: RoleBrainClipboardState) {
  roleBrainClipboard.value = {
    mode: state.mode,
    unitIds: [...state.unitIds],
    labels: [...state.labels],
    entries: state.entries.map((entry) => ({ ...entry }))
  }
  emit('clipboard-change', { mode: roleBrainClipboard.value.mode, unitIds: [...roleBrainClipboard.value.unitIds] })
}

function clearRoleBrainClipboard() {
  roleBrainClipboard.value = { mode: '', unitIds: [], labels: [], entries: [] }
  emit('clipboard-change', { mode: '', unitIds: [] })
}

function isRoleBrainClipboardPending(unitId: string) {
  return roleBrainClipboard.value.mode === 'cut' && roleBrainClipboard.value.unitIds.includes(unitId)
}

function canPasteRoleBrainClipboardInto(unitId: string) {
  if (!hasRoleBrainClipboardData.value) return false
  const target = unitById.value.get(unitId)
  if (!target) return false
  const targetSection = getRoleBrainUnitSection(target)
  if (!targetSection) return false
  if (roleBrainClipboard.value.entries.some((entry) => entry.section !== targetSection)) return false
  if (targetSection === 'trace' && (target.unitType === 'traceEvent' || target.unitType === 'traceArrangement')) return false
  if (roleBrainClipboard.value.mode === 'cut' && roleBrainClipboard.value.entries.some((entry) => (
    entry.unitId === target.unitId || isUnitDescendantOf(target.unitId, entry.unitId)
  ))) return false
  return Boolean(resolveEditableCharacter())
}

function canImportWorldTreeInto(unitId: string) {
  const target = unitById.value.get(unitId)
  if (!target) return false
  if (!resolveEditableCharacter()) return false
  if (!characterStore.documents.length) return false
  return target.unitType === 'soul' || target.unitType === 'soulNode'
}

function canCreateRoleBrainLeafUnder(unitId: string) {
  const target = unitById.value.get(unitId)
  if (!target) return false
  if (!resolveEditableCharacter()) return false
  if (target.unitType === 'soul' || target.unitType === 'soulNode') return true
  return target.unitType === 'trace' || target.unitType === 'traceGroup' || target.unitType === 'traceDay'
}

function canCreateRoleBrainBranchUnder(unitId: string) {
  const target = unitById.value.get(unitId)
  if (!target) return false
  if (!resolveEditableCharacter()) return false
  if (target.unitType === 'soul' || target.unitType === 'soulNode') return true
  if (target.unitType === 'traceGroup' && target.metadata?.systemRole === 'monthBranch') return false
  return target.unitType === 'trace' || target.unitType === 'traceGroup'
}

function canCreateTraceRoleBrainUnitUnder(unitId: string) {
  const target = unitById.value.get(unitId)
  if (!target) return false
  if (!resolveEditableCharacter()) return false
  return getRoleBrainUnitSection(target) === 'trace'
    && target.unitType !== 'traceDay'
    && target.unitType !== 'traceEvent'
    && target.unitType !== 'traceArrangement'
}

function canCreateTraceDocumentUnder(unitId: string) {
  const target = unitById.value.get(unitId)
  if (!target) return false
  if (!resolveEditableCharacter()) return false
  return target.unitType === 'traceDay'
}

function getRoleBrainCreateTargetSection(unitId: string): 'soul' | 'trace' | '' {
  const target = unitById.value.get(String(unitId || '').trim())
  if (!target) return ''
  return getRoleBrainUnitSection(target)
}

function getRoleBrainPrimaryCreateContextSection(): 'soul' | 'trace' | '' {
  const selectedId = roleUnitSelection.selectedIds.value.length === 1 ? roleUnitSelection.selectedIds.value[0] : ''
  const activeId = props.activeUnitId || ''
  const unit = unitById.value.get(selectedId) || unitById.value.get(activeId)
  return unit ? getRoleBrainUnitSection(unit) : ''
}

function resolveRoleBrainCreateSectionFromPath(rawPath: string): 'soul' | 'trace' | '' {
  const segments = getRoleBrainCreatePathSegments(rawPath)
  if (segments[0] === '轨迹') return 'trace'
  if (segments[0] === '灵魂' || !segments.length) return 'soul'
  return ''
}

function resolveRoleBrainCreateParentUnitIdFromPath(rawPath: string) {
  const segments = getRoleBrainCreatePathSegments(rawPath)
  if (!segments.length) return unitView.value.units.find((unit) => unit.unitType === 'soul')?.unitId || ''
  if (segments[0] === '轨迹') {
    let parentUnit = unitView.value.units.find((unit) => unit.unitType === 'trace')
    for (const segment of segments.slice(1)) {
      if (!parentUnit) return ''
      const next = (childrenByParentId.value.get(parentUnit.unitId) || []).find((unit) => (
        unit.unitType === 'traceGroup' && unit.title === segment
      ))
      if (!next) return ''
      parentUnit = next
    }
    return parentUnit?.unitId || ''
  }
  if (segments[0] === '核心') return ''
  let soulSegments = segments[0] === '灵魂' ? segments.slice(1) : segments
  let parentUnit = unitView.value.units.find((unit) => unit.unitType === 'soul')
  for (const segment of soulSegments) {
    if (!parentUnit) return ''
    const next = (childrenByParentId.value.get(parentUnit.unitId) || []).find((unit) => (
      unit.unitType === 'soulNode' && unit.title === segment && unit.contentKind === 'group'
    ))
    if (!next) return ''
    parentUnit = next
  }
  return parentUnit?.unitId || ''
}

function getRoleBrainCreatePathSegments(rawPath: string) {
  const normalizedPath = normalizeRoleBrainPathInput(rawPath)
  const root = roleBrainRootPath.value
  const pathSegments = normalizedPath
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
  return pathSegments[0] === root ? pathSegments.slice(1) : pathSegments
}

function canImportCompilePageMarkdownInto(unitIds: string | string[]) {
  if (!resolveEditableCharacter()) return false
  return buildRoleBrainCompilePageImportTargets(unitIds).size > 0
}

function canImportRoleBrainBodyMarkdownInto(unitIds: string | string[]) {
  if (!resolveEditableCharacter()) return false
  return buildRoleBrainBodyImportTargets(unitIds).size > 0 || isSingleTrajectoryRootImport(unitIds)
}

function buildRoleBrainCoreFieldImportTargets(rootUnitIds: string | string[]) {
  const rootIds = new Set(normalizeUnitIdsInput(rootUnitIds).flatMap((unitId) => [unitId, ...collectDescendantUnitIds(unitId)]))
  const targetByFieldKey = new Map<CharacterBrainFieldKey, { sourceId: string; unit: UnitView }>()
  rootIds.forEach((unitId) => {
    const unit = unitById.value.get(unitId)
    if (!unit || unit.unitType !== 'coreField') return
    const fieldKey = String(unit.metadata?.fieldKey || '').trim() as CharacterBrainFieldKey
    const sourceId = String(unit.sourceId || '').trim()
    if (!fieldKey || !sourceId) return
    targetByFieldKey.set(fieldKey, { sourceId, unit })
  })
  return targetByFieldKey
}

function buildRoleBrainCoreDocumentImportTargets(rootUnitIds: string | string[]) {
  const rootIds = new Set(normalizeUnitIdsInput(rootUnitIds).flatMap((unitId) => [unitId, ...collectDescendantUnitIds(unitId)]))
  const targetBySourceId = new Map<string, { sourceId: string; unit: UnitView }>()
  rootIds.forEach((unitId) => {
    const unit = unitById.value.get(unitId)
    const sourceId = String(unit?.sourceId || '').trim()
    if (!unit || unit.unitType !== 'coreField' || !sourceId) return
    if (unit.contentKind !== 'markdown') return
    targetBySourceId.set(sourceId, { sourceId, unit })
  })
  return targetBySourceId
}

function isCharacterCoreRootImportScope(rootUnitIds: string | string[]) {
  return normalizeUnitIdsInput(rootUnitIds).some((unitId) => unitById.value.get(unitId)?.unitType === 'core')
}

function canSortRoleBrainLayer(unitId: string) {
  return Boolean(resolveRoleBrainSortDialogDraft(unitId))
}

function canSortSelectedRoleBrainLayer(units: UnitView[]) {
  if (units.length <= 1) return false
  const firstParentId = String(units[0]?.parentId || '')
  if (!firstParentId) return false
  return units.every((unit) => (
    isEditableRoleBrainUnit(unit)
    && String(unit.parentId || '') === firstParentId
  )) && Boolean(resolveRoleBrainSortDialogDraft(units[0].unitId, units.map((unit) => unit.unitId)))
}

async function createRoleBrainUnit(
  parentUnitId: string,
  kind: RoleBrainCreateKind,
  rawTitle: string,
  draft = createDialog.value
) {
  const startedAt = getRoleBrainPerformanceNow()
  const character = resolveEditableCharacter()
  if (!character) return ''
  let section = 'unknown'
  let createdCount = 0
  const normalizedTitle = String(rawTitle || '').trim()
  const now = new Date().toISOString()
  try {
    const prepared = measureSync('roleBrain.create.prepareParent', () => prepareRoleBrainCreateParent(character, draft.pathInput, now, parentUnitId), {
      parentUnitId,
      kind
    }, 10)
    if (!prepared) return ''
    section = prepared.section
    if (prepared.section === 'trace') {
      const range = resolveTraceCreateContextRange(draft.parentUnitId)
      const result = measureSync('roleBrain.create.traceCommand', () => createCharacterBrainTraceBatchTreeNodes(character, {
        granularity: draft.traceGranularity,
        years: draft.traceSelectedYears,
        year: draft.traceYear,
        months: draft.traceSelectedMonths.map((value) => parseTraceMonthSelection(value)?.month || '').filter(Boolean),
        dates: draft.traceSelectedDates,
        minDate: range.minDate,
        maxDate: range.maxDate,
        subtitle: normalizedTitle,
        summary: normalizedTitle,
        content: '',
        now
      }), {
        granularity: draft.traceGranularity,
        years: draft.traceSelectedYears.length,
        months: draft.traceSelectedMonths.length,
        dates: draft.traceSelectedDates.length
      }, 10)
      if (!result.ok) return ''
      createdCount = result.createdItems.length
      const beforeNodes = cloneRoleBrainNodesForSection(character, 'trace')
      const afterNodes = readCharacterBrainTraceNodes({ ...character, ...result.changes } as Character)
      pushRoleBrainHistoryFromNodes({
        character,
        section: 'trace',
        kind: 'create',
        sourceIds: result.createdItems.map((item) => item.nodeId),
        beforeNodes,
        afterNodes,
        metadata: {
          granularity: draft.traceGranularity,
          createdCount
        }
      })
      await measureAsync('roleBrain.create.persist', () => queueRoleBrainCharacterOperation({
        character,
        changes: result.changes as Partial<Character>,
        kind: 'create',
        section: 'trace',
        sourceIds: result.createdItems.map((item) => item.nodeId),
        pendingStatus: 'saving',
        metadata: {
          granularity: draft.traceGranularity,
          createdCount
        }
      }), {
        section,
        createdCount
      }, 40)
      expandedIds.value = new Set([...expandedIds.value, ...prepared.expandedUnitIds, parentUnitId].filter(Boolean))
      return result.createdItems[0]?.nodeId || result.skippedItems[0]?.nodeId || ''
    }
    const title = normalizedTitle || (kind === 'branch' ? t('brain.roleWorkspace.newBranchTitle') : t('brain.roleWorkspace.newLeafTitle'))
    const nextNode = {
      id: createCognitionNodeId(),
      title,
      summary: '',
      parentId: prepared.parentId,
      kind: kind === 'branch' ? 'group' as const : 'private' as const,
      createdAt: now,
      updatedAt: now
    }
    const shouldInsertAfter = Boolean(
      createDialog.value.insertAfterSourceId
        && createDialog.value.insertParentUnitId === parentUnitId
        && prepared.parentId === String(unitById.value.get(parentUnitId)?.sourceId || '').trim()
    )
    const targetIndex = shouldInsertAfter
      ? prepared.nodes.findIndex((node) => node.id === createDialog.value.insertAfterSourceId && node.parentId === prepared.parentId)
      : -1
    const nextNodes = [...prepared.nodes]
    if (targetIndex >= 0) {
      nextNodes.splice(targetIndex + 1, 0, nextNode)
    } else {
      nextNodes.push(nextNode)
    }
    createdCount = 1
    const beforeNodes = cloneRoleBrainNodesForSection(character, 'soul')
    pushRoleBrainHistoryFromNodes({
      character,
      section: 'soul',
      kind: 'create',
      sourceIds: [nextNode.id],
      beforeNodes,
      afterNodes: nextNodes,
      metadata: {
        parentId: prepared.parentId,
        kind
      }
    })
    await measureAsync('roleBrain.create.persist', () => queueRoleBrainCharacterOperation({
      character,
      changes: buildCharacterBrainCognitionNodesChange(nextNodes) as Partial<Character>,
      kind: 'create',
      section: 'soul',
      sourceIds: [nextNode.id],
      pendingStatus: 'saving',
      metadata: {
        parentId: prepared.parentId,
        kind
      }
    }), {
      section,
      createdCount,
      cognitionNodes: nextNodes.length
    }, 40)
    expandedIds.value = new Set([...expandedIds.value, ...prepared.expandedUnitIds, parentUnitId].filter(Boolean))
    return nextNode.id
  } finally {
    reportDuration('roleBrain.create.total', startedAt, {
      section,
      createdCount,
      kind
    }, 40)
  }
}

function getRoleBrainPerformanceNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function prepareRoleBrainCreateParent(character: Character, rawPath: string, now: string, stableParentUnitId = '') {
  const stableParent = prepareRoleBrainCreateParentFromStableUnit(character, stableParentUnitId, now)
  if (stableParent) return stableParent
  const root = roleBrainRootPath.value
  const normalizedPath = normalizeRoleBrainPathInput(rawPath)
  const pathSegments = normalizedPath
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
  let segments = pathSegments[0] === root ? pathSegments.slice(1) : pathSegments
  if (segments[0] === '轨迹') return prepareTraceCreateParentFromPath(segments.slice(1))
  if (segments[0] === '灵魂') segments = segments.slice(1)
  if (segments[0] === '核心') return null
  let nodes = readCharacterBrainCognitionNodes(character).map((node) => ({ ...node }))
  let parentId = SOUL_ROOT_SOURCE_ID
  const expandedUnitIds: string[] = []
  for (const segment of segments) {
    let existing = nodes.find((node) => node.parentId === parentId && node.title === segment)
    if (!existing) {
      existing = {
        id: createCognitionNodeId(),
        title: segment,
        summary: '',
        parentId,
        kind: 'group',
        createdAt: now,
        updatedAt: now
      }
      nodes = [...nodes, existing]
    } else if (existing.kind !== 'group') {
      const overviewId = createCognitionNodeId()
      nodes = nodes.map((node) => node.id === existing?.id
        ? { ...node, kind: 'group' as const, updatedAt: now }
        : node)
      nodes = [
        ...nodes,
        {
          ...existing,
          id: overviewId,
          title: `${existing.title || t('brain.graphPreview.unnamedNode')}_总览`,
          parentId: existing.id,
          kind: 'private',
          createdAt: now,
          updatedAt: now,
          pendingReview: undefined
        }
      ]
    }
    parentId = existing.id
    const unit = unitView.value.units.find((item) => String(item.sourceId || '') === parentId)
    if (unit?.unitId) expandedUnitIds.push(unit.unitId)
  }
  return { section: 'soul' as const, nodes, parentId, expandedUnitIds }
}

function prepareRoleBrainCreateParentFromStableUnit(character: Character, parentUnitId: string, now: string) {
  const unit = parentUnitId ? unitById.value.get(parentUnitId) : null
  if (!unit) return null
  if (getRoleBrainUnitSection(unit) === 'trace') {
    if (unit.unitType === 'trace') {
      return { section: 'trace' as const, parentId: TRACE_ROOT_SOURCE_ID, expandedUnitIds: [unit.unitId] }
    }
    if (unit.unitType === 'traceGroup') {
      const targetId = String(unit.sourceId || '').trim()
      return targetId ? { section: 'trace' as const, parentId: targetId, expandedUnitIds: [unit.unitId] } : null
    }
    return null
  }
  if (getRoleBrainUnitSection(unit) !== 'soul') return null
  let nodes = readCharacterBrainCognitionNodes(character).map((node) => ({ ...node }))
  if (unit.unitType === 'soul') {
    return { section: 'soul' as const, nodes, parentId: SOUL_ROOT_SOURCE_ID, expandedUnitIds: [unit.unitId] }
  }
  const targetId = String(unit.sourceId || '').trim()
  const targetNode = nodes.find((node) => node.id === targetId)
  if (!targetId || !targetNode) return null
  if (targetNode.kind !== 'group') {
    const overviewId = createCognitionNodeId()
    nodes = nodes.map((node) => node.id === targetId
      ? { ...node, kind: 'group' as const, updatedAt: now }
      : node)
    nodes.push({
      ...targetNode,
      id: overviewId,
      title: `${targetNode.title || t('brain.graphPreview.unnamedNode')}_总览`,
      parentId: targetId,
      kind: 'private',
      createdAt: now,
      updatedAt: now,
      pendingReview: undefined
    })
  }
  return { section: 'soul' as const, nodes, parentId: targetId, expandedUnitIds: [unit.unitId] }
}

function prepareTraceCreateParentFromPath(segments: string[]) {
  let parentUnit: UnitView | undefined = unitView.value.units.find((unit) => unit.unitType === 'trace')
  if (!parentUnit) return null
  const expandedUnitIds = [parentUnit.unitId]
  for (const segment of segments) {
    const currentParent: UnitView = parentUnit
    const nextUnit: UnitView | undefined = (childrenByParentId.value.get(currentParent.unitId) || []).find((unit) => (
      unit.unitType === 'traceGroup' && unit.title === segment
    ))
    if (!nextUnit) return null
    parentUnit = nextUnit
    expandedUnitIds.push(parentUnit.unitId)
  }
  if (!parentUnit) return null
  const parentId = parentUnit.unitType === 'trace'
    ? TRACE_ROOT_SOURCE_ID
    : String(parentUnit.sourceId || '').trim()
  return parentId
    ? { section: 'trace' as const, parentId, expandedUnitIds }
    : null
}

async function createRoleBrainLeaf(parentUnitId: string) {
  if (!canCreateRoleBrainLeafUnder(parentUnitId)) return
  const pathInput = normalizeRoleBrainPathInput(resolveRoleBrainCreationPathInput(parentUnitId))
  const targetSection = getRoleBrainCreateTargetSection(parentUnitId)
  if (targetSection === 'trace') {
    openTraceCreateDialog(parentUnitId, pathInput)
    return
  }
  createDialog.value = {
    ...createEmptyRoleBrainCreateDialog(),
    open: true,
    kind: 'leaf',
    parentUnitId,
    pathInput,
    initialPathInput: pathInput,
    title: t('brain.roleWorkspace.newLeafTitle'),
    date: '',
    insertAfterSourceId: '',
    insertParentUnitId: ''
  }
}

async function createRoleBrainBranch(parentUnitId: string) {
  if (!canCreateRoleBrainBranchUnder(parentUnitId)) return
  const pathInput = normalizeRoleBrainPathInput(resolveRoleBrainCreationPathInput(parentUnitId))
  const targetSection = getRoleBrainCreateTargetSection(parentUnitId)
  if (targetSection === 'trace') {
    openTraceCreateDialog(parentUnitId, pathInput)
    return
  }
  createDialog.value = {
    ...createEmptyRoleBrainCreateDialog(),
    open: true,
    kind: 'branch',
    parentUnitId,
    pathInput,
    initialPathInput: pathInput,
    title: t('brain.roleWorkspace.newBranchTitle'),
    insertAfterSourceId: '',
    insertParentUnitId: ''
  }
}

async function createRoleBrainTraceUnit(parentUnitId: string) {
  if (!canCreateTraceRoleBrainUnitUnder(parentUnitId)) return
  const pathInput = normalizeRoleBrainPathInput(resolveRoleBrainCreationPathInput(parentUnitId))
  const unit = unitById.value.get(parentUnitId)
  openTraceCreateDialog(parentUnitId, pathInput, {
    insertAfterSourceId: String(unit?.sourceId || '').trim(),
    insertParentUnitId: parentUnitId
  })
}

async function createRoleBrainTraceDocument(parentUnitId: string, kind: 'event' | 'arrangement') {
  if (!canCreateTraceDocumentUnder(parentUnitId)) return
  const character = resolveEditableCharacter()
  const unit = unitById.value.get(parentUnitId)
  const parentSourceId = String(unit?.sourceId || '').trim()
  if (!character || !unit || !parentSourceId) return
  const parentTraceNode = readCharacterBrainTraceNodes(character).find((node) => node.id === parentSourceId)
  if (!parentTraceNode) return
  const now = new Date().toISOString()
  const title = kind === 'arrangement' ? t('brain.roleWorkspace.newArrangement') : t('brain.roleWorkspace.newEvent')
  const id = createTraceNodeId()
  const changes = kind === 'arrangement'
    ? createCharacterBrainTraceArrangementTreeNode(character, {
      id,
      title,
      summary: '',
      content: '',
      parentId: parentSourceId,
      activationRule: {
        date: parentTraceNode.pointDate || parentTraceNode.startDate,
        recurrence: 'once'
      },
      recallPolicy: {
        level: 'summary',
        priority: 'normal'
      },
      tags: ['安排'], // i18n 保留：标签数据（进召回/筛选匹配），非显示文案，翻译会破坏检索
      now
    })
    : createCharacterBrainTraceEventTreeNode(character, {
      id,
      title,
      summary: '',
      content: '',
      parentId: parentSourceId,
      tags: ['事件'], // i18n 保留：标签数据（同上）
      now
    })
  if (!Object.keys(changes).length) return
  const beforeNodes = cloneRoleBrainNodesForSection(character, 'trace')
  const afterNodes = readCharacterBrainTraceNodes({ ...character, ...changes } as Character)
  pushRoleBrainHistoryFromNodes({
    character,
    section: 'trace',
    kind: 'create',
    sourceIds: [id],
    beforeNodes,
    afterNodes,
    metadata: { documentKind: kind }
  })
  await queueRoleBrainCharacterOperation({
    character,
    changes: changes as Partial<Character>,
    kind: 'create',
    section: 'trace',
    sourceIds: [id],
    pendingStatus: 'saving',
    metadata: { documentKind: kind }
  })
  expandedIds.value = new Set([...expandedIds.value, parentUnitId].filter(Boolean))
  emit('open-created-unit', id)
}

function resolveTraceCreateDialogDefaultDraft(afterSourceId = '') {
  const character = resolveEditableCharacter()
  if (!character) return { year: '', month: '', date: '' }
  const meta = readCharacterBrainTrajectoryMeta(character)
  return resolveTraceCreateDefaultDateDraft(readCharacterBrainTraceNodes(character), {
    birthDate: String(meta.birthDate || '').trim(),
    calendarConfig: meta.calendarConfig || {},
    coverageEndDate: String(meta.coverageRange?.endDate || meta.coverageEndDate || '').trim()
  }, {
    afterSourceId,
    units: unitView.value.units
  })
}

function resolveRoleBrainSortDialogDraft(unitId: string, selectedUnitIds: string[] = []) {
  if (!resolveEditableCharacter()) return null
  const target = unitById.value.get(unitId)
  if (!target) return null
  const parentUnitId = String(target.parentId || '').trim()
  if (!parentUnitId) return null
  const children = childrenByParentId.value.get(parentUnitId) || []
  const section = children[0] ? getRoleBrainUnitSection(children[0]) : ''
  if (!section || children.length < 2) return null
  if (!children.every((unit) => (
    unit.unitType === 'soulNode'
    || unit.unitType === 'traceDay'
    || unit.unitType === 'traceGroup'
    || unit.unitType === 'traceEvent'
    || unit.unitType === 'traceArrangement'
  ))) return null
  const childUnitIds = new Set(children.map((unit) => unit.unitId))
  const selectedSet = new Set(selectedUnitIds.filter((id) => childUnitIds.has(id)))
  return {
    parentUnitId,
    section,
    items: children.map((unit) => ({
      id: unit.unitId,
      sourceId: String(unit.sourceId || '').trim(),
      label: unit.title || t('brain.roleWorkspace.unnamedUnit'),
      selected: selectedSet.has(unit.unitId)
    })).filter((item) => item.sourceId)
  }
}

function openRoleBrainSortDialog(unitId: string, selectedUnitIds: string[] = []) {
  const draft = resolveRoleBrainSortDialogDraft(unitId, selectedUnitIds)
  if (!draft) return
  sortDialog.value = {
    open: true,
    parentUnitId: draft.parentUnitId,
    section: draft.section,
    items: draft.items
  }
}

function closeSortDialog() {
  sortDialog.value = { open: false, parentUnitId: '', section: '', items: [] }
}

function getRoleBrainSortMoveGroup(index: number) {
  const item = sortDialog.value.items[index]
  if (!item) return []
  const selectedItems = sortDialog.value.items.filter((entry) => entry.selected)
  if (!item.selected || selectedItems.length <= 1) return [item.id]
  return selectedItems.map((entry) => entry.id)
}

function isRoleBrainSortItemSelected(index: number) {
  return Boolean(sortDialog.value.items[index]?.selected)
}

function getRoleBrainSortItemClasses(index: number) {
  const selected = isRoleBrainSortItemSelected(index)
  const prevSelected = index > 0 && isRoleBrainSortItemSelected(index - 1)
  const nextSelected = index < sortDialog.value.items.length - 1 && isRoleBrainSortItemSelected(index + 1)
  return {
    'role-brain-sort-item--selected': selected,
    'role-brain-sort-item--join-top': selected && prevSelected,
    'role-brain-sort-item--join-bottom': selected && nextSelected
  }
}

function isRoleBrainSortMoveDisabled(index: number) {
  if (index < 0 || index >= sortDialog.value.items.length || sortDialog.value.items.length < 2) return true
  const movingIds = getRoleBrainSortMoveGroup(index)
  if (!movingIds.length) return true
  const movingSet = new Set(movingIds)
  return sortDialog.value.items.every((item) => movingSet.has(item.id))
}

function scrollRoleBrainSortItemIntoView(itemId: string, edge: 'top' | 'bottom' | 'middle') {
  void nextTick(() => {
    const selector = `[data-sort-dialog-id="${CSS.escape(itemId)}"]`
    const element = sortDialogList.value?.querySelector<HTMLElement>(selector)
    element?.scrollIntoView({
      block: edge === 'top' ? 'start' : edge === 'bottom' ? 'end' : 'nearest',
      inline: 'nearest'
    })
  })
}

function moveRoleBrainSortItem(index: number, delta: SortDialogDraftDirection) {
  const result = moveSortDialogDraftItems(sortDialog.value.items, getRoleBrainSortMoveGroup(index), delta)
  if (!result) return
  sortDialog.value = { ...sortDialog.value, items: result.items }
  scrollRoleBrainSortItemIntoView(result.focusId, result.edge)
}

async function saveRoleBrainSortDialog() {
  const character = resolveEditableCharacter()
  if (!character || !sortDialog.value.open || sortDialog.value.items.length < 2) return
  const section = sortDialog.value.section
  const orderedSourceIds = sortDialog.value.items.map((item) => item.sourceId).filter(Boolean)
  if (!section || orderedSourceIds.length < 2) return
  if (section === 'soul') {
    const beforeNodes = cloneRoleBrainNodesForSection(character, 'soul') as CharacterBrainCognitionNode[]
    const nextNodes = reorderRecordsBySourceIds(beforeNodes, orderedSourceIds)
    pushRoleBrainHistoryFromNodes({
      character,
      section: 'soul',
      kind: 'sort',
      sourceIds: orderedSourceIds,
      beforeNodes,
      afterNodes: nextNodes,
      metadata: { parentUnitId: sortDialog.value.parentUnitId }
    })
    await queueRoleBrainCharacterOperation({
      character,
      changes: buildCharacterBrainCognitionNodesChange(nextNodes) as Partial<Character>,
      kind: 'sort',
      section: 'soul',
      sourceIds: orderedSourceIds,
      pendingUnitIds: getRoleBrainPendingUnitIds(orderedSourceIds, [sortDialog.value.parentUnitId]),
      pendingStatus: 'saving',
      metadata: { parentUnitId: sortDialog.value.parentUnitId }
    })
    closeSortDialog()
    return
  }
  const beforeNodes = cloneRoleBrainNodesForSection(character, 'trace') as CharacterBrainTraceNode[]
  const nextNodes = reorderRecordsBySourceIds(beforeNodes, orderedSourceIds)
  pushRoleBrainHistoryFromNodes({
    character,
    section: 'trace',
    kind: 'sort',
    sourceIds: orderedSourceIds,
    beforeNodes,
    afterNodes: nextNodes,
    metadata: { parentUnitId: sortDialog.value.parentUnitId }
  })
  await queueRoleBrainCharacterOperation({
    character,
    changes: buildCharacterBrainTraceNodesChange(nextNodes) as Partial<Character>,
    kind: 'sort',
    section: 'trace',
    sourceIds: orderedSourceIds,
    pendingUnitIds: getRoleBrainPendingUnitIds(orderedSourceIds, [sortDialog.value.parentUnitId]),
    pendingStatus: 'saving',
    metadata: { parentUnitId: sortDialog.value.parentUnitId }
  })
  closeSortDialog()
}

function reorderRecordsBySourceIds<T extends { id: string }>(records: T[], orderedSourceIds: string[]) {
  const ordered = orderedSourceIds
    .map((id) => records.find((record) => record.id === id))
    .filter((record): record is T => Boolean(record))
  if (ordered.length < 2) return records
  const moving = new Set(ordered.map((record) => record.id))
  const firstIndex = records.findIndex((record) => moving.has(record.id))
  if (firstIndex < 0) return records
  const rest = records.filter((record) => !moving.has(record.id))
  return [
    ...rest.slice(0, firstIndex),
    ...ordered,
    ...rest.slice(firstIndex)
  ]
}

function openWorldTreeImportDialog(unitId: string) {
  if (!canImportWorldTreeInto(unitId)) return
  const target = unitById.value.get(unitId)
  const parentId = String(target?.sourceId || '').trim()
  if (!parentId) return
  worldTreeImportDialog.value = {
    open: true,
    parentId,
    saving: false
  }
}

function closeWorldTreeImportDialog(force = false) {
  if (worldTreeImportDialog.value.saving && !force) return
  worldTreeImportDialog.value = {
    open: false,
    parentId: '',
    saving: false
  }
}

async function confirmWorldTreeImport(payload: {
  draft: CharacterBrainImportDraft
  conflictActions: Record<string, CharacterBrainImportConflictAction>
  defaultConflictAction: CharacterBrainImportConflictAction
}) {
  const character = resolveEditableCharacter()
  const parentId = worldTreeImportDialog.value.parentId
  if (!character || !parentId || worldTreeImportDialog.value.saving) return
  const conflicts = buildCharacterBrainImportPreview(readCharacterBrainCognitionNodes(character), parentId, payload.draft).conflicts
  const result = applyCharacterBrainImportDraft({
    existingNodes: readCharacterBrainCognitionNodes(character),
    parentId,
    draft: payload.draft,
    conflictActions: payload.conflictActions,
    defaultConflictAction: conflicts.length ? payload.defaultConflictAction : 'skip'
  })
  if (result.createdRootNodeIds[0]) {
    expandedIds.value = new Set([...expandedIds.value, unitById.value.get(rootUnitId.value)?.unitId || rootUnitId.value])
  }
  closeWorldTreeImportDialog(true)
  persistRoleBrainImportChanges(character, buildCharacterBrainCognitionNodesChange(result.nodes), t('brain.roleWorkspace.op.importFromWorldTree'))
}

function isUnitDescendantOf(unitId: string, ancestorUnitId: string) {
  const seen = new Set<string>()
  let current = unitById.value.get(unitId)
  while (current?.parentId && !seen.has(current.unitId)) {
    seen.add(current.unitId)
    if (current.parentId === ancestorUnitId) return true
    current = unitById.value.get(current.parentId)
  }
  return false
}

function resolveEditableCharacter(): Character | null {
  const entityId = String((props.entity as { id?: unknown })?.id || '').trim()
  if (!entityId) return null
  return characterStore.characters.find((item) => String(item.id || '') === entityId) || null
}

async function pasteRoleBrainClipboardIntoUnit(targetUnitId: string) {
  if (!canPasteRoleBrainClipboardInto(targetUnitId)) return
  const character = resolveEditableCharacter()
  const target = unitById.value.get(targetUnitId)
  if (!character || !target) return
  const section = roleBrainClipboard.value.entries[0]?.section
  const now = new Date().toISOString()
  const changes = section === 'soul'
    ? buildSoulClipboardPasteChange(character, target, now)
    : buildTraceClipboardPasteChange(character, target, now)
  if (!changes) return
  const beforeNodes = cloneRoleBrainNodesForSection(character, section)
  const afterNodes = section === 'soul'
    ? readCharacterBrainCognitionNodes({ ...character, ...changes } as Character)
    : readCharacterBrainTraceNodes({ ...character, ...changes } as Character)
  pushRoleBrainHistoryFromNodes({
    character,
    section,
    kind: 'move',
    sourceIds: roleBrainClipboard.value.entries.map((entry) => entry.sourceId),
    beforeNodes,
    afterNodes,
    metadata: { mode: roleBrainClipboard.value.mode, targetUnitId }
  })
  const changedSourceIds = resolveChangedRoleBrainSourceIds(beforeNodes, afterNodes)
  await queueRoleBrainCharacterOperation({
    character,
    changes: changes as Partial<Character>,
    kind: roleBrainClipboard.value.mode === 'copy' ? 'create' : 'move',
    section,
    sourceIds: changedSourceIds,
    pendingUnitIds: getRoleBrainPendingUnitIds(changedSourceIds, [targetUnitId]),
    pendingStatus: 'saving',
    metadata: { mode: roleBrainClipboard.value.mode, targetUnitId }
  })
  if (roleBrainClipboard.value.mode === 'cut') {
    clearRoleBrainClipboard()
    roleUnitSelection.clearSelection()
  }
}

function buildSoulClipboardPasteChange(character: Character, target: UnitView, now: string): Record<string, unknown> | null {
  const clipboard = roleBrainClipboard.value
  let nodes = readCharacterBrainCognitionNodes(character).map((node) => ({ ...node }))
  const targetParent = resolveSoulPasteParent(nodes, target, now)
  if (!targetParent) return null
  if (clipboard.mode === 'cut') {
    const moving = new Set(clipboard.entries.map((entry) => entry.sourceId))
    nodes = nodes.map((node) => moving.has(node.id) ? { ...node, parentId: targetParent, updatedAt: now } : node)
  } else {
    nodes = [...nodes, ...cloneSoulClipboardNodes(nodes, clipboard.entries.map((entry) => entry.sourceId), targetParent, now)]
  }
  return buildCharacterBrainCognitionNodesChange(nodes)
}

function resolveSoulPasteParent(nodes: CharacterBrainCognitionNode[], target: UnitView, now: string) {
  if (target.unitType === 'soul') return SOUL_ROOT_SOURCE_ID
  const targetId = String(target.sourceId || '').trim()
  const targetNode = nodes.find((node) => node.id === targetId)
  if (!targetNode) return ''
  if (targetNode.kind !== 'group') {
    const overviewId = createCognitionNodeId()
    nodes.splice(0, nodes.length, ...nodes.map((node) => node.id === targetId
      ? { ...node, kind: 'group' as const, updatedAt: now }
      : node))
    nodes.push({
      ...targetNode,
      id: overviewId,
      title: `${targetNode.title || t('brain.graphPreview.unnamedNode')}_总览`,
      parentId: targetId,
      kind: 'private',
      createdAt: now,
      updatedAt: now,
      pendingReview: undefined
    })
  }
  return targetId
}

function cloneSoulClipboardNodes(nodes: CharacterBrainCognitionNode[], rootIds: string[], parentId: string, now: string) {
  const subtree = collectCognitionSubtree(nodes, rootIds)
  const idMap = new Map(subtree.map((node) => [node.id, createCognitionNodeId()] as const))
  return subtree.map((node) => ({
    ...node,
    id: idMap.get(node.id) || createCognitionNodeId(),
    parentId: rootIds.includes(node.id) ? parentId : (idMap.get(node.parentId) || parentId),
    createdAt: now,
    updatedAt: now,
    pendingReview: undefined
  }))
}

function collectCognitionSubtree(nodes: CharacterBrainCognitionNode[], rootIds: string[]) {
  const rootSet = new Set(rootIds)
  const collected = new Set<string>()
  const result: CharacterBrainCognitionNode[] = []
  const visit = (nodeId: string) => {
    if (collected.has(nodeId)) return
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    collected.add(nodeId)
    result.push(node)
    nodes.filter((item) => item.parentId === nodeId).forEach((child) => visit(child.id))
  }
  nodes.filter((node) => rootSet.has(node.id)).forEach((node) => visit(node.id))
  return result
}

function buildTraceClipboardPasteChange(character: Character, target: UnitView, now: string): Record<string, unknown> | null {
  const clipboard = roleBrainClipboard.value
  const nodes = readCharacterBrainTraceNodes(character).map((node) => ({ ...node }))
  const parentId = target.unitType === 'trace' ? TRACE_ROOT_SOURCE_ID : String(target.sourceId || '').trim()
  if (!parentId || target.unitType === 'traceEvent' || target.unitType === 'traceArrangement') return null
  let nextNodes: CharacterBrainTraceNode[]
  if (clipboard.mode === 'cut') {
    const moving = new Set(clipboard.entries.map((entry) => entry.sourceId))
    nextNodes = nodes.map((node) => moving.has(node.id) ? { ...node, parentId, updatedAt: now } : node)
  } else {
    nextNodes = [...nodes, ...cloneTraceClipboardNodes(nodes, clipboard.entries.map((entry) => entry.sourceId), parentId, now)]
  }
  return buildCharacterBrainTraceNodesChange(nextNodes)
}

function cloneTraceClipboardNodes(nodes: CharacterBrainTraceNode[], rootIds: string[], parentId: string, now: string) {
  const subtree = collectTraceSubtree(nodes, rootIds)
  const idMap = new Map(subtree.map((node) => [node.id, createTraceNodeId()] as const))
  return subtree.map((node) => ({
    ...node,
    id: idMap.get(node.id) || createTraceNodeId(),
    parentId: rootIds.includes(node.id) ? parentId : (idMap.get(node.parentId) || parentId),
    createdAt: now,
    updatedAt: now,
    pendingReview: undefined
  }))
}

function collectTraceSubtree(nodes: CharacterBrainTraceNode[], rootIds: string[]) {
  const rootSet = new Set(rootIds)
  const collected = new Set<string>()
  const result: CharacterBrainTraceNode[] = []
  const visit = (nodeId: string) => {
    if (collected.has(nodeId)) return
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    collected.add(nodeId)
    result.push(node)
    nodes.filter((item) => item.parentId === nodeId).forEach((child) => visit(child.id))
  }
  nodes.filter((node) => rootSet.has(node.id)).forEach((node) => visit(node.id))
  return result
}

function createCognitionNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${COGNITION_NODE_ID_PREFIX}${crypto.randomUUID()}`
  return `${COGNITION_NODE_ID_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function createTraceNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${TRACE_NODE_ID_PREFIX}${crypto.randomUUID()}`
  return `${TRACE_NODE_ID_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function getKeyboardClipboardTargetId() {
  if (roleUnitSelection.selectedIds.value.length === 1) return roleUnitSelection.selectedIds.value[0]
  if (props.activeUnitId && unitById.value.has(props.activeUnitId)) return props.activeUnitId
  return renderedUnitIds.value[0] || ''
}

function handleGlobalShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    if (!canUndoRoleBrainOps.value) return
    event.preventDefault()
    undoRoleBrainOps().catch(() => {})
    return
  }
  if (key === 'y' || (key === 'z' && event.shiftKey)) {
    if (!canRedoRoleBrainOps.value) return
    event.preventDefault()
    redoRoleBrainOps().catch(() => {})
    return
  }
  if (event.shiftKey) return
  if (key === 'c' || key === 'x') {
    if (hasActiveBrowserTextSelection()) return
    const ids = roleUnitSelection.selectedIds.value.length ? roleUnitSelection.selectedIds.value : (props.activeUnitId ? [props.activeUnitId] : [])
    const units = ids.map((id) => unitById.value.get(id)).filter((unit): unit is UnitView => Boolean(unit))
    const clipboard = buildRoleBrainClipboard(units, key === 'x' ? 'cut' : 'copy')
    if (!clipboard) return
    event.preventDefault()
    setRoleBrainClipboard(clipboard)
    return
  }
  if (key === 'v') {
    const targetId = getKeyboardClipboardTargetId()
    if (!targetId || !canPasteRoleBrainClipboardInto(targetId)) return
    event.preventDefault()
    pasteRoleBrainClipboardIntoUnit(targetId).catch(() => {})
  }
}

function copyText(value: string) {
  const text = String(value || '').trim()
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
  void navigator.clipboard.writeText(text)
}

async function readClipboardText() {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return ''
  const text = await navigator.clipboard.readText()
  return String(text || '').trim()
}

function buildRoleBrainUnitTreeMarkdown(unitIds: string[]) {
  return buildUnitTreeMarkdown({
    units: unitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel: roleBrainRootPath.value
  })
}

function buildRoleBrainUnitTreeMarkdownWithCompilePrompt(unitIds: string[]) {
  return buildUnitTreeMarkdownWithCompilePrompt({
    units: unitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel: roleBrainRootPath.value
  })
}

function buildRoleBrainUnitTreeMarkdownWithBodyPrompt(unitIds: string[]) {
  const promptKind = unitIds.length && unitIds.every((unitId) => {
    const unit = unitById.value.get(unitId)
    return Boolean(unit && getRoleBrainUnitSection(unit) === 'trace')
  }) ? 'trajectory' : 'roleBrain'
  return buildUnitTreeMarkdownWithBodyPrompt({
    units: unitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel: roleBrainRootPath.value
  }, promptKind)
}

function isCompactRelationCopyAction(action: string) {
  return action === 'copy-compact-relation-markdown'
    || action === 'copy-compact-relation-markdown-v1'
    || action === 'copy-compact-relation-markdown-v2'
}

function isCompactRelationExportAction(action: string) {
  return action === 'export-compact-relation-markdown'
    || action === 'export-compact-relation-markdown-v1'
    || action === 'export-compact-relation-markdown-v2'
}

function getCompactRelationPromptVersionFromAction(action: string): CompactRelationPromptVersion {
  return action.endsWith('-v2') ? 'v2' : 'v1'
}

function buildRoleBrainCompactRelationMarkdown(unitIds: string[], sourceLabel: string, promptVersion: CompactRelationPromptVersion) {
  const result = buildCompactRelationMarkdown({
    units: unitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel,
    promptVersion
  })
  saveCompactRelationExportMapping(result.mapping)
  return result.markdown
}

function exportRoleBrainUnitTreeJsonFile(unitIds: string[], sourceLabel: string) {
  exportRoleBrainUnitTreeMarkdownFile(unitIds, sourceLabel, false)
}

function exportRoleBrainUnitTreeMarkdownFile(unitIds: string[], sourceLabel: string, promptKind: boolean | 'body') {
  const markdown = promptKind === 'body'
    ? buildRoleBrainUnitTreeMarkdownWithBodyPrompt(unitIds)
    : promptKind
      ? buildRoleBrainUnitTreeMarkdownWithCompilePrompt(unitIds)
      : buildRoleBrainUnitTreeMarkdown(unitIds)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const suffix = promptKind === 'body' ? t('brain.roleWorkspace.bodyPromptSuffix') : promptKind ? t('brain.roleWorkspace.compilePromptSuffix') : ''
  link.download = `${sanitizeJsonFileName(sourceLabel)}${suffix}-${new Date().toISOString().slice(0, 10)}.md`
  link.click()
  URL.revokeObjectURL(url)
}

function exportRoleBrainCompactRelationMarkdownFile(unitIds: string[], sourceLabel: string, promptVersion: CompactRelationPromptVersion) {
  const markdown = buildRoleBrainCompactRelationMarkdown(unitIds, sourceLabel, promptVersion)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeJsonFileName(sourceLabel)}-${t('brain.roleWorkspace.relationCompactLabel')}-${promptVersion}-${new Date().toISOString().slice(0, 10)}.md`
  link.click()
  URL.revokeObjectURL(url)
}

// 联动标注（双入口一真值）：本函数同时是「角色大脑按钮」和「星依 generateCompilePage 工具」的 execute 核心，
// 经 xingyiFunctionBridge 注册（见 onMounted）；返回 {ok,message} 供星依回报，按钮路径忽略返回值。
async function runRoleBrainAgentGenerateCompilePage(unitIds: string[], sourceLabel: string): Promise<{ ok: boolean; message: string }> {
  const safeUnitIds = normalizeUnitIdsInput(unitIds)
  if (!safeUnitIds.length) {
    emit('import-save-error', t('brain.roleWorkspace.agent.noCompileUnit'))
    return { ok: false, message: t('brain.roleWorkspace.agent.noCompileUnit') }
  }
  const noticeId = runtimeStore.startAgentTaskNotice({
    title: t('brain.roleWorkspace.agent.genCompileTitle'),
    message: t('brain.roleWorkspace.agent.genCompileMessage'),
    sourceLabel,
    sourceCharacterId: String((resolveEditableCharacter() as { id?: unknown } | null)?.id || ''),
    step: t('brain.roleWorkspace.agent.selectedUnits', { count: safeUnitIds.length })
  })
  try {
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.callingAgentCompile'),
      step: t('brain.roleWorkspace.agent.agentGenerating')
    })
    const result = await runLanghuanAgentCompilePage({
      units: unitView.value.units,
      rootUnitIds: safeUnitIds,
      sourceLabel,
      agentConfig: settingStore.getBrainAgentConfig(),
      callAI: callAI as any
    })
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.importingCompile'),
      step: t('brain.roleWorkspace.agent.receivedCompile', { count: result.entryCount })
    })
    const imported = await importCompilePageMarkdown(safeUnitIds, result.markdown, {
      onWaitConfirmation: (count) => {
        runtimeStore.updateAgentTaskNotice({
          id: noticeId,
          message: t('brain.roleWorkspace.agent.awaitingCompileConfirm'),
          status: 'waiting',
          step: t('brain.roleWorkspace.agent.needConfirmUnits', { count }),
          detail: t('brain.roleWorkspace.agent.stayOnRolePage')
        })
      }
    })
    if (!imported) {
      throw new Error(t('brain.roleWorkspace.agent.compileImportIncomplete'))
    }
    runtimeStore.completeAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.compileGenerated'),
      step: t('brain.roleWorkspace.agent.importedCompile', { count: result.entryCount })
    })
    emit('import-save-success', t('brain.roleWorkspace.agent.compileDoneToast'))
    return { ok: true, message: t('brain.roleWorkspace.agent.compileResultMessage', { label: sourceLabel, count: result.entryCount }) }
  } catch (error) {
    console.warn('琅嬛AGENT生成角色编译页失败', error)
    runtimeStore.failAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.compileFailed'),
      step: t('brain.roleWorkspace.agent.failReasonLogged'),
      error
    })
    const detail = error instanceof Error ? error.message : String(error)
    emit('import-save-error', t('brain.roleWorkspace.agent.genCompileFailedMsg', { detail }))
    return { ok: false, message: t('brain.roleWorkspace.agent.genCompileFailedMsg', { detail }) }
  }
}

// 联动标注（双入口一真值）：同 runRoleBrainAgentGenerateCompilePage，也是星依 optimizeUnitRelations 工具的核心。
async function runRoleBrainAgentOptimizeRelations(unitIds: string[], sourceLabel: string): Promise<{ ok: boolean; message: string }> {
  const safeUnitIds = normalizeUnitIdsInput(unitIds)
  if (!safeUnitIds.length) {
    emit('import-save-error', t('brain.roleWorkspace.agent.noRelationUnit'))
    return { ok: false, message: t('brain.roleWorkspace.agent.noRelationUnit') }
  }
  const noticeId = runtimeStore.startAgentTaskNotice({
    title: t('brain.roleWorkspace.agent.optRelationTitle'),
    message: t('brain.roleWorkspace.agent.optRelationMessage'),
    sourceLabel,
    sourceCharacterId: String((resolveEditableCharacter() as { id?: unknown } | null)?.id || ''),
    step: t('brain.roleWorkspace.agent.selectedUnits', { count: safeUnitIds.length })
  })
  try {
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.callingAgentRelation'),
      step: t('brain.roleWorkspace.agent.agentGenerating')
    })
    const result = await runLanghuanAgentRelationOptimize({
      units: unitView.value.units,
      rootUnitIds: safeUnitIds,
      sourceLabel,
      agentConfig: settingStore.getBrainAgentConfig(),
      callAI: callAI as any
    })
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.importingRelation'),
      step: t('brain.roleWorkspace.agent.receivedRelation', { count: result.relationCount })
    })
    saveCompactRelationExportMapping(result.mapping)
    await importCompactRelationMarkdown(safeUnitIds, result.markdown)
    runtimeStore.completeAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.relationOptimized'),
      step: t('brain.roleWorkspace.agent.processedRelation', { count: result.relationCount })
    })
    emit('import-save-success', t('brain.roleWorkspace.agent.relationDoneToast'))
    return { ok: true, message: t('brain.roleWorkspace.agent.relationResultMessage', { label: sourceLabel, count: result.relationCount }) }
  } catch (error) {
    console.warn('琅嬛AGENT优化角色关系失败', error)
    runtimeStore.failAgentTaskNotice({
      id: noticeId,
      message: t('brain.roleWorkspace.agent.relationFailed'),
      step: t('brain.roleWorkspace.agent.failReasonLogged'),
      error
    })
    const detail = error instanceof Error ? error.message : String(error)
    emit('import-save-error', t('brain.roleWorkspace.agent.optRelationFailedMsg', { detail }))
    return { ok: false, message: t('brain.roleWorkspace.agent.optRelationFailedMsg', { detail }) }
  }
}

function openCompilePageMarkdownFilePicker(unitIds: string | string[]) {
  if (!canImportCompilePageMarkdownInto(unitIds) || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    file.text()
      .then((text) => importCompilePageMarkdown(unitIds, text))
      .catch((error) => {
        console.warn('导入编译页 Markdown 失败', error)
      })
  }, { once: true })
  input.click()
}

async function importCompilePageMarkdownFromClipboard(unitIds: string | string[]) {
  if (!canImportCompilePageMarkdownInto(unitIds)) return
  try {
    const text = await readClipboardText()
    if (!text) return
    await importCompilePageMarkdown(unitIds, text)
  } catch (error) {
    console.warn('从剪贴板导入编译页 Markdown 失败', error)
  }
}

function openTrajectoryBodyMarkdownFilePicker(unitIds: string | string[]) {
  if (!canImportRoleBrainBodyMarkdownInto(unitIds) || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    file.text()
      .then((text) => importRoleBrainBodyMarkdown(unitIds, text))
      .catch((error) => {
        console.warn('导入轨迹正文 Markdown 失败', error)
      })
  }, { once: true })
  input.click()
}

async function importTrajectoryBodyMarkdownFromClipboard(unitIds: string | string[]) {
  if (!canImportRoleBrainBodyMarkdownInto(unitIds)) return
  try {
    const text = await readClipboardText()
    if (!text) return
    await importRoleBrainBodyMarkdown(unitIds, text)
  } catch (error) {
    console.warn('从剪贴板导入轨迹正文 Markdown 失败', error)
  }
}

function openCompactRelationMarkdownFilePicker(unitIds: string | string[]) {
  if (!canImportCompilePageMarkdownInto(unitIds) || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    file.text()
      .then((text) => importCompactRelationMarkdown(unitIds, text))
      .catch((error) => {
        console.warn('导入关系整合 Markdown 失败', error)
      })
  }, { once: true })
  input.click()
}

async function importCompactRelationMarkdownFromClipboard(unitIds: string | string[]) {
  if (!canImportCompilePageMarkdownInto(unitIds)) return
  try {
    const text = await readClipboardText()
    if (!text) return
    await importCompactRelationMarkdown(unitIds, text)
  } catch (error) {
    console.warn('从剪贴板导入关系整合 Markdown 失败', error)
  }
}

async function importRoleBrainBodyMarkdown(unitIds: string | string[], text: string) {
  const character = resolveEditableCharacter()
  const rootUnitIds = normalizeUnitIdsInput(unitIds)
  if (!character || !canImportRoleBrainBodyMarkdownInto(rootUnitIds)) return

  const batch = parseUnitBodyMarkdownBatch(text)
  if (batch.entries.length) {
    await importRoleBrainBodyMarkdownBatch(rootUnitIds, batch)
    return
  }

  if (importCharacterCoreMarkdownIntoRoleBrain(character, rootUnitIds, text)) return

  if (rootUnitIds.every((unitId) => {
    const unit = unitById.value.get(unitId)
    return Boolean(unit && getRoleBrainUnitSection(unit) === 'trace')
  })) {
    await importTrajectoryBodyMarkdown(rootUnitIds, text)
    return
  }

  const unit = unitById.value.get(rootUnitIds[0] || '')
  if (!unit || !isBodyWritableRoleBrainUnit(unit)) return
  const parsed = parseUnitBodyMarkdown(text)
  if (!parsed.content.trim()) return
  await importRoleBrainBodyEntries(character, [{ unit, sourceId: String(unit.sourceId || '').trim(), parsed }])
}

function importCharacterCoreMarkdownIntoRoleBrain(character: Character, rootUnitIds: string[], text: string) {
  const targetByFieldKey = buildRoleBrainCoreFieldImportTargets(rootUnitIds)
  const targetBySourceId = buildRoleBrainCoreDocumentImportTargets(rootUnitIds)
  const allowWholeCore = isCharacterCoreRootImportScope(rootUnitIds)
  if (!targetByFieldKey.size && !targetBySourceId.size && !allowWholeCore) return false

  let parsedChanges: Record<string, unknown>
  try {
    parsedChanges = parseCharacterCoreMarkdown(text)
  } catch (error) {
    if (isLikelyCharacterCoreMarkdown(text)) {
      emit('import-save-error', t('brain.roleWorkspace.importCoreBodyFailed', { error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    return false
  }

  const nextDocuments = { ...readCharacterBrainDocuments(character) }
  let nextChanges: Record<string, unknown> = {}
  let importedCount = 0
  const parsedFieldKeys: CharacterBrainFieldKey[] = [
    'emoji',
    'name',
    'gender',
    'age',
    'desc',
    'appearance',
    'speakingStyle',
    'outfit',
    'personality',
    'hobbies',
    'abilities',
    'experience',
    'worldview',
    'background'
  ]

  parsedFieldKeys.forEach((fieldKey) => {
    const value = readCharacterCoreParsedField(parsedChanges, fieldKey)
    if (value === undefined) return
    const target = targetByFieldKey.get(fieldKey)
    if (!target && !allowWholeCore) return
    nextChanges = {
      ...nextChanges,
      ...buildCharacterBrainTreeCoreFieldChange(fieldKey, value)
    }
    if (target?.unit.contentKind === 'markdown') {
      nextDocuments[target.sourceId] = String(value ?? '').trim()
    }
    importedCount += 1
  })

  const parsedDocuments = parsedChanges.brainDocuments && typeof parsedChanges.brainDocuments === 'object' && !Array.isArray(parsedChanges.brainDocuments)
    ? parsedChanges.brainDocuments as Record<string, unknown>
    : {}
  const goalValue = String(parsedDocuments['brain:goal_value'] ?? '').trim()
  if (goalValue) {
    const target = targetBySourceId.get('brain:goal_value')
    if (target || allowWholeCore) {
      nextDocuments['brain:goal_value'] = goalValue
      importedCount += 1
    }
  }

  if (!importedCount) {
    emit('import-save-error', t('brain.roleWorkspace.coreMarkdownNoMatch'))
    return true
  }

  nextChanges = {
    ...nextChanges,
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }
  persistRoleBrainImportChanges(character, nextChanges, t('brain.roleWorkspace.op.importCoreBody'))
  return true
}

function readCharacterCoreParsedField(changes: Record<string, unknown>, fieldKey: CharacterBrainFieldKey) {
  if (fieldKey === 'speakingStyle') {
    if (Object.prototype.hasOwnProperty.call(changes, 'speakingStyle')) return changes.speakingStyle
    if (Object.prototype.hasOwnProperty.call(changes, 'speaking_style')) return changes.speaking_style
    return undefined
  }
  return Object.prototype.hasOwnProperty.call(changes, fieldKey) ? changes[fieldKey] : undefined
}

function isLikelyCharacterCoreMarkdown(text: string) {
  const source = String(text || '')
  return source.includes('langhuan:character-core-markdown')
    || /^##\s+(名称|图标|性别|年龄|简介|性格|目标与价值|外貌|说话风格|穿着|爱好|能力|经历|世界观|背景)\s*$/mu.test(source)
}

async function importRoleBrainBodyMarkdownBatch(
  rootUnitIds: string[],
  batch: ReturnType<typeof parseUnitBodyMarkdownBatch>
) {
  const character = resolveEditableCharacter()
  if (!character) return
  const targetByRefId = buildRoleBrainBodyImportTargets(rootUnitIds)
  const updates: Array<{ unit: UnitView; sourceId: string; parsed: UnitBodyMarkdownEntry }> = []
  let skipped = batch.warnings.length

  batch.entries.forEach((entry) => {
    const target = targetByRefId.get(entry.targetRefId)
    if (!target) {
      skipped += 1
      return
    }
    updates.push({ ...target, parsed: entry })
  })

  if (!updates.length) {
    if (batch.warnings.length) console.warn('批量导入正文没有匹配到当前子树内单位', batch.warnings)
    return
  }
  await importRoleBrainBodyEntries(character, updates)
  if (skipped) console.warn('批量导入正文存在跳过项', { skipped, warnings: batch.warnings })
}

async function importRoleBrainBodyEntries(
  character: Character,
  updates: Array<{
    unit: UnitView
    sourceId: string
    parsed: Pick<UnitBodyMarkdownEntry, 'subtitle' | 'summary' | 'tags' | 'confirmed' | 'content'>
  }>
) {
  const now = new Date().toISOString()
  const nextDocuments = { ...readCharacterBrainDocuments(character) }
  let nextChanges: Record<string, unknown> = {}
  const soulBodyBySourceId = new Map<string, Pick<UnitBodyMarkdownEntry, 'summary' | 'tags' | 'content'>>()
  const traceBodyBySourceId = new Map<string, Pick<UnitBodyMarkdownEntry, 'subtitle' | 'summary' | 'tags' | 'confirmed' | 'content'>>()

  updates.forEach(({ unit, sourceId, parsed }) => {
    const content = String(parsed.content || '').trim()
    if (!sourceId || !content) return
    if (unit.unitType === 'coreField') {
      nextDocuments[sourceId] = content
      const fieldKey = String(unit.metadata?.fieldKey || '').trim() as CharacterBrainFieldKey
      if (fieldKey) {
        nextChanges = {
          ...nextChanges,
          ...buildCharacterBrainTreeCoreFieldChange(fieldKey, content)
        }
      }
      return
    }
    if (unit.unitType === 'soulNode') {
      nextDocuments[sourceId] = content
      soulBodyBySourceId.set(sourceId, parsed)
      return
    }
    if (unit.unitType === 'traceDay' || unit.unitType === 'traceGroup' || unit.unitType === 'traceEvent' || unit.unitType === 'traceArrangement') {
      traceBodyBySourceId.set(sourceId, parsed)
    }
  })

  if (soulBodyBySourceId.size) {
    const nextNodes = readCharacterBrainCognitionNodes(character).map((node) => {
      const parsed = soulBodyBySourceId.get(node.id)
      if (!parsed) return node
      return {
        ...node,
        content: parsed.content,
        summary: parsed.summary || node.summary,
        tags: parsed.tags.length ? [...parsed.tags] : node.tags,
        updatedAt: now
      }
    })
    nextChanges = {
      ...nextChanges,
      ...buildCharacterBrainCognitionNodesChange(nextNodes)
    }
  }

  if (traceBodyBySourceId.size) {
    const nextNodes = readCharacterBrainTraceNodes(character).map((node) => {
      const parsed = traceBodyBySourceId.get(node.id)
      if (!parsed) return node
      return {
        ...node,
        displayTitle: parsed.subtitle || node.displayTitle,
        title: parsed.subtitle || node.title,
        summary: parsed.summary || node.summary,
        note: parsed.summary || node.note,
        content: parsed.content,
        tags: parsed.tags.length ? [...parsed.tags] : node.tags,
        confirmed: parsed.confirmed,
        updatedAt: now
      }
    })
    nextChanges = {
      ...nextChanges,
      ...buildCharacterBrainTraceNodesChange(nextNodes)
    }
  }

  nextChanges = {
    ...nextChanges,
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }
  persistRoleBrainImportChanges(character, nextChanges, t('brain.roleWorkspace.op.importBody'))
}

async function importTrajectoryBodyMarkdown(unitIds: string | string[], text: string) {
  const character = resolveEditableCharacter()
  const rootUnitIds = normalizeUnitIdsInput(unitIds)
  if (!character || !rootUnitIds.length) return

  const parsed = parseTrajectoryMarkdown(text)
  if (isSingleTrajectoryRootImport(rootUnitIds)) {
    const validation = validateTrajectoryRootImportBirthDate(
      parsed.entries,
      readCharacterBrainTrajectoryMeta(character).birthDate
    )
    if (!validation.ok) {
      console.warn(validation.message)
      return
    }
  }
  const entries = parsed.entries.filter((entry) => isTrajectoryImportEntryInScope(entry, rootUnitIds, readCharacterBrainTraceNodes(character)))
  if (!entries.length) {
    if (parsed.warnings.length) console.warn('轨迹正文导入没有可写条目', parsed.warnings)
    return
  }

  const now = new Date().toISOString()
  let workingCharacter = character
  let changes: Record<string, unknown> = {}
  let importedCount = 0
  let skippedCount = parsed.entries.length - entries.length + parsed.warnings.length

  entries.forEach((entry) => {
    let targetNodeId = resolveTrajectoryImportTargetNodeId(entry, readCharacterBrainTraceNodes(workingCharacter))
    if (!targetNodeId) {
      const createResult = createTraceStructureForTrajectoryImportEntry(workingCharacter, entry, now)
      if (!createResult.ok) {
        skippedCount += 1
        return
      }
      workingCharacter = { ...workingCharacter, ...createResult.changes } as Character
      changes = { ...changes, ...createResult.changes }
      targetNodeId = resolveTrajectoryImportTargetNodeId(entry, readCharacterBrainTraceNodes(workingCharacter))
    }
    if (!targetNodeId) {
      skippedCount += 1
      return
    }

    if (entry.granularity === 'day' && entry.dayTarget !== 'overview') {
      const childChanges = createTrajectoryImportDayDocument(workingCharacter, targetNodeId, entry, now)
      if (!Object.keys(childChanges).length) {
        skippedCount += 1
        return
      }
      workingCharacter = { ...workingCharacter, ...childChanges } as Character
      changes = { ...changes, ...childChanges }
      importedCount += 1
      return
    }

    const updateChanges = updateCharacterBrainTraceTreeNode(workingCharacter, targetNodeId, {
      subtitle: entry.subtitle || entry.title,
      summary: entry.summary,
      content: entry.content,
      tags: entry.tags,
      now
    })
    workingCharacter = { ...workingCharacter, ...updateChanges } as Character
    changes = { ...changes, ...updateChanges }

    const confirmedChanges = setTrajectoryImportNodeConfirmed(workingCharacter, targetNodeId, entry.confirmed, now)
    workingCharacter = { ...workingCharacter, ...confirmedChanges } as Character
    changes = { ...changes, ...confirmedChanges }
    importedCount += 1
  })

  if (!importedCount) {
    console.warn('轨迹正文导入未写入任何条目', { skippedCount, warnings: parsed.warnings })
    return
  }
  if (skippedCount) console.warn('轨迹正文导入存在跳过项', { skippedCount, warnings: parsed.warnings })
  persistRoleBrainImportChanges(character, changes, t('brain.roleWorkspace.op.importTraceBody'))
}

async function importCompilePageMarkdown(
  unitIds: string | string[],
  text: string,
  options: CompileImportDecisionOptions = {}
) {
  const character = resolveEditableCharacter()
  const rootUnitIds = normalizeUnitIdsInput(unitIds)
  const unit = unitById.value.get(rootUnitIds[0] || '')
  if (!character || !unit || !canImportCompilePageMarkdownInto(rootUnitIds)) return false
  const decisionOptions = {
    ...options,
    sourceCharacterId: String((character as { id?: unknown }).id || options.sourceCharacterId || '')
  }
  const batch = parseCompilePageMarkdownBatch(text)
  if (batch.entries.length) {
    return importCompilePageMarkdownBatch(rootUnitIds, batch, decisionOptions)
  }

  if (!isCompilePageWritableRoleBrainUnit(unit)) return false
  const sourceId = String(unit.sourceId || '').trim()
  if (!sourceId) return false
  const parsed = parseCompilePageMarkdown(text)
  const incoming = buildRoleBrainIncomingCompilePage(parsed.compilePage, parsed.semanticType)
  const plan: CompilePageImportPlan = {
    units: [createRoleBrainCompilePageImportUnitPlan(character, unit, incoming)]
  }
  const decisions = await resolveCompileImportDecisions(plan, decisionOptions)
  if (!decisions) return false
  const selected = applyCompilePageImportDecisions(
    getRoleBrainCompilePageCurrent(character, unit),
    incoming,
    decisions[unit.unitId]
  )
  const now = new Date().toISOString()
  const nextCompilePage: CharacterBrainCompilePage = {
    summary: selected.summary,
    tags: [...selected.tags],
    relationHints: [...selected.relationHints],
    semanticType: selected.semanticType,
    updatedAt: now
  }
  const nextDocuments = {
    ...readCharacterBrainDocuments(character),
    [buildCharacterBrainCompileDocumentKey(sourceId)]: JSON.stringify(nextCompilePage)
  }
  let nextChanges: Record<string, unknown> = {
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }

  const section = getRoleBrainUnitSection(unit)
  if (section === 'soul') {
    const nextNodes = readCharacterBrainCognitionNodes(character).map((node) => (
      node.id === sourceId
        ? {
            ...node,
            summary: nextCompilePage.summary || node.summary,
            tags: [...nextCompilePage.tags],
            relationHints: [...nextCompilePage.relationHints],
            compilePage: nextCompilePage,
            updatedAt: now
          }
        : node
    ))
    nextChanges = {
      ...nextChanges,
      ...buildCharacterBrainCognitionNodesChange(nextNodes)
    }
  } else if (section === 'trace') {
    const nextNodes = readCharacterBrainTraceNodes(character).map((node) => (
      node.id === sourceId
        ? {
            ...node,
            summary: nextCompilePage.summary || node.summary,
            note: nextCompilePage.summary || node.note,
            tags: [...nextCompilePage.tags],
            updatedAt: now
          }
        : node
    ))
    nextChanges = {
      ...nextChanges,
      ...buildCharacterBrainTraceNodesChange(nextNodes)
    }
  }

  persistRoleBrainImportChanges(character, nextChanges, t('brain.roleWorkspace.op.importCompilePage'))
  return true
}

function createTraceStructureForTrajectoryImportEntry(
  character: Character,
  entry: TrajectoryMarkdownImportEntry,
  now: string
) {
  if (entry.granularity === 'day') {
    return createCharacterBrainTraceBatchTreeNodes(character, {
      granularity: 'day',
      dates: [entry.startDate],
      subtitle: entry.subtitle || entry.title,
      summary: entry.summary,
      content: entry.content,
      tags: entry.tags,
      now
    })
  }
  if (entry.granularity === 'month') {
    const date = parseImportDateParts(entry.startDate)
    return createCharacterBrainTraceBatchTreeNodes(character, {
      granularity: 'month',
      year: date.year,
      months: [date.month],
      now
    })
  }
  const startYear = parseImportDateParts(entry.startDate).year
  const endYear = parseImportDateParts(entry.endDate).year
  if (entry.granularity === 'multiYear' || startYear !== endYear) {
    return createCharacterBrainTraceBranchTreeNode(character, {
      kind: 'multiYear',
      year: startYear,
      spanYears: Math.max(1, endYear - startYear + 1),
      now
    })
  }
  return createCharacterBrainTraceBatchTreeNodes(character, {
    granularity: 'year',
    years: [startYear],
    now
  })
}

function resolveTrajectoryImportTargetNodeId(entry: TrajectoryMarkdownImportEntry, nodes: CharacterBrainTraceNode[]) {
  if (entry.granularity === 'day') {
    return nodes.find((node) => node.systemRole === 'dayLeaf' && (node.pointDate || node.startDate) === entry.startDate)?.id || ''
  }
  if (entry.granularity === 'month') {
    const { year, month } = parseImportDateParts(entry.startDate)
    return nodes.find((node) => (
      node.systemRole === 'monthBranch'
      && parseImportDateParts(node.startDate).year === year
      && parseImportDateParts(node.startDate).month === month
    ))?.id || ''
  }
  if (entry.granularity === 'year') {
    const year = parseImportDateParts(entry.startDate).year
    return nodes.find((node) => node.systemRole === 'yearBranch' && parseImportDateParts(node.startDate).year === year)?.id || ''
  }
  return nodes.find((node) => (
    node.systemRole === 'multiYearBranch'
    && node.startDate === entry.startDate
    && normalizeImportRangeEnd(node.endDate || node.pointDate || node.startDate) === normalizeImportRangeEnd(entry.endDate)
  ))?.id || ''
}

function createTrajectoryImportDayDocument(
  character: Character,
  dayNodeId: string,
  entry: TrajectoryMarkdownImportEntry,
  now: string
) {
  const normalizedTitle = String(entry.subtitle || entry.title || t('brain.roleWorkspace.unnamedEvent')).trim()
  const baseId = `brain:trajectory:node:${entry.dayTarget === 'arrangement' ? 'arrangement' : 'event'}_${entry.startDate.replace(/-/g, '_')}_${encodeTrajectoryImportIdSegment(normalizedTitle)}`
  const id = makeUniqueTrajectoryImportNodeId(baseId, readCharacterBrainTraceNodes(character))
  if (entry.dayTarget === 'arrangement') {
    return createCharacterBrainTraceArrangementTreeNode(character, {
      id,
      title: normalizedTitle || t('brain.roleWorkspace.unnamedArrangement'),
      summary: entry.summary,
      content: entry.content,
      parentId: dayNodeId,
      tags: entry.tags,
      relatedEntityIds: entry.relatedEntities,
      activationRule: { date: entry.startDate, recurrence: 'once' },
      recallPolicy: { level: 'summary', priority: 'normal' },
      now
    })
  }
  return createCharacterBrainTraceEventTreeNode(character, {
    id,
    title: normalizedTitle || t('brain.roleWorkspace.unnamedEvent'),
    summary: entry.summary,
    content: entry.content,
    parentId: dayNodeId,
    tags: entry.tags,
    relatedEntityIds: entry.relatedEntities,
    now
  })
}

function setTrajectoryImportNodeConfirmed(character: Character, nodeId: string, confirmed: boolean, now: string) {
  const nextNodes = readCharacterBrainTraceNodes(character).map((node) => (
    node.id === nodeId
      ? { ...node, confirmed, updatedAt: now }
      : node
  ))
  return buildCharacterBrainTraceNodesChange(nextNodes)
}

function makeUniqueTrajectoryImportNodeId(baseId: string, nodes: CharacterBrainTraceNode[]) {
  const usedIds = new Set(nodes.map((node) => node.id))
  let id = baseId
  let index = 1
  while (usedIds.has(id)) {
    id = `${baseId}_${index}`
    index += 1
  }
  return id
}

function encodeTrajectoryImportIdSegment(value: string) {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'untitled'
}

function isTrajectoryImportEntryInScope(
  entry: TrajectoryMarkdownImportEntry,
  rootUnitIds: string[],
  traceNodes: CharacterBrainTraceNode[]
) {
  return rootUnitIds.some((unitId) => {
    const unit = unitById.value.get(unitId)
    if (!unit || getRoleBrainUnitSection(unit) !== 'trace') return false
    if (unit.unitType === 'trace') return true
    const node = traceNodes.find((item) => item.id === unit.sourceId)
    if (!node) return false
    const startDate = node.startDate || node.pointDate
    const endDate = normalizeImportRangeEnd(node.endDate || node.pointDate || node.startDate)
    if (entry.granularity === 'day' || entry.granularity === 'month') {
      return entry.startDate >= startDate && entry.startDate <= endDate
    }
    return entry.startDate >= startDate && entry.endDate <= endDate
  })
}

function isSingleTrajectoryRootImport(unitIds: string | string[]) {
  const normalizedIds = normalizeUnitIdsInput(unitIds)
  if (normalizedIds.length !== 1) return false
  const unit = unitById.value.get(normalizedIds[0])
  return unit?.unitType === 'trace'
}

function parseImportDateParts(value: string) {
  const match = String(value || '').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/)
  return {
    year: Number(match?.[1] || 0),
    month: Number(match?.[2] || 0),
    day: Number(match?.[3] || 0)
  }
}

function normalizeImportRangeEnd(value: string) {
  const parts = parseImportDateParts(value)
  if (!parts.year) return value
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month || 12).padStart(2, '0')}-${String(parts.day || 31).padStart(2, '0')}`
}

async function importCompactRelationMarkdown(rootUnitIds: string | string[], text: string) {
  const character = resolveEditableCharacter()
  if (!character) return
  const exportId = extractCompactRelationExportId(text)
  const mapping = loadCompactRelationExportMapping(exportId)
  const parsed = parseCompactRelationMarkdown(text, mapping)
  const targetByRefId = buildRoleBrainCompilePageImportTargets(rootUnitIds)
  const targetByUnitId = new Map([...targetByRefId.values()].map((target) => [target.unit.unitId, target] as const))
  const updates = new Map<string, { unit: UnitView; relationHints: string[] }>()
  const unitBySourceId = new Map<string, UnitView>()
  let skipped = parsed.warnings.length

  parsed.relationHintsByUnitId.forEach((relationHints, unitId) => {
    const target = targetByUnitId.get(unitId)
    if (!target) {
      skipped += relationHints.length
      return
    }
    updates.set(target.sourceId, { unit: target.unit, relationHints })
    unitBySourceId.set(target.sourceId, target.unit)
  })

  if (!updates.size) {
    if (parsed.warnings.length) console.warn('关系整合导入失败', parsed.warnings)
    return
  }

  const plan = createCompactRelationImportPlan({
    units: [...updates.entries()].map(([sourceId, update]) => ({
      unitId: sourceId,
      title: update.unit.title || t('brain.roleWorkspace.unnamedUnit'),
      currentRelationHints: getRoleBrainCompilePageCurrent(character, update.unit).relationHints,
      incomingRelationHints: update.relationHints
    })),
    skipped,
    warnings: parsed.warnings.map((warning) => warning.message)
  })
  if (!plan.items.length) return
  const decisions = await resolveCompactRelationImportReview(plan)
  if (!decisions) return
  const stats = countCompactRelationImportPlan(plan, decisions)
  if (!stats.add && !stats.replace) return

  const planItemsBySourceId = new Map<string, typeof plan.items>()
  plan.items.forEach((item) => {
    const list = planItemsBySourceId.get(item.unitId) || []
    list.push(item)
    planItemsBySourceId.set(item.unitId, list)
  })

  const now = new Date().toISOString()
  const nextDocuments = {
    ...readCharacterBrainDocuments(character)
  }
  const compilePageBySourceId = new Map<string, CharacterBrainCompilePage>()
  updates.forEach((update, sourceId) => {
    const unit = update.unit
    const current = getRoleBrainCompilePageCurrent(character, unit)
    const reviewItems = planItemsBySourceId.get(sourceId) || []
    const relationHints = applyCompactRelationImportDecisions(current.relationHints, reviewItems, decisions)
    if (areStringListsEqual(current.relationHints, relationHints)) return
    const nextCompilePage: CharacterBrainCompilePage = {
      summary: current.summary,
      tags: [...current.tags],
      relationHints,
      semanticType: normalizeUnitSemanticType(current.semanticType),
      updatedAt: now
    }
    compilePageBySourceId.set(sourceId, nextCompilePage)
    nextDocuments[buildCharacterBrainCompileDocumentKey(sourceId)] = JSON.stringify(nextCompilePage)
  })

  let nextChanges: Record<string, unknown> = {
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }
  if (!compilePageBySourceId.size) return

  const nextCognitionNodes = readCharacterBrainCognitionNodes(character).map((node) => {
    const compilePage = compilePageBySourceId.get(node.id)
    const unit = unitBySourceId.get(node.id)
    if (!compilePage || !unit || getRoleBrainUnitSection(unit) !== 'soul') return node
    return {
      ...node,
      summary: compilePage.summary || node.summary,
      tags: [...compilePage.tags],
      relationHints: [...compilePage.relationHints],
      compilePage,
      updatedAt: now
    }
  })
  const nextTraceNodes = readCharacterBrainTraceNodes(character).map((node) => {
    const compilePage = compilePageBySourceId.get(node.id)
    const unit = unitBySourceId.get(node.id)
    if (!compilePage || !unit || getRoleBrainUnitSection(unit) !== 'trace') return node
    return {
      ...node,
      summary: compilePage.summary || node.summary,
      note: compilePage.summary || node.note,
      tags: [...compilePage.tags],
      updatedAt: now
    }
  })

  nextChanges = {
    ...nextChanges,
    ...buildCharacterBrainCognitionNodesChange(nextCognitionNodes),
    ...buildCharacterBrainTraceNodesChange(nextTraceNodes)
  }

  if (parsed.warnings.length || skipped) console.warn('关系整合导入跳过项', { skipped, warnings: parsed.warnings })
  persistRoleBrainImportChanges(character, nextChanges, t('brain.roleWorkspace.op.importRelationCompact'))
}

async function importCompilePageMarkdownBatch(
  rootUnitIds: string | string[],
  batch: ReturnType<typeof parseCompilePageMarkdownBatch>,
  options: CompileImportDecisionOptions = {}
) {
  const character = resolveEditableCharacter()
  if (!character) return false
  const decisionOptions = {
    ...options,
    sourceCharacterId: String((character as { id?: unknown }).id || options.sourceCharacterId || '')
  }
  const targetByRefId = buildRoleBrainCompilePageImportTargets(rootUnitIds)
  const now = new Date().toISOString()
  const compilePageBySourceId = new Map<string, CharacterBrainCompilePage>()
  const unitBySourceId = new Map<string, UnitView>()
  const incomingBySourceId = new Map<string, CompilePageImportIncoming>()
  let skipped = batch.warnings.length

  batch.entries.forEach((entry) => {
    const target = targetByRefId.get(entry.targetRefId)
    if (!target) {
      skipped += 1
      return
    }
    incomingBySourceId.set(target.sourceId, buildRoleBrainIncomingCompilePage(entry.compilePage, entry.semanticType))
    unitBySourceId.set(target.sourceId, target.unit)
  })

  if (!incomingBySourceId.size) {
    console.warn('批量导入角色编译页没有匹配到当前子树内单位', batch)
    return false
  }

  const plan: CompilePageImportPlan = {
    units: [...incomingBySourceId.entries()].map(([sourceId, incoming]) => {
      const unit = unitBySourceId.get(sourceId)
      return createRoleBrainCompilePageImportUnitPlan(character, unit as UnitView, incoming)
    }),
    skipped
  }
  const decisions = await resolveCompileImportDecisions(plan, decisionOptions)
  if (!decisions) return false

  incomingBySourceId.forEach((incoming, sourceId) => {
    const unit = unitBySourceId.get(sourceId)
    if (!unit) return
    const selected = applyCompilePageImportDecisions(
      getRoleBrainCompilePageCurrent(character, unit),
      incoming,
      decisions[unit.unitId]
    )
    compilePageBySourceId.set(sourceId, {
      summary: selected.summary,
      tags: [...selected.tags],
      relationHints: [...selected.relationHints],
      semanticType: selected.semanticType,
      updatedAt: now
    })
  })

  const nextDocuments = {
    ...readCharacterBrainDocuments(character)
  }
  compilePageBySourceId.forEach((compilePage, sourceId) => {
    nextDocuments[buildCharacterBrainCompileDocumentKey(sourceId)] = JSON.stringify(compilePage)
  })

  let nextChanges: Record<string, unknown> = {
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }

  const nextCognitionNodes = readCharacterBrainCognitionNodes(character).map((node) => {
    const compilePage = compilePageBySourceId.get(node.id)
    const unit = unitBySourceId.get(node.id)
    if (!compilePage || !unit || getRoleBrainUnitSection(unit) !== 'soul') return node
    return {
      ...node,
      summary: compilePage.summary || node.summary,
      tags: [...compilePage.tags],
      relationHints: [...compilePage.relationHints],
      compilePage,
      updatedAt: now
    }
  })
  const nextTraceNodes = readCharacterBrainTraceNodes(character).map((node) => {
    const compilePage = compilePageBySourceId.get(node.id)
    const unit = unitBySourceId.get(node.id)
    if (!compilePage || !unit || getRoleBrainUnitSection(unit) !== 'trace') return node
    return {
      ...node,
      summary: compilePage.summary || node.summary,
      note: compilePage.summary || node.note,
      tags: [...compilePage.tags],
      updatedAt: now
    }
  })

  nextChanges = {
    ...nextChanges,
    ...buildCharacterBrainCognitionNodesChange(nextCognitionNodes),
    ...buildCharacterBrainTraceNodesChange(nextTraceNodes)
  }

  if (batch.warnings.length || skipped) console.warn('批量导入角色编译页跳过项', { skipped, warnings: batch.warnings })
  persistRoleBrainImportChanges(character, nextChanges, t('brain.roleWorkspace.op.importCompilePageBatch'))
  return true
}

function buildRoleBrainIncomingCompilePage(
  compilePage: { summary?: string; tags?: string[]; relationHints?: string[] },
  semanticType?: UnitSemanticType
): CompilePageImportIncoming {
  return {
    summary: String(compilePage.summary || '').trim(),
    tags: Array.isArray(compilePage.tags) ? [...compilePage.tags] : [],
    relationHints: Array.isArray(compilePage.relationHints) ? [...compilePage.relationHints] : [],
    semanticType: normalizeUnitSemanticType(semanticType)
  }
}

function getRoleBrainCompilePageCurrent(character: Character, unit: UnitView) {
  const sourceId = String(unit.sourceId || '').trim()
  const compilePage = sourceId ? readCharacterBrainCompilePage(character, sourceId) : null
  return {
    summary: compilePage?.summary || unit.compilePage?.summary || unit.body || '',
    tags: [...(compilePage?.tags || unit.compilePage?.tags || [])],
    relationHints: [...(compilePage?.relationHints || unit.compilePage?.relationHints || [])],
    semanticType: normalizeUnitSemanticType(compilePage?.semanticType || unit.semanticType)
  }
}

function createRoleBrainCompilePageImportUnitPlan(
  character: Character,
  unit: UnitView,
  incoming: CompilePageImportIncoming
) {
  return createCompilePageImportUnitPlan({
    unitId: unit.unitId,
    title: unit.title || t('brain.roleWorkspace.unnamedUnit'),
    path: unit.sourcePath,
    current: getRoleBrainCompilePageCurrent(character, unit),
    incoming
  })
}

function resolveCompileImportDecisions(
  plan: CompilePageImportPlan,
  options: CompileImportDecisionOptions = {}
) {
  if (!hasCompilePageImportConflicts(plan)) {
    return Promise.resolve(createDefaultCompilePageImportDecisions(plan))
  }
  options.onWaitConfirmation?.(plan.units.length)
  return new Promise<CompilePageImportDecisionMap | null>((resolve) => {
    pendingRoleBrainCompileImport = {
      id: `role-brain-compile-import:${Date.now()}`,
      sourceCharacterId: String(options.sourceCharacterId || ''),
      plan,
      resolve
    }
    pendingCompileImportResolver.value = resolve
    compileImportConflictDialog.value = { open: true, plan }
  })
}

function cancelCompileImportConflictDialog() {
  const resolver = pendingCompileImportResolver.value || pendingRoleBrainCompileImport?.resolve
  pendingRoleBrainCompileImport = null
  pendingCompileImportResolver.value = null
  compileImportConflictDialog.value = { open: false, plan: { units: [] } }
  resolver?.(null)
}

function applyCompileImportConflictDialog(decisions: CompilePageImportDecisionMap) {
  const resolver = pendingCompileImportResolver.value || pendingRoleBrainCompileImport?.resolve
  pendingRoleBrainCompileImport = null
  pendingCompileImportResolver.value = null
  compileImportConflictDialog.value = { open: false, plan: { units: [] } }
  resolver?.(decisions)
}

function reopenPendingCompileImportDialogIfNeeded() {
  const pending = pendingRoleBrainCompileImport
  if (!pending) return
  const characterId = String((props.entity as { id?: unknown } | null | undefined)?.id || '')
  if (pending.sourceCharacterId && characterId && pending.sourceCharacterId !== characterId) return
  pendingCompileImportResolver.value = pending.resolve
  compileImportConflictDialog.value = { open: true, plan: pending.plan }
}

function resolveCompactRelationImportReview(plan: CompactRelationImportPlan) {
  return new Promise<CompactRelationImportDecisionMap | null>((resolve) => {
    pendingCompactRelationImportResolver.value = resolve
    compactRelationImportReviewDialog.value = { open: true, plan }
  })
}

function cancelCompactRelationImportReview() {
  const resolver = pendingCompactRelationImportResolver.value
  pendingCompactRelationImportResolver.value = null
  compactRelationImportReviewDialog.value = { open: false, plan: { items: [], skipped: 0, warnings: [] } }
  resolver?.(null)
}

function applyCompactRelationImportReview(decisions: CompactRelationImportDecisionMap) {
  const resolver = pendingCompactRelationImportResolver.value
  pendingCompactRelationImportResolver.value = null
  compactRelationImportReviewDialog.value = { open: false, plan: { items: [], skipped: 0, warnings: [] } }
  resolver?.(decisions)
}

function buildRoleBrainCompilePageImportTargets(rootUnitIds: string | string[]) {
  const rootIds = new Set(normalizeUnitIdsInput(rootUnitIds).flatMap((unitId) => [unitId, ...collectDescendantUnitIds(unitId)]))
  const targetByRefId = new Map<string, { sourceId: string; unit: UnitView }>()
  rootIds.forEach((unitId) => {
    const unit = unitById.value.get(unitId)
    if (!unit || !isCompilePageWritableRoleBrainUnit(unit)) return
    const sourceId = String(unit.sourceId || '').trim()
    if (!sourceId) return
    const target = { sourceId, unit }
    ;[
      getUnitRelationRefId(unit),
      unit.unitId,
      unit.sourceId
    ].forEach((refId) => {
      const normalizedRefId = String(refId || '').trim()
      if (normalizedRefId) targetByRefId.set(normalizedRefId, target)
    })
  })
  return targetByRefId
}

function buildRoleBrainBodyImportTargets(rootUnitIds: string | string[]) {
  const rootIds = new Set(normalizeUnitIdsInput(rootUnitIds).flatMap((unitId) => [unitId, ...collectDescendantUnitIds(unitId)]))
  const targetByRefId = new Map<string, { sourceId: string; unit: UnitView }>()
  rootIds.forEach((unitId) => {
    const unit = unitById.value.get(unitId)
    if (!unit || !isBodyWritableRoleBrainUnit(unit)) return
    const sourceId = String(unit.sourceId || '').trim()
    if (!sourceId) return
    const target = { sourceId, unit }
    ;[
      getUnitRelationRefId(unit),
      unit.unitId,
      unit.sourceId
    ].forEach((refId) => {
      const normalizedRefId = String(refId || '').trim()
      if (normalizedRefId) targetByRefId.set(normalizedRefId, target)
    })
  })
  return targetByRefId
}

function sanitizeJsonFileName(value: string) {
  return String(value || 'unit-tree').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'unit-tree'
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('.sidebar-tree-rows__row-menu') || target.closest('.sidebar-row-action')) return
  roleUnitSelection.closeMenu()
  clearFloatingMenuPosition()
}

watch(() => String((props.entity as { id?: unknown } | null | undefined)?.id || ''), () => {
  reopenPendingCompileImportDialogIfNeeded()
})

/** 星依功能桥注销函数（onMounted 注册 → onBeforeUnmount 注销）。 */
let unregisterXingyiRoleBrainProvider: (() => void) | null = null

onMounted(() => {
  // 星依批次2：把角色大脑侧「生成编译页/优化关系」按钮同款 handler 注册给星依工具（双入口一真值）
  unregisterXingyiRoleBrainProvider = registerXingyiFunctionProvider('characterBrainUnits', {
    contextLabel: () => String(resolveEditableCharacter()?.name || (props.entity as { name?: unknown } | null)?.name || t('brain.roleWorkspace.currentCharacter')),
    listUnits: () => unitView.value.units.map((unit) => ({ unitId: unit.unitId, title: unit.title })),
    generateCompilePage: (unitIds, sourceLabel) => runRoleBrainAgentGenerateCompilePage(unitIds, sourceLabel),
    optimizeRelations: (unitIds, sourceLabel) => runRoleBrainAgentOptimizeRelations(unitIds, sourceLabel),
    readCompilePage: (unitId) => {
      const unit = unitView.value.units.find((item) => item.unitId === unitId)
      if (!unit) return null
      return {
        title: unit.title,
        refId: String(unit.metadata?.relationRefId || ''),
        summary: String(unit.compilePage?.summary || ''),
        tags: [...(unit.compilePage?.tags || [])],
        semanticType: String(unit.semanticType || 'other'),
        relationHints: [...(unit.compilePage?.relationHints || [])]
      }
    },
    importCompilePageMarkdown: async (unitIds, markdown) => {
      try {
        const imported = await importCompilePageMarkdown(unitIds, markdown)
        return imported
          ? { ok: true, message: t('brain.roleWorkspace.agent.compileModifyImported') }
          : { ok: false, message: t('brain.roleWorkspace.agent.compileModifyIncomplete') }
      } catch (error) {
        return { ok: false, message: t('brain.roleWorkspace.agent.compileModifyFailed', { error: error instanceof Error ? error.message : String(error) }) }
      }
    }
  })
  reopenPendingCompileImportDialogIfNeeded()
  if (typeof window === 'undefined') return
  window.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('keydown', handleGlobalShortcut)
})

onBeforeUnmount(() => {
  unregisterXingyiRoleBrainProvider?.()
  unregisterXingyiRoleBrainProvider = null
  roleBrainProjection.cancel()
  detachPendingRoleBrainDialogs()
  if (typeof window === 'undefined') return
  window.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('keydown', handleGlobalShortcut)
})

function detachPendingRoleBrainDialogs() {
  pendingCompileImportResolver.value = null
  compileImportConflictDialog.value = { open: false, plan: { units: [] } }

  const relationResolver = pendingCompactRelationImportResolver.value
  pendingCompactRelationImportResolver.value = null
  compactRelationImportReviewDialog.value = { open: false, plan: { items: [], skipped: 0, warnings: [] } }
  relationResolver?.(null)
}
</script>

<style scoped>
.role-brain-tree-shell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--morandi-bg, #f8f4ee);
  overflow: hidden;
}

.role-brain-tree-toolbar {
  position: relative;
  z-index: 4;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  min-height: 30px;
  padding: 0 0 4px;
  background: var(--morandi-bg, #f8f4ee);
}

.role-brain-tree-toolbar__surface {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  max-width: 100%;
  padding: 1px 4px;
  border-radius: 8px;
  background: var(--morandi-bg, #f8f4ee);
}

.role-brain-tree-scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-width: 100%;
  background: var(--morandi-bg, #f8f4ee);
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: 2px;
}

.role-brain-tree-toolbar__btn,
.role-brain-sort-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #657163;
  cursor: pointer;
}

.role-brain-tree-toolbar__btn:hover:not(:disabled),
.role-brain-sort-btn:hover:not(:disabled) {
  background: transparent;
  color: #556b59;
}

.role-brain-tree-toolbar__btn:disabled,
.role-brain-sort-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.role-brain-tree-toolbar__icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.role-brain-tree {
  flex: 0 0 auto;
  width: 100%;
  padding: 2px 0 6px 0;
}

.role-brain-tree-dialog-form {
  display: grid;
  gap: 12px;
}

.role-brain-tree-field {
  display: grid;
  gap: 6px;
  color: var(--morandi-text-light);
  font-size: 0.88rem;
}

.role-brain-tree-field input,
.role-brain-tree-field select {
  min-height: 36px;
  border: 1px solid rgba(198, 188, 176, 0.82);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--langhuan-dialog-input-bg);
  color: var(--morandi-text);
}

.role-brain-tree-trace-create {
  display: grid;
  gap: 12px;
}

.role-brain-tree-trace-create__granularity {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.role-brain-tree-trace-create__granularity-button {
  display: grid;
  gap: 3px;
  min-height: 66px;
  border: 1px solid rgba(198, 188, 176, 0.82);
  border-radius: 8px;
  padding: 10px;
  background: var(--morandi-card);
  color: var(--morandi-text-light);
  text-align: left;
  cursor: pointer;
}

.role-brain-tree-trace-create__granularity-button.active {
  border-color: rgba(126, 167, 157, 0.7);
  background: rgba(126, 167, 157, 0.12);
  color: #435c55;
}

.role-brain-tree-trace-create__granularity-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.role-brain-tree-trace-create__granularity-button span {
  font-weight: 700;
  font-size: 0.92rem;
}

.role-brain-tree-trace-create__granularity-button small {
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.role-brain-tree-dialog-action {
  min-width: 112px;
  height: 42px;
  border-radius: 12px;
  padding: 0 18px;
  font: inherit;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
}

.role-brain-tree-dialog-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.role-brain-tree-dialog-action--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.role-brain-tree-dialog-action--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.role-brain-tree-dialog-actions--trace {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.role-brain-tree-dialog-actions__right {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.role-brain-sort-shell {
  display: grid;
  padding: 12px 14px;
  max-height: min(58vh, 460px);
  overflow: auto;
}

.role-brain-sort-list {
  display: grid;
  gap: 0;
}

.role-brain-sort-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  gap: 12px;
  margin-top: 8px;
  padding: 0 10px 0 12px;
  border: 1px solid rgba(198, 188, 176, 0.64);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  color: var(--morandi-text);
}

.role-brain-sort-item--selected {
  border-color: rgba(126, 167, 157, 0.36);
  background: rgba(126, 167, 157, 0.08);
}

.role-brain-sort-item:first-child {
  margin-top: 0;
}

.role-brain-sort-item--join-top {
  margin-top: -1px;
  border-top-color: transparent;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.role-brain-sort-item--join-bottom {
  border-bottom-color: transparent;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.role-brain-sort-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
  line-height: 1.2;
}

.role-brain-sort-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.role-brain-sort-move,
.role-brain-sort-enter-active,
.role-brain-sort-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.role-brain-sort-enter-from,
.role-brain-sort-leave-to {
  opacity: 0.7;
  transform: translateY(6px);
}
</style>
