import { describe, expect, test } from "bun:test";
import { projectFolderName } from "./projectFolderName";

describe("projectFolderName", () => {
	test("keeps an ordinary name", () => {
		expect(projectFolderName("  Orbit web ")).toBe("Orbit web");
	});

	test("never leaves the parent folder", () => {
		expect(projectFolderName("../x")).toBe("-x");
		expect(projectFolderName("a/b\\c")).toBe("a-b-c");
		expect(projectFolderName("..")).toBe("project");
		expect(projectFolderName("C:\\evil")).toBe("C-evil");
	});

	test("falls back when nothing is left", () => {
		expect(projectFolderName("")).toBe("project");
		expect(projectFolderName(" . ")).toBe("project");
	});
});
