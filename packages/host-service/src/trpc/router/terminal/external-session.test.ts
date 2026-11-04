import { Database } from "bun:sqlite";
import { expect, it, spyOn } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import * as terminalRuntime from "../../../terminal/terminal";
import { TerminalAgentStore } from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";
import { terminalRouter } from "./terminal";

function context() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	db.insert(schema.workspaces)
		.values({ id: "ws", worktreePath: "/tmp/test-external", branch: "main" })
		.run();
	return {
		db: db as unknown as HostDb,
		isAuthenticated: true,
	} as HostServiceContext;
}

it("requires authentication before creating or ending external observations", async () => {
	const caller = terminalRouter.createCaller({
		isAuthenticated: false,
	} as HostServiceContext);
	await expect(
		caller.createExternalSession({
			terminalId: "view",
			workspaceId: "ws",
			initialCommand: "observer",
		}),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	await expect(
		caller.endExternalSession({ terminalId: "view", workspaceId: "ws" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("rejects unknown config ids without manufacturing configurations or terminals", async () => {
	const ctx = context();
	await expect(
		terminalRouter.createCaller(ctx).createExternalSession({
			terminalId: "view",
			workspaceId: "ws",
			initialCommand: "observer",
			agentConfigId: "unknown",
		}),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(ctx.db.select().from(schema.hostAgentConfigs).all()).toEqual([]);
	expect(ctx.db.select().from(schema.terminalSessions).all()).toEqual([]);
});

it("cannot convert a normal terminal into an external observation", async () => {
	const ctx = context();
	ctx.db
		.insert(schema.terminalSessions)
		.values({ id: "ceo", originWorkspaceId: "ws" })
		.run();
	await expect(
		terminalRouter.createCaller(ctx).createExternalSession({
			terminalId: "ceo",
			workspaceId: "ws",
			initialCommand: "observer",
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(
		ctx.db.select().from(schema.terminalSessions).get()?.agentLifecycleOwner,
	).toBe("paradev");
});

it("reports failed observation cleanup and permits an idempotent retry", async () => {
	const ctx = context();
	ctx.terminalAgentStore = new TerminalAgentStore();
	ctx.db
		.insert(schema.terminalSessions)
		.values({
			id: "view",
			originWorkspaceId: "ws",
			agentLifecycleOwner: "external",
		})
		.run();
	const dispose = spyOn(terminalRuntime, "disposeSessionAndWait")
		.mockResolvedValueOnce({
			terminalId: "view",
			daemonCloseAttempted: true,
			daemonCloseSucceeded: false,
		})
		.mockResolvedValueOnce({
			terminalId: "view",
			daemonCloseAttempted: true,
			daemonCloseSucceeded: true,
		});
	try {
		const caller = terminalRouter.createCaller(ctx);
		await expect(
			caller.endExternalSession({ workspaceId: "ws", terminalId: "view" }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(
			ctx.db.select().from(schema.terminalSessions).get()?.externalEndedAt,
		).toBeNumber();
		await expect(
			caller.endExternalSession({ workspaceId: "ws", terminalId: "view" }),
		).resolves.toMatchObject({ ended: true });
		expect(dispose).toHaveBeenCalledTimes(2);
	} finally {
		dispose.mockRestore();
	}
});

it("reports external ownership before a native binding exists and after observation disposal", async () => {
	const ctx = context();
	ctx.db
		.insert(schema.terminalSessions)
		.values({
			id: "view",
			originWorkspaceId: "ws",
			agentLifecycleOwner: "external",
			status: "disposed",
		})
		.run();
	const caller = terminalRouter.createCaller(ctx);
	await expect(
		caller.getLifecycleOwner({ workspaceId: "ws", terminalId: "view" }),
	).resolves.toEqual({ agentLifecycleOwner: "external" });
	await expect(
		caller.getLifecycleOwner({ workspaceId: "ws", terminalId: "new-shell" }),
	).resolves.toEqual({ agentLifecycleOwner: "paradev" });
	await expect(
		caller.getLifecycleOwner({ workspaceId: "other", terminalId: "view" }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});
