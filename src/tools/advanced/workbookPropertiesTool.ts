import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const workbookPropertiesTool = new FileBasedTool(
    "workbook_properties",
    "Set document metadata (title, subject, keywords, etc.).",
    z.codec(
        z.object({
            title: z.string().optional(),
            subject: z.string().optional(),
            author: z.string().optional(),
            keywords: z.string().optional(),
            comments: z.string().optional(),
            category: z.string().optional(),
            manager: z.string().optional(),
            company: z.string().optional(),
            application: z.string().optional(),
            hyperlinksChanged: z.boolean().optional(),
            sharedDoc: z.boolean().optional(),
            template: z.string().optional(),
            lastAuthor: z.string().optional(),
            revision: z.number().optional(),
            createdBy: z.string().optional()
        }),
        z.object({
            title: z.string().nullable(),
            subject: z.string().nullable(),
            author: z.string().nullable(),
            keywords: z.string().nullable(),
            comments: z.string().nullable(),
            category: z.string().nullable(),
            manager: z.string().nullable(),
            company: z.string().nullable(),
            application: z.string().nullable(),
            hyperlinksChanged: z.boolean().nullable(),
            sharedDoc: z.boolean().nullable(),
            template: z.string().nullable(),
            lastAuthor: z.string().nullable(),
            revision: z.number().nullable(),
            createdBy: z.string().nullable()
        }),
        {
            decode: (args) => ({
                title: args.title || null,
                subject: args.subject || null,
                author: args.author || null,
                keywords: args.keywords || null,
                comments: args.comments || null,
                category: args.category || null,
                manager: args.manager || null,
                company: args.company || null,
                application: args.application || null,
                hyperlinksChanged: args.hyperlinksChanged !== undefined ? args.hyperlinksChanged : null,
                sharedDoc: args.sharedDoc !== undefined ? args.sharedDoc : null,
                template: args.template || null,
                lastAuthor: args.lastAuthor || null,
                revision: args.revision || null,
                createdBy: args.createdBy || null
            }),
            encode: (value) => ({
                title: value.title || undefined,
                subject: value.subject || undefined,
                author: value.author || undefined,
                keywords: value.keywords || undefined,
                comments: value.comments || undefined,
                category: value.category || undefined,
                manager: value.manager || undefined,
                company: value.company || undefined,
                application: value.application || undefined,
                hyperlinksChanged: value.hyperlinksChanged !== null ? value.hyperlinksChanged : undefined,
                sharedDoc: value.sharedDoc !== null ? value.sharedDoc : undefined,
                template: value.template || undefined,
                lastAuthor: value.lastAuthor || undefined,
                revision: value.revision || undefined,
                createdBy: value.createdBy || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string()
        }),
        z.object({
            message: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const props = cmd.args;

        if (props.title) workbook.creator = props.title;
        if (props.subject) workbook.subject = props.subject;
        if (props.author) workbook.author = props.author;
        if (props.keywords) workbook.keywords = props.keywords;
        if (props.comments) workbook.comments = props.comments;
        if (props.category) workbook.category = props.category;
        if (props.manager) workbook.manager = props.manager;
        if (props.company) workbook.company = props.company;
        if (props.application) workbook.application = props.application;
        if (props.hyperlinksChanged !== undefined) workbook.hyperlinksChanged = props.hyperlinksChanged;
        if (props.sharedDoc !== undefined) workbook.sharedDoc = props.sharedDoc;
        if (props.template) workbook.template = props.template;
        if (props.lastAuthor) workbook.lastAuthor = props.lastAuthor;
        if (props.revision) workbook.revision = props.revision;
        if (props.createdBy) workbook.createdBy = props.createdBy;

        return {
            file: workbook,
            output: { message: `Workbook properties updated` }
        };
    },
);