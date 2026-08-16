<template>
  <article class="ssp-card" :class="{ 'ssp-card--side': closable }" :aria-label="`状态栏 ${panel.name}`">
    <header class="ssp-card-head">
      <!-- 积木语义色块 icon（tint 单点=父 kindMetaOf，与模板 tab 联动） -->
      <span class="ssp-ctile" :class="`ssp-tint-${kindMeta.tint}`" aria-hidden="true">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="kindMeta.icon"></svg>
      </span>
      <span class="ssp-card-title">
        <span class="ssp-card-name">{{ panel.name }}</span>
        <span class="ssp-host">{{ hostLabel }}</span>
      </span>
      <span v-if="hasPresentation" class="ssp-view-switch" role="tablist" aria-label="状态栏视图">
        <button type="button" :class="{ active: viewMode === 'overview' }" role="tab" :aria-selected="viewMode === 'overview'" @click="setViewMode('overview')">总览</button>
        <button type="button" :class="{ active: viewMode === 'data' }" role="tab" :aria-selected="viewMode === 'data'" @click="setViewMode('data')">数据</button>
      </span>
      <span class="ssp-kind" :class="`ssp-tint-${kindMeta.tint}`">{{ kindMeta.label }}</span>
      <!-- 复制整表（Markdown 表格进剪贴板·角色状态可直接贴走存档/喂 AI） -->
      <button
        type="button"
        class="ssp-icon-btn"
        :aria-label="`复制状态栏 ${panel.name} 为 Markdown`"
        title="复制整表（Markdown）"
        @click="$emit('copyTable')"
      >
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
      </button>
      <button
        v-if="!readonly"
        type="button"
        class="ssp-icon-btn"
        :aria-label="`删除状态栏 ${panel.name}`"
        title="删除"
        @click="$emit('delete')"
      >
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
      </button>
      <!-- 批次D：副面板独立关闭（仅副卡露出） -->
      <button
        v-if="closable"
        type="button"
        class="ssp-icon-btn"
        aria-label="关闭副面板"
        title="关闭副面板"
        @click="$emit('close')"
      >
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
      </button>
    </header>

    <!-- 批次D：副面板浏览链（副卡内连点引用的历史·点前项回退） -->
    <div v-if="crumbs && crumbs.length > 1" class="ssp-side-crumbs" aria-label="副面板浏览链">
      <template v-for="(crumb, index) in crumbs" :key="`${crumb.id}_${index}`">
        <span v-if="index > 0" class="ssp-crumb-sep" aria-hidden="true">›</span>
        <button
          v-if="index < crumbs.length - 1"
          type="button"
          class="ssp-crumb-link"
          @click="$emit('crumbTo', index)"
        >{{ crumb.name }}</button>
        <span v-else class="ssp-crumb-current">{{ crumb.name }}</span>
      </template>
    </div>

    <div v-if="!fields.length" class="ssp-hint">该状态栏没有可渲染的字段（模板缺失或字段为空）。</div>

    <StatusPanelPresentationView
      v-if="fields.length && hasPresentation && viewMode === 'overview'"
      :session-id="sessionId"
      :panel="panel"
      :fields="fields"
      :draft="draft"
      :presentation="panel.presentation!"
      :panel-name-by-id="panelNameById"
      @ref-open="$emit('refOpen', $event)"
    />

    <!-- T1 固定格子表格 + T2 自建横滑块（§6.7）：每行 = 字段名/类型定义格（第一列·横滚冻结）+ 值格们；
         值格固定宽高、溢出省略号、单击就地展开。批次D 抽成子组件：主/副面板各一实例，grid/横滑块/展开互不干扰。 -->
    <div v-if="fields.length && (!hasPresentation || viewMode === 'data')" class="ssp-grid-wrap">
      <div ref="gridEl" class="ssp-grid" @scroll="syncHbar">
        <div
          v-for="(field, rowIndex) in fields"
          :key="field.key"
          class="ssp-grid-row"
          :style="rowStyle(field.key)"
        >
          <!-- 字段名格=字段管理菜单入口（左键/右键同弹自定义菜单·类型修改随菜单「字段设置」走） -->
          <button
            type="button"
            class="ssp-gcell ssp-gcell--name"
            :style="nameCellStyle"
            :title="field.description || field.key"
            :aria-label="`管理字段 ${fieldLabel(field)}`"
            @click="emitFieldMenu($event, field, rowIndex)"
            @contextmenu.prevent="emitFieldMenu($event, field, rowIndex)"
          >
            <span class="ssp-gcell-name-txt">{{ fieldLabel(field) }}</span>
            <span v-if="field.valueType === 'binding'" class="ssp-bind-mark" title="绑定既有真值，编辑即穿透写回">穿透</span>
            <!-- 名称列宽手柄（右缘拖·双击回默认） -->
            <span
              class="ssp-cell-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="名称列宽调整"
              title="拖动调整名称列宽 · 双击复位"
              @mousedown.stop.prevent="onNameResizeDown"
              @click.stop
              @dblclick.stop="resetNameW"
            ></span>
          </button>

          <!-- 值格区（nowrap 横向排开·由横滑块横移查看）；列宽=每列独立（colWs 按 模板id::列index），格右缘手柄拖、双击复位 -->
          <div class="ssp-grid-values" role="group" :aria-label="`${panel.name} ${fieldLabel(field)}`">
            <!-- text / binding：单值文本格（收起态按行高 line-clamp 铺满、单击展开成自增高 textarea·超高格内竖滚） -->
            <template v-if="field.valueType === 'text' || field.valueType === 'binding'">
              <div class="ssp-gcell" :class="{ 'ssp-gcell--open': isCellOpen(field.key) }" :style="cellStyle(0)">
                <textarea
                  v-if="isCellOpen(field.key)"
                  v-model="draft[field.key]"
                  v-autogrow
                  v-focus
                  rows="1"
                  class="ssp-gcell-edit"
                  :readonly="readonly"
                  :disabled="field.valueType === 'binding' && panel.hostType !== 'session_character'"
                  :placeholder="field.valueType === 'binding' && panel.hostType !== 'session_character' ? '仅会话角色宿主可编辑' : ''"
                  :aria-label="`${panel.name} ${fieldLabel(field)}`"
                  @blur="closeCell(field.key)"
                ></textarea>
                <button
                  v-else
                  type="button"
                  class="ssp-gcell-view"
                  :class="{ 'ssp-gcell-view--empty': !String(draft[field.key] || '') }"
                  :aria-label="`${panel.name} ${fieldLabel(field)} 值格`"
                  @click="openCell(field.key)"
                  @contextmenu.prevent="emitCellMenu($event, field, 0)"
                ><span class="ssp-gcell-txt">{{ String(draft[field.key] || '') || '—' }}</span></button>
                <span class="ssp-cell-resize" title="拖动调整列宽 · 双击复位" @mousedown.stop.prevent="onColResizeDown($event, 0)" @click.stop @dblclick.stop="resetColW(0)"></span>
              </div>
            </template>

            <!-- number：单值数字格 -->
            <template v-else-if="field.valueType === 'number'">
              <div class="ssp-gcell" :class="{ 'ssp-gcell--open': isCellOpen(field.key) }" :style="cellStyle(0)">
                <input
                  v-if="isCellOpen(field.key)"
                  v-model="draft[field.key]"
                  v-focus
                  type="number"
                  class="ssp-gcell-edit ssp-gcell-edit--num"
                  :readonly="readonly"
                  :aria-label="`${panel.name} ${fieldLabel(field)}`"
                  @blur="closeCell(field.key)"
                >
                <button
                  v-else
                  type="button"
                  class="ssp-gcell-view ssp-gcell-view--num"
                  :class="{ 'ssp-gcell-view--empty': !String(draft[field.key] || '') }"
                  :aria-label="`${panel.name} ${fieldLabel(field)} 值格`"
                  @click="openCell(field.key)"
                  @contextmenu.prevent="emitCellMenu($event, field, 0)"
                ><span class="ssp-gcell-txt">{{ String(draft[field.key] || '') || '—' }}</span></button>
                <span class="ssp-cell-resize" title="拖动调整列宽 · 双击复位" @mousedown.stop.prevent="onColResizeDown($event, 0)" @click.stop @dblclick.stop="resetColW(0)"></span>
              </div>
            </template>

            <!-- list：多值硬隔离·每值一格。展开态=自增高 textarea（真机反馈：单行 input 视觉上「点了没展开」，与 text 格统一） -->
            <template v-else-if="field.valueType === 'list'">
              <div
                v-for="(item, i) in listItemsOf(field.key)"
                :key="i"
                class="ssp-gcell ssp-gcell--list"
                :class="{ 'ssp-gcell--open': isCellOpen(field.key, i) }"
                :style="cellStyle(i)"
              >
                <textarea
                  v-if="isCellOpen(field.key, i)"
                  v-autogrow
                  v-focus
                  rows="1"
                  class="ssp-gcell-edit"
                  :value="item"
                  :readonly="readonly"
                  :aria-label="`${panel.name} ${fieldLabel(field)} 第${i + 1}项`"
                  @input="setListItem(field.key, i, ($event.target as HTMLTextAreaElement).value)"
                  @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
                  @blur="closeCell(field.key, i)"
                ></textarea>
                <button
                  v-else
                  type="button"
                  class="ssp-gcell-view"
                  :class="{ 'ssp-gcell-view--empty': !item }"
                  :aria-label="`${panel.name} ${fieldLabel(field)} 第${i + 1}项 值格`"
                  @click="openCell(field.key, i)"
                  @contextmenu.prevent="emitCellMenu($event, field, i)"
                ><span class="ssp-gcell-txt">{{ item || '—' }}</span></button>
                <button
                  v-if="!readonly"
                  type="button"
                  class="ssp-gcell-del"
                  :aria-label="`移除 ${fieldLabel(field)} 第${i + 1}项`"
                  @click="removeListItem(field.key, i)"
                >×</button>
                <span class="ssp-cell-resize" title="拖动调整列宽 · 双击复位" @mousedown.stop.prevent="onColResizeDown($event, i)" @click.stop @dblclick.stop="resetColW(i)"></span>
              </div>
              <button
                v-if="!readonly"
                type="button"
                class="ssp-cell-add"
                :aria-label="`${panel.name} ${fieldLabel(field)} 加格`"
                @click="addListItem(field.key)"
              >＋ 加格</button>
            </template>

            <!-- ref：单位引用·每引用一格。批次D：点击不再原地下钻，交给父开/换并行副面板 -->
            <template v-else-if="field.valueType === 'ref'">
              <div
                v-for="refId in refIdsOf(field.key)"
                :key="refId"
                class="ssp-gcell ssp-gcell--ref"
                :class="refTintClass(refId)"
              >
                <button
                  type="button"
                  class="ssp-gcell-view ssp-gcell-ref-jump"
                  :aria-label="`打开状态栏 ${panelNameById(refId)}`"
                  @click="$emit('refOpen', refId)"
                >{{ panelNameById(refId) }} ↗</button>
                <button
                  v-if="!readonly"
                  type="button"
                  class="ssp-gcell-del"
                  :aria-label="`移除引用 ${panelNameById(refId)}`"
                  @click="removeRef(field.key, refId)"
                >×</button>
              </div>
              <select
                v-if="!readonly"
                class="ssp-input ssp-ref-add"
                :aria-label="`${panel.name} ${fieldLabel(field)} 添加引用`"
                :value="''"
                @change="addRef(field.key, $event)"
              >
                <option value="" disabled>添加引用…</option>
                <option
                  v-for="candidate in refCandidates(field.key)"
                  :key="candidate.id"
                  :value="candidate.id"
                >{{ candidate.name }}</option>
              </select>
            </template>

            <template v-else-if="field.valueType === 'asset'">
              <div class="ssp-gcell ssp-gcell--asset" :style="cellStyle(0)">
                <img
                  v-if="assetRefOf(field.key) && !assetFailed(field.key)"
                  :src="API.chatStatusAssetContent(sessionId, assetRefOf(field.key)!.assetId)"
                  :alt="assetRefOf(field.key)!.alt"
                  @error="markAssetFailed(field.key)"
                >
                <span v-else class="ssp-asset-empty">{{ assetRefOf(field.key) ? `图片不可用：${assetRefOf(field.key)!.alt}` : '暂无图片' }}</span>
                <label v-if="!readonly" class="ssp-asset-upload">
                  {{ assetRefOf(field.key) ? '替换' : '上传' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="selectAsset(field, $event)">
                </label>
              </div>
            </template>
          </div>

          <!-- T3 行高手柄（行级横跨整行·指示线正骑行分界灰线·双击回默认行高） -->
          <span
            class="ssp-row-resize"
            role="separator"
            aria-orientation="horizontal"
            :aria-label="`${fieldLabel(field)} 行高调整`"
            title="拖动调整行高 · 双击复位"
            @mousedown.stop.prevent="onRowResizeDown($event, field.key)"
            @click.stop
            @dblclick.stop="resetRowH(field.key)"
          ></span>
        </div>

        <!-- 飞书式表内加字段行（贴网格末行·sticky 左标签横滚不跑）——取代旧滑块下方孤立按钮 -->
        <button
          v-if="!readonly"
          type="button"
          class="ssp-grid-addrow"
          :aria-label="`${panel.name} 加字段`"
          @click="emitAddField($event)"
        >
          <span class="ssp-addrow-label">＋ 加字段</span>
        </button>
      </div>
      <!-- T2 自建横向滑块（琅嬛莫兰迪风·§6.7 要点 6）：驱动整表横移，替代浏览器默认横向滚动条 -->
      <div v-show="hbar.visible" class="ssp-hbar" @mousedown="onTrackDown">
        <div
          class="ssp-hbar-thumb"
          :style="{ width: hbar.thumbW + 'px', transform: `translateX(${hbar.thumbX}px)` }"
          @mousedown.stop="onThumbDown"
        ></div>
      </div>
    </div>

    <!-- 无字段兜底：表格不渲染时仍留加字段入口（正常路径走表内加字段行） -->
    <div v-if="!fields.length && !readonly" class="ssp-add-field-row">
      <button
        type="button"
        class="ssp-cell-add"
        :aria-label="`${panel.name} 加字段`"
        @click="emitAddField($event)"
      >＋ 加字段</button>
    </div>

    <!-- 字段编辑器已升浮层（2026-07-10 真机反馈：仿飞书菜单原地变身字段设置面板）——渲染/状态全住父，本卡只发带坐标的 openFieldEditor。 -->

    <footer v-if="dirty" class="ssp-card-foot">
      <button type="button" class="ssp-btn" @click="$emit('reset')">还原</button>
      <button type="button" class="ssp-btn ssp-btn--primary" :disabled="saving" @click="$emit('save')">保存</button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ChatStatusPanel, StatusPanelFieldDef } from '../../../types'
import { statusPanelFieldDisplayLabel } from '../../../../shared/statusPanelField'
import StatusPanelPresentationView from './StatusPanelPresentationView.vue'
import { API } from '../../../config/api'

const fieldLabel = statusPanelFieldDisplayLabel

// 状态栏单卡（多维表格化批次D 从 ChatStatusSystemPanel 抽出）：
// 固定格网格 + 自建横滑块 + 值格展开编辑，主/副面板各挂一实例。
// 真值边界：panel/fields/draft/gridView/expandedCell 全部由父持有——
// draft、gridView 是父的 reactive 对象，本卡经引用就地编辑（视图态/草稿态）；
// 一切落库动作（保存值/结构/删除）一律 emit 回父执行，本卡不直接碰仓库层。
// 字段编辑器/字段菜单渲染住父浮层（2026-07-10 仿飞书原地变身），本卡只发带坐标的事件。
// readonly（地图系统批7·2026-07-11）：第二调用点=地图弹窗点锚点弹卡，只看不改——删除/加字段/加格/加引用/
// 移除全隐藏，值格原生 readonly 禁止键入；ref 跳转与列宽/行高调整仍放行（纯视图操作不写真值）。

type PanelValueDraft = Record<string, any>

const props = withDefaults(defineProps<{
  panel: ChatStatusPanel
  sessionId?: string
  /** 实例字段真值（父 panelFields 算好：实例快照优先·旧实例回退模板字段）。 */
  fields: StatusPanelFieldDef[]
  /** 值草稿（父 panelDrafts[panel.id]·跨下钻/副面板导航不丢）。 */
  draft: PanelValueDraft
  dirty: boolean
  saving: boolean
  kindMeta: { label: string; tint: string; icon: string }
  hostLabel: string
  /** ref 目标名称/染色解析（父闭包 templates/panels 真值）。 */
  panelNameById: (panelId: string) => string
  refTintClass: (panelId: string) => string
  /** ref 添加候选（父按「排除自己+已选」算）。 */
  refCandidatesOf: (panelId: string, fieldKey: string) => Array<{ id: string; name: string }>
  /** 列宽/行高视图态（父 reactive·主副两卡共享）：colW=列宽默认值、colWs 键=模板id::列index（每列独立）、
   *  nameW 键=模板id（名称列宽）、rowH 键=模板id::字段key（每行独立）。 */
  gridView: { colW: number; colWs: Record<string, number>; nameW: Record<string, number>; rowH: Record<string, number> }
  /** 展开格唯一键（父持有·全局同时只展开一个，跨主副面板互斥）。 */
  expandedCell: string | null
  /** 副面板专属：露关闭按钮。 */
  closable?: boolean
  /** 副面板浏览链（连点引用的历史·含当前·长度>1 才显示）。 */
  crumbs?: Array<{ id: string; name: string }>
  /** 只读模式（地图弹窗批7 复用·2026-07-11）：隐藏删除/加字段/加格/加引用/移除，值格禁止键入（原生 readonly），
   *  ref 跳转与列宽/行高调整仍可用（纯视图操作、不改真值）。缺省 false=侧栏原有行为零变化。 */
  readonly?: boolean
}>(), {
  readonly: false,
  sessionId: ''
})

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'reset'): void
  (e: 'delete'): void
  (e: 'close'): void
  (e: 'crumbTo', index: number): void
  (e: 'refOpen', refId: string): void
  /** 加字段（表内加字段行/无字段兜底）：带点击坐标，父在原地弹字段编辑浮层（新增模式）。 */
  (e: 'openFieldEditor', payload: { x: number; y: number }): void
  (e: 'persistGridView'): void
  (e: 'update:expandedCell', value: string | null): void
  /** 字段名格左键/右键：父弹自定义字段管理菜单（fixed 浮层·主副两卡共用一个实例）。 */
  (e: 'fieldMenu', payload: { x: number; y: number; field: StatusPanelFieldDef; rowIndex: number }): void
  /** 值格右键：父弹值格菜单（编辑/复制值/清空此格）。 */
  (e: 'cellMenu', payload: { x: number; y: number; field: StatusPanelFieldDef; cellIndex: number }): void
  /** 复制整表 Markdown（父持有草稿与 ref 名称解析）。 */
  (e: 'copyTable'): void
  (e: 'assetUpload', payload: { fieldKey: string; fileName: string; dataUri: string; alt: string }): void
  (e: 'assetError', message: string): void
}>()

const hasPresentation = computed(() => Boolean(props.panel.presentation?.blocks?.length))
const viewMode = ref<'overview' | 'data'>('data')
function viewModeKey() { return `langhuan:status-panel-view:${props.panel.id}` }
function loadViewMode() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(viewModeKey()) : ''
  viewMode.value = hasPresentation.value && stored !== 'data' ? 'overview' : 'data'
}
function setViewMode(mode: 'overview' | 'data') {
  viewMode.value = mode
  if (typeof localStorage !== 'undefined') localStorage.setItem(viewModeKey(), mode)
}
function assetRefOf(fieldKey: string) {
  const value = props.draft[fieldKey]
  return value && typeof value === 'object' && !Array.isArray(value) && String((value as Record<string, unknown>).assetId || '').trim()
    ? value as { assetId: string; kind: 'image'; alt: string; caption?: string }
    : null
}
const failedAssets = reactive<Record<string, boolean>>({})
function assetFailureKey(fieldKey: string) { return `${fieldKey}:${assetRefOf(fieldKey)?.assetId || ''}` }
function assetFailed(fieldKey: string) { return Boolean(failedAssets[assetFailureKey(fieldKey)]) }
function markAssetFailed(fieldKey: string) { failedAssets[assetFailureKey(fieldKey)] = true }
function selectAsset(field: StatusPanelFieldDef, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    emit('assetError', '仅支持 png/jpeg/webp/gif 格式的图片')
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    emit('assetError', '单张状态图片大小不能超过 8MB')
    return
  }
  const reader = new FileReader()
  reader.onload = () => emit('assetUpload', {
    fieldKey: field.key,
    fileName: file.name,
    dataUri: String(reader.result || ''),
    alt: fieldLabel(field)
  })
  reader.readAsDataURL(file)
}

/**
 * 状态栏自由文本字段自动增高：内容超过一行就把输入框长高（上限 160px 后内部滚动）。
 * mounted/updated 都重算高度：mounted 处理初始值、updated 处理外部改草稿（切面板/还原/加载）。
 */
function autoGrowField(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  const cs = getComputedStyle(el)
  // scrollHeight = 内容高 + 内边距（不含边框）。按盒模型补偿，避免夹掉内容留 2px 幽灵滚动条。
  const extra = cs.boxSizing === 'border-box'
    ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    : -(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom))
  el.style.height = `${Math.min(el.scrollHeight + extra, 160)}px`
  ;(el as unknown as { _agv?: string })._agv = el.value
}
const vAutogrow = {
  mounted(el: HTMLTextAreaElement) {
    autoGrowField(el)
    el.addEventListener('input', () => autoGrowField(el))
  },
  updated(el: HTMLTextAreaElement) {
    // 只在文本真的变了才重算，防整卡重渲染时所有 textarea 集体抖动
    if (el.value !== (el as unknown as { _agv?: string })._agv) autoGrowField(el)
  },
}

// 值格展开即自动聚焦：展开态编辑控件是 v-if 新挂载的，mounted 时把光标落进去
const vFocus = {
  mounted(el: HTMLElement) {
    const target = el.matches('input, textarea') ? el : el.querySelector('input, textarea')
    ;(target as HTMLElement | null)?.focus()
  },
}

// ── 值格展开态（T1）：唯一键住父（跨主副面板同时只展开一个），本卡只算自己的键 ──
function cellKey(fieldKey: string, index = 0) {
  return `${props.panel.id}::${fieldKey}::${index}`
}
function isCellOpen(fieldKey: string, index = 0) {
  return props.expandedCell === cellKey(fieldKey, index)
}
function openCell(fieldKey: string, index = 0) {
  emit('update:expandedCell', cellKey(fieldKey, index))
}
function closeCell(fieldKey: string, index = 0) {
  if (props.expandedCell === cellKey(fieldKey, index)) emit('update:expandedCell', null)
}

// ── T2 自建横滑块（每卡一套：主/副面板各自横滚互不干扰） ──
const gridEl = ref<HTMLElement | null>(null)
const hbar = reactive({ visible: false, trackW: 0, thumbW: 0, thumbX: 0 })
let gridObserver: ResizeObserver | null = null

function syncHbar() {
  const el = gridEl.value
  if (!el) {
    hbar.visible = false
    return
  }
  const trackW = el.clientWidth
  const maxScroll = el.scrollWidth - el.clientWidth
  hbar.trackW = trackW
  if (maxScroll <= 1) {
    hbar.visible = false
    return
  }
  hbar.visible = true
  hbar.thumbW = Math.max(28, (el.clientWidth / el.scrollWidth) * trackW)
  const range = trackW - hbar.thumbW
  hbar.thumbX = range > 0 ? (el.scrollLeft / maxScroll) * range : 0
}
function queueHbarSync() {
  void nextTick(syncHbar)
}

let dragStartX = 0
let dragStartScroll = 0
function onThumbMove(event: MouseEvent) {
  const el = gridEl.value
  if (!el) return
  const range = hbar.trackW - hbar.thumbW
  if (range <= 0) return
  const maxScroll = el.scrollWidth - el.clientWidth
  el.scrollLeft = dragStartScroll + ((event.clientX - dragStartX) / range) * maxScroll
}
function onThumbUp() {
  window.removeEventListener('mousemove', onThumbMove)
  window.removeEventListener('mouseup', onThumbUp)
}
function onThumbDown(event: MouseEvent) {
  const el = gridEl.value
  if (!el) return
  event.preventDefault()
  dragStartX = event.clientX
  dragStartScroll = el.scrollLeft
  window.addEventListener('mousemove', onThumbMove)
  window.addEventListener('mouseup', onThumbUp)
}
function onTrackDown(event: MouseEvent) {
  const el = gridEl.value
  if (!el) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const range = hbar.trackW - hbar.thumbW
  if (range <= 0) return
  const maxScroll = el.scrollWidth - el.clientWidth
  const targetX = Math.max(0, Math.min(range, event.clientX - rect.left - hbar.thumbW / 2))
  el.scrollLeft = (targetX / range) * maxScroll
}

// ── T3 列宽/行高拖拽：改父的共享 gridView（每列独立 colWs + 名称列 nameW + 行高 rowH），松手 emit 落 localStorage ──
const COL_W_MIN = 60
const COL_W_MAX = 320
const NAME_W_DEFAULT = 88
const NAME_W_MIN = 60
const NAME_W_MAX = 240
const ROW_H_DEFAULT = 30
const ROW_H_MIN = 30
const ROW_H_MAX = 400
// 收起态一行文字高（0.84rem×1.4 行距≈18.8px）：行高拖大后据此算 line-clamp 行数，文字铺满格子
const VIEW_LINE_H = 18.8

function rowKey(fieldKey: string) {
  return `${props.panel.templateId}::${fieldKey}`
}
function colKey(colIndex: number) {
  return `${props.panel.templateId}::${colIndex}`
}
function colWOf(colIndex: number) {
  return props.gridView.colWs[colKey(colIndex)] ?? props.gridView.colW
}
function cellStyle(colIndex: number) {
  return { width: `${colWOf(colIndex)}px` }
}
const nameCellStyle = computed(() => {
  const w = props.gridView.nameW[props.panel.templateId] ?? NAME_W_DEFAULT
  return { flex: `0 0 ${w}px`, width: `${w}px` }
})
function rowStyle(fieldKey: string) {
  const h = props.gridView.rowH[rowKey(fieldKey)]
  if (!h) return {}
  // 行高变大 → 收起态可见行数跟着涨（扣上下内边距约 9px），文字铺满而不是继续单行省略
  const clamp = Math.max(1, Math.floor((h - 9) / VIEW_LINE_H))
  return { '--ssp-cell-h': `${h}px`, '--ssp-clamp': String(clamp) }
}

let colStartX = 0
let colStartW = 0
let colResizeKey = ''
function onColResizeMove(event: MouseEvent) {
  if (!colResizeKey) return
  props.gridView.colWs[colResizeKey] = Math.min(COL_W_MAX, Math.max(COL_W_MIN, colStartW + (event.clientX - colStartX)))
  queueHbarSync()
}
function onColResizeUp() {
  window.removeEventListener('mousemove', onColResizeMove)
  window.removeEventListener('mouseup', onColResizeUp)
  emit('persistGridView')
}
function onColResizeDown(event: MouseEvent, colIndex: number) {
  event.preventDefault()
  colResizeKey = colKey(colIndex)
  colStartX = event.clientX
  colStartW = colWOf(colIndex)
  window.addEventListener('mousemove', onColResizeMove)
  window.addEventListener('mouseup', onColResizeUp)
}
function resetColW(colIndex: number) {
  delete props.gridView.colWs[colKey(colIndex)]
  queueHbarSync()
  emit('persistGridView')
}

let nameStartX = 0
let nameStartW = 0
function onNameResizeMove(event: MouseEvent) {
  props.gridView.nameW[props.panel.templateId] = Math.min(NAME_W_MAX, Math.max(NAME_W_MIN, nameStartW + (event.clientX - nameStartX)))
  queueHbarSync()
}
function onNameResizeUp() {
  window.removeEventListener('mousemove', onNameResizeMove)
  window.removeEventListener('mouseup', onNameResizeUp)
  emit('persistGridView')
}
function onNameResizeDown(event: MouseEvent) {
  event.preventDefault()
  nameStartX = event.clientX
  nameStartW = props.gridView.nameW[props.panel.templateId] ?? NAME_W_DEFAULT
  window.addEventListener('mousemove', onNameResizeMove)
  window.addEventListener('mouseup', onNameResizeUp)
}
function resetNameW() {
  delete props.gridView.nameW[props.panel.templateId]
  queueHbarSync()
  emit('persistGridView')
}

let rowStartY = 0
let rowStartH = 0
let rowResizeKey = ''
function onRowResizeMove(event: MouseEvent) {
  if (!rowResizeKey) return
  props.gridView.rowH[rowResizeKey] = Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, rowStartH + (event.clientY - rowStartY)))
  queueHbarSync()
}
function onRowResizeUp() {
  window.removeEventListener('mousemove', onRowResizeMove)
  window.removeEventListener('mouseup', onRowResizeUp)
  emit('persistGridView')
}
function onRowResizeDown(event: MouseEvent, fieldKey: string) {
  event.preventDefault()
  rowResizeKey = rowKey(fieldKey)
  rowStartY = event.clientY
  rowStartH = props.gridView.rowH[rowResizeKey] ?? ROW_H_DEFAULT
  window.addEventListener('mousemove', onRowResizeMove)
  window.addEventListener('mouseup', onRowResizeUp)
}
function resetRowH(fieldKey: string) {
  delete props.gridView.rowH[rowKey(fieldKey)]
  queueHbarSync()
  emit('persistGridView')
}

// ── 字段/值格菜单与加字段转发（渲染住父·payload 带屏幕坐标与目标字段）。readonly 时函数级拦截
//    （字段名格按钮在只读模式下仍保留点击区域展示名称，但不弹管理菜单——单点拦截比逐处模板 v-if 更不容易漏）。 ──
function emitFieldMenu(event: MouseEvent, field: StatusPanelFieldDef, rowIndex: number) {
  if (props.readonly) return
  emit('fieldMenu', { x: event.clientX, y: event.clientY, field, rowIndex })
}
function emitCellMenu(event: MouseEvent, field: StatusPanelFieldDef, cellIndex: number) {
  if (props.readonly) return
  emit('cellMenu', { x: event.clientX, y: event.clientY, field, cellIndex })
}
function emitAddField(event: MouseEvent) {
  if (props.readonly) return
  emit('openFieldEditor', { x: event.clientX, y: event.clientY })
}

// ── 草稿编辑（list/ref 增删改·就地改父的 draft 对象） ──
function listItemsOf(fieldKey: string): string[] {
  const value = props.draft[fieldKey]
  return Array.isArray(value) ? (value as string[]) : []
}

function setListItem(fieldKey: string, index: number, value: string) {
  const arr = [...listItemsOf(fieldKey)]
  arr[index] = value
  props.draft[fieldKey] = arr
}

function addListItem(fieldKey: string) {
  props.draft[fieldKey] = [...listItemsOf(fieldKey), '']
  queueHbarSync()
}

function removeListItem(fieldKey: string, index: number) {
  props.draft[fieldKey] = listItemsOf(fieldKey).filter((_, i) => i !== index)
  queueHbarSync()
}

function refIdsOf(fieldKey: string): string[] {
  const value = props.draft[fieldKey]
  return Array.isArray(value) ? value : []
}

function refCandidates(fieldKey: string) {
  return props.refCandidatesOf(props.panel.id, fieldKey)
}

function addRef(fieldKey: string, event: Event) {
  const select = event.target as HTMLSelectElement
  const refId = String(select.value || '').trim()
  select.value = ''
  if (!refId) return
  const current = refIdsOf(fieldKey)
  if (!current.includes(refId)) props.draft[fieldKey] = [...current, refId]
  queueHbarSync()
}

function removeRef(fieldKey: string, refId: string) {
  props.draft[fieldKey] = refIdsOf(fieldKey).filter((id) => id !== refId)
  queueHbarSync()
}

onMounted(() => {
  loadViewMode()
  // 视口尺寸变（拖侧栏宽/展开格撑高/开合副面板）重算横滑块；jsdom 无 ResizeObserver，守卫兼容测试环境
  if (typeof ResizeObserver !== 'undefined') {
    gridObserver = new ResizeObserver(() => syncHbar())
    if (gridEl.value) gridObserver.observe(gridEl.value)
  }
  queueHbarSync()
})
onBeforeUnmount(() => {
  gridObserver?.disconnect()
  gridObserver = null
  onThumbUp()
  // 兜底清掉可能残留的列宽/名称列/行高拖拽监听（拖到一半组件被卸载）
  window.removeEventListener('mousemove', onColResizeMove)
  window.removeEventListener('mouseup', onColResizeUp)
  window.removeEventListener('mousemove', onNameResizeMove)
  window.removeEventListener('mouseup', onNameResizeUp)
  window.removeEventListener('mousemove', onRowResizeMove)
  window.removeEventListener('mouseup', onRowResizeUp)
})

// 内容宽度变化（展开收起 / 换面板 / 字段增减）时 ResizeObserver 不感知 scrollWidth 变，主动重算
watch(() => [props.expandedCell, props.panel.id, props.fields.length], queueHbarSync)
watch(() => props.panel.id, loadViewMode)
// 另一卡拖列宽/名称列宽（同模板主副联动）也要重算横滑块（rowH 变多算一次无害）
watch(() => props.gridView, queueHbarSync, { deep: true })
</script>

<style scoped>
/* ⚠️ 联动能力标注：本组件从 ChatStatusSystemPanel.vue 抽出（批次D），
   五积木语义色 .ssp-tint-*、按钮 .ssp-btn* / .ssp-input / .ssp-hint / 表单 .ssp-form-* 与父面板同款——
   用户若要求统一改这些基础样式，父子两处要同步改。 */

.ssp-card {
  /* 橄榄色滑块单点（用户 2026-07-10 拍板：状态栏内滑块统一自定义橄榄色）——hbar/格内滚动/拖拽指示线共用 */
  --ssp-olive: #7f7f4d;
  background: var(--langhuan-paper-bg, #fffdf8);
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ssp-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 9px;
}

.ssp-view-switch { display: inline-flex; border: 1px solid var(--morandi-border, #d8d4ca); border-radius: 7px; overflow: hidden; }
.ssp-view-switch button { border: 0; border-right: 1px solid var(--morandi-border, #d8d4ca); padding: 4px 8px; background: transparent; color: var(--morandi-text-light, #81796f); font-size: .72rem; }
.ssp-view-switch button:last-child { border-right: 0; }
.ssp-view-switch button.active { background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 14%, transparent); color: var(--morandi-accent, #5c8a5c); }
.ssp-gcell--asset { position: relative; min-height: 86px; padding: 5px; display: grid; place-items: center; }
.ssp-gcell--asset img { width: 100%; height: 76px; object-fit: contain; image-rendering: pixelated; background: var(--morandi-soft-bg, #f1eee6); }
.ssp-asset-empty { color: var(--morandi-text-light, #918a80); font-size: .74rem; }
.ssp-asset-upload { position: absolute; right: 5px; bottom: 5px; border: 1px solid var(--morandi-border, #c8c3b8); border-radius: 5px; padding: 2px 6px; background: color-mix(in srgb, var(--morandi-card, #fffdf8) 92%, transparent); color: var(--morandi-accent, #5c8a5c); font-size: .68rem; cursor: pointer; }
.ssp-asset-upload input { display: none; }

/* 五积木语义色（tint 单点·与父面板/模板 tab 联动） */
.ssp-tint-char { background: rgba(92, 138, 92, 0.13); color: var(--morandi-accent, #5c8a5c); }
.ssp-tint-org { background: rgba(79, 134, 124, 0.13); color: var(--langhuan-dialog-primary-bg, #4f867c); }
.ssp-tint-bld { background: rgba(139, 115, 85, 0.13); color: var(--morandi-accent-brown, #8b7355); }
.ssp-tint-reg { background: rgba(111, 136, 163, 0.14); color: #6f88a3; }
.ssp-tint-item { background: rgba(160, 107, 125, 0.13); color: #a06b7d; }
.ssp-tint-any { background: rgba(138, 131, 120, 0.12); color: var(--morandi-text-light, #8a8378); }

.ssp-ctile {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ssp-ctile .line-icon {
  width: 17px;
  height: 17px;
}

.ssp-card-title {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ssp-card-name {
  font-weight: 700;
  font-size: 0.96rem;
  color: var(--morandi-text, #4f463f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.ssp-kind {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 9px;
}

.ssp-host {
  font-size: 0.74rem;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-icon-btn {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light, #9a9287);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.ssp-icon-btn:hover {
  background: rgba(139, 115, 85, 0.08);
  color: var(--morandi-text, #4f463f);
}

.ssp-icon-btn .line-icon {
  width: 14px;
  height: 14px;
}

/* 批次D：副面板浏览链（副卡头下的小面包屑） */
.ssp-side-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 12px 6px;
  font-size: 0.78rem;
  color: var(--morandi-text-light, #7b746b);
}

.ssp-crumb-link {
  border: none;
  background: transparent;
  padding: 0;
  font-size: inherit;
  color: var(--morandi-accent, #5c8a5c);
  cursor: pointer;
}

.ssp-crumb-current {
  color: var(--morandi-text, #4f463f);
  font-weight: 600;
}

.ssp-hint {
  font-size: 0.8rem;
  color: var(--morandi-text-light, #9a9287);
  padding: 2px 12px 10px;
}

/* ── T1 固定格子表格 + T2 自建横滑块（从父面板原样迁入·min-width:0 铁律整链保留） ── */
.ssp-grid-wrap {
  --ssp-cell-h: 30px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;   /* 全链 min-width:0：不被内层网格内容撑宽 */
}

/* 横向滚动容器：隐藏浏览器默认横向滚动条（自建横滑块接管）。
   min-width:0 是关键——否则 grid 被行 max-content 撑宽、整体溢出侧栏被外层裁切（滑块永不显示）。 */
.ssp-grid {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.ssp-grid::-webkit-scrollbar {
  display: none;
}

.ssp-grid-row {
  position: relative;   /* 行级行高手柄定位锚（指示线正骑行分界灰线） */
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 12px;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  border-top: 1px solid var(--morandi-border, #efe9df);
}

/* 行 hover 高亮（大表格看行对齐）：sticky 名称格需实底跟色防透字 */
.ssp-grid-row:hover {
  background: color-mix(in srgb, var(--morandi-border, #efe9df) 22%, transparent);
}

.ssp-grid-row:hover .ssp-gcell--name {
  background: color-mix(in srgb, var(--morandi-border, #efe9df) 22%, var(--langhuan-paper-bg, #fffdf8));
}

.ssp-grid-values {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 6px;
}

.ssp-gcell {
  box-sizing: border-box;
  /* 宽度由内联 cellStyle 按列下发（每列独立可拖）；ref 格保持 auto */
  position: relative;
  min-height: var(--ssp-cell-h);
  flex: 0 0 auto;
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
}

.ssp-gcell:not(.ssp-gcell--ref) {
  background: var(--langhuan-paper-bg, #faf7f1);
}

.ssp-gcell:focus-within {
  border-color: var(--morandi-accent, #5c8a5c);
}

/* 第一列字段名/类型定义格：横滚时 sticky 冻结在左缘（宽度由内联 nameCellStyle 下发·可拖可复位） */
.ssp-gcell--name {
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-color: transparent;
  color: var(--morandi-text-light, #7b746b);
  font-size: 0.8rem;
  position: sticky;
  left: 0;
  z-index: 2;
  box-shadow: 1px 0 0 var(--morandi-border, #efe9df);
}

.ssp-gcell:not(.ssp-gcell--ref).ssp-gcell--name {
  background: var(--langhuan-paper-bg, #fffdf8);
}

.ssp-gcell-name-txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 批次C：字段名格=行级编辑器入口（button 化重置默认样式） */
button.ssp-gcell--name {
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
}

button.ssp-gcell--name:hover .ssp-gcell-name-txt {
  color: var(--morandi-text, #4f463f);
}

/* 收起态值格：行高默认单行省略；行高拖大后按 --ssp-clamp 多行铺满（文字填满格子再省略） */
.ssp-gcell-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: calc(var(--ssp-cell-h) - 2px);
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--morandi-text, #4f463f);
  text-align: left;
  display: flex;
  align-items: center;
  overflow: hidden;
  cursor: text;
}

.ssp-gcell-txt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--ssp-clamp, 1);
  line-clamp: var(--ssp-clamp, 1);
  overflow: hidden;
  word-break: break-word;
  min-width: 0;
}

.ssp-gcell-view--num {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.ssp-gcell-view--empty {
  color: var(--morandi-text-light, #b3a89b);
}

.ssp-gcell--open {
  align-items: flex-start;
  height: auto;
}

.ssp-gcell-edit {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  max-height: 160px;
  border: none;
  background: transparent;
  padding: 5px 8px;
  font-size: 0.84rem;
  font-family: inherit;
  line-height: 1.4;
  color: var(--morandi-text, #4f463f);
  resize: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 格内竖滚=细橄榄滑块（用户拍板：格子里的滑块要细小） */
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 55%, transparent) transparent;
}

.ssp-gcell-edit::-webkit-scrollbar {
  width: 4px;
}

.ssp-gcell-edit::-webkit-scrollbar-track {
  background: transparent;
}

.ssp-gcell-edit::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 55%, transparent);
}

.ssp-gcell-edit::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 78%, transparent);
}

.ssp-gcell-edit:focus {
  outline: none;
}

.ssp-gcell-edit--num {
  font-variant-numeric: tabular-nums;
}

.ssp-gcell-edit--num::-webkit-outer-spin-button,
.ssp-gcell-edit--num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ssp-gcell-del {
  flex: 0 0 auto;
  align-self: center;
  border: none;
  background: transparent;
  padding: 0 4px;
  font-size: 0.82rem;
  line-height: 1;
  color: var(--morandi-text-light, #9a9287);
  cursor: pointer;
}

.ssp-gcell-del:hover {
  color: var(--morandi-text, #4f463f);
}

/* list 格 × 让开右缘列宽手柄（7px），防误触拖拽 */
.ssp-gcell--list .ssp-gcell-del {
  margin-right: 7px;
}

.ssp-gcell--ref {
  width: auto;
  min-width: 0;
  border-color: transparent;
}

.ssp-gcell-ref-jump {
  color: inherit;
  font-weight: 600;
  cursor: pointer;
}

.ssp-bind-mark {
  flex: 0 0 auto;
  font-size: 0.68rem;
  color: var(--morandi-accent-brown, #8b7355);
  border: 1px solid rgba(139, 115, 85, 0.35);
  border-radius: 4px;
  padding: 0 4px;
}

.ssp-input {
  box-sizing: border-box;
  background: var(--langhuan-paper-bg, #faf7f1);
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 0.84rem;
  font-family: inherit;
  color: var(--morandi-text, #4f463f);
}

.ssp-input:focus {
  outline: none;
  border-color: var(--morandi-accent, #5c8a5c);
}

/* select 去原生感（与父面板同款自绘 chevron·联动两处同步） */
select.ssp-input {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 26px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 12px;
  cursor: pointer;
}

.ssp-cell-add {
  border: 1px dashed var(--morandi-border, #cfc7ba);
  background: transparent;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.78rem;
  color: var(--morandi-text-light, #7b746b);
  cursor: pointer;
}

.ssp-cell-add:hover {
  border-color: var(--morandi-accent, #5c8a5c);
  color: var(--morandi-accent, #5c8a5c);
}

.ssp-ref-add {
  max-width: 130px;
  font-size: 0.78rem;
}

/* T3 列宽手柄（每格右缘·格内贴边不破 overflow:hidden·悬停染橄榄）：拖=改该列宽，双击=回默认 */
.ssp-cell-resize {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 7px;
  cursor: col-resize;
  z-index: 3;
}

.ssp-cell-resize::after {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  right: 1px;
  width: 2px;
  border-radius: 999px;
  background: transparent;
  transition: background-color 0.15s ease;
}

.ssp-cell-resize:hover::after,
.ssp-cell-resize:active::after {
  background: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 62%, transparent);
}

/* T3 行高手柄（行级横跨整行·真机反馈：指示线要与行分界灰线齐平——线中心正压行盒底缘=下一行 border-top） */
.ssp-row-resize {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -3.5px;
  height: 7px;
  cursor: row-resize;
  z-index: 3;
}

.ssp-row-resize::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: transparent;
  transition: background-color 0.15s ease;
}

.ssp-row-resize:hover::after,
.ssp-row-resize:active::after {
  background: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 62%, transparent);
}

/* T2 自建横向滑块（sticky 吸底 + bottom:16px 上移·两条铁律别退回：链 min-width:0 别删 / 别退 relative-bottom:0）
   色系=橄榄单点 --ssp-olive（用户 2026-07-10 拍板·与格内滚动条/拖拽指示线统一） */
.ssp-hbar {
  position: sticky;
  bottom: 16px;
  z-index: 3;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 42%, transparent);
  cursor: pointer;
}

.ssp-hbar-thumb {
  position: absolute;
  top: 0;
  left: 0;
  height: 8px;
  min-width: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 58%, transparent);
  cursor: grab;
  transition: background-color 0.15s ease;
}

.ssp-hbar-thumb:hover {
  background: color-mix(in srgb, var(--ssp-olive, #7f7f4d) 78%, transparent);
}

.ssp-hbar-thumb:active {
  cursor: grabbing;
  background: var(--ssp-olive, #7f7f4d);
}

/* 飞书式表内加字段行：贴网格末行、左标签 sticky 横滚不跑、hover 整行高亮 */
.ssp-grid-addrow {
  display: block;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  margin-bottom: 26px;   /* 给 sticky 横滑块（bottom:16px + 8px 高）让出吸底空间，不遮加字段行 */
  border: none;
  border-top: 1px solid var(--morandi-border, #efe9df);
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.ssp-addrow-label {
  position: sticky;
  left: 0;
  display: inline-block;
  padding: 7px 12px 8px;
  font-size: 0.8rem;
  color: var(--morandi-text-light, #7b746b);
}

.ssp-grid-addrow:hover {
  background: color-mix(in srgb, var(--morandi-border, #efe9df) 30%, transparent);
}

.ssp-grid-addrow:hover .ssp-addrow-label {
  color: var(--morandi-accent, #5c8a5c);
}

/* ── 无字段兜底加字段 ── */
.ssp-add-field-row {
  padding: 6px 12px 10px;
}

.ssp-btn {
  min-width: 64px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  border-radius: 8px;
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.ssp-btn--primary {
  border-color: var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.ssp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ssp-card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px 9px;
  margin-top: auto;
  border-top: 1px solid var(--morandi-border, #efe9df);
  background: var(--langhuan-paper-bg, #faf7f1);
}

</style>
