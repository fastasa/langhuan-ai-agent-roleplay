// 像素中控台 UI 层的服务端端点封装。铁律：本文件自带端点常量，不写进琅嬛全局 src/config/api.ts。
import { normalizeDocument, type PixelDocument } from '../core'

const BASE = '/api/pixel'

export interface PixelDocSummary {
  id: string
  name: string
  width: number
  height: number
  frameCount: number
  updatedAt: string
}

export class PixelApiError extends Error {
  status: number
  errors?: string[]
  constructor(status: number, message: string, errors?: string[]) {
    super(message)
    this.name = 'PixelApiError'
    this.status = status
    this.errors = errors
  }
}

async function parseErrorResponse(res: Response): Promise<never> {
  let body: { error?: string; errors?: string[] } | null = null
  try {
    body = await res.json()
  } catch {
    // 非 JSON 错误体，忽略
  }
  throw new PixelApiError(res.status, body?.error || `请求失败（${res.status}）`, body?.errors)
}

export async function listPixelDocs(): Promise<PixelDocSummary[]> {
  const res = await fetch(`${BASE}/docs`)
  if (!res.ok) return parseErrorResponse(res)
  const body = await res.json()
  return body.docs as PixelDocSummary[]
}

export async function getPixelDoc(id: string, signal?: AbortSignal): Promise<{ id: string; doc: PixelDocument; updatedAt: string }> {
  const res = await fetch(`${BASE}/docs/${encodeURIComponent(id)}`, signal ? { signal } : undefined)
  if (!res.ok) return parseErrorResponse(res)
  const body = await res.json()
  return { ...body, doc: normalizeDocument(body.doc) }
}

export async function createPixelDoc(doc: PixelDocument): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc })
  })
  if (!res.ok) return parseErrorResponse(res)
  return res.json()
}

export async function updatePixelDoc(id: string, doc: PixelDocument): Promise<void> {
  const res = await fetch(`${BASE}/docs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc })
  })
  if (!res.ok) return parseErrorResponse(res)
}

export async function deletePixelDoc(id: string): Promise<void> {
  const res = await fetch(`${BASE}/docs/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) return parseErrorResponse(res)
}
