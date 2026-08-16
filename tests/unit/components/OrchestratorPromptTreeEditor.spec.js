/**
 * @vitest-environment jsdom
 */
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

// mock 全局编排配置仓库：提示词树展示并可编辑这份全局配置（system 基线）
const saveOrchestratorConfigMock = vi.fn(async (config) => config)
vi.mock('../../../src/repositories/orchestratorConfigRepository.ts', () => ({
  fetchOrchestratorConfig: async () => ({
    systemPrompt: '编排规则',
    scenarios: [
      {
        code: 'pressure',
        label: '压力',
        trigger: '高压',
        body: '压力情境正文：进攻/防御/僵住/逃避各分低中高三档。',
        mountedPrompts: [
          { id: 'style_1', title: '边界文风', content: '短句更冷一点。', enabled: true, orderIndex: 2.1 }
        ]
      },
      {
        code: 'nsfw',
        label: 'NSFW',
        trigger: '成人向创作场景',
        body: 'NSFW 情境正文：按情境选择表达强度。',
        mountedPrompts: []
      }
    ],
    tools: [
      { name: 'generatePlanBatch', kind: 'plan', brief: '按反应类别生成候选', manual: '调用格式：{"tool":"generatePlanBatch"...}' },
      { name: 'readScenarioSkill', kind: 'meta', brief: '按 code 读情境正文', manual: '调用格式：{"tool":"readScenarioSkill","code":"..."}' }
    ]
  }),
  saveOrchestratorConfig: (...args) => saveOrchestratorConfigMock(...args),
  loadEffectiveOrchestratorConfig: async () => ({ systemPrompt: '', scenarios: [] }),
  invalidateOrchestratorConfigCache: () => {}
}))

import OrchestratorPromptTreeEditor from '../../../src/components/common/OrchestratorPromptTreeEditor.vue'

afterEach(() => {
  document.body.innerHTML = ''
  saveOrchestratorConfigMock.mockClear()
})

describe('OrchestratorPromptTreeEditor', () => {
  it('可编辑模式：渲染每情境=单文件树 + 新建入口 + 行内操作按钮', async () => {
    const wrapper = mount(OrchestratorPromptTreeEditor)
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('LANGHUAN.md')
    expect(html).toContain('回复编排器总提示词')
    expect(html).toContain('情境skill')
    expect(html).toContain('边界文风')        // pressure 的挂载提示词
    expect(html).toContain('可调用工具')
    expect(html).toContain('新建情境skill')   // 可编辑入口
    expect(wrapper.find('.tn-act').exists()).toBe(true) // 行内新建/删除按钮
  })

  it('右键情境文件可新建挂载提示词并保存到全局基线', async () => {
    const wrapper = mount(OrchestratorPromptTreeEditor)
    await flushPromises()

    const scenarioNode = wrapper.findAll('.tn').find((node) => node.text().includes('pressure') && node.text().includes('压力'))
    expect(scenarioNode).toBeTruthy()
    await scenarioNode.trigger('contextmenu')
    await flushPromises()

    const body = document.body.innerHTML
    expect(body).toContain('新建挂载提示词')
    expect(body).toContain('挂载提示词原文')
    expect(body).toContain('归属情境')

    const titleInput = document.querySelector('input.oc-input')
    expect(titleInput).toBeTruthy()
    titleInput.value = '喜悦文风示例'
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    const contentTextarea = document.querySelector('textarea.oc-textarea--tall')
    expect(contentTextarea).toBeTruthy()
    contentTextarea.value = '写得轻快一点，句子短一点。'
    contentTextarea.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelector('.btn-primary').click()
    await flushPromises()

    expect(saveOrchestratorConfigMock).toHaveBeenCalledTimes(1)
    const savedConfig = saveOrchestratorConfigMock.mock.calls[0][0]
    const pressure = savedConfig.scenarios.find((s) => s.code === 'pressure')
    expect(pressure.mountedPrompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '喜悦文风示例', content: '写得轻快一点，句子短一点。', enabled: true })
    ]))
    expect(wrapper.html()).toContain('喜悦文风示例')
  })

  it('点击情境文件打开两栏弹窗：代号弱化、名字可编辑、正文带字数；保存调用仓库 + 就地 toast', async () => {
    const wrapper = mount(OrchestratorPromptTreeEditor)
    await flushPromises()

    const scenarioNode = wrapper.findAll('.tn').find((node) => node.text().includes('pressure') && node.text().includes('压力'))
    await scenarioNode.trigger('click')
    await flushPromises()

    const modal = document.querySelector('.skill-modal')
    expect(modal).toBeTruthy()
    const modalHtml = modal.innerHTML
    expect(modalHtml).toContain('情境名字')
    expect(modalHtml).toContain('可编辑')
    expect(document.querySelector('.skill-modal .code-val')?.textContent).toBe('pressure')
    expect(modalHtml).toMatch(/共\s*\d+\s*字/)

    document.querySelector('.skill-modal .mbtn-primary').click()
    await flushPromises()
    expect(saveOrchestratorConfigMock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.skill-modal')).toBeTruthy()
    expect(document.querySelector('.skill-toast').classList.contains('show')).toBe(true)
  })

  it('点击工具节点只读查看 brief/manual', async () => {
    const wrapper = mount(OrchestratorPromptTreeEditor)
    await flushPromises()

    const toolFolder = wrapper.findAll('.tn').find((node) => node.text().includes('可调用工具'))
    await toolFolder.trigger('click')
    await flushPromises()

    const toolNode = wrapper.findAll('.tn').find((node) => node.text().includes('readScenarioSkill'))
    expect(toolNode).toBeTruthy()
    await toolNode.trigger('click')
    await flushPromises()

    const body = document.body.innerHTML
    expect(body).toContain('按 code 读情境正文')
    expect(body).toContain('"tool":"readScenarioSkill"')
  })

  it('readonly：渲染只读树，但无编辑入口、无行内按钮、点击不弹弹窗；activeScenarioCode 标圆点', async () => {
    const wrapper = mount(OrchestratorPromptTreeEditor, {
      props: { readonly: true, activeScenarioCode: 'pressure' }
    })
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('情境skill')
    expect(html).toContain('边界文风')
    expect(html).not.toContain('新建情境skill')
    expect(wrapper.find('.tn-act').exists()).toBe(false)
    // 命中情境圆点
    expect(wrapper.find('.tn-read').exists()).toBe(true)

    // 点击情境节点不应弹出任何编辑弹窗
    const scenarioNode = wrapper.findAll('.tn').find((node) => node.text().includes('pressure') && node.text().includes('压力'))
    await scenarioNode.trigger('click')
    await flushPromises()
    expect(document.querySelector('.skill-modal')).toBeFalsy()
    expect(saveOrchestratorConfigMock).not.toHaveBeenCalled()
  })
})
