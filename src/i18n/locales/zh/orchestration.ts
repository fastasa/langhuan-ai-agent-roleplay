export const orchestration = {
  zones: { overview: '总览', roles: '角色与登退场', statusbar: '状态栏', seeds: '叙事种子', timeline: '时间线' },
  zoneSubtitles: { overview: '当前会话的场景与剧本约束', roles: '会话成员、分支挂载与正式在场事实', statusbar: '角色和世界实体的同源状态快捷视图', timeline: '最近情境、轮级产物与正式变化' },
  actions: { refresh:'刷新',openMap:'打开舆图',saveScene:'保存场景',saveOverride:'保存约束',openStatus:'查看状态',editInStatus:'在状态系统编辑',expandStatus:'展开',collapseStatus:'收起',markPresent:'标记在场',markOffstage:'标记离场',confirmFact:'确认发生',cancelProposal:'取消预计' },
  fields: { sceneName:'场景名',time:'时间',weather:'天气',largeLocation:'大地点',middleLocation:'中地点',smallLocation:'小地点',sceneDescription:'场景描述' },
  overview: { scene:'当前帷幕',presentCount:'当前在场',seedCount:'活跃种子',pendingCount:'待确认',statusCount:'状态面板',sessionConstraint:'会话剧本约束',worldConstraintInherited:'继承世界约束',sessionConstraintHint:'约束当前会话的叙述方式、推进原则和内容边界，不修改世界本身。',overridePlaceholder:'只作用于当前会话；留空表示完全继承世界约束。' },
  curtain: {
    mapSheet:'世界图纸',followDefault:'跟随默认（{name}）',defaultMapSheet:'默认图纸',
    realLocation:'现实地点',virtualTime:'虚拟时间',quickTime:'快捷时间',timeRate:'时间倍率',virtualWeather:'虚拟天气',weatherDescription:'天气描述',
    now:'现在',clear:'清空',followRealWeather:'跟随现实天气',customWeather:'自定义天气',restoreReality:'恢复现实',save:'保存',
    largeLocationPlaceholder:'例如：维斯珂',middleLocationPlaceholder:'例如：旧宅',smallLocationPlaceholder:'例如：书房',realLocationPlaceholder:'例如：临平',weatherPlaceholder:'例如：微雨'
  },
  presence: { present:'在场',offstage:'离场',unknown:'未确认' },
  stateMode: { follow_main:'跟随角色主线',independent_snapshot:'独立会话快照' },
  roles: { branchReady:'私有分支已挂载',pendingTransition:'预计变为“{state}”，尚未成为事实',noLocation:'未记录地点',empty:'当前会话没有角色成员。' },
  status: { untitled:'未命名状态栏',characterHost:'会话角色',worldHost:'世界实体',sessionHost:'会话',noValues:'暂无状态值',structuredValue:'结构化内容',empty:'当前会话与世界尚无状态栏。' },
  timeline: { lastScenario:'最近情境',recentRound:'最近轮级产物',messageAnchor:'消息锚点 {id}',presenceProposal:'待核验登退场',seedUpdated:'种子更新',empty:'还没有可展示的编排变化。' },
  timelineKinds: { message:'实际消息',presence_fact:'在场事实',seed_fact:'种子事实',status_update:'状态更新' },
  conflicts: { stale_version:'版本已变化',unresolved_legacy_host:'旧宿主待审查',missing_branch:'缺少私有分支',unknown_presence:'在场状态未确认' },
  evidence: { sceneManual:'用户在剧本工作台手动修改当前帷幕',overrideManual:'用户在剧本工作台手动修改会话剧本约束',presenceManual:'用户在剧本工作台将{name}标记为{state}',proposalCommitted:'用户确认{name}的预计登退场已经发生',proposalCancelled:'用户确认{name}的预计登退场没有发生' }
}
