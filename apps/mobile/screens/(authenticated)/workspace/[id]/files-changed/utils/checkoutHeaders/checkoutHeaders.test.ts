import { describe, expect, test } from "bun:test";
import { checkoutHeaders } from "./checkoutHeaders";

const file = (
	path: string,
	checkoutName: string | null,
	additions: number | null,
	deletions: number | null,
) => ({ path, checkoutName, additions, deletions });

describe("checkoutHeaders", () => {
	test("one checkout gets no repository header", () => {
		expect(
			checkoutHeaders([file("a.ts", null, 1, 0), file("b.ts", null, 2, 2)])
				.size,
		).toBe(0);
	});

	test("each checkout's first file carries its repository's totals", () => {
		const headers = checkoutHeaders([
			file("api/a.ts", "api", 1, 0),
			file("api/b.ts", "api", null, null),
			file("web/a.ts", "web", 3, 4),
		]);
		expect([...headers]).toEqual([
			["api/a.ts", { name: "api", additions: 1, deletions: 0, fileCount: 2 }],
			["web/a.ts", { name: "web", additions: 3, deletions: 4, fileCount: 1 }],
		]);
	});
});
