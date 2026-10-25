import { isDeepStrictEqual } from "node:util";
import { backgroundWorkerBirthHash } from "../../../terminal-agents/background-adoption";
import type { ClaudeBackgroundAttachProof } from "../../../terminal-agents/claude-background-session";
export interface BackgroundSuccessorTrigger {
	terminalId: string;
	launchId: string;
	sessionId: string;
}
export interface BackgroundSuccessorLineage {
	key: string;
	terminalId: string;
	launchId: string;
	workspaceId: string;
	sessionId: string;
	workerPid: number;
	workerBirthHash: string;
	profile: string;
	cwd: string;
	lastEventAt: number;
	proof: unknown;
}
export type BackgroundObservedLifecycle =
	| "Start"
	| "Stop"
	| "PermissionRequest";
export interface BackgroundSuccessorRefreshIO {
	read(
		input: BackgroundSuccessorTrigger,
	): Promise<BackgroundSuccessorLineage | null>;
	observe(
		lineage: BackgroundSuccessorLineage,
		signal: AbortSignal,
	): Promise<ClaudeBackgroundAttachProof | null>;
	publish(
		lineage: BackgroundSuccessorLineage,
		type: BackgroundObservedLifecycle,
		observedAt: number,
	): void;
	wait(): Promise<void>;
	schedule?(callback: () => void, milliseconds: number): () => void;
}
export function observedBackgroundLifecycle(
	proof: ClaudeBackgroundAttachProof,
): BackgroundObservedLifecycle | null {
	const row = proof.candidate;
	if (row.state === "working" && row.status === "busy") return "Start";
	if (row.state === "done" && row.status === "idle") return "Stop";
	if (
		row.state === "blocked" &&
		row.status === "waiting" &&
		[
			"permission prompt",
			"input needed",
			"sandbox request",
			"worker request",
			"dialog open",
		].includes(row.waitingFor ?? "")
	)
		return "PermissionRequest";
	return null;
}
/** The old hook is only a trigger. Its lifecycle, preview and receipt time are never replayed. */
export function createBackgroundSuccessorRefresh(
	io: BackgroundSuccessorRefreshIO,
) {
	const jobs = new Map<
		string,
		{ dirty: boolean; work: Promise<void>; controller: AbortController }
	>();
	let closed = false;
	const api = {
		async enqueue(input: BackgroundSuccessorTrigger): Promise<boolean> {
			if (closed) return false;
			const first = await io.read(input);
			if (closed || !first) return false;
			const existing = jobs.get(first.key);
			if (existing) {
				existing.dirty = true;
				return true;
			}
			if (jobs.size >= 64) return false;
			const controller = new AbortController();
			const entry = { dirty: false, work: Promise.resolve(), controller };
			const cancel = io.schedule
				? io.schedule(() => controller.abort(), 8_000)
				: (() => {
						const timer = setTimeout(() => controller.abort(), 8_000);
						return () => clearTimeout(timer);
					})();
			const run = async () => {
				await io.wait();
				for (let pass = 0; pass < 2 && !controller.signal.aborted; pass++) {
					entry.dirty = false;
					const lineage = await io.read(input);
					if (
						!lineage ||
						lineage.key !== first.key ||
						controller.signal.aborted
					)
						return;
					const proof = await io.observe(lineage, controller.signal);
					if (
						!proof ||
						controller.signal.aborted ||
						proof.target.sessionId !== lineage.sessionId ||
						proof.candidate.sessionId !== lineage.sessionId ||
						proof.target.configDir !== lineage.profile ||
						proof.target.worktreePath !== lineage.cwd ||
						proof.workerAfter.pid !== lineage.workerPid ||
						backgroundWorkerBirthHash(proof.workerAfter.birth) !==
							lineage.workerBirthHash ||
						!isDeepStrictEqual(proof.workerBefore, proof.workerAfter)
					)
						return;
					const type = observedBackgroundLifecycle(proof);
					const latest = await io.read(input);
					if (
						type &&
						latest &&
						isDeepStrictEqual(latest, lineage) &&
						!controller.signal.aborted &&
						proof.observedAt > lineage.lastEventAt
					)
						io.publish(lineage, type, proof.observedAt);
					if (!entry.dirty) return;
					await io.wait();
				}
			};
			jobs.set(first.key, entry);
			entry.work = run()
				.catch(() => {})
				.finally(() => {
					const followup = entry.dirty && !closed && !controller.signal.aborted;
					cancel();
					controller.abort();
					if (jobs.get(first.key) === entry) jobs.delete(first.key);
					if (followup) void api.enqueue(input);
				});
			return true;
		},
		async drain() {
			while (jobs.size)
				await Promise.all([...jobs.values()].map((entry) => entry.work));
		},
		dispose() {
			closed = true;
			for (const entry of jobs.values()) entry.controller.abort();
		},
	};
	return api;
}
