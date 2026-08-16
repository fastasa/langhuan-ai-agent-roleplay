import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workbenchSource = readFileSync(
  resolve(process.cwd(), 'src/components/app/modals/character/personalityTraining/PersonalityTrainingWorkbench.vue'),
  'utf8'
)
const quizSource = readFileSync(
  resolve(process.cwd(), 'src/components/app/modals/character/personalityTraining/PtwQuizPanel.vue'),
  'utf8'
)
const questionAuthorSource = readFileSync(
  resolve(process.cwd(), 'src/app/personalityQuestionAuthorSubagent.ts'),
  'utf8'
)
const parentRecoverySource = readFileSync(
  resolve(process.cwd(), 'src/app/personalityQuestionAuthorParentRecovery.ts'),
  'utf8'
)

describe('PersonalityTrainingWorkbench 鉴心与设问工作区契约', () => {
  it('挂载角色级独立 WorkspaceAgentShell', () => {
    expect(workbenchSource).toContain('<WorkspaceAgentShell')
    expect(workbenchSource).toContain('agent-kind="personality_trainer"')
    expect(workbenchSource).toContain(':scope-key="personalityTrainerViewScopeKey"')
    expect(workbenchSource).toContain(':runner="personalityTrainerRunner"')
    expect(workbenchSource).toContain(':active="open"')
    expect(workbenchSource).toContain('v-model:collapsed="personalityTrainerCollapsed"')
    expect(workbenchSource).toContain("'ptw__agent--collapsed': personalityTrainerCollapsed")
    expect(workbenchSource).toContain('class="ptw__agent-expand"')
    expect(workbenchSource).toContain('@click="personalityTrainerCollapsed = false"')
    expect(workbenchSource).toMatch(/\.ptw__agent--collapsed\s*\{[^}]*width:\s*0;[^}]*flex-basis:\s*0;/s)
  })

  it('左栏可拖动且不挤回旧窄问卷', () => {
    expect(workbenchSource).toContain("storageKey: 'langhuan_personality_training_agent_width'")
    expect(workbenchSource).toContain('defaultWidth: 340')
    expect(workbenchSource).toContain('minWidth: 280')
    expect(workbenchSource).toContain('maxWidth: 500')
    expect(workbenchSource).toMatch(/\.ptw-step--quiz\s*\{[^}]*max-width:\s*1200px/s)
    expect(quizSource).toMatch(/\.ptw-quiz\s*\{[^}]*max-width:\s*none/s)
  })

  it('关闭工作台不从组件卸载钩子取消后台出题或评测', () => {
    const unmountBlock = workbenchSource.match(/onBeforeUnmount\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
    expect(unmountBlock).not.toContain('cancelPersonalityTrainingBackgroundTask')
    expect(unmountBlock).not.toContain('cancelTrainingRun')
    expect(workbenchSource).toContain('runPersonalityTrainingBackgroundTask')
  })

  it('鉴心派遣正式设问子 Agent，停止主 loop 后仍向原会话写后台回报', () => {
    expect(workbenchSource).toContain('runPersonalityQuestionAuthorSubagent')
    expect(workbenchSource).toContain('workerAgentName: PERSONALITY_QUESTION_AUTHOR_AGENT_NAME')
    expect(workbenchSource).toContain('appendWorkspaceAgentBackgroundMessage')
    expect(workbenchSource).toContain('notificationSessionId')
    expect(workbenchSource).toContain('activeJianxinTurnSessionId = sessionId')
    expect(workbenchSource).toContain('registerAbortController: false')
    expect(questionAuthorSource).toContain('【设问后台回报】')
  })

  it('设问终态回报会自动唤醒鉴心，定向续派最多一次且有模型未调用工具的兜底', () => {
    expect(workbenchSource).toContain('scheduleJianxinQuestionAuthorRecovery')
    expect(workbenchSource).toContain('runJianxinQuestionAuthorRecovery')
    expect(workbenchSource).toContain("mode !== 'resume'")
    expect(workbenchSource).toContain('automaticRecoveryDepth: context.decision.nextRecoveryDepth')
    expect(workbenchSource).toContain('context.decision.fallbackCorrectionBrief')
    expect(workbenchSource).toContain("usageLabel: '鉴心(设问后台接续)'")
    expect(parentRecoverySource).toContain('JIANXIN_QUESTION_AUTHOR_MAX_AUTO_REDISPATCHES = 1')
    expect(parentRecoverySource).toContain('qualityViolations')
  })

  it('复盘是推荐项，明确总目标按剩余题量一次派遣而不固定拆成 20 题', () => {
    expect(workbenchSource).not.toContain('最近一轮还没有正式复盘，不能追加下一轮')
    expect(workbenchSource).not.toContain('拒绝重复追加')
    expect(workbenchSource).toContain('allowPlannedBatchContinuation')
    expect(workbenchSource).toContain('isPersonalityQuestionBatchConfirmation')
    expect(parentRecoverySource).toContain('复盘也只是推荐项')
    expect(parentRecoverySource).toContain('startPersonalityQuestionBatch')
    expect(workbenchSource).toContain('startQuestionBatch(questionCount)')
    expect(workbenchSource).toContain("agentMode: 'append_batch'")
  })

  it('设问续跑或自动纠错成功后不再用空对象或派遣时旧快照覆盖人工答案', () => {
    expect(workbenchSource).not.toContain('answersAtDispatch')
    expect(workbenchSource).not.toMatch(/const cleared = options\.extensionDraft/)
    expect(workbenchSource).not.toMatch(/saveDatasetAnswers\(characterId,\s*datasetId,\s*answersAtDispatch\)/)
    expect(workbenchSource).toContain('dataset: workingDataset')
    expect(workbenchSource).toContain('明确 restart 时只在任务开始前清空一次')
    expect(workbenchSource).toContain("allowClearConfirmed: true")
    expect(workbenchSource).toContain("clearReason: 'restart_current'")
  })

  it('移除标题下的人格排序评审说明', () => {
    expect(workbenchSource).not.toContain('人格排序评审：读取情境与候选计划')
    expect(workbenchSource).not.toMatch(/<AppModalShell[\s\S]*?subtitle=/)
  })

  it('移除重复的弹窗顶层标题，并把关闭按钮下移到工作区首行', () => {
    expect(workbenchSource).not.toContain(':title="`人格模型训练')
    expect(workbenchSource).toContain(':show-close="false"')
    expect(workbenchSource).toContain('body-flush')
    expect(workbenchSource).toContain('class="ptw__workspace-close"')
    expect(workbenchSource).toContain('aria-label="关闭人格模型训练"')
    expect(workbenchSource).toMatch(/\.ptw__workspace-close\s*\{[^}]*position:\s*absolute;[^}]*top:\s*10px;[^}]*right:\s*12px;/s)
  })

  it('答题区可自由前后切换，未人工选择时使用预设代选且不再提供跳过', () => {
    expect(quizSource).toContain('预设代选')
    expect(quizSource).toContain('@click="next">下一题</button>')
    expect(quizSource).toContain("event.key === 'ArrowRight'")
    expect(quizSource).not.toContain('跳过此题')
    expect(quizSource).not.toContain("(e: 'skip'")
    expect(workbenchSource).not.toContain('@skip="onAnswerSkip"')
    expect(workbenchSource).not.toContain('@skip="onEvalSkip"')
  })

  it('轮次摘要与答题面板同时显示，不会因为已有轮次而把题目藏掉', () => {
    expect(workbenchSource).toContain('<div v-if="latestCalibrationRound" class="ptw__banner ptw__banner--info ptw__round-summary">')
    expect(workbenchSource).not.toMatch(/<PtwQuizPanel\s+v-else\s+:groups="questionGroupsForView"/)
    expect(workbenchSource).toMatch(/ptw__round-summary[\s\S]*?<\/div>\s*<PtwQuizPanel\s+:groups="questionGroupsForView"/)
  })

  it('出题维度可从前三题展开全部，并展示三个选项及人工或预设选择来源', () => {
    expect(workbenchSource).toContain('visibleDimensionQuestions(dim)')
    expect(workbenchSource).toContain('expandedDimensionQuestions[dim.name]')
    expect(workbenchSource).toContain('展开全部 ${dim.count} 题')
    expect(workbenchSource).toContain('item.group.candidates')
    expect(workbenchSource).toContain('resolvedDimensionAnswer(item.group)?.candidateId === candidate.id')
    expect(workbenchSource).toContain("'人工选择' : '预设代选'")
  })

  it('冻结评测题在出题后即可检查和编辑，评测后逐题对照标准答案与模型答案', () => {
    expect(workbenchSource).toContain("evalQuizOpen ? '收起冻结评测题' : '检查冻结评测题'")
    expect(workbenchSource).toContain('@edit-question="onEvalQuestionEdit"')
    expect(workbenchSource).toContain('@edit-candidate="onEvalCandidateEdit"')
    expect(workbenchSource.match(/standard-answer-mode/g)).toHaveLength(2)
    expect(workbenchSource).toContain('标准答案 · {{ result.expectedSource')
    expect(workbenchSource).toContain('模型实际答案')
    expect(workbenchSource).toContain("result.hit ? '模型选对了' : '模型未选中标准答案'")
    expect(workbenchSource).toContain("result.hit ? '与标准答案一致' : '与标准答案不一致'")
    expect(workbenchSource).toContain('evaluationQuestionResults: result.questionResults')
    expect(workbenchSource).toContain('按约一半性能逐题运行')
  })
})
