/**
 * 连续工作护栏·共享内核（2026-07-09 星依内核统一批·用户拍板「抽共享内核·彻底统一」）。
 *
 * 由来：runtime 通用收束语义 =「某一轮模型没调用任何工具就认为做完、收束」。这对「多步任务型 agent」太宽松——
 * 模型常光在 thought/正文里说「稍等，我接下来去做 X」却没真调工具，runtime 就当它答完了直接停（星依真机复现：
 * 说要读消息核对却卡住不动、每做完一件事就停要用户再催）。提调早有一套「空转→注入续做提示并续轮」的护栏
 * （见 groupDirectorHarness），但那套与提调决策工具（finishRound/addCastDirection…）强耦合、不通用。
 *
 * 本模块把**通用的那一层**抽出来：一个可配置的「空转续轮门」afterModelMessage hook——
 * 某轮模型没发起任何工具调用、且判定还没真正结束时，注入一条「继续把事做完」的提示并让 runtime 续轮
 * （injectMessages 即 continuation patch，runtime 据此不收束），限次防死循环；超限或已判结束则按原语义自然收束。
 * 提调与星依都装配它，只是「什么算结束（isFinished）」与提示语各自配置——同一台引擎，终止策略按 agent 定。
 */

import type { HookDefinition, HookRuntimeEvent } from './hookRegistry'

/** 全 Agent 共用的“过程话仍未结束”判定。
 *  只识别 Agent 对自己下一步动作的明确承诺，不匹配“接下来你可以……”一类给用户的建议，避免把正常最终答复误续轮。 */
export const AGENT_CONTINUATION_INTENT =
  /(稍等|等一?下|等我|接下来[，,、\s]*我|接着我|马上回来|马上就|这就(去|来|帮|画|建)|让我(先)?(去|来)?(读|查|看|核对|确认|检查|试|建|做|整理|改|画)|我(先)?(去|来|这就)(读|查|看|核对|确认|检查|试|建|做|整理|改|画)|正在(读|查|处理|核对)|现在(最后)?(读|查|看|核对|确认|检查|整理)|下面我(来|去)?|我再(去|来)?(读|查|看|核对)|(?:接下来|下一步|随后)[，,、：:\s]*(?:我)?(?:将|会|要|先|再|继续)?[去来]?(?:读|查|看|核对|确认|检查|整理|处理|修改|写入|保存|落库|调用|执行|生成|训练|评测)|(?:读|查|看|核对|确认|检查|整理|处理|修改|写入|保存|落库|调用|执行|生成|训练|评测).{0,40}后(?:再|然后|之后)?(?:汇总|继续|处理|修改|核对|回复))/

export function isAgentTurnUnfinished(text: string): boolean {
  return AGENT_CONTINUATION_INTENT.test(String(text || ''))
}

export const DEFAULT_PROCESS_MESSAGE_CONTINUATION_NUDGE =
  '你刚才发的是过程消息，后面还有自己已经承诺的步骤。现在立刻继续原计划：需要工具就真正调用工具，需要继续读取、核对、整理或汇总就直接完成；不要停下来等用户再催。只有全部完成后才给最终答复。'

export interface EmptyTurnContinuationGateConfig {
  /** hook id（多 agent 各自装配时给不同 id 便于审计）。缺省 'agent-empty-turn-continuation-gate'。 */
  id?: string
  /** 最多注入几次续做提示（防对话死循环）；超过则按 runtime 原语义自然收束。
   *  可给函数按本轮上下文动态求值（提调据 cast 是否已有取 2/4）。 */
  maxNudges: number | ((event: HookRuntimeEvent) => number)
  /** 是否判定「本轮空转 = 已经真正结束、该收束」——返回 true 则不拦、正常收束。
   *  提调：decisionState.finished；星依：正文没有「我接下来还要继续做」的意图即视为已答完。 */
  isFinished: (event: HookRuntimeEvent) => boolean
  /** 生成注入的续做提示文案（nudgeIndex 从 1 起，可据次数调整措辞）。 */
  buildNudge: (event: HookRuntimeEvent, nudgeIndex: number) => string
  /** 可选：每次注入时的旁路回调（如提调把提示按时序推进重建日志行，让重建 prompt 里也可见）。 */
  onNudge?: (note: string, nudgeIndex: number) => void
}

/**
 * 造一个「空转续轮门」afterModelMessage hook：
 * - 本轮有工具调用 → 不管（在干活）。
 * - 本轮零工具调用且 isFinished → 不管（真做完了，正常收束）。
 * - 本轮零工具调用且未结束且未超次 → 注入续做提示 + continuation patch（runtime 续轮而非收束）。
 * - 超次 → 不再拦（防死循环，按原语义收束）。
 */
export function createEmptyTurnContinuationGate(config: EmptyTurnContinuationGateConfig): HookDefinition {
  let nudgeCount = 0
  return {
    id: config.id ?? 'agent-empty-turn-continuation-gate',
    lifecycle: 'afterModelMessage',
    run: (event) => {
      const calls = event.modelToolCalls ?? []
      if (calls.length > 0) return undefined
      if (config.isFinished(event)) return undefined
      const maxNudges = typeof config.maxNudges === 'function' ? config.maxNudges(event) : config.maxNudges
      if (nudgeCount >= maxNudges) return undefined
      nudgeCount += 1
      const note = config.buildNudge(event, nudgeCount)
      config.onNudge?.(note, nudgeCount)
      return {
        summary: `连续工作护栏 ${nudgeCount}/${config.maxNudges}：模型空转未收尾，注入续做提示并续轮`,
        injectMessages: [{ role: 'user', content: note, purpose: 'calibration' }]
      }
    }
  }
}
