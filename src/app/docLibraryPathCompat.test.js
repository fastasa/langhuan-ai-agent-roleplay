import { describe, expect, it } from 'vitest'
import {
  buildDocLibraryFolderPathChain,
  getDocLibraryDisplayFileName,
  getDocLibraryDocumentSlugFromPath,
  getDocLibraryParentFolderPath,
  normalizeDocLibraryDisplayPath,
  replaceDocLibraryPathPrefix,
  splitDocLibraryDisplayPath
} from './docLibraryPathCompat.ts'

describe('docLibraryPathCompat', () => {
  it('normalizes readable document paths without changing their compatibility role', () => {
    expect(splitDocLibraryDisplayPath(' /世界观 / 组织 / 夜巡者.md ')).toEqual(['世界观', '组织', '夜巡者.md'])
    expect(normalizeDocLibraryDisplayPath('世界观//组织/夜巡者.md')).toBe('/世界观/组织/夜巡者.md')
    expect(getDocLibraryDisplayFileName('/世界观/组织/夜巡者.md')).toBe('夜巡者.md')
    expect(getDocLibraryDocumentSlugFromPath('/世界观/组织/夜巡者.md')).toBe('夜巡者')
  })

  it('derives parent folder paths with explicit fallback for page boundaries', () => {
    expect(getDocLibraryParentFolderPath('/世界观/组织/夜巡者.md', '/文档')).toBe('/世界观/组织')
    expect(getDocLibraryParentFolderPath('/夜巡者.md', '/文档')).toBe('/文档')
    expect(buildDocLibraryFolderPathChain(['世界观', '组织'])).toEqual(['/世界观', '/世界观/组织'])
  })

  it('replaces path prefixes through the shared compatibility helper', () => {
    expect(replaceDocLibraryPathPrefix('/世界观/旧枝/条目.md', '/世界观/旧枝', '/世界观/新枝'))
      .toBe('/世界观/新枝/条目.md')
    expect(replaceDocLibraryPathPrefix('/世界观/旧枝条目.md', '/世界观/旧枝', '/世界观/新枝'))
      .toBe('/世界观/旧枝条目.md')
  })
})
