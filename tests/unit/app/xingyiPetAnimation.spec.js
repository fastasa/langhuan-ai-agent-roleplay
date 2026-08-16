import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getNextPetFrameIndex, parseXingyiPetManifest } from '../../../src/app/xingyiPetAnimation'

const manifestPath = resolve(process.cwd(), 'public/xingyi-pet/runtime/manifest.json')
const mascotPath = resolve(process.cwd(), 'public/xingyi-pet/runtime/mascot.svg')

describe('星依桌宠本地开源素材', () => {
  it('使用仓库内自带的 SVG 单帧待机素材', () => {
    const manifest = parseXingyiPetManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
    expect(manifest).not.toBeNull()
    expect(manifest.atlas).toMatchObject({
      src: '/xingyi-pet/runtime/mascot.svg',
      width: 192,
      height: 208,
      format: 'svg'
    })
    expect(manifest.fallbackSrc).toBe('/xingyi-pet/runtime/mascot.svg')
    expect(manifest.animations.idle.frames).toHaveLength(1)
    expect(getNextPetFrameIndex(manifest.animations.idle, 0)).toBe(0)
    expect(readFileSync(mascotPath, 'utf8')).toContain('<svg')
  })

  it('拒绝越界帧或缺少 idle 的清单', () => {
    const invalid = JSON.parse(readFileSync(manifestPath, 'utf8'))
    invalid.animations.idle.frames[0].x = invalid.atlas.width
    expect(parseXingyiPetManifest(invalid)).toBeNull()

    const noIdle = JSON.parse(readFileSync(manifestPath, 'utf8'))
    delete noIdle.animations.idle
    expect(parseXingyiPetManifest(noIdle)).toBeNull()
  })
})
