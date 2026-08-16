<template>
  <div class="compile-entry" :class="{ 'compile-entry--compact': compact }">
    <button
      type="button"
      class="compile-entry__button"
      :title="displayTitle"
      :aria-label="displayTitle"
      @click="emit('open')"
    >
      <span>{{ displayLabel }}</span>
      <!-- status 为 compilePageIndicators.ts 生成的中文状态值（'错误' 等），该模块尚未纳入 i18n，比较值与展示暂保留中文，待后续批次统一 -->
      <span
        class="compile-entry__status"
        :class="{
          'compile-entry__status--warning': warning,
          'compile-entry__status--error': status === '错误'
        }"
      >
        {{ status }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  label?: string
  title?: string
  status: string
  warning?: boolean
  compact?: boolean
}>(), {
  label: '',
  title: '',
  warning: false,
  compact: false
})

const emit = defineEmits<{
  open: []
}>()

const { t } = useI18n()
// 未显式传 label/title 时回退到 i18n 默认文案
const displayLabel = computed(() => props.label || t('unitTree.publicCompilePage'))
const displayTitle = computed(() => props.title || t('unitTree.openPublicCompilePage'))
</script>

<style scoped>
.compile-entry {
  margin: 0 18px;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, var(--leaf-border, #d9d4c9)) 78%, transparent);
  background: transparent;
}

.compile-entry--compact {
  margin: 0;
}

.compile-entry__button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: none;
  background: transparent;
  color: var(--leaf-text-soft, var(--morandi-text-light, #6c7468));
  cursor: pointer;
  font-weight: 700;
  padding: 0;
  text-align: left;
}

.compile-entry__button:hover {
  color: var(--leaf-text, var(--morandi-text, #364034));
}

.compile-entry__status {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(76, 122, 93, 0.1);
  color: rgba(42, 94, 61, 0.92);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  padding: 5px 8px;
}

.compile-entry__status--warning {
  background: rgba(188, 126, 42, 0.14);
  color: rgba(130, 80, 25, 0.96);
}

.compile-entry__status--error {
  background: color-mix(in srgb, #c95f56 14%, transparent);
  color: #9f332d;
}
</style>
