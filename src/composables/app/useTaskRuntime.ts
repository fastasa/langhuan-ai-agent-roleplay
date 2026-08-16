export function useTaskRuntime({
  taskStore,
  resourceStore,
  toast,
  newTaskName,
  newTaskReward,
  newTaskDesc,
  newTaskCategory,
  newTaskBonus,
  currentTaskTab,
  taskTimerUpdateInterval,
  customMarkType,
  customMarkNote,
  expandedTaskId,
  addToEventStack,
  openConfirmDialog,
  openPromptDialog
}: any) {
  function addCustomTask() {
    executeAddCustomTaskCommand({
      taskStore,
      toast,
      newTaskName,
      newTaskReward,
      newTaskDesc,
      newTaskCategory,
      newTaskBonus,
      currentTaskTab
    })
  }

  async function submitTask(task: any) {
    const currentTask = taskStore.tasks.find((t: any) => t.id === task.id) || task
    const expReward = currentTask.expReward || currentTask.reward || 10
    const pointsReward = currentTask.pointsReward || 1
    const totalPoints = pointsReward + taskStore.userLevel.pointsBonus
    const durationSeconds = currentTask.timerState ? Math.floor(taskStore.getTaskElapsedTime(currentTask.id) / 1000) : 0

    await taskStore.addExp(expReward)
    resourceStore.points += totalPoints
    await resourceStore.saveResources()
    await resourceStore.addHistory(`: ${currentTask.name || currentTask.title}`, `+${expReward}exp +${totalPoints}`)

    await taskStore.completeTask(currentTask.id, {
      completedAt: new Date().toISOString(),
      durationSeconds,
      timerMarks: currentTask.timerState?.marks || [],
      notes: currentTask.completionNote || currentTask.completion_note || ''
    })

    await addToEventStack({
      ...currentTask,
      status: 'done'
    }, totalPoints, 0, {}, {})

    toast(`任务完成：${currentTask.name || currentTask.title}，获得 +${expReward}exp +${totalPoints}点数`, 'success')
  }

  function editTask(task: any) {
    const submitRename = (value: string) => {
      const nextName = String(value || '').trim()
      if (!nextName || nextName === String(task.name || '').trim()) return
      taskStore.updateTask(task.id, { name: nextName })
      toast('任务名称已更新', 'success')
    }

    if (typeof openPromptDialog === 'function') {
      openPromptDialog({
        title: '修改任务名称',
        inputLabel: '任务名称',
        placeholder: '请输入任务名称',
        confirmText: '保存',
        initialValue: String(task.name || ''),
        validator: (value: string) => String(value || '').trim() ? '' : '任务名称不能为空',
        onConfirm: submitRename
      })
      return
    }

    submitRename(String(task.name || ''))
  }

  async function deleteTask(id: string) {
    const runDelete = async () => {
      await taskStore.deleteTask(id)
      toast('任务已删除', 'success')
    }

    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('删除任务', '确定删除此任务吗？删除后无法恢复。', () => {
        void runDelete()
      })
      return
    }

    await runDelete()
  }

  async function startTaskTimer(taskId: string) {
    await executeStartTaskTimerCommand({
      taskStore,
      taskTimerUpdateInterval
    }, taskId)
  }

  async function runStartTaskTimerCommand(taskId: string) {
    await executeStartTaskTimerCommand({
      taskStore,
      taskTimerUpdateInterval
    }, taskId)
  }

  function stopTaskTimerUpdate() {
    if (taskTimerUpdateInterval.value) {
      clearInterval(taskTimerUpdateInterval.value)
      taskTimerUpdateInterval.value = null
    }
  }

  async function pauseTaskTimer(taskId: string) {
    await executePauseTaskTimerCommand({ taskStore }, taskId)
  }

  async function resetTaskTimer(taskId: string) {
    await executeResetTaskTimerCommand({ taskStore, toast }, taskId)
  }

  function addTaskMark(taskId: string) {
    executeAddTaskMarkCommand({
      taskStore,
      toast,
      customMarkType,
      customMarkNote
    }, taskId)
  }

  function useCustomTag(tag: any) {
    const task = taskStore.tasks.find((t: any) => t.id === expandedTaskId.value)
    if (!task || !task.timerState?.isRunning) {
      toast('请先开始计', 'error')
      return
    }
    const marks = Array.isArray(task.timerState?.marks) ? task.timerState.marks : []
    const related = marks
      .filter((m: any) => m.tagId === tag.id || m.type === tag.name)
      .sort((a: any, b: any) => Number(a.time || 0) - Number(b.time || 0))
    const lastRelated = related[related.length - 1]
    const shouldStart = !lastRelated || lastRelated.isStart === false

    taskStore.addTimerMark(task.id, tag.name, '', shouldStart, tag.id)
    toast(`${tag.name} ${shouldStart ? '已开始' : '已结束'}`, 'success')
  }

  async function failTaskConfirm(taskOrId: any, skipConfirm = false) {
    const taskId = typeof taskOrId === 'string' ? taskOrId : taskOrId?.id
    if (!taskId) return

    if (!skipConfirm) {
      if (typeof openConfirmDialog === 'function') {
        openConfirmDialog('标记任务失败', '确定标记为失败吗？将扣除经验。', () => {
          void failTaskConfirm(taskOrId, true)
        })
        return
      }
    }

    await taskStore.failTask(taskId)
    const currentTask = taskStore.tasks.find((t: any) => t.id === taskId) || taskOrId
    if (currentTask) {
      await addToEventStack({
        ...currentTask,
        status: 'failed',
        completionNote: currentTask.completionNote || currentTask.completion_note || '任务失败'
      }, 0, 0, {}, {})
    }
    toast('任务已标记为失败', 'warning')
  }

  function runAddCustomTaskCommand() {
    addCustomTask()
  }

  async function runPauseTaskTimerCommand(taskId: string) {
    await pauseTaskTimer(taskId)
  }

  async function runResetTaskTimerCommand(taskId: string) {
    await resetTaskTimer(taskId)
  }

  function runAddTaskMarkCommand(taskId: string) {
    addTaskMark(taskId)
  }

  async function runDeleteTaskCommand(taskId: string) {
    await deleteTask(taskId)
  }

  return {
    addCustomTask,
    runAddCustomTaskCommand,
    submitTask,
    editTask,
    deleteTask,
    runDeleteTaskCommand,
    startTaskTimer,
    runStartTaskTimerCommand,
    stopTaskTimerUpdate,
    pauseTaskTimer,
    runPauseTaskTimerCommand,
    resetTaskTimer,
    runResetTaskTimerCommand,
    addTaskMark,
    runAddTaskMarkCommand,
    useCustomTag,
    failTaskConfirm
  }
}

export function executeAddCustomTaskCommand({
  taskStore,
  toast,
  newTaskName,
  newTaskReward,
  newTaskDesc,
  newTaskCategory,
  newTaskBonus,
  currentTaskTab
}: any) {
  if (!newTaskName.value) return
  taskStore.addTask({
    id: Date.now().toString(),
    name: newTaskName.value,
    title: newTaskName.value,
    desc: newTaskDesc.value,
    description: newTaskDesc.value,
    reward: Number(newTaskReward.value || 10),
    expReward: Number(newTaskReward.value || 10),
    pointsReward: Number(newTaskBonus.value || 1),
    category: newTaskCategory.value || '',
    type: currentTaskTab.value,
    status: 'active'
  })
  newTaskName.value = ''
  newTaskDesc.value = ''
  newTaskReward.value = ''
  newTaskCategory.value = ''
  newTaskBonus.value = ''
  toast('任务已添加', 'success')
}

export async function executeStartTaskTimerCommand({
  taskStore,
  taskTimerUpdateInterval
}: any, taskId: string) {
  await taskStore.startTaskTimer(taskId)
  if (!taskTimerUpdateInterval.value) {
    taskTimerUpdateInterval.value = setInterval(() => {
      const _ = taskStore.tasks.length
    }, 1000)
  }
}

export async function executePauseTaskTimerCommand({ taskStore }: any, taskId: string) {
  await taskStore.pauseTaskTimer(taskId)
}

export async function executeResetTaskTimerCommand({
  taskStore,
  toast
}: any, taskId: string) {
  try {
    await taskStore.resetTaskTimer(taskId)
    toast('任务计时已归零', 'success')
  } catch (error) {
    console.error('任务归零失败:', error)
    toast('任务计时归零失败', 'error')
  }
}

export function executeAddTaskMarkCommand({
  taskStore,
  toast,
  customMarkType,
  customMarkNote
}: any, taskId: string) {
  if (!customMarkType.value.trim()) {
    toast('请输入标记类', 'warning')
    return
  }
  const task = taskStore.tasks.find((t: any) => t.id === taskId)
  const marks = task?.timerState?.marks || []
  const lastMark = marks[marks.length - 1]
  const isStart = !lastMark || lastMark.isStart === false
  taskStore.addTimerMark(taskId, customMarkType.value.trim(), customMarkNote.value.trim(), isStart, undefined)
  customMarkNote.value = ''
  toast(isStart ? '已开始标记' : '已结束标记', 'success')
}
