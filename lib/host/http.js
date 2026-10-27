/** HTTP helpers for the authenticated review-relay routes. */
/** Maximum accepted note request body. */
export const MAX_NOTE_BODY_BYTES = 32 * 1024;
/** A JSON response with no-store caching. */
export function jsonResponse(status, payload) {
    return Response.json(payload, {
        status,
        headers: { 'cache-control': 'no-store' },
    });
}
/** A small error body consumed by the card. */
export function errorResponse(status, code, message) {
    return jsonResponse(status, { code, message });
}
/**
 * Read a bounded JSON body.
 * @param request - incoming Fetch-shaped request.
 * @returns the parsed value or the response to send.
 */
export async function readJsonBody(request) {
    const essence = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (essence !== 'application/json') {
        return { ok: false, response: errorResponse(415, 'unsupported-media-type', 'content-type must be application/json') };
    }
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_NOTE_BODY_BYTES) {
        return { ok: false, response: errorResponse(413, 'payload-too-large', `request body exceeds ${MAX_NOTE_BODY_BYTES} bytes`) };
    }
    let text;
    try {
        text = await request.text();
    }
    catch {
        return { ok: false, response: errorResponse(400, 'bad-request', 'request body is unreadable') };
    }
    if (new TextEncoder().encode(text).length > MAX_NOTE_BODY_BYTES) {
        return { ok: false, response: errorResponse(413, 'payload-too-large', `request body exceeds ${MAX_NOTE_BODY_BYTES} bytes`) };
    }
    try {
        return { ok: true, value: JSON.parse(text) };
    }
    catch {
        return { ok: false, response: errorResponse(400, 'bad-request', 'request body must be valid JSON') };
    }
}
/** Read one own string field. */
export function stringField(record, key) {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}
/** Read one own boolean field. */
export function booleanField(record, key) {
    const value = record[key];
    return typeof value === 'boolean' ? value : undefined;
}
/** Whether a value is a plain record. */
export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
//# sourceMappingURL=http.js.map