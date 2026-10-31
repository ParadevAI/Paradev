import { describe, expect, test } from "bun:test";
import type { GetDiffPatchInput } from "renderer/lib/diffPatchQuery";
import { MAX_PATCH_REQUEST_PATHS, splitPatchInput } from "./splitPatchInput";

const files = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, index) => `${prefix}/file-${index}.txt`);

const input = (
	paths: string[],
	untrackedPaths: string[],
): GetDiffPatchInput => ({
	workspaceId: "workspace",
	category: "unstaged",
	paths,
	untrackedPaths,
});

describe("splitPatchInput", () => {
	test("a request within the limit is sent as is", () => {
		const request = input(files("tracked", 10), files("new", 2000));
		expect(splitPatchInput(request)).toEqual([request]);
	});

	test("every path goes out exactly once, no call over the limit", () => {
		const tracked = files("tracked", 4500);
		const untracked = files("new", 2100);
		const calls = splitPatchInput(input(tracked, untracked));

		expect(calls).toHaveLength(3);
		for (const call of calls) {
			expect(call.paths?.length).toBeLessThanOrEqual(MAX_PATCH_REQUEST_PATHS);
			expect(call.untrackedPaths?.length).toBeLessThanOrEqual(
				MAX_PATCH_REQUEST_PATHS,
			);
		}
		expect(calls.flatMap((call) => call.paths)).toEqual(tracked);
		expect(calls.flatMap((call) => call.untrackedPaths)).toEqual(untracked);
	});

	test("a call with only untracked paths never asks for the whole category", () => {
		const untracked = files("new", 3000);
		const calls = splitPatchInput(input([], untracked));

		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.paths).toHaveLength(1);
			expect(call.untrackedPaths).toContain(call.paths?.[0] as string);
		}
	});
});
