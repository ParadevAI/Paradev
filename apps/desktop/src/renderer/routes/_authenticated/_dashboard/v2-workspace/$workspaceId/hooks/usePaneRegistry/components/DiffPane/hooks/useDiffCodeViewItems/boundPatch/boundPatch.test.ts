import { describe, expect, test } from "bun:test";
import { boundPatch } from "./boundPatch";

const section = (name: string, body: string) =>
	`diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n${body}\n`;

describe("boundPatch", () => {
	const patch = [
		section("a.txt", "+one"),
		section("b.txt", "+two"),
		section("c.txt", "+three"),
	].join("");

	test("a patch within the bound is unchanged", () => {
		expect(boundPatch(patch, patch.length)).toBe(patch);
	});

	test("cuts at the last whole section that fits", () => {
		const firstTwo = section("a.txt", "+one") + section("b.txt", "+two");
		expect(boundPatch(patch, firstTwo.length + 5)).toBe(firstTwo);
		expect(boundPatch(patch, firstTwo.length)).toBe(firstTwo);
	});

	test("keeps nothing when not even the first section fits", () => {
		expect(boundPatch(patch, 10)).toBe("");
	});
});
