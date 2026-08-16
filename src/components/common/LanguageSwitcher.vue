<template>
  <!-- 语言切换器：分段按钮。批次 1 起放入设置区/侧栏。切换即时生效并持久化到 localStorage。 -->
  <div class="langhuan-lang-switcher" role="group" :aria-label="$t('common.settings')">
    <button
      v-for="loc in locales"
      :key="loc"
      type="button"
      class="langhuan-lang-switcher__btn"
      :class="{ 'is-active': loc === current }"
      :aria-pressed="loc === current"
      @click="choose(loc)"
    >
      {{ labels[loc] }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, LOCALE_LABELS, setLocale, type SupportedLocale } from '../../i18n'

const { locale } = useI18n()
const locales = SUPPORTED_LOCALES
const labels = LOCALE_LABELS

const current = computed<SupportedLocale>(() => locale.value as SupportedLocale)

function choose(loc: SupportedLocale): void {
  setLocale(loc)
}
</script>

<style scoped>
.langhuan-lang-switcher {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
}

.langhuan-lang-switcher__btn {
  min-width: 72px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--langhuan-dialog-secondary-text, #4f4034);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.langhuan-lang-switcher__btn:hover:not(.is-active) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.langhuan-lang-switcher__btn.is-active {
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.langhuan-lang-switcher__btn:focus-visible {
  outline: 2px solid var(--langhuan-dialog-focus-ring, rgba(79, 134, 124, 0.32));
  outline-offset: 2px;
}
</style>
