import { describe, expect, it } from 'vitest'
import {
  activateWorkspaceWindow,
  canWorkspaceWindowOpenSidePreview,
  closeWorkspaceWindow,
  createUnitWorkspaceWindow,
  createWorkspaceWindowState,
  getWorkspaceWindowFlexStyle,
  replaceActiveWorkspaceWindowByKind,
  reorderWorkspaceWindow,
  resizeWorkspaceWindow,
  upsertWorkspaceWindow
} from '../../../src/app/workspaceWindowProtocol'

describe('workspaceWindowProtocol', () => {
  it('supports viewer, editor, form and graph windows in one ordered state', () => {
    const state = createWorkspaceWindowState([
      createUnitWorkspaceWindow({ domain: 'docLibrary', unitId: 'doc:1', id: 'viewer', kind: 'viewer', title: '浏览', closable: false }),
      createUnitWorkspaceWindow({ domain: 'docLibrary', unitId: 'doc:1', id: 'editor', kind: 'editor', title: '编辑' }),
      createUnitWorkspaceWindow({ domain: 'characterBrain', unitId: 'brain:1', id: 'form', kind: 'form', title: '表单' }),
      createUnitWorkspaceWindow({ domain: 'characterBrain', unitId: 'brain:1', id: 'graph', kind: 'graph', title: '关系' })
    ])

    expect(state.windows.map((window) => window.kind)).toEqual(['viewer', 'editor', 'form', 'graph'])
    expect(state.windows.map((window) => window.domain)).toEqual(['docLibrary', 'docLibrary', 'characterBrain', 'characterBrain'])
    expect(canWorkspaceWindowOpenSidePreview(state.windows[1])).toBe(true)
    expect(canWorkspaceWindowOpenSidePreview(state.windows[2])).toBe(false)
  })

  it('creates stable unit workspace windows with source metadata', () => {
    const window = createUnitWorkspaceWindow({
      domain: 'characterBrain',
      unitId: 'unit:soul:1',
      kind: 'viewer',
      title: '灵魂节点',
      sourceKind: 'soulNode'
    })

    expect(window).toMatchObject({
      id: 'characterBrain:viewer:unit:soul:1',
      domain: 'characterBrain',
      unitId: 'unit:soul:1',
      sourceId: 'unit:soul:1',
      sourceKind: 'soulNode'
    })
  })

  it('opens relation graph on the right and can activate, close and reorder tabs', () => {
    const initial = createWorkspaceWindowState([
      { id: 'editor', kind: 'editor', title: '编辑', closable: false }
    ])
    const withGraph = upsertWorkspaceWindow(initial, {
      id: 'relation',
      kind: 'graph',
      title: '关系视图'
    }, { placement: 'right' })
    const reordered = reorderWorkspaceWindow(withGraph, 'relation', 'editor', 'before')
    const activated = activateWorkspaceWindow(reordered, 'editor')
    const closed = closeWorkspaceWindow(activated, 'relation')

    expect(withGraph.windows.map((window) => window.id)).toEqual(['editor', 'relation'])
    expect(reordered.windows.map((window) => window.id)).toEqual(['relation', 'editor'])
    expect(activated.activeWindowId).toBe('editor')
    expect(closed.windows.map((window) => window.id)).toEqual(['editor'])
  })

  it('keeps split widths stable with clamped resizing', () => {
    const state = createWorkspaceWindowState([
      { id: 'editor', kind: 'editor', title: '编辑' },
      { id: 'preview', kind: 'viewer', title: '浏览' }
    ])
    const resizedSmall = resizeWorkspaceWindow(state, 'editor', 80)
    const resizedLarge = resizeWorkspaceWindow(state, 'editor', 2000, { maxWidth: 720 })

    expect(resizedSmall.widths.editor).toBe(260)
    expect(resizedLarge.widths.editor).toBe(720)
  })

  it('derives shared flex style for split panes', () => {
    const state = createWorkspaceWindowState([
      { id: 'editor', kind: 'editor', title: '编辑' },
      { id: 'preview', kind: 'viewer', title: '浏览' }
    ])
    const resized = resizeWorkspaceWindow(state, 'preview', 480)

    expect(getWorkspaceWindowFlexStyle(resized, resized.windows, resized.windows[1])).toEqual({
      flex: '1 1 480px',
      minWidth: '0'
    })
    expect(getWorkspaceWindowFlexStyle(resized, [resized.windows[0]], resized.windows[0])).toEqual({})
  })

  it('replaces the active window only when the next window has the same kind', () => {
    const state = createWorkspaceWindowState([
      { id: 'unit:a', kind: 'viewer', title: '单位 A' }
    ])
    const replaced = replaceActiveWorkspaceWindowByKind(state, {
      id: 'unit:b',
      kind: 'viewer',
      title: '单位 B'
    })
    const withForm = replaceActiveWorkspaceWindowByKind(replaced, {
      id: 'unit:form',
      kind: 'form',
      title: '表单单位'
    })

    expect(replaced.windows.map((window) => window.id)).toEqual(['unit:b'])
    expect(replaced.activeWindowId).toBe('unit:b')
    expect(withForm.windows.map((window) => window.id)).toEqual(['unit:b', 'unit:form'])
    expect(withForm.activeWindowId).toBe('unit:form')
  })

  it('keeps the active id valid when replacing with activate false', () => {
    const state = createWorkspaceWindowState([
      { id: 'unit:a', kind: 'viewer', title: '单位 A' }
    ])
    const replaced = replaceActiveWorkspaceWindowByKind(state, {
      id: 'unit:b',
      kind: 'viewer',
      title: '单位 B'
    }, { activate: false })

    expect(replaced.windows.map((window) => window.id)).toEqual(['unit:b'])
    expect(replaced.activeWindowId).toBe('unit:b')
  })
})
