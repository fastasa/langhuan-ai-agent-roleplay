import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiStarIcon.vue'), 'utf8')
const petStatusSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiPetStatusStar.vue'), 'utf8')
const desktopPetSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDesktopPet.vue'), 'utf8')
const dockSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
const emptyStateSource = readFileSync(resolve(process.cwd(), 'src/components/app/AgentConversationEmptyState.vue'), 'utf8')
const windowSource = readFileSync(resolve(process.cwd(), 'src/components/common/FloatingWorkspaceWindow.vue'), 'utf8')
const globalStyles = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

describe('XingyiStarIcon · 像素状态星最小图形', () => {
  it('绘制一个五角星体和三根等粗、长短不一的像素光线', () => {
    expect(source).toContain('shape-rendering="crispEdges"')
    expect(source).toContain('points="20,9 23,16 31,17 25,23 27,31 20,27 13,31 15,23 9,17 17,16"')
    expect(source).toContain('xingyi-star-icon__ray--short')
    expect(source).toContain('xingyi-star-icon__ray--medium')
    expect(source).toContain('xingyi-star-icon__ray--long')
    expect(source).toContain('stroke-width: 2;')
  })

  it('不在图形层另设颜色或状态，继续交给现役 xy-star 状态类', () => {
    expect(source).toContain('xy-star--{status}')
    expect(source).not.toContain('animation:')
  })

  it('独立桌宠复用该图形，自行拖动并在人物外侧触发完整出场与退场动画', () => {
    expect(petStatusSource).toContain('<Transition name="xingyi-pet-status-star" mode="out-in"')
    expect(petStatusSource).toContain('class="xingyi-pet-status-star"')
    expect(petStatusSource).toContain(':class="`xy-star--${status}`"')
    expect(petStatusSource).toContain('class="xingyi-pet-status-star__icon"')
    expect(petStatusSource).toContain('class="xingyi-pet-status-star__ray"')
    expect(petStatusSource).toContain('x2="29"')
    expect(petStatusSource).toContain('y2="2"')
    expect((petStatusSource.match(/id: 'ray-\d'/g) || [])).toHaveLength(8)
    expect(desktopPetSource).toContain("const PET_POSITION_STORAGE_KEY = 'langhuan.xingyiPet.position'")
    expect(desktopPetSource).toContain('const PET_DRAG_THRESHOLD = 4')
    expect(desktopPetSource).toContain('target?.setPointerCapture?.(event.pointerId)')
    expect(desktopPetSource).toContain('const PET_STAR_ORBIT_BOUNDS')
    expect(desktopPetSource).toContain('function createOrbitSeed(')
    expect(desktopPetSource).toContain('function sampleOrbit(')
    expect(desktopPetSource).toContain('function stopOrbit(')
    expect(desktopPetSource).toContain("window.requestAnimationFrame(stepOrbit)")
    expect(desktopPetSource).toContain("prefersReducedMotion()")
    expect(desktopPetSource).toContain('XINGYI_PET_MANIFEST_URL')
    expect(desktopPetSource).toContain(':style="spriteStyle"')
    expect(desktopPetSource).toContain("const PET_FALLBACK_SRC = '/xingyi-pet/runtime/mascot.svg'")
    expect(desktopPetSource).toContain('dockOpen?: boolean')
    expect(desktopPetSource).toContain("(e: 'toggle-dock'): void")
    expect(desktopPetSource).toContain("const launcherAriaLabel = computed(() => props.dockOpen")
    expect(desktopPetSource).toContain("const STANDALONE_LAUNCHER_POSITION_STORAGE_KEY = 'langhuan.xingyiPet.standaloneLauncherPosition'")
    expect(desktopPetSource).toContain('class="xingyi-desktop-pet__agent-launcher"')
    expect(desktopPetSource).toContain('background: #7f7f4d;')
    expect(desktopPetSource).not.toContain("(e: 'activate'): void")
    expect(dockSource).toContain('<XingyiDesktopPet')
    expect(dockSource).toContain(':dock-open="open"')
    expect(dockSource).toContain('@toggle-dock="open = !open"')
    expect(dockSource).toContain(':show-collapsed-tab="false"')
    expect(dockSource).not.toContain('<template #edge>')
    expect(dockSource).not.toContain('edge-presentation="pet"')
    expect(windowSource).not.toContain('edgePresentation')
    expect(windowSource).not.toContain('edgeActivationMode')
    expect(globalStyles).toContain('xy-pet-star-core-enter')
    expect(globalStyles).toContain('xy-pet-star-ray-leave')
    expect(globalStyles).toContain('xy-pet-star-drift')
    expect(globalStyles).toContain('xy-pet-star-ray-radial')
    expect(globalStyles).toContain('rotate(var(--xy-ray-angle)) scale(calc(1 - (1 - var(--xy-ray-in)) * var(--xy-ray-amp, 1)))')
  })

  it('状态星正式接线 globalStatus：出场随任务开始、换色覆盖黄/绿/红三态', () => {
    expect(petStatusSource).toContain('status: XingyiGlobalStatus')
    expect(petStatusSource).toContain("const visible = computed(() => props.status !== 'idle')")
    expect(desktopPetSource).toContain('globalStatus: XingyiGlobalStatus')
    expect(desktopPetSource).toContain(':status="globalStatus"')
    expect(desktopPetSource).toContain("const starVisible = computed(() => props.globalStatus !== 'idle')")
    expect(dockSource).toContain(':global-status="globalStatus"')
    expect(globalStyles).toContain('.xingyi-pet-status-star.xy-star--waiting')
    expect(globalStyles).toContain('.xingyi-pet-status-star.xy-star--success')
    expect(globalStyles).toContain('.xingyi-pet-status-star.xy-star--error')
  })

  it('胸口超级 Agent 按钮弹出时使用轻过冲缓动，先变大再收回正常大小', () => {
    expect(desktopPetSource).toContain('var(--lh-ease-bloom')
  })

  it('空状态大图标与头部灯视觉同步：挂 idle 状态类、同样隐藏三根放射光线并加粗描边', () => {
    expect(dockSource).toContain('<AgentConversationEmptyState')
    expect(emptyStateSource).toContain('class="agent-conversation-empty-state__icon xy-star--idle"')
    expect(emptyStateSource).toContain('.agent-conversation-empty-state__icon :deep(.xingyi-star-icon__rays)')
    expect(emptyStateSource).toContain('.agent-conversation-empty-state__icon :deep(.xingyi-star-icon__outline)')
  })

  it('对话成功后的绿灯：浮坞关闭时常驻，打开时/打开后维持 5 秒再消失', () => {
    expect(dockSource).toContain('const successPulseActive = ref(false)')
    expect(dockSource).toContain('function markTurnSucceeded()')
    expect(dockSource).toContain("if (result.terminalReason === 'done' || result.terminalReason === 'closing-note')")
    expect(dockSource).toContain('markTurnSucceeded()')
    expect(dockSource).toContain('successPulseTimer = setTimeout(() => { successPulseActive.value = false }, 5000)')
  })

  it('桌宠状态星每个颜色都有各自的深色描边，不再是无描边的纯色实心', () => {
    expect(globalStyles).toContain('.xingyi-pet-status-star__icon.xy-star--running .xingyi-star-icon__outline')
    expect(globalStyles).toContain('.xingyi-pet-status-star__icon.xy-star--success .xingyi-star-icon__outline')
    expect(globalStyles).toContain('.xingyi-pet-status-star__icon.xy-star--error .xingyi-star-icon__outline')
  })

  it('待确认（2026-07-17）：running/waiting 共用同一 Transition key 不触发出入场，且旋转/光线幅度换成专属大动作', () => {
    expect(petStatusSource).toContain("const colorGroup = computed(() => (props.status === 'waiting' ? 'running' : props.status))")
    expect(petStatusSource).toContain(':key="colorGroup"')
    expect(globalStyles).toContain('@keyframes xy-pet-star-drift-translate')
    expect(globalStyles).toContain('@keyframes xy-pet-star-drift-rotate')
    expect(globalStyles).toContain('@keyframes xy-pet-star-spin-waiting')
    expect(globalStyles).toContain('xy-pet-star-spin-waiting 4.8s linear infinite')
    expect(globalStyles).toContain('--xy-ray-amp: 1.8;')
  })

  it('轨道种子的起始相位不再随机，星星每次出现都从同一个点开始漂移（2026-07-17，避免刚出现就跳到别处）', () => {
    expect(desktopPetSource).toContain('pacePhase: 0,')
    expect(desktopPetSource).toContain('phaseA: 0,')
    expect(desktopPetSource).toContain('phaseB: 0,')
  })

  it('starAnchor 默认值与轨道起点数值对齐，避免 ref 默认值到真实起点之间还有一次残余跳变（2026-07-17 二次修正）', () => {
    expect(desktopPetSource).toContain('left: `${PET_STAR_ORBIT_BOUNDS.leftCenter + PET_STAR_ORBIT_BOUNDS.leftRadius}%`,')
  })

  it('漂移动画的 animation-delay 补上 backwards，避免延迟结束时从 0 突然跳到 0% 关键帧（2026-07-17 三次修正）', () => {
    expect(globalStyles).toContain('xy-pet-star-drift-translate 7.6s linear 0.62s infinite backwards')
    expect(globalStyles).toContain('xy-pet-star-drift-rotate 7.6s linear 0.62s infinite backwards')
    expect(globalStyles).toContain('xy-pet-star-drift-translate 4.2s linear 0.62s infinite backwards')
  })

  it('待确认光线只封顶外沿延伸、不再整体收近内沿（2026-07-17 二次修正，避免撞进星体）', () => {
    expect(globalStyles).not.toContain('.xingyi-pet-status-star.xy-star--waiting .xingyi-pet-status-star__ray-field')
    expect(globalStyles).toContain('scale(calc(1 + min((var(--xy-ray-out) - 1) * var(--xy-ray-amp, 1), 0.06)))')
  })

  it('星依本体颜色只认正式 PNG，不再叠显示滤镜（2026-07-17 路线拍板）', () => {
    expect(desktopPetSource).not.toContain('filter: brightness(')
    expect(desktopPetSource).not.toContain('filter: saturate(')
  })
})
