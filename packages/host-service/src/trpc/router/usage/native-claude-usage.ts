import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

export type NativeClaudeWindowId = "five_hour" | "seven_day";
export type NativeClaudeUsageSource = "claude_statusline" | "claude_sdk";
export interface NativeClaudeUsageWindow {
	id: NativeClaudeWindowId;
	usedPercent: number;
	resetsAt: number;
	observedAt: number;
	source: NativeClaudeUsageSource;
}
export interface NativeClaudeUsageInput {
	scope: string;
	launchId: string;
	sessionId: string;
	source: NativeClaudeUsageSource;
	payload: unknown;
	/** Host receipt before queues or asynchronous identity validation. Never provider input. */
	receivedAt: number;
	responseCounter?: number;
	quarantined?: boolean;
}
export const NATIVE_CLAUDE_FRESH_MS = 6 * 60_000;
const MAX_BYTES = 512 * 1024;
const MAX_SCOPES = 128;
const MAX_BINDINGS = 256;
const MAX_AGE_MS = 14 * 24 * 60 * 60_000;
const hash = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const finiteTime = z.number().finite().nonnegative();
const windowSchema = z.object({
	id: z.enum(["five_hour", "seven_day"]),
	usedPercent: z.number().finite().min(0).max(100),
	resetsAt: finiteTime,
	observedAt: finiteTime,
	source: z.enum(["claude_statusline", "claude_sdk"]),
});
const stateSchema = z.object({
	version: z.literal(1),
	scopes: z
		.array(
			z.object({
				key: digest,
				windows: z.array(windowSchema).max(2),
				updatedAt: finiteTime,
			}),
		)
		.max(MAX_SCOPES),
	launches: z
		.array(
			z.object({
				key: digest,
				scope: digest,
				generation: digest.optional(),
				pending: z.boolean().optional(),
				updatedAt: finiteTime,
			}),
		)
		.max(MAX_BINDINGS),
	bindings: z
		.array(
			z.object({
				key: digest,
				counter: finiteTime.nullable(),
				event: digest.nullable(),
				signatures: z.record(z.string(), digest),
				updatedAt: finiteTime,
			}),
		)
		.max(MAX_BINDINGS),
});
type State = z.infer<typeof stateSchema>;
type Reading = Omit<NativeClaudeUsageWindow, "observedAt" | "source">;
function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
function validId(value: string): boolean {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 256 &&
		[...value].every((character) => character.charCodeAt(0) >= 32)
	);
}
function reading(
	id: NativeClaudeWindowId,
	percent: unknown,
	reset: unknown,
	now: number,
): Reading | null {
	if (
		typeof percent !== "number" ||
		!Number.isFinite(percent) ||
		percent < 0 ||
		percent > 100 ||
		typeof reset !== "number" ||
		!Number.isFinite(reset) ||
		reset * 1000 <= now ||
		reset * 1000 > now + 366 * 24 * 60 * 60_000
	)
		return null;
	return { id, usedPercent: percent, resetsAt: reset * 1000 };
}
export function parseNativeClaudeStatusline(
	payload: unknown,
	now: number,
): { counter: number | null; windows: Reading[] } | null {
	const root = object(payload);
	if (!root) return null;
	const cost = object(root.cost);
	const duration = cost?.total_api_duration_ms;
	const counter =
		typeof duration === "number" && Number.isFinite(duration) && duration >= 0
			? duration
			: null;
	const limits = object(root.rate_limits);
	const windows = (["five_hour", "seven_day"] as const).flatMap((id) => {
		const value = object(limits?.[id]);
		const parsed = reading(id, value?.used_percentage, value?.resets_at, now);
		return parsed ? [parsed] : [];
	});
	return { counter, windows };
}
export function parseNativeClaudeSdkUsage(
	payload: unknown,
	now: number,
): { event: string; windows: Reading[] } | null {
	const root = object(payload);
	const info = object(root?.rate_limit_info);
	if (
		root?.type !== "rate_limit_event" ||
		typeof root.uuid !== "string" ||
		!validId(root.uuid) ||
		!info
	)
		return null;
	const windows: Reading[] = [];
	const unified = object(info.unifiedWindows);
	for (const id of ["five_hour", "seven_day"] as const) {
		const value = object(unified?.[id]);
		const utilization = value?.utilization;
		const parsed = reading(
			id,
			typeof utilization === "number" &&
				utilization >= 0 &&
				Number.isFinite(utilization)
				? Math.min(100, utilization * 100)
				: null,
			value?.resetsAt,
			now,
		);
		if (parsed) windows.push(parsed);
	}
	if (
		info.rateLimitType === "five_hour" ||
		info.rateLimitType === "seven_day"
	) {
		const utilization = info.utilization;
		const parsed = reading(
			info.rateLimitType,
			typeof utilization === "number" &&
				utilization >= 0 &&
				Number.isFinite(utilization)
				? Math.min(100, utilization * 100)
				: null,
			info.resetsAt,
			now,
		);
		if (parsed && !windows.some((window) => window.id === parsed.id))
			windows.push(parsed);
	}
	return { event: hash(root.uuid), windows };
}
function secureRead(file: string): string {
	const fd = openSync(
		file,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const stat = fstatSync(fd);
		if (
			!stat.isFile() ||
			stat.nlink !== 1 ||
			stat.size > MAX_BYTES ||
			(process.platform !== "win32" &&
				((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
		)
			throw new Error("Unsafe native usage storage");
		const contents = readFileSync(fd, "utf8");
		if (Buffer.byteLength(contents) > MAX_BYTES)
			throw new Error("Oversized native usage storage");
		return contents;
	} finally {
		closeSync(fd);
	}
}
export function createNativeClaudeUsageStore(
	options: { file?: string; now?: () => number; persist?: boolean } = {},
) {
	const file =
		options.file ??
		join(
			process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset"),
			"state",
			"native-claude-usage.json",
		);
	const now = options.now ?? Date.now;
	let state: State | undefined;
	function load(): State {
		if (state) return state;
		try {
			state = stateSchema.parse(JSON.parse(secureRead(file)));
		} catch {
			state = { version: 1, scopes: [], launches: [], bindings: [] };
		}
		return state;
	}
	function save() {
		if (options.persist === false) return;
		const data = JSON.stringify(stateSchema.parse(load()));
		if (Buffer.byteLength(data) > MAX_BYTES)
			throw new Error("Native usage storage is full");
		mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
		const directory = lstatSync(dirname(file));
		if (
			!directory.isDirectory() ||
			directory.isSymbolicLink() ||
			(process.platform !== "win32" && directory.uid !== process.getuid?.())
		)
			throw new Error("Unsafe native usage directory");
		try {
			secureRead(file);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const temporary = `${file}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, data, { flag: "wx", mode: 0o600 });
			renameSync(temporary, file);
		} finally {
			try {
				unlinkSync(temporary);
			} catch {}
		}
	}
	function prune(at: number) {
		const value = load();
		value.scopes = value.scopes
			.filter(
				(item) => item.updatedAt <= at && at - item.updatedAt <= MAX_AGE_MS,
			)
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, MAX_SCOPES);
		value.launches = value.launches
			.filter(
				(item) => item.updatedAt <= at && at - item.updatedAt <= MAX_AGE_MS,
			)
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, MAX_BINDINGS);
		value.bindings = value.bindings
			.filter(
				(item) => item.updatedAt <= at && at - item.updatedAt <= MAX_AGE_MS,
			)
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, MAX_BINDINGS);
	}
	function validReceipt(receivedAt: number, at: number): boolean {
		return (
			Number.isFinite(at) &&
			at >= 0 &&
			Number.isFinite(receivedAt) &&
			receivedAt >= 0 &&
			receivedAt <= at &&
			at - receivedAt <= NATIVE_CLAUDE_FRESH_MS
		);
	}
	return {
		isCurrentReceipt(receivedAt: number): boolean {
			return validReceipt(receivedAt, now());
		},
		captureLaunch(input: {
			generation: string;
			launchId: string;
			sessionId: string;
		}): boolean {
			if (
				!digest.safeParse(input.generation).success ||
				!validId(input.launchId) ||
				!validId(input.sessionId)
			)
				return false;
			const at = now();
			prune(at);
			const value = load();
			const key = hash(["launch", input.launchId, input.sessionId]);
			const existing = value.launches.find((item) => item.key === key);
			if (existing) return existing.generation === input.generation;
			value.launches.unshift({
				key,
				scope: hash([
					"pending-native-claude-v1",
					input.generation,
					input.launchId,
					input.sessionId,
				]),
				generation: input.generation,
				pending: true,
				updatedAt: at,
			});
			prune(at);
			save();
			return true;
		},
		capturedGeneration(input: {
			launchId: string;
			sessionId: string;
		}): string | null {
			if (!validId(input.launchId) || !validId(input.sessionId)) return null;
			const at = now();
			const launch = load().launches.find(
				(item) =>
					item.key === hash(["launch", input.launchId, input.sessionId]),
			);
			return launch?.generation &&
				launch.updatedAt <= at &&
				at - launch.updatedAt <= MAX_AGE_MS
				? launch.generation
				: null;
		},
		activeScope(input: {
			generation: string;
			launchId: string;
			sessionId: string;
		}): { scope: string; pending: boolean } | null {
			if (!digest.safeParse(input.generation).success) return null;
			const value = load().launches.find(
				(item) =>
					item.key === hash(["launch", input.launchId, input.sessionId]) &&
					item.generation === input.generation,
			);
			return value
				? { scope: value.scope, pending: value.pending === true }
				: null;
		},
		promoteLaunch(input: {
			generation: string;
			scope: string;
			launchId: string;
			sessionId: string;
		}): boolean {
			if (
				!digest.safeParse(input.generation).success ||
				!digest.safeParse(input.scope).success
			)
				return false;
			const at = now();
			prune(at);
			const value = load();
			const launch = value.launches.find(
				(item) =>
					item.key === hash(["launch", input.launchId, input.sessionId]) &&
					item.generation === input.generation,
			);
			if (!launch) return false;
			if (!launch.pending) return launch.scope === input.scope;
			const from = launch.scope;
			for (const source of ["claude_statusline", "claude_sdk"] as const) {
				const previousKey = hash([
					from,
					input.launchId,
					input.sessionId,
					source,
				]);
				const binding = value.bindings.find((item) => item.key === previousKey);
				if (binding)
					binding.key = hash([
						input.scope,
						input.launchId,
						input.sessionId,
						source,
					]);
			}
			const pending = value.scopes.find((item) => item.key === from);
			if (pending) {
				let target = value.scopes.find((item) => item.key === input.scope);
				if (!target) {
					target = {
						key: input.scope,
						windows: [],
						updatedAt: pending.updatedAt,
					};
					value.scopes.unshift(target);
				}
				for (const window of pending.windows) {
					const previous = target.windows.find((item) => item.id === window.id);
					const previousEpoch = Math.floor(
						(previous?.resetsAt ?? Number.NaN) / 1000,
					);
					const nextEpoch = Math.floor(window.resetsAt / 1000);
					if (
						window.observedAt > at ||
						window.resetsAt <= at ||
						(previous &&
							(previous.observedAt > window.observedAt ||
								previousEpoch > nextEpoch ||
								(previousEpoch === nextEpoch &&
									previous.usedPercent > window.usedPercent)))
					)
						continue;
					target.windows = [
						...target.windows.filter((item) => item.id !== window.id),
						{
							...window,
							resetsAt:
								previous && previousEpoch === nextEpoch
									? Math.max(previous.resetsAt, window.resetsAt)
									: window.resetsAt,
						},
					];
					target.updatedAt = Math.max(target.updatedAt, pending.updatedAt);
				}
				value.scopes = value.scopes.filter((item) => item.key !== from);
			}
			launch.scope = input.scope;
			launch.pending = false;
			save();
			return true;
		},
		bindLaunch(input: {
			scope: string;
			launchId: string;
			sessionId: string;
		}): boolean {
			if (
				!digest.safeParse(input.scope).success ||
				!validId(input.launchId) ||
				!validId(input.sessionId)
			)
				return false;
			const at = now();
			prune(at);
			const value = load();
			const key = hash(["launch", input.launchId, input.sessionId]);
			const existing = value.launches.find((item) => item.key === key);
			if (existing) return existing.scope === input.scope;
			value.launches.unshift({ key, scope: input.scope, updatedAt: at });
			prune(at);
			save();
			return true;
		},
		hasLaunch(input: {
			scope: string;
			launchId: string;
			sessionId: string;
		}): boolean {
			return (
				digest.safeParse(input.scope).success &&
				load().launches.some(
					(item) =>
						item.key === hash(["launch", input.launchId, input.sessionId]) &&
						item.scope === input.scope,
				)
			);
		},
		ingest(input: NativeClaudeUsageInput): boolean {
			const at = now();
			if (
				!validReceipt(input.receivedAt, at) ||
				!digest.safeParse(input.scope).success ||
				!validId(input.launchId) ||
				!validId(input.sessionId)
			)
				return false;
			const parsed =
				input.source === "claude_statusline"
					? parseNativeClaudeStatusline(input.payload, at)
					: parseNativeClaudeSdkUsage(input.payload, at);
			if (!parsed || !Number.isFinite(at) || at < 0) return false;
			prune(at);
			const value = load();
			if (
				!value.launches.some(
					(item) =>
						item.key === hash(["launch", input.launchId, input.sessionId]) &&
						item.scope === input.scope,
				)
			)
				return false;
			const key = hash([
				input.scope,
				input.launchId,
				input.sessionId,
				input.source,
			]);
			let binding = value.bindings.find((item) => item.key === key);
			const previous = binding;
			if (previous && previous.updatedAt > input.receivedAt) return false;
			const counter =
				"counter" in parsed
					? parsed.counter
					: typeof input.responseCounter === "number" &&
							Number.isFinite(input.responseCounter) &&
							input.responseCounter >= 0
						? input.responseCounter
						: null;
			const event = "event" in parsed ? parsed.event : null;
			if (
				counter === null ||
				(previous?.counter !== null &&
					previous?.counter !== undefined &&
					counter < previous.counter)
			)
				return false;
			const signatures = Object.fromEntries(
				parsed.windows.map((window) => [window.id, hash(window)]),
			);
			if (!binding) {
				binding = {
					key,
					counter,
					event,
					signatures,
					updatedAt: input.receivedAt,
				};
				value.bindings.unshift(binding);
			}
			const advanced =
				!!previous &&
				counter !== null &&
				previous.counter !== null &&
				counter > previous.counter;
			const windows = parsed.windows.filter(
				(window) =>
					advanced &&
					(input.source === "claude_statusline" ||
						previous?.signatures[window.id] !== signatures[window.id]),
			);
			const baselineChanged =
				binding.counter !== counter ||
				JSON.stringify(binding.signatures) !== JSON.stringify(signatures);
			if (baselineChanged || !previous)
				Object.assign(binding, {
					counter,
					event,
					signatures,
					updatedAt: input.receivedAt,
				});
			let applied = false;
			if (windows.length) {
				let scope = value.scopes.find((item) => item.key === input.scope);
				if (!scope) {
					scope = {
						key: input.scope,
						windows: [],
						updatedAt: input.receivedAt,
					};
					value.scopes.unshift(scope);
				}
				for (const window of windows) {
					const existing = scope.windows.find((item) => item.id === window.id);
					const existingEpoch = Math.floor(
						(existing?.resetsAt ?? Number.NaN) / 1000,
					);
					const nextEpoch = Math.floor(window.resetsAt / 1000);
					if (
						existing &&
						(existing.observedAt > input.receivedAt ||
							existingEpoch > nextEpoch ||
							(existingEpoch === nextEpoch &&
								existing.usedPercent > window.usedPercent))
					)
						continue;
					applied = true;
					scope.windows = [
						...scope.windows.filter((item) => item.id !== window.id),
						{
							...window,
							resetsAt:
								existing && existingEpoch === nextEpoch
									? Math.max(existing.resetsAt, window.resetsAt)
									: window.resetsAt,
							observedAt: input.receivedAt,
							source: input.source,
						},
					];
				}
				if (applied)
					scope.updatedAt = Math.max(scope.updatedAt, input.receivedAt);
			}
			prune(at);
			if (windows.length || baselineChanged || !previous) save();
			return applied;
		},
		snapshot(scope: string): NativeClaudeUsageWindow[] {
			if (!digest.safeParse(scope).success) return [];
			const at = now();
			return (
				load()
					.scopes.find((item) => item.key === scope)
					?.windows.filter(
						(window) =>
							window.observedAt <= at &&
							at - window.observedAt <= MAX_AGE_MS &&
							window.resetsAt > at,
					)
					.map((window) => ({ ...window })) ?? []
			);
		},
		forget(scope: string): void {
			const value = load();
			value.scopes = value.scopes.filter((item) => item.key !== scope);
			save();
		},
	};
}
const listeners = new Set<() => void>();
export function onNativeClaudeUsage(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
const store = createNativeClaudeUsageStore();
export const nativeClaudeUsage = {
	...store,
	promoteLaunch(input: Parameters<typeof store.promoteLaunch>[0]): boolean {
		const before = store.activeScope(input);
		const promoted = store.promoteLaunch(input);
		if (promoted && before?.pending && store.snapshot(input.scope).length)
			emitNativeClaudeUsage();
		return promoted;
	},
	ingest(input: NativeClaudeUsageInput): boolean {
		const changed = store.ingest(input);
		if (changed && !input.quarantined) emitNativeClaudeUsage();
		return changed;
	},
};
function emitNativeClaudeUsage(): void {
	for (const listener of listeners) {
		try {
			listener();
		} catch {}
	}
}
