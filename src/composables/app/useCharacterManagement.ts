export function resolveCharacterImportSource(payload: any): { source: Record<string, unknown>; isCompleteExport: boolean } {
  const isCompleteExport = payload?.format === 'langhuan_character_complete_v1'
    && payload?.snapshot?.state
    && typeof payload.snapshot.state === 'object'
  if (!isCompleteExport) return { source: payload || {}, isCompleteExport: false }
  return {
    source: applyCharacterSnapshotState({
      ...(payload.identity && typeof payload.identity === 'object' ? payload.identity : {}),
      ...(payload.configuration && typeof payload.configuration === 'object' ? payload.configuration : {})
    }, payload.snapshot.state),
    isCompleteExport: true
  }
}

export function useCharacterManagement({
  charStore,
  chatStore,
  settingStore,
  currentCharacter,
  showAddCharacter,
  newCharForm,
  charEditForm,
  collapsedDays,
  copyingFromDay,
  copyingSlot,
  copyTargetDays,
  showCopySlotDialog,
  newRelationshipTarget,
  newNicknameInput,
  newActivityInput,
  newLocationInput,
  showCharacterEditor,
  showCurtainPanel,
  curtainFocusMessageId,
  showPromptLogPanel,
  promptLogFocusMessageId,
  showSceneEditor,
  sceneForm,
  showAliasSelector,
  showAliasEditor,
  editingAliasId,
  aliasForm,
  newGroupName,
  newGroupEmoji,
  editingGroupId,
  groupForm,
  groupEditForm,
  showCreateGroup,
  showGroupEditor,
  editingCrowdId,
  crowdForm,
  showCrowdEditor,
  openConfirmDialog,
  openPromptDialog,
  toast
}: any) {
  const padSceneTimePart = (value: number) => String(value).padStart(2, '0')
  const normalizeNarrationFrequency = (value: unknown) => {
    const raw = String(value || '').trim()
    return raw === 'silent' || raw === 'active' ? raw : 'standard'
  }
  const normalizeNarrationTemperature = (value: unknown) => {
    const raw = String(value || '').trim()
    return raw === 'documentary' || raw === 'light' || raw === 'open' || raw === 'bloom' ? raw : 'standard'
  }
  const normalizeChatFontScale = (value: unknown) => {
    const raw = Number(value ?? 1)
    if (!Number.isFinite(raw)) return 1
    return Math.round(Math.min(1.25, Math.max(0.85, raw)) * 100) / 100
  }
  const normalizeNarrationProfilesDraft = (value: unknown) => {
    return sharedNormalizeNarrationProfiles(value, {
      frequency: groupEditForm.narrationFrequency,
      temperature: groupEditForm.narrationTemperature
    })
  }
  const readSessionBooleanFlag = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'

  function getCurrentTargetId() {
    return String(getChatStoreActiveTargetId(chatStore) || '').trim()
  }

  function getCurrentSession() {
    return getChatStoreCurrentSession(chatStore)
  }

  function getCurrentSessionId() {
    return String(getCurrentSession()?.id || '').trim()
  }

  function getScenePatchFromForm() {
    const baseTime = parseSceneInputValue(sceneForm.time || '')
    const hasBaseTime = Number.isFinite(baseTime) && baseTime !== 0
    const locationLarge = trimSceneText(sceneForm.locationLarge)
    const locationMiddle = trimSceneText(sceneForm.locationMiddle)
    const locationSmall = trimSceneText(sceneForm.locationSmall)
    const virtualLocation = composeSceneLocationLabel(locationLarge, locationMiddle, locationSmall, '')
    return {
      virtualSceneName: '',
      virtualSceneDesc: '',
      virtualLocationLarge: locationLarge,
      virtualLocationMiddle: locationMiddle,
      virtualLocationSmall: locationSmall,
      virtualLocation,
      virtualLocationSheetId: String(sceneForm.locationSheetId || '').trim(),
      // 人工改写自由文本地点后不再声称仍精确命中旧地图要素。
      virtualLocationFeatureId: '',
      virtualRealLocation: sceneForm.realLocation || '',
      virtualTime: sceneForm.time || '',
      virtualTimeAnchor: hasBaseTime ? Date.now() : 0,
      virtualTimeBase: baseTime,
      virtualTimeRate: clampSceneTimeRate(Number(sceneForm.timeRate ?? 1)),
      virtualWeather: sceneForm.weather || '',
      virtualWeatherMode: sceneForm.weatherMode || 'real'
    }
  }

  function getCurrentSessionWriteKey() {
    return getCurrentSessionId() || getCurrentTargetId()
  }
  function resolveEditingCharacter() {
    const current = currentCharacter.value
    if (current?.id) return current

    const formId = String(charEditForm?.id || '').trim()
    if (formId) {
      const byId = charStore.getCharacter(formId)
      if (byId) return byId
    }

    const formName = String(charEditForm?.name || '').trim()
    if (formName) {
      const byName = charStore.characters.find((item: any) => item?.name === formName)
      if (byName) return byName
    }

    return null
  }

  function resolveEditingCharacterId() {
    const source = resolveEditingCharacter()
    if (source?.id) return source.id
    return String(charEditForm?.id || '').trim()
  }

  function normalizeMemberProbability(value: unknown) {
    const parsed = Number(value ?? 100)
    return Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, Math.round(parsed)))
      : 100
  }

  function normalizeGroupMember(member: any) {
    const probability = normalizeMemberProbability(member?.probability ?? member?.replyChance ?? member?.chance)
    const rawCharacterId = String(member?.characterId ?? member?.character_id ?? member?.charId ?? member?.char_id ?? member?.id ?? '').trim()
    const rawName = String(member?.name ?? member?.characterName ?? member?.character_name ?? member ?? '').trim()
    const matchedCharacter = charStore.characters.find((item: any) => item.id === rawCharacterId || item.id === rawName || item.name === rawName)
    return {
      characterId: matchedCharacter?.id || rawCharacterId || '',
      probability,
      characterStateMode: String(member?.characterStateMode ?? member?.character_state_mode ?? '') === 'independent_snapshot'
        ? 'independent_snapshot'
        : 'follow_main',
      characterBranchId: String(member?.characterBranchId ?? member?.character_branch_id ?? '').trim(),
      sourceSnapshotId: String(member?.sourceSnapshotId ?? member?.source_snapshot_id ?? '').trim()
    }
  }

  function normalizeGroupMembers(members: any) {
    if (!Array.isArray(members)) return []
    return members
      .map((member: any) => normalizeGroupMember(member))
      .filter((member: any) => member.characterId || Number(member.probability) > 0)
  }

  function clampSceneTimeRate(value: number) {
    if (!Number.isFinite(value)) return 1
    return Math.min(60, Math.max(0, Math.round(value * 10) / 10))
  }

  function trimSceneText(value: unknown) {
    return String(value ?? '').trim()
  }

  function composeSceneLocationLabel(large: unknown, middle: unknown, small: unknown, legacy = '') {
    const largeText = trimSceneText(large)
    const middleText = trimSceneText(middle)
    const smallText = trimSceneText(small)
    const legacyText = trimSceneText(legacy)
    const tail = smallText || (!largeText && !middleText ? legacyText : '')
    const parts = [largeText, middleText, tail].filter(Boolean)
    if (parts.length) return parts.join(' / ')
    return legacyText
  }

  function formatSceneInputValue(timestamp: number) {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return ''
    return `${String(date.getFullYear()).padStart(4, '0')}-${padSceneTimePart(date.getMonth() + 1)}-${padSceneTimePart(date.getDate())}T${padSceneTimePart(date.getHours())}:${padSceneTimePart(date.getMinutes())}:${padSceneTimePart(date.getSeconds())}`
  }

  function parseSceneInputValue(value: string) {
    if (!value) return 0
    const normalized = value.length === 16 ? `${value}:00` : value
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
    const date = new Date(match ? 0 : normalized)
    if (match) {
      date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      date.setHours(Number(match[4]), Number(match[5]), Number(match[6] || 0), 0)
    }
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  function sanitizeSessionTitle(value: unknown) {
    return String(value || '')
      .replace(/[「」『』“”"'`]/g, '')
      .replace(/\s+/g, '')
      .trim()
      .slice(0, 15)
  }

  function buildDefaultSessionTitle(members: any[]) {
    const names = (Array.isArray(members) ? members : [])
      .map((member: any) => {
        const character = findCharacterByIdOrName(String(member?.characterId || ''))
        return sanitizeSessionTitle(character?.name || member?.characterId || '')
      })
      .filter(Boolean)
    if (names.length === 1) return names[0]
    // 人数=角色成员+用户本人（用户 2026-07-10 拍板：用户也是群聊一员）；已存库的旧会话名不回溯。
    if (names.length > 1) return sanitizeSessionTitle(`${names.slice(0, 2).join('、')}${names.length + 1}人`)
    return '新会话'
  }

  function resetGroupEditForm(nextMode = 'edit') {
    groupEditForm.mode = nextMode
    groupEditForm.id = null
    groupEditForm.sessionId = ''
    groupEditForm.targetId = ''
    groupEditForm.name = ''
    groupEditForm.emoji = ''
    groupEditForm.avatarPath = ''
    groupEditForm.members = []
    groupEditForm.groupId = ''
    groupEditForm.boundAlias = ''
    groupEditForm.narrationFrequency = 'standard'
    groupEditForm.narrationTemperature = 'standard'
    groupEditForm.narrationProfiles = normalizeNarrationProfilesDraft([])
    groupEditForm.narrationForceEnabled = false
    groupEditForm.chatFontScale = 1
    groupEditForm.replyPipelineMode = 'normal_recall'
    groupEditForm.expandedPanel = ''
  }

  function fillSceneFormFromSession(session: any) {
    if (session) {
      const scene = getChatSessionVirtualScene(session)
      const virtualBase = Number(scene.virtualTimeBase || 0)
      const virtualAnchor = Number(scene.virtualTimeAnchor || 0)
      const virtualRate = clampSceneTimeRate(Number(scene.virtualTimeRate ?? 1))
      const hasVirtualBase = Number.isFinite(virtualBase) && virtualBase !== 0
      const effectiveVirtualTime = hasVirtualBase
        ? virtualBase + Math.max(0, Date.now() - (virtualAnchor || Date.now())) * virtualRate
        : 0
      sceneForm.name = ''
      sceneForm.desc = ''
      sceneForm.locationLarge = String(scene.virtualLocationLarge || '')
      sceneForm.locationMiddle = String(scene.virtualLocationMiddle || '')
      sceneForm.locationSmall = String(scene.virtualLocationSmall || '')
      sceneForm.worldId = String(scene.worldId || '')
      sceneForm.worldDefaultMapSheetId = String(scene.worldDefaultMapSheetId || '')
      sceneForm.worldMapSheets = Array.isArray(scene.worldMapSheets)
        ? scene.worldMapSheets.map((sheet: any) => ({ id: String(sheet?.id || ''), name: String(sheet?.name || '') })).filter((sheet: any) => sheet.id)
        : []
      sceneForm.locationSheetId = String(scene.virtualLocationSheetId || '')
      sceneForm.locationFeatureId = String(scene.virtualLocationFeatureId || '')
      sceneForm.location = composeSceneLocationLabel(
        scene.virtualLocationLarge,
        scene.virtualLocationMiddle,
        scene.virtualLocationSmall,
        String(scene.virtualLocation || '')
      )
      sceneForm.realLocation = String(scene.virtualRealLocation || '')
      sceneForm.time = hasVirtualBase
        ? formatSceneInputValue(effectiveVirtualTime)
        : String(scene.virtualTime || '')
      sceneForm.timeRate = virtualRate
      sceneForm.weather = String(scene.virtualWeather || '')
      sceneForm.weatherMode = String(scene.virtualWeatherMode || 'real')
      return
    }
    sceneForm.name = ''
    sceneForm.desc = ''
    sceneForm.location = ''
    sceneForm.locationLarge = ''
    sceneForm.locationMiddle = ''
    sceneForm.locationSmall = ''
    sceneForm.worldId = ''
    sceneForm.worldDefaultMapSheetId = ''
    sceneForm.worldMapSheets = []
    sceneForm.locationSheetId = ''
    sceneForm.locationFeatureId = ''
    sceneForm.realLocation = ''
    sceneForm.time = ''
    sceneForm.timeRate = 1
    sceneForm.weather = ''
    sceneForm.weatherMode = 'real'
  }

  function findCharacterByIdOrName(value: string) {
    const normalized = String(value || '').trim()
    if (!normalized) return null
    return charStore.characters.find((item: any) => {
      const id = String(item?.id || '').trim()
      const name = String(item?.name || '').trim()
      return id === normalized || name === normalized
    }) || null
  }

  function firstFilledText(...values: any[]) {
    for (const value of values) {
      const text = String(value ?? '').trim()
      if (text) return text
    }
    return ''
  }

  function normalizeSessionMember(member: any) {
    const rawId = String(
      member?.participantTargetId
      ?? member?.participant_target_id
      ?? member?.characterId
      ?? member?.character_id
      ?? member?.targetId
      ?? member?.target_id
      ?? member?.id
      ?? ''
    ).trim()
    const rawName = String(member?.name ?? member?.displayName ?? member?.characterName ?? member?.character_name ?? '').trim()
    const matched = findCharacterByIdOrName(rawId) || findCharacterByIdOrName(rawName)
    return {
      characterId: matched?.id || rawId,
      probability: normalizeMemberProbability(
        member?.replyProbability
        ?? member?.reply_probability
        ?? member?.probability
      ),
      characterStateMode: String(member?.characterStateMode ?? member?.character_state_mode ?? '') === 'independent_snapshot'
        ? 'independent_snapshot'
        : 'follow_main',
      characterBranchId: String(member?.characterBranchId ?? member?.character_branch_id ?? '').trim(),
      sourceSnapshotId: String(member?.sourceSnapshotId ?? member?.source_snapshot_id ?? '').trim()
    }
  }

  function resolveSessionMembers(session: any, group: any, character: any) {
    if (Array.isArray(session?.participants) && session.participants.length) {
      return session.participants
        .map((item: any) => normalizeSessionMember(item))
        .filter((item: any) => item.characterId)
    }
    if (group?.members) {
      return normalizeGroupMembers(JSON.parse(JSON.stringify(group.members)))
    }
    const characterId = String(character?.id || session?.targetId || session?.target_id || '').trim()
    return characterId ? [{ characterId, probability: 100 }] : []
  }

  function buildCharacterTransferData(source: any) {
    return {
      name: String(source.name || '').trim(),
      emoji: String(source.emoji || '').trim(),
      gender: String(source.gender || '').trim(),
      age: Number(source.age || 0) || 0,
      desc: String(source.desc || '').trim(),
      appearance: String(source.appearance || '').trim(),
      speakingStyle: String(source.speakingStyle || source.speaking_style || '').trim(),
      personality: String(source.personality || '').trim(),
      outfit: String(source.outfit || '').trim(),
      hobbies: String(source.hobbies || '').trim(),
      abilities: String(source.abilities || '').trim(),
      experience: String(source.experience || '').trim(),
      worldview: String(source.worldview || '').trim(),
      background: String(source.background || '').trim(),
      groupId: String(source.groupId || source.group_id || source.group || '').trim(),
      affection: Number(source.affection ?? 50) || 50,
      defaultPreset: String(source.defaultPreset || source.default_preset || '').trim(),
      defaultModel: String(source.defaultModel || source.default_model || '').trim(),
      roleTemperature: source.roleTemperature ?? source.role_temperature ?? '',
      roleMaxTokens: source.roleMaxTokens ?? source.role_max_tokens ?? '',
      roleThinking: source.roleThinking || source.role_thinking || '',
      replyPipelineModeOverride: normalizeCharacterReplyPipelineModeOverride(source.replyPipelineModeOverride ?? source.reply_pipeline_mode_override),
      nicknames: Array.isArray(source.nicknames) ? source.nicknames : [],
      schedule: source.schedule && typeof source.schedule === 'object' ? source.schedule : {},
      yearlySchedule: Array.isArray(source.yearlySchedule || source.yearly_schedule) ? (source.yearlySchedule || source.yearly_schedule) : [],
      currentActivities: Array.isArray(source.currentActivities || source.current_activities) ? (source.currentActivities || source.current_activities) : [],
      relationships: source.relationships && typeof source.relationships === 'object' ? source.relationships : {},
      locations: Array.isArray(source.locations) ? source.locations : [],
      avatar: ''
    }
  }

  function resetNewCharacterForm() {
    Object.assign(newCharForm, {
      name: '', emoji: '', gender: '', age: 0, desc: '', appearance: '',
      speakingStyle: '', personality: '', outfit: '', hobbies: '', abilities: '',
      experience: '', worldview: '', background: '', group: '', avatar: '',
      affection: 50, defaultPreset: '', defaultModel: '',
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
  }

  async function addNewCharacter() {
    try {
      const id = `char_${Date.now().toString()}`
      const payload = {
        id,
        name: newCharForm.name,
        emoji: newCharForm.emoji,
        gender: newCharForm.gender,
        age: newCharForm.age,
        desc: newCharForm.desc,
        appearance: newCharForm.appearance,
        speakingStyle: newCharForm.speakingStyle,
        personality: newCharForm.personality,
        outfit: newCharForm.outfit,
        hobbies: newCharForm.hobbies,
        abilities: newCharForm.abilities,
        experience: newCharForm.experience,
        worldview: newCharForm.worldview,
        background: newCharForm.background,
        groupId: newCharForm.group || '',
        avatar: newCharForm.avatar || '',
        avatarPath: newCharForm.avatar || '',
        affection: Number(newCharForm.affection || 50),
        defaultPreset: newCharForm.defaultPreset || '',
        defaultModel: newCharForm.defaultModel || '',
        roleTemperature: newCharForm.roleTemperature ?? '',
        roleMaxTokens: newCharForm.roleMaxTokens ?? '',
        roleThinking: newCharForm.roleThinking || '',
        replyPipelineModeOverride: normalizeCharacterReplyPipelineModeOverride(newCharForm.replyPipelineModeOverride),
        nicknames: Array.isArray(newCharForm.nicknames) ? newCharForm.nicknames : [],
        currentActivities: Array.isArray(newCharForm.currentActivities) ? newCharForm.currentActivities : [],
        locations: Array.isArray(newCharForm.locations) ? newCharForm.locations : [],
        schedule: newCharForm.schedule && typeof newCharForm.schedule === 'object' ? newCharForm.schedule : {},
        yearlySchedule: Array.isArray(newCharForm.yearlySchedule) ? newCharForm.yearlySchedule : [],
        relationships: newCharForm.relationships && typeof newCharForm.relationships === 'object' ? newCharForm.relationships : {},
        brainDocuments: newCharForm.brainDocuments && typeof newCharForm.brainDocuments === 'object' ? newCharForm.brainDocuments : {},
        brain_documents: JSON.stringify(newCharForm.brainDocuments && typeof newCharForm.brainDocuments === 'object' ? newCharForm.brainDocuments : {})
      }
      await charStore.addCharacter(payload)
      showAddCharacter.value = false
      toast(`角色已创建：${newCharForm.name}`, 'success')
      resetNewCharacterForm()
      // 返回新角色 id（truthy）；失败返回 false。按钮路径忽略；
      // 星依 generateCharacter / 生成角色 Agent（经 xingyiFunctionBridge）用它定位新角色继续写灵魂/轨迹种子
      return id
    } catch (e: any) {
      toast(`创建角色失败：${e?.message || e}`, 'error')
      return false
    }
  }

  function handleNewCharacterAvatarUpload(event: any) {
    const inputEl = event.target as HTMLInputElement | null
    const file = inputEl?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('只能上传图片文件', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => { newCharForm.avatar = (e.target as FileReader | null)?.result || '' }
    reader.readAsDataURL(file)
  }

  function exportCharacterJsonTemplate() {
    const template = {
      name: '角色名称',
      emoji: '👤',
      gender: '女',
      age: 18,
      desc: '',
      appearance: '',
      speakingStyle: '',
      personality: '',
      outfit: '',
      hobbies: '',
      abilities: '',
      experience: '',
      worldview: '',
      background: '',
      groupId: '',
      affection: 50,
      defaultPreset: '',
      defaultModel: '',
      roleTemperature: '',
      roleMaxTokens: '',
      roleThinking: '',
      replyPipelineModeOverride: 'follow_session',
      nicknames: [],
      currentActivities: [],
      locations: [],
      schedule: {},
      yearlySchedule: [],
      relationships: {}
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '角色JSON模板.json'
    a.click()
    URL.revokeObjectURL(url)
    toast('角色 JSON 模板已导出', 'success')
  }

  function exportCurrentCharacterJson() {
    const source = resolveEditingCharacter()
    if (!source) return
    const payload = buildCharacterTransferData(source)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${payload.name || '角色'}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('角色 JSON 已导出', 'success')
  }

  function importCharacterJson(event: Event) {
    const file = (event.target as HTMLInputElement | null)?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (loadEvent) => {
      try {
        const payload = JSON.parse(String(loadEvent.target?.result || '{}'))
        const { source, isCompleteExport } = resolveCharacterImportSource(payload)
        const data = {
          ...buildCharacterTransferData(source),
          ...(isCompleteExport ? pickCharacterSnapshotState(source) : {})
        }
        if (!data.name) {
          throw new Error('JSON 里缺少角色名称')
        }
        await charStore.addCharacter({
          ...data,
          id: `char_${Date.now().toString()}`,
          avatar: '',
          avatarPath: ''
        })
        toast(isCompleteExport
          ? `完整角色已导入：${data.name}；人格模型文件未随 JSON 导入`
          : `角色已导入：${data.name}`, 'success')
      } catch (e: any) {
        toast(`导入角色失败：${e?.message || e}`, 'error')
      } finally {
        ;(event.target as HTMLInputElement | null)!.value = ''
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  function addScheduleSlot(dayKey: string) {
    if (!charEditForm.schedule) charEditForm.schedule = {}
    if (!charEditForm.schedule[dayKey]) charEditForm.schedule[dayKey] = []
    charEditForm.schedule[dayKey].push({ startTime: '09:00', endTime: '12:00', activity: '', location: '' })
  }

  function removeScheduleSlot(dayKey: string, idx: number) {
    if (!charEditForm.schedule?.[dayKey]) return
    charEditForm.schedule[dayKey].splice(idx, 1)
    if (charEditForm.schedule[dayKey].length === 0) delete charEditForm.schedule[dayKey]
    if (Object.keys(charEditForm.schedule).length === 0) charEditForm.schedule = null
  }

  function toggleDayCollapse(dayKey: string) {
    collapsedDays[dayKey] = !collapsedDays[dayKey]
  }

  function openCopySlotDialog(fromDay: string, _idx: number, slot: any) {
    copyingFromDay.value = fromDay
    copyingSlot.value = { ...slot }
    copyTargetDays.value = []
    showCopySlotDialog.value = true
  }

  function confirmCopySlot() {
    if (!copyingSlot.value || copyTargetDays.value.length === 0) return
    if (!charEditForm.schedule) charEditForm.schedule = {}
    for (const dayKey of copyTargetDays.value) {
      if (!charEditForm.schedule[dayKey]) charEditForm.schedule[dayKey] = []
      charEditForm.schedule[dayKey].push({ ...copyingSlot.value })
    }
    showCopySlotDialog.value = false
  }

  function addRelationship() {
    if (!newRelationshipTarget.value) return
    if (!charEditForm.relationships) charEditForm.relationships = {}
    charEditForm.relationships[newRelationshipTarget.value] = { nickname: '', affection: 50, desc: '' }
    newRelationshipTarget.value = ''
  }

  function removeRelationship(targetId: string) {
    if (charEditForm.relationships) {
      delete charEditForm.relationships[targetId]
    }
  }

  function getAvailableRelationTargets() {
    const currentId = getCurrentTargetId()
    const existingIds = Object.keys(charEditForm.relationships || {})
    const targets: any[] = []

    for (const c of charStore.characters) {
      if (c.id !== currentId && !existingIds.includes(c.id)) {
        targets.push({ id: c.id, name: c.name, emoji: c.emoji || '👤' })
      }
    }

    for (const crowd of charStore.crowds) {
      if (!crowd.members) continue
      const members = typeof crowd.members === 'string' ? JSON.parse(crowd.members) : crowd.members
      for (const m of (members || [])) {
        const mId = `crowd_${crowd.id}_member_${m.name || m}`
        if (!existingIds.includes(mId)) {
          targets.push({ id: mId, name: typeof m === 'string' ? m : m.name, emoji: '👥', _crowdName: crowd.name })
        }
      }
    }
    return targets
  }

  function getAffectionDesc(val: number) {
    if (val >= 80) return '深爱'
    if (val >= 60) return '亲密'
    if (val >= 40) return '友好'
    if (val >= 20) return '好感'
    if (val >= 0) return '普通'
    if (val >= -20) return '冷淡'
    if (val >= -50) return '厌恶'
    return '仇恨'
  }

  function addYearlyEntry() {
    if (!charEditForm.yearlySchedule) charEditForm.yearlySchedule = []
    charEditForm.yearlySchedule.push({ startMonth: 1, endMonth: 6, activity: '' })
  }

  function removeYearlyEntry(idx: number) {
    charEditForm.yearlySchedule.splice(idx, 1)
  }

  function addNickname() {
    const n = newNicknameInput.value.trim()
    if (!n) return
    if (!charEditForm.nicknames) charEditForm.nicknames = []
    if (!charEditForm.nicknames.includes(n)) charEditForm.nicknames.push(n)
    newNicknameInput.value = ''
  }

  function removeNickname(idx: number) {
    charEditForm.nicknames.splice(idx, 1)
  }

  function addActivity() {
    const a = newActivityInput.value.trim()
    if (!a) return
    if (!charEditForm.currentActivities) charEditForm.currentActivities = []
    charEditForm.currentActivities.push(a)
    newActivityInput.value = ''
  }

  function removeActivity(idx: number) {
    charEditForm.currentActivities.splice(idx, 1)
  }

  function addLocation() {
    const l = newLocationInput.value.trim()
    if (!l) return
    if (!charEditForm.locations) charEditForm.locations = []
    charEditForm.locations.push(l)
    newLocationInput.value = ''
  }

  function removeLocation(idx: number) {
    charEditForm.locations.splice(idx, 1)
  }

  function handleAvatarUpload(event: any) {
    const inputEl = event.target as HTMLInputElement | null
    const file = inputEl?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('只能上传图片文件', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => { charEditForm.avatar = (e.target as FileReader | null)?.result || '' }
    reader.readAsDataURL(file)
  }

  async function saveCharacterEdit() {
    const id = resolveEditingCharacterId()
    if (!id) return
    const changes = buildCharacterPersistedChanges(charEditForm)
    try {
      await charStore.updateCharacter(id, changes as any)
      showCharacterEditor.value = false
      toast('角色信息已更新', 'success')
    } catch (e: any) {
      toast(`保存失败: ${e?.message || e}`, 'error')
    }
  }

  function deleteCurrentCharacter() {
    const id = resolveEditingCharacterId()
    if (!id) return
    const runDelete = async () => {
      try {
        await charStore.deleteCharacter(id)
        chatStore.switchChat('')
        showCharacterEditor.value = false
        toast('角色已删除', 'success')
      } catch (e: any) {
        toast(`删除角色失败：${e?.message || e}`, 'error')
      }
    }
    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('删除角色', '确定删除该角色吗？此操作不可撤销。', runDelete, {
        size: 'md',
        heightPreset: 'tall'
      })
      return
    }
    runDelete()
  }

  function openSceneEditor() {
    const session = getCurrentSession()
    fillSceneFormFromSession(session)
    showSceneEditor.value = true
    showCurtainPanel.value = false
  }

  // 马甲选择弹窗直达入口：与桌面帷幕浮窗里的“切换马甲”同语义，移动端帷幕抽屉也走这里
  function openAliasSelector() {
    showCurtainPanel.value = false
    showAliasSelector.value = true
  }

  function openCurtainPanel(messageId?: number) {
    curtainFocusMessageId.value = 0
    showCurtainPanel.value = true
  }

  function openPromptLogPanel(messageId?: number) {
    promptLogFocusMessageId.value = Number(messageId || 0)
    showPromptLogPanel.value = true
  }

  async function saveScene() {
    const target = getCurrentSessionWriteKey()
    if (!target) return
    try {
      await chatStore.updateSession(target, getScenePatchFromForm())
      showSceneEditor.value = false
      showCurtainPanel.value = false
      toast('场景已设置', 'success')
    } catch (e: any) {
      toast(`保存场景失败：${e?.message || e}`, 'error')
    }
  }

  async function clearScene() {
    const target = getCurrentSessionWriteKey()
    if (!target) return
    try {
      await chatStore.updateSession(target, {
        virtualSceneName: '',
        virtualSceneDesc: '',
        virtualLocation: '',
        virtualLocationLarge: '',
        virtualLocationMiddle: '',
        virtualLocationSmall: '',
        virtualLocationSheetId: '',
        virtualLocationFeatureId: '',
        virtualRealLocation: '',
        virtualTime: '',
        virtualTimeAnchor: 0,
        virtualTimeBase: 0,
        virtualTimeRate: 1,
        virtualWeather: '',
        virtualWeatherMode: 'real'
      })
      showSceneEditor.value = false
      showCurtainPanel.value = false
      toast('场景已清除', 'success')
    } catch (e: any) {
      toast(`清除场景失败：${e?.message || e}`, 'error')
    }
  }

  async function saveSessionSceneDraft() {
    const sessionId = String(groupEditForm.sessionId || getCurrentSessionId() || '').trim()
    if (!sessionId) return false
    try {
      await chatStore.updateSession(sessionId, getScenePatchFromForm())
      toast('帷幕已保存', 'success')
      return true
    } catch (e: any) {
      toast(`保存帷幕失败：${e?.message || e}`, 'error')
      return false
    }
  }

  async function saveSessionNarrationDraft() {
    const sessionId = String(groupEditForm.sessionId || getCurrentSessionId() || '').trim()
    if (!sessionId) return false
    try {
      await chatStore.updateSession(sessionId, {
        narrationFrequency: normalizeNarrationFrequency(groupEditForm.narrationFrequency),
        narrationTemperature: normalizeNarrationTemperature(groupEditForm.narrationTemperature),
        narrationProfiles: normalizeNarrationProfilesDraft(groupEditForm.narrationProfiles)
      })
      toast('旁白设置已保存', 'success')
      return true
    } catch (e: any) {
      toast(`保存旁白设置失败：${e?.message || e}`, 'error')
      return false
    }
  }

  async function saveSessionDisplayDraft() {
    const sessionId = String(groupEditForm.sessionId || getCurrentSessionId() || '').trim()
    if (!sessionId) return false
    try {
      groupEditForm.chatFontScale = normalizeChatFontScale(groupEditForm.chatFontScale)
      await chatStore.updateSession(sessionId, {
        chatFontScale: groupEditForm.chatFontScale
      })
      toast('显示设置已保存', 'success')
      return true
    } catch (e: any) {
      toast(`保存显示设置失败：${e?.message || e}`, 'error')
      return false
    }
  }

  async function bindAlias(aliasId: string) {
    const target = getCurrentTargetId()
    if (!target) return
    try {
      await chatStore.updateSession(target, { boundAlias: aliasId || '' })
      showCurtainPanel.value = false
      showAliasSelector.value = false
      toast(aliasId ? '已绑定别名' : '已取消别名绑定', 'success')
    } catch (e: any) {
      toast(`保存马甲失败：${e?.message || e}`, 'error')
    }
  }

  function resetAliasForm() {
    Object.assign(aliasForm, {
      name: '',
      emoji: '',
      gender: '',
      age: 0,
      appearance: '',
      personality: '',
      outfit: '',
      hobbies: '',
      abilities: '',
      experience: '',
      worldview: '',
      background: '',
      desc: '',
      avatarPath: ''
    })
  }

  function openAliasEditor(alias?: any) {
    resetAliasForm()
    editingAliasId.value = alias?.id || null
    if (alias) {
      Object.assign(aliasForm, {
        name: alias.name || '',
        emoji: alias.emoji || '',
        gender: alias.gender || '',
        age: alias.age || 0,
        appearance: alias.appearance || '',
        personality: alias.personality || '',
        outfit: alias.outfit || '',
        hobbies: alias.hobbies || '',
        abilities: alias.abilities || '',
        experience: alias.experience || '',
        worldview: alias.worldview || '',
        background: alias.background || '',
        desc: alias.desc || '',
        avatarPath: alias.avatarPath || alias.avatar_path || ''
      })
    }
    showAliasEditor.value = true
  }

  async function saveAlias() {
    const name = String(aliasForm.name || '').trim()
    if (!name) {
      toast('马甲名称不能为空', 'error')
      return
    }
    try {
      if (editingAliasId.value) {
        await charStore.updateAlias(editingAliasId.value, { ...aliasForm, name })
      } else {
        await charStore.addAlias({ ...aliasForm, name, id: `alias_${Date.now().toString()}` })
      }
      showAliasEditor.value = false
      showCurtainPanel.value = false
      toast('马甲已保存', 'success')
    } catch (e: any) {
      toast(`保存马甲失败：${e?.message || e}`, 'error')
    }
  }

  function deleteAlias(aliasIdInput?: string) {
    const aliasId = String(aliasIdInput || editingAliasId.value || '')
    if (!aliasId) return
    const runDelete = async () => {
      try {
        await charStore.deleteAlias(aliasId)
        if (String(groupEditForm.boundAlias || '') === aliasId) {
          groupEditForm.boundAlias = ''
        }
        showAliasEditor.value = false
        toast('马甲已删除', 'success')
      } catch (e: any) {
        toast(`删除马甲失败：${e?.message || e}`, 'error')
      }
    }
    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('删除马甲', '确定删除这个马甲吗？已使用它的会话需要重新选择身份。', runDelete, {
        size: 'md',
        heightPreset: 'tall'
      })
      return
    }
    runDelete()
  }

  function addNewCharGroup() {
    if (!newGroupName.value) return
    charStore.addCharGroup({ id: Date.now().toString(), name: newGroupName.value, emoji: newGroupEmoji.value || '组' })
    newGroupName.value = ''
    newGroupEmoji.value = ''
    toast('角色分组已添加', 'success')
  }

  function editCharGroup(group: any) {
    const submitRename = (value: string) => {
      const nextName = String(value || '').trim()
      if (!nextName || nextName === String(group.name || '').trim()) return
      charStore.updateCharGroup(group.id, { name: nextName })
      toast('角色分组已更新', 'success')
    }

    if (typeof openPromptDialog === 'function') {
      openPromptDialog({
        title: '修改分组名称',
        message: '给这个角色分组换一个更合适的名字。',
        inputLabel: '分组名称',
        placeholder: '请输入分组名称',
        confirmText: '保存',
        initialValue: String(group.name || ''),
        validator: (value: string) => String(value || '').trim() ? '' : '分组名称不能为空',
        onConfirm: submitRename
      })
      return
    }

    submitRename(String(group.name || ''))
  }

  function saveGroup() {
    if (editingGroupId.value) {
      charStore.updateGroup(editingGroupId.value, {
        name: groupForm.name,
        emoji: groupForm.emoji,
        avatarPath: groupForm.avatarPath,
        members: normalizeGroupMembers(groupForm.members),
        groupId: groupForm.groupId || '',
        group_id: groupForm.groupId || ''
      })
    } else {
      charStore.addGroup({
        id: Date.now().toString(),
        name: groupForm.name,
        emoji: groupForm.emoji,
        avatarPath: groupForm.avatarPath,
        members: normalizeGroupMembers(groupForm.members),
        groupId: groupForm.groupId || '',
        group_id: groupForm.groupId || ''
      })
    }
    groupForm.name = ''
    groupForm.emoji = ''
    groupForm.avatarPath = ''
    groupForm.members = []
    groupForm.groupId = ''
    editingGroupId.value = null
    showCreateGroup.value = false
    toast('群聊已保存', 'success')
  }

  function deleteGroup() {
    if (!editingGroupId.value) return
    charStore.deleteGroup(editingGroupId.value)
    showCreateGroup.value = false
    toast('群聊已删除', 'success')
  }

  function editGroup(groupId: string) {
    const session = getCurrentSession()
    const activeTargetId = getCurrentTargetId()
    const normalizedGroupId = String(groupId || activeTargetId || '').trim()
    const unprefixedGroupId = normalizedGroupId.replace(/^group_/, '')
    const group = charStore.groups.find((g: any) => {
      const itemId = String(g?.id || '').trim()
      return itemId === normalizedGroupId
        || itemId === unprefixedGroupId
        || itemId.replace(/^group_/, '') === unprefixedGroupId
        || `group_${itemId}` === normalizedGroupId
    })
    const targetId = String(session?.targetId || session?.target_id || activeTargetId || normalizedGroupId || '').trim()
    const character = targetId && !targetId.startsWith('group_') && !targetId.startsWith('crowd_')
      ? findCharacterByIdOrName(targetId)
      : null
    const resolvedGroupId = String(group?.id || session?.id || normalizedGroupId || targetId)
    editingGroupId.value = resolvedGroupId
    groupEditForm.id = resolvedGroupId
    groupEditForm.mode = 'edit'
    groupEditForm.sessionId = String(session?.id || '')
    groupEditForm.targetId = targetId
    groupEditForm.name = String(session?.title || group?.name || character?.name || '')
    groupEditForm.emoji = firstFilledText(session?.conversationEmoji, session?.conversation_emoji, group?.emoji, character?.emoji, group ? '👥' : '')
    groupEditForm.avatarPath = firstFilledText(session?.conversationAvatarPath, session?.conversation_avatar_path, group?.avatarPath, group?.avatar_path, character?.avatarPath, character?.avatar_path)
    groupEditForm.members = resolveSessionMembers(session, group, character)
    groupEditForm.groupId = String(group?.groupId || group?.group_id || '')
    groupEditForm.boundAlias = getChatSessionBoundAlias(session)
    groupEditForm.narrationFrequency = normalizeNarrationFrequency(session?.narrationFrequency ?? session?.narration_frequency)
    groupEditForm.narrationTemperature = normalizeNarrationTemperature(session?.narrationTemperature ?? session?.narration_temperature)
    groupEditForm.narrationProfiles = normalizeNarrationProfilesDraft(session?.narrationProfiles ?? session?.narration_profiles)
    groupEditForm.narrationForceEnabled = readSessionBooleanFlag(session?.narrationForceEnabled ?? session?.narration_force_enabled)
    groupEditForm.chatFontScale = normalizeChatFontScale(session?.chatFontScale ?? session?.chat_font_scale)
    groupEditForm.replyPipelineMode = resolveSessionReplyPipelineMode(session)
    groupEditForm.expandedPanel = ''
    fillSceneFormFromSession(session)
    showGroupEditor.value = true
  }

  function openChatSessionCreator() {
    editingGroupId.value = null
    resetGroupEditForm('create')
    fillSceneFormFromSession(null)
    showGroupEditor.value = true
  }

  async function saveGroupEdit() {
    const members = normalizeGroupMembers(groupEditForm.members)
      .filter((member: any) => String(member.characterId || '').trim())
    if (!members.length) {
      toast('至少保留一个会话成员', 'warning')
      return
    }
    const participants = members.map((member: any, index: number) => {
      const character = findCharacterByIdOrName(String(member.characterId || ''))
      return {
        targetId: member.characterId,
        targetType: 'char',
        displayName: String(character?.name || member.characterId),
        displayOrder: index,
        role: 'member',
        probability: normalizeMemberProbability(member.probability),
        characterStateMode: member.characterStateMode === 'independent_snapshot'
          ? 'independent_snapshot' as const
          : 'follow_main' as const,
        characterBranchId: String(member.characterBranchId || ''),
        sourceSnapshotId: String(member.sourceSnapshotId || '')
      }
    })
    const manualTitle = String(groupEditForm.name || '').trim()
    const sharedPayload = {
      conversationAvatarPath: groupEditForm.avatarPath || '',
      ...getScenePatchFromForm(),
      boundAlias: groupEditForm.boundAlias || '',
      narrationFrequency: normalizeNarrationFrequency(groupEditForm.narrationFrequency),
      narrationTemperature: normalizeNarrationTemperature(groupEditForm.narrationTemperature),
      narrationProfiles: normalizeNarrationProfilesDraft(groupEditForm.narrationProfiles),
      narrationForceEnabled: readSessionBooleanFlag(groupEditForm.narrationForceEnabled),
      chatFontScale: normalizeChatFontScale(groupEditForm.chatFontScale),
      replyPipelineMode: normalizeChatSessionReplyPipelineMode(groupEditForm.replyPipelineMode),
      participants
    }
    if (groupEditForm.mode === 'create') {
      const bundle = await createChatSession({
        ...sharedPayload,
        targetId: members[0].characterId,
        targetType: 'char',
        title: manualTitle || buildDefaultSessionTitle(members)
      })
      const sessionId = String(bundle?.session?.id || '').trim()
      if (!sessionId) throw new Error('创建会话后没有返回 sessionId')
      await chatStore.switchSession?.(sessionId)
      resetGroupEditForm('edit')
      showGroupEditor.value = false
      toast('会话已创建', 'success')
      return
    }
    const target = String(groupEditForm.targetId || getCurrentTargetId() || '').trim()
    if (!target) return
    await chatStore.updateSession(target, {
      ...sharedPayload,
      title: manualTitle
    })
    resetGroupEditForm('edit')
    showGroupEditor.value = false
    toast('会话已保存', 'success')
  }

  /** 聊天图片设头像的唯一写入口：裁剪后的 data URI 交给各正式 store/server 链转换成 avatars 文件与台账记录。 */
  async function assignImageAvatar(
    target: { kind: 'session' | 'character' | 'alias'; id: string; name?: string },
    dataUrl: string
  ): Promise<boolean> {
    const id = String(target.id || '').trim()
    if (!id || !String(dataUrl || '').startsWith('data:image/')) {
      toast('头像目标或图片无效', 'error')
      return false
    }
    try {
      if (target.kind === 'character') {
        await charStore.updateCharacter(id, { avatarPath: dataUrl } as any)
      } else if (target.kind === 'alias') {
        await charStore.updateAlias(id, { avatarPath: dataUrl } as any)
      } else {
        await chatStore.updateSession(id, { conversationAvatarPath: dataUrl })
      }
      toast(`已设置${target.kind === 'session' ? '会话' : target.kind === 'character' ? '角色' : '马甲'}头像`, 'success')
      return true
    } catch (error: any) {
      toast(`设置头像失败：${error?.message || error}`, 'error')
      return false
    }
  }

  function editCrowd(crowdId: string) {
    const normalizedCrowdId = String(crowdId || '').trim()
    const unprefixedCrowdId = normalizedCrowdId.replace(/^crowd_/, '')
    const crowd = charStore.crowds.find((c: any) => {
      const itemId = String(c?.id || '').trim()
      return itemId === normalizedCrowdId
        || itemId === unprefixedCrowdId
        || itemId.replace(/^crowd_/, '') === unprefixedCrowdId
        || `crowd_${itemId}` === normalizedCrowdId
    })
    if (!crowd) return
    editingCrowdId.value = String(crowd.id || normalizedCrowdId)
    crowdForm.name = crowd.name || ''
    crowdForm.emoji = crowd.emoji || '👤'
    crowdForm.nickname = crowd.nickname || ''
    crowdForm.members = crowd.members ? JSON.parse(JSON.stringify(crowd.members)) : []
    crowdForm.locations = (crowd.locations || []).join(', ')
    crowdForm.apiPreset = crowd.apiPreset || crowd.defaultPreset || crowd.default_preset || crowd.apiConfig?.preset || ''
    crowdForm.groupId = String(crowd.groupId || crowd.group_id || '')
    showCrowdEditor.value = true
  }

  function saveCrowd() {
    const members = crowdForm.members.filter((m: any) => m.name)
    const locations = crowdForm.locations.split(',').map((s: string) => s.trim()).filter(Boolean)
    const data = {
      name: crowdForm.name, emoji: crowdForm.emoji, nickname: crowdForm.nickname,
      members, locations,
      apiPreset: crowdForm.apiPreset || '',
      defaultPreset: crowdForm.apiPreset || '',
      apiConfig: crowdForm.apiPreset ? { preset: crowdForm.apiPreset } : undefined,
      groupId: crowdForm.groupId || '',
      group_id: crowdForm.groupId || ''
    }
    if (editingCrowdId.value) {
      charStore.updateCrowd(editingCrowdId.value, data)
    } else {
      charStore.addCrowd({ ...data, id: Date.now().toString() })
    }
    crowdForm.groupId = ''
    showCrowdEditor.value = false
    toast('路人组已保存', 'success')
  }

  function deleteCrowd() {
    if (!editingCrowdId.value) return
    charStore.deleteCrowd(editingCrowdId.value)
    showCrowdEditor.value = false
    toast('路人组已删除', 'success')
  }

  return {
    toast,
    addNewCharacter,
    addScheduleSlot,
    removeScheduleSlot,
    toggleDayCollapse,
    openCopySlotDialog,
    confirmCopySlot,
    addRelationship,
    removeRelationship,
    getAvailableRelationTargets,
    getAffectionDesc,
    addYearlyEntry,
    removeYearlyEntry,
    addNickname,
    removeNickname,
    addActivity,
    removeActivity,
    addLocation,
    removeLocation,
    handleNewCharacterAvatarUpload,
    importCharacterJson,
    exportCharacterJsonTemplate,
    exportCurrentCharacterJson,
    handleAvatarUpload,
    openCurtainPanel,
    openPromptLogPanel,
    saveCharacterEdit,
    deleteCurrentCharacter,
    openSceneEditor,
    openAliasSelector,
    saveScene,
    clearScene,
    bindAlias,
    openAliasEditor,
    saveAlias,
    deleteAlias,
    saveSessionSceneDraft,
    saveSessionNarrationDraft,
    saveSessionDisplayDraft,
    addNewCharGroup,
    editCharGroup,
    saveGroup,
    deleteGroup,
    editGroup,
    openChatSessionCreator,
    saveGroupEdit,
    assignImageAvatar,
    editCrowd,
    saveCrowd,
    deleteCrowd
  }
}
import {
  getChatSessionBoundAlias,
  getChatSessionVirtualScene,
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession,
  createChatSession,
  readChatStoreValue
} from '../../repositories/chatRepository'
import { buildCharacterPersistedChanges } from '../../app/characterBrain'
import { normalizeCharacterReplyPipelineModeOverride } from '../../app/chatReplyPipelineMode'
import { normalizeNarrationProfiles as sharedNormalizeNarrationProfiles } from '../../app/narrationProtocol'
import { normalizeChatSessionReplyPipelineMode, resolveSessionReplyPipelineMode } from '../../app/chatReplyPipelineMode'
import { applyCharacterSnapshotState, pickCharacterSnapshotState } from '../../../shared/characterSnapshotState'
