import type { ToolDefinition } from './toolRegistry'

export const WRITE_AGENT_TASK_TODO_TOOL_NAME = 'writeTaskTodo'
export const UPDATE_AGENT_TASK_TODO_TOOL_NAME = 'updateTaskTodo'
export const AGENT_TASK_TODO_TOOL_NAMES = [
  WRITE_AGENT_TASK_TODO_TOOL_NAME,
  UPDATE_AGENT_TASK_TODO_TOOL_NAME
] as const

export type AgentTaskTodoStatus = 'pending' | 'in_progress' | 'completed'
export type AgentTaskTodoChangeKind = 'reset' | 'created' | 'updated' | 'removed' | 'completed'

export interface AgentTaskTodoItem {
  id: string
  text: string
  acceptance: string
  status: AgentTaskTodoStatus
}

export interface AgentTaskTodoSnapshot {
  taskId: string
  revision: number
  state: 'empty' | 'active' | 'completed'
  changeKind: AgentTaskTodoChangeKind
  createdAt: number
  updatedAt: number
  items: AgentTaskTodoItem[]
}

export interface AgentTaskTodoWriteItem {
  text: string
  acceptance: string
}

export interface AgentTaskTodoUpdateItem {
  id: string
  status?: AgentTaskTodoStatus
  text?: string
  acceptance?: string
}

export interface AgentTaskTodoRemoval {
  id: string
  reason: string
}

interface AgentTaskTodoMutationResult {
  changed: boolean
  snapshot: AgentTaskTodoSnapshot
  added?: AgentTaskTodoItem[]
  updated?: AgentTaskTodoItem[]
  removed?: Array<AgentTaskTodoItem & { reason: string }>
  skippedDuplicates?: Array<{ id: string; text: string }>
  skippedSelfReferential?: string[]
  missingIds?: string[]
}

export interface AgentTaskTodoController {
  snapshot(): AgentTaskTodoSnapshot
  hasItems(): boolean
  hasOpenItems(): boolean
  write(items: AgentTaskTodoWriteItem[]): AgentTaskTodoMutationResult
  update(updates: AgentTaskTodoUpdateItem[], removals: AgentTaskTodoRemoval[]): AgentTaskTodoMutationResult
}

export interface CreateAgentTaskTodoControllerOptions {
  taskId?: string
  /** 同一 Agent 对话续接时带回上一轮快照；新对话不传。 */
  initialSnapshot?: AgentTaskTodoSnapshot | null
  now?: () => number
  onChange?: (snapshot: AgentTaskTodoSnapshot) => void
}

let taskSequence = 0

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function isSelfReferentialTask(text: string): boolean {
  const normalized = text.replace(/[\s。．.!！~～、，,：:；;]+/g, '').toLowerCase()
  return /^(?:创建|建立|列出|写入|维护)(?:本轮|当前)?(?:任务)?(?:todo|待办|待办事项|清单)$/.test(normalized)
    || /^(?:本轮|当前任务|这一轮)?(?:收尾|结束|完成收尾|收束)(?:本轮|当前任务|这一轮)?$/.test(normalized)
    || /^(?:给用户)?(?:最终)?(?:回复|答复)(?:用户)?$/.test(normalized)
}

function itemKey(text: string): string {
  return normalizeText(text, 160).toLocaleLowerCase()
}

function cloneItem(item: AgentTaskTodoItem): AgentTaskTodoItem {
  return { ...item }
}

function createTaskId(now: number): string {
  taskSequence += 1
  return `agent-task-${now}-${taskSequence}`
}

function validChangeKind(value: unknown): value is AgentTaskTodoChangeKind {
  return value === 'reset'
    || value === 'created'
    || value === 'updated'
    || value === 'removed'
    || value === 'completed'
}

/** 浏览器本机续接态与 runtime 共用的窄校验入口：只恢复 TODO 协议字段，不信任任意 JSON。 */
export function normalizeAgentTaskTodoSnapshot(value: unknown): AgentTaskTodoSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<AgentTaskTodoSnapshot>
  const taskId = normalizeText(raw.taskId, 120)
  if (!taskId || !Array.isArray(raw.items)) return null
  const seenIds = new Set<string>()
  const items: AgentTaskTodoItem[] = []
  for (const candidate of raw.items.slice(0, 500)) {
    if (!candidate || typeof candidate !== 'object') continue
    const item = candidate as Partial<AgentTaskTodoItem>
    const id = normalizeText(item.id, 80)
    const text = normalizeText(item.text, 160)
    const acceptance = normalizeText(item.acceptance, 240)
    if (!id || seenIds.has(id) || !text || !acceptance || !validStatus(item.status)) continue
    seenIds.add(id)
    items.push({ id, text, acceptance, status: item.status })
  }
  const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
  const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : createdAt
  const revision = Number.isFinite(Number(raw.revision))
    ? Math.max(0, Math.floor(Number(raw.revision)))
    : 0
  return {
    taskId,
    revision,
    state: items.length === 0
      ? 'empty'
      : items.every((item) => item.status === 'completed')
        ? 'completed'
        : 'active',
    changeKind: validChangeKind(raw.changeKind) ? raw.changeKind : 'reset',
    createdAt,
    updatedAt,
    items
  }
}

export function createAgentTaskTodoController(
  options: CreateAgentTaskTodoControllerOptions = {}
): AgentTaskTodoController {
  const now = options.now ?? (() => Date.now())
  const startedAt = now()
  const initialSnapshot = normalizeAgentTaskTodoSnapshot(options.initialSnapshot)
  const createdAt = initialSnapshot?.createdAt ?? startedAt
  const taskId = normalizeText(options.taskId, 120) || initialSnapshot?.taskId || createTaskId(createdAt)
  const items: AgentTaskTodoItem[] = initialSnapshot?.items.map(cloneItem) ?? []
  let revision = initialSnapshot?.revision ?? 0
  const numberedIds = items
    .map((item) => /^todo-(\d+)$/.exec(item.id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  let nextItemSequence = (numberedIds.length ? Math.max(...numberedIds) : 0) + 1
  let changeKind: AgentTaskTodoChangeKind = initialSnapshot?.changeKind ?? 'reset'
  let updatedAt = initialSnapshot?.updatedAt ?? createdAt

  const buildSnapshot = (): AgentTaskTodoSnapshot => ({
    taskId,
    revision,
    state: items.length === 0
      ? 'empty'
      : items.every((item) => item.status === 'completed')
        ? 'completed'
        : 'active',
    changeKind,
    createdAt,
    updatedAt,
    items: items.map(cloneItem)
  })

  const emit = (): AgentTaskTodoSnapshot => {
    const snapshot = buildSnapshot()
    options.onChange?.(snapshot)
    return snapshot
  }

  // 新对话发 empty；同一对话的新 runtime 则先发恢复快照，停止/补充消息不会清掉已做进度。
  emit()

  const touch = (nextChangeKind: AgentTaskTodoChangeKind): AgentTaskTodoSnapshot => {
    revision += 1
    updatedAt = now()
    changeKind = nextChangeKind
    return emit()
  }

  return {
    snapshot: buildSnapshot,
    hasItems: () => items.length > 0,
    hasOpenItems: () => items.some((item) => item.status !== 'completed'),
    write(rawItems) {
      const added: AgentTaskTodoItem[] = []
      const skippedDuplicates: Array<{ id: string; text: string }> = []
      const skippedSelfReferential: string[] = []
      const existingKeys = new Map(items.map((item) => [itemKey(item.text), item]))

      for (const raw of rawItems.slice(0, 24)) {
        const text = normalizeText(raw?.text, 160)
        const acceptance = normalizeText(raw?.acceptance, 240)
        if (!text || !acceptance) continue
        if (isSelfReferentialTask(text)) {
          skippedSelfReferential.push(text)
          continue
        }
        const duplicate = existingKeys.get(itemKey(text))
        if (duplicate) {
          skippedDuplicates.push({ id: duplicate.id, text })
          continue
        }
        while (items.some((item) => item.id === `todo-${nextItemSequence}`)) nextItemSequence += 1
        const item: AgentTaskTodoItem = {
          id: `todo-${nextItemSequence}`,
          text,
          acceptance,
          status: 'pending'
        }
        nextItemSequence += 1
        items.push(item)
        added.push(cloneItem(item))
        existingKeys.set(itemKey(text), item)
      }

      const snapshot = added.length
        ? touch(revision === 0 ? 'created' : 'updated')
        : buildSnapshot()
      return {
        changed: added.length > 0,
        snapshot,
        added,
        skippedDuplicates,
        skippedSelfReferential
      }
    },
    update(rawUpdates, rawRemovals) {
      const updated: AgentTaskTodoItem[] = []
      const removed: Array<AgentTaskTodoItem & { reason: string }> = []
      const missingIds: string[] = []
      let changed = false

      for (const raw of rawUpdates.slice(0, 24)) {
        const id = normalizeText(raw?.id, 80)
        const item = items.find((entry) => entry.id === id)
        if (!item) {
          if (id) missingIds.push(id)
          continue
        }
        const nextText = raw.text === undefined ? item.text : normalizeText(raw.text, 160)
        const nextAcceptance = raw.acceptance === undefined
          ? item.acceptance
          : normalizeText(raw.acceptance, 240)
        const nextStatus = raw.status ?? item.status
        if (!nextText || !nextAcceptance) continue
        if (isSelfReferentialTask(nextText)) continue
        if (nextText !== item.text || nextAcceptance !== item.acceptance || nextStatus !== item.status) {
          item.text = nextText
          item.acceptance = nextAcceptance
          item.status = nextStatus
          changed = true
        }
        updated.push(cloneItem(item))
      }

      const removedIds = new Set<string>()
      for (const raw of rawRemovals.slice(0, 24)) {
        const id = normalizeText(raw?.id, 80)
        const reason = normalizeText(raw?.reason, 240)
        if (!id || !reason || removedIds.has(id)) continue
        const index = items.findIndex((entry) => entry.id === id)
        if (index < 0) {
          missingIds.push(id)
          continue
        }
        const [item] = items.splice(index, 1)
        removed.push({ ...cloneItem(item), reason })
        removedIds.add(id)
        changed = true
      }

      let nextChangeKind: AgentTaskTodoChangeKind = removed.length ? 'removed' : 'updated'
      if (items.length > 0 && items.every((item) => item.status === 'completed')) {
        nextChangeKind = 'completed'
      }
      const snapshot = changed ? touch(nextChangeKind) : buildSnapshot()
      return { changed, snapshot, updated, removed, missingIds: Array.from(new Set(missingIds)) }
    }
  }
}

function validStatus(value: unknown): value is AgentTaskTodoStatus {
  return value === 'pending' || value === 'in_progress' || value === 'completed'
}

function validateWriteArgs(args: Record<string, unknown>): string | null {
  if (!Array.isArray(args.todos) || args.todos.length === 0) {
    return `${WRITE_AGENT_TASK_TODO_TOOL_NAME} 缺少 todos（至少一条 { text, acceptance }）`
  }
  if (args.todos.length > 24) return '单次最多写入 24 条任务；请先把独立小事合并成更少的可验收批次'
  for (const [index, raw] of args.todos.entries()) {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    if (!normalizeText(record.text, 160)) return `todos[${index}].text 不能为空`
    if (!normalizeText(record.acceptance, 240)) return `todos[${index}].acceptance 不能为空`
  }
  return null
}

function validateUpdateArgs(args: Record<string, unknown>): string | null {
  const updates = Array.isArray(args.updates) ? args.updates : []
  const removals = Array.isArray(args.removals) ? args.removals : []
  if (updates.length === 0 && removals.length === 0) {
    return `${UPDATE_AGENT_TASK_TODO_TOOL_NAME} 至少需要 updates 或 removals`
  }
  if (updates.length + removals.length > 24) return '单次最多更新或删除 24 条任务'
  for (const [index, raw] of updates.entries()) {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    if (!normalizeText(record.id, 80)) return `updates[${index}].id 不能为空`
    const hasChange = record.status !== undefined || record.text !== undefined || record.acceptance !== undefined
    if (!hasChange) return `updates[${index}] 没有任何要修改的字段`
    if (record.status !== undefined && !validStatus(record.status)) {
      return `updates[${index}].status 只能是 pending / in_progress / completed`
    }
    if (record.text !== undefined && !normalizeText(record.text, 160)) return `updates[${index}].text 不能为空`
    if (record.acceptance !== undefined && !normalizeText(record.acceptance, 240)) {
      return `updates[${index}].acceptance 不能为空`
    }
  }
  for (const [index, raw] of removals.entries()) {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    if (!normalizeText(record.id, 80)) return `removals[${index}].id 不能为空`
    if (!normalizeText(record.reason, 240)) return `removals[${index}].reason 必填；没有明确理由不能删除任务`
  }
  return null
}

export function buildAgentTaskTodoTools(controller: AgentTaskTodoController): ToolDefinition[] {
  return [
    {
      name: WRITE_AGENT_TASK_TODO_TOOL_NAME,
      brief: '复杂任务的第一动作：一次批量建立当前任务 TODO。每项必须包含 text 和可验证的 acceptance；独立小事尽量合并，禁止把“创建清单/收尾/回复用户”写成任务。执行中发现必要新工作时也用本工具追加。',
      schema: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            minItems: 1,
            maxItems: 24,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '一句话任务内容。' },
                acceptance: { type: 'string', description: '以什么可观察结果为准算完成。' }
              },
              required: ['text', 'acceptance']
            }
          }
        },
        required: ['todos']
      },
      validateArgs: validateWriteArgs,
      execute: (toolCall) => {
        const todos = (toolCall.args.todos as AgentTaskTodoWriteItem[]) || []
        const result = controller.write(todos)
        if (!result.changed) {
          const duplicateText = result.skippedDuplicates?.map((item) => `${item.id}=${item.text}`).join('；')
          const selfText = result.skippedSelfReferential?.join('；')
          return {
            content: duplicateText
              ? `没有新增任务：清单里已有同文任务（${duplicateText}），继续执行已有条目即可。`
              : `没有新增任务：${selfText || '输入里没有有效条目'}。创建清单、收尾和回复用户本身不算任务。`,
            details: {
              kind: 'agentTaskTodoWrite',
              snapshot: result.snapshot,
              skippedDuplicates: result.skippedDuplicates ?? [],
              skippedSelfReferential: result.skippedSelfReferential ?? []
            },
            acted: false
          }
        }
        return {
          content: [
            `已建立/追加 ${result.added?.length ?? 0} 条任务：`,
            ...(result.added ?? []).map((item) => `${item.id} ${item.text}｜验收：${item.acceptance}`),
            result.skippedDuplicates?.length ? `已跳过同文任务：${result.skippedDuplicates.map((item) => item.id).join('、')}` : '',
            result.skippedSelfReferential?.length ? `已忽略自指动作：${result.skippedSelfReferential.join('、')}` : ''
          ].filter(Boolean).join('\n'),
          details: {
            kind: 'agentTaskTodoWrite',
            snapshot: result.snapshot,
            added: result.added ?? [],
            skippedDuplicates: result.skippedDuplicates ?? [],
            skippedSelfReferential: result.skippedSelfReferential ?? []
          },
          acted: false
        }
      }
    },
    {
      name: UPDATE_AGENT_TASK_TODO_TOOL_NAME,
      brief: '批量更新当前任务 TODO：用 updates 修改文字、验收标准或状态；达到验收后立即标 completed。删除放 removals，且每条 reason 必填。可把本轮已完成的小项一次批量勾完，减少往返。',
      schema: {
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            maxItems: 24,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '任务 id，如 todo-1。' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
                text: { type: 'string', description: '可选：替换任务内容。' },
                acceptance: { type: 'string', description: '可选：替换验收标准。' }
              },
              required: ['id']
            }
          },
          removals: {
            type: 'array',
            maxItems: 24,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '要删除的任务 id。' },
                reason: { type: 'string', description: '删除的明确理由，必填。' }
              },
              required: ['id', 'reason']
            }
          }
        }
      },
      validateArgs: validateUpdateArgs,
      execute: (toolCall) => {
        const updates = Array.isArray(toolCall.args.updates)
          ? toolCall.args.updates as AgentTaskTodoUpdateItem[]
          : []
        const removals = Array.isArray(toolCall.args.removals)
          ? toolCall.args.removals as AgentTaskTodoRemoval[]
          : []
        const result = controller.update(updates, removals)
        if (!result.changed) {
          return {
            content: `没有任务发生变化。${result.missingIds?.length ? `未找到：${result.missingIds.join('、')}。` : '请核对 id 和更新字段。'}`,
            status: 'error',
            error: {
              type: 'INVALID_ARGUMENT',
              message: '没有找到可更新的任务或新值与原值相同',
              retryable: true,
              details: { missingIds: result.missingIds ?? [] }
            },
            details: { kind: 'agentTaskTodoUpdate', snapshot: result.snapshot },
            acted: false
          }
        }
        const completed = (result.updated ?? []).filter((item) => item.status === 'completed')
        return {
          content: [
            ...completed.map((item) => `**已完成 ${item.id}：${item.text}**｜验收：${item.acceptance}`),
            ...(result.updated ?? [])
              .filter((item) => item.status !== 'completed')
              .map((item) => `已更新 ${item.id}：${item.text}（${item.status}）｜验收：${item.acceptance}`),
            ...(result.removed ?? []).map((item) => `已删除 ${item.id}：${item.text}｜理由：${item.reason}`),
            result.missingIds?.length ? `未找到：${result.missingIds.join('、')}` : ''
          ].filter(Boolean).join('\n'),
          details: {
            kind: 'agentTaskTodoUpdate',
            snapshot: result.snapshot,
            updated: result.updated ?? [],
            removed: result.removed ?? [],
            missingIds: result.missingIds ?? []
          },
          acted: false
        }
      }
    }
  ]
}

export function isAgentTaskTodoTool(name: string): boolean {
  return (AGENT_TASK_TODO_TOOL_NAMES as readonly string[]).includes(String(name || '').trim())
}

export interface AgentTaskTodoLayerBudget {
  remainingTurns?: number
  remainingToolCalls?: number
}

export function renderAgentTaskTodoLayer(
  snapshot: AgentTaskTodoSnapshot,
  budget: AgentTaskTodoLayerBudget = {}
): string {
  const rules = [
    '简单的一次性回答、纯聊天或单步动作不建空清单；只要需要多个动作、多份资料、写入后复核、批量处理或迁移，就属于复杂任务。',
    `复杂任务的第一动作必须调用 ${WRITE_AGENT_TASK_TODO_TOOL_NAME}，一次尽量列全；独立小事合批，减少模型轮次和工具往返。`,
    `执行中用 ${UPDATE_AGENT_TASK_TODO_TOOL_NAME} 实时标记进行中/完成；发现必要工作可追加，删除必须给明确理由。`,
    '还有未完成项时先继续执行或核对；第一次尝试收尾会收到一次提醒。提醒后若仍因能力缺口、用户拍板、外部状态、安全边界或真实阻断无法继续，可以如实停止并保留未完成状态，不得勉强、擅自选择或伪装完成。',
    '需要用户拍板的内容/方案分叉必须调用当前 Agent 的选择交互工具弹卡，正文提问不算有效暂停；自动放行只覆盖普通写入审查，推荐项绝不等于用户授权。'
  ]
  const lines = ['【6·当前任务 TODO】', ...rules.map((rule) => `- ${rule}`)]
  if (snapshot.items.length === 0) {
    lines.push('- 当前尚未建立清单：先判断本任务是否复杂；复杂就立即建表，简单就直接完成。')
    return lines.join('\n')
  }
  lines.push(`- 当前状态：${snapshot.state === 'completed' ? '全部完成，可以最终答复' : '仍有未完成项；优先继续，确实无法继续时可在一次提醒后如实停止'}`)
  if (snapshot.state !== 'completed' && budget.remainingTurns != null && budget.remainingTurns <= 2) {
    const turnLabel = budget.remainingTurns === 1
      ? '只剩最后 1 个模型回合'
      : `只剩 ${budget.remainingTurns} 个模型回合`
    lines.push(`- 执行提醒：${turnLabel}。优先处理仍可完成的项目并及时调用 ${UPDATE_AGENT_TASK_TODO_TOOL_NAME}；若客观上无法继续，保留未完成项并准确说明原因。`)
  }
  if (snapshot.state !== 'completed' && budget.remainingToolCalls != null && budget.remainingToolCalls <= 4) {
    lines.push(`- 工具预算提醒：业务工具还可调用 ${Math.max(0, budget.remainingToolCalls)} 次。只做清单验收必需动作；TODO 控制工具不占业务工具预算。`)
  }
  for (const item of snapshot.items) {
    const mark = item.status === 'completed' ? 'x' : item.status === 'in_progress' ? '-' : ' '
    lines.push(`- [${mark}] ${item.id} ${item.text}｜验收：${item.acceptance}`)
  }
  return lines.join('\n')
}
