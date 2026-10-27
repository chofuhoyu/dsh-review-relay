# Changelog

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
- No custom Session events and no `appendPluginRecord`; audit comes from existing approval and inbox events.
- zh/en locale dictionaries, strict config validation, and unit/integration/M0 probes.
