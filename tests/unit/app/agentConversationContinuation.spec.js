/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAgentConversationContinuation,
  readAgentConversationContinuation,
  resetAgentConversationContinuationsForTest,
  saveAgentConversationDeferredTools,
  saveAgentConversationModelSelection,
  saveAgentConversationTaskTodo
} from '../../../src/app/agentRuntime/conversationContinuation.ts'

const TODO = {
  taskId: 'conversation-task',
  revision: 2,
  state: 'active',
  changeKind: 'updated',
  createdAt: 10,
  updatedAt: 20,
  items: [
    { id: 'todo-1', text: '核对资料', acceptance: '资料已核对', status: 'completed' },
    { id: 'todo-2', text: '写入正文', acceptance: '正文已写入', status: 'in_progress' }
  ]
}

describe('Agent conversation continuation', () => {
  beforeEach(() => resetAgentConversationContinuationsForTest())

  it('按会话隔离保存 TODO 与已发现工具，并可在显式删除会话时清理', () => {
    saveAgentConversationTaskTodo('session-a', TODO)
    saveAgentConversationDeferredTools('session-a', ['readDetail', 'readDetail', 'writeTarget'])
    saveAgentConversationModelSelection('session-a', { slotId: 'balanced', effort: 'high' })

    expect(readAgentConversationContinuation('session-a')).toEqual({
      taskTodo: TODO,
      deferredActiveTools: ['readDetail', 'writeTarget'],
      modelSelection: { slotId: 'balanced', effort: 'high' }
    })
    expect(readAgentConversationContinuation('session-b')).toEqual({
      taskTodo: null,
      deferredActiveTools: [],
      modelSelection: null
    })

    clearAgentConversationContinuation('session-a')
    expect(readAgentConversationContinuation('session-a')).toEqual({
      taskTodo: null,
      deferredActiveTools: [],
      modelSelection: null
    })
  })

  it('全部完成或没有条目后不再保留 TODO 续接快照', () => {
    const completed = {
      ...TODO,
      revision: 3,
      state: 'completed',
      changeKind: 'completed',
      items: TODO.items.map((item) => ({ ...item, status: 'completed' }))
    }

    expect(saveAgentConversationTaskTodo('session-completed', completed)).toBeNull()
    expect(readAgentConversationContinuation('session-completed').taskTodo).toBeNull()

    const empty = {
      ...TODO,
      revision: 4,
      state: 'empty',
      changeKind: 'removed',
      items: []
    }
    expect(saveAgentConversationTaskTodo('session-completed', empty)).toBeNull()
    expect(readAgentConversationContinuation('session-completed').taskTodo).toBeNull()
  })
})
