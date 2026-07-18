import { ToolHandler } from './interface.js'
import z from 'zod'
import { Context } from '../filesystem/context.js'
import { type SheetRef, type Workbook } from '@office-kit/xlsx/workbook'
import { type Worksheet, getCell, getCellByCoord, setCellByCoord } from '@office-kit/xlsx/worksheet'
import { getCoordinate } from '@office-kit/xlsx/cell'
import {
    setBold, setFontSize, setFontName, setFontColor,
    setCellBackgroundColor, setCellBorderAll, setCellBorder,
    alignCellHorizontal, alignCellVertical, wrapCellText,
    makeBorder, makeSide
} from '@office-kit/xlsx/styles'
import type { SideStyle } from '@office-kit/xlsx/styles'
import { encode } from '@toon-format/toon'

const borderStyleValues = ['thin', 'thick', 'dashed', 'dotted', 'double', 'none'] as const
const sideValues = ['all', 'top', 'bottom', 'left', 'right'] as const

export class StyleHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public')

        this.registerTool('set_cell_bold', { description: 'toggle bold on a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            bold: z.boolean()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            bold: z.boolean().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile()
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true })

            let wb: Workbook
            try {
                wb = await context.getWorkbook(filename)
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true })
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet()
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName)
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true })
            const ws: Worksheet = sheet.sheet

            let cell
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref) ?? setCellByCoord(ws, arg.ref, null)
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col) ?? setCellByCoord(ws, arg.row, arg.col, null)
            } else {
                const currentCell = await context.getCurrentCell()
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true })
                cell = getCellByCoord(ws, currentCell) ?? setCellByCoord(ws, currentCell, null)
            }

            setBold(wb, cell, arg.bold)
            await context.setWorkbook(filename, wb)
            const ref = getCoordinate(cell)
            await context.setCurrentCell(ref)

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ ref, bold: arg.bold }) }],
                structuredContent: { ref, bold: arg.bold }
            })
        })

        this.registerTool('set_cell_font', { description: 'set font properties on a cell (size, name, color)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            fontSize: z.number().optional(),
            fontName: z.string().optional(),
            fontColor: z.string().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            fontSize: z.number().optional(),
            fontName: z.string().optional(),
            fontColor: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile()
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true })

            let wb: Workbook
            try {
                wb = await context.getWorkbook(filename)
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true })
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet()
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName)
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true })
            const ws: Worksheet = sheet.sheet

            let cell
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref) ?? setCellByCoord(ws, arg.ref, null)
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col) ?? setCellByCoord(ws, arg.row, arg.col, null)
            } else {
                const currentCell = await context.getCurrentCell()
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true })
                cell = getCellByCoord(ws, currentCell) ?? setCellByCoord(ws, currentCell, null)
            }

            if (arg.fontSize !== undefined) setFontSize(wb, cell, arg.fontSize)
            if (arg.fontName !== undefined) setFontName(wb, cell, arg.fontName)
            if (arg.fontColor !== undefined) setFontColor(wb, cell, arg.fontColor)

            await context.setWorkbook(filename, wb)
            const ref = getCoordinate(cell)
            await context.setCurrentCell(ref)

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ ref, fontSize: arg.fontSize, fontName: arg.fontName, fontColor: arg.fontColor }) }],
                structuredContent: { ref, fontSize: arg.fontSize, fontName: arg.fontName, fontColor: arg.fontColor }
            })
        })

        this.registerTool('set_cell_background_color', { description: 'set the background color of a cell (hex string like FFFF0000)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            color: z.string()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            color: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile()
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true })

            let wb: Workbook
            try {
                wb = await context.getWorkbook(filename)
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true })
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet()
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName)
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true })
            const ws: Worksheet = sheet.sheet

            let cell
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref) ?? setCellByCoord(ws, arg.ref, null)
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col) ?? setCellByCoord(ws, arg.row, arg.col, null)
            } else {
                const currentCell = await context.getCurrentCell()
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true })
                cell = getCellByCoord(ws, currentCell) ?? setCellByCoord(ws, currentCell, null)
            }

            setCellBackgroundColor(wb, cell, arg.color)
            await context.setWorkbook(filename, wb)
            const ref = getCoordinate(cell)
            await context.setCurrentCell(ref)

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ ref, color: arg.color }) }],
                structuredContent: { ref, color: arg.color }
            })
        })

        this.registerTool('set_cell_alignment', { description: 'set alignment properties on a cell (horizontal, vertical, wrapText)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            horizontal: z.enum(['left', 'center', 'right']).optional(),
            vertical: z.enum(['top', 'middle', 'bottom']).optional(),
            wrapText: z.boolean().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            horizontal: z.string().optional(),
            vertical: z.string().optional(),
            wrapText: z.boolean().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile()
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true })

            let wb: Workbook
            try {
                wb = await context.getWorkbook(filename)
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true })
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet()
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName)
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true })
            const ws: Worksheet = sheet.sheet

            let cell
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref) ?? setCellByCoord(ws, arg.ref, null)
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col) ?? setCellByCoord(ws, arg.row, arg.col, null)
            } else {
                const currentCell = await context.getCurrentCell()
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true })
                cell = getCellByCoord(ws, currentCell) ?? setCellByCoord(ws, currentCell, null)
            }

            if (arg.horizontal !== undefined) alignCellHorizontal(wb, cell, arg.horizontal)
            if (arg.vertical !== undefined) {
                const vertical = arg.vertical === 'middle' ? 'center' : arg.vertical
                alignCellVertical(wb, cell, vertical)
            }
            if (arg.wrapText !== undefined) wrapCellText(wb, cell, arg.wrapText)

            await context.setWorkbook(filename, wb)
            const ref = getCoordinate(cell)
            await context.setCurrentCell(ref)

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ ref, horizontal: arg.horizontal, vertical: arg.vertical, wrapText: arg.wrapText }) }],
                structuredContent: { ref, horizontal: arg.horizontal, vertical: arg.vertical, wrapText: arg.wrapText }
            })
        })

        this.registerTool('set_cell_border', { description: 'set borders on a cell with a given style and sides', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            borderStyle: z.enum(borderStyleValues).optional(),
            sides: z.enum(sideValues).optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            borderStyle: z.string().optional(),
            sides: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile()
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true })

            let wb: Workbook
            try {
                wb = await context.getWorkbook(filename)
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true })
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet()
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName)
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true })
            const ws: Worksheet = sheet.sheet

            let cell
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref) ?? setCellByCoord(ws, arg.ref, null)
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col) ?? setCellByCoord(ws, arg.row, arg.col, null)
            } else {
                const currentCell = await context.getCurrentCell()
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true })
                cell = getCellByCoord(ws, currentCell) ?? setCellByCoord(ws, currentCell, null)
            }

            const borderStyle = arg.borderStyle ?? 'thin'
            const sides = arg.sides ?? 'all'

            if (borderStyle === 'none') {
                if (sides === 'all') {
                    setCellBorder(wb, cell, makeBorder({}))
                } else {
                    setCellBorder(wb, cell, makeBorder({
                        [sides]: makeSide()
                    }))
                }
            } else {
                const side = makeSide({ style: borderStyle as SideStyle })
                if (sides === 'all') {
                    setCellBorderAll(wb, cell, { style: borderStyle as SideStyle })
                } else {
                    setCellBorder(wb, cell, makeBorder({
                        [sides]: side
                    }))
                }
            }

            await context.setWorkbook(filename, wb)
            const ref = getCoordinate(cell)
            await context.setCurrentCell(ref)

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ ref, borderStyle, sides }) }],
                structuredContent: { ref, borderStyle, sides }
            })
        })
    }
}
