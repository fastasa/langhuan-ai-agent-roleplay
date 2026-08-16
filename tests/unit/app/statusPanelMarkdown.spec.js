import { describe, expect, it } from 'vitest'
import {
  renderDirectorStatusPanelsBlock,
  renderStatusPanelMarkdown,
  statusPanelFieldText,
  statusPanelMdEscape
} from '../../../src/app/statusPanelMarkdown.ts'

// 状态系统融入提调批次1（2026-07-10）：MD 渲染单点纯函数——组件「复制整表」与提调统筹注入共用，
// 这里锁格式（与旧组件 copyPanelMarkdown 逐字一致）+ 提调块的角色过滤/名单行行为。

const fields = [
  { key: 'hp', label: '血量', valueType: 'number' },
  { key: 'items', label: '持有物', valueType: 'list' },
  { key: 'org', label: '所属', valueType: 'ref' },
  { key: 'mood', label: '心情', valueType: 'binding', binding: 'mood' }
]

function makePanel(overrides = {}) {
  return {
    id: 'p1',
    sessionId: 's1',
    templateId: 't1',
    name: '张元英',
    hostType: 'session_character',
    hostId: 'participant_c2',
    values: { hp: 80, items: ['佩剑', '玉佩'], org: ['p9'] },
    bindingValues: { mood: '愉快' },
    fields,
    ...overrides
  }
}

describe('statusPanelFieldText 值渲染（组件复制口径）', () => {
  it('ref 转被引状态栏名称、顿号连接；未知 id 兜底显示 id', () => {
    const resolve = (id) => (id === 'p9' ? '天机阁' : id)
    expect(statusPanelFieldText({ key: 'org', label: '所属', valueType: 'ref' }, ['p9', 'px'], resolve)).toBe('天机阁、px')
  })
  it('单值 ref（旧数据兜底）包装成单元素', () => {
    expect(statusPanelFieldText({ key: 'org', label: '所属', valueType: 'ref' }, 'p9', () => '天机阁')).toBe('天机阁')
  })
  it('list 顿号连接并滤空；空值/null 渲染空串', () => {
    expect(statusPanelFieldText({ key: 'items', label: '持有物', valueType: 'list' }, ['佩剑', '', '玉佩'], (id) => id)).toBe('佩剑、玉佩')
    expect(statusPanelFieldText({ key: 'note', label: '备注', valueType: 'text' }, null, (id) => id)).toBe('')
    expect(statusPanelFieldText({ key: 'hp', label: '血量', valueType: 'number' }, 80, (id) => id)).toBe('80')
  })
  it('asset 只输出可读 caption/alt，不泄漏内部对象字符串', () => {
    const field = { key: 'map', label: '领地图', valueType: 'asset' }
    expect(statusPanelFieldText(field, { assetId: 'status_asset_1', kind: 'image', alt: '领地像素图' }, (id) => id)).toBe('领地像素图')
    expect(statusPanelFieldText(field, { assetId: 'status_asset_1', kind: 'image', alt: '领地像素图', caption: '秋季版地图' }, (id) => id)).toBe('秋季版地图')
  })
})

describe('statusPanelMdEscape 转义', () => {
  it('管道转义防断列、换行折 <br>', () => {
    expect(statusPanelMdEscape('a|b\nc')).toBe('a\\|b<br>c')
  })
})

describe('renderStatusPanelMarkdown 单表渲染', () => {
  it('落库真值：格式与旧组件复制逐字一致（### 名 + 表头 + 行），binding 读 bindingValues', () => {
    const md = renderStatusPanelMarkdown(makePanel(), fields, { resolvePanelName: (id) => (id === 'p9' ? '天机阁' : id) })
    expect(md).toBe([
      '### 张元英',
      '',
      '| 字段 | 值 |',
      '| --- | --- |',
      '| 血量 | 80 |',
      '| 持有物 | 佩剑、玉佩 |',
      '| 所属 | 天机阁 |',
      '| 心情 | 愉快 |'
    ].join('\n'))
  })
  it('readValue 覆盖（组件草稿读取器·所见即所得）优先于落库真值', () => {
    const md = renderStatusPanelMarkdown(makePanel(), [fields[0]], { readValue: () => 42 })
    expect(md).toContain('| 血量 | 42 |')
  })
  it('单位作为字段元数据拼到标题，数值保持纯数字', () => {
    const md = renderStatusPanelMarkdown(makePanel(), [{ ...fields[0], unit: '点' }])
    expect(md).toContain('| 血量（点） | 80 |')
    expect(md).not.toContain('| 血量 | 80点 |')
  })
  it('titleSuffix 拼进标题（提调注入标宿主）', () => {
    const md = renderStatusPanelMarkdown(makePanel(), [], { titleSuffix: '（角色）' })
    expect(md.startsWith('### 张元英（角色）')).toBe(true)
  })
  it('字段值含管道/换行时经转义不破坏表结构', () => {
    const panel = makePanel({ values: { hp: 80, items: [], org: [] }, bindingValues: { mood: '喜|忧\n参半' } })
    const md = renderStatusPanelMarkdown(panel, [fields[3]], {})
    expect(md).toContain('| 心情 | 喜\\|忧<br>参半 |')
  })
})

describe('renderDirectorStatusPanelsBlock 提调注入块', () => {
  const templates = [{ id: 't1', sessionId: 's1', kind: '用户自定义分类', name: '自由模板', description: '记录世界里需要长期管理的信息', fields }]
  const characterOptions = [{ id: 'participant_c2', name: '张元英' }]
  const tempEntities = [{ id: 'te1', name: '小笨狗' }]

  it('所有用户自定义分类统一进入短目录，不按宿主类型分优先级', () => {
    const block = renderDirectorStatusPanelsBlock({ panels: [makePanel({ description: '记录张元英的战斗与随身信息' })], templates, characterOptions, tempEntities })
    expect(block).toContain('用户分类=用户自定义分类')
    expect(block).toContain('用途：记录张元英的战斗与随身信息')
    expect(block).toContain('字段：血量[number]、持有物[list]、所属[ref]、心情[binding]')
  })
  it('角色、临时实体和独立对象只记录真实宿主，不改变目录形态', () => {
    const panels = [
      makePanel({ id: 'p2', name: '元英状态卡' }),
      makePanel({ id: 'p3', name: '小笨狗', hostType: 'temp_entity', hostId: 'te1' }),
      makePanel({ id: 'p9', name: '天机阁', hostType: 'none', hostId: '' })
    ]
    const block = renderDirectorStatusPanelsBlock({ panels, templates, characterOptions, tempEntities })
    expect(block).toContain('元英状态卡（用户分类=用户自定义分类；宿主=session_character:participant_c2')
    expect(block).toContain('小笨狗（用户分类=用户自定义分类；宿主=temp_entity:te1')
    expect(block).toContain('天机阁（用户分类=用户自定义分类；宿主=none:无')
  })
  it('短目录不泄露字段当前值或引用目标值', () => {
    const block = renderDirectorStatusPanelsBlock({ panels: [makePanel()], templates, characterOptions, tempEntities })
    expect(block).not.toContain('80')
    expect(block).not.toContain('佩剑')
    expect(block).not.toContain('天机阁')
    expect(block).not.toContain('| 字段 | 值 |')
  })
  it('无任何面板只返回空态，不按角色名单推断“缺栏”', () => {
    const empty = renderDirectorStatusPanelsBlock({ panels: [], templates, characterOptions, tempEntities })
    expect(empty).toContain('本会话还没有任何状态栏')
    expect(empty).not.toContain('缺栏名单')
  })
  it('实例字段快照为空时回退模板字段轮廓，仍不注入值', () => {
    const panel = makePanel({ fields: [], values: { hp: 5 } })
    const block = renderDirectorStatusPanelsBlock({ panels: [panel], templates, characterOptions, tempEntities })
    expect(block).toContain('血量[number]')
    expect(block).not.toContain('5')
  })
})
