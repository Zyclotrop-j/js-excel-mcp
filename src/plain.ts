import server from './server';

server.app.listen(server.port, () => {
    console.error(`  Protected Resource Metadata: http://localhost:${server.port}/.well-known/oauth-protected-resource/mcp`);
});