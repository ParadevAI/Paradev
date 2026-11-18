import { describe, expect, it } from "bun:test";
import { isIssuedBeforeCutoff } from "./isIssuedBeforeCutoff";

const cutoff = new Date("2026-11-18T12:00:00Z");
const cutoffSeconds = cutoff.getTime() / 1000;

describe("isIssuedBeforeCutoff", () => {
	it("accepts every token when no cutoff is set", () => {
		expect(isIssuedBeforeCutoff(1, null)).toBe(false);
		expect(isIssuedBeforeCutoff(undefined, null)).toBe(false);
	});

	it("rejects a token issued before the cutoff", () => {
		expect(isIssuedBeforeCutoff(cutoffSeconds - 1, cutoff)).toBe(true);
	});

	it("accepts a token issued at or after the cutoff", () => {
		expect(isIssuedBeforeCutoff(cutoffSeconds, cutoff)).toBe(false);
		expect(isIssuedBeforeCutoff(cutoffSeconds + 1, cutoff)).toBe(false);
	});

	it("rejects a token without iat when a cutoff is set", () => {
		expect(isIssuedBeforeCutoff(undefined, cutoff)).toBe(true);
	});
});
