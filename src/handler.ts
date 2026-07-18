import { httpServerHandler } from "cloudflare:node";
import server from './server.js';

server.app.listen(server.port, () => {
    console.error(`  Protected Resource Metadata: http://localhost:${server.port}/.well-known/oauth-protected-resource/mcp`);
});
export default httpServerHandler({ port: server.port });

