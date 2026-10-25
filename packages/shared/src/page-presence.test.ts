import { describe, expect, test } from "bun:test";
import {
	type PagePresenceViewer,
	pagePresenceUrl,
	presencePeople,
	presenceViewersFrom,
} from "./page-presence";

const viewer = (
	key: string,
	guest: boolean,
	guestNumber: number | null = null,
): PagePresenceViewer => ({
	id: `${key}-socket`,
	key,
	name: guest ? "" : key,
	image: null,
	guest,
	guestNumber,
	color: 0,
});

const ana = {
	userId: "ana",
	name: "Ana",
	image: null,
	lastSeenAt: 1,
	active: true,
};

describe("presencePeople", () => {
	test("adds each guest here once, after the visitors", () => {
		const people = presencePeople(
			[ana],
			[viewer("ana", false), viewer("g1", true, 3), viewer("g1", true, 3)],
			(n) => `Guest ${n}`,
			9,
		);
		expect(people).toEqual([
			ana,
			{
				userId: "guest:g1",
				name: "Guest 3",
				image: null,
				lastSeenAt: 9,
				active: true,
			},
		]);
	});

	test("returns the same list when no guest is here", () => {
		const visitors = [ana];
		expect(presencePeople(visitors, [viewer("ana", false)], String, 9)).toBe(
			visitors,
		);
	});

	test("shows a guest everyone present, since they get no visitor list", () => {
		expect(
			presencePeople(
				[],
				[viewer("ana", false), viewer("g2", true, 1)],
				() => "Guest",
				9,
			),
		).toEqual([
			{
				userId: "viewer:ana",
				name: "ana",
				image: null,
				lastSeenAt: 9,
				active: true,
			},
			{
				userId: "guest:g2",
				name: "Guest",
				image: null,
				lastSeenAt: 9,
				active: true,
			},
		]);
	});
});

describe("presenceViewersFrom", () => {
	test("keeps well-formed viewers and drops a non-https avatar", () => {
		expect(
			presenceViewersFrom([
				{
					id: "c1",
					key: "k1",
					name: "Ada",
					image: "http://x/a.png",
					guestNumber: 2,
					color: 3,
				},
				{ id: "c2", key: "k2", name: 7 },
				null,
			]),
		).toEqual([
			{
				id: "c1",
				key: "k1",
				name: "Ada",
				image: null,
				guest: false,
				guestNumber: 2,
				color: 3,
			},
		]);
		expect(presenceViewersFrom("viewers")).toEqual([]);
	});
});

describe("pagePresenceUrl", () => {
	test("dials the page's presence socket with a token or a guest id", () => {
		expect(
			pagePresenceUrl({
				realtimeUrl: "https://realtime.superset.sh",
				pageId: "p1",
				token: "jwt",
			}),
		).toBe("wss://realtime.superset.sh/v2/page/p1/presence?token=jwt");
		expect(
			pagePresenceUrl({
				realtimeUrl: "http://localhost:4698",
				pageId: "p1",
				guestId: "g1",
			}),
		).toBe("ws://localhost:4698/v2/page/p1/presence?guest=g1");
	});
});
