<template>
  <ClickSpark
    class="langhuan-browser-frame"
    spark-color="#60764f"
    :spark-size="9"
    :spark-min-size="5"
    :spark-max-size="14"
    :spark-radius="16"
    :spark-count="8"
    :duration="420"
    :extra-scale="1"
  >
    <LanghuanLandingPage v-if="isLandingRoute" />
    <AppNotFound v-else-if="isRemovedRoute" />
    <PixelStudioPage v-else-if="isPixelRoute" />
    <WorkspaceShellRoot v-else key="local-workspace" />
  </ClickSpark>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import ClickSpark from './components/common/ClickSpark.vue'
import AppBootLoading from './components/common/AppBootLoading.vue'
import AppNotFound from './components/common/AppNotFound.vue'
import { createXingyiDiaryAutoTrigger } from './app/xingyiDiaryAutoTrigger'

const WorkspaceShellRoot = defineAsyncComponent({
  loader: () => import('./components/WorkspaceShellRoot.vue'),
  loadingComponent: AppBootLoading,
  delay: 0
})
const LanghuanLandingPage = defineAsyncComponent({
  loader: () => import('./components/landing/LanghuanLandingPage.vue'),
  loadingComponent: AppBootLoading,
  delay: 0
})
const PixelStudioPage = defineAsyncComponent({
  loader: () => import('./components/app/pixel/PixelStudioWorkspacePage.vue'),
  loadingComponent: AppBootLoading,
  delay: 0
})
const diaryAutoTrigger = createXingyiDiaryAutoTrigger({
  isEligible: () => true,
  onError: (error) => console.error('[星依日记] 网页活跃补生成检查失败：', error)
})
const currentPath = ref(typeof window === 'undefined' ? '/' : window.location.pathname)

const isPixelRoute = computed(() => currentPath.value === '/pixel')
const isLandingRoute = computed(() => currentPath.value === '/about')
const isRemovedRoute = computed(() => currentPath.value === '/admin')

function syncRoute() {
  currentPath.value = window.location.pathname
}

onMounted(() => {
  window.addEventListener('popstate', syncRoute)
  if (!isLandingRoute.value && !isRemovedRoute.value) {
    diaryAutoTrigger.start()
  }
  void diaryAutoTrigger.checkNow()
})

onUnmounted(() => {
  window.removeEventListener('popstate', syncRoute)
  diaryAutoTrigger.stop()
})
</script>
