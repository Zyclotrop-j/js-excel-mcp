import z from 'zod/v4';
import type { ZodCodec, ZodObject } from "zod/v4";
import type { ServerContext, ToolAnnotations, CallToolRequest, ResourceLink, CallToolResult } from '@modelcontextprotocol/server';
import type { $ZodType, $ZodTypeInternals, SomeType, ZodStandardJSONSchemaPayload } from "zod/v4/core";
import { FileSerialiser } from "../../services/utiltypes.js";
import { AbstractToolClass } from "./abstractTool.js";

export class ZodBasedToolWithServerContext<input extends SomeType, output extends ZodObject> extends AbstractToolClass {
    private codec: ZodCodec<input, output>
    protected name: string;
    protected description: string;
    private setup: (serverContext: ServerContext) => ZodCodec<input, output>;

    constructor(name: string, description: string, setup: (serverContext: ServerContext) => ZodCodec<input, output>, codec: ZodCodec<input, output>) {
        super();
        this.name = name;
        this.description = description;
        this.codec = codec;
        this.setup = setup;
    }

    getToolName() {
        return this.name;
    }

    getToolDescription() {
        const inputSchema = z.toJSONSchema(this.codec, { 
            io: "input" 
        });
        const outputSchema = z.toJSONSchema(this.codec, { 
            io: "output" 
        });
        return {
            description: this.description,
            inputSchema,
            outputSchema,
        }
    }

    async handleRequest(args: z.input<ZodCodec<input, output>>, ctx: ServerContext): Promise<{
        content: {
            type: "text";
            text: string;
        }[],
        structuredContent?: z.output<ZodCodec<input, output>>
    } | {
        content: {
            type: "text";
            text: string;
        }[],
        isError: true,
    }> {
        const result = await this.setup(ctx).safeDecodeAsync(args);
        if (result.error) {
            return {
                content: [
                    {
                        type: "text",
                        text: result.error.message,
                    },
                ],
                isError: true,
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result.data, null, 2),
                },
            ],
            structuredContent: result.data,
        };
    }
}