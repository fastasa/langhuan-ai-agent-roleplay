// 人格模型 ReRanker 服务端推理：移动端（及桌面端带不动时）把「情境 + 候选计划」发到服务端，由 Node 用
// onnxruntime-node 跑同一份量化模型打分，返回与浏览器本地推理逐条等价的分数（打分纯逻辑共用 shared/personalityRerankerCore）。
//
// 抗压护栏（阈值按 2026-06-17 计划书写死，出问题再调）：
// - LRU 模型缓存上限 MAX_CACHED_MODELS：内存只与「同时在用的模型数」有关，与上传总数无关；超限淘汰最久未用并 dispose。
// - 全局并发信号量 MAX_CONCURRENCY：同时在跑的评审数上限，避免推理跑满 CPU 饿死同进程的网页/API。
// - 队列超时 QUEUE_TIMEOUT_MS：排队过久即抛 RerankerBusyError，由路由转 503，前端按既有「评审降级」兜底。

import { existsSync } from 'fs'
import { join, relative, sep } from 'path'
import { PERSONALITY_MODEL_DIR } from '../../db.js'
import { resolvePersonalityModelStoredPathDirectory } from '../../repositories/personalityModelStorage.js'
import {
  scoreWithLoadedReranker,
  buildEmptyScoreResult,
  type LoadedReranker,
  type PersonalityRerankerScoreResult
} from '../../../shared/personalityRerankerCore.js'

// 同时常驻内存的模型数上限：单模型 int8 常驻约 150~250MB，留余量恒定在 2~3 个。
const MAX_CACHED_MODELS = 3
// 同时在跑的评审数上限：机器 4 核，留 1~2 核给 Web，舒适并发 2。
const MAX_CONCURRENCY = 2
// 排队等待上限：超过即降级，避免用户长时间干等。
const QUEUE_TIMEOUT_MS = 9000

export class RerankerBusyError extends Error {
  code = 'RERANKER_BUSY'
  constructor(message = '人格模型服务端推理繁忙，已排队超时') {
    super(message)
    this.name = 'RerankerBusyError'
  }
}

export class RerankerModelError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'RerankerModelError'
  }
}

// 简单计数信号量：acquire 拿到名额返回 release；并发已满则排队，超时拒绝。
class Semaphore {
  private active = 0
  private queue: Array<{ onGrant: () => void; timer: ReturnType<typeof setTimeout> }> = []
  constructor(private readonly max: number) {}

  acquire(timeoutMs: number): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const grant = () => {
        this.active += 1
        let released = false
        resolve(() => {
          if (released) return
          released = true
          this.release()
        })
      }
      if (this.active < this.max) {
        grant()
        return
      }
      const item = {
        onGrant: () => { clearTimeout(item.timer); grant() },
        timer: setTimeout(() => {
          const idx = this.queue.indexOf(item)
          if (idx >= 0) this.queue.splice(idx, 1)
          reject(new RerankerBusyError())
        }, timeoutMs)
      }
      this.queue.push(item)
    })
  }

  private release(): void {
    this.active -= 1
    const next = this.queue.shift()
    if (next) next.onGrant()
  }
}

const semaphore = new Semaphore(MAX_CONCURRENCY)

// 模型加载缓存：缓存 Promise 去重并发加载；Map 插入顺序即 LRU，命中时挪到末尾，淘汰从头部取。
const loadCache = new Map<string, Promise<LoadedReranker>>()

let transformersEnvReady = false
async function getTransformers() {
  const mod = await import('@huggingface/transformers')
  if (!transformersEnvReady) {
    const env = (mod as any).env
    env.allowLocalModels = true
    env.allowRemoteModels = false
    env.localModelPath = PERSONALITY_MODEL_DIR
    transformersEnvReady = true
  }
  return mod
}

// storedPath 形如 personality-models/<charId>[/<versionId>]；用存储层的安全解析校验目录在白名单内且文件存在，
// 再换算成相对 PERSONALITY_MODEL_DIR 的 modelId（transformers.js 以 localModelPath + modelId 定位文件）。
function resolveModelId(modelPath: string): string {
  const dir = resolvePersonalityModelStoredPathDirectory(modelPath)
  if (!dir) throw new RerankerModelError('MODEL_PATH_INVALID', '人格模型路径非法')
  if (!existsSync(join(dir, 'onnx', 'model_quantized.onnx'))) {
    throw new RerankerModelError('MODEL_NOT_FOUND', '人格模型文件不存在或尚未上传')
  }
  return relative(PERSONALITY_MODEL_DIR, dir).split(sep).join('/')
}

function loadModel(modelId: string): Promise<LoadedReranker> {
  const cached = loadCache.get(modelId)
  if (cached) {
    // LRU 命中：挪到末尾标记最近使用。
    loadCache.delete(modelId)
    loadCache.set(modelId, cached)
    return cached
  }
  const loading = (async (): Promise<LoadedReranker> => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await getTransformers() as any
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(modelId),
      AutoModelForSequenceClassification.from_pretrained(modelId, { dtype: 'q8' })
    ])
    return { tokenizer, model }
  })()
  loading.catch(() => loadCache.delete(modelId))
  loadCache.set(modelId, loading)
  // 淘汰超限的最久未用模型（不淘汰当前刚插入的）。
  while (loadCache.size > MAX_CACHED_MODELS) {
    const oldestKey = loadCache.keys().next().value as string | undefined
    if (!oldestKey || oldestKey === modelId) break
    const evicted = loadCache.get(oldestKey)
    loadCache.delete(oldestKey)
    void evicted?.then((loaded) => (loaded.model as any)?.dispose?.()).catch(() => {})
  }
  return loading
}

/**
 * 服务端对一批候选计划逐条打分。失败语义：
 * - RerankerBusyError：排队超时（路由转 503，前端降级）。
 * - RerankerModelError：路径非法 / 模型不存在（路由转 400/404）。
 * - 其它 Error：推理异常（路由转 500，前端降级）。
 */
export async function scorePersonalityPlansOnServer(input: {
  modelPath: string
  situation: string
  plans: string[]
}): Promise<PersonalityRerankerScoreResult> {
  const modelId = resolveModelId(input.modelPath)
  const plans = Array.isArray(input.plans) ? input.plans.map((plan) => String(plan ?? '')) : []
  const situation = String(input.situation ?? '')
  if (!plans.length) return buildEmptyScoreResult(modelId, situation)

  const release = await semaphore.acquire(QUEUE_TIMEOUT_MS)
  try {
    const loaded = await loadModel(modelId)
    return await scoreWithLoadedReranker(loaded, { modelId, situation, plans })
  } finally {
    release()
  }
}

export const personalityRerankerServerConfig = {
  maxCachedModels: MAX_CACHED_MODELS,
  maxConcurrency: MAX_CONCURRENCY,
  queueTimeoutMs: QUEUE_TIMEOUT_MS
}
