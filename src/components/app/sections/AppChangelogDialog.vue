<template>
  <AppModalShell
    :open="open"
    size="xl"
    height-preset="tall"
    :show-close="false"
    body-flush
    @close="closeAndMarkSeen"
  >
      <div class="changelog-dialog">
        <aside class="changelog-dialog__versions" :aria-label="t('changelog.versionList')">
          <h2>{{ t('changelog.versionList') }}</h2>
          <div class="changelog-dialog__timeline">
            <button
              v-for="entry in changelog.entries"
              :key="entryKey(entry)"
              type="button"
              class="changelog-dialog__version"
              :class="{ active: entryKey(entry) === activeKey }"
              @click="activeKey = entryKey(entry)"
            >
              <span class="changelog-dialog__dot"></span>
              <span class="changelog-dialog__version-main">
                <strong>{{ entry.date }}</strong>
                <span>{{ entry.version }}</span>
              </span>
            </button>
          </div>
          <div class="changelog-dialog__nomore">{{ t('changelog.noMore') }}</div>
        </aside>

        <main class="changelog-dialog__main">
          <button type="button" class="changelog-dialog__close" :aria-label="t('common.close')" @click="closeAndMarkSeen">×</button>
          <header class="changelog-dialog__header">
            <h1 id="changelog-dialog-title">{{ changelog.dialogTitle || '更新日志' }}</h1>
            <p>{{ changelog.dialogSubtitle || '快速查看本次版本改动' }}</p>
          </header>

          <div class="changelog-dialog__summary" :aria-label="t('changelog.summaryAria')">
            <div class="changelog-dialog__summary-pill changelog-dialog__summary-pill--feature">
              <span class="changelog-dialog__summary-icon">＋</span>
              <span>{{ t('changelog.toneFeature') }}</span>
              <strong>{{ activeSummary.feature }}</strong>
            </div>
            <div class="changelog-dialog__summary-pill changelog-dialog__summary-pill--polish">
              <span class="changelog-dialog__summary-icon">☆</span>
              <span>{{ t('changelog.tonePolish') }}</span>
              <strong>{{ activeSummary.polish }}</strong>
            </div>
            <div class="changelog-dialog__summary-pill changelog-dialog__summary-pill--fix">
              <span class="changelog-dialog__summary-icon">♢</span>
              <span>{{ t('changelog.toneFix') }}</span>
              <strong>{{ activeSummary.fix }}</strong>
            </div>
          </div>

          <div class="changelog-dialog__content">
            <section
              v-for="section in activeSections"
              :key="section.title"
              class="changelog-dialog__section"
              :class="`changelog-dialog__section--${section.tone}`"
            >
              <div class="changelog-dialog__section-title">
                <span>{{ section.title }}</span>
                <small>{{ t('changelog.itemCount', { count: section.items.length }) }}</small>
              </div>
              <ul>
                <li v-for="item in section.items" :key="item">{{ item }}</li>
              </ul>
            </section>
          </div>

          <footer class="changelog-dialog__actions">
            <button type="button" class="changelog-dialog__ghost" @click="closeAndMarkSeen">{{ t('changelog.later') }}</button>
            <button type="button" class="changelog-dialog__primary" @click="closeAndMarkSeen">{{ t('common.done') }}</button>
          </footer>
        </main>
      </div>
  </AppModalShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppChangelog } from '../../../app/appChangelog'
import AppModalShell from '../../common/AppModalShell.vue'

const props = defineProps<{
  open: boolean
  changelog: AppChangelog
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
// 复合 key（date|version），避免同一天两个版本时按 date 选中错乱
function entryKey(entry: { date: string; version: string }) {
  return `${entry.date}|${entry.version}`
}
const activeKey = ref(props.changelog.entries[0] ? entryKey(props.changelog.entries[0]) : '')

const activeEntry = computed(() => (
  props.changelog.entries.find((entry) => entryKey(entry) === activeKey.value)
  || props.changelog.entries[0]
))
const activeSections = computed(() => activeEntry.value?.sections || [])
const activeSummary = computed(() => (
  activeSections.value.reduce((result, section) => {
    result[section.tone] += section.items.length
    return result
  }, { feature: 0, polish: 0, fix: 0 })
))

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeKey.value = props.changelog.entries[0] ? entryKey(props.changelog.entries[0]) : ''
    }
  }
)

function closeAndMarkSeen() {
  emit('close')
}

</script>

<style scoped>
.changelog-dialog {
  width: 100%;
  height: min(690px, calc(93vh - 2px));
  display: grid;
  grid-template-columns: 174px minmax(0, 1fr);
  color: var(--morandi-text, #4f463f);
  overflow: hidden;
}

.changelog-dialog__versions {
  min-height: 0;
  padding: 22px 12px 18px;
  border-right: 1px solid rgba(218, 212, 202, 0.56);
  background: linear-gradient(90deg, rgba(246, 244, 239, 0.78), rgba(246, 244, 239, 0.32));
}

.changelog-dialog__versions h2,
.changelog-dialog__header h1 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.4;
  color: #4f463f;
}

.changelog-dialog__timeline {
  position: relative;
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.changelog-dialog__timeline::before {
  content: "";
  position: absolute;
  top: 15px;
  bottom: 15px;
  left: 7px;
  width: 1px;
  background: rgba(166, 165, 154, 0.28);
}

.changelog-dialog__version {
  position: relative;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  min-height: 50px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.changelog-dialog__version.active {
  background: rgba(229, 237, 226, 0.78);
}

.changelog-dialog__dot {
  position: relative;
  z-index: 1;
  width: 6px;
  height: 6px;
  margin-left: 4px;
  border-radius: 999px;
  background: #c4c7bd;
}

.changelog-dialog__version.active .changelog-dialog__dot {
  background: #6c9b7b;
  box-shadow: 0 0 0 4px rgba(108, 155, 123, 0.08);
}

.changelog-dialog__version-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0 7px 0 0;
}

.changelog-dialog__version-main strong {
  font-size: 0.8rem;
  color: #4f463f;
}

.changelog-dialog__version-main span {
  color: rgba(79, 70, 63, 0.72);
  font-size: 0.75rem;
}

.changelog-dialog__version.active .changelog-dialog__version-main span {
  color: #5f8268;
  font-weight: 650;
}

.changelog-dialog__nomore {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 13px 8px 0;
  color: rgba(79, 70, 63, 0.42);
  font-size: 0.78rem;
}

.changelog-dialog__nomore::before,
.changelog-dialog__nomore::after {
  content: "";
  height: 1px;
  flex: 1 1 auto;
  background: rgba(166, 165, 154, 0.18);
}

.changelog-dialog__main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  padding: 24px 28px 0;
}

.changelog-dialog__close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(79, 70, 63, 0.68);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.changelog-dialog__close:hover {
  background: rgba(130, 153, 135, 0.08);
}

.changelog-dialog__header {
  display: grid;
  gap: 5px;
  padding-right: 38px;
}

.changelog-dialog__header p {
  margin: 0;
  color: rgba(79, 70, 63, 0.55);
  font-size: 0.82rem;
}

.changelog-dialog__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 18px;
}

.changelog-dialog__summary-pill {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  background: rgba(244, 242, 238, 0.72);
  color: rgba(79, 70, 63, 0.78);
  font-size: 0.84rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.changelog-dialog__summary-pill strong {
  color: #3f3a34;
  font-size: 1rem;
}

.changelog-dialog__summary-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid currentColor;
  border-radius: 999px;
  font-size: 0.92rem;
  line-height: 1;
}

.changelog-dialog__summary-pill--feature .changelog-dialog__summary-icon {
  color: #6f9a72;
}

.changelog-dialog__summary-pill--polish .changelog-dialog__summary-icon {
  color: #d0a33f;
}

.changelog-dialog__summary-pill--fix .changelog-dialog__summary-icon {
  color: #a38bd6;
}

.changelog-dialog__content {
  min-height: 0;
  margin-top: 18px;
  overflow: auto;
  padding-right: 4px;
}

.changelog-dialog__section {
  display: grid;
  gap: 10px;
  padding: 15px 0;
  border-top: 1px solid rgba(166, 165, 154, 0.2);
}

.changelog-dialog__section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.88rem;
  font-weight: 700;
}

.changelog-dialog__section-title span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.changelog-dialog__section-title span::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #6f9a72;
}

.changelog-dialog__section--polish .changelog-dialog__section-title span::before {
  background: #d0a33f;
}

.changelog-dialog__section--fix .changelog-dialog__section-title span::before {
  background: #a38bd6;
}

.changelog-dialog__section-title small {
  padding: 3px 9px;
  border: 1px solid rgba(166, 165, 154, 0.18);
  border-radius: 9px;
  color: rgba(79, 70, 63, 0.46);
  font-size: 0.72rem;
  font-weight: 600;
}

.changelog-dialog ul {
  display: grid;
  gap: 7px;
  margin: 0;
  padding-left: 18px;
  color: rgba(79, 70, 63, 0.72);
  font-size: 0.84rem;
  line-height: 1.68;
}

.changelog-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 0 16px;
  border-top: 1px solid rgba(166, 165, 154, 0.16);
  background: rgba(250, 248, 244, 0.98);
}

.changelog-dialog__ghost,
.changelog-dialog__primary {
  min-width: 88px;
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
}

.changelog-dialog__ghost {
  border: 1px solid rgba(166, 165, 154, 0.22);
  background: rgba(255, 255, 255, 0.46);
  color: rgba(79, 70, 63, 0.62);
}

.changelog-dialog__primary {
  border: 1px solid rgba(96, 132, 101, 0.82);
  background: #6f936f;
  color: #fff;
}

@media (max-width: 760px) {
  .changelog-dialog {
    height: min(720px, 90vh);
    grid-template-columns: 1fr;
  }

  .changelog-dialog__versions {
    padding: 18px 18px 12px;
    border-right: 0;
    border-bottom: 1px solid rgba(218, 212, 202, 0.56);
  }

  .changelog-dialog__timeline {
    grid-auto-flow: column;
    grid-auto-columns: minmax(180px, 1fr);
    overflow-x: auto;
  }

  .changelog-dialog__timeline::before,
  .changelog-dialog__nomore {
    display: none;
  }

  .changelog-dialog__main {
    padding: 22px 18px 0;
  }

  .changelog-dialog__summary {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
