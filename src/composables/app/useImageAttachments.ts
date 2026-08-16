// 输入框图片上传·前端共享 composable（计划批3·2026-07-11；批「带图乐观发送」2026-07-11 改造）。
// 每宿主一实例（工厂函数，非全局单例）：主聊天输入框（含提调统筹入口）与星依浮坞各自 new 一份，
// 互不共享 pendingImages 状态——两处图片上传是并行的两条队伍，不是同一份数据的两个视图。
//
// 职责边界：
// - 文件校验 + canvas 降采样 + 上传（uploadChatImage）+ caption 异步生成（generateImageCaption）+
//   uploading/failed/ready 状态机 + 发送时取走清空（takeAttachments）。
// - 不知道自己被塞进主聊天还是星依浮坞：caption 依赖（agentConfig/callAI/sessionId）由宿主通过
//   getCaptionDeps() 注入，本文件不 import useAI.ts/Pinia store，保持可独立单测（同 chatImageCaption.ts
//   "app/composables 层不直接耦合具体宿主"范式）。
//
// ⚠️ takeAttachments 语义（2026-07-11 乐观发送改造·别按旧注释理解）：只等「上传」（拿到真 url），
// 不再等 caption——caption 要调一次 AI，慢（几秒到二十秒），不该挡住发送。取走时若某张图 caption
// 仍在跑，captionStatus 原样保留 'pending'（不再强行收口成 'failed'），caption 后台跑完后通过可选的
// onCaptionUpdate(attachmentId, patch) 回调通知宿主——即便调用方已经 clear() 过 pendingImages（该图已
// 不在 chips 列表里），回调依然会在 caption 完成时触发一次，供宿主更新自己已落库/已乐观显示的那份消息。
// 另有同步方法 peekAttachments()：不等待、不清空，原样快照当前 pendingImages（含 previewUrl），
// 供宿主在按下发送的瞬间就地乐观显示（这才是本改造要解决的「卡顿」根因——旧版发送前会等 caption 完成）。
//
// ⚠️ caption 默认关闭（2026-07-11 用户拍板）：见下方 IMAGE_CAPTION_ENABLED 常量。triggerCaption 整条链路
// （含 generateImageCaption/onCaptionUpdate 回调）原样保留未删，只是默认不触发——订阅桥主力路径原生识图
// 不需要 caption，caption 本身还得靠识图模型生成（鸡生蛋）。将来需要复活时把这个常量改成显式开关即可。
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { readImageFileAsDataUrl } from '../../utils/photoFile'
import { type ChatImageAttachment } from '../../utils/chatAttachments'
import { uploadChatImage } from '../../repositories/chatRepository'
import { generateImageCaption } from '../../app/chatImageCaption'

export interface PendingImageAttachment extends ChatImageAttachment {
  status: 'uploading' | 'ready' | 'failed'
  /** 本地 objectURL，选中/粘贴/拖拽后立即可显示缩略图，不等上传网络往返。 */
  previewUrl: string
  errorMessage?: string
}

/** caption 依赖：宿主注入，返回 null 时跳过 caption 生成（formatAttachmentNote 会用中性文件名占位兜底）。
 *  ⚠️ 即便 deps 非 null，caption 默认也不会触发——见下方 IMAGE_CAPTION_ENABLED（用户 2026-07-11 拍板默认关闭）。
 *  agentConfig/callAI 故意松类型 any：本 composable 不反向依赖 useAI.ts/AgentModelConfig 等具体宿主类型，
 *  只要求宿主传进来的 callAI 结构上兼容 chatImageCaption.ts 的 ChatImageCaptionAiCaller 即可（该文件内部校验）。 */
export interface ImageAttachmentCaptionDeps {
  agentConfig: any
  callAI: any
  sessionId?: string
}

export interface UseImageAttachmentsOptions {
  /** 单条消息最多附几张图，默认 6。 */
  maxCount?: number
  getCaptionDeps?: () => ImageAttachmentCaptionDeps | null
}

/** caption 后台补全通知：仅 caption 完成（done/failed）时触发一次，供宿主回填已乐观显示/已落库的消息。 */
export type CaptionUpdatePatch = { caption?: string; captionStatus: 'done' | 'failed' }
export type CaptionUpdateListener = (attachmentId: string, patch: CaptionUpdatePatch) => void

export interface UseImageAttachmentsReturn {
  pendingImages: Ref<PendingImageAttachment[]>
  hasPending: ComputedRef<boolean>
  hasUploading: ComputedRef<boolean>
  handlePaste(e: ClipboardEvent): boolean
  handleDrop(e: DragEvent): void
  handleDragOver(e: DragEvent): void
  addFiles(files: File[] | FileList): Promise<void>
  removeImage(id: string): void
  retryUpload(id: string): void
  /** 同步快照当前 pendingImages（不等待、不清空）：供宿主在发送瞬间就地乐观显示，含 previewUrl。 */
  peekAttachments(): PendingImageAttachment[]
  /** 只等上传完成即返回并清空；某图 caption 仍未完成时原样带着 'pending' 返回，caption 补全后
   *  经 onCaptionUpdate 回调通知宿主（详见文件头注释）。 */
  takeAttachments(onCaptionUpdate?: CaptionUpdateListener, signal?: AbortSignal): Promise<ChatImageAttachment[]>
  clear(): void
}

const DEFAULT_MAX_COUNT = 6
const IMAGE_MIME_WHITELIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_ORIGINAL_IMAGE_BYTES = 15 * 1024 * 1024
/** 服务端 chatImageStorage.ts 的硬上限（8MB）：降采样后仍超出直接拒绝，不发起无意义的上传请求。 */
const MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024
const DOWNSAMPLE_LONG_EDGE = 2048
const DOWNSAMPLE_TRIGGER_BYTES = 3 * 1024 * 1024
/** takeAttachments 发送时的有限等待：未完成上传最多等 30s（Promise.race 超时，超时不阻断发送）。
 *  caption 不在此列——2026-07-11 乐观发送改造后 caption 完全不阻塞发送，见文件头注释。 */
const UPLOAD_WAIT_TIMEOUT_MS = 30000

/** caption（图片转述）开关：用户 2026-07-11 拍板默认关闭——用户主力走订阅桥（Claude Code/Sonnet 5），
 *  订阅桥天然识图（靠 @路径直接看图，见 xingyiAgentHarness.ts/claudeCodeBridge），caption 对它纯属
 *  白花钱+白占额度；而且 caption 本身还得靠识图模型才能生成（鸡生蛋）。整条链路（triggerCaption/
 *  generateImageCaption/onCaptionUpdate 回调/caption 后补落库）原样保留不删，只是默认不触发——将来
 *  真有「不识图模型也要读懂图」的需求，再做成显式开关（UI/配置项）接管这个常量即可复活，不必重写。
 *  用 let 而非 const：生产代码永远不改它，唯一改写者是下面 __setImageCaptionEnabledForTest（仅供单测
 *  验证「caption 链路能力仍在，只是默认关」，不要在生产代码里调用）。 */
let IMAGE_CAPTION_ENABLED = false

/** 仅供单测使用：临时把 caption 开关打开，验证 triggerCaption 后面那段代码（generateImageCaption
 *  调用/状态机/onCaptionUpdate 回调）仍然完好可用。测试结束务必调回 false（各 spec 的 afterEach 兜底）。 */
export function __setImageCaptionEnabledForTest(enabled: boolean): void {
  IMAGE_CAPTION_ENABLED = enabled
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([promise, sleep(ms)])
}

/** 发送等待上传时允许宿主提前停止。这里只结束等待，不伪装成取消了已经发出的上传请求；宿主随后按
 * signal 判定是否继续落库/调用模型。 */
function raceTimeoutOrAbort<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | void> {
  if (!signal) return raceTimeout(promise, ms)
  if (signal.aborted) return Promise.resolve()
  return new Promise<T | void>((resolve, reject) => {
    let settled = false
    let timer = 0
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => resolve())
    timer = window.setTimeout(() => finish(() => resolve()), ms)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    )
  })
}

function approxDataUriBytes(dataUri: string): number {
  const commaIndex = dataUri.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri
  return Math.ceil((base64.length * 3) / 4)
}

/** vitest/jsdom 没装 `canvas` 包，`getContext('2d')` 恒为 null、`createImageBitmap` 也不存在——
 *  探测到就跳过降采样直接读原图，保证 addFiles 在单测里行为可预期（不是「降采样失败报错」，是「按设计跳过」）。 */
function canDownsampleInThisEnvironment(): boolean {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return false
  try {
    const canvas = document.createElement('canvas')
    return !!canvas.getContext('2d')
  } catch {
    return false
  }
}

export interface DownsampleResult {
  dataUri: string
  width?: number
  height?: number
}

/**
 * 上传前 canvas 降采样：长边 >2048px 或原图 >3MB 时压到长边 2048 重编码 jpeg；
 * gif 不降采样直接传（动图压了会丢帧）；环境不支持 canvas 时跳过降采样直接读原图。
 * 单独导出：spec 可以直接测试这个纯函数，不必绕 addFiles 整条链路。
 */
export async function downsampleImageForUpload(file: File): Promise<DownsampleResult> {
  if (file.type === 'image/gif' || !canDownsampleInThisEnvironment()) {
    return { dataUri: await readImageFileAsDataUrl(file) }
  }
  const bitmap = await createImageBitmap(file)
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const needsResize = longEdge > DOWNSAMPLE_LONG_EDGE || file.size > DOWNSAMPLE_TRIGGER_BYTES
    if (!needsResize) {
      return { dataUri: await readImageFileAsDataUrl(file), width: bitmap.width, height: bitmap.height }
    }
    const scale = DOWNSAMPLE_LONG_EDGE / longEdge
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale))
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return { dataUri: await readImageFileAsDataUrl(file), width: bitmap.width, height: bitmap.height }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    return { dataUri: canvas.toDataURL('image/jpeg', 0.85), width: targetWidth, height: targetHeight }
  } finally {
    bitmap.close?.()
  }
}

let localIdCounter = 0
function makeLocalAttachmentId(): string {
  localIdCounter += 1
  return `img_local_${Date.now().toString(36)}_${localIdCounter}_${Math.random().toString(36).slice(2, 8)}`
}

function safeRevokeObjectUrl(url: string | undefined): void {
  if (!url || !url.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // 环境不支持/已被撤销时静默跳过，不影响状态清理
  }
}

export function useImageAttachments(options: UseImageAttachmentsOptions = {}): UseImageAttachmentsReturn {
  const maxCount = options.maxCount ?? DEFAULT_MAX_COUNT
  const pendingImages = ref<PendingImageAttachment[]>([]) as Ref<PendingImageAttachment[]>

  // 内部簿记（不进公开返回值）：原始 File 供 retryUpload 复用；上传/caption 的进行中 Promise 供
  // takeAttachments 有限等待。三张表都以本地 id 为键，removeImage/clear 时同步清理，避免悬空引用。
  const fileById = new Map<string, File>()
  const uploadPromiseById = new Map<string, Promise<void>>()
  const captionPromiseById = new Map<string, Promise<void>>()
  // caption 后台补全订阅表（乐观发送改造新增）：takeAttachments 取走某图时若其 caption 仍 'pending'，
  // 在此登记一次性回调；triggerCaption 的异步体 resolve 时无论该图是否还在 pendingImages 里都会触发它，
  // 触发后立即从表里删除（一次性）。与 pendingImages/三张表不同批生命周期，clear() 不清它。
  const captionUpdateSubscribers = new Map<string, CaptionUpdateListener>()

  const hasPending = computed(() => pendingImages.value.length > 0)
  const hasUploading = computed(() => pendingImages.value.some((img) => img.status === 'uploading'))

  function findEntry(id: string): PendingImageAttachment | undefined {
    return pendingImages.value.find((img) => img.id === id)
  }

  function patchEntry(id: string, patch: Partial<PendingImageAttachment>): void {
    const idx = pendingImages.value.findIndex((img) => img.id === id)
    if (idx === -1) return // 已被 removeImage/clear 移除：防幽灵回写，异步结果直接丢弃
    pendingImages.value[idx] = { ...pendingImages.value[idx], ...patch }
  }

  function triggerCaption(id: string): void {
    // 默认关闭（见 IMAGE_CAPTION_ENABLED 注释）：直接不触发，entry.captionStatus 原样保持 undefined，
    // formatAttachmentNote 走占位分支——链路其余部分（含此函数后面的代码）不删，复活时把开关打开即可用。
    if (!IMAGE_CAPTION_ENABLED) return
    const deps = (() => {
      try {
        return options.getCaptionDeps?.() ?? null
      } catch {
        return null
      }
    })()
    if (!deps) return
    const entry = findEntry(id)
    if (!entry) return
    patchEntry(id, { captionStatus: 'pending' })
    const promise = (async () => {
      const result = await generateImageCaption({
        url: entry.url,
        mime: entry.mime,
        sessionId: deps.sessionId,
        agentConfig: deps.agentConfig,
        callAI: deps.callAI
      })
      const patch: CaptionUpdatePatch = 'caption' in result
        ? { caption: result.caption, captionStatus: 'done' }
        : { captionStatus: 'failed' }
      // 仍在 pendingImages 里（还没被 takeAttachments 取走）就正常回写状态机，供 chips 展示；
      // 已被取走（findEntry 查不到）不算错——patchEntry 自身会静默 no-op。
      patchEntry(id, patch)
      // 不管上面是否命中，只要宿主在 takeAttachments 时登记过订阅，就通知一次（一次性，用完即删）。
      const listener = captionUpdateSubscribers.get(id)
      if (listener) {
        captionUpdateSubscribers.delete(id)
        listener(id, patch)
      }
    })()
    captionPromiseById.set(id, promise)
  }

  async function processFile(id: string, file: File): Promise<void> {
    if (!findEntry(id)) return
    try {
      const { dataUri, width, height } = await downsampleImageForUpload(file)
      if (!findEntry(id)) return
      if (approxDataUriBytes(dataUri) > MAX_UPLOAD_IMAGE_BYTES) {
        patchEntry(id, { status: 'failed', errorMessage: '图片过大（压缩后仍超过 8MB），请换一张再试' })
        return
      }
      const uploaded = await uploadChatImage(dataUri, file.name)
      if (!findEntry(id)) return // 上传期间被删除：静默丢弃回写，不理会已上传成功的孤儿文件（同头像上传口径）
      // 注意：不采用 uploaded.id（服务端 uploads 台账用的 chat_img_xxx）覆盖本地 id——
      // 本地 id 是本组件状态数组的主键，贯穿 removeImage/retryUpload/caption 全程，
      // 中途换 id 会打乱这些查找；attachments_json 里的 id 只需在本条消息内唯一，local id 已满足。
      patchEntry(id, {
        status: 'ready',
        url: uploaded.url,
        mime: uploaded.mime,
        size: uploaded.size,
        width,
        height,
        errorMessage: undefined
      })
      triggerCaption(id)
    } catch (error) {
      if (!findEntry(id)) return
      patchEntry(id, { status: 'failed', errorMessage: error instanceof Error ? error.message : '上传失败，请重试' })
    }
  }

  function validateFile(file: File): string | null {
    if (!IMAGE_MIME_WHITELIST.has(file.type)) return '仅支持 png/jpeg/webp/gif 格式的图片'
    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) return '图片过大（原图需 ≤15MB）'
    return null
  }

  async function addFiles(fileListLike: File[] | FileList): Promise<void> {
    const imageFiles = Array.from(fileListLike as ArrayLike<File>).filter(
      (file): file is File => file instanceof File && file.type.startsWith('image/')
    )
    if (!imageFiles.length) return
    // 超出单条消息上限的部分静默丢弃（chips 条本身就是「当前待发送图片」的完整视图，
    // 上限就是数组长度上限，不额外为「被挤掉的图」留占位）。
    const availableSlots = Math.max(0, maxCount - pendingImages.value.length)
    const accepted = imageFiles.slice(0, availableSlots)

    for (const file of accepted) {
      const id = makeLocalAttachmentId()
      let previewUrl = ''
      try {
        previewUrl = URL.createObjectURL(file)
      } catch {
        previewUrl = ''
      }
      const invalidReason = validateFile(file)
      const entry: PendingImageAttachment = {
        id,
        kind: 'image',
        url: '',
        mime: file.type,
        originalName: file.name,
        size: file.size,
        status: invalidReason ? 'failed' : 'uploading',
        previewUrl,
        errorMessage: invalidReason || undefined
      }
      pendingImages.value = [...pendingImages.value, entry]
      if (invalidReason) continue
      fileById.set(id, file)
      const promise = processFile(id, file)
      uploadPromiseById.set(id, promise)
    }
  }

  function handlePaste(e: ClipboardEvent): boolean {
    const items = e.clipboardData?.items
    if (!items) return false
    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (!imageFiles.length) return false
    void addFiles(imageFiles)
    return true
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (files && files.length) void addFiles(files)
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault()
  }

  function removeImage(id: string): void {
    const idx = pendingImages.value.findIndex((img) => img.id === id)
    if (idx === -1) return
    const [removed] = pendingImages.value.splice(idx, 1)
    safeRevokeObjectUrl(removed?.previewUrl)
    fileById.delete(id)
    uploadPromiseById.delete(id)
    captionPromiseById.delete(id)
  }

  function retryUpload(id: string): void {
    const entry = findEntry(id)
    if (!entry || entry.status !== 'failed') return
    const file = fileById.get(id)
    if (!file) return
    // 重新走一遍校验（同一个 File 对象，mime/size 类硬失败会原样再失败一次，属预期行为，不特殊区分「值得重试」）
    const invalidReason = validateFile(file)
    if (invalidReason) {
      patchEntry(id, { status: 'failed', errorMessage: invalidReason })
      return
    }
    patchEntry(id, { status: 'uploading', errorMessage: undefined })
    const promise = processFile(id, file)
    uploadPromiseById.set(id, promise)
  }

  function clear(): void {
    for (const img of pendingImages.value) {
      safeRevokeObjectUrl(img.previewUrl)
    }
    pendingImages.value = []
    fileById.clear()
    uploadPromiseById.clear()
    captionPromiseById.clear()
  }

  /** 同步快照，不等待、不清空：宿主按下发送的瞬间用它取当前图（含 previewUrl）做乐观显示。 */
  function peekAttachments(): PendingImageAttachment[] {
    return pendingImages.value.map((img) => ({ ...img }))
  }

  async function takeAttachments(onCaptionUpdate?: CaptionUpdateListener, signal?: AbortSignal): Promise<ChatImageAttachment[]> {
    if (uploadPromiseById.size) {
      await raceTimeoutOrAbort(Promise.allSettled(Array.from(uploadPromiseById.values())), UPLOAD_WAIT_TIMEOUT_MS, signal)
    }
    const ready = pendingImages.value
      .filter((img) => img.status === 'ready')
      .map((img): ChatImageAttachment => {
        const { status: _status, previewUrl: _previewUrl, errorMessage: _errorMessage, ...attachment } = img
        return attachment
      })
    // caption 不等待：仍 'pending' 的原样带走，登记一次性订阅——caption 后台跑完时（无论此刻是否已 clear()）
    // 都会回调 onCaptionUpdate 一次，供宿主回填自己已乐观显示/已落库的那份消息。
    if (onCaptionUpdate) {
      for (const attachment of ready) {
        if (attachment.captionStatus !== 'pending') continue
        captionUpdateSubscribers.set(attachment.id, onCaptionUpdate)
      }
    }
    clear()
    return ready
  }

  return {
    pendingImages,
    hasPending,
    hasUploading,
    handlePaste,
    handleDrop,
    handleDragOver,
    addFiles,
    removeImage,
    retryUpload,
    peekAttachments,
    takeAttachments,
    clear
  }
}
