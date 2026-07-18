import { MockMcpServer, createMockRequestContext } from './test/helpers/test-server.js';
import { createTestContext } from './test/helpers/test-context.js';
import { ImageHandler } from './src/tools/handleImage.js';
import { WorkbookTools } from './src/tools/handleWorkbook.js';
import { run } from './src/util/requestContext.js';

await run(async () => {
    const mockServer = new MockMcpServer();
    const tc = createTestContext('probe');
    await tc;
    const h = new ImageHandler();
    h.server = mockServer as any;
    h.context = tc;
    await h.register([]);
    const wt = new WorkbookTools();
    wt.server = mockServer as any;
    wt.context = tc;
    wt.expressApp = { get: () => {}, post: () => {} } as any;
    wt.serverOptions = { serverHost: 'http://localhost:3000' };
    await wt.register([]);
    await mockServer.getTool('create_new_workbook').cb({ filename: 'p.xlsx', createDefaultWorksheet: 'Sheet1' }, createMockRequestContext('probe'));
    const result = await mockServer.getTool('insert_image').cb({
        anchorCell: 'A1', imageUrl: 'http://127.0.0.1:1/nope.png', widthPx: 100, heightPx: 100
    }, createMockRequestContext('probe'));
    console.log(JSON.stringify(result.content, null, 2));
    process.exit(0);
});