import { describe, expect, test } from "bun:test";
import { historyRows } from "./historyRows";

const build = (id: string, active = false, restorable = false) => ({
	id,
	active,
	restorable,
});

describe("historyRows", () => {
	test("keeps an older snapshot that can still be used after newer builds failed", () => {
		const builds = [
			build("failed-1"),
			build("failed-2"),
			build("failed-3"),
			build("current", true),
			build("restorable", false, true),
			build("deleted-snapshot"),
		];
		expect(historyRows(builds, 2).map((row) => row.id)).toEqual([
			"failed-1",
			"failed-2",
			"current",
			"restorable",
		]);
	});
});
