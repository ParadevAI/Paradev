// usage: node loop.mjs <side> <relayPort> <cycles>   (see README.md)
// Real relay bundle of <side> under `wrangler dev --no-bundle`, real host-service of <side>,
// stub API (JWKS + host.ensure/relayEndpoint/checkAccess), fault-injecting TCP proxy host<->relay.
import { spawn } from "node:child_process";
import { createServer as createHttp } from "node:http";
import net from "node:net";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { S, sleep, startHost, addWorkspace, makeIssuer, wranglerBin, requireBuilt, workerdStats as groupStats, tailLines } from "./lib.mjs";

const [side, relayPortArg, cyclesArg] = process.argv.slice(2);
if (!side || !relayPortArg || !cyclesArg) { console.error("usage: node loop.mjs <side> <relayPort> <cycles>"); process.exit(2); }
requireBuilt(side);
const rt = join(S, `rt-${side}`);
const RELAY_PORT = Number(relayPortArg);
const API_PORT = RELAY_PORT + 1, PROXY_PORT = RELAY_PORT + 2, INSPECT_PORT = RELAY_PORT + 3, HOST_PORT = RELAY_PORT + 10;
const CYCLES = Number(cyclesArg);
const API = `http://127.0.0.1:${API_PORT}`;
const RELAY = `http://127.0.0.1:${RELAY_PORT}`;
const ORG = randomUUID();
let HOST_ID = "";
const VARIANT = process.env.VARIANT ?? "";
const STEPS = (process.env.STEPS ?? "full,replace,dialDrop").split(",");
const NO_STREAM = process.env.NO_STREAM === "1";
const NO_INSPECT = process.env.NO_INSPECT === "1";
const OUT = join(S, "results", side + VARIANT);
mkdirSync(OUT, { recursive: true });
const WLOG = join(OUT, "wrangler.log");
const EVLOG = join(OUT, "events.log");
const ts = () => new Date().toISOString();
const log = (...a) => { const l = `${ts()} ${a.join(" ")}`; console.log(l); appendFileSync(EVLOG, l + "\n"); };

// ── keys / tokens / stub API ──
const issuer = makeIssuer(API);
const jwk = issuer.jwk;
const hostJwt = issuer.mint("host-user", [ORG]);
const callerJwt = issuer.mint("caller-user", [ORG]);
const api = createHttp(async (req, res) => {
	const url = new URL(req.url, API);
	if (url.pathname === "/api/auth/jwks") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ keys: [jwk] })); }
	if (url.pathname.startsWith("/api/trpc/")) {
		let body = "";
		for await (const c of req) body += c;
		const paths = decodeURIComponent(url.pathname.slice(10)).split(",");
		let inputs = {};
		try { inputs = JSON.parse(req.method === "GET" ? url.searchParams.get("input") ?? "{}" : body || "{}"); } catch {}
		const answers = paths.map((p, i) => {
			const input = inputs[i]?.json ?? inputs[i];
			if (p === "host.ensure") { HOST_ID = `${ORG}:${input.machineId}`; return { result: { data: { json: { id: randomUUID(), machineId: input.machineId, organizationId: ORG } } } }; }
			if (p === "host.relayEndpoint") return { result: { data: { json: { url: `http://127.0.0.1:${PROXY_PORT}` } } } };
			if (p === "host.checkAccess") return { result: { data: { json: { allowed: true } } } };
			return { error: { json: { message: "stub", code: -32004, data: { code: "NOT_FOUND", httpStatus: 404, path: p } } } };
		});
		const batched = url.searchParams.get("batch") === "1";
		res.writeHead(answers.every((a) => a.result) ? 200 : batched ? 207 : 404, { "content-type": "application/json" });
		return res.end(JSON.stringify(batched ? answers : answers[0]));
	}
	res.writeHead(404).end();
});
await new Promise((r) => api.listen(API_PORT, "127.0.0.1", r));

// ── fault proxy ──
const fault = { control: null, dialHttp: false };
const conns = [];
let controlOpens = 0;
let connSeq = 0;
const HOLDS = (process.env.HOLDS ?? "").split(",").filter(Boolean).map(Number);
let holdUntil = 0;
let currentHold = null;
const proxy = net.createServer((hostSock) => {
	const relaySock = net.connect(RELAY_PORT, "127.0.0.1");
	const conn = { kind: "?", hostSock, relaySock, upgraded: false };
	conns.push(conn);
	if (conns.length > 200) conns.splice(0, conns.length - 200);
	let first = true;
	let queue = null;
	hostSock.on("data", (buf) => {
		if (queue) { queue.push(buf); return; }
		if (first) {
			first = false;
			let head = buf.toString("latin1");
			conn.kind = head.startsWith("GET /v2/control") ? "control" : head.startsWith("GET /v2/dial") ? "dial" : "other";
			conn.n = ++connSeq;
			conn.t0 = Date.now();
			buf = Buffer.from(head.replace(/\r\nSec-WebSocket-Extensions:[^\r]*/i, ""), "latin1");
			if (conn.kind === "control" && Date.now() < holdUntil) {
				queue = [buf];
				const wait = holdUntil - Date.now();
				log(`conn#${conn.n} control held ${wait} ms`);
				setTimeout(() => {
					conn.t0 = Date.now();
					log(`conn#${conn.n} control released, request sent`);
					for (const b of queue) relaySock.write(b);
					queue = null;
				}, wait);
				return;
			}
			if (process.env.CONNLOG) log(`conn#${conn.n} host->relay ${conn.kind} request sent`);
		}
		relaySock.write(buf);
	});
	relaySock.on("data", (buf) => {
		const s = buf.toString("latin1");
		if (!conn.upgraded && s.startsWith("HTTP/1.1 ")) { if (process.env.CONNLOG) log(`conn#${conn.n} ${conn.kind} relay answered ${s.slice(9, 12)} after ${Date.now() - conn.t0} ms`); }
		if (!conn.upgraded && s.startsWith("HTTP/1.1 101")) { conn.upgraded = true; if (conn.kind === "control") controlOpens++; }
		if (conn.kind === "control" && fault.control && s.includes('"stream:dial"') && conn === liveControl()) {
			const mode = fault.control;
			fault.control = null;
			log(`proxy: swallowed stream:dial, mode=${mode}`);
			if (mode === "full") { if (currentHold !== null) holdUntil = Date.now() + currentHold; hostSock.destroy(); relaySock.destroy(); }
			else {
				conn.zombie = true;
				hostSock.destroy();
				const before = controlOpens;
				(async () => {
					const t = Date.now();
					while (controlOpens === before && Date.now() - t < 60000) await sleep(20);
					await sleep(300);
					log("proxy: replacement registered, closing old control socket on relay side");
					relaySock.destroy();
				})();
			}
			return;
		}
		if (conn.kind === "dial" && fault.dialHttp && s.includes('"http:request"')) {
			fault.dialHttp = false;
			log("proxy: dropped dial socket on http:request");
			hostSock.destroy(); relaySock.destroy();
			return;
		}
		if (!hostSock.destroyed) hostSock.write(buf);
	});
	const end = () => { if (!conn.zombie) relaySock.destroy(); hostSock.destroy(); };
	hostSock.on("error", end); hostSock.on("close", end);
	relaySock.on("error", (e) => { if (process.env.CONNLOG) log(`conn#${conn.n} ${conn.kind} relay socket error ${e.code}`); hostSock.destroy(); });
	relaySock.on("close", () => { if (process.env.CONNLOG && !conn.upgraded) log(`conn#${conn.n} ${conn.kind} relay closed before answering (${Date.now() - (conn.t0 ?? Date.now())} ms)`); hostSock.destroy(); });
});
const liveControl = () => conns.filter((c) => c.kind === "control" && c.upgraded && !c.hostSock.destroyed).at(-1);
await new Promise((r) => proxy.listen(PROXY_PORT, "127.0.0.1", r));

// ── wrangler dev on the pre-built bundle ──
let wrangler;
let wranglerStarts = 0;
async function startWrangler() {
	wranglerStarts++;
	appendFileSync(WLOG, `${ts()} ===== wrangler start #${wranglerStarts} =====\n`);
	wrangler = spawn(wranglerBin(), ["dev", "-c", join(S, `relay-${side}`, "wrangler.json"), "--no-bundle", "--port", String(RELAY_PORT), "--ip", "127.0.0.1",
		"--inspector-port", String(INSPECT_PORT), "--persist-to", join(S, "state", side + VARIANT), "--var", `NEXT_PUBLIC_API_URL:${API}`, "--show-interactive-dev-session=false", "--log-level", "debug"],
		{ cwd: join(S, `relay-${side}`), env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
	const w = wrangler;
	const sink = (d) => { for (const l of String(d).split("\n")) if (l.trim()) appendFileSync(WLOG, `${ts()} ${l}\n`); };
	w.stdout.on("data", sink); w.stderr.on("data", sink);
	w.on("exit", (code, sig) => { appendFileSync(WLOG, `${ts()} ===== wrangler exited code=${code} sig=${sig} =====\n`); log(`WRANGLER EXITED code=${code} sig=${sig}`); });
	for (let i = 0; i < 600; i++) { try { if ((await fetch(`${RELAY}/health`)).ok) return; } catch {} await sleep(100); }
	throw new Error("relay did not come up");
}
function killWrangler() { try { process.kill(-wrangler.pid, "SIGKILL"); } catch {} }
await startWrangler();

// ── host ──
let host;
async function waitControl(before, timeout = 30000) {
	const t = Date.now();
	while (controlOpens === before) { if (Date.now() - t > timeout) return null; await sleep(20); }
	await sleep(300);
	return Date.now() - t;
}
const before0 = controlOpens;
host = await startHost({ rt, tag: `${side}${VARIANT}-loop`, port: HOST_PORT, org: ORG, extraEnv: { RELAY_URL: `http://127.0.0.1:${PROXY_PORT}`, SUPERSET_API_URL: API, AUTH_TOKEN: hostJwt } });
if ((await waitControl(before0)) === null) throw new Error("host never connected");
const wsDir = join(S, "data", side);
mkdirSync(wsDir, { recursive: true });
const wsId = addWorkspace(host, wsDir);

// ── probes ──
function terminalOpen(timeoutMs) {
	const path = `/hosts/${HOST_ID}/terminal/${randomUUID()}?workspaceId=${wsId}&create=1&token=${callerJwt}`;
	return new Promise((resolve) => {
		const t0 = Date.now();
		const sock = net.connect(RELAY_PORT, "127.0.0.1", () => sock.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
		let buf = "";
		const done = (status) => { clearTimeout(timer); sock.destroy(); resolve({ status, ms: Date.now() - t0 }); };
		const timer = setTimeout(() => done("hung"), timeoutMs);
		sock.on("data", (d) => { buf += d.toString("latin1"); const m = buf.match(/^HTTP\/1\.1 (\d{3})/); if (m) done(Number(m[1])); });
		sock.on("error", (e) => done(`socket-error:${e.code}`));
	});
}
async function httpCall(timeoutMs) {
	const t0 = Date.now();
	try {
		const r = await fetch(`${RELAY}/hosts/${HOST_ID}/trpc/workspace.list`, { headers: { Authorization: `Bearer ${callerJwt}` }, signal: AbortSignal.timeout(timeoutMs) });
		await r.text();
		return { status: r.status, ms: Date.now() - t0 };
	} catch (e) { return { status: e.name === "TimeoutError" ? "hung" : `error:${e.cause?.code ?? e.name}`, ms: Date.now() - t0 }; }
}
async function openStream() {
	const ws = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/hosts/${HOST_ID}/terminal/${randomUUID()}?workspaceId=${wsId}&create=1&token=${callerJwt}`);
	const st = { ws, closed: null, text: "" };
	ws.binaryType = "arraybuffer";
	ws.addEventListener("message", (e) => { st.text += typeof e.data === "string" ? e.data : Buffer.from(e.data).toString(); });
	ws.addEventListener("close", (e) => { st.closed = e.code; });
	await Promise.race([new Promise((res) => ws.addEventListener("open", () => { st.opened = true; res(); }, { once: true })), sleep(3000)]);
	return st;
}
function accepts() {
	return new Promise((resolve) => {
		const s = net.connect(RELAY_PORT, "127.0.0.1");
		const t = setTimeout(() => { s.destroy(); resolve("connect-timeout"); }, 1000);
		s.on("connect", () => { clearTimeout(t); s.destroy(); resolve("accepts"); });
		s.on("error", (e) => { clearTimeout(t); resolve(e.code); });
	});
}
const workerdStats = () => groupStats(wrangler.pid);
const ILOG = join(OUT, "inspector.log");
const inspector = { ws: null, id: 0, waiters: new Map(), counts: {} };
async function connectInspector() {
	try { inspector.ws?.close(); } catch {}
	const ws = new WebSocket(`ws://127.0.0.1:${INSPECT_PORT}/ws`, { headers: { Origin: "https://devtools.devprod.cloudflare.dev" } });
	inspector.ws = ws;
	ws.onmessage = (e) => {
		const m = JSON.parse(e.data);
		if (m.id && inspector.waiters.has(m.id)) { inspector.waiters.get(m.id)(m.result ?? m.error); inspector.waiters.delete(m.id); return; }
		if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
			const text = m.params.args.map((a) => a.value ?? a.description ?? a.preview?.properties?.map((p) => `${p.name}=${p.value}`).join(" ")).join(" ");
			const kind = /webSocketMessage:.*send\(\) after close/s.test(text) ? "DO webSocketMessage: send() after close()" : /KV PUT failed/.test(text) ? "KV PUT failed (placeHost)" : text.slice(0, 120);
			inspector.counts[kind] = (inspector.counts[kind] ?? 0) + 1;
			appendFileSync(ILOG, `${ts()} console.${m.params.type} ${text.replace(/\n/g, " | ")}\n`);
		}
		if (m.method === "Runtime.exceptionThrown") {
			inspector.counts["uncaught exception / unhandled rejection"] = (inspector.counts["uncaught exception / unhandled rejection"] ?? 0) + 1;
			appendFileSync(ILOG, `${ts()} EXCEPTION ${JSON.stringify(m.params.exceptionDetails).slice(0, 2000)}\n`);
		}
	};
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(rej, 3000); });
	await cdp("Runtime.enable");
}
function cdp(method) {
	return new Promise((res) => {
		const id = ++inspector.id;
		inspector.waiters.set(id, res);
		try { inspector.ws.send(JSON.stringify({ id, method })); } catch { res(null); }
		setTimeout(() => { if (inspector.waiters.delete(id)) res(null); }, 3000);
	});
}
async function heapUsage() {
	if (!inspector.ws || inspector.ws.readyState !== 1) { try { await connectInspector(); } catch (e) { return "inspector-unavailable"; } }
	await cdp("HeapProfiler.collectGarbage");
	const u = await cdp("Runtime.getHeapUsage");
	return u?.usedSize ? Math.round(u.usedSize / 1024) : null;
}
const wlogLines = () => tailLines(WLOG, 60);

// ── loop ──
const BUG_TIMEOUT = 90000;
const cycles = [];
const stalls = [];
const okHealth = (h) => h.open.status === 101 && h.open.ms <= 2000 && h.http.status === 200 && h.http.ms <= 2000;
if (!NO_INSPECT) await connectInspector();
writeFileSync(join(OUT, "baseline.json"), JSON.stringify({ workerd: workerdStats(), heapKb: await heapUsage() }));
for (let c = 0; c < CYCLES; c++) {
	const row = { c, at: ts() };
	currentHold = HOLDS.length ? HOLDS[c % HOLDS.length] : null;
	row.hold = currentHold;
	const st = NO_STREAM ? null : await openStream();
	let before = controlOpens;
	row.full = row.replace = row.dialDrop = { status: "skipped" };
	row.fullReconnectMs = row.replaceReconnectMs = 0;
	if (STEPS.includes("full")) {
		fault.control = "full";
		row.full = await terminalOpen(BUG_TIMEOUT);
		row.fullReconnectMs = await waitControl(before, (currentHold ?? 0) + 30000);
	}
	if (STEPS.includes("replace")) {
		before = controlOpens;
		fault.control = "replace";
		row.replace = await terminalOpen(BUG_TIMEOUT);
		row.replaceReconnectMs = await waitControl(before);
	}
	if (STEPS.includes("dialDrop")) {
		fault.dialHttp = true;
		row.dialDrop = await httpCall(BUG_TIMEOUT);
	}
	fault.dialHttp = false;
	fault.control = null;
	row.streamClosed = !st ? "none" : st.opened ? st.closed ?? "open" : "never-opened";
	try { st?.ws.close(); } catch {}
	row.health = { open: await terminalOpen(2000), http: await httpCall(2000) };
	row.workerd = workerdStats();
	row.heapKb = NO_INSPECT ? null : await heapUsage();
	row.inspectorCounts = { ...inspector.counts };
	const hung = ["full", "replace", "dialDrop"].filter((k) => row[k].status === "hung");
	if (!okHealth(row.health) || hung.length || row.fullReconnectMs === null || row.replaceReconnectMs === null) {
		const stall = { c, at: ts(), hung, health: row.health, reconnect: [row.fullReconnectMs, row.replaceReconnectMs], tcp: await accepts(), wranglerAlive: wrangler.exitCode === null && wrangler.signalCode === null, wranglerTail: wlogLines() };
		log(`STALL cycle ${c}: ${JSON.stringify({ hung, health: row.health, tcp: stall.tcp, alive: stall.wranglerAlive })}`);
		const t = Date.now();
		let recovered = null;
		while (stall.wranglerAlive && Date.now() - t < 30000) {
			const h = { open: await terminalOpen(2000), http: await httpCall(2000) };
			if (okHealth(h)) { recovered = Date.now() - t; break; }
			await sleep(1000);
		}
		stall.recoveredMs = recovered;
		if (recovered === null) {
			stall.action = "restarted wrangler";
			killWrangler();
			await sleep(1000);
			const b = controlOpens;
			await startWrangler();
			if (!NO_INSPECT) await connectInspector().catch(() => {});
			stall.hostReconnectAfterRestartMs = await waitControl(b, 60000);
		}
		stalls.push(stall);
		writeFileSync(join(OUT, "stalls.json"), JSON.stringify(stalls, null, 2));
	}
	cycles.push(row);
	log(`cycle ${c} ${JSON.stringify({ hold: row.hold, full: row.full, replace: row.replace, dialDrop: row.dialDrop, health: row.health, stream: row.streamClosed, errs: row.inspectorCounts, workerd: row.workerd, heapKb: row.heapKb })}`);
	writeFileSync(join(OUT, "cycles.json"), JSON.stringify(cycles, null, 2));
}
const hs = await host.stop();
log(`host stop ${JSON.stringify(hs)}`);
writeFileSync(join(OUT, "stalls.json"), JSON.stringify(stalls, null, 2));
killWrangler();
api.close(); proxy.close();
writeFileSync(join(OUT, "inspector-counts.json"), JSON.stringify(inspector.counts, null, 2));
log(`DONE cycles=${cycles.length} stalls=${stalls.length} wranglerStarts=${wranglerStarts}`);
process.exit(0);
