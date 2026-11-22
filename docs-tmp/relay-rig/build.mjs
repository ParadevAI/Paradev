// usage: node build.mjs <side> <checkout> [--relay-only]   (see README.md)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { S } from "./lib.mjs";

const [side, checkoutArg, flag] = process.argv.slice(2);
if (!side || !checkoutArg) { console.error("usage: node build.mjs <side> <checkout> [--relay-only]"); process.exit(2); }
const repo = resolve(checkoutArg);
const run = (cmd, args, cwd, logFile) => {
	console.log(`$ (cd ${cwd} && ${cmd} ${args.join(" ")})`);
	try {
		const out = execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
		if (logFile) writeFileSync(logFile, out);
	} catch (e) {
		if (logFile) writeFileSync(logFile, `${e.stdout ?? ""}${e.stderr ?? ""}`);
		throw new Error(`${cmd} failed${logFile ? `; see ${logFile}` : ""}`);
	}
};
mkdirSync(S, { recursive: true });

const relayDir = join(S, `relay-${side}`);
const relayApp = join(repo, "apps/relay");
const wrangler = process.env.WRANGLER_BIN ?? join(relayApp, "node_modules/.bin/wrangler");
if (!existsSync(wrangler)) throw new Error(`no wrangler at ${wrangler}; run bun install in ${repo}`);
rmSync(relayDir, { recursive: true, force: true });
run(wrangler, ["deploy", "--dry-run", "--outdir", relayDir], relayApp, join(S, `relay-${side}-build.log`));
const srcCfg = readFileSync(join(relayApp, "wrangler.jsonc"), "utf8");
const compatibilityDate = srcCfg.match(/"compatibility_date"\s*:\s*"([^"]+)"/)?.[1] ?? "2026-07-01";
const compatibilityFlags = JSON.parse(srcCfg.match(/"compatibility_flags"\s*:\s*(\[[^\]]*\])/)?.[1] ?? '["nodejs_als"]');
writeFileSync(join(relayDir, "wrangler.json"), JSON.stringify({
	name: `relay-loop-${side}`,
	main: "index.js",
	compatibility_date: compatibilityDate,
	compatibility_flags: compatibilityFlags,
	no_bundle: true,
	rules: [{ type: "ESModule", globs: ["**/*.js"] }],
	vars: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:9" },
	durable_objects: { bindings: [{ name: "HostTunnel", class_name: "HostTunnel" }] },
	kv_namespaces: [{ binding: "PLACEMENT", id: `local-placement-${side}` }],
	migrations: [{ tag: "v1", new_sqlite_classes: ["HostTunnel"] }],
}, null, 1));
console.log(`relay bundle: ${relayDir}`);

if (flag !== "--relay-only") {
	const target = `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
	const cli = join(repo, "packages/cli");
	run("bun", ["run", "build:dist", "--", `--target=${target}`], cli, join(S, `dist-${side}.log`));
	const dist = join(S, `d-${side}`);
	rmSync(dist, { recursive: true, force: true });
	mkdirSync(dist, { recursive: true });
	run("tar", ["-xzf", join(cli, "dist", `superset-${target}.tar.gz`), "-C", dist], cli);
	const rt = join(S, `rt-${side}`);
	rmSync(rt, { recursive: true, force: true });
	mkdirSync(rt, { recursive: true });
	for (const f of ["host-service.js", "host-worker.js", "pty-daemon.js"]) cpSync(join(dist, "lib", f), join(rt, f));
	cpSync(join(dist, "lib", "chat-migrations"), join(rt, "chat-migrations"), { recursive: true });
	cpSync(join(dist, "share", "migrations"), join(rt, "drizzle"), { recursive: true });
	symlinkSync(join(dist, "lib", "node_modules"), join(rt, "node_modules"));
	symlinkSync(join(dist, "lib", "node"), join(rt, "node"));
	console.log(`host runtime: ${rt}`);
}
