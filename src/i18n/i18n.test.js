import { describe, it, expect, beforeEach } from 'vitest'
import { i18n, setLocale, getLocale, SUPPORTED_LOCALES } from './index.ts'

const { t } = i18n.global

beforeEach(() => {
  i18n.global.locale.value = 'zh'
})

describe('i18n 底座', () => {
  it('三种语言的所有命名空间键完全对齐（无漏译/多译）', () => {
    const zhMsg = i18n.global.messages.value.zh
    const enMsg = i18n.global.messages.value.en
    const jaMsg = i18n.global.messages.value.ja
    const namespaces = Object.keys(zhMsg)
    // 顶层命名空间三语一致
    expect(Object.keys(enMsg).sort()).toEqual(namespaces.slice().sort())
    expect(Object.keys(jaMsg).sort()).toEqual(namespaces.slice().sort())
    // 每个命名空间内键一致
    for (const ns of namespaces) {
      const zhKeys = Object.keys(zhMsg[ns]).sort()
      expect(Object.keys(enMsg[ns]).sort(), `en.${ns} 键不对齐`).toEqual(zhKeys)
      expect(Object.keys(jaMsg[ns]).sort(), `ja.${ns} 键不对齐`).toEqual(zhKeys)
    }
  })

  it('公共词典按当前语言解析', () => {
    i18n.global.locale.value = 'zh'
    expect(t('common.confirm')).toBe('确认')
    i18n.global.locale.value = 'en'
    expect(t('common.confirm')).toBe('Confirm')
    i18n.global.locale.value = 'ja'
    expect(t('common.confirm')).toBe('確認')
  })

  it('缺失键回退到中文 fallback', () => {
    i18n.global.locale.value = 'en'
    // 不存在的键：vue-i18n 回退策略下不应抛错
    expect(() => t('common.__missing_key__')).not.toThrow()
  })

  it('setLocale 持久化到 localStorage 并同步 getLocale', () => {
    setLocale('ja')
    expect(getLocale()).toBe('ja')
    expect(window.localStorage.getItem('langhuan_locale')).toBe('ja')
    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(window.localStorage.getItem('langhuan_locale')).toBe('en')
  })

  it('setLocale 拒绝非法语言，不改变当前值', () => {
    setLocale('en')
    // @ts-expect-error 故意传非法值
    setLocale('fr')
    expect(getLocale()).toBe('en')
  })

  it('支持的语言列表为 zh/en/ja', () => {
    expect([...SUPPORTED_LOCALES]).toEqual(['zh', 'en', 'ja'])
  })
})
