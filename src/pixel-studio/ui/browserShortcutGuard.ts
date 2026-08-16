/**
 * 像素中控台是完整工作台，编辑器内的组合键归自己的 keymap 管理；除硬刷新外，未绑定组合键也不能漏给浏览器。
 * 文本录入控件由调用方先放行，保留复制、粘贴、全选等原生编辑能力。
 */
export function isBrowserShortcutChord(e: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): boolean {
  // 唯一浏览器保留项：允许用户绕过缓存硬刷新当前工作台。
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'r') return false
  if (e.ctrlKey || e.metaKey || e.altKey) return true
  if (/^F(?:[1-9]|1[0-2])$/i.test(e.key)) return true
  return /^(?:BrowserBack|BrowserForward|BrowserRefresh|BrowserHome|BrowserSearch|BrowserFavorites)$/i.test(e.key)
}
