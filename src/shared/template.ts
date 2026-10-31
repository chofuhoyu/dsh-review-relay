/**
 * Relay text templates.
 *
 * The default path appends a block to the rejected tool call's own result, so
 * the labels are English and stable for the model. The legacy path builds a
 * standalone user message; it is kept for `delivery: 'inject' | 'followup'`.
 */

/** Inputs for one relay text. */
export interface RelayTemplateInput {
  readonly toolName: string
  readonly note?: string | undefined
  readonly reviewerReason?: string | undefined
  readonly translation?: string | undefined
  readonly targetLanguage?: string | undefined
  readonly maxForwardChars: number
}

/** Result of applying the explicit reviewer-reason truncation. */
export interface TruncatedReason {
  readonly text: string
  readonly truncated: boolean
  readonly originalLength: number
}

/**
 * Truncate a reviewer reason without touching its interior whitespace.
 * @param reason - verbatim reviewer text.
 * @param max - maximum retained UTF-16 code units.
 * @returns the retained text plus an explicit marker when truncated.
 */
export function truncateReviewerReason(reason: string, max: number): TruncatedReason {
  if (reason.length <= max) {
    return { text: reason, truncated: false, originalLength: reason.length }
  }
  return {
    text: `${reason.slice(0, max)}\n\n[reviewer reason truncated at ${max} chars]`,
    truncated: true,
    originalLength: reason.length,
  }
}

/**
 * Render the blocks appended to a rejected tool result. The result's own
 * `Error: the user rejected tool "..."` line already states the decision, so
 * this text carries only the note, the reviewer reason, and the translation.
 * @param input - tool name, optional note, optional reviewer text, optional translation.
 * @returns the appended text, or undefined when there is nothing to relay.
 */
export function buildToolResultRelay(input: RelayTemplateInput): string | undefined {
  const sections = relaySections(input)
  return sections.length === 0 ? undefined : sections.join('\n\n')
}

/**
 * Render the legacy synthetic user message used by `delivery: 'inject'` and
 * `delivery: 'followup'`.
 * @param input - tool name, optional note, optional reviewer text, optional translation.
 * @returns the message text, or undefined when there is nothing to relay.
 */
export function buildRelayMessage(input: RelayTemplateInput): string | undefined {
  const sections = relaySections(input)
  return sections.length === 0
    ? undefined
    : [`User rejected tool "${input.toolName}".`, ...sections].join('\n\n')
}

/** Shared note/reason/translation blocks, in model-facing order. */
function relaySections(input: RelayTemplateInput): string[] {
  const sections: string[] = []
  const note = input.note !== undefined && input.note.trim() !== '' ? input.note : undefined
  if (note !== undefined) sections.push(`User note:\n${note}`)
  if (input.reviewerReason !== undefined && input.reviewerReason !== '') {
    const reviewer = truncateReviewerReason(input.reviewerReason, input.maxForwardChars)
    sections.push(`Reviewer reason (verbatim):\n${reviewer.text}`)
    if (input.translation !== undefined
      && input.translation !== ''
      && input.translation !== input.reviewerReason
      && input.targetLanguage !== undefined
      && input.targetLanguage !== '') {
      sections.push(`Reviewer reason (translated to ${input.targetLanguage}):\n${input.translation}`)
    }
  }
  return sections
}
