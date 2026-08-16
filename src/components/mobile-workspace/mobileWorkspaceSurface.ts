export const MOBILE_WORKSPACE_SURFACE_QUERY_VALUE = 'mobile'
export const DESKTOP_WORKSPACE_SURFACE_QUERY_VALUE = 'desktop'

// 自动判定移动 shell 的视口阈值：与桌面布局收窄断点一致（main.css 的 768px）。
export const MOBILE_WORKSPACE_MAX_WIDTH = 768

// 真机判定信号：触摸为主的设备 UA。只作为「是否移动设备」一项，
// 仍需配合窄视口才进入移动 shell，避免桌面窄窗口被劫持。
const MOBILE_USER_AGENT_RE = /Android|iPhone|iPod|iPad|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i

export interface MobileWorkspaceEnv {
  viewportWidth?: number
  coarsePointer?: boolean
  userAgent?: string
}

type ResolvedSurfaceOverride = 'mobile' | 'desktop' | null

// 显式 surface 参数是最高优先级开关：?surface=mobile 强制移动、?surface=desktop 强制桌面。
function readSurfaceOverride(search: string): ResolvedSurfaceOverride {
  const normalizedSearch = String(search || '').trim()
  if (!normalizedSearch) return null

  try {
    const params = new URLSearchParams(normalizedSearch.startsWith('?') ? normalizedSearch.slice(1) : normalizedSearch)
    const value = params.get('surface')
    if (value === MOBILE_WORKSPACE_SURFACE_QUERY_VALUE) return 'mobile'
    if (value === DESKTOP_WORKSPACE_SURFACE_QUERY_VALUE) return 'desktop'
    return null
  } catch {
    return null
  }
}

// 未显式指定时，从浏览器环境读取自动判定所需信号；非浏览器环境返回 null。
function resolveEnv(env?: MobileWorkspaceEnv): Required<MobileWorkspaceEnv> | null {
  if (env) {
    return {
      viewportWidth: env.viewportWidth ?? 0,
      coarsePointer: env.coarsePointer ?? false,
      userAgent: env.userAgent ?? ''
    }
  }

  if (typeof window === 'undefined') return null

  let coarsePointer = false
  try {
    coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  } catch {
    coarsePointer = false
  }

  return {
    viewportWidth: window.innerWidth || window.document?.documentElement?.clientWidth || 0,
    coarsePointer,
    userAgent: window.navigator?.userAgent || ''
  }
}

export function shouldUseMobileWorkspace(search = '', env?: MobileWorkspaceEnv): boolean {
  const override = readSurfaceOverride(search)
  if (override) return override === 'mobile'

  // 自动判定：仅在「真实移动设备」且「窄视口」同时成立时进入移动 shell。
  const resolved = resolveEnv(env)
  if (!resolved) return false

  const narrowViewport = resolved.viewportWidth > 0 && resolved.viewportWidth <= MOBILE_WORKSPACE_MAX_WIDTH
  const mobileDevice = resolved.coarsePointer || MOBILE_USER_AGENT_RE.test(resolved.userAgent)
  return narrowViewport && mobileDevice
}
