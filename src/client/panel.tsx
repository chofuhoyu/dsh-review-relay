/** Browser approval card: reviewer reason, optional note, and explicit decisions. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ChatNode, ChatSnapshot, UseChat } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { TranslationView } from '../shared/types.js'
import type { ApprovalLike, MatchedApproval } from './select.js'
import { forwardForced, forwardVisible, initialForward } from './select.js'
import { fetchTranslation, submitNote } from './api.js'
import { showRelayToast } from './toast.js'
import type { PublicConfig } from '../shared/types.js'

/** Injection seat supplied by the chain registration. */
export interface ReviewRelayInjected {
  readonly config: PublicConfig
  readonly getLocale: () => string
  readonly resolveReason: (reason: NonNullable<ApprovalLike['displayReason']>) => string
}

/**
 * Props the card actually consumes. The slot registration provides the full
 * composer standard props; this narrower parameter is deliberately compatible
 * so the card does not depend on unrelated standard seats.
 */
export interface ReviewRelayPanelProps extends ReviewRelayInjected {
  readonly matched: MatchedApproval
  readonly t: TranslateNS<'review-relay'>
  readonly useChat?: UseChat | undefined
}

type TranslationState =
  | { readonly status: 'idle' | 'loading' | 'skipped' | 'failed' }
  | { readonly status: 'ok'; readonly text: string; readonly targetLanguage: string }

interface SubmitError {
  readonly code: string
  readonly message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function noteId(key: string): string {
  return `review-relay-note-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

function formatError(error: SubmitError, config: PublicConfig, t: ReviewRelayPanelProps['t']): string {
  switch (error.code) {
    case 'note-too-long':
      return t('noteTooLong', { max: String(config.noteMaxChars) })
    case 'note-disabled':
      return t('error.noteDisabled')
    case 'approval-not-pending':
      return t('alreadySettled')
    case 'network':
      return t('submitFailed', { message: t('error.network') })
    default:
      return t('submitFailed', { message: error.message === '' ? t('error.unknown') : error.message })
  }
}

/**
 * Render one pending approval with the reviewer reason, translation, note
 * input, forward choice, and safe allow/reject actions.
 * @param props - chain-matched approval and injected config/locale helpers.
 * @returns the approval card.
 */
export function ReviewRelayPanel(props: ReviewRelayPanelProps): ReactNode {
  const { approval, review } = props.matched
  const [busy, setBusy] = useState<'allow' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [forward, setForward] = useState(() => initialForward(props.config))
  const [error, setError] = useState<SubmitError | null>(null)
  const [translation, setTranslation] = useState<TranslationState>({ status: 'idle' })
  const [showOriginalText, setShowOriginalText] = useState(false)
  const [aborted, setAborted] = useState(approval.signal?.aborted === true)
  const [settled, setSettled] = useState(!approval.answerable)
  const root = useRef<HTMLDivElement | null>(null)
  const composing = useRef(false)
  const compositionEnded = useRef(false)

  const canForward = forwardVisible(props.config, props.matched)
  const forced = forwardForced(props.config)
  const noteVisible = props.config.noteEnabled
  const noteTooLong = note.length > props.config.noteMaxChars
  const editable = busy === null && !aborted && !settled && approval.answerable

  useEffect(() => {
    const signal = approval.signal
    if (signal === undefined) return
    const onAbort = (): void => {
      setAborted(true)
      setBusy(null)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    return () => { signal.removeEventListener('abort', onAbort) }
  }, [approval.signal])

  const reviewerReason = review?.reason
  const translationEnabled = props.config.translate && props.config.translationProvider !== 'off'
  useEffect(() => {
    if (reviewerReason === undefined || !translationEnabled) {
      setTranslation({ status: 'skipped' })
      return
    }
    let cancelled = false
    setTranslation({ status: 'loading' })
    void fetchTranslation(
      approval.sessionId,
      approval.callId ?? '',
      props.getLocale(),
      props.config.translationTimeoutMs + 2000,
    ).then((view: TranslationView | undefined) => {
      if (cancelled) return
      if (view === undefined) {
        setTranslation({ status: 'failed' })
        return
      }
      setTranslation(view.status === 'ok'
        ? { status: 'ok', text: view.text, targetLanguage: view.targetLanguage }
        : { status: view.status })
    }).catch(() => {
      if (!cancelled) setTranslation({ status: 'failed' })
    })
    return () => { cancelled = true }
  }, [
    approval.key,
    approval.sessionId,
    approval.callId,
    reviewerReason,
    translationEnabled,
    props.config.translationTimeoutMs,
    props.getLocale,
  ])

  const original = reviewerReason
  const translated = translation.status === 'ok' && translation.text.trim() !== '' ? translation.text : undefined
  const showingOriginal = showOriginalText || translated === undefined
  const plainReason = approval.displayReason !== undefined
    ? props.resolveReason(approval.displayReason)
    : approval.reason
  const displayedReason = review === null
    ? plainReason ?? props.t('reviewerMissing')
    : original !== undefined && original !== ''
      ? showingOriginal ? original : translated ?? original
      : props.t('reviewerMissing')

  const allow = async (): Promise<void> => {
    if (!editable) return
    setBusy('allow')
    setError(null)
    try {
      await approval.answer('allowed-once')
      setSettled(true)
    } catch {
      setError({ code: 'approval-not-pending', message: '' })
      setSettled(!approval.answerable)
    } finally {
      setBusy(null)
    }
  }

  const rejectWithoutNote = async (): Promise<void> => {
    if (!editable) return
    setBusy('reject')
    setError(null)
    try {
      await approval.answer('rejected')
      setSettled(true)
    } catch {
      setError({ code: 'approval-not-pending', message: '' })
      setSettled(!approval.answerable)
    } finally {
      setBusy(null)
    }
  }

  const reject = async (withNote: boolean): Promise<void> => {
    if (!editable || noteTooLong) return
    setBusy('reject')
    setError(null)
    const noteText = withNote && noteVisible ? note : ''
    const forwardChoice = withNote && canForward && forward
    const relayed = noteText.trim() !== '' || forwardChoice
    try {
      if (relayed) {
        const result = await submitNote({
          sessionId: approval.sessionId,
          callId: approval.callId ?? '',
          note: noteText,
          forward: forwardChoice,
          locale: props.getLocale(),
        })
        if (!result.ok) {
          setError({ code: result.code, message: result.message })
          return
        }
      }
      await approval.answer('rejected')
      setSettled(true)
      if (relayed) showRelayToast(props.t('relayed'))
    } catch {
      setError({ code: 'approval-not-pending', message: '' })
      setSettled(!approval.answerable)
    } finally {
      setBusy(null)
    }
  }

  const keydown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement
    const inEditable = target.closest('textarea, input, select, [contenteditable="true"], [contenteditable=""]') !== null
    if (inEditable) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        if (!composing.current && !event.nativeEvent.isComposing) void reject(true)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        target.blur()
      }
      return
    }
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    if (event.key === 'Enter' && target.closest('button, a[href], [role="button"]') !== null) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    if (composing.current || compositionEnded.current || event.nativeEvent.isComposing) return
    if (event.key === 'Enter') void allow()
    else void reject(false)
  }

  const rejectLabel = busy === 'reject'
    ? props.t('submitting')
    : noteVisible && note.trim() !== '' || (canForward && forward)
      ? props.t('rejectWithNote')
      : props.t('reject')

  return (
    <div
      ref={root}
      className="rr-root"
      role="group"
      aria-label={props.t('dialog.aria')}
      aria-busy={busy !== null}
      data-review-relay-card={approval.key}
      tabIndex={0}
      onKeyDown={keydown}
      onKeyUpCapture={() => { compositionEnded.current = false }}
      onCompositionStartCapture={() => { composing.current = true }}
      onCompositionEndCapture={() => { composing.current = false; compositionEnded.current = true }}
    >
      <div className="rr-head">
        <span className="rr-dot" aria-hidden="true" />
        <span className="rr-title">{review === null ? props.t('title.plain') : props.t('title.review')}</span>
        <span className="rr-waiting">{busy === null ? props.t('waiting') : props.t('submitting')}</span>
      </div>
      <div className="rr-meta">
        <span className="rr-tool">{props.t('tool')}: {approval.toolName}</span>
        {approval.callId !== undefined && approval.callId !== ''
          ? <span>{props.t('call', { id: approval.callId.slice(-8) })}</span>
          : null}
      </div>

      {review !== null && typeof props.useChat === 'function'
        ? <CommandDetail callId={approval.callId ?? ''} useChat={props.useChat} label={props.t('command')} />
        : null}

      <div className="rr-section">
        <div className="rr-section-head">
          <span className="rr-label">{review === null ? props.t('approvalReason') : props.t('reviewerReason')}</span>
          {review !== null && translated !== undefined && props.config.showOriginal
            ? (
              <button type="button" className="rr-toggle" onClick={() => { setShowOriginalText((value) => !value) }}>
                {showOriginalText ? props.t('hideOriginal') : props.t('showOriginal')}
              </button>
            )
            : null}
        </div>
        <div className="rr-reason" data-review-relay-reason="">{displayedReason}</div>
        {review !== null && translation.status === 'loading' ? <div className="rr-status">{props.t('translating')}</div> : null}
        {review !== null && translation.status === 'failed' ? <div className="rr-status">{props.t('translationFailed')}</div> : null}
        {review !== null && translation.status === 'ok' && props.config.translate
          ? <div className="rr-privacy">{props.t('translationPrivacy')}</div>
          : null}
      </div>

      {noteVisible
        ? (
          <div className="rr-note">
            <label className="rr-label" htmlFor={noteId(approval.key)}>{props.t('noteLabel')}</label>
            <textarea
              id={noteId(approval.key)}
              className="rr-textarea"
              value={note}
              placeholder={props.t('notePlaceholder')}
              disabled={!editable}
              rows={3}
              onChange={(event) => { setNote(event.target.value) }}
            />
            <div className="rr-row">
              <span className="rr-counter" data-over={noteTooLong}>{props.t('noteCounter', { count: String(note.length), max: String(props.config.noteMaxChars) })}</span>
            </div>
            {noteTooLong
              ? <div className="rr-error" role="alert">{props.t('noteTooLong', { max: String(props.config.noteMaxChars) })}</div>
              : null}
          </div>
        )
        : null}

      {canForward
        ? (
          <label className="rr-check">
            <input
              type="checkbox"
              checked={forward}
              disabled={!editable || forced}
              onChange={(event) => { setForward(event.target.checked) }}
            />
            {forced ? props.t('forwardForced') : props.t('forwardReviewer')}
          </label>
        )
        : null}

      {error !== null
        ? (
          <div className="rr-error" role="alert">
            <span>{formatError(error, props.config, props.t)}</span>
            {error.code !== 'note-too-long'
              ? (
                <>
                  <button type="button" className="rr-btn rr-btn-ghost" disabled={!editable} onClick={() => { setError(null); void reject(true) }}>
                    {props.t('retry')}
                  </button>
                  <button type="button" className="rr-btn rr-btn-ghost" disabled={!editable} onClick={() => { setError(null); void rejectWithoutNote() }}>
                    {props.t('rejectWithoutNote')}
                  </button>
                </>
              )
              : null}
          </div>
        )
        : null}

      {!editable && busy === null
        ? <div className="rr-status">{aborted ? props.t('cancelled') : props.t('alreadySettled')}</div>
        : null}

      <div className="rr-actions">
        <button type="button" className="rr-btn rr-btn-outline" disabled={!editable} onClick={() => { void allow() }}>
          {busy === 'allow' ? props.t('submitting') : props.t('allowOnce')}
        </button>
        <button type="button" className="rr-btn rr-btn-primary" disabled={!editable || noteTooLong} onClick={() => { void reject(true) }}>
          {rejectLabel}
        </button>
      </div>
    </div>
  )
}

/** Render the correlated command without taking over the official detail slot. */
function CommandDetail({ callId, useChat, label }: {
  readonly callId: string
  readonly useChat: UseChat
  readonly label: string
}): ReactNode {
  const command = useChat((snapshot: ChatSnapshot) => {
    for (const node of snapshot.nodes.values()) {
      if (node.kind !== 'tool-call') continue
      const root = (node as ChatNode<'tool-call'>).data.root
      if (root.callId !== callId || 'kind' in root || root.phase !== 'start') continue
      try {
        const args: unknown = JSON.parse(root.argsRaw)
        if (isRecord(args) && typeof args['command'] === 'string') return args['command']
      } catch {
        return undefined
      }
    }
    return undefined
  })
  if (command === undefined || command === '') return null
  return (
    <div className="rr-section rr-command">
      <div className="rr-label">{label}</div>
      <pre>{command}</pre>
    </div>
  )
}
