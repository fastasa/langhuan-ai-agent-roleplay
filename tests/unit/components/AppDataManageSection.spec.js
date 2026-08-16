/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppDataManageSection from '../../../src/components/app/sections/AppDataManageSection.vue'

describe('AppDataManageSection 本地数据安全动作', () => {
  it('向所有本地用户开放导入、导出与重置', async () => {
    const actions = {
      exportData: vi.fn(),
      importData: vi.fn(),
      resetData: vi.fn()
    }
    const wrapper = mount(AppDataManageSection, {
      props: {
        viewModel: { sections: { dataManage: true } },
        actions
      }
    })

    expect(wrapper.text()).toContain('数据只保存在这台电脑上')
    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['导出数据', '导入数据', '重置数据'])
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    expect(actions.exportData).toHaveBeenCalledOnce()
    expect(actions.importData).toHaveBeenCalledOnce()
    expect(actions.resetData).toHaveBeenCalledOnce()
  })
})
