import { beforeEach, describe, expect, test } from "bun:test";
import {
	type ChatTab,
	describeChatTab,
	MAX_CHAT_TABS,
	useChatTabsStore,
} from "./chatTabsStore";

const threads: ChatTab = {
	id: "threads",
	kind: "threads",
	href: "/channels/threads",
};
const general: ChatTab = {
	id: "channel:c1",
	kind: "channel",
	entityId: "c1",
	href: "/channels/c1",
};
const ticket: ChatTab = {
	id: "dev:d1",
	kind: "dev",
	entityId: "d1",
	href: "/devs/d1",
};

const store = () => useChatTabsStore.getState();

beforeEach(() => {
	useChatTabsStore.setState({ tabs: [], activeTabId: null });
});

describe("chat tabs", () => {
	test("each channel and Dev gets one tab; Threads shares one", () => {
		expect(describeChatTab("/channels/threads")).toEqual({
			id: "threads",
			kind: "threads",
		});
		expect(describeChatTab("/channels/c%201")).toEqual({
			id: "channel:c 1",
			kind: "channel",
			entityId: "c 1",
		});
		expect(describeChatTab("/devs/d1")).toEqual({
			id: "dev:d1",
			kind: "dev",
			entityId: "d1",
		});
		expect(describeChatTab("/tasks")).toBeNull();
	});

	test("opening appends and activates; reopening keeps the place and takes the new href", () => {
		store().open(threads);
		store().open(general);
		store().open({ ...threads, href: "/channels/threads?focus=1" });

		expect(store().tabs.map((tab) => tab.id)).toEqual([
			"threads",
			"channel:c1",
		]);
		expect(store().tabs[0]?.href).toBe("/channels/threads?focus=1");
		expect(store().activeTabId).toBe("threads");
	});

	test("the strip is bounded: the oldest tabs close first", () => {
		for (let index = 0; index < MAX_CHAT_TABS + 2; index += 1) {
			store().open({
				...general,
				id: `channel:${index}`,
				entityId: `${index}`,
			});
		}
		expect(store().tabs).toHaveLength(MAX_CHAT_TABS);
		expect(store().tabs[0]?.id).toBe("channel:2");
	});

	test("closing the active tab hands over to the left neighbour, else the right", () => {
		store().open(threads);
		store().open(general);
		store().open(ticket);
		store().open(general);

		expect(store().close(general.id)).toEqual({
			wasActive: true,
			next: threads,
		});
		expect(store().close(threads.id)).toEqual({
			wasActive: true,
			next: ticket,
		});
		expect(store().close(ticket.id)).toEqual({ wasActive: true, next: null });
	});

	test("pruning drops tabs whose channel or Dev is gone", () => {
		store().open(threads);
		store().open(general);
		store().open(ticket);

		store().prune("channel", new Set());
		expect(store().tabs.map((tab) => tab.id)).toEqual(["threads", "dev:d1"]);
		expect(store().activeTabId).toBe("dev:d1");

		store().prune("dev", new Set());
		expect(store().tabs.map((tab) => tab.id)).toEqual(["threads"]);
		expect(store().activeTabId).toBeNull();
	});
});
