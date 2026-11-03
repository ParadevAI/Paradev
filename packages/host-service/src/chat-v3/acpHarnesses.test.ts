import { describe, expect, it } from "bun:test";
import { valid } from "semver";
import {
	ACP_HARNESSES,
	acpHarnessForPreset,
	UNGATED_VERSION,
} from "./acpCatalogue";

const entries = Object.entries(ACP_HARNESSES);

describe("ACP_HARNESSES", () => {
	it("serves every harness the product maps to", () => {
		const ids = entries.map(([id]) => id);
		expect(ids).toContain("claude-acp");
		expect(ids).toContain("codex-acp");
		expect(ids).toContain("pi-acp");
		expect(ids).toContain("pdev-acp");
	});

	it("runs pdev as its own ACP server with no adapter", () => {
		expect(acpHarnessForPreset("pdev")).toBe("pdev-acp");
		expect(ACP_HARNESSES["pdev-acp"]).toMatchObject({
			binary: "pdev",
			args: ["acp"],
		});
		expect(ACP_HARNESSES["pdev-acp"]?.adapter).toBeUndefined();
	});

	it.each(entries)("%s names a binary and a usable floor", (_id, entry) => {
		expect(entry.binary).not.toBe("");
		expect(valid(entry.minVersion)).not.toBeNull();
	});

	it.each(entries)("%s tells a gated reader how to upgrade", (_id, entry) => {
		if (entry.minVersion === UNGATED_VERSION) return;
		expect(entry.upgrade).toBeTypeOf("string");
		expect(entry.upgrade).not.toBe("");
	});

	it.each(entries)("%s can reach the CLI it translates for", (_id, entry) => {
		if (entry.adapter === undefined) return;
		expect(entry.executableEnv).not.toBe("");
	});
});
