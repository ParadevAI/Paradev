import { afterEach, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PaneViewerData } from "../../types";
import { useLastChatTerminalId } from "./useLastChatTerminalId";

afterEach(cleanup);

test("remembers the selected chat when a diff takes focus and clears it for an unrelated pane", () => {
	const store = createWorkspaceStore<PaneViewerData>();
	const { result } = renderHook(() => useLastChatTerminalId(store));
	expect(result.current).toBeNull();

	act(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: { terminalId: "chat-b", sessionId: "session-b" },
				},
			],
		});
	});
	expect(result.current).toBe("chat-b");

	act(() => {
		store.getState().addTab({
			panes: [{ kind: "diff", data: { path: "", collapsedFiles: [] } }],
		});
	});
	expect(result.current).toBe("chat-b");

	act(() => {
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "shell" } }],
		});
	});
	expect(result.current).toBeNull();
});

test("remembers chats independently when the diff is in the right area", () => {
	const main = createWorkspaceStore<PaneViewerData>();
	const right = createWorkspaceStore<PaneViewerData>();
	const { result } = renderHook(() => ({
		main: useLastChatTerminalId(main),
		right: useLastChatTerminalId(right),
	}));
	act(() => {
		main.getState().addTab({
			panes: [
				{ kind: "chat-v3", data: { terminalId: "claude", sessionId: "a" } },
			],
		});
		right.getState().addTab({
			panes: [
				{ kind: "chat-v3", data: { terminalId: "codex", sessionId: "b" } },
			],
		});
		right.getState().addTab({
			panes: [{ kind: "diff", data: { path: "", collapsedFiles: [] } }],
		});
	});
	expect(result.current).toEqual({ main: "claude", right: "codex" });
});

test("a replacement store with an active diff cannot borrow the previous chat", () => {
	const original = createWorkspaceStore<PaneViewerData>();
	const replacement = createWorkspaceStore<PaneViewerData>();
	original.getState().addTab({
		panes: [{ kind: "chat-v3", data: { terminalId: "old", sessionId: "a" } }],
	});
	replacement.getState().addTab({
		panes: [{ kind: "diff", data: { path: "", collapsedFiles: [] } }],
	});

	const rendered: (string | null)[] = [];
	const { result, rerender } = renderHook<
		string | null,
		typeof original | undefined
	>(
		(store) => {
			const id = useLastChatTerminalId(store);
			rendered.push(id);
			return id;
		},
		{ initialProps: original },
	);
	expect(result.current).toBe("old");

	rendered.length = 0;
	rerender(replacement);
	expect(rendered[0]).toBeNull();
	expect(result.current).toBeNull();

	act(() => {
		replacement.getState().addTab({
			panes: [{ kind: "chat-v3", data: { terminalId: "new", sessionId: "b" } }],
		});
	});
	expect(result.current).toBe("new");

	rendered.length = 0;
	rerender(undefined);
	expect(rendered[0]).toBeNull();
	expect(result.current).toBeNull();
});
