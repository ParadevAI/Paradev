// Spike client: what the desktop renderer does through the gate. gate-client.ts <mode> <workspaceId> <sandboxUrl>
import { sandboxHostSecret, signSandboxGateTicket } from "@superset/shared/sandbox/gate";
const [mode, ws, target] = process.argv.slice(2);
const secret = (await Bun.file("/tmp/ovl/gate-secret").text()).trim();
const GATE = "http://127.0.0.1:8790";
if (mode === "secret") { console.log(await sandboxHostSecret(secret, ws)); process.exit(0); }
const ticket = await signSandboxGateTicket(secret, { workspaceId: ws, userId: "00000000-0000-4000-8000-0000000000aa", port: 4879, target, exp: Math.floor(Date.now() / 1000) + 3600 });
const auth = { authorization: `Bearer ${ticket}` };
const st = async (p: string, h: Record<string, string> = {}) => (await fetch(`${GATE}${p}`, { headers: h })).status;
console.log(`health with ticket: ${await st("/trpc/health.check", auth)}; without: ${await st("/trpc/health.check")}; forged: ${await st("/trpc/health.check", { authorization: `Bearer ${ticket.slice(0, -4)}AAAA` })}`);
// A terminal, the renderer's way: attach-or-create over the WebSocket, type, read the output.
const tid = crypto.randomUUID();
const out: string[] = [];
const t0 = performance.now();
const sock = new WebSocket(`${GATE.replace("http", "ws")}/terminal/${tid}?workspaceId=${ws}&create=1&token=${encodeURIComponent(ticket)}`);
const done = new Promise<string>((resolve) => {
	sock.onmessage = (e) => {
		const raw = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
		let m: { type?: string; data?: string } | null = null;
		try { m = JSON.parse(raw); } catch {}
		if (m?.type === "attached") sock.send(JSON.stringify({ type: "input", data: "echo GATE-OK root=$(findmnt -no FSTYPE /) cwd=$(pwd -P) ns=$(readlink /proc/self/ns/mnt)\r" }));
		out.push(m ? (typeof m.data === "string" ? m.data : "") : raw);
		const text = out.join("");
		const hit = text.match(/GATE-OK root=(\w+) cwd=(\S+) ns=(\S+)/g)?.find((x) => !x.includes("$("));
		if (hit) resolve(hit);
	};
	sock.onerror = () => resolve("socket error");
	setTimeout(() => resolve(`timeout; got types ${out.length}`), 30000);
});
const line = await done;
console.log(`terminal over the gate (${Math.round(performance.now() - t0)} ms): ${line}`);
sock.close();
const list = await fetch(`${GATE}/terminal/sessions?workspaceId=${ws}`, { headers: auth });
console.log(`sessions listed through the gate: ${list.status} ${(await list.text()).slice(0, 160)}`);
