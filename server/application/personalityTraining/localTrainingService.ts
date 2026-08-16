import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getActiveDataScope, withDataScope, type DataScope } from '../../localWorkspace.js'
import { personalityTrainingRepository } from '../../repositories/personalityTrainingRepository.js'
import { savePersonalityModelZip } from '../../repositories/personalityModelStorage.js'
import { buildTrainingExport, toJsonl, type TrainingExportResult } from './trainingDataExport.js'

type Row = Record<string, any>

// 本机训练编排（TrainingBackendAdapter 的 local 实现）：
// precheck（预检）/ prepareDataPackage（导出训练包）/ launch（启动训练）/ poll（查询任务）由路由层组合调用。
// 训练任务状态机真值：pending -> preparing -> running -> succeeded / failed；
// failureStage 固定落在 precheck / data_export / train / export_onnx / import_validation / interrupted / cancelled。

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const TRAINING_DATA_DIR = join(__dirname, '..', '..', 'data', 'personality-training')
const VENV_DIR = join(PROJECT_ROOT, '.local', 'personality-reranker', 'venv')
const VENV_PYTHON = process.platform === 'win32'
  ? join(VENV_DIR, 'Scripts', 'python.exe')
  : join(VENV_DIR, 'bin', 'python')
const TRAIN_SCRIPT = join(PROJECT_ROOT, 'scripts', 'train_personality_reranker_local.py')
const EXPORT_SCRIPT = join(PROJECT_ROOT, 'scripts', 'export_personality_reranker_onnx.py')
// 预检磁盘门槛：venv + 依赖 + 基底模型 + 训练产物的保守估计；只做下限提示，不写死硬件型号
const REQUIRED_DISK_BYTES = 3 * 1024 * 1024 * 1024
// 与 personalityTrainingAppService 的 MIN_FORMAL_TRAINING_GROUPS 联动：少于 60 组只能产出实验模型
const MIN_FORMAL_TRAINING_GROUPS = 60

export type PrecheckCheckRow = {
  id: 'python' | 'pytorch' | 'device' | 'disk' | 'deps'
  name: string
  state: 'ok' | 'fail' | 'skip' | 'warn'
  detail: string
}

export type PrecheckResult = {
  ok: boolean
  canTrain: boolean
  failureStage: string
  failureReason: string
  checks: PrecheckCheckRow[]
}

class PipelineError extends Error {
  stage: string
  constructor(stage: string, message: string) {
    super(message)
    this.stage = stage
  }
}

function text(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function safeRunDirName(runId: string) {
  return text(runId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function inScope<T>(scope: DataScope | null, run: () => T): T {
  return scope ? withDataScope(scope, run) : run()
}

function runCommandSync(command: string, args: string[], timeoutMs = 30000) {
  try {
    const result = spawnSync(command, args, {
      cwd: PROJECT_ROOT,
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf8'
    })
    return {
      ok: result.status === 0,
      stdout: text(result.stdout).trim(),
      stderr: text(result.stderr).trim(),
      error: result.error ? String(result.error.message || result.error) : ''
    }
  } catch (error) {
    return { ok: false, stdout: '', stderr: '', error: error instanceof Error ? error.message : String(error) }
  }
}

function findSystemPython(): { command: string; args: string[]; version: string } | null {
  const candidates: Array<{ command: string; args: string[] }> = process.platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }]
  for (const candidate of candidates) {
    const probe = runCommandSync(candidate.command, [...candidate.args, '--version'])
    if (probe.ok && /Python\s+3/i.test(`${probe.stdout} ${probe.stderr}`)) {
      return { ...candidate, version: (probe.stdout || probe.stderr).trim() }
    }
  }
  return null
}

function venvPythonVersion(): string {
  if (!existsSync(VENV_PYTHON)) return ''
  const probe = runCommandSync(VENV_PYTHON, ['--version'])
  return probe.ok ? (probe.stdout || probe.stderr).trim() : ''
}

function freeDiskBytes(): number | null {
  try {
    const stats = statfsSync(PROJECT_ROOT)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

function formatGb(bytes: number) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function runLocalPrecheck(): PrecheckResult {
  const checks: PrecheckCheckRow[] = []
  let failureStage = ''
  let failureReason = ''

  const venvVersion = venvPythonVersion()
  const systemPython = venvVersion ? null : findSystemPython()
  const pythonOk = Boolean(venvVersion || systemPython)
  checks.push({
    id: 'python',
    name: 'Python 运行环境',
    state: pythonOk ? 'ok' : 'fail',
    detail: venvVersion || systemPython?.version || '未找到 Python 3，请先安装并加入 PATH'
  })
  if (!pythonOk) {
    failureStage = 'precheck'
    failureReason = '未找到可用的 Python 3 运行环境'
  }

  let torchVersion = ''
  let torchState: PrecheckCheckRow['state'] = 'skip'
  let torchDetail = '待 Python 就绪后检测'
  if (venvVersion) {
    const probe = runCommandSync(VENV_PYTHON, ['-c', 'import torch; print(torch.__version__)'], 60000)
    if (probe.ok) {
      torchVersion = probe.stdout.split('\n').pop()?.trim() || ''
      torchState = 'ok'
      torchDetail = torchVersion
    } else {
      torchState = 'warn'
      torchDetail = '未安装，开始训练时将自动安装依赖（首次需数 GB 下载）'
    }
  } else if (pythonOk) {
    torchState = 'warn'
    torchDetail = '本地训练环境未创建，开始训练时将自动创建并安装依赖'
  }
  checks.push({ id: 'pytorch', name: 'PyTorch', state: torchState, detail: torchDetail })

  if (torchState === 'ok') {
    const probe = runCommandSync(VENV_PYTHON, ['-c', 'import torch; print("cuda" if torch.cuda.is_available() else "cpu")'], 60000)
    const device = probe.ok ? probe.stdout.split('\n').pop()?.trim() : ''
    checks.push({
      id: 'device',
      name: '计算设备',
      state: probe.ok ? 'ok' : 'warn',
      detail: device === 'cuda' ? 'CUDA 可用' : device === 'cpu' ? '仅 CPU（可训练，速度较慢）' : '检测失败，训练时按 CPU 处理'
    })
  } else {
    checks.push({ id: 'device', name: '计算设备', state: 'skip', detail: '待 PyTorch 就绪后检测' })
  }

  const free = freeDiskBytes()
  let diskOk = true
  if (free === null) {
    checks.push({ id: 'disk', name: '磁盘空间', state: 'warn', detail: '无法检测剩余空间，训练前请确认至少 3 GB 可用' })
  } else if (free < REQUIRED_DISK_BYTES) {
    diskOk = false
    checks.push({ id: 'disk', name: '磁盘空间', state: 'fail', detail: `可用 ${formatGb(free)} / 需要 ${formatGb(REQUIRED_DISK_BYTES)}` })
    if (!failureStage) {
      failureStage = 'precheck'
      failureReason = '磁盘剩余空间不足'
    }
  } else {
    checks.push({ id: 'disk', name: '磁盘空间', state: 'ok', detail: `可用 ${formatGb(free)} / 需要 ${formatGb(REQUIRED_DISK_BYTES)}` })
  }

  if (torchState === 'ok') {
    const probe = runCommandSync(VENV_PYTHON, ['-c', 'import sentence_transformers, datasets, accelerate, optimum.onnxruntime, onnxruntime; print("ok")'], 90000)
    checks.push({
      id: 'deps',
      name: '训练依赖',
      state: probe.ok ? 'ok' : 'warn',
      detail: probe.ok ? '全部就绪' : '部分依赖缺失，开始训练时将自动安装'
    })
  } else {
    checks.push({ id: 'deps', name: '训练依赖', state: torchState === 'warn' ? 'warn' : 'skip', detail: torchState === 'warn' ? '开始训练时将自动安装' : '待 PyTorch 就绪后检测' })
  }

  return {
    ok: !failureStage,
    canTrain: pythonOk && diskOk,
    failureStage,
    failureReason,
    checks
  }
}

// ---------- 训练任务管线 ----------

const activeRuns = new Map<string, { child: ChildProcess | null; cancelled: boolean }>()

function appendLog(logFile: string, line: string) {
  try {
    appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
  } catch {
    // 日志写失败不阻断训练
  }
}

function runStreaming(input: {
  runId: string
  command: string
  args: string[]
  logFile: string
  onEvent?: (event: Row) => void
}): Promise<{ events: Row[] }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const handle = activeRuns.get(input.runId)
    if (!handle || handle.cancelled) {
      rejectPromise(new PipelineError('cancelled', '训练已取消'))
      return
    }
    const child = spawn(input.command, input.args, { cwd: PROJECT_ROOT, windowsHide: true })
    handle.child = child
    const events: Row[] = []
    let stdoutBuffer = ''
    let failEvent: Row | null = null

    const consumeLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      appendLog(input.logFile, trimmed)
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as Row
          events.push(parsed)
          if (parsed.event === 'failed') failEvent = parsed
          input.onEvent?.(parsed)
        } catch {
          // 普通输出行
        }
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8')
      let index = stdoutBuffer.indexOf('\n')
      while (index >= 0) {
        consumeLine(stdoutBuffer.slice(0, index))
        stdoutBuffer = stdoutBuffer.slice(index + 1)
        index = stdoutBuffer.indexOf('\n')
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      appendLog(input.logFile, chunk.toString('utf8').trimEnd())
    })
    child.on('error', (error) => {
      handle.child = null
      rejectPromise(new PipelineError('train', `进程启动失败：${error.message}`))
    })
    child.on('close', (code) => {
      handle.child = null
      if (stdoutBuffer.trim()) consumeLine(stdoutBuffer)
      if (handle.cancelled) {
        rejectPromise(new PipelineError('cancelled', '训练已取消'))
        return
      }
      if (code === 0) {
        resolvePromise({ events })
        return
      }
      const failed = failEvent as Row | null
      rejectPromise(new PipelineError(
        text(failed?.stage, 'train'),
        text(failed?.message, `进程退出码 ${code}，完整原因见训练日志`)
      ))
    })
  })
}

async function ensurePythonEnvironment(runId: string, logFile: string, onProgress: (message: string) => void) {
  const free = freeDiskBytes()
  if (free !== null && free < REQUIRED_DISK_BYTES) {
    throw new PipelineError('precheck', `磁盘剩余空间不足（可用 ${formatGb(free)}，需要 ${formatGb(REQUIRED_DISK_BYTES)}）`)
  }

  if (!existsSync(VENV_PYTHON)) {
    const systemPython = findSystemPython()
    if (!systemPython) {
      throw new PipelineError('precheck', '未找到可用的 Python 3 运行环境，请先安装 Python 并加入 PATH')
    }
    onProgress('正在创建本地训练环境（venv）…')
    await runStreaming({
      runId,
      command: systemPython.command,
      args: [...systemPython.args, '-m', 'venv', VENV_DIR],
      logFile
    }).catch((error) => {
      throw new PipelineError('precheck', `创建 venv 失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }

  // sentence-transformers v3+ 的 CrossEncoder.fit 走 transformers Trainer：缺 datasets 或 accelerate 都会半途失败，必须一起装
  const depsProbe = runCommandSync(VENV_PYTHON, ['-c', 'import sentence_transformers, datasets, accelerate, optimum.onnxruntime, onnxruntime; print("ok")'], 90000)
  if (!depsProbe.ok) {
    onProgress('正在安装训练依赖（sentence-transformers / datasets / accelerate / optimum，首次需数 GB 下载）…')
    await runStreaming({
      runId,
      command: VENV_PYTHON,
      args: ['-m', 'pip', 'install', '-U', 'sentence-transformers', 'datasets', 'accelerate>=0.26.0', 'optimum[onnxruntime]'],
      logFile
    }).catch((error) => {
      throw new PipelineError('precheck', `安装训练依赖失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }
}

export function writeTrainingDataPackage(runDir: string, exportResult: TrainingExportResult) {
  mkdirSync(runDir, { recursive: true })
  const trainPath = join(runDir, 'train.jsonl')
  const validPath = join(runDir, 'valid.jsonl')
  writeFileSync(trainPath, toJsonl(exportResult.trainRows), 'utf8')
  writeFileSync(validPath, toJsonl(exportResult.validRows), 'utf8')
  writeFileSync(join(runDir, 'package_manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    evaluationPolicy: 'personality_evaluation_sets_only',
    stats: exportResult.stats
  }, null, 2)}\n`, 'utf8')
  return { trainPath, validPath }
}

export function startLocalTrainingPipeline(input: {
  characterId: string
  run: Row
  exportResult: TrainingExportResult
  parentVersionId: string
  sourceKind: string
}) {
  const scope = getActiveDataScope()
  const runId = text(input.run.runId)
  activeRuns.set(runId, { child: null, cancelled: false })
  void executePipeline(scope, input.characterId, runId, input.exportResult, input.parentVersionId, input.sourceKind)
}

async function executePipeline(
  scope: DataScope | null,
  characterId: string,
  runId: string,
  exportResult: TrainingExportResult,
  parentVersionId: string,
  sourceKind: string
) {
  const runDir = join(TRAINING_DATA_DIR, safeRunDirName(runId))
  mkdirSync(runDir, { recursive: true })
  const logFile = join(runDir, 'train.log')
  const relativeLogPath = `personality-training/${safeRunDirName(runId)}/train.log`
  const experimental = exportResult.stats.trainGroups + exportResult.stats.validGroups < MIN_FORMAL_TRAINING_GROUPS

  const baseMetrics: Row = {
    stats: exportResult.stats,
    experimental
  }
  const update = (patch: Row) => inScope(scope, () => personalityTrainingRepository.updateTrainingRun({
    characterId,
    runId,
    ...patch
  }))
  const progress = (stage: string, message: string) => {
    appendLog(logFile, `[stage] ${stage}: ${message}`)
    update({ metrics: { ...baseMetrics, progressStage: stage, progressMessage: message } })
  }

  try {
    update({ status: 'preparing', logPath: relativeLogPath, metrics: { ...baseMetrics, progressStage: 'precheck', progressMessage: '正在检查本地训练环境' } })

    await ensurePythonEnvironment(runId, logFile, (message) => progress('precheck', message))

    progress('data_export', '正在导出训练数据包')
    const { trainPath, validPath } = writeTrainingDataPackage(runDir, exportResult)

    update({ status: 'running', metrics: { ...baseMetrics, progressStage: 'train', progressMessage: '正在训练（合并数据集 -> 公开基底重训）' } })
    const modelDir = join(runDir, 'model')
    const modelZip = join(runDir, 'trained-model.zip')
    let validMetrics: Row = {}
    await runStreaming({
      runId,
      command: VENV_PYTHON,
      args: [
        TRAIN_SCRIPT,
        '--train', trainPath,
        '--valid', validPath,
        '--output-dir', modelDir,
        '--model-zip-out', modelZip
      ],
      logFile,
      onEvent: (event) => {
        if (event.event === 'stage') {
          progress('train', text(event.message))
        } else if (event.event === 'metrics' || event.event === 'done') {
          const source = event.event === 'done' ? (event.valid as Row | undefined) : event
          if (source) {
            validMetrics = {
              validGroupAccuracy: Number(source.top1) || 0,
              validGroupMrr: Number(source.mrr) || 0,
              validGroups: Number(source.groups) || 0
            }
          }
        }
      }
    })

    progress('export_onnx', '正在导出浏览器可加载的 ONNX 包')
    const bundleZip = join(runDir, 'onnx-bundle.zip')
    await runStreaming({
      runId,
      command: VENV_PYTHON,
      args: [
        EXPORT_SCRIPT,
        '--model-zip', modelZip,
        '--extract-dir', join(runDir, 'extract'),
        '--output-dir', join(runDir, 'onnx'),
        '--bundle-zip', bundleZip,
        '--refresh-model'
      ],
      logFile
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      throw new PipelineError('export_onnx', message)
    })

    update({ status: 'importing', metrics: { ...baseMetrics, ...validMetrics, progressStage: 'import_validation', progressMessage: '正在校验并导入模型包' } })
    if (!existsSync(bundleZip)) {
      throw new PipelineError('export_onnx', '未找到导出的 ONNX 包')
    }
    const buffer = readFileSync(bundleZip)
    const versionId = personalityTrainingRepository.createId('pmv')
    const saved = savePersonalityModelZip({
      characterId,
      versionId,
      buffer,
      originalFilename: `${safeRunDirName(runId)}-onnx.zip`
    })
    if (!saved.ok) {
      throw new PipelineError('import_validation', saved.error)
    }

    const versionMetrics: Row = {
      ...validMetrics,
      trainGroups: exportResult.stats.trainGroups,
      sourceRunId: runId,
      experimental
    }
    inScope(scope, () => personalityTrainingRepository.createModelVersion({
      versionId,
      characterId,
      parentVersionId,
      modelPath: saved.storedPath,
      status: 'trained',
      sourceKind,
      sourceDatasetIds: exportResult.stats.datasetIds,
      trainingBackend: 'local',
      metrics: versionMetrics
    }))

    update({
      status: 'succeeded',
      outputVersionId: versionId,
      metrics: { ...baseMetrics, ...validMetrics, progressStage: 'succeeded', progressMessage: '训练完成，已生成新版本（未安装）' }
    })
    appendLog(logFile, `succeeded: version ${versionId}`)
  } catch (error) {
    const stage = error instanceof PipelineError ? error.stage : 'train'
    const reason = error instanceof Error ? error.message : String(error)
    appendLog(logFile, `failed at ${stage}: ${reason}`)
    update({
      status: 'failed',
      failureStage: stage === 'cancelled' ? 'cancelled' : stage,
      failureReason: stage === 'cancelled' ? '用户取消了训练' : reason,
      metrics: { ...baseMetrics, progressStage: stage, progressMessage: reason }
    })
  } finally {
    activeRuns.delete(runId)
  }
}

export function cancelLocalTrainingRun(runId: string): boolean {
  const handle = activeRuns.get(text(runId))
  if (!handle) return false
  handle.cancelled = true
  const child = handle.child
  if (child?.pid) {
    if (process.platform === 'win32') {
      // Windows 下 kill 不会终止 python 子进程树，用 taskkill 整树清理
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
  }
  return true
}

export function readTrainingRunLog(logPath: string): string {
  const segments = text(logPath).replace(/^\/+/, '').split('/').filter(Boolean)
  if (segments[0] !== 'personality-training' || segments.length < 2) return ''
  const target = join(TRAINING_DATA_DIR, safeRunDirName(segments[1]), segments.slice(2).join('/') || 'train.log')
  try {
    return readFileSync(target, 'utf8')
  } catch {
    return ''
  }
}

export function getTrainingRunDir(runId: string): string {
  return join(TRAINING_DATA_DIR, safeRunDirName(runId))
}

// 服务启动清扫：上次进程留下的非终态训练任务一律标记失败，保证不悬空 running
try {
  personalityTrainingRepository.markInterruptedTrainingRuns()
} catch {
  // 数据库尚未就绪时跳过；首个训练接口调用前迁移已完成
}
