import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CLOUD_AGENT_IDS } from "@superset/shared/cloud-agent-launch";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { ensurePresetRow } from "../../../../trpc/router/settings/agent-configs";
import { seedSandboxAgents } from "./seedSandboxAgents";

describe("seedSandboxAgents", () => {
	let sqlite: Database;
	let db: HostDb;
	let agentDir: string;

	beforeEach(() => {
		sqlite = new Database(":memory:");
		const testDb = drizzle(sqlite, { schema });
		migrate(testDb, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		db = testDb as unknown as HostDb;
		agentDir = mkdtempSync(join(tmpdir(), "sandbox-agents-"));
	});

	afterEach(() => {
		sqlite.close();
		rmSync(agentDir, { recursive: true, force: true });
	});

	test("registers every installed agent and trusts pdev without an initial launch", () => {
		seedSandboxAgents(db, "/workspace", agentDir);

		const rows = db.select().from(schema.hostAgentConfigs).all();
		for (const agent of CLOUD_AGENT_IDS) {
			expect(rows.filter((row) => row.presetId === agent)).toHaveLength(1);
		}
		expect(
			JSON.parse(readFileSync(join(agentDir, "trust.json"), "utf8")),
		).toEqual({
			"/workspace": true,
		});
	});

	test("keeps agents registered when pdev folder trust cannot be written", () => {
		const invalidDir = join(agentDir, "not-a-directory");
		writeFileSync(invalidDir, "file");

		expect(() => seedSandboxAgents(db, "/workspace", invalidDir)).not.toThrow();
		const rows = db.select().from(schema.hostAgentConfigs).all();
		for (const agent of CLOUD_AGENT_IDS) {
			expect(rows.some((row) => row.presetId === agent)).toBe(true);
		}
	});

	test("backfills pdev on an existing Claude workspace without replacing agent settings", () => {
		ensurePresetRow(db, "claude");
		db.update(schema.hostAgentConfigs)
			.set({ label: "My Claude" })
			.where(eq(schema.hostAgentConfigs.presetId, "claude"))
			.run();
		const existing = db.select().from(schema.hostAgentConfigs).all();

		seedSandboxAgents(db, "/workspace", agentDir);
		seedSandboxAgents(db, "/workspace", agentDir);

		const rows = db.select().from(schema.hostAgentConfigs).all();
		expect(rows.filter((row) => row.presetId === "pdev")).toHaveLength(1);
		expect(rows).toHaveLength(existing.length + 1);
		for (const row of existing) expect(rows).toContainEqual(row);
	});
});
