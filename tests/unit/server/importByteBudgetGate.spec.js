import express from 'express'
import { describe, expect, it } from 'vitest'
import { createImportByteBudgetGate } from '../../../server/middleware/importByteBudgetGate'
import { createJsonBodyParser, handleJsonBodyParserError } from '../../../server/middleware/jsonBodyLimits'

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  try {
    return await callback(baseUrl)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

function buildApp(role, maxDailyBytes) {
  const app = express()
  app.use('/api/data', (req, _res, next) => {
    req.auth = { role, user: { id: 'user_1' } }
    next()
  }, createImportByteBudgetGate({
    maxDailyBytes,
    now: () => new Date('2026-05-17T00:00:00.000Z')
  }), createJsonBodyParser())
  app.put('/api/data/doc-library', (_req, res) => {
    res.json({ ok: true })
  })
  app.use(handleJsonBodyParserError)
  return app
}

function putLargeRoute(baseUrl, body) {
  return fetch(`${baseUrl}/api/data/doc-library`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body
  })
}

describe('import byte budget gate', () => {
  it('limits ordinary users by daily large-import bytes', async () => {
    const body = JSON.stringify({ value: '1234567890' })
    const maxDailyBytes = Buffer.byteLength(body) + 4
    await withServer(buildApp('user', maxDailyBytes), async (baseUrl) => {
      const first = await putLargeRoute(baseUrl, body)
      expect(first.status).toBe(200)

      const second = await putLargeRoute(baseUrl, body)
      expect(second.status).toBe(429)
      await expect(second.json()).resolves.toEqual(expect.objectContaining({
        code: 'IMPORT_DAILY_BYTES_LIMIT',
        maxDailyBytes
      }))
    })
  })

  it('applies the daily large-import bytes safety budget uniformly', async () => {
    const body = JSON.stringify({ value: '1234567890' })
    await withServer(buildApp('local', 1), async (baseUrl) => {
      const [first, second] = await Promise.all([
        putLargeRoute(baseUrl, body),
        putLargeRoute(baseUrl, body)
      ])
      expect([first.status, second.status]).toEqual([429, 429])
    })
  })
})
