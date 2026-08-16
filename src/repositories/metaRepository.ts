import { API } from '../config/api'

async function readJson(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
  if (typeof response.text === 'function') {
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${fallbackMessage}：返回内容不是有效 JSON`)
    }
  }
  try {
    return await response.json()
  } catch {
    throw new Error(`${fallbackMessage}：返回内容不是有效 JSON`)
  }
}

async function sendJson(url: string, method: string, body: unknown, fallbackMessage: string) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
  return response
}

export async function fetchCustomTags() {
  return await readJson(await fetch(API.CUSTOM_TAGS), '加载自定义标签失败')
}

export async function createCustomTagRecord(tag: Record<string, unknown>) {
  await sendJson(API.CUSTOM_TAGS, 'POST', tag, '保存标签失败')
}

export async function updateCustomTagRecord(id: string, changes: Record<string, unknown>) {
  await sendJson(`${API.CUSTOM_TAGS}/${encodeURIComponent(id)}`, 'PUT', changes, '保存标签失败')
}

export async function deleteCustomTagRecord(id: string) {
  const response = await fetch(`${API.CUSTOM_TAGS}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error('删除标签失败')
  }
}

export async function fetchEventStackToday(date?: string, options: RequestInit = {}) {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return await readJson(await fetch(`${API.EVENT_STACK_TODAY}${query}`, options), '加载事栈失败')
}

export async function createEventStackRecord(event: Record<string, unknown>) {
  await sendJson(API.EVENT_STACK, 'POST', event, '添加事栈失败')
}
