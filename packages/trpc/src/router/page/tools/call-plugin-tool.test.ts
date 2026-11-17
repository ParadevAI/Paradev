import { describe, expect, test } from "bun:test";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { PluginTarget } from "../../plugins/proxy";
import { callPluginTool } from "./call-plugin-tool";

const TARGET: PluginTarget = {
	plugin: "neon",
	version: "1.0.0",
	kind: "remote",
	url: "https://mcp.neon.tech/mcp",
	headers: {},
	connectionId: "conn-1",
};

describe("callPluginTool", () => {
	test("closes the server when connecting fails", async () => {
		let closed = false;
		const server = {
			connect: async () => {
				throw new Error("connect failed");
			},
			close: async () => {
				closed = true;
			},
		} as unknown as Server;
		await expect(
			callPluginTool(TARGET, "run_sql", {}, async () => server),
		).rejects.toThrow("connect failed");
		expect(closed).toBe(true);
	});
});
