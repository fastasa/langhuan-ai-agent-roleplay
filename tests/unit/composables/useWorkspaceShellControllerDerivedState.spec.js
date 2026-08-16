import { describe, expect, it } from 'vitest'
import { buildWorkspaceShellControllerDerivedState } from '../../../src/composables/app/useWorkspaceShellControllerDerivedState.ts'

describe('useWorkspaceShellControllerDerivedState', () => {
  it('会返回视图桥需要的派生状态集合', () => {
    const state = {
      filteredTickets: {},
      currentMessages: [],
      currentChatTitle: '标题',
      currentAlias: '别名',
      currentScene: '场景',
      loadedSummaryItems: [],
      chatPanelViewModel: {},
      settingsPanelViewModel: {},
      taskPanelMeta: {},
      filteredAtCharacters: [],
      filteredTasks: [],
      ungroupedCharacters: [],
      loadedSummaryCount: 1,
      currentCharacter: { id: 'char-1' },
      currentCharacterAvatar: 'avatar.png'
    }

    const result = buildWorkspaceShellControllerDerivedState(state)

    expect(result).toEqual(state)
  })
})
