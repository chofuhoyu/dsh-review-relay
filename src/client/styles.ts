/** Injected card styles; only host theme tokens (with conservative fallbacks). */
export const STYLE_MARKER = 'dsh-review-relay'

export const STYLES = `
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
`

/**
 * Install the single plugin-owned style element.
 * @returns disposer removing only a style this call created.
 */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector(`style[data-review-relay="${STYLE_MARKER}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset['reviewRelay'] = STYLE_MARKER
  style.textContent = STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}
