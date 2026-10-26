import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";

const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 1024;
const TIMEOUT_MS = 1500;
const SESSION_ID =
	/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const BACKGROUND_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export interface ClaudeBackgroundSession {
	id: string;
	name?: string;
	sessionId?: string;
	cwd: string;
	startedAt: number;
	state: "working" | "blocked" | "done" | "failed" | "stopped";
	pid?: number;
	status?: "busy" | "waiting" | "idle";
	waitingFor?: string;
}
export interface ClaudeBackgroundSessionTarget {
	sessionId: string;
	configDir: string;
	worktreePath: string;
	backgroundId?: string;
}
export interface ClaudeBackgroundWorkerProof {
	pid: number;
	birth: string;
	executable: string;
	configDir: string;
	worktreePath: string;
	sessionId: string;
	backgroundId: string;
}
export interface ClaudeBackgroundDiscoveryRequest {
	args: readonly ["agents", "--json", "--cwd", string];
	configDir: string;
	cwd: string;
	timeoutMs: number;
	maxBuffer: number;
	signal: AbortSignal;
}
export interface ClaudeBackgroundSessionDeps {
	runDiscovery: (request: ClaudeBackgroundDiscoveryRequest) => Promise<string>;
	validateScope: (
		target: Readonly<ClaudeBackgroundSessionTarget>,
		signal: AbortSignal,
	) => Promise<boolean>;
	verifyWorker: (
		expected: Readonly<
			ClaudeBackgroundSessionTarget & { backgroundId: string; pid: number }
		>,
		signal: AbortSignal,
	) => Promise<ClaudeBackgroundWorkerProof | null>;
	canonicalize?: (path: string) => Promise<string>;
	now?: () => number;
	signal?: AbortSignal;
	schedule?: (callback: () => void, delay: number) => () => void;
}
export interface ClaudeBackgroundAttachProof {
	candidate: Readonly<ClaudeBackgroundSession>;
	target: Readonly<ClaudeBackgroundSessionTarget>;
	workerBefore: Readonly<ClaudeBackgroundWorkerProof>;
	workerAfter: Readonly<ClaudeBackgroundWorkerProof>;
	attachArgs: readonly ["attach", string];
	observedAt: number;
	nonAtomicAttach: true;
}
function refuse(): never {
	throw new Error(
		"The live Claude background session could not be verified. Nothing was attached.",
	);
}
function hasControlCharacters(value: string) {
	return [...value].some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}
function path(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 4096 &&
		isAbsolute(value) &&
		!hasControlCharacters(value)
	);
}
function pid(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isSafeInteger(value) &&
		value > 0 &&
		value <= 2_147_483_647
	);
}
function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
export function parseClaudeBackgroundSessions(
	stdout: string,
): ClaudeBackgroundSession[] {
	if (Buffer.byteLength(stdout, "utf8") > MAX_BYTES) return refuse();
	let rows: unknown;
	try {
		rows = JSON.parse(stdout);
	} catch {
		return refuse();
	}
	if (!Array.isArray(rows) || rows.length > MAX_ROWS) return refuse();
	const result: ClaudeBackgroundSession[] = [];
	const ids = new Set<string>();
	for (const row of rows) {
		if (!record(row)) return refuse();
		if (row.kind === "interactive") continue;
		if (
			row.kind !== "background" ||
			typeof row.id !== "string" ||
			!BACKGROUND_ID.test(row.id) ||
			ids.has(row.id) ||
			!path(row.cwd) ||
			!Number.isSafeInteger(row.startedAt) ||
			(row.startedAt as number) < 0 ||
			!["working", "blocked", "done", "failed", "stopped"].includes(
				row.state as string,
			)
		)
			return refuse();
		if (
			row.sessionId != null &&
			(typeof row.sessionId !== "string" || !SESSION_ID.test(row.sessionId))
		)
			return refuse();
		if (row.pid != null && !pid(row.pid)) return refuse();
		if (
			row.status != null &&
			!["busy", "waiting", "idle"].includes(row.status as string)
		)
			return refuse();
		if (
			row.name != null &&
			(typeof row.name !== "string" ||
				!row.name.trim() ||
				row.name.length > 256 ||
				hasControlCharacters(row.name))
		)
			return refuse();
		ids.add(row.id);
		result.push({
			id: row.id,
			...(row.name == null ? {} : { name: row.name as string }),
			cwd: row.cwd,
			startedAt: row.startedAt as number,
			state: row.state as ClaudeBackgroundSession["state"],
			...(typeof row.waitingFor === "string" &&
			[
				"permission prompt",
				"input needed",
				"sandbox request",
				"worker request",
				"dialog open",
			].includes(row.waitingFor)
				? { waitingFor: row.waitingFor }
				: {}),
			...(row.sessionId == null ? {} : { sessionId: row.sessionId as string }),
			...(row.pid == null ? {} : { pid: row.pid as number }),
			...(row.status == null
				? {}
				: { status: row.status as ClaudeBackgroundSession["status"] }),
		});
	}
	return result;
}

export function supportsLiveClaudeAttachment(version: string): boolean {
	const match = /^2\.1\.(\d+) \(Claude Code\)$/.exec(version.trim());
	const patch = Number(match?.[1]);
	return !!match && patch >= 290 && patch <= 310;
}

/** Names use the provider's live-only lookup; IDs are never substituted. */
export function liveClaudeAttachmentName(
	stdout: string,
	target: Readonly<ClaudeBackgroundSession>,
	version: string,
): string {
	if (!supportsLiveClaudeAttachment(version)) return refuse();
	const rows = parseClaudeBackgroundSessions(stdout);
	const found = rows.filter((row) => row.id === target.id);
	const current = found[0];
	if (
		found.length !== 1 ||
		!current ||
		current.sessionId !== target.sessionId ||
		current.pid !== target.pid ||
		current.cwd !== target.cwd ||
		current.startedAt !== target.startedAt ||
		current.state === "failed" ||
		current.state === "stopped" ||
		!current.status ||
		!current.name ||
		current.name !== current.name.trim() ||
		current.name.startsWith("-") ||
		/^[a-f0-9-]+$/i.test(current.name) ||
		/^[a-f0-9]{8}/i.test(current.name)
	)
		return refuse();
	const name = current.name;
	const rawRows: unknown = JSON.parse(stdout);
	if (!Array.isArray(rawRows)) return refuse();
	const matches = rawRows.filter((row) => {
		if (record(row) && row.kind === "interactive" && row.name == null)
			return false;
		if (
			!record(row) ||
			typeof row.name !== "string" ||
			!row.name.trim() ||
			hasControlCharacters(row.name)
		)
			return refuse();
		return row.name.toLowerCase().includes(name.toLowerCase());
	});
	if (
		matches.length !== 1 ||
		!record(matches[0]) ||
		matches[0].id !== current.id
	)
		return refuse();
	return name;
}

export async function discoverClaudeBackgroundSession(
	input: ClaudeBackgroundSessionTarget,
	deps: ClaudeBackgroundSessionDeps,
): Promise<ClaudeBackgroundAttachProof | null> {
	const original = Object.freeze({ ...input });
	if (
		!SESSION_ID.test(original.sessionId) ||
		!path(original.configDir) ||
		!path(original.worktreePath) ||
		(original.backgroundId !== undefined &&
			!BACKGROUND_ID.test(original.backgroundId))
	)
		return refuse();
	const controller = new AbortController();
	const signal = deps.signal
		? AbortSignal.any([controller.signal, deps.signal])
		: controller.signal;
	const schedule =
		deps.schedule ??
		((callback: () => void, delay: number) => {
			const timer = setTimeout(callback, delay);
			return () => clearTimeout(timer);
		});
	let cancelTimer: (() => void) | undefined;
	let onAbort: (() => void) | undefined;
	try {
		signal.throwIfAborted();
		return await Promise.race([
			(async () => {
				const canonicalize = deps.canonicalize ?? realpath;
				const [configDir, worktreePath] = await Promise.all([
					canonicalize(original.configDir),
					canonicalize(original.worktreePath),
				]);
				if (!path(configDir) || !path(worktreePath)) return refuse();
				const target = Object.freeze({ ...original, configDir, worktreePath });
				signal.throwIfAborted();
				if (!(await deps.validateScope(target, signal))) return refuse();
				signal.throwIfAborted();
				const rows = parseClaudeBackgroundSessions(
					await deps.runDiscovery({
						args: ["agents", "--json", "--cwd", worktreePath],
						configDir,
						cwd: worktreePath,
						timeoutMs: TIMEOUT_MS,
						maxBuffer: MAX_BYTES,
						signal,
					}),
				);
				signal.throwIfAborted();
				const matchingSession = rows.filter(
					(row) => row.sessionId === target.sessionId,
				);
				const matches = target.backgroundId
					? matchingSession.filter((row) => row.id === target.backgroundId)
					: matchingSession;
				if (matches.length === 0) {
					if (matchingSession.length) return refuse();
					if (!(await deps.validateScope(target, signal))) return refuse();
					signal.throwIfAborted();
					return null;
				}
				if (matches.length !== 1) return refuse();
				const candidate = matches[0];
				if (
					!candidate ||
					!pid(candidate.pid) ||
					!candidate.status ||
					candidate.state === "failed" ||
					candidate.state === "stopped" ||
					(await canonicalize(candidate.cwd)) !== worktreePath
				)
					return refuse();
				const expected = Object.freeze({
					...target,
					backgroundId: candidate.id,
					pid: candidate.pid,
				});
				async function verify() {
					signal.throwIfAborted();
					const observed = await deps.verifyWorker(expected, signal);
					signal.throwIfAborted();
					if (
						!observed ||
						observed.pid !== candidate?.pid ||
						observed.sessionId !== target.sessionId ||
						observed.backgroundId !== candidate?.id ||
						typeof observed.birth !== "string" ||
						!observed.birth.trim() ||
						observed.birth.length > 256 ||
						hasControlCharacters(observed.birth) ||
						!path(observed.executable) ||
						(await canonicalize(observed.configDir)) !== configDir ||
						(await canonicalize(observed.worktreePath)) !== worktreePath
					)
						return refuse();
					const executable = await canonicalize(observed.executable);
					if (!path(executable)) return refuse();
					signal.throwIfAborted();
					return Object.freeze({
						pid: observed.pid,
						birth: observed.birth,
						executable,
						configDir,
						worktreePath,
						sessionId: observed.sessionId,
						backgroundId: observed.backgroundId,
					});
				}
				const workerBefore = await verify();
				signal.throwIfAborted();
				if (!(await deps.validateScope(target, signal))) return refuse();
				const workerAfter = await verify();
				if (
					workerBefore.birth !== workerAfter.birth ||
					workerBefore.executable !== workerAfter.executable
				)
					return refuse();
				signal.throwIfAborted();
				return Object.freeze({
					candidate: Object.freeze({ ...candidate, cwd: worktreePath }),
					target,
					workerBefore,
					workerAfter,
					attachArgs: Object.freeze(["attach", candidate.id] as const),
					observedAt: (deps.now ?? Date.now)(),
					nonAtomicAttach: true as const,
				});
			})(),
			new Promise<never>((_, reject) => {
				onAbort = () =>
					reject(new Error("Claude background discovery was cancelled."));
				signal.addEventListener("abort", onAbort, { once: true });
				cancelTimer = schedule(() => controller.abort(), TIMEOUT_MS);
			}),
		]);
	} catch {
		return refuse();
	} finally {
		cancelTimer?.();
		if (onAbort) signal.removeEventListener("abort", onAbort);
		controller.abort();
	}
}
