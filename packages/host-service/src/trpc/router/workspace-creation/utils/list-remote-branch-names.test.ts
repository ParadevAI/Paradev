import { expect, test } from "bun:test";
import type { ExecGh } from "./exec-gh";
import { listRemoteBranchNames } from "./list-remote-branch-names";

function fakeGh(names: string[]) {
	const calls: string[][] = [];
	const runGh: ExecGh = async (args) => {
		calls.push(args);
		const page = Number(args.find((arg) => arg.startsWith("page="))?.slice(5));
		return names.slice((page - 1) * 100, page * 100);
	};
	return { runGh, calls };
}

test("reads every page, so a branch past the first 100 is found", async () => {
	const names = [
		...Array.from({ length: 250 }, (_, index) => `branch-${index}`),
		"main",
	];
	const { runGh, calls } = fakeGh(names);

	const result = await listRemoteBranchNames(runGh, "acme", "app");

	expect(result).toEqual(names);
	expect(calls).toHaveLength(3);
	expect(calls[0]).toContain("repos/acme/app/branches");
});

test("stops after one request when the repo has fewer than 100 branches", async () => {
	const { runGh, calls } = fakeGh(["main", "dev"]);

	expect(await listRemoteBranchNames(runGh, "acme", "app")).toEqual([
		"main",
		"dev",
	]);
	expect(calls).toHaveLength(1);
});

test("asks for one more page when a page is exactly full", async () => {
	const names = Array.from({ length: 100 }, (_, index) => `branch-${index}`);
	const { runGh, calls } = fakeGh(names);

	expect(await listRemoteBranchNames(runGh, "acme", "app")).toEqual(names);
	expect(calls).toHaveLength(2);
});

test("returns no names for a repo without branches", async () => {
	const { runGh } = fakeGh([]);

	expect(await listRemoteBranchNames(runGh, "acme", "empty")).toEqual([]);
});
