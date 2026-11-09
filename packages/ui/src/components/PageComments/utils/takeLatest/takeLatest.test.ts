import { describe, expect, test } from "bun:test";
import { takeLatest } from "./takeLatest";

describe("takeLatest", () => {
	test("marks a result stale when a later call started before it settled", async () => {
		const track = takeLatest();
		let settleFirst: (value: string) => void = () => {};
		const first = track(
			new Promise<string>((resolve) => {
				settleFirst = resolve;
			}),
		);
		const second = track(Promise.resolve("second"));
		settleFirst("first");

		expect(await second).toEqual({ value: "second", latest: true });
		expect(await first).toEqual({ value: "first", latest: false });
	});
});
