import { computed, reactive, ref } from 'vue'
import { getChatStoreCurrentSession, getChatStoreLoadedSummaryRecords } from '../../repositories/chatRepository'
import type { PlannedGroupSpeakerViewModel } from '../../types/panelContracts'
import { useTreeExpandPersistence } from '../useTreeExpandPersistence'

const CONTACT_GROUP_EXPAND_STORAGE_KEY = 'langhuan_sidebar_expanded_contact_groups_v1'

export function useAppShellSupport({ chatStore }: any) {
  const sidebarOpen = ref(false)
  // collapsedGroups 只记录"显式展开"的分组（值为 false）；未记录的分组一律按默认折叠处理，见 toggleGroupCollapse。
  const { loadExpandedIds } = useTreeExpandPersistence(CONTACT_GROUP_EXPAND_STORAGE_KEY)
  const collapsedGroups = reactive<Record<string, boolean>>({})
  loadExpandedIds().forEach((groupId) => { collapsedGroups[groupId] = false })
  const sections = reactive({
    tasks: false,
    timers: false,
    tickets: false,
    localArchiveSync: false,
    apiConfig: false,
    weatherApi: false,
    presetManager: false,
    history: false,
    dataManage: false
  })
  const streamingText = ref('')
  const currentStreamingSpeakerName = ref('')
  const currentStreamingTargetId = ref('')
  const environmentNarrationLoading = ref(false)
  const plannedGroupSpeakers = ref<PlannedGroupSpeakerViewModel[]>([])
  const transactionExecuting = ref(false)
  const editingCharacter = ref<any | null>(null)

  function editCharacter(char: any) {
    if (!char?.id) return
    editingCharacter.value = char
  }

  function resetEditingCharacter() {
    editingCharacter.value = null
  }

  const getCurrentSession = () => (
    getChatStoreCurrentSession(chatStore)
  )

  const loadedSummaryItems = computed(() => {
    const currentSession = getCurrentSession()
    return getChatStoreLoadedSummaryRecords(chatStore, currentSession).map((item) => ({
      id: item.id,
      name: item.name,
      content: item.content,
      kind: item.kind
    }))
  })

  return {
    sidebarOpen,
    collapsedGroups,
    sections,
    streamingText,
    currentStreamingSpeakerName,
    currentStreamingTargetId,
    environmentNarrationLoading,
    plannedGroupSpeakers,
    transactionExecuting,
    editingCharacter,
    editCharacter,
    resetEditingCharacter,
    loadedSummaryItems
  }
}
