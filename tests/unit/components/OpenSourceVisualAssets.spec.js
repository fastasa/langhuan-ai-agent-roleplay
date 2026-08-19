import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectPath = (...parts) => resolve(process.cwd(), ...parts)
const runtimeAssets = [
  'src/assets/langhuan-icon.png',
  'src/assets/illustrations/new-character-feather-pen.png',
  'src/assets/illustrations/new-character-upload-placeholder.png',
  'src/assets/illustrations/role-brain-empty-branch.png',
  'src/assets/illustrations/role-empty-arrow.png',
  'src/assets/illustrations/role-empty-book.png',
  'public/xingyi-pet/xingyi-pet-idle-v2.png',
  'public/xingyi-pet/runtime/spritesheet.webp'
]

describe('开源版正式视觉资产', () => {
  it('完整包含应用图标、角色界面插画和桌宠运行时图集', () => {
    for (const relativePath of runtimeAssets) {
      const absolutePath = projectPath(relativePath)
      expect(existsSync(absolutePath), relativePath).toBe(true)
      expect(statSync(absolutePath).size, relativePath).toBeGreaterThan(1000)
    }
  })

  it('组件引用正式素材，不再引用临时 SVG 占位图', () => {
    const iconSource = readFileSync(projectPath('src/components/common/LanghuanIcon.vue'), 'utf8')
    const petSource = readFileSync(projectPath('src/components/app/XingyiDesktopPet.vue'), 'utf8')
    const roleSource = readFileSync(projectPath('src/components/app/chat/AppChatSection.vue'), 'utf8')

    expect(iconSource).toContain("../../assets/langhuan-icon.png")
    expect(petSource).toContain("/xingyi-pet/xingyi-pet-idle-v2.png")
    expect(roleSource).toContain("../../../assets/illustrations/role-empty-book.png")
    expect(existsSync(projectPath('src/assets/langhuan-icon.svg'))).toBe(false)
    expect(existsSync(projectPath('public/xingyi-pet/runtime/mascot.svg'))).toBe(false)
  })
})
