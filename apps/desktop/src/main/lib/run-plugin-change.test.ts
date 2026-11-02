import { describe, expect, test } from "bun:test";
import { runPluginChange } from "./run-plugin-change";

describe("runPluginChange", () => {
	test("rejects with the plugin change error, so the caller does not report success", async () => {
		await expect(
			runPluginChange(() => Promise.reject(new Error('No plugin "linear"'))),
		).rejects.toThrow('No plugin "linear"');
	});

	test("names the timeout, and holds the next change until the slow one ends", async () => {
		const order: string[] = [];
		let finish = () => {};
		const slow = runPluginChange(
			() =>
				new Promise<void>((resolve) => {
					finish = () => {
						order.push("slow");
						resolve();
					};
				}),
			20,
		);
		const next = runPluginChange(async () => {
			order.push("next");
		});

		await expect(slow).rejects.toThrow("did not finish in 0 seconds");
		expect(order).toEqual([]);

		finish();
		await next;
		expect(order).toEqual(["slow", "next"]);
	});
});
