/**
 * Builds the web target as a Vercel prebuilt output served under /agents, the
 * path apps/web rewrites to this deployment.
 *
 * Run from apps/mobile: bun scripts/build-web.ts
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "/agents";
const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const exportDir = join(mobileRoot, "dist/web");
const outputDir = join(mobileRoot, ".vercel/output");

const exported = spawnSync(
	"bunx",
	["expo", "export", "--platform", "web", "--output-dir", exportDir],
	{
		cwd: mobileRoot,
		stdio: "inherit",
		env: { ...process.env, MOBILE_WEB_BASE_URL: BASE_URL },
	},
);
if (exported.status !== 0) process.exit(exported.status ?? 1);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(join(outputDir, "static"), { recursive: true });
cpSync(exportDir, join(outputDir, "static", BASE_URL), { recursive: true });
writeFileSync(
	join(outputDir, "config.json"),
	`${JSON.stringify(
		{
			version: 3,
			routes: [
				{
					src: `^${BASE_URL}/_expo/static/(.*)$`,
					headers: { "cache-control": "public, max-age=31536000, immutable" },
					continue: true,
				},
				{ handle: "filesystem" },
				{ src: `^${BASE_URL}(?:/.*)?$`, dest: `${BASE_URL}/index.html` },
			],
		},
		null,
		"\t",
	)}\n`,
);
console.log(`Vercel output: ${outputDir}`);
