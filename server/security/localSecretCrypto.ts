import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const SECRET_FILE = join(DATA_DIR, '.local-secret')

function readOrCreateInstallSecret(): string {
  const fromEnv = String(process.env.LANGHUAN_LOCAL_SECRET || '').trim()
  if (fromEnv) return fromEnv
  mkdirSync(DATA_DIR, { recursive: true })
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, 'utf8').trim()
  const generated = randomBytes(32).toString('base64url')
  writeFileSync(SECRET_FILE, `${generated}\n`, { encoding: 'utf8', mode: 0o600 })
  return generated
}

export function getLocalSecret(env: NodeJS.ProcessEnv = process.env) {
  const raw = String(env.LANGHUAN_LOCAL_SECRET || '').trim() || readOrCreateInstallSecret()
  return createHash('sha256').update(raw).digest()
}

export function assertLocalSecret(): void {
  void getLocalSecret()
}

export function encryptApiSecret(value: string, env: NodeJS.ProcessEnv = process.env) {
  const plain = String(value || '')
  if (!plain) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getLocalSecret(env), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptApiSecret(value: string, env: NodeJS.ProcessEnv = process.env) {
  const raw = String(value || '')
  if (!raw) return ''
  if (!raw.startsWith('v1:')) return ''
  const [, ivRaw, tagRaw, encryptedRaw] = raw.split(':')
  try {
    const decipher = createDecipheriv('aes-256-gcm', getLocalSecret(env), Buffer.from(ivRaw, 'base64'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final()
    ]).toString('utf8')
  } catch {
    return ''
  }
}
