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

	test("a change waiting behind a stuck one still times out", async () => {
		let release = () => {};
		const stuck = runPluginChange(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
			20,
		);
		const waiting = runPluginChange(async () => {}, 20);

		const errors = await Promise.all(
			[stuck, waiting].map((change) =>
				change.then(
					() => null,
					(error: Error) => error.message,
				),
			),
		);
		release();

		expect(errors).toEqual([
			expect.stringContaining("did not finish"),
			expect.stringContaining("did not finish"),
		]);
	});
});
