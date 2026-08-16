/** 工作区专业Agent共享壳命名空间（2026-07-17 地图/剧本工作区专业Agent计划批A）：
 *  编剧/舆图师共用的通用对话壳文案，身份/作用域短标签由调用方数据驱动，不在此写死。 */
export const workspaceAgent = {
  sendButton: '发送',
  stopButton: '停止',
  newConversation: '新建对话',
  historyMenu: '历史对话',
  collapsePanel: '收起{name}对话框',
  expandPanel: '展开{name}对话框',
  historyEmpty: '还没有过往对话',
  inputPlaceholder: '说点什么…',
  emptyMessages: '暂无消息，说点什么开始吧',
  modelSlashDescription: '切换本对话的 Agent 模型与努力程度',
  modelPickerTitle: '本对话模型',
  modelPickerKeyboardHint: '↑↓ 模型 · ←→ 努力',
  modelPickerModelLabel: 'Agent 模型',
  modelPickerEffortLabel: '努力',
  modelPickerFollowPreset: '跟随槽位预设',
  modelPickerDefaultEffort: '默认',
  modelPickerDefaultEffortWithValue: '默认（{effort}）',
  modelSlot: {
    fast: '书童',
    balanced: '校书',
    smart: '掌阁'
  },
  historyLoadFailed: '聊天记录加载失败，请重新打开后再试',
  scopeUnavailable: '当前还没有可用的专业工作范围。',
  inputDisabledPlaceholder: '建立工作范围后即可对话',
  statusIdle: '待命',
  statusRunning: '思考中',
  statusWaiting: '等待确认',
  statusUnavailable: '尚未就绪',
  thinking: '正在思考…',
  confirmFeedbackPlaceholder: '有不同意见？写下希望怎么改…',
  feedbackButton: '发送意见',
  confirmButton: '确认',
  cancelButton: '取消'
}
