export const orchestration = {
  zones: { overview:'Overview',roles:'Cast & Presence',statusbar:'Status',seeds:'Narrative Seeds',timeline:'Timeline' },
  zoneSubtitles: { overview:'Scene and narrative constraints for this session',roles:'Session cast, branch mounts, and confirmed presence',statusbar:'Shared status view for characters and world entities',timeline:'Recent scenario, round artifacts, and formal changes' },
  actions: { refresh:'Refresh',openMap:'Open map',saveScene:'Save scene',saveOverride:'Save constraint',openStatus:'View status',editInStatus:'Edit in Status',expandStatus:'Expand',collapseStatus:'Collapse',markPresent:'Mark present',markOffstage:'Mark offstage',confirmFact:'Confirm',cancelProposal:'Cancel plan' },
  fields: { sceneName:'Scene',time:'Time',weather:'Weather',largeLocation:'Region',middleLocation:'Area',smallLocation:'Place',sceneDescription:'Description' },
  overview: { scene:'Current curtain',presentCount:'Present',seedCount:'Active seeds',pendingCount:'Pending review',statusCount:'Status panels',sessionConstraint:'Session narrative constraint',worldConstraintInherited:'Inherits world constraint',sessionConstraintHint:'Constrains narration, progression, and content boundaries for this session without changing the world.',overridePlaceholder:'Applies only to this session. Leave empty to inherit the world constraint.' },
  curtain: {
    mapSheet:'World map sheet',followDefault:'Follow default ({name})',defaultMapSheet:'Default sheet',
    realLocation:'Real location',virtualTime:'Virtual time',quickTime:'Quick time',timeRate:'Time rate',virtualWeather:'Virtual weather',weatherDescription:'Weather description',
    now:'Now',clear:'Clear',followRealWeather:'Follow real weather',customWeather:'Custom weather',restoreReality:'Restore reality',save:'Save',
    largeLocationPlaceholder:'e.g. Tokyo',middleLocationPlaceholder:'e.g. Shinjuku',smallLocationPlaceholder:'e.g. Station',realLocationPlaceholder:'e.g. Linping',weatherPlaceholder:'e.g. Light rain'
  },
  presence: { present:'Present',offstage:'Offstage',unknown:'Unconfirmed' },
  stateMode: { follow_main:'Follows main character',independent_snapshot:'Independent session snapshot' },
  roles: { branchReady:'Private branch mounted',pendingTransition:'Planned as “{state}”; not yet a fact',noLocation:'No location recorded',empty:'This session has no character members.' },
  status: { untitled:'Untitled status',characterHost:'Session character',worldHost:'World entity',sessionHost:'Session',noValues:'No status values',structuredValue:'Structured value',empty:'No status panels exist for this session or world.' },
  timeline: { lastScenario:'Latest scenario',recentRound:'Latest round artifact',messageAnchor:'Message {id}',presenceProposal:'Pending presence',seedUpdated:'Seed updated',empty:'No orchestration changes to show yet.' },
  timelineKinds: { message:'Actual message',presence_fact:'Presence fact',seed_fact:'Seed fact',status_update:'Status update' },
  conflicts: { stale_version:'Version changed',unresolved_legacy_host:'Legacy host needs review',missing_branch:'Private branch missing',unknown_presence:'Presence unconfirmed' },
  evidence: { sceneManual:'User edited the curtain in the Script workspace',overrideManual:'User edited the session narrative constraint in the Script workspace',presenceManual:'User marked {name} as {state} in the Script workspace',proposalCommitted:'User confirmed the planned presence change for {name}',proposalCancelled:'User cancelled the planned presence change for {name}' }
}
