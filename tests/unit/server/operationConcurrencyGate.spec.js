import express from 'express'
import { describe, expect, it } from 'vitest'
import { createJsonBodyParser, handleJsonBodyParserError } from '../../../server/middleware/jsonBodyLimits'
import { createOperationConcurrencyGate } from '../../../server/middleware/operationConcurrencyGate'

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function postLargeRoute(baseUrl) {
  return fetch(`${baseUrl}/api/data/doc-library`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'ok' })
  })
}

function buildApp(role) {
  const app = express()
  app.use('/api/data', (req, _res, next) => {
    req.auth = { role, user: { id: 'user_1' } }
    next()
  }, createOperationConcurrencyGate({ maxConcurrent: 1 }), createJsonBodyParser())
  app.put('/api/data/doc-library', async (_req, res) => {
    await delay(100)
    res.json({ ok: true })
  })
  app.use(handleJsonBodyParserError)
  return app
}

describe('operation concurrency gate', () => {
  it('limits concurrent large operations for ordinary users', async () => {
    await withServer(buildApp('user'), async (baseUrl) => {
      const first = postLargeRoute(baseUrl)
      await delay(20)
      const second = await postLargeRoute(baseUrl)
      expect(second.status).toBe(429)
      await expect(second.json()).resolves.toEqual(expect.objectContaining({
        code: 'LARGE_OPERATION_CONCURRENCY_LIMIT',
        maxConcurrent: 1
      }))
      const firstResponse = await first
      expect(firstResponse.status).toBe(200)
    })
  })

  it('applies the large-operation concurrency cap uniformly', async () => {
    await withServer(buildApp('local'), async (baseUrl) => {
      const [first, second] = await Promise.all([
        postLargeRoute(baseUrl),
        postLargeRoute(baseUrl)
      ])
      expect(first.status).toBe(200)
      expect(second.status).toBe(429)
    })
  })
})
