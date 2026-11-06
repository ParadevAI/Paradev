import { beforeEach, describe, expect, test } from "bun:test";
import { panelTabKey, useChannelPanelStore } from "./channelPanelStore";

const thread = (id: string) => ({ kind: "thread" as const, id, label: id });
const panel = (id = "c") => useChannelPanelStore.getState().panels[id];

describe("channel panel store", () => {
	beforeEach(() => useChannelPanelStore.setState({ panels: {}, width: null }));

	test("one thread tab: opening another thread replaces it in place", () => {
		const { open } = useChannelPanelStore.getState();
		open("c", { kind: "task", id: "t", label: "t" });
		open("c", thread("a"));
		open("c", thread("b"));
		expect(panel()?.tabs.map((tab) => tab.id)).toEqual(["t", "b"]);
		expect(panel()?.activeKey).toBe(panelTabKey(thread("b")));
	});

	test("picking a thread from a new tab reuses the thread tab and drops the new tab", () => {
		const { open, openNewTab } = useChannelPanelStore.getState();
		open("c", thread("a"));
		openNewTab("c");
		const blank = panel()?.tabs[1];
		if (!blank) throw new Error("expected a new tab");
		open("c", thread("b"), { replaceKey: panelTabKey(blank) });
		expect(panel()?.tabs.map((tab) => tab.id)).toEqual(["b"]);
	});

	test("opening an empty panel shows a new tab", () => {
		useChannelPanelStore.getState().setOpen("c", true);
		expect(panel()?.tabs.map((tab) => tab.kind)).toEqual(["new-tab"]);
	});

	test("each new tab is its own tab, and picking from one replaces it in place", () => {
		const { open, openNewTab } = useChannelPanelStore.getState();
		const task = { kind: "task" as const, id: "t", label: "t" };
		open("c", task);
		openNewTab("c");
		openNewTab("c");
		const blank = panel()?.tabs[1];
		if (!blank) throw new Error("expected a new tab");
		expect(panel()?.tabs.map((tab) => tab.kind)).toEqual([
			"task",
			"new-tab",
			"new-tab",
		]);
		open("c", { ...task, id: "u" }, { replaceKey: panelTabKey(blank) });
		expect(panel()?.tabs.map((tab) => tab.kind)).toEqual([
			"task",
			"task",
			"new-tab",
		]);
	});

	test("hiding keeps tabs; closing the last tab forgets the channel", () => {
		const { open, setOpen, close } = useChannelPanelStore.getState();
		open("c", thread("a"));
		setOpen("c", false);
		expect(panel()?.tabs).toHaveLength(1);
		setOpen("c", true);
		close("c", panelTabKey(thread("a")));
		expect(useChannelPanelStore.getState().panels).toEqual({});
	});

	test("close others and close to the right keep the right tabs active", () => {
		const { open, closeOthers, closeToRight } = useChannelPanelStore.getState();
		for (const id of ["a", "b", "c", "d"])
			open("c", { kind: "task", id, label: id });
		const key = (id: string) => panelTabKey({ kind: "task", id });
		closeToRight("c", key("b"));
		expect(panel()?.tabs.map((tab) => tab.id)).toEqual(["a", "b"]);
		expect(panel()?.activeKey).toBe(key("b"));
		closeOthers("c", key("a"));
		expect(panel()?.tabs.map((tab) => tab.id)).toEqual(["a"]);
		expect(panel()?.activeKey).toBe(key("a"));
	});

	test("keeps tabs for at most 20 channels", () => {
		const { open } = useChannelPanelStore.getState();
		for (let i = 0; i < 25; i++) open(`c${i}`, thread("a"));
		expect(Object.keys(useChannelPanelStore.getState().panels)).toHaveLength(
			20,
		);
	});
});
