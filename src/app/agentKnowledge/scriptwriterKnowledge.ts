import scriptwriterKnowledgeMarkdown from '../../../docs/agents/编剧/通用知识.md?raw'

/**
 * 编剧（剧本 subagent）知识库·运行时读取 + 全文注入（剧本系统优化批次2 · 2026-07-10）。
 *
 * 真值源文：docs/agents/编剧/通用知识.md（用户可查改的 md）——叙事种子 15 字段协议、
 * 到时判断/前后台演化规则、完整示例和剧作方法论。
 *
 * 与提调知识库（tidiaoKnowledge）的分工差异：编剧的知识=纯方法论，每次编本都该在场，
 * 这些规则每次正式编本都必须在场——**全文注入不做渐进披露**；运行时结构校验
 * 住编剧纲领 SCRIPTWRITER_SYSTEM_PROMPT，两处不重复。
 *
 * 容错口径同提调：读不到源文（路径不符/测试环境异常）返回空串，注入侧据空跳过——
 * 方法论缺失但结构性铁律仍完整，编剧照常工作。
 */

/** 精确读取编剧知识库唯一源文，不扫描其它 Agent 文档。 */
function loadScriptwriterKnowledgeRaw(): string {
  return typeof scriptwriterKnowledgeMarkdown === 'string' ? scriptwriterKnowledgeMarkdown : ''
}

/**
 * 构造编剧 system 的剧作方法论知识块（buildScriptwriterMessages 拼在纲领之后）。
 * 过滤给维护者看的行（一级标题、「> 」开头的状态/分工说明），只注入方法论正文；空源文返回空串。
 */
export function buildScriptwriterKnowledgeBlock(): string {
  const raw = loadScriptwriterKnowledgeRaw()
  if (!raw.trim()) return ''
  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('# ') && !line.startsWith('> '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!body) return ''
  return `【剧作方法论（你编本时的专业修养·逐条落到对应字段）】\n${body}`
}
