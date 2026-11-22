import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../../test/stub";

let rows: Array<{ config: string | null }> = [];

stub(db, {
	select: () => ({
		from: () => ({
			innerJoin: () => ({
				where: () => ({ limit: () => Promise.resolve(rows) }),
			}),
		}),
	}),
});

const { sandboxAllowsPlugin } = await import("./sandbox-allowlist");
const linear = {
	workspaceId: "ws-1",
	marketplace: "superset",
	plugin: "linear",
};

describe("sandboxAllowsPlugin", () => {
	test("a box may call only the plugins its environment's [mcp] allow lists", async () => {
		rows = [{ config: '[mcp]\nallow = ["linear@superset"]\n' }];
		expect(await sandboxAllowsPlugin(linear)).toBe(true);
		expect(await sandboxAllowsPlugin({ ...linear, plugin: "github" })).toBe(
			false,
		);
		expect(await sandboxAllowsPlugin({ ...linear, marketplace: "acme" })).toBe(
			false,
		);
	});

	test("no config allows every plugin; a broken config or an unknown workspace allows none", async () => {
		rows = [{ config: null }];
		expect(await sandboxAllowsPlugin(linear)).toBe(true);
		rows = [{ config: "[mcp\n" }];
		expect(await sandboxAllowsPlugin(linear)).toBe(false);
		rows = [];
		expect(await sandboxAllowsPlugin(linear)).toBe(false);
	});
});
