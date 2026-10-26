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
			receivedAt: f.time(),
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
			receivedAt: f.time(),
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(true);
	const measured = f.store.snapshot(f.identity.scope);
	f.advance();
	expect(
		f.store.ingest({
			receivedAt: f.time(),
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(measured);
	expect(
		f.store.ingest({
			receivedAt: f.time(),
			...f.identity,
			source: "claude_statusline",
			payload: initial,
		}),
	).toBe(false);
	expect(
		f.store.ingest({
			receivedAt: f.time(),
			...f.identity,
			source: "claude_statusline",
			payload: response,
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(measured);
	f.store.ingest({
		receivedAt: f.time(),
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
		receivedAt: f.time(),
		...f.identity,
		source: "claude_statusline",
		payload: { cost: { total_api_duration_ms: 0 } },
	});
	const response = f.frame(1);
	f.advance();
	f.store.ingest({
		receivedAt: f.time(),
		...f.identity,
		source: "claude_statusline",
		payload: response,
	});
	const before = f.store.snapshot(f.identity.scope);
	f.advance();
	const reopened = createNativeClaudeUsageStore({ file: f.file, now: f.time });
	expect(
		reopened.ingest({
			receivedAt: f.time(),
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
				receivedAt: f.time(),
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
			receivedAt: f.time(),
			...f.identity,
			source: "claude_sdk",
			responseCounter: 0,
			payload: initial,
		}),
	).toBe(false);
	f.advance();
	expect(
		f.store.ingest({
			receivedAt: f.time(),
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
			receivedAt: f.time(),
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
			receivedAt: f.time(),
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
		receivedAt: f.time(),
		...f.identity,
		source: "claude_statusline",
		payload: f.frame(0),
	});
	f.store.ingest({
		receivedAt: f.time(),
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
			receivedAt: f.time(),
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
			receivedAt: f.time(),
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
		receivedAt: f.time(),
		...launch,
		scope: pending.scope,
		source: "claude_statusline",
		payload: f.frame(0),
	});
	f.advance();
	f.store.ingest({
		receivedAt: f.time(),
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
			receivedAt: f.time(),
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
		receivedAt: f.time(),
		...f.identity,
		source: "claude_statusline",
		payload: initial,
	});
	f.store.ingest({
		receivedAt: f.time(),
		...f.identity,
		source: "claude_statusline",
		payload: f.frame(1, 30),
	});
	const before = f.store.snapshot(f.identity.scope);
	f.advance();
	const lower = { ...initial, cost: { total_api_duration_ms: 2 } };
	f.store.ingest({
		receivedAt: f.time(),
		...f.identity,
		source: "claude_statusline",
		payload: lower,
	});
	expect(f.store.snapshot(f.identity.scope)).toEqual(before);
});

test("delayed validation retains the trusted receipt instead of the processing clock", () => {
	const f = fixture();
	f.store.ingest({
		...f.identity,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: f.frame(0),
	});
	f.advance();
	const receivedAt = f.time();
	const payload = f.frame(1, 35);
	f.advance(45_000);
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt,
			source: "claude_statusline",
			payload,
		}),
	).toBe(true);
	expect(f.store.snapshot(f.identity.scope)[0]?.observedAt).toBe(receivedAt);
	expect(f.store.snapshot(f.identity.scope)[0]?.observedAt).not.toBe(f.time());
});

test("missing, invalid, future or expired receipts never alter the response baseline", () => {
	const f = fixture();
	f.store.ingest({
		...f.identity,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: f.frame(0),
	});
	for (const receivedAt of [
		undefined,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		-1,
		f.time() + 1,
		f.time() - 6 * 60_000 - 1,
	]) {
		expect(
			f.store.ingest({
				...f.identity,
				receivedAt: receivedAt as number,
				source: "claude_statusline",
				payload: f.frame(100, 90),
			}),
		).toBe(false);
	}
	expect(f.store.snapshot(f.identity.scope)).toEqual([]);
	f.advance();
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt: f.time(),
			source: "claude_statusline",
			payload: f.frame(1, 30),
		}),
	).toBe(true);
	expect(f.store.snapshot(f.identity.scope)[0]?.usedPercent).toBe(30);
});

test("six-minute receipt boundary is inclusive; an older receipt cannot move the baseline", () => {
	const f = fixture();
	const first = f.time();
	const payload = {
		cost: { total_api_duration_ms: 1 },
		rate_limits: {
			five_hour: {
				used_percentage: 25,
				resets_at: (first + 60 * 60_000) / 1000,
			},
		},
	};
	f.store.ingest({
		...f.identity,
		receivedAt: first,
		source: "claude_statusline",
		payload: { cost: { total_api_duration_ms: 0 } },
	});
	f.advance(6 * 60_000);
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt: first,
			source: "claude_statusline",
			payload,
		}),
	).toBe(true);
	expect(f.store.snapshot(f.identity.scope)[0]?.observedAt).toBe(first);
	f.advance(1);
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt: first,
			source: "claude_statusline",
			payload: { ...payload, cost: { total_api_duration_ms: 100 } },
		}),
	).toBe(false);
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt: f.time(),
			source: "claude_statusline",
			payload: { ...payload, cost: { total_api_duration_ms: 2 } },
		}),
	).toBe(true);
	expect(f.store.snapshot(f.identity.scope)[0]?.observedAt).toBe(f.time());
});

test("out-of-order receipt cannot overwrite newer quota or consume a later response counter", () => {
	const f = fixture();
	const frame = f.frame(0);
	f.store.ingest({
		...f.identity,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: frame,
	});
	f.advance(2000);
	f.store.ingest({
		...f.identity,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: { ...frame, cost: { total_api_duration_ms: 2 } },
	});
	const before = f.store.snapshot(f.identity.scope);
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt: f.time() - 1000,
			source: "claude_statusline",
			payload: { ...frame, cost: { total_api_duration_ms: 3 } },
		}),
	).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(before);
	f.advance();
	expect(
		f.store.ingest({
			...f.identity,
			receivedAt: f.time(),
			source: "claude_statusline",
			payload: { ...frame, cost: { total_api_duration_ms: 3 } },
		}),
	).toBe(true);
});

const resetPrecisionCases = [
	["same second with 213ms HTTP precision", 213, 0, 30, true, 213],
	["same second with higher usage", 213, 0, 31, true, 213],
	["same second with lower usage", 0, 213, 29, false, 0],
	["earlier second with higher usage", 0, -1000, 99, false, 0],
	["later second with lower usage", 0, 1000, 1, true, 1000],
	["one millisecond into a later second", 999, 1000, 1, true, 1000],
	["one millisecond into the previous second", 1000, 999, 99, false, 1000],
] as const;

function precisionFrame(
	counter: number,
	usedPercent: number,
	resetsAt: number,
) {
	return {
		cost: { total_api_duration_ms: counter },
		rate_limits: {
			five_hour: { used_percentage: usedPercent, resets_at: resetsAt / 1000 },
		},
	};
}
test.each(
	resetPrecisionCases,
)("live native reset precision: %s", (_name, previousOffset, nextOffset, usedPercent, accepted, keptOffset) => {
	const f = fixture();
	const reset = f.time() + 120_000;
	const ingest = (
		counter: number,
		used: number,
		at: number,
		receivedAt = f.time(),
	) =>
		f.store.ingest({
			...f.identity,
			receivedAt,
			source: "claude_statusline",
			payload: precisionFrame(counter, used, at),
		});
	ingest(0, 30, reset + previousOffset);
	f.advance();
	expect(ingest(1, 30, reset + previousOffset)).toBe(true);
	const previousObservedAt = f.time();
	f.advance();
	expect(ingest(2, usedPercent, reset + nextOffset)).toBe(accepted);
	const current = f.store.snapshot(f.identity.scope);
	expect(current[0]?.resetsAt).toBe(reset + keptOffset);
	expect(current[0]?.usedPercent).toBe(accepted ? usedPercent : 30);
	expect(current[0]?.observedAt).toBe(accepted ? f.time() : previousObservedAt);
	f.advance();
	expect(ingest(2, usedPercent, reset + nextOffset)).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(current);
});
test.each(
	resetPrecisionCases,
)("pending native promotion preserves reset precision and original age: %s", (_name, previousOffset, nextOffset, usedPercent, accepted, keptOffset) => {
	const f = fixture();
	const reset = f.time() + 120_000;
	f.store.ingest({
		...f.identity,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: precisionFrame(0, 30, reset + previousOffset),
	});
	f.advance();
	f.store.ingest({
		...f.identity,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: precisionFrame(1, 30, reset + previousOffset),
	});
	const previousObservedAt = f.time();
	const launch = {
		launchId: "precision-pending",
		sessionId: "pending-session",
		generation: "c".repeat(64),
	};
	f.store.captureLaunch(launch);
	const pending = f.store.activeScope(launch);
	if (!pending) throw new Error("missing pending launch");
	f.store.ingest({
		...launch,
		scope: pending.scope,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: precisionFrame(0, usedPercent, reset + nextOffset),
	});
	f.advance();
	f.store.ingest({
		...launch,
		scope: pending.scope,
		receivedAt: f.time(),
		source: "claude_statusline",
		payload: precisionFrame(1, usedPercent, reset + nextOffset),
	});
	const pendingObservedAt = f.time();
	f.advance();
	expect(f.store.promoteLaunch({ ...launch, scope: f.identity.scope })).toBe(
		true,
	);
	const current = f.store.snapshot(f.identity.scope);
	expect(current[0]?.resetsAt).toBe(reset + keptOffset);
	expect(current[0]?.usedPercent).toBe(accepted ? usedPercent : 30);
	expect(current[0]?.observedAt).toBe(
		accepted ? pendingObservedAt : previousObservedAt,
	);
	expect(current[0]?.observedAt).not.toBe(f.time());
	expect(current[0]?.source).toBe("claude_statusline");
});
test("same-second reset precision cannot freshen stale or equal-counter receipts", () => {
	const f = fixture();
	const reset = f.time() + 120_000;
	const ingest = (counter: number, resetsAt: number, receivedAt = f.time()) =>
		f.store.ingest({
			...f.identity,
			receivedAt,
			source: "claude_statusline",
			payload: precisionFrame(counter, 30, resetsAt),
		});
	ingest(0, reset + 213);
	f.advance();
	ingest(1, reset + 213);
	const measured = f.store.snapshot(f.identity.scope);
	const observedAt = f.time();
	f.advance();
	expect(ingest(2, reset, observedAt - 1)).toBe(false);
	expect(ingest(1, reset, observedAt)).toBe(false);
	expect(f.store.snapshot(f.identity.scope)).toEqual(measured);
	expect(ingest(2, reset)).toBe(true);
	expect(f.store.snapshot(f.identity.scope)[0]?.resetsAt).toBe(reset + 213);
	expect(f.store.snapshot(f.identity.scope)[0]?.observedAt).toBe(f.time());
});

test("captured generation lookup refuses expired or future-dated launch records", () => {
	const f = fixture();
	const launch = { launchId: "captured-launch", sessionId: "captured-session" };
	expect(f.store.captureLaunch({ ...launch, generation: "b".repeat(64) })).toBe(
		true,
	);
	expect(f.store.capturedGeneration(launch)).toBe("b".repeat(64));
	f.advance(-1);
	expect(f.store.capturedGeneration(launch)).toBeNull();
	f.advance(14 * 24 * 60 * 60_000 + 2);
	expect(f.store.capturedGeneration(launch)).toBeNull();
	expect(
		f.store.capturedGeneration({ ...launch, sessionId: "foreign" }),
	).toBeNull();
});
