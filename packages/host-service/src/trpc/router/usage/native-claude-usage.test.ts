import { afterEach, expect, test } from "bun:test";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createNativeClaudeUsageStore,
	parseNativeClaudeSdkUsage,
} from "./native-claude-usage";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});
function fixture() {
	const directory = mkdtempSync(join(tmpdir(), "native-usage-"));
	directories.push(directory);
	let now = 1_800_000_000_000;
	const file = join(directory, "native.json");
	const store = createNativeClaudeUsageStore({ file, now: () => now });
	const identity = {
		scope: "a".repeat(64),
		launchId: "owned-launch",
		sessionId: "owned-session",
	};
	store.bindLaunch(identity);
	const frame = (counter: number, five = 10, weekly?: number) => ({
		cost: { total_api_duration_ms: counter },
		rate_limits: {
			five_hour: { used_percentage: five, resets_at: (now + 60_000) / 1000 },
			...(weekly === undefined
				? {}
				: {
						seven_day: {
							used_percentage: weekly,
							resets_at: (now + 120_000) / 1000,
						},
					}),
		},
	});
	return {
		directory,
		file,
		store,
		identity,
		frame,
		time: () => now,
		advance: (ms = 1000) => {
			now += ms;
		},
	};
}
test("first statusline frame is a baseline; API progress updates only supplied windows", () => {
	const f = fixture();
	const initial = f.frame(10, 20, 30);
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: initial,
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual([]);
	f.advance();
	const response = f.frame(11, 21, 31);
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(true);
	const measured = f.store.snapshot(f.identity.scope);
	f.advance();
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(measured);
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: initial,
		}),
	).toBe(false);
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(measured);
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: f.frame(12, 21),
	});
	expect(
		f.store
			.snapshot(f.identity.scope)
			.find((window) => window.id === "seven_day")?.observedAt,
	).toBe(measured.find((window) => window.id === "seven_day")?.observedAt);
	expect(
		f.store
			.snapshot(f.identity.scope)
			.find((window) => window.id === "five_hour")?.observedAt,
	).toBe(f.time());
});
test("startup without quota seeds the first real response and persisted replays keep original age", () => {
	const f = fixture();
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: { cost: { total_api_duration_ms: 0 } },
	});
	const response = f.frame(1);
	f.advance();
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: response,
	});
	const before = f.store.snapshot(f.identity.scope);
	f.advance();
	const reopened = createNativeClaudeUsageStore({ file: f.file, now: f.time });
	expect(
		reopened.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(false);
	expect(reopened.snapshot(f.identity.scope)).toEqual(before);
	expect(statSync(f.file).mode & 0o777).toBe(0o600);
	const serialized = readFileSync(f.file, "utf8");
	expect(serialized).not.toContain("owned-launch");
	expect(serialized).not.toContain("owned-session");
});
test("launch identity cannot be retargeted after sign-in changes and unknown generations are rejected", () => {
	const f = fixture();
	expect(f.store.bindLaunch({ ...f.identity, scope: "b".repeat(64) })).toBe(
		false,
	);
	for (const change of [
		{ scope: "b".repeat(64) },
		{ launchId: "other" },
		{ sessionId: "other" },
	]) {
		expect(
			f.store.ingest({
				...f.identity,
				...change,
				source: "claude_statusline",
				payload: f.frame(1),
			}),
		).toBe(false);
	}
	expect(f.store.snapshot("b".repeat(64))).toEqual([]);
});
test("SDK restored state and unchanged UUID replays do not establish a new measurement", () => {
	const f = fixture();
	const event = (uuid: string, used = 0.2) => ({
		type: "rate_limit_event",
		uuid,
		rate_limit_info: {
			status: "allowed",
			rateLimitType: "five_hour",
			utilization: used,
			resetsAt: (f.time() + 60_000) / 1000,
		},
	});
	const initial = event("cached");
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_sdk",
			responseCounter: 0,
			payload: initial,
		}),
	).toBe(false);
	f.advance();
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_sdk",
			responseCounter: 0,
			payload: event("new-id", 0.3),
		}),
	).toBe(false);
	f.advance();
	const fresh = event("response", 0.4);
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_sdk",
			responseCounter: 1,
			payload: fresh,
		}),
	).toBe(true);
	const before = f.store.snapshot(f.identity.scope);
	f.advance();
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_sdk",
			responseCounter: 1,
			payload: fresh,
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(before);
});
test("partial SDK fields never turn status or spend limits into subscription percentages", () => {
	const f = fixture();
	const parsed = parseNativeClaudeSdkUsage(
		{
			type: "rate_limit_event",
			uuid: "event",
			rate_limit_info: {
				status: "rejected",
				rateLimitType: "overage",
				utilization: 1,
				resetsAt: (f.time() + 60_000) / 1000,
				overageDisabledReason: "out_of_credits",
			},
		},
		f.time(),
	);
	expect(parsed?.windows).toEqual([]);
	expect(
		parseNativeClaudeSdkUsage(
			{
				type: "rate_limit_event",
				uuid: "event",
				rate_limit_info: {
					status: "allowed_warning",
					rateLimitType: "five_hour",
				},
			},
			f.time(),
		)?.windows,
	).toEqual([]);
});
test("expired windows, missing response markers and backwards clocks are never current quota", () => {
	const f = fixture();
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: f.frame(0),
	});
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: f.frame(1),
	});
	f.advance(61_000);
	expect(f.store.snapshot(f.identity.scope)).toEqual([]);
	const unmarked = {
		rate_limits: {
			five_hour: { used_percentage: 1, resets_at: (f.time() + 60_000) / 1000 },
		},
	};
	expect(
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: unmarked,
		}),
	).toBe(false);
});
test("private persistence refuses a symlink destination and never follows it", () => {
	const f = fixture();
	const target = join(f.directory, "target");
	writeFileSync(target, "sentinel");
	rmSync(f.file);
	symlinkSync(target, f.file);
	expect(() =>
		f.store.ingest({
			...f.identity,
			source: "claude_statusline",
			payload: f.frame(0),
		}),
	).toThrow();
	expect(readFileSync(target, "utf8")).toBe("sentinel");
});

test("pending measurements survive host restart and promotion does not relabel their age", () => {
	const f = fixture();
	const launch = {
		launchId: "new-owned-launch",
		sessionId: "new-owned-session",
		generation: "c".repeat(64),
	};
	f.store.captureLaunch(launch);
	const pending = f.store.activeScope(launch);
	expect(pending?.pending).toBe(true);
	if (!pending) throw new Error("missing captured generation");
	f.store.ingest({
		...launch,
		scope: pending.scope,
		source: "claude_statusline",
		payload: f.frame(0),
	});
	f.advance();
	f.store.ingest({
		...launch,
		scope: pending.scope,
		source: "claude_statusline",
		payload: f.frame(1),
	});
	const observedAt = f.time();
	f.advance();
	const restarted = createNativeClaudeUsageStore({ file: f.file, now: f.time });
	const scope = "d".repeat(64);
	expect(restarted.promoteLaunch({ ...launch, scope })).toBe(true);
	expect(restarted.snapshot(scope)[0]?.observedAt).toBe(observedAt);
	expect(
		restarted.ingest({
			...launch,
			scope,
			source: "claude_statusline",
			payload: f.frame(1),
		}),
	).toBe(false);
	expect(restarted.snapshot(scope)[0]?.observedAt).toBe(observedAt);
});
test("late lower readings in the same reset epoch cannot erase newer utilization", () => {
	const f = fixture();
	const initial = f.frame(0, 20);
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: initial,
	});
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: f.frame(1, 30),
	});
	const before = f.store.snapshot(f.identity.scope);
	f.advance();
	const lower = { ...initial, cost: { total_api_duration_ms: 2 } };
	f.store.ingest({
		...f.identity,
		source: "claude_statusline",
		payload: lower,
	});
	expect(f.store.snapshot(f.identity.scope)).toEqual(before);
});
