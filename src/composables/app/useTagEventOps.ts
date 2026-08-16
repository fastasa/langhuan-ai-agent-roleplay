import {
  createCustomTagRecord,
  createEventStackRecord,
  deleteCustomTagRecord,
  fetchCustomTags,
  fetchEventStackToday,
  updateCustomTagRecord
} from '../../repositories/metaRepository'

export function useTagEventOps({
  API,
  customTags,
  newTagName,
  newTagColor,
  editingTagId,
  eventStack,
  eventStackSummary,
  taskStore,
  buildEventTimelinePayload,
  settingStore,
  openConfirmDialog,
  toast
}: any) {
  void API

  function emitEventStackUpdated(date: string) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('event-stack-updated', { detail: { date } }))
  }

  function getLocalDateKey(input: string | number | Date = new Date()) {
    const date = input instanceof Date ? input : new Date(input)
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}`
  }

  async function loadCustomTags() {
    try {
      customTags.value = await fetchCustomTags()
    } catch (e) {
      console.error('加载自定义标签失败:', e)
    }
  }

  async function saveCustomTag() {
    if (!newTagName.value.trim()) {
      toast('请输入标签名', 'error')
      return
    }
    const currentEditingId = editingTagId.value
    const tag = {
      id: currentEditingId || `tag_${Date.now()}`,
      name: newTagName.value.trim(),
      color: newTagColor.value
    }
    try {
      if (currentEditingId) {
        await updateCustomTagRecord(currentEditingId, { name: tag.name, color: tag.color })
      } else {
        await createCustomTagRecord(tag)
      }
      await loadCustomTags()
      newTagName.value = ''
      newTagColor.value = '#8b7355'
      editingTagId.value = null
      toast(currentEditingId ? '标签已更新' : '标签已添加', 'success')
    } catch (e) {
      toast('保存标签失败', 'error')
    }
  }

  async function deleteCustomTag(id: string) {
    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('删除标签', '确定删除这个标签吗？', () => {
        void deleteCustomTagConfirmed(id)
      })
      return
    }
    await deleteCustomTagConfirmed(id)
  }

  async function deleteCustomTagConfirmed(id: string) {
    try {
      await deleteCustomTagRecord(id)
      await loadCustomTags()
      toast('标签已删除', 'success')
    } catch (e) {
      toast('删除标签失败', 'error')
    }
  }

  function editCustomTag(tag: any) {
    newTagName.value = tag.name
    newTagColor.value = tag.color
    editingTagId.value = tag.id
  }

  async function loadEventStack(date?: string) {
    try {
      const data = await fetchEventStackToday(date)
      eventStack.value = data.events || []
      eventStackSummary.value = data.summary || { totalPoints: 0, totalMoney: 0, ticketChanges: {} }
    } catch (e) {
      console.error('加载事栈失败:', e)
    }
  }

  async function addToEventStack(task: any, pointsDelta = 0, moneyDelta = 0, ticketsUsed = {}, ticketsExchanged = {}) {
    const now = new Date()
    const elapsed = taskStore.getTaskElapsedTime(task.id)
    const durationSeconds = Math.floor(elapsed / 1000)
    const tagList = Array.isArray(customTags.value) ? customTags.value : []
    const colorByTagId = new Map(tagList.map((tag: any) => [String(tag.id), String(tag.color || '')]))
    const colorByTagName = new Map(tagList.map((tag: any) => [String(tag.name), String(tag.color || '')]))
    const timelineJson = buildEventTimelinePayload(task, elapsed, {
      resolveMarkColor(mark: any) {
        const byId = mark?.tagId ? colorByTagId.get(String(mark.tagId)) : ''
        if (byId) return byId
        const byName = mark?.type ? colorByTagName.get(String(mark.type)) : ''
        return byName || undefined
      }
    })
    const assignerName = task.assignerName || task.assigner_name || task.from || ''
    const publishNote = task.publishNote || task.publish_note || ''
    const completionNote = task.completionNote || task.completion_note || ''
    const taskDescription = task.description || task.desc || ''
    const taskResult = task.status === 'failed' ? '失败' : '完成'

    let timeAxis = `总耗时：${Math.floor(durationSeconds / 60)}分钟`
    if (task.timerState?.marks?.length > 0) {
      const marks = task.timerState.marks
      const tagTimes: Record<string, { start: number, end: number }> = {}
      for (const mark of marks) {
        if (mark.isStart) {
          if (!tagTimes[mark.type]) tagTimes[mark.type] = { start: mark.time, end: mark.time }
        } else if (tagTimes[mark.type]) {
          tagTimes[mark.type].end = mark.time
        }
      }
      const axisParts: string[] = []
      for (const [type, times] of Object.entries(tagTimes)) {
        const duration = Math.floor((times.end - times.start) / 1000 / 60)
        if (duration > 0) {
          axisParts.push(`${type}：${Math.floor(times.start / 1000 / 60)}分钟-${Math.floor(times.end / 1000 / 60)}分钟（共${duration}分钟）`)
        }
      }
      if (axisParts.length > 0) {
        timeAxis += '\n' + axisParts.join('\n')
      }
    }

    const event = {
      id: `event_${Date.now()}`,
      date: getLocalDateKey(now),
      taskId: task.id,
      taskName: task.title || task.name,
      taskType: task.type,
      status: task.status || 'done',
      expReward: task.expReward || 0,
      durationSeconds,
      timeAxis,
      notes: [
        `结果：${taskResult}`,
        assignerName ? `发布人：${assignerName}` : '',
        publishNote ? `发布备注：${publishNote}` : '',
        completionNote ? `${task.status === 'failed' ? '失败备注' : '完成备注'}：${completionNote}` : '',
        taskDescription ? `任务描述：${taskDescription}` : ''
      ].filter(Boolean).join('\n'),
      ticketsUsed,
      ticketsExchanged,
      pointsDelta,
      moneyDelta,
      realLocation: settingStore.currentLocation || '',
      realWeather: settingStore.currentWeather || '',
      realTime: settingStore.currentTime || '',
      timelineJson
    }

    try {
      await createEventStackRecord(event)
      emitEventStackUpdated(event.date)
      await loadEventStack()
    } catch (e) {
      console.error('添加到事栈失败:', e)
    }
  }

  async function addResourceEventToStack({
    title,
    notes = '',
    pointsDelta = 0,
    moneyDelta = 0,
    ticketsUsed = {},
    ticketsExchanged = {},
    timeBlocks = null,
    date
  }: any) {
    const now = new Date()
    const event = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: date || getLocalDateKey(now),
      taskId: '',
      taskName: title || '资源变动',
      taskType: 'resource',
      status: '',
      expReward: 0,
      durationSeconds: 0,
      timeAxis: '',
      notes,
      ticketsUsed,
      ticketsExchanged,
      pointsDelta,
      moneyDelta,
      timeBlocks,
      realLocation: settingStore.currentLocation || '',
      realWeather: settingStore.currentWeather || '',
      realTime: settingStore.currentTime || '',
      timelineJson: []
    }

    try {
      await createEventStackRecord(event)
      emitEventStackUpdated(event.date)
      await loadEventStack()
    } catch (e) {
      console.error('添加资源变动到事栈失败:', e)
    }
  }

  return {
    loadCustomTags,
    saveCustomTag,
    deleteCustomTag,
    editCustomTag,
    loadEventStack,
    addToEventStack,
    addResourceEventToStack,
    getLocalDateKey
  }
}
