<template>
  <div ref="rootRef" class="click-spark">
    <canvas ref="canvasRef" class="click-spark__canvas" aria-hidden="true"></canvas>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type Spark = {
  x: number
  y: number
  angle: number
  length: number
  startTime: number
}

const props = withDefaults(defineProps<{
  sparkColor?: string
  sparkSize?: number
  sparkMinSize?: number
  sparkMaxSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
  easing?: 'linear' | 'ease-in' | 'ease-in-out' | 'ease-out' | string
  extraScale?: number
}>(), {
  sparkColor: '#60764f',
  sparkSize: 9,
  sparkMinSize: undefined,
  sparkMaxSize: undefined,
  sparkRadius: 16,
  sparkCount: 8,
  duration: 420,
  easing: 'ease-out',
  extraScale: 1
})

const rootRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const sparks: Spark[] = []

let ctx: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: number | null = null
let animationId: number | null = null

function ease(progress: number) {
  switch (props.easing) {
    case 'linear':
      return progress
    case 'ease-in':
      return progress * progress
    case 'ease-in-out':
      return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress
    default:
      return progress * (2 - progress)
  }
}

function getRandomSparkLength() {
  const fallbackSize = Math.max(0, Number(props.sparkSize) || 0)
  const rawMin = Number(props.sparkMinSize ?? fallbackSize)
  const rawMax = Number(props.sparkMaxSize ?? fallbackSize)
  const min = Math.max(0, Number.isFinite(rawMin) ? rawMin : fallbackSize)
  const max = Math.max(min, Number.isFinite(rawMax) ? rawMax : fallbackSize)

  if (max === min) return min
  return min + Math.random() * (max - min)
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  const width = window.innerWidth
  const height = window.innerHeight
  const ratio = window.devicePixelRatio || 1
  const nextWidth = Math.max(1, Math.round(width * ratio))
  const nextHeight = Math.max(1, Math.round(height * ratio))

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
}

function scheduleResize() {
  if (resizeTimer !== null) {
    window.clearTimeout(resizeTimer)
  }
  resizeTimer = window.setTimeout(resizeCanvas, 100)
}

function clearCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const ratio = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio)
}

function draw(timestamp: number) {
  if (!ctx) return

  clearCanvas()

  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index]
    const elapsed = timestamp - spark.startTime
    if (elapsed >= props.duration) {
      sparks.splice(index, 1)
      continue
    }

    const progress = elapsed / props.duration
    const eased = ease(progress)
    const distance = eased * props.sparkRadius * props.extraScale
    const lineLength = spark.length * (1 - eased)
    const x1 = spark.x + distance * Math.cos(spark.angle)
    const y1 = spark.y + distance * Math.sin(spark.angle)
    const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle)
    const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle)

    ctx.strokeStyle = props.sparkColor
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.globalAlpha = 1 - eased
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  ctx.globalAlpha = 1

  if (sparks.length > 0) {
    animationId = window.requestAnimationFrame(draw)
  } else {
    animationId = null
  }
}

function startAnimation() {
  if (animationId === null) {
    animationId = window.requestAnimationFrame(draw)
  }
}

function handlePointerDown(event: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) return

  // 点击火花只服务普通左键浏览。右键会用于原生菜单里的复制/粘贴，
  // 输入控件也需要把全部主线程时间留给选区、输入法和长正文粘贴。
  if (event.button !== 0) return
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return

  const x = event.clientX
  const y = event.clientY
  const now = performance.now()

  for (let index = 0; index < props.sparkCount; index += 1) {
    sparks.push({
      x,
      y,
      angle: (2 * Math.PI * index) / props.sparkCount,
      length: getRandomSparkLength(),
      startTime: now
    })
  }

  startAnimation()
}

onMounted(() => {
  const root = rootRef.value
  const canvas = canvasRef.value
  ctx = canvas?.getContext('2d') || null
  if (!root || !canvas || !ctx) return

  resizeObserver = new ResizeObserver(scheduleResize)
  resizeObserver.observe(root)
  resizeCanvas()
  window.addEventListener('resize', scheduleResize)
  window.addEventListener('pointerdown', handlePointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handlePointerDown, true)
  window.removeEventListener('resize', scheduleResize)
  resizeObserver?.disconnect()
  if (resizeTimer !== null) {
    window.clearTimeout(resizeTimer)
  }
  if (animationId !== null) {
    window.cancelAnimationFrame(animationId)
  }
})

watch(
  () => [props.sparkColor, props.sparkSize, props.sparkMinSize, props.sparkMaxSize, props.sparkRadius, props.sparkCount, props.duration, props.easing, props.extraScale],
  () => {
    clearCanvas()
  }
)
</script>

<style scoped>
.click-spark {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.click-spark__canvas {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}
</style>
