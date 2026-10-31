# dsh-review-relay 需求文档

> 一句话：把自动审查 agent 的拒绝意见，连同用户在拒绝时写下的说明，可靠地送进正在工作的主 agent 上下文，并让审查意见以中文呈现。

> **2026-10-31 实现修订（0.2.0）：** 默认转交目标已从 `agent.inject()` 合成用户消息改为 `tools/post-execute` 追加到被拒工具调用的 `tool/result` 内容，避免主对话里出现一条伪用户消息；`delivery: 'inject' | 'followup'` 作为旧模式保留。本文档其余部分保留初稿的 inject 描述作为需求历史，当前行为以 [README](../README.md) 和 [CHANGELOG](../CHANGELOG.md) 为准。

| 项 | 内容 |
|---|---|
| 文档版本 | 0.1（初稿） |
| 日期 | 2026-10-27 |
| 状态 | 待实现 |
| 目标仓库 | `dsh-review-relay`（新建，社区插件） |
| 目标运行时 | DeepSeek Harness 0.2.x，开发基线 `0.2.1-rc.2` |
| 关联插件 | `@deepseek-ai/dsh-experimental-auto-review`（官方实验包，下称 auto-review） |
| 作者 | chofu |

---

## 1. 背景

DSH 的 Auto review 权限档在每次工具调用前让当前模型充当 reviewer，返回 `allow` / `deny` + `reason`。reviewer 判 deny 时，如果审批策略是 `ask`，会弹出审批卡片，把 reviewer 的意见展示给用户，由用户决定“允许一次”还是“拒绝”。

这条链路目前有一个断点：**reviewer 的意见只给用户看，不进入工作 agent 的上下文；用户点“拒绝”之后，agent 只知道“用户拒绝了”，不知道 reviewer 为什么拒绝，也不知道用户希望它怎么改。**

结果就是用户被夹在中间：一边读英文审查意见，一边手动在输入框里复述一遍给 agent。这个插件就是来消掉这段手动复述的。

## 2. 问题陈述

### 2.1 现状（有源码依据）

1. **reviewer 的 reason 不进模型上下文。** auto-review README 明确写着：The raw optional reason is durable structured error detail for users, never main-model content。
2. **审批结果没有附言字段。** `ApprovalOutcome` 只有 `allowed-once | rejected | cancelled | unavailable`；审批请求只有 `reason` / `displayReason`，没有“用户说明”。
3. **拒绝后模型只看到一句话。** `the user rejected tool "<name>"`，reviewer 的理由和用户的意图都不在里面。
4. **reviewer 输出语言固定英文。** `REVIEW_POLICY` 写死，auto-review 的 Config 是 absent，社区已经提过 feature request。
5. **客户端审批面板只有两个动作。** `ApprovalPanel` 渲染“允许一次 / 拒绝”，没有输入框。

### 2.2 三个用户痛点

- **P1 拒绝时无法说明原因。** 用户只能先点拒绝，再在输入框补一条消息。此时 agent 可能已经基于“被拒”继续试错，甚至停下来等下一轮；补的话和当时的上下文对不上。
- **P2 审查意见无法原样转交。** reviewer 的英文推理是判断依据，用户希望 agent 看到原文，而不是用户转述后的版本；转述会丢细节、改语气。
- **P3 审查意见是英文。** 中文用户读不懂“为什么被拒”，只能看个大概。希望 reviewer 直接输出中文，或者至少自动翻译成中文。

### 2.3 为什么现有插件不够

社区里已经有几段相邻能力，但没有一个接在官方 auto-review 的 ask 链路上：

- `dsh-permgate` 在自己的审批弹窗里支持“自定义拒绝意见”，AI 能收到“为什么不行、应该怎么做”。但它是另一套权限档，不能叠加在 auto-review 上；收到的是用户意见，不是 reviewer 原文。
- `dsh-review-loop` 在 diff 审查面板里写评论，批准时用 `agent.inject()` 把评论送回 agent。交互模式最接近，但审查对象是文件改动，不是工具审批裁决。
- `dsh-auto-approver` / `dsh-auto-approve` 会把自动拒绝的理由回传模型，但人不在回路里，理由来自配置或模型。
- `PerryLink/dsh-auto-review` 会把自家 reviewer 的 deny reason 注入被拒工具结果，但它是另一套 auto-review 实现，没有“人工拒绝 + 附言”的环节。
- `dsh-plugin-approval-zh` / `dsh-approval-translator` 把审批弹窗汉化，但只做显示层，不回传 agent。approval-zh 在客户端整体重绘，可能覆盖到 `displayReason`；approval-translator 只改 `reason`，而 auto-review 的 ask 优先用 `displayReason`，所以覆盖不到。

结论：这是一个真实缺口，需要新插件。

## 3. 目标与非目标

### 3.1 目标

- **G1 拒绝附言。** 用户在拒绝审查型审批时，可以顺手写一句说明；这句话会作为用户消息进入工作 agent 的上下文。
- **G2 原样转交。** 用户可以选择把 reviewer 的审查意见原文一并转交，逐字保留，不转述、不改写。
- **G3 中文呈现。** 审查意见以中文展示；转交时也附带中文译文。翻译失败不影响拒绝。
- **G4 安全、可审计、可降级。** 不改变审批语义；UI 不可用时交回官方卡片；模型可见内容都能从会话日志重建。

### 3.2 非目标

- 不替代 auto-review，不做 allow / deny 判定，不自动批准。
- 不修改 DSH 核心包或 auto-review 包；只做 bundle 插件（`dsh.bundle` patch 层）。
- 不做通用翻译插件、不做 IM / 手机推送、不做审批历史面板。
- **不承诺“让 reviewer 输出中文”。** reviewer 的 prompt 在 auto-review 包里，插件改不了；本插件只做展示与转交的翻译。想真正让 reviewer 说中文，需要给上游加 Config，那是另一条路。
- 不持久化审批（DSH 本身不支持跨重启的待审批），不重放、不补发历史拒绝。
- 不写任何自定义 Session 事件（原因见 §10.3）。

## 4. 用户故事

- **US-1** 作为用户，我在审批卡片上点“拒绝”时能写一句“不要删 build/，改用 pnpm clean”，agent 下一步就能看到，而不是对着“用户拒绝”继续试。
- **US-2** 作为用户，我想一键把 reviewer 的原文带上，让 agent 看到完整推理，而不是我的转述。
- **US-3** 作为中文用户，审查意见默认显示中文，我想核对时可以展开英文原文。
- **US-4** 作为用户，翻译超时或失败时，我仍然可以正常拒绝；卡片不能卡住。
- **US-5** 作为没装 auto-review 的用户，这个插件不能干扰普通审批，最好完全无感。

## 5. 术语

- **审查型审批（review ask）**：`reason` 形如 `Auto review rejected tool "<tool>"; its body was not executed: <reviewer reason>` 的审批请求。
- **审查意见（reviewer reason）**：上面 `<reviewer reason>` 的部分，英文自由文本，可能多行。
- **附言（note）**：用户在拒绝时输入的自由文本。
- **转交（relay）**：把附言和 / 或审查意见作为一条用户消息注入工作 agent。
- **工作 agent**：发起这次工具调用、正在等待审批结果的 agent。

## 6. 功能需求

### FR-1 识别审查型审批

**输入**：Host 侧 `approval/request` 事件，字段包括 `agent`、`toolName`、`callId`、`reason`、`displayReason`、`signal`。

**要求**：

1. 用 `reason` 识别审查型审批。默认匹配规则：
   - 前缀：`Auto review rejected tool "`
   - 分隔符：`"; its body was not executed: `
   - 分隔符之后到字符串结尾是 reviewer 原文。
2. 解析必须稳健：reviewer 原文里可能有多行、引号、冒号、反引号；只按**第一个**分隔符切分，后半段原样保留。
3. 匹配规则必须可配置：`reviewerReasonPattern`（正则，含 `tool` 与 `reason` 两个命名组），默认值等价于上面的规则。
4. **不得**把没有 `: <reason>` 的直接拒绝（`Auto review rejected tool "<tool>"; its body was not executed`）误判成审查型审批；那不是 ask。
5. 如果 `reason` 缺失但 `displayReason.zh` 存在且形如 `Auto review 拒绝了此调用：<reason>`，用其后缀兜底；否则视为普通审批。
6. 匹配失败时按普通审批处理：默认完全委托（`next()`），不注入、不改变结果。

**边界**：auto-review 将来改了文案，配置的正则要能跟上；匹配失败必须是“退化成普通审批”，不能“误注入”。

### FR-2 拒绝并附言（UI）

**要求**：

1. 只对审查型审批接管审批卡片；其他审批交回官方卡片。
2. 卡片必须包含：
   - 工具名（可带 callId 短标识）。
   - **官方详情区**：复用 `conversation.approval.detail` 槽，保留 diff / 命令明细；不能因为换卡片而丢详情。
   - 审查意见：默认中文（译文），可展开 / 收起原文。
   - 附言输入框：可选，多行，带字数上限与计数器。
   - “一并转交审查意见原文”勾选框（默认值由配置决定）。
   - 主按钮“允许一次”与“拒绝并发送说明”。
3. **拒绝但什么都不填**：等同于普通拒绝，不注入任何内容。
4. **有附言**：点击拒绝后，先把附言提交给 Host，确认成功后才提交审批拒绝；提交失败时卡片保持打开，显示错误，允许重试或显式选择“不带说明直接拒绝”。
5. **允许一次**：行为必须与官方完全一致，不提交附言、不注入；已经输入的附言直接丢弃（不弹二次确认）。
6. 提交期间按钮进入 loading，防止重复提交；`PendingApproval.signal` 中止时关闭卡片、不注入。
7. 审批被取消 / 超时 / 会话关闭时，卡片关闭，不注入。
8. 客户端需要的配置（`noteMaxChars`、`defaultForward`、`showOriginal` 等）通过 Host 的只读配置端点拉取一次；拉取失败时使用内置默认值并退回官方卡片，不允许附言丢失或静默降级。

**配置**：`noteEnabled`（默认 `true`）；`noteForNonReviewApprovals`（默认 `false`，见 FR-9）。

### FR-3 转交审查意见原文

1. 是否转交由勾选框决定；默认值 `defaultForward`（默认 `true`）。
2. `forwardMode` 的语义：`ask` 显示勾选框；`always` 强制转交（勾选框选中并禁用）；`never` 不转交（勾选框隐藏），附言仍可发送。
2. 转交内容必须**逐字**等于 reviewer 原文：不 trim 内部空白、不改引号、不转义、不摘要。
3. 超过 `maxForwardChars`（默认 8000）时截断，并在末尾追加明确标记 `[reviewer reason truncated at N chars]`；不得静默截断。
4. 用户取消勾选时，只转交附言。
5. 附言和审查意见都没有时，不注入。

### FR-4 注入工作 agent

**触发**：审批结果为 `rejected`，且本次提交包含附言或选择了转交审查意见。

**要求**：

1. 使用 Agent 的 `inject()` 把内容作为带身份的 user 消息注入同一个 agent / session；不要用 `followup()` 直接开新回合，除非命中 FR-4.6 的空闲场景。
2. 注入时机：审批结果提交之后、下一次模型请求之前。注入不得阻塞或改变审批结果；注入失败时审批仍然是拒绝。
3. **恰好一次**：按 `callId` 去重；`callId` 缺失时用审批 id（从 `approval/asked` 关联）或 `(sessionId, toolName, reason 哈希)` 兜底。重复事件、重复点击、重放都不得重复注入。
4. **只对同一个 session / agent**：不得跨会话、不得注入到父 agent 或子 agent。
5. **落在 step 边界**：注入不能插在 assistant tool call 与它的 tool result 之间，否则会话会出现 tool call / result 失配。M0 必须验证 `inject()` 的排队语义；若当前实现会在工具执行中途落盘，改为“审批结果落盘后的下一个 step 再注入”。
6. **空闲兜底**：如果注入时该 agent 已经没有打开的回合（例如拒绝后回合直接结束），改用 `followup()`，否则附言会永远停在收件箱里没人读。配置 `delivery: 'auto' | 'inject' | 'followup'`，默认 `auto`：有打开回合用 `inject`，否则 `followup`。
7. 注入失败必须对用户可见（toast / 卡片状态），并写插件日志；不得静默吞掉。

### FR-5 中文与翻译

1. **目标语言**：`targetLanguage`，默认 `ui`（跟随界面语言，中文界面即 `zh-CN`），可显式指定 BCP-47。
2. **展示翻译**：审查意见在卡片上默认显示译文；`showOriginal`（默认 `true`）提供“查看原文”。
3. **转交翻译**：`translateForForward`（默认 `true`）时，在转交消息里附带译文块；原文块始终保留。
4. **跳过已中文**：用 CJK 覆盖率启发式判断；已经是目标语言时不发翻译请求。
5. **保真**：翻译 prompt 要求保留代码、行内代码、命令、路径、URL、占位符和换行；只翻自然语言。
6. **不阻塞**：翻译超时 `translationTimeoutMs`（默认 10000）后放弃，显示原文 + 一行“翻译失败”提示；用户仍可拒绝。
7. **缓存**：按 `(source, target, provider, model)` 哈希做进程内 LRU（建议 128 条），避免重复计费。
8. **Provider**：`translationProvider` 三选一：
   - `llm`（默认）：用当前会话的 provider / model 做一次独立请求，不额外引入凭据。
   - `translator`：如果宿主挂了官方 `ctx.translator` 就用它，否则自动降级到 `llm`。
   - `off`：关闭翻译，只显示 / 转交原文。
9. **隐私**：README 必须写明“审查意见会被发送到所选 provider”；选 `translator` 时可能走匿名 Bing / Google 端点，必须显式提示。
10. **成本**：一次被拒的审查最多一次翻译请求（缓存命中则零次）；允许在卡片上先显示原文、译文异步补上。用户拒绝时若译文尚未就绪，最多等待 `translationTimeoutMs`；超时则只注入原文，不注入半截译文。

### FR-6 配置

所有可调项走插件的 `Config`（Schemastery），不硬编码；未知字段在加载时失败。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 总开关 |
| `reviewerReasonPattern` | string | 见 FR-1 | 识别审查型审批的正则，含 `tool` / `reason` 命名组；加载时编译一次，非法正则 fail loud |
| `noteEnabled` | boolean | `true` | 是否显示附言输入框 |
| `noteForNonReviewApprovals` | boolean | `false` | 普通审批是否也允许附言 |
| `noteMaxChars` | number | `2000` | 附言上限 |
| `forwardMode` | `'ask' \| 'always' \| 'never'` | `'ask'` | 转交审查意见的方式 |
| `defaultForward` | boolean | `true` | `ask` 模式下勾选框的默认值 |
| `maxForwardChars` | number | `8000` | 转交原文上限，超出截断并标记 |
| `targetLanguage` | string | `'ui'` | `ui` 或 BCP-47 |
| `translate` | boolean | `true` | 是否启用翻译 |
| `translateForForward` | boolean | `true` | 转交时是否附带译文 |
| `showOriginal` | boolean | `true` | 是否提供原文查看 |
| `translationProvider` | `'llm' \| 'translator' \| 'off'` | `'llm'` | 翻译通道 |
| `translationModel` | string（可选） | 当前会话模型 | 可选，指定翻译模型 |
| `translationTimeoutMs` | number | `10000` | 翻译超时 |
| `delivery` | `'auto' \| 'inject' \| 'followup'` | `'auto'` | 注入方式 |
| `forwardOnDirectDeny` | boolean | `false` | 见 FR-9（可选能力） |

### FR-7 会话与审计

1. **禁止写自定义 Session 事件。** 当前 DSH 的 reader 对未知且未标 `ignorable` 的事件直接拒绝加载整份日志；而普通的 `Session.append` 没有写 `ignorable` 的公开入口。写自定义事件会导致重启后会话永久打不开。这是硬约束。`appendPluginRecord` 虽然存在，但官方 session README 明确要求**仓库外插件不要调用**，本插件同样不调用。
2. 审计依赖两条既有事实：
   - 转交内容本身就是一条被 `inject()` 记录的用户消息，天然满足“模型可见 ⟺ 已记录”。
   - reviewer 原文已经在 `approval/asked.reason` 里被 Host 记录。
3. 插件自己的状态（待提交附言、翻译缓存、去重集合）只放内存，进程退出即丢；不落 Session，不要求持久化。
4. 如需调试日志，写到插件自有的 `$DSH_HOME/review-relay/*.log`，默认关闭。

### FR-8 兼容与降级

1. **auto-review 不存在**：插件正常加载，不接管任何卡片；普通审批完全不受影响。
2. **auto-review 文案变化**：通过 `reviewerReasonPattern` 适配；匹配失败退化为普通审批，宁可少做事，不可误判。
3. **没有客户端 / 客户端未连接**：Host 侧看不到附言，交回官方审批卡片；不得因为 UI 不在而卡住审批。
4. **插件被禁用 / 卸载**：审批立即回到官方行为；不得留下悬挂的 answerer 或监听器。
5. **DSH 版本**：在 `package.json` 声明 `dshVersions` / peer 范围，目标 `0.2.x`；对 `0.2.1-rc.2` 做真实组合验证。
6. **translator 未安装**：不得在加载期报错；`translationProvider: 'translator'` 时探测不到就降级到 `llm`，并给出一次性提示。

### FR-9 可选能力（不进 MVP）

- **直接拒绝也转交**：auto-review 判 deny 且不走人工（`high` 风险等）时，模型只看到一行拒绝文案，reviewer 的理由同样丢失。可选 `forwardOnDirectDeny: true` 时，通过 `tools/post-execute` 追加 reviewer 理由作为附加上下文。**该钩子能否在 deny 结果上追加内容需要 M0 确认**；做不到就砍掉这项。
- **普通审批附言**：`noteForNonReviewApprovals: true` 时，所有审批都显示附言框，但不解析 reviewer 意见。
- 以上两项默认关闭，先不做，避免第一版范围膨胀。

### FR-10 国际化与可访问性

1. 所有用户可见文案走 locale 字典（zh / en），不硬编码；跟随 DSH 界面语言。
2. 注入给模型的消息模板保持固定英文标签（模型侧稳定、便于快照），内容语言跟随用户 / 翻译配置。
3. 输入框有 label / placeholder、字数上限、错误提示；焦点进入卡片后键盘可达。
4. 快捷键：保留官方 Enter = 允许、Esc = 拒绝；输入框聚焦时 Enter 换行，Cmd/Ctrl+Enter 提交拒绝，Esc 取消聚焦（不得误触拒绝）。

## 7. 交互设计

```
┌──────────────────────────────────────────────────┐
│ ⚠ Auto review 拒绝了此调用                         │
│ 工具：bash                                         │
│                                                    │
│ 审查意见（中文）：                                  │
│ 该命令会删除 build/ 下用户未提交的产物，属于不可逆   │
│ 删除，建议先确认。                         [查看原文] │
│                                                    │
│ 说明（可选，会作为用户消息发送给正在工作的 agent）  │
│ ┌────────────────────────────────────────────────┐ │
│ │ 不要删 build/，改用 pnpm clean                  │ │
│ └────────────────────────────────────────────────┘ │
│                                          18 / 2000 │
│ [x] 一并转交审查意见原文                            │
│                                                    │
│ [允许一次]                  [拒绝并发送说明]        │
└──────────────────────────────────────────────────┘
```

状态：

- 翻译中：审查意见区显示原文 + “翻译中…”，不阻塞拒绝。
- 翻译失败：显示原文 + “翻译失败，已保留原文”。
- 提交中：按钮 loading，禁止二次提交。
- 提交失败：错误条 + 重试；“不带说明直接拒绝”作为显式退路。
- 成功：卡片关闭，出现一条轻量提示“已拒绝，说明已转交给 agent”。

## 8. 注入消息格式

固定模板（英文标签，内容原样）：

```text
User rejected tool "<toolName>".

User note:
<note>

Reviewer reason (verbatim):
<reviewer reason>

Reviewer reason (translated to <targetLanguage>):
<translation>
```

规则：

1. `User note` 块为空时整块省略。
2. 未转交审查意见时，后两块都省略。
3. 翻译关闭、失败、或与原文相同（已是目标语言）时，译文块省略。
4. 原文块必须逐字保留（除 FR-3.3 的显式截断）。
5. 三块都为空时不注入。
6. 模板是行为契约：改模板 = 改行为，需要同步测试与 README。

示例：

```text
User rejected tool "bash".

User note:
不要删 build/，改用 pnpm clean。

Reviewer reason (verbatim):
The command runs `rm -rf build/`, which irreversibly deletes untracked user artifacts.

Reviewer reason (translated to zh-CN):
该命令执行 `rm -rf build/`，会不可逆地删除用户未提交的产物。
```

## 9. 数据与状态

进程内，全部有界：

- `pending: Map<callId, { approvalId, sessionId, toolName, reason, at }>`：从 `approval/request` 观察到的待处理审批。`callId` 缺失时用 `(sessionId, toolName, reason 哈希)` 作键。
- `notes: Map<callId, { note, forward, submittedAt }>`：客户端提交的附言；审批结算后清除。
- `delivered: Set<approvalId>`：去重；上限 / TTL 防泄漏。
- `translationCache: LRU<key, string>`：上限 128。
- 插件 dispose 时清空所有 Map / Set，移除监听器与路由。

不引入持久化存储；不写 Session 事件（见 FR-7）。

## 10. 技术约束与建议架构

### 10.1 形态

- 纯 bundle 插件，`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 插入一行。
- 包名 / npm 名：`dsh-review-relay`；cordis 行 id：`review-relay`；插件市场显示名：审查回传（Review Relay）。
- Host 半边：`src/index.ts`，函数插件，导出 `name` / `inject` / `Config` / `apply`。
- Client 半边：`src/client/index.ts` + 面板组件，注册 locale 和 `conversation.composer` 槽（`priority: 0`）。
- ESM、strict TypeScript、无 `as unknown`、无自定义 Session 事件。

### 10.2 推荐数据流

1. Host 用 `ctx.on('approval/request', handler, true)` 注册一个**只观察、不拦截**的监听器：`const outcome = await next()`，拿到完整请求（含 `agent`、`callId`、`reason`）和最终结果；永远把 `outcome` 原样返回。
2. Client 用 `priority: 0` 接管 `conversation.composer` 槽；只对匹配审查型审批的 `PendingApproval` 返回自定义面板，其他返回 `null`，官方卡片（`priority: 1`）照常显示。
3. 用户提交拒绝时，Client 先把 `{ callId, note, forward }` POST 到 Host 的插件端点（建议 `/review-relay/note`），拿到成功响应后再调用 `pending.answer('rejected')`。这样 Host 在 `await next()` 返回时一定已经拿到附言。配置通过 `/review-relay/config` 只读拉取。
4. Host 在 `outcome === 'rejected'` 时，按 `callId` 取附言、按配置决定是否转交、可选翻译，然后 `agent.inject(...)`（或空闲时 `followup`）。
5. 去重按审批 id / callId；允许、取消、失败都不注入。

**为什么不用 Host 自己接管审批**：那需要自己实现一套 client↔host 的请求 / 响应通道，还要自己渲染 allow/reject，复杂且容易把审批语义做坏。上面的方案复用官方 relay，插件只做“观察 + 装饰 + 注入”，失败时天然退回官方行为。

**端点的约束**：只接受当前进程内处于 pending 状态的 `callId`；限制请求体大小（建议 32 KiB）；校验 Origin / 同源；不提供任何读取会话内容的接口；端点关闭时 Client 必须降级为官方卡片。

### 10.3 会话事件的硬约束

不要写 `Session.append('reviewRelay/...')` 之类的自定义事件。当前 reader 对 unknown-and-not-ignorable 事件会抛 `SessionFormatUnsupportedError`，而普通的 append 没有写 `ignorable` 的入口；一旦写入，重启后整份会话日志打不开。已有多个第三方插件踩过。

`appendPluginRecord` 是给仓库内 `packages/experimental/` 包的通道，官方 [session README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/README.md) 明确写着 “Plugins outside this repository must not call it either”，所以本插件也不使用。

插件需要的所有“记录”都由既有机制承担：

- 转交内容 = 一条 `inject()` 的用户消息；
- reviewer 原文 = `approval/asked.reason`；
- 审批结果 = `approval/decided.outcome`。

### 10.4 翻译实现

- 优先 `ctx.get('translator')`；没有就用自己的 `ctx.llm` 一次性请求（参考 `dsh-approval-translator` 的做法：独立 system prompt、无历史、无工具、限定输出、超时）。
- 不要在每次按键时翻译；只在卡片出现时翻译一次，缓存结果。
- 不要把整段会话发给翻译；只发 reviewer reason。

## 11. 失败处理与安全

| 场景 | 行为 |
|---|---|
| 识别失败 / 非审查审批 | 完全委托，不接管、不注入 |
| Client 未连接 / 面板崩溃 | 交回官方审批卡片；没有附言可转交；`forwardMode: always` 时仍只转交审查意见 |
| 附言 POST 失败 | 卡片保持打开，错误可见；可重试或显式“不带说明直接拒绝” |
| 翻译超时 / 失败 | 显示原文 + 提示；拒绝照常；不注入空的译文块 |
| 注入失败 | 审批仍是拒绝；toast + 日志；不重试风暴（最多一次重试） |
| 审批取消 / 会话关闭 | 不注入，清理状态 |
| 重复提交 / 重复事件 | 按审批 id / callId 去重，恰好一次 |
| 超长附言 / 审查意见 | 按配置截断并显式标记；不静默丢内容 |
| 跨会话 / 子 agent | 拒绝注入，记录警告 |

安全底线：

- **绝不把拒绝变成放行**：本插件只观察结果，不返回自己的 outcome；任何 UI 故障都退回官方审批。
- 不修改工具参数、不重写工具结果、不跨会话读取内容。
- 附言只存在内存，结算后清除；日志默认不落盘。
- 翻译是数据外发：README 明确写清目标 provider，默认走用户自己的 `llm`，不默认走匿名第三方。

## 12. 非功能需求

- **性能**：允许操作零额外模型调用；一次被拒的审查最多一次翻译调用；缓存命中零调用。
- **延迟**：翻译不阻塞卡片操作；用户可以先拒绝再看译文。
- **内存**：所有集合有界；dispose 清空。
- **兼容**：Web（主）、Desktop（同一 Web 客户端）。Headless 不适用：auto-review 本身只随 Web 层提供，本插件在无 UI 环境下不接管审批。
- **可维护**：配置校验在加载期 fail loud；模板、正则、消息格式都有测试钉住。
- **可观测**：关键路径（识别、提交附言、注入、翻译失败）有结构化日志，默认 info，敏感内容不打印。

## 13. 验收标准

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | auto-review 开启，reviewer deny 并弹卡 | 卡片出现 | 显示中文审查意见；可展开英文原文；有附言框 |
| AC-2 | 同上 | 不填附言、不勾选转交，点拒绝 | agent 只看到原来的 `the user rejected tool ...`，无额外消息 |
| AC-3 | 同上 | 填“改用 pnpm clean”，点拒绝 | 下一次模型请求前出现一条 user 消息，含该附言；工具结果仍是拒绝 |
| AC-4 | 同上 | 勾选转交，点拒绝 | 注入消息里 reviewer 原文逐字一致（可用固定样例断言） |
| AC-5 | 翻译服务超时 | 卡片出现并拒绝 | 卡片可用；显示原文 + 失败提示；注入消息只含原文块 |
| AC-6 | 审查意见已经是中文 | 卡片出现 | 不发翻译请求；只显示原文 |
| AC-7 | auto-review 未安装 | 普通 bash 审批 | 官方卡片原样显示；插件不注入、不报错 |
| AC-8 | Client 未连接 | 审查型审批 | 交回官方卡片；审批可正常完成 |
| AC-9 | 任意上述流程 | 重启 Host 后打开会话 | 会话正常加载；无自定义事件导致的加载失败 |
| AC-10 | 同一审批 | 重复点击拒绝 / 重放事件 | 只注入一次 |
| AC-11 | 用户点允许一次 | — | 不注入任何内容 |
| AC-12 | 拒绝后 agent 已空闲 | 注入 | 走 `followup`，消息不丢 |
| AC-13 | 中文界面 | 打开卡片 | 所有文案中文；切换到英文界面后全英文 |
| AC-14 | 附言 3000 字、上限 2000 | 提交 | 输入被限制 / 明确提示，不静默截断 |

## 14. 测试要求

- **单元**：识别规则（含多行、引号、冒号、直接拒绝的负例）、消息模板（各块省略规则）、截断、翻译跳过 / 缓存 / 失败、去重、配置校验。
- **集成**：真实 boot 一个测试 `cordis.yml`，挂一个假审批请求 + 假客户端应答；断言
  1. 拒绝后会话日志里出现注入的 user 消息，且内容等于模板；
  2. 允许时没有注入；
  3. 整个过程没有写入任何未知 Session 事件；
  4. 重启 / 冷加载会话成功。
- **手动 E2E**：DSH Web + auto-review + 一个会触发 deny 的权限场景；按 AC-1 ~ AC-6 走一遍。
- **回归**：卸载 / 禁用插件后，官方审批行为完全恢复；HMR dispose 后无残留监听器、无悬挂 pending。

## 15. 交付物

- `package.json`（含 `dsh.bundle`、`dshVersions`、publish 配置）。
- `cordis.patch.yml`（插入 `review-relay` 行）。
- `src/index.ts`（Host）、`src/client/index.ts` + 面板组件、locale 字典。
- `README.md` / `README.zh.md`：安装、配置、隐私（翻译外发）、已知限制、截图。
- `LICENSE`（建议 MIT 或 Apache-2.0）。
- `tests/`：单元 + 集成。
- `CHANGELOG.md`。
- 一段可直接粘贴到 profile 的配置示例。

## 16. 里程碑

- **M0 侦察（0.5 天）**：在 `0.2.1-rc.2` 上确认
  1. `approval/request` prepend + `await next()` 能拿到 review ask 的完整 reason 和最终 outcome；
  2. `reason` 的实际字符串与解析规则一致；
  3. 客户端 `priority: 0` 接管 `conversation.composer` 可行，且能拿到 `PendingApproval`；
  4. 宿主 HTTP 端点可注册（或确认替代通道）。
  产出：一页实现方案 + 风险点。
- **M1 Host-only 转交（MVP）**：识别 + 在拒绝时自动转交 reviewer 原文（含翻译），无附言 UI。可独立合并、可测试。
- **M2 附言 UI**：自定义卡片、附言提交、允许 / 拒绝、错误态。
- **M3 翻译完善**：缓存、超时、provider 降级、隐私提示。
- **M4 打磨**：i18n、a11y、文档、E2E、发布。

## 17. 开放问题

1. 客户端 → Host 的附言通道：HTTP 端点 vs 自定义 remote 通道，哪个在当前 DSH 版本更稳？M0 先验证。
2. 默认翻译 provider 用 `llm` 还是 `translator`？隐私与成本怎么取舍？（当前建议 `llm`。）
3. 附言是否应该同时作为“用户拒绝”的一部分写进 `approval/decided`？当前做不到，只能注入。
4. 直接拒绝（无 ask）要不要也转交 reviewer 理由？建议 v2 再做。
5. 用户先拒绝、随后又在输入框补消息时，插件是否要抑制重复？建议 v1 不做，交给用户。
6. 客户端配置同步：一次性 GET vs 内嵌默认值？当前建议 GET `/review-relay/config`，失败时退回官方卡片，M2 定稿。

## 18. 参考资料

- auto-review 包：`packages/experimental/auto-review/README.md`（reason 只给用户、ask 文案、语言固定）。
- 审批 seam：`packages/interaction/user-approval/src/types.ts`（`ApprovalOutcome`、`approval/request` 字段）。
- 拒绝文案：`packages/core/tools/src/index.ts` 中 `the user rejected tool "<name>"`。
- Agent 注入：`packages/core/agent/README.md`（`inject` / `followup` / `steer` 语义）。
- 客户端审批：`packages/client/ui-approval/src/client/ApprovalPanel.tsx`（`displayReason` 优先）。
- 翻译服务：`packages/experimental/translator/README.md`。
- 自定义 Session 事件的坑：[DSH Discussion #918](https://github.com/deepseek-ai/deepseek-harness/discussions/918)。
- 相关讨论：[#9817](https://github.com/deepseek-ai/deepseek-harness/discussions/9817)（拒绝理由恒英文）、[#6100](https://github.com/deepseek-ai/deepseek-harness/discussions/6100)（`user rejected` 误归因）。
- 相邻插件：`wuxiangru915/dsh-review-loop`、`MrWeiCodes/dsh-permgate`、`nicecx/dsh-auto-approver`、`PerryLink/dsh-auto-review`、`KNGLOKIKO/dsh-plugin-approval-zh`、`xiyuepcl/dsh-approval-translator`。
