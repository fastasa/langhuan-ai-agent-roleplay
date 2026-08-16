/**
 * 星依读日记工具两件（2026-07-18 星依读日记批次·画布节点 429d2610ba85562f）——「列日记目录 + 读单篇」，全只读。
 *
 * 需求语义（用户原话）：让星依能读到用户的日记文件——她觉得有需要的时候可以读，不要每次都读；
 * 让文件的名字和含义暴露在星依的视野范围内，当她觉得用户在闲聊时可以试着读取一下。
 * 落法：不往每轮 system/context 塞日记内容，只把「日记是什么、什么时候该读」写进工具 brief
 * （星依是 toolsearch 型 loop，工具目录 brief 恒在她视野内），读不读由模型自己判断。
 *
 * 自包含：工具内部直接 fetch 本机日记只读端点
 * （GET /api/data/xingyi/diary/files[/：dateStr]）。
 * 装配边界：只在 harness 的 diary 接缝在场时进池。
 * 数据真值：docs/diary/YYYY-MM-DD.md（星依日记功能每天生成，见 xingyiDiaryService.ts）。
 */

import { API } from '../config/api'
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'

const DATE_STR_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 日记端点 JSON 请求统一收口，非 2xx 如实返回本地服务错误。 */
async function fetchDiaryJson<T>(input: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`请求星依日记归档失败：${message}`)
  }
  const payload = await response.json().catch(() => null) as ({ error?: string } | null)
  if (!response.ok) {
    throw new Error(String(payload?.error || `请求星依日记归档失败（HTTP ${response.status}）`))
  }
  return payload as T
}

function runFailureResult(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

/** 工具1：列日记归档目录（只读）。 */
export function createListXingyiDiariesTool(): ToolDefinition {
  return {
    name: 'listXingyiDiaries',
    brief: '列出本地星依日记归档目录（只读）：docs/diary/ 下每天一篇、以日期命名，是当前本地工作区对话的回顾。当用户在闲聊、回忆往事、问“最近聊了什么”“某天发生了什么”时，可以先列目录再挑日期精读；做具体任务时不需要每轮都读。',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        const data = await fetchDiaryJson<{ dates?: string[] }>(API.XINGYI_DIARY_FILES)
        const dates = Array.isArray(data.dates) ? data.dates.filter((item) => DATE_STR_PATTERN.test(String(item || ''))) : []
        if (!dates.length) {
          return { content: '日记归档目前是空的：docs/diary/ 里还没有生成过任何日记。', details: { dateCount: 0 } }
        }
        return {
          content: [
            `日记归档共 ${dates.length} 篇（新→旧）：`,
            dates.map((dateStr) => `- ${dateStr}`).join('\n'),
            '想看某一天的内容时，调用 readXingyiDiary 并传入对应日期。'
          ].join('\n\n'),
          details: { dateCount: dates.length, dates }
        }
      } catch (error) {
        return runFailureResult('列星依日记目录', error)
      }
    }
  }
}

/** 工具2：读某一天的日记全文（只读）。 */
export function createReadXingyiDiaryTool(): ToolDefinition {
  return {
    name: 'readXingyiDiary',
    brief: '读取本地工作区某一天的星依日记全文（只读）：传入 YYYY-MM-DD。闲聊或回忆语境下想参考当天聊过什么、发生过什么时使用；日期拿不准先用 listXingyiDiaries 看目录。',
    schema: {
      type: 'object',
      properties: {
        dateStr: { type: 'string', description: '要读的日记日期，格式 YYYY-MM-DD（如 2026-07-17）。' }
      },
      required: ['dateStr']
    },
    validateArgs: (args) => {
      const dateStr = String(args.dateStr || '').trim()
      if (!dateStr) return 'readXingyiDiary 缺少 dateStr'
      if (!DATE_STR_PATTERN.test(dateStr)) return `dateStr「${dateStr}」不合法，必须是 YYYY-MM-DD 格式（如 2026-07-17）`
      return null
    },
    execute: async (toolCall) => {
      const dateStr = String(toolCall.args.dateStr || '').trim()
      try {
        const data = await fetchDiaryJson<{ dateStr?: string; markdown?: string }>(API.xingyiDiaryFile(dateStr))
        return {
          content: [`【星依日记·${dateStr}】`, String(data.markdown || '').trim() || '（这一天的日记是空的）'].join('\n\n'),
          details: { dateStr }
        }
      } catch (error) {
        return runFailureResult(`读 ${dateStr} 的星依日记`, error)
      }
    }
  }
}

/** 读日记两件套：harness 在 diary 接缝在场时一把装配。 */
export function createXingyiDiaryReadTools(): ToolDefinition[] {
  return [
    createListXingyiDiariesTool(),
    createReadXingyiDiaryTool()
  ]
}
