import { ToolHandler } from './interface.js';
import { isInputRequiredResult, type CallToolResult, type InputRequiredResult } from '@modelcontextprotocol/server';
import { encode } from '@toon-format/toon';
import z from 'zod';
import { Context } from '../filesystem/context.js';

type StandardSchema = { '~standard': { validate: (value: unknown) => Promise<{ value?: unknown; issues?: { message: string }[] }> } };

const stepSchema = z.object({
    tool: z.string().describe('name of the registered tool to dispatch'),
    args: z.record(z.string(), z.any()).default({}).describe('arguments object passed to the tool'),
    label: z.string().optional().describe('optional human-readable label for this step')
});

const stepResultSchema = z.object({
    step: z.number(),
    tool: z.string(),
    label: z.string().nullable().optional(),
    status: z.enum(['ok', 'error', 'not_found']),
    error: z.string().optional(),
    text: z.string().optional(),
    structuredContent: z.any().optional()
});

export class ChainHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('chain_operations', {
            description: 'dispatch a list of tool-call operations one after another, streaming each step result back as it happens via logging notifications. operations share the sticky file/sheet/cell context, so later steps see state changes from earlier ones.',
            inputSchema: z.object({
                operations: z.array(stepSchema).min(1).describe('ordered list of tool calls to dispatch sequentially'),
                stopOnError: z.boolean().default(true).describe('if true, stop dispatching as soon as a step errors or a tool is not found')
            }),
            outputSchema: z.object({
                total: z.number(),
                succeeded: z.number(),
                failed: z.number(),
                stoppedOnError: z.boolean(),
                results: z.array(stepResultSchema),
                context: context.contextualiseResponseTypes()
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
                readOnlyHint: false
            }
        }, async (arg) => {

            const stream = async (data: unknown) => {
                try { await this.server.sendLoggingMessage({ level: 'info', logger: 'chain', data }); } catch { /* streaming is best-effort */ }
            };

            const results: z.infer<typeof stepResultSchema>[] = [];
            let succeeded = 0;
            let failed = 0;
            let stoppedOnError = false;

            for (let i = 0; i < arg.operations.length; i++) {
                const op = arg.operations[i];
                const stepIndex = i;

                const entry = (() => {
                    for (const handler of this.toolSet) {
                        const t = handler.getTool(op.tool);
                        if (t) return t;
                    }
                    return null;
                })();

                if (!entry) {
                    failed++;
                    const e: z.infer<typeof stepResultSchema> = { step: stepIndex, tool: op.tool, label: op.label ?? null, status: 'not_found', error: `tool '${op.tool}' is not registered` };
                    results.push(e);
                    await stream(e);
                    if (arg.stopOnError) { stoppedOnError = true; break; }
                    continue;
                }

                let validatedArgs: unknown = op.args ?? {};
                if (entry.inputSchema) {
                    const v = await (entry.inputSchema as StandardSchema)['~standard'].validate(op.args ?? {});
                    if (v.issues && v.issues.length) {
                        const error = `input validation failed: ${v.issues.map((x) => x.message).join(', ')}`;
                        failed++;
                        const e: z.infer<typeof stepResultSchema> = { step: stepIndex, tool: op.tool, label: op.label ?? null, status: 'error', error };
                        results.push(e);
                        await stream(e);
                        if (arg.stopOnError) { stoppedOnError = true; break; }
                        continue;
                    }
                    validatedArgs = v.value;
                }

                let result: CallToolResult | InputRequiredResult;
                try {
                    result = await entry.cb(validatedArgs, this.context);
                } catch (e2) {
                    const error = e2 instanceof Error ? e2.message : String(e2);
                    failed++;
                    const e: z.infer<typeof stepResultSchema> = { step: stepIndex, tool: op.tool, label: op.label ?? null, status: 'error', error };
                    results.push(e);
                    await stream(e);
                    if (arg.stopOnError) { stoppedOnError = true; break; }
                    continue;
                }

                if (isInputRequiredResult(result)) {
                    failed++;
                    const e: z.infer<typeof stepResultSchema> = { step: stepIndex, tool: op.tool, label: op.label ?? null, status: 'error', error: `tool '${op.tool}' requires client input (sampling) and cannot be used inside a chain` };
                    results.push(e);
                    await stream(e);
                    if (arg.stopOnError) { stoppedOnError = true; break; }
                    continue;
                }

                const isError = result.isError === true;
                if (isError) failed++; else succeeded++;

                const text = (result.content ?? [])
                    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
                    .map((c) => c.text)
                    .join('\n');

                const sc = result.structuredContent as Record<string, unknown> | undefined;
                const structuredContent = sc ? { ...sc, context: undefined } : undefined;

                const e: z.infer<typeof stepResultSchema> = {
                    step: stepIndex,
                    tool: op.tool,
                    label: op.label ?? null,
                    status: isError ? 'error' : 'ok',
                    error: isError ? (text || 'tool returned an error') : undefined,
                    text: text || undefined,
                    structuredContent
                };
                results.push(e);
                await stream(e);

                if (isError && arg.stopOnError) { stoppedOnError = true; break; }
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({
                    total: results.length,
                    succeeded,
                    failed,
                    stoppedOnError,
                    results
                }) }],
                structuredContent: {
                    total: results.length,
                    succeeded,
                    failed,
                    stoppedOnError,
                    results
                }
            });
        });
    }
}
