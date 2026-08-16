import type { PostRoundTriggerKind } from '../../shared/postRoundOrchestration'

export function buildPostRoundDirectorDirective(input: {
  triggerKind: PostRoundTriggerKind
  suppressAudienceOutputs: boolean
}): string {
  if (input.triggerKind === 'focused_action' && input.suppressAudienceOutputs) {
    return '【私密动作后的轮后核账】动作原文与正式消息模型生成的动作结果已经落库，但只允许用户与提调知道。你只核对这些已发生内容造成的后台事实，按证据更新状态、帷幕与叙事种子，并结算全部待引爆种子。不得安排任何角色回复，不得新增旁白，也不得在剧本方向、角色提示词或可见消息中转述动作意图、观察过程或观察结果。后台落账完成后允许零角色、零旁白直接收尾。'
  }
  if (input.triggerKind === 'focused_action') {
    return '【公开动作后的轮后审计】动作原文与正式消息模型生成的动作结果已经落库、已经发生，不要重写这个动作。先核对它实际造成的状态栏、帷幕、在场与授权世界事实变化，再结算全部待引爆种子。公开只表示现场角色可以感知，不要把公开等同于必须安排角色回复；只在这个动作确实造成了当前场景不可缺少的即时反应时，才补必要旁白或受影响角色的方向。没有缺口就只落账收尾。'
  }
  return '【快速回复后的轮后审计与补演】本轮用户消息及其后的快速角色正文已经正式落库、已经发生，不能重复招呼或重演。先核对这些正文实际造成的状态栏、在场、帷幕与授权世界事实变化；再结算全部待引爆种子。对照剧本与隐藏因果，只补快速正文因为不知道后台信息而漏掉、且当前场景确实应该出现的内容：需要时用 confirmNarrationCall 补旁白，必要时再用 addCastDirection 安排受影响角色继续反应。确实只需后台落账时允许零角色、零旁白直接收尾；不要把尚无证据的预期后果冒充已发生事实。'
}
