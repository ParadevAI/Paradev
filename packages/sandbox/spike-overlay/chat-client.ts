// Spike client: a chat session through the gate. chat-client.ts create|again <workspaceId> <sandboxUrl> [sessionId]
import { signSandboxGateTicket } from "@superset/shared/sandbox/gate";
const [mode, ws, target, sid] = process.argv.slice(2);
const secret = (await Bun.file("/tmp/ovl/gate-secret").text()).trim();
const G = "http://127.0.0.1:8790";
const ticket = await signSandboxGateTicket(secret, { workspaceId: ws, userId: "00000000-0000-4000-8000-0000000000aa", port: 4879, target, exp: Math.floor(Date.now() / 1000) + 3600 });
const H = { authorization: `Bearer ${ticket}`, "content-type": "application/json" };
const mutate = async (p: string, json: unknown) => { const r = await fetch(`${G}/trpc/${p}`, { method: "POST", headers: H, body: JSON.stringify({ json }) }); return [r.status, await r.json().catch(() => ({}))] as const; };
const query = async (p: string, json: unknown) => { const r = await fetch(`${G}/trpc/${p}?input=${encodeURIComponent(JSON.stringify({ json }))}`, { headers: H }); return [r.status, await r.json().catch(() => ({}))] as const; };
const [envStatus] = await mutate("sandbox.setEnvironment", { variables: { ANTHROPIC_API_KEY: "proxy-injected-see-network-routing" } });
console.log(`managed env pushed through the gate: ${envStatus}`);
let sessionId = sid;
const marker = mode === "create" ? "OVERLAY-CHAT-OK" : "OVERLAY-CHAT-AGAIN";
const t0 = performance.now();
if (mode === "create") {
	const [s, body] = await mutate("sessions.create", { workspaceId: ws, agent: "claude", model: "haiku", prompt: `Reply with exactly ${marker} and nothing else. Do not use tools.` });
	sessionId = (body as any)?.result?.data?.json?.sessionId;
	console.log(`sessions.create through the gate: ${s} session=${sessionId ?? JSON.stringify(body).slice(0, 300)}`);
} else {
	const [ls, list] = await query("sessions.list", { workspaceId: ws, limit: 10 });
	const ids = ((list as any)?.result?.data?.json ?? []).map((x: any) => x.sessionId ?? x.id);
	console.log(`sessions.list after the wake: ${ls}, contains the session: ${ids.includes(sessionId)}`);
	const [rs, rb] = await mutate("sessions.resume", { workspaceId: ws, sessionId });
	console.log(`sessions.resume through the gate: ${rs} ${JSON.stringify(rb).slice(0, 300)}`);
	const resumed = (rb as any)?.result?.data?.json?.sessionId;
	if (resumed && resumed !== sessionId) { console.log(`resume gave a new session ${resumed}`); sessionId = resumed; }
	for (let i = 0; i < 30; i++) {
		const [, g] = await query("sessions.get", { workspaceId: ws, sessionId });
		const st = JSON.stringify(g).match(/"status":"(\w+)"/)?.[1];
		if (i % 5 === 0 || st !== "stopped") console.log(`status after resume: ${st}`);
		if (st && st !== "stopped" && st !== "starting") break;
		await Bun.sleep(1000);
	}
	const [s, body] = await mutate("sessions.send", { workspaceId: ws, sessionId, prompt: `Reply with exactly ${marker} and nothing else. Do not use tools.` });
	console.log(`sessions.send through the gate: ${s} ${s === 200 ? "" : JSON.stringify(body).slice(0, 300)}`);
}
for (let i = 0; i < 120; i++) {
	const [s, body] = await query("sessions.read", { workspaceId: ws, sessionId, limit: 50 });
	const text = JSON.stringify(body);
	if ((text.match(new RegExp(marker, "g")) ?? []).length >= 2) { console.log(`reply seen in ${Math.round(performance.now() - t0)} ms (read ${s})`); break; }
	if (i === 119) console.log(`no reply; last read ${s}: ${text.slice(0, 600)}`);
	await Bun.sleep(1000);
}
console.log(`SESSION ${sessionId}`);
