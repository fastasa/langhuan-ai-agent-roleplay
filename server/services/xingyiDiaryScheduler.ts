// 星依聊天日记化归档 —— 05:00 逻辑日 + 08:00 网页活跃补生成协调器
//
// 本模块不自行 setInterval：08:00 网页未打开时不生成，等本地网页打开后补齐。
// 前端只报告“页面当前活跃”，服务端负责日期、幂等与补齐顺序。
import { settingRepository } from '../repositories/settingRepository.js'
import {
  generateXingyiDiaryMarkdown,
  writeXingyiDiaryFile,
  getLocalDateStr,
  XINGYI_DIARY_AUTO_READY_HOUR,
  XINGYI_DIARY_VIEWPOINT_CONFIG_KEY
} from './xingyiDiaryService.js'
import type { XingyiDiaryViewpoint } from './xingyiDiaryService.js'
import { logger } from '../logger.js'

// “上次自动生成成功到哪天了”的系统级游标。每生成成功一天就立刻推进；中途失败时，下次从失败日续跑。
// v2 不复用旧 00:00 自然日游标：两种游标虽然都是 YYYY-MM-DD，所代表的素材窗口不同。
// 首次启用 v2 时应重新生成最近一个成熟逻辑日并覆盖同名旧文件，补回切换日凌晨 00:00～04:59 的素材。
const AUTO_LAST_GENERATED_DATE_KEY = 'xingyi_diary_auto_last_generated_date_v2_0500'
const DATE_STR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface XingyiDiaryAutoGenerationResult {
  generatedDates: string[]
  latestReadyDateStr: string
}

let activeGenerationRun: Promise<XingyiDiaryAutoGenerationResult> | null = null

function parseYmd(dateStr: string): { year: number; month: number; day: number } | null {
  const match = DATE_STR_PATTERN.exec(String(dateStr || '').trim())
  if (!match) return null
  const [, yearStr, monthStr, dayStr] = match
  return { year: Number(yearStr), month: Number(monthStr), day: Number(dayStr) }
}

function formatYmd(year: number, month: number, day: number): string {
  return getLocalDateStr(new Date(year, month - 1, day))
}

function addDays(dateStr: string, days: number): string {
  const ymd = parseYmd(dateStr)
  if (!ymd) {
    throw new Error(`星依日记调度：非法日期格式 "${dateStr}"，需要 YYYY-MM-DD`)
  }
  return formatYmd(ymd.year, ymd.month, ymd.day + days)
}

/**
 * 当前最近一个“已经允许自动生成”的日记日期。
 * - 每个归档日到次日 05:00 才完整结束；
 * - 到次日 08:00 才进入可生成状态；
 * - 08:00 前检查时，最近可生成的是再前一天。
 */
export function resolveLatestReadyXingyiDiaryDateStr(now: Date): string {
  const daysBack = now.getHours() < XINGYI_DIARY_AUTO_READY_HOUR ? 2 : 1
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate() - daysBack)
}

/**
 * 纯函数：按日期顺序列出本次应补齐的全部日记。
 * 从未有自动游标时只从最近一个已到 08:00 的归档日开始，避免首次启用时臆测并回填无限历史；
 * 一旦有游标，离开网页期间缺失的日期全部按顺序补齐，不再像旧实现那样只补最近一天。
 */
export function resolveXingyiDiaryAutoTargets(now: Date, lastGeneratedDateStr: string): string[] {
  const latestReadyDateStr = resolveLatestReadyXingyiDiaryDateStr(now)
  const lastRaw = String(lastGeneratedDateStr || '').trim()
  const last = parseYmd(lastRaw) ? lastRaw : ''
  if (!last) return [latestReadyDateStr]
  if (last >= latestReadyDateStr) return []

  const targets: string[] = []
  let cursor = addDays(last, 1)
  while (cursor <= latestReadyDateStr) {
    targets.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return targets
}

function resolveViewpoint(): XingyiDiaryViewpoint {
  const row = settingRepository.getConfigValue(XINGYI_DIARY_VIEWPOINT_CONFIG_KEY)
  return row?.value === 'objective' ? 'objective' : 'xingyi'
}

async function runDueGeneration(now: Date): Promise<XingyiDiaryAutoGenerationResult> {
  const latestReadyDateStr = resolveLatestReadyXingyiDiaryDateStr(now)
  const lastRow = settingRepository.getConfigValue(AUTO_LAST_GENERATED_DATE_KEY, { scope: 'system' })
  const targets = resolveXingyiDiaryAutoTargets(now, lastRow?.value || '')
  const generatedDates: string[] = []

  for (const targetDateStr of targets) {
    const markdown = await generateXingyiDiaryMarkdown(targetDateStr, resolveViewpoint(), 'fullDay')
    writeXingyiDiaryFile(targetDateStr, markdown)
    // 每天成功后立即推进游标。若后续某天失败，下次从失败日继续，不重复消耗前面已经成功的日期。
    settingRepository.upsertConfigValue(AUTO_LAST_GENERATED_DATE_KEY, targetDateStr, { scope: 'system' })
    generatedDates.push(targetDateStr)
    logger.system(`[星依日记] 网页活跃补生成完成："${targetDateStr}"`)
  }

  return { generatedDates, latestReadyDateStr }
}

/**
 * 本地网页活跃检查的服务端入口。并发打开多个标签页时共享同一个运行 Promise，避免同一天重复调用模型。
 * 生成失败不吞错、不推进失败日游标，由路由返回明确失败；前端下一次活跃检查会继续重试。
 */
export function generateDueXingyiDiaries(now: Date = new Date()): Promise<XingyiDiaryAutoGenerationResult> {
  if (activeGenerationRun) return activeGenerationRun
  activeGenerationRun = runDueGeneration(now).finally(() => {
    activeGenerationRun = null
  })
  return activeGenerationRun
}
