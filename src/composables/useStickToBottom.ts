import { ref, watch, onScopeDispose, getCurrentScope } from 'vue'
import type { Ref } from 'vue'

/**
 * 智能跟底滚动：贴底时随内容增长自动跟随，用户往上滑后停止跟随，滑回底部恢复。
 * 边界：解除门控只认「scrollTop 变小」=用户真实上滑（scroll/wheel 事件、或 scrollToBottom
 * 同步竞态检测），内容增长（scrollHeight 变大、scrollTop 不变）绝不解除——这是相对旧版
 * 「无状态 48px 贴底检测」的关键差异：大 chunk 一次性把视口推离底部时 scrollTop 没变小，
 * stick 保持 true，跟随不断档。挂回门控只走 scroll 事件里「scrollTop 变大且贴底」的判定；
 * 与 lastKnownScrollTop 持平的 scroll 事件是程序滚底/竞态检测的回声，不改门控（否则小幅
 * 上滑在阈值内被竞态检测解除后，回声会把门控重新挂回 true）。
 * 竞态修复（2026-07-13）：流式期间 scrollToBottom() 在 chunk 回调里同步调用，而 scroll 事件
 * 异步、每帧合并派发——用户上滑改了 scrollTop 后，chunk 同步到达时 scroll 事件可能还没派
 * 发，门控读到陈旧的 true 把视口拽回底部、用户完全翻不动。修法：scrollToBottom 非 force
 * 分支自己同步比较 el.scrollTop 与 lastKnownScrollTop（我方最后一次观察/设置的值），发现
 * 变小就地解除门控、不再滚动，堵住同帧竞态；另加 wheel 监听兜底（deltaY<0 立即解除，早于
 * scroll 事件到达，只解除不挂上）。
 * 联动：移动端 MobileChatThread.vue 已于 2026-07-13 收编共用本 composable（原地自有 stickToBottom
 * + scroll 监听 + gated 跟滚三件套已删除），与桌面主聊天同构，同款竞态一并根治。
 */
export interface UseStickToBottomOptions {
  /** 判定「贴底」的像素阈值，默认 80（旧版分散实现是 48，此处统一放宽） */
  threshold?: number
  /** 是否额外挂 MutationObserver 感知内容增长（DOM 原地变异、无 length 变化场景，如提调坞/星依浮坞） */
  observeMutations?: boolean
}

export interface UseStickToBottomResult {
  /** 是否应跟随到底部；变更途径=用户滚动/滚轮上滑（含 force 场景由 scrollToBottom 主动置位） */
  stickToBottom: Ref<boolean>
  /** 当前是否已处于贴底范围内（阈值内） */
  isNearBottom: () => boolean
  /** 滚到底部；force=true 时无视 stick 状态强滚并把 stick 重置为 true；非 force 时受 stick 门控 */
  scrollToBottom: (force?: boolean) => void
  /** 手动清理监听与 observer（组件作用域内会自动 onScopeDispose，非组件作用域需自行调用） */
  dispose: () => void
}

export function useStickToBottom(
  elRef: Ref<HTMLElement | null | undefined>,
  options: UseStickToBottomOptions = {}
): UseStickToBottomResult {
  const threshold = options.threshold ?? 80
  const observeMutations = options.observeMutations ?? false

  const stickToBottom = ref(true)

  let currentEl: HTMLElement | null = null
  let mutationObserver: MutationObserver | null = null
  let rafHandle: number | null = null
  // 我方最后一次观察/设置的 scrollTop；解除门控只认它「变小」=用户上滑的唯一特征，
  // 绝不看离底距离（那样内容增长会被误判成"离底"从而误解除，见文件头注释）。
  let lastKnownScrollTop = 0

  function isNearBottom(): boolean {
    const el = elRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  }

  function handleScroll() {
    const el = elRef.value
    if (!el) return
    const top = el.scrollTop
    if (top < lastKnownScrollTop - 1) {
      // scrollTop 变小=用户上滑；1px 容差防亚像素抖动误判
      stickToBottom.value = false
    } else if (top > lastKnownScrollTop + 1) {
      // 向下滚：按贴底阈值重新判定（用户滚回底部恢复跟随）
      stickToBottom.value = isNearBottom()
    }
    // 持平=回声不改门控：程序滚底/竞态检测已把该位置记进 lastKnownScrollTop，随后
    // 合并派发的 scroll 事件只是回声。若这里重判 isNearBottom，小幅上滑（<阈值）被
    // 竞态检测解除后会被回声重新挂回 true，用户又被逐 chunk 拽回底部。
    lastKnownScrollTop = top
  }

  function handleWheel(event: WheelEvent) {
    if (event.deltaY < 0) {
      // 向上滚：只解除、绝不挂上——挂上只走 handleScroll 的贴底判定
      stickToBottom.value = false
    }
  }

  function scrollToBottom(force = false) {
    const el = elRef.value
    if (!el) return
    if (force) {
      stickToBottom.value = true
    } else {
      // 同步竞态检测：scroll 事件异步、每帧合并派发，用户上滑后 chunk 可能在事件派发前
      // 同步到达——这里直接比较当前 scrollTop 与 lastKnownScrollTop，堵住同帧竞态。
      if (el.scrollTop < lastKnownScrollTop - 1) {
        stickToBottom.value = false
        lastKnownScrollTop = el.scrollTop
        return
      }
      if (!stickToBottom.value) return
    }
    el.scrollTop = el.scrollHeight
    lastKnownScrollTop = el.scrollTop
  }

  function scheduleFollow() {
    if (rafHandle !== null) return
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null
      // 帧内才判断 stick——调度时机不代表执行时机，期间用户可能已经上滑。
      if (stickToBottom.value) {
        scrollToBottom(false)
      }
    })
  }

  function teardown() {
    if (currentEl) {
      currentEl.removeEventListener('scroll', handleScroll)
      currentEl.removeEventListener('wheel', handleWheel)
    }
    if (mutationObserver) {
      mutationObserver.disconnect()
      mutationObserver = null
    }
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
    currentEl = null
  }

  function setup(el: HTMLElement | null) {
    teardown()
    currentEl = el
    if (!el) return
    lastKnownScrollTop = el.scrollTop
    el.addEventListener('scroll', handleScroll, { passive: true })
    el.addEventListener('wheel', handleWheel, { passive: true })
    if (observeMutations) {
      mutationObserver = new MutationObserver(scheduleFollow)
      mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })
    }
  }

  // 元素更换（如浮坞开合整窗重建 DOM）本身不改变 stick 状态，是否强滚由调用方决定。
  const stopWatch = watch(elRef, (el) => setup(el ?? null), { immediate: true })

  function dispose() {
    stopWatch()
    teardown()
  }

  // 模块级单例（如挂在 useAppState 共享层）没有组件作用域，getCurrentScope 判空后再挂，避免报错。
  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return { stickToBottom, isNearBottom, scrollToBottom, dispose }
}
