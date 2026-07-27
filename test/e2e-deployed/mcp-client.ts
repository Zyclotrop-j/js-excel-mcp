/**
 * Minimal MCP JSON-RPC client over the Streamable HTTP transport.
 *
 * Drives raw `fetch` POSTs with `Content-Type: application/json` and
 * `Accept: application/json, text/event-stream`, parses the SSE
 * `event: message / data: {json}` envelope, and returns the JSON-RPC
 * result. Session management (Mcp-Session-Id) is passed through if
 * the server returns one; it's optional for stateless requests on the
 * bootstrap endpoint.
 */

export interface McpClientOptions {
    baseUrl: string;
    endpoint?: string;
    accessToken?: string;
    sessionId?: string;
}

let nextId = 1;

export function createMcpClient(opts: McpClientOptions) {
    const endpoint = opts.endpoint ?? '/mcp/bootstrap';
    const url = `${opts.baseUrl.replace(/\/$/, '')}${endpoint}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    };
    if (opts.accessToken) headers['Authorization'] = `Bearer ${opts.accessToken}`;
    if (opts.sessionId) headers['Mcp-Session-Id'] = opts.sessionId;

    let sessionId = opts.sessionId;

    async function rpc(method: string, params?: unknown): Promise<any> {
        const id = nextId++;
        const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} });
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(url, { method: 'POST', headers, body });
                if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}: ${await res.text().catch(() => '')}`);
                const newSess = res.headers.get('mcp-session-id');
                if (newSess && !sessionId) { sessionId = newSess; headers['Mcp-Session-Id'] = newSess; }
                const raw = await res.text();
                const parsed = parseSseOrJson(raw);
                if (parsed.error) throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
                return parsed.result;
            } catch (e) {
                lastErr = e instanceof Error ? e : new Error(String(e));
                if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
            }
        }
        throw lastErr ?? new Error(`MCP ${method} failed after 3 attempts`);
    }

    return {
        async initialize(): Promise<void> {
            await rpc('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'e2e-test', version: '1' },
            });
            await fetch(url, { method: 'POST', headers, body: '{"jsonrpc":"2.0","method":"notifications/initialized"}' });
        },

        async listTools(): Promise<any[]> {
            const result = await rpc('tools/list');
            return result.tools ?? [];
        },

        async callTool(name: string, args: Record<string, unknown>): Promise<any> {
            let lastErr: Error | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const result = await rpc('tools/call', { name, arguments: args });
                    if (result.isError) {
                        const text = result.content?.map((c: any) => c.text ?? '').join(' ') ?? JSON.stringify(result);
                        throw new Error(`Tool ${name} error: ${text}`);
                    }
                    const content = result.content ?? [];
                    for (const block of content) {
                        if (block.type === 'resource' && block.resource?.text) {
                            try { return JSON.parse(block.resource.text); } catch { /* not JSON */ }
                        }
                        if (block.type === 'text' && block.text?.trimStart().startsWith('{')) {
                            try { return JSON.parse(block.text); } catch { /* not JSON */ }
                        }
                    }
                    const texts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
                    return texts.length > 1 ? texts[1] : (texts[0] ?? result);
                } catch (e) {
                    lastErr = e instanceof Error ? e : new Error(String(e));
                    if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
                }
            }
            throw lastErr ?? new Error(`Tool ${name} failed after 3 attempts`);
        },

        get sessionId() { return sessionId; },
    };
}

/**
 * Parse an SSE `event: message\ndata: {...}` response OR a plain JSON body.
 * The MCP SDK responds with SSE for streaming-capable endpoints and plain
 * JSON for notifications (no response body). This handles both shapes.
 */
function parseSseOrJson(raw: string): any {
    const trimmed = raw.trim();
    if (!trimmed) return { result: null };
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    const match = trimmed.match(/^data: (\{.*\})$/ms);
    if (match) return JSON.parse(match[1]);
    const lines = trimmed.split('\n');
    for (const line of lines) {
        const m = line.match(/^data: (\{.*\})/);
        if (m) return JSON.parse(m[1]);
    }
    throw new Error(`Unparseable MCP response: ${trimmed.slice(0, 200)}`);
}
