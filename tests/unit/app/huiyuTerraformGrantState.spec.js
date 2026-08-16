import { beforeEach, describe, expect, it } from 'vitest'
import {
  HUIYU_TERRAFORM_GRANT_TTL_MS,
  clearHuiyuTerraformGrantsForTest,
  recordHuiyuTerraformGrant,
  reuseHuiyuTerraformGrant
} from '../../../src/app/huiyuTerraformGrantState.ts'

// terraform 系列级授权（提速批B·2026-07-12）：内存态·键=会话+世界·TTL 30 分钟滑动续期。
// 全部用例通过显式 now 参数控制时刻，不用 fake timers（模块函数为此带可选 now 形参）。

const T0 = new Date('2026-07-12T14:00:00').getTime()
const MIN = 60 * 1000

beforeEach(() => {
  clearHuiyuTerraformGrantsForTest()
})

describe('huiyuTerraformGrantState：记录与沿用', () => {
  it('record 后 reuse 命中，返回批准时刻 HH:MM 标签', () => {
    recordHuiyuTerraformGrant('session_1', 'world_1', T0)
    const grant = reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + 5 * MIN)
    expect(grant).toEqual({ grantedAtLabel: '14:00' })
  })

  it('未记录（用户点「不批准」路径不 record）→ reuse 返回 null', () => {
    expect(reuseHuiyuTerraformGrant('session_1', 'world_1', T0)).toBeNull()
  })

  it('键=会话+世界：不同世界不命中；不同会话不命中', () => {
    recordHuiyuTerraformGrant('session_1', 'world_1', T0)
    expect(reuseHuiyuTerraformGrant('session_1', 'world_2', T0 + MIN)).toBeNull()
    expect(reuseHuiyuTerraformGrant('session_2', 'world_1', T0 + MIN)).toBeNull()
    expect(reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + MIN)).toBeTruthy()
  })
})

describe('huiyuTerraformGrantState：TTL 30 分钟滑动续期', () => {
  it('TTL 内沿用有效；每次沿用刷新计时（29 分钟一次沿用可把有效期滑过原始 30 分钟窗口）', () => {
    recordHuiyuTerraformGrant('session_1', 'world_1', T0)
    // 29 分钟时沿用：有效，且滑动续期到 T0+29min+30min
    expect(reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + 29 * MIN)).toBeTruthy()
    // 58 分钟（超原始窗口 30min，但在滑动后的窗口内）：仍有效
    const slid = reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + 58 * MIN)
    expect(slid).toBeTruthy()
    // 标签始终是最初批准时刻，不随滑动变化
    expect(slid.grantedAtLabel).toBe('14:00')
  })

  it('超 TTL 未沿用即过期：reuse 返回 null 且清除条目（后续同键 reuse 恒 null 直到重新批准）', () => {
    recordHuiyuTerraformGrant('session_1', 'world_1', T0)
    expect(reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + 31 * MIN)).toBeNull()
    // 过期条目已删——即使拿早于过期点的 now 再问也不命中（条目没了）
    expect(reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + 5 * MIN)).toBeNull()
  })

  it('TTL 常量=30 分钟（口径断言，防误改）', () => {
    expect(HUIYU_TERRAFORM_GRANT_TTL_MS).toBe(30 * 60 * 1000)
  })

  it('重复批准=覆盖：新批准时刻标签+重新计时', () => {
    recordHuiyuTerraformGrant('session_1', 'world_1', T0)
    recordHuiyuTerraformGrant('session_1', 'world_1', T0 + 40 * MIN) // 旧授权已过期后再次批准
    const grant = reuseHuiyuTerraformGrant('session_1', 'world_1', T0 + 45 * MIN)
    expect(grant).toEqual({ grantedAtLabel: '14:40' })
  })
})
