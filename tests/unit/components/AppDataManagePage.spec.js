/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppDataManagePage from '../../../src/components/app/pages/AppDataManagePage.vue'

function successPayload() {
  return {
    summary: {
      activityCount: 1,
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      averageTokens: 200,
      userCount: 1
    },
    items: [{
      id: 'usage_1',
      created_at: '2026-05-15T03:20:00.000Z',
      user_id: 'user_1',
      user_email: 'user@example.com',
      user_display_name: '用户',
      session_id: 'session_1',
      session_label: '星依主线',
      round_id: 'round:session_1:12',
      session_round_index: 3,
      usage_label: '角色发言：星依',
      place_label: '会话：星依主线',
      feature: 'chat',
      preset_name: '琅嬛预设',
      model: 'glm-5.1',
      input_tokens: 120,
      output_tokens: 80,
      status: 'success'
    }],
    sessions: [{
      session_id: 'session_1',
      session_label: '星依主线',
      activity_count: 1,
      total_tokens: 200
    }]
  }
}

function repeatedRoundPayload() {
  return {
    summary: {
      activityCount: 4,
      inputTokens: 380,
      outputTokens: 180,
      totalTokens: 560,
      averageTokens: 140,
      userCount: 1
    },
    items: [
      {
        id: 'usage_run_2_role',
        created_at: '2026-05-19T06:29:19.000Z',
        user_id: 'user_1',
        session_id: 'session_1',
        session_label: '薇尔莉特',
        round_id: 'round:session_1:2282',
        session_round_index: 9,
        unit_kind: 'regenerate',
        usage_label: '重新生成：薇尔莉特',
        place_label: '会话：薇尔莉特',
        feature: 'role_message',
        model: 'glm-5.1',
        input_tokens: 200,
        output_tokens: 100,
        status: 'success'
      },
      {
        id: 'usage_run_2_start',
        created_at: '2026-05-19T06:28:57.000Z',
        user_id: 'user_1',
        session_id: 'session_1',
        session_label: '薇尔莉特',
        round_id: 'round:session_1:2282',
        session_round_index: 9,
        usage_label: '用户输入时间地点快判',
        place_label: '用户输入环境快判',
        feature: 'narration_debug',
        model: 'deepseek-v4-flash',
        input_tokens: 40,
        output_tokens: 1,
        status: 'success'
      },
      {
        id: 'usage_run_1_role',
        created_at: '2026-05-19T01:58:42.000Z',
        user_id: 'user_1',
        session_id: 'session_1',
        session_label: '薇尔莉特',
        round_id: 'round:session_1:2282',
        session_round_index: 9,
        usage_label: '角色发言：薇尔莉特',
        place_label: '会话：薇尔莉特',
        feature: 'role_message',
        model: 'glm-5.1',
        input_tokens: 100,
        output_tokens: 78,
        status: 'success'
      },
      {
        id: 'usage_run_1_start',
        created_at: '2026-05-19T01:58:26.000Z',
        user_id: 'user_1',
        session_id: 'session_1',
        session_label: '薇尔莉特',
        round_id: 'round:session_1:2282',
        session_round_index: 9,
        usage_label: '用户输入时间地点快判',
        place_label: '用户输入环境快判',
        feature: 'narration_debug',
        model: 'deepseek-v4-flash',
        input_tokens: 40,
        output_tokens: 1,
        status: 'success'
      }
    ],
    sessions: [{
      session_id: 'session_1',
      session_label: '薇尔莉特',
      activity_count: 4,
      total_tokens: 560
    }]
  }
}

async function mountPage(fetchImpl = vi.fn(async () => ({
  ok: true,
  json: async () => successPayload()
}))) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.stubGlobal('fetch', fetchImpl)
  const wrapper = mount(AppDataManagePage, {
    global: { plugins: [pinia] }
  })
  await vi.waitFor(() => {
    expect(fetchImpl).toHaveBeenCalled()
  })
  await wrapper.vm.$nextTick()
  return { wrapper, fetchImpl }
}

describe('AppDataManagePage server ledger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads server ai usage ledger and renders summary rows', async () => {
    const { wrapper, fetchImpl } = await mountPage()

    expect(fetchImpl.mock.calls[0][0]).toContain('/api/data/ai-usage?range=today')
    expect(wrapper.text()).toContain('200')
    expect(wrapper.text()).toContain('第 3 轮')
    expect(wrapper.text()).toContain('星依主线')
    expect(wrapper.text()).not.toContain('session_1')
    expect(wrapper.text()).not.toContain('round:session_1:12')

    await wrapper.find('.data-manage-page__round-toggle').trigger('click')
    expect(wrapper.text()).toContain('角色发言：星依')
    expect(wrapper.text()).toContain('角色消息')
    expect(wrapper.text()).toContain('成功')

    wrapper.unmount()
  })

  // 缓存可见性（2026-07-07）：明细表「缓存命中」列要带百分比（相对该行 inputTokens），非订阅桥行显示占位符。
  it('shows cache hit tokens with percentage for bridge rows, and a placeholder for rows without cache data', async () => {
    const { wrapper } = await mountPage(vi.fn(async () => ({
      ok: true,
      json: async () => ({
        summary: { activityCount: 2, inputTokens: 70120, outputTokens: 6580, totalTokens: 76700, averageTokens: 38350, userCount: 1 },
        items: [
          {
            id: 'usage_bridge',
            created_at: '2026-07-07T13:21:25.000Z',
            user_id: 'user_1',
            session_id: 'session_1',
            session_label: '陈星依',
            round_id: 'round:session_1:5791',
            session_round_index: 7,
            unit_kind: 'round',
            usage_label: 'group-director-pass',
            place_label: '陈星依',
            feature: 'agent',
            model: 'opus',
            input_tokens: 70000,
            output_tokens: 6500,
            cache_read_tokens: 56000,
            cache_creation_tokens: 4000,
            status: 'success'
          },
          {
            id: 'usage_plain',
            created_at: '2026-07-07T13:22:00.000Z',
            user_id: 'user_1',
            session_id: 'session_1',
            session_label: '陈星依',
            round_id: 'round:session_1:5791',
            session_round_index: 7,
            unit_kind: 'round',
            usage_label: '角色发言：星依',
            place_label: '会话：陈星依',
            feature: 'role_message',
            model: 'glm-5.1',
            input_tokens: 120,
            output_tokens: 80,
            status: 'success'
          }
        ],
        sessions: [{ session_id: 'session_1', session_label: '陈星依', activity_count: 2, total_tokens: 76700 }]
      })
    })))

    await wrapper.find('.data-manage-page__round-toggle').trigger('click')
    expect(wrapper.text()).toContain('命中56,000（80%）')
    expect(wrapper.text()).toContain('新建4,000')
    // 没有缓存数据的普通行：显示占位符，不显示 0/0。
    const cells = wrapper.findAll('.data-manage-page__detail-table tbody tr').at(1).findAll('td')
    expect(cells.at(7).text()).toBe('—')

    wrapper.unmount()
  })

  it('reloads with feature and status query params when filters change', async () => {
    const { wrapper, fetchImpl } = await mountPage()

    await wrapper.findAll('.data-manage-page__segmented--wrap button')
      .find((button) => button.text() === 'Agent')
      .trigger('click')
    await vi.waitFor(() => {
      expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('feature=agent'))).toBe(true)
    })

    await wrapper.findAll('[aria-label="状态"] button')
      .find((button) => button.text() === '失败')
      .trigger('click')
    await vi.waitFor(() => {
      const urls = fetchImpl.mock.calls.map((call) => String(call[0]))
      expect(urls.some((url) => url.includes('feature=agent') && url.includes('status=failed'))).toBe(true)
    })

    await wrapper.find('[aria-label="会话筛选"]').setValue('session_1')
    await vi.waitFor(() => {
      expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes('sessionId=session_1'))).toBe(true)
    })

    wrapper.unmount()
  })

  it('shows error state when ledger request fails', async () => {
    const { wrapper } = await mountPage(vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'server down'
    })))

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('读取 AI 消耗台账失败')
    })

    wrapper.unmount()
  })

  // 2026-07-07 用户拍板口径：同轮返工（重生成/纠偏/精修）并入原轮总消耗，一组看全；
  // 旧「时间差拆第 N 次生成」启发式退役，返工语义由 unit_kind 标注。
  it('merges rework rows of the same round into one total group and names the rework kinds', async () => {
    const { wrapper } = await mountPage(vi.fn(async () => ({
      ok: true,
      json: async () => repeatedRoundPayload()
    })))

    const rows = wrapper.findAll('.data-manage-page__round-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('第 9 轮 · 含重生成')
    expect(rows[0].text()).toContain('560')

    await wrapper.find('.data-manage-page__round-toggle').trigger('click')
    expect(wrapper.text()).toContain('重生成')
    expect(wrapper.text()).toContain('重新生成：薇尔莉特')

    wrapper.unmount()
  })

  it('groups op unit rows (batch projection) into one operation group', async () => {
    const { wrapper } = await mountPage(vi.fn(async () => ({
      ok: true,
      json: async () => ({
        summary: { activityCount: 2, inputTokens: 90, outputTokens: 30, totalTokens: 120, averageTokens: 60, userCount: 1 },
        items: [
          {
            id: 'usage_proj_1',
            created_at: '2026-07-07T02:00:01.000Z',
            user_id: 'user_1',
            session_id: 'session_1',
            session_label: '薇尔莉特',
            round_id: 'op:batch_projection:session_1:abc123',
            session_round_index: 0,
            unit_kind: 'batch_projection',
            usage_label: '消息投影：#12',
            place_label: '薇尔莉特',
            feature: 'agent',
            model: 'glm-5.1',
            input_tokens: 50,
            output_tokens: 20,
            status: 'success'
          },
          {
            id: 'usage_proj_2',
            created_at: '2026-07-07T02:00:05.000Z',
            user_id: 'user_1',
            session_id: 'session_1',
            session_label: '薇尔莉特',
            round_id: 'op:batch_projection:session_1:abc123',
            session_round_index: 0,
            unit_kind: 'batch_projection',
            usage_label: '消息投影：#14',
            place_label: '薇尔莉特',
            feature: 'agent',
            model: 'glm-5.1',
            input_tokens: 40,
            output_tokens: 10,
            status: 'success'
          }
        ],
        sessions: [{ session_id: 'session_1', session_label: '薇尔莉特', activity_count: 2, total_tokens: 120 }]
      })
    })))

    const rows = wrapper.findAll('.data-manage-page__round-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('批量投影')
    expect(rows[0].text()).toContain('120')
    expect(rows[0].text()).not.toContain('轮次')

    wrapper.unmount()
  })
})
