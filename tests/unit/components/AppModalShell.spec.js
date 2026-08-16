/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppModalShell from '../../../src/components/common/AppModalShell.vue'

describe('AppModalShell', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the overlay at document body level', () => {
    const wrapper = mount(AppModalShell, {
      props: {
        open: true,
        title: 'Body modal'
      },
      slots: {
        default: '<div>Modal content</div>'
      }
    })

    const overlay = document.body.querySelector('.app-modal-shell__overlay')
    expect(overlay).toBeTruthy()
    expect(overlay?.parentElement).toBe(document.body)
    expect(wrapper.element.contains(overlay)).toBe(false)
  })

  it('emits close from the body-level overlay', async () => {
    const wrapper = mount(AppModalShell, {
      props: {
        open: true,
        title: 'Body modal'
      }
    })

    const overlay = document.body.querySelector('.app-modal-shell__overlay')
    expect(overlay).toBeTruthy()

    overlay?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps the modal open when text selection starts inside and ends on the overlay', () => {
    const wrapper = mount(AppModalShell, {
      props: {
        open: true,
        title: 'Editable modal'
      },
      slots: {
        default: '<input class="editable-input" value="select me" />'
      }
    })

    const overlay = document.body.querySelector('.app-modal-shell__overlay')
    const input = document.body.querySelector('.editable-input')
    expect(overlay).toBeTruthy()
    expect(input).toBeTruthy()

    input?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('blocks both close button and overlay dismissal while closing is disabled', async () => {
    const wrapper = mount(AppModalShell, {
      props: {
        open: true,
        title: 'Busy modal',
        closeDisabled: true
      }
    })

    const overlay = document.body.querySelector('.app-modal-shell__overlay')
    const closeButton = document.body.querySelector('.app-modal-shell__close')
    expect(closeButton?.hasAttribute('disabled')).toBe(true)

    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    overlay?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('provides a workspace size aligned with map and script workspaces', () => {
    mount(AppModalShell, {
      props: {
        open: true,
        title: 'Workspace modal',
        size: 'workspace'
      }
    })

    expect(document.body.querySelector('.app-modal-shell--workspace')).toBeTruthy()
  })

  it('keeps an accessible dialog name when a workspace intentionally hides the visual header', () => {
    mount(AppModalShell, {
      props: {
        open: true,
        ariaLabel: '人格模型训练 · 惊稚',
        showClose: false,
        bodyFlush: true
      }
    })

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('人格模型训练 · 惊稚')
    expect(document.body.querySelector('.app-modal-shell__header')).toBeNull()
  })
})
