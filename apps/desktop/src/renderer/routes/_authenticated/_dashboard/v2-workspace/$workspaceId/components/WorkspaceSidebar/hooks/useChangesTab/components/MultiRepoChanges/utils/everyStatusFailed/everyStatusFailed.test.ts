import { expect, test } from "bun:test";
import { everyStatusFailed } from "./everyStatusFailed";

const failed = { data: undefined, isLoading: false };

test("is true only when every checkout's status failed", () => {
	expect(everyStatusFailed([failed, failed])).toBe(true);
	expect(everyStatusFailed([failed, { data: {}, isLoading: false }])).toBe(
		false,
	);
	expect(
		everyStatusFailed([failed, { data: undefined, isLoading: true }]),
	).toBe(false);
	expect(everyStatusFailed([])).toBe(false);
});
