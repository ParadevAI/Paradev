import { describe, expect, it } from "bun:test";
import type { McpServerEntry } from "@superset/shared/mcp-servers";
import { SUPERSET_API_URL } from "@superset/shared/plugins";
import type { McpPickerPlugin } from "../../../../utils/mcpPickerPlugins";
import { mcpPickerRows } from "./mcpPickerRows";

function server(overrides: Partial<McpServerEntry>): McpServerEntry {
	return {
		name: "docs",
		agent: "claude",
		scope: "user",
		transport: "http",
		configPath: "/home/.claude.json",
		state: "available",
		...overrides,
	};
}

function linear(overrides: Partial<McpPickerPlugin>): McpPickerPlugin {
	return {
		name: "linear",
		displayName: "Linear",
		servers: ["linear"],
		urls: [],
		connector: "linear",
		connected: false,
		installed: false,
		...overrides,
	};
}

describe("mcpPickerRows", () => {
	it("puts usable servers first, then plugin setup, then unusable ones", () => {
		const rows = mcpPickerRows(
			[
				server({ name: "zed", state: "disabled" }),
				server({ name: "codex-only", agent: "codex", state: "other-agent" }),
				server({ name: "docs" }),
			],
			[linear({})],
			"",
		);

		expect(
			rows.map((row) => [
				row.name,
				row.kind,
				row.kind === "action" ? row.action : null,
			]),
		).toEqual([
			["docs", "available", null],
			["linear", "action", "connect"],
			["codex-only", "unavailable", null],
			["zed", "unavailable", null],
		]);
	});

	it("asks for an account only when a configured server belongs to an installed plugin", () => {
		const configured = [server({ name: "linear" })];

		expect(
			mcpPickerRows(configured, [linear({ installed: true })], "")[0]?.kind,
		).toBe("action");
		expect(mcpPickerRows(configured, [linear({})], "")[0]?.kind).toBe(
			"available",
		);
	});

	it("knows a server under any name by the plugin proxy URL it points at", () => {
		const rows = mcpPickerRows(
			[
				server({
					name: "my-linear",
					url: `${SUPERSET_API_URL}/mcp/plugins/superset/linear`,
				}),
			],
			[linear({ installed: true })],
			"",
		);

		expect(rows.map((row) => [row.name, row.kind])).toEqual([
			["my-linear", "action"],
		]);
	});

	it("offers Install, then says the server arrives with the next session", () => {
		const exa = linear({ name: "exa", servers: ["exa"], connector: null });

		expect(mcpPickerRows([], [exa], "")[0]).toMatchObject({
			kind: "action",
			action: "install",
		});
		expect(
			mcpPickerRows([], [{ ...exa, installed: true }], "")[0],
		).toMatchObject({ kind: "unavailable", reason: "next-session" });
	});

	it("searches names, plugin names, agents, and scopes", () => {
		const rows = mcpPickerRows(
			[server({ name: "docs" })],
			[linear({ servers: ["lin"], connected: true, installed: true })],
			"LINEAR",
		);
		expect(rows.map((row) => row.name)).toEqual(["lin"]);
	});
});
