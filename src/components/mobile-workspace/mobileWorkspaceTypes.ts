import type { DesktopPanelState } from '../../types/panelContracts'

export type MobileWorkspaceRootTab = 'chat' | 'roles' | 'docs' | 'me'

export type MobileWorkspaceIconName =
  | 'message-circle'
  | 'user-round'
  | 'library-big'
  | 'sparkles'
  | 'search'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevrons-up-down'
  | 'chevrons-down-up'
  | 'undo-2'
  | 'redo-2'
  | 'folder-plus'
  | 'file-plus-2'
  | 'more-horizontal'
  | 'send'
  | 'square'
  | 'eye'
  | 'square-pen'
  | 'network'
  | 'moon'
  | 'archive'
  | 'database'
  | 'shield'
  | 'external-link'
  | 'download'
  | 'x'
  | 'check'
  | 'spark'
  | 'target'
  | 'route'
  | 'share-2'
  | 'book-open'
  | 'git-branch'
  | 'settings'
  | 'filter'
  | 'pin'
  | 'clock'
  | 'list'
  | 'at-sign'
  | 'curtain'
  | 'note'
  | 'tools'
  | 'sun'
  | 'file-text'
  | 'circle-user'
  | 'copy'
  | 'trash'
  | 'refresh-cw'
  | 'eye-off'
  // 与桌面端同功能对齐的图标（直接复用桌面 ChatMainHeader / ChatMessageStream 的 path）
  | 'prompt-log'
  | 'radar'
  | 'refresh'
  | 'settings-2'
  | 'personality-network'
  | 'personality-model'
  // 帷幕时间暂停/继续（与桌面 AppEnvironmentPills 时间胶囊同语义）
  | 'pause'
  | 'play'
  // 帷幕场景设置 / 马甲身份设置（UI_STYLE 固定语义图标表 25 条）
  | 'map-pinned'
  | 'id-card'
  | 'chevron-up'

export type MobileGlassNavItem = {
  id: string
  label: string
  icon: MobileWorkspaceIconName
  disabled?: boolean
}

export type MobileTreeToolbarAction = 'undo' | 'redo' | 'toggle-all' | 'create' | 'create-section' | 'create-page'

export type MobileSelectionAction = {
  id: string
  label: string
  icon?: MobileWorkspaceIconName
  danger?: boolean
  disabled?: boolean
}

/* 多选描述符：子页只上报「是否多选 / 选中几个 / 有哪些动作 / 退出与触发回调」，
   由壳层统一决定底部胶囊显示导航还是操作胶囊（单层原位替换，绝不叠两层）。 */
export type MobileSelectionDescriptor = {
  open: boolean
  count: number
  actions: MobileSelectionAction[]
  onCancel: () => void
  onAction: (actionId: string) => void
}

/* SoneTree 节点（核心/灵魂/轨迹/世界树共用，仅承载视图结构，业务真值仍来自 UnitView） */
export type MobileSoneNode = {
  title: string
  icon?: string
  open?: boolean
  sel?: boolean
  checked?: boolean
  fill?: boolean
  tag?: string | number | null
  key?: string | number
  leafId?: string
  children?: MobileSoneNode[]
}

export type MobileWorkspaceShellProps = {
  state: DesktopPanelState
}
