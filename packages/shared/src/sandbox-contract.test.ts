import { expect, test } from "bun:test";
import { sandboxRepositoryPath } from "./sandbox-contract";

test("a repository named like a root file goes under its owner-prefixed name; others keep their name", () => {
	const all = [
		{ owner: "acme", name: "app" },
		{ owner: "openai", name: "AGENTS.md" },
		{ owner: "acme", name: ".Claude" },
	];
	expect(all.map((repo) => sandboxRepositoryPath(repo, all))).toEqual([
		"app",
		"openai-AGENTS.md",
		"acme-.Claude",
	]);
});
