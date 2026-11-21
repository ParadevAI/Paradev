import { expect, test } from "bun:test";
import { locateChatLink } from "./locateChatLink";

const MISSING = { stat: async () => null, resolveFile: async () => null };

test("a website named without a scheme opens as a web page", async () => {
	expect(
		await locateChatLink(
			"changelog.example.ai/releases/42",
			"changelog.example.ai/releases/42",
			MISSING,
		),
	).toEqual({ kind: "web", url: "https://changelog.example.ai/releases/42" });
});

test("a file with a host-like name still opens as the file", async () => {
	const file = { resolvedPath: "/repo/notes.ai", isDirectory: false };
	expect(
		await locateChatLink("notes.ai", "notes.ai", {
			stat: async () => file,
			resolveFile: async () => null,
		}),
	).toEqual({ kind: "path", ...file });
});

test("a missing file is not found", async () => {
	expect(await locateChatLink("src/app.ts", "src/app.ts", MISSING)).toBeNull();
});
