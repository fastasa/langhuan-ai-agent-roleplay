import { describe, expect, it } from 'vitest'
import { MODEL_TASK_TIERS, buildTaskModelAiOptions } from '../../../src/utils/modelTaskTiers.ts'

// 输入框图片上传计划批2：imageCaption 任务档新增，映射校书 balanced 档（识图能力由 preset.supports_vision
// 决定，档位本身只决定用哪个槽位解析预设，不保证真识图）。
describe('modelTaskTiers imageCaption', () => {
  it('角色消息与旁白正文统一走执笔 message 档', () => {
    expect(MODEL_TASK_TIERS.roleMessage).toBe('message')
    expect(MODEL_TASK_TIERS.narrationMessage).toBe('message')
  })
  it('环世界文本专线走书童 fast 档，不改网页角色消息档', () => {
    expect(MODEL_TASK_TIERS.rimworldText).toBe('fast')
    expect(MODEL_TASK_TIERS.roleMessage).toBe('message')
  })
  it('动作输入的前置判断走关闭思考的书童 fast 档', () => {
    expect(MODEL_TASK_TIERS.focusedActionJudge).toBe('fast')
  })
  it('星依总 Agent 走掌阁 smart 档', () => {
    expect(MODEL_TASK_TIERS.xingyiAgent).toBe('smart')
  })
  it('MODEL_TASK_TIERS 表把 imageCaption 映射到 balanced（校书）档', () => {
    expect(MODEL_TASK_TIERS.imageCaption).toBe('balanced')
  })

  it('星依日记使用 balanced（校书）档，不依赖未设置的默认 API 预设', () => {
    expect(MODEL_TASK_TIERS.xingyiDiary).toBe('balanced')
  })

  it('buildTaskModelAiOptions 按 imageCaption 取档，覆写参数透传', () => {
    const agentConfig = {
      modelUsageConfigs: [
        { id: 'balanced', label: '均衡模型', presetName: 'Vision', model: 'vision-model', temperature: 0.6, effort: 'medium', maxTokens: 900, thinking: 'enabled' }
      ]
    }
    expect(buildTaskModelAiOptions(agentConfig, 'imageCaption', { temperature: 0.3, maxTokens: 512, thinking: 'disabled' })).toEqual({
      modelUsageSlotId: 'balanced',
      presetName: 'Vision',
      model: 'vision-model',
      temperature: 0.3,
      effort: 'medium',
      maxTokens: 512,
      thinking: 'disabled'
    })
  })
})
