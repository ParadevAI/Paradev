import { expect, test } from "bun:test";
import {
	type ClaudeBackgroundSession,
	type ClaudeBackgroundSessionDeps,
	type ClaudeBackgroundSessionTarget,
	type ClaudeBackgroundWorkerProof,
	discoverClaudeBackgroundSession,
	liveClaudeAttachmentName,
	parseClaudeBackgroundSessions,
} from "./claude-background-session";

const sessionId = "11111111-2222-4333-8444-555555555555";
const backgroundId = "aabbccdd";
const target: ClaudeBackgroundSessionTarget = {
	sessionId,
	configDir: "/fixture/profile",
	worktreePath: "/fixture/project",
};
const row = {
	kind: "background",
	id: backgroundId,
	sessionId,
	cwd: target.worktreePath,
	startedAt: 100,
	state: "working",
	pid: 101,
	status: "busy",
};
const worker: ClaudeBackgroundWorkerProof = {
	pid: 101,
	birth: "1000000:123456",
	executable: "/fixture/claude/2.1.301",
	configDir: target.configDir,
	worktreePath: target.worktreePath,
	sessionId,
	backgroundId,
};
function fixture(rows: unknown[] = [row]) {
	let runs = 0,
		validations = 0,
		proofs = 0;
	const deps: ClaudeBackgroundSessionDeps = {
		runDiscovery: async (request) => {
			runs++;
			expect(request.args).toEqual([
				"agents",
				"--json",
				"--cwd",
				target.worktreePath,
			]);
			expect(request.configDir).toBe(target.configDir);
			expect(request.cwd).toBe(target.worktreePath);
			expect(request.timeoutMs).toBe(1500);
			expect(request.maxBuffer).toBe(256 * 1024);
			expect(request.signal.aborted).toBe(false);
			return JSON.stringify(rows);
		},
		validateScope: async () => {
			validations++;
			return true;
		},
		verifyWorker: async (expected, signal) => {
			proofs++;
			expect(expected).toEqual({ ...target, pid: row.pid, backgroundId });
			expect(signal.aborted).toBe(false);
			return { ...worker };
		},
		canonicalize: async (value) => value,
		now: () => 200,
	};
	return { deps, counts: () => ({ runs, validations, proofs }) };
}

test("the parser keeps supported background facts and optional names, excluding private prompt fields and interactive rows", () => {
	expect(
		parseClaudeBackgroundSessions(
			JSON.stringify([
				{ kind: "interactive" },
				{ ...row, name: "untrusted title", waitingFor: "private prompt" },
			]),
		),
	).toEqual([
		{
			id: backgroundId,
			name: "untrusted title",
			sessionId,
			cwd: target.worktreePath,
			startedAt: 100,
			state: "working",
			pid: 101,
			status: "busy",
		},
	]);
});

for (const version of [
	"2.1.290 (Claude Code)",
	"2.1.302 (Claude Code)",
	"2.1.303 (Claude Code)",
	"2.1.310 (Claude Code)",
]) {
	test(`live-only attachment on ${version} requires a unique full-profile name`, () => {
		const named = {
			...row,
			state: "working",
			status: "busy",
			name: "Medusa fixture",
		} satisfies ClaudeBackgroundSession;
		expect(
			liveClaudeAttachmentName(
				JSON.stringify([
					named,
					{
						...row,
						id: "other",
						sessionId: "11111111-2222-4333-8444-666666666666",
						cwd: "/other",
						name: "unrelated",
					},
				]),
				named,
				`${version}\n`,
			),
		).toBe("Medusa fixture");
		for (const other of [
			{ ...row, id: "other", name: "MEDUSA FIXTURE secondary", cwd: "/other" },
			{
				...row,
				id: "other",
				name: "Medusa fixture",
				state: "stopped",
				cwd: "/other",
			},
			{ kind: "interactive", name: "Medusa fixture" },
			{ ...row, id: "other" },
		])
			expect(() =>
				liveClaudeAttachmentName(
					JSON.stringify([named, other]),
					named,
					version,
				),
			).toThrow("could not be verified");
		for (const name of [
			"cf9dc1cc",
			"cf9dc1cc-3d55-4149-8a3b-c16be579690b",
			"dead",
			"--help",
			" Medusa fixture",
			"Medusa\nfixture",
		])
			expect(() =>
				liveClaudeAttachmentName(
					JSON.stringify([{ ...row, name }]),
					{ ...named, name },
					version,
				),
			).toThrow("could not be verified");
	});
}

test("live-only attachment refuses unqualified and unknown native versions", () => {
	const named = {
		...row,
		state: "working",
		status: "busy",
		name: "Medusa fixture",
	} satisfies ClaudeBackgroundSession;
	for (const version of [
		"2.1.289 (Claude Code)",
		"2.1.311 (Claude Code)",
		"2.1.302",
		"2.1.303",
		"garbage",
	])
		expect(() =>
			liveClaudeAttachmentName(JSON.stringify([named]), named, version),
		).toThrow("could not be verified");
});

test("malformed or oversized discovery output is refused without leaking its content", () => {
	for (const stdout of [
		"private invalid output",
		"{}",
		JSON.stringify([{ ...row, id: "--dangerous-option" }]),
		JSON.stringify([{ ...row, pid: 0 }]),
		JSON.stringify([{ ...row, state: "new-unsupported-state" }]),
		JSON.stringify([row, row]),
		JSON.stringify(
			Array.from({ length: 1025 }, () => ({ kind: "interactive" })),
		),
		" ".repeat(256 * 1024 + 1),
	])
		expect(() => parseClaudeBackgroundSessions(stdout)).toThrow(
			"could not be verified",
		);
});

test("an exact live background session yields only its attach argv and two stable worker proofs", async () => {
	const f = fixture();
	const result = await discoverClaudeBackgroundSession(
		{ ...target, backgroundId },
		f.deps,
	);
	expect(result?.attachArgs).toEqual(["attach", backgroundId]);
	expect(result?.workerBefore).toEqual(worker);
	expect(result?.workerAfter).toEqual(worker);
	expect(result?.target).toEqual({ ...target, backgroundId });
	expect(result?.observedAt).toBe(200);
	expect(result?.nonAtomicAttach).toBe(true);
	expect(f.counts()).toEqual({ runs: 1, validations: 2, proofs: 2 });
});

for (const [state, status] of [
	["blocked", "waiting"],
	["done", "idle"],
]) {
	test(`a live ${state} worker remains attachable without starting a new turn`, async () => {
		const f = fixture([{ ...row, state, status }]);
		expect(
			(await discoverClaudeBackgroundSession(target, f.deps))?.attachArgs,
		).toEqual(["attach", backgroundId]);
	});
}

test("names, matching prefixes and latest timestamps cannot select a different session", async () => {
	const f = fixture([
		{
			...row,
			sessionId: "11111111-2222-4333-8444-666666666666",
			name: sessionId,
			startedAt: Number.MAX_SAFE_INTEGER,
		},
	]);
	expect(await discoverClaudeBackgroundSession(target, f.deps)).toBeNull();
	expect(f.counts()).toEqual({ runs: 1, validations: 2, proofs: 0 });
});

test("ambiguous exact-session rows are refused unless the caller already knows the exact background ID", async () => {
	const f = fixture([row, { ...row, id: "otherid" }]);
	await expect(discoverClaudeBackgroundSession(target, f.deps)).rejects.toThrow(
		"could not be verified",
	);
	expect(
		(await discoverClaudeBackgroundSession({ ...target, backgroundId }, f.deps))
			?.attachArgs,
	).toEqual(["attach", backgroundId]);
	await expect(
		discoverClaudeBackgroundSession(
			{ ...target, backgroundId: "absent" },
			f.deps,
		),
	).rejects.toThrow("could not be verified");
});

for (const [name, patch] of [
	["stopped", { state: "stopped" }],
	["failed", { state: "failed" }],
	["exited without pid", { pid: undefined }],
	["not confirmed alive", { status: undefined }],
	["wrong worktree", { cwd: "/fixture/other" }],
] as const) {
	test(`a ${name} row never produces attach or a resume fallback`, async () => {
		const f = fixture([{ ...row, ...patch }]);
		await expect(
			discoverClaudeBackgroundSession(target, f.deps),
		).rejects.toThrow("could not be verified");
		expect(f.counts().proofs).toBe(0);
	});
}

for (const [name, patch] of [
	["dead worker", null],
	["wrong pid", { pid: 999 }],
	["wrong session", { sessionId: "99999999-2222-4333-8444-555555555555" }],
	["wrong background id", { backgroundId: "otherid" }],
	["wrong profile", { configDir: "/fixture/other-profile" }],
	["wrong cwd", { worktreePath: "/fixture/other-project" }],
	["unproven birth", { birth: "" }],
] as const) {
	test(`independent ${name} evidence is refused`, async () => {
		const f = fixture();
		f.deps.verifyWorker = async () =>
			patch === null ? null : { ...worker, ...patch };
		await expect(
			discoverClaudeBackgroundSession(target, f.deps),
		).rejects.toThrow("could not be verified");
	});
}

test("PID reuse or executable replacement between proof snapshots is refused", async () => {
	for (const patch of [
		{ birth: "new birth" },
		{ executable: "/fixture/claude/2.1.302" },
	]) {
		const f = fixture();
		let checks = 0;
		f.deps.verifyWorker = async () =>
			++checks === 1 ? { ...worker } : { ...worker, ...patch };
		await expect(
			discoverClaudeBackgroundSession(target, f.deps),
		).rejects.toThrow("could not be verified");
	}
});

test("a profile identity change during verification prevents attach", async () => {
	const f = fixture();
	let validations = 0;
	f.deps.validateScope = async () => ++validations === 1;
	await expect(discoverClaudeBackgroundSession(target, f.deps)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.counts().proofs).toBe(1);
});

test("canonical aliases remain scoped and mutating the caller cannot retarget discovery", async () => {
	const f = fixture([{ ...row, cwd: "/fixture/project-alias" }]);
	const mutable = { ...target, configDir: "/fixture/profile-alias" };
	f.deps.canonicalize = async (value) => value.replace(/-alias$/, "");
	const run = f.deps.runDiscovery;
	f.deps.runDiscovery = async (request) => {
		mutable.configDir = "/fixture/attacker";
		mutable.sessionId = "99999999-2222-4333-8444-555555555555";
		return run(request);
	};
	expect(
		(await discoverClaudeBackgroundSession(mutable, f.deps))?.target,
	).toEqual(target);
});

test("a manually fired deadline cancels discovery and late results cannot trigger worker checks", async () => {
	const f = fixture();
	let fire!: () => void;
	let finish!: (value: string) => void;
	let seenSignal: AbortSignal | undefined;
	let cleaned = false;
	f.deps.schedule = (callback, delay) => {
		expect(delay).toBe(1500);
		fire = callback;
		return () => {
			cleaned = true;
		};
	};
	f.deps.runDiscovery = async ({ signal }) => {
		seenSignal = signal;
		return new Promise<string>((resolve) => {
			finish = resolve;
		});
	};
	const result = discoverClaudeBackgroundSession(target, f.deps).catch(
		(error: Error) => error.message,
	);
	for (let step = 0; step < 16; step++) await Promise.resolve();
	fire();
	expect(await result).toContain("could not be verified");
	expect(seenSignal?.aborted).toBe(true);
	expect(cleaned).toBe(true);
	finish(JSON.stringify([row]));
	for (let step = 0; step < 16; step++) await Promise.resolve();
	expect(f.counts().proofs).toBe(0);
});

test("a caller abort or failed scope check cannot launch discovery", async () => {
	const f = fixture();
	const controller = new AbortController();
	controller.abort();
	f.deps.signal = controller.signal;
	await expect(discoverClaudeBackgroundSession(target, f.deps)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.counts().runs).toBe(0);
	f.deps.signal = undefined;
	f.deps.validateScope = async () => false;
	await expect(discoverClaudeBackgroundSession(target, f.deps)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.counts().runs).toBe(0);
});

test("only documented non-private waiting reason categories enter the status reader", () => {
	expect(
		parseClaudeBackgroundSessions(
			JSON.stringify([
				{
					...row,
					state: "blocked",
					status: "waiting",
					waitingFor: "input needed",
				},
			]),
		)[0]?.waitingFor,
	).toBe("input needed");
	expect(
		parseClaudeBackgroundSessions(
			JSON.stringify([{ ...row, waitingFor: "private free-text question" }]),
		)[0]?.waitingFor,
	).toBeUndefined();
});
