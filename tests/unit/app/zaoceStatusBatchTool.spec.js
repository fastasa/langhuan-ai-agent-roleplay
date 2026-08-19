import { describe, expect, it, vi } from 'vitest'
import {
  createZaoceApplyStatusPanelBatchTool,
  ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME
} from '../../../src/app/zaoceStatusBatchTool.ts'
import {
  runZaoceBuild,
  ZAOCE_SUBMIT_TOOL_NAME
} from '../../../src/app/zaoceSubagent.ts'

function field(key = 'mood', valueType = 'text') {
  return { key, label: key === 'mood' ? '心情' : key, valueType }
}

function template(overrides = {}) {
  return {
    id: 'tpl_character',
    sessionId: 'session_1',
    kind: '角色状态',
    name: '角色模板',
    description: '记录角色状态',
    fields: [field()],
    version: 2,
    ...overrides
  }
}

function panel(overrides = {}) {
  return {
    id: 'panel_existing',
    sessionId: 'session_1',
    templateId: 'tpl_character',
    name: '旧角色',
    description: '记录旧角色状态',
    hostType: 'session_character',
    hostId: 'participant_old',
    values: { mood: '平静' },
    fields: [field()],
    version: 3,
    ...overrides
  }
}

function context(overrides = {}) {
  const templates = overrides.templates ?? [template()]
  const panels = overrides.panels ?? []
  return {
    sessionId: 'session_1',
    worldId: 'world_1',
    sourceAgentRunId: 'zaoce_run_1',
    sourceMessageId: 'message_9',
    characterOptions: [
      { id: 'character_1', participantId: 'participant_1', name: '星依' },
      { id: 'character_old', participantId: 'participant_old', name: '旧角色' }
    ],
    repository: {
      fetchTemplates: vi.fn(async () => templates),
      saveTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      fetchPanels: vi.fn(async () => panels),
      savePanel: vi.fn(),
      deletePanel: vi.fn(),
      fetchTempEntities: vi.fn(async () => [{ id: 'temp_lamp', name: '油灯' }])
    },
    execute: vi.fn(async (_sessionId, commands) => ({
      viewRevision: 'rev_2',
      operations: commands.map((command) => ({
        command: command.command,
        targetRef: command.targetRef,
        version: command.expectedVersion + 1
      }))
    })),
    ...overrides
  }
}

function call(args, callId = 'call_batch') {
  return {
    kind: 'toolCall',
    callId,
    toolName: 'applyStatusPanelBatch',
    stage: 'status-authoring',
    args,
    expectation: '整批原子写入并返回逐项回执',
    requestedAtTurn: 0
  }
}

describe('createZaoceApplyStatusPanelBatchTool', () => {
  it('单 panel：代码补齐正式 scope、hostId、创建 id 与幂等键，并只调用一次事务 execute', async () => {
    const ctx = context()
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const result = await tool.execute(call({
      panels: [{
        template: '角色模板',
        name: '星依',
        description: '记录星依在本会话里的情绪',
        hostType: 'session_character',
        host: '星依',
        values: { mood: '有点好奇' },
        valueProvenance: { mood: 'inferred' }
      }]
    }), { turnIndex: 0 })

    expect(ctx.execute).toHaveBeenCalledTimes(1)
    const [sessionId, commands] = ctx.execute.mock.calls[0]
    expect(sessionId).toBe('session_1')
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({
      command: 'saveStatusPanel',
      sessionId: 'session_1',
      worldId: 'world_1',
      targetRef: { kind: 'status_panel', panelId: expect.stringMatching(/^status_panel_zaoce_[0-9a-f]{16}$/) },
      expectedVersion: 0,
      idempotencyKey: expect.stringMatching(/^zaoce:/),
      source: { sourceMessageId: 'message_9', sourceAgentRunId: 'zaoce_run_1' },
      payload: {
        templateId: 'tpl_character',
        hostType: 'session_character',
        hostId: 'participant_1',
        values: { mood: '有点好奇' },
        valueProvenance: { mood: 'inferred' }
      }
    })
    expect(result.status).toBe('success')
    expect(result.acted).toBe(true)
    expect(result).not.toHaveProperty('closingNote')
    expect(result.details.receipts).toEqual([
      expect.objectContaining({ kind: 'panel', name: '星依', action: 'create', version: 1, valueProvenance: { mood: 'inferred' } })
    ])
  })

  it('会话角色缺少正式 participantId 时在事务前拦截，绝不把 characterId 冒充 hostId', async () => {
    const ctx = context({
      characterOptions: [{ id: 'character_1', name: '星依' }]
    })
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const result = await tool.execute(call({
      panels: [{
        template: '角色模板',
        name: '星依',
        description: '记录星依状态',
        hostType: 'session_character',
        host: '星依',
        values: { mood: '平静' },
        valueProvenance: { mood: 'observed' }
      }]
    }), { turnIndex: 0 })

    expect(result).toMatchObject({
      status: 'error',
      error: {
        type: 'TOOL_RUNTIME_ERROR',
        retryable: true,
        details: { panelIndex: 0, characterId: 'character_1', host: '星依' }
      }
    })
    expect(String(result.content)).toContain('缺少正式 participantId')
    expect(String(result.content)).toContain('不能用 characterId 代替')
    expect(ctx.execute).not.toHaveBeenCalled()
  })

  it('多 panel + 新模板：命令严格按模板、panel[0]、panel[1] 排列，同批面板复用预分配模板 id', async () => {
    const ctx = context({ templates: [], panels: [] })
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const result = await tool.execute(call({
      template: {
        name: '工地器具模板',
        kind: '建筑用具',
        description: '记录工地器具状态',
        fields: [{ key: 'condition', label: '状况', valueType: 'text' }]
      },
      panels: [
        {
          name: '羊角锤',
          description: '记录羊角锤的损耗',
          hostType: 'none',
          values: { condition: '完好' },
          valueProvenance: { condition: 'observed' }
        },
        {
          name: '冲击钻',
          description: '记录冲击钻的电量与使用状态',
          hostType: 'none',
          values: { condition: '待充电' },
          valueProvenance: { condition: 'creative_default' }
        }
      ]
    }), { turnIndex: 0 })

    expect(ctx.execute).toHaveBeenCalledTimes(1)
    const commands = ctx.execute.mock.calls[0][1]
    expect(commands.map((command) => command.command)).toEqual([
      'saveStatusPanelTemplate',
      'saveStatusPanel',
      'saveStatusPanel'
    ])
    const templateId = commands[0].targetRef.templateId
    expect(templateId).toMatch(/^status_template_zaoce_[0-9a-f]{16}$/)
    expect(commands[1].payload.templateId).toBe(templateId)
    expect(commands[2].payload.templateId).toBe(templateId)
    expect(commands[2].payload.valueProvenance).toEqual({ condition: 'creative_default' })
    expect(result.details.receipts.map((receipt) => receipt.kind)).toEqual(['template', 'panel', 'panel'])
    expect(result.details.receipts.map((receipt) => receipt.name)).toEqual(['工地器具模板', '羊角锤', '冲击钻'])
    expect(result.details.receipts[2].valueProvenance).toEqual({ condition: 'creative_default' })
  })

  it('新模板的受控展示骨架随原子批写入，并播种为 panel 独立快照', async () => {
    const ctx = context({ templates: [], panels: [] })
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const presentation = {
      schemaVersion: 1,
      blocks: [{ id: 'total', type: 'metric', title: '总人口', value: { op: 'field', fieldKey: 'total' } }]
    }

    await tool.execute(call({
      template: {
        name: '人口模板', kind: '人口', description: '人口概览',
        fields: [{ key: 'total', label: '总人口', valueType: 'number' }],
        presentation
      },
      panels: [{ name: '卡维安诸部', description: '记录人口总量与结构', hostType: 'none', values: { total: 720000 }, valueProvenance: { total: 'observed' } }]
    }), { turnIndex: 0 })

    const commands = ctx.execute.mock.calls[0][1]
    expect(commands[0].payload.presentation).toEqual(expect.objectContaining({ schemaVersion: 1 }))
    expect(commands[0].payload.presentation.blocks[0]).toEqual(expect.objectContaining({ id: 'total', type: 'metric', span: 1 }))
    expect(commands[1].payload.presentation).toEqual(commands[0].payload.presentation)
  })

  it('未知块、任意脚本和不存在的字段在组装阶段就被拒绝，不进入事务 execute', async () => {
    const ctx = context()
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const result = await tool.execute(call({
      template: {
        template: '角色模板',
        presentation: { schemaVersion: 1, blocks: [{ id: 'unsafe', type: 'metric', value: { op: 'field', fieldKey: 'missing' }, script: 'alert(1)' }] }
      },
      panels: [{ name: '不会落库', description: '用于验证拒绝', template: '角色模板', hostType: 'none', values: { mood: '平静' } }]
    }), { turnIndex: 0 })

    expect(result.status).toBe('error')
    expect(String(result.content)).toMatch(/未支持属性|script/)
    expect(ctx.execute).not.toHaveBeenCalled()
  })

  it('更新模板和 panel：解析既有目标并携带现役版本，未指定宿主与描述保持原值', async () => {
    const existingPanel = panel()
    const ctx = context({ panels: [existingPanel] })
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const result = await tool.execute(call({
      template: { template: '角色模板', description: '更新后的模板用途' },
      panels: [{
        panel: '旧角色',
        values: { mood: '警觉' },
        valueProvenance: { mood: 'observed' }
      }]
    }), { turnIndex: 0 })

    const commands = ctx.execute.mock.calls[0][1]
    expect(commands[0]).toMatchObject({
      command: 'saveStatusPanelTemplate',
      targetRef: { templateId: 'tpl_character' },
      expectedVersion: 2,
      payload: { description: '更新后的模板用途' }
    })
    expect(commands[1]).toMatchObject({
      command: 'saveStatusPanel',
      targetRef: { panelId: 'panel_existing' },
      expectedVersion: 3,
      payload: {
        description: '记录旧角色状态',
        hostType: 'session_character',
        hostId: 'participant_old',
        values: { mood: '警觉' },
        valueProvenance: { mood: 'observed' }
      }
    })
    expect(result.details.receipts.map((receipt) => receipt.action)).toEqual(['update', 'update'])
  })

  it('局部更新多字段 panel 时保留本次未修改的既有值', async () => {
    const fields = [field('mood'), field('energy', 'number')]
    const existingTemplate = template({ fields })
    const existingPanel = panel({ fields, values: { mood: '平静', energy: 80 } })
    const ctx = context({ templates: [existingTemplate], panels: [existingPanel] })
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)

    await tool.execute(call({
      panels: [{ panel: '旧角色', values: { mood: '警觉' }, valueProvenance: { mood: 'observed' } }]
    }), { turnIndex: 0 })

    expect(ctx.execute.mock.calls[0][1][0].payload).toMatchObject({
      values: { mood: '警觉', energy: 80 },
      valueProvenance: { mood: 'observed' }
    })
  })

  it('事务失败返回可重试 tool error；同一批重试生成完全相同的创建 id 与幂等键', async () => {
    const attemptedCommands = []
    const ctx = context({
      execute: vi.fn(async (_sessionId, commands) => {
        attemptedCommands.push(commands)
        throw new Error('状态栏版本冲突：当前版本 2，提交版本 1')
      })
    })
    const tool = createZaoceApplyStatusPanelBatchTool(ctx)
    const toolCall = call({
      panels: [{
        template: '角色模板',
        name: '星依',
        description: '记录星依状态',
        hostType: 'session_character',
        host: '星依',
        values: { mood: '平静' },
        valueProvenance: { mood: 'unknown' }
      }]
    })

    const first = await tool.execute(toolCall, { turnIndex: 0 })
    const second = await tool.execute(toolCall, { turnIndex: 1 })

    expect(first).toMatchObject({
      status: 'error',
      error: { type: 'TOOL_RUNTIME_ERROR', retryable: true },
      details: { retryWithSameBatch: true }
    })
    expect(second.error.retryable).toBe(true)
    expect(attemptedCommands).toHaveLength(2)
    expect(attemptedCommands[1]).toEqual(attemptedCommands[0])
    expect(attemptedCommands[0][0].targetRef.panelId).toMatch(/^status_panel_zaoce_[0-9a-f]{16}$/)
    expect(attemptedCommands[0][0].idempotencyKey).toMatch(/^zaoce:/)
  })
})

describe('runZaoceBuild · 真实批写回执到结构化交稿', () => {
  it('panel 写入成功后允许 submitPanels，并以真实 receipt 名称完成任务', async () => {
    const applyTool = {
      name: ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME,
      brief: '测试用原子批写',
      schema: { type: 'object', properties: { panels: { type: 'array' } }, required: ['panels'] },
      execute: vi.fn(async () => ({
        content: '批写成功',
        status: 'success',
        acted: true,
        details: {
          receipts: [{
            index: 0,
            kind: 'panel',
            name: '奥菲利娅·冲突处境状态栏',
            action: 'create',
            command: 'saveStatusPanel',
            targetId: 'panel_ophelia',
            version: 1,
            idempotencyKey: 'zaoce:test'
          }]
        }
      }))
    }
    let modelTurn = 0
    const result = await runZaoceBuild('【建栏任务】记录奥菲利娅的长期状态变化', {
      sessionId: 'session_ophelia',
      contextBlock: '【当前会话】奥菲利娅是本会话正式参与者。',
      taskKey: 'ophelia-regression',
      tools: [applyTool],
      callModel: vi.fn(async () => {
        modelTurn += 1
        if (modelTurn === 1) {
          return {
            content: '',
            toolCalls: [{
              id: 'apply_1',
              type: 'function',
              function: {
                name: ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME,
                arguments: JSON.stringify({ panels: [{ name: '奥菲利娅·冲突处境状态栏' }] })
              }
            }]
          }
        }
        return {
          content: '',
          toolCalls: [{
            id: 'submit_1',
            type: 'function',
            function: {
              name: ZAOCE_SUBMIT_TOOL_NAME,
              arguments: JSON.stringify({ summary: '已依据当前会话记录创建长期状态栏。' })
            }
          }]
        }
      })
    })

    expect(applyTool.execute).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      ok: true,
      summary: '已依据当前会话记录创建长期状态栏。',
      panels: ['奥菲利娅·冲突处境状态栏']
    })
    expect(result.error).toBeUndefined()
  })
})
