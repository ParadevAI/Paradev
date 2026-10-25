import { beforeEach, describe, expect, test } from "bun:test";
import { panelTabKey, useChannelPanelStore } from "./channelPanelStore";

const thread = (id: string) => ({ kind: "thread" as const, id, label: id });

describe("channel panel store", () => {
	beforeEach(() => useChannelPanelStore.setState({ panels: {} }));

	test("reopening a tab activates it instead of adding a copy", () => {
		const { open } = useChannelPanelStore.getState();
		open("c", thread("a"));
		open("c", thread("b"));
		open("c", thread("a"));
		const panel = useChannelPanelStore.getState().panels.c;
		expect(panel?.tabs.map((tab) => tab.id)).toEqual(["a", "b"]);
		expect(panel?.activeKey).toBe(panelTabKey(thread("a")));
	});

	test("closing the last tab removes the channel entry", () => {
		const { open, close } = useChannelPanelStore.getState();
		open("c", thread("a"));
		close("c", panelTabKey(thread("a")));
		expect(useChannelPanelStore.getState().panels).toEqual({});
	});

	test("keeps tabs for at most 20 channels", () => {
		const { open } = useChannelPanelStore.getState();
		for (let i = 0; i < 25; i++) open(`c${i}`, thread("a"));
		expect(Object.keys(useChannelPanelStore.getState().panels)).toHaveLength(
			20,
		);
	});
});
