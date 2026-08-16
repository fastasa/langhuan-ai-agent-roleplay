import { describe, it, expect } from 'vitest'
import { buildHuiyuResidentCoreSkillBody, loadHuiyuManualSections } from '@/app/agentKnowledge/huiyuKnowledge'

// 地图提速批（2026-07-12）：知识库披露拆两层——「核心速览」每轮常驻 system（本文件主断言），
// 「按需钻取」供 huiyuMapTools.readMapManual 消费（loadHuiyuManualSections，第二个 describe）。
describe('绘舆知识库·核心速览（常驻小核，提速批·2026-07-12）', () => {
  const block = buildHuiyuResidentCoreSkillBody()

  it('核心速览含头部标题', () => {
    expect(block).toContain('地图设计知识')
    expect(block).toContain('核心速览')
  })

  it('region/path/marker 全部类目仍出现在核心速览（住在类目白名单节·第二节）', () => {
    const regionCategories = [
      'mountain', 'forest', 'grass', 'plateau', 'water', 'urban',
      'hill', 'desert', 'swamp', 'ice', 'jungle', 'farmland'
    ]
    const pathCategories = ['river', 'road', 'street', 'wall', 'border', 'canal', 'trail', 'bridge']
    const markerCategories = [
      'building', 'organization', 'landmark', 'ferry', 'character',
      'capital', 'castle', 'temple', 'ruin', 'mine', 'cave', 'port', 'gate', 'inn', 'tower'
    ]
    for (const category of [...regionCategories, ...pathCategories, ...markerCategories]) {
      expect(block, `类目缺失：${category}`).toContain(category)
    }
  })

  it('核心速览含量级分级表（坐标系与比例常识节）关键内容', () => {
    expect(block).toContain('坐标系与比例常识')
    expect(block).toContain('大陆跨度')
    expect(block).toContain('50km 以上')
  })

  it('量级分级表含半径/跨度换算提醒（笔刷约束系统批B 事故对症·2026-07-12：真机曾把跨度数字原样填进 rxM 导致连续超限）', () => {
    expect(block).toContain('换算提醒')
    expect(block).toContain('跨度的一半')
    expect(block).toContain('rxM=10000')
    expect(block).toContain('丘陵：0.5~20km')
  })

  it('核心速览含探索范围铁律/自由创作准则/量级一致性与可见性铁律三节标题（第十节 2026-07-13 由「料不足铁律」改写为「自由创作准则」）', () => {
    expect(block).toContain('探索范围铁律')
    expect(block).toContain('自由创作准则')
    expect(block).toContain('量级一致性与可见性铁律')
  })

  it('核心速览含交稿前自查（auditMap）节', () => {
    expect(block).toContain('交稿前自查')
  })

  it('核心速览不含长篇手册章节正文', () => {
    expect(block).not.toContain('drawMountainChain')
    expect(block).not.toContain('drawRiverSystem')
    expect(block).not.toContain('drawCityLayout')
    expect(block).not.toContain('drawInterCityRoad')
    expect(block).not.toContain('ridgeWidthM')
    expect(block).not.toContain('由低到高分批拔升')
    expect(block).not.toContain('elevationM')
  })

  it('核心速览不含系统硬校验总览节正文（体检编号目录/硬门数值细节，代码违规时会就地给出，改列按需层）', () => {
    expect(block).not.toContain('MAP-1010')
    expect(block).not.toContain('落笔前立即拦')
  })

  it('核心速览不夹带按需手册目录或读取工具说明（目录只由 manifest layer 1 提供）', () => {
    expect(block).not.toContain('readMapManual')
    expect(block).not.toContain('十三、笔刷画法手册')
    expect(block).not.toContain('十四、宏笔刷')
    expect(block).not.toContain('画城结构法')
    expect(block).not.toContain('系统硬校验总览')
  })

  it('体量相对 33KB 全文注入大幅压缩（提速批目标）', () => {
    const bytes = Buffer.byteLength(block, 'utf8')
    expect(bytes).toBeGreaterThan(1000) // 不能是空块/退化块
    expect(bytes).toBeLessThan(16000) // 相对原 ~33KB 全文注入至少减半
  })

  it('过滤维护者行（# 一级标题与 > 说明行不注入）', () => {
    expect(block).not.toContain('维护提示')
    expect(block).not.toContain('真值源文')
  })
})

describe('绘舆知识库·按需钻取层（loadHuiyuManualSections，供 readMapManual 消费）', () => {
  const sections = loadHuiyuManualSections()

  it('只解析按需 Skill 的九个低频章节，常驻核心六节不重复', () => {
    expect(sections.length).toBe(9)
    const titles = sections.map((s) => s.title)
    expect(titles).toContain('十三、笔刷画法手册（每类目怎么画才对味·谓词化）')
    expect(titles).toContain('十四、宏笔刷（一笔生成一整套关联要素·长版手册）')
    expect(titles).toContain('十五、草案剪影清单画法（submitLayoutDraft 结构化产出·2026-07-12 地图草案剪影可视化计划）')
    expect(titles).toContain('三、系统硬校验总览（画错了系统会拦，不用你自己记着防）')
    expect(titles).not.toContain('二、category 词汇表（决定图层与配色·只能从这里选；画法要领见第十三节）')
    expect(titles).not.toContain('四、坐标系与比例常识（单位=米·画错尺度是最常见的失真）')
  })

  it('每个章节 body 含标题行本身且已过滤维护者行', () => {
    for (const section of sections) {
      expect(section.body).toContain(section.title)
      expect(section.body).not.toContain('维护提示')
    }
  })

  it('笔刷画法手册章节（按需层）含 elevationM 与由低到高分批拔升技巧——长篇细节原样保留，只是不再常驻', () => {
    const manual = sections.find((s) => s.title.startsWith('十三、'))
    expect(manual).toBeTruthy()
    expect(manual.body).toContain('elevationM')
    expect(manual.body).toContain('由低到高分批拔升')
  })

  it('宏笔刷章节（按需层）含四件宏笔刷全部名字', () => {
    const macro = sections.find((s) => s.title.startsWith('十四、'))
    expect(macro).toBeTruthy()
    for (const name of ['drawMountainChain', 'drawRiverSystem', 'drawCityLayout', 'drawInterCityRoad']) {
      expect(macro.body, `宏笔刷名缺失：${name}`).toContain(name)
    }
  })

  it('系统硬校验总览章节（按需层）含全部体检编号目录（MAP-10xx/11xx）', () => {
    const hardRules = sections.find((s) => s.title.startsWith('三、'))
    expect(hardRules).toBeTruthy()
    const auditCodes = ['MAP-1010', 'MAP-1020', 'MAP-1030', 'MAP-1040', 'MAP-1050', 'MAP-1060', 'MAP-1070', 'MAP-1080', 'MAP-1100', 'MAP-1110']
    for (const code of auditCodes) {
      expect(hardRules.body, `体检编号缺失：${code}`).toContain(code)
    }
  })

  it('不含已退役的散布符号/皮肤质感描述（防复活·覆盖全部按需章节）', () => {
    const wholeText = sections.map((s) => s.body).join('\n')
    expect(wholeText).not.toContain('符号自动播撒')
    expect(wholeText).not.toContain('涟漪纹理')
    expect(wholeText).not.toContain('城郭质感')
    expect(wholeText).not.toContain('山峰符号')
    expect(wholeText).not.toContain('边缘带立体崖线')
  })
})
