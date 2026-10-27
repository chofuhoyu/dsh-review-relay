# Verification log

- Date: 2026-10-27
- DSH: `0.2.1-rc.2` (source commit `687f282e8625c6b8d11ff58211a90524be2e4317`)
- Plugin: `dsh-review-relay@0.1.0`

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

## Not yet exercised

- A manual end-to-end click-through with a live Auto review denial in the browser (the automated suite uses the real Auto review plugin and a real Agent loop, but drives the approval through a test answerer).
- Injection-failure toast: failures are Host-log only by design; the approval result is unaffected.
