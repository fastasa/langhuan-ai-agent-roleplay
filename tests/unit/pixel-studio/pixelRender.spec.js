import { describe, expect, it, vi } from 'vitest'
import { drawGridToCanvas } from '../../../src/pixel-studio/ui/pixelRender'

function makeMockCtx() {
  return {
    fillStyle: '',
    fillRect: vi.fn()
  }
}

describe('drawGridToCanvas', () => {
  it('逐格 fillRect，透明格跳过', () => {
    const ctx = makeMockCtx()
    const source = {
      width: 2,
      height: 1,
      grid: ['01..'], // (0,0)=颜色01 (1,0)=透明
      palette: { '01': { hex: '#ff0000' } }
    }
    drawGridToCanvas(ctx, source, 1)

    expect(ctx.fillRect).toHaveBeenCalledTimes(1)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1, 1)
  })

  it('按 cellSize 放大坐标（导出 PNG 场景）', () => {
    const ctx = makeMockCtx()
    const source = {
      width: 2,
      height: 1,
      grid: ['0101'],
      palette: { '01': { hex: '#00ff00' } }
    }
    drawGridToCanvas(ctx, source, 4)

    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 4, 4)
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 4, 0, 4, 4)
  })

  it('palette 中查不到 hex 的短码跳过不画', () => {
    const ctx = makeMockCtx()
    const source = {
      width: 1,
      height: 1,
      grid: ['99'],
      palette: {}
    }
    drawGridToCanvas(ctx, source, 1)

    expect(ctx.fillRect).not.toHaveBeenCalled()
  })
})
