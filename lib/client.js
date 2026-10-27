window.__ModuleLoader__.load({ id: "dsh-review-relay", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/api.ts
var BASE = "api/review-relay";
function endpoint(path) {
  return `${BASE}/${path}`;
}
function uiLocale(active) {
  if (active === void 0 || active === "") return "zh-CN";
  if (active === "zh") return "zh-CN";
  if (active === "en") return "en";
  return active;
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isBoolean(value) {
  return typeof value === "boolean";
}
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isString(value) {
  return typeof value === "string";
}
function isPublicConfig(value) {
  if (!isRecord(value)) return false;
  return value["protocol"] === 1 && isBoolean(value["enabled"]) && isBoolean(value["noteEnabled"]) && isBoolean(value["noteForNonReviewApprovals"]) && isNumber(value["noteMaxChars"]) && (value["forwardMode"] === "ask" || value["forwardMode"] === "always" || value["forwardMode"] === "never") && isBoolean(value["defaultForward"]) && isNumber(value["maxForwardChars"]) && isString(value["targetLanguage"]) && isString(value["resolvedTargetLanguage"]) && isBoolean(value["showOriginal"]) && isBoolean(value["translate"]) && isBoolean(value["translateForForward"]) && (value["translationProvider"] === "llm" || value["translationProvider"] === "translator" || value["translationProvider"] === "off") && isNumber(value["translationTimeoutMs"]) && isString(value["reviewerReasonPattern"]);
}
function isTranslationView(value) {
  if (!isRecord(value)) return false;
  if (!isString(value["targetLanguage"])) return false;
  if (value["status"] === "ok") return isString(value["text"]);
  return value["status"] === "skipped" || value["status"] === "failed";
}
async function fetchConfig(locale, signal) {
  try {
    const response = await fetch(`${endpoint("config")}?locale=${encodeURIComponent(locale)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal
    });
    if (!response.ok) return void 0;
    const value = await response.json();
    return isPublicConfig(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
async function submitNote(request, signal) {
  try {
    const response = await fetch(endpoint("note"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store",
      body: JSON.stringify(request),
      ...signal === void 0 ? {} : { signal }
    });
    if (response.ok) return { ok: true };
    let code = "unknown";
    let message = `HTTP ${String(response.status)}`;
    try {
      const value = await response.json();
      if (isRecord(value)) {
        if (isString(value["code"])) code = value["code"];
        if (isString(value["message"])) message = value["message"];
      }
    } catch {
    }
    return { ok: false, code, message };
  } catch (error) {
    return {
      ok: false,
      code: "network",
      message: error instanceof Error ? error.message : "network error"
    };
  }
}
async function fetchTranslation(sessionId, callId, locale, timeoutMs) {
  const controller = new AbortController();
  const timer2 = setTimeout(() => {
    controller.abort(new Error("translation request timed out"));
  }, timeoutMs);
  try {
    const query = new URLSearchParams({ sessionId, callId, locale });
    const response = await fetch(`${endpoint("translation")}?${query.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return void 0;
    const value = await response.json();
    return isTranslationView(value) ? value : void 0;
  } catch {
    return void 0;
  } finally {
    clearTimeout(timer2);
  }
}

// src/client/locales.ts
var NS = "review-relay";
var zh = {
  "dialog.aria": "\u5BA1\u67E5\u56DE\u4F20\u5BA1\u6279\u5361\u7247",
  "title.review": "Auto review \u62D2\u7EDD\u4E86\u6B64\u8C03\u7528",
  "title.plain": "\u9700\u8981\u4F60\u786E\u8BA4\u6B64\u64CD\u4F5C",
  "waiting": "\u7B49\u5F85\u4F60\u7684\u51B3\u5B9A",
  "tool": "\u5DE5\u5177",
  "call": "\u8C03\u7528 {id}",
  "reviewerReason": "\u5BA1\u67E5\u610F\u89C1",
  "approvalReason": "\u5BA1\u6279\u539F\u56E0",
  "reviewerMissing": "\u5BA1\u67E5\u610F\u89C1\u672A\u63D0\u4F9B\u539F\u56E0\u3002",
  "translated": "\u8BD1\u6587",
  "original": "\u539F\u6587",
  "showOriginal": "\u67E5\u770B\u539F\u6587",
  "hideOriginal": "\u6536\u8D77\u539F\u6587",
  "translating": "\u7FFB\u8BD1\u4E2D\u2026",
  "translationFailed": "\u7FFB\u8BD1\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u539F\u6587",
  "translationPrivacy": "\u5BA1\u67E5\u610F\u89C1\u4F1A\u53D1\u9001\u7ED9\u5F53\u524D\u6A21\u578B\u63D0\u4F9B\u65B9\u8FDB\u884C\u7FFB\u8BD1\u3002",
  "noteLabel": "\u8BF4\u660E\uFF08\u53EF\u9009\uFF0C\u4F1A\u4F5C\u4E3A\u7528\u6237\u6D88\u606F\u53D1\u9001\u7ED9\u6B63\u5728\u5DE5\u4F5C\u7684 agent\uFF09",
  "notePlaceholder": "\u4F8B\u5982\uFF1A\u4E0D\u8981\u5220 build/\uFF0C\u6539\u7528 pnpm clean",
  "noteCounter": "{count} / {max}",
  "noteTooLong": "\u8BF4\u660E\u8D85\u8FC7 {max} \u5B57\uFF0C\u8BF7\u7F29\u77ED\u540E\u518D\u63D0\u4EA4",
  "forwardReviewer": "\u4E00\u5E76\u8F6C\u4EA4\u5BA1\u67E5\u610F\u89C1\u539F\u6587",
  "forwardForced": "\u5BA1\u67E5\u610F\u89C1\u539F\u6587\u5C06\u4E00\u5E76\u8F6C\u4EA4",
  "allowOnce": "\u5141\u8BB8\u4E00\u6B21",
  "rejectWithNote": "\u62D2\u7EDD\u5E76\u53D1\u9001\u8BF4\u660E",
  "reject": "\u62D2\u7EDD",
  "submitting": "\u63D0\u4EA4\u4E2D\u2026",
  "submitFailed": "\u63D0\u4EA4\u5931\u8D25\uFF1A{message}",
  "retry": "\u91CD\u8BD5",
  "rejectWithoutNote": "\u4E0D\u5E26\u8BF4\u660E\u76F4\u63A5\u62D2\u7EDD",
  "alreadySettled": "\u6B64\u5BA1\u6279\u5DF2\u5904\u7406",
  "cancelled": "\u5BA1\u6279\u5DF2\u53D6\u6D88",
  "closed": "\u5DF2\u5904\u7406",
  "command": "\u547D\u4EE4",
  "relayed": "\u5DF2\u62D2\u7EDD\uFF0C\u8BF4\u660E\u5DF2\u8F6C\u4EA4\u7ED9 agent",
  "error.network": "\u7F51\u7EDC\u9519\u8BEF",
  "error.noteTooLong": "\u8BF4\u660E\u8FC7\u957F",
  "error.noteDisabled": "\u5F53\u524D\u914D\u7F6E\u4E0D\u5141\u8BB8\u9644\u5E26\u8BF4\u660E",
  "error.notPending": "\u5BA1\u6279\u5DF2\u5904\u7406\u6216\u4E0D\u5B58\u5728",
  "error.unknown": "\u672A\u77E5\u9519\u8BEF"
};
var en = {
  "dialog.aria": "Review relay approval card",
  "title.review": "Auto review denied this call",
  "title.plain": "This action needs your approval",
  "waiting": "Waiting for your decision",
  "tool": "Tool",
  "call": "Call {id}",
  "reviewerReason": "Reviewer reason",
  "approvalReason": "Approval reason",
  "reviewerMissing": "The reviewer did not provide a reason.",
  "translated": "Translation",
  "original": "Original",
  "showOriginal": "Show original",
  "hideOriginal": "Hide original",
  "translating": "Translating\u2026",
  "translationFailed": "Translation failed; showing the original",
  "translationPrivacy": "The reviewer reason is sent to the current model provider for translation.",
  "noteLabel": "Note (optional; sent to the working agent as a user message)",
  "notePlaceholder": "e.g. do not delete build/; use pnpm clean",
  "noteCounter": "{count} / {max}",
  "noteTooLong": "The note exceeds {max} characters; shorten it before submitting",
  "forwardReviewer": "Forward the reviewer reason verbatim",
  "forwardForced": "The reviewer reason will be forwarded verbatim",
  "allowOnce": "Allow once",
  "rejectWithNote": "Reject and send note",
  "reject": "Reject",
  "submitting": "Submitting\u2026",
  "submitFailed": "Submission failed: {message}",
  "retry": "Retry",
  "rejectWithoutNote": "Reject without a note",
  "alreadySettled": "This approval is already settled",
  "cancelled": "This approval was cancelled",
  "closed": "Settled",
  "command": "Command",
  "relayed": "Rejected; the note was relayed to the agent",
  "error.network": "network error",
  "error.noteTooLong": "note is too long",
  "error.noteDisabled": "notes are disabled by configuration",
  "error.notPending": "the approval is already settled or missing",
  "error.unknown": "unknown error"
};

// src/client/panel.tsx
var import_react2 = require("react");

// src/shared/parse.ts
var DIRECT_DENY_PATTERN = /^Auto review rejected tool "[^"]+"; its body was not executed$/;
var REVIEW_FAILURE_PATTERN = /^Auto review of tool "[^"]+" failed; its body was not executed(?:$|: )/;
var DISPLAY_FALLBACK_PATTERN = /^Auto review 拒绝了此调用：(?<reason>[\s\S]+)$/;
function compileReviewerPattern(source) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new TypeError("review-relay: reviewerReasonPattern must be a non-empty regular expression");
  }
  let pattern;
  try {
    pattern = new RegExp(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TypeError(`review-relay: reviewerReasonPattern is not a valid regular expression: ${detail}`);
  }
  if (!pattern.source.includes("(?<tool>")) {
    throw new TypeError('review-relay: reviewerReasonPattern must declare a named "tool" group');
  }
  if (!pattern.source.includes("(?<reason>")) {
    throw new TypeError('review-relay: reviewerReasonPattern must declare a named "reason" group');
  }
  return pattern;
}
function parseReviewAsk(input, pattern) {
  const reason = input.reason;
  if (reason !== void 0) {
    if (DIRECT_DENY_PATTERN.test(reason) || REVIEW_FAILURE_PATTERN.test(reason)) return void 0;
    const match = pattern.exec(reason);
    if (match !== null) {
      const tool = match.groups?.["tool"];
      if (typeof tool === "string" && tool.length > 0) {
        const captured = match.groups?.["reason"];
        return {
          toolName: tool,
          reason: typeof captured === "string" && captured.length > 0 ? captured : void 0
        };
      }
    }
  }
  if (reason === void 0) {
    const localized = input.displayReason?.zh;
    if (typeof localized === "string") {
      const fallback = DISPLAY_FALLBACK_PATTERN.exec(localized);
      const captured = fallback?.groups?.["reason"];
      if (typeof captured === "string" && captured.length > 0) {
        return { toolName: input.toolName, reason: captured };
      }
    }
  }
  return void 0;
}

// src/client/select.ts
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isApprovalLike(value) {
  if (!isRecord2(value)) return false;
  return value["kind"] === "approval" && typeof value["key"] === "string" && typeof value["sessionId"] === "string" && typeof value["toolName"] === "string" && (value["callId"] === void 0 || typeof value["callId"] === "string") && (value["reason"] === void 0 || typeof value["reason"] === "string") && (value["displayReason"] === void 0 || isRecord2(value["displayReason"])) && typeof value["answerable"] === "boolean" && typeof value["answer"] === "function";
}
function compileClientPattern(config) {
  return compileReviewerPattern(config.reviewerReasonPattern);
}
function matchApproval(value, config, pattern) {
  if (!config.enabled) return null;
  if (!isApprovalLike(value)) return null;
  if (value.callId === void 0 || value.callId === "") return null;
  const review = parseReviewAsk({
    toolName: value.toolName,
    ...value.reason === void 0 ? {} : { reason: value.reason },
    ...value.displayReason === void 0 ? {} : { displayReason: value.displayReason }
  }, pattern) ?? null;
  if (review === null && (!config.noteForNonReviewApprovals || !config.noteEnabled)) return null;
  return { approval: value, review };
}
function initialForward(config) {
  switch (config.forwardMode) {
    case "always":
      return true;
    case "never":
      return false;
    case "ask":
      return config.defaultForward;
  }
}
function forwardVisible(config, matched) {
  return matched.review !== null && matched.review.reason !== void 0 && config.forwardMode !== "never";
}
function forwardForced(config) {
  return config.forwardMode === "always";
}

// src/client/toast.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var nextId = 0;
var current = null;
var timer;
var listeners = /* @__PURE__ */ new Set();
function publish(next) {
  current = next;
  for (const listener of [...listeners]) listener();
}
function showRelayToast(text, error = false) {
  if (typeof document === "undefined") return;
  nextId += 1;
  publish({ id: nextId, text, error });
  if (timer !== void 0) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = void 0;
    publish(null);
  }, 4e3);
}
function subscribeRelayToast(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function relayToastSnapshot() {
  return current;
}
function disposeRelayToast() {
  if (timer !== void 0) clearTimeout(timer);
  timer = void 0;
  publish(null);
  listeners.clear();
}
function RelayToastView() {
  const toast = (0, import_react.useSyncExternalStore)(subscribeRelayToast, relayToastSnapshot, relayToastSnapshot);
  if (toast === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: toast.error ? "rr-toast rr-toast-error" : "rr-toast", role: "status", "aria-live": "polite", children: toast.text });
}

// src/client/panel.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function noteId(key) {
  return `review-relay-note-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}
function formatError(error, config, t) {
  switch (error.code) {
    case "note-too-long":
      return t("noteTooLong", { max: String(config.noteMaxChars) });
    case "note-disabled":
      return t("error.noteDisabled");
    case "approval-not-pending":
      return t("alreadySettled");
    case "network":
      return t("submitFailed", { message: t("error.network") });
    default:
      return t("submitFailed", { message: error.message === "" ? t("error.unknown") : error.message });
  }
}
function ReviewRelayPanel(props) {
  const { approval, review } = props.matched;
  const [busy, setBusy] = (0, import_react2.useState)(null);
  const [note, setNote] = (0, import_react2.useState)("");
  const [forward, setForward] = (0, import_react2.useState)(() => initialForward(props.config));
  const [error, setError] = (0, import_react2.useState)(null);
  const [translation, setTranslation] = (0, import_react2.useState)({ status: "idle" });
  const [showOriginalText, setShowOriginalText] = (0, import_react2.useState)(false);
  const [aborted, setAborted] = (0, import_react2.useState)(approval.signal?.aborted === true);
  const [settled, setSettled] = (0, import_react2.useState)(!approval.answerable);
  const root = (0, import_react2.useRef)(null);
  const composing = (0, import_react2.useRef)(false);
  const compositionEnded = (0, import_react2.useRef)(false);
  const canForward = forwardVisible(props.config, props.matched);
  const forced = forwardForced(props.config);
  const noteVisible = props.config.noteEnabled;
  const noteTooLong = note.length > props.config.noteMaxChars;
  const editable = busy === null && !aborted && !settled && approval.answerable;
  (0, import_react2.useEffect)(() => {
    const signal = approval.signal;
    if (signal === void 0) return;
    const onAbort = () => {
      setAborted(true);
      setBusy(null);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    return () => {
      signal.removeEventListener("abort", onAbort);
    };
  }, [approval.signal]);
  const reviewerReason = review?.reason;
  const translationEnabled = props.config.translate && props.config.translationProvider !== "off";
  (0, import_react2.useEffect)(() => {
    if (reviewerReason === void 0 || !translationEnabled) {
      setTranslation({ status: "skipped" });
      return;
    }
    let cancelled = false;
    setTranslation({ status: "loading" });
    void fetchTranslation(
      approval.sessionId,
      approval.callId ?? "",
      props.getLocale(),
      props.config.translationTimeoutMs + 2e3
    ).then((view) => {
      if (cancelled) return;
      if (view === void 0) {
        setTranslation({ status: "failed" });
        return;
      }
      setTranslation(view.status === "ok" ? { status: "ok", text: view.text, targetLanguage: view.targetLanguage } : { status: view.status });
    }).catch(() => {
      if (!cancelled) setTranslation({ status: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [
    approval.key,
    approval.sessionId,
    approval.callId,
    reviewerReason,
    translationEnabled,
    props.config.translationTimeoutMs,
    props.getLocale
  ]);
  const original = reviewerReason;
  const translated = translation.status === "ok" && translation.text.trim() !== "" ? translation.text : void 0;
  const showingOriginal = showOriginalText || translated === void 0;
  const plainReason = approval.displayReason !== void 0 ? props.resolveReason(approval.displayReason) : approval.reason;
  const displayedReason = review === null ? plainReason ?? props.t("reviewerMissing") : original !== void 0 && original !== "" ? showingOriginal ? original : translated ?? original : props.t("reviewerMissing");
  const allow = async () => {
    if (!editable) return;
    setBusy("allow");
    setError(null);
    try {
      await approval.answer("allowed-once");
      setSettled(true);
    } catch {
      setError({ code: "approval-not-pending", message: "" });
      setSettled(!approval.answerable);
    } finally {
      setBusy(null);
    }
  };
  const rejectWithoutNote = async () => {
    if (!editable) return;
    setBusy("reject");
    setError(null);
    try {
      await approval.answer("rejected");
      setSettled(true);
    } catch {
      setError({ code: "approval-not-pending", message: "" });
      setSettled(!approval.answerable);
    } finally {
      setBusy(null);
    }
  };
  const reject = async (withNote) => {
    if (!editable || noteTooLong) return;
    setBusy("reject");
    setError(null);
    const noteText = withNote && noteVisible ? note : "";
    const forwardChoice = withNote && canForward && forward;
    const relayed = noteText.trim() !== "" || forwardChoice;
    try {
      if (relayed) {
        const result = await submitNote({
          sessionId: approval.sessionId,
          callId: approval.callId ?? "",
          note: noteText,
          forward: forwardChoice,
          locale: props.getLocale()
        });
        if (!result.ok) {
          setError({ code: result.code, message: result.message });
          return;
        }
      }
      await approval.answer("rejected");
      setSettled(true);
      if (relayed) showRelayToast(props.t("relayed"));
    } catch {
      setError({ code: "approval-not-pending", message: "" });
      setSettled(!approval.answerable);
    } finally {
      setBusy(null);
    }
  };
  const keydown = (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const inEditable = target.closest('textarea, input, select, [contenteditable="true"], [contenteditable=""]') !== null;
    if (inEditable) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (!composing.current && !event.nativeEvent.isComposing) void reject(true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        target.blur();
      }
      return;
    }
    if (event.key !== "Enter" && event.key !== "Escape") return;
    if (event.key === "Enter" && target.closest('button, a[href], [role="button"]') !== null) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (composing.current || compositionEnded.current || event.nativeEvent.isComposing) return;
    if (event.key === "Enter") void allow();
    else void reject(false);
  };
  const rejectLabel = busy === "reject" ? props.t("submitting") : noteVisible && note.trim() !== "" || canForward && forward ? props.t("rejectWithNote") : props.t("reject");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      ref: root,
      className: "rr-root",
      role: "group",
      "aria-label": props.t("dialog.aria"),
      "aria-busy": busy !== null,
      "data-review-relay-card": approval.key,
      tabIndex: 0,
      onKeyDown: keydown,
      onKeyUpCapture: () => {
        compositionEnded.current = false;
      },
      onCompositionStartCapture: () => {
        composing.current = true;
      },
      onCompositionEndCapture: () => {
        composing.current = false;
        compositionEnded.current = true;
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "rr-dot", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "rr-title", children: review === null ? props.t("title.plain") : props.t("title.review") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "rr-waiting", children: busy === null ? props.t("waiting") : props.t("submitting") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "rr-tool", children: [
            props.t("tool"),
            ": ",
            approval.toolName
          ] }),
          approval.callId !== void 0 && approval.callId !== "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.t("call", { id: approval.callId.slice(-8) }) }) : null
        ] }),
        review !== null && typeof props.useChat === "function" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CommandDetail, { callId: approval.callId ?? "", useChat: props.useChat, label: props.t("command") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-section-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "rr-label", children: review === null ? props.t("approvalReason") : props.t("reviewerReason") }),
            review !== null && translated !== void 0 && props.config.showOriginal ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "rr-toggle", onClick: () => {
              setShowOriginalText((value) => !value);
            }, children: showOriginalText ? props.t("hideOriginal") : props.t("showOriginal") }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-reason", "data-review-relay-reason": "", children: displayedReason }),
          review !== null && translation.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-status", children: props.t("translating") }) : null,
          review !== null && translation.status === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-status", children: props.t("translationFailed") }) : null,
          review !== null && translation.status === "ok" && props.config.translate ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-privacy", children: props.t("translationPrivacy") }) : null
        ] }),
        noteVisible ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-note", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "rr-label", htmlFor: noteId(approval.key), children: props.t("noteLabel") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "textarea",
            {
              id: noteId(approval.key),
              className: "rr-textarea",
              value: note,
              placeholder: props.t("notePlaceholder"),
              disabled: !editable,
              rows: 3,
              onChange: (event) => {
                setNote(event.target.value);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "rr-counter", "data-over": noteTooLong, children: props.t("noteCounter", { count: String(note.length), max: String(props.config.noteMaxChars) }) }) }),
          noteTooLong ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-error", role: "alert", children: props.t("noteTooLong", { max: String(props.config.noteMaxChars) }) }) : null
        ] }) : null,
        canForward ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "rr-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "input",
            {
              type: "checkbox",
              checked: forward,
              disabled: !editable || forced,
              onChange: (event) => {
                setForward(event.target.checked);
              }
            }
          ),
          forced ? props.t("forwardForced") : props.t("forwardReviewer")
        ] }) : null,
        error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-error", role: "alert", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: formatError(error, props.config, props.t) }),
          error.code !== "note-too-long" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "rr-btn rr-btn-ghost", disabled: !editable, onClick: () => {
              setError(null);
              void reject(true);
            }, children: props.t("retry") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "rr-btn rr-btn-ghost", disabled: !editable, onClick: () => {
              setError(null);
              void rejectWithoutNote();
            }, children: props.t("rejectWithoutNote") })
          ] }) : null
        ] }) : null,
        !editable && busy === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-status", children: aborted ? props.t("cancelled") : props.t("alreadySettled") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "rr-btn rr-btn-outline", disabled: !editable, onClick: () => {
            void allow();
          }, children: busy === "allow" ? props.t("submitting") : props.t("allowOnce") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "rr-btn rr-btn-primary", disabled: !editable || noteTooLong, onClick: () => {
            void reject(true);
          }, children: rejectLabel })
        ] })
      ]
    }
  );
}
function CommandDetail({ callId, useChat, label }) {
  const command = useChat((snapshot) => {
    for (const node of snapshot.nodes.values()) {
      if (node.kind !== "tool-call") continue;
      const root = node.data.root;
      if (root.callId !== callId || "kind" in root || root.phase !== "start") continue;
      try {
        const args = JSON.parse(root.argsRaw);
        if (isRecord3(args) && typeof args["command"] === "string") return args["command"];
      } catch {
        return void 0;
      }
    }
    return void 0;
  });
  if (command === void 0 || command === "") return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "rr-section rr-command", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "rr-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { children: command })
  ] });
}

// src/client/styles.ts
var STYLE_MARKER = "dsh-review-relay";
var STYLES = `
.rr-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l2, #d8dde6);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1d2129);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(20, 30, 45, 0.08));
  font-size: 13px;
  line-height: 1.55;
}
.rr-root:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #247bbf); outline-offset: 2px; }
.rr-head { display: flex; align-items: center; gap: 8px; }
.rr-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-error, #d64545); flex: none; }
.rr-title { font-weight: 600; flex: 1; min-width: 0; }
.rr-waiting { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; }
.rr-meta { display: flex; gap: 10px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; }
.rr-tool { color: var(--dsw-alias-label-secondary, #4b5563); font-weight: 500; }
.rr-section { display: flex; flex-direction: column; gap: 6px; }
.rr-section-head { display: flex; align-items: center; gap: 8px; }
.rr-label { color: var(--dsw-alias-label-secondary, #4b5563); font-weight: 500; }
.rr-reason {
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, #f7f8fa);
  padding: 10px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.rr-toggle {
  appearance: none;
  border: 0;
  padding: 0;
  background: none;
  color: var(--dsw-alias-link, #247bbf);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.rr-toggle:hover { text-decoration: underline; }
.rr-note { display: flex; flex-direction: column; gap: 6px; }
.rr-textarea {
  width: 100%;
  min-height: 72px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l2, #d8dde6);
  border-radius: 9px;
  padding: 9px 10px;
  background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1d2129);
  font: inherit;
  line-height: 1.5;
}
.rr-textarea:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #247bbf); outline-offset: 1px; }
.rr-textarea:disabled { opacity: 0.6; }
.rr-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rr-counter { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; font-variant-numeric: tabular-nums; }
.rr-counter[data-over="true"] { color: var(--dsw-alias-label-error, #d64545); }
.rr-check { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #4b5563); }
.rr-check input { accent-color: var(--dsw-alias-brand-primary, #247bbf); }
.rr-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.rr-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 7px 13px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.rr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rr-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #247bbf); outline-offset: 1px; }
.rr-btn-primary { background: var(--dsw-alias-button-primary-fill, #247bbf); color: var(--dsw-alias-label-primary-foreground, #fff); }
.rr-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, #1d6aa6); }
.rr-btn-outline { background: transparent; color: var(--dsw-alias-label-primary, #1d2129); border-color: var(--dsw-alias-border-l2, #d8dde6); }
.rr-btn-outline:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(36, 123, 191, 0.08)); }
.rr-btn-ghost { background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); }
.rr-btn-danger { color: var(--dsw-alias-label-error, #d64545); }
.rr-error { color: var(--dsw-alias-label-error, #d64545); font-size: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rr-status { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; }
.rr-privacy { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 11px; }
.rr-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 2147483000;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid var(--dsw-alias-border-l2, #d8dde6);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1d2129);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-2, rgba(20, 30, 45, 0.16));
  font-size: 13px;
  line-height: 1.4;
  pointer-events: none;
}
.rr-toast-error { color: var(--dsw-alias-label-error, #d64545); }
.rr-command pre {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 8px;
  background: var(--dsw-alias-markdown-code-block, #f3f4f6);
  color: var(--dsw-alias-label-primary, #1d2129);
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
}
@media (max-width: 560px) {
  .rr-actions { flex-direction: column-reverse; }
  .rr-btn { width: 100%; }
}
`;
function installStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.querySelector(`style[data-review-relay="${STYLE_MARKER}"]`);
  if (existing !== null) return () => {
  };
  const style = document.createElement("style");
  style.dataset["reviewRelay"] = STYLE_MARKER;
  style.textContent = STYLES;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}

// src/client/index.tsx
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "review-relay: locale");
  ctx.effect(() => installStyles(), "review-relay: styles");
  const lifetime = new AbortController();
  ctx.effect(() => () => {
    lifetime.abort();
    disposeRelayToast();
  }, "review-relay: lifetime");
  const getLocale = () => uiLocale(ctx.locale.getSnapshot().active);
  void install(ctx, getLocale, lifetime.signal);
}
async function install(ctx, getLocale, signal) {
  const config = await fetchConfig(getLocale(), signal);
  if (signal.aborted) return;
  if (config === void 0) {
    console.warn("review-relay: config endpoint unavailable; keeping the official approval card");
    return;
  }
  if (!config.enabled) return;
  let pattern;
  try {
    pattern = compileClientPattern(config);
  } catch (error) {
    console.warn("review-relay: invalid recognition pattern; keeping the official approval card", error);
    return;
  }
  let entryDispose;
  let degraded = false;
  const select = ({ pendingInteraction }) => {
    if (degraded) return null;
    return matchApproval(pendingInteraction, config, pattern);
  };
  try {
    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: "review-relay.toast",
      order: 100
    }, RelayToastView));
  } catch (error) {
    console.warn("review-relay: toast overlay unavailable; card still active", error);
  }
  try {
    ctx.slots.inject("conversation.composer", () => {
      entryDispose = ctx.slots.register({
        name: "conversation.composer",
        priority: 0,
        select,
        locale: NS,
        inject: () => ({
          config,
          getLocale,
          resolveReason: (reason) => ctx.locale.resolveText(reason)
        })
      }, ReviewRelayPanel);
      return entryDispose;
    });
  } catch (error) {
    console.warn("review-relay: could not register the approval card; keeping the official card", error);
    return;
  }
  ctx.effect(() => ctx.slots.onEntryError((key, entry, error) => {
    if (key !== "conversation.composer") return;
    if (entry.locale !== NS) return;
    degraded = true;
    console.error("review-relay: card crashed; falling back to the official approval card", error);
    entryDispose?.();
    entryDispose = void 0;
  }), "review-relay: crash fallback");
}
return module.exports
} });
//# sourceMappingURL=client.js.map
