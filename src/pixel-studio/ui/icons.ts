// 像素中控台图标：Lucide (ISC 许可，https://lucide.dev) 内联拷贝，仅收录本页用到的图标 path 数据，
// 24×24 viewBox、线性描边风格。不新增 npm 依赖，路径数据集中于此，ToolRail/MenuBar 等组件只引用不重复散落。
//
// ISC License
//
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
// All other copyright (c) for Lucide are held by Lucide Contributors 2022.
//
// Permission to use, copy, modify, and/or distribute this software for any purpose with or without
// fee is hereby granted, provided that the above copyright notice and this permission notice appear
// in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
// SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
// AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
// NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
// OF THIS SOFTWARE.

export interface PixelIconElement {
  /** SVG 子标签名 */
  tag: 'path' | 'rect' | 'circle'
  /** 传给该标签的属性（d / cx,cy,r / x,y,width,height,rx 等），描边色统一由外层 svg 的 stroke="currentColor" 提供 */
  attrs: Record<string, string | number>
}

export type PixelIconName = 'mouse-pointer-2' | 'lasso-select' | 'search' | 'pencil' | 'eraser' | 'paint-bucket' | 'minus' | 'square' | 'circle' | 'square-dashed' | 'pipette' | 'wand-sparkles' | 'undo-2' | 'redo-2' | 'plus' | 'trash-2' | 'eye' | 'eye-off' | 'play' | 'pause' | 'copy' | 'skip-back' | 'skip-forward' | 'chevron-up' | 'chevron-down' | 'maximize-2' | 'minimize-2' | 'selection-clear' | 'selection-invert' | 'selection-delete-outside'

export const PIXEL_ICONS: Record<PixelIconName, PixelIconElement[]> = {
  'mouse-pointer-2': [
    { tag: 'path', attrs: { d: 'M4.037 2.576a.5.5 0 0 1 .729-.58l15.09 8.727a.5.5 0 0 1-.104.91l-6.72 1.76a1 1 0 0 0-.713.713l-1.76 6.72a.5.5 0 0 1-.91.104z' } }
  ],
  'lasso-select': [
    { tag: 'path', attrs: { d: 'M7 22a5 5 0 0 1-2-9.584' } },
    { tag: 'path', attrs: { d: 'M5.088 14.896A7 7 0 1 1 16 12' } },
    { tag: 'circle', attrs: { cx: 17, cy: 19, r: 3 } }
  ],
  search: [
    { tag: 'circle', attrs: { cx: 11, cy: 11, r: 8 } },
    { tag: 'path', attrs: { d: 'm21 21-4.3-4.3' } }
  ],
  pencil: [
    { tag: 'path', attrs: { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' } },
    { tag: 'path', attrs: { d: 'm15 5 4 4' } }
  ],
  eraser: [
    { tag: 'path', attrs: { d: 'M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21' } },
    { tag: 'path', attrs: { d: 'm5.082 11.09 8.828 8.828' } }
  ],
  'paint-bucket': [
    { tag: 'path', attrs: { d: 'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0z' } },
    { tag: 'path', attrs: { d: 'm5 2 5 5' } },
    { tag: 'path', attrs: { d: 'M2 13h15' } },
    { tag: 'path', attrs: { d: 'M22 17a3 3 0 0 1-6 0c0-1.5 3-4 3-4s3 2.5 3 4' } }
  ],
  minus: [{ tag: 'path', attrs: { d: 'M5 12h14' } }],
  square: [{ tag: 'rect', attrs: { width: 18, height: 18, x: 3, y: 3, rx: 2 } }],
  circle: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } }],
  'square-dashed': [
    { tag: 'path', attrs: { d: 'M5 3a2 2 0 0 0-2 2' } },
    { tag: 'path', attrs: { d: 'M19 3a2 2 0 0 1 2 2' } },
    { tag: 'path', attrs: { d: 'M21 19a2 2 0 0 1-2 2' } },
    { tag: 'path', attrs: { d: 'M5 21a2 2 0 0 1-2-2' } },
    { tag: 'path', attrs: { d: 'M9 3h1' } },
    { tag: 'path', attrs: { d: 'M9 21h1' } },
    { tag: 'path', attrs: { d: 'M14 3h1' } },
    { tag: 'path', attrs: { d: 'M14 21h1' } },
    { tag: 'path', attrs: { d: 'M3 9v1' } },
    { tag: 'path', attrs: { d: 'M21 9v1' } },
    { tag: 'path', attrs: { d: 'M3 14v1' } },
    { tag: 'path', attrs: { d: 'M21 14v1' } }
  ],
  pipette: [
    { tag: 'path', attrs: { d: 'm12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12' } },
    { tag: 'path', attrs: { d: 'm18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z' } },
    { tag: 'path', attrs: { d: 'm2 22 .414-.414' } }
  ],
  'wand-sparkles': [
    { tag: 'path', attrs: { d: 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72' } },
    { tag: 'path', attrs: { d: 'm14 7 3 3' } },
    { tag: 'path', attrs: { d: 'M5 6v4M3 8h4M19 14v4M17 16h4M10 2v2M9 3h2' } }
  ],
  'undo-2': [
    { tag: 'path', attrs: { d: 'M9 14 4 9l5-5' } },
    { tag: 'path', attrs: { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' } }
  ],
  'redo-2': [
    { tag: 'path', attrs: { d: 'm15 14 5-5-5-5' } },
    { tag: 'path', attrs: { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' } }
  ],
  plus: [{ tag: 'path', attrs: { d: 'M5 12h14M12 5v14' } }],
  'selection-clear': [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2, 'stroke-dasharray': '3 3' } },
    { tag: 'path', attrs: { d: 'm8 8 8 8M16 8l-8 8' } }
  ],
  'selection-invert': [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2, 'stroke-dasharray': '3 3' } },
    { tag: 'path', attrs: { d: 'M7 8h10M14 5l3 3-3 3' } },
    { tag: 'path', attrs: { d: 'M17 16H7M10 13l-3 3 3 3' } }
  ],
  'selection-delete-outside': [
    { tag: 'rect', attrs: { x: 3, y: 3, width: 12, height: 12, rx: 1, 'stroke-dasharray': '2 2' } },
    { tag: 'path', attrs: { d: 'M13 15h9M20.5 15l-.7 7h-5.6l-.7-7M16 15v-2h3v2M16.5 18v2M18.5 18v2' } }
  ],
  'maximize-2': [
    { tag: 'path', attrs: { d: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7' } }
  ],
  'minimize-2': [
    { tag: 'path', attrs: { d: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' } }
  ],
  play: [{ tag: 'path', attrs: { d: 'm5 3 14 9-14 9V3z' } }],
  pause: [
    { tag: 'rect', attrs: { width: '4', height: '16', x: '6', y: '4' } },
    { tag: 'rect', attrs: { width: '4', height: '16', x: '14', y: '4' } }
  ],
  copy: [
    { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
    { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } }
  ],
  'skip-back': [
    { tag: 'path', attrs: { d: 'M19 20 9 12l10-8v16z' } },
    { tag: 'path', attrs: { d: 'M5 19V5' } }
  ],
  'skip-forward': [
    { tag: 'path', attrs: { d: 'm5 4 10 8-10 8V4z' } },
    { tag: 'path', attrs: { d: 'M19 5v14' } }
  ],
  'chevron-up': [{ tag: 'path', attrs: { d: 'm18 15-6-6-6 6' } }],
  'chevron-down': [{ tag: 'path', attrs: { d: 'm6 9 6 6 6-6' } }],
  'trash-2': [
    { tag: 'path', attrs: { d: 'M3 6h18' } },
    { tag: 'path', attrs: { d: 'M19 6l-1 14H6L5 6' } },
    { tag: 'path', attrs: { d: 'M10 11v6M14 11v6M9 6V4h6v2' } }
  ],
  eye: [
    { tag: 'path', attrs: { d: 'M2.062 12.348a1 1 0 0 1 0-.696C3.873 7.318 7.209 5 12 5c4.791 0 8.127 2.318 9.938 6.652a1 1 0 0 1 0 .696C20.127 16.682 16.791 19 12 19c-4.791 0-8.127-2.318-9.938-6.652' } },
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } }
  ],
  'eye-off': [
    { tag: 'path', attrs: { d: 'm2 2 20 20' } },
    { tag: 'path', attrs: { d: 'M10.6 10.6a2 2 0 0 0 2.8 2.8' } },
    { tag: 'path', attrs: { d: 'M9.88 5.09A9.8 9.8 0 0 1 12 5c4.79 0 8.13 2.32 9.94 6.65a1 1 0 0 1 0 .7 11.1 11.1 0 0 1-2.05 3.15' } },
    { tag: 'path', attrs: { d: 'M6.61 6.61a11 11 0 0 0-4.55 5.04 1 1 0 0 0 0 .7C3.87 16.68 7.21 19 12 19a9.8 9.8 0 0 0 2.12-.23' } }
  ]
}
