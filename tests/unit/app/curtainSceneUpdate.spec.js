import { describe, expect, it } from 'vitest'
import {
  prepareCurtainSceneUpdate,
  sanitizeCurtainLocationPart
} from '../../../src/app/curtainSceneUpdate.ts'

describe('curtainSceneUpdate（帷幕修改单一准备真值）', () => {
  it('同时生成开场时间、三段地点与旧精确要素退出 patch', () => {
    const result = prepareCurtainSceneUpdate({
      session: {
        virtualTime: '旧时间',
        virtualLocationLarge: '旧大陆',
        virtualLocationMiddle: '旧城',
        virtualLocationSmall: '旧街',
        virtualLocation: '旧大陆 / 旧城 / 旧街',
        virtualLocationFeatureId: 'feature_old'
      },
      toolCall: {
        tool: 'updateCurtainScene',
        targetTime: '霜月初七，黄昏将尽',
        locationLarge: '博瑞利尔王国',
        locationMiddle: '博瑞利尔城',
        locationSmall: '北门广场',
        reason: '设置故事开场'
      },
      now: 1_720_000_000_000
    })

    expect(result.changed).toBe(true)
    expect(result.patch).toMatchObject({
      virtualTime: '霜月初七，黄昏将尽',
      virtualTimeBase: 0,
      virtualLocationLarge: '博瑞利尔王国',
      virtualLocationMiddle: '博瑞利尔城',
      virtualLocationSmall: '北门广场',
      virtualLocation: '博瑞利尔王国 / 博瑞利尔城 / 北门广场',
      virtualLocationFeatureId: ''
    })
    expect(result.notice).toContain('当前会话帷幕已更新')
    expect(result.notice).toContain('设置故事开场')
  })

  it('相同地点不制造假写入，描写句与方位姿态仍被拒绝', () => {
    const session = {
      virtualLocationLarge: '博瑞利尔王国',
      virtualLocationMiddle: '博瑞利尔城',
      virtualLocationSmall: '北门广场',
      virtualLocation: '博瑞利尔王国 / 博瑞利尔城 / 北门广场'
    }
    const result = prepareCurtainSceneUpdate({
      session,
      toolCall: {
        tool: 'updateCurtainScene',
        locationLarge: '博瑞利尔王国',
        locationMiddle: '博瑞利尔城',
        locationSmall: '北门广场'
      },
      now: 1_720_000_000_000
    })

    expect(result.changed).toBe(false)
    expect(result.patch).toEqual({})
    expect(sanitizeCurtainLocationPart('说不清的凉意，像暮色')).toBe('')
    expect(sanitizeCurtainLocationPart('她的怀里')).toBe('')
  })
})
