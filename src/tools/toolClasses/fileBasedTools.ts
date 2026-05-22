import z from 'zod/v4';
import type { ZodCodec, ZodObject } from "zod/v4";
import type { ServerContext, ToolAnnotations, CallToolRequest, ResourceLink, CallToolResult } from '@modelcontextprotocol/server';
import type { $ZodType, $ZodTypeInternals, SomeType, ZodStandardJSONSchemaPayload } from "zod/v4/core";
import { FileSerialiser, ToolDescription } from "../../services/utiltypes.js";
import { AbstractToolClass } from "./abstractTool.js";

export class FileBasedTool<T, commandInput extends $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, commandOutput extends $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, resultInput extends $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, resultOutput extends $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>> extends AbstractToolClass {
    private commandCodec: ZodCodec<commandInput, commandOutput>
    private resultCodec: ZodCodec<resultInput, resultOutput>
    protected name: string;
    protected description: string;
    protected fileSerialiser: typeof FileSerialiser<T>;
    command: (cmd: {
        file: T;
        args: z.output<ZodCodec<commandInput, commandOutput>>;
    }, ctx: ServerContext) => Promise<{
        file: T;
        output: z.input<ZodCodec<resultInput, resultOutput>>;
    }>;


    constructor(
        name: string,
        description: string,
        commandCodec: ZodCodec<commandInput, commandOutput>,
        resultCodec: ZodCodec<resultInput, resultOutput>,
        fileSerialiser: typeof FileSerialiser<T>,
        command: (cmd: {
            file: T;
            args: z.output<ZodCodec<commandInput, commandOutput>>;
        }, ctx: ServerContext) => Promise<{
            file: T;
            output: z.input<ZodCodec<resultInput, resultOutput>>;
        }>,
        
    ) {
        super();
        this.name = name;
        this.description = description;
        this.fileSerialiser = fileSerialiser;
        this.commandCodec = commandCodec;
        this.resultCodec = resultCodec;
        this.command = command;
    }

    getToolName() {
        return this.name;
    }

    getToolDescription(): ToolDescription {
        const inputType = z.object({
            command: this.commandCodec.in,
            filePath: z.string(),
        });
        const outputType = z.object({
            ouput: this.resultCodec.out,
            filePath: z.string(),
        });
        const inputSchema = z.toJSONSchema(inputType, { 
            io: "input" 
        });
        const outputSchema = z.toJSONSchema(outputType, { 
            io: "output" 
        });
        return {
            description: this.description,
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        }
    }

    private async handleRequestInternal(fileSerialiser: FileSerialiser<T>, input: { filePath: string; command: z.input<ZodCodec<commandInput, commandOutput>> }, ctx: ServerContext): Promise<{filePath: string, output: z.output<ZodCodec<resultInput, resultOutput>>}> {
        const [args, file] = await Promise.all([
            this.commandCodec.decodeAsync(input.command),
            fileSerialiser.deserialize(input.filePath),
        ]);
        const {file: updatedFile, output} = await this.command({args, file}, ctx);
        const [result, resultFilePath] = await Promise.all([
            this.resultCodec.decodeAsync(output), 
            fileSerialiser.serialize(updatedFile)
        ]);
        return {
            filePath: resultFilePath,
            output: result,
        };
    }

    async handleRequest(input: { filePath: string; command: z.input<ZodCodec<commandInput, commandOutput>> }, ctx: ServerContext): Promise<CallToolResult> {
        const fileSerialiser = Reflect.construct(this.fileSerialiser, []);
        const result = await this.handleRequestInternal(fileSerialiser, input, ctx);
        const link: ResourceLink = {
            type: 'resource_link',
            uri: result.filePath,
            name: fileSerialiser.outputFileName,
            mimeType: fileSerialiser.outputMimeType,
            annotations: {
                audience: ["user"],
                priority: 0.8,
                lastModified: new Date().toISOString()
            }
        };
        return {
            content: [{ type: "text", text: JSON.stringify(result.output) }, link],
            structuredContent: result
        };
    }
}