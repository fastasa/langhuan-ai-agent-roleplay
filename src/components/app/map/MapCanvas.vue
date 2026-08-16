<template>
  <div ref="bodyEl" class="lhmap-body" :class="{ 'lhmap-body--compact': compact }" :style="MAP_COLOR_VARS">
    <svg
      ref="svgEl"
      class="lhmap-svg"
      :class="{ dragging }"
      :data-view="view"
      :tabindex="compact || editMode ? 0 : undefined"
      :aria-label="compact ? t('chat.mapPan') : (editMode ? t('chat.mapEdit') : undefined)"
      xmlns="http://www.w3.org/2000/svg"
      @dblclick="onDoubleClick"
      @keydown="onEditKeydown"
    >
      <defs ref="defsEl"></defs>
      <g data-g="terrain"></g>
      <g data-g="civic"></g>
      <!-- 网格坐标层（地图草案剪影可视化计划批4）：保留原图层顺序；战争迷雾已退出渲染，
           status/labels/draft 之下（不压过要素标签与草案标注）。 -->
      <g data-g="grid"></g>
      <g data-g="status" :class="{ off: !statusOn }"></g>
      <g data-g="chars" :class="{ off: !statusOn }"></g>
      <g data-g="labels"></g>
      <!-- 人工编辑实时预览层：正式要素仍是持久真值；拖动参数时只重建本层，不重挂画布与视角。 -->
      <g data-g="edit"></g>
      <!-- 草案剪影层（地图草案剪影可视化计划批2）：绘舆草案轮结构化产出的纯前端预览，
           叠在既有要素之上；与其余要素同一坐标变换管线（随 viewBox 缩放平移），不参与迷雾遮挡判断。 -->
      <g data-g="draft"></g>
      <!-- 对照模式幽灵层（批L 地图版本历史）：已删除要素的红色虚线轮廓，恒在最上、不参与点选 -->
      <g data-g="diff"></g>
    </svg>

    <!-- Shift+拖拽框选橡皮筋（真机返工批A·草案模式多选）：纯屏幕像素定位浮层，不吃 viewBox 缩放变换 -->
    <div v-if="boxSelectRect" class="lhmap-boxselect" :style="boxSelectStyle"></div>

    <div v-if="!compact" class="lhmap-float lhmap-legend" :class="{ closed: legendClosed }">
      <header @click="legendClosed = !legendClosed">
        <b>{{ t('chat.mapLegend') }}</b>
        <svg class="lhmap-licon" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </header>
      <ul v-if="!legendClosed">
        <li v-for="item in legendItems" :key="item.label">
          <span class="sw" :style="item.swatch"></span>
          {{ item.label }}
        </li>
      </ul>
    </div>

    <div v-if="!compact" class="lhmap-float lhmap-badges">
      <div class="lhmap-north" :title="t('chat.mapNorthUp')"><span>N</span></div>
    </div>

    <div class="lhmap-float lhmap-zoom">
      <button type="button" :title="t('chat.mapZoomIn')" @click="onZoomButton(1.5)">
        <svg class="lhmap-licon" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
      </button>
      <button type="button" :title="t('chat.mapZoomOut')" @click="onZoomButton(1 / 1.5)">
        <svg class="lhmap-licon" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
      </button>
      <button v-if="!compact" type="button" :title="t('chat.mapZoomFit')" @click="onFitButton">
        <svg class="lhmap-licon" viewBox="0 0 24 24"><line x1="2" x2="5" y1="12" y2="12" /><line x1="19" x2="22" y1="12" y2="12" /><line x1="12" x2="12" y1="2" y2="5" /><line x1="12" x2="12" y1="19" y2="22" /><circle cx="12" cy="12" r="7" /></svg>
      </button>
    </div>

    <div v-if="!compact" class="lhmap-float lhmap-foot">
      <div class="lhmap-scalebar">
        <div class="num">{{ scaleText }}</div>
        <div class="bar" :style="{ width: scaleBarWidth + 'px' }"></div>
      </div>
      <div v-if="info" class="lhmap-info"><b>{{ info.name }}</b> · {{ info.detail }}</div>
      <!-- 网格坐标 hover 提示（批4）：不新建浮层，复用既有信息条；仅在未弹出要素信息时显示 -->
      <div v-else-if="gridHoverText" class="lhmap-info">{{ gridHoverText }}</div>
    </div>

    <div v-if="!compact && pop" ref="popEl" class="lhmap-pop" :class="`lhmap-pop--${pop.data.kind}`">
      <header>
        <span class="pop-ic">
          <svg v-if="pop.data.kind === 'character'" class="lhmap-licon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
          <svg v-else-if="pop.data.kind === 'organization'" class="lhmap-licon" viewBox="0 0 24 24"><path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" /></svg>
          <svg v-else class="lhmap-licon" viewBox="0 0 24 24"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M10 8h4" /><path d="M10 12h4" /><path d="M10 16h4" /></svg>
        </span>
        <b>{{ pop.data.title }}</b>
        <span class="pop-kind">{{ pop.data.kindLabel }}</span>
      </header>
      <div class="pop-note">{{ pop.data.note }}</div>
      <table>
        <tbody>
          <tr v-for="row in pop.data.rows" :key="row[0]">
            <td>{{ row[0] }}</td>
            <td>{{ row[1] }}</td>
          </tr>
        </tbody>
      </table>
      <footer>
        <small>{{ t('chat.mapPanelLinkHint') }}</small>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  catmullRomOpen, centroid, civicRegionBucket, computeMapGridSpec, elevationTint, ELEVATION_BANDS,
  fmtArea, fmtDist, formatMapGridRef, hashStr, mapGridColumnLetter, mulberry32, pathLength, polyToPath, principalAxis,
  resolveElevationM, roughen, shoelace, specialSurfaceColorVar,
  type MapChangeHighlight, type MapFeature, type MapGridSpec, type MapPoint, type MapWorldData
} from '../../../app/mapGeometry'
import { MAP_COLOR_VARS, type MapPanelData } from '../../../app/mapPresentation'
import { computeMapTaskFrame } from '../../../app/mapTaskFrame'
import type { HuiyuDraftSketchItem } from '../../../app/huiyuSubagent'
import type { MapDraftReviewItem } from '../../../app/mapDraftReview'
import type { MapGeometryEditDraft } from '../../../app/mapGeometryEditing'

type MapDraftDisplayItem = HuiyuDraftSketchItem | MapDraftReviewItem

const props = withDefaults(defineProps<{
  world: MapWorldData
  panels: Record<string, MapPanelData>
  view: 'terrain' | 'civic'
  statusOn: boolean
  /** 按宿主过滤资产分布（批7）：非空=只有此集合内 feature.id 保持全不透明，其余淡出；null/未传=不过滤。 */
  highlightFeatureIds?: Set<string> | null
  /** 对照模式（批L 地图版本历史）：非空=变更集三色强调（add 绿/update 琥珀/delete 红虚线幽灵）、其余变灰；
   *  优先级高于 highlightFeatureIds（两者同时给时资产过滤不生效）。随 :key 重挂生效（命令式建景，不动态改景）。 */
  changeHighlight?: MapChangeHighlight | null
  /** 草案剪影清单（地图草案剪影可视化计划批2）：非空即进入草案模式——既有要素整体压灰淡出、
   *  不响应点击，按 confidence 三色叠加渲染剪影。纯前端预览，不入库不走硬门。 */
  draftSketches?: HuiyuDraftSketchItem[] | null
  /** 新写链最终矢量草稿：几何已完成全部硬校验，确认后原样落库，不再由模型重画。 */
  draftReviewItems?: MapDraftReviewItem[] | null
  /** 已选中的剪影 id 集合：命中项加粗描边+发光选中态。 */
  selectedSketchIds?: string[] | null
  /** 剪影决策标记（批2）：id→当前三态标记，驱动剪影上叠加的 ✓/✗/✎ 角标。 */
  sketchMarks?: Record<string, 'accepted' | 'rejected' | 'commented'> | null
  /** 网格坐标系开关（地图草案剪影可视化计划批4）：开启后叠加列字母+行数字网格（由当前内容工作框派生）
   *  + 随平移缩放贴边跟随的边缘标签，帮助人图对位。缺省 false=零变化（不建网格层）。 */
  showGrid?: boolean
  /** 决策清单面板"点击行居中该剪影"请求（真机返工批A）：{id,nonce} 结构而非纯 id字符串——
   *  同一 id 连续两次点击也要能再次居中，纯 id 在 Vue 里值不变不会重新触发 watch，靠 nonce 递增强制触发。 */
  focusSketch?: { id: string; nonce: number } | null
  /** 头部悬浮预览等紧凑宿主：仍用同一渲染与视角交互，只隐藏图例/状态弹卡/比例尺等完整工作区信息。 */
  compact?: boolean
  /** 人工参数编辑模式：点击正式要素改为上抛选择，不再打开状态卡。 */
  editMode?: boolean
  /** 当前逻辑地形对应的底层要素 id（山脉可有 2~3 层）。 */
  selectedFeatureIds?: string[] | null
  /** 参数调整后的纯前端预览；正式保存前不写入 world。 */
  editPreviewFeatures?: MapFeature[] | null
  /** 山脉骨架或结构化 polygon/path 的统一控制点草稿。 */
  editGeometry?: MapGeometryEditDraft | null
  /** 当前选中的控制点序号；只属于编辑会话视图态。 */
  selectedEditPointIndex?: number | null
}>(), { showGrid: false, compact: false, editMode: false })

const emit = defineEmits<{
  /** 点击带锚点要素、且非样例弹卡命中时上抛（批7·真实世界状态栏联动）：null=收起父持有的卡片。
   *  x/y 是相对 .lhmap-body 左上角的屏幕坐标（父可直接拿去定位悬浮卡）。 */
  (e: 'open-status-panel', payload: { links: { panelId?: string; hostType?: string; hostId?: string }; x: number; y: number } | null): void
  /** 点击草案剪影上抛（批2）：clientX/clientY 是原生视口坐标（父用来定位锚定信息卡）。 */
  (e: 'sketch-click', payload: { id: string; shiftKey: boolean; ctrlKey: boolean; clientX: number; clientY: number }): void
  /** Shift+拖拽框选命中的剪影 id 集合上抛（真机返工批A）：父级按"加入选中"语义合并，不替换既有选中集。 */
  (e: 'sketch-box-select', payload: { ids: string[] }): void
  /** 人工编辑模式点选正式要素；null=点到空白。 */
  (e: 'feature-select', payload: { id: string } | null): void
  (e: 'edit-point-select', payload: { index: number } | null): void
  (e: 'edit-point-move', payload: { index: number; point: MapPoint; disableSnap: boolean }): void
  (e: 'edit-segment-insert', payload: { segmentIndex: number; point: MapPoint }): void
  (e: 'edit-point-delete', payload: { index: number }): void
}>()

const { t } = useI18n()
const SVG_NS = 'http://www.w3.org/2000/svg'

// 草案模式（批2）：draftSketches 非空即进入——既有要素整体压灰、不响应点击，见 applyHighlightFilter/handleTap。
const draftItems = computed<MapDraftDisplayItem[]>(() => props.draftReviewItems?.length ? props.draftReviewItems : (props.draftSketches || []))
const isDraftMode = computed(() => draftItems.value.length > 0)

const bodyEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const defsEl = ref<SVGDefsElement | null>(null)
const popEl = ref<HTMLElement | null>(null)

const state = reactive({ cx: 6000, cy: 4200, scale: 0.08, W: 800, H: 600 })
const dragging = ref(false)
const legendClosed = ref(false)
// Shift+拖拽框选橡皮筋（真机返工批A·草案模式多选）：纯屏幕像素矩形，onPointerMove 里实时更新四角，
// onPointerEnd 换算世界坐标做命中判定后清空。null=不显示（非框选中）。
const boxSelectRect = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const boxSelectStyle = computed(() => {
  const rect = boxSelectRect.value
  if (!rect || !bodyEl.value) return {}
  const r = bodyEl.value.getBoundingClientRect()
  const x0 = Math.min(rect.x0, rect.x1) - r.left
  const y0 = Math.min(rect.y0, rect.y1) - r.top
  const w = Math.abs(rect.x1 - rect.x0)
  const h = Math.abs(rect.y1 - rect.y0)
  return { left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' }
})
const scaleText = ref('1 km')
const scaleBarWidth = ref(80)
const info = ref<{ name: string; detail: string } | null>(null)
const pop = ref<{ data: MapPanelData; anchor: MapPoint } | null>(null)

// marker 图标（Lucide 风格线性 stroke 渲染，24x24 视框；批2 十个新类目手写简洁线性 path·找不到贴切 Lucide 原图标时的做法）
const MARKER_ICONS: Record<string, string> = {
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 8h4"/><path d="M10 12h4"/><path d="M10 16h4"/>',
  organization: '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  landmark: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  ferry: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
  character: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  // 批2 新增十类（2026-07-11 地图视觉大改）
  capital: '<path d="M4 18h16v3H4z"/><path d="m4 18 1.6-8L10 14l2-7 2 7 4.4-4L20 18"/>',
  castle: '<path d="M4 21V10h3V7h2v3h2V7h2v3h2V7h2v3h3v11z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
  temple: '<path d="M2 10 12 3l10 7"/><path d="M3 21h18"/><path d="M4 21V12M8 21V12M12 21V12M16 21V12M20 21V12"/>',
  ruin: '<path d="M9 21h6"/><path d="M8 3h8v3H8z"/><path d="M10 6v8l-2 7"/><path d="M14 6v5l3 8"/>',
  mine: '<path d="M4 20 13 11"/><path d="M11 3c3 .7 5.3 3 6 6l-3.5 3.5c-3-.7-5.3-3-6-6z"/>',
  cave: '<path d="m2 20 6-11 4 6 3-4 7 9z"/><path d="M9.5 20a2.5 2.5 0 0 1 5 0"/>',
  port: '<path d="M12 2v10"/><path d="M12 4 16 10H12z"/><path d="M5 21 7 14h10l2 7z"/>',
  gate: '<path d="M4 21V8"/><path d="M20 21V8"/><path d="M2 8h20"/><path d="M4 5h16"/>',
  inn: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v9"/><path d="M2 17h20"/><path d="M6 8V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/>',
  tower: '<path d="M9 21V9h6v12"/><path d="M7 9h10L15 5H9z"/><path d="M12 5V2"/>'
}

const categoryNames = computed<Record<string, string>>(() => ({
  mountain: t('chat.mapCatMountain'), forest: t('chat.mapCatForest'), grass: t('chat.mapCatGrass'),
  plateau: t('chat.mapCatPlateau'), water: t('chat.mapCatWater'), river: t('chat.mapCatRiver'),
  urban: t('chat.mapCatUrban'), road: t('chat.mapCatRoad'), street: t('chat.mapCatStreet'), wall: t('chat.mapCatWall'),
  building: t('chat.mapCatBuilding'), organization: t('chat.mapCatOrganization'), landmark: t('chat.mapCatLandmark'),
  ferry: t('chat.mapCatFerry'), character: t('chat.mapCatCharacter'),
  // 批2 新增类目（2026-07-11 地图视觉大改）：region 六类 + path 四类 + marker 十类
  hill: t('chat.mapCatHill'), desert: t('chat.mapCatDesert'), swamp: t('chat.mapCatSwamp'),
  ice: t('chat.mapCatIce'), jungle: t('chat.mapCatJungle'), farmland: t('chat.mapCatFarmland'),
  border: t('chat.mapCatBorder'), canal: t('chat.mapCatCanal'), trail: t('chat.mapCatTrail'), bridge: t('chat.mapCatBridge'),
  capital: t('chat.mapCatCapital'), castle: t('chat.mapCatCastle'), temple: t('chat.mapCatTemple'),
  ruin: t('chat.mapCatRuin'), mine: t('chat.mapCatMine'), cave: t('chat.mapCatCave'), port: t('chat.mapCatPort'),
  gate: t('chat.mapCatGate'), inn: t('chat.mapCatInn'), tower: t('chat.mapCatTower')
}))

// 图例（地图视觉大改批1）：地形页=海拔色阶条（8 档色块+米数刻度·数字不做 i18n，与 fmtArea/fmtDist 同惯例）
// +水域/裙边；战争迷雾已退出显示。人文页保持类目色块。
type LegendItem = { label: string; swatch: string }
const legendItems = computed<LegendItem[]>(() => {
  const items: LegendItem[] = []
  if (props.view === 'terrain') {
    for (const band of ELEVATION_BANDS) {
      const label = band.max === Infinity ? `≥${band.min}m` : `${band.min}~${band.max}m`
      items.push({ label, swatch: `background:${band.color}` })
    }
    // 特殊地表专色三条（批2）：desert/swamp/ice 盖过海拔色带，图例单列（不套用色阶条）
    items.push(
      { label: categoryNames.value.desert, swatch: 'background:var(--mc-special-desert)' },
      { label: categoryNames.value.swamp, swatch: 'background:var(--mc-special-swamp)' },
      { label: categoryNames.value.ice, swatch: 'background:var(--mc-special-ice)' },
      { label: t('chat.mapCatWater'), swatch: 'background:var(--mc-water-terrain);border-color:var(--mc-coast-terrain)' },
      { label: t('chat.mapLegendWaterCollar'), swatch: 'background:var(--mc-water-collar)' }
    )
  } else {
    items.push(
      { label: t('chat.mapCatUrban'), swatch: 'background:var(--mc-urban);border-color:var(--mc-urban-s)' },
      { label: t('chat.mapCatRoad'), swatch: 'height:3px;border-radius:2px;border:0;background:var(--mc-road)' },
      { label: t('chat.mapCatWall'), swatch: 'height:3px;border:0;background:var(--mc-wall)' },
      // border 疆界（批2）：唯一补进人文图例的新线状类目——有独立视觉语义（灰虚点线），其余新线状类目不加，防图例爆长
      { label: categoryNames.value.border, swatch: 'height:3px;border:0;background:var(--mc-border)' },
      { label: t('chat.mapLegendBuilding'), swatch: 'border-radius:50%;background:#FFFDF8;border-color:var(--mc-building)' }
    )
  }
  if (props.statusOn) {
    items.push(
      { label: t('chat.mapLegendStatusAnchor'), swatch: 'border-radius:50%;border:1.6px dashed #5C8A5C;background:none' },
      { label: t('chat.mapLegendCharPos'), swatch: 'border-radius:50%;background:var(--mc-character);border-color:var(--mc-character)' }
    )
  }
  return items
})

// ---- 场景构建（命令式生成 SVG 要素：数量动态且量大，不走模板） ----
type Groups = Record<'terrain' | 'civic' | 'grid' | 'status' | 'chars' | 'labels' | 'edit' | 'draft' | 'diff', SVGGElement>
let groups: Groups | null = null
// civic/terrain 层内固定绘制顺序 region→path→marker（真机修 #31：城区曾按 features 数组顺序盖住道路）：
// 各层内建三个子 <g>，靠 DOM 先后天然定层级（region 垫底、path 居中、marker 最上），不受 features 数组顺序影响。
type LayerSubgroups = { region: SVGGElement; path: SVGGElement; marker: SVGGElement }
let terrainSub: LayerSubgroups | null = null
let civicSub: LayerSubgroups | null = null
const markerRefs: Array<{ el: SVGGElement; f: MapFeature }> = []
// 对照模式幽灵 marker（批L）：删除快照里的 marker 画成红虚线圆，半径随缩放在 render() 里重算（非 scaling 视觉恒定）
const ghostMarkerRefs: SVGCircleElement[] = []
const labelRefs: Array<{ el: SVGTextElement; f: MapFeature; markerLabel?: boolean; dx?: number; dy?: number }> = []
const lodRefs: Array<{ el: SVGElement; min: number }> = []
const statusRefs: Array<{ f: MapFeature; kind: 'marker' | 'region'; d?: string; el?: SVGGElement }> = []
const featureById: Record<string, MapFeature> = {}
// 草案剪影层（批2）：label/badge 复用既有「屏幕恒定尺寸」手法（字号/偏移随缩放 render() 里除以 k），
// 与 labelRefs 分开维护——sketch 是独立于 features 数组的临时预览数据，且不参与 view/labelMin 等既有过滤逻辑。
const draftLabelRefs: Array<{ el: SVGTextElement; anchor: MapPoint }> = []
// 决策角标（真机返工批A 重做）：background 圆点+glyph 一组 <g>，用与 markerRefs 相同的
// 「世界坐标 translate + scale(1/k)」屏幕恒定手法（比"字号除以k"更适合圆点+字符组合整体缩放）。
// 锚点改用剪影包围盒右上角（draftSketchBBox），不再沿用 draftSketchAnchor——旧实现把角标钉在
// label 同一 y 高度、仅 x 偏移 18px，长标签（如「凯拉佩克斯山脉·底座」）下角标会被 label 自身的白色
// 描边文字整个盖住，这是真机反馈"决策点了但看不出变化"的根因之一。
const draftBadgeRefs: Array<{ el: SVGGElement; anchor: MapPoint }> = []
const editHandleRefs: Array<{ el: SVGCircleElement; selected: boolean }> = []
// marker 剪影协议只给 center（无 rx/ry），固定世界坐标半径（米）纯示意——与 region/path 剪影一样吃 viewBox
// 自然缩放，不需要像真 marker 那样做 1/k 屏幕恒定补偿。
const DRAFT_MARKER_SKETCH_RADIUS_M = 220

// 网格坐标层（地图草案剪影可视化计划批4）：列/行边缘标签的世界坐标（列锚 x/行锚 y 固定不变），
// 屏幕坐标（贴边跟随视口）在 render() 里按当前 viewBox 顶/左边缘重算——手法同 draftLabelRefs 的
// 「屏幕恒定尺寸（除以 k）」，只是这里连位置也要跟随视口边缘，不止字号。
const gridColLabelRefs: Array<{ el: SVGTextElement; x: number }> = []
const gridRowLabelRefs: Array<{ el: SVGTextElement; y: number }> = []
/** 当前网格规格（showGrid=false 或未挂载时为 null）：buildGrid() 写入，hover 换算读取，两处共享同一份真值。 */
let currentGridSpec: MapGridSpec | null = null
/** 边缘标签距视口边缘的屏幕像素偏移（换算成世界单位时除以 k，与其余屏幕恒定手法一致）。 */
const GRID_LABEL_EDGE_PAD_PX = 13
/** hover 坐标提示文案（批4）：接进既有 .lhmap-info 信息条，不新建浮层；showGrid=false 时恒空串。 */
const gridHoverText = ref('')

function make<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  parent.appendChild(e)
  return e
}

function mapDisplayFrame() {
  // 纸白无限工作平面没有正式边界：首屏只按当前矢量内容取框。模型任务投影会在调用处另加留白，
  // 两者共用 mapTaskFrame 纯函数，但视图贴合与模型工作框各自决定 padding。
  const draftPointSets = draftItems.value.flatMap((item) => {
    if ('previewFeatures' in item) return item.previewFeatures.map((feature) => feature.pts)
    const sketch = item.sketch || {}
    return sketch.points?.length ? [sketch.points] : sketch.center ? [[sketch.center]] : []
  })
  return computeMapTaskFrame([
    ...props.world.features.map((feature) => feature.pts),
    ...draftPointSets
  ], {
    paddingRatio: 0,
    minPaddingM: 0
  })
}

// region 渲染（地图视觉大改批1+批2）：散布符号引擎+山脉特判整体退役，绝大多数地形/civic 面状类目统一走
// 「碎折色块+海拔分层设色」——地形视图 fill=elevationTint(elevation)（desert/swamp/ice 三类走专色盖过，见
// specialSurfaceColorVar）、人文视图 fill=civicRegionBucket 三色底二桶之一，靠 CSS [data-view] 选择器在
// 同一份 DOM 上切色（不建双份几何）。water/urban 各自独立处理（urban 静态白斑，不参与海拔配色）。
const ELEV_REGION_CATEGORIES = new Set(['mountain', 'forest', 'grass', 'plateau', 'hill', 'desert', 'swamp', 'ice', 'jungle', 'farmland'])

function waterDepthClass(f: MapFeature): string {
  const ratio = Number(f.waterDepthRatio)
  if (!Number.isFinite(ratio)) return ''
  if (ratio < 0.25) return ' f-water-depth--shallow'
  if (ratio < 0.8) return ' f-water-depth--mid'
  return ' f-water-depth--deep'
}

function buildRegion(f: MapFeature) {
  if (!groups || !terrainSub || !civicSub) return
  const rng = mulberry32(hashStr(f.id))
  const target = (f.layer === 'terrain' ? terrainSub : civicSub).region
  const r = f.rough || { iter: 2, amp: f.category === 'water' ? 0.1 : 0.12 }
  const pts = roughen(f.pts.map((p) => p.slice() as MapPoint), r.iter, r.amp, rng)
  const d = polyToPath(pts, true)

  if (f.category === 'water') {
    // 深水底（data-fid 挂在这层承接点击热区）+ 浅水裙边（terrain 专属·非 scaling stroke 风格化贴岸）+ 海岸描边
    make('path', { d, class: 'f-water-fill' + waterDepthClass(f) + (f.links ? ' has-link' : ''), 'data-fid': f.id }, target)
    if (f.waterRole !== 'depth-band') {
      make('path', { d, class: 'f-water-collar' }, target)
      make('path', { d, class: 'f-water-coast' }, target)
    }
  } else if (ELEV_REGION_CATEGORIES.has(f.category)) {
    const elevation = resolveElevationM(f.category, f.elevationM)
    const bucket = civicRegionBucket(f.category, f.elevationM)
    const cls = 'f-region f-elev f-civic-' + bucket + (f.links ? ' has-link' : '')
    const el = make('path', { d, class: cls, 'data-fid': f.id }, target)
    // 特殊地表专色（批2）：desert/swamp/ice 在地形视图用专色 var() 盖过海拔色带；渲染端只查表消费，不自判类目
    const specialVar = specialSurfaceColorVar(f.category)
    el.style.setProperty('--mc-elev-fill', specialVar ? `var(${specialVar})` : elevationTint(elevation))
  } else {
    // urban 城镇：只在人文视图出现（civic 层地形视图整体隐藏），静态白斑无需海拔色
    make('path', { d, class: 'f-region f-urban' + (f.links ? ' has-link' : ''), 'data-fid': f.id }, target)
  }
  if (f.links) statusRefs.push({ f, kind: 'region', d })
}

/**
 * 编辑预览覆盖参数化 region 与结构化 path；控制点草稿同层叠加但拥有独立命中节点。
 * 它们都不写 data-fid；变化只替换这一小层 SVG，不会重置用户的缩放和平移。
 */
function buildEditPreview() {
  if (!groups) return
  const editGroup = groups.edit
  editGroup.replaceChildren()
  editHandleRefs.length = 0
  for (const f of props.editPreviewFeatures || []) {
    if (!f.pts?.length) continue
    if (f.kind === 'path') {
      make('path', {
        d: catmullRomOpen(f.pts),
        class: 'f-map-path lhmap-edit-preview lhmap-edit-preview--path',
        'data-edit-fid': f.id
      }, editGroup)
      continue
    }
    if (f.kind !== 'region') continue
    const rng = mulberry32(hashStr(f.id))
    const rough = f.rough || { iter: 2, amp: f.category === 'water' ? 0.1 : 0.12 }
    const d = polyToPath(roughen(f.pts.map((point) => point.slice() as MapPoint), rough.iter, rough.amp, rng), true)
    if (f.category === 'water') {
      make('path', { d, class: `f-water-fill${waterDepthClass(f)} lhmap-edit-preview`, 'data-edit-fid': f.id }, editGroup)
    } else if (ELEV_REGION_CATEGORIES.has(f.category)) {
      const elevation = resolveElevationM(f.category, f.elevationM)
      const bucket = civicRegionBucket(f.category, f.elevationM)
      const el = make('path', { d, class: `f-region f-elev f-civic-${bucket} lhmap-edit-preview`, 'data-edit-fid': f.id }, editGroup)
      const specialVar = specialSurfaceColorVar(f.category)
      el.style.setProperty('--mc-elev-fill', specialVar ? `var(${specialVar})` : elevationTint(elevation))
    } else {
      make('path', { d, class: 'f-region f-urban lhmap-edit-preview', 'data-edit-fid': f.id }, editGroup)
    }
  }
  const geometry = props.editGeometry
  if (!geometry?.points?.length) return
  const points = geometry.points
  const segmentCount = geometry.topology === 'closed' ? points.length : points.length - 1
  const guideD = polyToPath(points, geometry.topology === 'closed')
  make('path', { d: guideD, class: 'lhmap-edit-guide' }, editGroup)
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % points.length
    const [a, b] = [points[index], points[next]]
    make('path', {
      d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`,
      class: 'lhmap-edit-segment-hit',
      'data-edit-segment-index': index
    }, editGroup)
  }
  points.forEach((point, index) => {
    const selected = props.selectedEditPointIndex === index
    const handle = make('circle', {
      cx: point[0], cy: point[1], r: 6,
      class: `lhmap-edit-handle${selected ? ' is-selected' : ''}`,
      'data-edit-point-index': index
    }, editGroup)
    editHandleRefs.push({ el: handle, selected })
  })
}

// 大区域名：沿主轴（或山脉脊线）斜排大字距铺满（textPath；中文防侧躺 clamp ±0.56rad）
function makeSprawl(f: MapFeature) {
  if (!groups || !defsEl.value) return
  const nudge = f.labelNudge || [0, 0]
  const chars = f.name.length
  const maxTilt = 0.56
  let p1: MapPoint; let p2: MapPoint; let ctrl: MapPoint; let fs: number; let ls: number
  if (f.spine) {
    const s0 = f.spine[0]; const s1 = f.spine[f.spine.length - 1]
    const dx = s1[0] - s0[0]; const dy = s1[1] - s0[1]; const L = Math.hypot(dx, dy)
    let ux = dx / L; let uy = dy / L
    const cx = (s0[0] + s1[0]) / 2 + uy * 1050 + nudge[0]
    const cy = (s0[1] + s1[1]) / 2 - ux * 1050 + nudge[1]
    if (ux < 0) { ux = -ux; uy = -uy }
    const th = Math.max(-maxTilt, Math.min(maxTilt, Math.atan2(uy, ux)))
    ux = Math.cos(th); uy = Math.sin(th)
    const half = L * 0.42
    p1 = [cx - ux * half, cy - uy * half]
    p2 = [cx + ux * half, cy + uy * half]
    ctrl = [cx + uy * L * 0.05, cy - ux * L * 0.05]
    fs = Math.max(300, Math.min(700, L * 0.11))
    ls = Math.max(fs * 0.2, (half * 2 - chars * fs) / Math.max(1, chars - 1) * 0.8)
  } else {
    const ax = principalAxis(f.pts)
    const th2 = Math.max(-maxTilt, Math.min(maxTilt, ax.theta))
    const cos = Math.cos(th2); const sin = Math.sin(th2)
    let mn = 1e18; let mx = -1e18
    for (const p of f.pts) {
      const tt = (p[0] - ax.c[0]) * cos + (p[1] - ax.c[1]) * sin
      mn = Math.min(mn, tt); mx = Math.max(mx, tt)
    }
    const span = mx - mn
    fs = Math.max(300, Math.min(700, span * 0.1))
    const half2 = span * 0.34
    const c2: MapPoint = [ax.c[0] + nudge[0], ax.c[1] + nudge[1]]
    p1 = [c2[0] - cos * half2, c2[1] - sin * half2]
    p2 = [c2[0] + cos * half2, c2[1] + sin * half2]
    ctrl = [c2[0] - sin * span * 0.04, c2[1] + cos * span * 0.04]
    ls = Math.max(fs * 0.15, (half2 * 2 - chars * fs) / Math.max(1, chars - 1) * 0.8)
  }
  const pid = 'lhmap-lp-' + f.id
  make('path', { id: pid, d: `M${p1[0].toFixed(0)} ${p1[1].toFixed(0)} Q${ctrl[0].toFixed(0)} ${ctrl[1].toFixed(0)} ${p2[0].toFixed(0)} ${p2[1].toFixed(0)}`, fill: 'none' }, defsEl.value)
  const text = make('text', { class: 'mlabel-big', 'font-size': fs.toFixed(0), 'letter-spacing': ls.toFixed(0) }, groups.labels)
  const tp = document.createElementNS(SVG_NS, 'textPath')
  tp.setAttribute('href', '#' + pid)
  tp.setAttribute('startOffset', '50%')
  tp.setAttribute('text-anchor', 'middle')
  tp.textContent = f.name
  text.appendChild(tp)
}

function buildLabels(f: MapFeature) {
  if (!groups) return
  if (f.labelMode === 'sprawl') { makeSprawl(f); return }
  if (f.labelMode === 'spread') {
    const ax = principalAxis(f.pts)
    const fs = Math.max(260, Math.min(560, ax.span * 0.11))
    const text = make('text', {
      class: 'mlabel-big', x: f.labelAt![0], y: f.labelAt![1],
      'font-size': fs.toFixed(0), 'letter-spacing': (fs * 0.55).toFixed(0), 'text-anchor': 'middle'
    }, groups.labels)
    text.textContent = f.name
    return
  }
  if (f.labelAt) {
    const text = make('text', { class: 'mlabel', x: f.labelAt[0], y: f.labelAt[1] }, groups.labels)
    text.textContent = f.name
    labelRefs.push({ el: text, f })
  } else if (f.kind === 'marker') {
    const parent = f.category === 'character' ? groups.chars : groups.labels
    const text = make('text', { class: 'mlabel', x: f.pts[0][0], y: f.pts[0][1] }, parent)
    text.textContent = f.name
    labelRefs.push({ el: text, f, markerLabel: true, dx: f.labelDx || 0, dy: f.labelDy === undefined ? 23 : f.labelDy })
  }
}

function buildScene() {
  if (!groups || !defsEl.value || !terrainSub || !civicSub) return
  props.world.features.forEach((f) => {
    featureById[f.id] = f
    if (f.kind === 'region') {
      buildRegion(f)
    } else if (f.kind === 'path') {
      const isBankedWater = (f.category === 'river' || f.category === 'canal') && f.bank && f.bank.length >= 3
      if (isBankedWater) {
        // 变宽水体（批W）：river/canal 有 bank→与水域 region 同一套渲染语义（填充+海岸描边·同色系变量，
        // 直接复用 f-water-fill/f-water-coast 两个既有 class，零新增 CSS）。归并进 region 子层而非 path 子层——
        // region 子层天然垫底、按 features 数组顺序叠放（同伴生小岛群叠加水域面的既有 z 序约定：数组顺序
        // 决定同层内先后）；若仍留在 path 子层（该子层恒建于 region 之后、永远盖在其上），实心水面会永远
        // 盖住画在河体上层的江心洲岛屿（region），无法示范"岛在河上"（批W 任务书 7.5.7③）。
        const regionTarget = f.layer === 'terrain' ? terrainSub!.region : civicSub!.region
        const bankD = polyToPath(f.bank!, true)
        const fill = make('path', { d: bankD, class: 'f-water-fill' + (f.links ? ' has-link' : ''), 'data-fid': f.id }, regionTarget)
        make('path', { d: bankD, class: 'f-water-coast' }, regionTarget)
        if (f.minScale) lodRefs.push({ el: fill, min: f.minScale })
        if (f.links) statusRefs.push({ f, kind: 'region', d: bankD })
      } else {
        const dd = catmullRomOpen(f.pts)
        const tgt = f.layer === 'terrain' ? terrainSub!.path : civicSub!.path
        if (f.category === 'road' || f.category === 'street') {
          const casing = make('path', { d: dd, class: 'f-' + f.category + '-casing' }, tgt)
          if (f.minScale) lodRefs.push({ el: casing, min: f.minScale })
        }
        // 无 bank 的存量河/运河：仍细线渲染（豁免哲学，不追溯批W 之前的数据）；描线色统一改水色变量
        // （批W 任务3），river/canal 都并入 .f-river 一支 CSS class，不再各自独立配色。
        // 所有开放路径先挂防御基类：即使存量脏数据带了未知/错误 category，也不能退回 SVG 默认
        // fill:black，把折线首尾隐式闭合成黑块；正式描线仍由 f-river/f-road/... 覆盖。
        const lineClass = 'f-map-path ' + ((f.category === 'river' || f.category === 'canal') ? 'f-river' : 'f-' + f.category)
        const line = make('path', { d: dd, class: lineClass, 'data-fid': f.id }, tgt)
        if (f.minScale) lodRefs.push({ el: line, min: f.minScale })
      }
    } else if (f.kind === 'marker') {
      const isChar = f.category === 'character'
      // 非角色 marker 归人文层（地形视图整层隐藏）·统一落 civic 层的 marker 子层（最上）；角色归 gChars 随「状态」开关显隐
      const g = make('g', { class: 'mk mk--' + f.category, 'data-fid': f.id }, isChar ? groups!.chars : civicSub!.marker)
      make('circle', { class: 'mk-base', cx: 0, cy: 0, r: isChar ? 9.5 : 9 }, g)
      const ic = make('g', { class: 'mk-icon', transform: 'translate(-6,-6) scale(0.5)' }, g)
      ic.innerHTML = MARKER_ICONS[f.category] || MARKER_ICONS.landmark
      markerRefs.push({ el: g, f })
      if (f.minScale) lodRefs.push({ el: g, min: f.minScale })
      if (f.links) statusRefs.push({ f, kind: 'marker' })
    }
    buildLabels(f)
  })

  statusRefs.forEach((s) => {
    if (!groups) return
    if (s.kind === 'marker') {
      const x = s.f.pts[0][0]; const y = s.f.pts[0][1]
      const g = make('g', {}, groups.status)
      make('circle', { class: 'st-ring', cx: x, cy: y, r: 13 }, g)
      make('circle', { class: 'st-pulse', cx: x, cy: y, r: 19 }, g)
      s.el = g
      if (s.f.minScale) lodRefs.push({ el: g, min: s.f.minScale })
    } else if (s.d) {
      make('path', { d: s.d, class: 'st-region' }, groups.status)
    }
  })

  buildChangeGhosts()
  buildDraftSketches()
}

/** 对照模式幽灵轮廓（批L 地图版本历史）：把删除快照的几何画成红色虚线——region=闭合环、path=折线、
 *  marker=小圆（半径在 render() 随缩放重算）。只在挂载建景时画一次（随 :key 重挂刷新），不参与点选。 */
function buildChangeGhosts() {
  if (!groups) return
  const ghosts = props.changeHighlight?.deleteGhosts || []
  for (const ghost of ghosts) {
    const pts = (ghost.pts || []).filter((p) => Array.isArray(p) && p.length >= 2) as MapPoint[]
    if (!pts.length) continue
    if (ghost.kind === 'marker' || pts.length === 1) {
      const circle = make('circle', { class: 'lhmap-ghost-del', cx: pts[0][0], cy: pts[0][1], r: 13 }, groups.diff)
      ghostMarkerRefs.push(circle)
    } else {
      const d = polyToPath(pts, ghost.kind === 'region')
      make('path', { d, class: 'lhmap-ghost-del' }, groups.diff)
    }
  }
}

// ---- 草案剪影层（地图草案剪影可视化计划批2）----
// 绘舆草案轮结构化产出的纯前端预览：不入库、不走正式笔刷硬门，落笔时仍用真笔刷+全部约束重画。
// 与 buildScene 的其余要素不同，draftSketches/sketchMarks 可能在同一次挂载期间随决策交互反复变化
// （选中/标记/修订轮），故拆成独立的可重建函数，不必像主场景那样只在 onMounted 建一次。

/** 取剪影的锚点（供 label 定位）：marker/region-椭圆有 center 直接用；region-多边形/path 用几何质心。 */
function draftSketchAnchor(item: MapDraftDisplayItem): MapPoint | null {
  if ('previewFeatures' in item) {
    const points = item.previewFeatures.flatMap((feature) => feature.pts || [])
    if (points.length) return centroid(points)
  }
  const sk = item.sketch || {}
  if (Array.isArray(sk.center) && sk.center.length >= 2) return sk.center as MapPoint
  if (Array.isArray(sk.points) && sk.points.length) return centroid(sk.points as MapPoint[])
  return null
}

/** 剪影粗略包围盒（世界坐标，真机返工批A新增）：供角标定位（贴剪影边缘、不挡 label）与 Shift 框选命中
 *  判定共用同一份几何——marker 没有真实半径字段，用固定示意半径 DRAFT_MARKER_SKETCH_RADIUS_M 撑出方框。 */
function draftSketchBBox(item: MapDraftDisplayItem): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if ('previewFeatures' in item) {
    const points = item.previewFeatures.flatMap((feature) => feature.pts || [])
    if (points.length) {
      return points.reduce((box, point) => ({
        minX: Math.min(box.minX, point[0]), minY: Math.min(box.minY, point[1]),
        maxX: Math.max(box.maxX, point[0]), maxY: Math.max(box.maxY, point[1])
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
    }
  }
  const sk = item.sketch || {}
  if (Array.isArray(sk.points) && sk.points.length) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
    for (const p of sk.points as MapPoint[]) {
      minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1])
      maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1])
    }
    return { minX, minY, maxX, maxY }
  }
  if (Array.isArray(sk.center) && Number.isFinite(sk.rx) && Number.isFinite(sk.ry)) {
    return { minX: sk.center[0] - sk.rx!, minY: sk.center[1] - sk.ry!, maxX: sk.center[0] + sk.rx!, maxY: sk.center[1] + sk.ry! }
  }
  if (Array.isArray(sk.center) && sk.center.length >= 2) {
    const r = DRAFT_MARKER_SKETCH_RADIUS_M
    return { minX: sk.center[0] - r, minY: sk.center[1] - r, maxX: sk.center[0] + r, maxY: sk.center[1] + r }
  }
  return null
}

function clearDraftGroup() {
  if (!groups) return
  while (groups.draft.firstChild) groups.draft.removeChild(groups.draft.firstChild)
  draftLabelRefs.length = 0
  draftBadgeRefs.length = 0
}

function buildDraftSketches() {
  if (!groups) return
  clearDraftGroup()
  const items = draftItems.value
  const marks = props.sketchMarks || {}
  for (const item of items) {
    const sk = item.sketch || {}
    const shapeEls: SVGGraphicsElement[] = []
    if ('previewFeatures' in item) {
      for (const feature of item.previewFeatures) {
        if (!feature.pts?.length) continue
        if (feature.kind === 'region') {
          const d = polyToPath(feature.pts, true)
          if (feature.category === 'water') {
            shapeEls.push(make('path', { d, class: 'f-water-fill lhmap-review-feature' }, groups.draft))
          } else if (ELEV_REGION_CATEGORIES.has(feature.category)) {
            const elevation = resolveElevationM(feature.category, feature.elevationM)
            const bucket = civicRegionBucket(feature.category, feature.elevationM)
            const el = make('path', { d, class: `f-region f-elev f-civic-${bucket} lhmap-review-feature` }, groups.draft)
            const specialVar = specialSurfaceColorVar(feature.category)
            el.style.setProperty('--mc-elev-fill', specialVar ? `var(${specialVar})` : elevationTint(elevation))
            shapeEls.push(el)
          } else {
            shapeEls.push(make('path', { d, class: 'f-region f-urban lhmap-review-feature' }, groups.draft))
          }
        } else if (feature.kind === 'path') {
          const category = feature.category === 'canal' ? 'river' : feature.category
          shapeEls.push(make('path', { d: catmullRomOpen(feature.pts), class: `f-map-path f-${category} lhmap-review-feature` }, groups.draft))
        } else if (feature.kind === 'marker') {
          shapeEls.push(make('circle', { cx: feature.pts[0][0], cy: feature.pts[0][1], r: DRAFT_MARKER_SKETCH_RADIUS_M, class: 'lhmap-review-feature lhmap-review-feature--marker' }, groups.draft))
        }
      }
    } else if (item.kind === 'region') {
      if (Array.isArray(sk.points) && sk.points.length >= 3) {
        const d = polyToPath(sk.points as MapPoint[], true)
        shapeEls.push(make('path', { d, class: 'lhmap-sketch lhmap-sketch--region' }, groups.draft))
      } else if (Array.isArray(sk.center) && Number.isFinite(sk.rx) && Number.isFinite(sk.ry)) {
        shapeEls.push(make('ellipse', { cx: sk.center[0], cy: sk.center[1], rx: sk.rx!, ry: sk.ry!, class: 'lhmap-sketch lhmap-sketch--region' }, groups.draft))
      }
    } else if (item.kind === 'path') {
      if (Array.isArray(sk.points) && sk.points.length >= 2) {
        const d = polyToPath(sk.points as MapPoint[], false)
        shapeEls.push(make('path', { d, class: 'lhmap-sketch lhmap-sketch--path' }, groups.draft))
      }
    } else if (item.kind === 'marker') {
      if (Array.isArray(sk.center) && sk.center.length >= 2) {
        shapeEls.push(make('circle', { cx: sk.center[0], cy: sk.center[1], r: DRAFT_MARKER_SKETCH_RADIUS_M, class: 'lhmap-sketch lhmap-sketch--marker' }, groups.draft))
      }
    }
    // 几何缺失（如 region 既无 ≥3 points 又无 center+rx+ry）：跳过不画，不阻断其余项——协议字段全部可选，
    // 绘舆产出不合规时前端只是少画一项，不应让整个草案层崩掉。
    if (!shapeEls.length) continue

    const mark = marks[item.id]
    // 决策态描边同步变化（真机返工批A：决策零反馈根治的一半——另一半是下方角标重做）：
    // 采纳=实线加粗、弃用=降透明+虚线稀疏（示意"删除线感"）、带意见=细虚线，叠加在既有 confidence 三色之上。
    for (const shapeEl of shapeEls) {
      shapeEl.classList.add('lhmap-sketch-c-' + item.confidence)
      shapeEl.setAttribute('data-sketch-id', item.id)
      if (mark) shapeEl.classList.add('lhmap-sketch-mark--' + mark)
    }

    const anchor = draftSketchAnchor(item)
    if (anchor) {
      const label = make('text', { class: 'lhmap-sketch-label' }, groups.draft)
      label.textContent = item.label
      draftLabelRefs.push({ el: label, anchor })
    }

    if (mark) {
      // 角标锚点改用包围盒右上角（而非 label 同一锚点+18px偏移）：避免长标签的白色描边文字整个盖住角标，
      // 这是真机反馈"点了决策看不出变化"的根因（旧角标其实有渲染，只是被 label 自己遮住了）。
      const bbox = draftSketchBBox(item)
      const badgeAnchor: MapPoint = bbox ? [bbox.maxX, bbox.minY] : (anchor || [0, 0])
      const g = make('g', { class: 'lhmap-sketch-badge-g' }, groups.draft)
      make('circle', { class: 'lhmap-sketch-badge-bg lhmap-sketch-badge-bg--' + mark, r: 9 }, g)
      const badgeText = make('text', { class: 'lhmap-sketch-badge', dy: '0.32em' }, g)
      badgeText.textContent = mark === 'accepted' ? '✓' : mark === 'rejected' ? '✗' : '✎'
      draftBadgeRefs.push({ el: g, anchor: badgeAnchor })
    }
  }
  applyDraftSelection()
  scheduleRender()
}

/** 选中态单独轻量更新（批2）：selectedSketchIds 随点选频繁变化，不必每次都整层重建。 */
function applyDraftSelection() {
  if (!groups) return
  const ids = new Set(props.selectedSketchIds || [])
  groups.draft.querySelectorAll('[data-sketch-id]').forEach((el) => {
    const id = el.getAttribute('data-sketch-id') || ''
    el.classList.toggle('is-selected', ids.has(id))
  })
}

// ---- 网格坐标层（地图草案剪影可视化计划批4）----
// bounds 来源复用 fitAll() 同一份内容工作框，不另算一份。
// showGrid=false 时零变化：不建网格 group 子节点、currentGridSpec 恒 null、hover 恒空串。

function clearGridGroup() {
  if (!groups) return
  while (groups.grid.firstChild) groups.grid.removeChild(groups.grid.firstChild)
  gridColLabelRefs.length = 0
  gridRowLabelRefs.length = 0
}

function buildGrid() {
  if (!groups) return
  clearGridGroup()
  if (!props.showGrid) {
    currentGridSpec = null
    gridHoverText.value = ''
    return
  }
  const spec = computeMapGridSpec(mapDisplayFrame())
  currentGridSpec = spec
  const maxX = spec.originX + spec.cols * spec.cellM
  const maxY = spec.originY + spec.rows * spec.cellM
  for (let i = 0; i <= spec.cols; i++) {
    const x = spec.originX + i * spec.cellM
    make('line', { x1: x, y1: spec.originY, x2: x, y2: maxY, class: 'lhmap-grid-line' }, groups.grid)
  }
  for (let j = 0; j <= spec.rows; j++) {
    const y = spec.originY + j * spec.cellM
    make('line', { x1: spec.originX, y1: y, x2: maxX, y2: y, class: 'lhmap-grid-line' }, groups.grid)
  }
  for (let i = 0; i < spec.cols; i++) {
    const x = spec.originX + (i + 0.5) * spec.cellM
    const label = make('text', { class: 'lhmap-grid-label lhmap-grid-label--col' }, groups.grid)
    label.textContent = mapGridColumnLetter(i)
    gridColLabelRefs.push({ el: label, x })
  }
  for (let j = 0; j < spec.rows; j++) {
    const y = spec.originY + (j + 0.5) * spec.cellM
    const label = make('text', { class: 'lhmap-grid-label lhmap-grid-label--row' }, groups.grid)
    label.textContent = String(j + 1)
    gridRowLabelRefs.push({ el: label, y })
  }
  scheduleRender()
}

/** hover 坐标换算（批4）：屏幕坐标 → 世界坐标 → 格号，写入 gridHoverText 供 .lhmap-info 显示。
 *  showGrid=false 或指针移出画布区域时恒清空。 */
function updateGridHover(clientX: number, clientY: number) {
  if (!props.showGrid || !currentGridSpec || !svgEl.value) { gridHoverText.value = ''; return }
  const r = svgEl.value.getBoundingClientRect()
  const sx = clientX - r.left
  const sy = clientY - r.top
  if (sx < 0 || sy < 0 || sx > r.width || sy > r.height) { gridHoverText.value = ''; return }
  const wx = state.cx + (sx - state.W / 2) / state.scale
  const wy = state.cy + (sy - state.H / 2) / state.scale
  const ref = formatMapGridRef(wx, wy, currentGridSpec)
  gridHoverText.value = ref ? `${ref} · (${Math.round(wx)}, ${Math.round(wy)})` : ''
}

// ---- 渲染循环 ----
let rafId = 0
function scheduleRender() {
  if (!rafId) rafId = requestAnimationFrame(render)
}
function render() {
  rafId = 0
  if (!svgEl.value) return
  const k = state.scale
  const w = state.W / k; const h = state.H / k
  svgEl.value.setAttribute('viewBox', `${(state.cx - w / 2).toFixed(1)} ${(state.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`)
  markerRefs.forEach((m) => {
    const p = m.f.pts[0]
    m.el.setAttribute('transform', `translate(${p[0]},${p[1]}) scale(${1 / k})`)
  })
  statusRefs.forEach((s) => {
    if (s.kind !== 'marker' || !s.el) return
    s.el.children[0].setAttribute('r', String(13 / k))
    s.el.children[1].setAttribute('r', String(19 / k))
  })
  ghostMarkerRefs.forEach((circle) => circle.setAttribute('r', String(13 / k)))
  labelRefs.forEach((L) => {
    let vis = true
    if (L.f.labelMin && k < L.f.labelMin) vis = false
    if (L.f.minScale && k < L.f.minScale) vis = false
    if (props.view === 'terrain' && L.f.layer === 'civic' && L.f.category !== 'character') vis = false
    L.el.style.display = vis ? '' : 'none'
    if (!vis) return
    L.el.setAttribute('font-size', String(12.5 / k))
    L.el.setAttribute('stroke-width', String(4 / k))
    if (L.markerLabel) {
      L.el.setAttribute('x', String(L.f.pts[0][0] + (L.dx || 0) / k))
      L.el.setAttribute('y', String(L.f.pts[0][1] + (L.dy || 0) / k))
    }
  })
  lodRefs.forEach((d) => { d.el.style.display = k >= d.min ? '' : 'none' })
  // 草案剪影 label/badge（批2）：屏幕恒定字号/偏移，手法同上方 labelRefs（除以 k）
  draftLabelRefs.forEach((L) => {
    L.el.setAttribute('font-size', String(12.5 / k))
    L.el.setAttribute('stroke-width', String(3 / k))
    L.el.setAttribute('x', String(L.anchor[0]))
    L.el.setAttribute('y', String(L.anchor[1] - 26 / k))
  })
  // 决策角标（真机返工批A）：整组 <g>（背景圆+glyph）用 translate+scale(1/k) 屏幕恒定手法，同 markerRefs。
  draftBadgeRefs.forEach((B) => {
    B.el.setAttribute('transform', `translate(${B.anchor[0]},${B.anchor[1]}) scale(${1 / k})`)
  })
  editHandleRefs.forEach((handle) => handle.el.setAttribute('r', String((handle.selected ? 7 : 5.5) / k)))
  // 网格边缘标签（批4）：列锚 x/行锚 y 固定在世界坐标（随该列/行平移），屏幕坐标另一轴钳在当前 viewBox
  // 顶/左边缘（贴边跟随，随平移缩放重算）；字号/内边距同其余标签走「除以 k」屏幕恒定手法。
  if (gridColLabelRefs.length || gridRowLabelRefs.length) {
    const viewTop = state.cy - h / 2
    const viewLeft = state.cx - w / 2
    const pad = GRID_LABEL_EDGE_PAD_PX / k
    gridColLabelRefs.forEach((L) => {
      L.el.setAttribute('font-size', String(11 / k))
      L.el.setAttribute('stroke-width', String(2.6 / k))
      L.el.setAttribute('x', String(L.x))
      L.el.setAttribute('y', String(viewTop + pad))
    })
    gridRowLabelRefs.forEach((L) => {
      L.el.setAttribute('font-size', String(11 / k))
      L.el.setAttribute('stroke-width', String(2.6 / k))
      L.el.setAttribute('x', String(viewLeft + pad))
      L.el.setAttribute('y', String(L.y))
    })
  }
  updateScalebar()
  if (pop.value) placePop()
}
function updateScalebar() {
  const target = 84 / state.scale
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  let step = pow
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= target) { step = m * pow; break }
  }
  scaleBarWidth.value = step * state.scale
  scaleText.value = fmtDist(step)
}

// 用户动过视角后 resize 不再自动回 fit（打开时弹窗入场动画会让首次量尺寸偏小，靠 ResizeObserver 跟随修正）
let userMoved = false

function fitAll() {
  const b = mapDisplayFrame()
  state.cx = (b.minX + b.maxX) / 2
  state.cy = (b.minY + b.maxY) / 2
  state.scale = Math.min(state.W / (b.maxX - b.minX), state.H / (b.maxY - b.minY)) * 0.98
  scheduleRender()
}
function onZoomButton(factor: number) {
  userMoved = true
  zoomAt(factor, state.W / 2, state.H / 2)
}
function onFitButton() {
  userMoved = false
  dismissPops()
  fitAll()
}
/** 缩放下限随内容量级自适应（2026-07-11 真机修）：旧固定下限 0.015 按批1样例小图标定，真实世界跨数百 km
 *  时 fitAll 贴合比例（≈0.001~0.003）远低于它——滚轮一动就被钳到 0.015（比例尺≈10km）且再也缩不回全图。
 *  现下限=贴合比例的 1/4（全图再退 4 倍，比例尺可到数百~上千 km）；样例小图贴合比例高于 0.015 时沿用旧下限。 */
function minZoomScale(): number {
  const b = mapDisplayFrame()
  const spanX = b.maxX - b.minX
  const spanY = b.maxY - b.minY
  if (!(spanX > 0) || !(spanY > 0)) return 0.015
  const fit = Math.min(state.W / spanX, state.H / spanY)
  if (!Number.isFinite(fit) || fit <= 0) return 0.015
  return Math.min(0.015, fit * 0.25)
}
function zoomAt(factor: number, px: number, py: number) {
  const k0 = state.scale
  const k1 = Math.min(3, Math.max(minZoomScale(), k0 * factor))
  if (k1 === k0) return
  const wx = state.cx + (px - state.W / 2) / k0
  const wy = state.cy + (py - state.H / 2) / k0
  state.cx = wx - (px - state.W / 2) / k1
  state.cy = wy - (py - state.H / 2) / k1
  state.scale = k1
  scheduleRender()
}

// ---- 交互（拖拽/滚轮/双指捏合/点选） ----
const pointers = new Map<number, [number, number]>()
// downInfo 现在带 shiftKey/ctrlKey（真机返工批A）：单靠 pointerup 事件自身的修饰键状态并不可靠——真实操作
// 里用户常常先松开 Ctrl/Shift 键、再松开鼠标按键，pointerup 触发那一刻 e.ctrlKey 可能已经变回 false，
// 表现为"按住 Ctrl 点第二个剪影却没有累加选中"（这是真机反馈的根因）。改成 down/up 任一时刻按住即算数
// （handleTap 调用处对两者取或），修饰键释放的时序不再影响判定。
let downInfo: { x: number; y: number; cx: number; cy: number; moved: boolean; target: EventTarget | null; shiftKey: boolean; ctrlKey: boolean } | null = null
let pinch0 = 0
let pinchScale0 = 0
// Shift+拖拽框选（真机返工批A·仅草案模式）：pointerdown 时若 Shift 按住且处于草案模式，先标记"待定框选"；
// 是否真进入框选要等 onPointerMove 里出现超过 4px 的真实位移才确定——否则退化为既有的 Shift+点击单项切换选中
// （见 onPointerEnd 的判定），不与那条既有语义冲突。
let boxSelectActive = false
let editPointDrag: { pointerId: number; index: number } | null = null

function clientToWorld(clientX: number, clientY: number): MapPoint {
  const rect = svgEl.value?.getBoundingClientRect()
  const sx = clientX - (rect?.left || 0)
  const sy = clientY - (rect?.top || 0)
  return [
    state.cx + (sx - state.W / 2) / state.scale,
    state.cy + (sy - state.H / 2) / state.scale
  ]
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!svgEl.value) return
  userMoved = true
  const r = svgEl.value.getBoundingClientRect()
  zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top)
}
function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  svgEl.value?.setPointerCapture(e.pointerId)
  const editHandle = props.editMode && e.target instanceof Element ? e.target.closest('[data-edit-point-index]') : null
  if (editHandle) {
    const index = Number(editHandle.getAttribute('data-edit-point-index'))
    if (Number.isInteger(index)) {
      pointers.set(e.pointerId, [e.clientX, e.clientY])
      editPointDrag = { pointerId: e.pointerId, index }
      downInfo = null
      dragging.value = true
      emit('edit-point-select', { index })
      svgEl.value?.focus({ preventScroll: true })
      return
    }
  }
  pointers.set(e.pointerId, [e.clientX, e.clientY])
  if (pointers.size === 1) {
    downInfo = { x: e.clientX, y: e.clientY, cx: state.cx, cy: state.cy, moved: false, target: e.target, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey }
    if (isDraftMode.value && e.shiftKey) {
      boxSelectActive = true
      boxSelectRect.value = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }
    } else {
      boxSelectActive = false
      boxSelectRect.value = null
    }
  }
  if (pointers.size === 2) {
    const ps = Array.from(pointers.values())
    pinch0 = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1])
    pinchScale0 = state.scale
    if (downInfo) downInfo.moved = true
    boxSelectActive = false
    boxSelectRect.value = null
  }
}
function onPointerMove(e: PointerEvent) {
  // 网格 hover 坐标（批4）：任意指针移动都换算（含拖拽/捏合中），不局限于「未按下」的纯 hover
  updateGridHover(e.clientX, e.clientY)
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, [e.clientX, e.clientY])
  if (editPointDrag?.pointerId === e.pointerId) {
    emit('edit-point-move', {
      index: editPointDrag.index,
      point: clientToWorld(e.clientX, e.clientY),
      disableSnap: Boolean(e.altKey)
    })
    return
  }
  if (pointers.size === 1 && downInfo) {
    const dx = e.clientX - downInfo.x; const dy = e.clientY - downInfo.y
    const justCrossedThreshold = !downInfo.moved && Math.hypot(dx, dy) > 4
    if (justCrossedThreshold) downInfo.moved = true
    if (boxSelectActive) {
      // 框选中：只更新橡皮筋矩形，不平移地图（Shift 按住期间拖拽与既有 pan 判定分流）
      if (boxSelectRect.value) boxSelectRect.value = { ...boxSelectRect.value, x1: e.clientX, y1: e.clientY }
      return
    }
    if (justCrossedThreshold) { dragging.value = true; userMoved = true; dismissPops() }
    if (downInfo.moved) {
      state.cx = downInfo.cx - dx / state.scale
      state.cy = downInfo.cy - dy / state.scale
      scheduleRender()
    }
  } else if (pointers.size === 2 && pinch0 > 0 && svgEl.value) {
    userMoved = true
    const ps = Array.from(pointers.values())
    const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1])
    const r = svgEl.value.getBoundingClientRect()
    const mx = (ps[0][0] + ps[1][0]) / 2 - r.left
    const my = (ps[0][1] + ps[1][1]) / 2 - r.top
    zoomAt(pinchScale0 * (d / pinch0) / state.scale, mx, my)
  }
}
/** Shift+拖拽框选收尾（真机返工批A）：屏幕矩形→世界坐标→与每个剪影的粗略包围盒做相交测试（非完全包含，
 *  与文案「矩形与剪影 bbox 相交」一致），命中的全部上抛；父级按"加入选中"语义合并，不替换既有选中集。 */
function finishBoxSelect() {
  const rect = boxSelectRect.value
  if (!rect || !svgEl.value) return
  const r = svgEl.value.getBoundingClientRect()
  const sx0 = Math.min(rect.x0, rect.x1) - r.left
  const sy0 = Math.min(rect.y0, rect.y1) - r.top
  const sx1 = Math.max(rect.x0, rect.x1) - r.left
  const sy1 = Math.max(rect.y0, rect.y1) - r.top
  const k = state.scale
  const wx0 = state.cx + (sx0 - state.W / 2) / k
  const wy0 = state.cy + (sy0 - state.H / 2) / k
  const wx1 = state.cx + (sx1 - state.W / 2) / k
  const wy1 = state.cy + (sy1 - state.H / 2) / k
  const hitIds: string[] = []
  for (const item of draftItems.value) {
    const bbox = draftSketchBBox(item)
    if (bbox && bbox.minX <= wx1 && bbox.maxX >= wx0 && bbox.minY <= wy1 && bbox.maxY >= wy0) hitIds.push(item.id)
  }
  if (hitIds.length) emit('sketch-box-select', { ids: hitIds })
}
function onPointerEnd(e: PointerEvent) {
  pointers.delete(e.pointerId)
  dragging.value = false
  if (editPointDrag?.pointerId === e.pointerId) {
    editPointDrag = null
    downInfo = null
    return
  }
  // 框选要有真实位移才收尾成矩形命中判定；若只是 Shift+点击没有位移，退回下方既有单项切换选中语义。
  if (boxSelectActive && downInfo?.moved) {
    finishBoxSelect()
    boxSelectActive = false
    boxSelectRect.value = null
    downInfo = null
    return
  }
  boxSelectActive = false
  boxSelectRect.value = null
  if (downInfo && !downInfo.moved && pointers.size === 0) {
    handleTap(downInfo.target, downInfo.x, downInfo.y, downInfo.shiftKey || e.shiftKey, downInfo.ctrlKey || e.ctrlKey)
  }
  if (pointers.size === 0) downInfo = null
}

function onDoubleClick(e: MouseEvent) {
  if (!props.editMode || !props.editGeometry || !(e.target instanceof Element)) return
  const segment = e.target.closest('[data-edit-segment-index]')
  if (!segment) return
  const segmentIndex = Number(segment.getAttribute('data-edit-segment-index'))
  if (!Number.isInteger(segmentIndex)) return
  e.preventDefault()
  e.stopPropagation()
  emit('edit-segment-insert', { segmentIndex, point: clientToWorld(e.clientX, e.clientY) })
}

function onEditKeydown(e: KeyboardEvent) {
  if (!props.editMode || props.selectedEditPointIndex === null || props.selectedEditPointIndex === undefined) return
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  e.preventDefault()
  emit('edit-point-delete', { index: props.selectedEditPointIndex })
}

function dismissPops() {
  hidePop()
  emit('open-status-panel', null)
}

function handleTap(target: EventTarget | null, clientX: number, clientY: number, shiftKey = false, ctrlKey = false) {
  if (props.compact) {
    dismissPops()
    return
  }
  // 草案剪影命中（批2）：优先判定，命中即上抛给父处理选中/信息卡，不落入下方常规要素分支。
  const sketchEl = target instanceof Element ? target.closest('[data-sketch-id]') : null
  if (sketchEl) {
    const id = sketchEl.getAttribute('data-sketch-id') || ''
    if (id) emit('sketch-click', { id, shiftKey, ctrlKey, clientX, clientY })
    return
  }
  // 草案模式下压灰的底图要素不响应点击（避免误触状态栏卡）：只清掉可能残留的弹卡/信息条。
  if (isDraftMode.value) { dismissPops(); info.value = null; return }
  if (props.editMode && target instanceof Element && target.closest('[data-edit-segment-index], [data-edit-point-index]')) return
  const el = target instanceof Element ? target.closest('[data-fid]') : null
  if (!el) {
    if (props.editMode) emit('feature-select', null)
    dismissPops(); info.value = null; return
  }
  const f = featureById[el.getAttribute('data-fid') || '']
  if (!f) return
  if (props.editMode) {
    dismissPops()
    info.value = null
    emit('feature-select', { id: f.id })
    return
  }
  if (f.links && Object.keys(f.links).length) {
    const sample = f.links.panelId ? props.panels[f.links.panelId] : undefined
    if (sample) { info.value = null; emit('open-status-panel', null); showPop(f); return }
    // 真实世界：把锚点换算成相对 .lhmap-body 的屏幕坐标，交父弹只读状态栏卡（批7）
    info.value = null
    hidePop()
    const rect = bodyEl.value?.getBoundingClientRect()
    emit('open-status-panel', { links: f.links, x: clientX - (rect?.left || 0), y: clientY - (rect?.top || 0) })
    return
  }
  dismissPops()
  let detail = categoryNames.value[f.category] || f.category
  if (f.kind === 'region') detail += ' · ' + t('chat.mapAreaAbout', { area: fmtArea(shoelace(f.pts)) })
  else if (f.kind === 'path') detail += ' · ' + t('chat.mapDistAbout', { dist: fmtDist(pathLength(f.pts)) })
  info.value = { name: f.name, detail }
}
function showPop(f: MapFeature) {
  const data = props.panels[f.links!.panelId!]
  pop.value = { data, anchor: f.kind === 'marker' ? f.pts[0] : centroid(f.pts) }
  nextTick(placePop)
}
function placePop() {
  if (!pop.value || !popEl.value) return
  const anchor = pop.value.anchor
  const sx = (anchor[0] - state.cx) * state.scale + state.W / 2
  const sy = (anchor[1] - state.cy) * state.scale + state.H / 2
  const w = 246
  const h = popEl.value.offsetHeight || 170
  const x = Math.min(Math.max(8, sx - w / 2), state.W - w - 8)
  let y = sy - h - 22
  if (y < 8) y = sy + 24
  popEl.value.style.left = x + 'px'
  popEl.value.style.top = y + 'px'
}
function hidePop() {
  pop.value = null
}

// 按宿主过滤资产分布（批7）+ 对照模式（批L）+ 草案模式（批2）共用一次 DOM 扫描：都基于 [data-fid] 标记切 class。
// 草案模式优先级最高——既有要素整体压灰（复用同一份 lhmap-dim 语义），不与对照/资产过滤叠加判断。
// 对照模式次之——变更集内 add/update 各上三色强调 class，其余统一 lhmap-dim 变灰；都没有时退回
// 资产过滤的既有语义。不需要额外「id→元素」注册表（region/path/marker 都在各自视觉主元素上带 data-fid）。
// ⚠️ 已知局限：water 的浅水裙边/海岸描边叠加层无独立 data-fid（只有深水底 f-water-fill 带），过滤时不会跟着淡出。
function applyHighlightFilter() {
  if (!svgEl.value) return
  const allFeatureElements = svgEl.value.querySelectorAll('[data-fid]')
  if (props.editMode) {
    const selectedIds = new Set(props.selectedFeatureIds || [])
    const hasPreview = Boolean(props.editPreviewFeatures?.length)
    allFeatureElements.forEach((el) => {
      const fid = el.getAttribute('data-fid') || ''
      el.classList.remove('lhmap-diff-add', 'lhmap-diff-update', 'lhmap-dim')
      el.classList.add('lhmap-editable')
      el.classList.toggle('lhmap-edit-selected', selectedIds.has(fid))
      el.classList.toggle('lhmap-edit-source', hasPreview && selectedIds.has(fid))
    })
    return
  }
  allFeatureElements.forEach((el) => el.classList.remove('lhmap-editable', 'lhmap-edit-selected', 'lhmap-edit-source'))
  if (isDraftMode.value) {
    allFeatureElements.forEach((el) => {
      el.classList.remove('lhmap-diff-add', 'lhmap-diff-update')
      el.classList.add('lhmap-dim')
    })
    return
  }
  const change = props.changeHighlight
  if (change) {
    const addIds = new Set(change.addIds || [])
    const updateIds = new Set(change.updateIds || [])
    allFeatureElements.forEach((el) => {
      const fid = el.getAttribute('data-fid') || ''
      el.classList.toggle('lhmap-diff-add', addIds.has(fid))
      el.classList.toggle('lhmap-diff-update', updateIds.has(fid))
      el.classList.toggle('lhmap-dim', !addIds.has(fid) && !updateIds.has(fid))
    })
    return
  }
  const ids = props.highlightFeatureIds
  allFeatureElements.forEach((el) => {
    const fid = el.getAttribute('data-fid') || ''
    el.classList.remove('lhmap-diff-add', 'lhmap-diff-update')
    el.classList.toggle('lhmap-dim', Boolean(ids) && !ids!.has(fid))
  })
}
watch(() => props.highlightFeatureIds, applyHighlightFilter)
watch(() => props.editMode, applyHighlightFilter)
watch(() => props.selectedFeatureIds, applyHighlightFilter)
watch([() => props.editPreviewFeatures, () => props.editGeometry, () => props.selectedEditPointIndex], () => { buildEditPreview(); applyHighlightFilter(); scheduleRender() }, { deep: true })
// 草案剪影层（批2）：draftSketches/sketchMarks 变化整层重建（含标记角标）；selectedSketchIds 高频变化，
// 只轻量切 class；进入/退出草案模式都要重扫 applyHighlightFilter（既有要素压灰状态联动）+ 清掉残留弹卡。
watch([() => props.draftSketches, () => props.draftReviewItems], () => { buildDraftSketches(); applyHighlightFilter(); dismissPops(); info.value = null }, { deep: true })
watch(() => props.sketchMarks, () => buildDraftSketches(), { deep: true })
watch(() => props.selectedSketchIds, applyDraftSelection)
// 决策清单面板"点击行居中该剪影"（真机返工批A）：把视角平移到该剪影锚点，不改变当前缩放级别。
watch(() => props.focusSketch, (req) => {
  if (!req || !req.id) return
  const item = draftItems.value.find((s) => s.id === req.id)
  if (!item) return
  const anchor = draftSketchAnchor(item)
  if (!anchor) return
  userMoved = true
  state.cx = anchor[0]
  state.cy = anchor[1]
  scheduleRender()
})
// 网格坐标层（批4）：开关切换时整层重建/清空；world 不 watch（同文件其余场景一致——命令式建景靠 :key 重挂换世界）
watch(() => props.showGrid, buildGrid)

// ---- 生命周期 ----
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const svg = svgEl.value
  if (!svg) return
  const pick = (name: string) => svg.querySelector(`g[data-g="${name}"]`) as SVGGElement
  groups = {
    terrain: pick('terrain'), civic: pick('civic'), grid: pick('grid'), status: pick('status'), chars: pick('chars'), labels: pick('labels'),
    edit: pick('edit'), draft: pick('draft'), diff: pick('diff')
  }
  // 建 region/path/marker 三个子层（先后即层级）：region 先建=垫底，path 次之，marker 最后=最上
  terrainSub = {
    region: make('g', {}, groups.terrain), path: make('g', {}, groups.terrain), marker: make('g', {}, groups.terrain)
  }
  civicSub = {
    region: make('g', {}, groups.civic), path: make('g', {}, groups.civic), marker: make('g', {}, groups.civic)
  }
  buildScene()
  buildEditPreview()
  applyHighlightFilter()
  buildGrid()
  svg.addEventListener('wheel', onWheel, { passive: false })
  svg.addEventListener('pointerdown', onPointerDown)
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerup', onPointerEnd)
  svg.addEventListener('pointercancel', onPointerEnd)
  svg.addEventListener('pointerleave', () => { gridHoverText.value = '' })
  const measure = () => {
    const r = svg.getBoundingClientRect()
    state.W = r.width
    state.H = r.height
  }
  // 弹窗入场动画期间首次量到的尺寸偏小 → 尺寸每次变化时，只要用户还没动过视角就重新贴满
  resizeObserver = new ResizeObserver(() => {
    measure()
    if (!userMoved) fitAll()
    else scheduleRender()
  })
  resizeObserver.observe(svg)
  measure()
  fitAll()
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
})

watch(() => props.view, () => scheduleRender())
</script>

<!-- 非 scoped：地图 SVG 要素全部由 JS 动态生成，吃不到 scoped 的 data-v 属性；
     所有选择器以 .lhmap-body 作前缀空间，不外溢。 -->
<style>
.lhmap-body { position: relative; width: 100%; height: 100%; background: var(--mc-canvas, #FBFAF6); transition: background 0.3s ease; overflow: hidden; user-select: none; -webkit-user-select: none; }
.lhmap-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; z-index: 2; }
.lhmap-svg.dragging { cursor: grabbing; }
.lhmap-body--compact .lhmap-svg:focus-visible { outline: 2px solid rgba(92, 138, 92, 0.5); outline-offset: -2px; }

/* 海拔分层设色区域（mountain/forest/grass/plateau 统一走此规则·散布符号引擎退役后不再特判）：
   --mc-elev-fill 由渲染层按 elevationTint 逐要素写入 inline style；civic 视图改走三色底二桶（water/urban 除外单独处理） */
.lhmap-body .f-region { stroke-width: 1.4px; vector-effect: non-scaling-stroke; transition: fill 0.3s ease, stroke 0.3s ease; }
.lhmap-body .f-region.has-link { cursor: pointer; }
.lhmap-body .f-elev { stroke: none; }
.lhmap-svg[data-view='terrain'] .f-elev { fill: var(--mc-elev-fill); }
.lhmap-svg[data-view='civic'] .f-civic-green { fill: var(--mc-civic-green); }
.lhmap-svg[data-view='civic'] .f-civic-white { fill: var(--mc-land-civic); }
.lhmap-body .f-urban { fill: var(--mc-urban); stroke: var(--mc-urban-s); }

/* 水域：深水底（terrain=深蓝/civic=现代水蓝）+ 浅水裙边（terrain 专属·非 scaling stroke 风格化贴岸）+ 海岸描边（terrain 专属） */
.lhmap-body .f-water-fill { stroke: none; transition: fill 0.3s ease; }
.lhmap-svg[data-view='terrain'] .f-water-fill { fill: var(--mc-water-terrain); }
.lhmap-svg[data-view='terrain'] .f-water-depth--shallow { fill: color-mix(in srgb, var(--mc-water-terrain) 42%, var(--mc-water-collar)); }
.lhmap-svg[data-view='terrain'] .f-water-depth--mid { fill: color-mix(in srgb, var(--mc-water-terrain) 72%, var(--mc-water-collar)); }
.lhmap-svg[data-view='terrain'] .f-water-depth--deep { fill: var(--mc-water-terrain); }
.lhmap-svg[data-view='civic'] .f-water-fill { fill: var(--mc-water-civic); }
.lhmap-body .f-water-fill.has-link { cursor: pointer; }
.lhmap-body .f-water-collar { fill: none; stroke: var(--mc-water-collar); stroke-width: 12px; vector-effect: non-scaling-stroke; stroke-linejoin: round; pointer-events: none; }
.lhmap-svg[data-view='civic'] .f-water-collar { display: none; }
.lhmap-body .f-water-coast { fill: none; stroke: var(--mc-coast-terrain); stroke-width: 1.5px; vector-effect: non-scaling-stroke; pointer-events: none; }
.lhmap-svg[data-view='civic'] .f-water-coast { display: none; }

/* river/canal 细线（无 bank 的存量数据·豁免哲学不追溯）：描线色统一改水色变量（批W 任务3），
   与下方 f-water-fill 同一套 [data-view] 分色逻辑，不再用独立 --mc-river/--mc-canal（两者曾是同一色值）。
   canal 无 bank 时也并入本 class（JS 侧 lineClass 判定），故不再单独维护 .f-canal 规则。 */
.lhmap-body .f-map-path { fill: none; stroke: var(--mc-border); stroke-width: 1.2px; vector-effect: non-scaling-stroke; }
.lhmap-body .f-river { fill: none; stroke-width: 2.4px; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.lhmap-svg[data-view='terrain'] .f-river { stroke: var(--mc-water-terrain); }
.lhmap-svg[data-view='civic'] .f-river { stroke: var(--mc-water-civic); }
.lhmap-body .f-road-casing { fill: none; stroke: var(--mc-road-casing); stroke-width: calc(var(--mc-road-w) * 1px + 2.4px); vector-effect: non-scaling-stroke; stroke-linecap: round; }
.lhmap-body .f-road { fill: none; stroke: var(--mc-road); stroke-width: calc(var(--mc-road-w) * 1px); vector-effect: non-scaling-stroke; stroke-linecap: round; }
.lhmap-body .f-street-casing { fill: none; stroke: var(--mc-road-casing); stroke-width: calc(var(--mc-road-w) * 0.66px + 2px); vector-effect: non-scaling-stroke; stroke-linecap: round; }
.lhmap-body .f-street { fill: none; stroke: var(--mc-road); stroke-width: calc(var(--mc-road-w) * 0.66px); vector-effect: non-scaling-stroke; stroke-linecap: round; }
/* 城墙（wall 类目）：实线厚重，与道路区分——绘舆此前只能拿 road 凑数画墙 */
.lhmap-body .f-wall { fill: none; stroke: var(--mc-wall); stroke-width: 3px; vector-effect: non-scaling-stroke; stroke-linecap: square; }
/* 批2 新增线状类目：border=疆界灰虚点线，trail=小径细弱虚线，bridge=桥（短线跨水·结构色）；
   canal 无 bank 时并入上方 .f-river（水色统一），有 bank 时走填色渲染，故这里不再单列 canal 规则。 */
.lhmap-body .f-border { fill: none; stroke: var(--mc-border); stroke-width: 1.6px; vector-effect: non-scaling-stroke; stroke-dasharray: 6 3 1 3; stroke-linecap: round; }
.lhmap-body .f-trail { fill: none; stroke: var(--mc-trail); stroke-width: 1px; vector-effect: non-scaling-stroke; stroke-dasharray: 3 2; stroke-linecap: round; opacity: 0.85; }
.lhmap-body .f-bridge { fill: none; stroke: var(--mc-bridge); stroke-width: 3.4px; vector-effect: non-scaling-stroke; stroke-linecap: butt; }

/* 视图二分：地形视图整藏人文层；人文视图三色底与地形视图同等清晰呈现（散布符号退役后不再需要淡化遮罩） */
.lhmap-svg g[data-g='terrain'], .lhmap-svg g[data-g='civic'] { transition: opacity 0.28s ease; }
.lhmap-svg[data-view='terrain'] g[data-g='civic'] { display: none; }
.lhmap-svg[data-view='civic'] g[data-g='labels'] .mlabel-big { opacity: 0.4; }

.lhmap-body .mlabel { fill: var(--mc-label); stroke: var(--mc-halo); paint-order: stroke; stroke-linejoin: round; font-family: var(--mc-font-label); font-weight: 600; text-anchor: middle; pointer-events: none; transition: fill 0.3s ease; }
.lhmap-body .mlabel-big { fill: var(--mc-biglabel); font-family: var(--mc-font-big); font-weight: 600; opacity: 0.92; paint-order: stroke; stroke: var(--mc-halo); stroke-width: 0.13em; stroke-linejoin: round; pointer-events: none; transition: fill 0.3s ease; }

.lhmap-body .mk { cursor: pointer; }
.lhmap-body .mk-base { fill: #FFFDF8; stroke-width: 1.4; transition: stroke 0.3s ease; }
.lhmap-body .mk-icon { fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
/* 批2 新增十类 marker 按语义并入既有两组（现役两组色值本就相同，先占语义分组位，画廊碰撞阶段可再拆细）：
   建成/驻留类（capital/castle/temple/gate/inn/tower）入 building 组；自然/资源/边陲类（ruin/mine/cave/port）入 landmark 组 */
.lhmap-body .mk--building .mk-base, .lhmap-body .mk--organization .mk-base,
.lhmap-body .mk--capital .mk-base, .lhmap-body .mk--castle .mk-base, .lhmap-body .mk--temple .mk-base,
.lhmap-body .mk--gate .mk-base, .lhmap-body .mk--inn .mk-base, .lhmap-body .mk--tower .mk-base { stroke: var(--mc-building); }
.lhmap-body .mk--building .mk-icon, .lhmap-body .mk--organization .mk-icon,
.lhmap-body .mk--capital .mk-icon, .lhmap-body .mk--castle .mk-icon, .lhmap-body .mk--temple .mk-icon,
.lhmap-body .mk--gate .mk-icon, .lhmap-body .mk--inn .mk-icon, .lhmap-body .mk--tower .mk-icon { stroke: var(--mc-building); }
.lhmap-body .mk--landmark .mk-base, .lhmap-body .mk--ferry .mk-base,
.lhmap-body .mk--ruin .mk-base, .lhmap-body .mk--mine .mk-base, .lhmap-body .mk--cave .mk-base, .lhmap-body .mk--port .mk-base { stroke: var(--mc-landmark); }
.lhmap-body .mk--landmark .mk-icon, .lhmap-body .mk--ferry .mk-icon,
.lhmap-body .mk--ruin .mk-icon, .lhmap-body .mk--mine .mk-icon, .lhmap-body .mk--cave .mk-icon, .lhmap-body .mk--port .mk-icon { stroke: var(--mc-landmark); }
.lhmap-body .mk--character .mk-base { fill: var(--mc-character); stroke: #FFFDF8; }
.lhmap-body .mk--character .mk-icon { stroke: #FFFDF8; }

/* 按宿主过滤资产分布（批7）：非选中要素淡出，选中要素保持全不透明 */
.lhmap-body [data-fid].lhmap-dim { opacity: 0.16; transition: opacity 0.25s ease; }

/* 人工编辑模式：底层要素负责命中，实时预览层负责显示新几何。预览始终不吃鼠标，避免滑块调大后挡住再次点选。 */
.lhmap-body [data-fid].lhmap-editable { cursor: crosshair; }
.lhmap-body [data-fid].lhmap-edit-selected { stroke: #47704a; stroke-width: 2.4px; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 3px rgba(92, 138, 92, 0.55)); }
.lhmap-body [data-fid].lhmap-edit-source { opacity: 0.08; filter: none; }
.lhmap-body g[data-g='edit'] { pointer-events: none; }
.lhmap-body .lhmap-edit-preview { stroke: #47704a; stroke-width: 2.2px; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 3px rgba(92, 138, 92, 0.5)); }
.lhmap-body .lhmap-edit-preview--path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.lhmap-body .lhmap-edit-guide { fill: none; stroke: #5C8A5C; stroke-width: 1.2px; vector-effect: non-scaling-stroke; stroke-dasharray: 4 4; opacity: 0.72; }
.lhmap-body .lhmap-edit-segment-hit { fill: none; stroke: transparent; stroke-width: 14px; vector-effect: non-scaling-stroke; pointer-events: stroke; cursor: copy; }
.lhmap-body .lhmap-edit-handle { fill: var(--morandi-card); stroke: #47704a; stroke-width: 1.8px; vector-effect: non-scaling-stroke; pointer-events: all; cursor: move; filter: drop-shadow(0 1px 2px rgba(71, 112, 74, 0.28)); }
.lhmap-body .lhmap-edit-handle.is-selected { fill: #5C8A5C; stroke: #FFFDF8; stroke-width: 2.2px; }

/* 对照模式三色（批L 地图版本历史）：add=绿描边强调 / update=琥珀描边 / delete=红虚线幽灵轮廓。
   region（f-elev 等 stroke:none）与 path（各自类目描线色）都被更高特异度的这两条覆盖描边；
   marker 是 <g>，描边落在子元素 .mk-base 上单独给规则。色值取界面语言既有梅系：绿 #47704a 族/琥珀 #C4863B/红 #C0665A。 */
.lhmap-body [data-fid].lhmap-diff-add { stroke: #3E7D4E; stroke-width: 2.6px; vector-effect: non-scaling-stroke; }
.lhmap-body [data-fid].lhmap-diff-update { stroke: #C4863B; stroke-width: 2.6px; vector-effect: non-scaling-stroke; }
.lhmap-body g[data-fid].lhmap-diff-add .mk-base { stroke: #3E7D4E; stroke-width: 2.4; }
.lhmap-body g[data-fid].lhmap-diff-update .mk-base { stroke: #C4863B; stroke-width: 2.4; }
.lhmap-body .lhmap-ghost-del { fill: none; stroke: #C0665A; stroke-width: 2.2px; vector-effect: non-scaling-stroke; stroke-dasharray: 7 5; stroke-linejoin: round; opacity: 0.9; pointer-events: none; }

/* 草案剪影层（地图草案剪影可视化计划批2）：虚线描边+低透明度填充传达"示意"感（非最终形状），
   按 confidence 三色（绿=确定/黄=需确认/红=高风险）。marker 剪影无 rx/ry，固定世界坐标半径，
   与 region/path 剪影一样吃 viewBox 自然缩放。 */
.lhmap-body .lhmap-sketch { cursor: pointer; stroke-width: 2.2px; vector-effect: non-scaling-stroke; stroke-dasharray: 7 5; stroke-linejoin: round; transition: stroke-width 0.15s ease, fill-opacity 0.15s ease, filter 0.15s ease; }
.lhmap-body .lhmap-sketch--path { fill: none; }
.lhmap-body .lhmap-sketch--region, .lhmap-body .lhmap-sketch--marker { fill-opacity: 0.2; }
.lhmap-body .lhmap-sketch-c-ready { stroke: var(--mc-sketch-ready); }
.lhmap-body .lhmap-sketch-c-confirm { stroke: var(--mc-sketch-confirm); }
.lhmap-body .lhmap-sketch-c-risk { stroke: var(--mc-sketch-risk); }
.lhmap-body .lhmap-sketch--region.lhmap-sketch-c-ready, .lhmap-body .lhmap-sketch--marker.lhmap-sketch-c-ready { fill: var(--mc-sketch-ready); }
.lhmap-body .lhmap-sketch--region.lhmap-sketch-c-confirm, .lhmap-body .lhmap-sketch--marker.lhmap-sketch-c-confirm { fill: var(--mc-sketch-confirm); }
.lhmap-body .lhmap-sketch--region.lhmap-sketch-c-risk, .lhmap-body .lhmap-sketch--marker.lhmap-sketch-c-risk { fill: var(--mc-sketch-risk); }
.lhmap-body .lhmap-sketch:hover { stroke-width: 3px; }
.lhmap-body .lhmap-sketch--region:hover, .lhmap-body .lhmap-sketch--marker:hover { fill-opacity: 0.32; }
.lhmap-body .lhmap-review-feature { cursor: pointer; vector-effect: non-scaling-stroke; stroke-width: 2.2px; stroke-dasharray: 7 5; stroke-linejoin: round; transition: stroke-width 0.15s ease, opacity 0.15s ease, filter 0.15s ease; }
.lhmap-body .lhmap-review-feature--marker { fill: #FFFDF8; stroke: var(--mc-sketch-ready); }
.lhmap-body .lhmap-review-feature:hover { stroke-width: 3px; }
/* 选中态用固定橄榄绿光晕（不跟随 confidence 色，避免 SVG filter 里 currentColor 取不到 stroke 值的问题） */
.lhmap-body .lhmap-sketch.is-selected, .lhmap-body .lhmap-review-feature.is-selected { stroke-width: 3.8px; filter: drop-shadow(0 0 4px rgba(92, 138, 92, 0.85)); }
/* 决策态描边变化（真机返工批A：决策零反馈根治一半）：叠加在既有 confidence 三色描边之上——
   采纳=实线加粗（去掉虚线示意感，视觉上"定下来了"）；弃用=整体降透明+虚线更稀疏（示意"划掉"）；
   带意见=细密虚线（区别于默认的粗虚线，暗示"待改"）。 */
.lhmap-body .lhmap-sketch.lhmap-sketch-mark--accepted, .lhmap-body .lhmap-review-feature.lhmap-sketch-mark--accepted { stroke-width: 3.6px; stroke-dasharray: none; }
.lhmap-body .lhmap-sketch.lhmap-sketch-mark--rejected, .lhmap-body .lhmap-review-feature.lhmap-sketch-mark--rejected { opacity: 0.35; stroke-dasharray: 2 5; }
.lhmap-body .lhmap-sketch.lhmap-sketch-mark--commented, .lhmap-body .lhmap-review-feature.lhmap-sketch-mark--commented { stroke-dasharray: 1 4; }
.lhmap-body .lhmap-sketch-label { fill: var(--mc-label); stroke: var(--mc-halo); paint-order: stroke; stroke-linejoin: round; stroke-width: 3px; font-family: var(--mc-font-label); font-weight: 600; text-anchor: middle; pointer-events: none; }
/* 决策角标（真机返工批A 重做）：背景圆点+glyph，锚在剪影包围盒右上角（贴边缘不挡 label），
   比旧版"仅描边字符+18px偏移"更醒目——旧版角标常年被同高度的 label 白色描边文字整个盖住，看不见。 */
.lhmap-body .lhmap-sketch-badge-g { pointer-events: none; }
.lhmap-body .lhmap-sketch-badge-bg { stroke: rgba(255, 253, 248, 0.95); stroke-width: 1.6px; }
.lhmap-body .lhmap-sketch-badge-bg--accepted { fill: #3E7D4E; }
.lhmap-body .lhmap-sketch-badge-bg--rejected { fill: #C0665A; }
.lhmap-body .lhmap-sketch-badge-bg--commented { fill: #C4863B; }
.lhmap-body .lhmap-sketch-badge { text-anchor: middle; font-size: 11px; font-weight: 700; fill: #FFFDF8; pointer-events: none; }

/* Shift+拖拽框选橡皮筋（真机返工批A·草案模式多选）：纯像素定位浮层，不吃 viewBox 缩放变换 */
.lhmap-boxselect { position: absolute; z-index: 6; border: 1.5px dashed #5C8A5C; background: rgba(92, 138, 92, 0.12); pointer-events: none; }

/* 网格坐标层（地图草案剪影可视化计划批4）：细淡墨色线+低透明度，地图纸面恒白语义不破坏；
   标签描白色晕圈（同 .mlabel 手法）保证压在任意底色上都可读。 */
.lhmap-body .lhmap-grid-line { stroke: rgba(74, 66, 54, 0.32); stroke-width: 1px; vector-effect: non-scaling-stroke; pointer-events: none; }
.lhmap-body .lhmap-grid-label { fill: rgba(74, 66, 54, 0.75); stroke: var(--mc-halo); paint-order: stroke; stroke-linejoin: round; font-family: var(--mc-font-label); font-weight: 600; pointer-events: none; }
.lhmap-body .lhmap-grid-label--col { text-anchor: middle; dominant-baseline: hanging; }
.lhmap-body .lhmap-grid-label--row { text-anchor: start; dominant-baseline: middle; }

.lhmap-svg g[data-g='status'], .lhmap-svg g[data-g='chars'] { transition: opacity 0.2s ease; }
.lhmap-svg g[data-g='status'].off, .lhmap-svg g[data-g='chars'].off { display: none; }
/* pointer-events:none（真机修 #30）：环/脉冲画在 status 层盖在角色 marker 之上，缺此会拦下点击落在描边上——
   target.closest('[data-fid]') 找不到 marker 的 data-fid，弹卡直接判定为「点空白」而收起 */
.lhmap-body .st-ring { fill: none; stroke: #5C8A5C; stroke-width: 1.6px; vector-effect: non-scaling-stroke; stroke-dasharray: 4 3; opacity: 0.85; pointer-events: none; }
.lhmap-body .st-pulse { fill: none; stroke: #5C8A5C; stroke-width: 1.2px; vector-effect: non-scaling-stroke; animation: lhmap-st-pulse 2.2s ease-out infinite; pointer-events: none; }
@keyframes lhmap-st-pulse { 0% { opacity: 0.7; } 70% { opacity: 0; } 100% { opacity: 0; } }
.lhmap-body .st-region { fill: none; stroke: #5C8A5C; stroke-width: 2px; vector-effect: non-scaling-stroke; stroke-dasharray: 6 4; opacity: 0.8; }

.lhmap-float { position: absolute; z-index: 5; font-size: 12px; color: #5B5348; }
.lhmap-legend { left: 14px; top: 14px; width: 142px; background: rgba(255, 253, 248, 0.92); border: 1px solid #E5DFD3; border-radius: 10px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07); overflow: hidden; }
.lhmap-legend header { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px 7px 12px; cursor: pointer; user-select: none; }
.lhmap-legend header b { font-size: 12px; font-weight: 600; color: #4f463f; }
.lhmap-legend header .lhmap-licon { width: 13px; height: 13px; color: #8a8177; transition: transform 0.2s ease; }
.lhmap-legend.closed header .lhmap-licon { transform: rotate(-90deg); }
.lhmap-legend ul { list-style: none; margin: 0; padding: 2px 12px 9px; display: flex; flex-direction: column; gap: 5px; }
.lhmap-legend li { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #6c6357; }
.lhmap-legend .sw { width: 13px; height: 13px; border-radius: 3px; border: 1px solid rgba(0, 0, 0, 0.1); flex: 0 0 auto; box-sizing: border-box; }

.lhmap-badges { right: 14px; top: 14px; display: flex; flex-direction: column; align-items: flex-end; gap: 7px; }
.lhmap-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(255, 253, 248, 0.92); border: 1px solid #E5DFD3; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06); font-size: 11.5px; color: #6c6357; }
.lhmap-chip b { color: #47704a; font-weight: 600; }
.lhmap-chip--draft { color: #A39A8D; }
.lhmap-north { width: 30px; height: 30px; border-radius: 50%; background: rgba(255, 253, 248, 0.92); border: 1px solid #E5DFD3; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #8B7355; }
.lhmap-north span { position: relative; }
.lhmap-north span::before { content: ''; position: absolute; left: 50%; top: -7px; transform: translateX(-50%); border: 3.5px solid transparent; border-bottom: 6px solid #C0665A; }

.lhmap-zoom { right: 14px; bottom: 14px; display: flex; flex-direction: column; background: rgba(255, 253, 248, 0.94); border: 1px solid #E5DFD3; border-radius: 9px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07); overflow: hidden; }
.lhmap-zoom button { width: 32px; height: 30px; border: 0; background: none; color: #6c6357; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease; padding: 0; }
.lhmap-zoom button:hover { background: #F3EEE6; }
.lhmap-zoom button + button { border-top: 1px solid #EDE7DB; }
.lhmap-zoom .lhmap-licon { width: 15px; height: 15px; }

.lhmap-foot { left: 14px; bottom: 12px; right: 60px; display: flex; align-items: flex-end; gap: 14px; pointer-events: none; }
.lhmap-scalebar { flex: 0 0 auto; }
.lhmap-scalebar .bar { height: 4px; border: 1.5px solid #6c6357; border-top: 0; border-radius: 0 0 2px 2px; opacity: 0.75; }
.lhmap-scalebar .num { font-size: 10.5px; color: #6c6357; margin-bottom: 2px; }
.lhmap-info { flex: 0 1 auto; min-width: 0; font-size: 11.5px; color: #857c6f; background: rgba(255, 253, 248, 0.9); border: 1px solid #EDE7DB; border-radius: 7px; padding: 4px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: lhmap-pop-in 0.16s ease; }
.lhmap-info b { color: #4f463f; font-weight: 600; }

.lhmap-pop { position: absolute; z-index: 8; width: 246px; background: var(--morandi-card); border: 1px solid var(--morandi-border); border-radius: 12px; box-shadow: 0 10px 30px rgba(72, 58, 47, 0.16); animation: lhmap-pop-in 0.16s ease; }
@keyframes lhmap-pop-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
.lhmap-pop::after { content: ''; position: absolute; left: 50%; bottom: -6px; transform: translateX(-50%) rotate(45deg); width: 10px; height: 10px; background: var(--morandi-card); border-right: 1px solid var(--morandi-border); border-bottom: 1px solid var(--morandi-border); }
.lhmap-pop header { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; }
.lhmap-pop header .pop-ic { width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.lhmap-pop header .pop-ic .lhmap-licon { width: 14px; height: 14px; color: #FFFDF8; }
.lhmap-pop--character .pop-ic { background: #5C8A5C; }
.lhmap-pop--building .pop-ic { background: #8B7355; }
.lhmap-pop--organization .pop-ic { background: #a0b5c4; }
.lhmap-pop header b { font-size: 0.92rem; font-weight: 600; color: #4f463f; flex: 1 1 auto; min-width: 0; }
.lhmap-pop header .pop-kind { font-size: 10.5px; color: #A39A8D; border: 1px solid #E5DFD3; border-radius: 999px; padding: 1.5px 7px; flex: 0 0 auto; }
.lhmap-pop .pop-note { padding: 0 12px 7px; font-size: 11.5px; color: #857c6f; }
.lhmap-pop table { width: calc(100% - 24px); margin: 0 12px 9px; border-collapse: collapse; }
.lhmap-pop td { padding: 4px 0; font-size: 12px; border-top: 1px solid #F0EBE0; }
.lhmap-pop td:first-child { color: #93897b; width: 4.5em; }
.lhmap-pop td:last-child { color: #4f463f; }
.lhmap-pop footer { display: flex; align-items: center; justify-content: space-between; padding: 7px 12px 9px; border-top: 1px solid #F0EBE0; }
.lhmap-pop footer small { font-size: 10px; color: #B5AC9E; }
.lhmap-pop .pop-open { border: 0; background: none; color: #47704a; font-size: 12px; font-weight: 600; cursor: pointer; padding: 3px 6px; border-radius: 6px; transition: background 0.15s ease; }
.lhmap-pop .pop-open:hover { background: rgba(92, 138, 92, 0.1); }

.lhmap-body .lhmap-licon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

/* 夜间模式（草案剪影三色·地图草案剪影可视化计划批2）：地图纸面美术本身按 UI_STYLE.md「恒白语义例外」
   不随主题变色（.lhmap-body 背景两套主题都保持浅色纸面），这里只对剪影强调色做轻微调亮，
   为将来剪影层可能脱离纸面语境复用（如批3 双坞卡片内嵌预览）预留可读性余量，不改变当前纸面观感。 */
[data-theme='dark'] .lhmap-body {
  --mc-sketch-ready: #57A46A;
  --mc-sketch-confirm: #D9A552;
  --mc-sketch-risk: #D98376;
}
</style>
