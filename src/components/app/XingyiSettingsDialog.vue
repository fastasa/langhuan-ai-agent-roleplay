<template>
  <AppModalShell
    :open="open"
    :title="t('xingyi.xingyiSettingsTitle')"
    size="sm"
    show-close
    close-on-overlay
    @close="$emit('close')"
  >
    <div class="xingyi-settings">
      <section class="xingyi-settings__section">
        <div class="xingyi-settings__label">{{ t('xingyi.desktopPetLabel') }}</div>
        <div class="xingyi-settings__setting-row">
          <span class="xingyi-settings__hint">{{ t('xingyi.desktopPetHint') }}</span>
          <label class="ticket-switch">
            <input
              type="checkbox"
              :checked="desktopPetVisible"
              :aria-label="t('xingyi.desktopPetLabel')"
              @change="$emit('update:desktop-pet-visible', ($event.target as HTMLInputElement).checked)"
            >
            <span class="ticket-switch-track"></span>
          </label>
        </div>
      </section>
      <!-- 日记视角开关：切换即保存，不需要额外「保存」按钮；开关两侧文字标签固定标出当前对应哪一档，
           不做只有孤零零开关没文字说明的样式。 -->
      <section v-if="showDiarySettings" class="xingyi-settings__section">
        <div class="xingyi-settings__label">{{ t('xingyi.diaryViewpointLabel') }}</div>
        <div class="xingyi-settings__switch-row">
          <span
            class="xingyi-settings__switch-text"
            :class="{ 'xingyi-settings__switch-text--active': viewpoint === 'xingyi' }"
          >{{ t('xingyi.diaryViewpointXingyi') }}</span>
          <label class="ticket-switch">
            <input
              type="checkbox"
              :checked="viewpoint === 'objective'"
              :disabled="viewpointLoading || viewpointSaving"
              @change="onViewpointToggle(($event.target as HTMLInputElement).checked)"
            >
            <span class="ticket-switch-track"></span>
          </label>
          <span
            class="xingyi-settings__switch-text"
            :class="{ 'xingyi-settings__switch-text--active': viewpoint === 'objective' }"
          >{{ t('xingyi.diaryViewpointObjective') }}</span>
        </div>
        <div v-if="viewpointLoading" class="xingyi-settings__hint">{{ t('xingyi.diaryViewpointLoading') }}</div>
        <div v-else-if="viewpointSaving" class="xingyi-settings__hint">{{ t('xingyi.diaryViewpointSaving') }}</div>
        <div v-else-if="viewpointSaveError" class="xingyi-settings__hint xingyi-settings__hint--error" role="alert">
          {{ t('xingyi.diaryViewpointSaveFailed', { detail: viewpointSaveError }) }}
        </div>
        <div v-else-if="viewpointLoadError" class="xingyi-settings__hint xingyi-settings__hint--error" role="alert">
          {{ t('xingyi.diaryViewpointLoadFailed', { detail: viewpointLoadError }) }}
        </div>
      </section>
    </div>
  </AppModalShell>
</template>

<script setup lang="ts">
/**
 * 星依设置面板（星依聊天日记化归档计划批次3 修正·2026-07-16）——齿轮入口打开的通用设置弹层。
 * 桌宠显示为设备级偏好，由 XingyiDock 以受控 prop/emits 持有唯一真值；日记视角保存在本地服务。
 * 「立即生成今天日记」已挪出面板，改为浮坞工具栏独立按钮 + /diary 斜杠命令（见 XingyiDock.vue）。
 * 纯局部状态，不接入全局 store。
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppModalShell from '../common/AppModalShell.vue'
import {
  getXingyiDiaryViewpoint,
  setXingyiDiaryViewpoint,
  type XingyiDiaryViewpoint
} from '../../repositories/chatRepository'

const props = withDefaults(defineProps<{
  open: boolean
  desktopPetVisible?: boolean
  showDiarySettings?: boolean
}>(), {
  desktopPetVisible: true,
  showDiarySettings: false
})
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:desktop-pet-visible', visible: boolean): void
}>()

const { t } = useI18n()

const viewpoint = ref<XingyiDiaryViewpoint>('xingyi')
const viewpointLoading = ref(false)
const viewpointSaving = ref(false)
const viewpointLoadError = ref('')
const viewpointSaveError = ref('')

function readErrorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function loadViewpoint() {
  viewpointLoading.value = true
  viewpointLoadError.value = ''
  viewpointSaveError.value = ''
  try {
    viewpoint.value = await getXingyiDiaryViewpoint()
  } catch (err) {
    viewpointLoadError.value = readErrorDetail(err)
  } finally {
    viewpointLoading.value = false
  }
}

async function selectViewpoint(next: XingyiDiaryViewpoint) {
  if (next === viewpoint.value || viewpointLoading.value || viewpointSaving.value) return
  const previous = viewpoint.value
  viewpoint.value = next
  viewpointSaving.value = true
  viewpointSaveError.value = ''
  try {
    await setXingyiDiaryViewpoint(next)
  } catch (err) {
    // 保存失败回退到切换前的选中项，避免 UI 显示与服务端真值不一致
    viewpoint.value = previous
    viewpointSaveError.value = readErrorDetail(err)
  } finally {
    viewpointSaving.value = false
  }
}

/** 开关 checked=true 对应「第三人称客观」，checked=false 对应「星依第一人称」。 */
function onViewpointToggle(checked: boolean) {
  void selectViewpoint(checked ? 'objective' : 'xingyi')
}

// 每次打开面板都重新读取当前视角（而非只在组件创建时读一次）。
watch(() => props.open, (isOpen) => {
  if (isOpen && props.showDiarySettings) loadViewpoint()
})
</script>

<style scoped>
.xingyi-settings {
  display: grid;
  gap: 22px;
  padding-bottom: 18px;
}

.xingyi-settings__section {
  display: grid;
  gap: 8px;
}

.xingyi-settings__label {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--morandi-text, #4f463f);
}

.xingyi-settings__switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.xingyi-settings__setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.xingyi-settings__switch-text {
  font-size: 0.86rem;
  color: var(--morandi-text-light, #7b746b);
  transition: color 0.16s ease, font-weight 0.16s ease;
}

.xingyi-settings__switch-text--active {
  color: var(--langhuan-dialog-primary-bg, #4f867c);
  font-weight: 600;
}

.xingyi-settings__hint {
  font-size: 0.82rem;
  color: var(--morandi-text-light, #7b746b);
}

.xingyi-settings__hint--error {
  color: var(--morandi-danger, #c0665a);
}
</style>
