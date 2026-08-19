/**
 * @vitest-environment jsdom
 */
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const AppConfirmDialogStub = {
  template: `
    <div v-if="open" data-testid="restore-default-confirm">
      <p data-testid="restore-default-message">{{ message }}</p>
      <button data-testid="restore-default-cancel" @click="$emit('cancel')">取消</button>
      <button data-testid="restore-default-submit" @click="$emit('confirm')">{{ confirmText }}</button>
    </div>
  `,
  props: ['open', 'title', 'message', 'confirmText', 'tone']
}

function mountEditor(props = {}) {
  return mount(OrchestratorPromptTreeEditor, {
    props,
    global: {
      stubs: { AppConfirmDialog: AppConfirmDialogStub }
    }
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  saveOrchestratorConfigMock.mockClear()
})

describe('OrchestratorPromptTreeEditor', () => {
  it('可编辑模式：渲染每情境=单文件树 + 新建入口 + 行内操作按钮', async () => {
    const wrapper = mountEditor()
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

  it('右键情境文件在右侧内联新建挂载提示词并保存到全局基线', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const scenarioNode = wrapper.findAll('.tn').find((node) => node.text().includes('pressure') && node.text().includes('压力'))
    expect(scenarioNode).toBeTruthy()
    await scenarioNode.trigger('contextmenu')
    await flushPromises()

    const detail = wrapper.get('.opt-detail')
    expect(detail.text()).toContain('新建挂载提示词')
    expect(detail.text()).toContain('挂载提示词原文')
    expect(detail.text()).toContain('归属情境')
    expect(document.querySelector('.app-modal-shell')).toBeFalsy()

    await detail.get('input.oc-input').setValue('喜悦文风示例')
    await detail.get('textarea.oc-textarea--tall').setValue('写得轻快一点，句子短一点。')

    await detail.get('.btn-primary').trigger('click')
    await flushPromises()

    expect(saveOrchestratorConfigMock).toHaveBeenCalledTimes(1)
    const savedConfig = saveOrchestratorConfigMock.mock.calls[0][0]
    const pressure = savedConfig.scenarios.find((s) => s.code === 'pressure')
    expect(pressure.mountedPrompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '喜悦文风示例', content: '写得轻快一点，句子短一点。', enabled: true })
    ]))
    expect(wrapper.html()).toContain('喜悦文风示例')
  })

  it('点击情境文件在右侧显示两栏编辑区：代号弱化、名字可编辑、正文带字数；保存调用仓库 + 就地 toast', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const scenarioNode = wrapper.findAll('.tn').find((node) => node.text().includes('pressure') && node.text().includes('压力'))
    await scenarioNode.trigger('click')
    await flushPromises()

    const detail = wrapper.get('.opt-detail')
    expect(detail.text()).toContain('情境名字')
    expect(detail.text()).toContain('可编辑')
    expect(detail.get('.code-val').text()).toBe('pressure')
    expect(detail.text()).toMatch(/共\s*\d+\s*字/)
    expect(document.querySelector('.skill-modal')).toBeFalsy()
    expect(document.querySelector('.skill-overlay')).toBeFalsy()

    await detail.get('.btn-primary').trigger('click')
    await flushPromises()
    expect(saveOrchestratorConfigMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.opt-detail').exists()).toBe(true)
    expect(detail.get('.skill-toast').classes()).toContain('show')
  })

  it('点击工具节点只读查看 brief/manual', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const toolFolder = wrapper.findAll('.tn').find((node) => node.text().includes('可调用工具'))
    await toolFolder.trigger('click')
    await flushPromises()

    const toolNode = wrapper.findAll('.tn').find((node) => node.text().includes('readScenarioSkill'))
    expect(toolNode).toBeTruthy()
    await toolNode.trigger('click')
    await flushPromises()

    const detail = wrapper.get('.opt-detail')
    expect(detail.text()).toContain('按 code 读情境正文')
    expect(detail.text()).toContain('"tool":"readScenarioSkill"')
  })

  it('readonly：渲染只读树，但无编辑入口、无行内按钮、点击不弹弹窗；activeScenarioCode 标圆点', async () => {
    const wrapper = mountEditor({ readonly: true, activeScenarioCode: 'pressure' })
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
    expect(wrapper.find('.opt-detail').exists()).toBe(false)
    expect(saveOrchestratorConfigMock).not.toHaveBeenCalled()
  })

  it('恢复默认必须二次确认；取消不写入，确认后保存现役默认 seed', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    const restoreButton = wrapper.get('[data-testid="restore-orchestrator-defaults"]')
    expect(restoreButton.text()).toContain('恢复默认')

    await restoreButton.trigger('click')
    expect(wrapper.find('[data-testid="restore-default-confirm"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="restore-default-message"]').text()).toContain('挂载提示词')
    expect(saveOrchestratorConfigMock).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="restore-default-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="restore-default-confirm"]').exists()).toBe(false)
    expect(saveOrchestratorConfigMock).not.toHaveBeenCalled()

    await restoreButton.trigger('click')
    await wrapper.get('[data-testid="restore-default-submit"]').trigger('click')
    await flushPromises()

    expect(saveOrchestratorConfigMock).toHaveBeenCalledTimes(1)
    const restored = saveOrchestratorConfigMock.mock.calls[0][0]
    expect(restored.systemPrompt).toContain('ReplyPlanOrchestrator')
    expect(restored.scenarios.map((scenario) => scenario.code)).toEqual([
      'pressure', 'nsfw', 'anger', 'awkward', 'sadness',
      'fear', 'jealousy', 'guilt', 'excitement', 'fatigue'
    ])
    expect(restored.scenarios.every((scenario) => (scenario.mountedPrompts || []).length === 0)).toBe(true)
    expect(restored.tools.some((tool) => tool.name === 'readScenarioSkill')).toBe(true)
    expect(wrapper.text()).toContain('nsfw')
    expect(wrapper.text()).toContain('NSFW')
    expect(wrapper.text()).toContain('excitement')
    expect(wrapper.text()).toContain('fatigue')
  })

  it('readonly 审计树不提供恢复默认入口', async () => {
    const wrapper = mountEditor({ readonly: true })
    await flushPromises()

    expect(wrapper.find('[data-testid="restore-orchestrator-defaults"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="restore-default-confirm"]').exists()).toBe(false)
  })

  it('右侧取消和保存按钮文字使用双轴居中', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/common/OrchestratorPromptTreeEditor.vue'),
      'utf8'
    )

    expect(source).toMatch(/\.opt-detail__actions \.btn\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s)
  })
})
