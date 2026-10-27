/** Client locale dictionaries for the review-relay card. */

export const NS = 'review-relay'

/** Chinese copy (the source of the key union). */
export const zh = {
  'dialog.aria': '审查回传审批卡片',
  'title.review': 'Auto review 拒绝了此调用',
  'title.plain': '需要你确认此操作',
  'waiting': '等待你的决定',
  'tool': '工具',
  'call': '调用 {id}',
  'reviewerReason': '审查意见',
  'approvalReason': '审批原因',
  'reviewerMissing': '审查意见未提供原因。',
  'translated': '译文',
  'original': '原文',
  'showOriginal': '查看原文',
  'hideOriginal': '收起原文',
  'translating': '翻译中…',
  'translationFailed': '翻译失败，已保留原文',
  'translationPrivacy': '审查意见会发送给当前模型提供方进行翻译。',
  'noteLabel': '说明（可选，会作为用户消息发送给正在工作的 agent）',
  'notePlaceholder': '例如：不要删 build/，改用 pnpm clean',
  'noteCounter': '{count} / {max}',
  'noteTooLong': '说明超过 {max} 字，请缩短后再提交',
  'forwardReviewer': '一并转交审查意见原文',
  'forwardForced': '审查意见原文将一并转交',
  'allowOnce': '允许一次',
  'rejectWithNote': '拒绝并发送说明',
  'reject': '拒绝',
  'submitting': '提交中…',
  'submitFailed': '提交失败：{message}',
  'retry': '重试',
  'rejectWithoutNote': '不带说明直接拒绝',
  'alreadySettled': '此审批已处理',
  'cancelled': '审批已取消',
  'closed': '已处理',
  'command': '命令',
  'relayed': '已拒绝，说明已转交给 agent',
  'deliveryFailed': '拒绝成功，但说明转交失败；请查看 Host 日志',
  'error.network': '网络错误',
  'error.noteTooLong': '说明过长',
  'error.noteDisabled': '当前配置不允许附带说明',
  'error.notPending': '审批已处理或不存在',
  'error.unknown': '未知错误',
} as const

/** Key union accepted by the card's `t` seat. */
export type ReviewRelayKey = keyof typeof zh

/** English copy; the mapped type keeps key parity with Chinese. */
export const en: { readonly [K in ReviewRelayKey]: string } = {
  'dialog.aria': 'Review relay approval card',
  'title.review': 'Auto review denied this call',
  'title.plain': 'This action needs your approval',
  'waiting': 'Waiting for your decision',
  'tool': 'Tool',
  'call': 'Call {id}',
  'reviewerReason': 'Reviewer reason',
  'approvalReason': 'Approval reason',
  'reviewerMissing': 'The reviewer did not provide a reason.',
  'translated': 'Translation',
  'original': 'Original',
  'showOriginal': 'Show original',
  'hideOriginal': 'Hide original',
  'translating': 'Translating…',
  'translationFailed': 'Translation failed; showing the original',
  'translationPrivacy': 'The reviewer reason is sent to the current model provider for translation.',
  'noteLabel': 'Note (optional; sent to the working agent as a user message)',
  'notePlaceholder': 'e.g. do not delete build/; use pnpm clean',
  'noteCounter': '{count} / {max}',
  'noteTooLong': 'The note exceeds {max} characters; shorten it before submitting',
  'forwardReviewer': 'Forward the reviewer reason verbatim',
  'forwardForced': 'The reviewer reason will be forwarded verbatim',
  'allowOnce': 'Allow once',
  'rejectWithNote': 'Reject and send note',
  'reject': 'Reject',
  'submitting': 'Submitting…',
  'submitFailed': 'Submission failed: {message}',
  'retry': 'Retry',
  'rejectWithoutNote': 'Reject without a note',
  'alreadySettled': 'This approval is already settled',
  'cancelled': 'This approval was cancelled',
  'closed': 'Settled',
  'command': 'Command',
  'relayed': 'Rejected; the note was relayed to the agent',
  'deliveryFailed': 'Rejection succeeded, but relaying the note failed; check the Host log',
  'error.network': 'network error',
  'error.noteTooLong': 'note is too long',
  'error.noteDisabled': 'notes are disabled by configuration',
  'error.notPending': 'the approval is already settled or missing',
  'error.unknown': 'unknown error',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Review relay card copy. */
    'review-relay': ReviewRelayKey
  }
}
