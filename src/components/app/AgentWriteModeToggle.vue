<template>
  <button
    type="button"
    class="agent-write-mode-toggle"
    :class="{ 'agent-write-mode-toggle--auto': autoApprove }"
    :title="autoApprove ? autoHint : confirmHint"
    :aria-label="autoApprove ? autoLabel : confirmLabel"
    :disabled="disabled"
    @click="emit('toggle')"
  >{{ autoApprove ? autoGlyph : confirmGlyph }}</button>
</template>

<script setup lang="ts">
/**
 * Agent 写权限模式的权威圆点。
 * 只负责显示与切换意图；是否直接放行必须由正式 confirmWrite 通道读取同一份模式真值。
 */
withDefaults(defineProps<{
  autoApprove: boolean
  autoLabel: string
  confirmLabel: string
  autoHint: string
  confirmHint: string
  autoGlyph: string
  confirmGlyph: string
  disabled?: boolean
}>(), {
  disabled: false
})

const emit = defineEmits<{
  (event: 'toggle'): void
}>()
</script>

<style scoped>
.agent-write-mode-toggle {
  position: relative;
  z-index: 2;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--morandi-accent, #5C8A5C);
  border-radius: 999px;
  background: var(--morandi-accent, #5C8A5C);
  color: #fff;
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.agent-write-mode-toggle:hover:not(:disabled) { filter: brightness(1.05); }

/* 自动放行是危险态：写操作不再逐次弹确认，保持星依浮坞现役红色语义。 */
.agent-write-mode-toggle--auto {
  border-color: var(--morandi-danger, #c0564f);
  background: var(--morandi-danger, #c0564f);
}

.agent-write-mode-toggle:disabled { opacity: .35; cursor: default; }

:global(.floating-workspace-window[data-theme='dark']) .agent-write-mode-toggle {
  border-color: color-mix(in srgb, var(--morandi-accent, #5C8A5C) 55%, #14130f);
  background: color-mix(in srgb, var(--morandi-accent, #5C8A5C) 55%, #14130f);
  color: #ded8cc;
}

:global(.floating-workspace-window[data-theme='dark']) .agent-write-mode-toggle--auto {
  border-color: color-mix(in srgb, var(--morandi-danger, #C0665A) 58%, #14130f);
  background: color-mix(in srgb, var(--morandi-danger, #C0665A) 58%, #14130f);
  color: #e8ddd5;
}
</style>
