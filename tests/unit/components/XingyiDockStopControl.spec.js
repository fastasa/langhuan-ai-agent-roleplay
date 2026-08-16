import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
// 发送/停止按钮外观与切换逻辑已抽进共享组件，供不同工作区表面同源复用，
// 断言随之改成读这份组件文件（Dock.vue 只透传 running/@submit/@stop，不再自己拼接三元逻辑）。
const composerSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiChatComposer.vue'), 'utf8')

describe('XingyiDock · 发送键原位停止协议', () => {
  it('单张附件使用完整大图布局，多图继续使用方格网格', () => {
    expect(source).toContain("'xingyi-dock__bubble-images--single': readMessageAttachments(message).length === 1")
    expect(source).toContain('.xingyi-dock__bubble-images--single .xingyi-dock__bubble-image img')
    expect(source).toContain('object-fit: contain;')
  })

  it('地图/剧本仍使用独立专业 Agent；只有状态工作区过渡宿主移动通用星依单实例', () => {
    expect(source).not.toContain('xingyiDockPortal')
    expect(source).toContain('statusWorkspaceXingyiHost')
    expect(source).toContain(`<Teleport :to="statusWorkspaceXingyiHost || 'body'"`)
    expect(source).toContain(':open="dockVisible"')
    expect(source).toContain(':embedded="Boolean(statusWorkspaceXingyiHost)"')
  })

  it('剧本工作台用 scriptwriter_workspace 统一上下文交给编剧，bundle 成员只留给采风作用域', () => {
    expect(source).toContain('const bundleParticipantRows = Array.isArray(bundle.participants)')
    expect(source).toContain('normalizeChatSessionCharacterParticipants({ participants: bundleParticipantRows })')
    expect(source).toContain("agentKind: 'scriptwriter_workspace'")
    expect(source).toContain('contextBlock,')
    expect(source).not.toContain('sessionParticipants: formalSession.characterOptions')
    expect(source).toContain('dispatchXingyiResearch(formalSession, input, agentConfig)')
  })

  it('运行中把发送键切换成停止键，不在头部保留第二个停止入口', () => {
    expect(composerSource).toContain("'xingyi-chat-composer__send--stop': running")
    expect(composerSource).toContain(':title="running ? stopTitle : sendTitle"')
    expect(composerSource).toContain("@click=\"running ? emit('stop') : emit('submit')\"")
    expect(source).toContain(':running="running"')
    expect(source).toContain('@submit="send"')
    expect(source).toContain('@stop="stopXingyiTurn"')
    expect(source).not.toContain('xingyi-dock__stop-btn')
  })

  it('停止时同时中断控制器并释放等待中的人在环上卡片', () => {
    const stopBody = source.match(/function stopXingyiTurn\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(stopBody).toContain('controller.abort()')
    expect(stopBody).toContain('dismissPendingInteraction()')
    expect(source).toContain("if (xingyiAbortController.value?.signal.aborted) return Promise.resolve({ status: 'denied' })")
    expect(source).toContain("if (xingyiAbortController.value?.signal.aborted) return Promise.resolve('')")
    expect(source).toContain('if (xingyiAbortController.value?.signal.aborted) return Promise.resolve(null)')
    expect(source).toContain('takeAttachments(onCaptionUpdate, xingyiAbortController.value?.signal)')
  })

  // IME 回车守卫全站收敛（修复批次H）：XingyiDock 无 mount 用例覆盖全组件（依赖树过重，与本文件既有
  // 源码正则断言风格一致），改用源码断言核实三处 keydown handler 都在最前面挡掉合成中的回车。
  it('输入框/确认反馈/其他想法三处回车 handler 都先挡掉 IME 合成中的回车（isComposing / keyCode 229）', () => {
    const composerBody = source.match(/function handleComposerKeydown\(event: KeyboardEvent\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(composerBody).toContain('if (event.isComposing || event.keyCode === 229) return')

    const confirmBody = source.match(/function handleConfirmFeedbackKeydown\(event: KeyboardEvent\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(confirmBody).toContain('if (event.isComposing || event.keyCode === 229) return')
    expect(confirmBody).toContain('submitConfirmFeedback()')

    const askOtherBody = source.match(/function handleAskOtherKeydown\(event: KeyboardEvent\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(askOtherBody).toContain('if (event.isComposing || event.keyCode === 229) return')
    expect(askOtherBody).toContain('submitAskOther()')
  })

  // 星依/舆图师地图协作防冲突（2026-07-17地图与剧本工作区专业Agent计划批D后续小修）：
  // 星依派发地图工作（会话路径+世界直达路径）前都要先查该世界有没有舆图师正在跑，忙就如实回报不硬改。
  it('派发地图工作前检查舆图师是否正忙：会话路径与世界直达路径各自接线', () => {
    expect(source).toContain("import { isCartographerBusyForWorld } from '../../app/workspaceAgentScopeState'")

    const dispatchBody = source.match(/async function dispatchXingyiMapWork\(([\s\S]*?)\n\}/)?.[1] || ''
    expect(dispatchBody).toContain('if (isCartographerBusyForWorld(worldId)) {')
    expect(dispatchBody).toContain("reason: 'cartographer-busy'")
    expect(dispatchBody).toContain('舆图师正在处理这张地图')

    const dispatchToWorldBody = source.match(/async function dispatchXingyiMapWorkToWorld\(([\s\S]*?)\n\}/)?.[1] || ''
    expect(dispatchToWorldBody).toContain('if (isCartographerBusyForWorld(world.worldId)) {')
    expect(dispatchToWorldBody).toContain("reason: 'cartographer-busy'")
    expect(dispatchToWorldBody).toContain('舆图师正在处理这张地图')
  })

  it('星依所有绘舆 subagent 入口按正式会话加载 huiyu.dispatch 上下文并透传', () => {
    expect(source).toContain("agentKind: 'huiyu_dispatch'")
    expect(source).toContain('sessionId,')
    expect(source).toContain('userText: input.instructions')
    expect(source).toContain('const contextBlock = await loadXingyiHuiyuContextBlock(session, input)')
    expect(source).toContain('contextBlock,')
    expect(source).toContain("throw new Error('绘舆缺少正式会话作用域")
    expect(source).toContain('绘舆统一原始可见上下文加载失败')
  })
})
