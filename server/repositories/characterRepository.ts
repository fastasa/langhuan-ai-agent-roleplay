import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'

type CharacterDb = Pick<typeof db, 'prepare' | 'exec' | '_save'>

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

function ensureDefaultCharacterGroups(rows: Array<Record<string, any>>) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const hasDefault = normalizedRows.some((row) => String(row?.id || '').trim() === 'default')
  const nextRows = hasDefault
    ? normalizedRows
    : [{ id: 'default', name: '默认', emoji: '📁', orderIndex: 0, order_index: 0 }, ...normalizedRows]
  return nextRows
    .map(toCamel)
    .sort((a: Record<string, any>, b: Record<string, any>) => Number(a.orderIndex ?? a.order_index ?? 0) - Number(b.orderIndex ?? b.order_index ?? 0))
}

export function createCharacterRepository(database: CharacterDb = db) {
  const persist = () => {
    database._save()
  }
  const tableExists = (table: string) => Boolean(database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table))
  const deletePresenceForCharacter = (characterId: string) => {
    if (!tableExists('chat_session_character_presence') || !tableExists('chat_session_character_presence_events')) return
    const participantIds = (database.prepare(`
      SELECT id FROM chat_session_participants
      WHERE participant_type = 'char' AND participant_target_id = ?
    `).all(characterId) as Array<{ id?: string }>).map((row) => String(row.id || '')).filter(Boolean)
    participantIds.forEach((participantId) => {
      database.prepare('DELETE FROM chat_session_character_presence_events WHERE participant_id = ?').run(participantId)
      database.prepare('DELETE FROM chat_session_character_presence WHERE participant_id = ?').run(participantId)
    })
  }
  const getUserProfileRecord = () => (
    toCamel(database.prepare(`
      SELECT *
      FROM user_profile
      ORDER BY CASE WHEN id = 1 THEN 0 ELSE 1 END
      LIMIT 1
    `).get()) as Record<string, any> | null
  )
  const userProfileColumns = `
    name, gender, age, "desc", avatar_path, emoji,
    appearance, personality, outfit, hobbies, abilities,
    experience, worldview, background
  `
  const userProfilePlaceholders = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?'
  const insertUserProfile = (values: unknown[]) => {
    database.prepare(`
      INSERT INTO user_profile (${userProfileColumns})
      VALUES (${userProfilePlaceholders})
    `).run(...values)
  }
  const updateUserProfileById = (id: unknown, values: unknown[]) => {
    database.prepare(`
      UPDATE user_profile SET
        name = ?, gender = ?, age = ?, "desc" = ?, avatar_path = ?, emoji = ?,
        appearance = ?, personality = ?, outfit = ?, hobbies = ?, abilities = ?,
        experience = ?, worldview = ?, background = ?
      WHERE id = ?
    `).run(...values, id)
  }

  return {
    getCharacters() {
      return database.prepare('SELECT * FROM characters ORDER BY order_index').all().map(toCamel)
    },
    listCharacterAvatarPaths() {
      return database.prepare('SELECT id, avatar_path FROM characters WHERE avatar_path IS NOT NULL AND avatar_path != ?').all('') as Array<{ id?: string, avatar_path?: string }>
    },
    getCharacterById(id: string) {
      return toCamel(database.prepare('SELECT * FROM characters WHERE id = ?').get(id)) as Record<string, any> | null
    },
    insertCharacter(values: unknown[]) {
      database.prepare(`
        INSERT INTO characters (
          id, name, gender, age, emoji, avatar_path, group_id, "desc", appearance, outfit,
          personality, hobbies, abilities, experience, worldview, background, speaking_style,
          nicknames, default_preset, default_model, role_temperature, role_max_tokens, role_thinking, reply_pipeline_mode_override, schedule, yearly_schedule,
          current_activities, relationships, brain_links, brain_documents, brain_cognition_nodes, brain_trace_nodes, brain_trajectory_meta, brain_pinned_offsets, brain_node_positions, brain_candidate_changes, affection, locations, order_index, personality_kernel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...values)
      persist()
    },
    updateCharacter(id: string, values: unknown[]) {
      database.prepare(`
        UPDATE characters SET
          name = ?, gender = ?, age = ?, emoji = ?, avatar_path = ?, group_id = ?, "desc" = ?, appearance = ?, outfit = ?,
          personality = ?, hobbies = ?, abilities = ?, experience = ?, worldview = ?, background = ?, speaking_style = ?,
          nicknames = ?, default_preset = ?, default_model = ?, role_temperature = ?, role_max_tokens = ?, role_thinking = ?, reply_pipeline_mode_override = ?, schedule = ?, yearly_schedule = ?,
          current_activities = ?, relationships = ?, brain_links = ?, brain_documents = ?, brain_cognition_nodes = ?, brain_trace_nodes = ?, brain_trajectory_meta = ?, brain_pinned_offsets = ?, brain_node_positions = ?, brain_candidate_changes = ?, affection = ?, locations = ?, order_index = ?, personality_kernel = ?
        WHERE id = ?
      `).run(...values, id)
      persist()
    },
    deleteCharacter(id: string) {
      database.exec('BEGIN')
      try {
        deletePresenceForCharacter(id)
        database.prepare(`
          UPDATE chat_session_participants
          SET character_state_mode = 'follow_main', character_branch_id = ''
          WHERE participant_type = 'char' AND participant_target_id = ?
        `).run(id)
        database.prepare('DELETE FROM chat_session_character_branches WHERE character_id = ?').run(id)
        database.prepare('DELETE FROM character_snapshots WHERE character_id = ?').run(id)
        database.prepare('DELETE FROM characters WHERE id = ?').run(id)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      persist()
    },
    deleteContactsBatch(items: Array<{ kind: 'char' | 'group' | 'crowd'; id: string }>) {
      const statements = {
        char: database.prepare('DELETE FROM characters WHERE id = ?'),
        group: database.prepare('DELETE FROM groups WHERE id = ?'),
        crowd: database.prepare('DELETE FROM crowds WHERE id = ?')
      }
      const resetParticipantState = database.prepare(`
        UPDATE chat_session_participants
        SET character_state_mode = 'follow_main', character_branch_id = ''
        WHERE participant_type = 'char' AND participant_target_id = ?
      `)
      const deleteCharacterBranches = database.prepare('DELETE FROM chat_session_character_branches WHERE character_id = ?')
      const deleteCharacterSnapshots = database.prepare('DELETE FROM character_snapshots WHERE character_id = ?')
      database.exec('BEGIN')
      try {
        items.forEach((item) => {
          if (item.kind === 'char') {
            deletePresenceForCharacter(item.id)
            resetParticipantState.run(item.id)
            deleteCharacterBranches.run(item.id)
            deleteCharacterSnapshots.run(item.id)
          }
          statements[item.kind].run(item.id)
        })
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      persist()
    },
    updateCharacterAvatarPath(id: string, avatarPath: string) {
      database.prepare('UPDATE characters SET avatar_path = ? WHERE id = ?').run(avatarPath, id)
      persist()
    },
    // 状态栏绑定字段写穿透（character.appearance 唯一真值仍在 characters 表，状态栏不复制第二份）
    patchCharacterAppearance(id: string, appearance: string) {
      database.prepare('UPDATE characters SET appearance = ? WHERE id = ?').run(appearance, id)
      persist()
    },
    updateCharacterPersonalityModelPath(id: string, modelPath: string) {
      database.prepare('UPDATE characters SET personality_model_path = ? WHERE id = ?').run(modelPath, id)
      persist()
    },
    patchCharacterBrainTrace(id: string, payload: { brainTraceNodes?: unknown; brainTrajectoryMeta?: unknown }) {
      const updates: string[] = []
      const values: unknown[] = []
      if (payload.brainTraceNodes !== undefined) {
        updates.push('brain_trace_nodes = ?')
        values.push(typeof payload.brainTraceNodes === 'string' ? payload.brainTraceNodes : JSON.stringify(payload.brainTraceNodes || []))
      }
      if (payload.brainTrajectoryMeta !== undefined) {
        updates.push('brain_trajectory_meta = ?')
        values.push(typeof payload.brainTrajectoryMeta === 'string' ? payload.brainTrajectoryMeta : JSON.stringify(payload.brainTrajectoryMeta || {}))
      }
      if (!updates.length) return false
      database.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values, id)
      persist()
      return true
    },
    patchCharacterBrainCognition(id: string, payload: { brainCognitionNodes?: unknown; brainDocuments?: unknown }) {
      const updates: string[] = []
      const values: unknown[] = []
      if (payload.brainCognitionNodes !== undefined) {
        updates.push('brain_cognition_nodes = ?')
        values.push(typeof payload.brainCognitionNodes === 'string' ? payload.brainCognitionNodes : JSON.stringify(payload.brainCognitionNodes || []))
      }
      if (payload.brainDocuments !== undefined) {
        updates.push('brain_documents = ?')
        values.push(typeof payload.brainDocuments === 'string' ? payload.brainDocuments : JSON.stringify(payload.brainDocuments || {}))
      }
      if (!updates.length) return false
      database.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values, id)
      persist()
      return true
    },
    getCharacterGroupById(id: string) {
      if (id === 'default') {
        return { id: 'default', name: '默认', emoji: '📁', orderIndex: 0 }
      }
      return toCamel(database.prepare('SELECT * FROM character_groups WHERE id = ?').get(id)) as Record<string, any> | null
    },
    getCharacterGroups() {
      return ensureDefaultCharacterGroups(database.prepare('SELECT * FROM character_groups ORDER BY order_index').all() as Array<Record<string, any>>)
    },
    insertCharacterGroup(id: string, name: string, emoji: string, orderIndex: number) {
      database.prepare('INSERT INTO character_groups (id, name, emoji, order_index) VALUES (?, ?, ?, ?)').run(id, name, emoji, orderIndex)
      persist()
    },
    replaceCharacterGroups(rows: Array<{
      id: string
      name: string
      emoji: string
      orderIndex: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM character_groups WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare('INSERT INTO character_groups (id, name, emoji, order_index) VALUES (?, ?, ?, ?)')
      rows.forEach((row) => {
        stmt.run(row.id, row.name, row.emoji, row.orderIndex)
      })
      database.prepare(`INSERT OR IGNORE INTO character_groups (id, name, emoji, order_index) VALUES ('default', '默认', '👤', 0)`).run()
      persist()
    },
    updateCharacterGroup(id: string, name: string, emoji: string, orderIndex: number) {
      database.prepare('UPDATE character_groups SET name = ?, emoji = ?, order_index = ? WHERE id = ?').run(name, emoji, orderIndex, id)
      persist()
    },
    patchCharacterGroup(id: string, fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) return false
      database.prepare(`UPDATE character_groups SET ${updates.join(', ')} WHERE id = ?`).run(...values, id)
      persist()
      return true
    },
    deleteCharacterGroup(id: string) {
      database.prepare('DELETE FROM character_groups WHERE id = ?').run(id)
      persist()
    },
    getGroupById(id: string) {
      return toCamel(database.prepare('SELECT * FROM groups WHERE id = ?').get(id)) as Record<string, any> | null
    },
    getGroups() {
      return database.prepare('SELECT * FROM groups ORDER BY order_index').all().map(toCamel)
    },
    insertGroup(id: string, name: string, emoji: string, avatarPath: string, members: string, orderIndex: number) {
      database.prepare(`
        INSERT INTO groups (id, name, emoji, avatar_path, members, order_index)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, emoji, avatarPath, members, orderIndex)
      persist()
    },
    replaceGroups(rows: Array<{
      id: string
      name: string
      emoji: string
      avatarPath: string
      members: string
      orderIndex: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM groups WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare('INSERT INTO groups (id, name, emoji, avatar_path, members, order_index) VALUES (?, ?, ?, ?, ?, ?)')
      rows.forEach((row) => {
        stmt.run(row.id, row.name, row.emoji, row.avatarPath, row.members, row.orderIndex)
      })
      persist()
    },
    updateGroup(id: string, name: string, emoji: string, avatarPath: string, members: string, orderIndex: number) {
      database.prepare(`
        UPDATE groups
        SET name = ?, emoji = ?, avatar_path = ?, members = ?, order_index = ?
        WHERE id = ?
      `).run(name, emoji, avatarPath, members, orderIndex, id)
      persist()
    },
    patchGroup(id: string, fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) return false
      database.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...values, id)
      persist()
      return true
    },
    deleteGroup(id: string) {
      database.prepare('DELETE FROM groups WHERE id = ?').run(id)
      persist()
    },
    getCrowdById(id: string) {
      return toCamel(database.prepare('SELECT * FROM crowds WHERE id = ?').get(id)) as Record<string, any> | null
    },
    getCrowds() {
      return database.prepare('SELECT * FROM crowds').all().map(toCamel)
    },
    insertCrowd(id: string, name: string, members: string, defaultPreset: string) {
      database.prepare('INSERT INTO crowds (id, name, members, default_preset) VALUES (?, ?, ?, ?)').run(id, name, members, defaultPreset)
      persist()
    },
    replaceCrowds(rows: Array<{
      id: string
      name: string
      members: string
      defaultPreset: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM crowds WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare('INSERT INTO crowds (id, name, members, default_preset) VALUES (?, ?, ?, ?)')
      rows.forEach((row) => {
        stmt.run(row.id, row.name, row.members, row.defaultPreset)
      })
      persist()
    },
    updateCrowd(id: string, name: string, members: string, defaultPreset: string) {
      database.prepare('UPDATE crowds SET name = ?, members = ?, default_preset = ? WHERE id = ?').run(name, members, defaultPreset, id)
      persist()
    },
    patchCrowd(id: string, fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) return false
      database.prepare(`UPDATE crowds SET ${updates.join(', ')} WHERE id = ?`).run(...values, id)
      persist()
      return true
    },
    deleteCrowd(id: string) {
      database.prepare('DELETE FROM crowds WHERE id = ?').run(id)
      persist()
    },
    getAliasById(id: string) {
      return toCamel(database.prepare('SELECT * FROM aliases WHERE id = ?').get(id)) as Record<string, any> | null
    },
    getAliases() {
      return database.prepare('SELECT * FROM aliases').all().map(toCamel)
    },
    insertAlias(row: {
      id: string
      name: string
      gender: string
      age: string
      desc: string
      affections: string
      avatarPath?: string
      emoji?: string
      appearance?: string
      personality?: string
      outfit?: string
      hobbies?: string
      abilities?: string
      experience?: string
      worldview?: string
      background?: string
    }) {
      database.prepare(`
        INSERT INTO aliases (
          id, name, gender, age, "desc", affections, avatar_path, emoji,
          appearance, personality, outfit, hobbies, abilities, experience,
          worldview, background
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.name, row.gender, row.age, row.desc, row.affections,
        row.avatarPath ?? '', row.emoji ?? '', row.appearance ?? '',
        row.personality ?? '', row.outfit ?? '', row.hobbies ?? '',
        row.abilities ?? '', row.experience ?? '', row.worldview ?? '',
        row.background ?? ''
      )
      persist()
    },
    replaceAliases(rows: Array<{
      id: string
      name: string
      gender: string
      age: string
      desc: string
      affections: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM aliases WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO aliases (
          id, name, gender, age, "desc", affections, avatar_path, emoji,
          appearance, personality, outfit, hobbies, abilities, experience,
          worldview, background
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id, row.name, row.gender, row.age, row.desc, row.affections,
          (row as any).avatarPath ?? (row as any).avatar_path ?? '',
          (row as any).emoji ?? '',
          (row as any).appearance ?? '',
          (row as any).personality ?? '',
          (row as any).outfit ?? '',
          (row as any).hobbies ?? '',
          (row as any).abilities ?? '',
          (row as any).experience ?? '',
          (row as any).worldview ?? '',
          (row as any).background ?? ''
        )
      })
      persist()
    },
    updateAlias(id: string, name: string, gender: string, age: string, desc: string, affections: string) {
      database.prepare('UPDATE aliases SET name = ?, gender = ?, age = ?, "desc" = ?, affections = ? WHERE id = ?').run(name, gender, age, desc, affections, id)
      persist()
    },
    patchAlias(id: string, fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) return false
      database.prepare(`UPDATE aliases SET ${updates.join(', ')} WHERE id = ?`).run(...values, id)
      persist()
      return true
    },
    deleteAlias(id: string) {
      database.prepare('DELETE FROM aliases WHERE id = ?').run(id)
      persist()
    },
    getUserProfile() {
      return getUserProfileRecord()
    },
    getBrainNeurons() {
      return database.prepare('SELECT * FROM brain_neurons ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC').all().map(toCamel)
    },
    replaceBrainNeurons(rows: Array<{
      brainNeuronId: string
      neuronKind: string
      displayPath: string
      title: string
      summary: string
      tags: string
      sourceDocumentIds: string
      relatedNeuronIds: string
      content: string
      versionState: string
      createdAt: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM brain_neurons WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO brain_neurons (
          brain_neuron_id, neuron_kind, display_path, title, summary, tags,
          source_document_ids, related_neuron_ids, content, version_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.brainNeuronId, row.neuronKind, row.displayPath, row.title, row.summary, row.tags,
          row.sourceDocumentIds, row.relatedNeuronIds, row.content, row.versionState, row.createdAt, row.updatedAt
        )
      })
    },
    updateUserProfile(values: unknown[]) {
      const current = getUserProfileRecord()
      if (current?.id !== undefined && current?.id !== null) {
        updateUserProfileById(current.id, values)
      } else {
        insertUserProfile(values)
      }
      persist()
    },
    replaceUserProfile(values: unknown[]) {
      const current = getUserProfileRecord()
      if (current?.id !== undefined && current?.id !== null) {
        updateUserProfileById(current.id, values)
      } else {
        insertUserProfile(values)
      }
      persist()
    },
    patchUserProfile(fields: Record<string, unknown>) {
      const updates: string[] = []
      const values: unknown[] = []
      for (const [column, value] of Object.entries(fields)) {
        updates.push(`${column} = ?`)
        values.push(value)
      }
      if (!updates.length) return false
      const current = getUserProfileRecord()
      if (current?.id === undefined || current?.id === null) {
        const profileValues = Array.from({ length: 14 }, () => '')
        const fieldIndexes: Record<string, number> = {
          name: 0,
          gender: 1,
          age: 2,
          '"desc"': 3,
          desc: 3,
          avatar_path: 4,
          emoji: 5,
          appearance: 6,
          personality: 7,
          outfit: 8,
          hobbies: 9,
          abilities: 10,
          experience: 11,
          worldview: 12,
          background: 13
        }
        Object.entries(fields).forEach(([column, value]) => {
          const index = fieldIndexes[column]
          if (index !== undefined) profileValues[index] = value
        })
        insertUserProfile(profileValues)
        persist()
        return true
      }
      database.prepare(`UPDATE user_profile SET ${updates.join(', ')} WHERE id = ?`).run(...values, current.id)
      persist()
      return true
    },
    replaceCharacters(rows: unknown[][]) {
      database.prepare('/* unscoped */ DELETE FROM characters WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO characters (
          id, name, gender, age, emoji, avatar_path, group_id, "desc", appearance, outfit,
          personality, hobbies, abilities, experience, worldview, background, speaking_style,
          nicknames, default_preset, default_model, role_temperature, role_max_tokens, role_thinking, reply_pipeline_mode_override, schedule, yearly_schedule,
          current_activities, relationships, brain_links, brain_documents, brain_cognition_nodes, brain_trace_nodes, brain_trajectory_meta, brain_pinned_offsets, brain_node_positions, brain_candidate_changes, affection, locations, order_index, personality_kernel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((values) => {
        stmt.run(...values)
      })
      persist()
    }
  }
}

export const characterRepository = createCharacterRepository()
