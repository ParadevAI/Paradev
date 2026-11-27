import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../server";
import { MCP_APP_MIME_TYPE, WORKSPACE_BOARD_URI } from "./workspace-board";

test("serves the workspace board and links workspaces_list to it", async () => {
	const server = createMcpServer();
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "test", version: "1.0.0" });
	await client.connect(clientTransport);
	try {
		const { resources } = await client.listResources();
		expect(resources).toContainEqual(
			expect.objectContaining({
				uri: WORKSPACE_BOARD_URI,
				mimeType: MCP_APP_MIME_TYPE,
			}),
		);

		const { contents } = await client.readResource({
			uri: WORKSPACE_BOARD_URI,
		});
		expect(contents).toHaveLength(1);
		expect(contents[0]).toMatchObject({
			mimeType: "text/html;profile=mcp-app",
			text: expect.stringContaining("ui/notifications/tool-result"),
		});

		const { tools } = await client.listTools();
		const list = tools.find((tool) => tool.name === "workspaces_list");
		expect(list?._meta).toEqual({
			ui: { resourceUri: "ui://paradev/workspace-board/v1" },
		});
	} finally {
		await client.close();
		await server.close();
	}
});
