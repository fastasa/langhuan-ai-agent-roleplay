<template>
  <Teleport to="body">
    <div
      v-if="petVisible"
      ref="petRef"
      class="xingyi-desktop-pet"
      :class="{ 'xingyi-desktop-pet--dragging': dragging }"
      :style="petStyle"
      role="group"
      tabindex="0"
      :aria-grabbed="dragging"
      aria-label="星依桌宠：拖动可移动；悬停可切换对话或关闭桌宠"
      @pointerenter="handlePointerEnter"
      @pointerleave="handlePointerLeave"
      @focusin="handleFocusIn"
      @focusout="handleFocusOut"
      @pointerdown="startInteraction"
      @contextmenu.prevent
    >
      <div
        v-if="spriteReady"
        class="xingyi-desktop-pet__sprite"
        :style="spriteStyle"
        aria-hidden="true"
      />
      <img
        v-else
        class="xingyi-desktop-pet__image"
        :src="fallbackSrc"
        alt="星依"
        draggable="false"
      />
      <div class="xingyi-desktop-pet__actions">
        <button
          type="button"
          class="xingyi-desktop-pet__agent-launcher"
          :aria-label="launcherAriaLabel"
          :title="launcherTitle"
          @pointerdown.stop
          @click.stop="handleLauncherClick"
        >
          <svg v-if="dockOpen" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            <path d="M5 3v4" />
            <path d="M3 5h4" />
          </svg>
        </button>
        <button
          v-if="closable"
          type="button"
          class="xingyi-desktop-pet__agent-launcher xingyi-desktop-pet__close"
          aria-label="关闭星依桌宠"
          title="关闭桌宠"
          @pointerdown.stop
          @click.stop="handleClosePetClick"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <XingyiPetStatusStar
        :status="globalStatus"
        :left="starAnchor.left"
        :top="starAnchor.top"
      />
    </div>
    <button
      v-else
      ref="standaloneLauncherRef"
      type="button"
      class="xingyi-desktop-pet__standalone-launcher"
      :class="{ 'xingyi-desktop-pet__standalone-launcher--dragging': standaloneLauncherDragging }"
      :style="standaloneLauncherStyle"
      :aria-label="launcherAriaLabel"
      :title="launcherTitle"
      :aria-grabbed="standaloneLauncherDragging"
      @pointerdown="startStandaloneLauncherInteraction"
      @click="handleStandaloneLauncherClick"
    >
      <svg v-if="dockOpen" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        <path d="M5 3v4" />
        <path d="M3 5h4" />
      </svg>
    </button>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import type { XingyiGlobalStatus } from '../../app/xingyiGlobalStatus'
import {
  XINGYI_PET_MANIFEST_URL,
  getNextPetFrameIndex,
  parseXingyiPetManifest,
  type XingyiPetAnimation,
  type XingyiPetManifest,
} from '../../app/xingyiPetAnimation'
import XingyiPetStatusStar from './XingyiPetStatusStar.vue'

type PetPosition = { left: number; top: number }
type PetStarAnchor = { left: string; top: string }
type PetAnimationName = 'idle' | 'hover-eager' | 'hover-eager-exit'

const props = withDefaults(
  defineProps<{
    /** false 时只保留独立对话入口，桌宠立绘与状态星不渲染。 */
    petVisible?: boolean
    /** 浮坞开合只读投影：只决定同一入口显示“打开”还是“关闭”语义。 */
    dockOpen?: boolean
    /** 是否显示关闭桌宠按钮。 */
    closable?: boolean
    /** 状态星真值：idle 不出星，其余四态由 XingyiPetStatusStar 换色。 */
    globalStatus: XingyiGlobalStatus
  }>(),
  { globalStatus: 'idle', petVisible: true, dockOpen: false, closable: false }
)

const emit = defineEmits<{
  /** 桌宠与独立入口共用同一开合动作，实际 open 真值仍由宿主持有。 */
  (e: 'toggle-dock'): void
  (e: 'close-pet'): void
}>()

const PET_WIDTH = 190
const PET_HEIGHT = 290
const PET_MARGIN = 12
const PET_DRAG_THRESHOLD = 4
const PET_POSITION_STORAGE_KEY = 'langhuan.xingyiPet.position'
const STANDALONE_LAUNCHER_SIZE = 38
const STANDALONE_LAUNCHER_POSITION_STORAGE_KEY = 'langhuan.xingyiPet.standaloneLauncherPosition'
const PET_FALLBACK_SRC = '/xingyi-pet/xingyi-pet-idle-v2.png'
const PET_SPRITE_SCALE = 1.24

/* 立绘可见轮廓在左侧留有透明带；三个历史锚点 (5%,16/42/68%) 都曾人工确认不压到头发、手臂或卫衣。
   运行曲线的安全范围直接复用这三点划出的矩形（横向围绕 5%、纵向覆盖 16%~68%），
   而不是另起一套没验证过的新范围，保证轨迹全程都在同一块已知安全带内。 */
const PET_STAR_ORBIT_BOUNDS = {
  leftCenter: 5,
  leftRadius: 3,
  topCenter: 42,
  topRadius: 26,
} as const

type PetStarOrbitSeed = {
  startTime: number
  basePeriodMs: number
  paceWobble: number
  pacePeriodMs: number
  pacePhase: number
  freqA: number
  freqB: number
  phaseA: number
  phaseB: number
}

const petRef = ref<HTMLElement | null>(null)
const standaloneLauncherRef = ref<HTMLElement | null>(null)
const position = ref<PetPosition | null>(null)
const standaloneLauncherPosition = ref<PetPosition | null>(null)
const dragging = ref(false)
const standaloneLauncherDragging = ref(false)
const starVisible = computed(() => props.globalStatus !== 'idle')
const animationManifest = ref<XingyiPetManifest | null>(null)
const currentAnimationName = ref<PetAnimationName>('idle')
const currentFrameIndex = ref(0)
const spriteReady = ref(false)
const pointerHovering = ref(false)
const focusWithin = ref(false)
/* 必须跟 sampleOrbit 在 elapsed=0（theta=0，因 pacePhase/phaseA/phaseB 都固定为 0）时算出的落点完全一致，
   否则「ref 默认值」与「startOrbit 同步写入的第一个真实值」之间只要有哪怕一帧的时间差被渲染出来，
   就会看到一次从默认值跳到真实起点的位移——即便这个偏移量不大也会被用户看出来。 */
const starAnchor = ref<PetStarAnchor>({
  left: `${PET_STAR_ORBIT_BOUNDS.leftCenter + PET_STAR_ORBIT_BOUNDS.leftRadius}%`,
  top: `${PET_STAR_ORBIT_BOUNDS.topCenter}%`,
})
let orbitSeed: PetStarOrbitSeed | null = null
let orbitFrameId: number | null = null
let animationTimer: number | null = null
let unmounted = false
let suppressStandaloneLauncherClick = false
let standaloneLauncherPositionCustomized = false
let standaloneLauncherClickResetTimer: number | null = null

const fallbackSrc = computed(() => animationManifest.value?.fallbackSrc ?? PET_FALLBACK_SRC)
const launcherAriaLabel = computed(() => props.dockOpen
  ? '关闭星依超级 Agent 浮坞'
  : '打开星依超级 Agent 浮坞')
const launcherTitle = computed(() => props.dockOpen
  ? '关闭星依超级 Agent'
  : '打开星依超级 Agent')
const spriteStyle = computed<CSSProperties>(() => {
  const manifest = animationManifest.value
  const animation = manifest?.animations[currentAnimationName.value]
  const frame = animation?.frames[currentFrameIndex.value]
  if (!manifest || !frame) return {}
  return {
    width: `${frame.width * PET_SPRITE_SCALE}px`,
    height: `${frame.height * PET_SPRITE_SCALE}px`,
    backgroundImage: `url("${manifest.atlas.src}")`,
    backgroundSize: `${manifest.atlas.width * PET_SPRITE_SCALE}px ${manifest.atlas.height * PET_SPRITE_SCALE}px`,
    backgroundPosition: `${-frame.x * PET_SPRITE_SCALE}px ${-frame.y * PET_SPRITE_SCALE}px`,
  }
})

const petStyle = computed<CSSProperties>(() => {
  if (!position.value) {
    return {
      right: `${PET_MARGIN + 12}px`,
      top: 'calc(38vh - 145px)',
    }
  }
  return {
    left: `${position.value.left}px`,
    top: `${position.value.top}px`,
  }
})

const standaloneLauncherStyle = computed<CSSProperties>(() => {
  if (!standaloneLauncherPosition.value) return { right: `${PET_MARGIN + 88}px`, top: 'calc(38vh - 19px)' }
  return {
    left: `${standaloneLauncherPosition.value.left}px`,
    top: `${standaloneLauncherPosition.value.top}px`,
  }
})

onMounted(() => {
  position.value = clampPosition(readStoredPosition() ?? createDefaultPosition())
  const storedStandaloneLauncherPosition = readStoredStandaloneLauncherPosition()
  standaloneLauncherPositionCustomized = Boolean(storedStandaloneLauncherPosition)
  standaloneLauncherPosition.value = clampStandaloneLauncherPosition(
    storedStandaloneLauncherPosition ?? createDefaultStandaloneLauncherPosition()
  )
  window.addEventListener('resize', keepPositionsInViewport)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  void loadPetAnimations()
  if (starVisible.value) startOrbit()
})

/* 星星的出现/收起只跟 idle 边界走：idle→非 idle 时在新锚点长出，非 idle→idle 时收起；
   同为非 idle 的状态切换（如 running→success）不重开轨道，保证换色前后同一个锚点。 */
watch(starVisible, (visible) => {
  if (visible) {
    startOrbit()
  } else {
    stopOrbit()
  }
})

/* 独立按钮尚未被单独拖过时，关闭桌宠应从人物当下胸口接棒；一旦用户摆过按钮，就只认按钮自己的位置。 */
watch(() => props.petVisible, (visible) => {
  if (!visible && !standaloneLauncherPositionCustomized) {
    standaloneLauncherPosition.value = createDefaultStandaloneLauncherPosition()
  }
})

onBeforeUnmount(() => {
  unmounted = true
  window.removeEventListener('resize', keepPositionsInViewport)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopPetAnimation()
  stopOrbit()
  if (standaloneLauncherClickResetTimer !== null) {
    window.clearTimeout(standaloneLauncherClickResetTimer)
    standaloneLauncherClickResetTimer = null
  }
})

async function loadPetAnimations() {
  try {
    const response = await fetch(XINGYI_PET_MANIFEST_URL)
    if (!response.ok) throw new Error(`manifest 请求失败：${response.status}`)
    const manifest = parseXingyiPetManifest(await response.json())
    if (!manifest) throw new Error('manifest 结构无效')
    await preloadImage(manifest.atlas.src)
    if (unmounted) return
    animationManifest.value = manifest
    spriteReady.value = true
    syncHoverAnimation()
  } catch (error) {
    console.warn('[XingyiDesktopPet] 桌宠动画 manifest/atlas 加载失败，已使用静态立绘回退。', error)
  }
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`atlas 加载失败：${src}`))
    image.src = src
  })
}

function scheduleNextAnimationFrame() {
  stopPetAnimation()
  const animation = animationManifest.value?.animations[currentAnimationName.value]
  const frame = animation?.frames[currentFrameIndex.value]
  if (!spriteReady.value || !animation || !frame || prefersReducedMotion() || document.hidden) return
  animationTimer = window.setTimeout(() => {
    advanceAnimation(animation)
  }, frame.durationMs)
}

function advanceAnimation(animation: XingyiPetAnimation) {
  const nextIndex = getNextPetFrameIndex(animation, currentFrameIndex.value)
  if (!animation.loop && nextIndex === currentFrameIndex.value) {
    if (currentAnimationName.value === 'hover-eager-exit') startAnimation('idle')
    return
  }
  currentFrameIndex.value = nextIndex
  scheduleNextAnimationFrame()
}

function startAnimation(name: PetAnimationName) {
  const animation = animationManifest.value?.animations[name]
  if (!spriteReady.value || !animation) return
  stopPetAnimation()
  currentAnimationName.value = name
  if (prefersReducedMotion()) {
    if (name === 'hover-eager') currentFrameIndex.value = animation.frames.length - 1
    else {
      currentAnimationName.value = 'idle'
      currentFrameIndex.value = 0
    }
    return
  }
  currentFrameIndex.value = 0
  scheduleNextAnimationFrame()
}

function syncHoverAnimation() {
  startAnimation(pointerHovering.value || focusWithin.value ? 'hover-eager' : 'idle')
}

function handlePointerEnter() {
  pointerHovering.value = true
  startAnimation('hover-eager')
}

function handlePointerLeave() {
  pointerHovering.value = false
  if (!focusWithin.value) startAnimation('hover-eager-exit')
}

function handleFocusIn() {
  if (focusWithin.value) return
  focusWithin.value = true
  startAnimation('hover-eager')
}

function handleFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && petRef.value?.contains(nextTarget)) return
  focusWithin.value = false
  if (!pointerHovering.value) startAnimation('hover-eager-exit')
}

function stopPetAnimation() {
  if (animationTimer === null) return
  window.clearTimeout(animationTimer)
  animationTimer = null
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopPetAnimation()
    return
  }
  scheduleNextAnimationFrame()
}

function startInteraction(event: PointerEvent) {
  if (event.button !== 0 || typeof window === 'undefined') return
  event.preventDefault()

  const target = petRef.value
  const startPosition = position.value ?? createDefaultPosition()
  const startX = event.clientX
  const startY = event.clientY
  let moved = false
  dragging.value = false
  target?.setPointerCapture?.(event.pointerId)

  const handleMove = (moveEvent: PointerEvent) => {
    const deltaX = moveEvent.clientX - startX
    const deltaY = moveEvent.clientY - startY
    if (!moved && Math.hypot(deltaX, deltaY) >= PET_DRAG_THRESHOLD) moved = true
    if (!moved) return
    dragging.value = true
    position.value = clampPosition({
      left: startPosition.left + deltaX,
      top: startPosition.top + deltaY,
    })
  }

  const finish = () => {
    target?.removeEventListener('pointermove', handleMove)
    target?.removeEventListener('pointerup', finish)
    target?.removeEventListener('pointercancel', cancel)
    if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    dragging.value = false
    if (moved && position.value) savePosition(position.value)
  }

  const cancel = () => {
    target?.removeEventListener('pointermove', handleMove)
    target?.removeEventListener('pointerup', finish)
    target?.removeEventListener('pointercancel', cancel)
    if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    dragging.value = false
    if (moved && position.value) savePosition(position.value)
  }

  target?.addEventListener('pointermove', handleMove)
  target?.addEventListener('pointerup', finish)
  target?.addEventListener('pointercancel', cancel)
}

/* 点击后立刻失焦：否则 CSS :focus-within 会让按钮在鼠标移出悬浮区后仍常驻显示，
   要等用户再点一下页面别处触发失焦才会消失。失焦后按钮的显隐只由 :hover 决定，
   跟着鼠标是否还在悬浮区走。 */
function handleLauncherClick(event: MouseEvent) {
  ;(event.currentTarget as HTMLElement | null)?.blur()
  emit('toggle-dock')
}

function startStandaloneLauncherInteraction(event: PointerEvent) {
  if (event.button !== 0 || typeof window === 'undefined') return
  event.preventDefault()

  const target = standaloneLauncherRef.value
  const startPosition = standaloneLauncherPosition.value ?? createDefaultStandaloneLauncherPosition()
  const startX = event.clientX
  const startY = event.clientY
  let moved = false
  standaloneLauncherDragging.value = false
  suppressStandaloneLauncherClick = false
  if (standaloneLauncherClickResetTimer !== null) {
    window.clearTimeout(standaloneLauncherClickResetTimer)
    standaloneLauncherClickResetTimer = null
  }
  target?.setPointerCapture?.(event.pointerId)

  const handleMove = (moveEvent: PointerEvent) => {
    const deltaX = moveEvent.clientX - startX
    const deltaY = moveEvent.clientY - startY
    if (!moved && Math.hypot(deltaX, deltaY) >= PET_DRAG_THRESHOLD) moved = true
    if (!moved) return
    standaloneLauncherDragging.value = true
    standaloneLauncherPosition.value = clampStandaloneLauncherPosition({
      left: startPosition.left + deltaX,
      top: startPosition.top + deltaY,
    })
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', cancel)
    if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    standaloneLauncherDragging.value = false
  }

  const finish = () => {
    cleanup()
    suppressStandaloneLauncherClick = moved
    if (moved) {
      standaloneLauncherClickResetTimer = window.setTimeout(() => {
        suppressStandaloneLauncherClick = false
        standaloneLauncherClickResetTimer = null
      }, 0)
    }
    if (moved && standaloneLauncherPosition.value) {
      standaloneLauncherPositionCustomized = true
      saveStandaloneLauncherPosition(standaloneLauncherPosition.value)
    }
  }

  const cancel = () => {
    cleanup()
    suppressStandaloneLauncherClick = false
    if (moved && standaloneLauncherPosition.value) {
      standaloneLauncherPositionCustomized = true
      saveStandaloneLauncherPosition(standaloneLauncherPosition.value)
    }
  }

  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', cancel)
}

function handleStandaloneLauncherClick(event: MouseEvent) {
  ;(event.currentTarget as HTMLElement | null)?.blur()
  if (suppressStandaloneLauncherClick) {
    suppressStandaloneLauncherClick = false
    if (standaloneLauncherClickResetTimer !== null) {
      window.clearTimeout(standaloneLauncherClickResetTimer)
      standaloneLauncherClickResetTimer = null
    }
    return
  }
  emit('toggle-dock')
}

function handleClosePetClick(event: MouseEvent) {
  ;(event.currentTarget as HTMLElement | null)?.blur()
  emit('close-pet')
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/* 用两组频率相近的正弦波叠加出圆润的不规则闭合曲线（类 Lissajous）：
   次谐波权重收窄到 0.2、频率比收窄到 1.15~1.5（旧版 0.38/1.6~2.4 太跳），转向更平滑、少抖动。
   两组权重 0.8+0.2=1，数学上保证轨迹绝不超出 PET_STAR_ORBIT_BOUNDS 划定的安全矩形——
   不需要另外做碰撞检测，"不撞角色/不离太远"直接由取值范围保证。
   角速度不是匀速：baseOmega*(1+paceWobble*cos(...)) 让速度围绕 baseOmega 周期性起伏，
   paceWobble<1 保证角速度恒为正、theta 单调递增，不会倒退或卡顿；
   basePeriodMs 与 paceWobble 联立选取，让全程最快的一瞬间才追平旧版"中等速度"，其余时间明显更慢。 */
/* pacePhase/phaseA/phaseB 固定为 0（不再随机）：这三个量都会在 elapsed=0 时直接贡献一个非零的
   起始偏移（pacePhase 影响起始 theta 本身，phaseA/phaseB 影响起始 x/y 相对主项的偏移），随机取值会让
   星星每次出现时的落点毫无规律地散布在整个安全范围内，像是"刚出现就跳到了完全不同的地方"。固定为 0
   后 elapsed=0 时 theta 恒为 0、起点恒为同一个点（每次出现位置一致），basePeriodMs/paceWobble/
   pacePeriodMs/freqA/freqB 仍然随机，出现之后的漂移节奏和曲线形状依旧各不相同，只是不再影响"刚出现
   在哪"这件事。 */
function createOrbitSeed(now: number): PetStarOrbitSeed {
  return {
    startTime: now,
    basePeriodMs: 29000 + Math.random() * 6000,
    paceWobble: 0.4 + Math.random() * 0.08,
    pacePeriodMs: 47000 + Math.random() * 15000,
    pacePhase: 0,
    freqA: 1.15 + Math.random() * 0.35,
    freqB: 1.15 + Math.random() * 0.35,
    phaseA: 0,
    phaseB: 0,
  }
}

function sampleOrbit(seed: PetStarOrbitSeed, now: number): PetStarAnchor {
  const elapsed = now - seed.startTime
  const baseOmega = (Math.PI * 2) / seed.basePeriodMs
  const paceOmega = (Math.PI * 2) / seed.pacePeriodMs
  const theta = baseOmega * elapsed
    + ((seed.paceWobble * baseOmega) / paceOmega) * Math.sin(paceOmega * elapsed + seed.pacePhase)
  const x = PET_STAR_ORBIT_BOUNDS.leftCenter
    + PET_STAR_ORBIT_BOUNDS.leftRadius * (0.8 * Math.cos(theta) + 0.2 * Math.cos(seed.freqA * theta + seed.phaseA))
  const y = PET_STAR_ORBIT_BOUNDS.topCenter
    + PET_STAR_ORBIT_BOUNDS.topRadius * (0.8 * Math.sin(theta) + 0.2 * Math.sin(seed.freqB * theta + seed.phaseB))
  return { left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` }
}

function stepOrbit(now: number) {
  if (!orbitSeed || !starVisible.value) return
  starAnchor.value = sampleOrbit(orbitSeed, now)
  orbitFrameId = window.requestAnimationFrame(stepOrbit)
}

function startOrbit() {
  stopOrbit()
  const now = performance.now()
  orbitSeed = createOrbitSeed(now)
  starAnchor.value = sampleOrbit(orbitSeed, now)
  if (prefersReducedMotion()) return
  orbitFrameId = window.requestAnimationFrame(stepOrbit)
}

function stopOrbit() {
  if (orbitFrameId !== null) {
    window.cancelAnimationFrame(orbitFrameId)
    orbitFrameId = null
  }
  orbitSeed = null
}

function createDefaultPosition(): PetPosition {
  return clampPosition({
    left: window.innerWidth - PET_WIDTH - PET_MARGIN - 12,
    top: window.innerHeight * 0.38 - PET_HEIGHT / 2,
  })
}

/** 首次关闭桌宠时独立按钮承接原胸口位置；一旦拖动后就读取自己的设备级位置。 */
function createDefaultStandaloneLauncherPosition(): PetPosition {
  const petPosition = position.value ?? createDefaultPosition()
  return clampStandaloneLauncherPosition({
    left: petPosition.left + PET_WIDTH / 2 - STANDALONE_LAUNCHER_SIZE / 2,
    top: petPosition.top + PET_HEIGHT * 0.415 - STANDALONE_LAUNCHER_SIZE / 2,
  })
}

function clampPosition(input: PetPosition): PetPosition {
  const maxLeft = Math.max(PET_MARGIN, window.innerWidth - PET_WIDTH - PET_MARGIN)
  const maxTop = Math.max(PET_MARGIN, window.innerHeight - PET_HEIGHT - PET_MARGIN)
  return {
    left: clamp(input.left, PET_MARGIN, maxLeft),
    top: clamp(input.top, PET_MARGIN, maxTop),
  }
}

function clampStandaloneLauncherPosition(input: PetPosition): PetPosition {
  const maxLeft = Math.max(PET_MARGIN, window.innerWidth - STANDALONE_LAUNCHER_SIZE - PET_MARGIN)
  const maxTop = Math.max(PET_MARGIN, window.innerHeight - STANDALONE_LAUNCHER_SIZE - PET_MARGIN)
  return {
    left: clamp(input.left, PET_MARGIN, maxLeft),
    top: clamp(input.top, PET_MARGIN, maxTop),
  }
}

function keepPositionsInViewport() {
  if (position.value) {
    position.value = clampPosition(position.value)
    savePosition(position.value)
  }
  if (standaloneLauncherPosition.value) {
    standaloneLauncherPosition.value = clampStandaloneLauncherPosition(standaloneLauncherPosition.value)
    saveStandaloneLauncherPosition(standaloneLauncherPosition.value)
  }
}

function readStoredPosition(): PetPosition | null {
  try {
    const raw = window.localStorage.getItem(PET_POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PetPosition>
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null
    return { left: Number(parsed.left), top: Number(parsed.top) }
  } catch {
    return null
  }
}

function savePosition(value: PetPosition) {
  try {
    window.localStorage.setItem(PET_POSITION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage 不可用时仅放弃位置记忆；桌宠本身仍可正常拖动。
  }
}

function readStoredStandaloneLauncherPosition(): PetPosition | null {
  try {
    const raw = window.localStorage.getItem(STANDALONE_LAUNCHER_POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PetPosition>
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null
    return { left: Number(parsed.left), top: Number(parsed.top) }
  } catch {
    return null
  }
}

function saveStandaloneLauncherPosition(value: PetPosition) {
  try {
    window.localStorage.setItem(STANDALONE_LAUNCHER_POSITION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage 不可用时仅放弃位置记忆；独立按钮本次页面内仍可拖动。
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
</script>

<style scoped>
.xingyi-desktop-pet {
  position: fixed;
  z-index: 12890;
  width: 190px;
  height: 290px;
  overflow: visible;
  touch-action: none;
  cursor: grab;
  outline: none;
}

.xingyi-desktop-pet:focus-visible::after {
  position: absolute;
  inset: 18px 38px 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-accent, #5c8a5c) 70%, transparent);
  border-radius: 10px;
  content: '';
  pointer-events: none;
}

.xingyi-desktop-pet--dragging {
  cursor: grabbing;
}

.xingyi-desktop-pet__image {
  display: block;
  width: 190px;
  height: 290px;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
  user-select: none;
  /* 用户反馈立绘整体偏暗沉，用轻量滤镜提亮，不重新出图；静态回退图和动画精灵图各自套一份保持一致。 */
}

.xingyi-desktop-pet__sprite {
  position: absolute;
  bottom: 12px;
  left: 50%;
  background-repeat: no-repeat;
  image-rendering: pixelated;
  pointer-events: none;
  transform: translateX(-50%);
  user-select: none;
}

.xingyi-desktop-pet__actions {
  position: absolute;
  z-index: 4;
  top: 41.5%;
  left: 50%;
  display: flex;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.86);
  transition: opacity 0.16s ease, transform var(--lh-dur-slow, 0.3s) var(--lh-ease-bloom, cubic-bezier(0.34, 1.26, 0.44, 1));
}

.xingyi-desktop-pet__agent-launcher,
.xingyi-desktop-pet__standalone-launcher {
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  place-items: center;
  color: #fffdf8;
  background: #7f7f4d;
  border: 1px solid color-mix(in srgb, #fffdf8 58%, #7f7f4d);
  border-radius: 50%;
  box-shadow: 0 5px 14px rgba(54, 59, 37, 0.24);
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.xingyi-desktop-pet:hover .xingyi-desktop-pet__actions,
.xingyi-desktop-pet:focus-within .xingyi-desktop-pet__actions {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}

.xingyi-desktop-pet__agent-launcher:hover,
.xingyi-desktop-pet__standalone-launcher:hover {
  background: color-mix(in srgb, #7f7f4d 86%, #f5eedc 14%);
  box-shadow: 0 7px 18px rgba(54, 59, 37, 0.3);
}

.xingyi-desktop-pet__agent-launcher:active,
.xingyi-desktop-pet__standalone-launcher:active {
  transform: scale(0.95);
}

.xingyi-desktop-pet__agent-launcher:focus-visible,
.xingyi-desktop-pet__standalone-launcher:focus-visible {
  outline: 2px solid color-mix(in srgb, #7f7f4d 70%, #fffdf8);
  outline-offset: 3px;
}

.xingyi-desktop-pet__agent-launcher svg,
.xingyi-desktop-pet__standalone-launcher svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.xingyi-desktop-pet__standalone-launcher {
  position: fixed;
  z-index: 12890;
  touch-action: none;
  cursor: grab;
}

.xingyi-desktop-pet__standalone-launcher--dragging {
  cursor: grabbing;
}

/* 触屏设备没有 hover，启动按钮必须常显。 */
@media (hover: none) {
  .xingyi-desktop-pet__actions {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, -50%) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .xingyi-desktop-pet,
  .xingyi-desktop-pet__actions,
  .xingyi-desktop-pet__agent-launcher,
  .xingyi-desktop-pet__standalone-launcher {
    transition: none;
  }
}
</style>
