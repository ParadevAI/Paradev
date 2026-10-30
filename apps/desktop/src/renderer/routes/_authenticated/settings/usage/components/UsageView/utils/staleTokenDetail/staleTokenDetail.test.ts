import { describe, expect, it } from "bun:test";
import { initI18n } from "@superset/i18n";
import { staleTokenDetail } from "./staleTokenDetail";

initI18n();

describe("staleTokenDetail", () => {
	it("names the CLI that renews the lapsed token", () => {
		expect(staleTokenDetail("codex")).toBe("Refreshes when Codex next runs.");
		expect(staleTokenDetail("claude")).toBe(
			"Refreshes when Claude Code next runs.",
		);
		expect(staleTokenDetail("opencode")).toBe(
			"Refreshes when OpenCode next runs.",
		);
	});
});
