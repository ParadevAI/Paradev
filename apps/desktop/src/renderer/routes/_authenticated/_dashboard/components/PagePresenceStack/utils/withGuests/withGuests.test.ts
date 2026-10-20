import { describe, expect, it } from "bun:test";
import type { PagePresenceViewer } from "@superset/shared/page-presence";
import { withGuests } from "./withGuests";

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

describe("withGuests", () => {
	it("adds each guest here once, after the visitors", () => {
		const people = withGuests(
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

	it("returns the same list when no guest is here", () => {
		const visitors = [ana];
		expect(withGuests(visitors, [viewer("ana", false)], String, 9)).toBe(
			visitors,
		);
	});
});
