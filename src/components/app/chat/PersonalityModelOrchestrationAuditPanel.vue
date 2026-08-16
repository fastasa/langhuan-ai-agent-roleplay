<template>
  <section class="orchestration-audit" :aria-label="t('diagnostics.orchestrationAudit.title')">
    <!-- 头部：标题 + 复制摘要 + 收起 -->
    <div class="aud-head">
      <div class="aud-head-top">
        <span class="aud-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          {{ t('diagnostics.orchestrationAudit.title') }}
        </span>
        <div class="aud-head-actions">
          <button
            type="button"
            class="aud-ibtn"
            :class="{ copied }"
            :disabled="!activeRecord"
            :title="t('diagnostics.orchestrationAudit.copySummary')"
            :aria-label="t('diagnostics.orchestrationAudit.copySummary')"
            @click="copySummary"
          >
            <svg v-if="copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </button>
          <button type="button" class="aud-ibtn" :title="t('diagnostics.orchestrationAudit.collapseSidebar')" :aria-label="t('diagnostics.orchestrationAudit.collapseSidebar')" @click="$emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /><path d="m8 9 3 3-3 3" /></svg>
          </button>
        </div>
      </div>
      <div v-if="activeRecord" class="aud-msgline">
        <span class="nm">{{ activeRecord.character }}</span>
        <span class="dot">·</span>
        <span>{{ activeRecord.time }}</span>
        <template v-if="stateMeta">
          <span class="dot">·</span>
          <span class="statepill" :class="stateMeta.cls"><span class="d"></span>{{ t(stateMeta.labelKey) }}</span>
        </template>
      </div>
    </div>

    <!-- 错误 -->
    <div v-if="errorText" class="aud-empty">
      <div class="eico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      </div>
      <div class="et">{{ t('diagnostics.orchestrationAudit.readFailed') }}</div>
      <div class="es">{{ errorText }}</div>
    </div>

    <!-- 加载 -->
    <div v-else-if="status === 'loading'" class="aud-skeleton">
      <div class="sk sk-line" style="width:52%;height:14px"></div>
      <div class="sk sk-line" style="width:90%"></div>
      <div class="sk sk-line" style="width:74%"></div>
      <div class="sk" style="height:96px;margin-top:14px;margin-bottom:18px"></div>
      <div class="sk sk-line" style="width:40%;height:13px"></div>
      <div class="sk sk-line" style="width:100%"></div>
      <div class="sk sk-line" style="width:100%"></div>
      <div class="sk sk-line" style="width:66%"></div>
    </div>

    <!-- 无编排记录（选中的消息没有编排证据） -->
    <div v-else-if="status === 'none'" class="aud-empty">
      <div class="eico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
      </div>
      <div class="et">{{ t('diagnostics.orchestrationAudit.noRecordTitle') }}</div>
      <div class="es">{{ t('diagnostics.orchestrationAudit.noRecordDesc') }}</div>
    </div>

    <!-- 默认（未选中）：session 级编排记录列表 -->
    <div v-else-if="status === 'empty'" class="aud-list-wrap">
      <div v-if="!records.length" class="aud-empty">
        <div class="eico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9a3 3 0 1 1 4 2.83V13" /><path d="M12 17h.01" /><path d="m9 11 1.5 1.5" /></svg>
        </div>
        <div class="et">{{ t('diagnostics.orchestrationAudit.sessionEmptyTitle') }}</div>
        <div class="es">{{ t('diagnostics.orchestrationAudit.sessionEmptyDesc') }}</div>
      </div>
      <template v-else>
        <div class="aud-list-head">{{ t('diagnostics.orchestrationAudit.sessionListHead', { count: records.length }) }}</div>
        <button
          v-for="rec in records"
          :key="rec.id"
          type="button"
          class="aud-list-item"
          @click="selectRecordId(rec.id)"
        >
          <span class="li-main">
            <span class="li-nm">{{ rec.character }}</span>
            <span class="li-tm">{{ rec.time }}</span>
          </span>
          <span class="li-meta">
            <span class="kbd">{{ rec.scenario }}</span>
            <span class="statepill" :class="STATE_META[rec.state].cls"><span class="d"></span>{{ t(STATE_META[rec.state].labelKey) }}</span>
          </span>
        </button>
      </template>
    </div>

    <!-- ready：详情（可折叠分区） -->
    <template v-else-if="status === 'ready' && activeRecord">
      <div v-if="isStale" class="replaced-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>
        <div>
          <div class="rb-t">{{ t('diagnostics.orchestrationAudit.staleTitle') }}</div>
          <div class="rb-s">{{ t('diagnostics.orchestrationAudit.staleDesc') }}</div>
        </div>
      </div>

      <div class="aud-scroll" :class="{ 'aud-stale': isStale }">
        <!-- 1 · 编排器输出 -->
        <div class="sec">
          <button class="sec-h2" :class="{ open: sectionOpen.plan }" @click="sectionOpen.plan = !sectionOpen.plan">
            <svg class="sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            <span class="sec-t">{{ t('diagnostics.orchestrationAudit.secOrchestratorOutput') }}</span>
            <span v-if="activeRecord.failure" class="sec-hint">{{ t('diagnostics.orchestrationAudit.secAbnormal') }}</span>
          </button>
          <div v-if="sectionOpen.plan" class="sec-body">
            <div class="po">
              <div class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poScenario') }}</span>
                <span class="po-v"><span class="kbd">{{ activeRecord.scenario || '—' }}</span> <b>{{ activeRecord.scenarioLabel }}</b>
                  <div v-if="scenarioNote" class="po-note">{{ scenarioNote }}</div>
                </span>
              </div>
              <div class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poReadPrompts') }}</span>
                <span class="po-v">
                  <div class="po-reads">
                    <span v-for="(p, i) in readPrompts" :key="`read_${i}`" class="po-read">{{ p.label }}<span class="s">{{ p.sub }}</span></span>
                  </div>
                </span>
              </div>
              <div v-if="activeRecord.narrationSkillReads.length" class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poNarrationRead') }}</span>
                <span class="po-v">
                  <div class="po-reads">
                    <span
                      v-for="item in activeRecord.narrationSkillReads"
                      :key="`narration_read_${item.profileId}_${item.source}`"
                      class="po-read po-read--narration"
                    >
                      {{ item.profileName }}<span class="s">{{ item.sub }}</span>
                    </span>
                  </div>
                </span>
              </div>
              <div class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poToolCalls') }}</span>
                <span class="po-v"><b>{{ activeRecord.toolCalls.length }}</b> {{ t('diagnostics.orchestrationAudit.timesUnit') }}<span class="po-dim"> · {{ t('diagnostics.orchestrationAudit.budgetInfo', { used: activeRecord.budget.used, max: activeRecord.budget.max, state: budgetLabel(activeRecord.budget.state) }) }}</span>
                  <div v-for="m in modelCalls" :key="m.tool" class="po-call">
                    <span class="mono">{{ m.tool }}</span><span class="po-x">×{{ m.count }}</span>
                    <span class="po-per">{{ m.per }}</span>
                  </div>
                </span>
              </div>
              <div class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poCandidates') }}</span>
                <span class="po-v"><b>{{ activeRecord.candidates.length }}</b> {{ t('diagnostics.orchestrationAudit.itemsUnit') }}<span class="po-dim"> · {{ reviewedTotal === activeRecord.candidates.length ? t('diagnostics.orchestrationAudit.reviewedAll') : t('diagnostics.orchestrationAudit.reviewedPartial', { count: reviewedTotal }) }}</span></span>
              </div>
              <div class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poFinalSelected') }}</span>
                <span class="po-v">
                  <div v-if="selectedCandidates.length" class="po-sel">
                    <div class="po-selhead"><span class="po-star">★</span>{{ t('diagnostics.orchestrationAudit.selectedHead', { count: selectedCandidates.length }) }}</div>
                    <div v-for="c in selectedCandidates" :key="`sel_${c.id}`" class="po-selitem">
                      <span class="po-star">★</span>
                      <span class="po-selcol">
                        <span class="po-selmeta">{{ catLabel(c.cat) }}·{{ intLabel(c.int) }}</span>
                        <span v-if="c.top" class="po-primary">{{ t('diagnostics.orchestrationAudit.primaryPlan') }}</span>
                      </span>
                      <span class="po-selbody">{{ c.body }}</span>
                    </div>
                  </div>
                  <span v-else class="po-dim">{{ t('diagnostics.orchestrationAudit.noneAborted') }}</span>
                </span>
              </div>
              <div v-if="!activeRecord.failure && planPromptCats.length" class="po-row">
                <span class="po-k">{{ t('diagnostics.orchestrationAudit.poPlanPrompts') }}</span>
                <span class="po-v">
                  <div class="po-ppnote">{{ t('diagnostics.orchestrationAudit.planPromptNote') }}</div>
                  <div v-for="c in planPromptCats" :key="`pp_${c.key}`" class="po-ppitem">
                    <span class="po-ppcat">{{ c.label }}</span>
                    <span class="po-ppbody">{{ activeRecord.planPromptDigest[c.key] }}</span>
                  </div>
                </span>
              </div>

              <!-- 失败中止 -->
              <div v-if="activeRecord.failure" class="po-abort">
                <div class="po-abort-head">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {{ t('diagnostics.orchestrationAudit.abortStage', { stage: activeRecord.failure.stage || t('diagnostics.orchestrationAudit.unknown') }) }}
                </div>
                <div v-if="activeRecord.failure.reason" class="po-abort-reason">{{ activeRecord.failure.reason }}</div>
                <div v-if="activeRecord.failure.detail" class="po-abort-detail">{{ activeRecord.failure.detail }}</div>
                <div v-if="activeRecord.failure.impact" class="po-abort-detail">{{ t('diagnostics.orchestrationAudit.impactPrefix', { impact: activeRecord.failure.impact }) }}</div>
                <div v-if="activeRecord.failure.chain.length" class="po-abort-chain">
                  <template v-for="(s, i) in activeRecord.failure.chain" :key="`chain_${i}`">
                    <span v-if="i > 0" class="po-abort-arrow">›</span>
                    <span class="po-abort-step" :class="chainStepClass(s)">{{ s }}</span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2 · 前三计划 + 表达占比（评审选出前三，编排器产出占比，直接驱动最终回复） -->
        <div class="sec">
          <button class="sec-h2" :class="{ open: sectionOpen.finalPlan }" @click="sectionOpen.finalPlan = !sectionOpen.finalPlan">
            <svg class="sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            <span class="sec-t">{{ t('diagnostics.orchestrationAudit.secTopPlans') }}</span>
            <span class="sec-hint">{{ expressionMixSectionHint(activeRecord) }}</span>
          </button>
          <div v-if="sectionOpen.finalPlan" class="sec-body">
            <div v-if="finalTopPlans.length || activeRecord.expressionMix.length" class="syn">
              <div v-if="finalTopPlans.length" class="syn-top">
                <div v-for="(plan, i) in finalTopPlans" :key="plan.id || i" class="syn-top-row">
                  <span class="syn-top-rank">{{ i + 1 }}</span>
                  <span class="kbd">{{ plan.id || '—' }}</span>
                  <span v-if="plan.score !== null" class="syn-top-score">{{ plan.score }}</span>
                  <p class="syn-top-body">{{ plan.body }}</p>
                </div>
              </div>
              <div v-if="activeRecord.expressionMix.length" class="syn-mix" :aria-label="t('diagnostics.observation.roundExpressionRatioAria')">
                <div v-for="item in activeRecord.expressionMix" :key="item.key" class="syn-mix-row">
                  <span>{{ item.label }}</span>
                  <div class="syn-mix-track"><i :style="{ width: `${item.value}%` }"></i></div>
                  <b>{{ item.value }}%</b>
                </div>
              </div>
              <div v-if="activeRecord.wordCountAdvice" class="syn-wordcount" :aria-label="t('diagnostics.orchestrationAudit.wordCountLabel')">
                <span>{{ t('diagnostics.orchestrationAudit.wordCountLabel') }}</span>
                <b>{{ activeRecord.wordCountAdvice }}</b>
              </div>
            </div>
            <div v-else class="cp-empty">{{ t('diagnostics.orchestrationAudit.topPlansEmpty') }}</div>
          </div>
        </div>

        <!-- 3 · 运行时轨迹（紧凑展示关键 tool / hook / next-turn 信息） -->
        <div v-if="activeRecord.runtimeTrace.length || activeRecord.turns.length" class="sec">
          <button class="sec-h2" :class="{ open: sectionOpen.turns }" @click="sectionOpen.turns = !sectionOpen.turns">
            <svg class="sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            <span class="sec-t">{{ t('diagnostics.orchestrationAudit.secRuntimeTrace') }}</span>
            <span class="sec-hint">{{ t('diagnostics.orchestrationAudit.runtimeTraceHint', { count: activeRecord.runtimeTrace.length || activeRecord.turns.length }) }}</span>
          </button>
          <div v-if="sectionOpen.turns" class="sec-body">
            <div v-if="activeRecord.runtimeTrace.length" class="rt-list">
              <div v-for="turn in activeRecord.runtimeTrace" :key="`rt_${turn.index}`" class="rt-row" :class="{ warn: turn.hasIssue, open: isTraceTurnOpen(turn.index) }">
                <!-- 整行可点击展开：看本轮决策全文 + 工具调用全参/全结果，不用省略号硬截断（用户 2026-06-20） -->
                <div class="rt-line" :class="{ clickable: turn.detailTools.length || turn.detailHooks.length }" @click="(turn.detailTools.length || turn.detailHooks.length) && toggleTraceTurn(turn.index)">
                  <span class="rt-ix">#{{ turn.index + 1 }}</span>
                  <span class="rt-stage">{{ turn.stageLabel }}</span>
                  <span v-if="turn.thought" class="rt-thought" :class="{ full: isTraceTurnOpen(turn.index) }" :title="turn.thought">{{ turn.thought }}</span>
                  <span v-if="turn.detailTools.length || turn.detailHooks.length" class="rt-toggle">{{ isTraceTurnOpen(turn.index) ? t('common.collapse') : t('common.expand') }}</span>
                </div>
                <!-- 折叠态：紧凑 chip 概览（保留原样） -->
                <div v-if="!isTraceTurnOpen(turn.index)" class="rt-chips">
                  <span v-if="turn.activeToolsText" class="rt-chip muted">{{ t('diagnostics.orchestrationAudit.availablePrefix', { text: turn.activeToolsText }) }}</span>
                  <span v-for="tool in turn.tools" :key="`rt_${turn.index}_${tool.key}`" class="rt-chip" :class="tool.cls" :title="tool.title">
                    {{ tool.label }}
                  </span>
                  <span v-for="hook in turn.hooks" :key="`rt_${turn.index}_${hook.key}`" class="rt-chip hook" :title="hook.title">
                    {{ hook.label }}
                  </span>
                  <span v-if="turn.nextText" class="rt-chip next">{{ turn.nextText }}</span>
                  <span v-if="turn.moreCount" class="rt-more">{{ t('diagnostics.orchestrationAudit.moreHint', { count: turn.moreCount }) }}</span>
                </div>
                <!-- 展开态：本轮全部工具调用全参/全结果 + 全部 hook，全文不截断 -->
                <div v-else class="rt-detail">
                  <div v-if="turn.activeToolsText" class="rt-detail-line"><span class="rt-detail-k">{{ t('diagnostics.orchestrationAudit.availableTools') }}</span><span class="rt-detail-v">{{ turn.activeToolsText }}</span></div>
                  <div v-for="tool in turn.detailTools" :key="`dt_${turn.index}_${tool.key}`" class="rt-detail-tool" :class="tool.cls">
                    <div class="rt-detail-tool-h"><span class="rt-detail-name">{{ tool.name }}</span><span class="rt-detail-status">{{ tool.status }}</span></div>
                    <div v-if="tool.args" class="rt-detail-block"><span class="rt-detail-k">{{ t('diagnostics.orchestrationAudit.argsLabel') }}</span><pre class="rt-detail-pre">{{ tool.args }}</pre></div>
                    <div v-if="tool.result" class="rt-detail-block"><span class="rt-detail-k">{{ t('diagnostics.orchestrationAudit.resultLabel') }}</span><pre class="rt-detail-pre">{{ tool.result }}</pre></div>
                  </div>
                  <div v-for="hook in turn.detailHooks" :key="`dh_${turn.index}_${hook.key}`" class="rt-detail-hook">
                    <span class="rt-detail-name">hook · {{ hook.lifecycle || hook.summary }}</span>
                    <span v-if="hook.summary && hook.lifecycle" class="rt-detail-v">{{ hook.summary }}</span>
                    <span v-if="hook.effects" class="rt-detail-eff">{{ hook.effects }}</span>
                  </div>
                  <div v-if="turn.nextText" class="rt-detail-line"><span class="rt-detail-k">{{ t('common.next') }}</span><span class="rt-detail-v">{{ turn.nextText }}</span></div>
                </div>
              </div>
            </div>
            <div v-else class="trace-list">
              <div v-for="turn in activeRecord.turns" :key="`turn_${turn.index}`" class="trace-turn">
                <div class="trace-turn-h">
                  <span class="trace-turn-ix">{{ t('diagnostics.orchestrationAudit.turnIndex', { index: turn.index + 1 }) }}</span>
                  <span v-if="turn.scenario" class="kbd">{{ turn.scenario }}</span>
                  <span v-if="turn.thought" class="trace-turn-thought" :title="turn.thought">{{ turn.thought }}</span>
                </div>
                <div v-if="turn.calls.length" class="trace-calls">
                  <div
                    v-for="(call, ci) in turn.calls"
                    :key="`turn_${turn.index}_call_${ci}`"
                    class="trace-call"
                    :class="{ err: call.isError && !call.blocked, blk: call.blocked }"
                  >
                    <div class="trace-call-top">
                      <span class="trace-call-name">{{ call.tool }}</span>
                      <span class="trace-call-kind" :class="{ meta: call.kind === 'meta' }">{{ call.kind === 'meta' ? t('diagnostics.orchestrationAudit.metaTool') : t('diagnostics.orchestrationAudit.tool') }}</span>
                      <span v-if="call.blocked" class="trace-call-flag">{{ t('diagnostics.orchestrationAudit.blocked') }}</span>
                      <span v-else-if="call.isError" class="trace-call-flag">{{ t('diagnostics.orchestrationAudit.failed') }}</span>
                    </div>
                    <!-- 旧版轨迹兜底：结果全文显示，不用省略号截断（用户 2026-06-20） -->
                    <div v-if="call.resultText" class="trace-call-res">{{ call.resultText }}</div>
                  </div>
                </div>
                <div v-else class="trace-empty">{{ t('diagnostics.orchestrationAudit.emptyTurn') }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4 · 提示词树（本地可编辑） -->
        <div class="sec">
          <button class="sec-h2" :class="{ open: sectionOpen.prompt }" @click="sectionOpen.prompt = !sectionOpen.prompt">
            <svg class="sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            <span class="sec-t">{{ t('diagnostics.orchestrationAudit.secPromptTree') }}</span>
            <span class="sec-hint">{{ promptTreeHint }}</span>
          </button>
          <div v-if="sectionOpen.prompt" class="sec-body">
            <!-- 本地工作区直接开放提示词树编辑、增删与保存。 -->
            <OrchestratorPromptTreeEditor
              :active-scenario-code="activeRecord?.scenario || ''"
              :used-tool-names="toolUsedNames"
            />
          </div>
        </div>

        <!-- 4 · 可调用工具 -->
        <div class="sec">
          <button class="sec-h2" :class="{ open: sectionOpen.tools }" @click="sectionOpen.tools = !sectionOpen.tools">
            <svg class="sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            <span class="sec-t">{{ t('diagnostics.orchestrationAudit.secCallableTools') }}</span>
            <span class="sec-hint">{{ toolHint }}</span>
          </button>
          <div v-if="sectionOpen.tools" class="sec-body">
            <div class="tlst">
              <div v-for="tool in toolCatalog" :key="tool.name" class="tlrow" :class="{ used: tool.used }">
                <div class="tl-top">
                  <span class="tl-name mono">{{ tool.name }}</span>
                  <span v-if="tool.used" class="tl-used"><span class="d"></span>{{ t('diagnostics.orchestrationAudit.toolUsedCount', { count: tool.calls }) }}</span>
                  <span v-else class="tl-idle">{{ t('diagnostics.orchestrationAudit.toolIdle') }}</span>
                </div>
                <div class="tl-desc">{{ tool.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchChatPersonalityModelObservationsBySessionId,
  type ChatGenerationAttemptArtifactEntry,
  type ChatPersonalityModelObservationPage
} from '../../../repositories/chatRepository'
import {
  REPLY_PLAN_ORCHESTRATOR_ALLOWED_TOOLS,
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_BUDGET,
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG,
  parseReplyPlanWordCountAdvice,
  resolveReplyPlanOrchestrationScenarioCode,
  type ReplyPlanOrchestratorConfig
} from '../../../app/personalityPlanOrchestrator'
import { fetchOrchestratorConfig } from '../../../repositories/orchestratorConfigRepository'
import OrchestratorPromptTreeEditor from '../../common/OrchestratorPromptTreeEditor.vue'

const props = defineProps<{
  sessionId: string
  /** 由调用方（聊天区入口）传入：要直接展开的某条角色消息 id；空 = 显示 session 级列表 */
  selectedMessageId?: number | string | null
  /** 批次I·编排入口：提调导演 loop 期的运行态编排 payload（含 orchestration/topPlans/expressionMix）。
   *  有值时按运行态直接渲染（loop 期消息未落库、无 messageId），优先于 selectedMessageId 持久化路径。 */
  runtimeOrchestration?: Record<string, any> | null
}>()

defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()

type AuditState = 'success' | 'partial' | 'failed' | 'retried'

// STATE_META：cls 是 CSS 类保留，label 改 labelKey（模块级 const 用不了 t()），渲染时 t() 填充
const STATE_META: Record<AuditState, { cls: string; labelKey: string }> = {
  success: { cls: 's-success', labelKey: 'diagnostics.orchestrationAudit.stateSuccess' },
  partial: { cls: 's-partial', labelKey: 'diagnostics.orchestrationAudit.statePartial' },
  failed: { cls: 's-failed', labelKey: 'diagnostics.orchestrationAudit.stateFailed' },
  retried: { cls: 's-retried', labelKey: 'diagnostics.orchestrationAudit.stateRetried' }
}

const ALLOWED_TOOLS = [...REPLY_PLAN_ORCHESTRATOR_ALLOWED_TOOLS]
// key 是工具名（数据）保留，值改 i18n key（在 toolCatalog 里 t() 填充）
const TOOL_DESCRIPTION_KEYS: Record<string, string> = {
  generatePlanBatch: 'diagnostics.orchestrationAudit.descGenerate',
  reviewPlanCandidates: 'diagnostics.orchestrationAudit.descReview'
}
const INTENSITY_ORDER = ['low', 'medium', 'mid', 'high', 'very_high']
// key 是强度数据值保留，值改 i18n key（intLabel 里 t() 填充）
const INTENSITY_LABEL_KEYS: Record<string, string> = {
  low: 'diagnostics.orchestrationAudit.intLow',
  medium: 'diagnostics.orchestrationAudit.intMedium',
  mid: 'diagnostics.orchestrationAudit.intMedium',
  high: 'diagnostics.orchestrationAudit.intHigh',
  very_high: 'diagnostics.orchestrationAudit.intVeryHigh'
}
// key 是情境数据值保留，值改 i18n key（scenarioLabel 里 t() 填充）
const SCENARIO_LABEL_KEYS: Record<string, string> = {
  pressure: 'diagnostics.orchestrationAudit.scenarioPressure',
  joy: 'diagnostics.orchestrationAudit.scenarioJoy',
  custom: 'diagnostics.orchestrationAudit.scenarioCustom'
}
function scenarioLabelText(code: string): string {
  const key = SCENARIO_LABEL_KEYS[code]
  return key ? t(key) : (code || '—')
}

type AuditCandidate = {
  id: string; cat: string; int: string; src: string
  review: boolean; score: number | null; rank: number | null
  top: boolean; selected: boolean; body: string; dropped?: string
}

type AuditToolCall = {
  id: string; name: string; status: 'ok' | 'error'; durationMs: number | null
  promptLogId?: string; argSummary: string; args: Record<string, any>
  resultSummary?: string; error?: string
}

// 多轮 loop 轨迹：每轮模型意图 + 本轮各工具调用与结果（含元工具）
type AuditTurnCall = { tool: string; kind: 'plan' | 'meta'; resultText: string; isError: boolean; blocked: boolean }
type AuditTurn = { index: number; thought: string; scenario: string; calls: AuditTurnCall[] }

type AuditRuntimeChip = { key: string; label: string; title: string; cls?: string }
// 展开态全文条目：工具调用（名/状态/全参/全结果）与 hook（生命周期/摘要/效果）都不截断。
type AuditRuntimeToolDetail = { key: string; name: string; status: string; args: string; result: string; cls?: string }
type AuditRuntimeHookDetail = { key: string; lifecycle: string; summary: string; effects: string }
type AuditRuntimeTraceTurn = {
  index: number
  stageLabel: string
  thought: string
  activeToolsText: string
  tools: AuditRuntimeChip[]
  hooks: AuditRuntimeChip[]
  nextText: string
  moreCount: number
  hasIssue: boolean
  // 点击展开后渲染的全文明细（不 slice、不省略号）。
  detailTools: AuditRuntimeToolDetail[]
  detailHooks: AuditRuntimeHookDetail[]
}

type AuditExpressionMixItem = { key: string; label: string; value: number }
type AuditNarrationSkillRead = { profileId: string; profileName: string; source: string; sub: string }

type AuditRecord = {
  id: string
  state: AuditState
  character: string
  time: string
  scenario: string
  scenarioLabel: string
  categories: Array<{ key: string; label: string }>
  intensities: Array<{ key: string; label: string }>
  toolCallSummary: { generate: number; review: number }
  budget: { state: 'ok' | 'over' | 'stopped'; used: number; max: number; concurrency: number | null; concurrencyMax: number | null }
  orchestrationSummary: string
  toolCalls: AuditToolCall[]
  candidates: AuditCandidate[]
  failure: { stage: string; reason: string; detail: string; impact: string; chain: string[] } | null
  planPromptDigest: Record<string, string>
  runtimeTrace: AuditRuntimeTraceTurn[]
  turns: AuditTurn[]
  narrationSkillReads: AuditNarrationSkillRead[]
  /** 表达占比唯一真值：编排器生成轮产出（批次2 前移、批次4 去融合后直接驱动最终回复）。 */
  expressionMix: AuditExpressionMixItem[]
  /** 建议字数（编排器生成轮产出，与表达占比并排）：展示文案，缺失为空串。 */
  wordCountAdvice: string
}

const META_TOOL_NAMES = new Set(['readScenarioSkill', 'getToolManual'])
// key 是表达占比维度（数据）保留，labelKey 复用 observation.dim*（避免同词多译），readExpressionMix 里 t() 填充
const EXPRESSION_MIX_LABELS: Array<{ key: string; labelKey: string }> = [
  { key: 'action', labelKey: 'diagnostics.observation.dimAction' },
  { key: 'dialogue', labelKey: 'diagnostics.observation.dimDialogue' },
  { key: 'expression', labelKey: 'diagnostics.observation.dimExpression' },
  { key: 'innerState', labelKey: 'diagnostics.observation.dimInnerState' },
  { key: 'narration', labelKey: 'diagnostics.observation.dimNarration' }
]

const loading = ref(false)
const errorText = ref('')
const page = ref<ChatPersonalityModelObservationPage>({ sessionId: '', projections: [], visibility: [], attempts: [], traces: [] })
const selectedId = ref<string | null>(null)
const copied = ref(false)

// 分区折叠状态（提示词树默认收起，其余默认展开）
const sectionOpen = reactive({ plan: true, finalPlan: true, turns: true, prompt: false, tools: true })
// 运行时轨迹：哪些轮已点击展开（看本轮工具调用全参/全结果，不省略号截断）。按轮 index 记。
const expandedTraceTurns = ref<Set<number>>(new Set())
function isTraceTurnOpen(index: number): boolean {
  return expandedTraceTurns.value.has(index)
}
function toggleTraceTurn(index: number): void {
  const next = new Set(expandedTraceTurns.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  expandedTraceTurns.value = next
}

const sessionId = computed(() => String(props.sessionId || '').trim())

watch(sessionId, () => { reload() }, { immediate: true })

// 入口传入的消息 id → 选中对应记录（初始选中在 reload() 取数后处理，避免 setup 阶段访问未初始化的 computed）
watch(() => props.selectedMessageId, (value) => {
  syncSelectionFromMessageId(value)
})

async function reload() {
  selectedId.value = null
  if (!sessionId.value) {
    page.value = { sessionId: '', projections: [], visibility: [], attempts: [], traces: [] }
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    page.value = await fetchChatPersonalityModelObservationsBySessionId(sessionId.value)
    syncSelectionFromMessageId(props.selectedMessageId)
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error || t('diagnostics.orchestrationAudit.readFailedError'))
  } finally {
    loading.value = false
  }
}

const records = computed<AuditRecord[]>(() => {
  const traces = page.value.traces || []
  return traces
    .map((trace, index) => buildAuditRecord(trace, index))
    .filter((rec): rec is AuditRecord => Boolean(rec))
})

const recordByMessageId = computed<Map<string, AuditRecord>>(() => {
  const map = new Map<string, AuditRecord>()
  const traces = page.value.traces || []
  traces.forEach((trace, index) => {
    const rec = buildAuditRecord(trace, index)
    if (!rec) return
    const messageId = readMessageId(trace)
    if (messageId) map.set(messageId, rec)
  })
  return map
})

// 批次I·编排入口：运行态编排 payload → 合成一条 AuditRecord（trace.id='runtime'），复用既有 buildAuditRecord 渲染逻辑。
const runtimeRecord = computed<AuditRecord | null>(() => {
  const payload = props.runtimeOrchestration
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const rec = buildAuditRecord({ id: 'runtime', createdAt: '', payload } as unknown as ChatGenerationAttemptArtifactEntry, -1)
  return rec ? { ...rec, id: 'runtime' } : null
})

const activeRecord = computed<AuditRecord | null>(() => {
  // 运行态优先：loop 期编排直渲，不依赖 selectedId / 持久化列表。
  if (runtimeRecord.value) return runtimeRecord.value
  if (!selectedId.value) return null
  return records.value.find((rec) => rec.id === selectedId.value) || null
})

const status = computed<'empty' | 'loading' | 'ready' | 'none'>(() => {
  if (runtimeRecord.value) return 'ready'
  if (loading.value) return 'loading'
  if (selectedId.value === 'none') return 'none'
  if (activeRecord.value) return 'ready'
  return 'empty'
})

const stateMeta = computed(() => (activeRecord.value ? STATE_META[activeRecord.value.state] : null))
const isStale = computed(() => activeRecord.value?.state === 'retried')

const reviewedTotal = computed(() => (activeRecord.value?.candidates.filter((c) => c.review).length) ?? 0)
// 前三计划：评审选中的候选（topPlans 集合），按排名排序（批次4 去融合后直接交最终回复）
const finalTopPlans = computed<AuditCandidate[]>(() => {
  const rec = activeRecord.value
  if (!rec) return []
  return rec.candidates
    .filter((c) => c.selected)
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 3)
})
const selectedCandidates = computed<AuditCandidate[]>(() => {
  const rec = activeRecord.value
  if (!rec) return []
  // 主计划优先，其余按评审排名
  return rec.candidates
    .filter((c) => c.selected)
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
})
const modelCalls = computed(() => {
  const rec = activeRecord.value
  if (!rec) return [] as Array<{ tool: string; count: number; per: string }>
  const calls: Array<{ tool: string; count: number; per: string }> = []
  if (rec.toolCallSummary.generate > 0) calls.push({ tool: 'generatePlanBatch', count: rec.toolCallSummary.generate, per: t('diagnostics.orchestrationAudit.perGenerate') })
  if (rec.toolCallSummary.review > 0) calls.push({ tool: 'reviewPlanCandidates', count: rec.toolCallSummary.review, per: t('diagnostics.orchestrationAudit.perReview') })
  return calls
})

const planPromptCats = computed(() => {
  const rec = activeRecord.value
  if (!rec) return [] as Array<{ key: string; label: string }>
  return rec.categories.filter((c) => (rec.planPromptDigest[c.key] || '').trim())
})

// ========== 提示词树：本地工作区可编辑 ==========
// 审计侧栏只保留只读视图（同组件 :readonly）。这里仍读取一份全局配置，仅供「提示词树 hint /
// 情境判断说明 / 已读取情境标记」等只读计算使用，不再承载任何编辑状态与弹窗。
const orchestratorConfig = ref<ReplyPlanOrchestratorConfig | null>(null)

onMounted(async () => {
  try {
    orchestratorConfig.value = (await fetchOrchestratorConfig()) || DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG
  } catch {
    orchestratorConfig.value = DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG
  }
})

const promptTreeHint = computed(() => {
  const config = orchestratorConfig.value
  if (!config) return t('diagnostics.orchestrationAudit.promptTreeHintLoading')
  return t('diagnostics.orchestrationAudit.promptTreeHint', { count: config.scenarios.length })
})

// 编排器输出「已读取提示词」：每轮固定读 LANGHUAN.md 根宪法 + 总提示词，再加本轮命中的情境
const readPrompts = computed<Array<{ label: string; sub: string }>>(() => {
  const rec = activeRecord.value
  if (!rec) return []
  const list: Array<{ label: string; sub: string }> = [
    { label: 'LANGHUAN.md', sub: t('diagnostics.orchestrationAudit.rootConstitution') },
    { label: t('diagnostics.orchestrationAudit.orchestratorMainPrompt'), sub: t('diagnostics.orchestrationAudit.orchestratorRules') }
  ]
  if (rec.scenario) {
    const dims = rec.categories.length && rec.intensities.length
      ? t('diagnostics.orchestrationAudit.promptDims', { cats: rec.categories.length, intensities: rec.intensities.length })
      : t('diagnostics.orchestrationAudit.promptDimsFallback')
    list.push({ label: `${rec.scenario} ${rec.scenarioLabel}`.trim(), sub: dims })
  }
  return list
})

// 情境判断说明：取本轮命中情境在全局配置里的触发说明
const scenarioNote = computed(() => {
  const rec = activeRecord.value
  const config = orchestratorConfig.value
  if (!rec || !config) return ''
  return config.scenarios.find((s) => s.code === rec.scenario)?.trigger?.trim() || ''
})

const toolCatalog = computed(() => {
  const rec = activeRecord.value
  const summary = rec?.toolCallSummary
  return ALLOWED_TOOLS.map((name) => {
    const calls = name === 'generatePlanBatch' ? (summary?.generate ?? 0) : name === 'reviewPlanCandidates' ? (summary?.review ?? 0) : 0
    const descKey = TOOL_DESCRIPTION_KEYS[name]
    return { name, desc: descKey ? t(descKey) : '', used: calls > 0, calls }
  })
})

const toolHint = computed(() => {
  const used = toolCatalog.value.filter((item) => item.used).length
  return t('diagnostics.orchestrationAudit.toolHint', { total: toolCatalog.value.length, used })
})

// 本轮实际调用过的 plan 工具名（提示词树工具节点标「已调用」圆点）
const toolUsedNames = computed(() => {
  const rec = activeRecord.value
  const names = new Set<string>()
  if (rec?.toolCallSummary.generate) names.add('generatePlanBatch')
  if (rec?.toolCallSummary.review) names.add('reviewPlanCandidates')
  return names
})

// 切换记录时重置分区局部状态（提示词树默认收起，其余默认展开）
watch(activeRecord, () => {
  sectionOpen.plan = true
  sectionOpen.finalPlan = true
  sectionOpen.turns = true
  sectionOpen.prompt = false
  sectionOpen.tools = true
})

function syncSelectionFromMessageId(value: number | string | null | undefined) {
  const key = String(value ?? '').trim()
  if (!key) {
    selectedId.value = null
    return
  }
  const rec = recordByMessageId.value.get(key)
  selectedId.value = rec ? rec.id : 'none'
}

function selectRecordId(id: string) {
  selectedId.value = id
}

function readMessageId(trace: ChatGenerationAttemptArtifactEntry): string {
  const payload = readPayload(trace)
  const raw = (trace as Record<string, any>).messageId
    ?? (trace as Record<string, any>).message_id
    ?? payload.messageId
    ?? payload.message_id
    ?? 0
  const num = Number(raw || 0)
  return Number.isInteger(num) && num > 0 ? String(num) : ''
}

function readPayload(trace: ChatGenerationAttemptArtifactEntry): Record<string, any> {
  const payload = (trace as Record<string, any>).payload
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, any> : {}
}

function readObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

function readPlanContent(plan: unknown): string {
  const record = readObject(plan)
  if (!record) return ''
  return String(record.content ?? record.plan ?? record.body ?? record.replyPlan ?? record.reply_plan ?? '').trim()
}

function normalizedPlanBody(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function nearlySameScore(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return false
  return Math.abs(left - right) < 0.000001
}

function findTopPlanCandidateIndex(
  topPlan: { id: string; body: string; strategy: string; intensity: string; score: number | null },
  candidates: Array<{ id: string; cat: string; int: string; body: string; score: number | null }>,
  usedIndexes: Set<number>
): number {
  const body = normalizedPlanBody(topPlan.body)
  const matchers = [
    (candidate: { id: string; body: string }) => Boolean(topPlan.id && body && candidate.id === topPlan.id && normalizedPlanBody(candidate.body) === body),
    (candidate: { body: string }) => Boolean(body && normalizedPlanBody(candidate.body) === body),
    (candidate: { id: string; score: number | null }) => Boolean(topPlan.id && candidate.id === topPlan.id && nearlySameScore(candidate.score, topPlan.score)),
    (candidate: { cat: string; int: string; score: number | null }) => Boolean(topPlan.strategy && topPlan.intensity && candidate.cat === topPlan.strategy && candidate.int === topPlan.intensity && nearlySameScore(candidate.score, topPlan.score)),
    (candidate: { id: string }) => Boolean(topPlan.id && candidate.id === topPlan.id)
  ]
  for (const matcher of matchers) {
    const index = candidates.findIndex((candidate, candidateIndex) => !usedIndexes.has(candidateIndex) && matcher(candidate))
    if (index >= 0) return index
  }
  return -1
}

function matchTopPlansToCandidates(
  topPlans: Array<{ id: string; body: string; strategy: string; intensity: string; score: number | null; rank: number }>,
  candidates: Array<{ id: string; cat: string; int: string; body: string; score: number | null }>
): Map<number, { rank: number }> {
  const matched = new Map<number, { rank: number }>()
  const usedIndexes = new Set<number>()
  for (const topPlan of topPlans) {
    const index = findTopPlanCandidateIndex(topPlan, candidates, usedIndexes)
    if (index < 0) continue
    usedIndexes.add(index)
    matched.set(index, { rank: topPlan.rank })
  }
  return matched
}

function buildAuditRecord(trace: ChatGenerationAttemptArtifactEntry, index: number): AuditRecord | null {
  const payload = readPayload(trace)
  const orchestration = payload.orchestration
  if (!orchestration || typeof orchestration !== 'object' || Array.isArray(orchestration)) return null

  const scenario = resolveReplyPlanOrchestrationScenarioCode(orchestration)
  const strategyMatrix: any[] = Array.isArray(orchestration.strategyMatrix) ? orchestration.strategyMatrix : []
  const categories = strategyMatrix.map((spec) => ({
    key: String(spec?.strategy || '').trim(),
    label: String(spec?.strategyLabel || spec?.strategy || '').trim()
  })).filter((c) => c.key)

  const planPromptDigest: Record<string, string> = {}
  const intensitySet = new Set<string>()
  for (const spec of strategyMatrix) {
    const key = String(spec?.strategy || '').trim()
    if (!key) continue
    const list = Array.isArray(spec?.intensities) ? spec.intensities.map((x: unknown) => String(x || '').trim()).filter(Boolean) : []
    planPromptDigest[key] = String(spec?.planPrompt || '').trim()
    list.forEach((it: string) => intensitySet.add(it))
  }
  const intensities = orderIntensities([...intensitySet]).map((key) => ({ key, label: intLabel(key) }))

  const toolCallsRaw: any[] = Array.isArray(orchestration.toolCalls) ? orchestration.toolCalls : []
  const generateCalls = toolCallsRaw.filter((tc) => tc?.tool === 'generatePlanBatch')
  const reviewCalls = toolCallsRaw.filter((tc) => tc?.tool === 'reviewPlanCandidates')

  // 候选：orchestration.candidates 运行时带 score；topPlans 用于标记顶部与送入回复模型
  const candidatesRaw: any[] = Array.isArray(orchestration.candidates) ? orchestration.candidates : []
  const topPlansRaw: any[] = Array.isArray(payload.topPlans) ? payload.topPlans : (Array.isArray(payload.top_plans) ? payload.top_plans : [])
  const topPlanRefs = topPlansRaw.slice(0, 3).map((plan, rank) => ({
    id: String(plan?.id || '').trim(),
    body: readPlanContent(plan),
    strategy: String(plan?.strategy || '').trim(),
    intensity: String(plan?.intensity || '').trim(),
    score: typeof plan?.score === 'number' && Number.isFinite(plan.score) ? plan.score : null,
    rank: rank + 1
  }))

  // 来源工具调用 id：按 strategy 找对应的 generatePlanBatch（合成 id：tc_序号）
  const strategyToToolCallId = new Map<string, string>()
  toolCallsRaw.forEach((tc, i) => {
    if (tc?.tool === 'generatePlanBatch') strategyToToolCallId.set(String(tc.strategy || '').trim(), `tc_${i + 1}`)
  })

  const scored = candidatesRaw.map((cand) => ({
    id: String(cand?.id || '').trim(),
    cat: String(cand?.strategy || '').trim(),
    int: String(cand?.intensity || '').trim(),
    body: readPlanContent(cand),
    score: typeof cand?.score === 'number' && Number.isFinite(cand.score) ? cand.score : null,
    src: strategyToToolCallId.get(String(cand?.strategy || '').trim()) || ''
  }))
  // 排序（按分数降序赋 rank）
  const rankSorted = scored
    .map((candidate, index) => ({ candidate, index }))
    .filter((item) => item.candidate.score != null)
    .sort((a, b) => (b.candidate.score as number) - (a.candidate.score as number))
  const rankMap = new Map<number, number>()
  rankSorted.forEach((item, i) => rankMap.set(item.index, i + 1))
  const selectedRefByIndex = matchTopPlansToCandidates(topPlanRefs, scored)

  const candidates: AuditCandidate[] = scored.map((c, index) => {
    const selectedRef = selectedRefByIndex.get(index)
    const selected = Boolean(selectedRef)
    return {
      id: c.id,
      cat: c.cat,
      int: c.int,
      src: c.src,
      review: c.score != null,
      score: c.score,
      rank: selectedRef?.rank ?? rankMap.get(index) ?? null,
      top: selectedRef?.rank === 1,
      selected,
      body: c.body
    }
  })

  const toolCalls: AuditToolCall[] = toolCallsRaw.map((tc, i) => {
    if (tc?.tool === 'generatePlanBatch') {
      const list = Array.isArray(tc.intensities) ? tc.intensities.map((x: unknown) => String(x || '').trim()).filter(Boolean) : []
      return {
        id: `tc_${i + 1}`,
        name: 'generatePlanBatch',
        status: 'ok' as const,
        durationMs: null,
        promptLogId: String(tc.promptLogId || '').trim() || undefined,
        argSummary: `category=${tc.strategy || ''} · 强度 ${list.map((x: string) => intLabel(x)).join('/')}`,
        args: { strategy: tc.strategy, strategyLabel: tc.strategyLabel, intensities: list, planPrompt: tc.planPrompt },
        resultSummary: `返回 ${list.length} 条候选（${tc.strategyLabel || tc.strategy} ${list.map((x: string) => intLabel(x)).join('/')}）`
      }
    }
    const candidateIds = Array.isArray(tc.candidateIds) ? tc.candidateIds : (Array.isArray(tc.candidate_ids) ? tc.candidate_ids : [])
    return {
      id: `tc_${i + 1}`,
      name: 'reviewPlanCandidates',
      status: 'ok' as const,
      durationMs: null,
      promptLogId: String(tc.promptLogId || tc.reviewPromptLogId || '').trim() || undefined,
      argSummary: `输入 ${candidateIds.length || candidates.length} 候选 · 输出排序 + 顶部计划`,
      args: { candidateIds },
      resultSummary: topPlanRefs[0]?.id ? `排序完成，顶部 = ${topPlanRefs[0].id}` : '排序完成'
    }
  })

  // 多轮 loop 轨迹（批次 2 写入 orchestration.turns，含 readScenarioSkill/getToolManual 元工具）
  const turnsRaw: any[] = Array.isArray(orchestration.turns) ? orchestration.turns : []
  const turns: AuditTurn[] = turnsRaw.map((turn, ti) => ({
    index: Number(turn?.turnIndex ?? ti) || ti,
    thought: String(turn?.thought || '').trim(),
    scenario: String(turn?.scenario || '').trim(),
    calls: (Array.isArray(turn?.toolResults) ? turn.toolResults : []).map((result: any) => {
      const tool = String(result?.tool || '').trim()
      return {
        tool,
        kind: META_TOOL_NAMES.has(tool) ? 'meta' as const : 'plan' as const,
        resultText: String(result?.resultText || '').trim(),
        isError: Boolean(result?.isError),
        blocked: Boolean(result?.blocked)
      }
    })
  }))
  const runtimeTrace = readRuntimeTrace(orchestration.transcript)
  const narrationSkillReads = readNarrationSkillReads(orchestration.narrationSubagent ?? orchestration.narration_subagent)
  // 批次4 去融合：表达占比唯一真值来自编排器生成轮（payload/orchestration.expressionMix）。
  const expressionMix = readExpressionMix(
    payload.expressionMix ?? payload.expression_mix ?? orchestration.expressionMix ?? orchestration.expression_mix
  )
  // 建议字数（与表达占比同处取自生成轮顶层）：展示提调据情境定的篇幅区间，缺失则空串（界面回退「按默认篇幅」）。
  const wordCountAdviceParsed = parseReplyPlanWordCountAdvice(
    payload.wordCountAdvice ?? payload.word_count_advice ?? orchestration.wordCountAdvice ?? orchestration.word_count_advice
  )
  const wordCountAdvice = wordCountAdviceParsed
    ? (wordCountAdviceParsed.min === wordCountAdviceParsed.max
        ? t('diagnostics.orchestrationAudit.wordCountSingle', { value: wordCountAdviceParsed.min })
        : t('diagnostics.orchestrationAudit.wordCountRange', { min: wordCountAdviceParsed.min, max: wordCountAdviceParsed.max }))
    : ''

  // 真实成功链路：编排器输出已落库则视为成功；失败/部分/重试需上游补字段后驱动
  const explicitState = String(orchestration.state || payload.state || '').trim()
  const state: AuditState = (['success', 'partial', 'failed', 'retried'].includes(explicitState) ? explicitState : 'success') as AuditState

  const budget = {
    state: (state === 'failed' ? 'stopped' : 'ok') as 'ok' | 'over' | 'stopped',
    used: toolCallsRaw.length,
    max: DEFAULT_REPLY_PLAN_ORCHESTRATOR_BUDGET.maxTotalToolCalls,
    concurrency: null as number | null,
    concurrencyMax: null as number | null
  }

  return {
    id: trace.id,
    state,
    character: String(payload.speakerName || payload.speaker_name || t('diagnostics.observation.unknownSpeaker')).trim() || t('diagnostics.observation.unknownSpeaker'),
    time: formatTime(trace.createdAt),
    scenario,
    scenarioLabel: scenarioLabelText(scenario),
    categories,
    intensities,
    toolCallSummary: { generate: generateCalls.length, review: reviewCalls.length },
    budget,
    orchestrationSummary: String(orchestration.orchestrationSummary || '').trim(),
    toolCalls,
    candidates,
    failure: readFailure(orchestration),
    planPromptDigest,
    runtimeTrace,
    turns,
    narrationSkillReads,
    expressionMix,
    wordCountAdvice
  }
}

function readNarrationSkillReads(value: unknown): AuditNarrationSkillRead[] {
  const subagent = readObject(value)
  const rawItems = Array.isArray(subagent?.readSkills)
    ? subagent.readSkills
    : (Array.isArray(subagent?.read_skills) ? subagent.read_skills : [])
  const seen = new Set<string>()
  const items: AuditNarrationSkillRead[] = []
  for (const rawItem of rawItems) {
    const item = readObject(rawItem)
    if (!item) continue
    const profileId = String(item.profileId ?? item.profile_id ?? item.id ?? '').trim()
    const profileName = String(item.profileName ?? item.profile_name ?? item.name ?? profileId).trim()
    const source = String(item.source || '').trim()
    const triggerDescription = normalizeInlineText(String(item.triggerDescription ?? item.trigger_description ?? '').trim())
    const key = profileId || profileName
    if (!key || seen.has(key)) continue
    seen.add(key)
    const sourceLabel = source === 'read_tool' ? t('diagnostics.orchestrationAudit.narrationRead') : t('diagnostics.orchestrationAudit.narrationConfirmed')
    items.push({
      profileId: profileId || profileName,
      profileName,
      source,
      sub: triggerDescription ? `${sourceLabel} · ${compactText(triggerDescription, 30)}` : sourceLabel
    })
  }
  return items
}

function readRuntimeTrace(value: unknown): AuditRuntimeTraceTurn[] {
  const transcript = readObject(value)
  const turnsRaw = Array.isArray(transcript?.turns) ? transcript.turns : []
  return turnsRaw.map((turn, ti) => {
    const turnRecord = readObject(turn) || {}
    const index = Number(turnRecord.turnIndex ?? ti) || ti
    const stage = String(turnRecord.stage || '').trim()
    const parsed = readObject(readObject(turnRecord.modelMessage)?.parsed)
    const thought = normalizeInlineText(String(parsed?.thought || '').trim())
    const activeTools = Array.isArray(turnRecord.activeTools)
      ? turnRecord.activeTools.map((item: unknown) => shortToolName(String(item || '').trim())).filter(Boolean)
      : []
    const toolResults = Array.isArray(turnRecord.toolResults) ? turnRecord.toolResults : []
    const hookEvents = Array.isArray(turnRecord.hookEvents) ? turnRecord.hookEvents : []
    const nextTurnPatches = Array.isArray(turnRecord.nextTurnPatches) ? turnRecord.nextTurnPatches : []

    const tools: AuditRuntimeChip[] = toolResults.slice(0, 4).map((result, ri) => {
      const resultRecord = readObject(result) || {}
      const toolName = String(resultRecord.toolName || '').trim()
      const status = String(resultRecord.status || '').trim()
      const error = readObject(resultRecord.error)
      const title = [
        toolName,
        status || 'unknown',
        String(error?.message || resultRecord.content || '').trim()
      ].filter(Boolean).join(' · ')
      return {
        key: `tool_${ri}_${toolName}`,
        label: `${shortToolName(toolName)} ${toolStatusLabel(status)}`,
        title,
        cls: status === 'error' ? 'bad' : status === 'blocked' ? 'blocked' : ''
      }
    })

    const hookChips: AuditRuntimeChip[] = hookEvents.slice(0, 3).map((event, hi) => {
      const eventRecord = readObject(event) || {}
      const effects = Array.isArray(eventRecord.effects)
        ? eventRecord.effects.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : []
      const summary = String(eventRecord.summary || eventRecord.id || '').trim()
      return {
        key: `hook_${hi}_${String(eventRecord.id || '')}`,
        label: hookLabel(effects, summary),
        title: [String(eventRecord.lifecycle || '').trim(), summary, effects.join(', ')].filter(Boolean).join(' · ')
      }
    })

    // 展开态全文明细：工具全参 + 全结果（配对 toolCalls 取 args），hook 全摘要+效果；都不 slice、不截断。
    const toolCalls = Array.isArray(turnRecord.toolCalls) ? turnRecord.toolCalls : []
    const detailTools: AuditRuntimeToolDetail[] = toolResults.map((result, ri) => {
      const resultRecord = readObject(result) || {}
      const toolName = String(resultRecord.toolName || '').trim()
      const status = String(resultRecord.status || '').trim()
      const error = readObject(resultRecord.error)
      const matchedCall = readObject(toolCalls.find((call) => {
        const callRecord = readObject(call)
        return callRecord && String(callRecord.callId || '') === String(resultRecord.callId || '') && Boolean(resultRecord.callId)
      })) || readObject(toolCalls[ri])
      const argsValue = matchedCall?.args
      const argsText = argsValue && typeof argsValue === 'object'
        ? JSON.stringify(argsValue, null, 2)
        : String(argsValue ?? '').trim()
      return {
        key: `dtool_${ri}_${toolName}`,
        name: toolName || t('diagnostics.orchestrationAudit.unnamedTool'),
        status: status || 'unknown',
        args: argsText,
        result: String(error?.message || resultRecord.content || '').trim(),
        cls: status === 'error' ? 'bad' : status === 'blocked' ? 'blocked' : ''
      }
    })
    const detailHooks: AuditRuntimeHookDetail[] = hookEvents.map((event, hi) => {
      const eventRecord = readObject(event) || {}
      const effects = Array.isArray(eventRecord.effects)
        ? eventRecord.effects.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : []
      return {
        key: `dhook_${hi}_${String(eventRecord.id || '')}`,
        lifecycle: String(eventRecord.lifecycle || '').trim(),
        summary: String(eventRecord.summary || eventRecord.id || '').trim(),
        effects: effects.join(', ')
      }
    })

    const lastPatch = readObject(nextTurnPatches[nextTurnPatches.length - 1])
    const nextTools = Array.isArray(lastPatch?.activeTools)
      ? lastPatch.activeTools.map((item: unknown) => shortToolName(String(item || '').trim())).filter(Boolean)
      : []
    const retry = readObject(lastPatch?.requestRetry)
    const nextText = lastPatch?.terminate
      ? t('diagnostics.orchestrationAudit.nextTerminate')
      : retry
        ? t('diagnostics.orchestrationAudit.nextRetry', { tool: shortToolName(String(retry.toolName || '').trim()) || t('diagnostics.orchestrationAudit.tool') })
        : nextTools.length
          ? t('diagnostics.orchestrationAudit.nextRound', { tools: nextTools.join('/') })
          : ''
    const visibleCount = tools.length + hookChips.length + (nextText ? 1 : 0) + (activeTools.length ? 1 : 0)
    const totalCount = toolResults.length + hookEvents.length + nextTurnPatches.length + (activeTools.length ? 1 : 0)
    const hasIssue = toolResults.some((result) => {
      const status = String(readObject(result)?.status || '').trim()
      return status === 'error' || status === 'blocked'
    }) || Boolean(retry)

    return {
      index,
      stageLabel: stageLabel(stage),
      thought,
      activeToolsText: compactTools(activeTools),
      tools,
      hooks: hookChips,
      nextText,
      moreCount: Math.max(0, totalCount - visibleCount),
      hasIssue,
      detailTools,
      detailHooks
    }
  })
}

function readExpressionMix(value: unknown): AuditExpressionMixItem[] {
  const mixRaw = readObject(value)
  if (!mixRaw) return []
  const items = EXPRESSION_MIX_LABELS.map((item) => ({
    key: item.key,
    label: t(item.labelKey),
    value: formatPercent(mixRaw[item.key] ?? mixRaw[toSnakeCase(item.key)])
  }))
  return items.some((item) => item.value > 0) ? items : []
}

function readFailure(orchestration: Record<string, any>): AuditRecord['failure'] {
  const failure = orchestration.failure
  if (!failure || typeof failure !== 'object' || Array.isArray(failure)) return null
  return {
    stage: String(failure.stage || '').trim(),
    reason: String(failure.reason || '').trim(),
    detail: String(failure.detail || '').trim(),
    impact: String(failure.impact || '').trim(),
    chain: Array.isArray(failure.chain) ? failure.chain.map((x: unknown) => String(x || '').trim()).filter(Boolean) : []
  }
}

function orderIntensities(keys: string[]): string[] {
  return keys.slice().sort((a, b) => {
    const ia = INTENSITY_ORDER.indexOf(a)
    const ib = INTENSITY_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

function intLabel(key: string): string {
  const labelKey = INTENSITY_LABEL_KEYS[key]
  return labelKey ? t(labelKey) : key
}

function compactText(value: string, max = 48): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

function normalizeInlineText(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compactTools(tools: string[]): string {
  if (tools.length <= 3) return tools.join('/')
  return `${tools.slice(0, 3).join('/')} +${tools.length - 3}`
}

function shortToolName(name: string): string {
  // key 是真实工具名（数据）保留，值走 i18n
  const map: Record<string, string> = {
    readScenarioSkill: t('diagnostics.orchestrationAudit.readScenario'),
    getToolManual: t('diagnostics.orchestrationAudit.shortManual'),
    generatePlanBatch: t('diagnostics.orchestrationAudit.shortGenerate'),
    reviewPlanCandidates: t('diagnostics.orchestrationAudit.review')
  }
  return map[name] || name
}

function stageLabel(stage: string): string {
  // key 是 stage 协议值（数据）保留，值走 i18n
  const map: Record<string, string> = {
    'scenario-routing': t('diagnostics.orchestrationAudit.stageScenarioRouting'),
    'context-assembly': t('diagnostics.orchestrationAudit.stageContextAssembly'),
    'skill-reading': t('diagnostics.orchestrationAudit.readScenario'),
    'manual-reading': t('diagnostics.orchestrationAudit.stageManualReading'),
    'plan-generation': t('diagnostics.orchestrationAudit.stagePlanGeneration'),
    'plan-review': t('diagnostics.orchestrationAudit.review'),
    'final-reply-prep': t('diagnostics.orchestrationAudit.stageFinalReplyPrep'),
    unknown: t('diagnostics.orchestrationAudit.unknown')
  }
  return map[stage] || stage || t('diagnostics.orchestrationAudit.unknown')
}

function toolStatusLabel(status: string): string {
  if (status === 'success') return 'ok'
  if (status === 'blocked') return t('diagnostics.orchestrationAudit.statusBlocked')
  if (status === 'error') return t('diagnostics.orchestrationAudit.statusError')
  return status || '?'
}

function hookLabel(effects: string[], summary: string): string {
  if (effects.includes('terminate')) return t('diagnostics.orchestrationAudit.hookTerminate')
  if (effects.includes('requestRetry')) return t('diagnostics.orchestrationAudit.hookRetry')
  if (effects.includes('setActiveTools')) return t('diagnostics.orchestrationAudit.hookGate')
  if (effects.includes('patchToolResult')) return t('diagnostics.orchestrationAudit.hookClean')
  if (effects.includes('injectMessage')) return t('diagnostics.orchestrationAudit.hookCalibrate')
  if (effects.includes('blockToolCall')) return t('diagnostics.orchestrationAudit.hookIntercept')
  return compactText(summary || 'hook', 18)
}

function expressionMixHint(mix: AuditExpressionMixItem[]): string {
  return mix
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((item) => `${item.label}${item.value}%`)
    .join(' · ')
}

/** 「前三计划 + 占比」section 折叠态摘要：表达占比前二 + 建议字数（任一缺失各自省略，都缺则「暂无」）。 */
function expressionMixSectionHint(rec: AuditRecord): string {
  const parts: string[] = []
  if (rec.expressionMix.length) parts.push(expressionMixHint(rec.expressionMix))
  if (rec.wordCountAdvice) parts.push(rec.wordCountAdvice)
  return parts.length ? parts.join(' · ') : t('diagnostics.orchestrationAudit.hintNone')
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function formatPercent(value: unknown): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 0
  return Math.max(0, Math.min(100, Math.round(numberValue)))
}

function catLabel(key: string): string {
  const rec = activeRecord.value
  return rec?.categories.find((c) => c.key === key)?.label || key
}

function chainStepClass(step: string): string {
  if (step.includes('中止')) return 'stop'
  if (step.includes('被拒') || step.includes('不足') || step.includes('失败')) return 'bad'
  return ''
}

function budgetLabel(state: 'ok' | 'over' | 'stopped'): string {
  return state === 'ok' ? t('diagnostics.orchestrationAudit.budgetOk') : state === 'over' ? t('diagnostics.orchestrationAudit.budgetOver') : t('diagnostics.orchestrationAudit.budgetStopped')
}

function formatTime(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function copySummary() {
  const rec = activeRecord.value
  if (!rec) return
  const topPlanLine = rec.candidates.some((c) => c.selected)
    ? `\n${t('diagnostics.orchestrationAudit.copyTopPlans', { ids: rec.candidates.filter((c) => c.selected).map((c) => c.id).join('、') })}`
    : ''
  const mixLine = rec.expressionMix.length ? `\n${t('diagnostics.orchestrationAudit.copyMix', { mix: expressionMixHint(rec.expressionMix) })}` : ''
  const wordCountLine = rec.wordCountAdvice ? `\n${t('diagnostics.orchestrationAudit.copyWordCount', { advice: rec.wordCountAdvice })}` : ''
  const narrationLine = rec.narrationSkillReads.length
    ? `\n${t('diagnostics.orchestrationAudit.copyNarration', { reads: rec.narrationSkillReads.map((item) => `${item.profileName}(${item.sub})`).join('、') })}`
    : ''
  const text = `[${t('diagnostics.orchestrationAudit.copyTitle', { state: t(STATE_META[rec.state].labelKey) })}]\n${t('diagnostics.orchestrationAudit.copyCharTime', { character: rec.character, time: rec.time })}\nscenario：${rec.scenario}${topPlanLine}${mixLine}${wordCountLine}${narrationLine}\n${rec.orchestrationSummary}`
  try {
    navigator.clipboard?.writeText(text)
  } catch {
    // 复制失败保持静默，不影响审计阅读
  }
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1400)
}
</script>

<style scoped>
/* 设计 token 别名：把设计稿的 --lh-* 接到项目真实的 --morandi-* 上，自动跟随暗色模式 */
.orchestration-audit {
  --lh-card: var(--morandi-card);
  --lh-surface: var(--morandi-surface);
  --lh-soft-bg: var(--morandi-soft-bg);
  --lh-soft-bg-strong: var(--morandi-soft-bg-strong);
  --lh-hover: var(--morandi-hover);
  --lh-accent: var(--morandi-accent);
  --lh-primary: var(--morandi-primary);
  --lh-danger: var(--morandi-danger);
  --lh-gold: #D4A843;
  --lh-secondary: #b5a99a;
  --lh-text: var(--morandi-text);
  --lh-text-light: var(--morandi-text-light);
  --lh-text-muted: #8d8d8d;
  --lh-text-faint: #b6b0a7;
  --lh-border: var(--morandi-border);
  --lh-border-line: var(--morandi-border);
  --lh-border-warm: rgba(139, 115, 85, 0.12);
  --lh-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --lh-radius-sm: 6px;
  --lh-radius-md: 8px;
  --lh-radius-pill: 999px;
  --lh-dur-fast: 0.15s;
  --lh-dur: 0.18s;
  --lh-dur-slow: 0.3s;
  --lh-ease: ease;

  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--lh-surface);
  color: var(--lh-text);
  overflow: hidden;
}

/* 头部 */
.aud-head { padding: 14px 16px 12px; border-bottom: 1px solid var(--lh-border-line); flex-shrink: 0; }
.aud-head-top { display: flex; align-items: center; gap: 8px; }
.aud-title { font-size: 0.98rem; font-weight: 600; color: var(--lh-text); display: flex; align-items: center; gap: 7px; }
.aud-title svg { width: 16px; height: 16px; color: var(--lh-accent); }
.aud-head-actions { margin-left: auto; display: flex; gap: 1px; }
.aud-ibtn { width: 30px; height: 30px; border: none; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: var(--lh-radius-sm); color: var(--lh-text-muted); transition: background var(--lh-dur-fast), color var(--lh-dur-fast); }
.aud-ibtn svg { width: 15px; height: 15px; }
.aud-ibtn:hover { background: rgba(139, 115, 85, 0.08); color: var(--lh-text-light); }
.aud-ibtn:disabled { opacity: 0.4; cursor: default; }
.aud-ibtn.copied { color: var(--lh-accent); }

.aud-msgline { display: flex; align-items: center; gap: 8px; margin-top: 9px; font-size: 0.76rem; color: var(--lh-text-light); flex-wrap: wrap; }
.aud-msgline .nm { font-weight: 600; color: var(--lh-text); }
.aud-msgline .dot { color: var(--lh-text-faint); }

/* 状态 pill */
.statepill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: var(--lh-radius-pill); font-size: 0.72rem; font-weight: 600; }
.statepill .d { width: 6px; height: 6px; border-radius: 50%; }
.statepill.s-success { background: rgba(92, 138, 92, 0.14); color: var(--lh-accent); }
.statepill.s-success .d { background: var(--lh-accent); }
.statepill.s-partial { background: rgba(212, 168, 67, 0.18); color: #a07c1e; }
.statepill.s-partial .d { background: #c79a2e; }
.statepill.s-failed { background: rgba(192, 102, 90, 0.14); color: var(--lh-danger); }
.statepill.s-failed .d { background: var(--lh-danger); }
.statepill.s-retried { background: rgba(160, 181, 196, 0.18); color: #567184; }
.statepill.s-retried .d { background: #7b96a6; }

/* session 列表 */
.aud-list-wrap { flex: 1; overflow-y: auto; min-height: 0; padding: 12px 14px 24px; }
.aud-list-head { font-size: 0.74rem; color: var(--lh-text-muted); font-weight: 600; margin: 2px 2px 10px; }
.aud-list-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--lh-border); background: var(--lh-card); border-radius: var(--lh-radius-md); cursor: pointer; text-align: left; margin-bottom: 8px; transition: background var(--lh-dur-fast), border-color var(--lh-dur-fast); }
.aud-list-item:hover { background: var(--lh-hover); border-color: rgba(92, 138, 92, 0.3); }
.li-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.li-nm { font-size: 0.84rem; font-weight: 600; color: var(--lh-text); }
.li-tm { font-size: 0.7rem; color: var(--lh-text-muted); }
.li-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* 被重试替换横幅 */
.replaced-banner { display: flex; gap: 9px; align-items: flex-start; margin: 12px 16px 0; padding: 10px 12px; border: 1px solid rgba(160, 181, 196, 0.45); background: rgba(160, 181, 196, 0.09); border-radius: var(--lh-radius-md); }
.replaced-banner svg { width: 15px; height: 15px; color: #567184; flex-shrink: 0; margin-top: 1px; }
.replaced-banner .rb-t { font-size: 0.78rem; font-weight: 600; color: #3f5663; }
.replaced-banner .rb-s { font-size: 0.74rem; color: var(--lh-text-light); line-height: 1.5; margin-top: 2px; }
.rb-link { color: var(--lh-accent); cursor: pointer; font-weight: 500; }
.aud-stale { opacity: 0.62; filter: saturate(0.72); }

/* 滚动容器 */
.aud-scroll { flex: 1; overflow-y: auto; min-height: 0; }

.kbd { font-family: var(--lh-font-mono); font-size: 0.74rem; padding: 1px 6px; border-radius: 5px; background: rgba(139, 115, 85, 0.1); color: #6f5a40; }

/* 可折叠分区 */
.sec { border-bottom: 1px solid var(--lh-border-line); }
.sec:last-child { border-bottom: none; }
.sec-h2 { width: 100%; display: flex; align-items: center; gap: 7px; padding: 12px 16px; background: none; border: none; cursor: pointer; text-align: left; }
.sec-h2:hover { background: var(--lh-hover); }
.sec-chev { width: 13px; height: 13px; color: var(--lh-text-faint); transition: transform var(--lh-dur-fast); flex-shrink: 0; }
.sec-h2.open .sec-chev { transform: rotate(90deg); }
.sec-t { font-size: 0.82rem; font-weight: 600; color: var(--lh-text); }
.sec-hint { margin-left: auto; font-size: 0.68rem; color: var(--lh-text-muted); }
.sec-body { padding: 2px 16px 16px; }

/* 运行时轨迹：优先展示紧凑 hook 摘要 */
.rt-list { display: flex; flex-direction: column; gap: 6px; }
.rt-row { padding: 7px 0 8px; border-top: 1px solid color-mix(in srgb, var(--lh-border-line) 72%, transparent); }
.rt-row:first-child { border-top: none; padding-top: 0; }
.rt-row.warn .rt-stage { color: var(--lh-danger); }
.rt-line { display: flex; align-items: flex-start; gap: 7px; min-width: 0; }
.rt-ix { width: 26px; min-width: 26px; font-family: var(--lh-font-mono); font-size: 0.68rem; color: var(--lh-text-faint); }
.rt-stage { min-width: 54px; flex-shrink: 0; font-size: 0.72rem; font-weight: 600; color: var(--lh-text); }
.rt-thought { flex: 1; min-width: 0; font-size: 0.72rem; line-height: 1.55; color: var(--lh-text-muted); white-space: normal; overflow-wrap: anywhere; }
.rt-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 5px 0 0 33px; }
.rt-chip { max-width: 138px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px; border-radius: 5px; border: 1px solid color-mix(in srgb, var(--lh-border) 82%, transparent); background: var(--lh-soft-bg); color: var(--lh-text-light); font-size: 0.66rem; line-height: 1.45; }
.rt-chip.muted { color: var(--lh-text-muted); background: transparent; }
.rt-chip.bad { color: var(--lh-danger); background: rgba(192, 102, 90, 0.08); border-color: rgba(192, 102, 90, 0.24); }
.rt-chip.blocked { color: #8b6b38; background: rgba(212, 168, 67, 0.08); border-color: rgba(212, 168, 67, 0.24); }
.rt-chip.hook { color: #5f6f55; background: rgba(92, 138, 92, 0.07); border-color: rgba(92, 138, 92, 0.18); }
.rt-chip.next { color: #5a6171; background: rgba(160, 181, 196, 0.09); border-color: rgba(160, 181, 196, 0.22); }
.rt-more { font-family: var(--lh-font-mono); font-size: 0.64rem; color: var(--lh-text-faint); }
/* 整行可点击展开看全文 */
.rt-line.clickable { cursor: pointer; }
.rt-line.clickable:hover .rt-stage { color: var(--lh-accent, var(--lh-text)); }
.rt-toggle { flex: none; margin-left: auto; align-self: flex-start; font-size: 0.66rem; color: var(--lh-info, #5a6171); white-space: nowrap; }
/* 展开态全文明细：工具全参/全结果、hook 全摘要，都不截断 */
.rt-detail { margin: 6px 0 0 33px; display: flex; flex-direction: column; gap: 8px; }
.rt-detail-line { display: flex; gap: 6px; font-size: 0.7rem; line-height: 1.5; }
.rt-detail-k { flex: none; font-size: 0.64rem; font-weight: 600; color: var(--lh-text-muted); }
.rt-detail-v { min-width: 0; color: var(--lh-text-light); overflow-wrap: anywhere; }
.rt-detail-tool { border: 1px solid color-mix(in srgb, var(--lh-border) 82%, transparent); border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; gap: 5px; background: var(--lh-soft-bg); }
.rt-detail-tool.bad { border-color: rgba(192, 102, 90, 0.3); }
.rt-detail-tool.blocked { border-color: rgba(212, 168, 67, 0.3); }
.rt-detail-tool-h { display: flex; align-items: baseline; gap: 8px; }
.rt-detail-name { font-size: 0.7rem; font-weight: 600; color: var(--lh-text); }
.rt-detail-status { font-family: var(--lh-font-mono); font-size: 0.62rem; color: var(--lh-text-faint); }
.rt-detail-block { display: flex; flex-direction: column; gap: 2px; }
.rt-detail-pre { margin: 0; font-family: var(--lh-font-mono); font-size: 0.66rem; line-height: 1.5; color: var(--lh-text-light); white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto; }
.rt-detail-hook { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 0.68rem; color: var(--lh-text-light); }
.rt-detail-eff { font-family: var(--lh-font-mono); font-size: 0.62rem; color: var(--lh-text-muted); overflow-wrap: anywhere; }

/* 旧 turns 兜底轨迹 */
.trace-list { display: flex; flex-direction: column; gap: 10px; }
.trace-turn { border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); background: var(--lh-card); padding: 9px 11px; }
.trace-turn-h { display: flex; align-items: flex-start; gap: 7px; font-size: 0.72rem; }
.trace-turn-ix { font-family: var(--lh-font-mono); color: var(--lh-text-muted); }
.trace-turn-thought { color: var(--lh-text-light); flex: 1; min-width: 0; line-height: 1.55; white-space: normal; overflow-wrap: anywhere; }
.trace-calls { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.trace-call { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; border-radius: 6px; background: var(--lh-soft-bg); }
.trace-call.err { background: rgba(190, 90, 90, 0.08); }
.trace-call.blk { background: var(--lh-hover); }
.trace-call-top { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; }
.trace-call-name { font-family: var(--lh-font-mono); color: var(--lh-text); }
.trace-call-kind { font-size: 0.62rem; padding: 1px 5px; border-radius: 4px; background: var(--lh-card); border: 1px solid var(--lh-border); color: var(--lh-text-muted); }
.trace-call-kind.meta { color: var(--lh-secondary); border-color: var(--lh-secondary); }
.trace-call-flag { margin-left: auto; font-size: 0.64rem; color: var(--lh-danger); }
.trace-call-res { font-size: 0.74rem; line-height: 1.5; color: var(--lh-text-light); white-space: pre-wrap; word-break: break-word; max-height: 140px; overflow: auto; }
.trace-empty { font-size: 0.74rem; color: var(--lh-text-muted); padding: 4px 0; }

/* 编排器输出 */
.po-row { display: flex; gap: 12px; padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--lh-border-line) 70%, transparent); }
.po-row:first-child { border-top: none; padding-top: 2px; }
.po-k { width: 74px; min-width: 74px; font-size: 0.72rem; color: var(--lh-text-muted); padding-top: 2px; }
.po-v { flex: 1; min-width: 0; font-size: 0.8rem; color: var(--lh-text); }
.po-v b { font-weight: 700; }
.po-dim { color: var(--lh-text-muted); }
.po-call { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.po-call .mono { font-family: var(--lh-font-mono); font-size: 0.74rem; color: #6f5a40; }
.po-x { font-size: 0.72rem; color: var(--lh-secondary); font-weight: 700; }
.po-per { font-size: 0.72rem; color: var(--lh-text-muted); }
.po-sel { display: flex; flex-direction: column; }
.po-selhead { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; color: #4a734a; font-weight: 600; margin-bottom: 6px; }
.po-selitem {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 8px;
  row-gap: 2px;
  padding: 5px 0;
}
.po-star { color: var(--lh-gold); font-size: 0.82rem; line-height: 1.4; flex-shrink: 0; }
.po-selcol { min-width: 0; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; padding-top: 1px; }
.po-selmeta { min-width: 0; font-size: 0.7rem; color: var(--lh-text-light); overflow-wrap: anywhere; font-weight: 600; }
.po-primary { font-size: 0.62rem; color: var(--lh-accent); font-weight: 600; white-space: nowrap; }
.po-selbody { grid-column: 2; min-width: 0; font-size: 0.74rem; color: var(--lh-text-light); line-height: 1.5; overflow-wrap: anywhere; }
.po-ppnote { font-size: 0.71rem; color: var(--lh-text-muted); line-height: 1.5; margin-bottom: 7px; }
.po-ppitem { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; border-top: 1px solid color-mix(in srgb, var(--lh-border-line) 60%, transparent); }
.po-ppitem:first-of-type { border-top: none; padding-top: 0; }
.po-ppcat { min-width: 0; font-size: 0.73rem; font-weight: 600; color: #6f5a40; overflow-wrap: anywhere; }
.po-ppbody { min-width: 0; font-size: 0.73rem; line-height: 1.55; color: var(--lh-text-light); overflow-wrap: anywhere; }
.po-note { font-size: 0.72rem; color: var(--lh-text-muted); margin-top: 3px; line-height: 1.5; }
.po-reads { display: flex; flex-direction: column; gap: 5px; }
.po-read { display: flex; align-items: center; gap: 7px; font-size: 0.76rem; color: var(--lh-text); }
.po-read::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--lh-accent); flex-shrink: 0; }
.po-read--narration::before { background: var(--lh-gold); }
.po-read .s { color: var(--lh-text-muted); font-size: 0.7rem; }

/* 前三计划 + 表达占比 */
.syn { display: flex; flex-direction: column; gap: 11px; }
.syn-top { display: flex; flex-direction: column; gap: 7px; }
.syn-top-row { display: grid; grid-template-columns: 18px auto auto 1fr; align-items: baseline; gap: 8px; min-width: 0; font-size: 0.74rem; color: var(--lh-text-light); padding: 7px 9px; border: 1px solid rgba(92, 138, 92, 0.18); background: rgba(92, 138, 92, 0.06); border-radius: var(--lh-radius-md); }
.syn-top-rank { width: 18px; min-width: 18px; color: var(--lh-text-muted); font-variant-numeric: tabular-nums; }
.syn-top-score { color: var(--lh-text-muted); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
.syn-top-body { grid-column: 1 / -1; margin: 0; font-size: 0.76rem; line-height: 1.6; color: var(--lh-text); white-space: pre-wrap; word-break: break-word; }
.syn-mix { display: flex; flex-direction: column; gap: 7px; }
.syn-mix-row { display: grid; grid-template-columns: 36px minmax(84px, 1fr) 42px; align-items: center; gap: 8px; font-size: 0.72rem; color: var(--lh-text-light); }
.syn-mix-track { height: 7px; overflow: hidden; border-radius: var(--lh-radius-pill); background: rgba(139, 115, 85, 0.11); }
.syn-mix-track i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--lh-accent); }
.syn-mix-row b { font-size: 0.72rem; color: var(--lh-text); text-align: right; font-variant-numeric: tabular-nums; }
.syn-wordcount { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; padding-top: 7px; border-top: 1px dashed rgba(139, 115, 85, 0.18); font-size: 0.72rem; color: var(--lh-text-light); }
.syn-wordcount b { font-size: 0.72rem; color: var(--lh-text); font-variant-numeric: tabular-nums; }

/* 失败中止 */
.po-abort { margin-top: 12px; border: 1px solid rgba(192, 102, 90, 0.3); background: rgba(192, 102, 90, 0.05); border-radius: var(--lh-radius-md); padding: 11px 12px; }
.po-abort-head { display: flex; align-items: center; gap: 7px; font-size: 0.78rem; font-weight: 600; color: #a44b40; }
.po-abort-head svg { width: 14px; height: 14px; flex-shrink: 0; }
.po-abort-reason { font-size: 0.74rem; color: var(--lh-danger); margin-top: 6px; font-weight: 600; }
.po-abort-detail { font-size: 0.73rem; color: var(--lh-text-light); line-height: 1.55; margin-top: 5px; }
.po-abort-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 9px; }
.po-abort-step { font-size: 0.7rem; padding: 3px 9px; border-radius: var(--lh-radius-pill); background: var(--lh-soft-bg-strong); color: var(--lh-text-light); }
.po-abort-step.bad { background: rgba(192, 102, 90, 0.12); color: var(--lh-danger); font-weight: 600; }
.po-abort-step.stop { background: rgba(192, 102, 90, 0.18); color: var(--lh-danger); font-weight: 600; }
.po-abort-arrow { color: var(--lh-text-faint); font-size: 0.7rem; }
/* 提示词树加载占位 */
.cp-empty { font-size: 0.78rem; color: var(--lh-text-muted); padding: 8px 2px; line-height: 1.55; }

/* 可调用工具 */
.tlst { display: flex; flex-direction: column; }
.tlrow { padding: 9px 0; border-top: 1px solid color-mix(in srgb, var(--lh-border-line) 70%, transparent); }
.tlrow:first-child { border-top: none; padding-top: 2px; }
.tl-top { display: flex; align-items: center; gap: 8px; }
.tl-name { font-family: var(--lh-font-mono); font-size: 0.78rem; font-weight: 600; color: var(--lh-text); }
.tlrow.used .tl-name { color: #4a734a; }
.tl-used { margin-left: auto; display: flex; align-items: center; gap: 5px; font-size: 0.66rem; color: var(--lh-accent); background: rgba(92, 138, 92, 0.1); padding: 1px 8px; border-radius: var(--lh-radius-pill); }
.tl-used .d { width: 5px; height: 5px; border-radius: 50%; background: var(--lh-accent); }
.tl-idle { margin-left: auto; font-size: 0.66rem; color: var(--lh-text-faint); }
.tl-desc { font-size: 0.74rem; color: var(--lh-text-muted); margin-top: 3px; line-height: 1.5; }
.mono { font-family: var(--lh-font-mono); }

/* 空 / 无记录 / 加载 */
.aud-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 32px; text-align: center; }
.aud-empty .eico { width: 46px; height: 46px; border-radius: 50%; background: var(--lh-soft-bg-strong); display: flex; align-items: center; justify-content: center; color: var(--lh-text-muted); margin-bottom: 14px; }
.aud-empty .eico svg { width: 21px; height: 21px; }
.aud-empty .et { font-size: 0.86rem; font-weight: 600; color: var(--lh-text-light); }
.aud-empty .es { font-size: 0.78rem; color: var(--lh-text-muted); line-height: 1.6; margin-top: 7px; max-width: 240px; }

/* 骨架屏 */
.aud-skeleton { padding: 14px 16px; }
.sk { background: linear-gradient(90deg, rgba(139, 115, 85, 0.06) 25%, rgba(139, 115, 85, 0.12) 37%, rgba(139, 115, 85, 0.06) 63%); background-size: 400% 100%; animation: sk 1.3s ease infinite; border-radius: 5px; }
@keyframes sk { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
.sk-line { height: 11px; margin-bottom: 9px; }
</style>
