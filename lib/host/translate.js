/** One-shot translation through the current LLM route or the optional translator service. */
import { createHash } from 'node:crypto';
/** Fixed system prompt; changing it changes translation behavior. */
export const TRANSLATION_SYSTEM_PROMPT = `You are a translation engine. Translate only the user's text into the requested target language.
Preserve code blocks, inline code, commands, paths, URLs, placeholders, identifiers, and line breaks exactly.
Do not add explanations, quotes, Markdown fences, or commentary. Return only the translation.`;
/** Maximum cached translations. */
export const TRANSLATION_CACHE_LIMIT = 128;
/**
 * Whether text is already in the target language, using a CJK-coverage
 * heuristic for Chinese and an ASCII test for English.
 * @param text - source text.
 * @param targetLanguage - resolved target tag.
 * @returns true when no translation request is needed.
 */
export function isAlreadyTargetLanguage(text, targetLanguage) {
    if (text.trim() === '')
        return true;
    const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
    const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
    const lower = targetLanguage.toLowerCase();
    if (lower === 'zh' || lower.startsWith('zh-')) {
        return letters > 0 && han / letters >= 0.5;
    }
    if (lower === 'en' || lower.startsWith('en-')) {
        return han === 0 && /[A-Za-z]/.test(text) && /^[\x00-\x7F\s]*$/u.test(text);
    }
    return false;
}
/** Split text into translator-sized chunks, preferring line boundaries. */
export function splitForLimit(text, limit) {
    if (limit <= 0 || text.length <= limit)
        return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf('\n', limit);
        if (cut <= 0)
            cut = limit;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut + (rest.charAt(cut) === '\n' ? 1 : 0));
    }
    if (rest !== '')
        chunks.push(rest);
    return chunks;
}
/** LRU translation cache keyed by source/target/provider/model. */
export class TranslationCache {
    limit;
    entries = new Map();
    constructor(limit = TRANSLATION_CACHE_LIMIT) {
        this.limit = limit;
    }
    get(key) {
        const value = this.entries.get(key);
        if (value === undefined)
            return undefined;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }
    set(key, value) {
        this.entries.delete(key);
        this.entries.set(key, value);
        while (this.entries.size > this.limit) {
            const oldest = this.entries.keys().next();
            if (oldest.done === true)
                break;
            this.entries.delete(oldest.value);
        }
    }
    get size() {
        return this.entries.size;
    }
    clear() {
        this.entries.clear();
    }
}
/** Read the LLM route a translation should use for one agent. */
export function translationRouteOf(agent) {
    const header = agent.session.requestHeader();
    if (header !== undefined && header.config.provider !== '' && header.config.model !== '') {
        return { provider: header.config.provider, model: header.config.model };
    }
    const provider = agent.options.provider;
    const model = agent.options.model;
    if (provider !== undefined && provider !== '' && model !== undefined && model !== '') {
        return { provider, model };
    }
    return undefined;
}
/** Per-process translator with in-flight deduplication and a bounded LRU. */
export class TranslationService {
    runtime;
    config;
    cache = new TranslationCache();
    inflight = new Map();
    controllers = new Set();
    warnedMissingTranslator = false;
    constructor(runtime, config) {
        this.runtime = runtime;
        this.config = config;
    }
    /**
     * Translate one reviewer reason.
     * @param request - source text, target, route, session, and cancellation.
     * @returns ok/skipped/failed, never a partial translation.
     */
    async translate(request) {
        if (!this.config.translate || this.config.translationProvider === 'off') {
            return { status: 'skipped', reason: 'disabled' };
        }
        if (request.text.trim() === '')
            return { status: 'skipped', reason: 'empty' };
        if (isAlreadyTargetLanguage(request.text, request.targetLanguage)) {
            return { status: 'skipped', reason: 'already-target' };
        }
        if (request.route === undefined)
            return { status: 'failed', reason: 'no-route' };
        const model = this.config.translationModel ?? request.route.model;
        const key = this.cacheKey(request.text, request.targetLanguage, request.route.provider, model);
        const cached = this.cache.get(key);
        if (cached !== undefined)
            return { status: 'ok', text: cached };
        const pending = this.inflight.get(key);
        if (pending !== undefined)
            return await pending;
        const task = this.run(key, request, request.route.provider, model).finally(() => {
            this.inflight.delete(key);
        });
        this.inflight.set(key, task);
        return await task;
    }
    /** Cancel every active translation and clear cached/queued state. */
    clear() {
        for (const controller of this.controllers)
            controller.abort(new Error('review-relay disposed'));
        this.controllers.clear();
        this.inflight.clear();
        this.cache.clear();
    }
    async run(key, request, provider, model) {
        const controller = new AbortController();
        const onAbort = () => { controller.abort(request.signal?.reason ?? new Error('translation aborted')); };
        if (request.signal !== undefined) {
            request.signal.addEventListener('abort', onAbort, { once: true });
            if (request.signal.aborted)
                onAbort();
        }
        const timer = setTimeout(() => { controller.abort(new Error('translation timeout')); }, this.config.translationTimeoutMs);
        this.controllers.add(controller);
        try {
            const text = this.config.translationProvider === 'translator'
                ? await this.translateViaTranslator(request, controller.signal) ?? await this.translateViaLlm(request, provider, model, controller.signal)
                : await this.translateViaLlm(request, provider, model, controller.signal);
            if (text.trim() === '')
                return { status: 'failed', reason: 'empty-output' };
            this.cache.set(key, text);
            return { status: 'ok', text };
        }
        catch (error) {
            if (controller.signal.aborted) {
                const disposed = controller.signal.reason instanceof Error
                    && controller.signal.reason.message === 'review-relay disposed';
                return { status: 'failed', reason: request.signal?.aborted === true || disposed ? 'aborted' : 'timeout' };
            }
            this.runtime.logger.warn(`review-relay: translation failed: ${error instanceof Error ? error.message : String(error)}`);
            return { status: 'failed', reason: 'provider' };
        }
        finally {
            clearTimeout(timer);
            this.controllers.delete(controller);
            if (request.signal !== undefined)
                request.signal.removeEventListener('abort', onAbort);
        }
    }
    async translateViaTranslator(request, signal) {
        const translator = this.translator();
        if (translator === undefined)
            return undefined;
        const limit = translator.maxTextChars ?? 4000;
        const parts = [];
        for (const chunk of splitForLimit(request.text, limit)) {
            const spec = translator.resolve({
                text: chunk,
                targetLanguage: request.targetLanguage,
                ...request.sessionId === undefined ? {} : { sessionId: request.sessionId },
            });
            parts.push(await translator.translate(spec, signal));
            signal.throwIfAborted();
        }
        return parts.join('\n');
    }
    translator() {
        const service = this.runtime.get('translator');
        if (service === null || typeof service !== 'object') {
            this.warnTranslatorMissing();
            return undefined;
        }
        const candidate = service;
        if (typeof candidate.resolve !== 'function' || typeof candidate.translate !== 'function') {
            this.warnTranslatorMissing();
            return undefined;
        }
        return candidate;
    }
    warnTranslatorMissing() {
        if (this.warnedMissingTranslator)
            return;
        this.warnedMissingTranslator = true;
        this.runtime.logger.warn('review-relay: translationProvider="translator" but no translator service is mounted; falling back to llm');
    }
    async translateViaLlm(request, provider, model, signal) {
        if (this.runtime.llm === undefined)
            throw new Error('no llm service is mounted');
        const options = {
            provider,
            model,
            system: TRANSLATION_SYSTEM_PROMPT,
            messages: [{
                    role: 'user',
                    content: [{
                            type: 'text',
                            text: `Target language: ${request.targetLanguage}\n\nTEXT TO TRANSLATE:\n${request.text}\nEND TEXT`,
                        }],
                }],
            temperature: 0,
            signal,
        };
        let output = '';
        let finished = false;
        for await (const chunk of this.runtime.llm.stream(options)) {
            if (chunk.type === 'text-delta') {
                output += chunk.text;
                continue;
            }
            if (chunk.type === 'finish') {
                finished = true;
                if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
                    throw new Error(`translation stream ended with ${chunk.reason.kind}`);
                }
            }
        }
        if (!finished && output === '')
            throw new Error('translation stream ended without text');
        return output.trim();
    }
    cacheKey(text, target, provider, model) {
        return createHash('sha256')
            .update(text)
            .update('\0')
            .update(target)
            .update('\0')
            .update(provider)
            .update('\0')
            .update(model)
            .update('\0')
            .update(this.config.translationProvider)
            .digest('hex');
    }
}
//# sourceMappingURL=translate.js.map