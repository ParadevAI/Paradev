/**
 * Serves the output of scripts/build-web.ts on AGENTS_PORT with the same
 * routes as the Vercel deployment, as the local target of apps/web's /agents
 * rewrite.
 *
 * Run from apps/mobile: bun --env-file=../../.env scripts/serve-web.ts
 */
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const staticDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../.vercel/output/static",
);
const indexFile = join(staticDir, "agents/index.html");
const port = Number(process.env.AGENTS_PORT ?? 3019);
const CONTENT_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json",
	".png": "image/png",
	".riv": "application/octet-stream",
	".svg": "image/svg+xml",
	".ttf": "font/ttf",
};

async function resolveFile(pathname: string): Promise<string> {
	const file = join(staticDir, normalize(decodeURIComponent(pathname)));
	const info = await stat(file).catch(() => null);
	return info?.isFile() ? file : indexFile;
}

createServer(async (request, response) => {
	const { pathname } = new URL(request.url ?? "/", "http://localhost");
	if (pathname !== "/agents" && !pathname.startsWith("/agents/")) {
		response.writeHead(404).end("Not found");
		return;
	}
	const file = await resolveFile(pathname);
	response.writeHead(200, {
		"content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
	});
	response.end(await readFile(file));
}).listen(port, () => {
	console.log(`Agents web: http://localhost:${port}/agents`);
});
