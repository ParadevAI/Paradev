import { afterEach, expect, mock, test } from "bun:test";
import type { StoredItem } from "@superset/chat/core";
import { cleanup, renderHook } from "@testing-library/react";
import { useLaunchPromptDelivered } from "./useLaunchPromptDelivered";

afterEach(cleanup);

test("reports delivery once the transcript has a user message, not while it loads", () => {
	const onDelivered = mock(() => {});
	const { rerender } = renderHook(
		(items: ReadonlyMap<string, StoredItem>) =>
			useLaunchPromptDelivered(items, onDelivered),
		{ initialProps: new Map<string, StoredItem>() },
	);
	expect(onDelivered).not.toHaveBeenCalled();
	rerender(
		new Map<string, StoredItem>([
			[
				"m1",
				{
					turnId: "t1",
					item: {
						id: "m1",
						kind: "user_message",
						startedAtMs: 1,
						content: [{ type: "text", text: "fix the login bug" }],
					},
				},
			],
		]),
	);
	expect(onDelivered).toHaveBeenCalledTimes(1);
});
