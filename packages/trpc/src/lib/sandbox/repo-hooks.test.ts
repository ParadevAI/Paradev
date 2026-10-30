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
		expect(repoHooksFromToml('[archive]\nrun = "x"\n')).toEqual({});
	});

	test("reads [install] with its cloud override", () => {
		expect(
			repoHooksFromToml(
				'[install]\nrun = "bun install"\ncwd = "apps/web"\n[install.cloud]\nrun = ["bun install", "bunx playwright install chromium"]\n',
			),
		).toEqual({
			install: {
				commands: ["bun install", "bunx playwright install chromium"],
				cwd: "apps/web",
			},
		});
	});

	test("an [install] the cloud turns off is no install", () => {
		expect(
			repoHooksFromToml(
				'[install]\nrun = "bun install"\n[install.cloud]\nrun = []\n',
			),
		).toEqual({});
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
