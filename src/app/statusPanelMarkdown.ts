/**
 * 状态栏 Markdown 渲染纯函数（单一真值·状态系统融入提调批次1·2026-07-10）。
 * 联动能力：ChatStatusSystemPanel.vue「复制整表」按钮 与 提调统筹注入（decideRoundDirector→statusPanelsBlock）
 * 共用本模块渲染；改表格式两处同步生效。字段真值沿用 resolvePanelFields（实例快照优先·回退模板·不新增第四处）。
 * 值渲染口径=旧组件复制口径（ref 转被引状态栏名字、数组顿号连、空值空串），不是工具总览的「（空）/（穿透）」口径。
 */
import type { ChatStatusPanel, ChatStatusPanelTemplate, StatusPanelFieldDef } from '../types'
import { statusPanelFieldDisplayLabel } from '../../shared/statusPanelField'
import { resolvePanelFields } from './xingyiStatusSystemTools'

/** MD 表格转义：管道防断列、换行折 <br>（与旧组件内 mdEscape 逐字一致）。 */
export function statusPanelMdEscape(text: string): string {
  return String(text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

/** 字段落库真值读取：binding 真值住绑定目标处（服务端读侧解析进 bindingValues），其余住 values。 */
export function statusPanelStoredValue(panel: ChatStatusPanel, field: StatusPanelFieldDef): unknown {
  if (field.valueType === 'binding') return panel.bindingValues?.[field.key] ?? ''
  return panel.values?.[field.key]
}

/** 字段整行值转纯文本（与组件复制口径一致）：ref 转被引状态栏名称、数组顿号连、其余 String、空值空串。 */
export function statusPanelFieldText(
  field: StatusPanelFieldDef,
  raw: unknown,
  resolvePanelName: (panelId: string) => string
): string {
  if (field.valueType === 'ref') {
    const ids = Array.isArray(raw) ? raw : raw ? [raw] : []
    return ids.map((id) => resolvePanelName(String(id))).join('、')
  }
  if (field.valueType === 'asset') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
    const ref = raw as Record<string, unknown>
    return String(ref.caption || ref.alt || ref.assetId || '')
  }
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? '')).filter(Boolean).join('、')
  return String(raw ?? '')
}

/** 单张状态栏 → Markdown 表（`### 名字` + `| 字段 | 值 |`）。
 *  readValue 缺省读落库真值；组件复制传草稿读取器（所见即所得·含未保存修改）。
 *  ⚠️ 该选项不能叫 valueOf——会撞 Object.prototype.valueOf（options.valueOf 永远真值→裸调内建方法炸
 *  "Cannot convert undefined or null to object"）；options 键一律避开原型链方法名。 */
export function renderStatusPanelMarkdown(
  panel: ChatStatusPanel,
  fields: StatusPanelFieldDef[],
  options: {
    resolvePanelName?: (panelId: string) => string
    readValue?: (field: StatusPanelFieldDef) => unknown
    /** 标题后缀（如「（角色·元英）」）：提调注入标宿主用；缺省无＝组件复制原格式。 */
    titleSuffix?: string
  } = {}
): string {
  const resolveName = options.resolvePanelName || ((id: string) => id)
  const readValue = options.readValue || ((field: StatusPanelFieldDef) => statusPanelStoredValue(panel, field))
  const lines = [`### ${panel.name}${options.titleSuffix || ''}`]
  if (String(panel.description || '').trim()) lines.push('', `> 用途：${statusPanelMdEscape(String(panel.description).trim())}`)
  lines.push('', '| 字段 | 值 |', '| --- | --- |')
  for (const field of Array.isArray(fields) ? fields : []) {
    lines.push(`| ${statusPanelMdEscape(statusPanelFieldDisplayLabel(field))} | ${statusPanelMdEscape(statusPanelFieldText(field, readValue(field), resolveName))} |`)
  }
  return lines.join('\n')
}

/** 提调统筹只注入短目录：状态栏分类完全由用户定义，不能按角色/物品等系统类别猜优先级。
 *  目录靠实例 description 与字段轮廓定位；当前值必须命中后再用 readStatusPanels 按引用展开。 */
export function renderDirectorStatusPanelsBlock(input: {
  panels: ChatStatusPanel[]
  templates: ChatStatusPanelTemplate[]
  characterOptions?: Array<{ id: string; name: string; participantId?: string }>
  tempEntities?: Array<{ id: string; name: string }>
}): string {
  const panels = Array.isArray(input.panels) ? input.panels : []
  if (!panels.length) return '（本会话还没有任何状态栏。）'
  const templateById = new Map((Array.isArray(input.templates) ? input.templates : []).map((t) => [t.id, t]))
  return [
    '以下是状态栏短目录，不含当前值。根据用途摘要命中后，用 readStatusPanels 按引用读取详情；不要按系统预设类别猜优先级。',
    ...panels.map((panel) => {
      const template = templateById.get(panel.templateId)
      const fields = resolvePanelFields(panel, template)
        .map((field) => `${statusPanelFieldDisplayLabel(field) || field.key}[${field.valueType || 'text'}]`)
        .join('、')
      return `- ${panel.name}（用户分类=${template?.kind || '未填写'}；宿主=${panel.hostType}:${panel.hostId || '无'}；id=${panel.id}）｜用途：${String(panel.description || template?.description || '').trim() || '未描述'}${fields ? `｜字段：${fields}` : ''}`
    })
  ].join('\n')
}
