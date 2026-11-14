import { describe, expect, test } from "bun:test";
import type { RecentlyViewedEntry } from "../../hooks/useRecentlyViewed";
import { unresolvedTaskEntityIds } from "./unresolvedTaskEntityIds";

const entry = (
	type: RecentlyViewedEntry["type"],
	entityId: string,
): RecentlyViewedEntry => ({
	type,
	entityId,
	path: `/x/${entityId}`,
	timestamp: 0,
});

describe("unresolvedTaskEntityIds", () => {
	test("returns only task entries the window has by neither id nor slug", () => {
		expect(
			unresolvedTaskEntityIds(
				[
					entry("task", "id-in-window"),
					entry("task", "SUPER-2"),
					entry("task", "SUPER-1"),
					entry("v2-workspace", "ws-1"),
				],
				[
					{ task: { id: "id-in-window", slug: "SUPER-3" } },
					{ task: { id: "id-2", slug: "SUPER-2" } },
				],
			),
		).toEqual(["SUPER-1"]);
	});
});
