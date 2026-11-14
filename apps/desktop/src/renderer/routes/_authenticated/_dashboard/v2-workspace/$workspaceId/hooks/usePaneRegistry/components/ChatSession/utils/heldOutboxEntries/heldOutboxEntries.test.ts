import { expect, test } from "bun:test";
import type { StoredItem } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { heldOutboxEntries } from "./heldOutboxEntries";

const launched: UserContent[] = [{ type: "text", text: "fix the login bug" }];
const typed: UserContent[] = [{ type: "text", text: "and add a test" }];

function texts(entries: ReturnType<typeof heldOutboxEntries>) {
	return entries.map((entry) => entry.content[0]);
}

test("held prompts render as queued outbox rows, the launch prompt first until the transcript has it", () => {
	const empty = new Map<string, StoredItem>();
	const held = heldOutboxEntries([typed], { launched, items: empty });
	expect(texts(held)).toEqual([launched[0], typed[0]]);
	expect(held.every((entry) => entry.state === "queued")).toBe(true);
	const delivered = new Map<string, StoredItem>([
		[
			"m1",
			{
				turnId: "t1",
				item: {
					id: "m1",
					kind: "user_message",
					startedAtMs: 1,
					content: launched,
				},
			},
		],
	]);
	expect(
		texts(heldOutboxEntries([typed], { launched, items: delivered })),
	).toEqual([typed[0]]);
	expect(heldOutboxEntries([], { launched, items: delivered })).toEqual([]);
});
