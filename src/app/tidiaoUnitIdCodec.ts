/**
 * 提调取料 unitId 短码映射协议。
 *
 * 背景：文档库**文件夹**单位的 unitId 由中文路径编码派生（`doc-tree:~2F~E4~BA~9A…`），又长又乱；
 * 模型在检索结果里看到后回抄给 fetchUnitDetail 时极易抄错一个字节 → 精确匹配失败 →「未找到该单位」。
 * 文档单位（`doc:doc-<时间戳>`）天生短，不受影响。
 *
 * 方案：只在提调检索接缝（tidiaoRetrievalContextFactory）做一层「短码 ↔ 真实 unitId」映射——
 * - 出口：喂给模型的命中条目里，脏 id（含 `~` 编码字节）替换成 `u#<哈希短码>`；干净 id 原样透传。
 * - 入口：fetchUnitDetail 收到 id 先解码（短码 → 真实 unitId），非短码原样放行（模型从别处
 *   抄来的真实 id 依然可用，协议向后兼容）。
 * - 短码从真实 unitId **确定性哈希**派生（FNV-1a → base36），跨轮/跨会话稳定：资料池、决策流
 *   留痕里存的短码在后续轮次重建映射后仍能解析，不需要任何持久化，零迁移、不碰 langhuan.db。
 *
 * 联动能力：与关系整合材料的 `u1..u9999` 临时代号（compactRelationMarkdown）同属「给模型看的
 * 临时短 id」范式，但那套是导出场景的顺序编号、本套是检索场景的内容哈希，互不共享实现。
 */

export interface TidiaoUnitIdCodec {
  /** 出口：真实 unitId → 模型可见 id（脏 id 换短码，干净 id 原样）。 */
  encode(unitId: string): string
  /** 入口：模型给的 id → 真实 unitId（短码还原，非短码原样放行）。 */
  decode(inputId: string): string
}

const SHORT_CODE_PREFIX = 'u#'
const SHORT_CODE_PATTERN = /^u#[0-9a-z]{4,}$/

/** 是否长得像本协议的短码（`u#` + base36）。 */
export function isTidiaoUnitShortCode(value: string): boolean {
  return SHORT_CODE_PATTERN.test(String(value || '').trim())
}

/** 需要短码别名的脏 id：含 `~` 编码字节（路径编码派生的文件夹 unitId 特征）。 */
export function needsTidiaoUnitIdAlias(unitId: string): boolean {
  return String(unitId || '').includes('~')
}

/** FNV-1a 32 位（确定性、无依赖；对同一 unitId 永远同码）。 */
function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 双种子 64 位近似哈希 → base36 短码体（约 12-13 字符，碰撞概率可忽略）。 */
function buildShortCodeBody(unitId: string): string {
  const high = fnv1a32(unitId, 0x811c9dc5)
  const low = fnv1a32(unitId, 0x9747b28c)
  return `${high.toString(36)}${low.toString(36)}`
}

/**
 * 造一个映射器：别名表从 listUnitIds() 惰性构建（首个 encode/decode 才真算）。
 * 短码确定性来自内容哈希；万一同表内哈希碰撞（概率可忽略），后来者链式加盐重哈希，
 * 双方（encode/decode）用同一张表构建，仍一致。
 */
export function createTidiaoUnitIdCodec(listUnitIds: () => string[]): TidiaoUnitIdCodec {
  let aliasByUnitId: Map<string, string> | null = null
  let unitIdByAlias: Map<string, string> | null = null
  const ensureMaps = () => {
    if (aliasByUnitId && unitIdByAlias) return
    aliasByUnitId = new Map()
    unitIdByAlias = new Map()
    for (const raw of listUnitIds()) {
      const unitId = String(raw || '')
      if (!unitId || !needsTidiaoUnitIdAlias(unitId) || aliasByUnitId.has(unitId)) continue
      let alias = `${SHORT_CODE_PREFIX}${buildShortCodeBody(unitId)}`
      while (unitIdByAlias.has(alias) && unitIdByAlias.get(alias) !== unitId) {
        alias = `${SHORT_CODE_PREFIX}${buildShortCodeBody(`${unitId}\u0000${alias}`)}`
      }
      aliasByUnitId.set(unitId, alias)
      unitIdByAlias.set(alias, unitId)
    }
  }
  return {
    encode(unitId: string): string {
      const id = String(unitId || '')
      if (!needsTidiaoUnitIdAlias(id)) return id
      ensureMaps()
      return aliasByUnitId!.get(id) || id
    },
    decode(inputId: string): string {
      const id = String(inputId || '').trim()
      if (!isTidiaoUnitShortCode(id)) return id
      ensureMaps()
      return unitIdByAlias!.get(id) || id
    }
  }
}
