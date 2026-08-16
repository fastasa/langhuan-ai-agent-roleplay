import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('Agent task TODO host placement', () => {
  it('星依与工作区 Agent 都把悬浮卡挂在输入框定位容器内', () => {
    const xingyi = source('../../../src/components/app/XingyiDock.vue')
    const workspace = source('../../../src/components/app/workspaceAgent/WorkspaceAgentShell.vue')

    expect(xingyi).toMatch(/<XingyiChatComposer[\s\S]*?<template #task-todo>[\s\S]*?<AgentTaskTodoCard/)
    expect(workspace).toMatch(/<XingyiChatComposer[\s\S]*?<template #task-todo>[\s\S]*?<AgentTaskTodoCard/)
  })
})
