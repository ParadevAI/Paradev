import { describe, expect, test } from "bun:test";
import { addPublicEnvAliases, readPublicEnv } from "./public-env";

describe("readPublicEnv", () => {
	test("prefers the SUPERSET_ name when both are set", () => {
		expect(
			readPublicEnv("WORKSPACE_ID", {
				PARADEV_WORKSPACE_ID: "new",
				SUPERSET_WORKSPACE_ID: "old",
			}),
		).toBe("old");
	});

	test("falls back to the PARADEV_ name when SUPERSET_ is unset or empty", () => {
		expect(readPublicEnv("HOME_DIR", { PARADEV_HOME_DIR: "/new" })).toBe(
			"/new",
		);
		expect(
			readPublicEnv("HOME_DIR", {
				PARADEV_HOME_DIR: "/new",
				SUPERSET_HOME_DIR: "",
			}),
		).toBe("/new");
	});
});

describe("addPublicEnvAliases", () => {
	test("copies public SUPERSET_ names and nothing else", () => {
		const env: Record<string, string> = {
			SUPERSET_TERMINAL_ID: "t1",
			SUPERSET_HOME_DIR: "/home",
			SUPERSET_REFRESH_TOKEN: "secret",
			PARADEV_TERMINAL_ID: "stale",
		};
		addPublicEnvAliases(env);
		expect(env).toEqual({
			SUPERSET_TERMINAL_ID: "t1",
			SUPERSET_HOME_DIR: "/home",
			SUPERSET_REFRESH_TOKEN: "secret",
			PARADEV_TERMINAL_ID: "t1",
			PARADEV_HOME_DIR: "/home",
		});
	});
});
