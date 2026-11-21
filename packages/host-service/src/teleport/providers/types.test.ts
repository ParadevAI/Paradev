import { describe, expect, test } from "bun:test";
import { parseBundleManifest } from "./types";

const base = {
	version: 1,
	harnessSessionId: "session-1",
	sourceCwd: "/workspace",
	sourceDir: "/home/ubuntu/.claude/projects/-workspace",
} as const;

describe("parseBundleManifest", () => {
	test("keeps the chat's mode and model, and drops values it cannot trust", () => {
		expect(
			parseBundleManifest({
				...base,
				selections: { modeId: "bypassPermissions", modelId: 42 },
			}),
		).toEqual({ ...base, selections: { modeId: "bypassPermissions" } });
		expect(parseBundleManifest({ ...base, selections: "full" })).toEqual(base);
	});
});
