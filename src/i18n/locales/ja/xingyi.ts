/** Xingyi ドック名前空間（バッチ 6・src/app グレーゾーン）：XingyiDock の UI シェル＋スラッシュコマンド説明。
 *  ⚠️ Xingyi のキャラ文言（思考中／失敗返信／プレースホルダー）は可愛くくだけた口調を保持。丁寧体で一律化しない。 */
export const xingyi = {
  title: 'Xingyi',
  thinking: 'Xingyi、考え中…',
  autoApproveOn: '自動許可',
  autoApproveOff: '書き込み前確認',
  autoApproveOnHint: '現在：書き込み操作は自動許可され、確認カードは出ません（タップまたは Shift+Tab で戻す）',
  autoApproveOffHint: '現在：書き込み操作はまず確認カードを出します（タップまたは Shift+Tab で自動許可に切り替え）',
  autoApproveGlyphOn: '許',
  autoApproveGlyphOff: '確',
  confirmExecute: '実行を確認',
  noMatchCommand: '一致するコマンドがありません',
  resumeTitle: '過去の会話',
  resumeEmpty: 'まだ過去の会話はありません',
  untitledConversation: '無題の会話',
  deleteConversation: 'この会話を削除',
  deleteConversationWarn: '削除するとメッセージごと完全に消えて、元に戻せないよ。',
  deleteConversationFailed: 'うぅ……この会話の削除に失敗しちゃった、あとでもう一度試してくれる？',
  currentSessionMark: '現在 · ',
  messageCount: '{count} 件',
  inputPlaceholder: 'Xingyi に話しかけてね…（/ でコマンド）',
  activitySearching: 'Xingyi が調べもの中（{tool}）…',
  activityWorking: 'Xingyi が作業中（{tool}）…',
  newChatFailed: 'うぅ……新しい会話を始められなかったの、あとでもう一度試してくれる？',
  resumeFailed: 'うぅ……過去の会話を復元できなかったの、あとでもう一度試してくれる？',
  emptyReply: 'うぅ……Xingyi、今回はうまく言葉が出なかったの、もう一度聞いてくれる？',
  errorReply: 'Xingyi のほうでエラーが出ちゃった：{detail}',
  statusIdle: '待機中',
  statusRunning: '処理中',
  statusWaiting: '確認待ち',
  statusError: 'エラー',
  // 折りたたみ時のグローバル入口＆エージェントタスクパネル（2026-07-10 Xingyi UI 再構築・旧右上ランプを吸収）
  statusSuccess: '完了',
  launcherAria: 'Xingyi ドックを開く',
  emptyHint: 'Xingyi に手伝ってほしいことある？「/」でコマンドを呼び出せるよ。',
  taskDetail: 'タスク詳細',
  taskGoConfirm: '確認しに行く',
  taskDismiss: 'タスク通知を閉じる',
  // ドック専用ダークモード切替（2026-07-11）：ドックの見た目だけ切替、グローバルテーマは触らない
  dockThemeToDark: 'ドックをダークに',
  dockThemeToLight: 'ドックをライトに',
  // 停止ボタン（2026-07-13）：ターン実行中のみ表示。Xingyi の今回のターン＋派遣済みサブエージェント（絵輿/採風）を中断する
  stopTurn: '停止',
  // Xingyi が派遣したサブエージェント実行カード・添削ラウンド用文言（地図協業＆実行カード計画バッチ1・2026-07-11）
  dispatchTidiaoLabel: 'ディレクター',
  dispatchTidiaoVerb: '添削中',
  dispatchTidiaoFallbackTitle: '添削タスク',
  // askUser カードのアーカイブ（2026-07-11）：確認カードは回答後も会話記録として残す
  askArchiveTitle: '【確認カード】',
  askDismissedAnswer: '（カードを閉じて未回答）',
  // 入力欄の画像アップロード（2026-07-11・バッチ5・ドック接続）：画像のみでテキストがない時の保存/バブル用プレースホルダー
  imageOnlyPlaceholder: '[画像]',
  // 楽観的な画像送信（2026-07-11）：楽観表示したメッセージの裏側アップロード/送信が最終的に失敗した時の表示
  sendFailedHint: '送信できていないかも、少ししてから更新してみてね',
  // 絵輿の草案確認カード「地図で下書きを見る」入口（地図草案シルエット可視化計画バッチ3・2026-07-12）
  viewDraftOnMap: '地図で下書きを見る',
  // Xingyi 設定：デスクトップペット表示はログインユーザー共通、日記の視点は管理者専用
  xingyiSettingsAria: 'Xingyi 設定',
  xingyiSettingsTitle: 'Xingyi 設定',
  desktopPetLabel: 'デスクトップペット',
  desktopPetHint: '非表示にしてもチャット入口は残り、いつでも戻せます。',
  diaryViewpointLabel: '日記の視点',
  diaryViewpointXingyi: 'Xingyi 一人称',
  diaryViewpointObjective: '客観的な三人称',
  diaryViewpointLoading: '設定を読み込み中…',
  diaryViewpointSaving: '保存中…',
  diaryViewpointLoadFailed: '視点の読み込みに失敗しました：{detail}',
  diaryViewpointSaveFailed: '視点の保存に失敗しました：{detail}',
  diaryGenerateNow: '今日の日記をすぐ生成',
  diaryGenerating: '生成中…',
  diaryGenerateSuccess: '{dateStr}.md を生成しました',
  diaryGenerateFailed: '生成に失敗しました：{detail}',
  slash: {
    clearDesc: '現在の会話コンテキストをクリアして新しい会話を始める',
    resumeDesc: '過去の会話を確認して復元する',
    modelDesc: 'この会話のモデルと思考の強度を切り替える',
    diaryDesc: '今日の Xingyi 日記を生成する',
    buildWorldDesc: '役割グループ、開始環境、ステータス欄まで整えた世界を作り、最後にアバターを生成する'
  }
}
