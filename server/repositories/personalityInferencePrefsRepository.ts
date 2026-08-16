import db from '../db.js'
import { LOCAL_WORKSPACE_ID } from '../localWorkspace.js'

export type PersonalityInferenceMode = 'auto' | 'local' | 'server'
export type PersonalityInferencePrefs = { serverAllowed: true; mode: PersonalityInferenceMode }

export function normalizePersonalityInferenceMode(value: unknown): PersonalityInferenceMode {
  const raw = String(value ?? '').trim().toLowerCase()
  return raw === 'local' || raw === 'server' ? raw : 'auto'
}

export function getPersonalityInferencePrefs(_scope?: string): PersonalityInferencePrefs {
  const row = db.prepare(
    '/* unscoped */ SELECT mode FROM personality_inference_preferences WHERE workspace_id = ?'
  ).get(LOCAL_WORKSPACE_ID) as { mode?: string } | undefined
  return { serverAllowed: true, mode: normalizePersonalityInferenceMode(row?.mode) }
}

export function setPersonalityInferenceMode(_scope: string, mode: unknown): PersonalityInferencePrefs {
  const normalized = normalizePersonalityInferenceMode(mode)
  db.prepare(`
    /* unscoped */ INSERT INTO personality_inference_preferences (workspace_id, mode, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(workspace_id) DO UPDATE SET mode = excluded.mode, updated_at = datetime('now')
  `).run(LOCAL_WORKSPACE_ID, normalized)
  return { serverAllowed: true, mode: normalized }
}
