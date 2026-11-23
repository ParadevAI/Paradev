// usage: node race.mjs <side> <port> <gapsMs comma list> <rounds per gap>
// Two plain GET /health requests D ms apart through `wrangler dev`, no host, no Durable Object.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { S, wranglerBin } from "./lib.mjs";
import { join } from "node:path";
import http from "node:http";
import net from "node:net";
const FIRST = process.env.FIRST ?? "health";
const SECOND = process.env.SECOND ?? "health";
function upgradeStatus(path) {
	return new Promise((resolve) => {
		const sock = net.connect(PORT, "127.0.0.1", () => sock.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
		let b = "";
		const t = setTimeout(() => { sock.destroy(); resolve("timeout"); }, 3000);
		sock.on("data", (d) => { b += d; const m = b.match(/^HTTP\/1\.1 (\d{3})/); if (m) { clearTimeout(t); sock.destroy(); resolve(Number(m[1])); } });
		sock.on("error", () => { clearTimeout(t); resolve("err"); });
	});
}
function upgradeThenHangUp() {
	return new Promise((resolve) => {
		const sock = net.connect(PORT, "127.0.0.1", () => sock.write(`GET /hosts/00000000-0000-4000-8000-000000000000:aa/terminal/x HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
		let b = "";
		sock.on("data", (d) => { b += d; const m = b.match(/^HTTP\/1\.1 (\d{3})/); if (m) { sock.destroy(); resolve(Number(m[1])); } });
		sock.on("error", () => resolve("err"));
	});
}

const [side, portArg, gapsArg, roundsArg] = process.argv.slice(2);
if (!side || !portArg || !gapsArg || !roundsArg) { console.error("usage: node race.mjs <side> <port> <gapsMs,...> <rounds>"); process.exit(2); }
if (!existsSync(join(S, `relay-${side}`, "wrangler.json"))) throw new Error(`missing ${join(S, `relay-${side}`)}; run: node build.mjs ${side} <checkout> --relay-only`);
const PORT = Number(portArg);
const OUT = join(S, "results", `race-${side}-${process.env.FIRST ?? "health"}-${process.env.SECOND ?? "health"}${process.env.VARIANT ?? ""}`);
mkdirSync(OUT, { recursive: true });
const WLOG = join(OUT, "wrangler.log");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wrangler;
async function start() {
	wrangler = spawn(wranglerBin(), ["dev", "-c", join(S, `relay-${side}`, "wrangler.json"), "--no-bundle", "--port", String(PORT), "--ip", "127.0.0.1", "--inspector-port", String(PORT + 3), "--persist-to", join(S, "state", `race-${side}${process.env.VARIANT ?? ""}`), "--show-interactive-dev-session=false"], { cwd: join(S, `relay-${side}`), env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
	const sink = (d) => appendFileSync(WLOG, String(d));
	wrangler.stdout.on("data", sink); wrangler.stderr.on("data", sink);
	for (let i = 0; i < 600; i++) { if (await get().then((s) => s === 200, () => false)) return; await sleep(100); }
	throw new Error("no relay");
}
const alive = () => wrangler.exitCode === null && wrangler.signalCode === null;
function get() {
	return new Promise((resolve, reject) => {
		const req = http.get({ host: "127.0.0.1", port: PORT, path: "/health", agent: false, headers: { connection: "close" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
		req.on("error", reject);
		req.setTimeout(3000, () => req.destroy(new Error("timeout")));
	});
}
await start();
const results = {};
for (const gap of gapsArg.split(",").map(Number)) {
	let deaths = 0, errors500 = 0;
	for (let r = 0; r < Number(roundsArg); r++) {
		const first = FIRST === "upgrade" ? await upgradeThenHangUp() : await get();
		if (r === 0) console.log("first request status", first);
		await sleep(gap);
		const s = SECOND === "upgrade" ? await upgradeStatus("/v2/control") : await get().catch((e) => e.message);
		if (r === 0) console.log("second request status", s);
		if (s === 500) errors500++;
		await sleep(300);
		if (!alive()) { deaths++; appendFileSync(WLOG, `\n===== DIED gap=${gap} round=${r} =====\n`); await start(); }
	}
	results[gap] = { rounds: Number(roundsArg), wranglerExits: deaths, http500: errors500 };
	console.log(JSON.stringify({ gap, ...results[gap] }));
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
try { process.kill(-wrangler.pid, "SIGKILL"); } catch {}
process.exit(0);
