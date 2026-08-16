import { describe, expect, it } from 'vitest'
import {
  findChatSummaryRecordById,
  getChatSessionBoundAlias,
  getChatSessionLoadedSummaryIds,
  getChatStoreLoadedSummaryRecords,
  getChatSessionVirtualScene,
  getChatStoreCurrentSession
} from '../../../src/repositories/chatRepository.ts'

describe('chat repository compatibility accessors', () => {
  it('统一读取当前会话', () => {
    const session = { id: 'session_1', target_id: 'char_1' }
    const chatStore = {
      current: {
        currentSession: { value: session }
      }
    }

    expect(getChatStoreCurrentSession(chatStore)).toBe(session)
  })

  it('统一解析会话中的已加载总结字段', () => {
    expect(getChatSessionLoadedSummaryIds({
      loadedSummaryIds: ['s1', 's2']
    })).toEqual(['s1', 's2'])

    expect(getChatSessionLoadedSummaryIds({
      loaded_summary_ids: '["s3","s4"]'
    })).toEqual(['s3', 's4'])
  })

  it('统一解析旧字段风格的场景和别名信息', () => {
    expect(getChatSessionVirtualScene({
      virtual_scene_name: '旧场景',
      virtual_scene_desc: '旧描述',
      virtual_location_large: '德文郡',
      virtual_location_middle: '旧宅',
      virtual_location_small: '书房',
      virtual_time: '旧时间',
      virtual_weather: '雨',
      virtual_weather_mode: 'custom'
    })).toEqual(expect.objectContaining({
      virtualSceneName: '旧场景',
      virtualSceneDesc: '旧描述',
      virtualLocationLarge: '德文郡',
      virtualLocationMiddle: '旧宅',
      virtualLocationSmall: '书房',
      virtualLocation: '德文郡 / 旧宅 / 书房',
      virtualTime: '旧时间',
      virtualWeather: '雨',
      virtualWeatherMode: 'custom'
    }))

    expect(getChatSessionBoundAlias({
      bound_alias: 'alias_1'
    })).toBe('alias_1')
  })

  it('优先通过统一归一化后的会话字段读取兼容值', () => {
    const session = {
      id: 'session_2',
      target_id: 'char_2',
      loaded_summary_ids: '["s8"]',
      virtual_scene_name: '归一化场景',
      virtual_location_large: '伦敦',
      virtual_location_middle: '西区',
      virtual_location_small: '图书馆',
      bound_alias: 'alias_2'
    }

    expect(getChatSessionLoadedSummaryIds(session)).toEqual(['s8'])
    expect(getChatSessionVirtualScene(session)).toEqual(expect.objectContaining({
      virtualSceneName: '归一化场景',
      virtualLocation: '伦敦 / 西区 / 图书馆'
    }))
    expect(getChatSessionBoundAlias(session)).toBe('alias_2')
  })

  it('统一按总结 id 读取不同总结容器', () => {
    const chatStore = {
      summaries: {
        smallSummaries: { value: [{ id: 's1', name: '小结一', content: '甲' }] },
        bigSummaries: { value: [{ id: 'b1', name: '大结一', content: '乙' }] },
        summaryLibrary: { value: [{ id: 'l1', title: '旧记忆', content: '丙' }] }
      }
    }

    expect(findChatSummaryRecordById(chatStore, 's1')).toEqual({
      id: 's1',
      name: '小结一',
      content: '甲',
      kind: 'small'
    })
    expect(findChatSummaryRecordById(chatStore, 'b1')).toEqual({
      id: 'b1',
      name: '大结一',
      content: '乙',
      kind: 'big'
    })
    expect(findChatSummaryRecordById(chatStore, 'l1')).toEqual({
      id: 'l1',
      name: '旧记忆',
      content: '丙',
      kind: 'legacy'
    })
  })

  it('统一按当前会话返回已加载总结记录列表', () => {
    const chatStore = {
      current: {
        currentSession: {
          value: {
            id: 'session_3',
            target_id: 'char_3',
            loaded_summary_ids: '["s1","missing"]'
          }
        }
      },
      summaries: {
        smallSummaries: { value: [{ id: 's1', name: '小结一', content: '甲' }] },
        bigSummaries: { value: [] },
        summaryLibrary: { value: [] }
      }
    }

    expect(getChatStoreLoadedSummaryRecords(chatStore)).toEqual([
      {
        id: 's1',
        name: '小结一',
        content: '甲',
        kind: 'small'
      },
      {
        id: 'missing',
        name: 'missing',
        content: '',
        kind: 'legacy'
      }
    ])
  })
})
