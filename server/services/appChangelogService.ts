import { CURRENT_APP_CHANGELOG } from '../../src/app/appChangelog.js'
import type { AppChangelog } from '../../src/app/appChangelog.js'

/**
 * 开源本地版的更新日志是随代码发布的静态内容。
 * 服务端只提供读取接口，不接受草稿、发布或历史恢复等写操作。
 */
export function getAppChangelog(): AppChangelog {
  return CURRENT_APP_CHANGELOG
}
