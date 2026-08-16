<!--
  components/app/XingyiChatBubble.vue

  星依聊天气泡共享组件：调用方只传 role + 内容，样式、投影与圆角在这里统一维护。

  文字消息统一通过 content 进入项目共享 Markdown renderer；图片附件、发送失败提示等
  结构化附加内容仍由默认 slot 承载。这样浮坞和工作区专业 Agent 只有一份
  气泡正文渲染协议，交互卡则不会被误当成 Markdown 字符串。
-->
<template>
  <div class="xingyi-chat-bubble__row" :class="`xingyi-chat-bubble__row--${role}`">
    <div class="xingyi-chat-bubble">
      <div
        v-if="renderedContent"
        class="xingyi-chat-bubble__markdown chat-text"
        v-html="renderedContent"
      ></div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdownToHtml } from '../../utils/markdown'

const props = withDefaults(defineProps<{
  role: 'user' | 'assistant'
  content?: string
}>(), {
  content: ''
})

const renderedContent = computed(() => renderMarkdownToHtml(props.content))
</script>

<style scoped>
.xingyi-chat-bubble__row {
  display: flex;
}

.xingyi-chat-bubble__row--user {
  justify-content: flex-end;
}

.xingyi-chat-bubble__row--assistant {
  justify-content: flex-start;
}

.xingyi-chat-bubble {
  max-width: 86%;
  padding: 7px 11px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--morandi-text, #333);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Markdown 元素复用主聊天 .chat-text 的排版真值；气泡只保留自己的紧凑字号。 */
.xingyi-chat-bubble__markdown {
  min-width: 0;
  font-size: inherit;
  color: inherit;
}

/* 气泡尾角互相朝向（用户右下收、星依左下收），纸面卡加 1px 棱光接住灯光——与正式浮坞逐字节同源。 */
.xingyi-chat-bubble__row--user .xingyi-chat-bubble {
  border-radius: 10px 10px 3px 10px;
  background: var(--morandi-user-bubble, #d8cfc4);
}

.xingyi-chat-bubble__row--assistant .xingyi-chat-bubble {
  border: 1px solid color-mix(in srgb, var(--morandi-border, #e0e0e0) 70%, transparent);
  border-radius: 10px 10px 10px 3px;
  background: var(--morandi-card, #fffdf8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), var(--lh-edge-light, inset 0 1px 0 rgba(255, 255, 255, 0.55));
}
</style>
