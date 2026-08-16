import { config } from '@vue/test-utils'
import { beforeEach } from 'vitest'
import { i18n } from '../../src/i18n'

config.global.plugins = [i18n]

beforeEach(() => {
  i18n.global.locale.value = 'zh'
})
