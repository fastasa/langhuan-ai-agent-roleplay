import { describe, expect, it } from 'vitest'
import {
  TIDIAO_RETRIEVAL_CONTRACTS,
  getTidiaoRetrievalContract,
  buildRetrievalDecision
} from '../../../src/app/tidiaoRetrievalContract.ts'
import { TIDIAO_TOOL_PACKAGES } from '../../../src/app/tidiaoScript.ts'

describe('提调取料工具契约（§4.5/§4.13）', () => {
  it('三件套齐全，kind 覆盖语义召回/文本搜索/定点读取', () => {
    expect(TIDIAO_RETRIEVAL_CONTRACTS.map((c) => c.kind)).toEqual(['semantic', 'textSearch', 'fetch'])
  })

  it('契约工具名与工具包 retrieval.tools 一一对应（不脱节）', () => {
    const retrievalPkg = TIDIAO_TOOL_PACKAGES.find((pkg) => pkg.id === 'retrieval')
    const contractNames = TIDIAO_RETRIEVAL_CONTRACTS.map((c) => c.toolName).sort()
    expect([...retrievalPkg.tools].sort()).toEqual(contractNames)
  })

  it('三件套全部只读（提调只读硬约束）', () => {
    for (const contract of TIDIAO_RETRIEVAL_CONTRACTS) {
      expect(contract.readOnly).toBe(true)
      expect(contract.whenToUse.length).toBeGreaterThan(0)
    }
  })

  it('getTidiaoRetrievalContract 按工具名取契约', () => {
    expect(getTidiaoRetrievalContract('searchWorldText').kind).toBe('textSearch')
    expect(getTidiaoRetrievalContract('fetchUnitDetail').kind).toBe('fetch')
    expect(getTidiaoRetrievalContract('不存在')).toBeNull()
  })

  it('buildRetrievalDecision 产出可写入剧本 retrieval 的决策，去空白', () => {
    expect(buildRetrievalDecision({ kind: 'fetch', query: '  大厅设定 ', reason: ' 角色不知屋内 ', hitSummary: ' 长桌旁老人 ' }))
      .toEqual({ kind: 'fetch', query: '大厅设定', reason: '角色不知屋内', hitSummary: '长桌旁老人' })
    // hitSummary 缺省时不带该字段
    expect(buildRetrievalDecision({ kind: 'semantic', query: '氛围', reason: '补气氛料' }))
      .toEqual({ kind: 'semantic', query: '氛围', reason: '补气氛料' })
  })
})
