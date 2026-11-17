import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearOldPublicSessions } from "./public-sessions.ts";

describe("clearOldPublicSessions", () => {
	test("deletes public conversations' session files after two days, archived too, and nothing else", () => {
		const agent = mkdtempSync(join(tmpdir(), "dev-agent-"));
		mkdirSync(join(agent, "sessions", "archive"), { recursive: true });
		const now = Date.parse("2026-10-20T10:00:00Z");
		const file = (path: string, ageHours: number) => {
			const full = join(agent, "sessions", path);
			writeFileSync(full, "{}\n");
			const at = new Date(now - ageHours * 60 * 60_000);
			utimesSync(full, at, at);
			return full;
		};
		const oldPublic = file("2026-10-17_g1.public-c1.jsonl", 49);
		const oldArchived = file("archive/2026-10-17_g1.public-c2.jsonl", 72);
		const freshPublic = file("2026-10-20_g1.public-c3.jsonl", 2);
		const chat = file("2026-10-01_g1.jsonl", 400);
		const trigger = file("2026-10-01_g1.trigger-t1.jsonl", 400);

		expect(clearOldPublicSessions(agent, now)).toBe(2);
		expect([oldPublic, oldArchived].map(existsSync)).toEqual([false, false]);
		expect([freshPublic, chat, trigger].map(existsSync)).toEqual([
			true,
			true,
			true,
		]);
	});

	test("a box with no sessions yet has nothing to clear", () => {
		expect(
			clearOldPublicSessions(mkdtempSync(join(tmpdir(), "dev-agent-"))),
		).toBe(0);
	});
});
