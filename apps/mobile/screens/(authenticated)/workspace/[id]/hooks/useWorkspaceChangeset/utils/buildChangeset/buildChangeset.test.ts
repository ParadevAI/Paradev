import { describe, expect, test } from "bun:test";
import type { GitStatusSnapshot } from "@/lib/host-service/client";
import { buildChangeset } from "./buildChangeset";

const file = (path: string, additions: number, deletions: number) => ({
	path,
	status: "modified" as const,
	additions,
	deletions,
});

const status = (
	parts: Partial<
		Pick<GitStatusSnapshot, "againstBase" | "staged" | "unstaged">
	>,
): GitStatusSnapshot =>
	({
		againstBase: [],
		staged: [],
		unstaged: [],
		currentBranch: { name: "feature" },
		defaultBranch: { name: "main" },
		...parts,
	}) as unknown as GitStatusSnapshot;

describe("buildChangeset", () => {
	test("one checkout keeps its paths and the last category wins per path", () => {
		const changeset = buildChangeset([
			{
				target: {
					repositoryId: "r1",
					name: null,
					path: "/ws",
					isPrimary: true,
				},
				status: status({
					againstBase: [file("b.ts", 5, 5), file("a.ts", 1, 0)],
					unstaged: [file("b.ts", 2, 1)],
				}),
			},
		]);
		expect(
			changeset.files.map((entry) => [entry.path, entry.gitPath, entry.source]),
		).toEqual([
			["a.ts", "a.ts", "against-base"],
			["b.ts", "b.ts", "unstaged"],
		]);
		expect([changeset.additions, changeset.deletions]).toEqual([3, 1]);
	});

	test("several checkouts group files under their repository and sum totals", () => {
		const changeset = buildChangeset([
			{
				target: {
					repositoryId: "r1",
					name: "api",
					path: "/ws/api",
					isPrimary: true,
				},
				status: status({ unstaged: [file("x.ts", 1, 1)] }),
			},
			{
				target: {
					repositoryId: "r2",
					name: "web",
					path: "/ws/web",
					isPrimary: false,
				},
				status: status({ unstaged: [file("x.ts", 4, 0)] }),
			},
			{
				target: {
					repositoryId: "r3",
					name: "zeta",
					path: "/ws/zeta",
					isPrimary: false,
				},
				status: undefined,
			},
		]);
		expect(
			changeset.files.map((entry) => [
				entry.path,
				entry.gitPath,
				entry.repositoryId,
				entry.checkoutPath,
			]),
		).toEqual([
			["api/x.ts", "x.ts", "r1", "/ws/api"],
			["web/x.ts", "x.ts", "r2", "/ws/web"],
		]);
		expect(
			changeset.checkouts.map((checkout) => [
				checkout.name,
				checkout.additions,
				checkout.files.length,
			]),
		).toEqual([
			["api", 1, 1],
			["web", 4, 1],
			["zeta", 0, 0],
		]);
		expect([changeset.additions, changeset.deletions]).toEqual([5, 1]);
	});
});
