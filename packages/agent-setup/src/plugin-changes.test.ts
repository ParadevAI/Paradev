import { describe, expect, test } from "bun:test";
import { serializePluginChange } from "./plugin-changes";

describe("serializePluginChange", () => {
	test("runs each change after the one before it settles, even a failed one", async () => {
		const order: string[] = [];
		let release = () => {};
		const first = serializePluginChange(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			order.push("first");
			throw new Error("boom");
		});
		const second = serializePluginChange(async () => {
			order.push("second");
			return 2;
		});

		await Promise.resolve();
		expect(order).toEqual([]);
		release();

		await expect(first).rejects.toThrow("boom");
		expect(await second).toBe(2);
		expect(order).toEqual(["first", "second"]);
	});
});
