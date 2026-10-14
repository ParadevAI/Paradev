import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
	emptySnapshot,
	outlineSnapshot,
	type SessionSnapshot,
	snapshotFromOutline,
	withItemBodies,
} from "@superset/chat/core";
import type {
	AgentMessage,
	Item,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import type { TranscriptRow } from "../../utils/transcriptRows";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useTranscriptFind } = await import("./useTranscriptFind");
type Options = import("./useTranscriptFind").UseTranscriptFindOptions;

afterEach(cleanup);

const ask: UserMessage = {
	id: "user-1",
	kind: "user_message",
	startedAtMs: 1,
	content: [{ type: "text", text: "Fix the login page" }],
};
const reply: AgentMessage = {
	id: "agent-1",
	kind: "agent_message",
	startedAtMs: 2,
	text: "The login form posts to /login",
};
const tool: ToolCall = {
	id: "tool-1",
	kind: "tool_call",
	startedAtMs: 3,
	title: "Edited login.ts",
	toolKind: "edit",
	toolName: "edit",
	status: "completed",
	content: [],
};

function itemRow(item: Item): TranscriptRow {
	return { kind: "item", key: item.id, groupStart: false, item };
}

function snapshotOf(items: readonly Item[]): SessionSnapshot {
	return {
		...emptySnapshot(),
		items: new Map(items.map((item) => [item.id, { item, turnId: "turn" }])),
	};
}

const settle = () =>
	act(() => new Promise((resolve) => setTimeout(resolve, 5)));

function renderFind(overrides: Partial<Options> = {}) {
	const scrollToMessage = mock<Options["scrollToMessage"]>(() => true);
	const onToggleEntry = mock<Options["onToggleEntry"]>(() => {});
	const onClose = mock<() => void>(() => {});
	const onRequestItemBodies = mock<Options["onRequestItemBodies"]>(() => {});
	const items = [ask, reply];
	const initial: Options = {
		rows: items.map(itemRow),
		snapshot: snapshotOf(items),
		viewport: null,
		isActive: true,
		isEntryCollapsed: (_key, defaultCollapsed) => defaultCollapsed,
		onToggleEntry,
		scrollToMessage,
		onClose,
		onRequestItemBodies,
		debounceMs: 0,
		...overrides,
	};
	const view = renderHook((options: Options) => useTranscriptFind(options), {
		initialProps: initial,
	});
	return {
		...view,
		initial,
		scrollToMessage,
		onToggleEntry,
		onClose,
		onRequestItemBodies,
	};
}

test("a settled query counts every hit, lands on the first and steps around", async () => {
	const { result, scrollToMessage } = renderFind();
	act(() => result.current.open());
	act(() => result.current.setQuery("Login"));
	await settle();

	expect(result.current.matchCount).toBe(3);
	expect(result.current.currentIndex).toBe(0);
	expect(result.current.currentRowKey).toBe("user-1");
	expect(scrollToMessage).toHaveBeenCalledTimes(1);
	expect(scrollToMessage.mock.calls[0]?.[0]).toBe("user-1");

	act(() => result.current.next());
	act(() => result.current.next());
	expect(result.current.currentIndex).toBe(2);
	expect(result.current.currentRowKey).toBe("agent-1");
	act(() => result.current.next());
	expect(result.current.currentIndex).toBe(0);
	act(() => result.current.previous());
	expect(result.current.currentIndex).toBe(2);
});

test("the current hit keeps its place when earlier hits stream in", async () => {
	const { result, rerender, initial, scrollToMessage } = renderFind();
	act(() => result.current.open());
	act(() => result.current.setQuery("login"));
	await settle();
	act(() => result.current.next());
	expect(result.current.currentIndex).toBe(1);

	const earlier: UserMessage = { ...ask, id: "user-0", startedAtMs: 0 };
	const items = [earlier, ask, reply];
	rerender({
		...initial,
		rows: items.map(itemRow),
		snapshot: snapshotOf(items),
	});
	await settle();

	expect(result.current.matchCount).toBe(4);
	expect(result.current.currentIndex).toBe(2);
	expect(result.current.currentRowKey).toBe("agent-1");
	expect(scrollToMessage).toHaveBeenCalledTimes(2);
});

test("the position clamps when hits disappear", async () => {
	const { result, rerender, initial } = renderFind();
	act(() => result.current.open());
	act(() => result.current.setQuery("login"));
	await settle();
	act(() => result.current.previous());
	expect(result.current.currentIndex).toBe(2);

	const shorter: AgentMessage = { ...reply, text: "The form posts to /login" };
	const items = [ask, shorter];
	rerender({
		...initial,
		rows: items.map(itemRow),
		snapshot: snapshotOf(items),
	});
	await settle();

	expect(result.current.matchCount).toBe(2);
	expect(result.current.currentIndex).toBe(1);
});

test("jumping into a collapsed run of tool calls opens it", async () => {
	const run: TranscriptRow = {
		kind: "tool_run",
		key: "tools:turn:tool-1",
		groupStart: false,
		items: [tool, { ...tool, id: "tool-2", title: "Ran tests" }],
		defaultCollapsed: true,
	};
	const { result, onToggleEntry, scrollToMessage } = renderFind({
		rows: [itemRow(ask), run],
		snapshot: snapshotOf([ask]),
	});
	act(() => result.current.open());
	act(() => result.current.setQuery("login.ts"));
	await settle();

	expect(result.current.currentRowKey).toBe("tools:turn:tool-1");
	expect(onToggleEntry).toHaveBeenCalledWith("tools:turn:tool-1", false);
	expect(scrollToMessage.mock.calls[0]?.[0]).toBe("tool-1");
});

test("closing keeps the query, drops the position and hands focus back", async () => {
	const { result, onClose } = renderFind();
	act(() => result.current.open());
	act(() => result.current.setQuery("login"));
	await settle();

	act(() => result.current.close());
	expect(result.current.isOpen).toBe(false);
	expect(result.current.query).toBe("login");
	expect(result.current.currentIndex).toBe(-1);
	expect(onClose).toHaveBeenCalledTimes(1);
});

test("the bar closes when the pane loses focus, without taking focus back", async () => {
	const { result, rerender, initial, onClose } = renderFind();
	act(() => result.current.open());
	expect(result.current.isOpen).toBe(true);

	rerender({ ...initial, isActive: false });
	expect(result.current.isOpen).toBe(false);
	expect(onClose).not.toHaveBeenCalled();
});

test("paints the current hit, and again after a jump lands on the same hit", async () => {
	class FakeHighlight {
		ranges: Range[];
		constructor(...ranges: Range[]) {
			this.ranges = ranges;
		}
		get size() {
			return this.ranges.length;
		}
	}
	const registry = new Map<string, FakeHighlight>();
	const previous = {
		CSS: Object.getOwnPropertyDescriptor(globalThis, "CSS"),
		Highlight: Object.getOwnPropertyDescriptor(globalThis, "Highlight"),
	};
	const define = (name: string, value: unknown) =>
		Object.defineProperty(globalThis, name, {
			value,
			configurable: true,
			writable: true,
		});
	const restore = (name: string, descriptor: PropertyDescriptor | undefined) =>
		descriptor
			? Object.defineProperty(globalThis, name, descriptor)
			: Reflect.deleteProperty(globalThis, name);
	define("CSS", { highlights: registry, escape: (value: string) => value });
	define("Highlight", FakeHighlight);
	const viewport = document.createElement("div");
	viewport.innerHTML = `<div data-message-id="agent-1"><p data-find-item="agent-1">The login form posts to /login</p></div>`;
	document.body.appendChild(viewport);
	try {
		const { result } = renderFind({
			viewport,
			rows: [itemRow(reply)],
			snapshot: snapshotOf([reply]),
		});
		act(() => result.current.open());
		act(() => result.current.setQuery("login"));
		await settle();
		expect(registry.get("chat-search-matches")?.size).toBe(2);
		expect(registry.get("chat-search-active")?.size).toBe(1);

		act(() => result.current.next());
		act(() => result.current.next());
		expect(result.current.currentIndex).toBe(0);
		expect(registry.get("chat-search-active")?.size).toBe(1);

		act(() => result.current.close());
		expect(registry.has("chat-search-matches")).toBe(false);
	} finally {
		viewport.remove();
		restore("CSS", previous.CSS);
		restore("Highlight", previous.Highlight);
	}
});

test("search loads omitted tool bodies even when the outline has all turns", async () => {
	const longTool = { ...tool, title: `${"command ".repeat(30)}unique-file.ts` };
	const full = snapshotOf([longTool]);
	const outline = snapshotFromOutline(outlineSnapshot(full));
	const outlined = outline.items.get(longTool.id);
	if (!outlined) throw new Error("Missing outlined tool");
	const { result, rerender, initial, onRequestItemBodies } = renderFind({
		rows: [itemRow(outlined.item)],
		snapshot: outline,
	});
	expect(onRequestItemBodies).not.toHaveBeenCalled();
	act(() => {
		result.current.open();
		result.current.setQuery("unique-file.ts");
	});
	await settle();
	expect(result.current.loading).toBe(true);
	expect(result.current.matchCount).toBe(0);
	expect(onRequestItemBodies).toHaveBeenCalledWith([longTool.id]);

	rerender({
		...initial,
		rows: [itemRow(longTool)],
		snapshot: withItemBodies(outline, [...full.items.values()]),
	});
	await settle();
	expect(result.current.loading).toBe(false);
	expect(result.current.matchCount).toBe(1);
	expect(result.current.currentRowKey).toBe(longTool.id);
});

test("continuous streaming refreshes matches without waiting for a pause", () => {
	let now = 0;
	let nextId = 0;
	const timers = new Map<number, { at: number; run: () => void }>();
	const setClockTimeout = ((run: () => void, delay = 0) => {
		const id = ++nextId;
		timers.set(id, { at: now + delay, run });
		return id as unknown as ReturnType<typeof setTimeout>;
	}) as typeof setTimeout;
	const schedule = spyOn(globalThis, "setTimeout").mockImplementation(
		setClockTimeout,
	);
	const cancel = spyOn(globalThis, "clearTimeout").mockImplementation((id) => {
		timers.delete(Number(id));
	});
	const advance = (ms: number) =>
		act(() => {
			now += ms;
			for (const [id, timer] of [...timers]) {
				if (timer.at > now) continue;
				timers.delete(id);
				timer.run();
			}
		});
	try {
		const first = { ...reply, text: "login" };
		const { result, rerender, initial, unmount } = renderFind({
			rows: [itemRow(first)],
			snapshot: snapshotOf([first]),
			debounceMs: 150,
		});
		act(() => {
			result.current.open();
			result.current.setQuery("login");
		});
		advance(150);
		expect(result.current.matchCount).toBe(1);
		for (let i = 0; i < 4; i += 1) {
			const streamed = { ...reply, text: `login login ${i}` };
			rerender({
				...initial,
				rows: [itemRow(streamed)],
				snapshot: snapshotOf([streamed]),
			});
			advance(100);
		}
		expect(result.current.matchCount).toBe(2);
		expect(result.current.currentIndex).toBe(0);
		unmount();
	} finally {
		cleanup();
		schedule.mockRestore();
		cancel.mockRestore();
	}
});
