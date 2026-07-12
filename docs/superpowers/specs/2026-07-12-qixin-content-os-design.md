# 齐鑫 Content OS 设计规格

## 目标

建立一个本地优先、证据驱动的个人内容分发中台，把 GitHub 进展、项目文档、截图、视频、语音和手动记录整理为真实事件卡，再生成朋友圈、X、小红书和抖音四个平台的发布包。

## V1 成功标准

系统能读取一条透明工地项目进展，生成事实摘要，整理成真实事件卡，由用户补充个人感受，形成母内容，生成四个平台版本，关联截图或 commit 证据，并导出发布包。

## 核心原则

- 事实优先，不虚构数据。
- 不把计划写成完成，不把本地测试写成正式上线。
- 用户手动修改优先，AI 不覆盖人工内容。
- 素材默认私有，发布前必须人工确认。
- 本地优先，V1 不做多租户、支付与自动发布。
- 一次创作母内容，多平台只做表达适配，不改变事实。

## 信息架构

- `/dashboard`：本周素材、待写、待发布、发布数据。
- `/inbox`：素材收件箱。
- `/events`：真实事件卡。
- `/content`：母内容列表。
- `/content/[id]`：母内容与平台版本编辑。
- `/assets`：证据和媒体资产。
- `/publish`：发布工作台。
- `/calendar`：内容日历。
- `/analytics`：发布复盘。
- `/settings`：AI、GitHub、项目、语气和隐私。

## 核心实体

- `Project`：内容来源项目。
- `SourceItem`：commit、截图、语音、文档或手动记录。
- `EventCard`：发生了什么、为什么做、问题、结果、感受和证据。
- `MasterContent`：统一母稿。
- `PlatformVariant`：朋友圈、X、小红书、抖音版本。
- `Asset`：图片、视频、链接和 commit 证据。
- `PublishRecord`：发布状态、链接和数据。
- `ContentRule`：语气、隐私、禁用词和平台偏好。

## 状态流

`inbox -> selected -> drafting -> producing -> review -> ready -> published -> repurpose -> archived`

## 技术架构

- Next.js App Router、TypeScript、Tailwind CSS。
- Prisma + SQLite，本地数据库。
- Zod 校验输入与 AI 结构化输出。
- 本地媒体目录存放素材，数据库只存元数据和相对路径。
- GitHub 接入先采用显式配置仓库和手动同步，后续再扩展 webhook。
- AI Provider 通过接口隔离，V1 可先使用 mock/manual provider 跑通全链路。

## 首批项目

- GEO Monitor SaaS
- 晟景装饰官网
- 透明工地小程序
- AI 视频画布

## V1 不做

自动登录与发布、团队协作、订阅支付、多租户、全自动视频生成、自动抓取所有聊天、未经确认的私人内容公开。
