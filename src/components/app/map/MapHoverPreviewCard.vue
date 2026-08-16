<template>
  <section class="map-hover-card" :aria-label="t('chat.mapHoverPreview')">
    <div v-if="loading" class="map-hover-card__state" aria-live="polite">
      <span class="map-hover-card__spinner" aria-hidden="true"></span>
      <span>{{ t('chat.mapDataLoading') }}</span>
    </div>

    <div v-else-if="error" class="map-hover-card__state map-hover-card__state--error">
      <span>{{ error }}</span>
      <button type="button" @click="loadCurrentMap(true)">{{ t('chat.mapLoadRetry') }}</button>
    </div>

    <MapCanvas
      v-else-if="world"
      :key="canvasKey"
      class="map-hover-card__canvas"
      :world="world"
      :panels="{}"
      view="terrain"
      :status-on="false"
      compact
    />

    <div v-else class="map-hover-card__state map-hover-card__state--empty">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
        <path d="M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2s2-.9 2-2 .9-2 2-2h3.17" />
        <path d="M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
        <circle cx="12" cy="12" r="10" />
      </svg>
      <span>{{ t('chat.mapEmptyTitle') }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MapCanvas from './MapCanvas.vue'
import { projectPrimaryWorldMap } from '../../../app/worldMapViewProjection'
import { worldMapRevision } from '../../../app/worldMapRevision'
import { fetchChatSessionBundleById, fetchWorldMapBundle } from '../../../repositories/chatRepository'
import type { WorldMapBundle } from '../../../types'

const props = withDefaults(defineProps<{
  sessionId: string
  active?: boolean
}>(), { active: false })

const { t } = useI18n()
const loading = ref(false)
const error = ref('')
const resolvedSessionId = ref('')
const worldId = ref('')
const bundle = ref<WorldMapBundle | null>(null)
const appliedRevision = ref(0)
let requestSeq = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const world = computed(() => projectPrimaryWorldMap(bundle.value))
const canvasKey = computed(() => `${resolvedSessionId.value}:${worldId.value}:${appliedRevision.value}`)

function resetPreview() {
  requestSeq += 1
  loading.value = false
  error.value = ''
  resolvedSessionId.value = ''
  worldId.value = ''
  bundle.value = null
  appliedRevision.value = 0
}

async function loadCurrentMap(force = false) {
  const sessionId = String(props.sessionId || '').trim()
  if (!sessionId || loading.value) return
  if (!force && resolvedSessionId.value === sessionId) return
  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  try {
    const sessionBundle = await fetchChatSessionBundleById(sessionId, { limit: 1 })
    if (seq !== requestSeq) return
    const session = sessionBundle?.session
    const nextWorldId = String(session?.worldId ?? session?.world_id ?? '').trim()
    resolvedSessionId.value = sessionId
    worldId.value = nextWorldId
    bundle.value = nextWorldId ? await fetchWorldMapBundle(nextWorldId) : null
    if (seq !== requestSeq) return
    appliedRevision.value = worldMapRevision.value.rev
  } catch (cause) {
    if (seq !== requestSeq) return
    bundle.value = null
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

async function refreshVisibleMap() {
  const currentWorldId = worldId.value
  if (!currentWorldId) return
  const seq = ++requestSeq
  try {
    const freshBundle = await fetchWorldMapBundle(currentWorldId)
    if (seq !== requestSeq || currentWorldId !== worldId.value) return
    bundle.value = freshBundle
    appliedRevision.value = worldMapRevision.value.rev
  } catch {
    // 静默刷新失败时保留当前预览；下次写入、切会话或手动重开仍会纠正。
  }
}

watch(
  [() => String(props.sessionId || '').trim(), () => props.active],
  ([sessionId, active], previous) => {
    const previousSessionId = previous?.[0] || ''
    if (sessionId !== previousSessionId) resetPreview()
    if (active) void loadCurrentMap()
  },
  { immediate: true }
)

watch(worldMapRevision, (revision) => {
  if (!props.active || !worldId.value) return
  if (revision.worldId && revision.worldId !== worldId.value) return
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    if (props.active) void refreshVisibleMap()
  }, 500)
})

onBeforeUnmount(() => {
  requestSeq += 1
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<style scoped>
.map-hover-card {
  width: 438px;
  height: 292px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 86%, transparent);
  border-radius: 14px;
  background: #fbfaf6;
  box-shadow: 0 18px 45px rgba(57, 48, 39, 0.18), 0 3px 10px rgba(57, 48, 39, 0.08);
}

.map-hover-card__canvas {
  width: 100%;
  height: 100%;
}

.map-hover-card__state {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-sizing: border-box;
  padding: 28px;
  color: var(--morandi-text-light);
  font-size: 13px;
  text-align: center;
}

.map-hover-card__state svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: color-mix(in srgb, var(--morandi-accent) 72%, var(--morandi-text-light));
  stroke-width: 1.55;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-hover-card__state button {
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-card);
  color: var(--morandi-text);
  cursor: pointer;
  padding: 6px 12px;
}

.map-hover-card__spinner {
  width: 18px;
  height: 18px;
  border: 2px solid color-mix(in srgb, var(--morandi-border) 75%, transparent);
  border-top-color: var(--morandi-accent);
  border-radius: 999px;
  animation: map-hover-card-spin 0.8s linear infinite;
}

@keyframes map-hover-card-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 560px) {
  .map-hover-card {
    width: min(438px, calc(100vw - 24px));
  }
}
</style>
