<template>
  <section class="brain-workspace">
    <div class="brain-workspace__board">
      <div ref="canvasShellRef" class="brain-workspace__canvas-shell">
        <div class="brain-workspace__toolbar">
          <div class="brain-workspace__toolbar-actions">
            <label class="brain-workspace__density-control">
              <span class="brain-workspace__control-token" aria-hidden="true">{{ $t('brain.workspace.densityToken') }}</span>
              <select
                ref="densitySelectRef"
                v-model.number="minDensity"
                class="brain-workspace__density-select"
                :title="$t('brain.workspace.minDensity')"
                :aria-label="$t('brain.workspace.minDensity')"
                @change="handleDensityChange"
              >
                <option v-for="value in densityOptions" :key="value" :value="value">
                  {{ value }}
                </option>
              </select>
            </label>
            <label class="brain-workspace__label-size-control">
              <span class="brain-workspace__control-token" aria-hidden="true">{{ $t('brain.workspace.labelSizeToken') }}</span>
              <select
                v-model.number="nodeLabelBaseSize"
                class="brain-workspace__label-size-select"
                :title="$t('brain.workspace.nodeLabelSize')"
                :aria-label="$t('brain.workspace.nodeLabelSize')"
                @change="handleNodeLabelSizeChange"
              >
                <option v-for="option in nodeLabelSizeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <button
              v-if="isRelationInteractionMode"
              type="button"
              class="brain-workspace__icon-btn"
              :title="$t('brain.workspace.settleLayout')"
              :aria-label="$t('brain.workspace.settleLayout')"
              @click.stop="settleCurrentNodePositions"
            >
              <svg class="brain-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v18"></path>
                <path d="m8 7 4-4 4 4"></path>
                <path d="m8 17 4 4 4-4"></path>
                <path d="M3 12h18"></path>
                <path d="m7 8-4 4 4 4"></path>
                <path d="m17 8 4 4-4 4"></path>
              </svg>
            </button>
            <button
              type="button"
              class="brain-workspace__icon-btn"
              :disabled="!canUndoBrainOps"
              :title="$t('brain.card.undo')"
              :aria-label="$t('brain.card.undo')"
              @click.stop="undoBrainOps"
            >
              <svg class="brain-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 14 4 9l5-5"></path>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"></path>
              </svg>
            </button>
            <button
              type="button"
              class="brain-workspace__icon-btn"
              :disabled="!canRedoBrainOps"
              :title="$t('brain.card.redo')"
              :aria-label="$t('brain.card.redo')"
              @click.stop="redoBrainOps"
            >
              <svg class="brain-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 14 5-5-5-5"></path>
                <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"></path>
              </svg>
            </button>
            <button
              v-if="!isEmbeddedMode"
              type="button"
              class="brain-workspace__icon-btn"
              :class="{ 'brain-workspace__icon-btn--active': chatMiniOpen }"
              :title="$t('brain.workspace.expandMiniChat')"
              :aria-label="$t('brain.workspace.expandMiniChat')"
              :aria-pressed="chatMiniOpen"
              @click.stop="toggleMiniChat"
            >
              <svg class="brain-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 6.5h14v9H8l-3 3v-12z"></path>
                <path d="M9 10h6"></path>
                <path d="M9 13h4"></path>
              </svg>
            </button>
            <button v-if="!isEmbeddedMode" type="button" class="brain-workspace__icon-btn" :aria-label="$t('brain.workspace.backToChat')" :title="$t('brain.workspace.backToChat')" @click="$emit('close')">
              <svg class="brain-workspace__toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <svg
          ref="svgRef"
          :class="[
            'brain-workspace__canvas',
            {
              'brain-workspace__canvas--pannable': isPannable,
              'brain-workspace__canvas--panning': interactionState?.mode === 'pan',
              'brain-workspace__canvas--selecting': interactionState?.mode === 'select'
            }
          ]"
          viewBox="0 0 1000 700"
          preserveAspectRatio="xMidYMid meet"
          @wheel.prevent="handleWheel"
          @contextmenu.prevent="handleCanvasContextMenu"
          @pointerdown="startCanvasInteraction"
          @pointermove="handlePointerMove"
          @pointerup="endInteraction"
          @pointercancel="endInteraction"
        >
          <g :transform="viewportTransform">
            <g class="brain-workspace__edges">
              <path
                v-for="edge in visibleEdges"
                :key="edge.id"
                :d="edge.path"
                :class="['brain-workspace__edge', `brain-workspace__edge--density-${edge.density}`, `brain-workspace__edge--${edge.kind}`, edgeFocusClass(edge)]"
              />
            </g>

            <g
              v-for="node in displayedSceneNodes"
              :key="node.id"
              class="brain-node"
              :class="[
                `brain-node--size-${nodeRenderSize(node)}`,
                `brain-node--density-${nodeRenderDensity(node)}`,
                {
                  'brain-node--dragging': isDraggingNode(node.id),
                  'brain-node--layout-folder': node.layoutMode === 'folder',
                  'brain-node--cut-pending': isClipboardCutPending(node.id),
                  'brain-node--clipboard-copy': isClipboardCopyPending(node.id),
                  'brain-node--pending-create': isPendingCreateNode(node.id),
                  'brain-node--pending-update': isPendingUpdateNode(node.id)
                },
                nodeFocusClass(node.id)
              ]"
              :transform="`translate(${node.x}, ${node.y})`"
              @pointerenter="setHoveredNode(node.id)"
              @pointerleave="clearHoveredNode(node.id)"
              @pointerdown="startNodeDrag(node.id, $event)"
              @click="handleNodeClick(node.id, $event)"
              @contextmenu.prevent.stop="openNodeContextMenu(node.id, $event)"
            >
              <title>{{ nodeTooltipTitle(node) }}</title>
              <g class="brain-node__marker" :transform="nodeMarkerTransform">
                <circle
                  class="brain-node__hit-area"
                  :r="nodeHitRadius(nodeRenderSize(node))"
                />
                <circle
                  class="brain-node__dot"
                  :r="nodeRadius(nodeRenderSize(node))"
                />
                <path
                  v-if="isPendingNode(node.id)"
                  class="brain-node__pending-arc"
                  :d="buildPendingArcPath(nodeRenderSize(node))"
                />
              </g>
              <g v-if="shouldShowNodeLabels" :transform="nodeLabelTransform">
                <text
                  class="brain-node__label"
                  :style="nodeLabelStyle"
                  :text-anchor="nodeLabelPlacement(node).textAnchor"
                  :dominant-baseline="nodeLabelPlacement(node).dominantBaseline"
                  :x="nodeLabelPlacement(node).x"
                  :y="nodeLabelPlacement(node).y"
                >
                  <tspan
                    v-for="(line, index) in nodeTitleLines(node)"
                    :key="`${node.id}:title:${index}`"
                    :x="nodeLabelPlacement(node).x"
                    :dy="index === 0 ? 0 : '1.15em'"
                  >
                    {{ line }}
                  </tspan>
                </text>
                <text
                  v-if="nodeSecondaryLabel(node)"
                  class="brain-node__sub-label"
                  :style="nodeSubLabelStyle"
                  :text-anchor="nodeLabelPlacement(node).textAnchor"
                  dominant-baseline="hanging"
                  :x="nodeLabelPlacement(node).x"
                  :y="nodeSecondaryLabelY(node)"
                >
                  {{ nodeSecondaryLabel(node) }}
                </text>
              </g>
            </g>
            <rect
              v-if="selectionBox"
              class="brain-workspace__selection-box"
              :x="selectionBox.x"
              :y="selectionBox.y"
              :width="selectionBox.width"
              :height="selectionBox.height"
            />
          </g>
        </svg>

        <div
          v-if="chatMiniOpen"
          ref="miniChatRef"
          class="brain-workspace__mini-chat"
          :style="miniChatStyle"
          @pointerdown.stop
          @wheel.stop
          @contextmenu.prevent
          @selectstart.prevent
          @dragstart.prevent
          @auxclick.prevent
        >
          <slot name="mini-chat" :start-drag="startMiniChatDrag"></slot>
          <button
            v-for="corner in miniChatResizeCorners"
            :key="`mini-chat-resize:${corner}`"
            type="button"
            class="brain-workspace__resize-handle"
            :class="`brain-workspace__resize-handle--${corner}`"
            :aria-label="$t('brain.workspace.resizeMiniChat')"
            :title="$t('brain.workspace.resizeMiniChat')"
            @pointerdown="startMiniChatResize(corner, $event)"
          ></button>
        </div>

        <div
          v-for="card in positionedCards"
          :key="card.id"
          :data-card-id="card.id"
          class="brain-workspace__inline-card"
          :style="card.style"
        >
          <CharacterBrainCard
            :title="card.title"
            :content="card.content"
            :card-type="card.cardType"
            :editable="card.editable"
            :form-fields="card.formFields"
            :inner-entries="card.innerEntries"
            :link-draft="card.linkDraft"
            :compile-page="card.compilePage"
            :compile-page-editable="card.compilePageEditable"
            :compile-relation-hints-editable="card.compileRelationHintsEditable"
            :compile-relation-hint="card.compileRelationHint"
            :link-suggestions="linkSuggestions"
            :api-presets="apiPresets"
            :model-loading="modelLoadingPreset === card.id"
            :pending-review="card.pendingReview"
            @save="saveCard(card.nodeId, $event)"
            @confirm-pending="confirmPendingNode(card.nodeId)"
            @reject-pending="rejectPendingNode(card.nodeId)"
            @close="closeCard(card.id)"
            @minimize="minimizeCard(card.id)"
            @load-preset-models="loadCardPresetModels(card.id, $event)"
            @pin-drag-start="startCardPinDrag(card.id, $event)"
            @open-inner-entry="openTraceInnerEntryCard(card.nodeId, $event)"
          />
          <button
            v-for="corner in cardResizeCorners"
            :key="`card-resize:${card.id}:${corner}`"
            type="button"
            class="brain-workspace__resize-handle"
            :class="`brain-workspace__resize-handle--${corner}`"
            :aria-label="$t('brain.workspace.resizeCard')"
            :title="$t('brain.workspace.resizeCard')"
            @pointerdown.stop="startCardResize(card.id, corner, $event)"
          ></button>
        </div>

        <button
          v-for="card in minimizedCards"
          :key="`tab:${card.id}`"
          type="button"
          class="brain-workspace__edge-tab"
          :style="card.style"
          :title="card.title"
          @pointerdown.stop="startEdgeTabDrag(card.id, $event)"
        >
          {{ card.title }}
        </button>

        <SidebarFloatingMenu
          :open="Boolean(nodeContextMenu)"
          menu-class="brain-workspace__context-menu"
          :menu-style="nodeContextMenuStyle"
          clamp-to-viewport
        >
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            @pointerdown.stop
            @click.stop="handleNodeMenuOpenCard"
          >
            <span>{{ $t('brain.workspace.openCard') }}</span>
            <span class="brain-workspace__context-menu-shortcut">{{ $t('brain.workspace.contextMenuHint') }}</span>
          </button>
          <button
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canBrowseNodeMenuTarget"
            @pointerdown.stop
            @click.stop="handleNodeMenuBrowse"
          >
            <span>{{ $t('brain.workspace.browse') }}</span>
          </button>
          <button
            type="button"
            class="brain-workspace__context-menu-item"
            @pointerdown.stop
            @click.stop="handleNodeMenuToggleFocusPin"
          >
            <span>{{ isNodeMenuFocusPinned ? $t('brain.workspace.cancelKeepFocus') : $t('brain.workspace.keepFocus') }}</span>
          </button>
          <div v-if="!isReadOnlyMode" class="brain-workspace__context-menu-divider"></div>
          <button
            v-if="!isReadOnlyMode && canAddCognitionChild"
            type="button"
            class="brain-workspace__context-menu-item"
            @pointerdown.stop
            @click.stop="handleNodeMenuAddChild"
          >
            <span>{{ $t('brain.nodeForm.defaultTitle') }}</span>
          </button>
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canAddCognitionChild"
            @pointerdown.stop
            @click.stop="handleNodeMenuImportJson"
          >
            <span>{{ $t('brain.importDialog.title') }}</span>
            <span v-if="!canAddCognitionChild" class="brain-workspace__context-menu-shortcut">{{ $t('brain.workspace.pendingConnect') }}</span>
          </button>
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canAddCognitionChild"
            @pointerdown.stop
            @click.stop="handleNodeMenuImportWorldTree"
          >
            <span>{{ $t('brain.worldTreeImport.title') }}</span>
            <span v-if="!canAddCognitionChild" class="brain-workspace__context-menu-shortcut">{{ $t('brain.workspace.pendingConnect') }}</span>
          </button>
          <div class="brain-workspace__context-menu-divider"></div>
          <button
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canResetNodeMenuTargets"
            :title="$t('brain.workspace.resetPositionHint')"
            @pointerdown.stop
            @click.stop="handleNodeMenuResetPosition"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.resetSelectedPosition') : $t('brain.workspace.resetPosition') }}</span>
          </button>
          <button
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canPinNodeMenuTargets"
            @pointerdown.stop
            @click.stop="handleNodeMenuPinPosition"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.pinSelectedPosition') : $t('brain.workspace.pinPosition') }}</span>
          </button>
          <button
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canUnpinNodeMenuTargets"
            :title="$t('brain.workspace.clearPinnedHint')"
            @pointerdown.stop
            @click.stop="handleNodeMenuClearPinnedPosition"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.clearSelectedPinned') : $t('brain.workspace.clearPinned') }}</span>
          </button>
          <button
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canRearrangeNodeMenuTargets"
            :title="$t('brain.workspace.rearrangeHint')"
            @pointerdown.stop
            @click.stop="handleNodeMenuRearrangeChildren"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.rearrangeSelectedChildren') : $t('brain.workspace.rearrangeChildren') }}</span>
          </button>
          <div class="brain-workspace__context-menu-divider"></div>
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            @pointerdown.stop
            @click.stop="handleNodeMenuCopyPath"
          >
            <span>{{ $t('brain.workspace.copyPath') }}</span>
          </button>
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            @pointerdown.stop
            @click.stop="handleNodeMenuCopy"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.copySelectedNodes') : $t('brain.workspace.copyNode') }}</span>
            <span class="brain-workspace__context-menu-shortcut">Ctrl+C</span>
          </button>
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!canCutNodeMenuTargets"
            @pointerdown.stop
            @click.stop="handleNodeMenuCut"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.cutSelectedNodes') : $t('brain.workspace.cutNode') }}</span>
            <span class="brain-workspace__context-menu-shortcut">Ctrl+X</span>
          </button>
          <button
            v-if="!isReadOnlyMode"
            type="button"
            class="brain-workspace__context-menu-item"
            :disabled="!hasBrainClipboardData"
            @pointerdown.stop
            @click.stop="handleNodeMenuPaste"
          >
            <span>{{ $t('brain.workspace.pasteHere') }}</span>
            <span class="brain-workspace__context-menu-shortcut">Ctrl+V</span>
          </button>
          <div v-if="!isReadOnlyMode && canTrashNodeMenuTargets" class="brain-workspace__context-menu-divider"></div>
          <button
            v-if="!isReadOnlyMode && canTrashNodeMenuTargets"
            type="button"
            class="brain-workspace__context-menu-item brain-workspace__context-menu-item--danger brain-workspace__context-menu-item--submenu"
            @pointerenter.stop="openDeleteSubmenu"
            @pointerleave.stop="scheduleCloseDeleteSubmenu"
            @pointerdown.stop
            @click.stop="openDeleteSubmenu"
          >
            <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.deleteSelectedNodes') : $t('brain.workspace.deleteNode') }}</span>
            <span class="brain-workspace__context-menu-shortcut">&gt;</span>
          </button>
        </SidebarFloatingMenu>
        <SidebarFloatingMenu
          :open="Boolean(deleteSubmenu)"
          menu-class="brain-workspace__context-menu brain-workspace__context-menu--submenu"
          :menu-style="deleteSubmenuStyle"
          clamp-to-viewport
        >
          <div
            class="brain-workspace__context-submenu-shell"
            @pointerenter.stop="cancelCloseDeleteSubmenu"
            @pointerleave.stop="scheduleCloseDeleteSubmenu"
          >
            <button
              type="button"
              class="brain-workspace__context-menu-item brain-workspace__context-menu-item--danger"
              @pointerdown.stop
              @click.stop="handleNodeMenuDeleteCurrentOnly"
            >
              <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.deleteSelectedOnly') : $t('brain.workspace.deleteCurrentOnly') }}</span>
            </button>
            <button
              type="button"
              class="brain-workspace__context-menu-item brain-workspace__context-menu-item--danger"
              @pointerdown.stop
              @click.stop="handleNodeMenuDeleteCascade"
            >
              <span>{{ nodeMenuTargetIds.length > 1 ? $t('brain.workspace.deleteSelectedCascade') : $t('brain.workspace.deleteCascade') }}</span>
            </button>
          </div>
        </SidebarFloatingMenu>
        <AppConfirmDialog
          :open="permanentDeleteConfirmOpen"
          :title="$t('brain.workspace.deleteNode')"
          :message="permanentDeleteConfirmMessage"
          :confirm-text="$t('common.delete')"
          tone="danger"
          @cancel="closePermanentDeleteConfirm"
          @confirm="confirmPermanentDeleteNodes"
        />
        <CharacterBrainNodeFormDialog
          :open="cognitionNodeForm.open"
          :title="$t('brain.workspace.addSoulChildTitle')"
          :subtitle="cognitionNodeFormSubtitle"
          :saving="cognitionNodeForm.saving"
          @cancel="closeCognitionNodeForm"
          @submit="confirmCognitionNodeForm"
        />
        <CharacterBrainImportDialog
          :open="cognitionImportDialog.open"
          :parent-id="cognitionImportDialog.parentId"
          :parent-title="cognitionImportParentTitle"
          :existing-nodes="currentCognitionNodes"
          :saving="cognitionImportDialog.saving"
          @cancel="closeCognitionImportDialog"
          @submit="confirmCognitionImport"
        />
        <CharacterBrainWorldTreeImportDialog
          :open="worldTreeImportDialog.open"
          :parent-id="worldTreeImportDialog.parentId"
          :parent-title="worldTreeImportParentTitle"
          :existing-nodes="currentCognitionNodes"
          :documents="worldTreeDocuments"
          :saving="worldTreeImportDialog.saving"
          @cancel="closeWorldTreeImportDialog"
          @submit="confirmWorldTreeImport"
        />
        <CharacterBrainImportConflictDialog
          :open="importConflictDialog.open"
          :conflicts="importConflictDialog.conflicts"
          :saving="importConflictDialog.saving"
          @cancel="closeImportConflictDialog"
          @submit="confirmImportConflictDialog"
        />
      </div>
      <AppWorkspaceShell
        v-if="unitWorkspaceWindows.length"
        class="brain-workspace__unit-shell"
        :windows="unitWorkspaceWindows"
        :active-window-id="activeUnitWorkspaceWindowId"
        :aria-label="$t('brain.workspace.browseWindowAria')"
        @activate="activateUnitWorkspaceWindow"
        @close-window="closeUnitWorkspaceWindow"
      >
        <template #default="{ window }">
          <CharacterBrainUnitReadPane
            v-if="getUnitWorkspacePort(window)"
            :port="getUnitWorkspacePort(window)!"
          >
            <template #actions>
              <button
                type="button"
                :disabled="!canEditUnitWorkspacePort(getUnitWorkspacePort(window))"
                :title="canEditUnitWorkspacePort(getUnitWorkspacePort(window)) ? $t('common.edit') : $t('brain.workspace.unitNotEditable')"
                :aria-label="canEditUnitWorkspacePort(getUnitWorkspacePort(window)) ? $t('brain.workspace.editCurrentUnit') : $t('brain.workspace.unitNotEditable')"
                @click.stop="openUnitWorkspaceEditor(getUnitWorkspacePort(window))"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </template>
          </CharacterBrainUnitReadPane>
        </template>
      </AppWorkspaceShell>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCharacterStore } from '../../stores/characterStore'
import { useSettingStore } from '../../stores/settingStore'
import { API } from '../../config/api'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { useToast } from '../../composables/useToast'
import {
  buildCharacterBrainNodePositionsChange,
  normalizeNodePositionMap,
  readCharacterBrainNodePositions
} from '../../composables/useBrainNodePositions'
import {
  isTrajectoryViewNodeId,
  readCharacterBrainPinnedOffsets
} from '../../composables/useBrainPinnedOffsets'
import type { ApiPreset, BrainDocumentRecord, Character, UnitContentPort } from '../../types'
import type {
  CharacterBrainCardModel,
  CharacterBrainCognitionNode,
  CharacterBrainCognitionNodeKind,
  CharacterBrainImportConflict,
  CharacterBrainImportConflictAction,
  CharacterBrainImportDraft,
  CharacterBrainNodeDensity,
  CharacterBrainNodeLayoutMode,
  CharacterBrainNodeModel,
  CharacterBrainNodePosition,
  CharacterBrainNodeSize,
  CharacterBrainTraceNode
} from '../../types/characterBrain'
import type { UnitView } from '../../types/unitView'
import { applyCharacterBrainImportDraft, buildCharacterBrainImportPreview } from '../../app/characterBrainImport'
import {
  CHARACTER_BRAIN_MAX_VIEWPORT_SCALE,
  CHARACTER_BRAIN_MIN_VIEWPORT_SCALE,
  resolveCharacterBrainNodeMarkerScale,
  resolveCharacterBrainRadialDistance
} from '../../app/characterBrainViewport'
import {
  settleCharacterBrainRadialClusters,
  useCharacterBrainPhysics,
  type CharacterBrainNodeDragState,
  type CharacterBrainSimNode
} from '../../composables/useCharacterBrainPhysics'
import {
  clampBrainEdgeTabTop,
  clampBrainFloatingCardPosition,
  resolveBrainAttachedCardPosition
} from '../../composables/useBrainFloatingCards'
import {
  applyCharacterBrainCardDraft,
  buildCharacterBrainCognitionNodesChange,
  buildCharacterBrainTraceNodesChange,
  buildCharacterBrainTrajectoryMetaChange,
  buildCharacterBrainLinkSuggestions,
  buildCharacterBrainLinkedNodeTargets,
  buildCharacterBrainNodePath,
  buildCharacterBrainCard,
  buildCharacterBrainNodes,
  createCharacterBrainReadContext,
  getCharacterBrainNodeById,
  getCharacterBrainRootId,
  readCharacterBrainCognitionNodes,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from '../../app/characterBrain'
import {
  buildCharacterBrainWorkspaceProjection,
  getCharacterBrainProjectionNodeById,
  resolveUnitRelationProjectionNodeId
} from '../../app/characterBrainWorkspaceProjection'
import {
  sortTrajectoryNodes
} from '../../app/trajectoryCalendar'
import {
  createCharacterBrainSoulTreeNode
} from '../../app/characterBrainTreeModel'
import { buildCharacterBrainContentPorts } from '../../app/unitContentPort'
import type { WorkspaceWindowRecord } from '../../app/workspaceWindowProtocol'
import {
  activateWorkspaceWindow,
  closeWorkspaceWindow,
  createUnitWorkspaceWindow,
  createWorkspaceWindowState,
  upsertWorkspaceWindow
} from '../../app/workspaceWindowProtocol'
import { hasActiveBrowserTextSelection } from '../../utils/textSelection'
import CharacterBrainCard from './CharacterBrainCard.vue'
import CharacterBrainUnitReadPane from './CharacterBrainUnitReadPane.vue'
import CharacterBrainNodeFormDialog from './CharacterBrainNodeFormDialog.vue'
import CharacterBrainImportDialog from './CharacterBrainImportDialog.vue'
import CharacterBrainWorldTreeImportDialog from './CharacterBrainWorldTreeImportDialog.vue'
import CharacterBrainImportConflictDialog from './CharacterBrainImportConflictDialog.vue'
import SidebarFloatingMenu from '../common/SidebarFloatingMenu.vue'
import AppWorkspaceShell from '../common/AppWorkspaceShell.vue'
import AppConfirmDialog from '../common/AppConfirmDialog.vue'

type InteractionState =
  | CharacterBrainNodeDragState
  | {
      mode: 'pan'
      pointerId: number
      moved: boolean
      originX: number
      originY: number
      startOffsetX: number
      startOffsetY: number
    }
  | {
      mode: 'select'
      pointerId: number
      moved: boolean
      append: boolean
      originX: number
      originY: number
      currentX: number
      currentY: number
    }

type NodeContextMenuState = {
  nodeId: string
  x: number
  y: number
}

type ContextSubmenuState = {
  x: number
  y: number
}

type CardPlacement = {
  mode: 'detached' | 'minimized'
  left: number
  top: number
  width?: number
  height?: number
  restoreLeft?: number
  restoreTop?: number
  restoreWidth?: number
  restoreHeight?: number
}

type MiniChatPlacement = {
  left: number
  top: number
}

type MiniChatSize = {
  width: number
  height: number
}

type BrainWorkspaceEdge = {
  id: string
  sourceId: string
  targetId: string
  kind: 'tree' | 'link'
  density: CharacterBrainNodeDensity
  path: string
}

type ProjectionRelationEdgeInput = {
  id: string
  sourceNodeId: string
  targetNodeId: string
}

type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

type NodeSessionOffset = {
  x: number
  y: number
}

type NodeWorldPosition = CharacterBrainNodePosition

type SelectionBox = {
  x: number
  y: number
  width: number
  height: number
}

type BrainWorkspaceCustomNode = {
  id: string
  title: string
  summary: string
  kind: CharacterBrainNodeModel['kind']
  parentId: string
  sourceId?: string
  createdAt?: string
}

type BrainWorkspaceClipboardNode = BrainWorkspaceCustomNode & {
  sourceParentId?: string
}

type BrainWorkspaceClipboardState = {
  mode: '' | 'copy' | 'cut'
  ids: string[]
  entries: BrainWorkspaceClipboardNode[]
}

type BrainOperationSnapshot = {
  customNodes: BrainWorkspaceCustomNode[]
  trashedNodeIds: string[]
  cognitionNodes: CharacterBrainCognitionNode[]
  traceNodes: CharacterBrainTraceNode[]
  trajectoryMeta: ReturnType<typeof readCharacterBrainTrajectoryMeta>
  nodeWorldPositions: Record<string, NodeWorldPosition>
  nodeSessionPositions: Record<string, NodeWorldPosition>
  historyPositionGroup: Record<string, NodeWorldPosition>
  layoutModes: Record<string, CharacterBrainNodeLayoutMode>
}

type CognitionNodeFormState = {
  open: boolean
  parentId: string
  saving: boolean
}

type CognitionImportDialogState = {
  open: boolean
  parentId: string
  saving: boolean
}

type ImportConflictDialogState = {
  open: boolean
  parentId: string
  actionLabel: string
  draft: CharacterBrainImportDraft | null
  conflicts: CharacterBrainImportConflict[]
  saving: boolean
}

const VIEWBOX_WIDTH = 1000
const VIEWBOX_HEIGHT = 700
const DEFAULT_VIEWPORT_OFFSET = { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 }
const DEFAULT_VIEWPORT_SCALE = 1 / 3
const MIN_VIEWPORT_SCALE = CHARACTER_BRAIN_MIN_VIEWPORT_SCALE
const MAX_VIEWPORT_SCALE = CHARACTER_BRAIN_MAX_VIEWPORT_SCALE
const WHEEL_ZOOM_STRENGTH = 0.0144
const WHEEL_ZOOM_MIN_FACTOR = 0.42
const WHEEL_ZOOM_MAX_FACTOR = 2.38
const WHEEL_ZOOM_ANIMATION_MS = 130
const WHEEL_ZOOM_DELTA_SOFTENING = 180
const NODE_LABEL_MIN_VIEWPORT_SCALE = 0.32
const DEFAULT_NODE_LABEL_FONT_SIZE = 14
const NODE_LABEL_FONT_SIZE_STORAGE_KEY = 'langhuan:character-brain-node-label-font-size'
const DEFAULT_MIN_DENSITY = 1
const MIN_DENSITY_STORAGE_KEY = 'langhuan:character-brain-min-density'
const CARD_EDGE_GAP = 12
const CARD_ATTACH_GAP = 16
const CARD_ESTIMATED_HEIGHT = 624
const EDGE_TAB_WIDTH = 112
const EDGE_TAB_HEIGHT = 34
const EDGE_TAB_TRIGGER_GAP = 8
const TRASH_STORAGE_PREFIX = 'langhuan:character-brain-trash:'
const CUSTOM_NODE_STORAGE_PREFIX = 'langhuan:character-brain-custom-nodes:'
const COGNITION_ROOT_NODE_ID = 'brain:cognition'
const COGNITION_NODE_ID_PREFIX = 'brain:cognition:node:'
const TRACE_ROOT_NODE_ID = 'brain:trajectory'
const TRACE_NODE_ID_PREFIX = 'brain:trajectory:node:'
const MINI_CHAT_DEFAULT_TOP = 50
const MINI_CHAT_RIGHT_GAP = 18
const MINI_CHAT_BOTTOM_GAP = 24
const MINI_CHAT_MIN_HEIGHT = 360
const MINI_CHAT_MIN_WIDTH = 360
const MINI_CHAT_DEFAULT_WIDTH = 988
const MINI_CHAT_SIZE_STORAGE_KEY = 'langhuan:character-brain-mini-chat:size'
const CARD_MIN_WIDTH = 300
const CARD_MIN_HEIGHT = 180
const DIRECT_FORM_NODE_IDS = new Set(['brain:avatar', 'brain:preset'])
const FOLDER_TRUNK_X_GAP = 20
const FOLDER_BRANCH_X_GAP = 12
const FOLDER_CHILD_Y_GAP = 12
const FOLDER_MIN_BRANCH_X_GAP = 8
const TRACE_SYNC_DEBOUNCE_MS = 220
const props = withDefaults(defineProps<{
  characterId: string
  embedded?: boolean
  readOnly?: boolean
  initialFocusNodeId?: string
  projectionUnits?: UnitView[]
  projectionRelationNodeIds?: string[]
  projectionRelationEdges?: ProjectionRelationEdgeInput[]
  projectionExactRelationMode?: boolean
  projectionCharacter?: Character | null
  projectionLayout?: 'default' | 'trajectoryAxis'
  projectionExpandedNodeIds?: string[]
  projectionForestRootNodeIds?: string[]
}>(), {
  embedded: false,
  readOnly: false,
  initialFocusNodeId: '',
  projectionUnits: () => [],
  projectionRelationNodeIds: () => [],
  projectionRelationEdges: () => [],
  projectionExactRelationMode: false,
  projectionCharacter: null,
  projectionLayout: 'default',
  projectionExpandedNodeIds: () => [],
  projectionForestRootNodeIds: () => []
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'projection-open', nodeId: string): void
}>()

const characterStore = useCharacterStore()
const settingStore = useSettingStore()
const runtimeStore = useWorkspaceRuntimeStore()
const { toast } = useToast(runtimeStore)
const { t } = useI18n()
const svgRef = ref<SVGSVGElement | null>(null)
const canvasShellRef = ref<HTMLElement | null>(null)
const miniChatRef = ref<HTMLElement | null>(null)
const densitySelectRef = ref<HTMLSelectElement | null>(null)
const focusedNodeId = ref(getCharacterBrainRootId())
const minDensity = ref(DEFAULT_MIN_DENSITY)
const openCards = ref<CharacterBrainCardModel[]>([])
const cardPlacements = ref<Record<string, CardPlacement>>({})
const viewportOffset = ref({ ...DEFAULT_VIEWPORT_OFFSET })
const viewportScale = ref(DEFAULT_VIEWPORT_SCALE)
const canvasScreenScale = ref(1)
const nodeLabelBaseSize = ref(DEFAULT_NODE_LABEL_FONT_SIZE)
const nodeWorldPositions = ref<Record<string, NodeWorldPosition>>({})
const nodeSessionPositions = ref<Record<string, NodeWorldPosition>>({})
const pinnedNodeOffsets = nodeWorldPositions
const persistentNodeOffsets = nodeWorldPositions
const nodeSessionOffsets = nodeSessionPositions
const layoutModes = ref<Record<string, CharacterBrainNodeLayoutMode>>({})
const interactionState = ref<InteractionState | null>(null)
const nodeContextMenu = ref<NodeContextMenuState | null>(null)
const deleteSubmenu = ref<ContextSubmenuState | null>(null)
const hoveredNodeId = ref('')
const pinnedFocusNodeId = ref('')
const selectedNodeIds = ref<string[]>([])
const trashedNodeIds = ref<string[]>([])
const customNodes = ref<BrainWorkspaceCustomNode[]>([])
const brainClipboard = ref<BrainWorkspaceClipboardState>({ mode: '', ids: [], entries: [] })
const brainUndoStack = ref<BrainOperationSnapshot[]>([])
const brainRedoStack = ref<BrainOperationSnapshot[]>([])
const trashMenuOpen = ref(false)
const cognitionNodeForm = reactive<CognitionNodeFormState>({
  open: false,
  parentId: '',
  saving: false
})
const cognitionImportDialog = reactive<CognitionImportDialogState>({
  open: false,
  parentId: '',
  saving: false
})
const worldTreeImportDialog = reactive<CognitionImportDialogState>({
  open: false,
  parentId: '',
  saving: false
})
const importConflictDialog = reactive<ImportConflictDialogState>({
  open: false,
  parentId: '',
  actionLabel: '',
  draft: null,
  conflicts: [],
  saving: false
})
const unitWorkspaceState = ref(createWorkspaceWindowState())
const modelLoadingPreset = ref('')
const pendingPermanentDeleteNodeIds = ref<string[]>([])
const pendingPermanentDeleteCascade = ref(false)
let deleteSubmenuCloseTimer: ReturnType<typeof setTimeout> | null = null
const chatMiniOpen = ref(false)
const miniChatPlacement = ref<MiniChatPlacement | null>(null)
const miniChatSize = ref<MiniChatSize | null>(null)
const isSpacePressed = ref(false)
const sceneCharacterId = ref('')
const skipSceneLayoutPreserveOnce = ref(false)
const renderedPhysicsNodeIdSet = ref<Set<string>>(new Set())
let rehydrateSceneScheduled = false
let hasFitInitialViewport = false
const densityOptions = [1, 2, 3, 4, 5] as const
const nodeLabelSizeOptions = [
  { value: 12, label: '12' },
  { value: 14, label: '14' },
  { value: 16, label: '16' },
  { value: 18, label: '18' }
]
const miniChatResizeCorners: ResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const cardResizeCorners: ResizeCorner[] = ['top-left', 'bottom-left', 'bottom-right']
let buildBrainClipboard: (nodeIds: string[], mode: 'copy' | 'cut') => BrainWorkspaceClipboardState | null = () => null
let pasteBrainClipboardIntoNode: (targetId: string) => void = () => {}
let clearBrainClipboard = () => {}
let isClipboardCutPending = (_nodeId: string) => false
let isClipboardCopyPending = (_nodeId: string) => false
let pushBrainHistorySnapshot = () => {}
let undoBrainOps = () => {}
let redoBrainOps = () => {}
let suppressNextNodeClick: { nodeId: string; altKey: boolean; until: number } | null = null
let nodePositionPersistTimer: number | ReturnType<typeof setTimeout> | null = null
let viewportZoomAnimationFrame: number | null = null
let viewportZoomAnimation: {
  startedAt: number
  duration: number
  fromScale: number
  toScale: number
  fromOffset: { x: number; y: number }
  toOffset: { x: number; y: number }
} | null = null
let canvasResizeObserver: ResizeObserver | null = null

function updateCanvasScreenScale() {
  if (!svgRef.value) {
    canvasScreenScale.value = 1
    return
  }
  const rect = svgRef.value.getBoundingClientRect()
  const nextScale = Math.min(
    rect.width > 0 ? rect.width / VIEWBOX_WIDTH : 1,
    rect.height > 0 ? rect.height / VIEWBOX_HEIGHT : 1
  )
  canvasScreenScale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1
}

const anchoredNodeIdSet = computed(() => {
  const ids = new Set<string>([getCharacterBrainRootId(), TRACE_ROOT_NODE_ID])
  Object.entries({ ...nodeWorldPositions.value, ...nodeSessionPositions.value }).forEach(([nodeId, position]) => {
    if (!position) return
    if (isTrajectoryViewNodeId(nodeId)) return
    ids.add(String(nodeId || '').trim())
  })
  return ids
})

const {
  sceneNodes,
  replaceSceneNodes,
  requestPhysicsTick,
  stepPhysics,
  stopPhysics
} = useCharacterBrainPhysics({
  viewBoxWidth: VIEWBOX_WIDTH,
  viewBoxHeight: VIEWBOX_HEIGHT,
  interactionState,
  nodeRadius,
  anchoredNodeIdSet,
  renderedNodeIdSet: renderedPhysicsNodeIdSet
})

const currentCharacter = computed<Character | null>(() => props.projectionCharacter || characterStore.getCharacter(props.characterId))
const completeTreeIndex = computed(() => {
  const parentMap = new Map<string, string>()
  const forestRootIds = new Set((props.projectionForestRootNodeIds || [])
    .map((nodeId) => String(nodeId || '').trim())
    .filter(Boolean))
  const character = currentCharacter.value
  if (character) {
    buildCharacterBrainLinkSuggestions(character).forEach((node) => {
      if (node.parentId) parentMap.set(node.id, String(node.parentId))
    })
    const readContext = createCharacterBrainReadContext(character)
    readContext.cognitionNodes.forEach((node) => parentMap.set(node.id, node.parentId))
    readContext.traceNodes.forEach((node) => parentMap.set(node.id, node.parentId))
  }
  customNodes.value.forEach((node) => parentMap.set(node.id, node.parentId))
  if (hasProjectionUnits.value) {
    const nodeIdByUnitId = new Map(props.projectionUnits.map((unit) => [
      unit.unitId,
      resolveUnitRelationProjectionNodeId(unit, props.characterId)
    ] as const))
    props.projectionUnits.forEach((unit) => {
      const nodeId = nodeIdByUnitId.get(unit.unitId) || ''
      const parentId = unit.parentId ? nodeIdByUnitId.get(unit.parentId) || '' : ''
      if (!nodeId || !parentId || forestRootIds.has(nodeId)) return
      parentMap.set(nodeId, parentId)
    })
  }
  sceneNodes.value.forEach((node) => {
    if (node.parentId && node.edgeKind !== 'link') parentMap.set(node.id, String(node.parentId))
  })
  const trashed = new Set(trashedNodeIds.value)
  const childrenByParent = new Map<string, string[]>()
  parentMap.forEach((parentId, nodeId) => {
    if (!parentId || trashed.has(nodeId)) return
    const children = childrenByParent.get(parentId)
    if (children) children.push(nodeId)
    else childrenByParent.set(parentId, [nodeId])
  })
  childrenByParent.forEach((children) => children.sort((a, b) => a.localeCompare(b)))
  return { parentMap, childrenByParent, trashed }
})
const sceneChildrenByParent = computed(() => {
  const childrenByParent = new Map<string, string[]>()
  sceneNodes.value.forEach((node) => {
    if (!node.parentId) return
    const parentId = String(node.parentId)
    const children = childrenByParent.get(parentId)
    if (children) children.push(node.id)
    else childrenByParent.set(parentId, [node.id])
  })
  return childrenByParent
})
const apiPresets = computed<ApiPreset[]>(() => settingStore.apiPresets || [])
const worldTreeDocuments = computed<BrainDocumentRecord[]>(() => Array.isArray(characterStore.documents) ? characterStore.documents : [])
const currentContentPorts = computed(() => {
  const character = currentCharacter.value
  if (!character) return []
  return buildCharacterBrainContentPorts(character, worldTreeDocuments.value)
})
const unitWorkspaceWindows = computed<WorkspaceWindowRecord[]>(() => {
  const ports = currentContentPorts.value
  const windows = unitWorkspaceState.value.windows
    .map((window) => {
      const port = resolveUnitPortByWindow(window, ports)
      if (!port) return null
      return createUnitWorkspaceWindow({
        domain: 'characterBrain',
        id: window.id,
        kind: 'viewer',
        title: port.title || window.title || t('brain.browserTitle'),
        unitId: port.unitId,
        sourceId: port.sourceId,
        sourceKind: port.domain,
        closable: true
      })
    })
    .filter((window): window is WorkspaceWindowRecord => Boolean(window))
  return windows
})
const activeUnitWorkspaceWindowId = computed(() => (
  unitWorkspaceWindows.value.some((window) => window.id === unitWorkspaceState.value.activeWindowId)
    ? unitWorkspaceState.value.activeWindowId
    : unitWorkspaceWindows.value[0]?.id || ''
))
const viewportTransform = computed(() => (
  `translate(${viewportOffset.value.x} ${viewportOffset.value.y}) scale(${viewportScale.value})`
))
const nodeLabelTransform = computed(() => `scale(${1 / (viewportScale.value * canvasScreenScale.value)})`)
const nodeMarkerTransform = computed(() => (
  `scale(${resolveCharacterBrainNodeMarkerScale(viewportScale.value, canvasScreenScale.value)})`
))
const shouldShowNodeLabels = computed(() => viewportScale.value >= NODE_LABEL_MIN_VIEWPORT_SCALE)
const nodeLabelStyle = computed(() => ({
  fontSize: `${nodeLabelBaseSize.value}px`
}))
const nodeSubLabelStyle = computed(() => ({
  fontSize: `${Math.max(9, nodeLabelBaseSize.value - 4)}px`
}))
const selectedNodeIdSet = computed(() => new Set(selectedNodeIds.value))
const hasNodeSelection = computed(() => selectedNodeIds.value.length > 0)
const customNodeMap = computed(() => new Map(customNodes.value.map((node) => [node.id, node])))
const canUndoBrainOps = computed(() => brainUndoStack.value.length > 0)
const canRedoBrainOps = computed(() => brainRedoStack.value.length > 0)
const isEmbeddedMode = computed(() => props.embedded)
const isReadOnlyMode = computed(() => props.readOnly)
const hasProjectionUnits = computed(() => Array.isArray(props.projectionUnits) && props.projectionUnits.length > 0)
const isRelationInteractionMode = computed(() => isEmbeddedMode.value && isReadOnlyMode.value && hasProjectionUnits.value)
const isPannable = computed(() => sceneNodes.value.length > 0 && (
  isRelationInteractionMode.value ? isSpacePressed.value : !isSpacePressed.value
))
const activeProjectionFocusNodeId = computed(() => String(pinnedFocusNodeId.value || hoveredNodeId.value || '').trim())
const explicitProjectionRelationNodeIds = computed(() => (props.projectionRelationNodeIds || [])
  .map((nodeId) => String(nodeId || '').trim())
  .filter(Boolean))
const hasExactProjectionRelations = computed(() => props.projectionExactRelationMode && explicitProjectionRelationNodeIds.value.length > 0)
const activeProjectionRelationNodeIds = computed(() => {
  if (!hasProjectionUnits.value) return props.projectionRelationNodeIds || []
  if (hasExactProjectionRelations.value) return explicitProjectionRelationNodeIds.value
  const activeNodeId = activeProjectionFocusNodeId.value
  if (!activeNodeId) return []
  const nodeIds = new Set<string>([activeNodeId])
  props.projectionRelationEdges.forEach((edge) => {
    if (edge.sourceNodeId === activeNodeId && edge.targetNodeId) nodeIds.add(edge.targetNodeId)
    if (edge.targetNodeId === activeNodeId && edge.sourceNodeId) nodeIds.add(edge.sourceNodeId)
  })
  return Array.from(nodeIds)
})
const activeProjectionRelationEdges = computed(() => {
  if (!hasProjectionUnits.value) return props.projectionRelationEdges || []
  if (hasExactProjectionRelations.value) {
    const allowedNodeIds = new Set(explicitProjectionRelationNodeIds.value)
    return props.projectionRelationEdges.filter((edge) => (
      allowedNodeIds.has(edge.sourceNodeId) && allowedNodeIds.has(edge.targetNodeId)
    ))
  }
  const activeNodeId = activeProjectionFocusNodeId.value
  if (!activeNodeId) return []
  return props.projectionRelationEdges.filter((edge) => (
    edge.sourceNodeId === activeNodeId || edge.targetNodeId === activeNodeId
  ))
})
const hasBrainClipboardData = computed(() => (
  brainClipboard.value.entries.length > 0
))
const sceneCenter = computed(() => {
  const focused = sceneNodes.value.find((node) => node.id === focusedNodeId.value)
  if (focused) return { x: focused.x, y: focused.y }
  if (!sceneNodes.value.length) return { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 }
  const total = sceneNodes.value.reduce((sum, node) => ({
    x: sum.x + node.x,
    y: sum.y + node.y
  }), { x: 0, y: 0 })
  return {
    x: total.x / sceneNodes.value.length,
    y: total.y / sceneNodes.value.length
  }
})
const visibleNodeModels = computed<CharacterBrainNodeModel[]>(() => {
  if (!currentCharacter.value) return []
  if (hasProjectionUnits.value) {
    const nodes = buildCharacterBrainWorkspaceProjection(currentCharacter.value, props.projectionUnits, {
      focusId: resolveBaseFocusId(focusedNodeId.value),
      minDensity: 0,
      relationNodeIds: activeProjectionRelationNodeIds.value,
      layoutMode: props.projectionLayout,
      trajectoryExpandedNodeIds: props.projectionExpandedNodeIds,
      forestRootNodeIds: props.projectionForestRootNodeIds
    }).filter((node) => !trashedNodeIds.value.includes(node.id))
    if (hasExactProjectionRelations.value) {
      const allowedNodeIds = new Set(explicitProjectionRelationNodeIds.value)
      return applyLayoutModes(nodes.filter((node) => allowedNodeIds.has(node.id)))
    }
    return applyLayoutModes(nodes)
  }
  const characterForProjection = {
    ...currentCharacter.value,
    brainTrajectoryMeta: {
      ...readCharacterBrainTrajectoryMeta(currentCharacter.value),
      viewOffsets: {}
    }
  } as Character
  const baseFocusId = resolveBaseFocusId(focusedNodeId.value)
  const baseNodes = buildCharacterBrainNodes(characterForProjection, {
    focusId: baseFocusId,
    minDensity: 0
  }).filter((node) => !trashedNodeIds.value.includes(node.id))
  return applyLayoutModes([...baseNodes, ...buildVisibleCustomNodeModels(baseNodes)])
})

const physicalSceneNodeMap = computed(() => {
  const map = new Map<string, CharacterBrainSimNode>()
  sceneNodes.value.forEach((node) => map.set(node.id, node))
  return map
})

const visualFocusNodeId = computed(() => {
  if (hasNodeSelection.value) return ''
  if (interactionState.value?.mode === 'node') return interactionState.value.nodeId
  if (pinnedFocusNodeId.value) return pinnedFocusNodeId.value
  return hoveredNodeId.value
})

const hoverFocusNodeId = computed(() => (
  hasNodeSelection.value ? '' : hoveredNodeId.value
))

const previewFocusNodeId = computed(() => {
  if (hasNodeSelection.value) return ''
  if (pinnedFocusNodeId.value) return pinnedFocusNodeId.value
  return hoveredNodeId.value
})

const hoverPreviewNodes = computed<CharacterBrainSimNode[]>(() => {
  const character = currentCharacter.value
  const activeNodeId = previewFocusNodeId.value
  const source = activeNodeId ? physicalSceneNodeMap.value.get(activeNodeId) : null
  if (!character || !activeNodeId || !source) return []

  const linkedTargets = buildCharacterBrainLinkedNodeTargets(character, activeNodeId)
  const existingIds = new Set(sceneNodes.value.map((node) => node.id))
  const renderedLinkedTargets = linkedTargets.filter((node) => existingIds.has(node.id) && !trashedNodeIds.value.includes(node.id))
  if (renderedLinkedTargets.length > 0) return []

  return linkedTargets
    .filter((node) => !existingIds.has(node.id) && !trashedNodeIds.value.includes(node.id))
    .map((node, index) => {
      const angle = ((index * 47) + 28) * Math.PI / 180
      const radius = 150 + (index % 3) * 18
      const x = source.x + Math.cos(angle) * radius
      const y = source.y + Math.sin(angle) * radius
      return {
        ...node,
        x,
        y,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        layoutX: x,
        layoutY: y
      }
    })
})

const rawDisplayedSceneNodes = computed<CharacterBrainSimNode[]>(() => [
  ...sceneNodes.value,
  ...hoverPreviewNodes.value
])

const focusProjection = computed(() => {
  const nodeMap = new Map<string, CharacterBrainSimNode>()
  rawDisplayedSceneNodes.value.forEach((node) => nodeMap.set(node.id, node))

  const metrics = new Map<string, { size: CharacterBrainNodeSize; density: CharacterBrainNodeDensity }>()
  rawDisplayedSceneNodes.value.forEach((node) => {
    metrics.set(node.id, { size: node.size, density: node.density })
  })

  const relatedIds = new Set<string>()
  const activeNodeId = visualFocusNodeId.value
  const character = currentCharacter.value
  if (!activeNodeId || !character || !nodeMap.has(activeNodeId)) {
    return { metrics, relatedIds, distanceById: new Map<string, number>(), activeNodeId: '' }
  }

  const adjacency = new Map<string, Set<string>>()
  const connect = (fromId: string, toId: string) => {
    if (!nodeMap.has(fromId) || !nodeMap.has(toId) || fromId === toId) return
    if (!adjacency.has(fromId)) adjacency.set(fromId, new Set())
    if (!adjacency.has(toId)) adjacency.set(toId, new Set())
    adjacency.get(fromId)!.add(toId)
    adjacency.get(toId)!.add(fromId)
  }

  rawDisplayedSceneNodes.value.forEach((node) => {
    if (!node.parentId || !nodeMap.has(String(node.parentId))) return
    connect(String(node.parentId), node.id)
  })
  activeProjectionRelationEdges.value.forEach((edge) => {
    if (!nodeMap.has(edge.sourceNodeId) || !nodeMap.has(edge.targetNodeId)) return
    connect(edge.sourceNodeId, edge.targetNodeId)
  })

  buildCharacterBrainLinkedNodeTargets(character, activeNodeId)
    .filter((node) => !trashedNodeIds.value.includes(node.id))
    .forEach((node) => {
      if (nodeMap.has(node.id)) connect(activeNodeId, node.id)
    })

  const distanceById = new Map<string, number>([[activeNodeId, 0]])
  const queue = [activeNodeId]

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentId = queue[cursor]
    const currentDistance = distanceById.get(currentId) ?? 0
    const neighbors = adjacency.get(currentId)
    if (!neighbors) continue
    neighbors.forEach((neighborId) => {
      if (distanceById.has(neighborId)) return
      const nextDistance = currentDistance + 1
      distanceById.set(neighborId, nextDistance)
      if (nextDistance === 1) relatedIds.add(neighborId)
      queue.push(neighborId)
    })
  }

  rawDisplayedSceneNodes.value.forEach((node) => {
    const distance = distanceById.get(node.id)
    metrics.set(node.id, resolveFocusRenderMetric(distance))
  })

  return { metrics, relatedIds, distanceById, activeNodeId }
})

const displayedSceneNodes = computed<CharacterBrainSimNode[]>(() => (
  rawDisplayedSceneNodes.value.filter((node) => node.density >= minDensity.value)
))

watch(displayedSceneNodes, (nodes) => {
  renderedPhysicsNodeIdSet.value = new Set(nodes.map((node) => node.id))
}, { immediate: true })

const sceneNodeMap = computed(() => {
  const map = new Map<string, CharacterBrainSimNode>()
  displayedSceneNodes.value.forEach((node) => map.set(node.id, node))
  return map
})

const visibleEdges = computed<BrainWorkspaceEdge[]>(() => {
  const nodeMap = sceneNodeMap.value
  const edges: BrainWorkspaceEdge[] = hasExactProjectionRelations.value
    ? []
    : displayedSceneNodes.value
      .filter((node) => node.parentId && nodeMap.has(String(node.parentId)))
      .map((node) => {
        const parent = nodeMap.get(String(node.parentId))!
        return buildEdge(parent, node)
      })
  const treeEdgePairs = new Set(edges.map((edge) => edgePairKey(edge.sourceId, edge.targetId)))
  const linkEdgePairs = new Set<string>()

  activeProjectionRelationEdges.value.forEach((relationEdge) => {
    const source = nodeMap.get(relationEdge.sourceNodeId)
    const target = nodeMap.get(relationEdge.targetNodeId)
    if (!source || !target) return
    const pairKey = edgePairKey(source.id, target.id)
    if (treeEdgePairs.has(pairKey) || linkEdgePairs.has(pairKey)) return
    linkEdgePairs.add(pairKey)
    edges.push(buildProjectionRelationEdge(source, target, relationEdge.id, hasExactProjectionRelations.value ? 'tree' : 'link'))
  })

  const hoverNodeId = visualFocusNodeId.value
  const character = currentCharacter.value
  const source = hoverNodeId ? nodeMap.get(hoverNodeId) : null
  if (!hoverNodeId || !character || !source) return edges

  const edgeIds = new Set(edges.map((edge) => edge.id))
  buildCharacterBrainLinkedNodeTargets(character, hoverNodeId)
    .filter((node) => !trashedNodeIds.value.includes(node.id))
    .forEach((node) => {
      const target = nodeMap.get(node.id)
      if (!target) return
      if (target.parentId === hoverNodeId && target.edgeKind === 'link') return
      const pairKey = edgePairKey(source.id, target.id)
      if (treeEdgePairs.has(pairKey) || linkEdgePairs.has(pairKey)) return
      const edge = buildEdge(source, target, { kind: 'link' })
      if (edgeIds.has(edge.id)) return
      edgeIds.add(edge.id)
      linkEdgePairs.add(pairKey)
      edges.push(edge)
    })

  return edges
})

const selectionBox = computed<SelectionBox | null>(() => {
  const state = interactionState.value
  if (state?.mode !== 'select' || !state.moved) return null
  return normalizeSelectionBox(state.originX, state.originY, state.currentX, state.currentY)
})

const visualFocusRelatedNodeIds = computed(() => focusProjection.value.relatedIds)

const visibleNodeMap = computed(() => {
  const map = new Map<string, CharacterBrainNodeModel>()
  displayedSceneNodes.value.forEach((node) => map.set(node.id, node))
  return map
})
const linkSuggestions = computed(() => {
  const base = currentCharacter.value ? buildCharacterBrainLinkSuggestions(currentCharacter.value) : []
  const custom = customNodes.value
    .filter((node) => !trashedNodeIds.value.includes(node.id))
    .map((node) => ({
      id: node.id,
      title: node.title || t('brain.graphPreview.unnamedNode'),
      kind: node.kind,
      parentId: node.parentId,
      parentTitle: getBrainNodeById(node.parentId)?.title
    }))
  return [...base, ...custom]
})

const nodeContextMenuNode = computed<CharacterBrainNodeModel | null>(() => {
  const nodeId = nodeContextMenu.value?.nodeId
  return nodeId ? getBrainNodeById(nodeId) : null
})
const isNodeMenuFocusPinned = computed(() => {
  const nodeId = nodeContextMenu.value?.nodeId || ''
  return Boolean(nodeId && pinnedFocusNodeId.value === nodeId)
})

const nodeContextMenuStyle = computed<Record<string, string>>(() => {
  if (!nodeContextMenu.value) return {} as Record<string, string>
  return {
    left: `${nodeContextMenu.value.x}px`,
    top: `${nodeContextMenu.value.y}px`
  }
})
const deleteSubmenuStyle = computed<Record<string, string>>(() => {
  if (!deleteSubmenu.value) return {} as Record<string, string>
  return {
    left: `${deleteSubmenu.value.x}px`,
    top: `${deleteSubmenu.value.y}px`
  }
})

const nodeMenuTargetIds = computed(() => {
  const nodeId = nodeContextMenu.value?.nodeId
  if (!nodeId) return []
  if (selectedNodeIdSet.value.has(nodeId)) return selectedNodeIds.value.filter((id) => visibleNodeMap.value.has(id))
  return [nodeId]
})

const nodeMenuTargetNodes = computed(() => nodeMenuTargetIds.value
  .map((nodeId) => getBrainNodeById(nodeId))
  .filter(Boolean) as CharacterBrainNodeModel[])

const canTrashNodeMenuTargets = computed(() => (
  nodeMenuTargetNodes.value.length > 0 && nodeMenuTargetNodes.value.every((node) => isNodeDeletable(node))
))

const canCutNodeMenuTargets = computed(() => canTrashNodeMenuTargets.value)
const canResetNodeMenuTargets = computed(() => hasResettableNodeOffsets(nodeMenuTargetIds.value))
const canRearrangeNodeMenuTargets = computed(() => collectRearrangeTargetNodeIds(nodeMenuTargetIds.value).length > 0)
const canPinNodeMenuTargets = computed(() => collectFixablePositionOperationNodeIds(nodeMenuTargetIds.value).length > 0)
const canUnpinNodeMenuTargets = computed(() => hasPinnedNodeOffsets(nodeMenuTargetIds.value))
const canAddCognitionChild = computed(() => {
  const nodeId = nodeContextMenu.value?.nodeId || ''
  return isCognitionNodeId(nodeId)
})
const currentTrajectoryMeta = computed(() => currentCharacter.value ? readCharacterBrainTrajectoryMeta(currentCharacter.value) : {
  birthDate: '',
  zeroNote: '',
  viewOffsets: {},
  calendarId: 'gregorian',
  calendarConfig: {},
  version: 2
})
const cognitionNodeFormSubtitle = computed(() => {
  const parent = getBrainNodeById(cognitionNodeForm.parentId)
  return t('brain.workspace.createUnder', { parent: parent?.title || t('brain.domainLabel.soul') })
})
const cognitionImportParentTitle = computed(() => getBrainNodeById(cognitionImportDialog.parentId)?.title || t('brain.domainLabel.soul'))
const worldTreeImportParentTitle = computed(() => getBrainNodeById(worldTreeImportDialog.parentId)?.title || t('brain.domainLabel.soul'))
const currentCognitionNodes = computed(() => currentCharacter.value ? readCharacterBrainCognitionNodes(currentCharacter.value) : [])
const currentTraceNodes = computed(() => currentCharacter.value ? readCharacterBrainTraceNodes(currentCharacter.value) : [])
const permanentDeleteConfirmOpen = computed(() => pendingPermanentDeleteNodeIds.value.length > 0)
const permanentDeleteConfirmMessage = computed(() => {
  const nodes = pendingPermanentDeleteNodeIds.value
    .map((nodeId) => getBrainNodeById(nodeId))
    .filter(Boolean) as CharacterBrainNodeModel[]
  if (nodes.length <= 1) {
    const suffix = pendingPermanentDeleteCascade.value ? t('brain.workspace.deleteSuffixCascade') : ''
    return t('brain.workspace.deleteConfirmSingle', { title: nodes[0]?.title || t('brain.workspace.defaultNodeTitle'), suffix })
  }
  return pendingPermanentDeleteCascade.value
    ? t('brain.workspace.deleteConfirmMultiCascade', { count: nodes.length })
    : t('brain.workspace.deleteConfirmMulti', { count: nodes.length })
})

const positionedCards = computed(() => {
  const bounds = getCanvasBounds()
  const defaultHeight = resolveCardHeight(bounds)
  return openCards.value
    .map((card) => {
      const placement = cardPlacements.value[card.id]
      if (placement?.mode === 'minimized') return null
      if (placement?.mode === 'detached') {
        return {
          ...card,
          style: {
            left: `${placement.left}px`,
            top: `${placement.top}px`,
            ...(placement.width ? { width: `${placement.width}px` } : {}),
            ...(placement.height ? { height: `${placement.height}px` } : {})
          }
        }
      }
      const node = sceneNodeMap.value.get(resolveCardAnchorNodeId(card.nodeId))
      if (!node) return null
      const position = resolveAttachedCardPosition(node)
      return {
        ...card,
        style: {
          left: `${position.left}px`,
          top: `${position.top}px`,
          height: `${defaultHeight}px`
        }
      }
    })
    .filter(Boolean) as Array<CharacterBrainCardModel & { style: Record<string, string> }>
})

const minimizedCards = computed(() => {
  const bounds = getCanvasBounds()
  return openCards.value
    .map((card) => {
      const placement = cardPlacements.value[card.id]
      if (placement?.mode !== 'minimized') return null
      return {
        ...card,
        style: {
          top: `${clampBrainEdgeTabTop(bounds, EDGE_TAB_HEIGHT, CARD_EDGE_GAP, placement.top)}px`
        }
      }
    })
    .filter(Boolean) as Array<CharacterBrainCardModel & { style: { top: string } }>
})

const miniChatStyle = computed<Record<string, string>>(() => {
  const bounds = getCanvasBounds()
  const defaultWidth = resolveMiniChatWidth(bounds)
  const defaultHeight = resolveMiniChatHeight(bounds)
  const width = clamp(miniChatSize.value?.width ?? defaultWidth, MINI_CHAT_MIN_WIDTH, Math.max(bounds.width - 16, MINI_CHAT_MIN_WIDTH))
  const height = clamp(miniChatSize.value?.height ?? defaultHeight, MINI_CHAT_MIN_HEIGHT, Math.max(bounds.height - 16, MINI_CHAT_MIN_HEIGHT))
  const placement = miniChatPlacement.value || resolveDefaultMiniChatPlacement(bounds, width, height)
  const clamped = clampMiniChatPlacement(placement, bounds, width, height)
  return {
    left: `${clamped.left}px`,
    top: `${clamped.top}px`,
    width: `${width}px`,
    height: `${height}px`
  }
})

watch([focusedNodeId, trashedNodeIds, layoutModes, customNodes], () => {
  scheduleRehydrateScene()
}, { immediate: true })

watch(visibleNodeModels, () => {
  scheduleRehydrateScene()
}, { deep: true })

watch(
  () => props.characterId,
  () => {
    if (nodePositionPersistTimer && typeof window !== 'undefined') {
      window.clearTimeout(nodePositionPersistTimer)
      nodePositionPersistTimer = null
    }
    loadTrashedNodeIds()
    loadCustomNodes()
    loadLayoutModes()
    clearBrainClipboard()
    brainUndoStack.value = []
    brainRedoStack.value = []
    focusedNodeId.value = getCharacterBrainRootId()
    openCards.value = []
    cardPlacements.value = {}
    loadNodeWorldPositions()
    nodeSessionPositions.value = {}
    pinnedFocusNodeId.value = ''
    selectedNodeIds.value = []
    closeNodeContextMenu()
    trashMenuOpen.value = false
    closeCognitionNodeForm()
    closeCognitionImportDialog()
    closeWorldTreeImportDialog()
    closeImportConflictDialog()
    viewportOffset.value = { ...DEFAULT_VIEWPORT_OFFSET }
    viewportScale.value = DEFAULT_VIEWPORT_SCALE
    hasFitInitialViewport = false
  },
  { immediate: true }
)

watch(customNodes, () => {
  persistCustomNodes()
}, { deep: true })

watch(layoutModes, () => {
  persistLayoutModes()
}, { deep: true })

watch(currentCharacter, () => {
  refreshOpenCards()
}, { deep: true })

watch(
  () => props.initialFocusNodeId,
  (nextNodeId) => {
    const normalizedId = String(nextNodeId || '').trim()
    if (!normalizedId) return
    if (!getBrainNodeById(normalizedId)) return
    focusedNodeId.value = normalizedId
    selectedNodeIds.value = []
    pinnedFocusNodeId.value = ''
    scheduleRehydrateScene()
  },
  { immediate: true }
)

watch(nodeWorldPositions, () => {
  scheduleNodePositionPersistence()
}, { deep: true })

function rehydrateScene() {
  const shouldPreserveSceneLayout = sceneCharacterId.value === props.characterId
    && !skipSceneLayoutPreserveOnce.value
    && props.projectionLayout !== 'trajectoryAxis'
  const previousSceneNodes = shouldPreserveSceneLayout
    ? sceneNodes.value.map((node) => ({
        id: node.id,
        parentId: node.parentId ? String(node.parentId) : '',
        x: node.x,
        y: node.y,
        layoutX: node.layoutX,
        layoutY: node.layoutY
      }))
    : []
  replaceSceneNodes(visibleNodeModels.value)
  pruneNodeSelection()
  migrateLegacyOffsetsToWorldPositions()
  applyNodeWorldPositions()
  preserveSharedSceneLayout(previousSceneNodes)
  enforceBrainRootWorldOrigin()
  skipSceneLayoutPreserveOnce.value = false
  sceneCharacterId.value = props.characterId
  scheduleInitialViewportFit()
}

function scheduleRehydrateScene() {
  if (rehydrateSceneScheduled) return
  if (!sceneNodes.value.length) {
    rehydrateScene()
    return
  }
  rehydrateSceneScheduled = true
  Promise.resolve().then(() => {
    rehydrateSceneScheduled = false
    rehydrateScene()
  })
}

function scheduleInitialViewportFit() {
  if (hasFitInitialViewport) return
  if (!isEmbeddedMode.value || !isReadOnlyMode.value) return
  if (!sceneNodes.value.length) return
  hasFitInitialViewport = true
  nextTick(() => {
    fitVisibleSceneToViewport()
  })
}

function fitVisibleSceneToViewport() {
  const nodes = displayedSceneNodes.value.length ? displayedSceneNodes.value : sceneNodes.value
  if (!nodes.length) return
  const bounds = nodes.reduce((acc, node) => {
    const padding = nodeHitRadius(nodeRenderSize(node)) + (shouldShowNodeLabels.value ? 72 : 22)
    return {
      minX: Math.min(acc.minX, node.x - padding),
      minY: Math.min(acc.minY, node.y - padding),
      maxX: Math.max(acc.maxX, node.x + padding),
      maxY: Math.max(acc.maxY, node.y + padding)
    }
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const scale = clamp(Math.min((VIEWBOX_WIDTH - 96) / width, (VIEWBOX_HEIGHT - 86) / height), MIN_VIEWPORT_SCALE, 0.95)
  viewportScale.value = scale
  viewportOffset.value = {
    x: (VIEWBOX_WIDTH / 2) - (((bounds.minX + bounds.maxX) / 2) * scale),
    y: (VIEWBOX_HEIGHT / 2) - (((bounds.minY + bounds.maxY) / 2) * scale)
  }
}

function preserveSharedSceneLayout(previousSceneNodes: Array<{
  id: string
  parentId: string
  x: number
  y: number
  layoutX: number
  layoutY: number
}>) {
  if (!previousSceneNodes.length || !sceneNodes.value.length) return

  const previousNodeMap = new Map(previousSceneNodes.map((node) => [node.id, node]))
  const baseNodeMap = new Map(sceneNodes.value.map((node) => [node.id, {
    parentId: node.parentId ? String(node.parentId) : '',
    x: node.x,
    y: node.y,
    layoutX: node.layoutX,
    layoutY: node.layoutY
  }]))
  let changed = false

  sceneNodes.value.forEach((node) => {
    const previous = previousNodeMap.get(node.id)
    if (!previous) return
    node.x = previous.x
    node.y = previous.y
    node.layoutX = previous.layoutX
    node.layoutY = previous.layoutY
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    changed = true
  })

  sceneNodes.value.forEach((node) => {
    if (previousNodeMap.has(node.id)) return
    const anchorId = findNearestSharedAncestorId(node.id, baseNodeMap, previousNodeMap)
    if (!anchorId) return
    const anchorBase = baseNodeMap.get(anchorId)
    const anchorPrevious = previousNodeMap.get(anchorId)
    if (!anchorBase || !anchorPrevious) return
    const deltaX = anchorPrevious.x - anchorBase.x
    const deltaY = anchorPrevious.y - anchorBase.y
    if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return
    node.x += deltaX
    node.y += deltaY
    node.layoutX += deltaX
    node.layoutY += deltaY
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    changed = true
  })

  if (changed) {
    sceneNodes.value = [...sceneNodes.value]
  }
}

function findNearestSharedAncestorId(
  nodeId: string,
  baseNodeMap: Map<string, { parentId: string; x: number; y: number; layoutX: number; layoutY: number }>,
  previousNodeMap: Map<string, { id: string; parentId: string; x: number; y: number; layoutX: number; layoutY: number }>
) {
  let currentId = String(nodeId || '').trim()
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const current = baseNodeMap.get(currentId)
    const parentId = current?.parentId ? String(current.parentId) : ''
    if (!parentId) return ''
    if (previousNodeMap.has(parentId)) return parentId
    currentId = parentId
  }
  return ''
}

function applyLayoutModes(nodes: CharacterBrainNodeModel[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const nextNodes = nodes.map((node) => ({
    ...node,
    layoutMode: resolveEffectiveLayoutMode(node, nodeMap)
  }))
  return applyFolderLayout(nextNodes)
}

function resolveEffectiveLayoutMode(
  node: CharacterBrainNodeModel,
  nodeMap: Map<string, CharacterBrainNodeModel>
): CharacterBrainNodeLayoutMode {
  let parentId = node.parentId ? String(node.parentId) : ''
  while (parentId) {
    const override = layoutModes.value[parentId]
    if (override) return override
    parentId = nodeMap.get(parentId)?.parentId || ''
  }
  return 'network'
}

function applyFolderLayout(nodes: CharacterBrainNodeModel[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const focusedAncestorIds = collectFocusedAncestorIds(nodeMap)
  const childrenByParent = new Map<string, CharacterBrainNodeModel[]>()
  nodes.forEach((node) => {
    if (!node.parentId || node.edgeKind === 'link') return
    const parentId = String(node.parentId)
    const siblings = childrenByParent.get(parentId) || []
    siblings.push(node)
    childrenByParent.set(parentId, siblings)
  })

  Array.from(childrenByParent.entries())
    .sort(([leftParentId], [rightParentId]) => getNodeTreeDepth(leftParentId, nodeMap) - getNodeTreeDepth(rightParentId, nodeMap))
    .forEach(([parentId, children]) => {
      if (focusedAncestorIds.has(parentId)) return
      if (!children.some((child) => child.layoutMode === 'folder')) return
      const parent = nodeMap.get(parentId)
      if (!parent) return
      const orderedChildren = children.filter((child) => child.layoutMode === 'folder' && child.id !== focusedNodeId.value)
      const middle = (orderedChildren.length - 1) / 2
      const direction = resolveFolderLayoutDirection(parent, nodeMap)
      orderedChildren.forEach((child, index) => {
        child.x = clampPercent(parent.x + (direction * (FOLDER_TRUNK_X_GAP + FOLDER_BRANCH_X_GAP)))
        child.y = clampPercent(parent.y + ((index - middle) * FOLDER_CHILD_Y_GAP))
      })
    })

  return nodes
}

function collectFocusedAncestorIds(nodeMap: Map<string, CharacterBrainNodeModel>) {
  const ids = new Set<string>()
  let parentId = nodeMap.get(focusedNodeId.value)?.parentId || ''
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    ids.add(parentId)
    parentId = nodeMap.get(parentId)?.parentId || ''
  }
  return ids
}

function getNodeTreeDepth(nodeId: string, nodeMap: Map<string, CharacterBrainNodeModel>) {
  let depth = 0
  let parentId = nodeMap.get(nodeId)?.parentId || ''
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = nodeMap.get(parentId)?.parentId || ''
  }
  return depth
}

function resolveFolderLayoutDirection(
  parent: CharacterBrainNodeModel,
  nodeMap: Map<string, CharacterBrainNodeModel>
) {
  const parentX = parent.x
  const requiredGap = FOLDER_TRUNK_X_GAP + FOLDER_BRANCH_X_GAP
  const rightSpace = 94 - parentX
  const leftSpace = parentX - 6
  const ancestor = parent.parentId ? nodeMap.get(String(parent.parentId)) : null
  if (ancestor && Math.abs(parent.x - ancestor.x) > 2) {
    const awayFromAncestor = parent.x >= ancestor.x ? 1 : -1
    const hasSpace = awayFromAncestor > 0 ? rightSpace >= requiredGap : leftSpace >= requiredGap
    if (hasSpace) return awayFromAncestor
  }
  if (rightSpace >= requiredGap) return 1
  if (leftSpace >= requiredGap) return -1
  return rightSpace >= leftSpace ? 1 : -1
}

function clampPercent(value: number) {
  return clamp(value, 6, 94)
}

function percentXToScene(value: number) {
  return (value / 100) * VIEWBOX_WIDTH
}

function buildVisibleCustomNodeModels(baseNodes: CharacterBrainNodeModel[]): CharacterBrainNodeModel[] {
  const baseIds = new Set(baseNodes.map((node) => node.id))
  const included = new Set(baseIds)
  const forcedIds = collectFocusedCustomChainIds()
  const visibleCustomNodes: BrainWorkspaceCustomNode[] = []
  const availableCustomNodes = customNodes.value.filter((node) => !trashedNodeIds.value.includes(node.id))

  let changed = true
  while (changed) {
    changed = false
    availableCustomNodes.forEach((node) => {
      if (included.has(node.id)) return
      if (!included.has(node.parentId) && !forcedIds.has(node.id)) return
      included.add(node.id)
      visibleCustomNodes.push(node)
      changed = true
    })
  }

  const positioned = new Map<string, CharacterBrainNodeModel>(baseNodes.map((node) => [node.id, node]))
  return visibleCustomNodes.map((node) => {
    const parent = positioned.get(node.parentId)
    const siblings = visibleCustomNodes.filter((item) => item.parentId === node.parentId)
    const index = Math.max(siblings.findIndex((item) => item.id === node.id), 0)
    const angle = 210 + ((index % 8) * 34)
    const radius = parent ? 34 + (Math.floor(index / 8) * 12) : 36
    const x = parent ? clampPercent(parent.x + Math.cos((angle * Math.PI) / 180) * radius) : 50
    const y = parent ? clampPercent(parent.y + Math.sin((angle * Math.PI) / 180) * radius) : 50
    const model: CharacterBrainNodeModel = {
      id: node.id,
      title: node.title || t('brain.graphPreview.unnamedNode'),
      kind: node.kind,
      summary: node.summary || t('brain.workspace.localPasteNode'),
      size: node.id === focusedNodeId.value ? 3 : 2,
      density: 5,
      x,
      y,
      parentId: node.parentId,
      deletable: true
    }
    positioned.set(model.id, model)
    return model
  })
}

function collectFocusedCustomChainIds() {
  const ids = new Set<string>()
  let current = customNodeMap.value.get(focusedNodeId.value)
  while (current) {
    ids.add(current.id)
    current = customNodeMap.value.get(current.parentId)
  }
  return ids
}

function resolveBaseFocusId(nodeId: string) {
  let current = customNodeMap.value.get(nodeId)
  let parentId = current?.parentId || nodeId
  const visited = new Set<string>()
  while (customNodeMap.value.has(parentId) && !visited.has(parentId)) {
    visited.add(parentId)
    current = customNodeMap.value.get(parentId)
    parentId = current?.parentId || getCharacterBrainRootId()
  }
  return parentId || getCharacterBrainRootId()
}

function getBrainNodeById(nodeId: string): CharacterBrainNodeModel | null {
  const normalizedId = String(nodeId || '').trim()
  if (!normalizedId) return null
  const visibleNode = visibleNodeMap.value.get(normalizedId)
  if (visibleNode) return visibleNode
  const custom = customNodeMap.value.get(normalizedId)
  if (custom) {
    return {
      id: custom.id,
      title: custom.title || t('brain.graphPreview.unnamedNode'),
      kind: custom.kind,
      summary: custom.summary || t('brain.workspace.localPasteNode'),
      size: custom.id === focusedNodeId.value ? 3 : 2,
      density: 5,
      x: 50,
      y: 50,
      parentId: custom.parentId,
      deletable: true
    }
  }
  const character = currentCharacter.value
  if (!character) return null
  if (hasProjectionUnits.value) {
    return getCharacterBrainProjectionNodeById(character, props.projectionUnits, normalizedId)
  }
  return getCharacterBrainNodeById(character, normalizedId)
}

function isNodeDeletable(node: CharacterBrainNodeModel) {
  return node.deletable || customNodeMap.value.has(node.id)
}

function hasResettableNodeOffsets(nodeIds: string[]) {
  const resetIds = collectPositionOperationNodeIds(nodeIds)
  if (!resetIds.length) return false
  return resetIds.some((nodeId) => Boolean(nodeSessionPositions.value[nodeId] || nodeWorldPositions.value[nodeId]))
}

function isBrainRootNodeId(nodeId: string) {
  return String(nodeId || '').trim() === getCharacterBrainRootId()
}

function collectDirectChildNodeIds(nodeIds: string[]) {
  const targetIds = normalizeNodeIdList(nodeIds)
  if (!targetIds.length) return []
  const parentMap = buildCompleteParentMap()
  const childrenByParent = buildCompleteChildrenMap(parentMap)
  const resetIds = new Set<string>()
  targetIds.forEach((nodeId) => {
    ;(childrenByParent.get(nodeId) || []).forEach((childId) => resetIds.add(childId))
  })
  return [...resetIds]
}

function collectTrajectoryRearrangeTailIds(nodeIds: string[]) {
  const character = currentCharacter.value
  if (!character) return []
  const traceOrder = sortTrajectoryNodes(
    readCharacterBrainTraceNodes(character).filter((node) => node.parentId === TRACE_ROOT_NODE_ID)
  )
  if (!traceOrder.length) return []
  const targetIds = normalizeNodeIdList(nodeIds)
  if (targetIds.includes(getCharacterBrainRootId()) || targetIds.includes(TRACE_ROOT_NODE_ID)) {
    return traceOrder.map((node) => node.id)
  }
  const traceTargetIds = targetIds.filter((nodeId) => isTraceNodeId(nodeId))
  if (!traceTargetIds.length) return []
  const startIndex = traceOrder.findIndex((node) => traceTargetIds.includes(node.id))
  if (startIndex < 0) return []
  return traceOrder.slice(startIndex + 1).map((node) => node.id)
}

function collectRearrangeTargetNodeIds(nodeIds: string[]) {
  return Array.from(new Set([
    ...collectDirectChildNodeIds(nodeIds),
    ...collectTrajectoryRearrangeTailIds(nodeIds)
  ]))
}

function collectLeafTargetNodeIds(nodeIds: string[]) {
  const targetIds = normalizeNodeIdList(nodeIds)
  if (targetIds.length <= 1) return targetIds
  const targetSet = new Set(targetIds)
  const parentMap = buildCompleteParentMap()
  return targetIds.filter((nodeId) => {
    return !targetIds.some((otherId) => {
      if (otherId === nodeId) return false
      let currentParentId = parentMap.get(otherId) || ''
      while (currentParentId) {
        if (currentParentId === nodeId) return true
        currentParentId = parentMap.get(currentParentId) || ''
      }
      return false
    })
  }).filter((nodeId) => targetSet.has(nodeId))
}

function collectHiddenDescendantIds(nodeIds: string[]) {
  const hiddenIds = new Set<string>()
  normalizeNodeIdList(nodeIds).forEach((nodeId) => {
    const renderedIds = new Set(collectSceneSubtreeIds(nodeId))
    collectCompleteSubtreeIds(nodeId).forEach((descendantId) => {
      if (descendantId === nodeId || renderedIds.has(descendantId)) return
      hiddenIds.add(descendantId)
    })
  })
  return [...hiddenIds]
}

function collectMoveTargetIdsWithHiddenDescendants(nodeIds: string[]) {
  return Array.from(new Set([
    ...normalizeNodeIdList(nodeIds),
    ...collectHiddenDescendantIds(nodeIds)
  ]))
}

function collectPositionOperationNodeIds(nodeIds: string[]) {
  return Array.from(new Set([...normalizeNodeIdList(nodeIds), ...collectDirectChildNodeIds(nodeIds)]))
}

function collectFixablePositionOperationNodeIds(nodeIds: string[]) {
  return collectPositionOperationNodeIds(nodeIds).filter((nodeId) => !isBrainRootNodeId(nodeId))
}

function normalizeNodeIdList(nodeIds: string[]) {
  const ids = new Set<string>()
  nodeIds.forEach((nodeId) => {
    const normalizedId = String(nodeId || '').trim()
    if (!normalizedId) return
    ids.add(normalizedId)
  })
  return [...ids]
}

function hasPinnedNodeOffsets(nodeIds: string[]) {
  const targetIds = collectFixablePositionOperationNodeIds(nodeIds)
  return targetIds.some((nodeId) => Boolean(nodeWorldPositions.value[nodeId]))
}

function omitBrainRootPosition<T extends Record<string, NodeWorldPosition>>(positions: T): T {
  const nextPositions = { ...positions }
  delete nextPositions[getCharacterBrainRootId()]
  return nextPositions
}

function readCurrentScenePosition(nodeId: string) {
  const sceneNode = sceneNodes.value.find((node) => node.id === nodeId)
  return sceneNode ? { x: sceneNode.x, y: sceneNode.y } : null
}

function handleNodeClick(nodeId: string, event: MouseEvent) {
  if (shouldSuppressNodeClick(nodeId, event)) return
  if (interactionState.value?.mode === 'node' && interactionState.value.moved && interactionState.value.nodeId === nodeId) return
  closeNodeContextMenu()
  trashMenuOpen.value = false
  if (event.ctrlKey || event.metaKey) {
    if (isRelationInteractionMode.value || hasNodeSelection.value) {
      toggleNodeSelection(nodeId)
    } else if (!isReadOnlyMode.value) {
      openCard(nodeId)
    }
    return
  }
  if (event.altKey) {
    pinNodeFocus(nodeId)
    return
  }
  runNodePrimaryAction(nodeId)
}

function shouldSuppressNodeClick(nodeId: string, event: MouseEvent) {
  const suppressed = suppressNextNodeClick
  if (!suppressed) return false
  if (Date.now() > suppressed.until) {
    suppressNextNodeClick = null
    return false
  }
  const shouldSuppress = suppressed.nodeId === nodeId && suppressed.altKey === Boolean(event.altKey)
  if (shouldSuppress) suppressNextNodeClick = null
  return shouldSuppress
}

function openNodeContextMenu(nodeId: string, event: MouseEvent) {
  trashMenuOpen.value = false
  closeDeleteSubmenu()
  if (!visibleNodeMap.value.has(nodeId)) return
  nodeContextMenu.value = {
    nodeId,
    x: clampMenuX(event.clientX),
    y: clampMenuY(event.clientY)
  }
}

function closeNodeContextMenu() {
  nodeContextMenu.value = null
  closeDeleteSubmenu()
}

function cancelCloseDeleteSubmenu() {
  if (deleteSubmenuCloseTimer) {
    clearTimeout(deleteSubmenuCloseTimer)
    deleteSubmenuCloseTimer = null
  }
}

function scheduleCloseDeleteSubmenu() {
  cancelCloseDeleteSubmenu()
  deleteSubmenuCloseTimer = setTimeout(() => {
    deleteSubmenu.value = null
    deleteSubmenuCloseTimer = null
  }, 120)
}

function closeDeleteSubmenu() {
  cancelCloseDeleteSubmenu()
  deleteSubmenu.value = null
}

function openDeleteSubmenu(event?: MouseEvent | PointerEvent) {
  cancelCloseDeleteSubmenu()
  if (isReadOnlyMode.value) return
  if (!canTrashNodeMenuTargets.value || !nodeContextMenu.value) return
  if (event?.currentTarget instanceof HTMLElement) {
    const rect = event.currentTarget.getBoundingClientRect()
    deleteSubmenu.value = {
      x: clampMenuX(rect.right - 4),
      y: clampMenuY(rect.top)
    }
    return
  }
  deleteSubmenu.value = {
    x: clampMenuX(nodeContextMenu.value.x + 176),
    y: clampMenuY(nodeContextMenu.value.y)
  }
}

function handleNodeMenuOpenCard() {
  if (isReadOnlyMode.value) return
  const nodeId = nodeContextMenu.value?.nodeId
  if (!nodeId) return
  openCard(nodeId)
  closeNodeContextMenu()
}

const canBrowseNodeMenuTarget = computed(() => {
  const nodeId = nodeContextMenu.value?.nodeId
  return Boolean(nodeId && resolveUnitBrowserPort(nodeId))
})

function handleNodeMenuBrowse() {
  const nodeId = nodeContextMenu.value?.nodeId
  if (!nodeId) return
  openUnitBrowser(nodeId)
  closeNodeContextMenu()
}

function handleNodeMenuToggleFocusPin() {
  const nodeId = nodeContextMenu.value?.nodeId
  if (!nodeId) return
  pinNodeFocus(nodeId)
  closeNodeContextMenu()
}

function openUnitBrowser(nodeId: string) {
  const port = resolveUnitBrowserPort(nodeId)
  if (!port) return
  unitWorkspaceState.value = upsertWorkspaceWindow(unitWorkspaceState.value, createUnitWorkspaceWindow({
    domain: 'characterBrain',
    id: buildUnitWorkspaceWindowId(port),
    kind: 'viewer',
    title: port.title || t('brain.browserTitle'),
    unitId: port.unitId,
    sourceId: port.sourceId,
    sourceKind: port.domain,
    closable: true
  }), { placement: 'right', activate: true })
}

function activateUnitWorkspaceWindow(windowId: string) {
  unitWorkspaceState.value = activateWorkspaceWindow(unitWorkspaceState.value, windowId)
}

function closeUnitWorkspaceWindow(windowId: string) {
  unitWorkspaceState.value = closeWorkspaceWindow(unitWorkspaceState.value, windowId)
}

function getUnitWorkspacePort(window: WorkspaceWindowRecord): UnitContentPort | null {
  return resolveUnitPortByWindow(window, currentContentPorts.value)
}

function canEditUnitWorkspacePort(port: UnitContentPort | null): boolean {
  if (!port || isReadOnlyMode.value) return false
  const card = currentCharacter.value ? buildBrainCard(currentCharacter.value, port.sourceId || port.unitId) : null
  return Boolean(card?.editable)
}

function openUnitWorkspaceEditor(port: UnitContentPort | null) {
  if (!canEditUnitWorkspacePort(port)) return
  openCard(port!.sourceId || port!.unitId)
}

function resolveUnitPortByWindow(window: WorkspaceWindowRecord, ports: UnitContentPort[]): UnitContentPort | null {
  return ports.find((port) => (
    port.unitId === window.unitId
    || port.sourceId === window.sourceId
    || buildUnitWorkspaceWindowId(port) === window.id
  )) || null
}

function buildUnitWorkspaceWindowId(port: UnitContentPort) {
  return `character-unit-viewer:${port.unitId}`
}

function resolveUnitBrowserPort(nodeId: string): UnitContentPort | null {
  const character = currentCharacter.value
  const normalizedId = String(nodeId || '').trim()
  if (!character || !normalizedId) return null
  const characterId = String(character.id || '').trim() || 'unknown'
  if (normalizedId === getCharacterBrainRootId()) {
    return null
  }
  const sourceId = normalizedId === 'brain:see_me'
    ? `${characterId}:core`
    : normalizedId === COGNITION_ROOT_NODE_ID
      ? `${characterId}:soul`
      : normalizedId === TRACE_ROOT_NODE_ID
        ? `${characterId}:trace`
        : normalizedId
  return currentContentPorts.value.find((port) => (
    port.sourceId === sourceId || port.unitId === sourceId || port.sourceId === normalizedId || port.unitId === normalizedId
  )) || null
}

function handleNodeMenuCopyPath() {
  const character = currentCharacter.value
  const nodeId = nodeContextMenu.value?.nodeId
  if (!character || !nodeId) return
  const path = buildBrainNodePath(character, nodeId)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(path).catch(() => {})
  }
  closeNodeContextMenu()
}

function openPermanentDeleteConfirm(nodeIds: string[], cascadeDelete: boolean) {
  const normalizedIds = Array.from(new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (!normalizedIds.length) return
  pendingPermanentDeleteNodeIds.value = normalizedIds
  pendingPermanentDeleteCascade.value = cascadeDelete
  closeNodeContextMenu()
}

function buildBrainNodePath(character: Character, nodeId: string): string {
  const custom = customNodeMap.value.get(nodeId)
  if (!custom) return buildCharacterBrainNodePath(character, nodeId)
  const titles: string[] = []
  const visited = new Set<string>()
  let current: BrainWorkspaceCustomNode | undefined = custom
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    titles.unshift(current.title || t('brain.graphPreview.unnamedNode'))
    current = customNodeMap.value.get(current.parentId)
  }
  const parentPath = current ? '' : buildCharacterBrainNodePath(character, custom.parentId)
  return `${parentPath || `/${t('brain.card.linkParentFallback')}/${character.name || t('brain.workspace.unnamedCharacter')}`}/${titles.join('/')}`
}

async function handleNodeMenuResetPosition() {
  const targetIds = nodeMenuTargetIds.value
  if (!targetIds.length) return
  const resetCount = await resetNodePositions(targetIds)
  closeNodeContextMenu()
  if (!resetCount) return
  toast(resetCount > 1 ? t('brain.workspace.toast.selectedPositionReset') : t('brain.workspace.toast.positionReset'), 'success')
}

async function handleNodeMenuRearrangeChildren() {
  const targetIds = nodeMenuTargetIds.value
  if (!targetIds.length) return
  const rearrangedCount = await rearrangeDirectChildNodePositions(targetIds)
  closeNodeContextMenu()
  if (!rearrangedCount) return
  toast(rearrangedCount > 1 ? t('brain.workspace.toast.rearrangedChildren', { count: rearrangedCount }) : t('brain.workspace.toast.childrenRearranged'), 'success')
}

async function handleNodeMenuPinPosition() {
  const targetIds = nodeMenuTargetIds.value
  if (!targetIds.length) return
  const pinnedCount = await pinSubtreePositions(targetIds)
  closeNodeContextMenu()
  if (!pinnedCount) return
  toast(pinnedCount > 1 ? t('brain.workspace.toast.pinnedNodes', { count: pinnedCount }) : t('brain.workspace.toast.positionPinned'), 'success')
}

async function handleNodeMenuClearPinnedPosition() {
  const targetIds = nodeMenuTargetIds.value
  if (!targetIds.length) return
  const clearedCount = await unpinSubtreePositions(targetIds)
  closeNodeContextMenu()
  if (!clearedCount) return
  toast(clearedCount > 1 ? t('brain.workspace.toast.clearedPinned', { count: clearedCount }) : t('brain.workspace.toast.pinnedCleared'), 'success')
}

function handleNodeMenuCopy() {
  const clipboard = buildBrainClipboard(nodeMenuTargetIds.value, 'copy')
  if (!clipboard) return
  brainClipboard.value = clipboard
  toast(clipboard.entries.length > 1 ? t('brain.workspace.toast.copiedNodes', { count: clipboard.entries.length }) : t('brain.workspace.toast.nodeCopied'), 'success')
  closeNodeContextMenu()
}

function handleNodeMenuCut() {
  if (!canCutNodeMenuTargets.value) return
  if (isReadOnlyMode.value) return
  const clipboard = buildBrainClipboard(nodeMenuTargetIds.value, 'cut')
  if (!clipboard) return
  brainClipboard.value = clipboard
  selectedNodeIds.value = clipboard.ids
  toast(clipboard.entries.length > 1 ? t('brain.workspace.toast.cutNodes', { count: clipboard.entries.length }) : t('brain.workspace.toast.nodeCut'), 'success')
  closeNodeContextMenu()
}

function handleNodeMenuPaste() {
  const targetId = nodeContextMenu.value?.nodeId
  if (!targetId) return
  if (isReadOnlyMode.value) return
  pasteBrainClipboardIntoNode(targetId)
  closeNodeContextMenu()
}

function handleNodeMenuAddChild() {
  if (isReadOnlyMode.value) return
  const parentId = nodeContextMenu.value?.nodeId || ''
  if (isCognitionNodeId(parentId)) {
    openCognitionNodeForm(parentId)
    return
  }
  closeNodeContextMenu()
  toast(t('brain.workspace.toast.addChildReserved'), 'info')
}

function handleNodeMenuImportJson() {
  if (isReadOnlyMode.value) return
  const parentId = nodeContextMenu.value?.nodeId || ''
  if (!isCognitionNodeId(parentId)) return
  openCognitionImportDialog(parentId)
}

function handleNodeMenuImportWorldTree() {
  if (isReadOnlyMode.value) return
  const parentId = nodeContextMenu.value?.nodeId || ''
  if (!isCognitionNodeId(parentId)) return
  openWorldTreeImportDialog(parentId)
}

function openCognitionNodeForm(parentId: string) {
  if (!isCognitionNodeId(parentId)) return
  cognitionNodeForm.open = true
  cognitionNodeForm.parentId = parentId
  cognitionNodeForm.saving = false
  closeNodeContextMenu()
}

function openCognitionImportDialog(parentId: string) {
  if (!isCognitionNodeId(parentId)) return
  cognitionImportDialog.open = true
  cognitionImportDialog.parentId = parentId
  cognitionImportDialog.saving = false
  closeNodeContextMenu()
}

function openWorldTreeImportDialog(parentId: string) {
  if (!isCognitionNodeId(parentId)) return
  worldTreeImportDialog.open = true
  worldTreeImportDialog.parentId = parentId
  worldTreeImportDialog.saving = false
  closeNodeContextMenu()
}

function closeCognitionNodeForm(force = false) {
  if (cognitionNodeForm.saving && !force) return
  cognitionNodeForm.open = false
  cognitionNodeForm.parentId = ''
  cognitionNodeForm.saving = false
}

function closeCognitionImportDialog(force = false) {
  if (cognitionImportDialog.saving && !force) return
  cognitionImportDialog.open = false
  cognitionImportDialog.parentId = ''
  cognitionImportDialog.saving = false
}

function closeWorldTreeImportDialog(force = false) {
  if (worldTreeImportDialog.saving && !force) return
  worldTreeImportDialog.open = false
  worldTreeImportDialog.parentId = ''
  worldTreeImportDialog.saving = false
}

async function confirmCognitionNodeForm(payload: { title: string; summary: string; kind: string }) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  const parentId = cognitionNodeForm.parentId
  const title = payload.title.trim()
  if (!character || !isCognitionNodeId(parentId) || !title || cognitionNodeForm.saving) return
  cognitionNodeForm.saving = true
  closeCognitionNodeForm(true)
  await nextTick()
  try {
    pushBrainHistorySnapshot()
    const now = new Date().toISOString()
    const nextNodeId = createCognitionNodeId()
    const changes = createCharacterBrainSoulTreeNode(character, {
      id: nextNodeId,
      title,
      summary: payload.summary.trim(),
      parentId,
      kind: normalizeCognitionKind(payload.kind),
      now
    })
    await characterStore.updateCharacter(character.id, changes as any)
    Object.assign(character, changes)
    focusedNodeId.value = parentId
    selectedNodeIds.value = [nextNodeId]
    toast(t('brain.workspace.toast.soulChildCreated'), 'success')
  } catch (error) {
    console.error('创建灵魂子节点失败:', error)
    toast(t('brain.workspace.toast.soulChildCreateFailed'), 'error')
  } finally {
    cognitionNodeForm.saving = false
  }
}

function normalizeCognitionKind(kind: string): CharacterBrainCognitionNodeKind {
  if (kind === 'private' || kind === 'reference' || kind === 'relation') return kind
  return 'group'
}

async function confirmCognitionImport(payload: {
  draft: CharacterBrainImportDraft
  conflictActions: Record<string, CharacterBrainImportConflictAction>
  defaultConflictAction: CharacterBrainImportConflictAction
}) {
  if (isReadOnlyMode.value) return
  await importCognitionDraft(cognitionImportDialog, payload, t('brain.importDialog.title'))
}

async function confirmWorldTreeImport(payload: {
  draft: CharacterBrainImportDraft
  conflictActions: Record<string, CharacterBrainImportConflictAction>
  defaultConflictAction: CharacterBrainImportConflictAction
}) {
  if (isReadOnlyMode.value) return
  await importCognitionDraft(worldTreeImportDialog, payload, t('brain.worldTreeImport.title'))
}

async function importCognitionDraft(
  dialogState: CognitionImportDialogState,
  payload: {
    draft: CharacterBrainImportDraft
    conflictActions: Record<string, CharacterBrainImportConflictAction>
    defaultConflictAction: CharacterBrainImportConflictAction
  },
  actionLabel: string
) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  const parentId = dialogState.parentId
  if (!character || !isCognitionNodeId(parentId) || dialogState.saving) return
  const conflicts = buildCharacterBrainImportPreview(readCharacterBrainCognitionNodes(character), parentId, payload.draft).conflicts
  if (conflicts.length && !Object.keys(payload.conflictActions).length && payload.defaultConflictAction === 'skip') {
    importConflictDialog.open = true
    importConflictDialog.parentId = parentId
    importConflictDialog.actionLabel = actionLabel
    importConflictDialog.draft = payload.draft
    importConflictDialog.conflicts = conflicts
    importConflictDialog.saving = false
    if (dialogState === cognitionImportDialog) closeCognitionImportDialog(true)
    else closeWorldTreeImportDialog(true)
    return
  }
  dialogState.saving = true
  try {
    await applyConfirmedCognitionImport(parentId, payload.draft, payload.conflictActions, payload.defaultConflictAction, actionLabel)
    if (dialogState === cognitionImportDialog) {
      closeCognitionImportDialog(true)
    } else {
      closeWorldTreeImportDialog(true)
    }
  } catch (error) {
    console.error(`${actionLabel}失败:`, error)
    toast(t('brain.workspace.toast.importFailed', { action: actionLabel }), 'error')
  } finally {
    dialogState.saving = false
  }
}

async function applyConfirmedCognitionImport(
  parentId: string,
  draft: CharacterBrainImportDraft,
  conflictActions: Record<string, CharacterBrainImportConflictAction>,
  defaultConflictAction: CharacterBrainImportConflictAction,
  actionLabel: string
) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  if (!character) return
  pushBrainHistorySnapshot()
  const result = applyCharacterBrainImportDraft({
    existingNodes: readCharacterBrainCognitionNodes(character),
    parentId,
    draft,
    conflictActions,
    defaultConflictAction,
    createId: createCognitionNodeId
  })
  await characterStore.updateCharacter(character.id, buildCharacterBrainCognitionNodesChange(result.nodes) as any)
  const affectedRootNodeIds = result.createdRootNodeIds.length ? result.createdRootNodeIds : result.updatedRootNodeIds
  focusedNodeId.value = affectedRootNodeIds.length === 1 ? affectedRootNodeIds[0] : parentId
  selectedNodeIds.value = []
  const changedCount = result.createdNodeIds.length + result.updatedNodeIds.length
  const skippedCount = result.skippedTempIds.length
  const importDoneMessage = skippedCount
    ? t('brain.workspace.toast.importDoneSkipped', { action: actionLabel, created: result.createdNodeIds.length, updated: result.updatedNodeIds.length, skipped: skippedCount })
    : t('brain.workspace.toast.importDone', { action: actionLabel, created: result.createdNodeIds.length, updated: result.updatedNodeIds.length })
  toast(importDoneMessage, changedCount ? 'success' : 'info')
}

function closeImportConflictDialog() {
  importConflictDialog.open = false
  importConflictDialog.parentId = ''
  importConflictDialog.actionLabel = ''
  importConflictDialog.draft = null
  importConflictDialog.conflicts = []
  importConflictDialog.saving = false
}

async function confirmImportConflictDialog(payload: {
  defaultAction: CharacterBrainImportConflictAction
  actions: Record<string, CharacterBrainImportConflictAction>
}) {
  if (isReadOnlyMode.value) return
  if (!importConflictDialog.draft || importConflictDialog.saving) return
  importConflictDialog.saving = true
  try {
    await applyConfirmedCognitionImport(
      importConflictDialog.parentId,
      importConflictDialog.draft,
      payload.actions,
      payload.defaultAction,
      importConflictDialog.actionLabel || t('brain.importDialog.title')
    )
    closeImportConflictDialog()
  } catch (error) {
    console.error('处理重复项导入失败:', error)
    toast(t('brain.workspace.toast.conflictImportFailed'), 'error')
    importConflictDialog.saving = false
  }
}

function handleNodeMenuTrash() {
  if (isReadOnlyMode.value) return
  if (!canTrashNodeMenuTargets.value) return
  openPermanentDeleteConfirm(nodeMenuTargetIds.value, true)
}

function handleNodeMenuDeleteCurrentOnly() {
  if (isReadOnlyMode.value) return
  if (!canTrashNodeMenuTargets.value) return
  openPermanentDeleteConfirm(nodeMenuTargetIds.value, false)
}

function handleNodeMenuDeleteCascade() {
  if (isReadOnlyMode.value) return
  if (!canTrashNodeMenuTargets.value) return
  openPermanentDeleteConfirm(nodeMenuTargetIds.value, true)
}

function closePermanentDeleteConfirm() {
  pendingPermanentDeleteNodeIds.value = []
  pendingPermanentDeleteCascade.value = false
}

async function confirmPermanentDeleteNodes() {
  if (isReadOnlyMode.value) return
  const ids = [...pendingPermanentDeleteNodeIds.value]
  const cascadeDelete = pendingPermanentDeleteCascade.value
  closePermanentDeleteConfirm()
  if (!ids.length) return
  await deleteNodesPermanently(ids, cascadeDelete)
}

async function deleteNodesPermanently(nodeIds: string[], cascadeDelete = false) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  const rootIds = Array.from(new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (!rootIds.length) return
  pushBrainHistorySnapshot()
  const deleteIds = new Set<string>()
  const trajectoryDeleteIds = character ? collectTrajectoryDeleteIds(rootIds, character, cascadeDelete) : new Set<string>()
  const normalRootIds = rootIds.filter((id) => !isTrajectoryViewNodeId(id))
  if (cascadeDelete) {
    collectCascadeNodeIds(normalRootIds).forEach((id) => deleteIds.add(id))
  } else {
    normalRootIds.forEach((id) => deleteIds.add(id))
  }
  trajectoryDeleteIds.forEach((id) => deleteIds.add(id))
  customNodes.value = customNodes.value.filter((node) => !deleteIds.has(node.id))
  if (character) {
    const nextCognitionNodes = readCharacterBrainCognitionNodes(character).filter((node) => !deleteIds.has(node.id))
    const nextTraceNodes = readCharacterBrainTraceNodes(character).filter((node) => !deleteIds.has(node.id))
    const nextChanges = {
      ...(buildCharacterBrainCognitionNodesChange(nextCognitionNodes) as any),
      ...(buildCharacterBrainTraceNodesChange(nextTraceNodes) as any)
    } as Record<string, unknown>
    if (trajectoryDeleteIds.size > 0) {
      Object.assign(nextChanges, buildCharacterBrainTrajectoryMetaChange(
        removeTrajectoryMetaOffsetsByNodeIds(readCharacterBrainTrajectoryMeta(character), deleteIds)
      ) as any)
    }
    await characterStore.updateCharacter(character.id, nextChanges)
    Object.assign(character, nextChanges)
  }
  openCards.value = openCards.value.filter((card) => !deleteIds.has(card.nodeId))
  selectedNodeIds.value = selectedNodeIds.value.filter((id) => !deleteIds.has(id))
  nodeWorldPositions.value = removeNodePositionsByIds(nodeWorldPositions.value, deleteIds)
  nodeSessionPositions.value = removeNodePositionsByIds(nodeSessionPositions.value, deleteIds)
  layoutModes.value = removeLayoutModesByIds(layoutModes.value, deleteIds)
  if (brainClipboard.value.mode) {
    brainClipboard.value = {
      ...brainClipboard.value,
      ids: brainClipboard.value.ids.filter((id) => !deleteIds.has(id)),
      entries: brainClipboard.value.entries.filter((entry) => !deleteIds.has(entry.id))
    }
    if (!brainClipboard.value.ids.length && !brainClipboard.value.entries.length) {
      clearBrainClipboard()
    }
  }
  if (focusedNodeId.value && deleteIds.has(focusedNodeId.value)) {
    focusedNodeId.value = resolveTrashFallbackFocusId(rootIds)
  }
  rehydrateScene()
  refreshOpenCards()
  toast(deleteIds.size > 1 ? t('brain.workspace.toast.deletedNodes', { count: deleteIds.size }) : t('brain.workspace.toast.nodeDeleted'), 'success')
}

function collectTrajectoryDeleteIds(nodeIds: string[], character: Character, cascadeDelete: boolean) {
  if (!cascadeDelete) {
    return new Set(
      nodeIds
        .filter((nodeId) => isTrajectoryViewNodeId(nodeId))
        .filter((nodeId) => readCharacterBrainTraceNodes(character).some((node) => node.id === nodeId))
    )
  }
  const thresholds = nodeIds
    .filter((nodeId) => isTrajectoryViewNodeId(nodeId))
    .map((nodeId) => resolveTrajectoryTimelineOffsetDays(nodeId, character))
    .filter((value): value is number => Number.isFinite(value))
  if (!thresholds.length) return new Set<string>()
  const deleteIds = new Set<string>()
  const shouldDeleteFromOffset = (offsetDays: number) => thresholds.some((threshold) => offsetDays >= threshold)
  readCharacterBrainTraceNodes(character).forEach((node) => {
    if (shouldDeleteFromOffset(Math.max(0, Number(node.offsetDays) || 0))) {
      deleteIds.add(node.id)
    }
  })
  sceneNodes.value.forEach((node) => {
    if (!isTrajectoryViewNodeId(node.id)) return
    const offsetDays = resolveTrajectoryTimelineOffsetDays(node.id, character)
    if (offsetDays === null || !shouldDeleteFromOffset(offsetDays)) return
    deleteIds.add(node.id)
  })
  return deleteIds
}

function resolveTrajectoryTimelineOffsetDays(nodeId: string, character: Character) {
  const normalizedId = String(nodeId || '').trim()
  if (!normalizedId) return null
  if (normalizedId === TRACE_ROOT_NODE_ID) return 0
  const traceNode = readCharacterBrainTraceNodes(character).find((node) => node.id === normalizedId)
  if (traceNode) return Math.max(0, Number(traceNode.offsetDays) || 0)
  return null
}

function collectCascadeNodeIds(rootIds: string[]) {
  const ids = new Set<string>()
  const cognitionNodes = currentCharacter.value ? readCharacterBrainCognitionNodes(currentCharacter.value) : []
  const traceNodes = currentCharacter.value ? readCharacterBrainTraceNodes(currentCharacter.value) : []
  const traceOrder = [...traceNodes].sort((a, b) => {
    const offsetDiff = (Number(a.offsetDays) || 0) - (Number(b.offsetDays) || 0)
    if (offsetDiff !== 0) return offsetDiff
    return String(a.id).localeCompare(String(b.id))
  })
  const visit = (nodeId: string) => {
    if (ids.has(nodeId)) return
    ids.add(nodeId)
    customNodes.value
      .filter((node) => node.parentId === nodeId)
      .forEach((child) => visit(child.id))
    cognitionNodes
      .filter((node) => node.parentId === nodeId)
      .forEach((child) => visit(child.id))
    traceNodes
      .filter((node) => node.parentId === nodeId)
      .forEach((child) => visit(child.id))
  }
  rootIds.forEach((nodeId) => {
    const normalizedId = String(nodeId || '').trim()
    if (!normalizedId) return
    if (isTraceNodeId(normalizedId)) {
      const startIndex = traceOrder.findIndex((node) => node.id === normalizedId)
      if (startIndex >= 0) {
        traceOrder.slice(startIndex).forEach((node) => visit(node.id))
        return
      }
    }
    visit(normalizedId)
  })
  return ids
}

function resolveTrashFallbackFocusId(nodeIds: string[]) {
  const firstNodeId = nodeIds.map((id) => String(id || '').trim()).find(Boolean)
  if (!firstNodeId) return getCharacterBrainRootId()
  const node = getBrainNodeById(firstNodeId)
  return node?.parentId || getCharacterBrainRootId()
}

function removeNodePositionsByIds(
  positions: Record<string, NodeWorldPosition>,
  deleteIds: Set<string>
) {
  const nextPositions = { ...positions }
  deleteIds.forEach((nodeId) => {
    delete nextPositions[nodeId]
  })
  return nextPositions
}

function removeLayoutModesByIds(
  modes: Record<string, CharacterBrainNodeLayoutMode>,
  deleteIds: Set<string>
) {
  const nextModes = { ...modes }
  deleteIds.forEach((nodeId) => {
    delete nextModes[nodeId]
  })
  return nextModes
}

buildBrainClipboard = function buildBrainClipboard(nodeIds: string[], mode: 'copy' | 'cut'): BrainWorkspaceClipboardState | null {
  const rootIds = normalizeClipboardRootIds(nodeIds)
  if (!rootIds.length) return null
  const entries = rootIds.flatMap((nodeId) => collectClipboardSubtree(nodeId))
  if (!entries.length) return null
  return {
    mode,
    ids: rootIds,
    entries
  }
}

function normalizeClipboardRootIds(nodeIds: string[]) {
  const uniqueIds = Array.from(new Set(nodeIds.map((nodeId) => String(nodeId || '').trim()).filter(Boolean)))
  return uniqueIds.filter((nodeId) => {
    const node = getBrainNodeById(nodeId)
    if (!node) return false
    let parentId = node.parentId || ''
    while (parentId) {
      if (uniqueIds.includes(parentId)) return false
      parentId = getBrainNodeById(parentId)?.parentId || ''
    }
    return true
  })
}

function collectClipboardSubtree(rootId: string): BrainWorkspaceClipboardNode[] {
  const result: BrainWorkspaceClipboardNode[] = []
  const visit = (nodeId: string) => {
    const node = getBrainNodeById(nodeId)
    if (!node) return
    result.push({
      id: node.id,
      title: node.title,
      summary: node.summary,
      kind: node.kind,
      parentId: node.parentId || '',
      sourceParentId: node.parentId || '',
      sourceId: customNodeMap.value.get(node.id)?.sourceId || node.id
    })
    getBrainChildIds(node.id).forEach((childId) => visit(childId))
  }
  visit(rootId)
  return result
}

function getBrainChildIds(parentId: string) {
  const customChildIds = customNodes.value
    .filter((node) => node.parentId === parentId && !trashedNodeIds.value.includes(node.id))
    .map((node) => node.id)
  const staticChildIds = linkSuggestions.value
    .filter((item) => item.parentId === parentId && !trashedNodeIds.value.includes(item.id))
    .map((item) => item.id)
  return [...staticChildIds, ...customChildIds]
}

pasteBrainClipboardIntoNode = async function pasteBrainClipboardIntoNode(targetId: string) {
  if (isReadOnlyMode.value) return
  const targetNode = getBrainNodeById(targetId)
  const clipboard = brainClipboard.value
  if (!targetNode || !clipboard.entries.length) return
  pushBrainHistorySnapshot()
  const idMap = new Map<string, string>()
  const now = new Date().toISOString()
  const clones = clipboard.entries.map((entry) => {
    const parentId = entry.sourceParentId && idMap.has(entry.sourceParentId)
      ? idMap.get(entry.sourceParentId)!
      : targetNode.id
    const cloneId = createCustomBrainNodeId()
    idMap.set(entry.id, cloneId)
    return {
      id: cloneId,
      title: buildPastedNodeTitle(entry.title),
      summary: entry.summary || t('brain.workspace.localPasteNode'),
      kind: entry.kind === 'root' ? 'group' : entry.kind,
      parentId,
      sourceId: entry.sourceId || entry.id,
      createdAt: now
    } satisfies BrainWorkspaceCustomNode
  })
  customNodes.value = [...customNodes.value, ...clones]
  if (clipboard.mode === 'cut') {
    await deleteNodesPermanently(clipboard.ids, true)
    clearBrainClipboard()
  }
  selectedNodeIds.value = clones.map((node) => node.id)
  focusedNodeId.value = targetNode.id
  toast(clones.length > 1 ? t('brain.workspace.toast.pastedNodes', { count: clones.length }) : t('brain.workspace.toast.nodePasted'), 'success')
}

function buildPastedNodeTitle(title: string) {
  const safeTitle = String(title || '').trim() || t('brain.graphPreview.unnamedNode')
  // i18n 保留：'副本' 既是写入节点标题的数据后缀，也是 endsWith 去重判据，翻译会导致双后缀，按数据约定保留
  return safeTitle.endsWith('副本') ? safeTitle : `${safeTitle}副本`
}

function createCustomBrainNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `brain:custom:${crypto.randomUUID()}`
  }
  return `brain:custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function createCognitionNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${COGNITION_NODE_ID_PREFIX}${crypto.randomUUID()}`
  }
  return `${COGNITION_NODE_ID_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

clearBrainClipboard = function clearBrainClipboard() {
  brainClipboard.value = { mode: '', ids: [], entries: [] }
}

isClipboardCutPending = function isClipboardCutPending(nodeId: string) {
  return brainClipboard.value.mode === 'cut' && brainClipboard.value.ids.includes(nodeId)
}

isClipboardCopyPending = function isClipboardCopyPending(nodeId: string) {
  return brainClipboard.value.mode === 'copy' && brainClipboard.value.ids.includes(nodeId)
}

function isCognitionNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId === COGNITION_ROOT_NODE_ID || normalizedId.startsWith(COGNITION_NODE_ID_PREFIX)
}

function isTraceNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId.startsWith(TRACE_NODE_ID_PREFIX)
}

function isTraceContainerNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId === TRACE_ROOT_NODE_ID
}

function createTraceNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${TRACE_NODE_ID_PREFIX}${crypto.randomUUID()}`
  }
  return `${TRACE_NODE_ID_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function cloneBrainOperationSnapshot(snapshot?: BrainOperationSnapshot): BrainOperationSnapshot {
  const source = snapshot || {
    customNodes: customNodes.value,
    trashedNodeIds: trashedNodeIds.value,
    cognitionNodes: currentCharacter.value ? readCharacterBrainCognitionNodes(currentCharacter.value) : [],
    traceNodes: currentCharacter.value ? readCharacterBrainTraceNodes(currentCharacter.value) : [],
    trajectoryMeta: currentCharacter.value ? readCharacterBrainTrajectoryMeta(currentCharacter.value) : { birthDate: '', zeroNote: '', viewOffsets: {} },
    nodeWorldPositions: nodeWorldPositions.value,
    nodeSessionPositions: nodeSessionPositions.value,
    historyPositionGroup: collectCurrentSceneHistoryPositionGroup(),
    layoutModes: {}
  }
  return {
    customNodes: source.customNodes.map((node) => ({ ...node })),
    trashedNodeIds: [...source.trashedNodeIds],
    cognitionNodes: source.cognitionNodes.map((node) => ({ ...node })),
    traceNodes: source.traceNodes.map((node) => ({
      ...node,
      relatedEntityIds: [...node.relatedEntityIds],
      tags: [...node.tags]
    })),
    trajectoryMeta: {
      ...source.trajectoryMeta,
      viewOffsets: {}
    },
    nodeWorldPositions: normalizeNodePositionMap(source.nodeWorldPositions),
    nodeSessionPositions: normalizeNodePositionMap(source.nodeSessionPositions),
    historyPositionGroup: normalizeNodePositionMap(source.historyPositionGroup),
    layoutModes: {}
  }
}

function collectCurrentSceneHistoryPositionGroup() {
  const positions: Record<string, NodeWorldPosition> = {}
  sceneNodes.value.forEach((node) => {
    positions[node.id] = {
      x: node.x,
      y: node.y
    }
  })
  return positions
}

pushBrainHistorySnapshot = function pushBrainHistorySnapshot() {
  brainUndoStack.value = [...brainUndoStack.value.slice(-39), cloneBrainOperationSnapshot()]
  brainRedoStack.value = []
}

async function applyBrainHistorySnapshot(snapshot: BrainOperationSnapshot) {
  if (!isReadOnlyMode.value) {
    customNodes.value = snapshot.customNodes.map((node) => ({ ...node }))
    trashedNodeIds.value = [...snapshot.trashedNodeIds]
  }
  const nextWorldPositions = omitBrainRootPosition(normalizeNodePositionMap(snapshot.nodeWorldPositions))
  const historyGroup = normalizeNodePositionMap(snapshot.historyPositionGroup)
  Object.keys(nextWorldPositions).forEach((nodeId) => {
    delete historyGroup[nodeId]
  })
  nodeWorldPositions.value = nextWorldPositions
  nodeSessionPositions.value = {
    ...historyGroup,
    ...normalizeNodePositionMap(snapshot.nodeSessionPositions)
  }
  layoutModes.value = {}
  const character = currentCharacter.value
  if (character && !isReadOnlyMode.value && !hasProjectionUnits.value) {
    const positionChanges = buildCharacterBrainNodePositionsChange(snapshot.nodeWorldPositions) as any
    await characterStore.updateCharacter(character.id, {
      ...(buildCharacterBrainCognitionNodesChange(snapshot.cognitionNodes) as any),
      ...(buildCharacterBrainTraceNodesChange(snapshot.traceNodes) as any),
      ...(buildCharacterBrainTrajectoryMetaChange({
        ...snapshot.trajectoryMeta,
        viewOffsets: {}
      }) as any),
      ...positionChanges
    })
  }
  selectedNodeIds.value = selectedNodeIds.value.filter((nodeId) => getBrainNodeById(nodeId) && !trashedNodeIds.value.includes(nodeId))
  openCards.value = openCards.value.filter((card) => !trashedNodeIds.value.includes(card.nodeId))
  skipSceneLayoutPreserveOnce.value = true
  rehydrateScene()
  refreshOpenCards()
}

undoBrainOps = async function undoBrainOps() {
  const previous = brainUndoStack.value[brainUndoStack.value.length - 1]
  if (!previous) return
  brainUndoStack.value = brainUndoStack.value.slice(0, -1)
  brainRedoStack.value = [...brainRedoStack.value, cloneBrainOperationSnapshot()]
  await applyBrainHistorySnapshot(previous)
  toast(t('brain.workspace.toast.undone'), 'success')
}

redoBrainOps = async function redoBrainOps() {
  const next = brainRedoStack.value[brainRedoStack.value.length - 1]
  if (!next) return
  brainRedoStack.value = brainRedoStack.value.slice(0, -1)
  brainUndoStack.value = [...brainUndoStack.value, cloneBrainOperationSnapshot()]
  await applyBrainHistorySnapshot(next)
  toast(t('brain.workspace.toast.redone'), 'success')
}

function toggleMiniChat() {
  closeNodeContextMenu()
  chatMiniOpen.value = !chatMiniOpen.value
}

function startMiniChatDrag(event: PointerEvent) {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  const shell = canvasShellRef.value
  const miniChat = miniChatRef.value
  if (!shell || !miniChat) return
  const shellRect = shell.getBoundingClientRect()
  const chatRect = miniChat.getBoundingClientRect()
  const width = miniChat.offsetWidth || chatRect.width
  const height = miniChat.offsetHeight || chatRect.height
  const offsetX = event.clientX - chatRect.left
  const offsetY = event.clientY - chatRect.top

  const moveMiniChat = (moveEvent: PointerEvent) => {
    const bounds = {
      width: Math.max(shellRect.width, 1),
      height: Math.max(shellRect.height, 1)
    }
    miniChatPlacement.value = clampMiniChatPlacement({
      left: moveEvent.clientX - shellRect.left - offsetX,
      top: moveEvent.clientY - shellRect.top - offsetY
    }, bounds, width, height)
  }

  const stopDrag = () => {
    window.removeEventListener('pointermove', moveMiniChat)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
  }

  moveMiniChat(event)
  window.addEventListener('pointermove', moveMiniChat)
  window.addEventListener('pointerup', stopDrag, { once: true })
  window.addEventListener('pointercancel', stopDrag, { once: true })
}

function startMiniChatResize(corner: ResizeCorner, event: PointerEvent) {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  const shell = canvasShellRef.value
  const miniChat = miniChatRef.value
  if (!shell || !miniChat) return
  const shellRect = shell.getBoundingClientRect()
  const chatRect = miniChat.getBoundingClientRect()
  const startX = event.clientX
  const startY = event.clientY
  const startWidth = chatRect.width
  const startHeight = chatRect.height
  const startLeft = chatRect.left - shellRect.left
  const startTop = chatRect.top - shellRect.top

  const resizeMiniChat = (moveEvent: PointerEvent) => {
    const bounds = getCanvasBounds()
    const nextBox = resolveResizedBox({
      corner,
      startX,
      startY,
      pointerX: moveEvent.clientX,
      pointerY: moveEvent.clientY,
      startLeft,
      startTop,
      startWidth,
      startHeight,
      bounds,
      minWidth: MINI_CHAT_MIN_WIDTH,
      minHeight: MINI_CHAT_MIN_HEIGHT
    })
    miniChatSize.value = {
      width: nextBox.width,
      height: nextBox.height
    }
    miniChatPlacement.value = {
      left: nextBox.left,
      top: nextBox.top
    }
    persistMiniChatSize()
  }

  const stopResize = () => {
    window.removeEventListener('pointermove', resizeMiniChat)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    persistMiniChatSize()
  }

  resizeMiniChat(event)
  window.addEventListener('pointermove', resizeMiniChat)
  window.addEventListener('pointerup', stopResize, { once: true })
  window.addEventListener('pointercancel', stopResize, { once: true })
}

function loadMiniChatSize() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(MINI_CHAT_SIZE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<MiniChatSize>
    const width = Number(parsed.width)
    const height = Number(parsed.height)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    const bounds = getCanvasBounds()
    miniChatSize.value = {
      width: clamp(width, MINI_CHAT_MIN_WIDTH, Math.max(bounds.width - 16, MINI_CHAT_MIN_WIDTH)),
      height: clamp(height, MINI_CHAT_MIN_HEIGHT, Math.max(bounds.height - 16, MINI_CHAT_MIN_HEIGHT))
    }
  } catch {
    miniChatSize.value = null
  }
}

function persistMiniChatSize() {
  if (typeof window === 'undefined' || !miniChatSize.value) return
  try {
    window.localStorage.setItem(MINI_CHAT_SIZE_STORAGE_KEY, JSON.stringify(miniChatSize.value))
  } catch {
    // 本地持久化失败不影响小窗当前使用。
  }
}

function normalizeMinDensity(value: unknown) {
  const density = Number(value)
  return densityOptions.some((option) => option === density)
    ? density as typeof densityOptions[number]
    : DEFAULT_MIN_DENSITY
}

function loadMinDensity() {
  if (typeof window === 'undefined') return
  try {
    minDensity.value = normalizeMinDensity(window.localStorage.getItem(MIN_DENSITY_STORAGE_KEY))
  } catch {
    minDensity.value = DEFAULT_MIN_DENSITY
  }
}

function saveMinDensity() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MIN_DENSITY_STORAGE_KEY, String(normalizeMinDensity(minDensity.value)))
  } catch {
    // 浓度偏好写入失败只影响下次打开关系视图，不影响当前渲染。
  }
}

function normalizeNodeLabelBaseSize(value: number) {
  return nodeLabelSizeOptions.some((option) => option.value === value) ? value : DEFAULT_NODE_LABEL_FONT_SIZE
}

function loadNodeLabelBaseSize() {
  if (typeof window === 'undefined') return
  try {
    nodeLabelBaseSize.value = normalizeNodeLabelBaseSize(Number(window.localStorage.getItem(NODE_LABEL_FONT_SIZE_STORAGE_KEY)))
  } catch {
    nodeLabelBaseSize.value = DEFAULT_NODE_LABEL_FONT_SIZE
  }
}

function saveNodeLabelBaseSize() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NODE_LABEL_FONT_SIZE_STORAGE_KEY, String(nodeLabelBaseSize.value))
  } catch {
    // 字号偏好写入失败不影响当前关系视图阅读。
  }
}

function loadLayoutModes() {
  layoutModes.value = {}
  if (typeof window === 'undefined') {
    return
  }
  const storageKey = getLayoutModeStorageKey()
  if (!storageKey) return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // 旧结构模式偏好清理失败不影响当前默认网图显示。
  }
}

function persistLayoutModes() {
  if (typeof window === 'undefined') return
  const storageKey = getLayoutModeStorageKey()
  if (!storageKey) return
  try {
    const entries = Object.entries(layoutModes.value)
      .filter(([, mode]) => mode === 'folder' || mode === 'network')
    if (!entries.length) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 模式偏好写入失败时，只影响下次进入大脑的默认显示。
  }
}

function normalizeLayoutModes(_raw: unknown): Record<string, CharacterBrainNodeLayoutMode> {
  return {}
}

function getLayoutModeStorageKey() {
  const characterId = String(props.characterId || '').trim()
  if (!characterId) return ''
  return `langhuan:character-brain-layout-modes:${characterId}`
}

function loadCustomNodes() {
  if (typeof window === 'undefined') {
    customNodes.value = []
    return
  }
  const storageKey = getCustomNodeStorageKey()
  if (!storageKey) {
    customNodes.value = []
    return
  }
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    customNodes.value = normalizeCustomNodes(parsed)
  } catch {
    customNodes.value = []
  }
}

function persistCustomNodes() {
  if (typeof window === 'undefined') return
  const storageKey = getCustomNodeStorageKey()
  if (!storageKey) return
  try {
    if (!customNodes.value.length) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(customNodes.value))
  } catch {
    // 本地粘贴节点暂时只影响当前大脑工作台，不打断其它功能。
  }
}

function normalizeCustomNodes(raw: unknown): BrainWorkspaceCustomNode[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const id = String(record.id || '').trim()
    const parentId = String(record.parentId || '').trim()
    if (!id || !parentId) return null
    const kind = record.kind === 'root' || record.kind === 'zone' || record.kind === 'group' || record.kind === 'field'
      ? record.kind
      : 'field'
    return {
      id,
      parentId,
      kind,
      title: String(record.title || t('brain.graphPreview.unnamedNode')).trim() || t('brain.graphPreview.unnamedNode'),
      summary: String(record.summary || t('brain.workspace.localPasteNode')).trim() || t('brain.workspace.localPasteNode'),
      sourceId: String(record.sourceId || '').trim() || undefined,
      createdAt: String(record.createdAt || '').trim() || undefined
    }
  }).filter(Boolean) as BrainWorkspaceCustomNode[]
}

function getCustomNodeStorageKey() {
  const characterId = String(props.characterId || '').trim()
  if (!characterId) return ''
  return `${CUSTOM_NODE_STORAGE_PREFIX}${characterId}`
}

function loadTrashedNodeIds() {
  trashedNodeIds.value = []
  if (typeof window === 'undefined') return
  const storageKey = getTrashStorageKey()
  if (!storageKey) return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // 旧回收站缓存清理失败时，不打断当前使用。
  }
}

function getTrashStorageKey() {
  const characterId = String(props.characterId || '').trim()
  if (!characterId) return ''
  return `${TRASH_STORAGE_PREFIX}${characterId}`
}

function openCard(nodeId: string) {
  const character = currentCharacter.value
  if (!character) return
  const nextCard = buildBrainCard(character, nodeId)
  if (!nextCard) return
  const exists = openCards.value.find((item) => item.id === nextCard.id)
  if (exists) {
    exists.content = nextCard.content
    exists.cardType = nextCard.cardType
    exists.editable = nextCard.editable
    exists.formFields = nextCard.formFields
    exists.innerEntries = nextCard.innerEntries
    exists.linkDraft = nextCard.linkDraft
    openCards.value = [...openCards.value]
    return
  }
  openCards.value = [...openCards.value, nextCard]
}

function openTraceInnerEntryCard(nodeId: string, entryId: string) {
  const normalizedNodeId = String(nodeId || '').trim()
  const normalizedEntryId = String(entryId || '').trim()
  if (!normalizedNodeId || !normalizedEntryId) return
  const childNodeId = `${normalizedNodeId}::inner::${normalizedEntryId}`
  const childCardId = `card:${childNodeId}`
  const alreadyOpen = openCards.value.some((item) => item.id === childCardId)
  openCard(childNodeId)
  if (alreadyOpen) return
  const bounds = getCanvasBounds()
  const cardWidth = resolveCardWidth()
  const cardHeight = resolveCardHeight(bounds)
  const parentPlacement = resolveCurrentCardPlacement(`card:${normalizedNodeId}`) || {
    left: CARD_EDGE_GAP,
    top: CARD_EDGE_GAP,
    width: cardWidth,
    height: cardHeight
  }
  const nextPlacement = clampBrainFloatingCardPosition(
    {
      left: parentPlacement.left + parentPlacement.width + CARD_ATTACH_GAP,
      top: parentPlacement.top
    },
    bounds,
    cardWidth,
    cardHeight,
    CARD_EDGE_GAP
  )
  cardPlacements.value = {
    ...cardPlacements.value,
    [childCardId]: {
      mode: 'detached',
      left: nextPlacement.left,
      top: nextPlacement.top,
      width: cardWidth,
      height: cardHeight
    }
  }
}

function closeCard(cardId: string) {
  openCards.value = openCards.value.filter((item) => item.id !== cardId)
  const nextPlacements = { ...cardPlacements.value }
  delete nextPlacements[cardId]
  cardPlacements.value = nextPlacements
}

async function saveCard(nodeId: string, nextContent: string | Record<string, string | string[] | number | undefined>) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  if (!character) return
  const changes = applyCharacterBrainCardDraft(character, nodeId, nextContent)
  if (!Object.keys(changes).length) {
    toast(t('brain.workspace.toast.noModifyToSave'), 'info')
    return
  }
  pushBrainHistorySnapshot()
  await characterStore.updateCharacter(character.id, changes as any)
  toast(t('brain.workspace.toast.cardSaved'), 'success')
  const refreshed = currentCharacter.value
  if (!refreshed) return
  openCards.value = openCards.value.map((card) => {
    if (card.nodeId !== nodeId) return card
    const next = buildBrainCard(refreshed, nodeId)
    return next || card
  })
}

function readWorkspaceBrainDocuments(character: Character) {
  const raw = character.brainDocuments ?? character.brain_documents
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {}
}

function buildWorkspaceBrainDocumentsChange(documents: Record<string, string>) {
  return {
    brainDocuments: documents,
    brain_documents: JSON.stringify(documents)
  }
}

async function confirmPendingNode(nodeId: string) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  if (!character) return
  try {
    pushBrainHistorySnapshot()
    if (isTraceNodeId(nodeId)) {
      const nextNodes = readCharacterBrainTraceNodes(character).map((node) => (
        node.id === nodeId ? { ...node, confirmed: true, pendingReview: undefined, updatedAt: new Date().toISOString() } : node
      ))
      await characterStore.updateCharacter(character.id, buildCharacterBrainTraceNodesChange(nextNodes) as any)
      toast(t('brain.workspace.toast.confirmedTraceNode'), 'success')
      return
    }
    if (isCognitionNodeId(nodeId)) {
      const nextNodes = readCharacterBrainCognitionNodes(character).map((node) => (
        node.id === nodeId ? { ...node, pendingReview: undefined, updatedAt: new Date().toISOString() } : node
      ))
      await characterStore.updateCharacter(character.id, buildCharacterBrainCognitionNodesChange(nextNodes) as any)
      toast(t('brain.workspace.toast.confirmedSoulNode'), 'success')
    }
  } catch (error) {
    console.error('确认待审核节点失败:', error)
    toast(t('brain.workspace.toast.confirmPendingFailed'), 'error')
  }
}

async function rejectPendingNode(nodeId: string) {
  if (isReadOnlyMode.value) return
  const character = currentCharacter.value
  if (!character) return
  try {
    pushBrainHistorySnapshot()
    if (isTraceNodeId(nodeId)) {
      const target = readCharacterBrainTraceNodes(character).find((node) => node.id === nodeId)
      if (!target?.pendingReview) return
      const now = new Date().toISOString()
      const nextNodes = target.pendingReview.mode === 'create'
        ? readCharacterBrainTraceNodes(character).filter((node) => node.id !== nodeId)
        : readCharacterBrainTraceNodes(character).map((node) => {
            if (node.id !== nodeId) return node
            const previous = target.pendingReview?.previous
            return {
              ...node,
              title: previous?.title || node.title,
              summary: previous?.summary || '',
              timeLabel: previous?.timeLabel || node.timeLabel,
              pointDate: previous?.pointDate || node.pointDate,
              ageLabel: previous?.ageLabel || node.ageLabel,
              content: previous?.content || '',
              relatedEntityIds: previous?.relatedEntityIds || [],
              tags: previous?.tags || [],
              confirmed: true,
              pendingReview: undefined,
              updatedAt: now
            }
          })
      await characterStore.updateCharacter(character.id, buildCharacterBrainTraceNodesChange(nextNodes) as any)
      if (target.pendingReview.mode === 'create') {
        closeCard(`card:${nodeId}`)
      }
      toast(target.pendingReview.mode === 'create' ? t('brain.workspace.toast.rejectedNewTrace') : t('brain.workspace.toast.restoredOldTrace'), 'success')
      return
    }
    if (isCognitionNodeId(nodeId)) {
      const target = readCharacterBrainCognitionNodes(character).find((node) => node.id === nodeId)
      if (!target?.pendingReview) return
      const documents = { ...readWorkspaceBrainDocuments(character) }
      const now = new Date().toISOString()
      const nextNodes = target.pendingReview.mode === 'create'
        ? readCharacterBrainCognitionNodes(character).filter((node) => node.id !== nodeId)
        : readCharacterBrainCognitionNodes(character).map((node) => {
            if (node.id !== nodeId) return node
            const previous = target.pendingReview?.previous
            if (previous) {
              if (previous.content) {
                documents[nodeId] = previous.content
              } else {
                delete documents[nodeId]
              }
            }
            return {
              ...node,
              title: previous?.title || node.title,
              summary: previous?.summary || '',
              sourceDocumentId: previous?.sourceDocumentId || undefined,
              sourceDisplayPath: previous?.sourceDisplayPath || undefined,
              pendingReview: undefined,
              updatedAt: now
            }
          })
      if (target.pendingReview.mode === 'create') {
        delete documents[nodeId]
      }
      await characterStore.updateCharacter(character.id, {
        ...(buildCharacterBrainCognitionNodesChange(nextNodes) as any),
        ...(buildWorkspaceBrainDocumentsChange(documents) as any)
      })
      if (target.pendingReview.mode === 'create') {
        closeCard(`card:${nodeId}`)
      }
      toast(target.pendingReview.mode === 'create' ? t('brain.workspace.toast.rejectedNewSoul') : t('brain.workspace.toast.restoredOldSoul'), 'success')
    }
  } catch (error) {
    console.error('拒绝待审核节点失败:', error)
    toast(t('brain.workspace.toast.rejectPendingFailed'), 'error')
  }
}

async function loadCardPresetModels(cardId: string, presetName: string) {
  const preset = apiPresets.value.find((item) => item.name === presetName)
  if (!preset) return

  modelLoadingPreset.value = cardId
  try {
    const res = await fetch(API.AI_MODELS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetName: preset.name })
    })
    const data = await res.json() as { data?: Array<{ id?: string }>; error?: string }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    const models = Array.isArray(data.data)
      ? data.data.map((item) => String(item.id || '').trim()).filter(Boolean)
      : []
    await settingStore.updateApiPreset(preset.name, { availableModels: models })
    toast(models.length ? t('brain.workspace.toast.modelsLoaded', { count: models.length }) : t('brain.workspace.toast.modelListEmpty'), models.length ? 'success' : 'warning')
  } catch (error) {
    console.error('加载角色大脑卡片模型失败:', error)
    toast(t('brain.workspace.toast.loadModelsFailed'), 'error')
  } finally {
    modelLoadingPreset.value = ''
  }
}

function refreshOpenCards() {
  const character = currentCharacter.value
  if (!character || !openCards.value.length) return
  openCards.value = openCards.value
    .map((card) => buildBrainCard(character, card.nodeId) || card)
}

function buildBrainCard(character: Character, nodeId: string): CharacterBrainCardModel | null {
  const custom = customNodeMap.value.get(nodeId)
  if (custom) {
    return {
      id: `card:${custom.id}`,
      nodeId: custom.id,
      title: custom.title || t('brain.graphPreview.unnamedNode'),
      content: [
        `# ${custom.title || t('brain.graphPreview.unnamedNode')}`,
        '',
        custom.summary || t('brain.workspace.localPasteNode'),
        '',
        custom.sourceId ? t('brain.workspace.sourceNodePrefix', { id: custom.sourceId }) : ''
      ].filter(Boolean).join('\n'),
      cardType: 'document',
      editable: false,
      linkDraft: { text: '', targetIds: [] }
    }
  }
  const card = buildCharacterBrainCard(character, nodeId)
  if (!card || !isReadOnlyMode.value) return card
  return {
    ...card,
    editable: false,
    compilePageEditable: false,
    compileRelationHintsEditable: false
  }
}

function minimizeCard(cardId: string) {
  const current = cardPlacements.value[cardId]
  const fallback = resolveFallbackCardPlacement(cardId)
  const size = resolveCardCurrentSize(cardId)
  const bounds = getCanvasBounds()
  cardPlacements.value = {
    ...cardPlacements.value,
    [cardId]: {
      mode: 'minimized',
      left: bounds.width - EDGE_TAB_WIDTH,
      top: clampBrainEdgeTabTop(bounds, EDGE_TAB_HEIGHT, CARD_EDGE_GAP, current?.top ?? fallback.top),
      restoreLeft: current?.mode === 'detached' ? current.left : fallback.left,
      restoreTop: current?.mode === 'detached' ? current.top : fallback.top,
      restoreWidth: current?.width ?? size.width,
      restoreHeight: current?.height ?? size.height
    }
  }
}

function restoreMinimizedCard(cardId: string) {
  const current = cardPlacements.value[cardId]
  if (current?.mode !== 'minimized') return
  const bounds = getCanvasBounds()
  cardPlacements.value = {
    ...cardPlacements.value,
    [cardId]: {
      mode: 'detached',
      ...clampBrainFloatingCardPosition(
        {
          left: current.restoreLeft ?? (bounds.width - resolveCardWidth() - 56),
          top: current.restoreTop ?? current.top
        },
        bounds,
        current.restoreWidth ?? resolveCardWidth(),
        current.restoreHeight ?? CARD_ESTIMATED_HEIGHT,
        CARD_EDGE_GAP
      ),
      width: current.restoreWidth,
      height: current.restoreHeight
    }
  }
}

function startCardPinDrag(cardId: string, event: PointerEvent) {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const cardEl = target.closest('.brain-workspace__inline-card')
  if (!(cardEl instanceof HTMLElement)) return
  const board = cardEl.parentElement
  if (!(board instanceof HTMLElement)) return
  const cardRect = cardEl.getBoundingClientRect()
  const boardRect = board.getBoundingClientRect()
  const current = cardPlacements.value[cardId]
  const offsetX = event.clientX - cardRect.left
  const offsetY = event.clientY - cardRect.top
  const startLeft = cardRect.left - boardRect.left
  const startTop = cardRect.top - boardRect.top
  const startWidth = cardRect.width || resolveCardWidth()
  const startHeight = cardRect.height || resolveCardHeight()
  const restoreSnapshot = {
    left: current?.mode === 'detached' ? current.left : startLeft,
    top: current?.mode === 'detached' ? current.top : startTop,
    width: current?.width ?? startWidth,
    height: current?.height ?? startHeight
  }

  const moveCard = (moveEvent: PointerEvent) => {
    const width = cardEl.offsetWidth || resolveCardWidth()
    const height = cardEl.offsetHeight || 220
    const nextLeft = clamp(moveEvent.clientX - boardRect.left - offsetX, 8, Math.max(boardRect.width - width - 8, 8))
    const nextTop = clamp(moveEvent.clientY - boardRect.top - offsetY, 8, Math.max(boardRect.height - height - 8, 8))
    const pinX = moveEvent.clientX - boardRect.left
    const shouldMinimize = pinX >= boardRect.width - EDGE_TAB_TRIGGER_GAP
    cardPlacements.value = {
      ...cardPlacements.value,
      [cardId]: {
        mode: shouldMinimize ? 'minimized' : 'detached',
        left: nextLeft,
        top: nextTop,
        width,
        height,
        restoreLeft: shouldMinimize ? restoreSnapshot.left : nextLeft,
        restoreTop: shouldMinimize ? restoreSnapshot.top : nextTop,
        restoreWidth: shouldMinimize ? restoreSnapshot.width : width,
        restoreHeight: shouldMinimize ? restoreSnapshot.height : height
      }
    }
  }

  const stopDrag = () => {
    window.removeEventListener('pointermove', moveCard)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
  }

  moveCard(event)
  window.addEventListener('pointermove', moveCard)
  window.addEventListener('pointerup', stopDrag, { once: true })
  window.addEventListener('pointercancel', stopDrag, { once: true })
}

function startCardResize(cardId: string, corner: ResizeCorner, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const cardEl = target.closest('.brain-workspace__inline-card')
  if (!(cardEl instanceof HTMLElement)) return
  const board = cardEl.parentElement
  if (!(board instanceof HTMLElement)) return
  const cardRect = cardEl.getBoundingClientRect()
  const boardRect = board.getBoundingClientRect()
  const startX = event.clientX
  const startY = event.clientY
  const startWidth = cardRect.width
  const startHeight = cardRect.height
  const startLeft = cardRect.left - boardRect.left
  const startTop = cardRect.top - boardRect.top

  const resizeCard = (moveEvent: PointerEvent) => {
    const nextBox = resolveResizedBox({
      corner,
      startX,
      startY,
      pointerX: moveEvent.clientX,
      pointerY: moveEvent.clientY,
      startLeft,
      startTop,
      startWidth,
      startHeight,
      bounds: {
        width: Math.max(boardRect.width, 1),
        height: Math.max(boardRect.height, 1)
      },
      minWidth: CARD_MIN_WIDTH,
      minHeight: CARD_MIN_HEIGHT
    })
    cardPlacements.value = {
      ...cardPlacements.value,
      [cardId]: {
        mode: 'detached',
        left: nextBox.left,
        top: nextBox.top,
        width: nextBox.width,
        height: nextBox.height
      }
    }
  }

  const stopResize = () => {
    window.removeEventListener('pointermove', resizeCard)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
  }

  resizeCard(event)
  window.addEventListener('pointermove', resizeCard)
  window.addEventListener('pointerup', stopResize, { once: true })
  window.addEventListener('pointercancel', stopResize, { once: true })
}

function startEdgeTabDrag(cardId: string, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const board = target.parentElement
  if (!(board instanceof HTMLElement)) return
  const tabRect = target.getBoundingClientRect()
  const boardRect = board.getBoundingClientRect()
  const offsetY = event.clientY - tabRect.top
  let moved = false

  const moveTab = (moveEvent: PointerEvent) => {
    moved = true
    const current = cardPlacements.value[cardId]
    if (current?.mode !== 'minimized') return
    cardPlacements.value = {
      ...cardPlacements.value,
      [cardId]: {
        ...current,
        top: clampBrainEdgeTabTop(
          { width: boardRect.width, height: boardRect.height },
          EDGE_TAB_HEIGHT,
          CARD_EDGE_GAP,
          moveEvent.clientY - boardRect.top - offsetY
        )
      }
    }
  }

  const stopDrag = () => {
    window.removeEventListener('pointermove', moveTab)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
    window.setTimeout(() => {
      if (moved) return
      restoreMinimizedCard(cardId)
    }, 0)
  }

  window.addEventListener('pointermove', moveTab)
  window.addEventListener('pointerup', stopDrag, { once: true })
  window.addEventListener('pointercancel', stopDrag, { once: true })
}

function runNodePrimaryAction(nodeId: string) {
  clearNodeSelection()
  pinnedFocusNodeId.value = ''
  if (hasProjectionUnits.value && isReadOnlyMode.value) {
    emit('projection-open', nodeId)
  }
  if (!isReadOnlyMode.value && DIRECT_FORM_NODE_IDS.has(nodeId)) {
    openCard(nodeId)
    return
  }
  if (!canExpandNode(nodeId)) {
    if (!isReadOnlyMode.value) openCard(nodeId)
    return
  }
  freezeSceneMotion()
  focusedNodeId.value = nodeId
}

function canExpandNode(nodeId: string) {
  const node = visibleNodeMap.value.get(nodeId)
  if (!node) return false
  if (node.kind === 'field') return false
  if (!customNodeMap.value.has(nodeId)) return true
  if (customNodeMap.value.has(nodeId)) {
    return customNodes.value.some((item) => item.parentId === nodeId && !trashedNodeIds.value.includes(item.id))
  }
  return false
}

function startNodeDrag(nodeId: string, event: PointerEvent | MouseEvent) {
  if (event.button !== 0) return
  if (isRelationInteractionMode.value && isSpacePanEvent(event)) {
    event.stopPropagation()
    event.preventDefault()
    startPan(event)
    return
  }
  const isSubtreeDrag = (event.ctrlKey || event.metaKey) && isLocalNodeDragEvent(event)
  if ((event.ctrlKey || event.metaKey) && !isSubtreeDrag) return
  closeNodeContextMenu()
  trashMenuOpen.value = false
  freezeSceneMotion()
  event.stopPropagation()
  event.preventDefault()
  const point = readScenePointerPosition(event)
  if (!point) return
  const behavior = resolveNodeDragBehavior(nodeId, event)
  const structuralMoveTargetIds = resolveMoveTargetIdsForBehavior(nodeId, behavior)
  const rigidFollowerIds = resolveRigidDragFollowerIds(nodeId, behavior, structuralMoveTargetIds)
  const moveTargetIds = Array.from(new Set([...structuralMoveTargetIds, ...rigidFollowerIds]))
  if (['local', 'subtree-pan', 'folder-pan', 'selection-pan'].includes(behavior)) {
    syncSceneIntoSessionPositions(moveTargetIds)
  }
  const dragStartPositions = ['network', 'local', 'subtree-pan', 'folder-pan', 'selection-pan'].includes(behavior)
    ? collectDragStartPositions(moveTargetIds)
    : undefined
  interactionState.value = {
    mode: 'node',
    behavior,
    pointerId: readPointerId(event),
    nodeId,
    moved: false,
    originX: point.x,
    originY: point.y,
    dragTargetX: point.x,
    dragTargetY: point.y,
    lastDeltaX: 0,
    lastDeltaY: 0,
    dragStartPositions,
    rigidFollowerIds,
    historyPushed: false
  }
  if ('pointerId' in event) svgRef.value?.setPointerCapture?.(event.pointerId)
}

function resolveNodeDragBehavior(nodeId: string, event: PointerEvent | MouseEvent): CharacterBrainNodeDragState['behavior'] {
  if ((event.ctrlKey || event.metaKey) && isLocalNodeDragEvent(event)) return 'subtree-pan'
  if (isRelationInteractionMode.value && selectedNodeIdSet.value.has(nodeId)) return 'selection-pan'
  return isLocalNodeDragEvent(event) ? 'local' : 'network'
}

function isLocalNodeDragEvent(event: PointerEvent | MouseEvent) {
  return event.shiftKey || event.getModifierState?.('Shift') || (event as (PointerEvent | MouseEvent) & { __shiftKey?: boolean }).__shiftKey === true
}

function readPointerId(event: PointerEvent | MouseEvent) {
  return 'pointerId' in event && typeof event.pointerId === 'number' ? event.pointerId : 1
}

function startCanvasInteraction(event: PointerEvent) {
  if (!isRelationInteractionMode.value) {
    if (event.button !== 0) return
    if (!(event.target instanceof SVGSVGElement)) return
    closeNodeContextMenu()
    trashMenuOpen.value = false
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) return
    if (isSpacePanEvent(event)) {
      startSelection(event, Boolean(event.shiftKey))
      return
    }
    startPan(event)
    return
  }
  const isMiddlePan = event.button === 1
  const isSpacePan = event.button === 0 && isSpacePanEvent(event)
  if (isMiddlePan || isSpacePan) {
    closeNodeContextMenu()
    trashMenuOpen.value = false
    event.preventDefault()
    startPan(event)
    return
  }
  if (event.button !== 0) return
  if (!(event.target instanceof SVGSVGElement)) return
  closeNodeContextMenu()
  trashMenuOpen.value = false
  event.preventDefault()
  startSelection(event, Boolean(event.ctrlKey || event.metaKey))
}

function handleDensityChange(event: Event) {
  minDensity.value = normalizeMinDensity(minDensity.value)
  saveMinDensity()
  const select = event.target instanceof HTMLSelectElement ? event.target : densitySelectRef.value
  select?.blur()
}

function handleNodeLabelSizeChange(event: Event) {
  nodeLabelBaseSize.value = normalizeNodeLabelBaseSize(nodeLabelBaseSize.value)
  saveNodeLabelBaseSize()
  const select = event.target instanceof HTMLSelectElement ? event.target : null
  select?.blur()
}

function startPan(event: PointerEvent | MouseEvent) {
  const point = readViewportPointerPosition(event)
  if (!point) return
  interactionState.value = {
    mode: 'pan',
    pointerId: readPointerId(event),
    moved: false,
    originX: point.x,
    originY: point.y,
    startOffsetX: viewportOffset.value.x,
    startOffsetY: viewportOffset.value.y
  }
  if ('pointerId' in event) svgRef.value?.setPointerCapture?.(event.pointerId)
}

function startSelection(event: PointerEvent, append: boolean) {
  const point = readScenePointerPosition(event)
  if (!point) return
  if (!append) selectedNodeIds.value = []
  interactionState.value = {
    mode: 'select',
    pointerId: event.pointerId,
    moved: false,
    append,
    originX: point.x,
    originY: point.y,
    currentX: point.x,
    currentY: point.y
  }
  svgRef.value?.setPointerCapture?.(event.pointerId)
}

function handlePointerMove(event: PointerEvent | MouseEvent) {
  const currentInteraction = interactionState.value
  if (!currentInteraction || currentInteraction.pointerId !== readPointerId(event)) return
  const point = currentInteraction.mode === 'pan'
    ? readViewportPointerPosition(event)
    : readScenePointerPosition(event)
  if (!point) return

  const movedDistance = Math.abs(point.x - currentInteraction.originX) + Math.abs(point.y - currentInteraction.originY)
  if (!currentInteraction.moved && movedDistance > 3) {
    interactionState.value = { ...currentInteraction, moved: true }
  }
  if (
    currentInteraction.mode === 'node'
    && (interactionState.value?.moved ?? currentInteraction.moved)
    && currentInteraction.historyPushed !== true
  ) {
    pushBrainHistorySnapshot()
    interactionState.value = {
      ...((interactionState.value?.mode === 'node' ? interactionState.value : currentInteraction)),
      historyPushed: true
    }
  }

  const activeInteraction = interactionState.value || currentInteraction
  if (activeInteraction.mode === 'node' && !activeInteraction.moved) return

  if (activeInteraction.mode === 'pan') {
    viewportOffset.value = {
      x: activeInteraction.startOffsetX + (point.x - activeInteraction.originX),
      y: activeInteraction.startOffsetY + (point.y - activeInteraction.originY)
    }
    return
  }

  if (activeInteraction.mode === 'select') {
    interactionState.value = {
      ...activeInteraction,
      currentX: point.x,
      currentY: point.y
    }
    return
  }

  const activeNodeId = activeInteraction.nodeId
  const previousDragTargetX = activeInteraction.dragTargetX
  const previousDragTargetY = activeInteraction.dragTargetY
  const deltaX = point.x - previousDragTargetX
  const deltaY = point.y - previousDragTargetY
  const totalDeltaX = point.x - activeInteraction.originX
  const totalDeltaY = point.y - activeInteraction.originY
  interactionState.value = {
    ...activeInteraction,
    nodeId: activeNodeId,
    dragTargetX: point.x,
    dragTargetY: point.y,
    lastDeltaX: deltaX,
    lastDeltaY: deltaY
  }
  if (interactionState.value.behavior === 'local') {
    moveLocalNodesFromStart(interactionState.value.dragStartPositions, totalDeltaX, totalDeltaY)
    return
  }
  if (interactionState.value.behavior === 'subtree-pan') {
    moveLocalNodesFromStart(interactionState.value.dragStartPositions, totalDeltaX, totalDeltaY)
    return
  }
  if (interactionState.value.behavior === 'folder-pan') {
    moveLocalNodesFromStart(interactionState.value.dragStartPositions, totalDeltaX, totalDeltaY)
    return
  }
  if (interactionState.value.behavior === 'selection-pan') {
    moveLocalNodesFromStart(interactionState.value.dragStartPositions, totalDeltaX, totalDeltaY)
    return
  }
  if (interactionState.value.behavior === 'network-pan') {
    if (stepPhysics(2)) requestPhysicsTick()
    return
  }
  if (stepPhysics(2)) requestPhysicsTick()
  moveRigidFollowersFromStart(interactionState.value, totalDeltaX, totalDeltaY)
}

function endInteraction(event: PointerEvent | MouseEvent) {
  const currentInteraction = interactionState.value
  if (!currentInteraction || currentInteraction.pointerId !== readPointerId(event)) return
  const shouldContinueElasticSettle = currentInteraction.mode === 'node' && currentInteraction.behavior === 'network' && currentInteraction.moved
  const shouldContinueNetworkPan = currentInteraction.mode === 'node' && currentInteraction.behavior === 'network-pan' && currentInteraction.moved
  if (currentInteraction.mode === 'node' && !currentInteraction.moved && event.button === 0) {
    closeNodeContextMenu()
    trashMenuOpen.value = false
    suppressNextNodeClick = {
      nodeId: currentInteraction.nodeId,
      altKey: Boolean(event.altKey),
      until: Date.now() + 250
    }
    if (event.altKey) {
      pinNodeFocus(currentInteraction.nodeId)
    } else {
      runNodePrimaryAction(currentInteraction.nodeId)
    }
  }
  if (currentInteraction.mode === 'select' && currentInteraction.moved) {
    applySelectionBox(currentInteraction)
  }
  if (shouldContinueNetworkPan) {
    commitVisibleNetworkPan(
      currentInteraction.dragTargetX - currentInteraction.originX,
      currentInteraction.dragTargetY - currentInteraction.originY
    )
    freezeSceneMotion()
  } else if (shouldContinueElasticSettle) {
    if (stepPhysics(2)) requestPhysicsTick()
    moveRigidFollowersFromStart(
      currentInteraction,
      currentInteraction.dragTargetX - currentInteraction.originX,
      currentInteraction.dragTargetY - currentInteraction.originY
    )
    persistSessionPositions(displayedSceneNodes.value.map((node) => node.id))
    finalizeRigidFollowerPositions(currentInteraction)
    freezeSceneMotion()
  } else if (currentInteraction.mode === 'node' && currentInteraction.moved) {
    if (currentInteraction.behavior === 'subtree-pan') {
      finalizeSubtreeNodePositions(currentInteraction)
    } else if (['local', 'folder-pan', 'selection-pan'].includes(currentInteraction.behavior)) {
      finalizeLocalNodePositions(currentInteraction)
    } else if (currentInteraction.behavior === 'network') {
      persistSessionPositions(displayedSceneNodes.value.map((node) => node.id))
    }
    freezeSceneMotion()
  }
  if ('pointerId' in event) svgRef.value?.releasePointerCapture?.(event.pointerId)
  clearCanvasSelection()
  window.setTimeout(() => {
    interactionState.value = null
  }, 0)
}

function pinNodeFocus(nodeId: string) {
  if (!visibleNodeMap.value.has(nodeId)) return
  clearNodeSelection()
  if (pinnedFocusNodeId.value === nodeId) {
    pinnedFocusNodeId.value = ''
    return
  }
  pinnedFocusNodeId.value = nodeId
}

function toggleNodeSelection(nodeId: string) {
  if (!visibleNodeMap.value.has(nodeId)) return
  pinnedFocusNodeId.value = ''
  const current = new Set(selectedNodeIds.value)
  if (current.has(nodeId)) {
    current.delete(nodeId)
  } else {
    current.add(nodeId)
  }
  selectedNodeIds.value = Array.from(current)
}

function clearNodeSelection() {
  if (!selectedNodeIds.value.length) return
  selectedNodeIds.value = []
}

function pruneNodeSelection() {
  if (!selectedNodeIds.value.length) return
  const visibleIds = new Set(sceneNodes.value.map((node) => node.id))
  selectedNodeIds.value = selectedNodeIds.value.filter((nodeId) => visibleIds.has(nodeId))
}

function applySelectionBox(state: Extract<InteractionState, { mode: 'select' }>) {
  const box = normalizeSelectionBox(state.originX, state.originY, state.currentX, state.currentY)
  if (box.width < 4 && box.height < 4) return
  const matchedIds = sceneNodes.value
    .filter((node) => isNodeInsideSelectionBox(node, box))
    .map((node) => node.id)
  if (!matchedIds.length && state.append) return
  if (!state.append) {
    selectedNodeIds.value = matchedIds
    return
  }
  const merged = new Set(selectedNodeIds.value)
  matchedIds.forEach((nodeId) => merged.add(nodeId))
  selectedNodeIds.value = Array.from(merged)
}

function normalizeSelectionBox(originX: number, originY: number, currentX: number, currentY: number): SelectionBox {
  return {
    x: Math.min(originX, currentX),
    y: Math.min(originY, currentY),
    width: Math.abs(currentX - originX),
    height: Math.abs(currentY - originY)
  }
}

function isNodeInsideSelectionBox(node: CharacterBrainSimNode, box: SelectionBox) {
  return node.x >= box.x &&
    node.x <= box.x + box.width &&
    node.y >= box.y &&
    node.y <= box.y + box.height
}

function moveLocalNode(nodeId: string, deltaX: number, deltaY: number) {
  moveLocalNodes([nodeId], deltaX, deltaY)
}

function moveLocalNodes(nodeIds: string[], deltaX: number, deltaY: number) {
  const movingIds = new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (!movingIds.size) return
  let changed = false
  const nextPositions = { ...nodeSessionPositions.value }
  sceneNodes.value.forEach((node) => {
    if (!movingIds.has(node.id)) return
    node.x += deltaX
    node.y += deltaY
    node.layoutX += deltaX
    node.layoutY += deltaY
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    nextPositions[node.id] = {
      x: node.x,
      y: node.y
    }
    changed = true
  })
  if (!changed) return
  nodeSessionPositions.value = nextPositions
  sceneNodes.value = [...sceneNodes.value]
}

function resolveMovedNodeIdsFromInteraction(state: CharacterBrainNodeDragState) {
  const movedIds = state.behavior === 'subtree-pan'
    ? collectCompleteSubtreeIds(state.nodeId)
    : state.behavior === 'folder-pan'
      ? collectMoveTargetIdsWithHiddenDescendants(collectSceneSubtreeIds(state.nodeId))
      : state.behavior === 'selection-pan'
        ? collectMoveTargetIdsWithHiddenDescendants(collectSelectedMoveNodeIds())
        : collectMoveTargetIdsWithHiddenDescendants([state.nodeId])
  return Array.from(new Set([...movedIds, ...(state.rigidFollowerIds || [])]))
}

function resolveMoveTargetIdsForBehavior(
  nodeId: string,
  behavior: CharacterBrainNodeDragState['behavior']
) {
  if (behavior === 'subtree-pan') return collectCompleteSubtreeIds(nodeId)
  if (behavior === 'folder-pan') return collectMoveTargetIdsWithHiddenDescendants(collectSceneSubtreeIds(nodeId))
  if (behavior === 'selection-pan') return collectMoveTargetIdsWithHiddenDescendants(collectSelectedMoveNodeIds())
  return collectMoveTargetIdsWithHiddenDescendants([nodeId])
}

function resolveRigidDragFollowerIds(
  nodeId: string,
  behavior: CharacterBrainNodeDragState['behavior'],
  structuralMoveTargetIds: string[]
) {
  const renderedIds = new Set(sceneNodes.value.map((node) => node.id))
  const followerIds = new Set<string>()
  structuralMoveTargetIds.forEach((targetId) => {
    if (!renderedIds.has(targetId)) followerIds.add(targetId)
  })

  const relationAnchors = new Set(structuralMoveTargetIds)
  const structuralSceneIds = new Set(sceneNodes.value
    .filter((node) => node.edgeKind !== 'link')
    .map((node) => node.id))
  ;(props.projectionRelationEdges || []).forEach((edge) => {
    const sourceId = String(edge.sourceNodeId || '').trim()
    const targetId = String(edge.targetNodeId || '').trim()
    const relatedId = relationAnchors.has(sourceId)
      ? targetId
      : relationAnchors.has(targetId) ? sourceId : ''
    if (!relatedId || relationAnchors.has(relatedId)) return
    if (structuralSceneIds.has(relatedId)) return
    followerIds.add(relatedId)
    collectHiddenDescendantIds([relatedId]).forEach((descendantId) => followerIds.add(descendantId))
  })

  if (behavior !== 'network') {
    structuralMoveTargetIds.forEach((targetId) => followerIds.add(targetId))
  }
  followerIds.delete(nodeId)
  return [...followerIds]
}

function syncSceneIntoSessionPositions(nodeIds = sceneNodes.value.map((node) => node.id)) {
  persistSessionPositions(nodeIds)
}

function collectDragStartPositions(nodeIds: string[]) {
  const targetIds = new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (!targetIds.size) return {}
  const positions: Record<string, { x: number; y: number }> = {}
  sceneNodes.value.forEach((node) => {
    if (!targetIds.has(node.id)) return
    positions[node.id] = {
      x: node.x,
      y: node.y
    }
  })
  Object.entries({ ...nodeWorldPositions.value, ...nodeSessionPositions.value }).forEach(([nodeId, position]) => {
    if (!targetIds.has(nodeId) || positions[nodeId]) return
    positions[nodeId] = { x: position.x, y: position.y }
  })
  fillMissingDragStartPositions(targetIds, positions)
  fillMissingRelationDragStartPositions(targetIds, positions)
  fillMissingDragStartPositions(targetIds, positions)
  return positions
}

function fillMissingRelationDragStartPositions(
  targetIds: Set<string>,
  positions: Record<string, { x: number; y: number }>
) {
  const edges = props.projectionRelationEdges || []
  for (let iteration = 0; iteration < Math.max(edges.length, 1); iteration += 1) {
    let changed = false
    edges.forEach((edge, index) => {
      const sourceId = String(edge.sourceNodeId || '').trim()
      const targetId = String(edge.targetNodeId || '').trim()
      const sourcePosition = positions[sourceId]
      const targetPosition = positions[targetId]
      if (targetIds.has(targetId) && !targetPosition && sourcePosition) {
        const angle = (((index + 1) * 53) - 90) * Math.PI / 180
        positions[targetId] = {
          x: sourcePosition.x + Math.cos(angle) * 190,
          y: sourcePosition.y + Math.sin(angle) * 190
        }
        changed = true
      }
      if (targetIds.has(sourceId) && !sourcePosition && targetPosition) {
        const angle = (((index + 1) * 53) + 90) * Math.PI / 180
        positions[sourceId] = {
          x: targetPosition.x + Math.cos(angle) * 190,
          y: targetPosition.y + Math.sin(angle) * 190
        }
        changed = true
      }
    })
    if (!changed) break
  }
}

function fillMissingDragStartPositions(
  targetIds: Set<string>,
  positions: Record<string, { x: number; y: number }>
) {
  const parentMap = buildCompleteParentMap()
  const childrenByParent = buildCompleteChildrenMap(parentMap)
  const queue = [...targetIds].filter((nodeId) => positions[nodeId])
  const visited = new Set(queue)
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor]
    const children = (childrenByParent.get(parentId) || []).filter((childId) => targetIds.has(childId))
    const parentPosition = positions[parentId]
    children.forEach((childId, index) => {
      if (!positions[childId]) {
        const angle = ((index * 360) / Math.max(children.length, 1)) - 90
        const radius = 150 + (getSubtreeDepth(childId, parentMap) * 18)
        positions[childId] = {
          x: parentPosition.x + Math.cos((angle * Math.PI) / 180) * radius,
          y: parentPosition.y + Math.sin((angle * Math.PI) / 180) * radius
        }
      }
      if (visited.has(childId)) return
      visited.add(childId)
      queue.push(childId)
    })
  }
}

function persistSessionPositions(nodeIds: string[]) {
  const targetIds = new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (!targetIds.size) return

  const nextPositions = { ...nodeSessionPositions.value }
  let changed = false

  sceneNodes.value.forEach((node) => {
    if (!targetIds.has(node.id)) return
    const previous = nextPositions[node.id]
    if (previous && Math.abs(previous.x - node.x) < 0.001 && Math.abs(previous.y - node.y) < 0.001) return
    nextPositions[node.id] = {
      x: node.x,
      y: node.y
    }
    node.layoutX = node.x
    node.layoutY = node.y
    changed = true
  })

  if (!changed) return
  nodeSessionPositions.value = nextPositions
  sceneNodes.value = [...sceneNodes.value]
}

function moveLocalNodesFromStart(
  dragStartPositions: Record<string, { x: number; y: number }> | undefined,
  totalDeltaX: number,
  totalDeltaY: number
) {
  if (!dragStartPositions) return
  let changed = false
  sceneNodes.value.forEach((node) => {
    const start = dragStartPositions[node.id]
    if (!start) return
    node.x = start.x + totalDeltaX
    node.y = start.y + totalDeltaY
    node.layoutX = node.x
    node.layoutY = node.y
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    changed = true
  })
  if (!changed) return
  sceneNodes.value = [...sceneNodes.value]
}

function moveRigidFollowersFromStart(
  state: CharacterBrainNodeDragState,
  totalDeltaX: number,
  totalDeltaY: number
) {
  const followerIds = new Set(state.rigidFollowerIds || [])
  const dragStartPositions = state.dragStartPositions
  if (!followerIds.size || !dragStartPositions) return
  let changed = false
  sceneNodes.value.forEach((node) => {
    if (!followerIds.has(node.id)) return
    const start = dragStartPositions[node.id]
    if (!start) return
    node.x = start.x + totalDeltaX
    node.y = start.y + totalDeltaY
    node.layoutX = node.x
    node.layoutY = node.y
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    changed = true
  })
  if (changed) sceneNodes.value = [...sceneNodes.value]
}

function finalizeRigidFollowerPositions(state: CharacterBrainNodeDragState) {
  const followerIds = new Set(state.rigidFollowerIds || [])
  const dragStartPositions = state.dragStartPositions
  if (!followerIds.size || !dragStartPositions) return
  const totalDeltaX = state.dragTargetX - state.originX
  const totalDeltaY = state.dragTargetY - state.originY
  const nextPositions = { ...nodeSessionPositions.value }
  let changed = false
  followerIds.forEach((nodeId) => {
    const start = dragStartPositions[nodeId]
    if (!start) return
    nextPositions[nodeId] = {
      x: start.x + totalDeltaX,
      y: start.y + totalDeltaY
    }
    changed = true
  })
  if (changed) nodeSessionPositions.value = nextPositions
}

function finalizeLocalNodePositions(state: CharacterBrainNodeDragState) {
  const finalizedIds = new Set(resolveMovedNodeIdsFromInteraction(state))
  if (!finalizedIds.size) return

  let changed = false
  const nextPositions = { ...nodeSessionPositions.value }
  const dragStartPositions = state.dragStartPositions || {}
  const totalDeltaX = state.dragTargetX - state.originX
  const totalDeltaY = state.dragTargetY - state.originY

  finalizedIds.forEach((nodeId) => {
    const previous = nextPositions[nodeId]
    const start = dragStartPositions[nodeId]
      || readCurrentScenePosition(nodeId)
      || previous
    if (!start) return
    const nextX = start.x + totalDeltaX
    const nextY = start.y + totalDeltaY
    if (previous && Math.abs(previous.x - nextX) < 0.001 && Math.abs(previous.y - nextY) < 0.001) return
    nextPositions[nodeId] = {
      x: nextX,
      y: nextY
    }
    changed = true
  })

  if (!changed) return
  nodeSessionPositions.value = nextPositions
}

function finalizeSubtreeNodePositions(state: CharacterBrainNodeDragState) {
  const dragStartPositions = state.dragStartPositions || {}
  const totalDeltaX = state.dragTargetX - state.originX
  const totalDeltaY = state.dragTargetY - state.originY
  const movedIds = new Set(resolveMovedNodeIdsFromInteraction(state))
  if (!movedIds.size) return

  const nextPositions = { ...nodeSessionPositions.value }
  let changed = false
  movedIds.forEach((nodeId) => {
    const start = dragStartPositions[nodeId]
    if (!start) return
    nextPositions[nodeId] = {
      x: start.x + totalDeltaX,
      y: start.y + totalDeltaY
    }
    changed = true
  })
  if (!changed) return
  nodeSessionPositions.value = nextPositions
}

function collectCurrentRootPositionsFromDragStart(
  targetIds: Set<string>,
  dragStartPositions?: Record<string, { x: number; y: number }>
) {
  if (!dragStartPositions) return {}
  const parentMap = buildCompleteParentMap()
  const leafTargetIds = new Set(collectLeafTargetNodeIds([...targetIds]))
  const rootPositions: Record<string, NodeWorldPosition> = {}
  leafTargetIds.forEach((nodeId) => {
    let currentParentId = parentMap.get(nodeId) || ''
    while (currentParentId) {
      if (leafTargetIds.has(currentParentId)) return
      currentParentId = parentMap.get(currentParentId) || ''
    }
    const start = dragStartPositions[nodeId]
    if (!start) return
    rootPositions[nodeId] = { x: start.x, y: start.y }
  })
  return rootPositions
}

function moveVisibleNetwork(deltaX: number, deltaY: number) {
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return
  sceneNodes.value.forEach((node) => {
    node.x += deltaX
    node.y += deltaY
    node.layoutX += deltaX
    node.layoutY += deltaY
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
  })
  sceneNodes.value = [...sceneNodes.value]
}

function commitVisibleNetworkPan(deltaX: number, deltaY: number) {
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return
  sceneNodes.value.forEach((node) => {
    node.layoutX += deltaX
    node.layoutY += deltaY
  })
  sceneNodes.value = [...sceneNodes.value]
}

function moveNodeSubtree(nodeId: string, deltaX: number, deltaY: number) {
  const ids = collectSceneSubtreeIds(nodeId)
  moveLocalNodes(ids, deltaX, deltaY)
}

function moveSelectedNodes(deltaX: number, deltaY: number) {
  moveLocalNodes(collectSelectedMoveNodeIds(), deltaX, deltaY)
}

function collectSelectedMoveNodeIds() {
  const visibleIds = new Set(sceneNodes.value.map((node) => node.id))
  const moveIds = new Set<string>()
  selectedNodeIds.value.forEach((nodeId) => {
    if (!visibleIds.has(nodeId)) return
    const node = sceneNodes.value.find((item) => item.id === nodeId)
    if (node?.layoutMode === 'folder') {
      collectSceneSubtreeIds(nodeId).forEach((id) => moveIds.add(id))
      return
    }
    moveIds.add(nodeId)
  })
  return Array.from(moveIds)
}

function moveSceneNodesTransient(nodeIds: string[], deltaX: number, deltaY: number) {
  const movingIds = new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (!movingIds.size) return
  let changed = false
  sceneNodes.value.forEach((node) => {
    if (!movingIds.has(node.id)) return
    node.x += deltaX
    node.y += deltaY
    node.layoutX += deltaX
    node.layoutY += deltaY
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    changed = true
  })
  if (changed) sceneNodes.value = [...sceneNodes.value]
}

function settleCurrentNodePositions() {
  const renderedIds = new Set(displayedSceneNodes.value.map((node) => node.id))
  const requestedIds = hasNodeSelection.value
    ? selectedNodeIds.value.filter((nodeId) => renderedIds.has(nodeId))
    : [...renderedIds]
  if (!requestedIds.length) return

  freezeSceneMotion()
  const settlementNodes = displayedSceneNodes.value.map((node) => ({ ...node }))
  const parentChildDistance = resolveRadialLayoutDistance(settlementNodes)
  const settledIds = settleCharacterBrainRadialClusters(
    settlementNodes,
    requestedIds,
    nodeRadius,
    {
      parentChildDistance,
      clusterGap: parentChildDistance * 1.05
    }
  )
  if (!settledIds.length) {
    toast(t('brain.workspace.toast.layoutAlreadySettled'), 'info')
    return
  }

  pushBrainHistorySnapshot()
  const settledNodeById = new Map(settlementNodes.map((node) => [node.id, node] as const))
  sceneNodes.value.forEach((node) => {
    const settled = settledNodeById.get(node.id)
    if (!settledIds.includes(node.id) || !settled) return
    node.x = settled.x
    node.y = settled.y
    node.layoutX = settled.layoutX
    node.layoutY = settled.layoutY
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
  })
  sceneNodes.value = [...sceneNodes.value]
  persistSessionPositions(settledIds)
  toast(
    hasNodeSelection.value
      ? t('brain.workspace.toast.selectedLayoutSettled', { count: settledIds.length })
      : t('brain.workspace.toast.layoutSettled', { count: settledIds.length }),
    'success'
  )
}

function resolveRadialLayoutDistance(nodes: CharacterBrainSimNode[]) {
  const longestLabelLength = nodes.reduce((maxLength, node) => (
    Math.max(maxLength, String(node.title || '').trim().length)
  ), 0)
  return resolveCharacterBrainRadialDistance(longestLabelLength, nodeLabelBaseSize.value)
}

async function resetNodePositions(nodeIds: string[]) {
  const resetIds = new Set<string>(collectPositionOperationNodeIds(nodeIds))
  const previousRootPositions = collectCurrentRootPositions([...resetIds])
  const nextSessionPositions = { ...nodeSessionPositions.value }
  let resetCount = 0
  resetIds.forEach((nodeId) => {
    const hadSessionPosition = Boolean(nextSessionPositions[nodeId])
    const hasFixedPosition = Boolean(nodeWorldPositions.value[nodeId])
    if (!hadSessionPosition && !hasFixedPosition) return
    if (hadSessionPosition) {
      delete nextSessionPositions[nodeId]
    }
    // 只有临时位置、没有固定位置的节点，删除临时位置后会直接回到自动排布。
    resetCount += 1
  })
  if (!resetCount) return 0
  pushBrainHistorySnapshot()
  nodeSessionPositions.value = nextSessionPositions
  skipSceneLayoutPreserveOnce.value = true
  rehydrateScene()
  preserveUnrenderedExplicitDescendantPositions(previousRootPositions)
  return resetCount
}

async function rearrangeDirectChildNodePositions(nodeIds: string[]) {
  const rearrangeIds = new Set<string>(collectRearrangeTargetNodeIds(nodeIds))
  if (!rearrangeIds.size) return 0
  const nextPositions = omitBrainRootPosition(nodeWorldPositions.value)
  const nextSessionPositions = { ...nodeSessionPositions.value }
  const previousRootPositions = collectCurrentRootPositions([...rearrangeIds])
  const previousSubtreePositions = collectRenderedSubtreePositionsByRoot([...rearrangeIds])

  rearrangeIds.forEach((nodeId) => {
    if (nextPositions[nodeId]) delete nextPositions[nodeId]
    if (nextSessionPositions[nodeId]) delete nextSessionPositions[nodeId]
  })

  pushBrainHistorySnapshot()
  nodeWorldPositions.value = nextPositions
  nodeSessionPositions.value = nextSessionPositions
  skipSceneLayoutPreserveOnce.value = true
  rehydrateScene()
  preserveRenderedChildSubtreesAfterRearrange(previousSubtreePositions)
  preserveUnrenderedExplicitDescendantPositions(previousRootPositions)
  return rearrangeIds.size
}

function collectRenderedSubtreePositionsByRoot(rootIds: string[]) {
  const result: Record<string, Record<string, NodeWorldPosition>> = {}
  collectLeafTargetNodeIds(rootIds).forEach((rootId) => {
    const normalizedRootId = String(rootId || '').trim()
    if (!normalizedRootId) return
    const ids = collectSceneSubtreeIds(normalizedRootId)
    const positions: Record<string, NodeWorldPosition> = {}
    ids.forEach((nodeId) => {
      const position = readCurrentScenePosition(nodeId)
      if (position) positions[nodeId] = position
    })
    if (Object.keys(positions).length) result[normalizedRootId] = positions
  })
  return result
}

function preserveRenderedChildSubtreesAfterRearrange(
  previousSubtreePositions: Record<string, Record<string, NodeWorldPosition>>
) {
  const nextSessionPositions = { ...nodeSessionPositions.value }
  let changed = false
  Object.entries(previousSubtreePositions).forEach(([rootId, positions]) => {
    const previousRootPosition = readPositionFromSceneOrMap(rootId, positions)
    const nextRootPosition = readCurrentScenePosition(rootId)
    if (!previousRootPosition || !nextRootPosition) return
    const deltaX = nextRootPosition.x - previousRootPosition.x
    const deltaY = nextRootPosition.y - previousRootPosition.y
    Object.entries(positions).forEach(([nodeId, previousPosition]) => {
      if (nodeId === rootId) return
      nextSessionPositions[nodeId] = {
        x: previousPosition.x + deltaX,
        y: previousPosition.y + deltaY
      }
      changed = true
    })
  })
  if (!changed) return
  nodeSessionPositions.value = nextSessionPositions
  skipSceneLayoutPreserveOnce.value = true
  rehydrateScene()
}

function collectCurrentRootPositions(nodeIds: string[]) {
  const parentMap = buildCompleteParentMap()
  const targetIds = new Set(collectLeafTargetNodeIds(nodeIds))
  const rootPositions: Record<string, NodeWorldPosition> = {}
  targetIds.forEach((nodeId) => {
    let currentParentId = parentMap.get(nodeId) || ''
    while (currentParentId) {
      if (targetIds.has(currentParentId)) return
      currentParentId = parentMap.get(currentParentId) || ''
    }
    const position = readCurrentScenePosition(nodeId)
    if (!position) return
    rootPositions[nodeId] = { x: position.x, y: position.y }
  })
  return rootPositions
}

function preserveUnrenderedExplicitDescendantPositions(
  previousRootPositions: Record<string, NodeWorldPosition>
) {
  const rootIds = Object.keys(previousRootPositions)
  if (!rootIds.length) return

  const nextSessionPositions = { ...nodeSessionPositions.value }
  const nextWorldPositions = omitBrainRootPosition(nodeWorldPositions.value)
  let changed = false

  rootIds.forEach((rootId) => {
    const previousRootPosition = previousRootPositions[rootId]
    const nextRootPosition = readCurrentScenePosition(rootId)
    if (!previousRootPosition || !nextRootPosition) return
    const deltaX = nextRootPosition.x - previousRootPosition.x
    const deltaY = nextRootPosition.y - previousRootPosition.y
    if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return

    const renderedIds = new Set(collectSceneSubtreeIds(rootId))
    collectCompleteSubtreeIds(rootId).forEach((nodeId) => {
      if (nodeId === rootId || renderedIds.has(nodeId)) return
      const sessionPosition = nextSessionPositions[nodeId]
      if (sessionPosition) {
        nextSessionPositions[nodeId] = {
          x: sessionPosition.x + deltaX,
          y: sessionPosition.y + deltaY
        }
        changed = true
        return
      }
      const worldPosition = nextWorldPositions[nodeId]
      if (!worldPosition) return
      nextWorldPositions[nodeId] = {
        ...worldPosition,
        x: worldPosition.x + deltaX,
        y: worldPosition.y + deltaY
      }
      changed = true
    })
  })

  if (!changed) return
  nodeSessionPositions.value = nextSessionPositions
  nodeWorldPositions.value = nextWorldPositions
}

function readPositionFromSceneOrMap(nodeId: string, positions: Record<string, NodeWorldPosition>) {
  return positions[nodeId] || readCurrentScenePosition(nodeId) || null
}

async function pinSubtreePositions(nodeIds: string[]) {
  const targetIds = new Set<string>(collectFixablePositionOperationNodeIds(nodeIds))
  if (!targetIds.size) return 0
  const nextPositions = omitBrainRootPosition(nodeWorldPositions.value)
  const nextSessionPositions = { ...nodeSessionPositions.value }
  let changedCount = 0

  targetIds.forEach((nodeId) => {
    const currentPosition = readCurrentScenePosition(nodeId)
    if (!currentPosition) return
    const previousPosition = nextPositions[nodeId]
    if (
      !previousPosition
      || previousPosition.locked !== true
      || previousPosition.x !== currentPosition.x
      || previousPosition.y !== currentPosition.y
    ) {
      changedCount += 1
    }
    nextPositions[nodeId] = {
      ...currentPosition,
      locked: true
    }
    delete nextSessionPositions[nodeId]
  })

  if (!changedCount) return 0
  pushBrainHistorySnapshot()
  nodeWorldPositions.value = nextPositions
  nodeSessionPositions.value = nextSessionPositions
  skipSceneLayoutPreserveOnce.value = true
  rehydrateScene()
  return changedCount
}

async function unpinSubtreePositions(nodeIds: string[]) {
  const targetIds = new Set<string>(collectFixablePositionOperationNodeIds(nodeIds))
  if (!targetIds.size) return 0
  const nextPositions = omitBrainRootPosition(nodeWorldPositions.value)
  const nextSessionPositions = { ...nodeSessionPositions.value }
  let clearedCount = 0

  targetIds.forEach((nodeId) => {
    const position = nextPositions[nodeId]
    if (!position) return
    const currentPosition = readCurrentScenePosition(nodeId) || position
    nextSessionPositions[nodeId] = { ...currentPosition }
    delete nextPositions[nodeId]
    clearedCount += 1
  })

  if (!clearedCount) return 0
  pushBrainHistorySnapshot()
  nodeWorldPositions.value = nextPositions
  nodeSessionPositions.value = nextSessionPositions
  skipSceneLayoutPreserveOnce.value = true
  rehydrateScene()
  return clearedCount
}

function removeTrajectoryMetaOffsetsByNodeIds(
  meta: ReturnType<typeof readCharacterBrainTrajectoryMeta>,
  deleteIds: Set<string>
) {
  const nextViewOffsets = { ...(meta.viewOffsets || {}) }
  deleteIds.forEach((nodeId) => {
    if (nextViewOffsets[nodeId]) delete nextViewOffsets[nodeId]
  })
  return {
    ...meta,
    viewOffsets: nextViewOffsets
  }
}

function collectSceneSubtreeIds(nodeId: string) {
  const rootId = String(nodeId || '').trim()
  if (!rootId) return []
  const childrenByParent = sceneChildrenByParent.value
  const ids: string[] = []
  const queue = [rootId]
  const visited = new Set<string>()
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    if (visited.has(current)) continue
    visited.add(current)
    ids.push(current)
    queue.push(...(childrenByParent.get(current) || []))
  }
  return ids
}

function collectCompleteSubtreeIds(nodeId: string) {
  const rootId = String(nodeId || '').trim()
  if (!rootId) return []
  const parentMap = buildCompleteParentMap()
  const childrenByParent = buildCompleteChildrenMap(parentMap)
  const ids: string[] = []
  const queue = [rootId]
  const visited = new Set<string>()
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    if (visited.has(current) || completeTreeIndex.value.trashed.has(current)) continue
    visited.add(current)
    ids.push(current)
    queue.push(...(childrenByParent.get(current) || []))
  }
  return ids
}

function buildCompleteParentMap() {
  return completeTreeIndex.value.parentMap
}

function buildCompleteChildrenMap(parentMap: Map<string, string>) {
  if (parentMap === completeTreeIndex.value.parentMap) return completeTreeIndex.value.childrenByParent
  const childrenByParent = new Map<string, string[]>()
  parentMap.forEach((parentId, nodeId) => {
    if (!parentId || completeTreeIndex.value.trashed.has(nodeId)) return
    const children = childrenByParent.get(parentId) || []
    children.push(nodeId)
    childrenByParent.set(parentId, children)
  })
  childrenByParent.forEach((children) => {
    children.sort((a, b) => a.localeCompare(b))
  })
  return childrenByParent
}

function getSubtreeDepth(nodeId: string, parentMap: Map<string, string>) {
  let depth = 0
  let current = parentMap.get(nodeId) || ''
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    depth += 1
    current = parentMap.get(current) || ''
  }
  return depth
}

function applyNodeWorldPositions() {
  const explicitPositions = { ...omitBrainRootPosition(nodeWorldPositions.value), ...nodeSessionPositions.value }
  const baseNodeMap = new Map(sceneNodes.value.map((node) => [node.id, { x: node.x, y: node.y }]))
  sceneNodes.value.forEach((node) => {
    const position = explicitPositions[node.id]
    if (!position) return
    node.x = position.x
    node.y = position.y
    node.layoutX = position.x
    node.layoutY = position.y
  })
  sceneNodes.value.forEach((node) => {
    if (explicitPositions[node.id]) return
    const ancestorId = findNearestPositionedAncestorId(node.id, explicitPositions)
    if (!ancestorId) return
    const baseAncestor = baseNodeMap.get(ancestorId)
    const positionedAncestor = sceneNodes.value.find((item) => item.id === ancestorId)
    if (!baseAncestor || !positionedAncestor) return
    const deltaX = positionedAncestor.x - baseAncestor.x
    const deltaY = positionedAncestor.y - baseAncestor.y
    if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return
    node.x += deltaX
    node.y += deltaY
    node.layoutX += deltaX
    node.layoutY += deltaY
  })
  sceneNodes.value = [...sceneNodes.value]
}

function enforceBrainRootWorldOrigin() {
  if (nodeSessionPositions.value[getCharacterBrainRootId()]) return
  let changed = false
  sceneNodes.value.forEach((node) => {
    if (!isBrainRootNodeId(node.id)) return
    if (
      Math.abs(node.x) < 0.001
      && Math.abs(node.y) < 0.001
      && Math.abs(node.layoutX) < 0.001
      && Math.abs(node.layoutY) < 0.001
    ) {
      return
    }
    node.x = 0
    node.y = 0
    node.layoutX = 0
    node.layoutY = 0
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
    changed = true
  })
  if (changed) sceneNodes.value = [...sceneNodes.value]
}

function findNearestPositionedAncestorId(
  nodeId: string,
  explicitPositions: Record<string, NodeWorldPosition>
) {
  const parentMap = buildCompleteParentMap()
  let currentId = parentMap.get(nodeId) || ''
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    if (explicitPositions[currentId]) return currentId
    currentId = parentMap.get(currentId) || ''
  }
  return ''
}

function freezeSceneMotion() {
  stopPhysics()
  sceneNodes.value.forEach((node) => {
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
  })
  sceneNodes.value = [...sceneNodes.value]
}

function normalizeTrajectoryDateText(input: string) {
  const value = String(input || '').trim()
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  return value
}

function parseTrajectoryBirthDate(input: string) {
  const normalized = normalizeTrajectoryDateText(input)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  if (formatTrajectoryDate(date) !== normalized) return null
  return date
}

function formatTrajectoryDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function loadNodeWorldPositions() {
  if (hasProjectionUnits.value || isReadOnlyMode.value) {
    nodeWorldPositions.value = {}
    return
  }
  nodeWorldPositions.value = omitBrainRootPosition(readCharacterBrainNodePositions(currentCharacter.value))
}

function migrateLegacyOffsetsToWorldPositions() {
  if (hasProjectionUnits.value || isReadOnlyMode.value) return
  const character = currentCharacter.value
  if (!character) return
  if (Object.keys(nodeWorldPositions.value).length) return
  const legacyOffsets = readCharacterBrainPinnedOffsets(character)
  if (!Object.keys(legacyOffsets).length) return

  const nextPositions: Record<string, NodeWorldPosition> = {}
  sceneNodes.value.forEach((node) => {
    if (isBrainRootNodeId(node.id)) return
    const offset = legacyOffsets[node.id]
    if (!offset) return
    nextPositions[node.id] = {
      x: node.x + offset.x,
      y: node.y + offset.y,
      locked: true
    }
  })
  if (!Object.keys(nextPositions).length) return
  nodeWorldPositions.value = nextPositions
  scheduleNodePositionPersistence()
}

function scheduleNodePositionPersistence() {
  if (typeof window === 'undefined') return
  if (nodePositionPersistTimer) window.clearTimeout(nodePositionPersistTimer)
  nodePositionPersistTimer = window.setTimeout(() => {
    nodePositionPersistTimer = null
    persistNodePositionsToCharacter().catch((error) => {
      console.error('持久化节点世界坐标失败:', error)
    })
  }, TRACE_SYNC_DEBOUNCE_MS)
}

async function persistNodePositionsToCharacter() {
  if (hasProjectionUnits.value || isReadOnlyMode.value) return
  const character = currentCharacter.value
  if (!character) return
  const previousPositions = readCharacterBrainNodePositions(character)
  const nextPositions = normalizeNodePositionMap(omitBrainRootPosition(nodeWorldPositions.value))
  const previousMeta = readCharacterBrainTrajectoryMeta(character)
  if (
    JSON.stringify(previousPositions) === JSON.stringify(nextPositions)
    && !Object.keys(readCharacterBrainPinnedOffsets(character)).length
    && !Object.keys(previousMeta.viewOffsets || {}).length
  ) {
    return
  }
  const nextChange = {
    ...(buildCharacterBrainNodePositionsChange(nextPositions) as any),
    ...(buildCharacterBrainTrajectoryMetaChange({
      ...previousMeta,
      viewOffsets: {}
    }) as any)
  }
  Object.assign(character, nextChange)
  await characterStore.updateCharacter(character.id, nextChange)
}

function handleWheel(event: WheelEvent) {
  closeNodeContextMenu()
  trashMenuOpen.value = false
  const point = readViewportPointerPosition(event)
  if (!point) return
  const viewportBase = readViewportZoomBase()
  const currentScale = viewportBase.scale
  const normalizedDelta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1)
  const zoomDelta = softenWheelZoomDelta(normalizedDelta)
  const zoomFactor = clamp(Math.exp(-zoomDelta * WHEEL_ZOOM_STRENGTH), WHEEL_ZOOM_MIN_FACTOR, WHEEL_ZOOM_MAX_FACTOR)
  const nextScale = clamp(currentScale * zoomFactor, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE)
  if (Math.abs(nextScale - currentScale) < 0.000001) return
  const sceneX = (point.x - viewportBase.offset.x) / currentScale
  const sceneY = (point.y - viewportBase.offset.y) / currentScale
  animateViewportTo(nextScale, {
    x: point.x - (sceneX * nextScale),
    y: point.y - (sceneY * nextScale)
  }, WHEEL_ZOOM_ANIMATION_MS)
}

function readViewportZoomBase() {
  if (viewportZoomAnimation) {
    return {
      scale: viewportZoomAnimation.toScale,
      offset: { ...viewportZoomAnimation.toOffset }
    }
  }
  return {
    scale: viewportScale.value,
    offset: { ...viewportOffset.value }
  }
}

function animateViewportTo(nextScale: number, nextOffset: { x: number; y: number }, duration = WHEEL_ZOOM_ANIMATION_MS) {
  if (typeof window === 'undefined') {
    viewportScale.value = nextScale
    viewportOffset.value = nextOffset
    return
  }
  if (viewportZoomAnimationFrame !== null) {
    window.cancelAnimationFrame(viewportZoomAnimationFrame)
    viewportZoomAnimationFrame = null
  }
  viewportZoomAnimation = {
    startedAt: window.performance.now(),
    duration,
    fromScale: viewportScale.value,
    toScale: nextScale,
    fromOffset: { ...viewportOffset.value },
    toOffset: { ...nextOffset }
  }
  viewportZoomAnimationFrame = window.requestAnimationFrame(stepViewportZoomAnimation)
}

function softenWheelZoomDelta(delta: number) {
  const sign = Math.sign(delta)
  const magnitude = Math.abs(delta)
  return sign * ((magnitude * magnitude) / (magnitude + WHEEL_ZOOM_DELTA_SOFTENING))
}

function stepViewportZoomAnimation(now: number) {
  const animation = viewportZoomAnimation
  if (!animation) return
  const progress = clamp((now - animation.startedAt) / animation.duration, 0, 1)
  const eased = easeSmootherStep(progress)
  viewportScale.value = interpolateNumber(animation.fromScale, animation.toScale, eased)
  viewportOffset.value = {
    x: interpolateNumber(animation.fromOffset.x, animation.toOffset.x, eased),
    y: interpolateNumber(animation.fromOffset.y, animation.toOffset.y, eased)
  }
  if (progress < 1 && typeof window !== 'undefined') {
    viewportZoomAnimationFrame = window.requestAnimationFrame(stepViewportZoomAnimation)
    return
  }
  viewportZoomAnimationFrame = null
  viewportZoomAnimation = null
}

function easeSmootherStep(progress: number) {
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10)
}

function interpolateNumber(from: number, to: number, progress: number) {
  return from + ((to - from) * progress)
}

function handleCanvasContextMenu() {
  closeNodeContextMenu()
  trashMenuOpen.value = false
}

function readViewportPointerPosition(event: MouseEvent | PointerEvent | WheelEvent) {
  const svg = svgRef.value
  if (!svg) return null
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const transform = svg.getScreenCTM()
  if (!transform) return null
  const result = point.matrixTransform(transform.inverse())
  return { x: result.x, y: result.y }
}

function readScenePointerPosition(event: MouseEvent | PointerEvent | WheelEvent) {
  const point = readViewportPointerPosition(event)
  if (!point) return null
  return {
    x: (point.x - viewportOffset.value.x) / viewportScale.value,
    y: (point.y - viewportOffset.value.y) / viewportScale.value
  }
}

function nodeRadius(size: number) {
  if (size >= 3) return 15
  if (size === 2) return 13
  return 9
}

function nodeHitRadius(size: number) {
  return nodeRadius(size) + 10
}

function nodeLabelOffset(size: number) {
  return nodeRadius(size) + 18
}

function resolveCardWidth() {
  if (typeof window !== 'undefined' && window.innerWidth <= 1024) return 390
  return 450
}

function getCanvasBounds() {
  const rect = canvasShellRef.value?.getBoundingClientRect()
  return {
    width: Math.max(rect?.width || VIEWBOX_WIDTH, 1),
    height: Math.max(rect?.height || VIEWBOX_HEIGHT, 1)
  }
}

function resolveMiniChatWidth(bounds: { width: number; height: number }) {
  return Math.min(MINI_CHAT_DEFAULT_WIDTH, Math.max(bounds.width - 36, MINI_CHAT_MIN_WIDTH))
}

function resolveMiniChatHeight(bounds: { width: number; height: number }) {
  return Math.min(620, Math.max(bounds.height - 74, MINI_CHAT_MIN_HEIGHT))
}

function resolveDefaultMiniChatPlacement(bounds: { width: number; height: number }, width: number, height: number) {
  return {
    left: Math.max((bounds.width - width) / 2, 8),
    top: Math.max((bounds.height - height) / 2, 8)
  }
}

function clampMiniChatPlacement(
  placement: MiniChatPlacement,
  bounds: { width: number; height: number },
  width: number,
  height: number
) {
  return {
    left: clamp(placement.left, 8, Math.max(bounds.width - width - 8, 8)),
    top: clamp(placement.top, 8, Math.max(bounds.height - height - 8, 8))
  }
}

function resolveResizedBox(input: {
  corner: ResizeCorner
  startX: number
  startY: number
  pointerX: number
  pointerY: number
  startLeft: number
  startTop: number
  startWidth: number
  startHeight: number
  bounds: { width: number; height: number }
  minWidth: number
  minHeight: number
}) {
  const deltaX = input.pointerX - input.startX
  const deltaY = input.pointerY - input.startY
  const fromLeft = input.corner.includes('left')
  const fromTop = input.corner.includes('top')
  const maxWidth = Math.max(input.bounds.width - 16, input.minWidth)
  const maxHeight = Math.max(input.bounds.height - 16, input.minHeight)
  const width = clamp(fromLeft ? input.startWidth - deltaX : input.startWidth + deltaX, input.minWidth, maxWidth)
  const height = clamp(fromTop ? input.startHeight - deltaY : input.startHeight + deltaY, input.minHeight, maxHeight)
  const left = fromLeft ? input.startLeft + (input.startWidth - width) : input.startLeft
  const top = fromTop ? input.startTop + (input.startHeight - height) : input.startTop
  return {
    ...clampMiniChatPlacement({ left, top }, input.bounds, width, height),
    width,
    height
  }
}

function resolveAttachedCardPosition(node: CharacterBrainSimNode) {
  const bounds = getCanvasBounds()
  return resolveBrainAttachedCardPosition({
    node,
    bounds,
    viewBox: { width: VIEWBOX_WIDTH, height: VIEWBOX_HEIGHT },
    viewport: {
      offsetX: viewportOffset.value.x,
      offsetY: viewportOffset.value.y,
      scale: viewportScale.value
    },
    cardWidth: resolveCardWidth(),
    cardHeight: resolveCardHeight(bounds),
    edgeGap: CARD_EDGE_GAP,
    attachGap: CARD_ATTACH_GAP,
    nodeRadius
  })
}

function resolveFallbackCardPlacement(cardId: string) {
  const card = openCards.value.find((item) => item.id === cardId)
  const node = card ? sceneNodeMap.value.get(resolveCardAnchorNodeId(card.nodeId)) : null
  if (node) return resolveAttachedCardPosition(node)
  const bounds = getCanvasBounds()
  return {
    left: Math.max(bounds.width - resolveCardWidth() - 56, CARD_EDGE_GAP),
    top: CARD_EDGE_GAP
  }
}

function resolveCardCurrentSize(cardId: string) {
  const bounds = getCanvasBounds()
  const placement = cardPlacements.value[cardId]
  const cardEl = findInlineCardElement(cardId)
  return {
    width: placement?.width || cardEl?.offsetWidth || resolveCardWidth(),
    height: placement?.height || cardEl?.offsetHeight || resolveCardHeight(bounds)
  }
}

function resolveCardHeight(bounds = getCanvasBounds()) {
  return clamp(CARD_ESTIMATED_HEIGHT, CARD_MIN_HEIGHT, Math.max(bounds.height - (CARD_EDGE_GAP * 2), CARD_MIN_HEIGHT))
}

function resolveCardAnchorNodeId(nodeId: string) {
  const normalizedNodeId = String(nodeId || '').trim()
  const separator = '::inner::'
  if (!normalizedNodeId.includes(separator)) return normalizedNodeId
  return normalizedNodeId.split(separator)[0] || normalizedNodeId
}

function resolveCurrentCardPlacement(cardId: string) {
  const card = openCards.value.find((item) => item.id === cardId)
  if (!card) return null
  const bounds = getCanvasBounds()
  const defaultWidth = resolveCardWidth()
  const defaultHeight = resolveCardHeight(bounds)
  const placement = cardPlacements.value[cardId]
  if (placement?.mode === 'detached') {
    return {
      left: placement.left,
      top: placement.top,
      width: placement.width || defaultWidth,
      height: placement.height || defaultHeight
    }
  }
  if (placement?.mode === 'minimized') return null
  const node = sceneNodeMap.value.get(resolveCardAnchorNodeId(card.nodeId))
  if (!node) return null
  const attached = resolveAttachedCardPosition(node)
  return {
    left: attached.left,
    top: attached.top,
    width: defaultWidth,
    height: defaultHeight
  }
}

function findInlineCardElement(cardId: string) {
  const shell = canvasShellRef.value
  if (!shell) return null
  const cards = Array.from(shell.querySelectorAll<HTMLElement>('.brain-workspace__inline-card'))
  return cards.find((item) => item.dataset.cardId === cardId) || null
}

function nodeLabelPlacement(node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  const dx = node.x - sceneCenter.value.x
  const dy = node.y - sceneCenter.value.y
  const radius = nodeRadius(nodeRenderSize(node))
  const gap = radius + 12

  if (Math.abs(dx) >= Math.abs(dy) * 1.15) {
    return {
      x: dx >= 0 ? gap : -gap,
      y: 2,
      textAnchor: dx >= 0 ? 'start' : 'end',
      dominantBaseline: 'middle'
    }
  }

  return {
    x: 0,
    y: dy >= 0 ? gap : -gap,
    textAnchor: 'middle',
    dominantBaseline: dy >= 0 ? 'hanging' : 'auto'
  }
}

function nodeSecondaryLabel(node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  if (!isTraceNodeId(node.id)) return ''
  const subtitle = String(node.subtitle || '').trim()
  const title = String(node.title || '').trim()
  return subtitle && subtitle !== title ? subtitle : ''
}

function nodeTitleLines(node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  return String(node.title || t('brain.graphPreview.unnamedNode'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function nodeTooltipTitle(node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  const title = String(node.title || '').replace(/\s*\n\s*/g, ' / ').trim() || t('brain.graphPreview.unnamedNode')
  if (nodeWorldPositions.value[node.id]) {
    return `${title}${t('brain.workspace.pinnedPositionSuffix')}`
  }
  if (nodeSessionPositions.value[node.id]) {
    return `${title}${t('brain.workspace.tempPositionSuffix')}`
  }
  return title
}

function nodeSecondaryLabelY(node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  const placement = nodeLabelPlacement(node)
  const extraTitleOffset = Math.max(0, nodeTitleLines(node).length - 1) * 12
  if (placement.textAnchor === 'middle') {
    return placement.y + 16 + extraTitleOffset
  }
  return placement.y + 12 + extraTitleOffset
}

function isDraggingNode(nodeId: string) {
  return interactionState.value?.mode === 'node' && interactionState.value.nodeId === nodeId
}

function nodeRenderSize(_node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  return 2
}

function nodeRenderDensity(node: CharacterBrainSimNode | CharacterBrainNodeModel) {
  if (selectedNodeIdSet.value.has(node.id)) return 5
  return focusProjection.value.metrics.get(node.id)?.density ?? node.density
}

function isPendingNode(nodeId: string) {
  return isPendingCreateNode(nodeId) || isPendingUpdateNode(nodeId)
}

function isPendingCreateNode(nodeId: string) {
  return currentCognitionNodes.value.some((node) => node.id === nodeId && node.pendingReview?.mode === 'create')
    || currentTraceNodes.value.some((node) => node.id === nodeId && (node.confirmed === false || node.pendingReview?.mode === 'create'))
}

function isPendingUpdateNode(nodeId: string) {
  return currentCognitionNodes.value.some((node) => node.id === nodeId && node.pendingReview?.mode === 'update')
    || currentTraceNodes.value.some((node) => node.id === nodeId && node.pendingReview?.mode === 'update')
}

function buildPendingArcPath(size: number) {
  const radius = Math.max(nodeRadius(size) + 4, 12)
  const start = polarToCartesian(radius, -18)
  const end = polarToCartesian(radius, 72)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`
}

function polarToCartesian(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius
  }
}

function buildEdge(
  source: CharacterBrainSimNode,
  target: CharacterBrainSimNode,
  options: Partial<Pick<BrainWorkspaceEdge, 'kind' | 'density'>> = {}
): BrainWorkspaceEdge {
  const kind = options.kind || target.edgeKind || 'tree'
  return {
    id: `${source.id}->${target.id}:${kind}`,
    sourceId: source.id,
    targetId: target.id,
    kind,
    density: options.density || nodeRenderDensity(target),
    path: buildEdgePath(source, target, kind)
  }
}

function buildProjectionRelationEdge(
  source: CharacterBrainSimNode,
  target: CharacterBrainSimNode,
  id: string,
  kind: BrainWorkspaceEdge['kind'] = 'link'
): BrainWorkspaceEdge {
  return {
    ...buildEdge(source, target, { kind, density: Math.min(source.density, target.density) as CharacterBrainNodeDensity }),
    id: String(id || `${source.id}->${target.id}:relation`)
  }
}

function edgePairKey(sourceId: string, targetId: string) {
  return [String(sourceId || '').trim(), String(targetId || '').trim()].sort().join('::')
}

function buildEdgePath(source: CharacterBrainSimNode, target: CharacterBrainSimNode, kind: BrainWorkspaceEdge['kind']) {
  if (kind !== 'tree' || target.layoutMode !== 'folder') {
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  }
  const direction = target.x >= source.x ? 1 : -1
  const trunkGap = percentXToScene(FOLDER_TRUNK_X_GAP)
  const trunkX = source.x + (direction * Math.min(trunkGap, Math.abs(target.x - source.x)))
  return `M ${source.x} ${source.y} L ${trunkX} ${source.y} L ${trunkX} ${target.y} L ${target.x} ${target.y}`
}

function setHoveredNode(nodeId: string) {
  hoveredNodeId.value = nodeId
}

function clearHoveredNode(nodeId: string) {
  if (hoveredNodeId.value === nodeId) {
    hoveredNodeId.value = ''
  }
}

function nodeFocusClass(nodeId: string) {
  if (hasNodeSelection.value) {
    return selectedNodeIdSet.value.has(nodeId)
      ? 'brain-node--selection-active'
      : 'brain-node--selection-muted'
  }
  const activeNodeId = focusProjection.value.activeNodeId
  if (!activeNodeId) return ''
  if (nodeId === activeNodeId) return 'brain-node--focus-active'
  if (visualFocusRelatedNodeIds.value.has(nodeId)) return 'brain-node--focus-related'
  return 'brain-node--focus-muted'
}

function edgeFocusClass(edge: BrainWorkspaceEdge) {
  if (hasNodeSelection.value) {
    if (edge.kind === 'link') return 'brain-workspace__edge--selection-hidden'
    return selectedNodeIdSet.value.has(edge.sourceId) && selectedNodeIdSet.value.has(edge.targetId)
      ? 'brain-workspace__edge--selection-active'
      : 'brain-workspace__edge--selection-muted'
  }
  const activeNodeId = focusProjection.value.activeNodeId
  if (!activeNodeId) return ''
  if (edge.sourceId === activeNodeId || edge.targetId === activeNodeId) {
    return 'brain-workspace__edge--focus-active'
  }
  return 'brain-workspace__edge--focus-muted'
}

function resolveFocusRenderMetric(distance?: number): { size: CharacterBrainNodeSize; density: CharacterBrainNodeDensity } {
  if (distance === undefined) {
    return {
      size: 1,
      density: 1
    }
  }
  if (distance === 0) {
    return {
      size: 3,
      density: 5
    }
  }
  if (distance === 1) {
    return {
      size: 3,
      density: 5
    }
  }
  if (distance === 2) {
    return {
      size: 2,
      density: 4
    }
  }
  return {
    size: 1,
    density: clamp(6 - distance, 1, 3) as CharacterBrainNodeDensity
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampMenuX(value: number) {
  if (typeof window === 'undefined') return value
  return clamp(value, 12, Math.max(window.innerWidth - 188, 12))
}

function clampMenuY(value: number) {
  if (typeof window === 'undefined') return value
  return clamp(value, 12, Math.max(window.innerHeight - 120, 12))
}

function clearCanvasSelection() {
  if (typeof window === 'undefined') return
  window.getSelection?.()?.removeAllRanges?.()
}

function handleGlobalPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    closeNodeContextMenu()
    trashMenuOpen.value = false
    return
  }
  if (target.closest('.app-modal-shell')) return
  if (target.closest('.brain-workspace__context-menu')) return
  closeNodeContextMenu()
  if (target.closest('.brain-workspace__trash-btn')) return
  trashMenuOpen.value = false
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (isEditableKeyboardTarget(event.target)) {
    if (event.code === 'Space' && event.target === densitySelectRef.value) {
      densitySelectRef.value?.blur()
    } else {
      return
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault()
    undoBrainOps()
    return
  }
  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
    event.preventDefault()
    redoBrainOps()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    if (hasActiveBrowserTextSelection()) return
    const clipboard = buildBrainClipboard(selectedNodeIds.value, 'copy')
    if (!clipboard) return
    event.preventDefault()
    brainClipboard.value = clipboard
    toast(clipboard.entries.length > 1 ? t('brain.workspace.toast.copiedNodes', { count: clipboard.entries.length }) : t('brain.workspace.toast.nodeCopied'), 'success')
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
    if (hasActiveBrowserTextSelection()) return
    if (isReadOnlyMode.value) return
    const selectedNodes = selectedNodeIds.value.map((nodeId) => getBrainNodeById(nodeId)).filter(Boolean) as CharacterBrainNodeModel[]
    if (!selectedNodes.length || selectedNodes.some((node) => !isNodeDeletable(node))) return
    const clipboard = buildBrainClipboard(selectedNodeIds.value, 'cut')
    if (!clipboard) return
    event.preventDefault()
    brainClipboard.value = clipboard
    toast(clipboard.entries.length > 1 ? t('brain.workspace.toast.cutNodes', { count: clipboard.entries.length }) : t('brain.workspace.toast.nodeCut'), 'success')
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    if (isReadOnlyMode.value) return
    const targetId = focusedNodeId.value || getCharacterBrainRootId()
    if (!hasBrainClipboardData.value || !getBrainNodeById(targetId)) return
    event.preventDefault()
    pasteBrainClipboardIntoNode(targetId)
    return
  }
  if (event.code === 'Space' && !isEditableKeyboardTarget(event.target)) {
    isSpacePressed.value = true
    event.preventDefault()
  }
  if (event.key === 'Escape') {
    closeNodeContextMenu()
    trashMenuOpen.value = false
    chatMiniOpen.value = false
    clearNodeSelection()
  }
}

function handleGlobalKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') {
    isSpacePressed.value = false
  }
}

function isSpacePanEvent(event: PointerEvent | MouseEvent) {
  return isSpacePressed.value || event.getModifierState?.('Space') === true
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

onMounted(() => {
  if (typeof window === 'undefined') return
  loadMiniChatSize()
  loadMinDensity()
  loadNodeLabelBaseSize()
  updateCanvasScreenScale()
  if (typeof ResizeObserver !== 'undefined' && svgRef.value) {
    canvasResizeObserver = new ResizeObserver(updateCanvasScreenScale)
    canvasResizeObserver.observe(svgRef.value)
  }
  window.addEventListener('resize', updateCanvasScreenScale)
  window.addEventListener('pointerdown', handleGlobalPointerDown)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('keyup', handleGlobalKeyup)
})

onBeforeUnmount(() => {
  stopPhysics()
  if (typeof window !== 'undefined') {
    if (nodePositionPersistTimer) {
      window.clearTimeout(nodePositionPersistTimer)
      nodePositionPersistTimer = null
    }
    if (viewportZoomAnimationFrame !== null) {
      window.cancelAnimationFrame(viewportZoomAnimationFrame)
      viewportZoomAnimationFrame = null
    }
    canvasResizeObserver?.disconnect()
    canvasResizeObserver = null
    window.removeEventListener('resize', updateCanvasScreenScale)
    window.removeEventListener('pointerdown', handleGlobalPointerDown)
    window.removeEventListener('keydown', handleGlobalKeydown)
    window.removeEventListener('keyup', handleGlobalKeyup)
  }
})
</script>

<style scoped>
.brain-workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--langhuan-paper-bg);
}

.brain-workspace__toolbar {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 4;
  display: flex;
  align-items: flex-start;
  pointer-events: none;
}

.brain-workspace__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-start;
  pointer-events: auto;
}

.brain-workspace__density-control,
.brain-workspace__label-size-control {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  height: 28px;
  padding: 0 3px 0 6px;
  border-radius: 6px;
  color: #56624d;
  line-height: 1;
}

.brain-workspace__control-token {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  opacity: 0.82;
}

.brain-workspace__density-select,
.brain-workspace__label-size-select {
  width: 22px;
  height: 28px;
  padding: 0 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  line-height: 28px;
  text-align: center;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.brain-workspace__label-size-select {
  width: 24px;
  font-size: 11px;
}

.brain-workspace__density-control:hover,
.brain-workspace__density-control:focus-within,
.brain-workspace__label-size-control:hover,
.brain-workspace__label-size-control:focus-within {
  color: #1f2d1a;
  background: rgba(31, 45, 26, 0.06);
}

.brain-workspace__density-select:focus-visible,
.brain-workspace__label-size-select:focus-visible {
  outline: none;
}

.brain-workspace__icon-btn,
.brain-workspace__trash-btn,
.brain-workspace__mode-btn {
  border: 0;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  color: #56624d;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.brain-workspace__icon-btn:hover,
.brain-workspace__trash-btn:hover,
.brain-workspace__mode-btn:hover,
.brain-workspace__icon-btn--active {
  color: #1f2d1a;
  background: rgba(31, 45, 26, 0.06);
}

.brain-workspace__icon-btn:active,
.brain-workspace__trash-btn:active,
.brain-workspace__mode-btn:active {
  transform: scale(0.96);
}

.brain-workspace__icon-btn:disabled,
.brain-workspace__context-menu-item:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.brain-workspace__icon-btn:disabled:hover,
.brain-workspace__context-menu-item:disabled:hover {
  color: inherit;
  background: transparent;
}

.brain-workspace__mode-btn {
  font-size: 12px;
  font-weight: 600;
}

.brain-workspace__mode-btn--folder {
  color: #1f2d1a;
  background: rgba(31, 45, 26, 0.06);
}

.brain-workspace__toolbar-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.brain-workspace__toolbar-count {
  position: absolute;
  right: 1px;
  bottom: 1px;
  min-width: 12px;
  height: 12px;
  padding: 0 3px;
  border-radius: 6px;
  background: rgba(192, 102, 90, 0.9);
  color: #fff;
  font-size: 9px;
  line-height: 12px;
  text-align: center;
}

.brain-workspace__board,
.brain-workspace__canvas-shell {
  position: relative;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.brain-workspace__board {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}

.brain-workspace__canvas-shell {
  flex: 1 1 auto;
  min-width: 0;
}

.brain-workspace__unit-shell {
  flex: 0 1 min(42vw, 520px);
  min-width: 360px;
  max-width: 560px;
  border-left: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 76%, transparent);
  background: color-mix(in srgb, var(--langhuan-paper-bg, #faf8f0) 96%, white 4%);
}

.brain-workspace__canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: crosshair;
}

.brain-workspace__mini-chat {
  position: absolute;
  z-index: 6;
  min-width: 360px;
  min-height: 360px;
  max-width: calc(100% - 16px);
  max-height: calc(100% - 16px);
  border: 1px solid rgba(44, 62, 35, 0.12);
  border-radius: 8px;
  background: var(--langhuan-paper-bg);
  box-shadow: 0 18px 44px rgba(32, 42, 31, 0.16);
  overflow: hidden;
  backdrop-filter: blur(10px);
  user-select: none;
  -webkit-user-select: none;
}

.brain-workspace__mini-chat * {
  user-select: none;
  -webkit-user-select: none;
}

.brain-workspace__resize-handle {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 0;
  background: transparent;
  z-index: 3;
}

.brain-workspace__resize-handle::before {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
}

.brain-workspace__resize-handle--top-left {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}

.brain-workspace__resize-handle--top-left::before {
  left: 5px;
  top: 5px;
  border-left: 1.5px solid rgba(77, 101, 73, 0.7);
  border-top: 1.5px solid rgba(77, 101, 73, 0.7);
}

.brain-workspace__resize-handle--top-right {
  right: 0;
  top: 0;
  cursor: nesw-resize;
}

.brain-workspace__resize-handle--top-right::before {
  right: 5px;
  top: 5px;
  border-right: 1.5px solid rgba(77, 101, 73, 0.7);
  border-top: 1.5px solid rgba(77, 101, 73, 0.7);
}

.brain-workspace__resize-handle--bottom-left {
  left: 0;
  bottom: 0;
  cursor: nesw-resize;
}

.brain-workspace__resize-handle--bottom-left::before {
  left: 5px;
  bottom: 5px;
  border-left: 1.5px solid rgba(77, 101, 73, 0.7);
  border-bottom: 1.5px solid rgba(77, 101, 73, 0.7);
}

.brain-workspace__resize-handle--bottom-right {
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
}

.brain-workspace__resize-handle--bottom-right::before {
  right: 5px;
  bottom: 5px;
  border-right: 1.5px solid rgba(77, 101, 73, 0.7);
  border-bottom: 1.5px solid rgba(77, 101, 73, 0.7);
}

.brain-workspace__canvas--pannable {
  cursor: grab;
}

.brain-workspace__canvas--panning {
  cursor: grabbing;
}

.brain-workspace__canvas--selecting {
  cursor: crosshair;
}

.brain-workspace__selection-box {
  fill: rgba(77, 101, 73, 0.08);
  stroke: rgba(77, 101, 73, 0.5);
  stroke-width: 1;
  stroke-dasharray: 6 4;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.brain-workspace__edge {
  fill: none;
  stroke: rgba(76, 98, 74, 0.3);
  stroke-width: 1.1;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  transition: stroke 140ms ease, stroke-width 140ms ease, opacity 140ms ease;
}

.brain-workspace__edge--density-5 {
  stroke: rgba(70, 93, 68, 0.42);
  stroke-width: 1.35;
}

.brain-workspace__edge--link {
  stroke-dasharray: 5 5;
  stroke: rgba(78, 95, 113, 0.42);
}

.brain-workspace__edge--focus-active {
  opacity: 0.96;
  stroke: rgba(70, 93, 68, 0.56);
  stroke-width: 1.55;
}

.brain-workspace__edge--link.brain-workspace__edge--focus-active {
  stroke: rgba(78, 95, 113, 0.7);
}

.brain-workspace__edge--focus-muted {
  opacity: 0.06;
  stroke: rgba(109, 116, 107, 0.18);
}

.brain-workspace__edge--selection-active {
  opacity: 0.76;
  stroke: rgba(70, 93, 68, 0.52);
  stroke-width: 1.45;
}

.brain-workspace__edge--selection-muted {
  opacity: 0.1;
  stroke: rgba(120, 126, 118, 0.22);
}

.brain-workspace__edge--selection-hidden {
  opacity: 0;
}

.brain-node {
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 140ms ease;
}

.brain-node__dot {
  fill: rgba(77, 101, 73, 0.94);
  transition: fill 140ms ease, filter 140ms ease;
}

.brain-node--pending-create .brain-node__dot {
  fill: rgba(72, 135, 91, 0.96);
  filter: drop-shadow(0 0 8px rgba(78, 156, 98, 0.34));
}

.brain-node--pending-update .brain-node__dot {
  fill: rgba(190, 151, 64, 0.96);
  filter: drop-shadow(0 0 8px rgba(190, 151, 64, 0.34));
}

.brain-node__pending-arc {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 1.6;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.brain-node__hit-area {
  fill: transparent;
  pointer-events: all;
}

.brain-node__label {
  fill: #1f2d1a;
  font-size: 12px;
  font-weight: 500;
  dominant-baseline: hanging;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
  transition: fill 140ms ease, opacity 140ms ease, font-weight 140ms ease;
}

.brain-node__sub-label {
  fill: rgba(70, 82, 60, 0.82);
  font-size: 10px;
  font-weight: 500;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
  transition: fill 140ms ease, opacity 140ms ease;
}

.brain-node--size-1 .brain-node__label {
  font-size: 12px;
}

.brain-node--size-2 .brain-node__label {
  font-size: 14px;
}

.brain-node--size-3 .brain-node__label {
  font-size: 15px;
}

.brain-node--density-5 {
  opacity: 1;
}

.brain-node--density-4 {
  opacity: 0.92;
}

.brain-node--density-3 {
  opacity: 0.82;
}

.brain-node--density-2 {
  opacity: 0.66;
}

.brain-node--density-1 {
  opacity: 0.48;
}

.brain-node--focus-active {
  opacity: 1;
}

.brain-node--focus-active .brain-node__dot {
  fill: rgba(77, 101, 73, 0.98);
  filter: drop-shadow(0 8px 13px rgba(74, 96, 70, 0.18));
}

.brain-node--focus-active .brain-node__label {
  fill: #1f2d1a;
  font-weight: 600;
}

.brain-node--focus-related {
  opacity: 1;
}

.brain-node--focus-related .brain-node__dot {
  fill: rgba(77, 101, 73, 0.98);
  filter: drop-shadow(0 8px 13px rgba(74, 96, 70, 0.18));
}

.brain-node--focus-related .brain-node__label {
  fill: #1f2d1a;
  font-weight: 600;
}

.brain-node--focus-muted {
  opacity: 0.18;
}

.brain-node--focus-muted .brain-node__dot {
  fill: rgba(128, 135, 126, 0.46);
}

.brain-node--focus-muted .brain-node__label {
  fill: rgba(128, 135, 126, 0.46);
}

.brain-node--selection-active {
  opacity: 1;
}

.brain-node--selection-active .brain-node__dot {
  fill: rgba(77, 101, 73, 0.98);
  filter: drop-shadow(0 10px 16px rgba(74, 96, 70, 0.22));
}

.brain-node--selection-active .brain-node__label {
  fill: #1f2d1a;
  font-weight: 700;
}

.brain-node--selection-muted {
  opacity: 0.3;
}

.brain-node--selection-muted .brain-node__dot {
  fill: rgba(128, 135, 126, 0.58);
}

.brain-node--selection-muted .brain-node__label {
  fill: rgba(128, 135, 126, 0.58);
}

.brain-node--dragging .brain-node__dot {
  fill: rgba(77, 101, 73, 0.98);
  filter: drop-shadow(0 10px 16px rgba(74, 96, 70, 0.22));
}

.brain-node--layout-folder .brain-node__dot {
  stroke: rgba(31, 45, 26, 0.38);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
}

.brain-node--cut-pending {
  opacity: 0.4;
}

.brain-node--cut-pending .brain-node__dot {
  stroke: rgba(201, 78, 72, 0.82);
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}

.brain-node--clipboard-copy .brain-node__dot {
  stroke: rgba(93, 117, 152, 0.82);
  stroke-width: 1.6;
  stroke-dasharray: 2 3;
  vector-effect: non-scaling-stroke;
}

.brain-workspace__inline-card {
  position: absolute;
  width: 450px;
  z-index: 3;
  pointer-events: auto;
  animation: brain-card-expand 150ms ease-out;
  transform-origin: top left;
}

.brain-workspace__inline-card :deep(.brain-card) {
  height: 100%;
  max-height: 100%;
  min-height: 180px;
  overflow: hidden;
}

.brain-workspace__edge-tab {
  position: absolute;
  right: 0;
  width: max-content;
  min-width: 68px;
  max-width: 180px;
  height: 34px;
  z-index: 5;
  border: 1px solid rgba(27, 43, 26, 0.16);
  border-right: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--morandi-card) 94%, transparent);
  color: var(--morandi-text);
  box-shadow: 0 4px 10px rgba(25, 40, 31, 0.06);
  cursor: grab;
  line-height: 1.2;
  padding: 0 10px 0 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  clip-path: polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%);
  text-align: left;
  animation: brain-edge-tab-in 150ms ease-out;
  transform-origin: right center;
  transition: width 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.brain-workspace__edge-tab:active {
  cursor: grabbing;
}

@keyframes brain-edge-tab-in {
  from {
    opacity: 0;
    transform: translateX(16px) scaleX(0.72);
  }
  to {
    opacity: 1;
    transform: translateX(0) scaleX(1);
  }
}

@keyframes brain-card-expand {
  from {
    opacity: 0;
    transform: translateX(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.brain-workspace__context-menu {
  min-width: 184px;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--leaf-border, #d4cec4) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--leaf-panel, #f5f0e8);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  overflow: hidden;
  isolation: isolate;
}

.brain-workspace__context-menu--submenu {
  min-width: 196px;
  box-shadow: var(--langhuan-submenu-shadow, none);
}

.brain-workspace__context-submenu-shell {
  min-width: 196px;
}

.brain-workspace__context-menu-item {
  border: 0;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  color: var(--leaf-text, #3b342e);
  font-size: 12.5px;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brain-workspace__context-menu-item:hover {
  background: color-mix(in srgb, var(--leaf-accent, #829987) 8%, transparent);
}

.brain-workspace__context-menu-item--submenu {
  position: relative;
}

.brain-workspace__context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--leaf-border, #d4cec4) 82%, transparent);
}

.brain-workspace__context-menu-shortcut {
  flex: 0 0 auto;
  font-size: 11px;
  color: color-mix(in srgb, var(--leaf-text-soft, #8a8175) 88%, transparent);
}

.brain-workspace__context-menu-item--danger {
  color: #c94e48;
}

.brain-workspace__context-menu-item--danger:hover {
  background: color-mix(in srgb, #c94e48 10%, transparent);
}


@media (max-width: 1024px) {
  .brain-workspace__toolbar {
    top: 12px;
    right: 14px;
  }

  .brain-workspace__toolbar-actions {
    gap: 4px;
  }

  .brain-workspace__inline-card {
    width: 390px;
    max-width: calc(100% - 24px);
  }
}
</style>
