import { describe, expect, it } from "bun:test";
import { createClosedChatBatches } from "./closedChatBatches";

function setup() {
	const log: string[] = [];
	const shown: { id: string; chats: string[] }[] = [];
	let next = 0;
	const batches = createClosedChatBatches<string>(
		{
			show: (batch) => shown.push({ id: batch.id, chats: [...batch.chats] }),
			hide: (id) => log.push(`hide ${id}`),
			restore: (chat) => log.push(`restore ${chat}`),
			stop: (chat) => log.push(`stop ${chat}`),
		},
		() => `t${++next}`,
	);
	return { batches, log, shown };
}

describe("createClosedChatBatches", () => {
	it("stops every chat in the batch when its toast expires", () => {
		const { batches, log } = setup();
		batches.add("a");
		batches.expire("t1");
		expect(log).toEqual(["stop a"]);
	});

	it("restores without stopping on undo, and ignores the dismissal that follows", () => {
		const { batches, log } = setup();
		batches.add("a");
		batches.undo("t1");
		batches.expire("t1");
		expect(log).toEqual(["hide t1", "restore a"]);
	});

	it("merges a close into the pending batch and restores it newest first", () => {
		const { batches, log, shown } = setup();
		batches.add("a");
		batches.add("b");
		batches.expire("t1");
		expect(shown).toEqual([
			{ id: "t1", chats: ["a"] },
			{ id: "t2", chats: ["a", "b"] },
		]);
		expect(log).toEqual(["hide t1"]);
		batches.undo("t2");
		expect(log).toEqual(["hide t1", "hide t2", "restore b", "restore a"]);
	});

	it("stops the pending batch on flush and does nothing when none is pending", () => {
		const { batches, log } = setup();
		batches.flush();
		batches.add("a");
		batches.flush();
		batches.undo("t1");
		expect(log).toEqual(["hide t1", "stop a"]);
	});
});
