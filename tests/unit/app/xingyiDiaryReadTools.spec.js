import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createListXingyiDiariesTool,
  createReadXingyiDiaryTool,
  createXingyiDiaryReadTools
} from '../../../src/app/xingyiDiaryReadTools.ts'

const FILES_URL = '/api/data/xingyi/diary/files'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

/** 按「METHOD URL」路由的 fetch mock；未声明的请求直接抛错（防测试静默漏路由）——同 xingyiChangelogTools.spec 口径。 */
function stubFetch(routes) {
  const mock = vi.fn(async (url, init = {}) => {
    const key = `${String(init.method || 'GET').toUpperCase()} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`unexpected fetch: ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('listXingyiDiaries（只读）', () => {
  it('有日记时列出全部日期并引导用 readXingyiDiary 精读', async () => {
    stubFetch({ [`GET ${FILES_URL}`]: jsonResponse({ dates: ['2026-07-17', '2026-07-16'] }) })
    const tool = createListXingyiDiariesTool()
    const result = await tool.execute({ args: {} }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('2026-07-17')
    expect(result.content).toContain('2026-07-16')
    expect(result.content).toContain('readXingyiDiary')
    expect(result.details).toEqual({ dateCount: 2, dates: ['2026-07-17', '2026-07-16'] })
  })

  it('归档为空时如实报空，不视为错误', async () => {
    stubFetch({ [`GET ${FILES_URL}`]: jsonResponse({ dates: [] }) })
    const tool = createListXingyiDiariesTool()
    const result = await tool.execute({ args: {} }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('空')
    expect(result.details).toEqual({ dateCount: 0 })
  })

  it('本机服务拒绝读取时如实透出错误', async () => {
    stubFetch({ [`GET ${FILES_URL}`]: jsonResponse({ error: '本机日记归档暂不可用' }, 503) })
    const tool = createListXingyiDiariesTool()
    const result = await tool.execute({ args: {} }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('本机日记归档暂不可用')
  })
})

describe('readXingyiDiary（只读）', () => {
  it('文件存在返回带日期标头的全文', async () => {
    stubFetch({
      [`GET ${FILES_URL}/2026-07-17`]: jsonResponse({ dateStr: '2026-07-17', markdown: '# 2026-07-17\n\n日记正文' })
    })
    const tool = createReadXingyiDiaryTool()
    const result = await tool.execute({ args: { dateStr: '2026-07-17' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('【星依日记·2026-07-17】')
    expect(result.content).toContain('日记正文')
  })

  it('404（没有那一天的日记）把服务端中文错误如实带回', async () => {
    stubFetch({
      [`GET ${FILES_URL}/2026-01-01`]: jsonResponse({ error: '没有 2026-01-01 这一天的日记文件' }, 404)
    })
    const tool = createReadXingyiDiaryTool()
    const result = await tool.execute({ args: { dateStr: '2026-01-01' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('没有 2026-01-01 这一天的日记文件')
  })

  it('validateArgs：缺失或非 YYYY-MM-DD 的 dateStr 在发请求前就拦下', () => {
    const tool = createReadXingyiDiaryTool()
    expect(tool.validateArgs({})).toContain('缺少 dateStr')
    expect(tool.validateArgs({ dateStr: '2026-7-17' })).toContain('不合法')
    expect(tool.validateArgs({ dateStr: '../etc' })).toContain('不合法')
    expect(tool.validateArgs({ dateStr: '2026-07-17' })).toBeNull()
  })
})

describe('createXingyiDiaryReadTools', () => {
  it('一把装配 list+read 两件，名字与 harness 装配口径一致', () => {
    const tools = createXingyiDiaryReadTools()
    expect(tools.map((tool) => tool.name)).toEqual(['listXingyiDiaries', 'readXingyiDiary'])
  })

  it('模型可见的工具说明使用中性用户称谓，不注入私人亲属关系', () => {
    const tools = createXingyiDiaryReadTools()
    expect(tools[0].brief).toContain('当前本地工作区')
    expect(tools[1].brief).toContain('本地工作区')
  })
})
