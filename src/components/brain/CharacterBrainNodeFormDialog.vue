<template>
  <AppFormDialog
    :open="open"
    :title="title || $t('brain.nodeForm.defaultTitle')"
    :subtitle="subtitle"
    size="md"
    :submit-text="$t('brain.nodeForm.submitCreate')"
    :submit-disabled="!canSubmit || saving"
    @cancel="$emit('cancel')"
    @submit="submitForm"
  >
    <div class="brain-node-form">
      <label class="brain-node-form__field">
        <span class="brain-node-form__field-label">{{ $t('brain.field.title') }}</span>
        <input v-model="draft.title" class="brain-node-form__input" type="text" :placeholder="$t('brain.nodeForm.titlePlaceholder')">
      </label>
      <label class="brain-node-form__field">
        <span class="brain-node-form__field-label">{{ $t('brain.field.summary') }}</span>
        <textarea v-model="draft.summary" class="brain-node-form__textarea" rows="4" :placeholder="$t('brain.nodeForm.summaryPlaceholder')"></textarea>
      </label>
      <label class="brain-node-form__field">
        <span class="brain-node-form__field-label">{{ $t('brain.field.kind') }}</span>
        <select v-model="draft.kind" class="brain-node-form__input">
          <option v-for="option in resolvedKindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppFormDialog from '../common/AppFormDialog.vue'

type NodeFormKindOption = {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  saving?: boolean
  kindOptions?: NodeFormKindOption[]
}>(), {
  title: '',
  subtitle: '',
  saving: false,
  // 默认交给 resolvedKindOptions 用 i18n 生成，避免在 props 默认里硬编码文案
  kindOptions: () => ([])
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'submit', payload: { title: string; summary: string; kind: string }): void
}>()

const { t } = useI18n()

const draft = reactive({
  title: '',
  summary: '',
  kind: 'group'
})

// 节点类型 value 是逻辑枚举（group/private/reference），只翻显示 label
const resolvedKindOptions = computed(() => props.kindOptions.length
  ? props.kindOptions
  : [
      { value: 'group', label: t('brain.nodeForm.kindGroup') },
      { value: 'private', label: t('brain.nodeForm.kindPrivate') },
      { value: 'reference', label: t('brain.nodeForm.kindReference') }
    ])

const canSubmit = computed(() => Boolean(draft.title.trim()))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    draft.title = ''
    draft.summary = ''
    draft.kind = resolvedKindOptions.value[0]?.value || 'group'
  }
)

function submitForm() {
  const title = draft.title.trim()
  if (!title || props.saving) return
  emit('submit', {
    title,
    summary: draft.summary.trim(),
    kind: draft.kind
  })
}
</script>

<style scoped>
.brain-node-form {
  display: grid;
  gap: 14px;
}

.brain-node-form__field {
  display: grid;
  gap: 7px;
}

.brain-node-form__field-label {
  color: var(--morandi-text);
  font-size: 13px;
  font-weight: 600;
}

.brain-node-form__input,
.brain-node-form__textarea {
  width: 100%;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text);
  font: inherit;
  line-height: 1.45;
  padding: 10px 12px;
}

.brain-node-form__textarea {
  min-height: 96px;
  resize: vertical;
}
</style>
