/** 星依浮坞命名空间（批次 6·src/app 灰区）：XingyiDock 浮坞 UI 壳 + 斜杠命令说明。
 *  ⚠️ 星依人设文案（思考中/失败回复/placeholder）保留可爱随意语气；ja 不用丁寧体一刀切。 */
export const xingyi = {
  title: '星依',
  thinking: '星依思考中…',
  autoApproveOn: '自动放行',
  autoApproveOff: '写前确认',
  autoApproveOnHint: '当前：写操作自动放行，不再弹确认卡（点按或 Shift+Tab 切回）',
  autoApproveOffHint: '当前：写操作先弹确认卡（点按或 Shift+Tab 切到自动放行）',
  autoApproveGlyphOn: '放',
  autoApproveGlyphOff: '确',
  confirmExecute: '确认执行',
  noMatchCommand: '没有匹配的命令',
  resumeTitle: '过往对话',
  resumeEmpty: '还没有过往对话',
  untitledConversation: '未命名对话',
  deleteConversation: '删除这段对话',
  deleteConversationWarn: '删除后连同消息一起永久删除，不能恢复。',
  deleteConversationFailed: '呜……删除这段对话失败了，稍后再试一次好吗？',
  currentSessionMark: '当前 · ',
  messageCount: '{count}条',
  inputPlaceholder: '和星依说点什么…（/ 唤出命令）',
  activitySearching: '星依在查资料（{tool}）…',
  activityWorking: '星依在做事情（{tool}）…',
  newChatFailed: '呜……开启新对话失败了，稍后再试一次好吗？',
  resumeFailed: '呜……恢复过往对话失败了，稍后再试一次好吗？',
  emptyReply: '呜……星依这轮没说出话来，再问一次好吗？',
  errorReply: '星依这边出错了：{detail}',
  // 运行状态灯（批 D）：色点+文案，四态由 running/pending/上轮出错派生
  statusIdle: '待命中',
  statusRunning: '处理中',
  statusWaiting: '等你确认',
  statusError: '出错了',
  // 收起态全局入口与 Agent 任务面板（2026-07-10 星依 UI 重构·收编原右上角提示灯）
  statusSuccess: '已完成',
  launcherAria: '打开星依浮坞',
  emptyHint: '有什么想让星依帮忙的呀？输入 / 可以唤出命令。',
  taskDetail: '任务详情',
  taskGoConfirm: '前往确认',
  taskDismiss: '关闭任务提示',
  // 浮坞私有夜间开关（2026-07-11）：只翻浮坞窗体皮肤，不动全局主题
  dockThemeToDark: '小窗切到夜间',
  dockThemeToLight: '小窗切到日间',
  // 停止按钮（2026-07-13）：仅本轮进行中显示，点击中断星依当前 turn + 已派发子代理（绘舆/采风）
  stopTurn: '停止',
  // 星依派出的子agent运行卡·纠偏轮卡种文案（地图严谨协作与运行卡计划批1·2026-07-11）
  dispatchTidiaoLabel: '提调',
  dispatchTidiaoVerb: '纠偏中',
  dispatchTidiaoFallbackTitle: '纠偏任务',
  // askUser 卡族留档（2026-07-11 用户真机拍板：确认卡答完不消失，转成对话记录落库）
  askArchiveTitle: '【确认卡】',
  askDismissedAnswer: '（关闭了卡片，未答复）',
  // 输入框图片上传（2026-07-11 批5·浮坞接线）：纯图片无文字时落库/气泡都用这句占位
  imageOnlyPlaceholder: '[图片]',
  // 带图乐观发送（2026-07-11）：这条消息乐观显示了，但后台上传/发送最终出错时的失败视觉提示
  sendFailedHint: '发送可能没成功，稍后刷新看看吧',
  // 绘舆草案确认卡「在地图上看草案」入口（地图草案剪影可视化计划批3·2026-07-12）
  viewDraftOnMap: '在地图上看草案',
  // 星依设置面板：桌宠显示与日记视角都是本地工作区设置。
  xingyiSettingsAria: '星依设置',
  xingyiSettingsTitle: '星依设置',
  desktopPetLabel: '桌面桌宠',
  desktopPetHint: '关闭后保留对话入口，可随时回来重新打开。',
  diaryViewpointLabel: '日记视角',
  diaryViewpointXingyi: '星依第一人称',
  diaryViewpointObjective: '第三人称客观',
  diaryViewpointLoading: '读取设置中…',
  diaryViewpointSaving: '保存中…',
  diaryViewpointLoadFailed: '视角读取失败：{detail}',
  diaryViewpointSaveFailed: '视角保存失败：{detail}',
  diaryGenerateNow: '立即生成今天日记',
  diaryGenerating: '生成中…',
  diaryGenerateSuccess: '已生成 {dateStr}.md',
  diaryGenerateFailed: '生成失败：{detail}',
  // 斜杠命令说明（命令串 /clear /resume /diary 本身保留，只翻说明）
  slash: {
    clearDesc: '清除当前对话上下文，开启新对话',
    resumeDesc: '查看过往对话并恢复',
    modelDesc: '切换本对话的模型与努力程度',
    diaryDesc: '生成今天的星依日记',
    buildWorldDesc: '一句话创建分组角色、开场环境与状态栏齐全的可玩世界，最后生成头像'
  }
}
