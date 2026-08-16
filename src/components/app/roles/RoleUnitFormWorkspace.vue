<template>
  <section class="role-workspace__form" :class="{ 'role-workspace__form--compact': compact }">
    <div class="role-workspace__form-toolbar">
      <span>{{ title }}</span>
      <button type="button" class="role-workspace__save-btn" @click="emit('save')">{{ $t('common.save') }}</button>
    </div>
    <form class="role-workspace__form-body" @submit.prevent="emit('save')">
      <label
        v-for="field in fields"
        :key="field.key"
        class="role-workspace__field"
        :class="{ 'role-workspace__field--span-2': (field.columnSpan || 2) === 2 }"
      >
        <span>{{ field.label }}</span>
        <select
          v-if="field.type === 'select'"
          :class="['role-workspace__control', field.controlClassName]"
          :value="getValue(field.key)"
          :disabled="field.readonly"
          @change="emit('update-field', field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in field.options || []" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select
          v-else-if="field.type === 'apiPreset'"
          :class="['role-workspace__control', field.controlClassName]"
          :value="getValue(field.key)"
          :disabled="field.readonly"
          @change="emit('update-field', field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ $t('brain.card.followGlobal') }}</option>
          <option v-for="preset in apiPresets" :key="preset.name" :value="preset.name">
            {{ preset.name }}
          </option>
        </select>
        <div v-else-if="field.type === 'apiModel'" class="role-workspace__model-picker">
          <select
            :class="['role-workspace__control', field.controlClassName]"
            :value="getValue(field.key)"
            :disabled="field.readonly"
            @change="emit('update-field', field.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ $t('brain.card.followPreset') }}</option>
            <option v-for="model in modelOptions" :key="model" :value="model">
              {{ model }}
            </option>
            <option v-if="showCustomModel" :value="getValue(field.key)">
              {{ $t('brain.card.customModelPrefix', { model: getValue(field.key) }) }}
            </option>
          </select>
          <button
            type="button"
            class="role-workspace__secondary-btn"
            :disabled="!getValue('defaultPreset') || modelLoading"
            @click="emit('load-models')"
          >
            {{ modelLoading ? $t('common.loading') : $t('brain.card.loadModels') }}
          </button>
          <input
            v-if="showCustomModel"
            :class="['role-workspace__control', field.controlClassName]"
            :value="getValue(field.key)"
            :placeholder="$t('brain.card.customModelPlaceholder')"
            @input="emit('update-field', field.key, ($event.target as HTMLInputElement).value)"
          >
        </div>
        <div v-else-if="field.type === 'avatar'" class="role-workspace__avatar-picker">
          <div class="role-workspace__avatar-preview">
            <img v-if="getValue(field.key)" :src="getValue(field.key)" :alt="$t('brain.card.avatarPreviewAlt')">
            <span v-else>{{ $t('brain.roleWorkspace.avatar') }}</span>
          </div>
          <div class="role-workspace__avatar-actions">
            <input type="file" accept="image/*" @change="handleAvatarInput(field.key, $event)">
            <button type="button" class="role-workspace__secondary-btn" @click="emit('update-field', field.key, '')">{{ $t('brain.card.clear') }}</button>
          </div>
        </div>
        <div v-else-if="field.type === 'calendarMonthDays'" class="role-workspace__calendar-editor">
          <div class="role-workspace__calendar-grid" role="group" :aria-label="field.label">
            <label
              v-for="month in 12"
              :key="month"
              class="role-workspace__calendar-month"
            >
              <span>{{ $t('brain.card.monthUnit', { month }) }}</span>
              <input
                class="role-workspace__control role-workspace__calendar-input"
                type="number"
                min="1"
                :value="getCalendarMonthDayValue(field.key, month)"
                :disabled="field.readonly"
                @input="updateCalendarMonthDay(field.key, month, ($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
          <div class="role-workspace__calendar-actions">
            <button type="button" class="role-workspace__secondary-btn" :disabled="field.readonly" @click="applyGregorianMonthDays(field.key)">{{ $t('brain.card.gregorian') }}</button>
            <button type="button" class="role-workspace__secondary-btn" :disabled="field.readonly" @click="clearCalendarMonthDays(field.key)">{{ $t('brain.card.defaultBtn') }}</button>
          </div>
        </div>
        <label v-else-if="field.type === 'checkbox'" class="role-workspace__checkbox">
          <input
            type="checkbox"
            :checked="isChecked(field.key)"
            :disabled="field.readonly"
            @change="emit('update-field', field.key, ($event.target as HTMLInputElement).checked ? 'true' : '')"
          >
          <span>{{ field.placeholder || $t('brain.card.enable') }}</span>
        </label>
        <textarea
          v-else-if="field.type === 'textarea'"
          :class="['role-workspace__control', 'role-workspace__control--textarea', field.controlClassName]"
          :value="getValue(field.key)"
          :placeholder="field.placeholder"
          :disabled="field.readonly"
          rows="4"
          @input="emit('update-field', field.key, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <input
          v-else
          :class="['role-workspace__control', field.controlClassName]"
          :value="getValue(field.key)"
          :placeholder="field.placeholder"
          :disabled="field.readonly"
          @input="emit('update-field', field.key, ($event.target as HTMLInputElement).value)"
        >
      </label>
    </form>
    <PhotoCropDialog
      :open="photoCropOpen"
      :source="photoCropSource"
      :title="$t('brain.card.cropAvatarTitle')"
      @cancel="closePhotoCrop"
      @confirm="applyPhotoCrop"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PhotoCropDialog from '../../common/PhotoCropDialog.vue'
import type { ApiPreset } from '../../../types'
import type { CharacterBrainCardFormField } from '../../../types/characterBrain'
import { readImageInputAsDataUrl } from '../../../utils/photoFile'

const props = defineProps<{
  title: string
  fields: CharacterBrainCardFormField[]
  draft: Record<string, unknown>
  apiPresets: ApiPreset[]
  modelOptions: string[]
  showCustomModel: boolean
  modelLoading: boolean
  compact: boolean
}>()

const emit = defineEmits<{
  save: []
  'update-field': [fieldKey: string, value: unknown]
  'load-models': []
}>()

const photoCropOpen = ref(false)
const photoCropSource = ref('')
const photoCropFieldKey = ref('')

function getValue(fieldKey: string) {
  return String(props.draft[fieldKey] ?? '')
}

function isChecked(fieldKey: string) {
  const value = getValue(fieldKey).trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes' || value === 'on'
}

function getCalendarMonthDays(fieldKey: string) {
  const values = getValue(fieldKey)
    .split(/[\s,，;；/]+/u)
    .map((item) => Math.floor(Number(item)))
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0)
  return Array.from({ length: 12 }, (_, index) => values[index] || '')
}

function getCalendarMonthDayValue(fieldKey: string, month: number) {
  return String(getCalendarMonthDays(fieldKey)[month - 1] || '')
}

function updateCalendarMonthDay(fieldKey: string, month: number, rawValue: string) {
  const values = getCalendarMonthDays(fieldKey)
  const parsed = rawValue.trim() ? Math.floor(Number(rawValue)) : 0
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : ''
  values[month - 1] = value
  emit('update-field', fieldKey, values.map((item) => String(item || '').trim()).join(','))
}

function applyGregorianMonthDays(fieldKey: string) {
  emit('update-field', fieldKey, '31,28,31,30,31,30,31,31,30,31,30,31')
}

function clearCalendarMonthDays(fieldKey: string) {
  emit('update-field', fieldKey, '')
}

async function handleAvatarInput(fieldKey: string, event: Event) {
  try {
    const source = await readImageInputAsDataUrl(event)
    if (!source) return
    photoCropFieldKey.value = fieldKey
    photoCropSource.value = source
    photoCropOpen.value = true
  } catch (error) {
    console.error('读取角色头像失败:', error)
  }
}

function closePhotoCrop() {
  photoCropOpen.value = false
  photoCropSource.value = ''
  photoCropFieldKey.value = ''
}

function applyPhotoCrop(dataUrl: string) {
  if (photoCropFieldKey.value) {
    emit('update-field', photoCropFieldKey.value, dataUrl)
  }
  closePhotoCrop()
}
</script>

<style scoped>
.role-workspace__form {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: color-mix(in srgb, var(--morandi-bg) 82%, #ffffff 18%);
}

.role-workspace__form-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 50px;
  padding: 0 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  color: var(--morandi-text);
  font-weight: 700;
}

.role-workspace__form--compact .role-workspace__form-toolbar {
  min-height: 42px;
  padding: 0 18px;
}

.role-workspace__form-body {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 16px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px 24px;
}

.role-workspace__form--compact .role-workspace__form-body {
  align-content: start;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 16px 18px 18px;
}

.role-workspace__field {
  display: flex;
  flex-direction: column;
  align-self: start;
  min-width: 0;
  min-height: 0;
  gap: 8px;
  color: var(--morandi-text-light);
  font-size: 13px;
}

.role-workspace__field > span {
  line-height: 1.35;
}

.role-workspace__field--span-2 {
  grid-column: 1 / -1;
}

.role-workspace__form--compact .role-workspace__field {
  display: grid;
  align-items: center;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 10px;
}

.role-workspace__control {
  width: 100%;
  min-height: 40px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-surface) 90%, var(--morandi-bg) 10%);
  color: var(--morandi-text);
  padding: 9px 12px;
  outline: none;
}

.role-workspace__form--compact .role-workspace__control {
  min-height: 36px;
  padding: 7px 10px;
}

.role-workspace__control--textarea {
  min-height: 160px;
  resize: vertical;
}

.role-workspace__control--detail-textarea {
  min-height: 112px;
}

.role-workspace__control--detail-long-textarea {
  min-height: 148px;
}

.role-workspace__calendar-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.role-workspace__calendar-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.role-workspace__calendar-month {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--morandi-text-light);
  font-size: 12px;
}

.role-workspace__calendar-input {
  min-height: 32px;
  padding: 5px 7px;
}

.role-workspace__calendar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.role-workspace__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  color: var(--morandi-text);
}

.role-workspace__checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--morandi-primary);
}

.role-workspace__save-btn,
.role-workspace__secondary-btn {
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-surface) 92%, #ffffff 8%);
  color: var(--morandi-text);
  cursor: pointer;
  padding: 7px 12px;
}

.role-workspace__secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.role-workspace__model-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.role-workspace__model-picker .role-workspace__control {
  flex: 1 1 220px;
}

.role-workspace__form--compact .role-workspace__model-picker {
  flex-wrap: nowrap;
}

.role-workspace__form--compact .role-workspace__model-picker .role-workspace__control {
  flex-basis: 160px;
}

.role-workspace__avatar-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.role-workspace__form--compact .role-workspace__avatar-picker {
  align-items: center;
}

.role-workspace__avatar-preview {
  display: grid;
  flex: 0 0 76px;
  width: 76px;
  height: 76px;
  overflow: hidden;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-surface) 90%, #ffffff 10%);
  color: var(--morandi-text-light);
}

.role-workspace__form--compact .role-workspace__avatar-preview {
  flex-basis: 56px;
  width: 56px;
  height: 56px;
  border-radius: 8px;
}

.role-workspace__avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.role-workspace__avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
