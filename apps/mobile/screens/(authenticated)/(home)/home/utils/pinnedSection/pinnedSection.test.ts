import { describe, expect, test } from "bun:test";
import type { HomeListItem } from "../../types";
import { pickPinned, withPinnedSection } from "./pinnedSection";

const row = (id: string): HomeListItem => ({
	kind: "cloudRow",
	row: { id } as never,
});

describe("pickPinned", () => {
	test("keeps pinned workspaces only, newest pin first", () => {
		expect(
			pickPinned([{ id: "a" }, { id: "b" }, { id: "c" }], { a: 1, c: 5 }),
		).toEqual([{ id: "c" }, { id: "a" }]);
	});
});

describe("withPinnedSection", () => {
	const list: HomeListItem[] = [
		{
			kind: "hostLabel",
			placeId: "m1",
			name: "Alpha",
			cloud: false,
			status: "online",
			first: true,
		},
		row("x"),
	];

	test("leads the list with a Pinned label and its rows, the old head loses first", () => {
		const items = withPinnedSection(list, {
			label: "Pinned",
			rows: [row("p")],
			attentions: [null],
			collapsed: false,
		});
		expect(items[0]).toMatchObject({
			kind: "hostLabel",
			placeId: "pinned",
			count: 1,
			first: true,
		});
		expect(items[1]).toEqual(row("p"));
		expect(items[2]).toMatchObject({ placeId: "m1", first: false });
	});

	test("folds its rows away and rolls up their attention when collapsed", () => {
		const items = withPinnedSection(list, {
			label: "Pinned",
			rows: [row("p")],
			attentions: ["review"],
			collapsed: true,
		});
		expect(items).toHaveLength(3);
		expect(items[0]).toMatchObject({ collapsed: true, attention: "review" });
	});

	test("adds nothing when no row is pinned", () => {
		expect(
			withPinnedSection(list, {
				label: "Pinned",
				rows: [],
				attentions: [],
				collapsed: false,
			}),
		).toEqual(list);
	});
});
