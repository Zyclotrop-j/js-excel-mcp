import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ExcelService } from "./services/excelService.js";

const server = new Server({
  name: "js-excel-mcp",
  version: "1.0.0",
});

const excelService = new ExcelService();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_excel",
        description: "Read data from an Excel file",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the Excel file",
            },
            sheetName: {
              type: "string",
              description: "Name of the sheet to read (optional, reads first sheet by default)",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "write_excel",
        description: "Write data to an Excel file",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the Excel file",
            },
            sheetName: {
              type: "string",
              description: "Name of the sheet to write to",
            },
            data: {
              type: "array",
              description: "Array of objects representing rows",
            },
          },
          required: ["filePath", "data"],
        },
      },
      {
        name: "list_sheets",
        description: "List all sheet names in an Excel file",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the Excel file",
            },
          },
          required: ["filePath"],
        },
      },
    ] as Tool[],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_excel": {
        const result = await excelService.readExcel(
          args.filePath as string,
          args.sheetName as string | undefined
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "write_excel": {
        const result = await excelService.writeExcel(
          args.filePath as string,
          args.data as Record<string, unknown>[],
          args.sheetName as string | undefined
        );
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "list_sheets": {
        const result = await excelService.listSheets(args.filePath as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Excel MCP Server running on stdio");
}

main().catch(console.error);