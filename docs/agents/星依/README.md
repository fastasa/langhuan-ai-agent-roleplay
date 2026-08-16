# 星依知识架构

> `通用知识.md` 是星依每轮收到的常驻人工知识唯一真值；通用知识专题放在 `skills/knowledge-topics/`，有独立工具和授权边界的专项流程放在同级专门 Skill。其它 Agent 的 Markdown 不进入星依 list/search/read 集合。

> 本文件给维护者阅读，刻意不写三级标题，因此不会被运行时解析成星依知识主题。正式维护流程见 `skill/xingyi-knowledge-maintenance/SKILL.md`。

## 运行时分层

星依知识采用四层真值：

1. 常驻通用知识：`通用知识.md`。只放每轮都必须遵守的任务拆解、边界、安全和连续工作规则；`xingyiCharter.ts` 只装载正文并替换代码真值占位符。
2. 主题目录与候选检索：`listXingyiKnowledgeTopics` 浏览目录，`searchXingyiKnowledge` 用“对象 + 动作 + 资料源/写入目标”返回少量候选。两者只给 `topicId`、标题、来源和摘要。
3. 按需精读：正文位于 `skills/knowledge-topics/references/`，`readXingyiKnowledgeTopic` 按稳定 `topicId` 精确返回一个主题全文。`topicId` 格式为“来源文件（不含 `.md`）::完整标题”，不同文件同名标题不会串源。
4. 专项 Skill：例如 `skills/doc-library-editing/SKILL.md`，由 manifest 授权并经专用读取工具按需装载；复杂操作规则不复制回常驻知识或 TypeScript。
5. 实时真值：当轮工具目录、schema 与业务 `list/read/search` 结果。角色、分组、文档、会话、地图等当前状态不复制进知识文件。

运行时只读取 `skills/knowledge-topics/references/*.md`，不读取 `README.md`、`通用知识.md` 或 SKILL.md，并把每个 `###` 小节视为一个主题。搜索不倾倒多篇全文；未命中也不倾倒全目录。

## 放置规则

- 每次任务都要遵守的短规则写入 `通用知识.md`。
- 某类任务的操作流程、术语边界、报错处置写入 `skills/knowledge-topics/references/` 的专题。
- 会变化的名称、ID、成员、状态和能力清单不写死，改为指向对应读取工具。
- 一次性过程、历史原因和临时证据分别进入计划归档或 `docs/tmp/`，不混进运行时主题。

每个主题应写清适用条件、资料来源、写入目标、禁止误用和失败下一跳。标题在目录内保持唯一稳定；新增重要主题必须补基础、跨域、冷门或负向查询回归。

## 当前入口

- `通用知识.md`：星依每次运行都收到的人工知识。
- `skills/knowledge-topics/SKILL.md`：按需知识 Skill 入口；详细主题在其 `references/`。
- `skills/doc-library-editing/SKILL.md`：文档库全局寻址、枝概览、单位 CRUD 与编译页同步的专项按需 Skill。
- `skills/relation-hint-authoring/SKILL.md`：生成、优化或精修关系提示前强制读取的语法、谓词、证据与复诊专项 Skill。
- `skill/xingyi-knowledge-maintenance/`：维护规范、质量标准、查询评测矩阵与自动审计工具。

## 维护验收

修改知识、纲领或知识查询工具后至少运行：

```powershell
npm run knowledge:xingyi:audit
npx vitest run tests/unit/app/xingyiKnowledge.spec.js tests/unit/app/xingyiAgentHarness.spec.js --testTimeout=20000
npm run type-check
npm run build
```

审计负责检查空主题、重复 `topicId`、同名标题、超长主题、README 泄漏、三层工具缺失以及 skill/索引/触发入口漂移。完整维护口径以 skill 为准。
