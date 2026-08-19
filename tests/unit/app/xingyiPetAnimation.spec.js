import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getNextPetFrameIndex,
  parseXingyiPetManifest,
} from '../../../src/app/xingyiPetAnimation'

const manifestPath = resolve(process.cwd(), 'public/xingyi-pet/runtime/manifest.json')
const componentPath = resolve(process.cwd(), 'src/components/app/XingyiDesktopPet.vue')

describe('星依桌宠多动作播放器', () => {
  it('以待机、抬手与放手源帧和逐帧时长作为运行时真值', () => {
    const manifest = parseXingyiPetManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))

    expect(manifest).not.toBeNull()
    expect(manifest.atlas).toMatchObject({
      src: '/xingyi-pet/runtime/spritesheet.webp',
      width: 1536,
      height: 624,
      format: 'webp',
    })
    expect(manifest.fallbackSrc).toBe('/xingyi-pet/xingyi-pet-idle-v2.png')
    expect(manifest.animations.idle.frames.map(frame => frame.sourceIndex)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(manifest.animations.idle.frames.map(frame => frame.durationMs)).toEqual([400, 200, 160, 80, 100, 160, 500])
    expect(manifest.animations.idle.totalDurationMs).toBe(1600)
    expect(manifest.animations['hover-eager'].loop).toBe(false)
    expect(manifest.animations['hover-eager'].frames.map(frame => frame.sourceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(manifest.animations['hover-eager'].frames.map(frame => frame.durationMs)).toEqual([200, 100, 200, 200, 200, 200, 200, 200])
    expect(manifest.animations['hover-eager'].totalDurationMs).toBe(1500)
    expect(manifest.animations['hover-eager-exit'].loop).toBe(false)
    expect(manifest.animations['hover-eager-exit'].frames.map(frame => frame.sourceIndex)).toEqual([0, 1])
    expect(manifest.animations['hover-eager-exit'].frames.map(frame => frame.durationMs)).toEqual([160, 140])
    expect(manifest.animations['hover-eager-exit'].totalDurationMs).toBe(300)
  })

  it('循环到末帧后回到第一帧，且拒绝越界 atlas 数据', () => {
    const manifest = parseXingyiPetManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
    expect(getNextPetFrameIndex(manifest.animations.idle, 6)).toBe(0)

    const invalid = JSON.parse(readFileSync(manifestPath, 'utf8'))
    invalid.animations.idle.frames[6].x = invalid.atlas.width
    expect(parseXingyiPetManifest(invalid)).toBeNull()
  })

  it('hover 动画缺失或 loop 标志不符时降级为仅 idle，而不是整体判无效', () => {
    const idleOnly = JSON.parse(readFileSync(manifestPath, 'utf8'))
    delete idleOnly.animations['hover-eager']
    delete idleOnly.animations['hover-eager-exit']
    const parsed = parseXingyiPetManifest(idleOnly)
    expect(parsed).not.toBeNull()
    expect(parsed.animations.idle.loop).toBe(true)
    expect(parsed.animations['hover-eager']).toBeUndefined()

    const badLoop = JSON.parse(readFileSync(manifestPath, 'utf8'))
    badLoop.animations['hover-eager'].loop = true
    const degraded = parseXingyiPetManifest(badLoop)
    expect(degraded).not.toBeNull()
    expect(degraded.animations['hover-eager']).toBeUndefined()
    expect(degraded.animations['hover-eager-exit']).toBeUndefined()

    const noIdle = JSON.parse(readFileSync(manifestPath, 'utf8'))
    delete noIdle.animations.idle
    expect(parseXingyiPetManifest(noIdle)).toBeNull()
  })

  it('manifest 或 atlas 加载失败时保留 v2 静态立绘回退', () => {
    const source = readFileSync(componentPath, 'utf8')
    expect(source).toContain("const PET_FALLBACK_SRC = '/xingyi-pet/xingyi-pet-idle-v2.png'")
    expect(source).toContain('parseXingyiPetManifest')
    expect(source).toContain('preloadImage(manifest.atlas.src)')
    expect(source).toContain('桌宠动画 manifest/atlas 加载失败，已使用静态立绘回退')
    expect(source).toContain('scheduleNextAnimationFrame()')
    expect(source).toContain("startAnimation('hover-eager')")
    expect(source).toContain("startAnimation('hover-eager-exit')")
    expect(source).toContain('prefersReducedMotion()')
  })
})
