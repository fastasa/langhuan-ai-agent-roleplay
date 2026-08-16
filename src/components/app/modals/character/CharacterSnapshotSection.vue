<template>
  <section class="character-snapshot-section">
    <button
      type="button"
      class="character-snapshot-header"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="character-snapshot-title">
        <span class="character-snapshot-index">5</span>
        <span>角色快照</span>
        <span class="character-snapshot-count">{{ snapshots.length }}</span>
      </span>
      <svg class="character-snapshot-chevron" :class="{ open: expanded }" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>

    <div v-if="expanded" class="character-snapshot-body">
      <div class="character-snapshot-toolbar">
        <input
          v-model.trim="manualLabel"
          maxlength="80"
          placeholder="快照名称（可留空）"
          :disabled="busy"
          @keyup.enter="emitCreate"
        >
        <button type="button" class="snapshot-action snapshot-action--primary" :disabled="busy" @click="emitCreate">
          保存当前状态
        </button>
        <button
          type="button"
          class="snapshot-icon-action"
          title="刷新快照"
          aria-label="刷新快照"
          :disabled="busy || loading"
          @click="$emit('refresh')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" /></svg>
        </button>
        <button
          type="button"
          class="snapshot-icon-action"
          title="清理超额自动快照"
          aria-label="清理超额自动快照"
          :disabled="busy || !automaticCount"
          @click="$emit('cleanup')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14H5V6" /><path d="M10 11v5M14 11v5" /></svg>
        </button>
      </div>

      <div v-if="loading" class="character-snapshot-empty">正在读取快照…</div>
      <div v-else-if="!snapshots.length" class="character-snapshot-empty">还没有快照。保存后可从这里恢复角色状态。</div>
      <div v-else class="character-snapshot-list">
        <article v-for="snapshot in snapshots" :key="snapshot.id" class="character-snapshot-row">
          <div class="character-snapshot-main">
            <div class="character-snapshot-name-row">
              <strong>{{ snapshot.label || '未命名快照' }}</strong>
              <span :class="snapshot.snapshotKind === 'manual' ? 'is-manual' : 'is-automatic'">
                {{ snapshot.snapshotKind === 'manual' ? '手工' : '自动保护' }}
              </span>
            </div>
            <div class="character-snapshot-meta">
              <span>{{ formatDate(snapshot.createdAt) }}</span>
              <span v-if="snapshot.sourceSessionId">来源：{{ resolveSessionLabel(snapshot.sourceSessionId) }}</span>
              <span v-if="snapshot.activeBranchCount > 0">{{ snapshot.activeBranchCount }} 个会话正在使用</span>
              <span :class="{ 'is-warning': isModelMissing(snapshot) }">{{ modelLabel(snapshot) }}</span>
            </div>
          </div>
          <div class="character-snapshot-actions">
            <button type="button" class="snapshot-action" :disabled="busy" @click="$emit('overwrite', snapshot)">覆盖主线</button>
            <button
              type="button"
              class="snapshot-action snapshot-action--danger"
              :disabled="busy || snapshot.activeBranchCount > 0"
              :title="snapshot.activeBranchCount > 0 ? '仍被活会话使用，不能删除' : '删除快照'"
              @click="$emit('delete', snapshot)"
            >
              删除
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CharacterSnapshotMetadata } from '../../../../repositories/characterRepository'

const props = withDefaults(defineProps<{
  snapshots: CharacterSnapshotMetadata[]
  loading?: boolean
  busy?: boolean
  sessionLabels?: Record<string, string>
  knownPersonalityModelVersionIds?: string[]
}>(), {
  loading: false,
  busy: false,
  sessionLabels: () => ({}),
  knownPersonalityModelVersionIds: () => []
})

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'create', label: string): void
  (e: 'cleanup'): void
  (e: 'delete', snapshot: CharacterSnapshotMetadata): void
  (e: 'overwrite', snapshot: CharacterSnapshotMetadata): void
}>()

const expanded = ref(false)
const manualLabel = ref('')
const automaticCount = computed(() => props.snapshots.filter((item) => item.snapshotKind === 'automatic').length)

function emitCreate() {
  if (props.busy) return
  emit('create', manualLabel.value)
  manualLabel.value = ''
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

function resolveSessionLabel(sessionId: string) {
  return props.sessionLabels[sessionId] || `已删除或未加载的会话（${sessionId}）`
}

function isModelMissing(snapshot: CharacterSnapshotMetadata) {
  const versionId = String(snapshot.personalityModelVersionId || '')
  return Boolean(versionId && !props.knownPersonalityModelVersionIds.includes(versionId))
}

function modelLabel(snapshot: CharacterSnapshotMetadata) {
  const versionId = String(snapshot.personalityModelVersionId || '')
  if (!versionId) return '无人格模型'
  if (isModelMissing(snapshot)) return '人格模型版本已清理，覆盖后降级普通召回'
  return `人格模型 ${versionId}`
}
</script>

<style scoped>
.character-snapshot-section {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 96%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 74%, transparent);
  overflow: hidden;
}

.character-snapshot-header {
  width: 100%;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 0;
  border-bottom: 1px solid transparent;
  color: var(--morandi-text);
  background: color-mix(in srgb, var(--morandi-card) 88%, transparent);
  cursor: pointer;
}

.character-snapshot-header[aria-expanded="true"] { border-bottom-color: var(--morandi-border); }
.character-snapshot-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.character-snapshot-index { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #8f9d99; font-size: 0.76rem; }
.character-snapshot-count { color: var(--morandi-text-light); font-size: 0.78rem; font-weight: 500; }
.character-snapshot-chevron { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; transition: transform 0.18s ease; }
.character-snapshot-chevron.open { transform: rotate(90deg); }
.character-snapshot-body { padding: 12px 14px 14px; }
.character-snapshot-toolbar { display: grid; grid-template-columns: minmax(160px, 1fr) auto 32px 32px; gap: 7px; align-items: center; }
.character-snapshot-toolbar input { min-width: 0; height: 34px; padding: 0 10px; border: 1px solid var(--morandi-border); border-radius: 5px; color: var(--morandi-text); background: var(--langhuan-dialog-input-bg, var(--morandi-card)); }
.snapshot-action, .snapshot-icon-action { border: 1px solid var(--morandi-border); color: var(--morandi-text); background: color-mix(in srgb, var(--morandi-card) 88%, transparent); cursor: pointer; }
.snapshot-action { min-height: 32px; padding: 0 10px; border-radius: 5px; font-size: 0.82rem; }
.snapshot-action--primary { color: #fff; border-color: #7f928a; background: #7f928a; }
.snapshot-action--danger { color: var(--danger-color, #a65f5f); }
.snapshot-action:disabled, .snapshot-icon-action:disabled { opacity: 0.45; cursor: not-allowed; }
.snapshot-icon-action { width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border-radius: 5px; }
.snapshot-icon-action svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.character-snapshot-list { margin-top: 10px; border-top: 1px solid var(--morandi-border); }
.character-snapshot-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 72%, transparent); }
.character-snapshot-row:last-child { border-bottom: 0; padding-bottom: 0; }
.character-snapshot-main { flex: 1; min-width: 0; }
.character-snapshot-name-row { display: flex; align-items: center; gap: 7px; }
.character-snapshot-name-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
.character-snapshot-name-row span { flex: none; padding: 1px 5px; border: 1px solid var(--morandi-border); border-radius: 4px; color: var(--morandi-text-light); font-size: 0.7rem; font-weight: 500; }
.character-snapshot-name-row .is-manual { color: #597a69; }
.character-snapshot-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; color: var(--morandi-text-light); font-size: 0.74rem; }
.character-snapshot-meta .is-warning { color: var(--danger-color, #9b5b55); }
.character-snapshot-actions { flex: none; display: flex; gap: 6px; }
.character-snapshot-empty { padding: 18px 4px 8px; color: var(--morandi-text-light); text-align: center; font-size: 0.82rem; }

@media (max-width: 760px) {
  .character-snapshot-toolbar { grid-template-columns: 1fr auto; }
  .snapshot-icon-action { display: none; }
  .character-snapshot-row { align-items: flex-start; flex-direction: column; }
  .character-snapshot-actions { align-self: stretch; }
  .character-snapshot-actions .snapshot-action { flex: 1; }
}
</style>
