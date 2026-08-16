/**
 * 常量配置文件
 * 提取魔法数字为命名常量
 */

// ===== 计时器 =====
/** 计时器轮询间隔（毫秒） */
export const POLL_INTERVAL_MS = 5000
/** 页面在后台时的计时器轮询间隔（毫秒） */
export const BACKGROUND_POLL_INTERVAL_MS = 15000

// ===== 环境信息 =====
/** 环境信息自动保存间隔（毫秒） */
export const ENVIRONMENT_SAVE_INTERVAL_MS = 10 * 60 * 1000

// ===== 聊天 =====
/** 历史消息限制条数 */
export const CHAT_HISTORY_LIMIT = 100
/** 消息分页大小 */
export const MESSAGE_PAGE_SIZE = 50

// ===== 天气 =====
/** 天气缓存过期时间（毫秒） */
export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000
