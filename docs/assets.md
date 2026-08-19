# 素材与第三方说明

## 随项目分发的自有资产

下列视觉素材均为琅嬛项目自有素材，权利人已确认可以随开源版本再分发；它们与项目代码一同按 `AGPL-3.0-only` 提供：

- `src/assets/langhuan-icon.png`：琅嬛应用图标；
- `src/assets/illustrations/new-character-feather-pen.png`：角色创建弹窗标题插画；
- `src/assets/illustrations/new-character-upload-placeholder.png`：角色头像上传占位插画；
- `src/assets/illustrations/role-brain-empty-branch.png`：角色大脑空态插画；
- `src/assets/illustrations/role-empty-arrow.png`：角色页空态引导箭头；
- `src/assets/illustrations/role-empty-book.png`：角色页空态书本插画；
- `public/xingyi-pet/xingyi-pet-idle-v2.png`：星依桌宠静态回退图；
- `public/xingyi-pet/runtime/spritesheet.webp`：星依桌宠运行时动画图集；
- `public/xingyi-pet/runtime/manifest.json`：动画帧与时序清单。

纸张质感由纯 CSS 渐变生成；系统字体只引用操作系统已有字体，不随发行包分发字体文件。

首发版不携带私人截图、角色立绘、聊天附件、世界观图片、音频、模型或演示数据库。

## Lucide

像素工作室和部分界面使用本地内联的 Lucide 图标路径。`src/pixel-studio/ui/icons.ts` 保留了 Lucide Contributors 的 ISC 许可证与版权声明。其它标注为“Lucide 风格”的自绘线条不声称来自 Lucide 原始文件。

## 新增资产规则

新增可分发资产必须记录来源、作者、许可证、允许的修改和实际修改。无法证明再分发权利的资产不得进入仓库或发行包。
