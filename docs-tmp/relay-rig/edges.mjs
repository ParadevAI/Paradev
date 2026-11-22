// usage: node edges.mjs <side> <relayPort>   (see README.md)
// Edge cases for "fail dials and exchanges at once" against a real relay under `wrangler dev`,
// two real host-services (different orgs => different HostTunnel objects), stub API, fault proxies.
import { spawn } from "node:child_process";
import { createServer as createHttp } from "node:http";
import net from "node:net";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { S, sleep, startHost, addWorkspace, makeIssuer, wranglerBin, requireBuilt } from "./lib.mjs";

const [side, portArg] = process.argv.slice(2);
if (!side || !portArg) { console.error("usage: node edges.mjs <side> <relayPort>"); process.exit(2); }
requireBuilt(side);
const TAG = side + (process.env.VARIANT ?? "");
const RELAY_PORT = Number(portArg);
const API_PORT = RELAY_PORT + 1;
const API = `http://127.0.0.1:${API_PORT}`;
const RELAY = `http://127.0.0.1:${RELAY_PORT}`;
const OUT = join(S, "results", `edges-${TAG}`);
mkdirSync(OUT, { recursive: true });
const WLOG = join(OUT, "wrangler.log");
const EVLOG = join(OUT, "events.log");
const ts = () => new Date().toISOString();
const log = (...a) => { const l = `${ts()} ${a.join(" ")}`; console.log(l); appendFileSync(EVLOG, l + "\n"); };

const ORGS = { A: randomUUID(), B: randomUUID() };
const HOSTS = {};
const issuer = makeIssuer(API);
const jwk = issuer.jwk;
const mint = (sub) => issuer.mint(sub, [ORGS.A, ORGS.B]);
const callerJwt = mint("caller");
const subOf = (req) => { try { return JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1], "base64url")).sub; } catch { return null; } };

const api = createHttp(async (req, res) => {
	const url = new URL(req.url, API);
	if (url.pathname === "/api/auth/jwks") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ keys: [jwk] })); }
	if (url.pathname.startsWith("/api/trpc/")) {
		let body = "";
		for await (const c of req) body += c;
		const paths = decodeURIComponent(url.pathname.slice(10)).split(",");
		let inputs = {};
		try { inputs = JSON.parse(req.method === "GET" ? url.searchParams.get("input") ?? "{}" : body || "{}"); } catch {}
		const who = subOf(req)?.replace("host-", "");
		const answers = paths.map((p, i) => {
			const input = inputs[i]?.json ?? inputs[i];
			if (p === "host.ensure") { HOSTS[input.organizationId === ORGS.A ? "A" : "B"].id = `${input.organizationId}:${input.machineId}`; return { result: { data: { json: { id: randomUUID(), machineId: input.machineId, organizationId: input.organizationId } } } }; }
			if (p === "host.relayEndpoint") return { result: { data: { json: { url: `http://127.0.0.1:${HOSTS[who].proxyPort}` } } } };
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

function makeProxy(name, port) {
	const p = { name, port, conns: [], controlOpens: 0, fault: { swallow: 0, holdHttpRequest: false, passThenDropMs: null }, holdUntil: 0 };
	p.live = () => p.conns.filter((c) => c.kind === "control" && c.upgraded && !c.hostSock.destroyed).at(-1);
	p.server = net.createServer((hostSock) => {
		const relaySock = net.connect(RELAY_PORT, "127.0.0.1");
		const conn = { kind: "?", hostSock, relaySock, upgraded: false };
		p.conns.push(conn);
		if (p.conns.length > 300) p.conns.splice(0, p.conns.length - 300);
		let first = true;
		let queue = null;
		hostSock.on("data", (buf) => {
			if (queue) { queue.push(buf); return; }
			if (first) {
				first = false;
				const head = buf.toString("latin1");
				conn.kind = head.startsWith("GET /v2/control") ? "control" : head.startsWith("GET /v2/dial") ? "dial" : "other";
				buf = Buffer.from(head.replace(/\r\nSec-WebSocket-Extensions:[^\r]*/i, ""), "latin1");
				if (conn.kind === "control" && Date.now() < p.holdUntil) {
					queue = [buf];
					setTimeout(() => { for (const b of queue) relaySock.write(b); queue = null; }, p.holdUntil - Date.now());
					return;
				}
			}
			relaySock.write(buf);
		});
		relaySock.on("data", (buf) => {
			const s = buf.toString("latin1");
			if (!conn.upgraded && s.startsWith("HTTP/1.1 101")) { conn.upgraded = true; if (conn.kind === "control") p.controlOpens++; }
			if (conn.kind === "control" && s.includes('"stream:dial"')) {
				if (p.fault.swallow > 0) { p.fault.swallow--; return; }
				if (p.fault.passThenDropMs !== null) {
					const ms = p.fault.passThenDropMs;
					p.fault.passThenDropMs = null;
					hostSock.write(buf);
					setTimeout(() => { hostSock.destroy(); relaySock.destroy(); }, ms);
					return;
				}
			}
			if (conn.kind === "dial" && p.fault.holdHttpRequest && s.includes('"http:request"')) { p.fault.holdHttpRequest = false; conn.held = true; return; }
			if (!hostSock.destroyed) hostSock.write(buf);
		});
		const end = () => { if (!conn.zombie) relaySock.destroy(); hostSock.destroy(); };
		hostSock.on("error", end); hostSock.on("close", end);
		relaySock.on("error", () => hostSock.destroy()); relaySock.on("close", () => hostSock.destroy());
	});
	p.dropNow = () => { const c = p.live(); if (c) { c.hostSock.destroy(); c.relaySock.destroy(); } };
	p.replaceNow = async () => {
		const c = p.live();
		if (!c) return;
		c.zombie = true;
		const before = p.controlOpens;
		c.hostSock.destroy();
		const t = Date.now();
		while (p.controlOpens === before && Date.now() - t < 60000) await sleep(20);
		await sleep(300);
		c.relaySock.destroy();
	};
	return p;
}

let wrangler;
async function startWrangler() {
	appendFileSync(WLOG, `${ts()} ===== wrangler start =====\n`);
	wrangler = spawn(wranglerBin(), ["dev", "-c", join(S, `relay-${side}`, "wrangler.json"), "--no-bundle", "--port", String(RELAY_PORT), "--ip", "127.0.0.1", "--inspector-port", String(RELAY_PORT + 3), "--persist-to", join(S, "state", `edges-${TAG}`), "--var", `NEXT_PUBLIC_API_URL:${API}`, "--show-interactive-dev-session=false"],
		{ cwd: join(S, `relay-${side}`), env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
	const sink = (d) => { for (const l of String(d).split("\n")) if (l.trim()) appendFileSync(WLOG, `${ts()} ${l}\n`); };
	wrangler.stdout.on("data", sink); wrangler.stderr.on("data", sink);
	wrangler.on("exit", (code) => log(`WRANGLER EXITED code=${code}`));
	for (let i = 0; i < 600; i++) { try { if ((await fetch(`${RELAY}/health`)).ok) return; } catch {} await sleep(100); }
	throw new Error("relay did not come up");
}
const wranglerAlive = () => wrangler.exitCode === null && wrangler.signalCode === null;
await startWrangler();

async function waitControl(p, before, timeout = 30000) {
	const t = Date.now();
	while (p.controlOpens === before) { if (Date.now() - t > timeout) return null; await sleep(20); }
	await sleep(300);
	return Date.now() - t;
}
for (const [k, port] of [["A", RELAY_PORT + 2], ["B", RELAY_PORT + 4]]) {
	const p = makeProxy(k, port);
	await new Promise((r) => p.server.listen(port, "127.0.0.1", r));
	HOSTS[k] = { proxyPort: port, proxy: p };
	const before = p.controlOpens;
	HOSTS[k].host = await startHost({ rt: join(S, `rt-${side}`), tag: `edges-${TAG}-${k}`, port: RELAY_PORT + 10 + (k === "A" ? 0 : 1), org: ORGS[k],
		extraEnv: { RELAY_URL: `http://127.0.0.1:${port}`, SUPERSET_API_URL: API, AUTH_TOKEN: await mint(`host-${k}`) } });
	if ((await waitControl(p, before)) === null) throw new Error(`host ${k} never connected`);
	const dir = join(S, "data", `edges-${k}`);
	mkdirSync(dir, { recursive: true });
	HOSTS[k].ws = addWorkspace(HOSTS[k].host, dir);
}

function terminalOpen(k, timeoutMs = 80000, hangUpAfterMs = null) {
	const h = HOSTS[k];
	const path = `/hosts/${h.id}/terminal/${randomUUID()}?workspaceId=${h.ws}&create=1&token=${callerJwt}`;
	return new Promise((resolve) => {
		const t0 = Date.now();
		const sock = net.connect(RELAY_PORT, "127.0.0.1", () => sock.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
		let buf = "";
		const done = (status) => { clearTimeout(timer); clearTimeout(hang); sock.destroy(); resolve({ status, ms: Date.now() - t0 }); };
		const timer = setTimeout(() => done("hung"), timeoutMs);
		const hang = hangUpAfterMs === null ? null : setTimeout(() => done("caller-hung-up"), hangUpAfterMs);
		sock.on("data", (d) => { buf += d.toString("latin1"); const m = buf.match(/^HTTP\/1\.1 (\d{3})/); if (m) done(Number(m[1])); });
		sock.on("error", (e) => done(`socket-error:${e.code}`));
	});
}
async function httpCall(k, timeoutMs = 90000) {
	const t0 = Date.now();
	try {
		const r = await fetch(`${RELAY}/hosts/${HOSTS[k].id}/trpc/workspace.list`, { headers: { Authorization: `Bearer ${callerJwt}` }, signal: AbortSignal.timeout(timeoutMs) });
		await r.text();
		return { status: r.status, ms: Date.now() - t0 };
	} catch (e) { return { status: e.name === "TimeoutError" ? "hung" : `error:${e.cause?.code ?? e.name}`, ms: Date.now() - t0 }; }
}
async function stream(k) {
	const h = HOSTS[k];
	const ws = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/hosts/${h.id}/terminal/${randomUUID()}?workspaceId=${h.ws}&create=1&token=${callerJwt}`);
	ws.binaryType = "arraybuffer";
	const st = { ws, closed: null, text: "" };
	ws.addEventListener("message", (e) => { st.text += typeof e.data === "string" ? e.data : Buffer.from(e.data).toString(); });
	ws.addEventListener("close", (e) => { st.closed = e.code; });
	await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
	st.echo = async (m, timeout = 8000) => {
		const before = st.text.length;
		ws.send(JSON.stringify({ type: "input", data: `echo ${m}-ok\r` }));
		const t = Date.now();
		while (Date.now() - t < timeout) {
			if (st.text.slice(before).split(`${m}-ok`).length > 2) return true;
			if (st.closed !== null) return false;
			await sleep(20);
		}
		return false;
	};
	await sleep(1200);
	return st;
}
async function health() {
	const r = {};
	for (const k of ["A", "B"]) {
		const o = await terminalOpen(k, 2000);
		const h = await httpCall(k, 2000);
		r[k] = o.status === 101 && o.ms <= 2000 && h.status === 200 && h.ms <= 2000 ? "ok" : { open: o, http: h };
	}
	r.wrangler = wranglerAlive() ? "alive" : "DEAD";
	return r;
}
const statuses = (rs) => { const c = {}; for (const x of rs) c[x.status] = (c[x.status] ?? 0) + 1; return c; };
const maxMs = (rs) => Math.max(...rs.map((x) => x.ms));
const results = {};
async function scenario(name, fn) {
	if (!wranglerAlive()) { log(`skip ${name}: wrangler dead`); results[name] = { skipped: "wrangler dead" }; return; }
	let r;
	try { r = await fn(); } catch (e) { r = { error: String(e.stack ?? e) }; }
	const pa = HOSTS.A.proxy;
	if (!pa.live()) await waitControl(pa, pa.controlOpens, 30000);
	r.after = await health();
	results[name] = r;
	log(name, JSON.stringify(r));
	writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
}
const A = HOSTS.A.proxy;

await scenario("drop with 0 pending dials", async () => {
	const b = A.controlOpens;
	A.dropNow();
	return { reconnectMs: await waitControl(A, b) };
});
await scenario("drop with 1 pending dial", async () => {
	A.fault.swallow = 1;
	const p = terminalOpen("A");
	await sleep(300);
	const b = A.controlOpens;
	A.dropNow();
	const r = await p;
	return { open: r, reconnectMs: await waitControl(A, b) };
});
await scenario("drop with 10 pending dials", async () => {
	A.fault.swallow = 10;
	const ps = Array.from({ length: 10 }, () => terminalOpen("A"));
	await sleep(500);
	const b = A.controlOpens;
	A.dropNow();
	const rs = await Promise.all(ps);
	return { opens: statuses(rs), maxMs: maxMs(rs), reconnectMs: await waitControl(A, b) };
});
await scenario("host reconnects while 5 dials are pending", async () => {
	A.fault.swallow = 5;
	const ps = Array.from({ length: 5 }, () => terminalOpen("A"));
	await sleep(500);
	const t = Date.now();
	await A.replaceNow();
	const oldClosedAt = Date.now() - t;
	const rs = await Promise.all(ps);
	return { opens: statuses(rs), maxMs: maxMs(rs), oldSocketClosedAfterMs: oldClosedAt };
});
await scenario("two hosts, only A drops (B has an open stream and is used during A's drop)", async () => {
	const sb = await stream("B");
	const e0 = await sb.echo("b0");
	A.fault.swallow = 2;
	const pa = [terminalOpen("A"), terminalOpen("A")];
	await sleep(300);
	const b = A.controlOpens;
	A.dropNow();
	const bOpen = await terminalOpen("B", 5000);
	const bHttp = await httpCall("B", 5000);
	const rs = await Promise.all(pa);
	const e1 = await sb.echo("b1");
	const r = { aOpens: statuses(rs), aMaxMs: maxMs(rs), bStreamEchoBefore: e0, bOpenDuringDrop: bOpen, bHttpDuringDrop: bHttp, bStreamEchoAfter: e1, bStreamClosed: sb.closed, aReconnectMs: await waitControl(A, b) };
	sb.ws.close();
	return r;
});
await scenario("caller disconnects before the host drops", async () => {
	A.fault.swallow = 1;
	const r1 = await terminalOpen("A", 80000, 300);
	await sleep(200);
	const b = A.controlOpens;
	A.dropNow();
	return { caller: r1, reconnectMs: await waitControl(A, b) };
});
for (const ms of [0, 2, 10, 30, 100]) {
	await scenario(`host gets the dial and drops ${ms} ms later (x5)`, async () => {
		const rs = [];
		for (let i = 0; i < 5; i++) {
			A.fault.passThenDropMs = ms;
			const b = A.controlOpens;
			rs.push(await terminalOpen("A"));
			await waitControl(A, b);
		}
		return { opens: statuses(rs), maxMs: maxMs(rs) };
	});
}
await scenario("control drops during an in-flight HTTP exchange", async () => {
	A.fault.holdHttpRequest = true;
	const p = httpCall("A");
	await sleep(500);
	const b = A.controlOpens;
	A.dropNow();
	const r = await p;
	return { http: r, reconnectMs: await waitControl(A, b) };
});
await scenario("control drops during an open terminal stream", async () => {
	const st = await stream("A");
	const e0 = await st.echo("s0");
	const b = A.controlOpens;
	A.dropNow();
	await sleep(500);
	const closed = st.closed;
	const rc = await waitControl(A, b);
	const st2 = await stream("A");
	const e2 = await st2.echo("s2");
	st2.ws.close();
	return { echoBefore: e0, streamClosedCode: closed, reconnectMs: rc, newStreamEcho: e2 };
});
await scenario("DO idle past eviction (reconnect held 15 s), then a new dial", async () => {
	A.holdUntil = Date.now() + 15000;
	const b = A.controlOpens;
	A.dropNow();
	await sleep(12000);
	const duringIdle = await terminalOpen("A", 5000);
	const rc = await waitControl(A, b, 30000);
	const open = await terminalOpen("A", 5000);
	const http = await httpCall("A", 5000);
	return { openWhileHostAway: duringIdle, reconnectMs: rc, openAfterReconnect: open, httpAfterReconnect: http };
});
await scenario("repeated drop/reconnect 100x (drop with a pending dial each time)", async () => {
	const rs = [];
	const reconnects = [];
	let healthFail = 0;
	for (let i = 0; i < 100; i++) {
		A.fault.swallow = 1;
		const p = terminalOpen("A");
		await sleep(100);
		const b = A.controlOpens;
		A.dropNow();
		rs.push(await p);
		reconnects.push(await waitControl(A, b));
		const o = await terminalOpen("A", 2000);
		if (o.status !== 101 || !wranglerAlive()) healthFail++;
		if (!wranglerAlive()) break;
	}
	return { iterations: rs.length, opens: statuses(rs), maxMs: maxMs(rs), reconnectsNull: reconnects.filter((x) => x === null).length, reconnectMaxMs: Math.max(...reconnects.filter(Boolean)), freshOpenFailures: healthFail };
});

for (const k of ["A", "B"]) await HOSTS[k].host.stop();
try { process.kill(-wrangler.pid, "SIGKILL"); } catch {}
api.close();
log("DONE");
process.exit(0);
