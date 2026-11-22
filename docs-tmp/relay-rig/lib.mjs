import { execFileSync, spawn } from "node:child_process";
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

export const S = resolve(process.env.RIG_DIR ?? join(tmpdir(), "relay-rig"));
export const REPO = process.env.REPO ? resolve(process.env.REPO) : null;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function wranglerBin() {
	if (process.env.WRANGLER_BIN) return process.env.WRANGLER_BIN;
	if (!REPO) throw new Error("set REPO=<checkout> or WRANGLER_BIN=<path to wrangler>");
	return join(REPO, "apps/relay/node_modules/.bin/wrangler");
}

export function requireBuilt(side) {
	for (const d of [`relay-${side}/wrangler.json`, `rt-${side}/host-service.js`]) {
		if (!existsSync(join(S, d))) throw new Error(`missing ${join(S, d)}; run: node build.mjs ${side} <checkout>`);
	}
}

async function openDb(path) {
	if (process.versions.bun) {
		const { Database } = await import("bun:sqlite");
		return new Database(path);
	}
	const { DatabaseSync } = await import("node:sqlite");
	return new DatabaseSync(path);
}

export function makeIssuer(apiUrl) {
	const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
	const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
	const mint = (sub, organizationIds) => {
		const now = Math.floor(Date.now() / 1000);
		const head = `${b64u({ alg: "RS256", kid: "k1" })}.${b64u({ organizationIds, teamIds: [], sub, iss: apiUrl, aud: apiUrl, iat: now, exp: now + 6 * 3600 })}`;
		return `${head}.${createSign("RSA-SHA256").update(head).sign(privateKey).toString("base64url")}`;
	};
	return { jwk, mint };
}

export function hostNode(rt) {
	return process.env.HOST_NODE ?? (existsSync(join(rt, "node")) ? join(rt, "node") : process.versions.bun ? "node" : process.execPath);
}

export async function startHost({ rt, tag, port, extraEnv = {}, org }) {
	const dir = join(S, "runs", tag);
	mkdirSync(join(dir, "home"), { recursive: true });
	const secret = "harness-secret-" + randomUUID();
	const env = {
		PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
		HOME: join(dir, "home"),
		SUPERSET_HOME_DIR: join(dir, "home", ".paradev"),
		ORGANIZATION_ID: org,
		HOST_DB_PATH: join(dir, "host.db"),
		HOST_MIGRATIONS_FOLDER: join(rt, "drizzle"),
		AUTH_TOKEN: "x",
		SUPERSET_API_URL: "http://127.0.0.1:9",
		HOST_SERVICE_SECRET: secret,
		PORT: String(port),
		NODE_ENV: "production",
		...extraEnv,
	};
	const t0 = Date.now();
	const proc = spawn(hostNode(rt), [join(rt, "host-service.js")], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
	let log = "";
	proc.stdout.on("data", (d) => (log += d));
	proc.stderr.on("data", (d) => (log += d));
	const exited = new Promise((r) => proc.on("exit", (code, sig) => r({ code, sig, at: Date.now() })));
	while (!log.includes("[host-service] listening")) {
		if (proc.exitCode !== null) throw new Error("host exited: " + log.slice(-2000));
		if (Date.now() - t0 > 30000) throw new Error("host start timeout");
		await sleep(50);
	}
	return {
		proc, pid: proc.pid, port, secret, dir,
		get log() { return log; },
		db: await openDb(env.HOST_DB_PATH),
		async stop() {
			const t = Date.now();
			proc.kill("SIGTERM");
			const timer = setTimeout(() => proc.kill("SIGKILL"), 20000);
			const r = await exited;
			clearTimeout(timer);
			this.db.close();
			writeFileSync(join(dir, "host-service.log"), log);
			return { ...r, ms: r.at - t };
		},
	};
}

export function addWorkspace(host, path, id = randomUUID()) {
	host.db
		.prepare("insert into workspaces (id, project_id, worktree_path, branch, name, type, created_at, updated_at) values (?, null, ?, 'main', ?, 'session', ?, ?)")
		.run(id, path, "ws-" + id.slice(0, 6), Date.now(), Date.now());
	return id;
}

function openFdCount(pid) {
	if (existsSync(`/proc/${pid}/fd`)) return readdirSync(`/proc/${pid}/fd`).length;
	try {
		return execFileSync("lsof", ["-n", "-P", "-p", String(pid), "-F", "f"], { encoding: "utf8" }).split("\n").filter((l) => /^f\d/.test(l)).length;
	} catch { return null; }
}

export function workerdStats(groupPid) {
	try {
		const out = execFileSync("ps", ["-A", "-o", "pid=,pgid=,rss=,comm="], { encoding: "utf8" });
		let rss = 0, fds = 0;
		for (const l of out.trim().split("\n")) {
			const [pid, pgid, r, ...comm] = l.trim().split(/\s+/);
			if (Number(pgid) !== groupPid || basename(comm.join(" ")) !== "workerd") continue;
			rss += Number(r);
			fds += openFdCount(pid) ?? 0;
		}
		return { rssMb: Math.round(rss / 1024), fds };
	} catch { return null; }
}

export function tailLines(file, n) {
	try { return readFileSync(file, "utf8").split("\n").slice(-n - 1).join("\n"); } catch { return ""; }
}
