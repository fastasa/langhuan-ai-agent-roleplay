import { describe, expect, it } from 'vitest'
import { createSettingAppService } from '../../../server/application/setting/settingAppService'

function makeRepo() {
  const store = new Map()
  return {
    getConfigValue: (key, options = {}) => {
      const scope = options.scope || 'legacy'
      const value = store.get(`${scope}:${key}`) ?? store.get(key)
      return value === undefined ? undefined : { value }
    },
    getConfigValueAnyScope: (key) => {
      for (const scope of ['system', 'user', 'legacy']) {
        const value = store.get(`${scope}:${key}`)
        if (value !== undefined) return { value }
      }
      return undefined
    },
    getEffectiveConfigValue: (key) => {
      for (const scope of ['user', 'system', 'legacy']) {
        const value = store.get(`${scope}:${key}`)
        if (value !== undefined) return { value }
      }
      return undefined
    },
    upsertConfigValue: (key, value, options = {}) => {
      store.set(`${options.scope || 'legacy'}:${key}`, String(value))
    }
  }
}

describe('settingAppService 本地编排配置', () => {
  it('未保存时返回 null', () => {
    const service = createSettingAppService(makeRepo())
    expect(service.getReplyPlanOrchestratorConfig()).toBeNull()
    expect(service.getEffectiveReplyPlanOrchestratorConfig()).toBeNull()
  })

  it('本地工作区可以直接保存和读取配置', () => {
    const service = createSettingAppService(makeRepo())
    const result = service.updateReplyPlanOrchestratorConfig({
      systemPrompt: '先检查上下文，再生成回复计划。',
      scenarios: [{ code: 'joy', label: '喜悦', trigger: '轻松互动', body: '保持自然。' }],
      tools: []
    })

    expect(result.ok).toBe(true)
    expect(service.getReplyPlanOrchestratorConfig().scenarios).toEqual([
      expect.objectContaining({ code: 'joy' })
    ])
  })

  it('有效配置读取使用已保存的本地配置', () => {
    const repo = makeRepo()
    const service = createSettingAppService(repo)
    service.updateReplyPlanOrchestratorConfig({
      systemPrompt: '本地规则',
      scenarios: [{ code: 'pressure', label: '压力', trigger: '出现压力', body: '先识别来源。' }],
      tools: []
    })

    expect(service.getEffectiveReplyPlanOrchestratorConfig().scenarios).toEqual([
      expect.objectContaining({ code: 'pressure' })
    ])
  })
})
