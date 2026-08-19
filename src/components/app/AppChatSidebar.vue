<template>
  <div class="chat-sidebar-shell" :class="{ 'chat-sidebar-shell--touch': isTouchMode }">
    <div class="chat-sidebar-overlay" :class="{ open: sidebarOpen }" @click="$emit('update:sidebar-open', false)"></div>

    <div
      class="chat-sidebar"
      :class="{ open: isSidebarVisuallyOpen, 'chat-sidebar--hover-open': desktopHoverOpen, 'chat-sidebar--floating': desktopFloatingMode, 'chat-sidebar--leaving': desktopSidebarLeaving }"
      :style="desktopSidebarStyle"
    >
      <div v-if="sidebarContentView === 'chat'" class="chat-sidebar-content chat-sidebar-content--sessions" @contextmenu.prevent>
        <div class="chat-session-toolbar">
          <div class="chat-session-search">
            <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m21 21-4.34-4.34"/>
              <circle cx="11" cy="11" r="8"/>
            </svg>
            <input v-model.trim="chatSessionSearch" type="search" :placeholder="t('sidebar.searchSessions')">
          </div>
          <button
            v-if="desktopSidebarPinned"
            type="button"
            class="chat-session-tool-button sidebar-collapse-button"
            :title="t('sidebar.collapse')"
            :aria-label="t('sidebar.collapse')"
            @click.stop="$emit('unpin-sidebar')"
          >
            <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2"/>
              <path d="M9 4v16"/>
              <path d="m15 9-3 3 3 3"/>
            </svg>
          </button>
        </div>
        <div class="chat-session-action-row">
          <div class="chat-session-actions">
            <div class="chat-session-filter">
              <button
                type="button"
                class="chat-session-tool-button chat-session-filter-button"
                :class="{ active: chatSessionFilterMenuOpen }"
                :title="t('sidebar.filterSessions')"
                :aria-label="t('sidebar.filterSessions')"
                @click.stop="chatSessionFilterMenuOpen = !chatSessionFilterMenuOpen"
              >
                <span>{{ chatSessionFilterLabel }}</span>
                <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              <div v-if="chatSessionFilterMenuOpen" class="chat-session-filter-menu" @click.stop>
                <button type="button" class="chat-session-filter-item" :class="{ active: chatSessionFilter === 'recent' }" @click="setChatSessionFilter('recent')">{{ t('sidebar.filterRecent') }}</button>
                <button type="button" class="chat-session-filter-item" :class="{ active: chatSessionFilter === 'crowd' }" @click="setChatSessionFilter('crowd')">{{ t('sidebar.filterCrowd') }}</button>
                <!-- 归档入口已下线（2026-07-09 用户拍板）：删除=彻底删除，不再提供软保留的归档筛选/操作 -->
              </div>
            </div>
            <button type="button" class="chat-session-tool-button chat-session-create-button" :title="t('sidebar.createSession')" :aria-label="t('sidebar.createSession')" @click.stop="openChatSessionCreatorFromSidebar">
              <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14"/>
                <path d="M5 12h14"/>
              </svg>
              <span>{{ t('sidebar.createSession') }}</span>
            </button>
          </div>
        </div>

        <div class="chat-session-list" @click="chatSessionFilterMenuOpen = false">
          <div
            v-for="row in filteredChatSessionRows"
            :key="row.sessionId"
            role="button"
            tabindex="0"
            class="chat-session-row"
            :class="{
              active: isChatSessionRowActive(row),
              'chat-session-row--selected': isChatSessionSelectionVisible(row),
              'chat-session-row--selection-exiting': isChatSessionSelectionExiting(row),
              'chat-session-row--selection-fading': isChatSessionSelectionFading(row),
              'chat-session-row--selected-prev': hasChatSessionMergedSelectionNeighbor(row, -1),
              'chat-session-row--selected-next': hasChatSessionMergedSelectionNeighbor(row, 1)
            }"
            :aria-current="isChatSessionRowActive(row) ? 'true' : undefined"
            :data-multi-select-id="getChatSessionSelectionId(row)"
            @click="handleChatSessionRowClick(row, $event)"
            @contextmenu.prevent.stop="openChatSessionContextMenu(row, $event)"
            @selectstart.prevent
            @pointerdown="handleChatSessionPointerDown(row, $event)"
            @pointermove="handleChatSessionPointerMove($event)"
            @pointerup="handleChatSessionPointerEnd($event)"
            @pointercancel="handleChatSessionPointerEnd($event)"
            @keydown.enter.prevent="selectChatSessionRow(row)"
            @keydown.space.prevent="selectChatSessionRow(row)"
          >
            <span class="chat-session-avatar">
              <img v-if="row.avatarPath" :src="normalizeAvatarUrl(row.avatarPath)" alt="">
              <span v-else>{{ row.emoji || (row.kind === 'crowd' ? '众' : '会') }}</span>
            </span>
            <span class="chat-session-main">
              <span class="chat-session-title-row">
                <span class="chat-session-title-meta">
                  <span class="chat-session-title">{{ row.title }}</span>
                  <span v-if="row.label" class="chat-session-label">{{ row.label }}</span>
                </span>
                <span class="chat-session-time">{{ formatChatSessionTime(row.updatedAt) }}</span>
              </span>
              <span class="chat-session-preview">{{ row.preview }}</span>
            </span>
            <SidebarFloatingMenu :open="isChatSessionMenuOpen(row)" menu-class="sidebar-row-menu" :menu-style="floatingMenuStyle" :clamp-to-viewport="true">
              <button
                v-for="item in getChatSessionMenuItems(row)"
                :key="item.key"
                type="button"
                class="sidebar-row-menu-item"
                :class="{ 'sidebar-row-menu-item--danger': item.danger }"
                :disabled="item.disabled"
                @click.stop="runChatSessionMenuAction(item.action, row)"
              >
                <span>{{ item.label }}</span>
              </button>
            </SidebarFloatingMenu>
          </div>
        </div>
      </div>

      <div
        v-else-if="sidebarContentView === 'roles'"
        ref="contactLayoutRootRef"
        class="chat-sidebar-content"
        :class="{ 'chat-sidebar-content--contacts': true, 'chat-sidebar-content--contact-drag': contactDragSortEnabled }"
        @contextmenu.prevent
      >
        <div class="role-sidebar-toolbar">
          <div class="role-sidebar-search-row">
            <div class="chat-session-search role-sidebar-search">
              <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m21 21-4.34-4.34"/>
                <circle cx="11" cy="11" r="8"/>
              </svg>
              <input v-model.trim="roleCharacterSearch" type="search" :placeholder="t('sidebar.searchRoles')">
            </div>
            <button
              v-if="desktopSidebarPinned"
              type="button"
              class="chat-session-tool-button sidebar-collapse-button"
              :title="t('sidebar.collapse')"
              :aria-label="t('sidebar.collapse')"
              @click.stop="$emit('unpin-sidebar')"
            >
              <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2"/>
                <path d="M9 4v16"/>
                <path d="m15 9-3 3 3 3"/>
              </svg>
            </button>
          </div>
          <div class="role-sidebar-action-row">
            <div class="role-group-filter" @mouseleave="activeRoleGroupFilterPath = []">
              <button
                type="button"
                class="chat-session-tool-button chat-session-filter-button role-group-filter-button"
                :class="{ active: roleGroupFilterMenuOpen || selectedRoleGroupFilterId !== 'all' }"
                :title="t('sidebar.filterByGroup')"
                :aria-label="t('sidebar.filterByGroup')"
                @click.stop="toggleRoleGroupFilterMenu"
              >
                <span>{{ roleGroupFilterLabel }}</span>
                <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              <div v-if="roleGroupFilterMenuOpen" class="role-group-filter-menu" @click.stop>
                <div
                  v-for="(column, columnIndex) in roleGroupFilterColumns"
                  :key="`role-filter-column-${columnIndex}`"
                  class="role-group-filter-column"
                >
                  <button
                    v-for="node in column"
                    :key="node.id"
                    type="button"
                    class="role-group-filter-item"
                    :class="{ active: selectedRoleGroupFilterId === node.id }"
                    @mouseenter="setRoleGroupFilterHoverPath(columnIndex, node)"
                    @click="selectRoleGroupFilter(node.id)"
                  >
                    <span>{{ node.label }}</span>
                    <span class="role-group-filter-meta">
                      <span>{{ node.count }}</span>
                      <span v-if="node.children.length" class="role-group-filter-arrow">›</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <button type="button" class="chat-session-tool-button role-sidebar-create-button" title="新建角色" aria-label="新建角色" @click.stop="$emit('open-add-character')">
              <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" x2="19" y1="8" y2="14"/>
                <line x1="22" x2="16" y1="11" y2="11"/>
              </svg>
            </button>
            <button type="button" class="chat-session-tool-button role-sidebar-create-button" title="管理分组" aria-label="管理分组" @click.stop="$emit('open-char-group-manager', 'char')">
              <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3"/>
                <path d="m14.305 19.53.923-.382"/>
                <path d="m15.228 16.852-.923-.383"/>
                <path d="m16.852 15.228-.383-.923"/>
                <path d="m16.852 20.772-.383.924"/>
                <path d="m19.148 15.228.383-.923"/>
                <path d="m19.53 21.696-.382-.924"/>
                <path d="m20.772 16.852.924-.383"/>
                <path d="m20.772 19.148.924.383"/>
                <circle cx="18" cy="18" r="3"/>
              </svg>
            </button>
            <div v-if="canManageContactKind('char')" class="role-sidebar-icon-actions">
              <button
                type="button"
                class="btn btn-small icon-btn"
                :class="{ active: isContactDragActive('char') }"
                :title="isContactDragActive('char') ? '角色拖动已开启' : '开启角色拖动'"
                @click="toggleContactItemDragMode('char')"
              >
                <svg v-if="contactDragSortEnabled" class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="19" cy="5" r="1"/>
                  <circle cx="5" cy="5" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                  <circle cx="19" cy="19" r="1"/>
                  <circle cx="5" cy="19" r="1"/>
                </svg>
                <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="19" cy="5" r="1"/>
                  <circle cx="5" cy="5" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                  <circle cx="19" cy="19" r="1"/>
                  <circle cx="5" cy="19" r="1"/>
                  <path d="M4 20 20 4"/>
                </svg>
              </button>
              <button
                type="button"
                class="btn btn-small icon-btn"
                :title="roleContactGroupToggleTitle"
                :aria-label="roleContactGroupToggleTitle"
                :disabled="!renderedRoleContactGroupIds.length"
                @mousedown.stop
                @pointerdown.stop
                @click.stop="toggleAllRoleContactGroups"
              >
                <svg v-if="roleContactGroupsAllCollapsed" class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 15 5 5 5-5"/>
                  <path d="m7 9 5-5 5 5"/>
                </svg>
                <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 20 5-5 5 5"/>
                  <path d="m7 4 5 5 5-5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="sidebar-section" :style="getContactSectionLayoutStyle('char')" @wheel.capture.prevent.stop="handleContactSectionWheel('char', $event)">
          <div class="sidebar-section-body">
            <div
              class="sidebar-section-scroll"
              :ref="(el) => setContactSectionScrollRef('char', el)"
              @scroll="handleContactSectionScroll('char')"
            >
              <TransitionGroup name="sidebar-reorder" tag="div" class="sidebar-list">
                <div v-for="grp in getRenderedCharacterGroupsForRoleSidebar()" :key="`char-${String(grp.id || grp.name || '')}`">
              <div
                @click="handleContactGroupHeaderClick('char', String(grp.id || ''), $event)"
                @dblclick.stop="handleContactGroupHeaderDoubleClick('char', String(grp.id || ''))"
                @contextmenu.prevent.stop="openCharGroupContextMenu('char', String(grp.id || ''), $event)"
                @pointerdown="handleContactGroupHeaderPointerDown('char', String(grp.id || ''), $event)"
                @pointermove="handleContactGroupHeaderPointerMove($event)"
                @pointerup="handleContactGroupHeaderPointerEnd('char', String(grp.id || ''), $event)"
                @pointercancel="handleContactGroupHeaderPointerEnd('char', String(grp.id || ''), $event)"
                @selectstart.prevent
                class="sidebar-subgroup-header sidebar-interaction-header"
                :class="{
                  'sidebar-subgroup-header--drag-mode': isContactGroupSortActive('char'),
                  'sidebar-subgroup-header--selected': isContactGroupSelected(String(grp.id || '')),
                  'sidebar-subgroup-header--selected-prev': hasAdjacentSelectedContactGroup('char', String(grp.id || ''), -1),
                  'sidebar-subgroup-header--selected-next': hasAdjacentSelectedContactGroup('char', String(grp.id || ''), 1),
                  'sidebar-interaction-preview-shift': contactGroupDrag.dropTargetId.value === String(grp.id || ''),
                  'sidebar-interaction-dragging': isContactGroupHeaderDragging(String(grp.id || '')),
                  'sidebar-interaction-drop-target': isContactGroupHeaderDropTarget(String(grp.id || '')),
                  'sidebar-interaction-drop-target--before': isContactGroupHeaderDropTargetBefore(String(grp.id || '')),
                  'sidebar-interaction-drop-target--after': isContactGroupHeaderDropTargetAfter(String(grp.id || '')),
                  'sidebar-subgroup-header--preview-shift': contactGroupDrag.dropTargetId.value === String(grp.id || ''),
                  'sidebar-subgroup-header--dragging': isContactGroupHeaderDragging(String(grp.id || '')),
                  'sidebar-subgroup-header--drop-target': isContactGroupHeaderDropTarget(String(grp.id || ''))
                }"
                data-contact-group-header="true"
                data-contact-group-kind="char"
                :data-character-group-id="String(grp.id || '')"
                :data-doc-drag-id="String(grp.id || '')"
                :data-multi-select-id="isContactGroupSortActive('char') ? String(grp.id || '') : undefined"
              >
                <svg class="sidebar-subgroup-toggle" :style="{ transform: isGroupCollapsed(String(grp.id || '')) ? 'rotate(0deg)' : 'rotate(90deg)' }" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
                <span class="sidebar-subgroup-name">{{ grp.name }}</span>
                <span class="sidebar-subgroup-count">{{ getRenderedCharactersByGroup(String(grp.id || '')).length }}</span>
                <span class="sidebar-row-actions sidebar-row-actions--header">
                  <button
                    v-if="shouldShowContactGroupMenuTrigger('char')"
                    type="button"
                    class="sidebar-row-action"
                    title="分组操作"
                    @mousedown.stop
                    @pointerdown.stop
                    @click.stop="toggleCharGroupMenu('char', String(grp.id || ''), $event)"
                  >
                    <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.5"/>
                      <circle cx="12" cy="12" r="1.5"/>
                      <circle cx="12" cy="19" r="1.5"/>
                    </svg>
                  </button>
                </span>
                <SidebarFloatingMenu :open="isCharGroupMenuOpen('char', String(grp.id || ''))" menu-class="sidebar-row-menu" :menu-style="floatingMenuStyle">
                    <button
                      v-for="item in getCharGroupMenuItems('char')"
                      :key="`char-group-${item.key}`"
                      type="button"
                      class="sidebar-row-menu-item"
                      :class="{ danger: item.danger }"
                      @mousedown.stop
                      @pointerdown.stop
                      @click.stop="runCharGroupMenuAction(item.action, 'char', String(grp.id || ''))"
                    >{{ item.label }}</button>
                </SidebarFloatingMenu>
              </div>
              <TransitionGroup
                v-show="!isGroupCollapsed(String(grp.id || ''))"
                name="sidebar-reorder"
                tag="div"
                class="sidebar-list sidebar-list--group-characters"
              >
                <div
                  v-for="char in getRenderedCharactersByGroup(String(grp.id || ''))"
                  :key="String(char.id || char.name || '')"
                  class="sidebar-item sidebar-interaction-row"
                  :class="{
                    active: isContactActive('char', String(char.id || '')),
                    'sidebar-item--grouped': true,
                    'sidebar-item--selected': isContactSelectionVisible('char', String(char.id || '')),
                    'sidebar-item--selection-exiting': isContactSelectionExiting('char', String(char.id || '')),
                    'sidebar-item--selection-fading': isContactSelectionFading('char', String(char.id || '')),
                    'sidebar-interaction-dragging': isContactPointerDraggingItem('char', String(char.id || '')),
                    'sidebar-interaction-drop-target': isContactItemDropTarget('char', String(char.id || '')),
                    'sidebar-interaction-drop-target--before': isContactItemDropTargetBefore('char', String(char.id || '')),
                    'sidebar-interaction-drop-target--after': isContactItemDropTargetAfter('char', String(char.id || '')),
                    'sidebar-interaction-preview-shift': isContactItemDropTarget('char', String(char.id || '')),
                    'sidebar-item--dragging': isContactPointerDraggingItem('char', String(char.id || '')),
                    'sidebar-item--drop-target': isContactItemDropTarget('char', String(char.id || '')),
                    'sidebar-item--selected-prev': hasContactMergedSelectionNeighbor('char', String(char.id || ''), -1),
                    'sidebar-item--selected-next': hasContactMergedSelectionNeighbor('char', String(char.id || ''), 1),
                    'sidebar-item--preview-shift': isContactItemDropTarget('char', String(char.id || ''))
                  }"
                  :data-multi-select-id="getContactSelectionId('char', String(char.id || ''))"
                  data-contact-kind="char"
                  :data-contact-id="String(char.id || '')"
                  :data-contact-group-id="String(grp.id || 'default')"
                  @selectstart.prevent
                  @click="handleContactClick('char', String(char.id || ''), $event)"
                  @contextmenu.prevent.stop="openContactContextMenu('char', String(char.id || ''), $event)"
                  @pointerdown="handleContactPointerDown('char', String(char.id || ''), $event)"
                  @pointermove="contactMultiSelect.handlePointerMove($event)"
                  @pointerup="contactMultiSelect.handlePointerEnd($event)"
                  @pointercancel="contactMultiSelect.handlePointerEnd($event)"
                >
                  <span class="sidebar-item-selection-indicator sidebar-selection-indicator" :class="{ active: isContactSelected('char', String(char.id || '')) }" aria-hidden="true"></span>
                  <div class="sidebar-item-avatar">
                    <img v-if="getCharAvatarById(char)" :src="getCharAvatarById(char)" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                    <span v-else>{{ char.emoji || '👤' }}</span>
                  </div>
                  <div class="sidebar-item-info">
                    <div class="sidebar-item-title-row">
                      <span class="sidebar-item-name">{{ char.name }}</span>
                      <span class="sidebar-item-meta sidebar-item-meta--inline">{{ char.gender }} {{ char.age }}</span>
                    </div>
                  </div>
                  <span class="sidebar-row-actions">
                    <button
                      v-if="shouldShowContactMenuTrigger('char', String(char.id || ''))"
                      type="button"
                      class="sidebar-row-action"
                      @mousedown.stop
                      @pointerdown.stop
                      @click.stop="toggleContactMenu('char', String(char.id || ''), $event)"
                    >
                      <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="12" cy="19" r="1.5"/>
                      </svg>
                    </button>
                  </span>
                  <SidebarFloatingMenu
                    :open="isContactMenuOpen('char', String(char.id || ''))"
                    menu-class="sidebar-row-menu sidebar-row-menu--nested"
                    :menu-style="floatingMenuStyle"
                    viewport-overflow="visible"
                  >
                    <template v-for="item in getContactMenuItems('char', String(char.id || ''))" :key="item.key">
                      <div v-if="item.dividerBefore" class="sidebar-row-menu-divider"></div>
                      <div class="sidebar-row-menu-entry" :class="{ 'sidebar-row-menu-entry--nested': item.children?.length }">
                        <button
                          type="button"
                          class="sidebar-row-menu-item"
                          :class="{ 'sidebar-row-menu-item--danger': item.danger, 'sidebar-row-menu-item--has-children': item.children?.length }"
                          :disabled="item.disabled"
                          @mousedown.stop
                          @pointerdown.stop
                          @click.stop="!item.children?.length && runContactMenuAction(item.action, 'char', String(char.id || ''))"
                        >
                          <span>{{ item.label }}</span>
                          <span v-if="item.children?.length" class="sidebar-row-menu-caret">›</span>
                        </button>
                        <div v-if="item.children?.length" class="sidebar-row-submenu">
                          <div
                            v-for="child in item.children"
                            :key="child.key"
                            class="sidebar-row-menu-entry"
                            :class="{ 'sidebar-row-menu-entry--nested': child.children?.length }"
                          >
                            <button
                              type="button"
                              class="sidebar-row-menu-item"
                              :class="{ 'sidebar-row-menu-item--danger': child.danger, 'sidebar-row-menu-item--has-children': child.children?.length }"
                              :disabled="child.disabled"
                              @mousedown.stop
                              @pointerdown.stop
                              @click.stop="!child.children?.length && runContactMenuAction(child.action, 'char', String(char.id || ''))"
                            >
                              <span>{{ child.label }}</span>
                              <span v-if="child.children?.length" class="sidebar-row-menu-caret">›</span>
                            </button>
                            <div v-if="child.children?.length" class="sidebar-row-submenu sidebar-row-submenu--level-3">
                              <button
                                v-for="grandchild in child.children"
                                :key="grandchild.key"
                                type="button"
                                class="sidebar-row-menu-item"
                                :class="{ 'sidebar-row-menu-item--danger': grandchild.danger }"
                                :disabled="grandchild.disabled"
                                @mousedown.stop
                                @pointerdown.stop
                                @click.stop="runContactMenuAction(grandchild.action, 'char', String(char.id || ''))"
                              >
                                <span>{{ grandchild.label }}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </SidebarFloatingMenu>
                </div>
              </TransitionGroup>
            </div>
                <div
                  v-for="char in renderedUngroupedCharacters"
                  :key="`ungrouped-char-${String(char.id || char.name || '')}`"
                  class="sidebar-item sidebar-interaction-row"
                  :class="{
                    active: isContactActive('char', String(char.id || '')),
                    'sidebar-item--selected': isContactSelectionVisible('char', String(char.id || '')),
                    'sidebar-item--selection-exiting': isContactSelectionExiting('char', String(char.id || '')),
                    'sidebar-item--selection-fading': isContactSelectionFading('char', String(char.id || '')),
                    'sidebar-interaction-dragging': isContactPointerDraggingItem('char', String(char.id || '')),
                    'sidebar-interaction-drop-target': isContactItemDropTarget('char', String(char.id || '')),
                    'sidebar-interaction-drop-target--before': isContactItemDropTargetBefore('char', String(char.id || '')),
                    'sidebar-interaction-drop-target--after': isContactItemDropTargetAfter('char', String(char.id || '')),
                    'sidebar-interaction-preview-shift': isContactItemDropTarget('char', String(char.id || '')),
                    'sidebar-item--dragging': isContactPointerDraggingItem('char', String(char.id || '')),
                    'sidebar-item--drop-target': isContactItemDropTarget('char', String(char.id || '')),
                    'sidebar-item--selected-prev': hasContactMergedSelectionNeighbor('char', String(char.id || ''), -1),
                    'sidebar-item--selected-next': hasContactMergedSelectionNeighbor('char', String(char.id || ''), 1),
                    'sidebar-item--preview-shift': isContactItemDropTarget('char', String(char.id || ''))
                  }"
                  :data-multi-select-id="getContactSelectionId('char', String(char.id || ''))"
                  data-contact-kind="char"
                  :data-contact-id="String(char.id || '')"
                  data-contact-group-id="default"
                  @selectstart.prevent
                  @click="handleContactClick('char', String(char.id || ''), $event)"
                  @contextmenu.prevent.stop="openContactContextMenu('char', String(char.id || ''), $event)"
                  @pointerdown="handleContactPointerDown('char', String(char.id || ''), $event)"
                  @pointermove="contactMultiSelect.handlePointerMove($event)"
                  @pointerup="contactMultiSelect.handlePointerEnd($event)"
                  @pointercancel="contactMultiSelect.handlePointerEnd($event)"
                >
                  <span class="sidebar-item-selection-indicator sidebar-selection-indicator" :class="{ active: isContactSelected('char', String(char.id || '')) }" aria-hidden="true"></span>
                  <div class="sidebar-item-avatar">
                    <img v-if="getCharAvatarById(char)" :src="getCharAvatarById(char)" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                    <span v-else>{{ char.emoji || '👤' }}</span>
                  </div>
                  <div class="sidebar-item-info">
                    <div class="sidebar-item-title-row">
                      <span class="sidebar-item-name">{{ char.name }}</span>
                      <span class="sidebar-item-meta sidebar-item-meta--inline">{{ char.gender }} {{ char.age }}</span>
                    </div>
                  </div>
                  <span class="sidebar-row-actions">
                    <button
                      v-if="shouldShowContactMenuTrigger('char', String(char.id || ''))"
                      type="button"
                      class="sidebar-row-action"
                      @mousedown.stop
                      @pointerdown.stop
                      @click.stop="toggleContactMenu('char', String(char.id || ''), $event)"
                    >
                      <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="12" cy="19" r="1.5"/>
                      </svg>
                    </button>
                  </span>
                  <SidebarFloatingMenu
                    :open="isContactMenuOpen('char', String(char.id || ''))"
                    menu-class="sidebar-row-menu sidebar-row-menu--nested"
                    :menu-style="floatingMenuStyle"
                    viewport-overflow="visible"
                  >
                    <template v-for="item in getContactMenuItems('char', String(char.id || ''))" :key="item.key">
                      <div v-if="item.dividerBefore" class="sidebar-row-menu-divider"></div>
                      <div class="sidebar-row-menu-entry" :class="{ 'sidebar-row-menu-entry--nested': item.children?.length }">
                        <button
                          type="button"
                          class="sidebar-row-menu-item"
                          :class="{ 'sidebar-row-menu-item--danger': item.danger, 'sidebar-row-menu-item--has-children': item.children?.length }"
                          :disabled="item.disabled"
                          @mousedown.stop
                          @pointerdown.stop
                          @click.stop="!item.children?.length && runContactMenuAction(item.action, 'char', String(char.id || ''))"
                        >
                          <span>{{ item.label }}</span>
                          <span v-if="item.children?.length" class="sidebar-row-menu-caret">›</span>
                        </button>
                        <div v-if="item.children?.length" class="sidebar-row-submenu">
                          <div
                            v-for="child in item.children"
                            :key="child.key"
                            class="sidebar-row-menu-entry"
                            :class="{ 'sidebar-row-menu-entry--nested': child.children?.length }"
                          >
                            <button
                              type="button"
                              class="sidebar-row-menu-item"
                              :class="{ 'sidebar-row-menu-item--danger': child.danger, 'sidebar-row-menu-item--has-children': child.children?.length }"
                              :disabled="child.disabled"
                              @mousedown.stop
                              @pointerdown.stop
                              @click.stop="!child.children?.length && runContactMenuAction(child.action, 'char', String(char.id || ''))"
                            >
                              <span>{{ child.label }}</span>
                              <span v-if="child.children?.length" class="sidebar-row-menu-caret">›</span>
                            </button>
                            <div v-if="child.children?.length" class="sidebar-row-submenu sidebar-row-submenu--level-3">
                              <button
                                v-for="grandchild in child.children"
                                :key="grandchild.key"
                                type="button"
                                class="sidebar-row-menu-item"
                                :class="{ 'sidebar-row-menu-item--danger': grandchild.danger }"
                                :disabled="grandchild.disabled"
                                @mousedown.stop
                                @pointerdown.stop
                                @click.stop="runContactMenuAction(grandchild.action, 'char', String(char.id || ''))"
                              >
                                <span>{{ grandchild.label }}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </SidebarFloatingMenu>
                </div>

              </TransitionGroup>
            </div>
            <div v-if="shouldShowContactSectionSlider('char')" class="sidebar-section-slider" aria-hidden="true">
              <div
                class="sidebar-section-slider-track"
                @pointerdown.prevent="handleContactSectionSliderPointerDown('char', $event)"
              >
                <button
                  type="button"
                  class="sidebar-section-slider-thumb"
                  :style="{ top: `${contactSectionScrollState.char.ratio}%` }"
                  @pointerdown.prevent.stop="handleContactSectionSliderPointerDown('char', $event)"
                ></button>
              </div>
            </div>
          </div>
        </div>
        <button
          v-if="false"
          type="button"
          class="sidebar-section-resizer"
          title="拖动调整角色和群众角色高度"
          @pointerdown.prevent="handleContactSectionResizePointerDown('char-crowd', $event)"
        ></button>

        <button
          v-if="shouldShowLegacyChatContactSections && !contactDragSortEnabled"
          type="button"
          class="sidebar-section-resizer"
          title="拖动调整角色和群聊高度"
          @pointerdown.prevent="handleContactSectionResizePointerDown('char-group', $event)"
        ></button>

        <div v-if="shouldShowLegacyChatContactSections" class="sidebar-section" :style="getContactSectionLayoutStyle('group')" @wheel.capture.prevent.stop="handleContactSectionWheel('group', $event)">
          <div class="sidebar-section-title">
            <div class="sidebar-section-heading">
              <span>{{ sidebarTexts.groupSection }}</span>
              <span class="sidebar-section-count">{{ groups.length }}</span>
            </div>
            <div class="sidebar-section-actions">
                <button
                  type="button"
                  class="btn btn-small icon-btn"
                  :class="{ active: isContactDragActive('group') }"
                  :title="isContactDragActive('group') ? '群聊拖动已开启' : '开启群聊拖动'"
                  @click="toggleContactItemDragMode('group')"
                >
                <svg v-if="contactDragSortEnabled" class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="19" cy="5" r="1"/>
                  <circle cx="5" cy="5" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                  <circle cx="19" cy="19" r="1"/>
                  <circle cx="5" cy="19" r="1"/>
                </svg>
                <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="19" cy="5" r="1"/>
                  <circle cx="5" cy="5" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                  <circle cx="19" cy="19" r="1"/>
                  <circle cx="5" cy="19" r="1"/>
                  <path d="M4 20 20 4"/>
                </svg>
              </button>
              <button type="button" class="btn btn-small icon-btn" title="撤回" @mousedown.stop @pointerdown.stop @click.stop="$emit('undo-contact-ops')">
                <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 14 4 9l5-5"/>
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
                </svg>
              </button>
              <button type="button" class="btn btn-small icon-btn" title="重做" @mousedown.stop @pointerdown.stop @click.stop="$emit('redo-contact-ops')">
                <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m15 14 5-5-5-5"/>
                  <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>
                </svg>
              </button>
              <button type="button" class="btn btn-small icon-btn" :title="groupContactGroupToggleTitle" :aria-label="groupContactGroupToggleTitle" :disabled="!renderedGroupContactGroupIds.length" @mousedown.stop @pointerdown.stop @click.stop="toggleAllGroupContactGroups">
                <svg v-if="groupContactGroupsAllCollapsed" class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 15 5 5 5-5"/>
                  <path d="m7 9 5-5 5 5"/>
                </svg>
                <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 20 5-5 5 5"/>
                  <path d="m7 4 5 5 5-5"/>
                </svg>
              </button>
              <button type="button" class="btn btn-small icon-btn" title="新建组别" @mousedown.stop @pointerdown.stop @click.stop="$emit('open-char-group-manager', 'group')">
                <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M12 9v6"/>
                  <path d="M9 12h6"/>
                </svg>
              </button>
              <button type="button" class="btn btn-small sidebar-inline-plus" title="新建元素" @mousedown.stop @pointerdown.stop @click.stop="$emit('open-create-group')">+</button>
            </div>
          </div>
          <div class="sidebar-section-body">
            <div
              class="sidebar-section-scroll"
              :ref="(el) => setContactSectionScrollRef('group', el)"
              @scroll="handleContactSectionScroll('group')"
            >
              <TransitionGroup name="sidebar-reorder" tag="div" class="sidebar-list">
                <div v-for="grp in getRenderedNamedGroupsForKind('group')" :key="`group-${String(grp.id || grp.name || '')}`">
              <div
                class="sidebar-subgroup-header sidebar-interaction-header"
                :class="{
                  'sidebar-subgroup-header--drag-mode': isContactGroupSortActive('group'),
                  'sidebar-subgroup-header--selected': isContactGroupSelected(String(grp.id || '')),
                  'sidebar-subgroup-header--selected-prev': hasAdjacentSelectedContactGroup('group', String(grp.id || ''), -1),
                  'sidebar-subgroup-header--selected-next': hasAdjacentSelectedContactGroup('group', String(grp.id || ''), 1),
                  'sidebar-interaction-preview-shift': contactGroupDrag.dropTargetId.value === String(grp.id || ''),
                  'sidebar-interaction-dragging': isContactGroupHeaderDragging(String(grp.id || '')),
                  'sidebar-interaction-drop-target': isContactGroupHeaderDropTarget(String(grp.id || '')),
                  'sidebar-interaction-drop-target--before': isContactGroupHeaderDropTargetBefore(String(grp.id || '')),
                  'sidebar-interaction-drop-target--after': isContactGroupHeaderDropTargetAfter(String(grp.id || '')),
                  'sidebar-subgroup-header--preview-shift': contactGroupDrag.dropTargetId.value === String(grp.id || ''),
                  'sidebar-subgroup-header--dragging': isContactGroupHeaderDragging(String(grp.id || '')),
                  'sidebar-subgroup-header--drop-target': isContactGroupHeaderDropTarget(String(grp.id || ''))
                }"
                data-contact-group-header="true"
                data-contact-group-kind="group"
                :data-character-group-id="String(grp.id || '')"
                :data-doc-drag-id="String(grp.id || '')"
                :data-multi-select-id="isContactGroupSortActive('group') ? String(grp.id || '') : undefined"
                @click="handleContactGroupHeaderClick('group', String(grp.id || ''), $event)"
                @dblclick.stop="handleContactGroupHeaderDoubleClick('group', String(grp.id || ''))"
                @pointerdown="handleContactGroupHeaderPointerDown('group', String(grp.id || ''), $event)"
                @pointermove="handleContactGroupHeaderPointerMove($event)"
                @pointerup="handleContactGroupHeaderPointerEnd('group', String(grp.id || ''), $event)"
                @pointercancel="handleContactGroupHeaderPointerEnd('group', String(grp.id || ''), $event)"
                @selectstart.prevent
              >
                <svg class="sidebar-subgroup-toggle" :style="{ transform: isGroupCollapsed(String(grp.id || '')) ? 'rotate(0deg)' : 'rotate(90deg)' }" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
                <span class="sidebar-subgroup-name">{{ grp.name }}</span>
                <span class="sidebar-subgroup-count">{{ getRenderedEntitiesByGroup('group', String(grp.id || '')).length }}</span>
                <span class="sidebar-row-actions sidebar-row-actions--header">
                  <button
                    v-if="shouldShowContactGroupMenuTrigger('group')"
                    type="button"
                    class="sidebar-row-action"
                    title="分组操作"
                    @mousedown.stop
                    @pointerdown.stop
                    @click.stop="toggleCharGroupMenu('group', String(grp.id || ''), $event)"
                  >
                    <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.5"/>
                      <circle cx="12" cy="12" r="1.5"/>
                      <circle cx="12" cy="19" r="1.5"/>
                    </svg>
                  </button>
                </span>
                <SidebarFloatingMenu :open="isCharGroupMenuOpen('group', String(grp.id || ''))" menu-class="sidebar-row-menu" :menu-style="floatingMenuStyle">
                    <button
                      v-for="item in getCharGroupMenuItems('group')"
                      :key="`group-group-${item.key}`"
                      type="button"
                      class="sidebar-row-menu-item"
                      :class="{ danger: item.danger }"
                      @mousedown.stop
                      @pointerdown.stop
                      @click.stop="runCharGroupMenuAction(item.action, 'group', String(grp.id || ''))"
                    >{{ item.label }}</button>
                </SidebarFloatingMenu>
              </div>
              <TransitionGroup
                v-show="!isGroupCollapsed(String(grp.id || ''))"
                name="sidebar-reorder"
                tag="div"
                class="sidebar-list"
              >
                <div
                  v-for="group in getRenderedEntitiesByGroup('group', String(grp.id || ''))"
                  :key="`group-item-${String(group.id || group.name || '')}`"
                  class="sidebar-item sidebar-interaction-row"
                  :class="{
                    active: currentTarget === String(group.id || ''),
                    'sidebar-item--grouped': true,
                    'sidebar-item--selected': isContactSelectionVisible('group', String(group.id || '')),
                    'sidebar-item--selection-exiting': isContactSelectionExiting('group', String(group.id || '')),
                    'sidebar-item--selection-fading': isContactSelectionFading('group', String(group.id || '')),
                    'sidebar-interaction-dragging': isContactPointerDraggingItem('group', String(group.id || '')),
                    'sidebar-interaction-drop-target': isContactItemDropTarget('group', String(group.id || '')),
                    'sidebar-interaction-drop-target--before': isContactItemDropTargetBefore('group', String(group.id || '')),
                    'sidebar-interaction-drop-target--after': isContactItemDropTargetAfter('group', String(group.id || '')),
                    'sidebar-interaction-preview-shift': isContactItemDropTarget('group', String(group.id || '')),
                    'sidebar-item--dragging': isContactPointerDraggingItem('group', String(group.id || '')),
                    'sidebar-item--drop-target': isContactItemDropTarget('group', String(group.id || '')),
                    'sidebar-item--selected-prev': hasContactMergedSelectionNeighbor('group', String(group.id || ''), -1),
                    'sidebar-item--selected-next': hasContactMergedSelectionNeighbor('group', String(group.id || ''), 1),
                    'sidebar-item--preview-shift': isContactItemDropTarget('group', String(group.id || ''))
                  }"
                  :data-multi-select-id="getContactSelectionId('group', String(group.id || ''))"
                  data-contact-kind="group"
                  :data-contact-id="String(group.id || '')"
                  @selectstart.prevent
                  @click="handleContactClick('group', String(group.id || ''), $event)"
                  @pointerdown="handleContactPointerDown('group', String(group.id || ''), $event)"
                  @pointermove="contactMultiSelect.handlePointerMove($event)"
                  @pointerup="contactMultiSelect.handlePointerEnd($event)"
                  @pointercancel="contactMultiSelect.handlePointerEnd($event)"
                >
                  <span class="sidebar-item-selection-indicator sidebar-selection-indicator" :class="{ active: isContactSelected('group', String(group.id || '')) }" aria-hidden="true"></span>
                  <div class="sidebar-item-avatar">
                    <img v-if="getAvatarPath(group)" :src="normalizeAvatarUrl(getAvatarPath(group))" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                    <span v-else-if="String((group as { emoji?: unknown }).emoji || '')">{{ String((group as { emoji?: unknown }).emoji || '') }}</span>
                    <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/><path d="M8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/><path d="M8 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/><path d="M2 20v-1a3 3 0 0 1 3-3h3"/></svg>
                  </div>
                  <div class="sidebar-item-info">
                    <div class="sidebar-item-title-row">
                      <span class="sidebar-item-name">{{ group.name }}</span>
                      <span class="sidebar-item-meta sidebar-item-meta--inline">{{ getMemberCount(group) }}人</span>
                    </div>
                  </div>
                  <span class="sidebar-row-actions">
                    <button
                      v-if="shouldShowContactMenuTrigger('group', String(group.id || ''))"
                      type="button"
                      class="sidebar-row-action"
                      @mousedown.stop
                      @pointerdown.stop
                      @click.stop="toggleContactMenu('group', String(group.id || ''), $event)"
                    >
                      <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="12" cy="19" r="1.5"/>
                      </svg>
                    </button>
                  </span>
                  <SidebarFloatingMenu :open="isContactMenuOpen('group', String(group.id || ''))" menu-class="sidebar-row-menu" :menu-style="floatingMenuStyle">
                      <button v-for="item in getContactMenuItems('group', String(group.id || ''))" :key="item.key" type="button" class="sidebar-row-menu-item" @mousedown.stop @pointerdown.stop @click.stop="runContactMenuAction(item.action, 'group', String(group.id || ''))">{{ item.label }}</button>
                  </SidebarFloatingMenu>
                </div>
              </TransitionGroup>
            </div>
            <TransitionGroup key="ungrouped-group-list" name="sidebar-reorder" tag="div" class="sidebar-list">
              <div
                v-for="group in renderedUngroupedGroups"
                :key="`ungrouped-group-${String(group.id || group.name || '')}`"
              class="sidebar-item sidebar-interaction-row"
              :class="{
                active: currentTarget === String(group.id || ''),
                'sidebar-item--selected': isContactSelectionVisible('group', String(group.id || '')),
                'sidebar-item--selection-exiting': isContactSelectionExiting('group', String(group.id || '')),
                'sidebar-item--selection-fading': isContactSelectionFading('group', String(group.id || '')),
                'sidebar-interaction-dragging': isContactPointerDraggingItem('group', String(group.id || '')),
                'sidebar-interaction-drop-target': isContactItemDropTarget('group', String(group.id || '')),
                'sidebar-interaction-drop-target--before': isContactItemDropTargetBefore('group', String(group.id || '')),
                'sidebar-interaction-drop-target--after': isContactItemDropTargetAfter('group', String(group.id || '')),
                'sidebar-interaction-preview-shift': isContactItemDropTarget('group', String(group.id || '')),
                'sidebar-item--dragging': isContactPointerDraggingItem('group', String(group.id || '')),
                'sidebar-item--drop-target': isContactItemDropTarget('group', String(group.id || '')),
                'sidebar-item--selected-prev': hasContactMergedSelectionNeighbor('group', String(group.id || ''), -1),
                  'sidebar-item--selected-next': hasContactMergedSelectionNeighbor('group', String(group.id || ''), 1),
                  'sidebar-item--preview-shift': isContactItemDropTarget('group', String(group.id || ''))
                }"
                :data-multi-select-id="getContactSelectionId('group', String(group.id || ''))"
                data-contact-kind="group"
                :data-contact-id="String(group.id || '')"
                @selectstart.prevent
                @click="handleContactClick('group', String(group.id || ''), $event)"
                @pointerdown="handleContactPointerDown('group', String(group.id || ''), $event)"
                @pointermove="contactMultiSelect.handlePointerMove($event)"
              @pointerup="contactMultiSelect.handlePointerEnd($event)"
              @pointercancel="contactMultiSelect.handlePointerEnd($event)"
            >
              <span class="sidebar-item-selection-indicator sidebar-selection-indicator" :class="{ active: isContactSelected('group', String(group.id || '')) }" aria-hidden="true"></span>
              <div class="sidebar-item-avatar">
                <img v-if="getAvatarPath(group)" :src="normalizeAvatarUrl(getAvatarPath(group))" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                  <span v-else-if="String((group as { emoji?: unknown }).emoji || '')">{{ String((group as { emoji?: unknown }).emoji || '') }}</span>
                  <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/><path d="M8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/><path d="M8 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/><path d="M2 20v-1a3 3 0 0 1 3-3h3"/></svg>
                </div>
                <div class="sidebar-item-info">
                  <div class="sidebar-item-title-row">
                    <span class="sidebar-item-name">{{ group.name }}</span>
                    <span class="sidebar-item-meta sidebar-item-meta--inline">{{ getMemberCount(group) }}人</span>
                  </div>
                </div>
                <span class="sidebar-row-actions">
                  <button
                    v-if="shouldShowContactMenuTrigger('group', String(group.id || ''))"
                    type="button"
                    class="sidebar-row-action"
                    @mousedown.stop
                    @pointerdown.stop
                    @click.stop="toggleContactMenu('group', String(group.id || ''), $event)"
                  >
                    <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.5"/>
                      <circle cx="12" cy="12" r="1.5"/>
                      <circle cx="12" cy="19" r="1.5"/>
                    </svg>
                  </button>
                </span>
                <SidebarFloatingMenu :open="isContactMenuOpen('group', String(group.id || ''))" menu-class="sidebar-row-menu" :menu-style="floatingMenuStyle">
                    <button v-for="item in getContactMenuItems('group', String(group.id || ''))" :key="item.key" type="button" class="sidebar-row-menu-item" @mousedown.stop @pointerdown.stop @click.stop="runContactMenuAction(item.action, 'group', String(group.id || ''))">{{ item.label }}</button>
                </SidebarFloatingMenu>
              </div>
            </TransitionGroup>
              </TransitionGroup>
            </div>
            <div v-if="shouldShowContactSectionSlider('group')" class="sidebar-section-slider" aria-hidden="true">
              <div
                class="sidebar-section-slider-track"
                @pointerdown.prevent="handleContactSectionSliderPointerDown('group', $event)"
              >
                <button
                  type="button"
                  class="sidebar-section-slider-thumb"
                  :style="{ top: `${contactSectionScrollState.group.ratio}%` }"
                  @pointerdown.prevent.stop="handleContactSectionSliderPointerDown('group', $event)"
                ></button>
              </div>
            </div>
          </div>
        </div>
        <button
          v-if="shouldShowLegacyChatContactSections && !contactDragSortEnabled"
          type="button"
          class="sidebar-section-resizer"
          title="拖动调整群聊和群众角色高度"
          @pointerdown.prevent="handleContactSectionResizePointerDown('group-crowd', $event)"
        ></button>

      </div>

      <div v-else class="chat-sidebar-content chat-sidebar-content--docs">
        <div class="doc-sidebar-tabs">
          <button
            v-for="tab in visibleDocSidebarTabs"
            :key="tab.id"
            type="button"
            class="doc-sidebar-tab"
            :class="{ active: activeDocTab === tab.id }"
            @click="handleDocTabClick(tab.id)"
          >{{ t(tab.labelKey) }}</button>
          <button
            type="button"
            class="doc-sidebar-tabs-close"
            @click="$emit('update:sidebar-open', false)"
            :title="sidebarTexts.closeContactsTitle"
            :aria-label="sidebarTexts.closeContactsTitle"
          >
            <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12"/>
              <path d="M18 6L6 18"/>
            </svg>
          </button>
        </div>

        <template v-if="activeDocTab === 'worldbook'">
          <div class="sidebar-section doc-sidebar-sone-section">
            <div class="doc-sidebar-tree-toolbar" aria-label="世界树工具">
              <div class="doc-sidebar-tree-toolbar__surface">
                <button type="button" class="btn btn-small icon-btn" title="撤回" aria-label="撤回" @mousedown.stop @pointerdown.stop @click.stop="$emit('doc-undo-worldbook-ops')">
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 14 4 9l5-5"/>
                    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
                  </svg>
                </button>
                <button type="button" class="btn btn-small icon-btn" title="重做" aria-label="重做" @mousedown.stop @pointerdown.stop @click.stop="$emit('doc-redo-worldbook-ops')">
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 14 5-5-5-5"/>
                    <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>
                  </svg>
                </button>
                <button type="button" class="btn btn-small icon-btn" :title="docWorldbookToggleTitle" :aria-label="docWorldbookToggleTitle" :disabled="!docWorldbookExpandableRowCount" @mousedown.stop @pointerdown.stop @click.stop="toggleAllDocWorldbookRows">
                  <svg v-if="docWorldbookAllExpanded" class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7 20 5-5 5 5"/>
                    <path d="m7 4 5 5 5-5"/>
                  </svg>
                  <svg v-else class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7 15 5 5 5-5"/>
                    <path d="m7 9 5-5 5 5"/>
                  </svg>
                </button>
                <button type="button" class="btn btn-small icon-btn" title="新建枝" aria-label="新建枝" @mousedown.stop @pointerdown.stop @click.stop="$emit('doc-create-section')">
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 10v6"/>
                    <path d="M9 13h6"/>
                    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                  </svg>
                </button>
                <button type="button" class="btn btn-small icon-btn" title="新建桠" aria-label="新建桠" @mousedown.stop @pointerdown.stop @click.stop="$emit('doc-create-page')">
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35"/>
                    <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
                    <path d="M14 19h6"/>
                    <path d="M17 16v6"/>
                  </svg>
                </button>
                <button type="button" class="btn btn-small icon-btn" title="导入世界观导入稿" aria-label="导入世界观导入稿" @mousedown.stop @pointerdown.stop @click.stop="$emit('doc-import-world-draft')">
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                    <path d="M12 18v-6"/>
                    <path d="m15 15-3-3-3 3"/>
                  </svg>
                </button>
              </div>
            </div>
            <div
              class="sidebar-list doc-sidebar-tree doc-sidebar-tree--sone"
              :class="{ 'doc-sidebar-tree--dragging': isDocWorldbookVisualDragging }"
              @contextmenu.prevent
            >
              <SoneTreeRows
                v-if="docWorldbookSoneRows.length"
                :rows="docWorldbookSoneRows"
                :menu-style="floatingMenuStyle"
                @select="handleDocWorldbookSoneSelect"
                @toggle="toggleDocWorldbookSoneRow"
                @menu="toggleDocWorldbookSoneMenu"
                @menu-action="runDocWorldbookSoneMenuAction"
                @row-pointerdown="handleDocWorldbookSonePointerDown"
              />
            </div>
          </div>
        </template>

        <template v-else-if="activeDocTab === 'prompt'">
          <div class="sidebar-section">
            <div class="sidebar-section-title">
              <div class="sidebar-section-heading">
                <span>角色提示词</span>
                <span class="sidebar-section-count">{{ docPromptTotalCount }}</span>
              </div>
              <div class="sidebar-section-actions">
                <button
                  type="button"
                  class="btn btn-small icon-btn"
                  :class="{ active: docPromptDragEnabled }"
                  :title="docPromptDragEnabled ? '提示词拖拽已开启' : '开启提示词拖拽'"
                  @click="$emit('doc-toggle-prompt-drag')"
                >
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 6h8"/>
                    <path d="M8 12h8"/>
                    <path d="M8 18h8"/>
                    <path d="M4 6h.01"/>
                    <path d="M4 12h.01"/>
                    <path d="M4 18h.01"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="btn btn-small icon-btn"
                  :class="{ active: docPromptFilterMode !== 'all' }"
                  title="筛选提示词"
                  @click="toggleDocPromptFilterMenu($event)"
                >
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h16"/>
                    <path d="M7 12h10"/>
                    <path d="M10 18h4"/>
                  </svg>
                </button>
                <SidebarFloatingMenu :open="docPromptFilterMenuOpen" menu-class="sidebar-row-menu" :menu-style="docPromptFilterFloatingMenuStyle" :clamp-to-viewport="true">
                  <button
                    v-for="option in docPromptFilterOptions"
                    :key="option.value"
                    type="button"
                    class="sidebar-row-menu-item"
                    :class="{ active: docPromptFilterMode === option.value }"
                    @mousedown.stop
                    @pointerdown.stop
                    @click.stop="setDocPromptFilter(option.value)"
                  >{{ option.label }}</button>
                </SidebarFloatingMenu>
                <button type="button" class="btn btn-small icon-btn" @click="$emit('doc-open-prompt-create')" title="新建提示词">
                  <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                    <path d="M7 3h7l5 5v11a2 2 0 0 1 -2 2H7a2 2 0 0 1 -2 -2V5a2 2 0 0 1 2 -2z"/>
                    <path d="M12 11v6"/>
                    <path d="M9 14h6"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="sidebar-list doc-sidebar-tree doc-sidebar-tree--flat doc-sidebar-tree--prompt" :class="{ 'doc-sidebar-tree--dragging': docPromptDragEnabled }">
              <template v-for="group in docPromptGroups" :key="group.key">
                <div class="sidebar-subgroup-header doc-sidebar-prompt-group">
                  <span class="sidebar-subgroup-name">{{ group.label }}</span>
                  <span class="sidebar-subgroup-count">{{ group.rows.length }}</span>
                </div>
                <button
                  v-for="row in group.rows"
                  :key="row.id"
                  type="button"
                  class="doc-sidebar-row doc-sidebar-row--prompt"
                  :class="{
                    active: row.active,
                    muted: !row.enabled,
                    'doc-sidebar-row--dragging': docPromptDraggedId === row.id,
                    'doc-sidebar-row--drop-target': docPromptDropTargetId === row.id,
                    'doc-sidebar-row--drop-before': docPromptDropTargetId === row.id && docPromptDropPosition === 'before',
                    'doc-sidebar-row--drop-after': docPromptDropTargetId === row.id && docPromptDropPosition === 'after'
                  }"
                  :draggable="canDragDocPromptRow(row)"
                  @dragstart="startDocPromptDrag(row, $event)"
                  @dragover.prevent="previewDocPromptDrop(row, $event)"
                  @drop.prevent="commitDocPromptDrop(row)"
                  @dragend="clearDocPromptDrag"
                  @click="handleDocPromptRowClick(row)"
                >
                  <span class="doc-sidebar-row-marker sidebar-selection-indicator" :class="{ active: row.active }"></span>
                  <span class="doc-sidebar-prompt-text">
                    <span class="doc-sidebar-row-label">{{ row.title }}</span>
                    <span class="doc-sidebar-prompt-meta">{{ row.meta }}</span>
                  </span>
                </button>
              </template>
            </div>
          </div>
        </template>

        <template v-else-if="activeDocTab === 'relation'">
          <div class="sidebar-section">
            <div class="sidebar-section-title">
              <div class="sidebar-section-heading">
                <span>关系</span>
                <span class="sidebar-section-count">{{ relationSidebarRows.length }}</span>
              </div>
            </div>
            <div class="sidebar-list doc-sidebar-tree doc-sidebar-tree--flat">
              <button
                v-for="row in relationSidebarRows"
                :key="row.id"
                type="button"
                class="doc-sidebar-row doc-sidebar-row--relation"
                :class="{ active: row.active }"
                @click="$emit('doc-set-relation-tab', row.id)"
              >
                <span class="doc-sidebar-row-marker sidebar-selection-indicator" :class="{ active: row.active }"></span>
                <span class="doc-sidebar-row-label">{{ row.label }}</span>
                <span class="doc-sidebar-row-count">{{ row.count }}</span>
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="activeDocTab === 'scenarioPrompt'">
          <div class="sidebar-section doc-scenario-prompt-section">
            <div class="sidebar-section-title">
              <div class="sidebar-section-heading">
                <span>情境提示词</span>
              </div>
              <div
                :id="SCENARIO_PROMPT_ACTIONS_TARGET_ID"
                class="doc-scenario-prompt-actions-host"
                data-scenario-prompt-actions-host="true"
              ></div>
            </div>
            <div
              :id="SCENARIO_PROMPT_TREE_TARGET_ID"
              class="doc-scenario-prompt-tree-host"
              data-scenario-prompt-tree-host="true"
            ></div>
          </div>
        </template>

      </div>

      <button
        v-if="desktopResizable"
        type="button"
        class="chat-sidebar-resize-handle"
        :aria-label="sidebarTexts.resizeSidebarTitle"
        :title="t('sidebar.resizeWidthWithPx', { width: desktopWidth })"
        @pointerdown.prevent="$emit('start-resize', $event)"
      ></button>
    </div>

    <div
      v-if="contactDragGhost.visible"
      class="contact-drag-ghost"
      :class="{ 'contact-drag-ghost--multi': contactDragGhost.count > 1 }"
      :style="contactDragGhost.style"
      aria-hidden="true"
    >
      <div class="contact-drag-ghost__avatar">
        <img v-if="contactDragGhost.avatarUrl" :src="contactDragGhost.avatarUrl" alt="">
        <span v-else-if="contactDragGhost.emoji">{{ contactDragGhost.emoji }}</span>
        <svg v-else-if="contactDragGhost.kind === 'group'" class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/><path d="M8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/><path d="M8 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/><path d="M2 20v-1a3 3 0 0 1 3-3h3"/></svg>
        <span v-else>人</span>
      </div>
      <div class="contact-drag-ghost__body">
        <span class="contact-drag-ghost__name">{{ contactDragGhost.name }}</span>
        <span class="contact-drag-ghost__meta">{{ contactDragGhost.meta }}</span>
      </div>
      <span v-if="contactDragGhost.count > 1" class="contact-drag-ghost__count">{{ contactDragGhost.count }}</span>
    </div>

    <AppMoveDialog
      :open="contactMoveDialog.visible"
      title="移入别的组别"
      path-placeholder="例如 /联系人/角色/第一组"
      :path-input="contactMoveDialog.pathInput"
      :path-hint="selectedContactMoveTarget?.path || ''"
      :selected-id="contactMoveDialog.targetId"
      :source-labels="contactMoveDialog.sourceLabels"
      :rows="contactMoveRows"
      :confirm-disabled="!selectedContactMoveTarget"
      @update:path-input="contactMoveDialog.pathInput = $event"
      @toggle="toggleContactMoveTarget"
      @select="selectContactMoveTarget"
      @jump="jumpToContactMovePath"
      @cancel="closeContactMoveDialog"
      @confirm="confirmContactMoveDialog"
    />

    <div class="chat-nav" :class="{ 'chat-nav--collapsed': !isSidebarVisuallyOpen, 'chat-nav--open': isSidebarVisuallyOpen, 'chat-nav--root-docs': rootNavActiveKey === 'docs' }" aria-hidden="false">
      <div class="chat-nav-brand" :title="t('sidebar.brand')" :aria-label="t('sidebar.brandAria')">
        <LanghuanIcon
          class="chat-nav-brand-icon"
          color="currentColor"
          :stroke-scale="0.88"
        />
      </div>
      <div
        class="chat-nav-primary-stack"
        :class="{ 'chat-nav-primary-stack--motion-ready': rootNavMotionReady }"
        :style="{ '--root-nav-active-index': rootNavActiveIndex }"
      >
        <span class="chat-nav-active-indicator" aria-hidden="true"></span>
        <button
          type="button"
          class="chat-nav-item chat-nav-item--primary chat-nav-item--chat"
          :class="{ active: rootNavActiveKey === 'chat' }"
          data-sidebar-root-view="chat"
          @click="togglePrimaryNav('chat', $event)"
          :title="sidebarTexts.contactsTitle"
          :aria-label="t('sidebar.navContacts')"
        >
          <span class="chat-nav-primary-icon-shell" aria-hidden="true">
            <svg class="chat-nav-primary-icon" viewBox="0 0 24 24">
              <g class="chat-nav-icon-outline">
                <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>
              </g>
            </svg>
          </span>
          <span class="chat-nav-primary-label">{{ t('sidebar.navContacts') }}</span>
        </button>
        <button
          type="button"
          class="chat-nav-item chat-nav-item--primary chat-nav-item--roles"
          :class="{ active: rootNavActiveKey === 'roles' }"
          data-sidebar-root-view="roles"
          @click="togglePrimaryNav('roles', $event)"
          :title="sidebarTexts.rolesTitle"
          :aria-label="t('sidebar.navRoles')"
        >
          <span class="chat-nav-primary-icon-shell" aria-hidden="true">
            <svg class="chat-nav-primary-icon" viewBox="0 0 24 24">
              <g class="chat-nav-icon-outline">
                <circle cx="12" cy="8" r="5"/>
                <path d="M20 21a8 8 0 0 0-16 0"/>
              </g>
            </svg>
          </span>
          <span class="chat-nav-primary-label">{{ t('sidebar.navRoles') }}</span>
        </button>
        <!-- 世界管理入口（世界一等公民 P1 批2）：改为标准 primary 导航按钮，插在角色与文档库之间；
             切进顶层工作区视图 'worlds'，与配置/数据管理同组不展开二级侧栏（见 shouldOpenSidebar）。 -->
        <button
          type="button"
          class="chat-nav-item chat-nav-item--primary chat-nav-item--worlds"
          :class="{ active: rootNavActiveKey === 'worlds' }"
          data-sidebar-root-view="none"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="togglePrimaryNav('worlds', $event)"
          :title="t('sidebar.navWorlds')"
          :aria-label="t('sidebar.navWorlds')"
        >
          <span class="chat-nav-primary-icon-shell" aria-hidden="true">
            <svg class="chat-nav-primary-icon" viewBox="0 0 24 24">
              <g class="chat-nav-icon-outline">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                <path d="M2 12h20"/>
              </g>
            </svg>
          </span>
          <span class="chat-nav-primary-label">{{ t('sidebar.navWorlds') }}</span>
        </button>
        <button
          type="button"
          class="chat-nav-item chat-nav-item--primary"
          :class="{ active: rootNavActiveKey === 'docs' }"
          data-sidebar-root-view="none"
          @click="togglePrimaryNav('docs', $event)"
          :title="sidebarTexts.docsTitle"
          :aria-label="t('sidebar.navDocs')"
        >
          <span class="chat-nav-primary-icon-shell" aria-hidden="true">
            <svg class="chat-nav-primary-icon" viewBox="0 0 24 24">
              <g class="chat-nav-icon-outline">
                <rect width="8" height="18" x="3" y="3" rx="1"/>
                <path d="M7 3v18"/>
                <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"/>
              </g>
            </svg>
          </span>
          <span class="chat-nav-primary-label">{{ t('sidebar.navDocs') }}</span>
        </button>
        <button
          type="button"
          class="chat-nav-item chat-nav-item--primary chat-nav-item--config"
          :class="{ active: rootNavActiveKey === 'config' }"
          data-sidebar-root-view="none"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="togglePrimaryNav('config', $event)"
          :title="t('sidebar.navConfig')"
          :aria-label="t('sidebar.navConfig')"
        >
          <span class="chat-nav-primary-icon-shell" aria-hidden="true">
            <svg class="chat-nav-primary-icon chat-nav-config-icon" viewBox="0 0 24 24">
              <g class="chat-nav-icon-outline">
                <path d="M14 17H5"/>
                <path d="M19 7h-9"/>
                <circle cx="17" cy="17" r="3"/>
                <circle cx="7" cy="7" r="3"/>
              </g>
            </svg>
          </span>
          <span class="chat-nav-primary-label">{{ t('sidebar.navConfig') }}</span>
        </button>
        <button
          type="button"
          class="chat-nav-item chat-nav-item--primary chat-nav-item--data"
          :class="{ active: rootNavActiveKey === 'data' }"
          data-sidebar-root-view="none"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="togglePrimaryNav('data', $event)"
          :title="t('sidebar.navData')"
          :aria-label="t('sidebar.navData')"
        >
          <span class="chat-nav-primary-icon-shell" aria-hidden="true">
            <svg class="chat-nav-primary-icon chat-nav-data-icon" viewBox="0 0 24 24">
              <g class="chat-nav-icon-outline">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
                <path d="M3 12A9 3 0 0 0 21 12"/>
              </g>
            </svg>
          </span>
          <span class="chat-nav-primary-label">{{ t('sidebar.navData') }}</span>
        </button>
      </div>
      <div class="chat-nav-spacer"></div>
      <div class="chat-nav-bottom">
        <button
          type="button"
          class="chat-nav-item chat-nav-star-button"
          title="像素画板"
          aria-label="像素画板"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="openPixelStudio"
        >
          <svg class="line-icon chat-nav-star-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
            <path d="M20 2v4"/>
            <path d="M22 4h-4"/>
            <circle cx="4" cy="20" r="2"/>
          </svg>
        </button>
        <button type="button" class="chat-nav-item" @click.stop="$emit('toggle-dark-mode')" :title="darkMode ? sidebarTexts.lightModeTitle : sidebarTexts.darkModeTitle">
          <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>
        </button>
        <button
          type="button"
          class="chat-nav-avatar-button sidebar-account-trigger"
          @click.stop="toggleAccountMenu($event)"
          @pointerdown.stop.prevent
          @mousedown.stop.prevent
          :title="localWorkspaceMenuTitle"
        >
          <img v-if="userProfile?.avatarPath" :src="userProfile.avatarPath" style="width: 24px; height: 24px; object-fit: cover; border-radius: 50%;">
          <span v-else>{{ userProfile?.emoji || '👤' }}</span>
        </button>
      </div>
    </div>
    <AppModalShell
      :open="chatSessionRenameOpen"
      :title="t('sidebar.renameSessionTitle')"
      size="sm"
      @close="closeChatSessionRename"
    >
      <div class="chat-session-rename">
        <input
          ref="chatSessionRenameInputRef"
          v-model.trim="chatSessionRenameTitle"
          type="text"
          maxlength="15"
          :placeholder="t('sidebar.sessionNamePlaceholder')"
          @keydown.enter.prevent="confirmChatSessionRename"
        >
      </div>
      <template #actions>
        <button type="button" class="btn btn-secondary" @click="closeChatSessionRename">{{ t('common.cancel') }}</button>
        <button type="button" class="btn btn-primary" :disabled="!chatSessionRenameTitle.trim()" @click="confirmChatSessionRename">{{ t('common.save') }}</button>
      </template>
    </AppModalShell>
    <SidebarFloatingMenu
      :open="accountMenuOpen"
      menu-class="sidebar-row-menu sidebar-account-menu"
      :menu-style="accountFloatingMenuStyle"
      :clamp-to-viewport="true"
      viewport-overflow="visible"
    >
      <div class="sidebar-account-panel" @pointerdown.stop @click.stop>
        <div class="sidebar-account-head">
          <div class="sidebar-account-role">本地工作区</div>
          <div class="sidebar-account-email">{{ localWorkspaceDisplayName }}</div>
        </div>
        <button type="button" class="sidebar-row-menu-item" @click.stop="openProfileEditor">
          {{ t('sidebar.editProfile') }}
        </button>
        <button type="button" class="sidebar-row-menu-item" @click.stop="openSettingsModal">
          {{ t('common.settings') }}
        </button>
        <div class="sidebar-account-misc-menu">
          <SoneTreeMenuItems
            :items="accountMiscMenuItems"
            row-id="account:misc"
            @action="openUtilityFromAccountMisc"
          />
        </div>
      </div>
    </SidebarFloatingMenu>
    <AppModalShell
      :open="settingsModalOpen"
      :title="t('common.settings')"
      size="md"
      @close="closeSettingsModal"
    >
      <div class="settings-modal">
        <section class="settings-modal__section">
          <div class="settings-modal__label">{{ t('settings.language') }}</div>
          <p class="settings-modal__hint">{{ t('settings.languageHint') }}</p>
          <LanguageSwitcher />
        </section>
      </div>
    </AppModalShell>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMultiSelect } from '../../composables/useMultiSelect'
import { useSidebarDragModeKit } from '../../composables/useSidebarDragModeKit'
import { getVisibleSidebarElements, resolveBufferedDropTarget, resolveDropTargetFromDragEvent, resolvePointerDropTarget } from '../../composables/useSidebarDropTargetKit'
import { useSidebarMultiDrag } from '../../composables/useSidebarMultiDrag'
import { useSidebarPointerDragKit } from '../../composables/useSidebarPointerDragKit'
import { useSidebarSelectionMenuKit } from '../../composables/useSidebarSelectionMenuKit'
import { useSidebarFloatingMenuKit } from '../../composables/useSidebarFloatingMenuKit'
import { resetWorldbookTreeAutoExpandState, resolveWorldbookTreePointerTarget } from '../../composables/useWorldbookTreeDragKit'
import type {
  WorldbookTreeAutoExpandState,
  WorldbookTreePreviewTarget as WorldbookPreviewTarget,
  WorldbookTreeDragRowKind as WorldbookDragRowKind
} from '../../composables/useWorldbookTreeDragKit'
import AppMoveDialog from '../common/AppMoveDialog.vue'
import AppModalShell from '../common/AppModalShell.vue'
import LanghuanIcon from '../common/LanghuanIcon.vue'
import LanguageSwitcher from '../common/LanguageSwitcher.vue'
import SidebarFloatingMenu from '../common/SidebarFloatingMenu.vue'
import SoneTreeMenuItems, { type SoneTreeNestedMenuItem } from './SoneTreeMenuItems.vue'
import SoneTreeRows, { type SoneTreeMenuItem, type SoneTreeRowView } from './SoneTreeRows.vue'
import '../../styles/sidebarSelectionMenuKit.css'
import {
  buildWorldbookClusterMenuItems,
  buildWorldbookRowMenuItems,
  type DocLibraryWorldbookMenuItem
} from '../../app/docLibraryWorldbookMenu'
import {
  buildCharacterCoreMarkdown,
  buildCharacterCoreMarkdownPrompt,
  getCharacterCoreMarkdownFilename,
  parseCharacterCoreMarkdown,
  type CharacterCoreMarkdownChanges
} from '../../app/characterCoreMarkdownTransfer'
import type { ChatPanelActions, ChatPanelViewModel, ChatSessionRow, ChatUtilityPanelId, NamedEntity, PanelEntityRef, UserProfileViewModel } from '../../types/panelContracts'
import type { AppMoveDialogRow } from '../common/AppMoveDialog.vue'
import { useToast } from '../../composables/useToast'
import {
  DOC_LIBRARY_MODULE_TABS,
  SCENARIO_PROMPT_ACTIONS_TARGET_ID,
  SCENARIO_PROMPT_TREE_TARGET_ID,
  isDocLibraryModuleTabEnabled,
  normalizeVisibleDocLibraryModuleTab
} from '../../app/docLibraryModules'
import type { DocLibraryModuleTab } from '../../app/docLibraryModules'
type DocSidebarRow = {
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
  compilePageIndicator?: SoneTreeRowView['compilePageIndicator']
}
type DocWorldbookSoneRow = SoneTreeRowView & {
  sourceKind: 'cluster' | 'folder' | 'document'
  sourceRow?: DocSidebarRow
}
const { toast } = useToast()
const visibleDocSidebarTabs = computed(() => DOC_LIBRARY_MODULE_TABS.filter((tab) => isDocLibraryModuleTabEnabled(tab.id)))
type DocSidebarCluster = {
  id: string
  label: string
  open: boolean
  count: number
  selected?: boolean
  cutPending?: boolean
  compilePageIndicator?: SoneTreeRowView['compilePageIndicator']
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
type RelationPanelTab = 'predicates' | 'candidates' | 'confirmed'
type DocSidebarState = {
  activeTab: DocLibraryModuleTab
  worldbook: {
    treeVisible: boolean
    clusters: DocSidebarCluster[]
    selectedCount: number
    clipboardMode: '' | 'copy' | 'cut'
    clipboardHasData: boolean
    rows: DocSidebarRow[]
    rowsByCluster: Record<string, DocSidebarRow[]>
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
type ContactKind = 'char' | 'group' | 'crowd'
type RoleGroupFilterNode = {
  id: string
  groupId: string
  label: string
  count: number
  children: RoleGroupFilterNode[]
}
type ContactSectionScrollMetrics = {
  max: number
  ratio: number
  active: boolean
}
type ContactMoveDialogState = {
  visible: boolean
  kind: 'char' | 'group' | 'crowd'
  sourceItems: Array<{ kind: 'char' | 'group' | 'crowd'; id: string }>
  sourceLabels: string[]
  targetId: string
  pathInput: string
}
type ContactDragGhostState = {
  visible: boolean
  kind: ContactKind | ''
  name: string
  meta: string
  emoji: string
  avatarUrl: string
  count: number
  style: Record<string, string>
}
type ChatSessionMenuItem = {
  key: string
  label: string
  action: string
  disabled?: boolean
  danger?: boolean
}
type DocWorldbookMenuItem = DocLibraryWorldbookMenuItem

const { t } = useI18n()

const sidebarTexts = computed(() => ({
  contactsTitle: t('sidebar.navContacts'),
  rolesTitle: t('sidebar.navRoles'),
  docsTitle: t('sidebar.navDocs'),
  closeContactsTitle: t('sidebar.closeContacts'),
  characterSection: t('sidebar.navRoles'),
  manageGroupsTitle: t('sidebar.manageGroups'),
  addCharacterTitle: t('sidebar.addCharacter'),
  groupSection: t('sidebar.sectionGroup'),
  createGroupTitle: t('sidebar.createGroup'),
  lightModeTitle: t('sidebar.lightMode'),
  darkModeTitle: t('sidebar.darkMode'),
  chatHistoryTitle: t('sidebar.chatHistory'),
  myProfileTitle: t('sidebar.myProfile'),
  resizeSidebarTitle: t('sidebar.resizeWidth')
}))

function normalizeAvatarUrl(path?: string | null): string {
  if (!path) return ''
  const trimmed = String(path).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return '/' + trimmed.replace(/^\/+/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const props = defineProps<{
  sidebarOpen: boolean
  workspacePrimaryView: 'chat' | 'roles' | 'docs' | 'config' | 'data' | 'worlds'
  /** 二级侧栏实际展示的视图（2026-07-07 hover 预览）：非钉住 hover 另一根图标时为预览视图；
   *  缺省/其余情形等于 workspacePrimaryView。只影响侧栏内容渲染，不动根导航选中态。 */
  desktopDisplayView?: 'chat' | 'roles' | 'docs' | 'config' | 'data' | 'worlds'
  desktopWidth: number
  desktopResizable: boolean
  desktopSidebarStyle: Record<string, string>
  desktopHoverOpen?: boolean
  desktopVisualPresent?: boolean
  desktopSidebarLeaving?: boolean
  desktopFloatingMode?: boolean
  desktopSidebarPinned?: boolean
  touchMode?: boolean
  collapsedGroups: Record<string, boolean>
  characters: ChatPanelViewModel['characters']
  characterGroups: ChatPanelViewModel['characterGroups']
  groups: ChatPanelViewModel['groups']
  crowds: ChatPanelViewModel['crowds']
  chatSessionRows?: ChatSessionRow[]
  activeSessionId?: string
  userProfile: UserProfileViewModel
  currentTarget: string
  darkMode: boolean
  activeUtilityPanel?: ChatUtilityPanelId | ''
  canUseLocalTools?: boolean
  openChatSessionCreator?: ChatPanelActions['openChatSessionCreator']
  renameChatSession?: ChatPanelActions['renameChatSession']
  deleteChatSession?: ChatPanelActions['deleteChatSession']
  deleteChatSessions?: ChatPanelActions['deleteChatSessions']
  archiveChatSession?: ChatPanelActions['archiveChatSession']
  getCharactersByGroup: ChatPanelActions['getCharactersByGroup']
  getCharAvatarById: (char: NamedEntity | PanelEntityRef) => string
  docSidebarState?: DocSidebarState | null
  activeRoleUnitId?: string
}>()

const rawSidebarVisuallyOpen = computed(() => (
  props.desktopFloatingMode && props.workspacePrimaryView !== 'docs'
    ? Boolean(props.desktopHoverOpen)
    : props.sidebarOpen
))

const isSidebarVisuallyOpen = computed(() => (
  Boolean(props.desktopVisualPresent) || rawSidebarVisuallyOpen.value
))
const isTouchMode = computed(() => Boolean(props.touchMode))
// 侧栏内容视图：hover 预览优先（父层传 desktopDisplayView），内容分支与联系人行为都跟它走。
const sidebarContentView = computed(() => props.desktopDisplayView || props.workspacePrimaryView)
const isRolesView = computed(() => sidebarContentView.value === 'roles')
const rootNavMotionReady = ref(false)
// 根导航选中态跟随实际展示视图（2026-07-07 用户拍板）：hover 预览时选中块随预览滑走，与二级侧栏内容保持一致；
// 预览结束（收起/钉住/点击跟进）sidebarContentView 回落，选中块自动滑回当前工作区视图。
const rootNavActiveKey = computed<'chat' | 'roles' | 'docs' | 'config' | 'data' | 'worlds'>(() => sidebarContentView.value)
const rootNavActiveIndex = computed(() => {
  switch (rootNavActiveKey.value) {
    case 'roles':
      return 1
    case 'worlds':
      return 2
    case 'docs':
      return 3
    case 'config':
      return 4
    case 'data':
      return 5
    default:
      return 0
  }
})
const shouldShowLegacyChatContactSections = computed(() => false)
const chatSessionSearch = ref('')
const chatSessionFilter = ref<'recent' | 'crowd' | 'archived'>('recent')
const chatSessionFilterMenuOpen = ref(false)
const roleCharacterSearch = ref('')
const selectedRoleGroupFilterId = ref('all')
const roleGroupFilterMenuOpen = ref(false)
const activeRoleGroupFilterPath = ref<string[]>([])
const immediateRoleTargetId = ref('')
const activeChatSessionMenuId = ref('')
const chatSessionRenameOpen = ref(false)
const chatSessionRenameTargetId = ref('')
const chatSessionRenameTitle = ref('')
const chatSessionSelectionExitingIds = ref<string[]>([])
const chatSessionSelectionFadingIds = ref<string[]>([])
const contactSelectionExitingIds = ref<string[]>([])
const contactSelectionFadingIds = ref<string[]>([])
let chatSessionSelectionExitTimer: ReturnType<typeof setTimeout> | null = null
let chatSessionSelectionFadeTimer: ReturnType<typeof setTimeout> | null = null
let contactSelectionExitTimer: ReturnType<typeof setTimeout> | null = null
let contactSelectionFadeTimer: ReturnType<typeof setTimeout> | null = null
let chatSessionSelectionExitRunId = 0
let contactSelectionExitRunId = 0
const chatSessionRenameInputRef = ref<HTMLInputElement | null>(null)
const chatSessionFilterLabel = computed(() => (
  chatSessionFilter.value === 'crowd'
    ? '群众角色'
    : chatSessionFilter.value === 'archived'
        ? '已归档'
        : '最近对话'
))
const roleGroupFilterLabel = computed(() => {
  if (selectedRoleGroupFilterId.value === 'all') return '全部角色'
  if (selectedRoleGroupFilterId.value === 'default') return '未分组'
  return findRoleGroupFilterNode(selectedRoleGroupFilterId.value, roleGroupFilterTree.value)
    ?.label || '全部角色'
})

watch(() => [props.workspacePrimaryView, props.currentTarget] as const, ([view, target]) => {
  const normalizedTarget = String(target || '').trim()
  if (view !== 'roles' || !immediateRoleTargetId.value) {
    immediateRoleTargetId.value = ''
    return
  }
  if (normalizedTarget === immediateRoleTargetId.value) {
    immediateRoleTargetId.value = ''
  }
})

const filteredChatSessionRows = computed(() => {
  const keyword = chatSessionSearch.value.trim().toLowerCase()
  return (props.chatSessionRows || []).filter((row) => {
    const isArchived = Boolean(row?.isArchived)
    if (chatSessionFilter.value === 'archived') {
      if (!isArchived) return false
    } else if (isArchived) {
      return false
    }
    if (chatSessionFilter.value === 'crowd' && row.kind !== 'crowd') return false
    if (!keyword) return true
    return `${row.title} ${row.label} ${row.preview}`.toLowerCase().includes(keyword)
  })
})
const chatSessionSelectionKit = useSidebarSelectionMenuKit({
  getOrderedIds: () => filteredChatSessionRows.value.map(getChatSessionSelectionId),
  getResetKey: () => filteredChatSessionRows.value
    .map((row) => String(row?.sessionId || '').trim())
    .filter(Boolean)
    .join('|')
})
const utilityMenuItems = computed(() => {
  const items: Array<{ key: string; label: string; panelId: ChatUtilityPanelId }> = [
    { key: 'changelog', label: '更新日志', panelId: 'changelog' },
    { key: 'ticket', label: '点券', panelId: 'ticket' },
    { key: 'task', label: '任务', panelId: 'task' },
    { key: 'resource', label: '资源', panelId: 'resource' },
    { key: 'operation', label: '操作助手', panelId: 'operation' },
    { key: 'dataSafety', label: '数据安全', panelId: 'dataSafety' }
  ]
  return props.canUseLocalTools === false ? items.slice(0, 1) : items
})
const accountMiscMenuItems = computed<SoneTreeNestedMenuItem[]>(() => [{
  key: 'misc',
  label: '杂项',
  action: '',
  children: utilityMenuItems.value.map((item) => ({
    key: item.key,
    label: item.label,
    action: item.panelId,
    active: props.activeUtilityPanel === item.panelId
  }))
}])
function getChatSessionSelectionId(row: ChatSessionRow | string) {
  const sessionId = typeof row === 'string' ? row : row?.sessionId
  return `session:${String(sessionId || '').trim()}`
}

function setChatSessionFilter(filter: 'recent' | 'crowd' | 'archived') {
  chatSessionFilter.value = filter
  chatSessionFilterMenuOpen.value = false
}

function selectChatSessionRow(row: ChatSessionRow) {
  activeChatSessionMenuId.value = ''
  emit('switch-session', row.sessionId)
  emit('switch-workspace-view', 'chat')
}

function handleChatSessionRowClick(row: ChatSessionRow, event: MouseEvent | PointerEvent) {
  const selectionId = getChatSessionSelectionId(row)
  chatSessionSelectionKit.handleItemClick({
    id: selectionId,
    event,
    onDefault: () => selectChatSessionRow(row)
  })
}

function handleChatSessionPointerDown(row: ChatSessionRow, event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.sidebar-row-action') || target?.closest('.sidebar-row-menu')) return
  if (event.pointerType === 'mouse' && event.shiftKey) {
    event.preventDefault()
  }
  chatSessionSelectionKit.handlePointerDown(getChatSessionSelectionId(row), event)
}

function handleChatSessionPointerMove(event: PointerEvent) {
  chatSessionSelectionKit.handlePointerMove(event)
}

function handleChatSessionPointerEnd(event: PointerEvent) {
  chatSessionSelectionKit.handlePointerEnd(event)
}

function isChatSessionRowActive(row: ChatSessionRow) {
  return String(row?.sessionId || '').trim() === String(props.activeSessionId || '').trim()
}

function isChatSessionRowSelected(row: ChatSessionRow) {
  return chatSessionSelectionKit.isSelected(getChatSessionSelectionId(row))
}

function getChatSessionExitSelectionIds(ids: string[]) {
  const ordered = new Set(chatSessionSelectionKit.renderedIds.value)
  return ids
    .map((item) => String(item || '').trim())
    .filter((item) => item && ordered.has(item))
}

function clearChatSessionSelectionExitTimers() {
  chatSessionSelectionExitRunId += 1
  if (chatSessionSelectionExitTimer) {
    clearTimeout(chatSessionSelectionExitTimer)
    chatSessionSelectionExitTimer = null
  }
  if (chatSessionSelectionFadeTimer) {
    clearTimeout(chatSessionSelectionFadeTimer)
    chatSessionSelectionFadeTimer = null
  }
}

function startChatSessionSelectionExitAnimation(ids: string[]) {
  const exitIds = getChatSessionExitSelectionIds(ids)
  clearChatSessionSelectionExitTimers()
  const runId = chatSessionSelectionExitRunId
  chatSessionSelectionExitingIds.value = []
  chatSessionSelectionFadingIds.value = []
  if (exitIds.length <= 1) return
  chatSessionSelectionExitingIds.value = exitIds
  void nextTick(() => {
    if (runId !== chatSessionSelectionExitRunId) return
    chatSessionSelectionExitTimer = setTimeout(() => {
      if (runId !== chatSessionSelectionExitRunId) return
      chatSessionSelectionExitTimer = null
      chatSessionSelectionFadingIds.value = exitIds
      chatSessionSelectionFadeTimer = setTimeout(() => {
        if (runId !== chatSessionSelectionExitRunId) return
        chatSessionSelectionFadeTimer = null
        chatSessionSelectionExitingIds.value = []
        chatSessionSelectionFadingIds.value = []
      }, 120)
    }, 96)
  })
}

function isChatSessionSelectionExiting(row: ChatSessionRow) {
  return chatSessionSelectionExitingIds.value.includes(getChatSessionSelectionId(row))
}

function isChatSessionSelectionFading(row: ChatSessionRow) {
  return chatSessionSelectionFadingIds.value.includes(getChatSessionSelectionId(row))
}

function isChatSessionSelectionVisible(row: ChatSessionRow) {
  return isChatSessionRowSelected(row) || isChatSessionSelectionExiting(row)
}

function hasAdjacentSelectedChatSession(row: ChatSessionRow, direction: -1 | 1) {
  return chatSessionSelectionKit.hasAdjacentSelected(getChatSessionSelectionId(row), direction)
}

function hasChatSessionMergedSelectionNeighbor(row: ChatSessionRow, direction: -1 | 1) {
  if (isChatSessionSelectionExiting(row)) {
    const ids = chatSessionSelectionKit.renderedIds.value
    const selectionId = getChatSessionSelectionId(row)
    const index = ids.indexOf(selectionId)
    return index >= 0 && chatSessionSelectionExitingIds.value.includes(ids[index + direction] || '')
  }
  if (!isChatSessionRowSelected(row)) return false
  return hasAdjacentSelectedChatSession(row, direction)
}

function openChatSessionContextMenu(row: ChatSessionRow, event?: Event) {
  updateFloatingMenuPosition(event)
  contactRowMenu.closeMenu()
  activeCharGroupMenuId.value = ''
  const sessionId = String(row?.sessionId || '').trim()
  if (sessionId) {
    chatSessionSelectionKit.openContextMenuFor(getChatSessionSelectionId(sessionId))
  }
  activeChatSessionMenuId.value = sessionId
}

function isChatSessionMenuOpen(row: ChatSessionRow) {
  return activeChatSessionMenuId.value === String(row?.sessionId || '').trim()
}

// 批量模式（多选后右键选中项）时展开整个选中集；这里与联系人列表的 getContactMenuTargets 属于联动能力，改批量语义时两处要同步。
function getChatSessionMenuTargets(row: ChatSessionRow) {
  const selectionId = getChatSessionSelectionId(row)
  if (chatSessionSelectionKit.getMenuMode(selectionId) === 'batch') {
    return chatSessionSelectionKit.selectedIds.value
      .map((item) => String(item || '').replace(/^session:/, '').trim())
      .filter(Boolean)
  }
  return [String(row?.sessionId || '').trim()].filter(Boolean)
}

function getChatSessionMenuItems(row: ChatSessionRow) {
  if (getChatSessionMenuTargets(row).length > 1) {
    return [{ key: 'delete', label: '删除', action: 'delete', danger: true }] as ChatSessionMenuItem[]
  }
  const hasMessages = Number(row?.messageCount || 0) > 0
  // 归档入口已下线（2026-07-09 用户拍板）：右键菜单不再提供「归档」，只留重命名/删除（删除=彻底删除）
  void hasMessages
  const items: ChatSessionMenuItem[] = [
    { key: 'rename', label: '重命名', action: 'rename' },
    { key: 'delete', label: '删除', action: 'delete', danger: true }
  ]
  return items
}

function runChatSessionMenuAction(action: string, row: ChatSessionRow) {
  const item = getChatSessionMenuItems(row).find((entry) => entry.action === action)
  if (item?.disabled) return
  const targets = getChatSessionMenuTargets(row)
  activeChatSessionMenuId.value = ''
  if (action === 'rename') {
    openChatSessionRename(row)
    return
  }
  if (action === 'archive') {
    void props.archiveChatSession?.(row.sessionId)
    return
  }
  if (action === 'delete') {
    if (targets.length > 1) {
      void props.deleteChatSessions?.(targets)
      return
    }
    void props.deleteChatSession?.(row.sessionId)
  }
}

function openChatSessionRename(row: ChatSessionRow) {
  chatSessionRenameTargetId.value = String(row?.sessionId || '').trim()
  chatSessionRenameTitle.value = String(row?.title || '').trim().slice(0, 15)
  chatSessionRenameOpen.value = true
  void nextTick(() => {
    chatSessionRenameInputRef.value?.focus()
    chatSessionRenameInputRef.value?.select()
  })
}

function closeChatSessionRename() {
  chatSessionRenameOpen.value = false
  chatSessionRenameTargetId.value = ''
  chatSessionRenameTitle.value = ''
}

async function confirmChatSessionRename() {
  const sessionId = chatSessionRenameTargetId.value
  const title = chatSessionRenameTitle.value.trim()
  if (!sessionId || !title) return
  await props.renameChatSession?.(sessionId, title)
  closeChatSessionRename()
}

function parseChatSessionDate(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) return date
  const sqliteDate = new Date(raw.replace(' ', 'T'))
  return Number.isNaN(sqliteDate.getTime()) ? null : sqliteDate
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function padTimeUnit(value: number) {
  return String(value).padStart(2, '0')
}

function formatChatSessionTime(value: string) {
  const date = parseChatSessionDate(value)
  if (!date) return ''
  const now = new Date()
  const diffDays = Math.floor((startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / 86400000)
  if (diffDays <= 0) {
    return `${padTimeUnit(date.getHours())}:${padTimeUnit(date.getMinutes())}`
  }
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  }
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function openChatUtility(panelId: ChatUtilityPanelId) {
  closeAccountMenu()
  emit('open-chat-utility', panelId)
}

function openPixelStudio() {
  closeAccountMenu()
  window.open('/pixel', '_blank', 'noopener')
}

function openUtilityFromAccountMisc(action: string) {
  const panel = utilityMenuItems.value.find((item) => item.panelId === action)
  if (!panel) return
  openChatUtility(panel.panelId)
}

function togglePrimaryNav(nextView: 'chat' | 'roles' | 'docs' | 'config' | 'data' | 'worlds', event?: MouseEvent) {
  // 桌面端：再次点击当前已钉住视图的聊天/角色根入口 → 收起二级侧栏（复用右上角收起按钮同一路径）。
  if (
    (nextView === 'chat' || nextView === 'roles')
    && props.desktopFloatingMode
    && props.workspacePrimaryView === nextView
    && props.desktopSidebarPinned
  ) {
    emit('unpin-sidebar')
    if (event && event.detail !== 0) {
      ;(event.currentTarget as HTMLElement | null)?.blur()
    }
    return
  }
  if (props.workspacePrimaryView !== nextView) {
    emit('switch-workspace-view', nextView)
  }
  const shouldOpenSidebar = nextView === 'data' || nextView === 'config' || nextView === 'worlds'
    ? false
    : props.desktopFloatingMode
      ? true
      : nextView === 'docs'
  emit('update:sidebar-open', shouldOpenSidebar)
  // 桌面端点击聊天 / 角色根入口：把该视图二级侧栏钉住（持久展开并挤压主区）。
  if ((nextView === 'chat' || nextView === 'roles') && props.desktopFloatingMode) {
    emit('pin-sidebar', nextView)
  }
  if (nextView !== 'docs' && props.desktopFloatingMode && event && event.detail !== 0) {
    ;(event.currentTarget as HTMLElement | null)?.blur()
  }
}

function clearFloatingSidebarFocus() {
  if (!props.desktopFloatingMode) return
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (active instanceof HTMLElement && active.closest('.chat-sidebar')) {
    active.blur()
  }
}

function openChatSessionCreatorFromSidebar() {
  chatSessionFilterMenuOpen.value = false
  if (typeof props.openChatSessionCreator !== 'function') {
    toast('当前新建会话入口尚未接入', 'warning')
    return
  }
  props.openChatSessionCreator()
}

function getContactSelectionId(kind: 'char' | 'group' | 'crowd', id: string) {
  return `${kind}:${String(id || '').trim()}`
}

function isContactActive(kind: 'char' | 'group' | 'crowd', id: string) {
  const normalizedId = String(id || '').trim()
  if (!normalizedId) return false
  if (isRolesView.value && (kind === 'char' || kind === 'crowd')) {
    return (immediateRoleTargetId.value || props.currentTarget) === normalizedId
  }
  return props.currentTarget === normalizedId
}

const contactDragModeKit = useSidebarDragModeKit<'char' | 'group' | 'crowd'>({
  persistKey: props.touchMode ? 'langhuan_contact_drag_mode_mobile' : 'langhuan_contact_drag_mode',
  defaultDragEnabled: false,
  defaultSinkContext: ''
})
const contactDragSortEnabled = contactDragModeKit.dragEnabled
const contactSinkContext = contactDragModeKit.sinkContext
const activeContactDragSection = ref<ContactKind>('char')
const contactLayoutRootRef = ref<HTMLElement | null>(null)
const CONTACT_SECTION_RATIO_STORAGE_KEY = 'langhuan_contact_section_ratios_v1'
const CONTACT_SECTION_GAP_PX = 8
const contactSectionRatios = reactive<Record<ContactKind, number>>({
  char: 0.5,
  group: 1 / 3,
  crowd: 1 / 6
})
const groupSectionCollapsed = ref(false)
const contactSectionScrollRefs = reactive<Record<ContactKind, HTMLElement | null>>({
  char: null,
  group: null,
  crowd: null
})
const contactSectionScrollState = reactive<Record<ContactKind, ContactSectionScrollMetrics>>({
  char: { max: 0, ratio: 0, active: false },
  group: { max: 0, ratio: 0, active: false },
  crowd: { max: 0, ratio: 0, active: false }
})
const contactSliderDragState = ref<{
  kind: ContactKind
  pointerId: number
  track: HTMLElement | null
} | null>(null)
const contactSectionResizeState = ref<{
  pointerId: number
  pair: 'char-group' | 'group-crowd' | 'char-crowd'
  startY: number
  startChar: number
  startGroup: number
  startCrowd: number
} | null>(null)
const activeDocTab = computed(() => normalizeVisibleDocLibraryModuleTab(props.docSidebarState?.activeTab || 'worldbook'))
const docPromptRows = computed(() => props.docSidebarState?.prompt?.rows || [])
const docPromptTotalCount = computed(() => props.docSidebarState?.prompt?.totalCount || docPromptRows.value.length)
const docPromptDragEnabled = computed(() => Boolean(props.docSidebarState?.prompt?.dragEnabled))
const docPromptFilterMode = computed<'all' | 'required'>(() => props.docSidebarState?.prompt?.filterMode === 'required' ? 'required' : 'all')
const docPromptFilterOptions: Array<{ value: 'all' | 'required'; label: string }> = [
  { value: 'all', label: '全部提示词' },
  { value: 'required', label: '只看必装' }
]
const relationSidebarRows = computed(() => {
  const relationState = props.docSidebarState?.relation
  const activeTab = relationState?.activeTab || 'candidates'
  return [
    { id: 'predicates' as RelationPanelTab, label: '谓词库', count: relationState?.predicatesCount || 0, active: activeTab === 'predicates' },
    { id: 'candidates' as RelationPanelTab, label: '候选关系', count: relationState?.candidatesCount || 0, active: activeTab === 'candidates' },
    { id: 'confirmed' as RelationPanelTab, label: '已确认关系', count: relationState?.confirmedCount || 0, active: activeTab === 'confirmed' }
  ]
})
const docPromptGroups = computed(() => {
  const groupMap = new Map<string, { key: string; label: string; rows: PromptSidebarRow[] }>()
  docPromptRows.value.forEach((row) => {
    const key = String(row.group || 'general')
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, label: row.groupLabel || '提示词', rows: [] })
    }
    groupMap.get(key)?.rows.push(row)
  })
  return Array.from(groupMap.values())
})
const activeDocMenuId = ref('')
const activeCharGroupMenuId = ref('')
const docPromptFilterMenuOpen = ref(false)
const docPromptDraggedId = ref('')
const docPromptDropTargetId = ref('')
const docPromptDropPosition = ref<'before' | 'after'>('after')
const sidebarFloatingMenuKit = useSidebarFloatingMenuKit()
const floatingMenuStyle = sidebarFloatingMenuKit.floatingMenuStyle
const docPromptFilterFloatingMenuKit = useSidebarFloatingMenuKit({
  menuWidth: 148,
  estimatedHeight: 96,
  placement: 'below',
  horizontalPlacement: 'align-right'
})
const docPromptFilterFloatingMenuStyle = docPromptFilterFloatingMenuKit.floatingMenuStyle
const accountFloatingMenuKit = useSidebarFloatingMenuKit({
  menuWidth: 276,
  horizontalPlacement: 'align-right',
  placement: 'above',
  constrainHeight: false
})
const accountFloatingMenuStyle = accountFloatingMenuKit.floatingMenuStyle
const accountMenuOpen = ref(false)
const settingsModalOpen = ref(false)
const localWorkspaceDisplayName = computed(() => (
  props.userProfile?.displayName || props.userProfile?.name || '本地用户'
))
const localWorkspaceMenuTitle = computed(() => '本地工作区设置')
const emptySelectedIds = computed<string[]>(() => [])
const pendingDocSidebarDrag = ref<{
  pointerId: number
  mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster'
  currentId: string
  startX: number
  startY: number
} | null>(null)
const lastContactPointer = ref({ x: 0, y: 0 })
const contactDragKind = ref<'' | 'char' | 'group' | 'crowd'>('')
const docSidebarPointerDragging = ref(false)
const suppressDocClickUntil = ref(0)
const docWorldbookDragModeKit = useSidebarDragModeKit<'worldbook'>({
  persistKey: 'langhuan_doc_worldbook_drag_mode',
  defaultDragEnabled: false,
  defaultSinkContext: ''
})
const docWorldbookDragSortEnabled = computed(() => false)
const docWorldbookFolderSortOnly = computed(() => false)

function closeAccountMenu() {
  accountMenuOpen.value = false
  accountFloatingMenuKit.clearFloatingMenuPosition()
}

function toggleAccountMenu(event: MouseEvent) {
  if (accountMenuOpen.value) {
    closeAccountMenu()
    return
  }
  accountFloatingMenuKit.updateFloatingMenuPosition(event)
  accountMenuOpen.value = true
}

function openProfileEditor() {
  closeAccountMenu()
  emit('open-user-editor')
}

function openSettingsModal() {
  settingsModalOpen.value = true
  closeAccountMenu()
}

function closeSettingsModal() {
  settingsModalOpen.value = false
}

function setContactSectionScrollRef(kind: ContactKind, element: unknown) {
  contactSectionScrollRefs[kind] = element instanceof HTMLElement ? element : null
}

function isContactDragActive(kind: ContactKind) {
  return contactDragSortEnabled.value && activeContactDragSection.value === kind
}

function normalizeContactSectionRatios(next: Partial<Record<ContactKind, number>>) {
  const char = Math.max(0.05, Number(next.char ?? contactSectionRatios.char) || 0)
  const group = Math.max(0.05, Number(next.group ?? contactSectionRatios.group) || 0)
  const crowd = Math.max(0.05, Number(next.crowd ?? contactSectionRatios.crowd) || 0)
  const total = char + group + crowd || 1
  contactSectionRatios.char = char / total
  contactSectionRatios.group = group / total
  contactSectionRatios.crowd = crowd / total
}

function persistContactSectionRatios() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONTACT_SECTION_RATIO_STORAGE_KEY, JSON.stringify({
    char: contactSectionRatios.char,
    group: contactSectionRatios.group,
    crowd: contactSectionRatios.crowd
  }))
}

function hydrateContactSectionRatios() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(CONTACT_SECTION_RATIO_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<Record<ContactKind, number>>
    normalizeContactSectionRatios(parsed)
  } catch {
    normalizeContactSectionRatios({
      char: 0.5,
      group: 1 / 3,
      crowd: 1 / 6
    })
  }
}

function getContactSectionAvailableHeight() {
  const root = contactLayoutRootRef.value
  if (!root) return 0
  return Math.max(0, root.clientHeight - CONTACT_SECTION_GAP_PX)
}

function getContactSectionMinRatio() {
  const availableHeight = getContactSectionAvailableHeight()
  if (availableHeight <= 0) return 0.1
  return Math.min(0.3, 88 / availableHeight)
}

function getContactSectionLayoutStyle(kind: ContactKind) {
  if (isRolesView.value) {
    if (kind === 'group') {
      return {
        display: 'none'
      }
    }
    return {
      flex: '1 1 auto',
      minHeight: '0',
      overflow: 'hidden'
    }
  }
  if (contactDragSortEnabled.value) {
    if (activeContactDragSection.value !== kind) {
      return {
          display: 'none'
      }
    }
    return {
      flex: '1 1 100%',
      minHeight: '0'
    }
  }
  return {
    height: `calc((100% - ${CONTACT_SECTION_GAP_PX}px) * ${contactSectionRatios[kind]})`,
    minHeight: '0',
    maxHeight: `calc((100% - ${CONTACT_SECTION_GAP_PX}px) * ${contactSectionRatios[kind]})`,
    overflow: 'hidden'
  }
}

function syncContactSectionScroll(kind: ContactKind) {
  const element = contactSectionScrollRefs[kind]
  const max = Math.max(0, element ? element.scrollHeight - element.clientHeight : 0)
  const ratio = max > 0 && element ? Math.round((element.scrollTop / max) * 100) : 0
  contactSectionScrollState[kind].max = max
  contactSectionScrollState[kind].ratio = ratio
  contactSectionScrollState[kind].active = contactDragSortEnabled.value && max > 0
}

function syncAllContactSectionScroll() {
  syncContactSectionScroll('char')
  syncContactSectionScroll('group')
  syncContactSectionScroll('crowd')
}

function handleContactSectionScroll(kind: ContactKind) {
  syncContactSectionScroll(kind)
}

function setContactSectionScrollRatio(kind: ContactKind, ratioValue: number) {
  const element = contactSectionScrollRefs[kind]
  if (!element) return
  const ratio = Math.max(0, Math.min(100, Number(ratioValue || 0)))
  const max = Math.max(0, element.scrollHeight - element.clientHeight)
  element.scrollTop = max * (ratio / 100)
  syncContactSectionScroll(kind)
}

function shouldShowContactSectionSlider(kind: ContactKind) {
  return false
}

function canManageContactKind(kind: ContactKind) {
  if (isRolesView.value) return kind === 'char'
  return kind === 'group'
}

function shouldShowContactGroupMenuTrigger(kind: ContactKind) {
  return canManageContactKind(kind)
}

function handleContactSectionWheel(kind: ContactKind, event: WheelEvent) {
  const element = contactSectionScrollRefs[kind]
  if (!element) return
  const max = Math.max(0, element.scrollHeight - element.clientHeight)
  if (max <= 0) return
  event.preventDefault()
  event.stopPropagation()
  element.scrollTop += event.deltaY
  syncContactSectionScroll(kind)
}

function updateContactSectionSliderFromPointer(kind: ContactKind, clientY: number, track?: HTMLElement | null) {
  if (!(track instanceof HTMLElement)) return
  const rect = track.getBoundingClientRect()
  if (rect.height <= 0) return
  const ratio = ((clientY - rect.top) / rect.height) * 100
  setContactSectionScrollRatio(kind, ratio)
}

function handleContactSectionSliderPointerDown(kind: ContactKind, event: PointerEvent) {
  if (event.button !== 0) return
  const track = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.closest('.sidebar-section-slider-track')
    : null
  contactSliderDragState.value = {
    kind,
    pointerId: event.pointerId,
    track: track instanceof HTMLElement ? track : null
  }
  updateContactSectionSliderFromPointer(kind, event.clientY, contactSliderDragState.value.track)
}

function handleContactSectionResizePointerDown(pair: 'char-group' | 'group-crowd' | 'char-crowd', event: PointerEvent) {
  if (event.button !== 0) return
  contactSectionResizeState.value = {
    pointerId: event.pointerId,
    pair,
    startY: event.clientY,
    startChar: contactSectionRatios.char,
    startGroup: contactSectionRatios.group,
    startCrowd: contactSectionRatios.crowd
  }
}
const docWorldbookPreviewTarget = ref<WorldbookPreviewTarget | null>(null)
const contactMoveDialog = ref<ContactMoveDialogState>({
  visible: false,
  kind: 'char',
  sourceItems: [],
  sourceLabels: [],
  targetId: '',
  pathInput: ''
})
const contactMoveExpandedIds = ref<Set<string>>(new Set())
const docWorldbookAutoExpandState: WorldbookTreeAutoExpandState = {
  hoverKey: '',
  hoverStartedAt: 0,
  lastExpandedKey: '',
  lastExpandedAt: 0
}
const docWorldbookDrag = useSidebarMultiDrag({
  getOrderedIds: () => (props.docSidebarState?.worldbook?.rows || []).map((row) => row.id),
  getSelectedIds: () => (props.docSidebarState?.worldbook?.rows || [])
    .filter((row) => row.kind === 'document' && row.selected)
    .map((row) => row.id)
})
const docWorldbookClusterDrag = useSidebarMultiDrag({
  getOrderedIds: () => worldbookClusters.value.map((item) => String(item.id || '').trim()).filter(Boolean),
  getSelectedIds: () => emptySelectedIds.value
})
const selectedWorldbookAnchorId = computed(() => {
  const firstSelected = docWorldbookRows.value.find((row) => row.kind === 'document' && row.selected)
  return firstSelected?.id || ''
})
const worldbookClusters = computed(() => props.docSidebarState?.worldbook?.clusters || [])
const docWorldbookRows = computed(() => props.docSidebarState?.worldbook?.rows || [])
const docWorldbookExpandableRowCount = computed(() => (
  worldbookClusters.value.length + docWorldbookRows.value.filter((row) => row.kind === 'folder').length
))
const docWorldbookAllExpanded = computed(() => (
  docWorldbookExpandableRowCount.value > 0
  && worldbookClusters.value.every((cluster) => cluster.open)
  && docWorldbookRows.value.filter((row) => row.kind === 'folder').every((row) => row.open)
))
const docWorldbookToggleTitle = computed(() => (docWorldbookAllExpanded.value ? '全部折叠' : '全部展开'))
const docWorldbookRowMap = computed(() => new Map(docWorldbookRows.value.map((row) => [row.id, row] as const)))
const docWorldbookRowByFolderId = computed(() => {
  const map = new Map<string, DocSidebarRow>()
  docWorldbookRows.value.forEach((row) => {
    if (row.kind !== 'folder' || !row.folderId) return
    map.set(String(row.folderId || '').trim(), row)
  })
  return map
})
const docWorldbookRowByItemId = computed(() => {
  const map = new Map<string, DocSidebarRow>()
  docWorldbookRows.value.forEach((row) => {
    if (row.kind !== 'document' || !row.itemId) return
    map.set(String(row.itemId || '').trim(), row)
  })
  return map
})
const worldbookClusterMap = computed(() => new Map(worldbookClusters.value.map((cluster) => [String(cluster.id || '').trim(), cluster] as const)))
const docWorldbookSoneRows = computed<DocWorldbookSoneRow[]>(() => {
  const rows: DocWorldbookSoneRow[] = []
  worldbookClusters.value.forEach((cluster) => {
    const clusterId = String(cluster.id || '').trim()
    if (!clusterId) return
    rows.push({
      id: getDocWorldbookSoneClusterRowId(clusterId),
      label: cluster.label,
      depth: 0,
      kind: 'folder',
      open: cluster.open,
      active: cluster.selected,
      selected: cluster.selected,
      cutPending: cluster.cutPending,
      hasMenu: true,
      menuOpen: isDocWorldbookClusterMenuOpen(clusterId),
      menuItems: getDocWorldbookClusterMenuItems(clusterId) as SoneTreeMenuItem[],
      multiSelectId: getDocWorldbookSoneClusterRowId(clusterId),
      groupRunId: '__doc-worldbook-root__',
      dragId: clusterId,
      dragKind: 'cluster',
      clusterId,
      dragging: isDocWorldbookClusterHeaderDragging(clusterId),
      dropTarget: isDocWorldbookClusterDropTarget(clusterId),
      previewShift: isDocWorldbookClusterPreviewShift(clusterId),
      compilePageIndicator: cluster.compilePageIndicator,
      sourceKind: 'cluster'
    })
    if (!cluster.open) return
    getRenderedDocWorldbookRowsByCluster(clusterId).forEach((row) => {
      const parentFolderId = String(row.parentFolderId || '__root__').trim() || '__root__'
      const selected = Boolean(row.selected)
      rows.push({
        id: row.id,
        label: row.label,
        depth: Number(row.depth || 0) + 1,
        kind: row.kind,
        open: row.open,
        active: row.active,
        selected,
        selectedPrev: selected && hasAdjacentSelectedDocRow('worldbook', row.id, -1),
        selectedNext: selected && hasAdjacentSelectedDocRow('worldbook', row.id, 1),
        cutPending: row.cutPending,
        hasMenu: shouldShowDocWorldbookMenuTrigger(row),
        menuOpen: isDocWorldbookMenuOpen(row),
        menuItems: getDocWorldbookMenuItems(row) as SoneTreeMenuItem[],
        multiSelectId: row.id,
        groupRunId: `${clusterId}:${parentFolderId}`,
        dragId: row.id,
        dragKind: row.kind,
        clusterId,
        dragging: isDocWorldbookRowDragging(row),
        dropTarget: isDocWorldbookRowDropTarget(row),
        previewShift: isDocWorldbookRowPreviewShift(row),
        compilePageIndicator: row.compilePageIndicator,
        sourceKind: row.kind,
        sourceRow: row
      })
    })
  })
  return rows
})
const docWorldbookSoneRowMap = computed(() => new Map(docWorldbookSoneRows.value.map((row) => [row.id, row] as const)))

function getWorldbookRowsByCluster(clusterId: string) {
  return (props.docSidebarState?.worldbook?.rows || []).filter((row) => row.clusterId === clusterId)
}

function getDocWorldbookRowKind(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster'): WorldbookDragRowKind {
  if (mode === 'worldbook-cluster') return 'cluster'
  return mode === 'worldbook-folder' ? 'folder' : 'document'
}

function canDocWorldbookReorderTarget(
  rowKind: WorldbookDragRowKind,
  target: WorldbookPreviewTarget | null
) {
  if (!target || target.mode === 'inside') return false
  if (rowKind === 'cluster') return target.kind === 'cluster'
  if (target.kind !== 'folder' && target.kind !== 'document') return false
  const targetParentFolderId = target.kind === 'folder'
    ? String(docWorldbookRowByFolderId.value.get(String(target.id || '').trim())?.parentFolderId || '__root__').trim() || '__root__'
    : String(docWorldbookRowByItemId.value.get(String(target.id || '').trim())?.parentFolderId || '__root__').trim() || '__root__'
  const draggingIds = docWorldbookDrag.draggingIds.value
  const movingRows = draggingIds
    .map((id) => docWorldbookRowMap.value.get(id))
    .filter((row): row is DocSidebarRow => Boolean(row))
  if (!movingRows.length) return false
  return movingRows.every((row) => String(row.parentFolderId || '__root__').trim() === targetParentFolderId)
}

function canDocWorldbookSinkTarget(
  rowKind: WorldbookDragRowKind,
  target: WorldbookPreviewTarget | null
) {
  if (!docWorldbookFolderSortOnly.value || !target || target.mode !== 'inside') return false
  if (rowKind === 'cluster') return false
  return target.kind === 'folder' || target.kind === 'cluster'
}

function isDocWorldbookCrossParentTarget(
  rowKind: WorldbookDragRowKind,
  target: WorldbookPreviewTarget | null
) {
  if (!target || target.mode === 'inside' || rowKind === 'cluster') return false
  if (target.kind !== 'folder' && target.kind !== 'document') return false
  return !canDocWorldbookReorderTarget(rowKind, target)
}

function resolveDocWorldbookTargetRowId(target: WorldbookPreviewTarget | null) {
  if (!target || target.kind === 'root' || target.mode === 'inside') return ''
  if (target.kind === 'cluster') {
    return String(target.id || '').trim()
  }
  if (target.kind === 'folder') {
    return String(docWorldbookRowByFolderId.value.get(String(target.id || '').trim())?.id || '').trim()
  }
  return String(docWorldbookRowByItemId.value.get(String(target.id || '').trim())?.id || '').trim()
}

function getDraggedDocWorldbookPayloadIds(
  rowKind: WorldbookDragRowKind,
  rowIds: string[]
) {
  const safeRowIds = Array.isArray(rowIds) ? rowIds.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (!safeRowIds.length) return []
  if (rowKind === 'cluster') return safeRowIds
  const movingRows = safeRowIds
    .map((id) => docWorldbookRowMap.value.get(id))
    .filter((row): row is DocSidebarRow => Boolean(row))
  if (rowKind === 'folder') {
    return movingRows
      .filter((row): row is DocSidebarRow & { kind: 'folder'; folderId: string } => row.kind === 'folder' && Boolean(row.folderId))
      .map((row) => String(row.folderId || '').trim())
      .filter(Boolean)
  }
  return movingRows
    .filter((row): row is DocSidebarRow & { kind: 'document'; itemId: string } => row.kind === 'document' && Boolean(row.itemId))
    .map((row) => String(row.itemId || '').trim())
    .filter(Boolean)
}
const visibleContactGroups = computed(() => {
  const source = Array.isArray(props.characterGroups) ? props.characterGroups : []
  const groups = source.length ? source : [{ id: 'default', name: '默认' }]
  return groups.map((group) => ({
    ...group,
    id: String(group.id || 'default').trim() || 'default',
    name: String(group.name || '默认').trim() || '默认'
  }))
})
const namedContactGroups = computed(() => visibleContactGroups.value.filter((group) => group.id !== 'default'))
const namedContactGroupIds = computed(() => new Set(namedContactGroups.value.map((group) => group.id)))
function readGroupParentId(group: unknown) {
  if (!group || typeof group !== 'object') return ''
  const record = group as { parentId?: unknown; parent_id?: unknown }
  return String(record.parentId ?? record.parent_id ?? '').trim()
}

function matchesRoleSearch(entity: NamedEntity) {
  const keyword = roleCharacterSearch.value.trim().toLowerCase()
  if (!keyword) return true
  return [
    entity.name,
    (entity as { gender?: unknown }).gender,
    (entity as { age?: unknown }).age,
    (entity as { emoji?: unknown }).emoji
  ]
    .map((item) => String(item || '').toLowerCase())
    .join(' ')
    .includes(keyword)
}

function getRawCharactersByGroup(groupId: string) {
  return groupId === 'default'
    ? baseUngroupedCharacters.value
    : props.getCharactersByGroup(groupId)
}

const roleGroupFilterTree = computed<RoleGroupFilterNode[]>(() => {
  const byParent = new Map<string, typeof namedContactGroups.value>()
  const validIds = new Set(namedContactGroups.value.map((group) => String(group.id || '').trim()))
  namedContactGroups.value.forEach((group) => {
    const parentId = readGroupParentId(group)
    const normalizedParentId = parentId && validIds.has(parentId) ? parentId : ''
    byParent.set(normalizedParentId, [...(byParent.get(normalizedParentId) || []), group])
  })
  const buildNodes = (parentId: string): RoleGroupFilterNode[] => (
    (byParent.get(parentId) || []).map((group) => {
      const groupId = String(group.id || '').trim()
      const children = buildNodes(groupId)
      const childCount = children.reduce((total, child) => total + child.count, 0)
      const ownCount = getRawCharactersByGroup(groupId).filter(matchesRoleSearch).length
      return {
        id: groupId,
        groupId,
        label: String(group.name || '').trim() || '未命名分组',
        count: ownCount + childCount,
        children
      }
    }).filter((node) => node.count > 0)
  )
  return buildNodes('')
})

function findRoleGroupFilterNode(id: string, nodes: RoleGroupFilterNode[]): RoleGroupFilterNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findRoleGroupFilterNode(id, node.children)
    if (child) return child
  }
  return null
}

function collectRoleGroupFilterDescendants(id: string) {
  const root = findRoleGroupFilterNode(id, roleGroupFilterTree.value)
  const result = new Set<string>()
  const visit = (node: RoleGroupFilterNode | null) => {
    if (!node) return
    result.add(node.groupId)
    node.children.forEach(visit)
  }
  visit(root)
  return result
}

const roleGroupFilterColumns = computed<RoleGroupFilterNode[][]>(() => {
  const totalCount = (Array.isArray(props.characters) ? props.characters : []).filter(matchesRoleSearch).length
  const firstColumn: RoleGroupFilterNode[] = [
    { id: 'all', groupId: 'all', label: '全部角色', count: totalCount, children: [] },
    { id: 'default', groupId: 'default', label: '未分组', count: baseUngroupedCharacters.value.filter(matchesRoleSearch).length, children: [] },
    ...roleGroupFilterTree.value
  ]
  const columns: RoleGroupFilterNode[][] = [firstColumn]
  let currentNodes = firstColumn
  activeRoleGroupFilterPath.value.forEach((id) => {
    const activeNode = currentNodes.find((node) => node.id === id)
    if (activeNode?.children.length) {
      columns.push(activeNode.children)
      currentNodes = activeNode.children
    }
  })
  return columns
})

function roleGroupMatchesSelectedFilter(groupId: string) {
  const selectedId = selectedRoleGroupFilterId.value
  if (selectedId === 'all') return true
  if (selectedId === 'default') return groupId === 'default'
  return collectRoleGroupFilterDescendants(selectedId).has(groupId)
}

function setRoleGroupFilterHoverPath(columnIndex: number, node: RoleGroupFilterNode) {
  activeRoleGroupFilterPath.value = [
    ...activeRoleGroupFilterPath.value.slice(0, columnIndex),
    node.id
  ]
}

function selectRoleGroupFilter(id: string) {
  selectedRoleGroupFilterId.value = id
  roleGroupFilterMenuOpen.value = false
  activeRoleGroupFilterPath.value = []
}

function toggleRoleGroupFilterMenu() {
  roleGroupFilterMenuOpen.value = !roleGroupFilterMenuOpen.value
  if (!roleGroupFilterMenuOpen.value) {
    activeRoleGroupFilterPath.value = []
  }
}

const contactItemDragEnabled = computed(() => contactDragSortEnabled.value || Boolean(contactSinkContext.value))

function isContactSinkActive(kind: 'char' | 'group' | 'crowd') {
  return contactDragModeKit.isSinkActive(kind)
}

function getEntityGroupId(entity: NamedEntity) {
  return String((entity as { groupId?: unknown; group_id?: unknown }).groupId
    ?? (entity as { groupId?: unknown; group_id?: unknown }).group_id
    ?? 'default').trim() || 'default'
}

function isEntityInNamedGroup(entity: NamedEntity) {
  return namedContactGroupIds.value.has(getEntityGroupId(entity))
}

const baseUngroupedCharacters = computed(() => {
  const source = Array.isArray(props.characters) ? props.characters : []
  return source.filter((char) => !isEntityInNamedGroup(char))
})
const baseUngroupedGroups = computed(() => {
  const source = Array.isArray(props.groups) ? props.groups : []
  return source.filter((group) => !isEntityInNamedGroup(group))
})
const baseUngroupedCrowds = computed(() => {
  const source = Array.isArray(props.crowds) ? props.crowds : []
  return source.filter((crowd) => !isEntityInNamedGroup(crowd))
})
// 默认折叠：collapsedGroups 只显式记录展开的分组（false），未记录即视为折叠。
function isGroupCollapsed(groupId: string) {
  return props.collapsedGroups[groupId] !== false
}
const contactOrderedIds = computed(() => {
  if (isRolesView.value) return getRoleVisibleCharacterOrderedIds()
  const ids: string[] = []
  namedContactGroups.value.forEach((group) => {
    const groupId = String(group.id || 'default')
    if (!isGroupCollapsed(groupId)) {
      props.getCharactersByGroup(groupId).forEach((char) => {
        ids.push(getContactSelectionId('char', String(char?.id || '')))
      })
    }
  })
  baseUngroupedCharacters.value.forEach((char) => {
    ids.push(getContactSelectionId('char', String(char?.id || '')))
  })
  if (!groupSectionCollapsed.value) {
    namedContactGroups.value.forEach((group) => {
      const groupId = String(group.id || 'default')
      if (!isGroupCollapsed(groupId)) {
        getEntitiesByGroup('group', groupId).forEach((item) => {
          ids.push(getContactSelectionId('group', String(item?.id || '')))
        })
      }
    })
    baseUngroupedGroups.value.forEach((group) => {
      ids.push(getContactSelectionId('group', String(group?.id || '')))
    })
  }
  return ids
})
let contactDrag!: ReturnType<typeof useSidebarMultiDrag>
type ContactPointerPending = {
  pointerId: number
  currentId: string
  kind: 'char' | 'group' | 'crowd'
  startX: number
  startY: number
}
let contactItemPointerDrag!: ReturnType<typeof useSidebarPointerDragKit<ContactPointerPending>>
let contactGroupPointerDrag!: ReturnType<typeof useSidebarPointerDragKit<ContactPointerPending>>

function getContactRenderedOrder() {
  return contactOrderedIds.value
}

const contactSelectionKit = useSidebarSelectionMenuKit({
  getOrderedIds: () => {
    if (isRolesView.value) return getRoleVisibleCharacterOrderedIds()
    const ids: string[] = []
    namedContactGroups.value.forEach((group) => {
      const groupId = String(group.id || 'default')
      if (!isGroupCollapsed(groupId)) {
        props.getCharactersByGroup(groupId).forEach((char) => {
          ids.push(getContactSelectionId('char', String(char?.id || '')))
        })
      }
    })
    baseUngroupedCharacters.value.forEach((char) => {
      ids.push(getContactSelectionId('char', String(char?.id || '')))
    })
    if (!groupSectionCollapsed.value) {
      namedContactGroups.value.forEach((group) => {
        const groupId = String(group.id || 'default')
        if (!isGroupCollapsed(groupId)) {
          getEntitiesByGroup('group', groupId).forEach((item) => {
            ids.push(getContactSelectionId('group', String(item?.id || '')))
          })
        }
      })
      baseUngroupedGroups.value.forEach((group) => {
        ids.push(getContactSelectionId('group', String(group?.id || '')))
      })
    }
    return ids
  },
  getRenderedIds: () => getContactRenderedOrder()
})
const contactMultiSelect = {
  selectedIds: contactSelectionKit.selectedIds,
  selectionMode: contactSelectionKit.selectionMode,
  isSelected: contactSelectionKit.isSelected,
  clearSelection: contactSelectionKit.clearSelection,
  selectOnly: contactSelectionKit.selectOnly,
  handleItemClick: contactSelectionKit.handleItemClick,
  handlePointerDown: contactSelectionKit.handlePointerDown,
  handlePointerMove: contactSelectionKit.handlePointerMove,
  handlePointerEnd: contactSelectionKit.handlePointerEnd
}
const contactGroupMultiSelect = useMultiSelect({
  getOrderedIds: () => namedContactGroups.value.map((group) => String(group.id || '').trim()).filter(Boolean)
})
contactDrag = useSidebarMultiDrag({
  getOrderedIds: () => contactOrderedIds.value,
  getSelectedIds: () => contactMultiSelect.selectedIds.value
})
const contactDragDropTargetId = computed(() => contactDrag.dropTargetId.value)
const contactDragDropPosition = computed(() => contactDrag.dropPosition.value)
const contactDraggingCount = computed(() => contactDrag.draggingIds.value.length)
const docWorldbookDropTargetId = computed(() => docWorldbookDrag.dropTargetId.value)
const docWorldbookClusterDropTargetId = computed(() => docWorldbookClusterDrag.dropTargetId.value)
const isDocWorldbookVisualDragging = computed(() => (
  docSidebarPointerDragging.value
  && (
    docWorldbookDrag.draggingIds.value.length > 0
    || docWorldbookClusterDrag.draggingIds.value.length > 0
  )
))
const contactGroupDrag = useSidebarMultiDrag({
  getOrderedIds: () => namedContactGroups.value.map((group) => String(group.id || '').trim()).filter(Boolean),
  getSelectedIds: () => contactGroupMultiSelect.selectedIds.value
})
const contactGroupDropPosition = computed(() => contactGroupDrag.dropPosition.value)
contactItemPointerDrag = useSidebarPointerDragKit<ContactPointerPending>({
  activationDistance: props.touchMode ? 12 : 4,
  onStartDrag(pending) {
    contactDrag.startDrag(pending.currentId)
    contactDragKind.value = pending.kind
  },
  onPreview(pending, point) {
    lastContactPointer.value = point
    if (!contactDragKind.value) {
      contactDragKind.value = pending.kind
    }
    updateContactPointerPreview(point.x, point.y)
  },
  onCommitDrop(_pending, point) {
    lastContactPointer.value = point
    commitProjectedContactDrop()
  },
  onCancel(_pending, point, _event, wasDragging) {
    lastContactPointer.value = point
    if (props.touchMode && wasDragging) {
      commitProjectedContactDrop()
    }
  },
  onClear() {
    if (contactItemPointerDrag.dragging.value) {
      contactMultiSelect.clearSelection()
    }
    contactDragKind.value = ''
    contactDrag.clearDragState()
  }
})
contactGroupPointerDrag = useSidebarPointerDragKit<ContactPointerPending>({
  activationDistance: props.touchMode ? 12 : 4,
  onStartDrag(pending) {
    contactGroupDrag.startDrag(pending.currentId)
  },
  onPreview(_pending, point) {
    lastContactPointer.value = point
    updateContactGroupPointerPreview(point.x, point.y)
  },
  onCommitDrop(pending, point) {
    lastContactPointer.value = point
    commitProjectedContactGroupDrop(pending.kind)
  },
  onCancel(pending, point, _event, wasDragging) {
    lastContactPointer.value = point
    if (props.touchMode && wasDragging) {
      commitProjectedContactGroupDrop(pending.kind)
    }
  },
  onClear() {
    contactGroupDrag.clearDragState()
  }
})
watch(contactItemPointerDrag.dragging, (dragging) => {
  emit('contact-dragging-change', Boolean(dragging))
})
function isContactGroupSelected(groupId: string) {
  return contactGroupMultiSelect.isSelected(String(groupId || '').trim())
}

function getContactEntities(kind: 'char' | 'group' | 'crowd') {
  if (kind === 'char') return Array.isArray(props.characters) ? props.characters : []
  if (kind === 'group') return Array.isArray(props.groups) ? props.groups : []
  return Array.isArray(props.crowds) ? props.crowds : []
}

function getEntitiesByGroup(kind: 'char' | 'group' | 'crowd', groupId: string) {
  if (kind === 'char') {
    return groupId === 'default'
      ? (Array.isArray(props.characters) ? props.characters : []).filter((char) => !isEntityInNamedGroup(char))
      : props.getCharactersByGroup(groupId)
  }
  return getContactEntities(kind).filter((entity) => {
    const entityGroupId = getEntityGroupId(entity)
    return groupId === 'default'
      ? !namedContactGroupIds.value.has(entityGroupId)
      : entityGroupId === groupId
  })
}

function getContactKindLabel(kind: 'char' | 'group' | 'crowd') {
  if (kind === 'char') return '角色'
  if (kind === 'group') return '群聊'
  return '已废弃群众角色'
}

function normalizeStandardPath(value: string) {
  const normalized = `/${String(value || '').trim().replace(/^\/+/, '')}`.replace(/\/+/g, '/')
  return normalized === '/' ? '' : normalized
}

function getContactEntityName(kind: 'char' | 'group' | 'crowd', id: string) {
  const entity = getContactEntities(kind).find((item) => String(item?.id || '').trim() === String(id || '').trim())
  return String(entity?.name || id || '').trim()
}

function getContactStandardPath(kind: 'char' | 'group' | 'crowd', id: string) {
  const entity = getContactEntities(kind).find((item) => String(item?.id || '').trim() === String(id || '').trim())
  if (!entity) return ''
  const groupId = getEntityGroupId(entity)
  const groupName = groupId === 'default'
    ? '未分组'
    : String(namedContactGroups.value.find((group) => String(group.id || '').trim() === groupId)?.name || '未分组').trim()
  return `/联系人/${getContactKindLabel(kind)}/${groupName}/${String(entity?.name || id || '').trim()}`
}

const contactMoveTargetMeta = computed(() => {
  const map = new Map<string, { groupId: string; label: string; path: string; parentIds: string[] }>()
  ;(['char', 'group'] as const).forEach((kind) => {
    const typeNodeId = `type:${kind}`
    const typeLabel = getContactKindLabel(kind)
    const typePath = `/联系人/${typeLabel}`
    map.set(typeNodeId, {
      groupId: '',
      label: typeLabel,
      path: typePath,
      parentIds: []
    })
    map.set(`group:${kind}:default`, {
      groupId: 'default',
      label: '未分组',
      path: `${typePath}/未分组`,
      parentIds: [typeNodeId]
    })
    namedContactGroups.value.forEach((group) => {
      const groupId = String(group.id || '').trim()
      if (!groupId) return
      map.set(`group:${kind}:${groupId}`, {
        groupId,
        label: String(group.name || '').trim() || '未命名组别',
        path: `${typePath}/${String(group.name || '').trim() || '未命名组别'}`,
        parentIds: [typeNodeId]
      })
    })
  })
  return map
})

const contactMoveRows = computed<AppMoveDialogRow[]>(() => {
  if (!contactMoveDialog.value.visible) return []
  const kind = contactMoveDialog.value.kind
  const typeNodeId = `type:${kind}`
  const typeLabel = getContactKindLabel(kind)
  const rows: AppMoveDialogRow[] = [{
    id: typeNodeId,
    label: typeLabel,
    path: `/联系人/${typeLabel}`,
    depth: 0,
    expandable: true,
    expanded: contactMoveExpandedIds.value.has(typeNodeId),
    selectable: false
  }]
  if (!contactMoveExpandedIds.value.has(typeNodeId)) return rows
  const currentGroupIds = new Set(
    contactMoveDialog.value.sourceItems
      .map((item) => {
        const entity = getContactEntities(item.kind).find((entry) => String(entry?.id || '').trim() === item.id)
        return entity ? getEntityGroupId(entity) : ''
      })
      .filter(Boolean)
  )
  const buildRow = (groupId: string, label: string) => ({
    id: `group:${kind}:${groupId}`,
    label,
    path: `/联系人/${typeLabel}/${label}`,
    depth: 1,
    expandable: false,
    expanded: false,
    selectable: true,
    disabled: currentGroupIds.size === 1 && currentGroupIds.has(groupId)
  })
  rows.push(buildRow('default', '未分组'))
  namedContactGroups.value.forEach((group) => {
    const label = String(group.name || '').trim() || '未命名组别'
    rows.push(buildRow(String(group.id || '').trim(), label))
  })
  return rows
})

const selectedContactMoveTarget = computed(() => contactMoveTargetMeta.value.get(contactMoveDialog.value.targetId) || null)

function getContactDraggingGroupIds(kind: 'char' | 'group' | 'crowd') {
  const entities = getContactEntities(kind)
  return new Set(
    contactDrag.draggingIds.value
      .map((entry) => parseContactSelectionId(entry))
      .filter((entry): entry is { kind: 'char' | 'group' | 'crowd'; id: string } => Boolean(entry))
      .filter((entry) => entry.kind === kind)
      .map((entry) => {
        const entity = entities.find((item) => String(item?.id || '').trim() === entry.id)
        return entity ? getEntityGroupId(entity) : ''
      })
      .filter(Boolean)
  )
}

function resolveContactTargetGroupId(kind: 'char' | 'group' | 'crowd', targetId: string) {
  const parsed = parseContactSelectionId(targetId)
  if (!parsed || parsed.kind !== kind) return ''
  const entity = getContactEntities(kind).find((item) => String(item?.id || '').trim() === parsed.id)
  return entity ? getEntityGroupId(entity) : ''
}

function canContactReorderTarget(kind: 'char' | 'group' | 'crowd', targetId: string) {
  const targetGroupId = resolveContactTargetGroupId(kind, targetId)
  if (!targetGroupId) return false
  const draggingGroupIds = getContactDraggingGroupIds(kind)
  if (!draggingGroupIds.size) return false
  return draggingGroupIds.size === 1 && draggingGroupIds.has(targetGroupId)
}

function shouldRenderNamedGroup(kind: 'char' | 'group' | 'crowd', groupId: string) {
  return getEntitiesByGroup(kind, groupId).length > 0
}

function getVisibleNamedGroupsForKind(kind: 'char' | 'group' | 'crowd') {
  return namedContactGroups.value.filter((group) => shouldRenderNamedGroup(kind, String(group.id || '')))
}

function getRenderedNamedGroupsForKind(kind: 'char' | 'group' | 'crowd') {
  const visibleGroups = getVisibleNamedGroupsForKind(kind)
  if (!isContactGroupSortActive(kind) || !contactGroupDrag.projectedOrder.value.length) {
    return visibleGroups
  }
  const groupMap = new Map(visibleGroups.map((group) => [String(group.id || '').trim(), group] as const))
  return contactGroupDrag.projectedOrder.value
    .map((groupId) => groupMap.get(String(groupId || '').trim()))
    .filter((group): group is (typeof visibleGroups)[number] => Boolean(group))
}

function getRenderedCharacterGroupsForRoleSidebar() {
  return getRenderedNamedGroupsForKind('char').filter((group) => {
    const groupId = String(group.id || '').trim()
    return roleGroupMatchesSelectedFilter(groupId)
      && getRenderedCharactersByGroup(groupId).length > 0
  })
}

const renderedRoleContactGroupIds = computed(() => (
  getRenderedCharacterGroupsForRoleSidebar()
    .map((group) => String(group.id || '').trim())
    .filter(Boolean)
))
const roleContactGroupsAllCollapsed = computed(() => (
  renderedRoleContactGroupIds.value.length > 0
  && renderedRoleContactGroupIds.value.every((groupId) => isGroupCollapsed(groupId))
))
const roleContactGroupToggleTitle = computed(() => (roleContactGroupsAllCollapsed.value ? '全部展开所有组别' : '全部折叠所有组别'))
const renderedGroupContactGroupIds = computed(() => (
  getRenderedNamedGroupsForKind('group')
    .map((group) => String(group.id || '').trim())
    .filter(Boolean)
))
const groupContactGroupsAllCollapsed = computed(() => (
  renderedGroupContactGroupIds.value.length > 0
  && renderedGroupContactGroupIds.value.every((groupId) => isGroupCollapsed(groupId))
))
const groupContactGroupToggleTitle = computed(() => (groupContactGroupsAllCollapsed.value ? '全部展开所有组别' : '全部折叠所有组别'))

function hasAdjacentSelectedContactGroup(kind: 'char' | 'group' | 'crowd', groupId: string, direction: -1 | 1) {
  const ids = getRenderedNamedGroupsForKind(kind).map((group) => String(group.id || '').trim()).filter(Boolean)
  const index = ids.indexOf(String(groupId || '').trim())
  if (index < 0) return false
  const neighborId = ids[index + direction]
  return Boolean(neighborId) && contactGroupMultiSelect.isSelected(neighborId)
}

function getBaseRenderedEntitiesByGroup(kind: 'char' | 'group' | 'crowd', groupId: string) {
  return getEntitiesByGroup(kind, groupId)
}

function getProjectedContactIdsForGroup(kind: 'char' | 'group' | 'crowd', groupId: string) {
  if (!contactItemPointerDrag || !contactItemPointerDrag.dragging.value || !contactDrag.projectedOrder.value.length) return []
  const normalizedGroupId = String(groupId || 'default').trim() || 'default'
  const baseIds = getBaseRenderedEntitiesByGroup(kind, normalizedGroupId)
    .map((entity) => getContactSelectionId(kind, String(entity?.id || '')))
    .filter(Boolean)
  const baseSet = new Set(baseIds)
  const projected = contactDrag.projectedOrder.value.filter((id) => baseSet.has(String(id || '').trim()))
  return projected.length === baseIds.length ? projected : []
}

function getRenderedEntitiesByGroup(kind: 'char' | 'group' | 'crowd', groupId: string) {
  const normalizedGroupId = String(groupId || 'default').trim() || 'default'
  const entities = getBaseRenderedEntitiesByGroup(kind, normalizedGroupId)
  const projectedIds = getProjectedContactIdsForGroup(kind, normalizedGroupId)
  if (!projectedIds.length) return entities
  const bySelectionId = new Map(entities.map((entity) => [
    getContactSelectionId(kind, String(entity?.id || '')),
    entity
  ] as const))
  return projectedIds
    .map((id) => bySelectionId.get(String(id || '').trim()))
    .filter((entity): entity is NamedEntity => Boolean(entity))
}

function getRenderedCharactersByGroup(groupId: string) {
  const normalizedGroupId = String(groupId || 'default').trim() || 'default'
  if (!isRolesView.value) return getRenderedEntitiesByGroup('char', normalizedGroupId)
  if (!roleGroupMatchesSelectedFilter(normalizedGroupId)) return []
  return getRenderedEntitiesByGroup('char', normalizedGroupId).filter(matchesRoleSearch)
}

const renderedUngroupedCharacters = computed(() => getRenderedCharactersByGroup('default'))
const renderedUngroupedGroups = computed(() => getRenderedEntitiesByGroup('group', 'default'))

function getRoleVisibleCharacterOrderedIds() {
  const ids: string[] = []
  getRenderedCharacterGroupsForRoleSidebar().forEach((group) => {
    const groupId = String(group.id || 'default')
    if (isGroupCollapsed(groupId)) return
    getBaseRenderedEntitiesByGroup('char', groupId)
      .filter(matchesRoleSearch)
      .forEach((char) => {
        ids.push(getContactSelectionId('char', String(char?.id || '')))
      })
  })
  baseUngroupedCharacters.value.filter(matchesRoleSearch).forEach((char) => {
    ids.push(getContactSelectionId('char', String(char?.id || '')))
  })
  return ids
}

function getRenderedDocWorldbookRows() {
  const rows = docWorldbookRows.value
  const projectedRowOrder = docWorldbookDrag.projectedOrder.value
  if (!projectedRowOrder.length) return rows
  const rowMap = new Map(rows.map((row) => [row.id, row]))
  const projectedRows = projectedRowOrder
    .map((id) => rowMap.get(id))
    .filter((row): row is DocSidebarRow => Boolean(row))
  return projectedRows.length ? projectedRows : rows
}

const docWorldbookBaseRowsByCluster = computed<Record<string, DocSidebarRow[]>>(() => (
  props.docSidebarState?.worldbook?.rowsByCluster || {}
))

const docWorldbookRenderedRowsByCluster = computed<Record<string, DocSidebarRow[]>>(() => {
  const projectedRows = getRenderedDocWorldbookRows()
  if (!docWorldbookDrag.projectedOrder.value.length) {
    return docWorldbookBaseRowsByCluster.value
  }
  const grouped: Record<string, DocSidebarRow[]> = {}
  projectedRows.forEach((row) => {
    const clusterId = String(row.clusterId || '').trim()
    if (!clusterId) return
    if (!grouped[clusterId]) grouped[clusterId] = []
    grouped[clusterId].push(row)
  })
  return grouped
})

function getRenderedDocWorldbookRowsByCluster(clusterId: string) {
  return docWorldbookRenderedRowsByCluster.value[String(clusterId || '').trim()] || []
}

function hasAdjacentSelectedContact(kind: 'char' | 'group' | 'crowd', id: string, direction: -1 | 1) {
  return contactSelectionKit.hasAdjacentSelected(getContactSelectionId(kind, id), direction)
}

function hasContactMergedSelectionNeighbor(kind: 'char' | 'group' | 'crowd', id: string, direction: -1 | 1) {
  if (isContactSelectionExiting(kind, id)) {
    const ids = contactSelectionKit.renderedIds.value
    const selectionId = getContactSelectionId(kind, id)
    const index = ids.indexOf(selectionId)
    return index >= 0 && contactSelectionExitingIds.value.includes(ids[index + direction] || '')
  }
  if (!isContactSelected(kind, id)) return false
  return hasAdjacentSelectedContact(kind, id, direction)
}

const contactRowMenu = {
  activeMenuId: contactSelectionKit.activeMenuId,
  selectedAnchorId: contactSelectionKit.selectedAnchorId,
  getMenuMode: contactSelectionKit.getMenuMode,
  shouldShowMenuTrigger: contactSelectionKit.shouldShowMenuTrigger,
  toggleMenu: contactSelectionKit.toggleMenu,
  isMenuOpen: contactSelectionKit.isMenuOpen,
  closeMenu: contactSelectionKit.closeMenu
}

function getMemberCount(entity: NamedEntity) {
  const members = (entity as { members?: unknown }).members
  // 展示口径「N人」=角色成员+用户本人（用户 2026-07-10 拍板：用户也是群聊一员）。
  return Array.isArray(members) ? members.length + 1 : 0
}

function getAvatarPath(entity: NamedEntity) {
  const avatarPath = (entity as { avatarPath?: unknown }).avatarPath
  return typeof avatarPath === 'string' ? avatarPath : ''
}

function getEntityEmoji(entity: NamedEntity | null | undefined) {
  if (!entity) return ''
  return String((entity as { emoji?: unknown }).emoji || '').trim()
}

function getContactEntity(kind: ContactKind, id: string) {
  const normalizedId = String(id || '').trim()
  return getContactEntities(kind).find((item) => String(item?.id || '').trim() === normalizedId) || null
}

function getContactEntityAvatarUrl(kind: ContactKind, entity: NamedEntity | null) {
  if (!entity) return ''
  if (kind === 'char') return normalizeAvatarUrl(props.getCharAvatarById(entity))
  return normalizeAvatarUrl(getAvatarPath(entity))
}

function getContactEntityMeta(kind: ContactKind, entity: NamedEntity | null) {
  if (!entity) return ''
  if (kind === 'char') {
    return [
      (entity as { gender?: unknown }).gender,
      (entity as { age?: unknown }).age
    ].map((item) => String(item || '').trim()).filter(Boolean).join(' ')
  }
  if (kind === 'group') return `${getMemberCount(entity)}人`
  return '已废弃'
}

const emit = defineEmits([
  'update:sidebar-open',
  'pin-sidebar',
  'unpin-sidebar',
  'toggle-group-collapse',
  'switch-chat',
  'switch-session',
  'select-role-character',
  'select-role-unit',
  'role-brain-clipboard-change',
  'open-role-brain-drawer',
  'open-character-editor',
  'open-char-group-manager',
  'open-add-character',
  'open-create-group',
  'open-crowd-editor',
  'open-user-editor',
  'open-chat-history',
  'open-chat-utility',
  'toggle-dark-mode',
  'sort-contacts',
  'reorder-contacts',
  'create-group-from-contacts',
  'delete-contacts',
  'import-character-core-markdown',
  'delete-char-group',
  'reorder-character-groups',
  'undo-contact-ops',
  'redo-contact-ops',
  'edit-char-group',
  'edit-group',
  'edit-crowd',
  'start-resize',
  'switch-workspace-view',
  'doc-set-active-tab',
  'doc-toggle-worldbook-tree',
  'doc-expand-worldbook',
  'doc-collapse-worldbook',
  'doc-expand-worldbook-cluster',
  'doc-expand-worldbook-folder',
  'doc-collapse-worldbook-cluster',
  'doc-export-worldbook-json',
  'doc-import-worldbook-json',
  'doc-import-worldbook-json-error',
  'doc-create-cluster',
  'doc-create-page',
  'doc-create-section',
  'doc-import-world-draft',
  'doc-undo-worldbook-ops',
  'doc-redo-worldbook-ops',
  'doc-worldbook-cluster-toggle',
  'doc-worldbook-folder-toggle',
  'doc-worldbook-cluster-click',
  'doc-worldbook-reorder-clusters',
  'doc-worldbook-reorder-rows',
  'doc-worldbook-row-click',
  'doc-worldbook-menu-action',
  'doc-worldbook-reorder',
  'doc-worldbook-reorder-folders',
  'doc-worldbook-move-into',
  'doc-worldbook-drop-rows',
  'doc-set-relation-tab',
  'doc-prompt-row-click',
  'doc-open-prompt-create',
  'doc-toggle-prompt-drag',
  'doc-set-prompt-filter',
  'doc-prompt-reorder',
  'contact-dragging-change'
])

function isContactSelected(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactMultiSelect.isSelected(getContactSelectionId(kind, id))
}

function getContactExitSelectionIdSet(ids: string[]) {
  const ordered = new Set(contactSelectionKit.renderedIds.value)
  return ids
    .map((item) => String(item || '').trim())
    .filter((item) => item && ordered.has(item))
}

function clearContactSelectionExitTimers() {
  contactSelectionExitRunId += 1
  if (contactSelectionExitTimer) {
    clearTimeout(contactSelectionExitTimer)
    contactSelectionExitTimer = null
  }
  if (contactSelectionFadeTimer) {
    clearTimeout(contactSelectionFadeTimer)
    contactSelectionFadeTimer = null
  }
}

function startContactSelectionExitAnimation(ids: string[], options: { includeSingle?: boolean } = {}) {
  const exitIds = getContactExitSelectionIdSet(ids)
  clearContactSelectionExitTimers()
  const runId = contactSelectionExitRunId
  contactSelectionExitingIds.value = []
  contactSelectionFadingIds.value = []
  if (!options.includeSingle && exitIds.length <= 1) return
  contactSelectionExitingIds.value = exitIds
  void nextTick(() => {
    if (runId !== contactSelectionExitRunId) return
    contactSelectionExitTimer = setTimeout(() => {
      if (runId !== contactSelectionExitRunId) return
      contactSelectionExitTimer = null
      contactSelectionFadingIds.value = exitIds
      contactSelectionFadeTimer = setTimeout(() => {
        if (runId !== contactSelectionExitRunId) return
        contactSelectionFadeTimer = null
        contactSelectionExitingIds.value = []
        contactSelectionFadingIds.value = []
      }, 120)
    }, 96)
  })
}

function isContactSelectionExiting(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactSelectionExitingIds.value.includes(getContactSelectionId(kind, id))
}

function isContactSelectionFading(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactSelectionFadingIds.value.includes(getContactSelectionId(kind, id))
}

function isContactSelectionVisible(kind: 'char' | 'group' | 'crowd', id: string) {
  return isContactSelected(kind, id) || isContactSelectionExiting(kind, id)
}

function getActiveRoleContactSelectionId() {
  if (!isRolesView.value) return ''
  const activeId = String(immediateRoleTargetId.value || props.currentTarget || '').trim()
  if (!activeId) return ''
  const selectionId = getContactSelectionId('char', activeId)
  return contactSelectionKit.orderedIds.value.includes(selectionId) ? selectionId : ''
}

function seedActiveRoleSelectionForModifierClick(targetSelectionId: string, event: MouseEvent | PointerEvent) {
  if (!isRolesView.value || contactMultiSelect.selectedIds.value.length > 0) return false
  const activeSelectionId = getActiveRoleContactSelectionId()
  if (!activeSelectionId) return false
  contactMultiSelect.selectOnly(activeSelectionId)
  if (activeSelectionId === targetSelectionId && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    return true
  }
  return false
}

function shouldSuppressContactClick() {
  return contactItemPointerDrag.shouldSuppressClick() || contactGroupPointerDrag.shouldSuppressClick()
}

function clearContactSelections() {
  const exitingIds = [...contactMultiSelect.selectedIds.value, ...contactGroupMultiSelect.selectedIds.value]
  contactMultiSelect.clearSelection()
  contactGroupMultiSelect.clearSelection()
  startContactSelectionExitAnimation(exitingIds, { includeSingle: true })
}

function shouldClearTouchSelectionTarget(target: HTMLElement | null) {
  if (!target) return false
  if (!target.closest('.chat-sidebar-content')) return false
  return !target.closest([
    '.sidebar-item',
    '.sidebar-subgroup-header',
    '.sidebar-section-title',
    '.sidebar-section-actions',
    '.sidebar-row-action',
    '.sidebar-row-menu',
    '.doc-sidebar-row',
    '[data-doc-pointer-kind]',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    'a'
  ].join(','))
}

function handleContactClick(kind: 'char' | 'group' | 'crowd', id: string, event: MouseEvent | PointerEvent) {
  if (shouldSuppressContactClick()) {
    event.preventDefault()
    return
  }
  activeCharGroupMenuId.value = ''
  contactRowMenu.closeMenu()
  if (isRolesView.value) {
    if (kind === 'char') {
      contactGroupMultiSelect.clearSelection()
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const selectionId = getContactSelectionId(kind, id)
        if (seedActiveRoleSelectionForModifierClick(selectionId, event)) {
          return
        }
        contactMultiSelect.handleItemClick({
          id: selectionId,
          event
        })
        return
      }
      startContactSelectionExitAnimation(contactMultiSelect.selectedIds.value)
      contactMultiSelect.clearSelection()
      immediateRoleTargetId.value = id
      emit('select-role-character', id)
      emit('open-role-brain-drawer')
      clearFloatingSidebarFocus()
    }
    return
  }
  if (isTouchMode.value) {
    const selectionId = getContactSelectionId(kind, id)
    if (contactMultiSelect.isSelected(selectionId) && contactMultiSelect.selectedIds.value.length > 0) {
      clearContactSelections()
      return
    }
    contactGroupMultiSelect.clearSelection()
    emit('switch-chat', id)
    return
  }
  contactMultiSelect.handleItemClick({
    id: getContactSelectionId(kind, id),
    event,
    onDefault: () => {
      emit('switch-chat', id)
    }
  })
}

function handleContactPointerDown(kind: 'char' | 'group' | 'crowd', id: string, event: PointerEvent) {
  if (isRolesView.value && kind === 'char' && event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    immediateRoleTargetId.value = String(id || '').trim()
  }
  if (event.pointerType === 'mouse' && event.shiftKey) {
    event.preventDefault()
  }
  if (!isTouchMode.value) {
    contactMultiSelect.handlePointerDown(getContactSelectionId(kind, id), event)
  }
  if (!canManageContactKind(kind)) return
  if (!contactItemDragEnabled.value) return
  if (event.button !== 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.sidebar-row-actions') || target?.closest('.sidebar-row-action') || target?.closest('.sidebar-row-menu')) return
  event.preventDefault()
  if (target && typeof target.setPointerCapture === 'function') {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // 某些浏览器或时机下可能拒绝捕获，这里静默兜底即可。
    }
  }
  contactItemPointerDrag.begin({
    pointerId: event.pointerId,
    currentId: getContactSelectionId(kind, id),
    kind,
    startX: event.clientX,
    startY: event.clientY
  })
}

function getContactMenuMode(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactRowMenu.getMenuMode(getContactSelectionId(kind, id))
}

function shouldShowContactMenuTrigger(kind: 'char' | 'group' | 'crowd', id: string) {
  if (!canManageContactKind(kind)) return false
  return contactRowMenu.shouldShowMenuTrigger(getContactSelectionId(kind, id))
}

function updateFloatingMenuPosition(event?: Event | null) {
  sidebarFloatingMenuKit.updateFloatingMenuPosition(event)
}

function toggleContactMenu(kind: 'char' | 'group' | 'crowd', id: string, event?: Event) {
  updateFloatingMenuPosition(event)
  activeCharGroupMenuId.value = ''
  contactRowMenu.toggleMenu(getContactSelectionId(kind, id))
}

function openContactContextMenu(kind: 'char' | 'group' | 'crowd', id: string, event?: Event) {
  if (!canManageContactKind(kind)) return
  updateFloatingMenuPosition(event)
  activeChatSessionMenuId.value = ''
  activeCharGroupMenuId.value = ''
  contactSelectionKit.openContextMenuFor(getContactSelectionId(kind, id))
}

function isContactMenuOpen(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactRowMenu.isMenuOpen(getContactSelectionId(kind, id))
}

function parseContactSelectionId(value: string) {
  const [kind, ...rest] = String(value || '').split(':')
  const id = rest.join(':').trim()
  if (!id) return null
  if (kind !== 'char' && kind !== 'group' && kind !== 'crowd') return null
  return { kind, id } as const
}

const contactDragGhost = computed<ContactDragGhostState>(() => {
  if (!contactItemPointerDrag.dragging.value || !contactDrag.draggingIds.value.length) {
    return {
      visible: false,
      kind: '',
      name: '',
      meta: '',
      emoji: '',
      avatarUrl: '',
      count: 0,
      style: {} as Record<string, string>
    }
  }
  const parsedItems = contactDrag.draggingIds.value
    .map((item) => parseContactSelectionId(item))
    .filter((item): item is { kind: ContactKind; id: string } => Boolean(item))
  const preferredKind = contactDragKind.value || parsedItems[0]?.kind || ''
  if (preferredKind === 'char') {
    return {
      visible: false,
      kind: '',
      name: '',
      meta: '',
      emoji: '',
      avatarUrl: '',
      count: 0,
      style: {} as Record<string, string>
    }
  }
  const primary = parsedItems.find((item) => item.kind === preferredKind) || parsedItems[0]
  const entity = primary ? getContactEntity(primary.kind, primary.id) : null
  const name = String(entity?.name || primary?.id || '').trim() || '拖动项'
  const count = contactDraggingCount.value
  return {
    visible: Boolean(primary),
    kind: primary?.kind || '',
    name,
    meta: count > 1 ? `${count} 项` : getContactEntityMeta(primary.kind, entity),
    emoji: getEntityEmoji(entity),
    avatarUrl: getContactEntityAvatarUrl(primary.kind, entity),
    count,
    style: {
      left: `${lastContactPointer.value.x}px`,
      top: `${lastContactPointer.value.y}px`
    }
  }
})

function getContactMenuTargets(kind: 'char' | 'group' | 'crowd', id: string) {
  if (getContactMenuMode(kind, id) === 'batch') {
    return contactMultiSelect.selectedIds.value
      .map((item) => parseContactSelectionId(item))
      .filter((item): item is { kind: 'char' | 'group' | 'crowd'; id: string } => Boolean(item))
  }
  return [{ kind, id }]
}

type ContactMenuItem = {
  key: string
  label: string
  action: string
  danger?: boolean
  disabled?: boolean
  dividerBefore?: boolean
  children?: ContactMenuItem[]
}

function getContactMenuItems(kind: 'char' | 'group' | 'crowd', id: string): ContactMenuItem[] {
  const targets = getContactMenuTargets(kind, id)
  const sameKind = targets.length > 0 && targets.every((item) => item.kind === kind)
  if (getContactMenuMode(kind, id) === 'batch') {
    const charCount = targets.filter((item) => item.kind === 'char').length
    return [
      ...(charCount === targets.length && charCount > 0 ? [{ key: 'create-group', label: '新建多人会话', action: 'create-group' }] : []),
      ...(sameKind ? [{ key: 'move', label: '移入别的组别', action: 'move' }] : []),
      { key: 'delete', label: '删除元素', action: 'delete', danger: true }
    ]
  }
  const items: ContactMenuItem[] = [
    { key: 'edit', label: '编辑元素', action: 'edit' },
    { key: 'move', label: '移入别的组别', action: 'move' },
    { key: 'copy-path', label: '复制当前路径', action: 'copy-path' }
  ]
  if (kind === 'char') {
    items.push(
      {
        key: 'export-character-core-md',
        label: '导出',
        action: 'export-character-core-md',
        dividerBefore: true,
        children: [
          {
            key: 'copy-character-core-md',
            label: '导出正文',
            action: 'copy-character-core-md',
            children: [
              { key: 'copy-character-core-md-raw', label: '导到剪贴板', action: 'copy-character-core-md-raw' },
              { key: 'download-character-core-md-raw', label: '导成文件', action: 'download-character-core-md-raw' }
            ]
          },
          {
            key: 'export-character-core-md-compile',
            label: '导出生成正文提示词',
            action: 'export-character-core-md-compile',
            children: [
              { key: 'copy-character-core-md-prompt', label: '导到剪贴板', action: 'copy-character-core-md-prompt' },
              { key: 'download-character-core-md-prompt', label: '导成文件', action: 'download-character-core-md-prompt' }
            ]
          }
        ]
      },
      {
        key: 'import-character-core-md',
        label: '导入',
        action: 'import-character-core-md',
        children: [
          {
            key: 'import-character-core-body-md',
            label: '导入正文',
            action: 'import-character-core-body-md',
            children: [
              { key: 'import-character-core-md-clipboard', label: '从剪贴板导入', action: 'import-character-core-md-clipboard' },
              { key: 'import-character-core-md-file', label: '从文件导入', action: 'import-character-core-md-file' }
            ]
          }
        ]
      }
    )
  }
  items.push({ key: 'delete', label: '删除元素', action: 'delete', danger: true })
  return items
}

function getCharGroupMenuKey(kind: 'char' | 'group' | 'crowd', groupId: string) {
  return `${kind}:${groupId}`
}

function getCharGroupMenuItems(kind: 'char' | 'group' | 'crowd') {
  return [
    {
      key: 'edit-group',
      label: '编辑组别',
      action: 'edit-group'
    },
    {
      key: 'add-item',
      label: '在此组别下新建元素',
      action: 'add-item'
    },
    { key: 'delete', label: '删除组别', action: 'delete', danger: true }
  ]
}

function toggleCharGroupMenu(kind: 'char' | 'group' | 'crowd', groupId: string, event?: Event) {
  updateFloatingMenuPosition(event)
  contactRowMenu.closeMenu()
  const nextKey = getCharGroupMenuKey(kind, groupId)
  activeCharGroupMenuId.value = activeCharGroupMenuId.value === nextKey ? '' : nextKey
}

function openCharGroupContextMenu(kind: 'char' | 'group' | 'crowd', groupId: string, event?: Event) {
  if (!canManageContactKind(kind)) return
  updateFloatingMenuPosition(event)
  activeChatSessionMenuId.value = ''
  contactRowMenu.closeMenu()
  activeCharGroupMenuId.value = getCharGroupMenuKey(kind, groupId)
}

function isCharGroupMenuOpen(kind: 'char' | 'group' | 'crowd', groupId: string) {
  return activeCharGroupMenuId.value === getCharGroupMenuKey(kind, groupId)
}

function runCharGroupMenuAction(action: string, kind: 'char' | 'group' | 'crowd', groupId: string) {
  activeCharGroupMenuId.value = ''
  if (action === 'edit-group') {
    emit('edit-char-group', { kind, groupId })
    return
  }
  if (action === 'add-item') {
    if (kind === 'char') {
      emit('open-add-character', groupId)
      return
    }
    if (kind === 'group') {
      emit('open-create-group', groupId)
      return
    }
    return
  }
  if (action === 'delete') {
    emit('delete-char-group', groupId)
  }
}

function runContactMenuAction(action: string, kind: 'char' | 'group' | 'crowd', id: string) {
  activeCharGroupMenuId.value = ''
  contactRowMenu.closeMenu()
  const targets = getContactMenuTargets(kind, id)
  if (kind === 'char' && action === 'copy-character-core-md-raw') {
    exportCharacterCoreMarkdownToClipboard(id, false)
    return
  }
  if (kind === 'char' && action === 'copy-character-core-md-prompt') {
    exportCharacterCoreMarkdownToClipboard(id, true)
    return
  }
  if (kind === 'char' && action === 'download-character-core-md-raw') {
    downloadCharacterCoreMarkdownFile(id, false)
    return
  }
  if (kind === 'char' && action === 'download-character-core-md-prompt') {
    downloadCharacterCoreMarkdownFile(id, true)
    return
  }
  if (kind === 'char' && action === 'import-character-core-md-clipboard') {
    importCharacterCoreMarkdownFromClipboard(id)
    return
  }
  if (kind === 'char' && action === 'import-character-core-md-file') {
    openCharacterCoreMarkdownFileInput(id)
    return
  }
  if (action === 'edit' && kind === 'char') {
    emit('open-character-editor', id)
    return
  }
  if (action === 'edit' && kind === 'group') {
    emit('edit-group', id)
    return
  }
  if (action === 'create-group') {
    emit('create-group-from-contacts', targets)
    return
  }
  if (action === 'move') {
    openContactMoveDialog(kind, targets)
    return
  }
  if (action === 'copy-path') {
    copyText(getContactStandardPath(kind, id))
    return
  }
  if (action === 'delete') {
    emit('delete-contacts', targets)
  }
}

function getCharacterById(id: string) {
  return props.characters.find((item) => String(item.id || '').trim() === String(id || '').trim())
}

function buildCharacterCoreMarkdownExportText(character: Record<string, unknown>, withPrompt: boolean) {
  const markdown = buildCharacterCoreMarkdown(character)
  return withPrompt ? buildCharacterCoreMarkdownPrompt(markdown) : markdown
}

async function exportCharacterCoreMarkdownToClipboard(id: string, withPrompt: boolean) {
  const character = getCharacterById(id)
  if (!character) {
    toast('未找到角色，无法导出', 'error')
    return
  }
  const ok = await writeClipboardText(buildCharacterCoreMarkdownExportText(character as Record<string, unknown>, withPrompt))
  toast(ok ? `角色 Markdown ${withPrompt ? '提示词版' : '原文'}已复制到剪贴板` : '当前环境无法写入剪贴板', ok ? 'success' : 'error')
}

function downloadCharacterCoreMarkdownFile(id: string, withPrompt: boolean) {
  const character = getCharacterById(id)
  if (!character) {
    toast('未找到角色，无法导出', 'error')
    return
  }
  const filename = withPrompt
    ? getCharacterCoreMarkdownFilename({ ...(character as Record<string, unknown>), name: `${String(character.name || '角色')}_提示词版` })
    : getCharacterCoreMarkdownFilename(character as Record<string, unknown>)
  downloadTextFile(filename, buildCharacterCoreMarkdownExportText(character as Record<string, unknown>, withPrompt))
  toast(`角色 Markdown ${withPrompt ? '提示词版' : '原文'}文件已导出`, 'success')
}

async function importCharacterCoreMarkdownFromClipboard(id: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    toast('当前环境无法读取剪贴板', 'error')
    return
  }
  try {
    const markdown = await navigator.clipboard.readText()
    importCharacterCoreMarkdownText(id, markdown)
  } catch (error) {
    toast(`读取剪贴板失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function openCharacterCoreMarkdownFileInput(id: string) {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,text/markdown,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => importCharacterCoreMarkdownText(id, String(reader.result || ''))
    reader.onerror = () => toast('读取 Markdown 文件失败', 'error')
    reader.readAsText(file, 'utf-8')
  }, { once: true })
  input.click()
}

function importCharacterCoreMarkdownText(id: string, markdown: string) {
  try {
    const changes = parseCharacterCoreMarkdown(markdown)
    emit('import-character-core-markdown', { characterId: id, changes: changes as CharacterCoreMarkdownChanges })
  } catch (error) {
    toast(`导入角色 Markdown 失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function downloadTextFile(filename: string, text: string) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function copyText(text: string) {
  writeClipboardText(text).catch(() => {})
}

async function writeClipboardText(text: string) {
  const safeText = String(text || '').trim()
  if (!safeText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(safeText)
    return true
  } catch {
    return false
  }
}

function openContactMoveDialog(kind: 'char' | 'group' | 'crowd', items: Array<{ kind: 'char' | 'group' | 'crowd'; id: string }>) {
  const safeItems = items.filter((item) => item.kind === kind)
  if (!safeItems.length) return
  contactMoveDialog.value = {
    visible: true,
    kind,
    sourceItems: safeItems,
    sourceLabels: safeItems.map((item) => getContactEntityName(kind, item.id)),
    targetId: '',
    pathInput: ''
  }
  contactMoveExpandedIds.value = new Set([`type:${kind}`])
}

function closeContactMoveDialog() {
  contactMoveDialog.value = {
    visible: false,
    kind: 'char',
    sourceItems: [],
    sourceLabels: [],
    targetId: '',
    pathInput: ''
  }
  contactMoveExpandedIds.value = new Set()
}

function toggleContactMoveTarget(nodeId: string) {
  const next = new Set(contactMoveExpandedIds.value)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  contactMoveExpandedIds.value = next
}

function selectContactMoveTarget(nodeId: string) {
  const meta = contactMoveTargetMeta.value.get(nodeId)
  if (!meta || !nodeId.startsWith('group:')) return
  contactMoveDialog.value.targetId = nodeId
  contactMoveDialog.value.pathInput = meta.path
}

function jumpToContactMovePath() {
  const targetPath = normalizeStandardPath(contactMoveDialog.value.pathInput)
  if (!targetPath) return
  const matched = [...contactMoveTargetMeta.value.entries()].find(([, meta]) => normalizeStandardPath(meta.path) === targetPath)
  if (!matched || !matched[0].startsWith('group:')) return
  contactMoveExpandedIds.value = new Set([...contactMoveExpandedIds.value, ...matched[1].parentIds])
  selectContactMoveTarget(matched[0])
}

function confirmContactMoveDialog() {
  const target = selectedContactMoveTarget.value
  if (!target || !contactMoveDialog.value.sourceItems.length) return
  emit('reorder-contacts', {
    items: contactMoveDialog.value.sourceItems,
    targetGroupId: target.groupId
  })
  closeContactMoveDialog()
}

function getVisibleContactRows(kind: 'char' | 'group' | 'crowd') {
  return getVisibleSidebarElements(`.sidebar-item[data-contact-kind="${kind}"][data-multi-select-id]`)
}

function getContactSourceGroupId(kind: 'char' | 'group' | 'crowd') {
  const source = contactDrag.draggingIds.value
    .map((item) => parseContactSelectionId(item))
    .find((item) => item?.kind === kind)
  if (!source) return ''
  const entity = getContactEntities(kind).find((item) => String(item?.id || '').trim() === source.id)
  return entity ? getEntityGroupId(entity) : ''
}

function resolvePointerContactDropTarget(kind: 'char' | 'group' | 'crowd', pointerX: number, pointerY: number) {
  if (typeof document === 'undefined') return null
  const selector = `.sidebar-item[data-contact-kind="${kind}"][data-multi-select-id]`
  const draggingIds = new Set(contactDrag.draggingIds.value)
  const exactCandidate = document.elementFromPoint(pointerX, pointerY)?.closest(selector) as HTMLElement | null
  const exactId = String(exactCandidate?.dataset.multiSelectId || '').trim()
  const sourceGroupId = getContactSourceGroupId(kind)
  const exactGroupId = String(exactCandidate?.dataset.contactGroupId || 'default').trim() || 'default'
  const exactRow = exactId && !draggingIds.has(exactId) && (!sourceGroupId || exactGroupId === sourceGroupId)
    ? exactCandidate
    : null
  const rows = getVisibleContactRows(kind)
    .filter((row) => {
      const rowId = String(row.dataset.multiSelectId || '').trim()
      const groupId = String(row.dataset.contactGroupId || 'default').trim() || 'default'
      return rowId && !draggingIds.has(rowId) && (!sourceGroupId || groupId === sourceGroupId)
    })
  return resolveBufferedDropTarget(rows, pointerY, exactRow)
}

function updateContactPointerPreview(pointerX: number, pointerY: number) {
  if (!contactItemPointerDrag.dragging.value || !contactDragKind.value) return
  const resolved = resolvePointerContactDropTarget(contactDragKind.value, pointerX, pointerY)
  if (resolved && canContactReorderTarget(contactDragKind.value, resolved.targetId)) {
    contactDrag.previewDrop(resolved.targetId, resolved.position)
    return
  }
  contactDrag.clearPreview()
}

function clearContactPointerDrag() {
  contactItemPointerDrag.clear()
}

function isContactPointerDraggingItem(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactItemPointerDrag.dragging.value && contactDrag.draggingIds.value.includes(getContactSelectionId(kind, id))
}

function isContactItemDropTarget(kind: 'char' | 'group' | 'crowd', id: string) {
  return contactDragDropTargetId.value === getContactSelectionId(kind, id)
}

function isContactItemDropTargetBefore(kind: 'char' | 'group' | 'crowd', id: string) {
  return isContactItemDropTarget(kind, id) && contactDragDropPosition.value === 'before'
}

function isContactItemDropTargetAfter(kind: 'char' | 'group' | 'crowd', id: string) {
  return isContactItemDropTarget(kind, id) && contactDragDropPosition.value === 'after'
}

function isContactGroupSortActive(kind: 'char' | 'group' | 'crowd') {
  return contactDragSortEnabled.value
}

function toggleContactItemDragMode(kind: ContactKind) {
  if (contactDragSortEnabled.value && activeContactDragSection.value === kind) {
    contactDragModeKit.setDragMode(false)
  } else {
    activeContactDragSection.value = kind
    contactDragModeKit.setDragMode(true)
  }
  nextTick(() => {
    syncAllContactSectionScroll()
  })
  clearContactSelections()
  clearContactPointerDrag()
  clearContactGroupPointerDrag()
  docWorldbookDrag.clearDragState()
}

function toggleContactGroupDragMode(kind: 'char' | 'group' | 'crowd') {
  contactDragModeKit.toggleSinkMode(kind)
  contactMultiSelect.clearSelection()
  contactGroupMultiSelect.clearSelection()
  clearContactPointerDrag()
  clearContactGroupPointerDrag()
}

function persistContactDragMode() {
  contactDragModeKit.persist()
}

function handleContactGroupHeaderClick(kind: 'char' | 'group' | 'crowd', groupId: string, event: MouseEvent | PointerEvent) {
  if (contactGroupPointerDrag.dragging.value || shouldSuppressContactClick()) return
  activeCharGroupMenuId.value = ''
  contactRowMenu.closeMenu()
  if (!contactDragSortEnabled.value) {
    contactMultiSelect.clearSelection()
    contactGroupMultiSelect.clearSelection()
    emit('toggle-group-collapse', groupId)
    return
  }
  if (isTouchMode.value) {
    contactMultiSelect.clearSelection()
    emit('toggle-group-collapse', groupId)
    return
  }
  contactGroupMultiSelect.handleItemClick({
    id: String(groupId || '').trim(),
    event
  })
}

function handleContactGroupHeaderDoubleClick(kind: 'char' | 'group' | 'crowd', groupId: string) {
  if (!isContactGroupSortActive(kind) || shouldSuppressContactClick()) return
  emit('toggle-group-collapse', groupId)
}

function handleContactGroupHeaderPointerDown(kind: 'char' | 'group' | 'crowd', groupId: string, event: PointerEvent) {
  if (!canManageContactKind(kind)) return
  if (!contactDragSortEnabled.value) return
  if (event.button !== 0) return
  event.preventDefault()
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target && typeof target.setPointerCapture === 'function') {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // 某些浏览器或时机下可能拒绝捕获，这里静默兜底即可。
    }
  }
  if (!isTouchMode.value) {
    contactGroupMultiSelect.handlePointerDown(String(groupId || '').trim(), event)
  }
  if (target?.closest('.sidebar-row-action') || target?.closest('.sidebar-row-menu')) return
  contactGroupPointerDrag.begin({
    pointerId: event.pointerId,
    currentId: String(groupId || '').trim(),
    kind,
    startX: event.clientX,
    startY: event.clientY
  })
}

function handleContactGroupHeaderPointerMove(event: PointerEvent) {
  if (!contactDragSortEnabled.value) return
  if (isTouchMode.value) return
  contactGroupMultiSelect.handlePointerMove(event)
}

function handleContactGroupHeaderPointerEnd(kind: 'char' | 'group' | 'crowd', groupId: string, event: PointerEvent) {
  if (!contactDragSortEnabled.value) {
    return
  }
  if (isTouchMode.value) return
  contactGroupMultiSelect.handlePointerEnd(event)
}

function getVisibleGroupHeaders(kind: 'char' | 'group' | 'crowd') {
  return getVisibleSidebarElements(`[data-contact-group-header="true"][data-contact-group-kind="${kind}"][data-character-group-id]`)
}

function resolvePointerGroupHeaderDropTarget(kind: 'char' | 'group' | 'crowd', pointerX: number, pointerY: number) {
  if (typeof document === 'undefined') return null
  const selector = `[data-contact-group-header="true"][data-contact-group-kind="${kind}"][data-character-group-id]`
  const draggingIds = new Set(contactGroupDrag.draggingIds.value)
  const exactCandidate = document.elementFromPoint(pointerX, pointerY)?.closest(selector) as HTMLElement | null
  const exactId = String(exactCandidate?.dataset.characterGroupId || '').trim()
  const exactHeader = exactId && !draggingIds.has(exactId) ? exactCandidate : null
  const headers = getVisibleGroupHeaders(kind)
    .filter((header) => {
      const headerId = String(header.dataset.characterGroupId || '').trim()
      return headerId && !draggingIds.has(headerId)
    })
  const resolved = resolveBufferedDropTarget(headers, pointerY, exactHeader, {
    readId: (element) => String(element.dataset.characterGroupId || '').trim()
  })
  if (!resolved) return null
  return {
    targetId: String(resolved.targetId || '').trim(),
    position: resolved.position
  }
}

function updateContactGroupPointerPreview(pointerX: number, pointerY: number) {
  const kind = contactGroupPointerDrag.pending.value?.kind
  if (!kind) {
    contactGroupDrag.clearPreview()
    return
  }
  const resolved = resolvePointerGroupHeaderDropTarget(kind, pointerX, pointerY)
  if (!resolved) {
    contactGroupDrag.clearPreview()
    return
  }
  contactGroupDrag.previewDrop(resolved.targetId, resolved.position)
}

function clearContactGroupPointerDrag() {
  contactGroupPointerDrag.clear()
}

function isContactGroupHeaderDragging(groupId: string) {
  return contactGroupPointerDrag.dragging.value && contactGroupDrag.draggingIds.value.includes(String(groupId || '').trim())
}

function isContactGroupHeaderDropTarget(groupId: string) {
  return contactGroupDrag.dropTargetId.value === String(groupId || '').trim()
}

function isContactGroupHeaderDropTargetBefore(groupId: string) {
  return isContactGroupHeaderDropTarget(groupId) && contactGroupDropPosition.value === 'before'
}

function isContactGroupHeaderDropTargetAfter(groupId: string) {
  return isContactGroupHeaderDropTarget(groupId) && contactGroupDropPosition.value === 'after'
}

function commitProjectedContactGroupDrop(kind?: 'char' | 'group' | 'crowd') {
  let payload = contactGroupDrag.buildProjectedDropPayload()
  if (!payload && kind) {
    const resolved = resolvePointerGroupHeaderDropTarget(kind, lastContactPointer.value.x, lastContactPointer.value.y)
    if (resolved) {
      payload = {
        draggedIds: [...contactGroupDrag.draggingIds.value],
        targetId: resolved.targetId,
        position: resolved.position
      }
    }
  }
  if (payload) {
    emit('reorder-character-groups', {
      draggedIds: payload.draggedIds,
      targetId: payload.targetId,
      position: payload.position
    })
  }
}

function commitProjectedContactDrop() {
  const items = contactDrag.draggingIds.value
    .map((item) => parseContactSelectionId(item))
    .filter((item): item is { kind: 'char' | 'group' | 'crowd'; id: string } => Boolean(item))
  if (!items.length) {
    return
  }
  let payload = contactDrag.buildProjectedDropPayload()
  if (!payload && contactDragKind.value) {
    const resolved = resolvePointerContactDropTarget(contactDragKind.value, lastContactPointer.value.x, lastContactPointer.value.y)
    if (resolved && canContactReorderTarget(contactDragKind.value, resolved.targetId)) {
      payload = {
        draggedIds: [...contactDrag.draggingIds.value],
        targetId: resolved.targetId,
        position: resolved.position
      }
    }
  }
  if (payload) {
    const target = parseContactSelectionId(payload.targetId)
    if (target) {
      emit('reorder-contacts', {
        items,
        target,
        position: payload.position
      })
      return
    }
  }
}

function handleWindowContactPointerMove(event: PointerEvent) {
  if (contactSectionResizeState.value && event.pointerId === contactSectionResizeState.value.pointerId) {
    const availableHeight = getContactSectionAvailableHeight()
    if (availableHeight <= 0) return
    const minRatio = getContactSectionMinRatio()
    const deltaRatio = (event.clientY - contactSectionResizeState.value.startY) / availableHeight
    if (contactSectionResizeState.value.pair === 'char-group') {
      const pairTotal = contactSectionResizeState.value.startChar + contactSectionResizeState.value.startGroup
      const nextChar = Math.min(pairTotal - minRatio, Math.max(minRatio, contactSectionResizeState.value.startChar + deltaRatio))
      normalizeContactSectionRatios({
        char: nextChar,
        group: pairTotal - nextChar,
        crowd: contactSectionResizeState.value.startCrowd
      })
    } else if (contactSectionResizeState.value.pair === 'group-crowd') {
      const pairTotal = contactSectionResizeState.value.startGroup + contactSectionResizeState.value.startCrowd
      const nextGroup = Math.min(pairTotal - minRatio, Math.max(minRatio, contactSectionResizeState.value.startGroup + deltaRatio))
      normalizeContactSectionRatios({
        char: contactSectionResizeState.value.startChar,
        group: nextGroup,
        crowd: pairTotal - nextGroup
      })
    } else {
      const pairTotal = contactSectionResizeState.value.startChar + contactSectionResizeState.value.startCrowd
      const nextChar = Math.min(pairTotal - minRatio, Math.max(minRatio, contactSectionResizeState.value.startChar + deltaRatio))
      normalizeContactSectionRatios({
        char: nextChar,
        group: contactSectionResizeState.value.startGroup,
        crowd: pairTotal - nextChar
      })
    }
    nextTick(() => {
      syncAllContactSectionScroll()
    })
    return
  }
  if (contactSliderDragState.value && event.pointerId === contactSliderDragState.value.pointerId) {
    updateContactSectionSliderFromPointer(contactSliderDragState.value.kind, event.clientY, contactSliderDragState.value.track)
    return
  }
  const pendingDoc = pendingDocSidebarDrag.value
  if (pendingDoc) {
    if (!docSidebarPointerDragging.value) {
      const movedX = Math.abs(event.clientX - pendingDoc.startX)
      const movedY = Math.abs(event.clientY - pendingDoc.startY)
      if (movedX < 4 && movedY < 4) return
      getDocDragController(pendingDoc.mode).startDrag(pendingDoc.currentId)
      docSidebarPointerDragging.value = true
    }
    updateDocPointerPreview(pendingDoc.mode, event.clientX, event.clientY)
    return
  }
  if (contactGroupPointerDrag.pending.value) {
    contactGroupPointerDrag.handleMove(event)
    return
  }
  contactItemPointerDrag.handleMove(event)
}

async function handleWindowContactPointerUp(event: PointerEvent) {
  if (contactSectionResizeState.value && event.pointerId === contactSectionResizeState.value.pointerId) {
    persistContactSectionRatios()
    contactSectionResizeState.value = null
    nextTick(() => {
      syncAllContactSectionScroll()
    })
    return
  }
  if (contactSliderDragState.value && event.pointerId === contactSliderDragState.value.pointerId) {
    updateContactSectionSliderFromPointer(contactSliderDragState.value.kind, event.clientY, contactSliderDragState.value.track)
    contactSliderDragState.value = null
    return
  }
  const pendingDoc = pendingDocSidebarDrag.value
  if (pendingDoc && event.pointerId === pendingDoc.pointerId) {
    if (docSidebarPointerDragging.value) {
      suppressDocClickUntil.value = Date.now() + 80
      if (pendingDoc.mode === 'worldbook-doc' || pendingDoc.mode === 'worldbook-folder' || pendingDoc.mode === 'worldbook-cluster') {
        const previewTarget = docWorldbookPreviewTarget.value
        const controller = getDocDragController(pendingDoc.mode)
        const rowKind = getDocWorldbookRowKind(pendingDoc.mode)
        const payloadIds = getDraggedDocWorldbookPayloadIds(rowKind, controller.draggingIds.value)
        const targetRowId = resolveDocWorldbookTargetRowId(previewTarget)
        if (previewTarget && canDocWorldbookSinkTarget(rowKind, previewTarget) && payloadIds.length) {
          emit('doc-worldbook-move-into', {
            rowKind,
            ids: payloadIds,
            targetKind: previewTarget.kind === 'cluster' ? 'cluster' : 'folder',
            targetId: String(previewTarget.id || '').trim()
          })
          clearDocSidebarPointerDrag()
          return
        }
        if (!previewTarget || !controller.draggingIds.value.length || !targetRowId || !canDocWorldbookReorderTarget(rowKind, previewTarget)) {
          clearDocSidebarPointerDrag()
          return
        }
        emit('doc-worldbook-reorder-rows', {
          rowIds: controller.draggingIds.value.map((item) => String(item || '').trim()).filter(Boolean),
          targetId: targetRowId,
          position: previewTarget.mode === 'after' ? 'after' : 'before'
        })
        clearDocSidebarPointerDrag()
        return
      }
      commitProjectedDocSidebarDrop(pendingDoc.mode)
      return
    }
    clearPendingDocSidebarDrag()
    return
  }
  if (contactGroupPointerDrag.pending.value) {
    await contactGroupPointerDrag.handleUp(event)
    return
  }
  await contactItemPointerDrag.handleUp(event)
}

function handleWindowContactPointerCancel(event: PointerEvent) {
  if (contactSectionResizeState.value && event.pointerId === contactSectionResizeState.value.pointerId) {
    normalizeContactSectionRatios({
      char: contactSectionResizeState.value.startChar,
      group: contactSectionResizeState.value.startGroup,
      crowd: contactSectionResizeState.value.startCrowd
    })
    contactSectionResizeState.value = null
    nextTick(() => {
      syncAllContactSectionScroll()
    })
    return
  }
  if (contactSliderDragState.value && event.pointerId === contactSliderDragState.value.pointerId) {
    contactSliderDragState.value = null
    return
  }
  const pendingDoc = pendingDocSidebarDrag.value
  if (pendingDoc && event.pointerId === pendingDoc.pointerId) {
    if (docSidebarPointerDragging.value) {
      clearDocSidebarPointerDrag()
      return
    }
    clearPendingDocSidebarDrag()
    return
  }
  if (contactGroupPointerDrag.pending.value) {
    contactGroupPointerDrag.handleCancel(event)
    return
  }
  contactItemPointerDrag.handleCancel(event)
}

function handleDocTabClick(tab: DocSidebarState['activeTab']) {
  if (!isDocLibraryModuleTabEnabled(tab)) {
    emit('doc-set-active-tab', 'worldbook')
    return
  }
  emit('doc-set-active-tab', tab)
}

function handleDocWorldbookRowClick(row: DocSidebarRow, event: MouseEvent) {
  if (Date.now() < suppressDocClickUntil.value) {
    event.preventDefault()
    return
  }
  activeDocMenuId.value = ''
  emit('doc-worldbook-row-click', {
    kind: row.kind,
    folderId: row.folderId,
    itemId: row.itemId,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey
  })
}

function handleDocPromptRowClick(row: PromptSidebarRow) {
  if (docPromptDraggedId.value || docPromptDropTargetId.value) return
  emit('doc-prompt-row-click', { itemId: row.id })
}

function toggleDocPromptFilterMenu(event?: Event) {
  if (docPromptFilterMenuOpen.value) {
    docPromptFilterMenuOpen.value = false
    docPromptFilterFloatingMenuKit.clearFloatingMenuPosition()
    return
  }
  docPromptFilterFloatingMenuKit.updateFloatingMenuPosition(event)
  docPromptFilterMenuOpen.value = true
}

function setDocPromptFilter(mode: 'all' | 'required') {
  docPromptFilterMenuOpen.value = false
  docPromptFilterFloatingMenuKit.clearFloatingMenuPosition()
  emit('doc-set-prompt-filter', mode)
}

function canDragDocPromptRow(row: PromptSidebarRow) {
  return docPromptDragEnabled.value && row.recordKind === 'preset'
}

function startDocPromptDrag(row: PromptSidebarRow, event: DragEvent) {
  if (!canDragDocPromptRow(row)) return
  docPromptDraggedId.value = row.id
  event.dataTransfer?.setData('text/plain', row.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function previewDocPromptDrop(row: PromptSidebarRow, event: DragEvent) {
  if (!docPromptDraggedId.value || row.recordKind !== 'preset' || row.id === docPromptDraggedId.value) return
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  docPromptDropTargetId.value = row.id
  docPromptDropPosition.value = rect && event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function commitDocPromptDrop(row: PromptSidebarRow) {
  const sourceId = docPromptDraggedId.value
  const targetId = row.id
  const position = docPromptDropPosition.value
  clearDocPromptDrag()
  if (!sourceId || !targetId || sourceId === targetId || row.recordKind !== 'preset') return
  emit('doc-prompt-reorder', { sourceId, targetId, position })
}

function clearDocPromptDrag() {
  docPromptDraggedId.value = ''
  docPromptDropTargetId.value = ''
  docPromptDropPosition.value = 'after'
}

function getDocDragController(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster') {
  if (mode === 'worldbook-cluster') return docWorldbookClusterDrag
  return docWorldbookDrag
}

function getDocPointerSelector(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster') {
  return `[data-doc-pointer-kind="${mode}"][data-doc-pointer-id]`
}

function getVisibleDocPointerRows(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster') {
  return getVisibleSidebarElements(getDocPointerSelector(mode))
}

function resolvePointerWorldbookRowDropTarget(pointerX: number, pointerY: number) {
  return resolvePointerDropTarget({
    selector: '.doc-sidebar-row[data-doc-drag-id]',
    pointerX,
    pointerY,
    readId: (element) => String(element.dataset.docDragId || '').trim()
  })
}

function resolvePointerDocDropTarget(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster', pointerX: number, pointerY: number) {
  if (mode === 'worldbook-doc' || mode === 'worldbook-folder') {
    return resolvePointerWorldbookRowDropTarget(pointerX, pointerY)
  }
  return resolvePointerDropTarget({
    selector: getDocPointerSelector(mode),
    pointerX,
    pointerY
  })
}

function updateDocPointerPreview(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster', pointerX: number, pointerY: number) {
  if (mode === 'worldbook-doc' || mode === 'worldbook-folder' || mode === 'worldbook-cluster') {
    const rowKind = getDocWorldbookRowKind(mode)
    const resolvedTarget = resolveWorldbookTreePointerTarget({
      pendingRowKind: rowKind,
      pointerX,
      pointerY,
      sinkEnabled: docWorldbookFolderSortOnly.value,
      sinkOnlyMode: false,
      autoExpandState: docWorldbookAutoExpandState,
      resolveBufferedTarget: (bufferedKind) => {
        if (bufferedKind === 'cluster') {
          const resolved = resolvePointerDropTarget({
            selector: '[data-doc-pointer-kind="worldbook-cluster"][data-doc-pointer-id]',
            pointerX,
            pointerY,
            readId: (element) => String(element.dataset.docPointerId || '').trim()
          })
          return resolved ? { kind: 'cluster', id: resolved.targetId, mode: resolved.position } : null
        }
        const resolved = resolvePointerWorldbookRowDropTarget(pointerX, pointerY)
        if (!resolved) return null
        const row = docWorldbookRowMap.value.get(resolved.targetId)
        return {
          kind: row?.kind === 'folder' ? 'folder' : 'document',
          id: row?.kind === 'folder' ? String(row.folderId || '').trim() : String(row?.itemId || '').trim(),
          mode: resolved.position
        }
      },
      resolveClusterHit: ({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        const clusterHeader = element?.closest('[data-doc-pointer-kind="worldbook-cluster"][data-doc-pointer-id]') as HTMLElement | null
        const clusterId = String(clusterHeader?.dataset.docPointerId || '').trim()
        if (!clusterHeader || !clusterId) return null
        const cluster = worldbookClusterMap.value.get(clusterId)
        return {
          id: clusterId,
          rect: clusterHeader.getBoundingClientRect(),
          open: Boolean(cluster?.open)
        }
      },
      resolveRowHit: ({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        const rowElement = element?.closest('.doc-sidebar-row[data-doc-drag-id][data-doc-drag-kind]') as HTMLElement | null
        const rowId = String(rowElement?.dataset.docDragId || '').trim()
        if (!rowElement || !rowId) return null
        const row = docWorldbookRowMap.value.get(rowId)
        if (!row) return null
        if (row.kind === 'folder') {
          return {
            id: String(row.folderId || '').trim(),
            kind: 'folder' as const,
            rect: rowElement.getBoundingClientRect(),
            open: Boolean(row.open)
          }
        }
        return {
          id: String(row.itemId || '').trim(),
          kind: 'document' as const,
          rect: rowElement.getBoundingClientRect()
        }
      },
      resolveTreeRect: () => (document.querySelector('.doc-sidebar-tree') as HTMLElement | null)?.getBoundingClientRect() || null,
      onExpandCluster: (clusterId) => {
        emit('doc-expand-worldbook-cluster', clusterId)
      },
      onExpandFolder: (folderId) => {
        emit('doc-expand-worldbook-folder', folderId)
      }
    })
    const canUseReorderPreview = canDocWorldbookReorderTarget(rowKind, resolvedTarget)
    const canUseSinkPreview = canDocWorldbookSinkTarget(rowKind, resolvedTarget)
    const validTarget = canUseReorderPreview || canUseSinkPreview ? resolvedTarget : null
    docWorldbookPreviewTarget.value = validTarget
    const controller = getDocDragController(mode)
    if (!validTarget || validTarget.mode === 'inside') {
      controller.clearPreview()
      if (mode !== 'worldbook-cluster') {
        docWorldbookClusterDrag.clearPreview()
      }
      return
    }
    if (validTarget.kind === 'cluster') {
      docWorldbookClusterDrag.previewDrop(String(validTarget.id || '').trim(), validTarget.mode)
      docWorldbookDrag.clearPreview()
      return
    }
    const targetRow = validTarget.kind === 'folder'
      ? docWorldbookRowByFolderId.value.get(String(validTarget.id || '').trim())
      : docWorldbookRowByItemId.value.get(String(validTarget.id || '').trim())
    const targetId = String(targetRow?.id || '').trim()
    if (!targetId) {
      controller.clearPreview()
      return
    }
    controller.previewDrop(targetId, validTarget.mode)
    docWorldbookClusterDrag.clearPreview()
    return
  }
  const resolved = resolvePointerDocDropTarget(mode, pointerX, pointerY)
  const controller = getDocDragController(mode)
  if (!resolved) {
    controller.clearPreview()
    return
  }
  controller.previewDrop(resolved.targetId, resolved.position)
}

function clearPendingDocSidebarDrag() {
  pendingDocSidebarDrag.value = null
}

function clearDocSidebarPointerDrag() {
  clearPendingDocSidebarDrag()
  docSidebarPointerDragging.value = false
  docWorldbookPreviewTarget.value = null
  resetWorldbookTreeAutoExpandState(docWorldbookAutoExpandState)
  docWorldbookDrag.clearDragState()
  docWorldbookClusterDrag.clearDragState()
}

function handleDocSidebarPointerDown(row: DocSidebarRow, section: 'worldbook', event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.sidebar-row-action') || target?.closest('.sidebar-row-menu')) return
  if (section === 'worldbook') {
    if (row.kind === 'document' && isDocWorldbookItemDragEnabled()) {
      pendingDocSidebarDrag.value = {
        pointerId: event.pointerId,
        mode: 'worldbook-doc',
        currentId: row.id,
        startX: event.clientX,
        startY: event.clientY
      }
      return
    }
    if (row.kind === 'folder' && isDocWorldbookFolderDragEnabled() && row.folderId) {
      pendingDocSidebarDrag.value = {
        pointerId: event.pointerId,
        mode: 'worldbook-folder',
        currentId: row.id,
        startX: event.clientX,
        startY: event.clientY
      }
      return
    }
  }
}

function handleDocWorldbookClusterPointerDown(clusterId: string, event: PointerEvent) {
  if (event.button !== 0 || !isDocWorldbookClusterDragEnabled()) return
  event.preventDefault()
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.sidebar-row-action') || target?.closest('.sidebar-row-menu')) return
  pendingDocSidebarDrag.value = {
    pointerId: event.pointerId,
    mode: 'worldbook-cluster',
    currentId: String(clusterId || '').trim(),
    startX: event.clientX,
    startY: event.clientY
  }
}

function handleDocWorldbookClusterClick(clusterId: string, event: MouseEvent | PointerEvent) {
  if (docSidebarPointerDragging.value) return
  if (docWorldbookDragSortEnabled.value) {
    event.preventDefault()
    return
  }
  activeDocMenuId.value = ''
  emit('doc-worldbook-cluster-click', {
    clusterId,
    shiftKey: Boolean(event.shiftKey),
    ctrlKey: Boolean(event.ctrlKey),
    metaKey: Boolean(event.metaKey)
  })
}

function getDocWorldbookSoneClusterRowId(clusterId: string) {
  return `cluster:${String(clusterId || '').trim()}`
}

function getDocWorldbookSoneRow(rowId: string) {
  return docWorldbookSoneRowMap.value.get(String(rowId || '').trim())
}

function getDocWorldbookSoneRowClusterId(row: DocWorldbookSoneRow) {
  if (row.sourceKind === 'cluster') return String(row.clusterId || row.dragId || '').trim()
  return String(row.sourceRow?.clusterId || row.clusterId || '').trim()
}

function handleDocWorldbookSoneSelect(rowId: string, event: MouseEvent | KeyboardEvent) {
  const row = getDocWorldbookSoneRow(rowId)
  if (!row) return
  const shouldToggle = shouldToggleDocWorldbookSoneRowOnSelect(row, event)
  if (row.sourceKind === 'cluster') {
    handleDocWorldbookClusterClick(getDocWorldbookSoneRowClusterId(row), event as MouseEvent)
    if (shouldToggle) toggleDocWorldbookSoneRow(rowId)
    return
  }
  if (row.sourceRow) {
    handleDocWorldbookRowClick(row.sourceRow, event as MouseEvent)
    if (shouldToggle) toggleDocWorldbookSoneRow(rowId)
  }
}

function shouldToggleDocWorldbookSoneRowOnSelect(row: DocWorldbookSoneRow, event: MouseEvent | KeyboardEvent) {
  if (row.kind !== 'folder') return false
  if (docSidebarPointerDragging.value || docWorldbookDragSortEnabled.value) return false
  const asMouse = event as MouseEvent
  return !asMouse.shiftKey && !asMouse.ctrlKey && !asMouse.metaKey
}

function toggleDocWorldbookSoneRow(rowId: string) {
  const row = getDocWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    emit('doc-worldbook-cluster-toggle', getDocWorldbookSoneRowClusterId(row))
    return
  }
  if (row.sourceRow?.kind === 'folder') {
    emit('doc-worldbook-folder-toggle', String(row.sourceRow.folderId || ''))
  }
}

function toggleDocWorldbookSoneMenu(rowId: string, event: MouseEvent) {
  const row = getDocWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    toggleDocWorldbookClusterMenu(getDocWorldbookSoneRowClusterId(row), event)
    return
  }
  if (row.sourceRow) {
    toggleDocWorldbookMenu(row.sourceRow, event)
  }
}

function runDocWorldbookSoneMenuAction(action: string, rowId: string) {
  const row = getDocWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    runDocWorldbookClusterMenuAction(action, getDocWorldbookSoneRowClusterId(row))
    return
  }
  if (row.sourceRow) {
    runDocWorldbookMenuAction(action, row.sourceRow)
  }
}

function handleDocWorldbookSonePointerDown(rowId: string, event: PointerEvent) {
  const row = getDocWorldbookSoneRow(rowId)
  if (!row) return
  if (row.sourceKind === 'cluster') {
    handleDocWorldbookClusterPointerDown(getDocWorldbookSoneRowClusterId(row), event)
    return
  }
  if (row.sourceRow) {
    handleDocSidebarPointerDown(row.sourceRow, 'worldbook', event)
  }
}

function commitProjectedDocSidebarDrop(mode: 'worldbook-doc' | 'worldbook-folder' | 'worldbook-cluster') {
  const controller = getDocDragController(mode)
  const payload = controller.buildProjectedDropPayload()
  if (!payload) {
    clearDocSidebarPointerDrag()
    return
  }
  if (mode === 'worldbook-cluster') {
    emit('doc-worldbook-reorder-clusters', {
      clusterIds: payload.draggedIds.map((item) => String(item || '').trim()).filter(Boolean),
      targetId: String(payload.targetId || '').trim(),
      position: payload.position
    })
    clearDocSidebarPointerDrag()
    return
  }
  if (mode === 'worldbook-doc') {
    emit('doc-worldbook-reorder-rows', {
      rowIds: payload.draggedIds.map((item) => String(item || '').trim()).filter(Boolean),
      targetId: String(payload.targetId || '').trim(),
      position: payload.position
    })
    clearDocSidebarPointerDrag()
    return
  }
  if (mode === 'worldbook-folder') {
    emit('doc-worldbook-reorder-rows', {
      rowIds: payload.draggedIds.map((item) => String(item || '').trim()).filter(Boolean),
      targetId: String(payload.targetId || '').trim(),
      position: payload.position
    })
    clearDocSidebarPointerDrag()
    return
  }
  clearDocSidebarPointerDrag()
}

function shouldShowDocWorldbookMenuTrigger(row: DocSidebarRow) {
  if (row.kind === 'folder') return true
  const selectedCount = Number(props.docSidebarState?.worldbook?.selectedCount || 0)
  if (selectedCount > 1) return row.id === selectedWorldbookAnchorId.value
  return true
}

function toggleDocWorldbookMenu(row: DocSidebarRow, event?: Event) {
  updateFloatingMenuPosition(event)
  activeDocMenuId.value = activeDocMenuId.value === row.id ? '' : row.id
}

function isDocWorldbookMenuOpen(row: DocSidebarRow) {
  return activeDocMenuId.value === row.id
}

function getDocWorldbookClusterMenuId(clusterId: string) {
  return `cluster:${String(clusterId || '').trim()}`
}

function toggleDocWorldbookClusterMenu(clusterId: string, event?: Event) {
  updateFloatingMenuPosition(event)
  const menuId = getDocWorldbookClusterMenuId(clusterId)
  activeDocMenuId.value = activeDocMenuId.value === menuId ? '' : menuId
}

function isDocWorldbookClusterMenuOpen(clusterId: string) {
  return activeDocMenuId.value === getDocWorldbookClusterMenuId(clusterId)
}

function getDocWorldbookClusterMenuItems(clusterId: string): DocWorldbookMenuItem[] {
  const isBatch = worldbookClusters.value.filter((item) => item.selected).length > 1
  return buildWorldbookClusterMenuItems({
    t,
    isBatch,
    canPaste: Boolean(props.docSidebarState?.worldbook?.clipboardHasData),
    canImportCompilePage: true
  })
}

function getDocWorldbookMenuItems(row: DocSidebarRow): DocWorldbookMenuItem[] {
  const selectedCount = Number(props.docSidebarState?.worldbook?.selectedCount || 0)
  if (row.kind === 'document' && selectedCount > 1 && row.id === selectedWorldbookAnchorId.value) {
    const sameParent = new Set(
      docWorldbookRows.value
        .filter((item) => item.kind === 'document' && item.selected)
        .map((item) => item.parentFolderId || '__root__')
    ).size === 1
    return buildWorldbookRowMenuItems({
      t,
      isBatch: true,
      canGroupAsBranch: true,
      canSortLayer: sameParent,
      canImportCompilePage: true
    })
  }
  return buildWorldbookRowMenuItems({
    t,
    isBatch: false,
    canPaste: Boolean(props.docSidebarState?.worldbook?.clipboardHasData),
    canImportCompilePage: true
  })
}

function runDocWorldbookMenuAction(action: string, row: DocSidebarRow) {
  activeDocMenuId.value = ''
  emit('doc-worldbook-menu-action', {
    action,
    row: {
      kind: row.kind,
      folderId: row.folderId,
      itemId: row.itemId
    }
  })
}

function runDocWorldbookClusterMenuAction(action: string, clusterId: string) {
  activeDocMenuId.value = ''
  emit('doc-worldbook-menu-action', {
    action,
    row: {
      kind: 'folder',
      folderId: clusterId,
      itemId: clusterId
    }
  })
}

function isDocWorldbookItemDragEnabled() {
  return docWorldbookDragSortEnabled.value
}

function isDocWorldbookFolderDragEnabled() {
  return docWorldbookDragSortEnabled.value
}

function isDocWorldbookClusterDragEnabled() {
  return docWorldbookDragSortEnabled.value
}

function isDocWorldbookClusterHeaderDragging(clusterId: string) {
  return docSidebarPointerDragging.value && docWorldbookClusterDrag.draggingIds.value.includes(String(clusterId || '').trim())
}

function isDocWorldbookClusterDropTarget(clusterId: string) {
  const safeId = String(clusterId || '').trim()
  return docWorldbookClusterDropTargetId.value === safeId
    || (docWorldbookPreviewTarget.value?.kind === 'cluster' && docWorldbookPreviewTarget.value.id === safeId)
}

function isDocWorldbookClusterPreviewShift(clusterId: string) {
  return docWorldbookClusterDropTargetId.value === String(clusterId || '').trim()
}

function isDocWorldbookRowDragging(row: DocSidebarRow) {
  if (!docSidebarPointerDragging.value) return false
  return docWorldbookDrag.draggingIds.value.includes(row.id)
}

function isDocWorldbookRowDropTarget(row: DocSidebarRow) {
  if (docWorldbookDropTargetId.value === row.id) return true
  return row.kind === 'folder'
    && docWorldbookPreviewTarget.value?.kind === 'folder'
    && docWorldbookPreviewTarget.value.mode === 'inside'
    && docWorldbookPreviewTarget.value.id === String(row.folderId || '').trim()
}

function isDocWorldbookRowPreviewShift(row: DocSidebarRow) {
  return isDocWorldbookRowDropTarget(row)
}

function toggleDocWorldbookItemDragMode() {
  docWorldbookDragModeKit.toggleDragMode()
  docWorldbookDrag.clearDragState()
  docWorldbookClusterDrag.clearDragState()
}

function toggleDocWorldbookFolderDragMode() {
  docWorldbookDragModeKit.toggleSinkMode('worldbook')
  docWorldbookDrag.clearDragState()
  docWorldbookClusterDrag.clearDragState()
}

function startDocWorldbookDrag(row: DocSidebarRow, event: DragEvent) {
  if (!isDocWorldbookItemDragEnabled() || row.kind !== 'document') {
    event.preventDefault()
    return
  }
  docWorldbookDrag.startDrag(row.id, event)
}

function handleDocWorldbookDragOver(row: DocSidebarRow, event: DragEvent) {
  if (!isDocWorldbookItemDragEnabled() || row.kind !== 'document') return
  event.stopPropagation()
  docWorldbookDrag.handleDragOver(row.id, event)
}

function handleDocWorldbookListDragOver(event: DragEvent) {
  if (isDocWorldbookItemDragEnabled() && docWorldbookDrag.draggingIds.value.length) {
    const resolved = resolveDropTargetFromDragEvent(
      event,
      '.doc-sidebar-row[data-doc-drag-id]',
      (element) => String(element.dataset.docDragId || '').trim()
    )
    if (resolved) {
      docWorldbookDrag.previewDrop(resolved.targetId, resolved.position, event)
      return
    }
  }
  if (!isDocWorldbookFolderDragEnabled() || !docWorldbookDrag.draggingIds.value.length) return
  const resolved = resolveDropTargetFromDragEvent(
    event,
    '.doc-sidebar-row[data-doc-drag-id]',
    (element) => String(element.dataset.docDragId || '').trim()
  )
  if (resolved) {
    docWorldbookDrag.previewDrop(resolved.targetId, resolved.position, event)
    return
  }
  event.preventDefault()
}

function handleDocWorldbookDrop(row: DocSidebarRow, event: DragEvent) {
  if (!isDocWorldbookItemDragEnabled() || row.kind !== 'document') return
  const payload = docWorldbookDrag.buildDropPayload(row.id, event)
  if (!payload) return
  event.preventDefault()
  emit('doc-worldbook-reorder', {
    itemIds: payload.draggedIds.map((item) => String(item || '').replace(/^document:/, '').trim()).filter(Boolean),
    targetId: String(row.itemId || '').trim(),
    position: payload.position
  })
  docWorldbookDrag.clearDragState()
}

function handleProjectedDocWorldbookDrop(event: DragEvent) {
  if (isDocWorldbookItemDragEnabled()) {
    const payload = docWorldbookDrag.buildProjectedDropPayload()
    if (payload) {
      event.preventDefault()
      emit('doc-worldbook-reorder-rows', {
        rowIds: payload.draggedIds.map((item) => String(item || '').trim()).filter(Boolean),
        targetId: String(payload.targetId || '').trim(),
        position: payload.position
      })
      docWorldbookDrag.clearDragState()
      return
    }
  }
  if (!isDocWorldbookFolderDragEnabled()) return
  const payload = docWorldbookDrag.buildProjectedDropPayload()
  if (!payload) return
  event.preventDefault()
  emit('doc-worldbook-reorder-rows', {
    rowIds: payload.draggedIds.map((item) => String(item || '').trim()).filter(Boolean),
    targetId: String(payload.targetId || '').trim(),
    position: payload.position
  })
  docWorldbookDrag.clearDragState()
}

function clearDocWorldbookDragState() {
  docWorldbookDrag.clearDragState()
}

function startDocWorldbookFolderDrag(row: DocSidebarRow, event: DragEvent) {
  if (!isDocWorldbookFolderDragEnabled() || row.kind !== 'folder' || !row.folderId) {
    event.preventDefault()
    return
  }
  docWorldbookDrag.startDrag(row.id, event)
}

function handleDocWorldbookFolderDragOver(row: DocSidebarRow, event: DragEvent) {
  if (!isDocWorldbookFolderDragEnabled() || row.kind !== 'folder' || !row.folderId) return
  event.stopPropagation()
  docWorldbookDrag.handleDragOver(row.id, event)
}

function hasAdjacentSelectedDocRow(mode: 'worldbook', rowId: string, direction: -1 | 1) {
  const rows = mode === 'worldbook' ? getRenderedDocWorldbookRows() : []
  const index = rows.findIndex((row) => row.id === rowId)
  if (index < 0) return false
  const neighbor = rows[index + direction]
  return Boolean(neighbor?.selected)
}

function expandAllContactGroups(kind: 'char' | 'group' | 'crowd') {
  getVisibleNamedGroupsForKind(kind)
    .forEach((group) => {
      const groupId = String(group.id || '')
      if (isGroupCollapsed(groupId)) {
        emit('toggle-group-collapse', groupId)
      }
    })
}

function collapseAllContactGroups(kind: 'char' | 'group' | 'crowd') {
  getVisibleNamedGroupsForKind(kind)
    .forEach((group) => {
      const groupId = String(group.id || '')
      if (!isGroupCollapsed(groupId)) {
        emit('toggle-group-collapse', groupId)
      }
    })
}

function toggleAllRoleContactGroups() {
  if (roleContactGroupsAllCollapsed.value) {
    expandAllContactGroups('char')
    return
  }
  collapseAllContactGroups('char')
}

function toggleAllGroupContactGroups() {
  if (groupContactGroupsAllCollapsed.value) {
    expandAllContactGroups('group')
    return
  }
  collapseAllContactGroups('group')
}

function toggleAllDocWorldbookRows() {
  if (docWorldbookAllExpanded.value) {
    emit('doc-collapse-worldbook')
    return
  }
  emit('doc-expand-worldbook')
}

watch(
  () => [
    contactDragSortEnabled.value,
    props.characters.length,
    props.groups.length,
    props.crowds.length,
    props.characterGroups.length,
    Object.entries(props.collapsedGroups || {})
      .map(([groupId, collapsed]) => `${groupId}:${collapsed ? 1 : 0}`)
      .sort()
      .join('|')
  ].join('::'),
  () => {
    nextTick(() => {
      syncAllContactSectionScroll()
    })
  },
  { immediate: true }
)

function handleContactMenuPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (target.closest('.sidebar-row-menu') || target.closest('.sidebar-row-action')) return
  contactRowMenu.closeMenu()
  closeAccountMenu()
  activeChatSessionMenuId.value = ''
  activeCharGroupMenuId.value = ''
  activeDocMenuId.value = ''
  floatingMenuStyle.value = {}
  if (isTouchMode.value && shouldClearTouchSelectionTarget(target)) {
    clearContactSelections()
  }
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function handleRoleSidebarUndoRedoKeydown(event: KeyboardEvent) {
  if (!isRolesView.value) return
  if (isEditableShortcutTarget(event.target)) return
  const key = event.key.toLowerCase()
  if (key !== 'z' || (!event.ctrlKey && !event.metaKey)) return
  event.preventDefault()
  if (event.shiftKey) {
    emit('redo-contact-ops')
  } else {
    emit('undo-contact-ops')
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    hydrateContactSectionRatios()
    contactDragModeKit.hydrate()
    if (isTouchMode.value) {
      contactDragModeKit.setDragMode(false)
      contactDragModeKit.setSinkContext('')
    }
    docWorldbookDragModeKit.hydrate()
    contactDragModeKit.setSinkContext('')
    docWorldbookDragModeKit.setSinkContext('')
    window.addEventListener('pointermove', handleWindowContactPointerMove)
    window.addEventListener('pointerup', handleWindowContactPointerUp)
    window.addEventListener('pointercancel', handleWindowContactPointerCancel)
    window.addEventListener('resize', syncAllContactSectionScroll)
    window.addEventListener('keydown', handleRoleSidebarUndoRedoKeydown)
  }
  window.addEventListener('pointerdown', handleContactMenuPointerDown)
  nextTick(() => {
    rootNavMotionReady.value = true
    syncAllContactSectionScroll()
  })
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointermove', handleWindowContactPointerMove)
    window.removeEventListener('pointerup', handleWindowContactPointerUp)
    window.removeEventListener('pointercancel', handleWindowContactPointerCancel)
    window.removeEventListener('resize', syncAllContactSectionScroll)
    window.removeEventListener('keydown', handleRoleSidebarUndoRedoKeydown)
  }
  window.removeEventListener('pointerdown', handleContactMenuPointerDown)
  clearChatSessionSelectionExitTimers()
  clearContactSelectionExitTimers()
  clearContactPointerDrag()
  clearContactGroupPointerDrag()
})
</script>

<style scoped>
@import '../../styles/sidebarInteractionKit.css';

.chat-sidebar-shell {
  --chat-rail-width: 48px;
  --chat-sidebar-open-bg: rgb(82, 94, 67);
  --chat-sidebar-active-bg: var(--langhuan-paper-bg, #f8f4ee);
  --chat-sidebar-active-text: #50654f;
  --chat-sidebar-active-muted: rgba(79, 73, 66, 0.62);
  --chat-sidebar-active-meta: rgba(79, 73, 66, 0.7);
  --chat-sidebar-on-bg: rgba(246, 242, 232, 0.88);
  --chat-sidebar-on-bg-muted: rgba(246, 242, 232, 0.66);
  --chat-sidebar-on-bg-weak: rgba(246, 242, 232, 0.48);
  --chat-sidebar-hover-bg: var(--langhuan-paper-bg, #f8f4ee);
  --chat-sidebar-hover-text: #50654f;
  --chat-sidebar-hover-muted: rgba(79, 73, 66, 0.68);
  --chat-sidebar-active-edge-radius: 30px;
  --chat-sidebar-active-notch-size: 28px;
  --chat-sidebar-active-notch-shadow: 6px;
  /* 二级目录选中框凹角/头像描边的纯色填充：必须用单一 <color>。
     不能直接用 --chat-sidebar-active-bg —— 它在白天解析为多层 paper-bg（含渐变+纸纹），
     喂进 box-shadow 颜色槽会令整条声明非法失效（白天无凹角、夜间因 paper-bg 退化为纯色才生效）。
     取 --morandi-bg 的纯色随主题切换（白 #F8F4EE / 夜 #2a2825），与选中框基色一致。 */
  --chat-sidebar-active-fill: var(--morandi-bg);
  --chat-sidebar-list-safe-inset: calc(var(--chat-sidebar-active-notch-size) + 4px);
  --chat-sidebar-session-list-top-inset: 12px;
  --chat-sidebar-session-row-gap: 7px;
  --chat-sidebar-contact-row-gap: 7px;
  --chat-sidebar-contact-group-row-gap: 8px;
  --chat-rail-item-size: 38px;
  --chat-rail-icon-size: 17px;
  --chat-rail-bottom-item-size: 32px;
  --chat-rail-bottom-icon-size: 18px;
  --chat-rail-star-icon-size: 22px;
  --chat-rail-brand-width: 38px;
  --chat-rail-brand-height: 43px;
  --chat-rail-avatar-inner-size: 22px;
  --chat-nav-primary-height: 54px; /* 需容纳英文/日文较长导航词换 2 行（如 Characters）；指示器 translateY 与 stack gap 均引用本 var，改高度会自动保持对齐 */
  --chat-nav-primary-gap: 5px;
  --chat-nav-active-notch-size: 10px; /* 根目录选中块右侧凹角弧度（唯一旋钮，6~12px）；与二级目录 --chat-sidebar-active-notch 属联动观感，若用户要求统一调整需同步 */
  --chat-nav-active-duration: 400ms;
  --chat-nav-color-duration: 60ms;
  --chat-nav-active-easing: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
}

:global([data-theme="dark"] .chat-sidebar-shell){
  --chat-sidebar-active-text: #fff3e4;
  --chat-sidebar-active-muted: rgba(255, 243, 228, 0.88);
  --chat-sidebar-active-meta: rgba(255, 243, 228, 0.84);
}

.chat-sidebar-shell :deep(.chat-sidebar) {
  top: 0;
  bottom: 0;
  overflow: visible;
  border: 0;
  background: var(--chat-sidebar-open-bg);
  box-shadow: none;
}

@media (min-width: 769px) {
  .chat-sidebar-shell :deep(.chat-sidebar) {
    left: var(--chat-rail-width);
    z-index: 100;
  }

  .chat-sidebar-shell :deep(.chat-nav) {
    z-index: 101;
  }
}

.chat-sidebar-shell :deep(.chat-nav) {
  width: var(--chat-rail-width);
  min-width: var(--chat-rail-width);
  left: 0;
  top: 0;
  bottom: 0;
  height: auto;
  border-right: 0;
}

.chat-nav {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s linear 0s;
}

.chat-nav::after {
  content: none;
}

.chat-nav--open::after {
  content: none;
}

.chat-nav--collapsed {
  opacity: 1;
  transform: translateX(0);
}

.chat-nav--open {
  opacity: 1;
  transform: translateX(0);
  /* 根栏与二级侧栏是两块独立定位面板；用同色外扩 1px 封住渲染接缝，
     不把接缝重新做成可见分隔线。 */
  box-shadow: 1px 0 0 var(--chat-sidebar-open-bg);
}

.chat-nav-tools {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
}

.chat-nav-brand {
  width: var(--chat-rail-width);
  height: var(--chat-rail-brand-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 5px 0 10px;
  color: #4f6f58;
  line-height: 1;
}

:global([data-theme="dark"] .chat-nav-brand){
  color: #8fae96;
}

.chat-nav-brand-icon {
  width: 44px;
  height: 46px;
  transform: translate(2px, 2px);
}

.chat-nav-primary-stack {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--chat-nav-primary-gap);
  width: var(--chat-rail-width);
}

.chat-nav-active-indicator {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: var(--chat-rail-width);
  height: var(--chat-nav-primary-height);
  background: var(--chat-sidebar-open-bg);
  pointer-events: none;
  border-radius: 0;
  transform:
    translateY(calc(var(--root-nav-active-index, 0) * (var(--chat-nav-primary-height) + var(--chat-nav-primary-gap))));
}

.chat-nav-primary-stack--motion-ready .chat-nav-active-indicator {
  transition: transform var(--chat-nav-active-duration) var(--chat-nav-active-easing);
}

/* 根目录选中块右上/右下凹角外扩：让 olive 指示器平滑融入右侧 olive 会话面板。
   rail 有 overflow:hidden，故用 radial-gradient 在伪元素自身框内成形（不外溢、不被裁），
   而非二级目录那套向外投影的 box-shadow notch；二者属同一观感联动。
   仅在二级侧栏展开(.chat-nav--open)时才出凹角；收起时右侧无 olive 面板可融入，
   保持纯矩形，避免凹角飞进 paper 内容区显得突兀。
   文档库页(.chat-nav--root-docs)二级是世界树(透明+marker、无外扩圆角)，
   故此页排除凹角，避免孤立的导航凹角与树侧栏不协调。 */
.chat-nav--open:not(.chat-nav--root-docs) .chat-nav-active-indicator::before,
.chat-nav--open:not(.chat-nav--root-docs) .chat-nav-active-indicator::after {
  content: "";
  position: absolute;
  right: 0;
  width: var(--chat-nav-active-notch-size);
  height: var(--chat-nav-active-notch-size);
  pointer-events: none;
}
.chat-nav--open:not(.chat-nav--root-docs) .chat-nav-active-indicator::before {
  top: calc(var(--chat-nav-active-notch-size) * -1);
  background: radial-gradient(circle at top left,
    transparent calc(var(--chat-nav-active-notch-size) - 0.5px),
    var(--chat-sidebar-open-bg) var(--chat-nav-active-notch-size));
}
.chat-nav--open:not(.chat-nav--root-docs) .chat-nav-active-indicator::after {
  bottom: calc(var(--chat-nav-active-notch-size) * -1);
  background: radial-gradient(circle at bottom left,
    transparent calc(var(--chat-nav-active-notch-size) - 0.5px),
    var(--chat-sidebar-open-bg) var(--chat-nav-active-notch-size));
}

.chat-nav-item--primary {
  width: calc(var(--chat-rail-width) - 8px);
  height: var(--chat-nav-primary-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 3px;
  border-radius: 11px;
  color: #7f7a72;
  transition:
    color var(--chat-nav-color-duration) var(--chat-nav-active-easing),
    background-color var(--chat-nav-color-duration) var(--chat-nav-active-easing);
}

.chat-nav-item--primary {
  position: relative;
  z-index: 1;
  margin-left: 0;
  margin-right: 0;
}

.chat-nav-primary-icon-shell {
  width: 27px;
  height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
}

.chat-nav-primary-icon {
  width: 20px;
  height: 20px;
}

.chat-nav-icon-outline {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 1;
}

.chat-nav-primary-label {
  max-width: 100%;
  font-size: 10px;
  line-height: 1.08;
  font-weight: 600;
  color: currentColor;
  /* 长导航词（英文 Characters / 日文长词）换最多 2 行居中，不横向溢出裁切 */
  text-align: center;
  white-space: normal;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chat-nav-item {
  width: var(--chat-rail-item-size);
  height: var(--chat-rail-item-size);
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 0;
}

.chat-nav-item.chat-nav-item--primary {
  width: var(--chat-rail-width);
  height: var(--chat-nav-primary-height);
  min-height: var(--chat-nav-primary-height);
  box-sizing: border-box;
  padding: 4px 0 4px;
}

.chat-nav-item :deep(.line-icon),
.chat-nav-item .line-icon {
  width: var(--chat-rail-icon-size);
  height: var(--chat-rail-icon-size);
  stroke-width: 1.9;
}

.chat-nav-item.active {
  background: rgba(130, 153, 135, 0.14);
  color: var(--morandi-primary);
}

.chat-nav-item--primary.active {
  background: transparent;
}

.chat-nav-item--primary.active {
  width: var(--chat-rail-width);
  margin-left: 0;
  border-radius: 0;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
}

.chat-nav-item--primary.active .chat-nav-primary-icon-shell {
  background: transparent;
  box-shadow: none;
}

.chat-nav-item--primary.active .chat-nav-icon-outline {
  opacity: 1;
  stroke-width: 1.95;
}

/* 根图标 hover 不做透明度类变化（2026-07-07 用户拍板：图标/底色始终全不透明）——
   去掉旧的 72% 半透明纸色底，只保留全不透明的文字色加深作为轻反馈；
   非钉住 hover 本身会把选中块滑过来（rootNavActiveKey 跟随预览），不需要额外底色。 */
.chat-nav-item--primary:not(.active):hover {
  background: transparent;
  color: #666159;
}

@media (prefers-reduced-motion: reduce) {
  .chat-nav-primary-stack--motion-ready .chat-nav-active-indicator {
    transition: none;
  }
}

.chat-sidebar-shell :deep(.sidebar-user-card) {
  margin-top: auto;
}

.chat-sidebar-content--sessions {
  gap: 10px;
  padding: 10px 0 10px 12px;
  overflow: hidden;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
  user-select: none;
  -webkit-user-select: none;
}

.chat-session-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 12px;
}

.chat-session-search {
  min-width: 0;
  flex: 1 1 auto;
  width: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(139, 115, 85, 0.12);
  border-radius: 8px;
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.chat-session-search .line-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
}

.chat-session-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--leaf-text, #3b342e);
  font-size: 12px;
}

.chat-session-search input::placeholder {
  color: rgba(59, 52, 46, 0.54);
}

.chat-session-action-row {
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 12px;
}

.chat-session-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.chat-session-filter {
  position: relative;
}

.chat-session-tool-button {
  height: 24px;
  border: 1px solid rgba(139, 115, 85, 0.12);
  border-radius: 8px;
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}

.chat-session-filter-button {
  border-color: transparent;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
  padding: 0 8px;
}

.chat-session-tool-button.active,
.chat-session-tool-button:hover,
.chat-session-tool-button:focus-visible {
  border-color: rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.chat-session-tool-button--icon {
  width: 32px;
  padding: 0;
}

/* 二级侧栏右上角「收起侧栏」按钮：仅钉住态显示，低存在感、hover 切项目底色（对齐文档侧栏第12条）。 */
.sidebar-collapse-button {
  flex: 0 0 24px;
  width: 24px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
}

.sidebar-collapse-button:hover,
.sidebar-collapse-button:focus-visible {
  border-color: rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.sidebar-collapse-button .line-icon {
  width: 15px;
  height: 15px;
}

.chat-session-create-button {
  margin-left: auto;
  padding: 0 8px;
  border-color: transparent;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
  font-weight: 500;
}

.chat-session-create-button .line-icon {
  width: 13px;
  height: 13px;
}

.role-sidebar-action-row .chat-session-tool-button {
  border-color: transparent;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
}

.role-sidebar-action-row .chat-session-tool-button.active {
  border-color: rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.role-sidebar-action-row .role-group-filter-button.active {
  border-color: rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.role-sidebar-action-row .chat-session-tool-button:hover {
  border-color: rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.role-sidebar-action-row .chat-session-tool-button.active .line-icon,
.role-sidebar-action-row .chat-session-tool-button:hover .line-icon,
.role-sidebar-action-row .chat-session-tool-button:focus-visible .line-icon {
  color: var(--leaf-text, #3b342e);
  stroke: currentColor;
}

.chat-session-close-button {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(79, 73, 66, 0.58);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.chat-session-close-button:hover {
  background: rgba(130, 153, 135, 0.1);
  color: var(--morandi-text);
}

.chat-session-close-button .line-icon {
  width: 15px;
  height: 15px;
}

.chat-sidebar-search-close-button {
  width: 26px;
  height: 26px;
  flex-basis: 26px;
}

.chat-session-filter-menu {
  position: absolute;
  top: 32px;
  left: 0;
  z-index: 20;
  min-width: 112px;
  padding: 4px;
  border: 1px solid var(--langhuan-menu-border, rgba(139, 115, 85, 0.12));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--langhuan-paper-bg);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
}

.chat-session-filter-item {
  width: 100%;
  height: 28px;
  border: 0;
  border-radius: var(--langhuan-menu-radius, 0);
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  padding: 0 8px;
  font-size: 12px;
  cursor: pointer;
}

.chat-session-filter-item.active,
.chat-session-filter-item:hover {
  background: rgba(130, 153, 135, 0.12);
}

.role-sidebar-toolbar {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  color: var(--chat-sidebar-on-bg);
}

.role-sidebar-search {
  height: 24px;
  flex: 1 1 auto;
  width: auto;
  max-width: none;
}

.role-sidebar-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 12px;
  justify-content: flex-start;
}

.role-sidebar-action-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: visible;
  padding-right: 12px;
}

.role-group-filter {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  z-index: 40;
}

.role-group-filter-button {
  max-width: 100%;
}

.role-group-filter-button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-sidebar-create-button {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--chat-sidebar-on-bg);
  font-weight: 600;
}

.role-sidebar-create-button .line-icon {
  width: 15px;
  height: 15px;
}

.role-sidebar-search-close-button {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-color: transparent;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
}

.role-sidebar-search-close-button:hover,
.role-sidebar-search-close-button:focus-visible {
  border-color: rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg, #f8f4ee);
  color: var(--leaf-text, #3b342e);
}

.role-group-filter-menu {
  position: absolute;
  top: 32px;
  left: 0;
  z-index: 4000;
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 4px;
  border: 1px solid var(--langhuan-menu-border, rgba(139, 115, 85, 0.12));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--langhuan-paper-bg);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
}

.role-group-filter-column {
  min-width: 128px;
  padding: 2px;
}

.role-group-filter-column + .role-group-filter-column {
  border-left: 1px solid rgba(139, 115, 85, 0.14);
}

.role-group-filter-item {
  width: 100%;
  min-height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 8px;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.role-group-filter-item.active,
.role-group-filter-item:hover {
  background: rgba(130, 153, 135, 0.12);
}

.role-group-filter-meta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--morandi-text-light);
  font-size: 11px;
}

.role-group-filter-arrow {
  font-size: 15px;
  line-height: 1;
}

.chat-session-list {
  display: flex;
  flex-direction: column;
  gap: var(--chat-sidebar-session-row-gap);
  min-height: 0;
  overflow: auto;
  padding-top: var(--chat-sidebar-session-list-top-inset);
  padding-bottom: var(--chat-sidebar-active-notch-size);
  padding-right: calc(var(--chat-sidebar-active-notch-size) + 12px);
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.chat-session-list::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.chat-session-row {
  width: calc(100% + var(--chat-sidebar-active-notch-size) + 12px);
  min-height: 48px;
  border: 0;
  border-radius: var(--chat-sidebar-active-edge-radius) 0 0 var(--chat-sidebar-active-edge-radius);
  background: transparent;
  color: var(--chat-sidebar-on-bg);
  position: relative;
  overflow: visible;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 14px 4px 10px;
  margin: 0 calc((var(--chat-sidebar-active-notch-size) + 12px) * -1) 0 0;
  text-align: left;
  user-select: none;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-radius 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    margin-top 0.12s ease;
}

.chat-session-row.active {
  z-index: 1;
  background: var(--chat-sidebar-active-bg);
  color: var(--chat-sidebar-active-text);
}

.chat-session-row--selected {
  z-index: 1;
  background: var(--chat-sidebar-active-bg);
  color: var(--chat-sidebar-active-text);
}

.chat-session-row--selection-fading {
  background: transparent;
}

.chat-session-row--selection-exiting {
  transition:
    background-color 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    margin-top 0.12s ease;
}

.chat-session-row.active .chat-session-title,
.chat-session-row--selected .chat-session-title {
  color: var(--chat-sidebar-active-text);
  font-weight: 650;
}

.chat-session-row.active .chat-session-label,
.chat-session-row.active .chat-session-time,
.chat-session-row.active .chat-session-preview,
.chat-session-row--selected .chat-session-label,
.chat-session-row--selected .chat-session-time,
.chat-session-row--selected .chat-session-preview {
  color: var(--chat-sidebar-active-muted);
}

.chat-session-row--selected-prev {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.chat-session-row--selected-next {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.chat-session-row--selected-prev.chat-session-row--selected-next {
  border-radius: 0;
}

.chat-session-row.active:not(.chat-session-row--selected-prev)::before,
.chat-session-row--selected:not(.chat-session-row--selected-prev)::before {
  content: "";
  position: absolute;
  right: 0;
  top: calc(var(--chat-sidebar-active-notch-size) * -1);
  width: var(--chat-sidebar-active-notch-size);
  height: var(--chat-sidebar-active-notch-size);
  background: transparent;
  border-bottom-right-radius: var(--chat-sidebar-active-notch-size);
  box-shadow:
    var(--chat-sidebar-active-notch-shadow)
    var(--chat-sidebar-active-notch-shadow)
    0
    var(--chat-sidebar-active-notch-shadow)
    var(--chat-sidebar-active-fill);
  pointer-events: none;
  z-index: 2;
  transition: border-radius 0.12s ease, box-shadow 0.12s ease;
}

.chat-session-row:first-child.active:not(.chat-session-row--selected-prev)::before,
.chat-session-row:first-child.chat-session-row--selected:not(.chat-session-row--selected-prev)::before {
  top: calc(var(--chat-sidebar-session-list-top-inset) * -1);
  height: var(--chat-sidebar-session-list-top-inset);
  border-bottom-right-radius: var(--chat-sidebar-session-list-top-inset);
}

.chat-session-row.active:not(.chat-session-row--selected-next)::after,
.chat-session-row--selected:not(.chat-session-row--selected-next)::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: calc(var(--chat-sidebar-active-notch-size) * -1);
  width: var(--chat-sidebar-active-notch-size);
  height: var(--chat-sidebar-active-notch-size);
  background: transparent;
  border-top-right-radius: var(--chat-sidebar-active-notch-size);
  box-shadow:
    var(--chat-sidebar-active-notch-shadow)
    calc(var(--chat-sidebar-active-notch-shadow) * -1)
    0
    var(--chat-sidebar-active-notch-shadow)
    var(--chat-sidebar-active-fill);
  pointer-events: none;
  z-index: 2;
  transition: border-radius 0.12s ease, box-shadow 0.12s ease;
}

.chat-session-row--selected + .chat-session-row--selected {
  margin-top: calc(var(--chat-sidebar-session-row-gap) * -1);
}

.chat-session-row--selection-exiting + .chat-session-row--selection-exiting {
  margin-top: 0;
}

.chat-session-row:hover {
  background: var(--chat-sidebar-hover-bg);
  color: var(--chat-sidebar-hover-text);
}

.chat-session-row:hover .chat-session-label,
.chat-session-row:hover .chat-session-time,
.chat-session-row:hover .chat-session-preview {
  color: var(--chat-sidebar-hover-muted);
}

.chat-session-row.active:hover {
  background: var(--chat-sidebar-active-bg);
}

.chat-session-row--selected:hover {
  background: var(--chat-sidebar-active-bg);
}

.chat-session-row.active:hover .chat-session-title,
.chat-session-row--selected:hover .chat-session-title {
  color: var(--chat-sidebar-active-text);
}

.chat-session-row.active:hover .chat-session-label,
.chat-session-row.active:hover .chat-session-time,
.chat-session-row.active:hover .chat-session-preview,
.chat-session-row--selected:hover .chat-session-label,
.chat-session-row--selected:hover .chat-session-time,
.chat-session-row--selected:hover .chat-session-preview {
  color: var(--chat-sidebar-active-muted);
}

.chat-session-row--selection-fading:hover {
  background: transparent;
}

.chat-session-row:focus-visible {
  outline: none;
  box-shadow: none;
}

.chat-session-row.active:focus-visible {
  background: var(--chat-sidebar-active-bg);
  box-shadow: none;
}

.chat-session-row-actions {
  margin-left: auto;
  opacity: 0;
  position: relative;
  z-index: 2;
}

.chat-session-row:hover .chat-session-row-actions,
.chat-session-row:focus-within .chat-session-row-actions,
.chat-session-row.active .chat-session-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.chat-session-avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
  background: var(--langhuan-paper-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--chat-sidebar-active-text);
  font-size: 13px;
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 1px rgba(104, 126, 103, 0.12);
}

.chat-session-row.active .chat-session-avatar {
  box-shadow:
    0 0 0 3px var(--chat-sidebar-active-fill),
    0 0 0 5px rgba(104, 126, 103, 0.16);
}

.chat-session-row--selected .chat-session-avatar {
  box-shadow:
    0 0 0 3px var(--chat-sidebar-active-fill),
    0 0 0 5px rgba(104, 126, 103, 0.16);
}

.chat-session-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-session-main {
  min-width: 0;
  display: grid;
  gap: 3px;
  flex: 1 1 auto;
  position: relative;
  z-index: 1;
}

.chat-session-title-row {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}

.chat-session-title-meta {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 1 auto;
}

.chat-session-title,
.chat-session-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-session-title {
  font-size: 13px;
  font-weight: 500;
}

.chat-session-label {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 16px;
  height: 16px;
  color: var(--chat-sidebar-on-bg-muted);
}

.chat-session-time {
  flex: 0 0 auto;
  color: var(--chat-sidebar-on-bg-muted);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.chat-session-preview {
  font-size: 11px;
  color: var(--chat-sidebar-on-bg-muted);
}

.chat-session-rename input {
  width: 100%;
  border: 1px solid rgba(120, 108, 92, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--morandi-text);
  padding: 9px 10px;
  font-size: 13px;
  outline: none;
}

.chat-session-rename input:focus {
  border-color: rgba(95, 118, 96, 0.36);
  box-shadow: 0 0 0 2px rgba(95, 118, 96, 0.1);
}

.sidebar-item {
  position: relative;
  overflow: visible;
  margin: 0 !important;
  border-radius: var(--chat-sidebar-active-edge-radius) 0 0 var(--chat-sidebar-active-edge-radius) !important;
  will-change: transform;
  transition:
    background-color 0.12s ease,
    border-radius 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    margin-top 0.12s ease;
}

.sidebar-item--grouped {
  margin-left: 0.75em !important;
}

.sidebar-item.active:not(.sidebar-item--selected) {
  z-index: 3;
  background: var(--chat-sidebar-active-bg) !important;
  color: var(--chat-sidebar-active-text);
}

.sidebar-item.sidebar-item--selected {
  z-index: 3;
  background: var(--chat-sidebar-active-bg) !important;
  color: var(--chat-sidebar-active-text);
  box-shadow: none;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected-prev {
  border-top-left-radius: 0 !important;
  border-top-right-radius: 0 !important;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected-next {
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected-prev.sidebar-item--selected-next {
  border-radius: 0 !important;
}

.chat-sidebar-content--contacts .sidebar-item.active:not(.sidebar-item--selected):not(.sidebar-item--selected-prev)::before,
.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected:not(.sidebar-item--selected-prev)::before {
  content: "";
  position: absolute;
  right: 0;
  top: calc(var(--chat-sidebar-active-notch-size) * -1);
  width: var(--chat-sidebar-active-notch-size);
  height: var(--chat-sidebar-active-notch-size);
  background: transparent;
  border-bottom-right-radius: var(--chat-sidebar-active-notch-size);
  box-shadow:
    var(--chat-sidebar-active-notch-shadow)
    var(--chat-sidebar-active-notch-shadow)
    0
    var(--chat-sidebar-active-notch-shadow)
    var(--chat-sidebar-active-fill);
  pointer-events: none;
  z-index: 2;
  transition: border-radius 0.12s ease, box-shadow 0.12s ease;
}

.chat-sidebar-content--contacts .sidebar-item.active:not(.sidebar-item--selected):not(.sidebar-item--selected-next)::after,
.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected:not(.sidebar-item--selected-next)::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: calc(var(--chat-sidebar-active-notch-size) * -1);
  width: var(--chat-sidebar-active-notch-size);
  height: var(--chat-sidebar-active-notch-size);
  background: transparent;
  border-top-right-radius: var(--chat-sidebar-active-notch-size);
  box-shadow:
    var(--chat-sidebar-active-notch-shadow)
    calc(var(--chat-sidebar-active-notch-shadow) * -1)
    0
    var(--chat-sidebar-active-notch-shadow)
    var(--chat-sidebar-active-fill);
  pointer-events: none;
  z-index: 2;
  transition: border-radius 0.12s ease, box-shadow 0.12s ease;
}

.sidebar-item.sidebar-item--drop-target {
  outline: none;
}

.sidebar-item.sidebar-item--preview-shift {
  transition: box-shadow 120ms ease, background 120ms ease;
}

.sidebar-item.sidebar-interaction-drop-target--before.sidebar-item--preview-shift,
.sidebar-item.sidebar-interaction-drop-target--after.sidebar-item--preview-shift {
  transform: none;
  padding-top: 4px;
  padding-bottom: 4px;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-interaction-drop-target--before.sidebar-item--preview-shift {
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--leaf-accent, #829987) 62%, transparent);
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-interaction-drop-target--after.sidebar-item--preview-shift {
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--leaf-accent, #829987) 62%, transparent);
}

.sidebar-item {
  user-select: none;
  -webkit-user-select: none;
}

.sidebar-item--dragging:not(.sidebar-item--selected) {
  opacity: 0.84;
  background: color-mix(in srgb, var(--leaf-accent, #829987) 8%, transparent);
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--leaf-accent, #829987) 62%, transparent);
  animation: none;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--dragging.sidebar-item--selected {
  opacity: 1;
  background: var(--chat-sidebar-active-bg) !important;
  color: var(--chat-sidebar-active-text);
  box-shadow: none;
  animation: none;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--dragging[data-contact-kind='char'] {
  position: relative;
  z-index: 8;
  transition: none !important;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--dragging .sidebar-item-selection-indicator {
  display: none !important;
  background: transparent !important;
  opacity: 0 !important;
}

.contact-drag-ghost {
  position: fixed;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(214px, calc(100vw - 28px));
  min-height: 44px;
  padding: 4px 10px 4px 5px;
  border: 1px solid rgba(90, 110, 93, 0.2);
  border-radius: 12px;
  background: var(--chat-sidebar-active-bg);
  color: var(--chat-sidebar-active-text);
  box-shadow: 0 14px 30px rgba(62, 77, 67, 0.2);
  pointer-events: none;
  transform: translate3d(12px, -50%, 0) scale(1);
  transition: opacity 120ms ease, box-shadow 120ms ease;
  will-change: left, top, transform;
}

.contact-drag-ghost--multi::before {
  content: "";
  position: absolute;
  inset: 5px -5px -5px 5px;
  z-index: -1;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-sidebar-active-bg) 86%, var(--leaf-accent, #829987) 14%);
  box-shadow: 0 8px 18px rgba(62, 77, 67, 0.12);
}

.contact-drag-ghost__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(130, 153, 135, 0.16);
  color: var(--chat-sidebar-active-text);
  font-size: 16px;
}

.contact-drag-ghost__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.contact-drag-ghost__avatar .line-icon {
  width: 18px;
  height: 18px;
}

.contact-drag-ghost__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 6px;
}

.contact-drag-ghost__name {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
}

.contact-drag-ghost__meta {
  flex: 0 0 auto;
  color: rgba(79, 73, 66, 0.68);
  font-size: 12px;
}

.contact-drag-ghost__count {
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(104, 126, 103, 0.18);
  color: var(--chat-sidebar-active-text);
  font-size: 12px;
  font-weight: 700;
}

.sidebar-item * {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.chat-sidebar-content--contacts .sidebar-item {
  width: calc(100% + var(--chat-sidebar-active-notch-size) + 12px);
  min-height: 48px;
  padding-left: 10px;
  padding-right: 14px;
  padding-top: 4px;
  padding-bottom: 4px;
  margin-right: calc((var(--chat-sidebar-active-notch-size) + 12px) * -1) !important;
  gap: 7px;
  color: var(--chat-sidebar-on-bg);
  transition:
    background-color 0.12s ease,
    border-radius 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    margin-top 0.12s ease,
    opacity 0.12s ease !important;
}

.chat-sidebar-content--contacts .sidebar-item::before,
.chat-sidebar-content--contacts .sidebar-item::after,
.chat-sidebar-content--contacts .sidebar-item-avatar,
.chat-sidebar-content--contacts .sidebar-item-name,
.chat-sidebar-content--contacts .sidebar-item-meta {
  transition:
    border-radius 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease !important;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selection-fading {
  background: transparent !important;
  color: var(--chat-sidebar-on-bg);
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selection-exiting {
  transition:
    background-color 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    margin-top 0.12s ease,
    opacity 0.12s ease !important;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selection-fading .sidebar-item-name {
  color: var(--chat-sidebar-on-bg);
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selection-fading .sidebar-item-meta {
  color: var(--chat-sidebar-on-bg-muted);
}

.chat-sidebar-content--contacts .sidebar-item-avatar {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 1px rgba(104, 126, 103, 0.12);
}

.chat-sidebar-content--contacts .sidebar-item.active:not(.sidebar-item--selected) .sidebar-item-avatar {
  box-shadow:
    0 0 0 3px var(--chat-sidebar-active-fill),
    0 0 0 5px rgba(104, 126, 103, 0.16);
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected .sidebar-item-avatar {
  box-shadow:
    0 0 0 3px var(--chat-sidebar-active-fill),
    0 0 0 5px rgba(104, 126, 103, 0.16);
}

.chat-sidebar-content--contacts .sidebar-item-info,
.chat-sidebar-content--contacts .sidebar-item-name,
.chat-sidebar-content--contacts .sidebar-item-meta {
  position: relative;
  z-index: 1;
}

.chat-sidebar-content--contacts .sidebar-item-info {
  display: flex;
  justify-content: flex-start;
  align-items: baseline;
  min-width: 0;
}

.chat-sidebar-content--contacts .sidebar-item-name {
  color: var(--chat-sidebar-on-bg);
}

.chat-sidebar-content--contacts .sidebar-item-meta {
  color: var(--chat-sidebar-on-bg-muted);
}

.chat-sidebar-content--contacts .sidebar-item.active:not(.sidebar-item--selected) .sidebar-item-name {
  color: var(--chat-sidebar-active-text);
  font-weight: 600;
}

.chat-sidebar-content--contacts .sidebar-item.active:not(.sidebar-item--selected) .sidebar-item-meta {
  color: var(--chat-sidebar-active-meta);
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected .sidebar-item-name {
  color: var(--chat-sidebar-active-text);
  font-weight: 600;
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected .sidebar-item-meta {
  color: var(--chat-sidebar-active-meta);
}

.chat-sidebar-content--contacts .sidebar-item.sidebar-item--selected .sidebar-item-selection-indicator {
  background: transparent;
  opacity: 0;
}

.chat-sidebar-content--contacts .sidebar-item-selection-indicator {
  display: none;
}

.chat-sidebar-content--contacts .sidebar-item:hover .sidebar-item-selection-indicator {
  background: transparent;
  opacity: 0;
}

.chat-sidebar-content--contacts .sidebar-item:hover:not(.active):not(.sidebar-item--selected) {
  background: var(--chat-sidebar-hover-bg) !important;
  color: var(--chat-sidebar-hover-text);
}

.chat-sidebar-content--contacts .sidebar-item:hover:not(.active):not(.sidebar-item--selected) .sidebar-item-name {
  color: var(--chat-sidebar-hover-text);
}

.chat-sidebar-content--contacts .sidebar-item:hover:not(.active):not(.sidebar-item--selected) .sidebar-item-meta {
  color: var(--chat-sidebar-hover-muted);
}

.doc-sidebar-row {
  user-select: none;
  -webkit-user-select: none;
}

.doc-sidebar-row * {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.sidebar-item-selection-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 10px;
  width: 1px;
  min-width: 1px;
  height: auto;
  border: none;
  border-radius: 999px;
  background: transparent;
  margin-right: 0;
  flex: 0 0 1px;
  pointer-events: none;
  z-index: 2;
}

.sidebar-item-selection-indicator.active {
  background: #829987;
}

.sidebar-item-selection-indicator:not(.active) {
  opacity: 0;
}

.sidebar-row-actions {
  position: relative;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: 26px;
  flex: 0 0 26px;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.14s ease;
}

.chat-sidebar-content--sessions .chat-session-row-actions,
.chat-sidebar-content--contacts .sidebar-row-actions {
  display: none;
}

.sidebar-row-actions--header {
  width: 26px;
  opacity: 1;
  pointer-events: auto;
}

.sidebar-item:hover .sidebar-row-actions,
.sidebar-subgroup-header:hover .sidebar-row-actions,
.sidebar-item:focus-within .sidebar-row-actions,
.sidebar-subgroup-header:focus-within .sidebar-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-item--selected .sidebar-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-row-action {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
  appearance: none;
  color: #829987;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sidebar-row-action:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.sidebar-row-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 8px;
  z-index: 4000;
  min-width: 184px;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--leaf-border, var(--morandi-border, #d4cec4)) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--leaf-panel, var(--morandi-card, #f5f0e8));
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  overflow: visible;
  isolation: isolate;
}

.sidebar-row-menu--anchored {
  top: calc(100% + 6px);
  right: 0;
}

.sidebar-floating-menu-shell.sidebar-row-menu--nested {
  overflow: visible;
}

.sidebar-row-menu-entry {
  position: relative;
}

.sidebar-row-menu-entry--nested:hover > .sidebar-row-submenu,
.sidebar-row-menu-entry--nested:focus-within > .sidebar-row-submenu {
  display: block;
}

.sidebar-row-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--leaf-text, #3b342e);
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  line-height: 1.2;
}

.sidebar-row-menu-item--has-children {
  align-items: center;
}

.sidebar-row-menu-item:hover {
  background: color-mix(in srgb, var(--leaf-accent, #829987) 8%, transparent);
}

.sidebar-row-menu-item.active {
  background: color-mix(in srgb, var(--leaf-accent, #829987) 13%, transparent);
  color: #536f59;
}

.sidebar-row-menu-item:disabled {
  opacity: 0.45;
}

.sidebar-row-menu-item--danger {
  color: #9d4f43;
}

.sidebar-row-menu-item--danger:hover {
  background: rgba(157, 79, 67, 0.08);
}

.sidebar-row-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--leaf-border, var(--morandi-border, #d4cec4)) 82%, transparent);
}

.sidebar-row-menu-shortcut {
  flex: 0 0 auto;
  font-size: 11px;
  color: color-mix(in srgb, var(--leaf-text-soft, #8a8175) 88%, transparent);
}

.sidebar-row-menu-caret {
  color: color-mix(in srgb, var(--leaf-text-soft, #8a8175) 88%, transparent);
}

.sidebar-row-submenu {
  display: none;
  position: absolute;
  top: -6px;
  left: calc(100% + 1px);
  z-index: 4001;
  min-width: 184px;
  padding: 6px 0;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--leaf-border, var(--morandi-border, #d4cec4)) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--leaf-panel, var(--morandi-card, #f5f0e8));
  box-shadow: var(--langhuan-submenu-shadow, none);
}

.sidebar-row-submenu--level-3 {
  top: -6px;
}

.sidebar-account-menu {
  min-width: 276px;
  padding: 0;
}

.sidebar-account-panel {
  display: flex;
  flex-direction: column;
}

.sidebar-account-trigger {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.sidebar-account-head {
  padding: 12px 12px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--leaf-border, var(--morandi-border, #d4cec4)) 82%, transparent);
}

.sidebar-account-head-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-account-role {
  font-size: 12px;
  font-weight: 700;
  color: var(--leaf-accent-strong, #5f7660);
}

.sidebar-account-email {
  margin-top: 4px;
  font-size: 12px;
  color: var(--leaf-text-soft, #8a8175);
  word-break: break-all;
}

.sidebar-account-manager {
  padding: 4px 12px 12px;
  border-top: 1px solid color-mix(in srgb, var(--leaf-border, var(--morandi-border, #d4cec4)) 82%, transparent);
}

/* 设置弹窗：分区外观复用账号管理弹窗的卡片风格，后续若统一改样式需同步 account-modal__section */
.settings-modal {
  display: grid;
  gap: 18px;
  padding-bottom: 18px;
}

.settings-modal__section {
  padding: 14px 16px;
  border: 1px solid rgba(198, 196, 191, 0.9);
  border-radius: 16px;
  background: rgba(249, 248, 245, 0.82);
}

.settings-modal__label {
  font-size: 13px;
  font-weight: 700;
  color: var(--leaf-text, #3b342e);
}

.settings-modal__hint {
  margin: 6px 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--leaf-text-soft, #8a8175);
}

.account-modal {
  display: grid;
  gap: 18px;
}

.account-modal {
  padding-bottom: 18px;
}

.account-modal__section {
  padding: 14px 16px;
  border: 1px solid rgba(198, 196, 191, 0.9);
  border-radius: 16px;
  background: rgba(249, 248, 245, 0.82);
}

.account-modal__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--leaf-text, #3b342e);
}

.sidebar-account-manager__title {
  margin-top: 10px;
  font-size: 11px;
  color: var(--leaf-text-soft, #8a8175);
}

.sidebar-account-manager__empty,
.sidebar-account-manager__hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--leaf-text-soft, #8a8175);
}

.sidebar-account-form__error {
  padding: 8px 10px;
  border: 1px solid rgba(157, 67, 56, 0.24);
  border-radius: 10px;
  background: rgba(157, 67, 56, 0.08);
  color: #9d4338;
  font-size: 12px;
  line-height: 1.45;
}

.sidebar-account-manager__tabs {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.sidebar-account-tab {
  border: none;
  background: transparent;
  padding: 0 0 2px;
  font-size: 12px;
  color: var(--leaf-text-soft, #8a8175);
  cursor: pointer;
}

.sidebar-account-tab.active {
  color: var(--leaf-text, #3b342e);
  border-bottom: 1px solid rgba(95, 118, 96, 0.5);
}

.sidebar-account-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.sidebar-account-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(130, 153, 135, 0.06);
}

.sidebar-account-list__item.active {
  background: rgba(130, 153, 135, 0.12);
}

.sidebar-account-list__main {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.sidebar-account-list__name {
  display: block;
  font-size: 12px;
  color: var(--leaf-text, #3b342e);
  word-break: break-all;
}

.sidebar-account-list__meta {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--leaf-text-soft, #8a8175);
}

.sidebar-account-list__remove {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: #9d4f43;
  cursor: pointer;
}

.sidebar-account-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.sidebar-account-input {
  width: 100%;
  border: 1px solid rgba(139, 115, 85, 0.16);
  border-radius: 10px;
  background: rgba(255, 252, 247, 0.96);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--leaf-text, #3b342e);
}

.sidebar-account-input:focus {
  outline: none;
  border-color: rgba(95, 118, 96, 0.4);
}

.sidebar-account-submit {
  border: 1px solid rgba(95, 118, 96, 0.16);
  border-radius: 10px;
  background: rgba(130, 153, 135, 0.1);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--leaf-text, #3b342e);
  cursor: pointer;
}

.chat-nav-bottom {
  display: grid;
  grid-template-columns: 100%;
  grid-auto-rows: var(--chat-rail-bottom-item-size);
  row-gap: 7px;
  align-items: center;
  justify-content: center;
  justify-items: center;
  width: 100%;
  min-height: 0;
  margin-bottom: 8px;
  padding-bottom: 0;
}

.chat-nav-bottom > button {
  width: var(--chat-rail-bottom-item-size);
  height: var(--chat-rail-bottom-item-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  outline: none;
  box-shadow: none;
}

.chat-nav-star-button {
  z-index: 3;
}

.chat-nav-star-button .line-icon {
  width: var(--chat-rail-star-icon-size);
  height: var(--chat-rail-star-icon-size);
  stroke-width: 1.9;
}

.chat-nav-bottom .chat-nav-item .line-icon {
  width: var(--chat-rail-bottom-icon-size);
  height: var(--chat-rail-bottom-icon-size);
}

.chat-nav-avatar-button {
  width: var(--chat-rail-bottom-item-size);
  height: var(--chat-rail-bottom-item-size);
  border: none;
  border-radius: 999px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 4;
  cursor: pointer;
}

.chat-nav-avatar-button img {
  width: var(--chat-rail-avatar-inner-size) !important;
  height: var(--chat-rail-avatar-inner-size) !important;
}

.chat-nav-avatar-button > span {
  width: var(--chat-rail-avatar-inner-size);
  height: var(--chat-rail-avatar-inner-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
}

.sidebar-interaction-cut-pending {
  opacity: 0.52;
}

.chat-sidebar-title-row {
  display: flex;
  align-items: center;
  gap: 0;
}

.chat-sidebar-title-label {
  color: #1A1A1A;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

.chat-sidebar-title-button,
.chat-sidebar-doc-link {
  border: none;
  padding: 0;
  background: transparent;
  color: #1A1A1A;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.chat-sidebar-title-button {
  margin: 0;
}

.chat-sidebar-doc-link {
  margin-left: 12px;
  padding: 0 0 0 12px;
  border-left: 1px solid #d9d9d9;
}

.chat-sidebar-title-button.active,
.chat-sidebar-doc-link.active {
  color: #1A1A1A;
}

.sidebar-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
  flex-wrap: wrap;
}

.sidebar-section-title--compact {
  justify-content: flex-end;
  min-height: 28px;
}

.sidebar-section-heading {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sidebar-subgroup-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 6px 8px;
  cursor: pointer;
  background: transparent;
  border-radius: 4px;
  margin: 4px 0;
  transition:
    background-color 0.12s ease,
    border-radius 0.12s ease,
    box-shadow 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease;
}

.chat-sidebar-content--contacts .sidebar-subgroup-header {
  color: var(--chat-sidebar-on-bg);
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

.doc-sidebar-cluster-header .sidebar-subgroup-toggle {
  width: 21px;
  flex: 0 0 21px;
  font-size: 21px;
}

.doc-sidebar-cluster-header .sidebar-subgroup-name {
  font-size: 0.92rem;
}

.sidebar-subgroup-header--selected {
  z-index: 3;
  background: var(--chat-sidebar-active-bg);
  color: var(--chat-sidebar-active-text);
  box-shadow: none;
}

.sidebar-subgroup-header--selected-prev,
.sidebar-subgroup-header--selected-next {
  border-radius: 0;
}

.chat-sidebar-content--contacts .sidebar-subgroup-header--selected-prev {
  box-shadow: none;
}

.chat-sidebar-content--contacts .sidebar-subgroup-header--selected-next {
  box-shadow: none;
}

.chat-sidebar-content--contacts .sidebar-subgroup-header--selected-prev.sidebar-subgroup-header--selected-next {
  box-shadow: none;
}

.sidebar-subgroup-header--dragging {
  opacity: 0.64;
  background: color-mix(in srgb, var(--leaf-accent, #829987) 10%, transparent);
  box-shadow: 0 10px 22px rgba(73, 91, 79, 0.12);
  animation: sidebar-drag-press 160ms ease-out;
}

.sidebar-subgroup-header--drop-target {
  background: rgba(130, 153, 135, 0.14);
}

.sidebar-subgroup-header--preview-shift {
  transform: translateY(0);
}

.icon-btn.active {
  color: #5f7b66;
  background: rgba(130, 153, 135, 0.12);
}

.sidebar-subgroup-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--chat-sidebar-on-bg-muted);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 14px;
  transition: transform 0.18s ease;
}

.sidebar-subgroup-toggle--button {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.sidebar-subgroup-name {
  font-size: 0.8rem;
}

.sidebar-subgroup-count {
  font-size: 0.65rem;
  color: var(--chat-sidebar-on-bg-muted);
}

.sidebar-section-toggle {
  width: 18px;
  height: 18px;
  border: none;
  padding: 0;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sidebar-section-toggle .line-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.16s ease;
  transform: rotate(-90deg);
}

.sidebar-dropzone {
  width: calc(100% - 12px);
  margin: 6px;
  min-height: 36px;
  border: 1px dashed rgba(130, 153, 135, 0.55);
  border-radius: 10px;
  background: rgba(130, 153, 135, 0.08);
  color: #556b59;
}

.sidebar-section-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  width: 100%;
  flex: 1 1 100%;
  flex-wrap: wrap;
  margin-left: 0;
}

.role-sidebar-icon-actions {
  width: auto;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  margin-left: 0;
  gap: 4px;
  flex-wrap: nowrap;
}

.role-sidebar-icon-actions .icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
}

.role-sidebar-icon-actions .icon-btn .line-icon {
  width: 16px;
  height: 16px;
  stroke-width: 1.9;
}

.role-sidebar-action-row .line-icon {
  color: var(--chat-sidebar-on-bg);
  stroke: currentColor;
}

.role-sidebar-icon-actions .icon-btn.active {
  border-color: transparent;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
}

.role-sidebar-icon-actions .icon-btn:hover,
.role-sidebar-icon-actions .icon-btn:focus-visible {
  border-color: rgba(246, 242, 232, 0.18);
  background: var(--chat-sidebar-hover-bg);
  color: var(--chat-sidebar-hover-text);
}

.role-sidebar-icon-actions .icon-btn:hover .line-icon,
.role-sidebar-icon-actions .icon-btn:focus-visible .line-icon {
  color: var(--chat-sidebar-hover-text);
  stroke: currentColor;
}

.sidebar-section-count {
  font-size: 0.7rem;
  color: var(--morandi-text-light);
  min-width: 16px;
  text-align: left;
}

.sidebar-inline-plus {
  padding: 1px 4px;
  font-size: 0.7rem;
}

@container (min-width: 220px) {
  .sidebar-section-title {
    flex-wrap: nowrap;
  }

  .sidebar-section-actions {
    width: auto;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    justify-content: flex-end;
    margin-left: auto;
  }
}

.sidebar-bottom-icons {
  margin-left: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
}

.chat-sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  cursor: col-resize;
}

.chat-sidebar-resize-handle::after {
  content: none;
}

.chat-sidebar-content--contacts {
  overflow: visible;
  gap: 6px;
  min-height: 0;
  padding: 10px 0 10px 12px;
  background: transparent;
  color: var(--chat-sidebar-on-bg);
  container-type: inline-size;
  user-select: none;
  -webkit-user-select: none;
}

.chat-sidebar-content--contacts .sidebar-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: visible;
  width: 100%;
  max-width: 100%;
  padding: 0;
}

.chat-sidebar-content--contacts .sidebar-section-title {
  flex: 0 0 auto;
}

.sidebar-section-resizer {
  flex: 0 0 4px;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(130, 153, 135, 0.16);
  cursor: row-resize;
}

.sidebar-section-resizer:hover {
  background: rgba(130, 153, 135, 0.3);
}

.chat-sidebar-content--contact-drag {
  overflow-y: hidden;
  gap: 4px;
  align-items: stretch;
}

.chat-sidebar-content--contact-drag .sidebar-section {
  display: flex;
  flex: 0 0 auto;
  min-height: auto;
  flex-direction: column;
  overflow: visible;
  width: 100%;
  max-width: 100%;
}

.sidebar-section-body {
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-height: 0;
  overflow: hidden;
  flex: 1 1 auto;
}

.sidebar-section-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: visible;
  margin-top: calc(var(--chat-sidebar-active-notch-size) * -1);
  margin-bottom: calc(var(--chat-sidebar-active-notch-size) * -1);
  padding-top: var(--chat-sidebar-list-safe-inset);
  padding-bottom: var(--chat-sidebar-active-notch-size);
  overscroll-behavior: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.sidebar-section-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.chat-sidebar-content--contacts .sidebar-list,
.chat-sidebar-content--contact-drag .sidebar-list {
  max-height: none !important;
  overflow: visible !important;
}

.chat-sidebar-content--contacts .sidebar-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--chat-sidebar-contact-row-gap);
}

.chat-sidebar-content--contacts .sidebar-list--group-characters {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--chat-sidebar-contact-row-gap);
}

.chat-sidebar-content--contacts .sidebar-item--selected + .sidebar-item--selected {
  margin-top: calc(var(--chat-sidebar-contact-row-gap) * -1) !important;
}

.chat-sidebar-content--contacts .sidebar-item--selection-exiting + .sidebar-item--selection-exiting {
  margin-top: 0 !important;
}

.sidebar-section-slider {
  display: flex;
  align-items: stretch;
  justify-content: center;
  flex: 0 0 16px;
  padding-right: 2px;
}

.sidebar-section-slider-track {
  position: relative;
  width: 4px;
  height: 100%;
  border-radius: 999px;
  background: rgba(143, 170, 152, 0.18);
}

.sidebar-section-slider-thumb {
  position: absolute;
  left: 50%;
  width: 10px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #8faa98;
  box-shadow: 0 2px 8px rgba(85, 107, 89, 0.18);
  transform: translate(-50%, -50%);
  touch-action: none;
  cursor: pointer;
}

.chat-sidebar-shell--touch .chat-sidebar-content--contact-drag .sidebar-interaction-row,
.chat-sidebar-shell--touch .chat-sidebar-content--contact-drag .sidebar-interaction-header {
  touch-action: none;
}

.chat-sidebar-content--docs {
  box-sizing: border-box;
  max-width: 100%;
  padding: 0;
  background: var(--chat-sidebar-active-bg);
  color: var(--leaf-text, #3b342e);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  -ms-overflow-style: auto;
}

.chat-sidebar-content--docs:has(.doc-sidebar-sone-section) {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.chat-sidebar-content--docs::-webkit-scrollbar {
  display: block;
  width: 4px;
  height: 4px;
}

.chat-sidebar-content--docs::-webkit-scrollbar-track {
  background: transparent;
}

.chat-sidebar-content--docs::-webkit-scrollbar-thumb {
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: transparent;
  background-clip: content-box;
}

.chat-sidebar-content--docs.sone-tree-scroll-host--scrollbar-near,
.chat-sidebar-content--docs:focus-within {
  scrollbar-color: rgba(116, 111, 101, 0.32) transparent;
}

.chat-sidebar-content--docs.sone-tree-scroll-host--scrollbar-near::-webkit-scrollbar-thumb,
.chat-sidebar-content--docs:focus-within::-webkit-scrollbar-thumb,
.chat-sidebar-content--docs::-webkit-scrollbar-thumb:hover {
  background-color: rgba(116, 111, 101, 0.34);
}

.doc-sidebar-section-actions {
  gap: 6px;
}

.doc-sidebar-transfer-actions,
.doc-sidebar-toolbar-actions {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex-wrap: nowrap;
}

.doc-sidebar-transfer-actions {
  gap: 4px;
}

.doc-sidebar-toolbar-actions {
  gap: 4px;
}

.doc-sidebar-tabs {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px 10px 12px;
  border-bottom: 1px solid rgba(130, 153, 135, 0.15);
  background: var(--morandi-bg, #f8f4ee);
}

.doc-sidebar-tab,
.doc-sidebar-subtab {
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #7b746b;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  padding: 9px 6px;
  cursor: pointer;
}

.doc-sidebar-tab {
  flex: 1 1 0;
  min-width: 0;
}

.doc-sidebar-tabs-close {
  display: inline-flex;
  flex: 0 0 26px;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #8a8178;
  cursor: pointer;
}

.doc-sidebar-tabs-close:hover,
.doc-sidebar-tabs-close:focus-visible {
  background: rgba(130, 153, 135, 0.1);
  color: #556b59;
}

.doc-sidebar-tabs-close .line-icon {
  width: 14px;
  height: 14px;
  stroke-width: 1.9;
}

.doc-sidebar-tab.active,
.doc-sidebar-subtab.active {
  color: #556b59;
  background: rgba(130, 153, 135, 0.12);
}

.doc-sidebar-tree {
  padding: 6px 8px 14px;
}

.doc-scenario-prompt-section {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
}

.doc-scenario-prompt-section > .sidebar-section-title {
  min-height: 26px;
  flex-wrap: nowrap;
}

.doc-scenario-prompt-actions-host {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 26px;
  align-items: center;
}

.doc-scenario-prompt-tree-host {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 8px 8px 14px;
}

.doc-sidebar-sone-section {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  background: var(--morandi-bg, #f8f4ee);
  padding-top: 4px;
}

.doc-sidebar-tree-toolbar {
  flex: 0 0 auto;
  z-index: 39;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 30px;
  padding: 0 10px 2px 0;
  background: var(--morandi-bg, #f8f4ee);
}

.doc-sidebar-tree-toolbar__surface {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  max-width: 100%;
  padding: 1px 4px;
  border-radius: 8px;
  background: var(--morandi-bg, #f8f4ee);
}

.doc-sidebar-tree-toolbar .icon-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  appearance: none;
  background: transparent;
  box-shadow: none;
  color: rgba(64, 73, 61, 0.86);
}

.doc-sidebar-tree-toolbar .icon-btn:hover,
.doc-sidebar-tree-toolbar .icon-btn:focus-visible,
.doc-sidebar-tree-toolbar .icon-btn.active {
  background: transparent;
  box-shadow: none;
  color: #556b59;
}

.doc-sidebar-tree--sone {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  max-width: 100%;
  background: var(--morandi-bg, #f8f4ee);
  overflow-x: hidden;
  overflow-y: auto;
  padding: 8px 0 14px 12px;
}

.doc-sidebar-tree--sone > div {
  margin-bottom: 0;
}

.doc-sidebar-tree--sone :deep(.sone-tree.sidebar-tree-rows) {
  max-width: 100%;
  overflow-x: clip;
  padding-bottom: 16px;
}

.doc-sidebar-tree--sone :deep(.sone-tree .sidebar-tree-rows__row) {
  width: min(var(--sone-selection-width, 156px), calc(100% - 6px));
}

.doc-sidebar-tree--prompt {
  scrollbar-width: thin;
  scrollbar-color: rgba(123, 116, 107, 0.24) transparent;
}

.doc-sidebar-tree--prompt::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.doc-sidebar-tree--prompt::-webkit-scrollbar-track {
  background: transparent;
}

.doc-sidebar-tree--prompt::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(123, 116, 107, 0.22);
}

.doc-sidebar-tree--prompt:hover::-webkit-scrollbar-thumb {
  background: rgba(123, 116, 107, 0.38);
}

.doc-sidebar-tree > div {
  margin-bottom: 26px;
}

.doc-sidebar-tree--flat > div {
  margin-bottom: 0;
}

.doc-sidebar-row {
  width: calc(100% - 4px);
  margin: 0 2px;
  border: none;
  border-radius: 0;
  background: transparent;
  position: relative;
  overflow: visible;
  color: #6b645d;
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 20px;
  padding: 0 8px 0 calc(8px + var(--doc-depth, 0) * 10px);
  text-align: left;
  cursor: pointer;
}

.doc-sidebar-row:hover {
  background: rgba(130, 153, 135, 0.07);
}

.doc-sidebar-tree--dragging .doc-sidebar-row:hover,
.doc-sidebar-tree--dragging .doc-sidebar-row.active,
.doc-sidebar-tree--dragging .doc-sidebar-row.selected {
  background: transparent;
}

.doc-sidebar-row.active,
.doc-sidebar-row.selected {
  background: transparent;
  color: #556b59;
}

.doc-sidebar-row.folder {
  color: #4f463f;
  min-height: 24px;
  margin-top: 6px;
  margin-bottom: 0;
  border-radius: 4px;
  background: transparent;
}

.doc-sidebar-row.folder-open {
  margin-top: 12px;
}

.doc-sidebar-row.folder .doc-sidebar-row-label {
  font-weight: 500;
}

.doc-sidebar-row:not(.folder) {
  min-height: 19px;
}

.doc-sidebar-row.folder.selected {
  background: color-mix(in srgb, #8faa98 10%, transparent);
}

.doc-sidebar-row:not(.folder)::before {
  content: '';
  position: absolute;
  left: calc(24px + var(--doc-depth, 0) * 10px);
  top: 50%;
  width: 6px;
  border-top: 2px solid rgba(162, 154, 144, 0.74);
  transform: translateY(-50%);
  pointer-events: none;
}

.doc-sidebar-row--prompt {
  width: 100%;
  min-height: 52px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  gap: 8px;
}

.doc-sidebar-row--prompt::before {
  display: none;
}

.doc-sidebar-row--prompt.active {
  background: color-mix(in srgb, #8faa98 10%, transparent);
}

.doc-sidebar-row--prompt.muted {
  opacity: 0.62;
}

.doc-sidebar-row--prompt.doc-sidebar-row--dragging {
  opacity: 0.48;
}

.doc-sidebar-row--prompt.doc-sidebar-row--drop-target {
  position: relative;
}

.doc-sidebar-row--prompt.doc-sidebar-row--drop-before::after,
.doc-sidebar-row--prompt.doc-sidebar-row--drop-after::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  border-radius: 999px;
  background: #829987;
}

.doc-sidebar-row--prompt.doc-sidebar-row--drop-before::after {
  top: 0;
}

.doc-sidebar-row--prompt.doc-sidebar-row--drop-after::after {
  bottom: 0;
}

.doc-sidebar-row--relation {
  min-height: 34px;
}

.doc-sidebar-row-count {
  margin-left: auto;
  color: #6f756c;
  font-size: 12px;
  line-height: 1;
}

.doc-sidebar-prompt-group {
  margin: 14px 2px 6px;
  padding: 0 8px;
  min-height: 22px;
  color: #7b746b;
}

.doc-sidebar-prompt-text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.doc-sidebar-prompt-meta {
  color: #7b746b;
  font-size: 12px;
  line-height: 1.2;
}

.doc-sidebar-row-indent {
  width: 0;
  flex: 0 0 0;
}

.doc-sidebar-row-toggle {
  width: 13px;
  flex: 0 0 13px;
  font-size: 11px;
  color: #a29a90;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transform: rotate(-90deg);
  transition: transform 0.16s ease;
}

.doc-sidebar-row.folder .doc-sidebar-row-toggle {
  margin-right: 1px;
}

.doc-sidebar-row-toggle.open {
  transform: rotate(0deg);
}

.doc-sidebar-row-toggle.hidden {
  opacity: 0;
}

.doc-sidebar-row-marker {
  width: 1px;
  align-self: stretch;
  height: auto;
  border-radius: 999px;
  background: transparent;
  flex: 0 0 1px;
}

.doc-sidebar-row-marker.active {
  background: #829987;
}

.doc-sidebar-row.folder .doc-sidebar-row-marker,
.doc-sidebar-row.folder .doc-sidebar-row-marker.active {
  background: transparent;
}

.doc-sidebar-row-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  position: relative;
  z-index: 3;
}

.doc-sidebar-row:not(.folder) .doc-sidebar-row-label {
  margin-left: 4px;
}

.doc-sidebar-row-actions {
  position: relative;
  margin-left: auto;
  flex: 0 0 auto;
  width: 26px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}

.doc-sidebar-row:hover .doc-sidebar-row-actions,
.doc-sidebar-row.selected .doc-sidebar-row-actions,
.doc-sidebar-row.active .doc-sidebar-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-item-info--inline {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.sidebar-item-title-row {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
}

.sidebar-item-meta--inline {
  white-space: nowrap;
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.sidebar-item:has(> .role-brain-tree-shell) {
  flex-wrap: wrap;
  align-items: flex-start;
}

.sidebar-item > .role-brain-tree-shell {
  flex: 0 0 100%;
  width: 100%;
  margin-top: 2px;
  padding-left: 0;
}

.sidebar-reorder-move {
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar-reorder-enter-active,
.sidebar-reorder-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}

.sidebar-reorder-enter-from,
.sidebar-reorder-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.sidebar-reorder-leave-active {
  position: absolute;
  width: calc(100% + 12px);
}

@keyframes sidebar-drag-press {
  from {
    opacity: 0.92;
    box-shadow: 0 0 0 rgba(73, 91, 79, 0);
  }

  to {
    opacity: 0.64;
    box-shadow: 0 10px 22px rgba(73, 91, 79, 0.12);
  }
}

.chat-sidebar-shell--touch .sidebar-reorder-move,
.chat-sidebar-shell--touch .sidebar-reorder-enter-active,
.chat-sidebar-shell--touch .sidebar-reorder-leave-active,
.chat-sidebar-shell--touch .sidebar-item,
.chat-sidebar-shell--touch .sidebar-subgroup-header {
  transition: none !important;
}

@media (max-width: 768px) {
  .chat-sidebar-resize-handle {
    display: none;
  }
}
</style>
