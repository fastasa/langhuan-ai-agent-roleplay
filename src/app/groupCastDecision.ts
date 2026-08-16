/**
 * 群聊 cast 兜底纯逻辑层（批次6 → D7 收敛）。
 *
 * 现役定位：**只剩「forced/cast 合并 + 转 replyOrder + 确定性兜底」三件纯逻辑**，供 `useChatSendPipeline`
 * 在群聊统筹（`decideRoundDirector` → `groupDirectorHarness`）失败/空剧本时回退用。
 *
 * 已退役删除（D7·2026-06-22）：旧「一次性 callAI cast pass」的 `buildGroupCastMessages`/`parseGroupCastDecision`
 * 与 `CAST_SYSTEM_PROMPT`、`GroupCastDecisionInput`/`GroupCastCandidate` 类型——它们早被群聊统筹 pass 取代、
 * 无任何运行时消费者（仅自测引用），作为过渡资产长期残留成双真值风险，本批确认后删除（git 历史可回溯）。
 */

/**
 * 合并 forced（点名/@）与提调 cast：forced 按检测顺序最前，再接提调 cast；
 * 去重保序、剔除 excluded 与非候选。返回最终有序 characterId 列表。
 */
export function mergeForcedAndCast(
  forcedCharacterIds: string[],
  castCharacterIds: string[],
  excludedCharacterIds: string[],
  candidateIds: string[]
): string[] {
  const candidateSet = new Set(candidateIds)
  const excluded = new Set(excludedCharacterIds)
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of [...forcedCharacterIds, ...castCharacterIds]) {
    const trimmed = String(id ?? '').trim()
    if (!trimmed || seen.has(trimmed) || excluded.has(trimmed) || !candidateSet.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/** 有序 characterId → 群聊执行所需 replyOrder 形状（cast 选中的都 mustReply）。 */
export function castIdsToReplyOrder(ids: string[]): Array<{ characterId: string; mustReply: boolean; probability: number }> {
  return ids.map((characterId) => ({ characterId, mustReply: true, probability: 1 }))
}

/**
 * 批次6 兜底退役（稳妥版）：提调 cast 决策失败/空时的**确定性**兜底，替换旧的「概率随机+昵称」发言权。
 * 规则：forced（点名/@）最前，其余候选按原顺序全部出场；剔除 excluded 与非候选；去重保序。
 * 退役了「随机概率挑人」，又不让群聊哑火（不依赖 cast 模型这一单点）。
 */
export function buildDeterministicCastFallback(
  candidateIds: string[],
  forcedCharacterIds: string[],
  excludedCharacterIds: string[]
): string[] {
  // forced 在前 + 全体候选按序，交给 mergeForcedAndCast 统一去重/剔除/保序。
  return mergeForcedAndCast(forcedCharacterIds, candidateIds, excludedCharacterIds, candidateIds)
}
