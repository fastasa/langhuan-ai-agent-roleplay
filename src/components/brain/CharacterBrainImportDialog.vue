<template>
  <AppFormDialog
    :open="open"
    :title="$t('brain.importDialog.title')"
    :subtitle="$t('brain.importDialog.subtitle', { parent: parentTitle || $t('brain.domainLabel.soul') })"
    size="lg"
    :submit-text="$t('brain.importToCurrentNode')"
    :submit-disabled="!parsedDraft || saving"
    @cancel="$emit('cancel')"
    @submit="submitImport"
  >
    <div class="brain-import-dialog">
      <div class="brain-import-dialog__toolbar">
        <button type="button" class="brain-import-dialog__button" @click="showTemplate = !showTemplate">
          {{ showTemplate ? $t('brain.importDialog.templateCollapse') : $t('brain.importDialog.templateShow') }}
        </button>
        <label class="brain-import-dialog__button">
          {{ $t('brain.importDialog.chooseJson') }}
          <input class="brain-import-dialog__file" type="file" accept="application/json,.json" @change="readJsonFile">
        </label>
      </div>

      <textarea
        v-model="sourceText"
        class="brain-import-dialog__textarea"
        rows="10"
        :placeholder="$t('brain.importDialog.sourcePlaceholder')"
      ></textarea>

      <textarea
        v-if="showTemplate"
        class="brain-import-dialog__template"
        :value="templatePrompt"
        rows="8"
        readonly
      ></textarea>

      <p v-if="parseError" class="brain-import-dialog__error">
        {{ parseError }}
      </p>

      <div v-if="preview" class="brain-import-dialog__preview">
        <div class="brain-import-dialog__preview-head">
          <strong>{{ $t('brain.importDialog.previewTitle') }}</strong>
          <span>{{ $t('brain.importDialog.nodeCount', { count: preview.flatNodes.length }) }}</span>
        </div>
        <CharacterBrainImportGraphPreview :parent-title="parentTitle || $t('brain.domainLabel.soul')" :nodes="preview.nodes" />
      </div>

      <div v-if="preview?.warnings.length" class="brain-import-dialog__notice">
        <p v-for="warning in preview.warnings" :key="`${warning.code}:${warning.path || warning.message}`">
          {{ warning.message }}
        </p>
      </div>

      <p v-if="preview?.conflicts.length" class="brain-import-dialog__notice">
        {{ $t('brain.importDialog.conflictNotice', { count: preview.conflicts.length }) }}
      </p>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  buildCharacterBrainImportPreview,
  parseCharacterBrainImportJson
} from '../../app/characterBrainImport'
import type {
  CharacterBrainCognitionNode,
  CharacterBrainImportConflictAction,
  CharacterBrainImportDraft
} from '../../types/characterBrain'
import AppFormDialog from '../common/AppFormDialog.vue'
import CharacterBrainImportGraphPreview from './CharacterBrainImportGraphPreview.vue'

const props = withDefaults(defineProps<{
  open: boolean
  parentId: string
  parentTitle?: string
  existingNodes: CharacterBrainCognitionNode[]
  saving?: boolean
}>(), {
  // 空串时模板/子组件回退到 i18n 的「灵魂」标签
  parentTitle: '',
  saving: false
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'submit', payload: {
    draft: CharacterBrainImportDraft
    conflictActions: Record<string, CharacterBrainImportConflictAction>
    defaultConflictAction: CharacterBrainImportConflictAction
  }): void
}>()

const sourceText = ref('')
const showTemplate = ref(false)

// i18n 待定：这是给用户复制去喂「外部 AI」生成导入 JSON 的模板提示词，非琅嬛后端模型指令。
// 是否随界面 i18n 本地化属批次级政策（同类还有多处「导出生成正文提示词」），待用户拍板后统一处理，暂保留中文。
const templatePrompt = [
  '你要把我提供的资料整理成”琅嬛角色大脑”的灵魂节点导入 JSON。',
  '',
  '重要：最终只输出一个合法 JSON 对象，不要输出 Markdown 代码块，不要输出解释文字，不要在 JSON 前后加任何说明。',
  '',
  '【名词解释】',
  '1. 角色大脑：某个角色知道什么、如何理解什么的结构化认知网。',
  '2. 灵魂节点：角色大脑里的一个知识、理解、判断或误解节点，可以继续拥有 children。',
  '3. 公共文档：文档库 / 世界树里的通用资料原文，属于公共资料本体，不属于某个角色私有内容。',
  '4. 公共引用节点：kind = "reference"，表示角色知道或引用了某份公共文档；只保存来源信息，不复制公共文档正文。',
  '5. 角色理解节点：kind = "private"，表示这个角色自己的理解、判断、误解、偏见或主观总结。',
  '6. 分组节点：kind = "group"，只负责组织下级节点，例如地点、组织、人物、事件、规则。',
  '',
  '【输出格式】',
  '{',
  '  "version": 1,',
  '  "rootTitle": "灵魂导入",',
  '  "nodes": [',
  '    {',
  '      "title": "节点标题，必填，短而清楚",',
  '      "summary": "一句话摘要，可为空字符串",',
  '      "kind": "group | reference | private",',
  '      "sourceDocumentId": "公共文档 ID；只有 reference 节点在已知时填写，否则省略",',
  '      "sourceDisplayPath": "公共文档显示路径；只有 reference 节点在已知时填写，否则省略",',
  '      "children": []',
  '    }',
  '  ]',
  '}',
  '',
  '【严格规则】',
  '1. nodes 必须是数组；children 如果出现也必须是数组。',
  '2. 每个节点必须有 title。',
  '3. kind 只能写 group、reference、private；不确定时写 group。',
  '4. 不要生成 id，系统会自动生成。',
  '5. 不要把公共文档正文复制进 summary；summary 只写简短摘要。',
  '6. 如果内容是目录、类别、章节标题，用 group。',
  '7. 如果内容来自公共文档且只是让角色知道这份资料，用 reference。',
  '8. 如果内容是角色自己的理解、推论、态度、误解、秘密记忆，用 private。',
  '9. 不要输出注释、尾逗号、单引号、undefined、NaN。',
  '',
  '【待整理资料】',
  '把这里替换成资料。'
].join('\n')

const parseResult = computed(() => parseCharacterBrainImportJson(sourceText.value))
const parsedDraft = computed(() => parseResult.value.ok ? parseResult.value.draft : null)
const parseError = computed(() => parseResult.value.ok ? '' : parseResult.value.error.message)
const preview = computed(() => parsedDraft.value
  ? buildCharacterBrainImportPreview(props.existingNodes, props.parentId, parsedDraft.value)
  : null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    sourceText.value = ''
    showTemplate.value = false
  }
)

function submitImport() {
  if (!parsedDraft.value || props.saving) return
  emit('submit', {
    draft: parsedDraft.value,
    conflictActions: {},
    defaultConflictAction: 'skip'
  })
}

function readJsonFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    sourceText.value = String(reader.result || '')
  }
  reader.readAsText(file, 'utf-8')
}
</script>

<style scoped>
.brain-import-dialog {
  display: grid;
  gap: 12px;
}

.brain-import-dialog__toolbar,
.brain-import-dialog__preview-head,
.brain-import-dialog__conflict {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brain-import-dialog__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-card);
  color: var(--morandi-text);
  font: inherit;
  font-size: 13px;
  padding: 0 12px;
  cursor: pointer;
}

.brain-import-dialog__file {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.brain-import-dialog__textarea,
.brain-import-dialog__template {
  width: 100%;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #fff);
  color: var(--morandi-text);
  font: inherit;
  line-height: 1.5;
  padding: 10px 12px;
  resize: vertical;
}

.brain-import-dialog__template {
  min-height: 220px;
}

.brain-import-dialog__error {
  margin: 0;
  color: var(--morandi-danger);
  font-size: 13px;
}

.brain-import-dialog__preview,
.brain-import-dialog__notice {
  display: grid;
  gap: 8px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
  padding: 10px 12px;
}

.brain-import-dialog__notice {
  color: var(--morandi-text-light);
  font-size: 13px;
}

.brain-import-dialog__notice p {
  margin: 0;
}

</style>
