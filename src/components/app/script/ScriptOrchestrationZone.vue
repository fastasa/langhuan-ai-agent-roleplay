<template>
  <section class="oz" :aria-label="t(`orchestration.zones.${zone}`)">
    <header class="oz__head">
      <div class="oz__head-title">
        <h2>{{ t(`orchestration.zones.${zone}`) }}</h2>
        <span>{{ zoneSubtitle }}</span>
      </div>
      <div v-if="conflicts.length" class="oz__head-conflicts" aria-live="polite">
        <article v-for="(conflict, index) in conflicts" :key="`${conflict.code}-${index}`">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/></svg>
          <div><strong>{{ conflictLabel(conflict.code) }}</strong><span>{{ conflict.message }}</span></div>
        </article>
      </div>
      <button type="button" class="oz__icon" :title="t('orchestration.actions.refresh')" :aria-label="t('orchestration.actions.refresh')" :disabled="busy" @click="emit('refresh')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9m16 6-2 2.5A7 7 0 0 1 5.5 15"/></svg>
      </button>
    </header>

    <div v-if="zone === 'overview'" class="oz__scroll oz__overview">
      <ScriptCurtainSettings
        :draft="curtainDraft"
        :map-sheets="mapSheets"
        :default-map-sheet-id="defaultMapSheetId"
        :busy="busy"
        :dirty="curtainDirty"
        :version="curtain.version"
        @save="saveCurtain"
        @restore="restoreCurtain"
        @open-map="emit('open-map')"
      />

      <div class="oz__summary-grid">
        <button type="button" class="oz__summary" @click="emit('select-zone', 'roles')"><b>{{ presentCount }}</b><span>{{ t('orchestration.overview.presentCount') }}</span></button>
        <button type="button" class="oz__summary" @click="emit('select-zone', 'seeds')"><b>{{ workspace.world.narrativeSeeds.length }}</b><span>{{ t('orchestration.overview.seedCount') }}</span></button>
        <button type="button" class="oz__summary" @click="emit('select-zone', 'roles')"><b>{{ conflicts.length }}</b><span>{{ t('orchestration.overview.pendingCount') }}</span></button>
        <button type="button" class="oz__summary" @click="emit('select-zone', 'statusbar')"><b>{{ director.statusCatalog.length }}</b><span>{{ t('orchestration.overview.statusCount') }}</span></button>
      </div>

      <section class="oz__section">
        <div class="oz__section-head">
          <h3>{{ t('orchestration.overview.sessionConstraint') }}</h3>
          <small>{{ t('orchestration.overview.worldConstraintInherited') }}</small>
        </div>
        <p class="oz__section-hint">{{ t('orchestration.overview.sessionConstraintHint') }}</p>
        <textarea v-model="overrideDraft" class="oz__plain-field" rows="3" :placeholder="t('orchestration.overview.overridePlaceholder')"></textarea>
        <div class="oz__section-foot"><small>v{{ sessionOverride?.version || 0 }}</small><button type="button" class="oz__primary" :disabled="busy || !overrideDirty" @click="saveOverride">{{ t('orchestration.actions.saveOverride') }}</button></div>
      </section>
    </div>

    <div v-else-if="zone === 'roles'" class="oz__scroll">
      <div class="oz__legend"><span><i class="is-present"></i>{{ t('orchestration.presence.present') }}</span><span><i class="is-offstage"></i>{{ t('orchestration.presence.offstage') }}</span><span><i class="is-unknown"></i>{{ t('orchestration.presence.unknown') }}</span></div>
      <article v-for="cast in workspace.castRoster" :key="cast.participantId" class="oz__cast">
        <div class="oz__cast-main">
          <span class="oz__avatar">{{ cast.displayName.slice(0, 1) }}</span>
          <div><strong>{{ cast.displayName }}</strong><small>{{ stateModeLabel(cast.characterStateMode) }}<template v-if="cast.characterBranchId"> · {{ t('orchestration.roles.branchReady') }}</template></small></div>
          <span class="oz__presence" :class="`is-${cast.presence.state}`">{{ presenceLabel(cast.presence.state) }}</span>
        </div>
        <div v-if="cast.pendingTransition" class="oz__proposal">
          <span>{{ t('orchestration.roles.pendingTransition', { state: presenceLabel(cast.pendingTransition.value.toState) }) }}</span>
          <button type="button" :disabled="busy" @click="commitProposal(cast)">{{ t('orchestration.actions.confirmFact') }}</button>
          <button type="button" :disabled="busy" @click="cancelProposal(cast)">{{ t('orchestration.actions.cancelProposal') }}</button>
        </div>
        <div class="oz__cast-foot">
          <span>{{ cast.presence.locationText || t('orchestration.roles.noLocation') }} · v{{ cast.presence.version }}</span>
          <div>
            <button v-if="cast.statusPanelRefs.length" type="button" class="oz__text-action" @click="emit('open-status', cast.participantId)">{{ t('orchestration.actions.openStatus') }}</button>
            <button type="button" :class="{ 'is-selected': cast.presence.state === 'present' }" :disabled="busy || cast.presence.state === 'present'" @click="setPresence(cast, 'present')">{{ t('orchestration.actions.markPresent') }}</button>
            <button type="button" :class="{ 'is-selected': cast.presence.state === 'offstage' }" :disabled="busy || cast.presence.state === 'offstage'" @click="setPresence(cast, 'offstage')">{{ t('orchestration.actions.markOffstage') }}</button>
          </div>
        </div>
      </article>
      <p v-if="!workspace.castRoster.length" class="oz__empty">{{ t('orchestration.roles.empty') }}</p>
    </div>

    <div v-else-if="zone === 'statusbar'" class="oz__scroll">
      <article v-for="panel in workspace.statusPanels" :key="panel.sourceRef" class="oz__status-row" :class="{ 'is-expanded': isStatusExpanded(panel.sourceRef) }">
        <div class="oz__status-meta"><strong>{{ textValue(panel.value.name) || t('orchestration.status.untitled') }}</strong><span>{{ statusHostLabel(panel.value) }} · v{{ panel.version }}</span></div>
        <p class="oz__status-summary">{{ statusValueSummary(panel.value.values) }}</p>
        <div class="oz__status-actions">
          <button type="button" class="oz__status-toggle" :aria-expanded="isStatusExpanded(panel.sourceRef)" @click="toggleStatusPanel(panel.sourceRef)">
            <svg class="line-icon" :class="{ 'is-open': isStatusExpanded(panel.sourceRef) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            {{ isStatusExpanded(panel.sourceRef) ? t('orchestration.actions.collapseStatus') : t('orchestration.actions.expandStatus') }}
          </button>
          <button type="button" class="oz__text-action oz__status-edit" @click="emit('open-status', textValue(panel.value.hostId))">{{ t('orchestration.actions.editInStatus') }}</button>
        </div>
        <dl v-if="isStatusExpanded(panel.sourceRef)" class="oz__status-projection">
          <div v-for="entry in statusValueEntries(panel.value.values)" :key="entry.key">
            <dt>{{ entry.key }}</dt>
            <dd><pre v-if="entry.structured">{{ entry.text }}</pre><span v-else>{{ entry.text }}</span></dd>
          </div>
        </dl>
      </article>
      <p v-if="!workspace.statusPanels.length" class="oz__empty">{{ t('orchestration.status.empty') }}</p>
    </div>

    <div v-else class="oz__scroll oz__timeline">
      <article v-if="workspace.orchestration.lastCommittedScenario" class="oz__timeline-item">
        <time>{{ formatTime(workspace.orchestration.lastCommittedScenario.updatedAt) }}</time><div><strong>{{ t('orchestration.timeline.lastScenario') }} · {{ textValue(workspace.orchestration.lastCommittedScenario.value.scenarioLabel) || textValue(workspace.orchestration.lastCommittedScenario.value.scenarioCode) }}</strong><p>{{ textValue(workspace.orchestration.lastCommittedScenario.value.scenarioSummary) }}</p></div>
      </article>
      <article v-if="workspace.recentRound" class="oz__timeline-item">
        <time>{{ formatTime(workspace.recentRound.updatedAt) }}</time><div><strong>{{ t('orchestration.timeline.recentRound') }}</strong><p>{{ t('orchestration.timeline.messageAnchor', { id: textValue(workspace.recentRound.value.messageId) || '—' }) }}</p></div>
      </article>
      <article v-for="cast in pendingCast" :key="cast.participantId" class="oz__timeline-item is-pending">
        <time>{{ formatTime(cast.pendingTransition?.updatedAt) }}</time><div><strong>{{ t('orchestration.timeline.presenceProposal') }} · {{ cast.displayName }}</strong><p>{{ presenceLabel(cast.presence.state) }} → {{ presenceLabel(cast.pendingTransition?.value.toState || 'unknown') }}</p></div>
      </article>
      <article v-for="entry in workspace.timeline" :key="entry.sourceRef" class="oz__timeline-item">
        <time>{{ formatTime(entry.updatedAt) }}</time><div><strong>{{ timelineKindLabel(entry.value.kind) }} · {{ entry.value.title }}</strong><p>{{ timelineSummary(entry.value.summary) }}</p></div>
      </article>
      <p v-if="!hasTimeline" class="oz__empty">{{ t('orchestration.timeline.empty') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DirectorOrchestrationProjection, OrchestrationCastRosterItem, OrchestrationCommandName, OrchestrationPresenceState, OrchestrationTargetRef, OrchestrationWorkspaceProjection } from '../../../../shared/orchestrationWorkspace'
import ScriptCurtainSettings from './ScriptCurtainSettings.vue'
import { createCurtainSettingsDraft, createCurtainTimeFlowPatch, createRealityCurtainDraft, type CurtainSettingsDraft } from './curtainSettings'

type ZoneKey = 'overview' | 'roles' | 'statusbar' | 'seeds' | 'timeline'
type CommandRequest = { command: OrchestrationCommandName; targetRef: OrchestrationTargetRef; expectedVersion: number; evidenceSummary: string; payload: Record<string, unknown> }
const props = withDefaults(defineProps<{ zone: Exclude<ZoneKey, 'seeds'>; workspace: OrchestrationWorkspaceProjection; director: DirectorOrchestrationProjection; mapSheets?: Array<{id:string;name:string}>; defaultMapSheetId?: string; busy?: boolean }>(), {
  mapSheets: () => [],
  defaultMapSheetId: ''
})
const emit = defineEmits<{ (e:'command', request:CommandRequest):void; (e:'refresh'):void; (e:'open-status', hostId:string):void; (e:'open-map'):void; (e:'select-zone', zone:ZoneKey):void }>()
const { t } = useI18n()
const curtain = computed(() => props.workspace.scene.curtain)
const sessionOverride = computed(() => props.workspace.orchestration.sessionOverride)
const conflicts = computed(() => props.workspace.conflicts)
const presentCount = computed(() => props.workspace.castRoster.filter((item) => item.presence.state === 'present').length)
const pendingCast = computed(() => props.workspace.castRoster.filter((item) => item.pendingTransition))
const hasTimeline = computed(() => Boolean(props.workspace.orchestration.lastCommittedScenario || props.workspace.recentRound || pendingCast.value.length || props.workspace.timeline.length))
const zoneSubtitle = computed(() => t(`orchestration.zoneSubtitles.${props.zone}`))
const curtainDraft = reactive<CurtainSettingsDraft>(createRealityCurtainDraft())
const curtainBaseline = ref('')
const curtainLoadedVersion = ref(-1)
const overrideDraft = ref('')
const overrideBaseline = ref('')
const overrideLoadedVersion = ref(-1)
const expandedStatusPanels = ref<Set<string>>(new Set())
const curtainDirty = computed(() => JSON.stringify(curtainDraft) !== curtainBaseline.value)
const overrideDirty = computed(() => overrideDraft.value !== overrideBaseline.value)
const draftStorageKey = computed(() => `langhuan_orchestration_workspace_draft:${props.workspace.scope.sessionId}`)

function readDraftCache():Record<string,unknown>{
  try { return JSON.parse(sessionStorage.getItem(draftStorageKey.value) || '{}') as Record<string,unknown> } catch { return {} }
}
function writeDraftCache(patch:Record<string,unknown>){
  try { sessionStorage.setItem(draftStorageKey.value,JSON.stringify({...readDraftCache(),...patch})) } catch { /* 草稿持久化失败不阻断正式写入 */ }
}

watch(() => curtain.value, (item) => {
  const cached=readDraftCache()
  if(Number(cached.curtainVersion)===item?.version && cached.curtainDraft && typeof cached.curtainDraft==='object'){
    const value=item?.value || {}
    const baseline=createCurtainSettingsDraft(value)
    Object.assign(curtainDraft,createCurtainSettingsDraft(cached.curtainDraft as Record<string,unknown>))
    curtainBaseline.value=JSON.stringify(baseline)
    curtainLoadedVersion.value=item?.version ?? -1
    return
  }
  if (item?.version === curtainLoadedVersion.value && curtainDirty.value) return
  const value = item?.value || {}
  Object.assign(curtainDraft, createCurtainSettingsDraft(value))
  curtainBaseline.value = JSON.stringify(curtainDraft)
  curtainLoadedVersion.value = item?.version ?? -1
}, { immediate:true })
watch(() => sessionOverride.value, (item) => {
  const version=item?.version ?? 0
  const cached=readDraftCache()
  if(Number(cached.overrideVersion)===version && typeof cached.overrideDraft==='string'){
    overrideDraft.value=cached.overrideDraft; overrideBaseline.value=textValue(item?.value?.content); overrideLoadedVersion.value=version; return
  }
  if(version===overrideLoadedVersion.value && overrideDirty.value) return
  overrideDraft.value=textValue(item?.value?.content); overrideBaseline.value=overrideDraft.value; overrideLoadedVersion.value=version
}, { immediate:true })
watch(curtainDraft,()=>{ if(curtainLoadedVersion.value>=0 && curtainDirty.value) writeDraftCache({curtainVersion:curtainLoadedVersion.value,curtainDraft:{...curtainDraft}}) },{deep:true})
watch(overrideDraft,()=>{ if(overrideLoadedVersion.value>=0 && overrideDirty.value) writeDraftCache({overrideVersion:overrideLoadedVersion.value,overrideDraft:overrideDraft.value}) })

function textValue(value:unknown){ return String(value ?? '').trim() }
function presenceLabel(state:OrchestrationPresenceState){ return t(`orchestration.presence.${state}`) }
function stateModeLabel(mode:string){ return t(`orchestration.stateMode.${mode}`) }
function conflictLabel(code:string){ return t(`orchestration.conflicts.${code}`) }
function timelineKindLabel(kind:string){ return t(`orchestration.timelineKinds.${kind}`) }
function timelineSummary(value:string){ return value.replace(/\bunknown\b/g,presenceLabel('unknown')).replace(/\bpresent\b/g,presenceLabel('present')).replace(/\boffstage\b/g,presenceLabel('offstage')) }
function formatTime(value:unknown){ const date=new Date(textValue(value)); return Number.isNaN(date.getTime()) ? textValue(value) : date.toLocaleString() }
function statusHostLabel(value:Record<string,unknown>){ const host=textValue(value.hostType); return host === 'session_character' ? t('orchestration.status.characterHost') : host === 'world_entity' ? t('orchestration.status.worldHost') : t('orchestration.status.sessionHost') }
function inlineStatusValue(value:unknown){
  if(value === null || value === undefined) return ''
  if(typeof value === 'string') return value
  if(typeof value === 'number' || typeof value === 'boolean') return String(value)
  try { return JSON.stringify(value) } catch { return String(value) }
}
function statusValueSummary(value:unknown){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return t('orchestration.status.noValues')
  const entries=Object.entries(value as Record<string,unknown>)
  return entries.length ? entries.map(([key,item])=>`${key}: ${inlineStatusValue(item)}`).join(' · ') : t('orchestration.status.noValues')
}
function statusValueEntries(value:unknown){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string,unknown>).map(([key,item])=>{
    const structured=Boolean(item && typeof item === 'object')
    let rendered=''
    if(structured){ try { rendered=JSON.stringify(item,null,2) } catch { rendered=String(item) } }
    else rendered=inlineStatusValue(item)
    return {key,text:rendered,structured}
  })
}
function isStatusExpanded(sourceRef:string){ return expandedStatusPanels.value.has(sourceRef) }
function toggleStatusPanel(sourceRef:string){
  const next=new Set(expandedStatusPanels.value)
  if(next.has(sourceRef)) next.delete(sourceRef)
  else next.add(sourceRef)
  expandedStatusPanels.value=next
}
function command(request:CommandRequest){ emit('command',request) }
function restoreCurtain(){ Object.assign(curtainDraft,createRealityCurtainDraft()) }
function saveCurtain(){ command({ command:'updateCurtainScene', targetRef:{kind:'curtain',sessionId:props.workspace.scope.sessionId}, expectedVersion:curtain.value.version, evidenceSummary:t('orchestration.evidence.sceneManual'), payload:{ virtualSceneName:curtainDraft.sceneName, virtualSceneDesc:curtainDraft.sceneDescription, virtualSceneWorldId:props.workspace.scope.worldId, virtualLocationSheetId:curtainDraft.locationSheetId, virtualLocationFeatureId:curtainDraft.mapFeatureId, ...createCurtainTimeFlowPatch(curtainDraft.time,curtainDraft.timeRate), virtualWeather:curtainDraft.weatherMode === 'custom' ? curtainDraft.weather : '', virtualWeatherMode:curtainDraft.weatherMode, virtualRealLocation:curtainDraft.realLocation, virtualLocationLarge:curtainDraft.locationLarge, virtualLocationMiddle:curtainDraft.locationMiddle, virtualLocationSmall:curtainDraft.locationSmall, virtualLocation:[curtainDraft.locationLarge,curtainDraft.locationMiddle,curtainDraft.locationSmall].filter(Boolean).join(' / ') } }) }
function saveOverride(){ command({ command:'saveSessionNarrativeOverride', targetRef:{kind:'session_narrative_override',sessionId:props.workspace.scope.sessionId}, expectedVersion:sessionOverride.value?.version || 0, evidenceSummary:t('orchestration.evidence.overrideManual'), payload:{content:overrideDraft.value,source:'user_manual'} }) }
function setPresence(cast:OrchestrationCastRosterItem,toState:'present'|'offstage'){ command({ command:'setCharacterPresence', targetRef:{kind:'session_character',participantId:cast.participantId}, expectedVersion:cast.presence.version, evidenceSummary:t('orchestration.evidence.presenceManual',{name:cast.displayName,state:presenceLabel(toState)}), payload:{toState,lastModifiedSource:'user_manual',locationText:cast.presence.locationText || ''} }) }
function commitProposal(cast:OrchestrationCastRosterItem){ const proposal=cast.pendingTransition; if(!proposal)return; command({command:'commitPresenceTransition',targetRef:{kind:'session_character',participantId:cast.participantId},expectedVersion:cast.presence.version,evidenceSummary:t('orchestration.evidence.proposalCommitted',{name:cast.displayName}),payload:{proposalEventId:proposal.value.eventId,toState:proposal.value.toState,lastModifiedSource:'user_manual'}}) }
function cancelProposal(cast:OrchestrationCastRosterItem){ const proposal=cast.pendingTransition; if(!proposal)return; command({command:'cancelPresenceTransition',targetRef:{kind:'session_character',participantId:cast.participantId},expectedVersion:cast.presence.version,evidenceSummary:t('orchestration.evidence.proposalCancelled',{name:cast.displayName}),payload:{proposalEventId:proposal.value.eventId}}) }
</script>

<style scoped>
.oz{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;background:var(--morandi-bg)}
.oz__head{display:flex;align-items:center;gap:12px;min-height:54px;padding:0 20px;border-bottom:1px solid var(--morandi-border);background:var(--morandi-card)}
.oz__head-title{display:grid;gap:2px;min-width:180px;flex:none}.oz__head h2{margin:0;font-size:15px}.oz__head-title>span{color:var(--morandi-text-light);font-size:11px}
.oz__head-conflicts{display:flex;min-width:0;flex:1;justify-content:flex-end;gap:10px}.oz__head-conflicts article{display:flex;min-width:0;max-width:520px;align-items:center;gap:8px;color:var(--morandi-warning)}.oz__head-conflicts svg{width:15px;height:15px;flex:none}.oz__head-conflicts article>div{display:grid;min-width:0;gap:1px}.oz__head-conflicts strong{color:var(--morandi-text);font-size:11px}.oz__head-conflicts span{overflow:hidden;color:var(--morandi-text-light);font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}
.oz__icon{display:grid;place-items:center;width:30px;height:30px;margin-left:auto;border:0;border-radius:7px;background:transparent;color:var(--morandi-text-light);cursor:pointer}.oz__icon:hover{background:var(--morandi-soft-bg);color:var(--morandi-text)}.oz__icon svg{width:16px;height:16px}
.oz__scroll{flex:1;min-height:0;overflow:auto;padding:18px 20px}.oz__overview{display:grid;align-content:start;gap:14px}
.oz__section{padding:16px 0;border-top:1px solid var(--morandi-border)}.oz__scroll>.oz__section:first-child{padding-top:0;border-top:0}.oz__section h3{margin:0 0 10px;font-size:13px}.oz__section-head,.oz__section-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.oz__section-foot{margin-top:10px}.oz__section-foot small{color:var(--morandi-text-light);font-size:10px}
.oz__section-head h3{margin-bottom:0}.oz__section-head small,.oz__section-hint{color:var(--morandi-text-light);font-size:10.5px}.oz__section-hint{margin:6px 0 10px;line-height:1.5}
.oz__plain-field{display:block;box-sizing:border-box;width:100%;min-width:0;margin:-2px -4px;padding:3px 6px;border:1px solid var(--morandi-border);border-radius:6px;background:transparent;color:var(--morandi-text);font-family:inherit;font-size:12px;line-height:1.45;transition:background .15s ease,border-color .15s ease}.oz__plain-field:hover{background:var(--morandi-soft-bg)}.oz__plain-field:focus{border-color:var(--morandi-accent);background:var(--morandi-card);outline:none}input.oz__plain-field,select.oz__plain-field{min-height:28px}textarea.oz__plain-field{resize:vertical}select.oz__plain-field{appearance:none;-webkit-appearance:none;cursor:pointer}
.oz__primary{min-height:30px;padding:0 12px;border:1px solid #66806a;border-radius:7px;background:#647d68;color:#fff;cursor:pointer}.oz__primary:disabled,button:disabled{opacity:.45;cursor:not-allowed}
.oz__text-action{border:0;background:transparent;color:var(--morandi-accent);font:inherit;font-size:11.5px;cursor:pointer}.oz__text-action:hover{text-decoration:underline}
.oz__summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--morandi-border);border-bottom:1px solid var(--morandi-border)}.oz__summary{display:grid;gap:2px;padding:12px;border:0;border-right:1px solid var(--morandi-border);background:transparent;color:inherit;text-align:left;cursor:pointer}.oz__summary:last-child{border-right:0}.oz__summary:hover{background:var(--morandi-soft-bg)}.oz__summary b{font-size:18px}.oz__summary span{font-size:10.5px;color:var(--morandi-text-light)}
.oz__legend{display:flex;gap:14px;margin-bottom:10px;color:var(--morandi-text-light);font-size:10.5px}.oz__legend span{display:flex;align-items:center;gap:5px}.oz__legend i{width:6px;height:6px;border-radius:50%}.is-present{background:var(--morandi-accent)}.is-offstage{background:var(--morandi-text-light)}.is-unknown{background:var(--morandi-warning)}
.oz__cast{padding:12px 0;border-bottom:1px solid var(--morandi-border)}.oz__cast-main{display:flex;align-items:center;gap:9px}.oz__avatar{display:grid;place-items:center;width:30px;height:30px;flex:none;border:1px solid var(--morandi-border);border-radius:50%;background:var(--morandi-soft-bg);font-size:12px}.oz__cast-main>div{display:grid;gap:2px;min-width:0}.oz__cast-main strong{font-size:13px}.oz__cast-main small,.oz__cast-foot>span{color:var(--morandi-text-light);font-size:10.5px}.oz__presence{margin-left:auto;padding:2px 7px;border:1px solid var(--morandi-border);border-radius:99px;font-size:10px}.oz__presence.is-present{color:var(--morandi-accent)}.oz__presence.is-unknown{color:var(--morandi-warning)}.oz__cast-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;padding-left:39px}.oz__cast-foot>div{display:flex;gap:5px}.oz__cast-foot button,.oz__proposal button,.oz__material-row>button{min-height:26px;padding:0 8px;border:1px solid var(--morandi-border);border-radius:6px;background:transparent;color:var(--morandi-text-light);font:inherit;font-size:10.5px;cursor:pointer}.oz__cast-foot button:hover,.oz__proposal button:hover,.oz__material-row>button:hover{background:var(--morandi-soft-bg);color:var(--morandi-text)}.oz__proposal{display:flex;align-items:center;gap:6px;margin:8px 0 0 39px;padding:7px 9px;border-left:2px solid var(--morandi-warning);background:var(--morandi-soft-bg);font-size:10.5px}.oz__proposal span{flex:1}.oz__cast-foot button.is-selected{color:var(--morandi-accent)}
.oz__status-row{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(0,1fr) auto;align-items:start;gap:8px 14px;padding:11px 0;border-bottom:1px solid var(--morandi-border)}.oz__status-meta{display:grid;gap:2px}.oz__status-row strong{font-size:12.5px}.oz__status-row span,.oz__status-row p{color:var(--morandi-text-light);font-size:10.5px}.oz__status-summary{min-width:0;margin:0;overflow:hidden;line-height:1.55;text-overflow:ellipsis;white-space:nowrap}.oz__status-row.is-expanded .oz__status-summary{display:none}.oz__status-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;white-space:nowrap}.oz__status-toggle{display:inline-flex;align-items:center;gap:3px;padding:0;border:0;background:transparent;color:var(--morandi-text-light);font:inherit;font-size:11px;cursor:pointer}.oz__status-toggle:hover{color:var(--morandi-text)}.oz__status-toggle svg{width:14px;height:14px;transition:transform .18s ease}.oz__status-toggle svg.is-open{transform:rotate(90deg)}.oz__status-projection{display:grid;grid-column:1/-1;gap:0;margin:4px 0 0;padding:8px 0 0;border-top:1px solid var(--morandi-border)}.oz__status-projection>div{display:grid;grid-template-columns:minmax(110px,.22fr) minmax(0,1fr);gap:12px;padding:7px 0;border-bottom:1px solid color-mix(in srgb,var(--morandi-border) 65%,transparent)}.oz__status-projection>div:last-child{border-bottom:0}.oz__status-projection dt{color:var(--morandi-text-light);font-size:10.5px}.oz__status-projection dd{min-width:0;margin:0;color:var(--morandi-text);font-size:11px;line-height:1.55;overflow-wrap:anywhere;white-space:pre-wrap}.oz__status-projection pre{margin:0;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
.oz__material-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--morandi-border)}.oz__material-row>div{display:grid;gap:3px;flex:1;min-width:0}.oz__material-row strong{font-size:12px}.oz__material-row span{color:var(--morandi-text-light);font-size:10.5px}.oz__create-row{display:grid;grid-template-columns:1.2fr 1fr 90px auto;gap:7px;margin-top:10px}.oz__create-row--directive{grid-template-columns:1fr 90px auto}
.oz__timeline-item{display:grid;grid-template-columns:145px minmax(0,1fr);gap:14px;padding:11px 0;border-bottom:1px solid var(--morandi-border)}.oz__timeline-item time{color:var(--morandi-text-light);font-size:10.5px}.oz__timeline-item div{display:grid;gap:3px}.oz__timeline-item strong{font-size:12px}.oz__timeline-item p{margin:0;color:var(--morandi-text-light);font-size:11px;line-height:1.45}.oz__timeline-item.is-pending{border-left:2px solid var(--morandi-warning);padding-left:9px}
.oz__empty{padding:32px;text-align:center;color:var(--morandi-text-light);font-size:12px}
@media(max-width:900px){.oz__head{align-items:flex-start;min-height:54px;padding-top:9px;padding-bottom:9px}.oz__head-title{min-width:150px}.oz__head-conflicts article{align-items:flex-start}.oz__head-conflicts span{white-space:normal}.oz__summary-grid{grid-template-columns:1fr 1fr}.oz__summary:nth-child(2){border-right:0}.oz__summary:nth-child(-n+2){border-bottom:1px solid var(--morandi-border)}.oz__status-row{grid-template-columns:1fr auto}.oz__status-summary{grid-column:1/-1;grid-row:2}.oz__create-row,.oz__create-row--directive{grid-template-columns:1fr 90px auto}.oz__create-row input:nth-child(2){grid-column:1/-1;grid-row:2}.oz__cast-foot{align-items:flex-start;flex-direction:column}.oz__timeline-item{grid-template-columns:1fr;gap:4px}}
@media(max-width:620px){.oz__head{flex-wrap:wrap;padding:9px 12px}.oz__head-title{min-width:0;flex:1}.oz__head-conflicts{order:3;flex-basis:100%;justify-content:flex-start}.oz__scroll{padding:14px 12px}.oz__cast-foot{padding-left:0}.oz__proposal{margin-left:0}.oz__status-row{grid-template-columns:1fr}.oz__status-actions{justify-content:flex-start}.oz__status-summary{grid-column:auto;grid-row:auto}.oz__status-projection>div{grid-template-columns:1fr;gap:3px}.oz__create-row,.oz__create-row--directive{grid-template-columns:1fr}.oz__create-row input:nth-child(2){grid-column:auto;grid-row:auto}}
</style>
