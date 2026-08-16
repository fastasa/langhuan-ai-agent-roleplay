import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const APPROVED_UNSCOPED_SQL_COUNTS = {
  'server/db.ts': 17,
  'server/repositories/characterRepository.ts': 6,
  'server/repositories/chatRepository.ts': 54,
  'server/repositories/docLibraryRepository.ts': 3,
  'server/repositories/personalityInferencePrefsRepository.ts': 2,
  'server/repositories/personalityTrainingRepository.ts': 3,
  'server/repositories/resourceRepository.ts': 4,
  'server/repositories/settingRepository.ts': 10,
  'server/repositories/taskRepository.ts': 3,
  'server/repositories/timerRepository.ts': 1,
  'server/repositories/uploadRepository.ts': 2,
  'server/repositories/workspaceMetaRepository.ts': 2,
  'server/repositories/workspaceSnapshot/restoreTasks.ts': 2,
  'server/repositories/workspaceSnapshotMigrationRepository.ts': 13
}

function toPosix(path) {
  return path.replace(/\\/g, '/')
}

function listTrackedServerFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'server'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

describe('unscoped SQL audit guard', () => {
  it('requires every unscoped SQL bypass to stay in the reviewed allowlist', () => {
    const actual = {}
    for (const file of listTrackedServerFiles()) {
      const text = readFileSync(file, 'utf8')
      const count = (text.match(/\/\* unscoped \*\//g) || []).length
      if (count) {
        actual[toPosix(file)] = count
      }
    }

    expect(actual).toEqual(APPROVED_UNSCOPED_SQL_COUNTS)
  })
})
