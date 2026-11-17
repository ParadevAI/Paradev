import { describe, expect, test } from "bun:test";
import {
	canOpenFolder,
	childPath,
	folderCrumbs,
	folderPreviewKind,
	imageMime,
	looksBinary,
	parentFolder,
} from "./dev-folder.ts";

describe("a Dev's folder", () => {
	test("crumbs lead from the root to where you are, and a parent is one up", () => {
		expect(folderCrumbs("")).toEqual([]);
		expect(folderCrumbs("memory/people")).toEqual([
			{ name: "memory", path: "memory" },
			{ name: "people", path: "memory/people" },
		]);
		expect(parentFolder("memory/people")).toBe("memory");
		expect(parentFolder("memory")).toBe("");
		expect(childPath("", "AGENTS.md")).toBe("AGENTS.md");
		expect(childPath("memory", "you.md")).toBe("memory/you.md");
	});

	test("pictures show as pictures, text and unknown types as text, and archives and media are left to the system", () => {
		expect(folderPreviewKind("shot.PNG")).toBe("image");
		expect(folderPreviewKind("AGENTS.md")).toBe("text");
		expect(folderPreviewKind("2026_g1.jsonl")).toBe("text");
		expect(folderPreviewKind("Makefile")).toBe("text");
		expect(folderPreviewKind("report.pdf")).toBeNull();
		expect(folderPreviewKind("bundle.zip")).toBeNull();
		expect(imageMime("a.jpg")).toBe("image/jpeg");
	});

	test("a NUL in the first bytes makes a file binary", () => {
		expect(looksBinary(new TextEncoder().encode("hello"))).toBe(false);
		expect(looksBinary(new Uint8Array([104, 0, 105]))).toBe(true);
	});

	test("a folder opens to its owner, and a group's own Dev's to its members; a person's Dev stays its owner's", () => {
		expect(canOpenFolder({ kind: "personal", ownerId: "me" }, "me")).toBe(true);
		expect(canOpenFolder({ kind: "custom", ownerId: "me" }, "me")).toBe(true);
		expect(canOpenFolder({ kind: "group", ownerId: null }, "me")).toBe(true);
		expect(canOpenFolder({ kind: "personal", ownerId: "nina" }, "me")).toBe(
			false,
		);
		expect(canOpenFolder({ kind: "custom", ownerId: "nina" }, "me")).toBe(
			false,
		);
	});
});
