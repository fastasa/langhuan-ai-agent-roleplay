<template>
  <section class="curtain-editor">
    <div class="curtain-editor__head">
      <h3>{{ t('orchestration.overview.scene') }}</h3>
      <button type="button" class="curtain-editor__text-action" @click="emit('open-map')">{{ t('orchestration.actions.openMap') }}</button>
    </div>

    <div class="curtain-editor__grid">
      <label v-if="mapSheets.length" class="curtain-editor__field curtain-editor__field--wide">
        <span>{{ t('orchestration.curtain.mapSheet') }}</span>
        <select v-model="draft.locationSheetId" class="curtain-editor__control">
          <option value="">{{ t('orchestration.curtain.followDefault', { name: defaultMapSheetName }) }}</option>
          <option v-for="sheet in mapSheets" :key="sheet.id" :value="sheet.id">{{ sheet.name || sheet.id }}</option>
        </select>
      </label>

      <label class="curtain-editor__field">
        <span>{{ t('orchestration.fields.largeLocation') }}</span>
        <input v-model="draft.locationLarge" class="curtain-editor__control" :placeholder="t('orchestration.curtain.largeLocationPlaceholder')">
      </label>
      <label class="curtain-editor__field">
        <span>{{ t('orchestration.fields.middleLocation') }}</span>
        <input v-model="draft.locationMiddle" class="curtain-editor__control" :placeholder="t('orchestration.curtain.middleLocationPlaceholder')">
      </label>
      <label class="curtain-editor__field">
        <span>{{ t('orchestration.fields.smallLocation') }}</span>
        <input v-model="draft.locationSmall" class="curtain-editor__control" :placeholder="t('orchestration.curtain.smallLocationPlaceholder')">
      </label>
      <label class="curtain-editor__field">
        <span>{{ t('orchestration.curtain.realLocation') }}</span>
        <input v-model="draft.realLocation" class="curtain-editor__control" :placeholder="t('orchestration.curtain.realLocationPlaceholder')">
      </label>
      <label class="curtain-editor__field">
        <span>{{ t('orchestration.curtain.virtualTime') }}</span>
        <input v-model="draft.time" class="curtain-editor__control" type="datetime-local" step="1">
      </label>
      <div class="curtain-editor__field">
        <span>{{ t('orchestration.curtain.quickTime') }}</span>
        <div class="curtain-editor__shortcuts">
          <button type="button" :disabled="busy" @click="setTimeToNow">{{ t('orchestration.curtain.now') }}</button>
          <button type="button" :disabled="busy" @click="clearTime">{{ t('orchestration.curtain.clear') }}</button>
        </div>
      </div>
      <label class="curtain-editor__field">
        <span>{{ t('orchestration.curtain.timeRate') }}</span>
        <div class="curtain-editor__rate">
          <button type="button" :class="{ 'is-active': draft.timeRate === 0 }" :disabled="busy" @click="draft.timeRate = 0">0x</button>
          <button type="button" :class="{ 'is-active': draft.timeRate === 1 }" :disabled="busy" @click="draft.timeRate = 1">1x</button>
          <input v-model.number="draft.timeRate" class="curtain-editor__control" type="number" min="0" max="60" step="0.1">
        </div>
      </label>
      <label class="curtain-editor__field">
        <span>{{ t('orchestration.curtain.virtualWeather') }}</span>
        <select v-model="draft.weatherMode" class="curtain-editor__control">
          <option value="real">{{ t('orchestration.curtain.followRealWeather') }}</option>
          <option value="custom">{{ t('orchestration.curtain.customWeather') }}</option>
        </select>
      </label>
      <label v-if="draft.weatherMode === 'custom'" class="curtain-editor__field">
        <span>{{ t('orchestration.curtain.weatherDescription') }}</span>
        <input v-model="draft.weather" class="curtain-editor__control" :placeholder="t('orchestration.curtain.weatherPlaceholder')">
      </label>
    </div>

    <div class="curtain-editor__foot">
      <button type="button" class="curtain-editor__restore" :disabled="busy" @click="emit('restore')">{{ t('orchestration.curtain.restoreReality') }}</button>
      <small>v{{ version }}</small>
      <button type="button" class="curtain-editor__save" :disabled="busy || !dirty" @click="emit('save')">{{ t('orchestration.curtain.save') }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatLocalCurtainTime, type CurtainSettingsDraft } from './curtainSettings'

const props = defineProps<{
  draft: CurtainSettingsDraft
  mapSheets: Array<{ id: string; name: string }>
  defaultMapSheetId: string
  busy?: boolean
  dirty: boolean
  version: number
}>()
const emit = defineEmits<{ (event: 'save'): void; (event: 'restore'): void; (event: 'open-map'): void }>()
const { t } = useI18n()

const defaultMapSheetName = computed(() => props.mapSheets.find((sheet) => sheet.id === props.defaultMapSheetId)?.name || t('orchestration.curtain.defaultMapSheet'))

function setTimeToNow() {
  props.draft.time = formatLocalCurtainTime(new Date())
}

function clearTime() {
  props.draft.time = ''
  props.draft.timeRate = 1
}
</script>

<style scoped>
.curtain-editor{padding:0 0 10px;border-bottom:1px solid var(--morandi-border)}
.curtain-editor__head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.curtain-editor__head h3{margin:0;font-size:13px}
.curtain-editor__text-action{border:0;background:transparent;color:var(--morandi-accent);font:inherit;font-size:11.5px;cursor:pointer}
.curtain-editor__text-action:hover{text-decoration:underline}
.curtain-editor__grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 14px}
.curtain-editor__field{display:grid;align-content:start;gap:3px;min-width:0}
.curtain-editor__field>span{color:var(--morandi-text-light);font-size:10.5px}
.curtain-editor__field--wide{grid-column:1/-1}
.curtain-editor__control{display:block;box-sizing:border-box;width:100%;min-width:0;padding:2px 6px;border:1px solid var(--morandi-border);border-radius:6px;background:transparent;color:var(--morandi-text);font-family:inherit;font-size:12px;line-height:1.4;transition:background .15s ease,border-color .15s ease}
input.curtain-editor__control,select.curtain-editor__control{min-height:28px}
.curtain-editor__control:hover{background:var(--morandi-soft-bg)}
.curtain-editor__control:focus{border-color:var(--morandi-accent);background:var(--morandi-card);outline:none}
select.curtain-editor__control{appearance:none;-webkit-appearance:none;cursor:pointer}
.curtain-editor__shortcuts{display:flex;flex-wrap:wrap;gap:6px}
.curtain-editor__shortcuts button,.curtain-editor__rate button,.curtain-editor__restore{min-height:28px;padding:0 8px;border:1px solid var(--morandi-border);border-radius:6px;background:transparent;color:var(--morandi-text);font:inherit;font-size:12px;cursor:pointer}
.curtain-editor__shortcuts button:hover,.curtain-editor__rate button:hover,.curtain-editor__restore:hover{background:var(--morandi-soft-bg)}
.curtain-editor__rate{display:grid;grid-template-columns:38px 38px minmax(0,1fr);gap:5px}
.curtain-editor__rate button.is-active{border-color:var(--morandi-accent);color:var(--morandi-accent)}
.curtain-editor__foot{display:flex;align-items:center;gap:8px;margin-top:10px}
.curtain-editor__foot small{margin-left:auto;color:var(--morandi-text-light);font-size:10px}
.curtain-editor__save{min-height:28px;padding:0 11px;border:1px solid #66806a;border-radius:7px;background:#647d68;color:#fff;font:inherit;font-size:12px;cursor:pointer}
.curtain-editor button:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:1180px){.curtain-editor__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.curtain-editor__grid{grid-template-columns:1fr}.curtain-editor__field--wide{grid-column:auto}.curtain-editor__foot{flex-wrap:wrap}.curtain-editor__foot small{margin-left:0}.curtain-editor__save{margin-left:auto}}
</style>
