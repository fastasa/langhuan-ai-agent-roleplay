import type { RimWorldPawnSnapshotV1 } from '../../../shared/rimworldBridge'
import { buildRimWorldAbilitySummary } from './rimWorldAbilitySummary'

function percent(value: number | null): string {
  return value === null ? '' : `${Math.round(value * 100)}%`
}

function trimSentenceEnd(value: string): string {
  return value.replace(/[。.!！?？]+$/g, '').trim()
}

/**
 * 把游戏协议切片翻译成角色能理解的生活事实。技术引用和 defName 永不进入正文提示词。
 */
export function renderRimWorldPawnContext(
  snapshot: RimWorldPawnSnapshotV1,
  options: { userMessage?: string } = {}
): string[] {
  const lines: string[] = []
  const time = snapshot.gameTime.label.trim()
  if (time) lines.push(`现在是${time}。`)
  if (snapshot.current.job) lines.push(`你现在正在${trimSentenceEnd(snapshot.current.job)}。`)
  if (snapshot.current.location) {
    lines.push(`你当前所在的据点或地图地点名叫“${snapshot.current.location}”。这是地点名称，不表示你位于地球上的同名国家或行政区。`)
  }

  const condition = [
    snapshot.current.health ? `健康状况：${snapshot.current.health}` : '',
    snapshot.current.mood === null ? '' : `心情：${percent(snapshot.current.mood)}`
  ].filter(Boolean)
  if (condition.length) lines.push(condition.join('；'))

  const needs = snapshot.current.needs
    .slice()
    .sort((a, b) => a.level - b.level)
    .slice(0, 5)
    .map((item) => `${item.label}${percent(item.level)}`)
  if (needs.length) lines.push(`眼下的身体感受：${needs.join('、')}。`)

  lines.push(...buildRimWorldAbilitySummary(snapshot, { userMessage: options.userMessage }))

  const work = snapshot.workTypes
    .filter((item) => !item.disabled && item.priority !== null && item.priority > 0)
    .sort((a, b) => Number(a.priority) - Number(b.priority) || a.label.localeCompare(b.label))
    .slice(0, 12)
    .map((item) => `${item.label}优先级${item.priority}`)
  if (work.length) lines.push(`你目前被安排的工作：${work.join('、')}。数字越小，越应该优先处理。`)

  return lines
}
