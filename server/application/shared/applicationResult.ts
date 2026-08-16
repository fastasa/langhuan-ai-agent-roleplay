export type ApplicationResultStatus = 'completed' | 'failed'

export type ApplicationError = {
  code: string
  message: string
  details?: unknown
  retryable?: boolean
}

export type ApplicationResult<T> =
  | {
      ok: true
      status: 'completed'
      requestId: string
      data: T
      warnings?: string[]
      retryable?: boolean
    }
  | {
      ok: false
      status: 'failed'
      requestId: string
      error: ApplicationError
      warnings?: string[]
      retryable?: boolean
    }

function createRequestId(): string {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function applicationSuccess<T>(
  data: T,
  options: {
    requestId?: string
    warnings?: string[]
    retryable?: boolean
  } = {}
): ApplicationResult<T> {
  return {
    ok: true,
    status: 'completed',
    requestId: options.requestId || createRequestId(),
    data,
    warnings: options.warnings,
    retryable: options.retryable ?? false
  }
}

export function applicationFailure<T = never>(
  code: string,
  message: string,
  details?: unknown,
  options: {
    requestId?: string
    warnings?: string[]
    retryable?: boolean
  } = {}
): ApplicationResult<T> {
  return {
    ok: false,
    status: 'failed',
    requestId: options.requestId || createRequestId(),
    warnings: options.warnings,
    retryable: options.retryable ?? false,
    error: {
      code,
      message,
      details,
      retryable: options.retryable ?? false
    }
  }
}
