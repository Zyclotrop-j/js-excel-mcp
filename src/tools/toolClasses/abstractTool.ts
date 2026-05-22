import z from 'zod/v4';
import type { ZodCodec, ZodObject } from "zod/v4";
import type { ServerContext, ToolAnnotations, CallToolRequest, ResourceLink, CallToolResult } from '@modelcontextprotocol/server';
import type { $ZodType, $ZodTypeInternals, SomeType, ZodStandardJSONSchemaPayload } from "zod/v4/core";
import { FileSerialiser, ToolDescription } from "../../services/utiltypes.js";

export abstract class AbstractToolClass {
    abstract getToolName(): string

    abstract getToolDescription(): ToolDescription

    abstract handleRequest(args: any, ctx: ServerContext): Promise<CallToolResult>
}

