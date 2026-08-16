import { buildTaskTimelineNodes } from '../../utils/taskTimeline'
import type { TimerMark } from '../../types'

export function useTaskTimelineHelpers({
  taskStore,
  customTags
}: any) {
  function getTaskTimelineDuration(task: any) {
    const marks = Array.isArray(task?.timerState?.marks) ? task.timerState.marks : []
    const lastMarkTime = marks.reduce((max: number, mark: any) => Math.max(max, Number(mark?.time) || 0), 0)
    const storeElapsed = task?.id ? taskStore.getTaskElapsedTime(task.id) : 0
    return Math.max(storeElapsed || 0, Number(task?.timerState?.accumulatedTime) || 0, lastMarkTime)
  }

  function hasTaskTimeline(task: any) {
    if (!task?.timerState) return false
    return getTaskTimelineDuration(task) > 0 || (task.timerState.marks?.length || 0) > 0
  }

  function getTaskTimelineNodes(task: any) {
    const tagList = Array.isArray(customTags?.value) ? customTags.value : []
    const colorByTagId = new Map<string, string>(tagList.map((tag: any) => [String(tag.id), String(tag.color || '')]))
    const colorByTagName = new Map<string, string>(tagList.map((tag: any) => [String(tag.name), String(tag.color || '')]))
    return buildTaskTimelineNodes(task, getTaskTimelineDuration(task), {
      resolveMarkColor(mark: TimerMark): string | undefined {
        const byId = mark?.tagId ? colorByTagId.get(String(mark.tagId)) : undefined
        if (byId) return byId
        const byName = mark?.type ? colorByTagName.get(String(mark.type)) : undefined
        return byName
      }
    })
  }

  return {
    getTaskTimelineDuration,
    hasTaskTimeline,
    getTaskTimelineNodes
  }
}
