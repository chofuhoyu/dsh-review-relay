/** HTTP helpers for the authenticated review-relay routes. */
/** Maximum accepted note request body. */
export declare const MAX_NOTE_BODY_BYTES: number;
/** A JSON response with no-store caching. */
export declare function jsonResponse(status: number, payload: unknown): Response;
/** A small error body consumed by the card. */
export declare function errorResponse(status: number, code: string, message: string): Response;
/** Parsed body result. */
export type BodyResult = {
    readonly ok: true;
    readonly value: unknown;
} | {
    readonly ok: false;
    readonly response: Response;
};
/**
 * Read a bounded JSON body.
 * @param request - incoming Fetch-shaped request.
 * @returns the parsed value or the response to send.
 */
export declare function readJsonBody(request: Request): Promise<BodyResult>;
/** Read one own string field. */
export declare function stringField(record: Record<string, unknown>, key: string): string | undefined;
/** Read one own boolean field. */
export declare function booleanField(record: Record<string, unknown>, key: string): boolean | undefined;
/** Whether a value is a plain record. */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
