// 像素中控台画布视口模型（纯函数，不依赖 Vue/DOM）：位图固定 1 像素/格，
// 外层容器用 CSS transform: translate(panX,panY) scale(zoom) 整体缩放平移；
// 这里只负责视口坐标数学，实际 DOM 事件绑定在 CanvasBoard.vue。

export interface ViewportState {
  /** 缩放倍数，1 = 100%（1 格 = 1 屏幕像素） */
  zoom: number
  /** 位图左上角相对视口容器左上角的偏移（CSS 像素，未缩放） */
  panX: number
  panY: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 32
/** 每次滚轮/按钮触发的缩放步进倍数：√2，两档约等于翻倍，缩放手感顺滑 */
export const ZOOM_STEP = Math.SQRT2

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * 屏幕坐标（相对视口容器左上角，CSS 像素）逆变换为格坐标：
 * 先减去平移量还原到"未缩放的位图局部坐标"，再除以缩放倍数、向下取整得到格索引。
 */
export function screenToCell(params: { screenX: number; screenY: number; zoom: number; panX: number; panY: number }): { x: number; y: number } {
  const zoom = params.zoom > 0 ? params.zoom : 1
  const docX = (params.screenX - params.panX) / zoom
  const docY = (params.screenY - params.panY) / zoom
  return { x: Math.floor(docX), y: Math.floor(docY) }
}

/**
 * 格坐标矩形 -> 屏幕像素矩形（screenToCell 的正向逆运算）：网格覆盖层、选区蚂蚁线等屏幕空间 div
 * 都需要这套换算，此前各自手写一份，这里收敛成唯一正向纯函数。
 */
export function docRectToScreen(rect: { x: number; y: number; w: number; h: number }, state: { zoom: number; panX: number; panY: number }): { left: number; top: number; width: number; height: number } {
  return {
    left: state.panX + rect.x * state.zoom,
    top: state.panY + rect.y * state.zoom,
    width: rect.w * state.zoom,
    height: rect.h * state.zoom
  }
}

/** 保持 (pointerX, pointerY) 处对应的画布内容点不变，把当前视口缩放到 targetZoom */
export function zoomToward(state: ViewportState, targetZoom: number, pointerX: number, pointerY: number): ViewportState {
  const nextZoom = clampZoom(targetZoom)
  const zoom = state.zoom > 0 ? state.zoom : 1
  const docX = (pointerX - state.panX) / zoom
  const docY = (pointerY - state.panY) / zoom
  return { zoom: nextZoom, panX: pointerX - docX * nextZoom, panY: pointerY - docY * nextZoom }
}

/** 滚轮缩放：deltaY<0 为放大，按 ZOOM_STEP 步进，锚点为指针位置 */
export function zoomAtPointer(params: { zoom: number; panX: number; panY: number; pointerX: number; pointerY: number; deltaY: number }): ViewportState {
  const dir = params.deltaY < 0 ? 1 : -1
  const targetZoom = dir > 0 ? params.zoom * ZOOM_STEP : params.zoom / ZOOM_STEP
  return zoomToward({ zoom: params.zoom, panX: params.panX, panY: params.panY }, targetZoom, params.pointerX, params.pointerY)
}

/** 适应窗口：按视口可用尺寸（已扣padding）算出让整张位图完整可见并居中的缩放与平移 */
export function fitToViewport(params: { docWidth: number; docHeight: number; viewportWidth: number; viewportHeight: number; padding?: number }): ViewportState {
  const padding = params.padding ?? 24
  const availW = Math.max(1, params.viewportWidth - padding * 2)
  const availH = Math.max(1, params.viewportHeight - padding * 2)
  const docW = Math.max(1, params.docWidth)
  const docH = Math.max(1, params.docHeight)
  const zoom = clampZoom(Math.min(availW / docW, availH / docH))
  const panX = (params.viewportWidth - docW * zoom) / 2
  const panY = (params.viewportHeight - docH * zoom) / 2
  return { zoom, panX, panY }
}

export function panBy(state: ViewportState, dx: number, dy: number): ViewportState {
  return { zoom: state.zoom, panX: state.panX + dx, panY: state.panY + dy }
}

/** 缩放百分比展示文案，如 1 -> '100%'，0.5 -> '50%' */
export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

/**
 * 位图整体在"屏幕空间设备像素"里的矩形：四角各自独立 round(...*dpr)，不做等宽假设。
 * 这是根治位图色块与网格线错位 bug 的关键收敛点——CanvasBoard 的 drawGrid()（网格线裁剪范围）
 * 与 blitLayer()（离屏真值 canvas -> 屏幕 canvas 的 drawImage 目标矩形）必须共用同一份算式，
 * 否则两边各自独立取整，在某些 devicePixelRatio 下会产生肉眼可见的相对偏移。
 */
export function docRectToDevicePixels(params: { docWidth: number; docHeight: number; zoom: number; panX: number; panY: number; dpr: number }): {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
} {
  const { docWidth, docHeight, zoom, panX, panY, dpr } = params
  const left = Math.round(panX * dpr)
  const top = Math.round(panY * dpr)
  const right = Math.round((panX + docWidth * zoom) * dpr)
  const bottom = Math.round((panY + docHeight * zoom) * dpr)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}
