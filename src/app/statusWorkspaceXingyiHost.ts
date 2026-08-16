import { shallowRef } from 'vue'

/**
 * 状态工作区的通用星依过渡宿主。
 *
 * 这里只移动现役 XingyiDock 的同一个组件实例，不持有会话、消息或运行状态。
 * owner 守卫避免旧弹窗卸载时误清后来注册的新宿主；状态专业 Agent 上线后整模块删除。
 */
export const statusWorkspaceXingyiHost = shallowRef<HTMLElement | null>(null)

let activeOwner: symbol | null = null

export function registerStatusWorkspaceXingyiHost(target: HTMLElement): () => void {
  const owner = Symbol('status-workspace-xingyi-host')
  activeOwner = owner
  statusWorkspaceXingyiHost.value = target

  return () => {
    if (activeOwner !== owner) return
    activeOwner = null
    statusWorkspaceXingyiHost.value = null
  }
}
