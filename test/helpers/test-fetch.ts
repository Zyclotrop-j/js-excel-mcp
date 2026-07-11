/**
 * Mock global fetch for testing tools that make HTTP requests.
 * Returns a cleanup function to restore the original fetch.
 */
export function mockFetch(
    responses: Record<string, { status?: number; body: any; headers?: Record<string, string> }>
): () => void {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: any, init?: any): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        const entry = responses[url];
        if (!entry) {
            throw new Error(`mockFetch: no response configured for ${url}`);
        }

        const body = typeof entry.body === 'string'
            ? entry.body
            : (entry.body instanceof Uint8Array || entry.body instanceof ArrayBuffer)
                ? entry.body
                : JSON.stringify(entry.body);

        return new Response(body as any, {
            status: entry.status ?? 200,
            headers: {
                'Content-Type': typeof entry.body === 'string' || typeof entry.body === 'object' && !(entry.body instanceof Uint8Array) && !(entry.body instanceof ArrayBuffer)
                    ? 'application/json'
                    : 'application/octet-stream',
                ...entry.headers
            }
        });
    };

    return () => {
        globalThis.fetch = originalFetch;
    };
}
