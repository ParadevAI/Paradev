import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionFileTail } from "./sessionFile";

let agentDir: string;
let file: string;

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "session-tail-"));
	mkdirSync(join(agentDir, "sessions", "--work--"), { recursive: true });
	file = join(agentDir, "sessions", "--work--", "s.jsonl");
});

afterEach(() => rmSync(agentDir, { recursive: true, force: true }));

describe("SessionFileTail", () => {
	test("returns whole lines only, even when a read ends mid-character", async () => {
		const tail = new SessionFileTail(agentDir);
		const line = Buffer.from(
			`${JSON.stringify({ type: "message", text: "café ✓" })}\n`,
		);
		const cut = line.indexOf(Buffer.from("✓")) + 1;
		appendFileSync(file, line.subarray(0, cut));
		expect(await tail.read()).toEqual([]);
		appendFileSync(file, line.subarray(cut));
		expect(await tail.read()).toEqual([{ type: "message", text: "café ✓" }]);
		expect(await tail.read()).toEqual([]);
	});
});
