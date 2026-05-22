import z from 'zod/v4';
import type { ZodCodec, ZodObject } from "zod/v4";
import type { ServerContext, ToolAnnotations, CallToolRequest, ResourceLink, CallToolResult } from '@modelcontextprotocol/server';
import type { $ZodType, $ZodTypeInternals, SomeType, ZodStandardJSONSchemaPayload } from "zod/v4/core";

export interface ToolDescription {
    title?: string;
    description?: string;
    inputSchema?: ZodStandardJSONSchemaPayload<any> | undefined;
    outputSchema?: ZodStandardJSONSchemaPayload<any> | undefined;
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
}

export abstract class FileSerialiser<T> {
    abstract deserialize(path: string): Promise<T>;
    abstract serialize(data: T): Promise<string>;
    abstract get outputFileName(): string;
    abstract get outputMimeType(): string;
}