import { expect, test } from "bun:test";
import type { StoredItem } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { heldPromptQueue } from "./heldPromptQueue";

const launched: UserContent[] = [{ type: "text", text: "fix the login bug" }];
const typed: UserContent[] = [{ type: "text", text: "and add a test" }];

function texts(queue: ReturnType<typeof heldPromptQueue>) {
	return queue?.prompts.map((prompt) => prompt.content[0]);
}

test("a launched prompt shows ahead of the queue until the transcript has it", () => {
	const empty = new Map<string, StoredItem>();
	expect(texts(heldPromptQueue([typed], { launched, items: empty }))).toEqual([
		launched[0],
		typed[0],
	]);
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
		texts(heldPromptQueue([typed], { launched, items: delivered })),
	).toEqual([typed[0]]);
	expect(heldPromptQueue([], { launched, items: delivered })).toBeUndefined();
});
