# Changelog

## 0.2.1 — 2026-11-13

- Documentation-only release: both READMEs now open with the install guide, and the `github:chofuhoyu/dsh-review-relay` shorthand is the primary install spec, with the HTTPS form as the fallback.
- The install section is no longer buried under the rationale, and the outdated note about a private repository is gone.
- Version pins move to `v0.2.1`. No code or `lib/` changes.

## 0.2.0 — 2026-10-31

- **Default relay target is now the rejected tool result, not a synthetic user message.** The Host enriches the denied call through `tools/post-execute`; the note and reviewer reason become a text block on `tool/result`. The model sees them at tool priority and the Web UI no longer shows an extra user bubble in the main conversation.
- `delivery` defaults to `'tool-result'`. `'auto'` is a deprecated alias; `'inject'` and `'followup'` keep the legacy synthetic-user-message behavior.
- Direct final denials (`forwardOnDirectDeny: true`) use the same tool-result path by default.
- Delivery status now reports whether the tool result was enriched; the 6-second watcher and error toast are unchanged.
- The relay template no longer repeats `User rejected tool "<toolName>".` on the tool-result path; the tool result's own rejection line already states it.
- Card copy no longer promises a user message; it says the note is relayed with the rejected call.
- Added `@deepseek-ai/dsh-tools` to peer dependencies for the `PostToolDecision` / `ToolExecution` types.

## 0.1.0 — 2026-10-27

Initial release.

- Host half observes `approval/request` with a prepended listener, never answers it, and relays the reviewer reason after a rejection.
- Recognizes the shipped `0.2.1-rc.2` Auto review ask text: `Auto review denied tool "<tool>": <reason>`.
- Waits for the matching committed `tool/result` before injecting, so the message lands at a step boundary and never between a tool call and its result.
- Projects a priority-0 `conversation.composer` card with a Chinese translation, expandable original, optional note, forward checkbox, and explicit allow/reject.
- Submits the note through an authenticated `connection.fetch` route before answering the approval; a failed POST keeps the card open with retry and a plain-reject fallback.
- Exactly-once delivery keyed by `(sessionId, callId)` with a hash fallback.
- One-shot translation via the current LLM route with a bounded LRU, timeout, CJK skip, and `translator`-service fallback.
- Official-card fallback for non-review approvals, missing config, missing `callId`, and crashed cards (the plugin disposes its chain entry).
- Optional `forwardOnDirectDeny`: relays the structured reviewer reason from a final denial that never asked, without changing the tool result.
- Post-rejection delivery watcher: `GET /api/review-relay/delivery` reports pending/delivered/failed, and the client replaces the success toast with a visible error toast if injection fails within the watch window.
- No custom Session events and no `appendPluginRecord`; audit comes from existing approval and inbox events.
- zh/en locale dictionaries, strict config validation, and unit/integration/M0 probes.
