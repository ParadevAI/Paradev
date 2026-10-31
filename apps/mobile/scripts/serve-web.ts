/**
 * Serves the output of scripts/build-web.ts on AGENTS_PORT with the same
 * routes as the Vercel deployment, as the local target of apps/web's /agents
 * rewrite.
 *
 * Run from apps/mobile: bun --env-file=../../.env scripts/serve-web.ts
 */
import { join, normalize } from "node:path";

const staticDir = join(import.meta.dir, "../.vercel/output/static");
const port = Number(process.env.AGENTS_PORT ?? 3019);

Bun.serve({
	port,
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname !== "/agents" && !pathname.startsWith("/agents/")) {
			return new Response("Not found", { status: 404 });
		}
		const file = Bun.file(join(staticDir, normalize(pathname)));
		if (pathname !== "/agents/" && (await file.exists())) {
			return new Response(file);
		}
		return new Response(Bun.file(join(staticDir, "agents/index.html")), {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	},
});
console.log(`Agents web: http://localhost:${port}/agents`);
