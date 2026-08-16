export function createSettingsModalState({
  appState,
  stores,
  characterOps,
  uiHelpers,
  settingEnvironmentService
}: any) {
  const safeNoop = () => {}
  const safeFn = (fn: any) => (typeof fn === 'function' ? fn : safeNoop)
  const runWithConfirm = (title: string, message: string, task: () => Promise<void> | void) => {
    if (typeof uiHelpers?.openConfirmDialog !== 'function') {
      return task()
    }
    uiHelpers.openConfirmDialog(title, message, task)
  }
  const resetCharGroupEditForm = (kind?: 'char' | 'group' | 'crowd') => {
    const nextKind = kind || appState.charGroupEditForm.kind || 'char'
    appState.charGroupEditForm.id = ''
    appState.charGroupEditForm.name = ''
    appState.charGroupEditForm.kind = nextKind === 'group' || nextKind === 'crowd' ? nextKind : 'char'
    appState.charGroupEditForm.memberIds = []
  }
  const getEntityGroupId = (item: any) => String(item?.groupId ?? item?.group_id ?? item?.group ?? '').trim()
  const getGroupItemsByKind = (kind: 'char' | 'group' | 'crowd') => {
    if (kind === 'group') return Array.isArray(stores?.charStore?.groups) ? stores.charStore.groups : []
    if (kind === 'crowd') return Array.isArray(stores?.charStore?.crowds) ? stores.charStore.crowds : []
    return Array.isArray(stores?.charStore?.characters) ? stores.charStore.characters : []
  }
  const resolveItemsByGroup = (kind: 'char' | 'group' | 'crowd', groupId: string) => {
    const normalizedGroupId = String(groupId || '').trim()
    return getGroupItemsByKind(kind).filter((item: any) => getEntityGroupId(item) === normalizedGroupId)
  }
  const updateGroupAssignment = async (kind: 'char' | 'group' | 'crowd', itemId: string, groupId: string) => {
    if (kind === 'group') {
      await stores.charStore.updateGroup(itemId, { groupId, group_id: groupId })
      return
    }
    if (kind === 'crowd') {
      await stores.charStore.updateCrowd(itemId, { groupId, group_id: groupId })
      return
    }
    await stores.charStore.updateCharacter(itemId, { groupId, group_id: groupId })
  }

  return {
    showCharGroupManager: appState.showCharGroupManager,
    viewModel: {
      apiPresets: stores.settingStore.apiPresets,
      get characterGroups() {
        return Array.isArray(stores.charStore.characterGroups)
          ? stores.charStore.characterGroups.filter((item: any) => item?.id !== 'default')
          : []
      },
      get charGroupKind() {
        const kind = String(appState.charGroupEditForm.kind || 'char').trim()
        return kind === 'group' || kind === 'crowd' ? kind : 'char'
      },
      get charGroupTypeLabel() {
        return this.charGroupKind === 'group'
          ? '群聊'
          : this.charGroupKind === 'crowd'
            ? '群众角色'
            : '角色'
      },
      get charGroupMemberLabel() {
        return `${this.charGroupTypeLabel}成员`
      },
      get charGroupSelectableItems() {
        return getGroupItemsByKind(this.charGroupKind).map((item: any) => ({
          ...item,
          id: String(item?.id || '').trim(),
          name: String(item?.name || '').trim() || '未命名'
        })).filter((item: any) => item.id)
      },
      get ungroupedCharacters() {
        return Array.isArray(stores.charStore.characters)
          ? stores.charStore.characters.filter((item: any) => {
              const groupId = String(item?.groupId ?? item?.group_id ?? item?.group ?? '').trim()
              return !groupId || groupId === 'default'
            })
          : []
      },
      get getCharactersByGroup() {
        return (groupId: string) => {
          const localMatches = resolveItemsByGroup('char', groupId)
          if (localMatches.length > 0) return localMatches
          const externalMatches = typeof uiHelpers?.getCharactersByGroup === 'function'
            ? uiHelpers.getCharactersByGroup(groupId)
            : []
          return Array.isArray(externalMatches) ? externalMatches : []
        }
      },
      get getItemsByGroup() {
        return (groupId: string) => resolveItemsByGroup(this.charGroupKind, groupId)
      },
      get characters() {
        return Array.isArray(stores.charStore.characters) ? stores.charStore.characters : []
      },
      charGroupEditForm: appState.charGroupEditForm
    },
    actions: {
      saveEnvironment: safeFn(settingEnvironmentService?.saveEnvironment),
      startNewCharGroup: () => {
        const kind = String(appState.charGroupEditForm.kind || 'char').trim()
        resetCharGroupEditForm(kind === 'group' || kind === 'crowd' ? kind : 'char')
      },
      startEditCharGroup: (group: any) => {
        appState.charGroupEditForm.id = String(group?.id || '')
        appState.charGroupEditForm.name = String(group?.name || '')
        const kind = String(appState.charGroupEditForm.kind || 'char').trim()
        appState.charGroupEditForm.memberIds = resolveItemsByGroup(kind === 'group' || kind === 'crowd' ? kind : 'char', group?.id).map((item: any) => item.id)
      },
      cancelEditCharGroup: resetCharGroupEditForm,
      toggleCharGroupMember: (characterId: string) => {
        const currentIds: string[] = Array.isArray(appState.charGroupEditForm.memberIds)
          ? appState.charGroupEditForm.memberIds.map((item: any) => String(item || '').trim()).filter(Boolean)
          : []
        const nextId = String(characterId || '').trim()
        if (!nextId) return
        if (currentIds.includes(nextId)) {
          appState.charGroupEditForm.memberIds = currentIds.filter((item) => item !== nextId)
          return
        }
        appState.charGroupEditForm.memberIds = [...currentIds, nextId]
      },
      addNewCharGroup: () => {
        const groupName = String(appState.charGroupEditForm.name || '').trim()
        const groupKind = String(appState.charGroupEditForm.kind || 'char').trim() === 'group'
          ? 'group'
          : String(appState.charGroupEditForm.kind || 'char').trim() === 'crowd'
            ? 'crowd'
            : 'char'
        if (!groupName) return
        const memberIds = Array.isArray(appState.charGroupEditForm.memberIds)
          ? Array.from(new Set(appState.charGroupEditForm.memberIds.map((item: any) => String(item || '').trim()).filter(Boolean))) as string[]
          : []
        const nextGroupId = Date.now().toString()
        runWithConfirm(
          '确认添加分组',
          `确定添加分组“${groupName}”吗？`,
          async () => {
            await stores.charStore.addCharGroup({ id: nextGroupId, name: groupName })
            if (memberIds.length) {
              await Promise.all(memberIds.map((itemId: string) => updateGroupAssignment(groupKind, itemId, nextGroupId)))
            }
            appState.charGroupEditForm.id = nextGroupId
            appState.charGroupEditForm.name = groupName
            appState.charGroupEditForm.kind = groupKind
            appState.charGroupEditForm.memberIds = memberIds
          }
        )
      },
      saveCharGroupEdit: () => {
        const groupId = String(appState.charGroupEditForm.id || '').trim()
        const groupName = String(appState.charGroupEditForm.name || '').trim()
        const groupKind = String(appState.charGroupEditForm.kind || 'char').trim() === 'group'
          ? 'group'
          : String(appState.charGroupEditForm.kind || 'char').trim() === 'crowd'
            ? 'crowd'
            : 'char'
        if (!groupId || !groupName) return
        const originalMembers = resolveItemsByGroup(groupKind, groupId).map((item: any) => item.id)
        const nextMembers: string[] = Array.isArray(appState.charGroupEditForm.memberIds)
          ? Array.from(new Set(appState.charGroupEditForm.memberIds.map((item: any) => String(item || '').trim()).filter(Boolean))) as string[]
          : []
        const removedMemberIds = originalMembers.filter((item: string) => !nextMembers.includes(item))
        const addedMemberIds = nextMembers.filter((item: string) => !originalMembers.includes(item))
        runWithConfirm(
          '确认保存分组',
          `确定保存分组“${groupName}”的名称和成员调整吗？`,
          async () => {
            await stores.charStore.updateCharGroup(groupId, { name: groupName })
            await Promise.all([
              ...removedMemberIds.map((itemId: string) => updateGroupAssignment(groupKind, itemId, 'default')),
              ...addedMemberIds.map((itemId: string) => updateGroupAssignment(groupKind, itemId, groupId))
            ])
            appState.charGroupEditForm.id = groupId
            appState.charGroupEditForm.name = groupName
            appState.charGroupEditForm.kind = groupKind
            appState.charGroupEditForm.memberIds = nextMembers
          }
        )
      },
      moveCharGroupUp: (groupId: string) => {
        const group = stores.charStore.characterGroups.find((item: any) => item.id === groupId)
        if (!group || group.id === 'default') return
        runWithConfirm(
          '确认调整顺序',
          `确定把分组“${group.name}”上移一位吗？`,
          async () => {
            await stores.charStore.moveCharGroup(groupId, -1)
          }
        )
      },
      moveCharGroupDown: (groupId: string) => {
        const group = stores.charStore.characterGroups.find((item: any) => item.id === groupId)
        if (!group || group.id === 'default') return
        runWithConfirm(
          '确认调整顺序',
          `确定把分组“${group.name}”下移一位吗？`,
          async () => {
            await stores.charStore.moveCharGroup(groupId, 1)
          }
        )
      },
      deleteCharGroup: (groupId: string) => {
        const group = stores.charStore.characterGroups.find((item: any) => item.id === groupId)
        if (!group || group.id === 'default') return
        runWithConfirm(
          '确认删除分组',
          `删除分组“${group.name}”后，原成员会回到默认分组。确定继续吗？`,
          async () => {
            await stores.charStore.deleteCharGroup(groupId)
            if (appState.charGroupEditForm.id === groupId) {
              resetCharGroupEditForm()
            }
          }
        )
      }
    }
  }
}
