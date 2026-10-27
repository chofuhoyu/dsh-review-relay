# Manual E2E checklist

Use this after installing the plugin into the Web profile. It maps the request's
AC-1 … AC-14 to observable steps. Mark each row pass/fail and keep the session
log for failures.

## Setup

1. Install:
   ```sh
   dsh plugin --profile web add git+https://github.com/chofuhoyu/dsh-review-relay.git
   ```
2. Restart the Web UI and confirm the row:
   ```sh
   dsh --profile web --dump-config | grep -A2 review-relay
   ```
3. Enable Auto review (permission preset **Auto**) and open a session.
4. Trigger a medium-risk denial, for example ask the agent to delete a
   pre-existing build directory without authorization. The reviewer should
   deny and ask.

## Acceptance steps

| # | Step | Expected |
|---|---|---|
| AC-1 | Card appears | Chinese translation visible; “Show original” reveals the English reason; note textarea present. |
| AC-2 | Reject with empty note, uncheck forwarding | No extra user message; tool result is still `the user rejected tool ...`. |
| AC-3 | Type “不要删 build/，改用 pnpm clean”, reject | Next agent context contains one user message with that note before the next request; tool result remains rejection. |
| AC-4 | Keep forwarding checked, reject | The relayed message contains the reviewer reason verbatim (compare with `approval/asked.reason`). |
| AC-5 | Configure a very short `translationTimeoutMs` (or an invalid translation route), reject | Card stays usable; original + “translation failed”; relayed message has the original block only. |
| AC-6 | Use a Chinese reviewer reason (custom pattern / fixture) | No translation request; the original Chinese reason is shown and relayed. |
| AC-7 | Disable Auto review, trigger an ordinary bash approval | Official card unchanged; no plugin injection or error. |
| AC-8 | Close all Web clients, trigger a review ask | Official/fallback path completes; approval does not hang. |
| AC-9 | After a rejection, restart Host and reopen the session | Session loads; no unknown-event error; injected user message is present. |
| AC-10 | Replay/duplicate the same reject (or reload before answering) | At most one relayed user message for the call. |
| AC-11 | Click Allow once | No user message injected; note (if typed) discarded. |
| AC-12 | Reject when the agent has already gone idle | The notice is delivered via follow-up, not lost. |
| AC-13 | Switch UI language zh ↔ en | All card copy switches; injected template labels stay English by contract. |
| AC-14 | Paste a note longer than `noteMaxChars` | Counter/error visible; reject action blocked for the note form; explicit “Reject without a note” remains available after a submit error. |

## Additional checks

- Checkbox under `forwardMode: always` is checked and disabled; under `never`
  it is hidden and the note still sends.
- `noteEnabled: false` hides the textarea; the card still translates/forwards.
- `noteForNonReviewApprovals: true` shows the note card for ordinary approvals;
  no reviewer section is rendered.
- Kill the client during note submission: the card should keep an error and
  offer retry or a plain reject; approval must not hang.
- Break the panel intentionally (e.g. malformed `displayReason`): the plugin
  should dispose its chain entry and the official card should appear.
- Configure `forwardOnDirectDeny: true` and trigger a high-risk direct denial:
  the agent receives one extra user message with the structured reviewer reason.
- Inspect `GET /api/review-relay/delivery?sessionId=…&callId=…` after a reject:
  it should move from `pending` to `delivered`; a forced failure should show the
  error toast within the six-second watch window.

## Privacy check

With `translationProvider: llm`, only the reviewer reason (not the note, tool
arguments, or session content) is sent to the current provider. Set
`translate: false` and confirm no translation request is made. With
`translationProvider: translator`, confirm the service is installed and that
you accept its anonymous-endpoint policy.
