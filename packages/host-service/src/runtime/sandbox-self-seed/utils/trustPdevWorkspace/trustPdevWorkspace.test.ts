import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trustPdevWorkspace } from "./trustPdevWorkspace";

function agentDir(): string {
	return join(mkdtempSync(join(tmpdir(), "pdev-trust-")), "agent");
}

function read(dir: string): unknown {
	return JSON.parse(readFileSync(join(dir, "trust.json"), "utf8"));
}

describe("trustPdevWorkspace", () => {
	test("trusts the workspace root in a fresh agent dir", () => {
		const dir = agentDir();
		trustPdevWorkspace("/workspace", dir);
		expect(read(dir)).toEqual({ "/workspace": true });
	});

	test("keeps other entries and a decision already made for the root", () => {
		const dir = agentDir();
		trustPdevWorkspace("/other", dir);
		writeFileSync(
			join(dir, "trust.json"),
			JSON.stringify({ "/other": true, "/workspace": false }),
		);
		trustPdevWorkspace("/workspace", dir);
		expect(read(dir)).toEqual({ "/other": true, "/workspace": false });
	});

	test("leaves a store it cannot parse untouched", () => {
		const dir = agentDir();
		trustPdevWorkspace("/other", dir);
		writeFileSync(join(dir, "trust.json"), "{not json");
		trustPdevWorkspace("/workspace", dir);
		expect(readFileSync(join(dir, "trust.json"), "utf8")).toBe("{not json");
	});
});
