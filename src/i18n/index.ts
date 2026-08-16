/**
 * i18n/index.ts
 * 界面多语言底座：中文(zh)/英文(en)/日文(ja)。
 * 边界：只管「界面文案」。角色对话由大模型实时生成、prompt/纲领等模型指令保持中文，均不走这里。
 * 语言偏好是设备级偏好，纯 localStorage 持久化 + 浏览器语言兜底，不进 settings 快照、不进 langhuan.db。
 */
import { createI18n } from 'vue-i18n'
import { zh } from './locales/zh'
import { en } from './locales/en'
import { ja } from './locales/ja'

export const SUPPORTED_LOCALES = ['zh', 'en', 'ja'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/** 语言展示名（用于切换器 UI，用各自母语写，出海时对当地用户更友好） */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語'
}

const LOCALE_STORAGE_KEY = 'langhuan_locale'
const DEFAULT_LOCALE: SupportedLocale = 'zh'

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** 首屏语言：已保存偏好 > 浏览器语言 > 默认中文 */
function detectInitialLocale(): SupportedLocale {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isSupportedLocale(saved)) return saved
    const nav = (window.navigator.language || '').toLowerCase()
    if (nav.startsWith('ja')) return 'ja'
    if (nav.startsWith('en')) return 'en'
    if (nav.startsWith('zh')) return 'zh'
  } catch {
    /* 无 window/localStorage 时兜底默认 */
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { zh, en, ja },
  // 缺失键：静默回退到中文；开发期打印警告便于查漏
  missingWarn: import.meta.env?.DEV ?? false,
  fallbackWarn: false
})

export function getLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale
}

export function setLocale(locale: SupportedLocale): void {
  if (!isSupportedLocale(locale)) return
  i18n.global.locale.value = locale
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* 持久化失败不阻断切换 */
  }
  syncHtmlLang(locale)
}

function syncHtmlLang(locale: SupportedLocale): void {
  try {
    document.documentElement.setAttribute('lang', locale)
  } catch {
    /* SSR/无 document 兜底 */
  }
}

// 首屏同步 <html lang>，利于无障碍与浏览器行为
syncHtmlLang(getLocale())
