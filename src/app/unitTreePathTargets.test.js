import { describe, expect, it } from 'vitest'
import {
  buildUnitTreePathInput,
  chooseUnitTreeMarkdownFileName,
  isGeneratedUnitTreeFileName,
  normalizeUnitTreePathInput,
  syncUnitTreeCreateTargetFromPath
} from './unitTreePathTargets'

describe('unitTreePathTargets', () => {
  it('normalizes document and role tree path inputs with their own roots', () => {
    expect(normalizeUnitTreePathInput('世界树 / 亚什基诺 / 交流会', { rootLabel: '世界树' })).toBe('/世界树/亚什基诺/交流会')
    expect(normalizeUnitTreePathInput('/星依 / 灵魂', { rootLabel: '星依', leadingSlash: false, trailingSlashWhenRoot: true })).toBe('星依/灵魂')
    expect(buildUnitTreePathInput('世界树', ['亚什基诺', '交流会'])).toBe('/世界树/亚什基诺/交流会')
  })

  it('keeps the stable menu target when the user did not edit the initial path', () => {
    const resolved = syncUnitTreeCreateTargetFromPath({
      pathInput: '/世界树/亚什基诺/交流会',
      initialPathInput: '世界树/亚什基诺/交流会',
      preserveCurrentTarget: true,
      currentTarget: { folderPath: '/亚什基诺', targetDocumentId: 'doc-exchange' },
      normalizePathInput: (value) => normalizeUnitTreePathInput(value, { rootLabel: '世界树' }),
      resolveTarget: () => ({ folderPath: '/wrong', targetDocumentId: 'doc-wrong' })
    })

    expect(resolved.target).toEqual({ folderPath: '/亚什基诺', targetDocumentId: 'doc-exchange' })
  })

  it('uses the edited path once the user changes it', () => {
    const resolved = syncUnitTreeCreateTargetFromPath({
      pathInput: '/世界树/亚什基诺/新位置',
      initialPathInput: '/世界树/亚什基诺/交流会',
      preserveCurrentTarget: true,
      currentTarget: { folderPath: '/亚什基诺', targetDocumentId: 'doc-exchange' },
      normalizePathInput: (value) => normalizeUnitTreePathInput(value, { rootLabel: '世界树' }),
      resolveTarget: () => ({ folderPath: '/亚什基诺/新位置', targetDocumentId: '' })
    })

    expect(resolved.target).toEqual({ folderPath: '/亚什基诺/新位置', targetDocumentId: '' })
  })

  it('replaces generated placeholder filenames with title-derived names', () => {
    expect(isGeneratedUnitTreeFileName('新桠-3.md')).toBe(true)
    expect(chooseUnitTreeMarkdownFileName({
      currentFileName: '新桠.md',
      title: '交流会',
      slugify: (value) => String(value || '').trim()
    })).toBe('交流会.md')
    expect(chooseUnitTreeMarkdownFileName({
      currentFileName: '组织架构.md',
      title: '交流会',
      slugify: (value) => String(value || '').trim()
    })).toBe('组织架构.md')
  })
})
