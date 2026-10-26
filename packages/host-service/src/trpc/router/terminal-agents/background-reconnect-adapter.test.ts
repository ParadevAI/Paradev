import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	hostAgentConfigs,
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../../../db/schema";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "../../../terminal-agents";
import type { ClaudeBackgroundAttachProof } from "../../../terminal-agents/claude-background-session";
import type { NativeClaudeTerminalClient } from "../../../terminal-agents/native-claude-process";
import { createBackgroundReconnect } from "./background-reconnect";
import {
	backgroundAttachmentCommand,
	backgroundReconnectAdapter,
	backgroundReconnectSource,
} from "./background-reconnect-adapter";
import { accountResumeSource } from "./resume-account";

const databases: Database[] = [];
afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});
function fixture() {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	db.insert(workspaces)
		.values({
			id: "workspace",
			worktreePath: "/fixture/project",
			branch: "main",
		})
		.run();
	db.insert(hostAgentConfigs)
		.values({
			id: "custom:fixture",
			presetId: "claude",
			label: "Claude",
			command: "claude",
			promptTransport: "argv",
			resumeArgsJson: '["--resume"]',
			displayOrder: 0,
		})
		.run();
	db.insert(terminalSessions)
		.values({
			id: "original",
			originWorkspaceId: "workspace",
			status: "exited",
			createdAt: 1,
		})
		.run();
	const account = {
		pinned: true as const,
		agent: "claude" as const,
		selection: "/fixture/profile",
		directory: "/fixture/profile",
		credentialKind: "subscription" as const,
		identity: "a".repeat(64),
	};
	const sessionId = "11111111-2222-4333-8444-555555555555";
	db.insert(terminalAgentBindings)
		.values({
			terminalId: "original",
			workspaceId: "workspace",
			agentId: "claude",
			definitionId: "custom:fixture",
			launchId: "fixture-original-launch",
			agentSessionId: sessionId,
			accountJson: JSON.stringify(account),
			startedAt: 1,
			lastEventAt: 2,
			lastEventType: "Stop",
			endedAt: 3,
			endReason: "terminal-exited",
		})
		.run();
	type Context = Parameters<typeof backgroundReconnectAdapter>[0];
	const events: unknown[] = [];
	const ctx: Context = {
		db,
		organizationId: "fixture-org",
		eventBus: {
			broadcastTerminalLifecycle: (event: unknown) => {
				events.push(event);
			},
		} as Context["eventBus"],
		terminalAgentStore: new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		),
	};
	const selection = { workspaceId: "workspace", terminalId: "original" };
	const source = backgroundReconnectSource(ctx, selection);
	if (!source) throw new Error("Missing fixture source");
	const input = { ...selection, expectedRevision: source.revision };
	const adapter = backgroundReconnectAdapter(ctx);
	const worker = {
		pid: 123,
		birth: "worker-birth",
		executable: "/fixture/claude",
		configDir: account.directory,
		worktreePath: "/fixture/project",
		sessionId,
		backgroundId: "aabbccdd",
	};
	const proof: ClaudeBackgroundAttachProof = {
		target: {
			sessionId,
			configDir: account.directory,
			worktreePath: "/fixture/project",
		},
		candidate: {
			id: "aabbccdd",
			name: "Fixture exact worker",
			sessionId,
			cwd: "/fixture/project",
			startedAt: 1,
			state: "done",
			status: "idle",
			pid: 123,
		},
		workerBefore: worker,
		workerAfter: worker,
		attachArgs: ["attach", "aabbccdd"],
		observedAt: 2,
		nonAtomicAttach: true,
	};
	const client: NativeClaudeTerminalClient = {
		pid: 501,
		parentPid: 500,
		uid: 501,
		birth: "client-birth",
		executable: worker.executable,
		cwd: "/fixture/project",
		configDir: account.directory,
		args: [],
		ancestors: [{ pid: 500, parentPid: 1, uid: 501, birth: "root-birth" }],
	};
	const original = () =>
		db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "original"))
			.get();
	return {
		db,
		ctx,
		account,
		sessionId,
		adapter,
		input,
		proof,
		client,
		original,
		events,
	};
}

test("a reservation survives a new adapter with the same original revision and target", () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	const queued = f.adapter.reserve(source, "attachment");
	expect(queued.expectedRevision).toBe(f.input.expectedRevision);
	expect(backgroundReconnectAdapter(f.ctx).read(f.input)).toEqual(queued);
	expect(f.original()?.endReason).toStartWith("background-attach:queued:");
	const started = f.adapter.authorize(queued);
	expect(started.reservation).toEqual({
		terminalId: "attachment",
		authorized: true,
	});
	f.adapter.unclaim(started);
	expect(f.original()?.endReason).toStartWith("background-attach:started:");
});

test("unclaim cannot overwrite a source changed by another actor", () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	const queued = f.adapter.reserve(source, "attachment");
	f.db
		.update(terminalAgentBindings)
		.set({ agentSessionId: "replacement" })
		.where(eq(terminalAgentBindings.terminalId, "original"))
		.run();
	f.adapter.unclaim(queued);
	expect(f.original()?.agentSessionId).toBe("replacement");
	expect(f.original()?.resumedIntoTerminalId).toBe("attachment");
});

test("a config or sibling ownership change cannot consume the source", () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	f.db
		.update(hostAgentConfigs)
		.set({ argsJson: '["--model","changed"]' })
		.where(eq(hostAgentConfigs.id, "custom:fixture"))
		.run();
	expect(() => f.adapter.reserve(source, "attachment")).toThrow(
		"could not be verified",
	);
	expect(f.original()?.endReason).toBe("terminal-exited");
});

test("synthetic native admission adopts one exact SQLite successor and preserves its durable provenance", async () => {
	const f = fixture();
	let creates = 0;
	f.adapter.verifyAccount = async () => f.account;
	f.adapter.assertIdle = async () => {};
	f.adapter.prove = async () => f.proof;
	f.adapter.attachArgs = async () => ["attach", "Fixture exact worker"];
	f.adapter.create = async (request) => {
		creates++;
		await request.beforeInitialCommand();
		f.db
			.insert(terminalSessions)
			.values({
				id: request.terminalId,
				originWorkspaceId: "workspace",
				status: "active",
				createdAt: 4,
			})
			.run();
		request.onInitialCommandReady();
	};
	f.adapter.admission = async () => ({
		rootPid: 500,
		client: f.client,
		bytes: new TextEncoder().encode(
			"Session aabbccdd · Fixture exact worker\n",
		),
	});
	f.adapter.uuid = () => "attachment";
	const reconnect = createBackgroundReconnect(f.adapter);
	expect(await reconnect(f.input)).toMatchObject({
		reconnected: true,
		confirmed: true,
		terminalId: "attachment",
	});
	const target = f.db
		.select()
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.terminalId, "attachment"))
		.get();
	expect(target?.agentSessionId).toBe(f.sessionId);
	expect(JSON.parse(target?.accountJson ?? "null")).toEqual(f.account);
	expect(f.original()).toMatchObject({
		endReason: "resumed",
		resumedIntoTerminalId: "attachment",
	});
	expect(f.ctx.terminalAgentStore.getProvenance("original")?.endReason).toBe(
		"resumed",
	);
	expect(f.ctx.terminalAgentStore.get("attachment")?.account?.identity).toBe(
		f.account.identity,
	);
	expect(await reconnect(f.input)).toMatchObject({
		attachmentPending: true,
		terminalId: "attachment",
	});
	expect(creates).toBe(1);
	expect(f.events).toHaveLength(1);
});

test("a wrong destination workspace is never adopted or written", () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	const queued = f.adapter.reserve(source, "attachment");
	const started = f.adapter.authorize(queued);
	f.db
		.insert(terminalSessions)
		.values({
			id: "attachment",
			originWorkspaceId: "different-workspace",
			status: "active",
			createdAt: 4,
		})
		.run();
	expect(() => f.adapter.commit(started, f.proof, f.client)).toThrow(
		"could not be verified",
	);
	expect(f.original()?.endReason).toStartWith("background-attach:started:");
	expect(
		f.db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "attachment"))
			.get(),
	).toBeUndefined();
});

// Continue's saved-history fallback must use the identical immutable source.
test("background and exact saved-history recovery share the unreserved source revision", () => {
	const f = fixture();
	expect(accountResumeSource(f.db, f.input)?.revision).toBe(
		f.input.expectedRevision,
	);
});

test("ordinary Claude configurations outside attachment scope keep normal Continue available", () => {
	const custom = fixture();
	custom.db
		.update(hostAgentConfigs)
		.set({ argsJson: '["--model","custom-model"]' })
		.where(eq(hostAgentConfigs.id, "custom:fixture"))
		.run();
	expect(backgroundReconnectSource(custom.ctx, custom.input)).toBeNull();
	expect(() => custom.adapter.read(custom.input)).toThrow(
		"could not be verified",
	);

	const api = fixture();
	api.db
		.update(terminalAgentBindings)
		.set({
			accountJson: JSON.stringify({
				...api.account,
				pinned: undefined,
				credentialKind: "api_key",
			}),
		})
		.where(eq(terminalAgentBindings.terminalId, "original"))
		.run();
	expect(backgroundReconnectSource(api.ctx, api.input)).toBeNull();
	expect(() => api.adapter.read(api.input)).toThrow("could not be verified");
});

test("discovery never hides an invalid or now-unsupported pending attachment", () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	f.adapter.authorize(f.adapter.reserve(source, "attachment"));
	f.db
		.update(hostAgentConfigs)
		.set({ argsJson: '["--model","changed"]' })
		.where(eq(hostAgentConfigs.id, "custom:fixture"))
		.run();
	expect(() => backgroundReconnectSource(f.ctx, f.input)).toThrow(
		"could not be verified",
	);
});

test("a failed owned attachment's known terminal exit restores the original recovery revision", async () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	const started = f.adapter.authorize(f.adapter.reserve(source, "attachment"));
	f.db
		.insert(terminalSessions)
		.values({
			id: "attachment",
			originWorkspaceId: "workspace",
			status: "exited",
			createdAt: 4,
			endedAt: 5,
		})
		.run();
	const restarted = backgroundReconnectAdapter(f.ctx, {
		listSessions: async () => [],
	});
	const recovered = await restarted.reconcileExitedReservation?.(started);
	expect(recovered).toEqual(source);
	expect(f.original()?.endReason).toBe("terminal-exited");
	expect(f.original()?.resumedIntoTerminalId).toBeNull();
	expect(accountResumeSource(f.db, f.input)?.ready).toBe(true);
	expect(f.events).toEqual([]);
});

test("unknown daemon state or a live attachment never releases an authorized reservation", async () => {
	for (const live of [null, [{ id: "attachment", alive: true }]]) {
		const f = fixture();
		const source = f.adapter.read(f.input);
		if (!source) throw new Error("Missing source");
		const started = f.adapter.authorize(
			f.adapter.reserve(source, "attachment"),
		);
		f.db
			.insert(terminalSessions)
			.values({
				id: "attachment",
				originWorkspaceId: "workspace",
				status: "exited",
				createdAt: 4,
				endedAt: 5,
			})
			.run();
		const adapter = backgroundReconnectAdapter(f.ctx, {
			listSessions: async () => live,
		});
		expect(await adapter.reconcileExitedReservation?.(started)).toEqual(
			started,
		);
		expect(f.original()?.endReason).toStartWith("background-attach:started:");
	}
});

test("an alive or differently owned terminal cannot be treated as an exited attachment", async () => {
	for (const destination of [
		{ status: "active", originWorkspaceId: "workspace" },
		{ status: "exited", originWorkspaceId: "different-workspace" },
	]) {
		const f = fixture();
		const source = f.adapter.read(f.input);
		if (!source) throw new Error("Missing source");
		const started = f.adapter.authorize(
			f.adapter.reserve(source, "attachment"),
		);
		f.db
			.insert(terminalSessions)
			.values({ id: "attachment", ...destination, createdAt: 4 })
			.run();
		const adapter = backgroundReconnectAdapter(f.ctx, {
			listSessions: async () => [],
		});
		expect(await adapter.reconcileExitedReservation?.(started)).toEqual(
			started,
		);
		expect(f.original()?.resumedIntoTerminalId).toBe("attachment");
	}
});

test("a source or terminal changed during the exit probe cannot be reclaimed", async () => {
	const f = fixture();
	const source = f.adapter.read(f.input);
	if (!source) throw new Error("Missing source");
	const started = f.adapter.authorize(f.adapter.reserve(source, "attachment"));
	f.db
		.insert(terminalSessions)
		.values({
			id: "attachment",
			originWorkspaceId: "workspace",
			status: "exited",
			createdAt: 4,
			endedAt: 5,
		})
		.run();
	const adapter = backgroundReconnectAdapter(f.ctx, {
		listSessions: async () => {
			f.db
				.update(terminalSessions)
				.set({ status: "active" })
				.where(eq(terminalSessions.id, "attachment"))
				.run();
			return [];
		},
	});
	await expect(adapter.reconcileExitedReservation?.(started)).rejects.toThrow(
		"could not be verified",
	);
	expect(f.original()?.endReason).toStartWith("background-attach:started:");
});

test("a dedicated attachment exits its view with the child's status and quoted argv", () => {
	const root = mkdtempSync(join(tmpdir(), "attachment-view-exit-"));
	try {
		const cli = join(root, "fixture cli's");
		writeFileSync(
			cli,
			'#!/bin/sh\nprintf "%s|%s|%s" "$1" "$2" "$CLAUDE_CONFIG_DIR"\nexit 23\n',
			{ mode: 0o700 },
		);
		const f = fixture();
		const name = "worker's exact name; no shell expansion";
		const command = backgroundAttachmentCommand(f.account, cli, [
			"attach",
			name,
		]);
		for (const shell of ["/bin/sh", "/bin/bash", "/bin/zsh"]) {
			if (!existsSync(shell)) continue;
			const result = spawnSync(
				shell,
				["-c", `${command}\nprintf SHOULD_NOT_RUN`],
				{
					encoding: "utf8",
					env: { PATH: process.env.PATH, HOME: root },
				},
			);
			expect(result.error).toBeUndefined();
			expect(result.status).toBe(23);
			expect(result.stdout).toBe(`attach|${name}|${f.account.directory}`);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Continue retries an exited failed view and adopts the same live worker without manual shell closure", async () => {
	const f = fixture();
	const adapter = backgroundReconnectAdapter(f.ctx, {
		listSessions: async () => [],
	});
	let creates = 0;
	let now = 0;
	adapter.verifyAccount = async () => f.account;
	adapter.assertIdle = async () => {};
	adapter.prove = async () => f.proof;
	adapter.attachArgs = async () => ["attach", "Fixture exact worker"];
	adapter.uuid = () => (creates === 0 ? "failed-view" : "working-view");
	adapter.now = () => now;
	adapter.wait = async () => {
		now += 100;
	};
	adapter.create = async (request) => {
		creates++;
		await request.beforeInitialCommand();
		f.db
			.insert(terminalSessions)
			.values({
				id: request.terminalId,
				originWorkspaceId: "workspace",
				status: "active",
				createdAt: 4,
			})
			.run();
		request.onInitialCommandReady();
		if (creates === 1)
			f.db
				.update(terminalSessions)
				.set({ status: "exited", endedAt: 5 })
				.where(eq(terminalSessions.id, request.terminalId))
				.run();
	};
	adapter.admission = async () =>
		creates === 1
			? null
			: {
					rootPid: 500,
					client: f.client,
					bytes: new TextEncoder().encode(
						"Session aabbccdd · Fixture exact worker\n",
					),
				};
	const reconnect = createBackgroundReconnect(adapter);
	await expect(reconnect(f.input)).resolves.toMatchObject({
		attachmentPending: true,
		terminalId: "failed-view",
	});
	await expect(reconnect(f.input)).resolves.toMatchObject({
		reconnected: true,
		confirmed: true,
		terminalId: "working-view",
	});
	expect(creates).toBe(2);
	expect(f.original()?.resumedIntoTerminalId).toBe("working-view");
	expect(
		f.db
			.select()
			.from(terminalSessions)
			.where(eq(terminalSessions.id, "failed-view"))
			.get()?.status,
	).toBe("exited");
	expect(
		f.db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "working-view"))
			.get()?.agentSessionId,
	).toBe(f.sessionId);
	expect(f.events).toHaveLength(1);
});

test("an unmarked account-resume reservation is not offered as background attachment", () => {
	for (const reason of ["detached", "terminal-exited", "disposed"]) {
		const f = fixture();
		f.db
			.update(terminalAgentBindings)
			.set({ endReason: `account-resume-preparing:${reason}` })
			.where(eq(terminalAgentBindings.terminalId, "original"))
			.run();
		expect(backgroundReconnectSource(f.ctx, f.input)).toBeNull();
		expect(() => f.adapter.read(f.input)).toThrow("could not be verified");
	}
});

test("verified native admission adopts an early matching hook but refuses conflicting provenance", () => {
	for (const kind of [
		"unattributed-hook",
		"matching-account",
		"wrong-session",
		"wrong-account",
	]) {
		const f = fixture();
		const source = f.adapter.read(f.input);
		if (!source) throw new Error("Missing fixture source");
		const started = f.adapter.authorize(
			f.adapter.reserve(source, "attachment"),
		);
		f.db
			.insert(terminalSessions)
			.values({
				id: "attachment",
				originWorkspaceId: "workspace",
				status: "active",
				createdAt: 4,
			})
			.run();
		f.db
			.insert(terminalAgentBindings)
			.values({
				terminalId: "attachment",
				workspaceId: "workspace",
				agentId: "claude",
				agentSessionId:
					kind === "wrong-session" ? "another-session" : f.sessionId,
				accountJson:
					kind === "unattributed-hook"
						? null
						: JSON.stringify(
								kind === "wrong-account"
									? { ...f.account, identity: "b".repeat(64) }
									: f.account,
							),
				startedAt: 4,
				lastEventAt: 5,
				lastEventType: "SessionStart",
			})
			.run();
		if (kind.startsWith("wrong")) {
			expect(() => f.adapter.commit(started, f.proof, f.client)).toThrow(
				"could not be verified",
			);
			expect(f.original()?.endReason).toStartWith("background-attach:started:");
		} else {
			expect(f.adapter.commit(started, f.proof, f.client)).toMatchObject({
				reconnected: true,
				terminalId: "attachment",
			});
			expect(
				f.ctx.terminalAgentStore.get("attachment")?.account?.identity,
			).toBe(f.account.identity);
			expect(f.original()?.endReason).toBe("resumed");
		}
	}
});
