import { findChatSummaryRecordById, getChatSessionLoadedSummaryIds } from '../../repositories/chatRepository'
import { fetchChatContextForTaskDispatch } from '../../repositories/chatRepository'

type TaskDispatchDeps = {
  taskAssignerChar: { value: string }
  taskLoadContact: { value: string }
  isRequestingTask: { value: boolean }
  currentTaskTab: { value: string }
  charStore: any
  settingStore: any
  taskStore: any
  chatStore: any
  buildSystemPrompt: (targetId: string, scene: string | { time?: string; location?: string; weather?: string }) => string
  callAI: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options?: { presetName?: string; model?: string; logLabel?: string; usageLabel?: string; placeLabel?: string; placeType?: 'single' | 'group' | 'other' }) => Promise<string | null>
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
}

type ParsedTaskResult = {
  name: string
  note: string
  category: string
  exp: number
  reward: number
}

const CATEGORY_FALLBACK = ['健康', '学习', '生活', '社交', '创意', '放松', '运动']

function extractField(text: string, keys: string[]): string {
  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[：:]\\s*(.+)`, 'i')
    const match = text.match(regex)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function extractNumber(text: string, keys: string[], fallback: number): number {
  const raw = extractField(text, keys)
  const num = Number((raw || '').replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(num)) return fallback
  return num
}

function parseTaskResult(raw: string, fallbackCategory: string): ParsedTaskResult {
  const text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const name = extractField(text, ['任务名称', '名称']) || 'AI派发任务'
  const note = extractField(text, ['任务备注', '备注', '任务描述', '描述']) || text.slice(0, 120) || '请按任务目标推进'
  const category = extractField(text, ['任务分类', '分类']) || fallbackCategory
  const exp = Math.max(1, Math.min(300, extractNumber(text, ['经验', '经验值'], 20)))
  const reward = Math.max(0, Math.min(100, extractNumber(text, ['奖励', '点数奖励', '奖励点数'], 3)))
  return { name, note, category, exp, reward }
}

function buildLoadedSummaryContext(chatStore: any, loadedSummaryIds: string[]): string {
  if (!Array.isArray(loadedSummaryIds) || loadedSummaryIds.length === 0) return ''
  const lines: string[] = []

  for (const id of loadedSummaryIds) {
    const record = findChatSummaryRecordById(chatStore, id)
    if (!record) continue
    const label = record.kind === 'big'
      ? '大总结'
      : record.kind === 'small'
        ? '小总结'
        : '历史记忆'
    lines.push(`- ${label} ${record.name || id}\n${String(record.content || '').trim()}`)
  }

  return lines.length ? lines.join('\n\n') : ''
}

function buildPrompt(assigner: any, category: string, contextText: string, baseSystemPrompt: string, loadedSummaryText: string) {
  const charIntro = [
    `派发者：${assigner?.name || '角色'}`,
    assigner?.personality ? `性格：${assigner.personality}` : '',
    assigner?.relationship ? `与用户关系：${assigner.relationship}` : ''
  ].filter(Boolean).join('\n')

  return [
    baseSystemPrompt ? `【角色与上下文系统提示】\n${baseSystemPrompt}` : '',
    '你是任务派发助手。请根据角色口吻生成一条可执行任务。',
    '任务内容应尽量参考已有记忆与当前对话，不要脱离上下文硬造剧情。',
    '输出必须是纯文本，严格按以下字段逐行输出，不要加其他说明：',
    '任务名称：...',
    '任务备注：...',
    '任务分类：...',
    '经验：...',
    '奖励：...',
    '',
    '约束：',
    '1. 任务名称不超过18字，具体可执行。',
    '2. 任务备注一句话，说明验收标准。',
    '3. 任务分类必须从【健康/学习/生活/社交/创意/放松/运动】中选一个。',
    '4. 经验为1-300整数，奖励为0-100整数。',
    '',
    charIntro,
    `建议分类倾向：${category}`,
    loadedSummaryText ? `该聊天已加载总结（高优先级参考）：\n${loadedSummaryText}` : '',
    contextText ? `最近聊天上下文（参考）：\n${contextText}` : ''
  ].filter(Boolean).join('\n')
}

export function useTaskDispatch({
  taskAssignerChar,
  taskLoadContact,
  isRequestingTask,
  currentTaskTab,
  charStore,
  settingStore,
  taskStore,
  chatStore,
  buildSystemPrompt,
  callAI,
  toast
}: TaskDispatchDeps) {
  async function dispatchAITask() {
    await executeTaskDispatchCommand({
      taskAssignerChar,
      taskLoadContact,
      isRequestingTask,
      currentTaskTab,
      charStore,
      settingStore,
      taskStore,
      chatStore,
      buildSystemPrompt,
      callAI,
      toast
    })
  }

  async function runDispatchAITaskCommand() {
    await executeTaskDispatchCommand({
      taskAssignerChar,
      taskLoadContact,
      isRequestingTask,
      currentTaskTab,
      charStore,
      settingStore,
      taskStore,
      chatStore,
      buildSystemPrompt,
      callAI,
      toast
    })
  }

  async function loadDailyReports() {
    await taskStore.loadDailyReports()
    toast('已刷新每日报告', 'success')
  }

  return {
    dispatchAITask,
    runDispatchAITaskCommand,
    loadDailyReports
  }
}

export async function executeTaskDispatchCommand({
  taskAssignerChar,
  taskLoadContact,
  isRequestingTask,
  currentTaskTab,
  charStore,
  settingStore,
  taskStore,
  chatStore,
  buildSystemPrompt,
  callAI,
  toast
}: TaskDispatchDeps) {
  if (!taskAssignerChar.value) {
    toast('请先选择派发角色', 'error')
    return
  }

  isRequestingTask.value = true
  try {
    const assigner = charStore.getCharacter(taskAssignerChar.value)
    if (!assigner) {
      toast('角色不存在', 'error')
      return
    }

    const category = CATEGORY_FALLBACK[Math.floor(Math.random() * CATEGORY_FALLBACK.length)]
    let contextText = ''
    let loadedSummaryText = ''
    if (taskLoadContact.value) {
      try {
        const chatData = await fetchChatContextForTaskDispatch(taskLoadContact.value)
        const chatMsgs = Array.isArray(chatData?.messages) ? chatData.messages.slice(-20) : []
        contextText = chatMsgs
          .map((m: any) => `${m.role === 'user' ? '用户' : (m.senderName || m.name || '角色')}：${String(m.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}`)
          .filter((line: string) => line && !line.endsWith('：'))
          .join('\n')

        const loadedIds = getChatSessionLoadedSummaryIds(chatData?.session)
        loadedSummaryText = buildLoadedSummaryContext(chatStore, loadedIds)
      } catch {
        // 上下文加载失败时继续派发，不中断
      }
    }

    const baseSystemPrompt = buildSystemPrompt(taskAssignerChar.value, 'task')
    const prompt = buildPrompt(assigner, category, contextText, baseSystemPrompt, loadedSummaryText)
    const presetName = assigner?.defaultPreset || settingStore.defaultPreset?.name || ''
    const preset = settingStore.getCurrentApiConfig(presetName)
    const model = assigner?.defaultModel || preset?.model || ''

    const result = await callAI(
      [{ role: 'system', content: prompt }, { role: 'user', content: '请派发任务。' }],
      {
        presetName: preset?.name || presetName,
        model,
        logLabel: `${assigner.name}-任务派发`,
        usageLabel: `任务派发：${assigner.name}`,
        placeLabel: taskLoadContact.value ? `上下文：${taskLoadContact.value}` : '任务面板',
        placeType: 'other'
      }
    )
    if (!result) throw new Error('AI 未返回任务内容')

    const parsed = parseTaskResult(result, category)
    await taskStore.addTask({
      id: Date.now().toString(),
      title: parsed.name,
      name: parsed.name,
      description: parsed.note,
      desc: parsed.note,
      publishNote: parsed.note,
      category: parsed.category,
      expReward: parsed.exp,
      reward: parsed.reward,
      pointsReward: parsed.reward,
      assignerName: assigner.name,
      from: assigner.name,
      type: currentTaskTab.value,
      status: 'active'
    })
    toast(`已派发任务：${parsed.name}`, 'success')
  } catch (e: any) {
    toast(`AI任务派发失败: ${e?.message || e}`, 'error')
  } finally {
    isRequestingTask.value = false
  }
}
