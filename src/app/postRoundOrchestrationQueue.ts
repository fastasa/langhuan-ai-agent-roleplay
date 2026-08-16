import type {
  CreatePostRoundRunInput,
  PostRoundOrchestrationRun,
  PostRoundRunStatus
} from '../../shared/postRoundOrchestration'

export interface PostRoundQueueRepository {
  create(input: CreatePostRoundRunInput): Promise<PostRoundOrchestrationRun>
  listUnresolved(sessionId: string): Promise<PostRoundOrchestrationRun[]>
  transition(input: {
    sessionId: string
    runId: string
    status: Exclude<PostRoundRunStatus, 'pending'>
    errorStage?: string
    errorMessage?: string
    resultJson?: Record<string, unknown>
  }): Promise<PostRoundOrchestrationRun>
}

export interface PostRoundProcessorResult {
  operationCount: number
  messageIds: number[]
  details?: Record<string, unknown>
}

type Processor = (run: PostRoundOrchestrationRun) => Promise<PostRoundProcessorResult>

const sessionChains = new Map<string, Promise<void>>()

function enqueue(sessionId: string, task: () => Promise<void>): Promise<void> {
  const previous = sessionChains.get(sessionId) || Promise.resolve()
  const current = previous.catch(() => undefined).then(task)
  sessionChains.set(sessionId, current)
  const cleanup = () => {
    if (sessionChains.get(sessionId) === current) sessionChains.delete(sessionId)
  }
  void current.then(cleanup, cleanup)
  return current
}

async function executeRun(
  repository: PostRoundQueueRepository,
  run: PostRoundOrchestrationRun,
  processor: Processor
): Promise<void> {
  if (run.status === 'stopped' || run.status === 'succeeded') return
  await repository.transition({ sessionId: run.sessionId, runId: run.id, status: 'running' })
  try {
    const result = await processor(run)
    await repository.transition({
      sessionId: run.sessionId,
      runId: run.id,
      status: 'succeeded',
      resultJson: {
        operationCount: result.operationCount,
        messageIds: result.messageIds,
        ...(result.details || {})
      }
    })
  } catch (error) {
    const errorStage = String((error as { stage?: unknown })?.stage || 'post_round_processing')
    const errorMessage = error instanceof Error ? error.message : String(error)
    await repository.transition({
      sessionId: run.sessionId,
      runId: run.id,
      status: 'failed',
      errorStage,
      errorMessage
    })
    throw error
  }
}

export function createPostRoundOrchestrationQueue(repository: PostRoundQueueRepository) {
  return {
    schedule(input: CreatePostRoundRunInput, processor: Processor): Promise<void> {
      return enqueue(input.sessionId, async () => {
        const run = await repository.create(input)
        await executeRun(repository, run, processor)
      })
    },
    schedulePersisted(run: PostRoundOrchestrationRun, processor: Processor): Promise<void> {
      return enqueue(run.sessionId, () => executeRun(repository, run, processor))
    },
    recover(sessionId: string, processor: Processor): Promise<void> {
      return enqueue(sessionId, async () => {
        const runs = await repository.listUnresolved(sessionId)
        for (const run of runs) await executeRun(repository, run, processor)
      })
    },
    wait(sessionId: string): Promise<void> {
      return sessionChains.get(sessionId) || Promise.resolve()
    }
  }
}
