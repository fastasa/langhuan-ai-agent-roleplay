# 星依日记 mini Agent 知识结构

这个 Agent 的视角、日期、写作任务和当天素材都会随调用变化，继续由 `server/services/xingyiDiaryService.ts` 生成，不复制成常驻 Markdown。

当前没有额外的稳定常驻人工知识，因此不创建空的 `通用知识.md`。素材里可能遇到的项目内部概念属于按需知识，唯一源为 `skills/project-background/SKILL.md`，服务端通过 `xingyiDiaryKnowledge.ts` 精确读取。
