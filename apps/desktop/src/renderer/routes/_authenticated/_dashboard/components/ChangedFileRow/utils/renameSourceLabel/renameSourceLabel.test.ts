import { describe, expect, test } from "bun:test";
import { renameSourceLabel } from "./renameSourceLabel";

describe("renameSourceLabel", () => {
	test("a rename shows the old name", () => {
		expect(renameSourceLabel("a/New.tsx", "a/Old.tsx")).toBe("Old.tsx");
	});

	test("a move between folders shows the old folder", () => {
		expect(renameSourceLabel("b/Header.tsx", "a/Header.tsx")).toBe("a/");
		expect(renameSourceLabel("b/Header.tsx", "Header.tsx")).toBe("");
	});
});
