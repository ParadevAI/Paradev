import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { buildPluginServer, type PluginTarget } from "../../plugins/proxy";

const TOOL_CALL_TIMEOUT_MS = 55_000;

export async function callPluginTool(
	target: PluginTarget,
	tool: string,
	args: Record<string, unknown>,
	build: (target: PluginTarget) => Promise<Server> = buildPluginServer,
): Promise<unknown> {
	const server = await build(target);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "superset-page", version: "1.0.0" });
	try {
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
		return await client.callTool({ name: tool, arguments: args }, undefined, {
			signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT_MS),
		});
	} finally {
		await client.close().catch(() => {});
		await server.close().catch(() => {});
	}
}
