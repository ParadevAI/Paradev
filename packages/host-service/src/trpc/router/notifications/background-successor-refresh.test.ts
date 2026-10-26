import { expect, test } from "bun:test";
import { backgroundWorkerBirthHash } from "../../../terminal-agents/background-adoption";
import type { ClaudeBackgroundAttachProof } from "../../../terminal-agents/claude-background-session";
import {
	type BackgroundSuccessorLineage,
	type BackgroundSuccessorRefreshIO,
	createBackgroundSuccessorRefresh,
	observedBackgroundLifecycle,
} from "./background-successor-refresh";

function fixture() {
	const input = {
		terminalId: "old",
		launchId: "original-launch",
		sessionId: "exact-native",
	};
	let lineage: BackgroundSuccessorLineage | null = {
		key: "exact-worker-and-successor",
		terminalId: "new",
		launchId: "grant",
		workspaceId: "workspace",
		sessionId: input.sessionId,
		workerPid: 123,
		workerBirthHash: backgroundWorkerBirthHash("exact-birth"),
		profile: "/profile",
		cwd: "/project",
		lastEventAt: 10,
		proof: { adopted: true },
	};
	const worker = {
		pid: 123,
		birth: "exact-birth",
		executable: "/native/claude",
		configDir: "/profile",
		worktreePath: "/project",
		sessionId: input.sessionId,
		backgroundId: "aabbccdd",
	};
	const proof: ClaudeBackgroundAttachProof = {
		candidate: {
			id: "aabbccdd",
			sessionId: input.sessionId,
			cwd: "/project",
			state: "done",
			status: "idle",
			startedAt: 1,
		},
		observedAt: 20,
		target: {
			sessionId: input.sessionId,
			configDir: "/profile",
			worktreePath: "/project",
		},
		workerBefore: worker,
		workerAfter: worker,
		attachArgs: ["attach", "aabbccdd"],
		nonAtomicAttach: true,
	};
	let reads = 0;
	let observations = 0;
	const published: unknown[] = [];
	const io: BackgroundSuccessorRefreshIO = {
		read: async () => {
			reads++;
			return structuredClone(lineage);
		},
		observe: async () => {
			observations++;
			return proof;
		},
		publish: (scope, type, observedAt) => {
			published.push({ terminalId: scope.terminalId, type, observedAt });
		},
		wait: async () => {},
	};
	return {
		input,
		io,
		proof,
		published,
		counts: () => ({ reads, observations }),
		rotate() {
			lineage = {
				...(lineage as BackgroundSuccessorLineage),
				launchId: "new-unrelated-launch",
				proof: { rotated: true },
			};
		},
		dispose() {
			lineage = null;
		},
	};
}
test("a burst of predecessor hooks only rereads the current worker and publishes its observed state", async () => {
	const f = fixture();
	const refresh = createBackgroundSuccessorRefresh(f.io);
	expect(
		(
			await Promise.all(
				Array.from({ length: 20 }, () => refresh.enqueue(f.input)),
			)
		).every(Boolean),
	).toBe(true);
	await refresh.drain();
	expect(f.counts().observations).toBeLessThanOrEqual(2);
	expect(f.published).toEqual([
		{ terminalId: "new", type: "Stop", observedAt: 20 },
	]);
});
test("a disposed or rotated successor cancels publication after pending native observation", async () => {
	for (const change of ["dispose", "rotate"] as const) {
		const f = fixture();
		const observe = f.io.observe;
		f.io.observe = async (...args) => {
			const result = await observe(...args);
			f[change]();
			return result;
		};
		const refresh = createBackgroundSuccessorRefresh(f.io);
		await refresh.enqueue(f.input);
		await refresh.drain();
		expect(f.published).toEqual([]);
	}
});
test("unknown attention or activity never becomes a synthetic busy/waiting state", () => {
	const f = fixture();
	for (const candidate of [
		{
			...f.proof.candidate,
			state: "working" as const,
			status: "idle" as const,
		},
		{
			...f.proof.candidate,
			state: "blocked" as const,
			status: "waiting" as const,
		},
		{
			...f.proof.candidate,
			state: "blocked" as const,
			status: "waiting" as const,
			waitingFor: "unknown reason",
		},
	])
		expect(observedBackgroundLifecycle({ ...f.proof, candidate })).toBeNull();
	expect(
		observedBackgroundLifecycle({
			...f.proof,
			candidate: {
				...f.proof.candidate,
				state: "blocked",
				status: "waiting",
				waitingFor: "input needed",
			},
		}),
	).toBe("PermissionRequest");
});
test("a stale native observation cannot freshen an already newer successor", async () => {
	const f = fixture();
	f.proof.observedAt = 9;
	const refresh = createBackgroundSuccessorRefresh(f.io);
	await refresh.enqueue(f.input);
	await refresh.drain();
	expect(f.published).toEqual([]);
});
test("disposal aborts owned work and late native results cannot publish or reopen collection", async () => {
	const f = fixture();
	let release: ((value: ClaudeBackgroundAttachProof) => void) | undefined;
	f.io.observe = async () =>
		new Promise((resolve) => {
			release = resolve;
		});
	const refresh = createBackgroundSuccessorRefresh(f.io);
	await refresh.enqueue(f.input);
	await Promise.resolve();
	await Promise.resolve();
	refresh.dispose();
	if (!release) throw new Error("Missing observation");
	release(f.proof);
	await refresh.drain();
	expect(f.published).toEqual([]);
	expect(await refresh.enqueue(f.input)).toBe(false);
});

test("a different native worker incarnation cannot publish even a plausible current state", async () => {
	const f = fixture();
	f.proof.workerBefore = { ...f.proof.workerBefore, birth: "reused-pid" };
	f.proof.workerAfter = f.proof.workerBefore;
	const refresh = createBackgroundSuccessorRefresh(f.io);
	await refresh.enqueue(f.input);
	await refresh.drain();
	expect(f.published).toEqual([]);
});
