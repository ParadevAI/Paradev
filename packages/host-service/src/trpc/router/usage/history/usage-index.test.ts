import { describe, expect, test } from "bun:test";
import type { CollectedUsage } from "./entries";
import type { UsageLogEntry } from "./parse";
import { type ScanUsage, UsageIndex, UsageIndexingError } from "./usage-index";

const NOW = Date.UTC(2026, 10, 7, 12);
const DAY = 24 * 60 * 60 * 1000;

function entry(timestampMs: number): UsageLogEntry {
	return {
		agent: "claude",
		model: "claude-opus-5-5",
		timestampMs,
		cwd: null,
		sessionId: "s",
		uncachedInput: 1,
		cachedInput: 0,
		cacheWrite5m: 0,
		cacheWrite1h: 0,
		output: 1,
		reasoningOutput: 0,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function collected(entries: UsageLogEntry[]): CollectedUsage {
	return { entries, sessionLabels: new Map(), scannedFiles: 1 };
}

describe("UsageIndex", () => {
	test("concurrent reads share one scan and each gets its own window", async () => {
		let scans = 0;
		const collect: ScanUsage = async () => {
			scans++;
			return collected([entry(NOW - 10 * DAY), entry(NOW - DAY)]);
		};
		const index = new UsageIndex(collect, () => NOW);
		const [week, month] = await Promise.all([
			index.read(NOW - 7 * DAY, 1000),
			index.read(NOW - 30 * DAY, 1000),
		]);
		expect(scans).toBe(1);
		expect(week.entries).toHaveLength(1);
		expect(month.entries).toHaveLength(2);
	});

	test("a cold scan that outlasts the wait fails the read but keeps running", async () => {
		const scan = deferred<CollectedUsage>();
		let scans = 0;
		const collect: ScanUsage = () => {
			scans++;
			return scan.promise;
		};
		const index = new UsageIndex(collect, () => NOW);

		await expect(index.read(NOW - DAY, 5)).rejects.toBeInstanceOf(
			UsageIndexingError,
		);
		scan.resolve(collected([entry(NOW - 1000)]));
		expect((await index.read(NOW - DAY, 1000)).entries).toHaveLength(1);
		expect(scans).toBe(1);
	});

	test("a slow refresh serves the last snapshot instead of failing", async () => {
		let now = NOW;
		let next = deferred<CollectedUsage>();
		next.resolve(collected([entry(NOW - 1000)]));
		const collect: ScanUsage = () => next.promise;
		const index = new UsageIndex(collect, () => now);
		await index.read(NOW - DAY, 1000);

		now += 60_000;
		next = deferred<CollectedUsage>();
		const stale = await index.read(NOW - DAY, 5);
		expect(stale.entries).toHaveLength(1);
		next.resolve(collected([entry(NOW - 1000), entry(NOW - 500)]));
		expect((await index.read(NOW - DAY, 1000)).entries).toHaveLength(2);
	});
});
