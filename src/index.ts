/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { httpServerHandler } from "cloudflare:node";
import server from './server';
import { setWorkerEnv } from './util/workerEnv';

export { SessionStateDO } from './filesystem/sessionStateDO';

server.app.listen(server.port, () => {
	console.error(`  Protected Resource Metadata: http://localhost:${server.port}/.well-known/oauth-protected-resource/mcp`);
});

const inner = httpServerHandler({ port: server.port }) as unknown as ExportedHandler<Env>;

export default {
	async fetch(request, env, ctx) {
		if (env) setWorkerEnv(env);
		return inner.fetch!(request, env, ctx);
	}
} satisfies ExportedHandler<Env>;