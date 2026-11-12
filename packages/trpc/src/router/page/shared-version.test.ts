import { describe, expect, test } from "bun:test";
import {
	isPubliclyServed,
	resolveSharedVersion,
	servedVersion,
} from "./shared-version";

describe("servedVersion", () => {
	test("falls back to the latest version when nothing is pinned", () => {
		expect(servedVersion(null, 5)).toBe(5);
	});

	test("keeps the pinned version when one is set", () => {
		expect(servedVersion(3, 5)).toBe(3);
	});

	test("is null for a page with no versions", () => {
		expect(servedVersion(null, null)).toBeNull();
	});
});

describe("resolveSharedVersion", () => {
	test("keeps an older pick pinned", () => {
		expect(resolveSharedVersion(3, 5)).toBe(3);
	});

	test("collapses a pick of the latest version to follow-latest", () => {
		expect(resolveSharedVersion(5, 5)).toBeNull();
	});

	test("passes an explicit follow-latest through", () => {
		expect(resolveSharedVersion(null, 5)).toBeNull();
	});

	test("pins a pick the client would have collapsed against a stale latest", () => {
		expect(resolveSharedVersion(5, 6)).toBe(5);
	});

	test("pins a pick when the page has no versions to compare against", () => {
		expect(resolveSharedVersion(2, null)).toBe(2);
	});
});

describe("isPubliclyServed", () => {
	const page = { visibility: "everyone" as const, takenDownAt: null };

	test("is true for a page anyone with the link can see", () => {
		expect(isPubliclyServed(page)).toBe(true);
	});

	test("is false for a page only its organization or its owner can see", () => {
		expect(isPubliclyServed({ ...page, visibility: "org" })).toBe(false);
		expect(isPubliclyServed({ ...page, visibility: "just_me" })).toBe(false);
	});

	test("is false for a page that was taken down", () => {
		expect(isPubliclyServed({ ...page, takenDownAt: new Date() })).toBe(false);
	});
});
