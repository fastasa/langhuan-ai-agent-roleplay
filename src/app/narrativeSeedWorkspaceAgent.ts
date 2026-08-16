import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import type { SubagentRunUsage } from './subagentRunStatus'
import { runSubagentLoop, SUBAGENT_LOOP_TIMEOUT_MS } from './subagentLoop'
import { assembleAgentSkillSupply } from './agentSupply'
import { createDispatchResearchTool } from './tidiaoGlobalTools'
import type { TidiaoResearchDispatchContext } from './tidiaoToolBusinessContext'
import { formatSubagentElapsed } from './subagentTimeoutPolicy'
import {
  NARRATIVE_SEED_AUTHOR_FIELDS,
  NARRATIVE_SEED_LINK_TYPES,
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES,
  pickNarrativeSeedAuthorFields,
  validateCompleteNarrativeSeedAuthoring
} from '../../shared/narrativeSeedAuthoring'

export type NarrativeSeedWorkspaceOperation = {
  action: 'create' | 'update' | 'delete'
  seedId?: string
  patch?: Record<string, unknown>
  summary: string
}
export const NARRATIVE_SEED_WORKSPACE_SUBAGENT_ID = 'narrative-seed-workspace'

export interface NarrativeSeedWorkspaceAgentResult {
  operations: NarrativeSeedWorkspaceOperation[]
  error?: string
  failure?: { kind: string; timeoutMs: number; elapsedMs: number; rawError: string }
}

type ModelCall = (request: {
  messages: Array<{ role:'system'|'user'|'assistant'|'tool'; content:string }>
  toolBriefs: Array<{ name:string; brief:string; schema?:Record<string,unknown> }>
  toolCatalog?: Array<{ name:string; brief:string; recommended:boolean }>
}) => Promise<{ content:string; toolCalls:unknown[]; usage?:SubagentRunUsage }>

const ALLOWED_FIELDS = new Set<string>(NARRATIVE_SEED_AUTHOR_FIELDS)
const CREATION_INTENT = /(?:制作|生成|建立|创建|开立|创作|设计|编排|做).{0,10}(?:剧本|种子|悬念|伏笔|倒计时|进程)|(?:剧本|种子).{0,10}(?:制作|生成|建立|创建|开立|创作|设计|编排|做)/u

const textSchema = (description:string) => ({ type:'string', description })
const patchSchema = {
  type:'object',
  additionalProperties:false,
  properties:{
    type:{type:'string',enum:[...NARRATIVE_SEED_TYPES],description:'必填。种子类型；伏笔=foreshadow，倒计时=countdown，幕后推进=offscreen_process，威胁/机会=threat_or_opportunity，承诺/债务=promise_or_debt，关系变化=relationship_change，世界变化=world_change。'},
    title:textSchema('必填。具体、可辨认的短标题；例如“钟楼地下的第二把钥匙”。'),
    description:textSchema('必填。当前局势、可接触的戏剧问题与边界；不写死玩家解法。'),
    cause:textSchema('必填。让种子成立的已发生事实、明确设定或来源因果。'),
    currentProgress:textSchema('必填。此刻已经推进到哪里；未推进也要明确写“尚未启动”，不得把计划写成已发生。'),
    expectedOutcome:textSchema('必填。种子未来可能兑现成什么变化；保持候选语气，不预写无人干预后果。'),
    startTime:textSchema('必填。开始进入判断的时点；优先 ISO 8601（如 2026-07-15T20:30:00+08:00），虚构历法则写完整世界内日期与时刻。超过后编剧依据现有字段现场判断。'),
    mapFeatureId:textSchema('必填键。只填写正式上下文已核实的地图要素 id；没有精确要素时显式填写空字符串。地图图纸 id 不由模型填写。'),
    locationText:textSchema('必填。严格使用“大地点/中地点/小地点”三段格式，例如“中国/上海/外滩钟楼”。'),
    impactScope:textSchema('必填。自由文本说明会影响的人物、关系、地点或世界状态；例如“外滩钟楼内人员、周边三条街及城市警戒状态”。'),
    status:{type:'string',enum:[...NARRATIVE_SEED_STATUSES],description:'必填。未发生但正在推进通常用 active；尚未启动用 dormant；ready_to_trigger 只由帷幕时间越界自动产生；不得无证据写 triggered/resolved。'},
    visibilityMode:{type:'string',enum:[...NARRATIVE_SEED_VISIBILITY_MODES],description:'必填。幕后秘密通常为 director_only；相关者知情为 participants；共同事实为 public；复杂差异才用 custom。'},
    allowFrontstage:{type:'boolean',description:'是否允许确定性取料进入前台角色上下文。'},
    participants:{
      type:'array',maxItems:100,description:'可选关联，不是创建门槛。只在确有角色/实体关联时填写；不要用空字符串或占位符。',
      items:{type:'object',additionalProperties:false,properties:{
        participantType:{type:'string',enum:[...NARRATIVE_SEED_PARTICIPANT_TYPES]},participantId:textSchema('正式角色/实体 id；freeform 可省略。'),displayName:textSchema('显示名；freeform 必填。'),relationRole:textSchema('在此种子中的作用。')
      },required:['participantType']}
    },
    links:{
      type:'array',maxItems:100,description:'只可引用【当前种子真值】中已存在的 targetSeedId；同批新建项之间先用 cause 描述因果。',
      items:{type:'object',additionalProperties:false,properties:{targetSeedId:textSchema('已存在的目标 seedId。'),relationType:{type:'string',enum:[...NARRATIVE_SEED_LINK_TYPES]}},required:['targetSeedId','relationType']}
    }
  }
} as const

function invalidSubmission(message:string, details:Record<string,unknown> = {}): ToolExecutionResult {
  return {
    content:`交稿未接收：${message}\n请按 submitNarrativeSeedChanges 的 schema 修正后在本次运行内重新提交；不要结束任务，也不要让上层重新派编剧。`,
    status:'error',
    error:{type:'INVALID_ARGUMENT',message,retryable:true,details}
  }
}

function normalizeSubmission(input:{
  operations:unknown
  seeds:Array<Record<string,unknown>>
  requiresCreation:boolean
  requiresResearch:boolean
  researchAttempted:boolean
}): {ok:true; operations:NarrativeSeedWorkspaceOperation[]}|{ok:false; message:string; details:Record<string,unknown>} {
  if (!Array.isArray(input.operations)) return {ok:false,message:'operations 必须是数组。',details:{path:'operations'}}
  if (input.operations.length > 12) return {ok:false,message:'单次最多提交 12 项变更。',details:{count:input.operations.length}}
  if (input.requiresResearch && !input.researchAttempted) {
    return {ok:false,message:'这是空世界的正式开本任务，必须先调用 dispatchResearch 完成至少一次采风，再依据回执交稿。',details:{path:'workflow.research'}}
  }
  if (input.requiresCreation && input.operations.length === 0) {
    return {ok:false,message:'当前世界没有种子且指令明确要求开本，不能提交空数组。',details:{path:'operations'}}
  }
  const ids = new Set(input.seeds.map((seed)=>String(seed.id||'')).filter(Boolean))
  const accepted:NarrativeSeedWorkspaceOperation[] = []
  for (let index=0; index<input.operations.length; index+=1) {
    const raw = input.operations[index] as Record<string,unknown> | null
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok:false,message:`operations[${index}] 必须是对象。`,details:{index}}
    const action=String(raw.action||'') as NarrativeSeedWorkspaceOperation['action']
    const seedId=String(raw.seedId||'').trim()
    const summary=String(raw.summary||'').trim().slice(0,500)
    if (!['create','update','delete'].includes(action)) return {ok:false,message:`operations[${index}].action 非法。`,details:{index,action}}
    if (!summary) return {ok:false,message:`operations[${index}].summary 不能为空。`,details:{index}}
    if (action!=='create'&&!ids.has(seedId)) return {ok:false,message:`operations[${index}] 引用了不存在的 seedId「${seedId||'空'}」。`,details:{index,seedId}}
    if (action==='delete') {
      accepted.push({action,seedId,summary})
      continue
    }
    if (!raw.patch || typeof raw.patch!=='object' || Array.isArray(raw.patch)) return {ok:false,message:`operations[${index}].patch 必须是对象，种子字段必须放在 patch 内。`,details:{index}}
    const source=raw.patch as Record<string,unknown>
    const unknownFields=Object.keys(source).filter((key)=>!ALLOWED_FIELDS.has(key))
    if (unknownFields.length) return {ok:false,message:`operations[${index}].patch 含不支持字段：${unknownFields.join('、')}。`,details:{index,unknownFields}}
    if (!Object.keys(source).length) return {ok:false,message:`operations[${index}].patch 不能为空。`,details:{index}}
    const patch=Object.fromEntries(Object.entries(source).filter(([key])=>ALLOWED_FIELDS.has(key)))
    const current = action === 'update' ? input.seeds.find((seed) => String(seed.id || '') === seedId) : null
    const finalSeed = action === 'create'
      ? patch
      : { ...pickNarrativeSeedAuthorFields(current || {}), ...patch }
    const completenessErrors = validateCompleteNarrativeSeedAuthoring(finalSeed)
    if (completenessErrors.length) {
      return {ok:false,message:`operations[${index}] 必填字段校验失败：${completenessErrors.join('；')}。`,details:{index,errors:completenessErrors}}
    }
    if (patch.participants!==undefined) {
      if (!Array.isArray(patch.participants)) return {ok:false,message:`operations[${index}].patch.participants 必须是数组或省略。`,details:{index}}
      for (const [participantIndex, participant] of patch.participants.entries()) {
        const row=participant as Record<string,unknown>
        const participantType=String(row?.participantType||'')
        if (!NARRATIVE_SEED_PARTICIPANT_TYPES.includes(participantType as typeof NARRATIVE_SEED_PARTICIPANT_TYPES[number])) return {ok:false,message:`operations[${index}].participants[${participantIndex}] 的 participantType 非法。`,details:{index,participantIndex}}
        if (participantType==='freeform'&&!String(row?.displayName||'').trim()) return {ok:false,message:`freeform 参与者必须提供 displayName。`,details:{index,participantIndex}}
        if (!['freeform','user'].includes(participantType)&&!String(row?.participantId||'').trim()) return {ok:false,message:`${participantType} 参与者必须提供 participantId。`,details:{index,participantIndex}}
      }
    }
    if (patch.links!==undefined) {
      if (!Array.isArray(patch.links)) return {ok:false,message:`operations[${index}].patch.links 必须是数组或省略。`,details:{index}}
      for (const [linkIndex, link] of patch.links.entries()) {
        const row=link as Record<string,unknown>
        const targetSeedId=String(row?.targetSeedId||'').trim()
        const relationType=String(row?.relationType||'')
        if (!ids.has(targetSeedId)||targetSeedId===seedId) return {ok:false,message:`operations[${index}].links[${linkIndex}] 必须指向当前世界另一个已存在种子。`,details:{index,linkIndex,targetSeedId}}
        if (!NARRATIVE_SEED_LINK_TYPES.includes(relationType as typeof NARRATIVE_SEED_LINK_TYPES[number])) return {ok:false,message:`operations[${index}].links[${linkIndex}] 的 relationType 非法。`,details:{index,linkIndex,relationType}}
      }
    }
    accepted.push({action,...(seedId?{seedId}:{}),patch,summary})
  }
  return {ok:true,operations:accepted}
}

export async function runNarrativeSeedWorkspaceAgent(input: {
  sessionId:string
  directive:string
  /** 由 scriptwriter_seed_workspace recipe 生成的统一原始可见上下文；不得由本 Agent 再手拼世界/帷幕/成员/近期聊天。 */
  contextBlock:string
  seeds:Array<Record<string,unknown>>
  research?:TidiaoResearchDispatchContext
  timeoutMs?:number
  callModel:ModelCall
}): Promise<NarrativeSeedWorkspaceAgentResult> {
  const contextBlock=String(input.contextBlock||'').trim()
  if(!contextBlock) throw new Error('NarrativeSeedWorkspaceAgent 缺少必需的统一 contextBlock')
  const skillAssembly=await assembleAgentSkillSupply({profileId:'scriptwriter.seed-workspace'})
  const holder:{ operations:NarrativeSeedWorkspaceOperation[]|null }={operations:null}
  let failure:NarrativeSeedWorkspaceAgentResult['failure']
  let researchAttempted=false
  const requiresCreation=input.seeds.length===0&&CREATION_INTENT.test(input.directive)
  const requiresResearch=requiresCreation&&Boolean(input.research)
  const submitTool:ToolDefinition={
    name:'submitNarrativeSeedChanges',
    brief:'原子提交世界叙事种子的精确增删改方案。任何一项不合法都会退回整份交稿并说明具体路径；修正后应在本次编剧运行内重交。',
    schema:{type:'object',additionalProperties:false,properties:{operations:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['create','update','delete']},seedId:{type:'string',description:'update/delete 必填，只能使用当前种子真值中的 id；create 省略。'},patch:patchSchema,summary:{type:'string',description:'本项修改的简短人类可读摘要。'}},required:['action','summary']}}},required:['operations']},
    execute:(call)=>{
      const normalized=normalizeSubmission({operations:call.args.operations,seeds:input.seeds,requiresCreation,requiresResearch,researchAttempted})
      if (!normalized.ok) return invalidSubmission(normalized.message,normalized.details)
      holder.operations=normalized.operations
      return {content:`种子变更方案已接收，共 ${holder.operations.length} 项。`,details:{count:holder.operations.length},status:'success'}
    }
  }
  const tools:ToolDefinition[]=[]
  if (input.research) {
    const researchTool=createDispatchResearchTool(input.research)
    tools.push({...researchTool,execute:async(call,ctx)=>{
      researchAttempted=true
      return researchTool.execute(call,ctx)
    }})
  }
  const workflow = [
    '【工作流与验收】',
    '1. 先列证据清单：帷幕、近期已发生事实、未兑现承诺/冲突、正式成员与知情边界；用户指令中的会话/成员判断不能覆盖机器真值。',
    requiresResearch ? '2. 本次是空世界正式开本，交稿前必须至少调用一次 dispatchResearch。优先钻取世界设定、当前场景历史、人物关系/承诺和未解决冲突；可拆成多个互不依赖的采风任务，并按工作量设置 timeoutMinutes。' : '2. 若上述证据不足以支撑世界设定、人物关系或幕后因果，先调用 dispatchResearch；资料充分时无需为流程而采风。',
    '3. 编排候选：主线悬念/危机、互动伏笔、幕后进程、倒计时、承诺或关系/世界变化必须各自有可追踪因果；不要把玩家唯一解法或结局写死。',
    '4. 交稿前逐字段自检：新建种子的 15 个模型字段一个都不能省略；mapFeatureId 无精确引用时填空字符串，participants/links 无条目时填 []，allowFrontstage 必须明确 true/false。地点严格写成“大地点/中地点/小地点”。',
    '5. 不写 unattendedOutcome、expectedTriggerTime、overdueTime、mapSheetId。开始时间一旦超过，由后续编剧根据现有因果、进展、预期结果、地点和影响范围现场判断；图纸由代码按目标会话世界绑定。',
    '6. 只调用 submitNarrativeSeedChanges 提交正式 operations。若工具退回缺失字段或格式错误，按星依给出的字段路径在本次运行内补齐重交；不得把退回当作完成。'
  ].join('\n')
  await runSubagentLoop({
    profileId:'scriptwriter.seed-workspace',skillAssembly,
    sessionId:input.sessionId,subagentId:`${NARRATIVE_SEED_WORKSPACE_SUBAGENT_ID}:${Date.now()}`,loggedInput:input.directive,presentation:{label:'编剧',icon:'clapperboard',runningVerb:'编剧中',title:'世界剧本种子变更'},agentName:'NarrativeSeedWorkspaceAgent',runtimeVersion:'narrative-seed-workspace-v3',
    messages:[{role:'system',content:[[
      '你是世界剧本叙事种子管理 Agent。世界级种子是唯一剧情因果真值，不写 arc、章节路线或 nextBeat。',
      '代码提供的【统一原始可见上下文】是会话、世界、帷幕和成员的机器真值；绝不能因为近期聊天没逐个点名或用户任务书写了“未知参与者”，就声称当前会话没有参与者。',
      '参与者是种子的可选关联，不是创建剧本的前置条件：成员清单非空时按需要关联；清单为空时仍可创建世界级、地点级或导演可见种子，不得要求用户另选角色或群聊。',
      '按用户指令精确修改字段；未要求的字段不要改。更新/删除只能引用给出的 seedId；新建只在现有种子无法承载时使用。',
      '当前种子为空且用户明确要求制作、生成或建立剧本时，必须基于统一上下文和采风证据创建可成立的种子，不能提交空数组后宣称完成。',
      input.research ? '采风超时回执必须原样理解：超时不等于没有资料。你应决定延长重派、缩小范围，或明确保留缺口继续编排；不得据此编造事实。' : '',
      '不得把计划当已发生事实；没有证据不要擅自设为 triggered/resolved。关系只使用 depends_on/conflicts_with/caused_by/transforms_into/replaces。',
      workflow
    ].filter(Boolean).join('\n'),skillAssembly.layers['0']].filter(Boolean).join('\n\n')},{role:'user',content:`【统一原始可见上下文】\n${contextBlock}\n【用户指令】${input.directive}`}],
    tools,submitTool,submitToolName:'submitNarrativeSeedChanges',isSubmitted:()=>holder.operations!==null,guardSubmitTerminate:true,nudgeId:'narrative-seed-workspace-submit',nudgeMaxCount:1,buildNudgeText:()=> requiresResearch&&!researchAttempted ? '先调用 dispatchResearch 完成开本采风，再按验收清单提交正式种子。' : requiresCreation ? '按验收清单创建正式种子并调用 submitNarrativeSeedChanges；当前空世界禁止空数组。' : '立即调用 submitNarrativeSeedChanges；仅在确实无需修改且已有种子可审时提交空数组。',submitTerminateId:'narrative-seed-workspace-done',submitTerminateSummary:'世界剧本种子变更已交稿',submitGrace:{submitToolName:'submitNarrativeSeedChanges',buildNudge:(_reason,failureHint)=> ['最后机会：只调用 submitNarrativeSeedChanges 交稿。',failureHint?`上次交稿退回原因：${failureHint}`:'',requiresCreation?'当前是正式开本，禁止空数组。':''].filter(Boolean).join('\n')},budget:{maxTurns:14,maxToolCalls:24},timeoutMs:input.timeoutMs ?? SUBAGENT_LOOP_TIMEOUT_MS,callModel:input.callModel,onNoSubmit:(reason,detail)=>{
      const rawError = reason === 'timeout'
        ? `编剧运行超时（时限 ${Math.max(1, Math.round(detail.timeoutMs / 60_000))} 分钟，已运行 ${formatSubagentElapsed(detail.elapsedMs)}）`
        : reason === 'aborted' ? '编剧运行被停止' : '编剧没有完成合法的 submitNarrativeSeedChanges 交稿'
      failure={kind:reason,timeoutMs:detail.timeoutMs,elapsedMs:detail.elapsedMs,rawError}
    },onCatchError:(message,detail)=>{
      const rawError=`编剧运行失败：${message}`
      failure={kind:'runtime-error',timeoutMs:detail.timeoutMs,elapsedMs:detail.elapsedMs,rawError}
    },buildEndPayload:()=>failure?{ok:false,error:failure.rawError}:{ok:true,output:`${holder.operations?.length||0} 项种子变更`}
  })
  return {operations:holder.operations||[],...(failure?{error:failure.rawError,failure}:{})}
}
