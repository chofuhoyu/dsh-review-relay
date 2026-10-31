/** Client locale dictionaries for the review-relay card. */
export declare const NS = "review-relay";
/** Chinese copy (the source of the key union). */
export declare const zh: {
    readonly 'dialog.aria': "审查回传审批卡片";
    readonly 'title.review': "Auto review 拒绝了此调用";
    readonly 'title.plain': "需要你确认此操作";
    readonly waiting: "等待你的决定";
    readonly tool: "工具";
    readonly call: "调用 {id}";
    readonly reviewerReason: "审查意见";
    readonly approvalReason: "审批原因";
    readonly reviewerMissing: "审查意见未提供原因。";
    readonly translated: "译文";
    readonly original: "原文";
    readonly showOriginal: "查看原文";
    readonly hideOriginal: "收起原文";
    readonly translating: "翻译中…";
    readonly translationFailed: "翻译失败，已保留原文";
    readonly translationPrivacy: "审查意见会发送给当前模型提供方进行翻译。";
    readonly noteLabel: "说明（可选，会随被拒调用转交给 agent）";
    readonly notePlaceholder: "例如：不要删 build/，改用 pnpm clean";
    readonly noteCounter: "{count} / {max}";
    readonly noteTooLong: "说明超过 {max} 字，请缩短后再提交";
    readonly forwardReviewer: "一并转交审查意见原文";
    readonly forwardForced: "审查意见原文将一并转交";
    readonly allowOnce: "允许一次";
    readonly rejectWithNote: "拒绝并发送说明";
    readonly reject: "拒绝";
    readonly submitting: "提交中…";
    readonly submitFailed: "提交失败：{message}";
    readonly retry: "重试";
    readonly rejectWithoutNote: "不带说明直接拒绝";
    readonly alreadySettled: "此审批已处理";
    readonly cancelled: "审批已取消";
    readonly closed: "已处理";
    readonly command: "命令";
    readonly relayed: "已拒绝，说明已转交";
    readonly deliveryFailed: "拒绝成功，但说明转交失败；请查看 Host 日志";
    readonly 'error.network': "网络错误";
    readonly 'error.noteTooLong': "说明过长";
    readonly 'error.noteDisabled': "当前配置不允许附带说明";
    readonly 'error.notPending': "审批已处理或不存在";
    readonly 'error.unknown': "未知错误";
};
/** Key union accepted by the card's `t` seat. */
export type ReviewRelayKey = keyof typeof zh;
/** English copy; the mapped type keeps key parity with Chinese. */
export declare const en: {
    readonly [K in ReviewRelayKey]: string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Review relay card copy. */
        'review-relay': ReviewRelayKey;
    }
}
