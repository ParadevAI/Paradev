import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";

test("every tool lists a title and explicit read, destructive and open-world hints", async () => {
	const server = createMcpServer();
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "test", version: "1.0.0" });
	await client.connect(clientTransport);
	try {
		const { tools } = await client.listTools();
		expect(tools.length).toBeGreaterThan(40);
		const missing = tools.filter(
			(tool) =>
				!tool.title?.trim() ||
				typeof tool.annotations?.readOnlyHint !== "boolean" ||
				typeof tool.annotations?.destructiveHint !== "boolean" ||
				typeof tool.annotations?.openWorldHint !== "boolean",
		);
		expect(missing.map((tool) => tool.name)).toEqual([]);
	} finally {
		await client.close();
		await server.close();
	}
});
