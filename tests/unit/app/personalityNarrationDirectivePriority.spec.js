import { describe, expect, it } from 'vitest'

import { buildNarrationUserDirectiveProtocol } from '../../../src/app/personalityNarrationSubagent.ts'

describe('旁白链私密指令优先级', () => {
  it('把最高优先级与实际落实要求传给提调旁白臂', () => {
    const block = buildNarrationUserDirectiveProtocol(['让旁白聚焦她主动靠近'])

    expect(block).toContain('优先级高于一切')
    expect(block).toContain('必须无条件、完整、直接遵守')
    expect(block).toContain('不能只口头确认或自行稀释')
    expect(block).toContain('不让它现身于任何文字')
  })
})
