import { describe, expect, test } from "bun:test";
import { hostTagFoldersQueryKey } from "./hostTagFoldersQueryKey";

describe("hostTagFoldersQueryKey", () => {
	test("one machine in two organizations gets two cache entries", () => {
		expect(hostTagFoldersQueryKey("m1", "org-a")).not.toEqual(
			hostTagFoldersQueryKey("m1", "org-b"),
		);
	});
});
