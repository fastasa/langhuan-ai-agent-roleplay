/**
 * 状态栏展示元信息单一真值（地图系统批7 抽出）——积木类型图标/色调/中文名 + 宿主文案 + 引用名称/染色，
 * 从 `ChatStatusSystemPanel.vue` 内部私有实现抽出，供它自己与地图弹窗只读卡片（批7 状态联动）共用一份；
 * 改积木类型/宿主文案只改这一处，两处联动生效。纯函数，不碰仓库层，不持有状态。
 */

import type { ChatStatusPanel, ChatStatusPanelTemplate, StatusPanelFieldDef } from '../types'

export type PanelValueDraft = Record<string, unknown>

/** 从状态栏当前真值按字段定义种草稿（只读展示用；与 ChatStatusSystemPanel.vue 的 seedPanelDraft 同一口径）。 */
export function buildPanelValueDraft(panel: ChatStatusPanel, fields: StatusPanelFieldDef[]): PanelValueDraft {
  const draft: PanelValueDraft = {}
  for (const field of fields) {
    const raw = panel.values?.[field.key]
    if (field.valueType === 'binding') {
      draft[field.key] = String(panel.bindingValues?.[field.key] ?? '')
    } else if (field.valueType === 'list') {
      draft[field.key] = Array.isArray(raw) ? raw.map((item) => String(item ?? '')) : []
    } else if (field.valueType === 'ref') {
      draft[field.key] = Array.isArray(raw)
        ? raw.map((item) => String(item ?? '').trim()).filter(Boolean)
        : (raw ? [String(raw)] : [])
    } else if (field.valueType === 'number') {
      draft[field.key] = raw === undefined || raw === null ? '' : String(raw)
    } else if (field.valueType === 'asset') {
      draft[field.key] = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
    } else {
      draft[field.key] = String(raw ?? '')
    }
  }
  return draft
}

// 图标登记见 skill/design/UI_STYLE.md「固定语义图标」第 31 条。
export const STATUS_PANEL_KIND_META: Record<string, { label: string; tint: string; icon: string }> = {
  character: { label: '角色', tint: 'char', icon: '<circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path>' },
  organization: { label: '组织', tint: 'org', icon: '<path d="M18 21a8 8 0 0 0-16 0"></path><circle cx="10" cy="8" r="5"></circle><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"></path>' },
  building: { label: '建筑', tint: 'bld', icon: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>' },
  region: { label: '区域', tint: 'reg', icon: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"></path><path d="M15 5.764v15"></path><path d="M9 3.236v15"></path>' },
  item: { label: '物品', tint: 'item', icon: '<path d="M6 3h12l4 6-10 13L2 9Z"></path><path d="M11 3 8 9l4 13 4-13-3-6"></path><path d="M2 9h20"></path>' }
}
export const STATUS_PANEL_KIND_META_FALLBACK = { label: '', tint: 'any', icon: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path>' }

export function kindMetaOf(kind: string): { label: string; tint: string; icon: string } {
  const key = String(kind || '').trim()
  const meta = STATUS_PANEL_KIND_META[key === 'faction' ? 'organization' : key]
  return meta || { ...STATUS_PANEL_KIND_META_FALLBACK, label: key || '未知' }
}

export function tintClassForKind(kind: string): string {
  return `ssp-tint-${kindMetaOf(kind).tint}`
}

/** 宿主展示文案：角色/临时实体按 id 查名字，用户/独立实体固定文案。 */
export function hostLabelFor(
  panel: Pick<ChatStatusPanel, 'hostType' | 'hostId'>,
  ctx: { characterOptions: Array<{ id: string; name: string }>; tempEntities: Array<{ id: string; name: string }> }
): string {
  if (panel.hostType === 'session_character') {
    const name = ctx.characterOptions.find((option) => option.id === panel.hostId)?.name || panel.hostId
    return `宿主：会话角色 · ${name}`
  }
  if (panel.hostType === 'temp_entity') {
    const name = ctx.tempEntities.find((entity) => entity.id === panel.hostId)?.name || panel.hostId
    return `宿主：临时实体 · ${name}`
  }
  if (panel.hostType === 'user') return '宿主：用户（我）'
  return '宿主：独立实体'
}

/** ref 字段引用目标的展示名（查不到原样回落 id，与 ChatStatusSystemPanel 现役口径一致）。 */
export function panelNameByIdFrom(panels: ChatStatusPanel[], panelId: string): string {
  return panels.find((panel) => panel.id === panelId)?.name || panelId
}

/** ref 引用格按目标积木类型染色。 */
export function refTintClassFrom(panels: ChatStatusPanel[], templates: ChatStatusPanelTemplate[], refId: string): string {
  const panel = panels.find((item) => item.id === refId)
  const template = templates.find((item) => item.id === panel?.templateId)
  return tintClassForKind(template?.kind || '')
}
