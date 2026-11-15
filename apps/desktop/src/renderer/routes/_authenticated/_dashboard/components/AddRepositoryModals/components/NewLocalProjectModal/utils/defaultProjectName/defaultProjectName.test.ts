import { expect, test } from "bun:test";
import { defaultProjectName } from "./defaultProjectName";

test("a project is named after the first repository added", () => {
	expect(defaultProjectName({ kind: "local", path: "/work/orbit/web" })).toBe(
		"web",
	);
	expect(
		defaultProjectName({
			kind: "clone",
			url: "git@github.com:acme/orbit-api.git",
			label: "acme/orbit-api",
		}),
	).toBe("orbit-api");
	expect(defaultProjectName(undefined)).toBe("");
});
