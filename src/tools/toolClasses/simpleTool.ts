import z from 'zod/v4';
import type { ZodCodec, ZodObject } from "zod/v4";
import type { ServerContext } from '@modelcontextprotocol/server';
import type { SomeType } from "zod/v4/core";
import { AbstractToolClass } from "./abstractTool.js";

export class SimpleTool<Input extends ZodObject, Output extends ZodObject> extends AbstractToolClass {
    private inputSchema: Input;
    private outputSchema: Output;
    protected name: string;
    protected description: string;
    private command: (input: z.infer<Input>, ctx: ServerContext) => Promise<z.infer<Output>>;

    constructor(name: string, description: string, inputSchema: Input, outputSchema: Output, command: (input: z.infer<Input>, ctx: ServerContext) => Promise<z.infer<Output>>) {
        super();
        this.name = name;
        this.description = description;
        this.inputSchema = inputSchema;
        this.outputSchema = outputSchema;
        this.command = command;
    }

    getToolName() {
        return this.name;
    }

    getToolDescription() {
        const inputSchema = z.toJSONSchema(this.inputSchema, { 
            io: "input" 
        });
        const outputSchema = z.toJSONSchema(this.outputSchema, { 
            io: "output" 
        });
        return {
            description: this.description,
            inputSchema,
            outputSchema,
        }
    }

    async handleRequest(args: z.infer<Input>, ctx: ServerContext): Promise<{
        content: {
            type: "text";
            text: string;
        }[],
        structuredContent?: z.infer<Output>
    } | {
        content: {
            type: "text";
            text: string;
        }[],
        isError: true,
    }> {
        try {
            const result = await this.command(args, ctx);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result.data, null, 2),
                    },
                ],
                structuredContent: result,
            };
        } catch(error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `${(error as Error).message}`,
                    },
                ],
                isError: true,
            };
        }
    }
}