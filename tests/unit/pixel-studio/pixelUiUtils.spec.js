/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  clampNewDocSize,
  computeExportPixelSize,
  computeImportTargetSize,
  createSeededDocument,
  filenameToDocName,
  firstPaletteCode,
  hexToHsv,
  hsvToHex,
  isEditableTarget,
  isValidHexColor,
  NEW_DOC_SEED_COLORS
} from '../../../src/pixel-studio/ui/pixelUiUtils'

describe('pixelUiUtils', () => {
  it('clampNewDocSize 钳制到 8~512 整数', () => {
    expect(clampNewDocSize(4)).toBe(8)
    expect(clampNewDocSize(600)).toBe(512)
    expect(clampNewDocSize(63.6)).toBe(64)
  })

  it('computeExportPixelSize 按放大倍数换算像素尺寸', () => {
    expect(computeExportPixelSize(64, 32, 4)).toEqual({ width: 256, height: 128 })
    expect(computeExportPixelSize(10, 10, 1)).toEqual({ width: 10, height: 10 })
  })

  it('computeImportTargetSize 按长边预设保持宽高比', () => {
    // 横图：宽是长边
    expect(computeImportTargetSize(200, 100, 64)).toEqual({ width: 64, height: 32 })
    // 竖图：高是长边
    expect(computeImportTargetSize(100, 200, 64)).toEqual({ width: 32, height: 64 })
    // 正方形
    expect(computeImportTargetSize(100, 100, 48)).toEqual({ width: 48, height: 48 })
  })

  it('computeImportTargetSize 结果钳制到 1~512', () => {
    const result = computeImportTargetSize(2000, 1, 512)
    expect(result.width).toBe(512)
    expect(result.height).toBeGreaterThanOrEqual(1)
  })

  it('filenameToDocName 去掉扩展名', () => {
    expect(filenameToDocName('avatar.png')).toBe('avatar')
    expect(filenameToDocName('a.b.c.jpg')).toBe('a.b.c')
    expect(filenameToDocName('noext')).toBe('noext')
    expect(filenameToDocName('')).toBe('导入图片')
  })

  it('isValidHexColor 校验标准 6 位十六进制', () => {
    expect(isValidHexColor('#ff00aa')).toBe(true)
    expect(isValidHexColor('#FF00AA')).toBe(true)
    expect(isValidHexColor('ff00aa')).toBe(false)
    expect(isValidHexColor('#fff')).toBe(false)
  })

  it('isEditableTarget 识别输入/文本域/下拉/可编辑元素，其余元素与 null 均为 false', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
    const editableDiv = document.createElement('div')
    Object.defineProperty(editableDiv, 'isContentEditable', { value: true })
    expect(isEditableTarget(editableDiv)).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })

  // 根因修复：新建文档必须自带非空调色板，否则默认透明色作画不可见（2026-07-18 真机复现问题）
  it('createSeededDocument 生成的文档调色板非空，且按种子表顺序从 a1 起分配短码', () => {
    const doc = createSeededDocument({ name: '测试', width: 16, height: 16 })
    const palette = doc.frames[0].layers[0].palette
    const codes = Object.keys(palette)
    expect(codes.length).toBe(NEW_DOC_SEED_COLORS.length)
    expect(codes[0]).toBe('a1')
    expect(palette.a1.hex).toBe(NEW_DOC_SEED_COLORS[0].hex)
    expect(palette.a1.name).toBe(NEW_DOC_SEED_COLORS[0].name)
    // core createDocument 本身保持纯净：帧仍是全透明网格，种子色只进 palette 不落格子
    expect(doc.frames[0].layers[0].grid[0]).toBe('..'.repeat(16))
  })

  it('firstPaletteCode 返回插入顺序的第一个短码，空调色板返回 null', () => {
    const doc = createSeededDocument({ name: '测试', width: 8, height: 8 })
    expect(firstPaletteCode(doc.frames[0].layers[0].palette)).toBe('a1')
    expect(firstPaletteCode({})).toBeNull()
  })

  // PixelColorPicker 经典拾色器依赖的 HSV<->hex 纯函数换算
  describe('hexToHsv / hsvToHex', () => {
    it('纯色 hex 换算出预期色相/满饱和度/满明度', () => {
      expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
      const green = hexToHsv('#00ff00')
      expect(green.h).toBeCloseTo(120)
      expect(green.s).toBeCloseTo(1)
      expect(green.v).toBeCloseTo(1)
      const blue = hexToHsv('#0000ff')
      expect(blue.h).toBeCloseTo(240)
    })

    it('黑/白/灰无色相意义时饱和度或明度归零，不产生 NaN', () => {
      expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
      const white = hexToHsv('#ffffff')
      expect(white.s).toBe(0)
      expect(white.v).toBe(1)
    })

    it('hsvToHex 还原出与 hexToHsv 互逆的结果（往返一致）', () => {
      const samples = ['#e63946', '#f4d35e', '#3a86ff', '#43aa8b', '#8a2be2', '#123456']
      for (const hex of samples) {
        const hsv = hexToHsv(hex)
        expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex)
      }
    })

    it('hsvToHex 色相环绕（h=360 与 h=0 同色）', () => {
      expect(hsvToHex(360, 1, 1)).toBe(hsvToHex(0, 1, 1))
    })
  })
})
