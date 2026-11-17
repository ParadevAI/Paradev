#!/usr/bin/env node
// The box's entrypoint (`/opt/dev/boot.js`): picks the runner bundle the API asked for, then runs it in this process.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Resolved, resolveBundle } from "./boot/boot.ts";

const log = (line: string) => console.log(`dev-boot: ${line}`);
const builtinDir = dirname(fileURLToPath(import.meta.url));
const agentDir = process.env.DEV_AGENT_DIR ?? "/agent";

const resolve = (want: string | undefined) =>
	resolveBundle({
		builtinDir,
		want,
		cacheDir: join(agentDir, ".dev", "runner"),
		apiUrl: process.env.DEV_API_URL ?? "",
		log,
	});

const bundle = await resolve(process.env.DEV_RUNNER_SHA);
if (bundle.fallback)
	log(
		`runner bundle ${process.env.DEV_RUNNER_SHA?.slice(0, 12)} unavailable (${bundle.fallback}); running the image's`,
	);

async function run(b: Resolved) {
	log(
		`runner bundle ${b.sha.slice(0, 12)} from the ${b.source === "image" ? "image" : b.source === "cache" ? "cache" : "API"}`,
	);
	// `/usr/local/bin/dev` runs this CLI, so the bundle's runner and CLI always come as a pair.
	process.env.DEV_CLI = join(b.dir, "cli.js");
	await import(pathToFileURL(join(b.dir, "runner.js")).href);
}

try {
	await run(bundle);
} catch (err) {
	if (bundle.source === "image") throw err;
	log(
		`runner bundle ${bundle.sha.slice(0, 12)} failed to start (${err instanceof Error ? err.message : err}); running the image's`,
	);
	await run(await resolve(undefined));
}
