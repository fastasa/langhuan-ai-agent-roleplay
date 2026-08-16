export type AppChangelogEntry = {
  date: string
  version: string
  sections: Array<{
    title: string
    tone: 'feature' | 'polish' | 'fix'
    items: string[]
  }>
}

export type AppChangelog = {
  releaseId: string
  pushId?: string
  dialogTitle?: string
  dialogSubtitle?: string
  entries: AppChangelogEntry[]
}

export const CURRENT_APP_CHANGELOG: AppChangelog = {
  releaseId: '2026-08-16-local-open-source-v1',
  dialogTitle: '更新日志',
  dialogSubtitle: '快速查看本次版本改动',
  entries: [
    {
      date: '2026-08-16',
      version: 'V1.0.0',
      sections: [
        {
          title: '功能更新',
          tone: 'feature',
          items: [
            '发布纯本地开源版本，打开后直接进入完整工作区。',
            '提供本地数据导入与导出，不依赖托管服务。'
          ]
        },
        {
          title: '体验优化',
          tone: 'polish',
          items: [
            '数据默认从空工作区开始，由部署者在自己的设备上保存。',
            '服务只监听本机回环地址，不提供远程管理入口。'
          ]
        }
      ]
    }
  ]
}
