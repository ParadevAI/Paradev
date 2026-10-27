import { describe, expect, it } from "bun:test";
import { revealInFileManagerLabel, revealTarget } from "./revealInFileManager";

describe("revealInFileManagerLabel", () => {
	it("names the file manager of each platform", () => {
		expect(revealInFileManagerLabel("mac").message).toBe("Reveal in Finder");
		expect(revealInFileManagerLabel("windows").message).toBe(
			"Reveal in File Explorer",
		);
		expect(revealInFileManagerLabel("linux").message).toBe(
			"Reveal in File Manager",
		);
	});
});

describe("revealTarget", () => {
	it("returns the resolved path of a file or folder link", () => {
		expect(
			revealTarget({
				kind: "file",
				isDirectory: false,
				resolvedPath: "/tmp/x.pdf",
				row: 3,
			}),
		).toEqual({ path: "/tmp/x.pdf", isDirectory: false });
		expect(
			revealTarget({ kind: "file", isDirectory: true, resolvedPath: "/tmp" }),
		).toEqual({ path: "/tmp", isDirectory: true });
	});

	it("returns null for a URL, an unresolved path, or no link", () => {
		expect(
			revealTarget({ kind: "url", url: "https://example.com" }),
		).toBeNull();
		expect(revealTarget({ kind: "file", isDirectory: false })).toBeNull();
		expect(revealTarget(null)).toBeNull();
	});
});
