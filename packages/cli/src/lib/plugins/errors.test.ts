import { describe, expect, test } from "bun:test";
import { PluginError } from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";
import { withPluginHints } from "./errors";

describe("withPluginHints", () => {
	test("names the command to run next, after the reason", async () => {
		const error = await withPluginHints(() =>
			Promise.reject(
				new PluginError('No plugin "autumn" in any installed marketplace.', {
					code: "not-found",
					plugin: "autumn",
					suggestion:
						"Some marketplaces could not be updated: superset: offline",
				}),
			),
		).catch((caught) => caught);

		expect(error).toBeInstanceOf(CLIError);
		expect(error.suggestion).toBe(
			"Some marketplaces could not be updated: superset: offline Run: superset plugins list --available",
		);
	});

	test("passes other errors through", async () => {
		const original = new Error("offline");
		await expect(withPluginHints(() => Promise.reject(original))).rejects.toBe(
			original,
		);
	});
});
