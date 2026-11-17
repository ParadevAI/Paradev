import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	archiveSession,
	clearHandover,
	compactionReserve,
	DEFAULT_ROLLOVER,
	readHandover,
	rolloverReason,
	rolloverTokens,
	writeHandover,
} from "./rollover.ts";

const state = (
	tokens: number | null,
	extra: Partial<{
		contextWindow: number;
		compactions: number;
		overflow: boolean;
	}> = {},
) => ({
	tokens,
	contextWindow: 1_000_000,
	compactions: 0,
	overflow: false,
	...extra,
});

describe("rollover", () => {
	test("a session rolls over past the working size (or 70% of a small window), after two compactions, or on overflow", () => {
		expect(rolloverTokens(1_000_000, DEFAULT_ROLLOVER)).toBe(120_000);
		expect(rolloverTokens(128_000, DEFAULT_ROLLOVER)).toBe(89_600);
		expect(rolloverReason(state(119_999), DEFAULT_ROLLOVER)).toBeNull();
		expect(rolloverReason(state(120_000), DEFAULT_ROLLOVER)).toBe("context");
		expect(
			rolloverReason(
				state(90_000, { contextWindow: 128_000 }),
				DEFAULT_ROLLOVER,
			),
		).toBe("context");
		// Right after a compaction pi doesn't know the size; the count still applies.
		expect(
			rolloverReason(state(null, { compactions: 1 }), DEFAULT_ROLLOVER),
		).toBeNull();
		expect(
			rolloverReason(state(null, { compactions: 2 }), DEFAULT_ROLLOVER),
		).toBe("compactions");
		expect(
			rolloverReason(state(10, { overflow: true }), DEFAULT_ROLLOVER),
		).toBe("overflow");
	});

	test("pi compacts inside a turn at twice the rollover size, never with less than its own reserve", () => {
		expect(1_000_000 - compactionReserve(1_000_000, DEFAULT_ROLLOVER)).toBe(
			240_000,
		);
		expect(compactionReserve(128_000, DEFAULT_ROLLOVER)).toBe(16_384);
	});

	test("the closed session's JSONL is archived out of pi's sight, and the handover note waits on disk", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-rollover-"));
		mkdirSync(dir, { recursive: true });
		const file = join(dir, "2026-10-13T10-00-00-000Z_g1.jsonl");
		writeFileSync(file, "{}\n");
		expect(archiveSession(dir, file)).toBe(
			"archive/2026-10-13T10-00-00-000Z_g1.jsonl",
		);
		expect(existsSync(file)).toBe(false);
		expect(
			existsSync(join(dir, "archive", "2026-10-13T10-00-00-000Z_g1.jsonl")),
		).toBe(true);

		expect(readHandover(dir, "g1")).toBeNull();
		writeHandover(dir, "g1", "Alice wants a villa.");
		expect(readHandover(dir, "g1")).toBe("Alice wants a villa.");
		expect(readHandover(dir, "g2")).toBeNull();
		clearHandover(dir, "g1");
		expect(readHandover(dir, "g1")).toBeNull();
	});
});
