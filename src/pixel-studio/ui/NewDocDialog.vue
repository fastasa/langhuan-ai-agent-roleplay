<template>
  <PixelDialog title="新建文档" width="360px" @close="$emit('close')">
    <label class="pixel-field">
      <span>名称</span>
      <input v-model="name" type="text" />
    </label>
    <label class="pixel-field">
      <span>宽（8~512）</span>
      <input v-model.number="width" type="number" min="8" max="512" />
    </label>
    <label class="pixel-field">
      <span>高（8~512）</span>
      <input v-model.number="height" type="number" min="8" max="512" />
    </label>
    <template #footer>
      <button type="button" @click="$emit('close')">取消</button>
      <button type="button" class="pixel-dialog__primary" @click="onConfirm">创建</button>
    </template>
  </PixelDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { clampNewDocSize } from './pixelUiUtils'
import PixelDialog from './PixelDialog.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', payload: { name: string; width: number; height: number }): void
}>()

const name = ref('未命名')
const width = ref(64)
const height = ref(64)

function onConfirm() {
  const finalName = name.value.trim() || '未命名'
  emit('confirm', { name: finalName, width: clampNewDocSize(width.value), height: clampNewDocSize(height.value) })
}
</script>

<style scoped>
.pixel-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
</style>
