import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { resolve } from "node:path";
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
