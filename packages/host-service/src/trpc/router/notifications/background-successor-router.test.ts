import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
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
import { issueAttributionToken } from "../../../terminal-agents/attribution-token";
import {
	backgroundAdoptionLaunchId,
	backgroundWorkerBirthHash,
} from "../../../terminal-agents/background-adoption";
import type { ClaudeBackgroundAttachProof } from "../../../terminal-agents/claude-background-session";
import type { HostServiceContext } from "../../../types";
import { backgroundSuccessorRefreshAdapter } from "./background-successor-adapter";
import { createBackgroundSuccessorRefresh } from "./background-successor-refresh";
import { createNotificationsRouter } from "./notifications";

const databases: Database[] = [];
const folders: string[] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) db.close();
	for (const folder of folders.splice(0))
		await rm(folder, { recursive: true, force: true });
});
async function fixture() {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "superset-successor-router-")),
	);
	folders.push(root);
	const cwd = join(root, "project");
	const profile = join(root, "profile");
	await Promise.all([mkdir(cwd), mkdir(profile)]);
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	db.insert(workspaces)
		.values({ id: "workspace", worktreePath: cwd, branch: "main" })
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
	const account = {
		pinned: true as const,
		agent: "claude" as const,
		selection: profile,
		directory: profile,
		identity: "a".repeat(64),
		credentialKind: "subscription" as const,
	};
	const sessionId = "11111111-2222-4333-8444-555555555555";
	const source = {
		terminalId: "old",
		workspaceId: "workspace",
		launchId: "original-launch",
		sessionId,
		account,
		definitionId: "custom:fixture",
		startedAt: 100,
	};
	const grant = backgroundAdoptionLaunchId({
		source,
		terminalId: "new",
		cwd,
		adoptedAt: 200,
		worker: { pid: 123, birthHash: backgroundWorkerBirthHash("exact-birth") },
	});
	for (const terminalId of ["old", "new"])
		db.insert(terminalSessions)
			.values({
				id: terminalId,
				originWorkspaceId: "workspace",
				status: terminalId === "new" ? "active" : "exited",
				createdAt: 1,
			})
			.run();
	db.insert(terminalAgentBindings)
		.values([
			{
				terminalId: "old",
				workspaceId: "workspace",
				agentId: "claude",
				definitionId: "custom:fixture",
				agentSessionId: sessionId,
				launchId: source.launchId,
				accountJson: JSON.stringify(account),
				startedAt: 100,
				lastEventAt: 150,
				lastEventType: "Stop",
				endedAt: 200,
				endReason: "resumed",
				resumedIntoTerminalId: "new",
			},
			{
				terminalId: "new",
				workspaceId: "workspace",
				agentId: "claude",
				definitionId: "custom:fixture",
				agentSessionId: sessionId,
				launchId: grant,
				accountJson: JSON.stringify(account),
				startedAt: 200,
				lastEventAt: 200,
				lastEventType: "Attached",
			},
		])
		.run();
	const events: unknown[] = [];
	const ctx = {
		db,
		organizationId: "fixture-org",
		isAuthenticated: true,
		terminalAgentStore: new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		),
		eventBus: {
			broadcastAgentLifecycle: (event: unknown) => {
				events.push(event);
			},
			broadcastAgentBindingsChanged: () => {},
			broadcastWorkspaceChanged: () => {},
		},
		api: { task: { start: { mutate: async () => {} } } },
	} as unknown as HostServiceContext;
	const io = backgroundSuccessorRefreshAdapter(ctx);
	let observations = 0;
	const worker = {
		pid: 123,
		birth: "exact-birth",
		executable: "/native/claude",
		configDir: profile,
		worktreePath: cwd,
		sessionId,
		backgroundId: "aabbccdd",
	};
	const proof: ClaudeBackgroundAttachProof = {
		candidate: {
			id: "aabbccdd",
			sessionId,
			name: "Exact worker",
			cwd,
			state: "done",
			status: "idle",
			startedAt: 1,
			pid: 123,
		},
		observedAt: 300,
		target: { sessionId, configDir: profile, worktreePath: cwd },
		workerBefore: worker,
		workerAfter: worker,
		attachArgs: ["attach", "aabbccdd"],
		nonAtomicAttach: true,
	};
	io.observe = async () => {
		observations++;
		return proof;
	};
	io.wait = async () => {};
	const refresh = createBackgroundSuccessorRefresh(io);
	let captures = 0;
	const router = createNotificationsRouter(
		async () => {
			captures++;
			return undefined;
		},
		async (_ctx, input) => refresh.enqueue(input),
	);
	const caller = router.createCaller(ctx);
	const hook = {
		terminalId: "old",
		launchId: source.launchId,
		attributionToken: issueAttributionToken("old"),
		agent: { agentId: "claude", sessionId },
		eventType: "Start",
		preview: "STALE_PREVIEW_MUST_NOT_FORWARD",
	};
	const row = (terminalId: string) =>
		db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, terminalId))
			.get();
	return {
		db,
		ctx,
		io,
		refresh,
		caller,
		hook,
		proof,
		row,
		events,
		count: () => ({ observations, captures }),
	};
}
test("real hook router treats late and out-of-order predecessor events only as current-state refresh triggers", async () => {
	const f = await fixture();
	const results = await Promise.all([
		f.caller.hook(f.hook),
		f.caller.hook({ ...f.hook, eventType: "Stop" }),
		f.caller.hook({
			...f.hook,
			eventType: "Attached",
			accountProfile: "/wrong",
		}),
	]);
	expect(results.every((result) => !result.ignored)).toBe(true);
	await f.refresh.drain();
	expect(f.row("old")).toMatchObject({
		endReason: "resumed",
		lastEventAt: 150,
		agentSessionId: f.hook.agent.sessionId,
	});
	expect(f.row("new")).toMatchObject({
		lastEventType: "Stop",
		lastEventAt: 300,
	});
	expect(f.count().captures).toBe(0);
	expect(f.count().observations).toBeLessThanOrEqual(2);
	expect(f.events).toEqual([
		{
			workspaceId: "workspace",
			eventType: "Stop",
			terminalId: "new",
			agent: { agentId: "claude", sessionId: f.hook.agent.sessionId },
			occurredAt: 300,
		},
	]);
});
test("unknown launch, wrong native session and forged original token cannot forward", async () => {
	for (const change of [
		{ attributionToken: "0".repeat(64) },
		{ launchId: "foreign-launch" },
		{ agent: { agentId: "claude", sessionId: "foreign-session" } },
	]) {
		const f = await fixture();
		expect((await f.caller.hook({ ...f.hook, ...change })).ignored).toBe(true);
		await f.refresh.drain();
		expect(f.count().observations).toBe(0);
		expect(f.events).toEqual([]);
		expect(f.row("new")?.lastEventAt).toBe(200);
	}
});
test("source or destination account rotation invalidates adoption lineage", async () => {
	for (const terminalId of ["old", "new"]) {
		const f = await fixture();
		f.db
			.update(terminalAgentBindings)
			.set({
				accountJson: JSON.stringify({
					...f.ctx.terminalAgentStore.getProvenance(terminalId)?.account,
					identity: "b".repeat(64),
				}),
			})
			.where(eq(terminalAgentBindings.terminalId, terminalId))
			.run();
		await f.caller.hook(f.hook);
		await f.refresh.drain();
		expect(f.count().observations).toBe(0);
		expect(f.events).toEqual([]);
	}
});
test("destination disposal while native observation is pending cannot resurrect it", async () => {
	const f = await fixture();
	f.io.observe = async () => {
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 250, endReason: "disposed" })
			.where(eq(terminalAgentBindings.terminalId, "new"))
			.run();
		return f.proof;
	};
	await f.caller.hook(f.hook);
	await f.refresh.drain();
	expect(f.row("new")).toMatchObject({
		endReason: "disposed",
		lastEventAt: 200,
	});
	expect(f.events).toEqual([]);
});
