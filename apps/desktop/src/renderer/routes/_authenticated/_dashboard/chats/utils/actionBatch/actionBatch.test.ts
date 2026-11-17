import { expect, test } from "bun:test";
import { createActionBatcher } from "./actionBatch";

test("deferred actions wait for the flush; any other action delivers everything queued, in order", () => {
	const delivered: string[][] = [];
	let scheduled: (() => void) | null = null;
	const batcher = createActionBatcher<string>({
		deliver: (batch) => delivered.push(batch),
		deferred: (action) => action.startsWith("token"),
		schedule: (flush) => {
			scheduled = flush;
			return () => {
				scheduled = null;
			};
		},
	});
	batcher.push("token-1");
	batcher.push("token-2");
	expect(delivered).toEqual([]);
	batcher.push("signal");
	expect(delivered).toEqual([["token-1", "token-2", "signal"]]);
	expect(scheduled).toBeNull();
	batcher.push("token-3");
	(scheduled as (() => void) | null)?.();
	expect(delivered.at(-1)).toEqual(["token-3"]);
});
