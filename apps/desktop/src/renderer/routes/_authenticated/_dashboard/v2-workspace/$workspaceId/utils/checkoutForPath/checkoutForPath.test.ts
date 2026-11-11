import { describe, expect, it } from "bun:test";
import { checkoutForPath } from "./checkoutForPath";

const checkouts = [
	{ id: "web", worktreePath: "/ws/orbit/orbit-web" },
	{ id: "api", worktreePath: "/ws/orbit/orbit-api/" },
];

describe("checkoutForPath", () => {
	it("finds the checkout that holds the file", () => {
		expect(
			checkoutForPath(checkouts, "/ws/orbit/orbit-api/src/server.ts"),
		).toBe("api");
	});

	it("does not match a sibling folder that shares a name prefix", () => {
		expect(
			checkoutForPath(checkouts, "/ws/orbit/orbit-web-old/index.ts"),
		).toBeUndefined();
	});

	it("returns nothing for a file outside every checkout", () => {
		expect(checkoutForPath(checkouts, "/ws/orbit/AGENTS.md")).toBeUndefined();
	});

	it("prefers the most specific checkout", () => {
		expect(
			checkoutForPath(
				[
					...checkouts,
					{ id: "nested", worktreePath: "/ws/orbit/orbit-web/pkg" },
				],
				"/ws/orbit/orbit-web/pkg/a.ts",
			),
		).toBe("nested");
	});
});
