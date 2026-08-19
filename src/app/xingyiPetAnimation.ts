export type XingyiPetAtlasFrame = {
  sourceIndex: number
  x: number
  y: number
  width: number
  height: number
  durationMs: number
}

export type XingyiPetAnimation = {
  loop: boolean
  totalDurationMs: number
  frames: XingyiPetAtlasFrame[]
}

export type XingyiPetManifest = {
  version: 1
  atlas: {
    src: string
    width: number
    height: number
    format: 'webp'
  }
  fallbackSrc: string
  animations: Record<string, XingyiPetAnimation>
}

export const XINGYI_PET_MANIFEST_URL = '/xingyi-pet/runtime/manifest.json'

export function parseXingyiPetManifest(input: unknown): XingyiPetManifest | null {
  if (!isRecord(input) || input.version !== 1) return null
  if (!isRecord(input.atlas)) return null

  const atlas = input.atlas
  if (!isSafePetAssetPath(atlas.src) || atlas.format !== 'webp') return null
  if (!isPositiveInteger(atlas.width) || !isPositiveInteger(atlas.height)) return null
  if (!isSafePetAssetPath(input.fallbackSrc) || !isRecord(input.animations)) return null

  const animations: Record<string, XingyiPetAnimation> = {}
  for (const [name, candidate] of Object.entries(input.animations)) {
    if (!isRecord(candidate) || typeof candidate.loop !== 'boolean' || !Array.isArray(candidate.frames)) return null
    if (candidate.frames.length === 0) return null

    const frames: XingyiPetAtlasFrame[] = []
    for (const frame of candidate.frames) {
      if (!isRecord(frame)) return null
      const parsedFrame: XingyiPetAtlasFrame = {
        sourceIndex: Number(frame.sourceIndex),
        x: Number(frame.x),
        y: Number(frame.y),
        width: Number(frame.width),
        height: Number(frame.height),
        durationMs: Number(frame.durationMs),
      }
      if (!isNonNegativeInteger(parsedFrame.sourceIndex)) return null
      if (!isNonNegativeInteger(parsedFrame.x) || !isNonNegativeInteger(parsedFrame.y)) return null
      if (!isPositiveInteger(parsedFrame.width) || !isPositiveInteger(parsedFrame.height)) return null
      if (!isPositiveInteger(parsedFrame.durationMs)) return null
      if (parsedFrame.x + parsedFrame.width > atlas.width) return null
      if (parsedFrame.y + parsedFrame.height > atlas.height) return null
      frames.push(parsedFrame)
    }

    const totalDurationMs = frames.reduce((total, frame) => total + frame.durationMs, 0)
    if (candidate.totalDurationMs !== totalDurationMs) return null
    animations[name] = { loop: candidate.loop, totalDurationMs, frames }
  }

  // 只有 idle 是硬性要求（缺了整体判无效走静态回退）；hover 抬手/放手是锦上添花——
  // 缺失或 loop 标志不对时丢弃整对并降级为 idle-only（旧缓存 manifest / 未来 atlas 重生成
  // 写错标志时，不应连累完全可播的 idle 也退化成静态图）。抬手/放手必须成对：只留其一会在
  // pointerleave 时找不到退出动画而卡在抬手末帧。
  if (!animations.idle || !animations.idle.loop) return null
  const hoverEager = animations['hover-eager']
  const hoverExit = animations['hover-eager-exit']
  const hoverPairValid = Boolean(hoverEager && hoverExit && !hoverEager.loop && !hoverExit.loop)
  if (!hoverPairValid) {
    if (hoverEager || hoverExit) {
      console.warn('[xingyiPetAnimation] hover-eager/hover-eager-exit 缺失或 loop 标志不符，已降级为仅 idle 播放。')
    }
    delete animations['hover-eager']
    delete animations['hover-eager-exit']
  }
  return {
    version: 1,
    atlas: {
      src: atlas.src,
      width: atlas.width,
      height: atlas.height,
      format: 'webp',
    },
    fallbackSrc: input.fallbackSrc,
    animations,
  }
}

export function getNextPetFrameIndex(animation: XingyiPetAnimation, currentIndex: number): number {
  const nextIndex = currentIndex + 1
  if (nextIndex < animation.frames.length) return nextIndex
  return animation.loop ? 0 : animation.frames.length - 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafePetAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/xingyi-pet/') && !value.includes('..')
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
