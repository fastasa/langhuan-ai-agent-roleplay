/**
 * 状态系统内置积木预设（批次4·2026-07-08 用户拍板「按成熟模拟经营游戏补齐基础字段」）。
 *
 * 真值边界：
 * - 这里是五种基础积木（角色/组织/建筑/区域/物品）的**内置模板字段单点**，前后端共享
 *   （服务端临时实体自动挂接用它建模板；星依知识库 2.9 的字段口径以本文件为准）。
 * - 预设只是「起步骨架」：建进会话后就是普通 `chat_status_panel_templates` 行，用户/星依可自由增删改字段。
 * - 字段设计以「提调轮内好改」为准（批次5 接入）：会加减的量一律 number、可勾销的条目一律 list、
 *   实体间关系一律 ref（可下钻）、描述性状态用 text；带谓词的关系（敌对/盟友）用 list 文本写「对象·谓词」。
 * - binding 字段只在角色积木上（character.appearance 可见资料穿透）；临时实体宿主下禁用、转正迁移到角色宿主后激活。
 */

import type { StatusPanelFieldDef } from '../types'
import type { StatusPanelPresentation } from '../../shared/statusPanelPresentation'

/** 跨组件唤起状态系统面板事件（detail: { hostId }）：临时数据面板「状态栏」按钮发起；
 *  AppChatSection 收到=打开状态面板并按宿主下钻；AppRoleModals 收到=收起临时数据弹窗（它 z-index 更高会遮挡）。 */
export const OPEN_STATUS_SYSTEM_PANEL_EVENT = 'langhuan:open-status-system-panel'

export interface StatusPanelPreset {
  /** 模板 kind（也是积木身份）。临时实体 kind=faction 映射到 organization。 */
  kind: string
  name: string
  description: string
  fields: StatusPanelFieldDef[]
  presentation?: StatusPanelPresentation
}

/** 字段六型用户可见中文名单点（多维表格化批次C/E + 富媒体骨架·用户拍板口径）：
 *  行级类型编辑器与模板 tab 类型选择器共用；valueType 机器名保持英文稳定枚举不动。 */
export const STATUS_PANEL_FIELD_TYPE_OPTIONS: Array<{ value: StatusPanelFieldDef['valueType']; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'list', label: '列表' },
  { value: 'ref', label: '单位引用' },
  { value: 'binding', label: '可见资料（穿透）' },
  { value: 'asset', label: '图片资产' }
]

export const STATUS_PANEL_PRESETS: StatusPanelPreset[] = [
  {
    kind: 'population',
    name: '人口与领地概览',
    description: '人口、年龄、性别与领地经济的示例骨架；总览可在人口性别/年龄两种分类间切换。',
    fields: [
      { key: 'area', label: '领地面积', unit: 'km²', valueType: 'number', size: 'short' },
      { key: 'population', label: '总人口', valueType: 'number', size: 'short' },
      { key: 'male', label: '男性人口', valueType: 'number', size: 'short' },
      { key: 'female', label: '女性人口', valueType: 'number', size: 'short' },
      { key: 'children', label: '儿童人口', valueType: 'number', size: 'short' },
      { key: 'elderly', label: '老年人口', valueType: 'number', size: 'short' },
      { key: 'economy', label: '经济总值', valueType: 'number' },
      { key: 'timber', label: '木材储备', valueType: 'number' },
      { key: 'coal', label: '煤炭储备', valueType: 'number' },
      { key: 'map', label: '领地像素图', valueType: 'asset', description: '可上传图片或从像素中控台发布快照' }
    ],
    presentation: {
      schemaVersion: 1,
      blocks: [
        { id: 'population-total', type: 'metric', title: '总人口', value: { op: 'field', fieldKey: 'population' } },
        { id: 'area', type: 'metric', title: '领地面积', value: { op: 'field', fieldKey: 'area' }, unit: 'km²' },
        { id: 'economy', type: 'metric', title: '经济总值', value: { op: 'field', fieldKey: 'economy' } },
        {
          id: 'population-structure',
          type: 'donut',
          title: '人口结构',
          span: 3,
          total: { op: 'field', fieldKey: 'population' },
          variants: [
            { id: 'gender', label: '按性别', segments: [
              { id: 'male', label: '男性', value: { op: 'field', fieldKey: 'male' } },
              { id: 'female', label: '女性', value: { op: 'field', fieldKey: 'female' } }
            ] },
            { id: 'age', label: '按年龄', segments: [
              { id: 'children', label: '儿童', value: { op: 'field', fieldKey: 'children' } },
              { id: 'adult', label: '成年', value: { op: 'remainder', total: { op: 'field', fieldKey: 'population' }, parts: [{ op: 'field', fieldKey: 'children' }, { op: 'field', fieldKey: 'elderly' }] } },
              { id: 'elderly', label: '老年', value: { op: 'field', fieldKey: 'elderly' } }
            ] }
          ]
        },
        { id: 'resources', type: 'bar', title: '资源储备', span: 3, items: [
          { id: 'timber', label: '木材', value: { op: 'field', fieldKey: 'timber' } },
          { id: 'coal', label: '煤炭', value: { op: 'field', fieldKey: 'coal' } }
        ] },
        { id: 'territory-map', type: 'media', title: '领地像素图', span: 3, fieldKey: 'map', fit: 'pixelated' }
      ]
    }
  },
  {
    kind: 'character',
    name: '角色状态栏',
    description: '挂在角色（正式或临时）身上的通用状态：情绪、健康、位置、财物、着装装备、事项、关系。',
    fields: [
      // 短字段（顶部 HUD 紧凑格）：情绪/健康/体力/金钱/声望——一眼看的状态与数值。
      { key: 'mood', label: '情绪', valueType: 'text', size: 'short', description: '当前主导情绪与起因，如「警惕：刚被跟踪」' },
      { key: 'health', label: '健康', valueType: 'text', size: 'short', description: '身体状况，如「旧伤复发，行动迟缓」' },
      { key: 'stamina', label: '体力', valueType: 'number', size: 'short', description: '0~100，剧情消耗与恢复' },
      { key: 'money', label: '金钱', valueType: 'number', size: 'short', description: '随身财产（单位随世界观：文/两/灵石…写进值里不便算，单位记在模板说明或字段说明）' },
      { key: 'reputation', label: '声望', valueType: 'number', size: 'short', description: '在当前世界的名声值，可正可负' },
      // 长字段：可见资料排第一（穿透角色卡真值·最优先看），其余整行铺开。
      { key: 'appearance', label: '可见资料', valueType: 'binding', binding: 'character.appearance', description: '穿透角色可见资料（仅正式角色宿主可写）' },
      { key: 'location', label: '当前位置', valueType: 'text', description: '此刻身处何地' },
      { key: 'activity', label: '当前活动', valueType: 'text', description: '正在做什么' },
      // 着装/装备槽（2026-07-09 用户拍板·按部位分格）：一个部位一格，多件的（饰品/武器装备）用 list 一行一件。
      { key: 'head', label: '头部', valueType: 'text', description: '帽子/头饰，如「宽檐草帽」' },
      { key: 'eyewear', label: '眼镜', valueType: 'text', description: '眼镜/护目镜等' },
      { key: 'accessories', label: '饰品', valueType: 'list', description: '项链/耳坠/戒指等，一条一件' },
      { key: 'neck', label: '颈部', valueType: 'text', description: '围巾/项圈/披风领等' },
      { key: 'upperBody', label: '上身', valueType: 'text', description: '上衣/外套' },
      { key: 'lowerBody', label: '下身', valueType: 'text', description: '裤子/裙子' },
      { key: 'shoes', label: '鞋子', valueType: 'text', description: '鞋靴' },
      { key: 'equipment', label: '武器装备', valueType: 'list', description: '身上携带的武器/装备，一条一件，如「长剑」「护腕」' },
      { key: 'inventory', label: '随身物品', valueType: 'list', description: '衣物/装甲/杂物等，一条一件，可带数量如「符纸×3」' },
      { key: 'tasks', label: '进行中事项', valueType: 'list', description: '接下的任务/心愿/待办，完成即移除' },
      { key: 'effects', label: '状态效果', valueType: 'list', description: '增益/减益，如「中毒（三日）」「士气高涨」' },
      { key: 'skills', label: '技能专长', valueType: 'list', description: '会什么、擅长什么' },
      { key: 'relations', label: '关键关系', valueType: 'list', description: '「对象·关系」一条一个，如「听雨阁·受雇」「柳三变·仇视」' },
      { key: 'affiliation', label: '所属组织', valueType: 'ref', description: '引用组织状态栏，可下钻' }
    ]
  },
  {
    kind: 'organization',
    name: '组织状态栏',
    description: '宗门/学校/商号/势力等组织的运转状态：人财物、成员、事务、外交。',
    fields: [
      { key: 'scale', label: '规模人数', valueType: 'number', description: '成员总数' },
      { key: 'reputation', label: '声望', valueType: 'number', description: '对外名声值，可正可负' },
      { key: 'funds', label: '资金', valueType: 'number', description: '组织金库' },
      { key: 'resources', label: '资源库存', valueType: 'list', description: '一条一种，可带数量如「灵米×200石」' },
      { key: 'members', label: '成员', valueType: 'ref', description: '引用成员的角色状态栏，可下钻' },
      { key: 'leader', label: '领袖', valueType: 'ref', description: '引用领袖的角色状态栏' },
      { key: 'assets', label: '名下建筑', valueType: 'ref', description: '引用建筑状态栏（据点/产业），可下钻' },
      { key: 'agenda', label: '当前事务', valueType: 'list', description: '正在推进的事项，完成即移除' },
      { key: 'diplomacy', label: '对外关系', valueType: 'list', description: '「对象·关系」一条一个，如「青云宗·结盟」' },
      { key: 'territory', label: '势力范围', valueType: 'text', description: '活动/控制的地理范围' },
      { key: 'morale', label: '士气风气', valueType: 'text', description: '内部人心与风气' },
      { key: 'status', label: '运转状态', valueType: 'text', description: '兴盛/维持/衰落/停摆及原因' }
    ]
  },
  {
    kind: 'building',
    name: '建筑状态栏',
    description: '可升级经营的空间单位：等级、状况、功能、产出、库存。',
    fields: [
      { key: 'level', label: '等级', valueType: 'number', description: '建筑等级，升级改这里' },
      { key: 'condition', label: '完好度', valueType: 'text', description: '如「完好」「东墙坍塌待修」' },
      { key: 'location', label: '所在位置', valueType: 'text', description: '在哪个区域/街市' },
      { key: 'usage', label: '当前用途', valueType: 'text', description: '此刻作何用' },
      { key: 'functions', label: '功能设施', valueType: 'list', description: '一条一处，如「炼丹房」「藏书阁」' },
      { key: 'owner', label: '所属', valueType: 'ref', description: '引用所属组织或角色的状态栏' },
      { key: 'staff', label: '常驻人员', valueType: 'ref', description: '引用常驻者的角色状态栏' },
      { key: 'inventory', label: '库存', valueType: 'list', description: '存放的物资，可带数量' },
      { key: 'output', label: '产出', valueType: 'list', description: '周期性产出，如「灵田：灵米×10石/月」' },
      { key: 'upgradeNeeds', label: '升级所需', valueType: 'list', description: '升到下一级需要什么资源/条件' }
    ]
  },
  {
    kind: 'region',
    name: '区域状态栏',
    description: '城镇/山脉/地域的宏观状态：局势、繁荣、治安、势力分布。',
    fields: [
      { key: 'situation', label: '当前局势', valueType: 'text', description: '此地正在发生什么大势' },
      { key: 'prosperity', label: '繁荣度', valueType: 'number', description: '0~100，经济与人气' },
      { key: 'security', label: '治安', valueType: 'text', description: '如「白日太平，夜有盗匪」' },
      { key: 'population', label: '人口', valueType: 'number', description: '大致人口数' },
      { key: 'factions', label: '主要势力', valueType: 'ref', description: '引用盘踞此地的组织状态栏' },
      { key: 'landmarks', label: '重要地点', valueType: 'ref', description: '引用区域内建筑状态栏，可下钻' },
      { key: 'specialties', label: '资源特产', valueType: 'list', description: '出产什么' },
      { key: 'events', label: '进行中事件', valueType: 'list', description: '正在此地发生的事件，结束即移除' },
      { key: 'climate', label: '环境气候', valueType: 'text', description: '地貌与气候特征' }
    ]
  },
  {
    kind: 'item',
    name: '物品状态栏',
    description: '重要物品的流转状态：在谁手上、什么状态、有何效果。',
    fields: [
      { key: 'holder', label: '持有者', valueType: 'ref', description: '引用持有者的角色/组织状态栏' },
      { key: 'location', label: '所在位置', valueType: 'text', description: '不在人手上时在哪' },
      { key: 'condition', label: '状态耐久', valueType: 'text', description: '如「完好」「剑刃有缺口」' },
      { key: 'quantity', label: '数量', valueType: 'number', description: '可堆叠物品的数量' },
      { key: 'powers', label: '功能效果', valueType: 'list', description: '能做什么、有什么效果' },
      { key: 'notes', label: '附带状态', valueType: 'list', description: '附加情况，如「被下了追踪符」' }
    ]
  }
]

/** 临时实体 kind → 内置积木预设：faction 归组织；event_note 不是实体，不挂状态栏（返回 null）。 */
export function resolveStatusPanelPresetForEntityKind(entityKind: string): StatusPanelPreset | null {
  const kind = String(entityKind || '').trim()
  if (!kind || kind === 'event_note') return null
  const presetKind = kind === 'faction' ? 'organization' : kind
  return STATUS_PANEL_PRESETS.find((preset) => preset.kind === presetKind) || null
}
