import { ref, reactive, computed } from 'vue'
import { useStickToBottom } from '../useStickToBottom'

export function useAppState({ localArchiveSync }: any) {
  const showAddTicket = ref(false)
  const showEditTicket = ref(false)
  const showSpendMoney = ref(false)
  const showBatchExchange = ref(false)
  const showBatchUse = ref(false)
  const showCategoryEditor = ref(false)
  const categoryEditList = ref([])
  const newCategoryName = ref('')

  const showConfirmDialog = ref(false)
  const confirmDialog = reactive({
    title: '',
    message: '',
    confirmText: '确认',
    size: 'sm',
    heightPreset: 'default',
    onConfirm: null
  })
  const showClearChatContextDialog = ref(false)
  const clearChatContextDialog = reactive({
    clearSessionTemporaryCharacters: false,
    onConfirm: null as null | ((options: {
      clearSessionTemporaryCharacters: boolean
    }) => void)
  })
  const showPromptDialog = ref(false)
  const promptDialog = reactive({
    title: '',
    message: '',
    inputLabel: '',
    placeholder: '',
    confirmText: '确认',
    value: '',
    onConfirm: null as null | ((value: string) => void),
    validator: null as null | ((value: string) => string)
  })
  const showChatTransferDialog = ref(false)
  const chatTransferDialog = reactive({
    title: '',
    sourceTarget: '',
    toSingle: false,
    candidates: [] as Array<{ id: string; name: string }>,
    input: '',
    targetId: '',
    loading: false,
    onConfirm: null as null | (() => void)
  })
  const showAddPointsModal = ref(false)
  const showSettingModal = ref(false)
  const showUserEditor = ref(false)
  const showAddCharacter = ref(false)
  const showCharacterEditor = ref(false)
  const showCurtainPanel = ref(false)
  const curtainFocusMessageId = ref(0)
  const showPromptLogPanel = ref(false)
  const promptLogFocusMessageId = ref(0)
  const chatSummaryWriting = ref(false)
  const chatSummaryWritingText = ref('')
  const showSessionTemporaryCharactersPanel = ref(false)
  const showSceneEditor = ref(false)
  const showAliasEditor = ref(false)
  const showAliasSelector = ref(false)
  const showCharGroupManager = ref(false)
  const showCrowdEditor = ref(false)
  const showCreateGroup = ref(false)
  const showGroupEditor = ref(false)
  const showAddApiPreset = ref(false)
  const isLoadingModels = ref(false)
  const isTestingApi = ref(false)
  const currentApiPresetIndex = ref(0)
  const autoSyncTime = ref(true)
  const modelList = ref([])
  const showEditApiPreset = ref(false)
  const showPromptPresetEditor = ref(false)
  const showPresetVars = ref(false)
  const presetSceneFilter = ref('')
  const showLocationEdit = ref(false)
  const showWeatherEdit = ref(false)
  const fullscreenImage = ref(null)

  const charEditorTab = ref('details')

  const ticketForm = reactive({ name: '', cost: 0, count: 0, category: '', desc: '', timerMinutes: 0, autoConsumeNext: false })
  const editingTicketId = ref(null)
  const spendAmount = ref(0)
  const spendReason = ref('')
  const batchTicket = ref(null)
  const batchAmount = ref(1)
  const autoConsumeEnabled = ref(false)
  const addPointsAmount = ref(0)

  const userForm = reactive({
    displayName: '', name: '', emoji: '', gender: '', age: 0, desc: '', appearance: '',
    personality: '', outfit: '', hobbies: '', abilities: '', experience: '',
    worldview: '', background: '', avatarPath: ''
  })
  const newCharForm = reactive({
    name: '', emoji: '', gender: '', age: 0, desc: '', appearance: '',
    speakingStyle: '', personality: '', outfit: '', hobbies: '', abilities: '',
    experience: '', worldview: '', background: '', group: '', avatar: '',
    defaultPreset: '', defaultModel: '',
    roleTemperature: '', roleMaxTokens: '', roleThinking: '',
    replyPipelineModeOverride: 'follow_session',
    nicknames: [],
    currentActivities: [],
    locations: [],
    schedule: {},
    yearlySchedule: [],
    relationships: {},
    brainDocuments: {}
  })
  const charEditForm = reactive({
    id: '',
    name: '', emoji: '', gender: '', age: 0, affection: 0, group: '',
    desc: '', appearance: '', speakingStyle: '', outfit: '', personality: '',
    hobbies: '', abilities: '', experience: '', worldview: '', background: '',
    nicknames: [],
    defaultPreset: '', defaultModel: '',
    roleTemperature: '', roleMaxTokens: '', roleThinking: '',
    replyPipelineModeOverride: 'follow_session',
    schedule: null,
    relationships: {},
    yearlySchedule: [],
    currentActivities: [],
    locations: [],
    avatar: ''
  })

  const showDetailSettings = ref(false)
  const showScheduleEditor = ref(false)
  const showRelationshipEditor = ref(false)
  const showYearlyScheduleEditor = ref(false)
  const showActivitiesEditor = ref(false)
  const showLocationsEditor = ref(false)
  const collapsedDays = reactive({})
  const showCopySlotDialog = ref(false)
  const copyingFromDay = ref('')
  const copyingSlot = ref(null)
  const copyTargetDays = ref([])
  const newRelationshipTarget = ref('')
  const newNicknameInput = ref('')
  const newActivityInput = ref('')
  const newLocationInput = ref('')
  const affectionLocked = ref(true)

  const weekDays = [
    { key: 'monday', name: '周一' }, { key: 'tuesday', name: '周二' },
    { key: 'wednesday', name: '周三' }, { key: 'thursday', name: '周四' },
    { key: 'friday', name: '周五' }, { key: 'saturday', name: '周六' },
    { key: 'sunday', name: '周日' }
  ]
  const timeOptions = (() => {
    const opts = []
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    return opts
  })()

  const sceneForm = reactive({
    name: '',
    desc: '',
    location: '',
    locationLarge: '',
    locationMiddle: '',
    locationSmall: '',
    worldId: '',
    worldDefaultMapSheetId: '',
    worldMapSheets: [] as Array<{ id: string; name: string }>,
    locationSheetId: '',
    locationFeatureId: '',
    realLocation: '',
    time: '',
    timeRate: 1,
    weather: '',
    weatherMode: 'real'
  })
  const aliasForm = reactive({
    name: '', emoji: '', gender: '', age: 0, appearance: '',
    personality: '', outfit: '', background: '', desc: '', avatarPath: ''
  })
  const editingAliasId = ref(null)
  const crowdForm = reactive({ name: '', emoji: '', nickname: '', members: [], locations: '', apiPreset: '', groupId: '' })
  const editingCrowdId = ref(null)
  const groupForm = reactive({ name: '', emoji: '', avatarPath: '', members: [], groupId: '' })
  const editingGroupId = ref(null)
  const groupEditForm = reactive({
    mode: 'edit',
    id: null,
    sessionId: '',
    targetId: '',
    name: '',
    emoji: '',
    avatarPath: '',
    members: [],
    groupId: '',
    boundAlias: '',
    narrationFrequency: 'standard',
    narrationTemperature: 'standard',
    narrationProfiles: [],
    narrationForceEnabled: false,
    chatFontScale: 1,
    replyPipelineMode: 'normal_recall',
    expandedPanel: ''
  })
  const charGroupEditForm = reactive({ id: '', name: '', kind: 'char' as 'char' | 'group' | 'crowd', memberIds: [] as string[] })

  const apiPresetForm = reactive({ originalName: '', name: '', providerType: 'openai-compatible', apiUrl: '', apiKey: '', hasApiKey: false, model: '', temperature: undefined as number | undefined, maxTokens: undefined as number | undefined, fallbackPreset: '', maxConcurrency: undefined as number | undefined, minInterval: undefined as number | undefined, supportsVision: false })
  const promptPresetForm = reactive({ name: '', role: 'system', content: '', enabled: true, scene: '', frequency: '' })
  const editingPresetIndex = ref(-1)
  const newGroupName = ref('')
  const newGroupEmoji = ref('')

  const isLoadingLocation = ref(false)
  const isLoadingWeather = ref(false)
  const showWeatherDetail = ref(false)
  const editingLocation = ref(false)
  const tempLocation = ref('')
  const tempLocationLarge = ref('')
  const tempLocationMiddle = ref('')
  const tempLocationSmall = ref('')
  const weatherApiKey = ref('')
  const weatherApiDomain = ref('devapi.qweather.com')

  const currentTicketCategory = ref('全部')
  const localArchiveLabel = ref('')
  const localArchiveNote = ref('')
  const localArchiveAvailable = computed(() => true)
  const localArchiveName = computed(() => '本地工作区')

  const newTaskName = ref('')
  const newTaskReward = ref('')
  const newTaskDesc = ref('')
  const newTaskCategory = ref('')
  const newTaskBonus = ref('')
  const taskAssignerChar = ref('')
  const taskLoadContact = ref('')
  const isRequestingTask = ref(false)
  const currentTaskTab = ref('')
  const expandedTaskId = ref(null)
  const operationDetail = ref(null)
  const customMarkType = ref('')
  const customMarkNote = ref('')
  const taskTimerUpdateInterval = ref(null)
  const customTags = ref([])
  const showTagManager = ref(false)
  const newTagName = ref('')
  const newTagColor = ref('#8b7355')
  const editingTagId = ref(null)
  const eventStack = ref([])
  const eventStackSummary = ref({ totalPoints: 0, totalMoney: 0, ticketChanges: {} })

  const tagColorPresets = [
    '#e53935', '#ef6c00', '#f9a825', '#7cb342', '#2e7d32', '#00897b', '#039be5', '#1e88e5',
    '#3949ab', '#5e35b1', '#8e24aa', '#d81b60', '#c62828', '#6d4c41', '#424242', '#546e7a',
    '#43a047', '#00acc1', '#7e57c2', '#fb8c00', '#8d6e63', '#1565c0', '#2f7d32', '#f4511e'
  ]

  const messagesArea = ref<HTMLElement | null>(null)
  const importFileInput = ref<HTMLInputElement | null>(null)
  function setMessagesAreaRef(el: Element | null) {
    messagesArea.value = el as any
  }
  // 智能跟底滚动（2026-07-12）：主聊天唯一共享 stick 实例，随 useAppState 单例存在——
  // 不开 observeMutations，因为管线在每个流式 chunk 回调里已主动调用 scrollToBottom，
  // 不需要再靠 MutationObserver 被动感知 DOM 变化。ChatMessageStream 与 useChatTargetHelpers
  // 都消费这一份实例，取代原来两套各自为政的散装 isNearBottom/scrollToBottom。
  const chatStickToBottom = useStickToBottom(messagesArea)

  return {
    showAddTicket,
    showEditTicket,
    showSpendMoney,
    showBatchExchange,
    showBatchUse,
    showCategoryEditor,
    categoryEditList,
    newCategoryName,
    showConfirmDialog,
    confirmDialog,
    showClearChatContextDialog,
    clearChatContextDialog,
    showPromptDialog,
    promptDialog,
    showChatTransferDialog,
    chatTransferDialog,
    showAddPointsModal,
    showSettingModal,
    showUserEditor,
    showAddCharacter,
    showCharacterEditor,
    showCurtainPanel,
    curtainFocusMessageId,
    showPromptLogPanel,
    promptLogFocusMessageId,
    chatSummaryWriting,
    chatSummaryWritingText,
    showSessionTemporaryCharactersPanel,
    showSceneEditor,
    showAliasEditor,
    showAliasSelector,
    showCharGroupManager,
    showCrowdEditor,
    showCreateGroup,
    showGroupEditor,
    showAddApiPreset,
    isLoadingModels,
    isTestingApi,
    currentApiPresetIndex,
    autoSyncTime,
    modelList,
    showEditApiPreset,
    showPromptPresetEditor,
    showPresetVars,
    presetSceneFilter,
    showLocationEdit,
    showWeatherEdit,
    fullscreenImage,
    charEditorTab,
    ticketForm,
    editingTicketId,
    spendAmount,
    spendReason,
    batchTicket,
    batchAmount,
    autoConsumeEnabled,
    addPointsAmount,
    userForm,
    newCharForm,
    charEditForm,
    showDetailSettings,
    showScheduleEditor,
    showRelationshipEditor,
    showYearlyScheduleEditor,
    showActivitiesEditor,
    showLocationsEditor,
    collapsedDays,
    showCopySlotDialog,
    copyingFromDay,
    copyingSlot,
    copyTargetDays,
    newRelationshipTarget,
    newNicknameInput,
    newActivityInput,
    newLocationInput,
    affectionLocked,
    weekDays,
    timeOptions,
    sceneForm,
    aliasForm,
    editingAliasId,
    crowdForm,
    editingCrowdId,
    groupForm,
    editingGroupId,
    groupEditForm,
    charGroupEditForm,
    apiPresetForm,
    promptPresetForm,
    editingPresetIndex,
    newGroupName,
    newGroupEmoji,
    isLoadingLocation,
    isLoadingWeather,
    showWeatherDetail,
    editingLocation,
    tempLocation,
    tempLocationLarge,
    tempLocationMiddle,
    tempLocationSmall,
    weatherApiKey,
    weatherApiDomain,
    currentTicketCategory,
    localArchiveLabel,
    localArchiveNote,
    localArchiveAvailable,
    localArchiveName,
    newTaskName,
    newTaskReward,
    newTaskDesc,
    newTaskCategory,
    newTaskBonus,
    taskAssignerChar,
    taskLoadContact,
    isRequestingTask,
    currentTaskTab,
    expandedTaskId,
    operationDetail,
    customMarkType,
    customMarkNote,
    taskTimerUpdateInterval,
    customTags,
    showTagManager,
    newTagName,
    newTagColor,
    editingTagId,
    eventStack,
    eventStackSummary,
    tagColorPresets,
    messagesArea,
    importFileInput,
    setMessagesAreaRef,
    chatStickToBottom
  }
}
