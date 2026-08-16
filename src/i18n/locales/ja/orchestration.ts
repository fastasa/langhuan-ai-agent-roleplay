export const orchestration = {
  zones: { overview:'概要',roles:'登場人物と在場',statusbar:'ステータス',seeds:'物語の種',timeline:'タイムライン' },
  zoneSubtitles: { overview:'現在のセッションの場面と物語制約',roles:'参加者・分岐・確定した在場状態',statusbar:'登場人物と世界エンティティの共通ステータス表示',timeline:'最近の状況・ラウンド成果物・正式な変更' },
  actions: { refresh:'更新',openMap:'輿図を開く',saveScene:'場面を保存',saveOverride:'制約を保存',openStatus:'状態を見る',editInStatus:'ステータスで編集',expandStatus:'展開',collapseStatus:'折りたたむ',markPresent:'在場にする',markOffstage:'退場にする',confirmFact:'発生を確認',cancelProposal:'予定を取消' },
  fields: { sceneName:'場面名',time:'時間',weather:'天気',largeLocation:'大地域',middleLocation:'中地域',smallLocation:'場所',sceneDescription:'場面説明' },
  overview: { scene:'現在の幕',presentCount:'在場中',seedCount:'有効な種',pendingCount:'未確認',statusCount:'状態パネル',sessionConstraint:'セッションの物語制約',worldConstraintInherited:'世界の制約を継承',sessionConstraintHint:'世界自体を変更せず、このセッションの語り方・進行・内容境界を制約します。',overridePlaceholder:'このセッションだけに適用します。空欄の場合は世界の制約を継承します。' },
  curtain: {
    mapSheet:'世界図面',followDefault:'既定に従う（{name}）',defaultMapSheet:'既定の図面',
    realLocation:'現実の場所',virtualTime:'仮想時間',quickTime:'時間ショートカット',timeRate:'時間倍率',virtualWeather:'仮想天気',weatherDescription:'天気の説明',
    now:'現在',clear:'クリア',followRealWeather:'現実の天気に従う',customWeather:'天気を指定',restoreReality:'現実に戻す',save:'保存',
    largeLocationPlaceholder:'例：東京',middleLocationPlaceholder:'例：新宿',smallLocationPlaceholder:'例：駅',realLocationPlaceholder:'例：臨平',weatherPlaceholder:'例：小雨'
  },
  presence: { present:'在場',offstage:'退場',unknown:'未確認' },
  stateMode: { follow_main:'キャラクター本線に追従',independent_snapshot:'独立セッションスナップショット' },
  roles: { branchReady:'専用分岐を接続済み',pendingTransition:'「{state}」の予定。まだ事実ではありません',noLocation:'場所の記録なし',empty:'このセッションにはキャラクター参加者がいません。' },
  status: { untitled:'名称未設定の状態',characterHost:'セッションキャラクター',worldHost:'世界エンティティ',sessionHost:'セッション',noValues:'状態値なし',structuredValue:'構造化内容',empty:'このセッションと世界には状態パネルがありません。' },
  timeline: { lastScenario:'最近の状況',recentRound:'最近のラウンド成果物',messageAnchor:'メッセージ {id}',presenceProposal:'未確認の登退場',seedUpdated:'物語の種を更新',empty:'表示できる演出変更はまだありません。' },
  timelineKinds: { message:'実際のメッセージ',presence_fact:'在場の事実',seed_fact:'物語の種の事実',status_update:'状態更新' },
  conflicts: { stale_version:'バージョンが変更済み',unresolved_legacy_host:'旧ホストの確認が必要',missing_branch:'専用分岐がありません',unknown_presence:'在場状態が未確認' },
  evidence: { sceneManual:'ユーザーが脚本ワークスペースで幕を変更',overrideManual:'ユーザーが脚本ワークスペースでセッションの物語制約を変更',presenceManual:'ユーザーが{name}を{state}に設定',proposalCommitted:'ユーザーが{name}の登退場予定の発生を確認',proposalCancelled:'ユーザーが{name}の登退場予定を取消' }
}
