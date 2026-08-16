import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanPublicSafety } from '../../../scripts/check-public-safety.mjs'

let tempDir

function writeAsset(relativePath, content) {
  const filePath = path.join(tempDir, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

function rulesFor(relativePath) {
  const result = scanPublicSafety(relativePath, { cwd: tempDir })
  return result.issues.map((issue) => issue.rule)
}

describe('public asset safety scanner', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'langhuan-public-safety-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('allows synthetic demo chat samples', () => {
    writeAsset('public/demo/synthetic-sample.json', JSON.stringify({
      sample_type: 'synthetic',
      source: 'generated-demo',
      conversation_id: 'demo-conversation-001',
      model: 'demo-model',
      messages: [
        { role: 'user', content: 'synthetic text' }
      ]
    }))

    expect(scanPublicSafety('public', { cwd: tempDir }).ok).toBe(true)
  })

  it('rejects real summary sample paths', () => {
    writeAsset('public/summary-samples/real-chat-sample.json', JSON.stringify({
      source_file: 'chat.json',
      target_id: 'abc',
      messages: []
    }))

    expect(rulesFor('public')).toEqual(expect.arrayContaining([
      'summary-samples-path',
      'real-json-name',
      'source-file-marker',
      'target-id-marker'
    ]))
  })

  it('rejects source map markers', () => {
    writeAsset('dist/assets/app.js', 'console.log("ok")\n//# sourceMappingURL=app.js.map\n')

    expect(rulesFor('dist')).toContain('source-map-marker')
  })

  it('rejects environment files', () => {
    writeAsset('public/.env', 'SECRET_KEY="abcdef1234567890"\n')

    expect(rulesFor('public')).toEqual(expect.arrayContaining([
      'env-file',
      'secret-like-content'
    ]))
  })

  it('rejects database logs and archives', () => {
    writeAsset('dist/data/app.sqlite', '')
    writeAsset('dist/logs/runtime.log', '')
    writeAsset('dist/backups/site.zip', '')

    expect(rulesFor('dist')).toEqual(expect.arrayContaining([
      'data-file',
      'archive-file'
    ]))
  })

  it('rejects non-synthetic chat-like samples', () => {
    writeAsset('public/examples/chat-sample.json', JSON.stringify({
      model: 'real-model-name',
      messages: [
        { role: 'assistant', content: 'chat text' }
      ]
    }))

    expect(rulesFor('public')).toContain('non-synthetic-sample')
  })
})
