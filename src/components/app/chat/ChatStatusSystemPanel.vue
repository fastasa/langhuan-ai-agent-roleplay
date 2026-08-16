<template>
  <Teleport to="body">
  <div
    v-if="open"
    class="ssp-overlay"
    @pointerdown.capture="overlayDismissGuard.handleOverlayPointerDown"
    @click.self="handleOverlayClose"
  >
  <section class="ssp-dialog" role="dialog" aria-modal="true" aria-label="状态系统">
    <header class="ssp-dialog__head">
      <div class="ssp-dialog__title">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path></svg>
        <strong>状态系统</strong>
        <span>{{ panels.length }} 个状态栏</span>
      </div>
      <button type="button" class="ssp-panel__close" title="关闭" aria-label="关闭状态系统" @click="$emit('close')">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
      </button>
    </header>
    <div class="ssp-dialog__body">
      <aside v-if="xingyiEmbedAllowed" class="ssp-xingyi" :style="xingyiPanelStyle" aria-label="星依状态协作栏">
        <div ref="xingyiHostEl" class="ssp-xingyi__host"></div>
      </aside>
      <button
        v-if="xingyiEmbedAllowed"
        type="button"
        class="ssp-xingyi__resize"
        title="拖动调整星依对话框宽度"
        aria-label="拖动调整星依对话框宽度"
        @pointerdown.prevent="startXingyiResize"
      ></button>
      <div class="ssp-panel">
    <div class="ssp" :class="{ 'ssp--single': tab === 'panels' && drillStack.length > 0 }">
      <div class="ssp-tabs" role="tablist">
        <button
          type="button"
          class="ssp-tab"
          :class="{ 'ssp-tab--on': tab === 'panels' }"
          role="tab"
          :aria-selected="tab === 'panels'"
          @click="tab = 'panels'"
        >状态栏</button>
        <button
          type="button"
          class="ssp-tab"
          :class="{ 'ssp-tab--on': tab === 'templates' }"
          role="tab"
          :aria-selected="tab === 'templates'"
          @click="tab = 'templates'"
        >模板</button>
      </div>

      <div class="ssp-body">
      <!-- 批3：挂世界后残留会话级旧状态栏的一键并入提示（并入=升世界级跨会话共享，session_id 保留为创建来源） -->
      <div v-if="!loading && pendingMergeCount > 0" class="ssp-merge-banner">
        <span class="ssp-merge-text">本会话有 {{ pendingMergeCount }} 个建在加入世界之前的状态栏/模板，并入世界后才会在这里显示并跨会话共享。</span>
        <button type="button" class="ssp-merge-btn" :disabled="merging" @click="mergeLegacyIntoWorld">{{ merging ? '并入中…' : '一键并入世界' }}</button>
      </div>
      <div v-if="loading" class="ssp-empty">加载中…</div>

      <!-- ── 状态栏 tab：实例卡片 + ref 下钻 ── -->
      <template v-else-if="tab === 'panels'">
        <div v-if="drillStack.length" class="ssp-crumbs" aria-label="状态栏下钻路径">
          <button type="button" class="ssp-crumb-link" @click="drillStack = []">全部状态栏</button>
          <template v-for="(panelId, index) in drillStack" :key="panelId">
            <span class="ssp-crumb-sep" aria-hidden="true">›</span>
            <button
              v-if="index < drillStack.length - 1"
              type="button"
              class="ssp-crumb-link"
              @click="drillStack = drillStack.slice(0, index + 1)"
            >{{ panelNameById(panelId) }}</button>
            <span v-else class="ssp-crumb-current">{{ panelNameById(panelId) }}</span>
          </template>
        </div>
        <div v-else class="ssp-toolbar">
          <span class="ssp-hint">共 {{ panels.length }} 个状态栏</span>
          <button type="button" class="ssp-add-btn" :disabled="!templates.length" @click="startCreatePanel">＋ 新建状态栏</button>
        </div>

        <form v-if="panelDraft" class="ssp-form" @submit.prevent="submitCreatePanel">
          <div class="ssp-form-title">新建状态栏</div>
          <div class="ssp-form-grid">
            <label class="ssp-field">
              <span class="ssp-label">模板</span>
              <select v-model="panelDraft.templateId" class="ssp-input" required>
                <option value="" disabled>选择模板</option>
                <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}（{{ kindMetaOf(template.kind).label }}）</option>
              </select>
            </label>
            <label class="ssp-field">
              <span class="ssp-label">名称</span>
              <input v-model="panelDraft.name" class="ssp-input" placeholder="如：沈青梧" required>
            </label>
            <label class="ssp-field">
              <span class="ssp-label">宿主类型</span>
              <select v-model="panelDraft.hostType" class="ssp-input" @change="panelDraft.hostId = ''">
                <option value="none">独立实体（无宿主）</option>
                <option value="session_character">会话角色</option>
                <option value="user">用户（我）</option>
                <option value="temp_entity">会话临时实体</option>
              </select>
            </label>
            <label v-if="panelDraft.hostType === 'session_character'" class="ssp-field">
              <span class="ssp-label">宿主会话角色</span>
              <select v-model="panelDraft.hostId" class="ssp-input" required>
                <option value="" disabled>选择本会话角色</option>
                <option v-for="option in characterOptions" :key="option.id" :value="option.id">{{ option.name }}</option>
              </select>
            </label>
            <label v-else-if="panelDraft.hostType === 'temp_entity'" class="ssp-field">
              <span class="ssp-label">宿主临时实体</span>
              <select v-model="panelDraft.hostId" class="ssp-input" required>
                <option value="" disabled>选择临时实体</option>
                <option v-for="entity in tempEntities" :key="entity.id" :value="entity.id">{{ entity.name }}</option>
              </select>
            </label>
          </div>
          <div class="ssp-form-actions">
            <button type="button" class="ssp-btn" @click="panelDraft = null">取消</button>
            <button type="submit" class="ssp-btn ssp-btn--primary" :disabled="saving">创建</button>
          </div>
        </form>

        <!-- 快速定位搜索（未下钻·状态栏较多时才露·按名称/宿主/类别过滤） -->
        <div v-if="!drillStack.length && panels.length > 3" class="ssp-search">
          <svg class="ssp-search-ico line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input v-model="panelSearch" class="ssp-search-input" type="search" placeholder="搜索状态栏名称 / 宿主 / 类别" aria-label="搜索状态栏">
          <button v-if="panelSearch" type="button" class="ssp-search-clear" aria-label="清空搜索" @click="panelSearch = ''">×</button>
        </div>

        <div v-if="!drillStack.length && !panels.length && !panelDraft" class="ssp-empty">
          <template v-if="templates.length">还没有状态栏，点「新建状态栏」从模板实例化一个。</template>
          <template v-else>
            <div>还没有模板，先添加一套内置模板即可开用。</div>
            <button type="button" class="ssp-btn ssp-empty-cta" @click="tab = 'templates'">去添加内置模板</button>
          </template>
        </div>

        <!-- 图标目录（未下钻）：按用户自定义 kind 分类；空 kind 统一归入「未分类」。 -->
        <div v-if="!drillStack.length" class="ssp-list">
          <section v-for="group in panelGroups" :key="group.key" class="ssp-group" :aria-label="`${group.label}分类`">
            <header class="ssp-group__head">
              <span>{{ group.label }}</span>
              <small>{{ group.panels.length }}</small>
            </header>
            <div class="ssp-group__items">
              <div v-for="panel in group.panels" :key="panel.id" class="ssp-row">
                <button
                  type="button"
                  class="ssp-row-open"
                  :aria-label="`查看状态栏 ${panel.name}`"
                  @mouseenter="showPanelPreview(panel, $event)"
                  @mouseleave="schedulePreviewClose"
                  @focus="showPanelPreview(panel, $event)"
                  @blur="schedulePreviewClose"
                  @click="drillInto(panel.id)"
                >
                  <span class="ssp-ctile" :class="tintClass(panel.templateId)" aria-hidden="true">
                    <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="kindMetaOf(templateById(panel.templateId)?.kind || '').icon"></svg>
                  </span>
                  <span class="ssp-row-name">{{ panel.name }}</span>
                  <span v-if="isPanelDirty(panel.id)" class="ssp-row-dot" title="有未保存修改" aria-label="有未保存修改"></span>
                </button>
                <button
                  type="button"
                  class="ssp-icon-btn ssp-row-del"
                  :aria-label="`删除状态栏 ${panel.name}`"
                  title="删除"
                  @click="confirmTarget = { type: 'panel', id: panel.id, name: panel.name }"
                >
                  <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </section>
          <div v-if="panels.length && !listPanels.length" class="ssp-empty ssp-empty--nomatch">没有匹配「{{ panelSearch }}」的状态栏</div>
        </div>

        <aside
          v-if="previewPanel"
          class="ssp-preview"
          :style="previewStyle"
          :aria-label="`状态栏预览 ${previewPanel.name}`"
          @mouseenter="cancelPreviewClose"
          @mouseleave="schedulePreviewClose"
        >
          <div class="ssp-preview__meta">{{ hostLabel(previewPanel) }}</div>
          <pre>{{ previewMarkdown }}</pre>
        </aside>

        <!-- 展开态（批次D·下钻满铺 + 并行副面板）：主卡=drillStack 尾；点单位引用格在右侧滑出副面板
             （替换式·独立关闭·副面板内再点引用替换内容并记浏览链）；旧 ref 原地下钻已退役。 -->
        <div v-if="drillStack.length" class="ssp-cards ssp-cards--single" :class="{ 'ssp-cards--split': Boolean(sidePanel) }">
          <StatusPanelCard
            v-for="panel in visiblePanels"
            :key="panel.id"
            :panel="panel"
            :session-id="sessionId"
            :fields="panelFields(panel)"
            :draft="draftOf(panel.id)"
            :dirty="isPanelDirty(panel.id)"
            :saving="saving"
            :kind-meta="kindMetaOf(templateById(panel.templateId)?.kind || '')"
            :host-label="hostLabel(panel)"
            :panel-name-by-id="panelNameById"
            :ref-tint-class="refTintClass"
            :ref-candidates-of="refCandidatesOf"
            :grid-view="gridView"
            :expanded-cell="expandedCell"
            @update:expanded-cell="expandedCell = $event"
            @save="savePanelValues(panel)"
            @reset="resetPanelDraft(panel)"
            @delete="confirmTarget = { type: 'panel', id: panel.id, name: panel.name }"
            @ref-open="openSidePanel"
            @open-field-editor="openAddFieldEditor(panel, $event)"
            @persist-grid-view="persistGridView"
            @field-menu="openCtxMenu(panel, 'field', $event)"
            @cell-menu="openCtxMenu(panel, 'cell', $event)"
            @copy-table="copyPanelMarkdown(panel)"
            @asset-upload="uploadPanelAsset(panel, $event)"
            @asset-error="toast($event, 'error')"
          />
          <StatusPanelCard
            v-if="sidePanel"
            :key="`side_${sidePanel.id}`"
            closable
            :crumbs="sideCrumbs"
            :panel="sidePanel"
            :session-id="sessionId"
            :fields="panelFields(sidePanel)"
            :draft="draftOf(sidePanel.id)"
            :dirty="isPanelDirty(sidePanel.id)"
            :saving="saving"
            :kind-meta="kindMetaOf(templateById(sidePanel.templateId)?.kind || '')"
            :host-label="hostLabel(sidePanel)"
            :panel-name-by-id="panelNameById"
            :ref-tint-class="refTintClass"
            :ref-candidates-of="refCandidatesOf"
            :grid-view="gridView"
            :expanded-cell="expandedCell"
            @update:expanded-cell="expandedCell = $event"
            @save="savePanelValues(sidePanel)"
            @reset="resetPanelDraft(sidePanel)"
            @delete="confirmTarget = { type: 'panel', id: sidePanel.id, name: sidePanel.name }"
            @ref-open="replaceSidePanel"
            @close="closeSidePanel"
            @crumb-to="sideCrumbTo"
            @open-field-editor="openAddFieldEditor(sidePanel, $event)"
            @persist-grid-view="persistGridView"
            @field-menu="openCtxMenu(sidePanel, 'field', $event)"
            @cell-menu="openCtxMenu(sidePanel, 'cell', $event)"
            @copy-table="copyPanelMarkdown(sidePanel)"
            @asset-upload="uploadPanelAsset(sidePanel, $event)"
            @asset-error="toast($event, 'error')"
          />
        </div>
      </template>

      <!-- ── 模板 tab：内置模板画廊 + 建/改/删 + 字段编辑器 ── -->
      <template v-else>
        <div class="ssp-sect">内置模板</div>
        <div class="ssp-presets">
          <div v-for="preset in presets" :key="preset.kind" class="ssp-preset">
            <div class="ssp-preset-head">
              <span class="ssp-ctile ssp-ctile--sm" :class="`ssp-tint-${kindMetaOf(preset.kind).tint}`" aria-hidden="true">
                <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="kindMetaOf(preset.kind).icon"></svg>
              </span>
              <span class="ssp-preset-title">
                <span class="ssp-preset-name">{{ preset.name }}</span>
                <span class="ssp-preset-meta">{{ preset.fields.length }} 个字段</span>
              </span>
            </div>
            <div class="ssp-preset-desc">{{ preset.description }}</div>
            <div class="ssp-preset-foot">
              <span v-if="installedPresetKinds.has(preset.kind)" class="ssp-preset-done">
                <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
                已添加
              </span>
              <button
                v-else
                type="button"
                class="ssp-preset-add"
                :disabled="saving"
                :aria-label="`添加内置模板 ${preset.name}`"
                @click="installPreset(preset)"
              >＋ 添加</button>
            </div>
          </div>
        </div>

        <div class="ssp-toolbar ssp-toolbar--tpl">
          <span class="ssp-sect ssp-sect--inline">本会话模板 · 共 {{ templates.length }} 个</span>
          <button type="button" class="ssp-add-btn" @click="startCreateTemplate">＋ 新建模板</button>
        </div>

        <div v-if="!templates.length && !templateDraft" class="ssp-empty">还没有模板：一键添加上面的内置模板，或新建自定义模板。</div>

        <div v-for="template in templates" :key="template.id" class="ssp-tpl-row">
          <span class="ssp-ctile ssp-ctile--xs" :class="`ssp-tint-${kindMetaOf(template.kind).tint}`" aria-hidden="true">
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="kindMetaOf(template.kind).icon"></svg>
          </span>
          <span class="ssp-tpl-name">{{ template.name }}</span>
          <span class="ssp-kind" :class="`ssp-tint-${kindMetaOf(template.kind).tint}`">{{ kindMetaOf(template.kind).label }}</span>
          <span class="ssp-tpl-meta">{{ template.fields.length }} 个字段 · {{ panelCountOf(template.id) }} 个实例</span>
          <button type="button" class="ssp-icon-btn" :aria-label="`编辑模板 ${template.name}`" title="编辑" @click="startEditTemplate(template)">
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path></svg>
          </button>
          <button type="button" class="ssp-icon-btn" :aria-label="`删除模板 ${template.name}`" title="删除" @click="confirmTarget = { type: 'template', id: template.id, name: template.name }">
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
          </button>
        </div>

        <form v-if="templateDraft" class="ssp-form" @submit.prevent="submitTemplate">
          <div class="ssp-form-title">{{ templateDraft.id ? `编辑模板 · ${templateDraft.name || ''}` : '新建模板' }}</div>
          <div class="ssp-form-grid">
            <label class="ssp-field">
              <span class="ssp-label">名称</span>
              <input v-model="templateDraft.name" class="ssp-input" placeholder="如：角色状态栏" required>
            </label>
            <label class="ssp-field">
              <span class="ssp-label">类别 kind</span>
              <input v-model="templateDraft.kind" class="ssp-input" list="ssp-kind-options" placeholder="character / organization / building…" required>
              <datalist id="ssp-kind-options">
                <option value="character"></option>
                <option value="organization"></option>
                <option value="building"></option>
                <option value="region"></option>
                <option value="item"></option>
              </datalist>
            </label>
          </div>
          <label class="ssp-field">
            <span class="ssp-label">说明（可选）</span>
            <input v-model="templateDraft.description" class="ssp-input">
          </label>

          <div class="ssp-field-editor">
            <div class="ssp-frow ssp-frow--head" aria-hidden="true">
              <span>key</span><span>显示名</span><span>单位</span><span>类型</span><span>绑定目标 / 说明</span><span></span>
            </div>
            <div v-for="(row, index) in templateDraft.fields" :key="index" class="ssp-frow">
              <input v-model="row.key" class="ssp-input" placeholder="mood" :aria-label="`字段${index + 1} key`">
              <input v-model="row.label" class="ssp-input" placeholder="情绪" :aria-label="`字段${index + 1} 显示名`">
              <input v-model="row.unit" class="ssp-input" placeholder="如：km²" :aria-label="`字段${index + 1} 单位`">
              <!-- 批次E：五型中文名单点（STATUS_PANEL_FIELD_TYPE_OPTIONS·与面板内行级编辑器同一份） -->
              <select v-model="row.valueType" class="ssp-input" :aria-label="`字段${index + 1} 类型`">
                <option v-for="option in FIELD_TYPE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-if="row.valueType === 'binding'" v-model="row.binding" class="ssp-input" :aria-label="`字段${index + 1} 绑定目标`">
                <option value="" disabled>选择绑定目标</option>
                <option value="character.appearance">character.appearance（可见资料）</option>
              </select>
              <input v-else v-model="row.description" class="ssp-input" placeholder="说明（可选）" :aria-label="`字段${index + 1} 说明`">
              <button type="button" class="ssp-icon-btn" :aria-label="`删除字段${index + 1}`" title="删除字段" @click="templateDraft.fields.splice(index, 1)">
                <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
              </button>
            </div>
            <button type="button" class="ssp-add-btn ssp-add-btn--small" @click="addTemplateFieldRow">＋ 加字段</button>
          </div>

          <div class="ssp-form-actions">
            <button type="button" class="ssp-btn" @click="templateDraft = null">取消</button>
            <button type="submit" class="ssp-btn ssp-btn--primary" :disabled="saving">保存模板</button>
          </div>
        </form>
      </template>
      </div>
      </div>
    </div>
    </div>
  </section>

  <!-- 自定义字段/值格菜单（fixed 浮层·主副两卡共用一实例·左键字段名或右键值格唤起·点外/Esc 关）
       取代浏览器原生右键菜单；菜单骨架对齐 langhuan-menu token（尖角/轻阴影/图标左置）。
       两态：mode=menu 菜单项；mode=editor 原地变身字段设置面板（2026-07-10 仿飞书·「字段设置/插入/加字段」都在浮层里完成）。 -->
  <div
    v-if="ctxMenu"
    ref="ctxMenuEl"
    class="ssp-menu"
    :class="{ 'ssp-menu--editor': ctxMenu.mode === 'editor' }"
    :role="ctxMenu.mode === 'editor' ? 'form' : 'menu'"
    :aria-label="ctxMenu.mode === 'editor'
      ? (fieldEditor?.fieldKey ? `字段设置 ${fieldEditor.label}` : '新增字段')
      : ctxMenu.kind === 'field' ? `字段 ${ctxMenu.field?.label || ''} 管理菜单` : `值格菜单`"
    :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
    @contextmenu.prevent
  >
    <!-- 编辑器态（标题/五型中文类型/说明·取消确定贴底·仿参考图飞书字段面板） -->
    <template v-if="ctxMenu.mode === 'editor' && fieldEditor">
      <div class="ssp-menu-form">
        <label class="ssp-field">
          <span class="ssp-label">标题</span>
          <input v-model="fieldEditor.label" class="ssp-input" placeholder="如：情绪 / 装备栏" aria-label="字段标题">
        </label>
        <label class="ssp-field">
          <span class="ssp-label">单位（可选）</span>
          <input v-model="fieldEditor.unit" class="ssp-input" placeholder="如：km² / 人 / %" aria-label="字段单位">
        </label>
        <label class="ssp-field">
          <span class="ssp-label">字段类型</span>
          <select v-model="fieldEditor.valueType" class="ssp-input" aria-label="字段类型">
            <option v-for="option in FIELD_TYPE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <div v-if="fieldEditor.valueType === 'binding'" class="ssp-hint ssp-hint--flat">绑定目标：character.appearance（角色可见资料）——按本会话角色的主线或独立分支穿透。</div>
        <div v-else-if="fieldEditor.valueType === 'ref'" class="ssp-hint ssp-hint--flat">单位引用：值格引用本会话其他状态栏（如组织成员、所属组织），可点开查看。</div>
        <div v-else-if="fieldEditor.valueType === 'list'" class="ssp-hint ssp-hint--flat">列表：多个值硬隔离，一值一格，可逐格增删（多条文本用它）。</div>
        <label class="ssp-field">
          <span class="ssp-label">说明（可选）</span>
          <input v-model="fieldEditor.description" class="ssp-input" aria-label="字段说明">
        </label>
        <div class="ssp-form-actions">
          <button
            v-if="fieldEditor.fieldKey"
            type="button"
            class="ssp-btn ssp-btn--danger"
            :aria-label="`删除字段 ${fieldEditor.label}`"
            @click="requestDeleteField"
          >删除字段</button>
          <button type="button" class="ssp-btn" @click="closeCtxOverlay">取消</button>
          <button type="button" class="ssp-btn ssp-btn--primary" :disabled="saving" @click="submitFieldEditor">保存字段</button>
        </div>
      </div>
    </template>
    <template v-else-if="ctxMenu.kind === 'field'">
      <button type="button" role="menuitem" @click="menuFieldSettings">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>
        字段设置（标题 / 单位 / 类型）
      </button>
      <button type="button" role="menuitem" :disabled="ctxMenu.rowIndex <= 0" @click="menuMoveField(-1)">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path></svg>
        上移字段
      </button>
      <button type="button" role="menuitem" :disabled="ctxMenu.rowIndex >= ctxFieldCount - 1" @click="menuMoveField(1)">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>
        下移字段
      </button>
      <button type="button" role="menuitem" @click="menuInsertField(0)">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
        在上方插入字段
      </button>
      <button type="button" role="menuitem" @click="menuInsertField(1)">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
        在下方插入字段
      </button>
      <div class="ssp-menu-sep" aria-hidden="true"></div>
      <button type="button" role="menuitem" @click="menuCopyRow">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
        复制整行值
      </button>
      <button type="button" role="menuitem" @click="menuClearRow">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"></path><path d="m5.082 11.09 8.828 8.828"></path></svg>
        清空整行值
      </button>
      <div class="ssp-menu-sep" aria-hidden="true"></div>
      <button type="button" role="menuitem" class="ssp-menu-danger" @click="menuDeleteField">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        删除字段
      </button>
    </template>
    <template v-else>
      <button type="button" role="menuitem" @click="menuEditCell">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path></svg>
        编辑此格
      </button>
      <button type="button" role="menuitem" @click="menuCopyCell">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
        复制值
      </button>
      <button type="button" role="menuitem" @click="menuClearCell">
        <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"></path><path d="m5.082 11.09 8.828 8.828"></path></svg>
        清空此格
      </button>
    </template>
  </div>
  </div>
  </Teleport>

  <AppConfirmDialog
    :open="Boolean(confirmTarget)"
    :title="confirmTarget?.type === 'template' ? '删除模板' : confirmTarget?.type === 'field' ? '删除字段' : '删除状态栏'"
    :message="confirmTarget
      ? (confirmTarget.type === 'field'
        ? `确定删除字段「${confirmTarget.name}」吗？该字段在这张状态栏里的值会一并清除，不影响模板和其他状态栏。`
        : `确定删除「${confirmTarget.name}」吗？此操作不可撤销。`)
      : ''"
    confirm-text="删除"
    tone="danger"
    :z-index="13160"
    @cancel="confirmTarget = null"
    @confirm="runConfirmedDelete"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppConfirmDialog from '../../common/AppConfirmDialog.vue'
import StatusPanelCard from './StatusPanelCard.vue'
import { createOverlayDismissGuard } from '../../../utils/overlayDismissGuard'
import { useWorkspaceRuntimeStore } from '../../../app/workspaceRuntimeStore'
import { useToast } from '../../../composables/useToast'
import { useResizablePanel } from '../../../composables/app/useResizablePanel'
import { registerStatusWorkspaceXingyiHost } from '../../../app/statusWorkspaceXingyiHost'
import {
  deleteStatusPanel,
  deleteStatusPanelTemplate,
  fetchSessionTemporaryEntities,
  fetchStatusPanelTemplates,
  fetchStatusPanelsBundle,
  mergeStatusPanelsIntoWorld,
  saveStatusPanel,
  saveStatusPanelTemplate,
  uploadStatusAsset
} from '../../../repositories/chatRepository'
import type { ChatStatusPanel, ChatStatusPanelTemplate, StatusPanelFieldDef } from '../../../types'
import { STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT } from '../../../app/xingyiStatusSystemTools'
import { renderStatusPanelMarkdown, statusPanelFieldText } from '../../../app/statusPanelMarkdown'
import { STATUS_PANEL_FIELD_TYPE_OPTIONS, STATUS_PANEL_PRESETS, type StatusPanelPreset } from '../../../app/statusSystemPresets'
import { buildPanelValueDraft, hostLabelFor, kindMetaOf, panelNameByIdFrom, refTintClassFrom, tintClassForKind } from '../../../app/statusPanelDisplayMeta'

// 五型用户可见中文名（批次E 收口·statusSystemPresets 单点）：模板 tab 与 StatusPanelCard 行级编辑器共用
const FIELD_TYPE_OPTIONS = STATUS_PANEL_FIELD_TYPE_OPTIONS

// 状态系统面板（批次2·计划书 2026-07-08_状态系统积木骨架计划）：
// 最小能力 = 模板管理（建/改/删）+ 实例卡片（按模板渲染字段、手动编辑、binding 穿透、ref 下钻）。
// 2026-07-09 增强：内置模板一键添加（STATUS_PANEL_PRESETS 单点真值）+ 积木语义色块视觉（用户拍板「模拟经营游戏感」）。
// 服务端 400/409 中文报错经 ensureOk 原样抛出，这里 toast 原文透传，引用完整性/字段校验都靠它。

const props = defineProps<{
  open: boolean
  sessionId: string
  characterOptions: Array<{ id: string; name: string }>
  /** 批次4：打开后按宿主 id 下钻到对应状态栏（临时数据面板「状态栏」按钮跳入用）。 */
  focusHostId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const overlayDismissGuard = createOverlayDismissGuard()
const xingyiHostEl = ref<HTMLElement | null>(null)
const xingyiEmbedAllowed = ref(typeof window === 'undefined' || window.innerWidth > 960)
const { panelStyle: xingyiPanelStyle, startResize: startXingyiResize } = useResizablePanel({
  storageKey: 'langhuan_status_workspace_xingyi_width',
  defaultWidth: 360,
  minWidth: 280,
  maxWidth: 520
})

let releaseXingyiHost: (() => void) | null = null

function syncXingyiEmbedBreakpoint() {
  xingyiEmbedAllowed.value = window.innerWidth > 960
}

watch(
  () => [props.open, xingyiHostEl.value, xingyiEmbedAllowed.value] as const,
  ([isOpen, target, canEmbed]) => {
    releaseXingyiHost?.()
    releaseXingyiHost = isOpen && target && canEmbed
      ? registerStatusWorkspaceXingyiHost(target)
      : null
  },
  { immediate: true, flush: 'post' }
)

onMounted(() => window.addEventListener('resize', syncXingyiEmbedBreakpoint))
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncXingyiEmbedBreakpoint)
  releaseXingyiHost?.()
  releaseXingyiHost = null
})

function handleOverlayClose(event: MouseEvent) {
  if (overlayDismissGuard.shouldDismissFromOverlayClick(event)) emit('close')
}

const runtimeStore = useWorkspaceRuntimeStore()
const { toast } = useToast(runtimeStore)

// T1 值格展开态唯一键（同时只展开一个·批次D 起跨主/副面板互斥）：真值住父，v-model 下发给 StatusPanelCard。
// 网格渲染 / 自建横滑块 / 值格编辑 / 拖拽手柄已随批次D 抽进 StatusPanelCard.vue（主副各一实例）。
const expandedCell = ref<string | null>(null)

// ── T3 列宽/行高拖拽 + 持久化（2026-07-10 真机反馈升级：每列独立列宽 + 名称列可拖 + 行高每行独立·存 localStorage）──
// colWs 键=模板id::列index（每列独立·colW 作缺省宽兼容旧档）；nameW 键=模板id（名称列）；rowH 键=模板id::字段key。
// 视图态按会话 id 存浏览器本地，不落库、不碰 0.0 数据红线；换设备/清缓存回默认（列宽行高属纯视图态）。
const COL_W_DEFAULT = 96
const COL_W_MIN = 60
const COL_W_MAX = 320
const NAME_W_MIN = 60
const NAME_W_MAX = 240
const ROW_H_MIN = 30
const ROW_H_MAX = 400
// 视图态真值住父（主/副两卡共享·拖拽发生在 StatusPanelCard，松手 emit 回来落库）
const gridView = reactive<{ colW: number; colWs: Record<string, number>; nameW: Record<string, number>; rowH: Record<string, number> }>({
  colW: COL_W_DEFAULT,
  colWs: {},
  nameW: {},
  rowH: {}
})

function gridViewStorageKey() {
  return `ssp-grid-view::${String(props.sessionId || '').trim()}`
}
function readClampedMap(source: Record<string, unknown> | undefined, target: Record<string, number>, min: number, max: number) {
  if (!source || typeof source !== 'object') return
  for (const [k, v] of Object.entries(source)) {
    const n = Number(v)
    if (Number.isFinite(n)) target[k] = Math.min(max, Math.max(min, n))
  }
}
// 载入本会话的视图态（每次 load 都重置再读，切会话不串档）；旧档只有 colW/rowH 也兼容（colWs/nameW 空=各列走默认）。
function loadGridView() {
  gridView.colW = COL_W_DEFAULT
  for (const key of Object.keys(gridView.colWs)) delete gridView.colWs[key]
  for (const key of Object.keys(gridView.nameW)) delete gridView.nameW[key]
  for (const key of Object.keys(gridView.rowH)) delete gridView.rowH[key]
  try {
    const raw = window.localStorage.getItem(gridViewStorageKey())
    if (!raw) return
    const parsed = JSON.parse(raw) as { colW?: unknown; colWs?: Record<string, unknown>; nameW?: Record<string, unknown>; rowH?: Record<string, unknown> }
    const colW = Number(parsed?.colW)
    if (Number.isFinite(colW)) gridView.colW = Math.min(COL_W_MAX, Math.max(COL_W_MIN, colW))
    readClampedMap(parsed?.colWs, gridView.colWs, COL_W_MIN, COL_W_MAX)
    readClampedMap(parsed?.nameW, gridView.nameW, NAME_W_MIN, NAME_W_MAX)
    readClampedMap(parsed?.rowH, gridView.rowH, ROW_H_MIN, ROW_H_MAX)
  } catch { /* 忽略：回默认 */ }
}
function persistGridView() {
  try {
    window.localStorage.setItem(gridViewStorageKey(), JSON.stringify({ colW: gridView.colW, colWs: gridView.colWs, nameW: gridView.nameW, rowH: gridView.rowH }))
  } catch { /* 忽略持久化失败 */ }
}

const tab = ref<'panels' | 'templates'>('panels')
const loading = ref(false)
const saving = ref(false)
const templates = ref<ChatStatusPanelTemplate[]>([])
const panels = ref<ChatStatusPanel[]>([])
// 批3 世界归属：sessionWorldId 非空=本会话状态栏走世界级（跨会话共享）；
// pendingMergeCount=挂世界后残留在会话级未并入的模板+实例数（>0 顶部提示条给一键并入）
const sessionWorldId = ref('')
const pendingMergeCount = ref(0)
const merging = ref(false)

async function mergeLegacyIntoWorld() {
  const sessionId = String(props.sessionId || '').trim()
  if (!sessionId || merging.value) return
  merging.value = true
  try {
    const result = await mergeStatusPanelsIntoWorld(sessionId)
    toast(`已并入世界：模板 ${result.mergedTemplates} 个、状态栏 ${result.mergedPanels} 个`, 'success')
    await load()
  } catch (error) {
    toast(error instanceof Error ? error.message : '状态栏并入世界失败', 'error')
  } finally {
    merging.value = false
  }
}
const tempEntities = ref<Array<{ id: string; name: string }>>([])
const drillStack = ref<string[]>([])
// 删除确认目标：template/panel=整体删除；field=批次C 实例字段删除（panelId 指认宿主状态栏）
const confirmTarget = ref<{ type: 'template' | 'panel' | 'field'; id: string; name: string; panelId?: string } | null>(null)

const presets = STATUS_PANEL_PRESETS

// 五积木语义色 + Lucide 图标单点（与 statusSystemPresets 五积木一一对应；模板 tab 与实例卡共用）。
// 积木类型图标/色调/中文名单一真值：ChatStatusSystemPanel.vue（本文件）与地图弹窗只读卡片（批7）共用，
// 已抽到 src/app/statusPanelDisplayMeta.ts（导入 kindMetaOf/tintClassForKind），改积木类型只改那一处。
function tintClass(templateId: string) {
  return tintClassForKind(templateById(templateId)?.kind || '')
}

// 实例值编辑草稿：text/number/binding→string、list→string（一行一项）、ref→string[]；基线用 JSON 快照判脏。
type PanelValueDraft = Record<string, any>
const panelDrafts = reactive<Record<string, PanelValueDraft>>({})
const panelBaselines = reactive<Record<string, string>>({})

const panelDraft = ref<{ templateId: string; name: string; hostType: 'session_character' | 'temp_entity' | 'user' | 'none'; hostId: string } | null>(null)

type TemplateFieldRow = { key: string; label: string; unit: string; valueType: StatusPanelFieldDef['valueType']; binding: string; description: string; size: '' | 'short' | 'long' }
const templateDraft = ref<{ id: string; name: string; kind: string; description: string; fields: TemplateFieldRow[] } | null>(null)

const visiblePanels = computed(() => {
  if (!drillStack.value.length) return panels.value
  const currentId = drillStack.value[drillStack.value.length - 1]
  return panels.value.filter((panel) => panel.id === currentId)
})

// 折叠态列表的搜索过滤（快速定位）：按名称 / 宿主 / 类别标签匹配，空搜索返回全部。
const panelSearch = ref('')
const listPanels = computed(() => {
  const query = panelSearch.value.trim().toLowerCase()
  if (!query) return panels.value
  return panels.value.filter((panel) => {
    const kind = String(templateById(panel.templateId)?.kind || '').trim()
    const kindLabel = kindMetaOf(kind).label
    return [panel.name, hostLabel(panel), kind, kindLabel].some((text) => String(text || '').toLowerCase().includes(query))
  })
})

type PanelGroup = { key: string; label: string; panels: ChatStatusPanel[] }

/** 状态栏目录按模板开放 kind 分组；空值只归「未分类」，不按宿主或系统预设猜分类。 */
const panelGroups = computed<PanelGroup[]>(() => {
  const groups = new Map<string, PanelGroup>()
  for (const panel of listPanels.value) {
    const kind = String(templateById(panel.templateId)?.kind || '').trim()
    const key = kind || '__uncategorized__'
    let group = groups.get(key)
    if (!group) {
      group = { key, label: kind ? kindMetaOf(kind).label : '未分类', panels: [] }
      groups.set(key, group)
    }
    group.panels.push(panel)
  }
  return Array.from(groups.values())
})

const previewPanelId = ref('')
const previewStyle = ref<Record<string, string>>({})
let previewCloseTimer: ReturnType<typeof setTimeout> | null = null
const previewPanel = computed(() => panelById(previewPanelId.value))
const previewMarkdown = computed(() => {
  const panel = previewPanel.value
  if (!panel) return ''
  return renderStatusPanelMarkdown(panel, panelFields(panel), {
    resolvePanelName: panelNameById,
    readValue: (field) => draftOf(panel.id)[field.key]
  })
})

function cancelPreviewClose() {
  if (previewCloseTimer) clearTimeout(previewCloseTimer)
  previewCloseTimer = null
}

function schedulePreviewClose() {
  cancelPreviewClose()
  previewCloseTimer = setTimeout(() => {
    previewPanelId.value = ''
  }, 120)
}

function showPanelPreview(panel: ChatStatusPanel, event: MouseEvent | FocusEvent) {
  cancelPreviewClose()
  const anchor = event.currentTarget as HTMLElement | null
  const rect = anchor?.getBoundingClientRect()
  const viewportW = window.innerWidth || 1280
  const viewportH = window.innerHeight || 800
  const width = Math.min(360, Math.max(280, viewportW - 24))
  const height = Math.min(420, Math.max(240, viewportH - 24))
  const left = Math.max(12, Math.min(rect?.left || 12, viewportW - width - 12))
  const belowTop = (rect?.bottom || 12) + 8
  const top = belowTop + height <= viewportH - 12
    ? belowTop
    : Math.max(12, (rect?.top || viewportH) - height - 8)
  previewStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${height}px` }
  previewPanelId.value = panel.id
}

// 内置模板「已添加」判定：本会话已有同 kind 模板即视为已添加（不重复铺同类骨架）
const installedPresetKinds = computed(() => new Set(templates.value.map((template) => template.kind)))

watch(() => props.open, (open) => {
  if (open) void load()
}, { immediate: true })

// 批次4：按宿主 id 下钻（focusHostId 变化且面板已开时也生效，如临时数据面板连续跳两个实体）。
function applyFocusHost() {
  const hostId = String(props.focusHostId || '').trim()
  if (!hostId) return
  const target = panels.value.find((panel) => panel.hostId === hostId)
  if (target) {
    tab.value = 'panels'
    drillStack.value = [target.id]
  }
}
watch(() => props.focusHostId, () => {
  if (props.open && !loading.value) applyFocusHost()
})

// 星依/提调状态系统工具写成功后广播外部更新事件：面板打开中则整体重载（未保存草稿会被服务端新真值取代）。
function handleExternalUpdate() {
  if (props.open) void load()
}
onMounted(() => {
  window.addEventListener(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT, handleExternalUpdate)
})
onBeforeUnmount(() => {
  window.removeEventListener(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT, handleExternalUpdate)
  cancelPreviewClose()
})

// 批次D：换主卡（下钻/返回列表）时副面板、行级编辑器、字段菜单一并收起（避免跨卡残留态指向旧面板）
watch(drillStack, () => {
  sideStack.value = []
  fieldEditor.value = null
  ctxMenu.value = null
})

async function load() {
  const sessionId = String(props.sessionId || '').trim()
  if (!sessionId) return
  loadGridView()   // T3：先按会话读回列宽/行高视图态（本地持久化）
  loading.value = true
  try {
    const [templateItems, panelBundle, entityItems] = await Promise.all([
      fetchStatusPanelTemplates(sessionId),
      fetchStatusPanelsBundle(sessionId),
      fetchSessionTemporaryEntities(sessionId).catch(() => [])
    ])
    const panelItems = panelBundle.items
    templates.value = templateItems
    panels.value = panelItems
    // 批3 世界归属：挂世界会话读写世界级；pendingMergeCount>0 时顶部提示一键并入旧会话级状态栏
    sessionWorldId.value = panelBundle.worldId
    pendingMergeCount.value = panelBundle.pendingSessionScopeCount
    tempEntities.value = entityItems.map((entity) => ({ id: String(entity.id || ''), name: String(entity.name || entity.id || '') }))
    drillStack.value = []
    sideStack.value = []
    expandedCell.value = null
    fieldEditor.value = null
    ctxMenu.value = null
    panelSearch.value = ''
    previewPanelId.value = ''
    panelDraft.value = null
    templateDraft.value = null
    for (const key of Object.keys(panelDrafts)) delete panelDrafts[key]
    for (const key of Object.keys(panelBaselines)) delete panelBaselines[key]
    panelItems.forEach(seedPanelDraft)
    applyFocusHost()
  } catch (error) {
    toast(error instanceof Error ? error.message : '加载状态系统失败', 'error')
  } finally {
    loading.value = false
  }
}

function templateById(templateId: string): ChatStatusPanelTemplate | null {
  return templates.value.find((template) => template.id === templateId) || null
}

function templateFields(templateId: string): StatusPanelFieldDef[] {
  return templateById(templateId)?.fields || []
}

/** 实例字段真值单点（批次B）：实例自带快照优先，旧实例（快照为空）回退模板字段。渲染/草稿/保存都走这里。 */
function panelFields(panel: ChatStatusPanel): StatusPanelFieldDef[] {
  return panel.fields?.length ? panel.fields : templateFields(panel.templateId)
}

function panelById(panelId: string): ChatStatusPanel | null {
  return panels.value.find((panel) => panel.id === panelId) || null
}

function panelNameById(panelId: string) {
  return panelNameByIdFrom(panels.value, panelId)
}

function panelCountOf(templateId: string) {
  return panels.value.filter((panel) => panel.templateId === templateId).length
}

function hostLabel(panel: ChatStatusPanel) {
  return hostLabelFor(panel, { characterOptions: props.characterOptions, tempEntities: tempEntities.value })
}

function seedPanelDraft(panel: ChatStatusPanel) {
  const draft = buildPanelValueDraft(panel, panelFields(panel))
  panelDrafts[panel.id] = draft
  panelBaselines[panel.id] = JSON.stringify(draft)
}

function draftOf(panelId: string): PanelValueDraft {
  if (!panelDrafts[panelId]) panelDrafts[panelId] = {}
  return panelDrafts[panelId]
}

function isPanelDirty(panelId: string) {
  return JSON.stringify(panelDrafts[panelId] || {}) !== (panelBaselines[panelId] || '{}')
}

function resetPanelDraft(panel: ChatStatusPanel) {
  seedPanelDraft(panel)
}

// ref 添加候选（下发给 StatusPanelCard·排除自己 + 已选）；list/ref 逐格增删已迁子组件（就地改这里的 draft 对象）。
function refCandidatesOf(panelId: string, fieldKey: string) {
  const value = draftOf(panelId)[fieldKey]
  const selected = new Set(Array.isArray(value) ? value : [])
  return panels.value.filter((panel) => panel.id !== panelId && !selected.has(panel.id))
}

// ref 引用格按目标积木染色（下发给 StatusPanelCard）
function refTintClass(refId: string) {
  return refTintClassFrom(panels.value, templates.value, refId)
}

function drillInto(panelId: string) {
  if (!panels.value.some((panel) => panel.id === panelId)) return
  cancelPreviewClose()
  previewPanelId.value = ''
  expandedCell.value = null
  drillStack.value = [...drillStack.value, panelId]
}

// ── 批次D 并行副面板（§6.4·用户拍板左右分栏 + 旧 ref 原地下钻退役）──
// 主卡引用格点击=开/换副面板；副卡内再点引用=替换副面板内容并记浏览链（sideStack·尾=当前显示）；
// 副面板独立关闭；换主卡/重载时自动收起。不无限套娃开第三栏。
const sideStack = ref<string[]>([])
const sidePanel = computed(() => {
  const id = sideStack.value[sideStack.value.length - 1] || ''
  return id ? panelById(id) : null
})
const sideCrumbs = computed(() => sideStack.value.map((id) => ({ id, name: panelNameById(id) })))

function primaryPanelId() {
  return drillStack.value[drillStack.value.length - 1] || ''
}

/** 主卡引用格点击：滑出/替换副面板（引用的就是主卡自己时服务端已禁自引用，防御性忽略）。 */
function openSidePanel(refId: string) {
  if (!panelById(refId) || refId === primaryPanelId()) return
  expandedCell.value = null
  sideStack.value = [refId]
}

/** 副卡引用格点击：替换副面板内容（浏览链追加；指回主卡/当前副卡则不动）。 */
function replaceSidePanel(refId: string) {
  if (!panelById(refId)) return
  if (refId === primaryPanelId()) {
    toast('这个状态栏就在左侧主面板', 'info')
    return
  }
  if (sideStack.value[sideStack.value.length - 1] === refId) return
  expandedCell.value = null
  sideStack.value = [...sideStack.value.filter((id) => id !== refId), refId]
}

function closeSidePanel() {
  sideStack.value = []
}

function sideCrumbTo(index: number) {
  sideStack.value = sideStack.value.slice(0, index + 1)
}

// 大弹窗内切入/退出引用副表时收起目录悬浮预览，避免跨视图残留。
watch(sidePanel, () => {
  previewPanelId.value = ''
})

// ── 批次C 行级类型编辑器（§6.5·点字段名格开·结构改动落实例字段快照，模板 tab 只管种子）──
type FieldEditorState = {
  panelId: string
  /** null=新增字段；否则=正在编辑的字段 key（key 稳定不可改，标题/类型/说明可改）。 */
  fieldKey: string | null
  label: string
  unit: string
  valueType: StatusPanelFieldDef['valueType']
  description: string
  /** 新增字段的插入位置（菜单「在上/下方插入」带入；缺省=追加到末尾）。 */
  insertIndex?: number
}
const fieldEditor = ref<FieldEditorState | null>(null)

function openFieldEditor(panel: ChatStatusPanel, field?: StatusPanelFieldDef) {
  expandedCell.value = null
  fieldEditor.value = field
    ? { panelId: panel.id, fieldKey: field.key, label: field.label, unit: String(field.unit || ''), valueType: field.valueType, description: String(field.description || '') }
    : { panelId: panel.id, fieldKey: null, label: '', unit: '', valueType: 'text', description: '' }
}

function buildFieldKey() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 类型变更时把草稿值尽量搬到新类型（text↔number/list 互转；转 ref 清空、转 binding 不写值防误覆盖角色卡真值）。
 *  返回 undefined=该字段本次不提交值（服务端 values 整包替换语义下即清除）。 */
function convertDraftValueForType(
  nextType: StatusPanelFieldDef['valueType'],
  raw: unknown
): unknown | undefined {
  if (nextType === 'ref' || nextType === 'binding') return undefined
  if (nextType === 'asset') return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : undefined
  if (nextType === 'list') {
    if (Array.isArray(raw)) return raw.map((item) => String(item ?? '').trim()).filter(Boolean)
    const text = String(raw ?? '').trim()
    return text ? [text] : []
  }
  if (nextType === 'number') {
    const text = Array.isArray(raw) ? '' : String(raw ?? '').trim()
    const num = Number(text)
    return text && Number.isFinite(num) ? num : undefined
  }
  // text：list 值按行拼回单文本
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? '')).filter(Boolean).join('\n')
  return String(raw ?? '')
}

/** 结构保存（批次C 唯一写口）：把新字段集 + 按新类型转换后的当前草稿值一起提交（结构立即落库，值草稿不丢）。 */
async function savePanelStructure(panel: ChatStatusPanel, nextFields: StatusPanelFieldDef[]) {
  const prevFields = new Map(panelFields(panel).map((field) => [field.key, field]))
  const draft = draftOf(panel.id)
  const values: Record<string, unknown> = {}
  for (const field of nextFields) {
    const prev = prevFields.get(field.key)
    const raw = draft[field.key]
    if (prev && prev.valueType === field.valueType) {
      // 类型没变：沿用 savePanelValues 的提交口径
      if (field.valueType === 'binding') {
        if (panel.hostType === 'session_character') values[field.key] = String(raw ?? '')
      } else if (field.valueType === 'number') {
        const text = String(raw ?? '').trim()
        if (text) values[field.key] = Number(text)
      } else if (field.valueType === 'list') {
        values[field.key] = (Array.isArray(raw) ? raw : []).map((item) => String(item ?? '').trim()).filter(Boolean)
      } else if (field.valueType === 'ref') {
        values[field.key] = Array.isArray(raw) ? raw : []
      } else {
        values[field.key] = String(raw ?? '')
      }
    } else if (prev) {
      const converted = convertDraftValueForType(field.valueType, raw)
      if (converted !== undefined) values[field.key] = converted
    }
    // 新字段（无 prev）：不带值，展开格后再填
  }
  saving.value = true
  try {
    const saved = await saveStatusPanel(props.sessionId, {
      id: panel.id,
      templateId: panel.templateId,
      name: panel.name,
      hostType: panel.hostType,
      hostId: panel.hostId,
      values,
      fields: nextFields,
      expectedVersion: panel.version
    })
    panels.value = panels.value.map((item) => (item.id === saved.id ? saved : item))
    seedPanelDraft(saved)
    // 结构落库成功：编辑器浮层一并收（失败则保留浮层让用户就地改）
    fieldEditor.value = null
    ctxMenu.value = null
    toast('已保存字段设置', 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '保存字段设置失败', 'error')
  } finally {
    saving.value = false
  }
}

/** 提交行级编辑器（批次D 起主/副卡共用·按 fieldEditor.panelId 认卡）。 */
function submitFieldEditor() {
  const editor = fieldEditor.value
  if (!editor) return
  const panel = panelById(editor.panelId)
  if (!panel) return
  const current = panelFields(panel).map((field) => ({ ...field }))
  if (editor.fieldKey) {
    const index = current.findIndex((field) => field.key === editor.fieldKey)
    if (index < 0) return
    const prev = current[index]
    current[index] = {
      key: prev.key,
      label: editor.label.trim() || prev.key,
      ...(editor.unit.trim() ? { unit: editor.unit.trim() } : {}),
      valueType: editor.valueType,
      ...(editor.valueType === 'binding' ? { binding: 'character.appearance' } : {}),
      // size 只对 text/number 有意义（与模板编辑器同口径）
      ...((prev.size === 'short' || prev.size === 'long') && (editor.valueType === 'text' || editor.valueType === 'number') ? { size: prev.size } : {}),
      description: editor.description,
      ...(prev.defaultValue !== undefined ? { defaultValue: prev.defaultValue } : {})
    }
  } else {
    const row: StatusPanelFieldDef = {
      key: buildFieldKey(),
      label: editor.label.trim() || '新字段',
      ...(editor.unit.trim() ? { unit: editor.unit.trim() } : {}),
      valueType: editor.valueType,
      ...(editor.valueType === 'binding' ? { binding: 'character.appearance' } : {}),
      description: editor.description
    }
    // 菜单「在上/下方插入」带插入位置；表尾加字段行/兜底按钮缺省=追加末尾
    const at = editor.insertIndex
    if (at !== undefined && at >= 0 && at <= current.length) current.splice(at, 0, row)
    else current.push(row)
  }
  void savePanelStructure(panel, current)
}

/** 删字段统一入口（编辑器浮层删除按钮 + 字段菜单共用）：至少留一个字段的硬门在这。 */
function requestDeleteFieldFor(panel: ChatStatusPanel, fieldKey: string, label: string) {
  if (panelFields(panel).length <= 1) {
    toast('至少保留一个字段（要清空这张状态栏可以直接删除它）', 'error')
    return
  }
  confirmTarget.value = { type: 'field', id: fieldKey, name: label || fieldKey, panelId: panel.id }
}

function requestDeleteField() {
  const editor = fieldEditor.value
  if (!editor?.fieldKey) return
  const panel = panelById(editor.panelId)
  if (!panel) return
  // 确认弹窗接管，编辑器浮层先收（删除走 runConfirmedDelete，不依赖编辑器残态）
  closeCtxOverlay()
  requestDeleteFieldFor(panel, editor.fieldKey, editor.label)
}

// ── 自定义字段/值格菜单（2026-07-10 真机反馈：类型修改入右键菜单·浏览器原生菜单退役）──
// 字段名格左键/右键都唤起（飞书同款习惯）；值格只右键（左键保持单击展开编辑）。
// mode=menu 菜单项动作后即收；mode=editor=浮层原地变身字段设置面板（「字段设置/插入/加字段」共用·仿飞书）。
type CtxMenuState = {
  kind: 'field' | 'cell'
  mode: 'menu' | 'editor'
  x: number
  y: number
  /** 原始唤起点（clamp 前）：切换 menu→editor 尺寸变化时按锚点重新夹位。 */
  anchorX: number
  anchorY: number
  panelId: string
  /** 菜单态必有；editor 态（如表内加字段直开）可无。 */
  field?: StatusPanelFieldDef
  rowIndex: number
  cellIndex: number
}
const ctxMenu = ref<CtxMenuState | null>(null)
const ctxMenuEl = ref<HTMLElement | null>(null)

const ctxFieldCount = computed(() => {
  const panel = ctxMenu.value ? panelById(ctxMenu.value.panelId) : null
  return panel ? panelFields(panel).length : 0
})

function clampMenuPosition(x: number, y: number, width: number, height: number) {
  const pad = 8
  const vw = window.innerWidth || 0
  const vh = window.innerHeight || 0
  return {
    x: Math.max(pad, Math.min(x, Math.max(pad, vw - width - pad))),
    y: Math.max(pad, Math.min(y, Math.max(pad, vh - height - pad)))
  }
}

/** 挂载/变身后按浮层实测尺寸对锚点重新夹位（贴视口边不出屏）。 */
function requeueCtxClamp() {
  void nextTick(() => {
    const el = ctxMenuEl.value
    const state = ctxMenu.value
    if (!el || !state) return
    const rect = el.getBoundingClientRect()
    const next = clampMenuPosition(state.anchorX, state.anchorY, Math.ceil(rect.width || 190), Math.ceil(rect.height || 200))
    if (next.x !== state.x || next.y !== state.y) ctxMenu.value = { ...state, x: next.x, y: next.y }
  })
}

function openCtxMenu(panel: ChatStatusPanel, kind: 'field' | 'cell', payload: { x: number; y: number; field: StatusPanelFieldDef; rowIndex?: number; cellIndex?: number }) {
  const estimate = clampMenuPosition(payload.x, payload.y, 190, kind === 'field' ? 268 : 96)
  ctxMenu.value = {
    kind,
    mode: 'menu',
    x: estimate.x,
    y: estimate.y,
    anchorX: payload.x,
    anchorY: payload.y,
    panelId: panel.id,
    field: payload.field,
    rowIndex: payload.rowIndex ?? 0,
    cellIndex: payload.cellIndex ?? 0
  }
  requeueCtxClamp()
}

/** 表内「＋ 加字段」：跳过菜单态，点击处直接弹编辑器浮层（新增模式）。 */
function openAddFieldEditor(panel: ChatStatusPanel, payload: { x: number; y: number }) {
  openFieldEditor(panel)
  ctxMenu.value = {
    kind: 'field',
    mode: 'editor',
    x: payload.x,
    y: payload.y,
    anchorX: payload.x,
    anchorY: payload.y,
    panelId: panel.id,
    rowIndex: 0,
    cellIndex: 0
  }
  requeueCtxClamp()
}

/** 关整个浮层（菜单态/编辑器态通吃）：编辑器数据一并丢弃。 */
function closeCtxOverlay() {
  ctxMenu.value = null
  fieldEditor.value = null
}

function handleCtxOutsidePointerDown(event: PointerEvent) {
  if (!ctxMenu.value) return
  const el = ctxMenuEl.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  closeCtxOverlay()
}
function handleCtxKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && ctxMenu.value) closeCtxOverlay()
}
onMounted(() => {
  window.addEventListener('pointerdown', handleCtxOutsidePointerDown, true)
  window.addEventListener('keydown', handleCtxKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleCtxOutsidePointerDown, true)
  window.removeEventListener('keydown', handleCtxKeydown)
})

/** 菜单动作统一收口：取当前目标并关菜单（动作即收是右键菜单惯例）。菜单态 field 必在，缺=残态防御。 */
function takeCtxMenu(): { state: CtxMenuState; field: StatusPanelFieldDef; panel: ChatStatusPanel } | null {
  const state = ctxMenu.value
  ctxMenu.value = null
  if (!state?.field) return null
  const panel = panelById(state.panelId)
  return panel ? { state, field: state.field, panel } : null
}

/** 字段设置：浮层原地 menu→editor 变身（仿飞书·不落回卡片底部）。 */
function menuFieldSettings() {
  const state = ctxMenu.value
  const panel = state ? panelById(state.panelId) : null
  if (!state?.field || !panel) {
    closeCtxOverlay()
    return
  }
  openFieldEditor(panel, state.field)
  ctxMenu.value = { ...state, mode: 'editor' }
  requeueCtxClamp()
}

/** 上移/下移字段：结构立即落库（与字段编辑器同语义·实例快照顺序=渲染顺序）。 */
function menuMoveField(delta: -1 | 1) {
  const ctx = takeCtxMenu()
  if (!ctx) return
  const fields = panelFields(ctx.panel).map((field) => ({ ...field }))
  const from = fields.findIndex((field) => field.key === ctx.field.key)
  const to = from + delta
  if (from < 0 || to < 0 || to >= fields.length) return
  const [moved] = fields.splice(from, 1)
  fields.splice(to, 0, moved)
  void savePanelStructure(ctx.panel, fields)
}

/** 在上/下方插入字段：浮层原地变身新增编辑器并记插入位置（提交时 splice 进对应行）。 */
function menuInsertField(offset: 0 | 1) {
  const state = ctxMenu.value
  const panel = state ? panelById(state.panelId) : null
  if (!state?.field || !panel) {
    closeCtxOverlay()
    return
  }
  const fields = panelFields(panel)
  const at = fields.findIndex((field) => field.key === state.field?.key)
  openFieldEditor(panel)
  if (fieldEditor.value) fieldEditor.value.insertIndex = (at < 0 ? fields.length : at) + offset
  ctxMenu.value = { ...state, mode: 'editor' }
  requeueCtxClamp()
}

/** 字段整行值转纯文本（复制用·ref 转状态栏名称）。渲染口径单点=statusPanelMarkdown.ts（提调注入同一份）。 */
function fieldValueText(panel: ChatStatusPanel, field: StatusPanelFieldDef): string {
  return statusPanelFieldText(field, draftOf(panel.id)[field.key], panelNameById)
}

function menuCopyRow() {
  const ctx = takeCtxMenu()
  if (!ctx) return
  void copyText(fieldValueText(ctx.panel, ctx.field))
}

/** 清空整行值：只动草稿（出现未保存脏标，可「还原」反悔；点保存才落库）。 */
function menuClearRow() {
  const ctx = takeCtxMenu()
  if (!ctx) return
  const draft = draftOf(ctx.panel.id)
  draft[ctx.field.key] = ctx.field.valueType === 'list' || ctx.field.valueType === 'ref' ? [] : ''
}

function menuDeleteField() {
  const ctx = takeCtxMenu()
  if (!ctx) return
  requestDeleteFieldFor(ctx.panel, ctx.field.key, ctx.field.label)
}

function menuEditCell() {
  const ctx = takeCtxMenu()
  if (!ctx) return
  // 与 StatusPanelCard.cellKey 同一格式：panelId::fieldKey::index
  expandedCell.value = `${ctx.panel.id}::${ctx.field.key}::${ctx.state.cellIndex}`
}

function cellValueText(panel: ChatStatusPanel, field: StatusPanelFieldDef, cellIndex: number): string {
  const raw = draftOf(panel.id)[field.key]
  if (Array.isArray(raw)) return String(raw[cellIndex] ?? '')
  return String(raw ?? '')
}

function menuCopyCell() {
  const ctx = takeCtxMenu()
  if (!ctx) return
  void copyText(cellValueText(ctx.panel, ctx.field, ctx.state.cellIndex))
}

/** 清空单格：list 置空该格（格不删·删格用 ×），单值格清空文本；同样只动草稿。 */
function menuClearCell() {
  const ctx = takeCtxMenu()
  if (!ctx) return
  const draft = draftOf(ctx.panel.id)
  const key = ctx.field.key
  const raw = draft[key]
  if (ctx.field.valueType === 'list' && Array.isArray(raw)) {
    if (ctx.state.cellIndex < raw.length) {
      const arr = [...raw]
      arr[ctx.state.cellIndex] = ''
      draft[key] = arr
    }
    return
  }
  if (!Array.isArray(raw)) draft[key] = ''
}

// ── 复制（值/整表）──
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('已复制', 'success')
  } catch {
    toast('复制失败（浏览器未授权剪贴板）', 'error')
  }
}

/** 复制整表为 Markdown（卡头按钮）：角色状态一键贴走存档/喂外部 AI。
 *  渲染单点=statusPanelMarkdown.ts（提调统筹注入同一份·改格式两处同步生效）；
 *  valueOf 传草稿读取器＝所见即所得（含未保存修改），与旧行为一致。 */
function copyPanelMarkdown(panel: ChatStatusPanel) {
  void copyText(renderStatusPanelMarkdown(panel, panelFields(panel), {
    resolvePanelName: panelNameById,
    readValue: (field) => draftOf(panel.id)[field.key]
  }))
}

async function uploadPanelAsset(panel: ChatStatusPanel, payload: { fieldKey: string; fileName: string; dataUri: string; alt: string }) {
  saving.value = true
  try {
    const uploaded = await uploadStatusAsset(props.sessionId, {
      dataUri: payload.dataUri,
      fileName: payload.fileName,
      alt: payload.alt,
      sourceType: 'upload',
      sourceRef: { panelId: panel.id, fieldKey: payload.fieldKey },
      bind: {
        panelId: panel.id,
        fieldKey: payload.fieldKey,
        expectedVersion: panel.version,
        idempotencyKey: `status-asset-bind-${panel.id}-${payload.fieldKey}-${Date.now()}`
      }
    })
    if (!uploaded.panel) throw new Error('状态图片已上传，但没有返回原子绑定后的状态栏')
    panels.value = panels.value.map((item) => item.id === uploaded.panel?.id ? uploaded.panel : item)
    seedPanelDraft(uploaded.panel)
    toast('图片已上传并绑定到状态栏', 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '上传状态图片失败', 'error')
  } finally {
    saving.value = false
  }
}

async function savePanelValues(panel: ChatStatusPanel) {
  const draft = draftOf(panel.id)
  const values: Record<string, unknown> = {}
  for (const field of panelFields(panel)) {
    const raw = draft[field.key]
    if (field.valueType === 'binding') {
      // binding 只有角色宿主可写（服务端硬校验），非角色宿主不带 key
      if (panel.hostType === 'session_character') values[field.key] = String(raw ?? '')
    } else if (field.valueType === 'number') {
      const text = String(raw ?? '').trim()
      if (text) values[field.key] = Number(text)
    } else if (field.valueType === 'list') {
      values[field.key] = (Array.isArray(raw) ? raw : []).map((item) => String(item ?? '').trim()).filter(Boolean)
    } else if (field.valueType === 'ref') {
      values[field.key] = Array.isArray(raw) ? raw : []
    } else if (field.valueType === 'asset') {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) values[field.key] = raw
    } else {
      values[field.key] = String(raw ?? '')
    }
  }
  saving.value = true
  try {
    const saved = await saveStatusPanel(props.sessionId, {
      id: panel.id,
      templateId: panel.templateId,
      name: panel.name,
      hostType: panel.hostType,
      hostId: panel.hostId,
      values,
      expectedVersion: panel.version
    })
    panels.value = panels.value.map((item) => (item.id === saved.id ? saved : item))
    seedPanelDraft(saved)
    toast('已保存', 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '保存状态栏失败', 'error')
  } finally {
    saving.value = false
  }
}

function startCreatePanel() {
  panelDraft.value = { templateId: templates.value[0]?.id || '', name: '', hostType: 'none', hostId: '' }
}

async function submitCreatePanel() {
  const draft = panelDraft.value
  if (!draft) return
  saving.value = true
  try {
    const saved = await saveStatusPanel(props.sessionId, {
      templateId: draft.templateId,
      name: draft.name,
      hostType: draft.hostType,
      hostId: draft.hostId,
      values: {},
      expectedVersion: 0
    })
    panels.value = [...panels.value, saved]
    seedPanelDraft(saved)
    panelDraft.value = null
    toast('已创建状态栏', 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '创建状态栏失败', 'error')
  } finally {
    saving.value = false
  }
}

// 内置模板一键添加：预设字段直接落成本会话正式模板行（statusSystemPresets 单点真值）
async function installPreset(preset: StatusPanelPreset) {
  saving.value = true
  try {
    const saved = await saveStatusPanelTemplate(props.sessionId, {
      name: preset.name,
      kind: preset.kind,
      description: preset.description,
      fields: preset.fields,
      presentation: preset.presentation
    })
    templates.value = [...templates.value, saved]
    toast(`已添加「${preset.name}」`, 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '添加内置模板失败', 'error')
  } finally {
    saving.value = false
  }
}

function startCreateTemplate() {
  templateDraft.value = { id: '', name: '', kind: '', description: '', fields: [{ key: '', label: '', unit: '', valueType: 'text', binding: '', description: '', size: '' }] }
}

function startEditTemplate(template: ChatStatusPanelTemplate) {
  templateDraft.value = {
    id: template.id,
    name: template.name,
    kind: template.kind,
    description: String(template.description || ''),
    fields: template.fields.map((field) => ({
      key: field.key,
      label: field.label,
      unit: String(field.unit || ''),
      valueType: field.valueType,
      binding: String(field.binding || ''),
      description: String(field.description || ''),
      size: field.size === 'short' || field.size === 'long' ? field.size : ''
    }))
  }
}

function addTemplateFieldRow() {
  templateDraft.value?.fields.push({ key: '', label: '', unit: '', valueType: 'text', binding: '', description: '', size: '' })
}

async function submitTemplate() {
  const draft = templateDraft.value
  if (!draft) return
  saving.value = true
  try {
    const saved = await saveStatusPanelTemplate(props.sessionId, {
      ...(draft.id ? { id: draft.id } : {}),
      expectedVersion: draft.id ? (templates.value.find((template) => template.id === draft.id)?.version || 1) : 0,
      name: draft.name,
      kind: draft.kind,
      description: draft.description,
      fields: draft.fields.map((row) => ({
        key: row.key,
        label: row.label,
        ...(row.unit.trim() ? { unit: row.unit.trim() } : {}),
        valueType: row.valueType,
        ...(row.valueType === 'binding' ? { binding: row.binding } : {}),
        // size 只对 text/number 有意义（短区只收这两型），其余型不带
        ...((row.size === 'short' || row.size === 'long') && (row.valueType === 'text' || row.valueType === 'number') ? { size: row.size } : {}),
        description: row.description
      })) as StatusPanelFieldDef[]
    })
    const exists = templates.value.some((template) => template.id === saved.id)
    templates.value = exists
      ? templates.value.map((template) => (template.id === saved.id ? saved : template))
      : [...templates.value, saved]
    templateDraft.value = null
    // 模板=种子（批次B 起）：有字段快照的实例不受模板改动影响；只有旧无快照实例跟随新模板字段。
    // seedPanelDraft 走 panelFields（实例快照优先），这里统一重建即可得到正确行为。
    panels.value.filter((panel) => panel.templateId === saved.id).forEach(seedPanelDraft)
    toast('已保存模板', 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '保存模板失败', 'error')
  } finally {
    saving.value = false
  }
}

async function runConfirmedDelete() {
  const target = confirmTarget.value
  confirmTarget.value = null
  if (!target) return
  // 批次C：删实例字段=结构保存（快照少一条 + 该字段值随 values 整包替换自然清除）
  if (target.type === 'field') {
    const panel = target.panelId ? panelById(target.panelId) : null
    if (!panel) return
    const remaining = panelFields(panel).filter((field) => field.key !== target.id)
    if (!remaining.length) return
    await savePanelStructure(panel, remaining)
    return
  }
  try {
    if (target.type === 'template') {
      await deleteStatusPanelTemplate(props.sessionId, target.id)
      templates.value = templates.value.filter((template) => template.id !== target.id)
    } else {
      const panel = panelById(target.id)
      if (!panel) return
      await deleteStatusPanel(props.sessionId, target.id, panel.version)
      panels.value = panels.value.filter((panel) => panel.id !== target.id)
      drillStack.value = drillStack.value.filter((id) => id !== target.id)
      // 批次D：被删面板在副面板浏览链上时整链收起（链上后续内容都基于它打开）
      if (sideStack.value.includes(target.id)) sideStack.value = []
      delete panelDrafts[target.id]
      delete panelBaselines[target.id]
    }
    toast('已删除', 'success')
  } catch (error) {
    // 409（模板有实例 / 状态栏被引用）等服务端中文报错原样透传
    toast(error instanceof Error ? error.message : '删除失败', 'error')
  }
}
</script>

<style scoped>
/* 状态系统是与舆图/剧本同级的大工作区弹窗；目录与表格共用同一份状态真值。 */
.ssp-overlay {
  position: fixed;
  inset: 0;
  z-index: 13020;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: var(--langhuan-dialog-overlay, rgba(72, 68, 63, 0.18));
  backdrop-filter: blur(6px);
  animation: lh-fade var(--lh-dur, 0.18s) ease;
}

.ssp-dialog {
  width: min(1760px, calc(100vw - 36px));
  height: min(960px, calc(100vh - 36px));
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--morandi-border, rgba(219, 215, 207, 0.9));
  border-radius: 18px;
  background: var(--langhuan-dialog-surface, var(--morandi-bg, #f3f2ef));
  color: var(--morandi-text, #4f463f);
  box-shadow: 0 28px 80px rgba(28, 23, 20, 0.2);
  animation: lh-modal-in var(--lh-dur-slow, 0.3s) var(--lh-ease-bloom, ease-out);
}

.ssp-dialog__head {
  flex: 0 0 54px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px 0 18px;
  border-bottom: 1px solid var(--morandi-border, #e5e5e5);
  background: var(--morandi-card, var(--langhuan-dialog-surface, #f3f2ef));
}

.ssp-dialog__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.ssp-dialog__title > .line-icon {
  width: 19px;
  height: 19px;
  color: var(--morandi-accent, #5c8a5c);
}

.ssp-dialog__title strong {
  font-size: 0.96rem;
}

.ssp-dialog__title span {
  color: var(--morandi-text-light, #8a8378);
  font-size: 0.76rem;
}

.ssp-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--langhuan-paper-bg, var(--morandi-bg, #fffdf8));
}

.ssp-dialog__body {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.ssp-xingyi {
  display: flex;
  flex: 0 0 360px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--morandi-border, #e5e5e5);
  background: var(--morandi-surface, #f8f7f3);
}

.ssp-xingyi__host {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ssp-xingyi__resize {
  position: relative;
  z-index: 5;
  flex: none;
  width: 7px;
  margin: 0 -4px;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.ssp-xingyi__resize:hover {
  background: var(--morandi-soft-bg, rgba(92, 138, 92, 0.08));
}

.ssp-panel__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--morandi-text-light, #9a9287);
  cursor: pointer;
}

.ssp-panel__close .line-icon { width: 17px; height: 17px; }

.ssp-panel__close:hover {
  background: color-mix(in srgb, var(--morandi-border, #e5e5e5) 34%, transparent);
  color: var(--morandi-text, #4f463f);
}

.ssp {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0; /* 全链 min-width:0：防固定格表格内容把工作区撑宽（flexbox min-width:auto 陷阱） */
}

.ssp-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 22px 24px;
  /* 面板纵滚=自定义橄榄滑块（与卡内 hbar/格内滚动同色系·用户 2026-07-10 拍板） */
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, #7f7f4d 50%, transparent) transparent;
}

.ssp-body::-webkit-scrollbar {
  width: 6px;
}

.ssp-body::-webkit-scrollbar-track {
  background: transparent;
}

.ssp-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, #7f7f4d 50%, transparent);
}

.ssp-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, #7f7f4d 72%, transparent);
}

/* 下钻到单个状态栏时：卡片满铺弹窗工作区，四周不留空隙。 */
.ssp--single .ssp-body {
  padding: 0;
  gap: 0;
}

.ssp--single .ssp-crumbs {
  padding: 12px 20px 10px;
  border-bottom: 1px solid var(--morandi-border, #efe9df);
}

.ssp--single .ssp-cards {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

.ssp--single .ssp-card {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  /* 短内容铺满工作区、长内容自然撑高由 body 滚动（不裁切） */
  min-height: 100%;
  height: auto;
  overflow: visible;
  /* grid item 默认 min-width:auto 不肯小于内容宽 → 会被固定格表格撑破工作区；置 0 允许内部横滚。 */
  min-width: 0;
}

/* 批次D 并行副面板：左主右副对半分栏。两卡（子组件根）都靠上面的 min-width:0 约束——
   grid item min-width:auto 陷阱一旦回退，固定格网格会把分栏撑破工作区、横滑块测不到溢出永不显示。 */
.ssp-cards--split {
  grid-template-columns: 1fr 1fr;
}

.ssp--single .ssp-cards--split .ssp-card--side {
  border-left: 1px solid var(--morandi-border, #e5ddd0);
}

@media (max-width: 640px) {
  /* 小屏兜底：上下堆叠（副卡在下·分隔线换水平） */
  .ssp-cards--split {
    grid-template-columns: 1fr;
  }

  .ssp--single .ssp-cards--split .ssp-card--side {
    border-left: 0;
    border-top: 1px solid var(--morandi-border, #e5ddd0);
  }
}

/* ── 五积木语义色（tint 单点·与 statusSystemPresets 五积木对应）──
   character 绿 / organization 青 / building 棕 / region 雾蓝 / item 雾玫瑰 / 自定义 kind 灰 */
.ssp-tint-char { background: rgba(92, 138, 92, 0.13); color: var(--morandi-accent, #5c8a5c); }
.ssp-tint-org { background: rgba(79, 134, 124, 0.13); color: var(--langhuan-dialog-primary-bg, #4f867c); }
.ssp-tint-bld { background: rgba(139, 115, 85, 0.13); color: var(--morandi-accent-brown, #8b7355); }
.ssp-tint-reg { background: rgba(111, 136, 163, 0.14); color: #6f88a3; }
.ssp-tint-item { background: rgba(160, 107, 125, 0.13); color: #a06b7d; }
.ssp-tint-any { background: rgba(138, 131, 120, 0.12); color: var(--morandi-text-light, #8a8378); }

.ssp-tabs {
  display: flex;
  gap: 22px;
  padding: 7px 22px 0;
  border-bottom: 1px solid var(--morandi-border, #e5e5e5);
}

.ssp-tab {
  padding: 6px 2px 9px;
  border: none;
  background: transparent;
  font-size: 0.92rem;
  color: var(--morandi-text-light, #8a8378);
  cursor: pointer;
}

.ssp-tab--on {
  color: var(--morandi-text, #4f463f);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--morandi-accent, #5c8a5c);
}

.ssp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ssp-toolbar--tpl {
  margin-top: 6px;
}

.ssp-sect {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-sect--inline {
  letter-spacing: 0.03em;
}

.ssp-hint {
  font-size: 0.8rem;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.ssp-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ssp-add-btn--small {
  height: 26px;
  font-size: 0.78rem;
}

.ssp-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.86rem;
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

.ssp-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.ssp-cards--single {
  grid-template-columns: 1fr;
}

/* ── 快速定位搜索框 ── */
.ssp-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 9px;
  background: var(--langhuan-paper-bg, #faf7f1);
}

.ssp-search:focus-within {
  border-color: var(--morandi-accent, #5c8a5c);
}

.ssp-search-ico {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 0.85rem;
  color: var(--morandi-text, #4f463f);
}

.ssp-search-input:focus {
  outline: none;
}

.ssp-search-clear {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--morandi-text-light, #9a9287);
  font-size: 14px;
  cursor: pointer;
}

.ssp-search-clear:hover {
  background: rgba(139, 115, 85, 0.1);
  color: var(--morandi-text, #4f463f);
}

/* ── 首页：按分类分区的小图标目录 ── */
.ssp-list {
  display: flex;
  flex-direction: column;
}

.ssp-group {
  padding: 10px 0 18px;
}

.ssp-group + .ssp-group {
  border-top: 1px solid var(--morandi-border, #e5e5e5);
}

.ssp-group__head {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 9px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.82rem;
  font-weight: 700;
}

.ssp-group__head small {
  color: var(--morandi-text-light, #9a9287);
  font-size: 0.7rem;
  font-weight: 500;
}

.ssp-group__items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 5px 14px;
}

.ssp-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 2px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.ssp-row:hover,
.ssp-row:focus-within {
  border-color: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 24%, transparent);
  background: color-mix(in srgb, var(--morandi-accent, #5c8a5c) 8%, transparent);
}

.ssp-row-open {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px 5px 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.ssp-row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ssp-row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ssp-row-name {
  min-width: 0;
  font-weight: 600;
  font-size: 0.84rem;
  color: var(--morandi-text, #4f463f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssp-row-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--morandi-accent-brown, #8b7355);
}

.ssp-row-sub {
  font-size: 0.74rem;
  color: var(--morandi-text-light, #9a9287);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssp-row-chev {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  color: var(--morandi-text-light, #b3a89b);
}

.ssp-row-del {
  flex: 0 0 auto;
  align-self: center;
  width: 26px;
  height: 26px;
  margin-right: 3px;
  opacity: 0;
}

.ssp-row:hover .ssp-row-del,
.ssp-row:focus-within .ssp-row-del {
  opacity: 1;
}

.ssp-empty--nomatch {
  padding: 20px 0;
}

/* 积木色块 icon 瓦片（模拟经营感的语义锚点） */
.ssp-ctile {
  flex: 0 0 auto;
  width: 25px;
  height: 25px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ssp-ctile .line-icon {
  width: 14px;
  height: 14px;
}

.ssp-preview {
  position: fixed;
  z-index: 13120;
  display: flex;
  flex-direction: column;
  min-height: 160px;
  overflow: hidden;
  border: 1px solid var(--morandi-border, #ddd8cf);
  border-radius: 10px;
  background: var(--langhuan-dialog-surface, var(--morandi-card, #f8f6f1));
  box-shadow: 0 18px 44px rgba(46, 39, 34, 0.16);
  animation: lh-fade var(--lh-dur, 0.18s) ease;
}

.ssp-preview__meta {
  flex: 0 0 auto;
  padding: 9px 12px 7px;
  border-bottom: 1px solid var(--morandi-border, #e5e5e5);
  color: var(--morandi-text-light, #8a8378);
  font-size: 0.72rem;
}

.ssp-preview pre {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--morandi-text, #4f463f);
  font: 0.78rem/1.65 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, #7f7f4d 48%, transparent) transparent;
}

@media (prefers-reduced-motion: reduce) {
  .ssp-overlay,
  .ssp-dialog,
  .ssp-preview { animation: none; }
}

.ssp-ctile--sm {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.ssp-ctile--sm .line-icon {
  width: 15px;
  height: 15px;
}

.ssp-ctile--xs {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}

.ssp-ctile--xs .line-icon {
  width: 13px;
  height: 13px;
}

.ssp-kind {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 9px;
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

/* 批3：会话级旧状态栏一键并入世界提示条（琥珀引导态，与舆图弹窗世界引导同语义） */
.ssp-merge-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 10px 2px;
  padding: 8px 11px;
  border: 1px solid rgba(217, 160, 91, 0.32);
  border-radius: 10px;
  background: rgba(217, 160, 91, 0.12);
}

.ssp-merge-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #9a6b2f;
}

.ssp-merge-btn {
  flex: 0 0 auto;
  padding: 5px 11px;
  border: 0;
  border-radius: 8px;
  background: #D9A05B;
  color: #FFFDF8;
  font-size: 0.78rem;
  cursor: pointer;
  transition: opacity 0.14s ease;
}

.ssp-merge-btn:hover {
  opacity: 0.9;
}

.ssp-merge-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.ssp-empty {
  padding: 26px 0;
  text-align: center;
  color: var(--morandi-text-light, #9a9287);
  font-size: 0.86rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ssp-empty-cta {
  height: 28px;
  font-size: 0.8rem;
}

/* ── 内置模板画廊 ── */
.ssp-presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.ssp-preset {
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 12px;
  background: var(--langhuan-paper-bg, #fffdf8);
  padding: 11px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ssp-preset-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.ssp-preset-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ssp-preset-name {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--morandi-text, #4f463f);
}

.ssp-preset-meta {
  font-size: 0.72rem;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-preset-desc {
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--morandi-text-light, #7b746b);
  flex: 1 1 auto;
}

.ssp-preset-foot {
  display: flex;
  align-items: center;
}

.ssp-preset-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--morandi-border, #e0e0e0);
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text, #4f463f);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.ssp-preset-add:hover {
  border-color: var(--morandi-accent, #5c8a5c);
  color: var(--morandi-accent, #5c8a5c);
}

.ssp-preset-add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ssp-preset-done {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--morandi-accent, #5c8a5c);
}

.ssp-preset-done .line-icon {
  width: 13px;
  height: 13px;
}

.ssp-tpl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 4px;
  border-top: 1px solid rgba(229, 229, 229, 0.8);
}

.ssp-tpl-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--morandi-text, #4f463f);
}

.ssp-tpl-meta {
  flex: 1 1 auto;
  font-size: 0.78rem;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-form {
  border-top: 1px solid var(--morandi-border, #e5e5e5);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ssp-form-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--morandi-text, #4f463f);
}

.ssp-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ssp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.ssp-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--morandi-text-light, #7b746b);
}

/* 输入原语（浮层字段编辑器 + 新建状态栏/模板表单共用）——⚠️联动：StatusPanelCard 也有一份 .ssp-input，统一改两处同步 */
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

/* select 去原生感：藏系统箭头、右侧自绘 chevron（用户 2026-07-10：不要最原始的浏览器控件样子） */
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

.ssp-field-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.ssp-frow {
  display: grid;
  grid-template-columns: 1.05fr 1.05fr 0.7fr 0.85fr 1.35fr 28px;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.ssp-frow--head {
  font-size: 0.72rem;
  color: var(--morandi-text-light, #9a9287);
}

.ssp-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ── 自定义字段/值格菜单（langhuan-menu token 骨架：尖角/轻阴影/图标左置/hover 底色）──
   联动标注：骨架与 ChatMessageStream .message-note-selection-menu 同源，若统一改菜单体系两处同步。 */
.ssp-menu {
  position: fixed;
  z-index: 13150;
  min-width: 158px;
  padding: 4px;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--morandi-border, #e0e0e0) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--langhuan-paper-bg, #fffdf8);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  white-space: nowrap;
}

/* 菜单项=浮层直接子级 button（编辑器态的表单按钮包在 .ssp-menu-form 里，不吃这套） */
.ssp-menu > button {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--langhuan-menu-radius, 0);
  background: transparent;
  color: var(--morandi-text, #4f463f);
  font-size: 12px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
}

.ssp-menu > button:hover:not(:disabled),
.ssp-menu > button:focus-visible {
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 34%, transparent);
}

.ssp-menu > button:disabled {
  opacity: 0.45;
  cursor: default;
}

.ssp-menu .line-icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.ssp-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: color-mix(in srgb, var(--morandi-border, #e0e0e0) 55%, transparent);
}

.ssp-menu .ssp-menu-danger {
  color: #a06b7d;
}

/* 浮层编辑器态（menu 原地变身字段设置面板·仿飞书）：宽度放开、恢复正常换行 */
.ssp-menu--editor {
  min-width: 252px;
  max-width: 312px;
  padding: 12px;
  white-space: normal;
}

.ssp-menu-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ssp-hint--flat {
  font-size: 0.76rem;
  line-height: 1.45;
}

/* 浮层编辑器的删除字段（危险态·靠左与取消/保存分离） */
.ssp-btn--danger {
  margin-right: auto;
  border-color: rgba(160, 107, 125, 0.55);
  background: rgba(160, 107, 125, 0.1);
  color: #a06b7d;
}

@media (max-width: 900px) {
  .ssp-overlay { padding: 0; }
  .ssp-dialog {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }
  .ssp-body { padding: 14px 16px 20px; }
  .ssp-group__items { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}

@media (max-width: 640px) {
  .ssp-dialog__head { padding-left: 12px; }
  .ssp-tabs { padding-left: 14px; padding-right: 14px; }
  .ssp-body { padding: 12px 14px 18px; }
  .ssp-group__items { grid-template-columns: 1fr 1fr; gap: 4px 8px; }
  .ssp-row-name { font-size: 0.8rem; }
  .ssp-row-del { opacity: 1; }

  .ssp-form-grid {
    grid-template-columns: 1fr;
  }

  .ssp-frow {
    grid-template-columns: 1fr 1fr;
  }

  .ssp-cards {
    grid-template-columns: 1fr;
  }

  .ssp-presets {
    grid-template-columns: 1fr;
  }
}
</style>
