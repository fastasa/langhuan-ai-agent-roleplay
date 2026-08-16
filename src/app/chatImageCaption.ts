// 图片转述 caption 生成（输入框图片上传计划批2·通道B文字转述）。
// 上传成功后调用本函数，用 imageCaption 任务档（映射校书 balanced 档）对图片生成中文转述，
// 写回 ChatImageAttachment.caption，供非识图模型/历史轮通过 formatAttachmentNote 文字回看。
//
// ⚠️ 边界（设计内行为，非 bug）：本函数发出的用户消息本身就带 image_url content part——
// 它吃的是 aiAppService 的图片双通道分流（同批次落码，见 server/application/ai/aiAppService.ts
// dispatchMessageContentForVision）：如果校书档实际解析到的 preset 没有勾选「支持识图」
// （supports_vision），图片会被服务端拍平成占位文字，caption 会答非所问甚至报错——
// 这不是本函数的缺陷，是用户需要把校书档配成一个真正识图的模型才能让「图片转述」名副其实。
//
// 与 src/app/langhuanAgentAssist.ts 同一套「app/ 层不直接 import composables/useAI.ts，
// callAI 由调用方注入」的解耦范式：本文件保持可独立单测、不依赖 Pinia store。
import type { AgentModelConfig } from '../types'
import type { AIContentPart } from '../utils/chatAttachments'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'
import { makeOperationUnitId } from './aiUsageContext'

export type ChatImageCaptionAiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | AIContentPart[]
}

/** 与 useAI().callAI 签名兼容（结构型）：浮坞/输入框接线时直接传 useAI() 实例的 callAI 即可。 */
export type ChatImageCaptionAiCaller = (
  messages: ChatImageCaptionAiMessage[],
  options: ReturnType<typeof buildTaskModelAiOptions> & {
    feature: 'agent'
    unitKind: string
    roundId: string
    sessionId?: string
    usageLabel?: string
    placeLabel?: string
    placeType?: 'single' | 'group' | 'other'
    logLabel?: string
    registerAbortController?: boolean
  }
) => Promise<string | null>

export type GenerateImageCaptionInput = {
  url: string
  mime: string
  sessionId?: string
  agentConfig: Partial<AgentModelConfig> | null | undefined
  callAI: ChatImageCaptionAiCaller
}

export type GenerateImageCaptionResult = { caption: string } | { error: string }

const CAPTION_PROMPT_TEXT = '用中文简要而完整地描述这张图片的内容，包括画面主体、场景、可见文字，200字以内。'

/** 失败（含图片失效/模型不识图答非所问/AI调用失败）一律返回 { error }，不抛异常——
 *  调用方（上传后台流程）应静默降级，不阻断上传本身或整轮发送。 */
export async function generateImageCaption(input: GenerateImageCaptionInput): Promise<GenerateImageCaptionResult> {
  const url = String(input?.url || '').trim()
  if (!url) return { error: '缺少图片地址' }
  const sessionId = String(input?.sessionId || '').trim()

  try {
    const output = await input.callAI(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: CAPTION_PROMPT_TEXT },
            { type: 'image_url', image_url: { url } }
          ]
        }
      ],
      {
        ...buildTaskModelAiOptions(input.agentConfig, 'imageCaption', { temperature: 0.3, maxTokens: 512, thinking: 'disabled' }),
        feature: 'agent',
        unitKind: 'image_caption',
        roundId: makeOperationUnitId('image_caption', sessionId),
        sessionId,
        usageLabel: '图片转述',
        placeLabel: '聊天图片上传',
        placeType: 'other',
        logLabel: 'chat-image-caption',
        registerAbortController: false
      }
    )
    const text = String(output || '').trim()
    if (!text) return { error: '未能生成图片描述' }
    if (/^\[API调用失败[：:]/u.test(text)) {
      return { error: text.replace(/^\[|\]$/g, '') }
    }
    return { caption: text }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
