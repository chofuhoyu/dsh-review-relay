# M0 侦察报告 — dsh-review-relay

- 日期：2026-10-27
- 基线：DSH `0.2.1-rc.2`，源码 `687f282e8625c6b8d11ff58211a90524be2e4317`（tag `dsh-v0.2.1-rc.2`）
- 结论：四个假设（拆成 H1–H5 五项验证）都可落地，但 **request.md 的审查型审批 reason 前缀与真实代码不一致**；客户端详情槽还有一个“子槽只能声明一次”的硬限制。见下文修正。
- 后续状态：M1/M2/M3 已实现并推送到 GitHub；见 [README](../README.md) 与 [CHANGELOG](../CHANGELOG.md)。

## 0. 验证命令（开工前先跑这些）

```sh
# 基线
git -C /home/chofu/code/deepseek-harness rev-parse HEAD
git -C /home/chofu/code/deepseek-harness describe --tags --always

# H1 + H5：prepend/await next() 观察完整请求与 outcome；inject 落在 step 边界
cd /home/chofu/code/dsh-review-relay
node tests/m0/probe.mjs

# H2：真实 auto-review 的 ask reason 字符串（不是模拟）
node tests/m0/auto-review-probe.mjs

# H3 + H4：客户端 priority 0 链、PendingApproval、子槽限制、connection.fetch 通道
DSH_SOURCE=/home/chofu/code/deepseek-harness node tests/m0/static-contracts.mjs

# 人工抽查（可选）
rg -n 'priority: 1|select: \(\{ pendingInteraction|conversation\.approval\.detail' \
  /home/chofu/code/deepseek-harness/packages/client/ui-approval/src/client/index.ts
rg -n 'approval/request|displayReason' \
  /home/chofu/code/deepseek-harness/packages/interaction/user-approval/src/types.ts
rg -n 'denied tool|rejected tool|askUser' \
  /home/chofu/code/deepseek-harness/packages/experimental/auto-review/src/index.ts
rg -n 'inject\(input|followup\(input|claim\(' \
  /home/chofu/code/deepseek-harness/packages/core/agent-loop/src/agent.ts \
  /home/chofu/code/deepseek-harness/packages/core/agent-loop/src/inbox.ts
```

## 1. 四个假设的结论

| # | 假设 | 结论 | 关键证据 |
|---|---|---|---|
| H1 | `approval/request` prepend + `await next()` 能拿到完整 reason 和最终 outcome | **可行** | `approval/request` 是 waterfall；`ApprovalService.decide` 用 `ctx.waterfall(scopeTarget(req.agent, req.agent), 'approval/request', req, () => 'unavailable')` 派发。prepend 监听器在最外层，`next()` 返回下游完整 outcome；只要原样 `return outcome` 就不改变语义。`Probe` 已断言 `reason`、`callId`、`displayReason`、`agent`、`outcome` 全部可见。 |
| H2 | 真实 `reason` 字符串与 request.md 的解析规则一致 | **不一致，需修正** | 真实 **ask** 文案是 `Auto review denied tool "<tool>": <reason>`（`askUser()`），**不是** `Auto review rejected tool "<tool>"; its body was not executed: <reason>`。后者是 **直接拒绝**（`denied()`，无 reason 后缀）。`displayReason.zh` 是 `Auto review 拒绝了此调用：<reason>`。request.md §5/FR-1 的前缀与分隔符都需改。 |
| H3 | 客户端 `priority: 0` 接管 `conversation.composer` 可行，且能拿到 `PendingApproval` | **可行，但有 3 个约束** | 链按 `priority` 升序、首个非 null 的 selector 获胜；官方审批 entry 是 `priority: 1`。`pendingInteraction` 就是 `PendingApproval` 实例，暴露 `reason`、`callId`、`displayReason`、`signal`、`answerable`、`answer('rejected')`。约束见 §3。 |
| H4 | 客户端 → Host 通道 | **选 `ctx.connection.fetch.register`** | 在 `/api` 下注册 exact fetch 路由（如 `/api/review-relay/note`），自带 Host/Origin 与浏览器认证围栏，且注册生命周期由读取它的 context effect 拥有。裸 `webServer.register` 只在 Web 可用且要自己校验 Origin；没有现成的“自定义 remote”客户端→Host 请求原语。 |
| H5 | 注入是否落在 step 边界 | **是，但要延迟到 tool/result 之后** | `inject()` = `send(input, 'next-step', false)`：只写 `agent/inbox/spliced`，不唤醒；下一次 `preStep` 在 `step/start` 前 claim `next-step`。若直接在 `approval/request` listener 里 inject，splice 会落在 `approval/decided` 之前（实测 seq：asked 11 → splice 12 → decided 13 → result 14）。正确做法：拒绝时只按 callId 暂存；观察 `session/event` 的 `tool/result`（匹配 `message.toolCallId`），commit 后 `queueMicrotask` 再 inject。`session/event` 回调内不能直接 append（会触发 `session append cannot reenter while another append is being published`）。`Probe` 断言 splice 在 decided/result 之后，user 消息在 result 之后且进入下一次请求。空闲时 `inject()` 不会开回合，必须 `followup()`。 |

## 2. H2 推荐修正

默认正则改为匹配真实 ask（reason 可缺省，供 M2 附言使用）：

```text
^Auto review denied tool "(?<tool>[^"]+)"(?:: (?<reason>[\s\S]+))?$
```

- 直接拒绝 `Auto review rejected tool "<tool>"; its body was not executed` **不会**匹配（没有 `: reason`）。
- 未来 auto-review 改文案时用 `reviewerReasonPattern` 配置跟上；加载期编译一次并校验 `tool` / `reason` 命名组存在。
- `reason` 缺失时再用 `displayReason.zh` 的 `Auto review 拒绝了此调用：<reason>` 兜底；否则按普通审批完全委托。
- 如果坚持 request.md 的 `rejected ...; its body was not executed: ...` 作为默认，则在 `0.2.1-rc.2` 上会 **一个 review ask 都识别不到**。

## 3. H3 的三个约束（必须在 M2 设计里处理）

1. **不能 value-import 官方客户端包。** 客户端 bundle 有 purity gate：跨插件 value import 必须声明 `dsh.client.external`，且 guidance 明确建议不要加载其他 Harness Client 包。做法：`kind === 'approval'` 结构化窄化 + 调用 `answer('rejected')`；只做 type-only import。不要 `instanceof PendingApproval`。
2. **`conversation.approval.detail` 不能再次声明。** 该子槽由官方 `ui-approval` entry 声明；第二个 chain entry 再声明会抛 `slot ... is already declared`。官方详情组件在 `0.2.1-rc.2` 只渲染关联工具调用的 `command`（没有 diff）。M2 方案：不声明该子槽，改为用 `useChat` 标准 prop 自己渲染 command 详情（找不到就留空），保证不丢现有详情；不要为了复用槽去改官方 entry。
3. **chain entry 崩溃不会自动退回官方卡片。** 链的 crash 只报告、不 abdicate；官方 priority 1 不会自动接上。M2 做法：保存 `ctx.slots.register` 的 disposer；在面板错误边界 + `ctx.slots.onEntryError` 中，一旦确认崩溃的是本插件 entry，就主动 `dispose()` 我们的 chain entry。slot version 会 bump，链重新选举，官方 priority 1 自动接上。selector 在配置未就绪时也返回 null。这样不需要伪造官方卡片，也不会自动放行。

## 4. H4 通道结论

- **选型：** Host 用 `ctx.connection.fetch.register({ path: '/api/review-relay/note', methods: ['POST'], requestBody: 'buffered', fetch })`；Client 用同源相对 URL `fetch('api/review-relay/note')`（文档相对路径，兼容子路径部署）。
- **安全：** 只接受当前进程内处于 pending 的 `callId`；`application/json`；body ≤ 32 KiB；不提供任何读取会话内容的接口；`connection` 不存在时不注册，Client 必须退回官方卡片。
- **备选：** 裸 `webServer.register` 可行但只在 Web、要自己处理 Origin；自定义 remote 通道在当前版本没有客户端→Host 请求原语。若组合里没有 `connection` 服务（或路由注册失败），Client 必须退回官方卡片；M1 的“仅转交审查意见”不依赖该通道。

## 5. 额外发现

- **Schemastery 不拒绝未知字段：** `z.object({...})` 会把未知 key 原样合并进 config。硬约束“未知字段加载时失败”必须在 `apply` 里显式做 known-key 校验并 throw，不能只靠 `Config`。
- **`targetLanguage: 'ui'` 在 Host 侧没有 UI 语言：** 客户端 locale 是 browser-only。M1（无客户端）需要一个临时解析：显式 BCP-47 直接用；`ui` 先尝试读 Host settings 的 `locale.preference`（可用时），读不到再按 `LANG/LC_ALL` 猜，最后回退 `zh-CN`（仅 M1）。M2 由客户端在 POST 里带 `locale` 后改为真实 UI 语言。
- **`ctx.translator` 是 opt-in：** 未安装时必须无加载错误；`translationProvider: 'translator'` 探测不到就降级 `llm`。`llm` 路径用 `ctx.llm.stream`，不写任何 Session 事件；`translator` 路径会由官方 translator 写 `plugin:translator/*` 记录，所以默认 `llm`。
- **`approval/request` 没有 approval id：** 去重键用 `callId`；缺失时用 `(sessionId, toolName, reason 哈希)`。如需 approval id，可观察 `approval/asked` 事件做关联，但不是必需。
- **`inject()` 的审计事件是既有的 `agent/inbox/spliced` / `user/message`：** 不写自定义 Session 事件，也不调用 `appendPluginRecord`。
- **不要在 `session/event` 回调里直接 append：** Session 有 publication 重入保护；必须 `queueMicrotask`（或等下一个 step 边界）再 inject。M0 probe 已覆盖。

## 6. 关键源码锚点（0.2.1-rc.2）

- `packages/experimental/auto-review/src/index.ts:655-664` — `askUser()` 生成 `Auto review denied tool "<tool>": <reason>`；`denied()` 在 `639-649` 生成直接拒绝。
- `packages/interaction/user-approval/src/types.ts:63-92` — `approval/request` 字段与 waterfall 签名。
- `packages/interaction/user-approval/src/index.ts:267-307` — `decide()` 的 waterfall 派发与 `unavailable` 兜底。
- `packages/client/ui-approval/src/client/index.ts:93-105` — 官方审批 entry `priority: 1`、`select`、`conversation.approval.detail` 子槽。
- `packages/client/ui-slots/src/index.ts:1249` — 子槽重复声明直接抛错；`1286-1291` — 链按 priority 升序。
- `packages/client/ui-renderer/src/client/scoped-slots.tsx:1199-1215` — 链式选举首个非 null。
- `packages/client/connection/src/rpc-host.ts:118,234-251` — `connection.fetch.register` 与 effect 生命周期。
- `packages/core/agent-loop/src/agent.ts:163-173` — `followup` / `inject` 的 target 与 wake 差异。
- `packages/core/agent-loop/src/inbox.ts:109-113` — 每个 step 边界 claim `next-step`。

## 7. M1 方案（待确认后实施）

- Host-only，无客户端、无附言通道；识别 review ask，拒绝时把 reviewer 原文（+ 可选翻译）注入同一 agent。
- `inject()` 为主；拒绝时按 `callId` 暂存，等 `tool/result` 提交后 `queueMicrotask` 投递（不能用 approval listener 直接 inject）。`agent.status === 'idle'` 时 `followup()`。失败只记日志，不改变拒绝结果；取消/无 result 时清 pending，不注入。
- 去重：`callId` / 哈希键 + TTL；allow / cancel / unavailable 不注入。
- 翻译：`ctx.llm.stream` 一次性请求、无历史无工具、超时、CJK 跳过、LRU 128；失败只注入原文块。
- 配置：`Config` + known-key 校验 + 正则编译 + 数值/枚举边界校验，非法 fail loud。
- 测试：解析（多行/引号/冒号/反引号/直接拒绝负例）、模板省略与截断、去重、翻译跳过/缓存/失败、配置校验；集成断言注入的 user 消息进入会话日志、重启冷加载成功、无未知 Session 事件。
- 验收覆盖：AC-4、AC-5、AC-6、AC-9、AC-10、AC-11、AC-12；AC-1/3/13/14 属于 M2。

## 8. 需要你确认的三点

1. **H2 修正**：默认正则改用真实的 `denied tool "<tool>": <reason>`（推荐），还是保留 request.md 的 `rejected ...`（在 0.2.1-rc.2 上识别不到）？
2. **M1 转交策略**：M1 没有 UI，`forwardMode: 'ask'` 建议降级为“总是转交 reviewer 原文”；M2 再加勾选框。可以吗？还是 M1 只支持显式 `always`？
3. **M1 目标语言**：`targetLanguage: 'ui'` 在 Host 侧按 `locale.preference`（可用时）→ `LANG` → `zh-CN` 回退，可以吗？M2 改由客户端传真实 UI 语言。

确认后我直接进 M1（host-only 转交 + 翻译 + 单测/集成测试），不写 UI。
