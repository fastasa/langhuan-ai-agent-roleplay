import { AGENT_CONTEXT_PROJECTION_CATALOG } from '../../../shared/agentContextCatalog'

export function renderProjectionCatalogManual(): string {
  return [
    '【可获得信息与信息源手册】',
    '先判断资料层级，再选择工具。查不到、空范围、无权限和工具失败是四种不同结果；不得把“没搜到”写成“世界中不存在”。',
    ...AGENT_CONTEXT_PROJECTION_CATALOG.map((entry, index) => [
      `${index + 1}. ${entry.title}（${entry.kind}）`,
      `   是什么：${entry.meaning}`,
      `   真值归属：${entry.sourceOwner}`,
      `   空结果：${entry.emptyMeaning}`,
      `   读取失败：${entry.failureMeaning}`,
      ...(entry.detailTool ? [`   详情工具：${entry.detailTool}${entry.referenceFormat ? `；引用：${entry.referenceFormat}` : ''}`] : []),
      `   禁止：${entry.prohibitions.join('；')}`
    ].join('\n'))
  ].join('\n')
}
