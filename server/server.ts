import 'dotenv/config'  // 加载 .env 环境变量
import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, appendFileSync } from 'fs'

import { logger } from './logger.js'
import { flushPendingSaveOnShutdown } from './db.js'
import aiRouter from './routes/ai.js'
import charactersRouter from './routes/characters.js'
import docLibraryRouter from './routes/docLibrary.js'
import resourcesRouter from './routes/resources.js'
import chatRouter from './routes/chat.js'
import metaRouter from './routes/meta.js'
import tasksRouter from './routes/tasks.js'
import timersRouter from './routes/timers.js'
import weatherRouter from './routes/weather.js'
import workspaceRouter from './routes/workspace.js'
import aiUsageRouter from './routes/aiUsage.js'
import personalityRerankerRouter from './routes/personalityReranker.js'
import xingyiDiaryRouter from './routes/xingyiDiary.js'
import agentRuntimeJournalRouter from './routes/agentRuntimeJournal.js'
import { createPixelStudioRouter } from './pixel-studio/routes.js'
import { attachLocalWorkspace } from './localWorkspace.js'
import { auditMiddleware } from './middleware/audit.js'
import { createJsonBodyParser, createSmallJsonBodyParser, handleJsonBodyParserError } from './middleware/jsonBodyLimits.js'
import { createOperationConcurrencyGate } from './middleware/operationConcurrencyGate.js'
import { createImportByteBudgetGate } from './middleware/importByteBudgetGate.js'
import { uploadRepository } from './repositories/uploadRepository.js'
import { shouldEnableRateLimit } from './security/rateLimitPolicy.js'
import { resolveTrustProxySetting } from './security/trustProxyPolicy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app: Application = express()
const isProduction = process.env.NODE_ENV === 'production'
// 生产环境位于 nginx 反向代理后，限流需要读取代理转发的真实客户端 IP。
// 开发默认不信任代理；如有特殊代理链，显式设置 TRUST_PROXY。
app.set('trust proxy', resolveTrustProxySetting({
  nodeEnv: process.env.NODE_ENV,
  trustProxy: process.env.TRUST_PROXY
}))
const DEFAULT_PORT = isProduction ? 3217 : 3000
const PORT = Number(process.env.PORT || DEFAULT_PORT)
const HOST = '127.0.0.1'
const ENABLE_DEV_RATE_LIMIT = ['1', 'true', 'yes'].includes(String(process.env.ENABLE_DEV_RATE_LIMIT || '').toLowerCase())
const DISABLE_DEV_RATE_LIMIT = ['1', 'true', 'yes'].includes(String(process.env.DISABLE_DEV_RATE_LIMIT || '').toLowerCase())
const shouldUseRateLimit = shouldEnableRateLimit({
  nodeEnv: process.env.NODE_ENV,
  allowLan: false,
  enableDevRateLimit: ENABLE_DEV_RATE_LIMIT,
  disableDevRateLimit: DISABLE_DEV_RATE_LIMIT
})

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return isLoopbackHost(parsed.hostname)
  } catch {
    return false
  }
}

app.use(cors({
  origin(origin, callback) {
    // 非浏览器请求或同源直连请求不带 Origin，默认放行
    if (!origin) {
      callback(null, true)
      return
    }
    if (isAllowedOrigin(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('当前来源未被允许访问'))
  }
}))
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// ========== 请求频率限制 ==========
// 通用API限制：15分钟内最多1000次请求（本地应用，轮询较频繁）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})
// AI 接口承载聊天、召回、写入和后续操作助手，不能用普通防刷阈值误伤正常链路。
// 这里保留异常保护，只拦截明显失控的循环或脚本刷接口。
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'AI请求异常频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})
const highRiskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: '高风险操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})
const smallJsonBodyParser = createSmallJsonBodyParser()
const scopedJsonBodyParser = createJsonBodyParser()
const operationConcurrencyGate = createOperationConcurrencyGate()
const importByteBudgetGate = createImportByteBudgetGate()

if (shouldUseRateLimit) {
  app.use('/api/ai', aiLimiter)  // AI接口更严格的限制
  app.use(['/api/data/export', '/api/data/restore'], highRiskLimiter)
  app.use('/api/', apiLimiter)    // 其他API通用限制
}
app.use('/api/', attachLocalWorkspace)
app.use('/api/', auditMiddleware('api_mutation'))
app.use('/api/data/restore', operationConcurrencyGate, importByteBudgetGate, scopedJsonBodyParser)
app.use('/api/data', operationConcurrencyGate, importByteBudgetGate, scopedJsonBodyParser)
app.use('/api/ai', scopedJsonBodyParser)
app.use('/api/timers', smallJsonBodyParser)
app.use('/api/weather', smallJsonBodyParser)

// 请求日志（仅开发环境，仅显示错误）
if (!isProduction) {
  // 只记录错误请求（4xx, 5xx）
  app.use(morgan((tokens: morgan.TokenIndexer, req: Request, res: Response) => {
    const status = parseInt(tokens.status(req, res) || '0')
    if (status >= 400) {
      return `[${tokens.status(req, res)}] ${tokens.method(req, res)} ${tokens.url(req, res)} ${tokens['response-time'](req, res)} ms`
    }
    return null
  }))
}

// ========== API 路由 ==========
for (const removedPrefix of ['/api/auth', '/api/admin', '/api/guest']) {
  app.use(removedPrefix, (_req: Request, res: Response) => {
    res.status(404).json({ error: '开源版不提供该接口' })
  })
}
app.use('/api/ai', aiRouter)
// 拆分后的模块化路由
app.use('/api/data', workspaceRouter) // 工作区快照与本地导入导出
app.use('/api/data', xingyiDiaryRouter) // 星依聊天日记化归档：视角设置+立即生成
app.use('/api/data', chatRouter)   // chat 和 summaries 路由优先接管聊天边界
app.use('/api/data', charactersRouter)
app.use('/api/data', docLibraryRouter)
app.use('/api/data', resourcesRouter)
app.use('/api/data', metaRouter)
app.use('/api/data', personalityRerankerRouter) // 人格模型服务端推理（移动端 / 桌面端带不动时）
app.use('/api/data', aiUsageRouter)
app.use('/api/data', agentRuntimeJournalRouter)
app.use('/api/data', tasksRouter)   // tasks, task-logs, daily-reports 路由
app.use('/api/timers', timersRouter)
app.use('/api/weather', weatherRouter)
// 像素工具是本地前台功能，开源版直接开放。
app.use('/api/pixel', createPixelStudioRouter({ storageDir: join(__dirname, 'data', 'pixel-studio') }))

app.use(handleJsonBodyParserError)

// 头像图片静态文件服务：已被上传台账隐藏/删除的文件不再继续对外暴露。
app.use('/avatars', (req: Request, res: Response, next: NextFunction) => {
  const storedPath = `avatars/${String(req.path || '').replace(/^\/+/, '')}`
  if (!uploadRepository.canServeStoredPath(storedPath)) {
    res.status(404).json({ error: '文件不可用' })
    return
  }
  next()
})
app.use('/avatars', express.static(join(__dirname, 'data/avatars')))

// 聊天输入框图片静态文件服务：门禁范式与 /avatars 完全一致（同一张 uploads 台账，business_type='chat_image'）。
app.use('/chat-images', (req: Request, res: Response, next: NextFunction) => {
  const storedPath = `chat-images/${String(req.path || '').replace(/^\/+/, '')}`
  if (!uploadRepository.canServeStoredPath(storedPath)) {
    res.status(404).json({ error: '文件不可用' })
    return
  }
  next()
})
app.use('/chat-images', express.static(join(__dirname, 'data/chat-images')))

// 人格模型 ONNX 包静态下发：新模型按角色/版本目录门禁；旧角色目录路径保留兼容。
app.use('/personality-models', (req: Request, res: Response, next: NextFunction) => {
  const segments = String(req.path || '').replace(/^\/+/, '').split('/')
  const characterDir = segments[0] || ''
  const versionDir = segments[1] || ''
  const versionedPath = characterDir && versionDir ? `personality-models/${characterDir}/${versionDir}` : ''
  const legacyPath = characterDir ? `personality-models/${characterDir}` : ''
  const canServe = Boolean(versionedPath && uploadRepository.canServeStoredPath(versionedPath))
    || Boolean(legacyPath && uploadRepository.canServeStoredPath(legacyPath))
  if (!canServe) {
    res.status(404).json({ error: '模型不可用' })
    return
  }
  next()
})
app.use('/personality-models', express.static(join(__dirname, 'data/personality-models')))

// AGPL 正文由本机服务直接提供，介绍页在开发与生产模式都能长期访问。
app.get('/LICENSE', (_req: Request, res: Response) => {
  res.type('text/plain; charset=utf-8').sendFile(join(__dirname, '../LICENSE'))
})

// ONNX WASM 运行时静态下发：人格模型评审/影子打分在浏览器本地推理时，onnxruntime-web 需要先加载 wasm 运行时。
// 不自托管会走 transformers.js 默认的 jsDelivr CDN，国内（尤其移动端）经常拉不动，评审一启动就失败。
// 文件直接取自已安装的 @huggingface/transformers/dist，保证与前端打包的 onnxruntime-web 版本一致；
// 只放行 ort-wasm 前缀的 .mjs/.wasm 文件，不暴露目录里其它内容。
app.use('/ort-wasm', (req: Request, res: Response, next: NextFunction) => {
  if (!/^\/ort-wasm[\w.-]*\.(mjs|wasm)$/.test(String(req.path || ''))) {
    res.status(404).json({ error: '文件不可用' })
    return
  }
  next()
})
app.use('/ort-wasm', express.static(join(__dirname, '../node_modules/@huggingface/transformers/dist')))

// ========== 生产模式托管前端 ==========
// Vite build 产物在 dist/（server.js 在 server/，所以是 ../dist）
const distDir = join(__dirname, '../dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('/admin', (_req: Request, res: Response) => {
    res.status(404).send('Not Found')
  })
  // SPA 路由兜底：所有未匹配路径都返回 index.html
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(distDir, 'index.html'))
  })
}

// ========== 全局错误处理中间件 ==========
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('服务器错误:', err)
  res.status(500).json({ error: '服务器内部错误' })
})

// 开源版固定只监听本机回环地址。
const server = app.listen(PORT, HOST, () => {
  logger.system(`琅嬛服务器已启动：http://${HOST}:${PORT}`)
})

// 一键启动器会在进程启动前精确清理配置端口。若这里仍遇到占用，说明清理失败或发生并发抢占；
// 直接退出并保留一次明确错误，禁止旧版每秒重试造成无限刷屏。
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`端口 ${PORT} 仍被占用，启动失败。请重新运行“启动琅嬛.bat”。`)
    process.exit(1)
  }
  logger.error(`服务器监听失败：${err.message}`)
  process.exit(1)
})

// 优雅关闭（nodemon 重启前释放端口）。
// 关闭前先把防抖中的数据库写盘同步落盘：写库是 200ms 防抖 + 整库覆盖，
// 不 flush 的话正常停服也会丢最后一批改动（例如刚删除的会话重启后“复活”）。
function shutdownGracefully(signal: string) {
  logger.system(`收到 ${signal} 信号，正在关闭服务器...`)
  try {
    if (flushPendingSaveOnShutdown()) {
      logger.system('已把待写盘的数据库改动落盘')
    }
  } catch (err) {
    console.error('[db] 停服前落盘失败：', err)
  }
  server.close(() => {
    logger.system('服务器已关闭')
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'))
process.on('SIGINT', () => shutdownGracefully('SIGINT'))

// ─────────────────────────────────────────────────────────────────────────────
// H1（2026-07-04·崩溃兜底）：uncaughtException / unhandledRejection 此前完全没挂——
// 任何未捕获错误都是静默秒崩、零日志（「莫名其妙崩溃」的直接来源），且崩时防抖窗口内的
// 数据库写入（200ms 防抖 + 整库导出）随进程一起丢。兜底三步：
//   ① 崩溃现场同步写进 server/data/logs/crash-*.log（console 随进程消失，文件才留得住证据）；
//   ② 尽力把防抖等待中的库改动同步落盘（flushPendingSaveOnShutdown 内部有事务保护：
//      事务未收尾时宁可放弃也不写歪库，与停服路径同一口径，不违数据红线）；
//   ③ exit(1) 退出——uncaughtException 后进程状态不可靠，带病运行比崩溃更危险。
// unhandledRejection 同样处理（Node 新版默认也是 crash，这里只是加「留证据 + 保数据」）。
// ─────────────────────────────────────────────────────────────────────────────
const CRASH_LOG_DIR = join(__dirname, 'data', 'logs')

function recordCrashAndExit(kind: string, reason: unknown): void {
  const detail = reason instanceof Error ? `${reason.message}\n${reason.stack || ''}` : String(reason)
  const line = `[${new Date().toISOString()}] [${kind}] ${detail}\n\n`
  // 全程同步 + 各自兜底：崩溃现场任何一步失败都不能阻断后面的步骤。
  try {
    mkdirSync(CRASH_LOG_DIR, { recursive: true })
    appendFileSync(join(CRASH_LOG_DIR, `crash-${new Date().toISOString().slice(0, 10)}.log`), line)
  } catch { /* 日志写不进也要继续落盘 */ }
  try {
    logger.error(`进程崩溃（${kind}），现场已记 server/data/logs/：${detail.split('\n')[0]}`)
  } catch { /* noop */ }
  try {
    if (flushPendingSaveOnShutdown()) logger.system('崩溃前已把待写盘的数据库改动落盘')
  } catch (err) {
    console.error('[db] 崩溃前落盘失败：', err)
  }
  process.exit(1)
}

process.on('uncaughtException', (err) => recordCrashAndExit('uncaughtException', err))
process.on('unhandledRejection', (reason) => recordCrashAndExit('unhandledRejection', reason))
