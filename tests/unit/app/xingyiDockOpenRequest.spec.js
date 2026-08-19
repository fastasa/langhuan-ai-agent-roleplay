import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  XINGYI_DOCK_OPEN_REQUEST_EVENT,
  readXingyiDockOpenRequest,
  requestXingyiDockOpen
} from '../../../src/app/xingyiDockOpenRequest.ts'

describe('xingyiDockOpenRequest', () => {
  it('用单向打开事件携带预填草稿，不复用 toggle 语义', () => {
    const listener = vi.fn((event) => readXingyiDockOpenRequest(event))
    window.addEventListener(XINGYI_DOCK_OPEN_REQUEST_EVENT, listener)

    expect(requestXingyiDockOpen({ draft: '帮我创建一个角色：' })).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.results[0].value).toEqual({ draft: '帮我创建一个角色：' })

    window.removeEventListener(XINGYI_DOCK_OPEN_REQUEST_EVENT, listener)
  })

  it('角色创建只保留方式选择，AI 下一步直接打开并预填现役浮坞', () => {
    const editorSource = readFileSync(resolve(process.cwd(), 'src/components/app/modals/character/AppCharacterEditorModals.vue'), 'utf8')
    const dockSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')

    expect(editorSource).toContain("requestXingyiDockOpen({ draft: '帮我创建一个角色：' })")
    expect(editorSource).not.toContain('newCharacterStepperSteps')
    expect(editorSource).not.toContain('copyNewCharacterPrompt')
    expect(editorSource).not.toContain('importNewCharacterFromClipboard')
    expect(dockSource).toContain('open.value = true')
    expect(dockSource).toContain('draft.value = request.draft')
    expect(dockSource).toContain('window.addEventListener(XINGYI_DOCK_OPEN_REQUEST_EVENT, handleOpenRequest)')
  })
})
