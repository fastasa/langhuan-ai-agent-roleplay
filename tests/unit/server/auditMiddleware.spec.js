import { describe, expect, it } from 'vitest'
import { sanitizeAuditValue } from '../../../server/middleware/audit'

describe('audit sanitizer', () => {
  it('redacts nested sensitive fields case-insensitively', () => {
    const sanitized = sanitizeAuditValue({
      safe: 'ok',
      request: {
        headers: {
          Authorization: 'Bearer secret-token',
          Cookie: 'langhuan_session=abc'
        },
        body: {
          apiKey: 'sk-secret',
          nested: {
            finalPrompt: 'private prompt',
            message: 'private message'
          }
        }
      }
    })

    expect(sanitized.safe).toBe('ok')
    expect(sanitized.request.headers.Authorization).toBe('[redacted]')
    expect(sanitized.request.headers.Cookie).toBe('[redacted]')
    expect(sanitized.request.body.apiKey).toBe('[redacted]')
    expect(sanitized.request.body.nested.finalPrompt).toBe('[redacted]')
    expect(sanitized.request.body.nested.message).toBe('[redacted]')
  })
})
