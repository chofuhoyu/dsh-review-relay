# Verification log

- Date: 2026-10-27
- DSH: `0.2.1-rc.2` (source commit `687f282e8625c6b8d11ff58211a90524be2e4317`)
- Plugin: `dsh-review-relay@0.1.0`

A second run against `0.2.1-rc.5` with a real browser click-through is recorded
below under "Real manual click-through".

## Automated

```sh
npm run check
```

Covers 109 tests across 14 files:

- strict config defaults, unknown-key failure, regex compilation, numeric/enum/language bounds;
- review-ask parsing (multiline, quotes, colons, backticks, direct-deny and reviewer-failure negatives, localized fallback);
- fixed template block omission, verbatim preservation, and explicit truncation;
- dedup TTL/bounds and delivery keys;
- translation CJK skip, cache, in-flight dedup, timeout, provider failure, translator fallback, and disposal;
- real Auto review integration: the shipped `Auto review denied tool "<tool>": <reason>` ask is observed and relayed verbatim;
- host integration: note POST, translation endpoint, allow/no-injection, cancel/no-injection (via outcome), note-only, ordinary-approval notes, duplicate replay, direct-denial opt-in/off, cold reconstruction of the complete log via `Session.create`;
- client routing: priority-0 selector, display-reason fallback, no-`callId` decline, forward modes, and the delivery-status error toast;
- injection status: `GET /api/review-relay/delivery` reports delivered after a successful reject, and the client surfaces a failed state as an error toast;
- client API wire guards and document-relative routes;
- server-rendered card markup for review/ordinary/forced/disabled cases;
- built `lib/client.js` executed through a fake `window.__ModuleLoader__` with React as the loader baseline.

## Real profile composition

A throwaway profile was created from the shipped `web` template and the local package was installed:

```sh
DSH_HOME=... dsh --profile relay-test --from-default-profile web --dump-config
DSH_HOME=... dsh plugin --profile relay-test add /path/to/dsh-review-relay
DSH_HOME=... dsh --profile relay-test --dump-config | grep -A2 review-relay
```

Observed:

```yaml
# == dsh-review-relay
- id: review-relay
  name: dsh-review-relay
```

The profile was booted on a loopback port with `--no-open`. The served index boot graph contained the client entry:

```text
plugins/??dsh-review-relay/client.js&rev=...
```

The served bundle starts with the expected loader wrapper:

```js
window.__ModuleLoader__.load({ id: "dsh-review-relay", factory: (require) => { ... } });
```

`GET /api/review-relay/config?locale=zh-CN` returned HTTP 200 with `protocol: 1`, the configured defaults, and the recognition pattern. This verifies the bundle patch, the client module graph, and the authenticated host route in a real `0.2.1-rc.2` composition.

## GitHub distribution

A second throwaway profile installed the pushed repository over HTTPS:

```sh
dsh plugin --profile relay-gh add git+https://github.com/chofuhoyu/dsh-review-relay.git
```

The install completed, the profile composed `# == dsh-review-relay / id: review-relay / name: dsh-review-relay`, and the linked package contained the committed `lib/index.js`, `lib/client.js`, types, patch, locales, icon, and docs. The `github:` shorthand can resolve to SSH; use the `git+https://` form when the machine has no GitHub SSH configuration.

## Real manual click-through

- Date: 2026-10-31
- DSH: `0.2.1-rc.5`, installed globally; plugin linked into the `web` profile
- Permission preset **Auto** (auto review on), approval policy `ask`

```sh
npm i -g @deepseek-ai/dsh@0.2.1-rc.5
dsh plugin --profile web add /home/chofu/code/dsh-review-relay   # recorded as link:
dsh --profile web --dump-config | grep -A2 review-relay
```

`--dump-config` printed the expected `# == dsh-review-relay` / `id: review-relay` / `name: dsh-review-relay` rows, and the profile manifest gained `dsh-review-relay` under `dsh.profile.bundles`.

A single `rm -rf /tmp/dsh-review-relay-probe` call (a nonexistent path, chosen so a mis-allow would be harmless) was denied by the reviewer and the card was answered with a note rather than a plain rejection. The relayed user message arrived before the next model request and matched the fixed template: note block, verbatim English reason, and a separate `translated to zh-CN` block. The tool result still read `the user rejected tool "bash"`, and exactly one message was injected.

This exercises AC-1 (card with translation), AC-3 (note forwarded verbatim), and AC-4 (reviewer reason verbatim plus translation), on the real browser path that the automated suite drives with a test answerer.

The linked install also pins down the development loop: `npm run build` refreshes `lib/client.js` and the client-HMR watcher polls the artifact and pushes the new revision over SSE, so open pages pick it up without a restart; Host changes (`lib/index.js`, `lib/host/*.js`) need a `dsh web` restart because the profile runs with `hmr.root: []`; profile patch edits in `cordis.patch.yml` are watched and applied live.

### Still unverified

- **AC-11** allow-once: covered by tests (`does not inject when the user allows the call`), never clicked against a live denial.
- **AC-13** locale switching: dictionary-level tests only; the card has not been switched between zh and en in a real UI.
- **AC-7** ordinary approval with auto review absent: simulated by the priority selector; the real composition without `@deepseek-ai/dsh-experimental-auto-review` has not been booted.
- **AC-8** no connected client: only the "config endpoint unavailable" path is simulated; a client disconnecting mid-approval has not been observed.
- **AC-9** Host restart with a pending session: `Session.create` cold-load is tested, but a real `dsh web` restart with the plugin installed has not been replayed.
- Injection-failure toast: failures are Host-log only by design; the approval result is unaffected.

## 0.2.0 tool-result change

- Date: 2026-10-31
- Change: the default relay target moved from a synthetic `user/message` (0.1.0) to the denied call's own `tool/result`, enriched in `tools/post-execute`.

Automated verification:

```sh
npm run check
```

Result: typecheck clean; **113 tests across 14 files** pass; Host/client builds succeed; `npm run verify:client` reports the loader wrapper, factory, inject list, and priority-0 selection as valid.

The integration suite now asserts the full path:

- the denied tool result contains `Error: the user rejected tool "probe"` plus one appended block with the note, the verbatim reviewer reason, and the translation;
- the session log contains no relay `user/message` for that rejection;
- the same assertions hold after a cold `Session.create` replay;
- direct final denials, `forwardMode: always`, translation failure, Chinese reasons, duplicate call ids, note-only rejections, and ordinary-approval notes all land in the tool result;
- `delivery: 'inject'` still produces the legacy synthetic user message.

Live browser check: **pending**. The running `web` profile still has the 0.1.0 Host module loaded; Host changes need a `dsh web` restart (client changes alone are picked up by the HMR watcher). After the restart, repeat AC-3/AC-4 and confirm the note is under the rejected bash row, not a user bubble.
