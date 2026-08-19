<template>
  <section class="scenario-prompt-library" :class="{ 'scenario-prompt-library--compact': compact }">
    <header v-if="!compact" class="scenario-prompt-library__header">
      <h2>{{ $t('docLibrary.topbar.scenarioPromptTitle') }}</h2>
      <span>回复编排器配置</span>
    </header>

    <div class="scenario-prompt-library__body">
      <OrchestratorPromptTreeEditor
        :compact="compact"
        :action-target="externalSidebar ? `#${SCENARIO_PROMPT_ACTIONS_TARGET_ID}` : ''"
        :tree-target="externalSidebar ? `#${SCENARIO_PROMPT_TREE_TARGET_ID}` : ''"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  SCENARIO_PROMPT_ACTIONS_TARGET_ID,
  SCENARIO_PROMPT_TREE_TARGET_ID
} from '../../app/docLibraryModules'
import OrchestratorPromptTreeEditor from '../common/OrchestratorPromptTreeEditor.vue'

withDefaults(defineProps<{
  compact?: boolean
  externalSidebar?: boolean
}>(), {
  compact: false,
  externalSidebar: false
})
</script>

<style scoped>
.scenario-prompt-library {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--morandi-bg);
  color: var(--morandi-text);
}

.scenario-prompt-library__header {
  display: flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 10px;
  min-height: 54px;
  box-sizing: border-box;
  padding: 17px 20px 12px;
  border-bottom: 1px solid var(--morandi-border);
}

.scenario-prompt-library__header h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
}

.scenario-prompt-library__header span {
  color: var(--morandi-text-light);
  font-size: 0.72rem;
}

.scenario-prompt-library__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.scenario-prompt-library__body :deep(.opt-root) {
  width: 100%;
  height: 100%;
}

.scenario-prompt-library--compact .scenario-prompt-library__body {
  overflow: auto;
}

@media (max-width: 720px) {
  .scenario-prompt-library__header {
    padding-inline: 4px;
  }

}
</style>
