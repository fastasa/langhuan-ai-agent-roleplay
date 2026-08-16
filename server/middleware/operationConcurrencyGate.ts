import type { NextFunction, Request, Response } from 'express'
import { shouldUseLargeJsonBodyLimit } from './jsonBodyLimits.js'
import { LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'

export const DEFAULT_LARGE_OPERATION_CONCURRENCY_LIMIT = 5

type OperationConcurrencyGateOptions = {
  maxConcurrent?: number
}

export function createOperationConcurrencyGate(options: OperationConcurrencyGateOptions = {}) {
  const maxConcurrent = Math.max(1, Math.floor(Number(options.maxConcurrent || DEFAULT_LARGE_OPERATION_CONCURRENCY_LIMIT)))
  const runningByUser = new Map<string, number>()

  return (req: Request, res: Response, next: NextFunction) => {
    if (!shouldUseLargeJsonBodyLimit(req)) {
      next()
      return
    }

    const userKey = LOCAL_WORKSPACE_USER_ID

    const running = runningByUser.get(userKey) || 0
    if (running >= maxConcurrent) {
      res.status(429).json({
        error: '当前本地工作区同时运行的大任务较多，请稍后再试',
        code: 'LARGE_OPERATION_CONCURRENCY_LIMIT',
        maxConcurrent
      })
      return
    }

    runningByUser.set(userKey, running + 1)
    let released = false
    const release = () => {
      if (released) return
      released = true
      const nextRunning = Math.max(0, (runningByUser.get(userKey) || 1) - 1)
      if (nextRunning > 0) {
        runningByUser.set(userKey, nextRunning)
      } else {
        runningByUser.delete(userKey)
      }
    }
    res.once('finish', release)
    res.once('close', release)
    next()
  }
}
