import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ResolvedConfig } from './config.js';
/** Fixed system prompt; changing it changes translation behavior. */
export declare const TRANSLATION_SYSTEM_PROMPT = "You are a translation engine. Translate only the user's text into the requested target language.\nPreserve code blocks, inline code, commands, paths, URLs, placeholders, identifiers, and line breaks exactly.\nDo not add explanations, quotes, Markdown fences, or commentary. Return only the translation.";
/** Translation outcome with a machine-readable status. */
export type TranslationResult = {
    readonly status: 'ok';
    readonly text: string;
} | {
    readonly status: 'skipped';
    readonly reason: 'disabled' | 'already-target' | 'empty';
} | {
    readonly status: 'failed';
    readonly reason: 'no-route' | 'timeout' | 'aborted' | 'provider' | 'empty-output';
};
/** LLM route used for one translation request. */
export interface TranslationRoute {
    readonly provider: string;
    readonly model: string;
}
/** Structural dependencies, allowing tests to inject a fake LLM and translator. */
export interface TranslationRuntime {
    readonly llm?: {
        stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    };
    get(name: string): unknown;
    readonly logger: {
        warn(message: string): void;
    };
}
/** One translation request. */
export interface TranslationRequest {
    readonly text: string;
    readonly targetLanguage: string;
    readonly route: TranslationRoute | undefined;
    readonly sessionId: string | undefined;
    readonly signal?: AbortSignal | undefined;
}
/** Maximum cached translations. */
export declare const TRANSLATION_CACHE_LIMIT = 128;
/**
 * Whether text is already in the target language, using a CJK-coverage
 * heuristic for Chinese and an ASCII test for English.
 * @param text - source text.
 * @param targetLanguage - resolved target tag.
 * @returns true when no translation request is needed.
 */
export declare function isAlreadyTargetLanguage(text: string, targetLanguage: string): boolean;
/** Split text into translator-sized chunks, preferring line boundaries. */
export declare function splitForLimit(text: string, limit: number): string[];
/** LRU translation cache keyed by source/target/provider/model. */
export declare class TranslationCache {
    private readonly limit;
    private readonly entries;
    constructor(limit?: number);
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    get size(): number;
    clear(): void;
}
/** Read the LLM route a translation should use for one agent. */
export declare function translationRouteOf(agent: Agent): TranslationRoute | undefined;
/** Per-process translator with in-flight deduplication and a bounded LRU. */
export declare class TranslationService {
    private readonly runtime;
    private readonly config;
    private readonly cache;
    private readonly inflight;
    private readonly controllers;
    private warnedMissingTranslator;
    constructor(runtime: TranslationRuntime, config: ResolvedConfig);
    /**
     * Translate one reviewer reason.
     * @param request - source text, target, route, session, and cancellation.
     * @returns ok/skipped/failed, never a partial translation.
     */
    translate(request: TranslationRequest): Promise<TranslationResult>;
    /** Cancel every active translation and clear cached/queued state. */
    clear(): void;
    private run;
    private translateViaTranslator;
    private translator;
    private warnTranslatorMissing;
    private translateViaLlm;
    private cacheKey;
}
