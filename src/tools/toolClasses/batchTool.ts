import z from 'zod/v4';
import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server';
import type { SomeType } from "zod/v4/core";
import { AbstractToolClass } from "./abstractTool.js";

export class BatchTool<
    Input extends z.ZodArray<z.ZodObject<{ name: z.ZodUnion<z.ZodLiteral<string>[]>; schema: z.ZodUnion<z.core.SomeType[]>; }, z.core.$strip>>, 
    Output extends z.ZodObject<{results: z.ZodArray<z.ZodObject<{ name: z.ZodUnion<z.ZodLiteral<string>[]>; schema: z.ZodUnion<(z.core.SomeType | z.ZodLiteral<"success"> | z.ZodLiteral<"error">)[]>; }, z.core.$strip>>}>
> extends AbstractToolClass {
    protected name: string;
    protected description: string;
    tools: AbstractToolClass[];
    inputSchema: Input;
    outputSchema: Output;
    descriptions: string[];

    constructor(name: string, description: string, tools: AbstractToolClass[]) {
        super();
        this.name = name;
        this.description = description;
        this.tools = tools;
        const inputSchemas: SomeType[] = [];
        const outputSchemas: (SomeType | z.ZodLiteral<"success"> | z.ZodLiteral<"error">)[] = [z.literal('success'), z.literal('error')];
        const descriptions: string[] = [];
        const names: string[] = [];
        for(const tool of this.tools) {
            const d = tool.getToolDescription()
            if(d.inputSchema) {
                inputSchemas.push(z.fromJSONSchema(d.inputSchema));
            }
            if(d.outputSchema) {
                outputSchemas.push(z.fromJSONSchema(d.outputSchema));
            }
            if(d.description) {
                descriptions.push(d.description);
            }
            names.push(tool.getToolName());
        }
        this.inputSchema = (z.array(z.object({
            name: z.union(names.map(n => z.literal(n))),
            schema: z.union(inputSchemas)
        }))) as Input;
        this.outputSchema = z.object({results: z.array(z.object({
            name: z.union(names.map(n => z.literal(n))),
            schema: z.union(outputSchemas)
        }))}) as Output;
        this.descriptions = descriptions;
        this.toolMap = new Map(names.map((n, i) => [n, this.tools[i]]));
    }

    private toolMap: Map<string, AbstractToolClass>;

    getToolName() {
        return this.name;
    }

    getToolDescription() {
        
        return {
            description: `${this.description}\n\nTools:\n${this.descriptions.join('\n')}`,
            inputSchema: z.toJSONSchema(this.inputSchema),
            outputSchema: z.toJSONSchema(this.outputSchema),
        }
    }

    async handleRequest(args: z.infer<Input>, ctx: ServerContext): Promise<CallToolResult> {
        try {
            const results: {
                name: string;
                output: CallToolResult;
            }[] = [];
            for(const arg of args) {
                const tool = this.toolMap.get(arg.name);
                if(tool) {
                    const output = await tool.handleRequest(arg.schema, ctx);
                    results.push({
                        name: arg.name,
                        output: output
                    });
                }
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(results, null, 2),
                    },
                ],
                structuredContent: {results: results.map(({name, output}) => ({
                    name,
                    output: output.structuredContent ?? (output.isError ? 'error' : 'success')
                }))},
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