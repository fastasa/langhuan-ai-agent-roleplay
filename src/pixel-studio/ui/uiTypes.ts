// 像素中控台 UI 层专用类型（不进入核心引擎 core/，只服务于页面交互）

export type PixelToolKind = 'select' | 'marquee' | 'lasso' | 'brush' | 'eraser' | 'bucket' | 'line' | 'rect' | 'ellipse' | 'eyedropper' | 'zoom'

/** 主画布唯一视口投影；缩略图只消费它，不另存第二套主画布坐标。 */
export interface PixelViewportState {
  zoom: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
}

export interface SelectionRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 选区只属于编辑视图，不写入像素文档；cells 存一维格索引 y * width + x。 */
export interface SelectionMask {
  width: number
  height: number
  cells: Set<number>
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** 像素剪贴板只属于当前页面运行态；坐标相对复制时选区包围盒，不写入文档。 */
export interface PixelClipboard {
  originX: number
  originY: number
  width: number
  height: number
  cells: Array<{ x: number; y: number; code: string }>
}

export type SelectionCombineMode = 'replace' | 'add' | 'subtract'
