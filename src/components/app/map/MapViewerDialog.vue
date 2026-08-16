<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="map-viewer__overlay"
      @pointerdown.capture="overlayDismissGuard.handleOverlayPointerDown"
      @click.self="handleOverlayClose"
    >
      <section class="map-viewer" role="dialog" aria-modal="true" :aria-label="t('chat.mapViewer')">
        <header class="map-viewer__head">
          <div class="map-viewer__title">
            <svg class="map-viewer__licon map-viewer__licon--brand" viewBox="0 0 24 24"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" /><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" /><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" /><circle cx="12" cy="12" r="10" /></svg>
            <strong>{{ t('chat.mapViewer') }}</strong>
            <div class="map-viewer__world-wrap">
              <button
                type="button"
                class="map-viewer__world"
                :class="{ 'map-viewer__world--none': !sessionWorldId }"
                :title="t('chat.mapWorldPickerHint')"
                :disabled="!normalizedSessionId"
                @click="toggleWorldPicker"
              >
                <span v-if="!sessionWorldId" class="map-viewer__world-dot"></span>
                {{ worldTitle }}
                <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div v-if="worldPickerOpen" class="map-viewer__world-mask" @click="worldPickerOpen = false"></div>
              <div v-if="worldPickerOpen" class="map-viewer__world-pop">
                <p class="map-viewer__world-desc">{{ t('chat.mapWorldPickerDesc') }}</p>
                <p v-if="!sessionWorldId" class="map-viewer__world-guide">{{ t('chat.mapWorldGuideBanner') }}</p>
                <p v-if="worldsLoading" class="map-viewer__world-note">{{ t('chat.mapWorldLoading') }}</p>
                <ul v-else-if="worlds.length" class="map-viewer__world-list">
                  <li v-for="item in worlds" :key="item.id">
                    <button
                      type="button"
                      class="map-viewer__world-item"
                      :class="{ on: item.id === sessionWorldId }"
                      :disabled="worldBusy"
                      @click="handlePickWorld(item)"
                    >
                      <span class="map-viewer__world-item-name">{{ item.name }}</span>
                      <span class="map-viewer__world-item-meta">{{ t('chat.mapWorldSessionCount', { count: item.sessionCount || 0 }) }}</span>
                      <svg v-if="item.id === sessionWorldId" class="map-viewer__licon" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
                    </button>
                  </li>
                </ul>
                <p v-else class="map-viewer__world-note">{{ t('chat.mapWorldEmpty') }}</p>
                <div class="map-viewer__world-create">
                  <input
                    v-model="newWorldName"
                    type="text"
                    maxlength="50"
                    :placeholder="t('chat.mapWorldCreatePlaceholder')"
                    :disabled="worldBusy"
                    @keyup.enter="handleCreateWorld"
                  />
                  <button type="button" :disabled="worldBusy || !newWorldName.trim()" @click="handleCreateWorld">
                    {{ t('chat.mapWorldCreateAttach') }}
                  </button>
                </div>
                <p v-if="worldError" class="map-viewer__world-error">{{ worldError }}</p>
                <button
                  v-if="sessionWorldId"
                  type="button"
                  class="map-viewer__world-detach"
                  :disabled="worldBusy"
                  @click="handleDetachWorld"
                >{{ t('chat.mapWorldDetach') }}</button>
              </div>
            </div>
          </div>
          <button
            v-if="xingyiDockEmbedAllowed && cartographerCollapsed"
            type="button"
            class="map-viewer__agent-expand"
            :title="t('workspaceAgent.expandPanel', { name: '舆图师' })"
            :aria-label="t('workspaceAgent.expandPanel', { name: '舆图师' })"
            aria-expanded="false"
            @click="cartographerCollapsed = false"
          >
            <svg class="map-viewer__licon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M14 9l3 3-3 3" />
            </svg>
            <span>舆图师</span>
          </button>
          <div class="map-viewer__spacer"></div>
          <nav class="map-viewer__views" :aria-label="t('chat.mapViewer')">
            <button
              type="button"
              class="map-viewer__view-tab"
              :class="{ on: view === 'terrain' }"
              :title="t('chat.mapViewTerrainHint')"
              @click="view = 'terrain'"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="m8 3 4 8 5-5 5 15H2L8 3z" /></svg>{{ t('chat.mapViewTerrain') }}
            </button>
            <button
              type="button"
              class="map-viewer__view-tab"
              :class="{ on: view === 'civic' }"
              :title="t('chat.mapViewCivicHint')"
              @click="view = 'civic'"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>{{ t('chat.mapViewCivic') }}
            </button>
            <button
              type="button"
              class="map-viewer__status-toggle"
              :class="{ on: statusOn }"
              :title="t('chat.mapStatusOverlayHint')"
              @click="statusOn = !statusOn"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></svg>
              {{ t('chat.mapStatusOverlay') }}<span class="dot"></span>
            </button>
            <button
              type="button"
              class="map-viewer__view-tab map-viewer__edit-toggle"
              :class="{ on: editMode }"
              :disabled="isSampleWorld || isDraftMode || !hasMapSheet"
              :title="t('chat.mapEditHint')"
              @click="toggleEditMode"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>{{ t('chat.mapEdit') }}
            </button>
          </nav>
          <button type="button" class="map-viewer__close" :aria-label="t('common.close')" @click="emit('close')">
            <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </header>

        <div class="map-viewer__body">
          <!-- 独立"舆图师"：未挂世界/图纸时仍保留共享对话 UI，但禁用输入且绝不创建 unknown 会话。 -->
          <aside
            v-if="xingyiDockEmbedAllowed"
            class="map-viewer__xingyi-column"
            :class="{ 'map-viewer__xingyi-column--collapsed': cartographerCollapsed }"
            :style="cartographerCollapsed ? undefined : xingyiPanelStyle"
            aria-label="舆图师地图协作栏"
          >
            <WorkspaceAgentShell
              :key="cartographerViewScopeKey"
              v-model:collapsed="cartographerCollapsed"
              :scope-key="cartographerViewScopeKey"
              agent-kind="cartographer"
              :target-id="cartographerTargetId"
              title="舆图师"
              :identity-label="`舆图师 · ${worldTitle}`"
              :enabled="cartographerAvailable"
              :active="open"
              :unavailable-text="cartographerUnavailableText"
              :runner="cartographerRunner"
            />
          </aside>
          <button
            v-if="xingyiDockEmbedAllowed && !cartographerCollapsed"
            type="button"
            class="map-viewer__xingyi-resize"
            title="拖动调整舆图师对话框宽度"
            aria-label="拖动调整舆图师对话框宽度"
            @pointerdown.prevent="startXingyiResize"
          ></button>
          <section class="map-viewer__map-workspace">
          <div class="map-viewer__content">
          <div ref="mapBodyEl" class="map-viewer__canvas-wrap">
            <!-- MapCanvas 命令式建景：世界、版本或对照组变化时由 key 强制重挂。 -->
            <MapCanvas
              v-if="showCanvas"
              :key="mapCanvasKey"
              :world="world"
              :panels="panels"
              :view="view"
              :status-on="statusOn"
              :change-highlight="changeHighlight"
              :draft-sketches="draftSketches"
              :draft-review-items="effectiveDraftReviewItems"
              :selected-sketch-ids="selectedSketchIds"
              :sketch-marks="sketchMarks"
              :show-grid="gridOn"
              :focus-sketch="focusSketchRequest"
              :edit-mode="editMode"
              :selected-feature-ids="selectedEditFeatureIds"
              :edit-preview-features="terrainEditBuild.build?.previewFeatures || []"
              :edit-geometry="terrainEditSession?.geometry || null"
              :selected-edit-point-index="selectedEditPointIndex"
              @open-status-panel="handleOpenStatusPanel"
              @sketch-click="handleSketchClick"
              @sketch-box-select="handleSketchBoxSelect"
              @feature-select="handleFeatureSelect"
              @edit-point-select="handleEditPointSelect"
              @edit-point-move="handleEditPointMove"
              @edit-segment-insert="handleEditSegmentInsert"
              @edit-point-delete="handleEditPointDelete"
            />
            <!-- 真实世界点带锚点要素弹出的只读状态栏卡（批7）：定位算法与 MapCanvas 自带的样例弹卡同款
                 （锚点屏幕坐标→夹在容器内→优先摆在锚点上方，放不下就摆下方）。 -->
            <div v-if="statusAnchor" ref="statusPopEl" class="map-viewer__status-pop" :style="statusPopStyle">
              <p v-if="!statusAnchorPanel" class="map-viewer__status-pop-empty">{{ t('chat.mapStatusPanelMissing') }}</p>
              <StatusPanelCard
                v-else
                :panel="statusAnchorPanel"
                :session-id="sessionId || ''"
                :fields="statusAnchorFields"
                :draft="statusAnchorDraft"
                :dirty="false"
                :saving="false"
                :kind-meta="statusAnchorKindMeta"
                :host-label="statusAnchorHostLabel"
                :panel-name-by-id="statusAnchorPanelNameById"
                :ref-tint-class="statusAnchorRefTintClass"
                :ref-candidates-of="() => []"
                :grid-view="statusAnchorGridView"
                :expanded-cell="statusAnchorExpandedCell"
                readonly
                closable
                @update:expanded-cell="statusAnchorExpandedCell = $event"
                @close="statusAnchor = null"
              />
            </div>
            <!-- 剪影锚定信息卡（地图草案剪影可视化计划批2）：点击某剪影后在点击坐标附近弹出，非弹窗，
                 点别处或再点同项关闭（关闭走 handleOpenStatusPanel 的 null 分支联动，见上方说明）。 -->
            <div v-if="sketchAnchorItem" ref="sketchPopEl" class="map-viewer__sketch-pop" :style="sketchPopStyle">
              <header>
                <span class="map-viewer__sketch-pop-dot" :class="`c-${sketchAnchorItem.confidence}`"></span>
                <b>{{ sketchAnchorItem.label }}</b>
                <span class="map-viewer__sketch-pop-meta">{{ categoryLabel(sketchAnchorItem.category) }} · {{ actionLabel(sketchAnchorItem.action) }}</span>
              </header>
              <dl class="map-viewer__sketch-pop-body">
                <template v-if="sketchAnchorGridRef">
                  <dt>{{ t('chat.mapDraftCardGridRef') }}</dt><dd>{{ sketchAnchorGridRef }}</dd>
                </template>
                <template v-if="sketchAnchorItem.card.change">
                  <dt>{{ t('chat.mapDraftCardChange') }}</dt><dd>{{ sketchAnchorItem.card.change }}</dd>
                </template>
                <template v-if="sketchAnchorItem.card.basis">
                  <dt>{{ t('chat.mapDraftCardBasis') }}</dt><dd>{{ sketchAnchorItem.card.basis }}</dd>
                </template>
                <template v-if="sketchAnchorItem.card.risk">
                  <dt>{{ t('chat.mapDraftCardRisk') }}</dt><dd>{{ sketchAnchorItem.card.risk }}</dd>
                </template>
              </dl>
            </div>
            <!-- 草案底部操作条（批2）：只在草案模式渲染，拆到独立组件见 MapDraftActionBar.vue -->
            <MapDraftActionBar
              v-if="isDraftMode"
              :mode="isFinalDraftReview ? 'final' : 'layout'"
              :open="actionBarOpen"
              :selected-count="selectedSketchIds.length"
              :has-ready-items="hasReadyItems"
              :submit-enabled="hasAnyMark"
              :note="draftNote"
              :accepted-count="acceptedCount"
              :rejected-count="rejectedCount"
              :commented-count="commentedCount"
              :decided-items="decidedSketchItems"
              @toggle="actionBarOpen = !actionBarOpen"
              @accept="toggleMark('accepted')"
              @reject="toggleMark('rejected')"
              @accept-all-ready="acceptAllReady"
              @comment="handleSketchComment"
              @update:note="draftNote = $event"
              @submit="submitSketchDecision"
              @select-decided="handleSelectDecided"
              @edit-decided-comment="handleEditDecidedComment"
              @revoke-decided="handleRevokeDecided"
            />
            <div v-if="worldStateLoading || isSampleWorld || !hasMapSheet" class="map-viewer__map-state">
              <template v-if="worldStateLoading || mapLoading">
                <p class="map-viewer__map-state-desc">{{ t('chat.mapDataLoading') }}</p>
              </template>
              <template v-else-if="mapError">
                <p class="map-viewer__map-state-title">{{ mapError }}</p>
                <button type="button" class="map-viewer__map-state-btn" @click="loadWorldMap(sessionWorldId)">
                  {{ t('chat.mapLoadRetry') }}
                </button>
              </template>
              <template v-else>
                <svg class="map-viewer__map-state-icon" viewBox="0 0 24 24"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" /><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" /><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" /><circle cx="12" cy="12" r="10" /></svg>
                <p class="map-viewer__map-state-title">{{ t('chat.mapEmptyTitle') }}</p>
                <p class="map-viewer__map-state-desc">{{ t('chat.mapEmptyDesc') }}</p>
                <p v-if="initialSheetError" class="map-viewer__map-state-error">{{ initialSheetError }}</p>
                <button
                  type="button"
                  class="map-viewer__map-state-btn"
                  :disabled="initialSheetBusy"
                  @click="handleCreateInitialSheet"
                >{{ initialSheetBusy ? t('chat.mapFirstSheetCreating') : t('chat.mapFirstSheetCreate') }}</button>
              </template>
            </div>
          </div>
          <!-- 右侧工具面板互斥：历史 / 网格 / 点阵同时只展开一个。 -->
          <aside v-if="activeToolPanel === 'history'" class="map-viewer__history map-viewer__tool-panel">
            <header class="map-viewer__history-head">
              <b>{{ t('chat.mapHistory') }}</b>
              <button
                v-if="compareGroupId"
                type="button"
                class="map-viewer__history-exit"
                @click="compareGroupId = ''"
              >{{ t('chat.mapHistoryExitCompare') }}</button>
              <button v-else type="button" class="map-viewer__panel-close" :aria-label="t('common.close')" @click="closeToolPanel">
                <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </header>
            <div class="map-viewer__history-body">
              <p v-if="historyLoading && !mapHistory.length" class="map-viewer__history-note">{{ t('chat.mapHistoryLoading') }}</p>
              <p v-else-if="historyError" class="map-viewer__history-note map-viewer__history-note--error">{{ historyError }}</p>
              <p v-else-if="!mapHistory.length" class="map-viewer__history-note">{{ t('chat.mapHistoryEmpty') }}</p>
              <ul v-else class="map-viewer__history-list">
                <li v-for="group in mapHistory" :key="group.groupId">
                  <button
                    type="button"
                    class="map-viewer__history-item"
                    :class="{ on: group.groupId === compareGroupId }"
                    :title="t('chat.mapHistoryHint')"
                    @click="toggleCompare(group)"
                  >
                    <span class="map-viewer__history-item-top">
                      <span class="map-viewer__history-item-time">{{ fmtHistoryTime(group.endedAt) }}</span>
                      <span class="map-viewer__history-item-counts">
                        <em v-if="group.counts.add" class="c-add">+{{ group.counts.add }}</em>
                        <em v-if="group.counts.update" class="c-upd">~{{ group.counts.update }}</em>
                        <em v-if="group.counts.delete" class="c-del">-{{ group.counts.delete }}</em>
                      </span>
                    </span>
                    <span class="map-viewer__history-item-label">{{ group.runLabel || (group.runKey === 'manual' ? t('chat.mapHistoryManual') : group.runKey) }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </aside>
          <aside v-if="showDotMatrixPanel" class="map-viewer__dotmatrix">
            <header class="map-viewer__dotmatrix-head">
              <b>{{ t('chat.mapDotMatrixPanelTitle') }}</b>
              <button
                type="button"
                class="map-viewer__dotmatrix-close"
                :aria-label="t('common.close')"
                @click="closeToolPanel"
              >
                <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </header>
            <div class="map-viewer__dotmatrix-body">
              <label class="map-viewer__dotmatrix-field">
                <span>{{ t('chat.mapDotMatrixTerrainLabel') }}</span>
                <!-- 目前唯一选项=山脉（category:'mountain'）：每加一种装甲地形谓词，在此加一个 option，
                     并在 generateDotMatrix 的 switch 分支里加一条对应的 build*DotMatrix 调用。 -->
                <select v-model="dotMatrixTerrain">
                  <option value="mountain">{{ t('chat.mapDotMatrixTerrainMountain') }}</option>
                </select>
              </label>
              <label class="map-viewer__dotmatrix-field">
                <span>{{ t('chat.mapDotMatrixGridSizeLabel') }}</span>
                <select v-model.number="dotMatrixGridN">
                  <option :value="41">41</option>
                  <option :value="61">61</option>
                  <option :value="81">81</option>
                </select>
              </label>
              <!-- 生成是同步纯函数调用（无 loading 态）；切换地形/尺寸后不自动重算，必须再点一次「生成」——
                   保持「结果只在明确点击时改变」的可预期行为，不在用户还在调参时就抢跑重算。 -->
              <button type="button" class="map-viewer__dotmatrix-generate" @click="generateDotMatrix">
                {{ t('chat.mapDotMatrixGenerate') }}
              </button>
              <p v-if="dotMatrixError" class="map-viewer__dotmatrix-error">{{ dotMatrixError }}</p>
              <template v-else-if="dotMatrixResult && dotMatrixStats">
                <pre class="map-viewer__dotmatrix-pre">{{ dotMatrixResult.text }}</pre>
                <p class="map-viewer__dotmatrix-stats">{{ t('chat.mapDotMatrixStats', dotMatrixStats) }}</p>
                <button type="button" class="map-viewer__dotmatrix-copy" @click="copyDotMatrixText">
                  {{ dotMatrixCopied ? t('chat.mapDotMatrixCopied') : t('chat.mapDotMatrixCopy') }}
                </button>
              </template>
            </div>
          </aside>
          <aside v-if="activeToolPanel === 'grid'" class="map-viewer__grid-panel map-viewer__tool-panel">
            <header class="map-viewer__tool-panel-head">
              <b>{{ t('chat.mapGridToggle') }}</b>
              <button type="button" class="map-viewer__panel-close" :aria-label="t('common.close')" @click="closeToolPanel">
                <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </header>
            <div class="map-viewer__grid-panel-body">
              <button
                type="button"
                class="map-viewer__grid-switch"
                :class="{ on: gridOn }"
                role="switch"
                :aria-checked="gridOn"
                @click="gridOn = !gridOn"
              >
                <span>{{ t('chat.mapGridToggle') }}</span>
                <span class="map-viewer__grid-switch-track"><i></i></span>
              </button>
              <p>{{ t('chat.mapGridToggleHint') }}</p>
            </div>
          </aside>
          <MapTerrainEditorPanel
            v-if="activeToolPanel === 'edit'"
            class="map-viewer__tool-panel"
            :session="terrainEditSession"
            :selection-message="terrainEditSelectionMessage"
            :preview-error="terrainEditBuild.error"
            :save-error="terrainEditSaveError"
            :saving="terrainEditSaving"
            :selected-point-index="selectedEditPointIndex"
            @update-value="updateTerrainEditValue"
            @add-point="addTerrainEditPoint"
            @delete-point="deleteTerrainEditPoint"
            @toggle-snap="toggleTerrainEditSnap"
            @save="saveTerrainEdit"
            @cancel="cancelTerrainEdit"
            @close="exitEditMode"
          />

          <nav class="map-viewer__tool-rail" aria-label="地图辅助工具">
            <button
              type="button"
              class="map-viewer__tool-rail-btn map-viewer__history-toggle"
              :class="{ on: activeToolPanel === 'history' }"
              :disabled="!showHistoryPanel"
              :title="t('chat.mapHistory')"
              @click="toggleHistoryPanel"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>
              <span>{{ t('chat.mapHistory') }}</span>
            </button>
            <button
              type="button"
              class="map-viewer__tool-rail-btn map-viewer__status-toggle"
              :class="{ on: activeToolPanel === 'grid' || gridOn }"
              :title="t('chat.mapGridToggleHint')"
              @click="toggleGridPanel"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>
              <span>{{ t('chat.mapGridToggle') }}</span>
            </button>
            <button
              type="button"
              class="map-viewer__tool-rail-btn map-viewer__status-toggle"
              :class="{ on: activeToolPanel === 'dotmatrix' }"
              :disabled="isSampleWorld"
              :title="t('chat.mapDotMatrixHint')"
              @click="toggleDotMatrixPanel"
            >
              <svg class="map-viewer__licon" viewBox="0 0 24 24"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
              <span>{{ t('chat.mapDotMatrix') }}</span>
            </button>
          </nav>
          </div>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MapCanvas from './MapCanvas.vue'
import MapDraftActionBar from './MapDraftActionBar.vue'
import MapTerrainEditorPanel from './MapTerrainEditorPanel.vue'
import StatusPanelCard from '../chat/StatusPanelCard.vue'
import { useCharacterStore } from '../../../stores/characterStore'
import { useChatStore } from '../../../stores/chatStore'
import { EMPTY_MAP_WORLD } from '../../../app/mapPresentation'
import { computeMapTaskFrame } from '../../../app/mapTaskFrame'
import { computeMapGridSpec, formatMapGridRef, type MapChangeHighlight, type MapPoint, type MapWorldData } from '../../../app/mapGeometry'
import { projectWorldMapSheet } from '../../../app/worldMapViewProjection'
import { resolveWorldDefaultMapSheet } from '../../../app/worldMapDefaultSheet'
import { createOverlayDismissGuard } from '../../../utils/overlayDismissGuard'
// 点阵投影调试面板（装甲地图系统计划批A1 附属工具）：直接消费批A1 交付的纯函数，不改它的签名
import { buildMountainDotMatrix } from '../../../app/mapArmor/dotMatrix'
import type { DotMatrixProjection } from '../../../app/mapArmor/types'
import {
  buildMapTerrainEdit,
  createMapTerrainEditSession,
  saveMapTerrainEdit,
  type MapTerrainEditSession
} from '../../../app/mapTerrainEditing'
import type { HuiyuDraftSketchItem } from '../../../app/huiyuSubagent'
import type { HuiyuSketchDecision } from '../../../app/huiyuOrchestration'
import type { MapDraftReviewDecision, MapDraftReviewItem } from '../../../app/mapDraftReview'
import {
  insertMapGeometryPointNearIndex,
  insertMapGeometryPointOnSegment,
  moveMapGeometryPoint,
  removeMapGeometryPoint,
  setMapGeometrySnap
} from '../../../app/mapGeometryEditing'
// 独立"舆图师"（地图与剧本工作区专业Agent计划批C）：不经过 runXingyiAgent/dispatchMapWork。
import WorkspaceAgentShell from '../workspaceAgent/WorkspaceAgentShell.vue'
import { buildCartographerScopeKey, buildCartographerTargetId, createScopeMapDraftReviewChannel, createScopeConfirmWriteChannel, findScopeState } from '../../../app/workspaceAgentScopeState'
import type { WorkspaceAgentTurnRunner } from '../../../composables/useWorkspaceAgentController'
import { runCartographerAgent } from '../../../app/cartographerAgentHarness'
import { loadRenderedAgentContext } from '../../../app/agentContext/agentContextProvider'
import { renderMapSummary } from '../../../app/huiyuMapTools'
import { useAI } from '../../../composables/useAI'
import { useSettingStore } from '../../../stores/settingStore'
import { buildTaskModelAiOptions } from '../../../utils/modelTaskTiers'
import { buildAgentConversationModelAiOptions } from '../../../app/agentConversationModelSelection'
import { toOpenAiTools } from '../../../app/agentRuntime/toolRegistry'

type MapDraftDisplayItem = HuiyuDraftSketchItem | MapDraftReviewItem
import {
  attachSessionWorld,
  fetchChatSessionBundleById,
  fetchSessionTemporaryEntities,
  fetchStatusPanelTemplates,
  fetchStatusPanelsBundle,
  fetchWorldMapBundle,
  fetchWorldMapChangeLog,
  fetchWorlds,
  saveWorldMapFeaturesRemote,
  deleteWorldMapFeatureRemote
} from '../../../repositories/chatRepository'
import type { ChatStatusPanel, ChatStatusPanelTemplate, World, WorldMapBundle, WorldMapChangeRunGroup, WorldMapSheet } from '../../../types'
import { worldMapRevision } from '../../../app/worldMapRevision'
import { buildPanelValueDraft, hostLabelFor, kindMetaOf, panelNameByIdFrom, refTintClassFrom } from '../../../app/statusPanelDisplayMeta'
import { resolvePanelFields } from '../../../app/xingyiStatusSystemTools'
import { applyChatSessionWorldReadModel } from '../../../app/chatSessionWorldContext'
import { useResizablePanel } from '../../../composables/app/useResizablePanel'
import { createInitialWorldMapSheet } from '../../../app/worldMapSheetAuthoring'

const props = defineProps<{
  open: boolean
  sessionId?: string
  /** 世界 id 兜底（星依世界寻址批·2026-07-13）：仅当无 sessionId、或 sessionId 查不到世界时生效——
   *  典型场景=星依 world 直达派发的草案确认卡（worldSessionId 传的是星依浮坞自身会话，查不到目标世界）。
   *  world 必须真实存在于 fetchWorlds 结果里才生效（防脏 id 误显示）；有会话且能查到世界时该 prop 不参与判定。 */
  worldId?: string
  /** 草案剪影清单（地图草案剪影可视化计划批2）：非空即进入草案预览模式——原样透传给 MapCanvas，
   *  选中集/三态标记/意见等决策交互状态全在本弹窗本地管理（批2 纯视图层，不接确认通道）。 */
  draftSketches?: HuiyuDraftSketchItem[]
  /** 新写链已经完成硬校验的最终矢量候选；确认后原样落库。 */
  draftReviewItems?: MapDraftReviewItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  /** 草案决策提交（批2）：载荷形状与 parseHuiyuSketchDecision 解析结果对齐（kind 判别字段照抄协议）。 */
  (e: 'sketch-decision', payload: { kind: 'huiyu-sketch-decision' } & HuiyuSketchDecision): void
  (e: 'draft-review-decision', payload: MapDraftReviewDecision): void
}>()

const { t, te } = useI18n()
const chatStore = useChatStore()
const overlayDismissGuard = createOverlayDismissGuard()
const xingyiDockEmbedAllowed = ref(typeof window === 'undefined' || window.innerWidth > 960)
const cartographerCollapsed = ref(false)
const { panelStyle: xingyiPanelStyle, startResize: startXingyiResize } = useResizablePanel({
  storageKey: 'langhuan_map_viewer_xingyi_width',
  defaultWidth: 360,
  minWidth: 280,
  maxWidth: 520
})

function syncXingyiDockEmbedBreakpoint() {
  xingyiDockEmbedAllowed.value = window.innerWidth > 960
}

onMounted(() => window.addEventListener('resize', syncXingyiDockEmbedBreakpoint))

// 独立"舆图师"（批C）：scopeKey 按世界+当前图纸；世界/图纸切换会换 key，WorkspaceAgentShell 靠 :key 重挂载，
// 旧 scope 状态留在模块级 Map 里不丢（同批B剧本工作区 :key="scriptwriterScopeKey" 先例）。
const ai = useAI()
const settingStore = useSettingStore()
const cartographerScopeKey = computed(() => buildCartographerScopeKey(sessionWorldId.value, activeSheet.value?.id || ''))
const cartographerAvailable = computed(() => Boolean(sessionWorldId.value && activeSheet.value?.id))
const cartographerUnavailableText = computed(() => sessionWorldId.value
  ? t('chat.mapCartographerNeedsSheet')
  : t('chat.mapCartographerNeedsWorld'))
const cartographerTargetId = computed(() => cartographerAvailable.value
  ? buildCartographerTargetId(sessionWorldId.value, activeSheet.value!.id)
  : '')
const cartographerViewScopeKey = computed(() => cartographerAvailable.value
  ? cartographerScopeKey.value
  : 'cartographer:unavailable')
// 自持最终草稿审阅态：与 XingyiDock 那套"另一个组件持有pendingMapDraftReview、靠props/emit传递"不同——
// 舆图师就跑在本组件内部，直接读同一份 scope 状态，不需要跨组件 Promise 通道（母计划批C调研第6点方案A）。
const selfHostedDraftReview = computed(() => findScopeState(cartographerScopeKey.value)?.pendingMapDraftReview || null)
const cartographerRunner: WorkspaceAgentTurnRunner = async ({
  userText,
  history,
  signal,
  turnStream,
  initialTaskTodo,
  initialDeferredActiveTools,
  onDeferredActiveToolsChange,
  onTaskTodoChange,
  modelSelection
}) => {
  const worldId = sessionWorldId.value
  const sheetId = activeSheet.value?.id || ''
  if (!worldId || !sheetId) throw new Error('当前对话还没有世界或图纸，无法调用舆图师')
  const sessionId = String(props.sessionId || '').trim()
  if (!sessionId) throw new Error('舆图师缺少正式会话作用域，无法加载统一原始可见上下文')
  const bundle = mapBundle.value || await fetchWorldMapBundle(worldId)
  const agentConfig = settingStore.getBrainAgentConfig?.() || null
  let contextBlock = ''
  try {
    contextBlock = (await loadRenderedAgentContext({
      sessionId,
      agentKind: 'huiyu_workspace',
      userText
    })).text
  } catch (error) {
    throw new Error(`舆图师统一原始可见上下文加载失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const result = await runCartographerAgent({
    userText,
    history,
    contextBlock,
    worldId,
    mapSummary: renderMapSummary(bundle),
    sourceSessionId: sessionId,
    confirmWrite: createScopeConfirmWriteChannel(cartographerScopeKey.value, 'cartographer', buildCartographerTargetId(worldId, sheetId)),
    reviewDraft: createScopeMapDraftReviewChannel(cartographerScopeKey.value, 'cartographer', buildCartographerTargetId(worldId, sheetId)),
    writeApi: {
      fetchWorldMapBundle,
      saveWorldMapFeaturesRemote,
      deleteWorldMapFeatureRemote
    },
    signal,
    turnStream,
    initialTaskTodo,
    initialDeferredActiveTools,
    onDeferredActiveToolsChange,
    onTaskTodoChange,
    paintCallModel: async ({ system, user }) => {
      const response = await ai.callAIWithTools([
        { role: 'system', content: system },
        { role: 'user', content: user }
      ] as never, {
        ...buildTaskModelAiOptions(agentConfig as never, 'mapDraw', { maxTokens: 2048, temperature: 0.3, thinking: 'disabled' }),
        feature: 'agent',
        logLabel: 'cartographer-armor-painter',
        usageLabel: '地貌师(舆图师工作区)',
        placeLabel: currentWorld.value?.name || '舆图师',
        sessionId,
        sessionLabel: '舆图师',
        signal
      })
      return response?.content ?? ''
    },
    callOrchestrator: async ({ messages, toolBriefs }) => {
      const response = await ai.callAIWithTools(messages as never, {
        ...buildAgentConversationModelAiOptions(agentConfig as never, modelSelection, { maxTokens: 4096, temperature: 0.55, thinking: 'enabled' }),
        tools: toOpenAiTools(toolBriefs),
        feature: 'agent',
        logLabel: 'cartographer-workspace',
        usageLabel: '舆图师(工作区独立会话)',
        placeLabel: currentWorld.value?.name || '舆图师',
        sessionId,
        sessionLabel: '舆图师',
        signal
      })
      return { content: response?.content ?? '', toolCalls: response?.toolCalls ?? [] }
    }
  })
  return { reply: result.reply, terminalReason: result.terminalReason }
}

// ⚠️ sessionWorldId 提前声明（本来归在下方"世界选择器"一组）：isSampleWorld computed 引用它，
// 而下面的 `watch(isSampleWorld, ...)` 会在 setup 阶段同步取一次基线值——若 sessionWorldId 仍在
// 原来靠后的位置声明，会在它初始化前被访问，触发 TDZ ReferenceError（脚本按书写顺序执行）。
const sessionWorldId = ref('')

// loadWorldState 覆盖「世界列表+会话挂载世界」两个异步源；数据落定前不显示画布。
const worldStateLoading = ref(false)

// 挂世界时读取正式真值；未挂世界或没有图纸时显示空态卡。
// 纸白工作平面不再依赖 explored：有图纸但零要素时仍显示可操作的空白画布。
const mapBundle = ref<WorldMapBundle | null>(null)
const mapLoading = ref(false)
const mapError = ref('')
const initialSheetBusy = ref(false)
const initialSheetError = ref('')

watch(sessionWorldId, () => {
  initialSheetError.value = ''
})

const activeSheet = computed<WorldMapSheet | null>(() => {
  return resolveWorldDefaultMapSheet(mapBundle.value)
})

const activeMapTaskFrame = computed(() => computeMapTaskFrame(
  (activeSheet.value?.features || []).map((feature) => (feature.geometry?.pts || []) as MapPoint[])
))

const hasMapSheet = computed(() => Boolean(activeSheet.value))
const isSampleWorld = computed(() => !sessionWorldId.value)
type MapToolPanel = 'history' | 'grid' | 'dotmatrix' | 'edit'
const activeToolPanel = ref<MapToolPanel | null>(null)
const editMode = computed(() => activeToolPanel.value === 'edit')

function closeToolPanel() {
  if (activeToolPanel.value === 'edit') resetTerrainEditState()
  activeToolPanel.value = null
}

function openToolPanel(panel: Exclude<MapToolPanel, 'edit'>) {
  if (activeToolPanel.value === 'edit') resetTerrainEditState()
  activeToolPanel.value = activeToolPanel.value === panel ? null : panel
}
const showCanvas = computed(() => {
  if (worldStateLoading.value) return false
  return !isSampleWorld.value && hasMapSheet.value
})

// ── 地图版本历史（批L·2026-07-12）：右侧「历史」面板 + 对照模式 ──
// compareGroupId 需在 mapCanvasKey 之前声明（computed 引用它；虽然 computed 懒求值无 TDZ 风险，
// 与 sessionWorldId 的前置声明保持同一防御姿势）。
const mapHistory = ref<WorldMapChangeRunGroup[]>([])
const historyLoading = ref(false)
const historyError = ref('')
// 批M2（2026-07-12 真机反馈）：历史侧栏默认收起——每次打开弹窗都从收起态开始（关闭分支同步重置），
// 不做按世界/按次记忆。
const compareGroupId = ref('')
const showHistoryPanel = computed(() => Boolean(sessionWorldId.value))
const compareGroup = computed(() => mapHistory.value.find((group) => group.groupId === compareGroupId.value) || null)
// 对照模式高亮配置：变更集 add/update 分色、delete 取快照几何画幽灵轮廓（去重取每 feature 最新一笔的 op）
const changeHighlight = computed<MapChangeHighlight | null>(() => {
  const group = compareGroup.value
  if (!group) return null
  const addIds: string[] = []
  const updateIds: string[] = []
  const deleteGhosts: MapChangeHighlight['deleteGhosts'] = []
  const seen = new Set<string>()
  for (const item of group.items) { // items 时间倒序，首见即该 feature 在本 run 内的最终状态
    if (!item.featureId || seen.has(item.featureId)) continue
    seen.add(item.featureId)
    if (item.op === 'add') addIds.push(item.featureId)
    else if (item.op === 'update') updateIds.push(item.featureId)
    else if (item.op === 'delete') {
      const snapshot = item.snapshot as { kind?: string; geometry?: { pts?: MapPoint[] } }
      const pts = Array.isArray(snapshot?.geometry?.pts) ? snapshot.geometry.pts : []
      deleteGhosts.push({ id: item.featureId, kind: String(snapshot?.kind || ''), pts })
    }
  }
  return { addIds, updateIds, deleteGhosts }
})

function toggleCompare(group: WorldMapChangeRunGroup) {
  compareGroupId.value = compareGroupId.value === group.groupId ? '' : group.groupId
}

function fmtHistoryTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function loadMapHistory(worldId: string) {
  if (!worldId) {
    mapHistory.value = []
    compareGroupId.value = ''
    return
  }
  historyLoading.value = true
  historyError.value = ''
  try {
    mapHistory.value = await fetchWorldMapChangeLog(worldId)
    // 对照中的组在刷新后消失（如被 500 行修剪掉）→ 自动退出对照
    if (compareGroupId.value && !mapHistory.value.some((group) => group.groupId === compareGroupId.value)) {
      compareGroupId.value = ''
    }
  } catch (err) {
    historyError.value = err instanceof Error ? err.message : String(err)
  } finally {
    historyLoading.value = false
  }
}
// 画布按世界、版本和对照组重挂；MapCanvas 命令式建景，不 watch world。
// appliedMapRev 变化会强制重挂，让绘舆新落的笔立即显形。
// compareGroupId（批L 地图版本历史）：对照模式切换也要进 key——MapCanvas 命令式建景，三色高亮/幽灵轮廓
// 作为 prop 只在挂载时生效，必须靠重挂应用与退出。
const mapCanvasKey = computed(() => `${sessionWorldId.value || 'empty'}::${appliedMapRev.value}::cmp:${compareGroupId.value}`)

const world = computed<MapWorldData>(() => {
  const sheet = activeSheet.value
  const bundle = mapBundle.value
  if (!isSampleWorld.value && hasMapSheet.value && sheet && bundle) {
    return projectWorldMapSheet(bundle, sheet)
  }
  return EMPTY_MAP_WORLD
})

// ── 人工地形参数编辑：正式真值仍在 activeSheet.features；session 只是本地草稿，build 只产实时预览与待保存条目。
const selectedEditFeatureIds = ref<string[]>([])
const terrainEditSession = ref<MapTerrainEditSession | null>(null)
const terrainEditSelectionMessage = ref('')
const terrainEditSaveError = ref('')
const terrainEditSaving = ref(false)
const selectedEditPointIndex = ref<number | null>(null)

const terrainEditBuild = computed(() => {
  const session = terrainEditSession.value
  if (!session) return { build: null, error: '' }
  try {
    return { build: buildMapTerrainEdit(session), error: '' }
  } catch (error) {
    return { build: null, error: error instanceof Error ? error.message : String(error) }
  }
})

function resetTerrainEditState() {
  selectedEditFeatureIds.value = []
  terrainEditSession.value = null
  terrainEditSelectionMessage.value = ''
  terrainEditSaveError.value = ''
  terrainEditSaving.value = false
  selectedEditPointIndex.value = null
}

function toggleEditMode() {
  if (editMode.value) {
    exitEditMode()
    return
  }
  if (isSampleWorld.value || isDraftMode.value || !hasMapSheet.value) return
  compareGroupId.value = ''
  activeToolPanel.value = 'edit'
  resetTerrainEditState()
}

function exitEditMode() {
  if (activeToolPanel.value === 'edit') activeToolPanel.value = null
  resetTerrainEditState()
}

function handleFeatureSelect(payload: { id: string } | null) {
  terrainEditSaveError.value = ''
  if (!payload) {
    selectedEditFeatureIds.value = []
    terrainEditSession.value = null
    terrainEditSelectionMessage.value = t('chat.mapEditSelectHint')
    selectedEditPointIndex.value = null
    return
  }
  const selection = createMapTerrainEditSession(activeSheet.value?.features || [], payload.id)
  if (!selection.ok) {
    selectedEditFeatureIds.value = selection.selectedFeatureIds
    terrainEditSession.value = null
    terrainEditSelectionMessage.value = selection.reason
    selectedEditPointIndex.value = null
    return
  }
  terrainEditSession.value = selection.session
  selectedEditFeatureIds.value = selection.session.featureIds
  terrainEditSelectionMessage.value = ''
  selectedEditPointIndex.value = null
}

function updateTerrainEditGeometry(geometry: NonNullable<MapTerrainEditSession['geometry']>) {
  const current = terrainEditSession.value
  if (!current) return
  terrainEditSaveError.value = ''
  terrainEditSession.value = { ...current, geometry }
}

function handleEditPointSelect(payload: { index: number } | null) {
  selectedEditPointIndex.value = payload?.index ?? null
}

function handleEditPointMove(payload: { index: number; point: MapPoint; disableSnap: boolean }) {
  const geometry = terrainEditSession.value?.geometry
  if (!geometry) return
  try {
    updateTerrainEditGeometry(moveMapGeometryPoint(geometry, payload.index, payload.point, { disableSnap: payload.disableSnap }))
    selectedEditPointIndex.value = payload.index
  } catch (error) {
    terrainEditSaveError.value = error instanceof Error ? error.message : String(error)
  }
}

function handleEditSegmentInsert(payload: { segmentIndex: number; point: MapPoint }) {
  const geometry = terrainEditSession.value?.geometry
  if (!geometry) return
  try {
    const inserted = insertMapGeometryPointOnSegment(geometry, payload.segmentIndex, payload.point)
    updateTerrainEditGeometry(inserted.geometry)
    selectedEditPointIndex.value = inserted.index
  } catch (error) {
    terrainEditSaveError.value = error instanceof Error ? error.message : String(error)
  }
}

function addTerrainEditPoint() {
  const geometry = terrainEditSession.value?.geometry
  if (!geometry) return
  try {
    const inserted = insertMapGeometryPointNearIndex(geometry, selectedEditPointIndex.value)
    updateTerrainEditGeometry(inserted.geometry)
    selectedEditPointIndex.value = inserted.index
  } catch (error) {
    terrainEditSaveError.value = error instanceof Error ? error.message : String(error)
  }
}

function deleteTerrainEditPoint() {
  if (selectedEditPointIndex.value === null) return
  handleEditPointDelete({ index: selectedEditPointIndex.value })
}

function handleEditPointDelete(payload: { index: number }) {
  const geometry = terrainEditSession.value?.geometry
  if (!geometry) return
  try {
    const next = removeMapGeometryPoint(geometry, payload.index)
    updateTerrainEditGeometry(next)
    selectedEditPointIndex.value = next.points.length ? Math.min(payload.index, next.points.length - 1) : null
  } catch (error) {
    terrainEditSaveError.value = error instanceof Error ? error.message : String(error)
  }
}

function toggleTerrainEditSnap() {
  const geometry = terrainEditSession.value?.geometry
  if (!geometry) return
  updateTerrainEditGeometry(setMapGeometrySnap(geometry, !geometry.snapEnabled))
}

function updateTerrainEditValue(payload: { key: string; value: number | string }) {
  const current = terrainEditSession.value
  if (!current) return
  terrainEditSaveError.value = ''
  if (payload.key === 'name') {
    terrainEditSession.value = { ...current, name: String(payload.value) }
    return
  }
  terrainEditSession.value = { ...current, values: { ...current.values, [payload.key]: payload.value } }
}

function cancelTerrainEdit() {
  const id = terrainEditSession.value?.sourceFeatureId || selectedEditFeatureIds.value[0]
  if (!id) {
    resetTerrainEditState()
    return
  }
  handleFeatureSelect({ id })
}

async function saveTerrainEdit() {
  const session = terrainEditSession.value
  const build = terrainEditBuild.value.build
  if (!session || !build || !sessionWorldId.value || terrainEditSaving.value) return
  terrainEditSaving.value = true
  terrainEditSaveError.value = ''
  try {
    await saveMapTerrainEdit(sessionWorldId.value, session, build)
    await loadWorldMap(sessionWorldId.value)
    appliedMapRev.value = worldMapRevision.value.rev
    resetTerrainEditState()
    terrainEditSelectionMessage.value = t('chat.mapEditSaved')
  } catch (error) {
    terrainEditSaveError.value = error instanceof Error ? error.message : String(error)
  } finally {
    terrainEditSaving.value = false
  }
}
// 状态卡数据由真实本地工作区接口提供；首发不携带演示面板。
const panels = computed(() => ({}))

// ── 状态联动（批7·2026-07-11）：真世界的状态栏真值——挂世界的任意会话读写都走世界级（批3 归属解析单点），
// 这里直接用当前 sessionId 拉，服务端按 resolveStatusPanelWorldScope 返回整个世界的模板+实例。
// 角色名解析用全局角色 store（世界可能横跨多个会话/不同成员名单，不能只信当前会话的成员单）；
// 临时实体只按当前会话取（临时实体本就是会话级过渡态，跨会话的临时实体宿主退化为原样 id 兜底，不阻断）。
const characterStore = useCharacterStore()
const characterOptions = computed<Array<{ id: string; name: string }>>(() => (characterStore.characters || [])
  .map((item) => ({ id: String((item as { id?: string })?.id || ''), name: String((item as { name?: string })?.name || (item as { id?: string })?.id || '') }))
  .filter((item) => item.id))
const realPanels = ref<ChatStatusPanel[]>([])
const realTemplates = ref<ChatStatusPanelTemplate[]>([])
const realTempEntities = ref<Array<{ id: string; name: string }>>([])

async function loadWorldStatusData(worldId: string) {
  if (!worldId || !normalizedSessionId.value) {
    realPanels.value = []
    realTemplates.value = []
    realTempEntities.value = []
    return
  }
  try {
    const [templateItems, panelBundle, entityItems] = await Promise.all([
      fetchStatusPanelTemplates(normalizedSessionId.value),
      fetchStatusPanelsBundle(normalizedSessionId.value),
      fetchSessionTemporaryEntities(normalizedSessionId.value).catch(() => [])
    ])
    realTemplates.value = templateItems
    realPanels.value = panelBundle.items
    realTempEntities.value = entityItems.map((entity) => ({ id: String(entity.id || ''), name: String(entity.name || entity.id || '') }))
  } catch {
    // 状态栏读取失败不阻断舆图本体：点锚点会落到「没有找到对应的状态栏」兜底文案
    realPanels.value = []
    realTemplates.value = []
    realTempEntities.value = []
  }
}

// 点击带锚点要素（真实世界）弹出的只读状态栏卡：MapCanvas 只上抛 links + 屏幕坐标，
// 具体解析成哪张状态栏、卡片怎么摆全在这里（联动能力：与 MapCanvas 的 open-status-panel 事件 payload 形状绑定）。
type StatusAnchor = { links: { panelId?: string; hostType?: string; hostId?: string }; x: number; y: number }
const statusAnchor = ref<StatusAnchor | null>(null)
const statusPopEl = ref<HTMLElement | null>(null)
const statusPopStyle = ref<Record<string, string>>({})
const mapBodyEl = ref<HTMLElement | null>(null)

function resolveAnchorPanel(links: StatusAnchor['links']): ChatStatusPanel | null {
  if (links.panelId) {
    const byId = realPanels.value.find((panel) => panel.id === links.panelId)
    if (byId) return byId
  }
  if (links.hostType && links.hostId) {
    return realPanels.value.find((panel) => panel.hostType === links.hostType && panel.hostId === links.hostId) || null
  }
  return null
}

const statusAnchorPanel = computed(() => (statusAnchor.value ? resolveAnchorPanel(statusAnchor.value.links) : null))
const statusAnchorTemplate = computed(() => realTemplates.value.find((tpl) => tpl.id === statusAnchorPanel.value?.templateId) || null)
const statusAnchorFields = computed(() => resolvePanelFields(statusAnchorPanel.value, statusAnchorTemplate.value))
const statusAnchorDraft = computed(() => (statusAnchorPanel.value ? buildPanelValueDraft(statusAnchorPanel.value, statusAnchorFields.value) : {}))
const statusAnchorKindMeta = computed(() => kindMetaOf(statusAnchorTemplate.value?.kind || ''))
const statusAnchorHostLabel = computed(() => (statusAnchorPanel.value
  ? hostLabelFor(statusAnchorPanel.value, { characterOptions: characterOptions.value, tempEntities: realTempEntities.value })
  : ''))
function statusAnchorPanelNameById(panelId: string) {
  return panelNameByIdFrom(realPanels.value, panelId)
}
function statusAnchorRefTintClass(refId: string) {
  return refTintClassFrom(realPanels.value, realTemplates.value, refId)
}
// 独立视图态（不与侧栏 ChatStatusSystemPanel 共享 gridView/expandedCell）：地图弹窗内的列宽/行高/展开态各玩各的。
const statusAnchorGridView = ref({ colW: 96, colWs: {} as Record<string, number>, nameW: {} as Record<string, number>, rowH: {} as Record<string, number> })
const statusAnchorExpandedCell = ref<string | null>(null)

function handleOpenStatusPanel(payload: StatusAnchor | null) {
  statusAnchor.value = payload
  // 草案模式下点击空白底图会走这条 null 信号（MapCanvas.handleTap 的 dismissPops）：顺带关掉剪影信息卡。
  if (!payload) sketchAnchor.value = null
}

function placeStatusPop() {
  if (!statusAnchor.value || !statusPopEl.value || !mapBodyEl.value) return
  const container = mapBodyEl.value.getBoundingClientRect()
  const w = statusPopEl.value.offsetWidth || 320
  const h = statusPopEl.value.offsetHeight || 160
  const { x: ax, y: ay } = statusAnchor.value
  const x = Math.min(Math.max(8, ax - w / 2), container.width - w - 8)
  let y = ay - h - 20
  if (y < 8) y = ay + 20
  y = Math.min(y, container.height - h - 8)
  statusPopStyle.value = { left: `${x}px`, top: `${y}px` }
}
watch(statusAnchor, (value) => { if (value) void nextTick(placeStatusPop) })
watch(statusAnchorPanel, () => { if (statusAnchor.value) void nextTick(placeStatusPop) })

// ── 草案剪影决策（地图草案剪影可视化计划批2）：纯前端预览层——选中集/三态标记/意见全在本弹窗本地状态，
// 不接确认通道、不接坞（批3 的活）。isDraftMode 由 draftSketches 是否非空决定，透传给 MapCanvas 驱动压灰。
// 自持审阅态优先级低于外部 host（XingyiDock 等三个现役消费方仍走 props）：只有外部没传时才落到
// 舆图师自己的 scope 状态（母计划批C调研第6点方案A——舆图师就跑在本组件内部，不需要跨组件通道）。
// effectiveDraftReviewItems 同时喂给 MapCanvas（画布渲染）与本组件内部逻辑，两处必须读同一份，
// 否则会出现"画布显示的候选"和"决策提交逻辑认的候选"不一致的分裂。
const effectiveDraftReviewItems = computed<MapDraftReviewItem[]>(() => props.draftReviewItems?.length
  ? props.draftReviewItems
  : (selfHostedDraftReview.value?.request.items || []))
const activeDraftItems = computed<MapDraftDisplayItem[]>(() => effectiveDraftReviewItems.value.length
  ? effectiveDraftReviewItems.value
  : (props.draftSketches || []))
const isFinalDraftReview = computed(() => Boolean(effectiveDraftReviewItems.value.length))
const isDraftMode = computed(() => activeDraftItems.value.length > 0)
const selectedSketchIds = ref<string[]>([])
// 三态标记：'accepted'/'rejected' 直接对应决策 JSON 的 accepted/rejected 数组；'commented' 只落 comments，
// 不进 accepted/rejected（与 huiyu-sketch-decision 协议的三分类语义对齐，见下方 submitSketchDecision）。
const sketchMarks = ref<Record<string, 'accepted' | 'rejected' | 'commented'>>({})
const sketchComments = ref<Record<string, string>>({})
const sketchNotes = ref<Record<string, string>>({})
const draftNote = ref('')
const actionBarOpen = ref(true)

type SketchAnchor = { id: string; x: number; y: number }
const sketchAnchor = ref<SketchAnchor | null>(null)
const sketchAnchorItem = computed<MapDraftDisplayItem | null>(() => {
  if (!sketchAnchor.value) return null
  return activeDraftItems.value.find((item) => item.id === sketchAnchor.value!.id) || null
})
const sketchPopEl = ref<HTMLElement | null>(null)
const sketchPopStyle = ref<Record<string, string>>({})
// 锚定卡自动带格号（批4）：取 sketch.center，无 center 则退 points 首点；网格未开启/无可用锚点时空串（不渲染该行）。
const sketchAnchorGridRef = computed(() => {
  const spec = sketchAnchorGridSpec.value
  const item = sketchAnchorItem.value
  if (!spec || !item) return ''
  const sk = item.sketch || {}
  const anchor = Array.isArray(sk.center) ? sk.center : (Array.isArray(sk.points) && sk.points.length ? sk.points[0] : null)
  if (!anchor) return ''
  return formatMapGridRef(anchor[0], anchor[1], spec)
})

const hasReadyItems = computed(() => activeDraftItems.value.some((item) => item.confidence === 'ready'))
const hasAnyMark = computed(() => isFinalDraftReview.value
  ? activeDraftItems.value.length > 0 && activeDraftItems.value.every((item) => Boolean(sketchMarks.value[item.id]))
  : Object.keys(sketchMarks.value).length > 0)
// 提交按钮计数文案（真机返工批A）：采纳/弃用/意见三档各自数量，驱动 MapDraftActionBar 的
// 「提交决策（采纳3·弃用1·意见2）」文案。
const acceptedCount = computed(() => Object.values(sketchMarks.value).filter((m) => m === 'accepted').length)
const rejectedCount = computed(() => Object.values(sketchMarks.value).filter((m) => m === 'rejected').length)
const commentedCount = computed(() => Object.values(sketchMarks.value).filter((m) => m === 'commented').length)
// 已决策清单"挂起区"（真机返工批A：用户点名要的功能）：按 draftSketches 原始顺序，拼出已标记项的展示数据；
// 未标记项不进清单。纯派生态，不额外持有真值（改意见/撤销都直接改 sketchMarks/sketchComments）。
const decidedSketchItems = computed<Array<{ id: string; label: string; confidence: MapDraftDisplayItem['confidence']; mark: 'accepted' | 'rejected' | 'commented'; comment?: string }>>(() => {
  const list: Array<{ id: string; label: string; confidence: MapDraftDisplayItem['confidence']; mark: 'accepted' | 'rejected' | 'commented'; comment?: string }> = []
  for (const item of activeDraftItems.value) {
    const mark = sketchMarks.value[item.id]
    if (!mark) continue
    list.push({
      id: item.id,
      label: item.label,
      confidence: item.confidence,
      mark,
      comment: mark === 'commented' ? sketchComments.value[item.id] : sketchNotes.value[item.id]
    })
  }
  return list
})
// "点击行=地图选中并居中该剪影"（真机返工批A）：{id,nonce} 结构——同一 id 连续两次点击也要能再次居中，
// 纯 id 值不变时 MapCanvas 的 watch(() => props.focusSketch, ...) 不会重新触发。
const focusSketchRequest = ref<{ id: string; nonce: number } | null>(null)
let focusSketchNonce = 0
function focusAndSelectSketch(id: string) {
  selectedSketchIds.value = [id]
  sketchAnchor.value = null // 旧锚定卡坐标是点击当时的屏幕坐标，居中后已过期，直接收起避免错位
  focusSketchNonce += 1
  focusSketchRequest.value = { id, nonce: focusSketchNonce }
}
function handleSelectDecided(id: string) {
  focusAndSelectSketch(id)
}
/** 改意见（真机返工批A）：与 handleSketchComment 同一套三态互斥语义——写入 comments 且标记转 'commented'，
 *  哪怕原本是 accepted/rejected 也会被覆盖（"改意见"就是把决策换成"带意见"，触发绘舆修订轮）。 */
function handleEditDecidedComment(payload: { id: string; text: string }) {
  if (isFinalDraftReview.value && sketchMarks.value[payload.id] !== 'commented') {
    sketchNotes.value = { ...sketchNotes.value, [payload.id]: payload.text }
    return
  }
  sketchComments.value = { ...sketchComments.value, [payload.id]: payload.text }
  sketchMarks.value = { ...sketchMarks.value, [payload.id]: 'commented' }
}
/** 撤销（真机返工批A）：清掉该项的标记与意见，回到未决态——可以重新点选再决策。 */
function handleRevokeDecided(id: string) {
  const nextMarks = { ...sketchMarks.value }
  const nextComments = { ...sketchComments.value }
  const nextNotes = { ...sketchNotes.value }
  delete nextMarks[id]
  delete nextComments[id]
  delete nextNotes[id]
  sketchMarks.value = nextMarks
  sketchComments.value = nextComments
  sketchNotes.value = nextNotes
}
/** Shift+框选命中的剪影 id 集合（真机返工批A）：并入既有选中集（"加入选中"语义，不替换）。 */
function handleSketchBoxSelect(payload: { ids: string[] }) {
  if (!payload.ids.length) return
  const set = new Set(selectedSketchIds.value)
  for (const id of payload.ids) set.add(id)
  selectedSketchIds.value = Array.from(set)
}

function categoryLabel(category: string): string {
  const key = 'chat.mapCat' + category.charAt(0).toUpperCase() + category.slice(1)
  return te(key) ? t(key) : category
}
function actionLabel(action: MapDraftDisplayItem['action']): string {
  if (action === 'add') return t('chat.mapDraftActionAdd')
  if (action === 'modify') return t('chat.mapDraftActionModify')
  if (action === 'delete') return t('chat.mapDraftActionDelete')
  return action
}

function resetDraftDecisionState() {
  selectedSketchIds.value = []
  sketchMarks.value = {}
  sketchComments.value = {}
  sketchNotes.value = {}
  draftNote.value = ''
  sketchAnchor.value = null
  actionBarOpen.value = true
  focusSketchRequest.value = null
}
// 换一批剪影（新草案轮/修订轮）：旧选中集与标记对新一批 id 大概率不再对应，整体清空重来。
watch([() => props.draftSketches, () => props.draftReviewItems], resetDraftDecisionState, { deep: true })
// 自持审阅路径（舆图师跑在本组件内部）不经 props：每次 reviewDraft 都会换一个新的
// pendingMapDraftReview 对象，按对象引用触发同一份清空，否则二轮评审会残留一轮的标记/意见。
watch(selfHostedDraftReview, (next, prev) => {
  if (next && next !== prev) resetDraftDecisionState()
})

/** 剪影点击（批2）：普通点击单选替换，Shift/Ctrl 切换多选；信息卡随点击坐标弹出，再点同一项关闭。 */
function handleSketchClick(payload: { id: string; shiftKey: boolean; ctrlKey: boolean; clientX: number; clientY: number }) {
  const { id, shiftKey, ctrlKey, clientX, clientY } = payload
  if (shiftKey || ctrlKey) {
    const set = new Set(selectedSketchIds.value)
    if (set.has(id)) set.delete(id); else set.add(id)
    selectedSketchIds.value = Array.from(set)
  } else {
    selectedSketchIds.value = [id]
  }
  sketchAnchor.value = (sketchAnchor.value && sketchAnchor.value.id === id) ? null : { id, x: clientX, y: clientY }
}

function placeSketchPop() {
  if (!sketchAnchor.value || !sketchPopEl.value || !mapBodyEl.value) return
  // 钳制容器用 .map-viewer__canvas-wrap（与既有 statusPop 同一容器）：这是弹窗里舆图实际可视的区域，
  // 剪影本身也画在这个坐标系里，比钳到整个弹窗（含右侧历史侧栏）更贴合「不挡剪影本身」的要求。
  const container = mapBodyEl.value.getBoundingClientRect()
  const w = sketchPopEl.value.offsetWidth || 276
  const h = sketchPopEl.value.offsetHeight || 140
  const { x: ax, y: ay } = sketchAnchor.value
  let x = ax - container.left + 14
  if (x + w > container.width - 8) x = ax - container.left - w - 14 // 靠右边界翻左侧
  x = Math.max(8, Math.min(x, container.width - w - 8))
  let y = ay - container.top + 14
  if (y + h > container.height - 8) y = ay - container.top - h - 14 // 靠下边界翻上方
  y = Math.max(8, Math.min(y, container.height - h - 8))
  sketchPopStyle.value = { left: `${x}px`, top: `${y}px` }
}
watch(sketchAnchor, (value) => { if (value) void nextTick(placeSketchPop) })

/** 采纳/弃用切换（批2）：选中集若已全部是该标记，视为「再点取消」；否则统一设为该标记（覆盖旧标记，
 *  同时清掉可能残留的 comment——三态互斥，避免决策 JSON 里 accepted 和 comments 出现同一 id）。 */
function toggleMark(mark: 'accepted' | 'rejected') {
  if (!selectedSketchIds.value.length) return
  const allAlready = selectedSketchIds.value.every((id) => sketchMarks.value[id] === mark)
  const nextMarks = { ...sketchMarks.value }
  const nextComments = { ...sketchComments.value }
  const nextNotes = { ...sketchNotes.value }
  for (const id of selectedSketchIds.value) {
    if (allAlready) {
      delete nextMarks[id]
      delete nextNotes[id]
    } else {
      nextMarks[id] = mark
      delete nextComments[id]
      delete nextNotes[id]
    }
  }
  sketchMarks.value = nextMarks
  sketchComments.value = nextComments
  sketchNotes.value = nextNotes
}

function acceptAllReady() {
  const nextMarks = { ...sketchMarks.value }
  const nextComments = { ...sketchComments.value }
  const nextNotes = { ...sketchNotes.value }
  for (const item of activeDraftItems.value) {
    if (item.confidence !== 'ready') continue
    nextMarks[item.id] = 'accepted'
    delete nextComments[item.id]
    delete nextNotes[item.id]
  }
  sketchMarks.value = nextMarks
  sketchComments.value = nextComments
  sketchNotes.value = nextNotes
}

/** 对当前选中项批注（批2）：写入 comments 且标记记为 'commented'——触发绘舆修订轮，只重出这些项。 */
function handleSketchComment(text: string) {
  if (!selectedSketchIds.value.length) return
  const nextComments = { ...sketchComments.value }
  const nextMarks = { ...sketchMarks.value }
  const nextNotes = { ...sketchNotes.value }
  for (const id of selectedSketchIds.value) {
    nextComments[id] = text
    nextMarks[id] = 'commented'
    delete nextNotes[id]
  }
  sketchComments.value = nextComments
  sketchMarks.value = nextMarks
  sketchNotes.value = nextNotes
}

function submitSketchDecision() {
  const accepted: string[] = []
  const rejected: string[] = []
  for (const [id, mark] of Object.entries(sketchMarks.value)) {
    if (mark === 'accepted') accepted.push(id)
    else if (mark === 'rejected') rejected.push(id)
    // 'commented' 不进 accepted/rejected，只落在 comments（已在 handleSketchComment 里写入）
  }
  const note = draftNote.value.trim()
  if (isFinalDraftReview.value) {
    const decision: MapDraftReviewDecision = {
      confirmed: accepted,
      modified: Object.entries(sketchMarks.value).filter(([, mark]) => mark === 'commented').map(([id]) => id),
      deleted: rejected,
      comments: { ...sketchComments.value },
      notes: { ...sketchNotes.value },
      note: note || undefined
    }
    // 自持审阅（舆图师就跑在本组件内部）：直接 resolve 同一份 scope 状态的 Promise，不走 emit——
    // 没有外部 host 在监听这个 emit。外部 host（XingyiDock 等）驱动的审阅仍走 emit 原路径。
    if (selfHostedDraftReview.value) {
      selfHostedDraftReview.value.resolve({ status: 'submitted', decision })
      // 提交即本轮评审终结：立刻清空决策状态，防止下一轮（尤其复用同 draft id 时）继承本轮标记。
      resetDraftDecisionState()
      return
    }
    emit('draft-review-decision', decision)
  } else {
    emit('sketch-decision', {
      kind: 'huiyu-sketch-decision',
      accepted,
      rejected,
      comments: { ...sketchComments.value },
      note: note || undefined
    })
  }
}

async function loadWorldMap(worldId: string) {
  statusAnchor.value = null
  if (!worldId) {
    mapBundle.value = null
    mapError.value = ''
    return
  }
  // 跨世界旧 bundle 必须先清（症状A 同族路径）：否则新数据到位前 hasMapSheet 仍为 true，
  // 画布会以新 key 挂载并用旧世界 sheet 建景，而 MapCanvas 不 watch world 不会自愈。
  // 同世界重复加载不清空（保留同世界重开秒显的既有体验）。
  if (mapBundle.value && String(mapBundle.value.world?.id || '') !== worldId) {
    mapBundle.value = null
  }
  mapLoading.value = true
  mapError.value = ''
  try {
    mapBundle.value = await fetchWorldMapBundle(worldId)
  } catch (err) {
    mapBundle.value = null
    mapError.value = err instanceof Error ? err.message : String(err)
  } finally {
    mapLoading.value = false
  }
}

// ── 舆图实时刷新（2026-07-12）：绘舆子agent 落笔即时写服务端 DB，弹窗开着时应立刻看见新内容——
// 静默刷新与 loadWorldMap 的区别：不翻转 mapLoading/mapError（保留旧画面直到新数据到位，失败也不打断），
// 落笔常连发所以带尾沿防抖；appliedMapRev 记录"已应用到画面的版本"，写进 mapCanvasKey 触发 MapCanvas 重挂。
const appliedMapRev = ref(0)
let silentRefreshTimer: ReturnType<typeof setTimeout> | null = null
let silentRefreshSeq = 0

async function silentRefreshWorldMap(worldId: string) {
  if (!worldId) return
  const seq = ++silentRefreshSeq
  // 历史面板搭同一班防抖顺带刷新（批L）：绘舆每落一笔 revision bump，历史自然跟着新
  void loadMapHistory(worldId)
  try {
    const bundle = await fetchWorldMapBundle(worldId)
    if (seq !== silentRefreshSeq) return // 过期响应（其间又排了更晚一次静默刷新）丢弃
    if (worldId !== sessionWorldId.value) return // 拉取期间世界已切走，交由 loadWorldMap 正常流程接管
    mapBundle.value = bundle
    appliedMapRev.value = worldMapRevision.value.rev
  } catch {
    // 静默失败不打断当前画面、不写 mapError；下次写入或手动重开弹窗会自然纠正
  }
}

watch(worldMapRevision, (value) => {
  if (!props.open) return
  if (!sessionWorldId.value) return // 未挂世界时没有真图可拉
  if (value.worldId && value.worldId !== sessionWorldId.value) return // 明确是别的世界的写，不相关
  // 人工编辑草稿基于点选时的要素快照。其间若有另一条地图写链落库，继续保存会用旧 meta/geometry 覆盖新真值；
  // 保守失效本地草稿并要求重选。当前编辑自己的保存期间 terrainEditSaving=true，不触发这条并发保护。
  if (editMode.value && terrainEditSession.value && !terrainEditSaving.value) {
    resetTerrainEditState()
    terrainEditSelectionMessage.value = t('chat.mapEditStale')
  }
  if (silentRefreshTimer) clearTimeout(silentRefreshTimer)
  silentRefreshTimer = setTimeout(() => {
    silentRefreshTimer = null
    if (!props.open || !sessionWorldId.value) return
    void silentRefreshWorldMap(sessionWorldId.value)
  }, 800)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncXingyiDockEmbedBreakpoint)
  if (silentRefreshTimer) {
    clearTimeout(silentRefreshTimer)
    silentRefreshTimer = null
  }
  if (dotMatrixCopiedTimer) {
    clearTimeout(dotMatrixCopiedTimer)
    dotMatrixCopiedTimer = null
  }
})

const view = ref<'terrain' | 'civic'>('terrain')
const statusOn = ref(false)

// ── 网格坐标系开关（地图草案剪影可视化计划批4）：本地记忆（跨会话/跨世界通用，不按世界分 key——
// 这是纯视图偏好，同 langhuan_dark_mode 等全局 UI 开关同一惯例）。
const MAP_GRID_STORAGE_KEY = 'langhuan_map_grid_on'
function loadGridOnPref(): boolean {
  try { return window.localStorage.getItem(MAP_GRID_STORAGE_KEY) === '1' } catch { return false }
}
const gridOn = ref(loadGridOnPref())
watch(gridOn, (value) => {
  try { window.localStorage.setItem(MAP_GRID_STORAGE_KEY, value ? '1' : '0') } catch { /* 隐私模式等存储不可用时静默忽略 */ }
})
// 网格数据可得时才有格号可算（bounds 来源与 MapCanvas 内部 fitAll 同一类内容工作框）；
// 剪影锚定卡自动带一行格号消费同一份 spec，两处不各写一套换算。
const sketchAnchorGridSpec = computed(() => (gridOn.value ? computeMapGridSpec(activeMapTaskFrame.value) : null))

// ── 点阵投影调试面板（装甲地图系统计划批A1 附属工具·2026-07-13）：山脉等装甲地形谓词的人工验货台——
// 直接消费 activeSheet 的矢量内容工作框与障碍物，不额外拉数据；生成是同步纯函数调用。
// 点阵与历史/网格共享 activeToolPanel，结构上保证右侧只展开一块面板。
// 目前唯一选项 'mountain'；每加一种装甲地形谓词，在联合类型与下方 generateDotMatrix 的 switch 分支各加一条。
const dotMatrixTerrain = ref<'mountain'>('mountain')
const dotMatrixGridN = ref<41 | 61 | 81>(41)
const dotMatrixResult = ref<DotMatrixProjection | null>(null)
const dotMatrixError = ref('')
const dotMatrixCopied = ref(false)
let dotMatrixCopiedTimer: ReturnType<typeof setTimeout> | null = null

const showDotMatrixPanel = computed(() => activeToolPanel.value === 'dotmatrix' && Boolean(sessionWorldId.value))

function toggleDotMatrixPanel() {
  if (isSampleWorld.value) return
  openToolPanel('dotmatrix')
}
function toggleHistoryPanel() {
  if (!showHistoryPanel.value) return
  openToolPanel('history')
}
function toggleGridPanel() {
  openToolPanel('grid')
}
// 未挂世界了（如解绑）就没有真数据可看，强制关闭；切世界时旧结果对不上新世界，一并清空避免误导。
watch(isSampleWorld, (value) => {
  if (value && (activeToolPanel.value === 'history' || activeToolPanel.value === 'dotmatrix')) activeToolPanel.value = null
})
watch(sessionWorldId, () => {
  dotMatrixResult.value = null
  dotMatrixError.value = ''
  resetTerrainEditState()
  if (activeToolPanel.value === 'edit') activeToolPanel.value = null
})

/** 生成点阵投影：直接从活动 sheet 抽取当前已绘制内容的工作框 + 水域/山体障碍物。
 *  工作框由 geometry 内容 bbox 派生，空图使用 100km 初始观察窗；explored 不再参与范围或合法性判断。 */
function generateDotMatrix() {
  dotMatrixError.value = ''
  dotMatrixResult.value = null
  const sheet = activeSheet.value
  const features = sheet?.features || []
  const waterRegions = features.filter((f) => f.kind === 'region' && f.category === 'water').map((f) => f.geometry.pts as MapPoint[])
  const mountainRegions = features.filter((f) => f.kind === 'region' && f.category === 'mountain').map((f) => f.geometry.pts as MapPoint[])
  try {
    if (dotMatrixTerrain.value === 'mountain') {
      dotMatrixResult.value = buildMountainDotMatrix({ framePts: activeMapTaskFrame.value.pts, waterRegions, mountainRegions, gridN: dotMatrixGridN.value })
    }
  } catch {
    dotMatrixError.value = t('chat.mapDotMatrixEmptyHint')
  }
}

// 可画/禁区格数与占比：从 legal 矩阵现算，不额外存一份计数真值（legal 已是权威结果）。
const dotMatrixStats = computed(() => {
  const result = dotMatrixResult.value
  if (!result) return null
  let legal = 0
  let total = 0
  for (const row of result.legal) {
    total += row.length
    for (const cell of row) { if (cell) legal += 1 }
  }
  return {
    legal,
    illegal: total - legal,
    pct: total ? ((legal / total) * 100).toFixed(1) : '0.0',
    cell: (result.spec.cellM / 1000).toFixed(1)
  }
})

async function copyDotMatrixText() {
  if (!dotMatrixResult.value) return
  try {
    await navigator.clipboard.writeText(dotMatrixResult.value.text)
    dotMatrixCopied.value = true
    if (dotMatrixCopiedTimer) clearTimeout(dotMatrixCopiedTimer)
    dotMatrixCopiedTimer = setTimeout(() => { dotMatrixCopied.value = false }, 1500)
  } catch {
    // 剪贴板不可用（如非安全上下文）时静默失败，不打断面板
  }
}

// ── 世界选择器（地图系统批2）：弹窗自治拉真值——打开时并行取世界列表 + 会话 worldId（limit:1 轻 bundle），
// 挂接/解绑走唯一入口 POST /chat-sessions/:id/world；父级 viewModel 不透传世界真值，避免陈旧态
const worlds = ref<World[]>([])
const worldsLoading = ref(false)
// sessionWorldId 声明已提前到文件顶部（见上方 TDZ 说明），此处不再重复声明。
const worldPickerOpen = ref(false)
const newWorldName = ref('')
const worldBusy = ref(false)
const worldError = ref('')

const normalizedSessionId = computed(() => String(props.sessionId || '').trim())
const currentWorld = computed(() => worlds.value.find((item) => item.id === sessionWorldId.value) || null)
const worldTitle = computed(() => currentWorld.value?.name || t('chat.mapWorldNone'))

watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    worldPickerOpen.value = false
    compareGroupId.value = '' // 批L：关弹窗退出对照模式（历史列表保留，下次打开会重新拉取覆盖）
    activeToolPanel.value = null // 工具侧栏不跨弹窗开合记忆
    resetTerrainEditState()
    resetDraftDecisionState() // 批2：关弹窗清空草案决策本地状态（选中/标记/意见不跨开合残留）
    dotMatrixResult.value = null
    dotMatrixError.value = ''
    return
  }
  void loadWorldState()
}, { immediate: true })

async function loadWorldState() {
  worldsLoading.value = true
  worldStateLoading.value = true
  worldError.value = ''
  try {
    const [worldList, bundle] = await Promise.all([
      fetchWorlds(),
      normalizedSessionId.value
        ? fetchChatSessionBundleById(normalizedSessionId.value, { limit: 1 })
        : Promise.resolve(null)
    ])
    worlds.value = worldList
    const session = (bundle as { session?: Record<string, unknown> } | null)?.session
    const resolvedWorldId = String(session?.worldId ?? session?.world_id ?? '').trim()
    // worldId prop 兜底（星依世界寻址批·2026-07-13）：无 sessionId、或会话没挂世界时才生效——
    // 典型场景=星依 world 直达派发的草案确认卡（worldSessionId 传星依浮坞自身会话，查不到目标世界）。
    // 必须命中 fetchWorlds 真实返回的世界才采用（防脏 id 把弹窗带进不存在的世界）。
    const fallbackWorldId = String(props.worldId || '').trim()
    sessionWorldId.value = resolvedWorldId
      || (fallbackWorldId && worldList.some((item) => item.id === fallbackWorldId) ? fallbackWorldId : '')
    void loadWorldMap(sessionWorldId.value)
    void loadWorldStatusData(sessionWorldId.value)
    void loadMapHistory(sessionWorldId.value) // 批L：打开弹窗惰性拉取历史
  } catch (err) {
    worldError.value = err instanceof Error ? err.message : String(err)
  } finally {
    worldsLoading.value = false
    worldStateLoading.value = false
  }
}

async function handleCreateInitialSheet() {
  const worldId = sessionWorldId.value
  if (!worldId || hasMapSheet.value || initialSheetBusy.value) return
  initialSheetBusy.value = true
  initialSheetError.value = ''
  try {
    await createInitialWorldMapSheet({ worldId, name: t('chat.mapFirstSheetName') })
    await loadWorldMap(worldId)
    worlds.value = await fetchWorlds()
  } catch (err) {
    initialSheetError.value = err instanceof Error ? err.message : String(err)
  } finally {
    initialSheetBusy.value = false
  }
}

function toggleWorldPicker() {
  worldPickerOpen.value = !worldPickerOpen.value
  if (worldPickerOpen.value) worldError.value = ''
}

async function applyWorldAction(
  payload: { worldId?: string; name?: string; detach?: boolean },
  options: { closeOnSuccess?: boolean } = {}
) {
  if (!normalizedSessionId.value || worldBusy.value) return
  worldBusy.value = true
  worldError.value = ''
  try {
    const attached = await attachSessionWorld(normalizedSessionId.value, payload)
    applyChatSessionWorldReadModel(chatStore, attached.session)
    sessionWorldId.value = String(attached.world?.id || '')
    newWorldName.value = ''
    if (options.closeOnSuccess) worldPickerOpen.value = false
    compareGroupId.value = '' // 批L：切换/解绑世界必退出对照模式（旧世界的变更集对新世界无意义）
    void loadWorldMap(sessionWorldId.value)
    void loadWorldStatusData(sessionWorldId.value)
    void loadMapHistory(sessionWorldId.value)
    worlds.value = await fetchWorlds()
  } catch (err) {
    worldError.value = err instanceof Error ? err.message : String(err)
  } finally {
    worldBusy.value = false
  }
}

function handlePickWorld(item: World) {
  if (item.id === sessionWorldId.value) return
  void applyWorldAction({ worldId: item.id }, { closeOnSuccess: true })
}

function handleCreateWorld() {
  const name = newWorldName.value.trim()
  if (!name) return
  void applyWorldAction({ name }, { closeOnSuccess: true })
}

function handleDetachWorld() {
  void applyWorldAction({ detach: true })
}

function handleOverlayClose(event: MouseEvent) {
  if (!overlayDismissGuard.shouldDismissFromOverlayClick(event)) return
  emit('close')
}
</script>

<style scoped>
.map-viewer__overlay {
  position: fixed;
  inset: 0;
  /* 专用全屏地图工作区不套普通表单弹窗壳，但必须服从全局模态层级，覆盖星依浮坞（12900）。 */
  z-index: 13000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background: rgba(72, 68, 63, 0.18);
  backdrop-filter: blur(6px);
}

.map-viewer {
  width: min(1760px, calc(100vw - 28px));
  height: min(960px, calc(100vh - 28px));
  display: flex;
  flex-direction: column;
  background: #f3f2ef;
  border: 1px solid rgba(219, 215, 207, 0.9);
  border-radius: 22px;
  box-shadow: 0 22px 56px rgba(72, 58, 47, 0.12);
  overflow: hidden;
  animation: map-viewer-in 0.22s ease;
}

@keyframes map-viewer-in {
  from { opacity: 0; transform: scale(0.985); }
  to { opacity: 1; transform: scale(1); }
}

.map-viewer__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 18px;
  height: 52px;
  padding: 0 10px 0 20px;
  border-bottom: 1px solid rgba(139, 115, 85, 0.12);
  /* 头部恒在身体之上（世界弹层遮挡修）：header/body 各成独立层叠上下文、header 更高，
     这样世界选择器弹层（在 header 内）永远压过身体里的嵌入星依栏——后者的 FloatingWorkspaceWindow
     embedded 仍残留基类 z-index:96，若不做上下文隔离会把只有 z-index:6 的弹层盖住。 */
  position: relative;
  z-index: 2;
}

.map-viewer__title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.map-viewer__licon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-viewer__licon--brand {
  color: #5C8A5C;
}

.map-viewer__title strong {
  font-size: 1.02rem;
  font-weight: 600;
  color: #4f463f;
  letter-spacing: 0.02em;
}

.map-viewer__agent-expand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-accent) 10%, transparent);
  color: var(--morandi-accent);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.map-viewer__agent-expand:hover,
.map-viewer__agent-expand:focus-visible {
  background: color-mix(in srgb, var(--morandi-accent) 16%, transparent);
  outline: 0;
}

.map-viewer__agent-expand .map-viewer__licon {
  width: 16px;
  height: 16px;
}

.map-viewer__world {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 2px;
  padding: 4px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  font-size: 0.82rem;
  color: #787064;
  cursor: pointer;
  transition: background 0.16s ease;
}

.map-viewer__world:hover {
  background: #F3EEE6;
}

.map-viewer__world:disabled {
  cursor: default;
  opacity: 0.55;
}

.map-viewer__world .map-viewer__licon {
  width: 13px;
  height: 13px;
  opacity: 0.7;
}

.map-viewer__world-wrap {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

/* 未挂世界：琥珀提示态（引导用户点开选择器一键创建/选择） */
.map-viewer__world--none {
  color: #9a6b2f;
}

.map-viewer__world-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #D9A05B;
  flex: 0 0 auto;
}

.map-viewer__world-mask {
  position: fixed;
  inset: 0;
  z-index: 5;
}

.map-viewer__world-pop {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 6;
  width: 292px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--morandi-card);
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(72, 58, 47, 0.16);
}

.map-viewer__world-desc {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--morandi-text-light);
}

.map-viewer__world-guide {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(217, 160, 91, 0.12);
  border: 1px solid rgba(217, 160, 91, 0.32);
  font-size: 0.78rem;
  line-height: 1.5;
  color: #9a6b2f;
}

.map-viewer__world-note {
  margin: 0;
  padding: 4px 2px;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.map-viewer__world-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 230px;
  overflow-y: auto;
}

.map-viewer__world-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 0.84rem;
  color: #5f574d;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease;
}

.map-viewer__world-item:hover {
  background: #F3EEE6;
}

.map-viewer__world-item.on {
  background: rgba(92, 138, 92, 0.1);
  color: #47704a;
  font-weight: 600;
}

.map-viewer__world-item:disabled {
  cursor: default;
  opacity: 0.6;
}

.map-viewer__world-item-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-viewer__world-item-meta {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.map-viewer__world-item.on .map-viewer__world-item-meta {
  color: #6f8f70;
}

.map-viewer__world-item .map-viewer__licon {
  width: 13px;
  height: 13px;
}

.map-viewer__world-create {
  display: flex;
  gap: 6px;
  padding-top: 9px;
  border-top: 1px solid rgba(139, 115, 85, 0.1);
}

.map-viewer__world-create input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg);
  font-size: 0.82rem;
  color: #4f463f;
}

.map-viewer__world-create input:focus {
  outline: none;
  border-color: #5C8A5C;
}

.map-viewer__world-create button {
  flex: 0 0 auto;
  padding: 6px 11px;
  border: 0;
  border-radius: 8px;
  background: #5C8A5C;
  color: #FFFDF8;
  font-size: 0.8rem;
  cursor: pointer;
  transition: opacity 0.14s ease;
}

.map-viewer__world-create button:hover {
  opacity: 0.9;
}

.map-viewer__world-create button:disabled {
  cursor: default;
  opacity: 0.45;
}

.map-viewer__world-error {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.4;
  color: #b3542e;
}

.map-viewer__world-detach {
  align-self: flex-start;
  padding: 2px 2px;
  border: 0;
  background: none;
  font-size: 0.74rem;
  color: var(--morandi-text-light);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.map-viewer__world-detach:hover {
  color: #9a6b2f;
}

.map-viewer__world-detach:disabled {
  cursor: default;
  opacity: 0.5;
}

.map-viewer__spacer {
  flex: 1 1 auto;
}

.map-viewer__views {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 100%;
}

.map-viewer__view-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  background: none;
  border: 0;
  font-size: 0.86rem;
  color: #8a8177;
  cursor: pointer;
  transition: color 0.16s ease;
}

.map-viewer__view-tab:hover {
  color: #5f574d;
}

.map-viewer__view-tab:disabled {
  opacity: 0.4;
  cursor: default;
}

.map-viewer__view-tab.on {
  color: #4f463f;
  font-weight: 600;
}

.map-viewer__view-tab.on::after {
  content: '';
  position: absolute;
  left: 13px;
  right: 13px;
  bottom: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #5C8A5C;
}

.map-viewer__view-tab .map-viewer__licon {
  width: 15px;
  height: 15px;
}

.map-viewer__status-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-left: 4px;
  padding: 5px 10px;
  align-self: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.84rem;
  color: #8a8177;
  cursor: pointer;
  transition: all 0.16s ease;
}

.map-viewer__status-toggle:hover {
  background: #F3EEE6;
}

.map-viewer__status-toggle.on {
  color: #47704a;
  background: rgba(92, 138, 92, 0.1);
}

.map-viewer__status-toggle .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #C9C2B6;
  transition: background 0.16s ease;
}

.map-viewer__status-toggle.on .dot {
  background: #5C8A5C;
}

.map-viewer__status-toggle .map-viewer__licon {
  width: 15px;
  height: 15px;
}

.map-viewer__close {
  width: 34px;
  height: 34px;
  margin-right: 6px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: #8a8177;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.16s ease;
}

.map-viewer__close:hover {
  background: #F3EEE6;
  color: #4f463f;
}

.map-viewer__body {
  display: flex;
  flex-direction: row;
  flex: 1 1 auto;
  min-height: 0;
  /* 与 .map-viewer__head 配对（世界弹层遮挡修）：身体自成层叠上下文且层级低于 header，
     把嵌入星依栏内部所有 z-index（含 embedded 窗残留的 96）关在本上下文内，不再摊平到 overlay 根去和世界弹层抢层级。 */
  position: relative;
  z-index: 1;
}

.map-viewer__xingyi-column {
  flex: 0 0 clamp(320px, 24vw, 410px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--morandi-border);
  background: var(--langhuan-dialog-surface);
}

.map-viewer__xingyi-column--collapsed {
  width: 0;
  min-width: 0;
  flex-basis: 0;
  border-right: 0;
}

.map-viewer__xingyi-host {
  width: 100%;
  height: 100%;
}

/* 星依对话框拖拽调宽（与剧本工作台同款）：独立 flex 分栏，不嵌在星依栏内部，
   不会被 overflow:hidden 裁切，也不会被星依浮坞内部内容盖住。 */
.map-viewer__xingyi-resize {
  flex: 0 0 auto;
  position: relative;
  z-index: 5;
  width: 7px;
  margin: 0 -4px;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.map-viewer__xingyi-resize:hover {
  background: var(--morandi-soft-bg, rgba(0, 0, 0, 0.05));
}

.map-viewer__map-workspace {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

/* 内容行（批L）：画布 + 历史侧栏并排 */
.map-viewer__content {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  min-width: 0;
}

/* 画布容器：承载 MapCanvas 及其绝对定位子元素（状态弹卡/三态卡）的坐标系。 */
.map-viewer__canvas-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

/* 历史侧栏（批L 地图版本历史）：细线分组的右侧窄栏，可收成 36px 竖条 */
.map-viewer__history {
  flex: 0 0 auto;
  width: 280px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--langhuan-dialog-surface);
  border-left: 1px solid var(--morandi-border);
}

.map-viewer__history-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 8px 8px 10px;
  border-bottom: 1px solid rgba(139, 115, 85, 0.1);
}

.map-viewer__history-head > b {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--morandi-text);
}

.map-viewer__history-exit {
  flex: 0 0 auto;
  padding: 3px 9px;
  border: 1px solid rgba(192, 102, 90, 0.4);
  border-radius: 999px;
  background: rgba(192, 102, 90, 0.08);
  font-size: 0.74rem;
  color: #b3542e;
  cursor: pointer;
  transition: background 0.14s ease;
}

.map-viewer__history-exit:hover {
  background: rgba(192, 102, 90, 0.16);
}

.map-viewer__history-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.map-viewer__history-note {
  margin: 0;
  padding: 10px 8px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--morandi-text-light);
}

.map-viewer__history-note--error {
  color: #b3542e;
}

.map-viewer__history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.map-viewer__history-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.map-viewer__history-item:hover {
  background: #F3EEE6;
}

.map-viewer__history-item.on {
  background: rgba(92, 138, 92, 0.1);
  border-color: rgba(92, 138, 92, 0.35);
}

.map-viewer__history-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.map-viewer__history-item-time {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.map-viewer__history-item-counts {
  display: inline-flex;
  gap: 6px;
  font-size: 0.74rem;
  font-weight: 600;
}

.map-viewer__history-item-counts em {
  font-style: normal;
}

.map-viewer__history-item-counts .c-add { color: #3E7D4E; }
.map-viewer__history-item-counts .c-upd { color: #C4863B; }
.map-viewer__history-item-counts .c-del { color: #C0665A; }

.map-viewer__history-item-label {
  font-size: 0.82rem;
  line-height: 1.4;
  color: #5f574d;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.map-viewer__history-item.on .map-viewer__history-item-label {
  color: #47704a;
  font-weight: 600;
}

/* 点阵投影调试面板（装甲地图系统计划批A1 附属工具·2026-07-13）：与右侧历史面板同一路数的窄栏容器，
   但走 var(--morandi-*)/--langhuan-dialog-* token（不写死浅色），跟随全局夜间模式——历史面板本身
   尚未接入夜间 token（属于此前遗留），不在本批顺带改造它，只保证这块新面板自己不留浅色债。 */
.map-viewer__dotmatrix {
  flex: 0 0 auto;
  width: 340px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--langhuan-dialog-surface);
  border-left: 1px solid var(--morandi-border);
}

.map-viewer__tool-panel {
  flex: 0 0 auto;
  width: 280px;
  min-height: 0;
  background: var(--langhuan-dialog-surface);
  border-left: 1px solid var(--morandi-border);
}

.map-viewer__tool-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 43px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--morandi-border);
}

.map-viewer__tool-panel-head b {
  font-size: 0.84rem;
  color: var(--morandi-text);
}

.map-viewer__panel-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.map-viewer__panel-close:hover {
  background: var(--morandi-hover);
}

.map-viewer__grid-panel-body {
  padding: 12px;
}

.map-viewer__grid-panel-body p {
  margin: 10px 0 0;
  font-size: 0.76rem;
  line-height: 1.55;
  color: var(--morandi-text-light);
}

.map-viewer__grid-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 4px;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  cursor: pointer;
}

.map-viewer__grid-switch-track {
  position: relative;
  width: 34px;
  height: 19px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-border) 84%, transparent);
  transition: background 0.16s ease;
}

.map-viewer__grid-switch-track i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.16s ease;
}

.map-viewer__grid-switch.on .map-viewer__grid-switch-track {
  background: #5C8A5C;
}

.map-viewer__grid-switch.on .map-viewer__grid-switch-track i {
  transform: translateX(15px);
}

.map-viewer__tool-rail {
  flex: 0 0 64px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 8px 5px;
  border-left: 1px solid var(--morandi-border);
  background: var(--langhuan-dialog-surface);
}

.map-viewer__tool-rail-btn,
.map-viewer__tool-rail-btn.map-viewer__status-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 50px;
  margin: 0;
  padding: 6px 2px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 0.68rem;
  line-height: 1.1;
  cursor: pointer;
}

.map-viewer__tool-rail-btn:hover {
  background: var(--morandi-hover);
}

.map-viewer__tool-rail-btn.on {
  color: #47704a;
  background: color-mix(in srgb, #5C8A5C 12%, transparent);
}

.map-viewer__tool-rail-btn:disabled {
  opacity: 0.36;
  cursor: default;
}

.map-viewer__tool-rail-btn .map-viewer__licon {
  width: 17px;
  height: 17px;
}

.map-viewer__dotmatrix-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--morandi-border);
}

.map-viewer__dotmatrix-head b {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--morandi-text);
}

.map-viewer__dotmatrix-close {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--morandi-text-light);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.14s ease;
}

.map-viewer__dotmatrix-close:hover {
  background: var(--morandi-hover);
}

.map-viewer__dotmatrix-close .map-viewer__licon {
  width: 14px;
  height: 14px;
}

.map-viewer__dotmatrix-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-viewer__dotmatrix-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.map-viewer__dotmatrix-field select {
  flex: 0 0 auto;
  padding: 4px 6px;
  border: 1px solid var(--morandi-border);
  border-radius: 6px;
  background: var(--langhuan-dialog-input-bg);
  color: var(--morandi-text);
  font-size: 0.8rem;
}

.map-viewer__dotmatrix-generate {
  padding: 6px 10px;
  border: 1px solid var(--morandi-accent);
  border-radius: 8px;
  background: rgba(92, 138, 92, 0.1);
  color: var(--morandi-accent);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.14s ease;
}

.map-viewer__dotmatrix-generate:hover {
  background: rgba(92, 138, 92, 0.18);
}

.map-viewer__dotmatrix-error {
  margin: 0;
  padding: 8px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--morandi-danger);
}

.map-viewer__dotmatrix-pre {
  margin: 0;
  padding: 8px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg);
  color: var(--morandi-text);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.68rem;
  line-height: 1.3;
  overflow-x: auto;
  white-space: pre;
}

.map-viewer__dotmatrix-stats {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--morandi-text-light);
}

.map-viewer__dotmatrix-copy {
  align-self: flex-start;
  padding: 5px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg);
  color: var(--morandi-text);
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.14s ease;
}

.map-viewer__dotmatrix-copy:hover {
  background: var(--morandi-hover);
}

/* 真实世界点带锚点要素弹出的只读状态栏卡（批7）：宽度比 MapCanvas 自带的样例弹卡（246px）更宽，
   容纳 StatusPanelCard 的固定格网格；readonly 模式下无加字段/加格等行，高度天然收窄。 */
.map-viewer__status-pop {
  position: absolute;
  z-index: 8;
  width: 320px;
  max-height: min(420px, calc(100% - 16px));
  overflow-y: auto;
  background: var(--morandi-card);
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(72, 58, 47, 0.16);
  animation: map-viewer-in 0.16s ease;
}

.map-viewer__status-pop-empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 0.84rem;
  color: var(--morandi-text-light);
}

/* 剪影锚定信息卡（地图草案剪影可视化计划批2）：轻量小卡，宽度小于状态栏卡（没有格网格，字段少）。
   真机返工批A：加宽 + 标题从单行省略号改允许换行（真机反馈长剪影名如「凯拉佩克斯山脉·底座（圆润化…）」
   被截断看不全），dot/meta 跟着从垂直居中改顶部对齐，配合多行标题。 */
.map-viewer__sketch-pop {
  position: absolute;
  z-index: 8;
  width: 276px;
  max-height: min(320px, calc(100% - 16px));
  overflow-y: auto;
  background: var(--morandi-card);
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(72, 58, 47, 0.16);
  animation: map-viewer-in 0.16s ease;
}

.map-viewer__sketch-pop header {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 10px 12px 6px;
}

.map-viewer__sketch-pop-dot {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.map-viewer__sketch-pop-dot.c-ready { background: #3E7D4E; }
.map-viewer__sketch-pop-dot.c-confirm { background: #C4863B; }
.map-viewer__sketch-pop-dot.c-risk { background: #C0665A; }

.map-viewer__sketch-pop header b {
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--morandi-text);
  flex: 1 1 auto;
  min-width: 0;
  /* 最多 3 行完整显示，超出才省略——不再单行截断（真机返工批A） */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.map-viewer__sketch-pop-meta {
  flex: 0 0 auto;
  margin-top: 2px;
  font-size: 0.72rem;
  color: var(--morandi-text-light);
  white-space: nowrap;
}

.map-viewer__sketch-pop-body {
  margin: 0;
  padding: 0 12px 10px;
}

.map-viewer__sketch-pop-body dt {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
  margin-top: 6px;
}

.map-viewer__sketch-pop-body dd {
  margin: 1px 0 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--morandi-text);
}

/* 挂世界后画布区三态卡（载入/出错重试/空舆图） */
.map-viewer__map-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  background: #EDECE5;
  text-align: center;
}

.map-viewer__map-state-icon {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: #B8B0A2;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  margin-bottom: 4px;
}

.map-viewer__map-state-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #5f574d;
}

.map-viewer__map-state-desc {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--morandi-text-light);
}

.map-viewer__map-state-error {
  margin: 2px 0 0;
  max-width: 420px;
  font-size: 0.8rem;
  color: var(--morandi-danger);
}

.map-viewer__map-state-btn {
  margin-top: 6px;
  padding: 6px 14px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-card);
  font-size: 0.82rem;
  color: #5f574d;
  cursor: pointer;
  transition: background 0.16s ease;
}

.map-viewer__map-state-btn:hover {
  background: #F3EEE6;
}

.map-viewer__map-state-btn:disabled {
  cursor: default;
  opacity: 0.58;
}

@media (max-width: 960px) {
  .map-viewer__xingyi-column {
    display: none;
  }
}

@media (max-width: 760px) {
  .map-viewer__overlay {
    padding: 10px;
  }

  .map-viewer__head {
    flex-wrap: wrap;
    height: auto;
    padding: 8px 10px;
    gap: 8px;
  }

  .map-viewer__spacer {
    display: none;
  }

  .map-viewer__history,
  .map-viewer__dotmatrix,
  .map-viewer__tool-panel {
    position: absolute;
    z-index: 10;
    top: 0;
    right: 56px;
    bottom: 0;
    width: min(260px, calc(100% - 56px));
    box-shadow: -10px 0 24px rgba(72, 58, 47, 0.08);
  }

  .map-viewer__tool-rail {
    flex-basis: 56px;
  }
}
</style>
