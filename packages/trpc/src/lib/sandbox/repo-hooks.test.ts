import { describe, expect, test } from "bun:test";
import { repoHooksFromJson, repoHooksFromToml } from "./repo-hooks";

describe("repoHooksFromToml", () => {
	test("publishes only ports with preview = true", () => {
		expect(
			repoHooksFromToml(
				"[ports.web]\ndefault = 3000\npreview = true\n[ports.api]\ndefault = 3001\n",
			),
		).toEqual({ ports: [3000] });
	});

	test("a file without previews publishes nothing extra", () => {
		expect(repoHooksFromToml('[setup]\nrun = "x"\n')).toEqual({});
	});

	test("an invalid file is treated as missing", () => {
		expect(repoHooksFromToml("[setup\n")).toBeNull();
	});
});

describe("repoHooksFromJson", () => {
	test("publishes a v1 file's ports, through its conversion", () => {
		expect(
			repoHooksFromJson(JSON.stringify({ setup: ["x"], ports: [3000, 70000] })),
		).toEqual({ ports: [3000] });
	});

	test("unparseable JSON is treated as missing", () => {
		expect(repoHooksFromJson("{")).toBeNull();
	});
});
