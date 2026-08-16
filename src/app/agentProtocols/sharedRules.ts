/**
 * 跨 loop 共用的「护栏核心句」集中真值（agentProtocols 集中目录）。
 *
 * 背景（P2 批 E2·2026-07-12 架构审查报告拍板）：「必须真发起原生函数调用才生效，光在 thought
 * 里写不算」这条规则在提调统筹/纠偏/星依等 7+ 处手写、互不 import，改一处措辞要人肉追全部
 * 规则正文保持短小，并由调用方在运行时组合。
 * 本文件把各处共享的**核心句**收成常量，各消费点保留自己的前后文语境（具体工具名、具体触发
 * 场景、具体后续动作），只在核心句处插入本常量，避免重复措辞各自漂移。
 *
 * 约束：本文件是叶子模块，禁止 import 任何 app loop 文件，只导出字符串常量。
 */

/**
 * 「工具必须真发起原生函数调用才生效」核心句。
 *
 * 由来：多次真机复现——模型把工具调用误当成「在 thought/正文里描述打算」就等于已经执行
 * （提调统筹把 generatePlanBatch 当异步派发、只在 thought 写"已发出"就收尾；提调空转时只在
 * thought 写"已安排"不真发起决策工具；星依说"稍等我去做"却不调用工具）。本句点破：只有真
 * 正发起原生函数调用，工具才会被执行；仅在 thought/正文里写"已完成/已安排/已发出"，不会触
 * 发任何工具执行，什么都不会发生。
 *
 * 消费点（各自保留本地语境·只嵌这句核心，前后具体措辞见各文件）：
 * - groupDirectorPass.ts：决策纲领「原则」段 + 续轮收束句（重建带操作日志时的续做提示）
 * - groupDirectorHarness.ts：情境正文定界 contentSuffix + 两条空转 nudge（cast 有/空两支）
 * - agentProtocols/replyPlanProtocols.ts：TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL
 * - xingyiCharter.ts：星依纲领「连续工作·一次把事做完」段
 * - xingyiAgentHarness.ts：continuationGate 空转 nudge（buildNudge）
 */
export const TOOL_CALL_REALITY_RULE =
  '只有真正发起原生函数调用，工具才会被执行——其结果会在下一轮以 toolResult 消息返回给你；光在 thought 或正文里写「已经做了/已发出/已安排」，不会触发任何工具执行，什么都不会发生。'
