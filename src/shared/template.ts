/**
 * Fixed injection template. The labels are English on purpose: the model sees
 * stable block names, while the note and reviewer text keep their own language.
 */

/** Inputs for one relay message. */
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
 * Render the fixed relay message, omitting every empty block.
 * @param input - tool name, optional note, optional reviewer text, optional translation.
 * @returns the message text, or undefined when there is nothing to relay.
 */
export function buildRelayMessage(input: RelayTemplateInput): string | undefined {
  const sections: string[] = [`User rejected tool "${input.toolName}".`]
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
  return sections.length === 1 ? undefined : sections.join('\n\n')
}
