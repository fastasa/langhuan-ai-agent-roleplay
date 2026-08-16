/**
 * 服务端正式编排资料的纯展示与工具形状。
 * 本模块不读写缓存；UI、提调与人格执行层只共享这里的类型和渲染口径。
 */
export interface LastScenario {
  code: string
  label?: string
  summary?: string
}

export function renderDirectorPrefBlock(pref: string): string {
  const text = String(pref || '').trim()
  if (!text) return ''
  return [
    '【本会话编排倾向·用户强制偏好·优先级仅次于提调主纲领】',
    `本会话用户明确要求整体剧情走向与文风偏向：「${text}」。`,
    '这是用户对本会话下达的强制编排偏好，优先级**高于**情境 skill 的写法选择与你常规的剧情判断，**仅次于**提调主纲领本身。',
    '在不违背提调主纲领、角色既定设定与已确立世界事实的前提下，本轮一切情境判断、旁白安排与角色方向都必须主动贴合这一偏好；当情境 skill 写法或常规判断与该偏好冲突时，以该偏好为准。'
  ].join('\n')
}

export function renderLastScenarioBlock(last: LastScenario | null): string {
  const code = String(last?.code || '').trim()
  if (!code) return ''
  const label = String(last?.label || '').trim()
  const summary = String(last?.summary || '').trim()
  const name = label ? `「${label}」（code=${code}）` : `「${code}」`
  return [
    '【上一轮情境·承接判断·先判变没变】',
    `上一轮你判定的本场情境是${name}${summary ? `，当时小结：${summary}` : ''}。`,
    '请先判断这一轮情境是否仍是它：',
    `- 若场景延续（地点/时间/在场关系没有明显切换、用户也没有明显转场）：直接沿用 ${code} 这一情境，readScenarioSkill 仍读它的写法即可、不必另挑，保持本会话情境连贯；`,
    '- 若确有变化（换了地点 / 时间快进 / 转场 / 用户明显切到新场景）：大胆按新情境重判，不要为了省事僵在旧情境。'
  ].join('\n')
}
