import { describe, expect, test } from "bun:test";
import { getDefaultProjectsDir } from "./getDefaultProjectsDir";

describe("getDefaultProjectsDir", () => {
	test("returns a visible Paradev folder in the home directory", () => {
		expect(getDefaultProjectsDir("/Users/me")).toBe("/Users/me/Paradev");
	});
});
