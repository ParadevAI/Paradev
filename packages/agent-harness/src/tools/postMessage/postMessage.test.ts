import { describe, expect, test } from "bun:test";
import { createPostMessageTool, type RoomPoster } from "./postMessage";

describe("post_message", () => {
	test("posts with the tool call id as the idempotency key", async () => {
		const posts: Parameters<RoomPoster["post"]>[0][] = [];
		const tool = createPostMessageTool({
			post: async (input) => {
				posts.push(input);
				return { messageId: "m1" };
			},
		});
		const result = await tool.execute("call_7", {
			body: "Done.",
			thread_root_id: "r1",
		});
		expect(posts).toEqual([
			{ body: "Done.", threadRootId: "r1", idempotencyKey: "call_7" },
		]);
		expect(result.details).toEqual({ messageId: "m1" });
	});
});
