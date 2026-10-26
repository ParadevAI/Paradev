import { expect, test } from "bun:test";
import type { ClaudeBackgroundAttachProof } from "../../../terminal-agents/claude-background-session";
import {
	admitsBackgroundAttachment,
	type BackgroundReconnectIO,
	type BackgroundReconnectResult,
	type BackgroundReconnectSource,
	createBackgroundReconnect,
} from "./background-reconnect";

function fixture() {
	const sessionId = "11111111-2222-4333-8444-555555555555";
	const account = {
		agent: "claude" as const,
		selection: "/fixture/profile",
		directory: "/fixture/profile",
		identity: "a".repeat(64),
		credentialKind: "subscription" as const,
	};
	let source: BackgroundReconnectSource = {
		workspaceId: "workspace",
		terminalId: "original",
		expectedRevision: "revision",
		sessionId,
		account,
		cwd: "/fixture/project",
		label: "Claude",
	};
	const input = {
		workspaceId: source.workspaceId,
		terminalId: source.terminalId,
		expectedRevision: source.expectedRevision,
	};
	const worker = {
		pid: 123,
		birth: "birth-a",
		executable: "/fixture/claude",
		configDir: account.directory,
		worktreePath: source.cwd,
		sessionId,
		backgroundId: "aabbccdd",
	};
	const proof: ClaudeBackgroundAttachProof = {
		target: {
			sessionId,
			configDir: account.directory,
			worktreePath: source.cwd,
		},
		candidate: {
			id: "aabbccdd",
			sessionId,
			name: "Exact worker",
			cwd: source.cwd,
			startedAt: 100,
			state: "working",
			status: "busy",
			pid: worker.pid,
		},
		workerBefore: worker,
		workerAfter: worker,
		attachArgs: ["attach", "aabbccdd"],
		observedAt: 100,
		nonAtomicAttach: true,
	};
	const ancestor = { pid: 500, parentPid: 1, birth: "root-birth", uid: 501 };
	const client = {
		pid: 501,
		parentPid: 500,
		birth: "client-birth",
		uid: 501,
		executable: worker.executable,
		cwd: source.cwd,
		configDir: account.directory,
		args: [],
		ancestors: [ancestor],
	};
	let now = 100;
	let saved: BackgroundReconnectResult | null = null;
	let bytes = new TextEncoder().encode(
		"Session aabbccdd · Exact worker\r\n\x1b[?1049hUI",
	);
	let creates = 0;
	let commits = 0;
	let unclaims = 0;
	const commands: unknown[] = [];
	const io: BackgroundReconnectIO = {
		read: () => structuredClone(source),
		successor: () => saved,
		verifyAccount: async () => ({ ...account, pinned: true }),
		assertIdle: async () => {},
		prove: async () => structuredClone(proof),
		attachArgs: async () => ["attach", "Exact worker"],
		reserve: (expected, terminalId) => {
			expect(source).toEqual(expected);
			source = { ...source, reservation: { terminalId, authorized: false } };
			return structuredClone(source);
		},
		assertReserved: (expected) => {
			expect(source).toEqual(expected);
		},
		authorize: (expected) => {
			expect(source).toEqual(expected);
			if (!source.reservation) throw new Error("Expected reservation");
			source = {
				...source,
				reservation: { ...source.reservation, authorized: true },
			};
			return structuredClone(source);
		},
		unclaim: (expected) => {
			if (JSON.stringify(source) !== JSON.stringify(expected)) return;
			unclaims++;
			const { reservation: _reservation, ...rest } = source;
			source = rest;
		},
		create: async (request) => {
			creates++;
			commands.push(request.args);
			await request.beforeInitialCommand();
			request.onInitialCommandReady();
		},
		admission: async () => ({ rootPid: ancestor.pid, client, bytes }),
		commit: (expected) => {
			expect(source).toEqual(expected);
			commits++;
			saved = {
				reconnected: true,
				confirmed: true,
				terminalId: "attachment",
				label: "Claude",
			};
			return saved;
		},
		now: () => now,
		uuid: () => "attachment",
		wait: async () => {
			now += 100;
		},
	};
	return {
		io,
		input,
		proof,
		client,
		commands,
		setBytes(value: string) {
			bytes = new TextEncoder().encode(value);
		},
		changeSource() {
			source = { ...source, expectedRevision: "changed" };
		},
		counts: () => ({ creates, commits, unclaims }),
	};
}

test("Continue attaches the exact live worker and atomically records its existing identity without a prompt", async () => {
	const f = fixture();
	const reconnect = createBackgroundReconnect(f.io);
	const [first, second] = await Promise.all([
		reconnect(f.input),
		reconnect(f.input),
	]);
	expect(first).toEqual({
		reconnected: true,
		confirmed: true,
		terminalId: "attachment",
		label: "Claude",
	});
	expect(second).toEqual(first);
	expect(f.commands).toEqual([["attach", "Exact worker"]]);
	expect(f.counts()).toEqual({ creates: 1, commits: 1, unclaims: 0 });
	expect(await reconnect(f.input)).toEqual(first);
	expect(f.counts().creates).toBe(1);
});

test("a pending native view is reused after a lost reply instead of opening another client", async () => {
	const f = fixture();
	f.setBytes("");
	const reconnect = createBackgroundReconnect(f.io);
	expect(await reconnect(f.input)).toMatchObject({
		reconnected: false,
		attachmentPending: true,
		terminalId: "attachment",
	});
	f.setBytes("Session aabbccdd · Exact worker\n");
	expect(await reconnect(f.input)).toMatchObject({
		reconnected: true,
		confirmed: true,
	});
	expect(f.counts()).toEqual({ creates: 1, commits: 1, unclaims: 0 });
});

test("an account or source change before launch refuses without consuming its replacement", async () => {
	const f = fixture();
	f.io.verifyAccount = async () => ({
		...f.proof.target,
		agent: "claude",
		directory: "/other/profile",
		selection: "/other/profile",
		identity: "b".repeat(64),
		credentialKind: "subscription",
	});
	await expect(createBackgroundReconnect(f.io)(f.input)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.counts().creates).toBe(0);
});

test("a worker incarnation change during preflight cannot launch a client", async () => {
	const f = fixture();
	const create = f.io.create;
	f.io.create = async (input) => {
		f.proof.workerAfter = { ...f.proof.workerAfter, birth: "reused-pid" };
		return create(input);
	};
	await expect(createBackgroundReconnect(f.io)(f.input)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.counts()).toEqual({ creates: 1, commits: 0, unclaims: 1 });
});

test("a changed client or wrong admission banner cannot be adopted", async () => {
	const f = fixture();
	f.setBytes("Session wrong · Other worker\n");
	const result = await createBackgroundReconnect(f.io)(f.input);
	expect(result).toMatchObject({ reconnected: false, attachmentPending: true });
	expect(f.counts().commits).toBe(0);
});

test("a source replaced after command authorization is left intact and never adopted", async () => {
	const f = fixture();
	const create = f.io.create;
	f.io.create = async (input) => {
		await create(input);
		f.changeSource();
	};
	await expect(createBackgroundReconnect(f.io)(f.input)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.counts().commits).toBe(0);
	expect(f.counts().unclaims).toBe(0);
});

test("no exact running background match leaves ordinary resume to its guarded caller", async () => {
	const f = fixture();
	f.io.prove = async () => null;
	expect(await createBackgroundReconnect(f.io)(f.input)).toEqual({
		reconnected: false,
	});
	expect(f.counts().creates).toBe(0);
});

test("only fresh initial native banners before alternate screen can prove admission", () => {
	const encode = (value: string) => new TextEncoder().encode(value);
	expect(
		admitsBackgroundAttachment(
			encode("Session aabbccdd · Exact\n\x1b[?1049hUI"),
			"aabbccdd",
		),
	).toBe(true);
	expect(
		admitsBackgroundAttachment(
			encode("\x1b[?1049hSession aabbccdd · transcript text"),
			"aabbccdd",
		),
	).toBe(false);
	expect(
		admitsBackgroundAttachment(
			encode("Session aabbccdd · Exact\nSession other · Wrong\n"),
			"aabbccdd",
		),
	).toBe(false);
	expect(
		admitsBackgroundAttachment(new Uint8Array(16 * 1024 + 1), "aabbccdd"),
	).toBe(false);
});

test("a deadline aborts late proof and cannot authorize a delayed command", async () => {
	const f = fixture();
	let fire: (() => void) | undefined;
	let release:
		| ((value: ClaudeBackgroundAttachProof | null) => void)
		| undefined;
	f.io.schedule = (callback, milliseconds) => {
		expect(milliseconds).toBe(12_000);
		fire = callback;
		return () => {};
	};
	f.io.prove = async () =>
		new Promise((resolve) => {
			release = resolve;
		});
	const work = createBackgroundReconnect(f.io)(f.input);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	if (!fire) throw new Error("Expected deadline");
	fire();
	await expect(work).rejects.toThrow("timed out");
	if (release) release(f.proof);
	await Promise.resolve();
	await Promise.resolve();
	expect(f.counts()).toEqual({ creates: 0, commits: 0, unclaims: 0 });
});

test("separate controllers share one native conversation claim", async () => {
	const f = fixture();
	let release:
		| ((value: ClaudeBackgroundAttachProof | null) => void)
		| undefined;
	const original = f.io.prove;
	f.io.prove = async () =>
		new Promise((resolve) => {
			release = resolve;
		});
	const one = createBackgroundReconnect(f.io)(f.input);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await expect(createBackgroundReconnect(f.io)(f.input)).rejects.toThrow(
		"already opening",
	);
	f.io.prove = original;
	if (!release) throw new Error("Expected proof wait");
	release(f.proof);
	expect(await one).toMatchObject({ reconnected: true });
});

test("normal UI output growth cannot invalidate the same fresh native admission", async () => {
	const f = fixture();
	const admission = f.io.admission;
	let reads = 0;
	f.io.admission = async (...args) => {
		const result = await admission(...args);
		if (++reads > 1 && result)
			return {
				...result,
				bytes: new TextEncoder().encode(
					"Session aabbccdd · Exact worker\n\x1b[?1049hNew UI output",
				),
			};
		return result;
	};
	expect(await createBackgroundReconnect(f.io)(f.input)).toMatchObject({
		reconnected: true,
		confirmed: true,
	});
	expect(f.counts().commits).toBe(1);
});

test("a retry replaces only a failed attachment after verified exit, without closing the worker", async () => {
	const f = fixture();
	f.setBytes("");
	const reconnect = createBackgroundReconnect(f.io);
	await expect(reconnect(f.input)).resolves.toMatchObject({
		attachmentPending: true,
	});
	let reconciled = 0;
	f.io.reconcileExitedReservation = async (source) => {
		reconciled++;
		if (!source.reservation?.authorized)
			throw new Error("Expected authorized view");
		f.io.unclaim(source);
		const replacement = f.io.read(f.input);
		if (!replacement) throw new Error("Expected original source");
		return replacement;
	};
	f.setBytes("Session aabbccdd · Exact worker\n");
	await expect(reconnect(f.input)).resolves.toMatchObject({
		reconnected: true,
		confirmed: true,
	});
	expect(reconciled).toBe(1);
	expect(f.counts()).toEqual({ creates: 2, commits: 1, unclaims: 1 });
	expect(f.commands).toEqual([
		["attach", "Exact worker"],
		["attach", "Exact worker"],
	]);
});

test("an unknown attachment exit keeps the same authorized view pending", async () => {
	const f = fixture();
	f.setBytes("");
	const reconnect = createBackgroundReconnect(f.io);
	await reconnect(f.input);
	f.io.reconcileExitedReservation = async (source) => source;
	await expect(reconnect(f.input)).resolves.toMatchObject({
		attachmentPending: true,
	});
	expect(f.counts()).toEqual({ creates: 1, commits: 0, unclaims: 0 });
});
