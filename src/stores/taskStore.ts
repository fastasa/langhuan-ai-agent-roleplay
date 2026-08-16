/**
 * stores/taskStore.ts
 * 管理：任务、任务留档、每日报告、用户等级、活跃度
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Task, TaskLog, DailyReport, UserLevel, DailyActivity, TimerMark } from '../types'
import {
  createDailyReportRecord,
  createTaskLogRecord,
  createTaskRecord,
  deleteTaskRecord,
  fetchDailyReports,
  fetchTaskLogs,
  saveTaskUserLevel,
  updateTaskRecord
} from '../repositories/taskRepository'

// 任务类型枚举
const TASK_TYPES = {
  DAILY: 'daily',      // 每日任务（24小时周期）
  LONGTERM: 'longterm', // 长期任务
  BOUNTY: 'bounty'     // 悬赏任务
} as const

// 任务状态枚举
const TASK_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DONE: 'done'
} as const

// 等级配置
const LEVEL_CONFIG = {
  baseExp: 100,        // 基础经验
  expMultiplier: 1.5,  // 经验倍率
  maxLevel: 100,       // 最大等级
  activityTarget: 3,   // 每日目标完成数
  activityThreshold: 1 // 活跃度阈值（低于此数降低评级）
} as const

// 计算下一级所需经验
function getExpForLevel(level: number): number {
  return Math.floor(LEVEL_CONFIG.baseExp * Math.pow(LEVEL_CONFIG.expMultiplier, level - 1))
}

export const useTaskStore = defineStore('task', () => {
  // ===== 任务列表 =====
  const tasks = ref<Task[]>([])

  // ===== 任务留档（永久） =====
  const taskLogs = ref<TaskLog[]>([])

  // ===== 每日报告（永久） =====
  const dailyReports = ref<DailyReport[]>([])

  // ===== 用户等级数据 =====
  const userLevel = ref<UserLevel>({
    level: 1,
    exp: 0,
    expToNext: 100,
    totalExp: 0,
    pointsBonus: 0  // 等级带来的点数加成
  })

  // ===== 活跃度数据（根据每日完成任务数量） =====
  const dailyActivity = ref<DailyActivity>({
    date: new Date().toDateString(),
    completedCount: 0,
    targetCount: LEVEL_CONFIG.activityTarget
  })

  // ===== 历史标记类型（用于快速选择） =====
  const recentMarkTypes = ref<string[]>([])
  const timerNow = ref(Date.now())
  let taskTimerTicker: ReturnType<typeof setInterval> | null = null

  function syncTimerNow(): void {
    timerNow.value = Date.now()
  }

  function hasRunningTaskTimer(): boolean {
    return tasks.value.some((task) => Boolean(task.timerState?.isRunning))
  }

  function ensureTaskTimerTicker(): void {
    syncTimerNow()
    if (!hasRunningTaskTimer()) {
      if (taskTimerTicker) {
        clearInterval(taskTimerTicker)
        taskTimerTicker = null
      }
      return
    }
    if (taskTimerTicker) return
    taskTimerTicker = setInterval(() => {
      syncTimerNow()
      if (!hasRunningTaskTimer() && taskTimerTicker) {
        clearInterval(taskTimerTicker)
        taskTimerTicker = null
      }
    }, 1000)
  }

  // ===== 任务 CRUD =====
  async function addTask(task: Partial<Task>): Promise<void> {
    const now = Date.now()
    const newTask: Task = {
      id: task.id || `task_${now}`,
      title: task.title || '',
      type: task.type || TASK_TYPES.DAILY,
      status: task.status || TASK_STATUS.ACTIVE,
      pointsReward: task.pointsReward || 0,
      expReward: task.expReward || 10,
      deadline: task.deadline || '',
      description: task.description || '',
      assignerName: task.assignerName || task.assigner_name || '',
      publishNote: task.publishNote || task.publish_note || '',
      completionNote: task.completionNote || task.completion_note || '',
      category: task.category || '',
      orderIndex: task.orderIndex || 0,
      createdAt: now,
      // 每日任务：24小时后重置/失败
      resetTime: task.type === TASK_TYPES.DAILY ? now + 24 * 60 * 60 * 1000 : undefined,
      completedCount: 0,
      // 计时器相关
      timerState: {
        isRunning: false,
        startTime: null,
        accumulatedTime: 0,
        marks: []
      }
    }

    await createTaskRecord(newTask)
    tasks.value.push(newTask)
  }

  // ===== 等级和经验系统 =====

  // 保存用户等级数据到服务器
  async function saveUserLevel(): Promise<void> {
    await saveTaskUserLevel({
      userLevel: userLevel.value,
      dailyActivity: dailyActivity.value
    })
  }

  // 检查并重置每日活跃度（24小时周期）
  function checkDailyReset(): void {
    const today = new Date().toDateString()
    if (dailyActivity.value.date !== today) {
      // 检查昨日活跃度
      if (dailyActivity.value.completedCount < LEVEL_CONFIG.activityThreshold) {
        // 活跃度低，扣除经验
        userLevel.value.exp = Math.max(0, userLevel.value.exp - 20)
      }

      // 重置活跃度
      dailyActivity.value = {
        date: today,
        completedCount: 0,
        targetCount: LEVEL_CONFIG.activityTarget
      }

      // 保存到服务器
      saveUserLevel()
    }
  }

  // 增加经验值
  async function addExp(amount: number): Promise<void> {
    userLevel.value.exp += amount
    userLevel.value.totalExp += amount

    // 增加活跃度
    dailyActivity.value.completedCount++

    // 检查是否升级
    while (userLevel.value.exp >= userLevel.value.expToNext) {
      userLevel.value.exp -= userLevel.value.expToNext
      userLevel.value.level++
      userLevel.value.expToNext = getExpForLevel(userLevel.value.level)
      userLevel.value.pointsBonus = Math.floor(userLevel.value.level / 10)  // 每10级+1点数加成
    }

    // 保存到后端
    await saveUserLevel()
  }

  // 扣除经验值（未完成任务/活跃度低）
  async function deductExp(amount: number, _reason: string = ''): Promise<void> {
    userLevel.value.exp = Math.max(0, userLevel.value.exp - amount)
    await saveUserLevel()
  }

  // ===== 任务重置系统 =====

  // 检查任务重置/失败（24小时周期）
  function checkTaskReset(): void {
    const now = Date.now()

    tasks.value.forEach(task => {
      if (task.type === TASK_TYPES.DAILY && task.resetTime) {
        if (now >= task.resetTime) {
          // 24小时周期已到
          if (task.status === TASK_STATUS.ACTIVE) {
            // 未完成 → 标记为失败（超时）
            task.status = TASK_STATUS.FAILED
            task.failureReason = '超时'
            // 扣除经验（活跃度低）
            deductExp(5, '任务超时')
          } else if (task.status === TASK_STATUS.COMPLETED) {
            // 已完成 → 重置为新任务
            task.status = TASK_STATUS.ACTIVE
            task.resetTime = now + 24 * 60 * 60 * 1000  // 设置下一个重置时间
            task.completedCount = 0
          }
        }
      }
    })
  }

  // 标记任务失败
  async function failTask(id: string): Promise<void> {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return

    // 扣除经验
    await deductExp(5, '任务失败')

    task.status = TASK_STATUS.FAILED
    task.failureReason = '手动标记'
    await updateTask(id, { status: TASK_STATUS.FAILED, failureReason: '手动标记' })
  }

  // ===== 计时器操作 =====

  // 启动任务计时器
  async function startTaskTimer(taskId: string): Promise<void> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    if (!task.timerState) {
      task.timerState = { isRunning: false, startTime: null, accumulatedTime: 0, marks: [] }
    }

    task.timerState.isRunning = true
    task.timerState.startTime = Date.now()
    ensureTaskTimerTicker()

    // 保存到服务器
    await updateTask(taskId, { timerState: task.timerState })
  }

  // 暂停任务计时器
  async function pauseTaskTimer(taskId: string): Promise<void> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task || !task.timerState?.isRunning) return

    // 累计时间
    task.timerState.accumulatedTime += Date.now() - (task.timerState.startTime || 0)
    task.timerState.isRunning = false
    task.timerState.startTime = null
    ensureTaskTimerTicker()

    // 保存到服务器
    await updateTask(taskId, { timerState: task.timerState })
  }

  // 归零任务计时器，并清空所有标签
  async function resetTaskTimer(taskId: string): Promise<void> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    task.timerState = {
      isRunning: false,
      startTime: null,
      accumulatedTime: 0,
      marks: []
    }
    ensureTaskTimerTicker()

    await updateTask(taskId, { timerState: task.timerState })
  }

  // 获取任务当前计时（包含正在运行的时间）
  function getTaskElapsedTime(taskId: string): number {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task || !task.timerState) return 0

    let elapsed = task.timerState.accumulatedTime || 0
    if (task.timerState.isRunning && task.timerState.startTime) {
      elapsed += timerNow.value - task.timerState.startTime
    }
    return elapsed
  }

  // 添加计时标记
  async function addTimerMark(taskId: string, type: string, note: string = '', isStart?: boolean, tagId?: string): Promise<TimerMark | undefined> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task || !task.timerState) return undefined

    const mark: TimerMark = {
      id: `mark_${Date.now()}`,
      type,
      note,
      time: getTaskElapsedTime(taskId),  // 记录当前累计时间
      createdAt: new Date().toISOString(),
      isStart,
      tagId
    }

    task.timerState.marks = task.timerState.marks || []
    task.timerState.marks.push(mark)

    // 更新历史标记类型
    if (!recentMarkTypes.value.includes(type)) {
      recentMarkTypes.value.unshift(type)
      if (recentMarkTypes.value.length > 10) {
        recentMarkTypes.value.pop()
      }
    }

    // 保存到服务器
    await updateTask(taskId, { timerState: task.timerState })

    return mark
  }

  // ===== 辅助函数 =====

  // 判断任务是否超时
  function isTaskExpired(task: Task): boolean {
    if (!task.resetTime || task.type !== TASK_TYPES.DAILY) return false
    return timerNow.value >= task.resetTime && task.status === TASK_STATUS.ACTIVE
  }

  // 格式化剩余时间
  function formatResetTime(timestamp: number | undefined | null): string {
    if (!timestamp) return ''
    const hours = Math.floor((timestamp - timerNow.value) / (1000 * 60 * 60))

    if (hours < 1) {
      return '即将重置'
    } else if (hours < 24) {
      return `${hours}小时后`
    } else {
      return `${Math.floor(hours / 24)}天${hours % 24}小时后`
    }
  }

  // 格式化计时时间
  function formatTimerTime(ms: number): string {
    if (ms <= 0) return '00:00:00'
    const totalSec = Math.floor(ms / 1000)
    const hours = Math.floor(totalSec / 3600)
    const min = Math.floor((totalSec % 3600) / 60)
    const sec = totalSec % 60

    if (hours > 0) {
      return `${hours}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // 计算任务进度（距离超时还剩多少）
  function getTaskTimeProgress(task: Task): number {
    if (!task.resetTime || task.type !== TASK_TYPES.DAILY) return 100
    const total = 24 * 60 * 60 * 1000  // 24小时
    const remaining = task.resetTime - timerNow.value
    return Math.max(0, Math.min(100, (remaining / total) * 100))
  }

  async function updateTask(id: string, changes: Partial<Task>): Promise<void> {
    await updateTaskRecord(id, changes)
    const t = tasks.value.find(t => t.id === id)
    if (t) Object.assign(t, changes)
  }

  async function deleteTask(id: string): Promise<void> {
    await deleteTaskRecord(id)
    tasks.value = tasks.value.filter(t => t.id !== id)
  }

  // ===== 完成任务（归档+删除） =====
  async function completeTask(id: string, logData: { durationSeconds?: number; timerMarks?: TimerMark[]; notes?: string }): Promise<void> {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return

    // 创建留档记录
    const log = {
      taskId: id,
      taskTitle: task.title,
      durationSeconds: logData.durationSeconds || 0,
      timerMarks: logData.timerMarks || [],
      notes: logData.notes || '',
      expEarned: task.expReward || 0
    }
    await createTaskLogRecord(log)

    // 标记任务已完成
    await updateTask(id, { status: TASK_STATUS.DONE })
  }

  // ===== 加载留档 =====
  async function loadTaskLogs(): Promise<void> {
    taskLogs.value = await fetchTaskLogs()
  }

  // ===== 每日报告 =====
  async function addDailyReport(report: DailyReport): Promise<void> {
    await createDailyReportRecord(report)
    dailyReports.value.unshift(report)
  }

  async function loadDailyReports(): Promise<void> {
    dailyReports.value = await fetchDailyReports()
  }

  return {
    // 状态
    tasks, taskLogs, dailyReports,
    userLevel, dailyActivity, recentMarkTypes,
    // 枚举
    TASK_TYPES, TASK_STATUS, LEVEL_CONFIG,
    // 方法
    addTask, updateTask, deleteTask, completeTask,
    loadTaskLogs,
    addDailyReport, loadDailyReports,
    // 等级和经验
    addExp, deductExp, saveUserLevel, checkDailyReset,
    // 任务重置
    checkTaskReset, failTask,
    // 计时器
    startTaskTimer, pauseTaskTimer, resetTaskTimer, getTaskElapsedTime, addTimerMark,
    // 辅助函数
    isTaskExpired, formatResetTime, formatTimerTime, getTaskTimeProgress,
    // 导出常量
    getExpForLevel
  }
})
