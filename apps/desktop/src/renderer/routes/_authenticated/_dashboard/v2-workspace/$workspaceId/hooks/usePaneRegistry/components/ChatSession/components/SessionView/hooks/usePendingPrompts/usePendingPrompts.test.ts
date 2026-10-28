import { afterEach, expect, mock, test } from "bun:test";
import type { UserContent } from "@superset/chat/protocol";
import { cleanup, renderHook } from "@testing-library/react";
import { usePendingPrompts } from "./usePendingPrompts";

afterEach(cleanup);

test("messages queued during a later reconnect drain once liveness is checked", () => {
	const sendPrompt = mock((_content: UserContent[]) => {});
	const onSent = mock(() => {});
	const first: UserContent[][] = [[{ type: "text", text: "first" }]];
	const later: UserContent[][] = [[{ type: "text", text: "after wake" }]];
	const { rerender } = renderHook(
		(props: { held: boolean; ready: boolean; prompts: UserContent[][] }) =>
			usePendingPrompts({ ...props, onSent, sendPrompt }),
		{ initialProps: { held: false, ready: true, prompts: first } },
	);
	expect(sendPrompt.mock.calls).toEqual([[first[0]]]);
	rerender({ held: false, ready: true, prompts: [] });
	rerender({ held: true, ready: true, prompts: later });
	expect(sendPrompt).toHaveBeenCalledTimes(1);
	rerender({ held: false, ready: false, prompts: later });
	expect(sendPrompt).toHaveBeenCalledTimes(1);
	rerender({ held: false, ready: true, prompts: later });
	rerender({ held: false, ready: true, prompts: later });
	expect(sendPrompt.mock.calls).toEqual([[first[0]], [later[0]]]);
	expect(onSent).toHaveBeenCalledTimes(2);
});
