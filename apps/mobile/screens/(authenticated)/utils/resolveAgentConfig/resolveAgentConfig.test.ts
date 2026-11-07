import { describe, expect, test } from "bun:test";
import { resolveAgentConfig } from "./resolveAgentConfig";

const claudeA = { id: "row-a", presetId: "claude" };
const claudeB = { id: "row-b", presetId: "claude" };
const configs = [claudeA, claudeB];

describe("resolveAgentConfig", () => {
	test("a send made before the host's configs answer still launches the row picked on this host", async () => {
		const pending = {
			data: undefined,
			isPending: true,
			refetch: async () => ({ data: configs }),
		};
		expect(await resolveAgentConfig(pending, "claude", "row-b")).toBe(claudeB);
	});

	test("launches without waiting when no row was picked on this host", async () => {
		const pending = {
			data: undefined,
			isPending: true,
			refetch: () => new Promise<{ data?: typeof configs }>(() => {}),
		};
		expect(
			await resolveAgentConfig(pending, "claude", undefined),
		).toBeUndefined();
	});
});
