import { describe, expect, it } from 'vitest'
import {
  ACTION_DEFS,
  actionsByGroup,
  buildReverseMap,
  chordEquals,
  chordKey,
  chordToLabel,
  getDefaultChord,
  getEffectiveChord,
  loadKeymap,
  matchAction,
  rebindAction,
  resetToDefaults,
  saveKeymap
} from '../../../src/pixel-studio/ui/keymap'

// 内存版 storage mock，不依赖真实 localStorage
function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _raw: map
  }
}

describe('pixel-studio keymap', () => {
  it('默认表加载：空 storage 时所有动作沿用 defaultChord', () => {
    const storage = createMemoryStorage()
    const state = loadKeymap(storage)
    expect(state).toEqual({})
    for (const def of ACTION_DEFS) {
      expect(getEffectiveChord(state, def.id)).toEqual(getDefaultChord(def.id))
    }
  })

  it('自定义覆盖：storage 中的键位覆盖对应动作的默认键位', () => {
    const storage = createMemoryStorage()
    storage.setItem('pixel-studio:keymap', JSON.stringify({ 'tool.brush': { key: 'q' } }))
    const state = loadKeymap(storage)
    expect(getEffectiveChord(state, 'tool.brush')).toEqual({ key: 'q', ctrl: false, shift: false, alt: false })
    // 未覆盖的动作仍是默认键位
    expect(getEffectiveChord(state, 'tool.eraser')).toEqual(getDefaultChord('tool.eraser'))
  })

  it('损坏的 storage 数据静默回退为全默认，不抛错', () => {
    const storage = createMemoryStorage()
    storage.setItem('pixel-studio:keymap', '{not valid json')
    expect(() => loadKeymap(storage)).not.toThrow()
    expect(loadKeymap(storage)).toEqual({})
  })

  it('matchAction 按当前键位命中动作', () => {
    const state = {}
    expect(matchAction({ key: 'v' }, state)).toBe('tool.select')
    expect(matchAction({ key: 'm' }, state)).toBe('tool.marquee')
    expect(matchAction({ key: 'r' }, state)).toBe('tool.lasso')
    expect(matchAction({ key: 'z' }, state)).toBe('tool.zoom')
    expect(matchAction({ key: 'b' }, state)).toBe('tool.brush')
    expect(matchAction({ key: 'a', ctrlKey: true }, state)).toBe('selection.all')
    expect(matchAction({ key: 'c', ctrlKey: true }, state)).toBe('selection.copy')
    expect(matchAction({ key: 'v', ctrlKey: true }, state)).toBe('selection.paste')
    expect(matchAction({ key: 'x', ctrlKey: true }, state)).toBe('selection.cut')
    expect(matchAction({ key: 't' }, state)).toBe('selection.transform')
    expect(matchAction({ key: 't', ctrlKey: true }, state)).toBeNull()
    expect(matchAction({ key: 'Delete' }, state)).toBe('selection.deletePixels')
    expect(matchAction({ key: 'n' }, state)).toBe('layer.add')
    expect(matchAction({ key: 'w', ctrlKey: true }, state)).toBeNull()
    expect(matchAction({ key: 'q', ctrlKey: true }, state)).toBe('layer.remove')
    expect(matchAction({ key: 'a', shiftKey: true }, state)).toBe('layer.previous')
    expect(matchAction({ key: 's', shiftKey: true }, state)).toBe('layer.next')
    expect(matchAction({ key: 's', ctrlKey: true, shiftKey: true }, state)).toBe('file.save')
    expect(matchAction({ key: 'z', ctrlKey: true }, state)).toBe('edit.undo')
    expect(matchAction({ key: 'u', ctrlKey: true }, state)).toBe('color.adjust')
    expect(matchAction({ key: 'u', ctrlKey: true, shiftKey: true }, state)).toBe('pixel.cleanup')
    expect(matchAction({ key: 'q' }, state)).toBeNull()
  })

  it('图层动作有独立设置分组，且切换动作可以改绑', () => {
    expect(actionsByGroup().图层.map((def) => def.id)).toEqual([
      'layer.previous',
      'layer.next',
      'layer.add',
      'layer.remove'
    ])
    const { state } = rebindAction({}, 'layer.previous', { key: 'p', alt: true })
    expect(matchAction({ key: 'p', altKey: true }, state)).toBe('layer.previous')
    expect(matchAction({ key: 'a', shiftKey: true }, state)).toBeNull()
  })

  it('冲突让位：把某动作改绑到已被占用的键位，原持有动作变为显式未绑定（null），新动作立即生效', () => {
    const state = {}
    // 把橡皮(默认 e)改绑到 b（笔刷默认占用）
    const { state: next, unbound } = rebindAction(state, 'tool.eraser', { key: 'b' })
    expect(unbound).toBe('tool.brush')
    expect(getEffectiveChord(next, 'tool.eraser')).toEqual({ key: 'b' })
    expect(getEffectiveChord(next, 'tool.brush')).toBeNull()
    // 反查表里 'b' 现在只指向橡皮，不再有笔刷
    const reverse = buildReverseMap(next)
    expect(reverse[chordKey({ key: 'b' })]).toBe('tool.eraser')
    expect(matchAction({ key: 'b' }, next)).toBe('tool.eraser')
  })

  it('冲突让位不误伤无关动作', () => {
    const state = {}
    const { state: next, unbound } = rebindAction(state, 'tool.eraser', { key: 'q' })
    expect(unbound).toBeNull()
    expect(getEffectiveChord(next, 'tool.brush')).toEqual(getDefaultChord('tool.brush'))
  })

  it('恢复默认：resetToDefaults 后所有动作回到 defaultChord', () => {
    const custom = { 'tool.brush': { key: 'q' }, 'tool.eraser': null }
    expect(getEffectiveChord(custom, 'tool.brush')).toEqual({ key: 'q' })
    expect(getEffectiveChord(custom, 'tool.eraser')).toBeNull()
    const reset = resetToDefaults()
    for (const def of ACTION_DEFS) {
      expect(getEffectiveChord(reset, def.id)).toEqual(getDefaultChord(def.id))
    }
  })

  it('localStorage 往返：save 后 load 出的状态与保存前一致', () => {
    const storage = createMemoryStorage()
    const { state: afterRebind } = rebindAction({}, 'tool.eraser', { key: 'q' })
    saveKeymap(afterRebind, storage)
    const loaded = loadKeymap(storage)
    expect(getEffectiveChord(loaded, 'tool.eraser')).toEqual({ key: 'q', ctrl: false, shift: false, alt: false })
    expect(getEffectiveChord(loaded, 'tool.brush')).toEqual(getDefaultChord('tool.brush'))
  })

  it('旧版浏览器保留默认键迁移为新默认键，且不影响其它自定义绑定', () => {
    const storage = createMemoryStorage()
    storage.setItem('pixel-studio:keymap', JSON.stringify({
      'selection.transform': { key: 't', ctrl: true },
      'layer.add': { key: 'w', ctrl: true },
      'tool.brush': { key: 'p' }
    }))
    const loaded = loadKeymap(storage)
    expect(getEffectiveChord(loaded, 'selection.transform')).toEqual({ key: 't' })
    expect(getEffectiveChord(loaded, 'layer.add')).toEqual({ key: 'n' })
    expect(getEffectiveChord(loaded, 'tool.brush')).toEqual({ key: 'p', ctrl: false, shift: false, alt: false })
  })

  it('chordEquals / chordToLabel 展示与比较', () => {
    expect(chordEquals({ key: 's', ctrl: true }, { key: 's', ctrl: true })).toBe(true)
    expect(chordEquals({ key: 's', ctrl: true }, { key: 's' })).toBe(false)
    expect(chordEquals(null, null)).toBe(true)
    expect(chordToLabel({ key: 's', ctrl: true })).toBe('Ctrl+S')
    expect(chordToLabel({ key: 'space' })).toBe('Space')
    expect(chordToLabel({ key: '[' })).toBe('[')
    expect(chordToLabel(null)).toBe('未绑定')
  })
})
