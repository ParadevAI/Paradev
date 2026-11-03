import { beforeEach, describe, expect, test } from "bun:test";
import {
	type ChatTab,
	createChatTab,
	describeChatTab,
	isChatPathname,
	organizationChatTabs,
	useChatTabsStore,
} from "./chatTabsStore";

const tab = (
	organizationId: string,
	pathname: string,
	href = pathname,
): ChatTab => {
	const route = describeChatTab(pathname);
	if (!route) throw new Error(`not a chat path: ${pathname}`);
	return createChatTab({ organizationId, route, href });
};

const threads = tab("org-a", "/channels/threads");
const general = tab("org-a", "/channels/c1");
const ticket = tab("org-a", "/devs/d1");

const store = () => useChatTabsStore.getState();
const ids = () => store().tabs.map((candidate) => candidate.id);

beforeEach(() => {
	useChatTabsStore.setState({ tabs: [], activeTabId: null });
});

describe("chat tabs", () => {
	test("each channel and Dev gets one tab per organization; Threads shares one", () => {
		expect(describeChatTab("/channels/threads")).toEqual({ kind: "threads" });
		expect(describeChatTab("/channels/c%201")).toEqual({
			kind: "channel",
			entityId: "c 1",
		});
		expect(describeChatTab("/devs/d1")).toEqual({
			kind: "dev",
			entityId: "d1",
		});
		expect(describeChatTab("/tasks")).toBeNull();
		expect(threads.id).toBe("org-a:threads");
		expect(tab("org-b", "/channels/threads").id).toBe("org-b:threads");
	});

	test("a malformed escape or an overlong id in the path is not a tab", () => {
		expect(describeChatTab("/channels/%E0%A4%A")).toBeNull();
		expect(describeChatTab("/devs/%")).toBeNull();
		expect(describeChatTab(`/channels/${"c".repeat(129)}`)).toBeNull();
		expect(describeChatTab(`/channels/${"c".repeat(128)}`)).not.toBeNull();
	});

	test("a very long href is stored as the tab's canonical path", () => {
		const long = `/channels/c%201/extra?message=${"x".repeat(600)}`;
		expect(tab("org-a", "/channels/c%201/extra", long).href).toBe(
			"/channels/c%201",
		);
		expect(
			tab(
				"org-a",
				"/channels/threads",
				`/channels/threads?q=${"x".repeat(600)}`,
			).href,
		).toBe("/channels/threads");
		expect(tab("org-a", "/channels/c1", "/channels/c1?thread=t1").href).toBe(
			"/channels/c1?thread=t1",
		);
	});

	test("the Chat section is the channel and Dev routes", () => {
		expect(isChatPathname("/channels")).toBe(true);
		expect(isChatPathname("/channels/threads")).toBe(true);
		expect(isChatPathname("/devs/d1")).toBe(true);
		expect(isChatPathname("/channelsx")).toBe(false);
		expect(isChatPathname("/new-workspace")).toBe(false);
	});

	test("opening appends and activates; reopening keeps the place and takes the new href", () => {
		store().open(threads);
		store().open(general);
		store().open({ ...threads, href: "/channels/threads?focus=1" });

		expect(ids()).toEqual([threads.id, general.id]);
		expect(store().tabs[0]?.href).toBe("/channels/threads?focus=1");
		expect(store().activeTabId).toBe(threads.id);
	});

	test("the strip holds 12 tabs: the oldest close first", () => {
		for (let index = 0; index < 14; index += 1) {
			store().open(tab("org-a", `/channels/c${index}`));
		}
		expect(store().tabs).toHaveLength(12);
		expect(store().tabs[0]?.entityId).toBe("c2");
	});

	test("closing the active tab hands over to the left neighbour, else the right, within its organization", () => {
		store().open(threads);
		store().open(tab("org-b", "/channels/other"));
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
		expect(ids()).toEqual(["org-b:channel:other"]);
	});

	test("pruning drops only the organization's tabs whose channel or Dev is gone", () => {
		const elsewhere = tab("org-b", "/channels/c9");
		store().open(elsewhere);
		store().open(threads);
		store().open(general);
		store().open(ticket);

		store().prune({
			organizationId: "org-a",
			kind: "channel",
			liveIds: new Set(),
		});
		expect(ids()).toEqual([elsewhere.id, threads.id, ticket.id]);
		expect(store().activeTabId).toBe(ticket.id);

		store().prune({ organizationId: "org-a", kind: "dev", liveIds: new Set() });
		expect(ids()).toEqual([elsewhere.id, threads.id]);
		expect(store().activeTabId).toBeNull();
		expect(organizationChatTabs(store().tabs, "org-b")).toEqual([elsewhere]);
	});

	test("pruning keeps the tab of the route on screen", () => {
		store().open(general);
		store().prune({
			organizationId: "org-a",
			kind: "channel",
			liveIds: new Set(),
			keepId: general.id,
		});
		expect(ids()).toEqual([general.id]);
	});
});
