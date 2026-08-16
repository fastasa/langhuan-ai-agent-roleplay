/**
 * 星依功能桥（批次2 功能工具化）—— 「双入口一真值」的接线层。
 *
 * 真值约束：
 * 编译页/优化关系/生成角色/总结对话的 execute 核心只有一份，就是各页面按钮现役 handler。
 * 组件挂载时把自己的 handler 注册进本桥（卸载时注销），星依工具通过桥调用**同一个函数**——
 * 不复制生成/导入/落库逻辑，也不绕开组件内的冲突弹窗与持久化队列（避免与打开中的页面产生真值冲突）。
 *
 * 边界：provider 不在场（对应页面没打开/组件未挂载）时，星依工具如实告知用户去打开对应页面，
 * 不做 repository 直写旁路（那会与组件内存态整包快照保存互相覆盖——若未来要做「页面未开也能写」，
 * 必须先解决快照并发真值，另立批次）。
 */

/** 功能执行结果：ok=是否成功；message=给星依转述给用户的人话结论。 */
export interface XingyiFunctionRunResult {
  ok: boolean
  message: string
}

/** 单位当前编译页读侧快照（refId=正式ID，构建 target 注释用；refId 为空的单位无法定点导入）。 */
export interface XingyiCompilePageSnapshot {
  title: string
  refId: string
  summary: string
  tags: string[]
  semanticType: string
  relationHints: string[]
}

/** 单位类工具提供方（世界书文档库 / 某个角色的大脑）。 */
export interface XingyiUnitToolProvider {
  /** 当前语境标签（世界书=固定文案；角色大脑=角色名），确认门与回报用。 */
  contextLabel: () => string
  /** 当前可选单位清单（unitId + 标题），供名称→id 解析。 */
  listUnits: () => Array<{ unitId: string; title: string }>
  /** 生成编译页（=按钮同款 handler，含 AI 生成+冲突处理+落库+任务通知）。 */
  generateCompilePage: (unitIds: string[], sourceLabel: string) => Promise<XingyiFunctionRunResult>
  /** 优化关系提示（=按钮同款 handler；导入前会在页面上弹 review 弹窗，需用户在页面确认）。 */
  optimizeRelations: (unitIds: string[], sourceLabel: string) => Promise<XingyiFunctionRunResult>
  /** 读单位当前编译页（批次2.5-③ 精确修改的读侧；单位不存在返回 null）。 */
  readCompilePage: (unitId: string) => XingyiCompilePageSnapshot | null
  /** 导入批量编译页 markdown（=按钮同款导入链路，含字段冲突弹窗+持久化队列）。 */
  importCompilePageMarkdown: (unitIds: string[], markdown: string) => Promise<XingyiFunctionRunResult>
}

/** 自动生成角色提供方（角色编辑弹窗组件注册，常驻挂载于 WorkspaceShellRoot）。 */
export interface XingyiCharacterCreateProvider {
  generateCharacter: (brief: string) => Promise<XingyiFunctionRunResult>
}

/** 总结对话提供方（app shell 聊天桥注册，作用于当前活动会话）。 */
export interface XingyiChatSummaryProvider {
  /** 当前活动会话上下文；没有活动会话返回 null。 */
  getContext: () => {
    sessionId: string
    sessionTitle: string
    characterOptions: Array<{ id: string; name: string }>
  } | null
  /** 对当前活动会话按角色执行投影写轨迹（=总结对话按钮的核心链路）。 */
  runSummary: (characterIds: string[]) => Promise<XingyiFunctionRunResult>
}

export interface XingyiFunctionProviders {
  worldbookUnits: XingyiUnitToolProvider
  characterBrainUnits: XingyiUnitToolProvider
  characterCreate: XingyiCharacterCreateProvider
  chatSummary: XingyiChatSummaryProvider
}

export type XingyiFunctionProviderKey = keyof XingyiFunctionProviders

const providers = new Map<XingyiFunctionProviderKey, XingyiFunctionProviders[XingyiFunctionProviderKey]>()

/** 注册 provider，返回注销函数。注销只在「仍是自己」时移除——防止晚到的旧注销把新注册顶掉。 */
export function registerXingyiFunctionProvider<K extends XingyiFunctionProviderKey>(
  key: K,
  provider: XingyiFunctionProviders[K]
): () => void {
  providers.set(key, provider)
  return () => {
    if (providers.get(key) === provider) providers.delete(key)
  }
}

export function getXingyiFunctionProvider<K extends XingyiFunctionProviderKey>(
  key: K
): XingyiFunctionProviders[K] | null {
  return (providers.get(key) as XingyiFunctionProviders[K] | undefined) ?? null
}

/** 仅测试用：清空全部注册（避免用例间串台）。 */
export function resetXingyiFunctionProvidersForTest(): void {
  providers.clear()
}
