<template>
  <!-- 输入框图片上传·悬浮缩略图条（计划批3·2026-07-11）。根元素只负责内容排布（横排 chips），
       不自带 position: absolute——宿主用 class/style fallthrough 把它悬浮定位在输入壳上方，
       与 UI_STYLE.md「能靠结构表达就不写解释性小字/低存在感控件」一致，不额外加说明文案。 -->
  <div v-if="images.length" class="image-attachment-chips">
    <div
      v-for="img in images"
      :key="img.id"
      class="iac-chip"
      :class="`iac-chip--${img.status}`"
    >
      <button
        type="button"
        class="iac-chip__thumb"
        :disabled="img.status === 'uploading'"
        :aria-label="thumbAriaLabel(img)"
        :title="img.status === 'failed' ? img.errorMessage : undefined"
        @click="onThumbClick(img)"
      >
        <img
          v-if="img.previewUrl || img.url"
          :src="img.previewUrl || img.url"
          :alt="img.originalName || t('chat.imageAttachThumbAlt')"
          class="iac-chip__img"
        >
        <span v-if="img.status === 'uploading'" class="iac-chip__spinner" :aria-label="t('chat.imageAttachUploadingAria')"></span>
        <span v-else-if="img.status === 'failed'" class="iac-chip__warn" aria-hidden="true">
          <ChipIcon name="alert" :size="15" :stroke="2" />
        </span>
      </button>
      <button
        type="button"
        class="iac-chip__remove"
        :aria-label="t('chat.imageAttachRemoveAria')"
        :title="t('chat.imageAttachRemoveAria')"
        @click.stop="emit('remove', img.id)"
      >
        <ChipIcon name="x" :size="10" :stroke="2.4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 图片附件悬浮缩略图条：主聊天输入框（含提调统筹入口）与星依浮坞共用同一份组件——
 * 两处输入口各自持有独立 useImageAttachments() 实例，本组件零业务状态，只读 props 渲染。
 * 样式贴 UI_STYLE.md：细边浅底、克制圆角、低存在感（SubagentDispatchCardList.vue 的
 * .tds-script-card 是同批次最新参考，颜色 token 与阴影量级沿用同一套 --morandi-*）。
 */
import { defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PendingImageAttachment } from '../../../composables/app/useImageAttachments'

defineProps<{ images: PendingImageAttachment[] }>()
const emit = defineEmits<{
  remove: [id: string]
  retry: [id: string]
  preview: [url: string]
}>()

const { t } = useI18n()

function onThumbClick(img: PendingImageAttachment): void {
  if (img.status === 'failed') {
    emit('retry', img.id)
  } else if (img.status === 'ready') {
    emit('preview', img.url)
  }
  // uploading 态按钮本身 disabled，不会触发点击
}

function thumbAriaLabel(img: PendingImageAttachment): string {
  if (img.status === 'uploading') return t('chat.imageAttachUploadingAria')
  if (img.status === 'failed') return t('chat.imageAttachRetryAria')
  return t('chat.imageAttachPreviewAria')
}

// 极简本地图标集（同 SubagentDispatchCardList.vue 的 DirIcon 自包含范式，不引入图标库依赖）。
const ICONS: Record<string, string> = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
}

const ChipIcon = defineComponent({
  name: 'ChipIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 14 },
    stroke: { type: Number, default: 1.8 }
  },
  setup(p) {
    return () => h('svg', {
      width: p.size,
      height: p.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': p.stroke,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      innerHTML: ICONS[p.name] || ''
    })
  }
})
</script>

<style scoped>
/* CSS 注释里绝不能出现「星号+斜杠」连写（会提前闭合注释让 style 500）。颜色全部走项目 --morandi- token。 */
.image-attachment-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.iac-chip {
  position: relative;
  width: 56px;
  height: 56px;
  flex: none;
}
.iac-chip__thumb {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 1px solid var(--morandi-border);
  border-radius: 9px;
  background: var(--morandi-surface);
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.iac-chip__thumb:disabled { cursor: default; }
.iac-chip--failed .iac-chip__thumb { border-color: color-mix(in srgb, var(--morandi-danger) 45%, transparent); }
.iac-chip__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.iac-chip__spinner {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.34);
  display: flex;
  align-items: center;
  justify-content: center;
}
.iac-chip__spinner::before {
  content: '';
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.32);
  border-top-color: rgba(255, 255, 255, 0.92);
  animation: iac-spin 0.8s linear infinite;
}
@keyframes iac-spin { to { transform: rotate(360deg); } }
.iac-chip__warn {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--morandi-danger) 30%, transparent);
  color: var(--morandi-danger);
}
.iac-chip__remove {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--morandi-border);
  background: var(--morandi-card);
  color: var(--morandi-text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.iac-chip__remove:hover { color: var(--morandi-danger); border-color: color-mix(in srgb, var(--morandi-danger) 40%, transparent); }
</style>
