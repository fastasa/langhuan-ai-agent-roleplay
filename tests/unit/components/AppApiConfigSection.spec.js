import { describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppApiConfigSection from '../../../src/components/app/sections/AppApiConfigSection.vue'

function createViewModel(overrides = {}) {
  return {
    sections: {},
    apiPresets: [
      { name: 'A', model: 'model-a', baseUrl: 'https://a.example.com', apiKey: 'key-a', providerType: 'openai-compatible' },
      { name: 'DeepSeek', model: 'deepseek-v4-flash', baseUrl: 'https://deepseek.example.com', apiKey: 'key-ds', providerType: 'deepseek' }
    ],
    apiProviderTemplates: [{ id: 'deepseek', name: 'DeepSeek' }],
    defaultPresetName: 'A',
    aiProviderMode: 'custom',
    apiPresetCount: 2,
    currentApiPresetIndex: 0,
    apiPresetForm: {
      name: 'A',
      providerType: 'openai-compatible',
      apiUrl: 'https://example.com',
      apiKey: 'key',
      model: 'model-a',
      temperature: 1,
      maxTokens: 512,
      fallbackPreset: ''
    },
    showEditApiPreset: true,
    isLoadingModels: false,
    isTestingApi: false,
    modelList: [],
    weatherApiKey: '',
    weatherApiDomain: 'devapi.qweather.com',
    agentModelConfigs: [{
      id: 'brain_agent',
      name: '大脑 Agent',
      agentType: 'brain',
      // 批次3（2026-07-08 槽位收束 9→4）：四槽现役形态（书童fast/校书balanced/掌阁smart+编目展示行）。
      modelUsageConfigs: [
        { id: 'fast', label: '书童', presetName: '', model: '', temperature: 0.2, maxTokens: 256, thinking: 'disabled' },
        { id: 'balanced', label: '校书', presetName: 'A', model: 'model-a', temperature: 0.7, maxTokens: 512, thinking: 'disabled' },
        { id: 'message', label: '执笔', presetName: 'A', model: 'model-a', temperature: 0.7, maxTokens: 512, thinking: 'disabled' },
        { id: 'smart', label: '掌阁', presetName: '', model: '', temperature: 0.4, maxTokens: 8192, thinking: 'enabled' }
      ],
      presetName: 'A',
      recallModel: 'model-a',
      recallMaxTokens: 512,
      fallbackPresetName: 'A',
      fallbackRecallModel: '',
      fallbackRecallMaxTokens: 512,
      embeddingPresetId: '',
      narrationQuickJudgePresetName: '',
      narrationQuickJudgeModel: '',
      narrativeBeatPresetName: '',
      narrativeBeatModel: '',
      narrativeBeatMaxTokens: 8192,
      narrationGenerationPresetName: '',
      narrationGenerationModel: '',
      recallCandidateMode: 'parallel_merge',
      recallContentStrategy: 'summary_gate',
      writeBackMaxReviewRounds: 3,
      writeBackAuditLogLevel: 'standard',
      enabled: true,
      capabilities: ['recall_judgment', 'writeback_review']
    }],
    ...overrides
  }
}

function createActions() {
  return {
    loadApiPreset: vi.fn(),
    addNewApiPreset: vi.fn(),
    setAiProviderMode: vi.fn(),
    updateApiPresetForm: vi.fn(),
    applyProviderTemplate: vi.fn(),
    loadModels: vi.fn(),
    saveApiPreset: vi.fn(),
    setDefaultPreset: vi.fn(),
    deleteCurrentApiPreset: vi.fn(),
    testApiConnection: vi.fn(),
    updateWeatherApiKey: vi.fn(),
    updateWeatherApiDomain: vi.fn(),
    saveWeatherApiConfig: vi.fn(),
    updateAgentModelConfig: vi.fn(),
    saveAgentModelConfig: vi.fn()
  }
}

describe('AppApiConfigSection', () => {
  it('点击自有 API 预设会立刻同步父级当前预设和本地草稿', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel({
          apiPresets: [
            { name: '小忆 API', model: '', baseUrl: 'https://xiaoyi.example.com', apiKey: '', hasApiKey: true, providerType: 'openai-compatible' },
            { name: 'DeepSeek', model: '', baseUrl: 'https://deepseek.example.com', apiKey: '', hasApiKey: true, providerType: 'deepseek' }
          ],
          currentApiPresetIndex: 0,
          apiPresetForm: {
            name: '小忆 API',
            providerType: 'openai-compatible',
            apiUrl: 'https://xiaoyi.example.com',
            apiKey: '',
            hasApiKey: true,
            model: '',
            temperature: undefined,
            maxTokens: undefined,
            fallbackPreset: ''
          }
        }),
        actions
      }
    })

    const deepSeekRow = wrapper.findAll('.api-preset-row__main').find((button) => button.text().includes('DeepSeek'))
    expect(deepSeekRow).toBeTruthy()
    await deepSeekRow.trigger('click')
    await nextTick()

    expect(actions.loadApiPreset).toHaveBeenCalledWith(1)
    const nameInput = wrapper.find('input[placeholder="如：DeepSeek、OpenAI"]')
    const urlInput = wrapper.find('input[placeholder="https://api.deepseek.com"]')
    expect(nameInput.element.value).toBe('DeepSeek')
    expect(urlInput.element.value).toBe('https://deepseek.example.com')

    wrapper.unmount()
  })

  it('已保存密钥的自有 API 预设可以直接加载模型', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel({
          apiPresets: [
            { name: 'DeepSeek', model: '', baseUrl: 'https://deepseek.example.com', apiKey: '', hasApiKey: true, providerType: 'deepseek' }
          ],
          apiPresetForm: {
            name: 'DeepSeek',
            providerType: 'deepseek',
            apiUrl: 'https://deepseek.example.com',
            apiKey: '',
            hasApiKey: true,
            model: '',
            temperature: undefined,
            maxTokens: undefined,
            fallbackPreset: ''
          }
        }),
        actions
      }
    })

    const loadButton = wrapper.findAll('.api-footer-button').find((button) => button.text().includes('加载列表'))
    expect(loadButton).toBeTruthy()
    expect(loadButton.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('已保存密钥')
    await loadButton.trigger('click')

    expect(actions.loadModels).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('新建 API 预设草稿不会被父级当前预设表单回填覆盖', async () => {
    const actions = createActions()
    const existingViewModel = createViewModel({
      apiPresets: [
        { name: '小忆', model: '', baseUrl: 'https://xiaoyi.example.com', apiKey: '', hasApiKey: true, providerType: 'openai-compatible' }
      ],
      currentApiPresetIndex: 0,
      showEditApiPreset: true,
      apiPresetForm: {
        originalName: '小忆',
        name: '小忆',
        providerType: 'openai-compatible',
        apiUrl: 'https://xiaoyi.example.com',
        apiKey: '',
        hasApiKey: true,
        model: '',
        temperature: undefined,
        maxTokens: undefined,
        fallbackPreset: ''
      }
    })
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: existingViewModel,
        actions
      }
    })

    const addButton = wrapper.find('.api-preset-add')
    await addButton.trigger('click')
    await nextTick()

    const nameInput = wrapper.find('input[placeholder="如：DeepSeek、OpenAI"]')
    const urlInput = wrapper.find('input[placeholder="https://api.deepseek.com"]')
    expect(nameInput.element.value).toBe('')
    expect(urlInput.element.value).toBe('')

    await wrapper.setProps({
      viewModel: createViewModel({
        ...existingViewModel,
        apiPresetForm: {
          ...existingViewModel.apiPresetForm,
          apiUrl: 'https://xiaoyi.example.com/v2'
        }
      })
    })
    await nextTick()

    expect(nameInput.element.value).toBe('')
    expect(urlInput.element.value).toBe('')

    wrapper.unmount()
  })

  it('编辑已有 API 预设时允许改名，并把原名称作为定位真值提交', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel({
          apiPresets: [
            { name: '小忆', model: '', baseUrl: 'https://xiaoyi.example.com', apiKey: '', hasApiKey: true, providerType: 'openai-compatible' },
            { name: 'DeepSeek', model: '', baseUrl: 'https://deepseek.example.com', apiKey: '', hasApiKey: true, providerType: 'deepseek' }
          ],
          defaultPresetName: '小忆',
          currentApiPresetIndex: 0,
          apiPresetForm: {
            originalName: '小忆',
            name: '小忆',
            providerType: 'openai-compatible',
            apiUrl: 'https://xiaoyi.example.com',
            apiKey: '',
            hasApiKey: true,
            model: '',
            temperature: undefined,
            maxTokens: undefined,
            fallbackPreset: ''
          }
        }),
        actions
      }
    })

    const nameInput = wrapper.find('input[placeholder="如：DeepSeek、OpenAI"]')
    expect(nameInput.attributes('disabled')).toBeUndefined()
    await nameInput.setValue('小忆2')
    await wrapper.find('.api-footer-button--primary').trigger('click')

    expect(actions.updateApiPresetForm).toHaveBeenCalledWith({ key: 'originalName', value: '小忆' })
    expect(actions.updateApiPresetForm).toHaveBeenCalledWith({ key: 'name', value: '小忆2' })
    expect(actions.saveApiPreset).toHaveBeenCalled()
    expect(actions.setDefaultPreset).toHaveBeenCalledWith('小忆2')

    wrapper.unmount()
  })

  it('支持识图使用统一选项按钮，切换后保存会透传 supportsVision（批2·输入框图片上传）', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel({
          apiPresets: [
            { name: '小忆', model: '', baseUrl: 'https://xiaoyi.example.com', apiKey: '', hasApiKey: true, providerType: 'openai-compatible', supportsVision: false }
          ],
          currentApiPresetIndex: 0,
          apiPresetForm: {
            originalName: '小忆',
            name: '小忆',
            providerType: 'openai-compatible',
            apiUrl: 'https://xiaoyi.example.com',
            apiKey: '',
            hasApiKey: true,
            model: '',
            temperature: undefined,
            maxTokens: undefined,
            fallbackPreset: '',
            supportsVision: false
          }
        }),
        actions
      }
    })

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    const visionButton = wrapper.find('.api-option-button')
    expect(visionButton.exists()).toBe(true)
    expect(visionButton.attributes('aria-pressed')).toBe('false')
    expect(visionButton.text()).toBe('未开启')

    await visionButton.trigger('click')
    expect(visionButton.attributes('aria-pressed')).toBe('true')
    expect(visionButton.text()).toBe('已开启')
    await wrapper.find('.api-footer-button--primary').trigger('click')

    expect(actions.updateApiPresetForm).toHaveBeenCalledWith({ key: 'supportsVision', value: true })
    expect(actions.saveApiPreset).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('编辑已有 API 预设名称时不会被父级旧表单刷新盖回去', async () => {
    const actions = createActions()
    const baseViewModel = createViewModel({
      apiPresets: [
        { name: '小忆', model: '', baseUrl: 'https://xiaoyi.example.com', apiKey: '', hasApiKey: true, providerType: 'openai-compatible' }
      ],
      currentApiPresetIndex: 0,
      apiPresetForm: {
        originalName: '小忆',
        name: '小忆',
        providerType: 'openai-compatible',
        apiUrl: 'https://xiaoyi.example.com',
        apiKey: '',
        hasApiKey: true,
        model: '',
        temperature: undefined,
        maxTokens: undefined,
        fallbackPreset: ''
      }
    })
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: baseViewModel,
        actions
      }
    })

    const nameInput = wrapper.find('input[placeholder="如：DeepSeek、OpenAI"]')
    await nameInput.setValue('小忆2')
    await wrapper.setProps({
      viewModel: createViewModel({
        ...baseViewModel,
        apiPresetForm: {
          ...baseViewModel.apiPresetForm,
          apiUrl: 'https://xiaoyi.example.com/refreshed'
        }
      })
    })
    await nextTick()

    expect(wrapper.find('input[placeholder="如：DeepSeek、OpenAI"]').element.value).toBe('小忆2')

    wrapper.unmount()
  })

  it('父级配置变化后会同步 Agent 草稿和默认预设展示', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel(),
        actions
      }
    })

    await wrapper.setProps({
      viewModel: createViewModel({
        defaultPresetName: 'DeepSeek',
        agentModelConfigs: [{
          ...createViewModel().agentModelConfigs[0],
          modelUsageConfigs: [
            { id: 'fast', label: '书童', presetName: '', model: '', temperature: 0.2, maxTokens: 256, thinking: 'disabled' },
            { id: 'balanced', label: '校书', presetName: 'DeepSeek', model: 'deepseek-v4-flash', temperature: 0.7, maxTokens: 640, thinking: 'disabled' },
            { id: 'smart', label: '掌阁', presetName: '', model: '', temperature: 0.4, maxTokens: 8192, thinking: 'enabled' }
          ],
          writeBackMaxReviewRounds: 4
        }]
      })
    })
    await nextTick()

    expect(wrapper.text()).toContain('默认：DeepSeek')

    const tabs = wrapper.findAll('.api-config-tab')
    await tabs[1].trigger('click')
    await nextTick()

    const selects = wrapper.findAll('select')
    expect(selects.some((select) => select.element.value === 'DeepSeek')).toBe(true)

    wrapper.unmount()
  })

  it('Agent 页保存只写 Agent 配置，不会顺手覆盖 API 预设草稿', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel(),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    await wrapper.find('.api-footer-button--primary').trigger('click')

    expect(actions.updateAgentModelConfig).toHaveBeenCalled()
    expect(actions.updateAgentModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        enabled: true
      })
    }))
    expect(actions.saveAgentModelConfig).toHaveBeenCalled()
    expect(actions.saveApiPreset).not.toHaveBeenCalled()
    expect(actions.setDefaultPreset).not.toHaveBeenCalled()
    expect(wrapper.find('.agent-enable').exists()).toBe(false)

    wrapper.unmount()
  })

  it('Agent 页会保存统一模型用途槽位', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel(),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    const usageCard = wrapper.findAll('.agent-review-card').find((card) => card.text().includes('模型用途'))
    expect(usageCard).toBeTruthy()
    const quickRow = usageCard.findAll('.agent-usage-row').find((row) => row.text().includes('书童'))
    expect(quickRow).toBeTruthy()
    const quickPreset = quickRow.findAll('select')[0]
    expect(quickPreset).toBeTruthy()
    await quickPreset.setValue('DeepSeek')
    const quickModel = quickRow.findAll('input')[0]
    expect(quickModel).toBeTruthy()
    await quickModel.setValue('narration-fast')
    await wrapper.find('.api-footer-button--primary').trigger('click')

    expect(actions.updateAgentModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        modelUsageConfigs: expect.arrayContaining([
          expect.objectContaining({
            id: 'fast',
            presetName: 'DeepSeek',
            model: 'narration-fast'
          })
        ])
      })
    }))

    wrapper.unmount()
  })

  it('模型用途渲染书童/校书/执笔/掌阁四行+编目展示行', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel(),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    const usageCard = wrapper.findAll('.agent-review-card').find((card) => card.text().includes('模型用途'))
    expect(usageCard).toBeTruthy()
    const rowsText = usageCard.findAll('.agent-usage-row').map((row) => row.text()).join('\n')
    expect(rowsText).toContain('书童')
    expect(rowsText).toContain('校书')
    expect(rowsText).toContain('执笔（消息）')
    expect(rowsText).toContain('掌阁')
    // 编目=嵌入展示行（服务端管理默认·暂不开放自选）。
    expect(rowsText).toContain('编目（嵌入）')
    // 旧九槽行名不再出现（「角色消息/旁白/星依」等词还会出现在校书行 hint 里描述归属，不列入）。
    for (const legacyLabel of ['快判1', '快判2', '均衡模型', '编排模型', '高量模型', '高智模型']) {
      expect(rowsText).not.toContain(legacyLabel)
    }

    wrapper.unmount()
  })

  it('Agent 页会通过参数弹窗保存掌阁参数', async () => {
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel(),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    const usageCard = wrapper.findAll('.agent-review-card').find((card) => card.text().includes('模型用途'))
    const highVolumeRow = usageCard.findAll('.agent-usage-row').find((row) => row.text().includes('掌阁'))
    expect(highVolumeRow).toBeTruthy()
    const paramButton = highVolumeRow.findAll('button').find((button) => button.text() === '参数')
    await paramButton.trigger('click')
    await nextTick()
    const tokenInputElement = Array.from(document.body.querySelectorAll('input[type="number"]'))
      .find((input) => input.value === '8192')
    const tokenInput = tokenInputElement ? new DOMWrapper(tokenInputElement) : null
    expect(tokenInput).toBeTruthy()
    await tokenInput.setValue('9000')
    await wrapper.find('.api-footer-button--primary').trigger('click')

    expect(actions.updateAgentModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        modelUsageConfigs: expect.arrayContaining([
          expect.objectContaining({
            id: 'smart',
            maxTokens: 9000
          })
        ])
      })
    }))

    wrapper.unmount()
  })

  it('Codex 模型声明 fast 服务档时在真实参数弹窗显示并保存 Fast', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: 'gpt-5.4',
          supportedReasoningEfforts: [
            { reasoningEffort: 'low', description: '较快' },
            { reasoningEffort: 'xhigh', description: '最深' }
          ],
          defaultReasoningEffort: 'low',
          additionalSpeedTiers: ['fast'],
          serviceTiers: [{ id: 'priority', name: 'Fast', description: '1.5x speed, increased usage' }]
        }]
      })
    }))
    const actions = createActions()
    const base = createViewModel()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel({
          apiPresets: [
            ...base.apiPresets,
            { name: 'Codex桥', model: 'gpt-5.4', baseUrl: 'codex://local', apiKey: '', providerType: 'codex-subscription' }
          ],
          agentModelConfigs: [{
            ...base.agentModelConfigs[0],
            modelUsageConfigs: base.agentModelConfigs[0].modelUsageConfigs.map((item) => item.id === 'balanced'
              ? { ...item, presetName: 'Codex桥', model: 'gpt-5.4', effort: '', thinking: 'disabled' }
              : item)
          }]
        }),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    const usageCard = wrapper.findAll('.agent-review-card').find((card) => card.text().includes('模型用途'))
    const balancedRow = usageCard.findAll('.agent-usage-row').find((row) => row.text().includes('校书'))
    await balancedRow.findAll('button').find((button) => button.text() === '参数').trigger('click')
    await nextTick()

    expect(document.body.textContent).not.toContain('努力程度')
    expect(document.body.textContent).toContain('返回思考摘要')
    expect(document.body.textContent).not.toContain('温度')
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const fastButtonElement = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent === 'Fast')
    expect(fastButtonElement).toBeTruthy()
    expect(fastButtonElement.getAttribute('aria-pressed')).toBe('false')
    await new DOMWrapper(fastButtonElement).trigger('click')
    expect(fastButtonElement.getAttribute('aria-pressed')).toBe('true')
    const thinkingSelectElement = Array.from(document.body.querySelectorAll('select'))
      .find((select) => Array.from(select.options).some((option) => option.textContent === '返回摘要'))
    await new DOMWrapper(thinkingSelectElement).setValue('enabled')
    const doneButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === '完成')
    await new DOMWrapper(doneButton).trigger('click')

    expect(actions.updateAgentModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        modelUsageConfigs: expect.arrayContaining([
          expect.objectContaining({ id: 'balanced', thinking: 'enabled', serviceTier: 'fast' })
        ])
      })
    }))
    const savedConfigs = actions.updateAgentModelConfig.mock.calls.at(-1)[0].changes.modelUsageConfigs
    expect(savedConfigs.find((item) => item.id === 'balanced')).not.toHaveProperty('effort')

    wrapper.unmount()
    global.fetch = originalFetch
  })

  it('AGY 参数弹窗不展示温度，也不伪装可回传思考摘要', async () => {
    const actions = createActions()
    const base = createViewModel()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel({
          apiPresets: [
            ...base.apiPresets,
            { name: 'AGY桥', model: 'gemini-3.1-pro-high', baseUrl: 'agy://local', apiKey: '', providerType: 'agy-subscription' }
          ],
          agentModelConfigs: [{
            ...base.agentModelConfigs[0],
            modelUsageConfigs: base.agentModelConfigs[0].modelUsageConfigs.map((item) => item.id === 'balanced'
              ? { ...item, presetName: 'AGY桥', model: 'gemini-3.1-pro-high', thinking: 'enabled' }
              : item)
          }]
        }),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    const usageCard = wrapper.findAll('.agent-review-card').find((card) => card.text().includes('模型用途'))
    const balancedRow = usageCard.findAll('.agent-usage-row').find((row) => row.text().includes('校书'))
    await balancedRow.findAll('button').find((button) => button.text() === '参数').trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('思考摘要（AGY 暂不回传）')
    expect(document.body.textContent).not.toContain('温度')
    const thinkingSelectElement = Array.from(document.body.querySelectorAll('select'))
      .find((select) => Array.from(select.options).some((option) => option.textContent === '返回摘要'))
    expect(thinkingSelectElement.disabled).toBe(true)
    expect(thinkingSelectElement.value).toBe('disabled')

    wrapper.unmount()
  })

  it('旁白链路可以从所选预设加载模型候选', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 'narration-fast' }, { id: 'narration-pro' }]
      })
    }))
    const actions = createActions()
    const wrapper = mount(AppApiConfigSection, {
      props: {
        viewModel: createViewModel(),
        actions
      }
    })

    await wrapper.findAll('.api-config-tab')[1].trigger('click')
    const usageCard = wrapper.findAll('.agent-review-card').find((card) => card.text().includes('模型用途'))
    expect(usageCard).toBeTruthy()
    const quickRow = usageCard.findAll('.agent-usage-row').find((row) => row.text().includes('书童'))
    expect(quickRow).toBeTruthy()
    const quickPreset = quickRow.findAll('select')[0]
    await quickPreset.setValue('DeepSeek')

    const loadButton = quickRow.findAll('button').find((button) => button.text().includes('加载模型'))
    expect(loadButton).toBeTruthy()
    await loadButton.trigger('click')
    await nextTick()

    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ presetName: 'DeepSeek' })
    }))

    const options = wrapper.findAll('.agent-narration-model-option')
    expect(options.map((option) => option.text())).toContain('narration-fast')

    await options.find((option) => option.text() === 'narration-fast').trigger('mousedown')
    await wrapper.find('.api-footer-button--primary').trigger('click')

        expect(actions.updateAgentModelConfig).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        modelUsageConfigs: expect.arrayContaining([
          expect.objectContaining({
            id: 'fast',
            presetName: 'DeepSeek',
            model: 'narration-fast'
          })
        ])
      })
    }))

    wrapper.unmount()
    global.fetch = originalFetch
  })
})
