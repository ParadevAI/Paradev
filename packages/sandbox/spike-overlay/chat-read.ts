import { signSandboxGateTicket } from "@superset/shared/sandbox/gate";
const [ws, target, sid] = process.argv.slice(2);
const secret = (await Bun.file("/tmp/ovl/gate-secret").text()).trim();
const ticket = await signSandboxGateTicket(secret, { workspaceId: ws, userId: "00000000-0000-4000-8000-0000000000aa", port: 4879, target, exp: Math.floor(Date.now() / 1000) + 3600 });
for (let i = 0; i < 40; i++) {
	const r = await fetch(`http://127.0.0.1:8790/trpc/sessions.read?input=${encodeURIComponent(JSON.stringify({ json: { workspaceId: ws, sessionId: sid, limit: 200 } }))}`, { headers: { authorization: `Bearer ${ticket}` } });
	const env = ((await r.json()) as any)?.result?.data?.json?.envelopes ?? [];
	const kinds = env.map((e: any) => e.event?.type);
	const assistant = JSON.stringify(env.filter((e: any) => /assistant|agent_message|message/.test(JSON.stringify(e.event?.type ?? "")) )).match(/OVERLAY-CHAT-[A-Z]+/g);
	const usage = JSON.stringify(env).match(/"(input_tokens|output_tokens|cache_read_input_tokens|cache_creation_input_tokens|total_cost_usd|costUsd|cost)":\s?[\d.]+/g);
	const items = env.filter((e: any) => e.event?.type === "item").map((e: any) => { const it = e.event.item ?? e.event; return `${it.role ?? it.kind ?? it.type}: ${JSON.stringify(it.content ?? it.text ?? it.parts ?? "").slice(0, 120)}`; });
	if (i === 39 || (assistant && JSON.stringify(env).includes('"done"'))) { console.log(items.join("\n")); console.log(`events: ${[...new Set(kinds)].join(",")}\nassistant markers: ${assistant}\nusage fields: ${usage?.join(" ")}`); break; }
	await Bun.sleep(1000);
}
