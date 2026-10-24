import { describe, expect, test } from "bun:test";
import { attachedFilesBlock } from "./attachedFiles";

describe("attachedFilesBlock", () => {
	test("lists each file by the name it was attached with, then its path", () => {
		expect(
			attachedFilesBlock([
				{ name: "spec.pdf", path: "/store/a1/a1.pdf" },
				{ name: "notes.txt", path: "/store/b2/b2.txt" },
			]),
		).toBe(
			"# Attached files\n\nThe user attached these files. They are available on this host at:\n\n- spec.pdf: /store/a1/a1.pdf\n- notes.txt: /store/b2/b2.txt",
		);
	});
});
