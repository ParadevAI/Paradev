import { describe, expect, test } from "bun:test";
import { configHooks } from "./config-hooks";

describe("configHooks", () => {
	test("publishes only ports with preview = true", () => {
		expect(
			configHooks(
				"[ports.web]\ndefault = 3000\npreview = true\n[ports.api]\ndefault = 3001\n",
			),
		).toEqual({ ports: [3000] });
	});

	test("a config without previews publishes nothing extra", () => {
		expect(configHooks('[archive]\nrun = "x"\n')).toEqual({});
	});

	test("reads [install] with its cloud override", () => {
		expect(
			configHooks(
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
			configHooks(
				'[install]\nrun = "bun install"\n[install.cloud]\nrun = []\n',
			),
		).toEqual({});
	});

	test("an unset, blank or invalid config is no config", () => {
		expect(configHooks(null)).toBeNull();
		expect(configHooks("  \n")).toBeNull();
		expect(configHooks("[setup\n")).toBeNull();
	});
});
