<template>
  <div class="mobile-sone-tree">
    <MobileSoneTreeNode
      v-for="(node, index) in data"
      :key="node.key ?? index"
      :node="node"
      :depth="0"
      :force-all="forceAll"
      :selection-mode="selectionMode"
      @leaf="$emit('leaf', $event)"
      @long-press="$emit('longPress', $event)"
      @toggle-select="$emit('toggleSelect', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import MobileSoneTreeNode from './MobileSoneTreeNode.vue'
import type { MobileSoneNode } from './mobileWorkspaceTypes'

withDefaults(
  defineProps<{
    data: MobileSoneNode[]
    forceAll?: boolean | null
    selectionMode?: boolean
  }>(),
  {
    forceAll: null,
    selectionMode: false
  }
)

defineEmits<{
  leaf: [node: MobileSoneNode]
  longPress: [node: MobileSoneNode]
  toggleSelect: [node: MobileSoneNode]
}>()
</script>

<style scoped>
.mobile-sone-tree {
  position: relative;
  width: 100%;
}
</style>
