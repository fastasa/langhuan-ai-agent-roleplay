/** ワークスペース専門Agent共有シェル名前空間（2026-07-17 地図/脚本ワークスペース専門Agent計画バッチA）：
 *  脚本家/舆図師共通のシェル文言。身分・スコープの短いラベルは呼び出し側のデータ駆動で、ここには書かない。 */
export const workspaceAgent = {
  sendButton: '送信',
  stopButton: '停止',
  newConversation: '新しい会話',
  historyMenu: '会話履歴',
  collapsePanel: '{name}チャットを折りたたむ',
  expandPanel: '{name}チャットを展開',
  historyEmpty: 'まだ過去の会話はありません',
  inputPlaceholder: '何か話してください…',
  emptyMessages: 'メッセージはまだありません。何か話しかけてみましょう',
  modelSlashDescription: 'この会話のモデルと思考の強度を切り替える',
  modelPickerTitle: '会話モデル',
  modelPickerKeyboardHint: '↑↓ モデル · ←→ 強度',
  modelPickerModelLabel: 'Agentモデル',
  modelPickerEffortLabel: '強度',
  modelPickerFollowPreset: 'スロット設定に従う',
  modelPickerDefaultEffort: 'デフォルト',
  modelPickerDefaultEffortWithValue: 'デフォルト（{effort}）',
  modelPickerSlotEffortWithValue: 'スロットに従う（{effort}）',
  modelSlot: {
    fast: '書童',
    balanced: '校書',
    smart: '掌閣'
  },
  historyLoadFailed: '会話履歴を読み込めませんでした。開き直して再試行してください。',
  scopeUnavailable: '利用できる専門ワークスペースがまだありません。',
  inputDisabledPlaceholder: 'ワークスペースを設定すると会話できます',
  statusIdle: '待機中',
  statusRunning: '考え中',
  statusWaiting: '確認待ち',
  statusUnavailable: '未準備',
  thinking: '考えています…',
  confirmFeedbackPlaceholder: '変更したい点を書いてください…',
  feedbackButton: '意見を送信',
  confirmButton: '確認',
  cancelButton: 'キャンセル'
}
