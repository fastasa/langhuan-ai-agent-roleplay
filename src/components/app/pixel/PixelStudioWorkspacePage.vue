<template>
  <PixelStudioPage
    :publish-targets="publishTargets"
    publish-target-label="状态栏图片格"
    publish-action-label="贴到状态栏"
    :on-publish-snapshot="publishSnapshot"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PixelStudioPage from '../../../pixel-studio/ui/PixelStudioPage.vue'
import { API } from '../../../config/api'
import { fetchStatusPanels, uploadStatusAsset } from '../../../repositories/chatRepository'

type PublishTarget = { sessionId: string; panelId: string; fieldKey: string; label: string }
const targets = ref<PublishTarget[]>([])
const publishTargets = ref<Array<{ id: string; label: string }>>([])

async function loadTargets() {
  const response = await fetch(API.CHAT_STATUS_ASSET_PUBLISH_TARGETS)
  if (!response.ok) throw new Error(`加载状态栏图片格失败（${response.status}）`)
  const data = await response.json() as { items?: PublishTarget[] }
  targets.value = Array.isArray(data.items) ? data.items : []
  publishTargets.value = targets.value.map((target) => ({ id: JSON.stringify(target), label: target.label }))
}

function blobDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取像素快照失败'))
    reader.readAsDataURL(blob)
  })
}

async function publishSnapshot(payload: { targetId: string; blob: Blob; fileName: string; source: Record<string, unknown> }) {
  let target: PublishTarget
  try { target = JSON.parse(payload.targetId) as PublishTarget } catch { throw new Error('发布目标已失效，请重新打开导出窗口') }
  if (!targets.value.some((item) => item.sessionId === target.sessionId && item.panelId === target.panelId && item.fieldKey === target.fieldKey)) {
    throw new Error('发布目标已失效，请刷新像素中控台')
  }
  const panels = await fetchStatusPanels(target.sessionId)
  const panel = panels.find((item) => item.id === target.panelId)
  if (!panel) throw new Error('目标状态栏已不存在')
  await uploadStatusAsset(target.sessionId, {
    dataUri: await blobDataUri(payload.blob),
    fileName: payload.fileName,
    alt: `${panel.name} 像素快照`,
    sourceType: 'pixel_snapshot',
    sourceRef: { ...payload.source, panelId: panel.id, fieldKey: target.fieldKey },
    bind: {
      panelId: panel.id,
      fieldKey: target.fieldKey,
      expectedVersion: panel.version,
      idempotencyKey: `pixel-status-${panel.id}-${target.fieldKey}-${Date.now()}`
    }
  })
}

onMounted(() => { void loadTargets() })
</script>
