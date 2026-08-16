import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dock = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
const scopeCard = readFileSync(resolve(process.cwd(), 'src/components/app/StatusScopeConfirmCard.vue'), 'utf8')
const workspaceShell = readFileSync(resolve(process.cwd(), 'src/components/app/workspaceAgent/WorkspaceAgentShell.vue'), 'utf8')
const tidiaoDock = readFileSync(resolve(process.cwd(), 'src/components/app/chat/TidiaoDirectorDock.vue'), 'utf8')
const interactionDock = readFileSync(resolve(process.cwd(), 'src/components/app/AgentInteractionDock.vue'), 'utf8')
const taskTodoCard = readFileSync(resolve(process.cwd(), 'src/components/app/AgentTaskTodoCard.vue'), 'utf8')

describe('星依三类互动卡自由意见入口', () => {
  it('confirm / choice / scope 都保留用户自己输入的路径', () => {
    expect(dock).toContain('v-model="confirmFeedbackInput"')
    expect(dock).toContain('@click="submitConfirmFeedback"')
    expect(dock).toContain('v-model="askOtherInput"')
    expect(dock).toContain('<StatusScopeConfirmCard')
    expect(dock).toContain('allow-feedback')
    expect(dock).toContain('@feedback="resolvePendingStatusScopeFeedback($event)"')
    expect(scopeCard).toContain('v-if="allowFeedback"')
    expect(scopeCard).toContain("emit('feedback', feedback)")
  })

  it('自动放行只短路 confirmWrite，askUser 内容拍板仍然创建 choice 卡', () => {
    const writeConfirmBlock = dock.slice(
      dock.indexOf('function requestWriteConfirm'),
      dock.indexOf('function resolvePendingConfirm')
    )
    const askUserBlock = dock.slice(
      dock.indexOf('function requestAskUser'),
      dock.indexOf('function resolvePendingAsk')
    )
    expect(writeConfirmBlock).toContain('if (autoApproveWrites.value)')
    expect(askUserBlock).not.toContain('autoApproveWrites')
    expect(askUserBlock).toContain("kind: 'choice'")
    expect(askUserBlock).toContain("toolName: 'askUser'")
  })

  it('confirm / choice / scope 与三类 Agent 宿主共用底部停靠组件', () => {
    expect(dock).toContain('<AgentInteractionDock v-if="pendingInteraction">')
    expect(workspaceShell).toContain('<AgentInteractionDock v-if="controller.state.pendingInteraction">')
    expect(tidiaoDock).toContain('<AgentInteractionDock v-if="scopePending || huiyuConfirmPending">')
    expect(interactionDock).toContain('flex: 0 0 auto;')
    expect(interactionDock).toContain('max-height: min(58%, 460px);')
    expect(interactionDock).toContain('overflow-y: auto;')
  })

  it('提调批量造册沿用单卡逐人推进，并显示当前进度', () => {
    expect(tidiaoDock).toContain(':key="scopeCardKey"')
    expect(tidiaoDock).toContain('第 ${scopeCardIndex.value}/${scopeCardTotal.value} 位')
    expect(tidiaoDock).toContain('全部选择完才由后台一次批量造册')
    expect(tidiaoDock).toContain('取消只跳过当前角色')
  })

  it('星依与三个工作区专业 Agent 共用同一张输入框上方 TODO 卡', () => {
    expect(dock).toContain('<AgentTaskTodoCard :snapshot="taskTodoSnapshot" />')
    expect(workspaceShell).toContain('<AgentTaskTodoCard :snapshot="controller.state.taskTodo" />')
    expect(taskTodoCard).toContain('langhuan.agentTaskTodo.autoExpand.v1')
    expect(taskTodoCard).toContain("snapshot.state !== 'completed'")
    expect(taskTodoCard).toContain('position: absolute;')
    expect(taskTodoCard).toContain('width: 90%')
    expect(taskTodoCard).toContain('--agent-task-todo-olive: #7f7f4d')
    expect(taskTodoCard).toContain('background: transparent;')
  })
})
