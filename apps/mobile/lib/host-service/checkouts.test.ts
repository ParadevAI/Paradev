import { describe, expect, test } from "bun:test";
import { checkoutTargets } from "./checkouts";

const checkout = (repositoryId: string, name: string, isPrimary: boolean) => ({
	repositoryId,
	name,
	isPrimary,
	path: `/ws/${name}`,
	branch: "main",
	headSha: null,
	upstream: null,
	pullRequestId: null,
});

describe("checkoutTargets", () => {
	test("a session workspace is its own folder, with no repository", () => {
		expect(checkoutTargets({ worktreePath: "/ws", checkouts: [] })).toEqual([
			{ repositoryId: null, name: null, path: "/ws", isPrimary: true },
		]);
	});

	test("a row from a host without checkouts is its own folder", () => {
		expect(checkoutTargets({ worktreePath: "/ws" })).toEqual([
			{ repositoryId: null, name: null, path: "/ws", isPrimary: true },
		]);
	});

	test("one checkout carries no name, so nothing groups by repository", () => {
		expect(
			checkoutTargets({
				worktreePath: "/ws",
				checkouts: [{ ...checkout("r1", "api", true), path: "/ws" }],
			}),
		).toEqual([
			{ repositoryId: "r1", name: null, path: "/ws", isPrimary: true },
		]);
	});

	test("several checkouts keep their names and folders", () => {
		expect(
			checkoutTargets({
				worktreePath: "/ws",
				checkouts: [checkout("r1", "api", true), checkout("r2", "web", false)],
			}),
		).toEqual([
			{ repositoryId: "r1", name: "api", path: "/ws/api", isPrimary: true },
			{ repositoryId: "r2", name: "web", path: "/ws/web", isPrimary: false },
		]);
	});
});
