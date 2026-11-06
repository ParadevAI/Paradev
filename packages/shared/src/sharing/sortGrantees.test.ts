import { describe, expect, test } from "bun:test";
import { sortGrantees } from "./sortGrantees";

describe("sortGrantees", () => {
	test("puts people first, then invites, then teams, keeping order within each", () => {
		const sorted = sortGrantees([
			{ kind: "team", id: "design" },
			{ kind: "invitation", id: "ana" },
			{ kind: "user", id: "lena" },
			{ kind: "team", id: "ops" },
			{ kind: "user", id: "dev" },
		] as const);
		expect(sorted.map((g) => g.id)).toEqual([
			"lena",
			"dev",
			"ana",
			"design",
			"ops",
		]);
	});
});
