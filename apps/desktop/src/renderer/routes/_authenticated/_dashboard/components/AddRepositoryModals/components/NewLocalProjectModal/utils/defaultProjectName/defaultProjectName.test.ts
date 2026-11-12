import { expect, test } from "bun:test";
import { defaultProjectName } from "./defaultProjectName";

test("local repositories in one folder are named after that folder", () => {
	expect(defaultProjectName(["/work/orbit/web", "/work/orbit/api"], [])).toBe(
		"orbit",
	);
});

test("cloned repositories are named after the name they share", () => {
	expect(
		defaultProjectName(
			[],
			[
				"https://github.com/acme/orbit-web.git",
				"https://github.com/acme/orbit-api.git",
			],
		),
	).toBe("orbit");
	expect(
		defaultProjectName(
			[],
			["https://github.com/acme/web.git", "git@github.com:acme/api.git"],
		),
	).toBe("web");
});
