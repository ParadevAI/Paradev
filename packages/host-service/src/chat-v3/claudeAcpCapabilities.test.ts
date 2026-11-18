import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";
import { ACP_INITIALIZE_PARAMS } from "@superset/chat-runtime";

const adapterDist = dirname(
	Bun.resolveSync("@agentclientprotocol/claude-agent-acp", import.meta.dir),
);
const adapterSdk = (entry: string) =>
	Bun.resolveSync(`@agentclientprotocol/sdk/${entry}`, adapterDist);

async function capabilitiesSeenByV1Agent(params: unknown): Promise<unknown> {
	const v2 = await import(adapterSdk("experimental/v2"));
	const v1 = await import(adapterSdk("unstable"));
	let seen: unknown;
	const agent = v1
		.agent({ name: "probe" })
		.onRequest(
			v1.methods.agent.initialize,
			(ctx: { params: { clientCapabilities: unknown } }) => {
				seen = ctx.params.clientCapabilities;
				return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
			},
		);
	const toAgent = new TransformStream<Uint8Array, Uint8Array>();
	const toClient = new TransformStream<Uint8Array, Uint8Array>();
	v2.agentProtocolRouter()
		.withV1(agent)
		.connect(v2.ndJsonStream(toClient.writable, toAgent.readable));
	const request = { jsonrpc: "2.0", id: 1, method: "initialize", params };
	await toAgent.writable
		.getWriter()
		.write(new TextEncoder().encode(`${JSON.stringify(request)}\n`));
	await toClient.readable.getReader().read();
	return seen;
}

describe("claude-agent-acp held at v1 behind the SDK's protocol router", () => {
	it("sees compaction, notices, plans and boolean options from our v2 initialize", async () => {
		const seen = await capabilitiesSeenByV1Agent(ACP_INITIALIZE_PARAMS);
		const { clientSupportsCompactionUpdates } = await import(
			join(adapterDist, "context-compaction.js")
		);
		const { clientSupportsNotices } = await import(
			join(adapterDist, "session-notices.js")
		);

		expect(clientSupportsCompactionUpdates(seen)).toBe(true);
		expect(clientSupportsNotices(seen)).toBe(true);
		expect(seen).toMatchObject({
			plan: {},
			session: { configOptions: { boolean: {} } },
			elicitation: { form: {} },
		});
	});
});
