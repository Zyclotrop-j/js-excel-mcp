import createServer from './mcpServer/simpleStreamableHttp.js'
import { modifyCellTool } from "./tools/excelTool.js";
import { BatchTool } from "./tools/toolClasses/batchTool.js";


const toolList = [modifyCellTool];
const batchTool = new BatchTool("batch", "Batch tool", toolList);

createServer(async (server) => {

  for(const tool of toolList) {
    server.registerTool(tool.getToolName(), tool.getToolDescription(), (args, ctx) => {
      return tool.handleRequest(args, ctx);
    });
  }

  server.registerTool(batchTool.getToolName(), batchTool.getToolDescription(), (args, ctx) => {
    return batchTool.handleRequest(args, ctx);
  });
})
