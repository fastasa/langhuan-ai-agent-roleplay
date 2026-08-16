/**
 * 星依浮坞斜杠命令——命令表与匹配纯逻辑。
 * UI（上拉栏渲染、键盘选择）在 XingyiDock.vue；这里只管「输入文本 → 候选命令」，方便单测锁行为。
 */

export interface XingyiSlashCommand {
  name: string
  usage: string
  // i18n key（模块级 const 用不了 t()，由 XingyiDock 渲染时 t(descriptionKey) 填充）
  descriptionKey: string
}

export const XINGYI_SLASH_COMMANDS: XingyiSlashCommand[] = [
  { name: 'clear', usage: '/clear', descriptionKey: 'xingyi.slash.clearDesc' },
  { name: 'resume', usage: '/resume', descriptionKey: 'xingyi.slash.resumeDesc' },
  { name: 'model', usage: '/model', descriptionKey: 'xingyi.slash.modelDesc' },
  // 立即生成今天日记从设置面板挪到斜杠命令。
  // 本表纯命令列表不感知权限，权限过滤在 XingyiDock.vue 的 slashCommands computed 里做（见该文件）。
  { name: 'diary', usage: '/diary', descriptionKey: 'xingyi.slash.diaryDesc' }
]

export const AGENT_MODEL_SLASH_COMMAND = XINGYI_SLASH_COMMANDS.find(
  (command) => command.name === 'model'
)!

/**
 * 从输入框草稿解析斜杠命令查询词：'/' 开头且后面是单个不含空白的词元才算命令态。
 * 返回 '/' 后的小写查询词（'/' 本身返回 ''）；非命令态（不以 / 开头、含空格或换行）返回 null。
 */
export function parseSlashQuery(draft: string): string | null {
  const text = String(draft ?? '')
  if (!text.startsWith('/')) return null
  const rest = text.slice(1)
  if (/\s/.test(rest)) return null
  return rest.toLowerCase()
}

/** 子串匹配过滤命令（如输入 c 命中 clear）；查询为空返回全部。 */
export function filterSlashCommands(query: string): XingyiSlashCommand[] {
  const normalized = String(query ?? '').toLowerCase()
  if (!normalized) return XINGYI_SLASH_COMMANDS
  return XINGYI_SLASH_COMMANDS.filter((command) => command.name.includes(normalized))
}
