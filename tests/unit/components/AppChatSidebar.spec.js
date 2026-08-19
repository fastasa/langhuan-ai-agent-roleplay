/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppChatSidebar from '../../../src/components/app/AppChatSidebar.vue'
import SoneTreeRows from '../../../src/components/app/SoneTreeRows.vue'
import { i18n } from '../../../src/i18n'

function mountSidebar(overrides = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AppChatSidebar, {
    props: {
      sidebarOpen: true,
      workspacePrimaryView: 'chat',
      desktopWidth: 280,
      desktopResizable: false,
      desktopSidebarStyle: {},
      collapsedGroups: {},
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依' }
      ],
      characterGroups: [],
      groups: [
        { id: 'group_1', name: '测试群聊', members: [] }
      ],
      crowds: [
        { id: 'crowd_1', name: '路人组', emoji: '群' }
      ],
      chatSessionRows: [],
      activeSessionId: '',
      userProfile: { name: '用户', emoji: '用', avatarPath: '' },
      currentTarget: '',
      darkMode: false,
      getCharactersByGroup: () => [],
      getCharAvatarById: () => '',
      docSidebarState: null,
      ...overrides
    },
    global: {
      plugins: [pinia, i18n],
      stubs: {
        SidebarFloatingMenu: { template: '<div><slot /></div>' },
        AppMoveDialog: true,
        AppModalShell: true,
        JsonTransferButtons: true,
        TransitionGroup: false,
        Transition: false
      }
    }
  })
}

describe('AppChatSidebar workspace modes', () => {
  it('provides the left-column host for the scenario prompt tree', () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'docs',
      docSidebarState: {
        activeTab: 'scenarioPrompt',
        worldbook: {
          treeVisible: true,
          clusters: [],
          selectedCount: 0,
          clipboardMode: '',
          clipboardHasData: false,
          rows: [],
          rowsByCluster: {}
        },
        prompt: { selectedId: '', totalCount: 0, rows: [] },
        relation: { activeTab: 'candidates', predicatesCount: 0, candidatesCount: 0, confirmedCount: 0 }
      }
    })

    expect(wrapper.text()).toContain('情境提示词')
    expect(wrapper.find('#doc-scenario-prompt-tree-target').exists()).toBe(true)
    expect(wrapper.find('#doc-scenario-prompt-actions-target').exists()).toBe(true)
    expect(wrapper.get('#doc-scenario-prompt-actions-target').element.closest('.sidebar-section-title')).toBeTruthy()
    expect(wrapper.find('[data-scenario-prompt-tree-host="true"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('keeps empty chat and role sidebars free of faint placeholder rows', () => {
    const chat = mountSidebar({ chatSessionRows: [] })
    expect(chat.find('.chat-session-empty').exists()).toBe(false)
    expect(chat.text()).not.toContain('暂无会话')
    chat.unmount()

    const roles = mountSidebar({
      workspacePrimaryView: 'roles',
      desktopDisplayView: 'roles',
      characters: []
    })
    expect(roles.text()).not.toContain('暂无角色')
    roles.unmount()
  })

  it('uses the screenshot-width chat sidebar default', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/chat/AppChatSection.vue'),
      'utf8'
    )

    expect(source).toMatch(/storageKey: 'langhuan_chat_sidebar_width',\s*defaultWidth: 334,/)
  })

  it('shows chat, role and doc top entries', () => {
    const wrapper = mountSidebar()

    expect(wrapper.text()).toContain('聊天')
    expect(wrapper.text()).toContain('角色')
    expect(wrapper.text()).toContain('文档库')

    wrapper.unmount()
  })

  it('keeps the desktop sidebar open when switching the root view', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'docs',
      desktopFloatingMode: true
    })

    await wrapper.get('[aria-label="聊天"]').trigger('click')
    expect(wrapper.emitted('switch-workspace-view')?.[0]).toEqual(['chat'])
    expect(wrapper.emitted('update:sidebar-open')?.[0]).toEqual([true])

    await wrapper.get('[aria-label="角色"]').trigger('click')
    expect(wrapper.emitted('switch-workspace-view')?.[1]).toEqual(['roles'])
    expect(wrapper.emitted('update:sidebar-open')?.[1]).toEqual([true])

    wrapper.unmount()
  })

  it('collapses the pinned secondary sidebar when re-clicking the active root entry', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'chat',
      desktopFloatingMode: true,
      desktopSidebarPinned: true
    })

    await wrapper.get('[aria-label="聊天"]').trigger('click')

    expect(wrapper.emitted('unpin-sidebar')?.length).toBe(1)
    expect(wrapper.emitted('pin-sidebar')).toBeUndefined()
    expect(wrapper.emitted('switch-workspace-view')).toBeUndefined()

    wrapper.unmount()
  })

  it('pins the secondary sidebar when the active root entry is not yet pinned', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      desktopFloatingMode: true,
      desktopSidebarPinned: false
    })

    await wrapper.get('[aria-label="角色"]').trigger('click')

    expect(wrapper.emitted('pin-sidebar')?.[0]).toEqual(['roles'])
    expect(wrapper.emitted('unpin-sidebar')).toBeUndefined()

    wrapper.unmount()
  })

  it('uses the star as a new-tab Pixel entry and keeps only changelog under the regular-user misc submenu', async () => {
    const wrapper = mountSidebar()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    expect(wrapper.find('.chat-nav-star-button').exists()).toBe(true)
    expect(wrapper.get('.chat-nav-star-button').attributes('aria-label')).toBe('像素画板')
    await wrapper.get('.sidebar-account-trigger').trigger('click')
    const miscEntry = wrapper.get('.sidebar-account-misc-menu .sidebar-tree-rows__row-menu-entry')
    await miscEntry.get('button').trigger('click')
    expect(miscEntry.find('.sidebar-tree-rows__row-submenu').text()).toContain('更新日志')
    await wrapper.get('.chat-nav-star-button').trigger('click')
    expect(openSpy).toHaveBeenCalledWith('/pixel', '_blank', 'noopener')
    expect(wrapper.find('.sidebar-utility-panel').exists()).toBe(false)
    expect(miscEntry.find('.sidebar-tree-rows__row-submenu').text()).not.toContain('数据安全')

    openSpy.mockRestore()
    wrapper.unmount()
  })

  it('does not expose removed operator utilities in the local misc submenu', async () => {
    const wrapper = mountSidebar()

    expect(wrapper.find('.chat-nav-star-button').exists()).toBe(true)
    const miscEntry = wrapper.get('.sidebar-account-misc-menu .sidebar-tree-rows__row-menu-entry')
    await miscEntry.get('button').trigger('click')
    const miscMenu = miscEntry.get('.sidebar-tree-rows__row-submenu')
    expect(miscMenu.text()).toContain('更新日志')
    expect(miscMenu.text()).not.toContain('云同步')
    expect(miscMenu.text()).not.toContain('点券')
    expect(miscMenu.text()).not.toContain('操作助手')

    wrapper.unmount()
  })

  it('reuses the viewport-aware nested-menu engine without turning the account shell into a scroll container', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/AppChatSidebar.vue'),
      'utf8'
    )

    expect(source).toContain('viewport-overflow="visible"')
    expect(source).toContain('<SoneTreeMenuItems')
    expect(source).toContain('constrainHeight: false')
    expect(source).not.toContain('accountMiscMenuOpen')
    expect(source).not.toContain('sidebar-account-misc-submenu')
  })

  it('opens data management from the root nav instead of the utility menu', async () => {
    const wrapper = mountSidebar()

    await wrapper.get('[aria-label="数据管理"]').trigger('click')

    expect(wrapper.emitted('switch-workspace-view')?.[0]).toEqual(['data'])
    expect(wrapper.emitted('open-chat-utility')).toBeUndefined()

    wrapper.unmount()
  })

  it('closes the secondary sidebar when opening data management', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'docs',
      sidebarOpen: true,
      desktopFloatingMode: true
    })

    await wrapper.get('[aria-label="数据管理"]').trigger('click')

    expect(wrapper.emitted('switch-workspace-view')?.[0]).toEqual(['data'])
    expect(wrapper.emitted('update:sidebar-open')?.[0]).toEqual([false])
    expect(wrapper.emitted('open-chat-utility')).toBeUndefined()

    wrapper.unmount()
  })

  it('keeps legacy contact rows out of chat mode', () => {
    const wrapper = mountSidebar()

    expect(wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]').exists()).toBe(false)
    expect(wrapper.emitted('select-role-character')).toBeUndefined()

    wrapper.unmount()
  })

  it('joins the active role row into the first modifier selection', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: 'char_1',
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依' },
        { id: 'char_2', name: '静枝', gender: '女', age: 19, emoji: '枝' }
      ],
      getCharactersByGroup: () => []
    })

    const firstRow = wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]')
    const secondRow = wrapper.find('[data-contact-kind="char"][data-contact-id="char_2"]')
    await secondRow.trigger('click', { ctrlKey: true })

    expect(firstRow.classes()).toContain('sidebar-item--selected')
    expect(firstRow.classes()).toContain('sidebar-item--selected-next')
    expect(secondRow.classes()).toContain('sidebar-item--selected')
    expect(secondRow.classes()).toContain('sidebar-item--selected-prev')

    wrapper.unmount()
  })

  it('keeps ctrl-clicking the active role from clearing the seeded selection', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: 'char_1',
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依' },
        { id: 'char_2', name: '静枝', gender: '女', age: 19, emoji: '枝' }
      ],
      getCharactersByGroup: () => []
    })

    const firstRow = wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]')
    await firstRow.trigger('click', { ctrlKey: true })

    expect(firstRow.classes()).toContain('sidebar-item--selected')
    expect(wrapper.emitted('select-role-character')).toBeUndefined()
    expect(wrapper.emitted('open-role-brain-drawer')).toBeUndefined()

    wrapper.unmount()
  })

  it('moves the active role row immediately before parent props settle', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: 'char_1',
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依' },
        { id: 'char_2', name: '静枝', gender: '女', age: 19, emoji: '枝' }
      ],
      getCharactersByGroup: () => []
    })

    const firstRow = wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]')
    const secondRow = wrapper.find('[data-contact-kind="char"][data-contact-id="char_2"]')
    expect(firstRow.classes()).toContain('active')

    await secondRow.trigger('click')

    expect(firstRow.classes()).not.toContain('active')
    expect(secondRow.classes()).toContain('active')
    expect(wrapper.emitted('select-role-character')?.[0]).toEqual(['char_2'])

    wrapper.unmount()
  })

  it('keeps role row visual state changes out of global sidebar transitions', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/AppChatSidebar.vue'),
      'utf8'
    )

    expect(source).toMatch(/\.chat-sidebar-content--contacts \.sidebar-item \{\r?\n/)
    expect(source).toContain('transition: none !important;')
    expect(source).toContain('.chat-sidebar-content--contacts .sidebar-item::before')
    expect(source).toContain('.chat-sidebar-content--contacts .sidebar-item-avatar')
    expect(source).toContain('.chat-sidebar-content--contacts .sidebar-item-name')
  })

  it('keeps contact drag sorting inside the source group and removes cross-group drag sinks', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/AppChatSidebar.vue'),
      'utf8'
    )

    expect(source).toContain('return draggingGroupIds.size === 1 && draggingGroupIds.has(targetGroupId)')
    expect(source).not.toContain('resolvePointerContactGroupHeader')
    expect(source).not.toContain('contactHeaderDropGroupId')
    expect(source).not.toContain('targetGroupId: headerGroupId')
    expect(source).toMatch(/if \(contactItemPointerDrag\.dragging\.value\) \{\r?\n\s+contactMultiSelect\.clearSelection\(\)\r?\n\s+\}/)
    expect(source).toContain('.sidebar-item--dragging:not(.sidebar-item--selected)')
    expect(source).toContain('.chat-sidebar-content--contacts .sidebar-item.sidebar-item--dragging.sidebar-item--selected')
    expect(source).toContain('background: var(--chat-sidebar-active-bg) !important;')
    expect(source).toContain('.chat-sidebar-content--contacts .sidebar-item.sidebar-item--dragging .sidebar-item-selection-indicator')
    expect(source).toContain('v-if="contactDragGhost.visible"')
    expect(source).toContain('class="contact-drag-ghost"')
    expect(source).toContain('left: `${lastContactPointer.value.x}px`')
    expect(source).toContain('top: `${lastContactPointer.value.y}px`')
    expect(source).toContain('contact-dragging-change')
    expect(source).toContain('watch(contactItemPointerDrag.dragging')
    expect(source).toContain('pointer-events: none;')
    expect(source).toContain('will-change: left, top, transform;')
    expect(source).toContain(':data-contact-group-id="String(grp.id || \'default\')"')
    expect(source).toContain('data-contact-group-id="default"')
    expect(source).toContain('function getContactSourceGroupId(kind: \'char\' | \'group\' | \'crowd\')')
    expect(source).toContain('const sourceGroupId = getContactSourceGroupId(kind)')
    expect(source).toContain("(!sourceGroupId || groupId === sourceGroupId)")
    expect(source).toContain('function getProjectedContactIdsForGroup(kind: \'char\' | \'group\' | \'crowd\', groupId: string)')
    expect(source).toContain('contactDrag.projectedOrder.value')
    expect(source).toContain('.sidebar-item.sidebar-interaction-drop-target--before.sidebar-item--preview-shift')
    expect(source).toContain('.sidebar-item.sidebar-interaction-drop-target--after.sidebar-item--preview-shift')
    expect(source).toMatch(/function getContactRenderedOrder\(\) \{\r?\n\s+return contactOrderedIds\.value\r?\n\}/)
    expect(source).toMatch(/function getBaseRenderedEntitiesByGroup\(kind: 'char' \| 'group' \| 'crowd', groupId: string\) \{\r?\n\s+return getEntitiesByGroup\(kind, groupId\)\r?\n\}/)
    expect(source).not.toContain('function clampContactDragOffsetY')
    expect(source).not.toContain('var(--contact-drag-y')
    expect(source).not.toContain('.chat-sidebar-content--contact-drag .sidebar-reorder-move')
    expect(source).not.toContain('function buildProjectedEntityGroupMap')
  })

  // hover 预览（2026-07-07）：非钉住 hover 展开阶段悬停另一根图标，二级侧栏按 desktopDisplayView 预览对应视图内容。
  it('renders the preview view content when desktopDisplayView differs from workspacePrimaryView', () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'chat',
      desktopDisplayView: 'roles',
      currentTarget: 'char_1'
    })

    // 内容=角色联系人列（预览视图），根导航选中态跟随预览滑到「角色」（2026-07-07 用户拍板：选中态跟着走）。
    expect(wrapper.find('.chat-sidebar-content--contacts').exists()).toBe(true)
    expect(wrapper.find('.chat-sidebar-content--sessions').exists()).toBe(false)
    expect(wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]').exists()).toBe(true)
    expect(wrapper.find('.chat-nav-item--roles').classes()).toContain('active')
    expect(wrapper.find('.chat-nav-item--chat').classes()).not.toContain('active')

    wrapper.unmount()
  })

  it('keeps root nav icons fully opaque on hover (no translucent hover backdrop)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/AppChatSidebar.vue'),
      'utf8'
    )

    // 根图标 hover 不做透明度类变化（2026-07-07 用户拍板）：旧 72% 半透明纸色底已退役，勿加回。
    expect(source).not.toContain('background: rgba(243, 240, 233, 0.72)')
    expect(source).toMatch(/\.chat-nav-item--primary:not\(\.active\):hover \{\r?\n\s+background: transparent;/)
  })

  it('keeps hover preview gated to the unpinned hover stage in AppChatSection', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/chat/AppChatSection.vue'),
      'utf8'
    )

    // 非钉住才允许 hover 预览另一视图；钉住态维持「hover 无变化，仅点击切换」。
    expect(source).toContain("|| ((sidebarRootHoverView.value === 'chat' || sidebarRootHoverView.value === 'roles') && !currentSidebarPinned.value)")
    expect(source).toContain('const sidebarHoverPreviewView = ref<\'chat\' | \'roles\' | \'\'>(\'\')')
    expect(source).toContain(':desktop-display-view="sidebarDisplayView"')
    expect(source).toContain('rootView !== props.workspacePrimaryView && currentSidebarPinned.value')
    // 预览态点击=先切工作区视图再让行级点击生效（capture）。
    expect(source).toContain('@click.capture="handleSidebarSlotClickCapture"')
  })

  // 2026-07-08 双修回归：①角色页强制收拢不再关 hover 唤出能力；②钉住收敛为全局单真值（防另一视图残留钉住被 hover 预览点击复活成持久态）。
  it('keeps hover summon alive under role force-collapse and pins with a single truth value', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/chat/AppChatSection.vue'),
      'utf8'
    )

    // ① 专注工作区收拢只影响当下，不禁用 hover；收起类在侧栏可视期间不生效，hover 才能再唤出。
    expect(source).not.toContain('&& !isRoleSidebarForceCollapsed.value')
    expect(source).toContain("'chat-sidebar-slot--force-collapsed': isRoleSidebarForceCollapsed && !sidebarVisualPresent,")
    // 收拢时解钉 + 清 hover（取代旧的 canUseDesktopHoverSidebar 关闸联动）。
    expect(source).toContain("if (sidebarPinnedView.value === 'roles') sidebarPinnedView.value = ''")

    // ② 钉住单真值：只有点聊天/角色根图标切换钉住，收起=全局回 hover 模式；禁止双布尔各自记忆回潮。
    expect(source).toContain("const sidebarPinnedView = ref<'chat' | 'roles' | ''>('')")
    expect(source).not.toContain('chatSidebarPinned')
    expect(source).not.toContain('roleSidebarPinned')
  })

  it('keeps the desktop hover sidebar open while contact dragging is active', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/chat/AppChatSection.vue'),
      'utf8'
    )

    expect(source).toContain('@contact-dragging-change="handleContactDraggingChange"')
    expect(source).toContain('const sidebarContactDragging = ref(false)')
    expect(source).toContain('sidebarPointerInside.value || sidebarFocusOpen.value || sidebarContactDragging.value')
    expect(source).toContain('function scheduleSidebarHoverClose() {\n  if (sidebarContactDragging.value || sidebarWidthDragging.value) return')
    expect(source).toContain('function clearSidebarHoverOpen() {\n  if (sidebarContactDragging.value || sidebarWidthDragging.value) return')
    expect(source).toContain('function handleContactDraggingChange(dragging: boolean)')
    expect(source).toContain('cancelSidebarHoverCloseTimer()')
  })

  it('selects chat session rows by session id instead of target id', async () => {
    const wrapper = mountSidebar({
      currentTarget: 'char_1',
      activeSessionId: 'session_b',
      chatSessionRows: [
        {
          sessionId: 'session_a',
          targetId: 'char_1',
          kind: 'single',
          title: '第一次聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_b',
          targetId: 'char_1',
          kind: 'single',
          title: '第二次聊天',
          label: '',
          preview: '新消息',
          updatedAt: '2026-04-28T02:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    const rows = wrapper.findAll('.chat-session-row')

    expect(rows).toHaveLength(2)
    expect(rows[0].classes()).not.toContain('active')
    expect(rows[1].classes()).toContain('active')

    await rows[0].trigger('click')

    expect(wrapper.emitted('switch-session')?.[0]).toEqual(['session_a'])
    expect(wrapper.emitted('switch-chat')).toBeUndefined()

    wrapper.unmount()
  })

  it('supports touch drag multi-select for chat session rows', async () => {
    vi.useFakeTimers()
    const dispatchPointer = (element, type, options) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true })
      Object.entries(options).forEach(([key, value]) => {
        Object.defineProperty(event, key, { configurable: true, value })
      })
      element.dispatchEvent(event)
    }
    const wrapper = mountSidebar({
      chatSessionRows: [
        {
          sessionId: 'session_a',
          targetId: 'char_1',
          kind: 'single',
          title: '第一次聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_b',
          targetId: 'char_1',
          kind: 'single',
          title: '第二次聊天',
          label: '',
          preview: '新消息',
          updatedAt: '2026-04-28T02:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    const rows = wrapper.findAll('.chat-session-row')
    const firstElement = rows[0].element
    const secondElement = rows[1].element
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = vi.fn(() => secondElement)

    dispatchPointer(rows[0].element, 'pointerdown', {
      button: 0,
      pointerId: 1,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10
    })
    vi.advanceTimersByTime(340)
    await wrapper.vm.$nextTick()
    dispatchPointer(rows[0].element, 'pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 10,
      clientY: 60
    })
    await wrapper.vm.$nextTick()
    dispatchPointer(rows[0].element, 'pointerup', {
      pointerId: 1,
      pointerType: 'touch'
    })
    await wrapper.vm.$nextTick()

    expect(rows[0].classes()).toContain('chat-session-row--selected')
    expect(rows[1].classes()).toContain('chat-session-row--selected')
    expect(rows[0].classes()).toContain('chat-session-row--selected-next')
    expect(rows[1].classes()).toContain('chat-session-row--selected-prev')

    document.elementFromPoint = originalElementFromPoint
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('does not merge active and clicked adjacent chat sessions during a normal switch', async () => {
    const wrapper = mountSidebar({
      activeSessionId: 'session_a',
      chatSessionRows: [
        {
          sessionId: 'session_a',
          targetId: 'char_1',
          kind: 'single',
          title: '第一次聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_b',
          targetId: 'char_2',
          kind: 'single',
          title: '第二次聊天',
          label: '',
          preview: '新消息',
          updatedAt: '2026-04-28T02:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    const rows = wrapper.findAll('.chat-session-row')
    await rows[1].trigger('click')
    await wrapper.vm.$nextTick()

    expect(rows[0].classes()).toContain('active')
    expect(rows[0].classes()).not.toContain('chat-session-row--selected-next')
    expect(rows[1].classes()).toContain('chat-session-row--selected')
    expect(rows[1].classes()).not.toContain('chat-session-row--selected-prev')
    expect(wrapper.emitted('switch-session')?.[0]).toEqual(['session_b'])

    wrapper.unmount()
  })

  it('uses the first normal clicked chat session as the shift-selection anchor', async () => {
    const wrapper = mountSidebar({
      chatSessionRows: [
        {
          sessionId: 'session_a',
          targetId: 'char_1',
          kind: 'single',
          title: '第一次聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_b',
          targetId: 'char_1',
          kind: 'single',
          title: '第二次聊天',
          label: '',
          preview: '中间消息',
          updatedAt: '2026-04-28T02:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_c',
          targetId: 'char_1',
          kind: 'single',
          title: '第三次聊天',
          label: '',
          preview: '新消息',
          updatedAt: '2026-04-28T03:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    const rows = wrapper.findAll('.chat-session-row')
    await rows[0].trigger('click')
    await rows[2].trigger('click', { shiftKey: true })

    expect(rows[0].classes()).toContain('chat-session-row--selected')
    expect(rows[1].classes()).toContain('chat-session-row--selected')
    expect(rows[2].classes()).toContain('chat-session-row--selected')
    expect(rows[0].classes()).toContain('chat-session-row--selected-next')
    expect(rows[1].classes()).toContain('chat-session-row--selected-prev')
    expect(rows[1].classes()).toContain('chat-session-row--selected-next')
    expect(rows[2].classes()).toContain('chat-session-row--selected-prev')

    wrapper.unmount()
  })

  it('does not append chat sessions on plain click or mouse hover after a desktop multi-select', async () => {
    const wrapper = mountSidebar({
      chatSessionRows: [
        {
          sessionId: 'session_a',
          targetId: 'char_1',
          kind: 'single',
          title: '第一次聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_b',
          targetId: 'char_1',
          kind: 'single',
          title: '第二次聊天',
          label: '',
          preview: '中间消息',
          updatedAt: '2026-04-28T02:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'session_c',
          targetId: 'char_1',
          kind: 'single',
          title: '第三次聊天',
          label: '',
          preview: '新消息',
          updatedAt: '2026-04-28T03:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    const rows = wrapper.findAll('.chat-session-row')
    await rows[0].trigger('click')
    await rows[1].trigger('click', { shiftKey: true })
    const mouseMove = new MouseEvent('pointermove', { bubbles: true, cancelable: true })
    Object.entries({
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 80
    }).forEach(([key, value]) => {
      Object.defineProperty(mouseMove, key, { configurable: true, value })
    })
    rows[2].element.dispatchEvent(mouseMove)
    await wrapper.vm.$nextTick()

    expect(rows[2].classes()).not.toContain('chat-session-row--selected')

    await rows[2].trigger('click')

    expect(rows[0].classes()).not.toContain('chat-session-row--selected')
    expect(rows[1].classes()).not.toContain('chat-session-row--selected')
    expect(rows[2].classes()).toContain('chat-session-row--selected')
    expect(wrapper.emitted('switch-session')?.at(-1)).toEqual(['session_c'])

    wrapper.unmount()
  })

  it('runs chat session row menu actions by session id', async () => {
    const archiveChatSession = vi.fn()
    const deleteChatSession = vi.fn()
    const wrapper = mountSidebar({
      archiveChatSession,
      deleteChatSession,
      chatSessionRows: [
        {
          sessionId: 'session_a',
          targetId: 'char_1',
          kind: 'single',
          title: '第一次聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    await wrapper.get('.chat-session-row').trigger('contextmenu')
    const items = wrapper.findAll('.sidebar-row-menu-item')
    const archiveItem = items.find((item) => item.text() === '归档')
    const deleteItem = items.find((item) => item.text() === '删除')

    expect(archiveItem).toBeUndefined()
    await deleteItem.trigger('click')

    expect(archiveChatSession).not.toHaveBeenCalled()
    expect(deleteChatSession).toHaveBeenCalledWith('session_a')

    wrapper.unmount()
  })

  it('deletes all selected sessions when menu opens in batch mode', async () => {
    const deleteChatSession = vi.fn()
    const deleteChatSessions = vi.fn()
    const buildRow = (id, title, updatedAt) => ({
      sessionId: id,
      targetId: 'char_1',
      kind: 'single',
      title,
      label: '',
      preview: '消息',
      updatedAt,
      participantCount: 1,
      messageCount: 1
    })
    const wrapper = mountSidebar({
      deleteChatSession,
      deleteChatSessions,
      chatSessionRows: [
        buildRow('session_a', '第一次聊天', '2026-04-28T01:00:00.000Z'),
        buildRow('session_b', '第二次聊天', '2026-04-28T02:00:00.000Z'),
        buildRow('session_c', '第三次聊天', '2026-04-28T03:00:00.000Z')
      ]
    })

    const rows = wrapper.findAll('.chat-session-row')
    await rows[0].trigger('click')
    await rows[1].trigger('click', { shiftKey: true })
    await rows[0].trigger('contextmenu')

    const deleteItem = wrapper.findAll('.sidebar-row-menu-item').find((item) => item.text() === '删除')
    await deleteItem.trigger('click')

    expect(deleteChatSessions).toHaveBeenCalledWith(['session_a', 'session_b'])
    expect(deleteChatSession).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not expose the retired archived-session filter', async () => {
    const wrapper = mountSidebar({
      chatSessionRows: [
        {
          sessionId: 'session_1',
          targetId: 'char_1',
          kind: 'single',
          isArchived: false,
          title: '当前聊天',
          label: '',
          preview: '新消息',
          updatedAt: '2026-04-28T02:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        },
        {
          sessionId: 'archive_1',
          targetId: 'char_1',
          kind: 'single',
          isArchived: true,
          title: '已归档聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    expect(wrapper.text()).toContain('当前聊天')
    expect(wrapper.text()).not.toContain('已归档聊天')

    await wrapper.find('.chat-session-filter-button').trigger('click')
    const archivedFilter = wrapper.findAll('.chat-session-filter-item').find((item) => item.text() === '已归档')
    expect(archivedFilter).toBeUndefined()

    wrapper.unmount()
  })

  it('does not offer archive action for legacy archived rows', async () => {
    const wrapper = mountSidebar({
      chatSessionRows: [
        {
          sessionId: 'archive_1',
          targetId: 'char_1',
          kind: 'single',
          isArchived: true,
          title: '已归档聊天',
          label: '',
          preview: '旧消息',
          updatedAt: '2026-04-28T01:00:00.000Z',
          participantCount: 1,
          messageCount: 1
        }
      ]
    })

    await wrapper.find('.chat-session-filter-button').trigger('click')
    const archivedFilter = wrapper.findAll('.chat-session-filter-item').find((item) => item.text() === '已归档')
    expect(archivedFilter).toBeUndefined()

    const items = wrapper.findAll('.sidebar-row-menu-item').map((item) => item.text())

    expect(items).not.toContain('归档')

    wrapper.unmount()
  })

  it('selects the role workspace target without switching chat in role mode', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: 'char_1'
    })

    expect(wrapper.text()).toContain('星依')
    expect(wrapper.text()).not.toContain('测试群聊')
    expect(wrapper.text()).not.toContain('路人组')

    const row = wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]')
    await row.trigger('click')

    expect(row.classes()).toContain('active')
    expect(wrapper.emitted('select-role-character')?.[0]).toEqual(['char_1'])
    expect(wrapper.emitted('open-role-brain-drawer')?.[0]).toEqual([])
    expect(wrapper.emitted('switch-chat')).toBeUndefined()

    wrapper.unmount()
  })

  it('uses modifier clicks for role-page multi-select instead of opening the role drawer', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: '',
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依' },
        { id: 'char_2', name: '镜庭', gender: '男', age: 20, emoji: '镜' },
        { id: 'char_3', name: '余烬', gender: '女', age: 19, emoji: '烬' }
      ]
    })

    const first = wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]')
    const third = wrapper.find('[data-contact-kind="char"][data-contact-id="char_3"]')

    await first.trigger('click', { ctrlKey: true })
    await third.trigger('click', { shiftKey: true })

    expect(wrapper.emitted('select-role-character')).toBeUndefined()
    expect(wrapper.emitted('open-role-brain-drawer')).toBeUndefined()
    expect(wrapper.find('[data-contact-id="char_1"]').classes()).toContain('sidebar-item--selected')
    expect(wrapper.find('[data-contact-id="char_2"]').classes()).toContain('sidebar-item--selected')
    expect(wrapper.find('[data-contact-id="char_3"]').classes()).toContain('sidebar-item--selected')

    wrapper.unmount()
  })

  it('keeps the complete role selection when opening move from any selected row', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: '',
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依' },
        { id: 'char_2', name: '镜庭', gender: '男', age: 20, emoji: '镜' },
        { id: 'char_3', name: '余烬', gender: '女', age: 19, emoji: '烬' }
      ]
    })

    const rows = wrapper.findAll('[data-contact-kind="char"][data-contact-id]')
    await rows[0].trigger('click', { ctrlKey: true })
    await rows[1].trigger('click', { ctrlKey: true })
    await rows[1].trigger('contextmenu')

    const moveItem = wrapper.findAll('.sidebar-row-menu-item').find((item) => item.text() === '移入别的组别')
    expect(moveItem).toBeTruthy()
    await moveItem.trigger('click')

    const moveDialog = wrapper.findComponent({ name: 'AppMoveDialog' })
    expect(moveDialog.props('open')).toBe(true)
    expect(moveDialog.props('sourceLabels')).toEqual(['星依', '镜庭'])

    wrapper.unmount()
  })

  it('keeps role mode as a character list instead of an inline brain tree', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      currentTarget: 'char_1'
    })

    expect(wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]').exists()).toBe(true)
    expect(wrapper.find('.role-brain-tree').exists()).toBe(false)
    expect(wrapper.text()).toContain('全部角色')
    expect(wrapper.text()).not.toContain('核心')
    expect(wrapper.text()).not.toContain('姓名')
    expect(wrapper.find('[title="拖动调整角色和群众角色高度"]').exists()).toBe(false)

    await wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]').trigger('click')

    expect(wrapper.emitted('select-role-character')?.[0]).toEqual(['char_1'])
    expect(wrapper.emitted('open-role-brain-drawer')?.[0]).toEqual([])
    expect(wrapper.emitted('select-role-unit')).toBeUndefined()

    wrapper.unmount()
  })

  it('keeps role groups collapsed by default when entering the role page', () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      collapsedGroups: {},
      characterGroups: [{ id: 'role_group', name: '主角组' }],
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依', groupId: 'role_group' }
      ],
      getCharactersByGroup: (groupId) => groupId === 'role_group'
        ? [{ id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依', groupId: 'role_group' }]
        : []
    })

    expect(wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]').isVisible()).toBe(false)
    expect(wrapper.find('[aria-label="全部展开所有组别"]').exists()).toBe(true)
    expect(wrapper.emitted('toggle-group-collapse')).toBeUndefined()

    wrapper.unmount()
  })

  it('shows persisted expanded role groups instead of the default collapsed state', () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      collapsedGroups: { role_group: false },
      characterGroups: [{ id: 'role_group', name: '主角组' }],
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依', groupId: 'role_group' }
      ],
      getCharactersByGroup: (groupId) => groupId === 'role_group'
        ? [{ id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依', groupId: 'role_group' }]
        : []
    })

    expect(wrapper.find('[data-contact-kind="char"][data-contact-id="char_1"]').isVisible()).toBe(true)
    expect(wrapper.find('[aria-label="全部折叠所有组别"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('does not let rapid role group clicks toggle again through dblclick', async () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'roles',
      collapsedGroups: { role_group: true },
      characterGroups: [{ id: 'role_group', name: '主角组' }],
      characters: [
        { id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依', groupId: 'role_group' }
      ],
      getCharactersByGroup: (groupId) => groupId === 'role_group'
        ? [{ id: 'char_1', name: '星依', gender: '女', age: 18, emoji: '依', groupId: 'role_group' }]
        : []
    })

    const header = wrapper.get('[data-contact-group-header="true"][data-character-group-id="role_group"]')
    await header.trigger('click')
    await header.trigger('click')
    await header.trigger('dblclick')

    expect(wrapper.emitted('toggle-group-collapse')).toEqual([
      ['role_group'],
      ['role_group']
    ])

    wrapper.unmount()
  })

  it('passes Markdown submenu options to the external doc-library tree menu', () => {
    const wrapper = mountSidebar({
      workspacePrimaryView: 'docs',
      docSidebarState: {
        activeTab: 'worldbook',
        worldbook: {
          treeVisible: true,
          clusters: [
            { id: 'cluster-a', label: '亚什基诺', open: true, count: 1 }
          ],
          selectedCount: 1,
          clipboardMode: '',
          clipboardHasData: false,
          rows: [
            {
              id: 'document:doc-a',
              kind: 'document',
              label: '大陆总览',
              depth: 0,
              clusterId: 'cluster-a',
              itemId: 'doc-a',
              parentFolderId: '__root__',
              active: true
            }
          ],
          rowsByCluster: {
            'cluster-a': [
              {
                id: 'document:doc-a',
                kind: 'document',
                label: '大陆总览',
                depth: 0,
                clusterId: 'cluster-a',
                itemId: 'doc-a',
                parentFolderId: '__root__',
                active: true
              }
            ]
          }
        },
        summary: { treeVisible: true, selectedCount: 0, currentTab: 'small', rows: [] },
        prompt: { selectedId: '', totalCount: 0, rows: [] },
        relation: { activeTab: 'predicates', predicatesCount: 0, candidatesCount: 0, confirmedCount: 0 }
      }
    })

    const tree = wrapper.findComponent(SoneTreeRows)
    const rows = tree.props('rows')
    const documentRow = rows.find((row) => row.id === 'document:doc-a')
    const exportMarkdown = documentRow.menuItems.find((item) => item.key === 'export-markdown')
    const exportBody = exportMarkdown.children.find((item) => item.key === 'export-body-markdown')
    const exportCompile = exportMarkdown.children.find((item) => item.key === 'export-compile-page-markdown')

    expect(exportMarkdown.label).toBe('导出')
    expect(exportBody.children.map((item) => item.action)).toEqual([
      'copy-json',
      'export-json'
    ])
    expect(exportCompile.children.map((item) => item.action)).toEqual([
      'copy-markdown-with-compile-prompt',
      'export-markdown-with-compile-prompt'
    ])

    wrapper.unmount()
  })

  it('passes compile page indicators to the external doc-library tree', () => {
    const clusterIndicator = { missing: false, error: true, title: '编译页存在错误' }
    const documentIndicator = { missing: true, error: true, title: '编译页缺失字段；编译页存在错误' }
    const documentRow = {
      id: 'document:doc-a',
      kind: 'document',
      label: '咸水',
      depth: 0,
      clusterId: 'cluster-a',
      itemId: 'doc-a',
      parentFolderId: '__root__',
      active: true,
      compilePageIndicator: documentIndicator
    }
    const wrapper = mountSidebar({
      workspacePrimaryView: 'docs',
      docSidebarState: {
        activeTab: 'worldbook',
        worldbook: {
          treeVisible: true,
          clusters: [
            { id: 'cluster-a', label: '亚什基诺', open: true, count: 1, compilePageIndicator: clusterIndicator }
          ],
          selectedCount: 0,
          clipboardMode: '',
          clipboardHasData: false,
          rows: [documentRow],
          rowsByCluster: { 'cluster-a': [documentRow] }
        },
        summary: { treeVisible: true, selectedCount: 0, currentTab: 'small', rows: [] },
        prompt: { selectedId: '', totalCount: 0, rows: [] },
        relation: { activeTab: 'predicates', predicatesCount: 0, candidatesCount: 0, confirmedCount: 0 }
      }
    })

    const tree = wrapper.findComponent(SoneTreeRows)
    const rows = tree.props('rows')
    const clusterRow = rows.find((row) => row.sourceKind === 'cluster')
    const soneDocumentRow = rows.find((row) => row.id === 'document:doc-a')

    expect(clusterRow).toBeTruthy()
    expect(soneDocumentRow).toBeTruthy()
    expect(clusterRow.compilePageIndicator).toMatchObject(clusterIndicator)
    expect(soneDocumentRow.compilePageIndicator).toMatchObject(documentIndicator)

    wrapper.unmount()
  })
})
