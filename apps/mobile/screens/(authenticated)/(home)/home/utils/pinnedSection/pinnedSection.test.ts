import { describe, expect, test } from "bun:test";
import type { HomeListItem } from "../../types";
import {
	type PinnedEntry,
	pickPinned,
	pinnedRows,
	withPinnedSection,
} from "./pinnedSection";

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

describe("pinnedRows", () => {
	test("names a host row's project and host, a Cloud row's repository and Cloud", () => {
		const entries: PinnedEntry[] = [
			{
				id: "h",
				kind: "host",
				workspace: { id: "h" } as never,
				projectName: "web",
				hostName: "Studio",
				offline: true,
			},
			{ id: "c", kind: "cloud", row: { id: "c" } as never, repoName: "api" },
			{ id: "n", kind: "cloud", row: { id: "n" } as never, repoName: null },
		];
		expect(pinnedRows(entries, "Cloud")).toEqual([
			{
				kind: "workspace",
				workspace: { id: "h" } as never,
				detail: "web · Studio",
				offline: true,
			},
			{ kind: "cloudRow", row: { id: "c" } as never, detail: "api · Cloud" },
			{ kind: "cloudRow", row: { id: "n" } as never, detail: "Cloud" },
		]);
	});

	test("orders host and Cloud pins together, newest pin first", () => {
		const entries = pickPinned(
			[
				{ id: "h", kind: "host" },
				{ id: "c", kind: "cloud" },
			],
			{ h: 1, c: 2 },
		);
		expect(entries.map((entry) => entry.id)).toEqual(["c", "h"]);
	});
});

describe("withPinnedSection", () => {
	const list: HomeListItem[] = [
		{
			kind: "hostLabel",
			placeId: "m1",
			name: "Alpha",
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
