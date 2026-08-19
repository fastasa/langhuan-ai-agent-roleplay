/**
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import XingyiDesktopPet from '../../../src/components/app/XingyiDesktopPet.vue'

describe('XingyiDesktopPet · 超级 Agent hover 入口', () => {
  let warnSpy

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test manifest unavailable')))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('浮坞关闭时显示超级 Agent 星光图标，点击请求切换浮坞', async () => {
    const wrapper = mount(XingyiDesktopPet, {
      props: {},
      global: {
        stubs: {
          Teleport: true,
          XingyiPetStatusStar: true,
        },
      },
    })
    await nextTick()

    expect(wrapper.get('.xingyi-desktop-pet').attributes('role')).toBe('group')
    const launcher = wrapper.get('.xingyi-desktop-pet__agent-launcher')
    expect(launcher.attributes('aria-label')).toBe('打开星依超级 Agent 浮坞')
    expect(launcher.findAll('path')).toHaveLength(3)

    await launcher.trigger('click')
    expect(wrapper.emitted('toggle-dock')).toEqual([[]])
    expect(wrapper.emitted('open-dock')).toBeUndefined()
    expect(wrapper.emitted('activate')).toBeUndefined()
  })

  it('浮坞打开时同一按钮改为关闭语义与 x 图标', async () => {
    const wrapper = mount(XingyiDesktopPet, {
      props: { dockOpen: true },
      global: { stubs: { Teleport: true, XingyiPetStatusStar: true } },
    })
    await nextTick()

    const launcher = wrapper.get('.xingyi-desktop-pet__agent-launcher')
    expect(launcher.attributes('aria-label')).toBe('关闭星依超级 Agent 浮坞')
    expect(launcher.attributes('title')).toBe('关闭星依超级 Agent')
    expect(launcher.findAll('path')).toHaveLength(2)

    await launcher.trigger('click')
    expect(wrapper.emitted('toggle-dock')).toEqual([[]])
  })

  it('正式桌宠悬浮时显示打开对话与关闭桌宠两个按钮，关闭事件不误触浮坞', async () => {
    const wrapper = mount(XingyiDesktopPet, {
      props: { closable: true },
      global: { stubs: { Teleport: true, XingyiPetStatusStar: true } },
    })
    await nextTick()

    expect(wrapper.findAll('.xingyi-desktop-pet__actions button')).toHaveLength(2)
    const source = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDesktopPet.vue'), 'utf8')
    expect(source).not.toMatch(/\.xingyi-desktop-pet__close\s*\{/)
    await wrapper.get('.xingyi-desktop-pet__close').trigger('click')
    expect(wrapper.emitted('close-pet')).toEqual([[]])
    expect(wrapper.emitted('toggle-dock')).toBeUndefined()
  })

  it('桌宠隐藏后只剩独立对话入口，仍沿用浮坞开合语义', async () => {
    const wrapper = mount(XingyiDesktopPet, {
      props: { petVisible: false, closable: true },
      global: { stubs: { Teleport: true, XingyiPetStatusStar: true } },
    })
    await nextTick()

    expect(wrapper.find('.xingyi-desktop-pet').exists()).toBe(false)
    expect(wrapper.find('.xingyi-desktop-pet__close').exists()).toBe(false)
    const launcher = wrapper.get('.xingyi-desktop-pet__standalone-launcher')
    await launcher.trigger('click')
    expect(wrapper.emitted('toggle-dock')).toEqual([[]])

    await wrapper.setProps({ dockOpen: true })
    const closeLauncher = wrapper.get('.xingyi-desktop-pet__standalone-launcher')
    expect(closeLauncher.attributes('aria-label')).toBe('关闭星依超级 Agent 浮坞')
    expect(closeLauncher.findAll('path')).toHaveLength(2)
  })

  it('桌宠隐藏后的独立按钮可以自由拖动、钳在视口并记住位置，拖动不误触开合', async () => {
    const wrapper = mount(XingyiDesktopPet, {
      props: { petVisible: false, closable: true },
      global: { stubs: { Teleport: true, XingyiPetStatusStar: true } },
    })
    await nextTick()

    const launcher = wrapper.get('.xingyi-desktop-pet__standalone-launcher')
    const initialStyle = launcher.attributes('style')
    const initialLeft = Number(initialStyle.match(/left:\s*([\d.]+)px/)?.[1])
    const initialTop = Number(initialStyle.match(/top:\s*([\d.]+)px/)?.[1])
    launcher.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 500, clientY: 300, button: 0, bubbles: true, cancelable: true })
    )
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 200, clientY: 500, bubbles: true, cancelable: true })
    )
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }))
    launcher.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextTick()

    const stored = JSON.parse(localStorage.getItem('langhuan.xingyiPet.standaloneLauncherPosition'))
    expect(stored.left).toBeCloseTo(initialLeft - 300)
    expect(stored.top).toBeCloseTo(initialTop + 200)
    const movedLauncher = wrapper.get('.xingyi-desktop-pet__standalone-launcher')
    expect(movedLauncher.attributes('style')).toContain(`left: ${stored.left}px`)
    expect(movedLauncher.attributes('style')).toContain(`top: ${stored.top}px`)
    expect(wrapper.emitted('toggle-dock')).toBeUndefined()

    movedLauncher.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 200, clientY: 500, button: 0, bubbles: true, cancelable: true })
    )
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: -5000, clientY: -5000, bubbles: true, cancelable: true })
    )
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }))
    movedLauncher.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextTick()

    expect(JSON.parse(localStorage.getItem('langhuan.xingyiPet.standaloneLauncherPosition'))).toEqual({ left: 12, top: 12 })
    expect(wrapper.emitted('toggle-dock')).toBeUndefined()
  })

  it('正式宿主用一份本地偏好同时接桌宠关闭按钮与设置开关', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
    expect(source).toContain("const DESKTOP_PET_VISIBLE_KEY = 'langhuan.xingyiPet.visible'")
    expect(source).toContain('@close-pet="setDesktopPetVisible(false)"')
    expect(source).toContain('@update:desktop-pet-visible="setDesktopPetVisible($event)"')
    expect(source).toContain(':show-diary-settings="true"')
  })

  it('把悬停进入和离开分别映射到抬手与放手动作', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDesktopPet.vue'), 'utf8')
    expect(source).toContain('@pointerenter="handlePointerEnter"')
    expect(source).toContain('@pointerleave="handlePointerLeave"')
    expect(source).toContain("startAnimation('hover-eager')")
    expect(source).toContain("startAnimation('hover-eager-exit')")
    expect(source).toContain('top: 41.5%')
    expect(source).toContain('width: 38px')
    expect(source).toContain('height: 38px')
  })

  it('真实加载 spritesheet manifest 后在 pointerenter / pointerleave 切到抬手与放手首帧', async () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/xingyi-pet/runtime/manifest.json'), 'utf8'))
    fetch.mockResolvedValue({ ok: true, json: async () => manifest })
    matchMedia.mockReturnValue({ matches: false })
    vi.stubGlobal('Image', class {
      onload = null
      onerror = null
      set src(_value) {
        queueMicrotask(() => this.onload?.())
      }
    })

    const wrapper = mount(XingyiDesktopPet, {
      props: {},
      global: {
        stubs: {
          Teleport: true,
          XingyiPetStatusStar: true,
        },
      },
    })
    await flushPromises()

    const pet = wrapper.get('.xingyi-desktop-pet')
    await pet.trigger('pointerenter')
    expect(wrapper.get('.xingyi-desktop-pet__sprite').attributes('style')).toContain('background-position: 0px -257.92px')

    await pet.trigger('pointerleave')
    expect(wrapper.get('.xingyi-desktop-pet__sprite').attributes('style')).toContain('background-position: 0px -515.84px')
    wrapper.unmount()
  })
})
