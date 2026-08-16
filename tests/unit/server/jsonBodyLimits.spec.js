import express from 'express'
import { describe, expect, it } from 'vitest'
import {
  createJsonBodyParser,
  DEFAULT_JSON_BODY_LIMIT,
  handleJsonBodyParserError,
  LARGE_JSON_BODY_LIMIT,
  MEDIUM_JSON_BODY_LIMIT,
  SMALL_JSON_BODY_LIMIT,
  shouldUseLargeJsonBodyLimit,
  shouldUseMediumJsonBodyLimit
} from '../../../server/middleware/jsonBodyLimits'

function request(method, originalUrl) {
  return { method, originalUrl, path: originalUrl }
}

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

function jsonRequest(baseUrl, path, body, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method || 'PUT',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body
  })
}

describe('json body limits', () => {
  it('keeps ordinary mutations on the small default JSON body limit', () => {
    expect(DEFAULT_JSON_BODY_LIMIT).toBe('256kb')
    expect(SMALL_JSON_BODY_LIMIT).toBe('256kb')
    expect(shouldUseLargeJsonBodyLimit(request('POST', '/api/ai/chat'))).toBe(false)
    expect(shouldUseLargeJsonBodyLimit(request('PUT', '/api/data/tasks/task_1'))).toBe(false)
    expect(shouldUseLargeJsonBodyLimit(request('POST', '/api/data/chat-sessions/session_1/recall-activity-logs'))).toBe(false)
    expect(shouldUseLargeJsonBodyLimit(request('GET', '/api/data/restore'))).toBe(false)
  })

  it('allows large JSON only on import, restore, avatar, and bulk document routes', () => {
    expect(LARGE_JSON_BODY_LIMIT).toBe('50mb')
    expect(shouldUseLargeJsonBodyLimit(request('PUT', '/api/data/restore'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('PUT', '/api/data/restore/partitions'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('POST', '/api/data/chat-archives/import'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('PUT', '/api/data/doc-library'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('POST', '/api/data/doc-library/import/sillytavern-worldbook/apply'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('PUT', '/api/data/user-profile'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('PUT', '/api/data/aliases/alias_1'))).toBe(true)
  })

  it('gives bounded media and large questionnaire snapshots a dedicated 15mb medium limit', () => {
    expect(MEDIUM_JSON_BODY_LIMIT).toBe('15mb')
    expect(shouldUseMediumJsonBodyLimit(request('POST', '/api/data/chat-images'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('POST', '/api/data/chat-images'))).toBe(false)
    expect(shouldUseMediumJsonBodyLimit(request('GET', '/api/data/chat-images'))).toBe(false)
    expect(shouldUseMediumJsonBodyLimit(request('POST', '/api/data/chat-sessions'))).toBe(false)
    expect(shouldUseMediumJsonBodyLimit(request('POST', '/api/data/chat-sessions/session_1/status-assets'))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('POST', '/api/data/chat-sessions/session_1/status-assets'))).toBe(false)
    expect(shouldUseMediumJsonBodyLimit(request('GET', '/api/data/chat-sessions/session_1/status-assets'))).toBe(false)
    const questionnairePath = '/api/data/characters/char_1/personality-training/datasets/dataset_1/questionnaire'
    expect(shouldUseMediumJsonBodyLimit(request('PUT', questionnairePath))).toBe(true)
    expect(shouldUseLargeJsonBodyLimit(request('PUT', questionnairePath))).toBe(false)
    expect(shouldUseMediumJsonBodyLimit(request('GET', questionnairePath))).toBe(false)
  })

  it('keeps ordinary local JSON requests under the 256kb limit', async () => {
    const app = express()
    app.use('/api/data', createJsonBodyParser())
    app.put('/api/data/tasks/task_1', (_req, res) => res.json({ ok: true }))
    app.use(handleJsonBodyParserError)

    await withServer(app, async (baseUrl) => {
      const body = JSON.stringify({ value: 'x'.repeat(300 * 1024) })
      const response = await jsonRequest(baseUrl, '/api/data/tasks/task_1', body)
      expect(response.status).toBe(413)
    })
  })

  it('allows local large-route JSON above the small limit', async () => {
    const app = express()
    app.use('/api/data', createJsonBodyParser())
    app.put('/api/data/doc-library', (req, res) => res.json({ ok: true, length: req.body.value.length }))
    app.use(handleJsonBodyParserError)

    await withServer(app, async (baseUrl) => {
      const body = JSON.stringify({ value: 'x'.repeat(300 * 1024) })
      const response = await jsonRequest(baseUrl, '/api/data/doc-library', body)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, length: 300 * 1024 })
    })
  })

  it('allows chat image uploads above the small limit but still enforces the 15mb medium cap', async () => {
    const app = express()
    app.use('/api/data', createJsonBodyParser())
    app.post('/api/data/chat-images', (req, res) => res.json({ ok: true, length: req.body.value.length }))
    app.use(handleJsonBodyParserError)

    await withServer(app, async (baseUrl) => {
      const okBody = JSON.stringify({ value: 'x'.repeat(2 * 1024 * 1024) })
      const okResponse = await jsonRequest(baseUrl, '/api/data/chat-images', okBody, { method: 'POST' })
      expect(okResponse.status).toBe(200)
      await expect(okResponse.json()).resolves.toEqual({ ok: true, length: 2 * 1024 * 1024 })

      const tooBigBody = JSON.stringify({ value: 'x'.repeat(16 * 1024 * 1024) })
      const tooBigResponse = await jsonRequest(baseUrl, '/api/data/chat-images', tooBigBody, { method: 'POST' })
      expect(tooBigResponse.status).toBe(413)
    })
  })

  it('accepts a multi-hundred-questionnaire snapshot above 256kb on only its save route', async () => {
    const app = express()
    app.use('/api/data', createJsonBodyParser())
    const path = '/api/data/characters/char_1/personality-training/datasets/dataset_1/questionnaire'
    app.put(path, (req, res) => res.json({ ok: true, length: req.body.value.length }))
    app.use(handleJsonBodyParserError)

    await withServer(app, async (baseUrl) => {
      const body = JSON.stringify({ value: 'x'.repeat(600 * 1024) })
      const response = await jsonRequest(baseUrl, path, body)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true, length: 600 * 1024 })
    })
  })
})
