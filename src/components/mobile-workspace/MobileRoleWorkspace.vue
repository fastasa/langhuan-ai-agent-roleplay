<template>
  <section class="mobile-role-workspace" :aria-label="$t('mobile.page.roles')">
    <!-- 角色列表 -->
    <template v-if="pane === 'list'">
      <MobileTopBar :title="$t('sidebar.navRoles')" :action-label="$t('common.create')" action-icon="plus" @primary="openAddCharacter">
        <template #actions>
          <button type="button" class="mobile-role__icon-btn" :aria-label="$t('mobile.promptLib.filter')" :title="$t('mobile.promptLib.filter')">
            <MobileLineIcon name="filter" :size="19" :stroke-width="1.8" />
          </button>
        </template>
      </MobileTopBar>

      <label class="mobile-role-search">
        <MobileLineIcon name="search" :size="16" :stroke-width="1.9" />
        <input v-model="searchText" type="search" :placeholder="$t('mobile.roleWs.searchPlaceholder')">
      </label>

      <div class="mobile-role-body lhm-scroll">
        <template v-if="groupedCharacters.length">
          <div v-for="group in groupedCharacters" :key="group.id" class="mobile-role-group">
            <MobileGroupHeader
              :label="group.name"
              :count="group.characters.length"
              :open="isGroupOpen(group.id)"
              @toggle="toggleGroup(group.id)"
            />
            <div v-if="isGroupOpen(group.id)" class="mobile-role-members">
              <MobileFlowRow
                v-for="(character, index) in group.characters"
                :key="readId(character)"
                :title="readName(character)"
                :meta="buildCharacterMeta(character)"
                :sub="buildCharacterPreview(character)"
                :min-h="58"
                :divider="index < group.characters.length - 1"
                :selection-mode="roleSelectionMode"
                :selected="selectedRoleIds.has(readId(character))"
                @select="openCharacter(character)"
                @long-press="enterRoleSelection(readId(character))"
                @toggle-select="toggleRoleSelection(readId(character))"
              >
                <template #avatar>
                  <MobileAvatar :label="readEmoji(character)" :src="readAvatar(character)" :size="34" :color="avatarColor(index)" />
                </template>
                <template #trailing v-if="!roleSelectionMode">
                  <MobileLineIcon name="chevron-right" :size="16" :stroke-width="1.8" class="mobile-role__go" />
                </template>
              </MobileFlowRow>
            </div>
          </div>
        </template>

        <div v-else class="mobile-role-empty">{{ $t('mobile.roleWs.noMatch') }}</div>
      </div>
    </template>

    <!-- 角色详情：核心 / 灵魂 / 轨迹 -->
    <template v-else-if="pane === 'detail'">
      <MobileTopBar
        variant="detail"
        :title="currentCharacterName"
        :subtitle="currentCharacterSubtitle"
        show-back
        @back="pane = 'list'"
      >
        <template #leading>
          <MobileAvatar :label="currentCharacterEmoji" :src="currentCharacterAvatar" :size="38" color="var(--lhm-av-brown, #8b7355)" />
        </template>
        <template #actions>
          <button type="button" class="mobile-role__icon-btn" :aria-label="$t('mobile.roleWs.characterSettings')" :title="$t('mobile.roleWs.characterSettings')" @click="openCharacterEditor">
            <MobileLineIcon name="settings" :size="20" :stroke-width="1.8" />
          </button>
        </template>
      </MobileTopBar>

      <div class="mobile-role-detail lhm-scroll">
        <MobileStatCard :total="neuronTotal" :total-label="$t('mobile.roleWs.neuronTotal')" :deltas="statDeltas" />

        <MobileTreeToolbar
          :aria-label="$t('mobile.roleWs.treeToolbarAria')"
          :can-create="false"
          :all-expanded="allOpen === true"
          @action="handleTreeAction"
        />

        <MobileSoneTree
          :key="treeKey"
          :data="soneData"
          :force-all="allOpen"
          :selection-mode="unitSelectionMode"
          @leaf="onTreeLeaf"
          @long-press="enterUnitSelection"
          @toggle-select="toggleUnitSelection"
        />
      </div>

      <!-- 单位多选时，页内 sectionNav 让位给壳层操作胶囊（单层原位替换） -->
      <MobileGlassNav v-if="!unitSelectionMode" :items="sectionNav" :active-item="activeSection" @select="switchSection" />
    </template>

    <!-- 单位：阅读 / 编辑 / 关系视图 -->
    <template v-else>
      <MobileTopBar
        variant="detail"
        :crumb="unitCrumb"
        :title="selectedUnitTitle"
        show-back
        @back="pane = 'detail'"
      />

      <div class="mobile-unit lhm-scroll">
        <section v-if="unitMode === 'read'" class="mobile-unit__read">
          <div class="mobile-unit__compile">
            <span class="mobile-unit__compile-label">{{ $t('mobile.roleWs.publicCompilePage') }}</span>
            <span class="mobile-chip" :class="`mobile-chip--${selectedUnitStatus === 'pending' ? 'warn' : 'ok'}`">
              {{ selectedUnitStatus === 'pending' ? $t('mobile.docWs.statusPending') : $t('mobile.docWs.statusNormal') }}
            </span>
          </div>
          <MobileRoleplayText class="mobile-unit__body" :text="selectedUnitBody" />
        </section>

        <section v-else-if="unitMode === 'relation'" class="mobile-unit__relations">
          <div class="mobile-relation-graph">
            <RoleRelationBrainView
              :character-id="currentCharacterId"
              :units="units"
              :relations="relations"
              :active-unit="selectedUnit"
              @open-unit="onGraphOpenUnit"
            />
          </div>
        </section>

        <section v-else class="mobile-unit__edit">
          <MobileMarkdownEditor
            :model-value="editableBody"
            :can-edit="isUnitEditable"
            :saving="savingUnit"
            @save="onSaveUnit"
          />
        </section>
      </div>

      <MobileGlassNav :items="unitNav" :active-item="unitMode" @select="selectUnitMode" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { applyCharacterBrainCardDraft } from '../../app/characterBrain'
import { buildCharacterBrainUnitView } from '../../app/unitViewAdapters'
import { useCharacterStore } from '../../stores/characterStore'
import RoleRelationBrainView from '../app/RoleRelationBrainView.vue'
import MobileMarkdownEditor from './MobileMarkdownEditor.vue'
import type { Character } from '../../types'
import type { NamedEntity } from '../../types/panelContracts'
import type { RelationViewRecord, UnitView } from '../../types/unitView'
import MobileAvatar from './MobileAvatar.vue'
import MobileFlowRow from './MobileFlowRow.vue'
import MobileGlassNav from './MobileGlassNav.vue'
import MobileGroupHeader from './MobileGroupHeader.vue'
import MobileLineIcon from './MobileLineIcon.vue'
import MobileRoleplayText from './MobileRoleplayText.vue'
import MobileSoneTree from './MobileSoneTree.vue'
import MobileStatCard from './MobileStatCard.vue'
import MobileTopBar from './MobileTopBar.vue'
import MobileTreeToolbar from './MobileTreeToolbar.vue'
import type { MobileGlassNavItem, MobileSelectionAction, MobileSelectionDescriptor, MobileSoneNode, MobileTreeToolbarAction, MobileWorkspaceShellProps } from './mobileWorkspaceTypes'

type RolePane = 'list' | 'detail' | 'unit'
type RoleSection = 'core' | 'soul' | 'trace'
type UnitMode = 'read' | 'edit' | 'relation'

const props = defineProps<MobileWorkspaceShellProps>()
const emit = defineEmits<{
  depthChange: [isDeep: boolean]
  selection: [descriptor: MobileSelectionDescriptor]
}>()

const AVATAR_COLORS = [
  'var(--lhm-av-olive, #5c8a5c)',
  'var(--lhm-av-brown, #8b7355)',
  'var(--lhm-av-sand, #b5a082)',
  'var(--lhm-av-blue, #8fa6b2)',
  'var(--lhm-av-rose, #bc8c84)'
]

const { t } = useI18n()

// 模块级 const 里不能调 t()：改为「id/icon + labelKey 定义 + computed 里 t() 填充」
const SECTION_NAV_DEFS: Array<{ id: RoleSection; labelKey: string; icon: MobileGlassNavItem['icon'] }> = [
  { id: 'core', labelKey: 'brain.domainLabel.core', icon: 'spark' },
  { id: 'soul', labelKey: 'brain.domainLabel.soul', icon: 'share-2' },
  { id: 'trace', labelKey: 'brain.domainLabel.trace', icon: 'route' }
]
const sectionNav = computed<MobileGlassNavItem[]>(() =>
  SECTION_NAV_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey), icon: def.icon }))
)
const UNIT_NAV_DEFS: Array<{ id: UnitMode; labelKey: string; icon: MobileGlassNavItem['icon'] }> = [
  { id: 'read', labelKey: 'mobile.docWs.navRead', icon: 'book-open' },
  { id: 'edit', labelKey: 'common.edit', icon: 'square-pen' },
  { id: 'relation', labelKey: 'docLibrary.relation.viewLabel', icon: 'git-branch' }
]
const unitNav = computed<MobileGlassNavItem[]>(() =>
  UNIT_NAV_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey), icon: def.icon }))
)

const characterStore = useCharacterStore()

const pane = ref<RolePane>('list')
const searchText = ref('')
const selectedCharacterId = ref('')
const activeSection = ref<RoleSection>('core')
const selectedUnitId = ref('')
const unitMode = ref<UnitMode>('read')
const savingUnit = ref(false)
const openGroups = ref<Set<string>>(new Set())
const roleGroupsExpansionTouched = ref(false)
const allOpen = ref<boolean | null>(null)
const treeKey = ref(0)
const selectedRoleIds = ref<Set<string>>(new Set())
const selectedUnitIds = ref<Set<string>>(new Set())

const characters = computed(() => normalizeArray<NamedEntity>(props.state.chatViewModel.characters))
const characterGroups = computed(() => normalizeArray<NamedEntity>(props.state.chatViewModel.characterGroups))

const currentCharacter = computed<NamedEntity | null>(() => {
  const selectedId = selectedCharacterId.value
  if (selectedId) {
    const matched = characters.value.find((character) => readId(character) === selectedId)
    if (matched) return matched
  }
  const currentId = readId(props.state.chatViewModel.currentCharacter || {})
  if (currentId) {
    const matched = characters.value.find((character) => readId(character) === currentId)
    if (matched) return matched
  }
  return characters.value[0] || null
})

const currentCharacterName = computed(() => currentCharacter.value ? readName(currentCharacter.value) : t('chat.characterFallback'))
const currentCharacterId = computed(() => currentCharacter.value ? readId(currentCharacter.value) : '')
const currentCharacterEmoji = computed(() => currentCharacter.value ? readEmoji(currentCharacter.value) : '角')
const currentCharacterAvatar = computed(() => currentCharacter.value ? readAvatar(currentCharacter.value) : '')
const currentCharacterSubtitle = computed(() => {
  const character = currentCharacter.value
  if (!character) return ''
  const groupName = resolveGroupName(character)
  return [readText(character.gender), readText(character.age), groupName].filter(Boolean).join(' · ')
})

const groupedCharacters = computed(() => {
  const query = searchText.value.trim().toLowerCase()
  const groupById = new Map(characterGroups.value.map((group) => [readId(group), group]))
  const buckets = new Map<string, { id: string; name: string; characters: NamedEntity[] }>()
  const ensureBucket = (id: string, name: string) => {
    if (!buckets.has(id)) buckets.set(id, { id, name, characters: [] })
    return buckets.get(id)!
  }
  characters.value.forEach((character) => {
    const groupId = readText(character.groupId ?? character.group_id)
    const group = groupById.get(groupId)
    const groupName = group ? readName(group) : t('mobile.roleWs.ungrouped')
    if (query && !buildCharacterSearchText(character, groupName).includes(query)) return
    ensureBucket(group ? readId(group) : '__ungrouped__', groupName).characters.push(character)
  })
  return Array.from(buckets.values()).filter((group) => group.characters.length > 0)
})
const roleSelectionMode = computed(() => selectedRoleIds.value.size > 0)
const roleSelectionActions = computed<MobileSelectionAction[]>(() => {
  const count = selectedRoleIds.value.size
  return [
    { id: 'open', label: t('mobile.chatList.open'), icon: 'chevron-right', disabled: count !== 1 },
    { id: 'edit', label: t('common.edit'), icon: 'square-pen', disabled: count !== 1 },
    { id: 'delete', label: t('common.delete'), icon: 'trash', danger: true, disabled: count < 1 }
  ]
})

const unitView = computed(() => {
  if (!currentCharacter.value) return { units: [] as UnitView[], relations: [] as RelationViewRecord[] }
  try {
    return buildCharacterBrainUnitView(currentCharacter.value as unknown as Character)
  } catch {
    return { units: [] as UnitView[], relations: [] as RelationViewRecord[] }
  }
})

const units = computed(() => unitView.value.units || [])
const relations = computed(() => unitView.value.relations || [])
const unitById = computed(() => new Map(units.value.map((unit) => [unit.unitId, unit])))
const childrenByParentId = computed(() => {
  const map = new Map<string, UnitView[]>()
  units.value.forEach((unit) => {
    if (!unit.parentId) return
    const list = map.get(unit.parentId) || []
    list.push(unit)
    map.set(unit.parentId, list)
  })
  map.forEach((list) => list.sort(sortUnitRows))
  return map
})

const activeRootUnit = computed(() => units.value.find((unit) => unit.unitType === activeSection.value) || null)

const soneData = computed<MobileSoneNode[]>(() => {
  const root = activeRootUnit.value
  if (!root) return []
  return [{
    title: readUnitTitle(root),
    icon: activeSection.value,
    open: true,
    key: root.unitId,
    children: buildNodes(root.unitId)
  }]
})

function buildNodes(parentId: string): MobileSoneNode[] {
  const children = childrenByParentId.value.get(parentId) || []
  return children.map((unit) => {
    const kids = childrenByParentId.value.get(unit.unitId)
    const hasKids = Boolean(kids && kids.length)
    const node: MobileSoneNode = {
      title: readUnitTitle(unit),
      key: unit.unitId,
      leafId: unit.unitId,
      sel: unit.unitId === selectedUnitId.value,
      checked: selectedUnitIds.value.has(unit.unitId)
    }
    if (hasKids) {
      node.children = buildNodes(unit.unitId)
    } else {
      node.fill = isUnitFilled(unit)
      const tag = readUnitTag(unit)
      if (tag) node.tag = tag
    }
    return node
  })
}

const sectionStats = computed(() => ({
  core: countSectionUnits('core'),
  soul: countSectionUnits('soul'),
  trace: countSectionUnits('trace')
}))
const neuronTotal = computed(() => sectionStats.value.core + sectionStats.value.soul + sectionStats.value.trace)
const pendingCount = computed(() => units.value.filter((unit) => unit.status === 'pending').length)
const statDeltas = computed(() => ([
  { value: 0, label: t('mobile.roleWs.deltaNew'), tone: 'accent' as const },
  { value: 0, label: t('mobile.roleWs.deltaModified'), tone: 'info' as const },
  { value: pendingCount.value, label: t('mobile.roleWs.deltaPending'), tone: 'gold' as const }
]))

const selectedUnit = computed(() => unitById.value.get(selectedUnitId.value) || null)
const unitSelectionMode = computed(() => selectedUnitIds.value.size > 0)
const unitSelectionActions = computed<MobileSelectionAction[]>(() => {
  const count = selectedUnitIds.value.size
  return [
    { id: 'open', label: t('mobile.chatList.open'), icon: 'book-open', disabled: count !== 1 },
    { id: 'edit', label: t('common.edit'), icon: 'square-pen', disabled: count !== 1 || !canEditSelectedUnit() },
    { id: 'relation', label: t('mobile.docWs.relation'), icon: 'git-branch', disabled: count !== 1 },
    { id: 'copy-path', label: t('mobile.docWs.copyPath'), icon: 'copy', disabled: count < 1 },
    { id: 'delete', label: t('common.delete'), icon: 'trash', danger: true, disabled: true }
  ]
})
const selectedUnitTitle = computed(() => selectedUnit.value ? readUnitTitle(selectedUnit.value) : t('mobile.roleWs.unitReadFallback'))
const selectedUnitStatus = computed(() => selectedUnit.value?.status || 'normal')
const selectedUnitBody = computed(() => {
  const unit = selectedUnit.value
  if (!unit) return t('mobile.roleWs.selectUnit')
  return readText(unit.body) || readText(unit.compilePage?.summary) || t('mobile.docWs.noBody')
})
const editableBody = computed(() => readText(selectedUnit.value?.body))
const isUnitEditable = computed(() => {
  const unit = selectedUnit.value
  return Boolean(unit) && (unit!.unitType === 'coreField' || unit!.unitType === 'soulNode') && unit!.contentKind === 'markdown'
})
const unitCrumb = computed(() => {
  const unit = selectedUnit.value
  if (!unit) return currentCharacterName.value
  const titles: string[] = []
  let cursor: UnitView | undefined = unit.parentId ? unitById.value.get(unit.parentId) : undefined
  let guard = 0
  while (cursor && guard < 12) {
    titles.unshift(readUnitTitle(cursor))
    cursor = cursor.parentId ? unitById.value.get(cursor.parentId) : undefined
    guard += 1
  }
  return [currentCharacterName.value, ...titles].join(' · ')
})
watch(pane, (value) => {
  emit('depthChange', value !== 'list')
  // 切换层级时清空选择，避免残留的角色/单位多选态跨层泄漏
  clearRoleSelection()
  clearUnitSelection()
}, { immediate: true })

// 按当前层级上报多选描述符：列表层=角色多选，详情层=单位多选，单位层无多选
watchEffect(() => {
  if (pane.value === 'list') {
    emit('selection', {
      open: roleSelectionMode.value,
      count: selectedRoleIds.value.size,
      actions: roleSelectionActions.value,
      onCancel: clearRoleSelection,
      onAction: runRoleSelectionAction
    })
  } else if (pane.value === 'detail') {
    emit('selection', {
      open: unitSelectionMode.value,
      count: selectedUnitIds.value.size,
      actions: unitSelectionActions.value,
      onCancel: clearUnitSelection,
      onAction: runUnitSelectionAction
    })
  } else {
    emit('selection', { open: false, count: 0, actions: [], onCancel: () => {}, onAction: () => {} })
  }
})

watch(currentCharacter, () => {
  selectedUnitId.value = ''
  unitMode.value = 'read'
}, { immediate: true })

watch(groupedCharacters, (groups) => {
  if (roleGroupsExpansionTouched.value || !groups.length) return
  openGroups.value = new Set(groups.map((group) => group.id))
}, { immediate: true })

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function readText(value: unknown) {
  return String(value ?? '').trim()
}

function readId(entity: Record<string, unknown>) {
  return readText(entity.id)
}

function readName(entity: Record<string, unknown>) {
  return readText(entity.name) || t('common.unnamed')
}

function readEmoji(entity: Record<string, unknown>) {
  return readText(entity.emoji) || readName(entity).slice(0, 1) || '角'
}

function readAvatar(entity: Record<string, unknown>) {
  return readText(entity.avatarPath ?? entity.avatar_path)
}

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

function resolveGroupName(character: NamedEntity) {
  const groupId = readText(character.groupId ?? character.group_id)
  const group = characterGroups.value.find((item) => readId(item) === groupId)
  return group ? readName(group) : ''
}

function buildCharacterMeta(character: NamedEntity) {
  return [readText(character.gender), readText(character.age)].filter(Boolean).join(' ')
}

function buildCharacterPreview(character: NamedEntity) {
  return readText(character.desc)
    || readText(character.personality)
    || readText(character.background)
    || readText(character.speakingStyle ?? character.speaking_style)
}

function buildCharacterSearchText(character: NamedEntity, groupName: string) {
  return [
    readId(character),
    readName(character),
    groupName,
    buildCharacterPreview(character),
    readText(character.nicknames)
  ].join('\n').toLowerCase()
}

function isGroupOpen(id: string) {
  return openGroups.value.has(id)
}

function toggleGroup(id: string) {
  roleGroupsExpansionTouched.value = true
  const next = new Set(openGroups.value)
  next.has(id) ? next.delete(id) : next.add(id)
  openGroups.value = next
}

function openAddCharacter() {
  props.state.chatActions.openAddCharacter?.(undefined, { collapseSidebar: true })
}

function openCharacter(character: NamedEntity) {
  if (roleSelectionMode.value) {
    toggleRoleSelection(readId(character))
    return
  }
  selectedCharacterId.value = readId(character)
  activeSection.value = 'core'
  allOpen.value = null
  treeKey.value += 1
  pane.value = 'detail'
}

function enterRoleSelection(roleId: string) {
  if (!roleId) return
  selectedRoleIds.value = new Set([roleId])
}

function toggleRoleSelection(roleId: string) {
  if (!roleId) return
  const next = new Set(selectedRoleIds.value)
  next.has(roleId) ? next.delete(roleId) : next.add(roleId)
  selectedRoleIds.value = next
}

function clearRoleSelection() {
  selectedRoleIds.value = new Set()
}

function runRoleSelectionAction(actionId: string) {
  const ids = Array.from(selectedRoleIds.value)
  if (!ids.length) return
  if (actionId === 'open' && ids.length === 1) {
    const character = characters.value.find((item) => readId(item) === ids[0])
    clearRoleSelection()
    if (character) openCharacter(character)
    return
  }
  if (actionId === 'edit' && ids.length === 1) {
    const character = characters.value.find((item) => readId(item) === ids[0])
    clearRoleSelection()
    if (character) props.state.chatActions.openCharacterEditor?.(character)
    return
  }
  if (actionId === 'delete') {
    props.state.chatActions.deleteContacts?.(ids.map((id) => ({ kind: 'char' as const, id })))
    clearRoleSelection()
  }
}

function openCharacterEditor() {
  if (currentCharacter.value) props.state.chatActions.openCharacterEditor?.(currentCharacter.value)
}

function switchSection(section: string) {
  activeSection.value = section as RoleSection
  allOpen.value = null
  treeKey.value += 1
}

function onTreeLeaf(node: MobileSoneNode) {
  if (unitSelectionMode.value) {
    toggleUnitSelection(node)
    return
  }
  if (!node.leafId) return
  selectedUnitId.value = node.leafId
  unitMode.value = 'read'
  pane.value = 'unit'
}

function enterUnitSelection(node: MobileSoneNode) {
  if (!node.leafId) return
  selectedUnitIds.value = new Set([node.leafId])
}

function toggleUnitSelection(node: MobileSoneNode) {
  if (!node.leafId) return
  const next = new Set(selectedUnitIds.value)
  next.has(node.leafId) ? next.delete(node.leafId) : next.add(node.leafId)
  selectedUnitIds.value = next
}

function clearUnitSelection() {
  selectedUnitIds.value = new Set()
}

function runUnitSelectionAction(actionId: string) {
  const ids = Array.from(selectedUnitIds.value)
  if (!ids.length) return
  if (actionId === 'open' && ids.length === 1) {
    selectedUnitId.value = ids[0]
    unitMode.value = 'read'
    clearUnitSelection()
    pane.value = 'unit'
    return
  }
  if (actionId === 'edit' && ids.length === 1 && canEditSelectedUnit(ids[0])) {
    selectedUnitId.value = ids[0]
    unitMode.value = 'edit'
    clearUnitSelection()
    pane.value = 'unit'
    return
  }
  if (actionId === 'relation' && ids.length === 1) {
    selectedUnitId.value = ids[0]
    unitMode.value = 'relation'
    clearUnitSelection()
    pane.value = 'unit'
    return
  }
  if (actionId === 'copy-path') {
    void copyText(ids.map((id) => getUnitPath(id)).join('\n'))
    clearUnitSelection()
  }
}

function onGraphOpenUnit(unitId: string) {
  if (!unitId) return
  selectedUnitId.value = unitId
  unitMode.value = 'read'
}

function selectUnitMode(mode: string) {
  unitMode.value = mode as UnitMode
}

function canEditSelectedUnit(unitId = Array.from(selectedUnitIds.value)[0] || selectedUnitId.value) {
  const unit = unitById.value.get(unitId)
  return Boolean(unit) && (unit!.unitType === 'coreField' || unit!.unitType === 'soulNode') && unit!.contentKind === 'markdown'
}

async function onSaveUnit(content: string) {
  const character = currentCharacter.value
  const unit = selectedUnit.value
  if (!character || !unit?.sourceId || savingUnit.value) return
  savingUnit.value = true
  try {
    const changes = applyCharacterBrainCardDraft(character as unknown as Character, unit.sourceId, { documentContent: content })
    if (Object.keys(changes).length) {
      await characterStore.updateCharacter(readId(character), changes as Partial<Character>)
    }
  } finally {
    savingUnit.value = false
  }
}

function handleTreeAction(action: MobileTreeToolbarAction) {
  if (action === 'toggle-all') {
    allOpen.value = allOpen.value === true ? false : true
    treeKey.value += 1
  }
}

function isUnitFilled(unit: UnitView) {
  if (unit.status === 'pending') return false
  return Boolean(readText(unit.body) || readText(unit.compilePage?.summary))
}

function readUnitTag(unit: UnitView) {
  const raw = unit as unknown as Record<string, unknown>
  return readText(raw.dateLabel ?? raw.date ?? raw.tag)
}

function countSectionUnits(section: RoleSection) {
  const root = units.value.find((unit) => unit.unitType === section)
  if (!root) return 0
  let count = 0
  units.value.forEach((unit) => {
    if (unit.unitId !== root.unitId && isDescendantOf(unit, root.unitId)) count += 1
  })
  return count
}

function isDescendantOf(unit: UnitView, rootId: string) {
  let cursor = unit
  let guard = 0
  while (cursor.parentId && guard < 20) {
    if (cursor.parentId === rootId) return true
    const parent = unitById.value.get(cursor.parentId)
    if (!parent) return false
    cursor = parent
    guard += 1
  }
  return false
}

function sortUnitRows(a: UnitView, b: UnitView) {
  return (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || readUnitTitle(a).localeCompare(readUnitTitle(b), 'zh-CN')
}

function readUnitTitle(unit: UnitView | null) {
  return unit?.title || t('mobile.docWs.unnamedUnit')
}

function getUnitPath(unitId: string) {
  const unit = unitById.value.get(unitId)
  if (!unit) return unitId
  const titles: string[] = []
  let cursor: UnitView | undefined = unit
  let guard = 0
  while (cursor && guard < 16) {
    titles.unshift(readUnitTitle(cursor))
    cursor = cursor.parentId ? unitById.value.get(cursor.parentId) : undefined
    guard += 1
  }
  return [currentCharacterName.value, ...titles].join(' / ')
}

async function copyText(text: string) {
  const value = String(text || '').trim()
  if (!value) return
  await navigator.clipboard?.writeText(value)
}
</script>

<style scoped>
.mobile-role-workspace {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}

.mobile-role__icon-btn {
  display: inline-flex;
  width: 36px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mobile-role__go {
  color: var(--lhm-text-faint, #b6b0a7);
}

.mobile-role-search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 10px;
  background: var(--lhm-card, #fffdf8);
  color: var(--lhm-text-muted, #999);
  padding: 9px 12px;
}

.mobile-role-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--lhm-text, #333);
  font: inherit;
  font-size: 13px;
}

.mobile-role-search input::placeholder {
  color: var(--lhm-text-muted, #999);
}

.mobile-role-body,
.mobile-role-detail,
.mobile-unit {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

/* 成员行虚线挂在分组下 */
.mobile-role-members {
  position: relative;
  margin-left: 11px;
  padding-left: 13px;
  border-left: 1px dashed var(--lhm-tree-guide, rgba(120, 113, 98, 0.3));
}

.mobile-role-empty {
  color: var(--lhm-text-muted, #999);
  line-height: 1.7;
  padding: 16px 4px;
}

.mobile-role-detail {
  display: flex;
  flex-direction: column;
}

/* 单位阅读 */
.mobile-unit__edit {
  display: flex;
  min-height: calc(100dvh - 200px);
  flex: 1;
  flex-direction: column;
}

.mobile-unit__compile {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.mobile-unit__compile-label {
  color: var(--lhm-primary, #8b7355);
  font-size: 12.5px;
}

.mobile-unit__body :deep(p) {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.75;
  color: var(--lhm-text, #333);
}

.mobile-chip {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  padding: 3px 10px;
}

.mobile-chip--ok {
  background: rgba(92, 138, 92, 0.16);
  color: var(--lhm-accent, #5c8a5c);
}

.mobile-chip--warn {
  background: rgba(212, 168, 67, 0.18);
  color: #a07c1e;
}

.mobile-unit__relations {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

/* 复用桌面端力导向关系图（物理拖拽、Pointer Events 触控） */
.mobile-relation-graph {
  display: flex;
  min-height: 360px;
  height: calc(100dvh - 170px);
  margin: 0 -16px;
}

.mobile-relation-graph :deep(.role-relation-brain-view) {
  flex: 1;
  min-width: 0;
}
</style>
