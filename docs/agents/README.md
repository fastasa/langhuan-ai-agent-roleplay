# Agent 运行时知识正文

> `docs/agents/` 是所有“由人编写、给运行时 Agent 阅读”的稳定知识正文唯一真值。这里按 Agent 集中存放，方便统一审查；TypeScript 只负责精确装载、分节、授权和审计，不得保存同一正文的镜像常量。

## 真值边界

- `docs/agents/<Agent>/通用知识.md`：该 Agent 每次启动都要收到的稳定人工知识。一个 Agent 最多一份，不再拆成多个“基础规范”“纲领”“知识库”。
- `docs/agents/<Agent>/skills/<kebab-name>/SKILL.md`：只在特定任务命中后读取的操作知识；可按需使用同目录 `references/`、`scripts/` 和 `assets/`。
- `shared/agentSupplyManifest.ts`：声明哪个 profile 能读取哪个 Skill、常驻还是按需；只保存元数据和来源路径，不复制正文。
- `src/app/agentKnowledge/`、`src/app/agentSupply/`：精确读取 Markdown、解析 selector、执行授权与装配；不得内嵌可独立维护的知识正文。
- `docs/features/agent-platform/DEVELOPMENT.md`：跨 Agent 的供给架构与长期协议，不作为模型知识正文。
- `skill/agent-authoring/`：给开发者使用的项目 Skill，不作为某个运行时 Agent 的正文。
- 权限、作用域、事务、版本、幂等、validator 和会随当轮变化的任务指令必须由代码强制执行，不能下沉成 Markdown 提醒。
- 复杂任务的当前 TODO 由共享 `runAgentRuntime` 以保留工具和第 6 层动态快照提供；Agent 知识正文、manifest 与业务工具目录不得复制 `writeTaskTodo / updateTaskTodo`。

判断口径固定为：每轮都读的稳定人工知识写 `通用知识.md`；命中任务才读的知识写 Agent 自己的 Skill；决定能否读取、何时读取写 manifest/loader；必须强制成立的边界写代码与测试。

## 标准目录

```text
docs/agents/<Agent>/
├─ 通用知识.md                    # 可选但唯一；每轮常驻
├─ README.md                     # 可选；只给维护者，不进模型
└─ skills/
   └─ <kebab-name>/
      ├─ SKILL.md                # 必需；按需能力入口
      ├─ references/             # 可选；详细资料
      ├─ scripts/                # 可选；确定性脚本
      └─ assets/                 # 可选；模板与资源
```

运行时 Skill 采用 Codex Skill 的可读结构：目录名和 frontmatter `name` 使用小写 kebab-case，`SKILL.md` frontmatter 只保留 `name`、`description`。这样能统一审查和渐进披露写法，但这些目录属于琅嬛运行时，不是 Codex 自动发现的项目 Skill，因此不创建 `agents/openai.yaml`，也不能绕过 manifest/loader 自动获得授权。

某个任务型 mini Agent 如果没有额外常驻人工知识，可以不建空的 `通用知识.md`；它的动态任务、视角和正式载荷仍由代码生成。禁止为了凑结构把动态 prompt 复制进 Markdown。

## 运行时读取

- `通用知识.md` 和单文件 Skill 使用精确 raw import 或精确文件路径读取。
- 多专题 Skill 只能扫描自己 `skills/<name>/references/`；禁止扫描整个 Agent 目录，更禁止使用 `/docs/agents/**/*.md` 全库 glob。
- `README.md`、其它 Skill、其它 Agent 的知识不会因物理位置被自动读入。
- Skill loader 必须在 `AGENT_SKILL_LOADER_REGISTRY` 显式注册；manifest grant 在读取正文和构造工具目录前完成授权。
- required 正文缺失时按 manifest 失败；on-demand 缺 selector 或 selector 不存在时显式留 trace，禁止回退整本正文。

## 渐进披露

- `resident`：来自 `通用知识.md` 的高频短正文，进入 0 层。
- `on_demand`：`SKILL.md` 的名称和描述进入 1 层；命中 selector 后，所需正文进入 4 层。
- `unavailable`：profile 没有 grant，目录、正文和相关工具都不可见。

常驻、目录、已读正文的落点仍服从现役七层提示词协议。物理目录不是加载模式，文件存在也不等于模型可读。

## 当前 Agent 入口

- 提调：[`提调/通用知识.md`](./提调/通用知识.md)；环境细节在 [`environment-manual`](./提调/skills/environment-manual/SKILL.md)。
- 编剧：[`编剧/通用知识.md`](./编剧/通用知识.md)。现阶段方法论每轮都需要，暂不拆按需 Skill。
- 绘舆：[`绘舆/通用知识.md`](./绘舆/通用知识.md)；低频画法在 [`map-manual`](./绘舆/skills/map-manual/SKILL.md)。
- 造册：[`造册/通用知识.md`](./造册/通用知识.md)；进阶方案在 [`advanced-authoring`](./造册/skills/advanced-authoring/SKILL.md)。
- 鉴心：[`鉴心/通用知识.md`](./鉴心/通用知识.md)。人格校准、题目维护、训练、评测和版本方法论每轮常驻，正式数据只通过工具按需读写。
- 设问：[`设问/通用知识.md`](./设问/通用知识.md)。由鉴心派遣的后台制卷子 Agent，只负责质量门纠错、checkpoint 续跑与结构化交卷；终态回报会自动唤醒鉴心，父级定向续派最多一次。
- 星依：[`星依/通用知识.md`](./星依/通用知识.md)；专题知识和更新日志能力在 [`星依/skills/`](./星依/skills/)，维护说明见 [`星依/README.md`](./星依/README.md)。
- 日记 mini Agent：没有额外通用知识；项目背景按需读取 [`project-background`](./日记/skills/project-background/SKILL.md)。

## 维护验收

1. 先确认新增内容属于通用知识、按需 Skill、动态任务指令还是代码护栏。
2. 修改正文后同步 manifest/loader、Agent 平台专题文档和相关契约测试。
3. 搜索关键句，确认正文只存在于一个 Markdown 真值源；搜索旧路径，确认没有兼容副本。
4. 校验每个 `SKILL.md` 格式，运行相关知识审计、单元测试、类型检查和构建。
5. 新增或迁移 Agent 时，验证简单任务不建空清单、复杂任务第一动作批量建 TODO、未完成项不能正常结束；有输入框的宿主复用 `AgentTaskTodoCard.vue`。
