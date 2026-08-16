// 像素中控台快捷键：单一动作注册表 + 键位映射，供菜单/工具栏/画布/全局 keydown 分发共用同一份真值。
// 纯逻辑（不依赖 Vue/DOM），localStorage 访问通过可注入的 StorageLike，方便单测用内存 mock。

export type PixelActionId =
  | 'tool.select'
  | 'tool.marquee'
  | 'tool.lasso'
  | 'tool.brush'
  | 'tool.eraser'
  | 'tool.bucket'
  | 'tool.line'
  | 'tool.rect'
  | 'tool.ellipse'
  | 'tool.eyedropper'
  | 'tool.zoom'
  | 'brush.sizeDown'
  | 'brush.sizeUp'
  | 'color.swapTransparent'
  | 'view.toggleGrid'
  | 'view.fitWindow'
  | 'view.actualSize'
  | 'view.pan'
  | 'edit.undo'
  | 'edit.redo'
  | 'color.adjust'
  | 'pixel.cleanup'
  | 'selection.clear'
  | 'selection.all'
  | 'selection.copy'
  | 'selection.paste'
  | 'selection.cut'
  | 'selection.transform'
  | 'selection.deletePixels'
  | 'layer.add'
  | 'layer.remove'
  | 'layer.previous'
  | 'layer.next'
  | 'frame.previous'
  | 'frame.next'
  | 'playback.toggle'
  | 'file.new'
  | 'file.open'
  | 'file.import'
  | 'file.export'
  | 'file.save'

export type PixelActionGroup = '工具' | '画布' | '图层' | '动画' | '编辑'

export interface KeyChord {
  /** 规范化后的按键：小写字母/符号原样，空格记为 'space' */
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ActionDef {
  id: PixelActionId
  label: string
  group: PixelActionGroup
  defaultChord: KeyChord
}

export const ACTION_DEFS: ActionDef[] = [
  { id: 'tool.select', label: '选择', group: '工具', defaultChord: { key: 'v' } },
  { id: 'tool.marquee', label: '矩形选区', group: '工具', defaultChord: { key: 'm' } },
  { id: 'tool.lasso', label: '套索', group: '工具', defaultChord: { key: 'r' } },
  { id: 'tool.brush', label: '笔刷', group: '工具', defaultChord: { key: 'b' } },
  { id: 'tool.eraser', label: '橡皮', group: '工具', defaultChord: { key: 'e' } },
  { id: 'tool.bucket', label: '油漆桶', group: '工具', defaultChord: { key: 'f' } },
  { id: 'tool.line', label: '直线', group: '工具', defaultChord: { key: 'l' } },
  { id: 'tool.rect', label: '矩形', group: '工具', defaultChord: { key: 'u' } },
  { id: 'tool.ellipse', label: '椭圆', group: '工具', defaultChord: { key: 'o' } },
  { id: 'tool.eyedropper', label: '取色器', group: '工具', defaultChord: { key: 'i' } },
  { id: 'tool.zoom', label: '放大镜', group: '工具', defaultChord: { key: 'z' } },
  { id: 'brush.sizeDown', label: '笔刷尺寸减小', group: '工具', defaultChord: { key: '[' } },
  { id: 'brush.sizeUp', label: '笔刷尺寸增大', group: '工具', defaultChord: { key: ']' } },
  { id: 'color.swapTransparent', label: '当前色/透明互换', group: '工具', defaultChord: { key: 'x' } },
  { id: 'view.toggleGrid', label: '网格开关', group: '画布', defaultChord: { key: 'g' } },
  { id: 'view.fitWindow', label: '适应窗口', group: '画布', defaultChord: { key: '0' } },
  { id: 'view.actualSize', label: '实际大小 100%', group: '画布', defaultChord: { key: '1' } },
  { id: 'view.pan', label: '按住平移画布', group: '画布', defaultChord: { key: 'space' } },
  { id: 'edit.undo', label: '撤销', group: '编辑', defaultChord: { key: 'z', ctrl: true } },
  { id: 'edit.redo', label: '重做', group: '编辑', defaultChord: { key: 'y', ctrl: true } },
  { id: 'color.adjust', label: '色相 / 饱和度 / 明度', group: '编辑', defaultChord: { key: 'u', ctrl: true } },
  { id: 'pixel.cleanup', label: '去除杂色', group: '编辑', defaultChord: { key: 'u', ctrl: true, shift: true } },
  { id: 'selection.clear', label: '取消选区', group: '编辑', defaultChord: { key: 'd', ctrl: true } },
  { id: 'selection.all', label: '全选画板', group: '编辑', defaultChord: { key: 'a', ctrl: true } },
  { id: 'selection.copy', label: '复制选中像素', group: '编辑', defaultChord: { key: 'c', ctrl: true } },
  { id: 'selection.paste', label: '粘贴像素', group: '编辑', defaultChord: { key: 'v', ctrl: true } },
  { id: 'selection.cut', label: '剪切选中像素', group: '编辑', defaultChord: { key: 'x', ctrl: true } },
  { id: 'selection.transform', label: '自由变换选中像素', group: '编辑', defaultChord: { key: 't' } },
  { id: 'selection.deletePixels', label: '删除选中像素', group: '编辑', defaultChord: { key: 'delete' } },
  { id: 'layer.previous', label: '切换到上一个图层', group: '图层', defaultChord: { key: 'a', shift: true } },
  { id: 'layer.next', label: '切换到下一个图层', group: '图层', defaultChord: { key: 's', shift: true } },
  { id: 'layer.add', label: '在当前层上方新建图层', group: '图层', defaultChord: { key: 'n' } },
  { id: 'layer.remove', label: '删除当前图层', group: '图层', defaultChord: { key: 'q', ctrl: true } },
  { id: 'frame.previous', label: '上一个画帧', group: '动画', defaultChord: { key: ',' } },
  { id: 'frame.next', label: '下一个画帧', group: '动画', defaultChord: { key: '.' } },
  { id: 'playback.toggle', label: '播放 / 暂停', group: '动画', defaultChord: { key: 'p' } },
  { id: 'file.new', label: '新建文档', group: '编辑', defaultChord: { key: 'n', ctrl: true } },
  { id: 'file.open', label: '打开文档', group: '编辑', defaultChord: { key: 'o', ctrl: true } },
  { id: 'file.import', label: '导入图片量化', group: '编辑', defaultChord: { key: 'i', ctrl: true } },
  { id: 'file.export', label: '导出 PNG', group: '编辑', defaultChord: { key: 'e', ctrl: true } },
  { id: 'file.save', label: '保存', group: '编辑', defaultChord: { key: 's', ctrl: true, shift: true } }
]

const ACTION_DEF_MAP: Record<PixelActionId, ActionDef> = ACTION_DEFS.reduce((acc, def) => {
  acc[def.id] = def
  return acc
}, {} as Record<PixelActionId, ActionDef>)

/** 键位状态只存"覆盖"和"显式解绑"（null），未出现的动作沿用默认键位；这样新增动作会自动补默认键，不需要迁移 localStorage。 */
export type KeymapState = Partial<Record<PixelActionId, KeyChord | null>>

export function getDefaultChord(id: PixelActionId): KeyChord {
  return ACTION_DEF_MAP[id].defaultChord
}

/** 某动作当前生效的键位；null 表示用户已显式解绑 */
export function getEffectiveChord(state: KeymapState, id: PixelActionId): KeyChord | null {
  if (Object.prototype.hasOwnProperty.call(state, id)) {
    return state[id] ?? null
  }
  return getDefaultChord(id)
}

function normalizeKey(rawKey: string): string {
  if (rawKey === ' ') return 'space'
  return rawKey.toLowerCase()
}

/** 把 KeyboardEvent（或等价的纯对象，方便单测不依赖真实事件）转换为规范化按键组合 */
export function chordFromEvent(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }): KeyChord {
  return {
    key: normalizeKey(e.key),
    ctrl: !!(e.ctrlKey || e.metaKey),
    shift: !!e.shiftKey,
    alt: !!e.altKey
  }
}

/** 按键组合的规范化字符串键，用于 Map 查找与相等比较 */
export function chordKey(chord: KeyChord): string {
  return `${chord.ctrl ? 'ctrl+' : ''}${chord.shift ? 'shift+' : ''}${chord.alt ? 'alt+' : ''}${chord.key}`
}

export function chordEquals(a: KeyChord | null, b: KeyChord | null): boolean {
  if (!a || !b) return a === b
  return chordKey(a) === chordKey(b)
}

const KEY_DISPLAY_OVERRIDES: Record<string, string> = {
  space: 'Space'
}

/** 键位组合的展示文案，如 { key:'s', ctrl:true } -> 'Ctrl+S' */
export function chordToLabel(chord: KeyChord | null): string {
  if (!chord) return '未绑定'
  const parts: string[] = []
  if (chord.ctrl) parts.push('Ctrl')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')
  const keyLabel = KEY_DISPLAY_OVERRIDES[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key)
  parts.push(keyLabel)
  return parts.join('+')
}

/** 由当前键位状态构建"键位字符串 -> 动作"反查表，供 matchAction 单点分发使用 */
export function buildReverseMap(state: KeymapState): Record<string, PixelActionId> {
  const map: Record<string, PixelActionId> = {}
  for (const def of ACTION_DEFS) {
    const chord = getEffectiveChord(state, def.id)
    if (chord) map[chordKey(chord)] = def.id
  }
  return map
}

/** 单点分发入口：给定一次按键事件，查出当前键位映射下命中的动作（未命中返回 null） */
export function matchAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }, state: KeymapState): PixelActionId | null {
  const reverse = buildReverseMap(state)
  return reverse[chordKey(chordFromEvent(e))] ?? null
}

export interface RebindResult {
  state: KeymapState
  /** 若新键位原本被其它动作占用，返回被顶替、变为未绑定的动作 id */
  unbound: PixelActionId | null
}

/** 重新绑定某动作的键位：新键位立即生效；若原被其它动作占用，原动作显式解绑（不是回退默认，避免和默认键循环冲突） */
export function rebindAction(state: KeymapState, actionId: PixelActionId, newChord: KeyChord): RebindResult {
  const next: KeymapState = { ...state }
  const newKey = chordKey(newChord)
  let unbound: PixelActionId | null = null
  for (const def of ACTION_DEFS) {
    if (def.id === actionId) continue
    const chord = getEffectiveChord(state, def.id)
    if (chord && chordKey(chord) === newKey) {
      next[def.id] = null
      unbound = def.id
      break
    }
  }
  next[actionId] = newChord
  return { state: next, unbound }
}

export function resetToDefaults(): KeymapState {
  return {}
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'pixel-studio:keymap'

function isValidChord(v: unknown): v is KeyChord {
  return !!v && typeof v === 'object' && typeof (v as KeyChord).key === 'string'
}

// 2026-07-19 前的默认键占用了浏览器保留组合键。只迁移这两个完全一致的旧默认值，
// 其它用户自定义绑定继续原样保留，避免改默认键后 localStorage 又把旧键带回来。
const LEGACY_BROWSER_RESERVED_DEFAULTS: Partial<Record<PixelActionId, KeyChord>> = {
  'selection.transform': { key: 't', ctrl: true },
  'layer.add': { key: 'w', ctrl: true }
}

/** 从 storage 读取并与默认表合并；损坏/非法数据静默回退为全默认，不抛错阻断加载 */
export function loadKeymap(storage: StorageLike): KeymapState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: KeymapState = {}
    for (const def of ACTION_DEFS) {
      if (!Object.prototype.hasOwnProperty.call(parsed, def.id)) continue
      const v = (parsed as Record<string, unknown>)[def.id]
      if (v === null) {
        result[def.id] = null
      } else if (isValidChord(v)) {
        const normalized = { key: v.key, ctrl: !!v.ctrl, shift: !!v.shift, alt: !!v.alt }
        const legacyDefault = LEGACY_BROWSER_RESERVED_DEFAULTS[def.id]
        if (legacyDefault && chordEquals(normalized, legacyDefault)) continue
        result[def.id] = normalized
      }
    }
    return result
  } catch {
    return {}
  }
}

export function saveKeymap(state: KeymapState, storage: StorageLike): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function actionsByGroup(): Record<PixelActionGroup, ActionDef[]> {
  const groups: Record<PixelActionGroup, ActionDef[]> = { 工具: [], 画布: [], 图层: [], 动画: [], 编辑: [] }
  for (const def of ACTION_DEFS) groups[def.group].push(def)
  return groups
}
