<template>
  <div ref="docLibraryRoot" :class="props.embedded ? 'leaf-docs leaf-docs--embedded' : 'leaf-docs'">
    <header v-if="!isPromptExternalShell && !hideEmbeddedWorldbookTopbar" class="leaf-docs__topbar">
      <div class="leaf-docs__topbar-spacer"></div>

      <div class="leaf-docs__titlebar"></div>

      <div v-if="!showWorldbookReadPaneActions" class="leaf-docs__topbar-actions">
        <button
          v-if="!isTopbarEditMode && activeLibraryTab === 'worldbook'"
          type="button"
          class="leaf-docs__quick-switcher"
          :title="$t('docLibrary.tree.importSillyTavern')"
          :aria-label="$t('docLibrary.tree.importSillyTavern')"
          @click="openSillyTavernImportDialog"
        >
          <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4h9l5 5v11H5z"/>
            <path d="M14 4v5h5"/>
            <path d="M9 14h6"/>
            <path d="M12 11v6"/>
          </svg>
        </button>
        <button
          v-if="!isTopbarEditMode && activeLibraryTab === 'worldbook'"
          type="button"
          class="leaf-docs__quick-switcher"
          :title="$t('docLibrary.tree.importWorldDraft')"
          :aria-label="$t('docLibrary.tree.importWorldDraft')"
          @click="openWorldDraftImportDialog"
        >
          <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
            <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
            <path d="M12 18v-6"/>
            <path d="m15 15-3-3-3 3"/>
          </svg>
        </button>
        <button
          v-if="!isTopbarEditMode"
          type="button"
          class="leaf-docs__quick-switcher"
          :title="topbarSearchLabel"
          :aria-label="topbarSearchLabel"
          :disabled="!canUseTopbarSearch"
          @click="isQuickSwitcherOpen = true"
        >
          <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6"/>
            <path d="M20 20l-4.35-4.35"/>
          </svg>
        </button>
        <template v-if="!isTopbarEditMode">
          <button type="button" class="leaf-docs__icon-btn" :title="topbarDuplicateLabel" :disabled="!canDuplicateFromTopbar" @click="handleTopbarDuplicate" :aria-label="topbarDuplicateLabel">
            <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2"/>
              <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button type="button" class="leaf-docs__icon-btn" :title="topbarEditLabel" :disabled="!canEditFromTopbar" @click="handleTopbarEdit" :aria-label="topbarEditLabel">
            <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
        </template>
      </div>
    </header>

    <div v-if="!props.externalSidebar" class="leaf-docs__module-tabs">
      <button
        v-for="tab in visibleLibraryTabs"
        :key="tab.id"
        type="button"
        class="leaf-docs__module-tab"
        :class="{ active: activeLibraryTab === tab.id }"
        @click="setActiveLibraryTab(tab.id)"
      >
        {{ t(tab.labelKey) }}
      </button>
    </div>

    <div v-show="activeLibraryTab === 'worldbook'" class="leaf-docs__body" :class="{ 'leaf-docs__body--tree-hidden': !isTreeVisible }">
      <WorldbookTreePanel
        v-if="!props.externalSidebar"
        :tree-visible="isTreeVisible"
        :panel-style="treePanelStyle"
        :resizable="treePanelResizable"
        :rows="worldbookSoneTreeRows"
        :menu-style="floatingTreeMenuStyle"
        :dragging="worldbookPointerDrag.dragging.value"
        @undo="undoWorldbookOps"
        @redo="redoWorldbookOps"
        @expand-all="expandAllFolders"
        @collapse-all="collapseAllFolders"
        @create-section="createSectionFromTreeToolbar"
        @create-page="createPageFromTreeToolbar"
        @create-cluster="createCluster"
        @import-silly-tavern="openSillyTavernImportDialog"
        @import-world-draft="openWorldDraftImportDialog"
        @resize-start="startTreeResize"
        @select="handleWorldbookSoneSelect"
        @toggle="toggleWorldbookSoneRow"
        @menu="toggleWorldbookSoneMenu"
        @menu-action="runWorldbookSoneMenuAction"
        @row-pointerdown="handleWorldbookSonePointerDown"
        @row-pointermove="handleWorldbookSonePointerMove"
        @row-pointerend="handleWorldbookSonePointerEnd"
      />

      <main class="leaf-docs__main">
        <AppWorkspaceShell
          v-if="activeDocument"
          :windows="docWorkspaceWindows"
          :active-window-id="activeWorkspaceWindowId"
          :get-window-style="getWorkspaceWindowStyle"
          :aria-label="$t('docLibrary.aux.workspaceWindowAria')"
          draggable-tabs
          hide-tabs
          @activate="activateDocWorkspaceWindow"
          @close-window="closeDocWorkspaceWindow"
          @tab-drag-start="handleWorkspaceTabDragStart"
          @tab-drop="handleWorkspaceTabDrop"
          @tab-drag-end="handleWorkspaceTabDragEnd"
          @split-resize="startWorkspaceSplitResize"
        >
          <template #default="{ window }">
            <template v-if="window.id === 'document-viewer' || window.id === 'document-preview'">
              <AppWorkspaceReadPane
                :path-parts="activeDocumentPathParts"
                :title="activeDocumentDisplayTitle"
                :meta="activeDocument.updatedLabel"
                :html="renderMarkdown(window.id === 'document-preview' ? draftContent : activeDocument.content)"
              >
                <template v-if="docAuxPanelMode === 'none'" #actions>
                  <button
                    type="button"
                    class="app-workspace-shell__tool role-unit-action"
                    :title="topbarEditLabel"
                    :disabled="!canEditFromTopbar"
                    @click="handleTopbarEdit"
                    :aria-label="topbarEditLabel"
                  >
                    <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
                    </svg>
                    <span class="role-unit-action__label">{{ $t('common.edit') }}</span>
                  </button>
                  <button
                    type="button"
                    class="app-workspace-shell__tool role-unit-action role-unit-action--relation"
                    :title="$t('docLibrary.relation.openView')"
                    :aria-label="$t('docLibrary.relation.openView')"
                    @click="openRelationWindow"
                  >
                    <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="16" y="16" width="6" height="6" rx="1"/>
                      <rect x="2" y="16" width="6" height="6" rx="1"/>
                      <rect x="9" y="2" width="6" height="6" rx="1"/>
                      <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                      <path d="M12 12V8"/>
                    </svg>
                    <span class="role-unit-action__label">{{ $t('docLibrary.relation.viewLabel') }}</span>
                  </button>
                </template>
                <template #before-content>
                  <CompilePageEntryButton
                    compact
                    :status="compileDialogStatusText"
                    :warning="compileDialogStatusWarning"
                    @open="openCompilePageDialog"
                  />
                </template>
              </AppWorkspaceReadPane>
            </template>

            <template v-else-if="window.id === 'document-editor'">
              <DocLibraryEditorWorkspace
                ref="docEditorWorkspace"
                :path-parts="editorPathParts"
                :title="draftTitle"
                :content="draftContent"
                :compile-page="draftCompilePageModel"
                :semantic-type="draftSemanticType"
                :relation-validation-items="activeRelationHintValidationItems"
                :save-label="topbarSaveLabel"
                :can-save="canSaveFromTopbar"
                @update:title="draftTitle = $event"
                @update:content="updateDraftContent"
                @update:compile-page="applyDraftCompilePage"
                @update:semantic-type="draftSemanticType = $event"
                @open-compile-page="openCompilePageDialog"
                @wrap-selection="wrapSelection"
                @insert-heading="insertHeading"
                @insert-link="insertLink"
                @insert-table="insertTable"
                @insert-code-block="insertCodeBlock"
                @insert-image="insertImage"
                @undo-draft="undoDraft"
                @redo-draft="redoDraft"
                @save="handleTopbarSave"
                @editor-scroll="syncDocumentScrollFromEditor"
              />
            </template>
          </template>
        </AppWorkspaceShell>

        <section v-else-if="selectedWorldbookContainer" class="leaf-docs__empty">
          <div class="leaf-docs__empty-title">{{ selectedWorldbookContainer.label }}</div>
          <div class="leaf-docs__empty-text">{{ $t('docLibrary.worldbook.overviewEmpty', { kind: selectedWorldbookContainer.kind === 'cluster' ? $t('docLibrary.worldbook.kindCluster') : $t('docLibrary.worldbook.kindBranch') }) }}</div>
          <button type="button" class="leaf-docs__empty-action" :disabled="!canEditFromTopbar" @click="handleTopbarEdit">
            <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
            <span>{{ $t('docLibrary.worldbook.createOverview') }}</span>
          </button>
        </section>

        <section v-else class="leaf-docs__empty">
          <div class="leaf-docs__empty-title">{{ $t('docLibrary.worldbook.noClusterTitle') }}</div>
          <div class="leaf-docs__empty-text">{{ $t('docLibrary.worldbook.noClusterText') }}</div>
        </section>
      </main>

      <RecallCompilePageConflictDialog
        :open="isCompilePageDialogOpen"
        :model-value="draftCompilePageModel"
        :semantic-type="draftSemanticType"
        :relation-validation-items="activeRelationHintValidationItems"
        :relation-reference-candidates="relationHintReferenceCandidates"
        :unit-title="draftTitle || activeDocumentDisplayTitle"
        :unit-path="activeDocumentPathText"
        @update:model-value="applyDraftCompilePage"
        @update:semantic-type="draftSemanticType = $event"
        @close="isCompilePageDialogOpen = false"
        @save-draft="saveCompilePageDialogDraft"
        @save-apply="saveCompilePageDialogApply"
        @revalidate="revalidateCompilePageDialog"
        @edit-related-unit="editCompileIssueUnit"
        @delete-related-unit="deleteCompileIssueUnit"
        @edit-duplicate-relation-hint="editDuplicateRelationHint"
        @delete-duplicate-relation-hint="deleteDuplicateRelationHint"
        @delete-all-duplicate-relation-hints="confirmDeleteAllDuplicateRelationHints"
      />

      <Transition name="leaf-docs-aux-slide">
      <aside
        v-if="docAuxPanelMounted && docAuxPanelMode !== 'none'"
        class="leaf-docs__aux-panel"
        :class="`leaf-docs__aux-panel--${docAuxPanelMode}`"
        :style="docAuxPanelStyle"
      >
        <button
          v-if="docAuxPanelResizable"
          type="button"
          class="leaf-docs__aux-panel-resize"
          :title="$t('docLibrary.aux.resizePanel')"
          :aria-label="$t('docLibrary.aux.resizePanel')"
          @pointerdown="startDocAuxPanelResize"
        ></button>
        <header class="leaf-docs__aux-panel-header">
          <div v-if="isEditMode" class="leaf-docs__aux-panel-actions leaf-docs__aux-panel-actions--mode" :aria-label="$t('docLibrary.aux.panelModeAria')">
            <button
              type="button"
              class="app-workspace-shell__tool role-unit-action"
              :class="{ active: docAuxPanelMode === 'preview' }"
              :title="$t('docLibrary.aux.viewRender')"
              :aria-label="$t('docLibrary.aux.viewRender')"
              @click="openDocumentSidePreview"
            >
              <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span class="role-unit-action__label">{{ $t('docLibrary.aux.renderLabel') }}</span>
            </button>
            <button
              type="button"
              class="app-workspace-shell__tool role-unit-action role-unit-action--relation"
              :class="{ active: docAuxPanelMode === 'relation' }"
              :title="$t('docLibrary.relation.openView')"
              :aria-label="$t('docLibrary.relation.openView')"
              @click="openRelationWindow"
            >
              <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="16" y="16" width="6" height="6" rx="1"/>
                <rect x="2" y="16" width="6" height="6" rx="1"/>
                <rect x="9" y="2" width="6" height="6" rx="1"/>
                <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                <path d="M12 12V8"/>
              </svg>
              <span class="role-unit-action__label">{{ $t('docLibrary.relation.viewLabel') }}</span>
            </button>
          </div>
          <div v-else class="leaf-docs__aux-panel-actions">
            <button
              type="button"
              class="app-workspace-shell__tool role-unit-action"
              :disabled="!canEditFromTopbar"
              :title="$t('docLibrary.aux.editCurrentDoc')"
              :aria-label="$t('docLibrary.aux.editCurrentDoc')"
              @click="handleTopbarEdit"
            >
              <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
              </svg>
              <span class="role-unit-action__label">{{ $t('common.edit') }}</span>
            </button>
            <button
              type="button"
              class="app-workspace-shell__tool role-unit-action role-unit-action--relation active"
              :title="$t('docLibrary.relation.currentView')"
              :aria-label="$t('docLibrary.relation.currentView')"
              @click="openRelationWindow"
            >
              <svg class="app-workspace-shell__icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="16" y="16" width="6" height="6" rx="1"/>
                <rect x="2" y="16" width="6" height="6" rx="1"/>
                <rect x="9" y="2" width="6" height="6" rx="1"/>
                <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
                <path d="M12 12V8"/>
              </svg>
              <span class="role-unit-action__label">{{ $t('docLibrary.relation.viewLabel') }}</span>
            </button>
          </div>
          <button
            type="button"
            class="leaf-docs__aux-panel-close"
            :title="$t('docLibrary.aux.closePanel')"
            :aria-label="$t('docLibrary.aux.closePanel')"
            @click="closeDocAuxPanel"
          >
            <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </header>
        <DocLibraryPreviewPane
          v-if="docPreviewPanelMounted"
          v-show="docAuxPanelMode === 'preview'"
          ref="docPreviewPane"
          :html="draftPreviewHtml"
          @preview-scroll="syncDocumentScrollFromPreview"
        />
        <section v-if="docRelationPanelMounted" v-show="docAuxPanelMode === 'relation'" class="leaf-docs__aux-panel-relation-body">
          <div class="leaf-docs__aux-panel-relation-graph">
            <UnitRelationBrainView
              v-if="docRelationPanelReady && docRelationActiveUnit"
              :source="docLibraryRelationSource"
              @open-unit="openDocRelationUnit"
              @ready="finishDocRelationPanelLoad"
            />
            <Transition name="doc-relation-loading-fade">
              <div v-if="docRelationPanelLoading" class="leaf-docs__aux-panel-loading" role="status" aria-live="polite">
                <div class="leaf-docs__aux-panel-loading-mark">
                  <LanghuanLoadingMark
                    class="leaf-docs__aux-panel-loading-icon"
                    size="clamp(48px, 8vw, 72px)"
                    :stroke-scale="0.95"
                    :blur-rest-opacity="0.08"
                    :blur-peak-opacity="0.22"
                    :title="$t('docLibrary.relation.loadingView')"
                  />
                </div>
              </div>
            </Transition>
          </div>
        </section>
      </aside>
      </Transition>
    </div>

    <div
      v-show="activeLibraryTab !== 'worldbook'"
      class="leaf-docs__module-panel"
      :class="{ 'leaf-docs__module-panel--prompt': activeLibraryTab === 'prompt' }"
    >
      <section
        v-if="activeLibraryTab === 'relation'"
        class="leaf-docs__relation-panel"
        :class="{ 'leaf-docs__relation-panel--external-sidebar': props.externalSidebar }"
      >
        <div v-if="!props.externalSidebar" class="leaf-docs__relation-sidebar">
          <button type="button" class="leaf-docs__relation-nav" :class="{ active: activeRelationTab === 'predicates' }" @click="activeRelationTab = 'predicates'">
            <span>{{ $t('docLibrary.relation.predicates') }}</span>
            <span>{{ relationReadModel.predicates.length }}</span>
          </button>
          <button type="button" class="leaf-docs__relation-nav" :class="{ active: activeRelationTab === 'candidates' }" @click="activeRelationTab = 'candidates'">
            <span>{{ $t('docLibrary.relation.candidates') }}</span>
            <span>{{ relationReadModel.candidateRelations.length }}</span>
          </button>
          <button type="button" class="leaf-docs__relation-nav" :class="{ active: activeRelationTab === 'confirmed' }" @click="activeRelationTab = 'confirmed'">
            <span>{{ $t('docLibrary.relation.confirmed') }}</span>
            <span>{{ relationReadModel.confirmedRelations.length }}</span>
          </button>
        </div>

        <div class="leaf-docs__relation-main">
          <div v-if="activeRelationTab === 'predicates'" class="leaf-docs__relation-section">
            <div class="leaf-docs__relation-editor">
              <input v-model="predicateDraft.label" class="leaf-docs__input" type="text" :placeholder="$t('docLibrary.relation.predicateNamePlaceholder')">
              <input v-model="predicateDraft.key" class="leaf-docs__input" type="text" placeholder="predicate_key">
              <button type="button" class="leaf-docs__primary-btn" :disabled="!canCreateRelationPredicate" @click="createRelationPredicate">{{ $t('docLibrary.relation.add') }}</button>
            </div>
            <div class="leaf-docs__relation-list">
              <article v-for="predicate in relationReadModel.predicates" :key="predicate.predicateId" class="leaf-docs__relation-row">
                <div>
                  <div class="leaf-docs__relation-title">{{ predicate.label }}</div>
                  <div class="leaf-docs__relation-meta">{{ predicate.key }} · {{ predicate.family }}</div>
                </div>
                <span class="leaf-docs__relation-badge">{{ predicate.status }}</span>
              </article>
            </div>
          </div>

          <div v-else-if="activeRelationTab === 'candidates'" class="leaf-docs__relation-section">
            <div v-if="relationReadModel.candidateRelations.length === 0" class="leaf-docs__relation-empty">{{ $t('docLibrary.relation.noCandidate') }}</div>
            <div v-else class="leaf-docs__relation-list">
              <article v-for="relation in relationReadModel.candidateRelations" :key="relation.relationId" class="leaf-docs__relation-row">
                <div>
                  <div class="leaf-docs__relation-title">{{ getRelationUnitTitle(relation.sourceUnitId) }} → {{ getRelationUnitTitle(relation.targetUnitId) }}</div>
                  <div class="leaf-docs__relation-meta">{{ getRelationPredicateLabel(relation.predicateId) }} · {{ getRelationEvidenceText(relation) }}</div>
                </div>
                <div class="leaf-docs__relation-actions">
                  <button type="button" class="leaf-docs__secondary-btn" @click="rejectRelation(relation.relationId)">{{ $t('docLibrary.relation.reject') }}</button>
                  <button type="button" class="leaf-docs__primary-btn" @click="confirmRelation(relation.relationId, relation.predicateId)">{{ $t('common.confirm') }}</button>
                </div>
              </article>
            </div>
          </div>

          <div v-else class="leaf-docs__relation-section">
            <div v-if="relationReadModel.confirmedRelations.length === 0" class="leaf-docs__relation-empty">{{ $t('docLibrary.relation.noConfirmed') }}</div>
            <div v-else class="leaf-docs__relation-list">
              <article v-for="relation in relationReadModel.confirmedRelations" :key="relation.relationId" class="leaf-docs__relation-row">
                <div>
                  <div class="leaf-docs__relation-title">{{ getRelationUnitTitle(relation.sourceUnitId) }} → {{ getRelationUnitTitle(relation.targetUnitId) }}</div>
                  <div class="leaf-docs__relation-meta">{{ getRelationPredicateLabel(relation.predicateId) }} · {{ relation.updatedAt || $t('docLibrary.relation.noTime') }}</div>
                </div>
                <span class="leaf-docs__relation-badge">confirmed</span>
              </article>
            </div>
          </div>
        </div>
      </section>
      <PromptLibraryPanel
        v-else
        ref="promptLibraryRef"
        :external-sidebar="props.externalSidebar"
        @sidebar-state-change="emit('sidebar-state-change', getSidebarState())"
      />
    </div>

    <AppChoiceDialog
      :open="isQuickSwitcherOpen"
      :title="quickSwitcherDialogTitle"
      :subtitle="quickSwitcherDialogSubtitle"
      :options="quickSwitcherChoiceOptions"
      size="lg"
      :empty-text="$t('docLibrary.dialog.quickEmpty')"
      :confirm-text="$t('common.close')"
      @cancel="closeQuickSwitcher"
      @select="jumpToQuickSwitcherItem"
      @confirm="closeQuickSwitcher"
    >
      <template #search>
        <div class="leaf-docs__dialog-search">
          <label class="leaf-docs__field-label">{{ $t('common.search') }}</label>
          <input v-model="quickSwitcherQuery" class="leaf-docs__input" type="text" :placeholder="quickSwitcherPlaceholder">
        </div>
      </template>
    </AppChoiceDialog>

    <AppFormDialog
      :open="createDialog.visible"
      :title="createDialog.type === 'cluster' ? $t('docLibrary.dialog.createClusterTitle') : createDialog.type === 'section' ? $t('docLibrary.dialog.createSectionTitle') : $t('docLibrary.dialog.createPageTitle')"
      :subtitle="createDialog.type === 'cluster' ? $t('docLibrary.dialog.createClusterSubtitle') : $t('docLibrary.dialog.createOtherSubtitle')"
      size="lg"
      @cancel="closeCreateDialog"
    >
      <div class="leaf-docs__dialog-form">
        <label class="leaf-docs__field">
          <span class="leaf-docs__field-label">{{ $t('brain.field.title') }}</span>
          <input v-model="createDialog.title" class="leaf-docs__input" type="text" :placeholder="createDialog.type === 'cluster' ? $t('docLibrary.dialog.clusterTitlePlaceholder') : $t('docLibrary.dialog.pageTitlePlaceholder')">
        </label>
        <label v-if="createDialog.type !== 'cluster'" class="leaf-docs__field">
          <span class="leaf-docs__field-label">{{ $t('brain.roleWorkspace.placementPath') }}</span>
          <input
            v-model="createDialog.pathInput"
            class="leaf-docs__input"
            type="text"
            placeholder="/世界树"
            @blur="syncCreateDialogPathFromInput"
          >
        </label>
        <div class="leaf-docs__field-note">{{ $t('docLibrary.dialog.targetPrefix', { path: createDialogPreviewPath }) }}</div>
      </div>

      <template #actions>
        <button type="button" class="leaf-docs__secondary-btn" @click="closeCreateDialog">{{ $t('common.cancel') }}</button>
        <button type="button" class="leaf-docs__primary-btn" :disabled="!createDialogCanSubmit" @click="confirmCreateDocument(true)">{{ createDialog.type === 'cluster' ? $t('docLibrary.dialog.createClusterEdit') : createDialog.type === 'section' ? $t('docLibrary.dialog.createSectionEdit') : $t('docLibrary.dialog.createPageEdit') }}</button>
      </template>
    </AppFormDialog>

    <AppFormDialog
      :open="renameDialog.visible"
      :title="renameDialog.type === 'cluster' ? $t('docLibrary.dialog.renameClusterTitle') : renameDialog.type === 'folder' ? $t('docLibrary.dialog.renameFolderTitle') : $t('docLibrary.dialog.renamePageTitle')"
      :subtitle="renameDialog.type === 'document' ? $t('docLibrary.dialog.renameDocSubtitle') : $t('docLibrary.dialog.renameOtherSubtitle')"
      size="lg"
      @cancel="closeRenameDialog"
    >
      <div class="leaf-docs__dialog-form">
        <label class="leaf-docs__field">
          <span class="leaf-docs__field-label">{{ $t('brain.roleWorkspace.name') }}</span>
          <input v-model="renameDialog.title" class="leaf-docs__input" type="text" :placeholder="renameDialog.type === 'document' ? $t('docLibrary.dialog.pageNamePlaceholder') : $t('docLibrary.dialog.nodeNamePlaceholder')">
        </label>
      </div>

      <template #actions>
        <button type="button" class="leaf-docs__secondary-btn" @click="closeRenameDialog">{{ $t('common.cancel') }}</button>
        <button type="button" class="leaf-docs__primary-btn" :disabled="!renameDialogCanSubmit" @click="confirmRenameDialog">{{ $t('common.save') }}</button>
      </template>
    </AppFormDialog>

    <AppFormDialog
      :open="sortDialogVisible"
      :title="$t('docLibrary.dialog.sortTitle')"
      size="lg"
      @cancel="closeSortDialog"
      @submit="saveSortDialog"
    >
      <div class="leaf-docs__sort-shell">
        <TransitionGroup
          name="leaf-docs-sort"
          tag="div"
          class="leaf-docs__sort-list"
          ref="sortDialogList"
        >
          <button
          v-for="(item, index) in sortDialogItems"
          :key="item.id"
          type="button"
          class="leaf-docs__sort-item"
          :class="getSortDialogItemClasses(index)"
          :data-multi-select-id="item.id"
          :data-sort-dialog-id="item.id"
          @click="handleSortDialogItemClick(item.id, $event)"
        >
          <span class="leaf-docs__sort-label">
            {{ item.label }}
          </span>
          <div class="leaf-docs__sort-actions">
            <button type="button" class="leaf-docs__row-action" :disabled="isSortDialogMoveDisabled(index, -1)" @click.stop="moveSortDialogItem(index, -1)">
              <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M6 11l6-6 6 6"/></svg>
            </button>
            <button type="button" class="leaf-docs__row-action" :disabled="isSortDialogMoveDisabled(index, 1)" @click.stop="moveSortDialogItem(index, 1)">
              <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="M18 13l-6 6-6-6"/></svg>
            </button>
          </div>
          </button>
        </TransitionGroup>
      </div>

      <template #actions>
        <button type="button" class="leaf-docs__secondary-btn" @click="closeSortDialog">{{ $t('common.cancel') }}</button>
        <button type="button" class="leaf-docs__primary-btn" @click="saveSortDialog">{{ $t('common.save') }}</button>
      </template>
    </AppFormDialog>

    <AppMoveDialog
      :open="worldbookMoveDialog.visible"
      :title="$t('docLibrary.dialog.moveTitle')"
      :path-placeholder="$t('docLibrary.dialog.movePathPlaceholder')"
      :path-input="worldbookMoveDialog.pathInput"
      :path-hint="selectedWorldbookMoveTarget?.path || ''"
      :selected-id="worldbookMoveDialog.targetId"
      :source-labels="worldbookMoveDialog.sourceLabels"
      :rows="worldbookMoveRows"
      :confirm-disabled="!selectedWorldbookMoveTarget"
      @update:path-input="worldbookMoveDialog.pathInput = $event"
      @toggle="toggleWorldbookMoveTarget"
      @select="selectWorldbookMoveTarget"
      @jump="jumpToWorldbookMovePath"
      @cancel="closeWorldbookMoveDialog"
      @confirm="confirmWorldbookMoveDialog"
    />

    <AppFormDialog
      :open="sillyTavernImportDialog.visible"
      :title="$t('docLibrary.tree.importSillyTavern')"
      :subtitle="$t('docLibrary.sillyTavern.subtitle')"
      size="lg"
      @cancel="closeSillyTavernImportDialog"
    >
      <div class="leaf-docs__dialog-form leaf-docs__import-dialog">
        <div v-if="sillyTavernImportDialog.loading" class="leaf-docs__field-note">{{ $t('docLibrary.sillyTavern.generatingPreview') }}</div>
        <div v-else-if="sillyTavernImportDialog.error" class="leaf-docs__import-error">{{ sillyTavernImportDialog.error }}</div>
        <template v-else-if="sillyTavernImportDialog.preview">
          <div class="leaf-docs__import-stats">
            <span>{{ $t('docLibrary.sillyTavern.fileCount', { count: sillyTavernImportDialog.preview.stats.fileCount }) }}</span>
            <span>{{ $t('docLibrary.sillyTavern.documentCount', { count: sillyTavernImportDialog.preview.stats.documentCount }) }}</span>
            <span>{{ $t('docLibrary.sillyTavern.conflictCount', { count: sillyTavernImportDialog.preview.stats.conflictCount }) }}</span>
            <span>{{ $t('docLibrary.sillyTavern.warningCount', { count: sillyTavernImportDialog.preview.stats.warningCount }) }}</span>
          </div>
          <label class="leaf-docs__field">
            <span class="leaf-docs__field-label">{{ $t('docLibrary.sillyTavern.dupStrategy') }}</span>
            <select v-model="sillyTavernImportDialog.conflictStrategy" class="leaf-docs__input">
              <option value="skip">{{ $t('docLibrary.sillyTavern.dupSkip') }}</option>
              <option value="overwrite">{{ $t('docLibrary.sillyTavern.dupOverwrite') }}</option>
              <option value="duplicate">{{ $t('docLibrary.sillyTavern.dupDuplicate') }}</option>
            </select>
          </label>
          <div class="leaf-docs__import-preview">
            <div class="leaf-docs__field-label">{{ $t('docLibrary.sillyTavern.previewPath') }}</div>
            <div
              v-for="document in sillyTavernImportPreviewDocuments"
              :key="document.documentId"
              class="leaf-docs__import-row"
            >
              <span>{{ document.title }}</span>
              <small>/世界树{{ document.displayPath }}</small>
            </div>
          </div>
          <div v-if="sillyTavernImportDialog.preview.warnings.length" class="leaf-docs__import-warnings">
            <div class="leaf-docs__field-label">{{ $t('docLibrary.sillyTavern.warnings') }}</div>
            <div
              v-for="(warning, index) in sillyTavernImportPreviewWarnings"
              :key="`${warning.code}-${warning.fileName || ''}-${warning.entryUid || ''}-${index}`"
              class="leaf-docs__field-note"
            >
              {{ warning.fileName || $t('docLibrary.sillyTavern.unknownFile') }}：{{ warning.message }}
            </div>
          </div>
        </template>
      </div>

      <template #actions>
        <button type="button" class="leaf-docs__secondary-btn" @click="closeSillyTavernImportDialog">{{ $t('common.cancel') }}</button>
        <button
          type="button"
          class="leaf-docs__secondary-btn"
          :disabled="sillyTavernImportDialog.loading || sillyTavernImportDialog.applying"
          @click="loadSillyTavernImportPreview"
        >{{ $t('docLibrary.sillyTavern.repreview') }}</button>
        <button
          type="button"
          class="leaf-docs__primary-btn"
          :disabled="!sillyTavernImportDialog.preview || sillyTavernImportDialog.loading || sillyTavernImportDialog.applying"
          @click="confirmSillyTavernImport"
        >{{ sillyTavernImportDialog.applying ? $t('docLibrary.sillyTavern.importing') : $t('docLibrary.sillyTavern.confirmImport') }}</button>
      </template>
    </AppFormDialog>

    <WorldDraftImportDialog
      :open="worldDraftImportDialogVisible"
      @cancel="worldDraftImportDialogVisible = false"
      @applied="handleWorldDraftImportApplied"
    />

    <AppConfirmDialog
      :open="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText"
      tone="danger"
      @cancel="closeConfirmDialog"
      @confirm="confirmPendingAction"
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
      @cancel="cancelCompactRelationImportReviewDialog"
      @apply="applyCompactRelationImportReviewDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BrainDocumentRecord, DocLibraryTreeDiffReport, DocTreeNodeRecord, DocTreeOrders, UnitSemanticType } from '../types'
import type { RelationSystemState, RelationViewRecord, UnitView, UnitViewAdapterResult } from '../types'
import type { WorkspaceWindowRecord } from '../app/workspaceWindowProtocol'
import { useResizablePanel } from '../composables/app/useResizablePanel'
import { useSidebarDragModeKit } from '../composables/useSidebarDragModeKit'
import { getVisibleSidebarElements, resolveBufferedDropTarget } from '../composables/useSidebarDropTargetKit'
import { useSidebarPointerDragKit } from '../composables/useSidebarPointerDragKit'
import { useSidebarSelectionMenuKit } from '../composables/useSidebarSelectionMenuKit'
import { useSidebarFloatingMenuKit } from '../composables/useSidebarFloatingMenuKit'
import { useSidebarMultiDrag } from '../composables/useSidebarMultiDrag'
import { useMultiSelect } from '../composables/useMultiSelect'
import { insertEntriesAroundTarget, resetWorldbookTreeAutoExpandState, resolveWorldbookTreePointerTarget } from '../composables/useWorldbookTreeDragKit'
import type {
  WorldbookTreeAutoExpandState,
  WorldbookTreeDragRowKind as WorldbookDragRowKind,
  WorldbookTreePreviewTarget as WorldbookPreviewTarget
} from '../composables/useWorldbookTreeDragKit'
import { useMarkdownWorkspaceEditor } from '../composables/useMarkdownWorkspaceEditor'
import { handleWorkspaceSaveShortcut } from '../composables/useWorkspaceSaveShortcut'
import {
  cloneDocLibraryDocuments,
  getDocLibraryTreeCommandTarget,
  normalizeDocLibraryManualTreeOrders,
  normalizeDocLibraryTreeOrders,
  useDocLibraryPersistence
} from '../composables/doc-library/useDocLibraryPersistence'
import type {
  DocLibraryPersistenceMode,
  DocLibraryPersistenceOperationTarget,
  DocLibraryPersistenceSnapshot
} from '../composables/doc-library/useDocLibraryPersistence'
import { useWorldbookTransfer } from '../composables/doc-library/useWorldbookTransfer'
import { useWorldbookTreeController } from '../composables/doc-library/useWorldbookTreeController'
import type { WorldbookTreeProjectedRow } from '../composables/doc-library/useWorldbookTreeController'
import {
  fetchDocLibraryState,
  normalizeBrainPublicCompilePage,
  saveDocLibraryState
} from '../repositories/docBrainRepository'
import { normalizeUnitSemanticType } from '../app/unitSemanticTypes'
import { useWorkspaceRuntimeStore } from '../app/workspaceRuntimeStore'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingStore } from '../stores/settingStore'
import { useAI } from '../composables/useAI'
import {
  runLanghuanAgentCompilePage,
  runLanghuanAgentRelationOptimize
} from '../app/langhuanAgentAssist'
import { registerXingyiFunctionProvider } from '../app/xingyiFunctionBridge'
import { DOC_LIBRARY_EXTERNAL_UPDATED_EVENT } from '../app/xingyiUnitCrudDocLibraryAdapter'
import PromptLibraryPanel from './PromptLibraryPanel.vue'
import RecallCompilePageConflictDialog from './recall/RecallCompilePageConflictDialog.vue'
import CompilePageEntryButton from './recall/CompilePageEntryButton.vue'
import DocLibraryEditorWorkspace from './doc-library/DocLibraryEditorWorkspace.vue'
import DocLibraryPreviewPane from './doc-library/DocLibraryPreviewPane.vue'
import WorldbookTreePanel from './doc-library/WorldbookTreePanel.vue'
import WorldDraftImportDialog from './doc-library/WorldDraftImportDialog.vue'
import SidebarFloatingMenu from './common/SidebarFloatingMenu.vue'
import AppWorkspaceShell from './common/AppWorkspaceShell.vue'
import AppWorkspaceReadPane from './common/AppWorkspaceReadPane.vue'
import AppChoiceDialog from './common/AppChoiceDialog.vue'
import AppConfirmDialog from './common/AppConfirmDialog.vue'
import AppFormDialog from './common/AppFormDialog.vue'
import AppMoveDialog from './common/AppMoveDialog.vue'
import CompilePageImportConflictDialog from './common/CompilePageImportConflictDialog.vue'
import CompactRelationImportReviewDialog from './common/CompactRelationImportReviewDialog.vue'
import LanghuanLoadingMark from './common/LanghuanLoadingMark.vue'
import UnitRelationBrainView from './app/UnitRelationBrainView.vue'
import type { AppChoiceDialogOption } from './common/AppChoiceDialog.vue'
import type { AppMoveDialogRow } from './common/AppMoveDialog.vue'
import type {
  SillyTavernWorldbookImportConflictStrategy,
  SillyTavernWorldbookImportPreview
} from '../types'
import { renderMarkdownToHtml } from '../utils/markdown'
import { syncScrollByRatio } from '../utils/syncedScroll'
import { moveSortDialogDraftItems, type SortDialogDraftDirection } from '../utils/sortDialogDraft'
import { hasActiveBrowserTextSelection } from '../utils/textSelection'
import {
  buildWorldbookOverviewDisplayPath,
  isWorldbookOverviewDocument
} from '../utils/worldbookOverview'
import { useToast } from '../composables/useToast'
import {
  buildCompileRelationIssues,
  buildRelationHintValidationItems,
  buildRelationSystemReadModel,
  confirmRelationCandidate,
  createEmptyRelationSystemState,
  normalizeRelationSystemState,
  rejectRelationCandidate,
  type CompileRelationIssue,
  type CompileRelationIssueDuplicateEvidence,
  upsertRelationPredicate
} from '../app/relationSystem'
import { buildDocLibrarySidebarShellUnitView } from '../app/unitViewAdapters'
import { getCachedDocLibraryUnitView } from '../app/docLibraryUnitViewCache'
import { createProgressiveHydrationController, type ProgressiveHydrationStage } from '../app/progressiveHydration'
import {
  buildUnitCompilePageIndicatorLookup,
  formatCompilePageEntryStatus,
  isCompilePageEntryStatusWarning,
  type UnitCompilePageIndicator
} from '../app/compilePageIndicators'
import {
  buildWorldbookClusterMenuItems,
  buildWorldbookRowMenuItems,
  type DocLibraryWorldbookMenuItem
} from '../app/docLibraryWorldbookMenu'
import {
  formatRelationHintReferenceTitle,
  getUnitRelationRefId
} from '../app/relationHintReference'
import { parseCompilePageMarkdown, parseCompilePageMarkdownBatch } from '../app/compilePageMarkdownImport'
import { parseUnitBodyMarkdown, parseUnitBodyMarkdownBatch } from '../app/unitBodyMarkdownImport'
import {
  applyCompilePageImportDecisions,
  createCompilePageImportUnitPlan,
  createDefaultCompilePageImportDecisions,
  hasCompilePageImportConflicts,
  type CompilePageImportDecisionMap,
  type CompilePageImportIncoming,
  type CompilePageImportPlan
} from '../app/compilePageImportConflict'
import {
  applyCompactRelationImportDecisions,
  countCompactRelationImportPlan,
  createCompactRelationImportPlan,
  createDefaultCompactRelationImportDecisions,
  type CompactRelationImportDecisionMap,
  type CompactRelationImportPlan
} from '../app/compactRelationImportReview'
import { buildUnitTreeMarkdown, buildUnitTreeMarkdownWithBodyPrompt, buildUnitTreeMarkdownWithCompilePrompt } from '../app/unitTreeJsonExport'
import {
  buildCompactRelationMarkdown,
  extractCompactRelationExportId,
  loadCompactRelationExportMapping,
  parseCompactRelationMarkdown,
  saveCompactRelationExportMapping,
  type CompactRelationPromptVersion
} from '../app/unitRelationCompactMarkdown'
import {
  buildDocLibraryWorldClusterRelationProjection,
  buildDocLibraryRelationClipboardEntries,
  resolveDocLibraryRelationClipboardUnitIds,
  resolveDocLibraryRelationPasteTarget
} from '../app/docLibraryRelationSourceAdapter'
import {
  createOperationPatch,
  createRedoPatch,
  createUndoPatch,
  type OperationPatch,
  type OperationPatchKind,
  type RedoPatch,
  type UndoPatch
} from '../app/operationPatches'
import {
  buildDocLibraryTreeCommandResult,
  type DocLibraryTreeCommand
} from '../app/docLibraryTreeCommands'
import {
  buildDocLibraryFolderPathChain,
  compareDocLibraryDisplayPath,
  getDocLibraryDisplayFileName,
  getDocLibraryDocumentSlugFromPath,
  getDocLibraryParentFolderPath,
  normalizeDocLibraryDisplayPath,
  replaceDocLibraryPathPrefix,
  slugifyDocLibraryPathSegment,
  splitDocLibraryDisplayPath,
  stripDocLibraryMarkdownExtension
} from '../app/docLibraryPathCompat'
import {
  buildUnitTreePathInput,
  chooseUnitTreeMarkdownFileName,
  normalizeUnitTreePathInput,
  syncUnitTreeCreateTargetFromPath
} from '../app/unitTreePathTargets'
import { DOC_TREE_ROOT_NODE_ID } from '../app/docLibraryTreeMigration'
import {
  buildDirectChildFolderNameIndex,
  buildDocumentTreeNodeIdIndex,
  collectDocLibraryAncestorFolderMatches,
  findDeepestDocLibraryFolderPrefix,
  orderDocLibraryTreeChildNodeIds
} from '../app/docLibraryReadIndex'
import {
  createRelationProjectionCharacter,
  createUnitRelationSourceAdapter
} from '../app/unitRelationSourceAdapter'
import {
  activateWorkspaceWindow,
  closeWorkspaceWindow,
  createUnitWorkspaceWindow,
  createWorkspaceWindowState,
  getWorkspaceWindowFlexStyle,
  reorderWorkspaceWindow,
  resizeWorkspaceWindow,
  upsertWorkspaceWindow
} from '../app/workspaceWindowProtocol'
import {
  getVisibleDocLibraryModuleTabs,
  normalizeVisibleDocLibraryModuleTab
} from '../app/docLibraryModules'
import type { DocLibraryModuleTab as LibraryTab } from '../app/docLibraryModules'
import { useTreeExpandPersistence } from '../composables/useTreeExpandPersistence'
import '../styles/sidebarSelectionMenuKit.css'

type RelationPanelTab = 'predicates' | 'candidates' | 'confirmed'
type DocAuxPanelMode = 'none' | 'preview' | 'relation'
type DocRecord = BrainDocumentRecord & { shortTitle: string; slug: string; breadcrumbs: string[]; updatedLabel: string; folderSegments: string[] }
type FolderBuilder = { id: string; label: string; folderPath: string; parentId: string; parentFolderPath: string; children: Map<string, FolderBuilder>; documents: DocRecord[] }
type TreeCluster = { id: string; label: string; folderPath: string; children: Map<string, FolderBuilder>; documents: DocRecord[] }
type TreeFolderRow = { id: string; kind: 'folder'; label: string; depth: number; folderId: string; folderPath: string; parentFolderId: string; parentFolderPath: string; clusterId: string }
type TreeDocumentRow = { id: string; kind: 'document'; label: string; depth: number; documentId: string; parentFolderId: string; parentFolderPath: string; clusterId: string }
type TreeRow = TreeFolderRow | TreeDocumentRow
type WorldbookSoneTreeRow = WorldbookTreeProjectedRow<UnitView, TreeRow>
type CreateDialogState = {
  visible: boolean
  type: 'page' | 'section' | 'cluster'
  parentFolderPath: string
  pathInput: string
  initialPathInput: string
  title: string
  targetDocumentId: string
  insertAfterEntryId: string
  insertParentFolderPath: string
}
type SortDialogItem = { id: string; label: string; kind: 'folder' | 'document'; selected?: boolean }
type SortDialogMode = 'cluster' | 'layer'
type WorldbookMenuItem = DocLibraryWorldbookMenuItem
type WorldbookClusterMenuItem = DocLibraryWorldbookMenuItem
type ConfirmDialogState = { visible: boolean; title: string; message: string; confirmText: string }
type WorldbookOperationSnapshot = {
  documents: BrainDocumentRecord[]
  manualOrders: Record<string, string[]>
  treeNodes: DocTreeNodeRecord[]
  treeOrders: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
}
type WorldbookHistoryDelta = {
  documents: Array<{ id: string; before?: BrainDocumentRecord; after?: BrainDocumentRecord }>
  manualOrders: Array<{ key: string; before?: string[]; after?: string[] }>
  treeNodes: Array<{ id: string; before?: DocTreeNodeRecord; after?: DocTreeNodeRecord }>
  treeOrders: Array<{ key: string; before?: string[]; after?: string[] }>
  treeDiffReport?: { before?: DocLibraryTreeDiffReport; after?: DocLibraryTreeDiffReport }
}
type WorldbookHistoryPatch = {
  undoPatch: UndoPatch
  redoPatch: RedoPatch
}
type RenameDialogState = {
  visible: boolean
  type: 'document' | 'folder' | 'cluster'
  sourceId: string
  title: string
  parentFolderPath: string
}
type WorldbookClipboardState = {
  mode: 'copy' | 'cut' | ''
  rowKind: 'document' | 'folder' | 'mixed'
  ids: string[]
  labels: string[]
  entries: Array<{
    kind: 'document' | 'folder'
    id: string
    label: string
  }>
}
type WorldbookMoveDialogState = {
  visible: boolean
  rowKind: WorldbookDragRowKind
  sourceIds: string[]
  sourceLabels: string[]
  targetId: string
  pathInput: string
}
type SillyTavernImportDialogState = {
  visible: boolean
  loading: boolean
  applying: boolean
  error: string
  conflictStrategy: SillyTavernWorldbookImportConflictStrategy
  preview: SillyTavernWorldbookImportPreview | null
}
type SidebarClusterRow = {
  id: string
  label: string
  open: boolean
  count: number
  selected?: boolean
  cutPending?: boolean
  compilePageIndicator?: UnitCompilePageIndicator
}
type SidebarTreeRow = {
  id: string
  kind: 'folder' | 'document'
  label: string
  depth: number
  clusterId: string
  folderId?: string
  itemId?: string
  parentFolderId: string
  open?: boolean
  active?: boolean
  selected?: boolean
  cutPending?: boolean
  compilePageIndicator?: UnitCompilePageIndicator
}
type PromptSidebarRow = {
  id: string
  group: string
  groupLabel: string
  title: string
  meta: string
  enabled: boolean
  active: boolean
  recordKind: 'preset' | 'legacy'
}
type DocSidebarState = {
  activeTab: LibraryTab
  worldbook: {
    treeVisible: boolean
    clusters: SidebarClusterRow[]
    selectedCount: number
    clipboardMode: '' | 'copy' | 'cut'
    clipboardHasData: boolean
    rows: SidebarTreeRow[]
    rowsByCluster: Record<string, SidebarTreeRow[]>
  }
  prompt: {
    selectedId: string
    totalCount: number
    dragEnabled?: boolean
    filterMode?: 'all' | 'required'
    rows: PromptSidebarRow[]
  }
  relation: {
    activeTab: RelationPanelTab
    predicatesCount: number
    candidatesCount: number
    confirmedCount: number
  }
}

const cloneWorldbookDocuments = cloneDocLibraryDocuments
const normalizeManualTreeOrders = normalizeDocLibraryManualTreeOrders
const normalizeTreeOrders = normalizeDocLibraryTreeOrders

const props = defineProps({
  embedded: { type: Boolean, default: false },
  externalSidebar: { type: Boolean, default: false }
})
const emit = defineEmits<{
  (e: 'sidebar-state-change', state: DocSidebarState): void
}>()
const { t } = useI18n()
const charStore = useCharacterStore()
const settingStore = useSettingStore()
const runtimeStore = useWorkspaceRuntimeStore()
const { callAI } = useAI()
const { toast } = useToast(runtimeStore)
const activeLibraryTab = ref<LibraryTab>('worldbook')
const visibleLibraryTabs = computed(() => getVisibleDocLibraryModuleTabs())
const isPromptExternalShell = computed(() => props.externalSidebar && activeLibraryTab.value === 'prompt')
type PromptLibraryExpose = {
  getSidebarState?: () => DocSidebarState['prompt']
  selectPromptFromParent?: (recordId: string) => void
  openCreateDialogFromParent?: () => void
  togglePromptDragModeFromParent?: () => void
  setPromptFilterModeFromParent?: (mode: 'all' | 'required') => void
  reorderPromptFromParent?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}
const promptLibraryRef = ref<PromptLibraryExpose | null>(null)
const relationSystemState = ref<RelationSystemState>(createEmptyRelationSystemState())
const activeRelationTab = ref<RelationPanelTab>('candidates')
const predicateDraft = ref({ label: '', key: '' })
const docWorkspaceState = ref(createWorkspaceWindowState())
const docAuxPanelMode = ref<DocAuxPanelMode>('none')
const docPreviewPanelMounted = ref(false)
const docRelationPanelMounted = ref(false)
const docRelationPanelReady = ref(false)
const docRelationPanelLoading = ref(false)
const docRelationUnitId = ref('')
const draggedWorkspaceTabId = ref('')
let stopWorkspaceSplitResize: null | (() => void) = null
let docRelationLoadFrame: number | null = null
let docRelationLoadTimer: ReturnType<typeof setTimeout> | null = null
let docRelationLoadStartedAt = 0
let isSyncingDocumentScroll = false
const docLibraryRoot = ref<HTMLElement | null>(null)
type DocLibraryEditorWorkspaceExpose = {
  getTextareaElement: () => HTMLTextAreaElement | null
  focusEditor: () => void
}
type DocLibraryPreviewPaneExpose = {
  getPreviewElement: () => HTMLElement | null
}
const docEditorWorkspace = ref<DocLibraryEditorWorkspaceExpose | null>(null)
const docPreviewPane = ref<DocLibraryPreviewPaneExpose | null>(null)
const worldbookEditor = useMarkdownWorkspaceEditor({
  focusEditor: () => docEditorWorkspace.value?.focusEditor()
})
const isDesktopViewport = ref(false)
const selectedDocumentId = ref('')
const isEditMode = worldbookEditor.isEditMode
const isSavingDocument = ref(false)
const isQuickSwitcherOpen = ref(false)
const isCompilePageDialogOpen = ref(false)
const quickSwitcherQuery = ref('')
const isTreeVisible = ref(true)
const sortDirection = ref<'asc' | 'desc'>('asc')
const docLibraryProjectionResult = ref<UnitViewAdapterResult | null>(null)
const docLibraryProjectionStage = ref<ProgressiveHydrationStage>('idle')
// 展开态默认折叠：只持久化"哪些簇/文件夹是展开的"，未记录的一律折叠
const clusterExpandPersistence = useTreeExpandPersistence('langhuan_doclibrary_expanded_clusters_v1')
const folderExpandPersistence = useTreeExpandPersistence('langhuan_doclibrary_expanded_folders_v1')
const openClusterIds = ref<string[]>(Array.from(clusterExpandPersistence.loadExpandedIds()))
const openFolderIds = ref<string[]>(Array.from(folderExpandPersistence.loadExpandedIds()))
watch(openClusterIds, (next) => { clusterExpandPersistence.saveExpandedIds(next) }, { deep: true })
watch(openFolderIds, (next) => { folderExpandPersistence.saveExpandedIds(next) }, { deep: true })
const createDialog = ref<CreateDialogState>({
  visible: false,
  type: 'page',
  parentFolderPath: '/文档',
  pathInput: '/世界树/文档',
  initialPathInput: '/世界树/文档',
  title: '',
  targetDocumentId: '',
  insertAfterEntryId: '',
  insertParentFolderPath: ''
})
const pendingSectionDocumentIds = ref<string[]>([])
const pendingSectionFolderIds = ref<string[]>([])
const activeTreeMenuId = ref('')
const worldbookFloatingMenuKit = useSidebarFloatingMenuKit({ constrainHeight: false })
const floatingTreeMenuStyle = worldbookFloatingMenuKit.floatingMenuStyle
const sortDialogVisible = ref(false)
const sortDialogMode = ref<SortDialogMode>('layer')
const sortDialogTargetFolderId = ref('__root__')
const sortDialogItems = ref<SortDialogItem[]>([])
const sortDialogList = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const sortDialogMultiSelect = useMultiSelect({
  getOrderedIds: () => sortDialogItems.value.map((item) => item.id)
})
const sortDialogSelectedIds = sortDialogMultiSelect.selectedIds
const confirmDialog = ref<ConfirmDialogState>({ visible: false, title: '', message: '', confirmText: t('common.confirm') })
const pendingConfirmAction = ref<null | (() => void | Promise<void>)>(null)
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
const renameDialog = ref<RenameDialogState>({
  visible: false,
  type: 'document',
  sourceId: '',
  title: '',
  parentFolderPath: '/文档'
})
const worldbookClipboard = ref<WorldbookClipboardState>({
  mode: '',
  rowKind: 'document',
  ids: [],
  labels: [],
  entries: []
})
const worldbookMoveDialog = ref<WorldbookMoveDialogState>({
  visible: false,
  rowKind: 'document',
  sourceIds: [],
  sourceLabels: [],
  targetId: '',
  pathInput: ''
})
const worldDraftImportDialogVisible = ref(false)
const sillyTavernImportDialog = ref<SillyTavernImportDialogState>({
  visible: false,
  loading: false,
  applying: false,
  error: '',
  conflictStrategy: 'skip',
  preview: null
})
const worldbookUndoStack = ref<WorldbookHistoryPatch[]>([])
const worldbookRedoStack = ref<WorldbookHistoryPatch[]>([])
const isApplyingWorldbookHistory = ref(false)
const pendingWorldbookUnitStatus = ref<Record<string, 'saving' | 'deleting'>>({})
const manualTreeOrders = ref<Record<string, string[]>>({})
const docLibraryTreeNodes = ref<DocTreeNodeRecord[]>([])
const docLibraryTreeOrders = ref<Record<string, string[]>>({})
const docLibraryTreeDiffReport = ref<DocLibraryTreeDiffReport | undefined>(undefined)
const draftTitle = worldbookEditor.draftTitle
const draftPath = ref('')
const draftContent = worldbookEditor.draftContent
const draftCompileSummary = ref('')
const draftCompileTags = ref('')
const draftCompileRelationHints = ref('')
const draftSemanticType = ref<UnitSemanticType>('other')
const draftHistory = worldbookEditor.draftHistory
const draftHistoryIndex = worldbookEditor.draftHistoryIndex
watch(draftContent, () => {
  if (!isEditMode.value || docAuxPanelMode.value !== 'preview') return
  nextTick(() => syncDocumentScrollFromEditor())
})
const hasWorldbookClipboardData = computed(() => worldbookClipboard.value.entries.length > 0)
const worldbookRowDrag = useSidebarMultiDrag({
  getOrderedIds: () => visibleTreeRows.value.map((row) => row.id),
  getSelectedIds: () => selectedDocumentIds.value.map((id) => `document:${id}`)
})
const worldbookClusterDrag = useSidebarMultiDrag({
  getOrderedIds: () => worldbookClusters.value.map((row) => String(row.id || '').trim()).filter(Boolean),
  getSelectedIds: () => []
})
const worldbookDragModeKit = useSidebarDragModeKit<'worldbook'>({
  persistKey: 'langhuan_worldbook_drag_mode',
  defaultDragEnabled: false,
  defaultSinkContext: ''
})
const worldbookDragSortEnabled = computed(() => false)
const worldbookClusterSortOnly = computed(() => false)
const worldbookPreviewTarget = ref<WorldbookPreviewTarget | null>(null)
const worldbookAutoExpandState: WorldbookTreeAutoExpandState = {
  hoverKey: '',
  hoverStartedAt: 0,
  lastExpandedKey: '',
  lastExpandedAt: 0
}
const worldbookPointerDrag = useSidebarPointerDragKit<{
  pointerId: number
  rowId: string
  rowKind: WorldbookDragRowKind
  startX: number
  startY: number
}>({
  // 世界树不是普通扁平列表，所以这里只复用通用拖动骨架。
  // 页面层仍然要自己把“簇 / 枝 / 桠”映射成稳定 rowId，并定义 inside / before / after 的树型投放规则。
  onStartDrag(pending) {
    if (pending.rowKind === 'cluster') {
      worldbookClusterDrag.startDrag(pending.rowId)
      return
    }
    worldbookRowDrag.startDrag(pending.rowId)
  },
  onPreview(pending, point) {
    updateWorldbookPointerPreview(pending, point.x, point.y)
  },
  async onCommitDrop(pending) {
    await commitWorldbookPointerDrop(pending)
  },
  onClear() {
    worldbookPreviewTarget.value = null
    worldbookRowDrag.clearDragState()
    worldbookClusterDrag.clearDragState()
  }
})
const GENERIC_WORLD_BRANCH_NAMES = ['地点', '组织', '生物', '物品', '规则']

function updateDesktopViewport() {
  if (typeof window === 'undefined') return
  isDesktopViewport.value = window.innerWidth > 960
}

const { panelStyle: desktopTreePanelStyle, startResize: startTreeResize } = useResizablePanel({
  storageKey: 'langhuan_leaf_docs_sidebar_width',
  defaultWidth: 260,
  minWidth: 220,
  maxWidth: 360,
  enabled: computed(() => isDesktopViewport.value)
})

const treePanelResizable = computed(() => isDesktopViewport.value)
const treePanelStyle = computed(() => (treePanelResizable.value ? desktopTreePanelStyle.value : {}))
const { panelStyle: desktopDocAuxPanelStyle, startResize: startDocAuxPanelResize } = useResizablePanel({
  storageKey: 'langhuan_doc_library_aux_panel_width',
  defaultWidth: 460,
  minWidth: 380,
  maxWidth: 620,
  enabled: computed(() => isDesktopViewport.value && docAuxPanelMode.value !== 'none'),
  edge: 'left'
})
const docAuxPanelMounted = computed(() => docPreviewPanelMounted.value || docRelationPanelMounted.value)
const docAuxPanelResizable = computed(() => isDesktopViewport.value && docAuxPanelMode.value !== 'none')
const docAuxPanelStyle = computed(() => (docAuxPanelResizable.value ? desktopDocAuxPanelStyle.value : {}))

function slugify(input: string) { return slugifyDocLibraryPathSegment(input) }
function splitDisplayPath(displayPath: string) { return splitDocLibraryDisplayPath(displayPath) }
function normalizeDisplayPath(displayPath: string) { return normalizeDocLibraryDisplayPath(displayPath) }
function stripMarkdownExtension(name: string) { return stripDocLibraryMarkdownExtension(name) }
function formatRelativeTime(updatedAt: string) {
  const target = Date.parse(String(updatedAt || ''))
  if (!Number.isFinite(target)) return t('docLibrary.time.recentUpdate')
  const diff = Date.now() - target
  if (diff < 60_000) return t('docLibrary.time.justUpdated')
  if (diff < 3_600_000) return t('docLibrary.time.minutesAgo', { count: Math.max(1, Math.floor(diff / 60_000)) })
  if (diff < 86_400_000) return t('docLibrary.time.hoursAgo', { count: Math.max(1, Math.floor(diff / 3_600_000)) })
  return t('docLibrary.time.daysAgo', { count: Math.max(1, Math.floor(diff / 86_400_000)) })
}

function compareDisplayPath(a: string, b: string) {
  const result = compareDocLibraryDisplayPath(a, b)
  return sortDirection.value === 'asc' ? result : -result
}

function buildFolderPathChain(folderSegments: string[]): string[] {
  return buildDocLibraryFolderPathChain(folderSegments)
}

function getParentFolderPathFromDisplayPath(displayPath: string): string {
  return getDocLibraryParentFolderPath(displayPath, '/文档')
}

function getDisplayFileName(displayPath: string) {
  return getDocLibraryDisplayFileName(displayPath)
}

function getWorldbookDocumentMoveFileName(document: Pick<BrainDocumentRecord, 'displayPath' | 'title'>) {
  return chooseUnitTreeMarkdownFileName({
    currentFileName: getDisplayFileName(document.displayPath || ''),
    title: document.title || getDocumentSlugFromDisplayPath(document.displayPath || ''),
    slugify: (value, fallback) => slugifyDocLibraryPathSegment(value, fallback)
  })
}

function getBranchLabelFromTitle(title: string, fallback = '新枝') {
  const safeTitle = String(title || '').trim()
  const baseTitle = safeTitle.replace(/_总览$/u, '').trim()
  return baseTitle || fallback
}

function buildOverviewTitle(title: string) {
  return getBranchLabelFromTitle(title, '新枝')
}

function getWorldbookOverviewDocument(folderPath: string): DocRecord | null {
  const targetPath = buildWorldbookOverviewDisplayPath(folderPath)
  return documentRecords.value.find((item) => String(item.displayPath || '').trim() === targetPath) || null
}

function getWorldbookOverviewTitle(label: string) {
  return buildOverviewTitle(label || '新枝')
}

function splitCompileList(value: string | string[]): string[] {
  const source = Array.isArray(value) ? value.join('\n') : value
  return String(source || '')
    .split(/[\n,，]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitCompileTagList(value: string): string[] {
  return String(value || '')
    .split(/[\n，]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function trimReferenceSummary(value: unknown) {
  return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, 30)
}

function joinCompileList(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join('\n') : ''
}

function joinCompileInlineList(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join('，') : ''
}

function areStringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

function getDocumentPublicCompilePage(document: BrainDocumentRecord) {
  return normalizeBrainPublicCompilePage(document.publicCompilePage, {
    summary: document.summary,
    tags: document.tags,
    updatedAt: document.updatedAt
  })
}

const draftCompilePageModel = computed(() => ({
  summary: draftCompileSummary.value.trim(),
  tags: splitCompileTagList(draftCompileTags.value),
  relationHints: splitCompileList(draftCompileRelationHints.value)
}))
const draftPreviewHtml = computed(() => renderMarkdown(draftContent.value))

function applyDraftCompilePage(nextValue: { summary?: string; tags?: string[]; relationHints?: string[] }) {
  draftCompileSummary.value = String(nextValue.summary || '').trim()
  draftCompileTags.value = Array.isArray(nextValue.tags) ? nextValue.tags.map((item) => String(item || '').trim()).filter(Boolean).join('，') : ''
  draftCompileRelationHints.value = Array.isArray(nextValue.relationHints) ? nextValue.relationHints.map((item) => String(item || '').trim()).filter(Boolean).join('\n') : ''
}

function createActiveDocumentDraftSaveSnapshot() {
  const current = activeDocument.value
  return {
    documentId: String(current?.documentId || current?.id || '').trim(),
    title: draftTitle.value,
    path: draftPath.value,
    content: draftContent.value,
    compileSummary: draftCompileSummary.value,
    compileTags: draftCompileTags.value,
    compileRelationHints: draftCompileRelationHints.value,
    semanticType: draftSemanticType.value
  }
}

function isActiveDocumentDraftSaveSnapshotCurrent(snapshot: ReturnType<typeof createActiveDocumentDraftSaveSnapshot>) {
  const currentDocumentId = String(activeDocument.value?.documentId || activeDocument.value?.id || '').trim()
  return Boolean(snapshot.documentId)
    && snapshot.documentId === currentDocumentId
    && snapshot.title === draftTitle.value
    && snapshot.path === draftPath.value
    && snapshot.content === draftContent.value
    && snapshot.compileSummary === draftCompileSummary.value
    && snapshot.compileTags === draftCompileTags.value
    && snapshot.compileRelationHints === draftCompileRelationHints.value
    && snapshot.semanticType === draftSemanticType.value
}

function openCompilePageDialog() {
  if (!activeDocument.value) return
  isCompilePageDialogOpen.value = true
}

function saveCompilePageDialogDraft() {
  toast(t('docLibrary.toast.staged'), 'success')
}

async function saveCompilePageDialogApply() {
  await saveActiveDocument()
  if (!hasDraftChanges.value) {
    isCompilePageDialogOpen.value = false
  }
}

function revalidateCompilePageDialog() {
  toast(t('docLibrary.toast.revalidated'), 'success')
}

function buildDraftCompilePage(updatedAt: string) {
  return {
    summary: draftCompileSummary.value.trim(),
    tags: splitCompileTagList(draftCompileTags.value),
    relationHints: splitCompileList(draftCompileRelationHints.value),
    sourceState: 'manual_confirmed' as const,
    updatedAt
  }
}

function isCompileDraftChanged(document: BrainDocumentRecord) {
  const compilePage = getDocumentPublicCompilePage(document)
  return (
    draftCompileSummary.value !== compilePage.summary
    || draftCompileTags.value !== joinCompileInlineList(compilePage.tags)
    || draftCompileRelationHints.value !== joinCompileList(compilePage.relationHints)
    || draftSemanticType.value !== normalizeUnitSemanticType(document.semanticType)
  )
}

function getDocumentSlugFromDisplayPath(displayPath: string): string {
  return getDocLibraryDocumentSlugFromPath(displayPath, '')
}

const baseDocuments = computed(() => Array.isArray(charStore.documents) ? charStore.documents : [])
const docLibraryPersistence = useDocLibraryPersistence({
  getState: () => ({
    documents: cloneWorldbookDocuments(baseDocuments.value),
    manualTreeOrders: normalizeManualTreeOrders(manualTreeOrders.value),
    treeNodes: docLibraryTreeNodes.value,
    treeOrders: docLibraryTreeOrders.value,
    treeDiffReport: docLibraryTreeDiffReport.value,
    relationSystemState: normalizeRelationSystemState(relationSystemState.value)
  }),
  applySnapshot: applyDocLibraryTreeSnapshot,
  setDocuments: (documents) => charStore.setDocuments(documents),
  saveSnapshot: saveDocLibraryState,
  getParentFolderPathFromDisplayPath,
  onSaveError: (error) => {
    console.error('保存文档库失败', error)
  },
  onOperationStatus: ({ operation, status, target, mode }) => {
    const pendingStatus = mode === 'confirmed' && operation.patch.kind === 'delete' ? 'deleting' : 'saving'
    syncWorldbookPendingTarget(target, ['prepared', 'appliedLocal', 'committing'].includes(status) ? pendingStatus : '')
  }
})
const worldbookTransfer = useWorldbookTransfer({
  getDocuments: () => baseDocuments.value,
  getManualTreeOrders: () => manualTreeOrders.value,
  getRelationSystemState: () => relationSystemState.value
})
const documentRecords = computed<DocRecord[]>(() => baseDocuments.value.map((item) => {
  const segments = splitDisplayPath(item.displayPath)
  const fileName = segments[segments.length - 1] || item.title
  const folderSegments = segments.slice(0, -1)
  return { ...item, shortTitle: item.title || stripMarkdownExtension(fileName), slug: slugify(fileName), breadcrumbs: [...folderSegments, item.title || stripMarkdownExtension(fileName)], updatedLabel: formatRelativeTime(item.updatedAt), folderSegments }
}))
const readableFieldTreeSnapshot = computed(() => {
  const existingNodes = Array.isArray(docLibraryTreeNodes.value) ? docLibraryTreeNodes.value : []
  const existingOrders = normalizeTreeOrders(docLibraryTreeOrders.value)
  const report = docLibraryTreeDiffReport.value
  if (existingNodes.length > 0 && (!report || report.canUseFieldTree)) {
    return { treeNodes: existingNodes, treeOrders: existingOrders, treeDiffReport: report }
  }
  const rebuilt = buildDocLibraryTreeCommandResult({
    documents: cloneWorldbookDocuments(baseDocuments.value),
    manualTreeOrders: normalizeManualTreeOrders(manualTreeOrders.value),
    treeNodes: existingNodes,
    treeOrders: existingOrders,
    treeDiffReport: report,
    relationSystemState: normalizeRelationSystemState(relationSystemState.value)
  })
  return {
    treeNodes: rebuilt.treeNodes || [],
    treeOrders: normalizeTreeOrders(rebuilt.treeOrders),
    treeDiffReport: rebuilt.treeDiffReport
  }
})
const docLibraryProjectionInput = computed<DocLibraryProjectionInput>(() => ({
  documents: cloneWorldbookDocuments(baseDocuments.value),
  manualTreeOrders: normalizeManualTreeOrders(manualTreeOrders.value),
  treeNodes: readableFieldTreeSnapshot.value.treeNodes,
  treeOrders: readableFieldTreeSnapshot.value.treeOrders,
  treeDiffReport: readableFieldTreeSnapshot.value.treeDiffReport
}))
const docLibraryProjection = createProgressiveHydrationController<DocLibraryProjectionInput, UnitViewAdapterResult>({
  buildShell: (input) => buildDocLibrarySidebarShellUnitView(input.documents, input.manualTreeOrders),
  hydrate: (input) => getCachedDocLibraryUnitView(input.documents, input.manualTreeOrders, {
    treeNodes: input.treeNodes,
    treeOrders: input.treeOrders,
    treeDiffReport: input.treeDiffReport
  }),
  onResult: (result, stage, token) => {
    if (token !== docLibraryProjection.getToken()) return
    docLibraryProjectionResult.value = result
  },
  onStage: (stage) => {
    docLibraryProjectionStage.value = stage
  },
  onError: (error) => {
    console.error('文档库后台投影失败', error)
  }
})
const docLibraryUnitView = computed(() => {
  const projected = docLibraryProjectionResult.value
  return projected || buildDocLibrarySidebarShellUnitView(baseDocuments.value, manualTreeOrders.value)
})
watch(docLibraryProjectionInput, (input) => {
  if (docLibraryProjectionStage.value === 'idle') {
    docLibraryProjection.start(input)
    return
  }
  docLibraryProjection.refresh(input)
}, { immediate: true, deep: true })
const relationReadModel = computed(() => buildRelationSystemReadModel([
  docLibraryUnitView.value
], relationSystemState.value))
const relationHintValidationReadModel = relationReadModel
const relationHintValidationItems = computed(() => buildRelationHintValidationItems(
  relationHintValidationReadModel.value,
  docLibraryUnitView.value.warnings
))
const relationHintReferenceCandidates = computed(() => relationHintValidationReadModel.value.units
  .filter((unit) => unit.unitType !== 'root')
  .map((unit) => {
    const referenceTitle = formatRelationHintReferenceTitle(unit)
    return {
      unitId: unit.unitId,
      title: String(unit.title || '').trim(),
      referenceTitle,
      refId: getUnitRelationRefId(unit),
      path: String(unit.sourcePath || '').trim(),
      summary: trimReferenceSummary(unit.compilePage?.summary || unit.body || '')
    }
  })
  .filter((item) => item.title && item.referenceTitle && item.refId))
const activeRelationHintValidationItems = computed(() => {
  const activeDocumentId = String(activeDocument.value?.documentId || '').trim()
  if (!activeDocumentId) return []
  const activeUnit = docLibraryUnitView.value.units.find((unit) => (
    (unit.unitType === 'leaf' && String(unit.sourceId || '').trim() === activeDocumentId)
    || String(unit.metadata?.overviewDocumentId || '').trim() === activeDocumentId
  ))
  if (!activeUnit) return []
  return relationHintValidationItems.value.filter((item) => item.ownerUnitId === activeUnit.unitId)
})
const compileDialogErrorCount = computed(() => activeRelationHintValidationItems.value.filter((item) => item.status === 'warning').length)
const compileDialogStatusText = computed(() => formatCompilePageEntryStatus(activeCompilePage.value, compileDialogErrorCount.value))
const compileDialogStatusWarning = computed(() => isCompilePageEntryStatusWarning(compileDialogStatusText.value))
const relationUnitMap = computed(() => new Map(relationReadModel.value.units.map((unit) => [unit.unitId, unit] as const)))
const relationPredicateMap = computed(() => new Map(relationReadModel.value.predicates.map((predicate) => [predicate.predicateId, predicate] as const)))
const activeDocumentRelationUnit = computed(() => {
  const overviewContext = activeOverviewDocumentContext.value
  if (overviewContext) {
    const overviewUnit = docLibraryUnitView.value.units.find((unit) => (
      unit.domain === 'docLibrary'
      && unit.unitType !== 'leaf'
      && unit.sourcePath === overviewContext.folderPath
    ))
    if (overviewUnit) return overviewUnit
  }
  const documentId = String(activeDocument.value?.documentId || '').trim()
  return docLibraryUnitView.value.units.find((unit) => unit.unitType === 'leaf' && String(unit.sourceId || '').trim() === documentId)
    || docLibraryUnitView.value.units[0]
    || null
})
const docRelationActiveUnit = computed(() => (
  docLibraryUnitView.value.units.find((unit) => unit.unitId === docRelationUnitId.value)
  || activeDocumentRelationUnit.value
))
const docRelationProjectionCharacter = computed(() => createRelationProjectionCharacter('doc-library-relation', '世界树'))
const relationGraphRelations = computed<RelationViewRecord[]>(() => [
  ...relationReadModel.value.projectedRelations,
  ...relationReadModel.value.declaredRelations,
  ...relationReadModel.value.candidateRelations,
  ...relationReadModel.value.confirmedRelations
])
const docLibraryWorldClusterProjection = computed(() => buildDocLibraryWorldClusterRelationProjection(
  docLibraryUnitView.value.units,
  relationGraphRelations.value
))
const docLibraryRelationSource = computed(() => createUnitRelationSourceAdapter({
  characterId: 'doc-library-relation',
  title: '世界树',
  activeUnit: docRelationActiveUnit.value,
  units: docLibraryUnitView.value.units,
  predicates: relationReadModel.value.predicates,
  relations: docLibraryWorldClusterProjection.value.relations,
  projectionForestRootUnitIds: docLibraryWorldClusterProjection.value.forestRootUnitIds,
  predicateFilter: {
    statuses: ['projection', 'declared', 'authored', 'candidate', 'confirmed']
  },
  projectionCharacter: docRelationProjectionCharacter.value,
  clipboard: {
    mode: worldbookClipboard.value.mode,
    unitIds: resolveDocLibraryRelationClipboardUnitIds(
      worldbookClipboard.value.entries,
      docLibraryUnitView.value.units
    ),
    writable: true
  },
  copyUnits: handleRelationGraphCopyUnits,
  cutUnits: handleRelationGraphCutUnits,
  pasteUnits: handleRelationGraphPasteUnits
}))
const canCreateRelationPredicate = computed(() => predicateDraft.value.label.trim().length > 0 && predicateDraft.value.key.trim().length > 0)

const folderTree = computed(() => {
  const roots = new Map<string, FolderBuilder>()
  const documentsById = new Map(documentRecords.value.map((item) => [String(item.documentId || '').trim(), item] as const))
  const nodes = readableFieldTreeSnapshot.value.treeNodes
  const nodeById = new Map(nodes.map((node) => [String(node.nodeId || '').trim(), node] as const))
  const foldersById = new Map<string, FolderBuilder>()

  const resolveFolderPath = (nodeId: string): string => {
    const node = nodeById.get(nodeId)
    if (!node || node.nodeKind === 'root') return ''
    if (node.legacyDisplayPath) return normalizeDisplayPath(node.legacyDisplayPath)
    const names: string[] = [node.title || t('common.unnamed')]
    const visited = new Set<string>([nodeId])
    let currentParentId = String(node.parentId || '').trim()
    while (currentParentId && currentParentId !== DOC_TREE_ROOT_NODE_ID && !visited.has(currentParentId)) {
      visited.add(currentParentId)
      const parent = nodeById.get(currentParentId)
      if (!parent || parent.nodeKind === 'root') break
      names.unshift(parent.title || t('common.unnamed'))
      currentParentId = String(parent.parentId || '').trim()
    }
    return `/${names.filter(Boolean).join('/')}`
  }

  const createFolder = (node: DocTreeNodeRecord): FolderBuilder => {
    const nodeId = String(node.nodeId || '').trim()
    const parentId = String(node.parentId || DOC_TREE_ROOT_NODE_ID).trim() || DOC_TREE_ROOT_NODE_ID
    const folderPath = resolveFolderPath(nodeId)
    const parentFolderPath = parentId === DOC_TREE_ROOT_NODE_ID ? '' : resolveFolderPath(parentId)
    return {
      id: nodeId,
      label: node.title || folderPath.split('/').filter(Boolean).pop() || t('common.unnamed'),
      folderPath,
      parentId,
      parentFolderPath,
      children: new Map(),
      documents: []
    }
  }

  nodes
    .filter((node) => node.nodeKind === 'folder')
    .forEach((node) => {
      const folder = createFolder(node)
      foldersById.set(folder.id, folder)
    })

  foldersById.forEach((folder) => {
    if (folder.parentId === DOC_TREE_ROOT_NODE_ID) {
      roots.set(folder.id, folder)
      return
    }
    const parent = foldersById.get(folder.parentId)
    if (parent) {
      parent.children.set(folder.id, folder)
    } else {
      roots.set(folder.id, folder)
    }
  })

  nodes
    .filter((node) => node.nodeKind === 'document' && node.documentId)
    .forEach((node) => {
      const document = documentsById.get(String(node.documentId || '').trim())
      if (!document) return
      const parentId = String(node.parentId || DOC_TREE_ROOT_NODE_ID).trim() || DOC_TREE_ROOT_NODE_ID
      const parent = foldersById.get(parentId)
      if (parent) {
        parent.documents.push(document)
        return
      }
      let fallbackRoot = roots.get('doc-tree:fallback')
      if (!fallbackRoot) {
        fallbackRoot = {
          id: 'doc-tree:fallback',
          label: '文档',
          folderPath: '/文档',
          parentId: DOC_TREE_ROOT_NODE_ID,
          parentFolderPath: '',
          children: new Map(),
          documents: []
        }
        roots.set(fallbackRoot.id, fallbackRoot)
      }
      fallbackRoot.documents.push(document)
    })

  return roots
})

const worldbookClusters = computed<TreeCluster[]>(() => {
  const roots = Array.from(folderTree.value.values())
  const rootMap = new Map(roots.map((item) => [item.id, item] as const))
  const orderedRootIds = getOrderedTreeChildNodeIds(DOC_TREE_ROOT_NODE_ID, roots.map((item) => item.id), [])
  return orderedRootIds
    .map((entryId) => String(entryId || '').replace(/^folder:/, ''))
    .map((folderId) => rootMap.get(folderId))
    .filter((item): item is FolderBuilder => Boolean(item))
    .map((item) => ({
      id: item.id,
      label: item.label,
      folderPath: item.folderPath,
      children: item.children,
      documents: item.documents
    }))
})

const renderedWorldbookSidebarClusters = computed<SidebarClusterRow[]>(() => {
  const clusters = worldbookSidebarClusters.value
  if (!worldbookClusterDrag.projectedOrder.value.length) return clusters
  const clusterMap = new Map(clusters.map((cluster) => [String(cluster.id || '').trim(), cluster] as const))
  return worldbookClusterDrag.projectedOrder.value
    .map((id) => clusterMap.get(String(id || '').trim()))
    .filter((cluster): cluster is SidebarClusterRow => Boolean(cluster))
})

const folderLookup = computed(() => {
  const map = new Map<string, FolderBuilder>()
  const walk = (folder: FolderBuilder) => {
    map.set(folder.id, folder)
    map.set(folder.folderPath, folder)
    Array.from(folder.children.values()).forEach(walk)
  }
  Array.from(folderTree.value.values()).forEach(walk)
  return map
})

const singleSelectedWorldbookSelection = computed(() => {
  if (activeLibraryTab.value !== 'worldbook') return null
  if (worldbookSelectionKit.selectedIds.value.length !== 1) return null
  return parseWorldbookSelectionId(worldbookSelectionKit.selectedIds.value[0] || '')
})

const selectedWorldbookContainer = computed(() => {
  const selection = singleSelectedWorldbookSelection.value
  if (!selection || selection.kind === 'document') return null
  if (selection.kind === 'cluster') {
    const cluster = worldbookClusters.value.find((item) => item.id === selection.id)
    return cluster ? { kind: 'cluster' as const, folderPath: cluster.folderPath, label: cluster.label } : null
  }
  const folder = folderLookup.value.get(selection.id)
  return folder ? { kind: 'folder' as const, folderPath: folder.folderPath, label: folder.label } : null
})

function getFolderPathByTreeId(folderIdOrPath: string) {
  const safeId = String(folderIdOrPath || '').trim()
  return folderLookup.value.get(safeId)?.folderPath || safeId
}

function getFolderTreeIdByPath(folderPath: string) {
  const safePath = normalizeDisplayPath(folderPath)
  return folderLookup.value.get(safePath)?.id || safePath
}

const activeContainerDocument = computed<DocRecord | null>(() => {
  const container = selectedWorldbookContainer.value
  if (!container) return null
  return getWorldbookOverviewDocument(container.folderPath)
})

const activeOverviewDocumentContext = computed(() => {
  const container = selectedWorldbookContainer.value
  const document = activeContainerDocument.value
  if (!container || !document) return null
  const documentId = String(document.documentId || document.id || '').trim()
  if (!documentId || !isWorldbookOverviewDocument(document, container.folderPath)) return null
  const pathParts = splitDocLibraryDisplayPath(container.folderPath)
  return {
    kind: container.kind,
    documentId,
    folderPath: container.folderPath,
    title: container.label || pathParts[pathParts.length - 1] || t('common.unnamed'),
    pathParts
  }
})

const allFolderIds = computed(() => {
  const ids: string[] = []
  const walk = (folder: FolderBuilder) => {
    ids.push(folder.id)
    Array.from(folder.children.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN')).forEach(walk)
  }
  Array.from(folderTree.value.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN')).forEach(walk)
  return ids
})

function getOrderedChildIds(parentFolderId: string, folderIds: string[], documentIds: string[]) {
  const currentOrder = manualTreeOrders.value[parentFolderId] || []
  const knownIds = [...folderIds.map((id) => `folder:${id}`), ...documentIds.map((id) => `document:${id}`)]
  const orderRank = new Map(currentOrder.map((id, index) => [id, index]))
  return knownIds.sort((left, right) => {
    const leftRank = orderRank.get(left)
    const rightRank = orderRank.get(right)
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1
      if (rightRank === undefined) return -1
      return leftRank - rightRank
    }
    return left.localeCompare(right, 'zh-Hans-CN')
  })
}

const documentTreeNodeIdByDocumentId = computed(() => buildDocumentTreeNodeIdIndex(readableFieldTreeSnapshot.value.treeNodes))

function getOrderedTreeChildNodeIds(parentNodeId: string, folderNodeIds: string[], documentIds: string[]) {
  return orderDocLibraryTreeChildNodeIds({
    parentNodeId,
    folderNodeIds,
    documentIds,
    treeOrders: readableFieldTreeSnapshot.value.treeOrders,
    documentTreeNodeIdByDocumentId: documentTreeNodeIdByDocumentId.value
  })
}

function isFolderOpen(folderId: string) { return openFolderIds.value.includes(folderId) }
function isClusterOpen(clusterId: string) { return openClusterIds.value.includes(clusterId) }

function countClusterDocuments(cluster: TreeCluster): number {
  let count = cluster.documents.length
  const walk = (folder: FolderBuilder) => {
    count += folder.documents.length
    Array.from(folder.children.values()).forEach(walk)
  }
  Array.from(cluster.children.values()).forEach(walk)
  return count
}

function flattenFolder(folder: FolderBuilder, depth: number, rows: TreeRow[], clusterId: string) {
  rows.push({
    id: `folder:${folder.id}`,
    kind: 'folder',
    label: folder.label,
    depth,
    folderId: folder.id,
    folderPath: folder.folderPath,
    parentFolderId: folder.parentId,
    parentFolderPath: folder.parentFolderPath || '/',
    clusterId
  })
  if (!isFolderOpen(folder.id)) return
  const folderEntries = Array.from(folder.children.values())
  const documentEntries = Array.from(folder.documents).filter((item) => !isWorldbookOverviewDocument(item, folder.folderPath))
  const folderEntryById = new Map<string, FolderBuilder>()
  folderEntries.forEach((entry) => {
    folderEntryById.set(entry.id, entry)
    folderEntryById.set(`folder:${entry.id}`, entry)
  })
  const documentEntryById = new Map<string, DocRecord>()
  documentEntries.forEach((entry) => {
    const documentId = String(entry.documentId || '').trim()
    documentEntryById.set(`doc:${encodeURIComponent(documentId).replace(/%/g, '~')}`, entry)
    documentEntryById.set(`document:${documentId}`, entry)
  })
  const orderedIds = getOrderedTreeChildNodeIds(folder.id, folderEntries.map((item) => item.id), documentEntries.map((item) => item.documentId))
  for (const entryId of orderedIds) {
    const child = folderEntryById.get(entryId)
    if (child) {
      if (child) flattenFolder(child, depth + 1, rows, clusterId)
      continue
    }
    const doc = documentEntryById.get(entryId)
    if (doc) {
      rows.push({
        id: `document:${doc.documentId}`,
        kind: 'document',
        label: doc.shortTitle,
        depth: depth + 1,
        documentId: doc.documentId,
        parentFolderId: folder.id,
        parentFolderPath: folder.folderPath,
        clusterId
      })
    }
  }
}

function flattenCluster(cluster: TreeCluster, rows: TreeRow[]) {
  const folderEntries = Array.from(cluster.children.values())
  const documentEntries = Array.from(cluster.documents).filter((item) => !isWorldbookOverviewDocument(item, cluster.folderPath))
  const folderEntryById = new Map<string, FolderBuilder>()
  folderEntries.forEach((entry) => {
    folderEntryById.set(entry.id, entry)
    folderEntryById.set(`folder:${entry.id}`, entry)
  })
  const documentEntryById = new Map<string, DocRecord>()
  documentEntries.forEach((entry) => {
    const documentId = String(entry.documentId || '').trim()
    documentEntryById.set(`doc:${encodeURIComponent(documentId).replace(/%/g, '~')}`, entry)
    documentEntryById.set(`document:${documentId}`, entry)
  })
  const orderedIds = getOrderedTreeChildNodeIds(cluster.id, folderEntries.map((item) => item.id), documentEntries.map((item) => item.documentId))
  for (const entryId of orderedIds) {
    const folder = folderEntryById.get(entryId)
    if (folder) {
      if (folder) flattenFolder(folder, 0, rows, cluster.id)
      continue
    }
    const doc = documentEntryById.get(entryId)
    if (doc) {
      rows.push({
        id: `document:${doc.documentId}`,
        kind: 'document',
        label: doc.shortTitle,
        depth: 0,
        documentId: doc.documentId,
        parentFolderId: cluster.id,
        parentFolderPath: cluster.folderPath,
        clusterId: cluster.id
      })
    }
  }
}

const visibleTreeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = []
  for (const cluster of worldbookClusters.value) {
    if (!isClusterOpen(cluster.id)) continue
    flattenCluster(cluster, rows)
  }
  return rows
})

const renderedWorldbookRows = computed<TreeRow[]>(() => {
  const rows = visibleTreeRows.value
  const projectedOrder = worldbookRowDrag.projectedOrder.value
  if (!projectedOrder.length) return rows
  const rowMap = new Map(rows.map((row) => [row.id, row] as const))
  const projectedRows = projectedOrder
    .map((id) => rowMap.get(id))
    .filter((row): row is TreeRow => Boolean(row))
  return projectedRows.length === rows.length ? projectedRows : rows
})

const renderedWorldbookRowsByCluster = computed<Record<string, TreeRow[]>>(() => {
  const grouped: Record<string, TreeRow[]> = {}
  renderedWorldbookRows.value.forEach((row) => {
    if (!grouped[row.clusterId]) {
      grouped[row.clusterId] = []
    }
    grouped[row.clusterId].push(row)
  })
  return grouped
})

const docLibraryUnitRootId = computed(() => (
  docLibraryUnitView.value.units.find((unit) => unit.domain === 'docLibrary' && unit.unitType === 'root')?.unitId || DOC_TREE_ROOT_NODE_ID
))

const docLibraryUnitChildrenByParentId = computed(() => {
  const map = new Map<string, UnitView[]>()
  const clusterRank = new Map(renderedWorldbookSidebarClusters.value.map((cluster, index) => [cluster.id, index] as const))
  const rowRank = new Map(renderedWorldbookRows.value.map((row, index) => [row.id, index] as const))
  docLibraryUnitView.value.units.forEach((unit) => {
    if (unit.domain !== 'docLibrary' || unit.unitId === docLibraryUnitRootId.value) return
    const parentId = String(unit.parentId || '').trim()
    if (!parentId) return
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId)?.push(unit)
  })
  map.forEach((items) => {
    items.sort((left, right) => {
      const leftRank = left.parentId === docLibraryUnitRootId.value
        ? clusterRank.get(getWorldbookUnitClusterId(left))
        : rowRank.get(getWorldbookUnitSelectionId(left))
      const rightRank = right.parentId === docLibraryUnitRootId.value
        ? clusterRank.get(getWorldbookUnitClusterId(right))
        : rowRank.get(getWorldbookUnitSelectionId(right))
      if (typeof leftRank === 'number' || typeof rightRank === 'number') {
        const rankCompare = Number(leftRank ?? 999999) - Number(rightRank ?? 999999)
        if (rankCompare !== 0) return rankCompare
      }
      const orderCompare = Number(left.orderIndex ?? 9999) - Number(right.orderIndex ?? 9999)
      if (orderCompare !== 0) return orderCompare
      return left.title.localeCompare(right.title, 'zh-Hans-CN')
    })
  })
  return map
})

const worldbookRenderedRowByFolderId = computed(() => {
  const map = new Map<string, TreeFolderRow>()
  renderedWorldbookRows.value.forEach((row) => {
    if (row.kind === 'folder') map.set(row.folderId, row)
  })
  return map
})

const worldbookRenderedRowByDocumentId = computed(() => {
  const map = new Map<string, TreeDocumentRow>()
  renderedWorldbookRows.value.forEach((row) => {
    if (row.kind === 'document') map.set(row.documentId, row)
  })
  return map
})

const worldbookClusterById = computed(() => new Map(worldbookClusters.value.map((cluster) => [cluster.id, cluster] as const)))

function getWorldbookUnitSourceId(unit: UnitView) {
  return String(unit.sourceId || '').trim()
}

function getWorldbookUnitSourceKind(unit: UnitView): WorldbookSoneTreeRow['sourceKind'] {
  if (unit.unitType === 'cluster') return 'cluster'
  if (unit.unitType === 'leaf') return 'document'
  return 'folder'
}

function getWorldbookUnitClusterId(unit: UnitView) {
  return getWorldbookUnitSourceId(unit) || unit.unitId
}

function getWorldbookUnitFolderId(unit: UnitView) {
  return getWorldbookUnitSourceId(unit) || unit.unitId
}

function getWorldbookUnitDocumentId(unit: UnitView) {
  return getWorldbookUnitSourceId(unit) || unit.unitId.replace(/^doc:/, '')
}

function getWorldbookUnitSelectionId(unit: UnitView) {
  const sourceKind = getWorldbookUnitSourceKind(unit)
  if (sourceKind === 'cluster') return getWorldbookClusterSelectionId(getWorldbookUnitClusterId(unit))
  if (sourceKind === 'folder') return `folder:${getWorldbookUnitFolderId(unit)}`
  return `document:${getWorldbookUnitDocumentId(unit)}`
}

function getWorldbookUnitSourceRow(unit: UnitView): TreeRow | undefined {
  const sourceKind = getWorldbookUnitSourceKind(unit)
  if (sourceKind === 'folder') return worldbookRenderedRowByFolderId.value.get(getWorldbookUnitFolderId(unit))
  if (sourceKind === 'document') return worldbookRenderedRowByDocumentId.value.get(getWorldbookUnitDocumentId(unit))
  return undefined
}

function getWorldbookClusterSelectionId(clusterId: string) {
  return `cluster:${String(clusterId || '').trim()}`
}

function getWorldbookRowSelectionId(row: TreeRow) {
  return row.kind === 'folder' ? `folder:${row.folderId}` : `document:${row.documentId}`
}

function parseWorldbookSelectionId(value: string) {
  const safeValue = String(value || '').trim()
  if (!safeValue) return null
  if (safeValue.startsWith('cluster:')) {
    return { kind: 'cluster' as const, id: safeValue.replace(/^cluster:/, '') }
  }
  if (safeValue.startsWith('folder:')) {
    return { kind: 'folder' as const, id: safeValue.replace(/^folder:/, '') }
  }
  if (safeValue.startsWith('document:')) {
    return { kind: 'document' as const, id: safeValue.replace(/^document:/, '') }
  }
  return null
}

const worldbookSelectionKit = useSidebarSelectionMenuKit({
  getOrderedIds: () => {
    const ids: string[] = []
    worldbookClusters.value.forEach((cluster) => {
      ids.push(getWorldbookClusterSelectionId(cluster.id))
      ;(visibleTreeRows.value.filter((row) => row.clusterId === cluster.id) || []).forEach((row) => {
        ids.push(getWorldbookRowSelectionId(row))
      })
    })
    return ids
  },
  getRenderedIds: () => {
    const ids: string[] = []
    worldbookClusters.value.forEach((cluster) => {
      ids.push(getWorldbookClusterSelectionId(cluster.id))
      ;(renderedWorldbookRowsByCluster.value[cluster.id] || []).forEach((row) => {
        ids.push(getWorldbookRowSelectionId(row))
      })
    })
    return ids
  }
})
const worldbookMultiSelect = {
  selectedIds: worldbookSelectionKit.selectedIds,
  selectionMode: worldbookSelectionKit.selectionMode,
  isSelected: worldbookSelectionKit.isSelected,
  clearSelection: worldbookSelectionKit.clearSelection,
  selectOnly: worldbookSelectionKit.selectOnly,
  handleItemClick: worldbookSelectionKit.handleItemClick,
  handlePointerDown: worldbookSelectionKit.handlePointerDown,
  handlePointerMove: worldbookSelectionKit.handlePointerMove,
  handlePointerEnd: worldbookSelectionKit.handlePointerEnd
}
const documentMultiSelect = {
  selectedIds: computed(() => worldbookSelectionKit.selectedIds.value
    .map((item) => parseWorldbookSelectionId(item))
    .filter((item): item is { kind: 'document'; id: string } => item?.kind === 'document')
    .map((item) => item.id)),
  selectionMode: worldbookMultiSelect.selectionMode,
  isSelected: (documentId: string) => worldbookMultiSelect.isSelected(`document:${String(documentId || '').trim()}`),
  clearSelection: worldbookMultiSelect.clearSelection,
  selectOnly: (documentId: string) => worldbookMultiSelect.selectOnly(`document:${String(documentId || '').trim()}`),
  handleItemClick: (payload: { id: string; event: MouseEvent | PointerEvent; onDefault?: () => void }) => worldbookMultiSelect.handleItemClick({
    ...payload,
    id: `document:${String(payload.id || '').trim()}`
  }),
  handlePointerDown: (documentId: string, event: PointerEvent) => worldbookMultiSelect.handlePointerDown(`document:${String(documentId || '').trim()}`, event),
  handlePointerMove: worldbookMultiSelect.handlePointerMove,
  handlePointerEnd: worldbookMultiSelect.handlePointerEnd
}

const worldbookTreeController = useWorldbookTreeController<UnitView, TreeRow, WorldbookMenuItem>({
  rootId: docLibraryUnitRootId,
  childrenByParentId: docLibraryUnitChildrenByParentId,
  getSourceKind: getWorldbookUnitSourceKind,
  getSourceRow: getWorldbookUnitSourceRow,
  getClusterId: getWorldbookUnitClusterId,
  getFolderId: getWorldbookUnitFolderId,
  getDocumentId: getWorldbookUnitDocumentId,
  getSelectionId: getWorldbookUnitSelectionId,
  isClusterOpen,
  isFolderOpen,
  isClusterSelected: isWorldbookClusterSelected,
  isRowSelected: isWorldbookRowSelected,
  isDocumentVisuallyActive: isWorldbookDocumentVisuallyActive,
  isSelected: worldbookMultiSelect.isSelected,
  hasAdjacentSelectedDocument,
  isClipboardPending: isWorldbookClipboardPending,
  hasCluster: (clusterId) => Boolean(worldbookClusterById.value.get(clusterId)),
  shouldShowRowMenuAction: shouldShowWorldbookMenuAction,
  isClusterMenuOpen: isWorldbookClusterMenuOpen,
  isRowMenuOpen: isWorldbookRowMenuOpen,
  getClusterMenuItems: getWorldbookClusterMenuItems,
  getRowMenuItems: getWorldbookMenuItems,
  isClusterDragging: isWorldbookClusterDragging,
  isRowDragging: isWorldbookRowDragging,
  isClusterDropTarget: isWorldbookClusterDropTarget,
  isRowDropTarget: isWorldbookRowDropTarget,
  isClusterPreviewShift: isWorldbookClusterPreviewShift,
  isRowPreviewShift: isWorldbookRowPreviewShift
})
const baseWorldbookSoneTreeRows = worldbookTreeController.rows
const worldbookSoneRowMap = worldbookTreeController.rowById
const docLibraryCompilePageIndicatorLookup = computed(() => (
  buildUnitCompilePageIndicatorLookup(docLibraryUnitView.value)
))
const worldbookSoneTreeRows = computed(() => baseWorldbookSoneTreeRows.value.map((row) => ({
  ...row,
  subtitle: pendingWorldbookUnitStatus.value[row.id] === 'deleting'
    ? t('brain.roleWorkspace.deleting')
    : pendingWorldbookUnitStatus.value[row.id] === 'saving'
      ? t('brain.roleWorkspace.saving')
      : row.subtitle,
  cutPending: row.cutPending || pendingWorldbookUnitStatus.value[row.id] === 'deleting',
  compilePageIndicator: pendingWorldbookUnitStatus.value[row.id] === 'saving'
    ? { missing: true, title: t('brain.roleWorkspace.savingHint') }
    : resolveWorldbookCompilePageIndicator(row)
})))

function resolveWorldbookCompilePageIndicator(row: WorldbookSoneTreeRow) {
  return resolveCompilePageIndicatorByKeys([
    row.unit.unitId,
    row.unit.sourceId,
    row.unit.sourcePath,
    row.sourceRow?.id,
    row.sourceRow?.clusterId,
    getWorldbookUnitSourceId(row.unit),
    getWorldbookUnitDocumentId(row.unit),
    getWorldbookUnitFolderId(row.unit),
    getWorldbookUnitClusterId(row.unit)
  ])
}

function resolveWorldbookSidebarRowCompilePageIndicator(row: TreeRow) {
  return row.kind === 'folder'
    ? resolveCompilePageIndicatorByKeys([row.folderId, row.folderPath, row.id])
    : resolveCompilePageIndicatorByKeys([row.documentId, row.id])
}

function resolveWorldbookSidebarClusterCompilePageIndicator(cluster: TreeCluster) {
  return resolveCompilePageIndicatorByKeys([cluster.id, cluster.folderPath])
}

function resolveCompilePageIndicatorByKeys(keys: Array<unknown>) {
  const lookup = docLibraryCompilePageIndicatorLookup.value
  for (const key of keys) {
    const indicator = lookup.get(String(key || '').trim())
    if (indicator) return indicator
  }
  return undefined
}

function getWorldbookPendingRowIdsForTarget(target: DocLibraryPersistenceOperationTarget) {
  const ids = new Set<string>()
  const documentIds = new Set(target.documentIds.map((id) => String(id || '').trim()).filter(Boolean))
  const folderPaths = new Set(target.folderPaths.map((path) => normalizeWorldbookFolderPathForCompare(path)).filter(Boolean))
  baseWorldbookSoneTreeRows.value.forEach((row) => {
    const rowDocumentId = row.sourceKind === 'document' ? getWorldbookUnitDocumentId(row.unit) : ''
    const rowFolderId = row.sourceKind === 'cluster'
      ? getWorldbookUnitClusterId(row.unit)
      : row.sourceKind === 'folder'
        ? getWorldbookUnitFolderId(row.unit)
        : ''
    if (rowDocumentId && documentIds.has(rowDocumentId)) ids.add(row.id)
    if (rowFolderId && folderPaths.has(normalizeWorldbookFolderPathForCompare(rowFolderId))) ids.add(row.id)
  })
  return [...ids]
}

function syncWorldbookPendingTarget(target: DocLibraryPersistenceOperationTarget, status: 'saving' | 'deleting' | '') {
  const rowIds = getWorldbookPendingRowIdsForTarget(target)
  if (!rowIds.length) return
  const next = { ...pendingWorldbookUnitStatus.value }
  rowIds.forEach((rowId) => {
    if (status) {
      next[rowId] = next[rowId] === 'deleting' ? 'deleting' : status
    } else {
      delete next[rowId]
    }
  })
  pendingWorldbookUnitStatus.value = next
}

const activeDocument = computed<DocRecord | null>(() => {
  if (selectedWorldbookContainer.value) {
    return activeContainerDocument.value
  }
  return documentRecords.value.find((item) => item.documentId === selectedDocumentId.value) || documentRecords.value[0] || null
})
const activeDocumentDisplayTitle = computed(() => activeOverviewDocumentContext.value?.title || activeDocument.value?.title || '')
const activeDocumentPathParts = computed(() => {
  const overviewContext = activeOverviewDocumentContext.value
  if (overviewContext) return [...overviewContext.pathParts]
  return activeDocument.value ? [...activeDocument.value.breadcrumbs] : []
})
const activeDocumentPathText = computed(() => activeDocumentPathParts.value.length ? `/${activeDocumentPathParts.value.join('/')}` : '')
const editorPathParts = computed(() => {
  const current = activeDocument.value
  if (!current) return []
  const parts = activeDocumentPathParts.value.length
    ? [...activeDocumentPathParts.value]
    : splitDisplayPath(current.displayPath).map((part, index, list) => (
        index === list.length - 1 ? stripMarkdownExtension(part) : part
      ))
  if (isEditMode.value && parts.length) {
    parts[parts.length - 1] = draftTitle.value.trim() || parts[parts.length - 1]
  }
  return parts
})
const activeCompilePage = computed(() => (
  activeDocument.value
    ? getDocumentPublicCompilePage(activeDocument.value)
    : {
        summary: '',
        tags: [],
        relationHints: [],
        sourceState: 'needs_review' as const,
        updatedAt: ''
      }
))
const activeSemanticType = computed(() => normalizeUnitSemanticType(activeDocument.value?.semanticType))
const viewerWorkspaceWindow = computed<WorkspaceWindowRecord | null>(() => (
  activeDocument.value
    ? createUnitWorkspaceWindow({
        domain: 'docLibrary',
        id: 'document-viewer',
        kind: 'viewer',
        title: activeDocumentDisplayTitle.value || t('docLibrary.aux.browse'),
        unitId: activeDocument.value.documentId,
        sourceId: activeDocument.value.documentId,
        sourceKind: 'document',
        closable: false
      })
    : null
))
const editorWorkspaceWindow = computed<WorkspaceWindowRecord | null>(() => (
  activeDocument.value && isEditMode.value
    ? createUnitWorkspaceWindow({
        domain: 'docLibrary',
        id: 'document-editor',
        kind: 'editor',
        title: activeDocumentDisplayTitle.value ? `${activeDocumentDisplayTitle.value} · ${t('docLibrary.aux.editSuffix')}` : t('docLibrary.aux.editSuffix'),
        unitId: activeDocument.value.documentId,
        sourceId: activeDocument.value.documentId,
        sourceKind: 'document',
        closable: true
      })
    : null
))
const docWorkspaceWindows = computed<WorkspaceWindowRecord[]>(() => {
  const editorWindow = editorWorkspaceWindow.value
  if (editorWindow) return [editorWindow]
  const viewerWindow = viewerWorkspaceWindow.value
  return viewerWindow ? [viewerWindow] : []
})
const activeWorkspaceWindowId = computed(() => (
  docWorkspaceWindows.value.some((window) => window.id === docWorkspaceState.value.activeWindowId)
    ? docWorkspaceState.value.activeWindowId
    : docWorkspaceWindows.value[0]?.id || ''
))
const selectedDocumentIds = documentMultiSelect.selectedIds
const hasSingleSelectedWorldbookDocument = computed(() => (
  worldbookSelectionKit.selectedIds.value.length === 1
  && selectedDocumentIds.value.length === 1
  && worldbookSelectionKit.selectedIds.value[0] === `document:${selectedDocumentIds.value[0]}`
))
const hasEditableWorldbookTarget = computed(() => Boolean(activeDocument.value || hasSingleSelectedWorldbookDocument.value || selectedWorldbookContainer.value))
const quickSwitcherItems = computed<{ id: string; title: string; path: string }[]>(() => {
  const keyword = quickSwitcherQuery.value.trim().toLowerCase()
  if (activeLibraryTab.value === 'prompt') return []
  const items = documentRecords.value.map((item) => ({ id: item.documentId, title: item.title, path: item.displayPath }))
  return !keyword ? items : items.filter((item) => item.title.toLowerCase().includes(keyword) || item.path.toLowerCase().includes(keyword))
})
const currentTopbarItem = computed(() => {
  if (activeLibraryTab.value === 'worldbook') {
    if (activeOverviewDocumentContext.value && activeDocument.value) {
      return {
        ...activeDocument.value,
        title: activeOverviewDocumentContext.value.title,
        path: standardWorldbookPathFromFolderPath(activeOverviewDocumentContext.value.folderPath)
      }
    }
    if (activeDocument.value) return activeDocument.value
    if (selectedWorldbookContainer.value) {
      return {
        id: selectedWorldbookContainer.value.folderPath,
        title: selectedWorldbookContainer.value.label,
        path: selectedWorldbookContainer.value.folderPath,
        updatedLabel: ''
      }
    }
    return null
  }
  if (activeLibraryTab.value === 'prompt') return null
  return null
})
const isTopbarEditMode = computed(() => (
  activeLibraryTab.value === 'worldbook'
    ? Boolean(isEditMode.value)
    : false
))
const currentTopbarTitle = computed(() => (
  activeLibraryTab.value === 'worldbook'
    ? (draftTitle.value || activeDocument.value?.title || selectedWorldbookContainer.value?.label || '')
    : activeLibraryTab.value === 'prompt'
      ? t('docLibrary.topbar.promptTitle')
      : ''
))
const canUseTopbarSearch = computed(() => activeLibraryTab.value === 'worldbook')
const canDeleteFromTopbar = computed(() => (
  activeLibraryTab.value === 'worldbook'
    ? Boolean(hasSingleSelectedWorldbookDocument.value && activeDocument.value)
    : false
))
const canDuplicateFromTopbar = computed(() => canDeleteFromTopbar.value)
const canEditFromTopbar = computed(() => (
  activeLibraryTab.value === 'worldbook'
    ? hasEditableWorldbookTarget.value
    : canDeleteFromTopbar.value
))
const canSaveFromTopbar = computed(() => (
  activeLibraryTab.value === 'worldbook'
    ? Boolean(activeDocument.value) && !isSavingDocument.value && Boolean(hasDraftChanges.value)
    : false
))
const showWorldbookReadPaneActions = computed(() => (
  activeLibraryTab.value === 'worldbook'
  && Boolean(activeDocument.value)
  && !isTopbarEditMode.value
))
const hideEmbeddedWorldbookTopbar = computed(() => (
  props.embedded
  && props.externalSidebar
  && activeLibraryTab.value === 'worldbook'
))
const topbarSearchLabel = computed(() => t('docLibrary.topbar.pageSearch'))
const topbarDeleteLabel = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.deletePrompt') : t('docLibrary.topbar.deletePage'))
const topbarDuplicateLabel = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.duplicatePrompt') : t('docLibrary.topbar.duplicatePage'))
const topbarEditLabel = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.editPrompt') : t('docLibrary.topbar.editPage'))
const topbarCloseLabel = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.closeEditPrompt') : t('docLibrary.topbar.closeEdit'))
const topbarSaveLabel = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.savePrompt') : t('docLibrary.topbar.savePage'))
const quickSwitcherDialogTitle = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.gotoPrompt') : t('docLibrary.topbar.gotoPage'))
const quickSwitcherDialogSubtitle = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.gotoSubtitlePrompt') : t('docLibrary.topbar.gotoSubtitlePage'))
const quickSwitcherPlaceholder = computed(() => activeLibraryTab.value === 'prompt' ? t('docLibrary.topbar.gotoPlaceholderPrompt') : t('docLibrary.topbar.gotoPlaceholderPage'))
const quickSwitcherChoiceOptions = computed<AppChoiceDialogOption[]>(() => quickSwitcherItems.value.map((item) => ({
  id: item.id,
  label: item.title,
  description: item.path
})))
const worldbookSidebarRows = computed<SidebarTreeRow[]>(() => visibleTreeRows.value.map((row) => (
  row.kind === 'folder'
    ? {
        id: row.id,
        kind: 'folder',
        label: row.label,
        depth: row.depth,
        clusterId: row.clusterId,
        folderId: row.folderId,
        parentFolderId: row.parentFolderId,
        open: isFolderOpen(row.folderId),
        selected: isWorldbookRowSelected(row),
        cutPending: isWorldbookClipboardPending(getWorldbookRowSelectionId(row)),
        compilePageIndicator: resolveWorldbookSidebarRowCompilePageIndicator(row)
      }
    : {
        id: row.id,
        kind: 'document',
        label: row.label,
        depth: row.depth,
        clusterId: row.clusterId,
        itemId: row.documentId,
        parentFolderId: row.parentFolderId,
        active: isWorldbookDocumentVisuallyActive(row.documentId),
        selected: isWorldbookRowSelected(row),
        cutPending: isWorldbookClipboardPending(getWorldbookRowSelectionId(row)),
        compilePageIndicator: resolveWorldbookSidebarRowCompilePageIndicator(row)
      }
)))

const worldbookSidebarClusters = computed<SidebarClusterRow[]>(() => worldbookClusters.value.map((cluster) => ({
  id: cluster.id,
  label: cluster.label,
  open: isClusterOpen(cluster.id),
  count: countClusterDocuments(cluster),
  selected: isWorldbookClusterSelected(cluster.id),
  cutPending: isWorldbookClipboardPending(getWorldbookClusterSelectionId(cluster.id)),
  compilePageIndicator: resolveWorldbookSidebarClusterCompilePageIndicator(cluster)
})))

const worldbookSidebarRowsByCluster = computed<Record<string, SidebarTreeRow[]>>(() => {
  const grouped: Record<string, SidebarTreeRow[]> = {}
  worldbookSidebarRows.value.forEach((row) => {
    const clusterId = String(row.clusterId || '').trim()
    if (!clusterId) return
    if (!grouped[clusterId]) grouped[clusterId] = []
    grouped[clusterId].push(row)
  })
  return grouped
})

const documentRecordMap = computed(() => new Map(documentRecords.value.map((item) => [item.documentId, item] as const)))
const worldbookMoveTargetMeta = computed(() => {
  const map = new Map<string, { kind: 'cluster' | 'folder'; targetId: string; path: string; label: string; parentIds: string[] }>()
  worldbookClusters.value.forEach((cluster) => {
    const clusterNodeId = `cluster:${cluster.id}`
    const clusterPath = `/世界树${cluster.folderPath}`
    map.set(clusterNodeId, {
      kind: 'cluster',
      targetId: cluster.id,
      path: clusterPath,
      label: cluster.label,
      parentIds: []
    })
    const walk = (folder: FolderBuilder, parentIds: string[]) => {
      const nodeId = `folder:${folder.id}`
      map.set(nodeId, {
        kind: 'folder',
        targetId: folder.id,
        path: `/世界树${folder.folderPath}`,
        label: folder.label,
        parentIds
      })
      Array.from(folder.children.values()).forEach((child) => walk(child, [...parentIds, nodeId]))
    }
    Array.from(cluster.children.values()).forEach((child) => walk(child, [clusterNodeId]))
  })
  return map
})
const worldbookMoveRows = computed<AppMoveDialogRow[]>(() => {
  const rows: AppMoveDialogRow[] = []
  const selectedTargetId = worldbookMoveDialog.value.targetId
  const selectedSourceIds = new Set(worldbookMoveDialog.value.sourceIds)
  const rowKind = worldbookMoveDialog.value.rowKind
  const buildFolderRows = (folder: FolderBuilder, depth: number) => {
    const nodeId = `folder:${folder.folderPath}`
    const expanded = worldbookMoveExpandedIds.value.has(nodeId)
    const disabled = isWorldbookMoveTargetDisabled(nodeId, rowKind, selectedSourceIds)
    rows.push({
      id: nodeId,
      label: folder.label,
      path: `/世界树${folder.folderPath}`,
      depth,
      expandable: folder.children.size > 0,
      expanded,
      selectable: true,
      disabled
    })
    if (!expanded) return
    Array.from(folder.children.values()).forEach((child) => buildFolderRows(child, depth + 1))
  }
  worldbookClusters.value.forEach((cluster) => {
    const nodeId = `cluster:${cluster.id}`
    const expanded = worldbookMoveExpandedIds.value.has(nodeId)
    const disabled = isWorldbookMoveTargetDisabled(nodeId, rowKind, selectedSourceIds)
    rows.push({
      id: nodeId,
      label: cluster.label,
      path: `/世界树${cluster.folderPath}`,
      depth: 0,
      expandable: cluster.children.size > 0,
      expanded,
      selectable: true,
      disabled
    })
    if (!expanded) return
    Array.from(cluster.children.values()).forEach((child) => buildFolderRows(child, 1))
  })
  if (selectedTargetId && !rows.some((row) => row.id === selectedTargetId)) {
    worldbookMoveDialog.value.targetId = ''
  }
  return rows
})
const selectedWorldbookMoveTarget = computed(() => worldbookMoveTargetMeta.value.get(worldbookMoveDialog.value.targetId) || null)
const worldbookMoveExpandedIds = ref<Set<string>>(new Set())
const sillyTavernImportPreviewDocuments = computed(() => (
  sillyTavernImportDialog.value.preview?.documents.slice(0, 12) || []
))
const sillyTavernImportPreviewWarnings = computed(() => (
  sillyTavernImportDialog.value.preview?.warnings.slice(0, 8) || []
))

const hasDraftChanges = computed(() => (
  activeDocument.value
    ? draftTitle.value !== (activeOverviewDocumentContext.value?.title || activeDocument.value.title)
      || Boolean(activeOverviewDocumentContext.value && activeDocument.value.title !== activeOverviewDocumentContext.value.title)
      || draftPath.value !== activeDocument.value.displayPath
      || draftContent.value !== activeDocument.value.content
      || isCompileDraftChanged(activeDocument.value)
    : false
))
const createDialogCanSubmit = computed(() => true)
const createDialogPreviewPath = computed(() => {
  const title = createDialog.value.title.trim() || (createDialog.value.type === 'section' ? '新枝' : createDialog.value.type === 'cluster' ? '新树簇' : '新桠')
  if (createDialog.value.type === 'cluster') return `/世界树/${title}`
  const parentStandardPath = normalizeWorldbookStandardPathInput(createDialog.value.pathInput || standardWorldbookPathFromFolderPath(createDialog.value.parentFolderPath))
  const pathSegment = createDialog.value.type === 'page' ? slugify(title) : title
  return `${parentStandardPath.replace(/\/+$/g, '')}/${pathSegment}`.replace(/\/{2,}/g, '/')
})

function ensureFolderChainVisible(folderSegments: string[]) {
  const nextIds = buildFolderPathChain(folderSegments)
    .map((folderPath) => folderLookup.value.get(folderPath)?.id || folderPath)
  if (!nextIds.length) return
  openFolderIds.value = [...new Set([...openFolderIds.value, ...nextIds])]
}

function syncOpenFolders() {
  if (!activeDocument.value) return
  const [clusterSegment] = activeDocument.value.folderSegments
  if (clusterSegment) {
    const clusterId = folderLookup.value.get(`/${clusterSegment}`)?.id || `/${clusterSegment}`
    if (!openClusterIds.value.includes(clusterId)) {
      openClusterIds.value = [...openClusterIds.value, clusterId]
    }
  }
  ensureFolderChainVisible(activeDocument.value.folderSegments)
}

function syncDraftFromActiveDocument() {
  if (!activeDocument.value) return
  syncDraftFromDocument(activeDocument.value)
}

function syncDraftFromDocument(document: BrainDocumentRecord | DocRecord) {
  const compilePage = getDocumentPublicCompilePage(document)
  const overviewContext = activeOverviewDocumentContext.value
  const documentId = String(document.documentId || document.id || '').trim()
  const displayTitle = overviewContext?.documentId === documentId ? overviewContext.title : document.title
  draftPath.value = document.displayPath
  draftCompileSummary.value = compilePage.summary
  draftCompileTags.value = joinCompileInlineList(compilePage.tags)
  draftCompileRelationHints.value = joinCompileList(compilePage.relationHints)
  draftSemanticType.value = normalizeUnitSemanticType(document.semanticType)
  worldbookEditor.syncFromSource({
    title: displayTitle,
    content: document.content
  })
}

function setActiveLibraryTab(nextTab: LibraryTab) {
  activeLibraryTab.value = normalizeVisibleDocLibraryModuleTab(nextTab)
}

function setRelationTab(nextTab: RelationPanelTab) {
  activeRelationTab.value = nextTab
}

function buildWorldbookClipboardFromRelationUnits(unitIds: string[], mode: 'copy' | 'cut') {
  const entries = buildDocLibraryRelationClipboardEntries(unitIds, docLibraryUnitView.value.units)
  if (!entries.length) return null
  return buildWorldbookClipboardState(mode, entries)
}

function handleRelationGraphCopyUnits(unitIds: string[]) {
  const clipboard = buildWorldbookClipboardFromRelationUnits(unitIds, 'copy')
  if (!clipboard) return
  setWorldbookClipboard(clipboard)
}

function handleRelationGraphCutUnits(unitIds: string[]) {
  const clipboard = buildWorldbookClipboardFromRelationUnits(unitIds, 'cut')
  if (!clipboard) return
  setWorldbookClipboard(clipboard)
}

function handleRelationGraphPasteUnits(targetUnitId: string) {
  if (!hasWorldbookClipboardData.value) return
  const target = resolveDocLibraryRelationPasteTarget(
    targetUnitId,
    docLibraryUnitView.value.units,
    documentRecordMap.value
  )
  if (!target) return
  pasteWorldbookClipboardIntoFolderTarget(target.folderPath, target.targetDocumentId || '').catch(() => {})
}

function getRelationUnitTitle(unitId: string) {
  const unit: UnitView | undefined = relationUnitMap.value.get(unitId)
  return unit?.title || unitId
}

function getRelationPredicateLabel(predicateId: string) {
  return relationPredicateMap.value.get(predicateId)?.label || predicateId
}

function getRelationEvidenceText(relation: RelationViewRecord) {
  const evidence = relation.evidence?.[0]
  if (!evidence) return t('docLibrary.relation.noSource')
  if (evidence.excerpt) return evidence.excerpt
  return `${evidence.sourceType}:${evidence.sourceId}`
}

function persistRelationSystemState(nextState: RelationSystemState) {
  relationSystemState.value = normalizeRelationSystemState(nextState)
  void queueDocLibraryPersistence()
}

function confirmRelation(relationId: string, predicateId = '') {
  persistRelationSystemState(confirmRelationCandidate(relationSystemState.value, relationId, predicateId))
}

function rejectRelation(relationId: string) {
  persistRelationSystemState(rejectRelationCandidate(relationSystemState.value, relationId))
}

function createRelationPredicate() {
  if (!canCreateRelationPredicate.value) return
  const key = slugify(predicateDraft.value.key).replace(/-/g, '_')
  persistRelationSystemState(upsertRelationPredicate(relationSystemState.value, {
    predicateId: `predicate:custom:${key}`,
    family: 'general',
    key,
    label: predicateDraft.value.label.trim(),
    status: 'confirmed'
  }))
  predicateDraft.value = { label: '', key: '' }
}

function isWorkspaceWindowActive(windowId: string) {
  return activeWorkspaceWindowId.value === windowId
}

function activateDocWorkspaceWindow(windowId: string) {
  docWorkspaceState.value = activateWorkspaceWindow(getDocWorkspaceStateWithBase(), windowId)
}

function closeDocWorkspaceWindow(windowId: string) {
  if (windowId === 'document-editor') {
    closeEditor()
    return
  }
  docWorkspaceState.value = closeWorkspaceWindow(docWorkspaceState.value, windowId)
}

function openDocumentSidePreview() {
  if (!activeDocument.value || !isEditMode.value) return
  docPreviewPanelMounted.value = true
  docAuxPanelMode.value = 'preview'
  nextTick(() => syncDocumentScrollFromEditor())
}

function runDocumentScrollSync(source: HTMLElement | null, target: HTMLElement | null) {
  if (!source || !target || isSyncingDocumentScroll) return
  isSyncingDocumentScroll = true
  syncScrollByRatio(source, target)
  requestAnimationFrame(() => {
    isSyncingDocumentScroll = false
  })
}

function getEditorTextarea() {
  return docEditorWorkspace.value?.getTextareaElement() || null
}

function getPreviewPanelBody() {
  return docPreviewPane.value?.getPreviewElement() || null
}

function syncDocumentScrollFromEditor() {
  runDocumentScrollSync(getEditorTextarea(), getPreviewPanelBody())
}

function syncDocumentScrollFromPreview() {
  runDocumentScrollSync(getPreviewPanelBody(), getEditorTextarea())
}

function syncDocAuxPanelWithActiveDocument() {
  if (docAuxPanelMode.value === 'preview') {
    if (activeDocument.value && isEditMode.value) {
      docPreviewPanelMounted.value = true
    }
    return
  }
  if (docAuxPanelMode.value !== 'relation') return
  const targetUnitId = activeDocumentRelationUnit.value?.unitId || docLibraryUnitView.value.units[0]?.unitId || ''
  if (!targetUnitId) return
  focusDocRelationPanel(targetUnitId, { loading: !docRelationPanelReady.value })
}

function openRelationWindow() {
  const targetUnitId = activeDocumentRelationUnit.value?.unitId || docLibraryUnitView.value.units[0]?.unitId || ''
  if (!targetUnitId) return
  const shouldLoad = docAuxPanelMode.value !== 'relation'
    || !docRelationPanelMounted.value
    || !docRelationPanelReady.value
  docAuxPanelMode.value = 'relation'
  focusDocRelationPanel(targetUnitId, { loading: shouldLoad })
}

function closeDocAuxPanel() {
  const wasRelationPanel = docAuxPanelMode.value === 'relation'
  if (isEditMode.value) {
    closeEditor()
  }
  docAuxPanelMode.value = 'none'
  if (wasRelationPanel) {
    resetDocRelationPanelState()
  }
}

function resetDocRelationPanelState() {
  cancelDocRelationPanelLoad()
  docRelationPanelMounted.value = false
  docRelationPanelReady.value = false
  docRelationPanelLoading.value = false
  docRelationUnitId.value = ''
}

function cancelDocRelationPanelLoad() {
  if (docRelationLoadFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(docRelationLoadFrame)
  }
  docRelationLoadFrame = null
  if (docRelationLoadTimer) {
    clearTimeout(docRelationLoadTimer)
    docRelationLoadTimer = null
  }
}

function scheduleDocRelationPanelLoad(unitId: string) {
  cancelDocRelationPanelLoad()
  docRelationPanelReady.value = false
  docRelationPanelLoading.value = true
  docRelationLoadStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (typeof window === 'undefined') {
    docRelationUnitId.value = unitId
    docRelationPanelReady.value = true
    finishDocRelationPanelLoad()
    return
  }
  docRelationLoadFrame = window.requestAnimationFrame(() => {
    docRelationLoadFrame = null
    docRelationUnitId.value = unitId
    docRelationPanelReady.value = true
  })
}

function focusDocRelationPanel(unitId: string, options: { loading?: boolean } = {}) {
  const targetUnitId = String(unitId || '').trim()
  if (!targetUnitId || !docLibraryUnitView.value.units.some((unit) => unit.unitId === targetUnitId)) return
  docRelationPanelMounted.value = true
  if (options.loading || !docRelationPanelReady.value) {
    scheduleDocRelationPanelLoad(targetUnitId)
    return
  }
  cancelDocRelationPanelLoad()
  docRelationUnitId.value = targetUnitId
  docRelationPanelReady.value = true
  docRelationPanelLoading.value = false
}

function finishDocRelationPanelLoad() {
  if (!docRelationPanelLoading.value) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const remaining = Math.max(0, 980 - (now - docRelationLoadStartedAt))
  if (docRelationLoadTimer) clearTimeout(docRelationLoadTimer)
  docRelationLoadTimer = setTimeout(() => {
    docRelationLoadTimer = null
    docRelationPanelLoading.value = false
  }, remaining)
}

function openDocRelationUnit(unitId: string) {
  const unit = docLibraryUnitView.value.units.find((item) => item.unitId === unitId)
  if (!unit) return
  focusDocRelationPanel(unit.unitId)
  if (unit.unitType !== 'leaf') {
    openDocRelationGroupUnit(unit)
    return
  }
  const documentId = String(unit.sourceId || '').trim()
  if (!documentId || !documentRecordMap.value.has(documentId)) return
  activeLibraryTab.value = 'worldbook'
  worldbookSelectionKit.selectOnly(`document:${documentId}`)
  selectDocument(documentId)
}

function openDocRelationGroupUnit(unit: UnitView) {
  const selectionId = getWorldbookUnitSelectionId(unit)
  const parsedSelection = parseWorldbookSelectionId(selectionId)
  if (!parsedSelection || parsedSelection.kind === 'document') return
  activeLibraryTab.value = 'worldbook'
  const folderPath = String(unit.sourcePath || '').trim()
  if (folderPath) ensureFolderChainVisible(splitDocLibraryDisplayPath(folderPath))
  worldbookSelectionKit.selectOnly(selectionId)
  const overviewDocumentId = String(unit.metadata?.overviewDocumentId || '').trim()
  if (overviewDocumentId && documentRecordMap.value.has(overviewDocumentId)) {
    selectedDocumentId.value = overviewDocumentId
    if (isEditMode.value) syncDraftFromActiveDocument()
  }
}

function handleWorkspaceTabDragStart(windowId: string, event: DragEvent) {
  draggedWorkspaceTabId.value = windowId
  event.dataTransfer?.setData('text/plain', windowId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function handleWorkspaceTabDrop(targetWindowId: string, event: DragEvent) {
  event.preventDefault()
  const sourceWindowId = draggedWorkspaceTabId.value || event.dataTransfer?.getData('text/plain') || ''
  draggedWorkspaceTabId.value = ''
  docWorkspaceState.value = reorderWorkspaceWindow(getDocWorkspaceStateWithBase(), sourceWindowId, targetWindowId, 'before')
}

function handleWorkspaceTabDragEnd() {
  draggedWorkspaceTabId.value = ''
}

function getWorkspaceWindowStyle(window: WorkspaceWindowRecord) {
  return getWorkspaceWindowFlexStyle(docWorkspaceState.value, docWorkspaceWindows.value, window)
}

function getDocWorkspaceStateWithBase() {
  let nextState = docWorkspaceState.value
  const windows = docWorkspaceWindows.value
  if (!windows.length) return createWorkspaceWindowState()
  windows.forEach((workspaceWindow) => {
    nextState = upsertWorkspaceWindow(nextState, workspaceWindow, { activate: false })
  })
  return nextState
}

function getPreviousWorkspaceWindowId(index: number) {
  return docWorkspaceWindows.value[Math.max(0, index - 1)]?.id || ''
}

function startWorkspaceSplitResize(event: PointerEvent, windowId: string) {
  if (typeof window === 'undefined') return
  if (!windowId) return
  event.preventDefault()
  stopWorkspaceSplitResize?.()
  const startX = event.clientX
  const startWidth = docWorkspaceState.value.widths?.[windowId] || 420
  const handleMove = (moveEvent: PointerEvent) => {
    const nextWidth = startWidth + moveEvent.clientX - startX
    docWorkspaceState.value = resizeWorkspaceWindow(docWorkspaceState.value, windowId, nextWidth, {
      minWidth: 280,
      maxWidth: Math.max(360, window.innerWidth - 360)
    })
  }
  const stop = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    stopWorkspaceSplitResize = null
  }
  stopWorkspaceSplitResize = stop
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function toggleWorldbookTreeVisible() {
  isTreeVisible.value = !isTreeVisible.value
}

function toggleCluster(clusterId: string) {
  openClusterIds.value = isClusterOpen(clusterId)
    ? openClusterIds.value.filter((item) => item !== clusterId)
    : [...openClusterIds.value, clusterId]
}

function getClusterFolderIds(clusterId: string) {
  const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
  if (!cluster) return [] as string[]
  const ids: string[] = []
  const walk = (folder: FolderBuilder) => {
    ids.push(folder.folderPath)
    Array.from(folder.children.values()).forEach(walk)
  }
  Array.from(cluster.children.values()).forEach(walk)
  return ids
}

function expandClusterFolders(clusterId: string) {
  if (!openClusterIds.value.includes(clusterId)) {
    openClusterIds.value = [...openClusterIds.value, clusterId]
  }
  openFolderIds.value = [...new Set([...openFolderIds.value, ...getClusterFolderIds(clusterId)])]
}

function collapseClusterFolders(clusterId: string) {
  openFolderIds.value = openFolderIds.value.filter((item) => !getClusterFolderIds(clusterId).includes(item))
}

function getWorldbookClusterMenuId(clusterId: string) {
  return getWorldbookClusterSelectionId(clusterId)
}

function isWorldbookClusterMenuOpen(clusterId: string) {
  return worldbookSelectionKit.isMenuOpen(getWorldbookClusterMenuId(clusterId))
}

function toggleWorldbookClusterMenu(clusterId: string, event?: Event) {
  worldbookFloatingMenuKit.updateFloatingMenuPosition(event)
  const menuId = getWorldbookClusterMenuId(clusterId)
  worldbookSelectionKit.openContextMenuFor(menuId)
  if (!worldbookSelectionKit.isMenuOpen(menuId)) {
    worldbookFloatingMenuKit.clearFloatingMenuPosition()
  }
}

function getWorldbookClusterMenuItems(clusterId: string): WorldbookClusterMenuItem[] {
  const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
  const clusterPath = cluster?.folderPath || '/'
  const batchSelection = getWorldbookBatchSelectionForSelectionId(getWorldbookClusterSelectionId(clusterId))
  const isBatch = batchSelection.count > 1
  const unitIds = isBatch
    ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds)
    : getWorldbookClusterExportUnitIds([clusterId])
  return buildWorldbookClusterMenuItems({
    t,
    isBatch,
    canSortLayer: !isBatch || canSortWorldbookBatchSelection(batchSelection.selectionIds),
    canPaste: hasWorldbookClipboardData.value,
    canImportCompilePage: Boolean(unitIds.length),
    canDeleteDuplicateRelations: Boolean(getWorldbookDuplicateRelationIssuesForUnitIds(unitIds).length),
    createAction: `create-node:${clusterPath}`,
    includeExpandCollapse: true
  })
}

async function deleteClusterById(clusterId: string) {
  const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
  if (!cluster) return

  await persistDocLibraryTreeCommand({ type: 'delete_folder', folderPath: cluster.folderPath })
  openClusterIds.value = openClusterIds.value.filter((item) => item !== clusterId)
}

function runWorldbookClusterMenuAction(action: string, clusterId: string) {
  activeTreeMenuId.value = ''
  worldbookFloatingMenuKit.clearFloatingMenuPosition()
  worldbookSelectionKit.closeMenu()
  const batchSelection = getWorldbookBatchSelectionForSelectionId(getWorldbookClusterSelectionId(clusterId))
  const isBatch = batchSelection.count > 1
  if (action === 'expand-cluster') {
    expandClusterFolders(clusterId)
    return
  }
  if (action === 'collapse-cluster') {
    collapseClusterFolders(clusterId)
    return
  }
  if (action.startsWith('create-node:')) {
    openCreateDialog('page', action.replace('create-node:', '') || '/文档')
    return
  }
  if (action === 'rename') {
    openRenameDialogForCluster(clusterId)
    return
  }
  if (action === 'cut' || action === 'copy') {
    setWorldbookClipboard(buildWorldbookClipboardState(action, getWorldbookClipboardEntriesForSelectionIds(
      isBatch ? batchSelection.selectionIds : [getWorldbookClusterSelectionId(clusterId)]
    )))
    return
  }
  if (action === 'paste') {
    pasteWorldbookClipboardIntoCluster(clusterId).catch(() => {})
    return
  }
  if (action === 'sort-layer') {
    if (isBatch) {
      const payload = getWorldbookBatchSortDialogPayload(batchSelection.selectionIds)
      if (payload) openSortDialog(payload.mode, payload.targetFolderId, payload.selectedEntryIds)
      return
    }
    openSortDialog('cluster', '__root__', [`folder:${clusterId}`])
    return
  }
  if (action === 'copy-json') {
    copyWorldbookUnitTreeJson(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      '世界树'
    )
    return
  }
  if (action === 'copy-markdown-with-compile-prompt') {
    copyWorldbookUnitTreeJson(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      '世界树',
      true
    )
    return
  }
  if (action === 'copy-markdown-with-body-prompt') {
    copyWorldbookUnitTreeJson(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      '世界树',
      'body'
    )
    return
  }
  if (isCompactRelationCopyAction(action)) {
    copyWorldbookCompactRelationMarkdown(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树',
      getCompactRelationPromptVersionFromAction(action)
    )
    return
  }
  if (action === 'langhuan-agent-generate-compile-page') {
    runWorldbookAgentGenerateCompilePage(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树'
    ).catch(() => {})
    return
  }
  if (action === 'langhuan-agent-optimize-relations') {
    runWorldbookAgentOptimizeRelations(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树'
    ).catch(() => {})
    return
  }
  if (action === 'langhuan-agent-delete-duplicate-relations') {
    confirmDeleteDuplicateRelationsForWorldbookUnits(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId])
    )
    return
  }
  if (action === 'export-json') {
    exportWorldbookUnitTreeJsonFile(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树'
    )
    return
  }
  if (action === 'export-markdown-with-compile-prompt') {
    exportWorldbookUnitTreeJsonFile(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树',
      true
    )
    return
  }
  if (action === 'export-markdown-with-body-prompt') {
    exportWorldbookUnitTreeJsonFile(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树',
      'body'
    )
    return
  }
  if (isCompactRelationExportAction(action)) {
    exportWorldbookCompactRelationMarkdownFile(
      isBatch ? getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds) : getWorldbookClusterExportUnitIds([clusterId]),
      isBatch ? '世界树-多选' : worldbookClusters.value.find((item) => item.id === clusterId)?.label || '世界树',
      getCompactRelationPromptVersionFromAction(action)
    )
    return
  }
  if (
    action === 'import-compile-page-md' ||
    action === 'import-compile-page-md-from-clipboard' ||
    action === 'import-body-md' ||
    action === 'import-body-md-from-clipboard' ||
    action === 'import-compact-relation-md' ||
    action === 'import-compact-relation-md-from-clipboard'
  ) {
    const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
    const importRow: TreeRow = {
      id: `folder:${clusterId}`,
      kind: 'folder',
      label: cluster?.label || t('docLibrary.worldbook.kindCluster'),
      depth: 0,
      folderId: cluster?.folderPath || '/',
      folderPath: cluster?.folderPath || '/',
      parentFolderId: '',
      parentFolderPath: '/',
      clusterId
    }
    if (isBatch) {
      const rootUnitIds = getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds)
      if (action === 'import-compact-relation-md-from-clipboard') {
        importWorldbookCompactRelationMarkdownFromClipboard(importRow, rootUnitIds).catch(() => {})
        return
      }
      if (action === 'import-compact-relation-md') {
        openWorldbookCompactRelationMarkdownFilePicker(importRow, rootUnitIds)
        return
      }
      if (action === 'import-compile-page-md-from-clipboard') {
        importWorldbookCompilePageMarkdownFromClipboard(importRow, rootUnitIds).catch(() => {})
      } else if (action === 'import-compile-page-md') {
        openWorldbookCompilePageMarkdownFilePicker(importRow, rootUnitIds)
      } else if (action === 'import-body-md-from-clipboard') {
        importWorldbookBodyMarkdownFromClipboard(importRow, rootUnitIds).catch(() => {})
      } else {
        openWorldbookBodyMarkdownFilePicker(importRow, rootUnitIds)
      }
      return
    }
    const rootUnitIds = getWorldbookClusterExportUnitIds([clusterId])
    if (action === 'import-compact-relation-md-from-clipboard') {
      importWorldbookCompactRelationMarkdownFromClipboard(importRow, rootUnitIds).catch(() => {})
    } else if (action === 'import-compact-relation-md') {
      openWorldbookCompactRelationMarkdownFilePicker(importRow, rootUnitIds)
    } else if (action === 'import-compile-page-md-from-clipboard') {
      importWorldbookCompilePageMarkdownFromClipboard(importRow, rootUnitIds).catch(() => {})
    } else if (action === 'import-compile-page-md') {
      openWorldbookCompilePageMarkdownFilePicker(importRow, rootUnitIds)
    } else if (action === 'import-body-md-from-clipboard') {
      importWorldbookBodyMarkdownFromClipboard(importRow, rootUnitIds).catch(() => {})
    } else {
      openWorldbookBodyMarkdownFilePicker(importRow, rootUnitIds)
    }
    return
  }
  if (action === 'delete-cluster') {
    const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
    openConfirmDialog(
      isBatch ? t('docLibrary.confirm.deleteMultiUnits') : t('docLibrary.confirm.deleteCluster'),
      isBatch
        ? t('docLibrary.confirm.deleteMultiUnitsBody', { count: batchSelection.count })
        : t('docLibrary.confirm.deleteClusterBody', { title: cluster?.label || t('docLibrary.confirm.unnamedCluster') }),
      async () => {
        if (isBatch) {
          await deleteWorldbookSelection(batchSelection.selectionIds)
          return
        }
        await deleteClusterById(clusterId)
      }
    )
  }
}

function selectDocument(documentId: string) {
  const nextDocument = documentRecords.value.find((item) => item.documentId === documentId)
  if (nextDocument) {
    ensureFolderChainVisible(nextDocument.folderSegments)
  }
  selectedDocumentId.value = documentId
  if (isEditMode.value) syncDraftFromActiveDocument()
}

function resolveCompileIssueUnitTarget(unitId: string) {
  const unit = relationHintValidationReadModel.value.units.find((item) => item.unitId === String(unitId || '').trim())
  if (!unit || unit.domain !== 'docLibrary') return null
  if (unit.unitType === 'leaf') {
    const documentId = String(unit.sourceId || '').trim()
    const record = documentRecordMap.value.get(documentId)
    if (!documentId || !record) return null
    return {
      kind: 'document' as const,
      documentId,
      title: record.title || unit.title,
      path: record.displayPath,
      parentFolderPath: getParentFolderPathFromDisplayPath(record.displayPath)
    }
  }

  const folderPath = String(unit.sourcePath || '').trim()
  if (!folderPath) return null
  const cluster = worldbookClusters.value.find((item) => item.folderPath === folderPath)
  if (cluster) {
    return {
      kind: 'cluster' as const,
      clusterId: cluster.id,
      title: cluster.label,
      path: cluster.folderPath
    }
  }
  const folder = folderLookup.value.get(folderPath)
  if (!folder) return null
  return {
    kind: 'folder' as const,
    folderId: folder.id,
    title: folder.label,
    path: folder.folderPath,
    parentFolderPath: folder.parentFolderPath || '/'
  }
}

function editCompileIssueUnit(unitId: string) {
  const target = resolveCompileIssueUnitTarget(unitId)
  if (!target) return
  if (target.kind === 'document') {
    renameDialog.value = {
      visible: true,
      type: 'document',
      sourceId: target.documentId,
      title: target.title,
      parentFolderPath: target.parentFolderPath
    }
    return
  }
  if (target.kind === 'cluster') {
    openRenameDialogForCluster(target.clusterId)
    return
  }
  renameDialog.value = {
    visible: true,
    type: 'folder',
    sourceId: target.path,
    title: target.title,
    parentFolderPath: target.parentFolderPath
  }
}

function deleteCompileIssueUnit(unitId: string) {
  const target = resolveCompileIssueUnitTarget(unitId)
  if (!target) return
  if (target.kind === 'document') {
    openConfirmDialog(
      t('docLibrary.confirm.deleteDupUnit'),
      t('docLibrary.confirm.deleteTargetBody', { title: target.title }),
      async () => {
        if (selectedDocumentId.value === target.documentId) {
          isCompilePageDialogOpen.value = false
        }
        await deleteDocumentById(target.documentId)
      }
    )
    return
  }
  openConfirmDialog(
    t('docLibrary.confirm.deleteDupUnit'),
    t('docLibrary.confirm.deleteTargetBody', { title: target.title }),
    () => deleteFolderById(target.kind === 'cluster' ? target.clusterId : target.path)
  )
}

function editDuplicateRelationHint(entry: CompileRelationIssueDuplicateEvidence) {
  const documentId = resolveDuplicateRelationHintDocumentId(entry)
  if (!documentId) {
    toast(t('docLibrary.toast.dupDocNotFound'), 'error')
    return
  }
  isEditMode.value = true
  selectDocument(documentId)
  isCompilePageDialogOpen.value = true
  nextTick(() => {
    const lineNumber = typeof entry.lineIndex === 'number' ? t('docLibrary.toast.dupLineNumber', { line: entry.lineIndex + 1 }) : t('docLibrary.toast.dupLineFallback')
    toast(t('docLibrary.toast.movedToDupDoc', { line: lineNumber }), 'info')
  })
}

async function deleteDuplicateRelationHint(entry: CompileRelationIssueDuplicateEvidence) {
  const documentId = resolveDuplicateRelationHintDocumentId(entry)
  const lineIndex = typeof entry.lineIndex === 'number' ? entry.lineIndex : -1
  if (!documentId || lineIndex < 0) {
    toast(t('docLibrary.toast.noDupLineToDelete'), 'error')
    return
  }
  const target = baseDocuments.value.find((item) => String(item.documentId || '').trim() === documentId)
  if (!target) {
    toast(t('docLibrary.toast.dupDocNotExist'), 'error')
    return
  }
  const isActiveTarget = String(activeDocument.value?.documentId || '').trim() === documentId
  const currentHints = isActiveTarget
    ? splitCompileList(draftCompilePageModel.value.relationHints || [])
    : splitCompileList(target.publicCompilePage?.relationHints || [])
  if (!currentHints[lineIndex]) {
    toast(t('docLibrary.toast.dupLineGone'), 'info')
    return
  }
  try {
    const nextDocuments = baseDocuments.value.map((document) => {
      if (String(document.documentId || '').trim() !== documentId) return document
      const nextHints = currentHints.filter((_, index) => index !== lineIndex)
      return {
        ...document,
        publicCompilePage: {
          ...getDocumentPublicCompilePage(document),
          ...(isActiveTarget ? draftCompilePageModel.value : {}),
          relationHints: nextHints,
          updatedAt: new Date().toISOString()
        }
      }
    })
    await persistDocumentUpserts(nextDocuments, [documentId])
    if (isActiveTarget) {
      applyDraftCompilePage({
        ...draftCompilePageModel.value,
        relationHints: nextDocuments.find((item) => String(item.documentId || '').trim() === documentId)?.publicCompilePage?.relationHints || []
      })
    }
    toast(t('docLibrary.toast.deletedDupRelation'), 'success')
  } catch (error) {
    console.error('删除重复关系提示失败:', error)
    toast(t('docLibrary.toast.deleteDupRelationFailed'), 'error')
  }
}

type DuplicateRelationHintDeletionTarget = {
  documentId: string
  lineIndex: number
  line: string
}
type DuplicateRelationHintDeletionSource = Pick<
  CompileRelationIssue | CompileRelationIssueDuplicateEvidence,
  'ownerUnitId' | 'ownerPath' | 'lineIndex' | 'line'
>

function resolveDuplicateRelationHintDeletionTarget(source: DuplicateRelationHintDeletionSource): DuplicateRelationHintDeletionTarget | null {
  const documentId = resolveDuplicateRelationHintDocumentId(source)
  const lineIndex = typeof source.lineIndex === 'number' ? source.lineIndex : -1
  const line = String(source.line || '').trim()
  if (!documentId || lineIndex < 0 || !line) return null
  return { documentId, lineIndex, line }
}

function collectDuplicateRelationHintDeletionTargets(sources: DuplicateRelationHintDeletionSource[]) {
  const seen = new Set<string>()
  return sources
    .map(resolveDuplicateRelationHintDeletionTarget)
    .filter((target): target is DuplicateRelationHintDeletionTarget => Boolean(target))
    .filter((target) => {
      const key = `${target.documentId}:${target.lineIndex}:${target.line}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function confirmDeleteAllDuplicateRelationHints(issues: CompileRelationIssue[]) {
  const duplicateIssues = issues.filter((issue) => issue.type === 'duplicate_relation')
  const targets = collectDuplicateRelationHintDeletionTargets(duplicateIssues)
  if (!targets.length) {
    toast(t('docLibrary.toast.noDupLineBatch'), 'error')
    return
  }
  openConfirmDialog(
    t('docLibrary.confirm.deleteAllDupLines'),
    t('docLibrary.confirm.deleteAllDupLinesBody', { count: targets.length }),
    () => deleteDuplicateRelationHintsByTargets(targets),
    t('common.delete')
  )
}

async function deleteDuplicateRelationHintsByTargets(targets: DuplicateRelationHintDeletionTarget[]) {
  const targetsByDocumentId = new Map<string, DuplicateRelationHintDeletionTarget[]>()
  targets.forEach((target) => {
    targetsByDocumentId.set(target.documentId, [...(targetsByDocumentId.get(target.documentId) || []), target])
  })

  const changedDocumentIds: string[] = []
  let deletedLineCount = 0
  const nextDocuments = baseDocuments.value.map((document) => {
    const documentId = String(document.documentId || '').trim()
    const documentTargets = targetsByDocumentId.get(documentId)
    if (!documentTargets?.length) return document

    const isActiveTarget = String(activeDocument.value?.documentId || '').trim() === documentId
    const currentHints = isActiveTarget
      ? splitCompileList(draftCompilePageModel.value.relationHints || [])
      : splitCompileList(document.publicCompilePage?.relationHints || [])
    const deletableLineIndexes = new Set<number>()
    documentTargets.forEach((target) => {
      const currentLine = String(currentHints[target.lineIndex] || '').trim()
      if (currentLine === target.line) {
        deletableLineIndexes.add(target.lineIndex)
      }
    })
    if (!deletableLineIndexes.size) return document

    changedDocumentIds.push(documentId)
    deletedLineCount += deletableLineIndexes.size
    return {
      ...document,
      publicCompilePage: {
        ...getDocumentPublicCompilePage(document),
        ...(isActiveTarget ? draftCompilePageModel.value : {}),
        relationHints: currentHints.filter((_, index) => !deletableLineIndexes.has(index)),
        updatedAt: new Date().toISOString()
      }
    }
  })

  if (!changedDocumentIds.length) {
    toast(t('brain.roleWorkspace.dupRelationChanged'), 'info')
    return
  }

  try {
    await persistDocumentUpserts(nextDocuments, changedDocumentIds)
    const activeDocumentId = String(activeDocument.value?.documentId || '').trim()
    if (changedDocumentIds.includes(activeDocumentId)) {
      applyDraftCompilePage({
        ...draftCompilePageModel.value,
        relationHints: nextDocuments.find((item) => String(item.documentId || '').trim() === activeDocumentId)?.publicCompilePage?.relationHints || []
      })
    }
    toast(t('brain.roleWorkspace.deletedDupRelation', { count: deletedLineCount }), 'success')
  } catch (error) {
    console.error('批量删除重复关系提示失败:', error)
    toast(t('docLibrary.toast.batchDeleteDupFailed'), 'error')
  }
}

function resolveDuplicateRelationHintDocumentId(entry: CompileRelationIssueDuplicateEvidence) {
  const ownerUnitId = String(entry.ownerUnitId || '').trim()
  if (ownerUnitId.startsWith('doc:')) return ownerUnitId.slice(4)
  const unit = relationHintValidationReadModel.value.units.find((item) => (
    item.unitId === ownerUnitId
    || String(item.sourceId || '').trim() === ownerUnitId
    || String(item.sourcePath || '').trim() === String(entry.ownerPath || '').trim()
  ))
  if (unit?.unitType === 'leaf') return String(unit.sourceId || '').trim()
  const overviewDocumentId = String(unit?.metadata?.overviewDocumentId || '').trim()
  if (overviewDocumentId) return overviewDocumentId
  const path = String(entry.ownerPath || '').trim()
  if (!path) return ''
  const document = baseDocuments.value.find((item) => (
    String(item.displayPath || '').trim() === path
    || String(item.displayPath || '').trim().replace(/\.md$/iu, '') === path.replace(/\.md$/iu, '')
  ))
  return String(document?.documentId || '').trim()
}

function isDocumentSelected(documentId: string) {
  return documentMultiSelect.isSelected(documentId)
}

function isWorldbookRowSelected(row: TreeRow) {
  return worldbookMultiSelect.isSelected(getWorldbookRowSelectionId(row))
}

function isWorldbookClusterSelected(clusterId: string) {
  return worldbookMultiSelect.isSelected(getWorldbookClusterSelectionId(clusterId))
}

function isWorldbookDocumentVisuallyActive(documentId: string) {
  const safeId = String(documentId || '').trim()
  if (!safeId || safeId !== String(activeDocument.value?.documentId || '').trim()) return false
  if (worldbookSelectionKit.selectedIds.value.length === 0) return true
  return worldbookSelectionKit.selectedIds.value.length === 1
    && worldbookSelectionKit.selectedIds.value[0] === `document:${safeId}`
}

function hasAdjacentSelectedDocument(documentId: string, direction: -1 | 1) {
  return worldbookSelectionKit.hasAdjacentSelected(`document:${String(documentId || '').trim()}`, direction)
}

function getWorldbookMenuMode(row: TreeRow) {
  return worldbookSelectionKit.getMenuMode(getWorldbookRowSelectionId(row))
}

function shouldShowWorldbookCreateAction(row: TreeRow) {
  if (selectedDocumentIds.value.length > 1) return false
  return true
}

function shouldShowWorldbookMenuAction(row: TreeRow) {
  if (worldbookSelectionKit.selectedIds.value.length > 1) {
    return worldbookSelectionKit.shouldShowMenuTrigger(getWorldbookRowSelectionId(row))
  }
  return true
}

function isWorldbookRowMenuOpen(row: TreeRow) {
  return worldbookSelectionKit.isMenuOpen(getWorldbookRowSelectionId(row))
}

function toggleWorldbookRowMenu(row: TreeRow, event?: Event) {
  worldbookFloatingMenuKit.updateFloatingMenuPosition(event)
  const rowSelectionId = getWorldbookRowSelectionId(row)
  worldbookSelectionKit.openContextMenuFor(rowSelectionId)
  if (!worldbookSelectionKit.isMenuOpen(rowSelectionId)) {
    worldbookFloatingMenuKit.clearFloatingMenuPosition()
  }
}

function normalizeStandardPath(value: string) {
  const normalized = `/${String(value || '').trim().replace(/^\/+/, '')}`.replace(/\/+/g, '/')
  return normalized === '/' ? '' : normalized
}

function getWorldbookRowStandardPath(row: TreeRow) {
  if (row.kind === 'folder') {
    return `/世界树${row.folderPath}`
  }
  const record = documentRecordMap.value.get(row.documentId)
  if (!record) return ''
  return `/世界树${String(record.displayPath || '').replace(/\.md$/i, '')}`
}

function standardWorldbookPathFromFolderPath(folderPath: string) {
  return buildUnitTreePathInput('世界树', splitDisplayPath(folderPath), { leadingSlash: true })
}

function normalizeWorldbookFolderPathForCompare(folderPath: string) {
  const normalized = normalizeDisplayPath(folderPath || '/').replace(/\/+$/g, '')
  return normalized || '/'
}

function normalizeWorldbookStandardPathInput(value: string) {
  return normalizeUnitTreePathInput(value || '/世界树', { rootLabel: '世界树', leadingSlash: true })
}

function resolveWorldbookCreatePathTarget(pathInput: string) {
  const standardPath = normalizeWorldbookStandardPathInput(pathInput)
  const withoutRoot = standardPath.replace(/^\/世界树\/?/, '')
  if (!withoutRoot) {
    return { folderPath: '/', targetDocumentId: '' }
  }
  const folderPath = `/${withoutRoot}`.replace(/\/+/g, '/').replace(/\/+$/g, '')
  const document = baseDocuments.value.find((item) => {
    const displayPath = String(item.displayPath || '').replace(/\.md$/i, '').replace(/\/+$/g, '')
    return displayPath === folderPath
  })
  if (document?.documentId) {
    return {
      folderPath: getParentFolderPathFromDisplayPath(document.displayPath),
      targetDocumentId: document.documentId
    }
  }
  return { folderPath: folderPath || '/', targetDocumentId: '' }
}

function copyText(text: string) {
  const safeText = String(text || '').trim()
  if (!safeText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
  navigator.clipboard.writeText(safeText).catch(() => {})
}

async function readClipboardText() {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    toast(t('docLibrary.toast.clipboardUnsupported'), 'warning')
    return ''
  }
  const text = await navigator.clipboard.readText()
  if (!String(text || '').trim()) {
    toast(t('docLibrary.toast.clipboardNoMarkdown'), 'warning')
    return ''
  }
  return text
}

function getWorldbookClusterExportUnitIds(clusterIds: string[]) {
  const wanted = new Set(clusterIds.map((clusterId) => String(clusterId || '').trim()).filter(Boolean))
  return docLibraryUnitView.value.units
    .filter((unit) => unit.unitType === 'cluster' && wanted.has(getWorldbookUnitClusterId(unit)))
    .map((unit) => unit.unitId)
}

function getWorldbookBatchSelectionForSelectionId(selectionId: string) {
  const safeSelectionId = String(selectionId || '').trim()
  const activeIds = worldbookSelectionKit.selectedIds.value
  const selectionIds = activeIds.length > 1 && activeIds.includes(safeSelectionId)
    ? [...activeIds]
    : [safeSelectionId]
  const items = selectionIds
    .map((item) => parseWorldbookSelectionId(item))
    .filter((item): item is { kind: 'cluster' | 'folder' | 'document'; id: string } => Boolean(item))
  return {
    selectionIds,
    items,
    count: items.length
  }
}

function getWorldbookBatchGroupTarget(selectionIds: string[], anchorRow?: TreeRow) {
  const entries = buildWorldbookClipboardState('copy', getWorldbookClipboardEntriesForSelectionIds(selectionIds)).entries
    .filter((item) => item.kind === 'folder' || item.kind === 'document')
  const folderIds = entries
    .filter((item): item is { kind: 'folder'; id: string; label: string } => item.kind === 'folder')
    .map((item) => item.id)
  const documentIds = entries
    .filter((item): item is { kind: 'document'; id: string; label: string } => item.kind === 'document')
    .map((item) => item.id)
  const rows = [
    ...folderIds
      .map((folderId) => visibleTreeRows.value.find((row): row is TreeFolderRow => row.kind === 'folder' && getFolderPathByTreeId(row.folderId) === folderId))
      .filter((row): row is TreeFolderRow => Boolean(row)),
    ...documentIds
      .map((documentId) => visibleTreeRows.value.find((row): row is TreeDocumentRow => row.kind === 'document' && row.documentId === documentId))
      .filter((row): row is TreeDocumentRow => Boolean(row))
  ]
  if (entries.length <= 1 || rows.length !== entries.length) return null
  const minDepth = Math.min(...rows.map((row) => row.depth))
  const anchorSelectionId = anchorRow ? getWorldbookRowSelectionId(anchorRow) : ''
  const anchorEntrySelected = Boolean(anchorSelectionId && selectionIds.includes(anchorSelectionId))
  const anchorAtLargestLevel = Boolean(anchorRow && anchorEntrySelected && anchorRow.depth === minDepth)
  const levelAnchor = anchorAtLargestLevel
    ? anchorRow
    : rows.find((row) => row.depth === minDepth)
  const parentFolderPath = levelAnchor?.parentFolderPath || '/'
  return {
    parentFolderPath,
    pathInput: standardWorldbookPathFromFolderPath(parentFolderPath),
    documentIds,
    folderIds
  }
}

function getWorldbookClipboardEntriesForSelectionIds(selectionIds: string[]) {
  return selectionIds
    .map((item) => parseWorldbookSelectionId(item))
    .filter((item): item is { kind: 'cluster' | 'folder' | 'document'; id: string } => Boolean(item))
    .map((item) => buildWorldbookClipboardEntryFromSelection(item))
}

function getWorldbookExportUnitIdsForSelectionIds(selectionIds: string[]) {
  return selectionIds
    .map((selectionId) => resolveWorldbookSelectionExportUnitId(selectionId))
    .filter(Boolean)
}

function resolveWorldbookSelectionSortEntry(selectionId: string) {
  const parsed = parseWorldbookSelectionId(selectionId)
  if (!parsed) return null
  if (parsed.kind === 'cluster') {
    return {
      parentFolderId: '__root__',
      entryId: `folder:${parsed.id}`
    }
  }
  if (parsed.kind === 'folder') {
    const row = visibleTreeRows.value.find((item): item is TreeFolderRow => item.kind === 'folder' && item.folderId === parsed.id)
    if (!row) return null
    return {
      parentFolderId: row.parentFolderId || '__root__',
      entryId: `folder:${row.folderId}`
    }
  }
  const row = visibleTreeRows.value.find((item): item is TreeDocumentRow => item.kind === 'document' && item.documentId === parsed.id)
  if (!row) return null
  return {
    parentFolderId: row.parentFolderId || '__root__',
    entryId: `document:${row.documentId}`
  }
}

function getWorldbookBatchSortDialogPayload(selectionIds: string[]) {
  const entries = selectionIds
    .map((selectionId) => resolveWorldbookSelectionSortEntry(selectionId))
    .filter((item): item is { parentFolderId: string; entryId: string } => Boolean(item))
  if (entries.length <= 1 || entries.length !== selectionIds.length) return null
  const parentFolderId = entries[0]?.parentFolderId || '__root__'
  if (!entries.every((entry) => entry.parentFolderId === parentFolderId)) return null
  return {
    mode: parentFolderId === '__root__' ? 'cluster' as const : 'layer' as const,
    targetFolderId: parentFolderId,
    selectedEntryIds: entries.map((entry) => entry.entryId)
  }
}

function canSortWorldbookBatchSelection(selectionIds: string[]) {
  return Boolean(getWorldbookBatchSortDialogPayload(selectionIds))
}

function getWorldbookRowExportUnitIds(row: TreeRow) {
  if (getWorldbookMenuMode(row) === 'batch') {
    return getWorldbookExportUnitIdsForSelectionIds(getWorldbookBatchSelectionForSelectionId(getWorldbookRowSelectionId(row)).selectionIds)
  }
  const unitId = resolveWorldbookSelectionExportUnitId(getWorldbookRowSelectionId(row))
  return unitId ? [unitId] : []
}

function collectWorldbookUnitScopeIds(rootUnitIds: string[]) {
  const rootIds = new Set(rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean))
  const childrenByUnitId = new Map<string, UnitView[]>()
  docLibraryUnitView.value.units.forEach((unit) => {
    const parentId = String(unit.parentId || '').trim()
    if (!parentId) return
    if (!childrenByUnitId.has(parentId)) childrenByUnitId.set(parentId, [])
    childrenByUnitId.get(parentId)?.push(unit)
  })
  const result = new Set<string>()
  const visit = (unitId: string) => {
    if (!unitId || result.has(unitId)) return
    result.add(unitId)
    ;(childrenByUnitId.get(unitId) || []).forEach((child) => visit(child.unitId))
  }
  rootIds.forEach((unitId) => visit(unitId))
  return result
}

function getWorldbookDuplicateRelationIssuesForUnitIds(unitIds: string[]) {
  const scopedUnitIds = collectWorldbookUnitScopeIds(unitIds)
  if (!scopedUnitIds.size) return []
  return buildCompileRelationIssues(
    relationHintValidationItems.value.filter((item) => scopedUnitIds.has(String(item.ownerUnitId || '').trim()))
  ).filter((issue) => issue.type === 'duplicate_relation')
}

function resolveWorldbookSelectionExportUnitId(selectionId: string) {
  const parsed = parseWorldbookSelectionId(selectionId)
  if (!parsed) return ''
  if (parsed.kind === 'cluster') {
    return getWorldbookClusterExportUnitIds([parsed.id])[0] || ''
  }
  if (parsed.kind === 'folder') {
    return docLibraryUnitView.value.units.find((unit) => getWorldbookUnitSourceKind(unit) === 'folder' && getWorldbookUnitFolderId(unit) === parsed.id)?.unitId || ''
  }
  return docLibraryUnitView.value.units.find((unit) => getWorldbookUnitSourceKind(unit) === 'document' && getWorldbookUnitDocumentId(unit) === parsed.id)?.unitId || ''
}

function buildWorldbookUnitTreeMarkdown(unitIds: string[], sourceLabel: string) {
  return buildUnitTreeMarkdown({
    units: docLibraryUnitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel
  })
}

function buildWorldbookUnitTreeMarkdownWithCompilePrompt(unitIds: string[], sourceLabel: string) {
  return buildUnitTreeMarkdownWithCompilePrompt({
    units: docLibraryUnitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel
  })
}

function buildWorldbookUnitTreeMarkdownWithBodyPrompt(unitIds: string[], sourceLabel: string) {
  return buildUnitTreeMarkdownWithBodyPrompt({
    units: docLibraryUnitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel
  }, 'docLibrary')
}

function buildWorldbookCompactRelationMarkdown(unitIds: string[], sourceLabel: string, promptVersion: CompactRelationPromptVersion) {
  const result = buildCompactRelationMarkdown({
    units: docLibraryUnitView.value.units,
    rootUnitIds: unitIds,
    sourceLabel,
    promptVersion
  })
  saveCompactRelationExportMapping(result.mapping)
  return result.markdown
}

function copyWorldbookUnitTreeJson(unitIds: string[], sourceLabel: string, promptKind: boolean | 'body' = false) {
  const markdown = promptKind === 'body'
    ? buildWorldbookUnitTreeMarkdownWithBodyPrompt(unitIds, sourceLabel)
    : promptKind
      ? buildWorldbookUnitTreeMarkdownWithCompilePrompt(unitIds, sourceLabel)
    : buildWorldbookUnitTreeMarkdown(unitIds, sourceLabel)
  copyText(markdown)
  toast(promptKind === 'body'
    ? t('docLibrary.toast.copiedMdBodyPrompt')
    : promptKind
      ? t('docLibrary.toast.copiedMdCompilePrompt')
      : (unitIds.length > 1 ? t('docLibrary.toast.copiedMdMulti') : t('docLibrary.toast.copiedMd')), 'success')
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

function copyWorldbookCompactRelationMarkdown(unitIds: string[], sourceLabel: string, promptVersion: CompactRelationPromptVersion) {
  const markdown = buildWorldbookCompactRelationMarkdown(unitIds, sourceLabel, promptVersion)
  copyText(markdown)
  toast(t('docLibrary.toast.copiedRelationCompact', { version: promptVersion }), 'success')
}

function exportWorldbookUnitTreeJsonFile(unitIds: string[], sourceLabel: string, promptKind: boolean | 'body' = false) {
  const markdown = promptKind === 'body'
    ? buildWorldbookUnitTreeMarkdownWithBodyPrompt(unitIds, sourceLabel)
    : promptKind
      ? buildWorldbookUnitTreeMarkdownWithCompilePrompt(unitIds, sourceLabel)
    : buildWorldbookUnitTreeMarkdown(unitIds, sourceLabel)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const suffix = promptKind === 'body' ? t('brain.roleWorkspace.bodyPromptSuffix') : promptKind ? t('brain.roleWorkspace.compilePromptSuffix') : ''
  link.download = `${sanitizeJsonFileName(sourceLabel)}${suffix}-${new Date().toISOString().slice(0, 10)}.md`
  link.click()
  URL.revokeObjectURL(url)
  toast(promptKind === 'body'
    ? t('docLibrary.toast.exportedMdBodyPrompt')
    : promptKind
      ? t('docLibrary.toast.exportedMdCompilePrompt')
      : (unitIds.length > 1 ? t('docLibrary.toast.exportedMdMulti') : t('docLibrary.toast.exportedMd')), 'success')
}

function exportWorldbookCompactRelationMarkdownFile(unitIds: string[], sourceLabel: string, promptVersion: CompactRelationPromptVersion) {
  const markdown = buildWorldbookCompactRelationMarkdown(unitIds, sourceLabel, promptVersion)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeJsonFileName(sourceLabel)}-${t('brain.roleWorkspace.relationCompactLabel')}-${promptVersion}-${new Date().toISOString().slice(0, 10)}.md`
  link.click()
  URL.revokeObjectURL(url)
  toast(t('docLibrary.toast.exportedRelationCompact', { version: promptVersion }), 'success')
}

// 联动标注（双入口一真值）：本函数同时是「三点菜单按钮」和「星依 generateCompilePage 工具」的 execute 核心，
// 经 xingyiFunctionBridge 注册（见 onMounted）；返回 {ok,message} 供星依回报，按钮路径忽略返回值。
async function runWorldbookAgentGenerateCompilePage(unitIds: string[], sourceLabel: string): Promise<{ ok: boolean; message: string }> {
  const safeUnitIds = unitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!safeUnitIds.length) {
    toast(t('docLibrary.agent.noCompileUnit'), 'error')
    return { ok: false, message: t('docLibrary.agent.noCompileUnit') }
  }
  const noticeId = runtimeStore.startAgentTaskNotice({
    title: t('docLibrary.agent.genCompileTitle'),
    message: t('docLibrary.agent.genCompileMessage'),
    sourceLabel,
    step: t('docLibrary.agent.selectedUnits', { count: safeUnitIds.length })
  })
  try {
    toast(t('docLibrary.agent.genCompileToast'), 'info')
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.callingAgentCompile'),
      step: t('docLibrary.agent.agentGenerating')
    })
    const result = await runLanghuanAgentCompilePage({
      units: docLibraryUnitView.value.units,
      rootUnitIds: safeUnitIds,
      sourceLabel,
      agentConfig: settingStore.getBrainAgentConfig(),
      callAI: callAI as any
    })
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.importingCompile'),
      step: t('docLibrary.agent.receivedCompile', { count: result.entryCount })
    })
    await importWorldbookCompilePageMarkdown('', result.markdown, safeUnitIds)
    runtimeStore.completeAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.compileGenerated'),
      step: t('docLibrary.agent.importedCompile', { count: result.entryCount })
    })
    return { ok: true, message: t('docLibrary.agent.compileResult', { label: sourceLabel, count: result.entryCount }) }
  } catch (error) {
    console.warn('琅嬛AGENT生成编译页失败', error)
    runtimeStore.failAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.compileFailed'),
      step: t('docLibrary.agent.failReasonLogged'),
      error
    })
    const detail = error instanceof Error ? error.message : String(error)
    toast(t('docLibrary.agent.genCompileFailedMsg', { detail }), 'error')
    return { ok: false, message: t('docLibrary.agent.genCompileFailedMsg', { detail }) }
  }
}

// 联动标注（双入口一真值）：同 runWorldbookAgentGenerateCompilePage，也是星依 optimizeUnitRelations 工具的核心。
async function runWorldbookAgentOptimizeRelations(unitIds: string[], sourceLabel: string): Promise<{ ok: boolean; message: string }> {
  const safeUnitIds = unitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!safeUnitIds.length) {
    toast(t('docLibrary.agent.noRelationUnit'), 'error')
    return { ok: false, message: t('docLibrary.agent.noRelationUnit') }
  }
  const noticeId = runtimeStore.startAgentTaskNotice({
    title: t('docLibrary.agent.optRelationTitle'),
    message: t('docLibrary.agent.optRelationMessage'),
    sourceLabel,
    step: t('docLibrary.agent.selectedUnits', { count: safeUnitIds.length })
  })
  try {
    toast(t('docLibrary.agent.optRelationToast'), 'info')
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.callingAgentRelation'),
      step: t('docLibrary.agent.agentGenerating')
    })
    const result = await runLanghuanAgentRelationOptimize({
      units: docLibraryUnitView.value.units,
      rootUnitIds: safeUnitIds,
      sourceLabel,
      agentConfig: settingStore.getBrainAgentConfig(),
      callAI: callAI as any
    })
    runtimeStore.updateAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.importingRelation'),
      step: t('docLibrary.agent.receivedRelation', { count: result.relationCount }),
      detail: result.warningCount ? t('docLibrary.agent.parseWarnings', { count: result.warningCount }) : ''
    })
    saveCompactRelationExportMapping(result.mapping)
    await importWorldbookCompactRelationMarkdown(result.markdown, safeUnitIds)
    runtimeStore.completeAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.relationOptimized'),
      step: t('docLibrary.agent.importedRelation', { count: result.relationCount })
    })
    return { ok: true, message: t('docLibrary.agent.relationResult', { label: sourceLabel, count: result.relationCount }) }
  } catch (error) {
    console.warn('琅嬛AGENT优化关系失败', error)
    runtimeStore.failAgentTaskNotice({
      id: noticeId,
      message: t('docLibrary.agent.relationFailed'),
      step: t('docLibrary.agent.failReasonLogged'),
      error
    })
    const detail = error instanceof Error ? error.message : String(error)
    toast(t('docLibrary.agent.optRelationFailedMsg', { detail }), 'error')
    return { ok: false, message: t('docLibrary.agent.optRelationFailedMsg', { detail }) }
  }
}

function confirmDeleteDuplicateRelationsForWorldbookUnits(unitIds: string[]) {
  const issues = getWorldbookDuplicateRelationIssuesForUnitIds(unitIds)
  if (!issues.length) {
    toast(t('docLibrary.agent.noDupRelation'), 'info')
    return
  }
  confirmDeleteAllDuplicateRelationHints(issues)
}

function resolveWorldbookCompilePageImportDocumentId(row: TreeRow) {
  if (row.kind === 'document') return row.documentId
  return getWorldbookOverviewDocument(row.folderPath)?.documentId || ''
}

function canImportWorldbookCompilePageMarkdown(row: TreeRow) {
  return Boolean(getWorldbookRowExportUnitIds(row).length || resolveWorldbookCompilePageImportDocumentId(row))
}

function openWorldbookCompilePageMarkdownFilePicker(row: TreeRow, rootUnitIds = getWorldbookRowExportUnitIds(row)) {
  const documentId = resolveWorldbookCompilePageImportDocumentId(row)
  const safeRootUnitIds = rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if ((!documentId && !safeRootUnitIds.length) || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    file.text()
      .then((text) => importWorldbookCompilePageMarkdown(documentId, text, safeRootUnitIds))
      .catch((error) => {
        console.warn('导入编译页 Markdown 失败', error)
        toast(t('docLibrary.toast.importCompileFailed'), 'error')
      })
  }, { once: true })
  input.click()
}

async function importWorldbookCompilePageMarkdownFromClipboard(row: TreeRow, rootUnitIds = getWorldbookRowExportUnitIds(row)) {
  const documentId = resolveWorldbookCompilePageImportDocumentId(row)
  const safeRootUnitIds = rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!documentId && !safeRootUnitIds.length) return
  try {
    const text = await readClipboardText()
    if (!text) return
    await importWorldbookCompilePageMarkdown(documentId, text, safeRootUnitIds)
  } catch (error) {
    console.warn('从剪贴板导入编译页 Markdown 失败', error)
    toast(t('docLibrary.toast.importFromClipboardFailed'), 'error')
  }
}

function openWorldbookBodyMarkdownFilePicker(row: TreeRow, rootUnitIds = getWorldbookRowExportUnitIds(row)) {
  const documentId = resolveWorldbookCompilePageImportDocumentId(row)
  const safeRootUnitIds = rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if ((!documentId && !safeRootUnitIds.length) || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    file.text()
      .then((text) => importWorldbookBodyMarkdown(documentId, text, safeRootUnitIds))
      .catch((error) => {
        console.warn('导入正文 Markdown 失败', error)
        toast(t('docLibrary.toast.importBodyFailed'), 'error')
      })
  }, { once: true })
  input.click()
}

async function importWorldbookBodyMarkdownFromClipboard(row: TreeRow, rootUnitIds = getWorldbookRowExportUnitIds(row)) {
  const documentId = resolveWorldbookCompilePageImportDocumentId(row)
  const safeRootUnitIds = rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!documentId && !safeRootUnitIds.length) return
  try {
    const text = await readClipboardText()
    if (!text) return
    await importWorldbookBodyMarkdown(documentId, text, safeRootUnitIds)
  } catch (error) {
    console.warn('从剪贴板导入正文 Markdown 失败', error)
    toast(t('docLibrary.toast.importFromClipboardFailed'), 'error')
  }
}

function openWorldbookCompactRelationMarkdownFilePicker(row: TreeRow, rootUnitIds = getWorldbookRowExportUnitIds(row)) {
  const safeRootUnitIds = rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!safeRootUnitIds.length || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    file.text()
      .then((text) => importWorldbookCompactRelationMarkdown(text, safeRootUnitIds))
      .catch((error) => {
        console.warn('导入关系整合 Markdown 失败', error)
        toast(t('docLibrary.toast.importRelationFailed'), 'error')
      })
  }, { once: true })
  input.click()
}

async function importWorldbookCompactRelationMarkdownFromClipboard(row: TreeRow, rootUnitIds = getWorldbookRowExportUnitIds(row)) {
  const safeRootUnitIds = rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean)
  if (!safeRootUnitIds.length) return
  try {
    const text = await readClipboardText()
    if (!text) return
    await importWorldbookCompactRelationMarkdown(text, safeRootUnitIds)
  } catch (error) {
    console.warn('从剪贴板导入关系整合 Markdown 失败', error)
    toast(t('docLibrary.toast.importFromClipboardFailed'), 'error')
  }
}

async function importWorldbookCompilePageMarkdown(documentId: string, text: string, rootUnitIds: string[] = []) {
  const batch = parseCompilePageMarkdownBatch(text)
  if (batch.entries.length) {
    await importWorldbookCompilePageMarkdownBatch(batch, rootUnitIds.length ? rootUnitIds : resolveWorldbookCompilePageImportRootUnitIds(documentId))
    return
  }

  const target = documentRecords.value.find((item) => String(item.documentId || '').trim() === documentId)
  if (!target) {
    toast(t('docLibrary.toast.noBranchDocToImport'), 'error')
    return
  }
  const parsed = parseCompilePageMarkdown(text)
  const incoming = buildDocLibraryIncomingCompilePage(parsed.compilePage, parsed.semanticType)
  const plan: CompilePageImportPlan = {
    units: [createDocLibraryCompilePageImportUnitPlan(target, incoming)]
  }
  const decisions = await resolveCompileImportDecisions(plan)
  if (!decisions) return
  const selected = applyCompilePageImportDecisions(
    getDocLibraryCompilePageCurrent(target),
    incoming,
    decisions[target.documentId]
  )
  const updatedAt = new Date().toISOString()
  const nextDocument: BrainDocumentRecord = {
    ...target,
    summary: selected.summary || target.summary,
    tags: [...selected.tags],
    semanticType: selected.semanticType,
    publicCompilePage: {
      ...getDocumentPublicCompilePage(target),
      summary: selected.summary,
      tags: [...selected.tags],
      relationHints: [...selected.relationHints],
      sourceState: 'manual_confirmed',
      updatedAt
    },
    updatedAt
  }
  const nextDocuments = documentRecords.value.map((item) => (
    String(item.documentId || '').trim() === documentId ? nextDocument : item
  ))
  runDocLibraryImportSave(async () => {
    await persistDocumentUpserts(nextDocuments, [documentId])
    if (String(activeDocument.value?.documentId || '').trim() === documentId) {
      draftSemanticType.value = normalizeUnitSemanticType(selected.semanticType)
      applyDraftCompilePage(selected)
    }
  }, t('docLibrary.toast.importedCompile'))
}

async function importWorldbookBodyMarkdown(documentId: string, text: string, rootUnitIds: string[] = []) {
  const batch = parseUnitBodyMarkdownBatch(text)
  if (batch.entries.length) {
    await importWorldbookBodyMarkdownBatch(batch, rootUnitIds.length ? rootUnitIds : resolveWorldbookCompilePageImportRootUnitIds(documentId))
    return
  }

  const target = documentRecords.value.find((item) => String(item.documentId || '').trim() === documentId)
  if (!target) {
    toast(t('docLibrary.toast.noBranchDocToImport'), 'error')
    return
  }
  const parsed = parseUnitBodyMarkdown(text)
  if (!parsed.content.trim()) {
    toast(t('docLibrary.toast.noBodyToImport'), 'error')
    return
  }
  const updatedAt = new Date().toISOString()
  const nextDocument: BrainDocumentRecord = applyWorldbookBodyImportToDocument(target, parsed, updatedAt)
  const nextDocuments = documentRecords.value.map((item) => (
    String(item.documentId || '').trim() === documentId ? nextDocument : item
  ))
  runDocLibraryImportSave(async () => {
    await persistDocumentUpserts(nextDocuments, [documentId])
    if (String(activeDocument.value?.documentId || '').trim() === documentId) {
      draftContent.value = nextDocument.content
      applyDraftCompilePage(getDocumentPublicCompilePage(nextDocument))
    }
  }, t('docLibrary.toast.importedBody'))
}

async function importWorldbookCompactRelationMarkdown(text: string, rootUnitIds: string[]) {
  const exportId = extractCompactRelationExportId(text)
  const mapping = loadCompactRelationExportMapping(exportId)
  const parsed = parseCompactRelationMarkdown(text, mapping)
  const targetByRefId = buildWorldbookCompilePageImportTargets(rootUnitIds)
  const targetByUnitId = new Map([...targetByRefId.values()].map((target) => [target.unit.unitId, target] as const))
  const updates = new Map<string, { target: BrainDocumentRecord; relationHints: string[] }>()
  let skipped = parsed.warnings.length

  parsed.relationHintsByUnitId.forEach((relationHints, unitId) => {
    const target = targetByUnitId.get(unitId)
    if (!target) {
      skipped += relationHints.length
      return
    }
    const document = documentRecords.value.find((item) => String(item.documentId || '').trim() === target.documentId)
    if (!document) {
      skipped += relationHints.length
      return
    }
    updates.set(target.documentId, { target: document, relationHints })
  })

  if (!updates.size) {
    if (parsed.warnings.length) console.warn('关系整合导入失败', parsed.warnings)
    toast(parsed.warnings.some((item) => item.code === 'unknown_export_id') ? t('docLibrary.toast.missingExportMapping') : t('docLibrary.toast.noRelationToImport'), 'error')
    return
  }

  const plan = createCompactRelationImportPlan({
    units: [...updates.entries()].map(([documentId, update]) => ({
      unitId: documentId,
      title: update.target.title || update.target.displayPath || t('brain.roleWorkspace.unnamedUnit'),
      currentRelationHints: getDocumentPublicCompilePage(update.target).relationHints,
      incomingRelationHints: update.relationHints
    })),
    skipped,
    warnings: parsed.warnings.map((warning) => warning.message)
  })
  if (!plan.items.length) {
    toast(skipped ? t('docLibrary.toast.noRelationInterceptedN', { count: skipped }) : t('docLibrary.toast.noRelationToImport'), 'error')
    return
  }
  const decisions = await resolveCompactRelationImportReview(plan)
  if (!decisions) return
  const stats = countCompactRelationImportPlan(plan, decisions)
  if (!stats.add && !stats.replace) {
    toast(t('docLibrary.toast.noWriteSkippedN', { count: stats.skip }), 'info')
    return
  }
  const planItemsByDocumentId = new Map<string, typeof plan.items>()
  plan.items.forEach((item) => {
    const list = planItemsByDocumentId.get(item.unitId) || []
    list.push(item)
    planItemsByDocumentId.set(item.unitId, list)
  })
  const updatedAt = new Date().toISOString()
  const updatedDocumentIds: string[] = []
  const nextDocuments = documentRecords.value.map((item) => {
    const update = updates.get(String(item.documentId || '').trim())
    if (!update) return item
    const compilePage = getDocumentPublicCompilePage(item)
    const reviewItems = planItemsByDocumentId.get(String(item.documentId || '').trim()) || []
    const relationHints = applyCompactRelationImportDecisions(compilePage.relationHints, reviewItems, decisions)
    if (areStringListsEqual(compilePage.relationHints, relationHints)) return item
    updatedDocumentIds.push(String(item.documentId || '').trim())
    return {
      ...item,
      publicCompilePage: {
        ...compilePage,
        relationHints,
        sourceState: 'manual_confirmed' as const,
        updatedAt
      },
      updatedAt
    }
  })
  if (!updatedDocumentIds.length) {
    toast(t('docLibrary.toast.noWriteSkippedN', { count: stats.skip }), 'info')
    return
  }
  runDocLibraryImportSave(async () => {
    await persistDocumentUpserts(nextDocuments, updatedDocumentIds)
    const activeDocumentId = String(activeDocument.value?.documentId || '').trim()
    if (updates.has(activeDocumentId)) {
      const nextActive = nextDocuments.find((item) => String(item.documentId || '').trim() === activeDocumentId)
      if (nextActive) applyDraftCompilePage(getDocumentPublicCompilePage(nextActive))
    }
    if (parsed.warnings.length) console.warn('关系整合导入存在跳过项', parsed.warnings)
  }, t('docLibrary.toast.writtenRelationSummary', { docs: updatedDocumentIds.length, add: stats.add, replace: stats.replace, skip: stats.skip }))
}

async function importWorldbookCompilePageMarkdownBatch(
  batch: ReturnType<typeof parseCompilePageMarkdownBatch>,
  rootUnitIds: string[]
) {
  const targetByRefId = buildWorldbookCompilePageImportTargets(rootUnitIds)
  const updates = new Map<string, { parsed: typeof batch.entries[number]; target: BrainDocumentRecord; incoming: CompilePageImportIncoming }>()
  let skipped = batch.warnings.length

  batch.entries.forEach((entry) => {
    const target = targetByRefId.get(entry.targetRefId)
    if (!target) {
      skipped += 1
      return
    }
    const document = documentRecords.value.find((item) => String(item.documentId || '').trim() === target.documentId)
    if (!document) {
      skipped += 1
      return
    }
    updates.set(target.documentId, {
      parsed: entry,
      target: document,
      incoming: buildDocLibraryIncomingCompilePage(entry.compilePage, entry.semanticType)
    })
  })

  if (!updates.size) {
    console.warn('批量导入编译页没有匹配到当前子树内单位', batch)
    toast(t('docLibrary.toast.noCompileTargetInBranch'), 'error')
    return
  }

  const plan: CompilePageImportPlan = {
    units: [...updates.values()].map((update) => createDocLibraryCompilePageImportUnitPlan(update.target, update.incoming)),
    skipped
  }
  const decisions = await resolveCompileImportDecisions(plan)
  if (!decisions) return

  const updatedAt = new Date().toISOString()
  const nextDocuments = documentRecords.value.map((item) => {
    const update = updates.get(String(item.documentId || '').trim())
    if (!update) return item
    const selected = applyCompilePageImportDecisions(
      getDocLibraryCompilePageCurrent(item),
      update.incoming,
      decisions[String(item.documentId || '').trim()]
    )
    return {
      ...item,
      summary: selected.summary || item.summary,
      tags: [...selected.tags],
      semanticType: selected.semanticType,
      publicCompilePage: {
        ...getDocumentPublicCompilePage(item),
        summary: selected.summary,
        tags: [...selected.tags],
        relationHints: [...selected.relationHints],
        sourceState: 'manual_confirmed' as const,
        updatedAt
      },
      updatedAt
    }
  })
  const updatedDocumentIds = Array.from(updates.keys())
  runDocLibraryImportSave(async () => {
    await persistDocumentUpserts(nextDocuments, updatedDocumentIds)
    const activeDocumentId = String(activeDocument.value?.documentId || '').trim()
    const activeUpdate = updates.get(activeDocumentId)
    if (activeUpdate) {
      const nextActive = nextDocuments.find((item) => String(item.documentId || '').trim() === activeDocumentId)
      if (nextActive) {
        draftSemanticType.value = normalizeUnitSemanticType(nextActive.semanticType)
        applyDraftCompilePage(getDocumentPublicCompilePage(nextActive))
      }
    }
    if (batch.warnings.length) console.warn('批量导入编译页存在可忽略问题', batch.warnings)
  }, skipped ? t('docLibrary.toast.importedCompileSkipped', { count: updates.size, skipped }) : t('docLibrary.toast.importedCompileN', { count: updates.size }))
}

async function importWorldbookBodyMarkdownBatch(
  batch: ReturnType<typeof parseUnitBodyMarkdownBatch>,
  rootUnitIds: string[]
) {
  const targetByRefId = buildWorldbookCompilePageImportTargets(rootUnitIds)
  const updates = new Map<string, { parsed: typeof batch.entries[number]; target: BrainDocumentRecord }>()
  let skipped = batch.warnings.length

  batch.entries.forEach((entry) => {
    const target = targetByRefId.get(entry.targetRefId)
    if (!target) {
      skipped += 1
      return
    }
    const document = documentRecords.value.find((item) => String(item.documentId || '').trim() === target.documentId)
    if (!document) {
      skipped += 1
      return
    }
    updates.set(target.documentId, { parsed: entry, target: document })
  })

  if (!updates.size) {
    console.warn('批量导入正文没有匹配到当前子树内单位', batch)
    toast(t('docLibrary.toast.noBodyTargetInBranch'), 'error')
    return
  }

  const updatedAt = new Date().toISOString()
  const nextDocuments = documentRecords.value.map((item) => {
    const update = updates.get(String(item.documentId || '').trim())
    return update ? applyWorldbookBodyImportToDocument(item, update.parsed, updatedAt) : item
  })
  const updatedDocumentIds = Array.from(updates.keys())
  runDocLibraryImportSave(async () => {
    await persistDocumentUpserts(nextDocuments, updatedDocumentIds)
    const activeDocumentId = String(activeDocument.value?.documentId || '').trim()
    if (updates.has(activeDocumentId)) {
      const nextActive = nextDocuments.find((item) => String(item.documentId || '').trim() === activeDocumentId)
      if (nextActive) {
        draftContent.value = nextActive.content
        applyDraftCompilePage(getDocumentPublicCompilePage(nextActive))
      }
    }
    if (batch.warnings.length) console.warn('批量导入正文存在可忽略问题', batch.warnings)
  }, skipped ? t('docLibrary.toast.importedBodySkipped', { count: updates.size, skipped }) : t('docLibrary.toast.importedBodyN', { count: updates.size }))
}

function applyWorldbookBodyImportToDocument(
  document: BrainDocumentRecord,
  parsed: { summary: string; tags: string[]; content: string },
  updatedAt: string
): BrainDocumentRecord {
  const nextSummary = parsed.summary || document.summary
  const nextTags = parsed.tags.length ? [...parsed.tags] : [...document.tags]
  return {
    ...document,
    summary: nextSummary,
    tags: nextTags,
    content: String(parsed.content || '').trim(),
    publicCompilePage: {
      ...getDocumentPublicCompilePage(document),
      summary: nextSummary,
      tags: nextTags,
      sourceState: 'manual_confirmed' as const,
      updatedAt
    },
    updatedAt
  }
}

function buildDocLibraryIncomingCompilePage(
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

function getDocLibraryCompilePageCurrent(document: BrainDocumentRecord) {
  const compilePage = getDocumentPublicCompilePage(document)
  return {
    summary: compilePage.summary,
    tags: [...compilePage.tags],
    relationHints: [...compilePage.relationHints],
    semanticType: normalizeUnitSemanticType(document.semanticType)
  }
}

function createDocLibraryCompilePageImportUnitPlan(
  document: BrainDocumentRecord,
  incoming: CompilePageImportIncoming
) {
  return createCompilePageImportUnitPlan({
    unitId: String(document.documentId || '').trim(),
    title: document.title || t('common.unnamed'),
    path: document.displayPath,
    current: getDocLibraryCompilePageCurrent(document),
    incoming
  })
}

function resolveCompileImportDecisions(plan: CompilePageImportPlan) {
  if (!hasCompilePageImportConflicts(plan)) {
    return Promise.resolve(createDefaultCompilePageImportDecisions(plan))
  }
  return new Promise<CompilePageImportDecisionMap | null>((resolve) => {
    pendingCompileImportResolver.value = resolve
    compileImportConflictDialog.value = { open: true, plan }
  })
}

function cancelCompileImportConflictDialog() {
  const resolver = pendingCompileImportResolver.value
  pendingCompileImportResolver.value = null
  compileImportConflictDialog.value = { open: false, plan: { units: [] } }
  resolver?.(null)
}

function applyCompileImportConflictDialog(decisions: CompilePageImportDecisionMap) {
  const resolver = pendingCompileImportResolver.value
  pendingCompileImportResolver.value = null
  compileImportConflictDialog.value = { open: false, plan: { units: [] } }
  resolver?.(decisions)
}

function resolveCompactRelationImportReview(plan: CompactRelationImportPlan) {
  return new Promise<CompactRelationImportDecisionMap | null>((resolve) => {
    pendingCompactRelationImportResolver.value = resolve
    compactRelationImportReviewDialog.value = { open: true, plan }
  })
}

function cancelCompactRelationImportReviewDialog() {
  const resolver = pendingCompactRelationImportResolver.value
  pendingCompactRelationImportResolver.value = null
  compactRelationImportReviewDialog.value = { open: false, plan: { items: [], skipped: 0, warnings: [] } }
  resolver?.(null)
}

function applyCompactRelationImportReviewDialog(decisions: CompactRelationImportDecisionMap) {
  const resolver = pendingCompactRelationImportResolver.value
  pendingCompactRelationImportResolver.value = null
  compactRelationImportReviewDialog.value = { open: false, plan: { items: [], skipped: 0, warnings: [] } }
  resolver?.(decisions)
}

function resolveWorldbookCompilePageImportRootUnitIds(documentId: string) {
  const unit = docLibraryUnitView.value.units.find((item) => (
    String(item.sourceId || '').trim() === documentId
    || String(item.metadata?.overviewDocumentId || '').trim() === documentId
  ))
  return unit ? [unit.unitId] : []
}

function buildWorldbookCompilePageImportTargets(rootUnitIds: string[]) {
  const rootIds = new Set(rootUnitIds.map((unitId) => String(unitId || '').trim()).filter(Boolean))
  const childrenByUnitId = new Map<string, UnitView[]>()
  docLibraryUnitView.value.units.forEach((unit) => {
    const parentId = String(unit.parentId || '').trim()
    if (!parentId) return
    if (!childrenByUnitId.has(parentId)) childrenByUnitId.set(parentId, [])
    childrenByUnitId.get(parentId)?.push(unit)
  })
  const allowedUnits: UnitView[] = []
  const seen = new Set<string>()
  const visit = (unitId: string) => {
    if (!unitId || seen.has(unitId)) return
    seen.add(unitId)
    const unit = docLibraryUnitView.value.units.find((item) => item.unitId === unitId)
    if (!unit) return
    allowedUnits.push(unit)
    ;(childrenByUnitId.get(unit.unitId) || []).forEach((child) => visit(child.unitId))
  }
  rootIds.forEach((unitId) => visit(unitId))

  const targetByRefId = new Map<string, { documentId: string; unit: UnitView }>()
  allowedUnits.forEach((unit) => {
    const documentId = unit.unitType === 'leaf'
      ? String(unit.sourceId || '').trim()
      : String(unit.metadata?.overviewDocumentId || '').trim()
    if (!documentId || !documentRecordMap.value.has(documentId)) return
    const refId = getUnitRelationRefId(unit)
    if (refId) targetByRefId.set(refId, { documentId, unit })
  })
  return targetByRefId
}

function sanitizeJsonFileName(value: string) {
  return String(value || 'unit-tree').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'unit-tree'
}

function isWorldbookMoveTargetDisabled(
  nodeId: string,
  rowKind: WorldbookDragRowKind,
  sourceIds: Set<string>
) {
  const meta = worldbookMoveTargetMeta.value.get(nodeId)
  if (!meta) return true
  if (rowKind === 'document') {
    const parentTargets = new Set(
      [...sourceIds]
        .map((id) => documentRecordMap.value.get(id))
        .filter((item): item is DocRecord => Boolean(item))
        .map((item) => `/世界树${getParentFolderPathFromDisplayPath(item.displayPath)}`)
    )
    return parentTargets.size === 1 && parentTargets.has(meta.path)
  }
  const sourcePaths = [...sourceIds].map((sourceId) => getFolderPathByTreeId(sourceId))
  const targetPath = getFolderPathByTreeId(meta.targetId)
  return sourcePaths.some((sourcePath) => targetPath === sourcePath || targetPath.startsWith(`${sourcePath}/`))
}

function openWorldbookMoveDialog(row: TreeRow) {
  const isBatch = getWorldbookMenuMode(row) === 'batch'
  const rowKind: WorldbookDragRowKind = row.kind === 'folder' ? 'folder' : 'document'
  const sourceIds = isBatch
    ? [...selectedDocumentIds.value]
    : row.kind === 'folder'
      ? [row.folderId]
      : [row.documentId]
  const sourceLabels = isBatch
    ? visibleTreeRows.value
      .filter((item): item is TreeDocumentRow => item.kind === 'document' && selectedDocumentIds.value.includes(item.documentId))
      .map((item) => item.label)
    : [row.label]
  worldbookMoveDialog.value = {
    visible: true,
    rowKind,
    sourceIds,
    sourceLabels,
    targetId: '',
    pathInput: isBatch ? '' : getWorldbookRowStandardPath(row)
  }
  worldbookMoveExpandedIds.value = new Set(worldbookClusters.value.map((cluster) => `cluster:${cluster.id}`))
}

function closeWorldbookMoveDialog() {
  worldbookMoveDialog.value = {
    visible: false,
    rowKind: 'document',
    sourceIds: [],
    sourceLabels: [],
    targetId: '',
    pathInput: ''
  }
  worldbookMoveExpandedIds.value = new Set()
}

function toggleWorldbookMoveTarget(nodeId: string) {
  const next = new Set(worldbookMoveExpandedIds.value)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  worldbookMoveExpandedIds.value = next
}

function selectWorldbookMoveTarget(nodeId: string) {
  const meta = worldbookMoveTargetMeta.value.get(nodeId)
  if (!meta) return
  if (isWorldbookMoveTargetDisabled(nodeId, worldbookMoveDialog.value.rowKind, new Set(worldbookMoveDialog.value.sourceIds))) return
  worldbookMoveDialog.value.targetId = nodeId
  worldbookMoveDialog.value.pathInput = meta.path
  worldbookMoveExpandedIds.value = new Set([...worldbookMoveExpandedIds.value, ...meta.parentIds])
}

function jumpToWorldbookMovePath() {
  const targetPath = normalizeStandardPath(worldbookMoveDialog.value.pathInput)
  if (!targetPath) return
  const matched = [...worldbookMoveTargetMeta.value.entries()].find(([, meta]) => normalizeStandardPath(meta.path) === targetPath)
  if (!matched) return
  worldbookMoveExpandedIds.value = new Set([...worldbookMoveExpandedIds.value, ...matched[1].parentIds])
  selectWorldbookMoveTarget(matched[0])
}

async function confirmWorldbookMoveDialog() {
  const target = selectedWorldbookMoveTarget.value
  if (!target || !worldbookMoveDialog.value.sourceIds.length) return
  await moveWorldbookRowsInto({
    rowKind: worldbookMoveDialog.value.rowKind,
    ids: [...worldbookMoveDialog.value.sourceIds],
    targetKind: target.kind,
    targetId: target.targetId
  })
  closeWorldbookMoveDialog()
}

function openSillyTavernImportDialog() {
  sillyTavernImportDialog.value.visible = true
  loadSillyTavernImportPreview()
}

function closeSillyTavernImportDialog() {
  if (sillyTavernImportDialog.value.applying) return
  sillyTavernImportDialog.value.visible = false
}

async function loadSillyTavernImportPreview() {
  sillyTavernImportDialog.value.loading = true
  sillyTavernImportDialog.value.error = ''
  try {
    sillyTavernImportDialog.value.preview = await worldbookTransfer.previewSillyTavernImport()
  } catch (error) {
    sillyTavernImportDialog.value.preview = null
    sillyTavernImportDialog.value.error = (error as Error).message || t('docLibrary.toast.previewFailed')
  } finally {
    sillyTavernImportDialog.value.loading = false
  }
}

async function confirmSillyTavernImport() {
  if (!sillyTavernImportDialog.value.preview || sillyTavernImportDialog.value.applying) return
  sillyTavernImportDialog.value.visible = false
  sillyTavernImportDialog.value.error = ''
  runDocLibraryImportSave(async () => {
    const result = await worldbookTransfer.applySillyTavernImport(sillyTavernImportDialog.value.conflictStrategy)
    charStore.setDocuments(result.documents)
    selectedDocumentId.value = result.documents.find((item) => item.displayPath.startsWith('/亚什基诺'))?.documentId || selectedDocumentId.value
  }, t('docLibrary.toast.worldbookImported'), t('docLibrary.dialog.importFailed'))
}

function openWorldDraftImportDialog() {
  worldDraftImportDialogVisible.value = true
}

// 世界观导入稿 apply 已在服务端增量落库，这里强刷文档库状态并同步前端全部真值
// （文档 + 字段树快照 + 关系状态，与挂载时初始加载同款三件套；只刷文档不刷树会导致树上看不到新内容）
async function handleWorldDraftImportApplied() {
  try {
    const state = await fetchDocLibraryState({ force: true })
    charStore.setDocuments(state.documents)
    applyDocLibraryTreeSnapshot(state)
    relationSystemState.value = normalizeRelationSystemState(state.relationSystemState)
  } catch (error) {
    console.error('世界观导入稿导入后刷新失败', error)
    toast(t('docLibrary.toast.refreshFailedAfterImport'), 'warning')
  }
}

function getWorldbookMenuItems(row: TreeRow): WorldbookMenuItem[] {
  if (getWorldbookMenuMode(row) === 'batch') {
    const batchSelection = getWorldbookBatchSelectionForSelectionId(getWorldbookRowSelectionId(row))
    const unitIds = getWorldbookExportUnitIdsForSelectionIds(batchSelection.selectionIds)
    return buildWorldbookRowMenuItems({
      t,
      isBatch: true,
      canGroupAsBranch: Boolean(getWorldbookBatchGroupTarget(batchSelection.selectionIds, row)),
      canSortLayer: canSortWorldbookBatchSelection(batchSelection.selectionIds),
      canImportCompilePage: Boolean(unitIds.length),
      canDeleteDuplicateRelations: Boolean(getWorldbookDuplicateRelationIssuesForUnitIds(unitIds).length)
    })
  }

  const unitIds = getWorldbookRowExportUnitIds(row)
  return buildWorldbookRowMenuItems({
    t,
    isBatch: false,
    canPaste: hasWorldbookClipboardData.value,
    canImportCompilePage: canImportWorldbookCompilePageMarkdown(row),
    canDeleteDuplicateRelations: Boolean(getWorldbookDuplicateRelationIssuesForUnitIds(unitIds).length)
  })
}

async function deleteSelectedDocuments() {
  if (!selectedDocumentIds.value.length) return

  const snapshot = await persistDocLibraryTreeCommand(
    { type: 'delete_documents', documentIds: selectedDocumentIds.value },
    { mode: 'confirmed' }
  )
  const nextDocuments = snapshot.documents
  selectedDocumentId.value = nextDocuments[0]?.documentId || ''
  documentMultiSelect.clearSelection()
  isEditMode.value = false
}

async function deleteWorldbookSelection(selectionIds: string[]) {
  const clipboard = buildWorldbookClipboardState('copy', getWorldbookClipboardEntriesForSelectionIds(selectionIds))
  if (!clipboard.entries.length) return
  const folderPaths = clipboard.entries
    .filter((item): item is { kind: 'folder'; id: string; label: string } => item.kind === 'folder')
    .map((item) => item.id)
  const documentIds = clipboard.entries
    .filter((item): item is { kind: 'document'; id: string; label: string } => item.kind === 'document')
    .map((item) => item.id)
  for (const folderPath of folderPaths) {
    await deleteFolderById(folderPath)
  }
  if (documentIds.length) {

    const snapshot = await persistDocLibraryTreeCommand(
      { type: 'delete_documents', documentIds },
      { mode: 'confirmed' }
    )
    const nextDocuments = snapshot.documents
    if (documentIds.includes(selectedDocumentId.value)) {
      selectedDocumentId.value = nextDocuments[0]?.documentId || ''
      isEditMode.value = false
    }
  }
  worldbookMultiSelect.clearSelection()
}

function runWorldbookMenuAction(action: string, row: TreeRow) {
  activeTreeMenuId.value = ''
  worldbookSelectionKit.closeMenu()
  worldbookFloatingMenuKit.clearFloatingMenuPosition()
  const batchSelection = getWorldbookBatchSelectionForSelectionId(getWorldbookRowSelectionId(row))
  if (action === 'create-node') {
    if (getWorldbookMenuMode(row) === 'batch') {
      const target = getWorldbookBatchGroupTarget(batchSelection.selectionIds, row)
      if (!target) return
      openCreateDialog('section', target.parentFolderPath, {
        documentIds: target.documentIds,
        folderIds: target.folderIds
      })
      createDialog.value.pathInput = target.pathInput
      return
    }
    if (row.kind === 'folder') {
      openCreateDialog('page', row.folderPath)
      return
    }
    openCreateDialog('page', row.parentFolderPath, {
      targetDocumentId: row.documentId
    })
    return
  }
  if (action === 'rename') {
    if (getWorldbookMenuMode(row) === 'batch') return
    openRenameDialogForRow(row)
    return
  }
  if (action === 'cut' || action === 'copy') {
    setWorldbookClipboard(buildWorldbookClipboardFromRow(row, action))
    return
  }
  if (action === 'paste') {
    if (getWorldbookMenuMode(row) === 'batch') return
    pasteWorldbookClipboardIntoRow(row).catch(() => {})
    return
  }
  if (action === 'sort-layer') {
    const payload = getWorldbookMenuMode(row) === 'batch'
      ? getWorldbookBatchSortDialogPayload(batchSelection.selectionIds)
      : getWorldbookSortDialogPayload(row)
    if (payload) openSortDialog(payload.mode, payload.targetFolderId, payload.selectedEntryIds)
    return
  }
  if (action === 'copy-path') {
    copyText(getWorldbookRowStandardPath(row))
    return
  }
  if (action === 'copy-json') {
    copyWorldbookUnitTreeJson(getWorldbookRowExportUnitIds(row), getWorldbookMenuMode(row) === 'batch' ? '世界树' : row.label || '世界树')
    return
  }
  if (action === 'copy-markdown-with-compile-prompt') {
    copyWorldbookUnitTreeJson(getWorldbookRowExportUnitIds(row), getWorldbookMenuMode(row) === 'batch' ? '世界树' : row.label || '世界树', true)
    return
  }
  if (action === 'copy-markdown-with-body-prompt') {
    copyWorldbookUnitTreeJson(getWorldbookRowExportUnitIds(row), getWorldbookMenuMode(row) === 'batch' ? '世界树' : row.label || '世界树', 'body')
    return
  }
  if (isCompactRelationCopyAction(action)) {
    copyWorldbookCompactRelationMarkdown(
      getWorldbookRowExportUnitIds(row),
      getWorldbookMenuMode(row) === 'batch' ? '世界树' : row.label || '世界树',
      getCompactRelationPromptVersionFromAction(action)
    )
    return
  }
  if (action === 'langhuan-agent-generate-compile-page') {
    runWorldbookAgentGenerateCompilePage(
      getWorldbookRowExportUnitIds(row),
      getWorldbookMenuMode(row) === 'batch' ? '世界树-多选' : row.label || '世界树'
    ).catch(() => {})
    return
  }
  if (action === 'langhuan-agent-optimize-relations') {
    runWorldbookAgentOptimizeRelations(
      getWorldbookRowExportUnitIds(row),
      getWorldbookMenuMode(row) === 'batch' ? '世界树-多选' : row.label || '世界树'
    ).catch(() => {})
    return
  }
  if (action === 'langhuan-agent-delete-duplicate-relations') {
    confirmDeleteDuplicateRelationsForWorldbookUnits(getWorldbookRowExportUnitIds(row))
    return
  }
  if (action === 'export-json') {
    exportWorldbookUnitTreeJsonFile(getWorldbookRowExportUnitIds(row), getWorldbookMenuMode(row) === 'batch' ? '世界树-多选' : row.label || '世界树')
    return
  }
  if (action === 'export-markdown-with-compile-prompt') {
    exportWorldbookUnitTreeJsonFile(getWorldbookRowExportUnitIds(row), getWorldbookMenuMode(row) === 'batch' ? '世界树-多选' : row.label || '世界树', true)
    return
  }
  if (action === 'export-markdown-with-body-prompt') {
    exportWorldbookUnitTreeJsonFile(getWorldbookRowExportUnitIds(row), getWorldbookMenuMode(row) === 'batch' ? '世界树-多选' : row.label || '世界树', 'body')
    return
  }
  if (isCompactRelationExportAction(action)) {
    exportWorldbookCompactRelationMarkdownFile(
      getWorldbookRowExportUnitIds(row),
      getWorldbookMenuMode(row) === 'batch' ? '世界树-多选' : row.label || '世界树',
      getCompactRelationPromptVersionFromAction(action)
    )
    return
  }
  if (action === 'import-compile-page-md') {
    openWorldbookCompilePageMarkdownFilePicker(row)
    return
  }
  if (action === 'import-compile-page-md-from-clipboard') {
    importWorldbookCompilePageMarkdownFromClipboard(row).catch(() => {})
    return
  }
  if (action === 'import-body-md') {
    openWorldbookBodyMarkdownFilePicker(row)
    return
  }
  if (action === 'import-body-md-from-clipboard') {
    importWorldbookBodyMarkdownFromClipboard(row).catch(() => {})
    return
  }
  if (action === 'import-compact-relation-md') {
    openWorldbookCompactRelationMarkdownFilePicker(row)
    return
  }
  if (action === 'import-compact-relation-md-from-clipboard') {
    importWorldbookCompactRelationMarkdownFromClipboard(row).catch(() => {})
    return
  }
  if (action === 'delete') {
    if (getWorldbookMenuMode(row) === 'batch') {
      openConfirmDialog(
        t('docLibrary.confirm.deleteMultiUnits'),
        t('docLibrary.confirm.deleteMultiUnitsBody', { count: batchSelection.count }),
        () => deleteWorldbookSelection(batchSelection.selectionIds)
      )
      return
    }
    openConfirmDialog(
      t('docLibrary.confirm.deleteBranch'),
      t('docLibrary.confirm.deleteTargetBody', { title: row.label }),
      () => row.kind === 'document' ? deleteDocumentById(row.documentId) : deleteFolderById(row.folderId)
    )
  }
}

function handleWorldbookRowClick(row: TreeRow, event: MouseEvent | PointerEvent) {
  if (worldbookPointerDrag.shouldSuppressClick()) {
    event.preventDefault()
    return
  }
  activeTreeMenuId.value = ''
  worldbookSelectionKit.closeMenu()
  worldbookFloatingMenuKit.clearFloatingMenuPosition()
  worldbookMultiSelect.handleItemClick({
    id: getWorldbookRowSelectionId(row),
    event,
    onDefault: () => {
      if (row.kind === 'document') {
        selectDocument(row.documentId)
        activeTreeMenuId.value = ''
        worldbookSelectionKit.closeMenu()
      }
    }
  })
}

function isWorldbookItemDragEnabled() {
  return worldbookDragSortEnabled.value
}

function isWorldbookClusterDragEnabled() {
  return worldbookDragSortEnabled.value
}

function toggleWorldbookItemDragMode() {
  worldbookDragModeKit.toggleDragMode()
  clearWorldbookPointerDrag()
}

function toggleWorldbookClusterDragMode() {
  worldbookDragModeKit.toggleSinkMode('worldbook')
  clearWorldbookPointerDrag()
}

function handleWorldbookClusterClick(clusterId: string, event: MouseEvent | PointerEvent) {
  if (worldbookPointerDrag.shouldSuppressClick()) {
    event.preventDefault()
    return
  }
  if (worldbookPointerDrag.dragging.value) return
  if (isWorldbookClusterDragEnabled()) {
    event.preventDefault()
    return
  }
  worldbookMultiSelect.handleItemClick({
    id: getWorldbookClusterSelectionId(clusterId),
    event
  })
}

function handleWorldbookClusterPointerDown(clusterId: string, event: PointerEvent) {
  if (event.button !== 0) return
  worldbookMultiSelect.handlePointerDown(getWorldbookClusterSelectionId(clusterId), event)
  if (!isWorldbookClusterDragEnabled()) return
  event.preventDefault()
  const currentTarget = event.currentTarget
  if (currentTarget instanceof HTMLElement) {
    try {
      currentTarget.setPointerCapture(event.pointerId)
    } catch {}
  }
  worldbookPointerDrag.begin({
    pointerId: event.pointerId,
    rowId: String(clusterId || '').trim(),
    rowKind: 'cluster',
    startX: event.clientX,
    startY: event.clientY
  })
}

function handleWorldbookRowPointerDown(row: TreeRow, event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.leaf-docs__row-action') || target?.closest('.leaf-docs__row-menu')) return
  worldbookMultiSelect.handlePointerDown(getWorldbookRowSelectionId(row), event)
  if (!isWorldbookItemDragEnabled()) return
  event.preventDefault()
  const currentTarget = event.currentTarget
  if (currentTarget instanceof HTMLElement) {
    try {
      currentTarget.setPointerCapture(event.pointerId)
    } catch {}
  }
  worldbookPointerDrag.begin({
    pointerId: event.pointerId,
    rowId: row.id,
    rowKind: row.kind,
    startX: event.clientX,
    startY: event.clientY
  })
}

function handleWorldbookRowPointerMove(row: TreeRow, event: PointerEvent) {
  if (row.kind !== 'document') return
  documentMultiSelect.handlePointerMove(event)
}

function handleWorldbookRowPointerEnd(row: TreeRow, event: PointerEvent) {
  if (row.kind !== 'document') return
  documentMultiSelect.handlePointerEnd(event)
}

function getWorldbookSoneRow(rowId: string) {
  return worldbookSoneRowMap.value.get(String(rowId || '').trim()) || null
}

function handleWorldbookSoneSelect(rowId: string, event: MouseEvent | KeyboardEvent) {
  const row = getWorldbookSoneRow(rowId)
  if (!row) return
  const shouldToggle = shouldToggleWorldbookSoneRowOnSelect(row, event)
  if (row.sourceKind === 'cluster') {
    handleWorldbookClusterClick(row.clusterId || getWorldbookUnitClusterId(row.unit), event as MouseEvent)
    if (shouldToggle) toggleWorldbookSoneRow(rowId)
    return
  }
  if (row.sourceRow) {
    handleWorldbookRowClick(row.sourceRow, event as MouseEvent)
    if (shouldToggle) toggleWorldbookSoneRow(rowId)
    return
  }
  worldbookMultiSelect.handleItemClick({
    id: row.id,
    event: event as MouseEvent,
    onDefault: () => {
      if (row.sourceKind === 'document') {
        selectDocument(getWorldbookUnitDocumentId(row.unit))
      }
    }
  })
  activeTreeMenuId.value = ''
  worldbookSelectionKit.closeMenu()
  worldbookFloatingMenuKit.clearFloatingMenuPosition()
}

function shouldToggleWorldbookSoneRowOnSelect(row: WorldbookSoneTreeRow, event: MouseEvent | KeyboardEvent) {
  if (row.kind !== 'folder') return false
  if (worldbookPointerDrag.dragging.value || worldbookDragSortEnabled.value) return false
  const asMouse = event as MouseEvent
  return !asMouse.shiftKey && !asMouse.ctrlKey && !asMouse.metaKey
}

function getWorldbookSoneClusterId(row: WorldbookSoneTreeRow) {
  return row.clusterId || getWorldbookUnitClusterId(row.unit)
}

function getWorldbookSoneFolderId(row: WorldbookSoneTreeRow) {
  return row.sourceRow?.kind === 'folder' ? row.sourceRow.folderId : getWorldbookUnitFolderId(row.unit)
}

function toggleWorldbookSoneRow(rowId: string) {
  const row = getWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    toggleCluster(getWorldbookSoneClusterId(row))
    return
  }
  if (row.sourceKind === 'folder') {
    toggleFolder(getWorldbookSoneFolderId(row))
  }
}

function toggleWorldbookSoneMenu(rowId: string, event: MouseEvent) {
  const row = getWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    toggleWorldbookClusterMenu(getWorldbookSoneClusterId(row), event)
    return
  }
  if (row.sourceRow) {
    toggleWorldbookRowMenu(row.sourceRow, event)
  }
}

function runWorldbookSoneMenuAction(action: string, rowId: string) {
  const row = getWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    runWorldbookClusterMenuAction(action, getWorldbookSoneClusterId(row))
    return
  }
  if (row.sourceRow) {
    runWorldbookMenuAction(action, row.sourceRow)
  }
}

function handleWorldbookSonePointerDown(rowId: string, event: PointerEvent) {
  const row = getWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    handleWorldbookClusterPointerDown(getWorldbookSoneClusterId(row), event)
    return
  }
  if (row.sourceRow) {
    handleWorldbookRowPointerDown(row.sourceRow, event)
  }
}

function handleWorldbookSonePointerMove(rowId: string, event: PointerEvent) {
  const row = getWorldbookSoneRow(rowId)
  if (row?.sourceRow) {
    handleWorldbookRowPointerMove(row.sourceRow, event)
  }
}

function handleWorldbookSonePointerEnd(rowId: string, event: PointerEvent) {
  const row = getWorldbookSoneRow(rowId)
  if (row?.sourceRow) {
    handleWorldbookRowPointerEnd(row.sourceRow, event)
  }
}

function toggleFolder(folderId: string) {
  openFolderIds.value = isFolderOpen(folderId) ? openFolderIds.value.filter((item) => item !== folderId) : [...openFolderIds.value, folderId]
}

function expandAllFolders() {
  openClusterIds.value = worldbookClusters.value.map((item) => item.id)
  openFolderIds.value = [...allFolderIds.value]
}
function collapseAllFolders() {
  openClusterIds.value = []
  openFolderIds.value = []
}
function closeQuickSwitcher() { isQuickSwitcherOpen.value = false; quickSwitcherQuery.value = '' }
function jumpToDocument(documentId: string) { selectedDocumentId.value = documentId; closeQuickSwitcher() }
function jumpToQuickSwitcherItem(itemId: string) {
  jumpToDocument(itemId)
}
async function openEditor() {
  let document: BrainDocumentRecord | DocRecord | null = activeDocument.value
  if (!document && selectedWorldbookContainer.value) {
    document = await ensureOverviewDocumentForFolder(
      selectedWorldbookContainer.value.folderPath,
      selectedWorldbookContainer.value.label
    )
    if (document) {
      ensureFolderChainVisible(splitDisplayPath(document.displayPath).slice(0, -1))
    }
  }
  if (!document) return
  syncDraftFromDocument(document)
  const overviewContext = activeOverviewDocumentContext.value
  const documentId = String(document.documentId || document.id || '').trim()
  const displayTitle = overviewContext?.documentId === documentId ? overviewContext.title : document.title
  worldbookEditor.openEditor({
    title: displayTitle,
    content: document.content
  })
  const editorWindow = editorWorkspaceWindow.value
  if (editorWindow) {
    docWorkspaceState.value = createWorkspaceWindowState([editorWindow])
  }
  if (docAuxPanelMode.value === 'relation') {
    syncDocAuxPanelWithActiveDocument()
  } else {
    openDocumentSidePreview()
  }
}
function closeEditor() {
  if (!activeDocument.value) {
    isEditMode.value = false
    return
  }
  draftPath.value = activeDocument.value.displayPath
  const overviewContext = activeOverviewDocumentContext.value
  worldbookEditor.closeEditor({
    title: overviewContext?.title || activeDocument.value.title,
    content: activeDocument.value.content
  })
  const viewerWindow = viewerWorkspaceWindow.value
  docWorkspaceState.value = createWorkspaceWindowState(viewerWindow ? [viewerWindow] : [])
  if (docAuxPanelMode.value === 'preview') {
    docAuxPanelMode.value = 'none'
  }
}
function closeCreateDialog() {
  createDialog.value = {
    visible: false,
    type: 'page',
    parentFolderPath: '/文档',
    pathInput: '/世界树/文档',
    initialPathInput: '/世界树/文档',
    title: '',
    targetDocumentId: '',
    insertAfterEntryId: '',
    insertParentFolderPath: ''
  }
  pendingSectionDocumentIds.value = []
  pendingSectionFolderIds.value = []
}

function openCreateDialog(
  type: 'page' | 'section' | 'cluster',
  parentFolderPath: string,
  options: { documentIds?: string[]; folderIds?: string[]; targetDocumentId?: string; insertAfterEntryId?: string; insertParentFolderPath?: string } = {}
) {
  const nextPath = parentFolderPath || '/'
  const pathInput = options.targetDocumentId
    ? (() => {
        const record = documentRecordMap.value.get(options.targetDocumentId || '')
        const titlePath = record?.title
          ? `${standardWorldbookPathFromFolderPath(nextPath).replace(/\/+$/g, '')}/${record.title}`.replace(/\/{2,}/g, '/')
          : ''
        return titlePath || standardWorldbookPathFromFolderPath(nextPath)
      })()
    : standardWorldbookPathFromFolderPath(nextPath)
  createDialog.value = {
    visible: true,
    type,
    parentFolderPath: nextPath,
    pathInput,
    initialPathInput: pathInput,
    title: '',
    targetDocumentId: options.targetDocumentId || '',
    insertAfterEntryId: options.insertAfterEntryId || '',
    insertParentFolderPath: options.insertParentFolderPath || ''
  }
  pendingSectionDocumentIds.value = type === 'section' ? [...new Set(options.documentIds || [])] : []
  pendingSectionFolderIds.value = type === 'section' ? [...new Set(options.folderIds || [])] : []
}

function syncCreateDialogPathFromInput() {
  if (createDialog.value.type === 'cluster') return
  const synced = syncUnitTreeCreateTargetFromPath({
    pathInput: createDialog.value.pathInput,
    initialPathInput: createDialog.value.initialPathInput,
    preserveCurrentTarget: Boolean(createDialog.value.targetDocumentId),
    currentTarget: {
      folderPath: createDialog.value.parentFolderPath || '/',
      targetDocumentId: createDialog.value.targetDocumentId || ''
    },
    normalizePathInput: normalizeWorldbookStandardPathInput,
    resolveTarget: resolveWorldbookCreatePathTarget
  })
  const target = synced.target
  createDialog.value = {
    ...createDialog.value,
    parentFolderPath: target.folderPath || '/',
    pathInput: synced.pathInput,
    initialPathInput: synced.pathInput,
    targetDocumentId: target.targetDocumentId
  }
}

function closeRenameDialog() {
  renameDialog.value = {
    visible: false,
    type: 'document',
    sourceId: '',
    title: '',
    parentFolderPath: '/文档'
  }
}

function openRenameDialogForCluster(clusterId: string) {
  const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
  if (!cluster) return
  renameDialog.value = {
    visible: true,
    type: 'cluster',
    sourceId: cluster.id,
    title: cluster.label,
    parentFolderPath: '/'
  }
}

function openRenameDialogForRow(row: TreeRow) {
  if (row.kind === 'folder') {
    renameDialog.value = {
      visible: true,
      type: 'folder',
      sourceId: row.folderPath,
      title: row.label,
      parentFolderPath: row.parentFolderPath || '/'
    }
    return
  }
  const record = documentRecordMap.value.get(row.documentId)
  if (!record) return
  renameDialog.value = {
    visible: true,
    type: 'document',
    sourceId: row.documentId,
    title: record.title || row.label,
    parentFolderPath: row.parentFolderPath
  }
}

const renameDialogCanSubmit = computed(() => renameDialog.value.title.trim().length > 0)

async function confirmRenameDialog() {
  if (!renameDialogCanSubmit.value) return
  const safeTitle = renameDialog.value.title.trim()


  if (renameDialog.value.type === 'document') {
    const targetId = renameDialog.value.sourceId
    const takenDisplayPaths = collectTakenDisplayPaths([targetId])
    const current = baseDocuments.value.find((item) => String(item.documentId || '').trim() === targetId)
    const currentFileName = getDisplayFileName(current?.displayPath || '')
    const nextDisplayPath = currentFileName === 'index.md'
      ? current?.displayPath
      : buildUniqueDocumentPath(
          renameDialog.value.parentFolderPath,
          `${slugify(safeTitle)}.md`,
          takenDisplayPaths
        )
    await persistDocLibraryTreeCommand({
      type: 'rename_document',
      documentId: targetId,
      title: safeTitle,
      displayPath: nextDisplayPath
    })
    if (selectedDocumentId.value === targetId) {
      draftTitle.value = safeTitle
      draftPath.value = nextDisplayPath || draftPath.value
    }
    closeRenameDialog()
    return
  }

  const sourcePath = renameDialog.value.sourceId
  const desiredPath = renameDialog.value.type === 'cluster'
    ? `/${safeTitle}`
    : `${renameDialog.value.parentFolderPath.replace(/\/+$/g, '')}/${safeTitle}`.replace(/\/{2,}/g, '/')
  const nextPath = buildUniquePath(desiredPath, collectTakenFolderPaths([sourcePath]))
  await persistDocLibraryTreeCommand({
    type: 'rename_folder',
    sourcePath,
    targetPath: nextPath
  })
  openFolderIds.value = replacePathPrefixInList(openFolderIds.value, sourcePath, nextPath)
  if (renameDialog.value.type === 'cluster') {
    openClusterIds.value = replacePathPrefixInList(openClusterIds.value, sourcePath, nextPath)
  }
  closeRenameDialog()
}

const sortDialogSelectedCount = computed(() => sortDialogSelectedIds.value.length)

function syncSortDialogItemSelection() {
  const selectedSet = new Set(sortDialogSelectedIds.value)
  sortDialogItems.value = sortDialogItems.value.map((item) => ({
    ...item,
    selected: selectedSet.has(item.id)
  }))
}

function canOpenWorldbookSortLayer(row: TreeRow) {
  if (row.kind !== 'document') return true
  if (getWorldbookMenuMode(row) !== 'batch') return true
  const parentIds = new Set(
    visibleTreeRows.value
      .filter((item): item is TreeDocumentRow => item.kind === 'document' && selectedDocumentIds.value.includes(item.documentId))
      .map((item) => item.parentFolderId || '__root__')
  )
  return parentIds.size === 1 && parentIds.has(row.parentFolderId || '__root__')
}

function getWorldbookSortDialogPayload(row: TreeRow) {
  if (row.kind === 'folder') {
    return {
      mode: row.parentFolderId === '__root__' ? 'cluster' as const : 'layer' as const,
      targetFolderId: row.parentFolderId || '__root__',
      selectedEntryIds: [`folder:${row.folderId}`] as string[]
    }
  }
  const targetFolderId = row.parentFolderId || '__root__'
  if (getWorldbookMenuMode(row) === 'batch') {
    if (!canOpenWorldbookSortLayer(row)) return null
    return {
      mode: 'layer' as const,
      targetFolderId,
      selectedEntryIds: visibleTreeRows.value
        .filter((item) => item.parentFolderId === targetFolderId)
        .map((item) => getWorldbookRowSelectionId(item))
        .filter((item) => worldbookSelectionKit.selectedIds.value.includes(item))
    }
  }
  return {
    mode: 'layer' as const,
    targetFolderId,
    selectedEntryIds: [`document:${row.documentId}`]
  }
}

function openSortDialog(mode: SortDialogMode, targetFolderId = '__root__', selectedEntryIds: string[] = []) {
  const folder = targetFolderId === '__root__' ? null : folderLookup.value.get(targetFolderId) || null
  const folderEntries = folder ? Array.from(folder.children.values()) : Array.from(folderTree.value.values())
  const overviewFolderPath = folder?.folderPath || getFolderPathByTreeId(targetFolderId)
  const documentEntries = (folder ? Array.from(folder.documents) : []).filter((item) => !isWorldbookOverviewDocument(item, overviewFolderPath))
  const orderedIds = mode === 'cluster'
    ? getOrderedTreeChildNodeIds(DOC_TREE_ROOT_NODE_ID, worldbookClusters.value.map((item) => item.id), [])
        .map((entryId) => `folder:${entryId}`)
    : getOrderedTreeChildNodeIds(targetFolderId, folderEntries.map((item) => item.id), documentEntries.map((item) => item.documentId))
        .map((entryId) => {
          const folderEntry = folderEntries.find((item) => item.id === entryId)
          if (folderEntry) return `folder:${folderEntry.id}`
          const documentEntry = documentEntries.find((item) => getDocumentTreeNodeId(item.documentId) === entryId)
          return documentEntry ? `document:${documentEntry.documentId}` : entryId
        })
  const selectedSet = new Set(selectedEntryIds)
  sortDialogItems.value = orderedIds.map((entryId) => {
    if (entryId.startsWith('folder:')) {
      const currentFolder = mode === 'cluster'
        ? worldbookClusters.value.find((item) => `folder:${item.id}` === entryId)
        : folderEntries.find((item) => `folder:${item.id}` === entryId)
      return { id: entryId, label: currentFolder?.label || entryId, kind: 'folder' as const, selected: selectedSet.has(entryId) }
    }
    const currentDoc = documentEntries.find((item) => `document:${item.documentId}` === entryId)
    return { id: entryId, label: currentDoc?.shortTitle || entryId, kind: 'document' as const, selected: selectedSet.has(entryId) }
  })
  sortDialogMode.value = mode
  sortDialogMultiSelect.setSelectedIds(selectedEntryIds)
  syncSortDialogItemSelection()
  sortDialogTargetFolderId.value = targetFolderId
  sortDialogVisible.value = true
}

function getDocumentTreeNodeId(documentId: string) {
  const safeDocumentId = String(documentId || '').trim()
  return readableFieldTreeSnapshot.value.treeNodes.find((node) => node.nodeKind === 'document' && node.documentId === safeDocumentId)?.nodeId
    || `doc:${encodeURIComponent(safeDocumentId).replace(/%/g, '~')}`
}

function treeOrderEntryToLegacyEntry(entryId: string) {
  const safeEntryId = String(entryId || '').trim()
  if (safeEntryId.startsWith('folder:')) {
    const folderId = safeEntryId.replace(/^folder:/, '')
    return `folder:${getFolderPathByTreeId(folderId)}`
  }
  return safeEntryId
}

function handleSortDialogItemClick(itemId: string, event: MouseEvent) {
  sortDialogMultiSelect.handleItemClick({
    id: itemId,
    event,
    onDefault: () => {}
  })
  syncSortDialogItemSelection()
}

function isSortDialogItemSelected(index: number) {
  return Boolean(sortDialogItems.value[index]?.selected)
}

function getSortDialogItemClasses(index: number) {
  const selected = isSortDialogItemSelected(index)
  const prevSelected = index > 0 && isSortDialogItemSelected(index - 1)
  const nextSelected = index < sortDialogItems.value.length - 1 && isSortDialogItemSelected(index + 1)
  return {
    'leaf-docs__sort-item--selected': selected,
    'leaf-docs__sort-item--join-top': selected && prevSelected,
    'leaf-docs__sort-item--join-bottom': selected && nextSelected
  }
}

function getSortDialogMoveGroup(index: number) {
  const currentItem = sortDialogItems.value[index]
  if (!currentItem) return []
  const selectedSet = new Set(sortDialogSelectedIds.value)
  if (!currentItem.selected || selectedSet.size <= 1) {
    return [currentItem.id]
  }
  return sortDialogItems.value
    .filter((item) => selectedSet.has(item.id))
    .map((item) => item.id)
}

function isSortDialogMoveDisabled(index: number, delta: SortDialogDraftDirection) {
  const movingIds = getSortDialogMoveGroup(index)
  if (!movingIds.length) return true
  const movingSet = new Set(movingIds)
  return sortDialogItems.value.length < 2 || sortDialogItems.value.every((item) => movingSet.has(item.id))
}

function getSortDialogListElement() {
  const list = sortDialogList.value
  if (!list) return null
  return list instanceof HTMLElement ? list : list.$el || null
}

function scrollSortDialogItemIntoView(itemId: string, edge: 'top' | 'bottom' | 'middle') {
  void nextTick(() => {
    const list = getSortDialogListElement()
    const selector = `[data-sort-dialog-id="${CSS.escape(itemId)}"]`
    const element = list?.querySelector<HTMLElement>(selector)
    element?.scrollIntoView({
      block: edge === 'top' ? 'start' : edge === 'bottom' ? 'end' : 'nearest',
      inline: 'nearest'
    })
  })
}

function moveSortDialogItem(index: number, delta: SortDialogDraftDirection) {
  const movingIds = getSortDialogMoveGroup(index)
  const result = moveSortDialogDraftItems(sortDialogItems.value, movingIds, delta)
  if (!result) return
  sortDialogItems.value = result.items
  syncSortDialogItemSelection()
  scrollSortDialogItemIntoView(result.focusId, result.edge)
}

function closeSortDialog() {
  sortDialogVisible.value = false
  sortDialogMode.value = 'layer'
  sortDialogTargetFolderId.value = '__root__'
  sortDialogItems.value = []
  sortDialogMultiSelect.clearSelection()
}

function openConfirmDialog(title: string, message: string, onConfirm: () => void | Promise<void>, confirmText = t('common.delete')) {
  confirmDialog.value = { visible: true, title, message, confirmText }
  pendingConfirmAction.value = onConfirm
}

function closeConfirmDialog() {
  confirmDialog.value = { visible: false, title: '', message: '', confirmText: t('common.confirm') }
  pendingConfirmAction.value = null
}

async function confirmPendingAction() {
  const action = pendingConfirmAction.value
  closeConfirmDialog()
  if (!action) return
  try {
    await action()
  } catch (error) {
    console.error('确认操作失败', error)
    toast(error instanceof Error ? error.message : t('docLibrary.toast.confirmOpFailed'), 'error')
  }
}

function closeTreeMenu() {
  activeTreeMenuId.value = ''
  worldbookSelectionKit.closeMenu()
  worldbookFloatingMenuKit.clearFloatingMenuPosition()
}

function createWorldbookDocumentId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function setWorldbookClipboard(payload: WorldbookClipboardState) {
  worldbookClipboard.value = {
    mode: payload.mode,
    rowKind: payload.rowKind,
    ids: [...payload.ids],
    labels: [...payload.labels],
    entries: payload.entries.map((item) => ({ ...item }))
  }
  if (payload.mode === 'cut') {
    worldbookMultiSelect.clearSelection()
  }
}

function clearWorldbookClipboard() {
  worldbookClipboard.value = {
    mode: '',
    rowKind: 'document',
    ids: [],
    labels: [],
    entries: []
  }
}

function isWorldbookClipboardPending(selectionId: string) {
  if (worldbookClipboard.value.mode !== 'cut') return false
  const parsed = parseWorldbookSelectionId(selectionId)
  if (!parsed) return false
  const targetKind = parsed.kind === 'document' ? 'document' : 'folder'
  const targetId = targetKind === 'folder' ? getFolderPathByTreeId(parsed.id) : parsed.id
  return worldbookClipboard.value.entries.some((item) => item.kind === targetKind && item.id === targetId)
}

function isWorldbookPathInsideFolder(path: string, folderPath: string) {
  const safePath = String(path || '').trim()
  const safeFolderPath = String(folderPath || '').trim().replace(/\/+$/g, '')
  if (!safePath || !safeFolderPath) return false
  return safePath === `${safeFolderPath}/index.md` || safePath.startsWith(`${safeFolderPath}/`)
}

function buildWorldbookClipboardState(
  mode: 'copy' | 'cut',
  rawEntries: Array<{ kind: 'document' | 'folder'; id: string; label: string }>
): WorldbookClipboardState {
  const uniqueEntries: WorldbookClipboardState['entries'] = rawEntries.filter((item, index, array) => {
    const safeKind = item.kind === 'folder' ? 'folder' : 'document'
    const safeId = String(item.id || '').trim()
    if (!safeId) return false
    return array.findIndex((entry) => entry.kind === safeKind && String(entry.id || '').trim() === safeId) === index
  }).map((item) => ({
    kind: item.kind === 'folder' ? 'folder' : 'document',
    id: item.kind === 'folder' ? getFolderPathByTreeId(item.id) : String(item.id || '').trim(),
    label: String(item.label || '').trim() || t('common.unnamed')
  }))
  const selectedFolderPaths = uniqueEntries
    .filter((item): item is { kind: 'folder'; id: string; label: string } => item.kind === 'folder')
    .map((item) => item.id)
    .filter((folderPath, index, array) => !array.some((otherPath, otherIndex) => (
      otherIndex !== index
      && folderPath.startsWith(`${otherPath.replace(/\/+$/g, '')}/`)
    )))
  const entries: WorldbookClipboardState['entries'] = uniqueEntries.filter((item) => {
    if (item.kind === 'folder') {
      return selectedFolderPaths.includes(item.id)
    }
    const displayPath = String(documentRecordMap.value.get(item.id)?.displayPath || '').trim()
    return !selectedFolderPaths.some((folderPath) => isWorldbookPathInsideFolder(displayPath, folderPath))
  })
  const rowKind = !entries.length
    ? 'document'
    : entries.every((item) => item.kind === 'document')
      ? 'document'
      : entries.every((item) => item.kind === 'folder')
        ? 'folder'
        : 'mixed'
  return {
    mode,
    rowKind,
    ids: entries.map((item) => item.id),
    labels: entries.map((item) => item.label),
    entries
  }
}

function buildWorldbookClipboardEntryFromSelection(item: { kind: 'cluster' | 'folder' | 'document'; id: string }) {
  if (item.kind === 'cluster') {
    const cluster = worldbookClusters.value.find((entry) => entry.id === item.id)
    return {
      kind: 'folder' as const,
      id: item.id,
      label: cluster?.label || item.id
    }
  }
  if (item.kind === 'folder') {
    const folderRow = visibleTreeRows.value.find((row): row is TreeFolderRow => row.kind === 'folder' && row.folderId === item.id)
    return {
      kind: 'folder' as const,
      id: item.id,
      label: folderRow?.label || getFolderNameFromPath(item.id) || item.id
    }
  }
  const documentRow = visibleTreeRows.value.find((row): row is TreeDocumentRow => row.kind === 'document' && row.documentId === item.id)
  const documentRecord = documentRecordMap.value.get(item.id)
  return {
    kind: 'document' as const,
    id: item.id,
    label: documentRow?.label || documentRecord?.title || item.id
  }
}

function buildWorldbookClipboardFromRow(row: TreeRow, mode: 'copy' | 'cut'): WorldbookClipboardState {
  if (getWorldbookMenuMode(row) === 'batch') {
    const selectedEntries = worldbookSelectionKit.selectedIds.value
      .map((item) => parseWorldbookSelectionId(item))
      .filter((item): item is { kind: 'cluster' | 'folder' | 'document'; id: string } => Boolean(item))
    if (selectedEntries.length) {
      return buildWorldbookClipboardState(mode, selectedEntries.map((item) => buildWorldbookClipboardEntryFromSelection(item)))
    }
  }
  return buildWorldbookClipboardState(mode, [row.kind === 'folder'
    ? { kind: 'folder' as const, id: row.folderId, label: row.label }
    : { kind: 'document' as const, id: row.documentId, label: row.label }])
}

function buildWorldbookClipboardFromActiveSelection(mode: 'copy' | 'cut'): WorldbookClipboardState | null {
  const selectedItems = worldbookSelectionKit.selectedIds.value
    .map((item) => parseWorldbookSelectionId(item))
    .filter((item): item is { kind: 'cluster' | 'folder' | 'document'; id: string } => Boolean(item))
  if (selectedItems.length) {
    return buildWorldbookClipboardState(mode, selectedItems.map((item) => buildWorldbookClipboardEntryFromSelection(item)))
  }
  const current = activeDocument.value
  if (!current) return null
  return buildWorldbookClipboardState(mode, [{
    kind: 'document',
    id: current.documentId,
    label: current.title || t('common.unnamed')
  }])
}

function replacePathPrefixInList(values: string[], oldPrefix: string, newPrefix: string) {
  return values.map((item) => replacePathPrefix(item, oldPrefix, newPrefix))
}

function remapManualOrdersForFolderRename(orders: Record<string, string[]>, oldPrefix: string, newPrefix: string) {
  return Object.fromEntries(
    Object.entries(orders).map(([key, values]) => {
      const nextKey = key === '__root__' ? key : replacePathPrefix(key, oldPrefix, newPrefix)
      const nextValues = values.map((item) => {
        if (!item.startsWith('folder:')) return item
        const folderPath = item.replace(/^folder:/, '')
        return `folder:${replacePathPrefix(folderPath, oldPrefix, newPrefix)}`
      })
      return [nextKey, nextValues]
    })
  )
}

function duplicateDocumentRecordsIntoFolder(
  documents: BrainDocumentRecord[],
  documentIds: string[],
  targetFolderPath: string
) {
  const ids = Array.from(new Set(documentIds.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!ids.length) return { documents, entryIds: [] as string[], firstDocumentId: '' }
  const documentById = new Map(documents.map((item) => [String(item.documentId || '').trim(), item] as const))
  const sourceDocs = ids
    .map((id) => documentById.get(id))
    .filter((item): item is BrainDocumentRecord => Boolean(item))
  const nextDocuments = [...documents]
  const entryIds: string[] = []
  const takenDisplayPaths = new Set(documents.map((item) => String(item.displayPath || '').trim()).filter(Boolean))
  let firstDocumentId = ''
  sourceDocs.forEach((sourceDoc) => {
    const nextId = createWorldbookDocumentId()
    const fileName = getWorldbookDocumentMoveFileName(sourceDoc)
    const nextDisplayPath = buildUniqueDocumentPath(targetFolderPath, fileName, takenDisplayPaths)
    const updatedAt = new Date().toISOString()
    nextDocuments.push({
      ...sourceDoc,
      documentId: nextId,
      id: nextId,
      stableId: nextId,
      displayPath: nextDisplayPath,
      createdAt: updatedAt,
      updatedAt
    })
    if (!firstDocumentId) firstDocumentId = nextId
    entryIds.push(`document:${nextId}`)
  })
  return { documents: nextDocuments, entryIds, firstDocumentId }
}

function duplicateFolderRecordsIntoFolder(
  documents: BrainDocumentRecord[],
  sourcePaths: string[],
  targetFolderPath: string
) {
  const safeSourcePaths = Array.from(new Set(sourcePaths.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!safeSourcePaths.length) return { documents, entryIds: [] as string[] }
  const nextDocuments = [...documents]
  const takenFolderPaths = collectTakenFolderPaths()
  const entryIds: string[] = []
  const sourcePathSet = new Set(safeSourcePaths)
  const documentsBySourcePath = new Map(safeSourcePaths.map((path) => [path, [] as BrainDocumentRecord[]] as const))
  documents.forEach((document) => {
    collectMatchingAncestorFolderPaths(String(document.displayPath || '').trim(), sourcePathSet)
      .forEach((sourcePath) => documentsBySourcePath.get(sourcePath)?.push(document))
  })
  safeSourcePaths.forEach((sourcePath) => {
    const folderName = getFolderNameFromPath(sourcePath) || '新枝'
    const nextPrefix = buildUniquePath(`${targetFolderPath.replace(/\/+$/g, '')}/${folderName}`, takenFolderPaths)
    entryIds.push(`folder:${nextPrefix}`)
    ;(documentsBySourcePath.get(sourcePath) || []).forEach((sourceDoc) => {
        const nextId = createWorldbookDocumentId()
        const currentPath = String(sourceDoc.displayPath || '').trim()
        const nextDisplayPath = replacePathPrefix(currentPath, sourcePath, nextPrefix)
        const updatedAt = new Date().toISOString()
        nextDocuments.push({
          ...sourceDoc,
          documentId: nextId,
          id: nextId,
          stableId: nextId,
          displayPath: nextDisplayPath,
          createdAt: updatedAt,
          updatedAt
        })
      })
  })
  return { documents: nextDocuments, entryIds }
}

function normalizeFolderPathForNestingCheck(path: string) {
  const normalized = normalizeDisplayPath(path || '/').replace(/\/+$/g, '')
  return normalized || '/'
}

function isSameOrDescendantFolderPath(targetFolderPath: string, sourceFolderPath: string) {
  const target = normalizeFolderPathForNestingCheck(targetFolderPath)
  const source = normalizeFolderPathForNestingCheck(sourceFolderPath)
  return target === source || target.startsWith(`${source}/`)
}

function collectMatchingAncestorFolderPaths(displayPath: string, candidates: Set<string>) {
  return collectDocLibraryAncestorFolderMatches(displayPath, candidates)
}

function findDeepestFolderPrefix<T>(displayPath: string, candidates: Map<string, T>) {
  return findDeepestDocLibraryFolderPrefix(displayPath, candidates)
}

function filterPasteEntriesForTarget(
  entries: WorldbookClipboardState['entries'],
  targetFolderPath: string
) {
  return entries.filter((entry) => {
    if (entry.kind !== 'folder') return true
    return !isSameOrDescendantFolderPath(targetFolderPath, entry.id)
  })
}

function moveDocumentRecordsIntoFolder(
  documents: BrainDocumentRecord[],
  documentIds: string[],
  targetFolderPath: string
) {
  const ids = Array.from(new Set(documentIds.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!ids.length) return { documents, entryIds: [] as string[] }
  const idSet = new Set(ids)
  const takenDisplayPaths = new Set(
    documents
      .filter((item) => !idSet.has(String(item.documentId || '').trim()))
      .map((item) => String(item.displayPath || '').trim())
      .filter(Boolean)
  )
  const nextDocuments = documents.map((item) => {
    if (!idSet.has(String(item.documentId || '').trim())) return item
    const fileName = getWorldbookDocumentMoveFileName(item)
    return {
      ...item,
      displayPath: buildUniqueDocumentPath(targetFolderPath, fileName, takenDisplayPaths),
      updatedAt: new Date().toISOString()
    }
  })
  return {
    documents: nextDocuments,
    entryIds: ids.map((item) => `document:${item}`)
  }
}

function moveFolderRecordsIntoFolder(
  documents: BrainDocumentRecord[],
  sourcePaths: string[],
  targetFolderPath: string
) {
  const safeSourcePaths = Array.from(new Set(sourcePaths.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!safeSourcePaths.length) return { documents, entryIds: [] as string[] }
  const takenFolderPaths = collectTakenFolderPaths(safeSourcePaths)
  const moveMap = new Map<string, string>()
  safeSourcePaths.forEach((sourcePath) => {
    const folderName = getFolderNameFromPath(sourcePath) || '新枝'
    const nextPrefix = buildUniquePath(`${targetFolderPath.replace(/\/+$/g, '')}/${folderName}`, takenFolderPaths)
    moveMap.set(sourcePath, nextPrefix)
  })
  const nextDocuments = documents.map((item) => {
    const currentPath = String(item.displayPath || '').trim()
    const sourcePrefix = findDeepestFolderPrefix(currentPath, moveMap)
    if (!sourcePrefix) return item
    return {
      ...item,
      displayPath: replacePathPrefix(currentPath, sourcePrefix, moveMap.get(sourcePrefix) || sourcePrefix),
      updatedAt: new Date().toISOString()
    }
  })
  return {
    documents: nextDocuments,
    entryIds: [...moveMap.values()].map((item) => `folder:${item}`)
  }
}

function convertDocumentToBranchContainer(
  documents: BrainDocumentRecord[],
  documentId: string
) {
  const current = documents.find((item) => String(item.documentId || '').trim() === String(documentId || '').trim())
  if (!current) return null
  const parentFolderPath = getParentFolderPathFromDisplayPath(current.displayPath)
  const branchLabel = getBranchLabelFromTitle(current.title || getDocumentSlugFromDisplayPath(current.displayPath), '新枝')
  const takenFolderPaths = collectTakenFolderPaths()
  const takenDisplayPaths = new Set(
    documents
      .filter((item) => String(item.documentId || '').trim() !== String(documentId || '').trim())
      .map((item) => String(item.displayPath || '').trim())
      .filter(Boolean)
  )
  const nextFolderPath = buildUniquePath(`${parentFolderPath.replace(/\/+$/g, '')}/${branchLabel}`, takenFolderPaths)
  const nextDocuments = documents.map((item) => {
    if (String(item.documentId || '').trim() !== String(documentId || '').trim()) return item
    return {
      ...item,
      title: buildOverviewTitle(item.title || branchLabel),
      displayPath: buildUniqueDocumentPath(nextFolderPath, 'index.md', takenDisplayPaths),
      updatedAt: new Date().toISOString()
    }
  })
  return {
    documents: nextDocuments,
    targetFolderPath: nextFolderPath,
    overviewDocumentId: current.documentId
  }
}

async function pasteWorldbookClipboardIntoFolderTarget(targetFolderPath: string, targetDocumentId = '') {
  if (!hasWorldbookClipboardData.value) return

  const originalDocumentIds = new Set(baseDocuments.value.map((item) => String(item.documentId || '').trim()).filter(Boolean))
  let workingDocuments = baseDocuments.value.map((item) => ({ ...item }))
  let destinationFolderPath = targetFolderPath

  if (targetDocumentId) {
    const converted = convertDocumentToBranchContainer(workingDocuments, targetDocumentId)
    if (!converted) return
    workingDocuments = converted.documents
    destinationFolderPath = converted.targetFolderPath
    await persistDocumentUpserts(workingDocuments, [targetDocumentId])
  }

  const clipboard = worldbookClipboard.value
  const pasteEntries = filterPasteEntriesForTarget(clipboard.entries, destinationFolderPath)
  if (pasteEntries.length !== clipboard.entries.length) {
    toast(t('docLibrary.toast.pasteCannotSelf'), 'warning')
  }
  if (!pasteEntries.length) return

  const result = pasteEntries.reduce((state, entry) => {
    const nextResult = clipboard.mode === 'copy'
      ? entry.kind === 'document'
        ? duplicateDocumentRecordsIntoFolder(state.documents, [entry.id], destinationFolderPath)
        : duplicateFolderRecordsIntoFolder(state.documents, [entry.id], destinationFolderPath)
      : entry.kind === 'document'
        ? moveDocumentRecordsIntoFolder(state.documents, [entry.id], destinationFolderPath)
        : moveFolderRecordsIntoFolder(state.documents, [entry.id], destinationFolderPath)
    return {
      documents: nextResult.documents,
      entryIds: [...state.entryIds, ...nextResult.entryIds],
      movedEntries: clipboard.mode === 'cut'
        ? [...state.movedEntries, { entry, entryIds: nextResult.entryIds }]
        : state.movedEntries
    }
  }, {
    documents: workingDocuments,
    entryIds: [] as string[],
    movedEntries: [] as Array<{ entry: WorldbookClipboardState['entries'][number]; entryIds: string[] }>
  })

  if (clipboard.mode === 'copy') {
    const copiedIds = result.documents
      .map((item) => String(item.documentId || '').trim())
      .filter((documentId) => documentId && !originalDocumentIds.has(documentId))
    await persistDocumentUpserts(result.documents, copiedIds)
  } else {
    for (const moved of result.movedEntries) {
      if (moved.entry.kind === 'folder') {
        const targetEntryId = moved.entryIds.find((item) => item.startsWith('folder:')) || ''
        const targetPath = targetEntryId.replace(/^folder:/, '')
        await persistDocLibraryTreeCommand({
          type: 'move_folder',
          sourcePath: moved.entry.id,
          parentFolderId: destinationFolderPath,
          title: getFolderNameFromPath(targetPath) || getFolderNameFromPath(moved.entry.id)
        })
        continue
      }
      const changedDocument = result.documents.find((item) => String(item.documentId || '').trim() === moved.entry.id)
      if (changedDocument) {
        await persistDocumentUpserts(result.documents, [moved.entry.id])
      }
    }
  }
  ensureFolderChainVisible(splitDisplayPath(destinationFolderPath))
  openFolderIds.value = [...new Set([...openFolderIds.value, getFolderTreeIdByPath(destinationFolderPath)])]
  if (result.entryIds.length) {
    appendEntriesToManualOrder(destinationFolderPath, result.entryIds)
  }
  if (clipboard.mode === 'cut') {
    clearWorldbookClipboard()
    documentMultiSelect.clearSelection()
  }
}

async function pasteWorldbookClipboardIntoCluster(clusterId: string) {
  const cluster = worldbookClusters.value.find((item) => item.id === clusterId)
  if (!cluster) return
  if (!openClusterIds.value.includes(cluster.id)) {
    openClusterIds.value = [...openClusterIds.value, cluster.id]
  }
  await pasteWorldbookClipboardIntoFolderTarget(cluster.folderPath)
}

async function pasteWorldbookClipboardIntoRow(row: TreeRow) {
  if (row.kind === 'folder') {
    await pasteWorldbookClipboardIntoFolderTarget(row.folderPath)
    return
  }
  await pasteWorldbookClipboardIntoFolderTarget(row.parentFolderPath, row.documentId)
}

function cloneWorldbookSnapshot(snapshot?: WorldbookOperationSnapshot): WorldbookOperationSnapshot {
  const source = snapshot || {
    documents: baseDocuments.value,
    manualOrders: manualTreeOrders.value,
    treeNodes: docLibraryTreeNodes.value,
    treeOrders: docLibraryTreeOrders.value,
    treeDiffReport: docLibraryTreeDiffReport.value
  }
  return {
    documents: source.documents.map((item) => ({ ...item })),
    manualOrders: Object.fromEntries(
      Object.entries(source.manualOrders || {}).map(([key, value]) => [key, Array.isArray(value) ? [...value] : []])
    ),
    treeNodes: (source.treeNodes || []).map((node) => ({ ...node })),
    treeOrders: normalizeTreeOrders(source.treeOrders),
    treeDiffReport: source.treeDiffReport
  }
}

function cloneWorldbookHistoryDelta(delta: WorldbookHistoryDelta): WorldbookHistoryDelta {
  return {
    documents: delta.documents.map((item) => ({
      id: item.id,
      before: item.before ? { ...item.before } : undefined,
      after: item.after ? { ...item.after } : undefined
    })),
    manualOrders: delta.manualOrders.map((item) => ({
      key: item.key,
      before: item.before ? [...item.before] : undefined,
      after: item.after ? [...item.after] : undefined
    })),
    treeNodes: delta.treeNodes.map((item) => ({
      id: item.id,
      before: item.before ? { ...item.before } : undefined,
      after: item.after ? { ...item.after } : undefined
    })),
    treeOrders: delta.treeOrders.map((item) => ({
      key: item.key,
      before: item.before ? [...item.before] : undefined,
      after: item.after ? [...item.after] : undefined
    })),
    treeDiffReport: delta.treeDiffReport ? { ...delta.treeDiffReport } : undefined
  }
}
type DocLibraryProjectionInput = {
  documents: BrainDocumentRecord[]
  manualTreeOrders: Record<string, string[]>
  treeNodes: DocTreeNodeRecord[]
  treeOrders: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
}

function buildRecordDelta<T extends object>(
  beforeRecords: T[],
  afterRecords: T[],
  getId: (record: T) => string
) {
  const beforeMap = new Map(beforeRecords.map((record) => [getId(record), record] as const).filter(([id]) => Boolean(id)))
  const afterMap = new Map(afterRecords.map((record) => [getId(record), record] as const).filter(([id]) => Boolean(id)))
  return [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
    .filter((id) => JSON.stringify(beforeMap.get(id)) !== JSON.stringify(afterMap.get(id)))
    .map((id) => ({
      id,
      before: beforeMap.get(id) ? { ...beforeMap.get(id)! } : undefined,
      after: afterMap.get(id) ? { ...afterMap.get(id)! } : undefined
    }))
}

function buildOrderDelta(beforeOrders: Record<string, string[]>, afterOrders: Record<string, string[]>) {
  const before = normalizeManualTreeOrders(beforeOrders)
  const after = normalizeManualTreeOrders(afterOrders)
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key] || []) !== JSON.stringify(after[key] || []))
    .map((key) => ({
      key,
      before: before[key] ? [...before[key]] : undefined,
      after: after[key] ? [...after[key]] : undefined
    }))
}

function createWorldbookHistoryDelta(before: WorldbookOperationSnapshot, after: WorldbookOperationSnapshot): WorldbookHistoryDelta {
  const delta: WorldbookHistoryDelta = {
    documents: buildRecordDelta(before.documents, after.documents, (record) => String(record.documentId || record.id || '').trim()),
    manualOrders: buildOrderDelta(before.manualOrders, after.manualOrders),
    treeNodes: buildRecordDelta(before.treeNodes, after.treeNodes, (record) => String(record.nodeId || '').trim()),
    treeOrders: buildOrderDelta(before.treeOrders, after.treeOrders)
  }
  if (JSON.stringify(before.treeDiffReport || null) !== JSON.stringify(after.treeDiffReport || null)) {
    delta.treeDiffReport = {
      before: before.treeDiffReport,
      after: after.treeDiffReport
    }
  }
  return delta
}

function isWorldbookHistoryDeltaEmpty(delta: WorldbookHistoryDelta) {
  return !delta.documents.length
    && !delta.manualOrders.length
    && !delta.treeNodes.length
    && !delta.treeOrders.length
    && !delta.treeDiffReport
}

function invertWorldbookHistoryDelta(delta: WorldbookHistoryDelta): WorldbookHistoryDelta {
  return {
    documents: delta.documents.map((item) => ({ id: item.id, before: item.after, after: item.before })),
    manualOrders: delta.manualOrders.map((item) => ({ key: item.key, before: item.after, after: item.before })),
    treeNodes: delta.treeNodes.map((item) => ({ id: item.id, before: item.after, after: item.before })),
    treeOrders: delta.treeOrders.map((item) => ({ key: item.key, before: item.after, after: item.before })),
    treeDiffReport: delta.treeDiffReport
      ? { before: delta.treeDiffReport.after, after: delta.treeDiffReport.before }
      : undefined
  }
}

function createWorldbookHistoryPatch(options: {
  kind: OperationPatchKind
  before: WorldbookOperationSnapshot
  after: WorldbookOperationSnapshot
  metadata?: Record<string, unknown>
}): WorldbookHistoryPatch | null {
  const delta = createWorldbookHistoryDelta(options.before, options.after)
  if (isWorldbookHistoryDeltaEmpty(delta)) return null
  const patch = createOperationPatch({
    kind: options.kind,
    version: 1,
    target: {
      module: 'doc-library',
      scopeId: 'worldbook',
      queueKey: `doc-library:worldbook:${options.kind}`
    },
    changes: [{
      type: 'custom',
      label: `doc-library-history:${options.kind}`,
      payload: { delta: cloneWorldbookHistoryDelta(delta) } as Record<string, unknown>
    }],
    metadata: options.metadata
  })
  return {
    undoPatch: createUndoPatch(patch, [{
      type: 'custom',
      label: `doc-library-history:undo:${options.kind}`,
      payload: { delta: invertWorldbookHistoryDelta(delta) } as Record<string, unknown>
    }]),
    redoPatch: createRedoPatch(patch, [{
      type: 'custom',
      label: `doc-library-history:redo:${options.kind}`,
      payload: { delta: cloneWorldbookHistoryDelta(delta) } as Record<string, unknown>
    }])
  }
}

function pushWorldbookHistoryPatch(patch: WorldbookHistoryPatch | null | undefined) {
  if (isApplyingWorldbookHistory.value) return
  if (!patch) return
  worldbookUndoStack.value = [...worldbookUndoStack.value.slice(-39), patch]
  worldbookRedoStack.value = []
}

function applyRecordDelta<T extends object>(
  records: T[],
  deltas: Array<{ id: string; before?: T; after?: T }>,
  getId: (record: T) => string
) {
  const map = new Map(records.map((record) => [getId(record), { ...record }] as const).filter(([id]) => Boolean(id)))
  deltas.forEach((delta) => {
    if (delta.after) {
      map.set(delta.id, { ...delta.after })
    } else {
      map.delete(delta.id)
    }
  })
  return [...map.values()]
}

function applyOrderDelta(orders: Record<string, string[]>, deltas: Array<{ key: string; before?: string[]; after?: string[] }>) {
  const next = normalizeManualTreeOrders(orders)
  deltas.forEach((delta) => {
    if (delta.after) {
      next[delta.key] = [...delta.after]
    } else {
      delete next[delta.key]
    }
  })
  return next
}

function resolveWorldbookHistorySnapshot(patch: OperationPatch): WorldbookOperationSnapshot | null {
  const change = patch.changes.find((item) => item.type === 'custom')
  if (!change || change.type !== 'custom') return null
  const payload = change.payload as { delta?: WorldbookHistoryDelta }
  const delta = payload.delta
  if (!delta) return null
  const current = cloneWorldbookSnapshot()
  return cloneWorldbookSnapshot({
    documents: applyRecordDelta(current.documents, delta.documents || [], (record) => String(record.documentId || record.id || '').trim()),
    manualOrders: applyOrderDelta(current.manualOrders, delta.manualOrders || []),
    treeNodes: applyRecordDelta(current.treeNodes, delta.treeNodes || [], (record) => String(record.nodeId || '').trim()),
    treeOrders: applyOrderDelta(current.treeOrders, delta.treeOrders || []),
    treeDiffReport: delta.treeDiffReport ? delta.treeDiffReport.after : current.treeDiffReport
  })
}

async function applyWorldbookHistoryPatch(patch: OperationPatch) {
  const snapshot = resolveWorldbookHistorySnapshot(patch)
  if (!snapshot) return
  isApplyingWorldbookHistory.value = true
  try {
    const nextSnapshot = buildDocLibraryTreeCommandResult({
      documents: cloneWorldbookDocuments(snapshot.documents),
      manualTreeOrders: normalizeManualTreeOrders(snapshot.manualOrders),
      treeNodes: snapshot.treeNodes,
      treeOrders: snapshot.treeOrders,
      treeDiffReport: snapshot.treeDiffReport,
      relationSystemState: normalizeRelationSystemState(relationSystemState.value)
    })
    charStore.setDocuments(nextSnapshot.documents)
    await queueDocLibrarySnapshotPersistence(nextSnapshot)
  } finally {
    isApplyingWorldbookHistory.value = false
  }
}

async function undoWorldbookOps() {
  const previous = worldbookUndoStack.value[worldbookUndoStack.value.length - 1]
  if (!previous) return
  worldbookUndoStack.value = worldbookUndoStack.value.slice(0, -1)
  worldbookRedoStack.value = [...worldbookRedoStack.value, previous]
  await applyWorldbookHistoryPatch(previous.undoPatch)
}

async function redoWorldbookOps() {
  const next = worldbookRedoStack.value[worldbookRedoStack.value.length - 1]
  if (!next) return
  worldbookRedoStack.value = worldbookRedoStack.value.slice(0, -1)
  worldbookUndoStack.value = [...worldbookUndoStack.value, next]
  await applyWorldbookHistoryPatch(next.redoPatch)
}

function saveSortDialog() {
  const nextOrder = [...sortDialogItems.value.map((item) => item.id)]
  const legacyParentId = sortDialogMode.value === 'cluster'
    ? '__root__'
    : getFolderPathByTreeId(sortDialogTargetFolderId.value)

  void persistDocLibraryTreeCommand({
    type: 'sort_children',
    parentFolderId: legacyParentId,
    childEntryIds: nextOrder.map(treeOrderEntryToLegacyEntry)
  })
  closeSortDialog()
}

async function persistDocLibraryTreeCommand(command: DocLibraryTreeCommand, options: { mode?: DocLibraryPersistenceMode } = {}) {
  const before = cloneWorldbookSnapshot()
  const target = getDocLibraryTreeCommandTarget(command)
  if ((options.mode || 'optimistic') === 'confirmed') {
    syncWorldbookPendingTarget(target, 'deleting')
  }
  try {
    const snapshot = await docLibraryPersistence.persistTreeCommand(command, options)
    pushWorldbookHistoryPatch(createWorldbookHistoryPatch({
      kind: command.type === 'delete_documents' || command.type === 'delete_folder'
        ? 'delete'
        : command.type === 'rename_document' || command.type === 'rename_folder'
          ? 'rename'
          : command.type === 'move_documents' || command.type === 'move_folder'
            ? 'move'
            : command.type === 'sort_children'
              ? 'sort'
              : 'create',
      before,
      after: cloneWorldbookSnapshot({
        documents: snapshot.documents,
        manualOrders: snapshot.manualTreeOrders,
        treeNodes: snapshot.treeNodes || [],
        treeOrders: normalizeTreeOrders(snapshot.treeOrders),
        treeDiffReport: snapshot.treeDiffReport
      }),
      metadata: { commandType: command.type }
    }))
    return snapshot
  } finally {
    if ((options.mode || 'optimistic') === 'confirmed') {
      syncWorldbookPendingTarget(target, '')
    }
  }
}

async function persistDocLibraryTreeCommands(commands: DocLibraryTreeCommand[], options: { mode?: DocLibraryPersistenceMode } = {}) {
  const before = cloneWorldbookSnapshot()
  const snapshot = await docLibraryPersistence.persistTreeCommands(commands, options)
  if (snapshot) {
    pushWorldbookHistoryPatch(createWorldbookHistoryPatch({
      kind: 'batch',
      before,
      after: cloneWorldbookSnapshot({
        documents: snapshot.documents,
        manualOrders: snapshot.manualTreeOrders,
        treeNodes: snapshot.treeNodes || [],
        treeOrders: normalizeTreeOrders(snapshot.treeOrders),
        treeDiffReport: snapshot.treeDiffReport
      }),
      metadata: { commandTypes: commands.map((command) => command.type) }
    }))
  }
  return snapshot
}

async function persistDocumentUpserts(nextDocuments: BrainDocumentRecord[], documentIds?: string[], options: { mode?: DocLibraryPersistenceMode } = {}) {
  const before = cloneWorldbookSnapshot()
  const snapshot = await docLibraryPersistence.persistDocumentUpserts(nextDocuments, documentIds, options)
  if (snapshot) {
    pushWorldbookHistoryPatch(createWorldbookHistoryPatch({
      kind: 'save',
      before,
      after: cloneWorldbookSnapshot({
        documents: snapshot.documents,
        manualOrders: snapshot.manualTreeOrders,
        treeNodes: snapshot.treeNodes || [],
        treeOrders: normalizeTreeOrders(snapshot.treeOrders),
        treeDiffReport: snapshot.treeDiffReport
      }),
      metadata: { documentIds }
    }))
  }
  return snapshot
}

function applyDocLibraryTreeSnapshot(snapshot: Partial<DocLibraryPersistenceSnapshot>) {
  manualTreeOrders.value = normalizeManualTreeOrders(snapshot.manualTreeOrders)
  docLibraryTreeNodes.value = Array.isArray(snapshot.treeNodes) ? snapshot.treeNodes.map((node) => ({ ...node })) : []
  docLibraryTreeOrders.value = normalizeTreeOrders(snapshot.treeOrders)
  docLibraryTreeDiffReport.value = snapshot.treeDiffReport
}

function queueDocLibraryPersistence() {
  return docLibraryPersistence.queuePersistence()
}

function queueDocLibrarySnapshotPersistence(snapshot: DocLibraryPersistenceSnapshot) {
  const before = cloneWorldbookSnapshot()
  const nextSnapshot = cloneWorldbookSnapshot({
    documents: snapshot.documents,
    manualOrders: snapshot.manualTreeOrders,
    treeNodes: snapshot.treeNodes || [],
    treeOrders: normalizeTreeOrders(snapshot.treeOrders),
    treeDiffReport: snapshot.treeDiffReport
  })
  pushWorldbookHistoryPatch(createWorldbookHistoryPatch({
    kind: 'custom',
    before,
    after: nextSnapshot,
    metadata: { source: 'snapshotPersistence' }
  }))
  charStore.setDocuments(snapshot.documents)
  applyDocLibraryTreeSnapshot(snapshot)
  return docLibraryPersistence.queueSnapshotPersistence(snapshot)
}

async function applyLegacyLocalTreeOrders(orders: Record<string, string[]>) {
  for (const [parentFolderId, childEntryIds] of Object.entries(normalizeManualTreeOrders(orders))) {
    await persistDocLibraryTreeCommand({
      type: 'sort_children',
      parentFolderId,
      childEntryIds
    })
  }
}

function exportWorldbookJson() {
  try {
    worldbookTransfer.exportJsonFile()
    toast(t('docLibrary.toast.worldTreeExported'), 'success')
  } catch (error) {
    console.error('导出世界树失败', error)
    toast(t('docLibrary.toast.worldTreeExportFailed'), 'error')
  }
}

function handleWorldbookJsonTransferError(message: string) {
  toast(t('docLibrary.toast.importJsonFailed', { message: String(message || t('docLibrary.dialog.jsonParseFailed')) }), 'error')
}

function deferDocLibraryImportSave(task: () => void) {
  if (typeof window === 'undefined') {
    task()
    return
  }
  window.setTimeout(task, 0)
}

function runDocLibraryImportSave(task: () => Promise<void>, successMessage: string, failurePrefix = t('docLibrary.dialog.importFailed')) {
  deferDocLibraryImportSave(() => {
    void task()
      .then(() => {
        toast(successMessage, 'success')
      })
      .catch((error) => {
        console.error(failurePrefix, error)
        toast(`${failurePrefix}：${error instanceof Error ? error.message : t('docLibrary.dialog.saveNotDone')}`, 'error')
      })
  })
}

function queueImportWorldbookJson(input: unknown) {
  let payload
  try {
    payload = worldbookTransfer.normalizeImportPayload(input)
  } catch (error) {
    handleWorldbookJsonTransferError(error instanceof Error ? error.message : t('docLibrary.dialog.importFormatWrong'))
    return
  }
  openConfirmDialog(
    t('docLibrary.dialog.importJsonTitle'),
    worldbookTransfer.buildImportConfirmMessage(payload),
    () => {
      runDocLibraryImportSave(async () => {
        const nextRelationSystemState = normalizeRelationSystemState(payload.relationSystemState)
        const nextManualTreeOrders = normalizeManualTreeOrders(payload.manualTreeOrders)
        const nextDocuments = cloneWorldbookDocuments(payload.documents)
        const snapshot = buildDocLibraryTreeCommandResult({
          documents: nextDocuments,
          manualTreeOrders: nextManualTreeOrders,
          relationSystemState: nextRelationSystemState
        })
        if (!snapshot.commandAudit.ok || snapshot.treeDiffReport?.blockerCount) {
          throw new Error(snapshot.commandAudit.message || t('docLibrary.dialog.auditFailed'))
        }
        relationSystemState.value = nextRelationSystemState
        await queueDocLibrarySnapshotPersistence(snapshot)
        selectedDocumentId.value = payload.documents.some((item) => item.documentId === selectedDocumentId.value)
          ? selectedDocumentId.value
          : (payload.documents[0]?.documentId || '')
        isEditMode.value = false
      }, t('docLibrary.dialog.worldTreeImported'), t('docLibrary.dialog.importFailed'))
    },
    t('docLibrary.dialog.confirmImport')
  )
}

function normalizeFolderTargetPath(targetKind: 'folder' | 'cluster', targetId: string) {
  return getFolderPathByTreeId(String(targetId || '').trim())
}

function getFolderNameFromPath(path: string) {
  return String(path || '').split('/').filter(Boolean).pop() || ''
}

function getAncestorFolderPath(path: string, levels = 1) {
  const safePath = String(path || '').trim().replace(/\/+$/g, '')
  if (!safePath) return ''
  const segments = safePath.split('/').filter(Boolean)
  if (segments.length <= levels) return ''
  return `/${segments.slice(0, segments.length - levels).join('/')}`
}

function isGenericWorldBranchName(name: string) {
  const safeName = String(name || '').trim()
  return GENERIC_WORLD_BRANCH_NAMES.includes(safeName)
}

function buildNamedGenericBranch(ownerLabel: string, branchName: string) {
  const safeOwner = String(ownerLabel || '').trim()
  const safeBranch = String(branchName || '').trim()
  if (!safeOwner || !safeBranch || !isGenericWorldBranchName(safeBranch)) return safeBranch
  if (safeBranch.startsWith(safeOwner)) return safeBranch
  return `${safeOwner}${safeBranch}`
}

function buildSyntheticContainerDocument(folderPath: string, title: string): BrainDocumentRecord {
  const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const updatedAt = new Date().toISOString()
  const normalizedFolder = String(folderPath || '/文档').replace(/\/+$/g, '')
  const safeTitle = String(title || '新桠').trim() || '新桠'
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title: safeTitle,
    displayPath: `${normalizedFolder}/index.md`,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    semanticType: 'other',
    summary: '',
    tags: ['结构承接'],
    content: `# ${safeTitle}\n\n用于承接拖入后的子枝结构。`,
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'pending',
    createdAt: updatedAt,
    updatedAt
  }
}

function buildUniquePath(basePath: string, takenPaths: Set<string>) {
  const normalizedBase = String(basePath || '').trim().replace(/\/+$/g, '')
  if (!normalizedBase) return normalizedBase
  if (!takenPaths.has(normalizedBase)) {
    takenPaths.add(normalizedBase)
    return normalizedBase
  }
  const segments = normalizedBase.split('/').filter(Boolean)
  const leafName = segments.pop() || '新项'
  const parentPath = segments.length ? `/${segments.join('/')}` : ''
  let counter = 2
  while (true) {
    const candidate = `${parentPath}/${leafName}-${counter}`.replace(/\/{2,}/g, '/')
    if (!takenPaths.has(candidate)) {
      takenPaths.add(candidate)
      return candidate
    }
    counter += 1
  }
}

function getParentFolderPathFromFolderPath(folderPath: string) {
  const segments = splitDisplayPath(folderPath)
  if (segments.length <= 1) return '/'
  return `/${segments.slice(0, -1).join('/')}`.replace(/\/{2,}/g, '/') || '/'
}

function collectTakenFolderPaths(excludedPrefixes: string[] = []) {
  const excluded = excludedPrefixes
    .map((item) => String(item || '').trim().replace(/\/+$/g, ''))
    .filter(Boolean)
  return new Set(
    Array.from(folderLookup.value.keys()).filter((path) => (
      !excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ))
  )
}

function collectTakenDisplayPaths(excludedDocumentIds: string[] = []) {
  const excluded = new Set(excludedDocumentIds.map((item) => String(item || '').trim()).filter(Boolean))
  return new Set(
    baseDocuments.value
      .filter((item) => !excluded.has(String(item.documentId || '').trim()))
      .map((item) => String(item.displayPath || '').trim())
      .filter(Boolean)
  )
}

function buildUniqueDocumentPath(parentFolderPath: string, fileName: string, takenDisplayPaths: Set<string>) {
  const safeParent = String(parentFolderPath || '').trim().replace(/\/+$/g, '') || '/文档'
  const rawFileName = String(fileName || '新页面.md').trim() || '新页面.md'
  const normalizedFileName = rawFileName.endsWith('.md') ? rawFileName : `${rawFileName}.md`
  const baseName = normalizedFileName.replace(/\.md$/i, '')
  let candidate = `${safeParent}/${normalizedFileName}`.replace(/\/{2,}/g, '/')
  if (!takenDisplayPaths.has(candidate)) {
    takenDisplayPaths.add(candidate)
    return candidate
  }
  let counter = 2
  while (true) {
    candidate = `${safeParent}/${baseName}-${counter}.md`.replace(/\/{2,}/g, '/')
    if (!takenDisplayPaths.has(candidate)) {
      takenDisplayPaths.add(candidate)
      return candidate
    }
    counter += 1
  }
}

function buildUniqueRootClusterPathFromLabel(label: string, takenPaths: Set<string>) {
  const safeLabel = String(label || '新树簇').trim() || '新树簇'
  return buildUniquePath(`/${safeLabel}`, takenPaths)
}

function resolveWorldbookTargetEntry(target: WorldbookPreviewTarget) {
  if (target.kind === 'root') {
    return {
      parentContainerId: '__root__',
      targetEntryId: '',
      mode: 'inside' as const
    }
  }
  if (target.kind === 'cluster') {
    if (target.mode === 'inside') {
      return {
        parentContainerId: String(target.id || '').trim(),
        targetEntryId: '',
        mode: 'inside' as const
      }
    }
    return {
      parentContainerId: '__root__',
      targetEntryId: `folder:${String(target.id || '').trim()}`,
      mode: target.mode
    }
  }
  if (target.kind === 'folder') {
    const row = visibleTreeRows.value.find((item): item is TreeFolderRow => item.kind === 'folder' && item.folderId === target.id)
    if (!row) return null
    if (target.mode === 'inside') {
      return {
        parentContainerId: row.folderId,
        targetEntryId: '',
        mode: 'inside' as const
      }
    }
    return {
      parentContainerId: row.parentFolderId || '__root__',
      targetEntryId: `folder:${row.folderId}`,
      mode: target.mode
    }
  }
  const row = visibleTreeRows.value.find((item): item is TreeDocumentRow => item.kind === 'document' && item.documentId === target.id)
  if (!row) return null
  return {
    parentContainerId: row.parentFolderId || '__root__',
    targetEntryId: `document:${row.documentId}`,
    mode: target.mode === 'inside' ? 'after' as const : target.mode
  }
}

function appendEntriesToManualOrder(parentFolderId: string, entryIds: string[], targetEntryId = '', position: 'before' | 'after' = 'after') {
  const safeParentId = String(parentFolderId || '__root__').trim() || '__root__'
  const folder = safeParentId === '__root__' ? null : folderLookup.value.get(safeParentId) || null
  const folderEntries = folder ? Array.from(folder.children.values()) : Array.from(folderTree.value.values())
  const documentEntries = folder ? Array.from(folder.documents) : []
  const current = getOrderedChildIds(
    safeParentId,
    folderEntries.map((item) => item.folderPath),
    documentEntries.map((item) => item.documentId)
  )
  const movingSet = new Set(entryIds)
  void persistDocLibraryTreeCommand({
    type: 'sort_children',
    parentFolderId: safeParentId,
    childEntryIds: targetEntryId
      ? insertEntriesAroundTarget(current, entryIds, targetEntryId, position)
      : [...current.filter((item) => !movingSet.has(item)), ...entryIds]
  })
}

async function moveWorldbookDocumentsIntoBottom(documentIds: string[], targetKind: 'folder' | 'cluster', targetId: string) {
  const safeIds = Array.from(new Set(documentIds.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!safeIds.length) return

  const targetFolderPath = normalizeFolderTargetPath(targetKind, targetId)
  await persistDocLibraryTreeCommand({
    type: 'move_documents',
    documentIds: safeIds,
    parentFolderId: targetFolderPath
  })
}

function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  return replaceDocLibraryPathPrefix(path, oldPrefix, newPrefix)
}

async function moveWorldbookFolderLikeIntoBottom(sourcePaths: string[], targetKind: 'folder' | 'cluster', targetId: string) {
  const safePaths = Array.from(new Set(sourcePaths.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!safePaths.length) return

  const targetFolderPath = normalizeFolderTargetPath(targetKind, targetId).replace(/\/+$/g, '')
  const moveMap = new Map<string, string>()
  for (const sourcePath of safePaths) {
    const folderName = sourcePath.split('/').filter(Boolean).pop()
    if (!folderName) continue
    const nextPrefix = `${targetFolderPath}/${folderName}`
    if (nextPrefix === sourcePath || nextPrefix.startsWith(`${sourcePath}/`)) return
    moveMap.set(sourcePath, nextPrefix)
  }
  if (!moveMap.size) return
  for (const [sourcePath, targetPath] of moveMap.entries()) {
    await persistDocLibraryTreeCommand({
      type: 'move_folder',
      sourcePath,
      parentFolderId: targetFolderPath,
      title: targetPath.split('/').filter(Boolean).pop() || ''
    })
  }
}

async function moveWorldbookEntries(payload: { rowKind: WorldbookDragRowKind; ids: string[]; target: WorldbookPreviewTarget }) {
  const ids = Array.isArray(payload.ids) ? payload.ids.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (!ids.length) return
  const resolvedTarget = resolveWorldbookTargetEntry(payload.target)
  if (!resolvedTarget) return


  const destinationContainerId = String(resolvedTarget.parentContainerId || '__root__').trim() || '__root__'
  const targetEntryId = String(resolvedTarget.targetEntryId || '').trim()
  const moveToRoot = destinationContainerId === '__root__'

  if (payload.rowKind === 'document') {
    const currentDocuments = baseDocuments.value
    const movingSet = new Set(ids)
    const takenFolderPaths = collectTakenFolderPaths()
    const takenDisplayPaths = collectTakenDisplayPaths(ids)
    const movedRootEntryIds: string[] = []
    const nextDocuments = currentDocuments.map((item) => {
      if (!movingSet.has(String(item.documentId || '').trim())) return item
      const currentFileName = getWorldbookDocumentMoveFileName(item)
      if (moveToRoot) {
        const rootClusterPath = buildUniqueRootClusterPathFromLabel(item.title || getDocumentSlugFromDisplayPath(item.displayPath), takenFolderPaths)
        movedRootEntryIds.push(`folder:${rootClusterPath}`)
        return {
          ...item,
          displayPath: buildUniqueDocumentPath(rootClusterPath, 'index.md', takenDisplayPaths),
          updatedAt: new Date().toISOString()
        }
      }
      return {
        ...item,
        displayPath: buildUniqueDocumentPath(destinationContainerId, currentFileName, takenDisplayPaths),
        updatedAt: new Date().toISOString()
      }
    })
    await persistDocumentUpserts(nextDocuments, ids)
    const entryIds = moveToRoot ? movedRootEntryIds : ids.map((item) => `document:${item}`)
    if (destinationContainerId === '__root__') {
      persistInsertedManualTreeOrder('__root__', entryIds, targetEntryId, resolvedTarget.mode === 'after' ? 'after' : 'before')
      return
    }
    if (targetEntryId) {
      persistInsertedManualTreeOrder(destinationContainerId, entryIds, targetEntryId, resolvedTarget.mode === 'after' ? 'after' : 'before')
      return
    }
    appendEntriesToManualOrder(destinationContainerId, entryIds)
    return
  }

  const sourcePaths = ids
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  const takenFolderPaths = collectTakenFolderPaths(sourcePaths)
  const moveMap = new Map<string, string>()
  const branchRenameMap = new Map<string, string>()
  const syntheticDocuments: BrainDocumentRecord[] = []
  const existingSourceIndexPaths = new Set(
    baseDocuments.value
      .map((item) => String(item.displayPath || '').trim())
      .filter((item) => item.endsWith('/index.md'))
  )
  const directChildFolderNamesByParent = buildDirectChildFolderNameIndex(folderLookup.value.values())
  for (const sourcePath of sourcePaths) {
    const folderName = getFolderNameFromPath(sourcePath)
    if (!folderName) continue
    const desiredPath = moveToRoot
      ? `/${folderName}`
      : `${destinationContainerId.replace(/\/+$/g, '')}/${folderName}`
    const nextPrefix = buildUniquePath(desiredPath, takenFolderPaths)
    if (nextPrefix === sourcePath || nextPrefix.startsWith(`${sourcePath}/`)) continue
    moveMap.set(sourcePath, nextPrefix)
    if (!moveToRoot && !existingSourceIndexPaths.has(`${sourcePath}/index.md`)) {
      syntheticDocuments.push(buildSyntheticContainerDocument(nextPrefix, folderName))
    }

    const directChildFolders = [...(directChildFolderNamesByParent.get(normalizeDisplayPath(sourcePath)) || [])]

    directChildFolders.forEach((childFolderName) => {
      if (!isGenericWorldBranchName(childFolderName)) return
      const renamedChild = buildNamedGenericBranch(folderName, childFolderName)
      if (renamedChild === childFolderName) return
      branchRenameMap.set(`${sourcePath}/${childFolderName}`, `${nextPrefix}/${renamedChild}`)
    })
  }
  if (!moveMap.size) return
  const nextDocuments = baseDocuments.value.map((item) => {
    const currentPath = String(item.displayPath || '').trim()
    const renamedBranchSource = findDeepestFolderPrefix(currentPath, branchRenameMap)
    if (renamedBranchSource) {
      const renamedBranchTarget = branchRenameMap.get(renamedBranchSource) || renamedBranchSource
      return {
        ...item,
        displayPath: replacePathPrefix(currentPath, renamedBranchSource, renamedBranchTarget),
        updatedAt: new Date().toISOString()
      }
    }
    const sourcePrefix = findDeepestFolderPrefix(currentPath, moveMap)
    if (!sourcePrefix) return item
    const targetPrefix = moveMap.get(sourcePrefix) || sourcePrefix
    return {
      ...item,
      displayPath: replacePathPrefix(currentPath, sourcePrefix, targetPrefix),
      updatedAt: new Date().toISOString()
    }
  })
  const previousPathById = new Map(baseDocuments.value.map((item) => [String(item.documentId || '').trim(), String(item.displayPath || '').trim()]))
  const mergedDocuments = [...nextDocuments, ...syntheticDocuments]
  const changedDocumentIds = mergedDocuments.reduce<string[]>((ids, current) => {
    const documentId = String(current.documentId || '').trim()
    if (documentId && (!previousPathById.has(documentId) || previousPathById.get(documentId) !== String(current.displayPath || '').trim())) ids.push(documentId)
    return ids
  }, [])
  await persistDocumentUpserts(mergedDocuments, changedDocumentIds)
  for (const sourcePath of moveMap.keys()) {
    await persistDocLibraryTreeCommand({ type: 'delete_folder', folderPath: sourcePath })
  }
  const entryIds = [...moveMap.values()].map((item) => `folder:${item}`)
  if (destinationContainerId === '__root__') {
    persistInsertedManualTreeOrder('__root__', entryIds, targetEntryId, resolvedTarget.mode === 'after' ? 'after' : 'before')
    return
  }
  if (targetEntryId) {
    persistInsertedManualTreeOrder(destinationContainerId, entryIds, targetEntryId, resolvedTarget.mode === 'after' ? 'after' : 'before')
    return
  }
  appendEntriesToManualOrder(destinationContainerId, entryIds)
}

async function releaseWorldbookDocuments(documentIds: string[]) {
  const safeIds = Array.from(new Set(documentIds.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!safeIds.length) return
  const safeIdSet = new Set(safeIds)

  const takenFolderPaths = collectTakenFolderPaths()
  const takenDisplayPaths = collectTakenDisplayPaths(safeIds)
  const releasedRootEntryIds: string[] = []
  const releasedContainerEntries = new Map<string, string[]>()
  const nextDocuments = baseDocuments.value.map((item) => {
    const documentId = String(item.documentId || '').trim()
    if (!safeIdSet.has(documentId)) return item
    const parentFolderPath = getParentFolderPathFromDisplayPath(item.displayPath)
    const releaseParentPath = getAncestorFolderPath(parentFolderPath, 1)
    const currentFileName = getWorldbookDocumentMoveFileName(item)
    if (!releaseParentPath) {
      const rootClusterPath = buildUniqueRootClusterPathFromLabel(item.title || getDocumentSlugFromDisplayPath(item.displayPath), takenFolderPaths)
      releasedRootEntryIds.push(`folder:${rootClusterPath}`)
      return {
        ...item,
        displayPath: buildUniqueDocumentPath(rootClusterPath, 'index.md', takenDisplayPaths),
        updatedAt: new Date().toISOString()
      }
    }
    const entryIds = releasedContainerEntries.get(releaseParentPath) || []
    entryIds.push(`document:${documentId}`)
    releasedContainerEntries.set(releaseParentPath, entryIds)
    return {
      ...item,
      displayPath: buildUniqueDocumentPath(releaseParentPath, currentFileName, takenDisplayPaths),
      updatedAt: new Date().toISOString()
    }
  })
  await persistDocumentUpserts(nextDocuments, safeIds)
  if (releasedRootEntryIds.length) {
    appendEntriesToManualOrder('__root__', releasedRootEntryIds)
  }
  releasedContainerEntries.forEach((entryIds, parentFolderId) => {
    appendEntriesToManualOrder(parentFolderId, entryIds)
  })
}

async function releaseWorldbookFolders(folderIds: string[]) {
  const safeIds = Array.from(new Set(folderIds.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!safeIds.length) return

  const takenFolderPaths = collectTakenFolderPaths(safeIds)
  const moveMap = new Map<string, string>()
  for (const sourcePath of safeIds) {
    const folderName = getFolderNameFromPath(sourcePath)
    if (!folderName) continue
    const releaseParentPath = getAncestorFolderPath(sourcePath, 2)
    const desiredPath = releaseParentPath
      ? `${releaseParentPath.replace(/\/+$/g, '')}/${folderName}`
      : `/${folderName}`
    const nextPrefix = buildUniquePath(desiredPath, takenFolderPaths)
    if (nextPrefix === sourcePath || nextPrefix.startsWith(`${sourcePath}/`)) continue
    moveMap.set(sourcePath, nextPrefix)
  }
  if (!moveMap.size) return
  const nextDocuments = baseDocuments.value.map((item) => {
    const currentPath = String(item.displayPath || '').trim()
    const sourcePrefix = findDeepestFolderPrefix(currentPath, moveMap)
    if (!sourcePrefix) return item
    const targetPrefix = moveMap.get(sourcePrefix) || sourcePrefix
    return {
      ...item,
      displayPath: replacePathPrefix(currentPath, sourcePrefix, targetPrefix),
      updatedAt: new Date().toISOString()
    }
  })
  const previousPathById = new Map(baseDocuments.value.map((item) => [String(item.documentId || '').trim(), String(item.displayPath || '').trim()]))
  const changedDocumentIds = nextDocuments
    .map((item) => String(item.documentId || '').trim())
    .filter((documentId) => documentId && previousPathById.get(documentId) !== String(nextDocuments.find((item) => String(item.documentId || '').trim() === documentId)?.displayPath || '').trim())
  await persistDocumentUpserts(nextDocuments, changedDocumentIds)
  for (const sourcePath of moveMap.keys()) {
    await persistDocLibraryTreeCommand({ type: 'delete_folder', folderPath: sourcePath })
  }
  const rootEntryIds: string[] = []
  const folderEntryMap = new Map<string, string[]>()
  moveMap.forEach((targetPath) => {
    const parentFolderId = getAncestorFolderPath(targetPath, 1)
    const entryId = `folder:${targetPath}`
    if (!parentFolderId) {
      rootEntryIds.push(entryId)
      return
    }
    const entries = folderEntryMap.get(parentFolderId) || []
    entries.push(entryId)
    folderEntryMap.set(parentFolderId, entries)
  })
  if (rootEntryIds.length) {
    appendEntriesToManualOrder('__root__', rootEntryIds)
  }
  folderEntryMap.forEach((entryIds, parentFolderId) => {
    appendEntriesToManualOrder(parentFolderId, entryIds)
  })
}

async function releaseWorldbookRows(row: TreeRow) {
  if (getWorldbookMenuMode(row) === 'batch') {
    await releaseWorldbookDocuments([...selectedDocumentIds.value])
    return
  }
  if (row.kind === 'document') {
    await releaseWorldbookDocuments([row.documentId])
    return
  }
  await releaseWorldbookFolders([row.folderId])
}

async function moveWorldbookRowsInto(payload: { rowKind: WorldbookDragRowKind; ids: string[]; targetKind: 'folder' | 'cluster'; targetId: string }) {
  const targetKind = payload.targetKind === 'cluster' ? 'cluster' : 'folder'
  const targetId = String(payload.targetId || '').trim()
  const ids = Array.isArray(payload.ids) ? payload.ids.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (!targetId || !ids.length) return
  await moveWorldbookEntries({
    rowKind: payload.rowKind,
    ids,
    target: {
      kind: targetKind,
      id: targetId,
      mode: 'inside'
    }
  })
}

async function dropWorldbookRows(payload: { rowKind: WorldbookDragRowKind; ids: string[]; target: WorldbookPreviewTarget }) {
  await moveWorldbookEntries(payload)
}

function reorderWorldbookSidebarItems(payload: { itemIds: string[]; targetId: string; position?: 'before' | 'after' }) {
  const itemIds = Array.from(new Set((payload?.itemIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
  const targetId = String(payload?.targetId || '').trim()
  const position = payload?.position === 'after' ? 'after' : 'before'
  if (!itemIds.length || !targetId) return
  const documentRows = visibleTreeRows.value.filter((row): row is TreeDocumentRow => row.kind === 'document')
  const targetRow = documentRows.find((row) => row.documentId === targetId)
  if (!targetRow) return
  const movingRows = itemIds
    .map((id) => documentRows.find((row) => row.documentId === id))
    .filter((row): row is TreeDocumentRow => Boolean(row))
  if (!movingRows.length || movingRows.some((row) => row.parentFolderId !== targetRow.parentFolderId)) return

  const parentFolderId = targetRow.parentFolderId || '__root__'
  const folder = parentFolderId === '__root__' ? null : folderLookup.value.get(parentFolderId) || null
  const folderEntries = folder ? Array.from(folder.children.values()) : Array.from(folderTree.value.values())
  const documentEntries = folder ? Array.from(folder.documents) : []
  const orderedIds = getOrderedChildIds(parentFolderId, folderEntries.map((item) => item.folderPath), documentEntries.map((item) => item.documentId))
  const movingEntryIds = itemIds.map((id) => `document:${id}`)
  const movingSet = new Set(movingEntryIds)
  const remaining = orderedIds.filter((entryId) => !movingSet.has(entryId))
  const targetEntryId = `document:${targetId}`
  const targetIndex = remaining.indexOf(targetEntryId)
  if (targetIndex < 0) return
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  remaining.splice(insertIndex, 0, ...movingEntryIds)

  void persistDocLibraryTreeCommand({ type: 'sort_children', parentFolderId, childEntryIds: remaining })
}

function reorderWorldbookSidebarFolders(payload: { folderIds: string[]; targetId: string; parentFolderId?: string; position?: 'before' | 'after' }) {
  const folderIds = Array.from(new Set((payload?.folderIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
  const targetId = String(payload?.targetId || '').trim()
  const position = payload?.position === 'after' ? 'after' : 'before'
  if (!folderIds.length || !targetId) return
  const folderRows = visibleTreeRows.value.filter((row): row is TreeFolderRow => row.kind === 'folder')
  const targetRow = folderRows.find((row) => row.folderId === targetId)
  if (!targetRow) return
  const movingRows = folderIds
    .map((id) => folderRows.find((row) => row.folderId === id))
    .filter((row): row is TreeFolderRow => Boolean(row))
  if (!movingRows.length || movingRows.some((row) => row.parentFolderId !== targetRow.parentFolderId)) return

  const parentFolderId = targetRow.parentFolderId || '__root__'
  const folder = parentFolderId === '__root__' ? null : folderLookup.value.get(parentFolderId) || null
  const folderEntries = folder ? Array.from(folder.children.values()) : Array.from(folderTree.value.values())
  const documentEntries = folder ? Array.from(folder.documents) : []
  const orderedIds = getOrderedChildIds(parentFolderId, folderEntries.map((item) => item.folderPath), documentEntries.map((item) => item.documentId))
  const movingEntryIds = folderIds.map((id) => `folder:${id}`)
  const movingSet = new Set(movingEntryIds)
  const remaining = orderedIds.filter((entryId) => !movingSet.has(entryId))
  const targetEntryId = `folder:${targetId}`
  const targetIndex = remaining.indexOf(targetEntryId)
  if (targetIndex < 0) return
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  remaining.splice(insertIndex, 0, ...movingEntryIds)

  void persistDocLibraryTreeCommand({ type: 'sort_children', parentFolderId, childEntryIds: remaining })
}

function reorderWorldbookSidebarRows(payload: { rowIds: string[]; targetId: string; position?: 'before' | 'after' }) {
  const rowIds = Array.from(new Set((payload?.rowIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
  const targetId = String(payload?.targetId || '').trim()
  const position = payload?.position === 'after' ? 'after' : 'before'
  if (!rowIds.length || !targetId) return
  const rows = visibleTreeRows.value
  const targetRow = rows.find((row) => row.id === targetId)
  if (!targetRow) return
  const movingRows = rowIds
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is TreeRow => Boolean(row))
  if (!movingRows.length) return
  const parentFolderId = String(targetRow.parentFolderId || '__root__').trim() || '__root__'
  if (movingRows.some((row) => String(row.parentFolderId || '__root__').trim() !== parentFolderId)) return

  const folder = parentFolderId === '__root__' ? null : folderLookup.value.get(parentFolderId) || null
  const folderEntries = folder ? Array.from(folder.children.values()) : Array.from(folderTree.value.values())
  const documentEntries = folder ? Array.from(folder.documents) : []
  const orderedIds = getOrderedChildIds(parentFolderId, folderEntries.map((item) => item.folderPath), documentEntries.map((item) => item.documentId))
  const movingSet = new Set(rowIds)
  const remaining = orderedIds.filter((entryId) => !movingSet.has(entryId))
  const targetIndex = remaining.indexOf(targetId)
  if (targetIndex < 0) return
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  remaining.splice(insertIndex, 0, ...rowIds)

  void persistDocLibraryTreeCommand({ type: 'sort_children', parentFolderId, childEntryIds: remaining })
}

function reorderWorldbookClusters(payload: { clusterIds: string[]; targetId: string; position?: 'before' | 'after' }) {
  const clusterIds = Array.from(new Set((payload?.clusterIds || []).map((item) => String(item || '').trim()).filter(Boolean)))
  const targetId = String(payload?.targetId || '').trim()
  const position = payload?.position === 'after' ? 'after' : 'before'
  if (!clusterIds.length || !targetId) return
  const orderedIds = getOrderedChildIds('__root__', worldbookClusters.value.map((item) => item.id), [])
  const movingEntryIds = clusterIds.map((id) => `folder:${id}`)
  const movingSet = new Set(movingEntryIds)
  const remaining = orderedIds.filter((entryId) => !movingSet.has(entryId))
  const targetEntryId = `folder:${targetId}`
  const targetIndex = remaining.indexOf(targetEntryId)
  if (targetIndex < 0) return
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  remaining.splice(insertIndex, 0, ...movingEntryIds)

  void persistDocLibraryTreeCommand({ type: 'sort_children', parentFolderId: '__root__', childEntryIds: remaining })
}

async function saveActiveDocument() {
  const current = activeDocument.value
  if (!current || isSavingDocument.value) return
  if (!hasDraftChanges.value) {
    toast(t('brain.workspace.toast.noModifyToSave'), 'info')
    return
  }
  const saveSnapshot = createActiveDocumentDraftSaveSnapshot()
  isSavingDocument.value = true
  try {
    const updatedAt = new Date().toISOString()
    const overviewContext = activeOverviewDocumentContext.value
    if (overviewContext && overviewContext.documentId === String(current.documentId || current.id || '').trim()) {
      const desiredTitle = draftTitle.value.trim() || overviewContext.title || current.title
      const sourceFolderPath = overviewContext.folderPath
      const parentFolderPath = getParentFolderPathFromFolderPath(sourceFolderPath)
      const desiredFolderPath = `${parentFolderPath.replace(/\/+$/g, '')}/${desiredTitle}`.replace(/\/{2,}/g, '/') || `/${desiredTitle}`
      const nextFolderPath = desiredTitle !== overviewContext.title
        ? buildUniquePath(desiredFolderPath, collectTakenFolderPaths([sourceFolderPath]))
        : sourceFolderPath
      const finalTitle = splitDisplayPath(nextFolderPath).pop() || desiredTitle
      const updatedDocument: BrainDocumentRecord = {
        ...current,
        title: finalTitle,
        displayPath: buildWorldbookOverviewDisplayPath(nextFolderPath),
        semanticType: draftSemanticType.value,
        content: draftContent.value,
        publicCompilePage: buildDraftCompilePage(updatedAt),
        updatedAt
      }
      const commands: DocLibraryTreeCommand[] = []
      if (nextFolderPath !== sourceFolderPath) {
        commands.push({
          type: 'rename_folder',
          sourcePath: sourceFolderPath,
          targetPath: nextFolderPath
        })
      }
      commands.push({
        type: 'upsert_document',
        document: updatedDocument,
        parentFolderId: nextFolderPath
      })
      await persistDocLibraryTreeCommands(commands)
      if (nextFolderPath !== sourceFolderPath) {
        openFolderIds.value = replacePathPrefixInList(openFolderIds.value, sourceFolderPath, nextFolderPath)
        if (overviewContext.kind === 'cluster') {
          openClusterIds.value = replacePathPrefixInList(openClusterIds.value, sourceFolderPath, nextFolderPath)
        }
      }
      draftPath.value = updatedDocument.displayPath
      if (isActiveDocumentDraftSaveSnapshotCurrent(saveSnapshot)) toast(t('docLibrary.toast.saved'), 'success')
      return
    }
    const updatedDocument: BrainDocumentRecord = {
      ...current,
      title: draftTitle.value.trim() || current.title,
      displayPath: draftPath.value.trim() || current.displayPath,
      semanticType: draftSemanticType.value,
      content: draftContent.value,
      publicCompilePage: buildDraftCompilePage(updatedAt),
      updatedAt
    }
    await persistDocLibraryTreeCommand({
      type: 'upsert_document',
      document: updatedDocument,
      parentFolderId: getParentFolderPathFromDisplayPath(updatedDocument.displayPath)
    })
    if (isActiveDocumentDraftSaveSnapshotCurrent(saveSnapshot)) toast(t('docLibrary.toast.saved'), 'success')
  } catch (error) {
    console.error('保存文档失败:', error)
    if (isActiveDocumentDraftSaveSnapshotCurrent(saveSnapshot)) {
      toast(t('docLibrary.toast.saveFailed'), 'error')
    } else {
      toast(t('docLibrary.toast.lastSaveFailed'), 'error')
    }
  } finally {
    isSavingDocument.value = false
  }
}

async function duplicateActiveDocument() {
  const current = activeDocument.value
  if (!current) return
  const documentId = `${current.documentId}-copy-${Date.now()}`
  const nextDoc: BrainDocumentRecord = {
    ...current,
    documentId,
    id: documentId,
    stableId: documentId,
    title: `${current.title} 副本`,
    displayPath: current.displayPath.replace(/\.md$/i, '') + '-副本.md',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await persistDocLibraryTreeCommand({
    type: 'upsert_document',
    document: nextDoc,
    parentFolderId: getParentFolderPathFromDisplayPath(nextDoc.displayPath)
  })
  selectedDocumentId.value = documentId
}

async function deleteActiveDocument() {
  if (!activeDocument.value) return
  const snapshot = await persistDocLibraryTreeCommand(
    { type: 'delete_documents', documentIds: [activeDocument.value.documentId] },
    { mode: 'confirmed' }
  )
  const nextDocuments = snapshot.documents
  selectedDocumentId.value = nextDocuments[0]?.documentId || ''
  isEditMode.value = false
}

function getSidebarState(): DocSidebarState {
  return {
    activeTab: activeLibraryTab.value,
    worldbook: {
      treeVisible: Boolean(isTreeVisible.value),
      clusters: worldbookSidebarClusters.value,
      selectedCount: worldbookSelectionKit.selectedIds.value.length,
      clipboardMode: worldbookClipboard.value.mode,
      clipboardHasData: hasWorldbookClipboardData.value,
      rows: worldbookSidebarRows.value,
      rowsByCluster: worldbookSidebarRowsByCluster.value
    },
    prompt: promptLibraryRef.value?.getSidebarState?.() || {
      selectedId: '',
      totalCount: 0,
      dragEnabled: false,
      filterMode: 'all',
      rows: []
    },
    relation: {
      activeTab: activeRelationTab.value,
      predicatesCount: relationReadModel.value.predicates.length,
      candidatesCount: relationReadModel.value.candidateRelations.length,
      confirmedCount: relationReadModel.value.confirmedRelations.length
    }
  }
}

function toggleWorldbookCluster(clusterId: string) {
  toggleCluster(clusterId)
}

function expandWorldbookCluster(clusterId: string) {
  expandClusterFolders(clusterId)
}

function expandWorldbookFolder(folderId: string) {
  const safeFolderId = String(folderId || '').trim()
  if (!safeFolderId || openFolderIds.value.includes(safeFolderId)) return
  openFolderIds.value = [...openFolderIds.value, safeFolderId]
}

function toggleWorldbookFolder(folderId: string) {
  toggleFolder(folderId)
}

function collapseWorldbookCluster(clusterId: string) {
  collapseClusterFolders(clusterId)
}

function handleWorldbookSidebarClusterClick(payload: { clusterId: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
  worldbookMultiSelect.handleItemClick({
    id: getWorldbookClusterSelectionId(payload.clusterId),
    event: {
      shiftKey: Boolean(payload.shiftKey),
      ctrlKey: Boolean(payload.ctrlKey),
      metaKey: Boolean(payload.metaKey)
    } as MouseEvent
  })
}

function handleWorldbookSidebarRowClick(payload: { kind: 'folder' | 'document'; folderId?: string; itemId?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) {
  if (payload.kind === 'folder' && payload.folderId) {
    worldbookMultiSelect.handleItemClick({
      id: `folder:${payload.folderId}`,
      event: {
        shiftKey: Boolean(payload.shiftKey),
        ctrlKey: Boolean(payload.ctrlKey),
        metaKey: Boolean(payload.metaKey)
      } as MouseEvent
    })
    return
  }
  if (payload.kind === 'document' && payload.itemId) {
    documentMultiSelect.handleItemClick({
      id: payload.itemId,
      event: {
        shiftKey: Boolean(payload.shiftKey),
        ctrlKey: Boolean(payload.ctrlKey),
        metaKey: Boolean(payload.metaKey)
      } as MouseEvent,
      onDefault: () => {
        selectDocument(payload.itemId || '')
      }
    })
  }
}

function handlePromptSidebarRowClick(payload: { itemId?: string }) {
  promptLibraryRef.value?.selectPromptFromParent?.(String(payload.itemId || ''))
}

function openPromptCreateDialog() {
  promptLibraryRef.value?.openCreateDialogFromParent?.()
}

function togglePromptDragMode() {
  promptLibraryRef.value?.togglePromptDragModeFromParent?.()
}

function setPromptFilterMode(mode: 'all' | 'required') {
  promptLibraryRef.value?.setPromptFilterModeFromParent?.(mode)
}

function reorderPromptSidebarItems(payload: { sourceId: string; targetId: string; position?: 'before' | 'after' }) {
  promptLibraryRef.value?.reorderPromptFromParent?.(
    String(payload.sourceId || ''),
    String(payload.targetId || ''),
    payload.position === 'before' ? 'before' : 'after'
  )
}

function runWorldbookSidebarMenuAction(action: string, payload: { kind: 'folder' | 'document'; folderId?: string; itemId?: string }) {
  if (payload.kind === 'folder' && payload.folderId) {
    if (worldbookClusters.value.some((item) => item.id === payload.folderId)) {
      runWorldbookClusterMenuAction(action, payload.folderId)
      return
    }
    const row = visibleTreeRows.value.find((item): item is TreeFolderRow => item.kind === 'folder' && item.folderId === payload.folderId)
    if (row) {
      runWorldbookMenuAction(action, row)
    }
    return
  }
  if (payload.kind === 'document' && payload.itemId) {
    const row = visibleTreeRows.value.find((item): item is TreeDocumentRow => item.kind === 'document' && item.documentId === payload.itemId)
    if (row) runWorldbookMenuAction(action, row)
  }
}

function handleTopbarEdit() {
  if (activeLibraryTab.value === 'prompt') return
  openEditor().catch(() => {})
}

function handleTopbarCloseEditor() {
  if (activeLibraryTab.value === 'prompt') return
  closeEditor()
}

function handleTopbarSave() {
  if (activeLibraryTab.value === 'prompt') return
  void saveActiveDocument()
}

function handleTopbarDelete() {
  if (activeLibraryTab.value === 'prompt') return
  deleteActiveDocument()
}

function handleTopbarDuplicate() {
  if (activeLibraryTab.value === 'prompt') return
  duplicateActiveDocument()
}

async function deleteDocumentById(documentId: string) {

  const snapshot = await persistDocLibraryTreeCommand(
    { type: 'delete_documents', documentIds: [documentId] },
    { mode: 'confirmed' }
  )
  const nextDocuments = snapshot.documents
  if (selectedDocumentId.value === documentId) {
    selectedDocumentId.value = nextDocuments[0]?.documentId || ''
    isEditMode.value = false
  }
}

async function deleteFolderById(folderId: string) {
  const safeFolderId = String(folderId || '').trim()
  const safeFolderPath = getFolderPathByTreeId(safeFolderId)
  const commandTarget = folderLookup.value.get(safeFolderId)?.id === safeFolderId
    ? safeFolderId
    : safeFolderPath
  if (!commandTarget) return

  await persistDocLibraryTreeCommand({ type: 'delete_folder', folderPath: commandTarget }, { mode: 'confirmed' })
  openFolderIds.value = openFolderIds.value.filter((item) => item !== folderId)
}

function buildNewDocument(folderPath: string, title: string, slug = ''): BrainDocumentRecord {
  const safeTitle = String(title || '新页面').trim() || '新页面'
  const safeSlug = String(slug || '').trim() || safeTitle
  const documentId = `doc-${Date.now()}`
  const normalizedFolder = String(folderPath || '/文档').replace(/\/+$/g, '')
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title: safeTitle,
    displayPath: `${normalizedFolder}/${safeSlug}.md`,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    semanticType: 'other',
    summary: '',
    tags: [],
    content: `# ${safeTitle}\n\n`,
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

async function ensureOverviewDocumentForFolder(folderPath: string, label: string) {
  const existing = getWorldbookOverviewDocument(folderPath)
  if (existing) return existing
  const nextDocument = buildNewDocument(folderPath, getWorldbookOverviewTitle(label), 'index')
  await persistDocLibraryTreeCommand({
    type: 'upsert_document',
    document: nextDocument,
    parentFolderId: folderPath
  })
  return nextDocument
}

async function createPage() {
  const folderPath = activeDocument.value ? getParentFolderPathFromDisplayPath(activeDocument.value.displayPath) : (worldbookClusters.value[0]?.folderPath || '/文档')
  openCreateDialog('page', folderPath || '/文档')
}

async function createSection() {
  const folderPath = activeDocument.value ? getParentFolderPathFromDisplayPath(activeDocument.value.displayPath) : (worldbookClusters.value[0]?.folderPath || '/文档')
  openCreateDialog('section', folderPath || '/文档')
}

async function createCluster() {
  openCreateDialog('cluster', '/')
}

function resolveTreeToolbarTargetFolderPath() {
  const selectedId = worldbookSelectionKit.selectedIds.value.length === 1
    ? worldbookSelectionKit.selectedIds.value[0]
    : ''
  const parsedSelection = selectedId ? parseWorldbookSelectionId(selectedId) : null
  if (parsedSelection?.kind === 'cluster') {
    return worldbookClusters.value.find((item) => item.id === parsedSelection.id)?.folderPath || '/文档'
  }
  if (parsedSelection?.kind === 'folder') {
    return getFolderPathByTreeId(parsedSelection.id) || '/文档'
  }
  if (parsedSelection?.kind === 'document') {
    const record = documentRecordMap.value.get(parsedSelection.id)
    return record ? getParentFolderPathFromDisplayPath(record.displayPath) : '/文档'
  }
  if (activeDocument.value) {
    return getParentFolderPathFromDisplayPath(activeDocument.value.displayPath)
  }
  return worldbookClusters.value[0]?.folderPath || '/文档'
}

function resolveTreeToolbarTargetStandardPath() {
  const selectedId = worldbookSelectionKit.selectedIds.value.length === 1
    ? worldbookSelectionKit.selectedIds.value[0]
    : ''
  const parsedSelection = selectedId ? parseWorldbookSelectionId(selectedId) : null
  if (parsedSelection?.kind === 'cluster') {
    const cluster = worldbookClusters.value.find((item) => item.id === parsedSelection.id)
    return cluster ? `/世界树${cluster.folderPath}` : '/世界树'
  }
  if (parsedSelection?.kind === 'folder') {
    return standardWorldbookPathFromFolderPath(getFolderPathByTreeId(parsedSelection.id))
  }
  if (parsedSelection?.kind === 'document') {
    const row = visibleTreeRows.value.find((item): item is TreeDocumentRow => item.kind === 'document' && item.documentId === parsedSelection.id)
    return row ? getWorldbookRowStandardPath(row) : '/世界树'
  }
  if (activeDocument.value) {
    return `/世界树${String(activeDocument.value.displayPath || '').replace(/\.md$/i, '')}`
  }
  return worldbookClusters.value[0] ? `/世界树${worldbookClusters.value[0].folderPath}` : '/世界树'
}

function resolveTreeToolbarCreateTarget() {
  const selectedId = worldbookSelectionKit.selectedIds.value.length === 1
    ? worldbookSelectionKit.selectedIds.value[0]
    : ''
  const parsedSelection = selectedId ? parseWorldbookSelectionId(selectedId) : null
  if (parsedSelection?.kind === 'cluster') {
    const cluster = worldbookClusters.value.find((item) => item.id === parsedSelection.id)
    if (cluster) {
      return {
        parentFolderPath: '/',
        pathInput: '/世界树',
        targetDocumentId: '',
        insertAfterEntryId: `folder:${cluster.folderPath}`,
        insertParentFolderPath: '/'
      }
    }
  }
  if (parsedSelection?.kind === 'folder') {
    const row = visibleTreeRows.value.find((item): item is TreeFolderRow => item.kind === 'folder' && item.folderId === parsedSelection.id)
    if (row) {
      const parentFolderPath = row.parentFolderPath || '/'
      return {
        parentFolderPath,
        pathInput: standardWorldbookPathFromFolderPath(parentFolderPath),
        targetDocumentId: '',
        insertAfterEntryId: `folder:${row.folderPath}`,
        insertParentFolderPath: parentFolderPath
      }
    }
  }
  if (parsedSelection?.kind === 'document') {
    const row = visibleTreeRows.value.find((item): item is TreeDocumentRow => item.kind === 'document' && item.documentId === parsedSelection.id)
    if (row) {
      const parentFolderPath = row.parentFolderPath || '/'
      return {
        parentFolderPath,
        pathInput: standardWorldbookPathFromFolderPath(parentFolderPath),
        targetDocumentId: '',
        insertAfterEntryId: `document:${row.documentId}`,
        insertParentFolderPath: parentFolderPath
      }
    }
  }
  const standardPath = resolveTreeToolbarTargetStandardPath()
  const target = resolveWorldbookCreatePathTarget(standardPath)
  return {
    parentFolderPath: target.folderPath || '/',
    pathInput: standardPath,
    targetDocumentId: target.targetDocumentId,
    insertAfterEntryId: '',
    insertParentFolderPath: ''
  }
}

function createSectionFromTreeToolbar() {
  const target = resolveTreeToolbarCreateTarget()
  openCreateDialog('section', target.parentFolderPath || '/', target)
  createDialog.value.pathInput = target.pathInput
}

function createPageFromTreeToolbar() {
  const target = resolveTreeToolbarCreateTarget()
  openCreateDialog('page', target.parentFolderPath || '/', target)
  createDialog.value.pathInput = target.pathInput
}

async function confirmCreateDocument(openAfterCreate: boolean) {
  if (!createDialogCanSubmit.value) return
  syncCreateDialogPathFromInput()

  const safeTitle = createDialog.value.title.trim() || (
    createDialog.value.type === 'page'
      ? '新桠'
      : createDialog.value.type === 'section'
        ? '新枝'
        : '新树簇'
  )
  const safeSlug = slugify(safeTitle)
  let nextDocuments = baseDocuments.value.map((item) => ({ ...item }))
  let parentFolderPath = createDialog.value.parentFolderPath || '/'
  let convertedTargetDocument = false
  if (createDialog.value.type !== 'cluster' && createDialog.value.targetDocumentId) {
    const converted = convertDocumentToBranchContainer(nextDocuments, createDialog.value.targetDocumentId)
    if (!converted) return
    nextDocuments = converted.documents
    parentFolderPath = converted.targetFolderPath
    convertedTargetDocument = true
  }
  let folderPath = createDialog.value.type === 'cluster'
    ? `/${safeTitle}`
    : createDialog.value.type === 'section'
      ? `${parentFolderPath.replace(/\/+$/g, '')}/${safeSlug}`.replace(/\/{2,}/g, '/')
      : parentFolderPath
  const nextDocument = buildNewDocument(
    folderPath || '/',
    safeTitle,
    createDialog.value.type === 'page' ? safeSlug : 'index'
  )
  const movedDocumentIds = new Set(pendingSectionDocumentIds.value)
  nextDocuments = nextDocuments.map((item) => {
    if (!movedDocumentIds.has(item.documentId)) return item
    const fileName = getWorldbookDocumentMoveFileName(item)
    return {
      ...item,
      displayPath: `${folderPath}/${fileName}`,
      updatedAt: new Date().toISOString()
    }
  })
  if (convertedTargetDocument || pendingSectionDocumentIds.value.length) {
    await persistDocumentUpserts(nextDocuments, [
      ...(convertedTargetDocument ? [createDialog.value.targetDocumentId] : []),
      ...pendingSectionDocumentIds.value
    ])
  }
  const insertAfterEntryId = normalizeWorldbookFolderPathForCompare(createDialog.value.insertParentFolderPath || '') === normalizeWorldbookFolderPathForCompare(parentFolderPath || '')
    ? createDialog.value.insertAfterEntryId
    : ''
  await persistDocLibraryTreeCommand({
    type: 'upsert_document',
    document: nextDocument,
    parentFolderId: folderPath || '/文档'
  })
  isTreeVisible.value = true
  const clusterSegment = splitDisplayPath(nextDocument.displayPath)[0]
  if (clusterSegment) {
    const clusterId = getFolderTreeIdByPath(`/${clusterSegment}`)
    if (!openClusterIds.value.includes(clusterId)) {
      openClusterIds.value = [...openClusterIds.value, clusterId]
    }
  }
  ensureFolderChainVisible(splitDisplayPath(nextDocument.displayPath).slice(0, -1))
  if (createDialog.value.type === 'cluster') {
    appendEntriesToManualOrder('__root__', [`folder:${folderPath}`], insertAfterEntryId, 'after')
  } else if (createDialog.value.type === 'section') {
    appendEntriesToManualOrder(parentFolderPath || '/', [`folder:${folderPath}`], insertAfterEntryId, 'after')
    if (pendingSectionFolderIds.value.length) {
      await moveWorldbookFolderLikeIntoBottom(pendingSectionFolderIds.value, 'folder', folderPath)
    }
  } else {
    appendEntriesToManualOrder(folderPath || '/', [`document:${nextDocument.documentId}`], insertAfterEntryId, 'after')
  }
  selectedDocumentId.value = nextDocument.documentId
  closeCreateDialog()
  if (openAfterCreate) {
    await openEditor()
  }
}

async function sortDocuments() {
  openSortDialog('layer', activeDocument.value ? getParentFolderPathFromDisplayPath(activeDocument.value.displayPath) : '__root__')
}

function updateDraftContent(nextValue: string) {
  worldbookEditor.updateDraftContent(nextValue)
}

function replaceSelection(transform: (selected: string) => string, placeholder = '') {
  const textarea = getEditorTextarea()
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = textarea.value.slice(start, end) || placeholder
  const replacement = transform(selected)
  updateDraftContent(textarea.value.slice(0, start) + replacement + textarea.value.slice(end))
  nextTick(() => {
    textarea.focus()
    const caret = start + replacement.length
    textarea.setSelectionRange(caret, caret)
  })
}

function wrapSelection(marker: string) { replaceSelection((selected) => `${marker}${selected}${marker}`, t('docLibrary.editor.insertTextPlaceholder')) }
function insertHeading(level: number) { replaceSelection((selected) => `${'#'.repeat(level)} ${selected}`, t('docLibrary.editor.insertHeadingPlaceholder')) }
function insertLink() { replaceSelection((selected) => `[${selected}](https://example.com)`, t('docLibrary.editor.insertLinkPlaceholder')) }
function insertTable() { replaceSelection(() => `| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |`) }
function insertCodeBlock() { replaceSelection((selected) => `\`\`\`\n${selected}\n\`\`\``) }
function insertImage() { replaceSelection(() => `![${t('docLibrary.editor.imageAltPlaceholder')}](/path/to/image.png)`) }
function undoDraft() { worldbookEditor.undoDraft() }
function redoDraft() { worldbookEditor.redoDraft() }

function getWorldbookVisibleRows(kind: 'document' | 'folder') {
  return getVisibleSidebarElements(`.leaf-docs__tree-row[data-doc-drag-kind="${kind}"]`)
}

function getVisibleWorldbookClusterHeaders() {
  return getVisibleSidebarElements('[data-worldbook-cluster-header="true"][data-worldbook-cluster-id]')
}

function toWorldbookRowDragId(target: WorldbookPreviewTarget | null) {
  if (!target) return ''
  if (target.kind === 'folder') return `folder:${String(target.id || '').trim()}`
  if (target.kind === 'document') return `document:${String(target.id || '').trim()}`
  return String(target.id || '').trim()
}

function canWorldbookReorderTarget(pending: { rowKind: WorldbookDragRowKind }, target: WorldbookPreviewTarget | null) {
  if (!target || target.mode === 'inside') return false
  if (pending.rowKind === 'cluster') return target.kind === 'cluster'
  if (target.kind !== 'folder' && target.kind !== 'document') return false
  const targetParentId = String(resolveWorldbookTargetEntry(target)?.parentContainerId || '__root__').trim() || '__root__'
  const movingRows = worldbookRowDrag.draggingIds.value
    .map((id) => visibleTreeRows.value.find((row) => row.id === id))
    .filter((row): row is TreeRow => Boolean(row))
  if (!movingRows.length) return false
  return movingRows.every((row) => String(row.parentFolderId || '__root__').trim() === targetParentId)
}

function canWorldbookSinkTarget(pending: { rowKind: WorldbookDragRowKind }, target: WorldbookPreviewTarget | null) {
  if (!worldbookClusterSortOnly.value || !target || target.mode !== 'inside') return false
  if (pending.rowKind === 'cluster') return false
  return target.kind === 'folder' || target.kind === 'cluster'
}

function getDraggedWorldbookPayloadIds(rowKind: WorldbookDragRowKind, rowIds: string[]) {
  const safeRowIds = Array.isArray(rowIds) ? rowIds.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (!safeRowIds.length) return []
  if (rowKind === 'cluster') return safeRowIds
  const movingRows = safeRowIds
    .map((id) => visibleTreeRows.value.find((row) => row.id === id))
    .filter((row): row is TreeRow => Boolean(row))
  if (rowKind === 'folder') {
    return movingRows
      .filter((row): row is TreeFolderRow => row.kind === 'folder')
      .map((row) => row.folderId)
  }
  return movingRows
    .filter((row): row is TreeDocumentRow => row.kind === 'document')
    .map((row) => row.documentId)
}

function resolveWorldbookBufferedReorderTarget(rowKind: WorldbookDragRowKind, pointerX: number, pointerY: number): WorldbookPreviewTarget | null {
  if (typeof document === 'undefined') return null
  if (rowKind === 'cluster') {
    const selector = '[data-worldbook-cluster-header="true"][data-worldbook-cluster-id]'
    const exactHeader = document.elementFromPoint(pointerX, pointerY)?.closest(selector) as HTMLElement | null
    const resolved = resolveBufferedDropTarget(getVisibleWorldbookClusterHeaders(), pointerY, exactHeader, {
      readId: (element) => String(element.dataset.worldbookClusterId || '').trim()
    })
    return resolved ? { kind: 'cluster', id: resolved.targetId, mode: resolved.position } : null
  }
  const selector = '.leaf-docs__tree-row[data-doc-drag-id][data-doc-drag-kind]'
  const exactRow = document.elementFromPoint(pointerX, pointerY)?.closest(selector) as HTMLElement | null
  const resolved = resolveBufferedDropTarget(getVisibleSidebarElements(selector), pointerY, exactRow, {
    readId: (element) => String(element.dataset.docDragId || '').trim()
  })
  if (!resolved) return null
  const resolvedRow = visibleTreeRows.value.find((row) => row.id === resolved.targetId)
  return {
    kind: resolvedRow?.kind === 'folder' ? 'folder' : 'document',
    id: String(resolved.targetId || '').replace(/^folder:/, '').replace(/^document:/, '').trim(),
    mode: resolved.position
  }
}

function resolveWorldbookPointerTarget(pending: { rowKind: WorldbookDragRowKind }, pointerX: number, pointerY: number): WorldbookPreviewTarget | null {
  if (typeof document === 'undefined') return null
  return resolveWorldbookTreePointerTarget({
    pendingRowKind: pending.rowKind,
    pointerX,
    pointerY,
    sinkEnabled: worldbookClusterSortOnly.value,
    sinkOnlyMode: false,
    autoExpandState: worldbookAutoExpandState,
    resolveBufferedTarget: (rowKind) => resolveWorldbookBufferedReorderTarget(rowKind, pointerX, pointerY),
    resolveClusterHit: ({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      const clusterHeader = element?.closest('[data-worldbook-cluster-header="true"][data-worldbook-cluster-id]') as HTMLElement | null
      const clusterId = String(clusterHeader?.dataset.worldbookClusterId || '').trim()
      if (!clusterHeader || !clusterId) return null
      return {
        id: clusterId,
        rect: clusterHeader.getBoundingClientRect(),
        open: isClusterOpen(clusterId)
      }
    },
    resolveRowHit: ({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      const rowElement = element?.closest('.leaf-docs__tree-row[data-doc-drag-id][data-doc-drag-kind]') as HTMLElement | null
      const rowId = String(rowElement?.dataset.docDragId || '').trim()
      const rowKind = String(rowElement?.dataset.docDragKind || '').trim()
      if (!rowElement || !rowId) return null
      if (rowKind === 'folder') {
        const folderId = rowId.replace(/^folder:/, '').trim()
        if (!folderId) return null
        return {
          id: folderId,
          kind: 'folder' as const,
          rect: rowElement.getBoundingClientRect(),
          open: isFolderOpen(folderId)
        }
      }
      const documentId = rowId.replace(/^document:/, '').trim()
      if (!documentId) return null
      return {
        id: documentId,
        kind: 'document' as const,
        rect: rowElement.getBoundingClientRect()
      }
    },
    resolveTreeRect: () => (document.querySelector('.leaf-docs__tree') as HTMLElement | null)?.getBoundingClientRect() || null,
    onExpandCluster: (clusterId) => {
      if (!openClusterIds.value.includes(clusterId)) {
        openClusterIds.value = [...openClusterIds.value, clusterId]
      }
    },
    onExpandFolder: (folderId) => {
      if (!openFolderIds.value.includes(folderId)) {
        openFolderIds.value = [...openFolderIds.value, folderId]
      }
    }
  })
}

function updateWorldbookPointerPreview(pending: { rowKind: WorldbookDragRowKind }, pointerX: number, pointerY: number) {
  const resolvedTarget = resolveWorldbookPointerTarget(pending, pointerX, pointerY)
  const isSameLevelReorder = canWorldbookReorderTarget(pending, resolvedTarget)
  const isSinkTarget = canWorldbookSinkTarget(pending, resolvedTarget)
  const validTarget = isSameLevelReorder || isSinkTarget ? resolvedTarget : null
  worldbookPreviewTarget.value = validTarget
  const controller = pending.rowKind === 'cluster'
      ? worldbookClusterDrag
      : worldbookRowDrag
  if (!validTarget || validTarget.mode === 'inside') {
    controller.clearPreview()
    return
  }
  const targetId = toWorldbookRowDragId(validTarget)
  if (!targetId) {
    controller.clearPreview()
    return
  }
  controller.previewDrop(targetId, validTarget.mode)
}

function clearWorldbookPointerDrag() {
  resetWorldbookTreeAutoExpandState(worldbookAutoExpandState)
  worldbookPointerDrag.clear()
}

async function commitWorldbookPointerDrop(pending: { rowKind: WorldbookDragRowKind }) {
  const previewTarget = worldbookPreviewTarget.value
  if (!previewTarget) return
  const controller = pending.rowKind === 'cluster'
      ? worldbookClusterDrag
      : worldbookRowDrag
  const payloadIds = getDraggedWorldbookPayloadIds(pending.rowKind, controller.draggingIds.value)
  if (canWorldbookSinkTarget(pending, previewTarget)) {
    const targetKind = previewTarget.kind === 'cluster' ? 'cluster' : 'folder'
    if (!payloadIds.length) return
    await moveWorldbookRowsInto({
      rowKind: pending.rowKind,
      ids: payloadIds,
      targetKind,
      targetId: String(previewTarget.id || '').trim()
    })
    return
  }
  const isSameLevelReorder = canWorldbookReorderTarget(pending, previewTarget)
  if (!isSameLevelReorder) return
  const reorderPosition = previewTarget.mode === 'after' ? 'after' : 'before'
  if (pending.rowKind === 'cluster') {
    reorderWorldbookClusters({
      clusterIds: [...controller.draggingIds.value].map((id) => String(id || '').trim()).filter(Boolean),
      targetId: String(previewTarget.id || '').trim(),
      position: reorderPosition
    })
    return
  }
  reorderWorldbookSidebarRows({
    rowIds: controller.draggingIds.value,
    targetId: toWorldbookRowDragId(previewTarget),
    position: reorderPosition
  })
}

function handleWindowWorldbookPointerMove(event: PointerEvent) {
  worldbookPointerDrag.handleMove(event)
}

async function handleWindowWorldbookPointerUp(event: PointerEvent) {
  await worldbookPointerDrag.handleUp(event)
}

function handleWindowWorldbookPointerCancel(event: PointerEvent) {
  worldbookPointerDrag.handleCancel(event)
}

function isWorldbookRowDragging(row: TreeRow) {
  return worldbookRowDrag.draggingIds.value.includes(row.id)
}

function isWorldbookRowDropTarget(row: TreeRow) {
  if (worldbookRowDrag.dropTargetId.value === row.id) return true
  return row.kind === 'folder'
    && worldbookPreviewTarget.value?.kind === 'folder'
    && worldbookPreviewTarget.value.mode === 'inside'
    && worldbookPreviewTarget.value.id === row.folderId
}

function isWorldbookClusterDragging(clusterId: string) {
  return worldbookPointerDrag.dragging.value && worldbookClusterDrag.draggingIds.value.includes(String(clusterId || '').trim())
}

function isWorldbookClusterDropTarget(clusterId: string) {
  const safeId = String(clusterId || '').trim()
  return worldbookClusterDrag.dropTargetId.value === safeId
    || (worldbookPreviewTarget.value?.kind === 'cluster' && worldbookPreviewTarget.value.id === safeId)
}

function isWorldbookClusterPreviewShift(clusterId: string) {
  return worldbookClusterDrag.dropTargetId.value === String(clusterId || '').trim()
}

function isWorldbookRowPreviewShift(row: TreeRow) {
  return worldbookRowDrag.dropTargetId.value === row.id
}

function renderMarkdown(markdown: string) {
  return renderMarkdownToHtml(markdown)
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  const tagName = element.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable
}

function isDocLibraryShortcutScopeActive() {
  const root = docLibraryRoot.value
  if (!root) return false
  const rect = root.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

watch(documentRecords, (records) => {
  if (!selectedDocumentId.value || !records.find((item) => item.documentId === selectedDocumentId.value)) {
    selectedDocumentId.value = records[0]?.documentId || ''
  }
}, { immediate: true })

watch(worldbookClusters, (clusters) => {
  const nextIds = clusters.map((item) => item.id)
  openClusterIds.value = openClusterIds.value.filter((item) => nextIds.includes(item))
}, { immediate: true })

watch(activeDocument, (nextDocument, previousDocument) => {
  const nextId = String(nextDocument?.documentId || nextDocument?.id || '').trim()
  const previousId = String(previousDocument?.documentId || previousDocument?.id || '').trim()
  if (nextId && nextId === previousId && isEditMode.value && hasDraftChanges.value) {
    return
  }
  syncDraftFromActiveDocument()
  syncDocAuxPanelWithActiveDocument()
}, { immediate: true })

watch(hasSingleSelectedWorldbookDocument, (hasSingleDocument) => {
  if (!hasSingleDocument) {
    return
  }
  const selectedId = selectedDocumentIds.value[0] || ''
  if (selectedId && selectedId !== selectedDocumentId.value) {
    selectedDocumentId.value = selectedId
  }
}, { immediate: true })

watch(isQuickSwitcherOpen, (opened) => {
  if (!opened) quickSwitcherQuery.value = ''
})

function handleGlobalShortcut(event: KeyboardEvent) {
  if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'p') {
    event.preventDefault()
    isQuickSwitcherOpen.value = true
    return
  }
  const commandPressed = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (handleWorkspaceSaveShortcut(event, {
    canSave: () => activeLibraryTab.value === 'worldbook' && isEditMode.value && isDocLibraryShortcutScopeActive(),
    save: saveActiveDocument
  })) {
    return
  }
  if (activeLibraryTab.value !== 'worldbook' || isEditableTarget(event.target)) return
  if (!commandPressed) return
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undoWorldbookOps().catch(() => {})
    return
  }
  if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault()
    redoWorldbookOps().catch(() => {})
    return
  }
  if (key === 'c' || key === 'x') {
    if (hasActiveBrowserTextSelection()) return
    const clipboard = buildWorldbookClipboardFromActiveSelection(key === 'c' ? 'copy' : 'cut')
    if (!clipboard) return
    event.preventDefault()
    setWorldbookClipboard(clipboard)
    return
  }
  if (key === 'v') {
    if (!hasWorldbookClipboardData.value) return
    const parsedSelection = worldbookSelectionKit.selectedIds.value.length === 1
      ? parseWorldbookSelectionId(worldbookSelectionKit.selectedIds.value[0])
      : null
    event.preventDefault()
    if (parsedSelection?.kind === 'cluster') {
      pasteWorldbookClipboardIntoCluster(parsedSelection.id).catch(() => {})
      return
    }
    if (parsedSelection?.kind === 'folder') {
      pasteWorldbookClipboardIntoFolderTarget(getFolderPathByTreeId(parsedSelection.id)).catch(() => {})
      return
    }
    if (parsedSelection?.kind === 'document') {
      pasteWorldbookClipboardIntoFolderTarget(
        getParentFolderPathFromDisplayPath(documentRecordMap.value.get(parsedSelection.id)?.displayPath || ''),
        parsedSelection.id
      ).catch(() => {})
      return
    }
    const targetDocumentId = activeDocument.value?.documentId || ''
    if (!targetDocumentId) return
    pasteWorldbookClipboardIntoFolderTarget(
      getParentFolderPathFromDisplayPath(documentRecordMap.value.get(targetDocumentId)?.displayPath || ''),
      targetDocumentId
    ).catch(() => {})
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('.leaf-docs__row-menu') || target.closest('.leaf-docs__row-action')) return
  closeTreeMenu()
}

/** 星依功能桥注销函数（onMounted 注册 → onBeforeUnmount 注销）。 */
let unregisterXingyiWorldbookProvider: (() => void) | null = null

/** 星依单位工具外部直写后的强刷（与世界观导入稿导入后刷新同款三件套：文档+字段树快照+关系状态）。 */
function handleExternalDocLibraryUpdated() {
  fetchDocLibraryState({ force: true }).then((state) => {
    charStore.setDocuments(state.documents)
    applyDocLibraryTreeSnapshot(state)
    relationSystemState.value = normalizeRelationSystemState(state.relationSystemState)
  }).catch((error) => {
    console.error('星依外部改动后刷新文档库失败', error)
  })
}

onMounted(() => {
  // 星依批次2：把世界书侧「生成编译页/优化关系」按钮同款 handler 注册给星依工具（双入口一真值）
  unregisterXingyiWorldbookProvider = registerXingyiFunctionProvider('worldbookUnits', {
    contextLabel: () => t('docLibrary.agent.contextLabel'),
    listUnits: () => docLibraryUnitView.value.units.map((unit) => ({ unitId: unit.unitId, title: unit.title })),
    generateCompilePage: (unitIds, sourceLabel) => runWorldbookAgentGenerateCompilePage(unitIds, sourceLabel),
    optimizeRelations: (unitIds, sourceLabel) => runWorldbookAgentOptimizeRelations(unitIds, sourceLabel),
    readCompilePage: (unitId) => {
      const unit = docLibraryUnitView.value.units.find((item) => item.unitId === unitId)
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
        await importWorldbookCompilePageMarkdown('', markdown, unitIds)
        return { ok: true, message: t('docLibrary.agent.compileModifyImported') }
      } catch (error) {
        return { ok: false, message: t('docLibrary.agent.compileModifyFailed', { error: error instanceof Error ? error.message : String(error) }) }
      }
    }
  })
  updateDesktopViewport()
  let legacyLocalOrders: Record<string, string[]> = {}
  if (typeof window !== 'undefined') {
    worldbookDragModeKit.hydrate()
    worldbookDragModeKit.setSinkContext('')
    window.addEventListener(DOC_LIBRARY_EXTERNAL_UPDATED_EVENT, handleExternalDocLibraryUpdated)
    window.addEventListener('resize', updateDesktopViewport)
    window.addEventListener('keydown', handleGlobalShortcut)
    window.addEventListener('pointerdown', handleDocumentPointerDown)
    window.addEventListener('pointermove', handleWindowWorldbookPointerMove)
    window.addEventListener('pointerup', handleWindowWorldbookPointerUp)
    window.addEventListener('pointercancel', handleWindowWorldbookPointerCancel)
    try {
      const savedOrders = window.localStorage.getItem('langhuan_leaf_docs_tree_orders')
      if (savedOrders) {
        legacyLocalOrders = normalizeManualTreeOrders(JSON.parse(savedOrders))
      }
      window.localStorage.removeItem('langhuan_leaf_docs_tree_orders')
    } catch {}
  }
  fetchDocLibraryState().then((state) => {
    if (state.documents.length > 0 || (Array.isArray(charStore.documents) && charStore.documents.length === 0)) {
      charStore.setDocuments(state.documents)
    }
    applyDocLibraryTreeSnapshot(state)
    relationSystemState.value = normalizeRelationSystemState(state.relationSystemState)
    if (Object.keys(state.manualTreeOrders).length === 0 && Object.keys(legacyLocalOrders).length > 0) {
      void applyLegacyLocalTreeOrders(legacyLocalOrders)
    }
  }).catch(() => {})
})

function persistInsertedManualTreeOrder(
  parentFolderId: string,
  entryIds: string[],
  targetEntryId = '',
  position: 'before' | 'after' = 'after'
) {
  const safeParentId = String(parentFolderId || '__root__').trim() || '__root__'
  const folder = safeParentId === '__root__' ? null : folderLookup.value.get(safeParentId) || null
  const folderEntries = folder ? Array.from(folder.children.values()) : Array.from(folderTree.value.values())
  const documentEntries = folder ? Array.from(folder.documents) : []
  const current = getOrderedChildIds(
    safeParentId,
    folderEntries.map((item) => item.folderPath),
    documentEntries.map((item) => item.documentId)
  )
  void persistDocLibraryTreeCommand({
    type: 'sort_children',
    parentFolderId: safeParentId,
    childEntryIds: insertEntriesAroundTarget(current, entryIds, targetEntryId, position)
  })
}

onBeforeUnmount(() => {
  unregisterXingyiWorldbookProvider?.()
  unregisterXingyiWorldbookProvider = null
  docLibraryProjection.cancel()
  stopWorkspaceSplitResize?.()
  cancelDocRelationPanelLoad()
  if (typeof window !== 'undefined') {
    window.removeEventListener(DOC_LIBRARY_EXTERNAL_UPDATED_EVENT, handleExternalDocLibraryUpdated)
    window.removeEventListener('resize', updateDesktopViewport)
    window.removeEventListener('keydown', handleGlobalShortcut)
    window.removeEventListener('pointerdown', handleDocumentPointerDown)
    window.removeEventListener('pointermove', handleWindowWorldbookPointerMove)
    window.removeEventListener('pointerup', handleWindowWorldbookPointerUp)
    window.removeEventListener('pointercancel', handleWindowWorldbookPointerCancel)
  }
  clearWorldbookPointerDrag()
})

watch(
  [
    activeLibraryTab,
    isTreeVisible,
    visibleTreeRows,
    selectedDocumentIds,
    activeDocument,
    activeRelationTab,
    relationReadModel
  ],
  () => {
    emit('sidebar-state-change', getSidebarState())
  },
  { immediate: true, deep: true }
)

defineExpose({
  getSidebarState,
  setActiveLibraryTab,
  openWorldDraftImportDialog,
  setRelationTab,
  toggleWorldbookTreeVisible,
  toggleWorldbookCluster,
  toggleWorldbookFolder,
  expandWorldbookCluster,
  expandWorldbookFolder,
  collapseWorldbookCluster,
  expandAllFolders,
  collapseAllFolders,
  exportWorldbookJson,
  queueImportWorldbookJson,
  handleWorldbookJsonTransferError,
  createCluster,
  createPage,
  createSection,
  createPageFromTreeToolbar,
  createSectionFromTreeToolbar,
  openEditor,
  openDocumentSidePreview,
  openRelationWindow,
  sortDocuments,
  undoWorldbookOps,
  redoWorldbookOps,
  reorderWorldbookClusters,
  reorderWorldbookSidebarRows,
  reorderWorldbookSidebarItems,
  reorderWorldbookSidebarFolders,
  moveWorldbookRowsInto,
  dropWorldbookRows,
  handleWorldbookSidebarClusterClick,
  handleWorldbookSidebarRowClick,
  runWorldbookSidebarMenuAction,
  handlePromptSidebarRowClick,
  openPromptCreateDialog,
  togglePromptDragMode,
  setPromptFilterMode,
  reorderPromptSidebarItems
})
</script>

<style scoped>
@import '../styles/sidebarInteractionKit.css';

.leaf-docs {
  --leaf-bg: var(--morandi-bg, #f7f3ea);
  --leaf-panel: var(--morandi-bg, #f7f3ea);
  --leaf-panel-strong: var(--morandi-bg, #f7f3ea);
  --leaf-border: color-mix(in srgb, var(--morandi-border, #d6cec3) 74%, transparent);
  --leaf-border-strong: color-mix(in srgb, var(--morandi-border-hover, #b8aea1) 84%, transparent);
  --leaf-text: var(--morandi-text, #4f463f);
  --leaf-text-soft: color-mix(in srgb, var(--leaf-text) 72%, #9f968c 28%);
  --leaf-text-faint: color-mix(in srgb, var(--leaf-text) 45%, #ffffff 55%);
  --leaf-accent: #829987;
  --leaf-accent-soft: color-mix(in srgb, var(--leaf-accent) 18%, transparent);
  display: flex;
  min-height: calc(100vh - 24px);
  width: 100%;
  flex-direction: column;
  background: var(--langhuan-paper-bg);
  color: var(--leaf-text);
  overflow: hidden;
}

.leaf-docs--embedded {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}

.leaf-docs--embedded .leaf-docs__topbar-spacer {
  width: 0;
  height: 0;
}

.leaf-docs--embedded .leaf-docs__topbar {
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 0 18px;
}

.leaf-docs--embedded .leaf-docs__titlebar {
  justify-content: flex-start;
}

.leaf-docs__topbar {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 0 16px;
  border-bottom: 1px solid var(--leaf-border);
  background: transparent;
}

.leaf-docs__topbar-spacer {
  width: 36px;
  height: 36px;
}

.leaf-docs__module-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--leaf-border);
  background: transparent;
  overflow-x: auto;
}

.leaf-docs__module-tab {
  border: none;
  border-bottom: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--leaf-text-soft);
  padding: 8px 4px 10px;
  font-size: 0.92rem;
  cursor: pointer;
  white-space: nowrap;
}

.leaf-docs__module-tab.active {
  border-bottom-color: var(--leaf-border-strong);
  color: var(--leaf-accent);
  background: transparent;
}

.leaf-docs__icon-btn,
.leaf-docs__quick-switcher,
.leaf-docs__title-btn,
.leaf-docs__tree-action,
.leaf-docs__toolbar-btn {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.leaf-docs__icon-btn,
.leaf-docs__tree-action,
.leaf-docs__toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
}

.leaf-docs__icon-svg,
.leaf-docs__tree-toggle-icon,
.leaf-docs__title-pencil {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.leaf-docs__icon-btn:hover,
.leaf-docs__tree-action:hover,
.leaf-docs__toolbar-btn:hover,
.leaf-docs__quick-switcher:hover,
.leaf-docs__title-btn:hover {
  background: color-mix(in srgb, var(--leaf-accent) 7%, transparent);
  border-color: transparent;
}

.leaf-docs__toolbar-spacer,
.leaf-docs__window-tools-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}

.leaf-docs__toolbar-btn--danger {
  color: #b4534a;
}

.leaf-docs__toolbar-btn--success {
  color: #6f9276;
}

.leaf-docs__icon-btn:disabled,
.leaf-docs__quick-switcher:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.leaf-docs__icon-btn--danger {
  color: #c45e54;
}

.leaf-docs__icon-btn--success {
  color: #46724f;
}

.leaf-docs__titlebar {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.leaf-docs__title-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 700;
}

.leaf-docs__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaf-docs__title-pencil {
  color: var(--leaf-text-soft);
}

.leaf-docs__topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.leaf-docs__quick-switcher {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.leaf-docs__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.leaf-docs__module-panel {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.leaf-docs__module-panel--prompt {
  background: transparent;
}

.leaf-docs__relation-panel {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  color: var(--leaf-text);
}

.leaf-docs__relation-panel--window {
  grid-template-columns: 150px minmax(260px, 1fr);
  width: 100%;
}

.leaf-docs__relation-panel--external-sidebar {
  grid-template-columns: minmax(0, 1fr);
}

.leaf-docs__relation-panel--window .leaf-docs__relation-editor {
  grid-template-columns: minmax(0, 1fr);
}

.leaf-docs__relation-panel--window .leaf-docs__relation-row {
  align-items: flex-start;
  flex-direction: column;
}

.leaf-docs__relation-sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border-right: 1px solid var(--leaf-border);
}

.leaf-docs__relation-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--leaf-text-soft);
  font-size: 0.86rem;
  cursor: pointer;
}

.leaf-docs__relation-nav.active {
  color: var(--leaf-text);
  background: rgba(130, 153, 135, 0.13);
}

.leaf-docs__relation-main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.leaf-docs__relation-section,
.leaf-docs__relation-list {
  display: grid;
  gap: 10px;
}

.leaf-docs__relation-editor {
  display: grid;
  grid-template-columns: minmax(0, 180px) minmax(0, 220px) auto;
  gap: 8px;
  align-items: center;
}

.leaf-docs__relation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--leaf-border);
}

.leaf-docs__relation-title {
  color: var(--leaf-text);
  font-size: 0.92rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.leaf-docs__relation-meta {
  margin-top: 3px;
  color: var(--leaf-text-soft);
  font-size: 0.78rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.leaf-docs__relation-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.leaf-docs__relation-badge {
  flex: 0 0 auto;
  color: var(--leaf-text-soft);
  font-size: 0.76rem;
}

.leaf-docs__relation-empty {
  padding: 24px 0;
  color: var(--leaf-text-soft);
  font-size: 0.9rem;
}

.leaf-docs__relation-graph-window {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 28px clamp(18px, 4vw, 48px);
}

.leaf-docs__relation-graph-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--leaf-text-soft);
  font-size: 0.84rem;
}

.leaf-docs__relation-graph-canvas {
  width: 100%;
  flex: 1 1 auto;
  min-height: 260px;
}

.leaf-docs__relation-graph-edge {
  stroke: rgba(130, 153, 135, 0.42);
  stroke-width: 2;
}

.leaf-docs__relation-graph-node circle {
  fill: color-mix(in srgb, var(--leaf-panel) 86%, #ffffff 14%);
  stroke: rgba(130, 153, 135, 0.52);
  stroke-width: 1.5;
}

.leaf-docs__relation-graph-node text {
  fill: var(--leaf-text);
  font-size: 13px;
  text-anchor: middle;
  dominant-baseline: middle;
  pointer-events: none;
}

.leaf-docs__body--tree-hidden .leaf-docs__sidebar {
  width: 48px !important;
  min-width: 48px !important;
  overflow: hidden;
}

.leaf-docs__body--tree-hidden .leaf-docs__main {
  width: 100%;
}

.leaf-docs__sidebar--collapsed {
  width: 48px;
  min-width: 48px;
}

.leaf-docs__body--tree-hidden .leaf-docs__tree,
.leaf-docs__body--tree-hidden .leaf-docs__resize-handle {
  display: none;
}

.leaf-docs__sidebar {
  position: relative;
  display: flex;
  width: 220px;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--leaf-border);
  background: transparent;
}

.leaf-docs__tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-height: 34px;
  padding: 2px 8px 2px 10px;
  border-bottom: 0;
  background: transparent;
}

.leaf-docs__tree-action {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.leaf-docs__tree-action--active {
  color: #5f7b66;
  background: transparent;
}

.leaf-docs__tree-action--toggle {
  color: var(--leaf-text-soft);
}

.leaf-docs__tree-toolbar .leaf-docs__tree-action:hover,
.leaf-docs__tree-toolbar .leaf-docs__tree-action:focus-visible {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--leaf-accent);
}

.leaf-docs__tree-toolbar .leaf-docs__tree-action:nth-child(3) .leaf-docs__icon-svg,
.leaf-docs__tree-toolbar .leaf-docs__tree-action:nth-child(4) .leaf-docs__icon-svg {
  width: 18px;
  height: 18px;
  stroke-width: 2;
}

.leaf-docs__tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 0 18px;
  transition: background-color 0.18s ease, box-shadow 0.18s ease;
}

.leaf-docs__cluster {
  display: grid;
  gap: 6px;
  margin-bottom: 26px;
}

.leaf-docs__cluster-header {
  width: calc(100% - 8px);
  margin: 0 4px;
}

.leaf-docs__cluster-header .sidebar-subgroup-toggle {
  width: 21px;
  flex: 0 0 21px;
  font-size: 21px;
}

.leaf-docs__cluster-header .sidebar-subgroup-name {
  font-size: 0.92rem;
}

.sidebar-subgroup-header {
  position: relative;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--leaf-text);
  min-height: 28px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
}

.sidebar-subgroup-header,
.sidebar-subgroup-header * {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.sidebar-subgroup-header--drag-mode {
  cursor: grab;
}

.sidebar-subgroup-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  color: rgba(123, 116, 107, 0.72);
  font-size: 14px;
  flex: 0 0 14px;
  transition: transform 0.18s ease, color 0.18s ease;
}

.sidebar-subgroup-toggle--button {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.sidebar-subgroup-name {
  font-size: 0.84rem;
}

.sidebar-subgroup-count {
  margin-left: auto;
  color: var(--leaf-text-soft);
  font-size: 0.72rem;
}

.sidebar-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sidebar-row-actions--header {
  margin-left: 8px;
}

.leaf-docs__cluster-actions {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.sidebar-subgroup-header:hover .leaf-docs__cluster-actions,
.sidebar-subgroup-header:focus-within .leaf-docs__cluster-actions {
  opacity: 1;
  pointer-events: auto;
}

.leaf-docs__row-menu--cluster {
  top: 30px;
}

.leaf-docs__cluster-toggle,
.leaf-docs__cluster-label,
.leaf-docs__cluster-count {
  display: none;
}

.leaf-docs__tree-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 20px;
  padding-left: 6px;
  padding-right: 10px;
  color: var(--leaf-text-soft);
  cursor: pointer;
  user-select: none;
  font-size: 0.84rem;
  position: relative;
  transition: background-color 0.16s ease, opacity 0.16s ease, transform 0.16s ease, margin 0.18s ease;
  user-select: none;
  -webkit-user-select: none;
}

.leaf-docs__tree-row:hover {
  background: color-mix(in srgb, var(--leaf-accent) 5%, transparent);
}

.leaf-docs__tree--dragging .leaf-docs__tree-row:hover,
.leaf-docs__tree--dragging .leaf-docs__tree-row.active,
.leaf-docs__tree--dragging .leaf-docs__tree-row--selected {
  background: transparent;
}

.leaf-docs__tree-row--selected {
  background: transparent;
  margin-top: 0;
  margin-bottom: 0;
  border-radius: 0;
}

.leaf-docs__tree-row.active {
  color: var(--leaf-accent);
}

.leaf-docs__tree-row--folder {
  color: var(--leaf-text);
  min-height: 24px;
  margin-top: 6px;
  margin-bottom: 0;
  margin-left: 4px;
  margin-right: 4px;
  padding-right: 8px;
  border-radius: 4px;
  background: transparent;
}

.leaf-docs__tree-row--folder-open {
  margin-top: 12px;
}

.leaf-docs__tree-row--folder .leaf-docs__tree-label {
  font-weight: 500;
}

.leaf-docs__tree-row--document {
  min-height: 19px;
  margin-top: 0;
  margin-bottom: 0;
}

.leaf-docs__tree-row--document::before {
  content: '';
  position: absolute;
  left: calc(22px + var(--tree-depth, 0) * 8px);
  top: 50%;
  width: 6px;
  border-top: 2px solid color-mix(in srgb, var(--leaf-border-strong) 76%, transparent);
  transform: translateY(-50%);
  pointer-events: none;
}

.leaf-docs__tree-toggle,
.leaf-docs__tree-toggle-spacer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  flex: 0 0 13px;
  color: var(--leaf-text-faint);
}

.leaf-docs__tree-row--folder .leaf-docs__tree-toggle,
.leaf-docs__tree-row--folder .leaf-docs__tree-toggle-spacer {
  margin-right: 1px;
}

.leaf-docs__tree-toggle {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transform: rotate(-90deg);
  transform-origin: center;
}

.leaf-docs__tree-toggle.open {
  transform: rotate(0deg);
}

.leaf-docs__tree-guides {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: calc(var(--tree-depth, 0) * 8px);
  min-width: calc(var(--tree-depth, 0) * 8px);
  flex: 0 0 calc(var(--tree-depth, 0) * 8px);
  height: 100%;
  padding-left: var(--tree-line-offset, 0px);
  box-sizing: border-box;
}

.leaf-docs__tree-guides--empty {
  padding-left: 0;
}

.leaf-docs__tree-guide {
  width: 2px;
  min-width: 2px;
  height: 100%;
  background: color-mix(in srgb, var(--leaf-border-strong) 92%, transparent);
  border-radius: 999px;
}

.leaf-docs__tree-row--document .leaf-docs__tree-guide {
  background: color-mix(in srgb, var(--leaf-border-strong) 62%, transparent);
}

.leaf-docs__tree-marker {
  width: 1px;
  height: 100%;
  border-radius: 999px;
  background: transparent;
  flex: 0 0 1px;
}

.leaf-docs__tree-marker.active {
  background: var(--leaf-accent);
}

.leaf-docs__tree-row--folder .leaf-docs__tree-marker,
.leaf-docs__tree-row--folder .leaf-docs__tree-marker.active {
  background: transparent;
}

.leaf-docs__tree-row .leaf-docs__tree-label,
.leaf-docs__tree-row .leaf-docs__tree-marker,
.leaf-docs__tree-row .leaf-docs__tree-toggle,
.leaf-docs__tree-row .leaf-docs__tree-guides {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.leaf-docs__tree-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  position: relative;
  z-index: 1;
}

.leaf-docs__tree-row--document .leaf-docs__tree-label {
  margin-left: 4px;
}

.leaf-docs__tree-row-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease;
}

.leaf-docs__tree-row:hover .leaf-docs__tree-row-actions,
.leaf-docs__tree-row.active .leaf-docs__tree-row-actions,
.leaf-docs__tree-row--selected .leaf-docs__tree-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.leaf-docs__row-action {
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.leaf-docs__row-action:hover {
  background: color-mix(in srgb, var(--leaf-accent) 7%, transparent);
  border-color: var(--leaf-border);
}

.leaf-docs__row-menu {
  position: absolute;
  top: calc(100% - 4px);
  right: 8px;
  z-index: 12;
  min-width: 184px;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--leaf-border) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--leaf-panel);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  overflow: hidden;
}

.leaf-docs__row-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--leaf-text);
  text-align: left;
  padding: 8px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.leaf-docs__row-menu-item:hover {
  background: color-mix(in srgb, var(--leaf-accent) 8%, transparent);
}

.leaf-docs__row-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.leaf-docs__row-menu-item--muted {
  color: var(--leaf-text-soft);
}

.leaf-docs__row-menu-item--danger {
  color: #c94e48;
}

.leaf-docs__row-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--leaf-border) 82%, transparent);
}

.leaf-docs__row-menu-shortcut {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: var(--leaf-text-soft);
}

.leaf-docs__cluster-header--selected {
  background: color-mix(in srgb, #8faa98 10%, transparent);
}

.leaf-docs__tree-row--selected {
  background: color-mix(in srgb, #8faa98 10%, transparent);
}

.leaf-docs__tree-row--folder.leaf-docs__tree-row--selected {
  background: color-mix(in srgb, #8faa98 10%, transparent);
}

.leaf-docs__cluster-header--cut-pending,
.leaf-docs__tree-row--cut-pending {
  opacity: 0.52;
}

.leaf-docs__resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
}

.leaf-docs__main {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: transparent;
}

.leaf-docs__aux-panel {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  width: clamp(380px, 27.5vw, 620px);
  min-width: 380px;
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid rgba(96, 110, 91, 0.28);
  background: var(--langhuan-paper-bg);
  overflow: hidden;
  will-change: flex-basis, width, opacity, transform;
}

.leaf-docs-aux-slide-enter-active,
.leaf-docs-aux-slide-leave-active {
  transition:
    width 240ms ease,
    min-width 240ms ease,
    flex-basis 240ms ease,
    opacity 220ms ease,
    transform 240ms ease;
}

.leaf-docs-aux-slide-enter-from,
.leaf-docs-aux-slide-leave-to {
  flex-basis: 0 !important;
  width: 0 !important;
  min-width: 0 !important;
  opacity: 0;
  transform: translateX(18px);
}

.leaf-docs__aux-panel-resize {
  position: absolute;
  z-index: 3;
  top: 0;
  bottom: 0;
  left: -5px;
  width: 9px;
  border: 0;
  background: transparent;
  cursor: col-resize;
}

.leaf-docs__aux-panel-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--leaf-border) 76%, transparent);
}

.leaf-docs__aux-panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  justify-self: end;
  min-width: 0;
}

.leaf-docs__main :deep(.app-workspace-read-pane__actions .role-unit-action),
.leaf-docs__aux-panel-actions .role-unit-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 6px;
  width: auto !important;
  min-width: 82px;
  height: 34px !important;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 74%, #ffffff 26%);
  color: color-mix(in srgb, var(--morandi-text) 82%, var(--morandi-text-light) 18%);
  font-weight: 650;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
}

.leaf-docs__main :deep(.app-workspace-read-pane__actions .role-unit-action:hover:not(:disabled)),
.leaf-docs__aux-panel-actions .role-unit-action:hover:not(:disabled),
.leaf-docs__aux-panel-actions .role-unit-action.active {
  border-color: color-mix(in srgb, var(--morandi-accent) 38%, var(--morandi-border));
  background: color-mix(in srgb, var(--morandi-accent) 12%, var(--morandi-surface));
  color: var(--morandi-text);
}

.leaf-docs__main :deep(.role-unit-action--relation),
.leaf-docs__aux-panel-actions .role-unit-action--relation {
  min-width: 110px;
}

.leaf-docs__main :deep(.role-unit-action .app-workspace-shell__icon),
.leaf-docs__aux-panel-actions .role-unit-action .app-workspace-shell__icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.leaf-docs__main :deep(.role-unit-action__label),
.leaf-docs__aux-panel-actions .role-unit-action__label {
  flex: 0 0 auto;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

.leaf-docs__aux-panel-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--leaf-text-soft);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.leaf-docs__aux-panel-close:hover {
  background: color-mix(in srgb, var(--leaf-border) 42%, transparent);
  color: var(--leaf-text);
}

.leaf-docs__aux-panel-preview-body,
.leaf-docs__aux-panel-relation-body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.leaf-docs__aux-panel-preview-body {
  padding: 24px 26px 42px;
}

.leaf-docs__aux-panel-preview-content {
  color: var(--leaf-text);
  line-height: 1.85;
}

.leaf-docs__aux-panel-preview-empty {
  display: grid;
  min-height: 160px;
  place-items: center;
  color: var(--leaf-text-soft);
  font-size: 13px;
}

.leaf-docs__aux-panel-relation-body {
  overflow: hidden;
}

.leaf-docs__aux-panel-relation-graph {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.leaf-docs__aux-panel-relation-graph .unit-relation-brain-view {
  position: relative;
  z-index: 0;
  flex: 1 1 auto;
  min-height: 0;
}

.leaf-docs__aux-panel-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4f6f58;
  background: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

:global([data-theme="dark"] .leaf-docs__aux-panel-loading){
  color: #8fae96;
}

.doc-relation-loading-fade-enter-active {
  transition: none;
}

.doc-relation-loading-fade-leave-active {
  transition:
    opacity 420ms ease,
    backdrop-filter 420ms ease,
    background-color 420ms ease;
}

.doc-relation-loading-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
  background-color: transparent;
}

.doc-relation-loading-fade-enter-from {
  opacity: 1;
  backdrop-filter: blur(4px);
  background-color: color-mix(in srgb, var(--morandi-bg) 76%, transparent);
}

.doc-relation-loading-fade-leave-active .leaf-docs__aux-panel-loading-mark {
  transition:
    opacity 360ms ease,
    filter 420ms ease,
    transform 420ms ease;
}

.doc-relation-loading-fade-leave-to .leaf-docs__aux-panel-loading-mark {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(8px) scale(0.97);
}

.leaf-docs__aux-panel-loading-mark {
  display: grid;
  justify-items: center;
  gap: 14px;
  width: min(300px, calc(100% - 48px));
  color: #4f6f58;
}

:global([data-theme="dark"] .leaf-docs__aux-panel-loading-mark){
  color: #8fae96;
}

.leaf-docs__aux-panel-loading-icon {
  display: inline-grid;
}

.leaf-docs__workspace {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.leaf-docs__window-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 10px;
  border-bottom: 1px solid var(--leaf-border);
  background: color-mix(in srgb, var(--leaf-panel) 78%, transparent);
  overflow: hidden;
}

.leaf-docs__window-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 220px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--leaf-text-soft);
  font-size: 0.82rem;
  cursor: pointer;
}

.leaf-docs__window-tab.active {
  border-color: color-mix(in srgb, var(--leaf-border) 82%, #7b8f7f 18%);
  color: var(--leaf-text);
  background: rgba(130, 153, 135, 0.11);
}

.leaf-docs__window-tab > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaf-docs__window-close,
.leaf-docs__window-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--leaf-text-soft);
  cursor: pointer;
}

.leaf-docs__window-close {
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  font-size: 1rem;
  line-height: 1;
}

.leaf-docs__window-tool {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}

.leaf-docs__window-close:hover,
.leaf-docs__window-tool:hover {
  color: var(--leaf-text);
  background: rgba(130, 153, 135, 0.1);
}

.leaf-docs__window-strip {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.leaf-docs__window-pane {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, var(--leaf-border) 70%, transparent);
  background: transparent;
}

.leaf-docs__window-pane.active {
  box-shadow: inset 0 2px 0 rgba(130, 153, 135, 0.24);
}

.leaf-docs__window-pane:last-child {
  border-right: none;
}

.leaf-docs__window-splitter {
  flex: 0 0 6px;
  margin-left: -3px;
  margin-right: -3px;
  cursor: col-resize;
  z-index: 2;
}

.leaf-docs__window-splitter:hover {
  background: color-mix(in srgb, var(--leaf-border) 54%, transparent);
}

.leaf-docs__viewer,
.leaf-docs__editor,
.leaf-docs__empty {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.leaf-docs__viewer {
  display: flex;
  flex-direction: column;
}

.leaf-docs__viewer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 48px 0;
}

.leaf-docs__breadcrumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--leaf-accent);
  font-size: 0.95rem;
}

.leaf-docs__breadcrumb-sep {
  color: var(--leaf-text-faint);
}

.leaf-docs__updated {
  white-space: nowrap;
  color: var(--leaf-text-soft);
  font-size: 0.92rem;
}

.leaf-docs__viewer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.leaf-docs__viewer-body {
  padding: 12px 48px 56px;
}

.leaf-docs__editor {
  display: flex;
  flex-direction: column;
  position: relative;
}

.leaf-docs__editor-path {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 0 clamp(18px, 3vw, 36px);
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 70%, transparent);
  color: var(--morandi-text-light, #6c7468);
  font-size: 13px;
}

.leaf-docs__editor-path-text {
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--morandi-text, #364034) 76%, #6f9276 24%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leaf-docs__editor-path-part {
  display: inline;
}

.leaf-docs__editor-path-sep {
  padding: 0 8px;
  color: var(--morandi-text-light, #6c7468);
}

.leaf-docs__toolbar {
  display: flex;
  align-items: center;
  gap: 1px;
  min-height: 40px;
  padding: 0 4px;
  border-bottom: 1px solid var(--leaf-border);
  background: var(--leaf-panel);
  overflow-x: auto;
}

.leaf-docs__toolbar-btn {
  flex: 0 0 22px;
  width: 22px;
  height: 28px;
  border-radius: 5px;
  font-size: 0.78rem;
}

.leaf-docs__toolbar-sep {
  width: 1px;
  height: 20px;
  margin: 0;
  background: var(--leaf-border);
}

.leaf-docs__editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.leaf-docs__editor-pane {
  display: flex;
  min-width: 0;
  min-height: 100%;
  flex: 1;
  flex-direction: column;
  background: transparent;
}

.leaf-docs__editor-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 14px 18px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--leaf-border) 72%, transparent);
}

.leaf-docs__editor-title-field {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: var(--leaf-text-soft);
  font-size: 0.9rem;
}

.leaf-docs__input {
  width: 100%;
  border: 1px solid var(--leaf-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--leaf-bg) 92%, #ffffff 8%);
  color: var(--leaf-text);
  padding: 10px 12px;
  font-size: 0.94rem;
  outline: none;
}

.leaf-docs__input:focus {
  border-color: var(--leaf-border-strong);
}

.leaf-docs__textarea {
  flex: 1 0 280px;
  min-height: 280px;
  border: none;
  background: transparent;
  color: var(--leaf-text);
  padding: 18px 22px 32px;
  resize: none;
  outline: none;
  font: 400 1rem/1.75 "Consolas", "Courier New", monospace;
}

.leaf-docs__mini-textarea {
  width: 100%;
  min-height: 62px;
  border: 1px solid var(--leaf-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--leaf-bg) 92%, #ffffff 8%);
  color: var(--leaf-text);
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  font: 400 0.94rem/1.6 "Consolas", "Courier New", monospace;
}

.leaf-docs__mini-textarea:focus {
  border-color: var(--leaf-border-strong);
}

.leaf-docs__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--leaf-text-soft);
}

.leaf-docs__empty-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--leaf-text);
}

.leaf-docs__empty-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  margin-top: 6px;
  padding: 0 12px;
  border: 1px solid var(--leaf-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--leaf-bg) 88%, var(--leaf-accent) 12%);
  color: var(--leaf-text);
  cursor: pointer;
}

.leaf-docs__empty-action:hover:not(:disabled) {
  border-color: var(--leaf-border-strong);
  color: var(--leaf-accent);
}

.leaf-docs__empty-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.leaf-docs__dialog-form {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.leaf-docs__dialog-search {
  display: grid;
  gap: 8px;
  margin-bottom: 6px;
}

.leaf-docs__field {
  display: grid;
  gap: 8px;
}

.leaf-docs__field-label {
  font-size: 0.9rem;
  color: var(--leaf-text);
  font-weight: 600;
}

.leaf-docs__field-note {
  color: var(--leaf-text-soft);
  font-size: 0.88rem;
}

.leaf-docs__field-value {
  min-height: 42px;
  border: 1px solid var(--leaf-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--leaf-bg) 92%, #ffffff 8%);
  color: var(--leaf-text);
  padding: 10px 12px;
  font-size: 0.94rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.leaf-docs__field-value--multiline {
  min-height: 62px;
}

.leaf-docs__import-dialog {
  max-height: 62vh;
  overflow: auto;
}

.leaf-docs__import-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.leaf-docs__import-stats span {
  padding: 5px 10px;
  border: 1px solid var(--leaf-border);
  border-radius: 999px;
  color: var(--leaf-text);
  background: color-mix(in srgb, var(--leaf-panel) 88%, var(--leaf-accent) 12%);
}

.leaf-docs__import-preview,
.leaf-docs__import-warnings {
  display: grid;
  gap: 8px;
}

.leaf-docs__import-row {
  display: grid;
  gap: 2px;
  padding: 9px 10px;
  border: 1px solid var(--leaf-border);
  border-radius: 10px;
}

.leaf-docs__import-row small {
  color: var(--leaf-text-soft);
}

.leaf-docs__import-error {
  color: #b85656;
}

.leaf-docs__primary-btn,
.leaf-docs__secondary-btn {
  min-width: 106px;
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 0.95rem;
  cursor: pointer;
}

.leaf-docs__secondary-btn {
  border: 1px solid var(--leaf-border);
  background: transparent;
  color: var(--leaf-text);
}

.leaf-docs__primary-btn {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--leaf-accent, #7ea79d) 78%, #2f8552 22%);
  color: #fff;
}

.leaf-docs__primary-btn:disabled,
.leaf-docs__secondary-btn:disabled,
.leaf-docs__row-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.leaf-docs__sort-shell {
  display: grid;
  padding: 12px 14px;
}

.leaf-docs__sort-list {
  display: grid;
  gap: 0;
}

.leaf-docs__sort-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--leaf-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--leaf-text);
  text-align: left;
}

.leaf-docs__sort-item--selected {
  border-color: rgba(126, 167, 157, 0.36);
  background: rgba(126, 167, 157, 0.08);
}

.leaf-docs__sort-item:first-child {
  margin-top: 0;
}

.leaf-docs__sort-item--join-top {
  margin-top: -1px;
  border-top-color: transparent;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.leaf-docs__sort-item--join-bottom {
  border-bottom-color: transparent;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.leaf-docs__sort-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--leaf-text);
  line-height: 1.2;
}

.leaf-docs__sort-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.leaf-docs-sort-move,
.leaf-docs-sort-enter-active,
.leaf-docs-sort-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.leaf-docs-sort-enter-from,
.leaf-docs-sort-leave-to {
  opacity: 0.7;
  transform: translateY(6px);
}

.leaf-docs__markdown {
  color: var(--leaf-text);
}

.leaf-docs__markdown :deep(h1),
.leaf-docs__markdown h1 {
  margin: 0 0 28px;
  font-size: clamp(2.2rem, 3vw, 3.4rem);
  line-height: 1.15;
  font-weight: 500;
}

.leaf-docs__markdown :deep(h2),
.leaf-docs__markdown h2 {
  margin: 72px 0 22px;
  padding-top: 26px;
  border-top: 1px solid var(--leaf-border);
  font-size: clamp(1.7rem, 2.3vw, 2.4rem);
  line-height: 1.2;
  font-weight: 500;
}

.leaf-docs__markdown :deep(h3),
.leaf-docs__markdown h3 {
  margin: 36px 0 16px;
  font-size: 1.24rem;
  line-height: 1.35;
  font-weight: 700;
}

.leaf-docs__markdown :deep(p),
.leaf-docs__markdown p,
.leaf-docs__markdown :deep(li),
.leaf-docs__markdown li,
.leaf-docs__markdown :deep(blockquote),
.leaf-docs__markdown blockquote {
  margin: 0 0 22px;
  font-size: 1rem;
  line-height: 1.7;
}

.leaf-docs__markdown :deep(ul),
.leaf-docs__markdown ul {
  margin: 0 0 22px;
  padding-left: 1.4rem;
}

.leaf-docs__markdown :deep(blockquote),
.leaf-docs__markdown blockquote {
  padding-left: 16px;
  border-left: 3px solid var(--leaf-border-strong);
  color: var(--leaf-text-soft);
}

.leaf-docs__markdown--preview {
  max-width: 980px;
}

.leaf-docs *,
.leaf-docs *::before,
.leaf-docs *::after {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.leaf-docs *::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

@media (max-width: 960px) {
  .leaf-docs {
    min-height: auto;
  }

  .leaf-docs__topbar {
    grid-template-columns: 40px minmax(0, 1fr);
    padding: 0 12px;
  }

  .leaf-docs__topbar-actions {
    grid-column: 1 / -1;
    padding-bottom: 10px;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .leaf-docs__body {
    flex-direction: column;
  }

  .leaf-docs__sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--leaf-border);
  }

  .leaf-docs__resize-handle {
    display: none;
  }

  .leaf-docs__viewer-header,
  .leaf-docs__viewer-body {
    padding-left: 20px;
    padding-right: 20px;
  }

  .leaf-docs__editor-body {
    flex-direction: column;
  }

  .leaf-docs__editor-meta,
  .leaf-docs__compile-grid {
    grid-template-columns: 1fr;
  }

  .leaf-docs__editor-meta {
    flex-direction: column;
  }
}
</style>
